/**
 * Mercado Livre FALSO para o Atendimento do ML (perguntas dos anuncios). Mesmo contrato do `clienteML()`
 * (`get`, `post`, `usuarioId`), em memoria: sem rede, sem token. NAO importa nada de `src/`.
 *
 * Responde ao que a fase 1 usa: `GET /questions/{id}`, `GET /questions/search` (por `seller_id` ou `item`, com `status`,
 * `offset` e `limit`), `GET /items/{id}`, `GET /items/{id}/description` e `POST /answers`. Caminho que ele nao conhece
 * LANCA: esconder isso atras de um 404 faria o teste passar sem provar nada.
 *
 * Fase 2 (pos-venda): `GET /messages/packs/{pack}/sellers/{vendedor}` (10 por pagina, da mais NOVA para a mais antiga, como
 * o ML; sem `mark_as_read=false` a conversa entra em `marcadasComoLidas`), `GET /messages/unread`, `GET /messages/{id}` e
 * `POST /messages/packs/{pack}/sellers/{vendedor}` (guardado em `mensagensEnviadas`).
 *
 * `respostasEnviadas` guarda cada `POST /answers` que chegou (inclusive o que falhou conta em `chamadas`);
 * `falharNoProximoPost(status)` faz o proximo POST responder esse erro, uma vez.
 */

export function criarMlPerguntasFalso({ vendedorId = "212386247" } = {}) {
  const perguntas = new Map();
  const itens = new Map();
  const respostasEnviadas = [];
  const chamadas = [];
  // Pos-venda: pack -> { status, substatus, claimIds, limite, compradorId, mensagens: [da mais antiga para a mais nova] }.
  const conversas = new Map();
  const naoLidas = new Set();
  const marcadasComoLidas = [];
  const mensagensEnviadas = [];
  // Reclamacoes: id -> { status, tipo, etapa, acoes, mensagens: [da mais antiga para a mais nova] }.
  const reclamacoes = new Map();
  const mensagensDeReclamacaoEnviadas = [];
  let foraDoAr = false;
  let sequencia = 0;
  let falhaDoPost = null;

  const resposta = (status, dados) => ({ ok: status >= 200 && status < 300, status, dados });

  function porPergunta({ id, item = "MLB900000001", texto = "Tem em estoque?", status = "UNANSWERED", resposta: answer = null, criadaEm = "2026-11-24T10:00:00.000-04:00" }) {
    const pergunta = { id, item_id: item, seller_id: Number(vendedorId), status, text: texto, date_created: criadaEm, deleted_from_listing: false, hold: false, answer, from: { id: 111 } };
    perguntas.set(String(id), pergunta);
    return pergunta;
  }

  const mensagemDoML = (pack, m) => ({
    id: m.id,
    site_id: "MLB",
    from: { user_id: m.de === "V" ? Number(vendedorId) : conversas.get(pack).compradorId },
    to: { user_id: m.de === "V" ? conversas.get(pack).compradorId : Number(vendedorId) },
    status: "available",
    text: m.texto,
    message_date: { created: m.em, received: m.em, available: m.em, notified: m.em, read: null },
    message_moderation: { is_automatic: false, status: m.moderacao ?? "clean", reason: null, source: "online" },
    message_attachments: m.anexos ? Array.from({ length: m.anexos }, (_, i) => ({ filename: `anexo-${i + 1}.jpg` })) : null,
    message_resources: [{ id: String(pack), name: "packs" }, { id: String(vendedorId), name: "sellers" }],
    conversation_first_message: false,
  });

  function paginaDaConversa(pack, params) {
    const conversa = conversas.get(pack);
    const limit = Number(params.limit ?? 10);
    const offset = Number(params.offset ?? 0);
    const todas = conversa ? [...conversa.mensagens].reverse() : [];
    if (conversa && String(params.mark_as_read ?? "true") !== "false") {
      marcadasComoLidas.push(pack);
      naoLidas.delete(pack);
    }
    return {
      paging: { limit, offset, total: todas.length },
      conversation_status: { path: `/packs/${pack}/sellers/${vendedorId}`, status: conversa?.status ?? "blocked", substatus: conversa ? conversa.substatus ?? null : "blocked_by_conversation_initiated_by_seller_limited", claim_ids: conversa?.claimIds ?? [], shipping_id: null },
      messages: todas.slice(offset, offset + limit).map((m) => mensagemDoML(pack, m)),
      seller_max_message_length: conversa?.limite ?? 350,
      buyer_max_message_length: 3500,
    };
  }

  // Reclamacoes (fase 3): o formato medido na conta em 25/11/2026 (`players[].available_actions`, mensagens com `hash`).
  const PAPEL = { C: "complainant", V: "respondent", M: "mediator" };
  const reclamacaoDoML = (r) => ({
    id: r.id,
    resource_id: r.recursoId,
    status: r.status,
    type: r.tipo,
    stage: r.etapa,
    resource: "order",
    reason_id: "PDD9939",
    fulfilled: true,
    players: [
      { role: "complainant", type: "buyer", user_id: 987654321, available_actions: [] },
      { role: "respondent", type: "seller", user_id: Number(vendedorId), available_actions: r.status === "opened" ? r.acoes.map((action) => ({ action, mandatory: action === r.obrigatoria, due_date: action === r.obrigatoria ? r.prazo ?? null : null })) : [] },
      { role: "mediator", type: "internal", user_id: 1, available_actions: [] },
    ],
    resolution: r.status === "closed" ? { reason: "payment_refunded", closed_by: "mediator" } : null,
    site_id: "MLB",
    date_created: r.criadaEm,
    last_updated: r.criadaEm,
  });
  const mensagemDaReclamacao = (r, m) => ({
    sender_role: PAPEL[m.de],
    receiver_role: PAPEL[m.para ?? (m.de === "V" ? (r.etapa === "dispute" ? "M" : "C") : "V")],
    message: m.texto,
    translated_message: null,
    date_created: m.em,
    last_updated: m.em,
    message_date: m.em,
    date_read: null,
    attachments: m.anexos ? Array.from({ length: m.anexos }, (_, i) => ({ filename: `anexo-${i + 1}.jpg`, original_filename: "foto.jpg", size: 100, type: "image/jpeg" })) : [],
    status: m.moderacao && m.moderacao !== "clean" ? "moderated" : "available",
    stage: m.etapa ?? r.etapa,
    message_moderation: { status: m.moderacao ?? "clean", reason: null, source: "online", date_moderated: m.em },
    repeated: false,
    hash: m.hash,
  });

  async function get(caminhoComQuery, parametros = {}) {
    // A consulta pode vir no caminho ("...?tag=post_sale") ou em `params`: o falso aceita as duas.
    const [caminho, consulta = ""] = String(caminhoComQuery).split("?");
    const params = { ...Object.fromEntries(new URLSearchParams(consulta)), ...parametros };
    chamadas.push({ metodo: "GET", caminho, params });
    if (caminho.startsWith("/messages")) {
      if (foraDoAr) return resposta(503, { message: "Service unavailable", status: 503 });
      if (caminho === "/messages/unread") {
        return resposta(200, { user_id: Number(vendedorId), total: naoLidas.size, results: [...naoLidas].map((pack) => ({ resource: `/packs/${pack}/sellers/${vendedorId}`, count: 1 })) });
      }
      const daConversa = /^\/messages\/packs\/([^/]+)\/sellers\/([^/]+)$/.exec(caminho);
      if (daConversa) return resposta(200, paginaDaConversa(daConversa[1], params));
      const daMensagem = /^\/messages\/([^/]+)$/.exec(caminho);
      if (daMensagem) {
        for (const [pack, conversa] of conversas) {
          const achada = conversa.mensagens.find((m) => m.id === daMensagem[1]);
          if (achada) return resposta(200, { messages: [mensagemDoML(pack, achada)] });
        }
        return resposta(404, { message: "Message not found", status: 404 });
      }
    }
    if (caminho.startsWith("/post-purchase/v1/claims")) {
      if (caminho === "/post-purchase/v1/claims/search") {
        let lista = [...reclamacoes.values()];
        if (params.status) lista = lista.filter((r) => r.status === params.status);
        const offset = Number(params.offset ?? 0);
        const limit = Number(params.limit ?? 30);
        return resposta(200, { paging: { total: lista.length, offset, limit }, data: lista.slice(offset, offset + limit).map(reclamacaoDoML) });
      }
      const daReclamacao = /^\/post-purchase\/v1\/claims\/([^/]+)(\/messages|\/detail)?$/.exec(caminho);
      if (daReclamacao) {
        const reclamacao = reclamacoes.get(daReclamacao[1]);
        if (!reclamacao) return resposta(404, { message: "Claim not found", status: 404 });
        if (reclamacao.foraDoAr) return resposta(500, { message: "Internal error", status: 500 });
        if (daReclamacao[2] === "/messages") return resposta(200, [...reclamacao.mensagens].reverse().map((m) => mensagemDaReclamacao(reclamacao, m)));
        if (daReclamacao[2] === "/detail") return resposta(206, { due_date: reclamacao.prazo ?? null, action_responsible: "respondent", title: "Responda ao comprador", description: "O comprador abriu uma reclamação.", problem: reclamacao.problema ?? null });
        return resposta(200, reclamacaoDoML(reclamacao));
      }
    }
    if (caminho === "/questions/search") {
      const item = params.item ?? params.item_id ?? null;
      let lista = [...perguntas.values()];
      if (item) lista = lista.filter((p) => p.item_id === item);
      if (params.status) lista = lista.filter((p) => p.status === params.status);
      const offset = Number(params.offset ?? 0);
      const limit = Number(params.limit ?? 50);
      return resposta(200, { total: lista.length, limit, questions: lista.slice(offset, offset + limit) });
    }
    // O multiget (`GET /items?ids=a,b`): uma entrada por id, na ordem pedida, com `code` e `body`.
    if (caminho === "/items") {
      const ids = String(params.ids ?? "").split(",").map((id) => id.trim()).filter(Boolean);
      return resposta(200, ids.map((id) => (itens.has(id) ? { code: 200, body: itens.get(id).dados } : { code: 404, body: { id, message: "Item not found" } })));
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

  async function post(caminhoComQuery, corpo) {
    const [caminho] = String(caminhoComQuery).split("?");
    chamadas.push({ metodo: "POST", caminho, corpo, consulta: String(caminhoComQuery).split("?")[1] ?? "" });
    const daConversa = /^\/messages\/packs\/([^/]+)\/sellers\/([^/]+)$/.exec(caminho);
    if (daConversa) {
      if (falhaDoPost) {
        const status = falhaDoPost;
        falhaDoPost = null;
        return resposta(status, { message: status === 400 ? "The message was moderated" : "Internal error", status });
      }
      const conversa = conversas.get(daConversa[1]);
      if (!conversa || conversa.status !== "active") return resposta(403, { message: "Conversation blocked", error: "blocked_conversation_send_message_forbidden", status: 403 });
      mensagensEnviadas.push({ pack: daConversa[1], consulta: String(caminhoComQuery).split("?")[1] ?? "", ...corpo });
      conversa.mensagens.push({ id: `zzmsgv${++sequencia}`, de: "V", texto: corpo.text, em: new Date().toISOString() });
      return resposta(201, { id: `zzmsgv${sequencia}`, status: "available" });
    }
    const daReclamacao = /^\/post-purchase\/v1\/claims\/([^/]+)\/actions\/send-message$/.exec(caminho);
    if (daReclamacao) {
      if (falhaDoPost) {
        const status = falhaDoPost;
        falhaDoPost = null;
        return resposta(status, { message: status === 400 ? "The message is too long" : "Internal error", status });
      }
      const reclamacao = reclamacoes.get(daReclamacao[1]);
      const acao = { complainant: "send_message_to_complainant", mediator: "send_message_to_mediator" }[corpo?.receiver_role];
      if (!reclamacao || reclamacao.status !== "opened" || !acao || !reclamacao.acoes.includes(acao)) return resposta(400, { message: "Action not available", error: "action_not_available", status: 400 });
      mensagensDeReclamacaoEnviadas.push({ reclamacao: daReclamacao[1], ...corpo });
      reclamacao.mensagens.push({ hash: `zzhashv${++sequencia}`, de: "V", para: corpo.receiver_role === "mediator" ? "M" : "C", texto: corpo.message, em: new Date().toISOString(), etapa: reclamacao.etapa });
      return resposta(201, {});
    }
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
    conversas,
    naoLidas,
    marcadasComoLidas,
    mensagensEnviadas,
    /** Cria (ou troca) a conversa de um pack. `mensagens`: `[{ de: "C" | "V", texto, em?, anexos?, moderacao? }]`, da mais antiga para a mais nova. */
    porConversa(pack, { status = "active", substatus = null, claimIds = [], limite = 350, compradorId = 987654321, mensagens = [] } = {}) {
      const base = Date.parse("2026-11-24T12:00:00.000Z");
      conversas.set(String(pack), { status, substatus, claimIds, limite, compradorId, mensagens: mensagens.map((m, i) => ({ id: m.id ?? `zzmsg${++sequencia}`, em: m.em ?? new Date(base + i * 60000).toISOString(), ...m })) });
      return conversas.get(String(pack));
    },
    /** O comprador (ou o vendedor, pelo app do ML) escreve mais uma mensagem. Devolve o id dela. */
    escrever(pack, de, texto, extra = {}) {
      const conversa = conversas.get(String(pack));
      const ultima = conversa.mensagens.at(-1);
      const em = new Date((ultima ? Date.parse(ultima.em) : Date.parse("2026-11-24T12:00:00.000Z")) + 60000).toISOString();
      const id = `zzmsg${++sequencia}`;
      conversa.mensagens.push({ id, de, texto, em, ...extra });
      if (de === "C") naoLidas.add(String(pack));
      return id;
    },
    mensagensForaDoAr(valor = true) {
      foraDoAr = valor;
    },
    reclamacoes,
    mensagensDeReclamacaoEnviadas,
    /** Cria (ou troca) uma reclamacao. `mensagens`: `[{ de: "C" | "V" | "M", texto, para?, anexos?, moderacao?, etapa? }]`, da mais antiga para a mais nova. */
    porReclamacao(id, { status = "opened", tipo = "mediations", etapa = "claim", acoes = ["send_message_to_complainant", "refund", "open_dispute"], obrigatoria = null, prazo = null, problema = null, recursoId = "ZZ-ATD-O-RECL", criadaEm = "2026-11-25T12:00:00.000Z", mensagens = [] } = {}) {
      const base = Date.parse(criadaEm);
      reclamacoes.set(String(id), { id: String(id), status, tipo, etapa, acoes, obrigatoria, prazo, problema, recursoId, criadaEm, foraDoAr: false, mensagens: mensagens.map((m, i) => ({ hash: m.hash ?? `zzhash${++sequencia}`, em: m.em ?? new Date(base + (i + 1) * 60000).toISOString(), ...m })) });
      return reclamacoes.get(String(id));
    },
    /** Alguem escreve na reclamacao (o comprador, o mediador, ou a loja pelo app do ML). Devolve o `hash`. */
    escreverNaReclamacao(id, de, texto, extra = {}) {
      const reclamacao = reclamacoes.get(String(id));
      const ultima = reclamacao.mensagens.at(-1);
      const hash = `zzhash${++sequencia}`;
      reclamacao.mensagens.push({ hash, de, texto, em: new Date((ultima ? Date.parse(ultima.em) : Date.parse(reclamacao.criadaEm)) + 60000).toISOString(), ...extra });
      return hash;
    },
    /** A reclamacao vai para a mediacao: a acao de mensagem passa a ser para o mediador. */
    abrirMediacao(id) {
      const reclamacao = reclamacoes.get(String(id));
      reclamacao.etapa = "dispute";
      reclamacao.acoes = ["send_message_to_mediator"];
    },
    fecharReclamacao(id) {
      reclamacoes.get(String(id)).status = "closed";
    },
    reclamacaoForaDoAr(id, valor = true) {
      reclamacoes.get(String(id)).foraDoAr = valor;
    },
  };
}
