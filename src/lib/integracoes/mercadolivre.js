import { config, exigirTravaLiberada } from "./config";
import { limitar, requisitar } from "./httpClient";
import { lerConexao, lerSegredo, salvarConexao } from "./conexoes";

/**
 * Mercado Livre.
 *
 * Diferencas em relacao ao Bling:
 *  - client_id/client_secret vao no CORPO da requisicao, nao em header Basic.
 *  - o redirect_uri precisa ser HTTPS e o ML RECUSA "localhost" — por isso o
 *    callback mora em sistema-rise.localtest.me (dominio publico que resolve
 *    para 127.0.0.1, sem nada trafegar pela internet).
 *  - o access token dura 6 horas; o refresh exige o escopo offline_access.
 *  - o refresh token e de uso unico: cada renovacao devolve um novo.
 */

const SERVICO = "MERCADO_LIVRE";
const URL_AUTORIZAR = "https://auth.mercadolivre.com.br/authorization";
const URL_TOKEN = "https://api.mercadolibre.com/oauth/token";
const API = "https://api.mercadolibre.com";

const MAX_POR_SEGUNDO = 8;
const MARGEM_RENOVACAO_MS = 5 * 60 * 1000;

async function pedirToken(corpo) {
  const { ok, status, dados } = await requisitar({
    servico: SERVICO,
    url: URL_TOKEN,
    metodo: "POST",
    corpo: new URLSearchParams({
      client_id: config.mercadoLivre.clientId,
      client_secret: config.mercadoLivre.clientSecret,
      ...corpo,
    }),
    tentativas: 1,
  });

  if (!ok) {
    const detalhe = dados?.message ?? dados?.error ?? `HTTP ${status}`;
    throw new Error(`Mercado Livre recusou o pedido de token: ${detalhe}`);
  }

  return dados;
}

async function guardar(dados, anterior) {
  const expiraEm = new Date(Date.now() + Number(dados.expires_in ?? 0) * 1000);

  await salvarConexao(SERVICO, {
    segredo: {
      accessToken: dados.access_token,
      // Uso unico: o novo precisa substituir o anterior na mesma escrita.
      refreshToken: dados.refresh_token ?? anterior?.refreshToken ?? null,
      userId: dados.user_id ?? anterior?.userId ?? null,
      // O app que gerou o token (desde 08/10/2026): a copia de desenvolvimento so devolve ao PC o token do
      // app do proprio PC; o da VPS, vindo do dump, e apagado, porque renova-lo derrubaria a producao.
      clientId: config.mercadoLivre.clientId ?? null,
    },
    status: "CONECTADO",
    escopos: dados.scope ?? null,
    expiraEm,
    conectadoEm: new Date(),
  });

  return dados.access_token;
}

export function iniciarAutorizacao(state) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.mercadoLivre.clientId,
    redirect_uri: config.mercadoLivre.redirectUri,
    state,
  });
  return `${URL_AUTORIZAR}?${params}`;
}

export async function concluirAutorizacao(code) {
  const dados = await pedirToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.mercadoLivre.redirectUri,
  });
  return guardar(dados, null);
}

export async function obterAccessToken() {
  const segredo = await lerSegredo(SERVICO);

  if (!segredo?.accessToken) {
    throw new Error(
      'Mercado Livre não conectado. Use "Conectar" na tela Integrações.',
    );
  }

  const conexao = await lerConexao(SERVICO);
  const aindaVale =
    conexao?.expiraEm &&
    conexao.expiraEm.getTime() - Date.now() > MARGEM_RENOVACAO_MS;
  if (aindaVale) return segredo.accessToken;

  if (!segredo.refreshToken) {
    throw new Error(
      "Token do Mercado Livre expirou e não há refresh token. Confirme que o " +
        "escopo offline_access está marcado no aplicativo e reconecte.",
    );
  }

  const dados = await pedirToken({
    grant_type: "refresh_token",
    refresh_token: segredo.refreshToken,
  });

  return guardar(dados, segredo);
}

async function chamar(metodo, caminho, { params, corpo, tentativas } = {}) {
  if (metodo !== "GET") exigirTravaLiberada(SERVICO);

  const token = await obterAccessToken();
  const url = new URL(`${API}${caminho}`);

  for (const [chave, valor] of Object.entries(params ?? {})) {
    if (valor !== undefined && valor !== null && valor !== "") {
      url.searchParams.set(chave, String(valor));
    }
  }

  await limitar(SERVICO, MAX_POR_SEGUNDO);

  return requisitar({
    servico: SERVICO,
    url: url.toString(),
    metodo,
    headers: { Authorization: `Bearer ${token}` },
    corpo,
    ...(tentativas ? { tentativas } : {}),
  });
}

export const mlGet = (caminho, params) => chamar("GET", caminho, { params });

// Escrita: UMA tentativa so. Uma resposta perdida nao quer dizer que o ML nao recebeu, e repetir
// a criacao de um anuncio criaria dois iguais no ar. Todas passam pela trava ML_PUBLICACAO em `chamar`.
export const mlPost = (caminho, corpo) => chamar("POST", caminho, { corpo, tentativas: 1 });
export const mlPut = (caminho, corpo) => chamar("PUT", caminho, { corpo, tentativas: 1 });

/**
 * Envio binario de foto (`POST /pictures/items/upload`): multipart com o campo `file`, como a
 * documentacao do ML pede (o endpoint so aceita o arquivo direto, nao endereco).
 */
export function mlUpload(caminho, { bytes, nome, tipo }) {
  const formulario = new FormData();
  formulario.append("file", new Blob([bytes], { type: tipo }), nome);
  return chamar("POST", caminho, { corpo: formulario, tentativas: 1 });
}

// Guardado em memoria, e nao gravado na conexao: regravar o segredo aqui poderia devolver um
// refresh token ja queimado (ele e de uso unico e pode ter sido trocado no meio desta leitura).
let usuarioIdEmMemoria = null;

/**
 * O id do vendedor no ML (algumas leituras, como o frete do vendedor, levam ele no caminho).
 * Vem do segredo, gravado a cada troca de token (`user_id`); sem ele, pergunta a `/users/me`.
 */
export async function obterUsuarioId() {
  const segredo = await lerSegredo(SERVICO);
  if (segredo?.userId) return String(segredo.userId);
  if (usuarioIdEmMemoria) return usuarioIdEmMemoria;

  const { ok, status, dados } = await mlGet("/users/me");
  if (!ok || !dados?.id) {
    throw new Error(`Mercado Livre: não foi possível identificar a conta (HTTP ${status}).`);
  }
  usuarioIdEmMemoria = String(dados.id);
  return usuarioIdEmMemoria;
}

/**
 * Teste de conexao: identifica a conta.
 *
 * `/users/me` devolve nickname, id e as tags da conta — inclusive
 * `user_product_seller`, que diz se a conta ja esta no modelo User Products.
 * Isso decide o caminho de publicacao do bloco Criar Anuncios.
 */
export async function testar() {
  const { ok, status, duracaoMs, dados } = await mlGet("/users/me");

  if (!ok) {
    const detalhe = dados?.message ?? dados?.error ?? `HTTP ${status}`;
    return { ok: false, latenciaMs: duracaoMs, erro: String(detalhe) };
  }

  const tags = dados?.tags ?? [];
  const userProducts = tags.includes("user_product_seller");

  return {
    ok: true,
    latenciaMs: duracaoMs,
    conta: `${dados.nickname} (${dados.id})`,
    detalhe: `Site ${dados.site_id} · modelo ${
      userProducts ? "User Products" : "classico"
    }`,
  };
}

export const conector = {
  id: SERVICO,
  nome: "Mercado Livre",
  descricao: "Marketplace — publicação dos anúncios",
  tipoAuth: "oauth2",
  // O fluxo precisa comecar no MESMO dominio para onde o ML devolve: cookie
  // nao atravessa dominio, e o state se perderia na volta.
  origemOAuth: new URL(config.mercadoLivre.redirectUri).origin,
  configurado: Boolean(
    config.mercadoLivre.clientId && config.mercadoLivre.clientSecret,
  ),
  faltando: [
    ...(config.mercadoLivre.clientId ? [] : ["ML_CLIENT_ID"]),
    ...(config.mercadoLivre.clientSecret ? [] : ["ML_CLIENT_SECRET"]),
  ],
  // A lista de aplicacoes do DevCenter (client id, secret, redirect URIs, escopos), como no cartao do Bling.
  painel: {
    url: "https://developers.mercadolivre.com.br/devcenter/new-list-app",
    rotulo: "Link configuração API",
  },
  iniciarAutorizacao,
  concluirAutorizacao,
  testar,
};
