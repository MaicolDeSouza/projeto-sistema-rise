/**
 * A situacao de estoque de um concorrente, numa regra so para a coluna Estoque da aba Concorrentes, a ordem da
 * tabela e a posicao de preco ("2º de 10"). Antes cada um tinha a sua, e eles podiam discordar.
 *
 * `situacao` e o que `consultarSituacaoConcorrentes` devolve por produto coletado: `{ativo, quantidade,
 * estoqueStatus}`. A quantidade manda (zero e sem estoque, mesmo que a loja diga "disponivel"); `ativo` falso e
 * produto que saiu da coleta (`ausenteDesde`).
 *
 * @returns {"em-estoque" | "sem-estoque" | "fora-da-coleta" | "nao-informado"}
 */
export function situacaoDeEstoque(situacao) {
  if (!situacao) return "nao-informado";
  if (situacao.quantidade === 0) return "sem-estoque";
  if (situacao.ativo === false) return "fora-da-coleta";
  if (situacao.quantidade > 0) return "em-estoque";
  if (situacao.estoqueStatus === "OUT_OF_STOCK") return "sem-estoque";
  if (situacao.estoqueStatus === "AVAILABLE" || situacao.estoqueStatus === "IN_STOCK") return "em-estoque";
  return "nao-informado";
}

/** Concorrente que nao vende agora (sem estoque ou fora da coleta): nao conta na posicao de preco. */
export function indisponivel(situacao) {
  const estado = situacaoDeEstoque(situacao);
  return estado === "sem-estoque" || estado === "fora-da-coleta";
}

/** A propria loja vinculada como concorrente (fonte com "4hobby" no nome; a mesma regra da proposta). */
export const DA_PROPRIA_LOJA = /4hobby/i;

/// Ordem dos grupos na tabela: quem vende (ou nao diz) primeiro.
const GRUPO = { "em-estoque": 0, "nao-informado": 0, "sem-estoque": 1, "fora-da-coleta": 2 };

/**
 * A ordem da aba Concorrentes (pedido do dono em 07/10/2026): os SEM ESTOQUE continuam na lista, mas por ultimo, e
 * os que sairam da coleta depois deles. Dentro de cada grupo, do mais barato ao mais caro, sem preco no fim
 * (pedido de 18/09/2026). A 4hobby fica SEMPRE entre os que vendem, pelo preco, mesmo sem estoque (pedido do dono em
 * 23/10/2026: a posicao dela no meio dos concorrentes e o que interessa). Devolve uma lista nova.
 *
 * @param {{preco: number|null, produtoColetadoId: string|null, fonte?: string}[]} lista
 * @param {Record<string, object>} situacoes por produtoColetadoId
 */
export function ordenarConcorrentes(lista, situacoes = {}) {
  const grupo = (item) => grupoDeEstoque(item.fonte, item.produtoColetadoId ? situacoes[item.produtoColetadoId] : null);
  return [...lista].sort((a, b) => grupo(a) - grupo(b) || porPrecoAscendente(a, b));
}

function grupoDeEstoque(fonte, situacao) {
  return DA_PROPRIA_LOJA.test(fonte ?? "") ? 0 : GRUPO[situacaoDeEstoque(situacao)];
}

const TIPO_NA_LISTA = { CONCORRENTE: 0, FORNECEDOR: 1 };

/**
 * A ordem da lista do "$" do Preco venda (pedido do dono em 25/10/2026: "menor preco e lojas sem estoque devem ir para o fim
 * da lista, assim como feito na aba Concorrentes"): a mesma regra da tabela. Os concorrentes vem antes dos fornecedores (o
 * preco de fornecedor e custo, nao preco de venda); dentro de cada tipo, quem vende ou nao diz o estoque primeiro, do mais
 * barato ao mais caro, e os sem estoque por ultimo. O estoque vem em `item.estoque` (`{quantidade, estoqueStatus}`, o que a
 * busca de referencias le do produto coletado). Devolve uma lista nova.
 *
 * @param {{tipo: string, fonte?: string, preco: number|null, estoque?: object|null}[]} lista
 */
export function ordenarPrecosDasReferencias(lista) {
  const tipo = (item) => TIPO_NA_LISTA[item.tipo] ?? 2;
  return [...lista].sort(
    (a, b) => tipo(a) - tipo(b) || grupoDeEstoque(a.fonte, a.estoque) - grupoDeEstoque(b.fonte, b.estoque) || porPrecoAscendente(a, b),
  );
}

function porPrecoAscendente(a, b) {
  if (a.preco == null && b.preco == null) return 0;
  if (a.preco == null) return 1;
  if (b.preco == null) return -1;
  return a.preco - b.preco;
}
