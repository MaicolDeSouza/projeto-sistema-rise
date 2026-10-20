-- O saldo de estoque dos concorrentes a cada rodada semanal (so tabela nova).
CREATE TABLE "QuantidadeSemanal" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "semana" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "lidoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuantidadeSemanal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuantidadeSemanal_produtoId_semana_key" ON "QuantidadeSemanal"("produtoId", "semana");
CREATE INDEX "QuantidadeSemanal_semana_idx" ON "QuantidadeSemanal"("semana");
