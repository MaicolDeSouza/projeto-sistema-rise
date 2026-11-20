import "dotenv/config";

/**
 * O teste de GUARDA do usuario de banco `rise_ia` (o servico do chat da loja; spec de 19/11/2026, §5.2).
 *
 *   npm run teste:ia-isolamento
 *
 * Prova, no Postgres de verdade, a regra do dono "nao pode haver vazamento de dados": veste o papel `rise_ia` e tenta ler o
 * que e proibido. Se uma tabela abrir, se uma coluna sensivel aparecer numa visao, ou se a migration deixar de ser a saida
 * de `sqlDoPapel.js`, o teste falha.
 *
 * Postgres local, SEM rede. So escreve produtos `ZZ-LOJA-*`, notas "ZZ LOJA *" e conversas `loja:zz-*`, e apaga no fim.
 * Recusa rodar na imagem de producao.
 *
 *   node scripts/teste-ia-isolamento.js --gravar-migration   escreve a migration a partir do gerador e sai
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { readFileSync, writeFileSync, mkdirSync } = await import("node:fs");
const { default: pg } = await import("pg");

if (process.env.RISE_PRODUCAO) {
  console.error("Este teste nao roda na imagem de producao.");
  process.exit(2);
}

const { PAPEL, COLUNAS_DO_PRODUTO_PUBLICO, TABELAS_PROIBIDAS, sqlDaMigration } = await import("../src/lib/riseAi/cliente/sqlDoPapel.js");

const MIGRATION = "prisma/migrations/20261120b_ia_papel_e_visoes/migration.sql";
if (process.argv.includes("--gravar-migration")) {
  mkdirSync("prisma/migrations/20261120b_ia_papel_e_visoes", { recursive: true });
  writeFileSync(MIGRATION, sqlDaMigration());
  console.log(`gravado: ${MIGRATION}`);
  process.exit(0);
}

const { prisma } = await import("../src/lib/db.js");
const { faixaDeEstoque } = await import("../src/lib/riseAi/busca.js");

let falhas = 0;
let total = 0;
function conferir(nome, obtido, esperado) {
  total++;
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

async function limpar() {
  await prisma.conversaIA.deleteMany({ where: { usuario: { startsWith: "loja:zz-" } } });
  await prisma.conhecimentoIA.deleteMany({ where: { assunto: { startsWith: "ZZ LOJA" } } });
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-LOJA-" } } });
}

// Uma conexao do DONO que veste o papel: `SET ROLE` aplica as concessoes e as politicas do `rise_ia`, sem precisar de senha.
const dono = new pg.Client({ connectionString: process.env.DATABASE_URL });
await dono.connect();
const comoPapel = new pg.Client({ connectionString: process.env.DATABASE_URL });
await comoPapel.connect();

/** O codigo do erro do Postgres (42501 = permissao negada, 42703 = coluna nao existe), ou null se a consulta passou. */
async function codigoSql(sql) {
  try {
    await comoPapel.query(sql);
    return null;
  } catch (erro) {
    return erro.code ?? String(erro.message);
  }
}
const linhas = async (sql, valores = []) => (await comoPapel.query(sql, valores)).rows;

try {
  await limpar();
  await dono.query(`DROP TABLE IF EXISTS "ZZ_IA_NOVA"`);

  // ---------- A migration e a saida do gerador ----------
  const noDisco = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n").trim();
  conferir("a migration e a saida do gerador", noDisco === sqlDaMigration().trim(), true);

  // ---------- O papel existe, sem superpoderes e com os tetos ----------
  const [papel] = (await dono.query(`SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolconnlimit, rolconfig FROM pg_roles WHERE rolname = $1`, [PAPEL])).rows;
  conferir("o papel nao e superusuario nem pula as politicas", [papel?.rolsuper, papel?.rolcreatedb, papel?.rolcreaterole, papel?.rolbypassrls], [false, false, false, false]);
  conferir("teto de conexoes", papel?.rolconnlimit, 12);
  conferir("teto de tempo de consulta", (papel?.rolconfig ?? []).includes("statement_timeout=8s"), true);

  // ---------- Dados de teste (criados pelo dono) ----------
  await prisma.produto.create({
    data: { sku: "ZZ-LOJA-PUB", tituloBase: "ZZ LOJA produto publicado", ativo: true, urlLojaIntegrada: "https://www.4hobby.com.br/zz-loja-pub", custo: 9.99, precoVenda: 19.9, estoque: 2, localizacao: "Z9", ncm: "85423190" },
  });
  await prisma.produto.create({ data: { sku: "ZZ-LOJA-OCULTO", tituloBase: "ZZ LOJA produto fora da loja", ativo: true, custo: 1, precoVenda: 5, estoque: 50 } });
  await prisma.produto.create({ data: { sku: "ZZ-LOJA-INATIVO", tituloBase: "ZZ LOJA inativo", ativo: false, urlLojaIntegrada: "https://www.4hobby.com.br/zz-loja-inativo", estoque: 9 } });
  await prisma.conhecimentoIA.create({ data: { assunto: "ZZ LOJA publica", conteudo: "zz loja garantia de 90 dias", visibilidade: "PUBLICO", status: "APROVADO", criadoPor: "zz-loja" } });
  await prisma.conhecimentoIA.create({ data: { assunto: "ZZ LOJA interna", conteudo: "zz loja garantia: o fornecedor troca", visibilidade: "ADMIN", status: "APROVADO", criadoPor: "zz-loja" } });
  await prisma.conhecimentoIA.create({ data: { assunto: "ZZ LOJA rascunho", conteudo: "zz loja garantia rascunho", visibilidade: "PUBLICO", status: "RASCUNHO", criadoPor: "zz-loja" } });
  const interna = await prisma.conversaIA.create({ data: { titulo: "zz interna", usuario: "loja:zz-interna", perfil: "ADMIN", canal: "CHAT" } });
  await prisma.mensagemIA.create({ data: { conversaId: interna.id, papel: "ASSISTENTE", conteudo: "o custo e 9,99" } });

  await comoPapel.query(`SET ROLE ${PAPEL}`);

  // ---------- O que e proibido ----------
  for (const tabela of TABELAS_PROIBIDAS) conferir(`negado: ${tabela}`, await codigoSql(`SELECT 1 FROM "${tabela}" LIMIT 1`), "42501");
  conferir("nao cria tabela", await codigoSql(`CREATE TABLE zz_ia (a int)`), "42501");
  conferir("nao le o custo nem pela visao", await codigoSql(`SELECT "custo" FROM ia_produto_publico`), "42703");
  conferir("nao le a quantidade nem pela visao", await codigoSql(`SELECT "estoque" FROM ia_produto_publico`), "42703");
  conferir("nao apaga produto pela visao", await codigoSql(`DELETE FROM ia_produto_publico`), "42501");
  conferir("nao grava segredo", await codigoSql(`INSERT INTO "SegredoDoAssistente" ("nome", "cifrado") VALUES ('zz', 'zz')`), "42501");

  // Tabela criada pelo dono DEPOIS da migration: o papel nao ganha acesso por padrao.
  await comoPapel.query("RESET ROLE");
  await dono.query(`CREATE TABLE "ZZ_IA_NOVA" (a int)`);
  await comoPapel.query(`SET ROLE ${PAPEL}`);
  conferir("tabela nova do dono nasce fechada", await codigoSql(`SELECT 1 FROM "ZZ_IA_NOVA"`), "42501");

  // ---------- As visoes ----------
  const colunasDe = async (visao) => (await dono.query(`SELECT column_name FROM information_schema.columns WHERE table_name = $1 ORDER BY ordinal_position`, [visao])).rows.map((l) => l.column_name);
  conferir("colunas da visao de produto", await colunasDe("ia_produto_publico"), COLUNAS_DO_PRODUTO_PUBLICO);
  const todas = [];
  for (const visao of ["ia_produto_publico", "ia_kit_publico", "ia_conhecimento_publico", "ia_configuracao"]) todas.push(...(await colunasDe(visao)));
  conferir("nenhuma coluna sensivel nas visoes", todas.filter((coluna) => /custo|estoque|localiza|fornecedor|ncm|margem/i.test(coluna)), []);
  conferir("as visoes rodam com o dono (sem security_invoker)", (await dono.query(`SELECT count(*)::int AS n FROM pg_class WHERE relname LIKE 'ia\\_%' AND relkind = 'v' AND reloptions::text LIKE '%security_invoker%'`)).rows[0].n, 0);

  conferir("o publicado aparece, so com a faixa", await linhas(`SELECT "sku", "preco"::float AS "preco", "faixa" FROM ia_produto_publico WHERE "sku" = 'ZZ-LOJA-PUB'`), [{ sku: "ZZ-LOJA-PUB", preco: 19.9, faixa: "poucas unidades" }]);
  conferir("o que nao esta na loja nao aparece", (await linhas(`SELECT 1 FROM ia_produto_publico WHERE "sku" = 'ZZ-LOJA-OCULTO'`)).length, 0);
  conferir("o inativo nao aparece", (await linhas(`SELECT 1 FROM ia_produto_publico WHERE "sku" = 'ZZ-LOJA-INATIVO'`)).length, 0);
  conferir("a localizacao e o NCM nao estao no texto de busca", (await linhas(`SELECT 1 FROM ia_produto_publico WHERE "sku" = 'ZZ-LOJA-PUB' AND ("buscaAmpla" LIKE '%z9%' OR "buscaAmpla" LIKE '%85423190%')`)).length, 0);
  conferir("so a nota aprovada e publica", (await linhas(`SELECT "assunto" FROM ia_conhecimento_publico WHERE "assunto" LIKE 'ZZ LOJA%'`)).map((l) => l.assunto), ["ZZ LOJA publica"]);

  // A faixa da visao e a de `faixaDeEstoque`, valor a valor (a quantidade nunca sai do banco).
  await comoPapel.query("RESET ROLE");
  const faixas = [];
  for (const estoque of [-1, 0, 1, 3, 4, 250]) {
    await prisma.produto.update({ where: { sku: "ZZ-LOJA-PUB" }, data: { estoque } });
    faixas.push((await dono.query(`SELECT "faixa" FROM ia_produto_publico WHERE "sku" = 'ZZ-LOJA-PUB'`)).rows[0].faixa);
  }
  conferir("a faixa da visao e a de faixaDeEstoque", faixas, [-1, 0, 1, 3, 4, 250].map(faixaDeEstoque));
  await comoPapel.query(`SET ROLE ${PAPEL}`);

  // ---------- Conversas e orcamento: so o canal de cliente ----------
  conferir("nao le conversa do chat interno", (await linhas(`SELECT 1 FROM "ConversaIA" WHERE "canal" <> 'LOJA'`)).length, 0);
  conferir("nao le mensagem do chat interno", (await linhas(`SELECT 1 FROM "MensagemIA" WHERE "conversaId" = $1`, [interna.id])).length, 0);
  conferir("nao cria conversa de outro canal", await codigoSql(`INSERT INTO "ConversaIA" ("id", "titulo", "usuario", "perfil", "canal", "atualizadoEm") VALUES ('zz-ia-1', 'x', 'loja:zz-x', 'PUBLICO', 'CHAT', now())`), "42501");
  conferir("nao cria conversa de administrador", await codigoSql(`INSERT INTO "ConversaIA" ("id", "titulo", "usuario", "perfil", "canal", "atualizadoEm") VALUES ('zz-ia-2', 'x', 'loja:zz-x', 'ADMIN', 'LOJA', now())`), "42501");
  conferir("cria conversa do canal da loja", await codigoSql(`INSERT INTO "ConversaIA" ("id", "titulo", "usuario", "perfil", "canal", "atualizadoEm") VALUES ('zz-ia-3', 'x', 'loja:zz-x', 'PUBLICO', 'LOJA', now())`), null);
  conferir("grava mensagem na conversa da loja", await codigoSql(`INSERT INTO "MensagemIA" ("id", "conversaId", "papel", "conteudo") VALUES ('zz-ia-m1', 'zz-ia-3', 'USUARIO', 'oi')`), null);
  conferir("nao grava mensagem em conversa interna", await codigoSql(`INSERT INTO "MensagemIA" ("id", "conversaId", "papel", "conteudo") VALUES ('zz-ia-m2', '${interna.id}', 'USUARIO', 'oi')`), "42501");
  conferir("avalia a mensagem da loja", await codigoSql(`UPDATE "MensagemIA" SET "avaliacao" = 1 WHERE "id" = 'zz-ia-m1'`), null);
  conferir("nao reescreve o texto da mensagem", await codigoSql(`UPDATE "MensagemIA" SET "conteudo" = 'x' WHERE "id" = 'zz-ia-m1'`), "42501");
  conferir("nao apaga conversa", await codigoSql(`DELETE FROM "ConversaIA" WHERE "id" = 'zz-ia-3'`), "42501");
  conferir("nao grava gasto interno", await codigoSql(`INSERT INTO "GastoIA" ("id", "tipo", "escopo", "provedor", "valorUsd", "valorBrl") VALUES ('zz-ia-g1', 'CONVERSA', 'INTERNO', 'x', 0, 0)`), "42501");
  conferir("grava gasto dos clientes", await codigoSql(`INSERT INTO "GastoIA" ("id", "tipo", "escopo", "provedor", "valorUsd", "valorBrl", "referencia") VALUES ('zz-ia-g2', 'CONVERSA', 'CLIENTES', 'x', 0, 0, 'zz-ia-3')`), null);
  conferir("nao ve gasto interno", (await linhas(`SELECT 1 FROM "GastoIA" WHERE "escopo" <> 'CLIENTES'`)).length, 0);
  conferir("da o sinal de vida", await codigoSql(`INSERT INTO "SinalDoAssistente" ("id", "sinalEm", "versao") VALUES ('zz-ia', now(), 'teste') ON CONFLICT ("id") DO UPDATE SET "sinalEm" = now()`), null);

  // MARCADOR-T3 (as tarefas seguintes acrescentam os seus blocos acima desta linha)
} catch (erro) {
  falhas++;
  console.error("ERRO NAO ESPERADO:", erro);
} finally {
  await comoPapel.query("RESET ROLE").catch(() => null);
  await dono.query(`DROP TABLE IF EXISTS "ZZ_IA_NOVA"`).catch(() => null);
  await dono.query(`DELETE FROM "GastoIA" WHERE "id" LIKE 'zz-ia-%'`).catch(() => null);
  await dono.query(`DELETE FROM "ConversaIA" WHERE "id" LIKE 'zz-ia-%'`).catch(() => null);
  await dono.query(`DELETE FROM "SinalDoAssistente" WHERE "id" = 'zz-ia'`).catch(() => null);
  await limpar().catch((erro) => console.error("nao limpou:", erro));
  await comoPapel.end();
  await dono.end();
  await prisma.$disconnect();
}

console.log(`\n${total - falhas} de ${total} ok${falhas ? `, ${falhas} FALHA(S)` : ""}`);
process.exit(falhas ? 1 : 0);
