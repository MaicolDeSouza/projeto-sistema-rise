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
 * Loja Integrada: 24 horas depois do pagamento (regra do dono em 08/11/2026: "se for venda da LI o prazo e de 24hrs para
 * envio"). O pagamento e a 1a vez que o historico de situacoes mostra o pedido pago (ou ja adiante); sem historico, a
 * data da venda (marcado estimado). Pedido sem pacote (retirada, a combinar) e o que ainda nao foi pago nao tem prazo.
 * @returns {{ despacharAte: string|null, despachoEstimado: boolean|null }}
 */
const PAGO_NA_LI = new Set(["pedido_pago", "pedido_em_separacao", "pedido_pronto_retirada", "pedido_enviado", "pedido_entregue"]);
const SEM_PACOTE_NA_LI = new Set(["retirada", "combinar", "a_combinar", "sem_envio"]);
const UM_DIA_MS = 24 * 60 * 60 * 1000;

export function prazoDeDespachoLI({ historico = [], statusDaOrigem = null, dataDaVenda = null, tipoDeEnvio = null } = {}) {
  const nada = { despacharAte: null, despachoEstimado: null };
  const tipo = String(tipoDeEnvio ?? "").toLowerCase();
  if (!tipo || SEM_PACOTE_NA_LI.has(tipo)) return nada;
  const pagoNoHistorico = (historico ?? [])
    .filter((h) => PAGO_NA_LI.has(h?.statusDaOrigem) && h?.em)
    .map((h) => new Date(h.em))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => a - b)[0];
  const pagoEm = pagoNoHistorico ?? (PAGO_NA_LI.has(statusDaOrigem) && dataDaVenda ? new Date(dataDaVenda) : null);
  if (!pagoEm || Number.isNaN(pagoEm.getTime())) return nada;
  return { despacharAte: new Date(pagoEm.getTime() + UM_DIA_MS).toISOString(), despachoEstimado: !pagoNoHistorico };
}

/** O prazo so do dia (Bling): a hora 23:59 nao vai para a tela. */
const FIM_DO_DIA = "23:59";

/**
 * Bling (pedido digitado la): a data prevista do proprio pedido de venda (`dataPrevista`; regra do dono em 08/11/2026: "se
 * for venda do bling o prazo deve vir do pedido de venda"). O Bling guarda so o DIA: o prazo e o fim dele (23:59), e a
 * tela mostra so o dia ("Enviar hoje"). Sem data ("0000-00-00" ou vazio), sem prazo.
 */
export function prazoDeDespachoBling({ dataPrevista = null } = {}) {
  const dia = String(dataPrevista ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || dia.startsWith("0000")) return { despacharAte: null, despachoEstimado: null };
  const limite = new Date(`${dia}T${FIM_DO_DIA}:00${DESLOCAMENTO}`);
  return Number.isNaN(limite.getTime()) ? { despacharAte: null, despachoEstimado: null } : { despacharAte: limite.toISOString(), despachoEstimado: false };
}

/** Os status em que o pedido ainda esta nas maos do operador (pago, em separacao ou esperando peca). */
const AINDA_NAO_SAIU = new Set(["PAGO", "EM_SEPARACAO", "AGUARDANDO_PECAS"]);

/**
 * O que a linha do pedido mostra: so para o que ainda nao saiu (a postar, ou sem envio no Bling) e tem prazo. Com o
 * `status`, so o pedido pago (o nao pago tambem pode ter prazo gravado); sem ele (chamada antiga), so o A_POSTAR.
 * @returns {{ chave: "atrasado"|"hoje"|"amanha"|"depois", texto: string }|null}
 */
export function situacaoDoDespacho({ status = null, statusDoEnvio, despacharAte }, agora = new Date()) {
  if (!despacharAte) return null;
  if (status ? !AINDA_NAO_SAIU.has(status) || !["A_POSTAR", "SEM_ENVIO"].includes(statusDoEnvio) : statusDoEnvio !== "A_POSTAR") return null;
  const limite = new Date(despacharAte);
  if (Number.isNaN(limite.getTime())) return null;
  const hora = horaEmSaoPaulo(limite);
  const ate = hora === FIM_DO_DIA ? "" : ` até ${hora}`;
  const hoje = diaEmSaoPaulo(agora);
  const dia = diaEmSaoPaulo(limite);
  if (limite.getTime() < new Date(agora).getTime()) return { chave: "atrasado", texto: `Atrasado: era ${dia === hoje ? "hoje" : diaCurto(limite)}${ate}` };
  if (dia === hoje) return { chave: "hoje", texto: `Enviar hoje${ate}` };
  if (dia === somarDias(hoje, 1)) return { chave: "amanha", texto: `Enviar amanhã${ate}` };
  return { chave: "depois", texto: `Enviar ${diaCurto(limite)}${ate}` };
}
