-- Vendedor da proposta (13/11/2026): o nome que sai na faixa do PDF; vazio = quem criou.
ALTER TABLE "PropostaParaCliente" ADD COLUMN "vendedor" TEXT;
