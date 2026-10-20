-- O campo "Secao" (filtro de texto sobre o endereco) saiu: a fonte varre a lista de enderecos (FonteColeta.categorias).
-- Nenhuma fonte o usava. Uma fonte por dominio.
DROP INDEX "FonteColeta_dominio_prefixoUrl_key";
ALTER TABLE "FonteColeta" DROP COLUMN "prefixoUrl";
CREATE UNIQUE INDEX "FonteColeta_dominio_key" ON "FonteColeta"("dominio");
