"use server";

import { revalidatePath } from "next/cache";

import { negarSemAcesso, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { estudarDeNovo, excluirEstudos } from "@/lib/estudos/banco";

/** Acoes da tela Estudos de viabilidade (spec 2026-11-12). So exporta funcao assincrona (modulo "use server"). */

export async function excluirEstudoAcao(id) {
  const negado = await negarSemAcesso("tela.compras.estudos", "excluir");
  if (negado) return negado;
  const apagados = await excluirEstudos([id]);
  revalidatePath("/compras", "layout");
  return apagados ? { ok: true } : { ok: false, erro: "Estudo não encontrado." };
}

/** Um estudo novo do mesmo produto na fila; o atual fica como historico. */
export async function estudarDeNovoAcao(id) {
  const negado = await negarSemAcesso("tela.compras.estudos", "editar");
  if (negado) return negado;
  try {
    const sessao = await sessaoDeAcessos();
    const resultado = await estudarDeNovo(id, { usuario: sessao?.login ?? null });
    revalidatePath("/compras", "layout");
    return { ok: true, ...resultado };
  } catch (erro) {
    if (erro?.name === "ErroDoEstudo") return { ok: false, erro: erro.message };
    console.error("[estudos] estudar de novo falhou:", erro);
    return { ok: false, erro: "Não foi possível pôr o estudo na fila agora." };
  }
}
