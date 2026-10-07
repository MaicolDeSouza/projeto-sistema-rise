import { clienteLojaIntegrada } from "./client";
import { normalizarClienteLojaIntegrada } from "./normalizadores";
import {
  coletarPaginasLojaIntegrada,
  exigirRespostaLojaIntegrada,
} from "./paginacao";

function idSeguro(id) {
  if (id === undefined || id === null || String(id).trim() === "") {
    throw new TypeError("Id do cliente da Loja Integrada não informado.");
  }
  return encodeURIComponent(String(id).trim());
}

function normalizarLista(dados) {
  if (!Array.isArray(dados?.objects)) {
    throw new TypeError("Lista de clientes da Loja Integrada inválida.");
  }
  return {
    clientes: dados.objects.map(normalizarClienteLojaIntegrada),
    meta: dados.meta ?? {},
  };
}

export function criarClientesLojaIntegrada({
  cliente = clienteLojaIntegrada,
} = {}) {
  async function listar(params = {}) {
    const resposta = await cliente.get("/cliente", params);
    return normalizarLista(exigirRespostaLojaIntegrada(resposta));
  }

  async function obter(id) {
    const resposta = await cliente.get(`/cliente/${idSeguro(id)}`);
    return normalizarClienteLojaIntegrada(
      exigirRespostaLojaIntegrada(resposta),
    );
  }

  async function buscar(params = {}) {
    const resposta = await cliente.get("/cliente/search", params);
    return normalizarLista(exigirRespostaLojaIntegrada(resposta));
  }

  async function buscarPorEmail(email) {
    const valor = String(email ?? "").trim();
    if (!valor) throw new TypeError("E-mail do cliente não informado.");
    return buscar({ cliente_email: valor });
  }

  async function listarTodos(params = {}, opcoes = {}) {
    const resultado = await coletarPaginasLojaIntegrada({
      cliente,
      caminho: "/cliente",
      params,
      ...opcoes,
    });
    return {
      clientes: resultado.objetos.map(normalizarClienteLojaIntegrada),
      meta: resultado.meta,
      paginas: resultado.paginas,
    };
  }

  return { buscar, buscarPorEmail, listar, listarTodos, obter };
}

export const clientesLojaIntegrada = criarClientesLojaIntegrada();
