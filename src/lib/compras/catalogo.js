import { ClipboardList, TriangleAlert } from "lucide-react";

/**
 * Os cartoes da pagina Compras, no desenho de Configuracoes e Ferramentas: o cartao inteiro e o link. Cada um com o
 * recurso de Acessos que o libera; a pagina so desenha os que a pessoa ve.
 *
 * @typedef {{ href: string, recurso: string, rotulo: string, icone: React.ComponentType, resumo: string }} CartaoDeCompras
 */

/** @type {CartaoDeCompras[]} */
export const CARTOES_DE_COMPRAS = [
  {
    href: "/compras/estoque-minimo",
    recurso: "tela.compras.estoqueMinimo",
    rotulo: "Abaixo do estoque mínimo",
    icone: TriangleAlert,
    resumo: "Produtos conferidos que precisam de reposição, com os fornecedores de cada um.",
  },
  {
    href: "/compras/pedidos",
    recurso: "tela.compras.pedidos",
    rotulo: "Pedidos de compra",
    icone: ClipboardList,
    resumo: "Rascunhos, pedidos enviados e o lançamento do estoque que chegou.",
  },
];
