/**
 * Mercado Livre FALSO para o Atendimento do ML (perguntas dos anuncios). Mesmo contrato do `clienteML()`
 * (`get`, `post`, `usuarioId`), em memoria: sem rede, sem token. NAO importa nada de `src/`.
 *
 * Responde ao que a fase 1 usa: `GET /questions/{id}`, `GET /questions/search` (por `seller_id` ou `item`, com `status`,
 * `offset` e `limit`), `GET /items/{id}`, `GET /items/{id}/description` e `POST /answers`. Caminho que ele nao conhece
 * LANCA: esconder isso atras de um 404 faria o teste passar sem provar nada.
 *
 * `respostasEnviadas` guarda cada `POST /answers` que chegou (inclusive o que falhou conta em `chamadas`);
 * `falharNoProximoPost(status)` faz o proximo POST responder esse erro, uma vez.
 */

export function criarMlPerguntasFalso({ vendedorId = "212386247" } = {}) {
  const perguntas = new Map();
  const itens = new Map();
  const respostasEnviadas = [];
  const chamadas = [];
  let falhaDoPost = null;

  const resposta = (status, dados) => ({ ok: status >= 200 && status < 300, status, dados });

  function porPergunta({ id, item = "MLB900000001", texto = "Tem em estoque?", status = "UNANSWERED", resposta: answer = null, criadaEm = "2026-11-24T10:00:00.000-04:00" }) {
    const pergunta = { id, item_id: item, seller_id: Number(vendedorId), status, text: texto, date_created: criadaEm, deleted_from_listing: false, hold: false, answer, from: { id: 111 } };
    perguntas.set(String(id), pergunta);
    return pergunta;
  }

  async function get(caminho, params = {}) {
    chamadas.push({ metodo: "GET", caminho, params });
    if (caminho === "/questions/search") {
      const item = params.item ?? params.item_id ?? null;
      let lista = [...perguntas.values()];
      if (item) lista = lista.filter((p) => p.item_id === item);
      if (params.status) lista = lista.filter((p) => p.status === params.status);
      const offset = Number(params.offset ?? 0);
      const limit = Number(params.limit ?? 50);
      return resposta(200, { total: lista.length, limit, questions: lista.slice(offset, offset + limit) });
    }
    let casou = /^\/questions\/([^/]+)$/.exec(caminho);
    if (casou) {
      const pergunta = perguntas.get(casou[1]);
      return pergunta ? resposta(200, pergunta) : resposta(404, { message: "Question not found", status: 404 });
    }
    casou = /^\/items\/([^/]+)\/description$/.exec(caminho);
    if (casou) {
      const item = itens.get(casou[1]);
      return item ? resposta(200, { plain_text: item.descricao ?? "" }) : resposta(404, {});
    }
    casou = /^\/items\/([^/]+)$/.exec(caminho);
    if (casou) {
      const item = itens.get(casou[1]);
      return item ? resposta(200, item.dados) : resposta(404, { message: "Item not found", status: 404 });
    }
    throw new Error(`ML falso (perguntas): GET desconhecido ${caminho}`);
  }

  async function post(caminho, corpo) {
    chamadas.push({ metodo: "POST", caminho, corpo });
    if (caminho !== "/answers") throw new Error(`ML falso (perguntas): POST desconhecido ${caminho}`);
    if (falhaDoPost) {
      const status = falhaDoPost;
      falhaDoPost = null;
      return resposta(status, { message: "Internal error", status });
    }
    const pergunta = perguntas.get(String(corpo?.question_id));
    if (!pergunta) return resposta(400, { message: "A pergunta é inválida.", error: "invalid_question", status: 400 });
    if (pergunta.status !== "UNANSWERED") return resposta(400, { message: "Question already answered", error: "not_unanswered_question", status: 400 });
    respostasEnviadas.push({ question_id: corpo.question_id, text: corpo.text });
    pergunta.status = "ANSWERED";
    pergunta.answer = { text: corpo.text, status: "ACTIVE", date_created: new Date().toISOString() };
    return resposta(200, pergunta);
  }

  return {
    get,
    post,
    usuarioId: async () => String(vendedorId),
    perguntas,
    itens,
    respostasEnviadas,
    chamadas,
    porPergunta,
    /** `dados` no formato de `GET /items/{id}` (title, price, available_quantity, status, permalink, attributes). */
    porItem(id, dados, descricao = "") {
      itens.set(id, { dados: { id, ...dados }, descricao });
    },
    responderNoApp(id, texto = "Respondido pelo app do ML") {
      const pergunta = perguntas.get(String(id));
      pergunta.status = "ANSWERED";
      pergunta.answer = { text: texto, status: "ACTIVE", date_created: "2026-11-24T11:00:00.000-04:00" };
    },
    falharNoProximoPost(status = 500) {
      falhaDoPost = status;
    },
  };
}
