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

/** O ML barrou o anuncio e o dono precisa agir (o "!" do icone). */
export function precisaAgirNoML(estado) {
  if (!estado?.status) return false;
  if (estado.status === "closed") return false;
  return STATUS_QUE_PEDEM_ACAO.has(estado.status) || (estado.subStatus ?? []).some((motivo) => MOTIVOS_QUE_PEDEM_ACAO.has(motivo));
}
