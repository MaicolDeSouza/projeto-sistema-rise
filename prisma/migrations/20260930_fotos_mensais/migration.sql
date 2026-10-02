-- Fotos mensais de preco e estoque (30/09/2026). Tabelas novas, sem tocar nas existentes.
-- Os dois DROP INDEX que o `migrate diff` propoe (ProdutoColetado_buscaTexto_trgm e
-- ProdutoColetado_coletadoEm_idx) foram REMOVIDOS: os indices so existem no SQL, e
-- derruba-los levaria a busca de Mercados de 15 ms para 600 ms.

-- CreateEnum
CREATE TYPE "TipoPrecoFoto" AS ENUM ('NORMAL', 'COM_IMPOSTOS', 'PROMOCIONAL');

-- CreateTable
CREATE TABLE "FotoMensalColeta" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "mes" DATE NOT NULL,
    "fonteId" TEXT NOT NULL,
    "fonteNome" TEXT NOT NULL,
    "tipoFonte" "TipoFonte" NOT NULL,
    "codigo" TEXT,
    "nome" TEXT,
    "preco" DECIMAL(12,2),
    "tipoPreco" "TipoPrecoFoto",
    "quantidade" INTEGER,
    "aChegar" INTEGER,
    "estoqueStatus" TEXT,
    "ausente" BOOLEAN NOT NULL DEFAULT false,
    "lidoEm" TIMESTAMP(3),
    "tiradaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FotoMensalColeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FotoMensalProduto" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "mes" DATE NOT NULL,
    "sku" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL,
    "precoVenda" DECIMAL(12,2),
    "custo" DECIMAL(12,2),
    "custoOrigem" TEXT,
    "estoque" INTEGER NOT NULL,
    "canais" JSONB NOT NULL,
    "produtoAtualizadoEm" TIMESTAMP(3) NOT NULL,
    "tiradaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FotoMensalProduto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FotoMensalColeta_mes_fonteId_idx" ON "FotoMensalColeta"("mes", "fonteId");

-- CreateIndex
CREATE UNIQUE INDEX "FotoMensalColeta_produtoId_mes_key" ON "FotoMensalColeta"("produtoId", "mes");

-- CreateIndex
CREATE INDEX "FotoMensalProduto_mes_idx" ON "FotoMensalProduto"("mes");

-- CreateIndex
CREATE UNIQUE INDEX "FotoMensalProduto_produtoId_mes_key" ON "FotoMensalProduto"("produtoId", "mes");
