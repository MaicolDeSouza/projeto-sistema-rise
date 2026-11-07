"use server";

import { revalidatePath } from "next/cache";

import { executarComAcesso } from "@/lib/acessos/servidor";
import { alternarCorrecao, criarCorrecao, editarCorrecao, excluirCorrecao } from "@/lib/ia/correcoesBanco";

/**
 * Acoes da tela Configuracoes › Correcoes da descricao (spec 2026-11-07). Todas pedem editar o cadastro de Produtos
 * (conferido no servidor, antes de qualquer leitura). Finas: a regra mora em `src/lib/ia/correcoesBanco.js`, testado.
 */

const PAGINA = "/configuracoes/correcoes-da-descricao";

const campos = (formData) => ({
  tipo: formData.get("tipo"),
  errado: formData.get("errado"),
  certo: formData.get("certo"),
  explicacao: formData.get("explicacao"),
  promptNome: formData.get("promptNome"),
});

/** Cria (sem id) ou edita. Volta `{ ok }`, ou o erro de cada campo, ou o da repetida. */
export async function salvarCorrecaoAcao(id, formData) {
  return executarComAcesso("tela.produtos.cadastro", "editar", async (acesso) => {
    const resultado = id
      ? await editarCorrecao(id, campos(formData))
      : await criarCorrecao(campos(formData), { quem: acesso.login ?? "pc", origem: "TELA" });
    if (!resultado.ok) return { ok: false, erro: resultado.erro ?? null, erros: resultado.erros ?? {} };
    revalidatePath(PAGINA);
    return { ok: true };
  });
}

export async function alternarCorrecaoAcao(id, ativa) {
  return executarComAcesso("tela.produtos.cadastro", "editar", async () => {
    const resultado = await alternarCorrecao(id, ativa);
    if (!resultado.ok) return { ok: false, erro: resultado.erro };
    revalidatePath(PAGINA);
    return { ok: true };
  });
}

export async function excluirCorrecaoAcao(id) {
  return executarComAcesso("tela.produtos.cadastro", "editar", async () => {
    const resultado = await excluirCorrecao(id);
    if (!resultado.ok) return { ok: false, erro: "Correção não encontrada." };
    revalidatePath(PAGINA);
    return { ok: true };
  });
}
