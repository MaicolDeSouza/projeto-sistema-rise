/**
 * Pagina de produto de loja SHOPIFY (Teknimas, teknimas.com.br, 08/11/2026). O dono, na 1ª varredura: "Nao trouxe o codigo,
 * esta em referencia no site. As fotos nao vieram. A descricao veio incompleta, esta no dropdown descricao".
 *
 * A pagina nao publica JSON-LD nem `itemprop="sku"`, mas o tema embute o produto inteiro num
 * `<script type="application/json" id="ProductJson-...">`: o MESMO objeto que o `/products/{handle}.js` devolve (medido na
 * Teknimas: `variants[0].sku` = "TKA0243", a "Referência" que a pagina mostra; 4 fotos em `images`, `//cdn.shopify.com/...`;
 * `description` com o HTML completo do dropdown; `type` "Industrializados"; `vendor`). Sem ele, o Rise ficava com N/A, 1 foto
 * mais dois logos da loja e os 320 caracteres do og:description. Este leitor so le a pagina: nenhuma requisicao a mais.
 *
 * Nao se confunde com catalogo-shopify.js, que le o `products.json` de loja sem pagina (Prado): aqui a pagina existe e e ela
 * que a varredura abre.
 */

/** O objeto do `ProductJson-*`, ou null quando a pagina nao e Shopify ou o bloco nao parece um produto. */
function produtoJsonBruto(html) {
  const bloco = /<script\b(?=[^>]*\bid=["']ProductJson[^"']*["'])[^>]*>([\s\S]*?)<\/script>/i.exec(html ?? "");
  if (!bloco) return null;
  try {
    const json = JSON.parse(bloco[1].trim());
    return json && typeof json === "object" && typeof json.title === "string" && Array.isArray(json.variants) ? json : null;
  } catch {
    return null;
  }
}

const texto = (valor) => (typeof valor === "string" && valor.trim() ? valor.trim() : null);

/**
 * O que a pagina Shopify declara do produto, no formato que normalizar.js consome.
 *
 * - `codigo`: o `sku` dos variantes, so quando todos dizem o MESMO (produto de um variante, o caso das lojas medidas). Com
 *   variantes de sku diferente nao ha "o codigo do produto", e inventar um seria o erro que a regra "nunca inventar" proibe.
 * - `imagens`: `images[]` como a loja publica (`//cdn.shopify.com/...?v=...` ganha `https:`); a ordem e a da galeria.
 * - `descricaoHtml`: o HTML completo do dropdown "Descricao" (`description`; `body_html` no products.json).
 * - `categoria`: o `type` do produto ("Industrializados"), ultimo recurso quando a pagina nao tem breadcrumb.
 *
 * @returns {{codigo: string|null, imagens: string[], descricaoHtml: string|null, categoria: string|null, marca: string|null}|null}
 */
export function produtoJsonDaPaginaShopify(html) {
  const json = produtoJsonBruto(html);
  if (!json) return null;

  const skus = new Set(json.variants.map((variante) => texto(variante?.sku)).filter(Boolean));
  const codigo = skus.size === 1 ? [...skus][0] : null;

  const imagens = (Array.isArray(json.images) ? json.images : [])
    .map((imagem) => texto(typeof imagem === "string" ? imagem : imagem?.src))
    .filter(Boolean)
    .map((endereco) => (endereco.startsWith("//") ? `https:${endereco}` : endereco));

  return {
    codigo,
    imagens,
    descricaoHtml: texto(json.description) ?? texto(json.body_html),
    categoria: texto(json.type) ?? texto(json.product_type),
    marca: texto(json.vendor),
  };
}
