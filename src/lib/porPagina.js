/**
 * Tamanho da pagina das listas de produtos (Produtos e Scraper; pedido do dono em 23/10/2026): 25 sempre ao abrir a
 * tela, 100 pelo botao "100 por página" (`?por=100`). Sem imports: lido pelas paginas (servidor) e pelo botao.
 */
export const POR_PAGINA_PADRAO = 25;
export const POR_PAGINA_GRANDE = 100;

/** O tamanho da pagina pelo parametro `por` da URL; qualquer outro valor vale o padrao. */
export function porPaginaDaUrl(valor) {
  return valor === String(POR_PAGINA_GRANDE) ? POR_PAGINA_GRANDE : POR_PAGINA_PADRAO;
}
