import { config, exigirTravaLiberada } from "./config";
import { limitar, requisitar } from "./httpClient";
import { lerSegredo, salvarConexao } from "./conexoes";

/**
 * Loja Integrada.
 *
 * Nao tem fluxo de autorizacao: sao duas chaves estaticas. E o caso que prova
 * que a abstracao de conectores nao pode assumir OAuth.
 *
 * BLOQUEADO hoje, por decisao da Loja Integrada:
 *
 * A API exige DUAS chaves. A "Chave API" sai do painel da loja, mas a "Chave de
 * Aplicacao" (APP KEY) e emitida so a provedores de solucao — e a solicitacao
 * para uso na propria loja esta SUSPENSA. Confirmado na pratica: com uma app
 * key invalida a API responde 401 "Chave de Aplicacao nao encontrada", o que de
 * quebra valida o formato do header abaixo.
 *
 * Enquanto isso, o canal Loja Integrada e atendido VIA BLING, que ja possui
 * APP KEY propria e ja esta integrado a esta loja (sincroniza produto, estoque,
 * preco e pedidos). Este conector fica pronto para o dia em que a Loja
 * Integrada reabrir a emissao de chaves.
 *
 * Atencao para quando reabrir: a APP KEY fica vinculada aos IPs informados no
 * cadastro, e requisicoes de outros IPs sao rejeitadas. Numa conexao domestica
 * o IP costuma mudar — isso praticamente exige rodar de um IP fixo (VPS).
 */

const SERVICO = "LOJA_INTEGRADA";
const API = "https://api.awsli.com.br/v1";
const MAX_POR_SEGUNDO = 3;

/** As chaves salvas pelo usuario tem prioridade sobre as do .env. */
async function obterChaves() {
  const segredo = await lerSegredo(SERVICO);

  const chaveApi = segredo?.chaveApi || config.lojaIntegrada.chaveApi;
  const chaveAplicacao =
    segredo?.chaveAplicacao || config.lojaIntegrada.chaveAplicacao;

  if (!chaveApi || !chaveAplicacao) {
    throw new Error(
      "Loja Integrada nao configurada. Informe a Chave API e a Chave de " +
        "Aplicacao na tela Integracoes.",
    );
  }

  return { chaveApi, chaveAplicacao };
}

export async function salvarChaves({ chaveApi, chaveAplicacao }) {
  await salvarConexao(SERVICO, {
    segredo: { chaveApi, chaveAplicacao },
    status: "CONECTADO",
    conectadoEm: new Date(),
  });
}

async function chamar(metodo, caminho, { params, corpo } = {}) {
  if (metodo !== "GET") exigirTravaLiberada(SERVICO);

  const { chaveApi, chaveAplicacao } = await obterChaves();
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
    headers: {
      Authorization: `chave_api ${chaveApi} aplicacao ${chaveAplicacao}`,
    },
    corpo,
  });
}

export const liGet = (caminho, params) => chamar("GET", caminho, { params });

/** Teste de conexao: uma listagem minima, que valida as duas chaves de uma vez. */
export async function testar() {
  const { ok, status, duracaoMs, dados } = await liGet("/produto", { limit: 1 });

  if (!ok) {
    const detalhe = dados?.errors ?? dados?.detail ?? `HTTP ${status}`;
    return {
      ok: false,
      latenciaMs: duracaoMs,
      erro:
        typeof detalhe === "string" ? detalhe : JSON.stringify(detalhe),
    };
  }

  const total = dados?.meta?.total_count ?? dados?.total ?? null;

  return {
    ok: true,
    latenciaMs: duracaoMs,
    conta: "Chaves validas",
    detalhe: total === null ? "Catalogo acessivel" : `${total} produto(s)`,
  };
}

export const conector = {
  id: SERVICO,
  nome: "Loja Integrada",
  descricao: "Loja propria — catalogo e vitrine",
  tipoAuth: "chaves_estaticas",
  origemOAuth: null,
  campos: [
    {
      nome: "chaveApi",
      rotulo: "Chave API",
      ajuda: "Painel da loja: Configuracoes > Chave API (so em planos pagos)",
    },
    {
      nome: "chaveAplicacao",
      rotulo: "Chave de Aplicacao",
      ajuda: "Fornecida junto com a Chave API",
    },
  ],
  configurado: false,
  faltando: [],
  bloqueado: {
    motivo:
      "A Loja Integrada suspendeu a emissao de Chave de Aplicacao para " +
      "lojistas usarem na propria loja. Sem ela a API responde 401.",
    saida:
      "Ate reabrirem, este canal e atendido via Bling, que ja tem chave " +
      "propria e ja esta integrado a esta loja.",
  },
  salvarChaves,
  testar,
};
