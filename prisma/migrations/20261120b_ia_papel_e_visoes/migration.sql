-- Chat da loja (Hobi), fase 1: o usuario de banco do servico `ia`, as visoes publicas, as politicas por linha e as
-- concessoes. GERADO por src/lib/riseAi/cliente/sqlDoPapel.js (`sqlDaMigration`); o teste:ia-isolamento confere que este
-- arquivo e igual a saida. Feito a mao: o proximo `prisma migrate diff` vai propor apagar as visoes e as politicas.

-- 1. O papel. Nasce SEM login: a senha e posta na VPS pelo deploy/preparar-ia.sh, nunca aqui.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rise_ia') THEN
    CREATE ROLE rise_ia NOLOGIN;
  END IF;
END
$$;
-- O chat nao pode esgotar o banco do Rise: poucas conexoes e consulta com teto de tempo.
ALTER ROLE rise_ia CONNECTION LIMIT 12;
ALTER ROLE rise_ia SET statement_timeout = '8s';
ALTER ROLE rise_ia SET lock_timeout = '5s';
ALTER ROLE rise_ia SET idle_in_transaction_session_timeout = '15s';

-- 2. As duas tabelas do servico.
CREATE TABLE "SegredoDoAssistente" (
    "nome" TEXT NOT NULL,
    "cifrado" TEXT NOT NULL,
    "atualizadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizadoPor" TEXT,

    CONSTRAINT "SegredoDoAssistente_pkey" PRIMARY KEY ("nome")
);

CREATE TABLE "SinalDoAssistente" (
    "id" TEXT NOT NULL DEFAULT 'unico',
    "sinalEm" TIMESTAMP(3) NOT NULL,
    "versao" TEXT,
    "emAndamento" INTEGER NOT NULL DEFAULT 0,
    "ultimoErro" TEXT,

    CONSTRAINT "SinalDoAssistente_pkey" PRIMARY KEY ("id")
);

-- 3. As visoes. Rodam com o DONO (sem security_invoker): o papel nao recebe concessao nas tabelas de baixo.
CREATE VIEW ia_produto_publico AS
SELECT
    p."sku" AS "sku",
    p."tituloBase" AS "nome",
    p."marca" AS "marca",
    p."modelo" AS "modelo",
    p."precoVenda" AS "preco",
    CASE WHEN p."estoque" IS NULL OR p."estoque" <= 0 THEN 'em falta' WHEN p."estoque" <= 3 THEN 'poucas unidades' ELSE 'disponível' END AS "faixa",
    p."urlLojaIntegrada" AS "link",
    (SELECT a."idExterno" FROM "Anuncio" a WHERE a."produtoId" = p."id" AND a."canal" = 'LOJA_INTEGRADA' AND a."idExterno" IS NOT NULL ORDER BY a."criadoEm" LIMIT 1) AS "liId",
    (SELECT f."arquivo" FROM "ProdutoArquivo" f WHERE f."produtoId" = p."id" AND f."tipo" = 'IMAGEM' AND f."papel" = 'FOTO' ORDER BY f."principal" DESC, f."ordem", f."criadoEm" LIMIT 1) AS "foto",
    p."descricaoBase" AS "descricao",
    p."tipo"::text AS "tipo",
    translate(lower(coalesce("tituloBase", '') || ' ' || coalesce("sku", '') || ' ' || coalesce("marca", '') || ' ' || coalesce("modelo", '') || ' ' || coalesce("ean", '')), 'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ', 'aaaaaaeeeeiiiiooooouuuucnyy') AS "busca",
    translate(lower(coalesce("tituloBase", '') || ' ' || coalesce("sku", '') || ' ' || coalesce("marca", '') || ' ' || coalesce("modelo", '') || ' ' || coalesce("ean", '') || ' ' || coalesce("descricaoBase", '')), 'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ', 'aaaaaaeeeeiiiiooooouuuucnyy') AS "buscaAmpla"
FROM "Produto" p
WHERE p."ativo" AND p."urlLojaIntegrada" IS NOT NULL AND p."urlLojaIntegrada" <> '';

CREATE VIEW ia_kit_publico AS
SELECT k."sku" AS "kitSku", p."sku" AS "pecaSku", p."tituloBase" AS "pecaNome", pc."quantidade" AS "quantidade", pc."ordem" AS "ordem"
FROM "ProdutoComponente" pc
JOIN "Produto" k ON k."id" = pc."kitId"
JOIN "Produto" p ON p."id" = pc."componenteId"
WHERE k."ativo" AND k."urlLojaIntegrada" IS NOT NULL AND k."urlLojaIntegrada" <> '' AND p."ativo" AND p."urlLojaIntegrada" IS NOT NULL AND p."urlLojaIntegrada" <> '';

CREATE VIEW ia_conhecimento_publico AS
SELECT c."id" AS "id", c."assunto" AS "assunto", c."conteudo" AS "conteudo", c."categoria" AS "categoria", c."produtos" AS "produtos"
FROM "ConhecimentoIA" c
WHERE c."status" = 'APROVADO' AND c."visibilidade" = 'PUBLICO';

-- So os campos do canal: nada de enderecos, Telegram ou prompt interno.
CREATE VIEW ia_configuracao AS
SELECT
    c."dados"->'chatDaLoja' AS "canal",
    c."dados"#>>'{prompts,atendimento}' AS "promptDoCliente",
    (c."dados"#>>'{orcamentos,clientesBrl}')::numeric AS "tetoClientesBrl",
    c."dados"->'tempoLimite' AS "tempoLimite",
    (c."dados"->>'maxChamadasDeFerramenta')::int AS "maxChamadasDeFerramenta",
    (c."dados"->>'maxTokensResposta')::int AS "maxTokensResposta",
    (c."dados"->>'contextoMaxTokens')::int AS "contextoMaxTokens"
FROM "ConfiguracaoIA" c
WHERE c."id" = 'unica';

-- 4. Politicas por linha. O dono das tabelas (o usuario do Rise) nao e afetado; o papel so alcanca o canal de cliente.
ALTER TABLE "ConversaIA" ENABLE ROW LEVEL SECURITY;
CREATE POLICY ia_conversa ON "ConversaIA" FOR ALL TO rise_ia
    USING ("canal" IN ('LOJA'))
    WITH CHECK ("canal" IN ('LOJA') AND "perfil" = 'PUBLICO');

ALTER TABLE "MensagemIA" ENABLE ROW LEVEL SECURITY;
CREATE POLICY ia_mensagem ON "MensagemIA" FOR ALL TO rise_ia
    USING (EXISTS (SELECT 1 FROM "ConversaIA" c WHERE c."id" = "conversaId" AND c."canal" IN ('LOJA')))
    WITH CHECK (EXISTS (SELECT 1 FROM "ConversaIA" c WHERE c."id" = "conversaId" AND c."canal" IN ('LOJA')));

ALTER TABLE "GastoIA" ENABLE ROW LEVEL SECURITY;
CREATE POLICY ia_gasto ON "GastoIA" FOR ALL TO rise_ia
    USING ("escopo" = 'CLIENTES')
    WITH CHECK ("escopo" = 'CLIENTES');

ALTER TABLE "ReservaDeGastoIA" ENABLE ROW LEVEL SECURITY;
CREATE POLICY ia_reserva ON "ReservaDeGastoIA" FOR ALL TO rise_ia
    USING ("escopo" = 'CLIENTES')
    WITH CHECK ("escopo" = 'CLIENTES');

-- 5. As concessoes, e so estas.
GRANT USAGE ON SCHEMA public TO rise_ia;
GRANT SELECT ON ia_produto_publico, ia_kit_publico, ia_conhecimento_publico, ia_configuracao TO rise_ia;
GRANT SELECT ON "SegredoDoAssistente" TO rise_ia;
GRANT SELECT, INSERT, UPDATE ON "SinalDoAssistente" TO rise_ia;
GRANT SELECT, INSERT ON "ConversaIA" TO rise_ia;
GRANT UPDATE ("titulo", "atualizadoEm") ON "ConversaIA" TO rise_ia;
GRANT SELECT, INSERT ON "MensagemIA" TO rise_ia;
GRANT UPDATE ("avaliacao", "comentario", "avaliadoPor", "avaliadoEm") ON "MensagemIA" TO rise_ia;
GRANT SELECT, INSERT ON "GastoIA" TO rise_ia;
GRANT SELECT, INSERT, DELETE ON "ReservaDeGastoIA" TO rise_ia;
