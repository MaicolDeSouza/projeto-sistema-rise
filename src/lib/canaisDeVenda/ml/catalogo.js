/**
 * Concorrentes do Mercado Livre pelo CATALOGO (spec 2026-10-21-concorrentes-ml-catalogo-design.md), so GET.
 *
 * A busca publica (`/sites/MLB/search`) e o anuncio de outro vendedor (`/items/{id}`) dao 403 para a nossa conta
 * (medido em 21/10/2026). O que responde e o catalogo: `/products/search` acha o produto de catalogo pelo nome,
 * `/products/{id}/items` lista os anuncios que competem nele na ordem do ML (sem titulo nem vendidos), e
 * `/users/{id}` da o apelido e a reputacao do vendedor. Toda funcao recebe o `cliente` (`clienteML()` ou o ML falso).
 */

import { falhou } from "./leitura";

/** Quantos anuncios do catalogo (sem contar os do dono) viram concorrentes acompanhados. */
export const TOP_DO_CATALOGO = 10;

const POR_PAGINA = 50;
// Teto de paginas por leitura: 150 anuncios bastam para achar o top 10 e a posicao do dono, e a releitura diaria nao pode
// custar dezenas de chamadas num catalogo gigante.
const MAXIMO_DE_PAGINAS = 3;
/// O apelido e a reputacao mudam raro: a releitura diaria nao pode custar uma chamada por vendedor.
const CACHE_VENDEDOR_MS = 24 * 60 * 60 * 1000;

const numero = (valor) => (valor === null || valor === undefined || valor === "" || !Number.isFinite(Number(valor)) ? null : Number(valor));

/** Ate 3 "Nome: valor" da ficha do catalogo, Marca e Modelo primeiro. */
function resumoDaFicha(atributos) {
  const lista = Array.isArray(atributos) ? atributos.filter((a) => a?.name && a?.value_name) : [];
  const primeiro = (id) => lista.filter((a) => a.id === id);
  const ordenados = [...primeiro("BRAND"), ...primeiro("MODEL"), ...lista.filter((a) => a.id !== "BRAND" && a.id !== "MODEL")];
  return ordenados.slice(0, 3).map((a) => `${a.name}: ${a.value_name}`);
}

/**
 * Produtos de catalogo parecidos com o termo. Termo vazio nao chama o ML.
 * @returns {Promise<{ id: string, nome: string, dominio: string|null, foto: string|null, atributosResumo: string[] }[]>}
 */
export async function buscarCatalogos(cliente, termo, { limite = 10 } = {}) {
  const q = String(termo ?? "").trim();
  if (!q) return [];
  const resposta = await cliente.get("/products/search", { status: "active", site_id: "MLB", q, limit: limite });
  if (!resposta.ok) throw falhou(resposta);
  return (resposta.dados?.results ?? []).map((produto) => ({
    id: String(produto.id),
    nome: String(produto.name ?? ""),
    dominio: produto.domain_id ?? null,
    foto: produto.pictures?.[0]?.url ?? null,
    atributosResumo: resumoDaFicha(produto.attributes),
  }));
}

/**
 * Os anuncios que competem no catalogo, na ordem do ML. 404 = catalogo sem anuncios abertos (nao e erro).
 * @returns {Promise<{ total: number, itens: { itemId, vendedorId, preco, precoCheio, tipoAnuncio, freteGratis, logistica, condicao, posicao, meu }[] }>}
 */
export async function lerConcorrentesDoCatalogo(cliente, catalogoId, { meuSellerId } = {}) {
  const caminho = `/products/${encodeURIComponent(String(catalogoId ?? "").trim())}/items`;
  const brutos = [];
  let total = 0;
  for (let pagina = 0; pagina < MAXIMO_DE_PAGINAS; pagina++) {
    const resposta = await cliente.get(caminho, { limit: POR_PAGINA, offset: pagina * POR_PAGINA });
    if (resposta.status === 404) return { total: 0, itens: [] };
    if (!resposta.ok) throw falhou(resposta);
    const lista = resposta.dados?.results ?? [];
    total = Number(resposta.dados?.paging?.total ?? lista.length);
    brutos.push(...lista);
    if (lista.length < POR_PAGINA || brutos.length >= total) break;
  }
  const meu = String(meuSellerId ?? "");
  return {
    total,
    itens: brutos.map((item, indice) => ({
      itemId: String(item.item_id),
      vendedorId: String(item.seller_id),
      preco: numero(item.price),
      precoCheio: numero(item.original_price),
      tipoAnuncio: item.listing_type_id ?? null,
      freteGratis: Boolean(item.shipping?.free_shipping),
      logistica: item.shipping?.logistic_type ?? null,
      condicao: item.condition ?? null,
      posicao: indice + 1,
      meu: meu !== "" && String(item.seller_id) === meu,
    })),
  };
}

/** Os `n` primeiros que nao sao do dono, na ordem do ML. */
export function topDoCatalogo(itens, n = TOP_DO_CATALOGO) {
  return (itens ?? []).filter((item) => !item.meu).slice(0, n);
}

/**
 * A melhor posicao do dono no catalogo e o menor preco dos outros. Sem anuncio do dono, `posicao` e `itemId` nulos.
 * @returns {{ posicao: number|null, itemId: string|null, total: number, menorPreco: number|null }}
 */
export function minhaPosicao(itens) {
  const lista = itens ?? [];
  const melhor = lista.filter((item) => item.meu).sort((a, b) => a.posicao - b.posicao)[0] ?? null;
  const precos = lista.filter((item) => !item.meu && item.preco > 0).map((item) => item.preco);
  return {
    posicao: melhor?.posicao ?? null,
    itemId: melhor?.itemId ?? null,
    total: lista.length,
    menorPreco: precos.length > 0 ? Math.min(...precos) : null,
  };
}

const cacheDeVendedores = new Map();

/** Para o teste: esquece os vendedores lidos. */
export function limparCacheDeVendedores() {
  cacheDeVendedores.clear();
}

/**
 * Apelido, reputacao, vendas e cidade de cada vendedor, com cache de 24 h por id. Vendedor que nao responde vira
 * `{ apelido: null, ... }` (tambem em cache: perguntar de novo amanha). Erro que nao e 404 lanca.
 * @returns {Promise<Map<string, { apelido, reputacao, power, vendas, cidade }>>}
 */
export async function lerVendedores(cliente, ids, { agora = Date.now() } = {}) {
  const resultado = new Map();
  for (const id of new Set((ids ?? []).map(String))) {
    const guardado = cacheDeVendedores.get(id);
    if (guardado && agora - guardado.lidoEm < CACHE_VENDEDOR_MS) {
      resultado.set(id, guardado.dados);
      continue;
    }
    const resposta = await cliente.get(`/users/${encodeURIComponent(id)}`);
    if (!resposta.ok && resposta.status !== 404) throw falhou(resposta);
    const d = resposta.ok ? resposta.dados ?? {} : {};
    const dados = {
      apelido: d.nickname ?? null,
      reputacao: d.seller_reputation?.level_id ?? null,
      power: d.seller_reputation?.power_seller_status ?? null,
      vendas: numero(d.seller_reputation?.transactions?.total),
      cidade: d.address?.city ?? null,
    };
    cacheDeVendedores.set(id, { lidoEm: agora, dados });
    resultado.set(id, dados);
  }
  return resultado;
}

const CORES_DA_REPUTACAO = { green: "verde", light_green: "verde-claro", yellow: "amarelo", orange: "laranja", red: "vermelho" };

/** "5_green" -> "verde 5". */
export function textoDaReputacao(levelId) {
  const partes = String(levelId ?? "").match(/^(\d+)_(.+)$/);
  if (!partes) return "sem reputação";
  return `${CORES_DA_REPUTACAO[partes[2]] ?? partes[2]} ${partes[1]}`;
}
