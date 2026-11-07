-- Dados da empresa: inscricao municipal e celular/WhatsApp (pedido do dono em 07/11/2026, com os valores ditados).
ALTER TABLE "DadosDaEmpresa" ADD COLUMN "inscricaoMunicipal" TEXT;
ALTER TABLE "DadosDaEmpresa" ADD COLUMN "celular" TEXT;
UPDATE "DadosDaEmpresa" SET "inscricaoMunicipal" = '169824', "celular" = '54981222300' WHERE "id" = 'empresa';
