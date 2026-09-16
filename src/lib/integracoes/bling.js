import { config, exigirTravaLiberada } from "./config";
import { limitar, requisitar } from "./httpClient";
import { lerConexao, lerSegredo, salvarConexao } from "./conexoes";

/**
 * Bling API v3.
 *
 * Particularidades que causam a maioria dos erros (confirmadas na pratica):
 *  - client_id/client_secret vao no header Authorization: Basic, NAO no corpo.
 *  - a URL de autorizacao tem "/b/" no caminho; a de token NAO tem.
 *  - o "code" da autorizacao vale apenas 1 minuto.
 *  - o refresh_token dura 30 dias e ROTACIONA: sem salvar o novo, perde-se o
 *    acesso e e preciso reautorizar na mao.
 *  - 20 pedidos de token em 60 segundos bloqueiam o IP por 60 minutos.
 *  - limite de 3 requisicoes por segundo da conta inteira, nao por endpoint.
 */

const SERVICO = "BLING";
// Desde 15/09/2026 o Bling recusa chamadas de API em www.bling.com.br ("utilize
// o endpoint oficial: api.bling.com.br"). O token responde igual nos dois hosts;
// a autorizacao continua em www porque e a pagina que o navegador abre.
const URL_AUTORIZAR = "https://www.bling.com.br/b/Api/v3/oauth/authorize";
const URL_TOKEN = "https://api.bling.com.br/Api/v3/oauth/token";
const API = "https://api.bling.com.br/Api/v3";

const MAX_POR_SEGUNDO = 3;
const MARGEM_RENOVACAO_MS = 5 * 60 * 1000;

function cabecalhoBasic() {
  const credenciais = `${config.bling.clientId}:${config.bling.clientSecret}`;
  return `Basic ${Buffer.from(credenciais).toString("base64")}`;
}

async function pedirToken(corpo) {
  const { ok, status, dados } = await requisitar({
    servico: SERVICO,
    url: URL_TOKEN,
    metodo: "POST",
    headers: { Authorization: cabecalhoBasic() },
    corpo: new URLSearchParams(corpo),
    tentativas: 1, // 20 pedidos em 60s bloqueiam o IP: nunca insistir sozinho
  });

  if (!ok) {
    const detalhe =
      dados?.error?.description ?? dados?.error ?? `HTTP ${status}`;
    throw new Error(`Bling recusou o pedido de token: ${detalhe}`);
  }

  return dados;
}

/** Guarda os tokens ja com o instante de expiracao calculado. */
async function guardar(dados, anterior) {
  const expiraEm = new Date(Date.now() + Number(dados.expires_in ?? 0) * 1000);

  await salvarConexao(SERVICO, {
    segredo: {
      accessToken: dados.access_token,
      // Rotaciona. Se a renovacao nao devolver um novo, mantem o anterior.
      refreshToken: dados.refresh_token ?? anterior?.refreshToken ?? null,
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
    client_id: config.bling.clientId,
    redirect_uri: config.bling.redirectUri,
    state,
  });
  return `${URL_AUTORIZAR}?${params}`;
}

export async function concluirAutorizacao(code) {
  const dados = await pedirToken({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.bling.redirectUri,
  });
  return guardar(dados, null);
}

/**
 * Devolve um access token valido, renovando so quando falta pouco para expirar.
 * Pedir token a toa e o caminho mais rapido para o bloqueio de IP.
 */
export async function obterAccessToken() {
  const segredo = await lerSegredo(SERVICO);

  if (!segredo?.accessToken) {
    throw new Error('Bling nao conectado. Use "Conectar" na tela Integracoes.');
  }

  const conexao = await lerConexao(SERVICO);
  const aindaVale =
    conexao?.expiraEm &&
    conexao.expiraEm.getTime() - Date.now() > MARGEM_RENOVACAO_MS;
  if (aindaVale) return segredo.accessToken;

  if (!segredo.refreshToken) {
    throw new Error("Token do Bling expirou e nao ha refresh token. Reconecte.");
  }

  const dados = await pedirToken({
    grant_type: "refresh_token",
    refresh_token: segredo.refreshToken,
  });

  return guardar(dados, segredo);
}

async function chamar(metodo, caminho, { params, corpo } = {}) {
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
  });
}

export const blingGet = (caminho, params) => chamar("GET", caminho, { params });

/**
 * Teste de conexao: le os canais de venda.
 *
 * Escolhido porque confirma token e escopo e ja mostra o canal do Mercado Livre
 * — a conta tem 8 canais desse tipo e so um esta ativo. (`/lojas` devolve 404 e
 * `/integracoes` devolve 403 com os escopos atuais.)
 */
export async function testar() {
  const { ok, status, duracaoMs, dados } = await blingGet("/canais-venda");

  if (!ok) {
    const detalhe = dados?.error?.description ?? dados?.error ?? `HTTP ${status}`;
    return { ok: false, latenciaMs: duracaoMs, erro: String(detalhe) };
  }

  const canais = dados?.data ?? [];
  const canalMl = canais.find(
    (canal) => String(canal.id) === String(config.bling.canalMlId),
  );

  return {
    ok: true,
    latenciaMs: duracaoMs,
    conta: `${canais.length} canal(is) de venda`,
    detalhe: canalMl
      ? `Canal do Mercado Livre: ${canalMl.descricao} (${canalMl.id})`
      : `Canal ${config.bling.canalMlId} nao encontrado entre os canais ativos`,
  };
}

export const conector = {
  id: SERVICO,
  nome: "Bling",
  descricao: "ERP — mestre do cadastro e do estoque",
  tipoAuth: "oauth2",
  origemOAuth: new URL(config.bling.redirectUri).origin,
  configurado: Boolean(config.bling.clientId && config.bling.clientSecret),
  faltando: [
    ...(config.bling.clientId ? [] : ["BLING_CLIENT_ID"]),
    ...(config.bling.clientSecret ? [] : ["BLING_CLIENT_SECRET"]),
  ],
  iniciarAutorizacao,
  concluirAutorizacao,
  testar,
};
