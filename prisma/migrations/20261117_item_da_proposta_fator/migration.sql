-- O fator do item da proposta (pedido do dono em 17/11/2026): quantas unidades do produto do Rise formam 1 unidade do
-- cliente ("kit espacador 10 unidades" = 10). Quantidade, preco e custo do item ficam na unidade do cliente; o estoque e o
-- pedido de venda do Bling usam quantidade x fator. Os itens que ja existem ficam com 1.
ALTER TABLE "ItemDaPropostaParaCliente" ADD COLUMN "fator" DECIMAL(12,4) NOT NULL DEFAULT 1;
