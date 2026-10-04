import { config, exigirTravaLiberada } from "@/lib/integracoes/config";
import { blingGet, blingPatch, blingPost, blingPut } from "@/lib/integracoes/bling";

/**
 * O contrato com o Bling que TODAS as funcoes da sincronizacao recebem por parametro
 * (`cliente = clienteBling()`): `get`, `post`, `put`, `patch` e `exigirEscrita`. Quem
 * usa so conhece esse objeto, entao o teste troca o Bling real pelo falso
 * (`scripts/lib/blingFalso.js`), que tem o mesmo formato, sem rede e sem banco.
 */

/**
 * Segunda trava de escrita: com a lista de codigos liberados preenchida
 * (BLING_ESCRITA_CODIGOS), so esses codigos podem ser escritos no Bling. Lista vazia
 * libera todos. Compara sem diferenciar caixa, porque o Bling e o Rise nem sempre
 * guardam o SKU com a mesma caixa.
 *
 * @param {string} codigo codigo (SKU) do produto que sera escrito.
 * @param {string[]} liberados lista de codigos liberados; vazia = todos.
 */
export function exigirCodigoLiberado(codigo, liberados) {
  // Uma trava de seguranca nao pode se abrir por descuido: sem lista de verdade (undefined,
  // texto), falha alto em vez de tratar como "vazia = libera tudo".
  if (!Array.isArray(liberados)) {
    throw new Error("exigirCodigoLiberado: a lista de codigos liberados tem que ser uma lista.");
  }
  if (liberados.length === 0) return;

  const procurado = String(codigo ?? "").trim().toLowerCase();
  if (procurado && liberados.some((item) => String(item).trim().toLowerCase() === procurado)) return;

  throw new Error(
    `Escrita bloqueada: o codigo ${codigo} nao esta na lista de codigos liberados ` +
      "(BLING_ESCRITA_CODIGOS no .env). Nenhum dado foi enviado.",
  );
}

/**
 * @returns {{
 *   get: typeof blingGet,
 *   post: typeof blingPost,
 *   put: typeof blingPut,
 *   patch: typeof blingPatch,
 *   exigirEscrita: (codigo: string) => void,
 * }}
 */
export function clienteBling() {
  return {
    get: blingGet,
    post: blingPost,
    put: blingPut,
    patch: blingPatch,
    /**
     * As duas travas, nesta ordem: BLING_ESCRITA (geral) e a lista de codigos liberados.
     * Quem vai escrever chama ANTES da primeira chamada ao Bling, para a recusa nao
     * deixar meia sincronizacao para tras.
     */
    exigirEscrita(codigo) {
      exigirTravaLiberada("BLING");
      exigirCodigoLiberado(codigo, config.travas.blingCodigosLiberados);
    },
  };
}
