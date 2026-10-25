"use server";

import { revalidatePath } from "next/cache";

import { negarSemAcessos } from "@/lib/acessos/servidor";
import { prisma } from "@/lib/db";
import { registrarTeste } from "@/lib/integracoes/conexoes";
import { conectores } from "@/lib/integracoes/registro";

/**
 * "Testar integracoes agora" da Saude do Rise: o mesmo teste do botao de cada cartao em Integracoes (so leitura em cada
 * API), para todos os conectores ja conectados de uma vez. Conector nunca configurado fica de fora: testa-lo gravaria um
 * ERRO numa conexao que ninguem pediu. So o Administrador (a tela inteira e dele).
 *
 * @returns {Promise<{ ok: boolean, erro?: string, resultados?: { id: string, nome: string, ok: boolean, erro: string | null }[] }>}
 */
export async function testarIntegracoesAgora() {
  const negado = await negarSemAcessos(["tela.configuracoes.usuarios", "editar"]);
  if (negado) return negado;

  const conectadas = new Set(
    (await prisma.conexao.findMany({ where: { status: { not: "NAO_CONFIGURADO" } }, select: { servico: true } })).map((linha) => linha.servico),
  );
  const resultados = [];
  for (const conector of conectores.filter((item) => conectadas.has(item.id))) {
    let resultado;
    try {
      resultado = await conector.testar();
    } catch (erro) {
      resultado = { ok: false, erro: erro?.message ?? String(erro) };
    }
    await registrarTeste(conector.id, { ok: resultado.ok, conta: resultado.conta, erro: resultado.erro });
    resultados.push({ id: conector.id, nome: conector.nome, ok: Boolean(resultado.ok), erro: resultado.ok ? null : (resultado.erro ?? "Falha desconhecida") });
  }

  revalidatePath("/configuracoes/saude");
  revalidatePath("/integracoes");
  return { ok: true, resultados };
}
