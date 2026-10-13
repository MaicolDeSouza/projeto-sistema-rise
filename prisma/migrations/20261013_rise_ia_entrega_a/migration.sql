-- CreateEnum
CREATE TYPE "TipoDeGastoIA" AS ENUM ('TRANSCRICAO', 'EMBEDDING', 'BUSCA');

-- CreateEnum
CREATE TYPE "EscopoDeGastoIA" AS ENUM ('CLIENTES', 'INTERNO');

-- AlterTable
ALTER TABLE "MensagemIA" ADD COLUMN     "interrompida" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "GastoIA" (
    "id" TEXT NOT NULL,
    "tipo" "TipoDeGastoIA" NOT NULL,
    "escopo" "EscopoDeGastoIA" NOT NULL DEFAULT 'INTERNO',
    "provedor" TEXT NOT NULL,
    "modelo" TEXT,
    "valorUsd" DECIMAL(12,6) NOT NULL,
    "valorBrl" DECIMAL(12,4) NOT NULL,
    "referencia" TEXT,
    "detalhe" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GastoIA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservaDeGastoIA" (
    "id" TEXT NOT NULL,
    "escopo" "EscopoDeGastoIA" NOT NULL,
    "valorBrl" DECIMAL(12,4) NOT NULL,
    "dono" TEXT NOT NULL,
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiraEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservaDeGastoIA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersaoDePromptIA" (
    "id" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "alteradoPor" TEXT NOT NULL,
    "alteradoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersaoDePromptIA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GastoIA_escopo_criadoEm_idx" ON "GastoIA"("escopo", "criadoEm");

-- CreateIndex
CREATE INDEX "ReservaDeGastoIA_escopo_expiraEm_idx" ON "ReservaDeGastoIA"("escopo", "expiraEm");

-- CreateIndex
CREATE INDEX "VersaoDePromptIA_canal_alteradoEm_idx" ON "VersaoDePromptIA"("canal", "alteradoEm");

