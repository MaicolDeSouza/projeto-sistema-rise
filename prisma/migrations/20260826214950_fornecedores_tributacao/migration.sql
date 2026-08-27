-- AlterTable
ALTER TABLE "Produto" ADD COLUMN     "cest" TEXT,
ADD COLUMN     "estoqueMaximo" INTEGER,
ADD COLUMN     "estoqueMinimo" INTEGER,
ADD COLUMN     "ncm" TEXT,
ADD COLUMN     "origem" INTEGER,
ADD COLUMN     "percentualTributos" DECIMAL(5,2),
ADD COLUMN     "spedTipoItem" TEXT,
ADD COLUMN     "urlLojaIntegrada" TEXT;

-- AlterTable
ALTER TABLE "ProdutoArquivo" ADD COLUMN     "principal" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Fornecedor" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProdutoFornecedor" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "fornecedorId" TEXT NOT NULL,
    "descricao" TEXT,
    "codigo" TEXT,
    "precoCusto" DECIMAL(12,2),
    "link" TEXT,
    "padrao" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProdutoFornecedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Fornecedor_nome_key" ON "Fornecedor"("nome");

-- CreateIndex
CREATE INDEX "ProdutoFornecedor_fornecedorId_idx" ON "ProdutoFornecedor"("fornecedorId");

-- CreateIndex
CREATE UNIQUE INDEX "ProdutoFornecedor_produtoId_fornecedorId_key" ON "ProdutoFornecedor"("produtoId", "fornecedorId");

-- AddForeignKey
ALTER TABLE "ProdutoFornecedor" ADD CONSTRAINT "ProdutoFornecedor_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProdutoFornecedor" ADD CONSTRAINT "ProdutoFornecedor_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- A principal era, por convencao, a imagem de ordem 0. Preserva a escolha atual.
UPDATE "ProdutoArquivo" SET "principal" = true WHERE "tipo" = 'IMAGEM' AND "ordem" = 0;
