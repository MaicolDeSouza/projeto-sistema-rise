-- Cadastros: dados da empresa de fornecedores e concorrentes, e marcas.
--
-- Gerado por `prisma migrate diff` e editado a mao: o diff tambem propunha
-- DROP INDEX de "ProdutoColetado_buscaTexto_trgm" (pg_trgm) e de
-- "ProdutoColetado_coletadoEm_idx", que existem so no SQL e nao fazem parte
-- desta mudanca. Apaga-los deixaria a busca de Mercados de 15 ms para 600 ms.

-- AlterTable
ALTER TABLE "Fornecedor" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "cnpj" TEXT,
ADD COLUMN     "condicoesPagamento" TEXT,
ADD COLUMN     "contato" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "fonteId" TEXT,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "pedidoMinimo" DECIMAL(12,2),
ADD COLUMN     "prazoEntregaDias" INTEGER,
ADD COLUMN     "site" TEXT,
ADD COLUMN     "telefone" TEXT;

-- CreateTable
CREATE TABLE "Concorrente" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "site" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "fonteId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Concorrente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Marca" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "observacoes" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Marca_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Concorrente_nome_key" ON "Concorrente"("nome");

-- CreateIndex
CREATE INDEX "Concorrente_fonteId_idx" ON "Concorrente"("fonteId");

-- CreateIndex
CREATE UNIQUE INDEX "Marca_nome_key" ON "Marca"("nome");

-- CreateIndex
CREATE INDEX "Fornecedor_fonteId_idx" ON "Fornecedor"("fonteId");

-- AddForeignKey
ALTER TABLE "Fornecedor" ADD CONSTRAINT "Fornecedor_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteColeta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concorrente" ADD CONSTRAINT "Concorrente_fonteId_fkey" FOREIGN KEY ("fonteId") REFERENCES "FonteColeta"("id") ON DELETE SET NULL ON UPDATE CASCADE;

