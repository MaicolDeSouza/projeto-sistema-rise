"use server";

import { negarSemAcessos } from "@/lib/acessos/servidor";

import { revalidatePath } from "next/cache";

import { gravarLocalizacao, gravarPrecoVenda } from "@/lib/ajusteRapido";
import { ajustarESincronizar, lerSaldoParaAjuste } from "@/lib/blingSync/ajusteComBling";

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

/**
 * O saldo que o popup "Ajustar estoque" mostra: lido do Bling na hora (pedido do dono em 20/11/2026: "sempre ler saldo
 * atual no bling"), e o estoque do Rise regravado por ele. So le o Bling. Nao revalida a lista: o popup pede a
 * atualizacao so quando o numero mudou (`router.refresh()`), para a abertura de cada popup nao refazer a lista inteira.
 */
export async function lerSaldoDoAjuste(id) {
  const negado = await negarSemAcessos(["tela.produtos", "editar"], ["dado.estoqueExato", "ver"]);
  if (negado) return negado;
  try {
    return await lerSaldoParaAjuste(id);
  } catch (erro) {
    console.error("[edicao rapida]", erro);
    return { ok: false, erro: "Não foi possível ler o saldo no Bling. Tente de novo." };
  }
}

/**
 * O Confirmar do popup: le o saldo no Bling, grava o ajuste no Rise e o envia ao Bling na mesma hora (20/11/2026).
 * Como escreve no Bling, pede tambem a permissao de sincronizar. Revalida sempre: mesmo recusado (saida maior que o
 * saldo), a leitura de antes pode ter mudado o estoque que a lista mostra.
 */
export async function ajustarEstoque(id, dados) {
  const negado = await negarSemAcessos(["tela.produtos", "editar"], ["dado.estoqueExato", "ver"], ["acao.produtos.sincronizarBling", "executar"]);
  if (negado) return negado;
  try {
    const resultado = await ajustarESincronizar(id, dados);
    revalidatePath("/produtos");
    return resultado;
  } catch (erro) {
    console.error("[edicao rapida]", erro);
    revalidatePath("/produtos");
    // Sem "tente de novo" as cegas: o ajuste pode ter sido gravado, ou ate enviado, antes da falha.
    return { ok: false, erro: "Não foi possível concluir o ajuste. Confira o saldo deste produto antes de tentar de novo." };
  }
}
