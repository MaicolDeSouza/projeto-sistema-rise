import { lerCatalogo } from "./catalogo";
import { especificacoesDaDescricao, textoDoBlocoDeDescricao } from "./normalizar";
import { comoNumero } from "./texto-html";

/**
 * Loja Shopify escondida atras de um site proprio (Prado Automacao Industrial, 11/10/2026).
 *
 * O site publico (pradoautomacaoindustrial.com.br) e uma aplicacao que monta a pagina no
 * navegador: o HTML que chega e uma casca de 3,8 KB, sem nome, preco nem JSON-LD, e o
 * coletor de paginas devolve zero. Os dados moram numa loja Shopify
 * (prado-automacao-industrial.myshopify.com), cujas paginas HTML redirecionam para o site,
 * mas cujo catalogo publico em JSON (`/products.json`, `/products/{handle}.json`) responde
 * direto. Aqui le-se SO o catalogo: nenhuma pagina e aberta.
 *
 * Medido em 11/10/2026: 581 produtos, 3 paginas de 250, todos com sku, preco, foto e
 * descricao, um unico variante cada, `vendor` = o nome da loja, `product_type` = a
 * categoria, `available` = o status de estoque (sem quantidade).
 *
 * Tudo passa por lerCatalogo -> buscarPagina: robots.txt e ritmo do dominio valem igual.
 */

/// Acima de qualquer loja real: a paginacao tem que ESGOTAR, senao o total sai errado.
const SEM_LIMITE = 1_000_000;

const comoTexto = (valor) => {
  const texto = typeof valor === "string" ? valor.trim() : "";
  return texto === "" ? null : texto;
};

/** O endereco publico do produto, pelo molde da regra (`{handle}`). */
export function urlDoProdutoShopify(molde, handle) {
  if (!molde || !handle) return null;
  try {
    return new URL(molde.replace("{handle}", encodeURIComponent(handle))).toString();
  } catch {
    return null;
  }
}

/**
 * Item do products.json -> produto na forma de trabalho (a de normalizar.js).
 *
 * Um produto por item: nas lojas medidas ha um variante so. Loja que um dia publicar
 * varios (tamanhos) precisa da regra da Nuvemshop (cada variante um produto) — hoje o
 * primeiro variante vale e os demais ficam em `variants`, para a tela ver que existem.
 *
 * PRECO: `price` e o que a loja cobra; `compare_at_price` e o de tabela ("de R$")
 * quando existe e e maior. Pela regra do sistema o NORMAL e o de tabela, e o cobrado
 * vira promocional so quando os dois existem.
 */
export function produtoDoShopify(item, { urlProduto, fonte, coletadoEm = new Date() } = {}) {
  const nome = comoTexto(item?.title);
  const variantes = Array.isArray(item?.variants) ? item.variants : [];
  const principal = variantes[0];
  const codigo = comoTexto(principal?.sku);
  if (!nome || !principal) return null;

  const cobrado = comoNumero(principal.price);
  const tabela = comoNumero(principal.compare_at_price);
  const temTabela = tabela !== null && cobrado !== null && tabela > cobrado;

  const imagens = (Array.isArray(item.images) ? item.images : [])
    .map((imagem) => comoTexto(imagem?.src))
    .filter(Boolean);

  const html = typeof item.body_html === "string" ? item.body_html : "";
  const descricao = html ? textoDoBlocoDeDescricao(html) : null;
  const ficha = html ? especificacoesDaDescricao(html) : [];

  // `grams` so quando a loja preencheu: zero e "nao informado", nunca um peso.
  const gramas = comoNumero(principal.grams);
  if (gramas > 0 && !ficha.some((linha) => /^peso$/i.test(linha.nome ?? ""))) {
    ficha.push({ nome: "Peso", valor: `${gramas}g` });
  }

  // VENDIDO POR MILIMETRO: eixos e fusos levam a etiqueta "mm" e o preco e por mm (R$ 0,24 o
  // SBR20; 88 dos 581 em 11/10/2026). O numero fica como a loja publica — nunca convertido para
  // um comprimento que ela nao disse —, mas a origem e a ficha dizem a unidade, senao R$ 0,24
  // pareceria o preco de um eixo inteiro ao lado dos nossos.
  const porMilimetro = Array.isArray(item.tags) && item.tags.some((tag) => /^mm$/i.test(String(tag)));
  if (porMilimetro) ficha.push({ nome: "Unidade de venda", valor: "milímetro (preço por mm)" });

  const disponivel = principal.available !== false;
  const categoria = comoTexto(item.product_type);
  const marca = comoTexto(item.vendor);

  return {
    name: nome,
    // Sem sku a chave do banco cai no endereco; a marcacao fica na origem.
    code: codigo,
    mpn: null,
    ean: comoTexto(principal.barcode),
    brand: marca,
    model: null,
    category: categoria,
    ncm: null,
    url: urlDoProdutoShopify(urlProduto, item.handle),
    images: imagens,
    prices: {
      normal: temTabela ? tabela : cobrado,
      promotional: temTabela ? cobrado : null,
      reserva: null,
      comImpostos: null,
    },
    taxes: [],
    stock: {
      status: disponivel ? "AVAILABLE" : "OUT_OF_STOCK",
      // "em estoque" nao autoriza inventar um numero; esgotado e zero.
      quantity: disponivel ? null : 0,
      aChegar: null,
    },
    description: descricao,
    specifications: ficha,
    documentos: [],
    variants: variantes.slice(1).map((variante) => ({
      titulo: comoTexto(variante.title),
      codigo: comoTexto(variante.sku),
      preco: comoNumero(variante.price),
    })),
    seo: {},
    plataforma: { id: "shopify", nome: "Shopify", confianca: "alta" },
    collectedAt: coletadoEm.toISOString(),
    origens: {
      name: "catalogo do Shopify (products.json)",
      code: codigo ? "sku do variante no catalogo do Shopify" : "o catalogo nao traz sku",
      ...(marca ? { brand: "vendor do catalogo do Shopify" } : {}),
      ...(categoria ? { category: "product_type do catalogo do Shopify" } : {}),
      precoNormal:
        (temTabela ? "compare_at_price do catalogo (o de tabela)" : "price do catalogo do Shopify") +
        (porMilimetro ? " — PRECO POR MILIMETRO (etiqueta 'mm' da loja)" : ""),
      ...(temTabela ? { precoPromocional: "price do catalogo (o cobrado; ha um de tabela maior)" } : {}),
      status: "available do variante no catalogo",
      ...(descricao ? { description: "body_html do catalogo" } : {}),
      ...(imagens.length ? { images: `${imagens.length} foto(s) declarada(s) no catalogo` } : {}),
      catalogo: `${fonte?.name ?? "loja"}: loja Shopify por tras do site proprio`,
    },
  };
}

/**
 * Le o catalogo inteiro e devolve os produtos.
 *
 * @returns {Promise<{produtos: object[], visitas: number, erro: string|null}>}
 */
export async function colherCatalogoShopify({ loja, urlProduto, fonte, sinal = null }) {
  const url = `https://${loja}/products.json?limit=250`;
  const lido = await lerCatalogo({ url, formato: "json", listaEm: "products" }, { limite: SEM_LIMITE, sinal });
  const visitas = Math.max(1, Math.ceil(lido.itens.length / 250));
  if (lido.erro) return { produtos: [], visitas, erro: `catálogo do Shopify em ${loja}: ${lido.erro}` };

  const coletadoEm = new Date();
  const vistos = new Set();
  const produtos = [];
  for (const item of lido.itens) {
    const produto = produtoDoShopify(item, { urlProduto, fonte, coletadoEm });
    if (!produto) continue;
    // O banco identifica por codigo: dois itens com o mesmo sku seriam um so la, e o
    // segundo reescreveria o primeiro a cada varredura. Fica o primeiro, como no banco.
    const chave = produto.code ?? produto.url ?? produto.name;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    produtos.push(produto);
  }

  return { produtos, visitas, erro: produtos.length === 0 ? "nenhum produto válido no catálogo do Shopify" : null };
}
