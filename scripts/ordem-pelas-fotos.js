import "dotenv/config";

/**
 * Grava a POSICAO de cada caixinha na prateleira (`Produto.ordemNaPrateleira`) a partir das fotos que o dono manda
 * (Mapa do estoque, 12/11/2026). A sessao do Claude le as fotos e escreve um arquivo JSON por coluna:
 *
 *   { "coluna": "A", "prateleiras": { "1": ["100101", "100103", "?"], "2": [...] } }
 *
 * os codigos da esquerda para a direita; "?" marca a caixinha ilegivel (guarda o lugar, sem gravar nada).
 *
 *   node scripts/ordem-pelas-fotos.js --arquivo=dados/fotos-estoque/coluna-A.json            (simula: so mostra)
 *   node scripts/ordem-pelas-fotos.js --arquivo=dados/fotos-estoque/coluna-A.json --confirmo (grava)
 *
 * NUNCA muda a Localizacao (decisao do dono: o que ja esta no Estoque 1 fica como esta): o codigo cuja Localizacao no Rise e
 * outra vai para a lista de duvidas, sem gravar. So grava a posicao de quem esta mesmo naquela prateleira.
 */

import { readFileSync } from "node:fs";

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { conferirOrdemDasFotos } = await import("../src/lib/estoque3d/fotos.js");

const confirmar = process.argv.includes("--confirmo");
const caminho = process.argv.find((argumento) => argumento.startsWith("--arquivo="))?.slice("--arquivo=".length);
if (!caminho) {
  console.error("Informe --arquivo=<json da coluna>.");
  process.exit(2);
}

const { prisma } = await import("../src/lib/db.js");
try {
  const leitura = JSON.parse(readFileSync(caminho, "utf8"));
  const resultado = await conferirOrdemDasFotos(leitura, { gravar: confirmar });
  if (!resultado.ok) {
    console.error(resultado.erro);
    process.exitCode = 1;
  } else {
    console.log(`Coluna ${resultado.coluna}: ${resultado.gravar.length} posicao(oes) ${confirmar ? "gravada(s)" : "a gravar"}.`);
    for (const item of resultado.gravar) console.log(`  ${item.localizacao} ${item.posicao}a  ${item.sku}`);
    if (resultado.duvidas.length) {
      console.log(`\nDuvidas (${resultado.duvidas.length}), nada gravado nelas:`);
      for (const duvida of resultado.duvidas) console.log(`  ${duvida.lugar}  ${duvida.texto}`);
    }
    if (resultado.faltaram.length) {
      console.log(`\nNo Rise nesta coluna e nao vistos nas fotos (${resultado.faltaram.length}):`);
      for (const item of resultado.faltaram) console.log(`  ${item.localizacao}  ${item.sku}  ${item.nome}`);
    }
    if (!confirmar) console.log("\nSimulacao: nada gravado. Use --confirmo para gravar.");
  }
} finally {
  await prisma.$disconnect();
}
