-- Os padroes de proposta saem (24/11/2026): as condicoes ja foram copiadas para os clientes e as caixas do PDF para as
-- propostas na migration 20261124_condicoes_do_cliente, que roda antes desta no mesmo deploy.

ALTER TABLE "Cliente" DROP CONSTRAINT IF EXISTS "Cliente_padraoPropostaId_fkey";
ALTER TABLE "PropostaParaCliente" DROP CONSTRAINT IF EXISTS "PropostaParaCliente_padraoId_fkey";

ALTER TABLE "Cliente" DROP COLUMN "padraoPropostaId";
ALTER TABLE "PropostaParaCliente" DROP COLUMN "padraoId";

DROP TABLE "PadraoDeProposta";
