-- Worker da coleta com varreduras em paralelo e posse do job (16/09/2026).
--
-- Ate aqui a vida de um job era deduzida de `atualizadoEm`, que so andava quando a
-- varredura dava noticia: uma pagina travada, ou um worker ocupado com outra loja,
-- pareciam iguais a um worker morto. Agora cada job tem DONO e SINAL DE VIDA
-- proprios, escritos por relogio, independentes do andamento.

ALTER TABLE "Job"
  ADD COLUMN "fonteId"    TEXT,
  ADD COLUMN "workerId"   TEXT,
  ADD COLUMN "sinalEm"    TIMESTAMP(3),
  ADD COLUMN "iniciadoEm" TIMESTAMP(3);

UPDATE "Job" SET "fonteId" = "payload"->>'fonteId' WHERE "tipo" = 'coleta';

-- Nenhum worker esta no ar durante esta migracao: todo job em andamento foi largado.
-- Volta a fila sem gastar tentativa (a queda nao foi da loja).
UPDATE "Job"
   SET "status" = 'PENDENTE',
       "tentativas" = GREATEST("tentativas" - 1, 0),
       "proximaTentativaEm" = NOW(),
       "erro" = 'devolvido a fila na troca do worker (16/09/2026)'
 WHERE "status" = 'PROCESSANDO';

-- Job repetido da mesma fonte na fila: fica o mais antigo. Precisa sair antes do
-- indice abaixo, que nao aceitaria os dois.
UPDATE "Job" j
   SET "status" = 'FALHOU', "erro" = 'repetido na fila: a fonte ja tinha outro job aberto'
  FROM (
    SELECT "id",
           ROW_NUMBER() OVER (PARTITION BY "fonteId" ORDER BY "criadoEm", "id") AS ordem
      FROM "Job"
     WHERE "fonteId" IS NOT NULL AND "status" IN ('PENDENTE', 'PROCESSANDO')
  ) r
 WHERE j."id" = r."id" AND r.ordem > 1;

-- UM JOB ABERTO POR FONTE, garantido pelo banco. O botao "Atualizar dados" e o
-- ciclo de 30 dias do worker enfileiram ao mesmo tempo sem se enxergar; conferir
-- antes de inserir nao impede os dois de inserir. O indice parcial impede, e o
-- `createMany({ skipDuplicates })` vira ON CONFLICT DO NOTHING.
-- O Prisma nao descreve indice parcial no schema: ele mora so aqui.
CREATE UNIQUE INDEX "Job_fonte_aberta" ON "Job" ("fonteId")
  WHERE "status" IN ('PENDENTE', 'PROCESSANDO');

CREATE INDEX "Job_status_sinalEm_idx" ON "Job" ("status", "sinalEm");

-- Workers no ar. A tela le daqui se ha quem atenda a fila, em vez de adivinhar
-- pela idade dos jobs.
CREATE TABLE "WorkerColeta" (
  "id"          TEXT         NOT NULL,
  "pid"         INTEGER      NOT NULL,
  "maquina"     TEXT         NOT NULL,
  "paralelo"    INTEGER      NOT NULL,
  "iniciadoEm"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sinalEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "encerradoEm" TIMESTAMP(3),
  CONSTRAINT "WorkerColeta_pkey" PRIMARY KEY ("id")
);
