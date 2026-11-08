import { comoTexto, comoUrlAbsoluta } from "./texto-html";

/**
 * Particularidades da SPARKFUN (sparkfun.com, concorrente estrangeiro em dolar, Magento 2, 08/11/2026).
 *
 * Medido no KIT-20683 depois da 1a varredura do dono ("o estoque esta como indeterminado, mas no site mostra em
 * estoque; as fotos nao vieram todas; as caracteristicas estao em Features & Specs; os documentos vieram apenas 9 mas
 * tem muito mais em Documentation"):
 * - a oferta do JSON-LD nao traz `availability`; o "In stock" esta so no HTML, em `product-info-stock-sku` (os
 *   relacionados repetem a mesma marcacao mais abaixo, por isso o recorte);
 * - a ficha e a aba "Features & Specs" (`id="content-features"`): paragrafos em negrito com o nome de cada peca do kit
 *   e uma lista de itens, quase todos sem "nome: valor";
 * - a aba "Documentation" (`id="content-documentation"`) lista 37 links (esquema, Eagle, guias, GitHub, forum), e a regra
 *   geral de documento (texto + extensao de arquivo) so reconhecia 9.
 * As fotos sao lidas por `galeriaDoMagento` (normalizar.js), que passou a aceitar o bloco do Amasty.
 */
export function ehSparkFun(url) {
  try {
    return /(^|\.)sparkfun\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** O conteudo de uma aba (`id="content-<nome>"`) ate o titulo da aba seguinte. */
function abaDaPagina(html, nome) {
  const abertura = new RegExp(`id=["']content-${nome}["'][^>]*>`, "i").exec(html ?? "");
  if (!abertura) return null;
  const inicio = abertura.index + abertura[0].length;
  const resto = html.slice(inicio);
  const fim = /<div class="data item title|id=["']content-[a-z]+["']/i.exec(resto);
  return fim ? resto.slice(0, fim.index) : resto;
}

/** "In stock" / "Backorder" / "Out of stock" do produto principal, para `situacaoDe`. */
export function disponibilidadeDaSparkFun(html) {
  const bloco = /<div class="product-info-stock-sku">([\s\S]*?)<\/div>\s*<\/div>/i.exec(html ?? "");
  const texto = bloco ? comoTexto(bloco[1]) : null;
  return texto ? texto.split("\n")[0] : null;
}

/** Titulo de grupo ("SparkFun OpenLog Artemis (without IMU):") sem os dois-pontos do fim. */
function tituloDoGrupo(trecho) {
  return (comoTexto(trecho) ?? "").replace(/:\s*$/, "").trim() || null;
}

/**
 * A aba "Features & Specs" como ficha: cada `<p><strong>Peca:</strong></p>` entra como linha sem nome (o mesmo desenho
 * do subtitulo por peca da CNC Fresas) e cada `<li>` vira "nome: valor" quando tem dois-pontos com rotulo curto, senao
 * linha sem nome. Notas `<sup>[1]</sup>` saem.
 */
export function fichaDaSparkFun(html) {
  const aba = abaDaPagina(html, "features");
  if (!aba) return [];
  const itens = [];
  for (const parte of aba.matchAll(/<p>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>|<li>([\s\S]*?)<\/li>/gi)) {
    if (parte[1] !== undefined) {
      const grupo = tituloDoGrupo(parte[1]);
      if (grupo) itens.push({ nome: null, valor: grupo });
      continue;
    }
    // A nota `<a><sup>[1]</sup></a>` sai; o expoente de "I<sup>2</sup>C" vira "I²C".
    const texto = comoTexto(
      parte[2]
        .replace(/<a\b[^>]*>\s*<sup>\s*\[\d+\]\s*<\/sup>\s*<\/a>/gi, "")
        .replace(/<sup>\s*2\s*<\/sup>/gi, "²")
        .replace(/<sup>\s*3\s*<\/sup>/gi, "³"),
    );
    if (!texto) continue;
    const par = /^([^:]{2,60}):\s+(.+)$/s.exec(texto);
    if (par) itens.push({ nome: par[1].trim(), valor: par[2].trim() });
    else itens.push({ nome: null, valor: texto });
  }
  return itens;
}

/**
 * TODOS os links da aba "Documentation", com o grupo da peca no titulo ("SparkFun OpenLog Artemis (without IMU): Schematic"),
 * porque "Schematic" e "Datasheet" se repetem a cada peca do kit. Link cujo texto e um endereco (o aviso da California)
 * fica de fora.
 */
export function documentosDaSparkFun(html, urlBase) {
  const aba = abaDaPagina(html, "documentation");
  if (!aba) return [];
  const documentos = [];
  const vistos = new Set();
  let grupo = null;
  for (const parte of aba.matchAll(/<p>\s*<strong>([\s\S]*?)<\/strong>\s*<\/p>|<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    if (parte[1] !== undefined) {
      grupo = tituloDoGrupo(parte[1]);
      continue;
    }
    const url = comoUrlAbsoluta(parte[2], urlBase);
    const texto = comoTexto(parte[3]);
    if (!url || !texto || /^(https?:\/\/|www\.)/i.test(texto) || vistos.has(url)) continue;
    vistos.add(url);
    documentos.push({ titulo: grupo ? `${grupo}: ${texto}` : texto, url });
  }
  return documentos;
}
