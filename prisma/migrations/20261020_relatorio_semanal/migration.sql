-- Relatorio semanal da coleta (rodada de todo sabado 00:00): so tabela nova, nada existente muda.
CREATE TABLE "RelatorioSemanal" (
    "id" TEXT NOT NULL,
    "semana" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "inicioEm" TIMESTAMP(3) NOT NULL,
    "fimEm" TIMESTAMP(3),
    "fontes" JSONB NOT NULL,
    "resumo" JSONB,
    "pdf" BYTEA,
    "erro" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelatorioSemanal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RelatorioSemanal_semana_key" ON "RelatorioSemanal"("semana");
