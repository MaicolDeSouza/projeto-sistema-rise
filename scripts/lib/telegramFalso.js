/**
 * Telegram FALSO para os testes da Entrega C1 (avisos no Telegram).
 *
 * Nao e um servidor: e um `requisitar` em memoria com o mesmo contrato do de `src/lib/integracoes/httpClient.js`
 * (`{ ok, status, duracaoMs, dados }`), porque `criarClienteTelegram` recebe o `requisitar` por parametro. Testa a
 * mesma logica sem rede, sem token real e sem banco. Por isso este arquivo NAO importa nada de `src/`.
 *
 * Responde aos tres metodos da API do bot que a C1 usa, no formato do Telegram (`{ ok, result }` / `{ ok: false,
 * description }`): `getMe`, `getUpdates` (offset negativo = as ultimas `limit`; positivo = `update_id >= offset`) e
 * `sendMessage` (guarda o corpo em `mensagens`); e, desde 19/11/2026, a `sendPhoto` e `sendMediaGroup` (a foto dos
 * produtos na nova venda, guardadas em `fotos`). `falhas.<metodo> = { status, description }` faz o metodo responder
 * essa falha (sempre). Metodo que ele nao conhece LANCA: e erro do teste ou do falso, e esconder isso atras de um 404
 * faria o teste passar sem provar nada.
 */

export function criarTelegramFalso({ bot = { id: 1, username: "rise_bot", first_name: "Rise" }, updates = [], falhas = {} } = {}) {
  const chamadas = [];
  const mensagens = [];
  const fotos = [];
  let proximaMensagem = 1;

  const resposta = (status, dados) => ({ ok: status >= 200 && status < 300, status, duracaoMs: 1, dados });

  async function requisitar({ url, corpo }) {
    const alvo = new URL(url);
    const casou = /^\/bot([^/]+)\/([A-Za-z]+)$/.exec(alvo.pathname);
    if (!casou) throw new Error(`Telegram falso: caminho desconhecido ${alvo.pathname}`);
    const [, token, metodo] = casou;
    chamadas.push({ metodo, corpo: corpo ?? null, token });

    const falha = falhas[metodo];
    if (falha) return resposta(falha.status, { ok: false, error_code: falha.status, description: falha.description });

    if (metodo === "getMe") return resposta(200, { ok: true, result: { ...bot, is_bot: true } });
    if (metodo === "getUpdates") {
      const limite = Math.max(1, Math.min(100, Number(corpo?.limit ?? 100)));
      const offset = Number(corpo?.offset ?? 0);
      const ordenadas = [...updates].sort((a, b) => a.update_id - b.update_id);
      const lista = offset < 0 ? ordenadas.slice(Math.max(0, ordenadas.length + offset)).slice(0, limite) : ordenadas.filter((u) => u.update_id >= offset).slice(0, limite);
      return resposta(200, { ok: true, result: lista });
    }
    if (metodo === "sendMessage") {
      mensagens.push(corpo);
      return resposta(200, { ok: true, result: { message_id: proximaMensagem++, chat: { id: corpo.chat_id }, text: corpo.text } });
    }
    // Foto e album chegam em multipart (FormData): o falso guarda os campos de texto ja lidos e, de cada arquivo, o
    // campo, o nome, o tipo e o tamanho. O album exige de 2 a 10 fotos e que todo `attach://` tenha o seu arquivo.
    if (metodo === "sendPhoto" || metodo === "sendMediaGroup") {
      if (!(corpo instanceof FormData)) throw new Error(`Telegram falso: ${metodo} sem multipart`);
      const arquivos = [...corpo.entries()].filter(([, valor]) => typeof valor !== "string").map(([campo, valor]) => ({ campo, nome: valor.name, tipo: valor.type, tamanho: valor.size }));
      const texto = (campo) => (typeof corpo.get(campo) === "string" ? corpo.get(campo) : null);
      const json = (campo) => (texto(campo) ? JSON.parse(texto(campo)) : null);
      const envio = { metodo, chat_id: texto("chat_id"), caption: texto("caption"), reply_markup: json("reply_markup"), media: json("media"), arquivos };
      if (metodo === "sendPhoto" && !arquivos.some((arquivo) => arquivo.campo === "photo")) return resposta(400, { ok: false, error_code: 400, description: "Bad Request: there is no photo in the request" });
      if (metodo === "sendMediaGroup") {
        const anexos = (envio.media ?? []).map((item) => String(item.media).replace("attach://", ""));
        if (anexos.length < 2 || anexos.length > 10) return resposta(400, { ok: false, error_code: 400, description: "Bad Request: wrong number of media in the album" });
        if (anexos.some((campo) => !arquivos.some((arquivo) => arquivo.campo === campo))) return resposta(400, { ok: false, error_code: 400, description: "Bad Request: wrong file identifier/HTTP URL specified" });
      }
      fotos.push(envio);
      const quantas = metodo === "sendPhoto" ? 1 : envio.media.length;
      const enviadas = Array.from({ length: quantas }, () => ({ message_id: proximaMensagem++, chat: { id: envio.chat_id } }));
      return resposta(200, { ok: true, result: metodo === "sendPhoto" ? enviadas[0] : enviadas });
    }
    throw new Error(`Telegram falso: metodo desconhecido ${metodo}`);
  }

  return { requisitar, chamadas, mensagens, fotos, updates };
}
