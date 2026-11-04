
-- CreateEnum
CREATE TYPE "StatusDoPedidoDeVenda" AS ENUM ('AGUARDANDO_PAGAMENTO', 'PAGO', 'AGUARDANDO_PECAS', 'EM_SEPARACAO', 'ENVIADO', 'ENTREGUE', 'FINALIZADO', 'CANCELADO', 'DEVOLVIDO');

-- CreateEnum
CREATE TYPE "StatusDoEnvio" AS ENUM ('SEM_ENVIO', 'A_POSTAR', 'POSTADO', 'EM_TRANSITO', 'ENTREGUE', 'NAO_ENTREGUE', 'DEVOLVIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "NivelDoCliente" AS ENUM ('BRONZE', 'PRATA', 'OURO', 'PLATINUM');

-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "nivel" "NivelDoCliente";

-- AlterTable
ALTER TABLE "ConfigCanal" ADD COLUMN     "taxas" JSONB;

-- CreateTable
CREATE TABLE "PedidoDeVenda" (
    "id" TEXT NOT NULL,
    "canal" "Canal" NOT NULL,
    "origem" "Canal" NOT NULL,
    "idExterno" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "blingPedidoId" TEXT,
    "blingNumero" TEXT,
    "packId" TEXT,
    "dataDaVenda" TIMESTAMP(3) NOT NULL,
    "atualizadoNaOrigemEm" TIMESTAMP(3) NOT NULL,
    "clienteId" TEXT,
    "nomeDoComprador" TEXT,
    "documentoDoComprador" TEXT,
    "emailDoComprador" TEXT,
    "telefoneDoComprador" TEXT,
    "enderecoDeEntrega" JSONB NOT NULL,
    "status" "StatusDoPedidoDeVenda" NOT NULL,
    "statusDaOrigem" TEXT NOT NULL,
    "statusDaOrigemDetalhe" TEXT,
    "emSeparacao" BOOLEAN NOT NULL DEFAULT false,
    "pagamento" JSONB NOT NULL,
    "envio" JSONB NOT NULL,
    "statusDoEnvio" "StatusDoEnvio" NOT NULL DEFAULT 'SEM_ENVIO',
    "totalProdutos" DECIMAL(12,2) NOT NULL,
    "desconto" DECIMAL(12,2) NOT NULL,
    "freteCobrado" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "estimativa" JSONB,
    "real" JSONB,
    "lucroEstimado" DECIMAL(12,2),
    "lucroReal" DECIMAL(12,2),
    "lucroFechado" BOOLEAN NOT NULL DEFAULT false,
    "custoDoFreteManual" DECIMAL(12,2),
    "nf" JSONB,
    "pecas" JSONB,
    "avisos" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "historico" JSONB NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PedidoDeVenda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDoPedidoDeVenda" (
    "id" TEXT NOT NULL,
    "pedidoId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "produtoId" TEXT,
    "anuncioId" TEXT,
    "codigoNaOrigem" TEXT,
    "idNaOrigem" TEXT,
    "titulo" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "precoUnitario" DECIMAL(12,2) NOT NULL,
    "desconto" DECIMAL(12,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "comissao" DECIMAL(12,2),
    "custoUnitarioCongelado" DECIMAL(12,2),
    "custoOrigem" TEXT,
    "conferido" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ItemDoPedidoDeVenda_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PedidoDeVenda_status_idx" ON "PedidoDeVenda"("status");

-- CreateIndex
CREATE INDEX "PedidoDeVenda_dataDaVenda_idx" ON "PedidoDeVenda"("dataDaVenda");

-- CreateIndex
CREATE INDEX "PedidoDeVenda_clienteId_idx" ON "PedidoDeVenda"("clienteId");

-- CreateIndex
CREATE INDEX "PedidoDeVenda_canal_status_idx" ON "PedidoDeVenda"("canal", "status");

-- CreateIndex
CREATE INDEX "PedidoDeVenda_packId_idx" ON "PedidoDeVenda"("packId");

-- CreateIndex
CREATE UNIQUE INDEX "PedidoDeVenda_origem_idExterno_key" ON "PedidoDeVenda"("origem", "idExterno");

-- CreateIndex
CREATE INDEX "ItemDoPedidoDeVenda_pedidoId_idx" ON "ItemDoPedidoDeVenda"("pedidoId");

-- CreateIndex
CREATE INDEX "ItemDoPedidoDeVenda_produtoId_idx" ON "ItemDoPedidoDeVenda"("produtoId");

-- AddForeignKey
ALTER TABLE "PedidoDeVenda" ADD CONSTRAINT "PedidoDeVenda_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDoPedidoDeVenda" ADD CONSTRAINT "ItemDoPedidoDeVenda_pedidoId_fkey" FOREIGN KEY ("pedidoId") REFERENCES "PedidoDeVenda"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDoPedidoDeVenda" ADD CONSTRAINT "ItemDoPedidoDeVenda_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE SET NULL ON UPDATE CASCADE;

