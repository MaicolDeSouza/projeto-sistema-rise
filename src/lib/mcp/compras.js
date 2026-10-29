import { z } from "zod";

import { prisma } from "@/lib/db";
import {
  colocarItensNoRascunho,
  contarPedidosPorStatus,
  lerPedido,
  listarAbaixoDoMinimo,
  listarPedidos,
  mudarStatus,
  salvarPedido,
} from "@/lib/compras/banco";
import { conferirPedido } from "@/lib/compras/esquema";
import { semPrecos } from "@/lib/compras/projecao";
import { faltaLancar, numeroDoPedido, quantidadeSugerida } from "@/lib/compras/regras";
import { formatarCnpj } from "@/lib/documentos";
import { RESTRITO } from "@/lib/riseAi/busca";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

/**
 * Compras pelo MCP (pedido do dono em 26/10/2026: "falar para a LLM criar um pedido de compra baseado em dados que irei
 * passar, ler pedidos, status e tambem ler produtos abaixo do estoque minimo"; escolheu "Rascunho + situacao").
 *
 * - Leitura: a lista do minimo, a lista de pedidos e um pedido inteiro, com as mesmas regras de acesso das telas
 *   (preco de compra so com `dado.custo`; a lista do minimo so com `dado.estoqueExato`).
 * - Escrita: montar o RASCUNHO do fornecedor (o mesmo rascunho unico por fornecedor do popup) e mudar a situacao
 *   (enviado, cancelado, finalizado) pelas mesmas regras da tela. Lancar estoque NUNCA: escreve no Bling real e fica so
 *   na tela (decisao do dono).
 */

const SITUACOES = ["RASCUNHO", "ENVIADO", "PARCIAL", "FINALIZADO", "CANCELADO"];
const TEXTO_DA_SITUACAO = { RASCUNHO: "Rascunho", ENVIADO: "Enviado", PARCIAL: "Entrega parcial", FINALIZADO: "Finalizado", CANCELADO: "Cancelado" };
const LEITURA = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
const ESCRITA = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
const MUDANCA = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));
const emTexto = (data) => (data instanceof Date ? data.toISOString() : data ?? null);
const so = (texto) => String(texto ?? "").replace(/\D/g, "");

function exigir(pode, recurso, nivel, motivo) {
  if (typeof pode !== "function" || !pode(recurso, nivel)) throw new ErroDeFerramenta(`Este login não pode ${motivo}.`);
}

/** "PC-0012", "pc12", "12" ou o id do pedido. */
export async function acharPedido(referencia) {
  const texto = String(referencia ?? "").trim();
  if (!texto) throw new ErroDeFerramenta("Informe o pedido (ex.: PC-0012).");
  const comNumero = /^(pc-?)?\s*\d+$/i.test(texto);
  const linha = comNumero
    ? await prisma.pedidoDeCompra.findUnique({ where: { numero: Number(so(texto)) }, select: { id: true } })
    : await prisma.pedidoDeCompra.findUnique({ where: { id: texto }, select: { id: true } });
  if (!linha) throw new ErroDeFerramenta(`Pedido ${texto} não encontrado.`);
  return linha.id;
}

/** O fornecedor pelo CNPJ (14 digitos) ou pelo nome: igual (sem caixa) primeiro; senao contendo, se for um so. */
export async function acharFornecedor(referencia) {
  const texto = String(referencia ?? "").trim();
  if (!texto) throw new ErroDeFerramenta("Informe o fornecedor (nome ou CNPJ).");
  if (so(texto).length === 14 && /^[\d./\-\s]+$/.test(texto)) {
    const porCnpj = await prisma.fornecedor.findFirst({ where: { cnpj: formatarCnpj(so(texto)) }, select: { id: true, nome: true } });
    if (porCnpj) return porCnpj;
  }
  const igual = await prisma.fornecedor.findMany({ where: { nome: { equals: texto, mode: "insensitive" } }, select: { id: true, nome: true }, take: 2 });
  if (igual.length === 1) return igual[0];
  const parecidos = await prisma.fornecedor.findMany({
    where: { nome: { contains: texto, mode: "insensitive" } },
    orderBy: { nome: "asc" },
    select: { id: true, nome: true },
    take: 6,
  });
  if (parecidos.length === 1) return parecidos[0];
  if (parecidos.length === 0) throw new ErroDeFerramenta(`Fornecedor "${texto}" não está cadastrado no Rise. Cadastre-o em Cadastros › Fornecedores.`);
  throw new ErroDeFerramenta(`Mais de um fornecedor com "${texto}": ${parecidos.map((f) => f.nome).join(", ")}. Diga qual.`);
}

/**
 * Os itens da conversa viram produtos do Rise: pelo SKU do Rise ou pelo codigo do produto NO fornecedor (o vinculo da aba
 * Fornecedores). Confere TUDO antes de gravar: um item que nao se acha recusa o pedido inteiro, com a lista do que faltou.
 */
export async function resolverItens(fornecedorId, itens) {
  const problemas = [];
  const resolvidos = [];
  for (const [indice, item] of itens.entries()) {
    const rotulo = item.sku ? `SKU ${item.sku}` : item.codigoNoFornecedor ? `código ${item.codigoNoFornecedor} do fornecedor` : `item ${indice + 1}`;
    let produto = null;
    let vinculo = null;
    if (item.sku) {
      produto = await prisma.produto.findFirst({ where: { sku: { equals: item.sku.trim(), mode: "insensitive" } }, select: { id: true, sku: true, tipo: true, tituloBase: true } });
      if (!produto) {
        problemas.push(`${rotulo}: não existe no Rise`);
        continue;
      }
    } else if (item.codigoNoFornecedor) {
      const achados = await prisma.produtoFornecedor.findMany({
        where: { fornecedorId, codigo: { equals: item.codigoNoFornecedor.trim(), mode: "insensitive" } },
        select: { id: true, produto: { select: { id: true, sku: true, tipo: true, tituloBase: true } } },
      });
      const produtos = [...new Map(achados.map((achado) => [achado.produto.id, achado.produto])).values()];
      if (produtos.length === 0) {
        problemas.push(`${rotulo}: nenhum produto do Rise tem este código vinculado a este fornecedor (informe o SKU do Rise)`);
        continue;
      }
      if (produtos.length > 1) {
        problemas.push(`${rotulo}: está em mais de um produto (${produtos.map((p) => p.sku).join(", ")}); informe o SKU do Rise`);
        continue;
      }
      produto = produtos[0];
      vinculo = { id: achados.find((achado) => achado.produto.id === produto.id).id };
    } else {
      problemas.push(`${rotulo}: informe o SKU do Rise ou o código no fornecedor`);
      continue;
    }
    if (produto.tipo === "COMPOSICAO") {
      problemas.push(`${produto.sku}: é kit; kit não entra em pedido de compra (compre as peças)`);
      continue;
    }
    if (resolvidos.some((outro) => outro.produtoId === produto.id)) {
      problemas.push(`${produto.sku}: aparece duas vezes; junte as quantidades num item só`);
      continue;
    }
    if (!vinculo) {
      vinculo = await prisma.produtoFornecedor.findFirst({
        where: { produtoId: produto.id, fornecedorId },
        orderBy: [{ padrao: "desc" }, { criadoEm: "asc" }],
        select: { id: true },
      });
    }
    resolvidos.push({
      produtoId: produto.id,
      sku: produto.sku,
      nome: produto.tituloBase,
      vinculoId: vinculo?.id ?? null,
      quantidade: item.quantidade,
      ...(item.precoUnitario !== undefined ? { precoUnitario: item.precoUnitario } : {}),
      ...(item.ipiPercentual !== undefined ? { ipiPercentual: item.ipiPercentual } : {}),
    });
  }
  if (problemas.length) throw new ErroDeFerramenta(`Nada foi gravado. Itens com problema: ${problemas.join("; ")}.`);
  return resolvidos;
}

/** O pedido para a conversa: sem foto e sem ids internos de lancamento; sem `dado.custo`, sem precos. */
/** Um pacote do AliExpress na conversa: codigo, transportadora, ultimo evento, previsao e o link do rastreio. */
function pacoteParaConversa(pacote, linkDoRastreio) {
  return {
    codigo: pacote.codigo,
    transportadora: pacote.transportadora ?? null,
    status: pacote.status ?? pacote.ultimoEvento ?? null,
    statusEm: pacote.statusEm ?? emTexto(pacote.ultimoEventoEm) ?? null,
    previsao: pacote.previsao ?? null,
    link: linkDoRastreio,
  };
}

function aliexpressParaConversa(ali) {
  return {
    numero: ali.numero,
    loja: ali.loja,
    situacaoNoAliExpress: ali.statusTexto,
    entregueNoAliExpressEm: emTexto(ali.entregueEm),
    link: ali.linkDoPedido,
    pacotes: ali.pacotes.map((pacote) => ({ ...pacoteParaConversa(pacote, ali.linkDoRastreio), itens: pacote.itens })),
    itensSemProduto: ali.linhasPendentes.length,
  };
}

function pedidoParaConversa(pedido, veCusto) {
  const visto = veCusto ? pedido : semPrecos(pedido);
  return {
    codigo: visto.codigo,
    situacao: visto.status,
    situacaoTexto: TEXTO_DA_SITUACAO[visto.status],
    fornecedor: { nome: visto.fornecedor.nome, cnpj: visto.fornecedor.cnpj ?? null, prazoEntregaDias: visto.fornecedor.prazoEntregaDias ?? null },
    itens: visto.itens.map((item) => ({
      sku: item.sku,
      nome: item.nome,
      nomeNoFornecedor: item.nomeNoFornecedor,
      codigoNoFornecedor: item.codigoNoFornecedor,
      quantidade: item.quantidade,
      precoUnitario: veCusto ? item.precoUnitario : RESTRITO,
      ipiPercentual: veCusto ? item.ipiPercentual : RESTRITO,
      prazoDias: item.prazoDias,
      quantidadeLancada: item.quantidadeLancada,
      faltaChegar: ["ENVIADO", "PARCIAL"].includes(visto.status) ? faltaLancar(item) : 0,
      link: item.link,
    })),
    totais: veCusto
      ? { produtos: visto.totais.produtos, ipi: visto.totais.ipi, icmsSt: visto.icmsSt, frete: visto.frete, desconto: visto.totais.desconto, total: visto.totais.total, entrada: visto.totais.entrada, faltaPagar: visto.totais.faltaPagar }
      : RESTRITO,
    pagamento: { forma: visto.formaPagamento, parcelas: visto.parcelas },
    frete: {
      transportadora: visto.transportadora?.nome ?? visto.transportadoraNome ?? null,
      porConta: visto.fretePorConta,
      rastreio: visto.rastreio,
    },
    // Pedido importado do AliExpress (28/10/2026): o numero la, a loja, a situacao no site e os pacotes com o rastreio.
    aliexpress: visto.aliexpress ? aliexpressParaConversa(visto.aliexpress) : null,
    propostaDoFornecedor: visto.propostaNumero,
    observacoes: visto.observacoes,
    criadoEm: emTexto(visto.criadoEm),
    enviadoEm: emTexto(visto.enviadoEm),
    finalizadoEm: emTexto(visto.finalizadoEm),
    canceladoEm: emTexto(visto.canceladoEm),
    atualizadoEm: emTexto(visto.atualizadoEm),
  };
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export async function produtosAbaixoDoMinimo({ termos, limite = 50 }, { pode }) {
  exigir(pode, "tela.compras.estoqueMinimo", "ver", "ver a lista abaixo do estoque mínimo");
  exigir(pode, "dado.estoqueExato", "ver", "ver o estoque exato (a lista do mínimo depende dele)");
  const veCusto = pode("dado.custo", "ver");
  const { linhas, total } = await listarAbaixoDoMinimo({ busca: termos, porPagina: limite });
  const vinculos = linhas.length
    ? await prisma.produtoFornecedor.findMany({
        where: { produtoId: { in: linhas.map((linha) => linha.id) } },
        orderBy: [{ padrao: "desc" }, { criadoEm: "asc" }],
        select: { produtoId: true, codigo: true, padrao: true, precoCusto: true, fornecedor: { select: { nome: true } } },
      })
    : [];
  return {
    total,
    produtos: linhas.map((linha) => ({
      sku: linha.sku,
      nome: linha.nome,
      estoque: linha.estoque,
      aCaminho: linha.aCaminho,
      minimo: linha.minimo,
      maximo: linha.maximo,
      falta: linha.falta,
      quantidadeSugerida: quantidadeSugerida({ estoqueMinimo: linha.minimo, estoqueMaximo: linha.maximo }),
      emPedidos: (linha.carrinho?.pedidos ?? []).map((pedido) => ({ codigo: numeroDoPedido(pedido.numero), situacao: pedido.status, fornecedor: pedido.fornecedor })),
      fornecedores: vinculos
        .filter((vinculo) => vinculo.produtoId === linha.id)
        .map((vinculo) => ({
          nome: vinculo.fornecedor.nome,
          codigo: vinculo.codigo,
          padrao: vinculo.padrao,
          custo: veCusto ? numero(vinculo.precoCusto) : RESTRITO,
        })),
    })),
  };
}

export async function listarPedidosDeCompra({ situacao, termos, limite = 25 }, { pode }) {
  exigir(pode, "tela.compras.pedidos", "ver", "ver os pedidos de compra");
  const veCusto = pode("dado.custo", "ver");
  const [{ linhas, total }, porSituacao] = await Promise.all([listarPedidos({ status: situacao, busca: termos, porPagina: limite }), contarPedidosPorStatus()]);
  return {
    total,
    porSituacao,
    pedidos: linhas.map((linha) => ({
      codigo: linha.codigo,
      fornecedor: linha.fornecedor,
      situacao: linha.status,
      situacaoTexto: TEXTO_DA_SITUACAO[linha.status],
      itens: linha.itens,
      total: veCusto ? linha.total : RESTRITO,
      enviadoEm: emTexto(linha.enviadoEm),
      atualizadoEm: emTexto(linha.atualizadoEm),
    })),
  };
}

/**
 * O que esta a caminho de um produto (pedido do dono em 29/10/2026: "o status e a previsao de algum produto irei buscar
 * por MCP"): os pedidos enviados ou em entrega parcial com o produto, quanto falta chegar e, nos do AliExpress, o
 * rastreio do pacote do item (status e previsao). Sem preco: nao precisa de `dado.custo`.
 */
export async function comprasACaminhoDoProduto({ produto, limite = 10 }, { pode }) {
  exigir(pode, "tela.compras.pedidos", "ver", "ver os pedidos de compra");
  const texto = String(produto ?? "").trim();
  const palavras = texto.split(/s+/).filter(Boolean);
  const exato = await prisma.produto.findFirst({ where: { sku: { equals: texto, mode: "insensitive" } }, select: { id: true } });
  const produtos = exato
    ? [exato]
    : await prisma.produto.findMany({
        where: { AND: palavras.map((palavra) => ({ OR: [{ tituloBase: { contains: palavra, mode: "insensitive" } }, { sku: { contains: palavra, mode: "insensitive" } }] })) },
        select: { id: true },
        take: limite,
      });
  if (!produtos.length) return { produtos: [] };

  const itens = await prisma.itemDoPedidoDeCompra.findMany({
    where: { produtoId: { in: produtos.map((p) => p.id) }, pedido: { status: { in: ["ENVIADO", "PARCIAL"] } } },
    select: { id: true, produtoId: true, pedidoId: true },
  });
  const pedidos = new Map();
  for (const pedidoId of new Set(itens.map((item) => item.pedidoId))) pedidos.set(pedidoId, await lerPedido(pedidoId));

  const porProduto = new Map();
  for (const item of itens) {
    const pedido = pedidos.get(item.pedidoId);
    const lido = pedido?.itens.find((linha) => linha.id === item.id);
    if (!lido || faltaLancar(lido) <= 0) continue;
    const ali = pedido.aliexpress;
    // O pacote do item; sem ele (rastreio ainda nao lido por item), os pacotes do pedido inteiro.
    const doItem = ali?.pacotes.filter((pacote) => pacote.itens.includes(lido.sku)) ?? [];
    const pacotes = doItem.length ? doItem : ali?.pacotes ?? [];
    const entrada = porProduto.get(item.produtoId) ?? { sku: lido.sku, nome: lido.nome, aCaminho: 0, pedidos: [] };
    entrada.aCaminho += faltaLancar(lido);
    entrada.pedidos.push({
      codigo: pedido.codigo,
      fornecedor: pedido.fornecedor.nome,
      situacao: pedido.status,
      situacaoTexto: TEXTO_DA_SITUACAO[pedido.status],
      quantidade: lido.quantidade,
      faltaChegar: faltaLancar(lido),
      compradoEm: emTexto(pedido.enviadoEm),
      aliexpress: ali ? { numero: ali.numero, loja: ali.loja, situacaoNoAliExpress: ali.statusTexto, link: ali.linkDoPedido } : null,
      rastreio: ali ? pacotes.map((pacote) => pacoteParaConversa(pacote, ali.linkDoRastreio)) : pedido.rastreio ? [{ codigo: pedido.rastreio, transportadora: pedido.transportadora?.nome ?? pedido.transportadoraNome ?? null, status: null, statusEm: null, previsao: null, link: null }] : [],
    });
    porProduto.set(item.produtoId, entrada);
  }
  return { produtos: [...porProduto.values()] };
}

export async function lerPedidoDeCompra({ pedido }, { pode }) {
  exigir(pode, "tela.compras.pedidos", "ver", "ver os pedidos de compra");
  const lido = await lerPedido(await acharPedido(pedido));
  return pedidoParaConversa(lido, pode("dado.custo", "ver"));
}

// ---------------------------------------------------------------------------
// Escrita
// ---------------------------------------------------------------------------

const CAMPOS_DE_PRECO = ["icmsSt", "frete", "desconto", "entrada"];

export async function montarPedidoDeCompra(argumentos, { pode }) {
  exigir(pode, "tela.compras.pedidos", "editar", "montar pedido de compra (precisa editar Compras › Pedidos de compra)");
  const veCusto = pode("dado.custo", "ver");
  const informaPreco = argumentos.itens.some((item) => item.precoUnitario !== undefined || item.ipiPercentual !== undefined) || CAMPOS_DE_PRECO.some((campo) => argumentos[campo] !== undefined);
  if (informaPreco && !veCusto) throw new ErroDeFerramenta("Este login não pode gravar preço de compra (precisa do acesso a custo e fornecedores). Mande o pedido sem preços: o Rise usa os do cadastro.");

  // O cabecalho e conferido ANTES de qualquer gravacao, com o mesmo esquema da tela.
  const cabecalho = {};
  for (const campo of ["icmsSt", "frete", "desconto", "entrada", "formaPagamento", "parcelas", "fretePorConta", "transportadoraNome", "propostaNumero", "observacoes"]) {
    if (argumentos[campo] !== undefined) cabecalho[campo] = argumentos[campo];
  }
  const conferido = conferirPedido(cabecalho);
  if (!conferido.ok) throw new ErroDeFerramenta(`Nada foi gravado. ${Object.entries(conferido.erros).map(([campo, msg]) => `${campo}: ${msg}`).join("; ")}`);

  const fornecedor = await acharFornecedor(argumentos.fornecedor);
  const itens = await resolverItens(fornecedor.id, argumentos.itens);
  const gravado = await colocarItensNoRascunho(fornecedor.id, itens);
  if (!gravado.ok) throw new ErroDeFerramenta(gravado.erro);

  const avisos = [];
  if (Object.keys(cabecalho).length) {
    const salvo = await salvarPedido(gravado.pedidoId, cabecalho);
    if (!salvo.ok) avisos.push(`Os itens entraram, mas o cabeçalho não: ${salvo.erro ?? Object.values(salvo.erros ?? {}).join("; ")}`);
  }
  const lido = await lerPedido(gravado.pedidoId);
  const semPreco = lido.itens.filter((item) => item.precoUnitario === null).map((item) => item.sku);
  if (semPreco.length) avisos.push(`Sem preço: ${semPreco.join(", ")}. O pedido só pode ser enviado com o preço de todos os itens.`);
  const acaoDe = new Map(gravado.itens.map((item) => [item.produtoId, item.acao]));
  return {
    criado: gravado.criado,
    mensagem: gravado.criado ? `Rascunho ${numeroDoPedido(gravado.numero)} criado.` : `Itens postos no rascunho ${numeroDoPedido(gravado.numero)}, que já estava aberto para ${fornecedor.nome}.`,
    itensDestaVez: itens.map((item) => ({ sku: item.sku, nome: item.nome, quantidade: item.quantidade, acao: acaoDe.get(item.produtoId), semVinculoComOFornecedor: !item.vinculoId })),
    avisos,
    pedido: pedidoParaConversa(lido, veCusto),
  };
}

export async function mudarSituacaoDoPedidoDeCompra({ pedido, para }, { pode }) {
  exigir(pode, "tela.compras.pedidos", "editar", "mudar a situação de pedido de compra (precisa editar Compras › Pedidos de compra)");
  const id = await acharPedido(pedido);
  const mudado = await mudarStatus(id, para);
  if (!mudado.ok) throw new ErroDeFerramenta(mudado.erro);
  const lido = await lerPedido(id);
  return { mensagem: `${lido.codigo} agora está ${TEXTO_DA_SITUACAO[lido.status].toLowerCase()}.`, pedido: pedidoParaConversa(lido, pode("dado.custo", "ver")) };
}

// ---------------------------------------------------------------------------
// Ferramentas
// ---------------------------------------------------------------------------

const PEDIDO = z.string().trim().min(1).max(40).describe("O pedido: o código (PC-0012) ou o número (12)");
const VALOR = z.union([z.number(), z.string().trim().max(30)]);

export const FERRAMENTAS_DE_COMPRAS_LEITURA = [
  {
    nome: "produtosAbaixoDoMinimo",
    descricao: [
      "Lista os produtos conferidos e ativos cujo estoque mais o que está a caminho (pedidos enviados) ficou abaixo do estoque mínimo, quem mais falta primeiro.",
      "Traz estoque, a caminho, mínimo, máximo, quanto falta, a quantidade sugerida (o máximo cheio), os pedidos em que já está e os fornecedores vinculados (com o código no fornecedor e o custo).",
    ].join(" "),
    esquema: z.object({
      termos: z.string().trim().max(120).optional().describe("Palavras do nome ou do SKU (todas exigidas); vazio = todos"),
      limite: z.number().int().min(1).max(200).optional().describe("Quantos devolver (padrão 50). O total vem junto"),
    }),
    anotacoes: LEITURA,
    executar: produtosAbaixoDoMinimo,
  },
  {
    nome: "listarPedidosDeCompra",
    descricao: "Lista os pedidos de compra, do mais novo ao mais antigo, com fornecedor, situação, número de itens e total, mais a contagem por situação. Filtra pela situação e pelo fornecedor ou número.",
    esquema: z.object({
      situacao: z.array(z.enum(SITUACOES)).max(5).optional().describe("Situações (RASCUNHO, ENVIADO, PARCIAL = entrega parcial, FINALIZADO, CANCELADO); vazio = todas"),
      termos: z.string().trim().max(120).optional().describe("Nome do fornecedor ou número do pedido"),
      limite: z.number().int().min(1).max(100).optional().describe("Quantos devolver (padrão 25)"),
    }),
    anotacoes: LEITURA,
    executar: listarPedidosDeCompra,
  },
  {
    nome: "comprasACaminhoDoProduto",
    descricao: [
      "Diz o que está a caminho de um produto: os pedidos de compra enviados ou em entrega parcial que têm o produto, quanto falta chegar, quando foi comprado",
      "e, nos pedidos do AliExpress, o rastreio do pacote (código, transportadora, último evento com a data e a previsão de entrega em datas, com o link).",
      "Use para perguntas como \"quando chega o ESP32?\" ou \"qual o status da compra do 100105?\".",
    ].join(" "),
    esquema: z.object({
      produto: z.string().trim().min(1).max(120).describe("O SKU do produto (exato) ou palavras do nome"),
      limite: z.number().int().min(1).max(30).optional().describe("Quantos produtos procurar pelo nome (padrão 10)"),
    }),
    anotacoes: LEITURA,
    executar: comprasACaminhoDoProduto,
  },
  {
    nome: "lerPedidoDeCompra",
    descricao: "Abre um pedido de compra inteiro: fornecedor, itens (código e nome no fornecedor, quantidade, preço, IPI, quanto já chegou e quanto falta chegar), totais, pagamento, frete, rastreio e as datas de cada situação. Pedido do AliExpress traz também o número no site, a loja, a situação lá e os pacotes com transportadora, último evento e previsão de entrega.",
    esquema: z.object({ pedido: PEDIDO }),
    anotacoes: LEITURA,
    executar: lerPedidoDeCompra,
  },
];

export const FERRAMENTAS_DE_COMPRAS_ESCRITA = [
  {
    nome: "montarPedidoDeCompra",
    descricao: [
      "Monta um pedido de compra em RASCUNHO com os dados que a pessoa passou (cotação, lista, mensagem do fornecedor). Cada fornecedor tem UM rascunho aberto:",
      "se já existe, os itens entram nele (produto que já estava troca a quantidade). Cada item é achado pelo SKU do Rise ou pelo código do produto no fornecedor;",
      "se um item não se acha, NADA é gravado e a resposta diz quais faltaram. Sem preço informado, o item usa o preço do cadastro do fornecedor.",
      "Não marca como enviado: confirme com a pessoa e use mudarSituacaoDoPedidoDeCompra só quando ela pedir. Mostre à pessoa o pedido devolvido.",
    ].join(" "),
    esquema: z.object({
      fornecedor: z.string().trim().min(1).max(160).describe("Nome do fornecedor como está no Rise, ou o CNPJ"),
      itens: z
        .array(
          z.object({
            sku: z.string().trim().min(1).max(60).optional().describe("SKU do produto no Rise (preferido)"),
            codigoNoFornecedor: z.string().trim().min(1).max(120).optional().describe("Código do produto no fornecedor, quando não souber o SKU"),
            quantidade: z.number().int().min(1).max(9_999_999),
            precoUnitario: z.number().min(0).max(9_999_999).optional().describe("Preço unitário SEM IPI, em reais"),
            ipiPercentual: z.number().min(0).max(100).optional().describe("IPI em %"),
          }),
        )
        .min(1)
        .max(200),
      frete: VALOR.optional().describe("Valor do frete em reais"),
      icmsSt: VALOR.optional().describe("ICMS ST em reais"),
      desconto: z.string().trim().max(30).optional().describe('Desconto: "5%" ou "12,50" (reais)'),
      entrada: VALOR.optional().describe("Valor já pago ao fazer o pedido"),
      formaPagamento: z.enum(["PIX", "BOLETO", "CARTAO"]).optional(),
      parcelas: z.number().int().min(1).max(24).optional(),
      fretePorConta: z.enum(["CIF", "FOB"]).optional().describe("CIF = o fornecedor paga; FOB = a loja paga"),
      transportadoraNome: z.string().trim().max(120).optional(),
      propostaNumero: z.string().trim().max(60).optional().describe("Número da proposta/orçamento do fornecedor"),
      observacoes: z.string().trim().max(4000).optional(),
    }),
    anotacoes: ESCRITA,
    executar: montarPedidoDeCompra,
  },
  {
    nome: "mudarSituacaoDoPedidoDeCompra",
    descricao: [
      "Muda a situação de um pedido de compra, pelas regras da tela: rascunho para ENVIADO (todos os itens com preço; as quantidades passam a contar como estoque a caminho) ou CANCELADO;",
      "enviado para FINALIZADO ou CANCELADO; entrega parcial para FINALIZADO. Só use quando a pessoa pedir com todas as letras. Lançar o estoque recebido é só na tela do Rise.",
    ].join(" "),
    esquema: z.object({ pedido: PEDIDO, para: z.enum(["ENVIADO", "CANCELADO", "FINALIZADO"]) }),
    anotacoes: MUDANCA,
    executar: mudarSituacaoDoPedidoDeCompra,
  },
];
