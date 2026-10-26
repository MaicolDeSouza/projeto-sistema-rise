-- CreateEnum
CREATE TYPE "StatusDoPedidoDeCompra" AS ENUM ('RASCUNHO', 'ENVIADO', 'PARCIAL', 'FINALIZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "FormaDePagamentoDaCompra" AS ENUM ('PIX', 'BOLETO', 'CARTAO');

-- CreateEnum
CREATE TYPE "FretePorConta" AS ENUM ('CIF', 'FOB');

-- CreateEnum
CREATE TYPE "TipoDeDesconto" AS ENUM ('PERCENTUAL', 'VALOR');

-- CreateTable
CREATE TABLE "PedidoDeCompra" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "status" "StatusDoPedidoDeCompra" NOT NULL DEFAULT 'RASCUNHO',
    "fornecedorId" TEXT NOT NULL,
    "icmsSt" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "descontoTipo" "TipoDeDesconto",
    "descontoValor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "frete" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "formaPagamento" "FormaDePagamentoDaCompra",
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    "transportadoraId" TEXT,
    "transportadoraNome" TEXT,
    "fretePorConta" "FretePorConta" NOT NULL DEFAULT 'CIF',
    "rastreio" TEXT,
    "propostaNumero" TEXT,
    "propostaArquivo" TEXT,
    "propostaNomeOriginal" TEXT,
    "observacoes" TEXT,
    "enviadoEm" TIMESTAMP(3),
    "finalizadoEm" TIMESTAMP(3),
    "canceladoEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoDeCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDoPedidoDeCompra" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "vinculoId" TEXT,
    "nomeNoFornecedor" TEXT,
    "codigoNoFornecedor" TEXT,
    "link" TEXT,
    "quantidade" INTEGER NOT NULL,
    "precoUnitario" DECIMAL(12,4),
    "ipiPercentual" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "prazoDias" INTEGER,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "quantidadeLancada" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ItemDoPedidoDeCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LancamentoDoItemDeCompra" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "movimentoId" TEXT NOT NULL,
    "lancadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "desfeitoEm" TIMESTAMP(3),

    CONSTRAINT "LancamentoDoItemDeCompra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DadosDaEmpresa" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT NOT NULL,
    "inscricaoEstadual" TEXT,
    "endereco" TEXT NOT NULL,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "cep" TEXT NOT NULL,
    "telefone" TEXT,
    "email" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DadosDaEmpresa_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PedidoDeCompra_numero_key" ON "PedidoDeCompra"("numero");

-- CreateIndex
CREATE INDEX "PedidoDeCompra_status_idx" ON "PedidoDeCompra"("status");

-- CreateIndex
CREATE INDEX "PedidoDeCompra_fornecedorId_status_idx" ON "PedidoDeCompra"("fornecedorId", "status");

-- CreateIndex
CREATE INDEX "ItemDoPedidoDeCompra_produtoId_pedidoId_idx" ON "ItemDoPedidoDeCompra"("produtoId", "pedidoId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemDoPedidoDeCompra_pedidoId_produtoId_key" ON "ItemDoPedidoDeCompra"("pedidoId", "produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "LancamentoDoItemDeCompra_movimentoId_key" ON "LancamentoDoItemDeCompra"("movimentoId");

-- CreateIndex
CREATE INDEX "LancamentoDoItemDeCompra_itemId_idx" ON "LancamentoDoItemDeCompra"("itemId");

-- AddForeignKey
ALTER TABLE "PedidoDeCompra" ADD CONSTRAINT "PedidoDeCompra_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "Fornecedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PedidoDeCompra" ADD CONSTRAINT "PedidoDeCompra_transportadoraId_fkey" FOREIGN KEY ("transportadoraId") REFERENCES "Transportadora"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDoPedidoDeCompra" ADD CONSTRAINT "ItemDoPedidoDeCompra_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoDeCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDoPedidoDeCompra" ADD CONSTRAINT "ItemDoPedidoDeCompra_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LancamentoDoItemDeCompra" ADD CONSTRAINT "LancamentoDoItemDeCompra_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ItemDoPedidoDeCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Semente: os dados da 4hobby conforme a Receita (Google Docs do dono, 26/10/2026). Editaveis em Configuracoes.
INSERT INTO "DadosDaEmpresa" ("id", "razaoSocial", "nomeFantasia", "cnpj", "endereco", "numero", "bairro", "cidade", "uf", "cep", "telefone", "atualizadoEm")
VALUES ('empresa', 'Maicol de Souza', '4Hobby', '30.010.376/0001-48', 'Estrada Municipal Domingos Forner', '2135', 'Galópolis', 'Caxias do Sul', 'RS', '95090-970', '5432841632', NOW() AT TIME ZONE 'UTC')
ON CONFLICT ("id") DO NOTHING;
