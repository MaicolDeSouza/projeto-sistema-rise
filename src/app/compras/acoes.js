"use server";

import { revalidatePath } from "next/cache";

import { negarSemAcesso, podeAgora } from "@/lib/acessos/servidor";
import {
  adicionarAoPedido,
  adicionarItem,
  buscarItensParaPedido,
  criarPedido,
  fornecedoresParaCompra,
  lerPedido,
  mudarStatus,
  salvarPedido,
} from "@/lib/compras/banco";
import { semPrecos, semPrecosNaEntrada } from "@/lib/compras/projecao";

const revalidar = () => revalidatePath("/compras", "layout");

/** O pedido como a pessoa pode ve-lo: sem `dado.custo`, sem precos. */
async function pedidoParaQuemVe(id) {
  const pedido = await lerPedido(id);
  return (await podeAgora("dado.custo", "ver")) ? pedido : semPrecos(pedido);
}

/** Novo pedido para um fornecedor (ou o rascunho que ele ja tem). */
export async function criarPedidoAcao(fornecedorId) {
  const negado = await negarSemAcesso("tela.compras.pedidos", "editar");
  if (negado) return negado;
  const resultado = await criarPedido(fornecedorId);
  if (resultado.ok) revalidar();
  return resultado;
}

export async function salvarPedidoAcao(id, entrada) {
  const negado = await negarSemAcesso("tela.compras.pedidos", "editar");
  if (negado) return negado;
  const dados = (await podeAgora("dado.custo", "ver")) ? entrada : semPrecosNaEntrada(entrada);
  const resultado = await salvarPedido(String(id ?? ""), dados);
  if (!resultado.ok) return resultado;
  revalidar();
  return { ok: true, pedido: await pedidoParaQuemVe(id) };
}

/** "+ Adicionar outro item": grava na hora e devolve o item pronto para a tela (as outras linhas nao mudam). */
export async function adicionarItemAcao(pedidoId, produtoId) {
  const negado = await negarSemAcesso("tela.compras.pedidos", "editar");
  if (negado) return negado;
  const resultado = await adicionarItem(String(pedidoId ?? ""), String(produtoId ?? ""));
  if (!resultado.ok) return resultado;
  revalidar();
  const pedido = await pedidoParaQuemVe(pedidoId);
  return { ok: true, item: pedido?.itens.find((item) => item.id === resultado.itemId) ?? null };
}

export async function buscarItensAcao(pedidoId, texto) {
  const negado = await negarSemAcesso("tela.compras.pedidos", "ver");
  if (negado) return [];
  return buscarItensParaPedido(String(pedidoId ?? ""), String(texto ?? "").slice(0, 80));
}

export async function mudarStatusAcao(id, para) {
  const negado = await negarSemAcesso("tela.compras.pedidos", "editar");
  if (negado) return negado;
  const resultado = await mudarStatus(String(id ?? ""), String(para ?? ""));
  if (!resultado.ok) return resultado;
  revalidar();
  return { ok: true, pedido: await pedidoParaQuemVe(id) };
}

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
