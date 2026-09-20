-- Transportadora em abas (Dados cadastrais, Endereco, Contato): nome fantasia, IE,
-- modalidade, link de rastreamento, endereco, listas de telefone e e-mail e as
-- pessoas de contato.
--
-- Aditiva de proposito: `contato` e `prazoEntregaDias` ficam na tabela, sem uso. A
-- outra frente usa o mesmo banco com o client antigo, e apagar a coluna quebraria o
-- salvar dela.
--
-- O `migrate diff` propos tambem DROP INDEX de ProdutoColetado_buscaTexto_trgm e
-- ProdutoColetado_coletadoEm_idx, que so existem no SQL. Ficaram de fora: apagar o
-- de trigramas leva a busca de Mercados de 15 ms para 600 ms.

-- CreateEnum
CREATE TYPE "ModalidadeTransporte" AS ENUM ('CORREIOS', 'RODOVIARIA', 'ENTREGA_LOCAL', 'OUTRA');

-- AlterTable
ALTER TABLE "Transportadora" ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "cidade" TEXT,
ADD COLUMN     "complemento" TEXT,
ADD COLUMN     "emailsAdicionais" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "ieIsento" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "inscricaoEstadual" TEXT,
ADD COLUMN     "logradouro" TEXT,
ADD COLUMN     "modalidade" "ModalidadeTransporte",
ADD COLUMN     "nomeFantasia" TEXT,
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "telefonesAdicionais" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "uf" TEXT,
ADD COLUMN     "urlRastreamento" TEXT;

-- CreateTable
CREATE TABLE "TransportadoraContato" (
    "id" TEXT NOT NULL,
    "transportadoraId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransportadoraContato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TransportadoraContato_transportadoraId_idx" ON "TransportadoraContato"("transportadoraId");

-- AddForeignKey
ALTER TABLE "TransportadoraContato" ADD CONSTRAINT "TransportadoraContato_transportadoraId_fkey" FOREIGN KEY ("transportadoraId") REFERENCES "Transportadora"("id") ON DELETE CASCADE ON UPDATE CASCADE;
