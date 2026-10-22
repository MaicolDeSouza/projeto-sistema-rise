import { prisma } from "@/lib/db";

import { avisosDoML } from "./avisosConcorrentes";
import { contarVendedores, lerConcorrentesDoCatalogo, lerVendedores, minhaPosicao, topDoCatalogo } from "./catalogo";
import { textoDoErroML } from "./leitura";

/**
 * Os concorrentes do ML de um produto, pelo catalogo acompanhado (spec 2026-10-21-concorrentes-ml-catalogo-design.md).
 *
 * O dono escolhe o catalogo; os 10 primeiros anuncios dele (sem os do dono) viram `ConcorrenteML`, e a cada leitura o
 * top e renovado: quem entra ganha linha, quem sai fica com `ausenteDesde` (nunca apagado, como a coleta), quem volta
 * perde a marca. Historico so do que mudou. `relerCatalogoDoProduto` e a mesma rotina do "Acompanhar", do "Reler agora"
 * e da rodada diaria do worker. So GET no ML.
 */

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));
const mesmoValor = (a, b) => (numero(a) === null ? null : Math.round(numero(a) * 100)) === (numero(b) === null ? null : Math.round(numero(b) * 100));

/** Le o catalogo e grava a renovacao do top numa transacao. Erro do ML: nada e gravado. */
export async function relerCatalogoDoProduto(cliente, produtoId, { agora = new Date() } = {}) {
  const produto = await prisma.produto.findUnique({ where: { id: produtoId }, select: { id: true, mlCatalogoId: true } });
  if (!produto) return { ok: false, erro: "Produto não encontrado." };
  if (!produto.mlCatalogoId) return { ok: false, erro: "Este produto não acompanha nenhum catálogo do Mercado Livre." };
  const catalogoId = produto.mlCatalogoId;

  let lido;
  let top;
  let vendedores;
  try {
    const meuSellerId = await cliente.usuarioId();
    lido = await lerConcorrentesDoCatalogo(cliente, catalogoId, { meuSellerId });
    top = topDoCatalogo(lido.itens);
    vendedores = await lerVendedores(cliente, top.map((item) => item.vendedorId));
  } catch (erro) {
    return { ok: false, erro: textoDoErroML(erro), status: typeof erro?.status === "number" ? erro.status : null };
  }
  const minha = minhaPosicao(lido.itens);
  // O total e o do ML (`paging.total`), nao o que foi lido: acima do teto de 150 a lista vem cortada.
  const resumo = { total: lido.total, vendedores: contarVendedores(lido.itens), completo: lido.itens.length >= lido.total };

  const contagem = await prisma.$transaction(async (tx) => {
    const existentes = await tx.concorrenteML.findMany({ where: { produtoId } });
    const porItem = new Map(existentes.map((linha) => [linha.itemId, linha]));
    let novos = 0;
    let mudaram = 0;
    let ausentes = 0;

    for (const item of top) {
      const vendedor = vendedores.get(item.vendedorId) ?? {};
      const temPreco = item.preco !== null && item.preco > 0;
      const dados = {
        catalogoId,
        vendedorId: item.vendedorId,
        vendedorApelido: vendedor.apelido ?? null,
        vendedorReputacao: vendedor.reputacao ?? null,
        vendedorVendas: vendedor.vendas ?? null,
        vendedorCidade: vendedor.cidade ?? null,
        tipoAnuncio: item.tipoAnuncio,
        freteGratis: item.freteGratis,
        logistica: item.logistica,
        posicao: item.posicao,
        totalNoCatalogo: lido.total,
        lidoEm: agora,
        ausenteDesde: null,
      };
      const anterior = porItem.get(item.itemId);
      if (!anterior) {
        const criado = await tx.concorrenteML.create({ data: { produtoId, itemId: item.itemId, ...dados, preco: item.preco, precoCheio: item.precoCheio } });
        if (temPreco) await tx.concorrenteMLHistorico.create({ data: { concorrenteId: criado.id, preco: item.preco, precoCheio: item.precoCheio, posicao: item.posicao, lidoEm: agora } });
        novos += 1;
        continue;
      }
      // Preco nulo ou zero do ML nao e preco: mantem o anterior e nao grava historico (so o `lidoEm` anda).
      const preco = temPreco ? item.preco : numero(anterior.preco);
      const precoCheio = temPreco ? item.precoCheio : numero(anterior.precoCheio);
      const mudou = temPreco && (!mesmoValor(anterior.preco, preco) || !mesmoValor(anterior.precoCheio, precoCheio) || anterior.posicao !== item.posicao);
      await tx.concorrenteML.update({ where: { id: anterior.id }, data: { ...dados, preco, precoCheio } });
      if (mudou) {
        await tx.concorrenteMLHistorico.create({ data: { concorrenteId: anterior.id, preco, precoCheio, posicao: item.posicao, lidoEm: agora } });
        mudaram += 1;
      }
    }

    const noTop = new Set(top.map((item) => item.itemId));
    for (const linha of existentes) {
      if (!noTop.has(linha.itemId) && linha.ausenteDesde === null) {
        await tx.concorrenteML.update({ where: { id: linha.id }, data: { ausenteDesde: agora } });
        ausentes += 1;
      }
    }

    const ultima = await tx.posicaoML.findFirst({ where: { produtoId }, orderBy: { lidoEm: "desc" } });
    const posicaoMudou =
      !ultima ||
      ultima.catalogoId !== catalogoId ||
      ultima.posicao !== minha.posicao ||
      ultima.total !== resumo.total ||
      ultima.vendedores !== resumo.vendedores ||
      !mesmoValor(ultima.menorPreco, minha.menorPreco);
    if (posicaoMudou) {
      await tx.posicaoML.create({
        data: { produtoId, catalogoId, itemId: minha.itemId, posicao: minha.posicao, total: resumo.total, vendedores: resumo.vendedores, completo: resumo.completo, menorPreco: minha.menorPreco, lidoEm: agora },
      });
    }
    return { novos, mudaram, ausentes };
  });

  return { ok: true, total: lido.total, top: top.length, ...contagem, posicao: minha.posicao };
}

/**
 * Passa a acompanhar o catalogo e faz a primeira leitura. Trocar de catalogo marca os concorrentes do anterior como
 * ausentes (o historico fica). So Produto Conferido.
 */
export async function acompanharCatalogoML(cliente, produtoId, { catalogoId, catalogoNome }, { agora = new Date() } = {}) {
  const id = String(catalogoId ?? "").trim();
  if (!id) return { ok: false, erro: "Escolha um produto do catálogo." };
  const produto = await prisma.produto.findUnique({ where: { id: produtoId }, select: { id: true, conferido: true, mlCatalogoId: true } });
  if (!produto) return { ok: false, erro: "Produto não encontrado." };
  if (!produto.conferido) return { ok: false, erro: "Só produto Conferido acompanha concorrentes no ML." };

  await prisma.$transaction(async (tx) => {
    if (produto.mlCatalogoId !== id) {
      await tx.concorrenteML.updateMany({ where: { produtoId, ausenteDesde: null }, data: { ausenteDesde: agora } });
    }
    await tx.produto.update({ where: { id: produtoId }, data: { mlCatalogoId: id, mlCatalogoNome: String(catalogoNome ?? "").trim() || null } });
  });
  const leitura = await relerCatalogoDoProduto(cliente, produtoId, { agora });
  return leitura.ok ? { ok: true, leitura } : { ok: false, erro: leitura.erro, leitura };
}

/** Para de acompanhar: zera o catalogo e marca todos como ausentes. Nada e apagado. */
export async function pararDeAcompanharML(produtoId, { agora = new Date() } = {}) {
  await prisma.$transaction([
    prisma.produto.update({ where: { id: produtoId }, data: { mlCatalogoId: null, mlCatalogoNome: null } }),
    prisma.concorrenteML.updateMany({ where: { produtoId, ausenteDesde: null }, data: { ausenteDesde: agora } }),
  ]);
  return { ok: true };
}

/** O dono abriu a lista: os avisos passam a contar daqui. */
export async function marcarConcorrentesMLVistos(produtoId, { agora = new Date() } = {}) {
  await prisma.produto.update({ where: { id: produtoId }, data: { mlConcorrentesVistoEm: agora } });
}

const paraTela = (linha) => ({
  id: linha.id,
  itemId: linha.itemId,
  vendedorId: linha.vendedorId,
  vendedorApelido: linha.vendedorApelido,
  vendedorReputacao: linha.vendedorReputacao,
  vendedorVendas: linha.vendedorVendas,
  vendedorCidade: linha.vendedorCidade,
  tipoAnuncio: linha.tipoAnuncio,
  freteGratis: linha.freteGratis,
  preco: numero(linha.preco),
  precoCheio: numero(linha.precoCheio),
  posicao: linha.posicao,
  totalNoCatalogo: linha.totalNoCatalogo,
  lidoEm: linha.lidoEm,
  ausenteDesde: linha.ausenteDesde,
  historico: (linha.historico ?? []).map((h) => ({ preco: numero(h.preco), posicao: h.posicao, lidoEm: h.lidoEm })),
});

/**
 * Os avisos de varios produtos de uma vez, para a coluna "Concorrencia" da lista de anuncios (uma consulta so).
 * @returns {Promise<Map<string, string[]>>} so os produtos com aviso.
 */
export async function avisosDeVariosProdutos(produtoIds) {
  const ids = [...new Set((produtoIds ?? []).filter((id) => typeof id === "string" && id !== ""))];
  if (ids.length === 0) return new Map();
  const produtos = await prisma.produto.findMany({
    where: { id: { in: ids }, mlCatalogoId: { not: null } },
    select: {
      id: true,
      mlCatalogoId: true,
      mlConcorrentesVistoEm: true,
      concorrentesML: { where: { ausenteDesde: null }, select: { vendedorApelido: true, vendedorId: true, historico: { orderBy: { lidoEm: "desc" }, take: 2, select: { preco: true, lidoEm: true } } } },
      posicoesML: { orderBy: { lidoEm: "desc" }, take: 2, select: { catalogoId: true, posicao: true, menorPreco: true, lidoEm: true } },
    },
  });
  const resultado = new Map();
  for (const produto of produtos) {
    const posicoes = produto.posicoesML.filter((p) => p.catalogoId === produto.mlCatalogoId).map((p) => ({ ...p, menorPreco: numero(p.menorPreco) }));
    const concorrentes = produto.concorrentesML.map((c) => ({ ...c, historico: c.historico.map((h) => ({ preco: numero(h.preco), lidoEm: h.lidoEm })) }));
    const avisos = avisosDoML({ posicoes, concorrentes, vistoEm: produto.mlConcorrentesVistoEm });
    if (avisos.length > 0) resultado.set(produto.id, avisos.map((aviso) => aviso.texto));
  }
  return resultado;
}

/**
 * Tudo o que a tela mostra, em numeros simples (Decimal nao atravessa a Server Action): o catalogo, a posicao do dono,
 * os concorrentes (os presentes por posicao, depois os ausentes) com o preco anterior, e os avisos.
 */
export async function lerConcorrentesML(produtoId) {
  const produto = await prisma.produto.findUnique({
    where: { id: produtoId },
    select: {
      mlCatalogoId: true,
      mlCatalogoNome: true,
      mlConcorrentesVistoEm: true,
      concorrentesML: { include: { historico: { orderBy: { lidoEm: "desc" }, take: 2 } }, orderBy: [{ posicao: "asc" }] },
      posicoesML: { orderBy: { lidoEm: "desc" }, take: 2 },
    },
  });
  if (!produto) return null;
  const concorrentes = produto.concorrentesML.map(paraTela).map((c) => ({ ...c, precoAnterior: c.historico[1]?.preco ?? null }));
  const ordenados = [...concorrentes.filter((c) => !c.ausenteDesde), ...concorrentes.filter((c) => c.ausenteDesde)];
  const posicoes = produto.posicoesML.map((p) => ({
    catalogoId: p.catalogoId,
    itemId: p.itemId,
    posicao: p.posicao,
    total: p.total,
    vendedores: p.vendedores,
    completo: p.completo,
    menorPreco: numero(p.menorPreco),
    lidoEm: p.lidoEm,
  }));
  // Os avisos so valem para o catalogo de agora: trocar de catalogo nao e "cair".
  const doCatalogo = posicoes.filter((p) => p.catalogoId === produto.mlCatalogoId);
  // "Lido em" e a ultima LEITURA: a PosicaoML so ganha linha quando muda, mas todo concorrente presente tem o `lidoEm`
  // da ultima releitura. Sem isso o "Reler agora" sem mudanca parecia nao ter feito nada (visto em 22/10/2026).
  const leituras = [doCatalogo[0]?.lidoEm, ...ordenados.filter((c) => !c.ausenteDesde).map((c) => c.lidoEm)].filter(Boolean).map((d) => new Date(d));
  const lidoEm = leituras.length > 0 ? new Date(Math.max(...leituras.map((d) => d.getTime()))) : null;
  return {
    catalogoId: produto.mlCatalogoId,
    catalogoNome: produto.mlCatalogoNome,
    lidoEm,
    posicao: doCatalogo[0] ?? null,
    concorrentes: ordenados,
    avisos: produto.mlCatalogoId ? avisosDoML({ posicoes: doCatalogo, concorrentes: ordenados.filter((c) => !c.ausenteDesde), vistoEm: produto.mlConcorrentesVistoEm }) : [],
  };
}
