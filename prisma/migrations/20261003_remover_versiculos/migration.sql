-- Canais de Venda / Mercado Livre: remove os versiculos (decisao do dono em 03/10/2026).
-- A tabela estava vazia (conferido antes de aplicar: count = 0) e a coluna do historico
-- de usados nunca foi preenchida. A migration 20261001_canais_de_venda_ml ja estava
-- aplicada e NAO foi editada.
-- Editada a mao em relacao ao `migrate diff`: os dois DROP INDEX de ProdutoColetado
-- (ProdutoColetado_buscaTexto_trgm e ProdutoColetado_coletadoEm_idx) foram REMOVIDOS,
-- porque esses indices so existem no SQL. Os indices parciais Anuncio_um_por_produto e
-- Job_fonte_aberta tambem ficam como estao.

-- AlterTable
ALTER TABLE "ConfigCanal" DROP COLUMN "versiculosUsados";

-- DropTable
DROP TABLE "Versiculo";
