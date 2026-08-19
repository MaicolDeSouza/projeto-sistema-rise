-- CreateEnum
CREATE TYPE "Canal" AS ENUM ('MERCADO_LIVRE', 'LOJA_INTEGRADA');

-- CreateEnum
CREATE TYPE "Servico" AS ENUM ('BLING', 'MERCADO_LIVRE', 'LOJA_INTEGRADA');

-- CreateEnum
CREATE TYPE "StatusAnuncio" AS ENUM ('RASCUNHO', 'GERADO', 'PUBLICANDO', 'PUBLICADO', 'ERRO');

-- CreateEnum
CREATE TYPE "StatusJob" AS ENUM ('PENDENTE', 'PROCESSANDO', 'CONCLUIDO', 'FALHOU');

-- CreateTable
CREATE TABLE "Produto" (
    "id" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "ean" TEXT,
    "marca" TEXT,
    "modelo" TEXT,
    "tituloBase" TEXT NOT NULL,
    "descricaoBase" TEXT,
    "custo" DECIMAL(12,2),
    "precoVenda" DECIMAL(12,2),
    "estoque" INTEGER NOT NULL DEFAULT 0,
    "pesoKg" DECIMAL(10,3),
    "alturaCm" DECIMAL(10,2),
    "larguraCm" DECIMAL(10,2),
    "comprimentoCm" DECIMAL(10,2),
    "garantiaMeses" INTEGER,
    "blingId" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Produto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoImagem" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProdutoImagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anuncio" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "canal" "Canal" NOT NULL,
    "status" "StatusAnuncio" NOT NULL DEFAULT 'RASCUNHO',
    "titulo" TEXT,
    "descricao" TEXT,
    "atributos" JSONB,
    "categoriaExternaId" TEXT,
    "idExterno" TEXT,
    "urlExterna" TEXT,
    "erro" TEXT,
    "publicadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Anuncio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conexao" (
    "id" TEXT NOT NULL,
    "servico" "Servico" NOT NULL,
    "contaExterna" TEXT,
    "accessTokenCifrado" TEXT,
    "refreshTokenCifrado" TEXT,
    "expiraEm" TIMESTAMP(3),
    "conectadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conexao_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "StatusJob" NOT NULL DEFAULT 'PENDENTE',
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "maxTentativas" INTEGER NOT NULL DEFAULT 3,
    "proximaTentativaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "erro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogIntegracao" (
    "id" TEXT NOT NULL,
    "servico" "Servico" NOT NULL,
    "metodo" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "statusHttp" INTEGER,
    "duracaoMs" INTEGER,
    "requestResumo" TEXT,
    "responseResumo" TEXT,
    "erro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LogIntegracao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Produto_sku_key" ON "Produto"("sku");

-- CreateIndex
CREATE INDEX "Produto_marca_idx" ON "Produto"("marca");

-- CreateIndex
CREATE INDEX "Produto_ativo_idx" ON "Produto"("ativo");

-- CreateIndex
CREATE INDEX "ProdutoImagem_produtoId_ordem_idx" ON "ProdutoImagem"("produtoId", "ordem");

-- CreateIndex
CREATE INDEX "Anuncio_status_idx" ON "Anuncio"("status");

-- CreateIndex
CREATE INDEX "Anuncio_canal_status_idx" ON "Anuncio"("canal", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Anuncio_produtoId_canal_key" ON "Anuncio"("produtoId", "canal");

-- CreateIndex
CREATE UNIQUE INDEX "Conexao_servico_key" ON "Conexao"("servico");

-- CreateIndex
CREATE INDEX "Job_status_proximaTentativaEm_idx" ON "Job"("status", "proximaTentativaEm");

-- CreateIndex
CREATE INDEX "LogIntegracao_servico_criadoEm_idx" ON "LogIntegracao"("servico", "criadoEm");

-- AddForeignKey
ALTER TABLE "ProdutoImagem" ADD CONSTRAINT "ProdutoImagem_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anuncio" ADD CONSTRAINT "Anuncio_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
