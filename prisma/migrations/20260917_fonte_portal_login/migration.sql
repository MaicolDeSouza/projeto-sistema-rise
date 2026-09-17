-- Fornecedor com portal de login, varrido por categoria (Santana).
ALTER TABLE "FonteColeta" ADD COLUMN "categorias" JSONB;
ALTER TABLE "FonteColeta" ADD COLUMN "credencialCifrada" TEXT;
ALTER TABLE "FonteColeta" ADD COLUMN "credencialAtualizadaEm" TIMESTAMP(3);
