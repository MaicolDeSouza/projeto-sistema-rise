import { cotacaoDoDolar } from "@/lib/cotacaoDolar";

/**
 * Registro dos provedores de IA do Rise AI, dos preços dos modelos de API e do custo de cada chamada.
 *
 * Sem banco e sem rede: a tela de configurações (cliente), o servidor e o teste leem o mesmo arquivo. Provedor novo
 * entra aqui (e ganha um adaptador em `provedores/`); o resto do módulo só conhece o `id`.
 */

/**
 * `endpointPadrao` é uma string quando o endereço não depende de onde o Rise roda; nos provedores locais é
 * `{ pc, vps }`: no PC o LM Studio/Ollama estão em 127.0.0.1, e na VPS o contêiner os alcança pelo túnel reverso em
 * `host.docker.internal` (docker-compose: `extra_hosts`). Gemini usa o endpoint compatível com a OpenAI do Google.
 */
export const PROVEDORES = [
  {
    id: "lmstudio",
    rotulo: "LM Studio",
    precisaDeChave: false,
    compativelOpenAI: true,
    local: true,
    endpointPadrao: { pc: "http://127.0.0.1:1234/v1", vps: "http://host.docker.internal:1234/v1" },
  },
  {
    id: "ollama",
    rotulo: "Ollama",
    precisaDeChave: false,
    compativelOpenAI: true,
    local: true,
    endpointPadrao: { pc: "http://127.0.0.1:11434/v1", vps: "http://host.docker.internal:11434/v1" },
  },
  {
    id: "openai",
    rotulo: "OpenAI",
    precisaDeChave: true,
    compativelOpenAI: true,
    local: false,
    endpointPadrao: "https://api.openai.com/v1",
  },
  {
    id: "anthropic",
    rotulo: "Anthropic",
    precisaDeChave: true,
    compativelOpenAI: false,
    local: false,
    endpointPadrao: "https://api.anthropic.com",
  },
  {
    id: "gemini",
    rotulo: "Google Gemini",
    precisaDeChave: true,
    compativelOpenAI: true,
    local: false,
    endpointPadrao: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
];

/** US$ por 1 milhão de tokens (preços de 06/10/2026). Modelo que não está aqui não tem custo estimado (`null`). */
export const PRECOS_USD_POR_MILHAO = {
  "claude-haiku-5-5": { entrada: 0.1, saida: 0.5 },
  "claude-sonnet-5-5": { entrada: 2, saida: 10 },
  "claude-opus-5-5": { entrada: 4, saida: 20 },
  // GPT 6.1 Sol (13/10/2026, medido na bancada da descricao): US$ 2/10 por milhao. A leitura em cache custa 5% da entrada.
  "gpt-6.1-sol": { entrada: 2, saida: 10, pesoDoCacheLido: 0.05 },
};

/** Modelos que a tela oferece mesmo sem consultar o provedor (os demais vêm de `listarModelos`). */
export const MODELOS_SUGERIDOS = {
  anthropic: ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"],
};

export function provedorPorId(id) {
  return PROVEDORES.find((provedor) => provedor.id === id) ?? null;
}

/**
 * @param {string} id
 * @param {"pc"|"vps"} ambiente
 */
export function endpointPadrao(id, ambiente) {
  const provedor = provedorPorId(id);
  if (!provedor) throw new Error(`Provedor de IA desconhecido: ${id}`);
  const padrao = provedor.endpointPadrao;
  return typeof padrao === "string" ? padrao : (padrao[ambiente] ?? padrao.pc);
}

const arredondar = (valor, casas) => Math.round(valor * 10 ** casas) / 10 ** casas;

/**
 * Custo de uma chamada. Modelo local custa zero; modelo de API sem preço cadastrado devolve `null` (a tela diz "preço
 * não cadastrado" em vez de mostrar zero, que seria mentira).
 *
 * Em reais pela cotação única do sistema (`cotacaoDoDolar`), com 4 casas: `emReais` arredonda ao centavo, e uma
 * resposta de R$ 0,0036 apareceria como R$ 0,00 — justamente o número que o dono quer somar no fim do mês.
 *
 * @returns {{ usd: number, brl: number } | null}
 */
export function custoDaChamada({ provedor, modelo, tokensEntrada = 0, tokensSaida = 0 }) {
  const registro = provedorPorId(provedor);
  if (!registro) return null;
  if (registro.local) return { usd: 0, brl: 0 };

  const preco = PRECOS_USD_POR_MILHAO[modelo];
  if (!preco) return null;

  const usd = arredondar(
    ((Number(tokensEntrada) || 0) / 1e6) * preco.entrada + ((Number(tokensSaida) || 0) / 1e6) * preco.saida,
    6,
  );
  return { usd, brl: arredondar(usd * cotacaoDoDolar().valor, 4) };
}
