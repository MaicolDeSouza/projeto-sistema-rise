CREATE TABLE "CatalogoReferenciaML" (
    "id" TEXT NOT NULL,
    "produtoId" TEXT NOT NULL,
    "catalogoId" TEXT NOT NULL,
    "nome" TEXT,
    "itemId" TEXT,
    "vendedorId" TEXT,
    "vendedorApelido" TEXT,
    "vendedorReputacao" TEXT,
    "preco" DECIMAL(12,2),
    "precoCheio" DECIMAL(12,2),
    "freteGratis" BOOLEAN NOT NULL DEFAULT false,
    "logistica" TEXT,
    "tipoAnuncio" TEXT,
    "totalNoCatalogo" INTEGER,
    "lidoEm" TIMESTAMP(3),
    "semAnuncios" BOOLEAN NOT NULL DEFAULT false,
    "erro" TEXT,
    "erroEm" TIMESTAMP(3),
    "criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogoReferenciaML_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CatalogoReferenciaMLHistorico" (
    "id" TEXT NOT NULL,
    "referenciaId" TEXT NOT NULL,
    "itemId" TEXT,
    "vendedorId" TEXT,
    "preco" DECIMAL(12,2),
    "precoCheio" DECIMAL(12,2),
    "lidoEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogoReferenciaMLHistorico_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CatalogoReferenciaML_produtoId_idx" ON "CatalogoReferenciaML"("produtoId");

-- CreateIndex
CREATE UNIQUE INDEX "CatalogoReferenciaML_produtoId_catalogoId_key" ON "CatalogoReferenciaML"("produtoId", "catalogoId");

-- CreateIndex
CREATE INDEX "CatalogoReferenciaMLHistorico_referenciaId_lidoEm_idx" ON "CatalogoReferenciaMLHistorico"("referenciaId", "lidoEm");

-- AddForeignKey
ALTER TABLE "CatalogoReferenciaML" ADD CONSTRAINT "CatalogoReferenciaML_produtoId_fkey" FOREIGN KEY ("produtoId") REFERENCES "Produto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CatalogoReferenciaMLHistorico" ADD CONSTRAINT "CatalogoReferenciaMLHistorico_referenciaId_fkey" FOREIGN KEY ("referenciaId") REFERENCES "CatalogoReferenciaML"("id") ON DELETE CASCADE ON UPDATE CASCADE;

