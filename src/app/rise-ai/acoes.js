"use server";

import { revalidatePath } from "next/cache";

import { executarComAcesso } from "@/lib/acessos/servidor";
import { desconectar, desconectarDaEquipe } from "@/lib/mcp/conexoes";
import { ErroDeUso } from "@/lib/riseAi/erros";
import { avaliarMensagem, mensagemParaTela } from "@/lib/riseAi/conversas";
import { gerarSugestaoParaMensagem } from "@/lib/riseAi/sugestoes";
import { comSessaoDoRiseAi } from "./sessao";

/**
 * Ações do Rise AI fora da Revisão e das Configurações: avaliar uma resposta e desconectar o Claude ou o ChatGPT. TODAS
 * passam por `executarComAcesso` com o recurso "Rise AI › Acesso pelo Claude e ChatGPT" (`riseAi.chat`), conferido no
 * servidor antes de qualquer leitura; a sessão vem dos cabeçalhos do servidor, nunca do navegador. Devolvem `{ ok, ... }`.
 *
 * O chat interno saiu (decisão C1 do dono, 20/10/2026), e com ele buscar, renomear e excluir conversa e reler mensagem.
 */

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

/** Desconectar uma conexão da aba Conexões: só a do próprio login (o token cai no próximo pedido do Claude ou do ChatGPT). */
export async function desconectarAcao(familia) {
  return executarComAcesso("riseAi.chat", "editar", async (sessao) => {
    await desconectar(String(familia ?? ""), sessao.login);
    revalidatePath("/rise-ai");
    return {};
  });
}

/**
 * Desconectar a conexao de outra pessoa da equipe (aba Conexoes, "Conexoes da equipe"): so o Administrador, pelo recurso
 * "Usuarios e funcoes" (nao delegavel), o mesmo que define quem entra no Rise.
 */
export async function desconectarDaEquipeAcao(familia) {
  return executarComAcesso("tela.configuracoes.usuarios", "editar", async () => {
    await desconectarDaEquipe(String(familia ?? ""));
    revalidatePath("/rise-ai");
    return {};
  });
}
