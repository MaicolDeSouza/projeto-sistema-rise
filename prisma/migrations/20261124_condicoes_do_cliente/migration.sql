-- Condicoes comerciais no cadastro do cliente (24/11/2026, dono: "cada cliente muda mesmo sendo SENAI"). Desenho:
-- docs/superpowers/specs/2026-11-24-condicoes-comerciais-do-cliente-design.md. Aditiva: os padroes de proposta so saem na
-- migration seguinte (20261124b), junto com o codigo que ainda os le.

-- 1. Colunas novas.
CREATE TYPE "IndicadorIe" AS ENUM ('CONTRIBUINTE', 'ISENTO', 'NAO_CONTRIBUINTE');

ALTER TABLE "Cliente"
  ADD COLUMN "propostaValidadeDias" INTEGER,
  ADD COLUMN "propostaFormaPagamento" TEXT,
  ADD COLUMN "propostaPagamentoTexto" TEXT,
  ADD COLUMN "propostaFretePorConta" "FreteDaProposta",
  ADD COLUMN "propostaFreteDiluido" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "propostaGarantia" TEXT,
  ADD COLUMN "propostaAc" TEXT,
  ADD COLUMN "propostaMarcaModelo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "propostaAssinar" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "propostaFaturamentoMinimo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "propostaObservacoes" TEXT,
  ADD COLUMN "propostaExigencias" TEXT,
  ADD COLUMN "indicadorIe" "IndicadorIe",
  ADD COLUMN "notaFiscalObservacao" TEXT,
  ADD COLUMN "emailsRastreio" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "portalUrl" TEXT,
  ADD COLUMN "portalUsuario" TEXT,
  ADD COLUMN "portalSenhaCifrada" TEXT,
  ADD COLUMN "portalObservacao" TEXT;

ALTER TABLE "PropostaParaCliente"
  ADD COLUMN "mostrarMarcaModelo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mostrarFaturamentoMinimo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "condicoesDoClienteId" TEXT;

-- 2. Cada padrao que nao e o "Cliente comum" vira as condicoes dos clientes ligados a ele. O faturamento minimo saia no
-- PDF de todo cliente com padrao, entao ele fica marcado.
UPDATE "Cliente" AS c
SET "propostaValidadeDias" = p."validadeDias",
    "propostaFormaPagamento" = p."formaPagamento",
    "propostaPagamentoTexto" = p."pagamentoTexto",
    "propostaFretePorConta" = p."fretePorConta",
    "propostaGarantia" = p."garantia",
    "propostaObservacoes" = p."observacoesCliente",
    "propostaExigencias" = p."exigencias",
    "propostaMarcaModelo" = p."exigeMarcaModelo",
    "propostaAssinar" = p."assinarDigitalmente",
    "propostaFaturamentoMinimo" = true
FROM "PadraoDeProposta" AS p
WHERE c."padraoPropostaId" = p."id"
  AND p."id" <> 'padrao-cliente-comum'
  AND lower(trim(p."nome")) <> 'cliente comum';

-- 3. As propostas de hoje guardam o que o PDF delas mostrava (nenhum PDF muda): a coluna Marca / Modelo vinha do padrao, e
-- o faturamento minimo saia com qualquer padrao (inclusive o "Cliente comum", caso da 2037).
UPDATE "PropostaParaCliente" AS pr
SET "mostrarMarcaModelo" = COALESCE((SELECT p."exigeMarcaModelo" FROM "PadraoDeProposta" AS p WHERE p."id" = pr."padraoId"), false),
    "mostrarFaturamentoMinimo" = (pr."padraoId" IS NOT NULL);

-- O marcador de "condicoes ja aplicadas" so nas propostas cujo cliente recebeu condicoes no passo 2: o Salvar seguinte nao
-- reaplica por cima do que foi enviado.
UPDATE "PropostaParaCliente" AS pr
SET "condicoesDoClienteId" = pr."clienteId"
FROM "Cliente" AS c
WHERE pr."clienteId" = c."id"
  AND c."propostaValidadeDias" IS NOT NULL;

-- 4. Contribuinte de ICMS pelo que o cadastro ja dizia (so pessoa juridica): IE isenta, ou IE preenchida.
UPDATE "Cliente"
SET "indicadorIe" = CASE
    WHEN "ieIsento" THEN 'ISENTO'::"IndicadorIe"
    WHEN "inscricaoEstadual" IS NOT NULL AND trim("inscricaoEstadual") <> '' THEN 'CONTRIBUINTE'::"IndicadorIe"
    ELSE NULL
  END
WHERE "tipoPessoa" = 'JURIDICA';
