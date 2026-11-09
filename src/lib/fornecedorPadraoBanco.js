import { prisma } from "@/lib/db";
import { rascunhoVale } from "@/lib/fornecedorRascunho";

/**
 * O vinculo unico do produto vira o fornecedor PADRAO no banco (pedido do dono em 08/11/2026; a regra pura mora em
 * `fornecedorPadrao.js`). Para os caminhos que criam ou apagam vinculo fora do Salvar da tela: a lupa do Claude
 * (`marcarReferencias`), o AliExpress no Compras, a lixeira pela acao do servidor e a correcao dos produtos antigos.
 *
 * So marca quando a aba tambem mostraria UM fornecedor: com o fornecedor do Bling em rascunho valendo, a aba mostra
 * dois (o rascunho e o vinculo), e o rascunho continua sendo o padrao ate o dono salvar. O custo do produto passa a ser o
 * do vinculo, como faz o Salvar (`recalcularCusto`), menos no produto com pecas proprias, cujo custo e o das pecas.
 *
 * @param {string} produtoId
 * @param {typeof prisma} [cliente] o `tx` de uma transacao, quando quem chama esta numa
 * @returns {Promise<boolean>} se marcou
 */
export async function garantirPadraoDoUnico(produtoId, cliente = prisma) {
  const produto = await cliente.produto.findUnique({
    where: { id: produtoId },
    select: {
      pecasProprias: true,
      fornecedorRascunho: true,
      fornecedores: { select: { id: true, padrao: true, precoCusto: true } },
    },
  });
  if (!produto || produto.fornecedores.length !== 1) return false;
  const [unico] = produto.fornecedores;
  if (unico.padrao || rascunhoVale(produto.fornecedores, produto.fornecedorRascunho)) return false;

  await cliente.produtoFornecedor.update({ where: { id: unico.id }, data: { padrao: true } });
  // Vinculo sem custo (o AliExpress cria assim; o custo chega depois, com o pedido) nao apaga o custo que o produto tem.
  if (!produto.pecasProprias && unico.precoCusto != null) {
    await cliente.produto.update({ where: { id: produtoId }, data: { custo: unico.precoCusto } });
  }
  return true;
}
