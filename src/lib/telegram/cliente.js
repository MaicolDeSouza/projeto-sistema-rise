import { requisitar as requisitarPadrao } from "@/lib/integracoes/httpClient";
import { LIMITE_DE_LINHAS, linkAbrirNoRise } from "./texto";

/**
 * O cliente da API do bot do Telegram (Rise AI, Entrega C1): `getMe`, `getUpdates`, `sendMessage` e, desde 19/11/2026,
 * `sendPhoto` e `sendMediaGroup` (a foto dos produtos na nova venda). So o que os avisos usam.
 *
 * O token vai na URL (`/bot<token>/<metodo>`), entao ele e o segredo mais facil de vazar: toda mensagem de erro que
 * sai daqui passa por `mascararToken`, e o `httpClient` grava o `endpoint` ja mascarado. O cliente recebe o
 * `requisitar` por parametro (o teste passa o Telegram falso de `scripts/lib/telegramFalso.js`) e NUNCA lanca por
 * resposta ruim: devolve `{ ok: false, erro }`, porque falha do Telegram e resultado, nao defeito do Rise.
 */

export const BASE_TELEGRAM = "https://api.telegram.org";
const LIMITE_DE_CARACTERES = 4096;
/// A legenda de uma foto e bem mais curta que a mensagem de texto (limite do Telegram).
const LIMITE_DA_LEGENDA = 1024;
/// O album do Telegram (`sendMediaGroup`) leva de 2 a 10 fotos.
export const MAXIMO_DE_FOTOS = 10;
/// Subir fotos demora mais que mandar texto: 15 s cortariam um album de 10 numa conexao lenta.
const TEMPO_DO_ENVIO_DE_FOTO_MS = 60000;
const ROTULO_DO_LINK = "Abrir no Rise";
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

  async function chamar(metodo, corpo, { timeoutMs = 15000 } = {}) {
    try {
      const resposta = await requisitar({
        servico: "TELEGRAM",
        url: `${base}/bot${token}/${metodo}`,
        metodo: "POST",
        corpo,
        timeoutMs,
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
    enviarMensagem: (chatId, texto, { caminho, limiteDeLinhas = LIMITE_DE_LINHAS } = {}) => {
      const linhas = String(texto ?? "").split("\n").length;
      if (linhas > limiteDeLinhas || String(texto ?? "").length > LIMITE_DE_CARACTERES) return Promise.resolve({ ok: false, erro: "Mensagem acima do limite." });
      const url = caminho ? linkAbrirNoRise(urlPublica, caminho) : null;
      return chamar("sendMessage", {
        chat_id: String(chatId),
        text: String(texto),
        disable_web_page_preview: true,
        ...(url ? { reply_markup: { inline_keyboard: [[{ text: ROTULO_DO_LINK, url }]] } } : {}),
      });
    },

    /**
     * O mesmo aviso com foto (pedido do dono em 19/11/2026, na nova venda): `fotos` e `[{ bytes, nome, tipo }]`.
     * UMA foto vai por `sendPhoto`, com o texto na legenda e o botao. DUAS a dez vao num album (`sendMediaGroup`), com
     * a legenda na primeira; o album NAO aceita botao, entao o "Abrir no Rise" vira a ultima linha da legenda, como
     * link (`caption_entities`, ainda sem `parse_mode`: so esse trecho e link, e o endereco e nosso).
     * As fotos sobem em multipart: o Rise fica atras de login e o Telegram nao conseguiria baixa-las por endereco.
     */
    enviarFotos: (chatId, fotos, texto, { caminho, limiteDeLinhas = LIMITE_DE_LINHAS } = {}) => {
      const lista = (Array.isArray(fotos) ? fotos : []).slice(0, MAXIMO_DE_FOTOS);
      if (lista.length === 0) return Promise.resolve({ ok: false, erro: "Sem foto para enviar." });
      const legenda = String(texto ?? "");
      const url = caminho ? linkAbrirNoRise(urlPublica, caminho) : null;
      const comLink = url && lista.length > 1 ? `${legenda}\n${ROTULO_DO_LINK}` : legenda;
      if (legenda.split("\n").length > limiteDeLinhas || comLink.length > LIMITE_DA_LEGENDA) return Promise.resolve({ ok: false, erro: "Mensagem acima do limite." });

      const arquivo = (foto, indice) => [new Blob([foto.bytes], { type: foto.tipo ?? "image/jpeg" }), foto.nome ?? `foto${indice + 1}.jpg`];
      const formulario = new FormData();
      formulario.append("chat_id", String(chatId));
      if (lista.length === 1) {
        formulario.append("photo", ...arquivo(lista[0], 0));
        formulario.append("caption", legenda);
        if (url) formulario.append("reply_markup", JSON.stringify({ inline_keyboard: [[{ text: ROTULO_DO_LINK, url }]] }));
        return chamar("sendPhoto", formulario, { timeoutMs: TEMPO_DO_ENVIO_DE_FOTO_MS });
      }
      // O `offset` do link conta em unidades UTF-16, a mesma conta do `length` de uma string do JavaScript.
      const link = url ? { caption_entities: [{ type: "text_link", offset: legenda.length + 1, length: ROTULO_DO_LINK.length, url }] } : {};
      formulario.append("media", JSON.stringify(lista.map((_, indice) => ({ type: "photo", media: `attach://foto${indice}`, ...(indice === 0 ? { caption: comLink, ...link } : {}) }))));
      lista.forEach((foto, indice) => formulario.append(`foto${indice}`, ...arquivo(foto, indice)));
      return chamar("sendMediaGroup", formulario, { timeoutMs: TEMPO_DO_ENVIO_DE_FOTO_MS });
    },

    /** So para o Telegram descartar o que ja foi lido ate `ultimoUpdateId` (idempotencia da leitura do vinculo). */
    confirmarAtualizacoes: (ultimoUpdateId) => chamar("getUpdates", { offset: Number(ultimoUpdateId) + 1, limit: 1, timeout: 0 }),
  };
}
