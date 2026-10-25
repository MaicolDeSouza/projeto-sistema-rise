import { lerCamposDasReferencias } from "@/lib/camposDasReferencias";
import { clienteLI } from "@/lib/canaisDeVenda/li/cliente";
import { listarCategoriasDaLI, textoDoErroLI } from "@/lib/canaisDeVenda/li/leitura";
import { seoDosConcorrentes } from "@/lib/canaisDeVenda/li/seoConcorrentes";
import { prisma } from "@/lib/db";
import { listarPromptsDaDescricao } from "@/lib/ia/promptsDescricao";
import { ErroDeFerramenta } from "@/lib/riseAi/ferramentas/erro";

import { propostaParaFormulario } from "./banco";
import { proximoCodigoLivre } from "./codigo";

/**
 * O que a proposta automatica de produto precisa LER (spec 2026-10-21, proposta pelo MCP): o produto, os fornecedores e
 * os concorrentes vinculados, o agregado por campo e a biblioteca de prompts. Um codigo so para os dois caminhos: a
 * ferramenta `lerParaProposta` do MCP e o comando `ofertas` do script por SSH.
 *
 * Cada foto de oferta ganha um id `<produtoColetadoId>:<indice>`: e por ele, e nunca por endereco vindo da conversa, que
 * o Rise baixa a candidata (`fotoDaOferta`). A descricao da loja vai cortada, para a resposta caber na conversa.
 */

export const LIMITE_DA_DESCRICAO_DA_OFERTA = 3000;

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

/** As fotos de um produto coletado, na ordem: cada loja grava texto ou objeto (`{ url }` / `{ src }`). */
function enderecosDasImagens(valor) {
  if (!Array.isArray(valor)) return [];
  return valor.map((imagem) => (typeof imagem === "string" ? imagem : (imagem?.url ?? imagem?.src ?? null)));
}

const ehEndereco = (texto) => typeof texto === "string" && /^https?:\/\//i.test(texto);

function documentosDaOferta(valor) {
  if (!Array.isArray(valor)) return [];
  return valor.filter((documento) => ehEndereco(documento?.url)).map((documento) => ({ titulo: documento.titulo ?? null, url: documento.url }));
}

function paraOferta(linha) {
  return {
    loja: linha.fonte.nome,
    codigo: linha.codigo ?? null,
    nome: linha.nome ?? null,
    url: linha.url ?? null,
    // O preco que decide e o NORMAL; o promocional (pix, campanha) vai so como informacao.
    precoNormal: numero(linha.precoNormal),
    precoPromocional: numero(linha.precoPromocional),
    estoque: linha.estoqueStatus ?? null,
    quantidade: linha.quantidade ?? null,
    ausenteDesde: linha.ausenteDesde ?? null,
    vistoEm: linha.vistoEm ?? null,
    ean: linha.ean ?? null,
    ncm: linha.ncm ?? null,
    marca: linha.marca ?? null,
    modelo: linha.modelo ?? null,
    descricao: (linha.descricao ?? "").slice(0, LIMITE_DA_DESCRICAO_DA_OFERTA),
    ficha: Array.isArray(linha.especificacoes) ? linha.especificacoes : [],
    documentos: documentosDaOferta(linha.documentos),
    // So o que e endereco vira candidata; o indice e o da lista gravada, para `fotoDaOferta` achar a mesma foto.
    fotos: enderecosDasImagens(linha.imagens).flatMap((url, indice) => (ehEndereco(url) ? [{ id: `${linha.id}:${indice}`, url }] : [])),
  };
}

/** Fornecedores vinculados, com o NCM que a lista do fornecedor publica para aquele codigo; sem vinculo, o rascunho do Bling. */
async function fornecedoresDoProduto(produto) {
  const vinculos = await prisma.produtoFornecedor.findMany({
    where: { produtoId: produto.id },
    orderBy: [{ padrao: "desc" }, { criadoEm: "asc" }],
    include: { fornecedor: { select: { nome: true, fonteId: true } } },
  });
  if (vinculos.length === 0) {
    const rascunho = produto.fornecedorRascunho;
    if (!rascunho?.nome) return [];
    return [{ nome: rascunho.nome, codigo: rascunho.codigo ?? null, custo: numero(rascunho.precoCusto), padrao: true, ncm: null, rascunho: true }];
  }
  const comLista = vinculos.filter((vinculo) => vinculo.fornecedor.fonteId && vinculo.codigo);
  const naLista = comLista.length
    ? await prisma.produtoColetado.findMany({
        where: { OR: comLista.map((vinculo) => ({ fonteId: vinculo.fornecedor.fonteId, codigo: vinculo.codigo })) },
        select: { fonteId: true, codigo: true, ncm: true },
      })
    : [];
  return vinculos.map((vinculo) => ({
    nome: vinculo.fornecedor.nome,
    codigo: vinculo.codigo ?? null,
    custo: numero(vinculo.precoCusto),
    padrao: vinculo.padrao,
    ncm: naLista.find((linha) => linha.fonteId === vinculo.fornecedor.fonteId && linha.codigo === vinculo.codigo)?.ncm ?? null,
  }));
}

/** O prompt pedido (pelo nome, sem caixa, ou pelo id); nome que nao existe e recusado com os que existem. */
function promptPedido(prompts, pedido) {
  const alvo = pedido.trim().toLocaleLowerCase("pt-BR");
  const achado = prompts.find((prompt) => prompt.id === pedido.trim() || prompt.nome.toLocaleLowerCase("pt-BR") === alvo);
  if (!achado) throw new ErroDeFerramenta(`O prompt "${pedido}" não existe. Existem: ${prompts.map((prompt) => prompt.nome).join("; ")}.`);
  return achado.texto;
}

/**
 * O que a proposta das categorias e do SEO da Loja Integrada precisa (25/10/2026): a arvore AO VIVO da loja (so GET) e o
 * SEO que os concorrentes salvos publicam. Loja fora do ar nao derruba a leitura: volta `erro` e a conversa avisa o dono.
 */
async function lojaIntegradaParaProposta(produto) {
  const [seoConcorrentes, arvore] = await Promise.all([
    seoDosConcorrentes(produto.id).catch(() => []),
    listarCategoriasDaLI(clienteLI()).then(
      (categorias) => ({ categorias }),
      (falha) => ({ erro: textoDoErroLI(falha) }),
    ),
  ]);
  return {
    categorias: arvore.categorias?.map((categoria) => ({ id: categoria.id, caminho: categoria.caminho })) ?? null,
    ...(arvore.erro ? { erro: `Não consegui ler as categorias da loja: ${arvore.erro}` } : {}),
    categoriasDoProduto: produto.categoriasLI ?? [],
    seoTituloDoProduto: produto.seoTituloLI ?? null,
    seoDescricaoDoProduto: produto.seoDescricaoLI ?? null,
    seoConcorrentes,
    limites: { descriptionMinimo: 130, descriptionMaximo: 160 },
  };
}

/**
 * @param {string} sku
 * @param {{ prompt?: string | null }} [opcoes]
 */
export async function lerParaProposta(sku, { prompt = null } = {}) {
  const produto = await prisma.produto.findUnique({
    where: { sku: String(sku ?? "") },
    include: { arquivos: { where: { tipo: "IMAGEM", papel: "FOTO" }, orderBy: { ordem: "asc" }, select: { arquivo: true, ordem: true } } },
  });
  if (!produto) throw new ErroDeFerramenta(`O produto ${sku} não existe no Rise.`);

  const vinculos = await prisma.produtoConcorrente.findMany({ where: { produtoId: produto.id }, orderBy: { criadoEm: "asc" } });
  const ids = vinculos.map((vinculo) => vinculo.produtoColetadoId).filter(Boolean);
  const [linhas, agregado, fornecedores, prompts, proposta, proximoCodigo, lojaIntegrada] = await Promise.all([
    prisma.produtoColetado.findMany({
      where: { id: { in: ids } },
      select: {
        id: true, codigo: true, nome: true, url: true, precoNormal: true, precoPromocional: true, estoqueStatus: true, quantidade: true,
        ausenteDesde: true, vistoEm: true, ean: true, ncm: true, marca: true, modelo: true, descricao: true, especificacoes: true,
        documentos: true, imagens: true, fonte: { select: { nome: true } },
      },
    }),
    lerCamposDasReferencias(ids),
    fornecedoresDoProduto(produto),
    listarPromptsDaDescricao(),
    propostaParaFormulario(produto.id),
    // A LLM nao enxerga o maior codigo usado: o proximo 25xxxx livre vem pronto (so se o produto nao tiver codigo).
    proximoCodigoLivre(),
    lojaIntegradaParaProposta(produto),
  ]);
  const porId = new Map(linhas.map((linha) => [linha.id, linha]));
  const concorrentes = vinculos.flatMap((vinculo) => {
    if (vinculo.produtoColetadoId) return porId.has(vinculo.produtoColetadoId) ? [paraOferta(porId.get(vinculo.produtoColetadoId))] : [];
    // Concorrente digitado a mao: nao ha varredura nem fotos por tras dele.
    return [{ loja: vinculo.fonteManual ?? null, nome: vinculo.nomeManual ?? null, codigo: vinculo.codigoManual ?? null, url: vinculo.linkManual ?? null, precoNormal: numero(vinculo.precoManual), manual: true, fotos: [] }];
  });

  return {
    produto: {
      id: produto.id,
      sku: produto.sku,
      titulo: produto.tituloBase,
      conferido: produto.conferido,
      tipo: produto.tipo,
      descricao: produto.descricaoBase ?? null,
      campos: {
        marca: produto.marca, modelo: produto.modelo, unidade: produto.unidade, garantiaMeses: produto.garantiaMeses, ncm: produto.ncm,
        origem: produto.origem, pesoKg: numero(produto.pesoKg), alturaCm: numero(produto.alturaCm), larguraCm: numero(produto.larguraCm),
        comprimentoCm: numero(produto.comprimentoCm), ean: produto.ean, precoVenda: numero(produto.precoVenda),
        estoqueMinimo: produto.estoqueMinimo, estoqueMaximo: produto.estoqueMaximo,
      },
      fotos: produto.arquivos.map((foto) => ({ arquivo: foto.arquivo, ordem: foto.ordem })),
    },
    fornecedores,
    concorrentes,
    agregado: Object.fromEntries(
      Object.entries(agregado).map(([campo, lista]) => [campo, lista.map((item) => ({ valor: item.valor, lojas: item.fontes, ...(item.origem ? { origem: item.origem } : {}) }))]),
    ),
    proximoCodigo,
    lojaIntegrada,
    prompts: prompts.map((item) => ({ nome: item.nome, padrao: item.padrao })),
    promptTexto: prompt ? promptPedido(prompts, prompt) : null,
    proposta: proposta ? { secoes: Object.keys(proposta.secoes ?? {}), naoAplicadas: proposta.naoAplicadas } : null,
  };
}

/**
 * O endereco da foto `<produtoColetadoId>:<indice>` SE ela for de uma oferta vinculada a este produto; senao null. E o
 * unico jeito de a proposta baixar uma foto: id inventado, de outro produto ou fora da lista nunca vira download.
 */
export async function fotoDaOferta(sku, id) {
  const partes = /^([^:\s]+):(\d{1,3})$/.exec(String(id ?? ""));
  if (!partes) return null;
  const [, coletadoId, indice] = partes;
  const vinculo = await prisma.produtoConcorrente.findFirst({
    where: { produto: { sku: String(sku ?? "") }, produtoColetadoId: coletadoId },
    select: { produtoColetado: { select: { imagens: true, fonte: { select: { nome: true } } } } },
  });
  const url = enderecosDasImagens(vinculo?.produtoColetado?.imagens)[Number(indice)];
  return ehEndereco(url) ? { url, loja: vinculo.produtoColetado.fonte.nome } : null;
}
