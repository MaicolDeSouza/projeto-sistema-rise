-- Rise AI, Entrega C1: o codigo de vinculo do Telegram no usuario e a tabela dos avisos mandados.
-- Os DROP INDEX que o diff propoe (indices que so existem no SQL) foram tirados.
-- AlterTable
ALTER TABLE "UsuarioRise" ADD COLUMN     "codigoDeVinculoExpiraEm" TIMESTAMP(3),
ADD COLUMN     "codigoDeVinculoHash" TEXT;

-- CreateTable
CREATE TABLE "AvisoTelegram" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoEm" TIMESTAMP(3),
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "erro" TEXT,

    CONSTRAINT "AvisoTelegram_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AvisoTelegram_chave_key" ON "AvisoTelegram"("chave");

-- CreateIndex
CREATE INDEX "AvisoTelegram_enviadoEm_criadoEm_idx" ON "AvisoTelegram"("enviadoEm", "criadoEm");

