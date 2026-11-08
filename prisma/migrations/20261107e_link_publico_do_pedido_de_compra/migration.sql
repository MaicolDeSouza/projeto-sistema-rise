-- Chave do link publico do pedido de compra (07/11/2026): o fornecedor le o pedido sem login.
ALTER TABLE "PedidoDeCompra" ADD COLUMN "linkPublico" TEXT;
CREATE UNIQUE INDEX "PedidoDeCompra_linkPublico_key" ON "PedidoDeCompra"("linkPublico");
