import "dotenv/config";

/**
 * Testes das compras do Mercado Livre no Compras e da nota fiscal do pedido de compra (spec
 * 2026-11-11-compras-do-mercado-livre-design.md): regras puras, a leitura contra um ML falso (formatos medidos em
 * 11/11/2026 nas compras da conta), o casamento pelo MLB, o deposito Virtual contra o Bling falso, a busca pelo rastreio
 * e pela nota, o XML da NF-e e a guarda que impede a compra de virar venda. SEM rede.
 *
 *   npm run teste:compras-ml            (apaga o que criou no fim)
 *   npm run teste:compras-ml -- --manter (deixa os ZZ no banco, para conferir a tela)
 *
 * So escreve produtos ZZ-CML-*, o fornecedor "ZZ CML Fornecedor", os pedidos dele e as compras 98…; o fornecedor marcado
 * para as compras do ML (o "ML" do dono) volta ao que era.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const manter = process.argv.includes("--manter");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

const CONTA = "212386247";
const AGORA = new Date("2026-11-11T15:00:00-03:00");
const DIA = 24 * 60 * 60 * 1000;

/** Uma compra no formato do GET /orders/search?buyer= medido em 11/11/2026. */
function compra({ id, pack = null, status = "paid", vendedor = { id: 425556534, nickname: "MARSELHA SHOP" }, data = AGORA, itens, frete = 0, envio = null }) {
  const produtos = itens.reduce((soma, item) => soma + item.quantidade * item.preco, 0);
  return {
    id,
    pack_id: pack,
    status,
    date_created: new Date(data).toISOString(),
    seller: vendedor,
    buyer: { id: Number(CONTA) },
    total_amount: produtos,
    paid_amount: status === "paid" ? produtos + frete : 0,
    currency_id: "BRL",
    shipping: { id: envio },
    payments: status === "paid" ? [{ status: "approved", shipping_cost: frete, total_paid_amount: produtos + frete }] : [],
    order_items: itens.map((item) => ({
      item: { id: item.mlb, title: item.titulo ?? `Item ${item.mlb}`, variation_id: item.variacao ?? null, variation_attributes: item.atributos ?? [], seller_sku: "X" },
      quantity: item.quantidade,
      unit_price: item.preco,
    })),
  };
}

/** Um envio no formato do GET /shipments/{id} medido em 11/11/2026. */
function envio({ id, status = "shipped", substatus = null, rastreio = null, previsao = "2026-11-14T00:00:00.000-03:00", historico = {} }) {
  return {
    id,
    status,
    substatus,
    tracking_number: rastreio,
    tracking_method: rastreio ? "Correios" : null,
    last_updated: AGORA.toISOString(),
    shipping_option: { estimated_delivery_time: { date: previsao } },
    status_history: historico,
  };
}

/** Um ML falso so com o que a leitura das compras usa. Os Maps ficam expostos para o teste mudar entre duas leituras. */
function mlDeCompras({ compras = [], envios = [], anuncios = {} } = {}) {
  const estado = { compras: new Map(compras.map((c) => [c.id, c])), envios: new Map(envios.map((e) => [e.id, e])), chamadas: [] };
  const ok = (dados) => ({ ok: true, status: 200, dados: structuredClone(dados) });
  return {
    estado,
    usuarioId: async () => CONTA,
    async get(rota, params = {}) {
      estado.chamadas.push(rota);
      if (rota === "/orders/search") {
        if (String(params.buyer) !== CONTA) throw new Error("teste: a leitura das compras tem de filtrar pelo comprador");
        const desde = new Date(params["order.date_created.from"]).getTime();
        const lista = [...estado.compras.values()].filter((c) => new Date(c.date_created).getTime() >= desde).sort((a, b) => new Date(b.date_created) - new Date(a.date_created));
        const offset = Number(params.offset ?? 0);
        return ok({ results: lista.slice(offset, offset + Number(params.limit ?? 50)), paging: { total: lista.length } });
      }
      const envioPedido = rota.match(/^\/shipments\/(\d+)$/);
      if (envioPedido) {
        const achado = estado.envios.get(Number(envioPedido[1]));
        return achado ? ok(achado) : { ok: false, status: 404, dados: { message: "not found" } };
      }
      if (rota === "/items") return ok(String(params.ids).split(",").map((id) => (anuncios[id] ? { code: 200, body: { id, ...anuncios[id] } } : { code: 404, body: {} })));
      throw new Error(`teste: rota inesperada ${rota}`);
    },
  };
}

// ---------------------------------------------------------------------------
// Regras puras (sem banco)
// ---------------------------------------------------------------------------

const ml = await import("../src/lib/compras/mercadoLivre/regras.js");
const ali = await import("../src/lib/compras/aliexpress/regras.js");
const { lerXmlDaNfe, pareceXml } = await import("../src/lib/compras/notaFiscalXml.js");
{
  console.log("\nRegras puras das compras do ML");
  const grupos = ml.agruparPorPacote([
    compra({ id: 981, pack: 7001, itens: [{ mlb: "MLB1", quantidade: 1, preco: 10 }] }),
    compra({ id: 982, pack: 7001, itens: [{ mlb: "MLB2", quantidade: 2, preco: 5 }] }),
    compra({ id: 983, itens: [{ mlb: "MLB3", quantidade: 1, preco: 7 }], data: new Date(AGORA.getTime() - DIA) }),
  ]);
  conferir("carrinho do mesmo vendedor vira um grupo", grupos.map((g) => [g.chave, g.compras.length]), [["7001", 2], ["983", 1]]);
  conferir(
    "situacao do grupo",
    [
      ml.situacaoDoGrupo({ compras: [{ status: "paid" }] }).texto,
      ml.situacaoDoGrupo({ compras: [{ status: "payment_required" }] }).aguardandoPagamento,
      ml.situacaoDoGrupo({ compras: [{ status: "cancelled" }, { status: "invalid" }] }).cancelado,
      ml.situacaoDoGrupo({ compras: [{ status: "cancelled" }, { status: "paid" }] }).texto,
    ],
    ["Pago", true, true, "Pago"],
  );
  // A compra medida da ORIGEN DIGITAL: produtos 77,97, frete 10,99 no pagamento, pago 88,96.
  conferir("totais com frete do pagamento", ml.totaisDoGrupo({ compras: [compra({ id: 1, itens: [{ mlb: "MLB5401368464", quantidade: 1, preco: 77.97 }], frete: 10.99 })] }), { produtos: 77.97, frete: 10.99, pago: 88.96 });
  conferir("variacao em texto", ml.textoDaVariacao([{ name: "Cor", value_name: "Azul" }, { name: "Voltagem", value_name: "220V" }]), "Cor: Azul · Voltagem: 220V");
  conferir("link do anuncio", [ml.linkDoAnuncio("MLB3965519505"), ml.linkDoAnuncio("x")], ["https://produto.mercadolivre.com.br/MLB-3965519505", null]);
  conferir(
    "linhas do grupo",
    ml.linhasDoGrupo({ compras: [compra({ id: 77, itens: [{ mlb: "MLB9", variacao: 175706419183, atributos: [{ name: "Cor", value_name: "Preto" }], quantidade: 2, preco: 29.9 }] })] }),
    [{ externoLinhaId: "77:MLB9:175706419183", productId: "MLB9", skuId: "175706419183", opcao: "Cor: Preto", titulo: "Item MLB9", urlDoItem: "https://produto.mercadolivre.com.br/MLB-9", quantidade: 2, preco: 29.9 }],
  );
  const velha = { compras: [compra({ id: 5, data: new Date(AGORA.getTime() - 40 * DIA), itens: [{ mlb: "MLB1", quantidade: 1, preco: 1 }] })] };
  conferir(
    "1a leitura: 30 dias ou em andamento",
    [
      ml.grupoNasceu({ compras: [compra({ id: 6, itens: [{ mlb: "MLB1", quantidade: 1, preco: 1 }] })] }, null, AGORA),
      ml.grupoNasceu(velha, { status: "delivered" }, AGORA),
      ml.grupoNasceu(velha, { status: "shipped" }, AGORA),
      ml.grupoNasceu({ compras: [compra({ id: 7, status: "cancelled", itens: [{ mlb: "MLB1", quantidade: 1, preco: 1 }] })] }, null, AGORA),
    ],
    [true, false, true, false],
  );
  conferir("codigo do envio", [ml.codigoDoEnvio({ id: 4, tracking_number: "AD276050926BR" }), ml.codigoDoEnvio({ id: 4, tracking_number: null })], ["AD276050926BR", "envio 4"]);
  const pacote = ml.dadosDoPacote(envio({ id: 1, status: "shipped", substatus: "out_for_delivery", rastreio: "AD1", historico: { date_shipped: "2026-11-10T10:00:00.000-04:00" } }));
  conferir("pacote do envio", [pacote.ultimoCodigo, pacote.ultimoEvento, pacote.codigoOrigem, pacote.eventos.length, pacote.previsaoFim?.toISOString()], ["ML_shipped_out_for_delivery", "Saiu para entrega", "AD1", 1, "2026-11-14T03:00:00.000Z"]);
  const fase = (status, substatus = null) => ali.faseDoEvento({ codigo: `ML_${status}${substatus ? `_${substatus}` : ""}`, descricao: ml.textoDoEnvio(status, substatus) })?.rotulo;
  conferir(
    "fases do envio do ML",
    [fase("handling"), fase("ready_to_ship", "picked_up"), fase("shipped"), fase("shipped", "out_for_delivery"), fase("delivered"), fase("not_delivered"), fase("shipped", "returning_to_sender")],
    ["Aguardando envio", "Postado", "Em trânsito", "Saiu para entrega", "Entregue", "Falha na entrega", "Devolvido"],
  );
  conferir("nao entregue nao conta como entregue", ali.entregueNoRastreio({ codigo: "ML_not_delivered", descricao: "Não entregue" }), false);
  conferir("o codigo do AliExpress continua igual", [ali.faseDoEvento({ codigo: "AE_GTMS_SIGNED", descricao: "" })?.rotulo, ali.faseDoEvento({ codigo: "AE_CC_IM_START", descricao: "" })?.rotulo], ["Entregue", "Na alfândega"]);
  conferir(
    "faseDoPedido do ML segue a do AliExpress",
    ali.faseDoPedido({ origem: "MERCADO_LIVRE", status: "ENVIADO", faltaLancar: 1, pacotes: [{ codigo: "AD1", ultimoCodigo: "ML_shipped", ultimoEvento: "A caminho" }], agora: AGORA })?.rotulo,
    "Em trânsito",
  );
  conferir("alerta diz o canal", ali.alertasDoPedido({ status: "ENVIADO", statusNoAliExpress: "Cancelada", canal: "Mercado Livre", agora: AGORA }), ["Situação no Mercado Livre: Cancelada."]);

  console.log("\nXML da NF-e");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe43251130010376000148550010000123451000012345" versao="4.00"><ide><cUF>43</cUF><serie>1</serie><nNF>0012345</nNF><dhEmi>2026-11-05T10:20:00-03:00</dhEmi></ide><emit><CNPJ>12345678000190</CNPJ><xNome>ELETRO &amp; CIA LTDA</xNome></emit><total><ICMSTot><vProd>980.00</vProd><vNF>990.90</vNF></ICMSTot></total></infNFe></NFe><protNFe><infProt><chNFe>43251130010376000148550010000123451000012345</chNFe></infProt></protNFe></nfeProc>`;
  conferir("le a NF-e", lerXmlDaNfe(xml), {
    numero: "12345",
    serie: "1",
    chave: "43251130010376000148550010000123451000012345",
    emitidaEm: new Date("2026-11-05T10:20:00-03:00"),
    valorTotal: 990.9,
    emitenteCnpj: "12345678000190",
    emitenteNome: "ELETRO & CIA LTDA",
  });
  conferir("XML que nao e NF-e", lerXmlDaNfe("<?xml version=\"1.0\"?><outro/>"), null);
  conferir("parece XML (com BOM e espaco)", [pareceXml(Buffer.from("﻿  <?xml version='1.0'?><a/>")), pareceXml(Buffer.from("%PDF-1.4")), pareceXml(Buffer.from("<nfeProc>"))], [true, false, true]);
}

// ---------------------------------------------------------------------------
// Banco (Postgres local)
// ---------------------------------------------------------------------------

const { prisma } = await import("../src/lib/db.js");
const { criarBlingFalso } = await import("./lib/blingFalso.js");
const { lerComprasDoML, fornecedorDasComprasDoML } = await import("../src/lib/compras/mercadoLivre/compras.js");
const { lerPedido, listarPedidos, anexarNotaFiscal, excluirNotaFiscal, excluirPedido } = await import("../src/lib/compras/banco.js");
const { casarManual, virtualNaChegada } = await import("../src/lib/compras/aliexpress/casamento.js");

const inicioDoTeste = new Date();
const FORNECEDOR = "ZZ CML Fornecedor";

async function limpar() {
  // As pastas das notas anexadas pelo teste (dados/compras/<pedidoId>/).
  const { apagarPastaDoPedido } = await import("../src/lib/compras/arquivos.js");
  const pedidos = await prisma.pedidoDeCompra.findMany({ where: { OR: [{ aliexpress: { externoId: { startsWith: "98" } } }, { fornecedor: { nome: FORNECEDOR } }] }, select: { id: true } });
  for (const pedido of pedidos) await apagarPastaDoPedido(pedido.id);
  await prisma.logIntegracao.deleteMany({ where: { servico: "MERCADO_LIVRE", endpoint: "compras/ler", criadoEm: { gte: inicioDoTeste } } });
  await prisma.pedidoDeCompra.deleteMany({ where: { aliexpress: { externoId: { startsWith: "98" } } } });
  await prisma.pedidoDeCompra.deleteMany({ where: { fornecedor: { nome: FORNECEDOR } } });
  await prisma.produtoFornecedor.deleteMany({ where: { produto: { sku: { startsWith: "ZZ-CML" } } } });
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-CML" } } });
  await prisma.fornecedor.deleteMany({ where: { nome: FORNECEDOR } });
}

const marcaOriginal = await fornecedorDasComprasDoML();
async function devolverMarca() {
  await prisma.fornecedor.updateMany({ where: { mercadoLivreCompras: true }, data: { mercadoLivreCompras: false } });
  if (marcaOriginal) await prisma.fornecedor.update({ where: { id: marcaOriginal.id }, data: { mercadoLivreCompras: true } });
}

const noBling = (codigo, id) => ({ id, codigo, nome: `Produto ${codigo}`, preco: 10, situacao: "A", formato: "S", tipo: "P" });

await limpar();
try {
  console.log("\nSem fornecedor marcado");
  await prisma.fornecedor.updateMany({ where: { mercadoLivreCompras: true }, data: { mercadoLivreCompras: false } });
  conferir("recusa sem fornecedor", (await lerComprasDoML({ ml: mlDeCompras(), cliente: criarBlingFalso(), agora: AGORA })).motivo, "sem_fornecedor");

  const fornecedor = await prisma.fornecedor.create({ data: { nome: FORNECEDOR, mercadoLivreCompras: true, prazoEntregaDias: 5 } });
  // A1 ja tem o MLB no link de um vinculo de outro fornecedor (casa sozinho); A2 nao (fica pendente).
  const a1 = await prisma.produto.create({ data: { sku: "ZZ-CML-A1", tituloBase: "PRODUTO A1", conferido: true, ativo: true, blingId: "16000000001" } });
  const a2 = await prisma.produto.create({ data: { sku: "ZZ-CML-A2", tituloBase: "PRODUTO A2", conferido: true, ativo: true, blingId: "16000000002" } });
  const outro = await prisma.fornecedor.create({ data: { nome: `${FORNECEDOR} Outro` } }).catch(() => null);
  void outro;
  await prisma.produtoFornecedor.create({ data: { produtoId: a1.id, fornecedorId: fornecedor.id, link: "https://produto.mercadolivre.com.br/MLB-9811111111-fuso-trapezoidal-_JM", codigo: null } });

  const bling = criarBlingFalso({ produtos: [noBling("ZZ-CML-A1", 16000000001), noBling("ZZ-CML-A2", 16000000002)], codigosLiberados: ["ZZ-CML-A1", "ZZ-CML-A2"] });
  const falso = mlDeCompras({
    compras: [
      // Paga, a caminho, com dois itens no mesmo carrinho (pack): um casa, o outro fica pendente.
      compra({ id: 98001, pack: 98900, itens: [{ mlb: "MLB9811111111", quantidade: 2, preco: 66 }], envio: 4401, frete: 0 }),
      compra({ id: 98002, pack: 98900, itens: [{ mlb: "MLB9822222222", variacao: 555, atributos: [{ name: "Cor", value_name: "Azul" }], quantidade: 1, preco: 20 }], envio: 4401 }),
      // Aguardando pagamento: entra como Rascunho.
      compra({ id: 98003, status: "payment_required", vendedor: { id: 582395342, nickname: "EVOLUTION" }, itens: [{ mlb: "MLB9811111111", quantidade: 1, preco: 59.22 }], envio: 4402 }),
      // Entregue ha 40 dias: fora da 1a leitura.
      compra({ id: 98004, data: new Date(AGORA.getTime() - 40 * DIA), itens: [{ mlb: "MLB9833333333", quantidade: 1, preco: 10 }], envio: 4403 }),
      // Cancelada nunca vista: fora.
      compra({ id: 98005, status: "cancelled", itens: [{ mlb: "MLB9833333333", quantidade: 1, preco: 10 }] }),
      // Paga com frete de 10,99 e Sedex com codigo dos Correios.
      compra({ id: 98006, vendedor: { id: 696895756, nickname: "ORIGEN DIGITAL" }, itens: [{ mlb: "MLB9844444444", quantidade: 1, preco: 77.97 }], frete: 10.99, envio: 4404 }),
    ],
    envios: [
      envio({ id: 4401, status: "shipped", rastreio: null }),
      envio({ id: 4402, status: "pending", substatus: "waiting_for_payment" }),
      envio({ id: 4403, status: "delivered", historico: { date_delivered: "2026-10-05T10:00:00.000-04:00" } }),
      envio({ id: 4404, status: "ready_to_ship", substatus: "ready_to_print", rastreio: "AD276050926BR" }),
    ],
    anuncios: { MLB9811111111: { thumbnail: "http://http2.mlstatic.com/a.jpg", secure_thumbnail: "https://http2.mlstatic.com/a.jpg", permalink: "https://produto.mercadolivre.com.br/MLB-9811111111-fuso" } },
  });

  console.log("\nPrimeira leitura");
  const primeira = await lerComprasDoML({ ml: falso, cliente: bling, agora: AGORA });
  // Pendentes: a linha sem MLB conhecido do pack e a da ORIGEN; a do rascunho casa pelo vinculo que o pack acabou de criar.
  conferir("resumo", [primeira.ok, primeira.lidas, primeira.novas, primeira.pendentes], [true, 3, 3, 2]);
  const lidos = await prisma.pedidoAliExpress.findMany({ where: { externoId: { startsWith: "98" } }, orderBy: { externoId: "asc" }, include: { pedido: true, linhas: { orderBy: { externoLinhaId: "asc" } }, pacotes: true } });
  conferir("compras gravadas (pack, avulsas)", lidos.map((l) => [l.externoId, l.pedido.status, l.pedido.origem, l.loja, l.linhas.length]), [
    ["98003", "RASCUNHO", "MERCADO_LIVRE", "EVOLUTION", 1],
    ["98006", "ENVIADO", "MERCADO_LIVRE", "ORIGEN DIGITAL", 1],
    ["98900", "ENVIADO", "MERCADO_LIVRE", "MARSELHA SHOP", 2],
  ]);
  const pack = lidos.find((l) => l.externoId === "98900");
  conferir("linha casada pelo MLB do link; a outra pendente", pack.linhas.map((l) => [l.productId, Boolean(l.itemId), l.opcao]), [["MLB9811111111", true, null], ["MLB9822222222", false, "Cor: Azul"]]);
  conferir("foto e link do anuncio", [pack.linhas[0].urlDaFoto, pack.linhas[0].urlDoItem], ["https://http2.mlstatic.com/a.jpg", "https://produto.mercadolivre.com.br/MLB-9811111111-fuso"]);
  conferir("pacote sem rastreio ainda", pack.pacotes.map((p) => [p.codigo, p.ultimoCodigo]), [["envio 4401", "ML_shipped"]]);
  const vinculo = await prisma.produtoFornecedor.findFirst({ where: { produtoId: a1.id, fornecedorId: fornecedor.id, codigo: "MLB9811111111:" } });
  conferir("vinculo do ML criado com o codigo anuncio:variacao", Boolean(vinculo), true);
  const virtual = bling.estado.lancamentos.filter((l) => l.deposito?.id === 14200000002);
  conferir("Virtual: so a linha paga e casada entrou (o rascunho nao)", virtual.map((l) => [l.operacao, l.quantidade, l.observacoes]), [["E", 2, "Mercado Livre 98900"]]);
  const sedex = lidos.find((l) => l.externoId === "98006");
  conferir("frete da compra", Number(sedex.pedido.frete), 10.99);

  const naLista = (await listarPedidos({ busca: "AD276050926BR" })).linhas;
  conferir("busca pelo rastreio dos Correios", naLista.map((l) => l.id), [sedex.pedidoId]);
  const tela = await lerPedido(sedex.pedidoId);
  conferir("tela: canal e links", [tela.aliexpress.canal, tela.aliexpress.linkDoRastreio], ["Mercado Livre", "https://rastreamento.correios.com.br/app/index.php?objeto=AD276050926BR"]);
  conferir("lista: fase do pedido", (await listarPedidos({ busca: "AD276050926BR" })).linhas[0]?.fase?.rotulo, "Aguardando envio");

  console.log("\nSegunda leitura: pagou, ganhou rastreio, entregou");
  falso.estado.compras.set(98003, { ...falso.estado.compras.get(98003), status: "paid", paid_amount: 59.22, payments: [{ status: "approved", shipping_cost: 0 }] });
  falso.estado.envios.set(4401, envio({ id: 4401, status: "shipped", rastreio: "NN436981120BR" }));
  falso.estado.envios.set(4404, envio({ id: 4404, status: "delivered", rastreio: "AD276050926BR", historico: { date_delivered: "2026-11-11T10:00:00.000-04:00" } }));
  const segunda = await lerComprasDoML({ ml: falso, cliente: bling, agora: AGORA });
  conferir("sem duplicar", [segunda.novas, await prisma.pedidoAliExpress.count({ where: { externoId: { startsWith: "98" } } }), await prisma.linhaAliExpress.count({ where: { pedidoAliExpress: { externoId: { startsWith: "98" } } } })], [0, 3, 4]);
  const rascunho = await prisma.pedidoAliExpress.findUnique({ where: { externoId: "98003" }, include: { pedido: true } });
  conferir("rascunho pago vira Enviado", [rascunho.pedido.status, Boolean(rascunho.pedido.enviadoEm)], ["ENVIADO", true]);
  const pacotes = await prisma.pacoteAliExpress.findMany({ where: { pedidoAliExpress: { externoId: "98900" } } });
  conferir("o pacote ganhou o rastreio (renomeado, sem duplicar)", pacotes.map((p) => p.codigo), ["NN436981120BR"]);
  conferir("busca por parte do rastreio", (await listarPedidos({ busca: "436981120" })).linhas.map((l) => l.id), [pack.pedidoId]);
  const entregue = await prisma.pedidoAliExpress.findUnique({ where: { externoId: "98006" } });
  conferir("entregue: data do envio gravada", entregue.entregueEm?.toISOString(), "2026-11-11T14:00:00.000Z");
  const linhaDoPack = (await listarPedidos({ busca: "NN436981120BR" })).linhas[0];
  conferir("pack a caminho = Em transito, com o '!' do item sem produto", [linhaDoPack?.fase?.rotulo, linhaDoPack?.alertas.length], ["Em trânsito", 1]);
  conferir(
    "Virtual: o rascunho pago entrou agora",
    bling.estado.lancamentos.filter((l) => l.deposito?.id === 14200000002).map((l) => [l.operacao, l.quantidade, l.observacoes]),
    [["E", 2, "Mercado Livre 98900"], ["E", 1, "Mercado Livre 98003"]],
  );

  console.log("\nCasar a linha pendente, chegada e cancelamento");
  const pendente = await prisma.linhaAliExpress.findUnique({ where: { externoLinhaId: "98002:MLB9822222222:555" } });
  const casado = await casarManual(pendente.id, a2.id, 10, { cliente: bling });
  conferir("casar com fator 10", [casado.ok, casado.virtual?.ok], [true, true]);
  const item = await prisma.itemDoPedidoDeCompra.findFirst({ where: { pedidoId: pack.pedidoId, produtoId: a2.id } });
  conferir("item com quantidade x fator e preco / fator", [item.quantidade, Number(item.precoUnitario)], [10, 2]);
  const chegada = await virtualNaChegada(item.id, 10, "saida", { cliente: bling });
  conferir("chegada tira do Virtual", [chegada?.ok, bling.estado.lancamentos.at(-1)?.operacao], [true, "B"]);
  falso.estado.compras.set(98006, { ...falso.estado.compras.get(98006), status: "cancelled" });
  await lerComprasDoML({ ml: falso, cliente: bling, agora: AGORA });
  const cancelado = await prisma.pedidoAliExpress.findUnique({ where: { externoId: "98006" }, include: { pedido: true } });
  conferir("cancelada no ML sem nada lancado = Cancelado", [cancelado.pedido.status, Boolean(cancelado.canceladoNoAliExpressEm)], ["CANCELADO", true]);
  conferir("pedido importado nao se apaga", (await excluirPedido(cancelado.pedidoId)).ok, false);

  console.log("\nNota fiscal");
  const arquivo = (nome, conteudo) => new File([conteudo], nome);
  const xmlNota = `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe43251130010376000148550010000987651000098765"><ide><serie>2</serie><nNF>98765</nNF><dhEmi>2026-11-06T09:00:00-03:00</dhEmi></ide><emit><CNPJ>11222333000144</CNPJ><xNome>MARSELHA</xNome></emit><total><ICMSTot><vNF>132.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;
  const anexada = await anexarNotaFiscal(pack.pedidoId, arquivo("nota.xml", xmlNota), "teste");
  conferir("XML lido", [anexada.ok, anexada.notas?.[0]?.numero, anexada.notas?.[0]?.valorTotal, anexada.notas?.[0]?.xml], [true, "98765", 132, true]);
  conferir("mesma nota de novo recusa", (await anexarNotaFiscal(pack.pedidoId, arquivo("nota2.xml", xmlNota), "teste")).ok, false);
  conferir("XML que nao e NF-e recusa", (await anexarNotaFiscal(pack.pedidoId, arquivo("x.xml", "<?xml version='1.0'?><a/>"), "teste")).erro, "O XML não é de uma NF-e.");
  conferir("formato estranho recusa", (await anexarNotaFiscal(pack.pedidoId, arquivo("x.txt", "ola"), "teste")).erro, "Envie a nota em PDF, XML, JPG ou PNG.");
  const pdf = await anexarNotaFiscal(pack.pedidoId, arquivo("danfe.pdf", "%PDF-1.4 teste"), "teste");
  conferir("PDF entra sem dados lidos", [pdf.ok, pdf.notas?.length, pdf.notas?.[1]?.numero], [true, 2, null]);
  conferir("busca pelo numero e pela chave da nota", [(await listarPedidos({ busca: "98765" })).linhas.map((l) => l.id), (await listarPedidos({ busca: "43251130010376000148550010000987651000098765" })).linhas.map((l) => l.id)], [[pack.pedidoId], [pack.pedidoId]]);
  conferir("a tela traz as notas", (await lerPedido(pack.pedidoId)).notasFiscais.length, 2);
  conferir("excluir nota", (await excluirNotaFiscal(pack.pedidoId, pdf.notas[1].id)).notas.length, 1);

  console.log("\nA compra da conta nao vira venda");
  const { criarMLFalso } = await import("./lib/mlFalso.js");
  const { lerPedidoDaOrigem } = await import("../src/lib/pedidos/leitura.js");
  const vendas = criarMLFalso({ pedidos: [{ id: 98777, status: "paid", seller: { id: 425556534 }, buyer: { id: Number(CONTA) }, order_items: [], payments: [] }] });
  conferir("lerPedidoDaOrigem devolve null para a compra", await lerPedidoDaOrigem("MERCADO_LIVRE", 98777, { ml: vendas }), null);
} finally {
  await devolverMarca();
  if (!manter) await limpar();
  await prisma.fornecedor.deleteMany({ where: { nome: `${FORNECEDOR} Outro` } });
  await prisma.$disconnect();
}

console.log(`\n${falhas === 0 ? "Tudo certo." : `${falhas} falha(s).`}`);
process.exit(falhas === 0 ? 0 : 1);
