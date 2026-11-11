/**
 * Leitura do XML da NF-e anexado num pedido de compra (pedido do dono em 11/11/2026). Pura, sem dependencia: o XML da
 * NF-e tem tags fixas do leiaute da SEFAZ (`infNFe Id="NFe<chave>"`, `ide/nNF`, `ide/serie`, `ide/dhEmi`, `emit/CNPJ`,
 * `emit/xNome`, `total/ICMSTot/vNF`), entao um recorte por tag basta e nao ha DTD nem entidade externa para resolver.
 * Vale o `nfeProc` (a nota autorizada, o que o fornecedor manda) e a `NFe` sozinha. Nao e NF-e -> null.
 */

const decodificar = (texto) =>
  String(texto ?? "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, codigo) => String.fromCodePoint(Number(codigo)))
    .replace(/&amp;/g, "&")
    .trim();

/** O texto da primeira tag `nome` dentro de `trecho` (com ou sem prefixo de namespace), ou null. */
function tag(trecho, nome) {
  const achado = new RegExp(`<(?:[\\w-]+:)?${nome}(?:\\s[^>]*)?>([^<]*)</(?:[\\w-]+:)?${nome}>`).exec(trecho ?? "");
  return achado ? decodificar(achado[1]) || null : null;
}

/** O bloco da primeira tag `nome` (do abre ao fecha), ou "". */
function bloco(trecho, nome) {
  const achado = new RegExp(`<(?:[\\w-]+:)?${nome}[\\s>][\\s\\S]*?</(?:[\\w-]+:)?${nome}>`).exec(trecho ?? "");
  return achado ? achado[0] : "";
}

/** Os bytes parecem XML (com ou sem BOM e espacos antes)? */
export function pareceXml(bytes) {
  const inicio = Buffer.from(bytes).subarray(0, 200).toString("utf8").replace(/^﻿/, "").trimStart();
  return inicio.startsWith("<?xml") || /^<(?:[\w-]+:)?(nfeProc|NFe)[\s>]/.test(inicio);
}

/**
 * `{ numero, serie, chave, emitidaEm, valorTotal, emitenteCnpj, emitenteNome }` de um XML de NF-e, ou null quando o XML
 * nao e de NF-e (sem `infNFe`). Campo que nao veio fica null; nunca inventado.
 */
export function lerXmlDaNfe(texto) {
  const xml = String(texto ?? "");
  const infNFe = /<(?:[\w-]+:)?infNFe\b([^>]*)>/.exec(xml);
  if (!infNFe) return null;
  const id = /\bId\s*=\s*"NFe(\d{44})"/.exec(infNFe[1]);
  const protocolo = tag(bloco(xml, "infProt"), "chNFe");
  const chave = id?.[1] ?? (/^\d{44}$/.test(protocolo ?? "") ? protocolo : null);
  const ide = bloco(xml, "ide");
  const emit = bloco(xml, "emit");
  const total = bloco(bloco(xml, "total"), "ICMSTot");
  const numero = tag(ide, "nNF");
  const dataTexto = tag(ide, "dhEmi") ?? tag(ide, "dEmi");
  const emitida = dataTexto ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(dataTexto) ? `${dataTexto}T12:00:00-03:00` : dataTexto) : null;
  const valor = Number(tag(total, "vNF"));
  const cnpj = tag(emit, "CNPJ") ?? tag(emit, "CPF");
  return {
    numero: numero ? numero.replace(/^0+(?=\d)/, "") : null,
    serie: tag(ide, "serie"),
    chave,
    emitidaEm: emitida && !Number.isNaN(emitida.getTime()) ? emitida : null,
    valorTotal: Number.isFinite(valor) && tag(total, "vNF") !== null ? Math.round(valor * 100) / 100 : null,
    emitenteCnpj: cnpj ? cnpj.replace(/\D/g, "") : null,
    emitenteNome: tag(emit, "xNome"),
  };
}
