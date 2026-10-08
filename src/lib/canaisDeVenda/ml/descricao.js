/**
 * Texto final da descricao de um anuncio do Mercado Livre: a descricao do rascunho e as
 * frases fixas do canal (nota fiscal, envio...). Funcao pura: a previa, a validacao e o
 * payload leem o mesmo arquivo.
 */

// Frase em branco sai: o formulario do canal deixa linhas vazias na lista.
function textoDasFrases(frases) {
  return (Array.isArray(frases) ? frases : [])
    .map((frase) => String(frase ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

// O que tem forma de etiqueta HTML (`<b>`, `</b>`, `<br/>`): o ML recusa a descricao inteira com isso
// ("The description must be in plain text", medido em 08/10/2026). Exige letra logo depois do `<` e o
// `>` na mesma linha, entao "<5V", "< 3,3 V" e "a<b" continuam sendo texto.
const ETIQUETA_HTML = /<\/?[a-zA-Z][^<>\n]*>/g;

/** Texto que vai ao Mercado Livre: a descricao e, depois dela, as frases fixas do canal, em texto puro. */
export function montarDescricaoML({ descricao, frases }) {
  // Bloco vazio nao deixa linha em branco sobrando no comeco, no meio nem no fim do texto.
  const texto = [String(descricao ?? "").trim(), textoDasFrases(frases)].filter(Boolean).join("\n\n");
  return texto.replace(ETIQUETA_HTML, "");
}
