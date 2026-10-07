import { clienteLojaIntegrada } from "./client";
import { normalizarPedidoLojaIntegrada } from "./normalizadores";
import {
  exigirRespostaLojaIntegrada,
  paginarLojaIntegrada,
} from "./paginacao";

function idSeguro(id) {
  if (id === undefined || id === null || String(id).trim() === "") {
    throw new TypeError("Id do pedido da Loja Integrada nao informado.");
  }
  return encodeURIComponent(String(id).trim());
}

function normalizarLista(dados) {
  if (!Array.isArray(dados?.objects)) {
    throw new TypeError("Lista de pedidos da Loja Integrada invalida.");
  }
  return {
    pedidos: dados.objects.map(normalizarPedidoLojaIntegrada),
    meta: dados.meta ?? {},
  };
}

export function criarPedidosLojaIntegrada({
  cliente = clienteLojaIntegrada,
} = {}) {
  async function listar(params = {}) {
    const resposta = await cliente.get("/pedido/search", params);
    return normalizarLista(exigirRespostaLojaIntegrada(resposta));
  }

  async function obter(id) {
    const resposta = await cliente.get(`/pedido/${idSeguro(id)}`);
    return normalizarPedidoLojaIntegrada(
      exigirRespostaLojaIntegrada(resposta),
    );
  }

  async function* percorrer(params = {}, opcoes = {}) {
    const parametros = { limit: 50, ...params };
    for await (const pagina of paginarLojaIntegrada({
      cliente,
      caminho: "/pedido/search",
      params: parametros,
      ...opcoes,
    })) {
      yield {
        numero: pagina.numero,
        pedidos: pagina.objetos.map(normalizarPedidoLojaIntegrada),
        meta: pagina.meta,
      };
    }
  }

  return { listar, obter, percorrer };
}

export const pedidosLojaIntegrada = criarPedidosLojaIntegrada();
