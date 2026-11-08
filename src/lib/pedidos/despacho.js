/**
 * Prazo de despacho do pedido (pedido do dono em 08/11/2026: "mostrar se e para enviar no mesmo dia ou fica para dia
 * seguinte e um filtro com envios de hoje"). A conta entrega na agencia (xd_drop_off).
 *
 * O prazo vem do ML, por venda: `GET /shipments/{id}/sla` -> `expected_date` (dia E hora-limite de deixar na agencia; e o
 * que conta na reputacao, `status` on_time/delayed). Medido em 08/11/2026 nas vendas de set-nov: sempre 16:30. A agenda
 * da conta (`/users/{id}/shipping/schedule/xd_drop_off`) NAO serve de base: duas leituras no mesmo dia deram segunda com e
 * sem envio, e a sexta com 11:00 contra 16:30 no historico. Sem `sla` (envio ainda em "manufacturing", do tempo do prazo
 * de fabricacao), usa o dia em que o ML libera a etiqueta (`shipping_option.buffering.date`) as 16:30, marcado estimado.
 * Puro: sem banco e sem rede.
 */

const FUSO = "America/Sao_Paulo";
// O Brasil nao tem horario de verao: Sao Paulo e -03:00 o ano todo.
const DESLOCAMENTO = "-03:00";
const HORA_PADRAO_DA_AGENCIA = "16:30";

const diaEmSaoPaulo = (data) => new Date(data).toLocaleDateString("en-CA", { timeZone: FUSO });
const horaEmSaoPaulo = (data) => new Date(data).toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
const diaCurto = (data) => {
  const semana = new Date(data).toLocaleDateString("pt-BR", { timeZone: FUSO, weekday: "short" }).replace(".", "");
  const dia = new Date(data).toLocaleDateString("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" });
  return `${semana} ${dia}`;
};
const somarDias = (diaIso, dias) => {
  const d = new Date(`${diaIso}T12:00:00${DESLOCAMENTO}`);
  d.setUTCDate(d.getUTCDate() + dias);
  return diaEmSaoPaulo(d);
};

/** O ultimo instante do dia de hoje em Sao Paulo (o teto do filtro "Enviar hoje"). */
export function fimDoDiaEmSaoPaulo(agora = new Date()) {
  return new Date(`${diaEmSaoPaulo(agora)}T23:59:59.999${DESLOCAMENTO}`);
}

/**
 * O prazo de despacho de um pedido do ML a partir do `sla` e do envio lidos.
 * @returns {{ despacharAte: string|null, despachoEstimado: boolean|null }}
 */
export function prazoDeDespachoML({ sla = null, shipment = null } = {}) {
  const doSla = sla?.expected_date ? new Date(sla.expected_date) : null;
  if (doSla && !Number.isNaN(doSla.getTime())) return { despacharAte: doSla.toISOString(), despachoEstimado: false };
  // O buffering vem como data UTC a meia-noite ("2026-11-12T00:00:00.000Z"): vale o DIA escrito, nao o instante.
  const dia = String(shipment?.shipping_option?.buffering?.date ?? "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(dia)) return { despacharAte: new Date(`${dia}T${HORA_PADRAO_DA_AGENCIA}:00${DESLOCAMENTO}`).toISOString(), despachoEstimado: true };
  return { despacharAte: null, despachoEstimado: null };
}

/**
 * O que a linha do pedido mostra: so para o que esta A POSTAR e tem prazo.
 * @returns {{ chave: "atrasado"|"hoje"|"amanha"|"depois", texto: string }|null}
 */
export function situacaoDoDespacho({ statusDoEnvio, despacharAte }, agora = new Date()) {
  if (statusDoEnvio !== "A_POSTAR" || !despacharAte) return null;
  const limite = new Date(despacharAte);
  if (Number.isNaN(limite.getTime())) return null;
  const hora = horaEmSaoPaulo(limite);
  const hoje = diaEmSaoPaulo(agora);
  const dia = diaEmSaoPaulo(limite);
  if (limite.getTime() < new Date(agora).getTime()) return { chave: "atrasado", texto: `Atrasado: era ${dia === hoje ? "hoje" : diaCurto(limite)} até ${hora}` };
  if (dia === hoje) return { chave: "hoje", texto: `Enviar hoje até ${hora}` };
  if (dia === somarDias(hoje, 1)) return { chave: "amanha", texto: `Enviar amanhã até ${hora}` };
  return { chave: "depois", texto: `Enviar ${diaCurto(limite)} até ${hora}` };
}
