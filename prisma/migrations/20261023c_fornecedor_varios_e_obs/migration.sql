-- O mesmo fornecedor pode entrar mais de uma vez no produto (pedido do dono em 23/10/2026): sai o unique
-- (produtoId, fornecedorId) e a identidade da linha passa a ser o id. Entra a coluna "Obs" do vinculo.
-- Escrita a mao a partir do `migrate diff`, SEM os DROP INDEX dos indices que so existem no SQL
-- (ProdutoColetado_buscaTexto_trgm e ProdutoColetado_coletadoEm_idx).

-- DropIndex
DROP INDEX "ProdutoFornecedor_produtoId_fornecedorId_key";

-- AlterTable
ALTER TABLE "ProdutoFornecedor" ADD COLUMN "observacao" TEXT;

-- CreateIndex
CREATE INDEX "ProdutoFornecedor_produtoId_idx" ON "ProdutoFornecedor"("produtoId");
