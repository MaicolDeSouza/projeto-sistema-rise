import { config, exigirTravaLiberada } from "./config";
import { lerConexao, lerSegredo, salvarConexao } from "./conexoes";
import { limitar, requisitar } from "./httpClient";
import { obterTokenSobTrava } from "./travaDeRenovacao";
import { formatoDeMoeda } from "../dinheiro.js";

/**
 * Melhor Envio (modulo de frete, spec 2026-11-18-modulo-de-frete-design.md). Documentacao lida em 18/11/2026
 * (docs.melhorenvio.com.br):
 *  - OAuth2 por aplicativo: autorizacao em `{base}/oauth/authorize` (response_type=code, client_id, redirect_uri, state,
 *    scope separado por espaco) e token em `POST {base}/oauth/token`, com o corpo em JSON (grant_type, client_id,
 *    client_secret, redirect_uri, code | refresh_token). O token de acesso vale 30 dias (expires_in 2592000) e o de
 *    renovacao 45; a renovacao devolve um refresh novo (uso unico: renova sob a trava do banco, como o Bling).
 *  - Toda chamada leva `Accept: application/json` e `User-Agent` com o nome do aplicativo e um e-mail de contato
 *    (obrigatorio). Produção `https://melhorenvio.com.br`, teste `https://sandbox.melhorenvio.com.br` (conta separada).
 *  - Cotacao: `POST /api/v2/me/shipment/calculate` com { from: { postal_code }, to: { postal_code }, package: { height,
 *    width, length, weight }, options: { insurance_value, receipt, own_hand } }. E uma LEITURA: nao passa pela trava.
 *    Resposta medida na calculadora publica em 18/11/2026: lista de { id, name, price, custom_price, delivery_time,
 *    custom_delivery_time, company: { id, name } }, e o servico que nao atende traz so id, name, company e `error`.
 *    CEP invalido: HTTP 422 { errors: { postal_code: [...] }, message }.
 *  - Saldo: `GET /api/v2/me/balance` -> { balance, reserved, debts }.
 *  - Escopos: os da fase 1 a 3 pedidos ja na primeira conexao, para a etiqueta e o reverso nao exigirem reconectar.
 */

const SERVICO = "MELHOR_ENVIO";
const ESCOPOS = [
  "cart-read",
  "cart-write",
  "orders-read",
  "shipping-calculate",
  "shipping-cancel",
  "shipping-checkout",
  "shipping-companies",
  "shipping-generate",
  "shipping-preview",
  "shipping-print",
  "shipping-share",
  "shipping-tracking",
  "users-read",
].join(" ");

// O token dura 30 dias: renovar com 5 de folga tira a chance de ele vencer com o worker ou o operador no meio.
const MARGEM_RENOVACAO_MS = 5 * 24 * 60 * 60 * 1000;
// A documentacao antiga fala em 250 por minuto por usuario: 4 por segundo fica longe disso.
const MAX_POR_SEGUNDO = 4;

const base = () => config.melhorEnvio.urlBase.replace(/\/+$/, "");
const cabecalhos = () => ({ "User-Agent": `Rise 4hobby (${config.melhorEnvio.contato})` });

async function pedirToken(corpo) {
  const { ok, status, dados } = await requisitar({
    servico: SERVICO,
    url: `${base()}/oauth/token`,
    metodo: "POST",
    headers: cabecalhos(),
    corpo: { client_id: config.melhorEnvio.clientId, client_secret: config.melhorEnvio.clientSecret, ...corpo },
    tentativas: 1,
  });
  if (!ok) {
    const detalhe = dados?.message ?? dados?.error_description ?? dados?.error ?? `HTTP ${status}`;
    throw new Error(`Melhor Envio recusou o pedido de token: ${detalhe}`);
  }
  return dados;
}

/** `db`: a transacao da trava, na renovacao. */
async function guardar(dados, anterior, db) {
  await salvarConexao(
    SERVICO,
    {
      segredo: {
        accessToken: dados.access_token,
        refreshToken: dados.refresh_token ?? anterior?.refreshToken ?? null,
        // O app que gerou o token, como no Bling e no ML: a copia do banco da VPS nao pode trazer ao PC um token de
        // outro aplicativo.
        clientId: config.melhorEnvio.clientId ?? null,
        sandbox: config.melhorEnvio.sandbox,
      },
      status: "CONECTADO",
      escopos: ESCOPOS,
      expiraEm: new Date(Date.now() + Number(dados.expires_in ?? 0) * 1000),
      conectadoEm: new Date(),
    },
    db,
  );
  return dados.access_token;
}

export function iniciarAutorizacao(state) {
  const params = new URLSearchParams({
    client_id: config.melhorEnvio.clientId,
    redirect_uri: config.melhorEnvio.redirectUri,
    response_type: "code",
    state,
    scope: ESCOPOS,
  });
  return `${base()}/oauth/authorize?${params}`;
}

export async function concluirAutorizacao(code) {
  const dados = await pedirToken({ grant_type: "authorization_code", redirect_uri: config.melhorEnvio.redirectUri, code });
  return guardar(dados, null);
}

export async function obterAccessToken() {
  return obterTokenSobTrava("conexao:MELHOR_ENVIO", {
    ler: async (db) => ({ segredo: await lerSegredo(SERVICO, db), conexao: await lerConexao(SERVICO, db) }),
    tokenValido: ({ segredo, conexao }) => {
      if (!segredo?.accessToken) throw new Error('Melhor Envio não conectado. Use "Conectar" na tela Integrações.');
      const aindaVale = conexao?.expiraEm && conexao.expiraEm.getTime() - Date.now() > MARGEM_RENOVACAO_MS;
      return aindaVale ? segredo.accessToken : null;
    },
    renovar: async ({ segredo }, tx) => {
      if (!segredo.refreshToken) throw new Error("O token do Melhor Envio venceu e não há como renovar. Reconecte em Integrações.");
      const dados = await pedirToken({ grant_type: "refresh_token", refresh_token: segredo.refreshToken });
      return guardar(dados, segredo, tx);
    },
  });
}

async function chamar(metodo, caminho, { params, corpo, escrita = false, tentativas } = {}) {
  // Escrita gasta saldo (carrinho, compra, cancelamento): so com FRETE_COMPRA liberada. Cotar e ler passam.
  if (escrita) exigirTravaLiberada(SERVICO);
  const token = await obterAccessToken();
  const url = new URL(`${base()}${caminho}`);
  for (const [chave, valor] of Object.entries(params ?? {})) {
    if (valor !== undefined && valor !== null && valor !== "") url.searchParams.set(chave, String(valor));
  }
  await limitar(SERVICO, MAX_POR_SEGUNDO);
  return requisitar({
    servico: SERVICO,
    url: url.toString(),
    metodo,
    headers: { Authorization: `Bearer ${token}`, ...cabecalhos() },
    corpo,
    ...(tentativas ? { tentativas } : {}),
  });
}

export const meGet = (caminho, params) => chamar("GET", caminho, { params });

/**
 * POST de LEITURA (a cotacao e um POST). Uma tentativa so: o operador esta olhando a janela, e tres tentativas com espera
 * deixariam o botao parado por segundos; ele cota de novo.
 */
export const meLer = (caminho, corpo) => chamar("POST", caminho, { corpo, tentativas: 1 });

/** POST de escrita (carrinho, compra): trava FRETE_COMPRA e uma tentativa so (repetir uma compra compraria duas). */
export const mePost = (caminho, corpo) => chamar("POST", caminho, { corpo, escrita: true, tentativas: 1 });

/**
 * POST que GERA uma cobranca (a recarga da carteira, pedido do dono em 23/11/2026): nao gasta saldo, entao nao passa pela
 * trava FRETE_COMPRA, mas e uma tentativa so (repetir geraria duas cobrancas). Quem paga e o dono, no link que volta.
 */
export const meCobrar = (caminho, corpo) => chamar("POST", caminho, { corpo, tentativas: 1 });

const moeda = formatoDeMoeda();

/** Teste de conexao: quem e a conta e quanto ha de saldo na carteira. */
export async function testar() {
  const eu = await meGet("/api/v2/me");
  if (!eu.ok) return { ok: false, latenciaMs: eu.duracaoMs, erro: String(eu.dados?.message ?? `HTTP ${eu.status}`) };
  const saldo = await meGet("/api/v2/me/balance");
  const nome = [eu.dados?.firstname, eu.dados?.lastname].filter(Boolean).join(" ") || eu.dados?.name || "Conta Melhor Envio";
  return {
    ok: true,
    latenciaMs: eu.duracaoMs,
    conta: nome,
    detalhe: `${saldo.ok ? `Saldo ${moeda.format(Number(saldo.dados?.balance ?? 0))}` : "Saldo não lido"} · ${config.melhorEnvio.sandbox ? "ambiente de teste" : "produção"}`,
  };
}

export const conector = {
  id: SERVICO,
  nome: "Melhor Envio",
  descricao: "Frete — cotação, etiqueta e rastreio",
  tipoAuth: "oauth2",
  // O "Conectar" comeca no dominio do retorno, onde o cookie de `state` precisa estar (como o Bling e o ML).
  origemOAuth: new URL(config.melhorEnvio.redirectUri).origin,
  slugOAuth: "melhorenvio",
  configurado: Boolean(config.melhorEnvio.clientId && config.melhorEnvio.clientSecret && config.melhorEnvio.contato),
  faltando: [
    ...(config.melhorEnvio.clientId ? [] : ["MELHOR_ENVIO_CLIENT_ID"]),
    ...(config.melhorEnvio.clientSecret ? [] : ["MELHOR_ENVIO_CLIENT_SECRET"]),
    ...(config.melhorEnvio.contato ? [] : ["MELHOR_ENVIO_CONTATO"]),
  ],
  painel: { url: `${base()}/painel/gerenciar/tokens`, rotulo: "Link configuração API" },
  iniciarAutorizacao,
  concluirAutorizacao,
  testar,
};
