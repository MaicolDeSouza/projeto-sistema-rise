/**
 * Texto final da descricao de um anuncio do Mercado Livre: a descricao do produto, em texto puro. As frases fixas
 * do canal sairam do Rise em 22/10/2026 (pedido do dono). Funcao pura: a previa, a validacao e o payload leem o
 * mesmo arquivo.
 */

// O que tem forma de etiqueta HTML (`<b>`, `</b>`, `<br/>`): o ML recusa a descricao inteira com isso
// ("The description must be in plain text", medido em 08/10/2026). Exige letra logo depois do `<` e o
// `>` na mesma linha, entao "<5V", "< 3,3 V" e "a<b" continuam sendo texto.
const ETIQUETA_HTML = /<\/?[a-zA-Z][^<>\n]*>/g;

/** Texto que vai ao Mercado Livre: a descricao, aparada e sem etiquetas HTML. */
export function montarDescricaoML({ descricao }) {
  return String(descricao ?? "").trim().replace(ETIQUETA_HTML, "");
}
