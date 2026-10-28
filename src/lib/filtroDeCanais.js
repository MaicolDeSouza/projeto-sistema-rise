/**
 * Filtro da coluna Canais da lista de Produtos. Pedido do dono em 24/10/2026 (por canal, so os VINCULADOS ou so os NAO
 * vinculados); em 28/10/2026 o popup virou os proprios icones, e cada clique avanca: tem -> nao tem -> desligado
 * (Opcao 1 do dono, para nao perder o "nao vinculados"). Na URL, um parametro por icone (`?bling=sim&ml=nao`); sem o
 * parametro, o icone nao filtra, e varios ligados valem juntos (E). Funcao pura, sem imports: a pagina (servidor) e o
 * popup (cliente) leem a mesma lista. A regra de "vinculado" e a mesma do icone de cada canal e do `filtrarProdutos` do MCP.
 *
 * `calculado`: o "ML com catalogo" e o "!" nao cabem numa condicao do banco (o "!" junta assinaturas e o estado do kit,
 * do Bling, da LI e do ML); a pagina calcula os icones e filtra por `passaNosCalculados`.
 */

export const CANAIS_DO_FILTRO = [
  { id: "rise", rotulo: "Rise", sim: "Conferidos", nao: "Não conferidos" },
  { id: "bling", rotulo: "Bling", sim: "Vinculados ao Bling", nao: "Não vinculados ao Bling" },
  { id: "li", rotulo: "Loja Integrada", sim: "Vinculados à Loja Integrada", nao: "Não vinculados à Loja Integrada" },
  { id: "ml", rotulo: "Mercado Livre", sim: "Publicados no Mercado Livre", nao: "Não publicados no Mercado Livre" },
  { id: "mlc", rotulo: "ML com catálogo", sim: "Concorrendo num catálogo do ML", nao: "Fora de catálogo do ML", calculado: true },
  { id: "div", rotulo: "Com aviso (!)", sim: "Com aviso (!) em algum ícone", nao: "Sem aviso (!)", calculado: true },
];

const VALORES = new Set(["sim", "nao"]);

/** O que a URL pede, so com icones e valores conhecidos: `{ bling: "sim", ml: "nao" }`. */
export function filtroDeCanaisDaUrl(params) {
  const filtro = {};
  for (const { id } of CANAIS_DO_FILTRO) {
    const valor = Array.isArray(params?.[id]) ? params[id][0] : params?.[id];
    if (VALORES.has(valor)) filtro[id] = valor;
  }
  return filtro;
}

/** O clique no icone: desligado -> "sim" -> "nao" -> desligado (null). */
export function proximoValorDoFiltro(atual) {
  if (atual === "sim") return "nao";
  if (atual === "nao") return null;
  return "sim";
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

/** Ha algum filtro que so os icones calculados respondem? */
export function temFiltroCalculado(filtro) {
  return Boolean(filtro?.mlc || filtro?.div);
}

/**
 * O produto passa nos filtros calculados? `catalogo`: algum anuncio publicado concorre num catalogo do ML (o selo "C");
 * `aviso`: algum icone da linha tem o "!".
 */
export function passaNosCalculados(filtro, { catalogo, aviso }) {
  if (filtro?.mlc && (filtro.mlc === "sim") !== Boolean(catalogo)) return false;
  if (filtro?.div && (filtro.div === "sim") !== Boolean(aviso)) return false;
  return true;
}
