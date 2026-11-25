-- Produto que e servico (pedido do dono em 25/11/2026). O 999906 (configuracao do LightBurn) ja nasce marcado.
ALTER TABLE "Produto" ADD COLUMN "servico" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Produto" SET "servico" = true WHERE "sku" = '999906';
