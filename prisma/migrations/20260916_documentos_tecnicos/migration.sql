-- Manual e ficha tecnica viram um tipo so, DOCUMENTO ("Documentos tecnicos"),
-- pedido do dono em 16/09/2026. Nenhum arquivo desses dois tipos existia.
-- O Postgres nao remove valor de enum: o tipo e recriado.
ALTER TYPE "TipoArquivo" RENAME TO "TipoArquivo_antigo";
CREATE TYPE "TipoArquivo" AS ENUM ('IMAGEM', 'DOCUMENTO', 'CERTIFICADO');

ALTER TABLE "ProdutoArquivo" ALTER COLUMN "tipo" DROP DEFAULT;
ALTER TABLE "ProdutoArquivo" ALTER COLUMN "tipo" TYPE "TipoArquivo"
  USING (
    CASE "tipo"::text
      WHEN 'MANUAL' THEN 'DOCUMENTO'
      WHEN 'FICHA_TECNICA' THEN 'DOCUMENTO'
      ELSE "tipo"::text
    END
  )::"TipoArquivo";
ALTER TABLE "ProdutoArquivo" ALTER COLUMN "tipo" SET DEFAULT 'IMAGEM';

DROP TYPE "TipoArquivo_antigo";
