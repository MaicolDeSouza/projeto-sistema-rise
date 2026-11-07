import { prisma } from "@/lib/db";
import { validarOrdem } from "./regras";

/**
 * A ordem dos cartoes no banco, por pessoa (`OrdemDosCartoes`). A chave e o login da sessao; no PC de desenvolvimento,
 * sem login, "pc" (o dono e o unico ali).
 */
export function chaveDaSessao(sessao) {
  return sessao?.login ? String(sessao.login).toLowerCase() : sessao?.ambiente === "pc" ? "pc" : null;
}

/** A ordem salva (ids) ou null. Falha de leitura nao derruba a pagina: fica a ordem padrao. */
export async function lerOrdemDosCartoes(chave, pagina) {
  if (!chave) return null;
  try {
    const linha = await prisma.ordemDosCartoes.findUnique({ where: { chave_pagina: { chave, pagina } }, select: { ordem: true } });
    return linha?.ordem ?? null;
  } catch (erro) {
    console.error("[cartoes] ordem não lida:", erro?.message ?? erro);
    return null;
  }
}

/** Grava a ordem; lista vazia volta a ordem padrao (apaga a linha). */
export async function salvarOrdemDosCartoes(chave, pagina, ordem) {
  if (!chave) return { ok: false, erro: "Sem usuário para guardar a ordem." };
  const valida = validarOrdem(pagina, ordem);
  if (!valida.ok) return valida;
  if (valida.ordem.length === 0) {
    await prisma.ordemDosCartoes.deleteMany({ where: { chave, pagina } });
    return { ok: true };
  }
  await prisma.ordemDosCartoes.upsert({
    where: { chave_pagina: { chave, pagina } },
    update: { ordem: valida.ordem },
    create: { chave, pagina, ordem: valida.ordem },
  });
  return { ok: true };
}
