-- O chat da loja (o Hobi) usa os WhatsApp de Configuracoes > Dados da empresa (pedido do dono em 22/11/2026).
-- GERADO por src/lib/riseAi/cliente/sqlDoPapel.js (`sqlDaMigracaoDoWhatsappDaEmpresa`); o teste:ia-isolamento confere que
-- este arquivo e igual a saida do gerador. So os dois numeros saem da tabela da empresa; o papel rise_ia nao ganha concessao nela.
CREATE OR REPLACE VIEW ia_configuracao AS
SELECT
    c."dados"->'chatDaLoja' AS "canal",
    c."dados"#>>'{prompts,atendimento}' AS "promptDoCliente",
    (c."dados"#>>'{orcamentos,clientesBrl}')::numeric AS "tetoClientesBrl",
    c."dados"->'tempoLimite' AS "tempoLimite",
    (c."dados"->>'maxChamadasDeFerramenta')::int AS "maxChamadasDeFerramenta",
    (c."dados"->>'maxTokensResposta')::int AS "maxTokensResposta",
    (c."dados"->>'contextoMaxTokens')::int AS "contextoMaxTokens",
    e."celular" AS "whatsappComercial",
    e."whatsappTecnico" AS "whatsappTecnico"
FROM (SELECT 1) AS uma
LEFT JOIN "ConfiguracaoIA" c ON c."id" = 'unica'
LEFT JOIN "DadosDaEmpresa" e ON e."id" = 'empresa';
