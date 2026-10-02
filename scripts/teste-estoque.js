import "dotenv/config";

/**
 * Testes da edicao rapida da lista de Produtos (localizacao, preco e ajuste de
 * estoque): regras puras e gravacao no Postgres, SEM rede.
 *
 *   npm run teste:estoque
 *
 * Cria um produto de teste (SKU ZZ-EDIT-1) e o apaga no fim, com o historico dele.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("../src/lib/db.js");
const { gravarAjusteDeEstoque, gravarLocalizacao, gravarPrecoVenda } = await import("../src/lib/ajusteRapido.js");
const { MAXIMO_ESTOQUE, MOTIVOS, novoSaldo, tipoValido } = await import("../src/lib/estoque.js");
const { calcularMargem, corDaMargem, lucroLiquido } = await import("../src/lib/margem.js");

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

console.log("\nRegras de estoque");
conferir("entrada soma", novoSaldo("ENTRADA", 5, 3), 8);
conferir("saida tira", novoSaldo("SAIDA", 5, 3), 2);
conferir("saida maior que o saldo da negativo (quem chama recusa)", novoSaldo("SAIDA", 5, 8), -3);
conferir("balanco define, seja qual for o saldo", novoSaldo("BALANCO", 5, 12), 12);
conferir("tipo conhecido", [tipoValido("ENTRADA"), tipoValido("SAIDA"), tipoValido("BALANCO")], [true, true, true]);
conferir("tipo desconhecido", [tipoValido("VENDA"), tipoValido(""), tipoValido(undefined)], [false, false, false]);
conferir("todo tipo tem motivo", Object.values(MOTIVOS).every((lista) => lista.length > 0), true);

console.log("\nMargem");
// 100 * 0,94 - 40 = 54 de lucro liquido (6% de imposto sobre o preco).
conferir("lucro liquido tira custo e imposto", Number(lucroLiquido(100, 40).toFixed(2)), 54);
conferir("margem sobre o preco", Number(calcularMargem(100, 40).toFixed(1)), 54);
conferir("sem custo nao ha margem", [lucroLiquido(100, null), calcularMargem(100, 0)], [null, null]);
conferir("sem preco nao ha margem", calcularMargem(0, 40), null);
conferir("abaixo do custo e vermelho", corDaMargem(30, 40), "text-red-600");
conferir("margem baixa e amarela", corDaMargem(100, 40), "text-yellow-600");
conferir("margem alta e verde", corDaMargem(100, 10), "text-emerald-600");
conferir("sem dado fica neutra", corDaMargem(100, null), "text-suave");

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

console.log("\nGravacao (banco)");

async function limpar() {
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-EDIT-" } } });
}
await limpar();

try {
  const produto = await prisma.produto.create({
    data: { sku: "ZZ-EDIT-1", tituloBase: "Produto de teste da edicao rapida", estoque: 5, localizacao: "Z9" },
  });
  const id = produto.id;
  const ler = () => prisma.produto.findUnique({ where: { id } });
  const movimentos = () => prisma.movimentoEstoque.findMany({ where: { produtoId: id }, orderBy: { criadoEm: "asc" } });

  // Localizacao.
  conferir("localizacao: grava e apara", [(await gravarLocalizacao(id, "  R14  ")).ok, (await ler()).localizacao], [true, "R14"]);
  conferir("localizacao: vazio limpa", [(await gravarLocalizacao(id, "   ")).ok, (await ler()).localizacao], [true, null]);
  conferir("localizacao: passa de 40 caracteres", (await gravarLocalizacao(id, "x".repeat(41))).ok, false);
  conferir("localizacao: produto que nao existe", (await gravarLocalizacao("nao-existe", "A1")).erro, "Produto nao encontrado. Ele pode ter sido excluido.");

  // Preco.
  conferir("preco: virgula decimal", [(await gravarPrecoVenda(id, "90,50")).ok, Number((await ler()).precoVenda)], [true, 90.5]);
  conferir("preco: numero", [(await gravarPrecoVenda(id, 12.9)).ok, Number((await ler()).precoVenda)], [true, 12.9]);
  conferir("preco: arredonda em duas casas", (await gravarPrecoVenda(id, "10.999"), Number((await ler()).precoVenda)), 11);
  for (const ruim of ["", "abc", "0", "-5", "10000000", null]) {
    conferir(`preco: recusa ${JSON.stringify(ruim)}`, (await gravarPrecoVenda(id, ruim)).ok, false);
  }
  conferir("preco: o recusado nao mexeu no valor", Number((await ler()).precoVenda), 11);

  // Estoque.
  const entrada = await gravarAjusteDeEstoque(id, { tipo: "ENTRADA", quantidade: 3, motivo: "Compra de fornecedor", observacao: " NF 1234 " });
  conferir("entrada: soma ao saldo", [entrada.ok, entrada.saldoAnterior, entrada.saldoNovo, (await ler()).estoque], [true, 5, 8, 8]);

  const saidaGrande = await gravarAjusteDeEstoque(id, { tipo: "SAIDA", quantidade: 10 });
  conferir("saida maior que o saldo: recusada", [saidaGrande.ok, saidaGrande.erro], [false, "A saida (10) e maior que o saldo (8)."]);
  conferir("e o saldo nao mudou", (await ler()).estoque, 8);
  conferir("e nao gravou movimento", (await movimentos()).length, 1);

  const saida = await gravarAjusteDeEstoque(id, { tipo: "SAIDA", quantidade: 8, motivo: "Perda ou avaria" });
  conferir("saida ate zerar", [saida.ok, saida.saldoNovo, (await ler()).estoque], [true, 0, 0]);

  const balanco = await gravarAjusteDeEstoque(id, { tipo: "BALANCO", quantidade: "12", motivo: "Contagem de inventario" });
  conferir("balanco define o saldo (quantidade em texto)", [balanco.ok, balanco.saldoAnterior, balanco.saldoNovo], [true, 0, 12]);
  const balancoIgual = await gravarAjusteDeEstoque(id, { tipo: "BALANCO", quantidade: 12 });
  conferir("balanco que confirma o mesmo numero tambem fica no historico", [balancoIgual.ok, (await movimentos()).length], [true, 4]);
  conferir("balanco pode zerar", [(await gravarAjusteDeEstoque(id, { tipo: "BALANCO", quantidade: 0 })).ok, (await ler()).estoque], [true, 0]);

  const historico = await movimentos();
  conferir(
    "historico: tipo, quantidade e saldos, na ordem",
    historico.slice(0, 3).map((m) => [m.tipo, m.quantidade, m.saldoAnterior, m.saldoNovo]),
    [["ENTRADA", 3, 5, 8], ["SAIDA", 8, 8, 0], ["BALANCO", 12, 0, 12]],
  );
  conferir("historico: motivo e observacao aparada", [historico[0].motivo, historico[0].observacao], ["Compra de fornecedor", "NF 1234"]);
  conferir("historico: sem motivo fica nulo", [historico[3].motivo, historico[3].observacao], [null, null]);

  const antes = (await ler()).estoque;
  const recusas = [
    ["quantidade vazia", { tipo: "ENTRADA", quantidade: "" }],
    ["quantidade nula", { tipo: "ENTRADA", quantidade: null }],
    ["quantidade com casa decimal", { tipo: "ENTRADA", quantidade: 1.5 }],
    ["quantidade negativa", { tipo: "ENTRADA", quantidade: -1 }],
    ["quantidade em texto", { tipo: "ENTRADA", quantidade: "abc" }],
    ["entrada de zero", { tipo: "ENTRADA", quantidade: 0 }],
    ["saida de zero", { tipo: "SAIDA", quantidade: 0 }],
    ["acima do limite", { tipo: "ENTRADA", quantidade: MAXIMO_ESTOQUE + 1 }],
    ["tipo inventado", { tipo: "VENDA", quantidade: 1 }],
    ["motivo de outra operacao", { tipo: "ENTRADA", quantidade: 1, motivo: "Perda ou avaria" }],
    ["observacao comprida", { tipo: "ENTRADA", quantidade: 1, observacao: "x".repeat(201) }],
  ];
  for (const [nome, dados] of recusas) {
    conferir(`recusa: ${nome}`, (await gravarAjusteDeEstoque(id, dados)).ok, false);
  }
  conferir("nenhuma recusa mexeu no saldo nem no historico", [(await ler()).estoque, (await movimentos()).length], [antes, 5]);
  conferir("produto que nao existe", (await gravarAjusteDeEstoque("nao-existe", { tipo: "ENTRADA", quantidade: 1 })).erro, "Produto nao encontrado. Ele pode ter sido excluido.");

  await gravarAjusteDeEstoque(id, { tipo: "BALANCO", quantidade: MAXIMO_ESTOQUE });
  const estouro = await gravarAjusteDeEstoque(id, { tipo: "ENTRADA", quantidade: 1 });
  conferir("entrada que passa do limite e recusada", [estouro.ok, (await ler()).estoque], [false, MAXIMO_ESTOQUE]);

  // Concorrencia: 20 saidas de 1 sobre um saldo de 10. Sem a trava da linha, varias
  // leriam o mesmo saldo e o estoque ficaria errado ou negativo.
  await gravarAjusteDeEstoque(id, { tipo: "BALANCO", quantidade: 10 });
  const antesDaCorrida = (await movimentos()).length;
  const corrida = await Promise.all(
    Array.from({ length: 20 }, () => gravarAjusteDeEstoque(id, { tipo: "SAIDA", quantidade: 1 })),
  );
  const deram = corrida.filter((r) => r.ok).length;
  conferir("20 saidas simultaneas: so as 10 que cabem passam", [deram, (await ler()).estoque], [10, 0]);
  const daCorrida = (await movimentos()).slice(antesDaCorrida);
  conferir("cada saida guardou o saldo que viu, sem repetir", daCorrida.map((m) => m.saldoNovo).sort((a, b) => b - a), [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]);

  // Excluir o produto leva o historico junto.
  await prisma.produto.delete({ where: { id } });
  conferir("excluir o produto apaga o historico dele", await prisma.movimentoEstoque.count({ where: { produtoId: id } }), 0);
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTodos os testes de estoque OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);
