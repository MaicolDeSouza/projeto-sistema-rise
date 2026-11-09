-- O que o Mercado Pago creditou em cada venda do ML (09/11/2026): o liquido, as cobrancas, a liberacao e a conferencia
-- com o "Real" do Rise. Nulo nos pedidos da LI e do Bling e enquanto nao foi lido.
ALTER TABLE "PedidoDeVenda" ADD COLUMN "mercadoPago" JSONB;
