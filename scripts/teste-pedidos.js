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
const { criarMLFalso } = await import("./lib/mlFalso.js");
const { criarLojaIntegradaFalsa } = await import("./lib/lojaIntegradaFalsa.js");
const { criarBlingFalso } = await import("./lib/blingFalso.js");
const { readFileSync } = await import("node:fs");

/** Le uma fixture de scripts/lib/fixtures/pedidos/ (copia nova a cada chamada: o teste edita a vontade). */
function fx(nome) {
  return JSON.parse(readFileSync(new URL(`./lib/fixtures/pedidos/${nome}.json`, import.meta.url), "utf8"));
}

/** Os tres falsos ja carregados com as fixtures de pedidos, novos a cada chamada. */
function falsos() {
  const ml = criarMLFalso({
    pedidos: [fx("ml-order")],
    envios: [fx("ml-shipment"), fx("ml-shipment-return")],
    faturas: [fx("ml-invoice")],
    cobrancas: { 2000000001: fx("ml-billing") },
  });
  const li = criarLojaIntegradaFalsa({
    pedidos: [fx("li-pedido")],
    situacoes: fx("li-situacoes").objects,
    historicos: fx("li-historico").objects,
    etiquetas: fx("li-enviali"),
  });
  const bling = criarBlingFalso({
    pedidosDeVenda: fx("bling-pedido"),
    formasDePagamento: fx("bling-formas").data,
    situacoesDeVenda: fx("bling-situacoes"),
    canaisDeVenda: fx("bling-canais").data,
    notas: [fx("bling-nfe").data],
  });
  return { ml, li, bling };
}

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

  // -------------------------------------------------------------------------
  // Tarefa 2: os tres falsos com as rotas de pedidos
  // -------------------------------------------------------------------------
  console.log("\nFalsos");
  {
    const { ml, li, bling } = falsos();
    conferir(
      "ML falso: search pagina e filtra",
      (await ml.get("/orders/search", { seller: "212386247", "order.date_created.from": "2026-11-01T00:00:00.000-03:00", limit: 50, offset: 0 })).dados.results.map((o) => o.id),
      [2000000001],
    );
    conferir(
      "ML falso: search por last_updated nao acha o antigo",
      (await ml.get("/orders/search", { seller: "212386247", "order.date_last_updated.from": "2026-11-03T12:00:00.000-03:00", limit: 50, offset: 0 })).dados.results.length,
      0,
    );
    conferir("ML falso: pedido", (await ml.get("/orders/2000000001")).dados.order_items[0].sale_fee, 12.95);
    conferir("ML falso: billing_info", (await ml.get("/orders/2000000001/billing_info")).dados.billing_info.doc_number, "12345678909");
    conferir("ML falso: envios do pedido (ida e retorno)", (await ml.get("/orders/2000000001/shipments")).dados.map((e) => e.type ?? "forward"), ["forward", "return"]);
    conferir(
      "ML falso: shipment com X-Api-Version",
      (await ml.get("/shipments/40000000001", { views: "destination" }, { headers: { "X-Api-Version": "2" } })).dados.order_cost,
      18.12,
    );
    conferir("ML falso: chamadas guardam os headers", ml.chamadas.at(-1).headers, { "X-Api-Version": "2" });
    conferir("ML falso: fatura do pedido", (await ml.get("/users/212386247/invoices/orders/2000000001")).dados.invoice_number, "1234");
    conferir("ML falso: fatura inexistente da 404", (await ml.get("/users/212386247/invoices/orders/2000000002")).status, 404);
    conferir("ML falso: pedidos e um Map editavel", ml.pedidos instanceof Map && ml.pedidos.has(2000000001), true);

    conferir("LI falsa: search since_criado", (await li.get("/pedido/search", { since_criado: "2026-11-01T00:00:00", limit: 100, offset: 0 })).dados.objects.map((p) => p.numero), [5001]);
    conferir("LI falsa: search since_atualizado nao acha o antigo", (await li.get("/pedido/search", { since_atualizado: "2026-11-04T00:00:00", limit: 100 })).dados.meta.total_count, 0);
    conferir("LI falsa: pedido", (await li.get("/pedido/5001")).dados.cliente.cpf, "12345678909");
    conferir("LI falsa: situacoes", (await li.get("/situacao")).dados.objects.find((s) => s.codigo === "pedido_pago").id, 4);
    conferir("LI falsa: historico por numero", (await li.get("/situacao_historico/search", { numero: 5001 })).dados.objects.length, 2);
    conferir("LI falsa: enviali pela raiz", (await li.get("/enviali/v2/postage", { search: "5001" }, { base: "raiz" })).dados[0].estimate.price, 1812);
    conferir("LI falsa: enviali de outro pedido e vazio", (await li.get("/enviali/v2/postage", { search: "5002" }, { base: "raiz" })).dados, []);
    li.falhas = { "GET /pedido/5001": 500 };
    conferir("LI falsa: falha configurada depois de criada", (await li.get("/pedido/5001")).status, 500);
    li.falhas = {};
    conferir("LI falsa: pedidos e um Map editavel", li.pedidos instanceof Map && li.pedidos.has(5001), true);

    // fixtures do Bling: 7001 digitado no Bling (loja ausente), 7002 espelho do ML 2000000001 (loja 206326819, numero "123"), 7003 espelho da LI 5001 (loja 203478870), 7004 da loja "Shopee 4hobby" (ignorado)
    conferir("Bling falso: pedidos por data", (await bling.get("/pedidos/vendas", { dataInicial: "2026-11-01", dataFinal: "2026-11-30", pagina: 1, limite: 100 })).dados.data.map((p) => p.id), [7001, 7002, 7003, 7004]);
    conferir("Bling falso: lista e resumida (sem itens)", "itens" in (await bling.get("/pedidos/vendas", { dataInicial: "2026-11-01", dataFinal: "2026-11-30" })).dados.data[0], false);
    conferir("Bling falso: pedidos fora da data", (await bling.get("/pedidos/vendas", { dataInicial: "2026-12-01", dataFinal: "2026-12-31" })).dados.data, []);
    conferir("Bling falso: pagina 2 vazia", (await bling.get("/pedidos/vendas", { dataInicial: "2026-11-01", dataFinal: "2026-11-30", pagina: 2, limite: 100 })).dados.data, []);
    conferir("Bling falso: pedido", (await bling.get("/pedidos/vendas/7002")).dados.data.loja.id, 206326819);
    conferir("Bling falso: formas de pagamento", (await bling.get("/formas-pagamentos")).dados.data.find((f) => f.id === 1).descricao, "Pix");
    conferir("Bling falso: modulos", (await bling.get("/situacoes/modulos")).dados.data.find((m) => m.nome === "Vendas").id, 98310);
    conferir("Bling falso: situacoes de vendas", (await bling.get("/situacoes/modulos/98310")).dados.data.find((s) => s.id === 15).nome, "Em andamento");
    conferir("Bling falso: canais", (await bling.get("/canais-venda")).dados.data.map((c) => c.descricao), ["Rise_ML", "ML_4h", "Loja Integrada", "Shopee 4hobby"]);
    conferir("Bling falso: nfe", (await bling.get("/nfe/9001")).dados.data.chaveAcesso.length, 44);
  }

  // Marcador: os blocos seguintes entram acima desta linha.
} finally {
  if (!manter) await limpar();
  await prisma.$disconnect();
}

console.log(`\n${falhas === 0 ? "Tudo certo." : `${falhas} falha(s).`}`);
process.exit(falhas === 0 ? 0 : 1);
