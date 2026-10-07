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

/// Ordem dos grupos na tabela: quem vende (ou nao diz) primeiro.
const GRUPO = { "em-estoque": 0, "nao-informado": 0, "sem-estoque": 1, "fora-da-coleta": 2 };

/**
 * A ordem da aba Concorrentes (pedido do dono em 07/10/2026): os SEM ESTOQUE continuam na lista, mas por ultimo, e
 * os que sairam da coleta depois deles. Dentro de cada grupo, do mais barato ao mais caro, sem preco no fim
 * (pedido de 18/09/2026). Devolve uma lista nova.
 *
 * @param {{preco: number|null, produtoColetadoId: string|null}[]} lista
 * @param {Record<string, object>} situacoes por produtoColetadoId
 */
export function ordenarConcorrentes(lista, situacoes = {}) {
  const grupo = (item) => GRUPO[situacaoDeEstoque(item.produtoColetadoId ? situacoes[item.produtoColetadoId] : null)];
  return [...lista].sort((a, b) => grupo(a) - grupo(b) || porPrecoAscendente(a, b));
}

function porPrecoAscendente(a, b) {
  if (a.preco == null && b.preco == null) return 0;
  if (a.preco == null) return 1;
  if (b.preco == null) return -1;
  return a.preco - b.preco;
}
