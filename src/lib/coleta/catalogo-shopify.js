import { buscarJson } from "./buscar";
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
/**
 * Os documentos e a ficha que moram FORA do Shopify, na base Supabase do site (Prado): um mapa
 * `handle -> { documentos, especificacoes }`. Duas leituras (as duas tabelas inteiras, 289 linhas
 * cada), nunca uma por produto. Qualquer falha devolve um mapa vazio: o catalogo nao depende disto.
 *
 * @returns {Promise<{porHandle: Map<string, {documentos: object[], especificacoes: object[]}>, erro: string|null}>}
 */
export async function extrasDoSupabase({ url, chaveAnonima }, { sinal = null } = {}) {
  const porHandle = new Map();
  if (!url || !chaveAnonima) return { porHandle, erro: null };

  const cabecalhos = { apikey: chaveAnonima, Authorization: `Bearer ${chaveAnonima}`, Range: "0-9999" };
  const ler = async (tabela, campos) => {
    const resposta = await buscarJson(`${url}/rest/v1/${tabela}?select=${campos}`, { cabecalhos, sinal });
    if (!resposta.ok) return { linhas: null, erro: `${tabela}: ${resposta.erro}` };
    try {
      const json = JSON.parse(resposta.corpo);
      return Array.isArray(json) ? { linhas: json, erro: null } : { linhas: null, erro: `${tabela}: resposta não é lista` };
    } catch {
      return { linhas: null, erro: `${tabela}: resposta não é JSON` };
    }
  };
  const de = (handle) => {
    if (!porHandle.has(handle)) porHandle.set(handle, { documentos: [], especificacoes: [] });
    return porHandle.get(handle);
  };

  const tecnicos = await ler(
    "product_technical_data",
    "product_handle,technical_drawing_url,igs_file_url,igs_file_name,specs_table_image_url,specs_table_headers,specs_table_rows,product_video_url",
  );
  for (const linha of tecnicos.linhas ?? []) {
    const handle = comoTexto(linha?.product_handle);
    if (!handle) continue;
    const extra = de(handle);
    if (comoTexto(linha.technical_drawing_url)) extra.documentos.push({ titulo: "Desenho técnico", url: linha.technical_drawing_url.trim() });
    if (comoTexto(linha.specs_table_image_url)) extra.documentos.push({ titulo: "Tabela de especificações (imagem)", url: linha.specs_table_image_url.trim() });
    if (comoTexto(linha.igs_file_url)) {
      extra.documentos.push({ titulo: `Arquivo 3D${comoTexto(linha.igs_file_name) ? ` (${linha.igs_file_name.trim()})` : " (.IGS)"}`, url: linha.igs_file_url.trim() });
    }
    if (comoTexto(linha.product_video_url)) extra.documentos.push({ titulo: "Vídeo do produto", url: linha.product_video_url.trim() });
    // Tabela de especificacoes em texto, quando a loja a preencheu (em 11/10/2026 nenhuma tinha: vem
    // em imagem). Cabecalhos + linhas de duas colunas viram pares nome:valor.
    const cabecalho = Array.isArray(linha.specs_table_headers) ? linha.specs_table_headers : null;
    const linhas = Array.isArray(linha.specs_table_rows) ? linha.specs_table_rows : [];
    for (const par of linhas) {
      const celulas = Array.isArray(par) ? par : cabecalho ? cabecalho.map((chave) => par?.[chave]) : [];
      if (celulas.length === 2 && comoTexto(String(celulas[0] ?? "")) && comoTexto(String(celulas[1] ?? ""))) {
        extra.especificacoes.push({ nome: String(celulas[0]).trim(), valor: String(celulas[1]).trim() });
      }
    }
  }

  const pdfs = await ler("product_pdfs", "product_handle,pdf_url,pdf_title");
  for (const linha of pdfs.linhas ?? []) {
    const handle = comoTexto(linha?.product_handle);
    if (!handle || !comoTexto(linha.pdf_url)) continue;
    de(handle).documentos.push({ titulo: comoTexto(linha.pdf_title) ?? "Ficha técnica (PDF)", url: linha.pdf_url.trim() });
  }

  const erros = [tecnicos.erro, pdfs.erro].filter(Boolean);
  return { porHandle, erro: erros.length ? erros.join("; ") : null };
}

export function produtoDoShopify(item, { urlProduto, fonte, coletadoEm = new Date(), extras = null } = {}) {
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

  // O que a base do site guarda deste handle: documentos e, se houver, a ficha em texto.
  const extra = extras?.get?.(item.handle) ?? null;
  for (const linha of extra?.especificacoes ?? []) {
    if (!ficha.some((existente) => existente.nome?.toLowerCase() === linha.nome.toLowerCase())) ficha.push(linha);
  }
  const documentos = extra?.documentos ?? [];

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
    documentos,
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
      ...(documentos.length ? { documentos: `${documentos.length} arquivo(s) da base do site (Supabase)` } : {}),
      ...(extra?.especificacoes?.length ? { specifications: "tabela de especificacoes da base do site (Supabase)" } : {}),
      catalogo: `${fonte?.name ?? "loja"}: loja Shopify por tras do site proprio`,
    },
  };
}

/**
 * Le o catalogo inteiro e devolve os produtos.
 *
 * @returns {Promise<{produtos: object[], visitas: number, erro: string|null}>}
 */
export async function colherCatalogoShopify({ loja, urlProduto, supabase = null, fonte, sinal = null }) {
  const url = `https://${loja}/products.json?limit=250`;
  const lido = await lerCatalogo({ url, formato: "json", listaEm: "products" }, { limite: SEM_LIMITE, sinal });
  let visitas = Math.max(1, Math.ceil(lido.itens.length / 250));
  if (lido.erro) return { produtos: [], visitas, erro: `catálogo do Shopify em ${loja}: ${lido.erro}`, avisos: [] };

  // Documentos fora do Shopify (a base do site). Falha aqui e AVISO, nao erro: o catalogo vale sozinho.
  const avisos = [];
  let extras = null;
  if (supabase) {
    const lidos = await extrasDoSupabase(supabase, { sinal });
    visitas += 2;
    extras = lidos.porHandle;
    if (lidos.erro) avisos.push(`documentos da base do site não lidos: ${lidos.erro}`);
  }

  const coletadoEm = new Date();
  const vistos = new Set();
  const produtos = [];
  for (const item of lido.itens) {
    const produto = produtoDoShopify(item, { urlProduto, fonte, coletadoEm, extras });
    if (!produto) continue;
    // O banco identifica por codigo: dois itens com o mesmo sku seriam um so la, e o
    // segundo reescreveria o primeiro a cada varredura. Fica o primeiro, como no banco.
    const chave = produto.code ?? produto.url ?? produto.name;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    produtos.push(produto);
  }

  return { produtos, visitas, avisos, erro: produtos.length === 0 ? "nenhum produto válido no catálogo do Shopify" : null };
}
