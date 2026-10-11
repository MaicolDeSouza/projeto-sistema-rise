import { provedorPorId } from "../modelos";
import { criarProvedorAnthropic } from "./anthropic";
import { criarProvedorOpenAICompativel } from "./openaiCompativel";

/**
 * Cria o adaptador do provedor `id`. Os compatíveis com a OpenAI (LM Studio, Ollama, OpenAI, Gemini) compartilham o
 * adaptador; a Anthropic tem o dela. Provedor novo = um adaptador novo + uma linha em `modelos.js`.
 *
 * `cliente` só o teste usa (um SDK falso para os adaptadores que têm SDK). Sem chave, o adaptador da Anthropic
 * lança um `ErroDoProvedor` de autenticação com o aviso do que fazer.
 *
 * @param {string} id
 * @param {{ endpoint?: string, chave?: string | null, fetchImpl?: typeof fetch, cliente?: unknown }} opcoes
 * @returns {import("./contrato").Provedor}
 */
export function criarProvedor(id, { endpoint, chave = null, fetchImpl, cliente } = {}) {
  const registro = provedorPorId(id);
  if (!registro) throw new Error(`Provedor de IA desconhecido: ${id}`);
  if (registro.compativelOpenAI) {
    return criarProvedorOpenAICompativel({ id, rotulo: registro.rotulo, endpoint, chave, fetchImpl });
  }
  if (id === "anthropic") return criarProvedorAnthropic({ chave, cliente });
  throw new Error(`O adaptador do provedor ${registro.rotulo} ainda não existe.`);
}
