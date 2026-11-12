import { z } from "zod";

import { prisma } from "@/lib/db";

import { sugerirLugar } from "./arrumacao";
import { lerMapa } from "./banco";
import { lerLocalizacao, textoDaLocalizacao } from "./regras";

/**
 * Mapa do estoque, fase 2: "Onde guardar este produto?", o Mover e o historico das trocas de lugar
 * (spec 2026-11-12-enderecamento-de-estoque-design.md, secao 11).
 */

const numeroOuNull = (valor) => (valor === null || valor === undefined ? null : Number(valor));
const vazioComoNull = (valor) => (valor === "" || valor === undefined ? null : valor);

/** O produto no formato das regras (a sugestao e a janela Mover). */
async function produtoParaRegras(produtoId, db) {
  const produto = await db.produto.findUnique({
    where: { id: String(produtoId ?? "") },
    select: {
      id: true,
      sku: true,
      tituloBase: true,
      localizacao: true,
      estoque: true,
      estoqueMaximo: true,
      pesoKg: true,
      larguraCm: true,
      alturaCm: true,
      comprimentoCm: true,
      modeloCaixinhaId: true,
      pecasPorCaixinha: true,
      ordemNaPrateleira: true,
      familiaEstoque: true,
    },
  });
  if (!produto) return null;
  return {
    ...produto,
    nome: produto.tituloBase,
    pesoKg: numeroOuNull(produto.pesoKg),
    larguraCm: numeroOuNull(produto.larguraCm),
    alturaCm: numeroOuNull(produto.alturaCm),
    comprimentoCm: numeroOuNull(produto.comprimentoCm),
  };
}

/** As ultimas trocas de lugar do produto, mais nova primeiro. */
export async function lerHistoricoDeLocal(produtoId, db = prisma, limite = 10) {
  const linhas = await db.historicoDeLocal.findMany({ where: { produtoId: String(produtoId ?? "") }, orderBy: { criadoEm: "desc" }, take: limite });
  return linhas.map((linha) => ({ id: linha.id, de: linha.de, para: linha.para, usuario: linha.usuario, em: linha.criadoEm.toISOString() }));
}

/** O que a janela Mover precisa: o produto, onde ele esta, os estoques com as colunas, os modelos e o historico. */
export async function lerParaMover(produtoId, db = prisma) {
  const produto = await produtoParaRegras(produtoId, db);
  if (!produto) return { ok: false, erro: "Produto não encontrado." };
  const [locais, colunas, modelos, historico] = await Promise.all([
    db.localDeEstoque.findMany({ orderBy: { numero: "asc" } }),
    db.colunaDeEstoque.findMany({ orderBy: [{ ordem: "asc" }, { letra: "asc" }], select: { id: true, localId: true, letra: true, prateleiras: true } }),
    db.modeloDeCaixinha.findMany({ where: { OR: [{ ativo: true }, { id: produto.modeloCaixinhaId ?? "" }] }, orderBy: { nome: "asc" } }),
    lerHistoricoDeLocal(produto.id, db),
  ]);
  const lida = lerLocalizacao(produto.localizacao);
  const colunaAtual = lida ? colunas.find((coluna) => coluna.letra === lida.letra) : null;
  return {
    ok: true,
    produto: {
      id: produto.id,
      sku: produto.sku,
      nome: produto.nome,
      localizacao: produto.localizacao,
      ordemNaPrateleira: produto.ordemNaPrateleira,
      modeloCaixinhaId: produto.modeloCaixinhaId,
      familia: produto.familiaEstoque,
    },
    localAtualId: colunaAtual?.localId ?? null,
    locais: locais.map((local) => ({ id: local.id, numero: local.numero, nome: local.nome, descricao: local.descricao, aplicaRegras: local.aplicaRegras })),
    colunas,
    modelos: modelos.map((modelo) => ({ id: modelo.id, nome: modelo.nome })),
    historico,
  };
}

/** "Onde guardar este produto?" num estoque: as 3 melhores posicoes pelas regras (ver `sugerirLugar`). */
export async function sugerirLugarParaProduto(produtoId, localId, db = prisma) {
  const produto = await produtoParaRegras(produtoId, db);
  if (!produto) return { ok: false, erro: "Produto não encontrado." };
  const { mapa, modelos } = await lerMapa(db);
  const local = mapa.locais.find((item) => item.id === localId);
  if (!local) return { ok: false, erro: "Estoque não encontrado." };
  return { ok: true, ...sugerirLugar(local, produto, modelos) };
}

const ESQUEMA_DO_MOVER = z.object({
  letra: z
    .string({ message: "Escolha a coluna." })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,2}$/, "Escolha a coluna."),
  prateleira: z.coerce.number({ message: "Informe a prateleira." }).int().min(1, "Informe a prateleira.").max(40),
  posicao: z.preprocess(vazioComoNull, z.coerce.number().int().min(1).max(500).nullable()),
  modeloCaixinhaId: z.preprocess(vazioComoNull, z.string().nullable()).optional(),
});

/**
 * Muda o produto de lugar: grava a Localizacao ("K3"), a posicao na prateleira (as caixinhas dali para a direita andam uma
 * casa) e, se veio, o modelo da caixinha; e anota no historico. A Localizacao vai ao Bling pelo Sincronizar de sempre (o "!"
 * do Bling acende). So o Mover do dono chama: os produtos do Estoque 1 nao mudam sem ele pedir (12/11/2026).
 */
export async function moverProduto(produtoId, dados, usuario = null, db = prisma) {
  const lido = ESQUEMA_DO_MOVER.safeParse(dados ?? {});
  if (!lido.success) return { ok: false, erro: lido.error.issues[0]?.message ?? "Dados inválidos." };
  const { letra, prateleira, posicao, modeloCaixinhaId } = lido.data;
  const coluna = await db.colunaDeEstoque.findUnique({ where: { letra }, select: { prateleiras: true, local: { select: { nome: true } } } });
  if (!coluna) return { ok: false, erro: `A coluna ${letra} não existe.` };
  if (prateleira > coluna.prateleiras) return { ok: false, erro: `A coluna ${letra} tem ${coluna.prateleiras} prateleira(s).` };
  if (modeloCaixinhaId) {
    const modelo = await db.modeloDeCaixinha.findUnique({ where: { id: modeloCaixinhaId }, select: { id: true } });
    if (!modelo) return { ok: false, erro: "Modelo de caixinha não encontrado." };
  }
  const para = textoDaLocalizacao(letra, prateleira);
  const comPosicao = (texto, ordem) => (texto ? `${texto}${ordem ? ` · ${ordem}ª` : ""}` : null);

  return db.$transaction(async (tx) => {
    const produto = await tx.produto.findUnique({ where: { id: String(produtoId ?? "") }, select: { id: true, sku: true, localizacao: true, ordemNaPrateleira: true } });
    if (!produto) return { ok: false, erro: "Produto não encontrado." };
    const de = produto.localizacao?.trim() || null;
    let novaOrdem = null;
    if (posicao) {
      // A posicao e a que a tela mostra (a enesima caixinha entre as OUTRAS da prateleira, na ordem do desenho: numeradas
      // primeiro, depois por codigo). Por isso a prateleira e renumerada inteira, 1, 2, 3...: somar 1 a quem tinha posicao
      // >= N errava quando havia buracos ou caixinhas sem numero (achado na tela em 12/11/2026).
      const outras = (
        await tx.produto.findMany({
          where: { ativo: true, id: { not: produto.id }, localizacao: { equals: para, mode: "insensitive" } },
          select: { id: true, sku: true, ordemNaPrateleira: true },
        })
      ).sort(
        (a, b) =>
          (a.ordemNaPrateleira ?? Number.MAX_SAFE_INTEGER) - (b.ordemNaPrateleira ?? Number.MAX_SAFE_INTEGER) || String(a.sku).localeCompare(String(b.sku), "pt-BR", { numeric: true }),
      );
      const indice = Math.min(posicao, outras.length + 1) - 1;
      novaOrdem = indice + 1;
      const ordem = [...outras.slice(0, indice), null, ...outras.slice(indice)];
      // SQL direto: a posicao dos vizinhos nao e edicao deles, e o `atualizadoEm` deles nao deve mudar (o rascunho
      // automatico do cadastro o compara).
      for (const [i, outra] of ordem.entries()) {
        if (outra && outra.ordemNaPrateleira !== i + 1) await tx.$executeRaw`UPDATE "Produto" SET "ordemNaPrateleira" = ${i + 1} WHERE "id" = ${outra.id}`;
      }
    }
    await tx.produto.update({
      where: { id: produto.id },
      data: { localizacao: para, ordemNaPrateleira: novaOrdem, ...(modeloCaixinhaId ? { modeloCaixinhaId } : {}) },
    });
    if (de !== para || produto.ordemNaPrateleira !== novaOrdem) {
      await tx.historicoDeLocal.create({
        data: { produtoId: produto.id, sku: produto.sku, de: comPosicao(de, produto.ordemNaPrateleira), para: comPosicao(para, novaOrdem), usuario },
      });
    }
    return { ok: true, para, estoque: coluna.local.nome };
  });
}
