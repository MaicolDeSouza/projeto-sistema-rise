-- Servidor MCP (plano de 20/10/2026): so aditiva. Gerada por `migrate diff`, SEM os DROP INDEX dos indices que so existem no
-- SQL (ProdutoColetado_buscaTexto_trgm e ProdutoColetado_coletadoEm_idx), que o diff sempre propoe apagar.

-- CreateEnum
CREATE TYPE "CanalIA" AS ENUM ('CHAT', 'MCP');

-- AlterTable
ALTER TABLE "ConversaIA" ADD COLUMN     "canal" "CanalIA" NOT NULL DEFAULT 'CHAT';

-- CreateTable
CREATE TABLE "ClienteMcp" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClienteMcp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CodigoMcp" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "escopos" TEXT[],
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "usadoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CodigoMcp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TokenMcp" (
    "id" TEXT NOT NULL,
    "hashAcesso" TEXT NOT NULL,
    "hashRenovacao" TEXT NOT NULL,
    "familia" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "escopos" TEXT[],
    "expiraEm" TIMESTAMP(3) NOT NULL,
    "renovacaoExpiraEm" TIMESTAMP(3) NOT NULL,
    "revogadoEm" TIMESTAMP(3),
    "substituidoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TokenMcp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChamadaMcp" (
    "id" TEXT NOT NULL,
    "quando" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "login" TEXT NOT NULL,
    "clienteId" TEXT,
    "clienteNome" TEXT NOT NULL,
    "ferramenta" TEXT NOT NULL,
    "argumentos" JSONB,
    "ok" BOOLEAN NOT NULL,
    "erro" TEXT,
    "duracaoMs" INTEGER NOT NULL,

    CONSTRAINT "ChamadaMcp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CodigoMcp_hash_key" ON "CodigoMcp"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "TokenMcp_hashAcesso_key" ON "TokenMcp"("hashAcesso");

-- CreateIndex
CREATE UNIQUE INDEX "TokenMcp_hashRenovacao_key" ON "TokenMcp"("hashRenovacao");

-- CreateIndex
CREATE INDEX "TokenMcp_login_idx" ON "TokenMcp"("login");

-- CreateIndex
CREATE INDEX "TokenMcp_familia_idx" ON "TokenMcp"("familia");

-- CreateIndex
CREATE INDEX "ChamadaMcp_login_quando_idx" ON "ChamadaMcp"("login", "quando");

-- CreateIndex
CREATE INDEX "ConversaIA_canal_usuario_criadoEm_idx" ON "ConversaIA"("canal", "usuario", "criadoEm");

-- AddForeignKey
ALTER TABLE "CodigoMcp" ADD CONSTRAINT "CodigoMcp_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteMcp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TokenMcp" ADD CONSTRAINT "TokenMcp_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "ClienteMcp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

