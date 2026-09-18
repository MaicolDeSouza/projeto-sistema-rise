-- Clientes (pessoa fisica ou juridica), transportadoras e condicoes de
-- pagamento, mais o valor VIACEP em "Servico" (auditoria da consulta de CEP,
-- no molde de 20260916_servico_anthropic).
--
-- Gerado por `prisma migrate diff` e editado a mao: o diff tambem propunha
-- DROP INDEX de "ProdutoColetado_buscaTexto_trgm" (pg_trgm) e de
-- "ProdutoColetado_coletadoEm_idx", que existem so no SQL e nao fazem parte
-- desta mudanca. Apaga-los deixaria a busca de Mercados de 15 ms para 600 ms.

-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('FISICA', 'JURIDICA');

-- CreateEnum
CREATE TYPE "Sexo" AS ENUM ('MASCULINO', 'FEMININO');

-- CreateEnum
CREATE TYPE "TipoEndereco" AS ENUM ('GERAL', 'ENTREGA');

-- CreateEnum
CREATE TYPE "RegimeTributario" AS ENUM ('SIMPLES_NACIONAL', 'SIMPLES_EXCESSO_SUBLIMITE', 'REGIME_NORMAL');

-- AlterEnum
ALTER TYPE "Servico" ADD VALUE 'VIACEP';

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "tipoPessoa" "TipoPessoa" NOT NULL DEFAULT 'FISICA',
    "documento" TEXT,
    "clienteDesde" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sexo" "Sexo",
    "naturalidade" TEXT,
    "nomeFantasia" TEXT,
    "regimeTributario" "RegimeTributario",
    "inscricaoEstadual" TEXT,
    "ieIsento" BOOLEAN NOT NULL DEFAULT false,
    "inscricaoMunicipal" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "transportadoraId" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClienteEndereco" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" "TipoEndereco" NOT NULL,
    "cep" TEXT,
    "uf" TEXT,
    "cidade" TEXT,
    "bairro" TEXT,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClienteEndereco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClienteContato" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cargo" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClienteContato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transportadora" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cnpj" TEXT,
    "contato" TEXT,
    "telefone" TEXT,
    "email" TEXT,
    "site" TEXT,
    "prazoEntregaDias" INTEGER,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transportadora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CondicaoPagamento" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "observacoes" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CondicaoPagamento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_ClienteToCondicaoPagamento" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_ClienteToCondicaoPagamento_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_documento_key" ON "Cliente"("documento");

-- CreateIndex
CREATE INDEX "Cliente_transportadoraId_idx" ON "Cliente"("transportadoraId");

-- CreateIndex
CREATE UNIQUE INDEX "ClienteEndereco_clienteId_tipo_key" ON "ClienteEndereco"("clienteId", "tipo");

-- CreateIndex
CREATE INDEX "ClienteContato_clienteId_idx" ON "ClienteContato"("clienteId");

-- CreateIndex
CREATE UNIQUE INDEX "Transportadora_nome_key" ON "Transportadora"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "CondicaoPagamento_nome_key" ON "CondicaoPagamento"("nome");

-- CreateIndex
CREATE INDEX "_ClienteToCondicaoPagamento_B_index" ON "_ClienteToCondicaoPagamento"("B");

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_transportadoraId_fkey" FOREIGN KEY ("transportadoraId") REFERENCES "Transportadora"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteEndereco" ADD CONSTRAINT "ClienteEndereco_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClienteContato" ADD CONSTRAINT "ClienteContato_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClienteToCondicaoPagamento" ADD CONSTRAINT "_ClienteToCondicaoPagamento_A_fkey" FOREIGN KEY ("A") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ClienteToCondicaoPagamento" ADD CONSTRAINT "_ClienteToCondicaoPagamento_B_fkey" FOREIGN KEY ("B") REFERENCES "CondicaoPagamento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

