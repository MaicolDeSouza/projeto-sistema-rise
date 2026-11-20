-- Reclamacoes do Mercado Livre (20/11/2026): a mediacao aberta no pedido e a tabela das reclamacoes da conta.
ALTER TABLE "PedidoDeVenda" ADD COLUMN "emMediacao" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "ReclamacaoML" (
    "id" TEXT NOT NULL,
    "recurso" TEXT NOT NULL,
    "recursoId" TEXT NOT NULL,
    "pedidoNumero" TEXT,
    "pedidoId" TEXT,
    "tipo" TEXT NOT NULL,
    "etapa" TEXT,
    "status" TEXT NOT NULL,
    "motivoId" TEXT,
    "motivoNome" TEXT,
    "motivoDetalhe" TEXT,
    "grupo" TEXT NOT NULL,
    "afetaReputacao" BOOLEAN,
    "resolucao" TEXT,
    "abertaEm" TIMESTAMP(3) NOT NULL,
    "atualizadaEm" TIMESTAMP(3),
    "lidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReclamacaoML_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReclamacaoML_pedidoId_idx" ON "ReclamacaoML"("pedidoId");
CREATE INDEX "ReclamacaoML_status_idx" ON "ReclamacaoML"("status");
CREATE INDEX "ReclamacaoML_abertaEm_idx" ON "ReclamacaoML"("abertaEm");

ALTER TABLE "ReclamacaoML" ADD CONSTRAINT "ReclamacaoML_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoDeVenda"("id") ON DELETE SET NULL ON UPDATE CASCADE;
