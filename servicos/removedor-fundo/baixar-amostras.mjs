/**
 * Sorteia fotos de produtos de CONCORRENTES ja coletados e baixa para servir de
 * amostra no teste dos modelos de remocao de fundo.
 *
 *   node servicos/removedor-fundo/baixar-amostras.mjs [--termo=arduino] [--quantidade=10] [--por-loja=2]
 *
 * Grava em servicos/removedor-fundo/testes/amostras/ (fora do git) as fotos e um
 * `manifesto.json` com de onde cada uma veio. NAO grava nada em produto nenhum.
 *
 * Educado como a coleta: `buscarBytes` le o robots.txt e espera a janela do dominio
 * (2 s, ou o Crawl-delay do site) entre uma foto e outra, e as fotos sao baixadas
 * uma de cada vez. Sao ~10 requisicoes no total.
 */

import "dotenv/config";
import { register } from "node:module";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import pg from "pg";

// O codigo da coleta usa o alias "@/", que so o Next conhece: sem isto o Node nao acha.
register(new URL("../../scripts/resolver-alias.js", import.meta.url), pathToFileURL("./"));
const { buscarBytes } = await import("../../src/lib/coleta/buscar.js");

const argumentos = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((a) => a.startsWith("--"))
    .map((a) => a.slice(2).split("=")),
);
const TERMO = argumentos.termo ?? "arduino";
const QUANTIDADE = Number(argumentos.quantidade ?? 10);
const POR_LOJA = Number(argumentos["por-loja"] ?? 2);

// A propria loja tambem esta cadastrada como fonte de concorrente (para acompanhar o
// preco dela nos marketplaces). Foto dela nao e foto de concorrente, e o teste pede
// a dos outros.
const EXCLUIR = (argumentos.excluir ?? "4hobby").split(",").map((nome) => nome.trim().toLowerCase());

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), "testes", "amostras");

// O tipo pelos bytes, como faz o cadastro: CDN de loja devolve `octet-stream`.
function extensaoPelosBytes(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpg";
  if (bytes.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "png";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") {
    return "webp";
  }
  return null;
}

const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
await cliente.connect();

// So endereco http: a foto em base64 no banco (Nightech) nao e o que o cadastro
// usaria. Ordem aleatoria no proprio banco, e o limite por loja em JS, para o teste
// pegar fundos de lojas diferentes (branco, colorido, com sombra).
const { rows } = await cliente.query(
  `select p.id, p.nome, p.imagens->>0 as img, f.id as "fonteId", f.nome as fonte
     from "ProdutoColetado" p
     join "FonteColeta" f on f.id = p."fonteId"
    where f.tipo = 'CONCORRENTE'
      and p.nome ilike $1
      and lower(f.nome) <> all($2::text[])
      and jsonb_typeof(p.imagens) = 'array'
      and (p.imagens->>0) ~ '^https?://'
    order by random()
    limit 500`,
  [`%${TERMO}%`, EXCLUIR],
);
await cliente.end();

const porLoja = new Map();
const sorteadas = [];
for (const linha of rows) {
  if (sorteadas.length >= QUANTIDADE) break;
  const usadas = porLoja.get(linha.fonteId) ?? 0;
  if (usadas >= POR_LOJA) continue;
  porLoja.set(linha.fonteId, usadas + 1);
  sorteadas.push(linha);
}

await rm(PASTA, { recursive: true, force: true });
await mkdir(PASTA, { recursive: true });

const manifesto = [];
for (const [indice, linha] of sorteadas.entries()) {
  const resposta = await buscarBytes(linha.img);
  const extensao = resposta.ok ? extensaoPelosBytes(resposta.bytes) : null;

  if (!resposta.ok || !extensao) {
    console.log(`${indice + 1}. FALHOU  ${linha.fonte}: ${resposta.erro ?? "formato desconhecido"} (${linha.img})`);
    continue;
  }

  const arquivo = `${String(manifesto.length + 1).padStart(2, "0")}.${extensao}`;
  await writeFile(path.join(PASTA, arquivo), resposta.bytes);
  manifesto.push({ arquivo, fonte: linha.fonte, produto: linha.nome, endereco: linha.img, bytes: resposta.bytes.length });
  console.log(`${indice + 1}. ok      ${arquivo}  ${(resposta.bytes.length / 1024).toFixed(0)} KB  ${linha.fonte} | ${linha.nome.slice(0, 60)}`);
}

await writeFile(path.join(PASTA, "manifesto.json"), JSON.stringify(manifesto, null, 2));
console.log(`\n${manifesto.length} foto(s) em ${PASTA}`);
