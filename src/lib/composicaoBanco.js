import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { urlDe } from "@/lib/arquivos";
import { estoqueDoKit, faltasParaSerPeca, localizacaoDoKit, mudancasDaPeca, validarComposicao } from "@/lib/composicao";

/// As colunas que o retrato da peca usa (`retratoDaPeca`). As fotos sao so as do carrossel (`papel: "FOTO"`):
/// a reserva nao e do produto. Os documentos entram pelo nome.
const SELECT_RETRATO = {
  tituloBase: true,
  descricaoBase: true,
  precoVenda: true,
  pesoKg: true,
  comprimentoCm: true,
  larguraCm: true,
  alturaCm: true,
  ncm: true,
  ativo: true,
  conferido: true,
  arquivos: {
    where: { OR: [{ tipo: "IMAGEM", papel: "FOTO" }, { tipo: { in: ["DOCUMENTO", "CERTIFICADO"] } }] },
    select: { tipo: true, papel: true, arquivo: true, nomeOriginal: true },
  },
};

const md5 = (texto) => createHash("md5").update(String(texto), "utf8").digest("hex");
const numeroDoRetrato = (valor) => (valor === null || valor === undefined || valor === "" ? null : Number(valor));

/**
 * Como a peca esta agora, para guardar no Salvar do kit e comparar depois (pedido do dono em 10/10/2026: o "!" do
 * kit quando uma peca muda). O MESMO formato que a migration `20261010_kit_retrato_das_pecas` gravou nos kits que
 * ja existiam: a descricao (com a quebra de linha uniformizada) e as fotos viram md5 (texto longo nao precisa ir
 * inteiro), as fotos em ordem de bytes
 * (o `COLLATE "C"` do SQL), e os documentos pelo nome real. Mudar o formato aqui pede mudar a migration de volta,
 * senao todo kit antigo acenderia o "!" sem nada ter mudado.
 *
 * @param {object} produto linha de `Produto` lida com `SELECT_RETRATO`
 */
export function retratoDaPeca(produto) {
  const arquivos = Array.isArray(produto?.arquivos) ? produto.arquivos : [];
  const fotos = arquivos
    .filter((item) => item.tipo === "IMAGEM" && (item.papel ?? "FOTO") === "FOTO")
    .map((item) => String(item.arquivo))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const documentos = arquivos
    .filter((item) => item.tipo === "DOCUMENTO" || item.tipo === "CERTIFICADO")
    .map((item) => String(item.nomeOriginal ?? item.arquivo))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    tituloBase: produto?.tituloBase ?? null,
    // A quebra de linha vira "\n" antes do md5: o navegador manda o texto da descricao com "\r\n", e salvar a peca
    // pelo formulario sem mexer no texto acendia "Descrição alterada" (visto em 10/10/2026).
    descricao: md5(String(produto?.descricaoBase ?? "").replace(/\r\n?/g, "\n")),
    precoVenda: numeroDoRetrato(produto?.precoVenda),
    pesoKg: numeroDoRetrato(produto?.pesoKg),
    comprimentoCm: numeroDoRetrato(produto?.comprimentoCm),
    larguraCm: numeroDoRetrato(produto?.larguraCm),
    alturaCm: numeroDoRetrato(produto?.alturaCm),
    ncm: produto?.ncm ?? null,
    ativo: Boolean(produto?.ativo),
    conferido: Boolean(produto?.conferido),
    fotos: fotos.length > 0 ? md5(fotos.join(",")) : null,
    quantidadeFotos: fotos.length,
    documentos,
  };
}

/**
 * As pecas que mudaram desde o ultimo Salvar de cada kit (pedido do dono em 10/10/2026), para o "!" da lista e o
 * quadro do kit. So entram as pecas com mudanca; kit sem nenhuma nao aparece no mapa. Peca sem retrato guardado
 * (kit gravado antes da regra e nunca preenchido) nao conta.
 *
 * @param {string[]} kitIds
 * @returns {Promise<Map<string, {componenteId: string, sku: string, tituloBase: string, mudancas: {campo: string, texto: string}[]}[]>>}
 */
export async function mudancasDosKits(kitIds, tx = prisma) {
  const ids = [...new Set((Array.isArray(kitIds) ? kitIds : []).map(String))];
  const porKit = new Map();
  if (ids.length === 0) return porKit;
  const linhas = await tx.produtoComponente.findMany({
    where: { kitId: { in: ids }, retrato: { not: null } },
    orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }],
    select: { kitId: true, componenteId: true, retrato: true, componente: { select: { sku: true, ...SELECT_RETRATO } } },
  });
  for (const linha of linhas) {
    const mudancas = mudancasDaPeca(linha.retrato, retratoDaPeca(linha.componente));
    if (mudancas.length === 0) continue;
    const lista = porKit.get(linha.kitId) ?? [];
    lista.push({ componenteId: linha.componenteId, sku: linha.componente.sku, tituloBase: linha.componente.tituloBase, mudancas });
    porKit.set(linha.kitId, lista);
  }
  return porKit;
}

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
  // A coluna Localizacao da aba e a localizacao do kit de uma peca (pedido do dono em 10/10/2026).
  localizacao: true,
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
    localizacao: produto.localizacao ?? null,
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
    // O retrato de cada peca e o de AGORA: salvar o kit e o "revisado" do "!" (pedido do dono em 10/10/2026).
    const pecas = await t.produto.findMany({
      where: { id: { in: lista.map((item) => item.componenteId) } },
      select: { id: true, ...SELECT_RETRATO },
    });
    const retratos = new Map(pecas.map((peca) => [peca.id, retratoDaPeca(peca)]));
    for (const item of lista) {
      // Json nulo no Prisma e Prisma.DbNull (ver CLAUDE.md); so acontece com peca que sumiu entre a conferencia e aqui.
      const retrato = retratos.get(item.componenteId) ?? Prisma.DbNull;
      await t.produtoComponente.upsert({
        where: { kitId_componenteId: { kitId, componenteId: item.componenteId } },
        update: { quantidade: item.quantidade, ordem: item.ordem, retrato },
        create: { kitId, ...item, retrato },
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
 * A busca da aba Composicao (pedido do dono em 10/10/2026: a busca diz, produto a produto, se pode ser peca
 * ou o que falta). Procura por SKU ou nome e devolve as duas listas, que a tela junta numa so:
 *  - `itens`: os aptos (simples, Conferidos e ja ligados ao Bling, decisao de 07/10/2026), ate 20, ja no
 *    formato da aba (a peca escolhida entra com preco, peso e fornecedor, sem outra consulta);
 *  - `barrados`: os que casaram e nao podem ser peca, ate 10, com TUDO o que falta (`faltasParaSerPeca`) e o
 *    id, para a tela abrir o produto e o dono corrigir. Antes so vinham quando nenhum era apto, e so com o
 *    primeiro motivo.
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
  const apto = { tipo: "SIMPLES", conferido: true, blingId: { not: null } };

  const [achados, outros] = await Promise.all([
    tx.produto.findMany({ where: { ...casa, ...apto }, select: PECA, orderBy: { sku: "asc" }, take: 20 }),
    tx.produto.findMany({
      where: { ...casa, NOT: apto },
      select: { id: true, sku: true, tituloBase: true, tipo: true, conferido: true, blingId: true },
      orderBy: { sku: "asc" },
      take: 10,
    }),
  ]);
  const barrados = outros.map((produto) => ({
    id: produto.id,
    sku: produto.sku,
    tituloBase: produto.tituloBase,
    faltas: faltasParaSerPeca(produto),
  }));
  return { itens: achados.map((produto) => pecaParaTela(produto)), barrados };
}

/**
 * O produto de origem de um clone, como peca do kit (pedido do dono em 10/10/2026): ao trocar o clone para
 * "Com composicao", o produto de onde ele veio entra como primeira peca, quantidade 1, se puder ser peca.
 * Senao, devolve o que falta, para a tela dizer por que ele nao entrou.
 *
 * @param {string} id
 * @returns {Promise<{ok: true, peca: object} | {ok: false, sku: string|null, faltas: string[]}>}
 */
export async function pecaDeOrigemParaKit(id, tx = prisma) {
  const produto = id ? await tx.produto.findUnique({ where: { id: String(id) }, select: PECA }) : null;
  if (!produto) return { ok: false, sku: null, faltas: ["o produto de origem não foi encontrado"] };
  const faltas = faltasParaSerPeca(produto);
  if (faltas.length > 0) return { ok: false, sku: produto.sku, faltas };
  return { ok: true, peca: pecaParaTela(produto, 1) };
}

/**
 * A localizacao que o Salvar grava num kit (pedido do dono em 10/10/2026): com UMA peca, a da peca, travada
 * (o kit sai da mesma prateleira, e o servidor nao confia no que a tela mandou). Com varias, ou num produto
 * simples, `undefined` = fica a que veio do formulario.
 *
 * @param {string|null} produtoId
 * @param {{tipo: string, itens: null | {componenteId: string}[]}} preparo o que `prepararComposicaoDoCadastro` devolveu
 * @returns {Promise<string|null|undefined>}
 */
export async function localizacaoDoKitNoSalvar(produtoId, preparo, tx = prisma) {
  if (preparo?.tipo !== "COMPOSICAO") return undefined;
  // `itens` nulo = o formulario nao mandou a lista, e as pecas gravadas continuam valendo.
  const ids = preparo.itens !== null
    ? preparo.itens.map((item) => item.componenteId)
    : produtoId
      ? (await tx.produtoComponente.findMany({ where: { kitId: produtoId }, orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }], select: { componenteId: true } })).map((linha) => linha.componenteId)
      : [];
  if (ids.length === 0) return undefined;
  const lidas = await tx.produto.findMany({ where: { id: { in: ids } }, select: { id: true, sku: true, localizacao: true } });
  const porId = new Map(lidas.map((peca) => [peca.id, peca]));
  const { valor } = localizacaoDoKit(ids.map((id) => porId.get(id)).filter(Boolean));
  return valor || null;
}

/**
 * Regrava a localizacao de UM kit a partir das pecas dele (`localizacaoDoKit`). SQL cru, como o estoque do kit: a
 * peca mudar de prateleira nao e editar o kit (a lista ordena por `atualizadoEm`, e o envio ao Bling o usa para
 * saber se o produto foi editado no meio do envio). So escreve quando muda.
 *
 * @returns {Promise<number>} 1 se mudou, 0 se ja estava certa.
 */
async function gravarLocalizacaoDoKit(kitId, tx) {
  const linhas = await tx.produtoComponente.findMany({
    where: { kitId },
    orderBy: [{ ordem: "asc" }, { criadoEm: "asc" }],
    select: { componente: { select: { sku: true, localizacao: true } } },
  });
  const { valor } = localizacaoDoKit(linhas.map((linha) => linha.componente));
  if (valor === null) return 0;
  const texto = valor || null;
  return tx.$executeRaw`
    UPDATE "Produto" SET "localizacao" = ${texto}::text
     WHERE "id" = ${kitId} AND "localizacao" IS DISTINCT FROM ${texto}::text`;
}

/**
 * A peca mudou de lugar (ou de codigo): TODOS os kits que a usam mudam junto (pedidos do dono em 10/10/2026), senao
 * a localizacao do kit ficaria errada sem ninguem perceber. Kit de uma peca copia o lugar dela; kit de varias
 * mostra `100101(F9) / 101010(H2)` ou "Verificar a aba composição".
 *
 * @param {string} pecaId
 * @returns {Promise<number>} quantos kits mudaram.
 */
export async function propagarLocalizacaoDaPeca(pecaId, tx = prisma) {
  const kits = await tx.produtoComponente.findMany({ where: { componenteId: pecaId }, select: { kitId: true }, distinct: ["kitId"] });
  let mudaram = 0;
  for (const { kitId } of kits) mudaram += await gravarLocalizacaoDoKit(kitId, tx);
  return mudaram;
}

/**
 * O produto e um kit? A localizacao dele e automatica (a das pecas) e nao se edita na lista (pedido do dono em
 * 10/10/2026): muda-se a localizacao da peca.
 *
 * @param {string} produtoId
 */
export async function ehKit(produtoId, tx = prisma) {
  const produto = await tx.produto.findUnique({ where: { id: produtoId }, select: { tipo: true } });
  return produto?.tipo === "COMPOSICAO";
}

/**
 * Os documentos tecnicos e o certificado de cada peca, para a aba Documentos tecnicos do kit (pedido do dono
 * em 10/10/2026): so leitura, sem copiar para o kit, entao o datasheet trocado na peca ja aparece no kit. Na
 * ordem dos ids pedidos (a da aba Composicao). O endereco e calculado na leitura, como em todo arquivo.
 *
 * @param {string[]} ids
 * @returns {Promise<{id: string, sku: string, tituloBase: string, documentos: object[], certificados: object[]}[]>}
 */
export async function documentosDasPecas(ids, tx = prisma) {
  const procurados = [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, 100);
  if (procurados.length === 0) return [];
  const produtos = await tx.produto.findMany({
    where: { id: { in: procurados } },
    select: {
      id: true,
      sku: true,
      tituloBase: true,
      arquivos: {
        where: { tipo: { in: ["DOCUMENTO", "CERTIFICADO"] } },
        orderBy: { ordem: "asc" },
        select: { id: true, tipo: true, arquivo: true, nomeOriginal: true },
      },
    },
  });
  const porId = new Map(produtos.map((produto) => [produto.id, produto]));
  return procurados
    .map((id) => porId.get(id))
    .filter(Boolean)
    .map((produto) => {
      const paraTela = (item) => ({
        id: item.id,
        arquivo: item.arquivo,
        nomeOriginal: item.nomeOriginal,
        url: urlDe(produto.sku, item.tipo, item.arquivo),
      });
      return {
        id: produto.id,
        sku: produto.sku,
        tituloBase: produto.tituloBase,
        documentos: produto.arquivos.filter((item) => item.tipo === "DOCUMENTO").map(paraTela),
        certificados: produto.arquivos.filter((item) => item.tipo === "CERTIFICADO").map(paraTela),
      };
    });
}

/**
 * A descricao do cadastro de cada peca, para a janela "Criar descricao" do kit (pedido do dono em 10/10/2026:
 * as pecas viram referencias da IA). Lida a parte: a descricao e pesada, e a aba Composicao nao a carrega.
 *
 * @param {string[]} ids
 * @returns {Promise<{id: string, sku: string, tituloBase: string, descricaoBase: string|null}[]>}
 */
export async function descricoesDasPecas(ids, tx = prisma) {
  const procurados = [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, 50);
  if (procurados.length === 0) return [];
  const produtos = await tx.produto.findMany({
    where: { id: { in: procurados } },
    select: { id: true, sku: true, tituloBase: true, descricaoBase: true },
  });
  const porId = new Map(produtos.map((produto) => [produto.id, produto]));
  return procurados.map((id) => porId.get(id)).filter(Boolean);
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
