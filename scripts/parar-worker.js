import "dotenv/config";

/**
 * Pede ao worker da coleta que encerre do jeito certo, e espera.
 *
 *   npm run worker:parar
 *
 * O worker devolve as varreduras em andamento a fila SEM gastar tentativa, grava
 * o lote aberto e sai; o supervisor sai junto. Na proxima partida, elas recomecam.
 *
 * Existe porque, no Windows, matar o processo (taskkill /F, fechar a janela) nao
 * da ao worker chance nenhuma: ele morre na hora, e os jobs ficam "em andamento"
 * ate o proximo worker subir e recolhe-los, gastando uma tentativa.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { mkdirSync, rmSync, writeFileSync } = await import("node:fs");
const { prisma } = await import("../src/lib/db.js");
const { workerNoAr } = await import("../src/lib/coleta/fila.js");

const PEDIDO = new URL("../dados/worker.parar", import.meta.url);
/// Uma volta do worker (5 s) + o cancelamento das varreduras (ate 60 s cada, em
/// paralelo) + folga.
const TETO_MS = 3 * 60 * 1000;

const dormir = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

const antes = await workerNoAr();
if (!antes) {
  console.log("Nenhum worker no ar.");
  await prisma.$disconnect();
  process.exit(0);
}

mkdirSync(new URL("../dados/", import.meta.url), { recursive: true });
writeFileSync(PEDIDO, new Date().toISOString());
console.log(`Pedido de parada enviado ao worker (pid ${antes.pid}). Esperando ele devolver as varreduras...`);

const inicio = Date.now();
let parou = false;
while (Date.now() - inicio < TETO_MS) {
  const registro = await prisma.workerColeta.findUnique({ where: { id: antes.id } });
  if (!registro || registro.encerradoEm) {
    parou = true;
    break;
  }
  await dormir(1000);
}

rmSync(PEDIDO, { force: true });
await prisma.$disconnect();

if (parou) {
  console.log("Worker parado. As varreduras em andamento voltaram a fila.");
  process.exit(0);
}
console.log("O worker nao respondeu em 3 minutos. Veja dados/logs/ e, se preciso, encerre o processo.");
process.exit(1);
