/**
 * Pagina de LISTAGEM do Magento (categoria, busca, marca), que nao e pagina de produto.
 *
 * A categoria do Magento 2 chega com cara de produto: o tema da Curto Circuito publica um
 * `Product` em JSON-LD por card da vitrine, o og:type e "product.group" e os cards trazem
 * `data-price-type="finalPrice"`. Ate 22/10/2026 cada pagina de categoria (e cada pagina `?p=N`
 * e cada filtro `?cat=`) virava um "produto" chamado "Modulos", codigo N/A, com o MAIOR preco
 * dos cards: 6.257 das 7.263 linhas do Curto Circuito eram isso, e o relatorio semanal listava
 * "Modulos · R$ 25,20" como produto novo.
 *
 * O Magento marca a pagina no <body>: `catalog-category-view` / `page-products` na listagem,
 * `catalog-product-view` no produto. E o og:type "product.group" e o da categoria (o produto
 * leva "product" ou "og:product").
 */
export function ehListagemDoMagento(html) {
  if (typeof html !== "string") return false;
  const body = /<body\b[^>]*\bclass\s*=\s*["']([^"']*)["']/i.exec(html)?.[1] ?? "";
  if (/\b(catalog-category-view|catalogsearch-result-index|page-products)\b/.test(body) && !/\bcatalog-product-view\b/.test(body)) {
    return true;
  }
  return /<meta\b[^>]*property=["']og:type["'][^>]*content=["']product\.group["']/i.test(html);
}
