-- Rise AI, Entrega C1: o bot do Telegram ganha o proprio servico em LogIntegracao e Conexao.
-- Valor de enum vai em migration propria: o Postgres nao deixa usar o valor novo na mesma transacao.
ALTER TYPE "Servico" ADD VALUE 'TELEGRAM';
