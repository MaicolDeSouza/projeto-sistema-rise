import {
  Boxes,
  LayoutDashboard,
  Megaphone,
  Package,
  PieChart,
  Cable,
  ShoppingCart,
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
    href: "/anuncios",
    rotulo: "Criar Anuncios",
    icone: Megaphone,
    resumo: "Gerar e publicar anuncios no Mercado Livre e na Loja Integrada",
    pronto: false,
  },
  {
    href: "/produtos",
    rotulo: "Produtos",
    icone: Package,
    resumo: "Catalogo central da loja",
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

/** Remove acentos e caixa para que a busca do menu ignore ambos. */
export function normalizar(texto) {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function ehRotaAtiva(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
