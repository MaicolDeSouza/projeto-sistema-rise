-- Os anuncios da conta do ML que o Rise ainda nao tem, por produto conferido (botao "Verificar anuncios antigos", 09/11/2026).
-- Feita a mao a partir do `migrate diff`: o diff tambem propunha apagar os indices de trigramas feitos a mao, que ficam.
CREATE TABLE "AnuncioForaDoRiseML" (
    "itemId" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "kit" INTEGER NOT NULL DEFAULT 1,
    "titulo" TEXT NOT NULL,
    "preco" DECIMAL(12,2),
    "tipoAnuncio" TEXT,
    "freteGratis" BOOLEAN NOT NULL DEFAULT false,
    "vendidos" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT,
    "link" TEXT,
    "lidoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnuncioForaDoRiseML_pkey" PRIMARY KEY ("itemId")
);

CREATE INDEX "AnuncioForaDoRiseML_produtoId_idx" ON "AnuncioForaDoRiseML"("produtoId");

ALTER TABLE "AnuncioForaDoRiseML" ADD CONSTRAINT "AnuncioForaDoRiseML_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
