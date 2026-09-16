-- Varredura a cada 30 dias (720 h), e nao mais a cada 24 h.
ALTER TABLE "FonteColeta" ALTER COLUMN "intervaloHoras" SET DEFAULT 720;
UPDATE "FonteColeta" SET "intervaloHoras" = 720;
-- Fonte ja varrida e sem job na fila: a proxima fica 30 dias depois da ultima.
-- Fonte pausada (proxima a cem anos) e fonte com job na fila nao mudam: a pausada
-- continua pausada, e a da fila ganha a data nova quando o job terminar.
UPDATE "FonteColeta" f
   SET "proximaVarreduraEm" = f."ultimaVarreduraEm" + INTERVAL '30 days'
 WHERE f."ultimaVarreduraEm" IS NOT NULL
   AND f."proximaVarreduraEm" < NOW() + INTERVAL '50 years'
   AND NOT EXISTS (
     SELECT 1 FROM "Job" j
      WHERE j."tipo" = 'coleta'
        AND j."status" IN ('PENDENTE', 'PROCESSANDO')
        AND j."payload"->>'fonteId' = f."id"
   );
