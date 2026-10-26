"use server";

import { revalidatePath } from "next/cache";

import { negarSemAcesso, podeAgora } from "@/lib/acessos/servidor";
import { adicionarAoPedido, fornecedoresParaCompra } from "@/lib/compras/banco";

/**
 * Server Actions do modulo Compras. Finas: conferem o acesso na 1a linha, chamam a lib e revalidam. O preco de compra
 * e `dado.custo`: sem ele o servidor corta os precos antes de a tela os receber.
 */

/** Os fornecedores de um produto para o popup da lista do minimo. */
export async function fornecedoresParaCompraAcao(produtoId) {
  const negado = await negarSemAcesso("tela.compras.estoqueMinimo", "ver");
  if (negado) return negado;
  if (typeof produtoId !== "string" || !produtoId) return { ok: false, erro: "Produto inválido." };
  try {
    const dados = await fornecedoresParaCompra(produtoId);
    if (!dados) return { ok: false, erro: "Produto não encontrado. Ele pode ter sido excluído." };
    if (!(await podeAgora("dado.custo", "ver"))) {
      dados.linhas = dados.linhas.map((linha) => ({ ...linha, precoUnitario: null, ipiPercentual: null }));
    }
    return { ok: true, ...dados };
  } catch (erro) {
    return { ok: false, erro: `Não foi possível ler os fornecedores: ${erro.message}` };
  }
}

/** "Adicionar ao pedido": entra no rascunho do fornecedor (ou num novo). */
export async function adicionarAoPedidoAcao(dados) {
  const negado = await negarSemAcesso("tela.compras.pedidos", "editar");
  if (negado) return negado;
  const resultado = await adicionarAoPedido({
    produtoId: String(dados?.produtoId ?? ""),
    vinculoId: String(dados?.vinculoId ?? ""),
    quantidade: dados?.quantidade,
  });
  if (resultado.ok) revalidatePath("/compras", "layout");
  return resultado;
}
