import { prisma } from "@/lib/db";
import { clienteML } from "@/lib/canaisDeVenda/ml/cliente";
import { POR_PAGINA_GRANDE, POR_PAGINA_PADRAO } from "@/lib/porPagina";

import { filtrarResposta, linkDoMercadoLivre } from "./filtro";
import { LIMITE_PADRAO_DE_MENSAGEM, marcarConversaComoLida } from "./posVenda";
import { LIMITE_DA_RECLAMACAO } from "./reclamacoes";

/**
 * O banco do Atendimento do ML (spec 2026-11-24-atendimento-ml-design.md): listar, ler, contar, salvar o rascunho, ignorar
 * e reabrir. A tela, o Telegram e o MCP chamam ESTAS funcoes; nenhum deles grava por conta propria. O envio ao ML e de
 * `enviar.js`.
 */

export const LIMITE_PADRAO_DA_PERGUNTA = 2000;
const LIMITE_MINIMO = 100;
const LIMITE_MAXIMO = 2000;

const ORDENAVEIS = new Set(["recebidaEm", "status", "itemId", "idExterno", "textoDoCliente", "respondidaEm"]);

/** O limite de caracteres da resposta de pergunta (Rise AI › Configuracoes; 2000 quando nao configurado). */
export async function limiteDaPergunta() {
  const linha = await prisma.configuracaoIA.findUnique({ where: { id: "unica" }, select: { dados: true } }).catch(() => null);
  const valor = Number(linha?.dados?.atendimentoML?.limiteDaPergunta);
  return Number.isInteger(valor) && valor >= LIMITE_MINIMO && valor <= LIMITE_MAXIMO ? valor : LIMITE_PADRAO_DA_PERGUNTA;
}

/**
 * O limite de caracteres da resposta de UMA linha: o da pergunta (configuravel) ou, na mensagem de pos-venda, o que o ML
 * informou na conversa (`limite`, 350 em 24/11/2026).
 */
export async function limiteDoAtendimento(linha) {
  if (linha?.tipo === "POS_VENDA") return Number.isInteger(linha.limite) && linha.limite > 0 ? linha.limite : LIMITE_PADRAO_DE_MENSAGEM;
  // Reclamacao (fase 3): o ML nao informa limite; vale o teto do Rise.
  if (linha?.tipo === "RECLAMACAO") return LIMITE_DA_RECLAMACAO;
  return limiteDaPergunta();
}

/** Quantas unidades o anuncio vende de uma vez: a soma da composicao do kit, ou 1 (a mesma conta de `contaDoEditor.js`). */
export function unidadesDoKitDoAnuncio(dados) {
  const composicao = dados?.composicao;
  if (!composicao) return 1;
  const itens = Array.isArray(composicao.itens) ? composicao.itens : [];
  return Math.max(1, itens.reduce((soma, item) => soma + (Number(item?.quantidade) || 0), 0));
}

/** Os enderecos dos anuncios ML do produto: so estes a IA pode indicar (conferidos de novo no envio). */
export async function linksDosAnunciosDoProduto(produtoId) {
  if (!produtoId) return [];
  const anuncios = await prisma.anuncio.findMany({ where: { produtoId, canal: "MERCADO_LIVRE", urlExterna: { not: null } }, select: { urlExterna: true } });
  return anuncios.map((a) => a.urlExterna).filter(linkDoMercadoLivre);
}

/** O anuncio de cada linha, para a lista: `{ titulo, itemId, sku, produtoId, unidadesDoKit } | null`. */
async function anunciosDasLinhas(linhas) {
  const ids = [...new Set(linhas.map((l) => l.anuncioId).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const anuncios = await prisma.anuncio.findMany({
    where: { id: { in: ids } },
    select: { id: true, titulo: true, idExterno: true, dados: true, urlExterna: true, produto: { select: { id: true, sku: true, tituloBase: true, arquivos: { where: { tipo: "IMAGEM" }, orderBy: { principal: "desc" }, take: 1, select: { arquivo: true } } } } },
  });
  return new Map(
    anuncios.map((a) => {
      const foto = a.produto?.arquivos?.[0]?.arquivo;
      return [
        a.id,
        {
          titulo: a.titulo || a.produto?.tituloBase || "",
          itemId: a.idExterno,
          url: a.urlExterna,
          sku: a.produto?.sku ?? null,
          produtoId: a.produto?.id ?? null,
          unidadesDoKit: unidadesDoKitDoAnuncio(a.dados),
          // O mesmo endereco das fotos do produto no Rise (atras do login).
          foto: foto && a.produto?.sku ? `/api/arquivos/${encodeURIComponent(a.produto.sku)}/imagens/${encodeURIComponent(foto)}` : null,
        },
      ];
    }),
  );
}

/** O pedido de cada linha de pos-venda, para a lista: `{ id, numero, idExterno, primeiroItem, itens } | null`. Sem dado do comprador. */
async function pedidosDasLinhas(linhas) {
  const ids = [...new Set(linhas.map((l) => l.pedidoId).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const pedidos = await prisma.pedidoDeVenda.findMany({ where: { id: { in: ids } }, select: { id: true, numero: true, idExterno: true, itens: { orderBy: { ordem: "asc" }, select: { titulo: true, quantidade: true } } } });
  return new Map(pedidos.map((p) => [p.id, { id: p.id, numero: p.numero, idExterno: p.idExterno, primeiroItem: p.itens[0]?.titulo ?? "", itens: p.itens.length }]));
}

/** Quantas perguntas ha em cada situacao (os numeros dos chips da tela). */
export async function contagemPorStatus(tipo = "PERGUNTA") {
  const grupos = await prisma.atendimentoML.groupBy({ by: ["status"], where: { tipo }, _count: { _all: true } });
  return Object.fromEntries(grupos.map((grupo) => [grupo.status, grupo._count._all]));
}

function ondeDaLista({ tipo, status, filtros, soPrefixo }) {
  const e = [];
  const texto = String(filtros?.texto ?? "").trim();
  const item = String(filtros?.item ?? "").trim();
  if (texto) e.push({ textoDoCliente: { contains: texto, mode: "insensitive" } });
  if (item) e.push({ itemId: { contains: item.toUpperCase().replace("-", "") } });
  // Pos-venda: a busca da tela tambem acha pelo numero do pack/pedido.
  if (texto && (tipo === "POS_VENDA" || tipo === "RECLAMACAO")) e.splice(0, 1, { OR: [{ textoDoCliente: { contains: texto, mode: "insensitive" } }, { idExterno: { contains: texto } }] });
  if (soPrefixo) e.push({ idExterno: { startsWith: soPrefixo } });
  return { tipo, ...(status ? { status } : {}), ...(e.length ? { AND: e } : {}) };
}

/**
 * A lista da tela e do MCP. `status` vazio = todas. `soPrefixo` e do teste (so as linhas ZZ-ATD-*).
 * @returns {Promise<{ linhas: object[], total: number, pagina: number, porPagina: number }>}
 */
export async function listarAtendimentos({ tipo = "PERGUNTA", status = null, pagina = 1, porPagina = POR_PAGINA_PADRAO, ordenar = "recebidaEm", direcao = "asc", filtros = {}, soPrefixo = null } = {}) {
  const tamanho = Math.max(1, Math.min(POR_PAGINA_GRANDE, Number(porPagina) || POR_PAGINA_PADRAO));
  const atual = Math.max(1, Number(pagina) || 1);
  const where = ondeDaLista({ tipo, status, filtros, soPrefixo });
  const campo = ORDENAVEIS.has(ordenar) ? ordenar : "recebidaEm";
  const [total, linhas] = await Promise.all([
    prisma.atendimentoML.count({ where }),
    prisma.atendimentoML.findMany({ where, orderBy: [{ [campo]: direcao === "desc" ? "desc" : "asc" }, { id: "asc" }], skip: (atual - 1) * tamanho, take: tamanho }),
  ]);
  const [anuncios, pedidos] = await Promise.all([anunciosDasLinhas(linhas), pedidosDasLinhas(linhas)]);
  return { linhas: linhas.map((l) => ({ ...l, anuncio: anuncios.get(l.anuncioId) ?? null, pedido: pedidos.get(l.pedidoId) ?? null })), total, pagina: atual, porPagina: tamanho };
}

/** Uma linha com o anuncio, ou `null`. */
export async function lerAtendimento(id) {
  const linha = await prisma.atendimentoML.findUnique({ where: { id: String(id ?? "") } });
  if (!linha) return null;
  return { ...linha, anuncio: (await anunciosDasLinhas([linha])).get(linha.anuncioId) ?? null, pedido: (await pedidosDasLinhas([linha])).get(linha.pedidoId) ?? null };
}

/** Quantas esperam resposta (o numero do menu). */
export function contarAbertas(tipo = null, { soPrefixo = null } = {}) {
  return prisma.atendimentoML.count({ where: { status: "ABERTA", ...(tipo ? { tipo } : {}), ...(soPrefixo ? { idExterno: { startsWith: soPrefixo } } : {}) } });
}

/**
 * Grava o rascunho. O texto barrado pelo filtro e gravado MESMO ASSIM (o dono corrige em cima dele); quem decide se sai e
 * o envio, que roda o filtro de novo. `origem`: "IA" (a sugestao) ou "DONO" (digitado na tela, no Telegram ou no MCP).
 *
 * @returns {Promise<{ ok: boolean, motivo?: "nao-aberta", barrados: object[], rascunhoEm?: Date }>}
 */
export async function salvarRascunho({ id, texto, origem, por, linksDaTroca = [], agora = new Date() }) {
  const linha = await prisma.atendimentoML.findUnique({ where: { id: String(id ?? "") }, select: { id: true, status: true, tipo: true, limite: true, rascunho: true, rascunhoOrigem: true } });
  if (!linha || linha.status !== "ABERTA") return { ok: false, motivo: "nao-aberta", barrados: [] };
  const conteudo = String(texto ?? "").trim();
  const filtro = filtrarResposta({ texto: conteudo, origem: origem === "IA" ? "IA" : "DONO", linksDaTroca, limite: await limiteDoAtendimento(linha) });
  let rascunhoOrigem = "IA";
  if (origem !== "IA") {
    const eraDaIA = linha.rascunhoOrigem === "IA" || linha.rascunhoOrigem === "IA_EDITADA";
    if (conteudo === linha.rascunho) rascunhoOrigem = linha.rascunhoOrigem ?? "MANUAL";
    else rascunhoOrigem = eraDaIA ? "IA_EDITADA" : "MANUAL";
  }
  const rascunhoEm = new Date(agora);
  const gravado = await prisma.atendimentoML.updateMany({ where: { id: linha.id, status: "ABERTA" }, data: { rascunho: conteudo, rascunhoOrigem, rascunhoEm, erroDoEnvio: null } });
  if (gravado.count === 0) return { ok: false, motivo: "nao-aberta", barrados: [] };
  void por;
  return { ok: filtro.ok, barrados: filtro.barrados, rascunhoEm };
}

/** ABERTA -> IGNORADA (a pergunta continua no ML; o Rise so para de mostrar entre as abertas). */
export async function ignorarAtendimento({ id, por, ml = null }) {
  const mudou = await prisma.atendimentoML.updateMany({ where: { id: String(id ?? ""), status: "ABERTA", enviandoDesde: null }, data: { status: "IGNORADA", respondidaPor: por ?? null } });
  if (mudou.count !== 1) return { ok: false };
  // Pos-venda: o Rise so marca a conversa como lida no ML quando o dono responde ou ignora. Falha aqui nao desfaz o ignorar.
  const linha = await prisma.atendimentoML.findUnique({ where: { id: String(id) }, select: { tipo: true, idExterno: true } });
  if (linha?.tipo === "POS_VENDA") await marcarConversaComoLida(ml ?? clienteML(), linha.idExterno);
  return { ok: true };
}

/** IGNORADA -> ABERTA. Respondida e fechada fora nao reabrem. */
export async function reabrirAtendimento({ id, por }) {
  void por;
  const mudou = await prisma.atendimentoML.updateMany({ where: { id: String(id ?? ""), status: "IGNORADA" }, data: { status: "ABERTA", respondidaPor: null } });
  return { ok: mudou.count === 1 };
}
