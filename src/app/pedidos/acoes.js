"use server";

import { revalidatePath } from "next/cache";

import { negarSemAcesso, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { projetarClientesDaBusca } from "@/lib/pedidos/projecao";
import {
  aceitarDivergenciaDoLucro,
  buscarClientesParaVincular,
  criarClienteDoPedido,
  marcarEmSeparacao,
  salvarCustoDoFreteManual,
  vincularCliente,
} from "@/lib/pedidos/banco";

/**
 * As acoes da tela do pedido de venda. Cada uma confere a acao de Acessos antes (`acao.pedidos.*` em executar); a regra
 * mora em `lib/pedidos/banco.js`, onde o teste a alcanca sem o Next. Nada daqui escreve no ML, na LI ou no Bling.
 */

const ehId = (valor) => typeof valor === "string" && valor !== "";
const INVALIDO = { ok: false, erro: "Pedido inválido." };

async function protegendo(trabalho) {
  try {
    return await trabalho();
  } catch (erro) {
    console.error("[pedidos de venda]", erro);
    return { ok: false, erro: "Não foi possível concluir. Tente de novo." };
  }
}

function revalidar(id, resultado) {
  if (resultado?.ok) {
    revalidatePath(`/pedidos/${id}`);
    revalidatePath("/pedidos");
  }
  return resultado;
}

export async function marcarEmSeparacaoAcao(id, ligado) {
  const negado = await negarSemAcesso("acao.pedidos.marcarSeparacao", "executar");
  if (negado) return negado;
  if (!ehId(id)) return INVALIDO;
  return protegendo(async () => revalidar(id, await marcarEmSeparacao(id, Boolean(ligado))));
}

export async function salvarCustoDoFreteManualAcao(id, valor) {
  const negado = await negarSemAcesso("acao.pedidos.editarCustoDoFrete", "executar");
  if (negado) return negado;
  if (!ehId(id)) return INVALIDO;
  return protegendo(async () => revalidar(id, await salvarCustoDoFreteManual(id, valor)));
}

export async function vincularClienteAcao(id, clienteId) {
  const negado = await negarSemAcesso("acao.pedidos.vincularCliente", "executar");
  if (negado) return negado;
  if (!ehId(id) || !ehId(clienteId)) return INVALIDO;
  return protegendo(async () => revalidar(id, await vincularCliente(id, clienteId)));
}

export async function criarClienteDoPedidoAcao(id) {
  const negado = await negarSemAcesso("acao.pedidos.vincularCliente", "executar");
  if (negado) return negado;
  if (!ehId(id)) return INVALIDO;
  return protegendo(async () => revalidar(id, await criarClienteDoPedido(id)));
}

export async function buscarClientesAcao(texto) {
  const negado = await negarSemAcesso("acao.pedidos.vincularCliente", "executar");
  if (negado) return { ...negado, clientes: [] };
  return protegendo(async () => {
    // Sem o dado pessoal, a janela lista so nome e nivel (o CPF/CNPJ nao vai ao navegador).
    const { pode } = await sessaoDeAcessos();
    return { ok: true, clientes: projetarClientesDaBusca(await buscarClientesParaVincular(String(texto ?? "").slice(0, 80)), pode) };
  });
}

/**
 * "Aceitar divergência" do lucro (pedido do dono em 09/11/2026): o codigo do Conferido e pedido na tela; aqui vale o acesso
 * da acao. Guarda quem aceitou (o login, ou "pc" no PC sem login) e os valores do momento.
 */
export async function aceitarDivergenciaAcao(id) {
  const negado = await negarSemAcesso("acao.pedidos.aceitarDivergencia", "executar");
  if (negado) return negado;
  if (!ehId(id)) return INVALIDO;
  const sessao = await sessaoDeAcessos();
  const quem = sessao?.login ? String(sessao.login) : sessao?.ambiente === "pc" ? "pc" : null;
  return protegendo(async () => revalidar(id, await aceitarDivergenciaDoLucro(id, quem)));
}
