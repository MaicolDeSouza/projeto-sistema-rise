"use server";

import { revalidatePath } from "next/cache";

import { ErroDeUso } from "@/lib/riseAi/erros";
import { avaliarMensagem, carregarMensagem, conversaParaLista, excluirConversa, listarConversas, mensagemParaTela, renomearConversa } from "@/lib/riseAi/conversas";
import { sessaoAtual } from "./sessao";

/**
 * Ações do chat (renomear, excluir, avaliar, reler uma mensagem). Finas: conferem quem está pedindo (a sessão vem dos
 * cabeçalhos do servidor, nunca do navegador) e chamam `src/lib/riseAi/conversas.js`, que já é testado. Devolvem
 * `{ ok, ... }` — erro de uso vira a mensagem na tela; defeito nosso, um aviso genérico.
 *
 * Não existe "criar conversa" aqui: "Nova conversa" abre o chat em branco, e a conversa só nasce na primeira pergunta
 * (`responder` a cria). Conversa vazia no histórico seria só ruído.
 */

const AVISO_GENERICO = "Não foi possível concluir agora. Tente de novo em instantes.";

async function executar(trabalho) {
  try {
    return { ok: true, ...(await trabalho(await sessaoAtual())) };
  } catch (erro) {
    if (erro instanceof ErroDeUso) return { ok: false, erro: erro.message };
    console.error("[rise-ai] falha na ação:", erro);
    return { ok: false, erro: AVISO_GENERICO };
  }
}

/** A busca da lista lateral: no título e no texto das mensagens, só nas conversas de quem pergunta. */
export async function buscarConversasAcao(busca) {
  return executar(async (sessao) => {
    const conversas = await listarConversas({ usuario: sessao.usuario, busca: String(busca ?? ""), limite: 50 });
    return { conversas: conversas.map(conversaParaLista) };
  });
}

export async function renomearConversaAcao(id, formData) {
  return executar(async (sessao) => {
    await renomearConversa(id, formData.get("titulo"), sessao);
    revalidatePath("/rise-ai", "layout");
    return {};
  });
}

export async function excluirConversaAcao(id) {
  return executar(async (sessao) => {
    await excluirConversa(id, sessao);
    revalidatePath("/rise-ai", "layout");
    return {};
  });
}

/** A mensagem pronta para a tela (o `fim` do fluxo só traz o id): a do usuário, ou qualquer uma para o administrador. */
export async function carregarMensagemAcao(id) {
  return executar(async (sessao) => {
    const mensagem = await carregarMensagem(id, sessao);
    if (!mensagem) throw new ErroDeUso("Mensagem não encontrada.");
    return { mensagem: mensagemParaTela(mensagem) };
  });
}

/**
 * 👍, 👎 ou tirar a avaliação. `avaliacao` chega do formulário como "1", "-1" ou "0" (tirar); o comentário é opcional.
 * (A sugestão de correção ao 👎 entra na Tarefa 12.)
 */
export async function avaliarMensagemAcao(id, formData) {
  return executar(async (sessao) => {
    const bruto = String(formData.get("avaliacao") ?? "");
    const avaliacao = bruto === "1" ? 1 : bruto === "-1" ? -1 : bruto === "0" ? null : undefined;
    if (avaliacao === undefined) throw new ErroDeUso("Avaliação inválida.");
    const avaliada = await avaliarMensagem(id, { avaliacao, comentario: formData.get("comentario"), usuario: sessao.usuario, administrador: sessao.administrador });
    revalidatePath("/rise-ai", "layout");
    return { mensagem: mensagemParaTela(avaliada) };
  });
}
