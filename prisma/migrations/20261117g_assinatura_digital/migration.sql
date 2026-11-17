-- Assinatura digital do PDF da proposta (spec 2026-11-17-assinatura-digital-proposta-design.md): o servico do
-- certificado e-CNPJ A1 na Conexao e a marca "Assinar digitalmente" na proposta. Aditiva.
ALTER TYPE "Servico" ADD VALUE IF NOT EXISTS 'CERTIFICADO_DIGITAL';

ALTER TABLE "PropostaParaCliente" ADD COLUMN "assinarDigitalmente" BOOLEAN NOT NULL DEFAULT false;
