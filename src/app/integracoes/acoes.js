"use server";

import { negarSemAcessos } from "@/lib/acessos/servidor";

import { revalidatePath } from "next/cache";

import { gerarChaveDaExtensao } from "@/lib/compras/aliexpress/chave";
import { marcarFornecedorDoAliExpress } from "@/lib/compras/aliexpress/fornecedor";
import { desconectar, registrarTeste } from "@/lib/integracoes/conexoes";
import { obterConector } from "@/lib/integracoes/registro";

/**
 * Server Actions da tela de Integracoes.
 *
 * Devolvem apenas metadados: nenhum token ou chave atravessa a fronteira
 * servidor/cliente.
 */

export async function testarConexao(servicoId) {
  const negado = await negarSemAcessos(["tela.integracoes", "editar"]);
  if (negado) return negado;
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
  const negado = await negarSemAcessos(["tela.integracoes", "editar"]);
  if (negado) return negado;
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
  const negado = await negarSemAcessos(["tela.integracoes", "editar"]);
  if (negado) return negado;
  await desconectar(servicoId);
  revalidatePath("/integracoes");
  return { ok: true };
}

/**
 * Cartao AliExpress: gera a chave da extensao "Rise AliExpress". A chave volta UMA vez, para a tela mostrar e copiar;
 * o banco guarda so o hash, e gerar de novo invalida a anterior.
 */
export async function gerarChaveAliExpressAcao() {
  const negado = await negarSemAcessos(["tela.integracoes", "editar"]);
  if (negado) return negado;
  const { chave } = await gerarChaveDaExtensao();
  revalidatePath("/integracoes");
  return { ok: true, chave };
}

/** Cartao AliExpress: qual fornecedor recebe as compras do AliExpress. */
export async function marcarFornecedorAliExpressAcao(fornecedorId) {
  const negado = await negarSemAcessos(["tela.integracoes", "editar"]);
  if (negado) return negado;
  const resultado = await marcarFornecedorDoAliExpress(fornecedorId);
  if (resultado.ok) revalidatePath("/integracoes");
  return resultado;
}
