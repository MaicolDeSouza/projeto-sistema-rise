/**
 * GRAVA no Rise os vinculos que o dono marcou na pagina de `scripts/vincular-fornecedores-gerar.js` (05/11/2026). Le o
 * `vinculos-fortek-nightech.json` salvo pela pagina e chama `marcarReferencias` (src/lib/referencias/marcar.js) por
 * produto: uma linha de fornecedor por caixa marcada, com codigo, descricao, preco com impostos e link; NUNCA padrao (o
 * custo do produto nao muda) e nada vai ao Bling, a Loja Integrada ou ao Mercado Livre.
 *
 * Sem `--confirmo` so imprime o que faria. Produto com `nenhum: true` ou sem fornecedor marcado e ignorado.
 *
 * COMO RODA NA VPS (o JSON vai embutido antes do script, tudo pela entrada do comando, numa conexao so):
 *
 *   { printf 'globalThis.ESCOLHAS = '; cat ~/Downloads/vinculos-fortek-nightech.json; printf ';\n'; \
 *     cat scripts/vincular-fornecedores-aplicar.js; } \
 *     | ssh -i ~/.ssh/rise_vps rise@179.199.150.221 "cd /srv/rise/app && docker compose exec -T app node --input-type=module - --confirmo"
 *
 * No PC: `node scripts/vincular-fornecedores-aplicar.js --arquivo=<json> [--confirmo]` (usa o .env).
 * `VINCULAR_SO_FUNCOES=1` so exporta as funcoes (teste sem banco).
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const RAIZ = existsSync("/app/scripts/resolver-alias.js") ? "/app" : process.cwd();

const texto = (valor) => String(valor ?? "").trim();

/**
 * O plano a partir do JSON salvo: `[{ sku, adicionar: [{ fonte, codigo }] }]`, por SKU. Ignora `nenhum`, produto sem
 * fornecedor, item sem fonte ou sem codigo, e repetidos (mesma fonte e codigo, sem caixa).
 */
export function planoDasEscolhas(escolhas) {
  const produtos = escolhas?.produtos ?? {};
  const plano = [];
  for (const sku of Object.keys(produtos).sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }))) {
    const escolha = produtos[sku] ?? {};
    if (escolha.nenhum) continue;
    const vistos = new Set();
    const adicionar = [];
    for (const item of escolha.fornecedores ?? []) {
      const fonte = texto(item?.fonte);
      const codigo = texto(item?.codigo);
      if (!fonte || !codigo) continue;
      const chave = `${fonte.toLowerCase()}|${codigo.toLowerCase()}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      adicionar.push({ fonte, codigo });
    }
    if (adicionar.length > 0) plano.push({ sku, adicionar });
  }
  return plano;
}

const opcao = (nome) => process.argv.find((arg) => arg.startsWith(`--${nome}=`))?.split("=").slice(1).join("=") ?? null;

async function main() {
  const confirmo = process.argv.includes("--confirmo");
  const arquivo = opcao("arquivo");
  const escolhas = globalThis.ESCOLHAS ?? (arquivo ? JSON.parse(await readFile(arquivo, "utf8")) : null);
  if (!escolhas) {
    console.error("Faltam as escolhas: embuta `globalThis.ESCOLHAS = {...};` antes do script ou passe --arquivo=<json>.");
    process.exit(2);
  }
  const plano = planoDasEscolhas(escolhas);
  const vinculos = plano.reduce((soma, item) => soma + item.adicionar.length, 0);
  console.log(`Arquivo salvo em ${escolhas.salvoEm ?? "?"} (página gerada em ${escolhas.geradoEm ?? "?"}): ${plano.length} produto(s), ${vinculos} vínculo(s).`);
  for (const { sku, adicionar } of plano) console.log(`  ${sku}: ${adicionar.map((item) => `${item.fonte} ${item.codigo}`).join(" · ")}`);
  if (!confirmo) {
    console.log("\nNada gravado. Repita com --confirmo para gravar.");
    return;
  }

  register(pathToFileURL(`${RAIZ}/scripts/resolver-alias.js`), pathToFileURL(`${RAIZ}/`));
  if (RAIZ !== "/app") await import("dotenv/config");
  const { prisma } = await import(pathToFileURL(`${RAIZ}/src/lib/db.js`).href);
  const { marcarReferencias } = await import(pathToFileURL(`${RAIZ}/src/lib/referencias/marcar.js`).href);

  let feitos = 0;
  let jaEstavam = 0;
  const recusados = [];
  let aviso = null;
  for (const { sku, adicionar } of plano) {
    const resultado = await marcarReferencias(sku, { fornecedores: { adicionar } });
    if (!resultado.ok) { recusados.push(`${sku}: ${resultado.erro}`); continue; }
    for (const feito of resultado.feitos) feito.acao === "fornecedor marcado" ? feitos++ : jaEstavam++;
    for (const recusa of resultado.recusados) recusados.push(`${sku} ${recusa.item}: ${recusa.motivo}`);
    aviso ??= resultado.aviso;
  }
  console.log(`\nGravado: ${feitos} vínculo(s) novo(s), ${jaEstavam} já estava(m), ${recusados.length} recusado(s).`);
  for (const linha of recusados) console.log(`  recusado: ${linha}`);
  if (aviso) console.log(`\n${aviso}`);
  await prisma.$disconnect();
}

if (!process.env.VINCULAR_SO_FUNCOES) {
  await main().catch((erro) => {
    console.error(erro);
    process.exit(1);
  });
}
