-- Site e WhatsApp tecnico da 4hobby (pedido do dono em 13/11/2026, cabecalho do PDF da proposta). Ja preenchidos com o
-- que o dono passou; o `celular` (WhatsApp comercial) so ganha o numero se estiver vazio.
ALTER TABLE "DadosDaEmpresa" ADD COLUMN "whatsappTecnico" TEXT;
ALTER TABLE "DadosDaEmpresa" ADD COLUMN "site" TEXT;

UPDATE "DadosDaEmpresa" SET "whatsappTecnico" = '54996050390', "site" = 'www.4hobby.com.br', "celular" = COALESCE("celular", '54981222300');
