/**
 * O periodo das Metricas de faturamento de Vendas (pedido do dono em 25/11/2026: o painel nasce no mes atual, com os botoes
 * "Mes anterior" e "Mes atual" e um intervalo de datas). Dias no formato "AAAA-MM-DD" de Sao Paulo. Sem imports: a tela, a
 * acao do servidor e o teste usam o mesmo arquivo.
 */

const DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const UM_DIA_MS = 86_400_000;
/// Teto do intervalo livre: um ano (o resumo le os pedidos do periodo inteiro na memoria).
const MAXIMO_DE_DIAS = 366;

const dois = (n) => String(n).padStart(2, "0");
const meioDia = (dia) => Date.parse(`${dia}T12:00:00Z`);

/** O mes de `hoje` deslocado (`0` = mes atual, do dia 1 ate hoje; `-1` = mes anterior inteiro). */
export function periodoDoMes(hoje, deslocamento = 0) {
  const [ano, mes] = hoje.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 1 + deslocamento, 1));
  const desde = `${inicio.getUTCFullYear()}-${dois(inicio.getUTCMonth() + 1)}-01`;
  if (deslocamento === 0) return { desde, ate: hoje };
  const fim = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 0));
  return { desde, ate: `${fim.getUTCFullYear()}-${dois(fim.getUTCMonth() + 1)}-${dois(fim.getUTCDate())}` };
}

/** Dias corridos com as duas pontas; o "ate" no futuro conta so ate hoje (os dias que nao chegaram puxariam a media). */
export function diasDoPeriodo(desde, ate, hoje) {
  const fim = ate > hoje ? hoje : ate;
  return Math.max(1, Math.round((meioDia(fim) - meioDia(desde)) / UM_DIA_MS) + 1);
}

/** Confere o periodo que chega da tela: `{ ok: true }` ou `{ ok: false, erro }`. */
export function conferirPeriodo({ desde, ate } = {}) {
  if (!DIA.test(String(desde ?? "")) || !DIA.test(String(ate ?? "")) || Number.isNaN(meioDia(desde)) || Number.isNaN(meioDia(ate))) {
    return { ok: false, erro: "Datas inválidas." };
  }
  if (desde > ate) return { ok: false, erro: "A data inicial vem depois da final." };
  if ((meioDia(ate) - meioDia(desde)) / UM_DIA_MS + 1 > MAXIMO_DE_DIAS) return { ok: false, erro: "Escolha um período de até 1 ano." };
  return { ok: true };
}
