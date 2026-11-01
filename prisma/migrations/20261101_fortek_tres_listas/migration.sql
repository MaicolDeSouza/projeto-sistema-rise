-- Fortek (portal da Benser) varrida pelas TRES listas do portal (01/11/2026, pedido do dono: "bem separado. Pronta
-- entrega, a chegar e em montagem"). A pronta entrega e o a chegar ja tinham colunas; em montagem ganha quantidade e
-- preco proprios, e o a chegar ganha a carga e a previsao de chegada que o portal publica.
ALTER TABLE "ProdutoColetado" ADD COLUMN "precoMontagem" DECIMAL(12,2);
ALTER TABLE "ProdutoColetado" ADD COLUMN "aChegarPrevisao" TEXT;
ALTER TABLE "ProdutoColetado" ADD COLUMN "emMontagem" INTEGER;
ALTER TABLE "PrecoHistorico" ADD COLUMN "precoMontagem" DECIMAL(12,2);
