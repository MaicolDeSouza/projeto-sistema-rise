-- As fotos que o ultimo Sincronizar deixou no Bling (pedido do dono em 27/10/2026: o "!" do Bling acende
-- quando as fotos do produto mudam). So aditiva; nula nos produtos de antes, que nao acendem.
ALTER TABLE "Produto" ADD COLUMN "blingFotos" TEXT;
