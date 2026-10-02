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
const {
  lerConfigML,
  gravarFrases,
  listarVersiculos,
  adicionarVersiculo,
  removerVersiculo,
  carregarVersiculosIniciais,
  sortearVersiculoDoBanco,
} = await import("../src/lib/canaisDeVenda/configuracao.js");
const { montarDescricaoML, restoDaDescricao } = await import("../src/lib/canaisDeVenda/ml/descricao.js");
const { rascunhoInicial, aplicarComposicao } = await import("../src/lib/canaisDeVenda/ml/rascunho.js");
const { ABAS_ML, validarRascunhoML, medidasFaltando } = await import("../src/lib/canaisDeVenda/ml/validacao.js");
const { montarPayloadML, nomeDaFoto } = await import("../src/lib/canaisDeVenda/ml/payload.js");
const { estadoDoIconeML } = await import("../src/lib/canaisDeVenda/ml/icone.js");
const { separarCanais } = await import("../src/lib/canais.js");

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

  // Ficam no nivel do try porque a Tarefa 5 reaproveita estes contextos e rascunhos. Sao
  // contextos de produto (o que o servidor manda para a tela), sem `blingId` nem `conferido`.
  const a = {
    id: "a",
    sku: "100101",
    tituloBase: "Resistor 1K 1/4W",
    descricaoBase: [
      "RESISTOR 1K 1/4W",
      "",
      "O Resistor 1K 1/4W é um resistor de filme de carbono com resistência de 1K ohms e potência de 1/4W, indicado para limitar corrente em circuitos eletrônicos de baixa potência.",
      "Pode ser usado em placas de ensaio e em projetos com Arduino, por exemplo para proteger LEDs ou compor divisores de tensão. Acompanha o código de cores impresso no corpo.",
      "",
      "Especificações técnicas:",
      "- Resistência: 1K ohms;",
      "- Potência: 1/4W;",
      "- Tolerância: 5%;",
      "- Dimensões(CxLxA): 6x2x2mm;",
      "- Peso: 1g;",
      "",
      "Itens inclusos: (Cod:100101)",
      "- 01 Resistor 1K 1/4W;",
      "",
      "Garantia:",
      "- Garantia Legal de 90 dias (contra defeitos de fabricação);",
    ].join("\n"),
    marca: "GENERICA",
    modelo: null,
    ean: "7890000000001",
    precoVenda: 0.5,
    estoque: 100,
    pesoKg: 0.001,
    alturaCm: 1,
    larguraCm: 1,
    comprimentoCm: 2,
    custo: { valor: 0.1, origem: "cadastro" },
    imagens: [
      { id: "img-a1", url: "/img/a1.jpg", principal: true },
      { id: "img-a2", url: "/img/a2.jpg", principal: false },
    ],
  };
  const b = {
    id: "b",
    sku: "100102",
    tituloBase: "Resistor 2K2 1/4W",
    descricaoBase: "Resistor de 2K2 ohms.",
    marca: "GENERICA",
    modelo: null,
    ean: null,
    precoVenda: 0.6,
    estoque: 30,
    pesoKg: 0.002,
    alturaCm: 1,
    larguraCm: 1,
    comprimentoCm: 2,
    custo: { valor: 0.12, origem: "cadastro" },
    imagens: [{ id: "img-b1", url: "/img/b1.jpg", principal: true }],
  };
  const simples = rascunhoInicial({ principal: a, produtosPorId: { a }, composicao: null, versiculo: sl23 });
  const kit = rascunhoInicial({ principal: a, produtosPorId: { a }, composicao: { itens: [{ produtoId: "a", quantidade: 5 }], codigo: "", blingProdutoId: null }, versiculo: null });
  const misto = aplicarComposicao(kit, { itens: [{ produtoId: "a", quantidade: 2 }, { produtoId: "b", quantidade: 3 }], codigo: "", blingProdutoId: null }, { a, b });

  {
    console.log("\nDescricao e rascunho inicial");

    conferir("descricao junta texto, frases e versiculo", montarDescricaoML({ descricao: "Texto.\n", frases: ["Nota fiscal.", " ", "Envio rapido."], versiculo: sl23 }),
      "Texto.\n\nNota fiscal.\nEnvio rapido.\n\n“O SENHOR é o meu pastor; de nada terei falta.” Salmos 23:1 (NVI)");
    conferir("sem versiculo nao sobra linha", montarDescricaoML({ descricao: "Texto.", frases: [], versiculo: null }), "Texto.");
    conferir("resto e a descricao sem versiculo", restoDaDescricao({ descricao: "Texto.", frases: ["Nota fiscal."] }), "Texto.\n\nNota fiscal.");
    conferir("sem descricao nem frases, so o versiculo", montarDescricaoML({ descricao: "  ", frases: undefined, versiculo: sl23 }),
      "“O SENHOR é o meu pastor; de nada terei falta.” Salmos 23:1 (NVI)");
    conferir("contexto de teste: descricao longa com Itens inclusos e Garantia",
      [a.descricaoBase.length >= 400, a.descricaoBase.includes("Itens inclusos: (Cod:100101)"), a.descricaoBase.includes("Garantia:")], [true, true, true]);

    conferir("simples: titulo, preco e estoque do produto", [simples.titulo, simples.preco, simples.estoque], ["Resistor 1K 1/4W", 0.5, 100]);
    conferir("simples: Classico, novo, sem categoria", [simples.tipoAnuncio, simples.condicao, simples.categoriaId], ["gold_special", "new", null]);
    conferir("simples: atributos da marca e do EAN", simples.atributos, { BRAND: "GENERICA", GTIN: "7890000000001" });
    conferir("simples: fotos com a principal primeiro", simples.imagens, ["img-a1", "img-a2"]);
    conferir("simples: family_name e a marca quando nao ha modelo", simples.familyName, "GENERICA");
    conferir("simples: produto, versiculo e descricao inteira do produto", [simples.produtoId, simples.versiculo, simples.descricao], ["a", sl23, a.descricaoBase]);
    conferir("simples: envio pelo Mercado Envios 2, com as medidas do produto", simples.envio,
      { pesoKg: 0.001, alturaCm: 1, larguraCm: 1, comprimentoCm: 2, modo: "me2", freteGratis: false, retirada: false });
    conferir("simples: sem composicao", simples.composicao, null);
    conferir("simples: foto principal vem primeiro mesmo fora de ordem",
      rascunhoInicial({ principal: { ...a, imagens: [...a.imagens].reverse() }, produtosPorId: {}, composicao: null, versiculo: null }).imagens, ["img-a1", "img-a2"]);
    conferir("simples: sem marca, modelo nem EAN", rascunhoInicial({ principal: { ...a, marca: null, ean: "" }, produtosPorId: {}, composicao: null, versiculo: null }).atributos, {});
    conferir("simples: family_name sem marca nem modelo e o titulo",
      rascunhoInicial({ principal: { ...a, marca: null }, produtosPorId: {}, composicao: null, versiculo: null }).familyName, "Resistor 1K 1/4W");
    conferir("simples: family_name com marca e modelo, e atributo MODEL",
      (({ familyName, atributos }) => [familyName, atributos.MODEL])(rascunhoInicial({ principal: { ...a, modelo: "R1K" }, produtosPorId: {}, composicao: null, versiculo: null })),
      ["GENERICA R1K", "R1K"]);
    conferir("simples: versiculo do banco entra so com os 5 campos",
      rascunhoInicial({ principal: a, produtosPorId: {}, composicao: null, versiculo: { ...sl23, id: "x1", ordem: 7 } }).versiculo, sl23);
    conferir("simples: produto sem preco fica sem preco", rascunhoInicial({ principal: { ...a, precoVenda: null }, produtosPorId: {}, composicao: null, versiculo: null }).preco, null);

    conferir("kit de um produto: codigo gerado", kit.composicao.codigo, "100101_5");
    conferir("kit: preco em branco, estoque e peso calculados", [kit.preco, kit.estoque, kit.envio.pesoKg], [null, 20, 0.005]);
    conferir("kit: sem GTIN", "GTIN" in kit.atributos, false);
    conferir("kit: titulo sugere o kit", kit.titulo, "KIT COM 5 RESISTOR 1K 1/4W");
    conferir("kit: bloco de itens inclusos na descricao", kit.descricao.includes("Itens inclusos: (Cod:100101_5)\n- 05 Resistor 1K 1/4W;"), true);
    conferir("kit: a secao antiga sai e a Garantia fica",
      [kit.descricao.includes("(Cod:100101)\n"), kit.descricao.includes("\n\nGarantia:\n- Garantia Legal de 90 dias")], [false, true]);
    conferir("kit: composicao guardada com os itens", kit.composicao, { itens: [{ produtoId: "a", quantidade: 5 }], codigo: "100101_5", blingProdutoId: null });
    conferir("kit: marca e fotos do produto", [kit.atributos.BRAND, kit.imagens], ["GENERICA", ["img-a1", "img-a2"]]);

    conferir("misto: codigo fica para o dono digitar", misto.composicao.codigo, "");
    conferir("misto: estoque e peso recalculados", [misto.estoque, misto.envio.pesoKg], [10, 0.008]);
    conferir("misto: fotos dos dois produtos, sem repetir", misto.imagens, ["img-a1", "img-a2", "img-b1"]);
    conferir("misto: titulo e preco que o dono ja mexeu ficam", [misto.titulo, misto.preco], [kit.titulo, kit.preco]);
    conferir("misto: itens inclusos listam os dois produtos",
      misto.descricao.includes("Itens inclusos:\n- 02 Resistor 1K 1/4W;\n- 03 Resistor 2K2 1/4W;\n\nGarantia:"), true);
    conferir("misto: produto continua sendo o primeiro item", misto.produtoId, "a");
    conferir("misto: codigo digitado e mantido", aplicarComposicao(misto, { ...misto.composicao, codigo: "KIT-RESISTORES" }, { a, b }).composicao.codigo, "KIT-RESISTORES");
    conferir("misto: titulo sugerido pelo rascunho inicial",
      rascunhoInicial({ principal: a, produtosPorId: { b }, composicao: { itens: [{ produtoId: "a", quantidade: 2 }, { produtoId: "b", quantidade: 3 }], codigo: "KIT-1", blingProdutoId: null }, versiculo: null })
        .titulo,
      "KIT RESISTOR 1K 1/4W");
    conferir("misto: item sem peso deixa o peso do kit em branco", aplicarComposicao(kit, { ...misto.composicao }, { a, b: { ...b, pesoKg: null } }).envio.pesoKg, null);
    conferir("misto: trocar o primeiro item muda o produto e poe as fotos dele na frente",
      (({ produtoId, imagens }) => [produtoId, imagens])(aplicarComposicao(misto, { ...misto.composicao, itens: [{ produtoId: "b", quantidade: 3 }, { produtoId: "a", quantidade: 2 }] }, { a, b })),
      ["b", ["img-b1", "img-a1", "img-a2"]]);

    conferir("desligar a composicao volta ao principal", [aplicarComposicao(misto, null, { a, b }).estoque, aplicarComposicao(misto, null, { a, b }).composicao], [100, null]);
    const desligado = aplicarComposicao(misto, null, { a, b });
    conferir("desligar: peso, medidas, fotos e descricao do principal",
      [desligado.envio.pesoKg, desligado.envio.alturaCm, desligado.envio.larguraCm, desligado.envio.comprimentoCm, desligado.imagens, desligado.descricao === a.descricaoBase],
      [0.001, 1, 1, 2, ["img-a1", "img-a2"], true]);
    const editado = { ...misto, titulo: "Titulo do dono", preco: 9.9, categoriaId: "MLB1234", familyName: "Familia", tipoAnuncio: "gold_pro", condicao: "used", versiculo: sl23, atributos: { BRAND: "OUTRA", MODEL: "M1" } };
    conferir("desligar nao toca no que o dono editou",
      (({ titulo, preco, categoriaId, familyName, tipoAnuncio, condicao, versiculo }) => ({ titulo, preco, categoriaId, familyName, tipoAnuncio, condicao, versiculo }))(aplicarComposicao(editado, null, { a, b })),
      { titulo: "Titulo do dono", preco: 9.9, categoriaId: "MLB1234", familyName: "Familia", tipoAnuncio: "gold_pro", condicao: "used", versiculo: sl23 });

    // O GTIN e do codigo de barras da peca avulsa: o kit nao o herda, e ao desligar o kit ele volta.
    const umKit = { itens: [{ produtoId: "a", quantidade: 2 }], codigo: "", blingProdutoId: null };
    conferir("GTIN: simples vira kit e perde o GTIN, a marca fica", aplicarComposicao(simples, umKit, { a }).atributos, { BRAND: "GENERICA" });
    conferir("GTIN: kit volta a simples e recupera o GTIN do principal", aplicarComposicao(kit, null, { a }).atributos, { BRAND: "GENERICA", GTIN: "7890000000001" });
    const simplesEditado = { ...simples, atributos: { BRAND: "OUTRA", MODEL: "M1", GTIN: "7890000000001" } };
    const kitEditado = aplicarComposicao(simplesEditado, umKit, { a });
    conferir("GTIN: marca e modelo do dono sobrevivem a ida e a volta",
      [kitEditado.atributos, aplicarComposicao(kitEditado, null, { a }).atributos],
      [{ BRAND: "OUTRA", MODEL: "M1" }, { BRAND: "OUTRA", MODEL: "M1", GTIN: "7890000000001" }]);
    const simplesDeB = rascunhoInicial({ principal: b, produtosPorId: { b }, composicao: null, versiculo: null });
    conferir("GTIN: principal sem EAN volta sem GTIN",
      aplicarComposicao(aplicarComposicao(simplesDeB, { itens: [{ produtoId: "b", quantidade: 2 }], codigo: "", blingProdutoId: null }, { b }), null, { b }).atributos, { BRAND: "GENERICA" });
    conferir("GTIN: o do kit, se o dono digitou, nao vai para a peca avulsa",
      aplicarComposicao({ ...kit, atributos: { BRAND: "GENERICA", GTIN: "999" } }, null, { a }).atributos, { BRAND: "GENERICA", GTIN: "7890000000001" });

    // A tela chama a cada tecla: a linha 1 pode estar sem produto por um instante.
    const linhaVazia = aplicarComposicao(kit, { itens: [{ produtoId: "", quantidade: 5 }], codigo: "", blingProdutoId: null }, { a, b });
    conferir("linha 1 sem produto: o produto do anuncio nao se perde", linhaVazia.produtoId, "a");
    const desligadoDaVazia = aplicarComposicao(linhaVazia, null, { a, b });
    conferir("linha 1 sem produto e depois desligar: volta ao principal inteiro",
      [desligadoDaVazia.estoque, desligadoDaVazia.composicao, desligadoDaVazia.imagens, desligadoDaVazia.descricao === a.descricaoBase],
      [100, null, ["img-a1", "img-a2"], true]);
    conferir("linha 1 sem produto e a 2 preenchida: o primeiro produto escolhido manda",
      (({ produtoId, imagens }) => [produtoId, imagens])(aplicarComposicao(misto, { ...misto.composicao, itens: [{ produtoId: "", quantidade: 2 }, { produtoId: "b", quantidade: 3 }] }, { a, b })),
      ["b", ["img-b1"]]);

    const antes = JSON.stringify([misto, simples]);
    aplicarComposicao(misto, null, { a, b });
    aplicarComposicao(misto, { ...misto.composicao, codigo: "Z" }, { a, b });
    aplicarComposicao(simples, umKit, { a });
    aplicarComposicao(simples, null, { a });
    conferir("aplicarComposicao nao altera o rascunho recebido", JSON.stringify([misto, simples]), antes);
  }

  {
    console.log("\nValidacao, payload e icone");

    // Os contextos de produto da Tarefa 4 nao trazem `blingId` nem `conferido`: este bloco
    // monta os seus. A base nao pode ter problema nenhum, e cada caso muda uma coisa so.
    const aOk = { ...a, blingId: "111", conferido: true };
    const bOk = { ...b, blingId: "222", conferido: true };
    const ctx = { produtos: { a: aOk, b: bOk }, frases: ["Nota fiscal."], codigoEmUso: null };
    const base = { ...simples, categoriaId: "MLB1234" };
    const kitOk = { ...kit, categoriaId: "MLB1234", preco: 2 };
    const mistoOk = { ...misto, categoriaId: "MLB1234", preco: 2, composicao: { ...misto.composicao, codigo: "KIT-RESISTORES" } };

    const problema = (rascunho, contexto, campo) => validarRascunhoML(rascunho, contexto).find((p) => p.campo === campo);
    const onde = (p) => [p?.aba, p?.bloqueante];
    const comProduto = (id, mudancas) => ({ ...ctx, produtos: { ...ctx.produtos, [id]: { ...ctx.produtos[id], ...mudancas } } });
    const comEnvio = (mudancas) => ({ ...base, envio: { ...base.envio, ...mudancas } });

    conferir("abas do editor", ABAS_ML.map((x) => x.id), ["geral", "preco", "imagens", "descricao", "ficha", "envio", "previa"]);
    conferir("base simples: nenhum problema", validarRascunhoML(base, ctx), []);
    conferir("kit pronto: nenhum problema bloqueante", validarRascunhoML(kitOk, ctx).filter((p) => p.bloqueante), []);
    conferir("kit misto pronto: nenhum problema bloqueante", validarRascunhoML(mistoOk, ctx).filter((p) => p.bloqueante), []);

    conferir("titulo vazio", onde(problema({ ...base, titulo: " " }, ctx, "titulo")), ["geral", true]);
    conferir("titulo com 61", onde(problema({ ...base, titulo: "X".repeat(61) }, ctx, "titulo")), ["geral", true]);
    conferir("titulo com 61: mensagem", problema({ ...base, titulo: "X".repeat(61) }, ctx, "titulo").problema, "O titulo tem 61 caracteres; o limite do Mercado Livre e 60.");
    conferir("titulo com 60 serve", problema({ ...base, titulo: "X".repeat(60) }, ctx, "titulo"), undefined);
    conferir("sem family_name", onde(problema({ ...base, familyName: "" }, ctx, "familyName")), ["geral", true]);
    conferir("sem categoria", onde(problema({ ...base, categoriaId: null }, ctx, "categoria")), ["geral", true]);
    conferir("categoria fora do formato", onde(problema({ ...base, categoriaId: "1234" }, ctx, "categoria")), ["geral", true]);
    conferir("categoria em minuscula", onde(problema({ ...base, categoriaId: "mlb1234" }, ctx, "categoria")), ["geral", true]);
    conferir("preco zero", onde(problema({ ...base, preco: 0 }, ctx, "preco")), ["preco", true]);
    conferir("preco em branco", onde(problema({ ...base, preco: null }, ctx, "preco")), ["preco", true]);
    conferir("estoque quebrado", onde(problema({ ...base, estoque: 1.5 }, ctx, "estoque")), ["preco", true]);
    conferir("estoque negativo", onde(problema({ ...base, estoque: -1 }, ctx, "estoque")), ["preco", true]);
    conferir("estoque zero e so alerta", onde(problema({ ...base, estoque: 0 }, ctx, "estoque")), ["preco", false]);
    conferir("sem fotos", onde(problema({ ...base, imagens: [] }, ctx, "imagens")), ["imagens", true]);
    conferir("descricao vazia", onde(problema({ ...base, descricao: "" }, ctx, "descricao")), ["descricao", true]);
    conferir("sem versiculo e so alerta", onde(problema({ ...base, versiculo: null }, ctx, "versiculo")), ["descricao", false]);
    conferir("versiculo passa de 25%", onde(problema({ ...base, descricao: "curta" }, { ...ctx, frases: [] }, "versiculo")), ["descricao", true]);
    conferir("sem GTIN em produto simples", onde(problema({ ...base, atributos: { BRAND: "GENERICA" } }, ctx, "GTIN")), ["ficha", false]);
    conferir("sem peso", onde(problema(comEnvio({ pesoKg: null }), ctx, "peso")), ["envio", true]);
    conferir("sem dimensoes", onde(problema(comEnvio({ alturaCm: 0 }), ctx, "dimensoes")), ["envio", true]);
    conferir("sem comprimento", onde(problema(comEnvio({ comprimentoCm: null }), ctx, "dimensoes")), ["envio", true]);
    conferir("dimensoes: a mensagem diz o que falta", problema(comEnvio({ alturaCm: 0, comprimentoCm: null }), ctx, "dimensoes").problema,
      "Informe as medidas do pacote em cm. Faltam: altura, comprimento.");
    conferir("peso faltando nao acusa dimensoes", [problema(comEnvio({ pesoKg: 0 }), ctx, "peso") !== undefined, problema(comEnvio({ pesoKg: 0 }), ctx, "dimensoes")], [true, undefined]);
    conferir("medidasFaltando: tudo certo", medidasFaltando(base.envio), []);
    conferir("medidasFaltando: na ordem do envio", medidasFaltando({ pesoKg: null, alturaCm: "abc", larguraCm: 2, comprimentoCm: -1 }), ["altura", "comprimento", "peso"]);
    conferir("medidasFaltando: sem envio nenhum", medidasFaltando(undefined), ["altura", "largura", "comprimento", "peso"]);
    conferir("produto nao Conferido", onde(problema(base, comProduto("a", { conferido: false }), "produto")), ["geral", true]);
    conferir("produto nao Conferido: mensagem", problema(base, comProduto("a", { conferido: false }), "produto").problema, "Este produto nao esta Conferido. So produto Conferido vira anuncio.");
    conferir("produto sem blingId", onde(problema(base, comProduto("a", { blingId: null }), "blingId")), ["geral", true]);
    conferir("produto sem blingId: mensagem", problema(base, comProduto("a", { blingId: null }), "blingId").problema, "Produto sem blingId: o anuncio nao podera ser publicado.");
    conferir("produto que sumiu do contexto", onde(problema(base, { ...ctx, produtos: {} }, "produto")), ["geral", true]);

    conferir("kit: codigo em uso", onde(problema(kitOk, { ...ctx, codigoEmUso: "o produto 100101_5 do cadastro" }, "codigoKit")), ["geral", true]);
    conferir("kit: codigo em uso, mensagem", problema(kitOk, { ...ctx, codigoEmUso: "o produto 100101_5 do cadastro" }, "codigoKit").problema,
      "O codigo 100101_5 ja esta em uso: o produto 100101_5 do cadastro.");
    conferir("kit misto sem codigo", onde(problema(misto, ctx, "codigoKit")), ["geral", true]);
    conferir("kit: item sem blingId", onde(problema(misto, comProduto("b", { blingId: null }), "item:b")), ["geral", true]);
    conferir("kit: item nao Conferido", onde(problema(mistoOk, comProduto("b", { conferido: false }), "item:b")), ["geral", true]);
    conferir("kit: item que sumiu do contexto", onde(problema(mistoOk, { ...ctx, produtos: { a: aOk } }, "item:b")), ["geral", true]);
    conferir("kit: o principal e conferido como item, nao como produto",
      [problema(kitOk, comProduto("a", { conferido: false }), "produto"), onde(problema(kitOk, comProduto("a", { conferido: false }), "item:a"))], [undefined, ["geral", true]]);
    conferir("kit: menos de 2 unidades", onde(problema({ ...kitOk, composicao: { ...kitOk.composicao, itens: [{ produtoId: "a", quantidade: 1 }] } }, ctx, "composicao")), ["geral", true]);
    conferir("kit sem foto propria alerta", problema(kitOk, ctx, "fotosDoKit")?.bloqueante, false);
    conferir("kit sem foto propria: aba Imagens", problema(kitOk, ctx, "fotosDoKit")?.aba, "imagens");
    conferir("kit sem GTIN nao gera alerta", validarRascunhoML(kitOk, ctx).some((p) => p.campo === "GTIN"), false);
    conferir("produto simples nao tem aviso de foto do kit", problema(base, ctx, "fotosDoKit"), undefined);

    const payload = montarPayloadML(base, ctx);
    conferir("payload nasce pausado, sem preco no item", [payload.item.status, "price" in payload.item], ["paused", false]);
    conferir("payload leva o SKU do produto", payload.item.attributes.find((x) => x.id === "SELLER_SKU").value_name, "100101");
    conferir("payload do kit leva o codigo do kit", montarPayloadML(kitOk, ctx).item.attributes.find((x) => x.id === "SELLER_SKU").value_name, "100101_5");
    conferir("payload do kit nao leva GTIN", montarPayloadML(kitOk, ctx).item.attributes.some((x) => x.id === "GTIN"), false);
    conferir("payload: atributos da ficha e o SKU", payload.item.attributes,
      [{ id: "BRAND", value_name: "GENERICA" }, { id: "GTIN", value_name: "7890000000001" }, { id: "SELLER_SKU", value_name: "100101" }]);
    conferir("preco vai a parte", payload.preco, { amount: 0.5, currency_id: "BRL" });
    conferir("descricao final no payload", payload.descricao.plain_text, montarDescricaoML({ ...simples, frases: ctx.frases }));
    conferir("payload: titulo, familia, categoria, estoque, tipo e condicao",
      [payload.item.title, payload.item.family_name, payload.item.category_id, payload.item.available_quantity, payload.item.currency_id, payload.item.listing_type_id, payload.item.condition],
      ["Resistor 1K 1/4W", "GENERICA", "MLB1234", 100, "BRL", "gold_special", "new"]);
    conferir("payload: titulo cortado em 60", montarPayloadML({ ...base, titulo: "X".repeat(70) }, ctx).item.title, "X".repeat(60));
    conferir("payload: envio com dimensoes em cm e peso em gramas", payload.item.shipping,
      { mode: "me2", free_shipping: false, local_pick_up: false, dimensions: "1x1x2,1" });
    conferir("payload: frete gratis e retirada", (({ free_shipping, local_pick_up }) => [free_shipping, local_pick_up])(montarPayloadML(comEnvio({ freteGratis: true, retirada: true }), ctx).item.shipping), [true, true]);
    conferir("payload: peso do kit em gramas", montarPayloadML(kitOk, ctx).item.shipping.dimensions, "1x1x2,5");
    conferir("payload: sem medida, sem dimensions", "dimensions" in montarPayloadML(comEnvio({ alturaCm: null }), ctx).item.shipping, false);
    conferir("payload: sem peso, sem dimensions", "dimensions" in montarPayloadML(comEnvio({ pesoKg: null }), ctx).item.shipping, false);
    conferir("payload: fotos com o nome legivel", payload.fotos,
      [{ arquivoId: "img-a1", nome: "resistor-1k-1-4w-1.jpg" }, { arquivoId: "img-a2", nome: "resistor-1k-1-4w-2.jpg" }]);
    conferir("payload: pictures so com os nomes", payload.item.pictures, [{ nome: "resistor-1k-1-4w-1.jpg" }, { nome: "resistor-1k-1-4w-2.jpg" }]);
    conferir("nome legivel da foto", nomeDaFoto("Placa Uno R3 CH340 + Cabo", 0), "placa-uno-r3-ch340-cabo-1.jpg");
    conferir("nome da foto: sem acento, indice a partir de 1", nomeDaFoto("Conexão  Ação", 2), "conexao-acao-3.jpg");
    conferir("nome da foto: ate 60 caracteres, sem traco na ponta", nomeDaFoto(`${"a".repeat(59)} bbb`, 0), `${"a".repeat(59)}-1.jpg`);
    conferir("nome da foto: titulo sem letra nem numero", nomeDaFoto(" +/ ", 0), "anuncio-1.jpg");

    conferir("icone: sem anuncio", estadoDoIconeML([]), { publicado: false, rascunho: false });
    conferir("icone: publicado e rascunho juntos", estadoDoIconeML([{ canal: "MERCADO_LIVRE", status: "PUBLICADO", situacaoCanal: "ATIVA" }, { canal: "MERCADO_LIVRE", status: "RASCUNHO" }, { canal: "BLING", status: "RASCUNHO" }]), { publicado: true, rascunho: true });
    conferir("icone: so publicado e ativo, sem ponto", estadoDoIconeML([{ canal: "MERCADO_LIVRE", status: "PUBLICADO", situacaoCanal: "ATIVA" }]), { publicado: true, rascunho: false });
    conferir("icone: anuncio de outro canal nao conta", estadoDoIconeML([{ canal: "BLING", status: "PUBLICADO", situacaoCanal: "ATIVA" }, { canal: "LOJA_INTEGRADA", status: "RASCUNHO" }]), { publicado: false, rascunho: false });
    // Cada status que nao e "publicado e ativo" liga o ponto ambar e nunca deixa o icone verde.
    for (const status of ["RASCUNHO", "VALIDADO", "PUBLICANDO", "ERRO"]) {
      conferir(`icone: ${status} so liga o ponto`, estadoDoIconeML([{ canal: "MERCADO_LIVRE", status }]), { publicado: false, rascunho: true });
    }
    conferir("icone: composicao aguardando o Bling (PUBLICANDO) tem ponto", estadoDoIconeML([{ canal: "MERCADO_LIVRE", status: "PUBLICANDO", situacaoCanal: "PAUSADA" }]), { publicado: false, rascunho: true });
    // O ML pausa anuncio sozinho (falta de estoque): publicado, mas nao ativo, nao e verde.
    for (const situacaoCanal of ["PAUSADA", "ENCERRADA", "DESCONHECIDA", undefined]) {
      conferir(`icone: PUBLICADO com situacao ${situacaoCanal ?? "ausente"} nao e verde, liga o ponto`,
        estadoDoIconeML([{ canal: "MERCADO_LIVRE", status: "PUBLICADO", situacaoCanal }]), { publicado: false, rascunho: true });
    }
    conferir("icone: ativo num anuncio e pausado em outro, os dois acendem",
      estadoDoIconeML([{ canal: "MERCADO_LIVRE", status: "PUBLICADO", situacaoCanal: "ATIVA" }, { canal: "MERCADO_LIVRE", status: "PUBLICADO", situacaoCanal: "PAUSADA" }]), { publicado: true, rascunho: true });
    conferir("icone: situacao ATIVA sem status publicado nao e verde", estadoDoIconeML([{ canal: "MERCADO_LIVRE", status: "RASCUNHO", situacaoCanal: "ATIVA" }]), { publicado: false, rascunho: true });
    conferir("icone: lista invalida", estadoDoIconeML(undefined), { publicado: false, rascunho: false });

    const { integrados } = separarCanais([{ canal: "MERCADO_LIVRE", status: "PUBLICADO", idExterno: "MLB1" }, { canal: "MERCADO_LIVRE", status: "RASCUNHO", idExterno: null }]);
    conferir("separarCanais nao esconde o publicado atras do rascunho", integrados.map((c) => c.idExterno), ["MLB1"]);
    conferir("separarCanais: a ordem da lista nao importa",
      separarCanais([{ canal: "MERCADO_LIVRE", status: "RASCUNHO", idExterno: null }, { canal: "MERCADO_LIVRE", status: "PUBLICADO", idExterno: "MLB1" }]).integrados.map((c) => [c.id, c.status, c.idExterno]),
      [["MERCADO_LIVRE", "PUBLICADO", "MLB1"]]);
    conferir("separarCanais: so rascunho continua pendente", (({ integrados: i, pendentes }) => [i.length, pendentes.some((c) => c.id === "MERCADO_LIVRE")])(
      separarCanais([{ canal: "MERCADO_LIVRE", status: "RASCUNHO", idExterno: null }])), [0, true]);
    conferir("separarCanais: tentativa que falhou continua com o rotulo",
      separarCanais([{ canal: "MERCADO_LIVRE", status: "ERRO", idExterno: null }]).pendentes.find((c) => c.id === "MERCADO_LIVRE").tentouEFalhou, true);
    conferir("separarCanais: entre dois publicados vale o ultimo, como antes",
      separarCanais([{ canal: "MERCADO_LIVRE", status: "PUBLICADO", idExterno: "MLB1" }, { canal: "MERCADO_LIVRE", status: "PUBLICADO", idExterno: "MLB2" }]).integrados.map((c) => c.idExterno), ["MLB2"]);
  }

  {
    console.log("\nConfiguracao (banco)");
    await limpar();

    // A configuracao e a lista de versiculos sao dados REAIS do dono (banco compartilhado):
    // a linha do canal e guardada aqui e devolvida no finally, e os unicos versiculos que o
    // bloco cria sao os de teste abaixo, apagados por texto (nunca se mexe nos outros).
    // Todo versiculo que o bloco grava ou tenta gravar leva um destes textos: e o que deixa
    // a limpeza achar tudo, mesmo o que um defeito deixasse passar da validacao.
    const textosDeTeste = ["Texto de teste.", "Texto de carga.", "Teste de teto."];
    const [textoDoTeste, textoDaCarga, textoDoTeto] = textosDeTeste;
    // Sobras de uma execucao morta no meio (Ctrl+C, queda de energia) bloqueariam a carga real
    // da Tarefa 15, que so roda com a tabela vazia.
    await prisma.versiculo.deleteMany({ where: { texto: { in: textosDeTeste } } });

    const configAntes = await prisma.configCanal.findUnique({ where: { canal: "MERCADO_LIVRE" } });
    const recusada = async (chamada) => {
      try {
        await chamada();
        return null;
      } catch (erro) {
        return erro.message;
      }
    };
    // Dois finally encaixados: cada limpeza roda mesmo que a outra lance, e a da configuracao
    // (dado real do dono) nunca fica atras de um erro na dos versiculos de teste.
    try {
      try {
        if (!configAntes) {
          // So aqui: apagar a linha do dono para testar a ausencia seria arriscar o dado real.
          conferir("sem linha: listas vazias", await lerConfigML(), { frases: [], usados: [] });
          conferir("sem linha: ler nao cria", await prisma.configCanal.count({ where: { canal: "MERCADO_LIVRE" } }), 0);
        }

        conferir("frases: uma por linha, aparadas e sem repetir", (await gravarFrases("  Nota fiscal em todos.\n\nNota fiscal em todos.\nEnvio no mesmo dia. ")).frases, ["Nota fiscal em todos.", "Envio no mesmo dia."]);
        conferir("frases: lidas de volta", (await lerConfigML()).frases, ["Nota fiscal em todos.", "Envio no mesmo dia."]);
        conferir("frases: mais de 10 e recusado", (await gravarFrases(Array.from({ length: 11 }, (_, i) => `F${i}`).join("\n"))).ok, false);
        conferir("frases: frase acima de 200 caracteres e recusada", (await gravarFrases("x".repeat(201))).ok, false);
        conferir("frases: o que foi recusado nao mexe no gravado", (await lerConfigML()).frases, ["Nota fiscal em todos.", "Envio no mesmo dia."]);
        const dezDeDuzentos = Array.from({ length: 10 }, (_, i) => String.fromCharCode(97 + i).repeat(200));
        conferir("frases: 10 frases de 200 caracteres cabem", (await gravarFrases(dezDeDuzentos.join("\n"))).frases, dezDeDuzentos);
        conferir("frases: onze linhas iguais sao uma so", (await gravarFrases(Array(11).fill("Igual.").join("\n"))).frases, ["Igual."]);
        conferir("frases: quebra de linha do Windows", (await gravarFrases("A\r\nB\r\n")).frases, ["A", "B"]);
        conferir("frases: vazio limpa", (await gravarFrases("  \n ")).frases, []);

        const atuais = await listarVersiculos();
        const livre = Array.from({ length: 176 }, (_, i) => i + 1).find((n) => !atuais.some((v) => v.livro === "Salmos" && v.capitulo === 119 && v.inicio === n));

        if (atuais.length === 0) {
          // Tabela vazia (a carga real ainda nao aconteceu): so entao a carga inicial pode ser
          // exercitada sem tocar em dado do dono. Tudo o que ela grava aqui e apagado por texto.
          const grande = Array.from({ length: 501 }, (_, i) => ({ livro: "Salmos", capitulo: 119, inicio: i + 1, fim: i + 1, texto: textoDoTeto }));
          conferir("carga inicial: mais de 500 e recusada antes de gravar", [await recusada(() => carregarVersiculosIniciais(grande)), await prisma.versiculo.count()],
            ["A carga tem 501 versiculos. O limite da NVI sem autorizacao da Biblica e 500.", 0]);
          conferir("carga inicial: versiculo invalido e recusado antes de gravar", [await recusada(() => carregarVersiculosIniciais([{ livro: "Isaías", capitulo: 1, inicio: 1, fim: 1, texto: textoDoTeste }])), await prisma.versiculo.count()],
            ["Isaías 1:1: Use Salmos ou Provérbios.", 0]);
          // Fora de ordem, uma sem `fim`, uma faixa e uma repetida dentro da propria lista.
          const carga = [
            { livro: "Salmos", capitulo: 119, inicio: 3, texto: ` ${textoDaCarga.replace(" ", "\n ")} ` },
            { livro: "Provérbios", capitulo: 3, inicio: 5, fim: 6, texto: textoDaCarga },
            { livro: "Salmos", capitulo: 23, inicio: 1, fim: 1, texto: textoDaCarga },
            { livro: "Salmos", capitulo: 23, inicio: 1, fim: 1, texto: textoDaCarga },
          ];
          conferir("carga inicial: tabela vazia carrega (repetido da propria lista e ignorado)", await carregarVersiculosIniciais(carga), { carregados: 3, existentes: 0 });
          const carregados = await listarVersiculos();
          conferir("lista: ordem livro, capitulo, inicio", carregados.map(referenciaDoVersiculo), ["Provérbios 3:5-6", "Salmos 23:1", "Salmos 119:3"]);
          conferir("carga inicial: fim ausente vale o inicio e o texto e aparado", carregados.map((v) => [v.fim, v.texto]), [[6, textoDaCarga], [1, textoDaCarga], [3, textoDaCarga]]);
          conferir("carga inicial: segunda vez nao carrega", await carregarVersiculosIniciais([sl23]), { carregados: 0, existentes: 3 });
          await prisma.versiculo.deleteMany({ where: { texto: textoDaCarga } });
        }

        // Cada espaco vira quebra de linha com recuo: a entrada chega suja e tem que sair como `textoDoTeste`.
        const novo = await adicionarVersiculo({ livro: "Salmos", capitulo: 119, inicio: livre, fim: livre, texto: `  ${textoDoTeste.replaceAll(" ", "\n  ")}  ` });
        conferir("versiculo entra", [novo.ok, (await listarVersiculos()).length], [true, atuais.length + 1]);
        conferir("versiculo: o que a lista devolve (sem as datas do banco)", Object.keys((await listarVersiculos())[0]).sort(), ["capitulo", "fim", "id", "inicio", "livro", "texto"]);
        conferir("versiculo: texto aparado e numa linha so", (await listarVersiculos()).find((v) => v.id === novo.id)?.texto, textoDoTeste);
        conferir("versiculo repetido e recusado", (await adicionarVersiculo({ livro: "Salmos", capitulo: 119, inicio: livre, fim: livre, texto: textoDoTeste })).erro, "Este versiculo ja esta na lista.");
        conferir("versiculo invalido e recusado", (await adicionarVersiculo({ livro: "Isaías", capitulo: 1, inicio: 1, fim: 1, texto: textoDoTeste })).ok, false);
        conferir("versiculo: livro sem o acento e recusado", (await adicionarVersiculo({ livro: "Proverbios", capitulo: 3, inicio: 5, fim: 5, texto: textoDoTeste })).ok, false);
        conferir("versiculo: texto so de espacos e recusado", (await adicionarVersiculo({ livro: "Salmos", capitulo: 1, inicio: 1, fim: 1, texto: " \n " })).erro, "Cole o texto do versiculo.");
        conferir("versiculo recusado nao entra", (await listarVersiculos()).length, atuais.length + 1);

        const outros = (await listarVersiculos()).filter((v) => v.id !== novo.id).map(referenciaDoVersiculo);
        conferir("sorteio do banco nunca devolve o excluido", (await sortearVersiculoDoBanco({ excluir: outros, resto: "r".repeat(2000) })).versiculo?.inicio, livre);
        // Os usados vem da linha do canal; o ultimo gravar de frases ja a criou.
        await prisma.configCanal.update({ where: { canal: "MERCADO_LIVRE" }, data: { versiculosUsados: outros } });
        const sorteado = await sortearVersiculoDoBanco({ resto: "r".repeat(2000) });
        conferir("sorteio do banco pula os usados do canal", [sorteado.versiculo?.inicio, sorteado.reiniciou], [livre, false]);
        // Com a lista so de um versiculo (tabela vazia antes do teste), `outros` e vazio e o
        // caso acima nao prova nada; usado o unico que sobra, o ciclo tem que recomecar. O
        // `excluir: outros` deixa o de teste como unico elegivel, entao o resultado e o mesmo
        // com a lista real carregada (sem ele o recomeco sortearia entre todos os versiculos).
        await prisma.configCanal.update({ where: { canal: "MERCADO_LIVRE" }, data: { versiculosUsados: [...outros, `Salmos 119:${livre}`] } });
        const recomecou = await sortearVersiculoDoBanco({ excluir: outros, resto: "r".repeat(2000) });
        conferir("sorteio do banco: todos usados, o ciclo recomeca", [recomecou.versiculo?.inicio, recomecou.reiniciou], [livre, true]);
        conferir("sorteio do banco: nada cabe, sem versiculo", (await sortearVersiculoDoBanco({ resto: "curto" })).versiculo, null);

        const antesDeRemover = (await listarVersiculos()).length;
        conferir("remover id que nao existe", await removerVersiculo("id-que-nao-existe"), { ok: false, erro: "Versiculo nao encontrado." });
        conferir("remover sem id nao apaga nada", [(await removerVersiculo(undefined)).ok, (await listarVersiculos()).length], [false, antesDeRemover]);
        conferir("versiculo sai", [(await removerVersiculo(novo.id)).ok, (await listarVersiculos()).length], [true, atuais.length]);
        if (atuais.length > 0) conferir("carga inicial nao mexe em lista que ja tem versiculo", (await carregarVersiculosIniciais([sl23])).carregados, 0);
      } finally {
        await prisma.versiculo.deleteMany({ where: { texto: { in: textosDeTeste } } });
      }
    } finally {
      if (configAntes) {
        const dados = { frasesFixas: configAntes.frasesFixas, versiculosUsados: configAntes.versiculosUsados };
        await prisma.configCanal.upsert({ where: { canal: "MERCADO_LIVRE" }, create: { canal: "MERCADO_LIVRE", ...dados }, update: dados });
      } else {
        await prisma.configCanal.deleteMany({ where: { canal: "MERCADO_LIVRE" } });
      }
    }
  }

  // Blocos das tarefas seguintes entram aqui, antes do finally.
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTodos os testes de anuncios ML OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);
