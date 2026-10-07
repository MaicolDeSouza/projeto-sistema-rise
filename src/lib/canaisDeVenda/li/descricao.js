/**
 * O HTML da descricao do produto na Loja Integrada. Sem imports: o navegador o importa na
 * previa, e o servidor monta o mesmo texto no envio.
 *
 * A LI aceita HTML (o Mercado Livre nao), entao aqui a descricao ganha paragrafos, a lista
 * de especificacoes e os links dos documentos. Os titulos dos blocos tem acento porque sao
 * conteudo da loja, lido pelo cliente.
 *
 * O texto do Rise e texto puro: tudo e escapado, e uma tag digitada nunca vira HTML. A volta
 * (`htmlParaTexto(html, { paragrafos: true })`) tem que devolver o mesmo texto, senao o selo
 * de divergencia nunca apagaria.
 */

const escapar = (texto) =>
  String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const preenchido = (valor) => valor !== null && valor !== undefined && String(valor).trim() !== "";
const positivo = (valor) => preenchido(valor) && Number(valor) > 0;

const PESO = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const MEDIDA = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

/** Linha em branco separa paragrafos; quebra simples vira <br>. */
export function textoParaHtmlLI(texto) {
  if (!preenchido(texto)) return "";
  return String(texto)
    .replace(/\r\n?/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((paragrafo) => paragrafo.trim())
    .filter(Boolean)
    .map((paragrafo) => `<p>${escapar(paragrafo).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** So os campos preenchidos; nenhum = sem bloco. Medidas so com as tres (C x L x A). */
export function blocoEspecificacoes(produto) {
  const p = produto ?? {};
  const linhas = [];
  if (preenchido(p.marca)) linhas.push(`Marca: ${escapar(p.marca)}`);
  if (preenchido(p.modelo)) linhas.push(`Modelo: ${escapar(p.modelo)}`);
  if (preenchido(p.ean)) linhas.push(`GTIN: ${escapar(p.ean)}`);
  if (positivo(p.pesoKg)) linhas.push(`Peso: ${PESO.format(Number(p.pesoKg))} kg`);
  if (positivo(p.comprimentoCm) && positivo(p.larguraCm) && positivo(p.alturaCm)) {
    const medidas = [p.comprimentoCm, p.larguraCm, p.alturaCm].map((valor) => MEDIDA.format(Number(valor)));
    linhas.push(`Medidas: ${medidas.join(" x ")} cm`);
  }
  if (positivo(p.garantiaMeses)) {
    const meses = Number(p.garantiaMeses);
    linhas.push(`Garantia: ${meses} ${meses === 1 ? "mês" : "meses"}`);
  }
  if (preenchido(p.numeroHomologacao)) linhas.push(`Homologação: ${escapar(p.numeroHomologacao)}`);
  if (!linhas.length) return "";
  return `<h2>Especificações</h2><ul>${linhas.map((linha) => `<li>${linha}</li>`).join("")}</ul>`;
}

/** Links dos documentos. Endereco que nao e http(s) fica de fora: `javascript:` num href executaria na loja. */
export function blocoDocumentos(documentos) {
  const itens = (documentos ?? []).filter((doc) => /^https?:\/\//i.test(String(doc?.url ?? "")));
  if (!itens.length) return "";
  const lista = itens.map((doc) => `<li><a href="${escapar(doc.url)}">${escapar(doc.nome ?? doc.url)}</a></li>`);
  return `<h2>Documentos</h2><ul>${lista.join("")}</ul>`;
}

/** Texto, especificacoes (se pedidas), documentos e as frases fixas, cada frase um paragrafo. */
export function montarDescricaoLI({ descricao, especificacoes, produto, documentos, frases }) {
  const partes = [
    textoParaHtmlLI(descricao),
    especificacoes ? blocoEspecificacoes(produto) : "",
    blocoDocumentos(documentos),
    ...(frases ?? []).filter(preenchido).map((frase) => `<p>${escapar(String(frase).trim())}</p>`),
  ];
  return partes.join("");
}
