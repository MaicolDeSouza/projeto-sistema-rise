-- Estudo de viabilidade de produto (spec 2026-11-12-estudo-de-viabilidade-design.md). Feita do `migrate diff` SEM as
-- linhas que apagavam os indices feitos a mao (trigramas e coletadoEm), que o diff sempre propoe.
CREATE TABLE "EstudoDeViabilidade" (
    "id" TEXT NOT NULL,
    "produtoColetadoId" TEXT,
    "nome" TEXT NOT NULL,
    "codigo" TEXT,
    "fonteNome" TEXT NOT NULL,
    "fonteTipo" TEXT NOT NULL,
    "url" TEXT,
    "miniatura" TEXT,
    "situacao" TEXT NOT NULL DEFAULT 'NA_FILA',
    "termos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "anunciosML" JSONB,
    "fornecedores" JSONB,
    "parecidos" JSONB,
    "contas" JSONB,
    "veredito" TEXT,
    "confianca" TEXT,
    "quantidadeInicial" INTEGER,
    "conclusao" TEXT,
    "versaoDoRoteiro" TEXT,
    "criadoPor" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "calculadoEm" TIMESTAMP(3),
    "concluidoEm" TIMESTAMP(3),
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EstudoDeViabilidade_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EstudoDeViabilidade_situacao_criadoEm_idx" ON "EstudoDeViabilidade"("situacao", "criadoEm");
CREATE INDEX "EstudoDeViabilidade_produtoColetadoId_idx" ON "EstudoDeViabilidade"("produtoColetadoId");
