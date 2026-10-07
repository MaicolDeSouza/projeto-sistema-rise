import { testar } from "../lojaintegrada";
import { clienteLojaIntegrada } from "./client";
import { criarClientesLojaIntegrada } from "./clientes";
import { criarPedidosLojaIntegrada } from "./pedidos";
import { criarPrecosEstoqueLojaIntegrada } from "./precosEstoque";
import { criarProdutosLojaIntegrada } from "./produtos";

export function criarLojaIntegradaProvider({
  cliente = clienteLojaIntegrada,
} = {}) {
  const produtos = criarProdutosLojaIntegrada({ cliente });
  const pedidos = criarPedidosLojaIntegrada({ cliente });
  const clientes = criarClientesLojaIntegrada({ cliente });
  const precosEstoque = criarPrecosEstoqueLojaIntegrada({ cliente });

  return {
    testarConexao: () => testar(cliente),
    listarProdutos: produtos.listar,
    obterProduto: produtos.obter,
    percorrerProdutos: produtos.percorrer,
    listarPedidos: pedidos.listar,
    obterPedido: pedidos.obter,
    percorrerPedidos: pedidos.percorrer,
    listarClientes: clientes.listar,
    obterCliente: clientes.obter,
    buscarClientePorEmail: clientes.buscarPorEmail,
    obterPreco: precosEstoque.obterPreco,
    obterEstoque: precosEstoque.obterEstoque,
  };
}

export const lojaIntegradaProvider = criarLojaIntegradaProvider();
