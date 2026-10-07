import { Handshake, ShoppingBag, ShoppingBasket } from "lucide-react";

/**
 * Fonte unica dos canais de venda. A pagina `/canais-de-venda` desenha um cartao por item,
 * no desenho de Ferramentas (`src/lib/ferramentas/catalogo.js`); para abrir um canal novo,
 * tire `emBreve` da entrada e crie a rota em `src/app/canais-de-venda/<canal>`. A barra
 * lateral NAO lista os canais (o bloco e so icone e texto): quem lista e a pagina.
 *
 * `emBreve` e o canal que o dono ja decidiu atender mas ainda nao tem tela: o cartao
 * aparece sem link e com o selo "em breve", para o operador ver o que vem por ai.
 *
 * @typedef {Object} CanalDeVenda
 * @property {string} href
 * @property {string} rotulo
 * @property {React.ComponentType} icone
 * @property {string} resumo   Uma frase: o que se faz no canal.
 * @property {string} [detalhe] Linha pequena no pe do cartao.
 * @property {boolean} [emBreve] Sem tela ainda: cartao sem link.
 */

/** @type {CanalDeVenda[]} */
export const CANAIS_DE_VENDA = [
  {
    href: "/canais-de-venda/mercado-livre",
    rotulo: "Mercado Livre",
    icone: Handshake,
    resumo: "Crie anúncios simples e kits a partir dos produtos Conferidos, com título, descrição, preço e ficha técnica.",
    detalhe: "Rascunhos · a publicação vem numa próxima etapa",
  },
  {
    href: "/canais-de-venda/loja-integrada",
    rotulo: "Loja Integrada",
    icone: ShoppingBag,
    resumo: "Anúncios da loja própria: conteúdo, SEO e dados fiscais pelo Rise; estoque e preço pelo Bling.",
    detalhe: "Sincronização sob trava · fotos e documentos na VPS",
  },
  {
    href: "/canais-de-venda/shopee",
    rotulo: "Shopee",
    icone: ShoppingBasket,
    resumo: "Anúncios na Shopee.",
    emBreve: true,
  },
];
