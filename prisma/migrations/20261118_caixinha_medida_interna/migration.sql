-- Medidas INTERNAS do modelo de caixinha (pedido do dono em 18/11/2026, N3 da Siplas). Opcionais: com as tres, a conta
-- de pecas usa o volume de dentro; sem elas, continua o volume de fora x fatorUtil.
ALTER TABLE "ModeloDeCaixinha" ADD COLUMN "larguraInternaCm" DECIMAL(10,2);
ALTER TABLE "ModeloDeCaixinha" ADD COLUMN "alturaInternaCm" DECIMAL(10,2);
ALTER TABLE "ModeloDeCaixinha" ADD COLUMN "profundidadeInternaCm" DECIMAL(10,2);
