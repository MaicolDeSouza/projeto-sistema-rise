import { objetoJsonEm } from "./magazord";

/**
 * Loja YAMPI (Engenharia FSI, 05/11/2026, pedido do dono: "vela se consegu extrair produtos desse concorrente tambem").
 * A pagina do produto traz o produto inteiro num JSON: `window.data = {"product":{"data":{...}}}`. O JSON-LD so tem nome,
 * codigo, UMA foto e um preco, sem estoque nem categoria; daqui saem:
 *   - `images.data[].url`: todas as fotos, na ordem da loja ("-large");
 *   - `prices.data`: `price_sale` (o que a loja cobra; com promocao, `price` e o RISCADO e nao vale) e `pix.price`
 *     (5% abaixo, so informacao: o promocional);
 *   - `skus.data[].total_in_stock` e `stock_status`: o saldo e a situacao;
 *   - `breadcrumbs.data[].name`: a categoria ("FRESAS > Fresas Para Madeira").
 * Produto com variacoes (`has_variations`) fica como um produto so (soma do saldo, preco do produto): nenhum da FSI tem.
 */

/** O `product.data` do `window.data` da pagina, ou null quando a pagina nao e de produto Yampi. */
export function produtoDaYampi(html) {
  const ancora = /window\.data\s*=\s*\{/.exec(html ?? "");
  if (!ancora) return null;
  const json = objetoJsonEm(html, ancora.index + ancora[0].length - 1);
  if (!json) return null;
  try {
    const produto = JSON.parse(json)?.product?.data;
    return produto && typeof produto === "object" && produto.name ? produto : null;
  } catch {
    return null;
  }
}

const numero = (valor) => {
  const n = Number(valor);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** O que a pagina Yampi da sobre o produto, no vocabulario do normalizador. Campo que a loja nao trouxe fica null. */
export function dadosDaYampi(html) {
  const produto = produtoDaYampi(html);
  if (!produto) return null;

  const imagens = (Array.isArray(produto.images?.data) ? produto.images.data : [])
    .map((imagem) => (typeof imagem?.url === "string" ? imagem.url : null))
    .filter((endereco) => endereco && /^https?:\/\//i.test(endereco));

  const precos = produto.prices?.data ?? {};
  // O que a loja cobra no cartao. Em promocao `price` e o riscado ("de"), nunca o vigente.
  const normal = numero(precos.price_sale) ?? numero(precos.price);
  const pix = numero(precos.pix?.price);
  const aVista = pix && normal && pix < normal ? pix : null;

  const skus = Array.isArray(produto.skus?.data) ? produto.skus.data : [];
  const saldos = skus.map((sku) => Number(sku?.total_in_stock)).filter((saldo) => Number.isFinite(saldo));
  const quantidade = saldos.length ? Math.max(0, Math.round(saldos.reduce((soma, saldo) => soma + saldo, 0))) : null;
  const situacoes = skus.map((sku) => String(sku?.stock_status ?? ""));
  const disponibilidade = situacoes.includes("in_stock")
    ? "InStock"
    : situacoes.length && situacoes.every((situacao) => situacao === "out_of_stock")
      ? "OutOfStock"
      : null;

  const degraus = (Array.isArray(produto.breadcrumbs?.data) ? produto.breadcrumbs.data : [])
    .map((degrau) => (typeof degrau?.name === "string" ? degrau.name.trim() : ""))
    .filter(Boolean);
  const categoria = degraus.length ? degraus.join(" > ") : null;

  return { imagens, normal, aVista, quantidade, disponibilidade, categoria };
}
