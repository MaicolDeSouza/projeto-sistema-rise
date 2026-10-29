import "dotenv/config";

/**
 * Recalcula custo e Obs dos vinculos do fornecedor do AliExpress a partir dos pedidos ja importados (pedido do dono em
 * 29/10/2026). Sem `--confirmo` so conta (nada grava).
 *
 *   npm run aliexpress:recalcular              # conta
 *   npm run aliexpress:recalcular -- --confirmo # grava
 */
const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { recalcularVinculosDoAliExpress } = await import("../src/lib/compras/aliexpress/casamento.js");
const { prisma } = await import("../src/lib/db.js");
try {
  const resultado = await recalcularVinculosDoAliExpress({ gravar: process.argv.includes("--confirmo") });
  console.log(JSON.stringify(resultado));
} finally {
  await prisma.$disconnect();
}
