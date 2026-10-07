-- Loja Integrada (plano de 06/10/2026): o tipo de producao do produto, que a NF-e nativa
-- da LI usa (production_type, muda o CFOP), e a copia do produto do canal antes de cada
-- sobrescrita (o PUT da LI exige o produto inteiro).
--
-- Editada a mao: o `migrate diff` propos DROP INDEX de "ProdutoColetado_buscaTexto_trgm"
-- (trigramas da busca de Mercados) e "ProdutoColetado_coletadoEm_idx", que existem so no
-- SQL. As duas linhas foram tiradas; so acrescimos aqui.

-- CreateEnum
CREATE TYPE "TipoProducao" AS ENUM ('REVENDA', 'FABRICACAO_PROPRIA');

-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "tipoProducao" "TipoProducao" NOT NULL DEFAULT 'REVENDA';

-- CreateTable
CREATE TABLE "CopiaProdutoCanal" (
    "id" TEXT NOT NULL,
    "canal" "Canal" NOT NULL,
    "produtoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conteudo" JSONB NOT NULL,
    "alteracoes" JSONB,

    CONSTRAINT "CopiaProdutoCanal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CopiaProdutoCanal_produtoId_canal_criadoEm_idx" ON "CopiaProdutoCanal"("produtoId", "canal", "criadoEm");

-- AddForeignKey
ALTER TABLE "CopiaProdutoCanal" ADD CONSTRAINT "CopiaProdutoCanal_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
