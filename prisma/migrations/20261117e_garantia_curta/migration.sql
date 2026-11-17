-- Garantia "direto e reto" (pedido do dono em 17/11/2026): so "90 dias" ou "6 meses". Troca o texto longo dos padroes
-- e das propostas gravadas; o PDF ja mostrava so o prazo (prazoDaGarantia), entao o cliente nao ve diferenca.
UPDATE "PadraoDeProposta" SET "garantia" = '90 dias' WHERE "garantia" = 'Garantia de 90 dias contra defeito de fabricação.';
UPDATE "PropostaParaCliente" SET "garantia" = '90 dias' WHERE "garantia" = 'Garantia de 90 dias contra defeito de fabricação.';
