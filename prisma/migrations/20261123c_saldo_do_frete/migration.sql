-- Saldo do Melhor Envio (pedido do dono em 23/11/2026): limite do aviso no Telegram, senha da recarga (cifrada), o ultimo
-- saldo lido pelo worker e o historico das recargas geradas pelo Rise.
ALTER TABLE "ConfigDeFrete" ADD COLUMN "limiteDeSaldo" DECIMAL(12,2) NOT NULL DEFAULT 50,
ADD COLUMN "senhaDaRecarga" TEXT,
ADD COLUMN "saldoAtual" DECIMAL(12,2),
ADD COLUMN "saldoLidoEm" TIMESTAMP(3),
ADD COLUMN "saldoBaixoDesde" TIMESTAMP(3);

CREATE TABLE "RecargaDoFrete" (
    "id" TEXT NOT NULL,
    "valor" DECIMAL(12,2) NOT NULL,
    "forma" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "link" TEXT,
    "digitavel" TEXT,
    "idNoProvedor" TEXT,
    "pedidoPor" TEXT,
    "erro" TEXT,
    "resposta" JSONB,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecargaDoFrete_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RecargaDoFrete_criadoEm_idx" ON "RecargaDoFrete"("criadoEm");
