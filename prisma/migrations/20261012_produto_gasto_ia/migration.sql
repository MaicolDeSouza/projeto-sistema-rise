-- Total gasto com IA no cadastro do produto (descricao e titulo), pedido do dono em 12/10/2026.
-- Aditiva: coluna nova e opcional. O "migrate diff" tambem propos apagar os indices que so existem no SQL
-- (ProdutoColetado_buscaTexto_trgm e ProdutoColetado_coletadoEm_idx): tirados, como em toda migration.
ALTER TABLE "Produto" ADD COLUMN "gastoIA" JSONB;
