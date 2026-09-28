import { comoNumero, comoTexto } from "./texto-html";
import { escopoDoProduto } from "./microdata";

export function ehForseti(url) {
  try {
    return ["loja.forsetisolucoes.com.br", "simuladores.forsetisolucoes.com.br", "www.simuladores.forsetisolucoes.com.br"].includes(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** O PIX da Forseti fica no painel proprio; a Store API so publica o cartao. */
export function precosDaForseti(html, url) {
  if (!ehForseti(url) || !html) return null;
  const pagina = escopoDoProduto(html.replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ""));
  // Parte do catalogo aponta para a Loja Integrada de simuladores. O bloco
  // principal traz o total e o PIX separados das parcelas e dos relacionados.
  const acoes = /<div\b[^>]*class=["'][^"']*\bacoes-produto\b[^"']*["'][^>]*>/i.exec(pagina);
  if (acoes) {
    const bloco = pagina.slice(acoes.index + acoes[0].length).split(/<div\b[^>]*class=["'][^"']*\bacoes-produto\b/i)[0].slice(0, 6000);
    const pix = /<span\b[^>]*class=["'][^"']*\bdesconto-a-vista\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i.exec(bloco)?.[1];
    if (/\bpix\b/i.test(comoTexto(pix) ?? "")) {
      const normal = comoNumero(/\bdata-sell-price=["']([\d.,]+)["']/i.exec(bloco)?.[1]);
      const aVista = comoNumero(comoTexto(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i.exec(pix)?.[1]));
      if (normal && aVista && aVista < normal) return { normal, aVista };
    }
  }
  const texto = (id) => comoTexto(new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\bid=["']${id}["'][^>]*>([\\s\\S]*?)<\\/\\1>`, "i").exec(pagina)?.[2]);
  if (!/\bpix\b/i.test(texto("forseti-pix-label") ?? "")) return null;
  const normal = comoNumero(texto("forseti-price-old"));
  const aVista = comoNumero(texto("forseti-price-value"));
  if (!aVista || (normal && aVista >= normal)) return null;
  return { normal, aVista };
}
