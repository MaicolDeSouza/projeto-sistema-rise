-- Frete diluido nos produtos (pedido do dono em 17/11/2026): no CIF, o valor do frete entra no preco de cada item, na
-- proporcao do valor do item, no PDF, no link e no pedido de venda do Bling (que vai sem frete). O total nao muda.
ALTER TABLE "PropostaParaCliente" ADD COLUMN "freteDiluido" BOOLEAN NOT NULL DEFAULT false;
