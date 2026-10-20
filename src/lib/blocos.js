import {
  BookUser,
  ChartNoAxesCombined,
  Boxes,
  LayoutDashboard,
  Megaphone,
  Package,
  Radar,
  PieChart,
  Sparkles,
  Settings,
  ShoppingCart,
  Store,
  Wallet,
  Wrench,
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
 * @property {string[]} [rotasExtras]  Rotas fora do prefixo do bloco que tambem o acendem (Configuracoes: as telas
 *   que viraram cartao dele sem mudar de endereco).
 */

/** @type {Bloco[]} */
export const blocos = [
  {
    href: "/",
    rotulo: "Painel",
    icone: LayoutDashboard,
    resumo: "Visão geral da operação",
    pronto: true,
  },
  {
    href: "/indicadores",
    rotulo: "Indicadores",
    icone: ChartNoAxesCombined,
    resumo: "Números e resultados da loja",
    pronto: true,
  },
  {
    // Logo abaixo do Painel (pedido do dono em 18/09/2026). Ate 21/09/2026 as
    // secoes eram subitens em cascata aqui; agora so icone e texto, e as secoes
    // aparecem como CARTOES na propria pagina (`src/lib/secoesDeCadastros.js`),
    // como em Ferramentas. O item continua ativo em `/cadastros/<secao>`
    // (`ehRotaAtiva`), e cada tela tem um link "← Cadastros" para voltar.
    href: "/cadastros",
    rotulo: "Cadastros",
    icone: BookUser,
    resumo: "Clientes, fornecedores, concorrentes, transportadoras, produtos e marcas",
    pronto: true,
  },
  {
    href: "/anuncios",
    rotulo: "Anúncios",
    icone: Megaphone,
    resumo: "Criar, editar e acompanhar anúncios em todos os canais",
    pronto: true,
  },
  {
    // Pedido do dono em 30/09/2026: criar e gerenciar anuncios por canal (Mercado Livre,
    // Loja Integrada e Shopee). So icone e texto na barra lateral; os canais aparecem como
    // CARTOES na propria pagina (`src/lib/canaisDeVenda/catalogo.js`), como em Ferramentas
    // e Cadastros. O item continua ativo em `/canais-de-venda/<canal>` (`ehRotaAtiva`).
    href: "/canais-de-venda",
    rotulo: "Canais de Venda",
    icone: Store,
    resumo: "Criar e gerenciar anúncios no Mercado Livre, na Loja Integrada e na Shopee",
    pronto: true,
  },
  {
    href: "/produtos",
    rotulo: "Produtos",
    icone: Package,
    resumo: "Catálogo central da loja",
    pronto: true,
  },
  {
    // Renomeado de "Mercados" para "Scraper" a pedido do dono em 29/09/2026:
    // e o nome da ferramenta que varre os sites de concorrentes e fornecedores.
    // So o rotulo mudou — a rota continua /mercados, e o codigo interno
    // (TabelaMercados, listarProdutos...) tambem, pela mesma regra que ja valeu
    // para "Sites" virar "Fontes": nome de tela e vocabulario de quem opera.
    href: "/mercados",
    rotulo: "Scraper",
    icone: Radar,
    resumo: "Produtos, preços e códigos de concorrentes e fornecedores",
    pronto: true,
  },
  {
    // Rise AI (spec de 11/10/2026): o assistente de IA do atendimento e do catalogo. Logo depois do Scraper.
    href: "/rise-ai",
    rotulo: "Rise AI",
    icone: Sparkles,
    resumo: "Acesso pelo Claude e ChatGPT, dúvidas anotadas, conhecimento e consumo",
    pronto: true,
  },
  {
    href: "/pedidos",
    rotulo: "Pedidos",
    icone: ShoppingCart,
    resumo: "Vendas de todos os canais em um só lugar",
    pronto: false,
  },
  {
    href: "/estoque",
    rotulo: "Estoque",
    icone: Boxes,
    resumo: "Saldo e movimentações",
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
    rotulo: "Relatórios",
    icone: PieChart,
    resumo: "Relatório semanal da coleta em PDF",
    pronto: true,
  },
  {
    // Utilitarios que nao pertencem a um bloco de negocio. So icone e texto na
    // barra lateral, SEM cascata (teste de desenho pedido pelo dono em
    // 20/09/2026): as ferramentas aparecem como cartoes na propria pagina
    // (`src/lib/ferramentas/catalogo.js`). Se ficar bom, vira o padrao.
    href: "/ferramentas",
    rotulo: "Ferramentas",
    icone: Wrench,
    resumo: "Utilitários do dia a dia, como converter imagem em SVG",
    pronto: true,
  },
  {
    // Acessos (12/10/2026): por ultimo. Usuarios e funcoes, Integracoes (que saiu do menu) e as configuracoes do
    // Rise AI viram CARTOES na pagina, como Ferramentas; as rotas nao mudam de lugar (sao ~50 referencias), entao
    // as duas de fora do prefixo acendem este item pelas `rotasExtras`.
    href: "/configuracoes",
    rotulo: "Configurações",
    icone: Settings,
    resumo: "Usuários e funções, integrações e o Rise AI",
    pronto: true,
    rotasExtras: ["/integracoes", "/rise-ai/configuracoes"],
  },
];

export function ehRotaAtiva(pathname, href, rotasExtras = []) {
  const dentro = (base) => pathname === base || pathname.startsWith(`${base}/`);
  if (href === "/") return pathname === "/";
  return dentro(href) || rotasExtras.some(dentro);
}
