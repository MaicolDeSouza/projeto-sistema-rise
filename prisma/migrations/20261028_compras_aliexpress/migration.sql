-- AliExpress no modulo Compras (spec docs/superpowers/specs/2026-10-28-aliexpress-em-compras-design.md, 28/10/2026).
-- So aditiva. O indice unico PARCIAL "Fornecedor_aliexpress_unico" mora so aqui (o Prisma nao descreve indice parcial,
-- como o "Job_fonte_aberta"): o proximo `migrate diff` vai propor apaga-lo; tirar essa linha.

-- CreateEnum
CREATE TYPE "OrigemDoPedidoDeCompra" AS ENUM ('RISE', 'ALIEXPRESS');
-- AlterEnum
ALTER TYPE "Servico" ADD VALUE 'ALIEXPRESS';
-- AlterTable
ALTER TABLE "Fornecedor" ADD COLUMN     "aliexpress" BOOLEAN NOT NULL DEFAULT false;
-- AlterTable
ALTER TABLE "ProdutoFornecedor" ADD COLUMN     "fator" INTEGER NOT NULL DEFAULT 1;
-- AlterTable
ALTER TABLE "PedidoDeCompra" ADD COLUMN     "imposto" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "origem" "OrigemDoPedidoDeCompra" NOT NULL DEFAULT 'RISE';
-- CreateTable
CREATE TABLE "PedidoAliExpress" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "externoId" TEXT NOT NULL,
    "loja" TEXT,
    "lojaId" TEXT,
    "statusTexto" TEXT NOT NULL,
    "statusCodigo" INTEGER,
    "dataDoPedido" TIMESTAMP(3) NOT NULL,
    "totalInformado" DECIMAL(12,2) NOT NULL,
    "moeda" TEXT NOT NULL,
    "entregueEm" TIMESTAMP(3),
    "canceladoNoAliExpressEm" TIMESTAMP(3),
    "detalheLidoEm" TIMESTAMP(3),
    "rastreioLidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PedidoAliExpress_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "LinhaAliExpress" (
    "id" TEXT NOT NULL,
    "pedidoAliExpressId" TEXT NOT NULL,
    "externoLinhaId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "skuId" TEXT,
    "opcao" TEXT,
    "titulo" TEXT NOT NULL,
    "urlDoItem" TEXT,
    "urlDaFoto" TEXT,
    "quantidadeComprada" INTEGER NOT NULL,
    "precoComprado" DECIMAL(12,4) NOT NULL,
    "fator" INTEGER NOT NULL DEFAULT 1,
    "itemId" TEXT,
    "pacoteId" TEXT,
    "virtualQuantidade" INTEGER NOT NULL DEFAULT 0,
    "virtualLancadoEm" TIMESTAMP(3),
    "virtualErro" TEXT,
    CONSTRAINT "LinhaAliExpress_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "PacoteAliExpress" (
    "id" TEXT NOT NULL,
    "pedidoAliExpressId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "codigoOrigem" TEXT,
    "transportadora" TEXT,
    "previsaoTexto" TEXT,
    "previsaoInicio" TIMESTAMP(3),
    "previsaoFim" TIMESTAMP(3),
    "ultimoEvento" TEXT,
    "ultimoEventoEm" TIMESTAMP(3),
    "ultimoCodigo" TEXT,
    "eventos" JSONB,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PacoteAliExpress_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "PedidoAliExpress_pedidoId_key" ON "PedidoAliExpress"("pedidoId");
-- CreateIndex
CREATE UNIQUE INDEX "PedidoAliExpress_externoId_key" ON "PedidoAliExpress"("externoId");
-- CreateIndex
CREATE UNIQUE INDEX "LinhaAliExpress_externoLinhaId_key" ON "LinhaAliExpress"("externoLinhaId");
-- CreateIndex
CREATE INDEX "LinhaAliExpress_pedidoAliExpressId_idx" ON "LinhaAliExpress"("pedidoAliExpressId");
-- CreateIndex
CREATE INDEX "LinhaAliExpress_itemId_idx" ON "LinhaAliExpress"("itemId");
-- CreateIndex
CREATE INDEX "LinhaAliExpress_productId_skuId_idx" ON "LinhaAliExpress"("productId", "skuId");
-- CreateIndex
CREATE UNIQUE INDEX "PacoteAliExpress_pedidoAliExpressId_codigo_key" ON "PacoteAliExpress"("pedidoAliExpressId", "codigo");
-- AddForeignKey
ALTER TABLE "PedidoAliExpress" ADD CONSTRAINT "PedidoAliExpress_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoDeCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LinhaAliExpress" ADD CONSTRAINT "LinhaAliExpress_pedidoAliExpressId_fkey" FOREIGN KEY ("pedidoAliExpressId") REFERENCES "PedidoAliExpress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LinhaAliExpress" ADD CONSTRAINT "LinhaAliExpress_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemDoPedidoDeCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "LinhaAliExpress" ADD CONSTRAINT "LinhaAliExpress_pacoteId_fkey" FOREIGN KEY ("pacoteId") REFERENCES "PacoteAliExpress"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "PacoteAliExpress" ADD CONSTRAINT "PacoteAliExpress_pedidoAliExpressId_fkey" FOREIGN KEY ("pedidoAliExpressId") REFERENCES "PedidoAliExpress"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- So um fornecedor pode ser o do AliExpress.
CREATE UNIQUE INDEX "Fornecedor_aliexpress_unico" ON "Fornecedor"("aliexpress") WHERE "aliexpress" = true;

-- O fornecedor das compras do AliExpress ja existe no Rise e se chama "Ali" (dono, 28/10/2026): marca o primeiro com
-- esse nome (sem caixa). Sem nenhum, cria "Ali" estrangeiro (sem CNPJ) ja marcado.
UPDATE "Fornecedor" SET "aliexpress" = true
WHERE "id" = (SELECT "id" FROM "Fornecedor" WHERE lower(trim("nome")) = 'ali' ORDER BY "criadoEm" LIMIT 1);

INSERT INTO "Fornecedor" ("id", "nome", "estrangeiro", "site", "aliexpress", "ativo", "criadoEm", "atualizadoEm")
SELECT 'fornecedor-ali', 'Ali', true, 'https://www.aliexpress.com', true, true, NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'
WHERE NOT EXISTS (SELECT 1 FROM "Fornecedor" WHERE "aliexpress" = true)
  AND NOT EXISTS (SELECT 1 FROM "Fornecedor" WHERE "nome" = 'Ali');
