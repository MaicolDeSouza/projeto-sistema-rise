-- Saude do Rise (pedido do dono em 25/10/2026): o ultimo resultado de cada rotina do worker. So aditiva.
-- (Os dois DROP INDEX que o `migrate diff` propoe, de indices que so existem no SQL, foram tirados de proposito.)

-- CreateTable
CREATE TABLE "RotinaDoWorker" (
    "id" TEXT NOT NULL,
    "ultimaOkEm" TIMESTAMP(3),
    "ultimaFalhaEm" TIMESTAMP(3),
    "ultimoErro" TEXT,
    "aviso" TEXT,
    "duracaoMs" INTEGER,
    "intervaloMs" INTEGER,
    "dados" JSONB,
    "atualizadoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RotinaDoWorker_pkey" PRIMARY KEY ("id")
);
