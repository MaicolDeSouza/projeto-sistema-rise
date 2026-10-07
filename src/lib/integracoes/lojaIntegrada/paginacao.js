import { classificarFalhaLojaIntegrada } from "./client";

const ORIGEM_OFICIAL = "https://api.awsli.com.br";

export class ErroLojaIntegrada extends Error {
  constructor(mensagem, { tipo = "RESPOSTA_INVALIDA", status = null } = {}) {
    super(mensagem);
    this.name = "ErroLojaIntegrada";
    this.tipo = tipo;
    this.status = status;
  }
}

export function exigirRespostaLojaIntegrada(resposta) {
  if (resposta?.ok) return resposta.dados;

  const falha = classificarFalhaLojaIntegrada(
    resposta?.status ?? 0,
    resposta?.dados,
  );
  throw new ErroLojaIntegrada(falha.erro, {
    tipo: falha.tipo,
    status: resposta?.status ?? null,
  });
}

export function interpretarProximaPagina(valor) {
  if (!valor) return null;

  let url;
  try {
    url = new URL(valor, ORIGEM_OFICIAL);
  } catch {
    throw new ErroLojaIntegrada(
      "A Loja Integrada devolveu uma URL de paginacao invalida.",
    );
  }

  if (url.origin !== ORIGEM_OFICIAL) {
    throw new ErroLojaIntegrada(
      "A Loja Integrada devolveu uma URL de paginacao fora do dominio oficial.",
    );
  }

  const caminho = url.pathname
    .replace(/^\/api\/v1(?=\/|$)/, "")
    .replace(/^\/v1(?=\/|$)/, "");

  return {
    caminho: caminho || "/",
    params: Object.fromEntries(url.searchParams.entries()),
  };
}

function chaveDaPagina(caminho, params) {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params ?? {}).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    busca.set(chave, String(valor));
  }
  return `${caminho}?${busca.toString()}`;
}

export async function* paginarLojaIntegrada({
  cliente,
  caminho,
  params = {},
  maxPaginas = 10_000,
}) {
  if (!cliente?.get) throw new TypeError("Cliente da Loja Integrada invalido.");
  if (!caminho) throw new TypeError("Caminho da paginacao nao informado.");
  if (!Number.isInteger(maxPaginas) || maxPaginas < 1) {
    throw new TypeError("maxPaginas deve ser um inteiro positivo.");
  }

  let requisicao = { caminho, params };
  const visitadas = new Set();

  for (let numero = 1; numero <= maxPaginas; numero++) {
    const chave = chaveDaPagina(requisicao.caminho, requisicao.params);
    if (visitadas.has(chave)) {
      throw new ErroLojaIntegrada(
        "A paginacao da Loja Integrada entrou em repeticao.",
      );
    }
    visitadas.add(chave);

    const resposta = await cliente.get(requisicao.caminho, requisicao.params);
    const dados = exigirRespostaLojaIntegrada(resposta);

    if (!Array.isArray(dados?.objects)) {
      throw new ErroLojaIntegrada(
        "A Loja Integrada devolveu uma lista em formato inesperado.",
      );
    }

    yield {
      numero,
      objetos: dados.objects,
      meta: dados.meta ?? {},
    };

    if (!dados.meta?.next) return;
    requisicao = interpretarProximaPagina(dados.meta.next);
  }

  throw new ErroLojaIntegrada(
    `A consulta excedeu o limite de ${maxPaginas} pagina(s).`,
  );
}

export async function coletarPaginasLojaIntegrada(opcoes) {
  const objetos = [];
  let meta = {};
  let paginas = 0;

  for await (const pagina of paginarLojaIntegrada(opcoes)) {
    objetos.push(...pagina.objetos);
    meta = pagina.meta;
    paginas = pagina.numero;
  }

  return { objetos, meta, paginas };
}
