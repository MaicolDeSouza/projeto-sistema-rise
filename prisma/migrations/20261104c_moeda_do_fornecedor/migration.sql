-- Lista de fornecedor em moeda estrangeira (NexMind, em dolar, 04/11/2026): moeda e fator de importacao no cadastro do
-- fornecedor, e o preco original (dolar, cotacao e fator) ao lado do preco ja convertido no produto coletado.
ALTER TABLE "Fornecedor" ADD COLUMN "moedaLista" TEXT NOT NULL DEFAULT 'BRL';
ALTER TABLE "Fornecedor" ADD COLUMN "fatorImportacao" DECIMAL(6,3);
ALTER TABLE "ProdutoColetado" ADD COLUMN "precoOriginal" JSONB;
