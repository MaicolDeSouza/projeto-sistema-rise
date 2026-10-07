"use server";

import { revalidatePath } from "next/cache";

import { desconectar, registrarTeste } from "@/lib/integracoes/conexoes";
import { obterConector } from "@/lib/integracoes/registro";

/**
 * Server Actions da tela de Integracoes.
 *
 * Devolvem apenas metadados: nenhum token ou chave atravessa a fronteira
 * servidor/cliente.
 */

export async function testarConexao(servicoId) {
  const conector = obterConector(servicoId);
  if (!conector) return { ok: false, erro: "Conector desconhecido." };

  let resultado;
  try {
    resultado = await conector.testar();
  } catch (erro) {
    resultado = { ok: false, erro: erro.message };
  }

  await registrarTeste(servicoId, {
    ok: resultado.ok,
    conta: resultado.conta,
    erro: resultado.erro,
  });

  revalidatePath("/integracoes");
  return resultado;
}

export async function salvarChavesAction(servicoId, formData) {
  const conector = obterConector(servicoId);
  const salvar = conector?.salvarCredenciais ?? conector?.salvarChaves;
  if (!salvar) {
    return { ok: false, erro: "Este conector não recebe credenciais nesta tela." };
  }

  const valores = Object.fromEntries(
    conector.campos.map((campo) => [
      campo.nome,
      String(formData.get(campo.nome) ?? "").trim(),
    ]),
  );

  const vazios = conector.campos.filter((campo) => !valores[campo.nome]);
  if (vazios.length) {
    return {
      ok: false,
      erro: `Preencha: ${vazios.map((campo) => campo.rotulo).join(", ")}`,
    };
  }

  try {
    await salvar(valores);
  } catch (erro) {
    return { ok: false, erro: erro.message };
  }

  revalidatePath("/integracoes");
  return testarConexao(servicoId);
}

export async function desconectarAction(servicoId) {
  await desconectar(servicoId);
  revalidatePath("/integracoes");
  return { ok: true };
}
