-- Fator (embalagem) do fornecedor em todo vinculo (pedido do dono em 06/11/2026: a Fortek vende resistor em caixa de
-- 5000 por R$ 61,10 e a loja vende avulso). O custo do vinculo passa a ser precoFornecedor / fator + adicionais, por
-- unidade do Rise, e por isso ganha 4 casas (R$ 0,0122 a peca; com 2 casas virava R$ 0,01). O pedido de compra pede
-- caixas: o item guarda o fator e o lancamento entra caixas x fator no estoque.

ALTER TABLE "ProdutoFornecedor" ALTER COLUMN "precoCusto" SET DATA TYPE DECIMAL(12,4);
ALTER TABLE "ProdutoFornecedor" ALTER COLUMN "precoFornecedor" SET DATA TYPE DECIMAL(12,4);
ALTER TABLE "Produto" ALTER COLUMN "custo" SET DATA TYPE DECIMAL(12,4);
ALTER TABLE "ItemDoPedidoDeVenda" ALTER COLUMN "custoUnitarioCongelado" SET DATA TYPE DECIMAL(12,4);

ALTER TABLE "ItemDoPedidoDeCompra" ADD COLUMN "fator" INTEGER NOT NULL DEFAULT 1;

-- Os vinculos do AliExpress com fator (os unicos ate hoje; na VPS, 3: fatores 5, 50 e 200) guardavam em precoFornecedor
-- o preco POR PECA. Na regra nova ele e o preco da embalagem; o precoCusto (por peca) nao muda.
UPDATE "ProdutoFornecedor" SET "precoFornecedor" = "precoFornecedor" * "fator" WHERE "fator" <> 1 AND "precoFornecedor" IS NOT NULL;
