-- Atendimento do Mercado Livre, fase 2: mensagens de pos-venda (plano 2026-11-24-atendimento-ml-fase-2-pos-venda.md).
-- So acrescenta colunas opcionais a "AtendimentoML": nada existente muda.

-- AlterTable
ALTER TABLE "AtendimentoML" ADD COLUMN "pedidoId" TEXT,
ADD COLUMN "conversa" JSONB,
ADD COLUMN "ultimaDoClienteId" TEXT,
ADD COLUMN "bloqueio" TEXT,
ADD COLUMN "limite" INTEGER;
