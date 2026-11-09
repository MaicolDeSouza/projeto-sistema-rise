import "dotenv/config";

/**
 * Rele AGORA as vendas do ML que ainda nao tem o Mercado Pago (pedido do dono em 09/11/2026: "faca uma releitura agora para
 * atualizar"). E a mesma rotina do worker (`conferirMercadoPagoPendentes`), em lotes de 20 ate nao sobrar nenhuma: cada venda e
 * relida inteira no ML e no Mercado Pago (o lucro conferido, o kit por kit vendido, o codigo vendido). So le la fora; grava no
 * banco do .env. Na VPS: `docker compose exec -T worker npm run pedidos:conferir-mp`.
 *
 * O import e dinamico porque os modulos usam o alias "@/" do Next, que o Node so entende depois do `register`.
 */
const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { conferirMercadoPagoPendentes } = await import("../src/lib/pedidos/leitura.js");
const { prisma } = await import("../src/lib/db.js");

const LOTE = 20;
const MAXIMO_DE_LOTES = 40;

let conferidos = 0;
let falhas = 0;
const erros = [];
try {
  for (let lote = 1; lote <= MAXIMO_DE_LOTES; lote += 1) {
    const resultado = await conferirMercadoPagoPendentes({ limite: LOTE, agora: new Date() });
    conferidos += resultado.conferidos;
    falhas += resultado.falhas;
    erros.push(...resultado.erros);
    console.log(`lote ${lote}: ${resultado.conferidos} conferido(s), ${resultado.falhas} falha(s)`);
    // O que foi relido (ou falhou) nao volta na mesma hora: um lote vazio quer dizer que acabou.
    if (resultado.conferidos + resultado.falhas === 0) break;
  }
  console.log(`\nTotal: ${conferidos} venda(s) relida(s), ${falhas} falha(s).`);
  for (const erro of erros.slice(0, 10)) console.log(`  falha: ${erro}`);
} catch (erro) {
  console.error(`Parou: ${erro?.message ?? erro}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
