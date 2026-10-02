import "dotenv/config";

/**
 * Testes do Canais de Venda / Mercado Livre (fase 1): o banco (varios anuncios por
 * produto, dados do anuncio, configuracao do canal, versiculos) e, nas tarefas
 * seguintes, as regras puras e as acoes. Usa o Postgres, SEM rede.
 *
 *   npm run teste:anuncios-ml
 *
 * Os produtos de teste levam SKU "ZZ-ML-..." e sao apagados no comeco de cada bloco
 * e no fim, com os anuncios deles (Cascade).
 *
 * Como ampliar: cada tarefa acrescenta UM bloco `{ ... }` dentro do try, antes do
 * comentario "Blocos das tarefas seguintes". O bloco abre com um console.log do titulo
 * e, se mexe no banco, com `await limpar()`.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const { prisma } = await import("../src/lib/db.js");
const {
  codigoDaComposicao,
  unidadesDaComposicao,
  errosDaComposicao,
  custoDaComposicao,
  estoqueDaComposicao,
  pesoDaComposicao,
  blocoItensInclusos,
  trocarItensInclusos,
  proximoCodigoDaFaixa,
} = await import("../src/lib/canaisDeVenda/composicao.js");
const { custoDoProduto } = await import("../src/lib/canaisDeVenda/custo.js");
const {
  referenciaDoVersiculo,
  linhaDoVersiculo,
  contarVersiculos,
  errosDoVersiculo,
  podeAcrescentar,
  cabeNaDescricao,
  sortearVersiculo,
} = await import("../src/lib/canaisDeVenda/versiculos.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

// O banco e o de verdade (compartilhado), entao so se apaga o que o teste criou.
async function limpar() {
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-ML-" } } });
}

try {
  {
    console.log("\nBanco: anuncios por canal");
    await limpar();

    const p = await prisma.produto.create({ data: { sku: "ZZ-ML-1", tituloBase: "Produto de teste ML", conferido: true } });
    await prisma.anuncio.create({ data: { produtoId: p.id, canal: "MERCADO_LIVRE", dados: { tipoAnuncio: "gold_special" } } });
    await prisma.anuncio.create({ data: { produtoId: p.id, canal: "MERCADO_LIVRE", dados: { tipoAnuncio: "gold_pro" } } });
    conferir("dois anuncios ML do mesmo produto", await prisma.anuncio.count({ where: { produtoId: p.id, canal: "MERCADO_LIVRE" } }), 2);

    // O Bling guarda um anuncio por produto: o indice parcial do SQL e quem garante isso.
    await prisma.anuncio.create({ data: { produtoId: p.id, canal: "BLING" } });
    let recusado = false;
    try {
      await prisma.anuncio.create({ data: { produtoId: p.id, canal: "BLING" } });
    } catch (e) {
      recusado = e.code === "P2002";
    }
    conferir("Bling continua com um anuncio por produto", recusado, true);

    conferir(
      "dados volta como JSON",
      (await prisma.anuncio.findFirst({ where: { produtoId: p.id, canal: "MERCADO_LIVRE" }, orderBy: { criadoEm: "asc" } })).dados,
      { tipoAnuncio: "gold_special" },
    );
  }

  {
    console.log("\nComposicao e custo");

    const itens = [{ produtoId: "a", quantidade: 2 }, { produtoId: "b", quantidade: 3 }];
    conferir("codigo de um produto so", codigoDaComposicao("100101", 5), "100101_5");
    conferir("milhar com ponto, como no Bling", codigoDaComposicao("920302", 1000), "920302_1.000");
    conferir("unidades somam os itens", unidadesDaComposicao(itens), 5);
    conferir("composicao valida", errosDaComposicao(itens), []);
    conferir("quantidade fora do normal", ["0", -1, 2.5, "abc", "", 10000].map((q) => errosDaComposicao([{ produtoId: "a", quantidade: q }, { produtoId: "b", quantidade: 1 }])[0]),
      Array(6).fill("Item 1: a quantidade deve ser um numero inteiro de 1 a 9999."));
    conferir("menos de 2 unidades", errosDaComposicao([{ produtoId: "a", quantidade: 1 }]), ["A composicao precisa de ao menos 2 unidades."]);
    conferir("produto repetido", errosDaComposicao([{ produtoId: "a", quantidade: 1 }, { produtoId: "a", quantidade: 1 }]), ["O mesmo produto aparece em mais de um item."]);
    conferir("sem itens", errosDaComposicao([]), ["Inclua ao menos um produto na composicao."]);
    conferir("custo soma quantidade x custo", custoDaComposicao(itens, { a: 10, b: 1.5 }), { valor: 24.5, faltando: [] });
    conferir("custo some quando falta um", custoDaComposicao(itens, { a: 10, b: null }), { valor: null, faltando: ["b"] });
    conferir("estoque e o menor inteiro", estoqueDaComposicao(itens, { a: 9, b: 7 }), 2);
    conferir("estoque negativo conta como zero", estoqueDaComposicao(itens, { a: -4, b: 7 }), 0);
    conferir("peso soma peso x quantidade", pesoDaComposicao([{ produtoId: "a", quantidade: 2 }], { a: 0.055 }), 0.11);
    conferir("peso some quando falta um", pesoDaComposicao(itens, { a: 0.1, b: null }), null);
    conferir("bloco de itens inclusos", blocoItensInclusos("100101_5", [{ produtoId: "a", quantidade: 5 }], { a: "Resistor 1K 1/4W" }),
      "Itens inclusos: (Cod:100101_5)\n- 05 Resistor 1K 1/4W;");
    const comSecao = "TITULO\n\nTexto.\n\nItens inclusos: (Cod:100101)\n- 01 Resistor;\n\nGarantia:\n- 90 dias;";
    conferir("troca a secao existente", trocarItensInclusos(comSecao, "Itens inclusos: (Cod:K1)\n- 02 X;"),
      "TITULO\n\nTexto.\n\nItens inclusos: (Cod:K1)\n- 02 X;\n\nGarantia:\n- 90 dias;");
    conferir("sem secao, entra antes da Garantia", trocarItensInclusos("Texto.\n\nGarantia:\n- 90 dias;", "Itens inclusos:\n- 02 X;"),
      "Texto.\n\nItens inclusos:\n- 02 X;\n\nGarantia:\n- 90 dias;");
    conferir("sem secao nem Garantia, vai no fim", trocarItensInclusos("Texto.", "Itens inclusos:\n- 02 X;"), "Texto.\n\nItens inclusos:\n- 02 X;");
    conferir("proximo da faixa 25xxxx", proximoCodigoDaFaixa(["250001", "250010", "100101", "250010_5"]), "250011");
    conferir("faixa vazia comeca em 250001", proximoCodigoDaFaixa([]), "250001");
    conferir("faixa cheia", proximoCodigoDaFaixa(["259999"]), null);
    conferir("custo do fornecedor padrao", custoDoProduto({ fornecedores: [{ padrao: false, precoCusto: 3 }, { padrao: true, precoCusto: 12.5 }], fornecedorRascunho: { precoCusto: 9 }, custo: 7 }), { valor: 12.5, origem: "fornecedor padrao" });
    conferir("sem padrao, rascunho do Bling", custoDoProduto({ fornecedores: [], fornecedorRascunho: { precoCusto: 9 }, custo: 7 }), { valor: 9, origem: "rascunho do Bling" });
    conferir("sem os dois, cadastro", custoDoProduto({ fornecedores: [], fornecedorRascunho: null, custo: 7 }), { valor: 7, origem: "cadastro" });
    conferir("sem custo nenhum", custoDoProduto({ fornecedores: [], fornecedorRascunho: null, custo: null }), { valor: null, origem: null });
  }

  // Fica no nivel do try porque as Tarefas 4, 5 e 6 reaproveitam este versiculo.
  const sl23 = { livro: "Salmos", capitulo: 23, inicio: 1, fim: 1, texto: "O SENHOR é o meu pastor; de nada terei falta." };

  {
    console.log("\nVersiculos");

    const pv3 = { livro: "Provérbios", capitulo: 3, inicio: 5, fim: 6, texto: "x".repeat(150) };
    conferir("referencia de um versiculo", referenciaDoVersiculo(sl23), "Salmos 23:1");
    conferir("referencia de faixa", referenciaDoVersiculo(pv3), "Provérbios 3:5-6");
    conferir("linha com o credito da NVI", linhaDoVersiculo(sl23), "“O SENHOR é o meu pastor; de nada terei falta.” Salmos 23:1 (NVI)");
    conferir("faixa conta cada versiculo", contarVersiculos([sl23, pv3]), 3);
    conferir("versiculo valido", errosDoVersiculo(sl23), []);
    conferir("livro fora da lista", errosDoVersiculo({ ...sl23, livro: "Isaías" }), ["Use Salmos ou Provérbios."]);
    conferir("capitulo que nao existe", errosDoVersiculo({ ...sl23, livro: "Provérbios", capitulo: 32 }), ["Provérbios tem 31 capitulos."]);
    conferir("fim antes do inicio", errosDoVersiculo({ ...sl23, inicio: 4, fim: 3 }), ["O versiculo final nao pode vir antes do inicial."]);
    conferir("texto vazio", errosDoVersiculo({ ...sl23, texto: "  " }), ["Cole o texto do versiculo."]);
    const cheia = Array.from({ length: 499 }, (_, i) => ({ ...sl23, capitulo: 1 + (i % 150), inicio: 1 + i }));
    conferir("cabe o 500o", podeAcrescentar(cheia, sl23), { ok: true });
    conferir("passa de 500", podeAcrescentar(cheia, pv3), { ok: false, erro: "A lista ficaria com 501 versiculos. O limite da NVI sem autorizacao da Biblica e 500." });
    conferir("25%: cabe", cabeNaDescricao("v".repeat(100), "r".repeat(400)), true);
    conferir("25%: nao cabe", cabeNaDescricao("v".repeat(100), "r".repeat(250)), false);
    const lista = [sl23, { ...sl23, capitulo: 24 }, { ...sl23, capitulo: 25 }];
    conferir("sorteio pula os ja usados", sortearVersiculo({ lista, usados: ["Salmos 23:1"], resto: "r".repeat(2000), aleatorio: () => 0 }).versiculo.capitulo, 24);
    conferir("sorteio respeita o excluir", sortearVersiculo({ lista, usados: [], excluir: ["Salmos 23:1", "Salmos 24:1"], resto: "r".repeat(2000), aleatorio: () => 0 }).versiculo.capitulo, 25);
    conferir("todos usados: recomeca", sortearVersiculo({ lista, usados: lista.map(referenciaDoVersiculo), resto: "r".repeat(2000), aleatorio: () => 0 }).reiniciou, true);
    conferir("nenhum cabe", sortearVersiculo({ lista, usados: [], resto: "curto", aleatorio: () => 0 }),
      { versiculo: null, motivo: "Nenhum versiculo da lista cabe nesta descricao: a NVI pede que a citacao fique abaixo de 25% do texto." });
    // Cabe nos 25%, mas o operador ja recusou o unico que havia: a causa nao e o tamanho do texto.
    conferir("todos os que cabem foram excluidos", sortearVersiculo({ lista: [sl23], usados: [], excluir: ["Salmos 23:1"], resto: "r".repeat(2000), aleatorio: () => 0 }),
      { versiculo: null, motivo: "Nao ha outro versiculo que caiba nesta descricao." });
    conferir("lista vazia", sortearVersiculo({ lista: [], usados: [], resto: "r".repeat(2000) }), { versiculo: null, motivo: "A lista de versiculos esta vazia. Carregue-a em Configuracoes." });
  }

  // Blocos das tarefas seguintes entram aqui, antes do finally.
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTodos os testes de anuncios ML OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);
