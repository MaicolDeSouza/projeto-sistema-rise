import { prisma } from "@/lib/db";
import { detalheDoProduto } from "@/lib/coleta/banco";
import { custoDoFornecedor } from "@/lib/coleta/impostos";
import { custosDoAnuncio } from "@/lib/canaisDeVenda/ml/custos";
import { descobrirCategoria, lerCustosDoAnuncio, precoPorMargemNoML } from "@/lib/canaisDeVenda/ml/leitura";
import {
  CONFIANCAS,
  LIMITES,
  VEREDITOS,
  confiancaDoEstudo,
  melhorFornecedor,
  quantidadeInicial,
  resumoDoMercado,
  vendasPorMesEntre,
  vereditoPelasRegras,
} from "./regras.js";

/**
 * O banco do estudo de viabilidade (spec 2026-11-12-estudo-de-viabilidade-design.md): a fila que o botao do Scraper
 * enche, a leitura para o Claude, as contas e o fechamento. NUNCA escreve em Produto, vinculo, custo ou pedido.
 */

export class ErroDoEstudo extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroDoEstudo";
  }
}

const recusar = (mensagem) => {
  throw new ErroDoEstudo(mensagem);
};

// O pacote "mais comum" da loja (componente pequeno em envelope) para o frete quando o Claude nao achou as medidas: o
// relatorio diz que o frete foi estimado e o veredito vira "com ressalva".
const PACOTE_ESTIMADO = { alturaCm: 5, larguraCm: 12, comprimentoCm: 16, pesoKg: 0.2 };
const TIPO_CLASSICO = "gold_special";
const LOGISTICA = "xd_drop_off";

const temEstoque = (estoque) =>
  (typeof estoque?.quantity === "number" && estoque.quantity > 0) || (estoque?.quantity == null && /AVAILABLE|IN_STOCK/.test(String(estoque?.status ?? "")));

// ---------------------------------------------------------------------------
// Fila
// ---------------------------------------------------------------------------

/**
 * Cada produto coletado vira um estudo NA FILA. O que ja tem estudo na fila nao entra de novo (`repetidos`), e o que nao
 * existe mais e contado em `naoAchados`.
 */
export async function enviarParaEstudo(ids, { usuario = null } = {}) {
  const unicos = [...new Set((ids ?? []).filter((id) => typeof id === "string" && id))];
  if (unicos.length === 0) recusar("Marque ao menos um produto.");
  if (unicos.length > 50) recusar("No máximo 50 produtos por vez.");

  const [linhas, naFila] = await Promise.all([
    prisma.produtoColetado.findMany({
      where: { id: { in: unicos } },
      select: { id: true, nome: true, codigo: true, url: true, miniatura: true, fonte: { select: { nome: true, tipo: true } } },
    }),
    prisma.estudoDeViabilidade.findMany({ where: { produtoColetadoId: { in: unicos }, situacao: "NA_FILA" }, select: { produtoColetadoId: true } }),
  ]);
  const jaNaFila = new Set(naFila.map((estudo) => estudo.produtoColetadoId));
  const novos = linhas.filter((linha) => !jaNaFila.has(linha.id));
  if (novos.length) {
    await prisma.estudoDeViabilidade.createMany({
      data: novos.map((linha) => ({
        produtoColetadoId: linha.id,
        nome: linha.nome ?? linha.codigo ?? "Produto sem nome",
        codigo: linha.codigo && linha.codigo !== "N/A" ? linha.codigo : null,
        fonteNome: linha.fonte.nome,
        fonteTipo: linha.fonte.tipo,
        url: linha.url,
        // A miniatura da Fortek e base64 de dezenas de KB: so a de endereco vai junto (a tela usa a foto da linha).
        miniatura: linha.miniatura && !linha.miniatura.startsWith("data:") ? linha.miniatura : null,
        criadoPor: usuario,
      })),
    });
  }
  return { criados: novos.length, repetidos: linhas.length - novos.length, naoAchados: unicos.length - linhas.length };
}

/** Um estudo NOVO do mesmo produto (o "Estudar de novo" do relatorio); o antigo fica como historico. */
export async function estudarDeNovo(id, { usuario = null } = {}) {
  const estudo = await prisma.estudoDeViabilidade.findUnique({ where: { id } });
  if (!estudo) recusar("Estudo não encontrado.");
  const naFila = await prisma.estudoDeViabilidade.findFirst({
    where: { situacao: "NA_FILA", ...(estudo.produtoColetadoId ? { produtoColetadoId: estudo.produtoColetadoId } : { nome: estudo.nome, fonteNome: estudo.fonteNome }) },
    select: { id: true },
  });
  if (naFila) return { id: naFila.id, jaEstava: true };
  const { id: novo } = await prisma.estudoDeViabilidade.create({
    data: {
      produtoColetadoId: estudo.produtoColetadoId,
      nome: estudo.nome,
      codigo: estudo.codigo,
      fonteNome: estudo.fonteNome,
      fonteTipo: estudo.fonteTipo,
      url: estudo.url,
      miniatura: estudo.miniatura,
      criadoPor: usuario,
    },
    select: { id: true },
  });
  return { id: novo, jaEstava: false };
}

export async function excluirEstudos(ids) {
  const { count } = await prisma.estudoDeViabilidade.deleteMany({ where: { id: { in: ids ?? [] } } });
  return count;
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------

export const COLUNAS_DOS_ESTUDOS = ["nome", "fonte", "situacao", "veredito", "preco", "custo", "lucro", "quantidade", "data"];

const ORDEM_SQL = {
  nome: (direcao) => [{ nome: direcao }],
  fonte: (direcao) => [{ fonteNome: direcao }],
  situacao: (direcao) => [{ situacao: direcao }],
  veredito: (direcao) => [{ veredito: { sort: direcao, nulls: "last" } }],
  quantidade: (direcao) => [{ quantidadeInicial: { sort: direcao, nulls: "last" } }],
  data: (direcao) => [{ criadoEm: direcao }],
};
// Preco, custo e lucro moram no JSON das contas: ordenados em memoria (a lista e pequena: um estudo por produto mandado).
const NO_JSON = {
  preco: (estudo) => estudo.contas?.mercado?.precoReferencia ?? null,
  custo: (estudo) => estudo.contas?.custo?.custo ?? null,
  lucro: (estudo) => estudo.contas?.lucro?.lucro ?? null,
};

/** A lista da tela: busca pelo nome, codigo ou fonte, filtro de situacao, ordem da coluna clicada e paginacao. */
export async function listarEstudos({ busca = "", situacao = [], ordenar = null, direcao = "asc", pagina = 1, porPagina = 25 } = {}) {
  const palavras = String(busca).trim().split(/\s+/).filter(Boolean);
  const where = {
    ...(situacao.length ? { situacao: { in: situacao } } : {}),
    AND: palavras.map((palavra) => ({
      OR: [
        { nome: { contains: palavra, mode: "insensitive" } },
        { codigo: { contains: palavra, mode: "insensitive" } },
        { fonteNome: { contains: palavra, mode: "insensitive" } },
      ],
    })),
  };
  const select = {
    id: true,
    produtoColetadoId: true,
    nome: true,
    codigo: true,
    fonteNome: true,
    fonteTipo: true,
    miniatura: true,
    situacao: true,
    veredito: true,
    confianca: true,
    quantidadeInicial: true,
    contas: true,
    criadoEm: true,
    concluidoEm: true,
  };
  const total = await prisma.estudoDeViabilidade.count({ where });
  let linhas;
  if (ordenar && NO_JSON[ordenar]) {
    const todas = await prisma.estudoDeViabilidade.findMany({ where, select, orderBy: { criadoEm: "desc" } });
    const valor = NO_JSON[ordenar];
    todas.sort((a, b) => {
      const [x, y] = [valor(a), valor(b)];
      if (x === null) return y === null ? 0 : 1;
      if (y === null) return -1;
      return direcao === "desc" ? y - x : x - y;
    });
    linhas = todas.slice((pagina - 1) * porPagina, pagina * porPagina);
  } else {
    const orderBy = ordenar && ORDEM_SQL[ordenar] ? ORDEM_SQL[ordenar](direcao) : [{ criadoEm: "desc" }];
    linhas = await prisma.estudoDeViabilidade.findMany({ where, select, orderBy, skip: (pagina - 1) * porPagina, take: porPagina });
  }
  // A foto da linha: a do estudo ou a miniatura atual do produto coletado (a da Fortek e base64 e nao foi copiada).
  const semFoto = linhas.filter((linha) => !linha.miniatura && linha.produtoColetadoId).map((linha) => linha.produtoColetadoId);
  const fotos = semFoto.length
    ? new Map((await prisma.produtoColetado.findMany({ where: { id: { in: semFoto } }, select: { id: true, miniatura: true } })).map((linha) => [linha.id, linha.miniatura]))
    : new Map();
  return { total, linhas: linhas.map((linha) => ({ ...linha, miniatura: linha.miniatura ?? fotos.get(linha.produtoColetadoId) ?? null })) };
}

export async function contarEstudos() {
  const grupos = await prisma.estudoDeViabilidade.groupBy({ by: ["situacao"], _count: true });
  return Object.fromEntries(grupos.map((grupo) => [grupo.situacao, grupo._count]));
}

/** Um estudo inteiro, com os outros estudos do mesmo produto (o historico) e a foto atual do produto coletado. */
export async function lerEstudo(id) {
  const estudo = await prisma.estudoDeViabilidade.findUnique({ where: { id } });
  if (!estudo) return null;
  const [historico, coletado] = await Promise.all([
    prisma.estudoDeViabilidade.findMany({
      where: { id: { not: id }, ...(estudo.produtoColetadoId ? { produtoColetadoId: estudo.produtoColetadoId } : { nome: estudo.nome, fonteNome: estudo.fonteNome }) },
      orderBy: { criadoEm: "desc" },
      select: { id: true, situacao: true, veredito: true, confianca: true, quantidadeInicial: true, contas: true, criadoEm: true, concluidoEm: true },
    }),
    estudo.produtoColetadoId ? prisma.produtoColetado.findUnique({ where: { id: estudo.produtoColetadoId }, select: { miniatura: true } }) : null,
  ]);
  return { ...estudo, miniatura: estudo.miniatura ?? coletado?.miniatura ?? null, historico };
}

/** A fila para o Claude (padrao: na fila), do mais antigo para o mais novo: a ordem em que o dono mandou. */
export async function filaDeEstudos({ situacao = "NA_FILA", limite = 20 } = {}) {
  const linhas = await prisma.estudoDeViabilidade.findMany({
    where: situacao === "TODOS" ? {} : { situacao },
    orderBy: { criadoEm: situacao === "NA_FILA" ? "asc" : "desc" },
    take: limite,
    select: { id: true, nome: true, codigo: true, fonteNome: true, fonteTipo: true, situacao: true, veredito: true, criadoEm: true, concluidoEm: true },
  });
  return linhas;
}

function paraOClaude(detalhe) {
  if (!detalhe) return null;
  const produto = detalhe.produto;
  return {
    produtoColetadoId: detalhe.id,
    fonte: detalhe.fonte?.nome ?? null,
    tipoDaFonte: detalhe.fonte?.tipo ?? null,
    nome: produto.name,
    codigo: produto.code,
    mpn: produto.mpn,
    ean: produto.ean,
    marca: produto.brand,
    modelo: produto.model,
    categoria: produto.category,
    url: produto.url,
    precos: produto.prices,
    custo: detalhe.fonte?.tipo === "FORNECEDOR" ? custoDoFornecedor(produto.prices, produto.taxes) : null,
    estoque: produto.stock,
    multiploVenda: produto.multiploVenda,
    especificacoes: (produto.specifications ?? []).slice(0, 40),
    // A descricao inteira passa de 10 KB em algumas lojas; o comeco basta para identificar o produto.
    descricao: produto.description ? String(produto.description).slice(0, 3000) : null,
    vistoEm: detalhe.vistoEm,
  };
}

/** O que o Claude precisa para estudar: o produto coletado inteiro e os estudos anteriores do mesmo produto. */
export async function lerParaEstudo(id) {
  const estudo = await prisma.estudoDeViabilidade.findUnique({ where: { id } });
  if (!estudo) recusar("Estudo não encontrado.");
  const detalhe = estudo.produtoColetadoId ? await detalheDoProduto(estudo.produtoColetadoId) : null;
  const anteriores = await prisma.estudoDeViabilidade.findMany({
    where: { id: { not: id }, situacao: "CONCLUIDO", ...(estudo.produtoColetadoId ? { produtoColetadoId: estudo.produtoColetadoId } : { nome: estudo.nome }) },
    orderBy: { concluidoEm: "desc" },
    take: 3,
    select: { id: true, concluidoEm: true, veredito: true, termos: true, anunciosML: true },
  });
  return {
    estudo: { id: estudo.id, situacao: estudo.situacao, nome: estudo.nome, codigo: estudo.codigo, fonte: estudo.fonteNome, tipoDaFonte: estudo.fonteTipo, url: estudo.url },
    produto: paraOClaude(detalhe) ?? { aviso: "O produto coletado não existe mais no Scraper; estude pelo nome." },
    anteriores,
  };
}

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

/** Os fornecedores apontados, lidos do banco (o custo nunca vem digitado pelo Claude). */
async function fornecedoresApontados(ids) {
  const unicos = [...new Set(ids ?? [])];
  if (unicos.length === 0) return [];
  const detalhes = await Promise.all(unicos.map((id) => detalheDoProduto(id)));
  return detalhes.map((detalhe, indice) => {
    if (!detalhe) recusar(`O produto coletado ${unicos[indice]} não existe no Scraper.`);
    if (detalhe.fonte?.tipo !== "FORNECEDOR") recusar(`"${detalhe.produto.name}" é da fonte ${detalhe.fonte?.nome}, que não é fornecedor.`);
    const produto = detalhe.produto;
    return {
      produtoColetadoId: detalhe.id,
      fonte: detalhe.fonte.nome,
      nome: produto.name,
      codigo: produto.code,
      url: produto.url,
      custo: custoDoFornecedor(produto.prices, produto.taxes),
      quantidade: produto.stock?.quantity ?? null,
      aChegar: produto.stock?.aChegar ?? null,
      temEstoque: temEstoque(produto.stock),
      multiploVenda: produto.multiploVenda ?? null,
      vistoEm: detalhe.vistoEm,
    };
  });
}

/** Os parecidos da 4hobby, pelo SKU, com as vendas no Mercado Livre dos ultimos 90 dias (em unidades). */
async function parecidosComVendas(skus, { agora = new Date() } = {}) {
  const unicos = [...new Set((skus ?? []).map((sku) => String(sku).trim()).filter(Boolean))];
  if (unicos.length === 0) return [];
  const produtos = await prisma.produto.findMany({ where: { sku: { in: unicos } }, select: { id: true, sku: true, tituloBase: true, precoVenda: true } });
  const faltando = unicos.filter((sku) => !produtos.some((produto) => produto.sku === sku));
  if (faltando.length) recusar(`Produto(s) da 4hobby não encontrado(s): ${faltando.join(", ")}.`);
  const desde = new Date(agora.getTime() - LIMITES.diasDasVendasDaLoja * 86_400_000);
  const vendas = await prisma.itemDoPedidoDeVenda.groupBy({
    by: ["produtoId"],
    where: {
      produtoId: { in: produtos.map((produto) => produto.id) },
      pedido: { canal: "MERCADO_LIVRE", dataDaVenda: { gte: desde }, status: { notIn: ["CANCELADO", "DEVOLVIDO"] } },
    },
    _sum: { quantidade: true },
  });
  const porProduto = new Map(vendas.map((venda) => [venda.produtoId, venda._sum.quantidade ?? 0]));
  const meses = LIMITES.diasDasVendasDaLoja / 30;
  return produtos.map((produto) => {
    const unidades = porProduto.get(produto.id) ?? 0;
    return {
      produtoId: produto.id,
      sku: produto.sku,
      nome: produto.tituloBase,
      precoVenda: produto.precoVenda === null ? null : Number(produto.precoVenda),
      vendidos90Dias: unidades,
      vendasPorMes: Math.round((unidades / meses) * 10) / 10,
    };
  });
}

/**
 * O lucro no ML vendendo pelo preco de referencia, com as taxas e o frete REAIS lidos do ML (a mesma conta do editor de
 * anuncio), e o preco minimo para 30% de markup. Sem medidas, o frete vai pelo pacote estimado.
 */
async function lucroNoML(cliente, { preco, custo, categoriaId, medidas }) {
  if (!(preco > 0)) return null;
  const freteEstimado = !(medidas?.alturaCm > 0 && medidas?.larguraCm > 0 && medidas?.comprimentoCm > 0 && medidas?.pesoKg > 0);
  const envio = { ...(freteEstimado ? PACOTE_ESTIMADO : medidas), logistica: LOGISTICA, freteGratis: false };
  const rascunho = { preco, categoriaId, tipoAnuncio: TIPO_CLASSICO, envio };
  const custosML = await lerCustosDoAnuncio(cliente, rascunho);
  const conta = custosDoAnuncio({ preco, custo, percentual: custosML.percentual, tarifaFixa: custosML.tarifaFixa, frete: custosML.frete ?? 0 });
  const minimo = custo > 0 ? await precoPorMargemNoML(cliente, rascunho, { custo, margem: { tipo: "percentual", valor: LIMITES.markupBom } }) : null;
  return {
    preco,
    tipoAnuncio: "Clássico",
    comissaoPercentual: Math.round(custosML.percentual * 1000) / 10,
    ...conta,
    freteEstimado,
    pacote: freteEstimado ? PACOTE_ESTIMADO : medidas,
    precoMinimo: minimo?.preco ?? null,
  };
}

/**
 * Grava o que o Claude leu e apontou, faz as contas e devolve os numeros. Pode ser chamada de novo (o Claude corrigiu um
 * anuncio): refaz tudo. `cliente` e o do ML (`clienteML()`; o teste passa um falso).
 */
export async function calcularEstudo(id, entrada, { cliente, agora = new Date() } = {}) {
  const estudo = await prisma.estudoDeViabilidade.findUnique({ where: { id } });
  if (!estudo) recusar("Estudo não encontrado.");
  if (estudo.situacao === "CONCLUIDO") recusar("Este estudo já foi concluído. Use \"Estudar de novo\" para um estudo novo.");

  const anuncios = entrada.anuncios ?? [];
  const mercado = resumoDoMercado(anuncios);
  const fornecedores = await fornecedoresApontados(entrada.fornecedores);
  const parecidos = await parecidosComVendas(entrada.parecidos, { agora });
  const melhor = melhorFornecedor(fornecedores);

  let categoriaId = entrada.categoriaId ?? null;
  let categoriaNome = null;
  if (!categoriaId && mercado.precoReferencia !== null) {
    const titulo = anuncios.find((anuncio) => anuncio.mesmoProduto)?.titulo ?? estudo.nome;
    const achadas = await descobrirCategoria(cliente, titulo);
    categoriaId = achadas[0]?.categoriaId ?? null;
    categoriaNome = achadas[0]?.nome ?? null;
  }
  if (mercado.precoReferencia !== null && !categoriaId) recusar("O Mercado Livre não sugeriu categoria para este produto: informe categoriaId (o MLB… da categoria do anúncio).");
  const lucro = categoriaId ? await lucroNoML(cliente, { preco: mercado.precoReferencia, custo: melhor?.custo ?? null, categoriaId, medidas: entrada.medidas }) : null;

  const anterior = await prisma.estudoDeViabilidade.findFirst({
    where: { id: { not: id }, situacao: "CONCLUIDO", ...(estudo.produtoColetadoId ? { produtoColetadoId: estudo.produtoColetadoId } : { nome: estudo.nome }) },
    orderBy: { concluidoEm: "desc" },
    select: { anunciosML: true, calculadoEm: true, concluidoEm: true },
  });
  const vendasDoMercado = anterior ? vendasPorMesEntre({ anuncios: anterior.anunciosML, em: anterior.calculadoEm ?? anterior.concluidoEm }, { anuncios, em: agora }) : null;

  const quantidade = quantidadeInicial({ parecidos, demanda: mercado.demanda, multiplo: melhor?.multiploVenda });
  const contas = {
    mercado: { ...mercado, vendasPorMes: vendasDoMercado },
    custo: { custo: melhor?.custo ?? null, fornecedor: melhor?.fonte ?? null, fornecedores },
    lucro: lucro ? { ...lucro, categoriaId, categoriaNome } : null,
    quantidade,
    confianca: confiancaDoEstudo(mercado),
  };
  const regra = vereditoPelasRegras(contas);
  contas.regra = { ...regra, quantidade: regra.veredito === "NAO_VALE" ? 0 : quantidade.quantidade };

  await prisma.estudoDeViabilidade.update({
    where: { id },
    data: { termos: entrada.termos ?? [], anunciosML: anuncios, fornecedores, parecidos, contas, calculadoEm: agora },
  });
  return contas;
}

/**
 * Fecha o estudo. Sem `veredito`, vale o das regras; um veredito diferente do das regras so com `motivoDaDiferenca`.
 * Recusa se as contas nao foram feitas.
 */
export async function gravarEstudo(id, { veredito, confianca, conclusao, motivoDaDiferenca, versaoDoRoteiro } = {}, { agora = new Date() } = {}) {
  const estudo = await prisma.estudoDeViabilidade.findUnique({ where: { id } });
  if (!estudo) recusar("Estudo não encontrado.");
  if (estudo.situacao === "CONCLUIDO") recusar("Este estudo já foi concluído.");
  if (!estudo.contas) recusar("Faça as contas antes (calcularEstudoDeViabilidade).");
  const texto = String(conclusao ?? "").trim();
  if (!texto) recusar("Escreva a conclusão.");

  const regra = estudo.contas.regra ?? vereditoPelasRegras(estudo.contas);
  const final = veredito ?? regra.veredito;
  if (!VEREDITOS.includes(final)) recusar("Veredito inválido.");
  if (final !== regra.veredito && !String(motivoDaDiferenca ?? "").trim()) {
    recusar(`As regras dão "${regra.veredito}". Para gravar "${final}", diga o motivo em motivoDaDiferenca.`);
  }
  const confiancaFinal = confianca ?? estudo.contas.confianca;
  if (!CONFIANCAS.includes(confiancaFinal)) recusar("Confiança inválida.");
  const quantidade = final === "NAO_VALE" ? 0 : estudo.contas.quantidade.quantidade;
  const conclusaoFinal = final !== regra.veredito ? `${texto}\n\nDiferente das regras (${regra.veredito}): ${String(motivoDaDiferenca).trim()}` : texto;

  await prisma.estudoDeViabilidade.update({
    where: { id },
    data: { situacao: "CONCLUIDO", veredito: final, confianca: confiancaFinal, quantidadeInicial: quantidade, conclusao: conclusaoFinal, versaoDoRoteiro: versaoDoRoteiro ?? null, concluidoEm: agora },
  });
  return { id, veredito: final, confianca: confiancaFinal, quantidadeInicial: quantidade };
}
