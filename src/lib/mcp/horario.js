/**
 * As horas que o MCP entrega, no horario de Brasilia (pedido do dono em 20/10/2026). O Rise guarda e as ferramentas devolvem
 * a hora em UTC ("2026-10-20T21:51:02Z"), e o claude.ai a mostrava como estava: uma leitura de estoque das 18:51 aparecia
 * como "21:51". Aqui, na saida do MCP, toda hora UTC vira a de Sao Paulo com o fuso escrito ("2026-10-20T18:51:02-03:00").
 * So no MCP: o resto do Rise (as telas e o WhatsApp futuro) segue com UTC, como sempre.
 *
 * Pura, sem imports. Data sem hora ("2026-10-20", "2025-09") e texto que so CONTEM uma hora ficam como estao.
 */

const FUSO = "America/Sao_Paulo";
const HORA_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

const PARTES = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** "2026-10-20T18:51:02-03:00": a hora de Sao Paulo e a diferenca para o UTC naquele instante (calculada, nao fixa). */
function emBrasilia(data) {
  const partes = Object.fromEntries(PARTES.formatToParts(data).map((parte) => [parte.type, parte.value]));
  const local = `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}:${partes.second}`;
  const minutos = Math.round((Date.parse(`${local}Z`) - Math.floor(data.getTime() / 1000) * 1000) / 60000);
  const sinal = minutos < 0 ? "-" : "+";
  const absoluto = Math.abs(minutos);
  return `${local}${sinal}${String(Math.floor(absoluto / 60)).padStart(2, "0")}:${String(absoluto % 60).padStart(2, "0")}`;
}

/** Percorre o resultado de uma ferramenta e troca cada hora UTC (texto ou Date) pela de Brasilia. */
export function horasDeBrasilia(valor) {
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : emBrasilia(valor);
  if (typeof valor === "string") return HORA_UTC.test(valor) ? emBrasilia(new Date(valor)) : valor;
  if (Array.isArray(valor)) return valor.map(horasDeBrasilia);
  if (valor && typeof valor === "object") return Object.fromEntries(Object.entries(valor).map(([chave, item]) => [chave, horasDeBrasilia(item)]));
  return valor;
}
