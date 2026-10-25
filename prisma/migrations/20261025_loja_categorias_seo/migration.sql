-- Categorias e SEO da Loja Integrada passam a ser DO PRODUTO (pedido do dono em 25/10/2026). So aditiva, e idempotente:
-- as colunas nascem vazias e a copia so preenche o que esta vazio.
-- (Os dois DROP INDEX que o `migrate diff` propoe, de indices que so existem no SQL, foram tirados de proposito.)

-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "categoriasLI" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "seoDescricaoLI" TEXT,
ADD COLUMN     "seoTituloLI" TEXT;

-- Copia o que ja estava no rascunho do anuncio da LI (`Anuncio.dados`), para nenhum produto perder o que tem e para a
-- assinatura do icone da LI continuar igual (nenhum "!" novo).
UPDATE "Produto" p
SET "categoriasLI" = ARRAY(SELECT jsonb_array_elements_text(a.dados->'categorias'))
FROM "Anuncio" a
WHERE a."produtoId" = p.id
  AND a.canal = 'LOJA_INTEGRADA'
  AND jsonb_typeof(a.dados->'categorias') = 'array'
  AND cardinality(p."categoriasLI") = 0;

UPDATE "Produto" p
SET "seoTituloLI" = a.dados->'seo'->>'title'
FROM "Anuncio" a
WHERE a."produtoId" = p.id
  AND a.canal = 'LOJA_INTEGRADA'
  AND p."seoTituloLI" IS NULL
  AND coalesce(trim(a.dados->'seo'->>'title'), '') <> '';

UPDATE "Produto" p
SET "seoDescricaoLI" = a.dados->'seo'->>'description'
FROM "Anuncio" a
WHERE a."produtoId" = p.id
  AND a.canal = 'LOJA_INTEGRADA'
  AND p."seoDescricaoLI" IS NULL
  AND coalesce(trim(a.dados->'seo'->>'description'), '') <> '';

-- A proposta de anuncio da LI deixou de existir: as sugestoes ainda nao aceitas se perdem (o valor ja gravado no rascunho
-- foi copiado acima).
UPDATE "Anuncio" SET dados = dados - 'proposta' WHERE canal = 'LOJA_INTEGRADA' AND dados ? 'proposta';
