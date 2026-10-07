import { exigirCodigoLiberado } from "@/lib/blingSync/cliente";
import { config } from "@/lib/integracoes/config";
import { normalizarProdutoLojaIntegrada } from "@/lib/integracoes/lojaIntegrada/normalizadores";
import { paginarLojaIntegrada } from "@/lib/integracoes/lojaIntegrada/paginacao";
import { lerConfigCanal } from "../configuracao";
import { anuncioLIDoProduto, contextoDoProduto, documentosDoProduto, rascunhoDoAnuncio, vincularPeloSku } from "./banco";
import { CAMPOS_DE_ENVIO_LI, TEXTO_DO_TIPO_PRODUCAO, avisosFiscaisLI, diferencasLI, normalizarDaLI, normalizarDoRiseLI } from "./campos";
import { clienteLI } from "./cliente";

/**
 * Leitura da Loja Integrada para o pop-up e para o envio: o produto sob o SKU, o detalhe (com SEO
 * e marca), as categorias e as marcas da loja. So le: nada aqui chama `exigirEscrita`. O vinculo
 * pelo SKU (gravar `idExterno` no Rise) e a unica escrita, e e no banco do Rise, nao na LI.
 *
 * O cliente entra por parametro (`clienteLI()` por padrao): o teste passa a LI falsa.
 */

/// Erro com a mensagem pronta para a tela (HTTP da LI traduzido).
class ErroDaLI extends Error {}

function erroDaLI(status, dados) {
  if (status === 429) {
    return new ErroDaLI("A Loja Integrada recusou a leitura por limite de chamadas (100 chamadas por minuto na loja). Tente de novo em alguns instantes.");
  }
  if (status === 401 || status === 403) {
    return new ErroDaLI("A Loja Integrada recusou o acesso: confira ou renove o Personal Token em Integracoes.");
  }
  if (status >= 500) return new ErroDaLI(`A Loja Integrada esta com problema (HTTP ${status}). Tente de novo em alguns instantes.`);
  const detalhe = dados?.error_message ?? dados?.detail ?? null;
  return new ErroDaLI(`A Loja Integrada recusou a leitura (HTTP ${status}${detalhe ? `): ${detalhe}` : ")"}.`);
}

function exigirResposta(resposta) {
  if (resposta?.ok) return resposta.dados;
  throw erroDaLI(resposta?.status, resposta?.dados);
}

/** Texto para a tela; o `ErroLojaIntegrada` da paginacao do handoff carrega o status HTTP. */
export function textoDoErroLI(erro) {
  if (erro instanceof ErroDaLI) return erro.message;
  if (erro?.status) return erroDaLI(erro.status, null).message;
  return `Nao foi possivel ler a Loja Integrada: ${erro?.message ?? erro}`;
}

const chave = (texto) => String(texto ?? "").trim().toLowerCase();
const idDaUri = (uri) => {
  const id = String(uri ?? "").split("/").filter(Boolean).at(-1);
  return id ? String(id) : null;
};

/** O link do produto na loja: o dominio (LI_DOMINIO) mais o caminho atual. Sem dominio, so o caminho. */
export function urlNaLoja(caminho) {
  if (!caminho) return null;
  const dominio = String(config.lojaIntegrada.dominio ?? "").trim().replace(/\/+$/, "");
  if (!dominio) return caminho;
  const base = /^https?:\/\//i.test(dominio) ? dominio : `https://${dominio}`;
  return `${base}${caminho.startsWith("/") ? "" : "/"}${caminho}`;
}

/**
 * O produto da LI sob este SKU, pelo filtro `?sku=` (medido em 07/10/2026: filtra). Confere o SKU
 * de volta sem caixa. Dois ativos com o mesmo SKU = `duplicado` (o Rise nao escolhe); so na
 * lixeira = `removido` (cadastrar de novo duplicaria). Falha HTTP LANCA: devolver `nao_existe`
 * num erro faria o pop-up oferecer "Cadastrar" um produto que talvez exista.
 */
export async function buscarNaLI(cliente, sku) {
  const procurado = chave(sku);
  if (!procurado) return { situacao: "nao_existe" };
  const dados = exigirResposta(await cliente.get("/produto", { sku: String(sku).trim(), limit: 20 }));
  const mesmos = (dados?.objects ?? []).filter((p) => chave(p.sku) === procurado);
  const vivos = mesmos.filter((p) => !p.removido);
  if (vivos.length > 1) return { situacao: "duplicado", quantidade: vivos.length };
  if (vivos.length === 1) return { situacao: "existe", id: vivos[0].id, produto: vivos[0] };
  if (mesmos.length) return { situacao: "removido", id: mesmos[0].id, produto: mesmos[0] };
  return { situacao: "nao_existe" };
}

/** O detalhe com a descricao completa, o SEO do recurso proprio e o nome da marca. */
export async function lerDetalheDaLI(cliente, id) {
  const produto = exigirResposta(await cliente.get(`/produto/${id}`, { descricao_completa: 1 }));
  const idSeo = idDaUri(produto.seo);
  const seo = idSeo ? exigirResposta(await cliente.get(`/seo/${idSeo}`)) : null;
  const idMarca = idDaUri(produto.marca);
  const marca = idMarca ? exigirResposta(await cliente.get(`/marca/${idMarca}`)) : null;
  return { produto, seo, marcaNome: marca?.nome ?? null };
}

async function listarTodos(cliente, caminho) {
  const itens = [];
  for await (const pagina of paginarLojaIntegrada({ cliente, caminho, params: { limit: 100 } })) itens.push(...pagina.objetos);
  return itens;
}

/** Todas as categorias da loja, com o caminho "Pai > Filha" para a arvore do editor. */
export async function listarCategoriasDaLI(cliente) {
  const brutas = await listarTodos(cliente, "/categoria");
  const porId = new Map(brutas.map((c) => [String(c.id), { id: String(c.id), nome: c.nome ?? "", paiId: idDaUri(c.categoria_pai) }]));
  const caminhoDe = (categoria, vistos = new Set()) => {
    // Pai que nao existe na lista (ou ciclo) encerra o caminho, em vez de travar a tela.
    const pai = categoria.paiId && !vistos.has(categoria.paiId) ? porId.get(categoria.paiId) : null;
    if (!pai) return categoria.nome;
    vistos.add(categoria.id);
    return `${caminhoDe(pai, vistos)} > ${categoria.nome}`;
  };
  return [...porId.values()].map((c) => ({ ...c, caminho: caminhoDe(c) }));
}

export async function listarMarcasDaLI(cliente) {
  const brutas = await listarTodos(cliente, "/marca");
  return brutas.map((m) => ({ id: String(m.id), nome: m.nome ?? "", uri: m.resource_uri ?? `/api/v1/marca/${m.id}` }));
}

/** Marca sem caixa e sem acento: "Arduino", "ARDUINO" e "Arduíno" sao a mesma. */
export function mesmaMarca(a, b) {
  const limpar = (texto) => String(texto ?? "").normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
  return limpar(a) !== "" && limpar(a) === limpar(b);
}

/** As duas travas, so para a tela dizer se o envio esta liberado (ler nao escreve). */
export function escritaDoProduto(sku) {
  if (!config.travas.liEscrita) {
    return {
      liberada: false,
      motivo: "A escrita na Loja Integrada esta desligada (LI_ESCRITA esta false no .env): a leitura funciona, mas nada sera enviado.",
    };
  }
  try {
    exigirCodigoLiberado(sku, config.travas.liCodigosLiberados, "LI_ESCRITA_CODIGOS");
    return { liberada: true, motivo: null };
  } catch {
    return { liberada: false, motivo: `O codigo ${sku} nao esta na lista de codigos liberados para escrita (LI_ESCRITA_CODIGOS no .env).` };
  }
}

const origemEmTexto = (valor) => (valor === null || valor === undefined ? "vazia" : String(valor));
const tipoEmTexto = (valor) => (valor ? TEXTO_DO_TIPO_PRODUCAO[valor] ?? valor : "vazio");

/** Origem e tipo de producao viram frase: a API nao os grava, entao o dono ajusta no painel. */
function textosDosAvisosFiscais(avisos) {
  return avisos.map((aviso) => {
    const emTexto = aviso.campo === "origem" ? origemEmTexto : tipoEmTexto;
    if (aviso.tipo === "vazioNaLI") {
      return `${aviso.rotulo}: vazio na Loja Integrada (no Rise: ${emTexto(aviso.rise)}); a NF-e usara o padrao do emissor. A API nao grava este campo: ajuste no painel da Loja Integrada.`;
    }
    return `${aviso.rotulo}: a Loja Integrada tem ${emTexto(aviso.li)} e o Rise tem ${emTexto(aviso.rise)}. A API nao grava este campo: ajuste no painel da Loja Integrada.`;
  });
}

function resultado(campos) {
  return {
    ok: false,
    sku: "",
    conferido: false,
    situacao: null,
    anuncioId: null,
    idExterno: null,
    urlExterna: null,
    vinculadoAgora: false,
    marcaExisteNaLI: null,
    diferencas: [],
    iguais: 0,
    avisos: [],
    escrita: { liberada: false, motivo: null },
    ...campos,
  };
}

/**
 * Tudo o que o pop-up mostra, numa leitura. Nunca lanca: falha volta como `ok: false` com `erro`.
 * Produto nao Conferido responde sem chamar a LI. Na primeira abertura de um produto que ja existe
 * na LI (sem `idExterno` guardado), o vinculo e gravado (`vincularPeloSku`): slug, categorias e
 * destaque vem da loja para o rascunho.
 */
export async function lerParaPopupLI(produtoId, cliente = clienteLI()) {
  let produto = null;
  try {
    produto = await contextoDoProduto(produtoId);
    if (!produto) return resultado({ erro: "Produto nao encontrado." });
    const base = { sku: produto.sku, conferido: Boolean(produto.conferido), escrita: escritaDoProduto(produto.sku) };
    if (!produto.conferido) return resultado({ ...base, ok: true });

    const busca = await buscarNaLI(cliente, produto.sku);
    if (busca.situacao === "removido") {
      return resultado({ ...base, situacao: "removido", erro: `O codigo ${produto.sku} esta na lixeira da Loja Integrada: restaure-o la antes de sincronizar.` });
    }
    if (busca.situacao === "duplicado") {
      return resultado({ ...base, situacao: "duplicado", erro: `Ha mais de um produto com o codigo ${produto.sku} na Loja Integrada. Deixe um so antes de sincronizar.` });
    }

    let anuncio = await anuncioLIDoProduto(produtoId);
    if (busca.situacao === "nao_existe") {
      return resultado({ ...base, ok: true, situacao: "nao_existe", anuncioId: anuncio?.id ?? null });
    }

    const detalhe = await lerDetalheDaLI(cliente, busca.id);
    const li = normalizarDaLI(detalhe.produto, detalhe.seo, { marcaNome: detalhe.marcaNome });
    let vinculadoAgora = false;
    const avisos = [];
    if (!anuncio?.idExterno) {
      const normalizado = normalizarProdutoLojaIntegrada(detalhe.produto);
      await vincularPeloSku(produtoId, {
        idItemExterno: normalizado.idItemExterno,
        url: urlNaLoja(normalizado.url ?? normalizado.apelido),
        ativo: normalizado.ativo,
        slug: li.slug,
        categorias: li.categorias,
        destaque: li.destaque,
      });
      anuncio = await anuncioLIDoProduto(produtoId);
      vinculadoAgora = true;
    } else if (String(anuncio.idExterno) !== String(busca.id)) {
      avisos.push(`O produto deste codigo na Loja Integrada mudou de id (o Rise guardou ${anuncio.idExterno}, a loja tem ${busca.id}).`);
    }

    const [{ frases }, documentos] = await Promise.all([lerConfigCanal("LOJA_INTEGRADA"), documentosDoProduto(produto)]);
    const rise = normalizarDoRiseLI(produto, rascunhoDoAnuncio(anuncio), { frases, documentos });
    // Categoria do rascunho que sumiu da loja sai do envio (`envio.js`); aqui ela sai da comparacao
    // tambem, senao o pop-up mostraria "Categorias: diferente" para sempre com o Sincronizar dizendo
    // "nada para enviar". Vira aviso, para o dono tira-la do anuncio.
    let comparado = rise;
    if (rise.categorias.length) {
      const vivas = new Set((await listarCategoriasDaLI(cliente)).map((categoria) => categoria.id));
      const mortas = rise.categorias.filter((id) => !vivas.has(id));
      if (mortas.length) {
        comparado = { ...rise, categorias: rise.categorias.filter((id) => vivas.has(id)) };
        avisos.push(`Categoria que nao existe mais na loja: ${mortas.join(", ")}. Ela fica fora do envio; tire-a no anuncio.`);
      }
    }
    const diferencas = diferencasLI(comparado, li);
    avisos.push(...textosDosAvisosFiscais(avisosFiscaisLI(rise, li)));

    let marcaExisteNaLI = null;
    if (rise.marca) {
      marcaExisteNaLI = mesmaMarca(rise.marca, li.marca) || (await listarMarcasDaLI(cliente)).some((m) => mesmaMarca(m.nome, rise.marca));
      if (!marcaExisteNaLI) avisos.push(`A marca ${rise.marca} nao existe na Loja Integrada: o Sincronizar a cria.`);
    }

    return resultado({
      ...base,
      ok: true,
      situacao: "existe",
      anuncioId: anuncio.id,
      idExterno: anuncio.idExterno,
      urlExterna: anuncio.urlExterna,
      vinculadoAgora,
      marcaExisteNaLI,
      diferencas,
      iguais: CAMPOS_DE_ENVIO_LI.length - diferencas.length,
      avisos,
    });
  } catch (erro) {
    return resultado({
      sku: produto?.sku ?? "",
      conferido: Boolean(produto?.conferido),
      escrita: produto ? escritaDoProduto(produto.sku) : { liberada: false, motivo: null },
      erro: textoDoErroLI(erro),
    });
  }
}
