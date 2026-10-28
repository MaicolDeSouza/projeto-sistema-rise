import { clienteBling } from "@/lib/blingSync/cliente";
import { prisma } from "@/lib/db";

import { fornecedorDoAliExpress } from "./fornecedor";
import { anuncioDoLink, codigoDoVinculo, decidirCasamento, precoMedioPonderado, precoNoRise, quantidadeNoRise } from "./regras";
import { entradaNoVirtual, saidaDoVirtual } from "./virtual";

/**
 * O casamento de uma linha do AliExpress (anuncio + opcao) com um produto do Rise (spec 2026-10-28, §6.3). A ordem:
 * 1. o vinculo do fornecedor do AliExpress com `codigo` = "anuncio:opcao" (o que o dono ja escolheu antes);
 * 2. o link do anuncio num vinculo de qualquer fornecedor ou no fornecedor em rascunho do Bling (`fornecedorRascunho`,
 *    onde o dono guarda o link do AliExpress: 503 produtos no banco do PC em 28/10/2026), se der UM produto so;
 * 3. senao a linha fica pendente ("!"), e o dono escolhe produto e fator na tela (`casarManual`).
 *
 * O deposito Virtual do Bling NUNCA e chamado dentro da transacao: quem chama manda depois do commit, para a recusa do
 * Bling nao desfazer o casamento (a linha fica com `virtualErro` e o "Reenviar ao Virtual").
 */

const ERRO_COM_ESTOQUE = "Já há estoque lançado deste item: não dá para trocar.";
const FECHADOS = ["FINALIZADO", "CANCELADO"];

/** Os produtos candidatos a uma linha (regras 1 e 2). */
export async function candidatosDaLinha(tx, { productId, skuId }) {
  const ali = await fornecedorDoAliExpress(tx);
  const vinculo = ali
    ? await tx.produtoFornecedor.findFirst({
        where: { fornecedorId: ali.id, codigo: codigoDoVinculo(productId, skuId) },
        orderBy: { criadoEm: "asc" },
        select: { id: true, produtoId: true, fator: true },
      })
    : null;
  if (vinculo) return { vinculo, candidatos: [] };

  const trecho = `/item/${productId}.`;
  const candidatos = [];
  const vinculos = await tx.produtoFornecedor.findMany({
    where: { OR: [{ link: { contains: trecho } }, { descricao: { contains: trecho } }] },
    select: { produtoId: true, link: true, descricao: true },
  });
  for (const linha of vinculos) {
    const anuncio = anuncioDoLink(linha.link?.includes(trecho) ? linha.link : linha.descricao);
    if (anuncio?.productId === String(productId)) candidatos.push({ produtoId: linha.produtoId, origem: "vinculo", skuId: anuncio.skuId });
  }
  const rascunhos = await tx.produto.findMany({
    where: { fornecedorRascunho: { path: ["descricao"], string_contains: trecho } },
    select: { id: true, fornecedorRascunho: true },
  });
  for (const produto of rascunhos) {
    const anuncio = anuncioDoLink(produto.fornecedorRascunho?.descricao);
    if (anuncio?.productId === String(productId)) candidatos.push({ produtoId: produto.id, origem: "rascunho", skuId: anuncio.skuId });
  }
  return { vinculo: null, candidatos };
}

/** Quantidade e preco no Rise de cada linha ja casada com o item (para o preco medio). */
async function linhasDoItem(tx, itemId) {
  const linhas = await tx.linhaAliExpress.findMany({ where: { itemId }, select: { id: true, quantidadeComprada: true, precoComprado: true, fator: true } });
  return linhas.map((linha) => ({ id: linha.id, quantidade: quantidadeNoRise(linha.quantidadeComprada, linha.fator), preco: precoNoRise(linha.precoComprado, linha.fator) }));
}

/** Regrava quantidade e preco medio do item a partir das linhas; sem linhas, apaga o item. */
async function recalcularItem(tx, itemId) {
  const linhas = await linhasDoItem(tx, itemId);
  if (linhas.length === 0) {
    await tx.itemDoPedidoDeCompra.delete({ where: { id: itemId } });
    return null;
  }
  return tx.itemDoPedidoDeCompra.update({
    where: { id: itemId },
    data: { quantidade: linhas.reduce((soma, linha) => soma + linha.quantidade, 0), precoUnitario: precoMedioPonderado(linhas) },
  });
}

/**
 * O vinculo do fornecedor do AliExpress para (produto, anuncio:opcao), criado ou atualizado. O mesmo codigo em OUTRO
 * produto perde o codigo (a escolha nova vence; o vinculo antigo fica, com custo e observacao). O custo so vai para o
 * vinculo novo quando nenhum vinculo do produto tem custo: nunca sobrescreve custo que existe.
 */
async function gravarVinculo(tx, { aliId, produtoId, codigo, linha, fator, preco, escolhaDoDono }) {
  if (escolhaDoDono) {
    await tx.produtoFornecedor.updateMany({ where: { fornecedorId: aliId, codigo, NOT: { produtoId } }, data: { codigo: null } });
  }
  const existente = await tx.produtoFornecedor.findFirst({ where: { fornecedorId: aliId, produtoId, codigo }, select: { id: true } });
  if (existente) {
    await tx.produtoFornecedor.update({ where: { id: existente.id }, data: { fator, ...(linha.urlDoItem ? { link: linha.urlDoItem } : {}) } });
    return existente.id;
  }
  const comCusto = await tx.produtoFornecedor.count({ where: { produtoId, precoCusto: { not: null } } });
  const criado = await tx.produtoFornecedor.create({
    data: {
      produtoId,
      fornecedorId: aliId,
      codigo,
      link: linha.urlDoItem,
      descricao: linha.titulo,
      fator,
      ...(comCusto === 0 ? { precoFornecedor: preco, precoCusto: preco } : {}),
    },
    select: { id: true },
  });
  return criado.id;
}

/**
 * Casa uma linha (sem chamar o Bling). `escolha` = `{ produtoId, fator }` do dono; sem ela, as regras 1 e 2. Linha ja
 * casada devolve o item dela (importar duas vezes nao duplica).
 */
export async function casarLinha(tx, linhaId, escolha = null) {
  const linha = await tx.linhaAliExpress.findUnique({
    where: { id: linhaId },
    include: { pedidoAliExpress: { include: { pedido: { select: { id: true, fornecedorId: true, fornecedor: { select: { prazoEntregaDias: true } } } } } } },
  });
  if (!linha) return { ok: false, pendente: true, motivo: "sem_produto" };
  if (linha.itemId) return { ok: true, itemId: linha.itemId, produtoId: null, fator: linha.fator, criouItem: false };

  let produtoId;
  let fator = 1;
  if (escolha) {
    produtoId = escolha.produtoId;
    fator = escolha.fator;
  } else {
    const { vinculo, candidatos } = await candidatosDaLinha(tx, linha);
    if (vinculo) {
      produtoId = vinculo.produtoId;
      fator = vinculo.fator ?? 1;
    } else {
      const decisao = decidirCasamento(candidatos, linha.skuId);
      if (!decisao) return { ok: false, pendente: true, motivo: "sem_produto" };
      if (decisao.ambiguo) return { ok: false, pendente: true, motivo: "ambiguo", produtos: decisao.ambiguo };
      produtoId = decisao.produtoId;
    }
  }

  const produto = await tx.produto.findUnique({ where: { id: String(produtoId ?? "") }, select: { id: true, tipo: true } });
  if (!produto) return { ok: false, pendente: true, motivo: "sem_produto" };
  if (produto.tipo === "COMPOSICAO") return { ok: false, pendente: true, motivo: "kit" };

  const pedido = linha.pedidoAliExpress.pedido;
  const quantidade = quantidadeNoRise(linha.quantidadeComprada, fator);
  const preco = precoNoRise(linha.precoComprado, fator);
  const codigo = codigoDoVinculo(linha.productId, linha.skuId);
  const vinculoId = await gravarVinculo(tx, { aliId: pedido.fornecedorId, produtoId: produto.id, codigo, linha, fator, preco, escolhaDoDono: Boolean(escolha) });

  // A linha entra no item ANTES do recalculo: o item soma as linhas que apontam para ele.
  let item = await tx.itemDoPedidoDeCompra.findUnique({ where: { pedidoId_produtoId: { pedidoId: pedido.id, produtoId: produto.id } }, select: { id: true } });
  const criouItem = !item;
  if (!item) {
    const maior = await tx.itemDoPedidoDeCompra.aggregate({ where: { pedidoId: pedido.id }, _max: { ordem: true } });
    item = await tx.itemDoPedidoDeCompra.create({
      data: {
        pedidoId: pedido.id,
        produtoId: produto.id,
        vinculoId,
        nomeNoFornecedor: linha.titulo,
        codigoNoFornecedor: codigo,
        link: linha.urlDoItem,
        quantidade,
        precoUnitario: preco,
        ipiPercentual: 0,
        prazoDias: pedido.fornecedor?.prazoEntregaDias ?? null,
        ordem: (maior._max.ordem ?? -1) + 1,
      },
      select: { id: true },
    });
  }
  await tx.linhaAliExpress.update({ where: { id: linha.id }, data: { itemId: item.id, fator } });
  if (!criouItem) await recalcularItem(tx, item.id);
  return { ok: true, itemId: item.id, produtoId: produto.id, fator, criouItem };
}

/** Os dados para o Virtual de uma linha casada (sku e blingId do produto, quantidade no Rise). */
async function dadosDoVirtual(tx, linhaId) {
  const linha = await tx.linhaAliExpress.findUnique({
    where: { id: linhaId },
    include: { item: { select: { produto: { select: { sku: true, blingId: true } } } }, pedidoAliExpress: { select: { externoId: true } } },
  });
  if (!linha?.item) return null;
  return {
    linha,
    sku: linha.item.produto.sku,
    blingId: linha.item.produto.blingId,
    quantidade: quantidadeNoRise(linha.quantidadeComprada, linha.fator),
    observacao: `AliExpress ${linha.pedidoAliExpress.externoId}`,
  };
}

/** Manda ao Virtual a entrada de uma linha casada que ainda nao entrou. Grava o resultado na linha. */
export async function entradaDaLinhaNoVirtual(linhaId, { cliente = clienteBling() } = {}) {
  const dados = await dadosDoVirtual(prisma, linhaId);
  if (!dados || dados.linha.virtualLancadoEm) return { ok: true, enviado: false };
  const resultado = await entradaNoVirtual(dados, { cliente });
  await prisma.linhaAliExpress.update({
    where: { id: linhaId },
    data: resultado.ok ? { virtualQuantidade: dados.quantidade, virtualLancadoEm: new Date(), virtualErro: null } : { virtualErro: resultado.erro },
  });
  return { ...resultado, enviado: resultado.ok };
}

/** Tira do Virtual o que a linha tinha posto (cancelamento, troca de produto). `dados` capturados antes da mudanca. */
export async function saidaDaLinhaDoVirtual(linhaId, dados, { cliente = clienteBling() } = {}) {
  if (!dados?.quantidade) return { ok: true };
  const resultado = await saidaDoVirtual(dados, { cliente });
  await prisma.linhaAliExpress.updateMany({
    where: { id: linhaId },
    data: resultado.ok ? { virtualQuantidade: 0, virtualLancadoEm: null, virtualErro: null } : { virtualErro: resultado.erro },
  });
  return resultado;
}

/** O que a linha pos no Virtual (para tirar depois), ou null. */
async function oQueEstaNoVirtual(tx, linhaId) {
  const dados = await dadosDoVirtual(tx, linhaId);
  if (!dados?.linha.virtualLancadoEm || !dados.linha.virtualQuantidade) return null;
  return { ...dados, quantidade: dados.linha.virtualQuantidade, observacao: `${dados.observacao} · troca` };
}

/** Tira a linha do item dela (dentro da transacao). Recusa com estoque ja lancado. */
async function soltarLinha(tx, linha) {
  if (!linha.itemId) return { ok: true };
  const item = await tx.itemDoPedidoDeCompra.findUnique({ where: { id: linha.itemId }, select: { quantidadeLancada: true } });
  if (item?.quantidadeLancada > 0) return { ok: false, erro: ERRO_COM_ESTOQUE };
  await tx.linhaAliExpress.update({ where: { id: linha.id }, data: { itemId: null } });
  if (item) await recalcularItem(tx, linha.itemId);
  return { ok: true };
}

async function linhaParaMudar(tx, linhaId) {
  const linha = await tx.linhaAliExpress.findUnique({
    where: { id: String(linhaId ?? "") },
    include: { pedidoAliExpress: { select: { pedido: { select: { status: true } } } } },
  });
  if (!linha) return { erro: "Item do AliExpress não encontrado." };
  if (FECHADOS.includes(linha.pedidoAliExpress.pedido.status)) return { erro: "Pedido fechado: não muda." };
  return { linha };
}

/** "Casar" da tela: o dono escolhe o produto e o fator. Troca o casamento anterior (sem estoque lancado). */
export async function casarManual(linhaId, produtoId, fator, { cliente = clienteBling() } = {}) {
  const fatorNumero = Number(fator);
  if (!Number.isInteger(fatorNumero) || fatorNumero < 1 || fatorNumero > 100000) return { ok: false, erro: "Fator: número inteiro de 1 a 100000." };
  let antigo = null;
  let resultado;
  try {
    resultado = await prisma.$transaction(async (tx) => {
      const { linha, erro } = await linhaParaMudar(tx, linhaId);
      if (erro) return { ok: false, erro };
      antigo = await oQueEstaNoVirtual(tx, linha.id);
      const solta = await soltarLinha(tx, linha);
      if (!solta.ok) return solta;
      const casado = await casarLinha(tx, linha.id, { produtoId, fator: fatorNumero });
      if (!casado.ok) {
        // Desfaz o que a transacao ja fez (o item antigo solto) e devolve o motivo.
        throw Object.assign(new Error(casado.motivo === "kit" ? "Kit não recebe compra: escolha uma peça." : "Produto não encontrado."), { recusa: true });
      }
      return casado;
    });
  } catch (erro) {
    if (erro?.recusa) return { ok: false, erro: erro.message };
    throw erro;
  }
  if (!resultado.ok) return resultado;
  // Depois do commit: tira do Virtual o que estava no produto antigo e poe no novo.
  if (antigo) await saidaDaLinhaDoVirtual(String(linhaId), antigo, { cliente });
  const virtual = await entradaDaLinhaNoVirtual(String(linhaId), { cliente });
  return { ok: true, itemId: resultado.itemId, virtual };
}

/** "Trocar produto": a linha volta a pendente e sai do Virtual. Recusa com estoque lancado. */
export async function desfazerCasamento(linhaId, { cliente = clienteBling() } = {}) {
  let antigo = null;
  const resultado = await prisma.$transaction(async (tx) => {
    const { linha, erro } = await linhaParaMudar(tx, linhaId);
    if (erro) return { ok: false, erro };
    antigo = await oQueEstaNoVirtual(tx, linha.id);
    return soltarLinha(tx, linha);
  });
  if (!resultado.ok) return resultado;
  if (antigo) await saidaDaLinhaDoVirtual(String(linhaId), antigo, { cliente });
  return { ok: true };
}
