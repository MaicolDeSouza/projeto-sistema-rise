import "dotenv/config";

/**
 * Testes do modulo Compras (spec 2026-10-26-modulo-compras-design.md): regras puras, gravacao no Postgres e o
 * lancamento de estoque contra um Bling falso. SEM rede.
 *
 *   npm run teste:compras
 *
 * So escreve produtos, fornecedores e pedidos ZZ-COMPRA-* / "ZZ Compra *", apagados no comeco e no fim.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const {
  numeroDoPedido,
  lerDesconto,
  totaisDoPedido,
  aCaminho,
  entraNaListaDeMinimo,
  quantidadeSugerida,
  estadoDoCarrinho,
  precoInicialDoItem,
  podeIrPara,
  statusDepoisDeLancar,
  validarQuantidadeDeLancamento,
} = await import("../src/lib/compras/regras.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

// ---------------------------------------------------------------------------
// Regras puras
// ---------------------------------------------------------------------------

console.log("\nRegras de compras");
conferir("numero", [numeroDoPedido(5), numeroDoPedido(12345)], ["PC-0005", "PC-12345"]);
conferir("desconto %", lerDesconto("5%"), { tipo: "PERCENTUAL", valor: 5 });
conferir("desconto R$ com virgula", lerDesconto("50,5"), { tipo: "VALOR", valor: 50.5 });
conferir("desconto vazio", lerDesconto(""), { tipo: "VALOR", valor: 0 });
conferir("desconto com ponto decimal", lerDesconto("50.5"), { tipo: "VALOR", valor: 50.5 });
conferir("desconto com milhar", lerDesconto("1.000,50"), { tipo: "VALOR", valor: 1000.5 });
conferir("desconto > 100%", "erro" in lerDesconto("120%"), true);
conferir("desconto negativo", "erro" in lerDesconto("-3"), true);
conferir("desconto texto", "erro" in lerDesconto("abc"), true);
const itens = [
  { quantidade: 225, precoUnitario: 4.35, ipiPercentual: 0 },
  { quantidade: 215, precoUnitario: 21.75, ipiPercentual: 10 },
];
conferir(
  "totais do print do Bling + IPI",
  totaisDoPedido({ itens, icmsSt: 0, descontoTipo: "VALOR", descontoValor: 0, frete: 0 }),
  { produtos: 5655, ipi: 467.63, imposto: 0, desconto: 0, total: 6122.63, entrada: 0, faltaPagar: 6122.63, numeroDeItens: 2, somaDasQuantidades: 440 },
);
conferir(
  "desconto 10% sobre produtos",
  totaisDoPedido({ itens: [{ quantidade: 10, precoUnitario: 10, ipiPercentual: 0 }], icmsSt: 0, descontoTipo: "PERCENTUAL", descontoValor: 10, frete: 5 }).total,
  95,
);
conferir(
  "total nunca negativo",
  totaisDoPedido({ itens: [{ quantidade: 1, precoUnitario: 10, ipiPercentual: 0 }], icmsSt: 0, descontoTipo: "VALOR", descontoValor: 50, frete: 0 }).total,
  0,
);
conferir(
  "falta pagar = total - entrada, nunca negativo",
  [
    totaisDoPedido({ itens: [{ quantidade: 10, precoUnitario: 10, ipiPercentual: 0 }], entrada: 30 }).faltaPagar,
    totaisDoPedido({ itens: [{ quantidade: 1, precoUnitario: 10, ipiPercentual: 0 }], entrada: 50 }).faltaPagar,
  ],
  [70, 0],
);
conferir(
  "item sem preco conta zero",
  totaisDoPedido({ itens: [{ quantidade: 3, precoUnitario: null, ipiPercentual: 0 }], icmsSt: 0, descontoTipo: null, descontoValor: 0, frete: 0 }).produtos,
  0,
);
conferir(
  "a caminho ignora rascunho e cancelado",
  aCaminho([
    { status: "RASCUNHO", quantidade: 50, quantidadeLancada: 0 },
    { status: "ENVIADO", quantidade: 30, quantidadeLancada: 0 },
    { status: "PARCIAL", quantidade: 20, quantidadeLancada: 15 },
    { status: "CANCELADO", quantidade: 99, quantidadeLancada: 0 },
  ]),
  35,
);
conferir("entra: abaixo do minimo", entraNaListaDeMinimo({ conferido: true, ativo: true, tipo: "SIMPLES", estoque: 2, estoqueMinimo: 5 }, 0), true);
conferir("sai: a caminho cobre", entraNaListaDeMinimo({ conferido: true, ativo: true, tipo: "SIMPLES", estoque: 2, estoqueMinimo: 5 }, 3), false);
conferir("kit fora", entraNaListaDeMinimo({ conferido: true, ativo: true, tipo: "COMPOSICAO", estoque: 0, estoqueMinimo: 5 }, 0), false);
conferir("pecas proprias fora do minimo", entraNaListaDeMinimo({ conferido: true, ativo: true, tipo: "SIMPLES", estoqueMinimo: 5, estoque: 0, pecasProprias: true }, 0), false);
conferir("sem minimo fora", entraNaListaDeMinimo({ conferido: true, ativo: true, tipo: "SIMPLES", estoque: 0, estoqueMinimo: null }, 0), false);
conferir("nao conferido fora", entraNaListaDeMinimo({ conferido: false, ativo: true, tipo: "SIMPLES", estoque: 0, estoqueMinimo: 5 }, 0), false);
conferir("inativo fora", entraNaListaDeMinimo({ conferido: true, ativo: false, tipo: "SIMPLES", estoque: 0, estoqueMinimo: 5 }, 0), false);
conferir("sugerida = maximo cheio", quantidadeSugerida({ estoqueMinimo: 5, estoqueMaximo: 40 }), 40);
conferir("sugerida sem maximo = minimo", quantidadeSugerida({ estoqueMinimo: 5, estoqueMaximo: null }), 5);
conferir("carrinho azul", estadoDoCarrinho([{ status: "RASCUNHO", numero: 5, fornecedor: "Fortek" }]).cor, "azul");
conferir("carrinho azul texto", estadoDoCarrinho([{ status: "RASCUNHO", numero: 5, fornecedor: "Fortek" }]).texto, "No rascunho PC-0005 (Fortek)");
conferir(
  "carrinho verde vence",
  estadoDoCarrinho([
    { status: "RASCUNHO", numero: 5, fornecedor: "Fortek" },
    { status: "ENVIADO", numero: 3, fornecedor: "Santana" },
  ]).cor,
  "verde",
);
conferir("carrinho vazio", estadoDoCarrinho([{ status: "FINALIZADO", numero: 1, fornecedor: "X" }]), null);
conferir(
  "preco sem IPI da coleta (nao dobra)",
  precoInicialDoItem({ precoFornecedor: 32.54, coletado: { precoNormal: 31.9, impostos: [{ nome: "IPI", percentual: 2 }] } }),
  { precoUnitario: 31.9, ipiPercentual: 2 },
);
conferir("preco sem coleta", precoInicialDoItem({ precoFornecedor: 12.5, coletado: null }), { precoUnitario: 12.5, ipiPercentual: 0 });
conferir(
  "coleta sem IPI usa o do vinculo",
  precoInicialDoItem({ precoFornecedor: 12.5, coletado: { precoNormal: 12.5, impostos: [] } }),
  { precoUnitario: 12.5, ipiPercentual: 0 },
);
conferir("preco sem nada", precoInicialDoItem({ precoFornecedor: null, coletado: null }), { precoUnitario: null, ipiPercentual: 0 });
conferir(
  "transicoes",
  [podeIrPara("RASCUNHO", "ENVIADO"), podeIrPara("PARCIAL", "CANCELADO"), podeIrPara("FINALIZADO", "ENVIADO")],
  [true, false, false],
);
conferir(
  "depois de lancar",
  [statusDepoisDeLancar("ENVIADO", [{ quantidade: 10, quantidadeLancada: 4 }]), statusDepoisDeLancar("PARCIAL", [{ quantidade: 10, quantidadeLancada: 0 }])],
  ["PARCIAL", "ENVIADO"],
);
conferir(
  "quantidade de lancamento",
  [
    validarQuantidadeDeLancamento("5", 10).ok,
    validarQuantidadeDeLancamento("11", 10).ok,
    validarQuantidadeDeLancamento("0", 10).ok,
    validarQuantidadeDeLancamento("2.5", 10).ok,
  ],
  [true, false, false, false],
);

{
  console.log("\nPDF do pedido");
  const { pdfDoPedido } = await import("../src/lib/compras/pdf.js");
  const { PDFParse } = await import("pdf-parse");
  const itensDoPdf = Array.from({ length: 60 }, (_, indice) => ({
    id: `i${indice}`,
    sku: `ZZ-COMPRA-SKU-${indice}`,
    nome: `Produto do Rise ${indice}`,
    nomeNoFornecedor: indice === 0 ? null : `Peça no fornecedor ${indice}`,
    codigoNoFornecedor: `FORN-${indice}`,
    quantidade: 10,
    precoUnitario: 1.5,
    ipiPercentual: indice % 2 ? 10 : 0,
  }));
  const pedidoDoPdf = {
    numero: 7,
    codigo: "PC-0007",
    status: "ENVIADO",
    enviadoEm: new Date("2026-10-26T15:00:00Z"),
    criadoEm: new Date("2026-10-25T15:00:00Z"),
    fornecedor: { nome: "Fornecedor Teste", cnpj: "17.142.314/0001-21", contato: "Fulano", telefone: "5432841632", email: "vendas@exemplo.com.br" },
    itens: itensDoPdf,
    icmsSt: 0, descontoTipo: "PERCENTUAL", descontoValor: 5, frete: 20,
    formaPagamento: "BOLETO", parcelas: 3, entrada: 30,
    transportadora: null, transportadoraNome: "Transportes X", fretePorConta: "FOB",
    propostaNumero: "4512", observacoes: "Entregar em horário comercial.",
  };
  const empresaDoPdf = { razaoSocial: "Maicol de Souza", nomeFantasia: "4Hobby", cnpj: "30.010.376/0001-48", endereco: "Estrada Municipal Domingos Forner", numero: "2135", bairro: "Galópolis", cidade: "Caxias do Sul", uf: "RS", cep: "95090-970", telefone: "5432841632" };
  const bytes = await pdfDoPedido(pedidoDoPdf, empresaDoPdf);
  conferir("PDF valido", bytes.subarray(0, 5).toString("latin1"), "%PDF-");
  const leitor = new PDFParse({ data: new Uint8Array(bytes) });
  const { text, total } = await leitor.getText();
  await leitor.destroy?.();
  conferir("mais de uma pagina", (total ?? 0) >= 2, true);
  conferir("numero, CNPJ da 4hobby e codigo no fornecedor", [text.includes("PC-0007"), text.includes("30.010.376/0001-48"), text.includes("FORN-59")], [true, true, true]);
  conferir("sem nome no fornecedor usa o nome do Rise", text.includes("Produto do Rise 0"), true);
  conferir("nunca o SKU do Rise", text.includes("ZZ-COMPRA-SKU"), false);
  conferir("entrada paga no pagamento", text.includes("Entrada paga: R$"), true);
  conferir("pagamento e proposta", [text.includes("Boleto em 3x"), text.includes("4512")], [true, true]);
  // O campo Frete (transportadora, CIF/FOB) saiu do PDF (pedido do dono em 26/10/2026); o valor do frete fica nos totais.
  conferir("sem o campo Frete no PDF", [/\(FOB\)|\(CIF\)/.test(text), text.includes("Transportes X")], [false, false]);
  conferir("valor do frete continua nos totais", text.includes("R$ 20,00"), true);
}

// ---------------------------------------------------------------------------
// Banco (Postgres local). Tudo o que e criado leva ZZ-COMPRA / "ZZ Compra" e sai no comeco e no fim.
// ---------------------------------------------------------------------------

const { prisma } = await import("../src/lib/db.js");
const banco = await import("../src/lib/compras/banco.js");

async function limpar() {
  await prisma.pedidoDeCompra.deleteMany({ where: { fornecedor: { nome: { startsWith: "ZZ Compra" } } } });
  await prisma.pedidoDeCompra.deleteMany({ where: { itens: { some: { produto: { sku: { startsWith: "ZZ-COMPRA" } } } } } });
  await prisma.produtoFornecedor.deleteMany({ where: { produto: { sku: { startsWith: "ZZ-COMPRA" } } } });
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-COMPRA" } } });
  await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: "ZZ Compra" } } });
}

async function criarProduto(sku, dados = {}) {
  return prisma.produto.create({
    data: { sku, tituloBase: `PRODUTO ${sku}`, conferido: true, ativo: true, estoque: 2, estoqueMinimo: 5, estoqueMaximo: 40, ...dados },
  });
}

async function criarFornecedor(nome, prazoEntregaDias = 7) {
  return prisma.fornecedor.create({ data: { nome, cnpj: null, prazoEntregaDias } });
}

async function vincular(produto, fornecedor, dados = {}) {
  return prisma.produtoFornecedor.create({
    data: {
      produtoId: produto.id,
      fornecedorId: fornecedor.id,
      codigo: `ZZCF-${produto.sku.split("-").pop()}`,
      descricao: `Nome no ${fornecedor.nome}`,
      precoFornecedor: 10,
      precoCusto: 10,
      link: "https://exemplo.com.br/p/1",
      ...dados,
    },
  });
}

try {
  await limpar();

  {
    console.log("\nBanco: abaixo do mínimo e rascunho");
    const produto = await criarProduto("ZZ-COMPRA-1");
    await criarProduto("ZZ-COMPRA-KIT", { tipo: "COMPOSICAO", estoque: 0 });
    const fortek = await criarFornecedor("ZZ Compra Fortek", 5);
    const santana = await criarFornecedor("ZZ Compra Santana", 10);
    const vFortek = await vincular(produto, fortek, { precoFornecedor: 9.5, precoCusto: 9.5, padrao: true });
    const vSantana = await vincular(produto, santana, { precoFornecedor: 12, precoCusto: 12 });

    let lista = await banco.listarAbaixoDoMinimo({ busca: "ZZ-COMPRA" });
    conferir("so o simples conferido entra", lista.linhas.map((linha) => linha.sku), ["ZZ-COMPRA-1"]);
    conferir("falta e carrinho", [lista.linhas[0]?.falta, lista.linhas[0]?.carrinho], [3, null]);

    const opcoes = await banco.fornecedoresParaCompra(produto.id);
    conferir("sugerida = maximo", opcoes.produto.sugerida, 40);
    conferir("mais barato primeiro", opcoes.linhas.map((linha) => linha.fornecedor), ["ZZ Compra Fortek", "ZZ Compra Santana"]);
    conferir("preco da linha", opcoes.linhas[0].precoUnitario, 9.5);

    const primeiro = await banco.adicionarAoPedido({ produtoId: produto.id, vinculoId: vFortek.id, quantidade: 40 });
    conferir("cria o rascunho", [primeiro.ok, primeiro.criado], [true, true]);
    const denovo = await banco.adicionarAoPedido({ produtoId: produto.id, vinculoId: vFortek.id, quantidade: 40 });
    conferir("de novo: ja estava, mesmo pedido", [denovo.ok, denovo.jaEstava, denovo.pedidoId === primeiro.pedidoId], [true, true, true]);
    conferir("um item so", await prisma.itemDoPedidoDeCompra.count({ where: { pedidoId: primeiro.pedidoId } }), 1);
    const item = await prisma.itemDoPedidoDeCompra.findFirst({ where: { pedidoId: primeiro.pedidoId } });
    conferir("item copia o vinculo e o prazo", [item.codigoNoFornecedor, item.nomeNoFornecedor, Number(item.precoUnitario), item.prazoDias, item.quantidade], ["ZZCF-1", "Nome no ZZ Compra Fortek", 9.5, 5, 40]);

    const outro = await banco.adicionarAoPedido({ produtoId: produto.id, vinculoId: vSantana.id, quantidade: 10 });
    conferir("outro fornecedor, outro pedido", [outro.ok, outro.pedidoId !== primeiro.pedidoId], [true, true]);
    conferir("avisa do outro rascunho", /PC-\d{4}/.test(outro.avisoOutroRascunho ?? ""), true);

    const linhaFortek = (await banco.fornecedoresParaCompra(produto.id)).linhas[0];
    conferir("popup sabe que ja esta no rascunho", linhaFortek.noRascunho?.pedidoId, primeiro.pedidoId);

    lista = await banco.listarAbaixoDoMinimo({ busca: "ZZ-COMPRA" });
    conferir("rascunho nao tira da lista; carrinho azul", [lista.linhas.length, lista.linhas[0]?.carrinho?.cor], [1, "azul"]);

    await prisma.pedidoDeCompra.update({ where: { id: primeiro.pedidoId }, data: { status: "ENVIADO" } });
    conferir("a caminho", (await banco.aCaminhoDosProdutos([produto.id])).get(produto.id), 40);
    lista = await banco.listarAbaixoDoMinimo({ busca: "ZZ-COMPRA" });
    conferir("enviado cobre o minimo: sai da lista", lista.linhas.length, 0);
    await prisma.pedidoDeCompra.update({ where: { id: primeiro.pedidoId }, data: { status: "CANCELADO" } });
    lista = await banco.listarAbaixoDoMinimo({ busca: "ZZ-COMPRA" });
    conferir("cancelado: volta a lista", lista.linhas.length, 1);

    const kit = await prisma.produto.findUnique({ where: { sku: "ZZ-COMPRA-KIT" } });
    const vKit = await vincular(kit, fortek);
    const recusa = await banco.adicionarAoPedido({ produtoId: kit.id, vinculoId: vKit.id, quantidade: 1 });
    conferir("kit recusado", [recusa.ok, /kit/i.test(recusa.erro ?? "")], [false, true]);
    const zero = await banco.adicionarAoPedido({ produtoId: produto.id, vinculoId: vFortek.id, quantidade: 0 });
    conferir("quantidade zero recusada", zero.ok, false);

    // Concorrencia: cinco produtos ao mesmo tempo para um fornecedor sem rascunho = um rascunho, cinco itens.
    const novo = await criarFornecedor("ZZ Compra Paralelo");
    const vinculos = [];
    for (let indice = 1; indice <= 5; indice++) {
      const produtoParalelo = await criarProduto(`ZZ-COMPRA-C${indice}`);
      vinculos.push({ produtoId: produtoParalelo.id, vinculoId: (await vincular(produtoParalelo, novo)).id });
    }
    const resultados = await Promise.all(vinculos.map((dados) => banco.adicionarAoPedido({ ...dados, quantidade: 3 })));
    conferir("paralelo: todos ok", resultados.every((resultado) => resultado.ok), true);
    conferir("paralelo: um rascunho so", new Set(resultados.map((resultado) => resultado.pedidoId)).size, 1);
    conferir("paralelo: cinco itens", await prisma.itemDoPedidoDeCompra.count({ where: { pedidoId: resultados[0].pedidoId } }), 5);

    // Cinco fornecedores diferentes ao mesmo tempo: cinco rascunhos, cinco numeros distintos (a trava do numero).
    const pares = [];
    for (let indice = 1; indice <= 5; indice++) {
      const fornecedor = await criarFornecedor(`ZZ Compra Numero ${indice}`);
      pares.push({ produtoId: produto.id, vinculoId: (await vincular(produto, fornecedor)).id });
    }
    const pedidos = await Promise.all(pares.map((dados) => banco.adicionarAoPedido({ ...dados, quantidade: 1 })));
    conferir("cinco pedidos ok", pedidos.every((resultado) => resultado.ok), true);
    conferir("numeros distintos sob concorrencia", new Set(pedidos.map((resultado) => resultado.numero)).size, 5);
  }

  {
    console.log("\nBanco: pedido");
    await limpar();
    const fornecedor = await criarFornecedor("ZZ Compra Pedido", 7);
    const p1 = await criarProduto("ZZ-COMPRA-P1");
    const p2 = await criarProduto("ZZ-COMPRA-P2");
    const p3 = await criarProduto("ZZ-COMPRA-P3");
    await vincular(p1, fornecedor, { precoFornecedor: 10, padrao: true });
    await vincular(p2, fornecedor, { precoFornecedor: null, precoCusto: null });
    await vincular(p3, fornecedor, { codigo: "ZZCF-ACHE", descricao: "Peça especial do fornecedor" });

    const criado = await banco.criarPedido(fornecedor.id);
    const deNovo = await banco.criarPedido(fornecedor.id);
    conferir("criar de novo devolve o mesmo rascunho", [criado.ok, deNovo.pedidoId === criado.pedidoId, deNovo.jaExistia], [true, true, true]);

    conferir("adicionar item", (await banco.adicionarItem(criado.pedidoId, p1.id)).ok, true);
    conferir("adicionar item sem preco", (await banco.adicionarItem(criado.pedidoId, p2.id)).ok, true);
    conferir("duplicado recusado", (await banco.adicionarItem(criado.pedidoId, p1.id)).ok, false);

    let pedido = await banco.lerPedido(criado.pedidoId);
    conferir("le o pedido com dois itens", [pedido.status, pedido.itens.length, pedido.fornecedor.nome], ["RASCUNHO", 2, "ZZ Compra Pedido"]);

    const itens = pedido.itens.map((item, indice) => ({ id: item.id, quantidade: indice === 0 ? "10" : "5", precoUnitario: indice === 0 ? "10,00" : "", ipiPercentual: "0", prazoDias: "3" }));
    const salvo = await banco.salvarPedido(criado.pedidoId, { itens, desconto: "10%", frete: "15,50", icmsSt: "0", formaPagamento: "PIX", parcelas: "3", fretePorConta: "FOB" });
    conferir("salvar rascunho", salvo.ok, true);
    pedido = await banco.lerPedido(criado.pedidoId);
    conferir("totais com desconto e frete", pedido.totais.total, 105.5);
    conferir("pix forca 1 parcela", [pedido.formaPagamento, pedido.parcelas, pedido.fretePorConta], ["PIX", 1, "FOB"]);

    // Quem nao ve custo manda o item SEM os campos de preco: o banco tem de manter os gravados.
    await banco.salvarPedido(criado.pedidoId, { itens: itens.map(({ precoUnitario, ipiPercentual, ...item }) => (void precoUnitario, void ipiPercentual, item)) });
    conferir("salvar sem os campos de preco nao apaga o preco", (await banco.lerPedido(criado.pedidoId)).itens[0].precoUnitario, 10);

    const invalido = await banco.salvarPedido(criado.pedidoId, { itens: [{ ...itens[0], quantidade: "0" }, itens[1]], desconto: "abc" });
    conferir("salvar invalido devolve erros por campo", [invalido.ok, Boolean(invalido.erros?.["itens.0.quantidade"]), Boolean(invalido.erros?.desconto)], [false, true, true]);

    const semPreco = await banco.mudarStatus(criado.pedidoId, "ENVIADO");
    conferir("enviar com item sem preco recusa citando o SKU", [semPreco.ok, /ZZ-COMPRA-P2/.test(semPreco.erro ?? "")], [false, true]);

    await banco.salvarPedido(criado.pedidoId, { itens: [itens[0]], desconto: "", frete: "0", icmsSt: "0" });
    conferir("item tirado da lista sai do pedido", (await banco.lerPedido(criado.pedidoId)).itens.length, 1);

    const enviado = await banco.mudarStatus(criado.pedidoId, "ENVIADO");
    pedido = await banco.lerPedido(criado.pedidoId);
    conferir("enviado com data", [enviado.ok, pedido.status, Boolean(pedido.enviadoEm)], [true, "ENVIADO", true]);

    await banco.salvarPedido(criado.pedidoId, { itens: [{ ...itens[0], quantidade: "999", prazoDias: "9" }], rastreio: "BR123", desconto: "50" });
    pedido = await banco.lerPedido(criado.pedidoId);
    conferir("enviado: so prazo e frete mudam", [pedido.itens[0].quantidade, pedido.itens[0].prazoDias, pedido.rastreio, pedido.descontoValor], [10, 9, "BR123", 0]);
    conferir("enviado nao aceita item novo", (await banco.adicionarItem(criado.pedidoId, p3.id)).ok, false);

    const outro = await banco.criarPedido(fornecedor.id);
    const achados = await banco.buscarItensParaPedido(outro.pedidoId, "ache");
    conferir("busca pelo codigo no fornecedor", achados.map((achado) => achado.sku), ["ZZ-COMPRA-P3"]);
    await banco.adicionarItem(outro.pedidoId, p3.id);
    conferir("busca marca o que ja esta no pedido", (await banco.buscarItensParaPedido(outro.pedidoId, "ZZ-COMPRA-P3"))[0]?.jaNoPedido, true);

    conferir("finalizar", (await banco.mudarStatus(criado.pedidoId, "FINALIZADO")).ok, true);
    conferir("finalizado nao volta", (await banco.mudarStatus(criado.pedidoId, "ENVIADO")).ok, false);
    conferir("finalizado nao salva", (await banco.salvarPedido(criado.pedidoId, { observacoes: "x" })).ok, false);
    conferir("cancelar rascunho", (await banco.mudarStatus(outro.pedidoId, "CANCELADO")).ok, true);

    // Entrada: o valor ja pago ao fazer o pedido (pedido do dono em 26/10/2026). Muda ate o pedido fechar.
    const comEntrada = await banco.criarPedido((await criarFornecedor("ZZ Compra Entrada")).id);
    await banco.adicionarItem(comEntrada.pedidoId, p1.id);
    const itemEntrada = (await banco.lerPedido(comEntrada.pedidoId)).itens[0];
    await banco.salvarPedido(comEntrada.pedidoId, { itens: [{ id: itemEntrada.id, quantidade: "10", precoUnitario: "10", ipiPercentual: "0" }], entrada: "30,50" });
    let lidoEntrada = await banco.lerPedido(comEntrada.pedidoId);
    conferir("entrada gravada e falta pagar", [lidoEntrada.entrada, lidoEntrada.totais.faltaPagar], [30.5, 69.5]);
    const entradaInvalida = await banco.salvarPedido(comEntrada.pedidoId, { entrada: "-5" });
    conferir("entrada negativa recusada no campo", Boolean(entradaInvalida.erros?.entrada), true);
    await banco.mudarStatus(comEntrada.pedidoId, "ENVIADO");
    await banco.salvarPedido(comEntrada.pedidoId, { entrada: "100" });
    lidoEntrada = await banco.lerPedido(comEntrada.pedidoId);
    conferir("entrada muda depois de enviado; falta pagar nao fica negativo", [lidoEntrada.entrada, lidoEntrada.totais.faltaPagar], [100, 0]);

    // Excluir (pedido do dono em 26/10/2026): so rascunho e cancelado; enviado pede cancelar antes.
    conferir("excluir pedido enviado recusa", (await banco.excluirPedido(comEntrada.pedidoId)).ok, false);
    const paraExcluir = await banco.criarPedido((await criarFornecedor("ZZ Compra Excluir")).id);
    await banco.adicionarItem(paraExcluir.pedidoId, p1.id);
    const excluido = await banco.excluirPedido(paraExcluir.pedidoId);
    conferir("excluir rascunho apaga o pedido e os itens", [excluido.ok, await prisma.pedidoDeCompra.count({ where: { id: paraExcluir.pedidoId } }), await prisma.itemDoPedidoDeCompra.count({ where: { pedidoId: paraExcluir.pedidoId } })], [true, 0, 0]);
    conferir("excluir de novo: nao encontrado", (await banco.excluirPedido(paraExcluir.pedidoId)).ok, false);

    const lista = await banco.listarPedidos({ busca: "ZZ Compra Pedido" });
    conferir("lista por fornecedor", [lista.total, lista.linhas[0].status], [2, "CANCELADO"]);
    conferir("lista filtra status", (await banco.listarPedidos({ status: ["FINALIZADO"], busca: "ZZ Compra Pedido" })).total, 1);
  }

  {
    console.log("\nLançamento de estoque (Bling falso)");
    await limpar();
    const { criarBlingFalso } = await import("./lib/blingFalso.js");
    const lancamento = await import("../src/lib/compras/lancamento.js");
    const { gravarAjusteDeEstoque } = await import("../src/lib/ajusteRapido.js");

    const noBling = (codigo, id) => ({ id, codigo, nome: `Produto ${codigo}`, preco: 10, situacao: "A", formato: "S", tipo: "P" });
    const fornecedor = await criarFornecedor("ZZ Compra Lancar");
    const produto = await criarProduto("ZZ-COMPRA-L1", { estoque: 5, blingSaldo: 5 });
    await vincular(produto, fornecedor);

    async function pedidoEnviado(quantidade) {
      const novo = await banco.adicionarAoPedido({ produtoId: produto.id, vinculoId: (await prisma.produtoFornecedor.findFirst({ where: { produtoId: produto.id } })).id, quantidade });
      await banco.mudarStatus(novo.pedidoId, "ENVIADO");
      const item = await prisma.itemDoPedidoDeCompra.findFirst({ where: { pedidoId: novo.pedidoId } });
      return { pedidoId: novo.pedidoId, itemId: item.id };
    }
    const estoque = async () => (await prisma.produto.findUnique({ where: { id: produto.id } })).estoque;
    const statusDe = async (pedidoId) => (await prisma.pedidoDeCompra.findUnique({ where: { id: pedidoId } })).status;

    const falso = criarBlingFalso({ produtos: [noBling("ZZ-COMPRA-L1", 15000000901)], saldos: { "ZZ-COMPRA-L1": 5 }, codigosLiberados: ["ZZ-COMPRA-L1"] });
    const { pedidoId, itemId } = await pedidoEnviado(10);

    const rascunho = await banco.criarPedido((await criarFornecedor("ZZ Compra Rascunho")).id);
    void rascunho;

    let resultado = await lancamento.lancarEstoqueDoItem(itemId, 4, { cliente: falso });
    conferir("lancar 4: ok e Bling ok", [resultado.ok, resultado.bling?.ok], [true, true]);
    conferir("estoque do Rise subiu", await estoque(), 9);
    conferir("Bling falso com o saldo novo", falso.saldo("ZZ-COMPRA-L1"), 9);
    conferir("pedido parcial", await statusDe(pedidoId), "PARCIAL");
    const movimento = await prisma.movimentoEstoque.findFirst({ where: { produtoId: produto.id }, orderBy: { criadoEm: "desc" } });
    conferir("movimento de entrada com o numero do pedido", [movimento.tipo, movimento.quantidade, /^PC-\d{4}$/.test(movimento.observacao ?? ""), movimento.motivo], ["ENTRADA", 4, true, "Compra de fornecedor"]);

    resultado = await lancamento.lancarEstoqueDoItem(itemId, 7, { cliente: falso });
    conferir("lancar mais do que falta: recusa", [resultado.ok, await estoque()], [false, 9]);

    // Clique duplo: dois lancamentos de 6 ao mesmo tempo, so um passa.
    const duplos = await Promise.all([
      lancamento.lancarEstoqueDoItem(itemId, 6, { cliente: falso }),
      lancamento.lancarEstoqueDoItem(itemId, 6, { cliente: falso }),
    ]);
    conferir("clique duplo: exatamente um ok", duplos.filter((item) => item.ok).length, 1);
    conferir("clique duplo: estoque 15", await estoque(), 15);
    conferir("dois lancamentos vivos", await prisma.lancamentoDoItemDeCompra.count({ where: { itemId, desfeitoEm: null } }), 2);

    resultado = await lancamento.desfazerUltimoLancamento(itemId, { cliente: falso });
    conferir("desfazer o ultimo (6)", [resultado.ok, await estoque(), await statusDe(pedidoId)], [true, 9, "PARCIAL"]);
    resultado = await lancamento.desfazerUltimoLancamento(itemId, { cliente: falso });
    conferir("desfazer o outro (4): volta a enviado", [resultado.ok, await estoque(), await statusDe(pedidoId)], [true, 5, "ENVIADO"]);
    conferir("Bling acompanha", falso.saldo("ZZ-COMPRA-L1"), 5);

    // Saldo ja consumido: lanca 10, sai 12 pela lista de Produtos, desfazer recusa sem mexer.
    await lancamento.lancarEstoqueDoItem(itemId, 10, { cliente: falso });
    await gravarAjusteDeEstoque(produto.id, { tipo: "SAIDA", quantidade: 12, motivo: "Venda fora dos canais" });
    const antes = await estoque();
    resultado = await lancamento.desfazerUltimoLancamento(itemId, { cliente: falso });
    conferir("desfazer com o estoque ja vendido: recusa", [resultado.ok, /Já saíram/.test(resultado.erro ?? ""), await estoque()], [false, true, antes]);

    // Bling recusa (codigo fora da trava): a entrada fica no Rise, pendente, e nada repete.
    const travado = criarBlingFalso({ produtos: [noBling("ZZ-COMPRA-L1", 15000000901)], saldos: { "ZZ-COMPRA-L1": 5 }, codigosLiberados: ["OUTRO-CODIGO"] });
    const segundo = await pedidoEnviado(3);
    const estoqueAntes = await estoque();
    resultado = await lancamento.lancarEstoqueDoItem(segundo.itemId, 3, { cliente: travado });
    conferir("Bling recusa: lancado no Rise, aviso do Bling", [resultado.ok, resultado.bling?.ok, await estoque()], [true, false, estoqueAntes + 3]);
    const pendente = await prisma.movimentoEstoque.findFirst({ where: { produtoId: produto.id }, orderBy: { criadoEm: "desc" } });
    conferir("movimento fica pendente", pendente.enviadoAoBlingEm, null);
    conferir("nenhum POST /estoques no Bling travado", travado.chamadas.filter((chamada) => chamada.metodo === "post").length, 0);

    // Pedido em rascunho nao lanca.
    const outroRascunho = await banco.adicionarAoPedido({ produtoId: produto.id, vinculoId: (await vincular(produto, await criarFornecedor("ZZ Compra Rascunho 2"))).id, quantidade: 2 });
    const itemRascunho = await prisma.itemDoPedidoDeCompra.findFirst({ where: { pedidoId: outroRascunho.pedidoId } });
    conferir("rascunho nao lanca", (await lancamento.lancarEstoqueDoItem(itemRascunho.id, 1, { cliente: falso })).ok, false);
  }

  {
    console.log("\nProposta do fornecedor (arquivo)");
    await limpar();
    const { existsSync } = await import("node:fs");
    const { randomUUID } = await import("node:crypto");
    const arquivos = await import("../src/lib/compras/arquivos.js");
    const fornecedor = await criarFornecedor("ZZ Compra Proposta");
    const pedido = await banco.criarPedido(fornecedor.id);
    const lote = randomUUID();

    const pdf = new File([Buffer.from("%PDF-1.4\n% teste\n")], "Orçamento 123.pdf", { type: "application/pdf" });
    const falso = new File([Buffer.from("isto nao e pdf")], "x.pdf", { type: "application/pdf" });
    conferir("texto com nome .pdf recusado", (await arquivos.guardarPropostaTemporaria(lote, falso)).ok, false);
    conferir("lote invalido recusado", (await arquivos.guardarPropostaTemporaria("../../x", pdf)).ok, false);

    const enviado = await arquivos.guardarPropostaTemporaria(lote, pdf);
    conferir("pdf aceito no lote", [enviado.ok, enviado.nomeOriginal], [true, "Orçamento 123.pdf"]);
    await banco.salvarPedido(pedido.pedidoId, { propostaTemporaria: { lote, nome: enviado.nome, nomeOriginal: enviado.nomeOriginal } });
    let lido = await banco.lerPedido(pedido.pedidoId);
    const caminho = arquivos.caminhoDaPropostaDoPedido(pedido.pedidoId, lido.propostaArquivo);
    conferir("proposta no pedido, arquivo no disco", [lido.propostaNomeOriginal, existsSync(caminho)], ["Orçamento 123.pdf", true]);

    await banco.salvarPedido(pedido.pedidoId, { removerProposta: true });
    lido = await banco.lerPedido(pedido.pedidoId);
    conferir("remover apaga linha e arquivo", [lido.propostaArquivo, existsSync(caminho)], [null, false]);
    await arquivos.apagarPastaDoPedido(pedido.pedidoId);
  }

  {
    console.log("\nDados da empresa");
    const empresa = await import("../src/lib/compras/empresa.js");
    const original = await empresa.lerDadosDaEmpresa();
    try {
      conferir("semente da Receita", [original.cnpj, original.razaoSocial, original.cidade], ["30.010.376/0001-48", "Maicol de Souza", "Caxias do Sul"]);
      const invalido = await empresa.salvarDadosDaEmpresa({ ...original, cnpj: "11.111.111/1111-11" });
      conferir("CNPJ invalido recusado no campo", [invalido.ok, Boolean(invalido.erros?.cnpj)], [false, true]);
      const semNome = await empresa.salvarDadosDaEmpresa({ ...original, razaoSocial: "  " });
      conferir("razao social obrigatoria", Boolean(semNome.erros?.razaoSocial), true);
      const salvo = await empresa.salvarDadosDaEmpresa({ ...original, cnpj: "30010376000148", telefone: "(54) 3284-1632", cep: "95090970" });
      const lido = await empresa.lerDadosDaEmpresa();
      conferir("grava CNPJ e CEP formatados, telefone em digitos", [salvo.ok, lido.cnpj, lido.cep, lido.telefone], [true, "30.010.376/0001-48", "95090-970", "5432841632"]);
    } finally {
      await prisma.dadosDaEmpresa.update({ where: { id: "empresa" }, data: { ...original, id: undefined, atualizadoEm: undefined } });
    }
  }

  {
    console.log("\nCompras pelo MCP (montar, ler, situacao, acesso)");
    await limpar();
    const mcp = await import("../src/lib/mcp/compras.js");
    const tudo = { pode: () => true };
    const semCusto = { pode: (recurso) => recurso !== "dado.custo" };
    const soVer = { pode: (recurso, nivel) => nivel === "ver" };
    const recusa = async (promessa) => {
      try {
        await promessa;
        return null;
      } catch (erro) {
        return erro?.name === "ErroDeFerramenta" ? erro.message : `outro erro: ${erro?.message}`;
      }
    };

    const fornecedor = await criarFornecedor("ZZ Compra MCP Alfa");
    await criarFornecedor("ZZ Compra MCP Alfa Dois");
    const p1 = await criarProduto("ZZ-COMPRA-M1");
    const p2 = await criarProduto("ZZ-COMPRA-M2");
    await criarProduto("ZZ-COMPRA-M3");
    await criarProduto("ZZ-COMPRA-MK", { tipo: "COMPOSICAO" });
    await vincular(p1, fornecedor, { precoFornecedor: 12, precoCusto: 12 });
    await vincular(p2, fornecedor, { codigo: "COD-FORN-2", precoFornecedor: 7, precoCusto: 7 });

    conferir(
      "fornecedor parecido com dois recusa e lista",
      (await recusa(mcp.montarPedidoDeCompra({ fornecedor: "ZZ Compra MCP", itens: [{ sku: "ZZ-COMPRA-M1", quantidade: 1 }] }, tudo)))?.includes("Mais de um fornecedor"),
      true,
    );
    const faltou = await recusa(
      mcp.montarPedidoDeCompra({ fornecedor: "zz compra mcp alfa", itens: [{ sku: "ZZ-COMPRA-M1", quantidade: 1 }, { sku: "ZZ-COMPRA-NAOEXISTE", quantidade: 2 }, { sku: "ZZ-COMPRA-MK", quantidade: 1 }] }, tudo),
    );
    conferir("item que nao existe e kit recusam o pedido inteiro", [faltou?.includes("ZZ-COMPRA-NAOEXISTE"), faltou?.includes("kit")], [true, true]);
    conferir("nada gravado depois da recusa", await prisma.pedidoDeCompra.count({ where: { fornecedorId: fornecedor.id } }), 0);

    const montado = await mcp.montarPedidoDeCompra(
      {
        fornecedor: "ZZ Compra MCP Alfa",
        itens: [
          { sku: "ZZ-COMPRA-M1", quantidade: 10 },
          { codigoNoFornecedor: "cod-forn-2", quantidade: 5, precoUnitario: 6.5, ipiPercentual: 10 },
          { sku: "ZZ-COMPRA-M3", quantidade: 3 },
        ],
        frete: 20,
        desconto: "5%",
        formaPagamento: "PIX",
        propostaNumero: "ORC-77",
      },
      tudo,
    );
    const itemDe = (sku) => montado.pedido.itens.find((item) => item.sku === sku);
    conferir("rascunho criado com os 3 itens", [montado.criado, montado.pedido.situacao, montado.pedido.itens.length], [true, "RASCUNHO", 3]);
    conferir("preco do cadastro, o informado e o sem vinculo", [itemDe("ZZ-COMPRA-M1").precoUnitario, itemDe("ZZ-COMPRA-M2").precoUnitario, itemDe("ZZ-COMPRA-M2").ipiPercentual, itemDe("ZZ-COMPRA-M3").precoUnitario], [12, 6.5, 10, null]);
    conferir("cabecalho gravado", [montado.pedido.totais.frete, montado.pedido.pagamento.forma, montado.pedido.propostaDoFornecedor], [20, "PIX", "ORC-77"]);
    conferir("avisa o item sem preco e sem vinculo", [montado.avisos.some((aviso) => aviso.includes("ZZ-COMPRA-M3")), montado.itensDestaVez.find((item) => item.sku === "ZZ-COMPRA-M3").semVinculoComOFornecedor], [true, true]);

    const enviarSemPreco = await recusa(mcp.mudarSituacaoDoPedidoDeCompra({ pedido: montado.pedido.codigo, para: "ENVIADO" }, tudo));
    conferir("enviar com item sem preco recusa", enviarSemPreco?.includes("ZZ-COMPRA-M3"), true);

    const segundo = await mcp.montarPedidoDeCompra({ fornecedor: "ZZ Compra MCP Alfa", itens: [{ sku: "ZZ-COMPRA-M3", quantidade: 4, precoUnitario: 3 }, { sku: "ZZ-COMPRA-M1", quantidade: 8 }] }, tudo);
    conferir("segunda vez completa o mesmo rascunho", [segundo.criado, segundo.pedido.codigo, segundo.pedido.itens.length], [false, montado.pedido.codigo, 3]);
    const m1 = segundo.pedido.itens.find((item) => item.sku === "ZZ-COMPRA-M1");
    conferir("item que ja estava troca a quantidade e mantem o preco", [m1.quantidade, m1.precoUnitario, segundo.itensDestaVez.find((item) => item.sku === "ZZ-COMPRA-M1").acao], [8, 12, "atualizado"]);

    conferir("sem custo nao grava preco", (await recusa(mcp.montarPedidoDeCompra({ fornecedor: "ZZ Compra MCP Alfa", itens: [{ sku: "ZZ-COMPRA-M1", quantidade: 1, precoUnitario: 1 }] }, semCusto)))?.includes("preço de compra"), true);
    conferir("so ver nao monta pedido", (await recusa(mcp.montarPedidoDeCompra({ fornecedor: "ZZ Compra MCP Alfa", itens: [{ sku: "ZZ-COMPRA-M1", quantidade: 1 }] }, soVer)))?.includes("não pode"), true);

    const lidoSemCusto = await mcp.lerPedidoDeCompra({ pedido: segundo.pedido.codigo.replace("PC-", "pc") }, semCusto);
    conferir("ler sem custo esconde precos e totais", [lidoSemCusto.itens[0].precoUnitario, lidoSemCusto.totais], ["[restrito]", "[restrito]"]);

    const enviado = await mcp.mudarSituacaoDoPedidoDeCompra({ pedido: segundo.pedido.codigo, para: "ENVIADO" }, tudo);
    conferir("enviar com todos os precos", [enviado.pedido.situacao, enviado.pedido.itens.every((item) => item.faltaChegar === item.quantidade)], ["ENVIADO", true]);
    const lista = await mcp.listarPedidosDeCompra({ situacao: ["ENVIADO"], termos: "ZZ Compra MCP" }, tudo);
    conferir("lista por situacao e fornecedor", [lista.total, lista.pedidos[0].codigo], [1, segundo.pedido.codigo]);
    conferir("finalizar pela conversa", (await mcp.mudarSituacaoDoPedidoDeCompra({ pedido: segundo.pedido.codigo, para: "FINALIZADO" }, tudo)).pedido.situacao, "FINALIZADO");
    conferir("finalizado nao volta", (await recusa(mcp.mudarSituacaoDoPedidoDeCompra({ pedido: segundo.pedido.codigo, para: "CANCELADO" }, tudo)))?.includes("não é permitida"), true);
    conferir("pedido que nao existe", (await recusa(mcp.lerPedidoDeCompra({ pedido: "PC-999999" }, tudo)))?.includes("não encontrado"), true);

    const minimo = await mcp.produtosAbaixoDoMinimo({ termos: "ZZ-COMPRA-M2" }, tudo);
    const linhaM2 = minimo.produtos[0];
    conferir("abaixo do minimo traz sugerida e fornecedores", [minimo.total, linhaM2?.quantidadeSugerida, linhaM2?.fornecedores[0]?.codigo, linhaM2?.fornecedores[0]?.custo], [1, 40, "COD-FORN-2", 7]);
    conferir("minimo sem estoque exato recusa", (await recusa(mcp.produtosAbaixoDoMinimo({}, { pode: (recurso) => recurso !== "dado.estoqueExato" })))?.includes("estoque exato"), true);
  }

  // Marcador: os blocos de banco seguintes entram acima desta linha.
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(`\n${falhas === 0 ? "Tudo certo." : `${falhas} falha(s).`}`);
process.exit(falhas === 0 ? 0 : 1);
