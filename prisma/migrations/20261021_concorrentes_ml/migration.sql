-- Concorrentes do ML pelo catalogo (spec 2026-10-21). Aditiva. Editada a mao: o diff propunha DROP INDEX de
-- ProdutoColetado_buscaTexto_trgm e ProdutoColetado_coletadoEm_idx, que so existem no SQL.

-- AlterTable
ALTER TABLE "ConfigCanal" ADD COLUMN     "mlConcorrentesRelidosEm" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "mlCatalogoId" TEXT,
ADD COLUMN     "mlCatalogoNome" TEXT,
ADD COLUMN     "mlConcorrentesVistoEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ConcorrenteML" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "catalogoId" TEXT NOT NULL,
    "vendedorId" TEXT NOT NULL,
    "vendedorApelido" TEXT,
    "vendedorReputacao" TEXT,
    "vendedorVendas" INTEGER,
    "vendedorCidade" TEXT,
    "tipoAnuncio" TEXT,
    "freteGratis" BOOLEAN NOT NULL DEFAULT false,
    "logistica" TEXT,
    "preco" DECIMAL(12,2),
    "precoCheio" DECIMAL(12,2),
    "posicao" INTEGER NOT NULL,
    "totalNoCatalogo" INTEGER NOT NULL,
    "lidoEm" TIMESTAMP(3) NOT NULL,
    "ausenteDesde" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConcorrenteML_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConcorrenteMLHistorico" (
    "id" TEXT NOT NULL,
    "concorrenteId" TEXT NOT NULL,
    "preco" DECIMAL(12,2),
    "precoCheio" DECIMAL(12,2),
    "posicao" INTEGER NOT NULL,
    "lidoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConcorrenteMLHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosicaoML" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "catalogoId" TEXT NOT NULL,
    "itemId" TEXT,
    "posicao" INTEGER,
    "total" INTEGER NOT NULL,
    "menorPreco" DECIMAL(12,2),
    "lidoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosicaoML_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConcorrenteML_produtoId_idx" ON "ConcorrenteML"("produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "ConcorrenteML_produtoId_itemId_key" ON "ConcorrenteML"("produtoId", "itemId");

-- CreateIndex
CREATE INDEX "ConcorrenteMLHistorico_concorrenteId_lidoEm_idx" ON "ConcorrenteMLHistorico"("concorrenteId", "lidoEm");

-- CreateIndex
CREATE INDEX "PosicaoML_produtoId_lidoEm_idx" ON "PosicaoML"("produtoId", "lidoEm");

-- AddForeignKey
ALTER TABLE "ConcorrenteML" ADD CONSTRAINT "ConcorrenteML_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConcorrenteMLHistorico" ADD CONSTRAINT "ConcorrenteMLHistorico_concorrenteId_fkey" FOREIGN KEY ("concorrenteId") REFERENCES "ConcorrenteML"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosicaoML" ADD CONSTRAINT "PosicaoML_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

