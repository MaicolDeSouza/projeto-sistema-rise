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

/** Texto que vai ao Mercado Livre: a descricao e, depois dela, as frases fixas do canal. */
export function montarDescricaoML({ descricao, frases }) {
  // Bloco vazio nao deixa linha em branco sobrando no comeco, no meio nem no fim do texto.
  return [String(descricao ?? "").trim(), textoDasFrases(frases)].filter(Boolean).join("\n\n");
}
