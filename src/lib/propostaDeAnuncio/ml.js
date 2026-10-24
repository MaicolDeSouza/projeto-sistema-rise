import { prisma } from "@/lib/db";
import { problemasDosAtributos } from "@/lib/canaisDeVenda/ml/atributos";
import { contextoDosProdutos, carregarAnuncioML, novoRascunhoML, salvarRascunhoML } from "@/lib/canaisDeVenda/ml/banco";
import { catalogosDosMeusAnuncios, lerPrimeiroDoCatalogo, sugerirCatalogos } from "@/lib/canaisDeVenda/ml/catalogo";
import { sugerirCategoria } from "@/lib/canaisDeVenda/ml/inteligencia";
import { lerCategoriaCompleta } from "@/lib/canaisDeVenda/ml/leitura";
import { lerReferenciasML } from "@/lib/canaisDeVenda/ml/referencias";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";
import { aplicarProposta, montarProposta } from "./preencher";
import { precoDaPropostaML } from "./preco";
import { VERSAO_ROTEIRO_ML } from "./roteiros";
import { exigirProdutoPronto } from "./situacao";

/**
 * A proposta do anuncio do Mercado Livre (spec 2026-10-23, Entrega 2): categoria, titulo, ficha, os catalogos sugeridos
 * e o preco calculado pelo Rise. So GET no ML; grava so no rascunho do `Anuncio` do Rise (sempre um Classico). Nada vai
 * ao ranking (`CatalogoReferenciaML`): a proposta SUGERE os catalogos, o dono adiciona. Os links achados quando nao ha
 * catalogo ficam so na proposta.
 */

const CANAL = "MERCADO_LIVRE";
const CLASSICO = "gold_special";
export const MAXIMO_DE_CATALOGOS = 10;
export const MINIMO_DE_ANUNCIOS = 5;
const MAXIMO_DE_LINKS = 5;
// A proposta nunca chama a IA paga do Rise: a sugestao de categoria roda so com o ML e a reserva pelo catalogo.
const SEM_IA = { escolher: async () => null, termos: async () => [] };
// O GTIN nao se deduz (e da peca): fica fora da LLM, como na ficha da fase 2.
const SO_DO_DONO = new Set(["GTIN", "EMPTY_GTIN_REASON", "SELLER_SKU"]);
const PARA_A_LEITURA = new Set([401, 429]);

async function produtoPeloSku(sku) {
  const achado = await prisma.produto.findUnique({ where: { sku }, select: { id: true, tipo: true } });
  if (!achado) throw new ErroDeFerramenta(`Produto ${sku} não encontrado.`);
  return { ...(await contextoDosProdutos([achado.id]))[achado.id], tipo: achado.tipo };
}

const ehComposicao = (produto) => produto.tipo === "COMPOSICAO";
const limparTitulo = (texto) => String(texto ?? "").replace(/\s+/g, " ").trim();

const meuVendedor = async (cliente) => (typeof cliente.usuarioId === "function" ? cliente.usuarioId().catch(() => null) : null);
const doCatalogo = (catalogo) => ({ id: catalogo.id, nome: catalogo.nome, total: catalogo.total, primeiro: catalogo.primeiro ? { preco: catalogo.primeiro.preco, meu: Boolean(catalogo.primeiro.meu) } : null });

export async function lerParaPropostaML(cliente, sku) {
  const produto = await produtoPeloSku(sku);
  const avisos = [];
  const sugestao = await sugerirCategoria(cliente, { titulo: produto.tituloBase ?? "", produto, ia: SEM_IA });
  if (sugestao.aviso) avisos.push(sugestao.aviso);
  const provavel = sugestao.candidatas.find((candidata) => candidata.folha) ?? null;
  const categoria = provavel ? await lerCategoriaCompleta(cliente, provavel.categoriaId) : null;

  const meuSellerId = await meuVendedor(cliente);
  let catalogos = [];
  try {
    catalogos = (await sugerirCatalogos(cliente, { categoriaId: provavel?.categoriaId ?? null, titulo: produto.tituloBase ?? "", excluir: [], meuSellerId })).map(doCatalogo);
  } catch (erro) {
    avisos.push(`Os catálogos não foram lidos agora (Mercado Livre respondeu ${erro?.status ?? "erro"}): procure de novo em instantes.`);
  }
  const meusCatalogos = await catalogosDosMeusAnuncios(cliente, sku).catch(() => []);

  return {
    // `composicao` diz se a LLM pode propor outro titulo (so o kit); nos demais o titulo do anuncio e o `nome`.
    produto: { sku: produto.sku, nome: produto.tituloBase, composicao: ehComposicao(produto), marca: produto.marca, modelo: produto.modelo, descricao: produto.descricaoBase ?? "", custo: produto.custo?.valor ?? null, origemDoCusto: produto.custo?.origem ?? null, pesoKg: produto.pesoKg },
    categorias: sugestao.candidatas.map(({ categoriaId, nome, caminho, folha, limiteTitulo }) => ({ categoriaId, nome, caminho, folha, limiteTitulo })),
    atributos: categoria?.atributos ?? [],
    catalogos,
    meusCatalogos,
    referencias: (await lerReferenciasML(produto.id).catch(() => [])).map((referencia) => ({ catalogoId: referencia.catalogoId, nome: referencia.nome })),
    regras: { maximoDeCatalogos: MAXIMO_DE_CATALOGOS, minimoDeAnuncios: MINIMO_DE_ANUNCIOS, maximoDeLinks: MAXIMO_DE_LINKS },
    avisos,
  };
}

/** A ficha de uma categoria para a LLM (quando ela escolhe outra categoria que nao a provavel). */
export async function lerCategoriaML(cliente, categoriaId) {
  const categoria = await lerCategoriaCompleta(cliente, categoriaId);
  if (!categoria) throw new ErroDeFerramenta(`A categoria ${categoriaId} não existe no Mercado Livre.`);
  return { categoriaId, nome: categoria.nome, caminho: categoria.caminho, folha: categoria.folha, limiteTitulo: categoria.limiteTitulo, atributos: categoria.atributos };
}

/** O Classico ainda nao publicado do produto (simples, sem item no ML), para a proposta atualizar em vez de criar outro. */
async function classicoEmRascunho(produtoId) {
  const anuncios = await prisma.anuncio.findMany({ where: { canal: CANAL, produtoId, status: { notIn: ["PUBLICADO", "PUBLICANDO"] } }, orderBy: { criadoEm: "desc" }, select: { id: true, dados: true } });
  return anuncios.find((anuncio) => (anuncio.dados?.tipoAnuncio ?? CLASSICO) === CLASSICO && !anuncio.dados?.composicao && !anuncio.dados?.publicacao?.itemId) ?? null;
}

/** Le o 1o de cada catalogo pedido; fica so o de 5 ou mais anuncios. 401/429 param a leitura (a cota acabou). */
async function lerCatalogos(cliente, ids, avisos) {
  const meuSellerId = await meuVendedor(cliente);
  const aceitos = [];
  for (const id of [...new Set((ids ?? []).map((valor) => String(valor).trim()).filter(Boolean))].slice(0, MAXIMO_DE_CATALOGOS)) {
    let lido;
    try {
      lido = await lerPrimeiroDoCatalogo(cliente, id, { meuSellerId });
    } catch (erro) {
      avisos.push(`O catálogo ${id} não foi lido (Mercado Livre respondeu ${erro?.status ?? "erro"}).`);
      if (PARA_A_LEITURA.has(erro?.status)) break;
      continue;
    }
    if (!lido.primeiro) {
      avisos.push(`O catálogo ${id} não tem anúncios: ficou de fora.`);
      continue;
    }
    if (lido.total < MINIMO_DE_ANUNCIOS) {
      avisos.push(`O catálogo ${id} tem ${lido.total} anúncio(s), menos de ${MINIMO_DE_ANUNCIOS}: ficou de fora.`);
      continue;
    }
    const produto = await cliente.get(`/products/${encodeURIComponent(id)}`).catch(() => null);
    aceitos.push({
      catalogoId: id,
      nome: produto?.ok ? String(produto.dados?.name ?? "") || null : null,
      total: lido.total,
      primeiro: { preco: lido.primeiro.preco, apelido: lido.primeiro.vendedorApelido ?? null, meu: Boolean(lido.primeiro.meu) },
    });
  }
  return aceitos;
}

/**
 * @param {object} cliente  o cliente do ML (so GET)
 * @param {string} sku
 * @param {{ categoriaId: string, titulo?: string, atributos?: object, catalogos?: string[], linksSemCatalogo?: { url, titulo, preco }[], relatorio?: string }} entrada
 *   `titulo` so vale para produto com composicao (kit); nos demais o titulo do anuncio e o do produto base.
 */
export async function gravarPropostaML(cliente, sku, { categoriaId, titulo, atributos = {}, catalogos = [], linksSemCatalogo = [], relatorio = "" }) {
  await exigirProdutoPronto(sku);
  const produto = await produtoPeloSku(sku);

  const categoria = await lerCategoriaCompleta(cliente, String(categoriaId ?? "").trim());
  if (!categoria) throw new ErroDeFerramenta(`A categoria ${categoriaId} não existe no Mercado Livre.`);
  if (!categoria.folha) throw new ErroDeFerramenta(`A categoria ${categoriaId} não é folha (não aceita anúncio): escolha uma das filhas.`);

  const avisos = [];
  // Pedido do dono em 24/10/2026: o titulo do anuncio vem do produto base, e so a composicao (kit) pode ter outro.
  const composicao = ehComposicao(produto);
  const tituloDoProduto = limparTitulo(produto.tituloBase);
  const tituloEnviado = limparTitulo(titulo);
  const tituloLimpo = composicao ? tituloEnviado || tituloDoProduto : tituloDoProduto;
  if (!tituloLimpo) throw new ErroDeFerramenta("O produto não tem nome: o título do anúncio vem dele.");
  if (!composicao && tituloEnviado && tituloEnviado !== tituloDoProduto) {
    avisos.push("O título enviado foi ignorado: o anúncio usa o nome do produto (só produto com composição aceita outro título).");
  }
  if (categoria.limiteTitulo && tituloLimpo.length > categoria.limiteTitulo) {
    if (composicao) throw new ErroDeFerramenta(`O título tem ${tituloLimpo.length} caracteres; esta categoria aceita até ${categoria.limiteTitulo}.`);
    // O nome e do produto: nao se corta aqui, o dono encurta no cadastro dele.
    avisos.push(`O nome do produto tem ${tituloLimpo.length} caracteres e esta categoria aceita até ${categoria.limiteTitulo}: encurte o nome no cadastro do produto, que é o título do anúncio.`);
  }

  // So os atributos da categoria e nunca os do dono (GTIN e o motivo); valor em texto, sem espacos sobrando.
  const idsDaCategoria = new Set(categoria.atributos.map((atributo) => atributo.id));
  const ficha = Object.fromEntries(
    Object.entries(atributos ?? {})
      .filter(([id, valor]) => idsDaCategoria.has(id) && !SO_DO_DONO.has(id) && String(valor ?? "").trim() !== "")
      .map(([id, valor]) => [id, String(valor).trim()]),
  );

  const aceitos = await lerCatalogos(cliente, catalogos, avisos);
  const links = (linksSemCatalogo ?? []).filter((link) => Number(link?.preco) > 0).slice(0, MAXIMO_DE_LINKS).map((link) => ({ url: String(link.url), titulo: String(link.titulo ?? ""), preco: Number(link.preco) }));
  const precosDoRanking = aceitos.length > 0 ? aceitos.filter((c) => !c.primeiro.meu && Number(c.primeiro.preco) > 0).map((c) => Number(c.primeiro.preco)) : links.map((link) => link.preco);
  if (aceitos.length === 0 && links.length > 0) avisos.push("Sem catálogo: o preço foi comparado com os links achados pela pesquisa (preços não conferidos pelo Rise).");

  const existente = await classicoEmRascunho(produto.id);
  let base;
  if (existente) {
    const carregado = await carregarAnuncioML(existente.id);
    if (!carregado.ok) throw new ErroDeFerramenta(carregado.erro);
    base = carregado.rascunho;
  } else {
    const novo = await novoRascunhoML(produto.id);
    if (!novo.ok) throw new ErroDeFerramenta(novo.erro);
    base = { ...novo.rascunho, tipoAnuncio: CLASSICO };
  }
  // No rascunho que a proposta cria, tudo o que vem do produto e o ponto de partida: a proposta preenche por cima.
  const opcoes = existente ? {} : { vazio: () => true };

  const propostos = { categoriaId: categoria.id ?? String(categoriaId).trim(), categoriaNome: categoria.nome };
  // Fora da composicao o titulo nao e proposta: o rascunho fica com o do produto (um rascunho antigo, com outro, volta a ele).
  if (composicao) propostos.titulo = tituloLimpo;
  else base.titulo = tituloDoProduto;
  for (const [id, valor] of Object.entries(ficha)) propostos[`atributos.${id}`] = valor;
  const primeira = aplicarProposta(base, propostos, opcoes);

  const preco = await precoDaPropostaML(cliente, { ...primeira.rascunho, tipoAnuncio: CLASSICO }, { custo: produto.custo?.valor ?? null, precos: precosDoRanking });
  avisos.push(...preco.avisos);
  const segunda = preco.valor === null ? { rascunho: primeira.rascunho, campos: [], sugestoes: {}, valores: {} } : aplicarProposta(primeira.rascunho, { preco: preco.valor }, opcoes);

  for (const problema of problemasDosAtributos(segunda.rascunho.atributos ?? {}, categoria.atributos, { kit: false })) {
    if (problema.campo !== "GTIN") avisos.push(`Ficha: ${problema.problema}`);
  }

  const salvo = await salvarRascunhoML(existente?.id ?? null, segunda.rascunho);
  if (!salvo.ok) throw new ErroDeFerramenta(`O rascunho do Mercado Livre não foi gravado: ${salvo.erro}`);

  const campos = [...primeira.campos, ...segunda.campos];
  const sugestoes = { ...primeira.sugestoes, ...segunda.sugestoes };
  const proposta = montarProposta({
    versaoDoRoteiro: VERSAO_ROTEIRO_ML,
    campos,
    sugestoes,
    valores: { ...primeira.valores, ...segunda.valores },
    relatorio,
    extras: {
      avisos,
      catalogosSugeridos: aceitos,
      links,
      preco: { valor: preco.valor, markup: preco.markup, posicao: preco.posicao, total: preco.total, piso: preco.piso, teto: preco.teto },
    },
  });
  await gravarProposta(salvo.id, proposta);
  return { anuncioId: salvo.id, titulo: tituloLimpo, campos, sugestoes, preco: proposta.preco, catalogosSugeridos: aceitos, avisos };
}

/** So a chave `proposta` de `dados`, com a linha travada (o Salvar do editor nao cai no meio). */
async function gravarProposta(anuncioId, proposta) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Anuncio" WHERE id = ${anuncioId} FOR UPDATE`;
    const atual = await tx.anuncio.findUnique({ where: { id: anuncioId }, select: { dados: true } });
    await tx.anuncio.update({ where: { id: anuncioId }, data: { dados: { ...(atual?.dados ?? {}), proposta } } });
  });
}
