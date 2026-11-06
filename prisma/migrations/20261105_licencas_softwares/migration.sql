-- Licencas Softwares (spec 2026-11-05-licencas-softwares-design.md, 05/11/2026): os programas vendidos (LightBurn, Mach3),
-- as licencas de cada um, as vagas entregues aos clientes, os PCs ativados que a extensao "Rise LightBurn" le do portal,
-- o arquivo de licenca do Mach3 com versoes (Bytes no banco: vai no dump diario) e o registro de cada leitura do portal.
-- Aditiva: nenhuma tabela existente muda; Servico ganha LIGHTBURN (o hash da chave da extensao, como ALIEXPRESS).

-- CreateEnum
CREATE TYPE "IdentificacaoDaLicenca" AS ENUM ('CHAVE', 'ARQUIVO');

-- CreateEnum
CREATE TYPE "SituacaoDaLinhaDeLicenca" AS ENUM ('ATIVA', 'ENCERRADA');

-- CreateEnum
CREATE TYPE "CanalDaLicenca" AS ENUM ('MERCADO_LIVRE', 'LOJA_INTEGRADA', 'SHOPEE', 'DIRETA');

-- AlterEnum
ALTER TYPE "Servico" ADD VALUE 'LIGHTBURN';

-- CreateTable
CREATE TABLE "Software" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "identificacao" "IdentificacaoDaLicenca" NOT NULL,
    "temPortal" BOOLEAN NOT NULL DEFAULT false,
    "ativacoesPermitidas" INTEGER,
    "linhasIniciais" INTEGER NOT NULL DEFAULT 1,
    "linkPortal" TEXT,
    "linkSite" TEXT,
    "instrucoesNome" TEXT,
    "instrucoesBytes" BYTEA,
    "instrucoesTipo" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Software_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Licenca" (
    "id" TEXT NOT NULL,
    "softwareId" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "tipo" TEXT,
    "compradaEm" DATE,
    "renovadaEm" DATE,
    "observacoes" TEXT,
    "origem" TEXT NOT NULL,
    "arquivada" BOOLEAN NOT NULL DEFAULT false,
    "portalId" TEXT,
    "portalSituacao" TEXT,
    "portalExpiraEm" TIMESTAMP(3),
    "portalCriadaEm" TIMESTAMP(3),
    "portalAtivacoesUsadas" INTEGER,
    "portalAtivacoesPermitidas" INTEGER,
    "portalDados" JSONB,
    "portalLidoEm" TIMESTAMP(3),
    "portalSumiuEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Licenca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinhaDeLicenca" (
    "id" TEXT NOT NULL,
    "licencaId" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "clienteId" TEXT,
    "nomeAnotado" TEXT,
    "data" DATE,
    "canal" "CanalDaLicenca",
    "pedidoDeVendaId" TEXT,
    "nomeDoPc" TEXT,
    "equipamento" TEXT,
    "observacoes" TEXT,
    "situacao" "SituacaoDaLinhaDeLicenca" NOT NULL DEFAULT 'ATIVA',
    "encerradaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinhaDeLicenca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtivacaoDeLicenca" (
    "id" TEXT NOT NULL,
    "licencaId" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "so" TEXT,
    "criadaEm" TIMESTAMP(3),
    "ultimaSincronizacaoEm" TIMESTAMP(3),
    "leaseExpiraEm" TIMESTAMP(3),
    "dados" JSONB,
    "vistaEm" TIMESTAMP(3) NOT NULL,
    "sumiuEm" TIMESTAMP(3),

    CONSTRAINT "AtivacaoDeLicenca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArquivoDeLicenca" (
    "id" TEXT NOT NULL,
    "licencaId" TEXT NOT NULL,
    "versao" INTEGER NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "tamanhoBytes" INTEGER NOT NULL,
    "mimeType" TEXT,
    "atual" BOOLEAN NOT NULL DEFAULT true,
    "enviadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviadoPor" TEXT,
    "observacao" TEXT,

    CONSTRAINT "ArquivoDeLicenca_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeituraDoPortal" (
    "id" TEXT NOT NULL,
    "softwareId" TEXT NOT NULL,
    "lidaEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "licencas" INTEGER NOT NULL,
    "ativacoes" INTEGER NOT NULL,
    "novas" INTEGER NOT NULL,
    "alteradas" INTEGER NOT NULL,
    "sumiram" INTEGER NOT NULL,
    "completa" BOOLEAN NOT NULL DEFAULT true,
    "erro" TEXT,
    "versaoDaExtensao" TEXT,

    CONSTRAINT "LeituraDoPortal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Software_nome_key" ON "Software"("nome");

-- CreateIndex
CREATE UNIQUE INDEX "Software_slug_key" ON "Software"("slug");

-- CreateIndex
CREATE INDEX "Licenca_softwareId_arquivada_idx" ON "Licenca"("softwareId", "arquivada");

-- CreateIndex
CREATE UNIQUE INDEX "Licenca_softwareId_identificador_key" ON "Licenca"("softwareId", "identificador");

-- CreateIndex
CREATE INDEX "LinhaDeLicenca_licencaId_idx" ON "LinhaDeLicenca"("licencaId");

-- CreateIndex
CREATE INDEX "LinhaDeLicenca_clienteId_idx" ON "LinhaDeLicenca"("clienteId");

-- CreateIndex
CREATE INDEX "LinhaDeLicenca_pedidoDeVendaId_idx" ON "LinhaDeLicenca"("pedidoDeVendaId");

-- CreateIndex
CREATE INDEX "AtivacaoDeLicenca_licencaId_sumiuEm_idx" ON "AtivacaoDeLicenca"("licencaId", "sumiuEm");

-- CreateIndex
CREATE UNIQUE INDEX "AtivacaoDeLicenca_licencaId_chave_key" ON "AtivacaoDeLicenca"("licencaId", "chave");

-- CreateIndex
CREATE UNIQUE INDEX "ArquivoDeLicenca_licencaId_versao_key" ON "ArquivoDeLicenca"("licencaId", "versao");

-- CreateIndex
CREATE INDEX "LeituraDoPortal_softwareId_lidaEm_idx" ON "LeituraDoPortal"("softwareId", "lidaEm");

-- AddForeignKey
ALTER TABLE "Licenca" ADD CONSTRAINT "Licenca_softwareId_fkey" FOREIGN KEY ("softwareId") REFERENCES "Software"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaDeLicenca" ADD CONSTRAINT "LinhaDeLicenca_licencaId_fkey" FOREIGN KEY ("licencaId") REFERENCES "Licenca"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaDeLicenca" ADD CONSTRAINT "LinhaDeLicenca_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinhaDeLicenca" ADD CONSTRAINT "LinhaDeLicenca_pedidoDeVendaId_fkey" FOREIGN KEY ("pedidoDeVendaId") REFERENCES "PedidoDeVenda"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtivacaoDeLicenca" ADD CONSTRAINT "AtivacaoDeLicenca_licencaId_fkey" FOREIGN KEY ("licencaId") REFERENCES "Licenca"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArquivoDeLicenca" ADD CONSTRAINT "ArquivoDeLicenca_licencaId_fkey" FOREIGN KEY ("licencaId") REFERENCES "Licenca"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeituraDoPortal" ADD CONSTRAINT "LeituraDoPortal_softwareId_fkey" FOREIGN KEY ("softwareId") REFERENCES "Software"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Programas semeados (spec 6.2), com id fixo e legivel. O linkSite do LightBurn e o site oficial: o link de compra com
-- cupom fica para o dono colar no cadastro do programa (a aba da planilha que o guarda tem a senha do portal).
INSERT INTO "Software" ("id", "nome", "slug", "identificacao", "temPortal", "ativacoesPermitidas", "linhasIniciais", "linkPortal", "linkSite", "ordem", "ativo", "criadoEm", "atualizadoEm")
VALUES ('lightburn', 'LightBurn', 'lightburn', 'CHAVE', true, 3, 3, 'https://lightburn.customer.cryptlex.com/licenses', 'https://lightburnsoftware.com/', 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
INSERT INTO "Software" ("id", "nome", "slug", "identificacao", "temPortal", "ativacoesPermitidas", "linhasIniciais", "linkPortal", "linkSite", "ordem", "ativo", "criadoEm", "atualizadoEm")
VALUES ('mach3', 'Mach3', 'mach3', 'ARQUIVO', false, NULL, 1, NULL, 'https://www.machsupport.com/software/downloads-updates/', 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
