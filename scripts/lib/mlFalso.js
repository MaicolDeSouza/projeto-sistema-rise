/**
 * Mercado Livre FALSO para os testes da fase 2 do canal ML (plano de 08/10/2026).
 *
 * Nao e um servidor: e um objeto em memoria com o mesmo contrato do `clienteML()`
 * (`get`, `usuarioId`), porque as leituras de `src/lib/canaisDeVenda/ml/leitura.js` recebem o
 * cliente por parametro. Testa a mesma logica sem rede, sem token e sem banco. Por isso este
 * arquivo NAO importa nada de `src/`.
 *
 * Responde, no formato do `requisitar` (`{ ok, status, duracaoMs, dados }`), aos endpoints de
 * leitura da fase 2, com os formatos medidos na investigacao de 03/10/2026
 * (`docs/superpowers/investigacoes/2026-10-01-ml-bling-para-fases-2-e-3.md`, A1 a A5):
 *
 *   GET /users/me                                  GET /sites/MLB/domain_discovery/search?q=
 *   GET /categories/{id}                           GET /categories/{id}/attributes
 *   GET /sites/MLB/listing_prices                  GET /users/{id}/shipping_options/free
 *   GET /trends/MLB/{id}                           GET /items/{id}
 *   GET /products/search?q=                        GET /products/{id}
 *   GET /products/{id}/items                       GET /users/{id}  (concorrentes pelo catalogo, 21/10/2026)
 *
 * E as escritas da fase 3 (publicar): POST /items/validate, POST /pictures/items/upload,
 * POST /items, POST /items/{id}/description e PUT /items/{id}. Escrita sem `exigirEscrita(codigo)`
 * aceita antes LANCA, como no Bling falso. Opcoes: `codigosLiberados`, `falhas` (uma vez cada:
 * `{ metodo, caminho (prefixo), status, dados?, lancar? }`), `ignorarPausado` e `validacao`.
 *
 * Caminho que ele nao conhece LANCA um erro: e erro do teste ou do falso, e esconder isso
 * atras de um 404 faria o teste passar sem provar nada.
 */

const USUARIO_PADRAO = "212386247";

// Atributos crus de MLB99779, na forma de `/categories/{id}/attributes` (A2). A ordem e
// misturada de proposito: quem normaliza e que poe obrigatorios e condicionais na frente.
const ATRIBUTOS_DA_PLACA = [
  {
    id: "MICROCONTROLLER",
    name: "Microcontrolador",
    tags: {},
    value_type: "list",
    values: [
      { id: "9001", name: "ATmega328P" },
      { id: "9002", name: "ATmega2560" },
    ],
  },
  { id: "BRAND", name: "Marca", tags: { required: true, catalog_required: true }, value_type: "string" },
  {
    id: "GTIN",
    name: "Código universal de produto",
    tags: { multivalued: true, variation_attribute: true, conditional_required: true },
    value_type: "string",
    hint: "Pode ser um EAN, UPC ou outro GTIN",
  },
  { id: "PACKAGE_HEIGHT", name: "Altura da embalagem", tags: { hidden: true, read_only: true }, value_type: "number_unit" },
  { id: "MODEL", name: "Modelo", tags: { required: true, catalog_required: true }, value_type: "string" },
  { id: "SELLER_SKU", name: "SKU", tags: { hidden: true, variation_attribute: true }, value_type: "string" },
  {
    id: "EMPTY_GTIN_REASON",
    name: "Motivo de GTIN vazio",
    tags: { hidden: true, variation_attribute: true, conditional_required: true },
    value_type: "list",
    values: [
      { id: "17055158", name: "O produto é uma peça artesanal" },
      { id: "17055159", name: "O produto é um kit ou pack" },
      { id: "17055160", name: "O produto não tem código cadastrado" },
      { id: "17055161", name: "Outro motivo" },
    ],
  },
  {
    id: "INCLUDES_USB_CABLE",
    name: "Inclui cabo USB",
    tags: {},
    value_type: "boolean",
    values: [
      { id: "242085", name: "Sim" },
      { id: "242084", name: "Não" },
    ],
  },
  {
    id: "OPERATING_VOLTAGE",
    name: "Tensão de operação",
    tags: {},
    value_type: "number_unit",
    allowed_units: [{ id: "V", name: "V" }],
    hint: "Ex.: 5 V",
  },
  { id: "SELLER_PACKAGE_WEIGHT", name: "Peso do pacote", tags: { hidden: true }, value_type: "number_unit", allowed_units: [{ id: "g", name: "g" }] },
  { id: "IS_KIT", name: "É kit", tags: { hidden: true }, value_type: "boolean", values: [{ id: "242085", name: "Sim" }, { id: "242084", name: "Não" }] },
];

const CATEGORIAS_PADRAO = {
  MLB99779: {
    nome: "Placas de Microcontroladores",
    caminho: ["Eletrônicos, Áudio e Vídeo", "Componentes Eletrônicos", "Placas de Microcontroladores"],
    dominio: { id: "MLB-MICROCONTROLLER_BOARDS", nome: "Placas de microcontroladores" },
    folha: true,
    limiteTitulo: 60,
    maxFotos: 12,
    atributos: ATRIBUTOS_DA_PLACA,
  },
  MLB1648: {
    nome: "Informática",
    caminho: ["Informática"],
    dominio: { id: "MLB-COMPUTERS", nome: "Informática" },
    folha: false,
    limiteTitulo: 60,
    maxFotos: 12,
    atributos: [],
  },
};

// Os primeiros termos sao os observados em MLB99779 (A5); o resto completa os 40 da resposta real.
const TENDENCIAS_DA_PLACA = [
  "raspberry pi",
  "raspberry pi 4",
  "raspberry pi 5",
  "cardputer m5stack",
  "arduino uno",
  "kit arduino",
  "digispark",
  "arduino",
  ...Array.from({ length: 32 }, (_, indice) => `termo ${indice + 9}`),
];

const PADROES = {
  categorias: CATEGORIAS_PADRAO,
  descoberta: { "placa uno r3 ch340": ["MLB99779"] },
  // Classico 13% e Premium 18% (A3). Tarifa fixa so em Flex e ME1, abaixo do limite (TH).
  taxas: { percentualPorTipo: { gold_special: 13, gold_pro: 18 }, tarifaFixaPorLogistica: { self_service: 6.65, default: 6.65 }, limiteTH: 79 },
  // `listCostSemGratis`: o que o ML devolve com `free_shipping=false` (abaixo de R$ 79 e o que cobra do vendedor;
  // medido em 22/10/2026: 6,85 contra 12,95 com frete gratis).
  frete: { listCost: 8.15, listCostSemGratis: 6.85, billableWeight: 300 },
  tendencias: { MLB99779: TENDENCIAS_DA_PLACA },
  usuarioId: USUARIO_PADRAO,
};

const NOMES_DOS_TIPOS = { gold_special: "Clássico", gold_pro: "Premium" };

// Catalogo do 100101 como medido em 21/10/2026 (spec 2026-10-21-concorrentes-ml-catalogo-design.md, secao 2): 9 anuncios
// na ordem do ML, com o nosso (seller 212386247) em 4o. O MLB60092501 e um catalogo sem anuncios (404 em /items).
// `category_id` vem em cada anuncio do catalogo (medido em 22/10/2026): e a reserva da sugestao de categoria.
const anuncio = (item_id, seller_id, price, listing_type_id = "gold_special") => ({
  item_id, seller_id, price, original_price: null, listing_type_id, condition: "new", category_id: "MLB99779",
  shipping: { free_shipping: false, logistic_type: "xd_drop_off" },
});
const CATALOGOS_PADRAO = {
  MLB44072268: {
    nome: "Cabo USB compatível com placa de desenvolvimento Arduino Uno R3 ATmega328p Ch340",
    busca: "Placa Uno R3 CH340",
    dominio: "MLB-MICROCONTROLLER_BOARDS",
    fotos: ["https://http2.mlstatic.com/D_NQ_NP_822833-MLA95115011429_102025-F.jpg"],
    atributos: [
      { id: "MICROCONTROLLER", name: "Microcontrolador", value_name: "ATmega328P" },
      { id: "BRAND", name: "Marca", value_name: "Deirolab" },
      { id: "MODEL", name: "Modelo", value_name: "UNO R3 CH340" },
    ],
    itens: [
      anuncio("MLB5229650730", 141686451, 39.54),
      anuncio("MLB5434866561", 141686451, 39.54),
      anuncio("MLB4027538033", 632377333, 42.99),
      anuncio("MLB4191686159", 212386247, 49.9),
      anuncio("MLB5384989142", 23631289, 49.9),
      anuncio("MLB4790111510", 440060895, 55.8, "gold_pro"),
      anuncio("MLB4885507804", 710285816, 55.8, "gold_pro"),
      anuncio("MLB5202599258", 1005224757, 55.8, "gold_pro"),
      anuncio("MLB5000000001", 23631289, 58.9),
    ],
  },
  MLB60092501: { nome: "Kit de robótica sem anúncios abertos", dominio: "MLB-MICROCONTROLLER_BOARDS", fotos: [], atributos: [], itens: [] },
};
const VENDEDORES_PADRAO = {
  141686451: { nickname: "ARDU_ROBÓTICA EIRELI", level_id: "5_green", power_seller_status: "gold", total: 10343, city: "Juiz de Fora" },
  632377333: { nickname: "REIDOS ESPECIFICOS", level_id: "3_yellow", power_seller_status: null, total: 7924, city: "Curitiba" },
  23631289: { nickname: "LOJA DO MEIO", level_id: "4_light_green", power_seller_status: "silver", total: 2100, city: "Campinas" },
  440060895: { nickname: "PREMIUM UM", level_id: "5_green", power_seller_status: "platinum", total: 50000, city: "São Paulo" },
  710285816: { nickname: "PREMIUM DOIS", level_id: "5_green", power_seller_status: null, total: 1200, city: "Recife" },
  1005224757: { nickname: "PREMIUM TRES", level_id: "2_orange", power_seller_status: null, total: 40, city: "Natal" },
};

function resposta(status, dados) {
  return { ok: status >= 200 && status < 300, status, duracaoMs: 0, dados };
}

const naoAchou = (mensagem) => resposta(404, { message: mensagem, error: "not_found", status: 404 });
const duasCasas = (valor) => Math.round(valor * 100) / 100;

/// "/a?b=1" + { c: 2 } -> { rota: "/a", params: { b: "1", c: 2 } }. Valor vazio nao vai, como no cliente real.
function separar(caminho, params) {
  const texto = String(caminho);
  const indice = texto.indexOf("?");
  const rota = indice === -1 ? texto : texto.slice(0, indice);
  const juntos = {};
  if (indice !== -1) {
    for (const [chave, valor] of new URLSearchParams(texto.slice(indice + 1))) juntos[chave] = valor;
  }
  for (const [chave, valor] of Object.entries(params ?? {})) {
    if (valor !== undefined && valor !== null && valor !== "") juntos[chave] = valor;
  }
  return { rota, params: juntos };
}

/**
 * @param {object} [opcoes] cada chave mescla SOBRE o padrao (passar so `descoberta` mantem as
 *   categorias, as taxas e as tendencias padrao).
 */
export function criarMLFalso(opcoes = {}) {
  const estado = structuredClone({
    categorias: { ...PADROES.categorias, ...(opcoes.categorias ?? {}) },
    descoberta: { ...PADROES.descoberta, ...(opcoes.descoberta ?? {}) },
    taxas: {
      ...PADROES.taxas,
      ...(opcoes.taxas ?? {}),
      percentualPorTipo: { ...PADROES.taxas.percentualPorTipo, ...(opcoes.taxas?.percentualPorTipo ?? {}) },
      tarifaFixaPorLogistica: { ...PADROES.taxas.tarifaFixaPorLogistica, ...(opcoes.taxas?.tarifaFixaPorLogistica ?? {}) },
    },
    frete: { ...PADROES.frete, ...(opcoes.frete ?? {}) },
    tendencias: { ...PADROES.tendencias, ...(opcoes.tendencias ?? {}) },
    usuarioId: String(opcoes.usuarioId ?? PADROES.usuarioId),
    catalogos: { ...CATALOGOS_PADRAO, ...(opcoes.catalogos ?? {}) },
    vendedores: { ...VENDEDORES_PADRAO, ...(opcoes.vendedores ?? {}) },
    // Os anuncios do vendedor por SKU, para `/users/{id}/items/search?seller_sku=` e o `/items/{id}` deles.
    meusItens: opcoes.meusItens ?? {},
  });
  const chamadas = [];

  function descobrir(params) {
    const termo = String(params.q ?? "").trim().toLowerCase();
    const ids = estado.descoberta[termo] ?? [];
    return resposta(
      200,
      ids
        .filter((id) => estado.categorias[id])
        .map((id) => {
          const categoria = estado.categorias[id];
          return { domain_id: categoria.dominio.id, domain_name: categoria.dominio.nome, category_id: id, category_name: categoria.nome, attributes: [] };
        }),
    );
  }

  function lerCategoria(id) {
    const categoria = estado.categorias[id];
    if (!categoria) return naoAchou(`Category ${id} not found`);
    return resposta(200, {
      id,
      name: categoria.nome,
      path_from_root: categoria.caminho.map((nome, indice) => ({ id: `${id}-${indice}`, name: nome })),
      children_categories: categoria.folha ? [] : [{ id: `${id}1`, name: "Subcategoria", total_items_in_this_category: 1 }],
      settings: {
        max_title_length: categoria.limiteTitulo,
        max_pictures_per_item: categoria.maxFotos,
        item_conditions: ["not_specified", "used", "new"],
        listing_allowed: categoria.folha,
      },
    });
  }

  function tarifa(params) {
    const preco = Number(params.price);
    const { percentualPorTipo, tarifaFixaPorLogistica, limiteTH } = estado.taxas;
    const umTipo = (tipo) => {
      const percentual = percentualPorTipo[tipo] ?? 0;
      const fixa = preco < limiteTH ? (tarifaFixaPorLogistica[params.logistic_type] ?? 0) : 0;
      return {
        listing_type_id: tipo,
        listing_type_name: NOMES_DOS_TIPOS[tipo] ?? tipo,
        sale_fee_amount: duasCasas((preco * percentual) / 100 + fixa),
        sale_fee_details: { percentage_fee: percentual, fixed_fee: fixa, gross_amount: duasCasas((preco * percentual) / 100) },
        listing_fee_amount: 0,
        currency_id: "BRL",
      };
    };
    if (!(preco > 0)) return resposta(400, { message: "price is required", error: "bad_request", status: 400 });
    return resposta(200, params.listing_type_id ? umTipo(params.listing_type_id) : Object.keys(percentualPorTipo).map(umTipo));
  }

  function frete(usuario, params) {
    if (usuario !== estado.usuarioId) return resposta(403, { message: "forbidden", error: "forbidden", status: 403 });
    if (!/^\d+x\d+x\d+,\d+$/.test(String(params.dimensions ?? ""))) {
      return resposta(400, { message: "invalid dimensions", error: "bad_request", status: 400 });
    }
    return resposta(200, {
      coverage: {
        all_country: {
          list_cost: String(params.free_shipping) === "false" ? estado.frete.listCostSemGratis : estado.frete.listCost,
          currency_id: "BRL",
          billable_weight: estado.frete.billableWeight,
          free_shipping_by_meli: true,
        },
      },
    });
  }

  function tendencias(id) {
    const termos = estado.tendencias[id];
    if (!termos) return naoAchou(`Trends for ${id} not found`);
    return resposta(
      200,
      termos.map((keyword) => ({ keyword, url: `https://lista.mercadolivre.com.br/${keyword.replace(/\s+/g, "-")}` })),
    );
  }

  // ---- Escrita (fase 3) ----
  const codigosLiberados = (opcoes.codigosLiberados ?? []).map((codigo) => String(codigo).trim().toLowerCase());
  const falhas = (opcoes.falhas ?? []).map((falha) => ({ ...falha, usada: false }));
  const itens = new Map();
  const fotos = [];
  const escritas = [];
  let escritaLiberada = false;
  let contador = 2000000001;

  /// O mesmo recado da trava real (`exigirCodigoLiberado`), para o teste conferir o texto.
  function exigirEscrita(codigo) {
    const procurado = String(codigo ?? "").trim().toLowerCase();
    if (codigosLiberados.length > 0 && !codigosLiberados.includes(procurado)) {
      throw new Error(
        `Escrita bloqueada: o código ${codigo} não está na lista de códigos liberados (ML_PUBLICACAO_CODIGOS no .env). Nenhum dado foi enviado.`,
      );
    }
    escritaLiberada = true;
  }

  // Toda escrita passa aqui: sem exigirEscrita antes, LANCA (a publicacao tem que conferir as travas
  // antes de escrever); depois, a primeira falha programada que casar responde no lugar da rota.
  function antesDeEscrever(metodo, rota, corpo) {
    if (!escritaLiberada) throw new Error(`ML falso: ${metodo} ${rota} sem exigirEscrita(codigo) antes.`);
    escritas.push({ metodo, caminho: rota, corpo: structuredClone(corpo ?? null) });
    // `exato: true` casa so o caminho inteiro: "/items" por prefixo pegaria tambem "/items/validate".
    const casa = (item) => (item.exato ? rota === item.caminho : rota.startsWith(item.caminho));
    const falha = falhas.find((item) => !item.usada && item.metodo === metodo && casa(item));
    if (!falha) return null;
    falha.usada = true;
    if (falha.lancar) throw new Error("fetch failed (falha programada no ML falso)");
    return resposta(falha.status, falha.dados ?? { message: "falha programada", error: "erro", status: falha.status, cause: [] });
  }

  async function post(caminho, corpo) {
    const { rota } = separar(caminho);
    const falhou = antesDeEscrever("POST", rota, corpo);
    if (falhou) return falhou;

    if (rota === "/items/validate") {
      return opcoes.validacao ? resposta(opcoes.validacao.status, structuredClone(opcoes.validacao.dados)) : resposta(204, null);
    }
    if (rota === "/items") {
      // No modelo User Products o ML recusa `title`: ele gera o titulo a partir do family_name.
      if (corpo && "title" in corpo) {
        return resposta(400, {
          message: "title is not allowed for user products",
          error: "validation_error",
          status: 400,
          cause: [{ type: "error", code: "item.title.not_modifiable", message: "title is not allowed" }],
        });
      }
      const id = `MLB${contador++}`;
      const item = {
        id,
        status: corpo?.status === "paused" && !opcoes.ignorarPausado ? "paused" : "active",
        family_name: corpo?.family_name ?? null,
        title: corpo?.family_name ?? null,
        price: corpo?.price ?? null,
        category_id: corpo?.category_id ?? null,
        pictures: structuredClone(corpo?.pictures ?? []),
        permalink: `https://produto.mercadolivre.com.br/${id.replace("MLB", "MLB-")}-anuncio-_JM`,
        descricao: null,
      };
      itens.set(id, item);
      return resposta(201, structuredClone(item));
    }
    const partes = rota.match(/^\/items\/([^/]+)\/description$/);
    if (partes) {
      const item = itens.get(partes[1]);
      if (!item) return naoAchou(`Item ${partes[1]} not found`);
      item.descricao = corpo?.plain_text ?? null;
      return resposta(201, { text: "", plain_text: item.descricao });
    }
    throw new Error(`ML falso: POST ${rota} nao suportado`);
  }

  async function put(caminho, corpo) {
    const { rota } = separar(caminho);
    const falhou = antesDeEscrever("PUT", rota, corpo);
    if (falhou) return falhou;
    const partes = rota.match(/^\/items\/([^/]+)$/);
    if (!partes) throw new Error(`ML falso: PUT ${rota} nao suportado`);
    const item = itens.get(partes[1]);
    if (!item) return naoAchou(`Item ${partes[1]} not found`);
    Object.assign(item, corpo ?? {});
    return resposta(200, structuredClone(item));
  }

  async function upload(caminho, { bytes, nome, tipo } = {}) {
    const { rota } = separar(caminho);
    const falhou = antesDeEscrever("POST", rota, { nome, tipo, tamanho: bytes?.length ?? 0 });
    if (falhou) return falhou;
    if (rota !== "/pictures/items/upload") throw new Error(`ML falso: upload em ${rota} nao suportado`);
    const id = `999-MLB${contador++}_102026`;
    fotos.push({ id, nome });
    return resposta(200, {
      id,
      variations: [{ size: "1024x1024", url: `http://http2.mlstatic.com/D_NQ_NP_${id}-F.jpg`, secure_url: `https://http2.mlstatic.com/D_NQ_NP_${id}-F.jpg` }],
    });
  }

  // Concorrentes pelo catalogo (21/10/2026): a busca de produto de catalogo, o produto, os anuncios que competem nele e
  // o vendedor. A busca casa o termo sem caixa com o nome ou o `busca` do catalogo.
  function buscarCatalogos(params) {
    const termo = String(params.q ?? "").toLowerCase();
    const achados = Object.entries(estado.catalogos).filter(([, c]) => [c.nome, c.busca].some((texto) => String(texto ?? "").toLowerCase().includes(termo)));
    const limite = Number(params.limit ?? 10);
    const deslocamento = Number(params.offset ?? 0);
    return resposta(200, {
      keywords: params.q,
      paging: { total: achados.length, limit: limite, offset: deslocamento },
      results: achados.slice(deslocamento, deslocamento + limite).map(([id, c]) => ({
        id, catalog_product_id: id, name: c.nome, domain_id: c.dominio, status: "active",
        attributes: structuredClone(c.atributos ?? []), pictures: (c.fotos ?? []).map((url) => ({ url })),
      })),
    });
  }

  function itensDoCatalogo(id, params) {
    const catalogo = estado.catalogos[id];
    if (!catalogo || (catalogo.itens ?? []).length === 0) return naoAchou(`Product ${id} has no items`);
    const limite = Number(params.limit ?? 50);
    const deslocamento = Number(params.offset ?? 0);
    return resposta(200, {
      paging: { total: catalogo.itens.length, limit: limite, offset: deslocamento },
      results: structuredClone(catalogo.itens.slice(deslocamento, deslocamento + limite)),
    });
  }

  function vendedor(id) {
    const v = estado.vendedores[id];
    if (!v) return naoAchou(`User ${id} not found`);
    return resposta(200, {
      id: Number(id), nickname: v.nickname, permalink: `http://perfil.mercadolivre.com.br/${encodeURIComponent(v.nickname)}`,
      seller_reputation: { level_id: v.level_id ?? null, power_seller_status: v.power_seller_status ?? null, transactions: { total: v.total ?? 0 } },
      address: { city: v.city ?? null },
    });
  }

  async function get(caminho, params) {
    const pedido = separar(caminho, params);
    chamadas.push({ caminho: pedido.rota, params: pedido.params });
    const { rota } = pedido;

    // Falha programada tambem em leitura (o 429 da rodada diaria dos concorrentes), uma vez cada.
    const casaGet = (item) => (item.exato ? rota === item.caminho : rota.startsWith(item.caminho));
    const falhaGet = falhas.find((item) => !item.usada && item.metodo === "GET" && casaGet(item));
    if (falhaGet) {
      falhaGet.usada = true;
      if (falhaGet.lancar) throw new Error(`ML falso: queda programada em GET ${rota}`);
      return resposta(falhaGet.status, falhaGet.dados ?? { message: "Too many requests", status: falhaGet.status });
    }

    if (rota === "/products/search") return buscarCatalogos(pedido.params);
    let catalogo = rota.match(/^\/products\/([^/]+)\/items$/);
    if (catalogo) return itensDoCatalogo(decodeURIComponent(catalogo[1]), pedido.params);
    catalogo = rota.match(/^\/products\/([^/]+)$/);
    if (catalogo) {
      const id = decodeURIComponent(catalogo[1]);
      const c = estado.catalogos[id];
      return c
        ? resposta(200, { id, name: c.nome, domain_id: c.dominio, permalink: `https://www.mercadolivre.com.br/p/${id}`, attributes: structuredClone(c.atributos ?? []), pictures: (c.fotos ?? []).map((url) => ({ url })) })
        : naoAchou(`Product ${id} not found`);
    }
    const usuario = rota.match(/^\/users\/(\d+)$/);
    if (usuario) return vendedor(usuario[1]);
    if (/^\/users\/\d+\/items\/search$/.test(rota)) {
      const meus = estado.meusItens[String(pedido.params.seller_sku ?? "")] ?? [];
      return resposta(200, { results: meus.map((item) => item.id), paging: { total: meus.length } });
    }
    const meuItem = rota.match(/^\/items\/([^/]+)$/);
    if (meuItem && !itens.has(decodeURIComponent(meuItem[1]))) {
      const achado = Object.values(estado.meusItens).flat().find((item) => item.id === decodeURIComponent(meuItem[1]));
      if (achado) return resposta(200, structuredClone(achado));
    }

    if (rota === "/users/me") return resposta(200, { id: Number(estado.usuarioId), nickname: "LOJA FALSA", site_id: "MLB", tags: [] });
    if (rota === "/sites/MLB/domain_discovery/search") return descobrir(pedido.params);
    if (rota === "/sites/MLB/listing_prices") return tarifa(pedido.params);

    let partes = rota.match(/^\/categories\/([^/]+)\/attributes$/);
    if (partes) {
      const categoria = estado.categorias[decodeURIComponent(partes[1])];
      return categoria ? resposta(200, structuredClone(categoria.atributos)) : naoAchou("Category not found");
    }
    partes = rota.match(/^\/categories\/([^/]+)$/);
    if (partes) return lerCategoria(decodeURIComponent(partes[1]));
    partes = rota.match(/^\/users\/([^/]+)\/shipping_options\/free$/);
    if (partes) return frete(decodeURIComponent(partes[1]), pedido.params);
    partes = rota.match(/^\/items\/([^/]+)$/);
    if (partes) {
      const item = itens.get(decodeURIComponent(partes[1]));
      return item ? resposta(200, structuredClone(item)) : naoAchou(`Item ${partes[1]} not found`);
    }
    partes = rota.match(/^\/trends\/MLB\/([^/]+)$/);
    if (partes) return tendencias(decodeURIComponent(partes[1]));

    throw new Error(`ML falso: GET ${rota} nao suportado`);
  }

  return {
    get,
    usuarioId: async () => estado.usuarioId,
    post,
    put,
    upload,
    exigirEscrita,
    chamadas,
    escritas,
    itens,
    fotos,
    estado,
  };
}
