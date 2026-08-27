import "dotenv/config";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.ts";
import { pngSolido } from "./imagemExemplo.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * Dados de exemplo desenhados para exercitar CADA estado visual das telas de
 * anuncios. Uma demonstracao so do caminho feliz esconde justamente onde o
 * desenho costuma falhar: erro, divergencia e campo travado.
 *
 * Idempotente: upsert por SKU, recriando imagens e anuncios.
 */

const agora = Date.now();
const diasAtras = (n) => new Date(agora - n * 86400000);

const RAIZ_ARQUIVOS = path.join(process.cwd(), "dados", "produtos");

/**
 * Grava um PNG de exemplo em dados/produtos/<SKU>/imagens/.
 *
 * Arquivo de verdade em vez de URL falsa para a miniatura aparecer na lista e
 * para exercitar a rota que serve os arquivos. O endereco NAO e gravado: ele e
 * calculado na leitura a partir do SKU atual.
 */
async function imagemDeExemplo(sku, cor) {
  const nome = `${randomUUID().replaceAll("-", "")}.png`;
  const destino = path.join(RAIZ_ARQUIVOS, sku, "imagens");
  await mkdir(destino, { recursive: true });
  await writeFile(path.join(destino, nome), pngSolido(600, cor));
  return {
    arquivo: nome,
    tipo: "IMAGEM",
    nomeOriginal: `exemplo-${sku.toLowerCase()}.png`,
    mimeType: "image/png",
  };
}

function hashDe(produto, anuncio) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        titulo: anuncio.titulo ?? produto.tituloBase ?? "",
        descricao: anuncio.descricao ?? produto.descricaoBase ?? "",
        preco: String(produto.precoVenda ?? ""),
        estoque: String(produto.estoque ?? ""),
        categoria: anuncio.categoriaExternaId ?? "",
        atributos: anuncio.atributos ?? {},
        imagens: (produto.imagens ?? []).map((i) => i.arquivo),
      }),
    )
    .digest("hex")
    .slice(0, 32);
}

const produtos = [
  {
    sku: "FONE-JBL-520BT",
    ean: "6925281993206",
    marca: "JBL",
    modelo: "Tune 520BT",
    tituloBase: "Fone de Ouvido Bluetooth JBL Tune 520BT Preto",
    descricaoBase:
      "Fone supra-auricular com Bluetooth 5.3, ate 57 horas de bateria e carregamento rapido.",
    custo: "189.90",
    precoVenda: "299.90",
    estoque: 12,
    pesoKg: "0.180",
    garantiaMeses: 12,
    localizacao: "R14",
    unidade: "UN",
    imagens: [[28, 32, 38]],
    anuncios: [
      // Publicado e em dia nos tres canais
      {
        canal: "BLING",
        status: "PUBLICADO",
        situacaoCanal: "ATIVA",
        idExterno: "16689832743",
        publicadoEm: diasAtras(20),
        sincronizadoEm: diasAtras(1),
        emDia: true,
      },
      {
        canal: "MERCADO_LIVRE",
        status: "PUBLICADO",
        situacaoCanal: "ATIVA",
        titulo: "Fone de Ouvido Bluetooth JBL Tune 520BT Preto",
        descricao: "Fone supra-auricular com Bluetooth 5.3 e 57h de bateria.",
        categoriaExternaId: "MLB438086",
        atributos: {
          BRAND: "JBL",
          MODEL: "Tune 520BT",
          family_name: "JBL Tune 520BT",
        },
        idExterno: "MLB3921847562",
        urlExterna: "https://produto.mercadolivre.com.br/MLB-3921847562",
        publicadoEm: diasAtras(20),
        sincronizadoEm: diasAtras(1),
        // Com vendas: trava o titulo. Serve para ver o campo desabilitado.
        temVendas: true,
        emDia: true,
      },
      {
        canal: "LOJA_INTEGRADA",
        status: "PUBLICADO",
        situacaoCanal: "ATIVA",
        idExterno: "LI-884213",
        publicadoEm: diasAtras(20),
        sincronizadoEm: diasAtras(1),
        emDia: true,
      },
    ],
  },
  {
    sku: "SSD-KING-NV2-1TB",
    ean: "740617329957",
    marca: "Kingston",
    modelo: "NV2 1TB",
    tituloBase:
      "SSD Kingston NV2 1TB NVMe PCIe 4.0 M.2 2280 Leitura 3500MB/s",
    descricaoBase: "SSD NVMe Gen 4x2 com ate 3.500 MB/s de leitura.",
    custo: "319.00",
    precoVenda: "479.00",
    estoque: 7,
    pesoKg: "0.010",
    garantiaMeses: 36,
    localizacao: "A03",
    unidade: "UN",
    imagens: [
      [214, 32, 46],
      [40, 44, 52],
    ],
    anuncios: [
      {
        canal: "BLING",
        status: "PUBLICADO",
        situacaoCanal: "ATIVA",
        idExterno: "16689840012",
        publicadoEm: diasAtras(9),
        sincronizadoEm: diasAtras(2),
        emDia: true,
      },
      // Publicado, mas o produto mudou depois: alteracoes nao publicadas
      {
        canal: "MERCADO_LIVRE",
        status: "PUBLICADO",
        situacaoCanal: "ATIVA",
        titulo: "SSD Kingston NV2 1TB NVMe PCIe 4.0",
        descricao: "SSD NVMe Gen 4x2.",
        categoriaExternaId: "MLB1704",
        atributos: { BRAND: "Kingston", family_name: "Kingston NV2" },
        idExterno: "MLB3855120394",
        urlExterna: "https://produto.mercadolivre.com.br/MLB-3855120394",
        publicadoEm: diasAtras(9),
        sincronizadoEm: diasAtras(2),
        emDia: false,
      },
    ],
  },
  {
    sku: "MOUSE-LOGI-M170",
    ean: "097855102324",
    marca: "Logitech",
    modelo: "M170",
    tituloBase:
      "Mouse Sem Fio Logitech M170 1000 DPI Receptor USB Nano 2.4GHz Cinza",
    descricaoBase: "Mouse sem fio com receptor nano e ate 12 meses de bateria.",
    custo: "49.90",
    precoVenda: "89.90",
    estoque: 34,
    pesoKg: "0.075",
    garantiaMeses: 12,
    localizacao: "B07",
    unidade: "KIT",
    imagens: [[120, 128, 136]],
    anuncios: [
      {
        canal: "BLING",
        status: "PUBLICADO",
        situacaoCanal: "ATIVA",
        idExterno: "16689851177",
        publicadoEm: diasAtras(4),
        sincronizadoEm: diasAtras(1),
        emDia: true,
      },
      // Pausado no canal: estado reversivel
      {
        canal: "MERCADO_LIVRE",
        status: "PUBLICADO",
        situacaoCanal: "PAUSADA",
        titulo: "Mouse Sem Fio Logitech M170 1000 DPI Cinza",
        categoriaExternaId: "MLB1700",
        atributos: { BRAND: "Logitech", family_name: "Logitech M170" },
        idExterno: "MLB3790554128",
        urlExterna: "https://produto.mercadolivre.com.br/MLB-3790554128",
        publicadoEm: diasAtras(4),
        sincronizadoEm: new Date(agora - 3600000),
        emDia: true,
      },
      // Validado: sem nenhum problema, pronto para publicar
      {
        canal: "LOJA_INTEGRADA",
        status: "VALIDADO",
        situacaoCanal: "DESCONHECIDA",
      },
    ],
  },
  {
    sku: "CARR-ANKER-30W",
    marca: "Anker",
    modelo: "Nano 3 30W",
    tituloBase:
      "Carregador Anker Nano 3 30W USB-C GaN Turbo Compacto para iPhone Samsung Xiaomi Notebook",
    descricaoBase: "Carregador GaN de 30W, compacto.",
    custo: "94.50",
    precoVenda: "169.90",
    estoque: 0,
    pesoKg: "0.045",
    garantiaMeses: 18,
    ativo: false,
    // Sem imagem, sem EAN e sem localizacao de proposito: exercita o espaco
    // reservado da miniatura, o traco na coluna e os problemas de validacao.
    imagens: [],
    anuncios: [
      { canal: "BLING", status: "RASCUNHO", situacaoCanal: "DESCONHECIDA" },
      {
        canal: "MERCADO_LIVRE",
        status: "RASCUNHO",
        situacaoCanal: "DESCONHECIDA",
      },
    ],
  },
  {
    sku: "TECL-REDR-K552",
    ean: "6950376705525",
    marca: "Redragon",
    modelo: "K552 Kumara",
    tituloBase:
      "Teclado Mecanico Gamer Redragon Kumara K552 RGB Switch Outemu Red",
    descricaoBase: "Teclado mecanico TKL com iluminacao RGB.",
    custo: "159.00",
    precoVenda: "249.90",
    estoque: 5,
    pesoKg: "0.980",
    garantiaMeses: 12,
    localizacao: "R14",
    unidade: "UN",
    imagens: [[186, 32, 40]],
    anuncios: [
      {
        canal: "BLING",
        status: "PUBLICADO",
        situacaoCanal: "ATIVA",
        idExterno: "16689863401",
        publicadoEm: diasAtras(30),
        sincronizadoEm: diasAtras(3),
        emDia: true,
      },
      // Erro na publicacao, com a mensagem no formato que o ML devolve
      {
        canal: "MERCADO_LIVRE",
        status: "ERRO",
        situacaoCanal: "DESCONHECIDA",
        titulo: "Teclado Mecanico Gamer Redragon Kumara K552 RGB",
        categoriaExternaId: "MLB1652",
        atributos: { BRAND: "Redragon", family_name: "Redragon K552" },
        erro:
          "body.attributes: o atributo KEYBOARD_LAYOUT e obrigatorio nesta categoria e nao foi informado.",
      },
      // Encerrado: estado terminal, sem acoes possiveis
      {
        canal: "LOJA_INTEGRADA",
        status: "PUBLICADO",
        situacaoCanal: "ENCERRADA",
        idExterno: "LI-771904",
        publicadoEm: diasAtras(120),
        sincronizadoEm: diasAtras(15),
        emDia: true,
      },
    ],
  },
];

async function main() {
  for (const { imagens, anuncios, ...produto } of produtos) {
    const registro = await prisma.produto.upsert({
      where: { sku: produto.sku },
      update: produto,
      create: produto,
    });

    await prisma.produtoArquivo.deleteMany({ where: { produtoId: registro.id } });

    const gravadas = [];
    for (const [ordem, cor] of imagens.entries()) {
      const imagem = await imagemDeExemplo(produto.sku, cor);
      gravadas.push(imagem);
      await prisma.produtoArquivo.create({
        data: { produtoId: registro.id, ...imagem, ordem },
      });
    }

    await prisma.anuncio.deleteMany({ where: { produtoId: registro.id } });

    const comImagens = { ...registro, imagens: gravadas };

    for (const { emDia, ...anuncio } of anuncios ?? []) {
      const hashConteudo =
        anuncio.status === "PUBLICADO"
          ? emDia
            ? hashDe(comImagens, anuncio)
            : "desatualizado0000000000000000000"
          : null;

      await prisma.anuncio.create({
        data: { ...anuncio, produtoId: registro.id, hashConteudo },
      });
    }
  }

  const [totalProdutos, totalAnuncios] = await Promise.all([
    prisma.produto.count(),
    prisma.anuncio.count(),
  ]);

  console.log(
    `Seed concluido. ${totalProdutos} produto(s) e ${totalAnuncios} anuncio(s).`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (erro) => {
    console.error(erro);
    await prisma.$disconnect();
    process.exit(1);
  });
