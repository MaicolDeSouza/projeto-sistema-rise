-- Modulo de frete, fase 1 (spec 2026-11-18-modulo-de-frete-design.md): caixas de envio, configuracao, o Envio e a
-- cotacao gravada na proposta. Os DROP INDEX que o migrate diff propos (indices de trigramas feitos a mao) foram tirados.

-- CreateEnum
CREATE TYPE "DirecaoDoEnvio" AS ENUM ('IDA', 'REVERSO');

-- CreateEnum
CREATE TYPE "ProvedorDeFrete" AS ENUM ('MELHOR_ENVIO');

-- CreateEnum
CREATE TYPE "StatusDoEnvioRise" AS ENUM ('RASCUNHO', 'A_POSTAR', 'POSTADO', 'ENTREGUE', 'NAO_ENTREGUE', 'COM_PROBLEMA', 'CANCELADO', 'EXPIRADO');

-- AlterEnum
ALTER TYPE "Servico" ADD VALUE 'MELHOR_ENVIO';

-- AlterTable
ALTER TABLE "PropostaParaCliente" ADD COLUMN     "cotacaoDoFrete" JSONB;

-- CreateTable
CREATE TABLE "CaixaDeEnvio" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "comprimentoCm" DECIMAL(10,2) NOT NULL,
    "larguraCm" DECIMAL(10,2) NOT NULL,
    "alturaCm" DECIMAL(10,2) NOT NULL,
    "comprimentoInternoCm" DECIMAL(10,2),
    "larguraInternaCm" DECIMAL(10,2),
    "alturaInternaCm" DECIMAL(10,2),
    "pesoVazioKg" DECIMAL(10,3) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaixaDeEnvio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfigDeFrete" (
    "id" TEXT NOT NULL,
    "acrescimoDeEmbalagem" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "percentualDePesoExtra" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "momentoDoAviso" TEXT NOT NULL DEFAULT 'POSTADO',
    "assuntoDoEmail" TEXT,
    "textoDoEmail" TEXT,
    "textoDoWhatsapp" TEXT,
    "formatoDeImpressao" TEXT,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConfigDeFrete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Envio" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "direcao" "DirecaoDoEnvio" NOT NULL DEFAULT 'IDA',
    "provedor" "ProvedorDeFrete" NOT NULL DEFAULT 'MELHOR_ENVIO',
    "status" "StatusDoEnvioRise" NOT NULL DEFAULT 'RASCUNHO',
    "pedidoDeVendaId" TEXT,
    "propostaId" TEXT,
    "pedidoDeCompraId" TEXT,
    "remetente" JSONB NOT NULL,
    "destinatario" JSONB NOT NULL,
    "caixaDeEnvioId" TEXT,
    "comprimentoCm" DECIMAL(10,2) NOT NULL,
    "larguraCm" DECIMAL(10,2) NOT NULL,
    "alturaCm" DECIMAL(10,2) NOT NULL,
    "pesoKg" DECIMAL(10,3) NOT NULL,
    "valorDeclarado" DECIMAL(12,2) NOT NULL,
    "medidaConferida" BOOLEAN NOT NULL DEFAULT false,
    "tipoDeDocumento" TEXT,
    "chaveNfe" TEXT,
    "itensDaDeclaracao" JSONB,
    "servicoId" TEXT,
    "servicoNome" TEXT,
    "transportadoraNome" TEXT,
    "prazoDias" INTEGER,
    "precoCotado" DECIMAL(12,2),
    "cotadoEm" TIMESTAMP(3),
    "idNoProvedor" TEXT,
    "protocolo" TEXT,
    "custo" DECIMAL(12,2),
    "compradoEm" TIMESTAMP(3),
    "compradoPor" TEXT,
    "rastreio" TEXT,
    "linkDoRastreio" TEXT,
    "validoAte" TIMESTAMP(3),
    "postadoEm" TIMESTAMP(3),
    "entregueEm" TIMESTAMP(3),
    "canceladoEm" TIMESTAMP(3),
    "eventos" JSONB,
    "ultimaConsultaEm" TIMESTAMP(3),
    "ultimoErro" TEXT,
    "avisoEmailEm" TIMESTAMP(3),
    "avisoEmailErro" TEXT,
    "avisoWhatsappEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Envio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaixaDeEnvio_nome_key" ON "CaixaDeEnvio"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Envio_numero_key" ON "Envio"("numero");

-- CreateIndex
CREATE INDEX "Envio_status_idx" ON "Envio"("status");

-- CreateIndex
CREATE INDEX "Envio_pedidoDeVendaId_idx" ON "Envio"("pedidoDeVendaId");

-- CreateIndex
CREATE INDEX "Envio_propostaId_idx" ON "Envio"("propostaId");

-- CreateIndex
CREATE INDEX "Envio_pedidoDeCompraId_idx" ON "Envio"("pedidoDeCompraId");

-- CreateIndex
CREATE INDEX "Envio_caixaDeEnvioId_idx" ON "Envio"("caixaDeEnvioId");

-- AddForeignKey
ALTER TABLE "Envio" ADD CONSTRAINT "Envio_pedidoDeVendaId_fkey" FOREIGN KEY ("pedidoDeVendaId") REFERENCES "PedidoDeVenda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envio" ADD CONSTRAINT "Envio_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "PropostaParaCliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envio" ADD CONSTRAINT "Envio_pedidoDeCompraId_fkey" FOREIGN KEY ("pedidoDeCompraId") REFERENCES "PedidoDeCompra"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envio" ADD CONSTRAINT "Envio_caixaDeEnvioId_fkey" FOREIGN KEY ("caixaDeEnvioId") REFERENCES "CaixaDeEnvio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Semeadura (modulo de frete, 18/11/2026): as tres caixas do dono, com o peso vazio ESTIMADO ate ele pesar, e a
-- configuracao padrao (R$ 1,00 de embalagem, 10% de peso extra). ON CONFLICT: rodar de novo nao duplica nem desfaz
-- o que o dono mudou na tela.
INSERT INTO "CaixaDeEnvio" ("id", "nome", "comprimentoCm", "larguraCm", "alturaCm", "pesoVazioKg", "ativo", "criadoEm", "atualizadoEm") VALUES
  ('cxenvio16x11x3', 'CX 16x11x3', 16, 11, 3, 0.035, true, NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'),
  ('cxenvio16x11x6', 'CX 16x11x6', 16, 11, 6, 0.045, true, NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC'),
  ('cxenvio19x12x12', 'CX 19x12x12', 19, 12, 12, 0.070, true, NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC')
ON CONFLICT ("nome") DO NOTHING;

INSERT INTO "ConfigDeFrete" ("id", "acrescimoDeEmbalagem", "percentualDePesoExtra", "momentoDoAviso", "atualizadoEm")
VALUES ('frete', 1, 10, 'POSTADO', NOW() AT TIME ZONE 'UTC')
ON CONFLICT ("id") DO NOTHING;
