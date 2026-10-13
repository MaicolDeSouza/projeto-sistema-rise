import { Cable, Sparkles, UsersRound } from "lucide-react";

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
];
