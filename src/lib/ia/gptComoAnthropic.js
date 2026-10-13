/**
 * Faz a `chamar` da descricao (que fala o formato da API Messages da Anthropic) conversar com a OpenAI, sem mudar o resto
 * do Rise: o pedido vira uma chamada a API Chat Completions e a resposta volta montada como uma Message da Anthropic, com
 * o cache e o raciocinio separados no `usage` (por isso o registro e a soma do gasto nao percebem a troca).
 *
 * Nasceu na bancada (13/10/2026) e virou parte do Rise quando o dono escolheu o GPT 6.1 Sol como segundo modelo da
 * descricao (14/10/2026). Como: o cliente da Anthropic aceita um `fetch` proprio, entao so o cliente criado para um
 * modelo GPT recebe este (`criarFetchDaOpenAI`); o `fetch` global e o cliente da Anthropic nao mudam. O prompt vai na
 * mensagem `system`, o pedido na `user`, o JSON estrito em `response_format` e o effort em `reasoning_effort`.
 *
 * Por que Chat Completions e nao Responses: a chave da OpenAI cadastrada no Rise e restrita, e a API Responses a recusou
 * (401, falta o escopo `api.responses.write`).
 */

/** Modelos que aceitam `reasoning_effort` (o gpt-4.1 e o gpt-4o nao: a API recusa o campo). */
const ACEITA_RACIOCINIO = /^(gpt-[56]|o\d)/;

const textoDos = (conteudo) =>
  typeof conteudo === "string"
    ? conteudo
    : (Array.isArray(conteudo) ? conteudo : []).map((bloco) => bloco?.text ?? "").filter(Boolean).join("\n\n");

/** O pedido no formato Anthropic Messages -> o corpo da API Chat Completions da OpenAI. */
export function paraChatDaOpenAI(corpo) {
  const mensagens = [{ role: "system", content: textoDos(corpo.system) }];
  for (const mensagem of corpo.messages ?? []) mensagens.push({ role: mensagem.role ?? "user", content: textoDos(mensagem.content) });
  const pedido = { model: corpo.model, messages: mensagens, max_completion_tokens: corpo.max_tokens, store: false };
  const formato = corpo.output_config?.format;
  if (formato?.type === "json_schema") {
    pedido.response_format = { type: "json_schema", json_schema: { name: "resposta", strict: true, schema: formato.schema } };
  }
  const esforco = corpo.output_config?.effort;
  if (esforco && ACEITA_RACIOCINIO.test(corpo.model)) pedido.reasoning_effort = esforco;
  return pedido;
}

/**
 * A resposta da API Chat Completions -> uma Message da Anthropic (texto, motivo da parada e uso). O `model` devolvido e o
 * PEDIDO, e nao o nome datado que a OpenAI manda de volta: e por ele que se acha o preco do modelo.
 */
export function paraMensagemDaAnthropic(resposta, modeloPedido) {
  const escolha = resposta.choices?.[0] ?? {};
  const mensagem = escolha.message ?? {};
  const uso = resposta.usage ?? {};
  const emCache = uso.prompt_tokens_details?.cached_tokens ?? 0;
  return {
    id: resposta.id,
    type: "message",
    role: "assistant",
    model: modeloPedido ?? resposta.model,
    content: [{ type: "text", text: mensagem.content ?? "" }],
    stop_reason: mensagem.refusal ? "refusal" : escolha.finish_reason === "length" ? "max_tokens" : "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: (uso.prompt_tokens ?? 0) - emCache,
      cache_read_input_tokens: emCache,
      cache_creation_input_tokens: 0,
      output_tokens: uso.completion_tokens ?? 0,
      output_tokens_details: { thinking_tokens: uso.completion_tokens_details?.reasoning_tokens ?? 0 },
    },
  };
}

/**
 * O `fetch` para o cliente da Anthropic: o que o SDK manda para `/v1/messages` vai para a OpenAI. Qualquer outro endereco
 * passa direto. `obterChave` devolve a chave da OpenAI (nunca e impressa nem gravada).
 */
export function criarFetchDaOpenAI({ obterChave, fetchOriginal = globalThis.fetch }) {
  return async (entrada, opcoes) => {
    const url = String(entrada?.url ?? entrada);
    if (!/api\.anthropic\.com\/v1\/messages/.test(url)) return fetchOriginal(entrada, opcoes);

    const corpo = JSON.parse(typeof opcoes?.body === "string" ? opcoes.body : "{}");
    const chave = await obterChave();
    if (!chave) throw new Error("Sem chave da OpenAI: cadastre em Rise AI > Configurações.");
    const resposta = await fetchOriginal("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${chave}` },
      body: JSON.stringify(paraChatDaOpenAI(corpo)),
      signal: opcoes?.signal,
    });
    const json = await resposta.json();
    if (!resposta.ok) {
      const erro = { type: "error", error: { type: "invalid_request_error", message: json?.error?.message ?? `OpenAI HTTP ${resposta.status}` } };
      return new Response(JSON.stringify(erro), { status: resposta.status, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify(paraMensagemDaAnthropic(json, corpo.model)), {
      status: 200,
      headers: { "content-type": "application/json", "request-id": json.id ?? "req_openai" },
    });
  };
}
