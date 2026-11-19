"use server";

import { revalidatePath } from "next/cache";

import { executarComAcesso } from "@/lib/acessos/servidor";
import { excluirCaixa, salvarCaixa } from "@/lib/frete/caixas";

/** Cadastros > Caixas de envio (modulo de frete). A regra mora em `lib/frete/caixas.js`, onde o teste a alcanca. */

export async function salvarCaixaAcao(entrada, id) {
  return executarComAcesso("tela.cadastros.caixasDeEnvio", "editar", async () => {
    const resultado = await salvarCaixa(entrada, typeof id === "string" && id ? id : undefined);
    if (resultado.ok) revalidatePath("/cadastros/caixas-de-envio");
    return resultado;
  });
}

export async function excluirCaixaAcao(id) {
  return executarComAcesso("tela.cadastros.caixasDeEnvio", "excluir", async () => {
    if (typeof id !== "string" || !id) return { ok: false, erro: "Caixa inválida." };
    const resultado = await excluirCaixa(id);
    if (resultado.ok) revalidatePath("/cadastros/caixas-de-envio");
    return resultado;
  });
}
