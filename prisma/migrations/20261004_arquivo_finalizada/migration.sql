-- Produtos / fotos: guarda a marca "finalizada" (o check verde da tira de fotos) no banco
-- (pedido do dono em 04/10/2026: ao salvar e reabrir o produto, as fotos que ele validou perdiam o check).
-- Coluna nova com padrao `false`: as fotos que ja existem continuam como estao (nao finalizadas), e as
-- outras frentes, com o client antigo, nao quebram.
-- Escrita a mao (e o mesmo ALTER que o `migrate diff` gera) para nao carregar os DROP INDEX dos indices que
-- so existem no SQL (trigramas e ProdutoColetado_coletadoEm_idx; Anuncio_um_por_produto e Job_fonte_aberta
-- tambem ficam como estao).

-- AlterTable
ALTER TABLE "ProdutoArquivo" ADD COLUMN "finalizada" BOOLEAN NOT NULL DEFAULT false;
