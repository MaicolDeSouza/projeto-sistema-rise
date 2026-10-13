"use server";

import { revalidatePath } from "next/cache";

import { executarComAcesso } from "@/lib/acessos/servidor";
import { ErroDeUso } from "@/lib/riseAi/erros";
import { avaliarMensagem, carregarMensagem, conversaParaLista, excluirConversa, listarConversas, mensagemParaTela, renomearConversa } from "@/lib/riseAi/conversas";
import { gerarSugestaoParaMensagem } from "@/lib/riseAi/sugestoes";
import { comSessaoDoRiseAi } from "./sessao";

/**
 * Ações do chat (renomear, excluir, avaliar, reler uma mensagem). TODAS passam por `executarComAcesso` com o recurso
 * "Rise AI › Chat" (ver para ler, editar para mudar), conferido no servidor antes de qualquer leitura; a sessão vem
 * dos cabeçalhos do servidor, nunca do navegador. Finas: a regra mora em `src/lib/riseAi/conversas.js`, que já é
 * testado. Devolvem `{ ok, ... }`.
 *
 * Não existe "criar conversa" aqui: "Nova conversa" abre o chat em branco, e a conversa só nasce na primeira pergunta
 * (`responder` a cria). Conversa vazia no histórico seria só ruído.
 */

/** A busca da lista lateral: no título e no texto das mensagens, só nas conversas de quem pergunta. */
export async function buscarConversasAcao(busca) {
  return executarComAcesso("riseAi.chat", "ver", comSessaoDoRiseAi(async (sessao) => {
    const conversas = await listarConversas({ usuario: sessao.usuario, busca: String(busca ?? ""), limite: 50 });
    return { conversas: conversas.map(conversaParaLista) };
  }));
}

export async function renomearConversaAcao(id, formData) {
  return executarComAcesso("riseAi.chat", "editar", comSessaoDoRiseAi(async (sessao) => {
    await renomearConversa(id, formData.get("titulo"), sessao);
    revalidatePath("/rise-ai", "layout");
    return {};
  }));
}

export async function excluirConversaAcao(id) {
  return executarComAcesso("riseAi.chat", "editar", comSessaoDoRiseAi(async (sessao) => {
    await excluirConversa(id, sessao);
    revalidatePath("/rise-ai", "layout");
    return {};
  }));
}

/** A mensagem pronta para a tela (o `fim` do fluxo só traz o id): a do usuário, ou qualquer uma para o administrador. */
export async function carregarMensagemAcao(id) {
  return executarComAcesso("riseAi.chat", "ver", comSessaoDoRiseAi(async (sessao) => {
    const mensagem = await carregarMensagem(id, sessao);
    if (!mensagem) throw new ErroDeUso("Mensagem não encontrada.");
    return { mensagem: mensagemParaTela(mensagem) };
  }));
}

/**
 * 👍, 👎 ou tirar a avaliação. `avaliacao` chega do formulário como "1", "-1" ou "0" (tirar); o comentário é opcional.
 *
 * O 👎 dispara, EM SEGUNDO PLANO, a sugestão de correção da IA para o dono aprovar à noite: a esposa não espera o
 * modelo (um local leva dezenas de segundos) e nada do que ele propõe vale sem a aprovação do dono. Se a sugestão
 * falhar, a resposta ganha o aviso `sugestao_nao_gerada` e o administrador pede de novo na Revisão.
 */
export async function avaliarMensagemAcao(id, formData) {
  return executarComAcesso("riseAi.chat", "editar", comSessaoDoRiseAi(async (sessao) => {
    const bruto = String(formData.get("avaliacao") ?? "");
    const avaliacao = bruto === "1" ? 1 : bruto === "-1" ? -1 : bruto === "0" ? null : undefined;
    if (avaliacao === undefined) throw new ErroDeUso("Avaliação inválida.");
    const avaliada = await avaliarMensagem(id, { avaliacao, comentario: formData.get("comentario"), usuario: sessao.usuario, administrador: sessao.administrador });
    if (avaliacao === -1) {
      // Sem `revalidatePath` aqui: depois que a ação responde, o contexto do Next já foi embora. A Revisão é sempre
      // dinâmica e relê o banco ao abrir.
      void gerarSugestaoParaMensagem(id, { comentario: formData.get("comentario") ?? "" }).catch((erro) =>
        console.error("[rise-ai] sugestão ao 👎 não gerada:", erro.message),
      );
    }
    revalidatePath("/rise-ai", "layout");
    return { mensagem: mensagemParaTela(avaliada) };
  }));
}
