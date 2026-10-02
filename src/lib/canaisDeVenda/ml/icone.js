/**
 * Estado do icone do Mercado Livre na lista de Produtos: colorido quando ha anuncio
 * publicado, com um ponto ambar quando ha rascunho. Funcao pura, sem imports: a lista
 * (componente de cliente) e o teste leem o mesmo arquivo.
 *
 * Os dois podem valer ao mesmo tempo: desde a fase 1 um produto tem varios anuncios no ML
 * (por exemplo, o Classico publicado e o Premium ainda em rascunho), e o icone precisa
 * mostrar as duas coisas em vez de deixar um esconder o outro.
 */

/** @param {{canal: string, status: string}[]} anuncios os anuncios do produto, de todos os canais */
export function estadoDoIconeML(anuncios) {
  const doML = (Array.isArray(anuncios) ? anuncios : []).filter((anuncio) => anuncio?.canal === "MERCADO_LIVRE");
  return {
    publicado: doML.some((anuncio) => anuncio.status === "PUBLICADO"),
    rascunho: doML.some((anuncio) => anuncio.status === "RASCUNHO"),
  };
}
