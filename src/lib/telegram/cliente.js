import { requisitar as requisitarPadrao } from "@/lib/integracoes/httpClient";
import { LIMITE_DE_LINHAS, linkAbrirNoRise } from "./texto";

/**
 * O cliente da API do bot do Telegram (Rise AI, Entrega C1): `getMe`, `getUpdates`, `sendMessage`. So o que a C1 usa.
 *
 * O token vai na URL (`/bot<token>/<metodo>`), entao ele e o segredo mais facil de vazar: toda mensagem de erro que
 * sai daqui passa por `mascararToken`, e o `httpClient` grava o `endpoint` ja mascarado. O cliente recebe o
 * `requisitar` por parametro (o teste passa o Telegram falso de `scripts/lib/telegramFalso.js`) e NUNCA lanca por
 * resposta ruim: devolve `{ ok: false, erro }`, porque falha do Telegram e resultado, nao defeito do Rise.
 */

export const BASE_TELEGRAM = "https://api.telegram.org";
const LIMITE_DE_CARACTERES = 4096;
const FORMATO_DO_TOKEN = /^\d{6,12}:[A-Za-z0-9_-]{30,}$/;

/** O token como colado do BotFather: tira espacos, quebras e o `bot` que a documentacao poe na frente. */
export function limparToken(bruto) {
  return String(bruto ?? "")
    .replace(/\s+/g, "")
    .replace(/^bot(?=\d)/i, "");
}

export function tokenValido(token) {
  return FORMATO_DO_TOKEN.test(String(token ?? ""));
}

// Troca `/bot<qualquer coisa>/` por "/bot", tres asteriscos e "/" (escrito assim porque o trecho literal fecharia este
// comentario) e, com o `token`, toda ocorrencia literal dele por `***`.
export function mascararToken(texto, token = null) {
  let saida = String(texto ?? "").replace(/\/bot[^/\s]+\//g, "/bot***/");
  if (token) saida = saida.split(token).join("***");
  return saida;
}

/**
 * @param {{ token: string, requisitar?: Function, base?: string, urlPublica?: string }} opcoes
 *   `urlPublica` e a `APP_URL_PUBLICA`: sem ela o aviso vai sem o botao "Abrir no Rise" (o caso do PC).
 */
export function criarClienteTelegram({ token, requisitar = requisitarPadrao, base = BASE_TELEGRAM, urlPublica = process.env.APP_URL_PUBLICA } = {}) {
  if (!tokenValido(token)) throw new Error("Token do bot inválido.");

  async function chamar(metodo, corpo) {
    try {
      const resposta = await requisitar({
        servico: "TELEGRAM",
        url: `${base}/bot${token}/${metodo}`,
        metodo: "POST",
        corpo,
        timeoutMs: 15000,
        // Uma repeticao automatica em 5xx poderia mandar o mesmo aviso duas vezes; quem repete e a rotina do minuto seguinte.
        tentativas: 1,
      });
      const dados = resposta.dados ?? {};
      if (resposta.ok && dados.ok) return { ok: true, dados: dados.result };
      const descricao = typeof dados.description === "string" ? dados.description : `HTTP ${resposta.status}`;
      const erro = mascararToken(descricao, token);
      return { ok: false, erro, bloqueado: resposta.status === 403 && /blocked|deactivated|kicked/i.test(descricao) };
    } catch (falha) {
      return { ok: false, erro: mascararToken(falha?.message ?? String(falha), token) };
    }
  }

  return {
    /** A conta do bot: `{ id, username, first_name }`. */
    getMe: () => chamar("getMe", {}),

    /** As `limite` atualizacoes MAIS RECENTES, sem esperar (e a unica leitura da C1: a do vinculo). */
    getUpdates: ({ limite = 100 } = {}) => chamar("getUpdates", { offset: -limite, limit: limite, timeout: 0, allowed_updates: ["message"] }),

    /**
     * Texto puro, sem `parse_mode`, e o botao "Abrir no Rise" quando ha `urlPublica`. Recusa, sem chamar, texto acima
     * do limite de linhas ou de caracteres: um aviso que estourou e defeito de quem o montou.
     */
    enviarMensagem: (chatId, texto, { caminho } = {}) => {
      const linhas = String(texto ?? "").split("\n").length;
      if (linhas > LIMITE_DE_LINHAS || String(texto ?? "").length > LIMITE_DE_CARACTERES) return Promise.resolve({ ok: false, erro: "Mensagem acima do limite." });
      const url = caminho ? linkAbrirNoRise(urlPublica, caminho) : null;
      return chamar("sendMessage", {
        chat_id: String(chatId),
        text: String(texto),
        disable_web_page_preview: true,
        ...(url ? { reply_markup: { inline_keyboard: [[{ text: "Abrir no Rise", url }]] } } : {}),
      });
    },

    /** So para o Telegram descartar o que ja foi lido ate `ultimoUpdateId` (idempotencia da leitura do vinculo). */
    confirmarAtualizacoes: (ultimoUpdateId) => chamar("getUpdates", { offset: Number(ultimoUpdateId) + 1, limit: 1, timeout: 0 }),
  };
}
