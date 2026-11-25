-- Atendimento do Mercado Livre, fase 3: mensagens das reclamacoes (plano 2026-11-25-atendimento-ml-fase-3-reclamacoes.md).
-- So acrescenta colunas opcionais a "AtendimentoML": nada existente muda.

-- AlterTable
ALTER TABLE "AtendimentoML" ADD COLUMN "reclamacaoId" TEXT,
ADD COLUMN "etapa" TEXT,
ADD COLUMN "destinatario" TEXT,
ADD COLUMN "prazoEm" TIMESTAMP(3);
