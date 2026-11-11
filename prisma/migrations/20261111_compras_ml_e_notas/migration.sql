-- Compras do Mercado Livre no Compras e nota fiscal do pedido de compra (spec docs/superpowers/specs/
-- 2026-11-11-compras-do-mercado-livre-design.md, 11/11/2026). So aditiva. O indice unico PARCIAL
-- "Fornecedor_mercadoLivreCompras_unico" mora so aqui (o Prisma nao descreve indice parcial): o proximo `migrate diff`
-- vai propor apaga-lo; tirar essa linha.

-- AlterEnum
ALTER TYPE "OrigemDoPedidoDeCompra" ADD VALUE 'MERCADO_LIVRE';
-- AlterTable
ALTER TABLE "Fornecedor" ADD COLUMN     "mercadoLivreCompras" BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX "Fornecedor_mercadoLivreCompras_unico" ON "Fornecedor"("mercadoLivreCompras") WHERE "mercadoLivreCompras";
-- O "ML" que o dono cadastrou (11/11/2026), so se houver exatamente um com esse nome.
UPDATE "Fornecedor" SET "mercadoLivreCompras" = true
WHERE id = (SELECT id FROM "Fornecedor" WHERE lower(trim(nome)) = 'ml')
  AND (SELECT count(*) FROM "Fornecedor" WHERE lower(trim(nome)) = 'ml') = 1;
-- CreateTable
CREATE TABLE "NotaFiscalCompra" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "nomeOriginal" TEXT,
    "numero" TEXT,
    "serie" TEXT,
    "chave" TEXT,
    "emitidaEm" TIMESTAMP(3),
    "valorTotal" DECIMAL(12,2),
    "emitenteCnpj" TEXT,
    "emitenteNome" TEXT,
    "enviadoPor" TEXT,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotaFiscalCompra_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NotaFiscalCompra_pedidoId_idx" ON "NotaFiscalCompra"("pedidoId");
CREATE INDEX "NotaFiscalCompra_chave_idx" ON "NotaFiscalCompra"("chave");
ALTER TABLE "NotaFiscalCompra" ADD CONSTRAINT "NotaFiscalCompra_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoDeCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
