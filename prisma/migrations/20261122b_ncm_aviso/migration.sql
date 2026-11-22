-- "!" do icone Rise quando o NCM de um produto conferido muda fora do cadastro (NF do fornecedor, 22/11/2026).
ALTER TABLE "Produto" ADD COLUMN "ncmAviso" JSONB;
