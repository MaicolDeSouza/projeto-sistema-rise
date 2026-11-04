import "dotenv/config";

/**
 * Testes do modulo Pedidos de venda (spec 2026-11-04-modulo-pedidos-de-venda-design.md): banco, normalizadores,
 * status, cliente automatico, itens, lucro, pecas, aplicarPedidoLido e a leitura contra o ML falso, a LI falsa e o
 * Bling falso. SEM rede.
 *
 *   npm run teste:pedidos
 *   npm run teste:pedidos -- --manter (deixa os ZZ no banco, para conferir a tela)
 *
 * So escreve pedidos ZZ-PED-*, produtos ZZ-PED-* e clientes "ZZ Ped *" (documentos de teste), apagados no comeco
 * e no fim.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const manter = process.argv.includes("--manter");

const { config } = await import("../src/lib/integracoes/config.js");
const { prisma } = await import("../src/lib/db.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

/** Documentos dos clientes de teste (formatados como o Cliente grava). */
const DOCUMENTOS_DE_TESTE = ["123.456.789-09", "11.222.333/0001-81", "000.000.000-00"];

async function limpar() {
  await prisma.pedidoDeVenda.deleteMany({ where: { numero: { startsWith: "ZZ-PED-" } } });
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-PED-" } } });
  await prisma.cliente.deleteMany({
    where: { OR: [{ documento: { in: DOCUMENTOS_DE_TESTE } }, { nome: { startsWith: "ZZ Ped " } }] },
  });
}

try {
  await limpar();

  // -------------------------------------------------------------------------
  // Tarefa 1: banco e configuracao
  // -------------------------------------------------------------------------
  console.log("\nBanco e configuracao");
  const criado = await prisma.pedidoDeVenda.create({
    data: {
      origem: "MERCADO_LIVRE",
      canal: "MERCADO_LIVRE",
      idExterno: "ZZ-PED-1",
      numero: "ZZ-PED-1",
      dataDaVenda: new Date(),
      atualizadoNaOrigemEm: new Date(),
      statusDaOrigem: "paid",
      status: "PAGO",
      enderecoDeEntrega: {},
      pagamento: [],
      envio: {},
      historico: [],
      totalProdutos: 10,
      desconto: 0,
      freteCobrado: 0,
      total: 10,
    },
  });
  conferir(
    "pedido gravado com o padrao",
    [criado.statusDoEnvio, criado.emSeparacao, criado.lucroFechado, criado.avisos],
    ["SEM_ENVIO", false, false, []],
  );
  conferir("config.pedidos.desde", config.pedidos.desde.toISOString(), "2026-11-01T03:00:00.000Z");
  conferir("config.travas.nfe fechada", config.travas.nfe, false);

  // Marcador: os blocos seguintes entram acima desta linha.
} finally {
  if (!manter) await limpar();
  await prisma.$disconnect();
}

console.log(`\n${falhas === 0 ? "Tudo certo." : `${falhas} falha(s).`}`);
process.exit(falhas === 0 ? 0 : 1);
