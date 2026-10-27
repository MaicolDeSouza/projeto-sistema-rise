-- Lista personalizada: codigo e fornecedor do item manual, e o fornecedor copiado na ordem de producao.
ALTER TABLE "PecaPropriaDoProduto" ADD COLUMN "codigoManual" TEXT;
ALTER TABLE "PecaPropriaDoProduto" ADD COLUMN "fornecedorManual" TEXT;
ALTER TABLE "ItemDaOrdemDeProducao" ADD COLUMN "fornecedor" TEXT;
