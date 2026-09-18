import {
  BookUser,
  Boxes,
  CreditCard,
  Factory,
  Globe,
  LayoutDashboard,
  Megaphone,
  Package,
  Radar,
  PieChart,
  Cable,
  ShoppingCart,
  Tag,
  Truck,
  Users,
  Wallet,
} from "lucide-react";

/**
 * Fonte unica dos blocos do sistema. A sidebar, a busca do menu e os cards do
 * painel leem desta lista — para adicionar um bloco novo, acrescente uma
 * entrada aqui e crie a rota correspondente em src/app.
 *
 * @typedef {Object} Bloco
 * @property {string} href
 * @property {string} rotulo
 * @property {React.ComponentType} icone
 * @property {string} resumo
 * @property {boolean} pronto  Falso enquanto o bloco ainda nao foi implementado.
 * @property {{href: string, rotulo: string, icone: React.ComponentType}[]} [filhos]
 *   Subitens em cascata sob o bloco. So um nivel: cada filho e um link simples.
 */

/** @type {Bloco[]} */
export const blocos = [
  {
    href: "/",
    rotulo: "Painel",
    icone: LayoutDashboard,
    resumo: "Visao geral da operacao",
    pronto: true,
  },
  {
    // Logo abaixo do Painel (pedido do dono em 18/09/2026, depois de a primeira
    // versao ficar acima de Mercados). As quatro secoes eram abas dentro da tela
    // e viraram subitens em cascata, cada um com rota propria: assim o item ativo
    // sai do caminho, sem depender de `?aba=` na URL.
    href: "/cadastros",
    rotulo: "Cadastros",
    icone: BookUser,
    resumo: "Clientes, fornecedores, concorrentes, transportadoras, produtos e marcas",
    pronto: true,
    filhos: [
      { href: "/cadastros/clientes", rotulo: "Clientes", icone: Users },
      // Fornecedores era Truck; virou Factory quando Transportadoras entrou, para
      // os dois icones nao serem o mesmo caminhao.
      { href: "/cadastros/fornecedores", rotulo: "Fornecedores", icone: Factory },
      { href: "/cadastros/concorrentes", rotulo: "Concorrentes", icone: Globe },
      { href: "/cadastros/transportadoras", rotulo: "Transportadoras", icone: Truck },
      { href: "/cadastros/produtos", rotulo: "Produtos", icone: Package },
      { href: "/cadastros/marcas", rotulo: "Marcas", icone: Tag },
      { href: "/cadastros/condicoes", rotulo: "Condicoes de pagamento", icone: CreditCard },
    ],
  },
  {
    href: "/anuncios",
    rotulo: "Anuncios",
    icone: Megaphone,
    resumo: "Criar, editar e acompanhar anuncios em todos os canais",
    pronto: true,
  },
  {
    href: "/produtos",
    rotulo: "Produtos",
    icone: Package,
    resumo: "Catalogo central da loja",
    pronto: true,
  },
  {
    href: "/mercados",
    rotulo: "Mercados",
    icone: Radar,
    resumo: "Produtos, precos e codigos de concorrentes e fornecedores",
    pronto: true,
  },
  {
    href: "/pedidos",
    rotulo: "Pedidos",
    icone: ShoppingCart,
    resumo: "Vendas de todos os canais em um so lugar",
    pronto: false,
  },
  {
    href: "/estoque",
    rotulo: "Estoque",
    icone: Boxes,
    resumo: "Saldo e movimentacoes",
    pronto: false,
  },
  {
    href: "/financeiro",
    rotulo: "Financeiro",
    icone: Wallet,
    resumo: "Custos, margens e recebimentos",
    pronto: false,
  },
  {
    href: "/relatorios",
    rotulo: "Relatorios",
    icone: PieChart,
    resumo: "Indicadores e exportacoes",
    pronto: false,
  },
  {
    href: "/integracoes",
    rotulo: "Integracoes",
    icone: Cable,
    resumo: "Conexoes com Bling, Mercado Livre e Loja Integrada",
    pronto: true,
  },
];

export function ehRotaAtiva(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
