import { prisma } from "@/lib/db";
import { clienteML } from "@/lib/canaisDeVenda/ml/cliente";
import { mascararDadosPessoais } from "@/lib/riseAi/mascarar";

import { limiteDaPergunta, unidadesDoKitDoAnuncio } from "./banco";
import { etiquetaDoAnuncio } from "./etiquetas";
import { linkDoMercadoLivre } from "./filtro";

/**
 * O CONTEXTO de uma pergunta do ML: tudo o que a IA do Rise (e o assistente do dono, pelo MCP) recebe para redigir a
 * resposta (spec 2026-11-24-atendimento-ml-design.md, "A sugestao da IA").
 *
 * O que entra: a pergunta (mascarada), o anuncio perguntado como esta no ML, o produto do Rise so com os campos publicos
 * (os mesmos da visao `ia_produto_publico` do chat da loja), os OUTROS anuncios do mesmo produto que estao ativos e com
 * disponibilidade (cada um com a etiqueta que vira link) e ate 10 respostas ja dadas naquele anuncio (o tom do dono).
 *
 * O que NUNCA entra: custo, fornecedor, margem, localizacao, quantidade em estoque (so "disponivel": sim/nao) e qualquer
 * dado pessoal do comprador. O teste varre as chaves do resultado para garantir.
 *
 * So LEITURA do ML e do banco.
 */

const LIMITE_DO_TEXTO = 4000;
const MAXIMO_DE_LINHAS_DA_FICHA = 40;
const MAXIMO_DE_RESPONDIDAS = 10;
const MAXIMO_DE_OUTROS = 20;

const mascarar = (texto) => mascararDadosPessoais(String(texto ?? "")).texto;
const cortar = (texto, limite = LIMITE_DO_TEXTO) => String(texto ?? "").trim().slice(0, limite);
const preco = (valor) => (Number.isFinite(Number(valor)) && valor !== null ? Number(valor) : null);
const disponivelNoML = (item) => item?.status === "active" && Number(item?.available_quantity) > 0;

function fichaDoItem(item) {
  return (Array.isArray(item?.attributes) ? item.attributes : [])
    .filter((atributo) => atributo?.name && atributo?.value_name)
    .slice(0, MAXIMO_DE_LINHAS_DA_FICHA)
    .map((atributo) => ({ nome: String(atributo.name), valor: String(atributo.value_name) }));
}

async function lerItem(ml, itemId) {
  if (!itemId) return { item: null, descricao: "" };
  const [resposta, descricao] = await Promise.all([ml.get(`/items/${itemId}`), ml.get(`/items/${itemId}/description`).catch(() => null)]);
  return { item: resposta?.ok ? resposta.dados : null, descricao: descricao?.ok ? cortar(descricao.dados?.plain_text) : "" };
}

/** Os outros anuncios ML do produto, ativos no Rise E com disponibilidade conferida no ML agora. */
async function outrosAnunciosDoProduto(ml, produtoId, itemPerguntado) {
  if (!produtoId) return [];
  const doRise = await prisma.anuncio.findMany({
    where: { produtoId, canal: "MERCADO_LIVRE", status: "PUBLICADO", situacaoCanal: "ATIVA", idExterno: { not: null }, urlExterna: { not: null } },
    orderBy: { criadoEm: "asc" },
    take: MAXIMO_DE_OUTROS,
    select: { idExterno: true, urlExterna: true, titulo: true, dados: true },
  });
  const candidatos = doRise.filter((a) => a.idExterno !== itemPerguntado && linkDoMercadoLivre(a.urlExterna));
  if (candidatos.length === 0) return [];
  // Sem a conferencia no ML nao da para afirmar que ha estoque: melhor nao indicar nenhum.
  const lidos = await ml.get("/items", { ids: candidatos.map((a) => a.idExterno).join(","), attributes: "id,title,price,available_quantity,status" }).catch(() => null);
  if (!lidos?.ok || !Array.isArray(lidos.dados)) return [];
  const porId = new Map(lidos.dados.filter((linha) => linha?.code === 200 && linha.body?.id).map((linha) => [String(linha.body.id), linha.body]));
  return candidatos
    .filter((a) => disponivelNoML(porId.get(a.idExterno)))
    .map((a) => {
      const item = porId.get(a.idExterno);
      return { etiqueta: etiquetaDoAnuncio(a.idExterno), itemId: a.idExterno, url: a.urlExterna, titulo: cortar(item.title || a.titulo, 200), unidadesDoKit: unidadesDoKitDoAnuncio(a.dados), preco: preco(item.price) };
    })
    .sort((a, b) => a.unidadesDoKit - b.unidadesDoKit);
}

async function respondidasDoAnuncio(ml, itemId) {
  if (!itemId) return [];
  const resposta = await ml.get("/questions/search", { item: itemId, status: "ANSWERED", api_version: 4, limit: MAXIMO_DE_RESPONDIDAS, sort_fields: "date_created", sort_types: "DESC" }).catch(() => null);
  if (!resposta?.ok) return [];
  return (resposta.dados?.questions ?? [])
    .filter((p) => String(p?.text ?? "").trim() && String(p?.answer?.text ?? "").trim() && p.answer.status !== "BANNED")
    .slice(0, MAXIMO_DE_RESPONDIDAS)
    .map((p) => ({ pergunta: cortar(mascarar(p.text), 600), resposta: cortar(mascarar(p.answer.text), 1200) }));
}

/**
 * @param {string} id o id do `AtendimentoML`
 * @returns {Promise<null | { pergunta: string, limite: number, anuncio: object, produto: object | null, outrosAnuncios: object[], respondidas: object[], avisos: string[] }>}
 */
export async function montarContexto(id, { ml = clienteML() } = {}) {
  const linha = await prisma.atendimentoML.findUnique({ where: { id: String(id ?? "") } });
  if (!linha) return null;

  const [doRise, { item, descricao }, respondidas, limite] = await Promise.all([
    linha.anuncioId ? prisma.anuncio.findUnique({ where: { id: linha.anuncioId }, select: { titulo: true, dados: true, urlExterna: true } }) : null,
    lerItem(ml, linha.itemId),
    respondidasDoAnuncio(ml, linha.itemId),
    limiteDaPergunta(),
  ]);
  const produto = linha.produtoId ? await prisma.produto.findUnique({ where: { id: linha.produtoId }, select: { sku: true, tituloBase: true, marca: true, modelo: true, descricaoBase: true } }) : null;

  const urlDoPerguntado = doRise?.urlExterna && linkDoMercadoLivre(doRise.urlExterna) ? doRise.urlExterna : null;
  const avisos = [];
  if (!produto) avisos.push("produto-fora-do-rise");
  if (!item) avisos.push("anuncio-nao-lido");

  return {
    pergunta: cortar(mascarar(linha.textoDoCliente), 2000),
    limite,
    anuncio: {
      itemId: linha.itemId,
      // A etiqueta do proprio anuncio: o comprador pode pedir "o link deste".
      etiqueta: urlDoPerguntado ? etiquetaDoAnuncio(linha.itemId) : null,
      url: urlDoPerguntado,
      titulo: cortar(item?.title || doRise?.titulo || "", 200),
      preco: preco(item?.price ?? null),
      disponivel: item ? disponivelNoML(item) : null,
      unidadesDoKit: unidadesDoKitDoAnuncio(doRise?.dados),
      ficha: fichaDoItem(item),
      descricao,
    },
    produto: produto ? { codigo: produto.sku, nome: produto.tituloBase, marca: produto.marca ?? null, modelo: produto.modelo ?? null, descricao: cortar(produto.descricaoBase) } : null,
    outrosAnuncios: await outrosAnunciosDoProduto(ml, linha.produtoId, linha.itemId),
    respondidas,
    avisos,
  };
}

/** Os anuncios que a resposta pode indicar por etiqueta: os outros do produto e o proprio perguntado. */
export function anunciosIndicaveis(contexto) {
  const lista = (contexto?.outrosAnuncios ?? []).map((a) => ({ itemId: a.itemId, url: a.url }));
  if (contexto?.anuncio?.url) lista.push({ itemId: contexto.anuncio.itemId, url: contexto.anuncio.url });
  return lista;
}

/** O mesmo contexto SEM os enderecos (a IA so ve etiquetas; o endereco entra na troca, depois). */
export function contextoSemEnderecos(contexto) {
  if (!contexto) return contexto;
  const { url: _url, ...anuncio } = contexto.anuncio;
  return { ...contexto, anuncio, outrosAnuncios: contexto.outrosAnuncios.map(({ url: _u, ...resto }) => resto) };
}
