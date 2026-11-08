import { comoNumero, comoTexto } from "./texto-html";

/**
 * Particularidades da WAVESHARE (waveshare.com, concorrente estrangeiro em dolar, Magento 1 com tema proprio, 08/11/2026).
 *
 * O JSON-LD traz nome, sku, fotos e disponibilidade, mas a descricao dele e so o resumo de uma linha: o texto de verdade
 * e uma pagina de marketing de 80 mil caracteres (`tab-description`), sem utilidade como descricao. Duas coisas uteis:
 * - a grade de icones "Size 5" / "Resolution 960x544" (`igKey` + `igValue`), que e a ficha tecnica das telas;
 * - a tabela de preco por quantidade (`waveshare_view_table`: "1~9" sem preco, "10~49 $80.99", "100+ $79.59"), cuja
 *   primeira faixa usa o preco da pagina (a celula vem vazia e o JavaScript da loja a preenche).
 */
export function ehWaveshare(url) {
  try {
    return /(^|\.)waveshare\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** A grade de icones como ficha: `<span class="igKey">Size</span>...<span class="igValue">5"</span>`. */
export function fichaDaWaveshare(html) {
  const itens = [];
  for (const par of (html ?? "").matchAll(/<li>\s*<span class="igKey">([\s\S]*?)<\/span>[\s\S]*?<span class="igValue">([\s\S]*?)<\/span>\s*<\/li>/gi)) {
    const nome = comoTexto(par[1]);
    const valor = comoTexto(par[2]);
    if (nome && valor) itens.push({ nome, valor });
  }
  return itens;
}

/** Preco de uma unidade como a loja exibe (`<span class="regular-price ..." id="product-price-NNN">`). */
function precoDaPagina(html) {
  const preco = /id=["']product-price-\d+["'][^>]*>\s*<span class="price">([^<]*)/i.exec(html ?? "");
  return preco ? comoNumero(preco[1]) : null;
}

/** As faixas "N~M" e "N+" da tabela de preco por quantidade, no formato de `precosPorQuantidade`. */
export function faixasDaWaveshare(html) {
  const tabela = /<table\b[^>]*class=["'][^"']*\bwaveshare_view_table\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/i.exec(html ?? "");
  if (!tabela) return [];
  const base = precoDaPagina(html);
  const faixas = [];
  for (const linha of tabela[1].replace(/<!--[\s\S]*?-->/g, "").matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const quantidade = /<span class="waveshare_view_num">\s*([^<]*?)\s*<\/span>/i.exec(linha[1])?.[1] ?? "";
    const limites = /^(\d+)\s*(?:~\s*(\d+)|\+)$/.exec(quantidade);
    if (!limites) continue;
    const preco = comoNumero(/<span class="price">([^<]*)<\/span>/i.exec(linha[1])?.[1]) ?? (Number(limites[1]) === 1 ? base : null);
    if (preco === null) continue;
    faixas.push({ rotulo: quantidade.replace("~", "-"), minimo: Number(limites[1]), maximo: limites[2] ? Number(limites[2]) : null, preco });
  }
  // Uma faixa so (a de 1 unidade) nao e desconto por quantidade.
  return faixas.length > 1 ? faixas : [];
}
