"use server";

import { negarSemAcessos } from "@/lib/acessos/servidor";

import { revalidatePath } from "next/cache";

import { gravarAjusteDeEstoque, gravarLocalizacao, gravarPrecoVenda } from "@/lib/ajusteRapido";

/**
 * Edicao rapida na lista de Produtos (pedido do dono em 30/09/2026): so acrescenta
 * a revalidacao da tela. Validacao e gravacao moram em `lib/ajusteRapido.js`, onde o
 * teste as alcanca (`revalidatePath` so existe dentro do Next).
 *
 * Fica fora de acoes.js de proposito: aquele arquivo e o de maior conflito entre as
 * duas frentes, e estas acoes nao dependem de nada dele.
 */

async function revalidando(resultado) {
  if (resultado.ok) revalidatePath("/produtos");
  return resultado;
}

export async function salvarLocalizacao(id, texto) {
  const negado = await negarSemAcessos(["tela.produtos", "editar"], ["dado.localizacao", "editar"]);
  if (negado) return negado;
  return revalidando(await gravarLocalizacao(id, texto));
}

export async function salvarPrecoVenda(id, valor) {
  const negado = await negarSemAcessos(["tela.produtos", "editar"]);
  if (negado) return negado;
  return revalidando(await gravarPrecoVenda(id, valor));
}

export async function ajustarEstoque(id, dados) {
  const negado = await negarSemAcessos(["tela.produtos", "editar"], ["dado.estoqueExato", "ver"]);
  if (negado) return negado;
  return revalidando(await gravarAjusteDeEstoque(id, dados));
}
