/**
 * Loja Integrada FALSA, em memoria, para os testes da sincronizacao (scripts/teste-li-sync.js).
 * Mesmo contrato do cliente real (`clienteLI()`): `get`, `post`, `put`, `exigirEscrita`, com
 * respostas `{ ok, status, duracaoMs, dados }`. Sem rede e sem imports de `src/`.
 *
 * Reproduz o que foi MEDIDO na LI real em 07/10/2026 (levantamento, secao 8):
 * - `POST /produto` com SKU repetido: 400 com `error[].sku` (nao 409, nao duplica);
 * - medida (altura, largura, profundidade) decimal: 400 com corpo vazio; nome acima de 255: 400;
 * - `PUT /produto/{id}` substitui o produto, mas `categorias` e `marca` AUSENTES ficam como
 *   estavam, e `categorias: []` / `marca: null` explicitos apagam;
 * - o PUT do produto IGNORA `seo_title`, `seo_description`, `icms_origin_code` e `production_type`;
 *   o SEO so muda por `PUT /seo/{id}`;
 * - `PUT /produto/{id}/alias` muda o `url` e mantem o `apelido`.
 *
 * Uma regra e MAIS DURA que a LI real, de proposito: PUT com chave so de leitura (precos,
 * estoque, imagens, url, seo...) da 400. A LI aceita, mas o Rise nunca pode mandar (devolver
 * preco e estoque lidos desfaria o Bling), e o teste tem que pegar o descuido.
 *
 * Toda escrita exige `exigirEscrita` antes: sem isso lanca, como prova de que o codigo de envio
 * passa pelas travas. `falhas` ({ "PUT /seo/61": 500 }) faz uma rota responder com erro.
 */

// Copia de CHAVES_SO_LEITURA de src/lib/canaisDeVenda/li/corpo.js (o falso nao importa de src/).
// Mudou la, muda aqui.
const CHAVES_SO_LEITURA = new Set([
  "id",
  "resource_uri",
  "url",
  "seo",
  "data_criacao",
  "data_modificacao",
  "imagem_principal",
  "imagens",
  "variacoes",
  "grades",
  "filhos",
  "preco_cheio",
  "preco_promocional",
  "preco_custo",
  "preco_sob_consulta",
  "estoque_gerenciado",
  "estoque_quantidade",
  "estoque_situacao_em_estoque",
  "estoque_situacao_sem_estoque",
  "produto_id_anymarket",
  "produto_id_sku_anymarket",
  "tags",
  "seo_title",
  "seo_description",
]);

// O PUT da LI aceita e ignora estas (medido): ficam como estavam.
const IGNORADAS_NO_PUT = new Set(["sku", "icms_origin_code", "production_type", "seo_title", "seo_description"]);

// Ausentes no PUT, ficam como estavam (medido); as demais gravaveis viram null.
const MANTIDAS_SE_AUSENTES = new Set(["categorias", "marca"]);

const GRAVAVEIS = [
  "nome",
  "apelido",
  "descricao_completa",
  "ncm",
  "gtin",
  "mpn",
  "peso",
  "altura",
  "largura",
  "profundidade",
  "url_video_youtube",
  "destaque",
  "ativo",
  "usado",
  "tipo",
  "removido",
  "bloqueado",
  "id_externo",
  "pai",
  "categorias",
  "marca",
];

const copia = (valor) => (valor === undefined ? undefined : JSON.parse(JSON.stringify(valor)));
const resposta = (status, dados) => ({ ok: status >= 200 && status < 300, status, duracaoMs: 0, dados: copia(dados) ?? null });
const idDaUri = (uri) => String(uri ?? "").split("/").filter(Boolean).at(-1);
const comApi = (uri) => (uri === null || uri === undefined ? uri : String(uri).replace(/^\/v1\//, "/api/v1/"));
const slugSimples = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function erroDeCampo(campo, mensagem) {
  return { error: [{ [campo]: mensagem }], error_message: "Um ou mais campos não são válidos." };
}

/** Medida decimal ou nome longo: o que a LI real recusa no POST e no PUT. */
function recusaDoCorpo(corpo) {
  for (const chave of ["altura", "largura", "profundidade"]) {
    const valor = corpo[chave];
    if (valor !== undefined && valor !== null && !Number.isInteger(Number(valor))) return resposta(400, null);
  }
  if (typeof corpo.nome === "string" && corpo.nome.length > 255) {
    return resposta(400, erroDeCampo("nome", `Certifique-se de que o valor tenha no máximo 255 caracteres (ele possui ${corpo.nome.length}).`));
  }
  return null;
}

function paginar(lista, params, caminho) {
  const limite = Number(params?.limit ?? 20);
  const inicio = Number(params?.offset ?? 0);
  const objetos = lista.slice(inicio, inicio + limite);
  const proximo = inicio + limite < lista.length ? `/api/v1${caminho}?limit=${limite}&offset=${inicio + limite}` : null;
  const anterior = inicio > 0 ? `/api/v1${caminho}?limit=${limite}&offset=${Math.max(0, inicio - limite)}` : null;
  return {
    meta: { limit: limite, offset: inicio, total_count: lista.length, next: proximo, previous: anterior },
    objects: objetos,
  };
}

export function criarLojaIntegradaFalsa({ produtos = [], marcas = [], categorias = [], seos = {}, falhas = {} } = {}) {
  const chamadas = [];
  let escritaLiberada = false;
  let proximoId = 900000;
  const tabelaSeo = new Map(Object.entries(seos).map(([id, seo]) => [String(id), { title: "", description: "", ...seo }]));
  const tabelaMarcas = marcas.map((m) => ({ ativo: true, apelido: slugSimples(m.nome), ...m, resource_uri: `/api/v1/marca/${m.id}` }));
  const tabelaCategorias = categorias.map((c) => ({ categoria_pai: null, ...c, resource_uri: `/api/v1/categoria/${c.id}` }));

  function novoSeo() {
    const id = String(++proximoId);
    tabelaSeo.set(id, { title: "", description: "" });
    return `/api/v1/seo/${id}`;
  }

  // Todo produto guardado tem a forma completa do detalhe real.
  function completo(produto) {
    const base = {
      id: produto.id,
      resource_uri: `/api/v1/produto/${produto.id}`,
      sku: null,
      nome: null,
      apelido: null,
      url: null,
      descricao_completa: null,
      tipo: "normal",
      ativo: true,
      removido: false,
      bloqueado: false,
      usado: false,
      destaque: false,
      ncm: null,
      gtin: null,
      mpn: null,
      peso: null,
      altura: null,
      largura: null,
      profundidade: null,
      marca: null,
      categorias: [],
      imagens: [],
      url_video_youtube: null,
      icms_origin_code: null,
      production_type: null,
      tags: [],
      preco_cheio: null,
      estoque_quantidade: 0,
      ...copia(produto),
    };
    if (!base.seo) base.seo = novoSeo();
    if (!tabelaSeo.has(idDaUri(base.seo))) tabelaSeo.set(idDaUri(base.seo), { title: "", description: "" });
    base.url = base.url ?? base.apelido;
    return base;
  }

  const tabelaProdutos = produtos.map(completo);

  // O detalhe mostra o SEO do recurso /seo, como a LI real.
  function detalhe(produto) {
    const seo = tabelaSeo.get(idDaUri(produto.seo)) ?? { title: "", description: "" };
    return { ...produto, seo_title: seo.title, seo_description: seo.description };
  }

  function exigirLiberada() {
    if (!escritaLiberada) throw new Error("LI falsa: escrita sem exigirEscrita");
  }

  function falhaSimulada(metodo, caminho) {
    const status = falhas[`${metodo} ${caminho}`];
    return status ? resposta(status, { detail: "falha simulada" }) : null;
  }

  function putDoProduto(produto, corpo) {
    const proibidas = Object.keys(corpo).filter((chave) => CHAVES_SO_LEITURA.has(chave));
    if (proibidas.length) return resposta(400, erroDeCampo(proibidas[0], "LI falsa: chave so de leitura no PUT"));
    const recusa = recusaDoCorpo(corpo);
    if (recusa) return recusa;
    for (const chave of Object.keys(corpo)) {
      if (!GRAVAVEIS.includes(chave) && !IGNORADAS_NO_PUT.has(chave)) throw new Error(`LI falsa: chave desconhecida no PUT: ${chave}`);
    }
    for (const chave of GRAVAVEIS) {
      if (chave in corpo) {
        if (chave === "categorias") produto.categorias = (corpo.categorias ?? []).map(comApi);
        else if (chave === "marca") produto.marca = comApi(corpo.marca);
        else produto[chave] = copia(corpo[chave]);
      } else if (!MANTIDAS_SE_AUSENTES.has(chave)) {
        produto[chave] = null;
      }
    }
    return resposta(200, detalhe(produto));
  }

  function postDoProduto(corpo) {
    const recusa = recusaDoCorpo(corpo);
    if (recusa) return recusa;
    const sku = String(corpo.sku ?? "").trim().toLowerCase();
    if (tabelaProdutos.some((p) => String(p.sku ?? "").trim().toLowerCase() === sku)) {
      return resposta(400, erroDeCampo("sku", "Erro de integridade, verifique se o SKU ou ID Externo estão duplicados."));
    }
    const caminhoDoProduto = `/${String(corpo.apelido ?? "").replace(/^\/+/, "") || slugSimples(corpo.nome)}`;
    const novo = completo({
      ...Object.fromEntries(Object.entries(corpo).filter(([chave]) => !CHAVES_SO_LEITURA.has(chave))),
      id: ++proximoId,
      ativo: corpo.ativo ?? false,
      apelido: caminhoDoProduto,
      url: caminhoDoProduto,
      categorias: (corpo.categorias ?? []).map(comApi),
      marca: comApi(corpo.marca ?? null),
      // Na medicao o POST foi sem os fiscais e eles vieram null; a falsa nao os grava.
      icms_origin_code: null,
      production_type: null,
    });
    tabelaProdutos.push(novo);
    return resposta(201, detalhe(novo));
  }

  async function chamar(metodo, caminhoCompleto, { params, corpo } = {}) {
    const [caminho] = String(caminhoCompleto).split("?");
    chamadas.push({ metodo, caminho, params: copia(params) ?? null, corpo: copia(corpo) ?? null });
    if (metodo !== "GET") exigirLiberada();
    const simulada = falhaSimulada(metodo, caminho);
    if (simulada) return simulada;

    const [recurso, id, sub] = caminho.split("/").filter(Boolean);
    const produto = recurso === "produto" && id ? tabelaProdutos.find((p) => String(p.id) === String(id)) : null;
    const naoAchou = resposta(404, { detail: "Not found" });

    if (metodo === "GET") {
      if (recurso === "produto" && !id) {
        const sku = params?.sku === undefined ? null : String(params.sku).trim().toLowerCase();
        const lista = tabelaProdutos.filter((p) => sku === null || String(p.sku ?? "").trim().toLowerCase() === sku).map(detalhe);
        return resposta(200, paginar(lista, params, "/produto"));
      }
      if (recurso === "produto" && id && !sub) return produto ? resposta(200, detalhe(produto)) : naoAchou;
      if (recurso === "seo" && id) {
        const seo = tabelaSeo.get(String(id));
        return seo ? resposta(200, { id: Number(id), resource_uri: `api/v1/seo/${id}`, ...seo }) : naoAchou;
      }
      if (recurso === "marca" && !id) return resposta(200, paginar(tabelaMarcas, params, "/marca"));
      if (recurso === "marca" && id) {
        const marca = tabelaMarcas.find((m) => String(m.id) === String(id));
        return marca ? resposta(200, marca) : naoAchou;
      }
      if (recurso === "categoria" && !id) return resposta(200, paginar(tabelaCategorias, params, "/categoria"));
      if (recurso === "categoria" && id) {
        const categoria = tabelaCategorias.find((c) => String(c.id) === String(id));
        return categoria ? resposta(200, categoria) : naoAchou;
      }
    }

    if (metodo === "POST" && recurso === "produto" && !id) return postDoProduto(corpo ?? {});

    if (metodo === "POST" && recurso === "marca" && !id) {
      const nova = { id: ++proximoId, ativo: true, nome: corpo?.nome, apelido: corpo?.apelido ?? slugSimples(corpo?.nome) };
      nova.resource_uri = `/api/v1/marca/${nova.id}`;
      tabelaMarcas.push(nova);
      return resposta(201, nova);
    }

    if (metodo === "PUT" && recurso === "produto" && id && sub === "alias") {
      if (!produto) return naoAchou;
      produto.url = corpo?.absolute_path ?? produto.url;
      return resposta(200, { absolute_path: produto.url });
    }

    if (metodo === "PUT" && recurso === "produto" && id && !sub) return produto ? putDoProduto(produto, corpo ?? {}) : naoAchou;

    if (metodo === "PUT" && recurso === "seo" && id) {
      const seo = tabelaSeo.get(String(id));
      if (!seo) return naoAchou;
      if (corpo?.title !== undefined) seo.title = corpo.title;
      if (corpo?.description !== undefined) seo.description = corpo.description;
      return resposta(200, { id: Number(id), resource_uri: `api/v1/seo/${id}`, ...seo });
    }

    throw new Error(`LI falsa: endpoint desconhecido ${metodo} ${caminhoCompleto}`);
  }

  return {
    get: (caminho, params) => chamar("GET", caminho, { params }),
    post: (caminho, corpo) => chamar("POST", caminho, { corpo }),
    put: (caminho, corpo) => chamar("PUT", caminho, { corpo }),
    exigirEscrita(sku) {
      chamadas.push({ metodo: "TRAVA", caminho: null, params: { sku }, corpo: null });
      escritaLiberada = true;
    },
    chamadas,
    produtos: () => tabelaProdutos.map((p) => copia(detalhe(p))),
    marcas: () => copia(tabelaMarcas),
    seos: () => Object.fromEntries([...tabelaSeo.entries()].map(([id, seo]) => [id, copia(seo)])),
  };
}
