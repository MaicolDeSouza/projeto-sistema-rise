import { buscarPagina } from "./buscar";

/**
 * Documentos das esteiras porta-cabos no SITE da Tespo (tespoinjetados.com.br, 13/10/2026).
 *
 * O site NAO publica a lista de produtos com codigo (e WordPress institucional; os PDFs de cada
 * serie sao imagem, sem texto): os itens vem do catalogo em PDF (`esteirasDoPdf`). O que o site
 * tem, por MODELO, e o que falta ao catalogo:
 *   - a pagina inicial (secao "Nossa linha de esteiras porta cabos"): o PDF de desenho de cada
 *     serie (`T10.10.pdf`, `T100.25CR.pdf`...);
 *   - a pagina /downloads/: o modelo 3D em STEP (`.stp`) do ELO e da PONTEIRA de cada modelo,
 *     numa tabela `<h3>Modelo T50.25 e T50.25CR</h3>` + dois links.
 *
 * So esteiras: PDFs de caixas, corredicas e prensa-cabo da mesma pagina ficam de fora (o nome do
 * arquivo precisa ser `T<n>.<n>` ou `F.T<n>.<n>`, com `CR` opcional). Tudo passa por `buscarPagina`:
 * robots.txt e ritmo do dominio valem.
 */

const SITE = "https://www.tespoinjetados.com.br";

/// O endereco de cada item das esteiras: o site nao tem pagina por produto, entao o link e a pagina inicial (pedido do dono, 13/10/2026).
export const PAGINA_INICIAL_DA_TESPO = `${SITE}/`;

const limpa = (texto) => texto.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/** "T100.25 CR", "t100.25cr", "F.T50.35" -> "T100.25CR", "F.T50.35". Null se nao for uma serie de esteira. */
export function serieDaEsteira(texto) {
  const achou = /(^|[^A-Za-z0-9])(F\.?\s?)?T\s?(\d+)\.(\d+)(\s?CR\b)?/i.exec(String(texto ?? ""));
  if (!achou) return null;
  return `${achou[2] ? "F." : ""}T${achou[3]}.${achou[4]}${achou[5] ? "CR" : ""}`;
}

/** A serie de um item do catalogo: o modelo do nome, mais "CR" quando o nome diz "C/ REFORCO" ou "C/R". */
export function serieDoItem(nome) {
  const texto = String(nome ?? "");
  const base = serieDaEsteira(texto);
  if (!base || base.endsWith("CR")) return base;
  return /C\s?\/\s?(?:R\b|REFOR[CÇ]O)/i.test(texto) ? `${base}CR` : base;
}

/**
 * Le a pagina inicial e a de downloads e devolve `serie -> { desenho, elo, ponteira }`.
 *
 * @returns {Promise<{series: Map<string, {desenho?: object, elo?: object, ponteira?: object}>, avisos: string[]}>}
 */
export async function documentosDasEsteirasDoSite({ sinal = null, paginas = null } = {}) {
  const series = new Map();
  const avisos = [];
  const de = (serie) => {
    if (!series.has(serie)) series.set(serie, {});
    return series.get(serie);
  };

  const ler = async (caminho) => {
    if (paginas?.[caminho] !== undefined) return paginas[caminho];
    const resposta = await buscarPagina(`${SITE}${caminho}`, { sinal });
    if (!resposta.ok || !resposta.corpo) {
      avisos.push(`${caminho}: ${resposta.erro ?? `HTTP ${resposta.status}`}`);
      return "";
    }
    return resposta.corpo;
  };

  // 1) Pagina inicial: a secao "Nossa linha de esteiras" tem um bloco por LINHA ("LINHA 10", "LINHA 25 REFORCO"...), com
  // a FOTO da linha e os PDFs de desenho dos modelos dela. A foto e a da linha (mostra varios modelos), e vale para todas
  // as series do bloco: e a imagem que o site mostra do produto.
  const inicio = await ler("/");
  const cabecalhos = [...inicio.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)]
    .filter((achado) => /^LINHA\s/i.test(limpa(achado[1])))
    .map((achado) => achado.index);
  const blocos = cabecalhos.map((posicao, indice) => inicio.slice(posicao, cabecalhos[indice + 1] ?? inicio.length));
  for (const bloco of blocos) {
    const foto = /<img[^>]+src=["']([^"']*\/uploads\/[^"']+\.(?:jpe?g|png|webp))["']/i.exec(bloco)?.[1];
    for (const [, endereco] of bloco.matchAll(/href=["']([^"']+\.pdf)["']/gi)) {
      const arquivo = decodeURIComponent(endereco.split("/").pop() ?? "").replace(/\.pdf$/i, "");
      if (!/^(?:F\.?)?T\s?\d+\.\d+(?:\s?CR)?$/i.test(arquivo)) continue;
      const serie = serieDaEsteira(arquivo);
      if (!serie) continue;
      const alvo = de(serie);
      alvo.desenho ??= { titulo: `Desenho da série ${serie} (PDF)`, url: new URL(endereco, SITE).toString() };
      if (foto) alvo.foto ??= new URL(foto, SITE).toString();
    }
  }

  // 2) Modelo 3D em STEP do elo e da ponteira, na pagina de downloads: uma tabela por modelo.
  const downloads = await ler("/downloads/");
  for (const [tabela] of downloads.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    const modelo = /<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(tabela)?.[1];
    if (!modelo) continue;
    const arquivos = [...tabela.matchAll(/href=["']([^"']+\.stp)["']/gi)].map((achado) => new URL(achado[1], SITE).toString());
    if (arquivos.length === 0) continue;
    const doElo = arquivos.find((endereco) => /\/Elo/i.test(endereco)) ?? arquivos[0];
    const daPonteira = arquivos.find((endereco) => /Ponteira/i.test(endereco)) ?? (arquivos.length > 1 ? arquivos[1] : null);

    // "Modelo T50.25 e T50.25CR" vale para as duas series.
    for (const pedaco of limpa(modelo).replace(/^Modelo\s+/i, "").split(/\s+e\s+/i)) {
      const serie = serieDaEsteira(pedaco);
      if (!serie) continue;
      const alvo = de(serie);
      alvo.elo ??= { titulo: `Modelo 3D do elo ${serie} (STEP)`, url: doElo };
      if (daPonteira && daPonteira !== doElo) alvo.ponteira ??= { titulo: `Modelo 3D da ponteira ${serie} (STEP)`, url: daPonteira };
    }
  }

  if (series.size === 0 && avisos.length === 0) avisos.push("o site não trouxe documento de esteira (o layout pode ter mudado)");
  return { series, avisos };
}

/**
 * Poe nos itens do catalogo os documentos da serie deles. Esteira leva o desenho e o elo; o conjunto terminal, o desenho e a
 * ponteira. Serie com reforco (`CR`) sem documento proprio usa o da serie sem o sufixo, e o contrario nao se faz.
 */
export function juntarDocumentosDasEsteiras(itens, series) {
  let comDocumento = 0;
  for (const item of itens) {
    // Terminal sem modelo no nome ("CONJUNTO TERMINAL 75X50 103X65"): o modelo e `T<Li>.<Ai>`, a medida interna do proprio item
    // ("T75.50" = 75 x 50). So vale se essa serie existe no site.
    let serie = serieDoItem(item.desc);
    if (!serie) {
      const interna = /(\d+(?:[.,]\d+)?) x (\d+(?:[.,]\d+)?) mm/.exec(item.especificacoes?.find((linha) => /^Medida interna/.test(linha.nome))?.valor ?? "");
      const deduzida = interna ? `T${interna[1].replace(",", ".")}.${interna[2].replace(",", ".")}` : null;
      if (deduzida && series.has(deduzida)) serie = deduzida;
    }
    if (!serie) continue;
    const dados = series.get(serie) ?? (serie.endsWith("CR") ? series.get(serie.slice(0, -2)) : undefined);
    if (!dados) continue;

    const ehTerminal = /TERMINAL/i.test(item.desc);
    const documentos = [dados.desenho, ehTerminal ? dados.ponteira : dados.elo].filter(Boolean);
    if (documentos.length === 0) continue;
    item.documentos = documentos;
    if (dados.foto) item.imagens = [dados.foto];
    comDocumento++;
  }
  return comDocumento;
}
