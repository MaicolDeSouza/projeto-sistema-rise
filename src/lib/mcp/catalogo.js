import { z } from "zod";

import { INCLUDE_DO_ICONE_BLING, iconeBlingDoProduto } from "@/lib/blingSync/estado";
import { ROTULO_DO_TIPO_ML } from "@/lib/canaisDeVenda/ml/rotulos";
import { prisma } from "@/lib/db";
import { RESTRITO, faixaDeEstoque } from "@/lib/riseAi/busca";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

/**
 * As ferramentas do MCP sobre o catalogo alem da busca do Rise AI (pedido do dono em 20/10/2026, "quero ter acesso aos
 * principais dados do Rise"): filtrar o catalogo inteiro (sem estoque, abaixo do minimo, sem anuncio...), os anuncios de um
 * produto nos canais e o historico de preco. So leitura. Custo so com `dado.custo`, concorrentes so com
 * `dado.concorrentes` e o estoque exato so com `dado.estoqueExato` (sem ele, a faixa: disponivel, poucas unidades, em falta).
 */

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));
const emTexto = (data) => (data instanceof Date ? data.toISOString() : null);
const doMes = (data) => data.toISOString().slice(0, 7);
const igualSemCaixa = (texto) => ({ equals: String(texto ?? "").trim(), mode: "insensitive" });

// ---------------------------------------------------------------------------
// filtrarProdutos
// ---------------------------------------------------------------------------

export const FILTROS = ["semEstoque", "abaixoDoMinimo", "semAnuncioML", "semAnuncioLI", "semBling", "naoConferidos", "semFoto", "kits", "inativos"];

const ESQUEMA_FILTRAR = z.object({
  termos: z.string().trim().max(200).optional().describe("Palavras do nome, da marca, do modelo ou do código (todas exigidas); vazio = o catálogo inteiro"),
  filtros: z.array(z.enum(FILTROS)).max(FILTROS.length).default([]).describe(
    "Todos valem juntos: semEstoque, abaixoDoMinimo (estoque menor que o mínimo cadastrado), semAnuncioML (sem anúncio publicado no Mercado Livre), semAnuncioLI (não está na Loja Integrada), semBling (não vinculado ao Bling), naoConferidos, semFoto, kits (produtos com composição) e inativos (só os inativos; sem ele, só os ativos)",
  ),
  marca: z.string().trim().max(80).optional().describe("Só desta marca"),
  limite: z.number().int().min(1).max(100).optional().describe("Quantos devolver (1 a 100; padrão 30). O total vem junto"),
});

const FOTO_DO_PRODUTO = { tipo: "IMAGEM", papel: "FOTO" };
const PUBLICADO_NO_ML = { canal: "MERCADO_LIVRE", status: "PUBLICADO" };

function condicaoDoFiltro(filtro) {
  switch (filtro) {
    case "semEstoque":
      return { estoque: { lte: 0 } };
    case "abaixoDoMinimo":
      // Comparar duas colunas: o Prisma aceita a referencia ao campo.
      return { estoqueMinimo: { not: null }, estoque: { lt: prisma.produto.fields.estoqueMinimo } };
    case "semAnuncioML":
      return { anuncios: { none: PUBLICADO_NO_ML } };
    case "semAnuncioLI":
      return { OR: [{ urlLojaIntegrada: null }, { urlLojaIntegrada: "" }], anuncios: { none: { canal: "LOJA_INTEGRADA", idExterno: { not: null } } } };
    case "semBling":
      return { OR: [{ blingId: null }, { blingId: "" }] };
    case "naoConferidos":
      return { conferido: false };
    case "semFoto":
      return { arquivos: { none: FOTO_DO_PRODUTO } };
    case "kits":
      return { tipo: "COMPOSICAO" };
    default:
      return {};
  }
}

const palavrasDe = (termos) => String(termos ?? "").trim().split(/\s+/).filter(Boolean);

export async function filtrarProdutos({ termos, filtros = [], marca, limite = 30 }, { pode }) {
  const exato = pode("dado.estoqueExato", "ver");
  if (filtros.includes("abaixoDoMinimo") && !exato) throw new ErroDeFerramenta("Este login não pode filtrar pelo estoque mínimo (precisa do estoque exato).");

  const condicoes = [{ ativo: !filtros.includes("inativos") }, ...filtros.filter((filtro) => filtro !== "inativos").map(condicaoDoFiltro)];
  for (const palavra of palavrasDe(termos)) {
    condicoes.push({ OR: ["sku", "tituloBase", "marca", "modelo"].map((campo) => ({ [campo]: { contains: palavra, mode: "insensitive" } })) });
  }
  if (marca) condicoes.push({ marca: igualSemCaixa(marca) });
  const where = { AND: condicoes };

  const [total, produtos] = await Promise.all([
    prisma.produto.count({ where }),
    prisma.produto.findMany({
      where,
      orderBy: { sku: "asc" },
      take: limite,
      select: {
        sku: true,
        tituloBase: true,
        marca: true,
        precoVenda: true,
        custo: true,
        fornecedorRascunho: true,
        estoque: true,
        estoqueMinimo: true,
        conferido: true,
        ativo: true,
        tipo: true,
        blingId: true,
        urlLojaIntegrada: true,
        anuncios: { select: { canal: true, status: true, idExterno: true } },
        _count: { select: { arquivos: { where: FOTO_DO_PRODUTO } } },
      },
    }),
  ]);
  const veCusto = pode("dado.custo", "ver");
  return {
    total,
    produtos: produtos.map((produto) => ({
      sku: produto.sku,
      nome: produto.tituloBase,
      marca: produto.marca ?? null,
      preco: numero(produto.precoVenda),
      estoque: exato ? produto.estoque : faixaDeEstoque(produto.estoque),
      estoqueMinimo: produto.estoqueMinimo ?? null,
      // O custo do cadastro e, na falta dele, o do rascunho do Bling (de onde vem o dos produtos importados).
      custo: veCusto ? (numero(produto.custo) ?? numero(produto.fornecedorRascunho?.precoCusto)) : RESTRITO,
      conferido: produto.conferido,
      ativo: produto.ativo,
      kit: produto.tipo === "COMPOSICAO",
      fotos: produto._count.arquivos,
      canais: {
        bling: Boolean(produto.blingId),
        mercadoLivre: produto.anuncios.filter((anuncio) => anuncio.canal === "MERCADO_LIVRE" && anuncio.status === "PUBLICADO").length,
        lojaIntegrada: Boolean(produto.urlLojaIntegrada) || produto.anuncios.some((anuncio) => anuncio.canal === "LOJA_INTEGRADA" && anuncio.idExterno),
      },
    })),
  };
}

// ---------------------------------------------------------------------------
// anunciosDoProduto
// ---------------------------------------------------------------------------

const ESQUEMA_ANUNCIOS = z.object({ sku: z.string().trim().min(1).max(40).describe("Código (SKU) do produto, como no cadastro") });

async function produtoPeloSku(sku, extra = {}) {
  const produto = await prisma.produto.findFirst({ where: { sku: igualSemCaixa(sku) }, ...extra });
  if (!produto) throw new ErroDeFerramenta(`Produto não encontrado: ${sku}.`);
  return produto;
}

const publicadoPrimeiro = (a, b) => Number(b.status === "PUBLICADO") - Number(a.status === "PUBLICADO") || a.criadoEm - b.criadoEm;

export async function anunciosDoProduto({ sku }, { pode }) {
  const produto = await produtoPeloSku(sku, { include: { ...INCLUDE_DO_ICONE_BLING, anuncios: true } });
  const doCanal = (canal) => produto.anuncios.filter((anuncio) => anuncio.canal === canal).sort(publicadoPrimeiro);

  let bling = { vinculado: false };
  if (produto.blingId) {
    const icone = iconeBlingDoProduto(produto);
    bling = {
      vinculado: true,
      sincronizadoEm: emTexto(produto.blingSincronizadoEm),
      // O ultimo saldo lido do Bling: estoque exato, so com o acesso.
      saldoNoBling: pode("dado.estoqueExato", "ver") ? (produto.blingSaldo ?? null) : RESTRITO,
      diferenteDoRise: icone.divergente,
      motivos: icone.motivos.map((motivo) => (motivo === "campos" ? "campos do cadastro mudaram desde o último envio" : "ajustes de estoque ainda não enviados")),
    };
  }

  const li = doCanal("LOJA_INTEGRADA")[0];
  const lojaIntegrada = li
    ? { status: li.status, situacao: li.situacaoCanal, idExterno: li.idExterno ?? null, url: li.urlExterna ?? produto.urlLojaIntegrada ?? null, sincronizadoEm: emTexto(li.sincronizadoEm) }
    : produto.urlLojaIntegrada
      ? { status: null, situacao: null, idExterno: null, url: produto.urlLojaIntegrada, sincronizadoEm: null }
      : null;

  return {
    sku: produto.sku,
    nome: produto.tituloBase,
    preco: numero(produto.precoVenda),
    bling,
    mercadoLivre: doCanal("MERCADO_LIVRE").map((anuncio) => ({
      tipo: ROTULO_DO_TIPO_ML[anuncio.dados?.tipoAnuncio] ?? anuncio.dados?.tipoAnuncio ?? null,
      preco: numero(anuncio.dados?.preco),
      status: anuncio.status,
      situacao: anuncio.situacaoCanal,
      titulo: anuncio.titulo ?? null,
      idExterno: anuncio.idExterno ?? null,
      url: anuncio.urlExterna ?? null,
      publicadoEm: emTexto(anuncio.publicadoEm),
    })),
    lojaIntegrada,
  };
}

// ---------------------------------------------------------------------------
// historicoDePreco
// ---------------------------------------------------------------------------

const ESQUEMA_HISTORICO = z.object({
  sku: z.string().trim().min(1).max(40).optional().describe("Código (SKU) de um produto do Rise: os meses dele e a série de cada concorrente ligado"),
  fonte: z.string().trim().min(1).max(120).optional().describe("Nome da fonte (fornecedor ou concorrente), para um produto coletado que não está no Rise"),
  codigo: z.string().trim().min(1).max(80).optional().describe("Código do produto na fonte (junto com fonte)"),
  meses: z.number().int().min(1).max(24).optional().describe("Quantos meses de foto mensal (padrão 12)"),
  pontos: z.number().int().min(1).max(100).optional().describe("Quantas mudanças de preço por produto coletado (padrão 30)"),
});

async function serieDoColetado(produtoColetadoId, pontos) {
  const linhas = await prisma.precoHistorico.findMany({ where: { produtoId: produtoColetadoId }, orderBy: { coletadoEm: "desc" }, take: pontos });
  return linhas.reverse().map((linha) => ({ em: emTexto(linha.coletadoEm), precoNormal: numero(linha.precoNormal), precoPromocional: numero(linha.precoPromocional), estoqueStatus: linha.estoqueStatus ?? null }));
}

export async function historicoDePreco({ sku, fonte, codigo, meses = 12, pontos = 30 }, { pode }) {
  if (sku) {
    const produto = await produtoPeloSku(sku, {
      include: { concorrentes: { include: { produtoColetado: { include: { fonte: { select: { nome: true } } } } }, orderBy: { criadoEm: "asc" } } },
    });
    const fotos = await prisma.fotoMensalProduto.findMany({ where: { produtoId: produto.id }, orderBy: { mes: "desc" }, take: meses });
    const veCusto = pode("dado.custo", "ver");
    const exato = pode("dado.estoqueExato", "ver");
    let concorrentes = RESTRITO;
    if (pode("dado.concorrentes", "ver")) {
      concorrentes = [];
      for (const vinculo of produto.concorrentes) {
        const coletado = vinculo.produtoColetado;
        concorrentes.push(
          coletado
            ? { fonte: coletado.fonte.nome, codigo: coletado.codigo ?? null, nome: coletado.nome ?? null, url: coletado.url ?? null, precoAtual: numero(coletado.precoNormal) ?? numero(coletado.precoPromocional), serie: await serieDoColetado(coletado.id, pontos) }
            : { fonte: vinculo.fonteManual ?? null, codigo: vinculo.codigoManual ?? null, nome: vinculo.nomeManual ?? null, url: vinculo.linkManual ?? null, precoAtual: numero(vinculo.precoManual), serie: [] },
        );
      }
    }
    return {
      sku: produto.sku,
      nome: produto.tituloBase,
      precoAtual: numero(produto.precoVenda),
      // A foto do dia 14 de cada mes (preco, custo e o estoque da importacao do Bling naquele dia).
      meses: fotos.reverse().map((foto) => ({
        mes: doMes(foto.mes),
        precoVenda: numero(foto.precoVenda),
        custo: veCusto ? numero(foto.custo) : RESTRITO,
        estoque: exato ? foto.estoque : faixaDeEstoque(foto.estoque),
      })),
      concorrentes,
    };
  }

  if (!fonte || !codigo) throw new ErroDeFerramenta("Informe o sku de um produto do Rise, ou a fonte e o código de um produto coletado.");
  const daFonte = await prisma.fonteColeta.findFirst({ where: { nome: igualSemCaixa(fonte) }, select: { id: true, nome: true, tipo: true } });
  if (!daFonte) throw new ErroDeFerramenta(`Fonte não encontrada: ${fonte}.`);
  const recurso = daFonte.tipo === "FORNECEDOR" ? "dado.custo" : "dado.concorrentes";
  if (!pode(recurso, "ver")) throw new ErroDeFerramenta(daFonte.tipo === "FORNECEDOR" ? "Este login não pode ver os fornecedores." : "Este login não pode ver os concorrentes.");
  const coletado = await prisma.produtoColetado.findFirst({ where: { fonteId: daFonte.id, codigo: igualSemCaixa(codigo) } });
  if (!coletado) throw new ErroDeFerramenta(`Código ${codigo} não encontrado em ${daFonte.nome}.`);
  const fotos = await prisma.fotoMensalColeta.findMany({ where: { produtoId: coletado.id }, orderBy: { mes: "desc" }, take: meses });
  return {
    coletado: {
      fonte: daFonte.nome,
      tipo: daFonte.tipo === "FORNECEDOR" ? "fornecedor" : "concorrente",
      codigo: coletado.codigo ?? null,
      nome: coletado.nome ?? null,
      url: coletado.url ?? null,
      precoAtual: numero(coletado.precoNormal) ?? numero(coletado.precoPromocional),
      serie: await serieDoColetado(coletado.id, pontos),
      meses: fotos.reverse().map((foto) => ({ mes: doMes(foto.mes), preco: numero(foto.preco), tipoPreco: foto.tipoPreco ?? null, quantidade: foto.quantidade ?? null, estoqueStatus: foto.estoqueStatus ?? null })),
    },
  };
}

// ---------------------------------------------------------------------------

export const FERRAMENTAS_DO_CATALOGO = [
  {
    nome: "filtrarProdutos",
    descricao:
      "Lista produtos do catálogo da loja por situação, sem precisar de palavra-chave: sem estoque, abaixo do mínimo, sem anúncio no Mercado Livre, fora da Loja Integrada, sem Bling, não conferidos, sem foto, kits ou inativos (os filtros valem juntos), opcionalmente com palavras ou marca. Traz o total e, por produto, preço, estoque, mínimo, custo, conferido, fotos e em quais canais está.",
    esquema: ESQUEMA_FILTRAR,
    executar: filtrarProdutos,
  },
  {
    nome: "anunciosDoProduto",
    descricao:
      "Onde um produto (pelo SKU) está anunciado: os anúncios do Mercado Livre (Clássico/Premium, preço, situação e link), a Loja Integrada (link e quando sincronizou) e o Bling (vinculado, quando sincronizou e se o Rise está diferente do Bling).",
    esquema: ESQUEMA_ANUNCIOS,
    executar: anunciosDoProduto,
  },
  {
    nome: "historicoDePreco",
    descricao:
      "Histórico de preço. Com o SKU de um produto do Rise: a foto mensal (preço de venda, custo e estoque de cada mês) e a série de mudanças de preço de cada concorrente ligado a ele. Com fonte e código: a série de um produto coletado de um fornecedor ou concorrente. As séries vêm da mais antiga para a mais nova.",
    esquema: ESQUEMA_HISTORICO,
    executar: historicoDePreco,
  },
];
