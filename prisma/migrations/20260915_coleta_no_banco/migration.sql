-- DropForeignKey
ALTER TABLE "PaginaColetada" DROP CONSTRAINT "PaginaColetada_fonteId_fkey";

-- DropForeignKey
ALTER TABLE "PrecoHistorico" DROP CONSTRAINT "PrecoHistorico_paginaId_fkey";

-- DropIndex
DROP INDEX "PrecoHistorico_paginaId_coletadoEm_idx";

-- AlterTable
ALTER TABLE "FonteColeta" ADD COLUMN     "listaArquivos" JSONB,
ADD COLUMN     "listaEnviadaEm" TIMESTAMP(3),
ADD COLUMN     "ultimaColetaDuracaoMs" INTEGER,
ADD COLUMN     "ultimaColetaEm" TIMESTAMP(3),
ADD COLUMN     "ultimaColetaOrigem" TEXT,
ADD COLUMN     "ultimaColetaResumo" TEXT,
ADD COLUMN     "ultimaColetaTotal" INTEGER;

-- AlterTable
ALTER TABLE "PrecoHistorico" DROP COLUMN "disponivel",
DROP COLUMN "paginaId",
DROP COLUMN "preco",
ADD COLUMN     "estoqueStatus" TEXT,
ADD COLUMN     "precoNormal" DECIMAL(12,2),
ADD COLUMN     "precoPromocional" DECIMAL(12,2),
ADD COLUMN     "precoReserva" DECIMAL(12,2),
ADD COLUMN     "produtoId" TEXT NOT NULL;

-- DropTable
DROP TABLE "PaginaColetada";

-- CreateTable
CREATE TABLE "ProdutoColetado" (
    "id" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "codigo" TEXT,
    "nome" TEXT,
    "marca" TEXT,
    "modelo" TEXT,
    "mpn" TEXT,
    "ean" TEXT,
    "categoria" TEXT,
    "ncm" TEXT,
    "url" TEXT,
    "precoNormal" DECIMAL(12,2),
    "precoPromocional" DECIMAL(12,2),
    "precoReserva" DECIMAL(12,2),
    "precoComImpostos" DECIMAL(12,2),
    "impostos" JSONB,
    "estoqueStatus" TEXT,
    "quantidade" INTEGER,
    "aChegar" INTEGER,
    "miniatura" TEXT,
    "imagens" JSONB,
    "descricao" TEXT,
    "especificacoes" JSONB,
    "documentos" JSONB,
    "variantes" JSONB,
    "seo" JSONB,
    "plataforma" JSONB,
    "origens" JSONB,
    "ausenteDesde" TIMESTAMP(3),
    "ausenteMotivo" TEXT,
    "buscaTexto" TEXT,
    "hashConteudo" TEXT,
    "coletadoEm" TIMESTAMP(3),
    "vistoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProdutoColetado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProdutoColetado_fonteId_vistoEm_idx" ON "ProdutoColetado"("fonteId", "vistoEm");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoColetado_fonteId_chave_key" ON "ProdutoColetado"("fonteId", "chave");

-- CreateIndex
CREATE INDEX "PrecoHistorico_produtoId_coletadoEm_idx" ON "PrecoHistorico"("produtoId", "coletadoEm");

-- AddForeignKey
ALTER TABLE "ProdutoColetado" ADD CONSTRAINT "ProdutoColetado_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteColeta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecoHistorico" ADD CONSTRAINT "PrecoHistorico_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "ProdutoColetado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

