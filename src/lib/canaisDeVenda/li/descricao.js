/**
 * O HTML da descricao do produto na Loja Integrada. Sem imports: a aba Descricao do editor mostra o
 * mesmo resultado que o servidor envia.
 *
 * O texto e o do CADASTRO do produto (`descricaoBase`), que segue o padrao da loja: TITULO EM
 * MAIUSCULAS, paragrafos, e secoes com titulo terminado em dois-pontos ("Especificacoes tecnicas:",
 * "Itens inclusos:", "Garantia:") seguidas de linhas "- item;". Pedido do dono em 07/10/2026:
 * - fonte 16 em todo o texto (`<span style="font-size:16px;">`, como os produtos antigos da loja);
 * - o titulo do produto e os titulos de secao em negrito;
 * - a secao "Documentos / Arquivos para download:" com os arquivos da aba Documentos do produto, logo
 *   abaixo de "Especificacoes tecnicas:"; sem ela, logo acima de "Garantia:"; sem as duas, no fim do
 *   texto. Sem documento, nao ha secao.
 *
 * Todo texto e escapado: tag digitada no cadastro vira texto, nunca HTML. A volta
 * (`htmlParaTexto(html, { paragrafos: true })`) devolve o mesmo texto (mais a secao de documentos),
 * e e por ela que o selo de divergencia compara: a formatacao nao conta.
 */

const escapar = (texto) =>
  String(texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const preenchido = (valor) => valor !== null && valor !== undefined && String(valor).trim() !== "";

const semAcento = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();

const TITULO_DOS_DOCUMENTOS = "Documentos / Arquivos para download:";
// Linha que marca, no texto, onde entra a secao de documentos. Nao existe em texto digitado.
const MARCA_DOS_DOCUMENTOS = "\u0000documentos\u0000";

const ehItemDeLista = (linha) => /^\s*-/.test(linha);
// Titulo de secao termina em dois-pontos, ou em dois-pontos e um parentese ("Itens inclusos: (Cod:100101)").
const ehTituloDeSecao = (linha) => !ehItemDeLista(linha) && /:\s*(\([^)]*\))?\s*$/.test(linha) && linha.trim().length <= 80;
const ehTituloDoProduto = (linha) => /\p{Lu}/u.test(linha) && !/\p{Ll}/u.test(linha);

/** Cada paragrafo leva a fonte 16; as linhas dele sao separadas por <br>. */
const paragrafo = (linhas) => `<p><span style="font-size:16px;">${linhas.join("<br>")}</span></p>`;

/** Os documentos com endereco http(s): `javascript:` num href executaria na loja. */
function documentosValidos(documentos) {
  return (documentos ?? []).filter((doc) => /^https?:\/\//i.test(String(doc?.url ?? "")));
}

/** Indice da linha antes da qual entra a secao de documentos. */
function posicaoDosDocumentos(linhas) {
  const especificacoes = linhas.findIndex((linha) => /^especificacoes tecnicas:?$/.test(semAcento(linha)));
  if (especificacoes >= 0) {
    let fim = especificacoes;
    while (fim + 1 < linhas.length && ehItemDeLista(linhas[fim + 1])) fim += 1;
    return fim + 1;
  }
  const garantia = linhas.findIndex((linha) => /^garantia:?$/.test(semAcento(linha)));
  return garantia >= 0 ? garantia : linhas.length;
}

/** O HTML da descricao: texto do produto, documentos na posicao combinada e as frases fixas. */
export function montarDescricaoLI({ descricao, documentos = [], frases = [] } = {}) {
  let linhas = String(descricao ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((linha) => linha.trim());
  const docs = documentosValidos(documentos);
  if (docs.length) {
    const posicao = posicaoDosDocumentos(linhas);
    linhas = [...linhas.slice(0, posicao), "", MARCA_DOS_DOCUMENTOS, "", ...linhas.slice(posicao)];
  }

  // Paragrafos: grupos de linhas separados por linha em branco.
  const grupos = [];
  let atual = [];
  for (const linha of linhas) {
    if (linha === "") {
      if (atual.length) grupos.push(atual);
      atual = [];
    } else {
      atual.push(linha);
    }
  }
  if (atual.length) grupos.push(atual);

  let primeiraLinha = true;
  const partes = grupos.map((grupo) => {
    if (grupo.length === 1 && grupo[0] === MARCA_DOS_DOCUMENTOS) {
      return paragrafo([
        `<strong>${escapar(TITULO_DOS_DOCUMENTOS)}</strong>`,
        ...docs.map((doc) => `- <a href="${escapar(doc.url)}">${escapar(doc.nome ?? doc.url)}</a>;`),
      ]);
    }
    return paragrafo(
      grupo.map((linha) => {
        const emNegrito = (primeiraLinha && ehTituloDoProduto(linha)) || ehTituloDeSecao(linha);
        primeiraLinha = false;
        return emNegrito ? `<strong>${escapar(linha)}</strong>` : escapar(linha);
      }),
    );
  });

  const deFrases = (frases ?? []).filter(preenchido).map((frase) => paragrafo([escapar(String(frase).trim())]));
  return [...partes, ...deFrases].join("");
}
