import "dotenv/config";

/**
 * Copia de desenvolvimento: restaura no Postgres DESTE PC o backup da VPS e tira dele os tokens que
 * rotacionam. E tambem o restore de teste mensal: toda copia prova que o backup restaura.
 *
 *   npm run copia:atualizar                        # baixa o dump mais novo do R2 e restaura no banco do .env
 *   npm run copia:atualizar -- --dump=<arquivo>    # restaura um dump que ja esta no disco
 *   npm run copia:atualizar -- --banco=sistema_rise_ensaio   # restaura AO LADO, sem tocar no banco do .env
 *   --manter-conexoes   nao apaga os tokens (so para a volta atras da migracao)
 *   --sem-arquivos      nao copia dados/produtos e dados/coleta do R2
 *
 * Por que apaga as Conexao do ML e do Bling: o refresh token dos dois ROTACIONA a cada renovacao. Uma copia
 * no PC que renovasse o token derrubaria o da VPS, e a falha pareceria erro da API. Depois de rodar, o PC so
 * fala com ML e Bling se o dono os reautorizar pela tela Integracoes. O token da Loja Integrada e fixo e fica.
 *
 * Travas, todas ANTES de apagar qualquer coisa:
 *   - o banco precisa ser desta maquina (com a URL da VPS no .env, apagaria a producao);
 *   - restaurando o banco do .env: nenhum servidor nas portas 3000/3001/3002 e nenhum worker com sinal no
 *     ultimo minuto, e uma copia de seguranca do banco atual com nome fora da retencao do `npm run backup`;
 *   - o dump precisa ser lido pelo pg_restore e ter dados de tabela;
 *   - opcao desconhecida e recusada (um --manter-conexao com erro de digitacao apagaria os tokens).
 */

import { existsSync, mkdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

import {
  argumentosDeRestore,
  bancoDeEnsaioValido,
  dumpMaisRecente,
  ehBancoLocal,
  nomeDaCopiaDeSeguranca,
  sqlLimparConexoes,
} from "../src/lib/copiaLocal.js";
import { binario, conexaoDaUrl, rodar } from "./lib/postgres.js";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(aqui, "..");
const PASTA_BACKUP = path.join(RAIZ, "dados", "backup");
const OPCOES = new Set(["dump", "banco", "manter-conexoes", "sem-arquivos"]);
const PORTAS = [3000, 3001, 3002];

function recusar(motivo) {
  console.error(`\nRECUSADO: ${motivo}\nNada foi apagado.`);
  process.exit(1);
}

const argumentos = new Map();
for (const arg of process.argv.slice(2)) {
  const [nome, ...resto] = arg.replace(/^--/, "").split("=");
  if (!arg.startsWith("--") || !OPCOES.has(nome)) recusar(`opcao desconhecida: ${arg}`);
  argumentos.set(nome, resto.length ? resto.join("=") : true);
}

if (!ehBancoLocal(process.env.DATABASE_URL)) {
  recusar("o DATABASE_URL nao aponta para um Postgres desta maquina (localhost). Restaurar apaga o banco inteiro.");
}
const conexao = conexaoDaUrl(process.env.DATABASE_URL);
const principal = conexao.PGDATABASE;
const alvo = typeof argumentos.get("banco") === "string" ? argumentos.get("banco") : principal;
const ensaio = alvo !== principal;
if (ensaio && !bancoDeEnsaioValido(alvo, principal)) {
  recusar(`--banco precisa comecar por "${principal}_" e ter so minusculas, numeros e "_" (ex.: ${principal}_ensaio).`);
}
const env = { ...conexao, PGDATABASE: alvo };

async function consultar(banco, sql) {
  const cliente = new pg.Client({
    host: conexao.PGHOST,
    port: Number(conexao.PGPORT),
    user: conexao.PGUSER,
    password: conexao.PGPASSWORD,
    database: banco,
  });
  await cliente.connect();
  try {
    return await cliente.query(sql);
  } finally {
    await cliente.end();
  }
}

function portaOcupada(porta) {
  return new Promise((resolver) => {
    const soquete = net.connect({ host: "127.0.0.1", port: porta });
    soquete.setTimeout(1000);
    soquete.on("connect", () => {
      soquete.destroy();
      resolver(true);
    });
    soquete.on("timeout", () => {
      soquete.destroy();
      resolver(false);
    });
    soquete.on("error", () => resolver(false));
  });
}

/// O nome ja foi validado (o principal vem do .env, o de ensaio por bancoDeEnsaioValido), e vai como parametro.
async function bancoExiste(banco) {
  const cliente = new pg.Client({
    host: conexao.PGHOST,
    port: Number(conexao.PGPORT),
    user: conexao.PGUSER,
    password: conexao.PGPASSWORD,
    database: "postgres",
  });
  await cliente.connect();
  try {
    const resposta = await cliente.query("SELECT 1 FROM pg_database WHERE datname = $1", [banco]);
    return resposta.rowCount > 0;
  } finally {
    await cliente.end();
  }
}

/// Worker com sinal no ultimo minuto (o sinal e a cada 15 s). Tabela ausente = banco sem worker nenhum.
async function workerVivo(banco) {
  try {
    const resposta = await consultar(
      banco,
      `SELECT count(*)::int AS n FROM "WorkerColeta" WHERE "sinalEm" > (NOW() AT TIME ZONE 'UTC') - interval '1 minute'`,
    );
    return resposta.rows[0].n > 0;
  } catch (erro) {
    if (erro.code === "42P01") return false;
    throw erro;
  }
}

console.log(`Banco alvo: ${alvo}${ensaio ? " (ensaio, ao lado do banco do .env, que nao e tocado)" : " (o do .env)"}`);

// 1. Quem esta usando o banco que vai ser apagado.
const existe = await bancoExiste(alvo);
if (!ensaio) {
  const ocupadas = [];
  for (const porta of PORTAS) if (await portaOcupada(porta)) ocupadas.push(porta);
  if (ocupadas.length) recusar(`ha servidor no ar na(s) porta(s) ${ocupadas.join(", ")}. Pare os servidores das tres pastas antes.`);
  if (existe && (await workerVivo(alvo))) recusar("ha worker no ar (sinal no ultimo minuto). Rode `npm run worker:parar` antes.");
}

// 2. O dump: o informado ou o mais novo do R2.
let dump;
if (typeof argumentos.get("dump") === "string") {
  dump = path.resolve(argumentos.get("dump"));
  if (!existsSync(dump)) recusar(`o dump nao existe: ${dump}`);
} else {
  const remoto = process.env.RCLONE_REMOTO;
  if (!remoto) recusar("sem --dump e sem RCLONE_REMOTO no .env, nao ha de onde tirar o backup.");
  const lista = await rodar("rclone", ["lsf", "--files-only", `${remoto}/banco/diario`], {}, 2 * 60 * 1000);
  const nome = dumpMaisRecente(lista.split(/\r?\n/).filter(Boolean), principal);
  if (!nome) recusar(`nenhum backup automatico em ${remoto}/banco/diario.`);
  mkdirSync(PASTA_BACKUP, { recursive: true });
  dump = path.join(PASTA_BACKUP, nome);
  console.log(`Baixando ${nome} do R2...`);
  await rodar("rclone", ["copyto", `${remoto}/banco/diario/${nome}`, dump], {}, 30 * 60 * 1000);
}

// 3. Um dump que o pg_restore nao le nao e backup, e ele so e conferido aqui, ANTES de apagar.
const indice = await rodar(binario("pg_restore"), ["--list", dump], {}, 60 * 1000);
const tabelas = indice.split("\n").filter((linha) => /TABLE DATA/.test(linha)).length;
if (tabelas === 0) recusar(`o dump ${path.basename(dump)} nao tem dados de tabela.`);
console.log(`Dump conferido: ${path.basename(dump)} · ${tabelas} tabela(s) com dados`);

// 4. Copia de seguranca do banco do .env antes de apaga-lo.
if (!ensaio && existe) {
  mkdirSync(PASTA_BACKUP, { recursive: true });
  const copia = path.join(PASTA_BACKUP, nomeDaCopiaDeSeguranca(principal, new Date()));
  await rodar(binario("pg_dump"), ["--format=custom", "--no-owner", "--no-password", `--file=${copia}`], env, 10 * 60 * 1000);
  console.log(`Copia de seguranca do banco atual: ${path.relative(RAIZ, copia)}`);
}

// 5. Recriar e restaurar.
const restore = argumentosDeRestore({ dump, banco: alvo });
const inicio = Date.now();
await rodar(binario("dropdb"), restore.dropdb, env, 2 * 60 * 1000);
await rodar(binario("createdb"), restore.createdb, env, 2 * 60 * 1000);
await rodar(binario("pg_restore"), restore.pgRestore, env, 30 * 60 * 1000);
console.log(`Restaurado em ${((Date.now() - inicio) / 1000).toFixed(1)} s`);

// 6. Tokens que rotacionam.
if (argumentos.has("manter-conexoes")) {
  console.log("Conexao mantidas (--manter-conexoes): ML e Bling continuam com os tokens do dump.");
} else {
  const apagadas = await consultar(alvo, sqlLimparConexoes());
  console.log(`Conexao do ML e do Bling apagadas: ${apagadas.rowCount}. Reautorize pela tela Integracoes se precisar.`);
}

// 7. Arquivos. `copy` e nao `sync`: nunca apaga arquivo do PC.
if (ensaio || argumentos.has("sem-arquivos")) {
  console.log("Arquivos nao copiados (ensaio ou --sem-arquivos).");
} else if (!process.env.RCLONE_REMOTO) {
  console.log("Arquivos nao copiados: RCLONE_REMOTO vazio no .env.");
} else {
  for (const pasta of ["produtos", "coleta"]) {
    await rodar("rclone", ["copy", `${process.env.RCLONE_REMOTO}/${pasta}`, path.join(RAIZ, "dados", pasta)], {}, 60 * 60 * 1000);
    console.log(`dados/${pasta} atualizado do R2.`);
  }
}

// 8. Contagens, para comparar com a origem.
const contagens = await consultar(
  alvo,
  `SELECT (SELECT count(*) FROM "Produto")::int AS produtos,
          (SELECT count(*) FROM "ProdutoColetado")::int AS coletados,
          (SELECT count(*) FROM "ProdutoArquivo")::int AS arquivos,
          (SELECT count(*) FROM _prisma_migrations)::int AS migrations,
          (SELECT string_agg("servico"::text, ', ' ORDER BY "servico") FROM "Conexao") AS conexoes`,
);
const c = contagens.rows[0];
console.log(
  `\nCopia pronta em ${alvo}: ${c.produtos} produto(s), ${c.coletados} coletado(s), ${c.arquivos} arquivo(s), ` +
    `${c.migrations} migration(s); Conexao: ${c.conexoes ?? "nenhuma"}.`,
);
if (ensaio) console.log(`Banco de ensaio mantido para conferencia. Para apagar: dropdb ${alvo}`);
