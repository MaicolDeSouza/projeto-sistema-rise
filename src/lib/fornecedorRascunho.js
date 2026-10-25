/**
 * O fornecedor que veio da importacao do Bling (`Produto.fornecedorRascunho`) VALE enquanto o produto nao tem fornecedor
 * PADRAO de verdade (pedido do dono em 25/10/2026). Ate ali valia so enquanto o produto nao tinha NENHUM vinculo, e a
 * ferramenta `marcarReferencias` do MCP, ao vincular um fornecedor que nao e padrao, escondia o rascunho da aba (e o custo
 * dele): a SAMIORE Store do 170113, que nem cadastro tem. Linha padrao com preco vazio continua substituindo o rascunho.
 *
 * @param {{ padrao?: boolean }[] | null | undefined} fornecedores os vinculos de verdade do produto
 * @param {{ nome?: string } | null | undefined} rascunho
 */
export function rascunhoVale(fornecedores, rascunho) {
  return Boolean(rascunho?.nome) && !(fornecedores ?? []).some((fornecedor) => fornecedor?.padrao);
}

/**
 * A lista que a aba Fornecedores mostra (e o clone leva): o rascunho do Bling na frente, como padrao, seguido dos
 * vinculos de verdade (nenhum deles padrao, senao o rascunho nao valeria). `id` e fixo (ver FormularioProduto.jsx).
 */
export function fornecedoresComRascunho(fornecedores, rascunho, id = "bling-rascunho") {
  const lista = fornecedores ?? [];
  if (!rascunhoVale(lista, rascunho)) return lista;
  return [
    {
      id,
      nome: rascunho.nome,
      descricao: rascunho.descricao ?? null,
      codigo: rascunho.codigo ?? null,
      precoCusto: rascunho.precoCusto ?? null,
      // O Bling nao separa um "link" proprio — o que ele chama de "Descricao no fornecedor" e, na pratica, esse link (ver
      // Produto.fornecedorRascunho); mora em `descricao`, nao aqui.
      link: null,
      padrao: true,
    },
    ...lista,
  ];
}
