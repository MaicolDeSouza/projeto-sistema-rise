/**
 * O estado do anuncio NO MERCADO LIVRE (pedido do dono em 24/10/2026, opcao 1, so os anuncios que o Rise publicou): o
 * `status` e o `sub_status` que o ML devolve, em portugues, e quando o dono precisa agir. Sem imports: a lista de
 * Produtos (o icone), a lista de anuncios, o editor e o teste leem daqui. Quem le o ML e grava e `relerEstadoML.js`.
 *
 * `desde` e quando o anuncio ficou assim (so se grava quando muda: a lista de anuncios ordena pelo `atualizadoEm`).
 * Gravado em `dados.publicacao.estadoML = { status, subStatus, estoque, vendidos, desde }` (sem migration: o enum
 * `SituacaoCanal` so tem ATIVA, PAUSADA, ENCERRADA e DESCONHECIDA, e "em revisao" ou "inativo" viram DESCONHECIDA la).
 */

const SITUACOES = { active: "ATIVA", paused: "PAUSADA", closed: "ENCERRADA" };

// O motivo que mais importa primeiro: um anuncio pode vir com varios.
const MOTIVOS = [
  ["waiting_for_patch", "precisa corrigir"],
  ["forbidden", "proibido pelo ML"],
  ["suspended", "suspenso pelo ML"],
  ["held", "retido pelo ML"],
  ["freezed", "congelado pelo ML"],
  ["out_of_stock", "sem estoque"],
  ["picture_download_pending", "baixando as fotos"],
  ["warning", "com alerta do ML"],
];

const ESTADOS = { active: "Ativo", paused: "Pausado", under_review: "Em revisão", inactive: "Inativo", closed: "Encerrado", payment_required: "Aguardando pagamento ao ML" };

// Precisa da mao do dono: o ML barrou o anuncio. Sem estoque nao (o Bling repoe e o ML reativa), e encerrado e o fim.
const STATUS_QUE_PEDEM_ACAO = new Set(["under_review", "inactive", "payment_required"]);
const MOTIVOS_QUE_PEDEM_ACAO = new Set(["waiting_for_patch", "forbidden", "suspended", "held", "freezed"]);

/** O `status` do ML no enum `SituacaoCanal` do Rise (o mesmo de `situacaoDoItem`). */
export function situacaoDoEstado(status) {
  return SITUACOES[status] ?? "DESCONHECIDA";
}

/** O item do ML (o `body` do lote) no formato gravado, sem a data. */
export function estadoDoItem(item) {
  return {
    status: typeof item?.status === "string" ? item.status : null,
    subStatus: Array.isArray(item?.sub_status) ? item.sub_status.map(String) : [],
    estoque: Number.isFinite(Number(item?.available_quantity)) ? Number(item.available_quantity) : null,
    vendidos: Number.isFinite(Number(item?.sold_quantity)) ? Number(item.sold_quantity) : null,
  };
}

/** Mudou o que importa (estado, motivo, estoque, vendidos)? A data da leitura nao conta. */
export function estadoMudou(anterior, novo) {
  if (!anterior) return true;
  return (
    anterior.status !== novo.status ||
    anterior.estoque !== novo.estoque ||
    anterior.vendidos !== novo.vendidos ||
    JSON.stringify([...(anterior.subStatus ?? [])].sort()) !== JSON.stringify([...(novo.subStatus ?? [])].sort())
  );
}

/** "Ativo no ML", "Pausado: sem estoque", "Em revisão: precisa corrigir", "No ML: <status que o Rise nao conhece>". */
export function textoDoEstadoML(estado) {
  if (!estado?.status) return null;
  const nome = ESTADOS[estado.status];
  if (!nome) return `No ML: ${estado.status}`;
  const motivo = MOTIVOS.find(([codigo]) => (estado.subStatus ?? []).includes(codigo))?.[1];
  if (motivo && estado.status !== "active") return `${nome}: ${motivo}`;
  if (motivo === "com alerta do ML") return "Ativo no ML, com alerta";
  return `${nome} no ML`;
}

/**
 * Quantas leituras SEGUIDAS o estoque do canal ficou diferente do saldo do Bling (25/10/2026). O Bling leva minutos para
 * repassar uma venda ou um ajuste: uma leitura no meio nao pode acender o "!", que vem com 2 (`LEITURAS_PARA_DIVERGIR`).
 * Sem um dos dois numeros (Bling nao lido, canal sem controle de estoque) nao ha comparacao: zera.
 */
export const LEITURAS_PARA_DIVERGIR = 2;
export function seguidasComDiferenca(anteriores, doCanal, doBling) {
  if (typeof doCanal !== "number" || typeof doBling !== "number") return 0;
  return doCanal === doBling ? 0 : (Number(anteriores) || 0) + 1;
}

/**
 * O catalogo em que o anuncio esta no ML (pedido do dono em 25/10/2026, opcao 1), ou null fora de catalogo. Dois jeitos,
 * os dois do ML: o proprio item com `catalog_product_id` (medido no MLB5458577821: null depois de sair do catalogo), ou um
 * anuncio de catalogo SEPARADO ligado a ele em `item_relations` (`catalog_listing: true`), que conta enquanto ativo ou
 * pausado. `relacionados` sao os itens ligados ja lidos (o `body` do lote).
 */
export function catalogoDoItem(item, relacionados = []) {
  if (typeof item?.catalog_product_id === "string" && item.catalog_product_id) return item.catalog_product_id;
  const ligados = new Set((Array.isArray(item?.item_relations) ? item.item_relations : []).map((relacao) => String(relacao?.id)));
  const deCatalogo = (relacionados ?? []).find((outro) => ligados.has(String(outro?.id)) && outro?.catalog_listing === true && outro?.catalog_product_id && outro?.status !== "closed");
  return deCatalogo?.catalog_product_id ?? null;
}

const nomeDoCatalogo = (catalogo) => catalogo?.nome || catalogo?.id;
const DIA_E_MES = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

/** `estadoML.catalogo` ({id, nome} ou null; ausente = ainda nao lido) em texto: "No catálogo: Wemos", "Fora do catálogo". */
export function textoDoCatalogo(catalogo) {
  if (catalogo === undefined) return null;
  return catalogo ? `No catálogo: ${nomeDoCatalogo(catalogo)}` : "Fora do catálogo";
}

/** O aviso de mudanca (`estadoML.catalogoAviso = { de, para, em, visto }`): "saiu do catálogo Wemos em 25/10". */
export function textoDoAvisoDeCatalogo(aviso) {
  if (!aviso) return null;
  // Ja estava no catalogo quando o Rise o leu pela primeira vez: nao se sabe quando entrou, so onde esta.
  if (aviso.inicial && aviso.para) return `está no catálogo ${nomeDoCatalogo(aviso.para)}`;
  const dia = aviso.em ? ` em ${DIA_E_MES.format(new Date(aviso.em))}` : "";
  if (aviso.de && !aviso.para) return `saiu do catálogo ${nomeDoCatalogo(aviso.de)}${dia}`;
  if (!aviso.de && aviso.para) return `entrou no catálogo ${nomeDoCatalogo(aviso.para)}${dia}`;
  return `trocou do catálogo ${nomeDoCatalogo(aviso.de)} para ${nomeDoCatalogo(aviso.para)}${dia}`;
}

/** O "!" do catalogo: houve mudanca e o dono ainda nao abriu o anuncio. */
export function avisoDeCatalogoPendente(estado) {
  return Boolean(estado?.catalogoAviso && !estado.catalogoAviso.visto);
}

/** O ML barrou o anuncio e o dono precisa agir (o "!" do icone). */
export function precisaAgirNoML(estado) {
  if (!estado?.status) return false;
  if (estado.status === "closed") return false;
  return STATUS_QUE_PEDEM_ACAO.has(estado.status) || (estado.subStatus ?? []).some((motivo) => MOTIVOS_QUE_PEDEM_ACAO.has(motivo));
}
