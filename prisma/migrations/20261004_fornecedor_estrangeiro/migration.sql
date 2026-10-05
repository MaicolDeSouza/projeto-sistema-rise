-- Cadastros / Fornecedores: marca de fornecedor estrangeiro (pedido do dono em 04/10/2026).
-- O CNPJ passa a ser obrigatorio, salvo para quem nao tem: o fornecedor de fora do Brasil.
-- Coluna nova com padrao `false`: os 6 fornecedores existentes continuam como estao (todos
-- com CNPJ), e as outras frentes, com o client antigo, nao quebram.
-- Escrita a mao (e o mesmo ALTER que o `migrate diff` gera) para nao carregar os DROP INDEX
-- dos indices que so existem no SQL (trigramas, ProdutoColetado_coletadoEm_idx,
-- Anuncio_um_por_produto e Job_fonte_aberta).

-- AlterTable
ALTER TABLE "Fornecedor" ADD COLUMN "estrangeiro" BOOLEAN NOT NULL DEFAULT false;
