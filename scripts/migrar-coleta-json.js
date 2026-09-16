import "dotenv/config";

/**
 * Carga UNICA dos produtos.json antigos para o banco — 15/09/2026.
 *
 * Ate esta data a coleta gravava em dados/coleta/<dominio>/produtos.json, e a
 * lista enviada pelo fornecedor em arquivos/manifesto.json. Este script passa
 * tudo para `ProdutoColetado` e `FonteColeta` pelo mesmo `gravarColeta` que o
 * worker usa, com a data de cada coleta (e nao a de hoje) como base da serie.
 *
 *   node scripts/migrar-coleta-json.js            # so mostra o que faria
 *   node scripts/migrar-coleta-json.js --aplicar  # grava, confere e move os JSON
 *
 * Os JSON so saem de dados/coleta/ depois que a contagem no banco bate com a de
 * cada arquivo — e vao para dados/backup/, nao para o lixo. Os arquivos originais
 * do fornecedor (HTML, planilha) ficam onde estao: o worker reprocessa deles.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename } from "node:fs/promises";
import path from "node:path";

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("../src/lib/db.js");
const { gravarColeta } = await import("../src/lib/coleta/banco.js");
const { chaveDoProduto } = await import("../src/lib/coleta/linha.js");

const APLICAR = process.argv.includes("--aplicar");
const RAIZ = path.join(process.cwd(), "dados", "coleta");
const BACKUP = path.join(process.cwd(), "dados", "backup", "coleta-json-20260915");

const lerJson = async (arquivo) => JSON.parse(await readFile(arquivo, "utf-8"));

const pastas = (await readdir(RAIZ, { withFileTypes: true })).filter((e) => e.isDirectory());
const plano = [];

for (const pasta of pastas) {
  const arquivoProdutos = path.join(RAIZ, pasta.name, "produtos.json");
  if (!existsSync(arquivoProdutos)) continue;

  const coleta = await lerJson(arquivoProdutos);
  const dominio = coleta.fonte?.dominio ?? pasta.name;
  const secao = coleta.fonte?.secao ?? null;

  const fonte =
    (await prisma.fonteColeta.findFirst({ where: { dominio, prefixoUrl: secao } })) ??
    (await prisma.fonteColeta.findFirst({ where: { dominio } }));

  const produtos = coleta.produtos ?? [];
  const chaves = new Set(produtos.map(chaveDoProduto).filter(Boolean));

  const arquivoManifesto = path.join(RAIZ, pasta.name, "arquivos", "manifesto.json");
  const manifesto = existsSync(arquivoManifesto) ? await lerJson(arquivoManifesto) : null;

  plano.push({ pasta: pasta.name, arquivoProdutos, arquivoManifesto, coleta, fonte, produtos, esperado: chaves.size, manifesto });
}

console.log("\nPASTA                      FONTE                       JSON  UNICOS  ORIGEM   COLETA");
for (const item of plano) {
  console.log(
    `${item.pasta.padEnd(26)} ${String(item.fonte?.nome ?? "— SEM FONTE —").padEnd(27)} ` +
      `${String(item.produtos.length).padStart(4)}  ${String(item.esperado).padStart(6)}  ` +
      `${String(item.coleta.origem ?? "site").padEnd(8)} ${item.coleta.coletadoEm}` +
      (item.manifesto ? `  · lista de ${item.manifesto.arquivos?.length ?? 0} arquivo(s)` : ""),
  );
}

const semFonte = plano.filter((item) => !item.fonte);
if (semFonte.length > 0) {
  console.log(`\n${semFonte.length} pasta(s) sem fonte cadastrada — nao entram no banco e nao sao movidas.`);
}

if (!APLICAR) {
  console.log("\nNada foi gravado. Rode com --aplicar para gravar.");
  await prisma.$disconnect();
  process.exit(0);
}

let tudoCerto = true;

for (const item of plano.filter((i) => i.fonte)) {
  const comecou = Date.now();

  const gravacao = await gravarColeta({
    fonte: item.fonte,
    produtos: item.produtos,
    origem: item.coleta.origem ?? "site",
    resumo: item.coleta.resumo ?? null,
    duracaoMs: item.coleta.duracaoMs ?? null,
    coletadoEm: new Date(item.coleta.coletadoEm),
  });

  // A lista enviada: quais arquivos e quando o fornecedor mandou.
  const listaEnviadaEm = item.manifesto?.enviadoEm ?? item.coleta.listaEnviadaEm ?? null;
  if (item.manifesto || listaEnviadaEm) {
    await prisma.fonteColeta.update({
      where: { id: item.fonte.id },
      data: {
        ...(item.manifesto ? { listaArquivos: item.manifesto.arquivos ?? [] } : {}),
        listaEnviadaEm: listaEnviadaEm ? new Date(listaEnviadaEm) : null,
      },
    });
  }

  const noBanco = await prisma.produtoColetado.count({ where: { fonteId: item.fonte.id } });
  const confere = noBanco === item.esperado;
  if (!confere) tudoCerto = false;

  console.log(
    `${confere ? "ok   " : "FALHA"} ${item.fonte.nome.padEnd(27)} ${noBanco} no banco, ${item.esperado} esperados · ` +
      `${gravacao.novos} novo(s), ${gravacao.semChave} sem chave · ${Date.now() - comecou} ms`,
  );
}

if (!tudoCerto) {
  console.log("\nA contagem nao bateu em alguma fonte. Os JSON FICARAM em dados/coleta/.");
  await prisma.$disconnect();
  process.exit(1);
}

// Tudo conferido: os JSON saem do caminho da aplicacao, guardados.
for (const item of plano.filter((i) => i.fonte)) {
  const destino = path.join(BACKUP, item.pasta);
  await mkdir(destino, { recursive: true });
  await rename(item.arquivoProdutos, path.join(destino, "produtos.json"));
  if (item.manifesto) await rename(item.arquivoManifesto, path.join(destino, "manifesto.json"));
}

// Os .json.gz de "localhost" sao retratos do teste antigo da coleta no banco
// (gravar.js, removido). Nao pertencem a fonte nenhuma.
const retratos = path.join(RAIZ, "localhost");
if (existsSync(retratos)) {
  await mkdir(BACKUP, { recursive: true });
  await rename(retratos, path.join(BACKUP, "localhost"));
}

console.log(`\nJSON movidos para ${path.relative(process.cwd(), BACKUP)}`);
await prisma.$disconnect();
