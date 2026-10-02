/**
 * Estado do icone do Mercado Livre na lista de Produtos: colorido (verde) quando ha anuncio
 * publicado e ativo, com um ponto ambar quando algum anuncio ainda precisa de atencao.
 * Funcao pura, sem imports: a lista (componente de cliente) e o teste leem o mesmo arquivo.
 *
 * Os dois podem valer ao mesmo tempo: desde a fase 1 um produto tem varios anuncios no ML
 * (por exemplo, o Classico publicado e ativo e o Premium ainda em rascunho), e o icone
 * precisa mostrar as duas coisas em vez de deixar um esconder o outro.
 *
 * - `publicado` (verde): algum anuncio com status PUBLICADO E `situacaoCanal` ATIVA. Status e
 *   situacao divergem (o ML pausa anuncio sozinho por falta de estoque), e um publicado
 *   pausado nao pode aparecer como "tudo certo". Sem `situacaoCanal` ele nao e verde.
 * - `rascunho` (ponto ambar): algum anuncio do ML que NAO e "publicado e ativo": RASCUNHO,
 *   VALIDADO, PUBLICANDO (inclui a composicao aguardando o Bling), ERRO, ou um PUBLICADO que
 *   o ML pausou/encerrou. Todos pedem a atencao do dono, entao o ponto vale para todos.
 */

const ehDoML = (anuncio) => anuncio?.canal === "MERCADO_LIVRE";
const estaPublicadoEAtivo = (anuncio) => anuncio.status === "PUBLICADO" && anuncio.situacaoCanal === "ATIVA";

/** @param {{canal: string, status: string, situacaoCanal?: string}[]} anuncios os anuncios do produto, de todos os canais */
export function estadoDoIconeML(anuncios) {
  const doML = (Array.isArray(anuncios) ? anuncios : []).filter(ehDoML);
  return {
    publicado: doML.some(estaPublicadoEAtivo),
    rascunho: doML.some((anuncio) => !estaPublicadoEAtivo(anuncio)),
  };
}
