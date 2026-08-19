import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client.ts";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Produtos de exemplo so para a tela de Produtos ter conteudo real durante a
// verificacao. Usa upsert por SKU para poder rodar mais de uma vez.
const produtos = [
  {
    sku: "FONE-JBL-520BT",
    ean: "6925281993206",
    marca: "JBL",
    modelo: "Tune 520BT",
    tituloBase: "Fone de Ouvido Bluetooth JBL Tune 520BT",
    custo: "189.90",
    precoVenda: "299.90",
    estoque: 12,
    pesoKg: "0.180",
    garantiaMeses: 12,
    imagens: ["https://exemplo.local/jbl-520bt-1.jpg"],
  },
  {
    sku: "SSD-KING-NV2-1TB",
    ean: "740617329957",
    marca: "Kingston",
    modelo: "NV2 1TB",
    tituloBase: "SSD Kingston NV2 1TB NVMe PCIe 4.0 M.2",
    custo: "319.00",
    precoVenda: "479.00",
    estoque: 7,
    pesoKg: "0.010",
    garantiaMeses: 36,
    imagens: [
      "https://exemplo.local/kingston-nv2-1.jpg",
      "https://exemplo.local/kingston-nv2-2.jpg",
    ],
  },
  {
    sku: "MOUSE-LOGI-M170",
    ean: "097855102324",
    marca: "Logitech",
    modelo: "M170",
    tituloBase: "Mouse Sem Fio Logitech M170 1000 DPI",
    custo: "49.90",
    precoVenda: "89.90",
    estoque: 34,
    pesoKg: "0.075",
    garantiaMeses: 12,
    imagens: ["https://exemplo.local/logitech-m170-1.jpg"],
  },
  {
    sku: "CARR-ANKER-30W",
    marca: "Anker",
    modelo: "Nano 3 30W",
    tituloBase: "Carregador Anker Nano 3 30W USB-C GaN",
    custo: "94.50",
    precoVenda: "169.90",
    estoque: 0,
    pesoKg: "0.045",
    garantiaMeses: 18,
    ativo: false,
    imagens: [],
  },
];

async function main() {
  for (const { imagens, ...produto } of produtos) {
    const registro = await prisma.produto.upsert({
      where: { sku: produto.sku },
      update: produto,
      create: produto,
    });

    // Recria as imagens para o seed continuar idempotente.
    await prisma.produtoImagem.deleteMany({ where: { produtoId: registro.id } });
    if (imagens.length > 0) {
      await prisma.produtoImagem.createMany({
        data: imagens.map((url, ordem) => ({
          produtoId: registro.id,
          url,
          ordem,
        })),
      });
    }
  }

  const total = await prisma.produto.count();
  console.log(`Seed concluido. ${total} produto(s) no catalogo.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (erro) => {
    console.error(erro);
    await prisma.$disconnect();
    process.exit(1);
  });
