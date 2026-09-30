import { comoNumero, comoTexto } from "./texto-html";

export function ehRoboCore(url) {
  try { return /^(www\.)?robocore\.net$/i.test(new URL(url).hostname); }
  catch { return false; }
}

/** O HTML de pagamento e publicado como string, sem executar JavaScript da loja. */
export function precosDaRoboCore(html, url, codigo) {
  if (!ehRoboCore(url) || !/^\d+$/.test(String(codigo ?? ""))) return null;
  const padrao = new RegExp(`document\\.getElementById\\(['"]valor_${codigo}['"]\\)\\.innerHTML\\s*=\\s*("(?:\\\\.|[^"\\\\])*")`, "g");
  for (const trecho of html.matchAll(padrao)) {
    let painel;
    try { painel = JSON.parse(trecho[1]); } catch { continue; }
    // Os centavos ficam em spans separados; remove tags sem inserir espacos.
    const texto = comoTexto(painel.replace(/<[^>]*>/g, "")) ?? "";
    const normal = comoNumero(/R\$\s*([\d.,]+)/.exec(texto)?.[1]);
    const aVista = comoNumero(/R\$\s*([\d.,]+)\s*PIX/i.exec(texto)?.[1]);
    if (normal && aVista && aVista < normal) return { normal, aVista };
  }
  return null;
}

/**
 * Quantidade em estoque, escrita so em JS.
 *
 * Nenhum produto da RoboCore declara `inventoryLevel`: o "(92 un. em estoque)"
 * so existe dentro de `document.getElementById('estoque_<id base>').innerHTML
 * = '(92 un. em estoque)'`, a mesma tecnica de `precosDaRoboCore`. Sem isso a
 * coluna ESTOQUE mostrava so o status (disponivel/esgotado, que vem do
 * Microdata) e nunca o numero.
 *
 * Produto de variante unica usa o proprio codigo como id (`estoque_1180`).
 * Produto com cores (HockeyBot Preto, `3388-416`) tem VARIOS blocos que
 * escrevem no MESMO id `estoque_3388` — um por opcao de `extras.value` — entao
 * o numero certo so aparece isolando o bloco da variante (`416`) antes de ler.
 */
export function estoqueDaRoboCore(html, url, codigo) {
  if (!ehRoboCore(url)) return null;
  const texto = String(codigo ?? "");
  const corte = texto.lastIndexOf("-");
  const base = corte === -1 ? texto : texto.slice(0, corte);
  const variante = corte === -1 ? null : texto.slice(corte + 1);
  if (!/^\d+$/.test(base) || (variante !== null && !/^\d+$/.test(variante))) return null;

  const escopo = variante ? `extras\\.value\\s*==\\s*['"]${variante}['"][\\s\\S]*?` : "";
  const padrao = new RegExp(
    `${escopo}getElementById\\(['"]estoque_${base}['"]\\)\\.innerHTML\\s*=\\s*["']\\(?\\s*(\\d{1,6})\\s*un\\.?\\s*em\\s*estoque`,
    "i",
  );
  const achado = padrao.exec(html)?.[1];
  return achado !== undefined ? Number(achado) : null;
}

/** Mantem os paragrafos e a lista visivel, sem repetir ficha e documentos. */
export function descricaoDaRoboCore(html, url) {
  if (!ehRoboCore(url)) return null;
  const abertura = /<div\b[^>]*\bid=["']descricao["'][^>]*>/i.exec(html);
  if (!abertura) return null;
  const inicio = abertura.index + abertura[0].length;
  const tags = /<div\b|<\/div\s*>/gi;
  tags.lastIndex = inicio;
  let nivel = 1;
  let fim = -1;
  for (let tag; (tag = tags.exec(html));) {
    nivel += tag[0].startsWith("</") ? -1 : 1;
    if (!nivel) { fim = tag.index; break; }
  }
  if (fim < 0) return null;
  const bloco = html.slice(inicio, fim)
    .split(/<span\b[^>]*class=["'][^"']*customTab_bottom[^"']*["'][^>]*>\s*Documenta[cç][aã]o/i)[0]
    .replace(/<li\b[^>]*style=["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/li>/gi, "")
    .replace(/<span\b[^>]*class=["']itemQuantidade["'][^>]*>([\s\S]*?)<\/span>/gi, "$1 × ")
    .replace(/<span\b[^>]*class=["'][^"']*customTab[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi, "<h3>$1</h3>")
    .replace(/<\/?(?:b|strong|em|i)\b[^>]*>/gi, "")
    .replace(/[\r\n]+/g, " ")
    .replace(/<h[1-6]\b/gi, "\n\n$&")
    .replace(/<li\b[^>]*>/gi, "\n- ");
  return comoTexto(bloco)?.replace(/\n{2,}- /g, "\n- ") ?? null;
}
