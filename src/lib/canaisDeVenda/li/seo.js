/**
 * Padroes de SEO do produto na Loja Integrada (title e meta description). Sem imports.
 *
 * O title vai ate 70 (o limite da LI). A description vai ate 160, e nao os 250 que a LI aceita: e o que
 * o Google mostra no resultado de busca, e o dono pediu o campo travado nisso (07/10/2026). Cortar no
 * meio da palavra deixaria o resultado feio, entao o corte e sempre na ultima palavra (ou frase) inteira.
 */

export const LIMITE_DO_TITULO_SEO = 70;
export const LIMITE_DA_DESCRIPTION_SEO = 160;

const colapsar = (texto) => String(texto ?? "").replace(/\s+/g, " ").trim();

/** Corta na ultima palavra inteira que cabe; uma palavra so maior que o limite e cortada seca. */
export function cortarNaPalavra(texto, limite) {
  const limpo = colapsar(texto);
  if (limpo.length <= limite) return limpo;
  const espaco = limpo.slice(0, limite + 1).lastIndexOf(" ");
  return espaco > 0 ? limpo.slice(0, espaco).trimEnd() : limpo.slice(0, limite);
}

/**
 * Corta na ultima FRASE inteira que cabe (pedido do dono em 07/10/2026: description cortada no meio
 * de uma frase fica feia no Google). Fim de frase e ".", "!" ou "?" seguido de espaco ou do fim: o
 * ponto de "3.3V" nao conta. Sem nenhuma frase que caiba, corta na palavra.
 */
export function cortarNaFrase(texto, limite) {
  const limpo = colapsar(texto);
  if (limpo.length <= limite) return limpo;
  let fim = -1;
  for (const achado of limpo.matchAll(/[.!?](?=\s|$)/g)) {
    if (achado.index + 1 > limite) break;
    fim = achado.index + 1;
  }
  return fim > 0 ? limpo.slice(0, fim) : cortarNaPalavra(limpo, limite);
}

export function tituloSeoPadrao(nome) {
  return cortarNaPalavra(nome, LIMITE_DO_TITULO_SEO);
}

const comparavel = (texto) =>
  colapsar(texto)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

const mesmoTexto = (a, b) => comparavel(a) === comparavel(b);

/**
 * O Tag Title acompanha o Nome (pedido do dono em 26/11/2026: trocar o Nome deixava o title com o nome antigo, e e ele que o
 * Google mostra). So troca enquanto o title ainda e o Nome de antes (inteiro ou cortado em 70); o escrito a mao fica.
 */
export function tituloSeoAcompanhaNome(tituloSeo, nomeDeAntes, nome) {
  if (!colapsar(tituloSeo) || !colapsar(nome) || !colapsar(nomeDeAntes)) return tituloSeo;
  const eraONome = mesmoTexto(tituloSeo, nomeDeAntes) || mesmoTexto(tituloSeo, tituloSeoPadrao(nomeDeAntes));
  return eraONome ? tituloSeoPadrao(nome) : tituloSeo;
}

/** O Tag Title ficou para tras: o Nome mudou e o title nao e o Nome novo (o "!" da aba SEO). */
export function tituloSeoAtrasado(tituloSeo, nomeSalvo, nome) {
  if (!colapsar(tituloSeo) || !colapsar(nome) || mesmoTexto(nomeSalvo, nome)) return false;
  return !mesmoTexto(tituloSeo, tituloSeoPadrao(nome)) && !mesmoTexto(tituloSeo, nome);
}

/** A description ainda cita o Nome de antes (inteiro, sem caixa nem acento): o "!" da Meta Description. */
export function descriptionCitaNomeAntigo(descricaoSeo, nomeSalvo, nome) {
  const antigo = comparavel(nomeSalvo);
  if (!antigo || mesmoTexto(nomeSalvo, nome)) return false;
  return comparavel(descricaoSeo).includes(antigo) && !comparavel(descricaoSeo).includes(comparavel(nome));
}

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
  return cortarNaFrase(escolhido, LIMITE_DA_DESCRIPTION_SEO);
}
