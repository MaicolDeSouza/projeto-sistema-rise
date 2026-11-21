-- Nota de devolucao do Mercado Livre (20/11/2026): a devolucao de cada reclamacao e a marca da nota emitida.
ALTER TABLE "ReclamacaoML" ADD COLUMN "devolucaoStatus" TEXT,
ADD COLUMN "devolucaoSubtipo" TEXT,
ADD COLUMN "devolucaoPostadaEm" TIMESTAMP(3),
ADD COLUMN "devolucaoEntregueEm" TIMESTAMP(3),
ADD COLUMN "devolucaoLidaEm" TIMESTAMP(3),
ADD COLUMN "notaDevolucaoEm" TIMESTAMP(3),
ADD COLUMN "notaDevolucaoNumero" TEXT,
ADD COLUMN "notaDevolucaoPor" TEXT;

CREATE INDEX "ReclamacaoML_devolucaoPostadaEm_idx" ON "ReclamacaoML"("devolucaoPostadaEm");

ALTER TABLE "PedidoDeVenda" ADD COLUMN "notaDeDevolucao" TEXT;
