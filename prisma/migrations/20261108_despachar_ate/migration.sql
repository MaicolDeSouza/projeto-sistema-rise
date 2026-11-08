-- Limite de deixar o pedido na agencia (08/11/2026): o filtro "Enviar hoje" da lista de Pedidos.
ALTER TABLE "PedidoDeVenda" ADD COLUMN "despacharAte" TIMESTAMP(3);
CREATE INDEX "PedidoDeVenda_statusDoEnvio_despacharAte_idx" ON "PedidoDeVenda"("statusDoEnvio", "despacharAte");
