-- A conta do editor do ML guardada no Publicar e em cada envio de preco (09/11/2026): a estimativa do pedido de venda.
CREATE TABLE "ContaDoEditorML" (
    "id" TEXT NOT NULL,
    "anuncioId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "unidadesDoKit" INTEGER NOT NULL DEFAULT 1,
    "motivo" TEXT NOT NULL,
    "preco" DECIMAL(12,2) NOT NULL,
    "percentual" DECIMAL(8,6) NOT NULL,
    "tarifaFixa" DECIMAL(12,2) NOT NULL,
    "frete" DECIMAL(12,2) NOT NULL,
    "custoDoKit" DECIMAL(12,4),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ContaDoEditorML_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ContaDoEditorML_produtoId_unidadesDoKit_criadoEm_idx" ON "ContaDoEditorML"("produtoId", "unidadesDoKit", "criadoEm");

-- O aceite da divergencia do lucro no pedido (botao "Aceitar divergencia").
ALTER TABLE "PedidoDeVenda" ADD COLUMN "divergenciaAceita" JSONB;
