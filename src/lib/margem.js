/**
 * Margem liquida do preco de venda (pedido do dono em 22/09/2026), sem imports.
 *
 * ESPELHA `calcularMargem` e `corDaMargem` de FormularioProduto.jsx, que ainda tem a
 * copia dele: aquele arquivo e da outra frente de trabalho, e unificar as duas fica
 * para quando ele puder ser mexido. Mudar o imposto (fixo em 6%, "futuramente
 * dinamico") pede mudar nos dois.
 */

export const IMPOSTO_PADRAO = 0.06;

/** Lucro em reais depois de tirar o custo e o imposto; nulo sem custo ou sem preco. */
export function lucroLiquido(preco, custo) {
  if (!(custo > 0) || !(preco > 0)) return null;
  return preco * (1 - IMPOSTO_PADRAO) - custo;
}

/** Lucro liquido como percentual do preco de venda. */
export function calcularMargem(preco, custo) {
  const lucro = lucroLiquido(preco, custo);
  return lucro === null ? null : (lucro / preco) * 100;
}

/**
 * % de lucro do cadastro de Produto e da edicao rapida: MARKUP sobre o custo, sem o imposto
 * (pedido do dono em 24/10/2026: custo R$ 50 com 100% = R$ 100). Espelha `calcularMarkup` de
 * FormularioProduto.jsx. O ML e a proposta seguem com `calcularMargem` (sobre o preco).
 */
export function calcularMarkup(preco, custo) {
  if (!(custo > 0) || !(preco > 0)) return null;
  return ((preco - custo) / custo) * 100;
}

/** A regra de cor de `corDaMargem`, sobre o markup: vermelho abaixo do custo, verde a partir de 60%. */
export function corDoMarkup(preco, custo) {
  const markup = calcularMarkup(preco, custo);
  if (markup === null) return "text-suave";
  if (preco < custo) return "text-red-600";
  return markup >= 60 ? "text-emerald-600" : "text-yellow-600";
}

/**
 * Vermelho quando o preco fica ABAIXO do custo (prejuizo, nao margem baixa);
 * amarelo com margem abaixo de 60%; verde a partir de 60%.
 */
export function corDaMargem(preco, custo) {
  const margem = calcularMargem(preco, custo);
  if (margem === null) return "text-suave";
  if (preco < custo) return "text-red-600";
  return margem >= 60 ? "text-emerald-600" : "text-yellow-600";
}
