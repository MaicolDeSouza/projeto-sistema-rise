import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A verificacao de robo do chat da loja (Cloudflare Turnstile) e o PASSE que a acompanha (spec de 19/11/2026, §8).
 *
 * O navegador do visitante resolve o desafio e manda um token; quem diz se ele vale e a Cloudflare, perguntada daqui com o
 * segredo do servico. Para nao desafiar a cada mensagem, o servico entrega um passe assinado, valido por 6 horas e so
 * para aquela sessao. Qualquer duvida (sem token, sem segredo, rede, resposta estranha) e "nao": a porta falha fechada.
 */

const ENDERECO = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const VALIDADE_DO_PASSE_MS = 6 * 60 * 60 * 1000;
const TEMPO_LIMITE_MS = 5000;

/** @returns {Promise<boolean>} nunca lança */
export async function verificarTurnstile({ token, ip, segredo, fetchImpl = fetch }) {
  if (!token || !segredo) return false;
  try {
    const corpo = new URLSearchParams({ secret: segredo, response: String(token) });
    if (ip) corpo.set("remoteip", ip);
    const resposta = await fetchImpl(ENDERECO, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corpo.toString(),
      signal: AbortSignal.timeout(TEMPO_LIMITE_MS),
    });
    if (!resposta?.ok) return false;
    const dados = await resposta.json();
    return dados?.success === true;
  } catch {
    return false;
  }
}

const assinar = (sessaoId, expira, chaveHex) => createHmac("sha256", Buffer.from(chaveHex, "hex")).update(`${sessaoId}.${expira}`).digest("base64url");

/** O passe de uma sessao que passou pelo desafio: `<expira em ms>.<assinatura>`. */
export function emitirPasse(sessaoId, chaveHex, agora = Date.now()) {
  const expira = agora + VALIDADE_DO_PASSE_MS;
  return `${expira}.${assinar(sessaoId, expira, chaveHex)}`;
}

/** O passe e desta sessao, desta chave, e ainda nao venceu? Nunca lanca: lixo e "nao". */
export function passeVale(passe, sessaoId, chaveHex, agora = Date.now()) {
  try {
    const [expiraTexto, assinatura, ...resto] = String(passe ?? "").split(".");
    if (resto.length || !/^\d{1,16}$/.test(expiraTexto ?? "") || !assinatura) return false;
    const expira = Number(expiraTexto);
    if (!(expira > agora)) return false;
    const esperada = Buffer.from(assinar(sessaoId, expira, chaveHex));
    const recebida = Buffer.from(assinatura);
    return esperada.length === recebida.length && timingSafeEqual(esperada, recebida);
  } catch {
    return false;
  }
}
