-- Produto com composicao (kit), 07/10/2026. So adiciona: enum, coluna com padrao e tabela nova.
-- O `migrate diff` propos tambem DROP INDEX de "ProdutoColetado_buscaTexto_trgm" e
-- "ProdutoColetado_coletadoEm_idx", que so existem no SQL (ver CLAUDE.md): removidos a mao,
-- como em toda migration deste projeto.

-- CreateEnum
CREATE TYPE "TipoProduto" AS ENUM ('SIMPLES', 'COMPOSICAO');

-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "tipo" "TipoProduto" NOT NULL DEFAULT 'SIMPLES';

-- CreateTable
CREATE TABLE "ProdutoComponente" (
    "id" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "componenteId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProdutoComponente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProdutoComponente_componenteId_idx" ON "ProdutoComponente"("componenteId");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoComponente_kitId_componenteId_key" ON "ProdutoComponente"("kitId", "componenteId");

-- AddForeignKey
ALTER TABLE "ProdutoComponente" ADD CONSTRAINT "ProdutoComponente_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoComponente" ADD CONSTRAINT "ProdutoComponente_componenteId_fkey" FOREIGN KEY ("componenteId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
