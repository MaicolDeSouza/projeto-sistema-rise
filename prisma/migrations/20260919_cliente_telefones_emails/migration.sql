-- Mais de um telefone e mais de um e-mail por cliente.
--
-- Aditiva de proposito: `telefone` e `email` continuam sendo o principal (o primeiro
-- da lista), e estas colunas guardam os demais. A outra frente de trabalho usa o
-- mesmo banco com o client antigo; coluna nova com valor padrao nao a quebra.
--
-- O `migrate diff` propos tambem DROP INDEX de ProdutoColetado_buscaTexto_trgm e
-- ProdutoColetado_coletadoEm_idx, que so existem no SQL. Ficaram de fora: apagar o
-- de trigramas leva a busca de Mercados de 15 ms para 600 ms.

-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "emailsAdicionais" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "telefonesAdicionais" TEXT[] DEFAULT ARRAY[]::TEXT[];
