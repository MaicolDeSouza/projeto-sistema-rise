"use server";

import { revalidatePath } from "next/cache";

import { negarSemAcesso, negarSemAcessos } from "@/lib/acessos/servidor";
import { criarColunasPelaLocalizacao, excluirColuna, excluirModelo, salvarCaixinhaDoProduto, salvarColuna, salvarLocal, salvarModelo } from "@/lib/estoque3d/banco";

/** Tudo aqui muda o desenho do mapa: a tela do bloco Estoque relida depois de gravar. */
function relido(resultado) {
  if (resultado.ok) revalidatePath("/estoque", "layout");
  return resultado;
}

export async function criarColunasPelaLocalizacaoAcao() {
  // Le a localizacao de todos os produtos: quem nao a ve nao cria colunas a partir dela.
  const negado = await negarSemAcessos(["tela.estoque.mapa", "editar"], ["dado.localizacao", "ver"]);
  if (negado) return negado;
  return relido(await criarColunasPelaLocalizacao());
}

export async function salvarColunaAcao(id, dados) {
  const negado = await negarSemAcesso("tela.estoque.mapa", "editar");
  if (negado) return negado;
  return relido(await salvarColuna(id ? String(id) : null, dados));
}

export async function excluirColunaAcao(id) {
  const negado = await negarSemAcesso("tela.estoque.mapa", "editar");
  if (negado) return negado;
  return relido(await excluirColuna(String(id ?? "")));
}

export async function salvarLocalAcao(id, dados) {
  const negado = await negarSemAcesso("tela.estoque.mapa", "editar");
  if (negado) return negado;
  return relido(await salvarLocal(String(id ?? ""), dados ?? {}));
}

export async function salvarModeloAcao(id, dados) {
  const negado = await negarSemAcesso("tela.estoque.mapa", "editar");
  if (negado) return negado;
  return relido(await salvarModelo(id ? String(id) : null, dados));
}

export async function excluirModeloAcao(id) {
  const negado = await negarSemAcesso("tela.estoque.mapa", "editar");
  if (negado) return negado;
  return relido(await excluirModelo(String(id ?? "")));
}

export async function salvarCaixinhaDoProdutoAcao(produtoId, dados) {
  const negado = await negarSemAcesso("tela.estoque.mapa", "editar");
  if (negado) return negado;
  return relido(await salvarCaixinhaDoProduto(produtoId, dados));
}
