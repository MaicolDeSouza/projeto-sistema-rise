/**
 * Filtro da coluna Canais da lista de Produtos. Pedido do dono em 24/10/2026 (por canal, so os VINCULADOS ou so os NAO
 * vinculados); em 28/10/2026 o popup virou os proprios icones, e cada clique avanca: tem -> nao tem -> desligado
 * (Opcao 1 do dono, para nao perder o "nao vinculados"). Na URL, um parametro por icone (`?bling=sim&ml=nao`); sem o
 * parametro, o icone nao filtra, e varios ligados valem juntos (E). Funcao pura, sem imports: a pagina (servidor) e o
 * popup (cliente) leem a mesma lista. A regra de "vinculado" e a mesma do icone de cada canal e do `filtrarProdutos` do MCP.
 *
 * Em 08/11/2026 (pedido do dono) o ciclo passou a ser POR ICONE (`estados`, na ordem dos cliques): o Rise e o ML ganharam
 * "proposta" (o "P" da linha: proposta de produto pronta e nao conferida; proposta de anuncio do ML gravada), e o "ML com
 * catalogo" deixou de ser um icone a parte para virar o estado "catalogo" do unico icone do ML. O `?mlc=` antigo e ignorado.
 *
 * Calculados: "proposta", "catalogo" e o "!" nao cabem numa condicao do banco (o "!" junta assinaturas e o estado do kit,
 * do Bling, da LI e do ML; a proposta pronta e uma chave dentro do JSON); a pagina calcula os icones e filtra por
 * `passaNosCalculados`.
 */

export const CANAIS_DO_FILTRO = [
  { id: "rise", rotulo: "Rise", estados: { sim: "Conferidos", nao: "Não conferidos", proposta: "Com proposta pronta (P)" } },
  { id: "bling", rotulo: "Bling", estados: { sim: "Vinculados ao Bling", nao: "Não vinculados ao Bling" } },
  { id: "li", rotulo: "Loja Integrada", estados: { sim: "Vinculados à Loja Integrada", nao: "Não vinculados à Loja Integrada" } },
  {
    id: "ml",
    rotulo: "Mercado Livre",
    estados: {
      sim: "Publicados no Mercado Livre",
      nao: "Não publicados no Mercado Livre",
      proposta: "Com proposta de anúncio pronta (P)",
      catalogo: "Concorrendo num catálogo do ML (C)",
    },
  },
  // O "!" aplica e fecha o popup no clique (pedido do dono em 08/11/2026).
  { id: "div", rotulo: "Com aviso (!)", estados: { sim: "Com aviso (!) em algum ícone", nao: "Sem aviso (!)" }, fechaAoClicar: true },
];

const CICLO_PADRAO = ["sim", "nao"];

/** Os estados do icone, na ordem dos cliques. */
export function estadosDoCanal(canal) {
  return Object.keys(canal?.estados ?? {});
}

/** O texto do estado (`"Conferidos"`), ou null quando o icone nao filtra. */
export function rotuloDoEstado(canal, valor) {
  return canal?.estados?.[valor] ?? null;
}

/** O que a URL pede, so com icones e valores conhecidos: `{ bling: "sim", ml: "nao" }`. */
export function filtroDeCanaisDaUrl(params) {
  const filtro = {};
  for (const canal of CANAIS_DO_FILTRO) {
    const valor = Array.isArray(params?.[canal.id]) ? params[canal.id][0] : params?.[canal.id];
    if (estadosDoCanal(canal).includes(valor)) filtro[canal.id] = valor;
  }
  return filtro;
}

/** O clique no icone: desligado -> 1o estado -> ... -> ultimo estado -> desligado (null). */
export function proximoValorDoFiltro(atual, estados = CICLO_PADRAO) {
  const posicao = estados.indexOf(atual);
  if (posicao < 0) return estados[0] ?? null;
  return estados[posicao + 1] ?? null;
}

// Publicado no ML = o icone verde: status PUBLICADO, ativo ou pausado (sem estoque).
const PUBLICADO_NO_ML = { canal: "MERCADO_LIVRE", status: "PUBLICADO", situacaoCanal: { in: ["ATIVA", "PAUSADA"] } };
const COM_BLING = { AND: [{ blingId: { not: null } }, { blingId: { not: "" } }] };
const COM_LI = { OR: [{ AND: [{ urlLojaIntegrada: { not: null } }, { urlLojaIntegrada: { not: "" } }] }, { anuncios: { some: { canal: "LOJA_INTEGRADA", idExterno: { not: null } } } }] };

const CONDICOES = {
  rise: { sim: { conferido: true }, nao: { conferido: false } },
  bling: { sim: COM_BLING, nao: { NOT: COM_BLING } },
  li: { sim: COM_LI, nao: { NOT: COM_LI } },
  ml: { sim: { anuncios: { some: PUBLICADO_NO_ML } }, nao: { anuncios: { none: PUBLICADO_NO_ML } } },
};

/** As condicoes do Prisma do filtro (para juntar com AND), ou lista vazia sem filtro. Os calculados ficam de fora. */
export function condicoesDoFiltroDeCanais(filtro) {
  return Object.entries(filtro ?? {})
    .map(([canal, valor]) => CONDICOES[canal]?.[valor])
    .filter(Boolean);
}

/** Ha algum filtro que so os icones calculados respondem (o que nao tem condicao do banco)? */
export function temFiltroCalculado(filtro) {
  return Object.entries(filtro ?? {}).some(([canal, valor]) => !CONDICOES[canal]?.[valor]);
}

/**
 * O produto passa nos filtros calculados? `catalogo`: algum anuncio publicado concorre num catalogo do ML (o selo "C");
 * `aviso`: algum icone da linha tem o "!"; `propostaDoProduto`: o "P" do icone R (proposta pronta e produto nao
 * conferido); `propostaDoML`: o "P" do icone do ML (proposta de anuncio gravada).
 */
export function passaNosCalculados(filtro, { catalogo, aviso, propostaDoProduto, propostaDoML }) {
  if (filtro?.rise === "proposta" && !propostaDoProduto) return false;
  if (filtro?.ml === "proposta" && !propostaDoML) return false;
  if (filtro?.ml === "catalogo" && !catalogo) return false;
  if (filtro?.div && (filtro.div === "sim") !== Boolean(aviso)) return false;
  return true;
}
