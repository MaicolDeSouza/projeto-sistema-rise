-- O padrao de proposta pode ja marcar "Assinar digitalmente" (pedido do dono em 17/11/2026, padrao FUNPEC). Aditiva:
-- todos os padroes existentes ficam desmarcados.
ALTER TABLE "PadraoDeProposta" ADD COLUMN "assinarDigitalmente" BOOLEAN NOT NULL DEFAULT false;
