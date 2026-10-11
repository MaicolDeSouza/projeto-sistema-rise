import { provedorPorId } from "../modelos";
import { criarProvedorOpenAICompativel } from "./openaiCompativel";

/**
 * Cria o adaptador do provedor `id`. Os compatíveis com a OpenAI (LM Studio, Ollama, OpenAI, Gemini) compartilham o
 * adaptador; a Anthropic tem o dela. Provedor novo = um adaptador novo + uma linha em `modelos.js`.
 *
 * @param {string} id
 * @param {{ endpoint: string, chave?: string | null, fetchImpl?: typeof fetch, cliente?: unknown }} opcoes
 * @returns {import("./contrato").Provedor}
 */
export function criarProvedor(id, { endpoint, chave = null, fetchImpl, cliente } = {}) {
  const registro = provedorPorId(id);
  if (!registro) throw new Error(`Provedor de IA desconhecido: ${id}`);
  if (registro.compativelOpenAI) {
    return criarProvedorOpenAICompativel({ id, rotulo: registro.rotulo, endpoint, chave, fetchImpl });
  }
  // `cliente` so serve aos adaptadores com SDK (Anthropic, na Tarefa 6).
  void cliente;
  throw new Error(`O adaptador do provedor ${registro.rotulo} ainda não está ligado.`);
}
