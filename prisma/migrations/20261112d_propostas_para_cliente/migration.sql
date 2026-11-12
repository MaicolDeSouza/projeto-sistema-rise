-- CreateEnum
CREATE TYPE "SituacaoDaProposta" AS ENUM ('RASCUNHO', 'ENVIADA', 'EM_NEGOCIACAO', 'APROVADA', 'RECUSADA', 'VENCIDA');

-- CreateEnum
CREATE TYPE "MotivoDeRecusa" AS ENUM ('PRECO', 'PRAZO', 'COMPROU_DE_OUTRO', 'DESISTIU', 'OUTRO');

-- CreateEnum
CREATE TYPE "FreteDaProposta" AS ENUM ('CIF', 'FOB', 'RETIRA', 'A_COMBINAR');

-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "blingContatoId" TEXT;

-- CreateTable
CREATE TABLE "PropostaParaCliente" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "situacao" "SituacaoDaProposta" NOT NULL DEFAULT 'RASCUNHO',
    "motivoRecusa" "MotivoDeRecusa",
    "motivoRecusaTexto" TEXT,
    "clienteId" TEXT,
    "clienteNome" TEXT NOT NULL,
    "clienteTelefone" TEXT,
    "clienteEmail" TEXT,
    "clienteDocumento" TEXT,
    "contatoId" TEXT,
    "contatoNome" TEXT,
    "condicaoPagamentoId" TEXT,
    "formaPagamento" TEXT,
    "parcelas" INTEGER NOT NULL DEFAULT 1,
    "entradaPercentual" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "pagamentoTexto" TEXT,
    "fretePorConta" "FreteDaProposta" NOT NULL DEFAULT 'A_COMBINAR',
    "transportadoraId" TEXT,
    "transportadoraNome" TEXT,
    "frete" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "prazoTransporteDias" INTEGER,
    "descontoTipo" "TipoDeDesconto",
    "descontoValor" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ocCliente" TEXT,
    "observacoesNf" TEXT,
    "observacoesCliente" TEXT,
    "garantia" TEXT,
    "observacoesInternas" TEXT,
    "validadeAte" DATE NOT NULL,
    "proximoContato" DATE,
    "enviadaEm" TIMESTAMP(3),
    "aprovadaEm" TIMESTAMP(3),
    "recusadaEm" TIMESTAMP(3),
    "vencidaEm" TIMESTAMP(3),
    "criadoPor" TEXT NOT NULL,
    "criadoPorNome" TEXT,
    "linkPublico" TEXT,
    "pedidoDeVendaBlingId" TEXT,
    "pedidoDeVendaEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropostaParaCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemDaPropostaParaCliente" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "produtoId" TEXT,
    "descricaoCliente" TEXT NOT NULL,
    "codigoCliente" TEXT,
    "codigoInterno" TEXT,
    "nomeInterno" TEXT,
    "foto" TEXT,
    "quantidade" DECIMAL(12,3) NOT NULL,
    "unidade" TEXT NOT NULL DEFAULT 'UN',
    "precoUnitario" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "descontoPercentual" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "prontaEntrega" BOOLEAN NOT NULL DEFAULT true,
    "prazoDiasUteis" INTEGER,
    "observacao" TEXT,
    "custoUnitario" DECIMAL(12,4),
    "ordem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ItemDaPropostaParaCliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContatoDaProposta" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "quem" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "proximoContato" DATE,

    CONSTRAINT "ContatoDaProposta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnexoDaProposta" (
    "id" TEXT NOT NULL,
    "propostaId" TEXT NOT NULL,
    "arquivo" TEXT NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnexoDaProposta_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PropostaParaCliente_numero_key" ON "PropostaParaCliente"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "PropostaParaCliente_linkPublico_key" ON "PropostaParaCliente"("linkPublico");

-- CreateIndex
CREATE INDEX "PropostaParaCliente_situacao_idx" ON "PropostaParaCliente"("situacao");

-- CreateIndex
CREATE INDEX "PropostaParaCliente_clienteId_idx" ON "PropostaParaCliente"("clienteId");

-- CreateIndex
CREATE INDEX "PropostaParaCliente_proximoContato_idx" ON "PropostaParaCliente"("proximoContato");

-- CreateIndex
CREATE INDEX "ItemDaPropostaParaCliente_propostaId_idx" ON "ItemDaPropostaParaCliente"("propostaId");

-- CreateIndex
CREATE INDEX "ItemDaPropostaParaCliente_produtoId_idx" ON "ItemDaPropostaParaCliente"("produtoId");

-- CreateIndex
CREATE INDEX "ContatoDaProposta_propostaId_idx" ON "ContatoDaProposta"("propostaId");

-- CreateIndex
CREATE INDEX "AnexoDaProposta_propostaId_idx" ON "AnexoDaProposta"("propostaId");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_blingContatoId_key" ON "Cliente"("blingContatoId");

-- AddForeignKey
ALTER TABLE "PropostaParaCliente" ADD CONSTRAINT "PropostaParaCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaParaCliente" ADD CONSTRAINT "PropostaParaCliente_contatoId_fkey" FOREIGN KEY ("contatoId") REFERENCES "ClienteContato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaParaCliente" ADD CONSTRAINT "PropostaParaCliente_condicaoPagamentoId_fkey" FOREIGN KEY ("condicaoPagamentoId") REFERENCES "CondicaoPagamento"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropostaParaCliente" ADD CONSTRAINT "PropostaParaCliente_transportadoraId_fkey" FOREIGN KEY ("transportadoraId") REFERENCES "Transportadora"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaPropostaParaCliente" ADD CONSTRAINT "ItemDaPropostaParaCliente_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "PropostaParaCliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemDaPropostaParaCliente" ADD CONSTRAINT "ItemDaPropostaParaCliente_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContatoDaProposta" ADD CONSTRAINT "ContatoDaProposta_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "PropostaParaCliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnexoDaProposta" ADD CONSTRAINT "AnexoDaProposta_propostaId_fkey" FOREIGN KEY ("propostaId") REFERENCES "PropostaParaCliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

