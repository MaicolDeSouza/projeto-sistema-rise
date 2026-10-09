-- A fonte pode ser varrida pelo worker do PC do dono, e nao pelo da VPS: alguns sites bloqueiam o IP de datacenter.
-- Aditiva e com padrao: o client antigo continua funcionando, e nenhuma fonte muda de comportamento.
-- (O `migrate diff` propos apagar dois indices que so existem no SQL, ProdutoColetado_buscaTexto_trgm e
-- ProdutoColetado_coletadoEm_idx; as duas linhas ficaram de fora, como em toda migration deste projeto.)
ALTER TABLE "FonteColeta" ADD COLUMN     "varridaNoPc" BOOLEAN NOT NULL DEFAULT false;
