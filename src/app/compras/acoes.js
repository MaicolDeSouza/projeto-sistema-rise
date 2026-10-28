"use server";

import { revalidatePath } from "next/cache";

import { negarSemAcesso, negarSemAcessos, podeAgora } from "@/lib/acessos/servidor";
import { guardarPropostaTemporaria } from "@/lib/compras/arquivos";
import { casarManual, desfazerCasamento } from "@/lib/compras/aliexpress/casamento";
import { reenviarAoVirtual } from "@/lib/compras/aliexpress/importacao";
import { desfazerUltimoLancamento, lancarEstoqueDoItem, reenviarPendentes } from "@/lib/compras/lancamento";
import {
  adicionarAoPedido,
  adicionarItem,
  buscarItensParaPedido,
  criarPedido,
  excluirPedido,
  fornecedoresParaCompra,
  lerPedido,
  mudarStatus,
  salvarPedido,
} from "@/lib/compras/banco";
import { semPrecos, semPrecosNaEntrada } from "@/lib/compras/projecao";
import { prisma } from "@/lib/db";

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

// ---------------------------------------------------------------------------
// Lancar estoque (Rise + Bling) e desfazer
// ---------------------------------------------------------------------------

const PODE_LANCAR = [
  ["tela.compras.pedidos", "editar"],
  ["acao.compras.lancarEstoque", "executar"],
];

/** Lanca o que chegou de um item; devolve tambem o pedido relido para a tela. */
export async function lancarEstoqueAcao(itemId, quantidade, depositoId = null) {
  const negado = await negarSemAcessos(...PODE_LANCAR);
  if (negado) return negado;
  const resultado = await lancarEstoqueDoItem(String(itemId ?? ""), quantidade, depositoId ? { depositoId } : {});
  if (!resultado.ok) return resultado;
  revalidar();
  revalidatePath("/produtos");
  const item = await prisma.itemDoPedidoDeCompra.findUnique({ where: { id: String(itemId) }, select: { pedidoId: true } });
  return { ...resultado, pedido: item ? await pedidoParaQuemVe(item.pedidoId) : null };
}

export async function desfazerLancamentoAcao(itemId) {
  const negado = await negarSemAcessos(...PODE_LANCAR);
  if (negado) return negado;
  const resultado = await desfazerUltimoLancamento(String(itemId ?? ""));
  if (!resultado.ok) return resultado;
  revalidar();
  revalidatePath("/produtos");
  const item = await prisma.itemDoPedidoDeCompra.findUnique({ where: { id: String(itemId) }, select: { pedidoId: true } });
  return { ...resultado, pedido: item ? await pedidoParaQuemVe(item.pedidoId) : null };
}

/** "Enviar neste depósito" e "Reenviar": so os ajustes pendentes do produto vao ao Bling. */
export async function reenviarAoBlingAcao(produtoId, depositoId = null) {
  const negado = await negarSemAcessos(...PODE_LANCAR);
  if (negado) return negado;
  return reenviarPendentes(String(produtoId ?? ""), depositoId);
}

/** Envio do arquivo da proposta para o lote temporario (o Salvar do pedido o leva para a pasta dele). */
export async function enviarPropostaAcao(formData) {
  const negado = await negarSemAcesso("tela.compras.pedidos", "editar");
  if (negado) return negado;
  return guardarPropostaTemporaria(String(formData?.get("lote") ?? ""), formData?.get("arquivo"));
}

/** Lixeira da lista de pedidos: so rascunho e cancelado (a regra mora em `excluirPedido`). */
export async function excluirPedidoAcao(id) {
  const negado = await negarSemAcesso("tela.compras.pedidos", "excluir");
  if (negado) return negado;
  const resultado = await excluirPedido(String(id ?? ""));
  if (resultado.ok) revalidar();
  return resultado;
}

// ---------------------------------------------------------------------------
// AliExpress (spec 2026-10-28): casar a linha com o produto, trocar o produto e reenviar ao deposito Virtual
// ---------------------------------------------------------------------------

const PODE_CASAR = [
  ["tela.compras.pedidos", "editar"],
  ["acao.compras.casarAliExpress", "executar"],
];

async function pedidoDaLinha(linhaId) {
  const linha = await prisma.linhaAliExpress.findUnique({ where: { id: String(linhaId ?? "") }, select: { pedidoAliExpress: { select: { pedidoId: true } } } });
  return linha ? pedidoParaQuemVe(linha.pedidoAliExpress.pedidoId) : null;
}

/** "Casar": a linha do AliExpress vira item do pedido (produto + fator); devolve o pedido relido. */
export async function casarLinhaAliExpressAcao(linhaId, produtoId, fator) {
  const negado = await negarSemAcessos(...PODE_CASAR);
  if (negado) return negado;
  const resultado = await casarManual(String(linhaId ?? ""), String(produtoId ?? ""), fator);
  if (!resultado.ok) return resultado;
  revalidar();
  return { ...resultado, pedido: await pedidoDaLinha(linhaId) };
}

/** "Trocar produto": a linha volta a ficar sem produto (so sem estoque lancado). */
export async function desfazerCasamentoAliExpressAcao(linhaId) {
  const negado = await negarSemAcessos(...PODE_CASAR);
  if (negado) return negado;
  const resultado = await desfazerCasamento(String(linhaId ?? ""));
  if (!resultado.ok) return resultado;
  revalidar();
  return { ...resultado, pedido: await pedidoDaLinha(linhaId) };
}

/** "Reenviar ao Virtual" do aviso ambar. */
export async function reenviarAoVirtualAcao(linhaId) {
  const negado = await negarSemAcessos(...PODE_CASAR);
  if (negado) return negado;
  const resultado = await reenviarAoVirtual(String(linhaId ?? ""));
  if (!resultado.ok) return resultado;
  revalidar();
  return { ...resultado, pedido: await pedidoDaLinha(linhaId) };
}
