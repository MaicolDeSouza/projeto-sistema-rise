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
  };
}

/**
 * O preco que deixa a margem pedida, em R$ (`reais`) ou % do preco (`percentual`), resolvendo
 * `P*(1 - comissao% - imposto%) - tarifa - frete - custo = margem`. Arredonda PARA CIMA ao
 * centavo: arredondar para baixo entregaria um lucro um pouco menor que o pedido. `null` sem custo
 * ou quando nenhum preco chega la (as porcentagens somam 100% ou mais).
 */
export function precoPorMargem({ custo, percentual, tarifaFixa, frete, imposto = IMPOSTO_PADRAO, margem }) {
  if (!(Number(custo) > 0)) return null;
  const valor = Number(margem?.valor);
  if (!Number.isFinite(valor)) return null;

  const fixos = Number(custo) + numeroOuZero(tarifaFixa) + numeroOuZero(frete);
  const parteDoPreco = 1 - numeroOuZero(percentual) - imposto;
  const [numerador, denominador] = margem.tipo === "percentual" ? [fixos, parteDoPreco - valor / 100] : [fixos + valor, parteDoPreco];
  if (!(denominador > 0)) return null;

  // 72,59 * 100 pode dar 7259,000000001 em ponto flutuante: arredonda o ruido antes de subir.
  const centavos = Math.ceil(Math.round((numerador / denominador) * 100 * 1e6) / 1e6);
  return centavos / 100;
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
export function freteQueConta(custosML, rascunho) {
  const frete = custosML?.frete;
  return rascunho?.envio?.freteGratis && frete !== null && frete !== undefined ? Number(frete) : 0;
}
