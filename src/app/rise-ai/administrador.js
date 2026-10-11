import { exigirAdministrador } from "@/lib/riseAi/acesso";
import { ErroDeUso } from "@/lib/riseAi/erros";
import { sessaoAtual } from "./sessao";

/**
 * O invólucro das Server Actions de administração do Rise AI (Revisão, conhecimento, configurações). Confere, no
 * servidor e ANTES de qualquer leitura, que quem pede é administrador — esconder o botão na tela não protege nada — e
 * devolve `{ ok, ... }`: erro de uso vira a mensagem na tela, defeito nosso vira um aviso genérico (o detalhe fica só no
 * log do servidor).
 *
 * Módulo de servidor comum (sem "use server"): não é uma ação chamável pelo navegador.
 *
 * @template T
 * @param {(sessao: { usuario: string, administrador: boolean }) => Promise<T>} trabalho  devolve um objeto; um `ok: false` dele vence o `ok: true`
 */
export async function executarComoAdministrador(trabalho) {
  try {
    const sessao = await sessaoAtual();
    exigirAdministrador(sessao);
    return { ok: true, ...(await trabalho(sessao)) };
  } catch (erro) {
    if (erro instanceof ErroDeUso) return { ok: false, erro: erro.message };
    console.error("[rise-ai] falha na ação de administração:", erro);
    return { ok: false, erro: "Não foi possível concluir agora. Tente de novo em instantes." };
  }
}
