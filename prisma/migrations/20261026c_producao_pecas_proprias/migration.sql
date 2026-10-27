-- CreateEnum
CREATE TYPE "SituacaoDaOrdemDeProducao" AS ENUM ('ABERTA', 'EM_PRODUCAO', 'CONCLUIDA', 'CANCELADA');

-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "pecasProprias" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PecaPropriaDoProduto" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "componenteId" TEXT,
    "descricao" TEXT,
    "custoManual" DECIMAL(12,2),
    "quantidade" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "PecaPropriaDoProduto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrdemDeProducao" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "produtoId" TEXT NOT NULL,
    "situacao" "SituacaoDaOrdemDeProducao" NOT NULL DEFAULT 'ABERTA',
    "quantidadePlanejada" INTEGER NOT NULL,
    "quantidadeProduzida" INTEGER,
    "observacao" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "baixaEm" TIMESTAMP(3),
    "concluidaEm" TIMESTAMP(3),
    "canceladaEm" TIMESTAMP(3),
    "entradaMovimentoId" TEXT,

    CONSTRAINT "OrdemDeProducao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDaOrdemDeProducao" (
    "id" TEXT NOT NULL,
    "ordemId" TEXT NOT NULL,
    "componenteId" TEXT,
    "sku" TEXT,
    "descricao" TEXT NOT NULL,
    "custoUnitario" DECIMAL(12,2),
    "quantidadePorUnidade" DECIMAL(12,3) NOT NULL,
    "quantidadeTotal" INTEGER NOT NULL,
    "saidaMovimentoId" TEXT,
    "devolucaoMovimentoId" TEXT,

    CONSTRAINT "ItemDaOrdemDeProducao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PecaPropriaDoProduto_produtoId_idx" ON "PecaPropriaDoProduto"("produtoId");

-- CreateIndex
CREATE INDEX "PecaPropriaDoProduto_componenteId_idx" ON "PecaPropriaDoProduto"("componenteId");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemDeProducao_numero_key" ON "OrdemDeProducao"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "OrdemDeProducao_entradaMovimentoId_key" ON "OrdemDeProducao"("entradaMovimentoId");

-- CreateIndex
CREATE INDEX "OrdemDeProducao_situacao_idx" ON "OrdemDeProducao"("situacao");

-- CreateIndex
CREATE INDEX "OrdemDeProducao_produtoId_idx" ON "OrdemDeProducao"("produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDaOrdemDeProducao_saidaMovimentoId_key" ON "ItemDaOrdemDeProducao"("saidaMovimentoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDaOrdemDeProducao_devolucaoMovimentoId_key" ON "ItemDaOrdemDeProducao"("devolucaoMovimentoId");

-- CreateIndex
CREATE INDEX "ItemDaOrdemDeProducao_ordemId_idx" ON "ItemDaOrdemDeProducao"("ordemId");

-- AddForeignKey
ALTER TABLE "PecaPropriaDoProduto" ADD CONSTRAINT "PecaPropriaDoProduto_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PecaPropriaDoProduto" ADD CONSTRAINT "PecaPropriaDoProduto_componenteId_fkey" FOREIGN KEY ("componenteId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrdemDeProducao" ADD CONSTRAINT "OrdemDeProducao_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaOrdemDeProducao" ADD CONSTRAINT "ItemDaOrdemDeProducao_ordemId_fkey" FOREIGN KEY ("ordemId") REFERENCES "OrdemDeProducao"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaOrdemDeProducao" ADD CONSTRAINT "ItemDaOrdemDeProducao_componenteId_fkey" FOREIGN KEY ("componenteId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

