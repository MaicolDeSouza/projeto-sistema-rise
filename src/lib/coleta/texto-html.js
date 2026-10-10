/**
 * Utilidades de texto compartilhadas pelos extratores (JSON-LD, Microdata,
 * OpenGraph).
 *
 * Ficam num modulo proprio para que os tres leiam preco e limpem texto do mesmo
 * jeito: com uma copia em cada extrator, "R$ 1.299,90" viraria numero diferente
 * dependendo de qual formato a loja publicasse.
 */

/**
 * Entidades nomeadas.
 *
 * A lista precisa cobrir acentuacao: loja brasileira escreve "D&iacute;gitos"
 * e "1,8&rdquo;" o tempo todo, e uma tabela so com &amp; e &lt; deixava isso
 * cru no titulo do produto — que e justamente o campo que a pessoa le.
 */
const ENTIDADES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  agrave: "à", Agrave: "À",
  acirc: "â", ecirc: "ê", icirc: "î", ocirc: "ô", ucirc: "û",
  Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô",
  atilde: "ã", otilde: "õ", ntilde: "ñ",
  Atilde: "Ã", Otilde: "Õ",
  ccedil: "ç", Ccedil: "Ç",
  auml: "ä", euml: "ë", iuml: "ï", ouml: "ö", uuml: "ü",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  ndash: "–", mdash: "—", hellip: "…", bull: "•", middot: "·",
  laquo: "«", raquo: "»", deg: "°", times: "×", divide: "÷",
  copy: "©", reg: "®", trade: "™", euro: "€", pound: "£", cent: "¢",
  sup2: "²", sup3: "³", frac12: "½", frac14: "¼", plusmn: "±", micro: "µ",
  ordm: "º", ordf: "ª",
};

export function decodificar(texto) {
  if (typeof texto !== "string") return texto;

  return texto
    .replace(/&#(\d+);/g, (_, codigo) => String.fromCharCode(Number(codigo)))
    .replace(/&#x([0-9a-f]+);/gi, (_, codigo) =>
      String.fromCharCode(parseInt(codigo, 16)),
    )
    // A caixa do nome importa: &Iacute; e "Í", nao "í". Procurar so pelo nome em
    // minusculas punha "CARACTERíSTICAS" na descricao da Oceantech (09/10/2026).
    // Maiuscula que a tabela nao tem cai na minuscula e volta em caixa alta.
    .replace(/&([a-z]+);/gi, (inteiro, nome) => {
      if (ENTIDADES[nome] !== undefined) return ENTIDADES[nome];
      const minuscula = ENTIDADES[nome.toLowerCase()];
      if (minuscula === undefined) return inteiro;
      return /^[A-Z]/.test(nome) ? minuscula.toUpperCase() : minuscula;
    });
}

/**
 * Texto limpo: sem script, sem tags, sem entidades, sem espaco sobrando.
 *
 * Script e style saem ANTES das demais tags porque o conteudo deles nao e
 * texto da pagina — deixa-lo passar encheria a descricao de codigo.
 */
export function comoTexto(valor) {
  if (valor === null || valor === undefined) return null;

  const texto = decodificar(
    String(valor)
      .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
      // Com ou sem atributos: a Policomp (10/10/2026) escreve `<br style="..." />`, e a
      // descricao inteira do cone BT30 saia numa linha so, sem a ficha.
      .replace(/<br\b[^>]*>/gi, "\n")
      .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  )
    // Fim de linha do Windows vira quebra simples. Sem isto, o "\r" sobra como
    // LINHA propria depois do split("\n"): a ficha tecnica da Tray ficava com um
    // branco entre cada item, e quem le a lista parava no primeiro deles.
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return texto || null;
}

/**
 * Converte preco em numero.
 *
 * O separador decimal e descoberto pela POSICAO do ultimo sinal, e nao por
 * suposicao: loja brasileira publica "1.299,90" com frequencia, e ler o ponto
 * como decimal transformaria mil duzentos e noventa e nove reais em um e vinte
 * e nove.
 */
export function comoNumero(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;

  const texto = String(valor).replace(/[^\d.,-]/g, "");
  if (!texto) return null;

  const ultimaVirgula = texto.lastIndexOf(",");
  const ultimoPonto = texto.lastIndexOf(".");
  let normalizado;

  if (ultimaVirgula > ultimoPonto) {
    normalizado = texto.replace(/\./g, "").replace(",", ".");
  } else if (ultimoPonto > ultimaVirgula) {
    normalizado = texto.replace(/,/g, "");
  } else {
    normalizado = texto;
  }

  const numero = Number(normalizado);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

/** Resolve caminho relativo contra a pagina e exige http(s). */
/**
 * Endereco na forma de comparar: sem ancora, sem barra final, dominio minusculo.
 * A retomada compara o endereco de agora com o gravado antes da queda, e
 * "/produto/" e "/produto" sao a mesma pagina.
 *
 * Mora aqui (modulo sem dependencias) porque colher.js e woocommerce.js usam os
 * dois, e colher.js importa woocommerce.js: la, seria um ciclo de import.
 */
export function enderecoComparavel(endereco) {
  try {
    const url = new URL(endereco);
    url.hash = "";
    const caminho = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
    return `${url.protocol}//${url.host.toLowerCase()}${caminho}${url.search}`;
  } catch {
    return String(endereco ?? "");
  }
}

export function comoUrlAbsoluta(url, urlBase) {
  if (!url || typeof url !== "string") return null;

  try {
    const absoluta = new URL(url.trim(), urlBase || undefined).toString();
    return /^https?:\/\//i.test(absoluta) ? absoluta : null;
  } catch {
    return null;
  }
}

/** Todas as meta tags da pagina, indexadas por property/name em minusculo. */
export function metaTags(html) {
  const mapa = {};
  const padrao = /<meta\s+([^>]+?)\/?>/gi;

  let achado;
  while ((achado = padrao.exec(html)) !== null) {
    const atributos = achado[1];
    const chave = /(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(atributos)?.[1];
    const valor = /content\s*=\s*["']([^"']*)["']/i.exec(atributos)?.[1];

    if (chave && valor !== undefined && mapa[chave.toLowerCase()] === undefined) {
      mapa[chave.toLowerCase()] = decodificar(valor);
    }
  }

  return mapa;
}

/**
 * Estado do produto a partir do texto de disponibilidade do schema.org.
 *
 * "Sem estoque" e "pausado" sao coisas diferentes e a distincao e preservada:
 * um produto esgotado volta a vender, um descontinuado nao.
 */
export function situacaoDe(texto) {
  if (!texto) return "UNKNOWN";

  const valor = String(texto);
  if (/InStock|LimitedAvailability|PreOrder|InStoreOnly|OnlineOnly/i.test(valor)) {
    return "AVAILABLE";
  }
  if (/OutOfStock|SoldOut|BackOrder/i.test(valor)) return "OUT_OF_STOCK";
  if (/Discontinued/i.test(valor)) return "PAUSED";

  if (/dispon[ií]vel|em estoque|pronta entrega/i.test(valor)) return "AVAILABLE";
  if (/esgotado|sem estoque|indispon[ií]vel/i.test(valor)) return "OUT_OF_STOCK";

  return "UNKNOWN";
}
