-- CreateEnum
CREATE TYPE "PerfilIA" AS ENUM ('ADMIN', 'PUBLICO');

-- CreateEnum
CREATE TYPE "PapelMensagemIA" AS ENUM ('USUARIO', 'ASSISTENTE');

-- CreateEnum
CREATE TYPE "StatusConhecimentoIA" AS ENUM ('RASCUNHO', 'APROVADO', 'REJEITADO', 'REVERTIDO');

-- CreateEnum
CREATE TYPE "VisibilidadeIA" AS ENUM ('ADMIN', 'PUBLICO');

-- CreateEnum
CREATE TYPE "StatusSugestaoIA" AS ENUM ('PENDENTE', 'APROVADA', 'REJEITADA');

-- CreateEnum
CREATE TYPE "OrigemSugestaoIA" AS ENUM ('SINALIZACAO', 'ANALISADOR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Servico" ADD VALUE 'LM_STUDIO';
ALTER TYPE "Servico" ADD VALUE 'OLLAMA';
ALTER TYPE "Servico" ADD VALUE 'OPENAI';

-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "blingSaldoLidoEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "ConfiguracaoIA" (
    "id" TEXT NOT NULL DEFAULT 'unica',
    "dados" JSONB NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    "atualizadoPor" TEXT,

    CONSTRAINT "ConfiguracaoIA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversaIA" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "perfil" "PerfilIA" NOT NULL DEFAULT 'ADMIN',
    "revisadaEm" TIMESTAMP(3),
    "revisadaPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversaIA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MensagemIA" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "papel" "PapelMensagemIA" NOT NULL,
    "conteudo" TEXT NOT NULL,
    "estruturado" JSONB,
    "provedor" TEXT,
    "modelo" TEXT,
    "motivoDaReserva" TEXT,
    "tokensEntrada" INTEGER,
    "tokensSaida" INTEGER,
    "custoUsd" DECIMAL(12,6),
    "custoBrl" DECIMAL(12,4),
    "duracaoMs" INTEGER,
    "avaliacao" INTEGER,
    "comentario" TEXT,
    "avaliadoPor" TEXT,
    "avaliadoEm" TIMESTAMP(3),
    "avisos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensagemIA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConhecimentoIA" (
    "id" TEXT NOT NULL,
    "assunto" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "categoria" TEXT,
    "fonte" TEXT,
    "produtos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "visibilidade" "VisibilidadeIA" NOT NULL DEFAULT 'ADMIN',
    "status" "StatusConhecimentoIA" NOT NULL DEFAULT 'RASCUNHO',
    "criadoPor" TEXT NOT NULL,
    "aprovadoPor" TEXT,
    "aprovadoEm" TIMESTAMP(3),
    "origemMensagemId" TEXT,
    "versao" INTEGER NOT NULL DEFAULT 1,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConhecimentoIA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SugestaoIA" (
    "id" TEXT NOT NULL,
    "conversaId" TEXT NOT NULL,
    "mensagemId" TEXT,
    "origem" "OrigemSugestaoIA" NOT NULL,
    "tipo" TEXT,
    "problema" TEXT NOT NULL,
    "correcaoSugerida" TEXT NOT NULL,
    "justificativa" TEXT,
    "produtos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fontes" JSONB,
    "confianca" INTEGER,
    "status" "StatusSugestaoIA" NOT NULL DEFAULT 'PENDENTE',
    "decididoPor" TEXT,
    "decididoEm" TIMESTAMP(3),
    "motivoRejeicao" TEXT,
    "conhecimentoId" TEXT,
    "hash" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SugestaoIA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversaIA_usuario_atualizadoEm_idx" ON "ConversaIA"("usuario", "atualizadoEm");

-- CreateIndex
CREATE INDEX "ConversaIA_criadoEm_idx" ON "ConversaIA"("criadoEm");

-- CreateIndex
CREATE INDEX "MensagemIA_conversaId_criadoEm_idx" ON "MensagemIA"("conversaId", "criadoEm");

-- CreateIndex
CREATE INDEX "MensagemIA_criadoEm_idx" ON "MensagemIA"("criadoEm");

-- CreateIndex
CREATE INDEX "ConhecimentoIA_status_idx" ON "ConhecimentoIA"("status");

-- CreateIndex
CREATE INDEX "SugestaoIA_status_criadoEm_idx" ON "SugestaoIA"("status", "criadoEm");

-- AddForeignKey
ALTER TABLE "MensagemIA" ADD CONSTRAINT "MensagemIA_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "ConversaIA"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SugestaoIA" ADD CONSTRAINT "SugestaoIA_conversaId_fkey" FOREIGN KEY ("conversaId") REFERENCES "ConversaIA"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indice SO de SQL (o Prisma nao descreve indice GIN de expressao): a recuperacao do conhecimento aprovado do Rise AI
-- compara trigramas do assunto + conteudo com a pergunta. O proximo `migrate diff` vai propor apagar este indice:
-- tirar essa linha, como as dos outros indices so-SQL.
CREATE INDEX "ConhecimentoIA_busca_trgm" ON "ConhecimentoIA" USING gin ((lower("assunto" || ' ' || "conteudo")) gin_trgm_ops);
