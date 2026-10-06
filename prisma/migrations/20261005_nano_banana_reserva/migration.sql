-- Nano Banana nas fotos do produto + reserva de imagens (05/10/2026).
-- Escrita a mao: so ADD/CREATE. Os indices que existem so no SQL (trigramas, coletadoEm, Anuncio_um_por_produto,
-- Job_fonte_aberta) ficam de fora de proposito, e a coluna ProdutoArquivo.finalizada (sem uso) NAO e removida:
-- o servidor da outra frente roda com o client antigo, que a lista em toda consulta.

-- Servico novo: as chamadas ao Google entram em LogIntegracao.
ALTER TYPE "Servico" ADD VALUE 'GEMINI';

-- FOTO vai para o carrossel e os anuncios; RESERVA fica guardada atras do botao "Reserva".
CREATE TYPE "PapelArquivo" AS ENUM ('FOTO', 'RESERVA');

ALTER TABLE "ProdutoArquivo"
  ADD COLUMN "papel" "PapelArquivo" NOT NULL DEFAULT 'FOTO',
  ADD COLUMN "versao" TEXT NOT NULL DEFAULT 'original',
  ADD COLUMN "grupo" TEXT;

-- Foto que ja existe e o proprio grupo dela (original, sem versao gerada).
UPDATE "ProdutoArquivo" SET "grupo" = "id" WHERE "tipo" = 'IMAGEM';

CREATE INDEX "ProdutoArquivo_produtoId_grupo_idx" ON "ProdutoArquivo"("produtoId", "grupo");

-- Um prompt salvo por modelo do Nano Banana (chave do MODELOS, nao o id do Google).
CREATE TABLE "PromptImagem" (
    "modelo" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromptImagem_pkey" PRIMARY KEY ("modelo")
);
