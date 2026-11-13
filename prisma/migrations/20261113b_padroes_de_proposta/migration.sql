-- Padroes de proposta por tipo de cliente, ficha cadastral do cliente, marca/modelo do item e o faturamento minimo da
-- 4hobby (pedidos do dono em 13/11/2026, na cotacao do SENAI Sao Bernardo do Campo). So aditiva.

ALTER TABLE "Cliente" ADD COLUMN "padraoPropostaId" TEXT;
ALTER TABLE "DadosDaEmpresa" ADD COLUMN "faturamentoMinimo" DECIMAL(12,2);
ALTER TABLE "ItemDaPropostaParaCliente" ADD COLUMN "marca" TEXT, ADD COLUMN "modelo" TEXT;
ALTER TABLE "PropostaParaCliente" ADD COLUMN "padraoId" TEXT;

CREATE TABLE "PadraoDeProposta" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "validadeDias" INTEGER NOT NULL DEFAULT 15,
    "formaPagamento" TEXT,
    "pagamentoTexto" TEXT,
    "fretePorConta" "FreteDaProposta" NOT NULL DEFAULT 'A_COMBINAR',
    "garantia" TEXT,
    "observacoesCliente" TEXT,
    "exigeMarcaModelo" BOOLEAN NOT NULL DEFAULT false,
    "exigencias" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PadraoDeProposta_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ArquivoDoCliente" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'FICHA_CADASTRAL',
    "arquivo" TEXT NOT NULL,
    "nomeOriginal" TEXT NOT NULL,
    "tamanho" INTEGER NOT NULL,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArquivoDoCliente_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PadraoDeProposta_nome_key" ON "PadraoDeProposta"("nome");
CREATE INDEX "ArquivoDoCliente_clienteId_idx" ON "ArquivoDoCliente"("clienteId");

ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_padraoPropostaId_fkey" FOREIGN KEY ("padraoPropostaId") REFERENCES "PadraoDeProposta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PropostaParaCliente" ADD CONSTRAINT "PropostaParaCliente_padraoId_fkey" FOREIGN KEY ("padraoId") REFERENCES "PadraoDeProposta"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ArquivoDoCliente" ADD CONSTRAINT "ArquivoDoCliente_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- O faturamento minimo que o dono passou (R$ 50,00).
UPDATE "DadosDaEmpresa" SET "faturamentoMinimo" = 50 WHERE "faturamentoMinimo" IS NULL;

-- Os dois padroes de partida: o "Cliente comum" (as regras de sempre) e o "SENAI", com as 15 instrucoes do e-mail de
-- 12/11/2026 (SENAI Sao Bernardo do Campo). O de Instituto Federal o dono cria na tela quando tiver as regras.
INSERT INTO "PadraoDeProposta" ("id", "nome", "validadeDias", "fretePorConta", "garantia", "atualizadoEm")
VALUES ('padrao-cliente-comum', 'Cliente comum', 15, 'A_COMBINAR', 'Garantia de 90 dias contra defeito de fabricação.', CURRENT_TIMESTAMP)
ON CONFLICT ("nome") DO NOTHING;

INSERT INTO "PadraoDeProposta" ("id", "nome", "validadeDias", "formaPagamento", "pagamentoTexto", "fretePorConta", "garantia", "exigeMarcaModelo", "exigencias", "atualizadoEm")
VALUES (
  'padrao-senai',
  'SENAI',
  30,
  'Transferência',
  'Depósito bancário, 15 dias contados a partir da data de entrega, excluindo as datas 10, 20 e 30.',
  'CIF',
  'Garantia de 90 dias contra defeito de fabricação.',
  true,
  E'1. Equipamento: o valor de todos os itens em apenas uma linha.\n2. Validade da proposta de no mínimo 30 dias (dd/mm/aaaa ou XX dias).\n3. Prazo de entrega de cada item (dd/mm/aaaa ou XX dias do pedido de compra).\n4. Uma coluna com o preço unitário e outra com o preço total.\n5. Marca e modelo de cada item.\n6. Orçar só o item com as características pedidas, sem item semelhante; indisponível é justificado no corpo do e-mail.\n7. Proposta em papel timbrado: CNPJ, razão social, data, endereço, telefone, contato e e-mail.\n8. Impostos e frete inclusos no preço dos produtos (CIF).\n9. Pagamento: depósito bancário, 15 dias da entrega, excluindo os dias 10, 20 e 30.\n10. Garantia (se houver).\n11. Itens em língua portuguesa.\n12. Responder copiando todos, mantendo o histórico de e-mails.\n13. Constar o valor de faturamento mínimo no formato R$ XXX,XX.\n14. Itens na mesma ordem da tabela do pedido.\n15. Proposta até o próximo dia útil.',
  CURRENT_TIMESTAMP
)
ON CONFLICT ("nome") DO NOTHING;
