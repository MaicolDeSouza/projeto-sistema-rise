"use server";

import { revalidatePath } from "next/cache";

import { negarSemAcesso, podeAgora, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { marcarWhatsapp, reenviarEmail } from "@/lib/frete/aviso";
import { cancelarEtiqueta, comprarEtiqueta, conferirPacote, linkDaEtiqueta } from "@/lib/frete/envios";
import { obterProvedor, PROVEDOR_PADRAO } from "@/lib/frete/provedores/registro";
import { recalcularLucroDoPedido } from "@/lib/pedidos/banco";

/**
 * As acoes do envio (modulo de frete, fase 2). Comprar e cancelar gastam ou devolvem o saldo da carteira: so com
 * `acao.envios.comprarEtiqueta` (o dono pediu "so ele e a Andrea"). Imprimir e ver o saldo: quem ve a lista de Envios ou
 * o pedido. A regra mora em `lib/frete/envios.js`, onde o teste a alcanca sem o Next.
 */

const ehId = (valor) => typeof valor === "string" && valor !== "" && valor.length <= 64;
const INVALIDO = { ok: false, erro: "Envio inválido." };

async function protegendo(trabalho) {
  try {
    return await trabalho();
  } catch (erro) {
    console.error("[envios]", erro);
    return { ok: false, erro: "Não foi possível concluir. Tente de novo." };
  }
}

function revalidar(resultado) {
  if (resultado?.ok) {
    revalidatePath("/envios");
    if (resultado.envio?.id) revalidatePath(`/envios/${resultado.envio.id}`);
    if (resultado.envio?.pedidoDeVendaId) revalidatePath(`/pedidos/${resultado.envio.pedidoDeVendaId}`);
  }
  return resultado;
}

const loginAtual = async () => (await sessaoDeAcessos())?.login ?? null;

/** Quem ve a lista de Envios ou o pedido de venda pode imprimir a etiqueta e ver o saldo. */
async function negarSemVerEnvios() {
  if (await podeAgora("tela.envios", "ver")) return null;
  if (await podeAgora("tela.pedidos", "ver")) return null;
  return negarSemAcesso("tela.envios", "ver");
}

export async function conferirPacoteAcao(id, entrada) {
  const negado = await negarSemAcesso("acao.envios.comprarEtiqueta", "executar");
  if (negado) return negado;
  if (!ehId(id)) return INVALIDO;
  return protegendo(async () => {
    const resultado = await conferirPacote(id, entrada ?? {}, await loginAtual());
    // A janela so precisa do que mostra: o envio inteiro leva remetente e destinatario (dado pessoal).
    if (!resultado.ok) return resultado;
    const { envio, preco, saldo, motivos } = resultado;
    return revalidar({
      ok: true,
      preco,
      saldo,
      motivos,
      envio: { id: envio.id, pedidoDeVendaId: envio.pedidoDeVendaId, prazoDias: envio.prazoDias, servicoNome: envio.servicoNome, transportadoraNome: envio.transportadoraNome },
    });
  });
}

export async function comprarEtiquetaAcao(id) {
  const negado = await negarSemAcesso("acao.envios.comprarEtiqueta", "executar");
  if (negado) return negado;
  if (!ehId(id)) return INVALIDO;
  return protegendo(async () => {
    const resultado = await comprarEtiqueta(id, await loginAtual(), { aoComprar: recalcularLucroDoPedido });
    if (!resultado.ok) return resultado;
    const { envio } = resultado;
    return revalidar({
      ok: true,
      envio: { id: envio.id, pedidoDeVendaId: envio.pedidoDeVendaId, rastreio: envio.rastreio, linkDoRastreio: envio.linkDoRastreio, custo: envio.custo, validoAte: envio.validoAte },
    });
  });
}

export async function cancelarEtiquetaAcao(id, motivo) {
  const negado = await negarSemAcesso("acao.envios.comprarEtiqueta", "executar");
  if (negado) return negado;
  if (!ehId(id)) return INVALIDO;
  return protegendo(async () => {
    const resultado = await cancelarEtiqueta(id, String(motivo ?? "").slice(0, 255), await loginAtual(), { aoMudarCusto: recalcularLucroDoPedido });
    if (!resultado.ok) return resultado;
    return revalidar({ ok: true, envio: { id: resultado.envio.id, pedidoDeVendaId: resultado.envio.pedidoDeVendaId } });
  });
}

export async function imprimirEtiquetaAcao(id) {
  const negado = await negarSemVerEnvios();
  if (negado) return negado;
  if (!ehId(id)) return INVALIDO;
  return protegendo(() => linkDaEtiqueta(id));
}

/** "Reenviar e-mail" do aviso de postagem (so quando o anterior nao saiu). */
export async function reenviarEmailAcao(id) {
  const negado = await negarSemAcesso("acao.envios.avisarCliente", "executar");
  if (negado) return negado;
  if (!ehId(id)) return INVALIDO;
  return protegendo(async () => {
    const resultado = await reenviarEmail(id);
    revalidatePath("/envios");
    revalidatePath(`/envios/${id}`);
    return resultado;
  });
}

/** O clique no botao do WhatsApp (o link abre no navegador; aqui so fica a marca, que apaga o "!" da lista). */
export async function marcarWhatsappAcao(id) {
  const negado = await negarSemAcesso("acao.envios.avisarCliente", "executar");
  if (negado) return negado;
  if (!ehId(id)) return INVALIDO;
  return protegendo(async () => {
    const resultado = await marcarWhatsapp(id);
    revalidatePath("/envios");
    return resultado;
  });
}

/** O saldo da carteira; null quando o provedor nao responde (a tela some com ele, sem erro). */
export async function saldoDoProvedorAcao() {
  const negado = await negarSemVerEnvios();
  if (negado) return negado;
  return protegendo(async () => {
    try {
      return { ok: true, ...(await obterProvedor(PROVEDOR_PADRAO).saldo()) };
    } catch {
      return { ok: true, saldo: null, reservado: null };
    }
  });
}
