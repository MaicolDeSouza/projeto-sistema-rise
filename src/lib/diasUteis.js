/**
 * Dias de envio da loja (pedido do dono em 22/11/2026: "nao fizemos envio no sabado, domingo e feriados, o rise deve ter
 * inteligencia para saber disso. Inclusive deve saber os feriados regionais para o endereco da loja, no caso Caxias do Sul").
 * Dia util = segunda a sexta que nao e feriado nacional, do RS ou de Caxias do Sul. Os dias sao texto "AAAA-MM-DD" no fuso de
 * Sao Paulo (o mesmo de `pedidos/despacho.js`). Puro: sem banco e sem rede.
 *
 * Fonte dos feriados (lida em 22/11/2026, proximoferiado.net para Caxias do Sul): os nacionais fixos (o 20/11 da Consciencia
 * Negra e nacional desde a Lei 14.759/2023), a Sexta-feira Santa, o 20/09 (Revolucao Farroupilha, estadual) e o 01/06
 * (aniversario de Caxias do Sul, municipal). Carnaval (segunda e terca) e Corpus Christi sao ponto facultativo, mas o comercio
 * e os Correios de Caxias param: entram como dia sem envio. Feriado novo (decreto municipal, data movida) entra em
 * `FERIADOS_AVULSOS`.
 */

const FIXOS = {
  "01-01": "Confraternização Universal",
  "04-21": "Tiradentes",
  "05-01": "Dia do Trabalho",
  "06-01": "Aniversário de Caxias do Sul",
  "09-07": "Independência do Brasil",
  "09-20": "Revolução Farroupilha",
  "10-12": "Nossa Senhora Aparecida",
  "11-02": "Finados",
  "11-15": "Proclamação da República",
  "11-20": "Dia da Consciência Negra",
  "12-25": "Natal",
};

/** Feriado de um ano so ("AAAA-MM-DD": nome), para decreto da prefeitura ou ponte que a loja fechou. */
const FERIADOS_AVULSOS = {};

/** Domingo de Pascoa (algoritmo de Meeus/Jones/Butcher, calendario gregoriano), como "AAAA-MM-DD". */
export function domingoDePascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// A conta de dias e feita ao meio-dia UTC: longe da meia-noite, somar dias nunca pula nem repete uma data.
const comoData = (diaIso) => new Date(`${diaIso}T12:00:00Z`);
const comoDia = (data) => data.toISOString().slice(0, 10);

/** O dia somado de `dias` dias corridos (negativo volta). */
export function somarDiasCorridos(diaIso, dias) {
  const d = comoData(diaIso);
  d.setUTCDate(d.getUTCDate() + dias);
  return comoDia(d);
}

const moveisCache = new Map();
/** Os feriados que mudam com a Pascoa, no ano. */
function moveis(ano) {
  if (!moveisCache.has(ano)) {
    const pascoa = domingoDePascoa(ano);
    moveisCache.set(ano, {
      [somarDiasCorridos(pascoa, -48)]: "Carnaval (segunda)",
      [somarDiasCorridos(pascoa, -47)]: "Carnaval (terça)",
      [somarDiasCorridos(pascoa, -2)]: "Sexta-feira Santa",
      [somarDiasCorridos(pascoa, 60)]: "Corpus Christi",
    });
  }
  return moveisCache.get(ano);
}

/** O nome do feriado do dia, ou null. */
export function feriadoDe(diaIso) {
  const dia = String(diaIso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  return FERIADOS_AVULSOS[dia] ?? FIXOS[dia.slice(5)] ?? moveis(Number(dia.slice(0, 4)))[dia] ?? null;
}

/** Segunda a sexta e sem feriado. */
export function ehDiaUtil(diaIso) {
  const semana = comoData(diaIso).getUTCDay();
  return semana !== 0 && semana !== 6 && !feriadoDe(diaIso);
}

/** O proprio dia, se for util; senao o proximo dia util. */
export function diaUtilAPartirDe(diaIso) {
  let dia = diaIso;
  for (let i = 0; i < 30 && !ehDiaUtil(dia); i++) dia = somarDiasCorridos(dia, 1);
  return dia;
}

/** O primeiro dia util DEPOIS do dia (nunca o proprio). */
export function proximoDiaUtil(diaIso) {
  return diaUtilAPartirDe(somarDiasCorridos(diaIso, 1));
}
