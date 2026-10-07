/**
 * Padroes de SEO do produto na Loja Integrada (title e meta description). Sem imports.
 *
 * Os limites sao os da propria LI (o /seo recusa acima disso) e coincidem com o que o
 * Google mostra no resultado de busca: cortar no meio da palavra deixaria o resultado feio,
 * entao o corte e sempre na ultima palavra inteira.
 */

export const LIMITE_DO_TITULO_SEO = 70;
export const LIMITE_DA_DESCRIPTION_SEO = 250;

const colapsar = (texto) => String(texto ?? "").replace(/\s+/g, " ").trim();

/** Corta na ultima palavra inteira que cabe; uma palavra so maior que o limite e cortada seca. */
export function cortarNaPalavra(texto, limite) {
  const limpo = colapsar(texto);
  if (limpo.length <= limite) return limpo;
  const espaco = limpo.slice(0, limite + 1).lastIndexOf(" ");
  return espaco > 0 ? limpo.slice(0, espaco).trimEnd() : limpo.slice(0, limite);
}

export function tituloSeoPadrao(nome) {
  return cortarNaPalavra(nome, LIMITE_DO_TITULO_SEO);
}

const comparavel = (texto) =>
  colapsar(texto)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

// No padrao da loja a descricao abre com o TITULO EM MAIUSCULAS numa linha so. Como description
// ele so repetiria o title; o que diz o que o produto e vem no paragrafo seguinte.
function ehTitulo(paragrafo, titulo) {
  if (/\r?\n/.test(paragrafo.trim())) return false;
  const texto = colapsar(paragrafo);
  if (titulo && comparavel(texto) === comparavel(titulo)) return true;
  return /\p{Lu}/u.test(texto) && !/\p{Ll}/u.test(texto) && texto.length <= 120;
}

/** O primeiro paragrafo que nao e so o titulo: e o que diz o que o produto e. */
export function descriptionPadrao(descricao, titulo = "") {
  const paragrafos = String(descricao ?? "")
    .split(/\r?\n\s*\r?\n/)
    .filter((paragrafo) => paragrafo.trim());
  const escolhido = paragrafos.find((paragrafo) => !ehTitulo(paragrafo, titulo)) ?? paragrafos[0] ?? "";
  return cortarNaPalavra(escolhido, LIMITE_DA_DESCRIPTION_SEO);
}
