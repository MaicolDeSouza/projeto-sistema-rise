/**
 * Os modelos que o dono pode escolher na janela "Criar descricao" (pedido dele em 14/10/2026, depois de medir cinco
 * modelos na bancada: so o Opus 5.5 e o GPT 6.1 Sol entregam a descricao completa). Sem imports: a janela (navegador) e o
 * servidor leem a mesma lista.
 *
 * O navegador manda so o id, e o servidor o confere aqui (`modeloDaDescricao`): aceitar qualquer texto deixaria a tela
 * pedir um modelo caro ou inexistente.
 */
export const MODELOS_DA_DESCRICAO = [
  { id: "gpt-6.1-sol", nome: "GPT 6.1 Sol" },
  { id: "claude-opus-5-5", nome: "Claude Opus 5.5" },
];

// O GPT 6.1 Sol vem selecionado (pedido do dono em 14/10/2026): entrega a mesma descricao do Opus por ~R$ 0,30 contra R$ 1,15
// na primeira geracao. Ele usa a chave da OpenAI cadastrada em Rise AI > Configuracoes: sem ela a tela diz isso e o dono
// escolhe o Opus.
export const MODELO_PADRAO_DA_DESCRICAO = "gpt-6.1-sol";

/// Modelo da OpenAI (gpt-*, o1, o3...): a chamada vai pela chave da OpenAI, nao pela da Anthropic.
export const ehModeloGpt = (id) => /^(gpt-|o\d)/.test(String(id ?? ""));

/// O id conferido: sem escolha (`undefined` ou vazio) vale o padrao; um dos dois da lista passa; qualquer outra coisa
/// (id desconhecido, objeto) devolve `null`, e quem chama recusa o pedido.
export function modeloDaDescricao(id) {
  if (id === undefined || id === null || id === "") return MODELO_PADRAO_DA_DESCRICAO;
  return MODELOS_DA_DESCRICAO.find((modelo) => modelo.id === id)?.id ?? null;
}
