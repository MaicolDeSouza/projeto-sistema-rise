/**
 * Texto final da descricao de um anuncio do Mercado Livre: a descricao do rascunho, as
 * frases fixas do canal (nota fiscal, envio...) e a linha do versiculo. Funcoes puras: a
 * previa, a validacao e o sorteio do versiculo leem o mesmo arquivo.
 *
 * O versiculo e sorteado em cima do `restoDaDescricao`, nunca do texto final: ele precisa
 * caber abaixo de 25% do texto, e contar o proprio versiculo no total inflaria o resto.
 */

import { linhaDoVersiculo } from "../versiculos";

// Frase em branco sai: o formulario do canal deixa linhas vazias na lista.
function textoDasFrases(frases) {
  return (Array.isArray(frases) ? frases : [])
    .map((frase) => String(frase ?? "").trim())
    .filter(Boolean)
    .join("\n");
}

// Bloco vazio nao deixa linha em branco sobrando no comeco, no meio nem no fim do texto.
function juntarBlocos(blocos) {
  return blocos.filter(Boolean).join("\n\n");
}

/** Descricao mais as frases do canal, sem o versiculo. */
export function restoDaDescricao({ descricao, frases }) {
  return juntarBlocos([String(descricao ?? "").trim(), textoDasFrases(frases)]);
}

/** Texto que vai ao Mercado Livre: o resto da descricao e, por ultimo, o versiculo (se houver). */
export function montarDescricaoML({ descricao, frases, versiculo }) {
  return juntarBlocos([restoDaDescricao({ descricao, frases }), versiculo ? linhaDoVersiculo(versiculo) : ""]);
}
