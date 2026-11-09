-- Unidades do produto em cada kit vendido no item do pedido (09/11/2026): a estimativa do lucro passa a ser por kit vendido.
ALTER TABLE "ItemDoPedidoDeVenda" ADD COLUMN "quantidadeDoKit" INTEGER NOT NULL DEFAULT 1;
