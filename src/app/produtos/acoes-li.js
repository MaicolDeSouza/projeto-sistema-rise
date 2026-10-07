"use server";

import { revalidatePath } from "next/cache";

import { mudouNaLI } from "@/lib/canaisDeVenda/li/apresentacao";
import { cadastrarNaLI, sincronizarProdutoLI } from "@/lib/canaisDeVenda/li/envio";
import { produtoIdValido } from "@/lib/canaisDeVenda/li/estado";
import { lerParaPopupLI } from "@/lib/canaisDeVenda/li/leitura";

/**
 * Acoes do editor da Loja Integrada (aberto pelo icone da lista de Produtos): ler a loja, Sincronizar e Cadastrar. Finas, no molde de `acoes-bling.js`: a regra,
 * a leitura e o envio moram em `lib/canaisDeVenda/li`, onde o teste (scripts/teste-li-sync.js) os
 * alcanca com a LI falsa; aqui ficam conferir o que vem do navegador, revalidar as listas e nao
 * deixar excecao nenhuma chegar a tela.
 *
 * Quem escreve na LI passa pelas duas travas (LI_ESCRITA e LI_ESCRITA_CODIGOS) dentro da lib: com
 * elas fechadas, a acao devolve o motivo e nada sai.
 */

const PEDIDO_INVALIDO = { ok: false, erro: "Pedido invalido." };

/** Excecao solta viraria tela de erro do Next; aqui vira recado, com o erro so no log do servidor. */
async function protegendo(recado, trabalho) {
  try {
    return await trabalho();
  } catch (erro) {
    console.error("[loja integrada]", erro);
    return { ok: false, erro: recado };
  }
}

/// Acao que grava: a lista de Produtos (o icone) e a do canal mostram o que acabou de mudar.
function revalidando(resultado, mudou) {
  if (mudou) {
    revalidatePath("/produtos");
    revalidatePath("/canais-de-venda/loja-integrada");
  }
  return resultado;
}

/**
 * O que a LI tem sob o SKU, comparado campo a campo com o Rise. So le a loja; na primeira abertura
 * de um produto que ja existe la, grava o vinculo no Rise (por isso revalida quando vinculou).
 */
export async function abrirJanelaLI(produtoId) {
  if (!produtoIdValido(produtoId)) return PEDIDO_INVALIDO;
  return protegendo("Nao foi possivel ler a Loja Integrada. Tente de novo.", async () => {
    const resultado = await lerParaPopupLI(produtoId);
    return revalidando(resultado, resultado.vinculadoAgora === true);
  });
}

/** Envia a LI os campos que mudaram de um produto ja vinculado. */
export async function sincronizarComLI(produtoId) {
  if (!produtoIdValido(produtoId)) return PEDIDO_INVALIDO;
  return protegendo(
    "Nao foi possivel concluir a sincronizacao. A Loja Integrada pode ter recebido parte do envio: confira na loja antes de tentar de novo.",
    async () => {
      const resultado = await sincronizarProdutoLI(produtoId);
      return revalidando(resultado, mudouNaLI("sincronizar", resultado));
    },
  );
}

/** Cadastra na LI (inativo) o produto que ainda nao existe la. */
export async function cadastrarProdutoNaLI(produtoId) {
  if (!produtoIdValido(produtoId)) return PEDIDO_INVALIDO;
  return protegendo(
    "Nao foi possivel concluir o cadastro. O produto pode ter sido criado na Loja Integrada: confira la antes de tentar de novo.",
    async () => {
      const resultado = await cadastrarNaLI(produtoId);
      return revalidando(resultado, mudouNaLI("cadastrar", resultado));
    },
  );
}
