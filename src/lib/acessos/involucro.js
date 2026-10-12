import { ErroDeUso } from "@/lib/riseAi/erros";
import { ErroDeAcesso } from "./erros.js";
import { recursoPorId } from "./recursos.js";

/**
 * O involucro de toda Server Action (spec §4, "Cobertura total"): confere o recurso no servidor ANTES de qualquer
 * leitura (esconder o botao nao protege nada; a acao e chamavel do console) e devolve sempre `{ ok, ... }`. Erro de uso
 * vira a mensagem na tela; defeito nosso vira um aviso generico (o detalhe so no log do servidor).
 *
 * Puro: a sessao vem por `obterSessao`, para o teste rodar sem o Next. O `servidor.js` o liga a `sessaoDeAcessos`.
 *
 * @template T
 * @param {() => Promise<{ pode: (id: string, nivel: string) => boolean }>} obterSessao
 * @param {string} id  recurso do catalogo
 * @param {string} nivel
 * @param {(sessao: object) => Promise<T>} trabalho  devolve um objeto; um `ok: false` dele vence o `ok: true`
 */
export async function executarComSessao(obterSessao, id, nivel, trabalho) {
  try {
    const sessao = await obterSessao();
    if (!sessao?.pode?.(id, nivel)) throw new ErroDeAcesso(id, nivel);
    return { ok: true, ...(await trabalho(sessao)) };
  } catch (erro) {
    if (erro instanceof ErroDeAcesso) {
      return { ok: false, erro: `Sem permissão para ${recursoPorId(erro.recurso)?.rotulo ?? "isso"}.` };
    }
    if (erro instanceof ErroDeUso) return { ok: false, erro: erro.message };
    console.error("[acessos] falha na ação:", erro);
    return { ok: false, erro: "Não foi possível concluir agora. Tente de novo em instantes." };
  }
}
