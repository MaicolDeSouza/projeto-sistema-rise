import { urlDeErro, urlDeRetorno, validarPedidoDeAutorizacao } from "./oauth.js";
import { carregarCliente, emitirCodigo } from "./oauthBanco.js";

/**
 * A tela /mcp/oauth/authorize (atras do login do Tinyauth): conferir o pedido para MOSTRAR a decisao, e aplicar a decisao.
 * Erro sem endereco de volta (cliente desconhecido, retorno fora do registro) fica na tela: nunca se redireciona para onde
 * nao se conhece, senao o Rise viraria um redirecionador aberto.
 */

const CAMPOS = ["client_id", "redirect_uri", "code_challenge", "code_challenge_method", "state", "resource", "scope"];

/** Os parametros do pedido como texto (URLSearchParams, objeto do `searchParams` ou FormData); o resto e ignorado. */
function lerParams(params) {
  const ler = (nome) => (typeof params?.get === "function" ? params.get(nome) : params?.[nome]);
  return Object.fromEntries(["response_type", ...CAMPOS].map((nome) => [nome, typeof ler(nome) === "string" ? ler(nome) : ""]));
}

async function conferir(params, origem) {
  const cliente = await carregarCliente(params.client_id);
  const validado = validarPedidoDeAutorizacao(params, cliente, { recursoEsperado: `${origem}/mcp` });
  if (validado.ok) return { ok: true, cliente, pedido: validado.pedido };
  if (!validado.redirecionavel) return { ok: false, motivo: validado.descricao };
  return { ok: false, motivo: validado.descricao, url: urlDeErro(params.redirect_uri, { erro: validado.erro, descricao: validado.descricao, state: params.state, iss: origem }) };
}

/** Para onde o codigo volta, em palavras: o host de quem pediu, ou "este computador" no retorno local do Claude Code. */
function destinoDe(redirectUri) {
  const url = new URL(redirectUri);
  return url.protocol === "http:" ? "este computador (Claude Code)" : url.host;
}

/**
 * Para a pagina: quem pede, para onde o codigo volta e os campos que o formulario reenvia (nenhum e segredo: o PKCE manda
 * so o `code_challenge`, e o codigo nasce depois do clique).
 *
 * @returns {Promise<{ ok: true, cliente: { nome: string }, destino: string, params: Record<string, string> } | { ok: false, motivo: string, url?: string }>}
 */
export async function prepararAutorizacao(bruto, { origem }) {
  const params = lerParams(bruto);
  const conferido = await conferir(params, origem);
  if (!conferido.ok) return conferido;
  return {
    ok: true,
    cliente: { nome: conferido.cliente.nome },
    destino: destinoDe(conferido.pedido.redirectUri),
    params: Object.fromEntries(CAMPOS.map((nome) => [nome, params[nome]])),
  };
}

/**
 * O clique em Autorizar ou Recusar. O pedido e conferido de novo (o formulario vem do navegador). Autorizar emite o codigo do
 * `login` de quem esta na tela e volta ao cliente com `code`, `state` e `iss`; Recusar volta com `access_denied`.
 *
 * @param {{ params: object, login: string, decisao: string, origem: string }} entrada
 * @returns {Promise<{ ok: true, url: string } | { ok: false, motivo: string, url?: string }>}
 */
export async function decidirAutorizacao({ params: bruto, login, decisao, origem }, { agora } = {}) {
  // O formulario nao reenvia o response_type: a pagina so o mostra depois de conferido como "code".
  const params = { ...lerParams(bruto), response_type: "code" };
  const conferido = await conferir(params, origem);
  if (!conferido.ok) return conferido;
  const { pedido } = conferido;

  if (decisao === "recusar") return { ok: true, url: urlDeErro(pedido.redirectUri, { erro: "access_denied", descricao: "A pessoa recusou o acesso.", state: pedido.state, iss: origem }) };
  if (decisao !== "autorizar") return { ok: false, motivo: "Decisão inválida." };
  if (!login) return { ok: false, motivo: "Entre no Rise para autorizar." };

  const code = await emitirCodigo(
    { clienteId: pedido.clientId, login, redirectUri: pedido.redirectUri, codeChallenge: pedido.codeChallenge, resource: pedido.resource, escopos: pedido.escopos },
    agora ? { agora } : {},
  );
  return { ok: true, url: urlDeRetorno(pedido.redirectUri, { code, state: pedido.state, iss: origem }) };
}
