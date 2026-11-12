import { z } from "zod";

import { urlDe } from "@/lib/arquivos";
import { prisma } from "@/lib/db";

import { montarMapaComAvisos } from "./arrumacao";
import { colunasPelaLocalizacao, lerLocalizacao } from "./regras";

/**
 * Leitura e gravacao do Mapa do estoque (spec 2026-11-12-enderecamento-de-estoque-design.md). O lugar do produto e a
 * `localizacao` do cadastro: aqui so se le, e grava-se o que ela nao diz (colunas, caixinhas, ordem na prateleira).
 */

const numeroOuNull = (valor) => (valor === null || valor === undefined ? null : Number(valor));

function colunaParaTela(coluna) {
  return {
    id: coluna.id,
    localId: coluna.localId,
    letra: coluna.letra,
    ordem: coluna.ordem,
    prateleiras: coluna.prateleiras,
    larguraCm: numeroOuNull(coluna.larguraCm),
    profundidadeCm: numeroOuNull(coluna.profundidadeCm),
    alturaLivreCm: numeroOuNull(coluna.alturaLivreCm),
    pesoMaximoKg: numeroOuNull(coluna.pesoMaximoKg),
    xCm: numeroOuNull(coluna.xCm),
    zCm: numeroOuNull(coluna.zCm),
    giroGraus: coluna.giroGraus,
  };
}

function modeloParaTela(modelo) {
  return {
    id: modelo.id,
    nome: modelo.nome,
    cor: modelo.cor,
    larguraCm: Number(modelo.larguraCm),
    alturaCm: Number(modelo.alturaCm),
    profundidadeCm: Number(modelo.profundidadeCm),
    fatorUtil: Number(modelo.fatorUtil),
    pesoVazioKg: numeroOuNull(modelo.pesoVazioKg),
    ativo: modelo.ativo,
    produtos: modelo._count?.produtos ?? 0,
  };
}

/** Os produtos ativos com localizacao, no formato que `montarMapa` le (a foto e a principal do cadastro). */
async function produtosComLocalizacao(db) {
  const linhas = await db.produto.findMany({
    where: { ativo: true, NOT: [{ localizacao: null }, { localizacao: "" }] },
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
      arquivos: { where: { tipo: "IMAGEM" }, orderBy: [{ principal: "desc" }, { ordem: "asc" }], take: 1, select: { arquivo: true } },
    },
  });
  return linhas.map((produto) => ({
    id: produto.id,
    sku: produto.sku,
    nome: produto.tituloBase,
    localizacao: produto.localizacao,
    estoque: produto.estoque,
    estoqueMaximo: produto.estoqueMaximo,
    pesoKg: numeroOuNull(produto.pesoKg),
    larguraCm: numeroOuNull(produto.larguraCm),
    alturaCm: numeroOuNull(produto.alturaCm),
    comprimentoCm: numeroOuNull(produto.comprimentoCm),
    modeloCaixinhaId: produto.modeloCaixinhaId,
    pecasPorCaixinha: produto.pecasPorCaixinha,
    ordemNaPrateleira: produto.ordemNaPrateleira,
    familiaEstoque: produto.familiaEstoque,
    foto: produto.arquivos[0] ? urlDe(produto.sku, "IMAGEM", produto.arquivos[0].arquivo) : null,
  }));
}

/** Tudo o que a tela do mapa precisa: a cena montada, as colunas e os modelos para o cadastro. */
export async function lerMapa(db = prisma) {
  const [locais, colunas, modelos, produtos] = await Promise.all([
    db.localDeEstoque.findMany({ orderBy: { numero: "asc" } }),
    db.colunaDeEstoque.findMany({ orderBy: [{ ordem: "asc" }, { letra: "asc" }] }),
    db.modeloDeCaixinha.findMany({ orderBy: { nome: "asc" }, include: { _count: { select: { produtos: true } } } }),
    produtosComLocalizacao(db),
  ]);
  const colunasDaTela = colunas.map(colunaParaTela);
  const modelosDaTela = modelos.map(modeloParaTela);
  const usoPorLetra = new Map();
  for (const produto of produtos) {
    const lida = lerLocalizacao(produto.localizacao);
    if (lida) usoPorLetra.set(lida.letra, (usoPorLetra.get(lida.letra) ?? 0) + 1);
  }
  return {
    mapa: montarMapaComAvisos({ locais, colunas: colunasDaTela, modelos: modelosDaTela, produtos }),
    locais: locais.map((local) => ({ id: local.id, numero: local.numero, nome: local.nome, descricao: local.descricao, aplicaRegras: local.aplicaRegras, primeiraEmbaixo: local.primeiraEmbaixo })),
    colunas: colunasDaTela.map((coluna) => ({ ...coluna, produtos: usoPorLetra.get(coluna.letra) ?? 0 })),
    modelos: modelosDaTela,
  };
}

/**
 * Cria no Estoque 1 as colunas das letras que as localizacoes usam e ainda nao existem (todas as pecas estao hoje no
 * Estoque 1, dono em 12/11/2026). Repetir nao duplica: so cria o que falta.
 */
export async function criarColunasPelaLocalizacao(db = prisma) {
  const [local, existentes, produtos] = await Promise.all([
    db.localDeEstoque.findUnique({ where: { numero: 1 } }),
    db.colunaDeEstoque.findMany({ select: { letra: true, ordem: true } }),
    db.produto.findMany({ where: { ativo: true, NOT: [{ localizacao: null }, { localizacao: "" }] }, select: { localizacao: true } }),
  ]);
  if (!local) return { ok: false, erro: "O Estoque 1 não está cadastrado." };
  const novas = colunasPelaLocalizacao(produtos.map((produto) => produto.localizacao), existentes.map((coluna) => coluna.letra));
  if (!novas.length) return { ok: true, criadas: 0 };
  const proximaOrdem = existentes.reduce((maior, coluna) => Math.max(maior, coluna.ordem), 0) + 1;
  await db.colunaDeEstoque.createMany({
    data: novas.map((coluna, indice) => ({ localId: local.id, letra: coluna.letra, prateleiras: coluna.prateleiras, ordem: proximaOrdem + indice })),
    skipDuplicates: true,
  });
  return { ok: true, criadas: novas.length, letras: novas.map((coluna) => coluna.letra) };
}

const vazioComoNull = (valor) => (valor === "" || valor === undefined ? null : valor);
const medida = z.preprocess(vazioComoNull, z.coerce.number().positive("A medida precisa ser maior que zero.").max(100000).nullable());
const medidaObrigatoria = z.coerce.number({ message: "Informe a medida." }).positive("A medida precisa ser maior que zero.").max(100000);

const ESQUEMA_DA_COLUNA = z.object({
  localId: z.string().min(1, "Escolha o estoque."),
  letra: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{1,2}$/, "A coluna é uma ou duas letras."),
  ordem: z.coerce.number().int().min(0).max(9999),
  prateleiras: z.coerce.number().int().min(1, "A coluna tem ao menos uma prateleira.").max(40),
  larguraCm: medida,
  profundidadeCm: medida,
  alturaLivreCm: medida,
  pesoMaximoKg: medida,
});

const primeiroErro = (resultado) => resultado.error.issues[0]?.message ?? "Dados inválidos.";

/** Cria (sem id) ou altera uma coluna. Trocar a letra de uma coluna com produtos e recusado: a localizacao deles ficaria solta. */
export async function salvarColuna(id, dados, db = prisma) {
  const lido = ESQUEMA_DA_COLUNA.safeParse(dados ?? {});
  if (!lido.success) return { ok: false, erro: primeiroErro(lido) };
  const coluna = lido.data;
  const repetida = await db.colunaDeEstoque.findFirst({ where: { letra: coluna.letra, ...(id ? { NOT: { id } } : {}) }, select: { local: { select: { nome: true } } } });
  if (repetida) return { ok: false, erro: `A coluna ${coluna.letra} já existe no ${repetida.local.nome}.` };
  if (id) {
    const atual = await db.colunaDeEstoque.findUnique({ where: { id }, select: { letra: true } });
    if (!atual) return { ok: false, erro: "Coluna não encontrada." };
    if (atual.letra !== coluna.letra && (await produtosDaLetra(atual.letra, db)) > 0) {
      return { ok: false, erro: `A coluna ${atual.letra} tem produtos: a letra não muda.` };
    }
    await db.colunaDeEstoque.update({ where: { id }, data: coluna });
  } else {
    await db.colunaDeEstoque.create({ data: coluna });
  }
  return { ok: true };
}

/** Quantos produtos ativos tem a localizacao nesta letra (com ou sem o numero da prateleira). */
async function produtosDaLetra(letra, db) {
  const candidatos = await db.produto.findMany({ where: { ativo: true, localizacao: { startsWith: letra, mode: "insensitive" } }, select: { localizacao: true } });
  return candidatos.filter((produto) => lerLocalizacao(produto.localizacao)?.letra === letra).length;
}

/** Exclui a coluna vazia. Com produto, recusa dizendo quantos (regra 8: a tela ja desabilita a lixeira). */
export async function excluirColuna(id, db = prisma) {
  const coluna = await db.colunaDeEstoque.findUnique({ where: { id }, select: { letra: true } });
  if (!coluna) return { ok: false, erro: "Coluna não encontrada." };
  const quantos = await produtosDaLetra(coluna.letra, db);
  if (quantos > 0) return { ok: false, erro: `A coluna ${coluna.letra} tem ${quantos} produto(s) e não pode ser excluída.` };
  await db.colunaDeEstoque.delete({ where: { id } });
  return { ok: true };
}

/** "A prateleira 1 e a de baixo?" de um estoque. */
export async function salvarLocal(id, { primeiraEmbaixo }, db = prisma) {
  const local = await db.localDeEstoque.findUnique({ where: { id }, select: { id: true } });
  if (!local) return { ok: false, erro: "Estoque não encontrado." };
  await db.localDeEstoque.update({ where: { id }, data: { primeiraEmbaixo: Boolean(primeiraEmbaixo) } });
  return { ok: true };
}

const ESQUEMA_DO_MODELO = z.object({
  nome: z.string().trim().min(1, "Informe o nome do modelo.").max(60),
  cor: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida."),
  larguraCm: medidaObrigatoria,
  alturaCm: medidaObrigatoria,
  profundidadeCm: medidaObrigatoria,
  fatorUtil: z.coerce.number().min(0.1, "O volume útil vai de 10% a 100%.").max(1, "O volume útil vai de 10% a 100%."),
  pesoVazioKg: medida,
  ativo: z.coerce.boolean().default(true),
});

/** Cria (sem id) ou altera um modelo de caixinha. */
export async function salvarModelo(id, dados, db = prisma) {
  const lido = ESQUEMA_DO_MODELO.safeParse(dados ?? {});
  if (!lido.success) return { ok: false, erro: primeiroErro(lido) };
  const modelo = lido.data;
  const repetido = await db.modeloDeCaixinha.findFirst({ where: { nome: { equals: modelo.nome, mode: "insensitive" }, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
  if (repetido) return { ok: false, erro: `Já existe um modelo "${modelo.nome}".` };
  if (id) await db.modeloDeCaixinha.update({ where: { id }, data: modelo });
  else await db.modeloDeCaixinha.create({ data: modelo });
  return { ok: true };
}

/** Exclui o modelo sem uso. Em uso, recusa (desativar continua possivel pelo Salvar). */
export async function excluirModelo(id, db = prisma) {
  const modelo = await db.modeloDeCaixinha.findUnique({ where: { id }, select: { nome: true, _count: { select: { produtos: true } } } });
  if (!modelo) return { ok: false, erro: "Modelo não encontrado." };
  if (modelo._count.produtos > 0) return { ok: false, erro: `O modelo "${modelo.nome}" está em ${modelo._count.produtos} produto(s) e não pode ser excluído.` };
  await db.modeloDeCaixinha.delete({ where: { id } });
  return { ok: true };
}

const inteiroOuNull = z.preprocess(vazioComoNull, z.coerce.number().int().min(1, "Informe um número a partir de 1.").max(1000000).nullable());
const ESQUEMA_DA_CAIXINHA = z.object({
  modeloCaixinhaId: z.preprocess(vazioComoNull, z.string().nullable()),
  pecasPorCaixinha: inteiroOuNull,
  ordemNaPrateleira: inteiroOuNull,
});

/** A caixinha de UM produto: o modelo, as pecas por caixinha digitadas e a posicao na prateleira. */
export async function salvarCaixinhaDoProduto(produtoId, dados, db = prisma) {
  const lido = ESQUEMA_DA_CAIXINHA.safeParse(dados ?? {});
  if (!lido.success) return { ok: false, erro: primeiroErro(lido) };
  const produto = await db.produto.findUnique({ where: { id: String(produtoId ?? "") }, select: { id: true } });
  if (!produto) return { ok: false, erro: "Produto não encontrado." };
  if (lido.data.modeloCaixinhaId) {
    const modelo = await db.modeloDeCaixinha.findUnique({ where: { id: lido.data.modeloCaixinhaId }, select: { id: true } });
    if (!modelo) return { ok: false, erro: "Modelo de caixinha não encontrado." };
  }
  // SQL direto, para NAO mexer no `atualizadoEm` do produto: o cadastro aberto ao lado compara essa data (rascunho
  // automatico) e trataria a caixinha como "o produto foi salvo de novo".
  await db.$executeRaw`UPDATE "Produto" SET "modeloCaixinhaId" = ${lido.data.modeloCaixinhaId}, "pecasPorCaixinha" = ${lido.data.pecasPorCaixinha}, "ordemNaPrateleira" = ${lido.data.ordemNaPrateleira} WHERE "id" = ${produto.id}`;
  return { ok: true };
}

/** O que o bloco "Caixinha do estoque" do cadastro do produto mostra: o que esta gravado e os modelos ativos. */
export async function lerCaixinhaDoProduto(produtoId, db = prisma) {
  const [produto, modelos] = await Promise.all([
    db.produto.findUnique({ where: { id: String(produtoId ?? "") }, select: { modeloCaixinhaId: true, pecasPorCaixinha: true, ordemNaPrateleira: true } }),
    db.modeloDeCaixinha.findMany({ orderBy: { nome: "asc" } }),
  ]);
  if (!produto) return null;
  return {
    modeloCaixinhaId: produto.modeloCaixinhaId,
    pecasPorCaixinha: produto.pecasPorCaixinha,
    ordemNaPrateleira: produto.ordemNaPrateleira,
    // O modelo desativado so aparece no produto que ja o usa.
    modelos: modelos.filter((modelo) => modelo.ativo || modelo.id === produto.modeloCaixinhaId).map(modeloParaTela),
  };
}
