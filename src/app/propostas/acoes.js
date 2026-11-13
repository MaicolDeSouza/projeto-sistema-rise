"use server";

import { revalidatePath } from "next/cache";

import { negarSemAcesso, negarSemAcessos, podeAgora, sessaoDeAcessos } from "@/lib/acessos/servidor";
import {
  buscarProdutosParaProposta,
  criarProposta,
  excluirProposta,
  lerProposta,
  marcarEnviada,
  mudarSituacao,
  produtoParaProposta,
  registrarContato,
  salvarProposta,
  semCusto,
} from "@/lib/propostas/banco";
import { buscarClienteParaProposta, copiarContatoDoBling, enviarClienteAoBling } from "@/lib/propostas/cliente";
import { prisma } from "@/lib/db";

/**
 * As acoes da tela Propostas (spec 2026-11-12). Ver = ler e gerar o PDF; editar = criar e mudar; excluir = o rascunho.
 * Quem nao ve `dado.custo` recebe a proposta sem custo e o Salvar dele preserva o custo gravado.
 */

const revalidar = () => revalidatePath("/propostas", "layout");

async function quemEsta() {
  const sessao = await sessaoDeAcessos();
  return { login: sessao.login || "pc", nome: sessao.usuario?.nome ?? null };
}

/** A proposta como a pessoa pode ve-la. */
export async function propostaParaQuemVe(numero) {
  const proposta = await lerProposta(numero);
  return (await podeAgora("dado.custo", "ver")) ? proposta : semCusto(proposta);
}

export async function criarPropostaAcao() {
  const negado = await negarSemAcesso("tela.propostas", "editar");
  if (negado) return negado;
  const criada = await criarProposta(await quemEsta());
  revalidar();
  return criada;
}

export async function salvarPropostaAcao(numero, entrada) {
  const negado = await negarSemAcesso("tela.propostas", "editar");
  if (negado) return negado;
  const veCusto = await podeAgora("dado.custo", "ver");
  const resultado = await salvarProposta(numero, entrada, { manterCusto: !veCusto });
  if (!resultado.ok) return resultado;
  revalidar();
  return { ...resultado, proposta: await propostaParaQuemVe(numero) };
}

export async function mudarSituacaoAcao(numero, para, extras = {}) {
  const negado = await negarSemAcesso("tela.propostas", "editar");
  if (negado) return negado;
  const resultado = await mudarSituacao(numero, para, extras);
  if (!resultado.ok) return resultado;
  revalidar();
  return { ok: true, proposta: await propostaParaQuemVe(numero) };
}

/** Gerar PDF, copiar o link e o WhatsApp marcam o rascunho como Enviada. Quem so ve nao muda a situacao. */
export async function marcarEnviadaAcao(numero) {
  if (!(await podeAgora("tela.propostas", "editar"))) return { ok: true };
  await marcarEnviada(numero);
  revalidar();
  return { ok: true };
}

export async function registrarContatoAcao(numero, dados) {
  const negado = await negarSemAcesso("tela.propostas", "editar");
  if (negado) return negado;
  const resultado = await registrarContato(numero, { ...dados, quem: (await quemEsta()).nome ?? (await quemEsta()).login });
  if (!resultado.ok) return resultado;
  revalidar();
  return { ok: true, proposta: await propostaParaQuemVe(numero) };
}

export async function excluirPropostaAcao(numero) {
  const negado = await negarSemAcesso("tela.propostas", "excluir");
  if (negado) return negado;
  const resultado = await excluirProposta(numero);
  if (resultado.ok) {
    const { apagarPastaDaProposta } = await import("@/lib/propostas/arquivos");
    await apagarPastaDaProposta(resultado.id).catch(() => {});
    revalidar();
  }
  return resultado;
}

// ---------------------------------------------------------------- cliente

export async function buscarClienteAcao(texto) {
  if (!(await podeAgora("tela.propostas", "ver"))) return { rise: [], bling: [], erroBling: null };
  return buscarClienteParaProposta(String(texto ?? "").slice(0, 80));
}

/** "Usar este" num contato do Bling: copia para o Rise (com documento) ou devolve os dados para o provisorio. */
export async function usarContatoDoBlingAcao(blingId) {
  const negado = await negarSemAcesso("tela.propostas", "editar");
  if (negado) return negado;
  const resultado = await copiarContatoDoBling(String(blingId ?? "").replace(/\D/g, ""));
  if (!resultado.ok || !resultado.clienteId) return resultado;
  return { ok: true, cliente: await clienteParaProposta(resultado.clienteId) };
}

/** Os dados do cliente que a proposta usa ao ligar: contatos (A/C), a transportadora e a 1a condicao preferidas. */
export async function clienteParaPropostaAcao(clienteId) {
  if (!(await podeAgora("tela.propostas", "ver"))) return null;
  return clienteParaProposta(String(clienteId ?? ""));
}

async function clienteParaProposta(clienteId) {
  return prisma.cliente.findUnique({
    where: { id: clienteId },
    select: {
      id: true,
      nome: true,
      nomeFantasia: true,
      documento: true,
      telefone: true,
      email: true,
      blingContatoId: true,
      padraoPropostaId: true,
      transportadoraId: true,
      condicoesPreferidas: { orderBy: { nome: "asc" }, take: 1, select: { id: true } },
      contatos: { orderBy: { nome: "asc" }, select: { id: true, nome: true, cargo: true, telefone: true, email: true } },
    },
  });
}

export async function enviarClienteAoBlingAcao(clienteId) {
  const negado = await negarSemAcesso("tela.propostas", "editar");
  if (negado) return negado;
  const resultado = await enviarClienteAoBling(String(clienteId ?? ""));
  if (resultado.ok) revalidar();
  return resultado;
}

// ---------------------------------------------------------------- itens

export async function buscarProdutosAcao(texto) {
  if (!(await podeAgora("tela.propostas", "ver"))) return [];
  return buscarProdutosParaProposta(String(texto ?? "").slice(0, 80));
}

export async function produtoParaPropostaAcao(produtoId) {
  const negado = await negarSemAcesso("tela.propostas", "editar");
  if (negado) return null;
  const produto = await produtoParaProposta(produtoId);
  if (!produto) return null;
  return (await podeAgora("dado.custo", "ver")) ? produto : { ...produto, custoUnitario: null };
}

// ---------------------------------------------------------------- link publico, anexos e pedido de venda

export async function linkPublicoAcao(numero) {
  const negado = await negarSemAcesso("tela.propostas", "ver");
  if (negado) return negado;
  const { linkPublicoDaProposta } = await import("@/lib/propostas/linkPublico");
  const resultado = await linkPublicoDaProposta(numero);
  if (resultado.ok) await marcarEnviadaAcao(numero);
  return resultado;
}

export async function anexarCotacaoAcao(formData) {
  const negado = await negarSemAcesso("tela.propostas", "editar");
  if (negado) return negado;
  const { anexarCotacao } = await import("@/lib/propostas/arquivos");
  const resultado = await anexarCotacao(String(formData.get("numero") ?? ""), formData.getAll("arquivo"));
  if (!resultado.ok) return resultado;
  revalidar();
  return { ok: true, proposta: await propostaParaQuemVe(formData.get("numero")) };
}

/** Foto do item avulso: grava na pasta da proposta e devolve o nome; o item so a guarda no proximo Salvar. */
export async function enviarFotoDoItemAcao(formData) {
  const negado = await negarSemAcesso("tela.propostas", "editar");
  if (negado) return negado;
  const { gravarFotoDoItem } = await import("@/lib/propostas/arquivos");
  return gravarFotoDoItem(String(formData.get("numero") ?? ""), formData.get("foto"));
}

export async function excluirAnexoAcao(numero, anexoId) {
  const negado = await negarSemAcesso("tela.propostas", "editar");
  if (negado) return negado;
  const { excluirAnexo } = await import("@/lib/propostas/arquivos");
  const resultado = await excluirAnexo(numero, anexoId);
  if (!resultado.ok) return resultado;
  revalidar();
  return { ok: true, proposta: await propostaParaQuemVe(numero) };
}

export async function gerarPedidoDeVendaAcao(numero) {
  const negado = await negarSemAcessos(["tela.propostas", "editar"], ["acao.propostas.pedidoDeVenda", "executar"]);
  if (negado) return negado;
  const { gerarPedidoDeVenda } = await import("@/lib/propostas/pedidoDeVenda");
  const resultado = await gerarPedidoDeVenda(numero);
  if (!resultado.ok) return resultado;
  revalidar();
  return { ...resultado, proposta: await propostaParaQuemVe(numero) };
}

/** O que a janela "Gerar pedido de venda" mostra antes de confirmar. */
export async function conferirPedidoDeVendaAcao(numero) {
  const negado = await negarSemAcesso("tela.propostas", "ver");
  if (negado) return negado;
  const { conferirPedidoDeVenda } = await import("@/lib/propostas/pedidoDeVenda");
  return conferirPedidoDeVenda(numero);
}
