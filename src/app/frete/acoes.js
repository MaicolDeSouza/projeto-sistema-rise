"use server";

import { negarSemAcesso, podeAgora } from "@/lib/acessos/servidor";
import { cotarFrete, pacoteSugerido } from "@/lib/frete/cotacao";

/**
 * As acoes do cotador de frete (modulo de frete, fase 1). Cotar nao grava nada nem gasta saldo: quem ve a Proposta, o
 * Pedido de venda ou a ferramenta Cotar frete pode cotar. Uma pessoa sem nenhuma das tres recebe a recusa padrao.
 */

const TELAS_QUE_COTAM = ["tela.propostas", "tela.pedidos", "tela.ferramentas.frete"];

async function negarSemAlgumaTela() {
  for (const tela of TELAS_QUE_COTAM) if (await podeAgora(tela, "ver")) return null;
  return negarSemAcesso("tela.ferramentas.frete", "ver");
}

export async function cotarFreteAcao(entrada) {
  const negado = await negarSemAlgumaTela();
  if (negado) return negado;
  return cotarFrete(entrada);
}

export async function pacoteSugeridoAcao(itens) {
  const negado = await negarSemAlgumaTela();
  if (negado) return negado;
  if (!Array.isArray(itens) || itens.length > 200) return { ok: false, erro: "Itens inválidos." };
  try {
    return { ok: true, ...(await pacoteSugerido(itens)) };
  } catch (erro) {
    console.error("[frete] pacote sugerido:", erro?.message ?? erro);
    return { ok: false, erro: "Não foi possível sugerir a caixa." };
  }
}
