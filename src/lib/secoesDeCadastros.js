import { Factory, Globe, Package, Tag, Truck, Users } from "lucide-react";

/**
 * Fonte unica das secoes de Cadastros. A pagina `/cadastros` desenha um cartao
 * por item (o mesmo desenho de Ferramentas: pedido do dono em 21/09/2026); a
 * barra lateral so tem o bloco, sem cascata. Para acrescentar uma secao, some uma
 * entrada aqui e trate o `tipo` em `src/app/cadastros/[tipo]`.
 *
 * Os textos `resumo` dizem o que a secao guarda, e nao o que o cartao faz: quem
 * chega aqui quer saber onde cadastrar o que.
 *
 * @typedef {Object} SecaoDeCadastros
 * @property {string} href
 * @property {string} recurso o recurso de Acessos que abre a secao (o cartao some sem `ver` nele)
 * @property {string} rotulo
 * @property {React.ComponentType} icone
 * @property {string} resumo
 * @property {string} [detalhe]
 */

/** @type {SecaoDeCadastros[]} */
export const SECOES_DE_CADASTROS = [
  {
    href: "/cadastros/clientes",
    recurso: "tela.cadastros.clientes",
    rotulo: "Clientes",
    icone: Users,
    resumo: "Pessoas físicas e jurídicas que compram da loja, com endereço geral e de entrega, contatos e transportadora preferida.",
  },
  {
    href: "/cadastros/fornecedores",
    recurso: "tela.cadastros.fornecedores",
    rotulo: "Fornecedores",
    icone: Factory,
    resumo: "As empresas de quem a loja compra: contato, CNPJ, prazo e o site que o Mercados varre.",
  },
  {
    href: "/cadastros/concorrentes",
    recurso: "tela.cadastros.concorrentes",
    rotulo: "Concorrentes",
    icone: Globe,
    resumo: "Lojas que vendem o mesmo tipo de produto, para comparar preço no Mercados.",
  },
  {
    href: "/cadastros/transportadoras",
    recurso: "tela.cadastros.transportadoras",
    rotulo: "Transportadoras",
    icone: Truck,
    resumo: "Quem entrega os pedidos, com modalidade, contatos e o endereço de rastreamento.",
  },
  {
    href: "/cadastros/produtos",
    recurso: "tela.produtos",
    rotulo: "Produtos",
    icone: Package,
    resumo: "O catálogo da loja. Abre o mesmo cadastro do item Produtos do menu.",
  },
  {
    href: "/cadastros/marcas",
    recurso: "tela.cadastros.marcas",
    rotulo: "Marcas",
    icone: Tag,
    resumo: "As marcas dos produtos, sempre em maiúsculas, com uma observação.",
  },
];

/** O recurso de Acessos de uma secao pelo `tipo` da rota (`/cadastros/<tipo>`), ou null para tipo desconhecido. */
export function recursoDaSecao(tipo) {
  if (!tipo) return null;
  return SECOES_DE_CADASTROS.find((secao) => secao.href === `/cadastros/${tipo}`)?.recurso ?? null;
}
