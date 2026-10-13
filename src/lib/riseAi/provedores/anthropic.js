import Anthropic from "@anthropic-ai/sdk";

import { MODELOS_SUGERIDOS } from "../modelos";
import { ErroDoProvedor, MOTIVO_PARADA, testarPorListagem } from "./contrato";

/**
 * Adaptador da Anthropic pelo SDK oficial (o mesmo que o `src/lib/ia/anuncio.js` usa nos anúncios).
 *
 * Endereço FIXO em https://api.anthropic.com: o SDK também lê `ANTHROPIC_BASE_URL` do ambiente, e nesta máquina essa
 * variável existe (vem de outras ferramentas). Sem fixar, a chave da loja seguiria para o servidor que estivesse nela.
 * Por isso o endpoint da tela de configurações não vale para este provedor.
 */

const ENDERECO = "https://api.anthropic.com";

const MOTIVOS = { end_turn: "fim", stop_sequence: "fim", tool_use: "ferramenta", max_tokens: "max_tokens", refusal: "recusa" };

/**
 * O erro do SDK vira `ErroDoProvedor` com o `tipo` que o laço da conversa entende. `sinal` é o do pedido: se o aborto veio
 * do botão Parar (`sinal.reason`), o tipo é `interrompida`, e não `tempo`.
 */
function traduzirErro(erro, sinal = null) {
  if (erro instanceof ErroDoProvedor) return erro;
  if (sinal?.aborted && sinal.reason === MOTIVO_PARADA) {
    return new ErroDoProvedor("A resposta foi interrompida.", { tipo: "interrompida", causa: erro });
  }
  // O timeout é um APIConnectionError: precisa vir antes do teste de conexão.
  if (erro instanceof Anthropic.APIUserAbortError || erro instanceof Anthropic.APIConnectionTimeoutError || erro?.name === "AbortError") {
    return new ErroDoProvedor("A Anthropic não respondeu a tempo.", { tipo: "tempo", causa: erro });
  }
  if (erro instanceof Anthropic.AuthenticationError || erro instanceof Anthropic.PermissionDeniedError) {
    return new ErroDoProvedor("A chave da Anthropic foi recusada. Confira em Configurações.", { tipo: "autenticacao", status: erro.status, causa: erro });
  }
  if (erro instanceof Anthropic.RateLimitError) {
    return new ErroDoProvedor("Limite de uso da Anthropic atingido. Tente de novo em instantes.", { tipo: "limite", status: 429, causa: erro });
  }
  if (erro instanceof Anthropic.APIConnectionError) {
    return new ErroDoProvedor("Sem conexão com a Anthropic.", { tipo: "conexao", causa: erro });
  }
  if (erro instanceof Anthropic.APIError) {
    const codigo = erro.status ? ` ${erro.status}` : "";
    return new ErroDoProvedor(`A Anthropic devolveu erro${codigo}: ${erro.message}`, {
      tipo: "resposta",
      status: erro.status ?? null,
      causa: erro,
    });
  }
  return new ErroDoProvedor(erro?.message ?? "Falha desconhecida ao falar com a Anthropic.", { tipo: "resposta", causa: erro });
}

/**
 * Formato neutro -> formato da Anthropic. Resultados de ferramenta seguidos viram UMA mensagem de usuário (a API
 * exige todos os `tool_result` da rodada juntos). O assistente com `bruto` volta exatamente como a API o devolveu.
 */
function mensagensParaAnthropic(mensagens) {
  const lista = [];
  for (const mensagem of mensagens) {
    if (mensagem.papel === "usuario") {
      lista.push({ role: "user", content: mensagem.conteudo });
    } else if (mensagem.papel === "assistente") {
      if (mensagem.bruto) {
        lista.push({ role: "assistant", content: mensagem.bruto });
        continue;
      }
      const blocos = [];
      if (mensagem.conteudo) blocos.push({ type: "text", text: mensagem.conteudo });
      for (const chamada of mensagem.chamadas ?? []) {
        blocos.push({ type: "tool_use", id: chamada.id, name: chamada.nome, input: chamada.argumentos ?? {} });
      }
      if (blocos.length) lista.push({ role: "assistant", content: blocos });
    } else if (mensagem.papel === "ferramenta") {
      const resultado = { type: "tool_result", tool_use_id: mensagem.chamadaId, content: mensagem.conteudo };
      const anterior = lista.at(-1);
      if (anterior?.role === "user" && Array.isArray(anterior.content) && anterior.content.every((bloco) => bloco.type === "tool_result")) {
        anterior.content.push(resultado);
      } else {
        lista.push({ role: "user", content: [resultado] });
      }
    }
  }
  return lista;
}

/**
 * @param {{ chave?: string | null, cliente?: any }} configuracao  `cliente` só o teste passa (um SDK falso).
 * @returns {import("./contrato").Provedor}
 */
export function criarProvedorAnthropic({ chave = null, cliente = null }) {
  if (!cliente && !chave) {
    throw new ErroDoProvedor("Anthropic: cadastre a chave em Configurações (ou ANTHROPIC_API_KEY no .env).", { tipo: "autenticacao" });
  }
  // Uma nova tentativa para erro passageiro (5xx, conexão); mais que isso gastaria o tempo que o laço dá ao padrão.
  const sdk = cliente ?? new Anthropic({ apiKey: chave, baseURL: ENDERECO, maxRetries: 1 });

  async function listarModelos() {
    let ids = [];
    try {
      const pagina = await sdk.models.list({ limit: 100 });
      ids = (pagina.data ?? []).map((modelo) => String(modelo.id)).filter((id) => id.startsWith("claude-"));
    } catch (erro) {
      throw traduzirErro(erro);
    }
    return [...new Set([...ids, ...MODELOS_SUGERIDOS.anthropic])].map((id) => ({ id, nome: id }));
  }

  async function conversar({ modelo, sistema, mensagens, ferramentas = [], maxTokens, sinal, aoTexto = () => {} }) {
    // Sem `temperature`: os modelos novos recusam valor diferente do padrão. `effort: "low"`: respostas curtas de
    // atendimento, e o pensamento barato mantém o primeiro token rápido.
    const parametros = {
      model: modelo,
      max_tokens: maxTokens,
      system: sistema,
      messages: mensagensParaAnthropic(mensagens),
      output_config: { effort: "low" },
    };
    if (ferramentas.length) {
      parametros.tools = ferramentas.map((ferramenta) => ({
        name: ferramenta.nome,
        description: ferramenta.descricao,
        input_schema: ferramenta.parametros,
      }));
    }

    let final;
    try {
      const fluxo = sdk.messages.stream(parametros, { signal: sinal });
      fluxo.on("text", (delta) => aoTexto(delta));
      final = await fluxo.finalMessage();
    } catch (erro) {
      throw traduzirErro(erro, sinal);
    }

    const blocos = final.content ?? [];
    return {
      texto: blocos.filter((bloco) => bloco.type === "text").map((bloco) => bloco.text).join(""),
      chamadasDeFerramenta: blocos
        .filter((bloco) => bloco.type === "tool_use")
        .map((bloco) => ({ id: bloco.id, nome: bloco.name, argumentos: bloco.input ?? {} })),
      uso: { entrada: final.usage?.input_tokens ?? 0, saida: final.usage?.output_tokens ?? 0 },
      motivoParada: MOTIVOS[final.stop_reason] ?? "outro",
      modelo: final.model ?? modelo,
      bruto: blocos,
    };
  }

  return { id: "anthropic", rotulo: "Anthropic", endpoint: ENDERECO, listarModelos, testar: () => testarPorListagem(listarModelos), conversar };
}
