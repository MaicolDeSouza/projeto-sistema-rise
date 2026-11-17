-- Anexos da proposta separados (pedido do dono em 17/11/2026, card "Notas e anexos"): a OC do cliente e os gerais
-- (conversas, e-mails, a cotacao). Os que ja existiam eram a cotacao do cliente e ficam como gerais.
ALTER TABLE "AnexoDaProposta" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'GERAL';
