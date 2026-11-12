-- Mapa do estoque (spec 2026-11-12-enderecamento-de-estoque-design.md): os tres estoques, as colunas (a letra da
-- localizacao), os modelos de caixinha e o que o produto guarda alem da localizacao.
CREATE TABLE "LocalDeEstoque" (
    "id" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "aplicaRegras" BOOLEAN NOT NULL DEFAULT false,
    "primeiraEmbaixo" BOOLEAN NOT NULL DEFAULT false,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LocalDeEstoque_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LocalDeEstoque_numero_key" ON "LocalDeEstoque"("numero");

CREATE TABLE "ColunaDeEstoque" (
    "id" TEXT NOT NULL,
    "localId" TEXT NOT NULL,
    "letra" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL DEFAULT 0,
    "prateleiras" INTEGER NOT NULL DEFAULT 5,
    "larguraCm" DECIMAL(10,2),
    "profundidadeCm" DECIMAL(10,2),
    "alturaLivreCm" DECIMAL(10,2),
    "pesoMaximoKg" DECIMAL(10,3),
    "xCm" DECIMAL(10,2),
    "zCm" DECIMAL(10,2),
    "giroGraus" INTEGER,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ColunaDeEstoque_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ColunaDeEstoque_letra_key" ON "ColunaDeEstoque"("letra");
CREATE INDEX "ColunaDeEstoque_localId_ordem_idx" ON "ColunaDeEstoque"("localId", "ordem");
ALTER TABLE "ColunaDeEstoque" ADD CONSTRAINT "ColunaDeEstoque_localId_fkey" FOREIGN KEY ("localId") REFERENCES "LocalDeEstoque"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ModeloDeCaixinha" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "cor" TEXT NOT NULL DEFAULT '#2f5d8a',
    "larguraCm" DECIMAL(10,2) NOT NULL,
    "alturaCm" DECIMAL(10,2) NOT NULL,
    "profundidadeCm" DECIMAL(10,2) NOT NULL,
    "fatorUtil" DECIMAL(3,2) NOT NULL DEFAULT 0.70,
    "pesoVazioKg" DECIMAL(10,3),
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModeloDeCaixinha_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ModeloDeCaixinha_nome_key" ON "ModeloDeCaixinha"("nome");

CREATE TABLE "HistoricoDeLocal" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "de" TEXT,
    "para" TEXT,
    "usuario" TEXT,
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HistoricoDeLocal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HistoricoDeLocal_produtoId_criadoEm_idx" ON "HistoricoDeLocal"("produtoId", "criadoEm");

ALTER TABLE "Produto" ADD COLUMN "modeloCaixinhaId" TEXT;
ALTER TABLE "Produto" ADD COLUMN "pecasPorCaixinha" INTEGER;
ALTER TABLE "Produto" ADD COLUMN "ordemNaPrateleira" INTEGER;
ALTER TABLE "Produto" ADD CONSTRAINT "Produto_modeloCaixinhaId_fkey" FOREIGN KEY ("modeloCaixinhaId") REFERENCES "ModeloDeCaixinha"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Os tres estoques do dono (12/11/2026). O 1 fica como esta; o 2 e o 3 ja nascem com as regras.
INSERT INTO "LocalDeEstoque" ("id", "numero", "nome", "descricao", "aplicaRegras", "atualizadoEm") VALUES
  ('estoque-1', 1, 'Estoque 1', 'Container inferior', false, CURRENT_TIMESTAMP),
  ('estoque-2', 2, 'Estoque 2', 'Porão da casa', true, CURRENT_TIMESTAMP),
  ('estoque-3', 3, 'Estoque 3', 'Container superior', true, CURRENT_TIMESTAMP);
