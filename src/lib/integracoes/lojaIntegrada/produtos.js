import { clienteLojaIntegrada } from "./client";
import { normalizarProdutoLojaIntegrada } from "./normalizadores";
import {
  coletarPaginasLojaIntegrada,
  exigirRespostaLojaIntegrada,
  paginarLojaIntegrada,
} from "./paginacao";

function idSeguro(id) {
  if (id === undefined || id === null || String(id).trim() === "") {
    throw new TypeError("Id do produto da Loja Integrada nao informado.");
  }
  return encodeURIComponent(String(id).trim());
}

export function criarProdutosLojaIntegrada({
  cliente = clienteLojaIntegrada,
} = {}) {
  async function obter(id, { descricaoCompleta = true } = {}) {
    const resposta = await cliente.get(`/produto/${idSeguro(id)}`, {
      ...(descricaoCompleta ? { descricao_completa: 1 } : {}),
    });
    return normalizarProdutoLojaIntegrada(exigirRespostaLojaIntegrada(resposta));
  }

  async function listar(params = {}) {
    const resposta = await cliente.get("/produto", params);
    const dados = exigirRespostaLojaIntegrada(resposta);
    if (!Array.isArray(dados?.objects)) {
      throw new TypeError("Lista de produtos da Loja Integrada invalida.");
    }
    return {
      produtos: dados.objects.map(normalizarProdutoLojaIntegrada),
      meta: dados.meta ?? {},
    };
  }

  async function* percorrer(params = {}, opcoes = {}) {
    for await (const pagina of paginarLojaIntegrada({
      cliente,
      caminho: "/produto",
      params,
      ...opcoes,
    })) {
      yield {
        numero: pagina.numero,
        produtos: pagina.objetos.map(normalizarProdutoLojaIntegrada),
        meta: pagina.meta,
      };
    }
  }

  async function listarTodos(params = {}, opcoes = {}) {
    const resultado = await coletarPaginasLojaIntegrada({
      cliente,
      caminho: "/produto",
      params,
      ...opcoes,
    });
    return {
      produtos: resultado.objetos.map(normalizarProdutoLojaIntegrada),
      meta: resultado.meta,
      paginas: resultado.paginas,
    };
  }

  return { listar, listarTodos, obter, percorrer };
}

export const produtosLojaIntegrada = criarProdutosLojaIntegrada();
