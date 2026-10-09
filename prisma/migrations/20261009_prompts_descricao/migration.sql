-- Biblioteca de prompts da janela "Criar descricao" (pedido do dono em 09/10/2026).

-- CreateTable
CREATE TABLE "PromptDescricao" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptDescricao_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PromptDescricao_nome_key" ON "PromptDescricao"("nome");

-- O prompt unico de antes (06/10/2026) morava na tabela do Nano Banana, na linha "descricao". Ele vira
-- "Meu prompt", ja escolhido ao abrir a janela, e a linha velha sai: nada mais a le.
INSERT INTO "PromptDescricao" ("id", "nome", "texto", "padrao", "criadoEm", "atualizadoEm")
SELECT gen_random_uuid()::text, 'Meu prompt', "texto", true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  FROM "PromptImagem"
 WHERE "modelo" = 'descricao';

DELETE FROM "PromptImagem" WHERE "modelo" = 'descricao';
