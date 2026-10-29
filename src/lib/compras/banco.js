import { prisma } from "@/lib/db";
import { urlDe } from "@/lib/arquivos";
import { estoqueDosFornecedores } from "@/lib/estoqueDoFornecedor";
import {
  PODE_EXCLUIR,
  STATUS_ABERTOS,
  STATUS_A_CAMINHO,
  aCaminho,
  entraNaListaDeMinimo,
  estadoDoCarrinho,
  faltaLancar,
  numeroDoPedido,
  podeIrPara,
  precoInicialDoItem,
  quantidadeSugerida,
  totaisDoPedido,
} from "@/lib/compras/regras";
import { conferirPedido } from "@/lib/compras/esquema";
import { alertasDoPedido, avisosDoPedido, prazoDoPedido, previsaoEmDatas } from "@/lib/compras/aliexpress/regras";
import { apagarPastaDoPedido, apagarPropostaDoPedido, moverPropostaParaPedido } from "@/lib/compras/arquivos";

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
      pecasProprias: false,
      estoqueMinimo: { not: null },
      estoque: { lt: prisma.produto.fields.estoqueMinimo },
      AND: palavras.map((palavra) => ({
        OR: [{ sku: { contains: palavra, mode: "insensitive" } }, { tituloBase: { contains: palavra, mode: "insensitive" } }],
      })),
    },
    select: {
      id: true, sku: true, tituloBase: true, estoque: true, estoqueMinimo: true, estoqueMaximo: true,
      conferido: true, ativo: true, tipo: true, pecasProprias: true,
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

/**
 * Varios itens de uma vez no rascunho do fornecedor (o pedido montado pela conversa do MCP, 26/10/2026). Cada item:
 * `{ produtoId, vinculoId, quantidade, precoUnitario?, ipiPercentual? }`, ja conferidos por quem chama. Item novo nasce
 * com o preco informado ou, sem ele, o do vinculo (como o popup); item que ja estava no rascunho troca a quantidade e
 * so troca o preco/IPI quando vierem (o digitado na tela nao e apagado por um preco calculado).
 */
export async function colocarItensNoRascunho(fornecedorId, itens) {
  const fornecedor = await prisma.fornecedor.findUnique({ where: { id: String(fornecedorId ?? "") }, select: { id: true, nome: true, prazoEntregaDias: true } });
  if (!fornecedor) return { ok: false, erro: "Fornecedor não encontrado." };
  if (!Array.isArray(itens) || itens.length === 0) return { ok: false, erro: "Informe ao menos um item." };
  for (const item of itens) {
    if (quantidadeValida(item.quantidade) === null) return { ok: false, erro: "Informe a quantidade, em número inteiro maior que zero." };
  }

  const vinculos = await prisma.produtoFornecedor.findMany({
    where: { id: { in: itens.map((item) => item.vinculoId).filter(Boolean) }, fornecedorId: fornecedor.id },
  });
  const vinculoDe = new Map(vinculos.map((vinculo) => [vinculo.id, vinculo]));
  // O preco do vinculo (com a coleta) e lido FORA da transacao, como no popup.
  const padroes = new Map();
  for (const item of itens) {
    const vinculo = vinculoDe.get(item.vinculoId);
    if (item.precoUnitario === undefined && vinculo) padroes.set(item.produtoId, await precoDoVinculo(vinculo, fornecedor.nome));
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const pedido = await rascunhoDoFornecedor(tx, fornecedor.id);
      const maiorOrdem = await tx.itemDoPedidoDeCompra.aggregate({ where: { pedidoId: pedido.id }, _max: { ordem: true } });
      let ordem = (maiorOrdem._max.ordem ?? -1) + 1;
      const resultado = [];
      for (const item of itens) {
        const vinculo = vinculoDe.get(item.vinculoId) ?? null;
        const informado = {
          ...(item.precoUnitario !== undefined ? { precoUnitario: item.precoUnitario } : {}),
          ...(item.ipiPercentual !== undefined ? { ipiPercentual: item.ipiPercentual ?? 0 } : {}),
        };
        const existente = await tx.itemDoPedidoDeCompra.findUnique({
          where: { pedidoId_produtoId: { pedidoId: pedido.id, produtoId: item.produtoId } },
          select: { id: true },
        });
        if (existente) {
          await tx.itemDoPedidoDeCompra.update({ where: { id: existente.id }, data: { quantidade: Number(item.quantidade), ...informado } });
          resultado.push({ produtoId: item.produtoId, acao: "atualizado" });
          continue;
        }
        const padrao = padroes.get(item.produtoId) ?? { precoUnitario: null, ipiPercentual: 0 };
        await tx.itemDoPedidoDeCompra.create({
          data: {
            pedidoId: pedido.id,
            produtoId: item.produtoId,
            vinculoId: vinculo?.id ?? null,
            nomeNoFornecedor: vinculo?.descricao ?? null,
            codigoNoFornecedor: vinculo?.codigo ?? null,
            link: vinculo?.link ?? null,
            quantidade: Number(item.quantidade),
            precoUnitario: padrao.precoUnitario,
            ipiPercentual: padrao.ipiPercentual,
            ...informado,
            prazoDias: fornecedor.prazoEntregaDias,
            ordem: ordem++,
          },
        });
        resultado.push({ produtoId: item.produtoId, acao: "novo" });
      }
      return { ok: true, pedidoId: pedido.id, numero: pedido.numero, criado: pedido.criado, itens: resultado };
    });
  } catch (erro) {
    return { ok: false, erro: `Não foi possível montar o pedido: ${erro.message}` };
  }
}

// ---------------------------------------------------------------------------
// O pedido: listar, ler, criar, salvar, itens e status
// ---------------------------------------------------------------------------

/** O pedido com os numeros como numero (o Prisma devolve Decimal), pronto para a tela e o PDF. */
function pedidoParaTela(pedido) {
  const itens = pedido.itens.map((item) => ({
    id: item.id,
    produtoId: item.produtoId,
    vinculoId: item.vinculoId,
    sku: item.produto.sku,
    nome: item.produto.tituloBase,
    foto: item.produto.arquivos?.[0] ? urlDe(item.produto.sku, "IMAGEM", item.produto.arquivos[0].arquivo) : null,
    nomeNoFornecedor: item.nomeNoFornecedor,
    codigoNoFornecedor: item.codigoNoFornecedor,
    link: item.link,
    quantidade: item.quantidade,
    precoUnitario: numero(item.precoUnitario),
    ipiPercentual: numero(item.ipiPercentual) ?? 0,
    prazoDias: item.prazoDias,
    ordem: item.ordem,
    quantidadeLancada: item.quantidadeLancada,
    estoqueAtual: item.produto.estoque,
    lancamentos: (item.lancamentos ?? []).map((lancamento) => ({
      id: lancamento.id,
      quantidade: lancamento.quantidade,
      lancadoEm: lancamento.lancadoEm,
      movimentoId: lancamento.movimentoId,
    })),
  }));
  const editaveis = {
    icmsSt: numero(pedido.icmsSt) ?? 0,
    descontoTipo: pedido.descontoTipo,
    descontoValor: numero(pedido.descontoValor) ?? 0,
    frete: numero(pedido.frete) ?? 0,
    entrada: numero(pedido.entrada) ?? 0,
    imposto: numero(pedido.imposto) ?? 0,
  };
  return {
    id: pedido.id,
    numero: pedido.numero,
    codigo: numeroDoPedido(pedido.numero),
    status: pedido.status,
    fornecedor: pedido.fornecedor,
    ...editaveis,
    formaPagamento: pedido.formaPagamento,
    parcelas: pedido.parcelas,
    transportadoraId: pedido.transportadoraId,
    transportadora: pedido.transportadora,
    transportadoraNome: pedido.transportadoraNome,
    fretePorConta: pedido.fretePorConta,
    rastreio: pedido.rastreio,
    propostaNumero: pedido.propostaNumero,
    propostaArquivo: pedido.propostaArquivo,
    propostaNomeOriginal: pedido.propostaNomeOriginal,
    observacoes: pedido.observacoes,
    enviadoEm: pedido.enviadoEm,
    finalizadoEm: pedido.finalizadoEm,
    canceladoEm: pedido.canceladoEm,
    criadoEm: pedido.criadoEm,
    atualizadoEm: pedido.atualizadoEm,
    itens,
    totais: totaisDoPedido({ itens, ...editaveis }),
    origem: pedido.origem,
    aliexpress: blocoDoAliExpress(pedido.aliexpress),
    // Os avisos ambar do pedido do AliExpress: os mesmos motivos do "!" da lista (atraso, rastreio, situacao la, sem
    // produto, entregue) mais o Virtual pendente, que so a tela do pedido resolve.
    avisos: pedido.aliexpress
      ? [
          ...motivosDoPedido(pedido, itens).alertas,
          ...avisosDoPedido({ virtualErros: pedido.aliexpress.linhas.filter((linha) => linha.virtualErro).length }),
        ]
      : [],
  };
}

/**
 * O prazo de entrega e os motivos do "!" de um pedido (pedido do dono em 29/10/2026), iguais na lista e na tela do
 * pedido. `itens` precisa de quantidade, quantidadeLancada e prazoDias; o AliExpress, de pacotes e linhas.
 */
function motivosDoPedido(pedido, itens) {
  const ali = pedido.aliexpress;
  const prazo = prazoDoPedido({
    status: pedido.status,
    enviadoEm: pedido.enviadoEm,
    prazosDosItens: itens.map((item) => item.prazoDias),
    pacotes: ali?.pacotes ?? [],
  });
  const alertas = alertasDoPedido({
    status: pedido.status,
    prazoFim: prazo?.fim ?? null,
    entregueEm: ali?.entregueEm ?? null,
    canceladoNoAliExpressEm: ali?.canceladoNoAliExpressEm ?? null,
    faltaLancar: itens.reduce((soma, item) => soma + faltaLancar(item), 0),
    estoqueLancado: itens.some((item) => item.quantidadeLancada > 0),
    linhasPendentes: ali ? ali.linhas.filter((linha) => !linha.itemId).length : 0,
    ultimosEventos: (ali?.pacotes ?? []).map((pacote) => ({ codigo: pacote.ultimoCodigo, descricao: pacote.ultimoEvento, em: pacote.ultimoEventoEm })),
    statusNoAliExpress: ali?.statusTexto ?? null,
  });
  return { prazo, alertas };
}

/** O que a tela mostra do AliExpress: cabecalho, linhas sem produto, opcao e rastreio por item, Virtual pendente. */
function blocoDoAliExpress(ali) {
  if (!ali) return null;
  const opcaoPorItem = {};
  const rastreioPorItem = {};
  for (const linha of ali.linhas) {
    if (!linha.itemId) continue;
    if (linha.opcao) opcaoPorItem[linha.itemId] = opcaoPorItem[linha.itemId] ? `${opcaoPorItem[linha.itemId]} · ${linha.opcao}` : linha.opcao;
    if (linha.pacote && !(rastreioPorItem[linha.itemId] ?? []).some((pacote) => pacote.codigo === linha.pacote.codigo)) {
      rastreioPorItem[linha.itemId] = [
        ...(rastreioPorItem[linha.itemId] ?? []),
        {
          codigo: linha.pacote.codigo,
          transportadora: linha.pacote.transportadora,
          ultimoEvento: linha.pacote.ultimoEvento,
          ultimoEventoEm: linha.pacote.ultimoEventoEm,
          previsaoTexto: linha.pacote.previsaoTexto,
          previsao: previsaoEmDatas(linha.pacote.previsaoInicio, linha.pacote.previsaoFim) ?? linha.pacote.previsaoTexto,
        },
      ];
    }
  }
  return {
    numero: ali.externoId,
    loja: ali.loja,
    statusTexto: ali.statusTexto,
    dataDoPedido: ali.dataDoPedido,
    entregueEm: ali.entregueEm,
    canceladoNoAliExpressEm: ali.canceladoNoAliExpressEm,
    linkDoPedido: `https://www.aliexpress.com/p/order/detail.html?orderId=${ali.externoId}`,
    linkDoRastreio: `https://www.aliexpress.com/p/tracking/index.html?tradeOrderId=${ali.externoId}`,
    linhasPendentes: ali.linhas
      .filter((linha) => !linha.itemId)
      .map((linha) => ({
        id: linha.id,
        titulo: linha.titulo,
        opcao: linha.opcao,
        urlDaFoto: linha.urlDaFoto,
        urlDoItem: linha.urlDoItem,
        quantidadeComprada: linha.quantidadeComprada,
        precoComprado: numero(linha.precoComprado),
        productId: linha.productId,
        skuId: linha.skuId,
      })),
    linhaPorItem: Object.fromEntries(ali.linhas.filter((linha) => linha.itemId).map((linha) => [linha.itemId, linha.id])),
    // Fator editavel na tela (pedido do dono em 29/10/2026): so no item que veio de UMA linha (duas opcoes que viraram o
    // mesmo produto teriam dois fatores; essas trocam pelo "Trocar produto").
    fatorPorItem: Object.fromEntries(
      Object.entries(Object.groupBy(ali.linhas.filter((linha) => linha.itemId), (linha) => linha.itemId))
        .filter(([, linhas]) => linhas.length === 1)
        .map(([itemId, [linha]]) => [itemId, { linhaId: linha.id, fator: linha.fator }]),
    ),
    // "Site do produto" no cartao Fornecedor: a pagina do anuncio de cada linha (pedido do dono em 29/10/2026).
    produtosNoSite: ali.linhas.filter((linha) => linha.urlDoItem).map((linha) => ({ titulo: linha.titulo, opcao: linha.opcao, url: linha.urlDoItem })),
    opcaoPorItem,
    rastreioPorItem,
    // Os pacotes do pedido, para o bloco Frete (pedido do dono em 29/10/2026): transportadora, codigo, ultimo evento e
    // previsao em datas; `itens` diz quais produtos foram em cada um (so importa com mais de um pacote).
    pacotes: (ali.pacotes ?? []).map((pacote) => ({
      codigo: pacote.codigo,
      transportadora: pacote.transportadora,
      status: pacote.ultimoEvento,
      statusEm: pacote.ultimoEventoEm ? new Date(pacote.ultimoEventoEm).toISOString() : null,
      previsao: previsaoEmDatas(pacote.previsaoInicio, pacote.previsaoFim) ?? pacote.previsaoTexto,
      itens: [...new Set(ali.linhas.filter((linha) => linha.pacoteId === pacote.id && linha.item).map((linha) => linha.item.produto.sku))],
    })),
    virtualPendentes: ali.linhas.filter((linha) => linha.virtualErro).map((linha) => ({ linhaId: linha.id, titulo: linha.titulo, erro: linha.virtualErro })),
  };
}

const FOTO_PRINCIPAL = { where: { tipo: "IMAGEM", papel: "FOTO" }, orderBy: { ordem: "asc" }, take: 1, select: { arquivo: true } };

const INCLUIR_NO_PEDIDO = {
  fornecedor: {
    select: { id: true, nome: true, cnpj: true, contato: true, telefone: true, email: true, prazoEntregaDias: true, condicoesPagamento: true },
  },
  transportadora: { select: { id: true, nome: true, nomeFantasia: true, urlRastreamento: true } },
  itens: {
    orderBy: { ordem: "asc" },
    include: {
      produto: { select: { sku: true, tituloBase: true, tipo: true, estoque: true, arquivos: FOTO_PRINCIPAL } },
      lancamentos: { where: { desfeitoEm: null }, orderBy: { lancadoEm: "asc" } },
    },
  },
  // Pedido importado do AliExpress (spec 2026-10-28): os dados crus, as linhas (casadas e pendentes) e os pacotes.
  aliexpress: {
    include: {
      linhas: { orderBy: { externoLinhaId: "asc" }, include: { pacote: true, item: { select: { produto: { select: { sku: true } } } } } },
      pacotes: { orderBy: { codigo: "asc" } },
    },
  },
};

export async function lerPedido(id) {
  const pedido = await prisma.pedidoDeCompra.findUnique({ where: { id: String(id ?? "") }, include: INCLUIR_NO_PEDIDO });
  return pedido ? pedidoParaTela(pedido) : null;
}

export async function listarPedidos({ status, busca, pagina = 1, porPagina = 25 } = {}) {
  const texto = String(busca ?? "").trim();
  // O numero do pedido e Int: o numero do AliExpress (16 digitos) estouraria a consulta, e nao e numero de pedido do Rise.
  const numeroBuscado = /^(pc-?)?\d{1,9}$/i.test(texto) ? Number(texto.replace(/\D/g, "")) : null;
  const where = {
    ...(status?.length ? { status: { in: status } } : {}),
    ...(texto
      ? {
          OR: [
            { fornecedor: { nome: { contains: texto, mode: "insensitive" } } },
            ...(numeroBuscado ? [{ numero: numeroBuscado }] : []),
            ...(/^\d{6,}$/.test(texto) ? [{ aliexpress: { externoId: { contains: texto } } }] : []),
            // Pelo produto (pedido do dono em 29/10/2026): codigo ou nome do Rise nos itens, nome e codigo no fornecedor,
            // e o titulo do item do AliExpress ainda sem produto.
            { itens: { some: { produto: { sku: { contains: texto, mode: "insensitive" } } } } },
            { itens: { some: { produto: { tituloBase: { contains: texto, mode: "insensitive" } } } } },
            { itens: { some: { nomeNoFornecedor: { contains: texto, mode: "insensitive" } } } },
            { itens: { some: { codigoNoFornecedor: { contains: texto, mode: "insensitive" } } } },
            { aliexpress: { linhas: { some: { titulo: { contains: texto, mode: "insensitive" } } } } },
          ],
        }
      : {}),
  };
  const [total, pedidos] = await Promise.all([
    prisma.pedidoDeCompra.count({ where }),
    prisma.pedidoDeCompra.findMany({
      where,
      orderBy: { numero: "desc" },
      skip: (Math.max(1, pagina) - 1) * porPagina,
      take: porPagina,
      include: {
        fornecedor: { select: { nome: true } },
        itens: { orderBy: { ordem: "asc" }, select: { quantidade: true, quantidadeLancada: true, prazoDias: true, precoUnitario: true, ipiPercentual: true, produto: { select: { sku: true, tituloBase: true } } } },
        aliexpress: {
          select: {
            loja: true,
            statusTexto: true,
            entregueEm: true,
            canceladoNoAliExpressEm: true,
            linhas: { select: { itemId: true } },
            pacotes: { select: { previsaoInicio: true, previsaoFim: true, ultimoEvento: true, ultimoCodigo: true, ultimoEventoEm: true } },
          },
        },
      },
    }),
  ]);
  return {
    total,
    linhas: pedidos.map((pedido) => ({
      id: pedido.id,
      numero: pedido.numero,
      codigo: numeroDoPedido(pedido.numero),
      fornecedor: pedido.fornecedor.nome,
      status: pedido.status,
      itens: pedido.itens.length,
      // Coluna Produtos (pedido do dono em 29/10/2026): nome e codigo do Rise; com varios, a tela abre a lista.
      produtos: pedido.itens.map((item) => ({ sku: item.produto.sku, nome: item.produto.tituloBase, quantidade: item.quantidade })),
      total: totaisDoPedido({
        itens: pedido.itens.map((item) => ({ ...item, precoUnitario: numero(item.precoUnitario), ipiPercentual: numero(item.ipiPercentual) })),
        icmsSt: numero(pedido.icmsSt),
        descontoTipo: pedido.descontoTipo,
        descontoValor: numero(pedido.descontoValor),
        frete: numero(pedido.frete),
        imposto: numero(pedido.imposto),
      }).total,
      enviadoEm: pedido.enviadoEm,
      atualizadoEm: pedido.atualizadoEm,
      origem: pedido.origem,
      loja: pedido.aliexpress?.loja ?? null,
      ...(({ prazo, alertas }) => ({ prazo: prazo?.texto ?? null, alertas }))(motivosDoPedido(pedido, pedido.itens)),
    })),
  };
}

export async function contarPedidosPorStatus() {
  const grupos = await prisma.pedidoDeCompra.groupBy({ by: ["status"], _count: { _all: true } });
  const contagem = { RASCUNHO: 0, ENVIADO: 0, PARCIAL: 0, FINALIZADO: 0, CANCELADO: 0 };
  for (const grupo of grupos) contagem[grupo.status] = grupo._count._all;
  return contagem;
}

/** Um pedido novo para o fornecedor; se ja ha rascunho dele, devolve o rascunho (um por fornecedor). */
export async function criarPedido(fornecedorId) {
  const fornecedor = await prisma.fornecedor.findUnique({ where: { id: String(fornecedorId ?? "") }, select: { id: true } });
  if (!fornecedor) return { ok: false, erro: "Fornecedor não encontrado." };
  const pedido = await prisma.$transaction((tx) => rascunhoDoFornecedor(tx, fornecedor.id));
  return { ok: true, pedidoId: pedido.id, numero: pedido.numero, jaExistia: !pedido.criado };
}

/** "+ Adicionar outro item": so em rascunho. Usa o vinculo do produto com o fornecedor do pedido, quando existe. */
export async function adicionarItem(pedidoId, produtoId) {
  const pedido = await prisma.pedidoDeCompra.findUnique({
    where: { id: String(pedidoId ?? "") },
    include: { fornecedor: { select: { nome: true, prazoEntregaDias: true } } },
  });
  if (!pedido) return { ok: false, erro: "Pedido não encontrado." };
  if (pedido.status !== "RASCUNHO") return { ok: false, erro: "Pedido já enviado: não aceita item novo." };
  const produto = await prisma.produto.findUnique({ where: { id: String(produtoId ?? "") }, select: { id: true, tipo: true } });
  if (!produto) return { ok: false, erro: "Produto não encontrado." };
  if (produto.tipo === "COMPOSICAO") return { ok: false, erro: "Kit não entra em pedido de compra: compre as peças." };

  const vinculo = await prisma.produtoFornecedor.findFirst({
    where: { produtoId: produto.id, fornecedorId: pedido.fornecedorId },
    orderBy: [{ padrao: "desc" }, { criadoEm: "asc" }],
  });
  const preco = vinculo ? await precoDoVinculo(vinculo, pedido.fornecedor.nome) : { precoUnitario: null, ipiPercentual: 0 };

  try {
    const maiorOrdem = await prisma.itemDoPedidoDeCompra.aggregate({ where: { pedidoId: pedido.id }, _max: { ordem: true } });
    const item = await prisma.itemDoPedidoDeCompra.create({
      data: {
        pedidoId: pedido.id,
        produtoId: produto.id,
        vinculoId: vinculo?.id ?? null,
        nomeNoFornecedor: vinculo?.descricao ?? null,
        codigoNoFornecedor: vinculo?.codigo ?? null,
        link: vinculo?.link ?? null,
        quantidade: 1,
        precoUnitario: preco.precoUnitario,
        ipiPercentual: preco.ipiPercentual,
        prazoDias: pedido.fornecedor.prazoEntregaDias,
        ordem: (maiorOrdem._max.ordem ?? -1) + 1,
      },
    });
    return { ok: true, itemId: item.id };
  } catch (erro) {
    if (erro?.code === "P2002") return { ok: false, erro: "Este produto já está no pedido." };
    return { ok: false, erro: `Não foi possível adicionar: ${erro.message}` };
  }
}

/** A busca do "+ Adicionar outro item": nome, codigo do Rise e codigo/nome no fornecedor do pedido. */
export async function buscarItensParaPedido(pedidoId, texto) {
  const termo = String(texto ?? "").trim();
  if (termo.length < 2) return [];
  const pedido = await prisma.pedidoDeCompra.findUnique({
    where: { id: String(pedidoId ?? "") },
    select: { fornecedorId: true, itens: { select: { produtoId: true } } },
  });
  if (!pedido) return [];
  const contem = { contains: termo, mode: "insensitive" };
  const produtos = await prisma.produto.findMany({
    where: {
      tipo: "SIMPLES",
      ativo: true,
      OR: [
        { sku: contem },
        { tituloBase: contem },
        { fornecedores: { some: { fornecedorId: pedido.fornecedorId, OR: [{ codigo: contem }, { descricao: contem }] } } },
      ],
    },
    orderBy: { sku: "asc" },
    take: 20,
    select: {
      id: true,
      sku: true,
      tituloBase: true,
      arquivos: FOTO_PRINCIPAL,
      fornecedores: { where: { fornecedorId: pedido.fornecedorId }, orderBy: { padrao: "desc" }, take: 1, select: { codigo: true, descricao: true } },
    },
  });
  const noPedido = new Set(pedido.itens.map((item) => item.produtoId));
  return produtos.map((produto) => ({
    produtoId: produto.id,
    sku: produto.sku,
    nome: produto.tituloBase,
    foto: produto.arquivos[0] ? urlDe(produto.sku, "IMAGEM", produto.arquivos[0].arquivo) : null,
    vinculo: produto.fornecedores[0] ?? null,
    jaNoPedido: noPedido.has(produto.id),
  }));
}

/**
 * Salvar o pedido. Em RASCUNHO grava tudo (os itens que nao vieram saem; a ordem e a da lista). Depois de ENVIADO o
 * PDF ja foi ao fornecedor: so prazo dos itens, frete, rastreio, proposta e observacoes mudam, e o resto recebido e
 * ignorado. Fechado (finalizado, cancelado) recusa.
 */
export async function salvarPedido(id, entrada) {
  const conferido = conferirPedido(entrada);
  if (!conferido.ok) return conferido;
  const { dados, desconto } = conferido;
  const pedidoId = String(id ?? "");

  // A proposta nova sai do lote ANTES da transacao (nome novo, nunca sobrescreve); a antiga so e apagada depois do commit.
  let propostaNova = null;
  const temporaria = entrada?.propostaTemporaria;
  if (temporaria?.nome) {
    try {
      propostaNova = { nome: await moverPropostaParaPedido(pedidoId, temporaria.lote, temporaria.nome), nomeOriginal: temporaria.nomeOriginal ?? null };
    } catch (erro) {
      return { ok: false, erro: `Não foi possível guardar a proposta: ${erro.message}` };
    }
  }
  const removerProposta = entrada?.removerProposta === true;

  let propostaAntiga = null;
  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const [linha] = await tx.$queryRaw`SELECT "status"::text AS "status", "propostaArquivo" FROM "PedidoDeCompra" WHERE "id" = ${pedidoId} FOR UPDATE`;
      if (!linha) return { ok: false, erro: "Pedido não encontrado." };
      if (["FINALIZADO", "CANCELADO"].includes(linha.status)) return { ok: false, erro: "Pedido fechado: não muda mais." };
      const rascunho = linha.status === "RASCUNHO";

      const pedido = {};
      if (propostaNova || removerProposta) {
        propostaAntiga = linha.propostaArquivo;
        pedido.propostaArquivo = propostaNova?.nome ?? null;
        pedido.propostaNomeOriginal = propostaNova?.nomeOriginal ?? null;
      }
      const definir = (campo, valor) => {
        if (valor !== undefined) pedido[campo] = valor;
      };
      definir("transportadoraId", dados.transportadoraId);
      definir("transportadoraNome", dados.transportadoraNome);
      definir("fretePorConta", dados.fretePorConta);
      definir("rastreio", dados.rastreio);
      definir("propostaNumero", dados.propostaNumero);
      definir("observacoes", dados.observacoes);
      // A entrada pode ser paga depois de o pedido sair: muda ate o pedido fechar.
      if (dados.entrada !== undefined) pedido.entrada = dados.entrada ?? 0;
      if (rascunho) {
        if (dados.icmsSt !== undefined) pedido.icmsSt = dados.icmsSt ?? 0;
        if (dados.frete !== undefined) pedido.frete = dados.frete ?? 0;
        if (desconto) {
          pedido.descontoTipo = desconto.valor ? desconto.tipo : null;
          pedido.descontoValor = desconto.valor;
        }
        definir("formaPagamento", dados.formaPagamento);
        if (dados.formaPagamento === "PIX") pedido.parcelas = 1;
        else if (dados.parcelas !== undefined) pedido.parcelas = dados.parcelas ?? 1;
      }
      // Transportadora do cadastro tira o texto livre.
      if (pedido.transportadoraId) pedido.transportadoraNome = null;
      await tx.pedidoDeCompra.update({ where: { id }, data: pedido });

      if (dados.itens) {
        const atuais = await tx.itemDoPedidoDeCompra.findMany({ where: { pedidoId: id }, select: { id: true } });
        const recebidos = new Map(dados.itens.map((item, indice) => [item.id, { ...item, ordem: indice }]));
        for (const atual of atuais) {
          const item = recebidos.get(atual.id);
          if (!item) {
            if (rascunho) await tx.itemDoPedidoDeCompra.delete({ where: { id: atual.id } });
            continue;
          }
          const data = { prazoDias: item.prazoDias ?? null };
          if (rascunho) {
            // Campo de preco AUSENTE (quem nao ve custo) mantem o gravado; vazio de proposito vira null.
            Object.assign(data, {
              quantidade: item.quantidade,
              ...(item.precoUnitario !== undefined ? { precoUnitario: item.precoUnitario } : {}),
              ...(item.ipiPercentual !== undefined ? { ipiPercentual: item.ipiPercentual ?? 0 } : {}),
              ordem: item.ordem,
              ...(item.nomeNoFornecedor !== undefined ? { nomeNoFornecedor: item.nomeNoFornecedor } : {}),
              ...(item.codigoNoFornecedor !== undefined ? { codigoNoFornecedor: item.codigoNoFornecedor } : {}),
            });
          }
          await tx.itemDoPedidoDeCompra.update({ where: { id: atual.id }, data });
        }
      }
      return { ok: true };
    });
    if (!resultado.ok) {
      if (propostaNova) await apagarPropostaDoPedido(pedidoId, propostaNova.nome).catch(() => {});
      return resultado;
    }
    if (propostaAntiga && propostaAntiga !== propostaNova?.nome) {
      await apagarPropostaDoPedido(pedidoId, propostaAntiga).catch((erro) => console.error("[compras] proposta antiga não apagada:", erro.message));
    }
    return resultado;
  } catch (erro) {
    if (propostaNova) await apagarPropostaDoPedido(pedidoId, propostaNova.nome).catch(() => {});
    return { ok: false, erro: `Não foi possível salvar: ${erro.message}` };
  }
}

/**
 * Exclui o pedido (pedido do dono em 26/10/2026: lixeira na lista). So rascunho e cancelado: o enviado conta como
 * estoque a caminho (cancele antes), e o parcial e o finalizado guardam o historico do estoque que foi lancado.
 * Leva junto os itens e o arquivo da proposta.
 */
export async function excluirPedido(id) {
  const pedidoId = String(id ?? "");
  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const [linha] = await tx.$queryRaw`SELECT "status"::text AS "status", "numero" FROM "PedidoDeCompra" WHERE "id" = ${pedidoId} FOR UPDATE`;
      if (!linha) return { ok: false, erro: "Pedido não encontrado. Ele pode já ter sido excluído." };
      if (!PODE_EXCLUIR.includes(linha.status)) {
        return {
          ok: false,
          erro: linha.status === "ENVIADO" ? "Pedido enviado: cancele antes de excluir." : "Pedido com estoque lançado não é excluído: ele guarda o histórico.",
        };
      }
      const vivos = await tx.lancamentoDoItemDeCompra.count({ where: { item: { pedidoId }, desfeitoEm: null } });
      if (vivos) return { ok: false, erro: "Pedido com estoque lançado não é excluído: ele guarda o histórico." };
      await tx.pedidoDeCompra.delete({ where: { id: pedidoId } });
      return { ok: true, numero: linha.numero };
    });
    if (resultado.ok) await apagarPastaDoPedido(pedidoId).catch((erro) => console.error("[compras] pasta do pedido não apagada:", erro.message));
    return resultado;
  } catch (erro) {
    return { ok: false, erro: `Não foi possível excluir: ${erro.message}` };
  }
}

/** As mudancas de situacao que o dono faz pela tela. PARCIAL <-> ENVIADO e so pelo lancamento (lancamento.js). */
const PELO_DONO = { RASCUNHO: ["ENVIADO", "CANCELADO"], ENVIADO: ["FINALIZADO", "CANCELADO"], PARCIAL: ["FINALIZADO"] };

export async function mudarStatus(id, para) {
  try {
    return await prisma.$transaction(async (tx) => {
      const [linha] = await tx.$queryRaw`SELECT "status"::text AS "status" FROM "PedidoDeCompra" WHERE "id" = ${String(id ?? "")} FOR UPDATE`;
      if (!linha) return { ok: false, erro: "Pedido não encontrado." };
      if (!podeIrPara(linha.status, para) || !(PELO_DONO[linha.status] ?? []).includes(para)) {
        return { ok: false, erro: "Esta mudança de situação não é permitida." };
      }
      const itens = await tx.itemDoPedidoDeCompra.findMany({
        where: { pedidoId: id },
        select: { precoUnitario: true, produto: { select: { sku: true } }, lancamentos: { where: { desfeitoEm: null }, select: { id: true } } },
      });
      const agora = new Date();
      if (para === "ENVIADO") {
        if (itens.length === 0) return { ok: false, erro: "Pedido sem itens." };
        const semPreco = itens.filter((item) => item.precoUnitario === null).map((item) => item.produto.sku);
        if (semPreco.length) return { ok: false, erro: `Item sem preço: ${semPreco.join(", ")}.` };
        await tx.pedidoDeCompra.update({ where: { id }, data: { status: "ENVIADO", enviadoEm: agora } });
      } else if (para === "CANCELADO") {
        if (itens.some((item) => item.lancamentos.length)) return { ok: false, erro: "Já há estoque lançado: finalize o pedido." };
        await tx.pedidoDeCompra.update({ where: { id }, data: { status: "CANCELADO", canceladoEm: agora } });
      } else {
        await tx.pedidoDeCompra.update({ where: { id }, data: { status: "FINALIZADO", finalizadoEm: agora } });
      }
      return { ok: true };
    });
  } catch (erro) {
    return { ok: false, erro: `Não foi possível mudar a situação: ${erro.message}` };
  }
}
