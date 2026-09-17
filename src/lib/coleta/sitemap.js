import { gunzipSync } from "node:zlib";

import { buscarBytes, sitemapsDeclarados } from "./buscar";

/**
 * Descoberta de URLs pelo sitemap.xml.
 *
 * E o que torna a varredura barata: o sitemap lista o catalogo inteiro numa
 * requisicao e traz <lastmod>, entao a revarredura diaria pode PULAR a pagina
 * que nao mudou sem nem abri-la. Sair seguindo link a link visitaria o site
 * inteiro — menu, carrinho, politica de troca — para achar as mesmas paginas de
 * produto, gastando horas e incomodando o servidor alheio.
 */

/// Tetos de sanidade. Loja grande encadeia sitemaps; sem limite, um indice
/// circular prenderia o worker para sempre.
const MAXIMO_SITEMAPS = 50;
const MAXIMO_URLS = 50000;

const CANDIDATOS = ["/sitemap.xml", "/sitemap_index.xml", "/sitemap/sitemap.xml"];

/** Texto entre uma tag e seu fechamento, ignorando namespace (ex.: image:loc). */
function conteudo(bloco, tag) {
  const achado = new RegExp(`<(?:[a-z0-9]+:)?${tag}[^>]*>([\\s\\S]*?)</(?:[a-z0-9]+:)?${tag}>`, "i")
    .exec(bloco);
  if (!achado) return null;

  return achado[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function blocos(xml, tag) {
  const encontrados = [];
  const padrao = new RegExp(`<(?:[a-z0-9]+:)?${tag}[\\s>][\\s\\S]*?</(?:[a-z0-9]+:)?${tag}>`, "gi");

  let achado;
  while ((achado = padrao.exec(xml)) !== null) encontrados.push(achado[0]);
  return encontrados;
}

/** Descompacta quando o arquivo e .gz — o magic number 1f 8b denuncia. */
function comoTexto(bytes) {
  if (bytes.length > 1 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      // Teto na descompactacao: 2 MB compactados podem virar gigabytes, e o
      // excesso derrubaria o worker inteiro por falta de memoria.
      return gunzipSync(bytes, { maxOutputLength: 64 * 1024 * 1024 }).toString("utf-8");
    } catch {
      return "";
    }
  }
  return bytes.toString("utf-8");
}

async function baixarXml(url, sinal = null) {
  const resposta = await buscarBytes(url, { sinal });
  if (!resposta.ok || !resposta.bytes) return { xml: null, erro: resposta.erro };
  return { xml: comoTexto(resposta.bytes), erro: null };
}

/**
 * Onde procurar o sitemap deste site.
 *
 * O robots.txt e a fonte oficial; os caminhos habituais so entram quando ele
 * nao declara nada, para nao chutar endereco que o site ja informou.
 */
export async function descobrirSitemaps(urlBase, { sinal = null } = {}) {
  const origem = new URL(urlBase).origin;

  const declarados = await sitemapsDeclarados(origem);
  if (declarados.length > 0) return declarados;

  const achados = [];
  for (const caminho of CANDIDATOS) {
    if (sinal?.aborted) break;
    const alvo = `${origem}${caminho}`;
    const { xml } = await baixarXml(alvo, sinal);
    if (xml && /<(?:[a-z0-9]+:)?(urlset|sitemapindex)/i.test(xml)) {
      achados.push(alvo);
      break;
    }
  }

  return achados;
}

/**
 * Percorre sitemaps (inclusive indices que apontam para outros) e devolve as
 * URLs.
 *
 * @param {string[]} urlsSitemap
 * @param {object}   [opcoes]
 * @param {string}   [opcoes.prefixo] mantem so as URLs sob este trecho
 * @param {number}   [opcoes.limite]
 * @param {AbortSignal} [opcoes.sinal] cancela entre arquivos e o download em voo
 * @returns {Promise<{urls: {url: string, alteradoEm: Date|null}[],
 *   sitemapsLidos: number, erros: string[]}>}
 */
export async function lerSitemaps(
  urlsSitemap,
  { prefixo, limite = MAXIMO_URLS, maxSitemaps = MAXIMO_SITEMAPS, sinal = null } = {},
) {
  const fila = [...urlsSitemap];
  const jaVistos = new Set();
  const porUrl = new Map();
  const erros = [];
  let sitemapsLidos = 0;

  while (fila.length > 0 && sitemapsLidos < maxSitemaps && porUrl.size < limite && !sinal?.aborted) {
    const alvo = fila.shift();
    if (!alvo || jaVistos.has(alvo)) continue;
    jaVistos.add(alvo);

    const { xml, erro } = await baixarXml(alvo, sinal);
    if (!xml) {
      erros.push(`${alvo}: ${erro ?? "vazio"}`);
      continue;
    }
    sitemapsLidos++;

    // Indice: as entradas <sitemap> apontam para outros arquivos.
    //
    // Quem tem cara de sitemap de produto fura a fila. Numa loja real o indice
    // trazia, nesta ordem, a home, product-1.xml, brand-1.xml e category-1.xml —
    // e a home nao e sitemap nenhum. Lendo na ordem, o teto de leituras se
    // esgotava antes de chegar aos produtos, e o site parecia nao ter catalogo.
    for (const bloco of blocos(xml, "sitemap")) {
      const filho = conteudo(bloco, "loc");
      if (!filho || jaVistos.has(filho)) continue;

      // O padrao NAO pode conter "item": a propria palavra "sitemap" tem "item"
      // dentro (s-item-ap), entao todo filho casava, todo filho furava a fila e
      // a ordem saia invertida — o sitemap de produto, que era o segundo, virava
      // o ultimo, e a leitura parava nas categorias sem nunca ver um produto.
      if (/produt|sku/i.test(filho)) fila.unshift(filho);
      else fila.push(filho);
    }

    if (/<(?:[a-z0-9]+:)?sitemapindex/i.test(xml)) continue;

    for (const bloco of blocos(xml, "url")) {
      if (porUrl.size >= limite) break;

      const url = conteudo(bloco, "loc");
      if (!url) continue;
      if (prefixo && !url.includes(prefixo)) continue;

      const lastmod = conteudo(bloco, "lastmod");
      const data = lastmod ? new Date(lastmod) : null;

      porUrl.set(url, {
        url,
        alteradoEm: data && !Number.isNaN(data.getTime()) ? data : null,
      });
    }
  }

  return {
    urls: [...porUrl.values()],
    sitemapsLidos,
    erros,
    // Sobrou fila: o total e maior do que foi contado. A tela precisa saber
    // disso para dizer "pelo menos N" em vez de afirmar um numero errado.
    parcial: fila.length > 0 || porUrl.size >= limite,
  };
}

export const paraTeste = { conteudo, blocos, comoTexto };
