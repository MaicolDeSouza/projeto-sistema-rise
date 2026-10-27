-- Canais em que o produto NAO vai ser anunciado (pedido do dono em 27/10/2026). So aditiva.
-- O diff tambem propunha apagar os indices que so existem no SQL (trigramas e coletadoEm): tirados.
ALTER TABLE "Produto" ADD COLUMN "naoAnunciarEm" "Canal"[] DEFAULT ARRAY[]::"Canal"[];
