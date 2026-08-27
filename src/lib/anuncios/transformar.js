import { obterCanal } from "./canais";

/**
 * Monta o payload que seria enviado ao canal.
 *
 * Na Fase A alimenta a pre-visualizacao na tela; na Fase B alimenta a
 * publicacao de verdade. E o mesmo codigo de proposito: o que for aprovado
 * visualmente e exatamente o que vai para o ar.
 */
export function montarPayload(produto, anuncio) {
  const canal = obterCanal(anuncio?.canal);
  if (!canal?.regras?.montarPayload) return null;
  return canal.regras.montarPayload(produto, anuncio);
}

export function camposEditaveis(anuncio) {
  const canal = obterCanal(anuncio?.canal);
  if (!canal?.regras?.camposEditaveis) return {};
  return canal.regras.camposEditaveis(anuncio);
}
