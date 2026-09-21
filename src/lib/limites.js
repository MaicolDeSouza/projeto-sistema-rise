/**
 * Limites de uso, num modulo comum.
 *
 * Fica separado de src/lib/arquivos.js porque aquele usa node:fs e nao pode ser
 * importado por componente de cliente — o limite acabava declarado duas vezes,
 * e duas copias ja nascem podendo divergir.
 */
/// 9 fotos por produto (era 7; o dono aprovou em 21/09/2026): e o maximo da Shopee, e o Mercado Livre aceita
/// 12, entao uma galeria so serve aos dois. Numeros de resumos e guias de integradores, nao da pagina oficial
/// (ver "Quantas fotos os marketplaces aceitam", no CLAUDE.md).
export const MAXIMO_IMAGENS = 9;

/// Fotos que o painel do cadastro novo aguenta ao mesmo tempo. E maior que o limite do produto
/// porque as fotos dos concorrentes e fornecedores marcados na lupa entram TODAS como
/// candidatas, e o operador exclui as fracas: so `MAXIMO_IMAGENS` vao para o produto no Salvar.
export const MAXIMO_FOTOS_NO_PAINEL = 40;

/// O Photoroom so AMPLIA (upscale) foto de ate 1 megapixel de entrada. Medido no sandbox em 21/09/2026:
/// 1000x1000 passou, 1024x1024 e 1192x900 voltaram "too big" (HTTP 400). E o tamanho do ARQUIVO QUE
/// CHEGOU (o que se manda ao Photoroom), e nao o da foto ja ajustada para 1024x1024. A tela desliga
/// a opcao "Ampliar" acima disto, em vez de deixar o dono descobrir pelo erro.
export const MAXIMO_PIXELS_PARA_AMPLIAR = 1_000_000;

/// Limite de titulo do Mercado Livre. Acima disso o anuncio e recusado.
export const LIMITE_TITULO_ML = 60;
