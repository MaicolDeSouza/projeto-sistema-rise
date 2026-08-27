/**
 * Limites de uso, num modulo comum.
 *
 * Fica separado de src/lib/arquivos.js porque aquele usa node:fs e nao pode ser
 * importado por componente de cliente — o limite acabava declarado duas vezes,
 * e duas copias ja nascem podendo divergir.
 */
export const MAXIMO_IMAGENS = 7;

/// Limite de titulo do Mercado Livre. Acima disso o anuncio e recusado.
export const LIMITE_TITULO_ML = 60;
