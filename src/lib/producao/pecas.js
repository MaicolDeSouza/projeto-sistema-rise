import { urlDe } from "@/lib/arquivos";
import { custoDoProduto } from "@/lib/canaisDeVenda/custo";
import { prisma } from "@/lib/db";

import { custoDasPecas, validarPecas } from "./regras.js";

/**
 * Pecas proprias de um produto no banco (spec 2026-10-26-producao-pecas-proprias-design.md): leitura no formato da
 * tela, busca de pecas, gravacao no Salvar do cadastro e o custo que acompanha a peca.
 */

/// O que se le do produto que e peca: o custo dele (fornecedor padrao, rascunho do Bling, cadastro), a foto e o
/// estoque com o minimo e o maximo para o icone.
const PECA = {
  id: true,
  sku: true,
  tituloBase: true,
  localizacao: true,
  estoque: true,
  estoqueMinimo: true,
  estoqueMaximo: true,
  custo: true,
  pecasProprias: true,
  fornecedorRascunho: true,
  fornecedores: { where: { padrao: true }, select: { padrao: true, precoCusto: true } },
  arquivos: { where: { tipo: "IMAGEM", papel: "FOTO" }, orderBy: { ordem: "asc" }, take: 1, select: { arquivo: true } },
};

const numeroOuNull = (valor) => (valor === null || valor === undefined || valor === "" ? null : Number(valor));

/** Um produto do Rise como linha da tabela (a quantidade e o id da linha vem de quem chama). */
function produtoComoPeca(produto) {
  const custo = custoDoProduto(produto);
  return {
    componenteId: produto.id,
    sku: produto.sku,
    nome: produto.tituloBase,
    foto: produto.arquivos?.[0] ? urlDe(produto.sku, "IMAGEM", produto.arquivos[0].arquivo) : null,
    localizacao: produto.localizacao ?? null,
    estoque: produto.estoque,
    estoqueMinimo: produto.estoqueMinimo ?? null,
    estoqueMaximo: produto.estoqueMaximo ?? null,
    custo: custo.valor,
    custoOrigem: custo.origem,
    descricao: null,
    custoManual: null,
  };
}

/** As pecas proprias de um produto, na ordem da tabela. */
export async function lerPecasDoProduto(produtoId, cliente = prisma) {
  const linhas = await cliente.pecaPropriaDoProduto.findMany({
    where: { produtoId: String(produtoId) },
    orderBy: { ordem: "asc" },
    include: { componente: { select: PECA } },
  });
  return linhas.map((linha) => {
    const quantidade = Number(linha.quantidade);
    if (linha.componente) return { id: linha.id, ordem: linha.ordem, ...produtoComoPeca(linha.componente), quantidade };
    const custoManual = numeroOuNull(linha.custoManual);
    return {
      id: linha.id,
      ordem: linha.ordem,
      componenteId: null,
      sku: null,
      nome: linha.descricao,
      foto: null,
      localizacao: null,
      estoque: null,
      estoqueMinimo: null,
      estoqueMaximo: null,
      custo: custoManual,
      custoOrigem: "manual",
      descricao: linha.descricao,
      custoManual,
      quantidade,
    };
  });
}

/** Busca de pecas pelo codigo ou pelo nome: so produto simples (kit fica fora), sem o proprio e sem os ja na lista. */
export async function buscarPecasProprias(texto, excluirIds = [], cliente = prisma) {
  const termo = String(texto ?? "").trim().slice(0, 80);
  if (termo.length < 2) return [];
  const produtos = await cliente.produto.findMany({
    where: {
      tipo: "SIMPLES",
      id: { notIn: (Array.isArray(excluirIds) ? excluirIds : []).map(String).slice(0, 500) },
      OR: [{ sku: { contains: termo, mode: "insensitive" } }, { tituloBase: { contains: termo, mode: "insensitive" } }],
    },
    select: PECA,
    orderBy: { sku: "asc" },
    take: 20,
  });
  return produtos.map(produtoComoPeca);
}

/**
 * Confere o campo `pecasProprias` do formulario ANTES de gravar o produto (o teste chama direto: a acao do Salvar
 * usa `revalidatePath`, que so existe dentro do Next).
 *
 * - Campo ausente (formulario aberto antes dele, ou quem nao ve custo): `gravar` nulo = nao mexe em nada.
 * - Kit nao tem pecas proprias; peca precisa existir e ser produto simples.
 *
 * @returns {Promise<{ok: true, gravar: null | {pecasProprias: boolean, pecas: object[]}} | {ok: false, erro: string}>}
 */
export async function prepararPecasDoCadastro({ produtoId, tipo, campo }, cliente = prisma) {
  if (campo === null || campo === undefined) return { ok: true, gravar: null };
  let bruto;
  try {
    bruto = JSON.parse(String(campo));
  } catch {
    return { ok: false, erro: "Lista de peças próprias inválida. Recarregue a página." };
  }
  if (!bruto?.ligado) return { ok: true, gravar: { pecasProprias: false, pecas: [] } };
  if (tipo === "COMPOSICAO") return { ok: false, erro: "Kit não tem peças próprias: o custo e o estoque dele vêm da composição." };

  const conferida = validarPecas(bruto.pecas ?? [], produtoId);
  if (!conferida.ok) return conferida;
  const ids = conferida.pecas.map((peca) => peca.componenteId).filter(Boolean);
  if (ids.length > 0) {
    const achados = await cliente.produto.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true, tipo: true } });
    if (achados.length !== ids.length) return { ok: false, erro: "Uma peça foi excluída do Rise. Revise a lista de peças próprias." };
    const kit = achados.find((produto) => produto.tipo !== "SIMPLES");
    if (kit) return { ok: false, erro: `O kit ${kit.sku} não pode ser peça própria.` };
  }
  return { ok: true, gravar: { pecasProprias: true, pecas: conferida.pecas } };
}

/** Os produtos em que este entra como peca propria (para recusar a exclusao com o recado). */
export async function produtosQueUsamComoPeca(componenteId, cliente = prisma) {
  const linhas = await cliente.pecaPropriaDoProduto.findMany({
    where: { componenteId: String(componenteId) },
    select: { produto: { select: { sku: true } } },
    distinct: ["produtoId"],
  });
  return linhas.map((linha) => linha.produto.sku);
}

/** O custo total das pecas gravadas, relido do banco (o custo de cada peca e o de hoje). */
async function custoGravado(produtoId, cliente) {
  const pecas = await lerPecasDoProduto(produtoId, cliente);
  return custoDasPecas(pecas).total;
}

/**
 * Grava o liga/desliga e a lista inteira (ja validada por `validarPecas`), DENTRO da transacao do Salvar. Ligado, o
 * custo do produto passa a ser o total das pecas (nulo se faltar custo de alguma). Desligado apaga a lista e NAO mexe
 * no custo: o custo volta a sair do fornecedor padrao, como antes de ligar.
 */
export async function gravarPecasProprias(tx, produtoId, { pecasProprias, pecas }) {
  const id = String(produtoId);
  await tx.pecaPropriaDoProduto.deleteMany({ where: { produtoId: id } });
  if (!pecasProprias) {
    await tx.produto.update({ where: { id }, data: { pecasProprias: false } });
    return;
  }
  if (pecas.length > 0) {
    await tx.pecaPropriaDoProduto.createMany({
      data: pecas.map((peca) => ({
        produtoId: id,
        ordem: peca.ordem,
        componenteId: peca.componenteId,
        descricao: peca.descricao,
        custoManual: peca.custoManual,
        quantidade: peca.quantidade,
      })),
    });
  }
  await tx.produto.update({ where: { id }, data: { pecasProprias: true, custo: await custoGravado(id, tx) } });
}

/**
 * O custo de uma peca mudou: os produtos com pecas proprias que a usam regravam o custo. SQL cru para o
 * `atualizadoEm` nao subir (a lista ordena por ele, e o produto em si nao foi editado), como o recalculo do kit.
 */
export async function recalcularCustoDosProdutosQueUsam(componenteId, cliente = prisma) {
  const usos = await cliente.pecaPropriaDoProduto.findMany({
    where: { componenteId: String(componenteId), produto: { pecasProprias: true } },
    select: { produtoId: true },
    distinct: ["produtoId"],
  });
  for (const { produtoId } of usos) {
    const total = await custoGravado(produtoId, cliente);
    await cliente.$executeRaw`UPDATE "Produto" SET "custo" = ${total} WHERE "id" = ${produtoId}`;
  }
  return usos.length;
}
