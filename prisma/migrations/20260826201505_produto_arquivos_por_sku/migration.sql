-- Renomeia a tabela em vez de recriar: DROP + CREATE apagaria as linhas
-- existentes. O RENAME preserva dados, indices e a chave estrangeira.

CREATE TYPE "TipoArquivo" AS ENUM ('IMAGEM', 'MANUAL', 'FICHA_TECNICA', 'CERTIFICADO');

ALTER TABLE "ProdutoImagem" RENAME TO "ProdutoArquivo";

-- Toda linha existente e imagem.
ALTER TABLE "ProdutoArquivo" ADD COLUMN "tipo" "TipoArquivo" NOT NULL DEFAULT 'IMAGEM';
ALTER TABLE "ProdutoArquivo" ADD COLUMN "nomeOriginal" TEXT;
ALTER TABLE "ProdutoArquivo" ADD COLUMN "mimeType" TEXT;
ALTER TABLE "ProdutoArquivo" ADD COLUMN "tamanhoBytes" INTEGER;

-- O endereco deixa de ser gravado: passa a ser calculado a partir do SKU atual.
-- Linhas sem nome de arquivo em disco nao teriam como ser servidas.
DELETE FROM "ProdutoArquivo" WHERE "arquivo" IS NULL;
ALTER TABLE "ProdutoArquivo" ALTER COLUMN "arquivo" SET NOT NULL;
ALTER TABLE "ProdutoArquivo" DROP COLUMN "url";

ALTER INDEX "ProdutoImagem_pkey" RENAME TO "ProdutoArquivo_pkey";
DROP INDEX IF EXISTS "ProdutoImagem_produtoId_ordem_idx";
CREATE INDEX "ProdutoArquivo_produtoId_tipo_ordem_idx" ON "ProdutoArquivo"("produtoId", "tipo", "ordem");

ALTER TABLE "ProdutoArquivo" RENAME CONSTRAINT "ProdutoImagem_produtoId_fkey" TO "ProdutoArquivo_produtoId_fkey";

-- Campos novos do produto
ALTER TABLE "Produto" ADD COLUMN "unidade" TEXT DEFAULT 'UN';
ALTER TABLE "Produto" ADD COLUMN "numeroHomologacao" TEXT;
ALTER TABLE "Produto" ADD COLUMN "videoUrl" TEXT;
