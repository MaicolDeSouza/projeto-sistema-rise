-- Comprovantes de pagamento do pedido de compra (09/11/2026): varios por pedido, em qualquer situacao.
CREATE TABLE "ComprovanteDePagamentoCompra" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "nomeOriginal" TEXT,
    "enviadoPor" TEXT,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ComprovanteDePagamentoCompra_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ComprovanteDePagamentoCompra_pedidoId_idx" ON "ComprovanteDePagamentoCompra"("pedidoId");
ALTER TABLE "ComprovanteDePagamentoCompra" ADD CONSTRAINT "ComprovanteDePagamentoCompra_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoDeCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
