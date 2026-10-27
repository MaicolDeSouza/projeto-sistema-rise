"use server";

import { revalidatePath } from "next/cache";

import { negarSemAcessos } from "@/lib/acessos/servidor";
import { CANAIS_QUE_ACEITAM_A_MARCA, listaComAMarca } from "@/lib/canaisDeVenda/naoAnunciar";
import { prisma } from "@/lib/db";

/**
 * Liga ou desliga o "Não anunciar neste canal" de um produto (pedido do dono em 27/10/2026; regra em
 * `lib/canaisDeVenda/naoAnunciar.js`). Grava na hora, como o Conferido da lista: e uma marca do produto, nao um campo do
 * anuncio, e o botao mora no popup do canal. Pede editar o cadastro de Produtos. Nada vai ao canal nem ao Bling.
 */
export async function marcarNaoAnunciar(produtoId, canal, marcar) {
  const negado = await negarSemAcessos(["tela.produtos.cadastro", "editar"]);
  if (negado) return negado;
  if (typeof produtoId !== "string" || !produtoId || !CANAIS_QUE_ACEITAM_A_MARCA.includes(canal) || typeof marcar !== "boolean") {
    return { ok: false, erro: "Pedido inválido." };
  }
  try {
    // Le e grava numa transacao com a linha travada: dois cliques em canais diferentes ao mesmo tempo nao apagam um ao outro.
    const lista = await prisma.$transaction(async (tx) => {
      const linhas = await tx.$queryRaw`SELECT "naoAnunciarEm"::text[] AS lista FROM "Produto" WHERE id = ${produtoId} FOR UPDATE`;
      if (linhas.length === 0) return null;
      const nova = listaComAMarca(linhas[0].lista, canal, marcar);
      // Sem `update` do Prisma: ele subiria o `atualizadoEm`, e a lista de Produtos ordena por ele (o produto pularia para o topo).
      await tx.$executeRaw`UPDATE "Produto" SET "naoAnunciarEm" = ${nova}::"Canal"[] WHERE id = ${produtoId}`;
      return nova;
    });
    if (!lista) return { ok: false, erro: "Produto não encontrado." };
    revalidatePath("/produtos");
    return { ok: true, naoAnunciarEm: lista };
  } catch (erro) {
    console.error("[produto] nao anunciar", erro);
    return { ok: false, erro: "Não foi possível gravar. Tente de novo." };
  }
}
