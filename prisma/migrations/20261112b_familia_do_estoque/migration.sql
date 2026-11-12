-- Mapa do estoque, fase 2: a familia do produto (Topo > Folha da arvore de categorias do dono) para a regra
-- "parecidos nunca vizinhos". Preenchida por scripts/familias-do-estoque.js a partir de docs/categorias-4hobby-mapeamento.csv.
ALTER TABLE "Produto" ADD COLUMN "familiaEstoque" TEXT;
