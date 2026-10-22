import { extracaoDaObr } from "./obr";
import {
  comoNumero,
  comoTexto,
  metaTags,
} from "./texto-html";

/**
 * Extracao dos dados do produto a partir do HTML da pagina.
 *
 * Le DADOS ESTRUTURADOS, nao seletor CSS. Loja Integrada, Tray, VTEX e
 * Nuvemshop publicam schema.org/Product em <script type="application/ld+json">
 * com nome, preco, marca, mpn, sku, descricao e imagens — um extrator so
 * atende a maioria das lojas e sobrevive a redesenho de layout. Seletor CSS
 * quebraria a cada troca de tema, e seriam dez conjuntos de seletores para
 * manter em vez de um.
 *
 * Quando nao ha JSON-LD, cai para as meta tags OpenGraph, que quase todo site
 * tem. E menos informacao, mas evita voltar de maos vazias.
 *
 * Nao depende de rede: recebe HTML e devolve objeto. Isso permite testar a
 * extracao com um arquivo salvo, sem visitar site nenhum.
 */

function achatar(no, acumulado = []) {
  if (!no || typeof no !== "object") return acumulado;

  if (Array.isArray(no)) {
    for (const item of no) achatar(item, acumulado);
    return acumulado;
  }

  acumulado.push(no);
  if (no["@graph"]) achatar(no["@graph"], acumulado);

  // O PRODUTO PODE ESTAR PENDURADO NUMA PAGINA, e nao solto no topo. A Saravati
  // (Magento 2) publica um unico bloco `ItemPage` com o Product dentro de
  // `mainEntity`: procurando so no topo e no @graph, a pagina inteira era lida
  // como "sem JSON-LD" e caia no OpenGraph — sem sku, sem oferta, e o codigo
  // acabava deduzido do endereco ("4gb-ram" em vez de srvt001158).
  if (no.mainEntity) achatar(no.mainEntity, acumulado);

  return acumulado;
}

function ehProduto(no) {
  const tipo = no?.["@type"];
  const tipos = Array.isArray(tipo) ? tipo : [tipo];
  return tipos.some(
    (item) => typeof item === "string" && /product/i.test(item),
  );
}

function nomeDe(valor) {
  if (!valor) return null;
  if (typeof valor === "string") return comoTexto(valor);
  if (Array.isArray(valor)) return nomeDe(valor[0]);
  return comoTexto(valor.name ?? valor["@id"] ?? null);
}

/**
 * Enderecos de imagem, ainda como vieram.
 *
 * Nao filtra por protocolo aqui de proposito: loja publica imagem como caminho
 * relativo o tempo todo, e descartar antes de resolver contra a URL da pagina
 * jogaria fora justamente as que sao validas. Quem valida e extrairProduto,
 * depois de resolver.
 */
function imagensDe(valor) {
  const bruto = Array.isArray(valor) ? valor : [valor];

  return bruto
    .map((item) => {
      if (!item) return null;
      if (typeof item === "string") return item.trim();

      // ImageObject aceita os dois nomes no schema.org, e loja usa os dois: a
      // Nightech (Wix) publica seis fotos so em contentUrl, e lendo apenas url
      // sobrava uma — a do og:image.
      for (const chave of ["url", "contentUrl"]) {
        if (typeof item[chave] === "string") return item[chave].trim();
      }

      return null;
    })
    .filter(Boolean);
}

/**
 * Acha a oferta com preco.
 *
 * Pode vir como Offer solta, lista de Offers (uma por variacao) ou
 * AggregateOffer com lowPrice. Na lista, o menor preco e o que interessa: e o
 * que o cliente ve anunciado na vitrine.
 */
function ofertaDe(produto) {
  const ofertas = achatar(produto.offers ?? []).filter(
    (item) => item && typeof item === "object",
  );

  let preco = null;
  let disponivel = null;

  for (const oferta of ofertas) {
    const valor =
      comoNumero(oferta.price) ??
      comoNumero(oferta.lowPrice) ??
      comoNumero(oferta.priceSpecification?.price);

    if (valor !== null && (preco === null || valor < preco)) preco = valor;

    if (oferta.availability) {
      const texto = String(oferta.availability);
      if (/InStock|LimitedAvailability|PreOrder/i.test(texto)) disponivel = true;
      else if (/OutOfStock|SoldOut|Discontinued/i.test(texto)) {
        if (disponivel === null) disponivel = false;
      }
    }
  }

  return { preco, disponivel };
}

/** additionalProperty vira um mapa simples nome -> valor. */
function atributosDe(produto) {
  const lista = achatar(produto.additionalProperty ?? []).filter(
    (item) => item && typeof item === "object" && item.name,
  );

  if (lista.length === 0) return null;

  const mapa = {};
  for (const item of lista) {
    const nome = comoTexto(item.name);
    const valor = comoTexto(item.value ?? item.description);
    if (nome && valor) mapa[nome] = valor;
  }

  return Object.keys(mapa).length > 0 ? mapa : null;
}

// ---------------------------------------------------------------------------
// JSON-LD
// ---------------------------------------------------------------------------

function blocosJsonLd(html) {
  const blocos = [];
  const padrao =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

  let achado;
  while ((achado = padrao.exec(html)) !== null) {
    const conteudo = achado[1].trim();
    if (!conteudo) continue;

    try {
      blocos.push(JSON.parse(conteudo));
    } catch {
      // JSON-LD malformado e comum. Um bloco quebrado nao pode invalidar os
      // outros da mesma pagina.
    }
  }

  return blocos;
}

function doJsonLd(html) {
  for (const bloco of blocosJsonLd(html)) {
    const produto = achatar(bloco).find(ehProduto);
    if (!produto) continue;

    const { preco, disponivel } = ofertaDe(produto);
    const gtin =
      produto.gtin13 ?? produto.gtin14 ?? produto.gtin12 ?? produto.gtin8 ?? produto.gtin;

    return {
      encontrado: true,
      fonte: "json-ld",
      titulo: comoTexto(produto.name),
      descricao: comoTexto(produto.description),
      marca: nomeDe(produto.brand),
      modelo: comoTexto(produto.model),
      mpn: comoTexto(produto.mpn),
      skuFonte: comoTexto(produto.sku),
      ean: gtin ? comoTexto(gtin) : null,
      preco,
      disponivel: disponivel ?? true,
      imagens: imagensDe(produto.image),
      atributos: atributosDe(produto),
      bruto: produto,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// OpenGraph
// ---------------------------------------------------------------------------

function doOpenGraph(html) {
  const meta = metaTags(html);
  const titulo =
    comoTexto(meta["og:title"]) ??
    comoTexto(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]);

  if (!titulo) return null;

  const preco = comoNumero(
    meta["product:price:amount"] ??
      meta["og:price:amount"] ??
      meta["product:price"],
  );

  // Exige PROVA de que a pagina e de produto, e nao so um titulo.
  //
  // Sem esta condicao, o recuo para <title> declarava produto toda pagina HTML
  // que existe — a home, "quem somos", o carrinho — porque titulo todas tem. Na
  // varredura isso viraria uma linha por pagina do site, sem preco e sem
  // codigo, afogando a busca em lixo; e no cadastro fazia a home ser anunciada
  // como "pagina de produto".
  const ehProduto =
    /product|item/i.test(meta["og:type"] ?? "") ||
    preco !== null ||
    Object.keys(meta).some((chave) => chave.startsWith("product:"));

  if (!ehProduto) return null;

  const disponibilidade = meta["product:availability"] ?? meta["og:availability"];
  const imagem = meta["og:image"];

  return {
    encontrado: true,
    fonte: "opengraph",
    titulo,
    descricao: comoTexto(meta["og:description"] ?? meta.description),
    marca: comoTexto(meta["product:brand"] ?? meta["og:brand"]),
    modelo: null,
    mpn: null,
    skuFonte: comoTexto(meta["product:retailer_item_id"]),
    ean: comoTexto(meta["product:ean"] ?? meta["product:gtin"]),
    preco,
    disponivel: disponibilidade ? !/out.?of.?stock|indispon/i.test(disponibilidade) : true,
    imagens: imagem ? [imagem] : [],
    atributos: null,
    bruto: null,
  };
}

// ---------------------------------------------------------------------------
// Catalogo institucional (Imobras)
// ---------------------------------------------------------------------------

/**
 * Sites de fabricante que publicam o produto SEM preco, SEM codigo e SEM tipo
 * de produto: so titulo, descricao e foto no OpenGraph (com og:type "website")
 * e a trilha de navegacao em JSON-LD. Reconhecidos SO pelo dominio (a regra
 * abaixo, aplicada a um site qualquer, faria artigo de blog virar produto).
 *
 * Prova de que a pagina e de produto: a trilha tem 4 degraus ou mais
 * (Inicio > Produtos > categoria > produto) e o ultimo e a propria pagina. A
 * categoria tem 3 degraus, e a home e as institucionais nao tem trilha assim.
 */
/// Dominio -> caminho onde moram os produtos. A Imobras repete o catalogo em
/// /en/ e /es/ com o MESMO codigo ("WIPER MOTOR" = 10.04.911.24V): sem o
/// caminho, a versao em ingles sobrescreveria a em portugues no banco.
const DOMINIOS_DE_CATALOGO = { "imobras.ind.br": "/pt-br/produtos/" };

function doCatalogoInstitucional(html, urlBase) {
  let alvo;
  try {
    alvo = new URL(urlBase);
  } catch {
    return null;
  }
  const dominio = alvo.hostname.replace(/^www\./, "");
  const caminhoDosProdutos = DOMINIOS_DE_CATALOGO[dominio];
  if (!Object.hasOwn(DOMINIOS_DE_CATALOGO, dominio) || !alvo.pathname.startsWith(caminhoDosProdutos)) return null;

  const caminhoDe = (endereco) => {
    try {
      return new URL(endereco, alvo).pathname.replace(/\/+$/, "");
    } catch {
      return null;
    }
  };

  for (const bloco of blocosJsonLd(html)) {
    const trilha = achatar(bloco).find((no) => no?.["@type"] === "BreadcrumbList");
    const itens = Array.isArray(trilha?.itemListElement) ? trilha.itemListElement : [];
    if (itens.length < 4) continue;
    const ultimo = itens[itens.length - 1];
    if (caminhoDe(ultimo?.item?.["@id"] ?? ultimo?.item) !== alvo.pathname.replace(/\/+$/, "")) continue;

    const meta = metaTags(html);
    // O titulo e o resumo ficam no painel do produto (o mesmo bloco aparece duas
    // vezes, uma para celular e outra para tela larga; vale o primeiro).
    const painel = /<div[^>]*class="app-tagline-1"[^>]*>[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>\s*<div[^>]*class="text-block[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
    const titulo = comoTexto(painel?.[1]) ?? comoTexto(meta["og:title"]) ?? comoTexto(ultimo?.name);
    if (!titulo) continue;
    const imagem = meta["og:image"];
    const atributos = caracteristicasDaImobras(html);

    return {
      encontrado: true,
      fonte: "opengraph",
      titulo,
      descricao: comoTexto(painel?.[2]) ?? comoTexto(meta["og:description"] ?? meta.description),
      marca: null,
      modelo: null,
      mpn: null,
      skuFonte: codigoDaImobras(html),
      ean: null,
      preco: null,
      disponivel: true,
      // O site escreve a barra invertida no endereco (`userfiles\cache\...`).
      imagens: imagem ? [imagem.replace(/\\/g, "/")] : [],
      atributos: Object.keys(atributos).length ? atributos : null,
      bruto: null,
    };
  }
  return null;
}

/**
 * "Cod. 10.13.501.12V ou 24V", no alto da pagina, e o codigo do fabricante.
 *
 * A tensao e o fim do codigo (os relacionados da mesma pagina mostram
 * "10.13.113.24V"), entao "12V ou 24V" sao DOIS codigos: 10.13.501.12V e
 * 10.13.501.24V. Escrito por extenso, o "ou" vira dois produtos pela regra
 * geral de disjuncao; sem isso o segundo saia so como "24V".
 */
export function codigoDaImobras(html) {
  const lido = comoTexto(/<div[^>]*class="app-tagline-1"[^>]*>\s*Cod\.?\s*([^<]+?)\s*<\/div>/i.exec(html)?.[1]);
  if (!lido) return null;
  // O site escreve "12V ou 24V" e tambem "12v e 24v" (motorredutor 10.05.021).
  const partes = lido.split(/\s+(?:ou|e)\s+/i);
  const base = /^(.*\.)\d+(?:[.,]\d+)?\s*V$/i.exec(partes[0])?.[1];
  if (!base || partes.length < 2) return lido;
  return partes
    .map((parte, i) => (i > 0 && /^\d+(?:[.,]\d+)?\s*V$/i.test(parte) ? base + parte : parte))
    .map((codigo) => codigo.replace(/(\d)\s*v$/i, "$1V"))
    .join(" ou ");
}

/**
 * Bloco "Caracteristicas do produto": `<p><b>Direcao:</b> Aspirante</p>`, um
 * par por paragrafo. "Aplicacoes:" vem sem valor e com a lista nos paragrafos
 * seguintes ("• Camara Fria<br/>• ..."), que vira o valor, separado por virgula.
 */
export function caracteristicasDaImobras(html) {
  const bloco = /Caracter[ií]sticas do produto\s*<\/h3>\s*<div[^>]*>([\s\S]*?)<\/div>/i.exec(html)?.[1];
  const atributos = {};
  if (!bloco) return atributos;

  let pendente = null;
  for (const paragrafo of bloco.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const par = /^\s*<(?:b|strong)\b[^>]*>([\s\S]*?)<\/(?:b|strong)>([\s\S]*)$/i.exec(paragrafo[1]);
    if (par) {
      const nome = comoTexto(par[1])?.replace(/\s*:\s*$/, "");
      const valor = comoTexto(par[2]);
      if (!nome) continue;
      if (valor) {
        atributos[nome] = valor;
        pendente = null;
      } else {
        pendente = nome;
      }
      continue;
    }
    if (!pendente) continue;
    const itens = paragrafo[1]
      .split(/<br\s*\/?>/i)
      .map((item) => comoTexto(item)?.replace(/^[•\-*]\s*/, ""))
      .filter(Boolean);
    if (itens.length) atributos[pendente] = [atributos[pendente], ...itens].filter(Boolean).join(", ");
  }
  // "Nao ha aplicacoes disponiveis para este produto." e o site dizendo que nao tem o dado.
  for (const [nome, valor] of Object.entries(atributos)) {
    // Sem \b depois do "á": sem a flag u ele nao conta como letra e a fronteira some.
    if (/^n[aã]o h[aá](?:\s|$)/i.test(valor)) delete atributos[nome];
  }
  return atributos;
}

// ---------------------------------------------------------------------------

const VAZIO = {
  encontrado: false,
  fonte: null,
  titulo: null,
  descricao: null,
  marca: null,
  modelo: null,
  mpn: null,
  skuFonte: null,
  ean: null,
  preco: null,
  disponivel: true,
  imagens: [],
  atributos: null,
  bruto: null,
};

/**
 * Extrai o produto de uma pagina.
 *
 * Tenta JSON-LD e, so entao, OpenGraph. `encontrado: false` significa que a
 * pagina nao publica dados estruturados de produto — e o que a tela de cadastro
 * usa para avisar, na hora, que aquele site precisaria de adaptador proprio em
 * vez de deixar descobrir isso depois de uma varredura inteira sem resultado.
 *
 * @param {string} html
 * @param {string} [urlBase] resolve imagem publicada como caminho relativo
 */
export function extrairProduto(html, urlBase) {
  if (typeof html !== "string" || !html.trim()) return { ...VAZIO };

  const achado =
    doJsonLd(html) ??
    doOpenGraph(html) ??
    doCatalogoInstitucional(html, urlBase) ??
    extracaoDaObr(html, urlBase) ??
    { ...VAZIO };

  // Resolve caminho relativo contra a pagina e so entao exige http(s): sem a
  // resolucao antes do filtro, toda imagem publicada como "/img/foto.jpg" —
  // que e o caso comum — seria descartada.
  achado.imagens = (achado.imagens ?? [])
    .map((url) => {
      try {
        return new URL(url, urlBase || undefined).toString();
      } catch {
        return null;
      }
    })
    .filter((url) => url && /^https?:\/\//i.test(url));

  return achado;
}

/** Resumo curto do que a extracao conseguiu, para a tela de cadastro. */
export function resumirExtracao(dados) {
  if (!dados?.encontrado) return "extracao falhou (sem dados estruturados)";

  const campos = [
    dados.titulo && "titulo",
    dados.preco !== null && "preco",
    dados.marca && "marca",
    (dados.mpn || dados.skuFonte) && "codigo",
    dados.descricao && "descricao",
  ].filter(Boolean);

  return `extracao OK via ${dados.fonte} (${campos.join(", ") || "nada util"})`;
}

export const paraTeste = { comoNumero, comoTexto, metaTags };
