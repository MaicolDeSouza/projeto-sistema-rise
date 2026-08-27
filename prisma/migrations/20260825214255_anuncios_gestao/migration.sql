-- CreateEnum
CREATE TYPE "SituacaoCanal" AS ENUM ('ATIVA', 'PAUSADA', 'ENCERRADA', 'DESCONHECIDA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Canal" ADD VALUE 'BLING';
ALTER TYPE "Canal" ADD VALUE 'SHOPEE';

-- AlterEnum
BEGIN;
CREATE TYPE "StatusAnuncio_new" AS ENUM ('RASCUNHO', 'VALIDADO', 'PUBLICANDO', 'PUBLICADO', 'ERRO');
ALTER TABLE "public"."Anuncio" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Anuncio" ALTER COLUMN "status" TYPE "StatusAnuncio_new" USING ("status"::text::"StatusAnuncio_new");
ALTER TYPE "StatusAnuncio" RENAME TO "StatusAnuncio_old";
ALTER TYPE "StatusAnuncio_new" RENAME TO "StatusAnuncio";
DROP TYPE "public"."StatusAnuncio_old";
ALTER TABLE "Anuncio" ALTER COLUMN "status" SET DEFAULT 'RASCUNHO';
COMMIT;

-- AlterTable
ALTER TABLE "Anuncio" ADD COLUMN     "hashConteudo" TEXT,
ADD COLUMN     "payloadEnviado" JSONB,
ADD COLUMN     "sincronizadoEm" TIMESTAMP(3),
ADD COLUMN     "situacaoCanal" "SituacaoCanal" NOT NULL DEFAULT 'DESCONHECIDA',
ADD COLUMN     "temVendas" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LogIntegracao" ADD COLUMN     "anuncioId" TEXT;

-- CreateIndex
CREATE INDEX "LogIntegracao_anuncioId_idx" ON "LogIntegracao"("anuncioId");

-- AddForeignKey
ALTER TABLE "LogIntegracao" ADD CONSTRAINT "LogIntegracao_anuncioId_fkey" FOREIGN KEY ("anuncioId") REFERENCES "Anuncio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
