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
  casasDaUnidade,
  casasDaPeca,
  quantidadeCabe,
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
conferir("valida 3 casas", validarPecas([{ componenteId: "a", quantidade: "0.001" }]).ok, false);
conferir("valida 2 casas", validarPecas([{ componenteId: "a", quantidade: "1,25" }]).ok, true);
conferir("casas por unidade", [casasDaUnidade("UN"), casasDaUnidade("KIT"), casasDaUnidade("MT"), casasDaUnidade("HR"), casasDaUnidade(null)], [0, 0, 2, 2, 0]);
conferir("casas da peca", [casasDaPeca({ componenteId: "a", unidade: "UN" }), casasDaPeca({ componenteId: "a", unidade: "MT" }), casasDaPeca({ componenteId: null })], [0, 2, 2]);
conferir("quantidade cabe na unidade", [quantidadeCabe(2, 0), quantidadeCabe(1.5, 0), quantidadeCabe(1.25, 2)], [true, false, true]);
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
    { valor: 12.5, origem: "lista personalizada" },
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
    "O kit ZZ-PROD-KITX não pode entrar na lista personalizada.",
  );
  conferir(
    "peca excluida recusa",
    (await prepararPecasDoCadastro({ produtoId: final.id, tipo: "SIMPLES", campo: campo({ ligado: true, pecas: [{ componenteId: "nao-existe", quantidade: 1 }] }) })).ok,
    false,
  );
  conferir(
    "peca em UN recusa quantidade quebrada",
    (await prepararPecasDoCadastro({ produtoId: final.id, tipo: "SIMPLES", campo: campo({ ligado: true, pecas: [{ componenteId: a.id, quantidade: "1,5" }] }) })).erro,
    "ZZ-PROD-A é vendido em UN: a quantidade tem de ser inteira.",
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

  console.log("\nOrdem de producao");
  const ordem = await import("../src/lib/producao/banco.js");
  const { criarBlingFalso } = await import("./lib/blingFalso.js");
  const noBling = (codigo, id) => ({ id, codigo, nome: `Produto ${codigo}`, preco: 10, situacao: "A", formato: "S", tipo: "P" });
  const skusNoBling = ["ZZ-PROD-A", "ZZ-PROD-B", "ZZ-PROD-FINAL"];
  const novoFalso = (liberados = skusNoBling) =>
    criarBlingFalso({
      produtos: skusNoBling.map((sku, indice) => noBling(sku, 15000000950 + indice)),
      saldos: { "ZZ-PROD-A": 10, "ZZ-PROD-B": 5, "ZZ-PROD-FINAL": 0 },
      codigosLiberados: liberados,
    });
  let falso = novoFalso();
  const estoqueDe = async (id) => (await prisma.produto.findUnique({ where: { id } })).estoque;

  // FINAL = A x 2 + B x 0,5 + cola (manual). A com 10, B com 5, FINAL com o que sobrou do bloco anterior.
  await prisma.produto.updateMany({ where: { id: { in: [a.id, b.id] } }, data: { blingSaldo: null } });
  await prisma.produto.update({ where: { id: a.id }, data: { estoque: 10 } });
  await prisma.produto.update({ where: { id: b.id }, data: { estoque: 5 } });
  await prisma.produto.update({ where: { id: final.id }, data: { estoque: 0 } });
  // Os ajustes dos blocos de cima ja contam como enviados: o Bling falso comeca com os saldos daqui.
  await prisma.movimentoEstoque.updateMany({ where: { produtoId: { in: [a.id, b.id, final.id] } }, data: { enviadoAoBlingEm: new Date() } });
  await prisma.$transaction((tx) =>
    gravarPecasProprias(tx, final.id, {
      pecasProprias: true,
      pecas: [
        { componenteId: a.id, descricao: null, custoManual: null, quantidade: 2, ordem: 0 },
        { componenteId: b.id, descricao: null, custoManual: null, quantidade: 0.5, ordem: 1 },
        { componenteId: null, descricao: "cola", custoManual: 1, quantidade: 1, ordem: 2 },
      ],
    }),
  );
  // Um kit que usa a peca A: a baixa de A recalcula o estoque dele na mesma transacao.
  const kit = await criarProduto("ZZ-PROD-KIT", { tipo: "COMPOSICAO", estoque: 10 });
  await prisma.produtoComponente.create({ data: { kitId: kit.id, componenteId: a.id, quantidade: 1, ordem: 0 } });

  conferir("sem pecas proprias nao cria", (await ordem.criarOrdem(a.id, { quantidade: 1 })).ok, false);
  conferir("quantidade invalida nao cria", (await ordem.criarOrdem(final.id, { quantidade: 0 })).ok, false);
  const criada = await ordem.criarOrdem(final.id, { quantidade: 3, observacao: "lote teste" });
  conferir("cria ordem", [criada.ok, /^OP-\d{4,}$/.test(criada.numero)], [true, true]);
  let lida = await ordem.lerOrdem(criada.id);
  conferir(
    "copia as pecas",
    lida.itens.map((item) => [item.sku, item.descricao, item.quantidadePorUnidade, item.quantidadeTotal, item.custoUnitario]),
    [
      ["ZZ-PROD-A", "Produto ZZ-PROD-A", 2, 6, 15],
      ["ZZ-PROD-B", "Produto ZZ-PROD-B", 0.5, 2, null],
      [null, "cola", 1, 3, 1],
    ],
  );
  conferir("situacao aberta", lida.situacao, "ABERTA");

  // Mudar as pecas do produto depois nao muda a ordem.
  await prisma.$transaction((tx) =>
    gravarPecasProprias(tx, final.id, { pecasProprias: true, pecas: [{ componenteId: a.id, descricao: null, custoManual: null, quantidade: 9, ordem: 0 }] }),
  );
  conferir("ordem antiga intacta", (await ordem.lerOrdem(criada.id)).itens.length, 3);

  // Falta de estoque: A precisa de 6 e tem 4. Recusa inteira, nenhum movimento.
  await prisma.produto.update({ where: { id: a.id }, data: { estoque: 4 } });
  const movimentosAntes = await prisma.movimentoEstoque.count({ where: { produtoId: { in: [a.id, b.id] } } });
  let resultado = await ordem.darBaixa(criada.id, { cliente: falso });
  conferir("baixa recusa falta", [resultado.ok, resultado.faltas], [false, [{ sku: "ZZ-PROD-A", descricao: "Produto ZZ-PROD-A", necessario: 6, disponivel: 4 }]]);
  conferir("nada baixado", [await estoqueDe(a.id), await estoqueDe(b.id), await prisma.movimentoEstoque.count({ where: { produtoId: { in: [a.id, b.id] } } })], [4, 5, movimentosAntes]);

  await prisma.produto.update({ where: { id: a.id }, data: { estoque: 10 } });
  resultado = await ordem.darBaixa(criada.id, { cliente: falso });
  conferir("baixa", [resultado.ok, await estoqueDe(a.id), await estoqueDe(b.id)], [true, 4, 3]);
  conferir("bling da baixa", resultado.bling.map((item) => [item.sku, item.ok]), [["ZZ-PROD-A", true], ["ZZ-PROD-B", true]]);
  conferir("bling falso acompanha", [falso.saldo("ZZ-PROD-A"), falso.saldo("ZZ-PROD-B")], [4, 3]);
  const saida = await prisma.movimentoEstoque.findFirst({ where: { produtoId: a.id }, orderBy: { criadoEm: "desc" } });
  conferir("movimento de saida", [saida.tipo, saida.quantidade, saida.motivo, saida.observacao], ["SAIDA", 6, "Produção", criada.numero]);
  conferir("kit recalculado", await estoqueDe(kit.id), 4);
  lida = await ordem.lerOrdem(criada.id);
  conferir("em producao", [lida.situacao, Boolean(lida.baixaEm), lida.itens.filter((item) => item.saidaMovimentoId).length], ["EM_PRODUCAO", true, 2]);

  conferir("clique duplo", (await ordem.darBaixa(criada.id, { cliente: falso })).erro, "Só uma ordem aberta recebe a baixa.");
  conferir("concluir acima recusa", (await ordem.concluir(criada.id, 4, { cliente: falso })).ok, false);
  resultado = await ordem.concluir(criada.id, 2, { cliente: falso });
  conferir("concluir", [resultado.ok, await estoqueDe(final.id), falso.saldo("ZZ-PROD-FINAL")], [true, 2, 2]);
  lida = await ordem.lerOrdem(criada.id);
  conferir("concluida", [lida.situacao, lida.quantidadeProduzida, Boolean(lida.entradaMovimentoId)], ["CONCLUIDA", 2, true]);
  conferir("cancelar concluida recusa", (await ordem.cancelar(criada.id, { cliente: falso })).ok, false);

  // Concluir sem baixa recusa; cancelar aberta nao mexe em estoque.
  await prisma.$transaction((tx) =>
    gravarPecasProprias(tx, final.id, { pecasProprias: true, pecas: [{ componenteId: a.id, descricao: null, custoManual: null, quantidade: 1, ordem: 0 }] }),
  );
  const segunda = await ordem.criarOrdem(final.id, { quantidade: 2 });
  conferir("concluir sem baixa recusa", (await ordem.concluir(segunda.id, 2, { cliente: falso })).ok, false);
  conferir("cancelar aberta", [(await ordem.cancelar(segunda.id, { cliente: falso })).ok, await estoqueDe(a.id)], [true, 4]);

  // Cancelar depois da baixa devolve as pecas.
  const terceira = await ordem.criarOrdem(final.id, { quantidade: 2 });
  await ordem.darBaixa(terceira.id, { cliente: falso });
  conferir("baixou 2", await estoqueDe(a.id), 2);
  resultado = await ordem.cancelar(terceira.id, { cliente: falso });
  conferir("cancelar devolve", [resultado.ok, await estoqueDe(a.id), (await ordem.lerOrdem(terceira.id)).situacao], [true, 4, "CANCELADA"]);
  const devolucao = await prisma.movimentoEstoque.findFirst({ where: { produtoId: a.id }, orderBy: { criadoEm: "desc" } });
  conferir("movimento de devolucao", [devolucao.tipo, devolucao.motivo], ["ENTRADA", "Produção cancelada"]);

  // Bling recusa: a baixa fica no Rise, pendente, e o aviso volta.
  falso = novoFalso(["OUTRO"]);
  const quarta = await ordem.criarOrdem(final.id, { quantidade: 1 });
  resultado = await ordem.darBaixa(quarta.id, { cliente: falso });
  conferir("bling recusa deixa pendente", [resultado.ok, resultado.bling[0].ok, await estoqueDe(a.id)], [true, false, 3]);
  const pendente = await prisma.movimentoEstoque.findFirst({ where: { produtoId: a.id }, orderBy: { criadoEm: "desc" } });
  conferir("movimento pendente", pendente.enviadoAoBlingEm, null);

  const lista = await ordem.listarOrdens({ busca: "ZZ-PROD-FINAL" });
  conferir("lista as ordens", lista.ordens.length, 4);
  conferir("conta por situacao", (await ordem.contarPorSituacao()).CONCLUIDA >= 1, true);

  // (proximos blocos)
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas ? `\n${falhas} falha(s).` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
