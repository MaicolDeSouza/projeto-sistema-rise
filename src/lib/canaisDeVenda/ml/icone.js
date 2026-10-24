/**
 * Estado do icone do Mercado Livre na lista de Produtos. Funcao pura, sem imports: a lista (componente de cliente) e o
 * teste leem o mesmo arquivo. Regra do dono em 24/10/2026 (antes, publicado pausado ficava cinza e com o "!"):
 *
 * - `publicado` (verde): algum anuncio PUBLICADO no ML, ativo OU pausado. Ficar sem estoque e normal na loja (a coluna
 *   Estoque ja mostra o zero em vermelho), e o anuncio pausado por isso continua sendo um anuncio publicado.
 * - `erro` (o selo "!"): a publicacao de algum anuncio deu erro ou ficou parada no meio (ERRO ou PUBLICANDO, que inclui o
 *   kit aguardando o Bling). E so o que pede uma acao do dono.
 * - `pausado` e `rascunho`: so para o texto do icone (o mouse e o leitor de tela). Rascunho nao publicado nao acende nada.
 *
 * Varios anuncios do mesmo produto (Classico e Premium) valem juntos: um publicado deixa verde, um com erro poe o "!".
 */

const ehDoML = (anuncio) => anuncio?.canal === "MERCADO_LIVRE";
const SITUACOES_PUBLICADAS = new Set(["ATIVA", "PAUSADA"]);
const estaPublicado = (anuncio) => anuncio.status === "PUBLICADO" && SITUACOES_PUBLICADAS.has(anuncio.situacaoCanal);

/** @param {{canal: string, status: string, situacaoCanal?: string}[]} anuncios os anuncios do produto, de todos os canais */
export function estadoDoIconeML(anuncios) {
  const doML = (Array.isArray(anuncios) ? anuncios : []).filter(ehDoML);
  return {
    publicado: doML.some(estaPublicado),
    pausado: doML.some((anuncio) => estaPublicado(anuncio) && anuncio.situacaoCanal === "PAUSADA") && !doML.some((anuncio) => estaPublicado(anuncio) && anuncio.situacaoCanal === "ATIVA"),
    erro: doML.some((anuncio) => anuncio.status === "ERRO" || anuncio.status === "PUBLICANDO"),
    rascunho: doML.some((anuncio) => anuncio.status === "RASCUNHO" || anuncio.status === "VALIDADO"),
  };
}

/**
 * Texto do icone do ML (nome acessivel e dica ao passar o mouse): a cor e o selo sozinhos nao chegam a quem usa leitor
 * de tela nem a quem so passa o mouse.
 * @param {{publicado: boolean, pausado?: boolean, erro: boolean, rascunho?: boolean}} estado o retorno de `estadoDoIconeML`
 */
export function rotuloDoIconeML({ publicado, pausado = false, erro, rascunho = false }) {
  const base = "Anúncio no Mercado Livre";
  const partes = [];
  if (publicado) partes.push(pausado ? "publicado, pausado (sem estoque)" : "publicado");
  if (erro) partes.push("com erro na publicação");
  if (!publicado && !erro && rascunho) partes.push("rascunho, ainda não publicado");
  return partes.length ? `${base}: ${partes.join(", ")}` : `${base}: sem anúncio`;
}
