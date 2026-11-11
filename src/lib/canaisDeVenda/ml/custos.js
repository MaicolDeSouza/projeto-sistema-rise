/**
 * Custos do Mercado Livre sobre o preco do anuncio e o preco por margem (fase 2). Funcoes puras,
 * sem rede: a aba Preco e estoque, a calculadora, as acoes e o teste leem o mesmo arquivo. As
 * taxas (percentual e tarifa fixa) e o frete chegam ja lidos do ML por `leitura.js`.
 *
 * Lucro = preco - comissao - tarifa fixa - frete do vendedor - imposto - custo. O imposto e o
 * `IMPOSTO_PADRAO` (6%) da margem do cadastro de Produto, para as duas telas contarem igual.
 */

import { IMPOSTO_PADRAO } from "../../margem";

const dinheiro = (valor) => Math.round((Number(valor) + Number.EPSILON) * 100) / 100;
const numeroOuZero = (valor) => (Number.isFinite(Number(valor)) ? Number(valor) : 0);

/**
 * O que o ML e o imposto levam do preco, e o que sobra. `null` sem preco. Sem custo (zero, nulo
 * ou lixo), `lucro` e `margem` ficam `null`: custo zero e campo nao preenchido, nao produto gratis.
 */
export function custosDoAnuncio({ preco, custo, percentual, tarifaFixa, frete, imposto = IMPOSTO_PADRAO }) {
  const valor = Number(preco);
  if (!(valor > 0)) return null;

  const comissao = dinheiro(valor * numeroOuZero(percentual));
  const fixa = dinheiro(numeroOuZero(tarifaFixa));
  const envio = dinheiro(numeroOuZero(frete));
  const doImposto = dinheiro(valor * imposto);
  const temCusto = Number(custo) > 0;
  const lucro = temCusto ? dinheiro(valor - comissao - fixa - envio - doImposto - Number(custo)) : null;

  return {
    comissao,
    tarifaFixa: fixa,
    frete: envio,
    imposto: doImposto,
    lucro,
    margem: lucro === null ? null : Math.round((lucro / valor) * 1000) / 10,
    // MARKUP sobre o CUSTO TOTAL (pedido do dono em 24/10/2026: "quero que o custo total entre na conta"; custo R$ 130
    // com 40% tem de dar 40% de lucro sobre os 130): o lucro dividido pela soma de fornecedor, comissao, tarifa, frete e
    // imposto, o "Total dos custos" da tela. E o numero que a tela do ML mostra.
    markup: lucro === null ? null : Math.round((lucro / (Number(custo) + comissao + fixa + envio + doImposto)) * 1000) / 10,
  };
}

/**
 * O preco "fechado": sobe ao proximo multiplo de R$ 0,10 (5,83 -> 5,90; 5,80 fica). Pedido do dono em 11/11/2026: "ao definir
 * o preco, arredondar ... sempre deixar numero fechado". Sempre para cima, para nunca entregar menos lucro que o pedido. O
 * ruido do ponto flutuante (5,8 * 10 = 57,99999) sai antes de subir.
 */
export function precoFechado(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return null;
  return Math.ceil(Math.round(numero * 10 * 1e6) / 1e6) / 10;
}

/**
 * O preco que deixa o lucro pedido, em R$ (`reais`) ou em % DO CUSTO TOTAL (`percentual`, o markup
 * sobre fornecedor + taxas + frete + imposto, desde 24/10/2026; ate ali era % do preco), a partir de
 * `P*(1 - comissao% - imposto%) - tarifa - frete - custo = lucro`. Arredonda PARA CIMA ao
 * preco fechado (`precoFechado`, multiplo de R$ 0,10; ate 11/11/2026 era ao centavo): para baixo entregaria um lucro menor. `null` sem custo
 * ou quando nenhum preco chega la (as porcentagens somam 100% ou mais).
 */
export function precoPorMargem({ custo, percentual, tarifaFixa, frete, imposto = IMPOSTO_PADRAO, margem }) {
  if (!(Number(custo) > 0)) return null;
  const valor = Number(margem?.valor);
  if (!Number.isFinite(valor)) return null;

  const fixos = Number(custo) + numeroOuZero(tarifaFixa) + numeroOuZero(frete);
  const parteDoPreco = 1 - numeroOuZero(percentual) - imposto;
  // Markup sobre o custo total T = fixos + P*(comissao% + imposto%): P - T = m*T, entao
  // P = (1+m)*fixos / (1 - (1+m)*(comissao% + imposto%)). Em R$: P*parte - fixos = lucro.
  const fator = 1 + valor / 100;
  const [numerador, denominador] =
    margem.tipo === "percentual" ? [fator * fixos, 1 - fator * (1 - parteDoPreco)] : [fixos + valor, parteDoPreco];
  if (!(denominador > 0)) return null;

  return precoFechado(numerador / denominador);
}

/**
 * Os custos lidos valem enquanto preco, categoria, tipo de anuncio e logistica forem os do
 * rascunho: comissao e tarifa dependem dos quatro. O frete gratis nao entra aqui porque
 * `freteQueConta` le o estado atual dele.
 */
export function custosValem(custosML, rascunho) {
  if (!custosML || !rascunho) return false;
  return (
    dinheiro(custosML.preco) === dinheiro(rascunho.preco) &&
    String(custosML.categoriaId ?? "").trim() === String(rascunho.categoriaId ?? "").trim() &&
    custosML.tipoAnuncio === rascunho.tipoAnuncio &&
    custosML.logistica === (rascunho.envio?.logistica ?? "xd_drop_off")
  );
}

/** O frete do vendedor so sai do bolso com frete gratis ligado; sem frete lido, nada conta. */
// `rascunho` fica na assinatura: quem chama ja passa e pode voltar a precisar dele.
export function freteQueConta(custosML, rascunho) {
  // Conta SEMPRE (medido nas vendas reais de 22/10/2026): abaixo de R$ 79 o ML cobra do vendedor um frete reduzido
  // (R$ 6,85 no 100101) mesmo sem frete gratis anunciado; de R$ 79 para cima o frete gratis e obrigatorio. Ate ali so
  // contava com o frete gratis ligado, e o lucro saia ~R$ 6,85 maior.
  const frete = custosML?.frete;
  return frete !== null && frete !== undefined ? Number(frete) : 0;
}

/// A partir deste preco o frete gratis e obrigatorio no ML (abaixo, o ML cobra do vendedor o frete sem frete gratis).
export const LIMITE_DO_FRETE_GRATIS = 79;

/** Frete gratis obrigatorio neste preco: a aba Envio o marca e trava (pedido do dono em 22/10/2026) e o payload o manda. */
export function freteGratisObrigatorio(preco) {
  return Number(preco) >= LIMITE_DO_FRETE_GRATIS;
}
