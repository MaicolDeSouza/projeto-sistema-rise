/**
 * Concorrentes do Mercado Livre pelo CATALOGO (spec 2026-10-21-concorrentes-ml-catalogo-design.md), so GET.
 *
 * A busca publica (`/sites/MLB/search`) e o anuncio de outro vendedor (`/items/{id}`) dao 403 para a nossa conta
 * (medido em 21/10/2026). O que responde e o catalogo: `/products/search` acha o produto de catalogo pelo nome,
 * `/products/{id}/items` lista os anuncios que competem nele na ordem do ML (sem titulo nem vendidos), e
 * `/users/{id}` da o apelido e a reputacao do vendedor. Toda funcao recebe o `cliente` (`clienteML()` ou o ML falso).
 */

import { catalogoDoItem } from "./estadoNoML";
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
 * Reserva da sugestao de categoria (22/10/2026: o `domain_discovery` passou a devolver [] para tudo, ate "celular
 * samsung", com e sem token). Os catalogos achados pelo texto e, em cada um, os anuncios que competem nele: o
 * `/products/{id}/items` traz o `category_id` de cada anuncio. Devolve as categorias da mais usada para a menos usada.
 * Catalogo sem anuncios (404) e pulado; outro erro lanca.
 * @returns {Promise<{ categoriaId: string, nome: null }[]>}
 */
export async function categoriasPeloCatalogo(cliente, texto, { catalogos = 3, anunciosPorCatalogo = 20, maximo = 3 } = {}) {
  const contagem = new Map();
  for (const catalogo of await buscarCatalogos(cliente, texto, { limite: catalogos })) {
    const resposta = await cliente.get(`/products/${encodeURIComponent(catalogo.id)}/items`, { limit: anunciosPorCatalogo });
    if (resposta.status === 404) continue;
    if (!resposta.ok) throw falhou(resposta);
    for (const item of resposta.dados?.results ?? []) {
      const id = String(item.category_id ?? "").trim();
      if (/^MLB\d+$/.test(id)) contagem.set(id, (contagem.get(id) ?? 0) + 1);
    }
  }
  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maximo)
    .map(([categoriaId]) => ({ categoriaId, nome: null }));
}

/**
 * O catalogo dos anuncios do proprio dono para este SKU, como sugestao (a busca pelo nome nao achava o catalogo do 100101
 * entre os 10 primeiros, medido em 22/10/2026). `/users/{id}/items/search?seller_sku=` acha os anuncios dele (o `sku=`
 * acha menos), e cada `/items/{id}` traz o `catalog_product_id`. Encerrado fica de fora. Um por catalogo.
 * @returns {Promise<{ id, nome, dominio, foto, atributosResumo, meusAnuncios: string[] }[]>}
 */
export async function catalogosDosMeusAnuncios(cliente, sku, { maximoDeAnuncios = 10 } = {}) {
  const codigo = String(sku ?? "").trim();
  if (!codigo) return [];
  const eu = await cliente.usuarioId();
  const busca = await cliente.get(`/users/${encodeURIComponent(String(eu))}/items/search`, { seller_sku: codigo });
  if (!busca.ok) throw falhou(busca);
  const porCatalogo = new Map();
  for (const itemId of (busca.dados?.results ?? []).slice(0, maximoDeAnuncios)) {
    const item = await cliente.get(`/items/${encodeURIComponent(itemId)}`, { attributes: "id,status,catalog_product_id,item_relations" });
    if (!item.ok || item.dados?.status === "closed") continue;
    // O anuncio pode estar no catalogo pelo jeito antigo do ML: um anuncio de catalogo SEPARADO ligado a ele (26/10/2026,
    // a mesma regra da releitura de hora em hora, `catalogoDoItem`).
    let catalogoId = catalogoDoItem(item.dados);
    if (!catalogoId && Array.isArray(item.dados?.item_relations) && item.dados.item_relations.length > 0) {
      const ligados = [];
      for (const relacao of item.dados.item_relations.slice(0, 5)) {
        const lido = await cliente.get(`/items/${encodeURIComponent(String(relacao?.id ?? ""))}`, { attributes: "id,status,catalog_product_id,catalog_listing" });
        if (lido.ok && lido.dados) ligados.push(lido.dados);
      }
      catalogoId = catalogoDoItem(item.dados, ligados);
    }
    if (!catalogoId) continue;
    const id = String(catalogoId);
    porCatalogo.set(id, [...(porCatalogo.get(id) ?? []), String(itemId)]);
  }
  const resultado = [];
  for (const [id, meusAnuncios] of porCatalogo) {
    const produto = await cliente.get(`/products/${encodeURIComponent(id)}`);
    if (!produto.ok) continue;
    resultado.push({
      id,
      nome: String(produto.dados?.name ?? id),
      dominio: produto.dados?.domain_id ?? null,
      foto: produto.dados?.pictures?.[0]?.url ?? null,
      atributosResumo: resumoDaFicha(produto.dados?.attributes),
      meusAnuncios,
    });
  }
  return resultado;
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
  return { total, itens: brutos.map((item, indice) => itemDoCatalogo(item, indice + 1, meuSellerId)) };
}

function itemDoCatalogo(item, posicao, meuSellerId) {
  const meu = String(meuSellerId ?? "");
  return {
    itemId: String(item.item_id),
    vendedorId: String(item.seller_id),
    preco: numero(item.price),
    precoCheio: numero(item.original_price),
    tipoAnuncio: item.listing_type_id ?? null,
    freteGratis: Boolean(item.shipping?.free_shipping),
    logistica: item.shipping?.logistic_type ?? null,
    condicao: item.condition ?? null,
    posicao,
    meu: meu !== "" && String(item.seller_id) === meu,
  };
}

/**
 * So o 1o anuncio do catalogo (os catalogos de referencia do ranking guardam so ele): uma pagina de 1. O 1o da lista e o
 * que o ML mostra primeiro; o `buy_box_winner` de `/products/{id}` veio nulo no MLB44072268 (medido em 23/10/2026).
 * @returns {Promise<{ total: number, primeiro: object|null }>} 404 = catalogo sem anuncios.
 */
export async function lerPrimeiroDoCatalogo(cliente, catalogoId, { meuSellerId } = {}) {
  const resposta = await cliente.get(`/products/${encodeURIComponent(String(catalogoId ?? "").trim())}/items`, { limit: 1, offset: 0 });
  if (resposta.status === 404) return { total: 0, primeiro: null };
  if (!resposta.ok) throw falhou(resposta);
  const lista = resposta.dados?.results ?? [];
  return { total: Number(resposta.dados?.paging?.total ?? lista.length), primeiro: lista[0] ? itemDoCatalogo(lista[0], 1, meuSellerId) : null };
}

const MAIS_VENDIDOS_SUGERIDOS = 10;
const BUSCA_SUGERIDA = 10;
const PARA_A_SUGESTAO = new Set([401, 429]);

/**
 * Catalogos para o ranking, achados sozinhos (pedido do dono em 23/10/2026, opcao 1): os mais vendidos da categoria do
 * anuncio (`/highlights`, so os do tipo PRODUCT: "produto do vendedor" e "item" dao 403, medido em 23/10/2026) e a busca
 * pelo titulo, sem repetir e sem os de `excluir`. Cada um com o 1o colocado; catalogo sem anuncios (produto pai) sai.
 * Catalogo que falha sai; 401/429 lancam (a cota acabou: a tela diz). O dono escolhe quais entram.
 * @returns {Promise<{ id, nome, foto, maisVendido: number|null, daBusca: boolean, primeiro, total }[]>}
 */
export async function sugerirCatalogos(cliente, { categoriaId, titulo, excluir = [], meuSellerId } = {}) {
  const fora = new Set((excluir ?? []).map(String));
  const candidatos = new Map();
  if (categoriaId) {
    const destaques = await cliente.get(`/highlights/MLB/category/${encodeURIComponent(String(categoriaId).trim())}`);
    if (!destaques.ok && destaques.status !== 404) throw falhou(destaques);
    const produtos = (destaques.ok ? destaques.dados?.content ?? [] : []).filter((d) => d?.type === "PRODUCT").sort((a, b) => a.position - b.position);
    for (const d of produtos.slice(0, MAIS_VENDIDOS_SUGERIDOS)) {
      if (!fora.has(String(d.id))) candidatos.set(String(d.id), { id: String(d.id), nome: null, foto: null, maisVendido: d.position, daBusca: false });
    }
  }
  for (const achado of await buscarCatalogos(cliente, titulo, { limite: BUSCA_SUGERIDA })) {
    if (fora.has(achado.id)) continue;
    const ja = candidatos.get(achado.id);
    if (ja) Object.assign(ja, { nome: achado.nome, foto: achado.foto, daBusca: true });
    else candidatos.set(achado.id, { id: achado.id, nome: achado.nome, foto: achado.foto, maisVendido: null, daBusca: true });
  }

  const resultado = [];
  for (const candidato of candidatos.values()) {
    try {
      const lido = await lerPrimeiroDoCatalogo(cliente, candidato.id, { meuSellerId });
      if (!lido.primeiro) continue;
      if (candidato.nome === null) {
        // O mais vendido vem so com o id: o nome e a foto saem do proprio produto de catalogo.
        const produto = await cliente.get(`/products/${encodeURIComponent(candidato.id)}`);
        candidato.nome = produto.ok ? String(produto.dados?.name ?? "") : "";
        candidato.foto = produto.ok ? produto.dados?.pictures?.[0]?.url ?? null : null;
      }
      resultado.push({ ...candidato, primeiro: lido.primeiro, total: lido.total });
    } catch (erro) {
      if (PARA_A_SUGESTAO.has(erro?.status)) throw erro;
    }
  }
  return resultado;
}

/** Quantos vendedores diferentes ha entre os anuncios (um vendedor pode ter varios anuncios no mesmo catalogo). */
export function contarVendedores(itens) {
  return new Set((itens ?? []).map((item) => String(item.vendedorId))).size;
}

/**
 * Quantos anuncios e quantos vendedores o catalogo tem (pedido do dono em 22/10/2026). `completo` e falso quando o
 * catalogo passa do teto de leitura (150): os vendedores contados sao "ao menos".
 * @returns {Promise<{ anuncios: number, vendedores: number, completo: boolean }>}
 */
export async function resumoDoCatalogo(cliente, catalogoId) {
  const lido = await lerConcorrentesDoCatalogo(cliente, catalogoId);
  return { anuncios: lido.total, vendedores: contarVendedores(lido.itens), completo: lido.itens.length >= lido.total };
}

/** Cada catalogo da lista com o `resumo` (o que falhar fica com `null`, sem derrubar a lista). */
export async function comResumo(cliente, catalogos) {
  const resultado = [];
  for (const catalogo of catalogos ?? []) {
    const resumo = await resumoDoCatalogo(cliente, catalogo.id).catch(() => null);
    resultado.push({ ...catalogo, resumo });
  }
  return resultado;
}

/** "9 anúncios · 8 vendedores"; acima do teto de leitura, "150+ anúncios · ao menos N vendedores". */
export function textoDoResumo(resumo) {
  if (!resumo) return null;
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  if (!resumo.completo) return `150+ anúncios · ao menos ${plural(resumo.vendedores, "vendedor", "vendedores")}`;
  return `${plural(resumo.anuncios, "anúncio", "anúncios")} · ${plural(resumo.vendedores, "vendedor", "vendedores")}`;
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
