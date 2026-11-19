import { Building2, Cable, HeartPulse, PackageCheck, Sparkles, SpellCheck, UsersRound } from "lucide-react";

/**
 * Os cartoes da pagina Configuracoes (spec de Acessos, §5.2), no desenho de Ferramentas: o cartao inteiro e o link.
 * Cada um com o recurso de Acessos que o libera: a pagina so desenha os que a pessoa ve. Integracoes e o Rise AI
 * continuam nas rotas de hoje (sao ~50 referencias): o cartao so aponta para la.
 *
 * @typedef {{ href: string, recurso: string, rotulo: string, icone: React.ComponentType, resumo: string }} CartaoDeConfiguracoes
 */

/** @type {CartaoDeConfiguracoes[]} */
export const CARTOES_DE_CONFIGURACOES = [
  {
    href: "/configuracoes/usuarios",
    recurso: "tela.configuracoes.usuarios",
    rotulo: "Usuários e funções",
    icone: UsersRound,
    resumo: "Quem entra no Rise e o que cada um vê e edita.",
  },
  {
    href: "/integracoes",
    recurso: "tela.integracoes",
    rotulo: "Integrações",
    icone: Cable,
    resumo: "Conexões com o Bling, o Mercado Livre e a Loja Integrada.",
  },
  {
    href: "/rise-ai/configuracoes",
    recurso: "riseAi.configuracoes",
    rotulo: "Rise AI",
    icone: Sparkles,
    resumo: "Modelos, chaves, limites e o texto do assistente.",
  },
  {
    // Correcoes da descricao (spec 2026-11-07): quem ve o cadastro de Produtos ve a lista; quem edita muda.
    href: "/configuracoes/correcoes-da-descricao",
    recurso: "tela.produtos.cadastro",
    rotulo: "Correções da descrição",
    icone: SpellCheck,
    resumo: "O que o Rise corrige em toda descrição e o que a IA aprende com o dono.",
  },
  {
    // Os dados da 4hobby do cabecalho do pedido de compra (modulo Compras, 26/10/2026). So o Administrador.
    href: "/configuracoes/empresa",
    recurso: "tela.configuracoes.usuarios",
    rotulo: "Dados da empresa",
    icone: Building2,
    resumo: "Razão social, CNPJ e endereço que vão no pedido de compra.",
  },
  {
    // Modulo de frete (18/11/2026): o acrescimo de embalagem e o peso extra da cotacao.
    href: "/configuracoes/envios",
    recurso: "tela.configuracoes.envios",
    rotulo: "Envios",
    icone: PackageCheck,
    resumo: "O acréscimo de embalagem e a folga de peso usados na cotação do frete.",
  },
  {
    // So o Administrador: mostra as travas e o estado das conexoes da conta inteira (recurso nao delegavel).
    href: "/configuracoes/saude",
    recurso: "tela.configuracoes.usuarios",
    rotulo: "Saúde do Rise",
    icone: HeartPulse,
    resumo: "Workers, banco, integrações e rotinas, com aviso no Telegram.",
  },
];
