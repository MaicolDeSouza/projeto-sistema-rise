"use server";

import { revalidatePath } from "next/cache";

import { negarSemAcesso, negarSemAcessos, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { prisma } from "@/lib/db";
import { criarColunasPelaLocalizacao, excluirColuna, excluirModelo, salvarCaixinhaDoProduto, salvarColuna, salvarLocal, salvarModelo } from "@/lib/estoque3d/banco";
import { lerParaMover, moverProduto, sugerirLugarParaProduto } from "@/lib/estoque3d/mover";

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

/** O que a janela Mover precisa (o produto, os estoques, as colunas, os modelos e o historico). */
export async function lerParaMoverAcao(produtoId) {
  const negado = await negarSemAcessos(["tela.estoque.mapa", "ver"], ["dado.localizacao", "ver"]);
  if (negado) return negado;
  return lerParaMover(String(produtoId ?? ""));
}

/** "Onde guardar este produto?" num estoque. So le. */
export async function sugerirLugarAcao(produtoId, localId) {
  const negado = await negarSemAcessos(["tela.estoque.mapa", "ver"], ["dado.localizacao", "ver"]);
  if (negado) return negado;
  return sugerirLugarParaProduto(String(produtoId ?? ""), String(localId ?? ""));
}

/** Muda o produto de lugar: a mesma permissao da edicao rapida da Localizacao, mais a do mapa. */
export async function moverProdutoAcao(produtoId, dados) {
  const negado = await negarSemAcessos(["tela.estoque.mapa", "editar"], ["dado.localizacao", "editar"]);
  if (negado) return negado;
  const sessao = await sessaoDeAcessos();
  const usuario = sessao?.login ? String(sessao.login) : sessao?.ambiente === "pc" ? "pc" : null;
  const resultado = await moverProduto(String(produtoId ?? ""), dados, usuario);
  if (resultado.ok) {
    revalidatePath("/estoque", "layout");
    revalidatePath("/produtos");
  }
  return resultado;
}

/** "Guardar um produto" do mapa: acha o produto pelo codigo (o que ainda nao tem lugar nao aparece no desenho). */
export async function acharProdutoParaGuardarAcao(sku) {
  const negado = await negarSemAcessos(["tela.estoque.mapa", "editar"], ["dado.localizacao", "editar"]);
  if (negado) return negado;
  const codigo = String(sku ?? "").trim();
  if (!codigo) return { ok: false, erro: "Digite o código do produto." };
  const produto = await prisma.produto.findFirst({ where: { sku: { equals: codigo, mode: "insensitive" } }, select: { id: true, ativo: true } });
  if (!produto) return { ok: false, erro: `Não há produto com o código ${codigo}.` };
  if (!produto.ativo) return { ok: false, erro: `O produto ${codigo} está inativo.` };
  return { ok: true, id: produto.id };
}
