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

// Marcador: os blocos de banco entram acima desta linha.

console.log(`\n${falhas === 0 ? "Tudo certo." : `${falhas} falha(s).`}`);
process.exit(falhas === 0 ? 0 : 1);
