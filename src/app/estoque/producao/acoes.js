"use server";

import { revalidatePath } from "next/cache";

import { negarSemAcesso } from "@/lib/acessos/servidor";
import { cancelar, concluir, criarOrdem, darBaixa, reenviarPendentesDaOrdem } from "@/lib/producao/banco";

/** A ordem mexe no estoque de varios produtos: a lista de Produtos e a do bloco Estoque relidas. */
function revalidar() {
  revalidatePath("/estoque", "layout");
  revalidatePath("/produtos");
}

/** "Produzir" do cadastro do produto: cria a ordem aberta. */
export async function criarOrdemAcao(produtoId, { quantidade, observacao } = {}) {
  const negado = await negarSemAcesso("tela.estoque.producao", "editar");
  if (negado) return negado;
  const resultado = await criarOrdem(String(produtoId ?? ""), { quantidade, observacao });
  if (resultado.ok) revalidar();
  return resultado;
}

export async function darBaixaAcao(id, { depositoId } = {}) {
  const negado = await negarSemAcesso("acao.producao.movimentar", "executar");
  if (negado) return negado;
  const resultado = await darBaixa(String(id ?? ""), { depositoId });
  if (resultado.ok) revalidar();
  return resultado;
}

export async function concluirAcao(id, { quantidadeProduzida, depositoId } = {}) {
  const negado = await negarSemAcesso("acao.producao.movimentar", "executar");
  if (negado) return negado;
  const resultado = await concluir(String(id ?? ""), quantidadeProduzida, { depositoId });
  if (resultado.ok) revalidar();
  return resultado;
}

export async function cancelarAcao(id) {
  const negado = await negarSemAcesso("acao.producao.movimentar", "executar");
  if (negado) return negado;
  const resultado = await cancelar(String(id ?? ""));
  if (resultado.ok) revalidar();
  return resultado;
}

export async function reenviarAcao(id, depositoId) {
  const negado = await negarSemAcesso("acao.producao.movimentar", "executar");
  if (negado) return negado;
  return reenviarPendentesDaOrdem(String(id ?? ""), depositoId);
}
