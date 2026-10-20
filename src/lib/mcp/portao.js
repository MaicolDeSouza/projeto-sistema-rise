import { permissoesDoLogin } from "@/lib/acessos/banco";

import { ESCOPO, cabecalhoDeDesafio, origemDoRise, respostaJson } from "./oauth.js";
import { validarTokenDeAcesso } from "./oauthBanco.js";

/**
 * O portao do /mcp (plano de 20/10/2026): confere o token e monta, A CADA CHAMADA, a sessao de Acessos do login dono dele.
 * Nada fica em memoria entre um pedido e outro: desativar o usuario ou mudar a funcao dele na tela vale na proxima pergunta
 * do Claude.
 *
 * - 401 (com o desafio `WWW-Authenticate`): sem token, token invalido, vencido, desconectado, ou o login nao existe / esta
 *   inativo. A mesma mensagem para todos: quem tenta nao descobre qual foi. E o 401 que faz o claude.ai abrir o login.
 * - 403 `insufficient_scope`: o login existe e esta ativo, mas a funcao dele nao tem "Rise AI › Acesso pelo Claude e
 *   ChatGPT" em editar.
 * - 503: o banco nao respondeu. Um 401 aqui mandaria a pessoa fazer login de novo por um problema que nao e dela.
 */

/** O recurso de Acessos que libera o MCP (o id do antigo chat, mantido de proposito: mudar um id apaga a permissao). */
export const RECURSO_DO_MCP = "riseAi.chat";

const DESCRICAO_INVALIDO = "Token inválido ou vencido.";

/**
 * @param {Request} request
 * @param {{ env?: object, agora?: number, dependencias?: { validarTokenDeAcesso?: Function, permissoesDoLogin?: Function } }} [opcoes]
 * @returns {Promise<{ ok: true, autenticacao: { login: string, clienteId: string, clienteNome: string, escopos: string[], familia: string,
 *   expiraEm: Date, administrador: boolean, pode: (id: string, nivel: string) => boolean } } | { ok: false, resposta: Response }>}
 */
export async function exigirTokenMcp(request, { env = process.env, agora = Date.now(), dependencias = {} } = {}) {
  const validar = dependencias.validarTokenDeAcesso ?? validarTokenDeAcesso;
  const lerPermissoes = dependencias.permissoesDoLogin ?? permissoesDoLogin;
  const origem = origemDoRise(request, env);

  const recusar = (status, erro, descricao, extra = {}) => ({
    ok: false,
    resposta: respostaJson(status, { error: erro, error_description: descricao }, extra),
  });
  const invalido = () => recusar(401, "invalid_token", DESCRICAO_INVALIDO, { "www-authenticate": cabecalhoDeDesafio(origem, { erro: "invalid_token", descricao: DESCRICAO_INVALIDO }) });
  const foraDoAr = () => recusar(503, "temporarily_unavailable", "O Rise não conseguiu ler o banco agora. Tente de novo em instantes.", { "retry-after": "30" });

  const autorizacao = request.headers.get("authorization");
  // Sem credencial nenhuma, o desafio vai sem `error` (RFC 6750, secao 3.1): e o convite para o login, nao uma recusa.
  if (autorizacao === null) return recusar(401, "unauthorized", "Este servidor exige login (OAuth).", { "www-authenticate": cabecalhoDeDesafio(origem) });
  const token = /^Bearer\s+(\S+)$/i.exec(autorizacao.trim())?.[1];
  if (!token) return invalido();

  let dados;
  let sessao;
  try {
    dados = await validar(token, { agora });
    if (!dados) return invalido();
    sessao = await lerPermissoes(dados.login, { env });
  } catch (erro) {
    console.error("[mcp] falha ao conferir o token:", erro?.message ?? erro);
    return foraDoAr();
  }
  if (sessao.estado === "erro-banco") return foraDoAr();
  if (sessao.estado !== "ok") return invalido();

  if (!sessao.pode(RECURSO_DO_MCP, "editar")) {
    const descricao = "Sem acesso ao Rise pelo Claude ou ChatGPT.";
    return recusar(403, "insufficient_scope", descricao, { "www-authenticate": cabecalhoDeDesafio(origem, { erro: "insufficient_scope", descricao, escopo: ESCOPO }) });
  }

  return {
    ok: true,
    autenticacao: {
      login: dados.login,
      clienteId: dados.clienteId,
      clienteNome: dados.clienteNome,
      escopos: dados.escopos,
      familia: dados.familia,
      expiraEm: dados.expiraEm,
      administrador: sessao.pode("riseAi.revisao", "ver"),
      pode: sessao.pode,
    },
  };
}

/**
 * O `authInfo` que o SDK entrega ao handler de cada ferramenta (`ctx.http.authInfo`). O texto do token NUNCA vai junto (o SDK
 * pode logar o objeto); a autenticacao inteira, com o `pode`, segue em `extra`.
 */
export function autenticacaoParaSdk(autenticacao) {
  return {
    token: "",
    clientId: autenticacao.clienteId,
    scopes: autenticacao.escopos,
    expiresAt: Math.floor(autenticacao.expiraEm.getTime() / 1000),
    extra: { autenticacao },
  };
}
