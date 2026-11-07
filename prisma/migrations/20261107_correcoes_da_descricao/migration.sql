-- Correcoes da descricao (spec 2026-11-07-correcoes-da-descricao-design.md, 07/11/2026): o que o dono ensina uma vez e o
-- Rise aplica em toda descricao (TROCA: errado -> certo) ou poe na instrucao da IA e do Claude (REGRA).
-- Aditiva: nenhuma tabela existente muda. promptNome e texto (sem chave estrangeira): null = todas as descricoes.

-- CreateEnum
CREATE TYPE "TipoDeCorrecao" AS ENUM ('TROCA', 'REGRA');

-- CreateEnum
CREATE TYPE "OrigemDaCorrecao" AS ENUM ('CHAT', 'CADASTRO', 'TELA');

-- CreateTable
CREATE TABLE "CorrecaoDaDescricao" (
    "id" TEXT NOT NULL,
    "tipo" "TipoDeCorrecao" NOT NULL,
    "errado" TEXT,
    "certo" TEXT NOT NULL,
    "explicacao" TEXT,
    "promptNome" TEXT,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "origem" "OrigemDaCorrecao" NOT NULL,
    "produtoSku" TEXT,
    "usos" INTEGER NOT NULL DEFAULT 0,
    "criadoPor" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorrecaoDaDescricao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CorrecaoDaDescricao_ativa_promptNome_idx" ON "CorrecaoDaDescricao"("ativa", "promptNome");
