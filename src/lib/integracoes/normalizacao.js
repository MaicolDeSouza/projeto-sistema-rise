import { decodificar } from "@/lib/coleta/texto-html";

/**
 * HTML de canais externos para o texto puro guardado no cadastro base.
 *
 * `paragrafos: true` faz o fim de <p> virar linha em branco, o inverso de `textoParaHtmlLI`
 * (a Loja Integrada separa paragrafos com <p>). Sem a opcao fica como o Bling sempre usou,
 * uma quebra so: mudar o padrao mexeria nas descricoes ja importadas.
 *
 * No modo `paragrafos` a quebra de linha CRUA do HTML e so espaco: a LI regrava `<br>` como
 * `<br />\r\n` (medido em 07/10/2026), e contar as duas quebras inventava um paragrafo a cada linha,
 * o que deixava a descricao "diferente" para sempre no selo.
 */
export function htmlParaTexto(html, { paragrafos = false } = {}) {
  if (!html) return null;
  const bruto = paragrafos ? String(html).replace(/[\r\n]+/g, " ") : String(html);
  const texto = decodificar(
    bruto
      .replace(/<\/p>/gi, paragrafos ? "\n\n" : "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r/g, "")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return texto || null;
}
