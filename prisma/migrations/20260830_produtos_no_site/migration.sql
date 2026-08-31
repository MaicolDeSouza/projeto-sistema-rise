-- AlterTable
ALTER TABLE "FonteColeta" ADD COLUMN     "produtosNoSite" INTEGER,
ADD COLUMN     "produtosNoSiteParcial" BOOLEAN NOT NULL DEFAULT false;
