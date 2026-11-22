/**
 * Recalcula o prazo de despacho (`PedidoDeVenda.despacharAte`) dos pedidos que ainda nao sairam com os dias uteis
 * (pedido do dono em 22/11/2026: sabado, domingo e feriado de Caxias do Sul nao contam). Os pedidos gravados antes da
 * regra so mudariam na proxima leitura deles, e a LI so rele o pedido que mudou.
 *
 *   node scripts/recalcular-prazo-de-despacho.js --simular
 *   node scripts/recalcular-prazo-de-despacho.js --confirmo
 *
 * LI: o prazo sai de novo do historico gravado (o pagamento). Bling e ML estimado: o dia do prazo gravado vai para o dia
 * util a partir dele, com a mesma hora. ML com o `sla` do ML: fica. Rodar duas vezes da o mesmo resultado.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const confirmo = process.argv.includes("--confirmo");
if (!confirmo && !process.argv.includes("--simular")) {
  console.log("Use --simular (so mostra) ou --confirmo (grava).");
  process.exit(1);
}

const { prisma } = await import("../src/lib/db.js");
const { prazoDeDespachoLI } = await import("../src/lib/pedidos/despacho.js");
const { diaUtilAPartirDe } = await import("../src/lib/diasUteis.js");

const FUSO = "America/Sao_Paulo";
const diaEmSaoPaulo = (data) => new Date(data).toLocaleDateString("en-CA", { timeZone: FUSO });
const horaEmSaoPaulo = (data) => new Date(data).toLocaleTimeString("en-GB", { timeZone: FUSO, hour12: false });
const mostrar = (data) => (data ? new Date(data).toLocaleString("pt-BR", { timeZone: FUSO, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "sem prazo");

/** O mesmo instante, levado ao dia util a partir do dia dele (a hora de Sao Paulo fica). */
function noDiaUtil(data) {
  const dia = diaEmSaoPaulo(data);
  const util = diaUtilAPartirDe(dia);
  return util === dia ? new Date(data) : new Date(`${util}T${horaEmSaoPaulo(data)}-03:00`);
}

const pedidos = await prisma.pedidoDeVenda.findMany({
  where: { status: { in: ["PAGO", "EM_SEPARACAO", "AGUARDANDO_PECAS"] }, statusDoEnvio: { in: ["A_POSTAR", "SEM_ENVIO"] }, despacharAte: { not: null } },
  select: { id: true, origem: true, numero: true, despacharAte: true, historico: true, statusDaOrigem: true, dataDaVenda: true, envio: true },
});

let mudam = 0;
for (const p of pedidos) {
  let novo = null;
  if (p.origem === "LOJA_INTEGRADA") {
    const r = prazoDeDespachoLI({ historico: p.historico, statusDaOrigem: p.statusDaOrigem, dataDaVenda: p.dataDaVenda, tipoDeEnvio: p.envio?.tipo });
    novo = r.despacharAte ? new Date(r.despacharAte) : null;
  } else if (p.origem === "BLING" || (p.origem === "MERCADO_LIVRE" && p.envio?.despachoEstimado === true)) {
    novo = noDiaUtil(p.despacharAte);
  } else {
    continue;
  }
  if (!novo || novo.getTime() === p.despacharAte.getTime()) continue;
  mudam++;
  console.log(`${p.origem} ${p.numero}: ${mostrar(p.despacharAte)} -> ${mostrar(novo)}`);
  if (confirmo) await prisma.pedidoDeVenda.update({ where: { id: p.id }, data: { despacharAte: novo } });
}
console.log(`${pedidos.length} pedido(s) por enviar com prazo; ${mudam} ${confirmo ? "atualizado(s)" : "mudaria(m)"}.`);
await prisma.$disconnect();
