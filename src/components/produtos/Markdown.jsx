"use client";

/**
 * Conversao de Markdown para HTML, o suficiente para descricao de produto:
 * titulos, negrito, italico, listas, links e paragrafos.
 *
 * Escrito a mao em vez de trazer uma biblioteca porque a descricao vai para
 * canais que aceitam pouca coisa — o **Mercado Livre so aceita texto puro** —,
 * entao suportar a especificacao inteira do Markdown nao teria para onde ir.
 *
 * O texto do usuario e escapado ANTES de virar HTML: sem isso, colar uma
 * descricao de fornecedor com <script> injetaria codigo na propria tela.
 */

function escapar(texto) {
  return texto
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function trechoInline(texto) {
  return escapar(texto)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\W)\*(?!\s)(.+?)(?<!\s)\*/g, "$1<em>$2</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(
      /\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
    );
}

export function paraHtml(markdown) {
  if (!markdown?.trim()) return "";

  const linhas = markdown.replaceAll("\r\n", "\n").split("\n");
  const saida = [];
  let lista = null;

  const fecharLista = () => {
    if (lista) {
      saida.push(`</${lista}>`);
      lista = null;
    }
  };

  for (const linha of linhas) {
    const texto = linha.trim();

    if (!texto) {
      fecharLista();
      continue;
    }

    const titulo = texto.match(/^(#{1,3})\s+(.*)$/);
    if (titulo) {
      fecharLista();
      const nivel = titulo[1].length + 2;
      saida.push(`<h${nivel}>${trechoInline(titulo[2])}</h${nivel}>`);
      continue;
    }

    const itemLista = texto.match(/^[-*]\s+(.*)$/);
    if (itemLista) {
      if (lista !== "ul") {
        fecharLista();
        saida.push("<ul>");
        lista = "ul";
      }
      saida.push(`<li>${trechoInline(itemLista[1])}</li>`);
      continue;
    }

    const itemNumerado = texto.match(/^\d+[.)]\s+(.*)$/);
    if (itemNumerado) {
      if (lista !== "ol") {
        fecharLista();
        saida.push("<ol>");
        lista = "ol";
      }
      saida.push(`<li>${trechoInline(itemNumerado[1])}</li>`);
      continue;
    }

    fecharLista();
    saida.push(`<p>${trechoInline(texto)}</p>`);
  }

  fecharLista();
  return saida.join("\n");
}

/** Texto sem marcacao — o formato que o Mercado Livre aceita na descricao. */
export function paraTextoPuro(markdown) {
  if (!markdown?.trim()) return "";

  return markdown
    .replaceAll("\r\n", "\n")
    .replace(/^#{1,3}\s+/gm, "")
    .replace(/^[-*]\s+/gm, "- ")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/(^|\W)\*(?!\s)(.+?)(?<!\s)\*/g, "$1$2")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)")
    .trim();
}
