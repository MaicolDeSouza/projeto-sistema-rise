import { textoDasPartes } from "./acompanhar";
import { LEITURAS_PARA_DIVERGIR, avisoDeCatalogoPendente, faturaPendente, precisaAgirNoML, textoDaFatura, textoDoAvisoDeCatalogo, textoDoCatalogo, textoDoEstadoML } from "./estadoNoML";
import { reutilizadoPendente } from "./rotulos";

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
  // O reaproveitado da conta ainda nao revisado (dono, 09/11/2026): um item so, o do Publicar, que manda as partes e carimba.
  if (reutilizadoPendente(publicacao)) {
    const partes = mudancas?.partes ?? [];
    const titulo = "Reutilizado da conta, esperando a sua revisão";
    itens.push({
      id: "envio",
      titulo: partes.length > 0 ? `${titulo}: falta enviar ${textoDasPartes(partes)}` : titulo,
      detalhe: "O Publicar manda o que está no Rise e marca o anúncio como publicado.",
      acao: "enviar",
    });
  } else if ((mudancas?.partes?.length ?? 0) > 0) {
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
  if (faturaPendente(publicacao?.fatura)) {
    itens.push({
      id: "fatura",
      titulo: textoDaFatura(publicacao.fatura),
      detalhe: "O ML ainda não emite a nota deste anúncio: confira em Faturamento no ML ou reenvie os dados fiscais na aba Status.",
      acao: "painel",
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
