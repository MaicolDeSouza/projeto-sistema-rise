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
const { normalizarPedidoML } = await import("../src/lib/pedidos/ml.js");
const { normalizarPedidoLI, escolherEtiquetaEnviali } = await import("../src/lib/pedidos/li.js");
const { normalizarPedidoBling, classificarLojaDoBling } = await import("../src/lib/pedidos/bling.js");

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

  // -------------------------------------------------------------------------
  // Tarefa 3: normalizadores puros (ML, LI, Bling) e a etiqueta do Enviali
  // -------------------------------------------------------------------------
  console.log("\nNormalizar");
  {
    const ml1 = normalizarPedidoML({ order: fx("ml-order"), billing: fx("ml-billing"), shipments: [{ id: 40000000001, type: "forward" }], shipment: fx("ml-shipment"), retorno: null, invoice: fx("ml-invoice") });
    conferir("ML: cabecalho", [ml1.origem, ml1.idExterno, ml1.numero, ml1.comprador.documento], ["MERCADO_LIVRE", "2000000001", "2000000001", "12345678909"]);
    conferir("ML: comprador e endereco", [ml1.comprador.nome, ml1.comprador.telefone, ml1.enderecoDeEntrega.cidade, ml1.enderecoDeEntrega.uf, ml1.enderecoDeEntrega.cep], ["Joao ZZ Ped Silva", "54988990008", "Caxias do Sul", "RS", "95010000"]);
    conferir("ML: item com comissao", [ml1.itens[0].quantidade, ml1.itens[0].comissao, ml1.itens[0].codigoNaOrigem], [2, 25.9, "100101"]);
    conferir("ML: frete do vendedor do envio", [ml1.envio.custoDoVendedor, ml1.envio.fonteDoCusto, ml1.envio.rastreio], [18.12, "envio", "BR123456789BR"]);
    conferir("ML: totais e pagamento", [ml1.totais, ml1.pagamento[0].tipo, ml1.pagamento[0].status], [{ totalProdutos: 119.8, desconto: 0, freteCobrado: 18.12, total: 137.92 }, "account_money", "approved"]);
    conferir("ML: sem envio = estimado", normalizarPedidoML({ order: fx("ml-order"), billing: null, shipments: [], shipment: null, retorno: null, invoice: null }).envio.fonteDoCusto, "estimado");
    conferir("ML: sem devolucao", ml1.devolucao, null);
    conferir("ML: devolucao entregue com frete de retorno", normalizarPedidoML({ order: fx("ml-order"), billing: null, shipments: [], shipment: fx("ml-shipment"), retorno: fx("ml-shipment-return"), invoice: null }).devolucao, { entregueEm: new Date("2026-11-20T14:00:00.000Z"), custoDoRetorno: 22.5 });
    conferir("ML: tag refunded sem retorno = devolucao sem custo", normalizarPedidoML({ order: { ...fx("ml-order"), tags: ["paid", "refunded"] }, billing: null, shipments: [], shipment: null, retorno: null, invoice: null }).devolucao?.custoDoRetorno, 0);
    conferir("ML: nf do emissor", [ml1.nf.numero, ml1.nf.status, ml1.nf.urlXml], ["1234", "authorized", "/users/212386247/invoices/documents/xml/555/authorized"]);
    conferir("ML: datas", [ml1.dataDaVenda.toISOString(), ml1.atualizadoNaOrigemEm.toISOString()], ["2026-11-02T13:15:00.000Z", "2026-11-03T12:00:00.000Z"]);

    const li1 = normalizarPedidoLI({ pedido: fx("li-pedido"), historico: fx("li-historico").objects, etiquetas: fx("li-enviali") });
    conferir("LI: cabecalho", [li1.origem, li1.idExterno, li1.numero, li1.comprador.nome, li1.comprador.telefone], ["LOJA_INTEGRADA", "5001", "5001", "Maria ZZ Ped Souza", "54988990008"]);
    conferir("LI: cliente e endereco", [li1.comprador.documento, li1.enderecoDeEntrega.cep, li1.statusDaOrigem, li1.envio.situacaoDoPedido], ["12345678909", "95090970", "pedido_pago", "pedido_pago"]);
    conferir("LI: etiqueta postada vale postage.price", [li1.envio.custoDoVendedor, li1.envio.fonteDoCusto, li1.envio.rastreio], [18.12, "etiqueta", "AB123456789BR"]);
    conferir("LI: totais, item e pagamento", [li1.totais, li1.itens[0].quantidade, li1.itens[0].precoUnitario, li1.pagamento[0].forma], [{ totalProdutos: 119.8, desconto: 0, freteCobrado: 18.12, total: 137.92 }, 2, 59.9, "Pix"]);
    conferir("LI: historico e data de Sao Paulo", [li1.historico.map((h) => h.statusDaOrigem), li1.dataDaVenda.toISOString()], [["pedido_efetuado", "pedido_pago"], "2026-11-02T17:30:00.123Z"]);
    conferir("etiqueta cancelada e refeita: vale a nova", escolherEtiquetaEnviali([{ postage: { id: 1, status: "cancelled", date_time: "2026-11-02T10:00:00" } }, { postage: { id: 2, status: "created", date_time: "2026-11-02T11:00:00" } }]).postage.id, 2);
    conferir("so canceladas = sem etiqueta", escolherEtiquetaEnviali([{ postage: { id: 1, status: "cancelled", date_time: "2026-11-02T10:00:00" } }]), null);
    conferir("etiqueta created vale estimate.price", normalizarPedidoLI({ pedido: fx("li-pedido"), historico: [], etiquetas: [{ postage: { id: 9, status: "created", date_time: "2026-11-02T11:00:00", price: null, tracking_code: null }, estimate: { price: 6731 } }] }).envio.custoDoVendedor, 67.31);
    conferir("LI: enviali sem etiqueta = estimado", normalizarPedidoLI({ pedido: fx("li-pedido"), historico: [], etiquetas: [] }).envio.fonteDoCusto, "estimado");
    const retirada = normalizarPedidoLI({ pedido: { ...fx("li-pedido"), envios: [{ forma_envio: { nome: "Retirada", tipo: "retirada" }, valor: "0.00" }] }, historico: [], etiquetas: [] }).envio;
    conferir("LI: retirada = frete 0 do pedido", [retirada.custoDoVendedor, retirada.fonteDoCusto], [0, "pedido"]);

    const bl1 = normalizarPedidoBling({ pedido: fx("bling-pedido")[0], formas: fx("bling-formas").data, situacoes: fx("bling-situacoes").situacoes["98310"], nfe: fx("bling-nfe").data });
    conferir("Bling: pedido digitado", [bl1.canal, bl1.numero, bl1.pagamento[0].forma, bl1.statusDaOrigem, bl1.nf.chave.length], ["BLING", "7001", "Pix", "Em andamento", 44]);
    conferir("Bling: ids, comprador e endereco", [bl1.idExterno, bl1.blingPedidoId, bl1.blingNumero, bl1.comprador.documento, bl1.enderecoDeEntrega.cep, bl1.enderecoDeEntrega.cidade], ["7001", "7001", "7001", "11222333000181", "95010005", "Caxias do Sul"]);
    conferir("Bling: totais, item e envio", [bl1.totais, bl1.itens[0].total, bl1.envio.rastreio, bl1.envio.fonteDoCusto, bl1.envio.custoDoVendedor], [{ totalProdutos: 119.8, desconto: 0, freteCobrado: 18.12, total: 137.92 }, 119.8, "QB123456789BR", "estimado", null]);
    conferir("Bling: nf", [bl1.nf.origem, bl1.nf.numero, bl1.nf.status, bl1.nf.urlPdf, bl1.nf.urlXml], ["BLING", "1234", "autorizada", "https://www.bling.com.br/relatorios/nfe.pdf?id=9001", null]);
    conferir("Bling: sem nf", normalizarPedidoBling({ pedido: fx("bling-pedido")[1], formas: [], situacoes: [], nfe: null }).nf, null);
    conferir("Bling: data de Sao Paulo", bl1.dataDaVenda.toISOString(), "2026-11-02T03:00:00.000Z");
    conferir("Bling: loja", [classificarLojaDoBling(undefined), classificarLojaDoBling(0), classificarLojaDoBling(206326819), classificarLojaDoBling("203593931"), classificarLojaDoBling(203478870), classificarLojaDoBling(999)], ["bling", "bling", "espelhoML", "espelhoML", "espelhoLI", "outra"]);
  }

  // Marcador: os blocos seguintes entram acima desta linha.
} finally {
  if (!manter) await limpar();
  await prisma.$disconnect();
}

console.log(`\n${falhas === 0 ? "Tudo certo." : `${falhas} falha(s).`}`);
process.exit(falhas === 0 ? 0 : 1);
