import { MODELO_IA, SISTEMA_IA, mensagemDeErroIA, obterClienteIA, registrarIA } from "./anuncio";

/**
 * Chamada a IA COM pesquisa na internet (ferramenta `web_search` do proprio servidor da
 * Anthropic), para o canal Mercado Livre: termos de busca da categoria e a ficha tecnica quando o
 * dono marca "pesquisar na internet". Custa mais que a chamada comum: so roda a pedido.
 *
 * A resposta estruturada (`output_config.format`) nao e usada aqui: a pesquisa traz citacoes, e o
 * guia da API nao garante as duas juntas. O pedido termina com o formato JSON esperado, e
 * `jsonDoTexto` acha o objeto no fim do texto.
 */

// Versao com filtro dinamico, a dos modelos Opus 5 em diante.
const PESQUISA = { type: "web_search_20260209", name: "web_search", max_uses: 3 };

// Ferramenta do servidor pode pausar a resposta (`pause_turn`): manda de volta para continuar.
const MAXIMO_DE_CONTINUACOES = 3;

/** O objeto JSON da resposta: o texto inteiro, ou o trecho entre a primeira `{` e a ultima `}`. */
export function jsonDoTexto(texto) {
  const bruto = String(texto ?? "").trim();
  try {
    return JSON.parse(bruto);
  } catch {
    const inicio = bruto.indexOf("{");
    const fim = bruto.lastIndexOf("}");
    if (inicio < 0 || fim <= inicio) return null;
    try {
      return JSON.parse(bruto.slice(inicio, fim + 1));
    } catch {
      return null;
    }
  }
}

/**
 * Faz o pedido com a pesquisa liberada e devolve o objeto JSON da resposta. Lanca `Error` com o
 * texto para a tela quando a IA recusa, corta a resposta ou devolve outro formato.
 */
export async function chamarComPesquisa({ tarefa, pedido }) {
  const cliente = obterClienteIA();
  const inicio = Date.now();
  const mensagens = [{ role: "user", content: pedido }];

  let resposta;
  try {
    for (let volta = 0; volta <= MAXIMO_DE_CONTINUACOES; volta++) {
      resposta = await cliente.beta.messages.create({
        model: MODELO_IA,
        max_tokens: 16000,
        // Se o modelo recusar, outro responde na mesma chamada (como em `chamar`).
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SISTEMA_IA,
        tools: [PESQUISA],
        messages: mensagens,
      });
      if (resposta.stop_reason !== "pause_turn") break;
      mensagens.push({ role: "assistant", content: resposta.content });
    }
  } catch (erro) {
    await registrarIA({ tarefa, referencias: 0, inicio, erro });
    throw new Error(mensagemDeErroIA(erro));
  }

  await registrarIA({ tarefa, referencias: 0, inicio, resposta });

  if (resposta.stop_reason === "refusal") throw new Error("A IA recusou este pedido. Tente sem a pesquisa na internet.");
  if (resposta.stop_reason === "max_tokens") throw new Error("A resposta da IA veio incompleta. Tente de novo.");
  if (resposta.stop_reason === "pause_turn") throw new Error("A pesquisa na internet não terminou. Tente de novo.");

  const texto = resposta.content
    .filter((bloco) => bloco.type === "text")
    .map((bloco) => bloco.text)
    .join("");
  const json = jsonDoTexto(texto);
  if (!json) throw new Error("A IA devolveu a pesquisa em formato inesperado. Tente de novo.");
  return json;
}
