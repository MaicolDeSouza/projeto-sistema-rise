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

/** `[[{ texto, dados } | { texto, url }]]` no formato do Telegram. `dados` (o que volta no clique) tem no maximo 64 bytes. */
function tecladoDe(botoes) {
  return botoes.map((linha) => linha.map((botao) => (botao.url ? { text: String(botao.texto), url: String(botao.url) } : { text: String(botao.texto), callback_data: String(botao.dados).slice(0, 64) })));
}

/**
 * O mesmo contrato do `requisitar` do httpClient (`{ ok, status, dados }`), SEM gravar `LogIntegracao`: so a leitura das
 * atualizacoes usa (`lerAtualizacoes`), porque roda o tempo todo. Nunca lanca por resposta ruim; lanca no tempo esgotado
 * ou na rede, e o `chamar` devolve o erro mascarado.
 */
async function requisitarSemLog({ url, corpo, timeoutMs = 30000 }) {
  const resposta = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo ?? {}), signal: AbortSignal.timeout(timeoutMs) });
  const dados = await resposta.json().catch(() => null);
  return { ok: resposta.ok, status: resposta.status, dados };
}

/**
 * @param {{ token: string, requisitar?: Function, requisitarSemRegistro?: Function, base?: string, urlPublica?: string }} opcoes
 *   `urlPublica` e a `APP_URL_PUBLICA`: sem ela o aviso vai sem o botao "Abrir no Rise" (o caso do PC).
 */
export function criarClienteTelegram({ token, requisitar = requisitarPadrao, requisitarSemRegistro = requisitarSemLog, base = BASE_TELEGRAM, urlPublica = process.env.APP_URL_PUBLICA } = {}) {
  if (!tokenValido(token)) throw new Error("Token do bot inválido.");

  async function chamar(metodo, corpo, { timeoutMs = 15000, semRegistro = false } = {}) {
    try {
      const resposta = await (semRegistro ? requisitarSemRegistro : requisitar)({
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
    enviarMensagem: (chatId, texto, { caminho, limiteDeLinhas = LIMITE_DE_LINHAS, rotulo = ROTULO_DO_LINK } = {}) => {
      const linhas = String(texto ?? "").split("\n").length;
      if (linhas > limiteDeLinhas || String(texto ?? "").length > LIMITE_DE_CARACTERES) return Promise.resolve({ ok: false, erro: "Mensagem acima do limite." });
      const url = caminho ? linkAbrirNoRise(urlPublica, caminho) : null;
      return chamar("sendMessage", {
        chat_id: String(chatId),
        text: String(texto),
        disable_web_page_preview: true,
        // O botao do aviso de saldo diz "Adicionar saldo" (23/11/2026); os demais, "Abrir no Rise".
        ...(url ? { reply_markup: { inline_keyboard: [[{ text: rotulo || ROTULO_DO_LINK, url }]] } } : {}),
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

    // --- O bot que ESCUTA (Atendimento do ML, 24/11/2026). Ate aqui o cliente so enviava. ---

    /**
     * As atualizacoes a partir de `offset`, em espera longa (`esperaS` segundos sem nada novo antes de voltar vazio).
     * Mensagens e cliques de botao. E chamada o tempo todo pelo worker: por isso NAO grava `LogIntegracao` (seriam
     * milhares de linhas por dia sem informacao nenhuma); o erro continua voltando mascarado.
     */
    lerAtualizacoes: ({ offset = 0, esperaS = 20, limite = 100 } = {}) =>
      chamar("getUpdates", { offset: Number(offset), limit: limite, timeout: esperaS, allowed_updates: ["message", "callback_query"] }, { timeoutMs: (esperaS + 10) * 1000, semRegistro: true }),

    /** Fecha o "carregando" do botao clicado; `texto` aparece como um aviso curto no topo do chat. */
    responderAoClique: (callbackId, texto = null) => chamar("answerCallbackQuery", { callback_query_id: String(callbackId), ...(texto ? { text: String(texto).slice(0, 190) } : {}) }),

    /**
     * Texto puro com botoes proprios. `botoes` e uma grade `[[{ texto, dados } | { texto, url }]]`; `entidades` marca
     * trechos (o rascunho vai como `code`, que o Telegram copia com um toque); `forcarResposta` abre o campo de resposta
     * do chat apontado para esta mensagem (e exclui os botoes: o Telegram aceita um `reply_markup` so).
     */
    enviarComBotoes: (chatId, texto, { botoes = null, entidades = null, forcarResposta = false, dica = null } = {}) => {
      if (String(texto ?? "").length > LIMITE_DE_CARACTERES) return Promise.resolve({ ok: false, erro: "Mensagem acima do limite." });
      const marcacao = forcarResposta ? { force_reply: true, ...(dica ? { input_field_placeholder: String(dica).slice(0, 64) } : {}) } : botoes?.length ? { inline_keyboard: tecladoDe(botoes) } : null;
      return chamar("sendMessage", { chat_id: String(chatId), text: String(texto), disable_web_page_preview: true, ...(entidades?.length ? { entities: entidades } : {}), ...(marcacao ? { reply_markup: marcacao } : {}) });
    },

    /**
     * Uma foto com legenda e botoes proprios (o aviso da pergunta do ML). Sem foto, usar `enviarComBotoes`.
     * @param {{ bytes: Buffer, nome?: string, tipo?: string }} foto
     */
    enviarFotoComBotoes: (chatId, foto, legenda, { botoes = null } = {}) => {
      if (String(legenda ?? "").length > LIMITE_DA_LEGENDA) return Promise.resolve({ ok: false, erro: "Mensagem acima do limite." });
      const formulario = new FormData();
      formulario.append("chat_id", String(chatId));
      formulario.append("photo", new Blob([foto.bytes], { type: foto.tipo ?? "image/jpeg" }), foto.nome ?? "foto.jpg");
      formulario.append("caption", String(legenda ?? ""));
      if (botoes?.length) formulario.append("reply_markup", JSON.stringify({ inline_keyboard: tecladoDe(botoes) }));
      return chamar("sendPhoto", formulario, { timeoutMs: TEMPO_DO_ENVIO_DE_FOTO_MS });
    },

    /**
     * Troca o texto (ou a legenda, quando a mensagem tem foto) e os botoes de uma mensagem ja enviada. `botoes` vazio
     * tira os botoes. "message is not modified" (o mesmo texto de novo) conta como certo.
     */
    editarMensagem: async (chatId, mensagemId, { texto, botoes = [], comFoto = false, entidades = null }) => {
      const corpo = { chat_id: String(chatId), message_id: Number(mensagemId), reply_markup: { inline_keyboard: tecladoDe(botoes ?? []) } };
      const limite = comFoto ? LIMITE_DA_LEGENDA : LIMITE_DE_CARACTERES;
      const conteudo = String(texto ?? "").slice(0, limite);
      const resposta = comFoto
        ? await chamar("editMessageCaption", { ...corpo, caption: conteudo, ...(entidades?.length ? { caption_entities: entidades } : {}) })
        : await chamar("editMessageText", { ...corpo, text: conteudo, disable_web_page_preview: true, ...(entidades?.length ? { entities: entidades } : {}) });
      return !resposta.ok && /not modified/i.test(resposta.erro ?? "") ? { ok: true, dados: null } : resposta;
    },
  };
}
