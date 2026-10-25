import { prisma } from "@/lib/db";

import { seguidasComDiferenca } from "../ml/estadoNoML";
import { clienteLI } from "./cliente";
import { lerParaPopupLI } from "./leitura";

/**
 * O worker de olho na Loja Integrada (pedido do dono em 25/10/2026, opcao 1): de hora em hora, cada anuncio da LI ligado
 * a um produto Conferido do Rise e lido na loja pela MESMA leitura da aba Divergencias (`lerParaPopupLI`), e o resultado
 * vai para `dados.monitorLI`. O icone da LI acende o "!" quando a loja nao bate com o Rise (`alertaNaLoja.js`): campo
 * mudado no painel da loja, produto inativo ou na lixeira, e o estoque diferente do saldo do Bling em 2 leituras
 * seguidas (o Bling leva minutos para repassar uma venda). So GET na LI.
 *
 * Grava so quando muda (a contagem das leituras seguidas tambem conta). Falha de um produto guarda o erro e mantem o que
 * foi lido antes; o limite de chamadas da LI ou o token param a rodada (a proxima hora tenta de novo). Nunca lanca.
 */

const ESPERA_ENTRE_PRODUTOS_MS = 2000;
const PARA_A_RODADA = /chamadas por minuto|token/i;

const esperar = (ms) => (ms > 0 ? new Promise((resolver) => setTimeout(resolver, ms)) : Promise.resolve());

// O que conta para "mudou" (a data nao): sem isso cada hora reescreveria o anuncio e embaralharia a lista de anuncios.
const CHAVES = ["situacao", "ativo", "diferentes", "fiscais", "estoque", "estoqueBling", "estoqueDiferenteSeguidas", "erro"];
const mesmoMonitor = (a, b) => Boolean(a) && CHAVES.every((chave) => JSON.stringify(a[chave] ?? null) === JSON.stringify(b[chave] ?? null));

/**
 * A leitura da loja no formato gravado. Puro. `diferentes` sao os rotulos dos campos "diferente" da aba Divergencias
 * (o "so tem na loja" nao conta, como no editor) e "Fotos" quando a loja nao tem as do Rise.
 */
export function monitorDaLeitura(leitura, { blingSaldo = null, anterior = null, agora = new Date() } = {}) {
  const diferentes = (leitura?.diferencas ?? []).filter((item) => item.tipo === "diferente").map((item) => item.rotulo);
  if (["faltam", "diferentes"].includes(leitura?.fotos?.estado)) diferentes.push("Fotos");
  const estoque = leitura?.estoqueNaLI?.gerenciado ? leitura.estoqueNaLI.quantidade : null;
  const estoqueBling = typeof blingSaldo === "number" ? Math.max(0, blingSaldo) : null;
  const novo = {
    situacao: leitura?.situacao ?? null,
    ativo: typeof leitura?.ativoNaLI === "boolean" ? leitura.ativoNaLI : null,
    diferentes,
    // Origem e tipo de producao (opcao 1 do dono em 25/10/2026): so o painel da LI os grava; vazios ou diferentes na loja
    // acendem o "!", e a releitura o apaga depois de o dono corrigir la. Os mesmos avisos da aba Fiscal do editor.
    fiscais: (leitura?.fiscais ?? []).map((aviso) => ({ rotulo: aviso.rotulo, tipo: aviso.tipo })),
    estoque,
    estoqueBling,
    estoqueDiferenteSeguidas: seguidasComDiferenca(anterior?.estoqueDiferenteSeguidas, estoque, estoqueBling),
    erro: null,
    erroEm: null,
  };
  // "desde" = quando a loja ficou assim (a contagem das leituras seguidas nao muda a data).
  const semContagem = (monitor) => ({ ...monitor, estoqueDiferenteSeguidas: null, erro: null });
  return { ...novo, desde: anterior?.desde && mesmoMonitor(semContagem(anterior), semContagem(novo)) ? anterior.desde : agora.toISOString() };
}

/** Grava o monitor no anuncio (com a linha travada) e a situacao da loja; nada se o que conta nao mudou. */
async function gravarMonitor(anuncioId, monitor) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Anuncio" WHERE id = ${anuncioId} FOR UPDATE`;
    const anuncio = await tx.anuncio.findUnique({ where: { id: anuncioId }, select: { dados: true, situacaoCanal: true } });
    if (!anuncio) return false;
    const anterior = anuncio.dados?.monitorLI ?? null;
    const situacao = monitor.situacao === "existe" && typeof monitor.ativo === "boolean" ? (monitor.ativo ? "ATIVA" : "PAUSADA") : anuncio.situacaoCanal;
    if (mesmoMonitor(anterior, monitor) && situacao === anuncio.situacaoCanal) return false;
    await tx.anuncio.update({ where: { id: anuncioId }, data: { situacaoCanal: situacao, dados: { ...(anuncio.dados ?? {}), monitorLI: monitor } } });
    return true;
  });
}

/**
 * A leitura do editor tambem atualiza o monitor (abrir o anuncio, sincronizar): sem isso o "!" ficaria aceso ate a
 * proxima hora depois de o dono resolver. So produto vinculado e leitura que deu certo. Nunca lanca.
 * @returns {Promise<boolean>} se o monitor mudou (a lista de Produtos precisa ser revalidada).
 */
export async function guardarLeituraNoMonitorLI(produtoId, leitura) {
  try {
    if (!leitura?.anuncioId || (!leitura.ok && !["removido", "duplicado"].includes(leitura.situacao))) return false;
    const anuncio = await prisma.anuncio.findUnique({ where: { id: leitura.anuncioId }, select: { id: true, idExterno: true, dados: true, produto: { select: { blingSaldo: true } } } });
    if (!anuncio?.idExterno) return false;
    return await gravarMonitor(anuncio.id, monitorDaLeitura(leitura, { blingSaldo: anuncio.produto?.blingSaldo ?? null, anterior: anuncio.dados?.monitorLI ?? null }));
  } catch (erro) {
    console.error("[li monitor] leitura do editor:", erro?.message ?? erro);
    return false;
  }
}

/**
 * @param {{ cliente?, agora?: Date, anuncioIds?: string[], espera?: number }} [opcoes] `anuncioIds` limita a rodada (o teste).
 * @returns {Promise<{ conferidos: number, mudaram: number, falhas: number, parou?: string }>}
 */
export async function relerMonitorLI({ cliente, agora = new Date(), anuncioIds, espera = ESPERA_ENTRE_PRODUTOS_MS } = {}) {
  const resultado = { conferidos: 0, mudaram: 0, falhas: 0 };
  let anuncios;
  try {
    anuncios = await prisma.anuncio.findMany({
      where: {
        canal: "LOJA_INTEGRADA",
        status: "PUBLICADO",
        idExterno: { not: null },
        produto: { conferido: true },
        ...(Array.isArray(anuncioIds) ? { id: { in: anuncioIds } } : {}),
      },
      select: { id: true, produtoId: true, dados: true, produto: { select: { blingSaldo: true } } },
      orderBy: { id: "asc" },
    });
  } catch (erro) {
    console.error("[li monitor] leitura:", erro?.message ?? erro);
    return { ...resultado, falhas: 1 };
  }
  if (anuncios.length === 0) return resultado;
  const li = cliente ?? clienteLI();

  for (const [indice, anuncio] of anuncios.entries()) {
    if (indice > 0) await esperar(espera);
    resultado.conferidos += 1;
    const anterior = anuncio.dados?.monitorLI ?? null;
    try {
      const leitura = await lerParaPopupLI(anuncio.produtoId, li);
      // Lixeira e duplicado sao estados da loja (o icone avisa); outra falha e erro de leitura.
      if (!leitura.ok && !["removido", "duplicado"].includes(leitura.situacao)) {
        resultado.falhas += 1;
        if (anterior) await gravarMonitor(anuncio.id, { ...anterior, erro: leitura.erro ?? "Falha na leitura da loja.", erroEm: agora.toISOString() });
        if (PARA_A_RODADA.test(leitura.erro ?? "")) return { ...resultado, parou: leitura.erro };
        continue;
      }
      const monitor = monitorDaLeitura(leitura, { blingSaldo: anuncio.produto?.blingSaldo ?? null, anterior, agora });
      if (await gravarMonitor(anuncio.id, monitor)) resultado.mudaram += 1;
    } catch (erro) {
      resultado.falhas += 1;
      console.error("[li monitor] produto:", erro?.message ?? erro);
    }
  }
  return resultado;
}
