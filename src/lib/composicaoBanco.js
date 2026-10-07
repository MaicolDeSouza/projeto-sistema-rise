import { prisma } from "@/lib/db";
import { estoqueDoKit, validarComposicao } from "@/lib/composicao";

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
  fornecedorRascunho: true,
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

/// Decimal do Prisma (ou texto) em numero; nulo continua nulo. O Decimal nao atravessa para a tela.
const numeroOuNull = (valor) => (valor === null || valor === undefined || valor === "" ? null : Number(valor));

/**
 * Uma peca (lida com `PECA`) no formato da aba Composicao e das abas do kit: numeros simples, o
 * fornecedor padrao achatado e a quantidade no kit. O custo e o do fornecedor padrao e, na falta dele,
 * o do cadastro (a regra do sistema: "custo do produto vem do fornecedor padrao").
 *
 * Sem fornecedor confirmado, vale o RASCUNHO da importacao do Bling (`fornecedorRascunho`), como na margem
 * da lista de Produtos: e onde esta o fornecedor e o custo da maioria dos produtos importados (as pecas do
 * 990204 so tinham ele). Vai marcado `rascunho: true` para a tela dizer de onde veio.
 *
 * @param {object} produto linha de `Produto` lida com o select `PECA`
 * @param {number} quantidade
 */
export function pecaParaTela(produto, quantidade = 1) {
  const padrao = produto.fornecedores?.[0] ?? null;
  const rascunho = !padrao && produto.fornecedorRascunho?.nome ? produto.fornecedorRascunho : null;
  const custoRascunho = Number(rascunho?.precoCusto) > 0 ? Number(rascunho.precoCusto) : null;
  return {
    componenteId: produto.id,
    sku: produto.sku,
    tituloBase: produto.tituloBase,
    estoque: produto.estoque,
    quantidade,
    precoVenda: numeroOuNull(produto.precoVenda),
    custo: numeroOuNull(padrao?.precoCusto ?? produto.custo) ?? custoRascunho,
    pesoKg: numeroOuNull(produto.pesoKg),
    comprimentoCm: numeroOuNull(produto.comprimentoCm),
    larguraCm: numeroOuNull(produto.larguraCm),
    alturaCm: numeroOuNull(produto.alturaCm),
    ncm: produto.ncm ?? null,
    fornecedor: padrao
      ? {
          id: padrao.id,
          nome: padrao.fornecedor.nome,
          descricao: padrao.descricao ?? null,
          codigo: padrao.codigo ?? null,
          precoCusto: numeroOuNull(padrao.precoCusto),
          link: padrao.link ?? null,
          site: padrao.fornecedor.site ?? null,
          rascunho: false,
        }
      : rascunho
        ? {
            id: null,
            nome: String(rascunho.nome),
            descricao: rascunho.descricao ?? null,
            codigo: rascunho.codigo ?? null,
            precoCusto: custoRascunho,
            // A "Descricao no fornecedor" do Bling e, na pratica, o link do produto no site do fornecedor.
            link: /^https?:\/\//i.test(String(rascunho.descricao ?? "")) ? rascunho.descricao : null,
            site: null,
            rascunho: true,
          }
        : null,
  };
}

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

/**
 * Grava `Produto.estoque` do kit com a conta das pecas. SQL cru de proposito, como o botao de saldos
 * do Bling: o `@updatedAt` do Prisma nao age e o `atualizadoEm` do kit fica como estava. Mudar o
 * estoque de uma peca nao e editar o kit — a lista ordena por `atualizadoEm`, e o envio ao Bling o
 * usa para saber se o produto foi editado no meio do envio.
 */
async function gravarEstoqueDoKit(kitId, tx) {
  const pecas = await tx.produtoComponente.findMany({
    where: { kitId },
    select: { quantidade: true, componente: { select: { estoque: true } } },
  });
  const estoque = estoqueDoKit(pecas.map((peca) => ({ estoque: peca.componente.estoque, quantidade: peca.quantidade })));
  await tx.$executeRaw`UPDATE "Produto" SET "estoque" = ${estoque} WHERE "id" = ${kitId}`;
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
  return recalcularKitsDasPecas([componenteId], tx);
}

/**
 * O mesmo que `recalcularKitsDaPeca`, para varias pecas de uma vez: cada kit e regravado UMA vez,
 * mesmo usando varias das pecas. E o caso do lote de saldos do Bling (100 produtos por vez).
 *
 * @param {string[]} componenteIds
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 * @returns {Promise<number>} quantos kits foram regravados.
 */
export async function recalcularKitsDasPecas(componenteIds, tx = prisma) {
  const ids = [...new Set((Array.isArray(componenteIds) ? componenteIds : []).map(String))];
  if (ids.length === 0) return 0;
  const kits = await tx.produtoComponente.findMany({ where: { componenteId: { in: ids } }, select: { kitId: true }, distinct: ["kitId"] });
  for (const { kitId } of kits) await gravarEstoqueDoKit(kitId, tx);
  return kits.length;
}

/**
 * Confere o tipo e a composicao que o cadastro mandou, ANTES de gravar qualquer coisa do produto: uma
 * peca recusada nao pode deixar o produto salvo pela metade. Fica aqui, e nao no `salvarProduto`, porque
 * o teste chama direto (a acao chama `revalidatePath`, que so existe dentro do Next).
 *
 * - `tipo` ausente (formulario aberto antes do campo existir) mantem o tipo gravado: um padrao aqui
 *   transformaria um kit em simples e apagaria as pecas sem o operador pedir.
 * - Kit sem o campo `composicao` mantem as pecas gravadas; produto que VIRA kit sem o campo e recusado.
 * - Produto que ja e peca de outro kit nao vira kit (kit dentro de kit ficou fora, decisao do dono).
 *
 * @param {{produtoId: string|null, tipo?: "SIMPLES"|"COMPOSICAO", campo: string|null}} entrada
 * @returns {Promise<{ok: true, tipo: string, itens: null | {componenteId: string, quantidade: number}[]} | {ok: false, erro: string}>}
 *   `itens` nulo = nao mexer nas pecas; lista = a composicao nova (vazia no tipo simples, que apaga as pecas).
 */
export async function prepararComposicaoDoCadastro({ produtoId, tipo, campo }, tx = prisma) {
  const gravado = produtoId ? await tx.produto.findUnique({ where: { id: produtoId }, select: { tipo: true } }) : null;
  const tipoFinal = tipo ?? gravado?.tipo ?? "SIMPLES";
  if (tipoFinal !== "COMPOSICAO") return { ok: true, tipo: tipoFinal, itens: [] };

  if (produtoId) {
    const usos = await kitsQueUsam(produtoId, tx);
    if (usos.length > 0) {
      const nomes = usos.map((kit) => kit.sku).join(", ");
      return {
        ok: false,
        erro: `Este produto é peça ${usos.length === 1 ? "do kit" : "dos kits"} ${nomes}, e um kit não pode ser peça de outro kit. Tire-o da composição antes.`,
      };
    }
  }

  if (campo === null || campo === undefined) {
    if (gravado?.tipo === "COMPOSICAO") return { ok: true, tipo: tipoFinal, itens: null };
    return { ok: false, erro: "Escolha as peças do kit na aba Composição." };
  }

  let lista;
  try {
    lista = JSON.parse(String(campo));
  } catch {
    return { ok: false, erro: "Revise a composição antes de salvar." };
  }
  if (!Array.isArray(lista)) return { ok: false, erro: "Revise a composição antes de salvar." };

  const itens = lista.map((item) => ({ componenteId: String(item?.componenteId ?? ""), quantidade: Number(item?.quantidade) }));
  const regras = validarComposicao(itens, { produtoId });
  if (!regras.ok) return regras;
  const permitidas = await pecasPermitidas(itens.map((item) => item.componenteId), tx);
  if (!permitidas.ok) return permitidas;

  return { ok: true, tipo: tipoFinal, itens };
}

/**
 * Aplica o que `prepararComposicaoDoCadastro` decidiu, dentro da transacao que gravou o produto: o kit
 * nunca existe sem as pecas, nem as pecas sem o kit.
 *
 * @param {string} produtoId
 * @param {{tipo: string, itens: null | {componenteId: string, quantidade: number}[]}} preparo
 * @param {import("@prisma/client").Prisma.TransactionClient} tx
 */
export async function gravarComposicaoDoCadastro(produtoId, preparo, tx) {
  if (preparo.itens === null) return;
  // Simples: as pecas saem. O estoque fica o ultimo calculado e volta a ser editavel na lista.
  if (preparo.tipo !== "COMPOSICAO") {
    await tx.produtoComponente.deleteMany({ where: { kitId: produtoId } });
    return;
  }
  await gravarComposicao(produtoId, preparo.itens, tx);
}

/**
 * Os produtos que podem entrar num kit, para a busca da aba Composicao: simples, Conferidos e ja ligados
 * ao Bling (decisao do dono em 07/10/2026), por SKU ou nome, ate 20. Sem nenhum permitido, devolve ate 5
 * dos que casaram e foram barrados, com o motivo: senao o operador acharia que o produto nao existe.
 *
 * @param {string} termo
 * @param {string[]} excluir ids que nao entram (o proprio produto e as pecas ja escolhidas)
 */
export async function pecasParaKit(termo, excluir = [], tx = prisma) {
  const texto = String(termo ?? "").trim().slice(0, 80);
  if (texto.length < 2) return { itens: [], barrados: [] };
  const ignorar = (Array.isArray(excluir) ? excluir : []).map(String).slice(0, 500);
  const casa = {
    id: { notIn: ignorar },
    OR: [
      { sku: { contains: texto, mode: "insensitive" } },
      { tituloBase: { contains: texto, mode: "insensitive" } },
    ],
  };

  const achados = await tx.produto.findMany({
    where: { ...casa, tipo: "SIMPLES", conferido: true, blingId: { not: null } },
    select: PECA,
    orderBy: { sku: "asc" },
    take: 20,
  });
  // Ja no formato da aba: a peca escolhida entra com preco, peso e fornecedor, sem outra consulta.
  if (achados.length > 0) return { itens: achados.map((produto) => pecaParaTela(produto)), barrados: [] };

  const outros = await tx.produto.findMany({
    where: casa,
    select: { sku: true, tituloBase: true, tipo: true, conferido: true, blingId: true },
    orderBy: { sku: "asc" },
    take: 5,
  });
  const barrados = outros.map((produto) => ({
    sku: produto.sku,
    tituloBase: produto.tituloBase,
    motivo:
      produto.tipo !== "SIMPLES"
        ? "é um kit"
        : !produto.conferido
          ? "não está conferido"
          : "não está vinculado ao Bling",
  }));
  return { itens: [], barrados };
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
