/**
 * Filtro da coluna Canais da lista de Produtos (pedido do dono em 24/10/2026): por canal, so os VINCULADOS ou so os
 * NAO vinculados. Na URL, um parametro por canal (`?bling=sim&ml=nao`); sem o parametro, o canal nao filtra. Funcao
 * pura, sem imports: a pagina (servidor) e o menu (cliente) leem a mesma lista. A regra de "vinculado" e a mesma do
 * icone de cada canal e do `filtrarProdutos` do MCP.
 */

export const CANAIS_DO_FILTRO = [
  { id: "rise", rotulo: "Rise (Conferido)", sim: "Conferidos", nao: "Não conferidos" },
  { id: "bling", rotulo: "Bling", sim: "Vinculados", nao: "Não vinculados" },
  { id: "li", rotulo: "Loja Integrada", sim: "Vinculados", nao: "Não vinculados" },
  { id: "ml", rotulo: "Mercado Livre", sim: "Publicados", nao: "Não publicados" },
];

const VALORES = new Set(["sim", "nao"]);

/** O que a URL pede, so com canais e valores conhecidos: `{ bling: "sim", ml: "nao" }`. */
export function filtroDeCanaisDaUrl(params) {
  const filtro = {};
  for (const { id } of CANAIS_DO_FILTRO) {
    const valor = Array.isArray(params?.[id]) ? params[id][0] : params?.[id];
    if (VALORES.has(valor)) filtro[id] = valor;
  }
  return filtro;
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

/** As condicoes do Prisma do filtro (para juntar com AND), ou lista vazia sem filtro. */
export function condicoesDoFiltroDeCanais(filtro) {
  return Object.entries(filtro ?? {})
    .map(([canal, valor]) => CONDICOES[canal]?.[valor])
    .filter(Boolean);
}
