-- Busca por palavra na tela Mercados: "LIKE '%palavra%'" varria as 35 mil
-- linhas (600 ms por clique). O indice de trigramas atende LIKE com curinga dos
-- dois lados, que indice comum nao atende.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS "ProdutoColetado_buscaTexto_trgm"
    ON "ProdutoColetado" USING gin ("buscaTexto" gin_trgm_ops);
-- A ordem padrao da lista e por data de coleta.
CREATE INDEX IF NOT EXISTS "ProdutoColetado_coletadoEm_idx"
    ON "ProdutoColetado" ("coletadoEm" DESC);
