import { prisma } from "@/lib/db";
import { POR_PAGINA_GRANDE, POR_PAGINA_PADRAO } from "@/lib/porPagina";

import { filtrarResposta, linkDoMercadoLivre } from "./filtro";

/**
 * O banco do Atendimento do ML (spec 2026-11-24-atendimento-ml-design.md): listar, ler, contar, salvar o rascunho, ignorar
 * e reabrir. A tela, o Telegram e o MCP chamam ESTAS funcoes; nenhum deles grava por conta propria. O envio ao ML e de
 * `enviar.js`.
 */

export const LIMITE_PADRAO_DA_PERGUNTA = 2000;
const LIMITE_MINIMO = 100;
const LIMITE_MAXIMO = 2000;

const ORDENAVEIS = new Set(["recebidaEm", "status", "itemId", "textoDoCliente", "respondidaEm"]);

/** O limite de caracteres da resposta de pergunta (Rise AI › Configuracoes; 2000 quando nao configurado). */
export async function limiteDaPergunta() {
  const linha = await prisma.configuracaoIA.findFirst({ select: { dados: true } }).catch(() => null);
  const valor = Number(linha?.dados?.atendimentoML?.limiteDaPergunta);
  return Number.isInteger(valor) && valor >= LIMITE_MINIMO && valor <= LIMITE_MAXIMO ? valor : LIMITE_PADRAO_DA_PERGUNTA;
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
  const anuncios = await prisma.anuncio.findMany({ where: { id: { in: ids } }, select: { id: true, titulo: true, idExterno: true, dados: true, urlExterna: true, produto: { select: { id: true, sku: true, nome: true } } } });
  return new Map(
    anuncios.map((a) => [a.id, { titulo: a.titulo || a.produto?.nome || "", itemId: a.idExterno, url: a.urlExterna, sku: a.produto?.sku ?? null, produtoId: a.produto?.id ?? null, unidadesDoKit: unidadesDoKitDoAnuncio(a.dados) }]),
  );
}

function ondeDaLista({ tipo, status, filtros, soPrefixo }) {
  const e = [];
  const texto = String(filtros?.texto ?? "").trim();
  const item = String(filtros?.item ?? "").trim();
  if (texto) e.push({ textoDoCliente: { contains: texto, mode: "insensitive" } });
  if (item) e.push({ itemId: { contains: item.toUpperCase().replace("-", "") } });
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
  const anuncios = await anunciosDasLinhas(linhas);
  return { linhas: linhas.map((l) => ({ ...l, anuncio: anuncios.get(l.anuncioId) ?? null })), total, pagina: atual, porPagina: tamanho };
}

/** Uma linha com o anuncio, ou `null`. */
export async function lerAtendimento(id) {
  const linha = await prisma.atendimentoML.findUnique({ where: { id: String(id ?? "") } });
  if (!linha) return null;
  return { ...linha, anuncio: (await anunciosDasLinhas([linha])).get(linha.anuncioId) ?? null };
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
  const linha = await prisma.atendimentoML.findUnique({ where: { id: String(id ?? "") }, select: { id: true, status: true, rascunho: true, rascunhoOrigem: true } });
  if (!linha || linha.status !== "ABERTA") return { ok: false, motivo: "nao-aberta", barrados: [] };
  const conteudo = String(texto ?? "").trim();
  const filtro = filtrarResposta({ texto: conteudo, origem: origem === "IA" ? "IA" : "DONO", linksDaTroca, limite: await limiteDaPergunta() });
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
export async function ignorarAtendimento({ id, por }) {
  const mudou = await prisma.atendimentoML.updateMany({ where: { id: String(id ?? ""), status: "ABERTA", enviandoDesde: null }, data: { status: "IGNORADA", respondidaPor: por ?? null } });
  return { ok: mudou.count === 1 };
}

/** IGNORADA -> ABERTA. Respondida e fechada fora nao reabrem. */
export async function reabrirAtendimento({ id, por }) {
  void por;
  const mudou = await prisma.atendimentoML.updateMany({ where: { id: String(id ?? ""), status: "IGNORADA" }, data: { status: "ABERTA", respondidaPor: null } });
  return { ok: mudou.count === 1 };
}
