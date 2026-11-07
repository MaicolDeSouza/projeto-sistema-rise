-- A ordem dos cartoes das paginas de bloco, por pessoa (pedido do dono em 07/11/2026). So aditiva.
CREATE TABLE "OrdemDosCartoes" (
    "chave" TEXT NOT NULL,
    "pagina" TEXT NOT NULL,
    "ordem" TEXT[],
    "atualizadoEm" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OrdemDosCartoes_pkey" PRIMARY KEY ("chave","pagina")
);
