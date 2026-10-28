import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { caminhoDe, urlDe } from "@/lib/arquivos";
import { prisma } from "@/lib/db";
import { padronizarImagem } from "@/lib/imagens/padronizar";

/**
 * Fotos PROPRIAS do anuncio de kit do Mercado Livre (pedido do dono em 27/10/2026: "quando for KIT deve ser possivel
 * adicionar fotos, ao fazer o upload as mesmas ja tem que ser ajustadas assim como e feito ao carregar uma foto em
 * produtos"). Passam pelo MESMO padronizador do cadastro de Produto (`padronizarImagem`: 1024x1024, fundo branco, JPEG)
 * e moram no produto principal do kit, como `ProdutoArquivo` de papel KIT, em `dados/produtos/<SKU>/imagens/`: o
 * Publicar ja le as fotos do anuncio por id e por esse caminho. Toda leitura de foto do produto filtra `papel: "FOTO"`,
 * entao elas nao aparecem no cadastro, nos anuncios simples nem na LI. Gravadas na hora do envio; o anuncio as usa pelo
 * id no rascunho (so o Salvar do anuncio grava a escolha).
 */

const TETO_POR_PRODUTO = 60;

/** As fotos do kit de um ou mais produtos, por id do produto, na ordem de envio. */
export async function fotosDoKitDosProdutos(produtos) {
  const lista = (Array.isArray(produtos) ? produtos : []).filter((produto) => produto?.id && produto?.sku);
  if (lista.length === 0) return {};
  const linhas = await prisma.produtoArquivo.findMany({
    where: { produtoId: { in: lista.map((produto) => produto.id) }, tipo: "IMAGEM", papel: "KIT" },
    orderBy: [{ criadoEm: "asc" }],
    select: { id: true, produtoId: true, arquivo: true },
  });
  const skuPorId = new Map(lista.map((produto) => [produto.id, produto.sku]));
  const porProduto = {};
  for (const linha of linhas) {
    (porProduto[linha.produtoId] ??= []).push({ id: linha.id, arquivo: linha.arquivo, url: urlDe(skuPorId.get(linha.produtoId), "IMAGEM", linha.arquivo) });
  }
  return porProduto;
}

/** Padroniza e grava uma foto do kit no produto principal. Devolve a foto no formato do contexto do editor. */
export async function gravarFotoDoKit(produtoId, bytes, nomeOriginal = null) {
  const produto = await prisma.produto.findUnique({ where: { id: produtoId }, select: { id: true, sku: true } });
  if (!produto) return { ok: false, erro: "Produto não encontrado." };
  const quantas = await prisma.produtoArquivo.count({ where: { produtoId, tipo: "IMAGEM", papel: "KIT" } });
  if (quantas >= TETO_POR_PRODUTO) return { ok: false, erro: `O produto já tem ${TETO_POR_PRODUTO} fotos de kit. Exclua alguma antes.` };

  const padrao = await padronizarImagem(bytes);
  if (!padrao.ok) return padrao;

  const arquivo = `${randomUUID().replaceAll("-", "")}.jpg`;
  const caminho = caminhoDe(produto.sku, "IMAGEM", arquivo);
  if (!caminho) return { ok: false, erro: "O código do produto não serve de pasta." };
  await mkdir(path.dirname(caminho), { recursive: true });
  await writeFile(caminho, padrao.bytes);
  try {
    const linha = await prisma.produtoArquivo.create({
      data: {
        produtoId,
        tipo: "IMAGEM",
        papel: "KIT",
        arquivo,
        nomeOriginal: nomeOriginal ? String(nomeOriginal).slice(0, 200) : null,
        mimeType: "image/jpeg",
        tamanhoBytes: padrao.bytes.length,
        finalizada: true,
      },
      select: { id: true },
    });
    return { ok: true, ampliada: padrao.ampliada, foto: { id: linha.id, arquivo, url: urlDe(produto.sku, "IMAGEM", arquivo) } };
  } catch (erro) {
    // O banco recusou: o arquivo nao fica orfao no disco.
    await unlink(caminho).catch(() => {});
    throw erro;
  }
}

/**
 * Exclui uma foto do kit (so papel KIT, so deste produto). Recusa se OUTRO anuncio do ML ainda a usa: o Publicar dele
 * falharia com "foto nao encontrada".
 */
export async function excluirFotoDoKit(produtoId, arquivoId, anuncioId = null) {
  const linha = await prisma.produtoArquivo.findFirst({
    where: { id: arquivoId, produtoId, tipo: "IMAGEM", papel: "KIT" },
    select: { id: true, arquivo: true, produto: { select: { sku: true } } },
  });
  if (!linha) return { ok: false, erro: "Foto do kit não encontrada." };

  const outros = await prisma.anuncio.findMany({
    where: { canal: "MERCADO_LIVRE", ...(anuncioId ? { id: { not: anuncioId } } : {}) },
    select: { id: true, dados: true, produto: { select: { sku: true } } },
  });
  const usando = outros.filter((anuncio) => Array.isArray(anuncio.dados?.imagens) && anuncio.dados.imagens.includes(arquivoId));
  if (usando.length > 0) {
    const codigos = [...new Set(usando.map((anuncio) => anuncio.dados?.composicao?.codigo || anuncio.produto?.sku).filter(Boolean))];
    return { ok: false, erro: `A foto está em outro anúncio de kit (${codigos.join(", ")}). Tire de lá antes de excluir.` };
  }

  await prisma.produtoArquivo.delete({ where: { id: linha.id } });
  const caminho = caminhoDe(linha.produto.sku, "IMAGEM", linha.arquivo);
  if (caminho) await unlink(caminho).catch(() => {});
  return { ok: true };
}
