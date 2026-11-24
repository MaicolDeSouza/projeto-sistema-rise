-- Atendimento do Mercado Livre, fase 1: perguntas dos anuncios (spec 2026-11-24-atendimento-ml-design.md).
-- So cria: nenhuma tabela existente muda.

-- CreateEnum
CREATE TYPE "TipoDeAtendimentoML" AS ENUM ('PERGUNTA', 'POS_VENDA', 'RECLAMACAO');

-- CreateEnum
CREATE TYPE "StatusDoAtendimentoML" AS ENUM ('ABERTA', 'RESPONDIDA', 'IGNORADA', 'FECHADA_FORA');

-- CreateTable
CREATE TABLE "AtendimentoML" (
    "id" TEXT NOT NULL,
    "tipo" "TipoDeAtendimentoML" NOT NULL,
    "idExterno" TEXT NOT NULL,
    "itemId" TEXT,
    "anuncioId" TEXT,
    "produtoId" TEXT,
    "textoDoCliente" TEXT NOT NULL,
    "situacaoNoML" TEXT NOT NULL,
    "recebidaEm" TIMESTAMP(3) NOT NULL,
    "status" "StatusDoAtendimentoML" NOT NULL DEFAULT 'ABERTA',
    "rascunho" TEXT,
    "rascunhoOrigem" TEXT,
    "rascunhoEm" TIMESTAMP(3),
    "enviandoDesde" TIMESTAMP(3),
    "respostaEnviada" TEXT,
    "respondidaEm" TIMESTAMP(3),
    "respondidaPor" TEXT,
    "respondidaVia" TEXT,
    "erroDoEnvio" TEXT,
    "telegramChatId" TEXT,
    "telegramMensagemId" INTEGER,
    "telegramPedidoId" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtendimentoML_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstadoDoBotTelegram" (
    "id" TEXT NOT NULL,
    "offset" INTEGER NOT NULL DEFAULT 0,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstadoDoBotTelegram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComandoDeVinculoTelegram" (
    "updateId" INTEGER NOT NULL,
    "chatId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "usuario" TEXT,
    "codigoHash" TEXT NOT NULL,
    "recebidoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComandoDeVinculoTelegram_pkey" PRIMARY KEY ("updateId")
);

-- CreateIndex
CREATE INDEX "AtendimentoML_tipo_status_recebidaEm_idx" ON "AtendimentoML"("tipo", "status", "recebidaEm");

-- CreateIndex
CREATE UNIQUE INDEX "AtendimentoML_tipo_idExterno_key" ON "AtendimentoML"("tipo", "idExterno");

-- CreateIndex
CREATE INDEX "ComandoDeVinculoTelegram_recebidoEm_idx" ON "ComandoDeVinculoTelegram"("recebidoEm");
