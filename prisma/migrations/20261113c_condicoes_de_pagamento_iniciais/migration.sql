-- Condicoes de pagamento iniciais (13/11/2026, pedido do dono: a Condicao da proposta mostrava so "Sem condicao da
-- lista" porque a tabela estava vazia). So DADOS: a tabela existe desde 20260918_tabelas_clientes. O dono apaga ou
-- renomeia as que nao usar na tela Cadastros > Condicoes de pagamento. ON CONFLICT: a que ja existir com o mesmo nome
-- (cadastrada antes de setembro) fica como esta.
INSERT INTO "CondicaoPagamento" ("id", "nome", "observacoes", "ativo", "criadoEm", "atualizadoEm")
VALUES
  ('cond_a_vista',        'À vista',                         'Pagamento na confirmação do pedido.',       true, NOW(), NOW()),
  ('cond_antecipado',     'Antecipado',                      'Paga antes de separar ou produzir.',        true, NOW(), NOW()),
  ('cond_50_50',          '50% de entrada + 50% na entrega', 'Pedido grande ou sob encomenda.',           true, NOW(), NOW()),
  ('cond_7_dias',         '7 dias',                          NULL,                                        true, NOW(), NOW()),
  ('cond_14_dias',        '14 dias',                         NULL,                                        true, NOW(), NOW()),
  ('cond_28_dias',        '28 dias',                         'Boleto, padrão de empresa.',                true, NOW(), NOW()),
  ('cond_30_dias',        '30 dias',                         NULL,                                        true, NOW(), NOW()),
  ('cond_28_56_dias',     '28/56 dias',                      'Duas parcelas no boleto.',                  true, NOW(), NOW()),
  ('cond_30_60_90_dias',  '30/60/90 dias',                   'Três parcelas, cliente PJ antigo.',         true, NOW(), NOW()),
  ('cond_cartao_12x',     'Cartão em até 12x',               NULL,                                        true, NOW(), NOW()),
  ('cond_a_combinar',     'A combinar',                      'Quando ainda não foi negociado.',           true, NOW(), NOW())
ON CONFLICT ("nome") DO NOTHING;
