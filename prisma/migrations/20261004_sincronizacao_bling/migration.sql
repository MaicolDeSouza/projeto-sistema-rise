-- Sincronizacao Rise <-> Bling (plano de 04/10/2026): estado de sincronizacao do produto,
-- ajustes de estoque pendentes e copia de seguranca do produto no Bling.
--
-- Gerada por `prisma migrate diff` e EDITADA a mao: os dois DROP INDEX que ele propoe
-- (ProdutoColetado_buscaTexto_trgm e ProdutoColetado_coletadoEm_idx) foram REMOVIDOS, porque
-- esses indices so existem no SQL. Nada e apagado: so colunas novas e uma tabela nova.

-- AlterTable
ALTER TABLE "MovimentoEstoque" ADD COLUMN     "enviadoAoBlingEm" TIMESTAMP(3);

-- Os ajustes que ja existem sao do passado: o saldo que o Bling vai informar ja os contem,
-- e reenviar entradas e saidas antigas deixaria o estoque dele errado. Nulo e PENDENTE, entao
-- eles recebem a data desta migration. O NOW() do Postgres vem em America/Sao_Paulo e a coluna
-- e UTC (TIMESTAMP sem fuso, gravada pelo Prisma em UTC), dai o AT TIME ZONE 'UTC'.
UPDATE "MovimentoEstoque" SET "enviadoAoBlingEm" = (NOW() AT TIME ZONE 'UTC');

-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "blingAssinatura" TEXT,
ADD COLUMN     "blingSaldo" INTEGER,
ADD COLUMN     "blingSincronizadoEm" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "BlingCopiaProduto" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conteudo" JSONB NOT NULL,
    "alteracoes" JSONB,

    CONSTRAINT "BlingCopiaProduto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BlingCopiaProduto_produtoId_criadoEm_idx" ON "BlingCopiaProduto"("produtoId", "criadoEm");

-- AddForeignKey
ALTER TABLE "BlingCopiaProduto" ADD CONSTRAINT "BlingCopiaProduto_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
