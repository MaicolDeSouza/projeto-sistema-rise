import { EXPRESSAO_BUSCA_PRODUTO, juntar, semAcento } from "@/lib/buscaAmpla";

import { CANAIS_DE_CLIENTE } from "./canais";

/**
 * O usuario de banco do servico `ia` (o chat da loja) e TUDO o que ele alcanca (spec de 19/11/2026, §5.2).
 *
 * E a garantia da regra do dono "nao pode haver vazamento de dados": o que este papel nao enxerga no banco nao vaza,
 * nem com a IA enganada, nem com o servico invadido. Ele NAO le tabela nenhuma do Rise: so visoes que ja saem sem custo,
 * sem quantidade em estoque, sem localizacao e sem fornecedor; as conversas e o orcamento ele alcanca por linha (RLS),
 * so as do canal de cliente.
 *
 * O SQL mora em constantes e a migration `20261120b_ia_papel_e_visoes` e a SAIDA de `sqlDaMigration()`: o
 * `teste:ia-isolamento` confere que o arquivo e igual, e que o papel de verdade so alcanca o que esta escrito aqui.
 */

export const PAPEL = "rise_ia";

/** As colunas da visao de produto, na ordem. O teste confere que sao exatamente estas (nenhuma sensivel entra sem aparecer aqui). */
export const COLUNAS_DO_PRODUTO_PUBLICO = ["sku", "nome", "marca", "modelo", "preco", "faixa", "link", "liId", "foto", "descricao", "tipo", "busca", "buscaAmpla"];

/**
 * O texto em que a busca AMPLA do cliente procura: o da busca normal mais a descricao. SEM NCM, homologacao e
 * localizacao (a `EXPRESSAO_AMPLA_PRODUTO` do Rise os tem): buscar por "A3" diria ao visitante o que mora na prateleira A3.
 */
export const EXPRESSAO_PUBLICA_PRODUTO = semAcento(juntar([`"tituloBase"`, `"sku"`, `"marca"`, `"modelo"`, `"ean"`, `"descricaoBase"`]));

/** Tabelas que o papel NUNCA le (lista do teste de guarda; a regra de verdade e nao haver GRANT). */
export const TABELAS_PROIBIDAS = [
  "Produto",
  "ProdutoFornecedor",
  "Fornecedor",
  "Concorrente",
  "Cliente",
  "PedidoDeVenda",
  "Conexao",
  "UsuarioRise",
  "ConfiguracaoIA",
  "ConhecimentoIA",
  "SugestaoIA",
  "ProdutoColetado",
  "Anuncio",
  "ProdutoArquivo",
  "ProdutoComponente",
  "AuditoriaDeAcesso",
  "AvisoTelegram",
  "PropostaParaCliente",
  // Os dados da empresa (CNPJ, conta, chave Pix): o papel ve so os dois WhatsApp, pela visao `ia_configuracao`.
  "DadosDaEmpresa",
];

// Publicado na loja: ativo e com endereco na Loja Integrada (a mesma regra do perfil `publico` das ferramentas do Rise AI).
const publicado = (apelido) => `${apelido}."ativo" AND ${apelido}."urlLojaIntegrada" IS NOT NULL AND ${apelido}."urlLojaIntegrada" <> ''`;

const canais = CANAIS_DE_CLIENTE.map((canal) => `'${canal}'`).join(", ");

/** A regra de `faixaDeEstoque` (src/lib/riseAi/busca.js) em SQL: a quantidade nunca sai do banco. */
const FAIXA = `CASE WHEN p."estoque" IS NULL OR p."estoque" <= 0 THEN 'em falta' WHEN p."estoque" <= 3 THEN 'poucas unidades' ELSE 'disponível' END`;

export function sqlDaMigration() {
  return `-- Chat da loja (Hobi), fase 1: o usuario de banco do servico \`ia\`, as visoes publicas, as politicas por linha e as
-- concessoes. GERADO por src/lib/riseAi/cliente/sqlDoPapel.js (\`sqlDaMigration\`); o teste:ia-isolamento confere que este
-- arquivo e igual a saida. Feito a mao: o proximo \`prisma migrate diff\` vai propor apagar as visoes e as politicas.

-- 1. O papel. Nasce SEM login: a senha e posta na VPS pelo deploy/preparar-ia.sh, nunca aqui.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${PAPEL}') THEN
    CREATE ROLE ${PAPEL} NOLOGIN;
  END IF;
END
$$;
-- O chat nao pode esgotar o banco do Rise: poucas conexoes e consulta com teto de tempo.
ALTER ROLE ${PAPEL} CONNECTION LIMIT 12;
ALTER ROLE ${PAPEL} SET statement_timeout = '8s';
ALTER ROLE ${PAPEL} SET lock_timeout = '5s';
ALTER ROLE ${PAPEL} SET idle_in_transaction_session_timeout = '15s';

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
    ${FAIXA} AS "faixa",
    p."urlLojaIntegrada" AS "link",
    (SELECT a."idExterno" FROM "Anuncio" a WHERE a."produtoId" = p."id" AND a."canal" = 'LOJA_INTEGRADA' AND a."idExterno" IS NOT NULL ORDER BY a."criadoEm" LIMIT 1) AS "liId",
    (SELECT f."arquivo" FROM "ProdutoArquivo" f WHERE f."produtoId" = p."id" AND f."tipo" = 'IMAGEM' AND f."papel" = 'FOTO' ORDER BY f."principal" DESC, f."ordem", f."criadoEm" LIMIT 1) AS "foto",
    p."descricaoBase" AS "descricao",
    p."tipo"::text AS "tipo",
    ${EXPRESSAO_BUSCA_PRODUTO} AS "busca",
    ${EXPRESSAO_PUBLICA_PRODUTO} AS "buscaAmpla"
FROM "Produto" p
WHERE ${publicado("p")};

CREATE VIEW ia_kit_publico AS
SELECT k."sku" AS "kitSku", p."sku" AS "pecaSku", p."tituloBase" AS "pecaNome", pc."quantidade" AS "quantidade", pc."ordem" AS "ordem"
FROM "ProdutoComponente" pc
JOIN "Produto" k ON k."id" = pc."kitId"
JOIN "Produto" p ON p."id" = pc."componenteId"
WHERE ${publicado("k")} AND ${publicado("p")};

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
CREATE POLICY ia_conversa ON "ConversaIA" FOR ALL TO ${PAPEL}
    USING ("canal" IN (${canais}))
    WITH CHECK ("canal" IN (${canais}) AND "perfil" = 'PUBLICO');

ALTER TABLE "MensagemIA" ENABLE ROW LEVEL SECURITY;
CREATE POLICY ia_mensagem ON "MensagemIA" FOR ALL TO ${PAPEL}
    USING (EXISTS (SELECT 1 FROM "ConversaIA" c WHERE c."id" = "conversaId" AND c."canal" IN (${canais})))
    WITH CHECK (EXISTS (SELECT 1 FROM "ConversaIA" c WHERE c."id" = "conversaId" AND c."canal" IN (${canais})));

ALTER TABLE "GastoIA" ENABLE ROW LEVEL SECURITY;
CREATE POLICY ia_gasto ON "GastoIA" FOR ALL TO ${PAPEL}
    USING ("escopo" = 'CLIENTES')
    WITH CHECK ("escopo" = 'CLIENTES');

ALTER TABLE "ReservaDeGastoIA" ENABLE ROW LEVEL SECURITY;
CREATE POLICY ia_reserva ON "ReservaDeGastoIA" FOR ALL TO ${PAPEL}
    USING ("escopo" = 'CLIENTES')
    WITH CHECK ("escopo" = 'CLIENTES');

-- 5. As concessoes, e so estas.
GRANT USAGE ON SCHEMA public TO ${PAPEL};
GRANT SELECT ON ia_produto_publico, ia_kit_publico, ia_conhecimento_publico, ia_configuracao TO ${PAPEL};
GRANT SELECT ON "SegredoDoAssistente" TO ${PAPEL};
GRANT SELECT, INSERT, UPDATE ON "SinalDoAssistente" TO ${PAPEL};
GRANT SELECT, INSERT ON "ConversaIA" TO ${PAPEL};
GRANT UPDATE ("titulo", "atualizadoEm") ON "ConversaIA" TO ${PAPEL};
GRANT SELECT, INSERT ON "MensagemIA" TO ${PAPEL};
GRANT UPDATE ("avaliacao", "comentario", "avaliadoPor", "avaliadoEm") ON "MensagemIA" TO ${PAPEL};
GRANT SELECT, INSERT ON "GastoIA" TO ${PAPEL};
GRANT SELECT, INSERT, DELETE ON "ReservaDeGastoIA" TO ${PAPEL};
`;
}

/**
 * A migration `20261122_ia_whatsapp_da_empresa` (pedido do dono em 22/11/2026: o chat usa o WhatsApp comercial cadastrado e, para
 * suporte tecnico, o WhatsApp tecnico, os dois de Configuracoes > Dados da empresa). A visao `ia_configuracao` ganha DUAS colunas
 * no fim e nada mais da tabela da empresa; o papel continua sem concessao em `DadosDaEmpresa`.
 *
 * `CREATE OR REPLACE VIEW` so aceita colunas novas no FIM, com as antigas iguais e na mesma ordem. A visao parte de uma linha
 * fixa (`SELECT 1`) para os numeros chegarem mesmo sem a configuracao do Rise AI salva.
 */
export function sqlDaMigracaoDoWhatsappDaEmpresa() {
  return `-- O chat da loja (o Hobi) usa os WhatsApp de Configuracoes > Dados da empresa (pedido do dono em 22/11/2026).
-- GERADO por src/lib/riseAi/cliente/sqlDoPapel.js (\`sqlDaMigracaoDoWhatsappDaEmpresa\`); o teste:ia-isolamento confere que
-- este arquivo e igual a saida do gerador. So os dois numeros saem da tabela da empresa; o papel ${PAPEL} nao ganha concessao nela.
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
`;
}
