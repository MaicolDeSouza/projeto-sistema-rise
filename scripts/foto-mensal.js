import "dotenv/config";

/**
 * Tira a foto mensal de preco e estoque na mao.
 *
 *   npm run foto:mensal              so se ja passou do dia 14 e o mes ainda nao tem foto
 *   npm run foto:mensal -- --forcar  ignora o dia 14 (o mes fica com esta foto)
 *
 * O worker faz isto sozinho, uma vez por mes. Aqui serve para conferir e para o mes em
 * que o worker ficou desligado por muito tempo. Rodar de novo no mesmo mes nao duplica.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("../src/lib/db.js");
const { tirarFotoMensal } = await import("../src/lib/coleta/fotos.js");

const forcar = process.argv.includes("--forcar");
const foto = await tirarFotoMensal({ forcar });
await prisma.$disconnect();

if (foto.tirou) {
  console.log(`Foto de ${foto.mes}: ${foto.coleta} de fornecedor/concorrente, ${foto.produtos} da loja.`);
} else {
  console.log(`Nada a fazer (${foto.mes}): ${foto.motivo}.`);
}
