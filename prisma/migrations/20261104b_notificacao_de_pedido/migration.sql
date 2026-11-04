-- Fase 2 dos Pedidos de venda (spec 5.11): a fila das notificacoes dos canais (webhooks).
CREATE TABLE "NotificacaoDePedido" (
    "id" TEXT NOT NULL,
    "origem" "Canal" NOT NULL,
    "recurso" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "recebidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processadaEm" TIMESTAMP(3),
    "erro" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "NotificacaoDePedido_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotificacaoDePedido_processadaEm_idx" ON "NotificacaoDePedido"("processadaEm");

CREATE INDEX "NotificacaoDePedido_origem_recurso_idx" ON "NotificacaoDePedido"("origem", "recurso");
