/**
 * Texto final da descricao de um anuncio do Mercado Livre: a descricao do produto, em texto puro. As frases fixas
 * do canal sairam do Rise em 22/10/2026 (pedido do dono). Funcao pura: a previa, a validacao e o payload leem o
 * mesmo arquivo.
 */

// O que tem forma de etiqueta HTML (`<b>`, `</b>`, `<br/>`): o ML recusa a descricao inteira com isso
// ("The description must be in plain text", medido em 08/10/2026). Exige letra logo depois do `<` e o
// `>` na mesma linha, entao "<5V", "< 3,3 V" e "a<b" continuam sendo texto.
const ETIQUETA_HTML = /<\/?[a-zA-Z][^<>\n]*>/g;

// Caractere fora do Latin-1 (U+0000 a U+00FF) o ML tambem recusa como "must be in plain text": medido em 27/10/2026 no kit
// 900212, cuja descricao tinha "20mΩ" (os 20 anuncios ja publicados tinham CRLF, acento e "°", e nenhum tinha nada fora do
// Latin-1). Os comuns viram o equivalente em texto; o resto (emoji, outros alfabetos) sai.
const TROCAS_FORA_DO_LATIN1 = {
  "Ω": "Ohm", // Ω (letra grega)
  "Ω": "Ohm", // Ω (simbolo de ohm)
  "μ": "µ", // μ grego -> µ do Latin-1
  "–": "-",
  "—": "-",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "…": "...",
  "≤": "<=",
  "≥": ">=",
  "→": "->",
  "•": "-",
  " ": " ",
};
const FORA_DO_LATIN1 = /[^\u0000-ÿ]/gu;

/** Texto que vai ao Mercado Livre: a descricao, aparada, sem etiquetas HTML e so com caracteres do Latin-1. */
export function montarDescricaoML({ descricao }) {
  return String(descricao ?? "")
    .trim()
    .replace(ETIQUETA_HTML, "")
    .replace(FORA_DO_LATIN1, (caractere) => TROCAS_FORA_DO_LATIN1[caractere] ?? "");
}
