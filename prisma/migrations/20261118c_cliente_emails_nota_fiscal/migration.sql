-- E-mails do cliente para receber a nota fiscal eletronica (pedido do dono em 18/11/2026, a FUNPEC manda quatro e-mails
-- do almoxarifado). Aditiva: coluna nova com valor padrao nao quebra o client antigo.

-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "emailsNotaFiscal" TEXT[] DEFAULT ARRAY[]::TEXT[];
