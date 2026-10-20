-- Proposta automatica de produto (spec 2026-10-16). So aditiva: tabela nova, nada muda em Produto.
-- Gerada por `migrate diff`; as linhas DROP INDEX de "ProdutoColetado_buscaTexto_trgm" e
-- "ProdutoColetado_coletadoEm_idx" foram TIRADAS (indices que so existem no SQL, ver CLAUDE.md).

-- CreateTable
CREATE TABLE "PropostaDeProduto" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "versaoDoRoteiro" TEXT NOT NULL DEFAULT '1',
    "secoes" JSONB NOT NULL,
    "aplicadas" JSONB NOT NULL DEFAULT '{}',
    "criadaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadaEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropostaDeProduto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropostaDeProduto_produtoId_key" ON "PropostaDeProduto"("produtoId");

-- AddForeignKey
ALTER TABLE "PropostaDeProduto" ADD CONSTRAINT "PropostaDeProduto_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
