-- Compra em lote (preco por quantidade) e multiplo de venda com campo proprio,
-- fora das caracteristicas (pedido do dono, 17/09/2026).
ALTER TABLE "ProdutoColetado" ADD COLUMN "precosPorQuantidade" JSONB;
ALTER TABLE "ProdutoColetado" ADD COLUMN "multiploVenda" INTEGER;
