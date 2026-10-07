import { Shapes, TrendingUp } from "lucide-react";

/**
 * Fonte unica das ferramentas. A pagina `/ferramentas` desenha um cartao por
 * item; para acrescentar uma ferramenta, some uma entrada aqui e crie a rota em
 * `src/app/ferramentas/<nome>`. A barra lateral NAO lista as ferramentas (o
 * bloco Ferramentas e so icone e texto, sem cascata): quem lista e a pagina.
 *
 * @typedef {Object} Ferramenta
 * @property {string} href
 * @property {string} rotulo
 * @property {React.ComponentType} icone
 * @property {string} resumo   Uma ou duas frases: o que a ferramenta faz.
 * @property {string} [detalhe] Linha pequena no pe do cartao.
 */

/** @type {Ferramenta[]} */
export const FERRAMENTAS = [
  {
    href: "/ferramentas/imagem-para-svg",
    rotulo: "Imagem para SVG",
    icone: Shapes,
    resumo: "Converte o logo de uma empresa, de um fornecedor ou do seu site em SVG, com fundo transparente e as cores exatas.",
    detalhe: "PNG, JPG e WebP · até 10 MB",
  },
  {
    href: "/ferramentas/cotacao-dolar",
    rotulo: "Cotação do dólar",
    icone: TrendingUp,
    resumo: "O dólar de agora e o oficial do Banco Central (PTAX), com gráfico dos últimos dias, meses ou do último ano.",
    detalhe: "Banco Central (PTAX) · sem gravar nada",
  },
];
