import { textoDasPartes } from "./acompanhar";
import { LEITURAS_PARA_DIVERGIR, avisoDeCatalogoPendente, precisaAgirNoML, textoDoAvisoDeCatalogo, textoDoCatalogo, textoDoEstadoML } from "./estadoNoML";

/**
 * As divergencias do anuncio PUBLICADO no ML, na ordem da aba Divergencias (pedido do dono em 25/10/2026: "deve ser
 * mostrado na aba divergencias assim como nos outros canais"). Os mesmos motivos do "!" do icone (`icone.js`), um item
 * por motivo, cada um com a acao que o resolve: "enviar" (o Enviar mudancas ao ML), "painel" (so o painel do ML corrige),
 * "revisarCatalogo" (o dono confere o catalogo e marca como revisado) ou null (so informa). Pura: a tela e o teste leem.
 *
 * @param {{ publicado: boolean, publicacao?: { estadoML?: object }, mudancas?: { partes: string[], naoConferido: boolean } }} anuncio
 * @returns {{ id: string, titulo: string, detalhe: string, acao: string | null }[]}
 */
export function divergenciasDoAnuncioML({ publicado, publicacao, mudancas } = {}) {
  if (!publicado) return [];
  const estado = publicacao?.estadoML ?? null;
  const itens = [];
  if ((mudancas?.partes?.length ?? 0) > 0) {
    itens.push({
      id: "envio",
      titulo: mudancas.naoConferido ? "Ainda não conferido com o produto" : `Falta enviar ao ML: ${textoDasPartes(mudancas.partes)}`,
      detalhe: "O Sincronizar com o ML manda o que está no Rise.",
      acao: "enviar",
    });
  }
  if (precisaAgirNoML(estado)) {
    itens.push({ id: "estado", titulo: textoDoEstadoML(estado), detalhe: "O Mercado Livre barrou o anúncio: só o painel do ML corrige.", acao: "painel" });
  }
  if ((estado?.estoqueDiferenteSeguidas ?? 0) >= LEITURAS_PARA_DIVERGIR) {
    itens.push({
      id: "estoque",
      titulo: `Estoque no ML ${estado.estoque}, no Bling ${estado.estoqueBling}`,
      detalhe: "Diferente em leituras seguidas: confira o vínculo do anúncio no Bling, que é quem manda o estoque ao ML.",
      acao: null,
    });
  }
  if (avisoDeCatalogoPendente(estado)) {
    const texto = textoDoAvisoDeCatalogo(estado.catalogoAviso);
    itens.push({
      id: "catalogo",
      titulo: texto.charAt(0).toUpperCase() + texto.slice(1),
      detalhe: `${textoDoCatalogo(estado.catalogo ?? null)}. Confira se o catálogo é o certo para o produto e marque como revisado; uma mudança nova acende o "!" de novo.`,
      acao: "revisarCatalogo",
    });
  }
  return itens;
}
