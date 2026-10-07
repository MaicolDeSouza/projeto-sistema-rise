import { prisma } from "@/lib/db";
import { estoqueDoKit } from "@/lib/composicao";

/**
 * O produto com composicao (kit) no banco: ler as pecas, trocar a lista inteira, recalcular o
 * estoque dos kits quando uma peca muda, e dizer quem usa uma peca. As contas moram em
 * `composicao.js` (puro); aqui so o Prisma.
 *
 * Toda funcao aceita um `tx` (transacao do Prisma) para rodar DENTRO da transacao de quem chama:
 * o ajuste rapido de estoque de uma peca e a gravacao em lote dos saldos do Bling recalculam os
 * kits no mesmo commit, senao uma queda no meio deixaria a peca com um saldo e o kit com outro.
 */

/// As colunas da peca que as contas e as abas do kit usam. `select`, e nao `include`: a lista de
/// Produtos carrega 25 kits por pagina, e a linha inteira da peca (descricao, fiscal) e peso morto.
const PECA = {
  id: true,
  sku: true,
  tituloBase: true,
  tipo: true,
  conferido: true,
  blingId: true,
  estoque: true,
  precoVenda: true,
  custo: true,
  pesoKg: true,
  alturaCm: true,
  larguraCm: true,
  comprimentoCm: true,
  ncm: true,
  fornecedores: {
    where: { padrao: true },
    select: {
      id: true,
      descricao: true,
      codigo: true,
      precoCusto: true,
      link: true,
      fornecedor: { select: { id: true, nome: true, site: true } },
    },
  },
};

/**
 * As pecas de um kit, na ordem da aba, cada uma com o produto da peca em `componente` (so as
 * colunas de `PECA`).
 *
 * @param {string} kitId
 * @param {import("@prisma/client").Prisma.TransactionClient} [tx]
 */
export async function lerPecasDoKit(kitId, tx = prisma) {
  return tx.produtoComponente.findMany({
    where: { kitId },
    orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }],
    select: { componenteId: true, quantidade: true, ordem: true, componente: { select: PECA } },
  });
}

/**
 * Confere se cada id pode ser peca de kit (decisao do dono em 07/10/2026): o produto existe, e
 * SIMPLES (kit dentro de kit fica fora), esta Conferido e ja esta vinculado ao Bling (`blingId`).
 * O recado diz o SKU e o motivo, um por vez, para o operador saber o que arrumar.
 *
 * @param {string[]} ids
 * @returns {Promise<{ok: true} | {ok: false, erro: string}>}
 */
export async function pecasPermitidas(ids, tx = prisma) {
  const procurados = [...new Set((Array.isArray(ids) ? ids : []).map(String))];
  if (procurados.length === 0) return { ok: true };

  const achados = await tx.produto.findMany({
    where: { id: { in: procurados } },
    select: { id: true, sku: true, tipo: true, conferido: true, blingId: true },
  });
  const porId = new Map(achados.map((produto) => [produto.id, produto]));

  for (const id of procurados) {
    const produto = porId.get(id);
    if (!produto) return { ok: false, erro: "Uma das peças não foi encontrada. Ela pode ter sido excluída; revise a composição." };
    if (produto.tipo !== "SIMPLES") {
      return { ok: false, erro: `${produto.sku} é um produto com composição e não pode ser peça de outro kit.` };
    }
    if (!produto.conferido) return { ok: false, erro: `${produto.sku} ainda não está conferido. Só produto conferido entra num kit.` };
    if (!produto.blingId) return { ok: false, erro: `${produto.sku} ainda não está vinculado ao Bling. Só produto vinculado entra num kit.` };
  }
  return { ok: true };
}

/// Grava `Produto.estoque` do kit com a conta das pecas.
async function gravarEstoqueDoKit(kitId, tx) {
  const pecas = await tx.produtoComponente.findMany({
    where: { kitId },
    select: { quantidade: true, componente: { select: { estoque: true } } },
  });
  const estoque = estoqueDoKit(pecas.map((peca) => ({ estoque: peca.componente.estoque, quantidade: peca.quantidade })));
  await tx.produto.update({ where: { id: kitId }, data: { estoque } });
  return estoque;
}

/**
 * Troca a composicao do kit pela lista enviada (a verdade inteira, como os fornecedores do
 * cadastro): apaga quem saiu, atualiza quantidade e ordem de quem ficou, cria quem entrou, e
 * grava o estoque do kit ja calculado. A validacao (`validarComposicao` + `pecasPermitidas`) e
 * de quem chama, ANTES; aqui se confia na lista.
 *
 * @param {string} kitId
 * @param {{componenteId: string, quantidade: number|string}[]} itens
 * @param {import("@prisma/client").Prisma.TransactionClient} [tx] sem `tx`, abre a propria transacao.
 * @returns {Promise<number>} o estoque gravado.
 */
export async function gravarComposicao(kitId, itens, tx = null) {
  const gravar = async (t) => {
    const lista = (Array.isArray(itens) ? itens : []).map((item, indice) => ({
      componenteId: String(item.componenteId),
      quantidade: Number(item.quantidade),
      ordem: indice,
    }));

    await t.produtoComponente.deleteMany({
      where: { kitId, componenteId: { notIn: lista.map((item) => item.componenteId) } },
    });
    for (const item of lista) {
      await t.produtoComponente.upsert({
        where: { kitId_componenteId: { kitId, componenteId: item.componenteId } },
        update: { quantidade: item.quantidade, ordem: item.ordem },
        create: { kitId, ...item },
      });
    }
    return gravarEstoqueDoKit(kitId, t);
  };
  return tx ? gravar(tx) : prisma.$transaction(gravar);
}

/**
 * Regrava o estoque de TODOS os kits que usam a peca. Chamado dentro da transacao que mudou o
 * estoque da peca (ajuste rapido, lote de saldos do Bling), para peca e kits mudarem juntos.
 *
 * @param {string} componenteId
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @returns {Promise<number>} quantos kits foram regravados.
 */
export async function recalcularKitsDaPeca(componenteId, tx = prisma) {
  const kits = await tx.produtoComponente.findMany({ where: { componenteId }, select: { kitId: true }, distinct: ["kitId"] });
  for (const { kitId } of kits) await gravarEstoqueDoKit(kitId, tx);
  return kits.length;
}

/**
 * Os kits em que o produto e peca (id e sku), para a exclusao recusar com nome e para a tela
 * avisar. Vazio quando nao esta em kit nenhum.
 *
 * @param {string} produtoId
 * @returns {Promise<{id: string, sku: string}[]>}
 */
export async function kitsQueUsam(produtoId, tx = prisma) {
  const linhas = await tx.produtoComponente.findMany({
    where: { componenteId: produtoId },
    select: { kit: { select: { id: true, sku: true } } },
    orderBy: { kit: { sku: "asc" } },
  });
  return linhas.map((linha) => linha.kit);
}
