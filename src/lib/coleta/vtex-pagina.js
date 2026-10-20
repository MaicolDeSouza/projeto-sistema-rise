/**
 * Dados da PAGINA de produto de uma loja VTEX (Patolastore, 20/10/2026).
 *
 * A pagina traz o preco duas vezes e a leitura generica pegava o errado: o `itemprop=price` e o preco A VISTA (R$ 3,23), e
 * o preco de tabela (R$ 3,59) so existe nos JSONs da propria VTEX — `productListPriceFrom` no dataLayer e `listPrice`
 * (em centavos) no `skuJson`. Da mesma forma as fotos: o `og:image` e o `meta-image.png` da loja; a galeria real aparece
 * como `/arquivos/ids/<id>-1000-1000/<nome>` (a versao grande de cada foto). Pura, sem imports.
 */

function comoPreco(valor) {
  const numero = Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

/** @returns {{ normal: number|null, aVista: number|null, imagens: string[] } | null} null quando a pagina nao e de VTEX. */
export function dadosDaPaginaVtex(html) {
  const texto = String(html ?? "");
  const daTabela = /"productListPriceFrom"\s*:\s*"?([\d.,]+)"?/.exec(texto)?.[1];
  const daVenda = /"productPriceFrom"\s*:\s*"?([\d.,]+)"?/.exec(texto)?.[1];
  const sku = /skuJson_\d+\s*=\s*\{[\s\S]*?"skus"\s*:\s*\[\s*\{[\s\S]*?"listPrice"\s*:\s*(\d+)[\s\S]*?"bestPrice"\s*:\s*(\d+)/.exec(texto);

  if (!daTabela && !daVenda && !sku) return null;

  const normal = comoPreco(daTabela) ?? (sku ? sku[1] / 100 || null : null);
  const aVista = comoPreco(daVenda) ?? (sku ? sku[2] / 100 || null : null);

  // So as fotos que a pagina oferece em tamanho grande (zoom): as de 500 px sem a grande sao banner e icone da loja.
  const vistas = new Set();
  const imagens = [];
  for (const encontro of texto.matchAll(/https?:\/\/[^"'\s\\]+\/arquivos\/ids\/(\d+)-1000-1000\/[^"'\s\\?]+(?:\?v=\d+)?/gi)) {
    if (vistas.has(encontro[1])) continue;
    vistas.add(encontro[1]);
    imagens.push(encontro[0].replace(/^http:\/\//i, "https://"));
  }

  return { normal, aVista, imagens };
}
