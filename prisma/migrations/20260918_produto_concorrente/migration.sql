-- CreateTable
CREATE TABLE "ProdutoConcorrente" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "produtoColetadoId" TEXT,
    "fonteManual" TEXT,
    "nomeManual" TEXT,
    "codigoManual" TEXT,
    "precoManual" DECIMAL(12,2),
    "linkManual" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProdutoConcorrente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProdutoConcorrente_produtoColetadoId_idx" ON "ProdutoConcorrente"("produtoColetadoId");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoConcorrente_produtoId_produtoColetadoId_key" ON "ProdutoConcorrente"("produtoId", "produtoColetadoId");

-- AddForeignKey
ALTER TABLE "ProdutoConcorrente" ADD CONSTRAINT "ProdutoConcorrente_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoConcorrente" ADD CONSTRAINT "ProdutoConcorrente_produtoColetadoId_fkey" FOREIGN KEY ("produtoColetadoId") REFERENCES "ProdutoColetado"("id") ON DELETE SET NULL ON UPDATE CASCADE;
