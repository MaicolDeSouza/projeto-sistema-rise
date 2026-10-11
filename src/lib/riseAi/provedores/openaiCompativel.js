import { ErroDoProvedor, erroDeStatus, testarPorListagem } from "./contrato";

/**
 * Adaptador para a API "chat/completions" da OpenAI e de tudo o que fala igual: LM Studio, Ollama, OpenAI e o Gemini
 * pelo endpoint compatível do Google. Usa `fetch` direto (sem SDK): o Rise já tem o da Anthropic, e aqui o formato é
 * simples e idêntico nos quatro. O endereço é configuração do administrador, nunca texto de terceiro — por isso NÃO
 * passa pelo filtro de rede pública (o túnel até o PC é um endereço privado de propósito).
 */

/** Formato neutro -> formato da OpenAI. O sistema abre a lista; resultado de ferramenta vira `role: "tool"`. */
export function mensagensParaOpenAI(sistema, mensagens) {
  const lista = [{ role: "system", content: sistema }];
  for (const mensagem of mensagens) {
    if (mensagem.papel === "usuario") {
      lista.push({ role: "user", content: mensagem.conteudo });
    } else if (mensagem.papel === "assistente") {
      const item = { role: "assistant", content: mensagem.conteudo ?? "" };
      if (mensagem.chamadas?.length) {
        item.tool_calls = mensagem.chamadas.map((chamada) => ({
          id: chamada.id,
          type: "function",
          function: { name: chamada.nome, arguments: JSON.stringify(chamada.argumentos ?? {}) },
        }));
      }
      lista.push(item);
    } else if (mensagem.papel === "ferramenta") {
      lista.push({ role: "tool", tool_call_id: mensagem.chamadaId, content: mensagem.conteudo });
    }
  }
  return lista;
}

export function ferramentasParaOpenAI(ferramentas) {
  return ferramentas.map((ferramenta) => ({
    type: "function",
    function: { name: ferramenta.nome, description: ferramenta.descricao, parameters: ferramenta.parametros },
  }));
}

const MOTIVOS = { stop: "fim", tool_calls: "ferramenta", function_call: "ferramenta", length: "max_tokens", content_filter: "recusa" };

const ehAbortError = (erro) => erro?.name === "AbortError" || erro?.name === "TimeoutError";

/** Estimativa quando o servidor não devolve `usage` (alguns locais não devolvem): 1 token a cada 4 caracteres. */
const estimarTokens = (caracteres) => Math.ceil(caracteres / 4);

/** Junta as chamadas de ferramenta (que chegam em pedaços, por `index`) já com os argumentos lidos como JSON. */
function chamadasProntas(porIndice) {
  return [...porIndice.entries()]
    .sort(([a], [b]) => a - b)
    .map(([indice, chamada]) => {
      const id = chamada.id || `chamada_${indice}`;
      const bruto = chamada.argumentos;
      if (!bruto.trim()) return { id, nome: chamada.nome, argumentos: {} };
      try {
        const argumentos = JSON.parse(bruto);
        if (argumentos && typeof argumentos === "object" && !Array.isArray(argumentos)) {
          return { id, nome: chamada.nome, argumentos };
        }
      } catch {
        // cai na malformada abaixo
      }
      return { id, nome: chamada.nome, argumentos: {}, malformada: true, bruto };
    });
}

/**
 * @param {{ id: string, rotulo?: string, endpoint: string, chave?: string | null, fetchImpl?: typeof fetch }} configuracao
 * @returns {import("./contrato").Provedor}
 */
export function criarProvedorOpenAICompativel({ id, rotulo = id, endpoint, chave = null, fetchImpl = fetch }) {
  const base = String(endpoint).replace(/\/+$/, "");

  const cabecalhos = () => {
    const lista = { "Content-Type": "application/json" };
    if (chave) lista.Authorization = `Bearer ${chave}`;
    return lista;
  };

  /** Faz o pedido; qualquer falha de rede ou de HTTP vira `ErroDoProvedor` com o `tipo` certo. */
  async function pedir(caminho, init) {
    let resposta;
    try {
      resposta = await fetchImpl(`${base}${caminho}`, init);
    } catch (erro) {
      if (ehAbortError(erro) || init.signal?.aborted) {
        throw new ErroDoProvedor(`${rotulo} não respondeu a tempo.`, { tipo: "tempo", causa: erro });
      }
      throw new ErroDoProvedor(`Sem conexão com ${rotulo} (${base}).`, { tipo: "conexao", causa: erro });
    }
    if (!resposta.ok) {
      let corpo = "";
      try {
        corpo = await resposta.text();
      } catch {
        // a mensagem fica só com o status
      }
      throw erroDeStatus(resposta.status, corpo);
    }
    return resposta;
  }

  async function listarModelos() {
    const resposta = await pedir("/models", { method: "GET", headers: cabecalhos() });
    let dados;
    try {
      dados = await resposta.json();
    } catch (erro) {
      throw new ErroDoProvedor(`${rotulo} devolveu a lista de modelos em formato desconhecido.`, { tipo: "resposta", causa: erro });
    }
    const lista = Array.isArray(dados?.data) ? dados.data : Array.isArray(dados) ? dados : [];
    return lista.filter((modelo) => modelo?.id).map((modelo) => ({ id: String(modelo.id), nome: String(modelo.id) }));
  }

  const testar = () => testarPorListagem(listarModelos);

  async function conversar({ modelo, sistema, mensagens, ferramentas = [], maxTokens, temperatura = 0.2, sinal, aoTexto = () => {} }) {
    const corpo = {
      model: modelo,
      messages: mensagensParaOpenAI(sistema, mensagens),
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: maxTokens,
      temperature: temperatura,
    };
    if (ferramentas.length) {
      corpo.tools = ferramentasParaOpenAI(ferramentas);
      corpo.tool_choice = "auto";
    }
    const caracteresDeEntrada = JSON.stringify(corpo.messages).length + JSON.stringify(corpo.tools ?? []).length;

    const resposta = await pedir("/chat/completions", { method: "POST", headers: cabecalhos(), body: JSON.stringify(corpo), signal: sinal });

    let texto = "";
    const chamadas = new Map();
    let uso = null;
    let motivo = null;
    let modeloDaResposta = modelo;

    const entregar = (delta) => {
      if (!delta) return;
      texto += delta;
      aoTexto(delta);
    };
    const juntarChamadas = (lista) => {
      for (const parte of lista ?? []) {
        const indice = Number.isInteger(parte.index) ? parte.index : chamadas.size;
        const atual = chamadas.get(indice) ?? { id: "", nome: "", argumentos: "" };
        if (parte.id) atual.id = parte.id;
        if (parte.function?.name) atual.nome += parte.function.name;
        if (typeof parte.function?.arguments === "string") atual.argumentos += parte.function.arguments;
        chamadas.set(indice, atual);
      }
    };
    const lerUso = (dados) => {
      if (dados?.usage) uso = { entrada: Number(dados.usage.prompt_tokens) || 0, saida: Number(dados.usage.completion_tokens) || 0 };
    };

    try {
      if ((resposta.headers.get("content-type") ?? "").includes("json")) {
        // Servidor que ignorou `stream: true` e mandou a resposta inteira.
        const dados = await resposta.json();
        const escolha = dados?.choices?.[0];
        entregar(escolha?.message?.content);
        juntarChamadas(escolha?.message?.tool_calls?.map((chamada, indice) => ({ ...chamada, index: indice })));
        motivo = escolha?.finish_reason ?? null;
        modeloDaResposta = dados?.model ?? modelo;
        lerUso(dados);
      } else {
        const leitor = resposta.body.getReader();
        const decodificador = new TextDecoder();
        let pendente = "";
        let terminou = false;
        const tratarLinha = (linha) => {
          const limpa = linha.trim();
          if (!limpa.startsWith("data:")) return;
          const carga = limpa.slice(5).trim();
          if (carga === "[DONE]") {
            terminou = true;
            return;
          }
          let dados;
          try {
            dados = JSON.parse(carga);
          } catch {
            return; // linha que nao e JSON (comentario, keep-alive): ignora
          }
          if (dados?.model) modeloDaResposta = dados.model;
          lerUso(dados);
          const escolha = dados?.choices?.[0];
          if (!escolha) return;
          entregar(escolha.delta?.content);
          juntarChamadas(escolha.delta?.tool_calls);
          if (escolha.finish_reason) motivo = escolha.finish_reason;
        };

        while (!terminou) {
          const { done, value } = await leitor.read();
          if (done) break;
          // `stream: true`: um caractere acentuado partido entre dois pedacos de rede nao vira lixo.
          pendente += decodificador.decode(value, { stream: true });
          const linhas = pendente.split("\n");
          pendente = linhas.pop();
          for (const linha of linhas) tratarLinha(linha);
        }
        pendente += decodificador.decode();
        if (pendente) tratarLinha(pendente);
        leitor.cancel().catch(() => {});
      }
    } catch (erro) {
      if (erro instanceof ErroDoProvedor) throw erro;
      if (ehAbortError(erro) || sinal?.aborted) {
        throw new ErroDoProvedor(`${rotulo} não terminou a resposta a tempo.`, { tipo: "tempo", causa: erro });
      }
      throw new ErroDoProvedor(`A conexão com ${rotulo} caiu no meio da resposta.`, { tipo: "conexao", causa: erro });
    }

    const chamadasDeFerramenta = chamadasProntas(chamadas);
    const caracteresDeSaida = texto.length + chamadasDeFerramenta.reduce((soma, chamada) => soma + (chamada.bruto ?? JSON.stringify(chamada.argumentos)).length, 0);
    return {
      texto,
      chamadasDeFerramenta,
      uso: uso ?? { entrada: estimarTokens(caracteresDeEntrada), saida: estimarTokens(caracteresDeSaida), estimado: true },
      motivoParada: MOTIVOS[motivo] ?? (chamadasDeFerramenta.length ? "ferramenta" : motivo ? "outro" : "fim"),
      modelo: modeloDaResposta,
    };
  }

  return { id, rotulo, endpoint: base, listarModelos, testar, conversar };
}
