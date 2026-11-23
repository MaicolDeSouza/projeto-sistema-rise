/**
 * Cliente do PacoteVicio para a J&T (GET /v1/track/jtexpress/{codigo}, cabecalhos X-API-Key e X-Tracking-Document;
 * documentacao lida em 23/11/2026). Uma chamada por consulta, sem repetir: a rotina do worker tenta de novo na proxima
 * volta. O documento (CPF/CNPJ do destinatario) vai so no cabecalho e NUNCA na mensagem de erro nem no log.
 *
 * Fora da coleta o `fetch` e seguro (o defeito do undici e da coleta, com conexoes em paralelo; ver CLAUDE.md).
 */

const TEMPO_MS = 20 * 1000;

export function chaveDoPacoteVicio() {
  return String(process.env.PACOTEVICIO_API_KEY ?? "").trim() || null;
}

/** Cobrado = a transportadora respondeu (200, nao achado e documento invalido); o resto o PacoteVicio nao conta. */
function cobrado(http, codigo) {
  return http === 200 || codigo === "tracking_not_found" || codigo === "invalid_document";
}

function mensagemDoErro(http, codigo) {
  if (http === 401 || http === 403) return "Chave do PacoteVício recusada.";
  if (codigo === "quota_exceeded") return "Cota do PacoteVício esgotada no mês.";
  if (http === 429) return "Muitas consultas por minuto no PacoteVício; tenta de novo depois.";
  if (codigo === "tracking_not_found") return "A J&T não achou este código.";
  if (codigo === "invalid_document" || codigo === "document_required") return "A J&T recusou o documento.";
  if (http >= 500) return `PacoteVício fora do ar (HTTP ${http}).`;
  return `PacoteVício recusou a consulta (HTTP ${http}${codigo ? `, ${codigo}` : ""}).`;
}

/**
 * @param {string} codigo o codigo da J&T (ou a chave da NF-e de 44 digitos)
 * @param {string} documento CPF (11) ou CNPJ (14), so digitos
 * @returns {Promise<{ ok: true, dados: any, cobrado: true } | { ok: false, http: number|null, codigo: string|null,
 *   mensagem: string, cobrado: boolean, naoAchado: boolean, passageira: boolean }>}
 */
export async function consultarJT(codigo, documento, { chave = chaveDoPacoteVicio(), base = process.env.PACOTEVICIO_URL || "https://api.pacotevicio.dev" } = {}) {
  const url = `${base.replace(/\/+$/, "")}/v1/track/jtexpress/${encodeURIComponent(codigo)}`;
  let resposta;
  try {
    resposta = await fetch(url, {
      headers: { "X-API-Key": chave ?? "", "X-Tracking-Document": documento, Accept: "application/json", "User-Agent": "rise-compras/1.0" },
      signal: AbortSignal.timeout(TEMPO_MS),
    });
  } catch {
    return { ok: false, http: null, codigo: null, mensagem: "Sem resposta do PacoteVício.", cobrado: false, naoAchado: false, passageira: true };
  }
  const corpo = await resposta.json().catch(() => null);
  if (resposta.ok && corpo) return { ok: true, dados: corpo, cobrado: true };
  const erro = corpo?.error?.code ?? null;
  return {
    ok: false,
    http: resposta.status,
    codigo: erro,
    mensagem: mensagemDoErro(resposta.status, erro),
    cobrado: cobrado(resposta.status, erro),
    naoAchado: erro === "tracking_not_found" || erro === "invalid_document",
    passageira: resposta.status >= 500 || (resposta.status === 429 && erro !== "quota_exceeded"),
  };
}
