import { prisma } from "@/lib/db";

import { gravarPublicacao } from "./banco";
import { clienteML } from "./cliente";
import { estadoDoItem, estadoMudou, seguidasComDiferenca, situacaoDoEstado } from "./estadoNoML";

/**
 * Releitura do estado dos anuncios no ML (pedido do dono em 24/10/2026, opcao 1): o worker, de hora em hora, le o
 * `status` e o `sub_status` de TODOS os anuncios que o Rise publicou (os 1.007 antigos da conta ficam de fora, decisao do
 * dono), 20 por chamada (`/items/bulk`: o `/items?ids=` sai em 25/10/2026; medido no 100107 no mesmo dia). So GET.
 *
 * Grava `dados.publicacao.estadoML` e a `situacaoCanal` SO quando algo mudou: a lista de anuncios ordena pelo
 * `atualizadoEm`, e reescrever todo hora a embaralharia. Encerrado no Rise nao e relido (e o fim). 401 ou 429 param a
 * rodada (a proxima hora tenta de novo); item que nao responde conta como falha e fica como estava. Nunca lanca.
 */

const POR_LOTE = 20;
const ESPERA_ENTRE_LOTES_MS = 300;
const PARA_A_RODADA = new Set([401, 429]);
const CAMPOS = "body.id,body.status,body.sub_status,body.available_quantity,body.sold_quantity";

const esperar = (ms) => (ms > 0 ? new Promise((resolver) => setTimeout(resolver, ms)) : Promise.resolve());

/**
 * @param {{ ml?, agora?: Date, anuncioIds?: string[], espera?: number }} [opcoes] `anuncioIds` limita a rodada (o teste).
 * @returns {Promise<{ conferidos: number, mudaram: number, falhas: number, parou?: string }>}
 */
export async function relerEstadosML({ ml, agora = new Date(), anuncioIds, espera = ESPERA_ENTRE_LOTES_MS } = {}) {
  const resultado = { conferidos: 0, mudaram: 0, falhas: 0 };
  let anuncios;
  try {
    anuncios = await prisma.anuncio.findMany({
      where: {
        canal: "MERCADO_LIVRE",
        status: "PUBLICADO",
        idExterno: { not: null },
        situacaoCanal: { not: "ENCERRADA" },
        ...(Array.isArray(anuncioIds) ? { id: { in: anuncioIds } } : {}),
      },
      select: { id: true, idExterno: true, situacaoCanal: true, dados: true, produto: { select: { blingSaldo: true } } },
      orderBy: { id: "asc" },
    });
  } catch (erro) {
    console.error("[ml estado] leitura:", erro?.message ?? erro);
    return { ...resultado, falhas: 1 };
  }
  if (anuncios.length === 0) return resultado;
  const cliente = ml ?? clienteML();

  for (let inicio = 0; inicio < anuncios.length; inicio += POR_LOTE) {
    if (inicio > 0) await esperar(espera);
    const lote = anuncios.slice(inicio, inicio + POR_LOTE);
    let resposta;
    try {
      resposta = await cliente.get("/items/bulk", { ids: lote.map((anuncio) => anuncio.idExterno).join(","), attributes: CAMPOS });
    } catch (erro) {
      if (PARA_A_RODADA.has(erro?.status)) return { ...resultado, parou: `HTTP ${erro.status}` };
      resultado.conferidos += lote.length;
      resultado.falhas += lote.length;
      continue;
    }
    if (!resposta?.ok) {
      if (PARA_A_RODADA.has(resposta?.status)) return { ...resultado, parou: `HTTP ${resposta.status}` };
      resultado.conferidos += lote.length;
      resultado.falhas += lote.length;
      continue;
    }
    // Com `attributes`, o ML devolve so o `body` de quem respondeu; quem nao respondeu vem com `status_code` e sem `body`.
    const porId = new Map((Array.isArray(resposta.dados) ? resposta.dados : []).filter((linha) => linha?.body?.id).map((linha) => [String(linha.body.id), linha.body]));
    for (const anuncio of lote) {
      resultado.conferidos += 1;
      const item = porId.get(anuncio.idExterno);
      if (!item) {
        resultado.falhas += 1;
        continue;
      }
      const novo = estadoDoItem(item);
      const anterior = anuncio.dados?.publicacao?.estadoML ?? null;
      const situacao = situacaoDoEstado(novo.status);
      // Estoque x Bling (25/10/2026): so o anuncio de um produto do Rise (o kit montado no editor nao tem produto com o
      // saldo do kit) e com o saldo do Bling lido. Conta as leituras SEGUIDAS com diferenca; o "!" vem com 2.
      const blingSaldo = anuncio.dados?.composicao ? null : anuncio.produto?.blingSaldo ?? null;
      const estoqueBling = typeof blingSaldo === "number" ? Math.max(0, blingSaldo) : null;
      const seguidas = seguidasComDiferenca(anterior?.estoqueDiferenteSeguidas, novo.estoque, estoqueBling);
      const mudou = estadoMudou(anterior, novo);
      if (!mudou && situacao === anuncio.situacaoCanal && seguidas === (anterior?.estoqueDiferenteSeguidas ?? 0) && estoqueBling === (anterior?.estoqueBling ?? null)) continue;
      try {
        const desde = mudou || !anterior?.desde ? agora.toISOString() : anterior.desde;
        await gravarPublicacao(anuncio.id, { estadoML: { ...novo, estoqueBling, estoqueDiferenteSeguidas: seguidas, desde }, statusML: novo.status }, { situacaoCanal: situacao });
        resultado.mudaram += 1;
      } catch (erro) {
        console.error("[ml estado] gravar:", erro?.message ?? erro);
        resultado.falhas += 1;
      }
    }
  }
  return resultado;
}
