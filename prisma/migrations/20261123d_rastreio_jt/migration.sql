-- Rastreio da J&T nos pedidos de compra pelo PacoteVicio (spec 2026-11-23-rastreio-jt-nas-compras-design.md).

-- AlterTable
ALTER TABLE "ConfigDeFrete" ADD COLUMN     "documentoRastreioJT" TEXT,
ADD COLUMN     "rastreioConsultasNoMes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "rastreioMes" TEXT;

-- CreateTable
CREATE TABLE "RastreioDaCompra" (
    "id" TEXT NOT NULL,
    "pedidoDeCompraId" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "situacao" TEXT,
    "situacaoEm" TIMESTAMP(3),
    "entregueEm" TIMESTAMP(3),
    "eventos" JSONB,
    "documento" TEXT,
    "lidoEm" TIMESTAMP(3),
    "proximaLeituraEm" TIMESTAMP(3),
    "erro" TEXT,
    "consultas" INTEGER NOT NULL DEFAULT 0,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RastreioDaCompra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RastreioDaCompra_pedidoDeCompraId_key" ON "RastreioDaCompra"("pedidoDeCompraId");

-- CreateIndex
CREATE INDEX "RastreioDaCompra_proximaLeituraEm_idx" ON "RastreioDaCompra"("proximaLeituraEm");

-- AddForeignKey
ALTER TABLE "RastreioDaCompra" ADD CONSTRAINT "RastreioDaCompra_pedidoDeCompraId_fkey" FOREIGN KEY ("pedidoDeCompraId") REFERENCES "PedidoDeCompra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
