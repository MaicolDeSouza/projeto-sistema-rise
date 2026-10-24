-- Custo adicional na linha do fornecedor (pedido do dono em 24/10/2026): o Arduino que o fornecedor vende sem cabo
-- soma o custo do cabo (valor fixo ou o custo de hoje de um produto do Rise). So ACRESCENTA colunas: `precoCusto`
-- continua sendo o custo total que o resto do Rise le; `precoFornecedor` nasce igual a ele (nenhum vinculo tem adicional).
-- Escrita a mao (sem `migrate diff`), para nao levar os DROP INDEX dos indices que so existem no SQL.

ALTER TABLE "ProdutoFornecedor" ADD COLUMN "precoFornecedor" DECIMAL(12,2);
ALTER TABLE "ProdutoFornecedor" ADD COLUMN "adicionais" JSONB;
ALTER TABLE "ProdutoFornecedor" ADD COLUMN "adicionaisValor" DECIMAL(12,2);

UPDATE "ProdutoFornecedor" SET "precoFornecedor" = "precoCusto";
