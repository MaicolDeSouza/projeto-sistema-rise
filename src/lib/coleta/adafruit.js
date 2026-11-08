import { comoNumero, comoTexto } from "./texto-html";

/**
 * Particularidades da ADAFRUIT (adafruit.com, concorrente estrangeiro em dolar, 08/11/2026).
 *
 * Front proprio, sem plataforma conhecida. O JSON-LD traz nome, sku, preco em USD e as tres fotos em
 * `cdn-shop.adafruit.com//970x728/<sku>-NN.jpg` (com barra dupla); a pagina serve a MESMA foto em sete tamanhos
 * (82x62 ... 970x728) e os relacionados ("you may also like") em `100x75/<outro-sku>-NN.jpg`, tudo no mesmo CDN.
 * A galeria generica separa foto do produto de foto de vizinho pela PASTA, e aqui a pasta e so o tamanho: o
 * produto 1 saia com as miniaturas dos relacionados ("+6", todas em 100x75). O nome do arquivo e `<sku>-NN`.
 */
export function ehAdafruit(url) {
  try {
    return /(^|\.)adafruit\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

const TAMANHO_GRANDE = "970x728";

/** As fotos do produto, pelo sku no nome do arquivo, cada uma no maior tamanho que a loja serve. */
export function fotosDaAdafruit(html, codigo) {
  if (!/^\d+$/.test(String(codigo ?? ""))) return [];
  const padrao = new RegExp(`cdn-shop\\.adafruit\\.com/+\\d{2,4}x\\d{2,4}/(${codigo}-\\d{2}\\.(?:jpe?g|png|webp))`, "gi");
  const arquivos = [];
  for (const achado of html.matchAll(padrao)) {
    if (!arquivos.includes(achado[1])) arquivos.push(achado[1]);
  }
  return arquivos.map((arquivo) => `https://cdn-shop.adafruit.com/${TAMANHO_GRANDE}/${arquivo}`);
}

/**
 * A secao "Technical Details" (`id="tab-technical-details-content"`) como ficha: so as linhas "Nome: valor" (produto 9:
 * "Diameter: 12mm"; produto 5: um "Details:" antes da lista, que a leitura generica recusava por ter texto entre o titulo
 * e a lista; produto 4759: "Product Dimensions: ..." em <p>, mais um "Revision History" em lista, que nao e ficha). O dono,
 * 08/11/2026: "na Adafruit alguns anuncios nao estao vindo as caracteristicas, pelo que vi estao sempre em Technical Details".
 */
export function fichaDaAdafruit(html) {
  const bloco = /<div id=["']tab-technical-details-content["'][^>]*>([\s\S]*?)<\/section>/i.exec(html ?? "");
  if (!bloco) return [];
  const itens = [];
  for (const linha of (comoTexto(bloco[1]) ?? "").split("\n")) {
    const par = /^([^:]{2,60}):\s*(.+)$/.exec(linha.trim());
    if (par) itens.push({ nome: par[1].trim(), valor: par[2].trim() });
  }
  return itens;
}

/**
 * A tabela "Qty | Discount" (`class="quantityDiscount"`): "1-4 $12.50", "5-9 $11.88", "10+ $11.25". Sao FAIXAS DE
 * QUANTIDADE, no mesmo formato das da Santana (`precosPorQuantidade`), e nao caracteristicas do produto (o dono, ao
 * ver "1-4: $12.50" na ficha: "as caracteristicas trouxeram vendas em quantidades, esta errado"). Em dolar: quem
 * converte e `converterParaReais`, junto com o preco.
 */
export function faixasDaAdafruit(html) {
  const tabela = /<table\b[^>]*class=["'][^"']*\bquantityDiscount\b[^"']*["'][^>]*>([\s\S]*?)<\/table>/i.exec(html ?? "");
  if (!tabela) return [];
  const faixas = [];
  for (const linha of tabela[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const celulas = [...linha[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((celula) => comoTexto(celula[1]) ?? "");
    if (celulas.length !== 2) continue;
    const rotulo = celulas[0].replace(/\s+/g, "");
    const limites = /^(\d+)(?:-(\d+)|\+)$/.exec(rotulo);
    const preco = comoNumero(celulas[1]);
    if (!limites || preco === null) continue;
    faixas.push({ rotulo, minimo: Number(limites[1]), maximo: limites[2] ? Number(limites[2]) : null, preco });
  }
  return faixas;
}
