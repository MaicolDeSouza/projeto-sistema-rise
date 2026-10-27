import { ajustarEstoqueNaTransacao } from "@/lib/ajusteRapido";
import { urlDe } from "@/lib/arquivos";
import { clienteBling } from "@/lib/blingSync/cliente";
import { enviarAjustesDeEstoque } from "@/lib/blingSync/envio";
import { prisma } from "@/lib/db";

import { lerPecasDoProduto } from "./pecas.js";
import { faltasParaBaixa, numeroDaOrdem, quantidadeTotalDaPeca, SITUACOES, validarQuantidadeProduzida } from "./regras.js";

/**
 * Ordem de producao em duas etapas (spec 2026-10-26-producao-pecas-proprias-design.md): "Dar baixa nas pecas" tira as
 * pecas do Rise e "Concluir" lanca o produto final; "Cancelar" depois da baixa devolve as pecas. O molde e o lancamento
 * de Compras: a ordem e travada (`FOR UPDATE`) e a situacao e relida depois da trava (o segundo clique de um clique duplo
 * encontra a ordem ja mudada); os movimentos sao os do Rise (`ajustarEstoqueNaTransacao`) e o Bling so recebe depois do
 * commit, pelo `enviarAjustesDeEstoque` de sempre. O Bling que recusa deixa o ajuste pendente, nunca desfaz o Rise.
 */

const QUANTIDADE_MAXIMA = 99999;

/** Erro que desfaz a transacao inteira e volta como recusa (um `return` no meio deixaria os movimentos ja gravados). */
class Recusa extends Error {
  constructor(erro, extra = {}) {
    super(erro);
    this.extra = extra;
  }
}

async function emTransacao(funcao, rotulo) {
  try {
    return await prisma.$transaction(funcao);
  } catch (erro) {
    if (erro instanceof Recusa) return { ok: false, erro: erro.message, ...erro.extra };
    return { ok: false, erro: `Não foi possível ${rotulo}: ${erro.message}` };
  }
}

async function travarOrdem(tx, id) {
  const [linha] = await tx.$queryRaw`
    SELECT "id", "numero", "produtoId", "situacao"::text AS "situacao", "quantidadePlanejada"
    FROM "OrdemDeProducao" WHERE "id" = ${String(id ?? "")} FOR UPDATE`;
  return linha ?? null;
}

/** Manda ao Bling os ajustes pendentes de cada produto; nunca lanca (o resultado so vira o aviso da tela). */
async function enviarAoBling(produtos, cliente, depositoId) {
  const resultados = [];
  for (const { produtoId, sku } of produtos) {
    try {
      const resultado = await enviarAjustesDeEstoque(produtoId, cliente, depositoId ? { depositoId } : {});
      resultados.push(resultado.ok ? { produtoId, sku, ok: true } : { produtoId, sku, ok: false, erro: resultado.erro, precisaDeposito: resultado.precisaDeposito ?? null });
    } catch (erro) {
      resultados.push({ produtoId, sku, ok: false, erro: erro.message });
    }
  }
  return resultados;
}

/** O proximo numero sob trava do Postgres (dentro da transacao que cria a ordem), como o PC-0001 de Compras. */
async function proximoNumero(tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('producao.numero'))`;
  const maior = await tx.ordemDeProducao.aggregate({ _max: { numero: true } });
  return (maior._max.numero ?? 0) + 1;
}

/**
 * "Produzir": a ordem nasce ABERTA com a COPIA das pecas de hoje (mudar o produto depois nao muda a ordem).
 * @returns {Promise<{ok: true, id: string, numero: string} | {ok: false, erro: string}>}
 */
export async function criarOrdem(produtoId, { quantidade, observacao } = {}) {
  const planejada = Number(quantidade);
  if (!Number.isInteger(planejada) || planejada < 1 || planejada > QUANTIDADE_MAXIMA) {
    return { ok: false, erro: "Informe quantas unidades vai produzir." };
  }
  const nota = String(observacao ?? "").trim().slice(0, 500) || null;
  return emTransacao(async (tx) => {
    const produto = await tx.produto.findUnique({ where: { id: String(produtoId ?? "") }, select: { pecasProprias: true } });
    if (!produto) throw new Recusa("Produto não encontrado.");
    if (!produto.pecasProprias) throw new Recusa("Este produto não tem lista personalizada.");
    const pecas = await lerPecasDoProduto(produtoId, tx);
    if (pecas.length === 0) throw new Recusa("Monte a lista personalizada antes de produzir.");

    const numero = await proximoNumero(tx);
    const criada = await tx.ordemDeProducao.create({
      data: {
        numero,
        produtoId: String(produtoId),
        quantidadePlanejada: planejada,
        observacao: nota,
        itens: {
          create: pecas.map((peca) => ({
            componenteId: peca.componenteId,
            sku: peca.sku,
            descricao: peca.nome,
            fornecedor: peca.fornecedor ?? null,
            custoUnitario: peca.custo,
            quantidadePorUnidade: peca.quantidade,
            quantidadeTotal: quantidadeTotalDaPeca(peca.quantidade, planejada),
          })),
        },
      },
      select: { id: true, numero: true },
    });
    return { ok: true, id: criada.id, numero: numeroDaOrdem(criada.numero) };
  }, "criar a ordem");
}

const numeroOuNull = (valor) => (valor === null || valor === undefined ? null : Number(valor));

/** A ordem no formato da tela, com o estoque de hoje de cada peca. */
export async function lerOrdem(id) {
  const ordem = await prisma.ordemDeProducao.findUnique({
    where: { id: String(id ?? "") },
    include: {
      produto: { select: { id: true, sku: true, tituloBase: true, estoque: true, estoqueMinimo: true, estoqueMaximo: true } },
      itens: {
        orderBy: { id: "asc" },
        include: {
          componente: {
            select: {
              sku: true,
              estoque: true,
              estoqueMinimo: true,
              estoqueMaximo: true,
              arquivos: { where: { tipo: "IMAGEM", papel: "FOTO" }, orderBy: { ordem: "asc" }, take: 1, select: { arquivo: true } },
            },
          },
        },
      },
    },
  });
  if (!ordem) return null;
  // A ordem dos itens e a da criacao (os ids nascem em sequencia na mesma transacao).
  return {
    ...ordem,
    numero: numeroDaOrdem(ordem.numero),
    itens: ordem.itens.map(({ componente, ...item }) => ({
      ...item,
      quantidadePorUnidade: Number(item.quantidadePorUnidade),
      custoUnitario: numeroOuNull(item.custoUnitario),
      estoqueAtual: componente?.estoque ?? null,
      estoqueMinimo: componente?.estoqueMinimo ?? null,
      estoqueMaximo: componente?.estoqueMaximo ?? null,
      foto: componente?.arquivos?.[0] ? urlDe(componente.sku, "IMAGEM", componente.arquivos[0].arquivo) : null,
    })),
  };
}

/** Lista paginada, filtrada por situacao e por numero/codigo/nome do produto. */
export async function listarOrdens({ situacao, busca, pagina = 1, porPagina = 25 } = {}) {
  const texto = String(busca ?? "").trim();
  const numero = Number(texto.replace(/^OP-?/i, ""));
  const where = {
    ...(SITUACOES.includes(situacao) ? { situacao } : {}),
    ...(texto
      ? {
          OR: [
            ...(Number.isInteger(numero) && numero > 0 ? [{ numero }] : []),
            { produto: { sku: { contains: texto, mode: "insensitive" } } },
            { produto: { tituloBase: { contains: texto, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const total = await prisma.ordemDeProducao.count({ where });
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const atual = Math.min(Math.max(Number(pagina) || 1, 1), totalPaginas);
  const ordens = await prisma.ordemDeProducao.findMany({
    where,
    orderBy: { numero: "desc" },
    skip: (atual - 1) * porPagina,
    take: porPagina,
    include: { produto: { select: { id: true, sku: true, tituloBase: true } } },
  });
  return { ordens: ordens.map((ordem) => ({ ...ordem, numero: numeroDaOrdem(ordem.numero) })), total, pagina: atual, totalPaginas };
}

export async function contarPorSituacao() {
  const grupos = await prisma.ordemDeProducao.groupBy({ by: ["situacao"], _count: { _all: true } });
  return Object.fromEntries(SITUACOES.map((situacao) => [situacao, grupos.find((grupo) => grupo.situacao === situacao)?._count._all ?? 0]));
}

/**
 * Da baixa nas pecas do Rise (ABERTA -> EM_PRODUCAO). Faltando estoque de qualquer peca, recusa INTEIRA com `faltas`:
 * baixa pela metade deixaria a ordem sem saber o que ja saiu.
 */
export async function darBaixa(id, { cliente = clienteBling(), depositoId } = {}) {
  const gravado = await emTransacao(async (tx) => {
    const ordem = await travarOrdem(tx, id);
    if (!ordem) throw new Recusa("Ordem não encontrada. Recarregue a página.");
    if (ordem.situacao !== "ABERTA") throw new Recusa("Só uma ordem aberta recebe a baixa.");
    const itens = await tx.itemDaOrdemDeProducao.findMany({ where: { ordemId: ordem.id }, orderBy: { componenteId: "asc" } });
    const doRise = itens.filter((item) => item.componenteId);
    // Trava as pecas em ordem de id: duas ordens com as mesmas pecas nao se travam em cruz.
    const ids = [...new Set(doRise.map((item) => item.componenteId))].sort();
    const linhas = ids.length
      ? await tx.$queryRaw`SELECT "id", "sku", "estoque" FROM "Produto" WHERE "id" = ANY(${ids}) ORDER BY "id" FOR UPDATE`
      : [];
    const faltas = faltasParaBaixa(doRise, new Map(linhas.map((linha) => [linha.id, linha.estoque])));
    if (faltas.length > 0) throw new Recusa(`Falta estoque de ${faltas.length} peça(s).`, { faltas });

    const numero = numeroDaOrdem(ordem.numero);
    for (const item of doRise) {
      const ajuste = await ajustarEstoqueNaTransacao(tx, item.componenteId, {
        tipo: "SAIDA",
        quantidade: item.quantidadeTotal,
        motivo: "Produção",
        observacao: numero,
      });
      if (!ajuste.ok) throw new Recusa(`${item.sku}: ${ajuste.erro}`);
      await tx.itemDaOrdemDeProducao.update({ where: { id: item.id }, data: { saidaMovimentoId: ajuste.movimentoId } });
    }
    await tx.ordemDeProducao.update({ where: { id: ordem.id }, data: { situacao: "EM_PRODUCAO", baixaEm: new Date() } });
    return { ok: true, produtos: linhas.map((linha) => ({ produtoId: linha.id, sku: linha.sku })) };
  }, "dar baixa");
  if (!gravado.ok) return gravado;
  return { ok: true, bling: await enviarAoBling(gravado.produtos, cliente, depositoId) };
}

/** Lanca o produto final (EM_PRODUCAO -> CONCLUIDA). A quantidade produzida pode ser menor: a diferenca e perda. */
export async function concluir(id, quantidadeProduzida, { cliente = clienteBling(), depositoId } = {}) {
  const gravado = await emTransacao(async (tx) => {
    const ordem = await travarOrdem(tx, id);
    if (!ordem) throw new Recusa("Ordem não encontrada. Recarregue a página.");
    if (ordem.situacao !== "EM_PRODUCAO") throw new Recusa("Só uma ordem em produção pode ser concluída.");
    const valida = validarQuantidadeProduzida(quantidadeProduzida, ordem.quantidadePlanejada);
    if (!valida.ok) throw new Recusa(valida.erro);

    const ajuste = await ajustarEstoqueNaTransacao(tx, ordem.produtoId, {
      tipo: "ENTRADA",
      quantidade: valida.quantidade,
      motivo: "Produção",
      observacao: numeroDaOrdem(ordem.numero),
      ordemDeProducao: true,
    });
    if (!ajuste.ok) throw new Recusa(ajuste.erro);
    await tx.ordemDeProducao.update({
      where: { id: ordem.id },
      data: { situacao: "CONCLUIDA", quantidadeProduzida: valida.quantidade, concluidaEm: new Date(), entradaMovimentoId: ajuste.movimentoId },
    });
    const produto = await tx.produto.findUnique({ where: { id: ordem.produtoId }, select: { id: true, sku: true } });
    return { ok: true, produtos: [{ produtoId: produto.id, sku: produto.sku }] };
  }, "concluir");
  if (!gravado.ok) return gravado;
  return { ok: true, bling: await enviarAoBling(gravado.produtos, cliente, depositoId) };
}

/** Cancela: ABERTA sem mexer em estoque; EM_PRODUCAO devolve as pecas baixadas. Concluida nao se cancela. */
export async function cancelar(id, { cliente = clienteBling(), depositoId } = {}) {
  const gravado = await emTransacao(async (tx) => {
    const ordem = await travarOrdem(tx, id);
    if (!ordem) throw new Recusa("Ordem não encontrada. Recarregue a página.");
    if (!["ABERTA", "EM_PRODUCAO"].includes(ordem.situacao)) throw new Recusa("Ordem concluída ou cancelada não pode ser cancelada.");

    const produtos = [];
    if (ordem.situacao === "EM_PRODUCAO") {
      const itens = await tx.itemDaOrdemDeProducao.findMany({
        where: { ordemId: ordem.id, saidaMovimentoId: { not: null }, devolucaoMovimentoId: null },
        orderBy: { componenteId: "asc" },
      });
      for (const item of itens) {
        const ajuste = await ajustarEstoqueNaTransacao(tx, item.componenteId, {
          tipo: "ENTRADA",
          quantidade: item.quantidadeTotal,
          motivo: "Produção cancelada",
          observacao: numeroDaOrdem(ordem.numero),
        });
        if (!ajuste.ok) throw new Recusa(`${item.sku}: ${ajuste.erro}`);
        await tx.itemDaOrdemDeProducao.update({ where: { id: item.id }, data: { devolucaoMovimentoId: ajuste.movimentoId } });
        produtos.push({ produtoId: item.componenteId, sku: item.sku });
      }
    }
    await tx.ordemDeProducao.update({ where: { id: ordem.id }, data: { situacao: "CANCELADA", canceladaEm: new Date() } });
    return { ok: true, produtos };
  }, "cancelar");
  if (!gravado.ok) return gravado;
  return { ok: true, bling: await enviarAoBling(gravado.produtos, cliente, depositoId) };
}

/** "Reenviar" da tela: manda ao Bling os ajustes pendentes dos produtos da ordem (pecas e o final). */
export async function reenviarPendentesDaOrdem(id, depositoId, { cliente = clienteBling() } = {}) {
  const ordem = await prisma.ordemDeProducao.findUnique({
    where: { id: String(id ?? "") },
    select: { produto: { select: { id: true, sku: true } }, itens: { select: { componenteId: true, sku: true } } },
  });
  if (!ordem) return { ok: false, erro: "Ordem não encontrada." };
  const candidatos = [{ produtoId: ordem.produto.id, sku: ordem.produto.sku }, ...ordem.itens.filter((item) => item.componenteId).map((item) => ({ produtoId: item.componenteId, sku: item.sku }))];
  const pendentes = await prisma.movimentoEstoque.findMany({
    where: { produtoId: { in: candidatos.map((item) => item.produtoId) }, enviadoAoBlingEm: null },
    select: { produtoId: true },
    distinct: ["produtoId"],
  });
  const comPendencia = candidatos.filter((item) => pendentes.some((linha) => linha.produtoId === item.produtoId));
  return { ok: true, bling: await enviarAoBling(comPendencia, cliente, depositoId) };
}
