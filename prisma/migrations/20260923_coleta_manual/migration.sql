ALTER TABLE "FonteColeta" ALTER COLUMN "proximaVarreduraEm" DROP DEFAULT;
ALTER TABLE "FonteColeta" ALTER COLUMN "proximaVarreduraEm" DROP NOT NULL;
UPDATE "FonteColeta" SET "proximaVarreduraEm" = NULL;
