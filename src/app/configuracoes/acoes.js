"use server";

import { revalidatePath } from "next/cache";

import { excluirFuncao, salvarFuncao, salvarUsuario } from "@/lib/acessos/banco";
import { executarComAcesso } from "@/lib/acessos/servidor";
import { ErroDeUso } from "@/lib/riseAi/erros";

/**
 * Acoes de Configuracoes › Usuarios e funcoes. TODAS passam por `executarComAcesso` com "Usuarios e funcoes", que nao e
 * delegavel: so o Administrador (conferido no servidor, antes de qualquer leitura). Finas: a regra mora em
 * `src/lib/acessos/banco.js`, que e testado. Devolvem `{ ok, ... }`; erro de validacao volta em `erros` por campo.
 */

/** Listas que a tela manda como JSON num campo oculto (excecoes, a matriz de permissoes). */
function lerJson(formData, campo, padrao) {
  const bruto = formData.get(campo);
  if (bruto === null || bruto === "") return padrao;
  try {
    return JSON.parse(String(bruto)) ?? padrao;
  } catch {
    throw new ErroDeUso("Dados do formulário inválidos. Recarregue a página.");
  }
}

const atualizarTelas = () => revalidatePath("/configuracoes", "layout");

export async function salvarUsuarioAcao(id, formData) {
  return executarComAcesso("tela.configuracoes.usuarios", "editar", async (acesso) => {
    const resultado = await salvarUsuario(
      {
        id,
        login: formData.get("login"),
        nome: formData.get("nome"),
        assinatura: formData.get("assinatura"),
        ativo: formData.get("ativo") === "on",
        funcoes: formData.getAll("funcao").map(String),
        excecoes: lerJson(formData, "excecoes", []),
      },
      { quem: acesso.login ?? "pc" },
    );
    if (!resultado.ok) return { ok: false, erro: "Corrija os campos marcados.", erros: resultado.erros };
    atualizarTelas();
    return { id: resultado.id };
  });
}

export async function salvarFuncaoAcao(id, formData) {
  return executarComAcesso("tela.configuracoes.usuarios", "editar", async (acesso) => {
    const resultado = await salvarFuncao(
      { id, nome: formData.get("nome"), descricao: formData.get("descricao"), permissoes: lerJson(formData, "permissoes", {}) },
      { quem: acesso.login ?? "pc" },
    );
    if (!resultado.ok) return { ok: false, erro: resultado.erro ?? "Corrija os campos marcados.", erros: resultado.erros ?? {} };
    atualizarTelas();
    return { id: resultado.id };
  });
}

export async function excluirFuncaoAcao(id) {
  return executarComAcesso("tela.configuracoes.usuarios", "editar", async (acesso) => {
    const resultado = await excluirFuncao(id, { quem: acesso.login ?? "pc" });
    if (!resultado.ok) return { ok: false, erro: resultado.erro };
    atualizarTelas();
    return {};
  });
}
