-- O 1o do catalogo de referencia e do proprio dono (o ranking nao o conta como concorrente).
ALTER TABLE "CatalogoReferenciaML" ADD COLUMN "meu" BOOLEAN NOT NULL DEFAULT false;
