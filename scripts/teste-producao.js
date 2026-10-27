import "dotenv/config";

/**
 * Testes das pecas proprias e da ordem de producao (spec 2026-10-26-producao-pecas-proprias-design.md): regras
 * puras, custo pelas pecas, Salvar do cadastro e a ordem contra um Bling falso. SEM rede.
 *
 *   npm run teste:producao
 *
 * So escreve produtos ZZ-PROD-* (e as ordens deles), apagados no comeco e no fim.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const {
  custoDasPecas,
  corDoEstoque,
  textoDoEstoque,
  validarPecas,
  quantidadeTotalDaPeca,
  faltasParaBaixa,
  numeroDaOrdem,
  podeIrPara,
  validarQuantidadeProduzida,
} = await import("../src/lib/producao/regras.js");

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

console.log("\nRegras da producao");
conferir("custo total", custoDasPecas([{ custo: 10, quantidade: 2 }, { custo: 1.5, quantidade: 0.5 }]), { total: 20.75, incompleto: false });
conferir("custo incompleto", custoDasPecas([{ custo: 10, quantidade: 1 }, { custo: null, quantidade: 1 }]), { total: null, incompleto: true });
conferir("custo lista vazia", custoDasPecas([]), { total: 0, incompleto: false });
conferir("cor zero", corDoEstoque({ estoque: 0, estoqueMinimo: 5 }), "vermelho");
conferir("cor negativo", corDoEstoque({ estoque: -2, estoqueMinimo: null }), "vermelho");
conferir("cor abaixo", corDoEstoque({ estoque: 3, estoqueMinimo: 5 }), "amarelo");
conferir("cor ok", corDoEstoque({ estoque: 5, estoqueMinimo: 5 }), "verde");
conferir("cor sem minimo", corDoEstoque({ estoque: 1, estoqueMinimo: null }), "verde");
conferir(
  "texto",
  textoDoEstoque({ estoque: 0, estoqueMinimo: 2, estoqueMaximo: 3 }),
  { titulo: "Estoque do produto vazio", linhas: ["Estoque atual: 0", "Estoque mínimo: 2", "Estoque máximo: 3"] },
);
conferir("texto sem minimo", textoDoEstoque({ estoque: 4, estoqueMinimo: null, estoqueMaximo: null }), { titulo: "Estoque ok", linhas: ["Estoque atual: 4"] });
conferir("texto abaixo", textoDoEstoque({ estoque: 1, estoqueMinimo: 2, estoqueMaximo: null }).titulo, "Estoque abaixo do mínimo");
conferir("total arredonda para cima", quantidadeTotalDaPeca(0.5, 3), 2);
conferir("total inteiro", quantidadeTotalDaPeca(2, 3), 6);
conferir("total sem erro de ponto flutuante", quantidadeTotalDaPeca(0.1, 30), 3);
conferir(
  "faltas",
  faltasParaBaixa(
    [
      { componenteId: "a", sku: "1", descricao: "A", quantidadeTotal: 4 },
      { componenteId: null, sku: null, descricao: "cola", quantidadeTotal: 1 },
      { componenteId: "b", sku: "2", descricao: "B", quantidadeTotal: 1 },
    ],
    new Map([["a", 3], ["b", 5]]),
  ),
  [{ sku: "1", descricao: "A", necessario: 4, disponivel: 3 }],
);
conferir("valida peca manual sem custo", validarPecas([{ descricao: "x", quantidade: 1 }]).ok, false);
conferir("valida peca manual", validarPecas([{ descricao: " cola ", custoManual: "1,50", quantidade: "0,5" }]), {
  ok: true,
  pecas: [{ componenteId: null, descricao: "cola", custoManual: 1.5, quantidade: 0.5, ordem: 0 }],
});
conferir("valida repetida", validarPecas([{ componenteId: "a", quantidade: 1 }, { componenteId: "a", quantidade: 2 }]).ok, false);
conferir("valida proprio", validarPecas([{ componenteId: "eu", quantidade: 1 }], "eu").ok, false);
conferir("valida quantidade zero", validarPecas([{ componenteId: "a", quantidade: 0 }]).ok, false);
conferir("valida 4 casas", validarPecas([{ componenteId: "a", quantidade: "0.0001" }]).ok, false);
conferir("valida acima de 50", validarPecas(Array.from({ length: 51 }, (_, i) => ({ componenteId: `p${i}`, quantidade: 1 }))).ok, false);
conferir("numero", numeroDaOrdem(7), "OP-0007");
conferir(
  "transicoes",
  [podeIrPara("ABERTA", "CONCLUIDA"), podeIrPara("EM_PRODUCAO", "CONCLUIDA"), podeIrPara("CONCLUIDA", "CANCELADA"), podeIrPara("ABERTA", "EM_PRODUCAO")],
  [false, true, false, true],
);
conferir("produzida acima", validarQuantidadeProduzida("4", 3).ok, false);
conferir("produzida zero", validarQuantidadeProduzida("0", 3).ok, false);
conferir("produzida ok", validarQuantidadeProduzida("2", 3), { ok: true, quantidade: 2 });

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

const { prisma } = await import("../src/lib/db.js");
const { custoDoProduto } = await import("../src/lib/canaisDeVenda/custo.js");
const { gravarPecasProprias, lerPecasDoProduto, recalcularCustoDosProdutosQueUsam, buscarPecasProprias } = await import(
  "../src/lib/producao/pecas.js"
);
const { ajustarEstoqueNaTransacao } = await import("../src/lib/ajusteRapido.js");

const ZZ = { sku: { startsWith: "ZZ-PROD" } };
async function limpar() {
  await prisma.ordemDeProducao.deleteMany({ where: { produto: ZZ } });
  await prisma.pecaPropriaDoProduto.deleteMany({ where: { OR: [{ produto: ZZ }, { componente: ZZ }] } });
  await prisma.produtoComponente.deleteMany({ where: { OR: [{ kit: ZZ }, { componente: ZZ }] } });
  await prisma.produto.deleteMany({ where: ZZ });
}
function criarProduto(sku, dados = {}) {
  return prisma.produto.create({ data: { sku, tituloBase: `Produto ${sku}`, ...dados } });
}

try {
  await limpar();

  console.log("\nCusto pelas pecas e trava da entrada");
  conferir(
    "custoDoProduto pecas",
    custoDoProduto({ pecasProprias: true, custo: 12.5, fornecedores: [{ padrao: true, precoCusto: 99 }] }),
    { valor: 12.5, origem: "peças próprias" },
  );
  conferir(
    "custoDoProduto pecas incompleto",
    custoDoProduto({ pecasProprias: true, custo: null, fornecedores: [{ padrao: true, precoCusto: 99 }] }).valor,
    null,
  );

  const a = await criarProduto("ZZ-PROD-A", { custo: 10, estoque: 10, estoqueMinimo: 2 });
  const b = await criarProduto("ZZ-PROD-B", { estoque: 5 });
  const final = await criarProduto("ZZ-PROD-FINAL", { custo: 99 });

  await prisma.$transaction((tx) =>
    gravarPecasProprias(tx, final.id, {
      pecasProprias: true,
      pecas: [
        { componenteId: a.id, descricao: null, custoManual: null, quantidade: 2, ordem: 0 },
        { componenteId: null, descricao: "cola", custoManual: 1, quantidade: 1, ordem: 1 },
      ],
    }),
  );
  let lido = await prisma.produto.findUnique({ where: { id: final.id } });
  conferir("custo gravado", [lido.pecasProprias, Number(lido.custo)], [true, 21]);
  const pecas = await lerPecasDoProduto(final.id);
  conferir("le as pecas", pecas.map((peca) => [peca.sku, peca.nome, peca.custo, peca.quantidade, peca.estoqueMinimo]), [
    ["ZZ-PROD-A", "Produto ZZ-PROD-A", 10, 2, 2],
    [null, "cola", 1, 1, null],
  ]);

  await prisma.produto.update({ where: { id: a.id }, data: { custo: 15 } });
  const antes = (await prisma.produto.findUnique({ where: { id: final.id } })).atualizadoEm;
  conferir("recalcula quem usa", await recalcularCustoDosProdutosQueUsam(a.id), 1);
  lido = await prisma.produto.findUnique({ where: { id: final.id } });
  conferir("custo da peca muda", Number(lido.custo), 31);
  conferir("atualizadoEm nao sobe", lido.atualizadoEm.getTime(), antes.getTime());

  // Peca sem custo (B) deixa o total incompleto: custo nulo, sem cair no fornecedor.
  await prisma.$transaction((tx) =>
    gravarPecasProprias(tx, final.id, {
      pecasProprias: true,
      pecas: [{ componenteId: b.id, descricao: null, custoManual: null, quantidade: 1, ordem: 0 }],
    }),
  );
  conferir("peca sem custo zera", (await prisma.produto.findUnique({ where: { id: final.id } })).custo, null);

  const buscados = await buscarPecasProprias("ZZ-PROD", [final.id, b.id]);
  conferir("busca sem o proprio e os da lista", buscados.map((peca) => peca.sku), ["ZZ-PROD-A"]);

  const ajustar = (dados) => prisma.$transaction((tx) => ajustarEstoqueNaTransacao(tx, final.id, dados));
  conferir("entrada manual recusada", (await ajustar({ tipo: "ENTRADA", quantidade: 1 })).erro, "A entrada deste produto vem da ordem de produção.");
  conferir("entrada pela ordem", (await ajustar({ tipo: "ENTRADA", quantidade: 1, motivo: "Produção", ordemDeProducao: true })).ok, true);
  conferir("saida manual continua", (await ajustar({ tipo: "SAIDA", quantidade: 1 })).ok, true);

  await prisma.$transaction((tx) => gravarPecasProprias(tx, final.id, { pecasProprias: false, pecas: [] }));
  lido = await prisma.produto.findUnique({ where: { id: final.id } });
  conferir("desligar apaga e libera a entrada", [lido.pecasProprias, await prisma.pecaPropriaDoProduto.count({ where: { produtoId: final.id } })], [false, 0]);
  conferir("entrada manual volta", (await ajustar({ tipo: "ENTRADA", quantidade: 1 })).ok, true);

  console.log("\nSalvar do cadastro");
  const { prepararPecasDoCadastro, produtosQueUsamComoPeca } = await import("../src/lib/producao/pecas.js");
  const { dadosParaClone } = await import("../src/lib/produtoParaFormulario.js");
  const { montarRascunho, lerRascunho } = await import("../src/lib/rascunhoDoCadastro.js");
  const kitProduto = await criarProduto("ZZ-PROD-KITX", { tipo: "COMPOSICAO" });
  const campo = (valor) => JSON.stringify(valor);

  conferir("sem o campo mantem", await prepararPecasDoCadastro({ produtoId: final.id, tipo: "SIMPLES", campo: null }), { ok: true, gravar: null });
  conferir(
    "desligado apaga",
    await prepararPecasDoCadastro({ produtoId: final.id, tipo: "SIMPLES", campo: campo({ ligado: false, pecas: [{ componenteId: a.id, quantidade: 1 }] }) }),
    { ok: true, gravar: { pecasProprias: false, pecas: [] } },
  );
  const ligado = await prepararPecasDoCadastro({
    produtoId: final.id,
    tipo: "SIMPLES",
    campo: campo({ ligado: true, pecas: [{ componenteId: a.id, quantidade: "2" }, { descricao: "cola", custoManual: "1", quantidade: "1" }] }),
  });
  conferir("ligado confere", [ligado.ok, ligado.gravar?.pecas.length], [true, 2]);
  conferir(
    "kit recusa",
    (await prepararPecasDoCadastro({ produtoId: final.id, tipo: "COMPOSICAO", campo: campo({ ligado: true, pecas: [] }) })).ok,
    false,
  );
  conferir(
    "kit como peca recusa",
    (await prepararPecasDoCadastro({ produtoId: final.id, tipo: "SIMPLES", campo: campo({ ligado: true, pecas: [{ componenteId: kitProduto.id, quantidade: 1 }] }) })).erro,
    "O kit ZZ-PROD-KITX não pode ser peça própria.",
  );
  conferir(
    "peca excluida recusa",
    (await prepararPecasDoCadastro({ produtoId: final.id, tipo: "SIMPLES", campo: campo({ ligado: true, pecas: [{ componenteId: "nao-existe", quantidade: 1 }] }) })).ok,
    false,
  );
  conferir("json quebrado recusa", (await prepararPecasDoCadastro({ produtoId: final.id, tipo: "SIMPLES", campo: "{" })).ok, false);

  await prisma.$transaction((tx) => gravarPecasProprias(tx, final.id, ligado.gravar));
  conferir("excluir peca usada", await produtosQueUsamComoPeca(a.id), ["ZZ-PROD-FINAL"]);
  let excluiu = true;
  try {
    await prisma.produto.delete({ where: { id: a.id } });
  } catch {
    excluiu = false;
  }
  conferir("banco recusa excluir peca (Restrict)", excluiu, false);

  const clone = dadosParaClone({
    produto: { id: final.id, sku: "ZZ-PROD-FINAL", tituloBase: "x", tipo: "SIMPLES", pecasProprias: true, pecas: await lerPecasDoProduto(final.id) },
    fornecedores: [],
    concorrentes: [],
  });
  conferir("clone leva pecas sem id", [clone.pecas.length, clone.pecas.every((peca) => !("id" in peca)), clone.campos.pecasProprias], [2, true, true]);

  const rascunho = lerRascunho(
    JSON.stringify(montarRascunho({ campos: { tituloBase: "x" }, estado: { pecasProprias: { ligado: true, pecas: [{ descricao: "cola" }] } } })),
  );
  conferir("rascunho guarda pecas proprias", rascunho?.pecasProprias, { ligado: true, pecas: [{ descricao: "cola" }] });

  // (proximos blocos)
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
