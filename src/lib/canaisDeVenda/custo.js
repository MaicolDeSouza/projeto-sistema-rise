/**
 * Custo de um produto da loja, para a margem do anuncio. Funcao pura, sem imports: a
 * tela, as acoes e o teste leem o mesmo arquivo.
 *
 * A ordem e a mesma da foto mensal (`src/lib/coleta/fotos.js`, funcao que fotografa os
 * produtos da loja), senao o anuncio e o historico contariam custos diferentes para o
 * mesmo produto: fornecedor padrao, rascunho do Bling, cadastro.
 */

// `precoCusto` e `custo` chegam do Prisma como Decimal ou texto, e o rascunho do Bling e
// JSON solto. Zero, negativo e lixo valem como "sem custo": custo zero e campo nao
// preenchido, nao produto gratis, e a margem sobre ele sairia infinita.
function valorPositivo(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

/**
 * @param {{
 *   fornecedores?: {padrao?: boolean, precoCusto?: unknown}[],
 *   fornecedorRascunho?: {precoCusto?: unknown} | null,
 *   custo?: unknown,
 * }} produto
 * @returns {{valor: number|null, origem: "fornecedor padrao"|"rascunho do Bling"|"cadastro"|null}}
 */
export function custoDoProduto({ fornecedores, fornecedorRascunho, custo } = {}) {
  // Padrao com custo invalido nao trava a busca: cai para o proximo da ordem, como o
  // COALESCE da foto mensal faz com o custo nulo.
  const doPadrao = (Array.isArray(fornecedores) ? fornecedores : [])
    .filter((fornecedor) => fornecedor?.padrao)
    .map((fornecedor) => valorPositivo(fornecedor.precoCusto))
    .find((valor) => valor !== null);
  if (doPadrao !== undefined) return { valor: doPadrao, origem: "fornecedor padrao" };

  const doRascunho = valorPositivo(fornecedorRascunho?.precoCusto);
  if (doRascunho !== null) return { valor: doRascunho, origem: "rascunho do Bling" };

  const doCadastro = valorPositivo(custo);
  if (doCadastro !== null) return { valor: doCadastro, origem: "cadastro" };

  return { valor: null, origem: null };
}
