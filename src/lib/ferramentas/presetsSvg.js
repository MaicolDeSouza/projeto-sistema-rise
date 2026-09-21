/**
 * Ajustes do conversor de imagem para SVG que a tela E o servidor precisam
 * conhecer. Fica SEM imports de proposito: `imagemParaSvg.js` puxa o `sharp` e
 * o WASM do vtracer, que nao podem ir para o bundle do navegador.
 */

/** Teto do arquivo enviado. O corpo de Server Action aceita 24 MB (next.config.mjs). */
export const TETO_MB_SVG = 10;
export const TETO_BYTES_SVG = TETO_MB_SVG * 1024 * 1024;

/**
 * Maior lado, em pixels, depois da reducao. O WASM do vtracer roda na thread do
 * servidor e bloqueia durante a conversao; um logo de 2048 px leva menos de 1 s.
 */
export const LADO_MAXIMO_SVG = 2048;

/**
 * Receita unica do conversor: a de LOGO. Era um de quatro presets (logo,
 * ilustracao, foto, preto e branco); o dono so precisa de logos (20/09/2026) e
 * os outros tres sairam da tela, entao ficou uma receita so, sem seletor.
 *
 * Valores do vtracer escolhidos por benchmark em 20/09/2026, rasterizando o SVG
 * de volta contra o original: o logo do Mercado Livre (447x447, 4 cores) sai com
 * 8 KB e 6 a 8 caminhos, contra 72 KB e 490 caminhos do imagetracerjs padrao,
 * com o mesmo erro visual. As cores NAO vem daqui: sao detectadas na imagem
 * (`coresDaImagem`) e entram como `palette`, para que saiam exatas.
 */
export const OPCOES_LOGO = {
  clustering: "color-cluster",
  hierarchical: "stacked",
  mode: "spline",
  filterSpeckle: 4,
  colorPrecision: 6,
  layerDifference: 16,
  cornerThreshold: 60,
  lengthThreshold: 4,
  maxIterations: 10,
  spliceThreshold: 45,
  pathPrecision: 2,
};
