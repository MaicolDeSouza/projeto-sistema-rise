-- Busca ampla (pedido do dono em 09/10/2026): indices de trigramas sobre EXPRESSOES, e nao sobre colunas.
-- O banco monta o indice para todos os produtos ao criar e o mantem sozinho em toda gravacao. As expressoes
-- sao copia EXATA das constantes de src/lib/buscaAmpla.js (gerado a partir delas; o teste confere): a busca
-- precisa repetir a expressao igual para o Postgres usar o indice.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Scraper: nome e codigos (buscaTexto) + categoria, descricao, ficha e SEO da loja.
CREATE INDEX IF NOT EXISTS "ProdutoColetado_buscaAmpla_trgm"
    ON "ProdutoColetado" USING gin ((translate(lower(coalesce("buscaTexto", '') || ' ' || coalesce("categoria", '') || ' ' || coalesce("descricao", '') || ' ' || coalesce(jsonb_path_query_array("especificacoes", '$[*].nome')::text, '') || ' ' || coalesce(jsonb_path_query_array("especificacoes", '$[*].valor')::text, '') || ' ' || coalesce("seo"->>'title', '') || ' ' || coalesce("seo"->>'description', '') || ' ' || coalesce("seo"->>'keywords', '')), 'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ', 'aaaaaaeeeeiiiiooooouuuucnyy')) gin_trgm_ops);

-- Produtos do Rise, busca normal: nome, codigo, marca, modelo e EAN.
CREATE INDEX IF NOT EXISTS "Produto_busca_trgm"
    ON "Produto" USING gin ((translate(lower(coalesce("tituloBase", '') || ' ' || coalesce("sku", '') || ' ' || coalesce("marca", '') || ' ' || coalesce("modelo", '') || ' ' || coalesce("ean", '')), 'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ', 'aaaaaaeeeeiiiiooooouuuucnyy')) gin_trgm_ops);

-- Produtos do Rise, busca ampla: a normal + descricao, NCM, homologacao e localizacao.
CREATE INDEX IF NOT EXISTS "Produto_buscaAmpla_trgm"
    ON "Produto" USING gin ((translate(lower(coalesce("tituloBase", '') || ' ' || coalesce("sku", '') || ' ' || coalesce("marca", '') || ' ' || coalesce("modelo", '') || ' ' || coalesce("ean", '') || ' ' || coalesce("descricaoBase", '') || ' ' || coalesce("ncm", '') || ' ' || coalesce("numeroHomologacao", '') || ' ' || coalesce("localizacao", '')), 'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ', 'aaaaaaeeeeiiiiooooouuuucnyy')) gin_trgm_ops);
