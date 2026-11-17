-- Dados bancarios da 4hobby na proposta para cliente (pedido do dono em 17/11/2026). Vazios: o dono preenche na tela.
ALTER TABLE "DadosDaEmpresa" ADD COLUMN "bancoNome" TEXT;
ALTER TABLE "DadosDaEmpresa" ADD COLUMN "bancoCodigo" TEXT;
ALTER TABLE "DadosDaEmpresa" ADD COLUMN "agencia" TEXT;
ALTER TABLE "DadosDaEmpresa" ADD COLUMN "conta" TEXT;
ALTER TABLE "DadosDaEmpresa" ADD COLUMN "chavePix" TEXT;
