import { config, exigirTravaLiberada } from "../config";
import { limitar, mascarar, requisitar } from "../httpClient";
import { lerSegredo } from "../conexoes";

const SERVICO = "LOJA_INTEGRADA";
const API = "https://api.awsli.com.br/v1";

// A documentacao publica 100 requisicoes/minuto por loja. A margem evita que
// pequenas diferencas de relogio encostem no limite real.
const MAX_POR_MINUTO = 90;

const preenchido = (valor) =>
  valor !== undefined && valor !== null && valor !== "";

export function urlDaLojaIntegrada(caminho, params) {
  const url = new URL(`${API}${caminho}`);

  for (const [chave, valor] of Object.entries(params ?? {})) {
    if (preenchido(valor)) url.searchParams.set(chave, String(valor));
  }

  return url.toString();
}

export async function obterPersonalToken() {
  const segredo = await lerSegredo(SERVICO);
  const token = segredo?.personalToken || config.lojaIntegrada.personalToken;

  if (!token) {
    throw new Error(
      "Loja Integrada nao configurada. Informe o Personal Token na tela Integracoes.",
    );
  }

  return token;
}

function detalheSeguro(dados) {
  const detalhe = dados?.errors ?? dados?.detail ?? dados?.message ?? dados?.error;
  if (!detalhe) return null;
  const seguro = mascarar(detalhe);
  return typeof seguro === "string" ? seguro : JSON.stringify(seguro);
}

export function classificarFalhaLojaIntegrada(status, dados) {
  const detalhe = detalheSeguro(dados);

  if (status === 401) {
    return {
      tipo: "AUTENTICACAO",
      erro: "Erro de autenticacao. Confira ou renove o Personal Token.",
    };
  }
  if (status === 403) {
    return {
      tipo: "ACESSO_NEGADO",
      erro: "A Loja Integrada recusou o acesso deste Personal Token.",
    };
  }
  if (status === 404) {
    return {
      tipo: "NAO_ENCONTRADO",
      erro: "Recurso nao encontrado na Loja Integrada.",
    };
  }
  if (status === 409) {
    return {
      tipo: "CONFLITO",
      erro: "A Loja Integrada recusou a operacao por conflito.",
    };
  }
  if (status === 429) {
    return {
      tipo: "LIMITE",
      erro: "Limite de chamadas da Loja Integrada atingido. Tente novamente em instantes.",
    };
  }
  if (status >= 500) {
    return {
      tipo: "INDISPONIVEL",
      erro: "A API da Loja Integrada esta indisponivel no momento.",
      detalheTecnico: `HTTP ${status}`,
    };
  }

  return {
    tipo: "RESPOSTA_INVALIDA",
    erro: "A Loja Integrada recusou a solicitacao.",
    detalheTecnico: [`HTTP ${status}`, detalhe].filter(Boolean).join(" — "),
  };
}

export function criarLojaIntegradaClient({
  configuracao = config,
  obterToken = obterPersonalToken,
  requisitarHttp = requisitar,
  limitarHttp = limitar,
  exigirEscrita = () => exigirTravaLiberada(SERVICO),
} = {}) {
  async function chamar(metodo, caminho, { params, corpo } = {}) {
    if (!configuracao.lojaIntegrada.enabled) {
      throw new Error("A integracao com a Loja Integrada esta desabilitada.");
    }
    if (metodo !== "GET") exigirEscrita();

    const token = await obterToken();
    const url = urlDaLojaIntegrada(caminho, params);

    await limitarHttp(SERVICO, MAX_POR_MINUTO, 60_000);

    return requisitarHttp({
      servico: SERVICO,
      url,
      metodo,
      headers: { Authorization: `Basic ${token}` },
      corpo,
      // Escritas nunca repetem sozinhas: a API pode ter aplicado a mudanca e
      // perdido apenas a resposta. A leitura posterior decide o que fazer.
      ...(metodo === "GET" ? {} : { tentativas: 1 }),
    });
  }

  return {
    get: (caminho, params) => chamar("GET", caminho, { params }),
    post: (caminho, corpo) => chamar("POST", caminho, { corpo }),
    put: (caminho, corpo) => chamar("PUT", caminho, { corpo }),
    delete: (caminho, corpo) => chamar("DELETE", caminho, { corpo }),
  };
}

export const clienteLojaIntegrada = criarLojaIntegradaClient();
