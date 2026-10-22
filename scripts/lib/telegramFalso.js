/**
 * Telegram FALSO para os testes da Entrega C1 (avisos no Telegram).
 *
 * Nao e um servidor: e um `requisitar` em memoria com o mesmo contrato do de `src/lib/integracoes/httpClient.js`
 * (`{ ok, status, duracaoMs, dados }`), porque `criarClienteTelegram` recebe o `requisitar` por parametro. Testa a
 * mesma logica sem rede, sem token real e sem banco. Por isso este arquivo NAO importa nada de `src/`.
 *
 * Responde aos tres metodos da API do bot que a C1 usa, no formato do Telegram (`{ ok, result }` / `{ ok: false,
 * description }`): `getMe`, `getUpdates` (offset negativo = as ultimas `limit`; positivo = `update_id >= offset`) e
 * `sendMessage` (guarda o corpo em `mensagens`). `falhas.<metodo> = { status, description }` faz o metodo responder
 * essa falha (sempre). Metodo que ele nao conhece LANCA: e erro do teste ou do falso, e esconder isso atras de um 404
 * faria o teste passar sem provar nada.
 */

export function criarTelegramFalso({ bot = { id: 1, username: "rise_bot", first_name: "Rise" }, updates = [], falhas = {} } = {}) {
  const chamadas = [];
  const mensagens = [];
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
    throw new Error(`Telegram falso: metodo desconhecido ${metodo}`);
  }

  return { requisitar, chamadas, mensagens, updates };
}
