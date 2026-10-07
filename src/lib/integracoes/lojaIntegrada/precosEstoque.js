import { clienteLojaIntegrada } from "./client";
import {
  normalizarEstoqueLojaIntegrada,
  normalizarPrecoLojaIntegrada,
} from "./normalizadores";
import { exigirRespostaLojaIntegrada } from "./paginacao";

function idSeguro(id) {
  if (id === undefined || id === null || String(id).trim() === "") {
    throw new TypeError("Id do produto da Loja Integrada nao informado.");
  }
  return encodeURIComponent(String(id).trim());
}

export function criarPrecosEstoqueLojaIntegrada({
  cliente = clienteLojaIntegrada,
} = {}) {
  return {
    async obterPreco(produtoId) {
      const resposta = await cliente.get(`/produto_preco/${idSeguro(produtoId)}`);
      return normalizarPrecoLojaIntegrada(exigirRespostaLojaIntegrada(resposta));
    },
    async obterEstoque(produtoId) {
      const resposta = await cliente.get(`/produto_estoque/${idSeguro(produtoId)}`);
      return normalizarEstoqueLojaIntegrada(
        exigirRespostaLojaIntegrada(resposta),
      );
    },
  };
}

export const precosEstoqueLojaIntegrada = criarPrecosEstoqueLojaIntegrada();
