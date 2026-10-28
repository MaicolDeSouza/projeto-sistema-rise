import "dotenv/config";

/**
 * Testes do AliExpress no modulo Compras (spec 2026-10-28-aliexpress-em-compras-design.md): regras puras, a chave da
 * extensao, a importacao, o casamento com o produto e o deposito Virtual contra um Bling falso. SEM rede.
 *
 *   npm run teste:aliexpress            (apaga o que criou no fim)
 *   npm run teste:aliexpress -- --manter (deixa os ZZ no banco, para conferir a tela)
 *
 * So escreve produtos ZZ-ALI-*, fornecedores "ZZ Ali *" e os pedidos deles, apagados no comeco e no fim. O fornecedor
 * marcado como o do AliExpress (o "Ali" do dono) e a conexao ALIEXPRESS voltam ao que eram.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const manter = process.argv.includes("--manter");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

// ---------------------------------------------------------------------------
// Regras puras (sem banco)
// ---------------------------------------------------------------------------

const regras = await import("../src/lib/compras/aliexpress/regras.js");
{
  const {
    lerPreco,
    lerData,
    anuncioDoLink,
    codigoDoVinculo,
    situacaoDoAliExpress,
    statusNoRise,
    avisosDoPedido,
    quantidadeNoRise,
    precoNoRise,
    precoMedioPonderado,
    descontoImplicito,
    pacoteDaLinha,
    decidirCasamento,
    formatarDataCurta,
  } = regras;
  console.log("\nRegras puras do AliExpress");
  conferir("preco", [lerPreco("R$57,49"), lerPreco("R$ 1.234,56"), lerPreco("US $1.00"), lerPreco(""), lerPreco(null)], [57.49, 1234.56, null, null, null]);
  conferir(
    "data",
    [lerData("26 out, 2026")?.toISOString(), lerData("2026-10-26")?.toISOString().slice(0, 10), lerData("3 fev, 2027")?.toISOString().slice(0, 10), lerData("Hoje")],
    ["2026-10-26T12:00:00.000Z", "2026-10-26", "2027-02-03", null],
  );
  conferir(
    "anuncio do link",
    [
      anuncioDoLink("https://pt.aliexpress.com/item/32814252396.html?spm=a2g0s.9042311"),
      anuncioDoLink("//www.aliexpress.com/item/1005006891567710.html?sku_id=12000038634693222"),
      anuncioDoLink("https://loja.x.com/p/1"),
      anuncioDoLink(null),
    ],
    [{ productId: "32814252396", skuId: null }, { productId: "1005006891567710", skuId: "12000038634693222" }, null, null],
  );
  conferir("codigo do vinculo", [codigoDoVinculo("1005006891567710", "12000038634693222"), codigoDoVinculo("1", null)], ["1005006891567710:12000038634693222", "1:"]);
  conferir("situacao: enviado parcialmente (7)", situacaoDoAliExpress({ codigo: 7, texto: "Enviado parcialmente" }), { aberto: true, entregue: false, cancelado: false, aguardandoPagamento: false });
  conferir("situacao: aguardando a entrega (8)", situacaoDoAliExpress({ codigo: 8, texto: "Aguardando a entrega" }).aberto, true);
  conferir(
    "situacao pelo texto",
    [
      situacaoDoAliExpress({ codigo: null, texto: "Concluído" }).entregue,
      situacaoDoAliExpress({ codigo: null, texto: "Pedido fechado" }).cancelado,
      situacaoDoAliExpress({ codigo: null, texto: "Reembolsado" }).cancelado,
      situacaoDoAliExpress({ codigo: null, texto: "A ser pago" }).aguardandoPagamento,
      situacaoDoAliExpress({ codigo: null, texto: "Entregue" }).aberto,
    ],
    [true, true, true, true, false],
  );
  conferir("status no Rise: cancelado sem lancamento", statusNoRise({ situacao: { cancelado: true }, statusAtual: "ENVIADO", temLancamento: false }), { status: "CANCELADO", aviso: null });
  conferir(
    "status no Rise: cancelado com lancamento",
    statusNoRise({ situacao: { cancelado: true }, statusAtual: "PARCIAL", temLancamento: true }),
    { status: "PARCIAL", aviso: "Cancelado no AliExpress, mas há estoque lançado." },
  );
  conferir("status no Rise: entregue nao fecha", statusNoRise({ situacao: { entregue: true }, statusAtual: "ENVIADO", temLancamento: false }), { status: "ENVIADO", aviso: null });
  conferir("status no Rise: finalizado fica", statusNoRise({ situacao: { cancelado: true }, statusAtual: "FINALIZADO", temLancamento: true }).status, "FINALIZADO");
  conferir(
    "avisos",
    avisosDoPedido({ entregueEm: new Date("2026-10-27T12:00:00Z"), faltaLancar: 3, linhasPendentes: 2, virtualErros: 1 }),
    [
      "Entregue no AliExpress em 27/10, falta lançar.",
      "2 item(ns) sem produto: escolha o produto para contar no estoque a caminho.",
      "Entrada no depósito Virtual pendente em 1 item(ns).",
    ],
  );
  conferir("avisos: entregue com tudo lancado nao avisa", avisosDoPedido({ entregueEm: new Date(), faltaLancar: 0, linhasPendentes: 0, virtualErros: 0 }), []);
  conferir("avisos: cancelado com estoque", avisosDoPedido({ canceladoNoAliExpressEm: new Date(), estoqueLancado: true }), ["Cancelado no AliExpress, mas há estoque lançado."]);
  conferir("fator", [quantidadeNoRise(2, 100), quantidadeNoRise(4, null), precoNoRise(30, 100), precoNoRise(57.49, 1), precoNoRise(10, 3)], [200, 4, 0.3, 57.49, 3.3333]);
  conferir("preco medio ponderado", [precoMedioPonderado([{ quantidade: 200, preco: 0.3 }, { quantidade: 100, preco: 0.36 }]), precoMedioPonderado([])], [0.32, null]);
  conferir(
    "desconto implicito",
    [descontoImplicito({ produtos: 229.96, frete: 0.12, imposto: 47.14, total: 277.1 }), descontoImplicito({ produtos: 10, frete: 0, imposto: 0, total: 12 })],
    [0.12, 0],
  );
  conferir(
    "pacote da linha",
    [
      pacoteDaLinha([{ codigo: "NN1", itens: [{ productId: "1", skuId: "2" }] }], { productId: "1", skuId: "2" }),
      pacoteDaLinha([{ codigo: "NN1", itens: [{ productId: "1", skuId: "2" }] }], { productId: "9", skuId: null }),
      pacoteDaLinha([{ codigo: "NN1", itens: [{ productId: "1", skuId: null }] }], { productId: "1", skuId: "5" }),
    ],
    ["NN1", null, "NN1"],
  );
  conferir(
    "decidir casamento",
    [
      decidirCasamento([], null),
      decidirCasamento([{ produtoId: "p1", origem: "rascunho", skuId: null }], "s1"),
      decidirCasamento([{ produtoId: "p1", origem: "rascunho", skuId: null }, { produtoId: "p1", origem: "vinculo", skuId: null }], "s1"),
      decidirCasamento([{ produtoId: "p2", origem: "rascunho", skuId: null }, { produtoId: "p1", origem: "vinculo", skuId: null }], "s1"),
      decidirCasamento([{ produtoId: "p1", origem: "vinculo", skuId: "outro" }], "s1"),
      decidirCasamento([{ produtoId: "p1", origem: "vinculo", skuId: "s1" }, { produtoId: "p2", origem: "rascunho", skuId: null }], "s1"),
    ],
    [null, { produtoId: "p1" }, { produtoId: "p1" }, { ambiguo: ["p1", "p2"] }, null, { produtoId: "p1" }],
  );
  conferir("data curta", formatarDataCurta(new Date("2026-10-27T12:00:00Z")), "27/10");
}

// Marcador: os blocos puros entram acima desta linha.

// ---------------------------------------------------------------------------
// Banco (Postgres local)
// ---------------------------------------------------------------------------

const { prisma } = await import("../src/lib/db.js");
const { fornecedorDoAliExpress, marcarFornecedorDoAliExpress } = await import("../src/lib/compras/aliexpress/fornecedor.js");

async function limpar() {
  await prisma.pedidoDeCompra.deleteMany({ where: { fornecedor: { nome: { startsWith: "ZZ Ali" } } } });
  await prisma.pedidoDeCompra.deleteMany({ where: { itens: { some: { produto: { sku: { startsWith: "ZZ-ALI" } } } } } });
  await prisma.produtoFornecedor.deleteMany({ where: { produto: { sku: { startsWith: "ZZ-ALI" } } } });
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-ALI" } } });
  await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: "ZZ Ali" } } });
}

// O "Ali" do dono: marcado de novo no fim de cada bloco que troca a marca.
const fornecedorOriginal = await fornecedorDoAliExpress();
async function devolverMarca() {
  if (fornecedorOriginal) await marcarFornecedorDoAliExpress(fornecedorOriginal.id);
  else await prisma.fornecedor.updateMany({ where: { aliexpress: true }, data: { aliexpress: false } });
}

await limpar();
try {
  {
    console.log("\nFornecedor do AliExpress");
    const a = await prisma.fornecedor.create({ data: { nome: "ZZ Ali A", estrangeiro: true } });
    const b = await prisma.fornecedor.create({ data: { nome: "ZZ Ali B", estrangeiro: true } });
    conferir("marcar A", (await marcarFornecedorDoAliExpress(a.id)).ok, true);
    conferir("A e o fornecedor do AliExpress", (await fornecedorDoAliExpress())?.id, a.id);
    conferir("marcar B desmarca A", [(await marcarFornecedorDoAliExpress(b.id)).ok, (await fornecedorDoAliExpress())?.id], [true, b.id]);
    conferir("so um marcado", await prisma.fornecedor.count({ where: { aliexpress: true } }), 1);
    conferir("indice unico barra dois marcados", await prisma.fornecedor.update({ where: { id: a.id }, data: { aliexpress: true } }).then(() => "gravou", (erro) => erro.code), "P2002");
    conferir("id inexistente recusa", (await marcarFornecedorDoAliExpress("nao-existe")).ok, false);
    await devolverMarca();
    conferir("devolveu a marca do dono", (await fornecedorDoAliExpress())?.id ?? null, fornecedorOriginal?.id ?? null);
  }

  // Marcador: os blocos de banco seguintes entram acima desta linha.
} finally {
  await devolverMarca();
  if (!manter) await limpar();
  await prisma.$disconnect();
}

console.log(`\n${falhas === 0 ? "Tudo certo." : `${falhas} falha(s).`}`);
process.exit(falhas === 0 ? 0 : 1);
