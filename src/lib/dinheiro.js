/**
 * Valor em dinheiro no Rise: SEM espaco depois do simbolo ("R$18.195,36", "US$12,50"), regra do dono em 22/11/2026.
 * O `Intl.NumberFormat` com `style: "currency"` sempre poe um espaco duro (U+00A0) entre o simbolo e o numero, e
 * nao ha opcao para tirar; por isso todo formato de moeda do Rise passa por aqui. Sem imports: serve ao servidor e
 * ao cliente.
 */

const SIMBOLO_COM_ESPACO = /(R\$|US\$|€|£|\$)[\s  ]+(?=[\d-])/g;

/** Tira o espaco entre o simbolo e o numero de um texto ja formatado ("R$ 5,00" -> "R$5,00"). */
export const semEspacoNoSimbolo = (texto) => String(texto).replace(SIMBOLO_COM_ESPACO, "$1");

/**
 * O mesmo que `new Intl.NumberFormat(local, { style: "currency", currency: "BRL", ...opcoes })`, com o `format` sem o
 * espaco depois do simbolo. Devolve so o `format` (o que o Rise usa).
 */
export function formatoDeMoeda(opcoes = {}, local = "pt-BR") {
  const formato = new Intl.NumberFormat(local, { style: "currency", currency: "BRL", ...opcoes });
  return { format: (valor) => semEspacoNoSimbolo(formato.format(valor)) };
}

/** Um valor formatado de uma vez: `emDinheiro(5)` -> "R$5,00"; as opcoes sao as do `Intl.NumberFormat`. */
export const emDinheiro = (valor, opcoes = {}, local = "pt-BR") => formatoDeMoeda(opcoes, local).format(valor);
