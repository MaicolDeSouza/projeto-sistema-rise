-- Chat da loja (Hobi), fase 1: os dois valores de enum que o canal usa. Em migration PROPRIA: valor novo de enum nao
-- pode ser usado na mesma transacao em que nasce, e a migration seguinte (papel, visoes e politicas) ja os usa.

-- De onde a conversa veio: LOJA = o chat do site da loja.
ALTER TYPE "CanalIA" ADD VALUE IF NOT EXISTS 'LOJA';

-- O custo de uma resposta da IA a um CLIENTE (o orcamento CLIENTES soma so GastoIA).
ALTER TYPE "TipoDeGastoIA" ADD VALUE IF NOT EXISTS 'CONVERSA';
