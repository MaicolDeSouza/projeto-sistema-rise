"use server";

import { revalidatePath } from "next/cache";

import { negarSemAcesso } from "@/lib/acessos/servidor";
import { excluirPadrao, listarPadroes, salvarPadrao } from "@/lib/propostas/padroes";

/**
 * Padroes de proposta (13/11/2026). Mesmo acesso das propostas: editar a proposta = editar os padroes (sao o molde dela).
 */

const revalidar = () => revalidatePath("/propostas", "layout");

export async function salvarPadraoAcao(id, entrada) {
  const negado = await negarSemAcesso("tela.propostas", "editar");
  if (negado) return negado;
  const resultado = await salvarPadrao(id ? String(id) : null, entrada);
  if (!resultado.ok) return resultado;
  revalidar();
  return { ...resultado, padroes: JSON.parse(JSON.stringify(await listarPadroes())) };
}

export async function excluirPadraoAcao(id) {
  const negado = await negarSemAcesso("tela.propostas", "editar");
  if (negado) return negado;
  const resultado = await excluirPadrao(String(id ?? ""));
  if (!resultado.ok) return resultado;
  revalidar();
  return { ok: true, padroes: JSON.parse(JSON.stringify(await listarPadroes())) };
}
