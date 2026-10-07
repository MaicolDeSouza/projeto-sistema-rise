import { decodificar } from "@/lib/coleta/texto-html";

/** HTML de canais externos para o texto puro guardado no cadastro base. */
export function htmlParaTexto(html) {
  if (!html) return null;
  const texto = decodificar(
    String(html)
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
