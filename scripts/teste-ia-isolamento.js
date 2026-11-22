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

const { readFileSync, writeFileSync, mkdirSync, existsSync } = await import("node:fs");
const { default: pg } = await import("pg");

if (process.env.RISE_PRODUCAO) {
  console.error("Este teste nao roda na imagem de producao.");
  process.exit(2);
}

const { PAPEL, COLUNAS_DO_PRODUTO_PUBLICO, TABELAS_PROIBIDAS, sqlDaMigration, sqlDaMigracaoDoWhatsappDaEmpresa, sqlDaMigracaoDoPedido } = await import("../src/lib/riseAi/cliente/sqlDoPapel.js");

const MIGRATION = "prisma/migrations/20261120b_ia_papel_e_visoes/migration.sql";
// 22/11/2026: a visao da configuracao passou a entregar os dois WhatsApp da empresa (e so eles).
const MIGRATION_DO_WHATSAPP = "prisma/migrations/20261122_ia_whatsapp_da_empresa/migration.sql";
// Fase 3 (22/11/2026): o acompanhar pedido, so pela funcao `ia_situacao_do_pedido`.
const MIGRATION_DO_PEDIDO = "prisma/migrations/20261123_ia_situacao_do_pedido/migration.sql";
if (process.argv.includes("--gravar-migration")) {
  mkdirSync("prisma/migrations/20261120b_ia_papel_e_visoes", { recursive: true });
  writeFileSync(MIGRATION, sqlDaMigration());
  mkdirSync("prisma/migrations/20261122_ia_whatsapp_da_empresa", { recursive: true });
  writeFileSync(MIGRATION_DO_WHATSAPP, sqlDaMigracaoDoWhatsappDaEmpresa());
  mkdirSync("prisma/migrations/20261123_ia_situacao_do_pedido", { recursive: true });
  writeFileSync(MIGRATION_DO_PEDIDO, sqlDaMigracaoDoPedido());
  console.log(`gravado: ${MIGRATION}, ${MIGRATION_DO_WHATSAPP} e ${MIGRATION_DO_PEDIDO}`);
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

// Os pedidos de teste do acompanhar pedido (fase 3) e as tentativas deles (o numero fica no banco so como hash).
const NUMEROS_DE_TESTE = ["ZZLOJAPED1", "ZZLOJAPED2", "ZZLOJAPED3", "ZZLOJAPED9"];
async function limparPedidosDeTeste() {
  const { createHash } = await import("node:crypto");
  await prisma.envio.deleteMany({ where: { numero: 990001 } });
  await prisma.pedidoDeVenda.deleteMany({ where: { idExterno: { in: ["ZZLOJAPED1", "ZZLOJAPED2", "zzlojaped3-id"] } } });
  const hashes = NUMEROS_DE_TESTE.map((numero) => createHash("sha256").update(numero).digest("hex"));
  await prisma.$executeRawUnsafe(`DELETE FROM "TentativaDePedidoIA" WHERE "numeroHash" = ANY($1)`, hashes).catch(() => null);
}

// O jsonb devolve as chaves em outra ordem; a comparacao do teste e por texto.
const chavesOrdenadas = (valor) =>
  valor && typeof valor === "object" && !Array.isArray(valor)
    ? Object.fromEntries(Object.keys(valor).sort().map((chave) => [chave, chavesOrdenadas(valor[chave])]))
    : valor;

async function limpar() {
  await limparPedidosDeTeste();
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
// O teste da um login de uso unico ao papel (bloco da tarefa 5); o `finally` o tira mesmo se algo falhar no meio.
let papelComLogin = false;

try {
  await limpar();
  await dono.query(`DROP TABLE IF EXISTS "ZZ_IA_NOVA"`);

  // ---------- A migration e a saida do gerador ----------
  const noDisco = readFileSync(MIGRATION, "utf8").replace(/\r\n/g, "\n").trim();
  conferir("a migration e a saida do gerador", noDisco === sqlDaMigration().trim(), true);
  const doWhatsapp = existsSync(MIGRATION_DO_WHATSAPP) ? readFileSync(MIGRATION_DO_WHATSAPP, "utf8").replace(/\r\n/g, "\n").trim() : "";
  conferir("a migration do WhatsApp da empresa e a saida do gerador", doWhatsapp === sqlDaMigracaoDoWhatsappDaEmpresa().trim(), true);
  const doPedido = existsSync(MIGRATION_DO_PEDIDO) ? readFileSync(MIGRATION_DO_PEDIDO, "utf8").replace(/\r\n/g, "\n").trim() : null;
  conferir("a migration do pedido e a saida do gerador", doPedido === sqlDaMigracaoDoPedido().trim(), true);

  // ---------- O papel existe, sem superpoderes e com os tetos ----------
  const [papel] = (await dono.query(`SELECT rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolconnlimit, rolconfig, rolcanlogin FROM pg_roles WHERE rolname = $1`, [PAPEL])).rows;
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
  conferir("a visao da configuracao entrega da empresa SO os dois WhatsApp", (await colunasDe("ia_configuracao")).slice(-2), ["whatsappComercial", "whatsappTecnico"]);
  conferir("nenhuma coluna sensivel nas visoes", todas.filter((coluna) => /custo|estoque|localiza|fornecedor|ncm|margem/i.test(coluna)), []);
  conferir("as visoes rodam com o dono (sem security_invoker)", (await dono.query(`SELECT count(*)::int AS n FROM pg_class WHERE relname LIKE 'ia\\_%' AND relkind = 'v' AND reloptions::text LIKE '%security_invoker%'`)).rows[0].n, 0);

  // A empresa: o papel le os dois WhatsApp pela visao (sao publicos), e nada mais dela (CNPJ, conta, chave Pix ficam de fora).
  const daEmpresa = (await dono.query(`SELECT "celular", "whatsappTecnico" FROM "DadosDaEmpresa" WHERE "id" = 'empresa'`)).rows[0] ?? {};
  conferir("os dois WhatsApp chegam pela visao", await linhas(`SELECT "whatsappComercial", "whatsappTecnico" FROM ia_configuracao`), [{ whatsappComercial: daEmpresa.celular ?? null, whatsappTecnico: daEmpresa.whatsappTecnico ?? null }]);
  conferir("nem a chave Pix nem a conta pela visao", [await codigoSql(`SELECT "chavePix" FROM ia_configuracao`), await codigoSql(`SELECT "conta" FROM ia_configuracao`)], ["42703", "42703"]);
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

  // ---------- Tarefa 3: a camada de dados funciona SO com as concessoes do papel ----------
  const { criarDadosDoCliente } = await import("../src/lib/riseAi/cliente/dados.js");
  const dadosDoPapel = criarDadosDoCliente({ consultar: async (sql, valores = []) => (await comoPapel.query(sql, valores)).rows, baseDasFotos: "https://rise.exemplo", chaveHex: "ab".repeat(32) });
  conferir("sob o papel: busca acha o publicado", (await dadosDoPapel.buscarProdutos("zz loja produto publicado")).map((p) => p.sku), ["ZZ-LOJA-PUB"]);
  conferir("sob o papel: o oculto nao existe", await dadosDoPapel.buscarProdutos("ZZ-LOJA-OCULTO"), []);
  conferir("sob o papel: ficha", (await dadosDoPapel.fichaDoProduto("zz-loja-pub"))?.sku ?? null, "ZZ-LOJA-PUB");
  conferir("sob o papel: similares nao lanca", Array.isArray(await dadosDoPapel.similares("ZZ-LOJA-PUB")), true);
  conferir("sob o papel: conhecimento publico", (await dadosDoPapel.conhecimento("zz loja garantia de 90 dias")).map((n) => n.assunto), ["ZZ LOJA publica"]);
  conferir("sob o papel: configuracao do canal", (await dadosDoPapel.configuracaoDoCanal()).canal.nome.length > 0, true);
  conferir("sob o papel: segredos (nenhum de teste)", Object.keys(await dadosDoPapel.segredos()).sort(), ["anthropic", "openai", "turnstile"]);
  // (Linha com versao "zz-..." e sobra de um teste antigo, nao do dono: essa sai.)
  const sinalAntes = (await dono.query(`SELECT * FROM "SinalDoAssistente" WHERE "id" = 'unico' AND coalesce("versao", '') NOT LIKE 'zz-%'`)).rows[0] ?? null;
  await dadosDoPapel.darSinal({ emAndamento: 1, versao: "zz-isolamento" });
  conferir("sob o papel: da o sinal", (await linhas(`SELECT "versao" FROM "SinalDoAssistente" WHERE "id" = 'unico'`))[0]?.versao, "zz-isolamento");
  await comoPapel.query("RESET ROLE");
  if (sinalAntes) await dono.query(`UPDATE "SinalDoAssistente" SET "sinalEm" = $1, "versao" = $2, "emAndamento" = $3, "ultimoErro" = $4 WHERE "id" = 'unico'`, [sinalAntes.sinalEm, sinalAntes.versao, sinalAntes.emAndamento, sinalAntes.ultimoErro]);
  else await dono.query(`DELETE FROM "SinalDoAssistente" WHERE "id" = 'unico'`);
  await comoPapel.query(`SET ROLE ${PAPEL}`);

  // ---------- Tarefa 5: UMA conversa inteira como o usuario `rise_ia` de verdade, num processo sem as chaves do Rise ----------
  await comoPapel.query("RESET ROLE");
  // Num Postgres em que o papel JA tem login (a VPS, ou um PC com o servico configurado), este bloco trocaria a senha dele.
  if (papel?.rolcanlogin) throw new Error("O papel rise_ia ja tem login neste Postgres; este teste so roda onde ele esta sem login.");
  const { spawnSync } = await import("node:child_process");
  const { randomBytes } = await import("node:crypto");
  // Senha de uso unico, so para este teste (hexadecimal: nada a escapar). O papel volta a ficar SEM login no `finally`.
  const senha = randomBytes(24).toString("hex");
  await dono.query(`ALTER ROLE ${PAPEL} LOGIN PASSWORD '${senha}'`);
  papelComLogin = true;
  const urlDoPapel = new URL(process.env.DATABASE_URL);
  urlDoPapel.username = PAPEL;
  urlDoPapel.password = senha;
  const sessaoDoFilho = `zz-${"f".repeat(29)}`;
  const filho = spawnSync(process.execPath, ["scripts/lib/conversaSobOPapel.js", sessaoDoFilho], {
    // Ambiente LIMPO: so o que o Node precisa para subir no Windows, e a URL do papel.
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, DATABASE_URL: urlDoPapel.toString() },
    encoding: "utf8",
    timeout: 120000,
  });
  const linhaDoResultado = String(filho.stdout ?? "").split("\n").find((linha) => linha.startsWith("RESULTADO "));
  const doFilho = linhaDoResultado ? JSON.parse(linhaDoResultado.slice("RESULTADO ".length)) : { erro: `sem resultado: ${String(filho.stderr ?? "").slice(-600)}` };
  conferir("o filho terminou bem", [doFilho.ok, doFilho.erro ?? null], [true, null]);
  conferir("o filho fala com o banco como rise_ia", doFilho.usuarioDoBanco, PAPEL);
  conferir("o filho nao tem nenhuma chave do Rise no ambiente", doFilho.chavesDoRiseNoAmbiente, []);
  conferir("a conversa inteira funciona so com as concessoes do papel", [doFilho.cartoes, doFilho.texto], [["ZZ-LOJA-PUB"], "Veja o produto acima."]);
  conferir("o mesmo processo nao le a tabela de produtos", [doFilho.leuProduto, doFilho.erroAoLerProduto], [false, "permissao negada"]);
  const gravadoPeloFilho = await prisma.conversaIA.findUnique({ where: { id: doFilho.conversaId ?? "nao-existe" }, include: { mensagens: { orderBy: [{ criadoEm: "asc" }, { id: "asc" }] } } });
  conferir("a conversa do filho ficou gravada no canal LOJA", [gravadoPeloFilho?.canal, gravadoPeloFilho?.perfil, gravadoPeloFilho?.mensagens.map((m) => m.papel)], ["LOJA", "PUBLICO", ["USUARIO", "ASSISTENTE"]]);
  conferir("o gasto do filho entrou nos CLIENTES", (await prisma.gastoIA.findMany({ where: { referencia: doFilho.conversaId ?? "nao-existe" }, select: { tipo: true, escopo: true } })), [{ tipo: "CONVERSA", escopo: "CLIENTES" }]);
  await dono.query(`DELETE FROM "GastoIA" WHERE "referencia" = $1`, [doFilho.conversaId ?? "nao-existe"]);
  await dono.query(`ALTER ROLE ${PAPEL} NOLOGIN PASSWORD NULL`);
  papelComLogin = false;
  conferir("o papel voltou a ficar sem login", (await dono.query(`SELECT rolcanlogin FROM pg_roles WHERE rolname = $1`, [PAPEL])).rows[0].rolcanlogin, false);
  await comoPapel.query(`SET ROLE ${PAPEL}`);

  // ---------- Tarefa 6: o SERVICO de verdade (scripts/ia-processo.js), como rise_ia, num ambiente limpo ----------
  await comoPapel.query("RESET ROLE");
  const { spawn } = await import("node:child_process");
  const sinalDoDono = (await dono.query(`SELECT * FROM "SinalDoAssistente" WHERE "id" = 'unico' AND coalesce("versao", '') NOT LIKE 'zz-%'`)).rows[0] ?? null;
  const senhaDoServico = randomBytes(24).toString("hex");
  await dono.query(`ALTER ROLE ${PAPEL} LOGIN PASSWORD '${senhaDoServico}'`);
  papelComLogin = true;
  const urlDoServico = new URL(process.env.DATABASE_URL);
  urlDoServico.username = PAPEL;
  urlDoServico.password = senhaDoServico;
  const PORTA = 18787;
  const ORIGEM_DA_LOJA = "https://www.4hobby.com.br";
  const servico = spawn(process.execPath, ["scripts/ia-processo.js"], {
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      DATABASE_URL: urlDoServico.toString(),
      IA_SEGREDO: "ab".repeat(32),
      IA_ORIGENS: ORIGEM_DA_LOJA,
      IA_BASE_DAS_FOTOS: "https://rise.4hobby.com.br",
      IA_PORTA: String(PORTA),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let saidaDoServico = "";
  servico.stdout.on("data", (pedaco) => (saidaDoServico += pedaco));
  servico.stderr.on("data", (pedaco) => (saidaDoServico += pedaco));
  try {
    let status = null;
    for (let tentativa = 0; tentativa < 80 && !status; tentativa++) {
      await new Promise((resolver) => setTimeout(resolver, 250));
      status = await fetch(`http://127.0.0.1:${PORTA}/status`).then((r) => r.json()).catch(() => null);
    }
    conferir("o servico sobe e responde /status", status !== null, true);
    // No PC o dono nunca ligou o chat nem colou as chaves: o servico TEM de dizer desligado.
    conferir("de fabrica, o servico diz desligado", [status?.ligado, status?.nome], [false, (await prisma.configuracaoIA.findUnique({ where: { id: "unica" } }))?.dados?.chatDaLoja?.nome ?? "Hobi"]);
    const chat = await fetch(`http://127.0.0.1:${PORTA}/chat`, { method: "POST", headers: { "Content-Type": "application/json", Origin: ORIGEM_DA_LOJA }, body: JSON.stringify({ sessaoId: "0".repeat(32), mensagem: "oi" }) });
    conferir("desligado, o /chat responde 503", [chat.status, (await chat.json()).erro], [503, "desligado"]);
    conferir("de outra origem, 403", (await fetch(`http://127.0.0.1:${PORTA}/chat`, { method: "POST", headers: { Origin: "https://outro.site" }, body: "{}" })).status, 403);
    conferir("qualquer outro caminho, 404", (await fetch(`http://127.0.0.1:${PORTA}/mcp`)).status, 404);
    const sinalDoServico = (await dono.query(`SELECT "versao", "sinalEm" FROM "SinalDoAssistente" WHERE "id" = 'unico'`)).rows[0];
    conferir("o servico deu o sinal de vida", [sinalDoServico?.versao, Date.now() - new Date(`${sinalDoServico?.sinalEm?.toISOString?.().replace("Z", "") ?? ""}Z`).getTime() < 120000], ["dev", true]);
  } finally {
    servico.kill();
    await new Promise((resolver) => servico.once("exit", resolver));
    if (falhas) console.log(`--- saida do servico ---\n${saidaDoServico.slice(-1500)}`);
    await dono.query(`ALTER ROLE ${PAPEL} NOLOGIN PASSWORD NULL`);
    papelComLogin = false;
    if (sinalDoDono) await dono.query(`UPDATE "SinalDoAssistente" SET "sinalEm" = $1, "versao" = $2, "emAndamento" = $3, "ultimoErro" = $4 WHERE "id" = 'unico'`, [sinalDoDono.sinalEm, sinalDoDono.versao, sinalDoDono.emAndamento, sinalDoDono.ultimoErro]);
    else await dono.query(`DELETE FROM "SinalDoAssistente" WHERE "id" = 'unico'`);
  }
  await comoPapel.query(`SET ROLE ${PAPEL}`);

  // ---------- Fase 3 (22/11/2026): o pedido so pela funcao, com a prova e as tentativas contadas no banco ----------
  await comoPapel.query("RESET ROLE");
  await limparPedidosDeTeste();
  const pedidoBase = {
    status: "ENVIADO",
    statusDaOrigem: "enviado",
    statusDoEnvio: "EM_TRANSITO",
    dataDaVenda: new Date("2026-11-20T15:00:00Z"),
    atualizadoNaOrigemEm: new Date("2026-11-21T12:30:00Z"),
    enderecoDeEntrega: {},
    pagamento: [],
    envio: { transportadora: "Correios", rastreio: "ZZJSON1BR", link: "https://rastreio.exemplo/ZZJSON1BR" },
    historico: [],
    totalProdutos: 10,
    desconto: 0,
    freteCobrado: 0,
    total: 10,
    nomeDoComprador: "ZZ LOJA comprador",
    documentoDoComprador: "123.456.789-09",
    emailDoComprador: "zz@exemplo.com",
  };
  const daLoja = await prisma.pedidoDeVenda.create({ data: { ...pedidoBase, canal: "LOJA_INTEGRADA", origem: "LOJA_INTEGRADA", idExterno: "ZZLOJAPED1", numero: "ZZLOJAPED1" } });
  await prisma.pedidoDeVenda.create({ data: { ...pedidoBase, canal: "MERCADO_LIVRE", origem: "MERCADO_LIVRE", idExterno: "ZZLOJAPED2", numero: "ZZLOJAPED2" } });
  await prisma.pedidoDeVenda.create({ data: { ...pedidoBase, canal: "BLING", origem: "BLING", idExterno: "zzlojaped3-id", numero: "ZZLOJAPED3X", blingNumero: "ZZLOJAPED3", envio: {} } });
  await prisma.envio.create({
    data: { numero: 990001, pedidoDeVendaId: daLoja.id, remetente: {}, destinatario: {}, comprimentoCm: 1, larguraCm: 1, alturaCm: 1, pesoKg: 1, valorDeclarado: 1, transportadoraNome: "Jadlog", rastreio: "ZZ123BR", linkDoRastreio: "https://rastreio.exemplo/ZZ123BR" },
  });
  const funcao = (await dono.query(`SELECT p.prosecdef, has_function_privilege('public', p.oid, 'EXECUTE') AS publico, has_function_privilege($1, p.oid, 'EXECUTE') AS papel FROM pg_proc p WHERE p.proname = 'ia_situacao_do_pedido'`, [PAPEL])).rows[0] ?? null;
  conferir("a funcao roda com o dono e so o papel a executa", [funcao?.prosecdef, funcao?.publico, funcao?.papel], [true, false, true]);
  await comoPapel.query(`SET ROLE ${PAPEL}`);
  const situacao = async (numero, prova) => chavesOrdenadas((await comoPapel.query(`SELECT ia_situacao_do_pedido($1, $2) AS r`, [numero, prova])).rows[0].r);
  const naoAchado = { situacao: "nao_achado" };
  conferir(
    "pedido da loja: acha com o CPF formatado e o numero em minusculas, com o rastreio do envio do Rise",
    await situacao("zzlojaped1", "123.456.789-09 "),
    chavesOrdenadas({ situacao: "achado", pedido: { numero: "ZZLOJAPED1", canal: "LOJA_INTEGRADA", data: "2026-11-20", status: "ENVIADO", statusDoEnvio: "EM_TRANSITO", transportadora: "Jadlog", rastreio: "ZZ123BR", linkDoRastreio: "https://rastreio.exemplo/ZZ123BR", atualizadoEm: "2026-11-21T12:30:00Z" } }),
  );
  conferir("acha pelo e-mail com maiusculas e espaco", (await situacao("ZZLOJAPED1", " ZZ@Exemplo.com "))?.situacao, "achado");
  const doBling = await situacao("ZZLOJAPED3", "12345678909");
  conferir("pedido do Bling: acha pelo numero do Bling, sem rastreio", [doBling?.situacao, doBling?.pedido?.canal, doBling?.pedido?.rastreio], ["achado", "BLING", null]);
  conferir("documento errado: nao achado", await situacao("ZZLOJAPED1", "98765432100"), naoAchado);
  conferir("pedido do Mercado Livre: a MESMA resposta de nao achado", await situacao("ZZLOJAPED2", "12345678909"), naoAchado);
  conferir("pedido que nao existe: a mesma resposta", await situacao("ZZLOJAPED9", "12345678909"), naoAchado);
  conferir("prova curta nao conta como tentativa", await situacao("ZZLOJAPED1", "123"), naoAchado);
  for (let i = 0; i < 4; i++) await situacao("ZZLOJAPED1", "98765432100");
  conferir("depois de 5 erros no numero, nem a prova certa passa no dia", await situacao("ZZLOJAPED1", "12345678909"), { situacao: "limite" });
  conferir("o papel nao escreve as tentativas direto", await codigoSql(`INSERT INTO "TentativaDePedidoIA" ("numeroHash", "dia") VALUES ('zz', current_date)`), "42501");
  conferir("o papel nao altera a funcao", await codigoSql(`CREATE OR REPLACE FUNCTION ia_situacao_do_pedido(text, text) RETURNS jsonb LANGUAGE sql AS 'SELECT NULL::jsonb'`), "42501");
  await comoPapel.query("RESET ROLE");
  const guardado = (await dono.query(`SELECT "numeroHash" FROM "TentativaDePedidoIA" WHERE "numeroHash" LIKE '%ZZLOJA%'`)).rows;
  conferir("o numero do pedido nunca fica no banco em texto", guardado, []);
  await limparPedidosDeTeste();
  await comoPapel.query(`SET ROLE ${PAPEL}`);

  // MARCADOR-T7 (as tarefas seguintes acrescentam os seus blocos acima desta linha)
} catch (erro) {
  falhas++;
  console.error("ERRO NAO ESPERADO:", erro);
} finally {
  await comoPapel.query("RESET ROLE").catch(() => null);
  if (papelComLogin) await dono.query(`ALTER ROLE ${PAPEL} NOLOGIN PASSWORD NULL`).catch((erro) => console.error("NAO TIREI O LOGIN DO PAPEL:", erro));
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
