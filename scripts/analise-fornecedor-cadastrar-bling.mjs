// Cadastra no Bling os produtos criados pela analise de lista de fornecedor (roteiro em src/lib/analiseFornecedor/roteiro.js,
// passo 7; primeiro uso em 07/11/2026, os 38 da NexMind com markup de 100%). SO com a ordem do dono e o preco de venda que
// ele aprovou. Roda NA VPS, numa conexao so, com o plano embutido antes do script (scripts/analise-fornecedor-embutir.js):
//   globalThis.PLANO = [{ sku, preco }];
// Sem --confirmo so LE e confere (produto existe, sem preco ou com esse preco, sem blingId, trava de escrita do Bling liberada).
// Com --confirmo, item a item: grava o preco de venda aprovado e chama `cadastrarNoBling`, o MESMO caminho do botao "Cadastrar
// no Bling" (busca pelo codigo antes, POST /produtos, fotos, fornecedores com CNPJ e marca como sincronizado). --somente=<sku,sku>
// limita aos codigos dados (faca um primeiro e confira). Para na primeira falha.
import { existsSync } from "node:fs";
import { register } from "node:module";
import { pathToFileURL } from "node:url";

const RAIZ = existsSync("/app/scripts/resolver-alias.js") ? "/app" : process.cwd();
register(pathToFileURL(`${RAIZ}/scripts/resolver-alias.js`), pathToFileURL(`${RAIZ}/`));
if (RAIZ !== "/app") await import("dotenv/config");
const modulo = (caminho) => import(pathToFileURL(`${RAIZ}/${caminho}`).href);

const confirmo = process.argv.includes("--confirmo");
const somente = process.argv.find((arg) => arg.startsWith("--somente="))?.slice("--somente=".length).split(",").filter(Boolean) ?? null;
const { PLANO } = globalThis;
if (!Array.isArray(PLANO) || PLANO.length === 0) { console.error("Falta globalThis.PLANO."); process.exit(2); }

const { prisma } = await modulo("src/lib/db.js");
const { cadastrarNoBling } = await modulo("src/lib/blingSync/envio.js");
const { clienteBling } = await modulo("src/lib/blingSync/cliente.js");

const parar = async (texto) => { console.error(`PAREI: ${texto}`); await prisma.$disconnect(); process.exit(1); };
const plano = somente ? PLANO.filter((item) => somente.includes(item.sku)) : PLANO;
if (somente && plano.length !== somente.length) await parar(`--somente com código fora do plano: ${somente.join(",")}`);

const produtos = await prisma.produto.findMany({
  where: { sku: { in: plano.map((item) => item.sku) } },
  select: { id: true, sku: true, tituloBase: true, precoVenda: true, custo: true, blingId: true, blingSincronizadoEm: true, _count: { select: { arquivos: true } } },
});
const porSku = new Map(produtos.map((p) => [p.sku, p]));
const problemas = [];
for (const item of plano) {
  const p = porSku.get(item.sku);
  if (!p) { problemas.push(`${item.sku} não existe no Rise`); continue; }
  if (p.precoVenda != null && Number(p.precoVenda) !== item.preco) problemas.push(`${item.sku} já tem preço ${p.precoVenda} (plano ${item.preco})`);
  if (p.blingId) problemas.push(`${item.sku} já tem blingId ${p.blingId}`);
  if (!(item.preco > 0)) problemas.push(`${item.sku} preço inválido ${item.preco}`);
}
const cliente = clienteBling();
const travados = [];
for (const item of plano) { try { cliente.exigirEscrita(item.sku); } catch (erro) { travados.push(`${item.sku}: ${erro.message}`); } }
console.log(`Plano: ${plano.length} · no Rise ${produtos.length} · com arquivos ${produtos.filter((p) => p._count.arquivos > 0).length} · trava do Bling: ${travados.length ? `${travados.length} travado(s)` : "liberada"}`);
for (const item of plano) { const p = porSku.get(item.sku); console.log(`  ${item.sku} custo ${p?.custo} → venda ${item.preco} · ${p?.tituloBase}`); }
if (travados.length) problemas.push(...travados);
if (problemas.length) await parar(`${problemas.length} problema(s): ${problemas.join(" | ")}`);
if (!confirmo) {
  console.log("Nada gravado. Repita com --confirmo para gravar.");
  await prisma.$disconnect();
  process.exit(0);
}

const resultados = [];
for (const item of plano) {
  const p = porSku.get(item.sku);
  if (p.precoVenda == null) await prisma.produto.update({ where: { id: p.id }, data: { precoVenda: item.preco } });
  const comecou = Date.now();
  const r = await cadastrarNoBling(p.id);
  const segundos = ((Date.now() - comecou) / 1000).toFixed(1);
  resultados.push({ sku: item.sku, ok: r.ok, blingId: r.blingId ?? null, fotos: r.fotos?.enviadas ?? null, erro: r.erro ?? null, aviso: r.aviso ?? null });
  console.log(`  ${item.sku} ${r.ok ? "OK" : "FALHOU"} · blingId ${r.blingId ?? "-"} · fotos ${r.fotos ? `${r.fotos.acao} ${r.fotos.enviadas}` : "-"} · ${segundos} s${r.erro ? ` · ${r.erro}` : ""}${r.aviso ? ` · aviso: ${r.aviso}` : ""}`);
  if (!r.ok) break;
}
console.log(`Cadastrados: ${resultados.filter((r) => r.ok).length} de ${plano.length}`);
console.log(`RESULTADOS_JSON=${JSON.stringify(resultados)}`);
await prisma.$disconnect();
process.exit(0);
