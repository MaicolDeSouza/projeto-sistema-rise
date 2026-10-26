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
  { produtos: 5655, ipi: 467.63, desconto: 0, total: 6122.63, numeroDeItens: 2, somaDasQuantidades: 440 },
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

  // Marcador: os blocos de banco seguintes entram acima desta linha.
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(`\n${falhas === 0 ? "Tudo certo." : `${falhas} falha(s).`}`);
process.exit(falhas === 0 ? 0 : 1);
