import { prisma } from "@/lib/db";

import { lerPrimeiroDoCatalogo, lerVendedores } from "./catalogo";
import { textoDoErroML } from "./leitura";
import { catalogosDoRanking } from "./ranking";

/**
 * Os catalogos de REFERENCIA do ranking de precos (spec 2026-10-23-ranking-catalogos-referencia-ml-design.md): o dono
 * marca catalogos parecidos com o do produto e o Rise guarda so o 1o colocado de cada um, relido uma vez por dia. O
 * catalogo do anuncio (`Produto.mlCatalogoId`) continua com o top 10 em `concorrentes.js` e nunca e referencia.
 * So GET no ML.
 */

export const MAXIMO_DE_REFERENCIAS = 10;

const ESPERA_ENTRE_REFERENCIAS_MS = 300;
const PARA_A_RODADA = new Set([401, 429]);

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));
const centavos = (valor) => (numero(valor) === null ? null : Math.round(numero(valor) * 100));
const esperar = (ms) => (ms > 0 ? new Promise((resolver) => setTimeout(resolver, ms)) : Promise.resolve());

/** Marca um catalogo como referencia do produto e ja le o 1o. So Produto Conferido; ate 10; nunca o catalogo do anuncio. */
export async function adicionarReferenciaML(cliente, produtoId, { catalogoId, nome }, { agora = new Date() } = {}) {
  const id = String(catalogoId ?? "").trim();
  if (!id) return { ok: false, erro: "Escolha um produto do catálogo." };
  const produto = await prisma.produto.findUnique({
    where: { id: produtoId },
    select: { conferido: true, mlCatalogoId: true, referenciasML: { select: { catalogoId: true } } },
  });
  if (!produto) return { ok: false, erro: "Produto não encontrado." };
  if (!produto.conferido) return { ok: false, erro: "Só produto Conferido acompanha catálogos no ML." };
  if (produto.mlCatalogoId === id) return { ok: false, erro: "Este é o catálogo do anúncio: ele já entra no ranking." };
  if (produto.referenciasML.some((r) => r.catalogoId === id)) return { ok: false, erro: "Este catálogo já é uma referência." };
  if (produto.referenciasML.length >= MAXIMO_DE_REFERENCIAS) return { ok: false, erro: `No máximo ${MAXIMO_DE_REFERENCIAS} catálogos de referência.` };

  // O unique (produto, catalogo) cobre dois cliques ao mesmo tempo: o segundo create falha e vira a mesma recusa.
  const criada = await prisma.catalogoReferenciaML
    .create({ data: { produtoId, catalogoId: id, nome: String(nome ?? "").trim().slice(0, 200) || null } })
    .catch((erro) => (erro?.code === "P2002" ? null : Promise.reject(erro)));
  if (!criada) return { ok: false, erro: "Este catálogo já é uma referência." };
  const leitura = await relerReferencia(cliente, criada, { meuSellerId: await cliente.usuarioId(), agora });
  return leitura.ok ? { ok: true } : { ok: true, aviso: leitura.erro };
}

/** Tira a referencia (e o historico dela). So a do proprio produto. */
export async function removerReferenciaML(produtoId, referenciaId) {
  const apagadas = await prisma.catalogoReferenciaML.deleteMany({ where: { id: String(referenciaId ?? ""), produtoId } });
  return apagadas.count > 0 ? { ok: true } : { ok: false, erro: "Referência não encontrada." };
}

/**
 * Le o 1o do catalogo e grava. Historico so quando o item, o preco ou o preco cheio mudam. Erro do ML grava `erro` e
 * `erroEm` e MANTEM o que foi lido antes (o preco de ontem vale mais que nenhum).
 * @returns {Promise<{ ok: boolean, erro?: string, status?: number|null }>}
 */
export async function relerReferencia(cliente, referencia, { meuSellerId, agora = new Date() } = {}) {
  let lido;
  let vendedor = null;
  try {
    lido = await lerPrimeiroDoCatalogo(cliente, referencia.catalogoId, { meuSellerId });
    if (lido.primeiro) vendedor = (await lerVendedores(cliente, [lido.primeiro.vendedorId])).get(lido.primeiro.vendedorId) ?? null;
  } catch (erro) {
    const texto = textoDoErroML(erro);
    await prisma.catalogoReferenciaML.update({ where: { id: referencia.id }, data: { erro: texto, erroEm: agora } });
    return { ok: false, erro: texto, status: typeof erro?.status === "number" ? erro.status : null };
  }

  const p = lido.primeiro;
  const anterior = await prisma.catalogoReferenciaML.findUnique({ where: { id: referencia.id }, select: { itemId: true, preco: true, precoCheio: true } });
  const mudou = p && (anterior?.itemId !== p.itemId || centavos(anterior?.preco) !== centavos(p.preco) || centavos(anterior?.precoCheio) !== centavos(p.precoCheio));
  await prisma.$transaction(async (tx) => {
    await tx.catalogoReferenciaML.update({
      where: { id: referencia.id },
      data: p
        ? {
            itemId: p.itemId,
            vendedorId: p.vendedorId,
            vendedorApelido: vendedor?.apelido ?? null,
            vendedorReputacao: vendedor?.reputacao ?? null,
            preco: p.preco,
            precoCheio: p.precoCheio,
            freteGratis: p.freteGratis,
            logistica: p.logistica,
            tipoAnuncio: p.tipoAnuncio,
            totalNoCatalogo: lido.total,
            meu: p.meu,
            lidoEm: agora,
            semAnuncios: false,
            erro: null,
            erroEm: null,
          }
        : { semAnuncios: true, totalNoCatalogo: 0, meu: false, lidoEm: agora, erro: null, erroEm: null },
    });
    if (mudou && p.preco > 0) {
      await tx.catalogoReferenciaMLHistorico.create({ data: { referenciaId: referencia.id, itemId: p.itemId, vendedorId: p.vendedorId, preco: p.preco, precoCheio: p.precoCheio, lidoEm: agora } });
    }
  });
  return { ok: true };
}

/**
 * Rele todas as referencias do produto. 401 (token) ou 429 (cota) param na hora e devolvem o `status`: quem chama (a
 * rodada diaria) para tambem. Outro erro conta como falha e segue.
 */
export async function relerReferenciasDoProduto(cliente, produtoId, { agora = new Date(), espera = ESPERA_ENTRE_REFERENCIAS_MS } = {}) {
  const referencias = await prisma.catalogoReferenciaML.findMany({ where: { produtoId }, orderBy: { criadoEm: "asc" }, select: { id: true, catalogoId: true } });
  if (referencias.length === 0) return { ok: true, lidas: 0, falhas: 0 };
  let meuSellerId;
  try {
    meuSellerId = await cliente.usuarioId();
  } catch (erro) {
    return { ok: false, lidas: 0, falhas: referencias.length, erro: textoDoErroML(erro), status: typeof erro?.status === "number" ? erro.status : null };
  }
  let lidas = 0;
  let falhas = 0;
  for (const [indice, referencia] of referencias.entries()) {
    if (indice > 0) await esperar(espera);
    const resultado = await relerReferencia(cliente, referencia, { meuSellerId, agora });
    if (resultado.ok) {
      lidas += 1;
      continue;
    }
    if (PARA_A_RODADA.has(resultado.status)) return { ok: false, lidas, falhas, erro: resultado.erro, status: resultado.status };
    falhas += 1;
  }
  return { ok: falhas === 0, lidas, falhas };
}

const paraTela = (r) => ({
  id: r.id,
  catalogoId: r.catalogoId,
  nome: r.nome,
  primeiro: r.itemId
    ? {
        itemId: r.itemId,
        vendedorId: r.vendedorId,
        vendedorApelido: r.vendedorApelido,
        vendedorReputacao: r.vendedorReputacao,
        preco: numero(r.preco),
        precoCheio: numero(r.precoCheio),
        freteGratis: r.freteGratis,
        logistica: r.logistica,
        tipoAnuncio: r.tipoAnuncio,
        meu: r.meu,
      }
    : null,
  semAnuncios: r.semAnuncios,
  totalNoCatalogo: r.totalNoCatalogo,
  lidoEm: r.lidoEm,
  erro: r.erro,
  erroEm: r.erroEm,
});

/** As referencias do produto em numeros simples (Decimal nao atravessa a Server Action), na ordem em que foram marcadas. */
export async function lerReferenciasML(produtoId) {
  const linhas = await prisma.catalogoReferenciaML.findMany({ where: { produtoId }, orderBy: { criadoEm: "asc" } });
  return linhas.map(paraTela);
}

/**
 * Os catalogos do ranking de varios produtos de uma vez, para a coluna "Concorrencia" da lista de anuncios: o 1o
 * presente do catalogo do anuncio, a posicao do dono nele e as referencias, no formato de `catalogosDoRanking`. So
 * entram os produtos com algum catalogo. Uma consulta so.
 * @returns {Promise<Map<string, object[]>>}
 */
export async function catalogosDeVariosProdutos(produtoIds) {
  const ids = [...new Set((produtoIds ?? []).filter((id) => typeof id === "string" && id !== ""))];
  if (ids.length === 0) return new Map();
  const produtos = await prisma.produto.findMany({
    where: { id: { in: ids }, OR: [{ mlCatalogoId: { not: null } }, { referenciasML: { some: {} } }] },
    select: {
      id: true,
      mlCatalogoId: true,
      mlCatalogoNome: true,
      concorrentesML: { where: { ausenteDesde: null }, orderBy: { posicao: "asc" }, take: 1, select: { itemId: true, vendedorId: true, vendedorApelido: true, preco: true, precoCheio: true, posicao: true, lidoEm: true } },
      posicoesML: { orderBy: { lidoEm: "desc" }, take: 1, select: { catalogoId: true, posicao: true, lidoEm: true } },
      referenciasML: { orderBy: { criadoEm: "asc" } },
    },
  });
  const resultado = new Map();
  for (const produto of produtos) {
    const posicao = produto.posicoesML[0]?.catalogoId === produto.mlCatalogoId ? produto.posicoesML[0] : null;
    const tela = {
      catalogoId: produto.mlCatalogoId,
      catalogoNome: produto.mlCatalogoNome,
      lidoEm: produto.concorrentesML[0]?.lidoEm ?? posicao?.lidoEm ?? null,
      posicao,
      concorrentes: produto.concorrentesML.map((c) => ({ ...c, preco: numero(c.preco), precoCheio: numero(c.precoCheio), ausenteDesde: null })),
    };
    resultado.set(produto.id, catalogosDoRanking(tela, produto.referenciasML.map(paraTela)));
  }
  return resultado;
}

/** Os catalogos que o produto ja usa no ranking (o do anuncio e as referencias); `null` se o produto nao existe. */
export async function catalogosUsadosDoProduto(produtoId) {
  const produto = await prisma.produto.findUnique({ where: { id: produtoId }, select: { mlCatalogoId: true, referenciasML: { select: { catalogoId: true } } } });
  if (!produto) return null;
  return [produto.mlCatalogoId, ...produto.referenciasML.map((r) => r.catalogoId)].filter(Boolean);
}
