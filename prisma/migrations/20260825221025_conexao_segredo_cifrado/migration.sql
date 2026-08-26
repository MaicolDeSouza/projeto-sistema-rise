/*
  Warnings:

  - You are about to drop the column `accessTokenCifrado` on the `Conexao` table. All the data in the column will be lost.
  - You are about to drop the column `refreshTokenCifrado` on the `Conexao` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "StatusConexao" AS ENUM ('NAO_CONFIGURADO', 'CONECTADO', 'EXPIRADO', 'ERRO');

-- AlterTable
ALTER TABLE "Conexao" DROP COLUMN "accessTokenCifrado",
DROP COLUMN "refreshTokenCifrado",
ADD COLUMN     "escopos" TEXT,
ADD COLUMN     "segredoCifrado" TEXT,
ADD COLUMN     "status" "StatusConexao" NOT NULL DEFAULT 'NAO_CONFIGURADO',
ADD COLUMN     "ultimoErro" TEXT,
ADD COLUMN     "ultimoTesteEm" TIMESTAMP(3),
ADD COLUMN     "ultimoTesteOk" BOOLEAN;
