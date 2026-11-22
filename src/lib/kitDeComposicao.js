import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";
import { caminhoDe, MAXIMO_IMAGENS } from "@/lib/arquivos";
import { categoriasDoKit, ncmDoKit, pesoEMedidasDoKit, totaisDoKit } from "@/lib/composicao";
import { gravarComposicaoDoCadastro, localizacaoDoKitNoSalvar, prepararComposicaoDoCadastro } from "@/lib/composicaoBanco";
import { proximoCodigoLivre } from "@/lib/proposta/codigo";
import { normalizarDescricao } from "@/lib/ia/revisaoDescricao";

/**
 * Cria um produto "Com composicao" (kit) a partir das pecas (pedido do dono em 22/11/2026: "tem como criar mcp para criar produto
 * com kit de composicao tambem?", com as fotos das pecas marcadas, a categoria sugerida e o SEO preenchido). O mesmo que o Salvar
 * do cadastro faria num kit novo: as pecas passam pela mesma conferencia (`prepararComposicaoDoCadastro`: simples, Conferidas e
 * ligadas ao Bling), o estoque e o retrato saem de `gravarComposicaoDoCadastro` e a localizacao de `localizacaoDoKitNoSalvar`.
 *
 * Do kit: codigo livre da faixa 25xxxx, preco = soma da venda das pecas, NCM e categorias da peca de maior quantidade, peso
 * somado e medidas (maior comprimento, maior largura, alturas somadas), a descricao recebida com "Itens inclusos" e "Garantia"
 * no fim, o SEO recebido e as fotos de todas as pecas copiadas e marcadas. Nasce NAO Conferido e sem Bling: o dono revisa.
 *
 * @param {{ nome: string, pecas: {sku: string, quantidade: number}[], descricao?: string, seoTitulo?: string, seoDescricao?: string,
 *   marca?: string, modelo?: string }} entrada
 * @returns {Promise<{ok: true, sku: string, id: string, fotos: number, avisos: string[]} | {ok: false, erro: string}>}
 */
export async function criarKitDeComposicao({ nome, pecas, descricao = "", seoTitulo = "", seoDescricao = "", marca = null, modelo = null }) {
  const pedidas = Array.isArray(pecas) ? pecas : [];
  const skus = pedidas.map((peca) => String(peca?.sku ?? "").trim());
  const achadas = await prisma.produto.findMany({
    where: { OR: skus.map((sku) => ({ sku: { equals: sku, mode: "insensitive" } })) },
    select: {
      id: true, sku: true, tituloBase: true, marca: true, precoVenda: true, custo: true, pesoKg: true, alturaCm: true, larguraCm: true,
      comprimentoCm: true, ncm: true, cest: true, origem: true, tipoProducao: true, spedTipoItem: true, garantiaMeses: true,
      categoriasLI: true, familiaEstoque: true,
    },
  });
  const porSku = new Map(achadas.map((produto) => [produto.sku.toLowerCase(), produto]));
  const faltam = skus.filter((sku) => !porSku.has(sku.toLowerCase()));
  if (faltam.length > 0) return { ok: false, erro: `Não achei no Rise: ${faltam.join(", ")}.` };

  const itens = pedidas.map((peca) => ({ componenteId: porSku.get(String(peca.sku).trim().toLowerCase()).id, quantidade: Number(peca.quantidade) }));
  const preparo = await prepararComposicaoDoCadastro({ produtoId: null, tipo: "COMPOSICAO", campo: JSON.stringify(itens) });
  if (!preparo.ok) return { ok: false, erro: preparo.erro };

  // As pecas na ordem pedida, no formato das regras puras (as mesmas do cadastro).
  const daRegra = pedidas.map((peca) => {
    const produto = porSku.get(String(peca.sku).trim().toLowerCase());
    const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));
    return {
      produto,
      sku: produto.sku,
      quantidade: Number(peca.quantidade),
      precoVenda: numero(produto.precoVenda),
      custo: numero(produto.custo),
      pesoKg: numero(produto.pesoKg),
      alturaCm: numero(produto.alturaCm),
      larguraCm: numero(produto.larguraCm),
      comprimentoCm: numero(produto.comprimentoCm),
      ncm: produto.ncm,
      categoriasLI: produto.categoriasLI,
    };
  });
  const principal = daRegra.reduce((maior, peca) => (peca.quantidade > maior.quantidade ? peca : maior), daRegra[0]).produto;
  const medidas = pesoEMedidasDoKit(daRegra);
  const venda = totaisDoKit(daRegra).venda;
  const categorias = categoriasDoKit(daRegra);

  const sku = await proximoCodigoLivre();
  if (!sku) return { ok: false, erro: "A faixa automática 25xxxx acabou." };
  const localizacao = await localizacaoDoKitNoSalvar(null, preparo);

  // A descricao que o Claude escreveu (titulo, paragrafos e especificacoes) com os itens inclusos e a garantia de todo produto.
  const corpo = String(descricao ?? "").trim();
  const inclusos = [`Itens inclusos: (Cod:${sku})`, ...daRegra.map((peca) => `- ${String(peca.quantidade).padStart(2, "0")} ${peca.produto.tituloBase};`)];
  const texto = corpo
    ? normalizarDescricao([corpo, "", ...inclusos, "", "Garantia:", "- Garantia Legal de 90 dias (contra defeitos de fabricação);"].join("\n"))
    : null;

  const criado = await prisma.$transaction(async (tx) => {
    const produto = await tx.produto.create({
      data: {
        sku,
        tituloBase: String(nome).trim(),
        descricaoBase: texto,
        tipo: "COMPOSICAO",
        unidade: "KIT",
        marca: marca ? marca.toLocaleUpperCase("pt-BR") : principal.marca,
        modelo: modelo ? modelo.toLocaleUpperCase("pt-BR") : null,
        precoVenda: venda,
        pesoKg: medidas.pesoKg,
        alturaCm: medidas.alturaCm,
        larguraCm: medidas.larguraCm,
        comprimentoCm: medidas.comprimentoCm,
        ncm: ncmDoKit(daRegra),
        cest: principal.cest,
        origem: principal.origem,
        tipoProducao: principal.tipoProducao,
        spedTipoItem: principal.spedTipoItem,
        garantiaMeses: principal.garantiaMeses,
        categoriasLI: categorias?.ids ?? [],
        familiaEstoque: principal.familiaEstoque,
        seoTituloLI: String(seoTitulo ?? "").trim() || null,
        seoDescricaoLI: String(seoDescricao ?? "").trim() || null,
        localizacao,
        conferido: false,
      },
    });
    await gravarComposicaoDoCadastro(produto.id, preparo, tx);
    return produto;
  });

  const { fotos, avisos } = await copiarFotosDasPecas(criado, daRegra.map((peca) => peca.produto));
  return { ok: true, sku: criado.sku, id: criado.id, fotos, avisos };
}

/**
 * Copia as fotos de cada peca (na ordem das pecas e das fotos) para a pasta do kit, marcadas (`finalizada`), a primeira como
 * principal. Foto que sumiu do disco nao entra e vira aviso: o kit ja existe, e o dono completa pela tela.
 */
async function copiarFotosDasPecas(kit, pecas) {
  const avisos = [];
  let ordem = 0;
  for (const peca of pecas) {
    const fotos = await prisma.produtoArquivo.findMany({
      where: { produtoId: peca.id, tipo: "IMAGEM", papel: "FOTO" },
      orderBy: [{ principal: "desc" }, { ordem: "asc" }],
      select: { arquivo: true, nomeOriginal: true, mimeType: true, tamanhoBytes: true },
    });
    for (const foto of fotos) {
      // O teto de fotos de todo produto: o resto fica de fora, com aviso.
      if (ordem >= MAXIMO_IMAGENS) {
        avisos.push(`O produto guarda até ${MAXIMO_IMAGENS} fotos: as demais das peças ficaram de fora.`);
        return { fotos: ordem, avisos };
      }
      const origem = caminhoDe(peca.sku, "IMAGEM", foto.arquivo);
      const novo = `${randomUUID().replaceAll("-", "")}${path.extname(foto.arquivo)}`;
      const destino = caminhoDe(kit.sku, "IMAGEM", novo);
      if (!origem || !destino) continue;
      try {
        await mkdir(path.dirname(destino), { recursive: true });
        await copyFile(origem, destino);
      } catch (erro) {
        if (erro.code !== "ENOENT") throw erro;
        avisos.push(`A foto ${foto.arquivo} da peça ${peca.sku} não está no disco.`);
        continue;
      }
      await prisma.produtoArquivo.create({
        data: {
          produtoId: kit.id,
          tipo: "IMAGEM",
          papel: "FOTO",
          arquivo: novo,
          nomeOriginal: foto.nomeOriginal,
          mimeType: foto.mimeType,
          tamanhoBytes: foto.tamanhoBytes,
          principal: ordem === 0,
          finalizada: true,
          ordem,
        },
      });
      ordem += 1;
    }
  }
  return { fotos: ordem, avisos };
}
