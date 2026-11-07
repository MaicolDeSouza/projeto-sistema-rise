-- Obs para o fornecedor (06/11/2026): o PDF do pedido deixa de imprimir as Observacoes (anotacao interna) e passa a
-- imprimir so este campo.
ALTER TABLE "PedidoDeCompra" ADD COLUMN "observacoesFornecedor" TEXT;
