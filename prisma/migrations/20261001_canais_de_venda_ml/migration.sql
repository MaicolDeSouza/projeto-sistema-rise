-- Canais de Venda / Mercado Livre, fase 1 (01/10/2026): varios anuncios por produto,
-- dados do anuncio, configuracao do canal e versiculos.
-- Editada a mao em relacao ao `migrate diff`:
--  * Os dois DROP INDEX de ProdutoColetado (ProdutoColetado_buscaTexto_trgm e
--    ProdutoColetado_coletadoEm_idx) foram REMOVIDOS: os indices so existem no SQL.
--  * O indice unico parcial "Anuncio_um_por_produto" foi ACRESCENTADO no fim: o Prisma
--    nao descreve indice parcial.

-- DropIndex
DROP INDEX "Anuncio_produtoId_canal_key";

-- AlterTable
ALTER TABLE "Anuncio" ADD COLUMN     "dados" JSONB;

-- CreateTable
CREATE TABLE "ConfigCanal" (
    "canal" "Canal" NOT NULL,
    "frasesFixas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "versiculosUsados" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigCanal_pkey" PRIMARY KEY ("canal")
);

-- CreateTable
CREATE TABLE "Versiculo" (
    "id" TEXT NOT NULL,
    "livro" TEXT NOT NULL,
    "capitulo" INTEGER NOT NULL,
    "inicio" INTEGER NOT NULL,
    "fim" INTEGER NOT NULL,
    "texto" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Versiculo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Versiculo_livro_capitulo_inicio_key" ON "Versiculo"("livro", "capitulo", "inicio");

-- CreateIndex
CREATE INDEX "Anuncio_produtoId_canal_idx" ON "Anuncio"("produtoId", "canal");

-- Um anuncio por produto continua valendo no Bling e na Loja Integrada (o ML e a
-- Shopee aceitam varios: Classico e Premium). O Prisma nao descreve indice parcial.
CREATE UNIQUE INDEX "Anuncio_um_por_produto" ON "Anuncio" ("produtoId", "canal")
  WHERE "canal" IN ('BLING', 'LOJA_INTEGRADA');
