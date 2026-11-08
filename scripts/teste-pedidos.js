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
const { statusDoPedido, statusDoEnvio } = await import("../src/lib/pedidos/status.js");
const { clienteDoPedido } = await import("../src/lib/pedidos/cliente.js");
const { custoCongeladoDoProduto, casarItens } = await import("../src/lib/pedidos/itens.js");
const { parcelasDaEstimativa, parcelasDoReal, devolvido, lucroDivergente, lucroFechado } = await import("../src/lib/pedidos/lucro.js");
const { necessidadeDoPedido, calcularPecas } = await import("../src/lib/pedidos/pecas.js");
const { aplicarPedidoLido, listarPedidosDeVenda, lerPedidoDeVenda, marcarEmSeparacao, salvarCustoDoFreteManual, vincularCliente, espelharNoBling, criarClienteDoPedido, buscarClientesParaVincular, opcoesDasColunas, resumoDaLista } = await import("../src/lib/pedidos/banco.js");
const { rodarLeituraDePedidos } = await import("../src/lib/pedidos/leitura.js");
const { ROTINAS_DO_WORKER } = await import("../src/lib/saude/regras.js");
const { RECURSOS } = await import("../src/lib/acessos/recursos.js");
const { Prisma } = await import("@/generated/prisma/client");
const { lerTaxas, salvarTaxas, TIPOS_DE_PAGAMENTO_LI } = await import("../src/lib/pedidos/taxas.js");

/** Le uma fixture de scripts/lib/fixtures/pedidos/ (copia nova a cada chamada: o teste edita a vontade). */
function fx(nome) {
  return JSON.parse(readFileSync(new URL(`./lib/fixtures/pedidos/${nome}.json`, import.meta.url), "utf8"));
}

/** Os tres falsos ja carregados com as fixtures de pedidos, novos a cada chamada. */
function falsos() {
  const ml = criarMLFalso({
    pedidos: [fx("ml-order")],
    envios: [fx("ml-shipment"), fx("ml-shipment-return")],
    custosDosEnvios: { 40000000001: fx("ml-shipment-costs"), 40000000002: fx("ml-shipment-return-costs") },
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
  const ZZ = { sku: { startsWith: "ZZ-PED-" } };
  await prisma.pedidoDeVenda.deleteMany({ where: { OR: [{ numero: { startsWith: "ZZ-PED-" } }, { nomeDoComprador: { contains: "ZZ Ped" } }] } });
  if (prisma.notificacaoDePedido) await prisma.notificacaoDePedido.deleteMany({ where: { recurso: { contains: "ZZ-PED" } } });
  await prisma.ordemDeProducao.deleteMany({ where: { produto: ZZ } });
  await prisma.pedidoDeCompra.deleteMany({ where: { fornecedor: { nome: { startsWith: "ZZ Ped " } } } });
  await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: "ZZ Ped " } } });
  // A peca de um kit e a peca propria tem Restrict: saem antes dos produtos.
  await prisma.pecaPropriaDoProduto.deleteMany({ where: { OR: [{ produto: ZZ }, { componente: ZZ }] } });
  await prisma.produtoComponente.deleteMany({ where: { kit: ZZ } });
  await prisma.produto.deleteMany({ where: ZZ });
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
      (await ml.get("/shipments/40000000001", { views: "destination" }, { headers: { "X-Api-Version": "2" } })).dados.tracking_number,
      "BR123456789BR",
    );
    conferir("ML falso: chamadas guardam os headers", ml.chamadas.at(-1).headers, { "X-Api-Version": "2" });
    conferir("ML falso: custos do envio (o frete de cada lado)", (await ml.get("/shipments/40000000001/costs")).dados.senders[0].cost, 18.12);
    conferir("ML falso: fatura do pedido", (await ml.get("/users/212386247/invoices/orders/2000000001")).dados.invoice_number, "1234");
    conferir("ML falso: fatura inexistente da 404", (await ml.get("/users/212386247/invoices/orders/2000000002")).status, 404);
    conferir("ML falso: pedidos e um Map editavel", ml.pedidos instanceof Map && ml.pedidos.has(2000000001), true);

    conferir("LI falsa: search since_criado", (await li.get("/pedido/search", { since_criado: "2026-11-01T00:00:00", limit: 50, offset: 0 })).dados.objects.map((p) => p.numero), [5001]);
    conferir("LI falsa: mais de 50 por pagina e recusado, como na real", (await li.get("/pedido/search", { limit: 100 })).status, 400);
    conferir("LI falsa: search since_atualizado nao acha o antigo", (await li.get("/pedido/search", { since_atualizado: "2026-11-04T00:00:00", limit: 50 })).dados.meta.total_count, 0);
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
    const ml1 = normalizarPedidoML({ order: fx("ml-order"), billing: fx("ml-billing"), shipments: [{ id: 40000000001, type: "forward" }], shipment: fx("ml-shipment"), custos: fx("ml-shipment-costs"), retorno: null, invoice: fx("ml-invoice") });
    conferir("ML: cabecalho", [ml1.origem, ml1.idExterno, ml1.numero, ml1.comprador.documento], ["MERCADO_LIVRE", "2000000001", "2000000001", "12345678909"]);
    conferir("ML: comprador e endereco", [ml1.comprador.nome, ml1.comprador.telefone, ml1.enderecoDeEntrega.cidade, ml1.enderecoDeEntrega.uf, ml1.enderecoDeEntrega.cep], ["Joao ZZ Ped Silva", "54988990008", "Caxias do Sul", "RS", "95010000"]);
    conferir("ML: item com comissao", [ml1.itens[0].quantidade, ml1.itens[0].comissao, ml1.itens[0].codigoNaOrigem], [2, 25.9, "100101"]);
    conferir("ML: frete do vendedor do envio", [ml1.envio.custoDoVendedor, ml1.envio.fonteDoCusto, ml1.envio.rastreio], [18.12, "envio", "BR123456789BR"]);
    conferir("ML: totais e pagamento", [ml1.totais, ml1.pagamento[0].tipo, ml1.pagamento[0].status], [{ totalProdutos: 119.8, desconto: 0, freteCobrado: 18.12, total: 137.92 }, "account_money", "approved"]);
    // O order_cost do envio e o VALOR DO PEDIDO (medido na VPS em 04/11/2026): sem os custos do envio, o frete fica estimado.
    conferir(
      "ML: order_cost do envio nunca vira frete",
      (({ custoDoVendedor, fonteDoCusto }) => [custoDoVendedor, fonteDoCusto])(normalizarPedidoML({ order: fx("ml-order"), billing: null, shipments: [], shipment: fx("ml-shipment"), retorno: null, invoice: null }).envio),
      [null, "estimado"],
    );
    conferir("ML: sem envio = estimado", normalizarPedidoML({ order: fx("ml-order"), billing: null, shipments: [], shipment: null, retorno: null, invoice: null }).envio.fonteDoCusto, "estimado");
    // Prazo de despacho (08/11/2026): o `expected_date` do /shipments/{id}/sla e o limite que conta na reputacao; sem ele
    // (envio ainda em "manufacturing"), o dia em que o ML libera a etiqueta (`buffering`), as 16:30, marcado como estimado.
    conferir(
      "ML: despachar ate pelo sla",
      (({ despacharAte, despachoEstimado }) => [despacharAte, despachoEstimado])(normalizarPedidoML({ order: fx("ml-order"), shipment: fx("ml-shipment"), sla: { status: "on_time", expected_date: "2026-11-11T16:30:00-03:00" } }).envio),
      ["2026-11-11T19:30:00.000Z", false],
    );
    conferir(
      "ML: sem sla, o dia do buffering as 16:30 e estimado",
      (({ despacharAte, despachoEstimado }) => [despacharAte, despachoEstimado])(normalizarPedidoML({ order: fx("ml-order"), shipment: { ...fx("ml-shipment"), shipping_option: { buffering: { date: "2026-11-12T00:00:00.000Z" } } } }).envio),
      ["2026-11-12T19:30:00.000Z", true],
    );
    conferir("ML: sem sla nem buffering, sem prazo", normalizarPedidoML({ order: fx("ml-order"), shipment: null }).envio.despacharAte, null);
    {
      const { situacaoDoDespacho, fimDoDiaEmSaoPaulo } = await import("../src/lib/pedidos/despacho.js");
      // Domingo 08/11/2026 10:00 em Sao Paulo.
      const agora = new Date("2026-11-08T13:00:00.000Z");
      const aPostar = (despacharAte) => situacaoDoDespacho({ statusDoEnvio: "A_POSTAR", despacharAte }, agora);
      conferir("despacho: hoje com a hora", aPostar("2026-11-08T19:30:00.000Z"), { chave: "hoje", texto: "Enviar hoje até 16:30" });
      conferir("despacho: amanha", aPostar("2026-11-09T19:30:00.000Z"), { chave: "amanha", texto: "Enviar amanhã até 16:30" });
      conferir("despacho: outro dia", aPostar("2026-11-11T19:30:00.000Z"), { chave: "depois", texto: "Enviar qua 11/11 até 16:30" });
      conferir("despacho: passou da hora de hoje = atrasado", aPostar("2026-11-08T12:00:00.000Z"), { chave: "atrasado", texto: "Atrasado: era hoje até 09:00" });
      conferir("despacho: dia anterior = atrasado", aPostar("2026-11-06T19:30:00.000Z"), { chave: "atrasado", texto: "Atrasado: era sex 06/11 até 16:30" });
      conferir("despacho: ja postado nao mostra nada", situacaoDoDespacho({ statusDoEnvio: "POSTADO", despacharAte: "2026-11-08T19:30:00.000Z" }, agora), null);
      conferir("despacho: sem prazo nao mostra nada", aPostar(null), null);
      conferir("fim do dia de Sao Paulo", fimDoDiaEmSaoPaulo(agora).toISOString(), "2026-11-09T02:59:59.999Z");
      conferir("fim do dia de Sao Paulo perto da meia-noite UTC", fimDoDiaEmSaoPaulo(new Date("2026-11-09T01:30:00.000Z")).toISOString(), "2026-11-09T02:59:59.999Z");
    }
    conferir("ML: sem devolucao", ml1.devolucao, null);
    conferir("ML: devolucao entregue com frete de retorno", normalizarPedidoML({ order: fx("ml-order"), billing: null, shipments: [], shipment: fx("ml-shipment"), custos: fx("ml-shipment-costs"), retorno: fx("ml-shipment-return"), custosDoRetorno: fx("ml-shipment-return-costs"), invoice: null }).devolucao, { entregueEm: new Date("2026-11-20T14:00:00.000Z"), custoDoRetorno: 22.5 });
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
    // MercadoShops: a loja do Bling que recebe parte das vendas do ML (medido na VPS em 04/11/2026: numeroLoja = pack do ML).
    conferir("Bling: MercadoShops e copia do ML", classificarLojaDoBling(203901506), "espelhoML");
  }

  console.log("\nStatus");
  {
    const s = (e) => statusDoPedido({ agora: new Date("2026-12-10T00:00:00Z"), ...e }).status;
    conferir("ML aguardando", s({ origem: "MERCADO_LIVRE", statusDaOrigem: "payment_required", tags: [], envio: {} }), "AGUARDANDO_PAGAMENTO");
    conferir("ML pago sem envio", s({ origem: "MERCADO_LIVRE", statusDaOrigem: "paid", tags: [], envio: { statusDaOrigem: "handling" } }), "PAGO");
    conferir("ML enviado", s({ origem: "MERCADO_LIVRE", statusDaOrigem: "paid", tags: [], envio: { statusDaOrigem: "shipped" } }), "ENVIADO");
    conferir("ML entregue recente", s({ origem: "MERCADO_LIVRE", statusDaOrigem: "paid", tags: [], envio: { statusDaOrigem: "delivered", historico: { entregueEm: "2026-12-01T00:00:00Z" } } }), "ENTREGUE");
    conferir("ML finalizado apos 30 dias", s({ origem: "MERCADO_LIVRE", statusDaOrigem: "paid", tags: [], envio: { statusDaOrigem: "delivered", historico: { entregueEm: "2026-11-01T00:00:00Z" } } }), "FINALIZADO");
    conferir("ML devolvido", s({ origem: "MERCADO_LIVRE", statusDaOrigem: "paid", tags: [], envio: { statusDaOrigem: "delivered" }, devolucao: { entregueEm: new Date(), custoDoRetorno: 0 } }), "DEVOLVIDO");
    conferir("ML cancelado vence separacao", s({ origem: "MERCADO_LIVRE", statusDaOrigem: "cancelled", tags: [], envio: {}, emSeparacao: true }), "CANCELADO");
    conferir("em separacao manual sobre pago", s({ origem: "LOJA_INTEGRADA", statusDaOrigem: "pedido_pago", envio: {}, emSeparacao: true }), "EM_SEPARACAO");
    conferir("LI codigos", ["pedido_efetuado", "pedido_pago", "pedido_enviado", "pedido_entregue", "pedido_cancelado"].map((c) => s({ origem: "LOJA_INTEGRADA", statusDaOrigem: c, envio: {} })), ["AGUARDANDO_PAGAMENTO", "PAGO", "ENVIADO", "ENTREGUE", "CANCELADO"]);
    conferir("desconhecido mantem o anterior", statusDoPedido({ origem: "LOJA_INTEGRADA", statusDaOrigem: "pedido_em_analise", envio: {}, anterior: "PAGO" }), { status: "PAGO", desconhecido: true });
    conferir("Bling nomes", ["Em aberto", "Em andamento", "Cancelado"].map((n) => s({ origem: "BLING", statusDaOrigem: n, envio: {} })), ["AGUARDANDO_PAGAMENTO", "PAGO", "CANCELADO"]);
    conferir("Bling atendido com rastreio", s({ origem: "BLING", statusDaOrigem: "Atendido", envio: { rastreio: "X1" } }), "ENVIADO");
    conferir("envio ML", ["pending", "ready_to_ship", "shipped", "delivered", "not_delivered", "cancelled"].map((st) => statusDoEnvio({ origem: "MERCADO_LIVRE", envio: { statusDaOrigem: st } })), ["A_POSTAR", "A_POSTAR", "EM_TRANSITO", "ENTREGUE", "NAO_ENTREGUE", "CANCELADO"]);
    conferir("envio LI pelo Enviali", ["created", "posted", "transit", "delivering", "delivered", "returned", "cancelled"].map((st) => statusDoEnvio({ origem: "LOJA_INTEGRADA", envio: { tipo: "enviali", statusDaOrigem: st } })), ["A_POSTAR", "POSTADO", "EM_TRANSITO", "EM_TRANSITO", "ENTREGUE", "NAO_ENTREGUE", "CANCELADO"]);
    conferir("envio LI sem Enviali pela situacao", statusDoEnvio({ origem: "LOJA_INTEGRADA", envio: { tipo: "correios", statusDaOrigem: null, situacaoDoPedido: "pedido_enviado" } }), "EM_TRANSITO");
    conferir("sem envio", statusDoEnvio({ origem: "BLING", envio: { tipo: null } }), "SEM_ENVIO");
    conferir("devolvido no envio", statusDoEnvio({ origem: "MERCADO_LIVRE", envio: { statusDaOrigem: "delivered" }, devolucao: { entregueEm: new Date() } }), "DEVOLVIDO");
  }

  console.log("\nCliente automatico");
  {
    const base = { canal: "MERCADO_LIVRE", numero: "ZZ-PED-10", comprador: { nome: "ZZ Ped Comprador", documento: "12345678909", email: "a@b.c", telefone: "54988990008" }, enderecoDeEntrega: { endereco: "Rua A", numero: "10", bairro: "Centro", cidade: "Caxias do Sul", uf: "RS", cep: "95090970" } };
    const novo = await clienteDoPedido(prisma, base);
    const criado = await prisma.cliente.findUnique({ where: { id: novo.clienteId }, include: { enderecos: true } });
    conferir("cria o cliente formatado", [novo.avisos, criado.documento, criado.tipoPessoa, criado.telefone, criado.enderecos[0].tipo, criado.enderecos[0].cep, criado.observacoes], [[], "123.456.789-09", "FISICA", "54988990008", "GERAL", "95090-970", "Criado pelo pedido MERCADO_LIVRE ZZ-PED-10"]);
    await prisma.cliente.update({ where: { id: novo.clienteId }, data: { nome: "Nome editado pelo dono", email: null } });
    const deNovo = await clienteDoPedido(prisma, { ...base, comprador: { ...base.comprador, nome: "Outro nome", documento: "123.456.789-09" } });
    const relido = await prisma.cliente.findUnique({ where: { id: novo.clienteId } });
    conferir("casa pelo documento com mascara e nao sobrescreve o nome, preenche o email vazio", [deNovo.clienteId === novo.clienteId, relido.nome, relido.email], [true, "Nome editado pelo dono", "a@b.c"]);
    conferir("sem documento", await clienteDoPedido(prisma, { ...base, comprador: { ...base.comprador, documento: null } }), { clienteId: null, avisos: ["clienteSemDocumento"] });
    const invalido = await clienteDoPedido(prisma, { ...base, comprador: { ...base.comprador, documento: "00000000000" } });
    conferir("documento invalido cria com aviso", [invalido.avisos, (await prisma.cliente.findUnique({ where: { id: invalido.clienteId } })).observacoes.includes("documento inválido")], [["documentoInvalido"], true]);
    conferir("CNPJ vira juridica", (await prisma.cliente.findUnique({ where: { id: (await clienteDoPedido(prisma, { ...base, comprador: { ...base.comprador, documento: "11222333000181" } })).clienteId } })).tipoPessoa, "JURIDICA");
  }

  console.log("\nItens");
  {
    const a = await prisma.produto.create({ data: { sku: "ZZ-PED-A", tituloBase: "ZZ Ped A", custo: 10, conferido: true } });
    const b = await prisma.produto.create({ data: { sku: "ZZ-PED-B", tituloBase: "ZZ Ped B", conferido: false, blingId: "ZZPEDB", fornecedorRascunho: { precoCusto: 7.5 } } });
    await prisma.produto.create({ data: { sku: "ZZ-PED-KIT", tituloBase: "ZZ Ped Kit", tipo: "COMPOSICAO", componentes: { create: [{ componenteId: a.id, quantidade: 2 }] } } });
    await prisma.anuncio.create({ data: { produtoId: a.id, canal: "MERCADO_LIVRE", idExterno: "MLBZZPED1", status: "PUBLICADO" } });
    conferir("custo: fornecedor padrao > rascunho > cadastro", [custoCongeladoDoProduto({ custo: 10, fornecedores: [{ padrao: true, precoFornecedor: 8 }] }), custoCongeladoDoProduto({ custo: 10, fornecedorRascunho: { precoCusto: 7.5 }, fornecedores: [] }), custoCongeladoDoProduto({ custo: 10, fornecedores: [] }), custoCongeladoDoProduto({ custo: null, fornecedores: [] })], [{ custo: 8, origem: "fornecedorPadrao" }, { custo: 7.5, origem: "rascunhoBling" }, { custo: 10, origem: "cadastro" }, { custo: null, origem: null }]);
    conferir("custo do kit soma as pecas", custoCongeladoDoProduto({ tipo: "COMPOSICAO", custo: null, fornecedores: [], componentes: [{ quantidade: 2, componente: { custo: 10, fornecedores: [] } }] }), { custo: 20, origem: "kit" });
    const ml = await casarItens(prisma, { origem: "MERCADO_LIVRE", itens: [{ ordem: 0, idNaOrigem: "MLBZZPED1", codigoNaOrigem: null, titulo: "A", quantidade: 2, precoUnitario: 30, desconto: 0, total: 60, comissao: 7.8 }] });
    conferir("ML casa pelo MLB", [ml.itens[0].produtoId === a.id, ml.itens[0].custoUnitarioCongelado, ml.itens[0].conferido, ml.avisos], [true, 10, true, []]);
    const li = await casarItens(prisma, { origem: "LOJA_INTEGRADA", itens: [{ ordem: 0, idNaOrigem: "999", codigoNaOrigem: "zz-ped-b", titulo: "B", quantidade: 1, precoUnitario: 5, desconto: 0, total: 5, comissao: null }] });
    conferir("LI cai no sku sem caixa; nao conferido e custo do rascunho", [li.itens[0].produtoId === b.id, li.itens[0].custoUnitarioCongelado, li.itens[0].custoOrigem, li.avisos], [true, 7.5, "rascunhoBling", ["produtoNaoConferido"]]);
    const fora = await casarItens(prisma, { origem: "BLING", itens: [{ ordem: 0, idNaOrigem: "0", codigoNaOrigem: "NAO-EXISTE", titulo: "X", quantidade: 1, precoUnitario: 5, desconto: 0, total: 5, comissao: null }] });
    conferir("fora do Rise", [fora.itens[0].produtoId, fora.avisos], [null, ["produtoForaDoRise"]]);
    conferir("Bling nao avisa nao conferido", (await casarItens(prisma, { origem: "BLING", itens: [{ ordem: 0, idNaOrigem: b.blingId, codigoNaOrigem: "ZZ-PED-B", titulo: "B", quantidade: 1, precoUnitario: 5, desconto: 0, total: 5, comissao: null }] })).avisos, []);
  }

  console.log("\nLucro");
  {
    const itemML = { quantidade: 2, precoUnitario: 100, total: 200, comissao: 26, custoUnitarioCongelado: 40 };
    const est = parcelasDaEstimativa({ origem: "MERCADO_LIVRE", itens: [itemML], totais: { total: 200 }, custosML: { percentual: 0.13, tarifaFixa: 0, frete: 19.05 } });
    conferir("estimativa ML = editor x quantidade", [est.comissao, est.frete, est.imposto, est.custo, est.lucro, est.origem], [26, 38.1, 12, 80, 43.9, "editorML"]);
    const real = parcelasDoReal({ origem: "MERCADO_LIVRE", itens: [itemML], totais: { total: 200 }, envio: { custoDoVendedor: 18.12, fonteDoCusto: "envio" }, estimativa: est });
    conferir("real ML pelo pedido e pelo envio", [real.comissao, real.frete, real.lucro, real.fontes.frete], [26, 18.12, 63.88, "envio"]);
    conferir("divergente acima da tolerancia", [lucroDivergente(43.9, 63.88), lucroDivergente(43.9, 44.8), lucroDivergente(10, 11.2), lucroDivergente(null, 5)], [true, false, true, false]);
    conferir("LI sem taxa cadastrada = comissao estimada", parcelasDoReal({ origem: "LOJA_INTEGRADA", itens: [{ quantidade: 1, precoUnitario: 50, total: 50, custoUnitarioCongelado: 20 }], totais: { total: 60 }, envio: { custoDoVendedor: null, fonteDoCusto: "estimado" }, pagamento: [{ tipo: "pix" }], taxas: null, estimativa: { comissao: 0, frete: 0 } }).fontes, { comissao: "estimado", frete: "estimado" });
    conferir("LI com taxa e etiqueta", parcelasDoReal({ origem: "LOJA_INTEGRADA", itens: [{ quantidade: 1, precoUnitario: 50, total: 50, custoUnitarioCongelado: 20 }], totais: { total: 60 }, envio: { custoDoVendedor: 18.12, fonteDoCusto: "etiqueta" }, pagamento: [{ tipo: "pix" }], taxas: { pagamento: [{ tipo: "pix", percentual: 0.0099, fixa: 0 }] }, estimativa: {} }).comissao, 0.59);
    conferir("Bling frete manual", parcelasDoReal({ origem: "BLING", itens: [], totais: { total: 100 }, envio: {}, pagamento: [], custoDoFreteManual: 25, estimativa: {} }).fontes.frete, "manual");
    conferir("devolvido", devolvido(22.5), { receita: 0, comissao: 0, tarifaFixa: 0, frete: 22.5, imposto: 0, custo: 0, lucro: -22.5, fontes: { frete: "envio" } });
    conferir("fechado so entregue sem estimado", [lucroFechado({ status: "ENTREGUE", real: { fontes: { frete: "envio" } } }), lucroFechado({ status: "ENTREGUE", real: { fontes: { frete: "estimado" } } }), lucroFechado({ status: "ENVIADO", real: { fontes: {} } })], [true, false, false]);
  }

  console.log("\nPecas");
  {
    const p1 = await prisma.produto.create({ data: { sku: "ZZ-PED-P1", tituloBase: "ZZ Ped P1", estoque: 3 } });
    const p2 = await prisma.produto.create({ data: { sku: "ZZ-PED-P2", tituloBase: "ZZ Ped P2", estoque: 0 } });
    const p3 = await prisma.produto.create({ data: { sku: "ZZ-PED-P3", tituloBase: "ZZ Ped P3", estoque: 0 } });
    const k = await prisma.produto.create({ data: { sku: "ZZ-PED-K", tituloBase: "ZZ Ped Kit", tipo: "COMPOSICAO", componentes: { create: [{ componenteId: p1.id, quantidade: 2 }] } } });
    const pp = await prisma.produto.create({ data: { sku: "ZZ-PED-PP", tituloBase: "ZZ Ped PP", pecasProprias: true, pecasDoProduto: { create: [{ componenteId: p2.id, quantidade: 1.5 }] } } });
    const fornecedor = await prisma.fornecedor.create({ data: { nome: "ZZ Ped Fornecedor" } });
    const numeroDaCompra = ((await prisma.pedidoDeCompra.aggregate({ _max: { numero: true } }))._max.numero ?? 0) + 1;
    await prisma.pedidoDeCompra.create({ data: { numero: numeroDaCompra, status: "ENVIADO", fornecedorId: fornecedor.id, enviadoEm: new Date("2026-11-05T12:00:00-03:00"), itens: { create: [{ produtoId: p2.id, quantidade: 10, prazoDias: 7 }] } } });
    const numeroDaOrdem = ((await prisma.ordemDeProducao.aggregate({ _max: { numero: true } }))._max.numero ?? 0) + 1;
    const op = await prisma.ordemDeProducao.create({ data: { numero: numeroDaOrdem, produtoId: p3.id, situacao: "ABERTA", quantidadePlanejada: 1 } });
    const mapa = new Map((await prisma.produto.findMany({ where: { sku: { startsWith: "ZZ-PED-" } }, include: { componentes: true, pecasDoProduto: true } })).map((p) => [p.id, p]));
    conferir("necessidade: simples, kit e pecas proprias", [...necessidadeDoPedido([{ produtoId: k.id, quantidade: 1 }, { produtoId: pp.id, quantidade: 1 }], mapa).entries()], [[p1.id, 2], [p2.id, 2]]);
    const novoPedido = (numero, hora, itens) =>
      prisma.pedidoDeVenda.create({
        data: { origem: "BLING", canal: "BLING", idExterno: numero, numero, dataDaVenda: new Date(`2026-11-04T${hora}:00-03:00`), atualizadoNaOrigemEm: new Date(), statusDaOrigem: "Em andamento", status: "PAGO", enderecoDeEntrega: {}, pagamento: [], envio: {}, historico: [], totalProdutos: 10, desconto: 0, freteCobrado: 0, total: 10, itens: { create: itens.map((item, ordem) => ({ ordem, produtoId: item.produtoId, titulo: "x", quantidade: item.quantidade, precoUnitario: 1, desconto: 0, total: item.quantidade })) } },
        include: { itens: true },
      });
    const pedidoAntigo = await novoPedido("ZZ-PED-20", "10:00", [{ produtoId: p1.id, quantidade: 2 }]);
    const pedidoNovo = await novoPedido("ZZ-PED-21", "11:00", [{ produtoId: p1.id, quantidade: 2 }, { produtoId: p2.id, quantidade: 1 }]);
    const pedidoComP3 = await novoPedido("ZZ-PED-22", "12:00", [{ produtoId: p3.id, quantidade: 1 }]);
    const r1 = await calcularPecas(prisma, pedidoAntigo);
    conferir("primeiro pedido tem", [r1.falta, r1.pecas[0].disponivel, r1.pecas[0].falta], [false, 3, 0]);
    const r2 = await calcularPecas(prisma, pedidoNovo);
    conferir("segundo pedido desconta a reserva do primeiro", r2.pecas.map((p) => [p.sku, p.disponivel, p.falta]), [["ZZ-PED-P1", 1, 1], ["ZZ-PED-P2", 0, 1]]);
    conferir("previsao pela compra", r2.pecas[1].previsao, "12/11");
    conferir("previsao pela producao quando nao ha compra", (await calcularPecas(prisma, pedidoComP3)).pecas.find((p) => p.sku === "ZZ-PED-P3").previsao, "em produção, ordem OP-" + String(op.numero).padStart(4, "0"));
    await prisma.pedidoDeVenda.update({ where: { id: pedidoAntigo.id }, data: { status: "CANCELADO" } });
    conferir("pedido cancelado libera a reserva", (await calcularPecas(prisma, pedidoNovo)).pecas[0].falta, 0);

    // Busca pelo nome do produto e pelo codigo/nome das PECAS, e os filtros das colunas Codigo e Local (pedido do dono em
    // 07/11/2026). O titulo do item ("x") nao tem nada disso: so acha pelo produto do Rise.
    const q1 = await prisma.produto.create({ data: { sku: "ZZ-PED-Q1", tituloBase: "ZZ Ped Peca Unica" } });
    const kq = await prisma.produto.create({ data: { sku: "ZZ-PED-KQ", tituloBase: "ZZ Ped Kit Quadrado", tipo: "COMPOSICAO", localizacao: "ZZ-L1", componentes: { create: [{ componenteId: q1.id, quantidade: 3 }] } } });
    const pm = await prisma.produto.create({ data: { sku: "ZZ-PED-PM", tituloBase: "ZZ Ped Montado", pecasProprias: true, pecasDoProduto: { create: [{ codigoManual: "ZZ-PED-MANUAL", descricao: "ZZ Ped parafuso avulso", quantidade: 1 }] } } });
    const comKit = await novoPedido("ZZ-PED-23", "13:00", [{ produtoId: kq.id, quantidade: 1 }]);
    const comPecaManual = await novoPedido("ZZ-PED-24", "14:00", [{ produtoId: pm.id, quantidade: 1 }]);
    const ids = async (filtro) => (await listarPedidosDeVenda(filtro)).linhas.map((l) => l.id);
    conferir("busca pelo codigo da peca do kit", await ids({ busca: "ZZ-PED-Q1" }), [comKit.id]);
    conferir("busca pelo nome da peca do kit", await ids({ busca: "peca unica" }), [comKit.id]);
    conferir("busca pelo nome do produto do Rise", await ids({ busca: "kit quadrado" }), [comKit.id]);
    conferir("busca pelo codigo e pelo nome da peca propria digitada", [await ids({ busca: "ZZ-PED-MANUAL" }), await ids({ busca: "parafuso avulso" })], [[comPecaManual.id], [comPecaManual.id]]);
    conferir("filtro da coluna Codigo", await ids({ busca: "ZZ-PED-2", codigos: ["ZZ-PED-KQ"] }), [comKit.id]);
    conferir("filtro da coluna Local", await ids({ busca: "ZZ-PED-2", locais: ["ZZ-L1"] }), [comKit.id]);
    const opcoesDosItens = await opcoesDasColunas({ busca: "ZZ-PED-2" });
    conferir("opcoes de Codigo e Local saem dos itens da lista", [opcoesDosItens.codigos.includes("ZZ-PED-KQ"), opcoesDosItens.codigos.includes("ZZ-PED-PM"), opcoesDosItens.locais], [true, true, ["ZZ-L1"]]);
  }

  console.log("\nAplicar");
  {
    const agora = new Date();
    const { ml: mlFalso } = falsos();
    // O anuncio ML do ZZ-PED-A (criado na secao Itens) ganha o que a estimativa do editor precisa: categoria, preco,
    // tipo e as medidas do pacote (lidas do produto).
    await prisma.produto.update({ where: { sku: "ZZ-PED-A" }, data: { pesoKg: 0.05, alturaCm: 2, larguraCm: 6, comprimentoCm: 7 } });
    await prisma.anuncio.updateMany({ where: { canal: "MERCADO_LIVRE", idExterno: "MLBZZPED1" }, data: { categoriaExternaId: "MLB99779", dados: { preco: 59.9, tipoAnuncio: "gold_special", envio: { logistica: "xd_drop_off", freteGratis: false } } } });
    const nml = normalizarPedidoML({ order: fx("ml-order"), billing: fx("ml-billing"), shipment: fx("ml-shipment"), custos: fx("ml-shipment-costs"), invoice: fx("ml-invoice") });
    nml.idExterno = nml.numero = "ZZ-PED-100";
    nml.itens[0].idNaOrigem = "MLBZZPED1";
    nml.itens[0].codigoNaOrigem = "ZZ-PED-A";
    const a1 = await aplicarPedidoLido(nml, { cliente: mlFalso, agora });
    const g1 = await prisma.pedidoDeVenda.findUnique({ where: { id: a1.id }, include: { itens: true } });
    conferir("cria o pedido completo", [a1.criado, g1.status, g1.statusDoEnvio, g1.itens.length, g1.clienteId !== null, g1.estimativa?.origem, g1.lucroReal !== null], [true, "ENVIADO", "EM_TRANSITO", 1, true, "editorML", true]);
    const a2 = await aplicarPedidoLido({ ...nml, totais: { ...nml.totais, totalProdutos: 999, total: 999 } }, { cliente: mlFalso, agora });
    const g2 = await prisma.pedidoDeVenda.findUnique({ where: { id: a1.id }, include: { itens: true } });
    conferir("segunda leitura atualiza sem duplicar e nao mexe na estimativa", [a2.criado, a2.id === a1.id, g2.itens.length, Number(g2.total), g2.estimativa.lucro === g1.estimativa.lucro, g2.avisos.includes("lucroDivergente")], [false, true, 1, 999, true, true]);
    conferir("anterior ao corte e ignorado", (await aplicarPedidoLido({ ...nml, idExterno: "ZZ-PED-101", dataDaVenda: new Date("2026-10-31T12:00:00Z") }, { cliente: mlFalso, agora })).ignorado, true);
    conferir("status desconhecido mantem e avisa", (await aplicarPedidoLido({ ...nml, statusDaOrigem: "xyz" }, { cliente: mlFalso, agora })).avisos.includes("statusDesconhecido"), true);
    conferir("fraude avisa", (await aplicarPedidoLido({ ...nml, tags: ["fraud_risk_detected"] }, { cliente: mlFalso, agora })).avisos.includes("fraude"), true);
    const entregue = await aplicarPedidoLido({ ...nml, envio: { ...nml.envio, statusDaOrigem: "delivered", historico: { entregueEm: agora.toISOString() } } }, { cliente: mlFalso, agora });
    conferir("entregue fecha o lucro", (await prisma.pedidoDeVenda.findUnique({ where: { id: entregue.id } })).lucroFechado, true);
    const dev = await aplicarPedidoLido({ ...nml, devolucao: { entregueEm: agora, custoDoRetorno: 22.5 }, nf: { ...nml.nf, status: "authorized" } }, { cliente: mlFalso, agora });
    const gd = await prisma.pedidoDeVenda.findUnique({ where: { id: dev.id } });
    conferir("devolucao reabre, zera e deixa o retorno como prejuizo", [gd.status, gd.statusDoEnvio, gd.lucroFechado, Number(gd.lucroReal), gd.real.receita, gd.avisos.includes("lucroDivergente"), gd.avisos.includes("nfACancelar"), gd.clienteId === g1.clienteId], ["DEVOLVIDO", "DEVOLVIDO", false, -22.5, 0, false, true, true]);
    conferir("nf cancelada apaga o aviso", (await aplicarPedidoLido({ ...nml, devolucao: { entregueEm: agora, custoDoRetorno: 22.5 }, nf: { ...nml.nf, status: "cancelled" } }, { cliente: mlFalso, agora })).avisos.includes("nfACancelar"), false);
    const pago = await aplicarPedidoLido({ ...nml, idExterno: "ZZ-PED-102", numero: "ZZ-PED-102", statusDaOrigem: "paid", envio: { ...nml.envio, statusDaOrigem: "handling" }, itens: [{ ...nml.itens[0], quantidade: 50 }] }, { cliente: mlFalso, agora });
    conferir("falta de peca vira aguardando pecas", pago.status, "AGUARDANDO_PECAS");
    // "Enviar hoje" (08/11/2026): a postar com o prazo do ML ate o fim de hoje (atrasados entram), sem olhar o periodo.
    {
      const hojeAs = new Date(Math.min(agora.getTime(), new Date(`${agora.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })}T23:00:00-03:00`).getTime()));
      const amanha = new Date(agora.getTime() + 36 * 3600 * 1000);
      const aPostar = (id, despacharAte) => aplicarPedidoLido({ ...nml, idExterno: id, numero: id, statusDaOrigem: "paid", envio: { ...nml.envio, statusDaOrigem: "ready_to_ship", despacharAte }, itens: [{ ...nml.itens[0], quantidade: 1 }] }, { cliente: mlFalso, agora });
      const hoje = await aPostar("ZZ-PED-110", hojeAs.toISOString());
      const depois = await aPostar("ZZ-PED-111", amanha.toISOString());
      conferir("despacho: coluna gravada", (await prisma.pedidoDeVenda.findUnique({ where: { id: hoje.id } })).despacharAte?.toISOString(), hojeAs.toISOString());
      const doDia = (await listarPedidosDeVenda({ busca: "ZZ-PED-11", despacho: "hoje", agora, desde: new Date("2030-01-01"), ate: new Date("2030-01-02") })).linhas.map((l) => l.numero);
      conferir("filtro enviar hoje: so o de hoje, ignorando o periodo", doDia, ["ZZ-PED-110"]);
      conferir("linha leva o prazo", (await listarPedidosDeVenda({ busca: "ZZ-PED-111" })).linhas[0]?.despacharAte?.toISOString?.() ?? null, amanha.toISOString());
      void depois;
    }
    conferir("marcar separacao", [(await marcarEmSeparacao(pago.id, true)).ok, (await prisma.pedidoDeVenda.findUnique({ where: { id: pago.id } })).emSeparacao], [true, true]);
    conferir("separacao recusada em enviado", (await marcarEmSeparacao(a1.id, true)).ok, false);
    conferir("espelho do Bling", [await espelharNoBling("MERCADO_LIVRE", "ZZ-PED-100", { blingPedidoId: "7777", blingNumero: "123" }), await espelharNoBling("MERCADO_LIVRE", "nao-existe", { blingPedidoId: "1", blingNumero: "1" })], [true, false]);
    // O Bling grava no numeroLoja o numero do carrinho (pack) do ML quando o pedido tem um (medido na VPS em 04/11/2026).
    await prisma.pedidoDeVenda.update({ where: { id: pago.id }, data: { packId: "ZZ-PED-PACK-1" } });
    conferir("espelho do Bling pelo pack do ML", [await espelharNoBling("MERCADO_LIVRE", "ZZ-PED-PACK-1", { blingPedidoId: "8888", blingNumero: "124" }), (await prisma.pedidoDeVenda.findUnique({ where: { id: pago.id } })).blingNumero], [true, "124"]);
    const nbling = normalizarPedidoBling({ pedido: fx("bling-pedido")[0], formas: fx("bling-formas").data, situacoes: fx("bling-situacoes").situacoes["98310"], nfe: null });
    nbling.idExterno = nbling.numero = nbling.blingPedidoId = nbling.blingNumero = "ZZ-PED-103";
    const bl = await aplicarPedidoLido(nbling, { agora });
    conferir("Bling: frete manual recalcula o real", [(await salvarCustoDoFreteManual(bl.id, 25)).ok, (await prisma.pedidoDeVenda.findUnique({ where: { id: bl.id } })).real.fontes.frete], [true, "manual"]);
    conferir("frete manual recusado fora do Bling", (await salvarCustoDoFreteManual(a1.id, 25)).ok, false);
    conferir("releitura nao apaga o frete manual", Number((await (async () => { await aplicarPedidoLido(nbling, { agora }); return prisma.pedidoDeVenda.findUnique({ where: { id: bl.id } }); })()).custoDoFreteManual), 25);
    const semCliente = await aplicarPedidoLido({ ...nbling, idExterno: "ZZ-PED-104", numero: "ZZ-PED-104", comprador: { ...nbling.comprador, documento: null } }, { agora });
    conferir("vincular cliente tira o aviso", [semCliente.avisos.includes("clienteSemDocumento"), (await vincularCliente(semCliente.id, g1.clienteId)).ok, (await prisma.pedidoDeVenda.findUnique({ where: { id: semCliente.id } })).avisos.includes("clienteSemDocumento")], [true, true, false]);
    const semDoc = await aplicarPedidoLido({ ...nbling, idExterno: "ZZ-PED-105", numero: "ZZ-PED-105", comprador: { ...nbling.comprador, documento: null } }, { agora });
    const criado = await criarClienteDoPedido(semDoc.id);
    const gSemDoc = await prisma.pedidoDeVenda.findUnique({ where: { id: semDoc.id }, include: { cliente: true } });
    conferir(
      "criar cliente sem documento pelo pedido",
      [criado.ok, gSemDoc.cliente?.nome, gSemDoc.cliente?.documento, gSemDoc.avisos.includes("clienteSemDocumento"), gSemDoc.cliente?.observacoes?.startsWith("Criado pelo pedido")],
      [true, nbling.comprador.nome, null, false, true],
    );
    conferir("criar cliente recusado quando o pedido ja tem cliente", (await criarClienteDoPedido(semDoc.id)).ok, false);
    const achados = await buscarClientesParaVincular(nbling.comprador.nome.slice(0, 8));
    conferir("busca de clientes para vincular acha pelo nome", achados.some((c) => c.id === gSemDoc.clienteId), true);
    conferir("busca de clientes para vincular acha pelo CPF so com digitos", (await buscarClientesParaVincular("12345678909")).some((c) => c.documento === "123.456.789-09"), true);
    conferir("busca de clientes vazia nao lista nada", await buscarClientesParaVincular(" "), []);
    const doCliente = await listarPedidosDeVenda({ clienteId: gSemDoc.clienteId });
    conferir("lista so os pedidos de um cliente", [doCliente.total, doCliente.linhas[0]?.id], [1, semDoc.id]);
    const lista = await listarPedidosDeVenda({ busca: "ZZ-PED-10", porPagina: 25 });
    conferir("lista acha pelo numero e traz o cliente", [lista.total >= 3, lista.linhas[0].cliente?.nome !== undefined], [true, true]);
    // O "R" no icone do canal (pedido do dono em 04/11/2026): a venda veio de um anuncio que o Rise criou.
    const doRise = await listarPedidosDeVenda({ busca: "ZZ-PED-100" });
    const deFora = await listarPedidosDeVenda({ busca: "ZZ-PED-103" });
    conferir("lista marca a venda de anuncio do Rise", [doRise.linhas[0]?.doRise, deFora.linhas[0]?.doRise], [true, false]);
    conferir("o pedido lido diz se a venda e de anuncio do Rise", (await lerPedidoDeVenda(a1.id)).doRise, true);
    conferir("so com aviso", (await listarPedidosDeVenda({ busca: "ZZ-PED-10", soComAviso: true })).linhas.every((l) => l.avisos.length > 0), true);
    // O filtro das colunas Status e Envio (pedido do dono em 04/11/2026): as opcoes sao as que existem na lista filtrada.
    const opcoes = await opcoesDasColunas({ busca: "ZZ-PED-10" });
    conferir("opcoes das colunas: status e envio que existem, na ordem da tabela", [opcoes.status.includes("PAGO"), opcoes.status.includes("FINALIZADO"), opcoes.envio.length > 0], [true, false, true]);
    const soEnvio = await listarPedidosDeVenda({ busca: "ZZ-PED-10", envio: [opcoes.envio[0]] });
    conferir("filtro pelo status do envio", soEnvio.linhas.every((l) => l.statusDoEnvio === opcoes.envio[0]) && soEnvio.total > 0, true);
    // O lucro do periodo (pedido do dono em 04/11/2026): a mesma regra da coluna Lucro, sobre a lista filtrada inteira.
    const todos = await listarPedidosDeVenda({ busca: "ZZ-PED-10", porPagina: 100 });
    const esperado = todos.linhas.reduce((soma, l) => {
      if (l.status === "CANCELADO") return soma;
      const valor = l.lucroFechado || l.status === "DEVOLVIDO" ? l.lucroReal : (l.lucroEstimado ?? l.lucroReal);
      return valor === null ? soma : soma + valor;
    }, 0);
    const resumo = await resumoDaLista({ busca: "ZZ-PED-10" });
    conferir("lucro do periodo soma pela regra da coluna", [Math.round(resumo.lucro * 100), resumo.pedidos], [Math.round(esperado * 100), todos.total]);
    const lido = await lerPedidoDeVenda(a1.id);
    conferir("ler o pedido traz itens com produto e o cliente", [lido.itens[0].produto.sku, typeof lido.cliente.nome, typeof lido.total], ["ZZ-PED-A", "string", "number"]);
  }

  console.log("\nLeitura");
  {
    const agora = new Date();
    const agoraMais5 = new Date(agora.getTime() + 5 * 60 * 1000);
    const agoraMais10 = new Date(agora.getTime() + 10 * 60 * 1000);
    // O ML falso desta secao nao tem o envio de retorno: a fixture do retorno e "entregue", e o pedido viraria devolvido.
    const mlFalso = criarMLFalso({ pedidos: [fx("ml-order")], envios: [fx("ml-shipment")], custosDosEnvios: { 40000000001: fx("ml-shipment-costs") }, faturas: [fx("ml-invoice")], cobrancas: { 2000000001: fx("ml-billing") } });
    const { li: liFalsa, bling: blingFalso } = falsos();
    // 5002: o mesmo pedido da LI, vendido 2 h antes de `agora` e sem copia no Bling (a data da LI e naive, de Sao Paulo).
    const naiveSP = (d) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(d).replace(" ", "T");
    const ha2h = naiveSP(new Date(agora.getTime() - 2 * 60 * 60 * 1000));
    liFalsa.pedidos.set(5002, { ...fx("li-pedido"), numero: 5002, data_criacao: ha2h, data_modificacao: ha2h });
    const rotinaAntes = await prisma.rotinaDoWorker.findUnique({ where: { id: "pedidos" } });
    await prisma.rotinaDoWorker.deleteMany({ where: { id: "pedidos" } });
    try {
      const r1 = await rodarLeituraDePedidos({ ml: mlFalso, li: liFalsa, bling: blingFalso, agora, taxas: null });
      conferir("carga inicial le as tres origens", [r1.lidos, r1.criados, r1.erros, r1.ignorados], [4, 4, 0, { "Shopee 4hobby": 1 }]);
      const rot = await prisma.rotinaDoWorker.findUnique({ where: { id: "pedidos" } });
      conferir("cursor gravado por origem", Object.keys(rot.dados.cursores).sort(), ["BLING", "LOJA_INTEGRADA", "MERCADO_LIVRE"]);
      const porNumero = async (origem, idExterno) => prisma.pedidoDeVenda.findUnique({ where: { origem_idExterno: { origem, idExterno } } });
      conferir("espelho do Bling preenchido no pedido do ML", (await porNumero("MERCADO_LIVRE", "2000000001")).blingNumero, "123");
      conferir("pedido do ML nao duplicou pelo Bling", await prisma.pedidoDeVenda.count({ where: { origem: "BLING", numero: "123" } }), 0);
      mlFalso.pedidos.get(2000000001).status = "cancelled";
      mlFalso.pedidos.get(2000000001).last_updated = agoraMais5.toISOString();
      const r2 = await rodarLeituraDePedidos({ ml: mlFalso, li: liFalsa, bling: blingFalso, agora: agoraMais5, taxas: null });
      conferir("segunda volta so o alterado", [r2.lidos, r2.criados, (await porNumero("MERCADO_LIVRE", "2000000001")).status], [1, 0, "CANCELADO"]);
      liFalsa.falhas = { "GET /pedido/5001": 500 };
      liFalsa.pedidos.get(5001).data_modificacao = naiveSP(agoraMais10);
      const r3 = await rodarLeituraDePedidos({ ml: mlFalso, li: liFalsa, bling: blingFalso, agora: agoraMais10, taxas: null });
      conferir("pedido que falha nao para a rotina", [r3.erros, r3.aviso], [1, "1 falha(s)"]);
      conferir("pedido que falhou ganha o aviso", (await porNumero("LOJA_INTEGRADA", "5001")).avisos.includes("leituraFalhou"), true);
      // a 5002 nao tem copia no Bling e foi vendida 2 h antes de `agora`; a 5001 tem o espelho 7003
      conferir("espelho ausente depois de 1 h", [(await porNumero("LOJA_INTEGRADA", "5002")).avisos.includes("espelhoNoBlingAusente"), (await porNumero("LOJA_INTEGRADA", "5001")).avisos.includes("espelhoNoBlingAusente")], [true, false]);
      conferir("espelhar tira o aviso", [await espelharNoBling("LOJA_INTEGRADA", "5002", { blingPedidoId: "7777", blingNumero: "777" }), (await porNumero("LOJA_INTEGRADA", "5002")).avisos.includes("espelhoNoBlingAusente")], [true, false]);
      conferir("ROTINAS_DO_WORKER tem pedidos", ROTINAS_DO_WORKER.some((r) => r.id === "pedidos"), true);
    } finally {
      await prisma.rotinaDoWorker.deleteMany({ where: { id: "pedidos" } });
      if (rotinaAntes) await prisma.rotinaDoWorker.create({ data: rotinaAntes }).catch(() => {});
    }
  }

  console.log("\nAcessos e taxas");
  {
    conferir(
      "recursos de pedidos",
      RECURSOS.filter((r) => r.id.startsWith("acao.pedidos.")).map((r) => r.id),
      ["acao.pedidos.marcarSeparacao", "acao.pedidos.editarCustoDoFrete", "acao.pedidos.vincularCliente", "acao.pedidos.emitirNF", "acao.pedidos.baixarNF"],
    );
    conferir("acoes de pedidos ficam sob a tela de Pedidos", RECURSOS.filter((r) => r.id.startsWith("acao.pedidos.")).every((r) => r.pai === "tela.pedidos"), true);
    conferir("tipos de pagamento da LI", TIPOS_DE_PAGAMENTO_LI, ["pix", "boleto", "cartao_credito", "cartao_debito", "outro"]);
    const antes = await prisma.configCanal.findUnique({ where: { canal: "LOJA_INTEGRADA" } });
    try {
      conferir("taxas: percentual acima de 1 recusado", (await salvarTaxas("LOJA_INTEGRADA", { pagamento: [{ tipo: "pix", percentual: 5, fixa: 0 }] })).ok, false);
      conferir("taxas: tipo desconhecido recusado", (await salvarTaxas("LOJA_INTEGRADA", { pagamento: [{ tipo: "cheque", percentual: 0.01, fixa: 0 }] })).ok, false);
      conferir("taxas: fixa negativa recusada", (await salvarTaxas("LOJA_INTEGRADA", { pagamento: [{ tipo: "pix", percentual: 0.01, fixa: -1 }] })).ok, false);
      conferir("taxas: canal sem taxa recusado", (await salvarTaxas("MERCADO_LIVRE", { pagamento: [] })).ok, false);
      conferir("taxas salvas", (await salvarTaxas("LOJA_INTEGRADA", { pagamento: [{ tipo: "pix", percentual: 0.0099, fixa: 0 }] })).ok, true);
      conferir("taxas gravadas e lidas", await lerTaxas("LOJA_INTEGRADA"), { pagamento: [{ tipo: "pix", percentual: 0.0099, fixa: 0 }], padrao: { percentual: 0, fixa: 0, frete: 0 } });
      conferir("taxas: o real da LI usa a taxa salva", parcelasDoReal({ origem: "LOJA_INTEGRADA", itens: [{ precoUnitario: 100, quantidade: 1, total: 100, custoUnitarioCongelado: 50 }], totais: { totalProdutos: 100, total: 100 }, pagamento: [{ tipo: "pix" }], taxas: await lerTaxas("LOJA_INTEGRADA") }).comissao, 0.99);
    } finally {
      if (antes) await prisma.configCanal.update({ where: { canal: "LOJA_INTEGRADA" }, data: { taxas: antes.taxas ?? Prisma.DbNull } });
      else await prisma.configCanal.deleteMany({ where: { canal: "LOJA_INTEGRADA" } });
    }
    conferir("taxas: sem linha no banco = null", await lerTaxas("SHOPEE"), null);
  }

  console.log("\nRevisao final");
  {
    const { projetarPedido, projetarLinhaDaLista } = await import("../src/lib/pedidos/projecao.js");
    const tudo = () => true;
    const semPessoal = (id) => id !== "dado.pessoalDoCliente";
    const semCusto = (id) => id !== "dado.custo";
    const pedido = {
      documentoDoComprador: "12345678909",
      telefoneDoComprador: "54988990008",
      emailDoComprador: "a@b.com",
      enderecoDeEntrega: { cidade: "Caxias do Sul" },
      cliente: { id: "c1", nome: "Fulano", nivel: "OURO", documento: "123.456.789-09", telefone: "54988990008", email: "a@b.com", enderecos: [{ tipo: "GERAL", cidade: "Caxias do Sul" }] },
      estimativa: { lucro: 10 },
      real: { lucro: 8 },
      lucroEstimado: 10,
      lucroReal: 8,
      itens: [{ titulo: "x", custoUnitarioCongelado: 5, custoOrigem: "cadastro", comissao: 1 }],
    };
    conferir("projecao: com tudo nao muda nada", projetarPedido(pedido, tudo), pedido);
    const comLocal = { ...pedido, itens: [{ titulo: "x", produto: { id: "p", sku: "A", localizacao: "R14" } }] };
    conferir("projecao: sem localizacao o item perde a do produto", projetarPedido(comLocal, (id) => id !== "dado.localizacao").itens[0].produto, { id: "p", sku: "A", localizacao: null });
    const lido = await lerPedidoDeVenda((await prisma.pedidoDeVenda.findFirst({ where: { numero: "ZZ-PED-102" }, select: { id: true } })).id);
    conferir("o pedido lido traz a localizacao do produto do item", "localizacao" in (lido.itens[0].produto ?? {}), true);
    conferir("o pedido lido traz os enderecos do cadastro do cliente", Array.isArray(lido.cliente?.enderecos), true);
    const p1 = projetarPedido(pedido, semPessoal);
    conferir(
      "projecao: sem dado pessoal tira documento, telefone, e-mail e endereco",
      [p1.documentoDoComprador, p1.telefoneDoComprador, p1.emailDoComprador, p1.enderecoDeEntrega, p1.cliente.documento, p1.cliente.telefone, p1.cliente.email, p1.cliente.nome, p1.estimativa.lucro, p1.cliente.enderecos],
      [null, null, null, null, undefined, undefined, undefined, "Fulano", 10, undefined],
    );
    const p2 = projetarPedido(pedido, semCusto);
    conferir(
      "projecao: sem custo tira estimativa, real, lucros e o custo dos itens",
      [p2.estimativa, p2.real, p2.lucroEstimado, p2.lucroReal, p2.itens[0].custoUnitarioCongelado, p2.itens[0].custoOrigem, p2.itens[0].comissao, p2.documentoDoComprador],
      [null, null, null, null, null, null, 1, "12345678909"],
    );
    conferir("projecao: a linha da lista sem custo perde o lucro", projetarLinhaDaLista({ id: "1", lucroEstimado: 3, lucroReal: 2, total: 9 }, semCusto), { id: "1", lucroEstimado: null, lucroReal: null, total: 9 });
    const semLocal = (id) => id !== "dado.localizacao";
    conferir(
      "projecao: a linha da lista sem localizacao perde a do item",
      projetarLinhaDaLista({ id: "1", item: { sku: "A", localizacao: "R14" } }, semLocal).item,
      { sku: "A", localizacao: null },
    );
    const lista = await listarPedidosDeVenda({ busca: "ZZ-PED-102" });
    conferir("a linha da lista traz a localizacao do produto do 1o item", "localizacao" in (lista.linhas[0]?.item ?? {}), true);

    // O ML lento (6 s na primeira chamada) nao pode derrubar a gravacao: a transacao do banco fecha em 5 s.
    const base = criarMLFalso({ pedidos: [fx("ml-order")], envios: [fx("ml-shipment")], custosDosEnvios: { 40000000001: fx("ml-shipment-costs") }, faturas: [fx("ml-invoice")], cobrancas: { 2000000001: fx("ml-billing") } });
    let primeira = true;
    const lento = {
      ...base,
      get: async (...args) => {
        if (primeira) {
          primeira = false;
          await new Promise((resolver) => setTimeout(resolver, 6000));
        }
        return base.get(...args);
      },
    };
    const nlento = normalizarPedidoML({ order: fx("ml-order"), billing: fx("ml-billing"), shipment: fx("ml-shipment"), custos: fx("ml-shipment-costs"), invoice: fx("ml-invoice") });
    nlento.idExterno = nlento.numero = "ZZ-PED-130";
    nlento.itens[0].idNaOrigem = "MLBZZPED1";
    nlento.itens[0].codigoNaOrigem = "ZZ-PED-A";
    let gravou = null;
    try {
      gravou = await aplicarPedidoLido(nlento, { cliente: lento, agora: new Date() });
    } catch (erro) {
      gravou = { erro: erro.message.slice(0, 80) };
    }
    const gLento = gravou?.id ? await prisma.pedidoDeVenda.findUnique({ where: { id: gravou.id } }) : null;
    conferir("ML lento: o pedido grava com a estimativa do editor", [Boolean(gravou?.id), gLento?.estimativa?.origem], [true, "editorML"]);

    // Venda de um anuncio que o Rise nao tem (medido na VPS em 04/11/2026, 14 de 15): a estimativa vazia nao pode
    // ficar congelada; o aviso continua a cada leitura e, quando o anuncio passa a existir no Rise, ela e calculada.
    const nsem = { ...nlento, idExterno: "ZZ-PED-131", numero: "ZZ-PED-131", itens: [{ ...nlento.itens[0], idNaOrigem: "MLBZZFORA" }] };
    const s1 = await aplicarPedidoLido(nsem, { cliente: base, agora: new Date() });
    const s2 = await aplicarPedidoLido(nsem, { cliente: base, agora: new Date() });
    conferir("sem anuncio no Rise: o aviso sem estimativa continua na releitura", [s1.avisos.includes("semEstimativa"), s2.avisos.includes("semEstimativa")], [true, true]);
    await prisma.anuncio.updateMany({ where: { canal: "MERCADO_LIVRE", idExterno: "MLBZZPED1" }, data: { idExterno: "MLBZZFORA" } });
    try {
      const s3 = await aplicarPedidoLido(nsem, { cliente: base, agora: new Date() });
      const g3 = await prisma.pedidoDeVenda.findUnique({ where: { id: s3.id } });
      conferir("anuncio que passou a existir: a estimativa vazia e calculada na releitura", [g3.estimativa?.origem, s3.avisos.includes("semEstimativa")], ["editorML", false]);
    } finally {
      await prisma.anuncio.updateMany({ where: { canal: "MERCADO_LIVRE", idExterno: "MLBZZFORA" }, data: { idExterno: "MLBZZPED1" } });
    }
  }

  console.log("\nFila");
  {
    // Fase 2: a fila das notificacoes dos canais (webhooks), esvaziada pelo worker.
    const linha = await prisma.notificacaoDePedido.create({ data: { origem: "MERCADO_LIVRE", recurso: "/orders/ZZ-PED-900", payload: {} } });
    conferir("fila: notificacao nasce sem tentativa e sem processar", [linha.tentativas, linha.processadaEm], [0, null]);
    await prisma.notificacaoDePedido.delete({ where: { id: linha.id } });

    const { processarNotificacoes } = await import("../src/lib/pedidos/leitura.js");
    const agoraFila = new Date();
    // Os pedidos das fixtures ja vieram na secao Leitura: saem, para a fila provar que os cria.
    const tirar = (origem, idExterno) => prisma.pedidoDeVenda.deleteMany({ where: { origem, idExterno } });
    const naFila = async (origem, recursos) => {
      const ids = [];
      for (const recurso of recursos) ids.push((await prisma.notificacaoDePedido.create({ data: { origem, recurso, payload: {} } })).id);
      return ids;
    };
    const linhas = (ids) => prisma.notificacaoDePedido.findMany({ where: { id: { in: ids } }, orderBy: { recebidaEm: "asc" } });
    const criadas = [];
    try {
      await tirar("MERCADO_LIVRE", "2000000001");
      let f = falsos();
      let ids = await naFila("MERCADO_LIVRE", ["/orders/2000000001"]);
      criadas.push(...ids);
      let r = await processarNotificacoes({ ...f, agora: agoraFila, ids });
      const doML = await prisma.pedidoDeVenda.findUnique({ where: { origem_idExterno: { origem: "MERCADO_LIVRE", idExterno: "2000000001" } } });
      conferir("fila: pedido do ML pela notificacao", [r.processadas, r.erros, Boolean(doML), (await linhas(ids))[0].processadaEm?.getTime()], [1, 0, true, agoraFila.getTime()]);

      await tirar("MERCADO_LIVRE", "2000000001");
      f = falsos();
      ids = await naFila("MERCADO_LIVRE", ["/orders/2000000001", "/orders/2000000001", "/orders/2000000001"]);
      criadas.push(...ids);
      let leituras = 0;
      const getOriginal = f.ml.get.bind(f.ml);
      f.ml.get = (rota, ...resto) => {
        if (rota === "/orders/2000000001") leituras += 1;
        return getOriginal(rota, ...resto);
      };
      r = await processarNotificacoes({ ...f, agora: agoraFila, ids });
      conferir(
        "notificacao repetida nao duplica",
        [leituras, r.processadas, (await linhas(ids)).every((l) => l.processadaEm), await prisma.pedidoDeVenda.count({ where: { origem: "MERCADO_LIVRE", idExterno: "2000000001" } })],
        [1, 3, true, 1],
      );

      await tirar("MERCADO_LIVRE", "2000000001");
      f = falsos();
      ids = await naFila("MERCADO_LIVRE", ["/shipments/40000000001"]);
      criadas.push(...ids);
      r = await processarNotificacoes({ ...f, agora: agoraFila, ids });
      conferir("fila: shipment acha o pedido", [r.processadas, await prisma.pedidoDeVenda.count({ where: { origem: "MERCADO_LIVRE", idExterno: "2000000001" } })], [1, 1]);

      await prisma.pedidoDeVenda.updateMany({ where: { origem: "MERCADO_LIVRE", idExterno: "2000000001" }, data: { blingNumero: null, blingPedidoId: null } });
      await tirar("BLING", "7002");
      f = falsos();
      ids = await naFila("BLING", ["order.updated:7002"]);
      criadas.push(...ids);
      r = await processarNotificacoes({ ...f, agora: agoraFila, ids });
      conferir(
        "bling: copia do ML so espelha",
        [r.processadas, await prisma.pedidoDeVenda.count({ where: { origem: "BLING", OR: [{ numero: "123" }, { idExterno: "7002" }] } }), (await prisma.pedidoDeVenda.findUnique({ where: { origem_idExterno: { origem: "MERCADO_LIVRE", idExterno: "2000000001" } } })).blingNumero],
        [1, 0, "123"],
      );

      await tirar("BLING", "7001");
      f = falsos();
      ids = await naFila("BLING", ["order.created:7001"]);
      criadas.push(...ids);
      r = await processarNotificacoes({ ...f, agora: agoraFila, ids });
      conferir("bling: pedido digitado vira pedido", [r.processadas, await prisma.pedidoDeVenda.count({ where: { origem: "BLING", idExterno: "7001" } })], [1, 1]);

      f = falsos();
      ids = await naFila("MERCADO_LIVRE", ["/orders/9"]);
      criadas.push(...ids);
      r = await processarNotificacoes({ ...f, agora: agoraFila, ids });
      const [falhou] = await linhas(ids);
      conferir("fila: id que nao existe vira erro e tenta de novo", [r.erros, falhou.tentativas, falhou.processadaEm, Boolean(falhou.erro)], [1, 1, null, true]);

      await prisma.notificacaoDePedido.update({ where: { id: falhou.id }, data: { tentativas: 4 } });
      r = await processarNotificacoes({ ...falsos(), agora: agoraFila, ids });
      const [desistiu] = await linhas(ids);
      conferir("fila: na 5a tentativa desiste", [desistiu.tentativas, desistiu.processadaEm?.getTime()], [5, agoraFila.getTime()]);
      r = await processarNotificacoes({ ...falsos(), agora: agoraFila, ids });
      conferir("fila: a que desistiu nao volta", r.processadas + r.erros, 0);
    } finally {
      await prisma.notificacaoDePedido.deleteMany({ where: { id: { in: criadas } } });
    }
  }

  console.log("\nWebhooks");
  {
    const { createHmac } = await import("node:crypto");
    const { conferirNotificacao, registrarNotificacao } = await import("../src/lib/pedidos/webhooks.js");
    const seg = { mlUsuarioId: "212386247", mlClientId: "123", blingClientSecret: "segredo-zz", liToken: "tok-zz" };
    const corpoML = JSON.stringify({ resource: "/orders/2000000001", user_id: 212386247, topic: "orders_v2", application_id: 123 });
    conferir("webhook ML valido", conferirNotificacao({ origem: "MERCADO_LIVRE", corpoTexto: corpoML, headers: new Headers(), segredos: seg }).recurso, "/orders/2000000001");
    conferir("webhook ML de outra conta", conferirNotificacao({ origem: "MERCADO_LIVRE", corpoTexto: corpoML.replace("212386247", "999"), headers: new Headers(), segredos: seg }).status, 401);
    conferir("webhook ML de outro app", conferirNotificacao({ origem: "MERCADO_LIVRE", corpoTexto: corpoML.replace('"application_id":123', '"application_id":9'), headers: new Headers(), segredos: seg }).status, 401);
    conferir("webhook ML de outro topico e ignorado", conferirNotificacao({ origem: "MERCADO_LIVRE", corpoTexto: corpoML.replace("orders_v2", "questions"), headers: new Headers(), segredos: seg }).recurso, null);
    const corpoBling = JSON.stringify({ event: "order.updated", companyId: "x", data: { id: 7002 } });
    const assinatura = "sha256=" + createHmac("sha256", "segredo-zz").update(corpoBling).digest("hex");
    conferir("webhook Bling assinado", conferirNotificacao({ origem: "BLING", corpoTexto: corpoBling, headers: new Headers({ "x-bling-signature-256": assinatura }), segredos: seg }).recurso, "order.updated:7002");
    conferir("webhook Bling sem assinatura", conferirNotificacao({ origem: "BLING", corpoTexto: corpoBling, headers: new Headers(), segredos: seg }).status, 401);
    conferir("webhook Bling assinatura de outro corpo", conferirNotificacao({ origem: "BLING", corpoTexto: corpoBling.replace("7002", "7003"), headers: new Headers({ "x-bling-signature-256": assinatura }), segredos: seg }).status, 401);
    conferir("webhook LI com token", conferirNotificacao({ origem: "LOJA_INTEGRADA", corpoTexto: '{"numero":5001}', headers: new Headers({ token: "tok-zz" }), segredos: seg }).recurso, "pedido:5001");
    conferir("webhook LI com token no Authorization", conferirNotificacao({ origem: "LOJA_INTEGRADA", corpoTexto: "{}", headers: new Headers({ authorization: "Bearer tok-zz" }), segredos: seg }).recurso, "pedido:?");
    conferir("webhook LI token errado", conferirNotificacao({ origem: "LOJA_INTEGRADA", corpoTexto: '{"numero":5001}', headers: new Headers({ token: "x" }), segredos: seg }).status, 401);
    conferir("webhook LI sem token cadastrado recusa", conferirNotificacao({ origem: "LOJA_INTEGRADA", corpoTexto: "{}", headers: new Headers({ token: "" }), segredos: { ...seg, liToken: null } }).status, 401);
    const gravada = await registrarNotificacao({ origem: "MERCADO_LIVRE", recurso: "/orders/ZZ-PED-901", payload: { a: 1 } });
    conferir("webhook: a notificacao vai para a fila", (await prisma.notificacaoDePedido.findUnique({ where: { id: gravada.id } }))?.recurso, "/orders/ZZ-PED-901");

    const { POST } = await import("../src/app/api/webhooks/[origem]/route.js");
    const chamar = (origem, corpo, headers = {}) => POST(new Request(`https://rise.test/api/webhooks/${origem}`, { method: "POST", body: corpo, headers }), { params: Promise.resolve({ origem }) });
    const antes = await prisma.notificacaoDePedido.count();
    conferir("rota: origem desconhecida = 404", (await chamar("shopee", "{}")).status, 404);
    conferir("rota: corpo que nao e JSON = 400", (await chamar("mercado-livre", "nao-e-json")).status, 400);
    conferir("rota: corpo acima de 256 KB = 413", (await chamar("bling", "x".repeat(300 * 1024))).status, 413);
    conferir("rota: assinatura do Bling errada = 401", (await chamar("bling", corpoBling, { "x-bling-signature-256": "sha256=00" })).status, 401);
    conferir("rota: nada recusado entra na fila", await prisma.notificacaoDePedido.count(), antes);
  }

  console.log("\nNotificações da LI");
  {
    const { ligarNotificacoesLI } = await import("../src/lib/pedidos/webhooksLI.js");
    const { lerSegredo, salvarConexao } = await import("../src/lib/integracoes/conexoes.js");
    const conexaoAntes = await prisma.conexao.findUnique({ where: { servico: "LOJA_INTEGRADA" } });
    const segredoAntes = await lerSegredo("LOJA_INTEGRADA");
    const travaAntes = config.travas.liEscrita;
    try {
      conferir("LI: ligar sem base recusa", await ligarNotificacoesLI({ cliente: falsos().li, base: null }), { ok: false, erro: "Só na VPS: falta APP_URL_PUBLICA." });
      config.travas.liEscrita = true;
      await salvarConexao("LOJA_INTEGRADA", { segredo: { personalToken: "zz-pt" } });
      const li = falsos().li;
      const r = await ligarNotificacoesLI({ cliente: li, base: "https://rise.test", gerarToken: () => "tok-zz-ped" });
      const put = li.chamadas.find((c) => c.metodo === "PUT" && c.caminho === "/webhooks/v1/pedido");
      const segredo = await lerSegredo("LOJA_INTEGRADA");
      conferir(
        "LI: ligar manda a URL e guarda o token cifrado",
        [r.ok, put?.base, put?.corpo, segredo.webhookToken, segredo.personalToken, Boolean(segredo.webhookLigadoEm)],
        [true, "raiz", { notifyUrl: "https://rise.test/api/webhooks/loja-integrada", token: "tok-zz-ped" }, "tok-zz-ped", "zz-pt", true],
      );
      li.falhas = { "PUT /webhooks/v1/pedido": 500 };
      conferir("LI: recusa da LI nao grava token novo", [(await ligarNotificacoesLI({ cliente: li, base: "https://rise.test", gerarToken: () => "outro" })).ok, (await lerSegredo("LOJA_INTEGRADA")).webhookToken], [false, "tok-zz-ped"]);
      config.travas.liEscrita = false;
      conferir("LI: trava fechada recusa", (await ligarNotificacoesLI({ cliente: falsos().li, base: "https://rise.test" })).ok, false);
    } finally {
      config.travas.liEscrita = travaAntes;
      if (conexaoAntes) {
        await prisma.conexao.update({ where: { servico: "LOJA_INTEGRADA" }, data: { segredoCifrado: conexaoAntes.segredoCifrado } });
      } else {
        await prisma.conexao.deleteMany({ where: { servico: "LOJA_INTEGRADA" } });
      }
      conferir("LI: segredo restaurado", JSON.stringify(await lerSegredo("LOJA_INTEGRADA")), JSON.stringify(segredoAntes));
    }
  }

  console.log("\nNF");
  {
    const { destinoDaNF, baixarDoML } = await import("../src/lib/pedidos/nf.js");
    const { lerPedidoDaOrigem } = await import("../src/lib/pedidos/leitura.js");
    const caminhoPdf = "/users/212386247/invoices/documents/pdf/555/authorized";
    conferir("nf: ML vira proxy do caminho", destinoDaNF({ origem: "MERCADO_LIVRE", urlPdf: caminhoPdf, urlXml: "/x.xml" }, "pdf"), { tipo: "proxyML", caminho: caminhoPdf });
    conferir("nf: url fora do ML e recusada", destinoDaNF({ origem: "MERCADO_LIVRE", urlPdf: "https://outro.site/nf.pdf" }, "pdf"), { erro: "Endereço da NF fora da API do ML." });
    conferir(
      "nf: LI e Bling redirecionam so https",
      [
        destinoDaNF({ origem: "LOJA_INTEGRADA", urlXml: "https://li.test/nf.xml" }, "xml"),
        destinoDaNF({ origem: "LOJA_INTEGRADA", urlPdf: "http://li.test/nf.pdf" }, "pdf").erro,
        destinoDaNF({ origem: "BLING", urlXml: null, xml: "https://bling.test/nf.xml" }, "xml"),
        destinoDaNF({ origem: "BLING", urlPdf: null }, "pdf").erro,
      ],
      [{ tipo: "redirecionar", url: "https://li.test/nf.xml" }, "Endereço da NF inválido.", { tipo: "redirecionar", url: "https://bling.test/nf.xml" }, "Este canal não deu o arquivo."],
    );
    let pedidoFeito = null;
    const baixado = await baixarDoML(caminhoPdf, {
      obterToken: async () => "tok-ml",
      buscar: async (url, opcoes) => {
        pedidoFeito = { url, autorizacao: opcoes?.headers?.Authorization };
        return new Response(new Uint8Array([37, 80, 68, 70]), { status: 200, headers: { "content-type": "application/pdf" } });
      },
    });
    conferir(
      "nf: baixarDoML manda o Bearer",
      [pedidoFeito, baixado.tipoDeConteudo, baixado.bytes.length],
      [{ url: `https://api.mercadolibre.com${caminhoPdf}`, autorizacao: "Bearer tok-ml" }, "application/pdf", 4],
    );
    // A fatura real do ML (medida em 04/11/2026 no pedido 2000019299804380): sem pdf_url/xml_url, com os caminhos e a
    // chave dentro de `attributes`.
    const faturaReal = { ...fx("ml-invoice"), pdf_url: undefined, xml_url: undefined, invoice_key: undefined, attributes: { invoice_key: "43261199999999999999550020000007851000000785", danfe_location: "/users/212386247/invoices/sites/MLB/documents/danfe/555", xml_location: "/users/212386247/invoices/documents/xml/555/authorized" } };
    const nfReal = normalizarPedidoML({ order: fx("ml-order"), billing: null, shipments: [], shipment: null, retorno: null, invoice: faturaReal }).nf;
    conferir("ML: NF real com os caminhos em attributes", [nfReal.urlPdf, nfReal.urlXml, nfReal.chave], [faturaReal.attributes.danfe_location, faturaReal.attributes.xml_location, faturaReal.attributes.invoice_key]);
    const li = criarLojaIntegradaFalsa({
      pedidos: [{ ...fx("li-pedido"), nota_fiscal: "/api/v1/pedido_nf/77" }],
      situacoes: fx("li-situacoes").objects,
      historicos: fx("li-historico").objects,
      etiquetas: fx("li-enviali"),
      notas: [{ id: 77, access_key: "43261100000000000000550010000000881000000881", data: "2026-11-03T10:00:00", enviada: true, numero: "88", serie: "1", url: "https://li.test/nf/77.pdf", url_xml: "https://li.test/nf/77.xml" }],
    });
    const lido = await lerPedidoDaOrigem("LOJA_INTEGRADA", 5001, { li });
    conferir("LI: pedido com pedido_nf le a NF", [lido.nf?.numero, lido.nf?.status, lido.nf?.urlXml, lido.nf?.origem], ["88", "authorized", "https://li.test/nf/77.xml", "LOJA_INTEGRADA"]);
  }

  console.log("\nTelegram");
  {
    const { avisosDevidos, caminhoDoAviso } = await import("../src/lib/telegram/avisos.js");
    const { mensagemDoAviso } = await import("../src/lib/telegram/texto.js");
    const { TIPOS_DE_AVISO, ROTULO_DO_AVISO } = await import("../src/lib/telegram/avisosTipos.js");
    const agora = Date.now();
    const base = { origem: "MERCADO_LIVRE", canal: "MERCADO_LIVRE", atualizadoNaOrigemEm: new Date(agora), statusDaOrigem: "paid", status: "PAGO", enderecoDeEntrega: {}, pagamento: [], envio: {}, historico: [], totalProdutos: 49.7, desconto: 0, freteCobrado: 0, total: 49.7, nomeDoComprador: "ZZ Ped Nicollas" };
    const nova = await prisma.pedidoDeVenda.create({ data: { ...base, idExterno: "ZZ-PED-TG1", numero: "ZZ-PED-TG1", dataDaVenda: new Date(agora - 60 * 60 * 1000) } });
    const velha = await prisma.pedidoDeVenda.create({ data: { ...base, idExterno: "ZZ-PED-TG2", numero: "ZZ-PED-TG2", dataDaVenda: new Date(agora - 3 * 24 * 60 * 60 * 1000) } });
    const parada = await prisma.pedidoDeVenda.create({
      data: { ...base, idExterno: "ZZ-PED-TG3", numero: "ZZ-PED-TG3", status: "AGUARDANDO_PECAS", dataDaVenda: new Date(agora - 2 * 24 * 60 * 60 * 1000), pecas: { falta: true, pecas: [{ sku: "900211", falta: 2, previsao: "12/11" }, { sku: "100101", falta: 0, previsao: null }] } },
    });
    const meus = (lista) => lista.filter((a) => [nova.id, velha.id, parada.id].some((id) => a.chave.endsWith(`:${id}`)));
    const novas = meus(await avisosDevidos("novaVenda", { agora }));
    conferir("telegram: nova venda de pedido recem lido", novas.map((a) => [a.chave, mensagemDoAviso("novaVenda", a.dados).texto]), [[`nova-venda:${nova.id}`, "Nova venda Mercado Livre ZZ-PED-TG1\nZZ Ped Nicollas, R$ 49,70"]]);
    conferir("telegram: venda antiga nao avisa", novas.some((a) => a.chave.endsWith(velha.id)), false);
    const paradas = meus(await avisosDevidos("aguardandoPecas", { agora }));
    conferir("telegram: aguardando pecas com a falta no texto", paradas.map((a) => mensagemDoAviso("aguardandoPecas", a.dados).texto), ["Pedido ZZ-PED-TG3 aguardando peças\nfalta 2× 900211 (previsão 12/11)"]);
    conferir(
      "telegram: o botao abre o pedido",
      [caminhoDoAviso(`nova-venda:${nova.id}:55`), caminhoDoAviso(`aguardando-pecas:${parada.id}:55`), mensagemDoAviso("novaVenda", novas[0].dados).caminho],
      [`/pedidos/${nova.id}`, `/pedidos/${parada.id}`, `/pedidos/${nova.id}`],
    );
    conferir("telegram: os dois tipos na aba Canais", [TIPOS_DE_AVISO.includes("novaVenda"), TIPOS_DE_AVISO.includes("aguardandoPecas"), ROTULO_DO_AVISO.novaVenda, ROTULO_DO_AVISO.aguardandoPecas], [true, true, "Nova venda", "Pedido aguardando peças"]);
  }

  console.log("\nMCP");
  {
    // Pedidos em 2030 (nenhum real cai ali): dois do ML no mesmo dia, um da LI no dia seguinte e um cancelado.
    const mcp = await import("../src/lib/mcp/pedidosDeVenda.js");
    const tudo = { pode: () => true };
    const semCusto = { pode: (id) => id !== "dado.custo" };
    const nada = { pode: () => false };
    const produto = await prisma.produto.create({ data: { sku: "ZZ-PED-MCP", tituloBase: "ZZ Ped Produto MCP" } });
    const base = { atualizadoNaOrigemEm: new Date(), statusDaOrigem: "paid", enderecoDeEntrega: { cidade: "Caxias do Sul", uf: "RS", endereco: "Rua ZZ", numero: "10", cep: "95000-000" }, pagamento: [{ forma: "Pix", tipo: "pix", parcelas: 1, valor: 0 }], envio: { tipo: "me2", transportadora: "Correios", rastreio: "ZZ123BR" }, historico: [], desconto: 0, documentoDoComprador: "123.456.789-09", telefoneDoComprador: "54988990008", emailDoComprador: "zz@zz.test" };
    const criar = (numero, canal, dia, total, frete, status, lucro, itens) =>
      prisma.pedidoDeVenda.create({
        data: {
          ...base,
          origem: canal,
          canal,
          idExterno: numero,
          numero,
          dataDaVenda: new Date(`2030-01-${dia}T15:00:00-03:00`),
          nomeDoComprador: `ZZ Ped Comprador ${numero}`,
          status,
          totalProdutos: total - frete,
          freteCobrado: frete,
          total,
          lucroEstimado: lucro,
          nf: { numero: "901", chave: "4330", emitidaEm: "2030-01-10T15:00:00Z", status: "authorized", urlPdf: "x", urlXml: "y" },
          itens: { create: itens.map((item, ordem) => ({ ordem, produtoId: item.produtoId ?? null, codigoNaOrigem: item.codigo ?? null, titulo: item.titulo, quantidade: item.quantidade, precoUnitario: item.preco, desconto: 0, total: item.preco * item.quantidade, custoUnitarioCongelado: 4 })) },
        },
      });
    await criar("ZZ-PED-M1", "MERCADO_LIVRE", "10", 110, 10, "PAGO", 30, [{ produtoId: produto.id, titulo: "Produto MCP", quantidade: 2, preco: 50 }]);
    await criar("ZZ-PED-M2", "MERCADO_LIVRE", "10", 50, 0, "ENTREGUE", null, [{ codigo: "FORA-DO-RISE", titulo: "Item fora", quantidade: 1, preco: 50 }]);
    await criar("ZZ-PED-M3", "LOJA_INTEGRADA", "11", 40, 0, "ENVIADO", 12, [{ produtoId: produto.id, titulo: "Produto MCP", quantidade: 1, preco: 40 }]);
    await criar("ZZ-PED-M4", "MERCADO_LIVRE", "11", 999, 0, "CANCELADO", 100, [{ produtoId: produto.id, titulo: "Produto MCP", quantidade: 9, preco: 111 }]);
    const periodo = { desde: "2030-01-10", ate: "2030-01-11" };

    const rel = await mcp.relatorioDeVendas(periodo, tudo);
    conferir(
      "MCP relatorio: totais sem os cancelados",
      [rel.pedidos, rel.faturamento, rel.faturamentoProdutos, rel.freteCobrado, rel.ticketMedio, rel.lucro, rel.pedidosSemLucro, rel.cancelados],
      [3, 200, 190, 10, 66.67, 42, 1, { pedidos: 1, valor: 999 }],
    );
    conferir("MCP relatorio: por canal", rel.porCanal.map((c) => [c.canal, c.pedidos, c.faturamento, c.lucro]), [["Mercado Livre", 2, 160, 30], ["Loja Integrada", 1, 40, 12]]);
    conferir("MCP relatorio: por dia no horario de Brasilia", rel.porDia, [{ dia: "2030-01-10", pedidos: 2, faturamento: 160 }, { dia: "2030-01-11", pedidos: 1, faturamento: 40 }]);
    conferir("MCP relatorio: mais vendidos (o fora do Rise pelo codigo)", rel.maisVendidos.map((m) => [m.sku, m.quantidade, m.faturamento]), [["ZZ-PED-MCP", 3, 140], ["FORA-DO-RISE", 1, 50]]);
    conferir("MCP relatorio: filtro de canal", (await mcp.relatorioDeVendas({ ...periodo, canais: ["LOJA_INTEGRADA"] }, tudo)).faturamento, 40);
    const relSemCusto = await mcp.relatorioDeVendas(periodo, semCusto);
    conferir("MCP relatorio sem custo esconde o lucro", [relSemCusto.lucro, relSemCusto.porCanal[0].lucro, relSemCusto.faturamento], ["[restrito]", "[restrito]", 200]);
    conferir("MCP relatorio: periodo invertido recusa", (await mcp.relatorioDeVendas({ desde: "2030-01-11", ate: "2030-01-10" }, tudo).catch((e) => e.message))?.includes("depois"), true);
    conferir("MCP relatorio: sem acesso recusa", (await mcp.relatorioDeVendas(periodo, nada).catch((e) => e.message))?.includes("não pode"), true);

    const lista = await mcp.listarPedidosDeVenda({ ...periodo, limite: 10 }, tudo);
    conferir("MCP lista: do mais novo, com status em texto", [lista.total, lista.pedidos.slice(0, 2).map((p) => p.numero).sort(), lista.pedidos.find((p) => p.numero === "ZZ-PED-M3").statusTexto], [4, ["ZZ-PED-M3", "ZZ-PED-M4"], "Enviado"]);
    conferir("MCP lista: filtro de status", (await mcp.listarPedidosDeVenda({ ...periodo, status: ["CANCELADO"] }, tudo)).pedidos.map((p) => p.numero), ["ZZ-PED-M4"]);
    conferir("MCP lista: busca pelo SKU", (await mcp.listarPedidosDeVenda({ ...periodo, termos: "FORA-DO-RISE" }, tudo)).pedidos.map((p) => p.numero), ["ZZ-PED-M2"]);
    conferir("MCP lista sem custo esconde o lucro", (await mcp.listarPedidosDeVenda(periodo, semCusto)).pedidos[0].lucro, "[restrito]");

    const lido = await mcp.lerPedidoDeVenda({ pedido: "zz-ped-m1" }, tudo);
    conferir(
      "MCP ler: itens, pagamento, envio e NF",
      [lido.numero, lido.canal, lido.itens[0].sku, lido.itens[0].custoUnitario, lido.pagamento[0].forma, lido.envio.rastreio, lido.nf.numero, lido.lucro.estimado],
      ["ZZ-PED-M1", "Mercado Livre", "ZZ-PED-MCP", 4, "Pix", "ZZ123BR", "901", 30],
    );
    conferir("MCP ler: do cliente so o nome e a cidade", [lido.cliente.nome, lido.cliente.cidade, JSON.stringify(lido).includes("123.456.789-09"), JSON.stringify(lido).includes("54988990008"), JSON.stringify(lido).includes("zz@zz.test"), JSON.stringify(lido).includes("Rua ZZ")], ["ZZ Ped Comprador ZZ-PED-M1", "Caxias do Sul (RS)", false, false, false, false]);
    const lidoSemCusto = await mcp.lerPedidoDeVenda({ pedido: "ZZ-PED-M1" }, semCusto);
    conferir("MCP ler sem custo esconde custo e lucro", [lidoSemCusto.itens[0].custoUnitario, lidoSemCusto.lucro], ["[restrito]", "[restrito]"]);
    conferir("MCP ler: pedido que nao existe", (await mcp.lerPedidoDeVenda({ pedido: "ZZ-PED-NADA" }, tudo).catch((e) => e.message))?.includes("não encontrado"), true);
    conferir("MCP: as tres ferramentas na lista", mcp.FERRAMENTAS_DE_PEDIDOS_DE_VENDA.map((f) => f.nome), ["relatorioDeVendas", "listarPedidosDeVenda", "lerPedidoDeVenda"]);
  }

  // Marcador: os blocos seguintes entram acima desta linha.
} finally {
  if (!manter) await limpar();
  await prisma.$disconnect();
}

console.log(`\n${falhas === 0 ? "Tudo certo." : `${falhas} falha(s).`}`);
process.exit(falhas === 0 ? 0 : 1);
