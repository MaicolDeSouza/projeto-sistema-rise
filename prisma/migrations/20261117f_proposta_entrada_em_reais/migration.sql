-- A entrada do pagamento em R$ ou em % (pedido do dono em 17/11/2026). As propostas que ja existem ficam em %.
ALTER TABLE "PropostaParaCliente" ADD COLUMN "entradaTipo" TEXT NOT NULL DEFAULT 'PERCENTUAL', ADD COLUMN "entradaValor" DECIMAL(12,2) NOT NULL DEFAULT 0;
