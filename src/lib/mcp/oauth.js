import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * As regras puras do OAuth do servidor MCP (plano de 20/10/2026): o Rise e o proprio servidor de autorizacao do /mcp.
 * Sem banco e sem Next: as rotas (`src/app/mcp/oauth/*`, `src/app/.well-known/*`), a tela Autorizar, o portao do /mcp e o
 * teste usam o mesmo arquivo. O que cada metadado diz segue a revisao 2026-07-28 do MCP e o que o claude.ai e o ChatGPT
 * pedem (conferido em 20/10/2026): PKCE S256 obrigatorio, cliente publico (sem segredo), registro dinamico (RFC 7591),
 * `iss` na volta (RFC 9207) e o `resource` preso ao /mcp (RFC 8707).
 */

/** Um escopo so: consultar o Rise (as ferramentas sao de leitura; `anotarDuvida` so grava a propria duvida). */
export const ESCOPO = "consultar";
export const VALIDADE_DO_CODIGO_MS = 5 * 60 * 1000;
export const VALIDADE_DO_ACESSO_S = 3600;
export const VALIDADE_DA_RENOVACAO_MS = 30 * 24 * 60 * 60 * 1000;

const GRANTS = ["authorization_code", "refresh_token"];
const MAXIMO_DE_REDIRECTS = 5;
const MAXIMO_DO_NOME = 60;
const MAXIMO_DO_STATE = 1000;

/**
 * Para onde o Rise devolve o codigo. Uma lista FECHADA: o registro e publico (qualquer um registra um cliente), e um
 * endereco livre levaria o codigo de quem autorizou para quem quisesse. Fora da lista, nada se registra.
 * - claude.ai (os apps hospedados) e o ChatGPT (o retorno com `iss` e o retorno por conector), endereco exato;
 * - o Claude Code, que recebe o codigo na propria maquina: http://localhost/callback e http://127.0.0.1/callback, com
 *   qualquer porta (RFC 8252: a porta do retorno local muda a cada login).
 */
const REDIRECTS_EXATOS = ["https://claude.ai/api/mcp/auth_callback", "https://chatgpt.com/connector_platform_oauth_redirect"];
const CONECTOR_DO_CHATGPT = /^\/connector\/oauth\/[A-Za-z0-9_-]{1,128}$/;
const HOSTS_LOCAIS = ["localhost", "127.0.0.1"];

function urlOuNulo(texto) {
  if (typeof texto !== "string" || !texto) return null;
  try {
    return new URL(texto);
  } catch {
    return null;
  }
}

/** O retorno local do Claude Code: http, localhost ou 127.0.0.1, so o caminho /callback. */
function ehRetornoLocal(url) {
  return url.protocol === "http:" && HOSTS_LOCAIS.includes(url.hostname) && url.pathname === "/callback" && !url.search;
}

/** @param {string} uri */
export function redirectPermitido(uri) {
  const url = urlOuNulo(uri);
  // Usuario/senha na URL e fragmento nao servem a retorno nenhum e confundem quem compara texto.
  if (!url || url.username || url.password || url.hash || String(uri).includes("#")) return false;
  if (ehRetornoLocal(url)) return true;
  if (REDIRECTS_EXATOS.includes(url.href)) return true;
  return url.protocol === "https:" && url.host === "chatgpt.com" && !url.search && CONECTOR_DO_CHATGPT.test(url.pathname);
}

/** O endereco do pedido e o registrado sao o mesmo? Exato, menos a porta do retorno local. */
export function mesmoRedirect(registrado, pedido) {
  const a = urlOuNulo(registrado);
  const b = urlOuNulo(pedido);
  if (!a || !b) return false;
  if (ehRetornoLocal(a) && ehRetornoLocal(b)) return a.hostname === b.hostname && a.pathname === b.pathname;
  return a.href === b.href;
}

/**
 * O endereco publico do Rise, que vira o `issuer` e o `resource`. Na VPS e a APP_URL_PUBLICA: atras do Caddy o pedido
 * chega como http://app:3000, e o claude.ai compara o `resource` com a URL que a pessoa digitou. No PC, a do proprio pedido.
 */
export function origemDoRise(request, env = process.env) {
  const publica = urlOuNulo(String(env.APP_URL_PUBLICA ?? "").trim());
  if (publica) return publica.origin;
  return new URL(request.url).origin;
}

const hostDoPedido = (request) => (request.headers.get("host") ?? new URL(request.url).host).toLowerCase();

/**
 * O pedido veio para o nome do Rise? Na VPS so o host da APP_URL_PUBLICA; no PC so localhost e 127.0.0.1. Evita que um
 * site que aponte o proprio nome para o Rise (DNS rebinding) fale com o /mcp a partir do navegador de alguem.
 */
export function hostPermitido(request, env = process.env) {
  const host = hostDoPedido(request);
  const publica = urlOuNulo(String(env.APP_URL_PUBLICA ?? "").trim());
  if (publica) return host === publica.host.toLowerCase();
  const semPorta = host.replace(/:\d+$/, "");
  return HOSTS_LOCAIS.includes(semPorta);
}

/**
 * Quem chama o /mcp e um servidor (a nuvem do Claude ou do ChatGPT), que nao manda `Origin`. Um navegador sempre manda:
 * so a do proprio Rise passa, e "null" (pagina local, iframe isolado) nao.
 */
export function originPermitida(request, env = process.env) {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  return origin === origemDoRise(request, env);
}

/** Protected Resource Metadata (RFC 9728): onde o claude.ai descobre o servidor de autorizacao do /mcp. */
export function metadadosDoRecurso(origem) {
  return {
    resource: `${origem}/mcp`,
    authorization_servers: [origem],
    scopes_supported: [ESCOPO],
    bearer_methods_supported: ["header"],
    resource_name: "Rise",
  };
}

/** Authorization Server Metadata (RFC 8414). `"none"` + S256: o claude.ai so registra cliente publico com PKCE. */
export function metadadosDoServidor(origem) {
  return {
    issuer: origem,
    authorization_endpoint: `${origem}/mcp/oauth/authorize`,
    token_endpoint: `${origem}/mcp/oauth/token`,
    registration_endpoint: `${origem}/mcp/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: GRANTS,
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [ESCOPO],
    authorization_response_iss_parameter_supported: true,
  };
}

/** O nome que a tela Autorizar mostra: texto de terceiro, sem controle, espacos juntos, no maximo 60. */
function nomeDoCliente(bruto) {
  const limpo = typeof bruto === "string" ? bruto.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim() : "";
  return (limpo || "Cliente MCP").slice(0, MAXIMO_DO_NOME);
}

const subconjunto = (lista, permitidos) => lista === undefined || (Array.isArray(lista) && lista.every((item) => permitidos.includes(item)));

/**
 * O corpo do registro dinamico (RFC 7591). So cliente publico: segredo de cliente nao existe aqui (o metadado diz "none").
 *
 * @returns {{ ok: true, cliente: { nome: string, redirectUris: string[] } } | { ok: false, erro: "invalid_redirect_uri" | "invalid_client_metadata", descricao: string }}
 */
export function validarRegistro(corpo) {
  const falha = (erro, descricao) => ({ ok: false, erro, descricao });
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) return falha("invalid_client_metadata", "O corpo do registro precisa ser um objeto JSON.");
  const uris = corpo.redirect_uris;
  if (!Array.isArray(uris) || uris.length === 0 || uris.length > MAXIMO_DE_REDIRECTS || !uris.every((uri) => typeof uri === "string")) {
    return falha("invalid_redirect_uri", `Informe de 1 a ${MAXIMO_DE_REDIRECTS} redirect_uris.`);
  }
  if (!uris.every(redirectPermitido)) return falha("invalid_redirect_uri", "Endereço de retorno não permitido.");
  if (corpo.token_endpoint_auth_method !== undefined && corpo.token_endpoint_auth_method !== "none") {
    return falha("invalid_client_metadata", 'Só cliente público: token_endpoint_auth_method precisa ser "none".');
  }
  if (!subconjunto(corpo.grant_types, GRANTS)) return falha("invalid_client_metadata", "grant_types não suportado.");
  if (!subconjunto(corpo.response_types, ["code"])) return falha("invalid_client_metadata", "response_types não suportado.");
  return { ok: true, cliente: { nome: nomeDoCliente(corpo.client_name), redirectUris: [...new Set(uris)] } };
}

/** Le um parametro de URLSearchParams ou de objeto; vazio vira null. */
function parametro(params, nome) {
  const valor = typeof params?.get === "function" ? params.get(nome) : params?.[nome];
  return typeof valor === "string" && valor !== "" ? valor : null;
}

const DESAFIO = /^[A-Za-z0-9_-]{43,128}$/;
const VERIFICADOR = /^[A-Za-z0-9._~-]{43,128}$/;

/**
 * O pedido que chega a /mcp/oauth/authorize. `redirecionavel` diz se o erro pode voltar ao endereco do cliente: com o
 * cliente desconhecido ou o endereco fora do registro, NUNCA se redireciona (a tela mostra o erro), senao o Rise viraria
 * um redirecionador aberto.
 *
 * @param {URLSearchParams | Record<string, string>} params
 * @param {{ id: string, redirectUris: string[] } | null} cliente  o cliente de `client_id`, ja lido do banco
 * @param {{ recursoEsperado: string }} opcoes  `<origem>/mcp`
 */
export function validarPedidoDeAutorizacao(params, cliente, { recursoEsperado }) {
  const falha = (erro, descricao, redirecionavel) => ({ ok: false, erro, descricao, redirecionavel });
  if (!cliente || parametro(params, "client_id") !== cliente.id) return falha("invalid_client", "Cliente desconhecido.", false);

  const redirectUri = parametro(params, "redirect_uri");
  if (!redirectUri || !cliente.redirectUris.some((registrado) => mesmoRedirect(registrado, redirectUri))) {
    return falha("invalid_request", "O endereço de retorno não é o registrado por este cliente.", false);
  }

  if (parametro(params, "response_type") !== "code") return falha("unsupported_response_type", 'Só response_type "code".', true);
  const codeChallenge = parametro(params, "code_challenge");
  if (!codeChallenge || parametro(params, "code_challenge_method") !== "S256" || !DESAFIO.test(codeChallenge)) {
    return falha("invalid_request", "PKCE obrigatório, com code_challenge_method S256.", true);
  }
  const resource = parametro(params, "resource") ?? recursoEsperado;
  if (resource !== recursoEsperado) return falha("invalid_target", `O recurso deste servidor é ${recursoEsperado}.`, true);
  const escopos = (parametro(params, "scope") ?? "").split(" ").filter(Boolean);
  if (escopos.some((escopo) => escopo !== ESCOPO)) return falha("invalid_scope", `O único escopo é "${ESCOPO}".`, true);
  const state = parametro(params, "state");
  if (state && state.length > MAXIMO_DO_STATE) return falha("invalid_request", "state longo demais.", true);

  return { ok: true, pedido: { clientId: cliente.id, redirectUri, codeChallenge, state, resource, escopos: [ESCOPO] } };
}

/** O `code_verifier` gera o `code_challenge` guardado? Comparacao em tempo constante. */
export function conferirPkce(codeVerifier, codeChallenge) {
  if (typeof codeVerifier !== "string" || !VERIFICADOR.test(codeVerifier) || typeof codeChallenge !== "string") return false;
  const calculado = Buffer.from(createHash("sha256").update(codeVerifier).digest("base64url"));
  const guardado = Buffer.from(codeChallenge);
  return calculado.length === guardado.length && timingSafeEqual(calculado, guardado);
}

/** 32 bytes aleatorios em base64url: codigo, token de acesso e de renovacao. */
export const gerarSegredo = () => randomBytes(32).toString("base64url");

/** O que o banco guarda no lugar do segredo. SHA-256 basta: o segredo tem 256 bits aleatorios, nao ha o que adivinhar. */
export const hashDoSegredo = (texto) => createHash("sha256").update(String(texto)).digest("hex");

function comParametros(redirectUri, pares) {
  const url = new URL(redirectUri);
  for (const [chave, valor] of pares) if (valor !== undefined && valor !== null && valor !== "") url.searchParams.set(chave, valor);
  return url.toString();
}

/** A volta da autorizacao com o codigo (o `iss` deixa o cliente conferir que foi este servidor que respondeu). */
export const urlDeRetorno = (redirectUri, { code, state, iss }) => comParametros(redirectUri, [["code", code], ["state", state], ["iss", iss]]);

/** A volta com o erro (recusado, escopo invalido...): so para endereco ja conferido como do cliente. */
export const urlDeErro = (redirectUri, { erro, descricao, state, iss }) =>
  comParametros(redirectUri, [["error", erro], ["error_description", descricao], ["state", state], ["iss", iss]]);

/** Resposta JSON do OAuth: nunca em cache (token e codigo nao podem ficar guardados num proxy). */
export function respostaJson(status, corpo, cabecalhos = {}) {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...cabecalhos } });
}

const semAspas = (texto) => String(texto).replace(/["\\]/g, "");

/**
 * O `WWW-Authenticate` do 401/403 do /mcp: o claude.ai so comeca o login com ele, e o `resource_metadata` diz onde estao os
 * metadados (RFC 9728, secao 5.1).
 */
export function cabecalhoDeDesafio(origem, { erro, descricao, escopo } = {}) {
  const partes = [`Bearer resource_metadata="${origem}/.well-known/oauth-protected-resource/mcp"`];
  if (erro) partes.push(`error="${semAspas(erro)}"`);
  if (descricao) partes.push(`error_description="${semAspas(descricao)}"`);
  if (escopo) partes.push(`scope="${semAspas(escopo)}"`);
  return partes.join(", ");
}
