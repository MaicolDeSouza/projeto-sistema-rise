/**
 * Numeros digitados nas abas do editor do anuncio ML (preco, estoque, peso e medidas).
 * Sem JSX e sem imports: a conta e a mesma em todas as abas.
 *
 * O rascunho guarda NUMERO (a validacao e o payload fazem `Number(valor)`, e `Number("12,5")`
 * e NaN), mas o campo precisa guardar o TEXTO digitado: ao escrever "12," o numero e 12 e a
 * virgula sumiria, e o dono nunca chegaria a "12,5". Por isso a aba guarda o ultimo texto e
 * `mostrarDigitado` o devolve enquanto ele ainda representa o numero do rascunho.
 */

const SEPARADORES = /[.,]/g;

/** "12,5" ou "12.5" viram 12.5; vazio, so o separador ou lixo viram `null`. */
export function lerDecimal(texto) {
  const limpo = String(texto ?? "").trim().replace(",", ".");
  if (limpo === "" || limpo === ".") return null;
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Numero como o campo mostra: virgula decimal, sem notacao cientifica. `casasMinimas` completa
 * os zeros (preco em reais: 29.9 vira "29,90").
 */
export function textoDecimal(numero, casasMinimas = 0) {
  if (numero === null || numero === undefined || numero === "") return "";
  const valor = Number(numero);
  if (!Number.isFinite(valor)) return "";
  const casas = Math.max(casasMinimas, (String(valor).split(".")[1] ?? "").length);
  return valor.toFixed(casas).replace(".", ",");
}

/**
 * Deixa passar so o que forma um decimal: digitos e UM separador (virgula ou ponto), com no
 * maximo `casas` casas. Letras, `e`, `+` e `-` somem na digitacao e na colagem.
 *
 * Duas virgulas (ou dois pontos) seguidas sao descuido de digitacao: vale a primeira. Virgula e
 * ponto juntos so aparecem em numero colado do Bling ("1.234,56"): ai o ULTIMO e o decimal e o
 * outro e milhar.
 */
export function filtrarDecimal(texto, casas) {
  const limpo = String(texto ?? "").replace(/[^\d.,]/g, "");
  const virgula = limpo.lastIndexOf(",");
  const ponto = limpo.lastIndexOf(".");
  if (virgula === -1 && ponto === -1) return limpo;

  const decimal = virgula !== -1 && ponto !== -1 ? Math.max(virgula, ponto) : limpo.search(/[.,]/);
  const inteira = limpo.slice(0, decimal).replace(SEPARADORES, "");
  const fracao = limpo.slice(decimal + 1).replace(SEPARADORES, "").slice(0, casas);
  return `${inteira}${limpo[decimal]}${fracao}`;
}

/**
 * O que o campo mostra: o texto digitado enquanto ele ainda vale o numero do rascunho; senao
 * (nada digitado, ou outra aba/o kit mudou o numero) o numero formatado.
 */
export function mostrarDigitado(digitado, numero, casasMinimas = 0) {
  const atual = numero === null || numero === undefined || numero === "" ? null : Number(numero);
  if (typeof digitado === "string" && lerDecimal(digitado) === atual) return digitado;
  return textoDecimal(numero, casasMinimas);
}

// Campo inteiro: o <input type="number"> aceita "e", "+" e "-" (notacao cientifica), e o ponto e a
// virgula nao fazem sentido. Mesmo bloqueio dos campos inteiros do cadastro de Produto.
export function recusarSimbolosDeInteiro(evento) {
  if (["e", "E", "+", "-", ".", ","].includes(evento.key)) evento.preventDefault();
}
