-- Modulo de frete, fase 2: o envio fica em COMPRANDO enquanto o carrinho, o pagamento e a geracao estao no ar. A
-- passagem RASCUNHO -> COMPRANDO e uma escrita condicional: o segundo clique nao acha a linha e nao compra de novo.
ALTER TYPE "StatusDoEnvioRise" ADD VALUE 'COMPRANDO' AFTER 'RASCUNHO';
