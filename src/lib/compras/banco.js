import { prisma } from "@/lib/db";
import { urlDe } from "@/lib/arquivos";
import { estoqueDosFornecedores } from "@/lib/estoqueDoFornecedor";
import {
  STATUS_ABERTOS,
  STATUS_A_CAMINHO,
  aCaminho,
  entraNaListaDeMinimo,
  estadoDoCarrinho,
  numeroDoPedido,
  precoInicialDoItem,
  quantidadeSugerida,
} from "@/lib/compras/regras";

/**
 * Banco do modulo Compras (spec 2026-10-26-modulo-compras-design.md). Sem conferencia de acesso: quem chama (as
 * Server Actions de src/app/compras/acoes.js) confere. As contas moram em regras.js.
 */

const QUANTIDADE_MAXIMA = 9_999_999;

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

/** O estoque a caminho de cada produto: o que falta lancar dos itens de pedidos enviados ou parciais. */
export async function aCaminhoDosProdutos(ids) {
  const resultado = new Map(ids.map((id) => [id, 0]));
  if (ids.length === 0) return resultado;
  const itens = await prisma.itemDoPedidoDeCompra.findMany({
    where: { produtoId: { in: ids }, pedido: { status: { in: STATUS_A_CAMINHO } } },
    select: { produtoId: true, quantidade: true, quantidadeLancada: true, pedido: { select: { status: true } } },
  });
  for (const id of ids) {
    resultado.set(id, aCaminho(itens.filter((item) => item.produtoId === id).map((item) => ({ ...item, status: item.pedido.status }))));
  }
  return resultado;
}

/** Os pedidos abertos em que cada produto esta (para o carrinho da lista do minimo). */
export async function itensAbertosDosProdutos(ids) {
  const resultado = new Map(ids.map((id) => [id, []]));
  if (ids.length === 0) return resultado;
  const itens = await prisma.itemDoPedidoDeCompra.findMany({
    where: { produtoId: { in: ids }, pedido: { status: { in: STATUS_ABERTOS } } },
    select: { produtoId: true, pedido: { select: { id: true, numero: true, status: true, fornecedor: { select: { nome: true } } } } },
    orderBy: { pedido: { numero: "asc" } },
  });
  for (const item of itens) {
    resultado.get(item.produtoId).push({
      pedidoId: item.pedido.id,
      numero: item.pedido.numero,
      status: item.pedido.status,
      fornecedor: item.pedido.fornecedor.nome,
    });
  }
  return resultado;
}

const ORDENS = {
  codigo: (linha) => linha.sku,
  estoque: (linha) => linha.estoque,
  falta: (linha) => linha.falta,
};

/**
 * A lista "abaixo do estoque minimo". O banco ja corta pela comparacao de colunas (estoque < minimo); o estoque a
 * caminho e somado depois, em memoria, e pode tirar linhas. Ordenar e paginar em memoria e de proposito: a lista e
 * pequena (so o que esta abaixo do minimo), e o a caminho nao existe como coluna para o banco ordenar.
 */
export async function listarAbaixoDoMinimo({ busca, pagina = 1, porPagina = 25, ordenar, direcao = "asc" } = {}) {
  const palavras = String(busca ?? "").trim().split(/\s+/).filter(Boolean);
  const candidatos = await prisma.produto.findMany({
    where: {
      conferido: true,
      ativo: true,
      tipo: "SIMPLES",
      estoqueMinimo: { not: null },
      estoque: { lt: prisma.produto.fields.estoqueMinimo },
      AND: palavras.map((palavra) => ({
        OR: [{ sku: { contains: palavra, mode: "insensitive" } }, { tituloBase: { contains: palavra, mode: "insensitive" } }],
      })),
    },
    select: {
      id: true, sku: true, tituloBase: true, estoque: true, estoqueMinimo: true, estoqueMaximo: true,
      conferido: true, ativo: true, tipo: true,
      arquivos: { where: { tipo: "IMAGEM", papel: "FOTO" }, orderBy: { ordem: "asc" }, take: 1, select: { arquivo: true } },
    },
  });
  const ids = candidatos.map((produto) => produto.id);
  const [caminhos, abertos] = await Promise.all([aCaminhoDosProdutos(ids), itensAbertosDosProdutos(ids)]);

  const linhas = candidatos
    .filter((produto) => entraNaListaDeMinimo(produto, caminhos.get(produto.id)))
    .map((produto) => {
      const emPedidos = abertos.get(produto.id) ?? [];
      const carrinho = estadoDoCarrinho(emPedidos);
      return {
        id: produto.id,
        sku: produto.sku,
        nome: produto.tituloBase,
        foto: produto.arquivos[0] ? urlDe(produto.sku, "IMAGEM", produto.arquivos[0].arquivo) : null,
        estoque: produto.estoque,
        aCaminho: caminhos.get(produto.id) ?? 0,
        minimo: produto.estoqueMinimo,
        maximo: produto.estoqueMaximo,
        falta: produto.estoqueMinimo - produto.estoque - (caminhos.get(produto.id) ?? 0),
        carrinho: carrinho ? { ...carrinho, pedidos: emPedidos } : null,
      };
    });

  const chave = ORDENS[ordenar] ?? ORDENS.falta;
  const sentido = ordenar && direcao === "desc" ? -1 : 1;
  // Sem ordem escolhida: quem mais falta primeiro, depois o codigo.
  const padrao = !ORDENS[ordenar];
  linhas.sort((a, b) => {
    const [x, y] = [chave(a), chave(b)];
    if (x === y) return a.sku.localeCompare(b.sku);
    if (padrao) return y - x;
    return (x < y ? -1 : 1) * sentido;
  });

  const total = linhas.length;
  const inicio = (Math.max(1, pagina) - 1) * porPagina;
  return { linhas: linhas.slice(inicio, inicio + porPagina), total };
}

export async function contarAbaixoDoMinimo() {
  return (await listarAbaixoDoMinimo({ porPagina: 1 })).total;
}

/** O custo da linha com o IPI, so para ordenar do mais barato ao mais caro (sem preco vai para o fim). */
const custoParaOrdenar = (linha) =>
  linha.precoUnitario === null ? Number.POSITIVE_INFINITY : linha.precoUnitario * (1 + (linha.ipiPercentual ?? 0) / 100);

/**
 * Os fornecedores de um produto para o popup "Fornecedores" da lista do minimo: os dados do vinculo, o estoque e o
 * preco da ultima coleta, e se o produto ja esta no rascunho daquele fornecedor.
 */
export async function fornecedoresParaCompra(produtoId) {
  const produto = await prisma.produto.findUnique({
    where: { id: produtoId },
    select: {
      id: true, sku: true, tituloBase: true, estoqueMinimo: true, estoqueMaximo: true,
      fornecedores: { include: { fornecedor: { select: { id: true, nome: true } } } },
    },
  });
  if (!produto) return null;

  const vinculos = produto.fornecedores.map((vinculo) => ({
    id: vinculo.id, nome: vinculo.fornecedor.nome, codigo: vinculo.codigo, link: vinculo.link,
  }));
  const coleta = vinculos.length ? await estoqueDosFornecedores(vinculos) : { ok: true, itens: {} };
  const coletados = coleta.ok ? coleta.itens : {};

  const rascunhos = await prisma.itemDoPedidoDeCompra.findMany({
    where: { produtoId, pedido: { status: "RASCUNHO" } },
    select: { pedido: { select: { id: true, numero: true, fornecedorId: true } } },
  });

  const linhas = produto.fornecedores.map((vinculo) => {
    const coletado = coletados[vinculo.id] ?? null;
    const preco = precoInicialDoItem({
      precoFornecedor: numero(vinculo.precoFornecedor ?? vinculo.precoCusto),
      coletado: coletado ? { precoNormal: coletado.precoNormal, impostos: coletado.impostos } : null,
    });
    const rascunho = rascunhos.find((item) => item.pedido.fornecedorId === vinculo.fornecedorId)?.pedido ?? null;
    return {
      vinculoId: vinculo.id,
      fornecedorId: vinculo.fornecedorId,
      fornecedor: vinculo.fornecedor.nome,
      descricao: vinculo.descricao,
      codigo: vinculo.codigo,
      link: vinculo.link,
      padrao: vinculo.padrao,
      ...preco,
      coletadoId: coletado?.coletadoId ?? null,
      estoqueFornecedor: coletado
        ? { quantidade: coletado.quantidade, estoqueStatus: coletado.estoqueStatus, ativo: coletado.ativo }
        : null,
      noRascunho: rascunho ? { pedidoId: rascunho.id, numero: rascunho.numero } : null,
    };
  });
  linhas.sort((a, b) => custoParaOrdenar(a) - custoParaOrdenar(b) || a.fornecedor.localeCompare(b.fornecedor));

  return {
    produto: {
      id: produto.id,
      sku: produto.sku,
      nome: produto.tituloBase,
      minimo: produto.estoqueMinimo,
      maximo: produto.estoqueMaximo,
      sugerida: quantidadeSugerida({ estoqueMinimo: produto.estoqueMinimo, estoqueMaximo: produto.estoqueMaximo }),
    },
    linhas,
  };
}

/**
 * O proximo numero de pedido. Sob trava do Postgres: dois rascunhos criados no mesmo instante leriam o mesmo MAX.
 * Precisa rodar DENTRO da transacao que cria o pedido (a trava vale ate o commit).
 */
export async function proximoNumero(tx) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('compras.numero'))`;
  const maior = await tx.pedidoDeCompra.aggregate({ _max: { numero: true } });
  return (maior._max.numero ?? 0) + 1;
}

/** O rascunho aberto do fornecedor, ou um novo. Sob a trava do fornecedor: nunca dois rascunhos do mesmo. */
async function rascunhoDoFornecedor(tx, fornecedorId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`compras.rascunho.${fornecedorId}`}))`;
  const aberto = await tx.pedidoDeCompra.findFirst({
    where: { fornecedorId, status: "RASCUNHO" },
    orderBy: { numero: "asc" },
    select: { id: true, numero: true },
  });
  if (aberto) return { ...aberto, criado: false };
  const novo = await tx.pedidoDeCompra.create({
    data: { fornecedorId, numero: await proximoNumero(tx) },
    select: { id: true, numero: true },
  });
  return { ...novo, criado: true };
}

function quantidadeValida(valor) {
  const quantidade = Number(valor);
  return Number.isInteger(quantidade) && quantidade >= 1 && quantidade <= QUANTIDADE_MAXIMA ? quantidade : null;
}

/** O preco e o IPI com que um item nasce a partir de um vinculo (a coleta do fornecedor, quando houver). */
async function precoDoVinculo(vinculo, nomeDoFornecedor) {
  const coleta = await estoqueDosFornecedores([{ id: vinculo.id, nome: nomeDoFornecedor, codigo: vinculo.codigo, link: vinculo.link }]);
  const coletado = coleta.ok ? coleta.itens[vinculo.id] : null;
  return precoInicialDoItem({
    precoFornecedor: numero(vinculo.precoFornecedor ?? vinculo.precoCusto),
    coletado: coletado ? { precoNormal: coletado.precoNormal, impostos: coletado.impostos } : null,
  });
}

/**
 * "Adicionar ao pedido" do popup: o item entra no rascunho aberto do fornecedor do vinculo (ou num novo). O mesmo
 * produto de novo no mesmo rascunho nao vira segundo item (duas abas, clique duplo): devolve `jaEstava`.
 */
export async function adicionarAoPedido({ produtoId, vinculoId, quantidade }) {
  const qtde = quantidadeValida(quantidade);
  if (qtde === null) return { ok: false, erro: "Informe a quantidade, em número inteiro maior que zero." };

  const vinculo = await prisma.produtoFornecedor.findFirst({
    where: { id: vinculoId, produtoId },
    include: { fornecedor: { select: { id: true, nome: true, prazoEntregaDias: true } }, produto: { select: { tipo: true } } },
  });
  if (!vinculo) return { ok: false, erro: "Fornecedor não encontrado neste produto. Recarregue a página." };
  if (vinculo.produto.tipo === "COMPOSICAO") return { ok: false, erro: "Kit não entra em pedido de compra: compre as peças." };

  // A coleta e lida FORA da transacao: a trava do fornecedor fica so o tempo de gravar.
  const preco = await precoDoVinculo(vinculo, vinculo.fornecedor.nome);

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const pedido = await rascunhoDoFornecedor(tx, vinculo.fornecedorId);
      const existente = await tx.itemDoPedidoDeCompra.findUnique({
        where: { pedidoId_produtoId: { pedidoId: pedido.id, produtoId } },
        select: { id: true },
      });
      if (existente) return { ok: true, pedidoId: pedido.id, numero: pedido.numero, criado: false, jaEstava: true };

      const maiorOrdem = await tx.itemDoPedidoDeCompra.aggregate({ where: { pedidoId: pedido.id }, _max: { ordem: true } });
      await tx.itemDoPedidoDeCompra.create({
        data: {
          pedidoId: pedido.id,
          produtoId,
          vinculoId: vinculo.id,
          nomeNoFornecedor: vinculo.descricao,
          codigoNoFornecedor: vinculo.codigo,
          link: vinculo.link,
          quantidade: qtde,
          precoUnitario: preco.precoUnitario,
          ipiPercentual: preco.ipiPercentual,
          prazoDias: vinculo.fornecedor.prazoEntregaDias,
          ordem: (maiorOrdem._max.ordem ?? -1) + 1,
        },
      });
      return { ok: true, pedidoId: pedido.id, numero: pedido.numero, criado: pedido.criado };
    });

    const outros = await prisma.itemDoPedidoDeCompra.findMany({
      where: { produtoId, pedido: { status: "RASCUNHO", id: { not: resultado.pedidoId } } },
      select: { pedido: { select: { numero: true, fornecedor: { select: { nome: true } } } } },
    });
    if (outros.length) {
      resultado.avisoOutroRascunho = `Também está no ${outros
        .map((item) => `${numeroDoPedido(item.pedido.numero)} (${item.pedido.fornecedor.nome})`)
        .join(", ")}.`;
    }
    return resultado;
  } catch (erro) {
    return { ok: false, erro: `Não foi possível adicionar: ${erro.message}` };
  }
}
