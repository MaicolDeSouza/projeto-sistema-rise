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

/** O primeiro paragrafo da descricao: e o que diz o que o produto e. */
export function descriptionPadrao(descricao) {
  const primeiro = String(descricao ?? "")
    .split(/\r?\n\s*\r?\n/)
    .find((paragrafo) => paragrafo.trim());
  return cortarNaPalavra(primeiro ?? "", LIMITE_DA_DESCRIPTION_SEO);
}
