-- Numero de vendedores no catalogo do ML acompanhado (pedido do dono em 22/10/2026). Aditiva. Editada a mao: o diff
-- propunha DROP INDEX de ProdutoColetado_buscaTexto_trgm e ProdutoColetado_coletadoEm_idx, que so existem no SQL.

-- AlterTable
ALTER TABLE "PosicaoML" ADD COLUMN     "completo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "vendedores" INTEGER;
