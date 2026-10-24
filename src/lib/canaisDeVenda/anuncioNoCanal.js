/**
 * O anuncio "publicado" no Rise ainda existe no canal? (Opcao 2 do dono em 24/10/2026: o ZZ-TESTE-BLING nao se excluia
 * porque o Rise guardava o anuncio da LI como publicado, e a loja ja o tinha apagado.) So leitura no canal.
 *
 * - Loja Integrada: `GET /produto/{id}`; 404 = sumiu.
 * - Mercado Livre: `GET /items/{id}`; 404 ou `closed` (encerrar no ML nao tem volta) = sumiu.
 * - Outro canal, sem id externo, ou resposta que nao permite dizer: "desconhecido" (quem chama trata como existe).
 *
 * @param {{ canal: string, idExterno?: string|null, dados?: object }} anuncio
 * @param {{ li?: { get: Function }, ml?: { get: Function } }} clientes
 * @returns {Promise<"sumiu" | "existe" | "desconhecido">}
 */
export async function situacaoNoCanal(anuncio, { li, ml } = {}) {
  try {
    if (anuncio?.canal === "LOJA_INTEGRADA" && li && anuncio.idExterno) {
      const resposta = await li.get(`/produto/${encodeURIComponent(anuncio.idExterno)}`);
      if (resposta?.status === 404) return "sumiu";
      return resposta?.ok ? "existe" : "desconhecido";
    }
    const itemId = anuncio?.idExterno ?? anuncio?.dados?.publicacao?.itemId ?? null;
    if (anuncio?.canal === "MERCADO_LIVRE" && ml && itemId) {
      const resposta = await ml.get(`/items/${encodeURIComponent(itemId)}`);
      if (resposta?.status === 404) return "sumiu";
      if (resposta?.ok) return resposta.dados?.status === "closed" ? "sumiu" : "existe";
      return "desconhecido";
    }
  } catch {
    return "desconhecido";
  }
  return "desconhecido";
}

const NOME_DO_CANAL = { LOJA_INTEGRADA: "Loja Integrada", MERCADO_LIVRE: "Mercado Livre", BLING: "Bling", SHOPEE: "Shopee" };
export const nomeDoCanal = (canal) => NOME_DO_CANAL[canal] ?? canal;
