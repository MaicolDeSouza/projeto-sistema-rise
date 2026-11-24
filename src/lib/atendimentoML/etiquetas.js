/**
 * As etiquetas de anuncio na resposta do Atendimento do ML (spec 2026-11-24-atendimento-ml-design.md, "Link").
 *
 * A IA nunca escreve um endereco: para indicar um anuncio ela escreve a etiqueta `[ANUNCIO:MLB123]`, e este arquivo troca
 * a etiqueta pelo endereco que o Rise guarda (`Anuncio.urlExterna`). Etiqueta de anuncio que nao esta na lista (inventada,
 * ou de outro produto) sai do texto e volta em `desconhecidas`.
 *
 * Puro, sem imports: a tela, o Telegram, o MCP e o teste usam o mesmo arquivo.
 */

const ETIQUETA = /\[\s*ANUNCIO\s*:\s*(MLB)-?(\d+)\s*\]/gi;

/** "[ANUNCIO:MLB123]" para o item `MLB123` (aceita `MLB-123`). */
export function etiquetaDoAnuncio(itemId) {
  return `[ANUNCIO:${String(itemId ?? "").toUpperCase().replace("-", "")}]`;
}

/**
 * @param {string} texto
 * @param {{ itemId: string, url: string }[]} anuncios os anuncios que PODEM ser indicados
 * @returns {{ texto: string, links: string[], desconhecidas: string[] }}
 */
export function trocarEtiquetas(texto, anuncios = []) {
  const porItem = new Map((anuncios ?? []).filter((a) => a?.itemId && a?.url).map((a) => [String(a.itemId).toUpperCase().replace("-", ""), String(a.url)]));
  const links = [];
  const desconhecidas = [];
  const trocado = String(texto ?? "").replace(ETIQUETA, (_, prefixo, numero) => {
    const item = `${prefixo.toUpperCase()}${numero}`;
    const url = porItem.get(item);
    if (!url) {
      if (!desconhecidas.includes(item)) desconhecidas.push(item);
      return "";
    }
    if (!links.includes(url)) links.push(url);
    return url;
  });
  // A etiqueta tirada deixa dois espacos (ou espaco antes da pontuacao) no lugar.
  const limpo = desconhecidas.length ? trocado.replace(/[ \t]{2,}/g, " ").replace(/ ([.,;:!?])/g, "$1").trim() : trocado;
  return { texto: limpo, links, desconhecidas };
}
