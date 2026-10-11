/**
 * O contrato único dos provedores de IA do Rise AI (spec §5.2). Cada adaptador (`openaiCompativel.js`,
 * `anthropic.js`) o implementa, e NADA fora de `provedores/` conhece o formato da OpenAI ou da Anthropic: o laço da
 * conversa só fala o formato neutro abaixo.
 *
 * Só JSDoc e um tipo de erro: sem imports, lido pelos adaptadores, pelo laço, pelo teste e pelo provedor falso.
 *
 * Mensagens neutras (`mensagens` de `conversar`):
 * @typedef {{ papel: "usuario", conteudo: string }} MensagemDoUsuario
 * @typedef {{ papel: "assistente", conteudo: string, chamadas?: { id: string, nome: string, argumentos: object }[], bruto?: unknown }} MensagemDoAssistente
 * @typedef {{ papel: "ferramenta", chamadaId: string, nome: string, conteudo: string }} MensagemDeFerramenta  `conteudo` é JSON
 *
 * Definição de ferramenta: `parametros` é um JSON Schema de objeto.
 * @typedef {{ nome: string, descricao: string, parametros: object }} DefinicaoDeFerramenta
 *
 * O que `conversar` devolve. `malformada` marca a chamada cujos argumentos não são JSON (modelo pequeno errando a
 * ferramenta); o laço conta duas seguidas e vai para a reserva.
 * @typedef {{
 *   texto: string,
 *   chamadasDeFerramenta: { id: string, nome: string, argumentos: object, malformada?: true, bruto?: string }[],
 *   uso: { entrada: number, saida: number, estimado?: true },
 *   motivoParada: "fim" | "ferramenta" | "max_tokens" | "recusa" | "outro",
 *   modelo: string,
 *   bruto?: unknown
 * }} RespostaDoProvedor
 *
 * O provedor:
 * @typedef {{
 *   id: string,
 *   rotulo: string,
 *   endpoint?: string,
 *   listarModelos: () => Promise<{ id: string, nome: string }[]>,
 *   testar: () => Promise<{ ok: boolean, latenciaMs: number, modelos: { id: string, nome: string }[], erro: string | null }>,
 *   conversar: (pedido: {
 *     modelo: string, sistema: string, mensagens: (MensagemDoUsuario | MensagemDoAssistente | MensagemDeFerramenta)[],
 *     ferramentas?: DefinicaoDeFerramenta[], maxTokens: number, temperatura?: number, sinal?: AbortSignal,
 *     aoTexto?: (delta: string) => void
 *   }) => Promise<RespostaDoProvedor>
 * }} Provedor
 */

/**
 * `bruto` é OPACO: o que o adaptador precisa receber de volta, exatamente como o provedor o devolveu, para continuar o
 * laço de ferramentas da MESMA resposta (a Anthropic exige reenviar os blocos de pensamento com a assinatura). O
 * laço da conversa só o copia da resposta para a mensagem do assistente que reenvia; nunca o grava nem o interpreta.
 * Mensagem vinda do banco não tem `bruto`, e o adaptador a reconstrói só com texto e chamadas.
 *
 * Teste de conexão de um adaptador a partir da listagem de modelos: nunca lança (a tela mostra `erro`).
 * @param {() => Promise<{ id: string, nome: string }[]>} listarModelos
 */
export async function testarPorListagem(listarModelos) {
  const inicio = Date.now();
  try {
    const modelos = await listarModelos();
    return { ok: true, latenciaMs: Date.now() - inicio, modelos, erro: null };
  } catch (erro) {
    return { ok: false, latenciaMs: Date.now() - inicio, modelos: [], erro: erro.message };
  }
}

/**
 * `tipo` diz o que fazer: `conexao` (recusou ou ninguém respondeu), `autenticacao` (chave recusada), `limite` (429),
 * `tempo` (estourou o tempo), `resposta` (HTTP de erro ou corpo que não se entende) e, do laço, `ferramenta_malformada`.
 * O laço cai para a reserva por qualquer um deles, desde que nenhum texto da resposta já tenha chegado à tela.
 */
export class ErroDoProvedor extends Error {
  /** @param {string} mensagem @param {{ tipo: string, status?: number | null, causa?: unknown }} detalhes */
  constructor(mensagem, { tipo, status = null, causa = null }) {
    super(mensagem, causa ? { cause: causa } : undefined);
    this.name = "ErroDoProvedor";
    this.tipo = tipo;
    this.status = status;
  }
}

/** O erro de uma resposta HTTP que não é 2xx. `corpo` é o texto (já lido) da resposta, só para a mensagem. */
export function erroDeStatus(status, corpo = "") {
  const trecho = String(corpo ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (status === 401 || status === 403) {
    return new ErroDoProvedor(`O provedor recusou a chave (HTTP ${status}).`, { tipo: "autenticacao", status });
  }
  if (status === 429) {
    return new ErroDoProvedor("Limite de uso do provedor atingido (HTTP 429).", { tipo: "limite", status });
  }
  return new ErroDoProvedor(`O provedor devolveu erro ${status}${trecho ? `: ${trecho}` : "."}`, { tipo: "resposta", status });
}
