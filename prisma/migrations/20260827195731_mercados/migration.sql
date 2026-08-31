-- CreateEnum
CREATE TYPE "TipoFonte" AS ENUM ('CONCORRENTE', 'FORNECEDOR');

-- CreateTable
CREATE TABLE "FonteColeta" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "dominio" TEXT NOT NULL,
    "tipo" "TipoFonte" NOT NULL,
    "prefixoUrl" TEXT,
    "urlSitemap" TEXT,
    "robotsPermite" BOOLEAN NOT NULL DEFAULT true,
    "amostraResumo" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "intervaloHoras" INTEGER NOT NULL DEFAULT 24,
    "proximaVarreduraEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ultimaVarreduraEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FonteColeta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaginaColetada" (
    "id" TEXT NOT NULL,
    "fonteId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "titulo" TEXT,
    "descricao" TEXT,
    "marca" TEXT,
    "modelo" TEXT,
    "mpn" TEXT,
    "skuFonte" TEXT,
    "ean" TEXT,
    "imagens" JSONB,
    "atributos" JSONB,
    "precoAtual" DECIMAL(12,2),
    "disponivel" BOOLEAN NOT NULL DEFAULT true,
    "buscaTexto" TEXT,
    "hashConteudo" TEXT,
    "etag" TEXT,
    "statusHttp" INTEGER,
    "erro" TEXT,
    "vistoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaginaColetada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrecoHistorico" (
    "id" TEXT NOT NULL,
    "paginaId" TEXT NOT NULL,
    "preco" DECIMAL(12,2),
    "disponivel" BOOLEAN NOT NULL DEFAULT true,
    "coletadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrecoHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FonteColeta_ativa_proximaVarreduraEm_idx" ON "FonteColeta"("ativa", "proximaVarreduraEm");

-- CreateIndex
CREATE UNIQUE INDEX "FonteColeta_dominio_prefixoUrl_key" ON "FonteColeta"("dominio", "prefixoUrl");

-- CreateIndex
CREATE UNIQUE INDEX "PaginaColetada_url_key" ON "PaginaColetada"("url");

-- CreateIndex
CREATE INDEX "PaginaColetada_fonteId_vistoEm_idx" ON "PaginaColetada"("fonteId", "vistoEm");

-- CreateIndex
CREATE INDEX "PrecoHistorico_paginaId_coletadoEm_idx" ON "PrecoHistorico"("paginaId", "coletadoEm");

-- AddForeignKey
ALTER TABLE "PaginaColetada" ADD CONSTRAINT "PaginaColetada_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteColeta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrecoHistorico" ADD CONSTRAINT "PrecoHistorico_paginaId_fkey" FOREIGN KEY ("paginaId") REFERENCES "PaginaColetada"("id") ON DELETE CASCADE ON UPDATE CASCADE;

