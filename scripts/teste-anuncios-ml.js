import "dotenv/config";

/**
 * Testes do Canais de Venda / Mercado Livre (fase 1): o banco (varios anuncios por
 * produto, dados do anuncio, configuracao do canal) e, nas tarefas seguintes, as
 * regras puras e as acoes. Usa o Postgres, SEM rede.
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
const { montarDescricaoML } = await import("../src/lib/canaisDeVenda/ml/descricao.js");
const { rascunhoInicial, aplicarComposicao, descricaoDoRise, medidasDoKit } = await import("../src/lib/canaisDeVenda/ml/rascunho.js");
const { ABAS_ML, validarRascunhoML, medidasFaltando } = await import("../src/lib/canaisDeVenda/ml/validacao.js");
const { montarPayloadML, nomeDaFoto, eanDoKit } = await import("../src/lib/canaisDeVenda/ml/payload.js");
const { estadoDoIconeML, motivosDoProblemaML, rotuloDoIconeML, temProblemaNoIconeML } = await import("../src/lib/canaisDeVenda/ml/icone.js");
const{ RascunhoMLSchema, LIMITES_ML } = await import("../src/lib/canaisDeVenda/ml/esquema.js");
const {
  contextoDosProdutos,
  buscarProdutoParaAnuncio,
  novoRascunhoML,
  carregarAnuncioML,
  codigoEmUso,
  sugerirCodigoDeKit,
  salvarPresoML,
  salvarRascunhoML,
  clonarRascunhoML,
  anunciosMLDoProduto,
  listarAnunciosML,
} = await import("../src/lib/canaisDeVenda/ml/banco.js");
const { separarCanais, anuncioPorCanal } = await import("../src/lib/canais.js");
const { lerDecimal, textoDecimal, filtrarDecimal, mostrarDigitado, recusarSimbolosDeInteiro } = await import("../src/components/anuncios/ml/numeros.js");

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
      Array(6).fill("Item 1: a quantidade deve ser um número inteiro de 1 a 9999."));
    conferir("menos de 2 unidades", errosDaComposicao([{ produtoId: "a", quantidade: 1 }]), ["A composição precisa de ao menos 2 unidades."]);
    conferir("produto repetido", errosDaComposicao([{ produtoId: "a", quantidade: 1 }, { produtoId: "a", quantidade: 1 }]), ["O mesmo produto aparece em mais de um item."]);
    conferir("sem itens", errosDaComposicao([]), ["Inclua ao menos um produto na composição."]);
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
    // Descricao importada do Bling: a lista vem colada na Garantia, sem linha em branco.
    conferir("troca a secao colada na Garantia sem apagar a garantia",
      trocarItensInclusos("Texto.\n\nItens inclusos: (Cod:100101)\n- 01 Resistor;\n- 02 Led;\nGarantia:\n- 90 dias;", "Itens inclusos: (Cod:K1)\n- 02 X;"),
      "Texto.\n\nItens inclusos: (Cod:K1)\n- 02 X;\nGarantia:\n- 90 dias;");
    conferir("troca a secao colada em outro titulo sem apagar o que vem depois",
      trocarItensInclusos("Itens inclusos: (Cod:100101)\n- 01 Resistor;\nEspecificacoes tecnicas:\n- Tensao: 5V;", "Itens inclusos: (Cod:K1)\n- 02 X;"),
      "Itens inclusos: (Cod:K1)\n- 02 X;\nEspecificacoes tecnicas:\n- Tensao: 5V;");
    conferir("sem secao, entra antes da Garantia",trocarItensInclusos("Texto.\n\nGarantia:\n- 90 dias;", "Itens inclusos:\n- 02 X;"),
      "Texto.\n\nItens inclusos:\n- 02 X;\n\nGarantia:\n- 90 dias;");
    conferir("sem secao nem Garantia, vai no fim", trocarItensInclusos("Texto.", "Itens inclusos:\n- 02 X;"), "Texto.\n\nItens inclusos:\n- 02 X;");
    conferir("proximo da faixa 25xxxx", proximoCodigoDaFaixa(["250001", "250010", "100101", "250010_5"]), "250011");
    conferir("faixa vazia comeca em 250001", proximoCodigoDaFaixa([]), "250001");
    conferir("faixa cheia", proximoCodigoDaFaixa(["259999"]), null);
    conferir("custo do fornecedor padrão", custoDoProduto({ fornecedores: [{ padrao: false, precoCusto: 3 }, { padrao: true, precoCusto: 12.5 }], fornecedorRascunho: { precoCusto: 9 }, custo: 7 }), { valor: 12.5, origem: "fornecedor padrão" });
    conferir("sem padrao, rascunho do Bling", custoDoProduto({ fornecedores: [], fornecedorRascunho: { precoCusto: 9 }, custo: 7 }), { valor: 9, origem: "rascunho do Bling" });
    conferir("sem os dois, cadastro", custoDoProduto({ fornecedores: [], fornecedorRascunho: null, custo: 7 }), { valor: 7, origem: "cadastro" });
    conferir("sem custo nenhum", custoDoProduto({ fornecedores: [], fornecedorRascunho: null, custo: null }), { valor: null, origem: null });
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
  const simples = rascunhoInicial({ principal: a, produtosPorId: { a }, composicao: null });
  const kit = rascunhoInicial({ principal: a, produtosPorId: { a }, composicao: { itens: [{ produtoId: "a", quantidade: 5 }], codigo: "", blingProdutoId: null } });
  const misto = aplicarComposicao(kit, { itens: [{ produtoId: "a", quantidade: 2 }, { produtoId: "b", quantidade: 3 }], codigo: "", blingProdutoId: null }, { a, b });

  {
    console.log("\nDescricao e rascunho inicial");

    // As frases fixas sairam do Rise em 22/10/2026 (pedido do dono): o texto final e so a descricao.
    conferir("descricao aparada, sem frases fixas", montarDescricaoML({ descricao: "Texto.\n", frases: ["Nota fiscal."] }), "Texto.");
    // Teste real de 08/10/2026: o ML recusou "<b>tag</b>" ("The description must be in plain text", nas
    // posicoes das etiquetas). Sai so o que tem forma de etiqueta; "< 5V" e "<5V" sao texto e ficam.
    conferir("descricao: etiqueta HTML sai, o resto fica", montarDescricaoML({ descricao: "Linha 1 com <b>tag</b> & e-comercial\nTensão <5V e < 3,3 V; a<b" }), "Linha 1 com tag & e-comercial\nTensão <5V e < 3,3 V; a<b");
    conferir("sem descricao, texto vazio", montarDescricaoML({ descricao: "  " }), "");
    // Teste real de 27/10/2026 (kit 900212): "20mΩ" fez o ML recusar a descricao inteira; acento, "°" e CRLF passam.
    conferir("descricao: fora do Latin-1 vira texto ou sai", montarDescricaoML({ descricao: "20mΩ e 5000MΩ;\r\n180° – 5μA 😀" }), "20mOhm e 5000MOhm;\r\n180° - 5µA ");
    // A descricao do anuncio e sempre a do produto (pedido do dono em 22/10/2026); no kit, com os Itens inclusos do kit.
    conferir("descricaoDoRise: simples = a do produto", descricaoDoRise({ ...simples, descricao: "editada" }, { a, b }), a.descricaoBase);
    // Kit: a descricao e editavel no anuncio (27/10/2026); so o bloco "Itens inclusos" e refeito. Vazia, parte da do principal.
    conferir("descricaoDoRise: kit editado = o texto do anuncio com os Itens inclusos do kit", descricaoDoRise({ ...misto, descricao: "editada", descricaoEditada: true }, { a, b }),
      "editada\n\nItens inclusos:\n- 02 Resistor 1K 1/4W;\n- 03 Resistor 2K2 1/4W;");
    // 28/10/2026: o kit que o dono nao editou acompanha a descricao do produto base (mudou no produto, o kit acusa).
    conferir("descricaoDoRise: kit nao editado acompanha a do produto base", descricaoDoRise({ ...misto, descricao: "texto velho do kit" }, { a, b }), misto.descricao);
    conferir("descricaoDoRise: kit sem texto = a do principal com os Itens inclusos do kit", descricaoDoRise({ ...misto, descricao: "" }, { a, b }), misto.descricao);
    {
      // Peso e medidas do kit pela quantidade (27/10/2026): comprimento e largura da maior peca, altura somada; o que o
      // dono digitou fica, a medida de UMA unidade do principal e trocada.
      const p = { id: "p", sku: "P1", pesoKg: 0.002, comprimentoCm: 4.6, larguraCm: 0.24, alturaCm: 1.17 };
      const kit = { itens: [{ produtoId: "p", quantidade: 10 }] };
      const daUnidade = medidasDoKit({ pesoKg: 0.02, comprimentoCm: 4.6, larguraCm: 0.24, alturaCm: 1.17 }, kit, { p });
      conferir("medidasDoKit: altura x10, comprimento e largura da peca", [daUnidade.comprimentoCm, daUnidade.larguraCm, daUnidade.alturaCm], [4.6, 0.24, 11.7]);
      conferir("medidasDoKit: digitado pelo dono fica", medidasDoKit({ alturaCm: 3 }, kit, { p }).alturaCm, 3);
      conferir("medidasDoKit: sugestao anterior troca pela nova", medidasDoKit({ alturaCm: 11.7 }, { itens: [{ produtoId: "p", quantidade: 5 }] }, { p }, kit).alturaCm, 5.85);
    }
    conferir("descricaoDoRise: sem o produto, null", descricaoDoRise({ ...simples, produtoId: "x" }, { a, b }), null);
    conferir("contexto de teste: descricao longa com Itens inclusos e Garantia",
      [a.descricaoBase.length >= 400, a.descricaoBase.includes("Itens inclusos: (Cod:100101)"), a.descricaoBase.includes("Garantia:")], [true, true, true]);

    conferir("simples: titulo, preco e estoque do produto", [simples.titulo, simples.preco, simples.estoque], ["Resistor 1K 1/4W", 0.5, 100]);
    conferir("simples: Classico, novo, sem categoria", [simples.tipoAnuncio, simples.condicao, simples.categoriaId], ["gold_special", "new", null]);
    conferir("simples: atributos da marca e do EAN", simples.atributos, { BRAND: "GENERICA", GTIN: "7890000000001" });
    conferir("simples: fotos com a principal primeiro", simples.imagens, ["img-a1", "img-a2"]);
    conferir("simples: family_name e a marca quando nao ha modelo", simples.familyName, "GENERICA");
    conferir("simples: produto e descricao inteira do produto", [simples.produtoId, simples.descricao], ["a", a.descricaoBase]);
    conferir("simples: os campos do rascunho", Object.keys(simples).sort(),
      ["atacado", "atributos", "categoriaId", "categoriaNome", "composicao", "condicao", "descricao", "envio", "estoque", "familyName", "imagens", "prazoDisponibilidadeDias", "preco", "produtoId", "tipoAnuncio", "titulo"]);
    conferir("simples: envio pelo Mercado Envios 2, com as medidas do produto", simples.envio,
      { pesoKg: 0.001, alturaCm: 1, larguraCm: 1, comprimentoCm: 2, modo: "me2", logistica: "xd_drop_off", freteGratis: false, retirada: false });
    conferir("simples: sem composicao", simples.composicao, null);
    conferir("simples: foto principal vem primeiro mesmo fora de ordem",
      rascunhoInicial({ principal: { ...a, imagens: [...a.imagens].reverse() }, produtosPorId: {}, composicao: null }).imagens, ["img-a1", "img-a2"]);
    conferir("simples: sem marca, modelo nem EAN", rascunhoInicial({ principal: { ...a, marca: null, ean: "" }, produtosPorId: {}, composicao: null }).atributos, {});
    conferir("simples: family_name sem marca nem modelo e o titulo",
      rascunhoInicial({ principal: { ...a, marca: null }, produtosPorId: {}, composicao: null }).familyName, "Resistor 1K 1/4W");
    conferir("simples: family_name com marca e modelo, e atributo MODEL",
      (({ familyName, atributos }) => [familyName, atributos.MODEL])(rascunhoInicial({ principal: { ...a, modelo: "R1K" }, produtosPorId: {}, composicao: null })),
      ["GENERICA R1K", "R1K"]);
    conferir("simples: produto sem preco fica sem preco", rascunhoInicial({ principal: { ...a, precoVenda: null }, produtosPorId: {}, composicao: null }).preco, null);

    conferir("kit de um produto: codigo gerado", kit.composicao.codigo, "100101_5");
    conferir("kit: preco em branco, estoque e peso calculados", [kit.preco, kit.estoque, kit.envio.pesoKg], [null, 20, 0.005]);
    conferir("kit: sem GTIN", "GTIN" in kit.atributos, false);
    // "10x BARRA DE PINOS ..." (pedido do dono em 28/10/2026; era "KIT COM 5 ...").
    conferir("kit: titulo sugere o kit pela quantidade", kit.titulo, "5x RESISTOR 1K 1/4W");
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
      rascunhoInicial({ principal: a, produtosPorId: { b }, composicao: { itens: [{ produtoId: "a", quantidade: 2 }, { produtoId: "b", quantidade: 3 }], codigo: "KIT-1", blingProdutoId: null } })
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
    const editado = { ...misto, titulo: "Titulo do dono", preco: 9.9, categoriaId: "MLB1234", familyName: "Familia", tipoAnuncio: "gold_pro", condicao: "used", atributos: { BRAND: "OUTRA", MODEL: "M1" } };
    conferir("desligar nao toca no que o dono editou",
      (({ titulo, preco, categoriaId, familyName, tipoAnuncio, condicao }) => ({ titulo, preco, categoriaId, familyName, tipoAnuncio, condicao }))(aplicarComposicao(editado, null, { a, b })),
      { titulo: "Titulo do dono", preco: 9.9, categoriaId: "MLB1234", familyName: "Familia", tipoAnuncio: "gold_pro", condicao: "used" });

    // O GTIN e do codigo de barras da peca avulsa: o kit nao o herda, e ao desligar o kit ele volta.
    const umKit = { itens: [{ produtoId: "a", quantidade: 2 }], codigo: "", blingProdutoId: null };
    conferir("GTIN: simples vira kit e perde o GTIN, a marca fica", aplicarComposicao(simples, umKit, { a }).atributos, { BRAND: "GENERICA" });
    conferir("GTIN: kit volta a simples e recupera o GTIN do principal", aplicarComposicao(kit, null, { a }).atributos, { BRAND: "GENERICA", GTIN: "7890000000001" });
    const simplesEditado = { ...simples, atributos: { BRAND: "OUTRA", MODEL: "M1", GTIN: "7890000000001" } };
    const kitEditado = aplicarComposicao(simplesEditado, umKit, { a });
    conferir("GTIN: marca e modelo do dono sobrevivem a ida e a volta",
      [kitEditado.atributos, aplicarComposicao(kitEditado, null, { a }).atributos],
      [{ BRAND: "OUTRA", MODEL: "M1" }, { BRAND: "OUTRA", MODEL: "M1", GTIN: "7890000000001" }]);
    const simplesDeB = rascunhoInicial({ principal: b, produtosPorId: { b }, composicao: null });
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

    conferir("abas do editor", ABAS_ML.map((x) => x.id), ["status", "geral", "imagens", "descricao", "ficha", "preco", "catalogo", "envio"]);
    conferir("base simples: nenhum problema", validarRascunhoML(base, ctx), []);
    conferir("kit pronto: nenhum problema bloqueante", validarRascunhoML(kitOk, ctx).filter((p) => p.bloqueante), []);
    conferir("kit misto pronto: nenhum problema bloqueante", validarRascunhoML(mistoOk, ctx).filter((p) => p.bloqueante), []);

    conferir("titulo vazio", onde(problema({ ...base, titulo: " " }, ctx, "titulo")), ["geral", true]);
    conferir("titulo com 61", onde(problema({ ...base, titulo: "X".repeat(61) }, ctx, "titulo")), ["geral", true]);
    conferir("titulo com 61: mensagem", problema({ ...base, titulo: "X".repeat(61) }, ctx, "titulo").problema, "O título tem 61 caracteres; o limite do Mercado Livre é 60.");
    conferir("titulo com 60 serve", problema({ ...base, titulo: "X".repeat(60) }, ctx, "titulo"), undefined);
    conferir("family_name proprio nao e exigido (vai o titulo)", onde(problema({ ...base, familyName: "" }, ctx, "familyName")), [null, null]);
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
    conferir("descricao curta serve: so a vazia e problema", validarRascunhoML({ ...base, descricao: "curta" }, { ...ctx, frases: [] }), []);
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
    conferir("produto nao Conferido: mensagem", problema(base, comProduto("a", { conferido: false }), "produto").problema, "Este produto não está Conferido. Só produto Conferido vira anúncio.");
    conferir("produto sem blingId", onde(problema(base, comProduto("a", { blingId: null }), "blingId")), ["geral", true]);
    conferir("produto sem blingId: mensagem", problema(base, comProduto("a", { blingId: null }), "blingId").problema, "Produto sem blingId: o anúncio não poderá ser publicado.");
    conferir("produto que sumiu do contexto", onde(problema(base, { ...ctx, produtos: {} }, "produto")), ["geral", true]);

    conferir("kit: codigo em uso", onde(problema(kitOk, { ...ctx, codigoEmUso: "o produto 100101_5 do cadastro" }, "codigoKit")), ["geral", true]);
    conferir("kit: codigo em uso, mensagem", problema(kitOk, { ...ctx, codigoEmUso: "o produto 100101_5 do cadastro" }, "codigoKit").problema,
      "O código 100101_5 já está em uso: o produto 100101_5 do cadastro.");
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
    // Kit clonado sem o motivo (28/10/2026): o EAN do kit conta como GTIN, e a ficha nao pede o motivo.
    {
      const { problemasDosAtributos } = await import("../src/lib/canaisDeVenda/ml/atributos.js");
      const gtin = { id: "GTIN", nome: "Código universal", obrigatorio: false, valores: [] };
      conferir("kit com EAN do kit e sem motivo: sem problema de GTIN",
        problemasDosAtributos({}, [gtin], { kit: true, gtinDoKit: "2000900212501" }).some((p) => p.campo === "GTIN"), false);
      conferir("kit sem EAN do kit e sem motivo: pede o motivo",
        problemasDosAtributos({}, [gtin], { kit: true, gtinDoKit: null }).some((p) => p.campo === "GTIN" && p.bloqueante), true);
      conferir("eanDoKit: o clone com 50 ganha outro EAN", eanDoKit({ codigo: "900212_50" }), "2000900212501");
    }
    conferir("produto simples nao tem aviso de foto do kit", problema(base, ctx, "fotosDoKit"), undefined);

    // EAN interno do kit (27/10/2026): sai dos digitos do codigo do kit e vai no lugar do motivo de nao ter GTIN.
    conferir("eanDoKit: 900212_10 = 2000900212105", eanDoKit({ codigo: "900212_10" }), "2000900212105");
    conferir("eanDoKit: sem digitos = null", eanDoKit({ codigo: "ABC" }), null);
    {
      const doKit = montarPayloadML({ ...kitOk, atributos: { ...kitOk.atributos, EMPTY_GTIN_REASON: "O produto é um kit ou pack" } }, ctx).item.attributes;
      conferir("payload do kit: GTIN do kit e sem o motivo", [doKit.some((a) => a.id === "GTIN" && a.value_name === eanDoKit(kitOk.composicao)), doKit.some((a) => a.id === "EMPTY_GTIN_REASON")], [Boolean(eanDoKit(kitOk.composicao)), !eanDoKit(kitOk.composicao)]);
    }

    const payload = montarPayloadML(base, ctx);
    conferir("payload nasce pausado, com o preco no item", [payload.item.status, payload.item.price], ["paused", 0.5]);
    conferir("payload leva o SKU do produto", payload.item.attributes.find((x) => x.id === "SELLER_SKU").value_name, "100101");
    const semFreteMarcado = { ...base, preco: 99, envio: { ...base.envio, freteGratis: false } };
    conferir("payload: frete gratis vai marcado a partir de R$ 79", montarPayloadML(semFreteMarcado, ctx).item.shipping.free_shipping, true);
    conferir("payload: abaixo de R$ 79 segue a escolha do dono", montarPayloadML({ ...semFreteMarcado, preco: 50 }, ctx).item.shipping.free_shipping, false);
    conferir("payload do kit leva o codigo do kit", montarPayloadML(kitOk, ctx).item.attributes.find((x) => x.id === "SELLER_SKU").value_name, "100101_5");
    // Desde 27/10/2026 o kit leva o EAN interno DELE (eanDoKit), nunca o GTIN da peca avulsa.
    conferir("payload do kit leva o EAN do kit", montarPayloadML(kitOk, ctx).item.attributes.filter((x) => x.id === "GTIN").map((x) => x.value_name), [eanDoKit(kitOk.composicao)]);
    // O cliente tira o GTIN ao virar kit, mas o servidor aceita o que vier: o payload barra tambem.
    conferir("payload do kit com GTIN no rascunho: vai o do kit, nao o da peca",
      montarPayloadML({ ...kitOk, atributos: { ...kitOk.atributos, GTIN: "7890000000001" } }, ctx).item.attributes.filter((x) => x.id === "GTIN").map((x) => x.value_name), [eanDoKit(kitOk.composicao)]);
    conferir("payload: atributos da ficha e o SKU", payload.item.attributes.filter((x) => !x.id.startsWith("SELLER_PACKAGE_")),
      [{ id: "BRAND", value_name: "GENERICA" }, { id: "GTIN", value_name: "7890000000001" }, { id: "SELLER_SKU", value_name: "100101" }]);
    conferir("preco vai a parte", payload.preco, { amount: 0.5, currency_id: "BRL" });
    conferir("descricao final no payload: so a descricao do produto", payload.descricao.plain_text, montarDescricaoML({ descricao: a.descricaoBase }));
    conferir("payload: titulo, familia, categoria, estoque, tipo e condicao",
      ["title" in payload.item, payload.item.family_name, payload.item.category_id, payload.item.available_quantity, payload.item.currency_id, payload.item.listing_type_id, payload.item.condition],
      [false, "Resistor 1K 1/4W", "MLB1234", 100, "BRL", "gold_special", "new"]);
    // Marca e Modelo vao em MAIUSCULAS (acento incluso); os demais atributos ficam como foram digitados.
    conferir("payload: marca e modelo em maiusculas, o resto intacto",
      montarPayloadML({ ...base, atributos: { BRAND: "Arduino", MODEL: "uno r3 ação", COLOR: "Azul", GTIN: "7890000000001" } }, ctx).item.attributes.filter((x) => !x.id.startsWith("SELLER_PACKAGE_")),
      [{ id: "BRAND", value_name: "ARDUINO" }, { id: "MODEL", value_name: "UNO R3 AÇÃO" }, { id: "COLOR", value_name: "Azul" }, { id: "GTIN", value_name: "7890000000001" }, { id: "SELLER_SKU", value_name: "100101" }]);
    conferir("payload: marca em branco continua fora", montarPayloadML({ ...base, atributos: { BRAND: "  ", MODEL: "m1" } }, ctx).item.attributes.filter((x) => !x.id.startsWith("SELLER_PACKAGE_")).map((x) => x.id), ["MODEL", "SELLER_SKU"]);
    conferir("payload: titulo cortado em 60",montarPayloadML({ ...base, titulo: "X".repeat(70) }, ctx).item.family_name, "X".repeat(60));
    // Pedido do dono em 26/10/2026: condicao sempre "novo"; o prazo de disponibilidade (MANUFACTURING_TIME, em dias) e a
    // garantia do PRODUTO BASE (WARRANTY_TYPE "Garantia do vendedor" + WARRANTY_TIME em meses) vao ao ML. Medido na categoria
    // MLB99779 em 26/10/2026: WARRANTY_TYPE 2230280 = Garantia do vendedor; WARRANTY_TIME em dias/meses/anos; MANUFACTURING_TIME
    // em dias.
    {
      // Aba Catalogo (26/10/2026): os catalogos em que o dono concorre sao os dos anuncios publicados, e o Rise acompanha
      // sozinho o primeiro deles quando o acompanhado nao e um deles.
      const { catalogosDosAnuncios, catalogoParaAcompanhar } = await import("../src/lib/canaisDeVenda/ml/estadoNoML.js");
      const comCatalogo = (idExterno, id, extra = {}) => ({ idExterno, status: "PUBLICADO", situacaoCanal: "ATIVA", dados: { tipoAnuncio: "gold_special", publicacao: { estadoML: { catalogo: id ? { id, nome: `Cat ${id}` } : null } } }, ...extra });
      const lidos = catalogosDosAnuncios([
        comCatalogo("MLB1", "MLBA"),
        comCatalogo("MLB2", "MLBA"),
        comCatalogo("MLB3", "MLBB"),
        comCatalogo("MLB4", null),
        comCatalogo("MLB5", "MLBC", { situacaoCanal: "ENCERRADA" }),
        comCatalogo("MLB6", "MLBD", { status: "RASCUNHO" }),
      ]);
      conferir("catalogos dos anuncios: sem repetir, so publicados e nao encerrados", lidos.map((c) => [c.id, c.anuncios.map((a) => a.idExterno)]), [["MLBA", ["MLB1", "MLB2"]], ["MLBB", ["MLB3"]]]);
      conferir("acompanhar: o acompanhado ja e um deles, nada muda", catalogoParaAcompanhar("MLBB", lidos), null);
      conferir("acompanhar: sem acompanhado, o primeiro", catalogoParaAcompanhar(null, lidos)?.id, "MLBA");
      conferir("acompanhar: acompanhado antigo fora da lista, troca para o primeiro", catalogoParaAcompanhar("MLBZ", lidos)?.id, "MLBA");
      conferir("acompanhar: fora de catalogo, nada", catalogoParaAcompanhar("MLBZ", []), null);

      // A linha do catalogo (26/10/2026): anuncios, vendedores, a posicao do dono, o 1o e o preco dele.
      const { posicaoNoCatalogo } = await import("../src/lib/canaisDeVenda/ml/catalogo.js");
      const lido = {
        total: 4,
        itens: [
          { posicao: 1, vendedorId: "1", preco: 28.9, meu: false },
          { posicao: 2, vendedorId: "2", preco: 29.5, meu: false },
          { posicao: 3, vendedorId: "eu", preco: 31.49, meu: true },
          { posicao: 4, vendedorId: "2", preco: 29.9, meu: false },
        ],
      };
      conferir("linha do catalogo: 3o de 4, 3 vendedores, 1o a 28,90 e eu a 31,49", posicaoNoCatalogo(lido), {
        anuncios: 4, vendedores: 3, completo: true, minhaPosicao: 3, primeiroPreco: 28.9, primeiroEhMeu: false, meuPreco: 31.49,
      });
      conferir("linha do catalogo: catalogo vazio", posicaoNoCatalogo({ total: 0, itens: [] }).minhaPosicao, null);

      // O popup: os 10 primeiros e, se o anuncio aberto estiver abaixo, "⋯" e a linha dele no fim.
      const { linhasDoCatalogo } = await import("../src/lib/canaisDeVenda/ml/catalogo.js");
      const vinte = Array.from({ length: 20 }, (_, i) => ({ itemId: `MLB${i + 1}`, posicao: i + 1 }));
      conferir("popup: aberto em 20o vai no fim, depois do 10o", linhasDoCatalogo(vinte, "MLB20").map((l) => l.posicao ?? "..."), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, "...", 20]);
      conferir("popup: aberto entre os 10, sem linha a mais", linhasDoCatalogo(vinte, "MLB2").length, 10);
      conferir("popup: anuncio fora do catalogo, so os 10", linhasDoCatalogo(vinte, "MLB99").length, 10);
      conferir("popup: ganhador em 15o e aberto em 20o vao no fim, na ordem", linhasDoCatalogo(vinte, "MLB20", 10, "MLB15").map((l) => l.posicao ?? "..."), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, "...", 15, 20]);
      conferir("popup: ganhador entre os 10, sem linha a mais", linhasDoCatalogo(vinte, null, 10, "MLB3").length, 10);

      // Quem ganha o catalogo (08/11/2026): o price_to_win do nosso anuncio, medido no MLB5513608473 (listed, prazo de fabricacao).
      const { disputaDoPrecoParaGanhar, textoDaDisputa } = await import("../src/lib/canaisDeVenda/ml/catalogo.js");
      const medida = disputaDoPrecoParaGanhar({ status: "listed", price_to_win: 27.5, reason: ["manufacturing_time"], winner: { item_id: "MLB2652746578", price: 26 } }, "MLB5513608473");
      conferir("disputa: ganhador e o do winner, nao o 1o da lista", [medida.ganhadorId, medida.ganhadorPreco], ["MLB2652746578", 26]);
      conferir("disputa: fora da disputa com o motivo", textoDaDisputa(medida), { texto: "Você está fora da disputa: o anúncio tem prazo de fabricação.", ganhando: false });
      conferir("disputa: ganhando", textoDaDisputa({ ...medida, status: "winning", motivos: [] }).ganhando, true);
      conferir("disputa: competindo com o preco para ganhar", textoDaDisputa({ ...medida, status: "competing", motivos: [], precoParaGanhar: 25.9 }).texto, "Você compete, mas não está ganhando; para ganhar: R$ 25,90.");
      conferir("disputa: motivo desconhecido sai com o codigo", textoDaDisputa({ ...medida, motivos: ["novo_motivo"] }).texto, "Você está fora da disputa: novo_motivo.");
      conferir("disputa: resposta vazia nao marca nada", [disputaDoPrecoParaGanhar(null, "MLB1"), textoDaDisputa(null)], [null, null]);
    }
    {
      // Peso e medidas do anuncio SIMPLES sao sempre os do produto (26/10/2026, no molde da LI): a aba so os mostra. O kit
      // monta os dele (editaveis).
      const { pacoteDoRise } = await import("../src/lib/canaisDeVenda/ml/rascunho.js");
      conferir(
        "pacote do anuncio simples: o do produto",
        pacoteDoRise({ ...base, envio: { pesoKg: 9, alturaCm: 9, larguraCm: 9, comprimentoCm: 9 } }, { a: { ...aOk, pesoKg: 0.007, alturaCm: 1.9, larguraCm: 1.8, comprimentoCm: 4.3 } }),
        { pesoKg: 0.007, alturaCm: 1.9, larguraCm: 1.8, comprimentoCm: 4.3 },
      );
      conferir("pacote do kit: o do proprio kit (nulo = nao mexe)", pacoteDoRise(kitOk, ctx.produtos), null);
    }
    conferir("payload: condicao sempre novo, mesmo com o rascunho antigo em usado", montarPayloadML({ ...base, condicao: "used" }, ctx).item.condition, "new");
    conferir(
      "payload: garantia do produto e prazo de disponibilidade",
      montarPayloadML({ ...base, prazoDisponibilidadeDias: 1 }, comProduto("a", { garantiaMeses: 3 })).item.sale_terms,
      [{ id: "WARRANTY_TYPE", value_id: "2230280", value_name: "Garantia do vendedor" }, { id: "WARRANTY_TIME", value_name: "3 meses" }, { id: "MANUFACTURING_TIME", value_name: "1 dias" }],
    );
    conferir(
      "payload: sem garantia no produto e prazo zero, nada vai",
      montarPayloadML({ ...base, prazoDisponibilidadeDias: 0 }, comProduto("a", { garantiaMeses: null })).item.sale_terms,
      [],
    );
    conferir("payload: garantia de 1 mes no singular", montarPayloadML({ ...base, prazoDisponibilidadeDias: 0 }, comProduto("a", { garantiaMeses: 1 })).item.sale_terms[1], { id: "WARRANTY_TIME", value_name: "1 mês" });
    {
      const { RascunhoMLSchema: Esquema } = await import("../src/lib/canaisDeVenda/ml/esquema.js");
      const semPrazo = { ...base };
      delete semPrazo.prazoDisponibilidadeDias;
      conferir(
        "esquema: o prazo passa, e o rascunho de antes (sem o campo) fica em pronta entrega (0, desde 08/11/2026)",
        [Esquema.safeParse({ ...base, prazoDisponibilidadeDias: 3 }).data?.prazoDisponibilidadeDias, Esquema.safeParse(semPrazo).data?.prazoDisponibilidadeDias],
        [3, 0],
      );
      // Anuncio JA publicado: a lista sem o prazo da 200 e o ML mantem o prazo (medido em 08/11/2026); vai com valor nulo.
      const { termosParaAtualizar } = await import("../src/lib/canaisDeVenda/ml/payload.js");
      conferir(
        "atualizar: prazo 0 manda o MANUFACTURING_TIME nulo e mantem a garantia",
        termosParaAtualizar({ ...base, prazoDisponibilidadeDias: 0 }, comProduto("a", { garantiaMeses: 3 })),
        [{ id: "WARRANTY_TYPE", value_id: "2230280", value_name: "Garantia do vendedor" }, { id: "WARRANTY_TIME", value_name: "3 meses" }, { id: "MANUFACTURING_TIME", value_id: null, value_name: null }],
      );
      conferir(
        "atualizar: prazo 2 vai como antes",
        termosParaAtualizar({ ...base, prazoDisponibilidadeDias: 2 }, comProduto("a", { garantiaMeses: null })),
        [{ id: "MANUFACTURING_TIME", value_name: "2 dias" }],
      );
    }
    conferir("prazo de disponibilidade: inteiro de 0 a 45", [problema({ ...base, prazoDisponibilidadeDias: 46 }, ctx, "prazoDisponibilidade")?.aba, problema({ ...base, prazoDisponibilidadeDias: 1.5 }, ctx, "prazoDisponibilidade")?.bloqueante, problema({ ...base, prazoDisponibilidadeDias: 10 }, ctx, "prazoDisponibilidade")], ["geral", true, undefined]);
    // Primeiro Publicar real (08/10/2026): o validador do ML recusou `shipping.dimensions` com decimais
    // ("Dimensions do not follow the pattern 20x30x40,50") e avisou que a conta nao tem ME1. No ME2 as
    // medidas vao so nos SELLER_PACKAGE_* (investigacao A7); `dimensions` e do ME1, e so em inteiros.
    conferir("payload: envio ME2 sem dimensions (as medidas vao nos SELLER_PACKAGE_*)", payload.item.shipping,
      { mode: "me2", logistic_type: "xd_drop_off", free_shipping: false, local_pick_up: false });
    conferir("payload: frete gratis e retirada", (({ free_shipping, local_pick_up }) => [free_shipping, local_pick_up])(montarPayloadML(comEnvio({ freteGratis: true, retirada: true }), ctx).item.shipping), [true, true]);
    conferir("payload: ME1 manda dimensions em inteiros", montarPayloadML(comEnvio({ modo: "me1", alturaCm: 1.2, larguraCm: 5.3, comprimentoCm: 6.8, pesoKg: 0.0244 }), ctx).item.shipping.dimensions, "2x6x7,24");
    conferir("payload: ME1 sem medida, sem dimensions", "dimensions" in montarPayloadML(comEnvio({ modo: "me1", alturaCm: null }), ctx).item.shipping, false);
    conferir("payload: ME1 sem peso, sem dimensions", "dimensions" in montarPayloadML(comEnvio({ modo: "me1", pesoKg: null }), ctx).item.shipping, false);
    conferir("payload: peso do kit em gramas no SELLER_PACKAGE_WEIGHT", montarPayloadML(kitOk, ctx).item.attributes.find((x) => x.id === "SELLER_PACKAGE_WEIGHT")?.value_name, "5 g");
    conferir("payload: fotos com o nome legivel", payload.fotos,
      [{ arquivoId: "img-a1", nome: "resistor-1k-1-4w-1.jpg" }, { arquivoId: "img-a2", nome: "resistor-1k-1-4w-2.jpg" }]);
    conferir("payload: pictures so com os nomes", payload.item.pictures, [{ nome: "resistor-1k-1-4w-1.jpg" }, { nome: "resistor-1k-1-4w-2.jpg" }]);
    conferir("nome legivel da foto", nomeDaFoto("Placa Uno R3 CH340 + Cabo", 0), "placa-uno-r3-ch340-cabo-1.jpg");
    conferir("nome da foto: sem acento, indice a partir de 1", nomeDaFoto("Conexão  Ação", 2), "conexao-acao-3.jpg");
    conferir("nome da foto: ate 60 caracteres, sem traco na ponta", nomeDaFoto(`${"a".repeat(59)} bbb`, 0), `${"a".repeat(59)}-1.jpg`);
    conferir("nome da foto: titulo sem letra nem numero", nomeDaFoto(" +/ ", 0), "anuncio-1.jpg");

    // Regra do dono em 24/10/2026: verde = publicado (ativo ou pausado sem estoque); "!" = so erro ou publicacao parada.
    const ml = (status, situacaoCanal) => ({ canal: "MERCADO_LIVRE", status, situacaoCanal });
    conferir("icone: sem anuncio", estadoDoIconeML([]), { publicado: false, pausado: false, erro: false, rascunho: false, desatualizado: false, naoConferido: false, partesDesatualizadas: [], precisaAgirNoML: false, estoqueDivergenteNoML: false, estoquesNoML: [], estadosNoML: [], catalogoMudouNoML: false, catalogosNoML: [], catalogos: 0 });
    conferir("icone: publicado e ativo, sem selo", estadoDoIconeML([ml("PUBLICADO", "ATIVA")]), { publicado: true, pausado: false, erro: false, rascunho: false, desatualizado: false, naoConferido: false, partesDesatualizadas: [], precisaAgirNoML: false, estoqueDivergenteNoML: false, estoquesNoML: [], estadosNoML: [], catalogoMudouNoML: false, catalogosNoML: [], catalogos: 0 });
    conferir("icone: publicado e pausado (sem estoque) continua verde e sem selo", estadoDoIconeML([ml("PUBLICADO", "PAUSADA")]), { publicado: true, pausado: true, erro: false, rascunho: false, desatualizado: false, naoConferido: false, partesDesatualizadas: [], precisaAgirNoML: false, estoqueDivergenteNoML: false, estoquesNoML: [], estadosNoML: [], catalogoMudouNoML: false, catalogosNoML: [], catalogos: 0 });
    conferir("icone: rascunho nao acende nada", estadoDoIconeML([ml("RASCUNHO")]), { publicado: false, pausado: false, erro: false, rascunho: true, desatualizado: false, naoConferido: false, partesDesatualizadas: [], precisaAgirNoML: false, estoqueDivergenteNoML: false, estoquesNoML: [], estadosNoML: [], catalogoMudouNoML: false, catalogosNoML: [], catalogos: 0 });
    for (const status of ["ERRO", "PUBLICANDO"]) {
      conferir(`icone: ${status} poe o selo`, estadoDoIconeML([ml(status, "PAUSADA")]).erro, true);
    }
    conferir("icone: encerrado nao e verde", estadoDoIconeML([ml("PUBLICADO", "ENCERRADA")]).publicado, false);
    conferir("icone: ativo e pausado juntos nao dizem pausado", estadoDoIconeML([ml("PUBLICADO", "ATIVA"), ml("PUBLICADO", "PAUSADA")]).pausado, false);
    conferir("icone: publicado e outro com erro: verde com selo", estadoDoIconeML([ml("PUBLICADO", "ATIVA"), ml("ERRO")]), { publicado: true, pausado: false, erro: true, rascunho: false, desatualizado: false, naoConferido: false, partesDesatualizadas: [], precisaAgirNoML: false, estoqueDivergenteNoML: false, estoquesNoML: [], estadosNoML: [], catalogoMudouNoML: false, catalogosNoML: [], catalogos: 0 });
    conferir("icone: anuncio de outro canal nao conta", estadoDoIconeML([{ canal: "BLING", status: "ERRO" }, { canal: "LOJA_INTEGRADA", status: "PUBLICADO", situacaoCanal: "ATIVA" }]).publicado, false);
    conferir("icone: lista invalida", estadoDoIconeML(undefined).erro, false);
    // O "!" de cada anuncio no popup do produto (pedido do dono em 09/11/2026: "mostra ! no icone do ML, porem no popup nao
    // mostra"): a mesma regra do icone, com o motivo em texto.
    const comPartes = (partes) => estadoDoIconeML([{ ...ml("PUBLICADO", "ATIVA"), mudancas: { partes, naoConferido: false } }]);
    conferir("problema do icone: publicado em dia nao tem", [temProblemaNoIconeML(estadoDoIconeML([ml("PUBLICADO", "ATIVA")])), motivosDoProblemaML(estadoDoIconeML([ml("PUBLICADO", "ATIVA")]))], [false, []]);
    conferir("problema do icone: erro na publicacao", [temProblemaNoIconeML(estadoDoIconeML([ml("ERRO")])), motivosDoProblemaML(estadoDoIconeML([ml("ERRO")]))], [true, ["com erro na publicação"]]);
    conferir("problema do icone: atacado e prazo alterados tem nome", motivosDoProblemaML(comPartes(["prazo", "atacado"])), ["desatualizado: prazo e atacado alterados, falta enviar ao ML"]);
    conferir("problema do icone: descricao e titulo mudaram no produto", motivosDoProblemaML(comPartes(["descricao", "titulo"])), ["desatualizado: título e descrição mudaram no produto"]);
    conferir("problema do icone: catalogo e estoque viram texto", motivosDoProblemaML({ catalogoMudouNoML: true, catalogosNoML: ["entrou no catálogo X"], estoqueDivergenteNoML: true, estoquesNoML: [{ ml: 3, bling: 5 }] }), ["estoque no ML 3, no Bling 5", "entrou no catálogo X"]);
    conferir("rotulo do icone: sem anuncio", rotuloDoIconeML({ publicado: false, erro: false }), "Anúncio no Mercado Livre: sem anúncio");
    conferir("rotulo do icone: publicado", rotuloDoIconeML({ publicado: true, erro: false }), "Anúncio no Mercado Livre: publicado");
    conferir("rotulo do icone: pausado sem estoque", rotuloDoIconeML({ publicado: true, pausado: true, erro: false }), "Anúncio no Mercado Livre: publicado, pausado (sem estoque)");
    conferir("rotulo do icone: com erro", rotuloDoIconeML({ publicado: false, erro: true }), "Anúncio no Mercado Livre: com erro na publicação");
    conferir("rotulo do icone: rascunho", rotuloDoIconeML({ publicado: false, erro: false, rascunho: true }), "Anúncio no Mercado Livre: rascunho, ainda não publicado");
    {
      // O Excluir confere no canal se o anuncio "publicado" ainda existe (Opcao 2 do dono em 24/10/2026).
      const { situacaoNoCanal } = await import("../src/lib/canaisDeVenda/anuncioNoCanal.js");
      const responde = (status, dados = {}) => ({ get: async () => ({ ok: status >= 200 && status < 300, status, dados }) });
      conferir("canal: LI 404 = sumiu", await situacaoNoCanal({ canal: "LOJA_INTEGRADA", idExterno: "1" }, { li: responde(404) }), "sumiu");
      conferir("canal: LI 200 = existe", await situacaoNoCanal({ canal: "LOJA_INTEGRADA", idExterno: "1" }, { li: responde(200, { id: 1 }) }), "existe");
      conferir("canal: LI 500 = desconhecido", await situacaoNoCanal({ canal: "LOJA_INTEGRADA", idExterno: "1" }, { li: responde(500) }), "desconhecido");
      conferir("canal: ML encerrado = sumiu", await situacaoNoCanal({ canal: "MERCADO_LIVRE", idExterno: "MLB1" }, { ml: responde(200, { status: "closed" }) }), "sumiu");
      conferir("canal: ML pausado = existe", await situacaoNoCanal({ canal: "MERCADO_LIVRE", idExterno: "MLB1" }, { ml: responde(200, { status: "paused" }) }), "existe");
      conferir("canal: ML 404 = sumiu", await situacaoNoCanal({ canal: "MERCADO_LIVRE", dados: { publicacao: { itemId: "MLB2" } } }, { ml: responde(404) }), "sumiu");
      conferir("canal: falha de rede = desconhecido", await situacaoNoCanal({ canal: "MERCADO_LIVRE", idExterno: "MLB1" }, { ml: { get: async () => { throw new Error("rede"); } } }), "desconhecido");
      conferir("canal: outro canal = desconhecido", await situacaoNoCanal({ canal: "BLING", idExterno: "1" }, {}), "desconhecido");
    }

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
    // O bloco antigo de Anuncios usa o mesmo Map: o publicado vence o rascunho, em qualquer ordem.
    const publicado = { canal: "MERCADO_LIVRE", status: "PUBLICADO", idExterno: "MLB1" };
    const rascunhoSolto = { canal: "MERCADO_LIVRE", status: "RASCUNHO", idExterno: null };
    conferir("anuncioPorCanal: o publicado vence o rascunho, em qualquer ordem",
      [anuncioPorCanal([publicado, rascunhoSolto]).get("MERCADO_LIVRE"), anuncioPorCanal([rascunhoSolto, publicado]).get("MERCADO_LIVRE")], [publicado, publicado]);
    conferir("anuncioPorCanal: um anuncio por canal continua igual",
      [...anuncioPorCanal([{ canal: "BLING", status: "PUBLICADO", idExterno: "1" }, rascunhoSolto]).entries()].map(([canal, a]) => [canal, a.status]),
      [["BLING", "PUBLICADO"], ["MERCADO_LIVRE", "RASCUNHO"]]);
  }

  {
    console.log("\nRascunho (banco)");
    await limpar();

    // O fornecedor de teste mora no banco de verdade (compartilhado): sai por nome, no comeco
    // (sobra de uma execucao morta) e no fim. O produto vai antes do fornecedor, porque o vinculo
    // ProdutoFornecedor e Restrict para o Fornecedor.
    const varrerExtras = () => prisma.fornecedor.deleteMany({ where: { nome: "ZZ Fornecedor ML" } });
    await varrerExtras();

    // A linha do canal (ConfigCanal) e dado real do dono e volta como estava no finally.
    const configAntes = await prisma.configCanal.findUnique({ where: { canal: "MERCADO_LIVRE" } });
    // O rascunho volta do banco com as chaves em outra ordem; a comparacao e pelo conteudo.
    const ordenado = (v) =>
      Array.isArray(v) ? v.map(ordenado)
        : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, ordenado(v[k])]))
          : v;
    const anuncioDe = (id) => prisma.anuncio.findUnique({ where: { id } });
    // So os anuncios dos produtos de teste: o banco e compartilhado e outras frentes gravam anuncios.
    const anunciosDeTeste = () => prisma.anuncio.count({ where: { produto: { sku: { startsWith: "ZZ-ML-" } } } });

    try {
      try {
        const fornecedor = await prisma.fornecedor.create({ data: { nome: "ZZ Fornecedor ML" } });
        const p1 = await prisma.produto.create({
          data: {
            sku: "ZZ-ML-1", tituloBase: "ZZ Produto um", descricaoBase: "Texto da descricao. ".repeat(75),
            marca: "ZZMARCA", modelo: "ZZ1", ean: "7891234567895",
            conferido: true, blingId: "111", precoVenda: 10, estoque: 9,
            pesoKg: 0.05, alturaCm: 2, larguraCm: 3, comprimentoCm: 4,
          },
        });
        const p2 = await prisma.produto.create({ data: { sku: "ZZ-ML-2", tituloBase: "ZZ Produto dois", conferido: true, blingId: "222", estoque: 7 } });
        // Sem Conferido, e com custo so no rascunho do Bling.
        const p3 = await prisma.produto.create({ data: { sku: "ZZ-ML-3", tituloBase: "ZZ Produto tres", fornecedorRascunho: { nome: "ZZ", precoCusto: 2.5 } } });
        const p4 = await prisma.produto.create({ data: { sku: "ZZ-ML-4", tituloBase: "ZZ Produto quatro", descricaoBase: "curta", conferido: true, custo: 3 } });
        await prisma.produtoFornecedor.create({ data: { produtoId: p1.id, fornecedorId: fornecedor.id, precoCusto: 4, padrao: true } });
        // A foto principal e a de ordem 1: a ordem do contexto e a do banco, a do rascunho poe a principal na frente.
        const fotoA = await prisma.produtoArquivo.create({ data: { produtoId: p1.id, tipo: "IMAGEM", arquivo: `${"a".repeat(32)}.jpg`, ordem: 0 } });
        const fotoB = await prisma.produtoArquivo.create({ data: { produtoId: p1.id, tipo: "IMAGEM", arquivo: `${"b".repeat(32)}.jpg`, ordem: 1, principal: true } });
        // Documento nao e foto de anuncio.
        await prisma.produtoArquivo.create({ data: { produtoId: p1.id, tipo: "DOCUMENTO", arquivo: `${"c".repeat(32)}.pdf`, ordem: 2 } });

        const ctx = await contextoDosProdutos([p1.id, p2.id, p3.id, p4.id, "id-que-nao-existe"]);
        conferir("contexto: so os produtos que existem", Object.keys(ctx).sort(), [p1.id, p2.id, p3.id, p4.id].sort());
        conferir("contexto: sem ids devolve vazio", await contextoDosProdutos([]), {});
        conferir("contexto: custo do fornecedor padrão", (await contextoDosProdutos([p1.id]))[p1.id].custo, { valor: 4, origem: "fornecedor padrão" });
        conferir("contexto: custo do rascunho do Bling", ctx[p3.id].custo, { valor: 2.5, origem: "rascunho do Bling" });
        conferir("contexto: custo do cadastro", ctx[p4.id].custo, { valor: 3, origem: "cadastro" });
        conferir("contexto: sem custo", ctx[p2.id].custo, { valor: null, origem: null });
        conferir("contexto: os campos que o rascunho le", Object.keys(ctx[p1.id]).sort(),
          ["alturaCm", "blingId", "comprimentoCm", "conferido", "custo", "descricaoBase", "ean", "estoque", "fotosDoKit", "garantiaMeses", "id", "imagens", "larguraCm", "marca", "modelo", "pesoKg", "precoVenda", "sku", "tituloBase"]);
        conferir("contexto: Decimal vira Number", [ctx[p1.id].precoVenda, ctx[p1.id].pesoKg, ctx[p1.id].alturaCm, ctx[p1.id].larguraCm, ctx[p1.id].comprimentoCm, ctx[p1.id].estoque], [10, 0.05, 2, 3, 4, 9]);
        conferir("contexto: sem preco nem peso e null, nao zero", [ctx[p2.id].precoVenda, ctx[p2.id].pesoKg], [null, null]);
        conferir("contexto: so fotos, na ordem do banco, com o endereco calculado", ctx[p1.id].imagens, [
          { id: fotoA.id, arquivo: fotoA.arquivo, url: `/api/arquivos/ZZ-ML-1/imagens/${fotoA.arquivo}`, principal: false, criadoEm: fotoA.criadoEm.toISOString() },
          { id: fotoB.id, arquivo: fotoB.arquivo, url: `/api/arquivos/ZZ-ML-1/imagens/${fotoB.arquivo}`, principal: true, criadoEm: fotoB.criadoEm.toISOString() },
        ]);

        conferir("busca por codigo acha o Conferido", (await buscarProdutoParaAnuncio("ZZ-ML-1")).produto.id, p1.id);
        conferir("busca: o codigo e aparado", (await buscarProdutoParaAnuncio("  ZZ-ML-1 ")).produto.id, p1.id);
        conferir("busca recusa o nao Conferido", (await buscarProdutoParaAnuncio("ZZ-ML-3")).erro, "O produto ZZ-ML-3 ainda não foi Conferido. Só produto Conferido vira anúncio.");
        conferir("busca: codigo que nao existe", (await buscarProdutoParaAnuncio("ZZ-ML-NAO")).erro, "Nenhum produto com o código ZZ-ML-NAO.");
        conferir("busca: o codigo e exato, nao parte dele", (await buscarProdutoParaAnuncio("ZZ-ML")).ok, false);
        conferir("busca: codigo vazio", (await buscarProdutoParaAnuncio("   ")).erro, "Informe o código do produto.");

        const novo = await novoRascunhoML(p1.id);
        conferir("novo rascunho nao grava nada", [novo.ok, await prisma.anuncio.count({ where: { produtoId: p1.id } })], [true, 0]);
        conferir("novo rascunho: contexto com produtos, frases e codigo em uso", [Object.keys(novo.contexto).sort(), Object.keys(novo.contexto.produtos), novo.contexto.codigoEmUso],
          [["codigoEmUso", "produtos"], [p1.id], null]);
        conferir("novo rascunho: parte do produto", [novo.rascunho.produtoId, novo.rascunho.titulo, novo.rascunho.preco, novo.rascunho.estoque, novo.rascunho.atributos],
          [p1.id, "ZZ Produto um", 10, 9, { BRAND: "ZZMARCA", MODEL: "ZZ1", GTIN: "7891234567895" }]);
        conferir("novo rascunho: fotos com a principal na frente", novo.rascunho.imagens, [fotoB.id, fotoA.id]);
        conferir("novo rascunho nao Conferido e recusado", (await novoRascunhoML(p3.id)).ok, false);
        conferir("novo rascunho nao Conferido: diz qual", (await novoRascunhoML(p3.id)).erro, "O produto ZZ-ML-3 ainda não foi Conferido. Só produto Conferido vira anúncio.");
        conferir("novo rascunho: produto que nao existe", (await novoRascunhoML("id-que-nao-existe")).erro, "Produto não encontrado.");
        const curto = await novoRascunhoML(p4.id);
        conferir("descricao curta: nasce sem erro, com a descricao do produto", [curto.ok, curto.rascunho.descricao], [true, "curta"]);

        const salvo = await salvarRascunhoML(null, { ...novo.rascunho, tipoAnuncio: "gold_special" });
        const premium = await salvarRascunhoML(null, { ...novo.rascunho, tipoAnuncio: "gold_pro" });
        conferir("salva dois rascunhos do mesmo produto", [salvo.ok, premium.ok, (await anunciosMLDoProduto(p1.id)).length], [true, true, 2]);
        conferir("salvo e RASCUNHO", (await anuncioDe(salvo.id)).status, "RASCUNHO");
        conferir("salvo no Mercado Livre, no produto", [(await anuncioDe(salvo.id)).canal, (await anuncioDe(salvo.id)).produtoId], ["MERCADO_LIVRE", p1.id]);
        conferir("anuncios do produto: a ficha de cada um, o mais recente primeiro", (await anunciosMLDoProduto(p1.id)).map((a) => [a.id, a.titulo, a.tipoAnuncio, a.codigo, a.status]),
          [[premium.id, "ZZ Produto um", "gold_pro", "ZZ-ML-1", "RASCUNHO"], [salvo.id, "ZZ Produto um", "gold_special", "ZZ-ML-1", "RASCUNHO"]]);
        conferir("anuncios do produto: tem a data da ultima alteracao", (await anunciosMLDoProduto(p1.id)).every((a) => a.atualizadoEm instanceof Date), true);
        conferir("anuncios do produto: produto sem anuncio", await anunciosMLDoProduto(p2.id), []);

        const lido = await carregarAnuncioML(salvo.id);
        conferir("carregar devolve o que foi salvo", [lido.rascunho.titulo, lido.rascunho.tipoAnuncio, lido.rascunho.envio.pesoKg], [novo.rascunho.titulo, "gold_special", 0.05]);
        conferir("carregar devolve o rascunho inteiro", ordenado(lido.rascunho), ordenado({ ...novo.rascunho, descricaoEditada: false, fotosReordenadas: false, fotosVistasEm: null, tipoAnuncio: "gold_special" }));
        conferir("carregar: anuncio, status e contexto", [lido.anuncioId, lido.status, Object.keys(lido.contexto.produtos), lido.contexto.codigoEmUso],
          [salvo.id, "RASCUNHO", [p1.id], null]);
        conferir("carregar: anuncio que nao existe", (await carregarAnuncioML("id-que-nao-existe")).erro, "Anúncio não encontrado.");
        conferir("carregar: sem id nao devolve outro anuncio", (await carregarAnuncioML(undefined)).ok, false);

        // Clonar (pedido do dono em 22/10/2026): um rascunho NOVO igual ao anuncio, do mesmo produto, para publicar
        // como outro tipo ou virar kit. Nada da publicacao vai junto, e nada e gravado ate o Salvar.
        const dadosDoSalvo = (await anuncioDe(salvo.id)).dados;
        await prisma.anuncio.update({ where: { id: salvo.id }, data: { status: "PUBLICADO", idExterno: "MLB1", urlExterna: "https://x", dados: { ...dadosDoSalvo, publicacao: { itemId: "MLB1", feitas: ["fotos"] } } } });
        const clone = await clonarRascunhoML(salvo.id);
        conferir("clonar: rascunho igual ao do anuncio, sem id nem status", [clone.ok, clone.anuncioId, clone.status, ordenado(clone.rascunho)], [true, undefined, undefined, ordenado((await carregarAnuncioML(salvo.id)).rascunho)]);
        conferir("clonar: diz de onde veio", clone.origem, { id: salvo.id, codigo: "ZZ-ML-1", titulo: "ZZ Produto um", idExterno: "MLB1" });
        conferir("clonar: nada e gravado ate o Salvar", (await anunciosMLDoProduto(p1.id)).length, 2);
        const salvoClone = await salvarRascunhoML(null, { ...clone.rascunho, tipoAnuncio: "gold_pro" });
        const gravadoClone = await anuncioDe(salvoClone.id);
        conferir("clonar: o Salvar cria outro anuncio do mesmo produto, como rascunho e sem publicacao", [salvoClone.ok, gravadoClone.status, gravadoClone.produtoId, gravadoClone.idExterno, gravadoClone.dados.publicacao, gravadoClone.dados.tipoAnuncio], [true, "RASCUNHO", p1.id, null, undefined, "gold_pro"]);
        conferir("clonar: anuncio que nao existe", (await clonarRascunhoML("id-que-nao-existe")).erro, "Anúncio não encontrado.");
        await prisma.anuncio.delete({ where: { id: salvoClone.id } });
        await prisma.anuncio.update({ where: { id: salvo.id }, data: { status: "RASCUNHO", idExterno: null, urlExterna: null, dados: dadosDoSalvo } });

        await prisma.produto.update({ where: { id: p1.id }, data: { conferido: false } });
        conferir("produto que deixou de ser Conferido: salvar recusa", (await salvarRascunhoML(salvo.id, lido.rascunho)).erro, "O produto ZZ-ML-1 não está mais Conferido. Confira o cadastro antes de salvar o anúncio.");
        conferir("produto que deixou de ser Conferido: o que estava salvo nao muda", [(await salvarRascunhoML(salvo.id, { ...lido.rascunho, titulo: "ZZ nao grava" })).ok, (await anuncioDe(salvo.id)).titulo], [false, novo.rascunho.titulo]);
        conferir("produto que deixou de ser Conferido: novo anuncio tambem recusa", (await salvarRascunhoML(null, novo.rascunho)).ok, false);
        conferir("produto que deixou de ser Conferido: o anuncio ainda abre", [(await carregarAnuncioML(salvo.id)).ok, (await carregarAnuncioML(salvo.id)).contexto.produtos[p1.id].conferido], [true, false]);
        await prisma.produto.update({ where: { id: p1.id }, data: { conferido: true } });

        // Produto excluido: o anuncio some junto (Cascade), entao so o rascunho ainda nao salvo, ou um item de kit, chega aqui.
        const efemero = await prisma.produto.create({ data: { sku: "ZZ-ML-5", tituloBase: "ZZ Efemero", conferido: true } });
        await prisma.produto.delete({ where: { id: efemero.id } });
        conferir("produto excluido: salvar recusa", (await salvarRascunhoML(null, { ...novo.rascunho, produtoId: efemero.id })).erro, "O produto do anúncio foi excluído.");
        conferir("item de kit excluido: salvar recusa", (await salvarRascunhoML(null, { ...novo.rascunho, composicao: { itens: [{ produtoId: p1.id, quantidade: 1 }, { produtoId: efemero.id, quantidade: 1 }], codigo: "250998", blingProdutoId: null } })).erro,
          "Um dos produtos da composição foi excluído.");
        conferir("item de kit nao Conferido recusa", (await salvarRascunhoML(null, { ...novo.rascunho, composicao: { itens: [{ produtoId: p1.id, quantidade: 1 }, { produtoId: p3.id, quantidade: 1 }], codigo: "250999", blingProdutoId: null } })).ok, false);
        conferir("item de kit nao Conferido: diz qual", (await salvarRascunhoML(null, { ...novo.rascunho, composicao: { itens: [{ produtoId: p1.id, quantidade: 1 }, { produtoId: p3.id, quantidade: 1 }], codigo: "250999", blingProdutoId: null } })).erro,
          "O produto ZZ-ML-3 não está mais Conferido. Confira o cadastro antes de salvar o anúncio.");

        // Cada campo do rascunho mora numa coluna; o que nao tem coluna vai para `dados`. O numero escrito
        // como texto ("12,5") e o campo vazio chegam da tela e viram numero e null.
        const completo = await salvarRascunhoML(null, { ...novo.rascunho, categoriaId: "MLB1234", preco: "12,5", estoque: "" });
        const gravado = await anuncioDe(completo.id);
        conferir("cada campo mora na sua coluna", [gravado.titulo, gravado.descricao, gravado.categoriaExternaId, gravado.produtoId, ordenado(gravado.atributos)],
          [novo.rascunho.titulo, novo.rascunho.descricao, "MLB1234", p1.id, ordenado(novo.rascunho.atributos)]);
        conferir("o resto do rascunho vai para dados", Object.keys(gravado.dados).sort(), ["atacado", "categoriaNome", "composicao", "condicao", "descricaoEditada", "envio", "estoque", "familyName", "fotosReordenadas", "fotosVistasEm", "imagens", "prazoDisponibilidadeDias", "preco", "tipoAnuncio"]);
        // O estoque do anuncio e sempre o do produto no Rise (pedido do dono em 22/10/2026): o que a tela manda nao vale.
        conferir("numero escrito como texto vira numero; o estoque e o do produto, nao o da tela", [gravado.dados.preco, gravado.dados.estoque], [12.5, 9]);
        await prisma.produto.update({ where: { id: p1.id }, data: { estoque: 4 } });
        const editada = await salvarRascunhoML(null, { ...novo.rascunho, descricao: "Texto digitado na tela" });
        conferir("a descricao gravada e a do produto, nao a da tela", (await anuncioDe(editada.id)).descricao, novo.rascunho.descricao);
        await prisma.produto.update({ where: { id: p1.id }, data: { descricaoBase: "Descricao nova do produto." } });
        conferir("abrir o anuncio rele a descricao do produto", (await carregarAnuncioML(editada.id)).rascunho.descricao, "Descricao nova do produto.");
        await prisma.produto.update({ where: { id: p1.id }, data: { descricaoBase: novo.rascunho.descricao } });
        conferir("abrir o anuncio rele o estoque do produto", (await carregarAnuncioML(completo.id)).rascunho.estoque, 4);
        await prisma.produto.update({ where: { id: p1.id }, data: { estoque: -2 } });
        conferir("estoque negativo no Rise vira zero no anuncio", (await carregarAnuncioML(completo.id)).rascunho.estoque, 0);
        await prisma.produto.update({ where: { id: p1.id }, data: { estoque: 9 } });

        // Atualizar: o mesmo anuncio, e o que o editor nao conhece (a etapa da fase 3) fica.
        const antesDeAtualizar = await prisma.anuncio.count({ where: { produtoId: p1.id } });
        const atualizado = await salvarRascunhoML(premium.id, { ...novo.rascunho, tipoAnuncio: "gold_pro", titulo: "ZZ Titulo novo" });
        conferir("atualizar grava no mesmo anuncio, sem criar outro", [atualizado, (await anuncioDe(premium.id)).titulo, (await prisma.anuncio.count({ where: { produtoId: p1.id } })) - antesDeAtualizar],
          [{ ok: true, id: premium.id }, "ZZ Titulo novo", 0]);
        await prisma.anuncio.update({ where: { id: premium.id }, data: { dados: { ...(await anuncioDe(premium.id)).dados, etapa: "teste" } } });
        await salvarRascunhoML(premium.id, { ...novo.rascunho, tipoAnuncio: "gold_pro", titulo: "ZZ Titulo novo" });
        conferir("atualizar guarda o que o editor nao conhece", [(await anuncioDe(premium.id)).dados.etapa, (await anuncioDe(premium.id)).titulo], ["teste", "ZZ Titulo novo"]);
        conferir("atualizar: anuncio que nao existe", (await salvarRascunhoML("id-que-nao-existe", novo.rascunho)).erro, "Anúncio não encontrado.");
        const antesDoIdVazio = await anunciosDeTeste();
        conferir("atualizar: id vazio nao vira anuncio novo", [(await salvarRascunhoML("", novo.rascunho)).erro, await anunciosDeTeste()], ["Anúncio não encontrado.", antesDoIdVazio]);
        const doBling = await prisma.anuncio.create({ data: { produtoId: p2.id, canal: "BLING" } });
        conferir("anuncio de outro canal nao e alterado aqui", (await salvarRascunhoML(doBling.id, { ...novo.rascunho, produtoId: p2.id })).erro, "Este anúncio não pode ser alterado aqui.");
        const publicado = await salvarRascunhoML(null, novo.rascunho);
        await prisma.anuncio.update({ where: { id: publicado.id }, data: { status: "PUBLICADO" } });
        conferir("anuncio publicado nao e alterado aqui", [(await salvarRascunhoML(publicado.id, { ...novo.rascunho, titulo: "ZZ nao grava" })).erro, (await anuncioDe(publicado.id)).titulo],
          ["Este anúncio não pode ser alterado aqui.", novo.rascunho.titulo]);

        const kitA = { ...novo.rascunho, composicao: { itens: [{ produtoId: p1.id, quantidade: 2 }, { produtoId: p2.id, quantidade: 3 }], codigo: "ZZ-ML-KIT", blingProdutoId: null } };
        const k1 = await salvarRascunhoML(null, kitA);
        conferir("kit misto salva", k1.ok, true);
        conferir("mesmo codigo, mesma composicao em outra ordem: aceito", (await salvarRascunhoML(null, { ...kitA, tipoAnuncio: "gold_pro", composicao: { ...kitA.composicao, itens: [...kitA.composicao.itens].reverse() } })).ok, true);
        conferir("mesmo codigo, composicao diferente: recusado", (await codigoEmUso("ZZ-ML-KIT", { anuncioId: null, itens: [{ produtoId: p1.id, quantidade: 5 }] })) !== null, true);
        conferir("codigo igual ao SKU de um produto: recusado", await codigoEmUso("ZZ-ML-2", { anuncioId: null, itens: kitA.composicao.itens }), "o produto ZZ-ML-2 do cadastro");
        const k2 = await salvarRascunhoML(null, { ...kitA, composicao: { ...kitA.composicao, codigo: "ZZ-ML-KIT2" } });
        conferir("o proprio anuncio nao conta como uso", await codigoEmUso("ZZ-ML-KIT2", { anuncioId: k2.id, itens: [{ produtoId: p1.id, quantidade: 5 }] }), null);
        const umSo = await salvarRascunhoML(null, { ...novo.rascunho, composicao: { itens: [{ produtoId: p1.id, quantidade: 5 }], codigo: "qualquer", blingProdutoId: null } });
        conferir("kit de um produto: o servidor refaz o codigo", (await carregarAnuncioML(umSo.id)).rascunho.composicao.codigo, "ZZ-ML-1_5");

        const emUso = (codigo, itens) => codigoEmUso(codigo, { anuncioId: null, itens });
        conferir("codigo em uso: a mensagem diz qual anuncio", await emUso("ZZ-ML-KIT", [{ produtoId: p1.id, quantidade: 5 }]), 'o anúncio "ZZ Produto um" com outra composição');
        conferir("codigo em uso: mesma composicao nao conta", await emUso("ZZ-ML-KIT", kitA.composicao.itens), null);
        conferir("codigo em uso: a ordem dos itens nao importa", await emUso("ZZ-ML-KIT", [...kitA.composicao.itens].reverse()), null);
        conferir("codigo em uso: quantidade escrita como texto", await emUso("ZZ-ML-KIT", [{ produtoId: p1.id, quantidade: "2" }, { produtoId: p2.id, quantidade: "3" }]), null);
        conferir("codigo em uso: outra quantidade e outra composicao", (await emUso("ZZ-ML-KIT", [{ produtoId: p1.id, quantidade: 2 }, { produtoId: p2.id, quantidade: 4 }])) !== null, true);
        conferir("codigo em uso: parte dos itens e outra composicao", (await emUso("ZZ-ML-KIT", [{ produtoId: p1.id, quantidade: 2 }])) !== null, true);
        conferir("codigo em uso: codigo livre", await emUso("ZZ-ML-LIVRE", kitA.composicao.itens), null);
        conferir("codigo em uso: codigo em branco nao conta", await emUso("  ", kitA.composicao.itens), null);
        conferir("codigo em uso: o codigo e exato", await emUso("zz-ml-kit", [{ produtoId: p1.id, quantidade: 5 }]), null);

        // O que o servidor recusa ao salvar o kit.
        const kitComCodigo = (codigo, itens = kitA.composicao.itens) => ({ ...kitA, composicao: { ...kitA.composicao, codigo, itens } });
        conferir("kit com codigo de outra composicao: salvar recusa", (await salvarRascunhoML(null, kitComCodigo("ZZ-ML-KIT", [{ produtoId: p1.id, quantidade: 5 }, { produtoId: p2.id, quantidade: 1 }]))).erro,
          'O código ZZ-ML-KIT já está em uso: o anúncio "ZZ Produto um" com outra composição.');
        conferir("kit com codigo de um produto: salvar recusa", (await salvarRascunhoML(null, kitComCodigo("ZZ-ML-2"))).erro, "O código ZZ-ML-2 já está em uso: o produto ZZ-ML-2 do cadastro.");
        conferir("kit com o proprio codigo: atualizar aceita", (await salvarRascunhoML(k2.id, kitComCodigo("ZZ-ML-KIT2"))).ok, true);
        conferir("kit com menos de 2 unidades: salvar recusa", (await salvarRascunhoML(null, kitComCodigo("x", [{ produtoId: p1.id, quantidade: 1 }]))).erro, "A composição precisa de ao menos 2 unidades.");
        conferir("kit com quantidade fora do normal: salvar recusa", (await salvarRascunhoML(null, kitComCodigo("x", [{ produtoId: p1.id, quantidade: "abc" }, { produtoId: p2.id, quantidade: 1 }]))).erro,
          "Item 1: a quantidade deve ser um número inteiro de 1 a 9999.");
        conferir("kit com item sem produto: salvar recusa", (await salvarRascunhoML(null, kitComCodigo("x", [{ produtoId: p1.id, quantidade: 2 }, { produtoId: null, quantidade: 1 }]))).erro, "Item 2: escolha o produto.");
        conferir("kit sem codigo ainda e rascunho: salva", (await salvarRascunhoML(null, kitComCodigo(""))).ok, true);
        const kitDoMeio = await salvarRascunhoML(null, { ...kitComCodigo("ZZ-ML-KIT", [{ produtoId: p1.id, quantidade: "2" }, { produtoId: p2.id, quantidade: "3" }]), produtoId: p2.id });
        conferir("kit: o produto do anuncio e o primeiro item, e a quantidade vira numero", [(await anuncioDe(kitDoMeio.id)).produtoId, (await carregarAnuncioML(kitDoMeio.id)).rascunho.composicao.itens],
          [p1.id, [{ produtoId: p1.id, quantidade: 2 }, { produtoId: p2.id, quantidade: 3 }]]);
        const umMilhar = await salvarRascunhoML(null, { ...novo.rascunho, composicao: { itens: [{ produtoId: p1.id, quantidade: 1000 }], codigo: "", blingProdutoId: null } });
        conferir("kit de um produto: milhar com ponto", (await carregarAnuncioML(umMilhar.id)).rascunho.composicao.codigo, "ZZ-ML-1_1.000");

        // O vinculo do kit com o Bling e do servidor (a publicacao da fase 3 o grava): o que a tela manda
        // nao vale, e o que o servidor guardou sobrevive a um editor desatualizado que manda `null`.
        const kitComBling = (codigo, bling) => ({ ...kitA, composicao: { ...kitA.composicao, codigo, blingProdutoId: bling } });
        const blingDoKit = async (id) => (await carregarAnuncioML(id)).rascunho.composicao.blingProdutoId;
        const gravarBlingDoKit = async (id, bling) => {
          const { dados } = await anuncioDe(id);
          await prisma.anuncio.update({ where: { id }, data: { dados: { ...dados, composicao: { ...dados.composicao, blingProdutoId: bling } } } });
        };
        const kitB = await salvarRascunhoML(null, kitComBling("ZZ-ML-KITB", "999"));
        conferir("vinculo com o Bling: o que a tela manda ao criar nao e salvo", await blingDoKit(kitB.id), null);
        await salvarRascunhoML(kitB.id, kitComBling("ZZ-ML-KITB", "999"));
        conferir("vinculo com o Bling: o que a tela manda ao atualizar nao e salvo", await blingDoKit(kitB.id), null);
        await gravarBlingDoKit(kitB.id, "777");
        await salvarRascunhoML(kitB.id, kitComBling("ZZ-ML-KITB", null));
        conferir("vinculo com o Bling: editor desatualizado (null) nao apaga o guardado", await blingDoKit(kitB.id), "777");
        // O clone de um kit leva a composicao e o codigo (Classico e Premium dividem o kit do Bling), nunca o vinculo.
        const cloneDoKit = await clonarRascunhoML(kitB.id);
        conferir("clonar kit: mesma composicao e codigo, sem o vinculo com o Bling, codigo livre para a mesma composicao",
          [cloneDoKit.rascunho.composicao.itens, cloneDoKit.rascunho.composicao.codigo, cloneDoKit.rascunho.composicao.blingProdutoId, cloneDoKit.contexto.codigoEmUso],
          [kitA.composicao.itens.map(({ produtoId, quantidade }) => ({ produtoId, quantidade: Number(quantidade) })), "ZZ-ML-KITB", null, null]);
        await salvarRascunhoML(kitB.id, kitComBling("ZZ-ML-KITB", "999"));
        conferir("vinculo com o Bling: valor forjado nao troca o guardado", await blingDoKit(kitB.id), "777");
        await salvarRascunhoML(kitB.id, kitComBling("ZZ-ML-KITB2", "777"));
        conferir("vinculo com o Bling: outro codigo e outro kit, o vinculo antigo sai", await blingDoKit(kitB.id), null);
        await salvarRascunhoML(kitB.id, kitComBling("ZZ-ML-KITB", "777"));
        conferir("vinculo com o Bling: voltar ao codigo antigo nao traz o vinculo de volta", await blingDoKit(kitB.id), null);

        // Um anuncio gravado por fora do editor com o codigo do kit e outra composicao: ao abrir, o contexto avisa.
        const conflito = await prisma.anuncio.create({
          data: { produtoId: p1.id, canal: "MERCADO_LIVRE", titulo: "ZZ conflito", dados: { composicao: { itens: [{ produtoId: p1.id, quantidade: 9 }], codigo: "ZZ-ML-KIT", blingProdutoId: null } } },
        });
        const kitAberto = await carregarAnuncioML(k1.id);
        conferir("carregar kit: contexto com os itens e o codigo em uso", [Object.keys(kitAberto.contexto.produtos).sort(), kitAberto.contexto.codigoEmUso], [[p1.id, p2.id].sort(), 'o anúncio "ZZ conflito" com outra composição']);
        await prisma.anuncio.delete({ where: { id: conflito.id } });
        conferir("carregar kit: sem conflito, codigo livre", (await carregarAnuncioML(k1.id)).contexto.codigoEmUso, null);

        // O codigo sugerido vem depois do maior ja usado, tambem nos codigos de kit dos anuncios.
        conferir("sugerir codigo de kit: na faixa 25xxxx", /^25\d{4}$/.test(await sugerirCodigoDeKit()), true);
        // O codigo e o proximo livre da faixa AGORA (o mesmo calculo da funcao, lendo o banco): assim o teste
        // nao depende de nenhum SKU ou kit real perto do fim da faixa. Salvo ele, o seguinte tem que ser +1.
        const livreAgora = await sugerirCodigoDeKit();
        conferir("sugerir codigo de kit: ainda ha codigo livre na faixa", /^25\d{4}$/.test(livreAgora) && Number(livreAgora) < 259999, true);
        await salvarRascunhoML(null, kitComCodigo(livreAgora));
        conferir("sugerir codigo de kit: depois do maior codigo de kit", await sugerirCodigoDeKit(), String(Number(livreAgora) + 1));

        const totalDeTeste = await prisma.anuncio.count({ where: { canal: "MERCADO_LIVRE", produto: { sku: { startsWith: "ZZ-ML-" } } } });
        const lista = await listarAnunciosML({ busca: "zz-ml" });
        conferir("lista traz os anuncios de teste", lista.total >= 6, true);
        conferir("lista: acha pelo SKU sem diferenciar caixa, so do Mercado Livre", [lista.total, lista.linhas.length, lista.pagina, lista.totalPaginas], [totalDeTeste, totalDeTeste, 1, 1]);
        conferir("lista: os campos de cada linha", Object.keys(lista.linhas[0]).sort(), ["aguardandoEstoque", "atualizadoEm", "avisosML", "codigo", "estadoML", "estadoMLPedeAcao", "estoque", "fotoUrl", "freteGratis", "icone", "id", "idExterno", "linkDoAnuncio", "linkDoPainel", "preco", "produtoId", "rankingML", "situacaoCanal", "sku", "status", "tipoAnuncio", "titulo", "urlExterna"]);
        // As colunas que ordenam (28/10/2026): no servidor, antes de paginar; o vazio vai para o fim nas duas direcoes.
        const porPreco = (direcao) => listarAnunciosML({ busca: "zz-ml", ordenar: "preco", direcao }).then((r) => r.linhas.map((l) => l.preco));
        const [subindo, descendo] = [await porPreco("asc"), await porPreco("desc")];
        const comPreco = (lista) => lista.filter((p) => typeof p === "number");
        conferir("lista: ordena pelo preco, crescente", comPreco(subindo), [...comPreco(subindo)].sort((x, y) => x - y));
        conferir("lista: ordena pelo preco, decrescente", comPreco(descendo), [...comPreco(descendo)].sort((x, y) => y - x));
        conferir("lista: sem preco vai para o fim nas duas direcoes", [subindo, descendo].map((l) => l.findIndex((p) => typeof p !== "number") === -1 || l.slice(l.findIndex((p) => typeof p !== "number")).every((p) => typeof p !== "number")), [true, true]);
        conferir("lista: coluna desconhecida mantem o mais recente primeiro", (await listarAnunciosML({ busca: "zz-ml", ordenar: "xpto" })).linhas.map((l) => l.id), lista.linhas.map((l) => l.id));
        conferir("lista: estoque do kit pelas pecas, links so com MLB", [typeof lista.linhas[0].estoque, lista.linhas.every((l) => l.idExterno ? true : l.linkDoAnuncio === null && l.linkDoPainel === null)], ["number", true]);
        conferir("lista: o mais recente primeiro", lista.linhas.every((l, i) => i === 0 || lista.linhas[i - 1].atualizadoEm >= l.atualizadoEm), true);
        conferir("lista: acha pelo codigo do kit", (await listarAnunciosML({ busca: "zz-ml-kit2" })).linhas.map((l) => [l.id, l.codigo]), [[k2.id, "ZZ-ML-KIT2"]]);
        conferir("lista: acha pelo titulo", (await listarAnunciosML({ busca: "ZZ TITULO NOVO" })).linhas.map((l) => [l.id, l.titulo, l.tipoAnuncio]), [[premium.id, "ZZ Titulo novo", "gold_pro"]]);
        conferir("lista: o codigo da linha e o do kit, ou o SKU do produto", [lista.linhas.find((l) => l.id === umSo.id).codigo, lista.linhas.find((l) => l.id === salvo.id).codigo], ["ZZ-ML-1_5", "ZZ-ML-1"]);
        conferir("lista: o preco da linha e o do rascunho", [lista.linhas.find((l) => l.id === salvo.id).preco, lista.linhas.find((l) => l.id === completo.id).preco], [10, 12.5]);
        conferir("lista: sem resultado", await listarAnunciosML({ busca: "zz-ml-nao-existe" }), { linhas: [], total: 0, pagina: 1, totalPaginas: 1 });

        await prisma.anuncio.createMany({ data: Array.from({ length: 101 }, (_, i) => ({ produtoId: p4.id, canal: "MERCADO_LIVRE", titulo: `ZZ massa ${i}`, dados: { tipoAnuncio: "gold_special" } })) });
        const comMassa = totalDeTeste + 101;
        const pagina1 = await listarAnunciosML({ busca: "zz-ml" });
        const pagina2 = await listarAnunciosML({ busca: "zz-ml", pagina: 2 });
        conferir("lista: 100 por pagina", [pagina1.linhas.length, pagina1.totalPaginas, pagina1.total], [100, 2, comMassa]);
        conferir("lista: a segunda pagina traz o resto", [pagina2.pagina, pagina2.linhas.length], [2, comMassa - 100]);
        conferir("lista: pagina alem do fim vai para a ultima", (({ pagina, linhas }) => [pagina, linhas.length])(await listarAnunciosML({ busca: "zz-ml", pagina: 99 })), [2, comMassa - 100]);
        conferir("lista: pagina que nao e numero ou e menor que 1 vale 1", [await listarAnunciosML({ busca: "zz-ml", pagina: "abc" }), await listarAnunciosML({ busca: "zz-ml", pagina: 0 }), await listarAnunciosML({ busca: "zz-ml", pagina: -3 })].map((l) => l.pagina), [1, 1, 1]);
        conferir("lista: pagina escrita como texto", (await listarAnunciosML({ busca: "zz-ml", pagina: "2" })).pagina, 2);

        const antesDasRecusas = await anunciosDeTeste();
        conferir("entrada fora da forma e recusada", (await salvarRascunhoML(null, { produtoId: p1.id, titulo: 42 })).ok, false);
        conferir("entrada fora da forma: a mensagem", (await salvarRascunhoML(null, { produtoId: p1.id, titulo: 42 })).erro, "O rascunho chegou incompleto. Recarregue a tela.");
        conferir("entrada que nao e um rascunho e recusada", (await Promise.all([null, undefined, "texto", 42, []].map((entrada) => salvarRascunhoML(null, entrada)))).map((r) => r.ok), Array(5).fill(false));
        conferir("numero que nao e numero recusa o rascunho", (await salvarRascunhoML(null, { ...novo.rascunho, preco: "abc" })).ok, false);
        conferir("tipo de anuncio desconhecido e recusado", (await salvarRascunhoML(null, { ...novo.rascunho, tipoAnuncio: "ouro" })).ok, false);
        // Tetos de tamanho: a Server Action recebe o que o navegador mandar.
        const texto = (n) => "x".repeat(n);
        const comComposicao = (parcial) => ({ ...kitA, composicao: { ...kitA.composicao, ...parcial } });
        const acimaDoTeto = [
          ["titulo", { titulo: texto(LIMITES_ML.titulo + 1) }],
          ["family_name", { familyName: texto(LIMITES_ML.familyName + 1) }],
          ["descricao", { descricao: texto(LIMITES_ML.descricao + 1) }],
          ["atributos demais", { atributos: Object.fromEntries(Array.from({ length: LIMITES_ML.atributos + 1 }, (_, i) => [`A${i}`, "v"])) }],
          ["nome de atributo", { atributos: { [texto(LIMITES_ML.chaveDeAtributo + 1)]: "v" } }],
          ["valor de atributo", { atributos: { BRAND: texto(LIMITES_ML.valorDeAtributo + 1) } }],
          ["fotos demais", { imagens: Array.from({ length: LIMITES_ML.imagens + 1 }, (_, i) => `f${i}`) }],
          ["id de foto", { imagens: [texto(LIMITES_ML.idDeImagem + 1)] }],
          ["modo de envio", { envio: { ...novo.rascunho.envio, modo: texto(LIMITES_ML.modoDeEnvio + 1) } }],
          ["codigo do kit", comComposicao({ codigo: texto(LIMITES_ML.codigoDoKit + 1) })],
          ["itens do kit", comComposicao({ itens: Array.from({ length: LIMITES_ML.itensDaComposicao + 1 }, () => ({ produtoId: p1.id, quantidade: 1 })) })],
        ];
        for (const [nome, parcial] of acimaDoTeto) {
          conferir(`tamanho: ${nome} acima do teto e recusado`, (await salvarRascunhoML(null, { ...novo.rascunho, ...parcial })).erro, "O rascunho chegou incompleto. Recarregue a tela.");
        }
        conferir("tamanho: no teto ainda e aceito (a forma, sem gravar)",
          RascunhoMLSchema.safeParse({
            ...novo.rascunho,
            titulo: texto(LIMITES_ML.titulo),
            familyName: texto(LIMITES_ML.familyName),
            descricao: texto(LIMITES_ML.descricao),
            atributos: Object.fromEntries(Array.from({ length: LIMITES_ML.atributos }, (_, i) => [texto(LIMITES_ML.chaveDeAtributo - 3) + String(i).padStart(3, "0"), texto(LIMITES_ML.valorDeAtributo)])),
            imagens: Array.from({ length: LIMITES_ML.imagens }, () => texto(LIMITES_ML.idDeImagem)),
            envio: { ...novo.rascunho.envio, modo: texto(LIMITES_ML.modoDeEnvio) },
            composicao: { ...kitA.composicao, codigo: texto(LIMITES_ML.codigoDoKit), itens: Array.from({ length: LIMITES_ML.itensDaComposicao }, () => ({ produtoId: p1.id, quantidade: 1 })) },
          }).success, true);
        conferir("o que foi recusado nao grava nada", await anunciosDeTeste(), antesDasRecusas);
      } finally {
        await limpar();
        await varrerExtras();
      }
    } finally {
      if (configAntes) {
        const dados = { frasesFixas: configAntes.frasesFixas };
        await prisma.configCanal.upsert({ where: { canal: "MERCADO_LIVRE" }, create: { canal: "MERCADO_LIVRE", ...dados }, update: dados });
      } else {
        await prisma.configCanal.deleteMany({ where: { canal: "MERCADO_LIVRE" } });
      }
    }
  }

  {
    console.log("\nNumeros dos campos");

    // O que uma aba faz a cada tecla: filtra o texto, guarda o que ficou e manda o numero ao rascunho.
    // O campo mostra o texto digitado enquanto ele ainda vale o numero (a virgula nao pode sumir).
    const digitar = (bruto, casas) => {
      const texto = filtrarDecimal(bruto, casas);
      const numero = lerDecimal(texto);
      return { texto, numero, mostra: mostrarDigitado(texto, numero) };
    };

    conferir("digitar 1, mantem a virgula (numero 1)", digitar("1,", 2), { texto: "1,", numero: 1, mostra: "1," });
    conferir("digitar 0,0 mantem os dois caracteres (numero 0)", digitar("0,0", 2), { texto: "0,0", numero: 0, mostra: "0,0" });
    conferir("digitar 10,5", digitar("10,5", 2), { texto: "10,5", numero: 10.5, mostra: "10,5" });
    conferir("digitar 12.5 com ponto", digitar("12.5", 2), { texto: "12.5", numero: 12.5, mostra: "12.5" });
    conferir("digitar 12,50 mantem o zero do fim", digitar("12,50", 2), { texto: "12,50", numero: 12.5, mostra: "12,50" });
    conferir("colar 1.234,56 do Bling", digitar("1.234,56", 2), { texto: "1234,56", numero: 1234.56, mostra: "1234,56" });
    conferir("colar 1,234.56", digitar("1,234.56", 2), { texto: "1234.56", numero: 1234.56, mostra: "1234.56" });
    conferir("campo vazio e nulo", digitar("", 2), { texto: "", numero: null, mostra: "" });
    conferir("so a virgula nao e numero", digitar(",", 2), { texto: ",", numero: null, mostra: "," });
    conferir("letras, e, + e - somem", digitar("1e+5a-", 2), { texto: "15", numero: 15, mostra: "15" });
    conferir("segunda virgula e descuido: vale a primeira", filtrarDecimal("1,2,", 2), "1,2");
    conferir("casas a mais sao recusadas (preco: 2)", filtrarDecimal("12,567", 2), "12,56");
    conferir("casas a mais sao recusadas (peso: 3)", filtrarDecimal("0,2501", 3), "0,250");
    conferir("sem separador nao mexe", filtrarDecimal("1234", 2), "1234");
    conferir("filtrar vazio e nulo", [filtrarDecimal("", 2), filtrarDecimal(null, 2)], ["", ""]);

    conferir("ler 12,5 e 12.5", [lerDecimal("12,5"), lerDecimal("12.5")], [12.5, 12.5]);
    conferir("ler 12, e ,5", [lerDecimal("12,"), lerDecimal(",5")], [12, 0.5]);
    conferir("ler vazio, separador sozinho e nulo", [lerDecimal(""), lerDecimal(","), lerDecimal("."), lerDecimal(null)], [null, null, null, null]);
    conferir("ler 0 e zero, nao vazio", [lerDecimal("0"), lerDecimal("0,0")], [0, 0]);

    conferir("formato: virgula decimal", [textoDecimal(0.25), textoDecimal(5), textoDecimal(1.005, 2)], ["0,25", "5", "1,005"]);
    conferir("formato: completa os zeros do preco", [textoDecimal(29.9, 2), textoDecimal(7.5, 2), textoDecimal(10, 2)], ["29,90", "7,50", "10,00"]);
    conferir("formato: 0 nao e vazio", [textoDecimal(0), textoDecimal(0, 2)], ["0", "0,00"]);
    conferir("formato: nulo e vazio", [textoDecimal(null), textoDecimal(undefined), textoDecimal("")], ["", "", ""]);

    // Ao sair do campo a aba esquece o texto digitado, e o numero volta formatado.
    conferir("sair do campo: 7,5 vira 7,50", mostrarDigitado(null, 7.5, 2), "7,50");
    conferir("sair do campo: 5, vira 5", mostrarDigitado(null, 5), "5");
    conferir("sair do campo: 0 continua 0", mostrarDigitado(null, 0), "0");
    conferir("sair do campo: sem numero fica vazio", mostrarDigitado(null, null), "");
    conferir("numero mudou por fora (kit): mostra o novo", mostrarDigitado("5,5", 0.3), "0,3");
    conferir("texto digitado que ainda vale o numero", mostrarDigitado("12,", 12), "12,");

    // Estoque: o campo inteiro barra as seis teclas e deixa digito e edicao passar.
    const barradas = [];
    for (const tecla of ["e", "E", "+", "-", ".", ",", "0", "5", "Backspace", "Tab"]) {
      recusarSimbolosDeInteiro({ key: tecla, preventDefault: () => barradas.push(tecla) });
    }
    conferir("estoque barra e E + - . ,", barradas, ["e", "E", "+", "-", ".", ","]);
  }

  // Fase 2 (inteligencia do ML, so leitura): um bloco so, porque o ML falso, os imports e os
  // rascunhos de exemplo sao compartilhados entre as tarefas. Sem banco, salvo onde dito.
  {
    console.log("\nFase 2: cliente, ML falso e categoria");
    const { criarMLFalso } = await import("./lib/mlFalso.js");
    const { descobrirCategoria, lerCategoria, lerAtributosDaCategoria, lerCategoriaCompleta, textoDoErroML } = await import(
      "../src/lib/canaisDeVenda/ml/leitura.js"
    );

    const falso = criarMLFalso();
    conferir("falso: contrato do cliente (get, usuarioId, chamadas)", [typeof falso.get, typeof falso.usuarioId, Array.isArray(falso.chamadas)], ["function", "function", true]);
    conferir("falso: responde no formato do requisitar", (({ ok, status, duracaoMs }) => [ok, status, typeof duracaoMs])(await falso.get("/users/me")), [true, 200, "number"]);
    conferir("falso: usuarioId e o da conta falsa", await falso.usuarioId(), "212386247");
    let lancou = false;
    try {
      await falso.get("/nao/existe");
    } catch {
      lancou = true;
    }
    conferir("falso: caminho desconhecido lanca", lancou, true);

    conferir("descobrirCategoria: devolve id, nome e dominio", await descobrirCategoria(falso, "placa uno r3 ch340"), [
      { categoriaId: "MLB99779", nome: "Placas de Microcontroladores", dominioId: "MLB-MICROCONTROLLER_BOARDS", dominioNome: "Placas de microcontroladores" },
    ]);
    conferir("descobrirCategoria: sem resultado e lista vazia", await descobrirCategoria(falso, "xyzw nada"), []);
    conferir("descobrirCategoria: manda q", falso.chamadas.at(-1).params, { q: "xyzw nada" });

    const categoria = await lerCategoria(falso, "MLB99779");
    conferir(
      "lerCategoria: folha, limite 60, 12 fotos, caminho",
      [categoria.folha, categoria.limiteTitulo, categoria.maxFotos, categoria.caminho],
      [true, 60, 12, ["Eletrônicos, Áudio e Vídeo", "Componentes Eletrônicos", "Placas de Microcontroladores"]],
    );
    conferir("lerCategoria: nao folha", (await lerCategoria(falso, "MLB1648")).folha, false);
    conferir("lerCategoria: 404 e null", await lerCategoria(falso, "MLB0"), null);
    conferir(
      "lerAtributosDaCategoria: lista crua com BRAND required",
      (await lerAtributosDaCategoria(falso, "MLB99779")).some((a) => a.id === "BRAND" && a.tags?.required === true),
      true,
    );
    conferir("lerCategoriaCompleta: categoria e atributos juntos", await (async () => {
      const completa = await lerCategoriaCompleta(falso, "MLB99779");
      return [completa.id, completa.folha, Array.isArray(completa.atributos) && completa.atributos.length > 0];
    })(), ["MLB99779", true, true]);
    conferir("lerCategoriaCompleta: 404 e null", await lerCategoriaCompleta(falso, "MLB0"), null);
    conferir("textoDoErroML: HTTP com message", textoDoErroML({ status: 403, dados: { message: "forbidden" } }), "Mercado Livre: forbidden (HTTP 403)");
    conferir("textoDoErroML: Error comum", textoDoErroML(new Error("Mercado Livre não conectado.")), "Mercado Livre não conectado.");

    console.log("\nFase 2: atributos da categoria");
    const { normalizarAtributosDaCategoria, motivoSemGtin, valorDeLista, problemasDosAtributos, limparAtributosDaIA, montarPedidoDaFicha } =
      await import("../src/lib/canaisDeVenda/ml/atributos.js");
    const crus = await lerAtributosDaCategoria(falso, "MLB99779");
    const atributos = normalizarAtributosDaCategoria(crus);
    conferir("normalizar: obrigatorios primeiro, depois condicionais", atributos.slice(0, 4).map((a) => a.id), ["BRAND", "MODEL", "GTIN", "EMPTY_GTIN_REASON"]);
    conferir(
      "normalizar: read_only e hidden (menos EMPTY_GTIN_REASON) saem",
      atributos.some((a) => ["PACKAGE_HEIGHT", "SELLER_SKU", "SELLER_PACKAGE_WEIGHT", "IS_KIT"].includes(a.id)),
      false,
    );
    conferir(
      "normalizar: tipos",
      Object.fromEntries(atributos.filter((a) => ["MICROCONTROLLER", "OPERATING_VOLTAGE", "BRAND", "INCLUDES_USB_CABLE"].includes(a.id)).map((a) => [a.id, a.tipo])),
      { BRAND: "texto", MICROCONTROLLER: "lista", INCLUDES_USB_CABLE: "booleano", OPERATING_VOLTAGE: "numero_unidade" },
    );
    conferir("normalizar: valores e unidades", [atributos.find((a) => a.id === "MICROCONTROLLER").valores.map((v) => v.nome), atributos.find((a) => a.id === "OPERATING_VOLTAGE").unidades], [["ATmega328P", "ATmega2560"], ["V"]]);
    conferir("motivoSemGtin: kit e simples, pelo nome", [motivoSemGtin(atributos, { kit: true }), motivoSemGtin(atributos, { kit: false })], ["O produto é um kit ou pack", "O produto não tem código cadastrado"]);
    conferir("motivoSemGtin: categoria sem o atributo", motivoSemGtin([], { kit: true }), null);
    const micro = atributos.find((a) => a.id === "MICROCONTROLLER");
    conferir("valorDeLista: sem caixa e sem acento", [valorDeLista(micro, "atmega328p"), valorDeLista(micro, "ATMEGA2560 "), valorDeLista(micro, "Z80")], ["ATmega328P", "ATmega2560", null]);
    conferir("valorDeLista: booleano casa sem acento", valorDeLista(atributos.find((a) => a.id === "INCLUDES_USB_CABLE"), "nao"), "Não");
    conferir("valorDeLista: texto livre passa aparado", valorDeLista(atributos.find((a) => a.id === "BRAND"), " Arduino "), "Arduino");
    // A ficha inteira preenchida para publicar (pedido do dono em 25/10/2026): opcional vazio tambem barra. Os testes de
    // outras regras completam os opcionais com "Nao se aplica" (-1).
    const OPCIONAIS = { MICROCONTROLLER: "-1", INCLUDES_USB_CABLE: "-1", OPERATING_VOLTAGE: "-1" };
    conferir(
      "problemas: obrigatorio vazio, lista fora e opcional vazio, todos bloqueantes",
      problemasDosAtributos({ BRAND: "X", MICROCONTROLLER: "Z80" }, atributos, { kit: false }).map((p) => [p.campo, p.bloqueante]),
      [["MODEL", true], ["GTIN", true], ["MICROCONTROLLER", true], ["INCLUDES_USB_CABLE", true], ["OPERATING_VOLTAGE", true]],
    );
    conferir(
      "problemas: o texto do opcional vazio manda preencher ou marcar Nao se aplica",
      problemasDosAtributos({ BRAND: "X", MODEL: "Y", GTIN: "1", MICROCONTROLLER: "-1", INCLUDES_USB_CABLE: "-1" }, atributos, { kit: false }).map((p) => p.problema),
      ['Preencha Tensão de operação (OPERATING_VOLTAGE) ou marque "Não se aplica".'],
    );
    conferir("problemas: GTIN sem motivo barra mesmo onde a categoria nao exige", problemasDosAtributos({ BRAND: "X", MODEL: "Y", ...OPCIONAIS }, atributos.map((a) => (a.id === "GTIN" ? { ...a, condicional: false } : a)), { kit: false }).map((p) => p.campo), ["GTIN"]);
    conferir("problemas: texto da lista fora", problemasDosAtributos({ ...OPCIONAIS, BRAND: "X", MODEL: "Y", GTIN: "1", MICROCONTROLLER: "Z80" }, atributos, { kit: false })[0].problema, "Microcontrolador: 'Z80' não está na lista da categoria.");
    conferir("problemas: GTIN ou motivo", problemasDosAtributos({ ...OPCIONAIS, BRAND: "X", MODEL: "Y", EMPTY_GTIN_REASON: "O produto não tem código cadastrado" }, atributos, { kit: false }), []);
    conferir(
      "problemas: kit com GTIN e alerta",
      problemasDosAtributos({ ...OPCIONAIS, BRAND: "X", MODEL: "Y", GTIN: "789", EMPTY_GTIN_REASON: "O produto é um kit ou pack" }, atributos, { kit: true }).map((p) => [p.campo, p.bloqueante]),
      [["GTIN", false]],
    );
    conferir(
      "problemas: kit sem motivo e bloqueante mesmo sem GTIN",
      problemasDosAtributos({ ...OPCIONAIS, BRAND: "X", MODEL: "Y" }, atributos, { kit: true }).map((p) => [p.campo, p.bloqueante]),
      [["GTIN", true]],
    );
    conferir(
      "limparAtributosDaIA: so em branco, lista casada, maiusculas, id falso fora",
      limparAtributosDaIA(
        { atributos: [{ id: "BRAND", valor: "arduino" }, { id: "MODEL", valor: "uno r3" }, { id: "MICROCONTROLLER", valor: "atmega328p" }, { id: "INVENTADO", valor: "x" }, { id: "GTIN", valor: "" }, { id: "MODEL", valor: "outro" }] },
        atributos,
        { BRAND: "ARDUINO" },
      ).map((a) => [a.id, a.valor]),
      [["MODEL", "UNO R3"], ["MICROCONTROLLER", "ATmega328P"]],
    );
    conferir("limparAtributosDaIA: resposta quebrada e lista vazia", limparAtributosDaIA({ nada: 1 }, atributos, {}), []);
    {
      // Unidade colada na tela, separada no envio (pedido do dono em 24/10/2026: "5V", nao "5 V").
      const { colarUnidade, separarUnidade } = await import("../src/lib/canaisDeVenda/ml/atributos.js");
      conferir("colarUnidade: 5 V, faixa e MHz; R3 e 3D intactos", ["5 V", "7 V a 12 V", "16 MHz", "UNO R3", "3D"].map(colarUnidade), ["5V", "7V a 12V", "16MHz", "UNO R3", "3D"]);
      conferir("separarUnidade: so numero e unidade ganha o espaco do ML", ["5V", "16MHz", "7V a 12V", "3D"].map(separarUnidade), ["5 V", "16 MHz", "7V a 12V", "3D"]);
    }
    {
      // "Nao se aplica" (pedido do dono em 25/10/2026): o rascunho guarda "-1" e o ML recebe value_id "-1" e value_name nulo.
      const { NAO_SE_APLICA, ehNaoSeAplica, aceitaNaoSeAplica } = await import("../src/lib/canaisDeVenda/ml/atributos.js");
      const { atributosDaFicha } = await import("../src/lib/canaisDeVenda/ml/payload.js");
      const porId = (id) => atributos.find((a) => a.id === id);
      conferir(
        "nao se aplica: so opcional, nunca obrigatorio nem codigo de barras",
        ["MICROCONTROLLER", "OPERATING_VOLTAGE", "BRAND", "MODEL", "GTIN", "EMPTY_GTIN_REASON"].map((id) => aceitaNaoSeAplica(porId(id))),
        [true, true, false, false, false, false],
      );
      conferir("nao se aplica: reconhece o -1 aparado, e so ele", [ehNaoSeAplica(" -1 "), ehNaoSeAplica("-1 V"), ehNaoSeAplica("")], [true, false, false]);
      conferir(
        "nao se aplica: opcional de lista nao vira 'fora da lista'",
        problemasDosAtributos({ BRAND: "X", MODEL: "Y", GTIN: "1", MICROCONTROLLER: NAO_SE_APLICA, INCLUDES_USB_CABLE: NAO_SE_APLICA, OPERATING_VOLTAGE: NAO_SE_APLICA }, atributos, { kit: false }),
        [],
      );
      conferir(
        "nao se aplica: obrigatorio recusa",
        problemasDosAtributos({ ...OPCIONAIS, BRAND: NAO_SE_APLICA, MODEL: "Y", GTIN: "1" }, atributos, { kit: false }).map((p) => [p.campo, p.bloqueante]),
        [["BRAND", true]],
      );
      conferir(
        "nao se aplica: vai ao ML como value_id -1 e value_name nulo",
        atributosDaFicha({ atributos: { MODEL: "uno", MICROCONTROLLER: NAO_SE_APLICA, OPERATING_VOLTAGE: "5V" } }),
        [{ id: "MODEL", value_name: "UNO" }, { id: "MICROCONTROLLER", value_id: "-1", value_name: null }, { id: "OPERATING_VOLTAGE", value_name: "5 V" }],
      );
    }
    const pedidoDaFicha = montarPedidoDaFicha({ titulo: "PLACA UNO", marca: "ARDUINO", modelo: "", descricao: "", especificacoes: [{ nome: "Tensão", valor: "5V" }], atributos, valoresAtuais: { BRAND: "ARDUINO" } });
    conferir(
      "pedido da ficha: so atributos em branco, com valores da lista",
      [pedidoDaFicha.includes("BRAND |"), pedidoDaFicha.includes("MICROCONTROLLER | "), pedidoDaFicha.includes("ATmega328P"), pedidoDaFicha.includes("Tensão: 5V")],
      [false, true, true, true],
    );
    conferir("lerCategoriaCompleta: atributos ja normalizados", (await lerCategoriaCompleta(falso, "MLB99779")).atributos[0].id, "BRAND");

    console.log("\nFase 2: rascunho, validacao com categoria e payload");
    const { LOGISTICAS_ML } = await import("../src/lib/canaisDeVenda/ml/rotulos.js");
    const { limiteDoTitulo } = await import("../src/lib/canaisDeVenda/ml/validacao.js");
    const categoriaCompleta = await lerCategoriaCompleta(falso, "MLB99779");
    const principal = {
      id: "p1", sku: "100101", tituloBase: "PLACA UNO", conferido: true, blingId: "1", precoVenda: 49, estoque: 20,
      pesoKg: 0.05, alturaCm: 5.5, larguraCm: 8, comprimentoCm: 8, marca: "ARDUINO", modelo: "UNO", ean: "", imagens: [],
    };
    const base = rascunhoInicial({ principal, produtosPorId: { p1: principal }, composicao: null });
    conferir("rascunho novo: logistica padrao e categoriaNome", [base.envio.logistica, base.categoriaNome], ["xd_drop_off", null]);
    conferir("LOGISTICAS_ML: tres opcoes com xd_drop_off primeiro", LOGISTICAS_ML.map((l) => l.valor), ["xd_drop_off", "fulfillment", "self_service"]);
    conferir("esquema: aceita logistica e categoriaNome", RascunhoMLSchema.safeParse({ ...base, categoriaNome: "Placas", envio: { ...base.envio, logistica: "fulfillment" } }).success, true);
    conferir("esquema: recusa logistica desconhecida", RascunhoMLSchema.safeParse({ ...base, envio: { ...base.envio, logistica: "moto" } }).success, false);
    const daFase1 = { ...base, envio: { ...base.envio } };
    delete daFase1.categoriaNome;
    delete daFase1.envio.logistica;
    conferir("esquema: rascunho da fase 1 (sem os dois) ganha os padroes", (({ categoriaNome, envio }) => [categoriaNome, envio.logistica])(RascunhoMLSchema.parse(daFase1)), [null, "xd_drop_off"]);

    const comCategoria = { ...base, categoriaId: "MLB99779", preco: 49, imagens: ["f1"], descricao: "x", atributos: { BRAND: "ARDUINO", MODEL: "UNO" }, envio: { ...base.envio, alturaCm: 5.5 } };
    const ctx = { produtos: { p1: principal }, codigoEmUso: null, frases: [], categoria: categoriaCompleta, categoriaErro: null };
    const problemasFase2 = validarRascunhoML(comCategoria, ctx);
    conferir("validacao: GTIN ou motivo e bloqueante com categoria lida", problemasFase2.filter((p) => p.campo === "GTIN").map((p) => [p.aba, p.bloqueante]), [["ficha", true]]);
    conferir("validacao: aviso de arredondamento no envio", problemasFase2.find((p) => p.campo === "arredondamento")?.problema, "O Mercado Envios recebe inteiros: altura 5,5 cm → 6 cm.");
    conferir("validacao: arredondamento e alerta na aba Envio", (({ aba, bloqueante }) => [aba, bloqueante])(problemasFase2.find((p) => p.campo === "arredondamento")), ["envio", false]);
    conferir(
      "validacao: categoria nao folha e bloqueante",
      validarRascunhoML({ ...comCategoria, categoriaId: "MLB1648" }, { ...ctx, categoria: await lerCategoriaCompleta(falso, "MLB1648") }).some((p) => p.campo === "categoria" && p.bloqueante),
      true,
    );
    conferir("validacao: fotos acima do maximo da categoria", validarRascunhoML({ ...comCategoria, imagens: Array.from({ length: 13 }, (_, i) => `f${i}`) }, ctx).some((p) => p.campo === "imagens" && p.bloqueante), true);
    conferir("validacao: categoria com erro de leitura e alerta", validarRascunhoML(comCategoria, { ...ctx, categoria: undefined, categoriaErro: "HTTP 500" }).find((p) => p.campo === "categoria")?.bloqueante, false);
    conferir("validacao: categoria lida de OUTRO codigo nao vale", validarRascunhoML({ ...comCategoria, categoriaId: "MLB1648" }, ctx).some((p) => p.campo === "categoria" && p.bloqueante), false);
    conferir(
      "limiteDoTitulo: da categoria, ou 60 sem ela",
      [limiteDoTitulo(comCategoria, { ...ctx, categoria: { ...categoriaCompleta, limiteTitulo: 70 } }), limiteDoTitulo(comCategoria, { ...ctx, categoria: undefined })],
      [70, 60],
    );
    conferir("validacao: titulo de 65 cabe no limite 70 da categoria", validarRascunhoML({ ...comCategoria, titulo: "A".repeat(65) }, { ...ctx, categoria: { ...categoriaCompleta, limiteTitulo: 70 } }).some((p) => p.campo === "titulo"), false);
    conferir("validacao: sem categoria lida, o alerta antigo de GTIN continua", validarRascunhoML(comCategoria, { ...ctx, categoria: undefined }).find((p) => p.campo === "GTIN")?.bloqueante, false);

    const payloadFase2 = montarPayloadML({ ...comCategoria, envio: { ...comCategoria.envio, alturaCm: 5.5, larguraCm: 8, comprimentoCm: 8, pesoKg: 0.05 } }, ctx);
    conferir(
      "payload: SELLER_PACKAGE_* inteiros em cm e g, logistic_type",
      [
        ...["SELLER_PACKAGE_HEIGHT", "SELLER_PACKAGE_WIDTH", "SELLER_PACKAGE_LENGTH", "SELLER_PACKAGE_WEIGHT"].map((id) => payloadFase2.item.attributes.find((a) => a.id === id)?.value_name),
        payloadFase2.item.shipping.logistic_type,
      ],
      ["6 cm", "8 cm", "8 cm", "50 g", "xd_drop_off"],
    );
    // `base` herda as quatro medidas do produto: tirar o peso e o que deixa o pacote incompleto.
    conferir(
      "payload: sem medida completa nao manda SELLER_PACKAGE_*",
      montarPayloadML({ ...base, envio: { ...base.envio, pesoKg: null } }, ctx).item.attributes.some((a) => a.id.startsWith("SELLER_PACKAGE")),
      false,
    );

    // No banco: os dois campos novos vao e voltam, e o anuncio da fase 1 (sem eles) abre com os padroes.
    await limpar();
    const pf2 = await prisma.produto.create({ data: { sku: "ZZ-ML-F2", tituloBase: "ZZ Fase 2", conferido: true, blingId: "999" } });
    const ctxF2 = await contextoDosProdutos([pf2.id]);
    const rascF2 = rascunhoInicial({ principal: ctxF2[pf2.id], produtosPorId: ctxF2, composicao: null });
    const salvoF2 = await salvarRascunhoML(null, { ...rascF2, categoriaNome: "Placas", envio: { ...rascF2.envio, logistica: "fulfillment" } });
    const lidoF2 = await carregarAnuncioML(salvoF2.id);
    conferir("banco: categoriaNome e logistica voltam", [salvoF2.ok, lidoF2.rascunho.categoriaNome, lidoF2.rascunho.envio.logistica], [true, "Placas", "fulfillment"]);
    const dadosDaFase1 = (await prisma.anuncio.findUnique({ where: { id: salvoF2.id } })).dados;
    delete dadosDaFase1.categoriaNome;
    delete dadosDaFase1.envio.logistica;
    await prisma.anuncio.update({ where: { id: salvoF2.id }, data: { dados: dadosDaFase1 } });
    const antigoF2 = await carregarAnuncioML(salvoF2.id);
    conferir("banco: anuncio da fase 1 abre com xd_drop_off e sem nome de categoria", [antigoF2.rascunho.envio.logistica, antigoF2.rascunho.categoriaNome], ["xd_drop_off", null]);
    await limpar();

    console.log("\nFase 2: custos e preco por margem");
    const { custosDoAnuncio, precoPorMargem, custosValem, freteQueConta, freteGratisObrigatorio } = await import("../src/lib/canaisDeVenda/ml/custos.js");
    const { lerTaxas, lerFreteDoVendedor, lerTendencias, limparCacheDeTendencias, lerCustosDoAnuncio, precoPorMargemNoML } = await import(
      "../src/lib/canaisDeVenda/ml/leitura.js"
    );
    // A partir de R$ 79 o frete gratis e obrigatorio (pedido do dono em 22/10/2026: marcado e sem desmarcar).
    conferir("frete gratis obrigatorio a partir de R$ 79", [freteGratisObrigatorio(78.99), freteGratisObrigatorio(79), freteGratisObrigatorio("120,00".replace(",", "."))], [false, true, true]);
    conferir("custos: 49 com custo 24, 13%, sem tarifa e sem frete", custosDoAnuncio({ preco: 49, custo: 24, percentual: 0.13, tarifaFixa: 0, frete: 0 }), {
      comissao: 6.37, tarifaFixa: 0, frete: 0, imposto: 2.94, lucro: 15.69, margem: 32, markup: 47.1,
    });
    conferir(
      "custos: sem custo, lucro e margem nulos",
      (({ lucro, margem, comissao }) => [lucro, margem, comissao])(custosDoAnuncio({ preco: 20, custo: null, percentual: 0.13, tarifaFixa: 6.65, frete: 0 })),
      [null, null, 2.6],
    );
    conferir("custos: sem preco e null", custosDoAnuncio({ preco: 0, custo: 24, percentual: 0.13, tarifaFixa: 0, frete: 0 }), null);
    conferir("preco por margem: R$ 20 de lucro", precoPorMargem({ custo: 24, percentual: 0.13, tarifaFixa: 0, frete: 0, margem: { tipo: "reais", valor: 20 } }), 54.33);
    // "percentual" = markup sobre o custo total (24/10/2026): P = 1,3 * 24 / (1 - 1,3 * 0,19) = 31,2 / 0,753 = 41,434...
    conferir("preco por markup: 30%", precoPorMargem({ custo: 24, percentual: 0.13, tarifaFixa: 0, frete: 0, margem: { tipo: "percentual", valor: 30 } }), 41.44);
    conferir("preco por markup: inatingivel (comissao de 95% + 6%)", precoPorMargem({ custo: 24, percentual: 0.95, tarifaFixa: 0, frete: 0, margem: { tipo: "percentual", valor: 40 } }), null);
    conferir(
      "preco por margem: arredonda para cima ao centavo (24,8 / 0,81 = 30,617...)",
      precoPorMargem({ custo: 10, percentual: 0.13, tarifaFixa: 6.65, frete: 8.15, margem: { tipo: "reais", valor: 0 } }),
      30.62,
    );
    conferir("preco por margem: sem custo e null", precoPorMargem({ custo: null, percentual: 0.13, tarifaFixa: 0, frete: 0, margem: { tipo: "reais", valor: 5 } }), null);
    conferir("preco por margem: o preco calculado devolve a margem pedida", (() => {
      const preco = precoPorMargem({ custo: 24, percentual: 0.13, tarifaFixa: 0, frete: 0, margem: { tipo: "reais", valor: 20 } });
      return custosDoAnuncio({ preco, custo: 24, percentual: 0.13, tarifaFixa: 0, frete: 0 }).lucro >= 20;
    })(), true);

    const lidos = { preco: 49, categoriaId: "MLB99779", tipoAnuncio: "gold_special", logistica: "xd_drop_off", freteGratis: false, percentual: 0.13, tarifaFixa: 0, frete: 8.15, pesoCobrado: 300, lidoEm: 1 };
    const r = { ...comCategoria, preco: 49, tipoAnuncio: "gold_special", envio: { ...comCategoria.envio, larguraCm: 8, comprimentoCm: 8, pesoKg: 0.05, logistica: "xd_drop_off", freteGratis: false } };
    conferir("custosValem: iguais", custosValem(lidos, r), true);
    conferir(
      "custosValem: mudou tipo, categoria, logistica ou preco",
      [
        custosValem(lidos, { ...r, tipoAnuncio: "gold_pro" }),
        custosValem(lidos, { ...r, categoriaId: "MLB1" }),
        custosValem(lidos, { ...r, envio: { ...r.envio, logistica: "fulfillment" } }),
        custosValem(lidos, { ...r, preco: 49.5 }),
      ],
      [false, false, false, false],
    );
    conferir("custosValem: sem custos lidos", custosValem(null, r), false);
    // Medido nas vendas reais de 22/10/2026: abaixo de R$ 79 o ML cobra o frete do vendedor (R$ 6,85) mesmo sem frete
    // gratis anunciado; o frete conta SEMPRE, e nao so com o frete gratis ligado.
    conferir("freteQueConta: conta sempre", [freteQueConta(lidos, r), freteQueConta(lidos, { ...r, envio: { ...r.envio, freteGratis: true } })], [8.15, 8.15]);
    conferir("freteQueConta: frete nao lido conta 0", freteQueConta({ ...lidos, frete: null }, { ...r, envio: { ...r.envio, freteGratis: true } }), 0);

    conferir("lerTaxas: xd_drop_off sem tarifa fixa", await lerTaxas(falso, { preco: 20, categoriaId: "MLB99779", tipoAnuncio: "gold_special", logistica: "xd_drop_off" }), { percentual: 0.13, tarifaFixa: 0, comissao: 2.6 });
    conferir("lerTaxas: self_service abaixo do limite cobra 6,65", await lerTaxas(falso, { preco: 20, categoriaId: "MLB99779", tipoAnuncio: "gold_special", logistica: "self_service" }), { percentual: 0.13, tarifaFixa: 6.65, comissao: 9.25 });
    conferir("lerTaxas: premium 18%", (await lerTaxas(falso, { preco: 150, categoriaId: "MLB99779", tipoAnuncio: "gold_pro", logistica: "xd_drop_off" })).percentual, 0.18);
    conferir(
      "lerTaxas: manda shipping_mode me2 e logistic_type",
      (({ shipping_mode, logistic_type, listing_type_id }) => [shipping_mode, logistic_type, listing_type_id])(falso.chamadas.at(-1).params),
      ["me2", "xd_drop_off", "gold_pro"],
    );
    conferir(
      "lerFrete: abaixo de R$ 79 pede sem frete gratis (o que o ML cobra do vendedor)",
      [
        await lerFreteDoVendedor(falso, { envio: { alturaCm: 5.5, larguraCm: 8, comprimentoCm: 8, pesoKg: 0.05 }, preco: 49, tipoAnuncio: "gold_special", logistica: "xd_drop_off" }),
        String(falso.chamadas.at(-1).params.free_shipping),
      ],
      [{ custo: 6.85, pesoCobrado: 300 }, "false"],
    );
    conferir(
      "lerFrete: de R$ 79 para cima, o frete gratis obrigatorio",
      [
        await lerFreteDoVendedor(falso, { envio: { alturaCm: 5.5, larguraCm: 8, comprimentoCm: 8, pesoKg: 0.05 }, preco: 79, tipoAnuncio: "gold_special", logistica: "xd_drop_off" }),
        String(falso.chamadas.at(-1).params.free_shipping),
      ],
      [{ custo: 8.15, pesoCobrado: 300 }, "true"],
    );
    conferir(
      "lerFrete: abaixo de R$ 79 com frete gratis ligado pelo dono, pede com frete gratis",
      (await lerFreteDoVendedor(falso, { envio: { alturaCm: 5.5, larguraCm: 8, comprimentoCm: 8, pesoKg: 0.05, freteGratis: true }, preco: 49, tipoAnuncio: "gold_special", logistica: "xd_drop_off" })).custo,
      8.15,
    );
    conferir("lerFrete: formato AxLxC,g e o usuario no caminho", [falso.chamadas.at(-1).params.dimensions, falso.chamadas.at(-1).caminho], ["6x8x8,50", "/users/212386247/shipping_options/free"]);
    const antesDoFrete = falso.chamadas.length;
    conferir(
      "lerFrete: sem medidas e null, sem chamada",
      [await lerFreteDoVendedor(falso, { envio: {}, preco: 49, tipoAnuncio: "gold_special", logistica: "xd_drop_off" }), falso.chamadas.length],
      [null, antesDoFrete],
    );
    limparCacheDeTendencias();
    const antesDasTendencias = falso.chamadas.length;
    const t1 = await lerTendencias(falso, "MLB99779");
    const t2 = await lerTendencias(falso, "MLB99779");
    conferir("tendencias: so keyword, 40 termos, segunda leitura vem do cache", [t1.length, t1[0], JSON.stringify(t2) === JSON.stringify(t1), falso.chamadas.length - antesDasTendencias], [40, "raspberry pi", true, 1]);
    const custosML = await lerCustosDoAnuncio(falso, r);
    // Preco do rascunho abaixo de R$ 79: o frete e o cobrado sem frete gratis (6,85 no falso).
    conferir("lerCustosDoAnuncio: junta taxas e frete e vale para o rascunho", [custosML.percentual, custosML.frete, custosML.pesoCobrado, custosValem(custosML, r)], [0.13, 6.85, 300, true]);
    conferir("lerCustosDoAnuncio: sem medidas, frete nulo", (await lerCustosDoAnuncio(falso, { ...r, envio: { ...r.envio, pesoKg: null } })).frete, null);
    const porMargem = await precoPorMargemNoML(falso, { ...r, envio: { ...r.envio, logistica: "self_service", freteGratis: true } }, { custo: 24, margem: { tipo: "reais", valor: 20 } });
    conferir("precoPorMargemNoML: converge com tarifa fixa e frete (self_service, frete gratis)", [porMargem.preco, porMargem.custosML.preco, porMargem.custosML.tarifaFixa], [72.6, 72.6, 6.65]);
    // O "percentual" e markup (% do custo) desde 24/10/2026: 100% devolve um preco cujo lucro, com as taxas, cobre o custo.
    const porMarkup = await precoPorMargemNoML(falso, r, { custo: 24, margem: { tipo: "percentual", valor: 100 } });
    conferir("precoPorMargemNoML: 100% de markup da lucro igual ao custo", custosDoAnuncio({ preco: porMarkup.preco, custo: 24, percentual: porMarkup.custosML.percentual, tarifaFixa: porMarkup.custosML.tarifaFixa, frete: freteQueConta(porMarkup.custosML, r) }).markup >= 100, true);
    // Acima do limite (79) a tarifa fixa some: o preco que a calcula tem que reler as taxas nele.
    const acimaDoLimite = await precoPorMargemNoML(falso, { ...r, envio: { ...r.envio, logistica: "self_service" } }, { custo: 60, margem: { tipo: "reais", valor: 10 } });
    // (60 + 10 + frete 8,15) / (1 - 13% - 6%) = 96,49: o frete agora conta sempre (era 86,42 sem ele).
    conferir("precoPorMargemNoML: rele as taxas no preco novo (tarifa some acima de 79)", [acimaDoLimite.preco, acimaDoLimite.custosML.tarifaFixa], [96.49, 0]);

    // So as partes puras: nenhuma chamada a IA sai do teste.
    console.log("\nFase 2: pedidos e limpeza da IA");
    const { montarPedidoDeEscolha, limparEscolha, limparTermos } = await import("../src/lib/ia/categoriaML.js");
    const { montarPedidoDeTitulo } = await import("../src/lib/ia/tituloML.js");
    const { jsonDoTexto } = await import("../src/lib/ia/pesquisaML.js");
    const candidatas = [
      { categoriaId: "MLB99779", nome: "Placas", caminho: ["A", "B"] },
      { categoriaId: "MLB1", nome: "Outra", caminho: ["C"] },
    ];
    conferir("escolha: pedido lista as candidatas por id e caminho", montarPedidoDeEscolha({ titulo: "PLACA UNO", marca: "", modelo: "", descricao: "", candidatas }).includes("MLB99779: A > B"), true);
    conferir(
      "escolha: so id das candidatas",
      [limparEscolha({ categoriaId: "MLB1", motivo: "x" }, candidatas), limparEscolha({ categoriaId: "MLB9", motivo: "x" }, candidatas), limparEscolha(null, candidatas)],
      [{ categoriaId: "MLB1", motivo: "x" }, null, null],
    );
    conferir("termos: aparados, sem repetidos, ate 3", limparTermos({ termos: [" arduino uno ", "arduino uno", "uno r3 ch340", "placa", "quinto"] }), ["arduino uno", "uno r3 ch340", "placa"]);
    conferir("termos: corta em 60 e ignora o que nao e texto", limparTermos({ termos: ["x".repeat(80), 7, null] }), ["x".repeat(60)]);
    const pedidoTitulo = montarPedidoDeTitulo({
      produto: { tituloBase: "PLACA UNO", marca: "ARDUINO", modelo: "UNO", descricao: "" },
      kit: { unidades: 5, itens: ["PLACA UNO"] },
      tendencias: ["arduino uno", "kit arduino"],
      limite: 60,
      titulosRecusados: [],
    });
    conferir("titulo: pedido cita o kit, as tendencias e o limite", [pedidoTitulo.includes("KIT"), pedidoTitulo.includes("arduino uno"), pedidoTitulo.includes("60")], [true, true, true]);
    conferir(
      "titulo: sem tendencias nao promete palavras em alta",
      montarPedidoDeTitulo({ produto: { tituloBase: "PLACA" }, kit: null, tendencias: [], limite: 60, titulosRecusados: [] }).includes("em alta"),
      false,
    );
    conferir("jsonDoTexto: o texto inteiro e JSON", jsonDoTexto('{"termos": ["a"]}'), { termos: ["a"] });
    conferir("jsonDoTexto: acha o JSON depois do texto da pesquisa", jsonDoTexto('Pesquisei. Resultado:\n```json\n{"termos": ["a"]}\n```'), { termos: ["a"] });
    conferir("jsonDoTexto: sem JSON e null", jsonDoTexto("nada aqui"), null);

    // A IA entra por parametro (`ia`): o teste passa funcoes falsas e confere o que elas recebem.
    console.log("\nFase 2: orquestracao com o ML falso");
    const { sugerirCategoria, sugerirTitulos, preencherFicha } = await import("../src/lib/canaisDeVenda/ml/inteligencia.js");
    const produtoIA = { tituloBase: "PLACA UNO", marca: "ARDUINO", modelo: "UNO", descricaoBase: "Especificações técnicas:\n- Microcontrolador: ATmega328P;" };
    const naoChame = async () => {
      throw new Error("nao devia chamar");
    };
    const umaSo = await sugerirCategoria(falso, { titulo: "placa uno r3 ch340", produto: produtoIA, ia: { escolher: naoChame, termos: naoChame } });
    conferir(
      "sugerirCategoria: uma candidata nao chama a IA, vem com nome, caminho e folha",
      [umaSo.origem, umaSo.aviso, umaSo.candidatas.map((c) => [c.categoriaId, c.folha, c.recomendada, c.caminho.length])],
      ["ml", null, [["MLB99779", true, false, 3]]],
    );
    const duas = criarMLFalso({ descoberta: { placa: ["MLB99779", "MLB1648"] } });
    const escolhida = await sugerirCategoria(duas, { titulo: "placa", produto: produtoIA, ia: { escolher: async () => ({ categoriaId: "MLB99779", motivo: "é placa" }), termos: naoChame } });
    conferir("sugerirCategoria: duas candidatas, a IA recomenda uma", escolhida.candidatas.map((c) => [c.categoriaId, c.recomendada, c.motivo]), [["MLB99779", true, "é placa"], ["MLB1648", false, null]]);
    const iaCaiu = await sugerirCategoria(duas, { titulo: "placa", produto: produtoIA, ia: { escolher: async () => { throw new Error("IA fora"); }, termos: naoChame } });
    conferir("sugerirCategoria: IA falha, candidatas ficam e o aviso diz", [iaCaiu.candidatas.length, iaCaiu.aviso], [2, "Não foi possível pedir a recomendação da IA: IA fora"]);
    // 22/10/2026: o domain_discovery passou a devolver [] para tudo (ate "celular samsung"). Reserva: a categoria que os
    // anuncios dos catalogos achados pelo titulo usam (o `/products/{id}/items` traz o `category_id`).
    const peloCatalogo = await sugerirCategoria(falso, { titulo: "uno r3 ch340", produto: produtoIA, ia: { escolher: naoChame, termos: naoChame } });
    conferir("sugerirCategoria: ML sem resposta, a categoria vem dos anuncios do catalogo", [peloCatalogo.origem, peloCatalogo.candidatas.map((c) => [c.categoriaId, c.caminho.length])], ["catalogo", [["MLB99779", 3]]]);
    const pelaInternet = await sugerirCategoria(falso, { titulo: "xyzw nada", produto: produtoIA, ia: { escolher: naoChame, termos: async () => ["placa uno r3 ch340", "placa uno r3 ch340"] } });
    conferir("sugerirCategoria: sem candidata, termos da IA voltam ao ML, sem repetir", [pelaInternet.origem, pelaInternet.candidatas.map((c) => c.categoriaId)], ["internet", ["MLB99779"]]);
    conferir(
      "sugerirCategoria: nada em lugar nenhum",
      (await sugerirCategoria(falso, { titulo: "xyzw nada", produto: produtoIA, ia: { escolher: naoChame, termos: async () => [] } })).aviso,
      "O Mercado Livre não achou categoria para este produto. Digite o código.",
    );
    const pesquisaCaiu = await sugerirCategoria(falso, { titulo: "xyzw nada", produto: produtoIA, ia: { escolher: naoChame, termos: async () => { throw new Error("sem rede"); } } });
    conferir("sugerirCategoria: pesquisa falha, diz o motivo e pede o codigo", [pesquisaCaiu.candidatas, pesquisaCaiu.aviso], [[], "Não foi possível pesquisar na internet: sem rede. Digite o código da categoria."]);

    let recebido = null;
    const titulosIA = await sugerirTitulos(falso, { produto: produtoIA, kit: null, categoriaId: "MLB99779", limite: 60, ia: async (args) => { recebido = args; return ["A", "B"]; } });
    conferir("sugerirTitulos: passa tendencias e limite a IA", [titulosIA, recebido.tendencias.length, recebido.limite], [["A", "B"], 40, 60]);
    await sugerirTitulos(falso, { produto: produtoIA, kit: null, categoriaId: null, limite: 60, ia: async (args) => { recebido = args; return ["A"]; } });
    conferir("sugerirTitulos: sem categoria, sem tendencias", recebido.tendencias, []);
    const semTendencias = criarMLFalso({ tendencias: { MLB99779: undefined } });
    limparCacheDeTendencias();
    await sugerirTitulos(semTendencias, { produto: produtoIA, kit: null, categoriaId: "MLB99779", limite: 60, ia: async (args) => { recebido = args; return ["A"]; } });
    conferir("sugerirTitulos: categoria sem tendencias no ML segue sem elas", recebido.tendencias, []);

    let pedidoDaIA = null;
    const fichaIA = await preencherFicha(falso, {
      produto: produtoIA, categoriaId: "MLB99779", valoresAtuais: { BRAND: "ARDUINO" }, internet: true,
      ia: async (args) => { pedidoDaIA = args; return [{ id: "MODEL", nome: "Modelo", valor: "UNO R3" }]; },
    });
    conferir(
      "preencherFicha: le a categoria, extrai as especificacoes e passa tudo a IA",
      [fichaIA, pedidoDaIA.especificacoes.length, pedidoDaIA.atributos[0].id, pedidoDaIA.valoresAtuais, pedidoDaIA.internet],
      [[{ id: "MODEL", nome: "Modelo", valor: "UNO R3" }], 1, "BRAND", { BRAND: "ARDUINO" }, true],
    );
    let semCategoria = null;
    try {
      await preencherFicha(falso, { produto: produtoIA, categoriaId: "MLB0", valoresAtuais: {}, internet: false, ia: naoChame });
    } catch (erro) {
      semCategoria = erro.message;
    }
    conferir("preencherFicha: categoria que o ML nao conhece", semCategoria, "Categoria não encontrada no Mercado Livre.");

    // Revisao final: o motivo de "sem GTIN" e do estado (kit ou avulso sem EAN) e nao pode sobrar ao
    // trocar de estado; e uma categoria grande preenchida pela IA nao pode travar o Salvar.
    console.log("\nFase 2: revisao final (motivo sem GTIN e limite de atributos)");
    const composicaoDeDois = { itens: [{ produtoId: "p1", quantidade: 2 }], codigo: "", blingProdutoId: null };
    const kitComMotivo = aplicarComposicao({ ...base, atributos: { ...base.atributos, EMPTY_GTIN_REASON: "O produto não tem código cadastrado" } }, composicaoDeDois, { p1: principal });
    conferir("virar kit tira o motivo de sem GTIN do avulso", "EMPTY_GTIN_REASON" in kitComMotivo.atributos, false);
    const deVolta = aplicarComposicao(
      { ...kitComMotivo, atributos: { ...kitComMotivo.atributos, EMPTY_GTIN_REASON: "O produto é um kit ou pack" } },
      null,
      { p1: { ...principal, ean: "7890000000001" } },
    );
    conferir("desligar o kit tira o motivo 'kit ou pack' e devolve o GTIN", [deVolta.atributos.GTIN, "EMPTY_GTIN_REASON" in deVolta.atributos], ["7890000000001", false]);
    conferir(
      "payload: com GTIN, o motivo de nao ter nao vai",
      montarPayloadML({ ...comCategoria, atributos: { BRAND: "A", MODEL: "B", GTIN: "789", EMPTY_GTIN_REASON: "Outro motivo" } }, ctx).item.attributes.some((a) => a.id === "EMPTY_GTIN_REASON"),
      false,
    );
    conferir(
      "payload: kit manda o EAN do kit no lugar do motivo",
      montarPayloadML({ ...comCategoria, composicao: { ...composicaoDeDois, codigo: "100101_2" }, atributos: { EMPTY_GTIN_REASON: "O produto é um kit ou pack" } }, ctx).item.attributes.some((a) => a.id === "EMPTY_GTIN_REASON"),
      false,
    );
    conferir(
      "esquema: aceita 100 atributos (categoria grande preenchida pela IA)",
      RascunhoMLSchema.safeParse({ ...base, atributos: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`ATRIBUTO_${i}`, "x"])) }).success,
      true,
    );

    // Fase 2: as proximas tarefas entram aqui, dentro deste bloco.
  }

  // Fase 3 (Publicar): um bloco so, porque o ML falso, o Bling falso e os imports sao compartilhados
  // pelos sub-blocos de cada tarefa do plano de 08/10/2026.
  {
    const { criarMLFalso } = await import("./lib/mlFalso.js");

    {
      console.log("\nFase 3: cliente com escrita e ML falso");
      const ml = criarMLFalso({ codigosLiberados: ["100101"] });
      let recusa = null;
      try { await ml.post("/items", {}); } catch (e) { recusa = e.message; }
      conferir("falso: escrita sem exigirEscrita lanca", /exigirEscrita/.test(recusa), true);
      let fora = null;
      try { ml.exigirEscrita("999999"); } catch (e) { fora = e.message; }
      conferir("falso: codigo fora da lista recusado", /999999.*ML_PUBLICACAO_CODIGOS/.test(fora), true);
      ml.exigirEscrita("100101");
      conferir("falso: validate sem erro e 204", (await ml.post("/items/validate", { family_name: "X" })).status, 204);
      const foto = await ml.upload("/pictures/items/upload", { bytes: Buffer.from("jpg"), nome: "a-1.jpg", tipo: "image/jpeg" });
      conferir("falso: upload devolve id", [foto.status, /^999-MLB/.test(foto.dados.id)], [200, true]);
      conferir("falso: POST /items com title e 400", (await ml.post("/items", { title: "X", family_name: "X" })).status, 400);
      const criado = await ml.post("/items", { family_name: "PLACA", status: "paused", price: 50 });
      conferir("falso: cria pausado com MLB", [criado.status, criado.dados.status, /^MLB\d+$/.test(criado.dados.id)], [201, "paused", true]);
      conferir("falso: GET do item criado", (await ml.get(`/items/${criado.dados.id}`)).dados.family_name, "PLACA");
      const ativado = await ml.put(`/items/${criado.dados.id}`, { status: "active" });
      conferir("falso: PUT muda o status", [ativado.status, ativado.dados.status], [200, "active"]);
      conferir("falso: escritas registradas", ml.escritas.map((e) => e.metodo), ["POST", "POST", "POST", "POST", "PUT"]);
      const pausadoIgnorado = criarMLFalso({ ignorarPausado: true });
      pausadoIgnorado.exigirEscrita("x");
      conferir("falso: ignorarPausado nasce active", (await pausadoIgnorado.post("/items", { family_name: "Y", status: "paused" })).dados.status, "active");
      const comFalha = criarMLFalso({ falhas: [{ metodo: "POST", caminho: "/items/MLB", status: 500 }] });
      comFalha.exigirEscrita("x");
      const item = (await comFalha.post("/items", { family_name: "Z" })).dados.id;
      conferir(
        "falso: falha programada uma vez",
        [(await comFalha.post(`/items/${item}/description`, { plain_text: "a" })).status, (await comFalha.post(`/items/${item}/description`, { plain_text: "a" })).status],
        [500, 201],
      );
      const comQueda = criarMLFalso({ falhas: [{ metodo: "POST", caminho: "/items", lancar: true }] });
      comQueda.exigirEscrita("x");
      let caiu = false;
      try { await comQueda.post("/items", { family_name: "Q" }); } catch { caiu = true; }
      conferir("falso: falha programada pode lancar (rede)", caiu, true);
      const comValidacao = criarMLFalso({ validacao: { status: 400, dados: { message: "Validation error", cause: [] } } });
      comValidacao.exigirEscrita("x");
      conferir("falso: validacao programada", (await comValidacao.post("/items/validate", {})).status, 400);

      const { config, separarLista } = await import("../src/lib/integracoes/config.js");
      conferir("config: lista do ML separada como a do Bling", separarLista(" 100101 ,, ZZ-ML-1"), ["100101", "ZZ-ML-1"]);
      conferir("config: trava do ML tem lista de codigos", Array.isArray(config.travas.mlCodigosLiberados), true);
      const { clienteML } = await import("../src/lib/canaisDeVenda/ml/cliente.js");
      const real = clienteML();
      conferir("clienteML: contrato com escrita", ["get", "usuarioId", "post", "put", "upload", "exigirEscrita"].map((k) => typeof real[k]), Array(6).fill("function"));
      let travado = null;
      try { real.exigirEscrita("100101"); } catch (e) { travado = e.message; }
      // O .env do teste tem ML_PUBLICACAO=false: a trava geral recusa antes da lista.
      conferir("clienteML: com a trava fechada, exigirEscrita recusa", config.travas.mlPublicacao ? "trava aberta no ambiente" : /ML_PUBLICACAO/.test(travado), config.travas.mlPublicacao ? "trava aberta no ambiente" : true);

      // requisitar com FormData: o corpo vai cru, sem Content-Type (o fetch poe o boundary).
      const { requisitar } = await import("../src/lib/integracoes/httpClient.js");
      const fetchOriginal = globalThis.fetch;
      let pedido = null;
      globalThis.fetch = async (url, opcoes) => {
        pedido = opcoes;
        return new Response("{}", { status: 200 });
      };
      try {
        const formulario = new FormData();
        formulario.append("file", new Blob([Buffer.from("jpg")], { type: "image/jpeg" }), "a-1.jpg");
        await requisitar({ servico: "MERCADO_LIVRE", url: "https://teste-rise.invalid/pictures/items/upload", metodo: "POST", corpo: formulario, tentativas: 1 });
        conferir("requisitar: FormData vai cru", pedido.body === formulario, true);
        conferir("requisitar: FormData sem Content-Type", Object.keys(pedido.headers).some((k) => k.toLowerCase() === "content-type"), false);
      } finally {
        globalThis.fetch = fetchOriginal;
        // O requisitar registra toda chamada: o registro deste teste (fetch falso) sai do log.
        await prisma.logIntegracao.deleteMany({ where: { endpoint: "https://teste-rise.invalid/pictures/items/upload" } });
      }
      conferir("requisitar: o teste nao deixa registro no LogIntegracao", await prisma.logIntegracao.count({ where: { endpoint: { startsWith: "https://teste-rise.invalid" } } }), 0);
    }

    {
      console.log("\nFase 3: payload e respostas do ML");
      const { corpoDaCriacao, causasDoML, situacaoDoItem, textoDaRecusaML } = await import("../src/lib/canaisDeVenda/ml/respostas.js");
      const rascunhoP = {
        produtoId: "p", titulo: "PLACA UNO R3 CH340 COMPATIVEL ARDUINO", familyName: "OUTRA COISA", tipoAnuncio: "gold_special", condicao: "new",
        categoriaId: "MLB99779", categoriaNome: null, preco: 49.9, estoque: 7, imagens: ["f1", "f2"], descricao: "x", atributos: { BRAND: "genérica" },
        envio: { pesoKg: 0.05, alturaCm: 2, larguraCm: 6, comprimentoCm: 7, modo: "me2", logistica: "xd_drop_off", freteGratis: false, retirada: false },
        composicao: null,
      };
      const p = montarPayloadML(rascunhoP, { produtos: { p: { sku: "100101" } }, frases: [] });
      conferir("payload: sem title", "title" in p.item, false);
      conferir("payload: family_name e o titulo", p.item.family_name, "PLACA UNO R3 CH340 COMPATIVEL ARDUINO");
      conferir("payload: preco e buying_mode no item", [p.item.price, p.item.buying_mode], [49.9, "buy_it_now"]);
      conferir("payload: titulo longo cortado no limite", montarPayloadML({ ...rascunhoP, titulo: "A".repeat(70) }, { produtos: {}, frases: [] }).item.family_name.length, 60);
      conferir("validacao: family_name proprio nao e mais exigido", validarRascunhoML({ ...rascunhoP, familyName: "" }, { produtos: { p: { sku: "100101", conferido: true, blingId: "1" } }, frases: [] }).some((x) => x.campo === "familyName"), false);
      conferir("corpoDaCriacao: fotos por id", corpoDaCriacao(p.item, ["a", "b"]).pictures, [{ id: "a" }, { id: "b" }]);
      conferir("corpoDaCriacao: nao muda o item de entrada", p.item.pictures, [{ nome: "placa-uno-r3-ch340-compativel-arduino-1.jpg" }, { nome: "placa-uno-r3-ch340-compativel-arduino-2.jpg" }]);
      conferir(
        "causasDoML: separa erro e aviso",
        causasDoML({ message: "Validation error", cause: [{ type: "error", code: "item.attribute.missing", message: "Falta BRAND" }, { type: "warning", code: "x.y", message: "Foto pequena" }] }),
        { erros: ["Falta BRAND (item.attribute.missing)"], avisos: ["Foto pequena (x.y)"] },
      );
      conferir("causasDoML: sem cause usa message", causasDoML({ message: "invalid token" }), { erros: ["invalid token"], avisos: [] });
      conferir("causasDoML: nada", causasDoML(null), { erros: [], avisos: [] });
      // 09/11/2026: o ML dos dados fiscais manda o motivo em `errorlist`, com `cause` vazio.
      conferir(
        "causasDoML: errorlist com objetos",
        causasDoML({ message: "Many errors. 1 embedded errors, see errorlist property for details", cause: [], errorlist: [{ code: "invalid_ncm", message: "NCM invalido", field: "tax_information.ncm" }] }),
        { erros: ["NCM invalido (invalid_ncm) [tax_information.ncm]"], avisos: [] },
      );
      conferir("causasDoML: errorlist com texto puro", causasDoML({ message: "Many errors", errorlist: ["CEST obrigatorio para este NCM"] }), { erros: ["CEST obrigatorio para este NCM"], avisos: [] });
      conferir("causasDoML: errorlist de forma desconhecida vira JSON", causasDoML({ message: "Many errors", errorlist: [{ x: 1 }] }), { erros: ['{"x":1}'], avisos: [] });
      conferir("causasDoML: errorlist vazio cai na message", causasDoML({ message: "Many errors", errorlist: [] }), { erros: ["Many errors"], avisos: [] });
      conferir(
        "textoDaRecusaML: mostra o motivo do errorlist",
        textoDaRecusaML({ status: 400, dados: { message: "Many errors. 1 embedded errors", cause: [], errorlist: [{ message: "NCM invalido", code: "ncm" }] } }, "os dados fiscais do SKU 940502_2"),
        "O Mercado Livre recusou os dados fiscais do SKU 940502_2 (HTTP 400): NCM invalido (ncm)",
      );
      conferir("situacaoDoItem", ["active", "paused", "closed", "x"].map(situacaoDoItem), ["ATIVA", "PAUSADA", "ENCERRADA", "DESCONHECIDA"]);
      conferir("textoDaRecusaML", textoDaRecusaML({ status: 400, dados: { message: "bad", cause: [] } }, "a criação do anúncio"), "O Mercado Livre recusou a criação do anúncio (HTTP 400): bad");
      conferir("textoDaRecusaML: sem texto", textoDaRecusaML({ status: 500, dados: null }, "a descrição"), "O Mercado Livre recusou a descrição (HTTP 500).");
    }

    {
      console.log("\nFase 3: vínculo e kit no Bling");
      const { criarBlingFalso } = await import("./lib/blingFalso.js");
      const { LOJA_ML_NO_BLING, vinculoNoBlingML, vincularNoBlingML, anuncioNoBlingML, registrarAnuncioNoBlingML, conferirKitNoBling, corpoDoKitDoAnuncio, criarKitNoBling } = await import("../src/lib/canaisDeVenda/ml/bling.js");
      const produtosDoBling = [
        { id: 101, codigo: "100101", nome: "PLACA UNO", formato: "S", preco: 49 },
        { id: 102, codigo: "100102", nome: "PLACA NANO", formato: "S", preco: 39 },
        { id: 103, codigo: "100103", nome: "PLACA MEGA", formato: "S", preco: 99 },
        { id: 809, codigo: "120809", nome: "KIT *120809", formato: "E", estrutura: { tipoEstoque: "V", lancamentoEstoque: "", componentes: [{ produto: { id: 101 }, quantidade: 1 }, { produto: { id: 102 }, quantidade: 2 }] } },
      ];
      const vinculosDeLoja = [{ codigo: "MLB4165084257", preco: 49.9, produto: { id: 101 }, loja: { id: 206326819 } }];
      const novoBling = (extra = {}) => criarBlingFalso({ produtos: produtosDoBling, vinculosDeLoja, ...extra });
      const posts = (bling, caminho) => bling.chamadas.filter((c) => c.metodo === "POST" && c.caminho === caminho);

      const bf = novoBling();
      conferir("loja do ML no Bling", LOJA_ML_NO_BLING, "206326819");
      // O vinculo produto-loja e UM por produto (medido em 08/10/2026): com qualquer MLB ja ligado, o produto esta
      // ligado a loja; os anuncios, um por MLB, ficam em /anuncios.
      conferir("vinculo: qualquer MLB na loja conta como ligado", (await vinculoNoBlingML(bf, "100101", "MLB1")).situacao, "ligado");
      conferir("vinculo: lista os outros MLB", (await vinculoNoBlingML(bf, "100101", "MLB1")).outros, ["MLB4165084257"]);
      conferir("vinculo: produto sem vinculo", (await vinculoNoBlingML(bf, "100102", "MLB1")).situacao, "sem_vinculo");
      conferir("vinculo: produto fora do Bling", (await vinculoNoBlingML(bf, "999999", "MLB1")).situacao, "sem_produto_no_bling");
      const bfTravado = novoBling({ codigosLiberados: ["outro"] });
      const recusado = await vincularNoBlingML(bfTravado, "100102", "MLB1", 49.9);
      conferir("vincular: trava recusa sem escrever", [recusado.ok, bfTravado.chamadas.some((c) => c.metodo === "POST"), /Escrita bloqueada/.test(recusado.erro)], [false, false, true]);
      // Medido no primeiro envio real (08/10/2026): o Bling aceita UM vinculo por produto na loja ("Para esta loja
      // ja existe um produto loja vinculado ao produto informado"). Com outro MLB ja ligado, reaproveita sem escrever.
      const outroJaLigado = await vincularNoBlingML(bf, "100101", "MLB1", 49.9);
      conferir("vincular: produto com outro MLB na loja reaproveita sem escrever", [outroJaLigado.ok, outroJaLigado.jaEstava, posts(bf, "/produtos/lojas").length], [true, true, 0]);
      const v = await vincularNoBlingML(bf, "100102", "MLB1", 49.9);
      conferir("vincular: POST na loja do ML com o MLB e o preco", [v.ok, posts(bf, "/produtos/lojas").at(-1)?.corpo], [true, { codigo: "MLB1", preco: 49.9, produto: { id: 102 }, loja: { id: 206326819 } }]);
      const deNovo = await vincularNoBlingML(bf, "100102", "MLB1", 49.9);
      conferir("vincular: segunda vez nao duplica", [deNovo.ok, deNovo.jaEstava, posts(bf, "/produtos/lojas").length], [true, true, 1]);
      const bfRecusa = novoBling({ falhas: [{ metodo: "POST", caminho: "/produtos/lojas", status: 400, mensagem: "vinculo repetido" }] });
      const recusaDoBling = await vincularNoBlingML(bfRecusa, "100102", "MLB1", 49.9);
      conferir("vincular: recusa do Bling volta com o motivo", [recusaDoBling.ok, /vinculo repetido/.test(recusaDoBling.erro)], [false, true]);
      bf.exigirEscrita("100101");
      const direto = await bf.post("/produtos/lojas", { codigo: "MLB2", preco: 1, produto: { id: 101 }, loja: { id: 206326819 } });
      conferir("bling falso: segundo vinculo do produto na mesma loja e 400, como o real", [direto.status, JSON.stringify(direto.dados).includes("já existe um produto loja vinculado")], [400, true]);

      // /anuncios do Bling: um registro por MLB (medido em 08/10/2026; formato no CLAUDE.md).
      const bfAnuncios = novoBling({ anuncios: [{ produto: { id: 101 }, loja: { id: 206326819 }, anuncioLoja: { id: "MLB4165084257" }, nome: "PLACA UNO", preco: { valor: 49.9 }, situacao: 1 }] });
      conferir("bling falso: GET /anuncios exige tipoIntegracao e idLoja", (await bfAnuncios.get("/anuncios", { idProduto: 101 })).status, 400);
      const lista = await bfAnuncios.get("/anuncios", { tipoIntegracao: "MercadoLivre", idLoja: 206326819, idProduto: 101 });
      conferir("bling falso: GET /anuncios lista o registro do produto", [lista.status, lista.dados.data.map((a) => [a.anuncioLoja.id, a.titulo, a.situacao, a.preco])], [200, [["MLB4165084257", "PLACA UNO", 1, 49.9]]]);
      conferir("bling falso: GET /anuncios de outro produto e vazio", (await bfAnuncios.get("/anuncios", { tipoIntegracao: "MercadoLivre", idLoja: 206326819, idProduto: 102 })).dados.data, []);
      conferir("anuncioNoBlingML: registrado", (await anuncioNoBlingML(bfAnuncios, 101, "MLB4165084257")).situacao, "registrado");
      conferir("anuncioNoBlingML: nao registrado", (await anuncioNoBlingML(bfAnuncios, 101, "MLB1")).situacao, "nao_registrado");
      const registroTravado = await registrarAnuncioNoBlingML(novoBling({ codigosLiberados: ["outro"] }), { codigo: "100101", idProduto: 101, itemId: "MLB1", titulo: "PLACA", preco: 999, tipoAnuncio: "gold_pro" });
      conferir("registrarAnuncio: trava recusa", [registroTravado.ok, /Escrita bloqueada/.test(registroTravado.erro)], [false, true]);
      const registro = await registrarAnuncioNoBlingML(bfAnuncios, { codigo: "100101", idProduto: 101, itemId: "MLB1", titulo: "PLACA PREMIUM", preco: 999, tipoAnuncio: "gold_pro" });
      const corpoDoRegistro = posts(bfAnuncios, "/anuncios").at(-1)?.corpo;
      conferir("registrarAnuncio: POST /anuncios com o MLB, nome, preco e modalidade", [registro.ok, typeof registro.id, corpoDoRegistro], [true, "number", { produto: { id: 101 }, integracao: { tipo: "MercadoLivre" }, loja: { id: 206326819 }, anuncioLoja: { id: "MLB1" }, nome: "PLACA PREMIUM", preco: { valor: 999 }, mercadoLivre: { modalidade: "gold_pro" } }]);
      conferir("registrarAnuncio: agora sao dois registros do produto", (await bfAnuncios.get("/anuncios", { tipoIntegracao: "MercadoLivre", idLoja: 206326819, idProduto: 101 })).dados.data.map((a) => a.anuncioLoja.id), ["MLB4165084257", "MLB1"]);
      const registroDeNovo = await registrarAnuncioNoBlingML(bfAnuncios, { codigo: "100101", idProduto: 101, itemId: "MLB1", titulo: "PLACA PREMIUM", preco: 999, tipoAnuncio: "gold_pro" });
      conferir("registrarAnuncio: segunda vez nao duplica", [registroDeNovo.ok, registroDeNovo.jaEstava, registroDeNovo.id === registro.id, posts(bfAnuncios, "/anuncios").length], [true, true, true, 1]);
      // O POST real medido ignorou nome e preco quando nao vieram: se a releitura voltar sem eles, o PUT completa.
      const bfSemNome = novoBling({ postDeAnuncioIgnoraCampos: true });
      const completado = await registrarAnuncioNoBlingML(bfSemNome, { codigo: "100102", idProduto: 102, itemId: "MLB2", titulo: "NANO", preco: 39, tipoAnuncio: "gold_special" });
      conferir("registrarAnuncio: completa com PUT quando o POST ignorou nome e preco", [completado.ok, bfSemNome.chamadas.filter((c) => c.metodo === "PUT" && c.caminho === `/anuncios/${completado.id}`).length, (await bfSemNome.get("/anuncios", { tipoIntegracao: "MercadoLivre", idLoja: 206326819, idProduto: 102 })).dados.data[0].titulo], [true, 1, "NANO"]);

      conferir("kit: codigo livre => criar", (await conferirKitNoBling(bf, { codigo: "100101_5", itens: [{ sku: "100101", quantidade: 5 }] })).situacao, "criar");
      conferir("kit: mesmas pecas em outra ordem => igual", await conferirKitNoBling(bf, { codigo: "120809", itens: [{ sku: "100102", quantidade: 2 }, { sku: "100101", quantidade: 1 }] }), { situacao: "igual", id: 809 });
      conferir(
        "kit: quantidade diferente => diferente com o recado",
        await conferirKitNoBling(bf, { codigo: "120809", itens: [{ sku: "100101", quantidade: 1 }, { sku: "100102", quantidade: 3 }] }),
        { situacao: "diferente", id: 809, diferencas: ["100102: 3 no anúncio, 2 no Bling"] },
      );
      conferir(
        "kit: peca a mais no Bling e peca so no anuncio",
        (await conferirKitNoBling(bf, { codigo: "120809", itens: [{ sku: "100101", quantidade: 1 }, { sku: "100103", quantidade: 1 }] })).diferencas,
        ["100102: só no Bling", "100103: só no anúncio"],
      );
      conferir("kit: peca que nao existe no Bling => erro", (await conferirKitNoBling(bf, { codigo: "250001", itens: [{ sku: "999999", quantidade: 2 }] })).situacao, "erro");
      conferir("kit: peca que e kit no Bling => erro", (await conferirKitNoBling(bf, { codigo: "250001", itens: [{ sku: "120809", quantidade: 2 }] })).situacao, "erro");
      const simplesNoBling = await conferirKitNoBling(bf, { codigo: "100103", itens: [{ sku: "100101", quantidade: 2 }] });
      conferir("kit: codigo de produto simples => erro", [simplesNoBling.situacao, /produto simples/.test(simplesNoBling.erro)], ["erro", true]);
      // As duas escritas sao as do vinculo acima (a aceita e a recusada de proposito): o kit so leu.
      conferir("kit: so leitura", bf.chamadas.filter((c) => c.metodo !== "GET" && c.metodo !== "exigirEscrita").length, 2);

      const base = { codigo: "100101_5", titulo: "KIT COM 5 PLACA UNO", preco: 199, envio: { pesoKg: 0.25, alturaCm: 5, larguraCm: 10, comprimentoCm: 12 }, principal: { ncm: "84733049", origem: 0 }, pecasNoBling: [{ id: 11, quantidade: 5 }] };
      const corpo = corpoDoKitDoAnuncio(base);
      conferir(
        "corpoDoKit: formato E, virtual, nome com *codigo, preco e unidade",
        [corpo.codigo, corpo.formato, corpo.estrutura, corpo.nome, corpo.preco, corpo.unidade],
        ["100101_5", "E", { tipoEstoque: "V", componentes: [{ produto: { id: 11 }, quantidade: 5 }] }, "KIT COM 5 PLACA UNO *100101_5", 199, "UN"],
      );
      conferir("corpoDoKit: NCM e peso do anuncio", [corpo.tributacao?.ncm, corpo.pesoBruto, corpo.dimensoes?.profundidade], ["84733049", 0.25, 12]);
      const longo = corpoDoKitDoAnuncio({ ...base, titulo: "A".repeat(200) }).nome;
      conferir("corpoDoKit: nome longo corta o titulo e mantem o sufixo", [longo.endsWith(" *100101_5"), Array.from(longo).length <= 120], [true, true]);

      const kitCriado = await criarKitNoBling(bf, { codigo: "100101_5", titulo: "KIT", preco: 199, envio: {}, principal: {}, itens: [{ sku: "100101", quantidade: 5 }] });
      conferir("criarKit: cria e confere formato E", [kitCriado.ok, (await conferirKitNoBling(bf, { codigo: "100101_5", itens: [{ sku: "100101", quantidade: 5 }] })).situacao], [true, "igual"]);
      const kitTravado = await criarKitNoBling(novoBling({ codigosLiberados: ["outro"] }), { codigo: "100101_5", titulo: "KIT", preco: 199, envio: {}, principal: {}, itens: [{ sku: "100101", quantidade: 5 }] });
      conferir("criarKit: trava recusa", [kitTravado.ok, /Escrita bloqueada/.test(kitTravado.erro)], [false, true]);

      // gerarSku passa a contar os codigos de kit dos anuncios (a conta e a mesma de proximoCodigoDaFaixa).
      conferir("faixa 25xxxx: SKU 250003 e kit 250007 => 250008", proximoCodigoDaFaixa(["250003", "250007", "100101_5"]), "250008");
    }

    {
      console.log("\nFase 3: estado da publicação");
      await limpar();
      const { ETAPAS, ROTULO_DA_ETAPA, proximaEtapa, etapasDoAnuncio } = await import("../src/lib/canaisDeVenda/ml/etapas.js");
      const { lerPublicacao, gravarPublicacao } = await import("../src/lib/canaisDeVenda/ml/banco.js");
      conferir("etapas: ordem", ETAPAS, ["fotos", "validar", "criar", "pausar", "descricao", "fiscal", "kit_bling", "vinculo", "registrar_bling", "ativar", "atacado", "gravar"]);
      conferir("etapas: todas com rotulo", ETAPAS.every((etapa) => typeof ROTULO_DA_ETAPA[etapa] === "string"), true);
      conferir("etapas: simples nao tem kit_bling", etapasDoAnuncio({ kit: false }).includes("kit_bling"), false);
      conferir("etapas: kit tem kit_bling", etapasDoAnuncio({ kit: true }).includes("kit_bling"), true);
      conferir("proximaEtapa: depois de fotos e validar vem criar", proximaEtapa({ feitas: ["fotos", "validar"] }), "criar");
      conferir("proximaEtapa: simples pula kit_bling", proximaEtapa({ feitas: ["fotos", "validar", "criar", "pausar", "descricao", "fiscal"] }, etapasDoAnuncio({ kit: false })), "vinculo");
      conferir("proximaEtapa: sem publicacao comeca nas fotos", proximaEtapa(null), "fotos");
      conferir("proximaEtapa: tudo feito e null", proximaEtapa({ feitas: [...ETAPAS] }), null);

      const pe = await prisma.produto.create({ data: { sku: "ZZ-ML-EST", tituloBase: "ZZ Estado", conferido: true, blingId: "1" } });
      const aberto = await novoRascunhoML(pe.id);
      const rascunhoValido = aberto.rascunho;
      const { id } = await salvarRascunhoML(null, rascunhoValido);
      conferir("publicacao: anuncio novo sem estado", (await lerPublicacao(id)).publicacao, null);
      await gravarPublicacao(id, { feitas: ["fotos"], fotos: { f1: "999-a" } });
      await gravarPublicacao(id, { fotos: { f2: "999-b" } });
      const lido = await lerPublicacao(id);
      conferir("gravarPublicacao: mescla as fotos e mantem feitas", [lido.publicacao.fotos, lido.publicacao.feitas], [{ f1: "999-a", f2: "999-b" }, ["fotos"]]);
      conferir("gravarPublicacao: forma completa", Object.keys(lido.publicacao).sort(), ["atualizadoEm", "blingAnuncioId", "blingKitId", "erro", "etapaComErro", "feitas", "fotos", "incerta", "itemId", "permalink", "statusML"]);
      conferir("salvar: rascunho editado nao apaga a publicacao", [(await salvarRascunhoML(id, { ...rascunhoValido, titulo: "OUTRO" })).ok, (await lerPublicacao(id)).publicacao.feitas], [true, ["fotos"]]);
      await gravarPublicacao(id, {}, { status: "PUBLICANDO" });
      conferir("salvar: recusado durante a publicacao", (await salvarRascunhoML(id, rascunhoValido)).erro, "Publicação em andamento: espere terminar.");
      await gravarPublicacao(id, { itemId: "MLB9" }, { status: "ERRO", erro: "falhou" });
      conferir("salvar: recusado com item ja criado no ML", /já existe no Mercado Livre/.test((await salvarRascunhoML(id, rascunhoValido)).erro), true);
      const colunas = (await lerPublicacao(id)).anuncio;
      conferir("gravarPublicacao: grava as colunas junto", [colunas.status, colunas.erro], ["ERRO", "falhou"]);
      const carregado = await carregarAnuncioML(id);
      conferir("carregarAnuncioML: devolve a publicacao", carregado.publicacao.itemId, "MLB9");
      conferir("gravarPublicacao: anuncio que nao existe lanca", await gravarPublicacao("nao-existe", {}).then(() => "gravou", () => "lancou"), "lancou");
    }

    // Cenario da publicacao (Tarefas 5 e 6): produtos ZZ-ML-* no banco, anuncios salvos pelo caminho
    // de verdade (`salvarRascunhoML`) e um Bling falso com os mesmos codigos. Chamado depois de `limpar()`.
    const { criarBlingFalso } = await import("./lib/blingFalso.js");
    async function cenarioDePublicacao() {
      const criar = (sku, extra = {}) =>
        prisma.produto.create({ data: { sku, tituloBase: `ZZ ${sku}`, descricaoBase: `Descricao de ${sku}`, conferido: true, blingId: "1", pesoKg: 0.05, alturaCm: 2, larguraCm: 6, comprimentoCm: 7, estoque: 10, ncm: "8473.30.49", origem: 0, ...extra } });
      const s1 = await criar("ZZ-ML-S1");
      const semBling = await criar("ZZ-ML-SB", { blingId: null });
      const k1 = await criar("ZZ-ML-K1");
      const k2 = await criar("ZZ-ML-K2");
      const kitDoRise = await criar("ZZ-ML-KP", { tipo: "COMPOSICAO" });
      for (const produto of [s1, semBling, k1, k2, kitDoRise]) {
        await prisma.produtoArquivo.createMany({ data: ["a.jpg", "b.jpg"].map((arquivo, ordem) => ({ produtoId: produto.id, tipo: "IMAGEM", papel: "FOTO", arquivo: `${produto.sku}-${arquivo}`, ordem, principal: ordem === 0 })) });
      }
      const ajustes = { titulo: "PLACA ZZ ML", categoriaId: "MLB99779", preco: 49.9, estoque: 5, atributos: { BRAND: "ZZ", MODEL: "M1", EMPTY_GTIN_REASON: "O produto não tem código cadastrado", ...{ MICROCONTROLLER: "-1", INCLUDES_USB_CABLE: "-1", OPERATING_VOLTAGE: "-1" } } };
      async function anuncioSimples(produto, extra = {}) {
        const { rascunho } = await novoRascunhoML(produto.id);
        const salvo = await salvarRascunhoML(null, { ...rascunho, ...ajustes, ...extra });
        if (!salvo.ok) throw new Error(`cenario: ${salvo.erro}`);
        return salvo.id;
      }
      async function anuncioDeKit(codigo, quantidadeDoSegundo) {
        const { rascunho, contexto } = await novoRascunhoML(k1.id);
        const produtos = { ...contexto.produtos, ...(await contextoDosProdutos([k2.id])) };
        const comKit = aplicarComposicao(rascunho, { itens: [{ produtoId: k1.id, quantidade: 1 }, { produtoId: k2.id, quantidade: quantidadeDoSegundo }], codigo, blingProdutoId: null }, produtos);
        const salvo = await salvarRascunhoML(null, { ...comKit, ...ajustes, estoque: 3, atributos: { BRAND: "ZZ", MODEL: "M1", EMPTY_GTIN_REASON: "O produto é um kit ou pack", ...{ MICROCONTROLLER: "-1", INCLUDES_USB_CABLE: "-1", OPERATING_VOLTAGE: "-1" } } });
        if (!salvo.ok) throw new Error(`cenario: ${salvo.erro}`);
        return salvo.id;
      }
      const produtosDoBling = [
        { id: 501, codigo: "ZZ-ML-S1", nome: "ZZ S1", formato: "S", preco: 49 },
        { id: 502, codigo: "ZZ-ML-K1", nome: "ZZ K1", formato: "S", preco: 10, tributacao: { ncm: "84733049" } },
        { id: 503, codigo: "ZZ-ML-K2", nome: "ZZ K2", formato: "S", preco: 12 },
        { id: 504, codigo: "ZZ-ML-KP", nome: "ZZ KP", formato: "S", preco: 30 },
        { id: 505, codigo: "ZZ-ML-SB", nome: "ZZ SB", formato: "S", preco: 30 },
        { id: 509, codigo: "ZZ-ML-KITX", nome: "KIT *ZZ-ML-KITX", formato: "E", estrutura: { tipoEstoque: "V", lancamentoEstoque: "", componentes: [{ produto: { id: 502 }, quantidade: 1 }, { produto: { id: 503 }, quantidade: 2 }] } },
        { id: 510, codigo: "ZZ-ML-KITY", nome: "KIT *ZZ-ML-KITY", formato: "E", estrutura: { tipoEstoque: "V", lancamentoEstoque: "", componentes: [{ produto: { id: 502 }, quantidade: 1 }, { produto: { id: 503 }, quantidade: 2 }] } },
      ];
      const novoBling = (extra = {}) => criarBlingFalso({ produtos: produtosDoBling, ...extra });
      return { s1, semBling, k1, k2, kitDoRise, anuncioSimples, anuncioDeKit, novoBling };
    }

    {
      console.log("\nFase 3: pré-checagem");
      await limpar();
      const { prepararPublicacaoML } = await import("../src/lib/canaisDeVenda/ml/publicar.js");
      const c = await cenarioDePublicacao();
      const ml = criarMLFalso();
      const bf = c.novoBling();
      const idSimples = await c.anuncioSimples(c.s1);
      const pronto = await prepararPublicacaoML(idSimples, { ml, bling: bf });
      conferir("preparar: anuncio simples pronto", [pronto.ok, pronto.motivos, pronto.resumo?.familyName, pronto.resumo?.preco, pronto.resumo?.estoque, pronto.resumo?.fotos, pronto.resumo?.codigo, pronto.resumo?.kit], [true, [], "PLACA ZZ ML", 49.9, 10, 2, "ZZ-ML-S1", null]);
      conferir("preparar: proxima etapa e incerta", [pronto.proxima, pronto.incerta], ["fotos", false]);
      conferir("preparar: so leitura", [ml.escritas.length, bf.chamadas.filter((chamada) => chamada.metodo !== "GET").length], [0, 0]);
      conferir("preparar: sem blingId recusa", (await prepararPublicacaoML(await c.anuncioSimples(c.semBling), { ml, bling: bf })).motivos.some((m) => /blingId/.test(m)), true);
      conferir("preparar: categoria nao folha recusa", (await prepararPublicacaoML(await c.anuncioSimples(c.s1, { categoriaId: "MLB1648" }), { ml, bling: bf })).motivos.some((m) => /não é final/.test(m)), true);
      const foraDoBling = await prepararPublicacaoML(idSimples, { ml, bling: criarBlingFalso({ produtos: [] }) });
      conferir("preparar: produto fora do Bling recusa", [foraDoBling.ok, foraDoBling.motivos.some((m) => /Bling/.test(m))], [false, true]);
      const kitLivre = await prepararPublicacaoML(await c.anuncioDeKit("ZZ-ML-KITN", 2), { ml, bling: bf });
      conferir("preparar: kit livre => criar", [kitLivre.ok, kitLivre.resumo?.kit], [true, { codigo: "ZZ-ML-KITN", situacao: "criar", itens: [{ sku: "ZZ-ML-K1", quantidade: 1 }, { sku: "ZZ-ML-K2", quantidade: 2 }] }]);
      conferir("preparar: kit igual no Bling", (await prepararPublicacaoML(await c.anuncioDeKit("ZZ-ML-KITX", 2), { ml, bling: bf })).resumo?.kit?.situacao, "igual");
      const kitDiferente = await prepararPublicacaoML(await c.anuncioDeKit("ZZ-ML-KITY", 3), { ml, bling: bf });
      conferir("preparar: kit com outras pecas recusa com o recado", [kitDiferente.ok, kitDiferente.motivos.some((m) => /ZZ-ML-K2: 3 no anúncio, 2 no Bling/.test(m))], [false, true]);
      const kitDoRise = await prepararPublicacaoML(await c.anuncioSimples(c.kitDoRise), { ml, bling: bf });
      conferir("preparar: produto kit do Rise que e simples no Bling recusa", [kitDoRise.ok, kitDoRise.motivos.some((m) => /produto simples no Bling/.test(m))], [false, true]);
      const bfLigado = c.novoBling({ vinculosDeLoja: [{ codigo: "MLB900", preco: 10, produto: { id: 501 }, loja: { id: 206326819 } }] });
      const ligado = await prepararPublicacaoML(idSimples, { ml, bling: bfLigado });
      conferir("preparar: produto ja vinculado a outro anuncio na loja do ML segue, informando", [ligado.ok, ligado.resumo?.outrosVinculos], [true, ["MLB900"]]);
      conferir("preparar: anuncio que nao existe", (await prepararPublicacaoML("nao-existe", { ml, bling: bf })).motivos, ["Anúncio não encontrado."]);
      conferir("preparar: continua so leitura", [ml.escritas.length, bf.chamadas.filter((chamada) => chamada.metodo !== "GET").length], [0, 0]);
    }

    {
      console.log("\nAnuncio publicado acompanha o produto (Publicar)");
      await limpar();
      const { publicarAnuncioML } = await import("../src/lib/canaisDeVenda/ml/publicar.js");
      const { mudancasDosAnunciosML } = await import("../src/lib/canaisDeVenda/ml/banco.js");
      const { CATEGORIAS_PADRAO } = await import("./lib/mlFalso.js");
      const c = await cenarioDePublicacao();
      const lerFoto = async () => Buffer.from("jpg");
      await prisma.produtoArquivo.create({ data: { produtoId: c.s1.id, tipo: "IMAGEM", papel: "FOTO", arquivo: "ZZ-ML-S1-c.jpg", ordem: 2 } });
      const fotosDoS1 = await prisma.produtoArquivo.findMany({ where: { produtoId: c.s1.id, tipo: "IMAGEM" }, orderBy: { ordem: "asc" } });
      const mudancasDe = async (id) => {
        const anuncio = await prisma.anuncio.findUnique({ where: { id }, select: { id: true, canal: true, status: true, situacaoCanal: true, produtoId: true, dados: true } });
        return (await mudancasDosAnunciosML([anuncio])).get(id);
      };

      // O dono tinha marcado so uma foto: o anuncio simples passa a ter todas as validadas, na ordem.
      const id = await c.anuncioSimples(c.s1, { imagens: [fotosDoS1[2].id] });
      conferir("salvar: o anuncio simples guarda as fotos do produto, nao as da tela", (await carregarAnuncioML(id)).rascunho.imagens, fotosDoS1.map((foto) => foto.id));
      const ml = criarMLFalso();
      const r = await publicarAnuncioML(id, { ml, bling: c.novoBling(), lerFoto });
      const criacao = ml.escritas.find((escrita) => escrita.metodo === "POST" && escrita.caminho === "/items").corpo;
      const gravado = (await prisma.anuncio.findUnique({ where: { id }, select: { dados: true } })).dados.publicacao.enviado;
      conferir("publicar: manda as 3 fotos do produto", [r.ok, criacao.pictures.length], [true, 3]);
      conferir("publicar: grava a impressao com as fotos na ordem", gravado.fotos, ["ZZ-ML-S1-a.jpg", "ZZ-ML-S1-b.jpg", "ZZ-ML-S1-c.jpg"]);
      conferir("publicar: logo depois, nada mudou", await mudancasDe(id), { partes: [], naoConferido: false });
      conferir("carregar: o publicado traz as mudancas", (await carregarAnuncioML(id)).mudancas, { partes: [], naoConferido: false });

      // Categoria que aceita 2 fotos: vao as 2 primeiras, e o "!" nao acende por isso.
      const id2 = await c.anuncioSimples(c.s1);
      const mlDuas = criarMLFalso({ categorias: { MLB99779: { ...CATEGORIAS_PADRAO.MLB99779, maxFotos: 2 } } });
      const r2 = await publicarAnuncioML(id2, { ml: mlDuas, bling: c.novoBling(), lerFoto });
      const criacao2 = mlDuas.escritas.find((escrita) => escrita.metodo === "POST" && escrita.caminho === "/items").corpo;
      conferir("publicar: categoria de 2 fotos leva 2", [r2.ok, criacao2.pictures.length], [true, 2]);
      conferir("publicar: o corte da categoria nao acende o '!'", await mudancasDe(id2), { partes: [], naoConferido: false });
    }

    {
      console.log("\nDados fiscais do ML (05/11/2026)");
      const { CSOSN_DA_LOJA, corpoFiscalSimples, partilhaDoKit, planoFiscal, problemasFiscais, tipoDeOrigemML, fiscalIgual } = await import("../src/lib/canaisDeVenda/ml/dadosFiscais.js");
      // Regras puras.
      conferir("fiscal: origem 0 e revenda", tipoDeOrigemML({ origem: 0, tipoProducao: "REVENDA" }), "reseller");
      conferir("fiscal: origem 1 e 6 sao importacao direta", [tipoDeOrigemML({ origem: 1 }), tipoDeOrigemML({ origem: 6 })], ["imported", "imported"]);
      conferir("fiscal: origem 2 (estrangeira comprada no Brasil) e revenda", tipoDeOrigemML({ origem: 2 }), "reseller");
      conferir("fiscal: fabricacao propria", tipoDeOrigemML({ origem: 0, tipoProducao: "FABRICACAO_PROPRIA" }), "manufacturer");
      conferir("fiscal: sem NCM e sem origem", problemasFiscais({ sku: "X1", ncm: "8473", origem: null }).length, 2);
      conferir("fiscal: CEST com digitos errados", problemasFiscais({ sku: "X1", ncm: "84733049", origem: 0, cest: "01064" }).some((p) => /CEST/.test(p)), true);
      conferir("fiscal: produto completo", problemasFiscais({ sku: "X1", ncm: "8473.30.49", origem: 2, cest: "01.064.00" }), []);
      const corpo = corpoFiscalSimples({ sku: "X1", tituloBase: "Placa ESP32", ncm: "8473.30.49", cest: "0106400", origem: 2, tipoProducao: "REVENDA", ean: "7891234567895", pesoKg: 0.012, custo: 18.5 });
      conferir("fiscal: corpo do single no formato medido", corpo, {
        sku: "X1", title: "Placa ESP32", type: "single", measurement_unit: "UN", cost: 18.5, register_type: "final",
        tax_information: { ncm: "84733049", origin_type: "reseller", origin_detail: "2", csosn: CSOSN_DA_LOJA, cest: "0106400", ean: "7891234567895", net_weight: 0.012, gross_weight: 0.012 },
      });
      conferir("fiscal: CSOSN 102 (Simples Nacional)", CSOSN_DA_LOJA, "102");
      conferir("fiscal: EAN interno do Rise nao vai para a nota", "ean" in corpoFiscalSimples({ sku: "X1", tituloBase: "a", ncm: "84733049", origem: 0, ean: "2000001001018" }).tax_information, false);
      conferir("fiscal: partilha pelo custo soma 100", partilhaDoKit([{ produto: { custo: 10 }, quantidade: 1 }, { produto: { custo: 5 }, quantidade: 2 }, { produto: { custo: 1 }, quantidade: 1 }]), [48, 48, 4]);
      conferir("fiscal: partilha sem custo vai pelo preco", partilhaDoKit([{ produto: { precoVenda: 30 }, quantidade: 1 }, { produto: { custo: 1, precoVenda: 10 }, quantidade: 1 }]), [75, 25]);
      conferir("fiscal: kit de N do mesmo produto = 100%", partilhaDoKit([{ produto: { custo: 2 }, quantidade: 10 }]), [100]);
      conferir("fiscal: partilha de tres iguais soma 100", partilhaDoKit([1, 2, 3].map(() => ({ produto: {}, quantidade: 1 }))).reduce((a, b) => a + b, 0), 100);
      const pecaA = { sku: "PA", tituloBase: "Peça A", ncm: "85340000", origem: 0, custo: 10 };
      const pecaB = { sku: "PB", tituloBase: "Peça B", ncm: "85340000", origem: 2, custo: 10 };
      const planoKit = planoFiscal({ sku: "KIT1", titulo: "Kit", pecas: [{ produto: pecaA, quantidade: 1 }, { produto: pecaB, quantidade: 1 }] });
      // Kit = UM item na nota (pedido do dono em 06/11/2026: a nota do bundle listava as pecas a preco unitario).
      conferir("fiscal: kit vai como um item so, com o titulo do anuncio", [planoKit.ok, planoKit.corpos.map((c) => [c.sku, c.type, c.title])], [true, [["KIT1", "single", "Kit"]]]);
      conferir("fiscal: kit sem bundle e sem as pecas", "bundle" in planoKit.corpos[0], false);
      const kitDeDez = planoFiscal({ sku: "PB_10", titulo: "10x Peça B", pecas: [{ produto: { ...pecaB, pesoKg: 0.002, cest: "0106400" }, quantidade: 10 }] }).corpos[0];
      conferir("fiscal: kit de 10 soma custo e peso, NCM e origem da peca", [kitDeDez.cost, kitDeDez.tax_information], [100, { ncm: "85340000", origin_type: "reseller", origin_detail: "2", csosn: "102", cest: "0106400", net_weight: 0.02, gross_weight: 0.02 }]);
      // O titulo do kit no Rise e o nome do produto base (o ML poe o "10x" no anuncio); a nota precisa dele.
      const tituloDoKit = (titulo, quantidade) => planoFiscal({ sku: "PB_N", titulo, pecas: [{ produto: pecaB, quantidade }] }).corpos[0].title;
      conferir("fiscal: kit de N da mesma peca ganha o NX no titulo", [tituloDoKit("PEÇA B", 10), tituloDoKit("10x Peça B", 10), tituloDoKit("PEÇA B", 1)], ["10X PEÇA B", "10x Peça B", "PEÇA B"]);
      conferir("fiscal: plano de kit marcado", planoFiscal({ sku: "PB_N", titulo: "B", pecas: [{ produto: pecaB, quantidade: 2 }] }).kit, true);
      const kitNoML = { ...kitDeDez, title: "PEÇA B" };
      conferir("fiscal: kit compara o titulo; produto simples nao", [fiscalIgual(kitNoML, kitDeDez, { comTitulo: true }), fiscalIgual(kitNoML, kitDeDez)], [false, true]);
      const pecaCara = { sku: "PC", ncm: "84733049", origem: 1, custo: 50 };
      conferir("fiscal: kit misto usa a peca de maior valor", planoFiscal({ sku: "KIT2", titulo: "Kit", pecas: [{ produto: pecaA, quantidade: 2 }, { produto: pecaCara, quantidade: 1 }] }).corpos[0].tax_information.ncm, "84733049");
      conferir("fiscal: peca principal sem NCM barra o kit", planoFiscal({ sku: "KIT1", pecas: [{ produto: { ...pecaA, ncm: null }, quantidade: 1 }] }).ok, false);
      conferir("fiscal: peca secundaria sem NCM nao barra", planoFiscal({ sku: "KIT2", pecas: [{ produto: { ...pecaA, ncm: null }, quantidade: 1 }, { produto: pecaCara, quantidade: 1 }] }).ok, true);
      conferir("fiscal: sem SKU recusa", planoFiscal({ sku: "", produto: pecaA }).ok, false);
      conferir("fiscal: igual ignora titulo e unidade", fiscalIgual({ ...corpo, title: "outro", measurement_unit: "UNID" }, corpo), true);
      conferir("fiscal: NCM diferente nao e igual", fiscalIgual({ ...corpo, tax_information: { ...corpo.tax_information, ncm: "85340000" } }, corpo), false);
      const { mesclarComML } = await import("../src/lib/canaisDeVenda/ml/dadosFiscais.js");
      const semCest = corpoFiscalSimples({ sku: "X2", tituloBase: "a", ncm: "84733049", origem: 0 });
      conferir("fiscal: CEST e EAN vazios no Rise nao apagam os do ML", mesclarComML({ tax_information: { cest: "0106400", ean: "7891234567895", origin_type: "manufacturer" } }, semCest).tax_information, { ncm: "84733049", origin_type: "reseller", origin_detail: "0", csosn: "102", cest: "0106400", ean: "7891234567895" });
      conferir("fiscal: CEST do Rise vence o do ML", mesclarComML({ tax_information: { cest: "0106400" } }, corpo).tax_information.cest, "0106400");

      // Contra o ML falso e o banco: o Publicar, o anuncio antigo sem dados (o ESP32) e o kit.
      await limpar();
      const { publicarAnuncioML, prepararPublicacaoML } = await import("../src/lib/canaisDeVenda/ml/publicar.js");
      const { garantirFiscalNoML, planoFiscalDoProduto, planoFiscalDoSku, enviarDadosFiscaisDoAnuncio, situacaoFiscalDoAnuncio } = await import("../src/lib/canaisDeVenda/ml/fiscalNoML.js");
      const c = await cenarioDePublicacao();
      const lerFoto = async () => Buffer.from("jpg");

      const semNcm = await c.anuncioSimples(c.s1);
      await prisma.produto.update({ where: { id: c.s1.id }, data: { ncm: null } });
      const recusa = await prepararPublicacaoML(semNcm, { ml: criarMLFalso(), bling: c.novoBling() });
      conferir("publicar: produto sem NCM nao comeca", [recusa.ok, recusa.motivos.some((m) => /ZZ-ML-S1 está sem NCM/.test(m))], [false, true]);
      await prisma.produto.update({ where: { id: c.s1.id }, data: { ncm: "8473.30.49", cest: "0106400" } });

      const ml = criarMLFalso();
      const id = await c.anuncioSimples(c.s1);
      const r = await publicarAnuncioML(id, { ml, bling: c.novoBling(), lerFoto });
      const itemId = r.itemId;
      conferir("publicar: nasce com os dados fiscais e o vinculo", [r.ok, ml.fiscais.get("ZZ-ML-S1")?.tax_information, ml.ligacoes.get(itemId)], [true, { ncm: "84733049", origin_type: "reseller", origin_detail: "0", csosn: "102", cest: "0106400", net_weight: 0.05, gross_weight: 0.05 }, "ZZ-ML-S1"]);
      const posFiscal = ml.escritas.findIndex((e) => e.metodo === "POST" && e.caminho === "/items/fiscal_information");
      const posAtivar = ml.escritas.findIndex((e) => e.metodo === "PUT" && e.caminho === `/items/${itemId}` && e.corpo?.status === "active");
      conferir("publicar: fiscal antes de ativar", posFiscal >= 0 && posAtivar > posFiscal, true);
      const anuncio = await prisma.anuncio.findUnique({ where: { id }, select: { dados: true } });
      conferir("publicar: etapa fiscal marcada", anuncio.dados.publicacao.feitas.includes("fiscal"), true);

      // Segundo envio do mesmo anuncio: nada a escrever.
      const antes = ml.escritas.length;
      const denovo = await enviarDadosFiscaisDoAnuncio(id, { ml });
      conferir("reenviar: igual nao escreve", [denovo.ok, denovo.feitos, denovo.podeFaturar, ml.escritas.length - antes], [true, [], true, 0]);
      conferir("situacao: lida no ML", await situacaoFiscalDoAnuncio(id, { ml }), { ok: true, ligado: true, sku: "ZZ-ML-S1", podeFaturar: true, problemas: [], skuDoRise: "ZZ-ML-S1" });

      // Anuncio antigo: SKU com dados velhos no ML e sem vinculo -> corrige e vincula.
      const mlVelho = criarMLFalso({ meusItens: { "ZZ-ML-S1": [{ id: "MLB777", status: "active" }] }, fiscais: { "ZZ-ML-S1": { sku: "ZZ-ML-S1", type: "single", tax_information: { ncm: "85340000", origin_type: "manufacturer", origin_detail: "0", csosn: "102" } } } });
      mlVelho.exigirEscrita("ZZ-ML-S1");
      const velho = await garantirFiscalNoML(mlVelho, await planoFiscalDoProduto({ id: c.s1.id }), { itemId: "MLB777" });
      conferir("antigo: corrige o SKU e vincula", [velho.ok, velho.feitos, mlVelho.fiscais.get("ZZ-ML-S1").tax_information.ncm, mlVelho.escritas.map((e) => `${e.metodo} ${e.caminho}`)], [true, ["Dados fiscais do SKU ZZ-ML-S1 corrigidos.", "SKU ZZ-ML-S1 vinculado ao anúncio MLB777."], "84733049", ["PUT /items/fiscal_information/ZZ-ML-S1", "POST /items/fiscal_information/items"]]);
      conferir("antigo: o PUT nao leva o SKU no corpo", "sku" in mlVelho.escritas[0].corpo, false);

      // Kit do cadastro (ZZ-ML-KP = 2x K1 + 1x K2): as pecas primeiro, depois o bundle.
      await prisma.produtoComponente.createMany({ data: [{ kitId: c.kitDoRise.id, componenteId: c.k1.id, quantidade: 2, ordem: 0 }, { kitId: c.kitDoRise.id, componenteId: c.k2.id, quantidade: 1, ordem: 1 }] });
      await prisma.produto.updateMany({ where: { id: { in: [c.k1.id, c.k2.id] } }, data: { custo: 5 } });
      const mlKit = criarMLFalso({ meusItens: { "ZZ-ML-KP": [{ id: "MLB888", status: "active" }] } });
      mlKit.exigirEscrita("ZZ-ML-KP");
      const kit = await garantirFiscalNoML(mlKit, await planoFiscalDoSku("ZZ-ML-KP"), { itemId: "MLB888" });
      conferir("kit: um SKU so (sem as pecas) e o vinculo", [kit.ok, mlKit.escritas.map((e) => `${e.metodo} ${e.caminho}`), mlKit.fiscais.get("ZZ-ML-KP")?.type, mlKit.fiscais.has("ZZ-ML-K1")], [true, ["POST /items/fiscal_information", "POST /items/fiscal_information/items"], "single", false]);
      // O kit gravado como bundle (05/11/2026) volta a um item so com o PUT.
      const mlBundle = criarMLFalso({ meusItens: { "ZZ-ML-KP": [{ id: "MLB889", status: "active" }] }, fiscais: { "ZZ-ML-KP": { sku: "ZZ-ML-KP", type: "bundle", bundle: [{ sku: "ZZ-ML-K1", quantity: 2, percentage_share: 100 }] } } });
      mlBundle.exigirEscrita("ZZ-ML-KP");
      const trocado = await garantirFiscalNoML(mlBundle, await planoFiscalDoSku("ZZ-ML-KP"), { itemId: "MLB889" });
      conferir("kit: bundle antigo vira um item", [trocado.ok, trocado.feitos[0], mlBundle.fiscais.get("ZZ-ML-KP")?.type], [true, "Dados fiscais do SKU ZZ-ML-KP corrigidos.", "single"]);
      conferir("kit: o ML confirma que pode faturar", kit.podeFaturar, true);

      // Kit do ML (anuncio de composicao com codigo proprio): o plano vem do anuncio gravado.
      const idKitML = await c.anuncioDeKit("ZZ-ML-KITN", 2);
      conferir("kit do ML: plano pelo codigo do kit", (await planoFiscalDoSku("ZZ-ML-KITN")).corpos.map((corpoDoKit) => [corpoDoKit.sku, corpoDoKit.type]), [["ZZ-ML-KITN", "single"]]);
      conferir("kit do ML: rascunho nao publicado nao envia", (await enviarDadosFiscaisDoAnuncio(idKitML, { ml: mlKit })).ok, false);
      conferir("sku desconhecido", (await planoFiscalDoSku("NAO-EXISTE-ZZ")).ok, false);

      // Recusa do ML chega como texto, sem lancar.
      const mlRecusa = criarMLFalso({ falhas: [{ metodo: "POST", caminho: "/items/fiscal_information", exato: true, status: 400, dados: { message: "bad", error: "bad_request", status: 400, cause: [{ type: "error", code: "x", message: "ncm invalido" }] } }] });
      mlRecusa.exigirEscrita("ZZ-ML-S1");
      const recusado = await garantirFiscalNoML(mlRecusa, await planoFiscalDoProduto({ id: c.s1.id }), { itemId: "MLB1" });
      conferir("recusa: volta o erro do ML", [recusado.ok, /recusou os dados fiscais do SKU ZZ-ML-S1/.test(recusado.erro ?? "")], [false, true]);

      // Outros anuncios do mesmo SKU depois do Publicar (pedido do dono em 05/11/2026): o popup lista os antigos e iguala o
      // preco dos escolhidos ao do anuncio do Rise.
      const { outrosAnunciosDoAnuncio, igualarPrecoDosOutros } = await import("../src/lib/canaisDeVenda/ml/outrosAnuncios.js");
      const mlOutros = criarMLFalso({
        meusItens: {
          "ZZ-ML-S1": [
            { id: itemId, status: "active", price: 50, title: "O do Rise" },
            { id: "MLB901", status: "active", price: 40, title: "Antigo premium", listing_type_id: "gold_pro", sold_quantity: 3, catalog_listing: true },
            { id: "MLB902", status: "closed", price: 10, title: "Encerrado" },
            { id: "MLB903", status: "paused", price: 50, title: "Ja igual" },
            { id: "MLB904", status: "active", price: 30, title: "Com variacoes", variations: [{ id: 11, price: 30 }, { id: 12, price: 30 }] },
          ],
        },
      });
      const outros = await outrosAnunciosDoAnuncio(id, { ml: mlOutros });
      conferir(
        "outros: tira o proprio e o encerrado, diferentes primeiro",
        [outros.ok, outros.sku, outros.preco, outros.outros.map((o) => [o.id, o.preco, o.igual, o.premium, o.catalogo, o.vendidos])],
        [true, "ZZ-ML-S1", 50, [["MLB901", 40, false, true, true, 3], ["MLB904", 30, false, false, false, 0], ["MLB903", 50, true, false, false, 0]]],
      );
      conferir("outros: ler nao escreve", mlOutros.escritas.length, 0);
      const igualado = await igualarPrecoDosOutros(id, ["MLB901", "MLB904", "MLB903", "MLB902", "MLB999"], { ml: mlOutros });
      conferir(
        "igualar: so os escolhidos de preco diferente; estranho e encerrado recusados",
        [igualado.ok, igualado.feitos, igualado.falhas.map((f) => f.id), mlOutros.escritas.map((e) => [e.caminho, e.corpo])],
        [false, [{ id: "MLB901", de: 40 }, { id: "MLB904", de: 30 }], ["MLB902", "MLB999"], [["/items/MLB901", { price: 50 }], ["/items/MLB904", { variations: [{ id: 11, price: 50 }, { id: 12, price: 50 }] }]]],
      );
      conferir("igualar: relido, todos iguais", (await outrosAnunciosDoAnuncio(id, { ml: mlOutros })).outros.every((o) => o.igual), true);
      const semOutros = await outrosAnunciosDoAnuncio(id, { ml: criarMLFalso({ meusItens: { "ZZ-ML-S1": [{ id: itemId, status: "active", price: 50 }] } }) });
      conferir("outros: sem outro anuncio, lista vazia", [semOutros.ok, semOutros.outros], [true, []]);

      await prisma.produtoComponente.deleteMany({ where: { kitId: c.kitDoRise.id } });
    }

    {
      console.log("\nExcluir anuncio do ML (Opcao 1 do dono, 28/10/2026)");
      await limpar();
      const { publicarAnuncioML } = await import("../src/lib/canaisDeVenda/ml/publicar.js");
      const { conferirExclusaoML, excluirAnuncioML } = await import("../src/lib/canaisDeVenda/ml/excluir.js");
      const { seloDoAnuncioML } = await import("../src/lib/canaisDeVenda/ml/rotulos.js");
      const c = await cenarioDePublicacao();
      const lerFoto = async () => Buffer.from("jpg");
      const corposDesde = (ml, inicio) => ml.escritas.slice(inicio).map((escrita) => JSON.stringify(escrita.corpo));

      // Rascunho (sem MLB): so o Rise, sem tocar no ML nem no Bling.
      const rascunho = await c.anuncioSimples(c.s1);
      const mlR = criarMLFalso();
      const bfR = c.novoBling();
      conferir("excluir: rascunho so sai do Rise", [(await conferirExclusaoML(rascunho, { ml: mlR })).destino, (await excluirAnuncioML(rascunho, { ml: mlR, bling: bfR })).ok, await prisma.anuncio.count({ where: { id: rascunho } }), mlR.escritas.length, bfR.chamadas.length], ["rascunho", true, 0, 0, 0]);

      // Dois anuncios publicados do mesmo produto (Classico e Premium): o vinculo do Bling e um so e aponta para o primeiro.
      const ml = criarMLFalso();
      const bf = c.novoBling();
      const semVenda = await c.anuncioSimples(c.s1);
      const comVenda = await c.anuncioSimples(c.s1);
      const pub1 = await publicarAnuncioML(semVenda, { ml, bling: bf, lerFoto });
      const pub2 = await publicarAnuncioML(comVenda, { ml, bling: bf, lerFoto });
      const registrosNoBling = async () => (await bf.get("/anuncios", { tipoIntegracao: "MercadoLivre", idLoja: 206326819 })).dados.data.map((registro) => registro.anuncioLoja.id).sort();
      const vinculosNoBling = async () => (await bf.get("/produtos/lojas", {})).dados.data.map((vinculo) => vinculo.codigo);
      conferir("excluir: cenario com os dois anuncios no Bling", [await registrosNoBling(), await vinculosNoBling()], [[pub1.itemId, pub2.itemId].sort(), [pub1.itemId]]);

      // Travas: com o ML travado nada e escrito em lugar nenhum.
      const travado = criarMLFalso({ codigosLiberados: ["outro"] });
      const recusa = await excluirAnuncioML(semVenda, { ml: travado, bling: bf });
      conferir("excluir: trava do ML recusa antes de escrever", [recusa.ok, travado.escritas.length, await prisma.anuncio.count({ where: { id: semVenda } }), await registrosNoBling()], [false, 0, 1, [pub1.itemId, pub2.itemId].sort()]);

      // Sem venda: encerra e apaga no ML, tira o registro do Bling (o vinculo fica: serve ao outro anuncio) e sai do Rise.
      conferir("excluir: sem venda o destino e apagar", (await conferirExclusaoML(semVenda, { ml })).destino, "apagar");
      const inicio = ml.escritas.length;
      const r = await excluirAnuncioML(semVenda, { ml, bling: bf });
      conferir("excluir: sem venda encerra e apaga no ML, nessa ordem", corposDesde(ml, inicio), ['{"status":"closed"}', '{"deleted":"true"}']);
      conferir("excluir: sem venda sai do registro do Bling e mantem o vinculo do outro anuncio", [await registrosNoBling(), await vinculosNoBling()], [[pub2.itemId], [pub1.itemId]]);
      conferir("excluir: sem venda sai do Rise", [r.ok, r.destino, await prisma.anuncio.count({ where: { id: semVenda } })], [true, "apagar", 0]);
      conferir("excluir: o que foi feito vem na resposta", r.feito.some((linha) => linha.includes("vínculo") && linha.includes("mantido")), true);

      // Com venda: so encerra no ML, sai do Bling e fica no Rise como Encerrado. Repetir nao escreve de novo.
      ml.itens.get(pub2.itemId).sold_quantity = 3;
      const conferido = await conferirExclusaoML(comVenda, { ml });
      conferir("excluir: com venda o destino e encerrar", [conferido.destino, conferido.vendas], ["encerrar", 3]);
      const inicio2 = ml.escritas.length;
      const r2 = await excluirAnuncioML(comVenda, { ml, bling: bf });
      const guardado = await prisma.anuncio.findUnique({ where: { id: comVenda }, select: { status: true, situacaoCanal: true, temVendas: true } });
      conferir("excluir: com venda so encerra no ML", corposDesde(ml, inicio2), ['{"status":"closed"}']);
      conferir("excluir: com venda sai do Bling, e sem anuncio nenhum o vinculo sai tambem", [await registrosNoBling(), await vinculosNoBling()], [[], []]);
      conferir("excluir: com venda fica no Rise como Encerrado", [r2.ok, r2.destino, guardado], [true, "encerrar", { status: "PUBLICADO", situacaoCanal: "ENCERRADA", temVendas: true }]);
      conferir("excluir: o selo do encerrado", seloDoAnuncioML(guardado).rotulo, "Encerrado");
      const repetido = await excluirAnuncioML(comVenda, { ml, bling: bf });
      conferir("excluir: repetir o encerrado nao escreve de novo", [repetido.ok, (await conferirExclusaoML(comVenda, { ml })).jaEncerrado, ml.escritas.length - inicio2], [true, true, 1]);
    }

    {
      console.log("\nKit acompanha as fotos do produto base e das pecas (28/10/2026)");
      await limpar();
      const { publicarAnuncioML } = await import("../src/lib/canaisDeVenda/ml/publicar.js");
      const { mudancasDosAnunciosML } = await import("../src/lib/canaisDeVenda/ml/banco.js");
      const c = await cenarioDePublicacao();
      const lerFoto = async () => Buffer.from("jpg");
      const esperar = () => new Promise((resolver) => setTimeout(resolver, 20));
      const idKit = await c.anuncioDeKit("ZZ-ML-KITX", 2);
      const fotosDe = async () => (await carregarAnuncioML(idKit)).rascunho.imagens;
      const antes = await fotosDe();
      conferir("kit: nasce com as fotos das pecas", antes.length, 4);

      await esperar();
      const nova = await prisma.produtoArquivo.create({ data: { produtoId: c.k1.id, tipo: "IMAGEM", papel: "FOTO", arquivo: "ZZ-ML-K1-c.jpg", ordem: 2 } });
      conferir("kit: foto nova do produto base entra no fim", await fotosDe(), [...antes, nova.id]);

      const lido = await carregarAnuncioML(idKit);
      conferir("kit: salvar sem a foto nova", (await salvarRascunhoML(idKit, { ...lido.rascunho, imagens: antes })).ok, true);
      conferir("kit: a foto desmarcada e salva continua fora", await fotosDe(), antes);

      await prisma.produtoArquivo.delete({ where: { id: antes[1] } });
      const semApagada = antes.filter((id) => id !== antes[1]);
      conferir("kit: foto apagada do produto sai do kit", await fotosDe(), semApagada);

      const r = await publicarAnuncioML(idKit, { ml: criarMLFalso(), bling: c.novoBling(), lerFoto });
      conferir("kit: publica", r.ok, true);
      const mudancasDoKit = async () => {
        const anuncio = await prisma.anuncio.findUnique({ where: { id: idKit }, select: { id: true, canal: true, status: true, situacaoCanal: true, produtoId: true, dados: true } });
        return (await mudancasDosAnunciosML([anuncio])).get(idKit).partes;
      };
      conferir("kit publicado: logo depois, sem '!'", await mudancasDoKit(), []);
      await esperar();
      const daPeca = await prisma.produtoArquivo.create({ data: { produtoId: c.k2.id, tipo: "IMAGEM", papel: "FOTO", arquivo: "ZZ-ML-K2-d.jpg", ordem: 3 } });
      conferir("kit publicado: foto nova de uma peca acende o '!' das fotos", await mudancasDoKit(), ["fotos"]);
      conferir("kit publicado: e aparece na aba Imagens", (await fotosDe()).at(-1), daPeca.id);
      await prisma.produtoArquivo.delete({ where: { id: daPeca.id } });
      await prisma.produtoArquivo.delete({ where: { id: semApagada[0] } });
      conferir("kit publicado: foto apagada do produto base tambem acende o '!'", await mudancasDoKit(), ["fotos"]);
    }

    {
      console.log("\nAnuncio publicado acompanha o produto (Enviar mudancas ao ML)");
      await limpar();
      const { publicarAnuncioML } = await import("../src/lib/canaisDeVenda/ml/publicar.js");
      const { enviarMudancasML } = await import("../src/lib/canaisDeVenda/ml/atualizar.js");
      const { mudancasDosAnunciosML } = await import("../src/lib/canaisDeVenda/ml/banco.js");
      const c = await cenarioDePublicacao();
      const lerFoto = async () => Buffer.from("jpg");
      const mudancasDe = async (id) => {
        const anuncio = await prisma.anuncio.findUnique({ where: { id }, select: { id: true, canal: true, status: true, situacaoCanal: true, produtoId: true, dados: true } });
        return (await mudancasDosAnunciosML([anuncio])).get(id);
      };
      const ml = criarMLFalso();
      const id = await c.anuncioSimples(c.s1);
      const { itemId } = await publicarAnuncioML(id, { ml, bling: c.novoBling(), lerFoto });
      const desde = () => {
        const inicio = ml.escritas.length;
        return () => ml.escritas.slice(inicio).map((escrita) => `${escrita.metodo} ${escrita.caminho.replace(itemId, "MLB")}`);
      };

      conferir("enviar: sem mudancas nao escreve", await enviarMudancasML(id, { ml, lerFoto }), { ok: true, enviadas: [] });

      await prisma.produto.update({ where: { id: c.s1.id }, data: { descricaoBase: "Descricao nova do S1" } });
      let novas = desde();
      let r = await enviarMudancasML(id, { ml, lerFoto });
      conferir("enviar: descricao", [r.ok, r.enviadas, novas()], [true, ["descricao"], ["PUT /items/MLB/description"]]);
      conferir("enviar: o texto novo chegou ao ML", ml.itens.get(itemId).descricao.startsWith("Descricao nova do S1"), true);
      conferir("enviar: depois, nada mais mudou", await mudancasDe(id), { partes: [], naoConferido: false });

      await prisma.produtoArquivo.create({ data: { produtoId: c.s1.id, tipo: "IMAGEM", papel: "FOTO", arquivo: "ZZ-ML-S1-n.jpg", ordem: 5 } });
      novas = desde();
      r = await enviarMudancasML(id, { ml, lerFoto });
      conferir("enviar: foto nova sobe so ela e manda a lista inteira", [r.enviadas, novas(), ml.itens.get(itemId).pictures.length], [["fotos"], ["POST /pictures/items/upload", "PUT /items/MLB"], 3]);

      await prisma.produto.update({ where: { id: c.s1.id }, data: { pesoKg: 0.08 } });
      novas = desde();
      r = await enviarMudancasML(id, { ml, lerFoto });
      const pacote = ml.escritas.at(-1).corpo.attributes.map((atributo) => `${atributo.id}=${atributo.value_name}`);
      conferir("enviar: peso e medidas", [r.enviadas, novas(), pacote], [["pacote"], ["PUT /items/MLB"], ["SELLER_PACKAGE_HEIGHT=2 cm", "SELLER_PACKAGE_WIDTH=6 cm", "SELLER_PACKAGE_LENGTH=7 cm", "SELLER_PACKAGE_WEIGHT=80 g"]]);

      // Anuncio publicado antes de 24/10/2026: sem impressao, manda as tres e passa a ter impressao.
      const atual = (await prisma.anuncio.findUnique({ where: { id }, select: { dados: true } })).dados;
      await prisma.anuncio.update({ where: { id }, data: { dados: { ...atual, publicacao: { ...atual.publicacao, enviado: undefined } } } });
      r = await enviarMudancasML(id, { ml, lerFoto });
      conferir("enviar: nao conferido manda as tres", [r.enviadas, await mudancasDe(id)], [["descricao", "fotos", "pacote"], { partes: [], naoConferido: false }]);

      // Falha no meio: a descricao fica gravada, as fotos nao, e o resto nao e tentado.
      await prisma.produto.update({ where: { id: c.s1.id }, data: { descricaoBase: "Descricao terceira" } });
      await prisma.produtoArquivo.create({ data: { produtoId: c.s1.id, tipo: "IMAGEM", papel: "FOTO", arquivo: "ZZ-ML-S1-m.jpg", ordem: 6 } });
      const mlFalha = criarMLFalso({ falhas: [{ metodo: "PUT", caminho: `/items/${itemId}`, exato: true, status: 400, dados: { message: "bad", cause: [{ type: "error", code: "x", message: "Fotos recusadas" }] } }] });
      mlFalha.itens.set(itemId, structuredClone(ml.itens.get(itemId)));
      r = await enviarMudancasML(id, { ml: mlFalha, lerFoto });
      conferir("enviar: falha nas fotos para ali, descricao gravada", [r.ok, r.parte, r.enviadas, /Fotos recusadas/.test(r.erro), (await mudancasDe(id)).partes], [false, "fotos", ["descricao"], true, ["fotos"]]);
      // O popup de etapas (26/10/2026) le o andamento que o envio deixou na memoria: a descricao foi, as fotos falharam com o
      // motivo, as partes sem mudanca ficaram marcadas e o envio terminou.
      {
        const { lerProgressoML } = await import("../src/lib/canaisDeVenda/ml/progresso.js");
        const andamento = lerProgressoML(id);
        const estado = Object.fromEntries(andamento.etapas.map((etapa) => [etapa.id, etapa.estado]));
        conferir(
          "enviar: andamento do popup",
          [andamento.terminou, estado, /Fotos recusadas/.test(andamento.etapas.find((etapa) => etapa.id === "fotos").detalhe)],
          [true, { permissao: "feito", ler: "feito", titulo: "feito", descricao: "feito", fotos: "falhou", pacote: "feito", precoDaLoja: "feito", preco: "feito", ficha: "feito", prazo: "feito", atacado: "feito", bling: "espera" }, true],
        );
      }

      // Encerrado no ML: recusa sem escrever.
      ml.itens.get(itemId).status = "closed";
      novas = desde();
      r = await enviarMudancasML(id, { ml, lerFoto });
      conferir("enviar: encerrado no ML recusa sem escrever", [r.ok, /encerrado/.test(r.erro), novas()], [false, true, []]);
      ml.itens.get(itemId).status = "active";

      // Trava fechada: recusa sem escrever.
      const mlTravado = criarMLFalso({ codigosLiberados: ["outro"] });
      mlTravado.itens.set(itemId, structuredClone(ml.itens.get(itemId)));
      r = await enviarMudancasML(id, { ml: mlTravado, lerFoto });
      conferir("enviar: trava fechada recusa sem escrever", [r.ok, /Escrita bloqueada/.test(r.erro), mlTravado.escritas.length], [false, true, 0]);

      // Dois cliques ao mesmo tempo: o segundo e recusado.
      const [um, dois] = await Promise.all([enviarMudancasML(id, { ml, lerFoto }), enviarMudancasML(id, { ml, lerFoto })]);
      conferir("enviar: dois cliques, o segundo espera", [um.ok, dois.erro], [true, "Envio em andamento."]);

      const rascunho = await c.anuncioSimples(c.s1);
      conferir("enviar: rascunho recusa", (await enviarMudancasML(rascunho, { ml, lerFoto })).erro, "O anúncio não está publicado.");
    }

    {
      console.log("\nAnuncio publicado: preco e ficha editaveis (Salvar e Enviar mudancas ao ML)");
      await limpar();
      const { publicarAnuncioML } = await import("../src/lib/canaisDeVenda/ml/publicar.js");
      const { enviarMudancasML } = await import("../src/lib/canaisDeVenda/ml/atualizar.js");
      const { mudancasDosAnunciosML, salvarPublicadoML } = await import("../src/lib/canaisDeVenda/ml/banco.js");
      const c = await cenarioDePublicacao();
      const lerFoto = async () => Buffer.from("jpg");
      const mudancasDe = async (id) => {
        const anuncio = await prisma.anuncio.findUnique({ where: { id }, select: { id: true, canal: true, status: true, situacaoCanal: true, produtoId: true, dados: true } });
        return (await mudancasDosAnunciosML([anuncio])).get(id);
      };
      const ml = criarMLFalso();
      const id = await c.anuncioSimples(c.s1);
      const { itemId } = await publicarAnuncioML(id, { ml, bling: c.novoBling(), lerFoto });
      const enviadoNoPublicar = (await prisma.anuncio.findUnique({ where: { id }, select: { dados: true } })).dados.publicacao.enviado;
      conferir("publicar: a impressao ja leva preco e ficha", [enviadoNoPublicar.preco, enviadoNoPublicar.ficha.map((a) => a.id)], [49.9, ["BRAND", "EMPTY_GTIN_REASON", "INCLUDES_USB_CABLE", "MICROCONTROLLER", "MODEL", "OPERATING_VOLTAGE"]]);

      conferir("salvar publicado: recusa rascunho", (await salvarPublicadoML(await c.anuncioSimples(c.s1), { preco: 50, atributos: {} })).ok, false);
      conferir("salvar publicado: recusa preco invalido", [(await salvarPublicadoML(id, { preco: 0, atributos: {} })).ok, (await salvarPublicadoML(id, { preco: "abc", atributos: {} })).ok], [false, false]);

      const antes = (await carregarAnuncioML(id)).rascunho;
      const r1 = await salvarPublicadoML(id, { preco: 45.5, atributos: { ...antes.atributos, BRAND: "OUTRA" }, titulo: "TITULO NOVO IGNORADO" });
      const depois = (await carregarAnuncioML(id)).rascunho;
      conferir("salvar publicado: grava so preco e ficha", [r1.ok, depois.preco, depois.atributos.BRAND, depois.titulo], [true, 45.5, "OUTRA", antes.titulo]);
      conferir("salvar publicado: o '!' acende com preco e ficha", (await mudancasDe(id)).partes, ["preco", "ficha"]);

      const desde = ml.escritas.length;
      const r2 = await enviarMudancasML(id, { ml, lerFoto });
      const novas = ml.escritas.slice(desde).map((e) => [`${e.metodo} ${e.caminho.replace(itemId, "MLB")}`, Object.keys(e.corpo ?? {}).join(",")]);
      conferir("enviar: preco num PUT so dele, ficha em outro", [r2.ok, r2.enviadas, novas], [true, ["preco", "ficha"], [["PUT /items/MLB", "price"], ["PUT /items/MLB", "attributes"]]]);
      conferir("enviar: o ML ficou com o preco e a marca novos", [ml.itens.get(itemId).price, ml.itens.get(itemId).attributes.find((a) => a.id === "BRAND")?.value_name], [45.5, "OUTRA"]);
      conferir("enviar: depois, nada mudou", await mudancasDe(id), { partes: [], naoConferido: false });

      // Voltar ao valor de antes tambem e mudanca (o ML esta com 45,50).
      await salvarPublicadoML(id, { preco: 49.9, atributos: depois.atributos });
      conferir("salvar publicado: voltar ao preco antigo acende de novo", (await mudancasDe(id)).partes, ["preco"]);

      // Anuncio publicado antes de 24/10/2026 (impressao sem preco e ficha): o primeiro Salvar grava a base de antes.
      const dados = (await prisma.anuncio.findUnique({ where: { id }, select: { dados: true } })).dados;
      const { preco: _preco, ficha: _ficha, ...semPrecoNemFicha } = dados.publicacao.enviado;
      await prisma.anuncio.update({ where: { id }, data: { dados: { ...dados, preco: 49.9, publicacao: { ...dados.publicacao, enviado: semPrecoNemFicha } } } });
      conferir("impressao antiga: sem '!' de preco", (await mudancasDe(id)).partes, []);
      await salvarPublicadoML(id, { preco: 52, atributos: depois.atributos });
      const base = (await prisma.anuncio.findUnique({ where: { id }, select: { dados: true } })).dados.publicacao.enviado;
      conferir("impressao antiga: o Salvar grava o preco de antes como base e o '!' acende", [base.preco, (await mudancasDe(id)).partes], [49.9, ["preco"]]);
    }

    {
      console.log("\nFase 3: publicar e retomar");
      await limpar();
      const { publicarAnuncioML, validarNoML } = await import("../src/lib/canaisDeVenda/ml/publicar.js");
      const { lerPublicacao } = await import("../src/lib/canaisDeVenda/ml/banco.js");
      const c = await cenarioDePublicacao();
      const lerFoto = async () => Buffer.from("jpg");
      const semMLB = (escrita) => `${escrita.metodo} ${escrita.caminho.replace(/MLB\d+/, "MLB")}`;
      const postsNoBling = (bling, caminho) => bling.chamadas.filter((chamada) => chamada.metodo === "POST" && chamada.caminho === caminho).length;
      const estado = async (id) => (await lerPublicacao(id)).anuncio;

      // Caminho feliz
      const ml = criarMLFalso();
      const bf = c.novoBling();
      const idSimples = await c.anuncioSimples(c.s1, { atacado: { ligado: true, faixas: [2, 5, 10, 20].map((quantidade) => ({ quantidade, percentual: null })) } });
      // A proposta de anuncio (plano 2026-10-23, Tarefa 8) sai no Publicar que deu certo.
      const comProposta = async (id) => {
        const atual = await prisma.anuncio.findUnique({ where: { id }, select: { dados: true } });
        await prisma.anuncio.update({ where: { id }, data: { dados: { ...(atual.dados ?? {}), proposta: { campos: ["preco"], relatorio: "- x" } } } });
      };
      const temProposta = async (id) => Boolean((await prisma.anuncio.findUnique({ where: { id }, select: { dados: true } })).dados?.proposta);
      await comProposta(idSimples);
      let r = await publicarAnuncioML(idSimples, { ml, bling: bf, lerFoto });
      conferir("publicar: a proposta de anuncio sai no Publicar que deu certo", await temProposta(idSimples), false);
      conferir("publicar: tudo certo", [r.ok, r.feitas.at(-1), (await estado(idSimples)).status], [true, "gravar", "PUBLICADO"]);
      conferir("publicar: ordem das escritas no ML", ml.escritas.map(semMLB), ["POST /pictures/items/upload", "POST /pictures/items/upload", "POST /items/validate", "POST /items", "POST /items/MLB/description", "POST /items/fiscal_information", "POST /items/fiscal_information/items", "PUT /items/MLB", "POST /prices-per-quantity/v1/recommendations", "POST /items/MLB/prices/price-per-quantity"]);
      conferir("publicar: criou pausado, com preco e fotos por id, sem title", (({ status, price, pictures, title }) => [status, price, pictures.length, pictures.every((foto) => /^999-MLB/.test(foto.id)), title])(ml.escritas[3].corpo), ["paused", 49.9, 2, true, undefined]);
      conferir("publicar: ativou no fim (antes do atacado)", ml.escritas.filter((e) => e.metodo === "PUT").at(-1).corpo, { status: "active" });
      conferir("publicar: descricao do produto", ml.escritas[4].corpo.plain_text.startsWith("Descricao de ZZ-ML-S1"), true);
      conferir("publicar: um vinculo no Bling, na loja do ML, com o MLB e o preco", [postsNoBling(bf, "/produtos/lojas"), bf.chamadas.find((chamada) => chamada.caminho === "/produtos/lojas" && chamada.metodo === "POST").corpo], [1, { codigo: r.itemId, preco: 49.9, produto: { id: 501 }, loja: { id: 206326819 } }]);
      const publicado = await estado(idSimples);
      conferir("publicar: colunas gravadas", [publicado.situacaoCanal, publicado.idExterno, publicado.urlExterna === r.permalink, publicado.publicadoEm instanceof Date, publicado.erro], ["ATIVA", r.itemId, true, true, null]);
      conferir("publicar: payloadEnviado e o corpo da criacao", publicado.payloadEnviado.family_name, "PLACA ZZ ML");
      conferir("publicar: de novo e recusado", (await publicarAnuncioML(idSimples, { ml, bling: bf, lerFoto })).erro, "O anúncio já está publicado.");

      // SEM ESTOQUE (Opcao 2 do dono em 24/10/2026): conclui pausado e marcado; o worker ativa quando o ML tiver estoque.
      {
        const { ativarAnunciosAguardandoEstoque } = await import("../src/lib/canaisDeVenda/ml/aguardandoEstoque.js");
        await prisma.produto.update({ where: { id: c.s1.id }, data: { estoque: 0 } });
        const mlSem = criarMLFalso();
        const idSem = await c.anuncioSimples(c.s1);
        const semEstoque = await publicarAnuncioML(idSem, { ml: mlSem, bling: c.novoBling(), lerFoto });
        const gravado = await estado(idSem);
        conferir("sem estoque: conclui pausado, sem pedir para ativar",
          [semEstoque.ok, gravado.status, gravado.situacaoCanal, gravado.dados.publicacao.aguardandoEstoque, mlSem.escritas.some((e) => e.metodo === "PUT")],
          [true, "PUBLICADO", "PAUSADA", true, false]);
        conferir("sem estoque: o aviso diz que ativa sozinho", (semEstoque.avisos ?? []).some((a) => /ativado sozinho/.test(a)), true);
        const nada = await ativarAnunciosAguardandoEstoque({ ml: mlSem });
        conferir("sem estoque: sem estoque no ML, o worker nao ativa", [nada.conferidos, nada.ativados, (await estado(idSem)).situacaoCanal], [1, 0, "PAUSADA"]);
        mlSem.itens.get(semEstoque.itemId).available_quantity = 3;
        const ativou = await ativarAnunciosAguardandoEstoque({ ml: mlSem });
        const depois = await estado(idSem);
        conferir("sem estoque: com estoque no ML, o worker ativa e tira a marca",
          [ativou.ativados, depois.situacaoCanal, depois.dados.publicacao.aguardandoEstoque, mlSem.escritas.at(-1).corpo],
          [1, "ATIVA", false, { status: "active" }]);
        conferir("sem estoque: na volta seguinte nada mais a conferir", (await ativarAnunciosAguardandoEstoque({ ml: mlSem })).conferidos, 0);

        // Estoque no Rise, mas o ML recusa por falta de estoque: tambem conclui pausado.
        await prisma.produto.update({ where: { id: c.s1.id }, data: { estoque: 10 } });
        const mlRecusa = criarMLFalso({ falhas: [{ metodo: "PUT", caminho: "/items/MLB", status: 400, dados: { message: "Validation error", cause: [{ type: "error", code: "item.status.invalid", message: "Is not possible to activate an item without stock." }] } }] });
        const idRecusa = await c.anuncioSimples(c.s1);
        const recusa = await publicarAnuncioML(idRecusa, { ml: mlRecusa, bling: c.novoBling(), lerFoto });
        conferir("sem estoque no ML: a recusa por estoque conclui pausado e marcado",
          [recusa.ok, (await estado(idRecusa)).situacaoCanal, (await estado(idRecusa)).dados.publicacao.aguardandoEstoque], [true, "PAUSADA", true]);
      }

      // Review Focus 3: trava do Bling fechada => nada escrito em lugar nenhum
      const mlNovo = criarMLFalso();
      const bfTravado = c.novoBling({ codigosLiberados: ["outro"] });
      const idOutro = await c.anuncioSimples(c.s1);
      await comProposta(idOutro);
      r = await publicarAnuncioML(idOutro, { ml: mlNovo, bling: bfTravado, lerFoto });
      conferir("trava: a proposta de anuncio fica (nada foi publicado)", await temProposta(idOutro), true);
      conferir("trava: nada escrito em lugar nenhum", [r.ok, /Escrita bloqueada/.test(r.erro), mlNovo.escritas.length, bfTravado.chamadas.filter((chamada) => !["GET", "exigirEscrita"].includes(chamada.metodo)).length, (await estado(idOutro)).status], [false, true, 0, 0, "RASCUNHO"]);
      const mlTravado = criarMLFalso({ codigosLiberados: ["outro"] });
      r = await publicarAnuncioML(idOutro, { ml: mlTravado, bling: c.novoBling(), lerFoto });
      conferir("trava: codigo fora da lista do ML", [r.ok, /ML_PUBLICACAO_CODIGOS/.test(r.erro), mlTravado.escritas.length], [false, true, 0]);

      // Review Focus 1: criacao sem resposta certa
      const mlQueda = criarMLFalso({ falhas: [{ metodo: "POST", caminho: "/items", exato: true, status: 500 }] });
      const idQueda = await c.anuncioSimples(c.s1);
      r = await publicarAnuncioML(idQueda, { ml: mlQueda, bling: c.novoBling(), lerFoto });
      conferir("incerta: marcada", [r.ok, r.incerta, r.etapa, (await estado(idQueda)).status], [false, true, "criar", "ERRO"]);
      const antes = mlQueda.escritas.length;
      r = await publicarAnuncioML(idQueda, { ml: mlQueda, bling: c.novoBling(), lerFoto });
      conferir("incerta: retomar sem recriar nao escreve", [r.ok, mlQueda.escritas.length - antes, /Confira/.test(r.erro)], [false, 0, true]);
      r = await publicarAnuncioML(idQueda, { ml: mlQueda, bling: c.novoBling(), lerFoto, recriar: true });
      conferir("incerta: recriar cria e nao sobe as fotos de novo", [r.ok, mlQueda.escritas.filter((e) => e.caminho === "/pictures/items/upload").length, (await lerPublicacao(idQueda)).publicacao.incerta], [true, 2, false]);
      const mlRede = criarMLFalso({ falhas: [{ metodo: "POST", caminho: "/items", exato: true, lancar: true }] });
      r = await publicarAnuncioML(await c.anuncioSimples(c.s1), { ml: mlRede, bling: c.novoBling(), lerFoto });
      conferir("incerta: queda de rede tambem", [r.ok, r.incerta], [false, true]);
      const mlRecusa = criarMLFalso({ falhas: [{ metodo: "POST", caminho: "/items", exato: true, status: 400, dados: { message: "bad", cause: [{ type: "error", code: "x", message: "Recusado" }] } }] });
      r = await publicarAnuncioML(await c.anuncioSimples(c.s1), { ml: mlRecusa, bling: c.novoBling(), lerFoto });
      conferir("criar: recusa 4xx nao e incerta", [r.ok, Boolean(r.incerta), /Recusado/.test(r.erro)], [false, false, true]);

      // Review Focus 2: falha em cada etapa e retomada
      const mlDescricao = criarMLFalso({ falhas: [{ metodo: "POST", caminho: "/items/MLB", status: 500 }] });
      const bfDescricao = c.novoBling();
      const idDescricao = await c.anuncioSimples(c.s1);
      r = await publicarAnuncioML(idDescricao, { ml: mlDescricao, bling: bfDescricao, lerFoto });
      conferir("descricao: para na descricao, sem ativar", [r.ok, r.etapa, (await estado(idDescricao)).status, mlDescricao.escritas.some((e) => e.corpo?.status === "active")], [false, "descricao", "ERRO", false]);
      conferir("descricao: Salvar recusado com o item criado", /já existe no Mercado Livre/.test((await salvarRascunhoML(idDescricao, (await novoRascunhoML(c.s1.id)).rascunho)).erro), true);
      r = await publicarAnuncioML(idDescricao, { ml: mlDescricao, bling: bfDescricao, lerFoto });
      conferir("descricao: retomar termina sem recriar nem resubir fotos", [r.ok, mlDescricao.escritas.filter((e) => e.caminho === "/items").length, mlDescricao.escritas.filter((e) => e.caminho === "/pictures/items/upload").length], [true, 1, 2]);
      conferir("descricao: retomar sem mudanca nao atualiza nada no ML", mlDescricao.escritas.some((e) => /^\/items\/MLB\d+$/.test(e.caminho) && (e.corpo?.price !== undefined || Array.isArray(e.corpo?.attributes) || Array.isArray(e.corpo?.pictures))), false);

      // Opcao 1 do dono (27/10/2026): parado depois de criado, o Salvar grava o que o ML aceita trocar e o Retomar manda so isso.
      const mlMudou = criarMLFalso({ falhas: [{ metodo: "POST", caminho: "/items/MLB", status: 500 }] });
      const bfMudou = c.novoBling();
      const idMudou = await c.anuncioSimples(c.s1);
      // O produto marcado "Nao anunciar no ML" (28/10/2026): criar o anuncio no ML tira a marca, e a da Shopee fica.
      await prisma.$executeRaw`UPDATE "Produto" SET "naoAnunciarEm" = ARRAY['MERCADO_LIVRE','SHOPEE']::"Canal"[] WHERE id = ${c.s1.id}`;
      r = await publicarAnuncioML(idMudou, { ml: mlMudou, bling: bfMudou, lerFoto });
      conferir("criar no ML tira o Nao anunciar no ML (e deixa o da Shopee)", (await prisma.produto.findUnique({ where: { id: c.s1.id }, select: { naoAnunciarEm: true } })).naoAnunciarEm, ["SHOPEE"]);
      await prisma.$executeRaw`UPDATE "Produto" SET "naoAnunciarEm" = ARRAY[]::"Canal"[] WHERE id = ${c.s1.id}`;
      conferir("retomada: a criacao guarda o que foi (criadoCom)", Boolean((await lerPublicacao(idMudou)).publicacao.criadoCom?.preco), true);
      const parado = (await carregarAnuncioML(idMudou)).rascunho;
      const salvoParado = await salvarPresoML(idMudou, { ...parado, preco: Number(parado.preco) + 5 });
      conferir("retomada: o Salvar do parado aceita o preco", salvoParado.ok, true);
      r = await publicarAnuncioML(idMudou, { ml: mlMudou, bling: bfMudou, lerFoto });
      const puts = mlMudou.escritas.filter((e) => /^\/items\/MLB\d+$/.test(e.caminho));
      conferir("retomada: manda so o preco novo, sem recriar", [r.ok, puts.some((e) => e.corpo?.price === Number(parado.preco) + 5), puts.some((e) => Array.isArray(e.corpo?.attributes)), mlMudou.escritas.filter((e) => e.caminho === "/items").length], [true, true, false, 1]);

      const mlAtivar = criarMLFalso({ falhas: [{ metodo: "PUT", caminho: "/items/MLB", status: 500 }] });
      const bfAtivar = c.novoBling();
      const idAtivar = await c.anuncioSimples(c.s1);
      r = await publicarAnuncioML(idAtivar, { ml: mlAtivar, bling: bfAtivar, lerFoto });
      conferir("ativar: para em ativar", [r.ok, r.etapa], [false, "ativar"]);
      r = await publicarAnuncioML(idAtivar, { ml: mlAtivar, bling: bfAtivar, lerFoto });
      conferir("ativar: retomar nao recria nem revincula", [r.ok, mlAtivar.escritas.filter((e) => e.caminho === "/items").length, postsNoBling(bfAtivar, "/produtos/lojas"), mlAtivar.escritas.filter((e) => e.caminho.endsWith("/description")).length], [true, 1, 1, 1]);

      const mlVinculo = criarMLFalso();
      const bfVinculo = c.novoBling({ falhas: [{ metodo: "POST", caminho: "/produtos/lojas", status: 400, mensagem: "vinculo recusado", vezes: 1 }] });
      const idVinculo = await c.anuncioSimples(c.s1);
      r = await publicarAnuncioML(idVinculo, { ml: mlVinculo, bling: bfVinculo, lerFoto });
      conferir("vinculo: para no vinculo, pausado", [r.ok, r.etapa, /vinculo recusado/.test(r.erro), mlVinculo.escritas.some((e) => e.corpo?.status === "active"), (await lerPublicacao(idVinculo)).publicacao.etapaComErro], [false, "vinculo", true, false, "vinculo"]);
      r = await publicarAnuncioML(idVinculo, { ml: mlVinculo, bling: bfVinculo, lerFoto });
      conferir("vinculo: retomar vincula e ativa", [r.ok, mlVinculo.escritas.filter((e) => e.metodo === "PUT").at(-1).corpo, mlVinculo.escritas.filter((e) => e.caminho === "/items").length], [true, { status: "active" }, 1]);

      // Registro do anuncio no Bling (/anuncios): um por MLB, depois do vinculo e antes de ativar.
      conferir("registrar: um POST /anuncios no caminho feliz, com o MLB e a modalidade", [postsNoBling(bf, "/anuncios"), bf.chamadas.find((chamada) => chamada.metodo === "POST" && chamada.caminho === "/anuncios")?.corpo.anuncioLoja.id === publicado.idExterno, bf.chamadas.find((chamada) => chamada.metodo === "POST" && chamada.caminho === "/anuncios")?.corpo.mercadoLivre], [1, true, { modalidade: "gold_special" }]);
      conferir("registrar: id do registro gravado na publicacao", typeof (await lerPublicacao(idSimples)).publicacao.blingAnuncioId, "number");
      const mlRegistro = criarMLFalso();
      const bfRegistro = c.novoBling({ falhas: [{ metodo: "POST", caminho: "/anuncios", status: 500, mensagem: "fora do ar", vezes: 1 }] });
      const idRegistro = await c.anuncioSimples(c.s1);
      r = await publicarAnuncioML(idRegistro, { ml: mlRegistro, bling: bfRegistro, lerFoto });
      conferir("registrar: falha para em registrar_bling, pausado e vinculado", [r.ok, r.etapa, mlRegistro.escritas.some((e) => e.corpo?.status === "active"), postsNoBling(bfRegistro, "/produtos/lojas"), (await lerPublicacao(idRegistro)).publicacao.etapaComErro], [false, "registrar_bling", false, 1, "registrar_bling"]);
      r = await publicarAnuncioML(idRegistro, { ml: mlRegistro, bling: bfRegistro, lerFoto });
      conferir("registrar: retomar registra, nao revincula e ativa", [r.ok, postsNoBling(bfRegistro, "/anuncios"), postsNoBling(bfRegistro, "/produtos/lojas"), mlRegistro.escritas.filter((e) => e.metodo === "PUT").at(-1).corpo, (await estado(idRegistro)).status], [true, 2, 1, { status: "active" }, "PUBLICADO"]);
      // Segundo anuncio do MESMO produto: o vinculo e reaproveitado e o /anuncios ganha mais um registro.
      const mlSegundo = criarMLFalso();
      const bfSegundo = c.novoBling({ vinculosDeLoja: [{ codigo: "MLB900", preco: 10, produto: { id: 501 }, loja: { id: 206326819 } }], anuncios: [{ produto: { id: 501 }, loja: { id: 206326819 }, anuncioLoja: { id: "MLB900" }, nome: "PLACA ZZ ML", preco: { valor: 10 }, situacao: 1 }] });
      r = await publicarAnuncioML(await c.anuncioSimples(c.s1, { tipoAnuncio: "gold_pro" }), { ml: mlSegundo, bling: bfSegundo, lerFoto });
      const registrosDoProduto = (await bfSegundo.get("/anuncios", { tipoIntegracao: "MercadoLivre", idLoja: 206326819, idProduto: 501 })).dados.data;
      conferir("segundo anuncio do mesmo produto: sem novo vinculo, com novo registro", [r.ok, postsNoBling(bfSegundo, "/produtos/lojas"), registrosDoProduto.length, registrosDoProduto.at(-1).anuncioLoja.id === r.itemId], [true, 0, 2, true]);

      // Review Focus 5: ML ignora o pausado
      const mlAtivo = criarMLFalso({ ignorarPausado: true });
      r = await publicarAnuncioML(await c.anuncioSimples(c.s1), { ml: mlAtivo, bling: c.novoBling(), lerFoto });
      conferir("pausar: PUT paused logo depois de criar", [r.ok, semMLB(mlAtivo.escritas[4]), mlAtivo.escritas[4].corpo], [true, "PUT /items/MLB", { status: "paused" }]);

      // Kit de composicao: cria o kit no Bling; falhando, fica aguardando o Bling, e retomar termina
      const mlKit = criarMLFalso();
      const bfKit = c.novoBling({ falhas: [{ metodo: "POST", caminho: "/produtos", status: 500, mensagem: "fora do ar", vezes: 1 }] });
      const idKit = await c.anuncioDeKit("ZZ-ML-KITN", 2);
      r = await publicarAnuncioML(idKit, { ml: mlKit, bling: bfKit, lerFoto });
      const aguardando = await lerPublicacao(idKit);
      conferir("kit: falha no Bling deixa aguardando, pausado", [r.ok, r.etapa, aguardando.anuncio.status, aguardando.publicacao.etapaComErro, /Aguardando o kit no Bling/.test(r.erro), mlKit.escritas.some((e) => e.corpo?.status === "active")], [false, "kit_bling", "PUBLICANDO", "kit_bling", true, false]);
      r = await publicarAnuncioML(idKit, { ml: mlKit, bling: bfKit, lerFoto });
      const kitNoBling = bfKit.produto("ZZ-ML-KITN");
      conferir("kit: verificar no Bling cria o kit, vincula e ativa", [r.ok, kitNoBling?.formato, kitNoBling?.estrutura?.componentes, postsNoBling(bfKit, "/produtos/lojas"), mlKit.escritas.filter((e) => e.caminho === "/items").length], [true, "E", [{ produto: { id: 502 }, quantidade: 1 }, { produto: { id: 503 }, quantidade: 2 }], 1, 1]);
      conferir("kit: vinculo no produto do kit e id gravado na composicao", [bfKit.chamadas.find((chamada) => chamada.caminho === "/produtos/lojas" && chamada.metodo === "POST").corpo.produto.id, (await lerPublicacao(idKit)).anuncio.dados.composicao.blingProdutoId], [kitNoBling.id, String(kitNoBling.id)]);
      const mlKitIgual = criarMLFalso();
      const bfKitIgual = c.novoBling();
      r = await publicarAnuncioML(await c.anuncioDeKit("ZZ-ML-KITX", 2), { ml: mlKitIgual, bling: bfKitIgual, lerFoto });
      conferir("kit: igual no Bling reaproveita sem criar produto", [r.ok, postsNoBling(bfKitIgual, "/produtos")], [true, 0]);

      // Dois pedidos ao mesmo tempo do mesmo anuncio
      const mlDois = criarMLFalso();
      const idDois = await c.anuncioSimples(c.s1);
      const [primeiro, segundo] = await Promise.all([publicarAnuncioML(idDois, { ml: mlDois, bling: c.novoBling(), lerFoto }), publicarAnuncioML(idDois, { ml: mlDois, bling: c.novoBling(), lerFoto })]);
      conferir("simultaneo: um publica, o outro espera", [primeiro.ok, segundo.erro, mlDois.escritas.filter((e) => e.caminho === "/items").length], [true, "Publicação em andamento.", 1]);

      // Validar no ML: validacao 400 => erro com as causas, nada criado, status continua RASCUNHO
      const mlValida = criarMLFalso({ validacao: { status: 400, dados: { message: "Validation error", cause: [{ type: "error", code: "item.attribute.missing", message: "Falta MODEL" }, { type: "warning", code: "x", message: "Foto pequena" }] } } });
      const idValida = await c.anuncioSimples(c.s1);
      r = await validarNoML(idValida, { ml: mlValida, bling: c.novoBling(), lerFoto });
      conferir("validarNoML: causas e nada criado", [r.ok, /Falta MODEL/.test(r.erro), r.avisos, mlValida.escritas.some((e) => e.caminho === "/items"), (await estado(idValida)).status], [false, true, ["Foto pequena (x)"], false, "RASCUNHO"]);
      r = await validarNoML(idValida, { ml: criarMLFalso(), bling: c.novoBling(), lerFoto });
      conferir("validarNoML: sem problema", [r.ok, (await estado(idValida)).status, (await salvarRascunhoML(idValida, (await novoRascunhoML(c.s1.id)).rascunho)).ok], [true, "RASCUNHO", true]);
      // Primeiro envio real (08/10/2026): o validador devolveu 400 "Validation error" so com causas do tipo
      // warning ("User has not mode me1", "Mandatory free shipping added"). Aviso nao bloqueia: segue.
      const soAvisos = { status: 400, dados: { message: "Validation error", error: "validation_error", cause: [{ type: "warning", code: "***", message: "User has not mode me1" }, { type: "warning", code: "***", message: "Mandatory free shipping added" }] } };
      const mlAvisos = criarMLFalso({ validacao: soAvisos });
      r = await publicarAnuncioML(await c.anuncioSimples(c.s1), { ml: mlAvisos, bling: c.novoBling(), lerFoto });
      conferir("validar: 400 so com avisos nao bloqueia, e os avisos voltam", [r.ok, r.avisos], [true, ["User has not mode me1 (***)", "Mandatory free shipping added (***)"]]);
      r = await validarNoML(await c.anuncioSimples(c.s1), { ml: criarMLFalso({ validacao: soAvisos }), bling: c.novoBling(), lerFoto });
      conferir("validarNoML: 400 so com avisos e ok com avisos", [r.ok, r.avisos?.length], [true, 2]);
      r = await validarNoML(await c.anuncioSimples(c.s1), { ml: criarMLFalso({ validacao: { status: 400, dados: { message: "Validation error", cause: [] } } }), bling: c.novoBling(), lerFoto });
      conferir("validarNoML: 400 sem causa nenhuma barra com a mensagem", [r.ok, /Validation error/.test(r.erro)], [false, true]);

      // Revisao final: "Validar no ML" num anuncio cujo item ja existe nao pode seguir para as etapas seguintes.
      const mlParado = criarMLFalso({ falhas: [{ metodo: "POST", caminho: "/items/MLB", status: 500 }] });
      const bfParado = c.novoBling();
      const idParado = await c.anuncioSimples(c.s1);
      await publicarAnuncioML(idParado, { ml: mlParado, bling: bfParado, lerFoto });
      const escritasAntes = mlParado.escritas.length;
      r = await validarNoML(idParado, { ml: mlParado, bling: bfParado, lerFoto });
      conferir(
        "validarNoML: item ja criado recusa sem escrever nem publicar",
        [r.ok, /Retomar publicação/.test(r.erro), mlParado.escritas.length - escritasAntes, postsNoBling(bfParado, "/produtos/lojas"), (await estado(idParado)).status],
        [false, true, 0, 0, "ERRO"],
      );

      const motivos = await publicarAnuncioML(await c.anuncioSimples(c.semBling), { ml: criarMLFalso(), bling: c.novoBling(), lerFoto });
      conferir("publicar: pre-checagem recusada devolve os motivos", [motivos.ok, motivos.motivos?.some((m) => /blingId/.test(m))], [false, true]);
    }

    {
      console.log("\nAtacado no Publicar e no Enviar mudanças");
      await limpar();
      const { publicarAnuncioML } = await import("../src/lib/canaisDeVenda/ml/publicar.js");
      const { enviarMudancasML } = await import("../src/lib/canaisDeVenda/ml/atualizar.js");
      const c = await cenarioDePublicacao();
      const lerFoto = async () => Buffer.from("jpg");
      const faixasNoML = (ml, itemId) => (ml.itens.get(itemId).price_per_quantity ?? []).map((p) => [p.conditions.min_purchase_unit, p.percentage]);
      const dadosDe = async (id) => (await prisma.anuncio.findUnique({ where: { id }, select: { dados: true } })).dados;
      const postsDeAtacado = (ml) => ml.escritas.filter((e) => e.metodo === "POST" && e.caminho.endsWith("/prices/price-per-quantity"));

      // Caminho feliz: o rascunho com o atacado ligado (o novo nasce desligado desde 09/11/2026) e o Publicar o envia depois de ativar.
      const ml = criarMLFalso();
      const id = await c.anuncioSimples(c.s1, { atacado: { ligado: true, faixas: [2, 5, 10, 20].map((quantidade) => ({ quantidade, percentual: null })) } });
      const r = await publicarAnuncioML(id, { ml, bling: c.novoBling(), lerFoto });
      const ordem = r.feitas.indexOf("atacado");
      conferir("publicar: ok, atacado entre ativar e gravar, 4 faixas no item", [r.ok, ordem === r.feitas.indexOf("ativar") + 1, r.feitas.indexOf("gravar") === ordem + 1, faixasNoML(ml, r.itemId)], [true, true, true, [[2, 0.82], [5, 5.5], [10, 9.86], [20, 12.27]]]);
      const dados = await dadosDe(id);
      conferir("publicar: grava publicacao.atacado e os % enviados no rascunho", [dados.publicacao.atacado.faixas.length, dados.atacado.faixas.map((f) => f.percentual)], [4, [0.82, 5.5, 9.86, 12.27]]);
      conferir("publicar: a impressao do atacado e a do rascunho (sem '!')", [dados.publicacao.enviado.atacado, (await carregarAnuncioML(id)).mudancas], [{ faixas: [[2, 0.82], [5, 5.5], [10, 9.86], [20, 12.27]], ligado: true }, { partes: [], naoConferido: false }]);

      // O ML recusa o atacado: a publicacao NAO cai, avisa, a etapa fica feita (o Retomar nao a repete) e o "!" chama de volta.
      const mlRecusa = criarMLFalso({ recusarAtacado: true });
      const id2 = await c.anuncioSimples(c.s1, { atacado: { ligado: true, faixas: [2, 5, 10, 20].map((quantidade) => ({ quantidade, percentual: null })) } });
      const r2 = await publicarAnuncioML(id2, { ml: mlRecusa, bling: c.novoBling(), lerFoto });
      const dados2 = await dadosDe(id2);
      conferir("publicar com atacado recusado: ok, aviso, etapa feita e erro gravado", [r2.ok, r2.avisos?.some((aviso) => /atacado/i.test(aviso)), r2.feitas.includes("atacado"), typeof dados2.publicacao.atacado.erro, dados2.publicacao.enviado.atacado], [true, true, true, "string", { faixas: [], ligado: false }]);
      conferir("publicar com atacado recusado: o '!' acende so o atacado", (await carregarAnuncioML(id2)).mudancas.partes, ["atacado"]);
      const doPopup = await anunciosMLDoProduto(c.s1.id);
      conferir("popup do produto: o anuncio com o atacado pendente traz o motivo do '!', o em dia nao traz", [doPopup.find((a) => a.id === id2)?.alerta, doPopup.find((a) => a.id === id)?.alerta ?? null], ["desatualizado: atacado alterado, falta enviar ao ML", null]);

      // A sugestao que demora (pedido do dono em 09/11/2026: "pode ficar parado naquele popup com as etapas, se demorar mais de
      // xxxx segundos ai apresenta falha e me fala para fazer manualmente"). Com frete gratis o Publicar espera na etapa.
      const { lerProgressoML } = await import("../src/lib/canaisDeVenda/ml/progresso.js");
      const comFreteGratis = async (idDoAnuncio) => {
        const atual = await dadosDe(idDoAnuncio);
        await prisma.anuncio.update({ where: { id: idDoAnuncio }, data: { dados: { ...atual, envio: { ...atual.envio, freteGratis: true } } } });
        return idDoAnuncio;
      };
      const mlAtrasado = criarMLFalso({ recomendacaoVazia: 2 });
      const idAtrasado = await comFreteGratis(await c.anuncioSimples(c.s1, { atacado: { ligado: true, faixas: [2, 5, 10, 20].map((quantidade) => ({ quantidade, percentual: null })) } }));
      const dormidas = [];
      const rA = await publicarAnuncioML(idAtrasado, { ml: mlAtrasado, bling: c.novoBling(), lerFoto, dormir: async (ms) => { dormidas.push(ms); } });
      conferir("publicar com sugestao atrasada (frete gratis): espera na etapa e envia, sem aviso", [rA.ok, dormidas.length, faixasNoML(mlAtrasado, rA.itemId).length, rA.avisoDoAtacado ?? null], [true, 2, 4, null]);
      const mlNunca = criarMLFalso({ recomendacaoVazia: true });
      const idNunca = await comFreteGratis(await c.anuncioSimples(c.s1, { atacado: { ligado: true, faixas: [2, 5, 10, 20].map((quantidade) => ({ quantidade, percentual: null })) } }));
      const dormidasNunca = [];
      const rN = await publicarAnuncioML(idNunca, { ml: mlNunca, bling: c.novoBling(), lerFoto, dormir: async (ms) => { dormidasNunca.push(ms); } });
      const etapasN = lerProgressoML(idNunca)?.etapas ?? [];
      conferir("publicar com sugestao que nao vem: publica; no popup o atacado falhou e o gravar ficou feito", [rN.ok, dormidasNunca.length, etapasN.find((e) => e.id === "atacado")?.estado, etapasN.find((e) => e.id === "gravar")?.estado, rN.feitas.includes("atacado")], [true, 9, "falhou", "feito", true]);
      conferir("publicar com sugestao que nao vem: o aviso diz o tempo e manda fazer a mao", [/90 segundos/.test(rN.avisoDoAtacado ?? ""), /Recomendação do ML/.test(rN.avisoDoAtacado ?? ""), /Sincronizar com o ML/.test(rN.avisoDoAtacado ?? "")], [true, true, true]);
      const mlSemFrete = criarMLFalso({ recomendacaoVazia: true });
      const idSemFrete = await c.anuncioSimples(c.s1, { atacado: { ligado: true, faixas: [2, 5, 10, 20].map((quantidade) => ({ quantidade, percentual: null })) } });
      const dormidasSemFrete = [];
      const rSF = await publicarAnuncioML(idSemFrete, { ml: mlSemFrete, bling: c.novoBling(), lerFoto, dormir: async (ms) => { dormidasSemFrete.push(ms); } });
      conferir("publicar sem frete gratis e sem sugestao: nao espera e o aviso explica por que", [rSF.ok, dormidasSemFrete.length, /sem frete grátis/i.test(rSF.avisoDoAtacado ?? "")], [true, 0, true]);

      // Desligado no rascunho: nada vai ao ML, e a etapa fica feita.
      const idOff = await c.anuncioSimples(c.s1, { atacado: { ligado: false, faixas: [] } });
      const mlOff = criarMLFalso();
      const rOff = await publicarAnuncioML(idOff, { ml: mlOff, bling: c.novoBling(), lerFoto });
      conferir("publicar com atacado desligado: nenhum POST de atacado, etapa feita, sem '!'", [rOff.ok, postsDeAtacado(mlOff).length, rOff.feitas.includes("atacado"), (await carregarAnuncioML(idOff)).mudancas.partes], [true, 0, true, []]);

      // Enviar mudancas: o dono subiu o % da faixa de 2 unidades.
      const antes = await dadosDe(id);
      const faixas = antes.atacado.faixas.map((f, i) => (i === 0 ? { ...f, percentual: 5 } : f));
      await prisma.anuncio.update({ where: { id }, data: { dados: { ...antes, atacado: { ...antes.atacado, faixas } } } });
      conferir("envio: o % editado acende so o atacado", (await carregarAnuncioML(id)).mudancas.partes, ["atacado"]);
      const e1 = await enviarMudancasML(id, { ml, bling: c.novoBling(), lerFoto });
      conferir("envio: POST novo com 5% na faixa de 2 e a impressao nova", [e1.ok, e1.enviadas, faixasNoML(ml, r.itemId)[0], (await carregarAnuncioML(id)).mudancas.partes], [true, ["atacado"], [2, 5], []]);

      // Desligar manda a lista vazia e a impressao fica desligada.
      const meio = await dadosDe(id);
      await prisma.anuncio.update({ where: { id }, data: { dados: { ...meio, atacado: { ...meio.atacado, ligado: false } } } });
      conferir("envio: desligar acende o atacado", (await carregarAnuncioML(id)).mudancas.partes, ["atacado"]);
      const e2 = await enviarMudancasML(id, { ml, bling: c.novoBling(), lerFoto });
      conferir("envio desligado: POST com lista vazia, item sem faixas e impressao desligada", [e2.ok, postsDeAtacado(ml).at(-1).corpo, faixasNoML(ml, r.itemId), (await dadosDe(id)).publicacao.enviado.atacado, (await carregarAnuncioML(id)).mudancas.partes], [true, { price_per_quantity: [] }, [], { faixas: [], ligado: false }, []]);

      // O ML recusa no Enviar mudancas: a falha vem na parte, sem gravar a impressao.
      const antesFalha = await dadosDe(id2);
      await prisma.anuncio.update({ where: { id: id2 }, data: { dados: { ...antesFalha, atacado: { ...antesFalha.atacado, ligado: true } } } });
      const e3 = await enviarMudancasML(id2, { ml: mlRecusa, bling: c.novoBling(), lerFoto });
      conferir("envio com atacado recusado: falha na parte atacado e o '!' continua", [e3.ok, e3.parte, (await carregarAnuncioML(id2)).mudancas.partes], [false, "atacado", ["atacado"]]);

      // Kit sem atacado (dono, 09/11/2026): o kit publicado nao manda faixa nenhuma, e o kit que ja estava no ar com atacado
      // (publicado antes da regra) acende o "!" e o Enviar manda a lista vazia, tirando as faixas do ML.
      const mlKit = criarMLFalso();
      const idKitAt = await c.anuncioDeKit("ZZ-ML-KITY", 2);
      const rKit = await publicarAnuncioML(idKitAt, { ml: mlKit, bling: c.novoBling(), lerFoto });
      conferir("kit: publica sem POST de atacado e sem '!'", [rKit.ok, postsDeAtacado(mlKit).length, (await dadosDe(idKitAt)).atacado.ligado, (await carregarAnuncioML(idKitAt)).mudancas.partes], [true, 0, false, []]);
      // O kit como ficou no ar antes da regra: faixas no ML, na impressao e ligadas no rascunho.
      const kitAntes = await dadosDe(idKitAt);
      const faixasAntigas = { ligado: true, faixas: [{ quantidade: 2, percentual: 4 }, { quantidade: 5, percentual: 10 }] };
      await prisma.anuncio.update({ where: { id: idKitAt }, data: { dados: { ...kitAntes, atacado: faixasAntigas, publicacao: { ...kitAntes.publicacao, enviado: { ...kitAntes.publicacao.enviado, atacado: { ligado: true, faixas: [[2, 4], [5, 10]] } } } } } });
      mlKit.itens.get(rKit.itemId).price_per_quantity = [{ conditions: { min_purchase_unit: 2 }, percentage: 4 }];
      conferir("kit publicado com atacado: o '!' acende o atacado", (await carregarAnuncioML(idKitAt)).mudancas.partes, ["atacado"]);
      const eKit = await enviarMudancasML(idKitAt, { ml: mlKit, bling: c.novoBling(), lerFoto });
      conferir("kit publicado com atacado: o Enviar manda [] e tudo fica desligado", [eKit.ok, postsDeAtacado(mlKit).at(-1)?.corpo, (await dadosDe(idKitAt)).publicacao.enviado.atacado, (await dadosDe(idKitAt)).atacado.ligado, (await carregarAnuncioML(idKitAt)).mudancas.partes], [true, { price_per_quantity: [] }, { faixas: [], ligado: false }, false, []]);

      // Validacao do atacado: quantidade repetida ou % que cai entre as faixas e problema da aba Preco; % vazio vem da recomendacao.
      const rascunhoBase = (await carregarAnuncioML(id)).rascunho;
      const doAtacado = (faixas, ligado = true) => validarRascunhoML({ ...rascunhoBase, atacado: { ligado, faixas } }, { produtos: {}, frases: [], codigoEmUso: null }).find((p) => p.campo === "atacado");
      const TEXTO_DAS_FAIXAS = "As faixas de atacado precisam de quantidades diferentes e desconto crescente.";
      conferir("atacado validacao: quantidade repetida", [doAtacado([{ quantidade: 2, percentual: 5 }, { quantidade: 2, percentual: 6 }])?.problema ?? null, doAtacado([{ quantidade: 2, percentual: 5 }, { quantidade: 2, percentual: 6 }])?.aba ?? null], [TEXTO_DAS_FAIXAS, "preco"]);
      conferir("atacado validacao: % que cai com a quantidade", doAtacado([{ quantidade: 2, percentual: 5 }, { quantidade: 5, percentual: 3 }])?.problema ?? null, TEXTO_DAS_FAIXAS);
      conferir("atacado validacao: % vazio e crescente nao sao problema", [doAtacado([{ quantidade: 2, percentual: null }, { quantidade: 5, percentual: null }]) ?? null, doAtacado([{ quantidade: 2, percentual: 5 }, { quantidade: 5, percentual: null }, { quantidade: 10, percentual: 9 }]) ?? null], [null, null]);
      conferir("atacado validacao: desligado nao valida", doAtacado([{ quantidade: 2, percentual: 5 }, { quantidade: 2, percentual: 6 }], false) ?? null, null);

      // O Salvar do anuncio publicado guarda o atacado (formato invalido fica como estava) e acende a parte para o Enviar.
      const { salvarPublicadoML } = await import("../src/lib/canaisDeVenda/ml/banco.js");
      const novoAtacado = { ligado: true, faixas: [{ quantidade: 2, percentual: 7 }, { quantidade: 5, percentual: null }] };
      const salvo = await salvarPublicadoML(id, { preco: rascunhoBase.preco, atributos: rascunhoBase.atributos, atacado: novoAtacado });
      conferir("publicado: o Salvar guarda o atacado e acende a parte", [salvo.ok, (await dadosDe(id)).atacado, (await carregarAnuncioML(id)).mudancas.partes.includes("atacado")], [true, { faixas: [{ percentual: 7, quantidade: 2 }, { percentual: null, quantidade: 5 }], ligado: true }, true]);
      const seisFaixas = { ligado: true, faixas: [1, 2, 3, 4, 5, 6].map((quantidade) => ({ quantidade, percentual: null })) };
      await salvarPublicadoML(id, { preco: rascunhoBase.preco, atributos: rascunhoBase.atributos, atacado: seisFaixas });
      conferir("publicado: atacado invalido no Salvar fica como estava", (await dadosDe(id)).atacado.faixas.length, 2);
      // O Salvar do kit publicado nao religa, mesmo que a tela mande ligado.
      await salvarPublicadoML(idKitAt, { preco: (await dadosDe(idKitAt)).preco, atributos: (await prisma.anuncio.findUnique({ where: { id: idKitAt }, select: { atributos: true } })).atributos, atacado: faixasAntigas });
      conferir("kit publicado: o Salvar nao religa o atacado", [(await dadosDe(idKitAt)).atacado.ligado, (await carregarAnuncioML(idKitAt)).mudancas.partes.includes("atacado")], [false, false]);
    }

    // Fase 3: as proximas tarefas entram aqui, dentro deste bloco.
  }

  {
    console.log("\nConcorrentes do ML: banco");
    await limpar();
    const p = await prisma.produto.create({ data: { sku: "ZZ-ML-C1", tituloBase: "ZZ catalogo", conferido: true, mlCatalogoId: "MLB44072268", mlCatalogoNome: "Placa Uno" } });
    const c = await prisma.concorrenteML.create({ data: { produtoId: p.id, itemId: "MLB1", catalogoId: "MLB44072268", vendedorId: "141686451", preco: 39.54, posicao: 1, totalNoCatalogo: 9, lidoEm: new Date() } });
    await prisma.concorrenteMLHistorico.create({ data: { concorrenteId: c.id, preco: 39.54, posicao: 1, lidoEm: new Date() } });
    await prisma.posicaoML.create({ data: { produtoId: p.id, catalogoId: "MLB44072268", itemId: "MLB4165084257", posicao: 4, total: 9, menorPreco: 39.54, lidoEm: new Date() } });
    let repetido = false;
    try {
      await prisma.concorrenteML.create({ data: { produtoId: p.id, itemId: "MLB1", catalogoId: "MLB44072268", vendedorId: "x", posicao: 2, totalNoCatalogo: 9, lidoEm: new Date() } });
    } catch (e) {
      repetido = e.code === "P2002";
    }
    conferir("concorrente ML: um por produto e MLB", repetido, true);
    await prisma.produto.delete({ where: { id: p.id } });
    conferir(
      "apagar o produto leva concorrentes, historico e posicao",
      [
        await prisma.concorrenteML.count({ where: { produtoId: p.id } }),
        await prisma.concorrenteMLHistorico.count({ where: { concorrenteId: c.id } }),
        await prisma.posicaoML.count({ where: { produtoId: p.id } }),
      ],
      [0, 0, 0],
    );
    const configExistia = (await prisma.configCanal.count({ where: { canal: "MERCADO_LIVRE" } })) > 0;
    const configML = await prisma.configCanal.upsert({ where: { canal: "MERCADO_LIVRE" }, create: { canal: "MERCADO_LIVRE" }, update: {} });
    conferir("ConfigCanal tem mlConcorrentesRelidosEm", "mlConcorrentesRelidosEm" in configML, true);
    // A linha e a de verdade (frases fixas do dono): so se apaga se foi o teste que a criou.
    if (!configExistia) await prisma.configCanal.deleteMany({ where: { canal: "MERCADO_LIVRE" } });
  }

  {
    console.log("\nConcorrentes do ML: ML falso");
    const { criarMLFalso } = await import("./lib/mlFalso.js");
    const ml = criarMLFalso();
    const busca = await ml.get("/products/search", { status: "active", site_id: "MLB", q: "placa uno", limit: 5 });
    conferir("falso: busca de catalogo acha pelo nome", [busca.status, busca.dados.results.map((r) => r.id)], [200, ["MLB44072268"]]);
    const itens = await ml.get("/products/MLB44072268/items", { limit: 50 });
    conferir("falso: itens do catalogo na ordem", [itens.status, itens.dados.paging.total, itens.dados.results.slice(0, 3).map((i) => i.price)], [200, 9, [39.54, 39.54, 42.99]]);
    conferir("falso: catalogo sem itens da 404", (await ml.get("/products/MLB60092501/items")).status, 404);
    conferir("falso: produto de catalogo com permalink", (await ml.get("/products/MLB44072268")).dados.permalink, "https://www.mercadolivre.com.br/p/MLB44072268");
    conferir("falso: vendedor", (await ml.get("/users/141686451")).dados.nickname, "ARDU_ROBÓTICA EIRELI");
    conferir("falso: vendedor que nao existe", (await ml.get("/users/1")).status, 404);
    const com429 = criarMLFalso({ falhas: [{ metodo: "GET", caminho: "/products/MLB44072268/items", exato: true, status: 429 }] });
    conferir("falso: falha programada em GET", [(await com429.get("/products/MLB44072268/items")).status, (await com429.get("/products/MLB44072268/items")).status], [429, 200]);
    conferir("falso: expoe o estado", Object.keys(ml.estado.catalogos).sort(), ["MLB44072268", "MLB60092501"]);
  }

  {
    console.log("\nConcorrentes do ML: leitura");
    const { criarMLFalso } = await import("./lib/mlFalso.js");
    const { buscarCatalogos, lerConcorrentesDoCatalogo, topDoCatalogo, minhaPosicao, lerVendedores, limparCacheDeVendedores, textoDaReputacao, TOP_DO_CATALOGO } = await import(
      "../src/lib/canaisDeVenda/ml/catalogo.js"
    );
    const ml = criarMLFalso();
    conferir("buscarCatalogos: termo vazio nao chama o ML", [await buscarCatalogos(ml, "  "), ml.chamadas.length], [[], 0]);
    const achados = await buscarCatalogos(ml, "placa uno");
    conferir("buscarCatalogos: id, nome e resumo da ficha", [achados[0].id, achados[0].atributosResumo.slice(0, 2), achados[0].foto !== null], ["MLB44072268", ["Marca: Deirolab", "Modelo: UNO R3 CH340"], true]);
    const lido = await lerConcorrentesDoCatalogo(ml, "MLB44072268", { meuSellerId: "212386247" });
    conferir("lerConcorrentes: total, ordem e posicao", [lido.total, lido.itens.map((i) => i.posicao), lido.itens[0].preco], [9, [1, 2, 3, 4, 5, 6, 7, 8, 9], 39.54]);
    conferir("lerConcorrentes: o meu e marcado", lido.itens.filter((i) => i.meu).map((i) => i.itemId), ["MLB4191686159"]);
    conferir("lerConcorrentes: 404 e lista vazia", await lerConcorrentesDoCatalogo(ml, "MLB60092501", { meuSellerId: "1" }), { total: 0, itens: [] });
    conferir("topDoCatalogo: tira os meus e corta em N", [topDoCatalogo(lido.itens).length, topDoCatalogo(lido.itens).some((i) => i.meu), topDoCatalogo(lido.itens, 3).map((i) => i.posicao), TOP_DO_CATALOGO], [8, false, [1, 2, 3], 10]);
    conferir("minhaPosicao", minhaPosicao(lido.itens), { posicao: 4, itemId: "MLB4191686159", total: 9, menorPreco: 39.54 });
    conferir("minhaPosicao: sem anuncio meu", minhaPosicao(lido.itens.filter((i) => !i.meu)).posicao, null);
    // Review Focus 2: dois anuncios meus no catalogo, fica a melhor posicao.
    const doisMeus = lido.itens.map((i) => (i.itemId === "MLB5202599258" ? { ...i, meu: true } : i));
    conferir("minhaPosicao: dois meus, vale o melhor", [minhaPosicao(doisMeus).posicao, minhaPosicao(doisMeus).itemId], [4, "MLB4191686159"]);
    // Review Focus 1: catalogo so meu.
    conferir("minhaPosicao: so eu no catalogo", minhaPosicao([{ ...lido.itens[3], posicao: 1 }]), { posicao: 1, itemId: "MLB4191686159", total: 1, menorPreco: null });
    limparCacheDeVendedores();
    const antes = ml.chamadas.length;
    const v = await lerVendedores(ml, ["141686451", "1"]);
    await lerVendedores(ml, ["141686451"]);
    conferir(
      "lerVendedores: apelido, reputacao e cache",
      [v.get("141686451").apelido, v.get("141686451").reputacao, v.get("141686451").vendas, v.get("1").apelido, ml.chamadas.length - antes],
      ["ARDU_ROBÓTICA EIRELI", "5_green", 10343, null, 2],
    );
    conferir("textoDaReputacao", [textoDaReputacao("5_green"), textoDaReputacao("3_yellow"), textoDaReputacao(null)], ["verde 5", "amarelo 3", "sem reputação"]);
    const grande = criarMLFalso({
      catalogos: { MLBG: { nome: "Grande", itens: Array.from({ length: 170 }, (_, i) => ({ item_id: `MLBG${i}`, seller_id: 10 + i, price: 10 + i, listing_type_id: "gold_special", shipping: { free_shipping: false } })) } },
    });
    conferir("lerConcorrentes: para em 3 paginas (150)", (await lerConcorrentesDoCatalogo(grande, "MLBG", { meuSellerId: "0" })).itens.length, 150);
    const comErro = criarMLFalso({ falhas: [{ metodo: "GET", caminho: "/products/MLB44072268/items", exato: true, status: 429 }] });
    let lancou = null;
    try {
      await lerConcorrentesDoCatalogo(comErro, "MLB44072268", { meuSellerId: "1" });
    } catch (erro) {
      lancou = erro.status;
    }
    conferir("lerConcorrentes: erro do ML lanca com o status", lancou, 429);

    // O catalogo dos MEUS anuncios do produto vem sugerido (a busca pelo nome nao o achava entre os 10 primeiros, medido
    // em 22/10/2026). Encerrado fica de fora; dois anuncios no mesmo catalogo viram uma sugestao so.
    const { catalogosDosMeusAnuncios } = await import("../src/lib/canaisDeVenda/ml/catalogo.js");
    const comMeus = criarMLFalso({
      meusItens: {
        100101: [
          { id: "MLBA", status: "active", catalog_product_id: "MLB44072268", catalog_listing: true },
          { id: "MLBB", status: "active", catalog_product_id: "MLB44072268", catalog_listing: true },
          { id: "MLBC", status: "closed", catalog_product_id: "MLB60092501", catalog_listing: true },
          { id: "MLBD", status: "paused", catalog_product_id: null },
          // So identificado com um produto de catalogo (26/10/2026, o MLB5461526965 do 100111): nao concorre, fica de fora.
          { id: "MLBE", status: "active", catalog_product_id: "MLB49572808", catalog_listing: false },
        ],
      },
    });
    const meus = await catalogosDosMeusAnuncios(comMeus, "100101");
    conferir("meus catalogos: um por catalogo, sem encerrado", meus.map((c) => [c.id, c.meusAnuncios]), [["MLB44072268", ["MLBA", "MLBB"]]]);
    conferir("meus catalogos: com nome e ficha", [meus[0].nome.startsWith("Cabo USB"), meus[0].atributosResumo[0]], [true, "Marca: Deirolab"]);
    conferir("meus catalogos: sku sem anuncio", await catalogosDosMeusAnuncios(comMeus, "999999"), []);
    conferir("meus catalogos: sku vazio nao chama o ML", [await catalogosDosMeusAnuncios(comMeus, " "), comMeus.chamadas.filter((c) => c.caminho.includes("items/search") && !c.params.seller_sku).length], [[], 0]);

    // Numero de vendedores no catalogo (pedido do dono em 22/10/2026): anuncio e vendedor nao sao a mesma conta.
    const { contarVendedores, resumoDoCatalogo, comResumo, textoDoResumo } = await import("../src/lib/canaisDeVenda/ml/catalogo.js");
    conferir("contarVendedores: cada vendedor uma vez (9 anuncios de 7 vendedores no falso)", contarVendedores(lido.itens), 7);
    conferir("resumoDoCatalogo: anuncios, vendedores e completo", await resumoDoCatalogo(ml, "MLB44072268"), { anuncios: 9, vendedores: 7, completo: true });
    conferir("resumoDoCatalogo: catalogo vazio", await resumoDoCatalogo(ml, "MLB60092501"), { anuncios: 0, vendedores: 0, completo: true });
    conferir("resumoDoCatalogo: catalogo maior que 150 fica incompleto", await resumoDoCatalogo(grande, "MLBG"), { anuncios: 170, vendedores: 150, completo: false });
    const comFalhaNoResumo = criarMLFalso({ falhas: [{ metodo: "GET", caminho: "/products/MLB60092501/items", exato: true, status: 500 }] });
    conferir(
      "comResumo: cada catalogo ganha o resumo; o que falha fica sem",
      (await comResumo(comFalhaNoResumo, [{ id: "MLB44072268" }, { id: "MLB60092501" }])).map((c) => c.resumo),
      [{ anuncios: 9, vendedores: 7, completo: true }, null],
    );
    conferir(
      "textoDoResumo",
      [textoDoResumo({ anuncios: 9, vendedores: 8, completo: true }), textoDoResumo({ anuncios: 1, vendedores: 1, completo: true }), textoDoResumo({ anuncios: 170, vendedores: 150, completo: false }), textoDoResumo(null)],
      ["9 anúncios · 8 vendedores", "1 anúncio · 1 vendedor", "150+ anúncios · ao menos 150 vendedores", null],
    );
  }

  {
    console.log("\nConcorrentes do ML: acompanhar e reler");
    await limpar();
    const { criarMLFalso } = await import("./lib/mlFalso.js");
    const { acompanharCatalogoML, relerCatalogoDoProduto, pararDeAcompanharML, lerConcorrentesML, marcarConcorrentesMLVistos } = await import(
      "../src/lib/canaisDeVenda/ml/concorrentes.js"
    );
    const { avisosDoML } = await import("../src/lib/canaisDeVenda/ml/avisosConcorrentes.js");
    const { limparCacheDeVendedores } = await import("../src/lib/canaisDeVenda/ml/catalogo.js");
    limparCacheDeVendedores();
    const ml = criarMLFalso();
    const historicoDe = (produtoId) => prisma.concorrenteMLHistorico.count({ where: { concorrente: { produtoId } } });
    const ultimaPosicao = async (produtoId) => (await prisma.posicaoML.findFirst({ where: { produtoId }, orderBy: { lidoEm: "desc" } }))?.posicao;

    const nao = await prisma.produto.create({ data: { sku: "ZZ-ML-C2", tituloBase: "nao conferido" } });
    conferir(
      "acompanhar recusa produto nao Conferido",
      (await acompanharCatalogoML(ml, nao.id, { catalogoId: "MLB44072268", catalogoNome: "x" })).erro,
      "Só produto Conferido acompanha concorrentes no ML.",
    );
    const p = await prisma.produto.create({ data: { sku: "ZZ-ML-C1", tituloBase: "ZZ catalogo", conferido: true } });
    const a = await acompanharCatalogoML(ml, p.id, { catalogoId: "MLB44072268", catalogoNome: "Placa Uno" }, { agora: new Date("2026-10-21T10:00:00Z") });
    const salvos = await prisma.concorrenteML.findMany({ where: { produtoId: p.id }, orderBy: { posicao: "asc" } });
    conferir(
      "acompanhar: grava o catalogo e os 8 do top (9 menos o meu)",
      [a.ok, (await prisma.produto.findUnique({ where: { id: p.id } })).mlCatalogoId, salvos.length, salvos[0].vendedorApelido, salvos[0].posicao, salvos.some((c) => c.itemId === "MLB4191686159")],
      [true, "MLB44072268", 8, "ARDU_ROBÓTICA EIRELI", 1, false],
    );
    conferir("acompanhar: primeira posicao do dono", await ultimaPosicao(p.id), 4);
    const posicaoGravada = await prisma.posicaoML.findFirst({ where: { produtoId: p.id } });
    conferir("acompanhar: a posicao guarda o numero de vendedores e se leu tudo", [posicaoGravada.vendedores, posicaoGravada.completo], [7, true]);
    conferir("lerConcorrentesML: a tela traz os vendedores", (await lerConcorrentesML(p.id)).posicao.vendedores, 7);
    conferir("acompanhar: um historico por concorrente", await historicoDe(p.id), 8);

    const r1 = await relerCatalogoDoProduto(ml, p.id, { agora: new Date("2026-10-21T11:00:00Z") });
    conferir("reler sem mudanca: nada novo no historico", [r1.ok, r1.mudaram, r1.novos, await historicoDe(p.id), await prisma.posicaoML.count({ where: { produtoId: p.id } })], [true, 0, 0, 8, 1]);
    // "Lido em" e a ultima LEITURA, nao a ultima mudanca: sem isso o "Reler agora" parecia nao fazer nada (visto em 22/10/2026).
    conferir("lerConcorrentesML: lido em e a ultima leitura, mesmo sem mudanca", (await lerConcorrentesML(p.id)).lidoEm?.toISOString(), "2026-10-21T11:00:00.000Z");

    // Dois vendedores novos na frente e um antigo fora do catalogo: o dono cai do 4o para o 5o (30, 31, 39.54, 42.99, 49.90).
    const novos = [
      { item_id: "MLBNOVO", seller_id: 999, price: 30, listing_type_id: "gold_special", shipping: { free_shipping: true } },
      { item_id: "MLBNOVO2", seller_id: 998, price: 31, listing_type_id: "gold_pro", shipping: { free_shipping: false } },
    ];
    const padrao = ml.estado.catalogos.MLB44072268;
    const mudou = criarMLFalso({
      catalogos: { MLB44072268: { ...padrao, itens: [...novos, ...padrao.itens.filter((i) => i.item_id !== "MLB5434866561")] } },
      vendedores: { 999: { nickname: "NOVATO", level_id: "1_red", total: 3 }, 998: { nickname: "NOVATO 2", level_id: "2_orange", total: 9 } },
    });
    const r2 = await relerCatalogoDoProduto(mudou, p.id, { agora: new Date("2026-10-22T10:00:00Z") });
    const depois = await prisma.concorrenteML.findMany({ where: { produtoId: p.id } });
    conferir(
      "reler com mudanca: novos entram, ausente marca, posicao do dono cai",
      [r2.ok, r2.novos, r2.ausentes, depois.find((c) => c.itemId === "MLBNOVO").vendedorApelido, depois.find((c) => c.itemId === "MLB5434866561").ausenteDesde !== null, await ultimaPosicao(p.id)],
      [true, 2, 1, "NOVATO", true, 5],
    );
    const historicoAposMudanca = await historicoDe(p.id);
    const tela = await lerConcorrentesML(p.id);
    conferir("lerConcorrentesML: avisos antes de ver", tela.avisos.map((v) => v.tipo).sort(), ["caiu", "novo_mais_barato"]);
    conferir("lerConcorrentesML: o texto da queda", tela.avisos.find((v) => v.tipo === "caiu").texto, "caiu de 4º para 5º");
    await prisma.anuncio.create({ data: { produtoId: p.id, canal: "MERCADO_LIVRE", titulo: "ZZ anuncio", dados: { tipoAnuncio: "gold_special" } } });
    conferir("lista de anuncios: a coluna traz os avisos do produto", (await listarAnunciosML({ busca: "ZZ-ML-C1" })).linhas[0]?.avisosML?.[0], "caiu de 4º para 5º");
    await marcarConcorrentesMLVistos(p.id, { agora: new Date("2026-10-22T12:00:00Z") });
    conferir("depois de visto, sem avisos", (await lerConcorrentesML(p.id)).avisos, []);
    conferir("lista de anuncios: sem avisos depois de visto", (await listarAnunciosML({ busca: "ZZ-ML-C1" })).linhas[0]?.avisosML, []);

    const r3 = await relerCatalogoDoProduto(ml, p.id, { agora: new Date("2026-10-23T10:00:00Z") });
    conferir("reler: quem voltou perde o ausenteDesde", [r3.ok, (await prisma.concorrenteML.findFirst({ where: { produtoId: p.id, itemId: "MLB5434866561" } })).ausenteDesde], [true, null]);
    const historicoAposVolta = await historicoDe(p.id);
    const comErro = criarMLFalso({ falhas: [{ metodo: "GET", caminho: "/products/MLB44072268/items", exato: true, status: 429 }] });
    const r4 = await relerCatalogoDoProduto(comErro, p.id, { agora: new Date("2026-10-24T10:00:00Z") });
    conferir("reler com 429: erro com status e nada gravado", [r4.ok, r4.status, await historicoDe(p.id)], [false, 429, historicoAposVolta]);
    conferir("historico cresceu nas duas releituras com mudanca", historicoAposMudanca > 8 && historicoAposVolta > historicoAposMudanca, true);

    // Review Focus 5: trocar de catalogo marca os antigos como ausentes, sem apagar o historico.
    const troca = await acompanharCatalogoML(ml, p.id, { catalogoId: "MLB60092501", catalogoNome: "Outro" }, { agora: new Date("2026-10-25T10:00:00Z") });
    conferir(
      "trocar de catalogo: antigos ausentes, catalogo novo sem itens, historico intacto",
      [troca.ok, await prisma.concorrenteML.count({ where: { produtoId: p.id, ausenteDesde: null } }), (await prisma.produto.findUnique({ where: { id: p.id } })).mlCatalogoId, await historicoDe(p.id)],
      [true, 0, "MLB60092501", historicoAposVolta],
    );
    await pararDeAcompanharML(p.id);
    conferir(
      "parar de acompanhar: zera o catalogo e nao apaga",
      [(await prisma.produto.findUnique({ where: { id: p.id } })).mlCatalogoId, await prisma.concorrenteML.count({ where: { produtoId: p.id } })],
      [null, 10],
    );

    // Review Focus 1: catalogo so com anuncios do dono.
    const so = await prisma.produto.create({ data: { sku: "ZZ-ML-C3", tituloBase: "so eu", conferido: true } });
    const soEu = criarMLFalso({ catalogos: { MLBSO: { nome: "So eu", itens: [{ item_id: "MLBMEU", seller_id: 212386247, price: 20, listing_type_id: "gold_special", shipping: {} }] } } });
    const rSo = await acompanharCatalogoML(soEu, so.id, { catalogoId: "MLBSO", catalogoNome: "So eu" });
    const posSo = await prisma.posicaoML.findFirst({ where: { produtoId: so.id } });
    conferir("so eu no catalogo: nenhum concorrente, posicao 1 de 1", [rSo.ok, await prisma.concorrenteML.count({ where: { produtoId: so.id } }), posSo.posicao, posSo.total], [true, 0, 1, 1]);

    conferir(
      "avisosDoML puro: caiu",
      avisosDoML({
        posicoes: [{ posicao: 5, menorPreco: 39.54, lidoEm: new Date("2026-10-21T12:00:00Z") }, { posicao: 2, menorPreco: 39.54, lidoEm: new Date("2026-10-20T12:00:00Z") }],
        concorrentes: [],
        vistoEm: new Date("2026-10-20T13:00:00Z"),
      }),
      [{ tipo: "caiu", texto: "caiu de 2º para 5º" }],
    );
    conferir(
      "avisosDoML puro: preco baixou",
      avisosDoML({
        posicoes: [],
        concorrentes: [{ vendedorApelido: "ARDU_ROBÓTICA EIRELI", historico: [{ preco: 37.9, lidoEm: new Date("2026-10-21T12:00:00Z") }, { preco: 39.54, lidoEm: new Date("2026-10-20T12:00:00Z") }] }],
        vistoEm: null,
      }),
      [{ tipo: "preco_baixou", texto: "ARDU_ROBÓTICA EIRELI baixou para R$ 37,90" }],
    );
  }

  {
    console.log("\nConcorrentes do ML: rodada diaria");
    await limpar();
    const { criarMLFalso } = await import("./lib/mlFalso.js");
    const { relerConcorrentesML } = await import("../src/lib/canaisDeVenda/ml/relerCatalogo.js");
    const { acompanharCatalogoML } = await import("../src/lib/canaisDeVenda/ml/concorrentes.js");
    // A linha do ConfigCanal e a de verdade: guarda a data da rodada e devolve no fim.
    const configAntes = await prisma.configCanal.findUnique({ where: { canal: "MERCADO_LIVRE" } });
    await prisma.configCanal.upsert({ where: { canal: "MERCADO_LIVRE" }, create: { canal: "MERCADO_LIVRE" }, update: { mlConcorrentesRelidosEm: null } });
    const relidoEm = async () => (await prisma.configCanal.findUnique({ where: { canal: "MERCADO_LIVRE" } })).mlConcorrentesRelidosEm?.toISOString() ?? null;
    try {
      const ml = criarMLFalso();
      const p1 = await prisma.produto.create({ data: { sku: "ZZ-ML-C1", tituloBase: "um", conferido: true } });
      const p2 = await prisma.produto.create({ data: { sku: "ZZ-ML-C2", tituloBase: "dois", conferido: true } });
      await acompanharCatalogoML(ml, p1.id, { catalogoId: "MLB44072268", catalogoNome: "a" });
      await acompanharCatalogoML(ml, p2.id, { catalogoId: "MLB44072268", catalogoNome: "a" });
      // So os produtos deste teste: o banco e compartilhado, e produto real acompanhado nao pode entrar na conta.
      const soDoTeste = { produtos: [p1.id, p2.id] };
      const agora = new Date("2026-10-21T15:00:00Z");
      const r1 = await relerConcorrentesML({ cliente: ml, agora, espera: 0, ...soDoTeste });
      conferir("rodada: le os produtos acompanhados e grava a data", [r1.rodou, r1.produtos, r1.ok, await relidoEm()], [true, 2, 2, agora.toISOString()]);
      // 23:00 UTC ainda e 21/10 em Sao Paulo (20:00).
      conferir("rodada: nao repete no mesmo dia de Sao Paulo", (await relerConcorrentesML({ cliente: ml, agora: new Date("2026-10-21T23:00:00Z"), espera: 0, ...soDoTeste })).rodou, false);
      conferir("rodada: dia seguinte roda", (await relerConcorrentesML({ cliente: ml, agora: new Date("2026-10-22T03:30:00Z"), espera: 0, ...soDoTeste })).rodou, true);
      const com429 = criarMLFalso({ falhas: [{ metodo: "GET", caminho: "/products/MLB44072268/items", exato: true, status: 429 }] });
      const r4 = await relerConcorrentesML({ cliente: com429, agora: new Date("2026-10-23T12:00:00Z"), espera: 0, ...soDoTeste });
      conferir("rodada: 429 para na hora e nao avanca a data", [r4.rodou, r4.parou !== undefined, r4.ok, await relidoEm()], [true, true, 0, "2026-10-22T03:30:00.000Z"]);
      const outroErro = criarMLFalso({ falhas: [{ metodo: "GET", caminho: "/products/MLB44072268/items", exato: true, status: 500 }] });
      const r5 = await relerConcorrentesML({ cliente: outroErro, agora: new Date("2026-10-23T13:00:00Z"), espera: 0, ...soDoTeste });
      conferir("rodada: erro que nao e 429 conta como falha e segue", [r5.rodou, r5.parou, r5.ok, r5.falhas, await relidoEm()], [true, undefined, 1, 1, "2026-10-23T13:00:00.000Z"]);
      let lancou = false;
      try {
        await relerConcorrentesML({ cliente: { usuarioId: async () => { throw new Error("rede"); }, get: async () => { throw new Error("rede"); } }, agora: new Date("2026-10-24T12:00:00Z"), espera: 0, ...soDoTeste });
      } catch {
        lancou = true;
      }
      conferir("rodada: nunca lanca", lancou, false);
      // Um produto que estoura no banco (apelido que nao e texto) nao derruba a rodada dos outros.
      const { limparCacheDeVendedores } = await import("../src/lib/canaisDeVenda/ml/catalogo.js");
      limparCacheDeVendedores();
      await prisma.produto.update({ where: { id: p1.id }, data: { mlCatalogoId: "MLBRUIM" } });
      const ruim = criarMLFalso({
        catalogos: { MLBRUIM: { nome: "Ruim", itens: [{ item_id: "MLBR1", seller_id: 777, price: 9, listing_type_id: "gold_special", shipping: {} }] } },
        vendedores: { 777: { nickname: 12345, level_id: "5_green", total: 1 } },
      });
      const r7 = await relerConcorrentesML({ cliente: ruim, agora: new Date("2026-10-25T12:00:00Z"), espera: 0, ...soDoTeste });
      conferir("rodada: erro de banco num produto conta como falha e os outros seguem", [r7.rodou, r7.motivo, r7.ok, r7.falhas], [true, undefined, 1, 1]);
      limparCacheDeVendedores();
    } finally {
      if (configAntes) await prisma.configCanal.update({ where: { canal: "MERCADO_LIVRE" }, data: { mlConcorrentesRelidosEm: configAntes.mlConcorrentesRelidosEm } });
      else await prisma.configCanal.deleteMany({ where: { canal: "MERCADO_LIVRE" } });
    }
  }

  {
    console.log("\nConcorrentes do ML: posicao de preco");
    const { concorrentesParaPosicao } = await import("../src/lib/canaisDeVenda/ml/avisosConcorrentes.js");
    const { posicaoDePreco } = await import("../src/lib/posicaoDePreco.js");
    // Review Focus 3: o mesmo vendedor com dois anuncios conta uma vez; quem saiu do top fica fora.
    const lista = concorrentesParaPosicao([
      { vendedorApelido: "A", preco: 39.54, ausenteDesde: null },
      { vendedorApelido: "A", preco: 41, ausenteDesde: null },
      { vendedorApelido: null, vendedorId: "7", preco: 55.8, ausenteDesde: null },
      { vendedorApelido: "B", preco: 10, ausenteDesde: new Date() },
    ]);
    conferir("posicao no ML: mesmo vendedor conta uma vez, ausente fora", (({ posicao, total }) => [posicao, total])(posicaoDePreco(49.9, lista)), [2, 3]);
    conferir("posicao no ML: vendedor sem apelido", lista[2].loja, "vendedor 7");
  }

  {
    console.log("\nRanking do ML: catalogos de referencia (leitura e gravacao)");
    await limpar();
    const { criarMLFalso } = await import("./lib/mlFalso.js");
    const { lerPrimeiroDoCatalogo, limparCacheDeVendedores } = await import("../src/lib/canaisDeVenda/ml/catalogo.js");
    const { adicionarReferenciaML, removerReferenciaML, relerReferenciasDoProduto, lerReferenciasML, MAXIMO_DE_REFERENCIAS } = await import(
      "../src/lib/canaisDeVenda/ml/referencias.js"
    );
    limparCacheDeVendedores();
    const item = (id, vendedor, preco, cheio = null) => ({ item_id: id, seller_id: vendedor, price: preco, original_price: cheio, listing_type_id: "gold_special", shipping: { free_shipping: false, logistic_type: "xd_drop_off" } });
    const catalogos = {
      MLBREF1: { nome: "Mega 2560 com cabo", itens: [item("MLBR1A", 141686451, 31.99, 76.65), item("MLBR1B", 632377333, 39.9)] },
      MLBREF2: { nome: "Mega 2560 CH340", itens: [item("MLBR2A", 632377333, 45)] },
      MLBVAZIO: { nome: "Sem ninguem", itens: [] },
      MLBMEU: { nome: "Eu na frente", itens: [item("MLBMEU1", 212386247, 50), item("MLBMEU2", 141686451, 52)] },
    };
    const ml = criarMLFalso({ catalogos });

    const primeiro = await lerPrimeiroDoCatalogo(ml, "MLBREF1", { meuSellerId: "212386247" });
    conferir("lerPrimeiroDoCatalogo: o 1o, com o riscado e o total", [primeiro.total, primeiro.primeiro?.itemId, primeiro.primeiro?.preco, primeiro.primeiro?.precoCheio, primeiro.primeiro?.meu], [2, "MLBR1A", 31.99, 76.65, false]);
    conferir("lerPrimeiroDoCatalogo: uma pagina de 1", ml.chamadas.filter((c) => c.caminho === "/products/MLBREF1/items").map((c) => c.params.limit), [1]);
    conferir("lerPrimeiroDoCatalogo: 404 = sem anuncios", await lerPrimeiroDoCatalogo(ml, "MLBVAZIO", {}), { total: 0, primeiro: null });
    conferir("lerPrimeiroDoCatalogo: o 1o e do dono", (await lerPrimeiroDoCatalogo(ml, "MLBMEU", { meuSellerId: "212386247" })).primeiro?.meu, true);

    const produto = await prisma.produto.create({ data: { sku: "ZZ-ML-R1", tituloBase: "Mega 2560", conferido: true, mlCatalogoId: "MLB44072268" } });
    const naoConferido = await prisma.produto.create({ data: { sku: "ZZ-ML-R2", tituloBase: "Mega", conferido: false } });
    const agora = new Date("2026-10-23T12:00:00Z");

    const r1 = await adicionarReferenciaML(ml, produto.id, { catalogoId: "MLBREF1", nome: "Mega 2560 com cabo" }, { agora });
    const gravada = await prisma.catalogoReferenciaML.findFirst({ where: { produtoId: produto.id, catalogoId: "MLBREF1" } });
    conferir("adicionar: grava e ja le o 1o", [r1.ok, gravada?.itemId, Number(gravada?.preco), Number(gravada?.precoCheio), gravada?.vendedorApelido, gravada?.totalNoCatalogo], [true, "MLBR1A", 31.99, 76.65, "ARDU_ROBÓTICA EIRELI", 2]);
    conferir("adicionar: a primeira leitura vira historico", await prisma.catalogoReferenciaMLHistorico.count({ where: { referenciaId: gravada.id } }), 1);
    conferir("adicionar: recusa o catalogo do anuncio", (await adicionarReferenciaML(ml, produto.id, { catalogoId: "MLB44072268", nome: "x" }, { agora })).ok, false);
    conferir("adicionar: recusa repetido", (await adicionarReferenciaML(ml, produto.id, { catalogoId: "MLBREF1", nome: "x" }, { agora })).ok, false);
    conferir("adicionar: recusa nao Conferido", (await adicionarReferenciaML(ml, naoConferido.id, { catalogoId: "MLBREF1", nome: "x" }, { agora })).ok, false);
    conferir("adicionar: catalogo vazio grava semAnuncios", [(await adicionarReferenciaML(ml, produto.id, { catalogoId: "MLBVAZIO", nome: "Sem ninguem" }, { agora })).ok, (await prisma.catalogoReferenciaML.findFirst({ where: { produtoId: produto.id, catalogoId: "MLBVAZIO" } }))?.semAnuncios], [true, true]);
    for (let n = 0; n < MAXIMO_DE_REFERENCIAS - 2; n++) {
      await prisma.catalogoReferenciaML.create({ data: { produtoId: produto.id, catalogoId: `MLBX${n}` } });
    }
    conferir("adicionar: recusa a 11a", (await adicionarReferenciaML(ml, produto.id, { catalogoId: "MLBREF2", nome: "x" }, { agora })).ok, false);
    await prisma.catalogoReferenciaML.deleteMany({ where: { produtoId: produto.id, catalogoId: { startsWith: "MLBX" } } });

    // Mesmo preco: sem historico novo. Preco novo: historico. Erro do ML: guarda o erro e mantem o preco lido antes.
    await relerReferenciasDoProduto(ml, produto.id, { agora: new Date("2026-10-24T12:00:00Z"), espera: 0 });
    conferir("reler: mesmo preco nao grava historico", await prisma.catalogoReferenciaMLHistorico.count({ where: { referenciaId: gravada.id } }), 1);
    const baixou = criarMLFalso({ catalogos: { ...catalogos, MLBREF1: { nome: "x", itens: [item("MLBR1A", 141686451, 29.9, 76.65)] } } });
    await relerReferenciasDoProduto(baixou, produto.id, { agora: new Date("2026-10-25T12:00:00Z"), espera: 0 });
    conferir("reler: preco novo grava historico", [await prisma.catalogoReferenciaMLHistorico.count({ where: { referenciaId: gravada.id } }), Number((await prisma.catalogoReferenciaML.findUnique({ where: { id: gravada.id } })).preco)], [2, 29.9]);
    const quebrado = criarMLFalso({ catalogos, falhas: [{ metodo: "GET", caminho: "/products/MLBREF1/items", status: 500 }] });
    const rErro = await relerReferenciasDoProduto(quebrado, produto.id, { agora: new Date("2026-10-26T12:00:00Z"), espera: 0 });
    const depoisDoErro = await prisma.catalogoReferenciaML.findUnique({ where: { id: gravada.id } });
    conferir("reler: erro mantem o preco e grava o erro", [rErro.falhas, Number(depoisDoErro.preco), Boolean(depoisDoErro.erro), depoisDoErro.erroEm?.toISOString()], [1, 29.9, true, "2026-10-26T12:00:00.000Z"]);
    const com429 = criarMLFalso({ catalogos, falhas: [{ metodo: "GET", caminho: "/products/", status: 429 }] });
    conferir("reler: 429 para e diz o status", (await relerReferenciasDoProduto(com429, produto.id, { agora, espera: 0 })).status, 429);

    const tela = await lerReferenciasML(produto.id);
    conferir("lerReferenciasML: ordem de criacao e numeros simples", tela.map((r) => [r.catalogoId, r.primeiro?.preco ?? null, r.semAnuncios]), [["MLBREF1", 29.9, false], ["MLBVAZIO", null, true]]);
    conferir("lerReferenciasML: erro some depois de uma leitura boa", (await relerReferenciasDoProduto(ml, produto.id, { agora: new Date("2026-10-27T12:00:00Z"), espera: 0 }), (await lerReferenciasML(produto.id))[0].erro), null);

    // Revisao final: o 1o de uma referencia e o proprio dono -> a tela sabe (meu) e o ranking nao o conta como concorrente.
    const { montarRanking, catalogosDoRanking } = await import("../src/lib/canaisDeVenda/ml/ranking.js");
    await adicionarReferenciaML(ml, produto.id, { catalogoId: "MLBMEU", nome: "Eu na frente" }, { agora });
    const doMeu = (await lerReferenciasML(produto.id)).find((r) => r.catalogoId === "MLBMEU");
    conferir("referencia com o dono em 1o: marcada como meu", doMeu?.primeiro?.meu, true);
    conferir("referencia com o dono em 1o: fora da conta do ranking", montarRanking({ preco: 40, catalogos: catalogosDoRanking({ catalogoId: null }, [doMeu]) }).foraDaConta.map((c) => c.catalogoId), ["MLBMEU"]);
    await prisma.catalogoReferenciaML.deleteMany({ where: { produtoId: produto.id, catalogoId: "MLBMEU" } });

    const outro = await prisma.produto.create({ data: { sku: "ZZ-ML-R3", tituloBase: "Outro", conferido: true } });
    conferir("remover: so a do produto", (await removerReferenciaML(outro.id, gravada.id)).ok, false);
    conferir("remover: apaga com o historico", [(await removerReferenciaML(produto.id, gravada.id)).ok, await prisma.catalogoReferenciaMLHistorico.count({ where: { referenciaId: gravada.id } })], [true, 0]);
  }

  {
    console.log("\nRanking do ML: a conta (pura)");
    const { catalogosDoRanking, montarRanking, leituraAntiga } = await import("../src/lib/canaisDeVenda/ml/ranking.js");
    const lido = new Date("2026-10-23T12:00:00Z");
    const ref = (catalogoId, preco, extra = {}) => ({ id: `r-${catalogoId}`, catalogoId, nome: `Cat ${catalogoId}`, primeiro: preco === null ? null : { itemId: `I-${catalogoId}`, vendedorApelido: `V-${catalogoId}`, preco, precoCheio: null, meu: false }, semAnuncios: false, lidoEm: lido, erro: null, ...extra });
    const tela = {
      catalogoId: "MLBANUNCIO",
      catalogoNome: "Do anuncio",
      lidoEm: lido,
      posicao: { posicao: 4 },
      concorrentes: [
        { itemId: "X2", posicao: 2, ausenteDesde: null, preco: 42.99, vendedorApelido: "B" },
        { itemId: "X1", posicao: 1, ausenteDesde: null, preco: 31.99, vendedorApelido: "A" },
        { itemId: "X0", posicao: 1, ausenteDesde: lido, preco: 5, vendedorApelido: "saiu" },
      ],
    };

    const catalogos = catalogosDoRanking(tela, [ref("MLBR1", 39.54), ref("MLBANUNCIO", 1), ref("MLBR2", 42.99)]);
    conferir("catalogosDoRanking: o do anuncio primeiro, com o 1o presente; a referencia igual a ele sai", catalogos.map((c) => [c.catalogoId, c.papel, c.primeiro?.preco]), [["MLBANUNCIO", "anuncio", 31.99], ["MLBR1", "referencia", 39.54], ["MLBR2", "referencia", 42.99]]);
    conferir("catalogosDoRanking: dono em 1o no catalogo do anuncio vira meu", catalogosDoRanking({ ...tela, posicao: { posicao: 1 } }, [])[0].primeiro?.meu, true);
    conferir("catalogosDoRanking: sem catalogo do anuncio, so as referencias", catalogosDoRanking({ catalogoId: null, concorrentes: [] }, [ref("MLBR1", 39.54)]).map((c) => c.catalogoId), ["MLBR1"]);

    const r = montarRanking({ preco: 38.9, catalogos });
    conferir("montarRanking: 2o de 4", [r.posicao, r.total], [2, 4]);
    conferir("montarRanking: ordem por preco", r.linhas.map((l) => [l.tipo, l.preco]), [["catalogo", 31.99], ["voce", 38.9], ["catalogo", 39.54], ["catalogo", 42.99]]);
    conferir("montarRanking: mais barato, media e diferencas", [r.maisBarato, r.media, r.paraOMaisBarato, r.paraAMedia], [31.99, 38.17, { reais: 6.91, percentual: 21.6 }, { reais: 0.73, percentual: 1.9 }]);
    conferir("montarRanking: empate deixa o dono na frente", montarRanking({ preco: 39.54, catalogos }).linhas.map((l) => l.tipo), ["catalogo", "voce", "catalogo", "catalogo"]);

    const comMeu = catalogosDoRanking(tela, [ref("MLBR1", 39.54), { ...ref("MLBMEU", 50), primeiro: { itemId: "M", preco: 50, meu: true } }]);
    const rMeu = montarRanking({ preco: 38.9, catalogos: comMeu });
    conferir("montarRanking: dono 1o de uma referencia nao conta duas vezes", [rMeu.total, rMeu.foraDaConta.map((c) => c.catalogoId)], [3, ["MLBMEU"]]);

    const comFora = [...catalogos, ref("MLBVAZIO", null, { semAnuncios: true }), ref("MLBNUNCA", null, { lidoEm: null })];
    conferir("montarRanking: sem anuncios e nunca lido ficam fora da conta", [montarRanking({ preco: 38.9, catalogos: comFora }).total, montarRanking({ preco: 38.9, catalogos: comFora }).foraDaConta.map((c) => c.catalogoId)], [4, ["MLBVAZIO", "MLBNUNCA"]]);
    const semPreco = montarRanking({ preco: null, catalogos });
    conferir("montarRanking: sem preco, sem Voce e sem posicao", [semPreco.linhas.some((l) => l.tipo === "voce"), semPreco.posicao, semPreco.total, semPreco.paraOMaisBarato, semPreco.maisBarato], [false, null, 3, null, 31.99]);
    conferir("montarRanking: preco zero conta como sem preco", montarRanking({ preco: 0, catalogos }).posicao, null);
    conferir("montarRanking: nenhum catalogo", [montarRanking({ preco: 38.9, catalogos: [] }).total, montarRanking({ preco: 38.9, catalogos: [] }).maisBarato], [1, null]);

    conferir("leituraAntiga: 47 h nao, 49 h sim, nunca lido nao", [leituraAntiga(new Date("2026-10-21T13:00:00Z"), lido), leituraAntiga(new Date("2026-10-21T11:00:00Z"), lido), leituraAntiga(null, lido)], [false, true, false]);
  }

  {
    console.log("\nRanking do ML: rodada diaria com as referencias");
    await limpar();
    const { criarMLFalso } = await import("./lib/mlFalso.js");
    const { relerConcorrentesML } = await import("../src/lib/canaisDeVenda/ml/relerCatalogo.js");
    const item = (id, vendedor, preco) => ({ item_id: id, seller_id: vendedor, price: preco, listing_type_id: "gold_special", shipping: {} });
    const catalogos = { MLBRA: { nome: "A", itens: [item("MLBRA1", 141686451, 31.99)] }, MLBRB: { nome: "B", itens: [item("MLBRB1", 632377333, 45)] } };
    const ml = criarMLFalso({ catalogos });
    // Review Focus 1: produto so com referencias (sem catalogo do anuncio) entra na rodada.
    const soRef = await prisma.produto.create({ data: { sku: "ZZ-ML-RD1", tituloBase: "so ref", conferido: true } });
    const comAmbos = await prisma.produto.create({ data: { sku: "ZZ-ML-RD2", tituloBase: "ambos", conferido: true, mlCatalogoId: "MLB44072268" } });
    for (const [produtoId, catalogoId] of [[soRef.id, "MLBRA"], [comAmbos.id, "MLBRB"]]) await prisma.catalogoReferenciaML.create({ data: { produtoId, catalogoId } });
    const soDoTeste = { produtos: [soRef.id, comAmbos.id], forcar: true, espera: 0 };
    const agora = new Date("2026-10-23T12:00:00Z");

    const r1 = await relerConcorrentesML({ cliente: ml, agora, ...soDoTeste });
    const lidas = await prisma.catalogoReferenciaML.findMany({ where: { produtoId: { in: soDoTeste.produtos } }, orderBy: { catalogoId: "asc" } });
    conferir("rodada: le as referencias, inclusive do produto sem catalogo do anuncio", [r1.produtos, r1.ok, lidas.map((r) => [r.catalogoId, r.itemId, Number(r.preco)])], [2, 2, [["MLBRA", "MLBRA1", 31.99], ["MLBRB", "MLBRB1", 45]]]);
    conferir("rodada: o catalogo do anuncio continua relido", await prisma.concorrenteML.count({ where: { produtoId: comAmbos.id } }) > 0, true);

    const antes = (await prisma.configCanal.findUnique({ where: { canal: "MERCADO_LIVRE" }, select: { mlConcorrentesRelidosEm: true } }))?.mlConcorrentesRelidosEm?.toISOString() ?? null;
    const com429 = criarMLFalso({ catalogos, falhas: [{ metodo: "GET", caminho: "/products/MLBRA/items", status: 429 }] });
    const r2 = await relerConcorrentesML({ cliente: com429, agora: new Date("2026-10-24T12:00:00Z"), ...soDoTeste });
    const depois = (await prisma.configCanal.findUnique({ where: { canal: "MERCADO_LIVRE" }, select: { mlConcorrentesRelidosEm: true } }))?.mlConcorrentesRelidosEm?.toISOString() ?? null;
    conferir("rodada: 429 numa referencia para e nao grava a data", [Boolean(r2.parou), depois === antes], [true, true]);

    const com500 = criarMLFalso({ catalogos, falhas: [{ metodo: "GET", caminho: "/products/MLBRA/items", status: 500 }] });
    const r3 = await relerConcorrentesML({ cliente: com500, agora: new Date("2026-10-25T12:00:00Z"), ...soDoTeste });
    conferir("rodada: erro numa referencia conta como falha e segue para o proximo", [r3.falhas, r3.ok, Boolean(r3.parou)], [1, 1, false]);
  }

  {
    console.log("\nRanking do ML: coluna da lista de anuncios");
    await limpar();
    const { catalogosDeVariosProdutos } = await import("../src/lib/canaisDeVenda/ml/referencias.js");
    const { montarRanking } = await import("../src/lib/canaisDeVenda/ml/ranking.js");
    const lido = new Date("2026-10-23T12:00:00Z");
    const a = await prisma.produto.create({ data: { sku: "ZZ-ML-L1", tituloBase: "a", conferido: true, mlCatalogoId: "MLBCA", mlCatalogoNome: "Cat A" } });
    const b = await prisma.produto.create({ data: { sku: "ZZ-ML-L2", tituloBase: "b", conferido: true } });
    const semNada = await prisma.produto.create({ data: { sku: "ZZ-ML-L3", tituloBase: "c", conferido: true } });
    const concorrente = (posicao, preco, ausenteDesde = null) => ({ produtoId: a.id, itemId: `I${posicao}${preco}`, catalogoId: "MLBCA", vendedorId: "1", preco, posicao, totalNoCatalogo: 3, lidoEm: lido, ausenteDesde });
    await prisma.concorrenteML.createMany({ data: [concorrente(2, 42.99), concorrente(1, 1, lido), concorrente(3, 50)] });
    await prisma.posicaoML.create({ data: { produtoId: a.id, catalogoId: "MLBCA", posicao: null, total: 3, lidoEm: lido } });
    await prisma.catalogoReferenciaML.createMany({ data: [{ produtoId: a.id, catalogoId: "MLBRA", itemId: "R1", preco: 31.99, lidoEm: lido }, { produtoId: b.id, catalogoId: "MLBRB", itemId: "R2", preco: 45, lidoEm: lido }] });

    const mapa = await catalogosDeVariosProdutos([a.id, b.id, semNada.id]);
    conferir("catalogosDeVariosProdutos: so quem tem catalogo, na forma do ranking", [mapa.has(semNada.id), mapa.get(a.id).map((c) => [c.catalogoId, c.papel, c.primeiro?.preco]), mapa.get(b.id).map((c) => [c.catalogoId, c.primeiro?.preco])], [false, [["MLBCA", "anuncio", 42.99], ["MLBRA", "referencia", 31.99]], [["MLBRB", 45]]]);
    const r = montarRanking({ preco: 38.9, catalogos: mapa.get(a.id) });
    conferir("coluna: 2o de 3 com o preco do anuncio", [r.posicao, r.total], [2, 3]);
  }

  {
    console.log("\nRanking do ML: sugerir catalogos (mais vendidos da categoria + busca pelo titulo)");
    const { criarMLFalso } = await import("./lib/mlFalso.js");
    const { sugerirCatalogos } = await import("../src/lib/canaisDeVenda/ml/catalogo.js");
    const item = (id, vendedor, preco) => ({ item_id: id, seller_id: vendedor, price: preco, listing_type_id: "gold_special", shipping: {} });
    const catalogos = {
      MLBV1: { nome: "Mais vendido 1", busca: "", fotos: ["https://x/v1.jpg"], itens: [item("V1A", 141686451, 24.89)] },
      MLBV2: { nome: "Mais vendido 2", busca: "", itens: [item("V2A", 212386247, 30)] },
      MLBPAI: { nome: "Produto pai sem anuncios", busca: "", itens: [] },
      MLBB1: { nome: "Mega da busca", busca: "mega 2560", itens: [item("B1A", 632377333, 45)] },
      MLBV3: { nome: "Mais vendido e na busca", busca: "mega 2560", itens: [item("V3A", 632377333, 35)] },
      MLBJA: { nome: "Ja no ranking", busca: "mega 2560", itens: [item("JAA", 632377333, 10)] },
    };
    const destaques = {
      MLB99779: [
        { id: "MLBU1", type: "USER_PRODUCT", position: 1 },
        { id: "MLBV1", type: "PRODUCT", position: 2 },
        { id: "MLBITEM", type: "ITEM", position: 3 },
        { id: "MLBV3", type: "PRODUCT", position: 4 },
        { id: "MLBPAI", type: "PRODUCT", position: 5 },
        { id: "MLBV2", type: "PRODUCT", position: 6 },
      ],
    };
    const ml = criarMLFalso({ catalogos, destaques });
    const s = await sugerirCatalogos(ml, { categoriaId: "MLB99779", titulo: "Mega 2560", excluir: ["MLBJA"], meuSellerId: "212386247" });
    conferir("sugerir: mais vendidos (so catalogos) em ordem, depois a busca; sem repetidos, sem os ja usados, sem catalogo vazio", s.map((c) => [c.id, c.maisVendido, c.daBusca]), [["MLBV1", 2, false], ["MLBV3", 4, true], ["MLBV2", 6, false], ["MLBB1", null, true]]);
    conferir("sugerir: o 1o com preco, e o dono marcado", s.map((c) => [c.primeiro.preco, c.primeiro.meu]), [[24.89, false], [35, false], [30, true], [45, false]]);
    conferir("sugerir: nome e foto do mais vendido vem do produto", [s[0].nome, s[0].foto], ["Mais vendido 1", "https://x/v1.jpg"]);
    conferir("sugerir: sem categoria, so a busca", (await sugerirCatalogos(ml, { categoriaId: null, titulo: "Mega 2560", excluir: [] })).map((c) => c.id), ["MLBB1", "MLBV3", "MLBJA"]);
    conferir("sugerir: categoria sem mais vendidos (404) nao falha", (await sugerirCatalogos(ml, { categoriaId: "MLB1", titulo: "", excluir: [] })).length, 0);
    const quebrado = criarMLFalso({ catalogos, destaques, falhas: [{ metodo: "GET", caminho: "/products/MLBV1/items", status: 500 }] });
    conferir("sugerir: catalogo que falha fica de fora", (await sugerirCatalogos(quebrado, { categoriaId: "MLB99779", titulo: "", excluir: [] })).map((c) => c.id), ["MLBV3", "MLBV2"]);
    const com429 = criarMLFalso({ catalogos, destaques, falhas: [{ metodo: "GET", caminho: "/products/MLBV1/items", status: 429 }] });
    conferir("sugerir: 429 avisa (lanca)", await sugerirCatalogos(com429, { categoriaId: "MLB99779", titulo: "", excluir: [] }).then(() => "nao lancou", (erro) => erro?.status), 429);
  }

  // -------------------------------------------------------------------------
  // Proposta de anuncio (plano 2026-10-23, Tarefa 6): o preco da proposta do ML
  // -------------------------------------------------------------------------
  {
    console.log("\nProposta do ML: preço");
    const { criarMLFalso } = await import("./lib/mlFalso.js");
    const { paraBaixo5, paraCima5, precoDaPropostaML, tetoDoRanking } = await import("../src/lib/propostaDeAnuncio/preco.js");
    conferir("teto: o 5º menor", tetoDoRanking([50, 40, 30, 20, 10, 60]), 50);
    conferir("teto: com menos de 5, o maior", tetoDoRanking([30, 10, 20]), 30);
    conferir("teto: vazio", tetoDoRanking([]), null);
    conferir("de 5 em 5 centavos", [paraBaixo5(41.99), paraCima5(41.91), paraCima5(41.95), paraBaixo5(41.95)], [41.95, 41.95, 41.95, 41.95]);

    // Comissao 12%, sem tarifa fixa, frete 6,85 abaixo de R$ 79 e 12,95 dali para cima (o medido em 22/10/2026).
    const ml = criarMLFalso({ taxas: { percentualPorTipo: { gold_special: 12 } }, frete: { listCost: 12.95, listCostSemGratis: 6.85 } });
    const rascunho = { categoriaId: "MLB99779", tipoAnuncio: "gold_special", envio: { alturaCm: 5, larguraCm: 8, comprimentoCm: 8, pesoKg: 0.05, logistica: "xd_drop_off", freteGratis: false } };
    const multiplo5 = (valor) => Math.round(valor * 100) % 5 === 0;

    // O lucro da loja (pedido do dono em 05/11/2026: "o lucro no ML seja similar ao lucro na LI, nao olhar mais para regra de %"):
    // a R$ 35 com custo 20 a loja deixa 35 * 0,94 - 20 = R$ 12,90. No ML (12% + 6% de imposto, frete 6,85 abaixo de R$ 79):
    // (20 + 6,85 + 12,90) / 0,82 = 48,48, vai a 48,50 e deixa R$ 12,92.
    const top5 = await precoDaPropostaML(ml, rascunho, { custo: 20, precoNaLoja: 35, precos: [45, 48, 50, 52, 55, 70] });
    conferir("o preço do lucro da loja, de 5 em 5 centavos para cima, e a posição só informada",
      [top5.valor, top5.lucroNaLoja, top5.lucro, top5.precoNaLoja, top5.posicao, top5.total, top5.teto, top5.avisos], [48.5, 12.9, 12.92, 35, 3, 7, 55, []]);

    // O ranking nao decide mais: concorrente mais barato nao derruba o preco (so avisa), e o mais caro nao o sobe (o lucro
    // ficaria maior que o da loja, que e o que o dono recusou no MQ-4 100253).
    const caro = await precoDaPropostaML(ml, rascunho, { custo: 20, precoNaLoja: 35, precos: [30, 31, 32, 33, 34] });
    conferir("concorrentes mais baratos: o mesmo preço, e avisa que fica fora dos 5 primeiros",
      [caro.valor, caro.avisos.some((aviso) => /fica em 6º de 6/.test(aviso)), caro.avisos.some((aviso) => /%/.test(aviso))], [48.5, true, false]);
    const barato = await precoDaPropostaML(ml, rascunho, { custo: 20, precoNaLoja: 35, precos: [80, 90, 100, 110, 120] });
    conferir("concorrentes mais caros: o preço não sobe até eles", [barato.valor, barato.posicao, barato.avisos], [48.5, 1, []]);

    // Acima de R$ 79 o frete gratis obrigatorio (12,95): custo 40 e loja a R$ 70 (lucro R$ 25,80). Com o frete de 6,85 o preco
    // passaria de 79, entao vale o do frete gratis: (40 + 12,95 + 25,80) / 0,82 = 96,04, vai a 96,05.
    const acima = await precoDaPropostaML(ml, rascunho, { custo: 40, precoNaLoja: 70, precos: [] });
    conferir("acima de R$ 79: com o frete grátis na conta", [acima.valor, acima.lucro >= acima.lucroNaLoja, acima.lucroNaLoja], [96.05, true, 25.8]);

    // Arredondar cruza R$ 79: custo 30 e loja a R$ 61,60 (lucro R$ 27,90) dao 78,97, que sobe a 79,00 e liga o frete gratis.
    // Refaz com ele: (30 + 12,95 + 27,90) / 0,82 = 86,41, vai a 86,45 (a R$ 78,95 o lucro seria R$ 27,89, um centavo a menos).
    const virada = await precoDaPropostaML(ml, rascunho, { custo: 30, precoNaLoja: 61.6, precos: [] });
    conferir("arredondar cruza R$ 79: refaz com o frete grátis", [virada.valor, virada.lucro >= virada.lucroNaLoja], [86.45, true]);

    const semCusto = await precoDaPropostaML(ml, rascunho, { custo: null, precoNaLoja: 35, precos: [45] });
    conferir("sem custo: sem preço e avisa", [semCusto.valor, semCusto.avisos.some((aviso) => /custo/.test(aviso))], [null, true]);
    const semLoja = await precoDaPropostaML(ml, rascunho, { custo: 20, precoNaLoja: null, precos: [45] });
    conferir("sem preço na loja: sem preço e avisa", [semLoja.valor, semLoja.avisos.some((aviso) => /preço de venda do produto/.test(aviso))], [null, true]);
    const semLucro = await precoDaPropostaML(ml, rascunho, { custo: 20, precoNaLoja: 20, precos: [] });
    conferir("loja sem lucro: sem preço e avisa", [semLucro.valor, semLucro.lucroNaLoja, semLucro.avisos.some((aviso) => /não dá lucro/.test(aviso))], [null, -1.2, true]);

    const sozinho = await precoDaPropostaML(ml, rascunho, { custo: 20, precoNaLoja: 35, precos: [] });
    conferir("sem concorrente: o mesmo preço, sem aviso", [sozinho.valor, sozinho.teto, sozinho.avisos], [48.5, null, []]);

    // As variantes (definicao do dono em 08/11/2026): o preco sem frete abaixo de R$ 72 fica Classico sem frete; de 72 a 78,99 sobe
    // para R$ 79 com frete gratis (piso); de 79 em diante e com frete gratis. A proposta devolve a variante que o preco pede.
    conferir("variante: abaixo de R$ 72 e o Classico sem frete", [top5.variante, top5.freteGratis], ["classico_sem_frete", false]);
    const abaixo72 = await precoDaPropostaML(ml, rascunho, { custo: 30, precoNaLoja: 55, precos: [] });
    conferir("variante: R$ 71,45 continua sem frete", [abaixo72.valor, abaixo72.variante, abaixo72.freteGratis], [71.45, "classico_sem_frete", false]);
    const piso = await precoDaPropostaML(ml, rascunho, { custo: 30, precoNaLoja: 58, precos: [] });
    conferir("variante: preco sem frete entre 72 e 79 sobe para R$ 79 com frete gratis (piso) e avisa", [piso.valor, piso.variante, piso.freteGratis, piso.avisos.some((aviso) => /79/.test(aviso))], [79, "classico_frete_gratis", true, true]);
    conferir("variante: de 79 em diante e com frete gratis", [acima.variante, acima.freteGratis, virada.variante], ["classico_frete_gratis", true, "classico_frete_gratis"]);
    conferir("variante: sem preco, nenhuma", [semCusto.variante, semCusto.freteGratis], [null, false]);

    conferir("todo preço de 5 em 5 centavos", [top5, caro, acima, virada, sozinho, abaixo72, piso].every((resultado) => multiplo5(resultado.valor)), true);
  }

  // -------------------------------------------------------------------------
  // Proposta de anuncio (plano 2026-10-23, Tarefa 7): ler e gravar a proposta do ML
  // -------------------------------------------------------------------------
  {
    console.log("\nProposta do ML: ler e gravar");
    // Modelo e Microcontrolador pelas especificacoes da descricao (pedido do dono em 03/11/2026).
    const { completarFichaPelaDescricao, fichaDaDescricao } = await import("../src/lib/canaisDeVenda/ml/atributos.js");
    const descricaoDaPlaca = "PLACA\n\nEspecificações técnicas:\n- Fabricante: OEM;\n- Chip de Interface USB: CH340;\n- Processador: Xtensa LX6;\n- Chip: ESP32-D0WD;\n- Modelo: DevKit V1;\n\nGarantia:\n- 90 dias;";
    conferir("ficha pela descricao: o Modelo e o Chip (antes do Processador; o chip USB nao conta)", fichaDaDescricao(descricaoDaPlaca), { MODEL: "DevKit V1", MICROCONTROLLER: "ESP32-D0WD", tensaoLimite: null });
    conferir("ficha pela descricao: CI e Microcontrolador tambem valem; sem as linhas, null",
      [fichaDaDescricao("- CI: ATtiny85;").MICROCONTROLLER, fichaDaDescricao("- Microcontrolador: ATmega328P;\n- CI: X;").MICROCONTROLLER, fichaDaDescricao("Texto sem ficha")],
      ["ATtiny85", "ATmega328P", { MODEL: null, MICROCONTROLLER: null, tensaoLimite: null }]);
    // Tensao limite pela tensao de trabalho (pedido do dono em 03/11/2026): o maior valor; com "limite" na linha, o do limite.
    const { tensaoLimite } = await import("../src/lib/canaisDeVenda/ml/atributos.js");
    conferir("tensao limite: faixa da o maior, tensao unica da ela mesma, o limite escrito vence",
      [tensaoLimite("5V a 12V"), tensaoLimite("5V"), tensaoLimite("7V a 12V pelo VIN / 5V pela USB"), tensaoLimite("7V a 12V por VIN ou jack (limite 6V a 20V) / 5V pela USB"), tensaoLimite("3,3V a 30VDC"), tensaoLimite("100 a 240VAC"), tensaoLimite("sem número")],
      ["12V", "5V", "12V", "20V", "30V", "240V", null]);
    conferir("completar: a tensao limite vem da Tensao de Alimentacao, so na categoria que tem o campo",
      [completarFichaPelaDescricao({}, [{ id: "MICROCONTROLLER_BOARD_LIMIT_INPUT_VOLTAGE" }], "- Tensão de Alimentação: 7V a 12V pelo VIN / 5V pela USB;"),
        completarFichaPelaDescricao({}, [{ id: "MODEL" }], "- Tensão de Alimentação: 5V;"),
        completarFichaPelaDescricao({ MICROCONTROLLER_BOARD_LIMIT_INPUT_VOLTAGE: "35V" }, [{ id: "MICROCONTROLLER_BOARD_LIMIT_INPUT_VOLTAGE" }], "- Tensão de Trabalho: 5V;")],
      [{ MICROCONTROLLER_BOARD_LIMIT_INPUT_VOLTAGE: "12V" }, {}, {}]);
    conferir("completar: so o que falta e so o que a categoria tem",
      [completarFichaPelaDescricao({ MODEL: "UNO R3" }, [{ id: "MODEL" }, { id: "MICROCONTROLLER" }], descricaoDaPlaca), completarFichaPelaDescricao({}, [{ id: "MODEL" }], descricaoDaPlaca)],
      [{ MICROCONTROLLER: "ESP32-D0WD" }, { MODEL: "DevKit V1" }]);
    // Fabricante = Marca (pedido do dono em 05/11/2026), so vazio e so na categoria que tem o campo.
    conferir("completar: o Fabricante vazio recebe a Marca; preenchido, \"Nao se aplica\" ou sem o campo na categoria, nao",
      [completarFichaPelaDescricao({ BRAND: "OEM" }, [{ id: "BRAND" }, { id: "MANUFACTURER" }], ""),
        completarFichaPelaDescricao({ BRAND: "OEM", MANUFACTURER: "ESPRESSIF" }, [{ id: "MANUFACTURER" }], ""),
        completarFichaPelaDescricao({ BRAND: "OEM", MANUFACTURER: "-1" }, [{ id: "MANUFACTURER" }], ""),
        completarFichaPelaDescricao({ BRAND: "OEM" }, [{ id: "BRAND" }], ""),
        completarFichaPelaDescricao({}, [{ id: "MANUFACTURER" }], "")],
      [{ MANUFACTURER: "OEM" }, {}, {}, {}, {}]);
    // Temperatura minima e maxima de operacao pela linha da descricao (pedido do dono em 05/11/2026).
    const { temperaturaDeOperacao } = await import("../src/lib/canaisDeVenda/ml/atributos.js");
    conferir("temperatura de operacao: as grafias das lojas, a faixa antes do ' / ' e o que nao e faixa",
      [temperaturaDeOperacao("- Temperatura de Operação: 0°C a 40°C;"),
        temperaturaDeOperacao("- Temperatura de Operação: -25°C a 70°C / potência total até 50°C;"),
        temperaturaDeOperacao("- Temperatura de trabalho: -10ºC à 85ºC;"),
        temperaturaDeOperacao("- Temperatura de Operação: -20°C ~ 60°C;"),
        temperaturaDeOperacao("- Temperatura de Operação: 0 °C a +40 °C;"),
        temperaturaDeOperacao("- Temperatura de Operação: -10 a 60°C;"),
        temperaturaDeOperacao("- Temperatura de Operação: 25°C;"),
        temperaturaDeOperacao("- Temperatura de Armazenamento: -20°C a 85°C;")],
      [{ minima: "0°C", maxima: "40°C" }, { minima: "-25°C", maxima: "70°C" }, { minima: "-10°C", maxima: "85°C" },
        { minima: "-20°C", maxima: "60°C" }, { minima: "0°C", maxima: "40°C" }, { minima: "-10°C", maxima: "60°C" }, null, null]);
    const temperaturaDaCategoria = [{ id: "MIN_OPERATING_TEMPERATURE", unidades: ["°C", "°F"] }, { id: "MAX_OPERATING_TEMPERATURE", unidades: ["°C", "°F"] }];
    conferir("completar: a temperatura minima e a maxima so vazias e so na categoria que tem os campos",
      [completarFichaPelaDescricao({}, temperaturaDaCategoria, "- Temperatura de Operação: 0°C a 40°C;"),
        completarFichaPelaDescricao({ MAX_OPERATING_TEMPERATURE: "50°C" }, temperaturaDaCategoria, "- Temperatura de Operação: 0°C a 40°C;"),
        completarFichaPelaDescricao({}, [{ id: "MODEL" }], "- Temperatura de Operação: 0°C a 40°C;"),
        completarFichaPelaDescricao({}, [{ id: "MIN_OPERATING_TEMPERATURE", unidades: ["°F"] }], "- Temperatura de Operação: 0°C a 40°C;")],
      [{ MIN_OPERATING_TEMPERATURE: "0°C", MAX_OPERATING_TEMPERATURE: "40°C" }, { MIN_OPERATING_TEMPERATURE: "0°C" }, {}, {}]);
    await limpar();
    const { criarMLFalso } = await import("./lib/mlFalso.js");
    const { gravarPropostaML, lerParaPropostaML } = await import("../src/lib/propostaDeAnuncio/ml.js");
    const { INCLUDE_DO_ICONE_BLING } = await import("../src/lib/blingSync/estado.js");
    const { assinaturaDoRise, normalizarDoRise, normalizarFornecedoresDoRise } = await import("../src/lib/blingSync/campos.js");
    const criarPronto = async (sku, extra = {}) => {
      const criado = await prisma.produto.create({
        data: { sku, tituloBase: "PLACA UNO R3 CH340 ZZ", descricaoBase: "Placa de teste.", marca: "ARDUINO", modelo: "UNO R3", conferido: true, custo: 20, precoVenda: 49, estoque: 5, pesoKg: 0.05, alturaCm: 5, larguraCm: 8, comprimentoCm: 8, ...extra },
      });
      const lido = await prisma.produto.findUnique({ where: { id: criado.id }, include: INCLUDE_DO_ICONE_BLING });
      await prisma.produto.update({ where: { id: criado.id }, data: { blingSincronizadoEm: new Date(), blingAssinatura: assinaturaDoRise(normalizarDoRise(lido), normalizarFornecedoresDoRise(lido.fornecedores)) } });
      return criado;
    };
    const item = (id, vendedor, preco) => ({ item_id: id, seller_id: vendedor, price: preco, listing_type_id: "gold_special", category_id: "MLB99779", shipping: {} });
    const varios = (prefixo, n, primeiro) => Array.from({ length: n }, (_, i) => item(`${prefixo}${i}`, 141686451, primeiro + i));
    const catalogos = {
      MLBP9: { nome: "Placa nove", busca: "placa uno r3 ch340 zz", itens: varios("P9", 9, 55) },
      MLBP4: { nome: "Placa quatro", busca: "", itens: varios("P4", 4, 40) },
      MLBP6: { nome: "Placa seis", busca: "", itens: varios("P6", 6, 60) },
    };
    const ml = (extra = {}) => criarMLFalso({ catalogos, ...extra });
    const erroDe = async (promessa) => promessa.then(() => null, (erro) => erro.message);
    const ATRIBUTOS = { BRAND: "ARDUINO", MODEL: "UNO R3" };

    const produto = await criarPronto("ZZ-ML-PA1");
    const lida = await lerParaPropostaML(ml(), "ZZ-ML-PA1");
    conferir("ler: custo, categoria candidata e os atributos dela", [lida.produto.custo, lida.categorias[0]?.categoriaId, lida.atributos.some((a) => a.id === "BRAND")], [20, "MLB99779", true]);
    // O que a IA precisa saber ANTES de propor (pedido do dono em 08/11/2026: "consulta no ML primeiro se tem anuncio daquele
    // produto e reaproveitar"): os anuncios do codigo na conta fora do Rise, os do Rise e as regras das variantes.
    conferir("ler: anuncios na conta, do Rise e as regras das variantes", [lida.anunciosNaConta, lida.anunciosNoRise, lida.regrasDasVariantes?.length > 0], [[], [], true]);
    await criarPronto("ZZ-ML-PA12");
    const lidaComConta = await lerParaPropostaML(ml({ meusItens: { "ZZ-ML-PA12": [{ id: "MLB5550012", title: "Placa antiga 12", price: 89.9, listing_type_id: "gold_special", shipping: { free_shipping: true }, sold_quantity: 7, status: "active", seller_custom_field: "ZZ-ML-PA12", permalink: "https://produto.mercadolivre.com.br/MLB-5550012" }] } }), "ZZ-ML-PA12");
    conferir("ler: anuncio da conta com a variante em texto e o aviso", [lidaComConta.anunciosNaConta.map((c) => [c.id, c.variante, c.vendidos]), lidaComConta.avisos.some((aviso) => /MLB5550012/.test(aviso))], [[["MLB5550012", "Clássico + frete grátis", 7]], true]);
    // A IA reaproveita pelo MCP (reaproveitarAnuncioML): o anuncio da conta vira anuncio do Rise e sai de anunciosNaConta.
    const { reaproveitarParaProposta } = await import("../src/lib/propostaDeAnuncio/ml.js");
    const mlPA12 = ml({ meusItens: { "ZZ-ML-PA12": [{ id: "MLB5550012", title: "Placa antiga 12", price: 89.9, listing_type_id: "gold_special", shipping: { free_shipping: true }, sold_quantity: 7, status: "active", seller_custom_field: "ZZ-ML-PA12", permalink: "https://produto.mercadolivre.com.br/MLB-5550012", category_id: "MLB99779", date_created: "2025-01-01T00:00:00.000Z" }] } });
    const reaproveitado = await reaproveitarParaProposta(mlPA12, "ZZ-ML-PA12", "MLB5550012");
    const relida = await lerParaPropostaML(mlPA12, "ZZ-ML-PA12");
    conferir("reaproveitar pela IA: vira anuncio do Rise e sai da conta", [typeof reaproveitado.anuncioId, reaproveitado.variante, relida.anunciosNaConta.length, relida.anunciosNoRise.map((a) => [a.mlb, a.status, a.variante])], ["string", "Clássico + frete grátis", 0, [["MLB5550012", "PUBLICADO", "Clássico + frete grátis"]]]);
    conferir("reaproveitar pela IA: MLB de outro SKU e recusado com o motivo", await reaproveitarParaProposta(mlPA12, "ZZ-ML-PA1", "MLB5550012").then(() => "aceitou", (erro) => (/SKU|Rise/.test(erro.message) ? "recusou" : erro.message)), "recusou");

    const gravada = await gravarPropostaML(ml(), "ZZ-ML-PA1", { categoriaId: "MLB99779", titulo: "Placa Uno R3 CH340 compatível", atributos: { ...ATRIBUTOS, GTIN: "7890000000000", EMPTY_GTIN_REASON: "x" }, catalogos: ["MLBP9", "MLBP4", "MLBP6"], relatorio: "- teste" });
    const anuncio = await prisma.anuncio.findUnique({ where: { id: gravada.anuncioId } });
    conferir(
      "gravar: Clássico com categoria, título, ficha e preço",
      [anuncio.status, anuncio.dados.tipoAnuncio, anuncio.categoriaExternaId, anuncio.titulo, anuncio.atributos.BRAND, anuncio.dados.preco, gravada.preco.valor],
      // O lucro da loja (R$ 49 com custo 20: R$ 26,06; regra do dono de 05/11/2026) com 13% de comissao e frete de 6,85:
      // (20 + 6,85 + 26,06) / 0,81 = 65,33, vai a 65,35. O titulo e o do produto base, e o que a LLM mandou ("Placa Uno R3
      // CH340 compatível") e ignorado e avisado (regra do dono de 24/10/2026).
      ["RASCUNHO", "gold_special", "MLB99779", "PLACA UNO R3 CH340 ZZ", "ARDUINO", 65.35, 65.35],
    );
    // A variante (pedido do dono em 08/11/2026: "pode sempre criar as propostas com as variantes"): R$ 65,35 e o Classico sem frete.
    conferir("variante: abaixo de R$ 72 o rascunho fica sem frete gratis", [gravada.preco.variante, anuncio.dados.envio.freteGratis], ["classico_sem_frete", false]);
    // Loja a R$ 58 (custo 20): sem frete daria (6,85 + 58 x 0,94) / 0,81 = 75,77, entre 72 e 79: sobe para R$ 79 com frete gratis.
    await criarPronto("ZZ-ML-PA9", { precoVenda: 58 });
    const comPiso = await gravarPropostaML(ml(), "ZZ-ML-PA9", { categoriaId: "MLB99779", atributos: ATRIBUTOS, catalogos: [] });
    const anuncioComPiso = await prisma.anuncio.findUnique({ where: { id: comPiso.anuncioId } });
    conferir("variante: entre 72 e 79 o rascunho sobe para R$ 79 com frete gratis e avisa", [comPiso.preco.valor, comPiso.preco.variante, anuncioComPiso.dados.preco, anuncioComPiso.dados.envio.freteGratis, anuncioComPiso.dados.tipoAnuncio, comPiso.avisos.some((aviso) => /R\$ 79/.test(aviso.replace(/ /g, " ")))], [79, "classico_frete_gratis", 79, true, "gold_special", true]);
    // Premium (decisao do dono em 08/11/2026): com o Classico a R$ 150 ou mais, a proposta grava TAMBEM o Premium com frete gratis,
    // com o preco do mesmo lucro (a comissao do Premium e maior). Gravar de novo atualiza os mesmos dois rascunhos.
    await criarPronto("ZZ-ML-PA11", { precoVenda: 180 });
    const comPremium = await gravarPropostaML(ml(), "ZZ-ML-PA11", { categoriaId: "MLB99779", atributos: ATRIBUTOS, catalogos: [] });
    const premium = comPremium.premium?.anuncioId ? await prisma.anuncio.findUnique({ where: { id: comPremium.premium.anuncioId } }) : null;
    conferir("premium: Classico a 150 ou mais grava tambem o Premium com frete gratis e preco maior", [comPremium.preco.valor >= 150, comPremium.preco.variante, premium?.dados?.tipoAnuncio, premium?.dados?.envio?.freteGratis, premium?.dados?.preco > comPremium.preco.valor, Boolean(premium?.dados?.proposta), comPremium.premium?.preco?.variante], [true, "classico_frete_gratis", "gold_pro", true, true, true, "premium_frete_gratis"]);
    await gravarPropostaML(ml(), "ZZ-ML-PA11", { categoriaId: "MLB99779", atributos: ATRIBUTOS, catalogos: [] });
    const produtoPA11 = await prisma.produto.findFirst({ where: { sku: "ZZ-ML-PA11" }, select: { id: true } });
    const rascunhosPA11 = await prisma.anuncio.findMany({ where: { produtoId: produtoPA11.id, canal: "MERCADO_LIVRE" }, select: { dados: true } });
    conferir("premium: gravar de novo nao duplica (um Classico e um Premium)", rascunhosPA11.map((anuncio) => anuncio.dados.tipoAnuncio).sort(), ["gold_pro", "gold_special"]);
    conferir("premium: abaixo de 150 nao grava Premium", [gravada.premium ?? null], [null]);

    // O Classico da variante ja esta no Rise publicado (reaproveitado ou publicado antes): a proposta nao cria outro Classico, avisa
    // e cuida so do que falta (aqui, o Premium).
    const classicoPA11 = (await prisma.anuncio.findMany({ where: { produtoId: produtoPA11.id, canal: "MERCADO_LIVRE" } })).find((anuncio) => anuncio.dados.tipoAnuncio === "gold_special");
    await prisma.anuncio.update({ where: { id: classicoPA11.id }, data: { status: "PUBLICADO", idExterno: "MLB5550099", dados: { ...classicoPA11.dados, publicacao: { itemId: "MLB5550099" } } } });
    const soPremium = await gravarPropostaML(ml(), "ZZ-ML-PA11", { categoriaId: "MLB99779", atributos: ATRIBUTOS, catalogos: [] });
    const depois = await prisma.anuncio.findMany({ where: { produtoId: produtoPA11.id, canal: "MERCADO_LIVRE" }, select: { dados: true, status: true } });
    conferir("ja publicado na variante: nao cria outro Classico, avisa e atualiza o Premium", [soPremium.anuncioId, soPremium.avisos.some((aviso) => /MLB5550099/.test(aviso) && /já/.test(aviso)), depois.length, Boolean(soPremium.premium?.anuncioId)], [null, true, 2, true]);

    // A conta ja tem anuncio do codigo fora do Rise: a proposta avisa (com o MLB) e devolve a lista, para o dono reaproveitar
    // em vez de publicar outro igual.
    await criarPronto("ZZ-ML-PA10");
    const naConta = { id: "MLB5550001", title: "Placa antiga", price: 39.9, listing_type_id: "gold_special", shipping: { free_shipping: false }, sold_quantity: 3, status: "active", seller_custom_field: "ZZ-ML-PA10", permalink: "https://produto.mercadolivre.com.br/MLB-5550001", category_id: "MLB99779" };
    const comAntigo = await gravarPropostaML(ml({ meusItens: { "ZZ-ML-PA10": [naConta] } }), "ZZ-ML-PA10", { categoriaId: "MLB99779", atributos: ATRIBUTOS, catalogos: [] });
    conferir("proposta: a conta ja tem anuncio do codigo fora do Rise, avisa com o MLB e devolve a lista", [comAntigo.avisos.some((aviso) => /MLB5550001/.test(aviso) && /Reaproveit/i.test(aviso)), comAntigo.anunciosNaConta?.map((c) => c.id)], [true, ["MLB5550001"]]);
    conferir("proposta: sem anuncio na conta, nada a avisar", [gravada.avisos.some((aviso) => /fora do Rise/.test(aviso)), gravada.anunciosNaConta], [false, []]);
    conferir("titulo: o da LLM é ignorado e avisado, sem marca de proposta no campo", [gravada.titulo, gravada.avisos.some((a) => /título enviado foi ignorado/.test(a)), gravada.campos.includes("titulo")], ["PLACA UNO R3 CH340 ZZ", true, false]);
    conferir("GTIN e o motivo mandados pela LLM ficam fora", [anuncio.atributos.GTIN ?? null, anuncio.atributos.EMPTY_GTIN_REASON ?? null], [null, null]);
    conferir("catálogos: só os de 5 ou mais anúncios, o de 4 avisado", [gravada.catalogosSugeridos.map((c) => c.catalogoId), gravada.avisos.some((a) => /MLBP4/.test(a) && /menos de 5/.test(a))], [["MLBP9", "MLBP6"], true]);
    conferir("o ranking do produto continua vazio", await prisma.catalogoReferenciaML.count({ where: { produtoId: produto.id } }), 0);
    // A versao vem da constante: o numero fixo quebrava a cada mudanca de regra do roteiro (4 -> 5 em 25/10/2026).
    const { VERSAO_ROTEIRO_ML } = await import("../src/lib/propostaDeAnuncio/roteiros.js");
    conferir("a proposta guardada com o preço, os dois lucros e os catálogos",
      [anuncio.dados.proposta.preco.valor, anuncio.dados.proposta.preco.lucroNaLoja, anuncio.dados.proposta.preco.lucro >= 26.06, anuncio.dados.proposta.catalogosSugeridos.length, anuncio.dados.proposta.versaoDoRoteiro],
      [65.35, 26.06, true, 2, VERSAO_ROTEIRO_ML]);

    // Um rascunho antigo da proposta, com outro titulo, volta ao nome do produto (o titulo nao e proposta fora do kit).
    await prisma.anuncio.update({ where: { id: gravada.anuncioId }, data: { titulo: "Titulo antigo da proposta" } });
    const deNovo = await gravarPropostaML(ml(), "ZZ-ML-PA1", { categoriaId: "MLB99779", atributos: ATRIBUTOS, catalogos: ["MLBP9"], relatorio: "- de novo" });
    conferir("o Clássico em rascunho é atualizado (o mesmo anúncio)", [deNovo.anuncioId, await prisma.anuncio.count({ where: { produtoId: produto.id, canal: "MERCADO_LIVRE" } })], [gravada.anuncioId, 1]);
    conferir(
      "sem titulo na chamada: o rascunho volta ao nome do produto, sem aviso de titulo ignorado",
      [(await prisma.anuncio.findUnique({ where: { id: gravada.anuncioId } })).titulo, deNovo.titulo, deNovo.avisos.some((a) => /título enviado/.test(a))],
      ["PLACA UNO R3 CH340 ZZ", "PLACA UNO R3 CH340 ZZ", false],
    );

    // Composicao (kit): a LLM propoe o titulo, e ele entra no rascunho com a marca de proposta.
    await criarPronto("ZZ-ML-PA6", { tituloBase: "KIT ZZ", tipo: "COMPOSICAO" });
    const lidaKit = await lerParaPropostaML(ml(), "ZZ-ML-PA6");
    const kit = await gravarPropostaML(ml(), "ZZ-ML-PA6", { categoriaId: "MLB99779", titulo: "  Kit  Placa Uno R3 com 2 cabos  ", atributos: ATRIBUTOS, catalogos: [] });
    const anKit = await prisma.anuncio.findUnique({ where: { id: kit.anuncioId } });
    conferir(
      "composição (kit): o título da LLM vale (espaços ajustados) e marca o campo",
      [lidaKit.produto.composicao, lida.produto.composicao, anKit.titulo, kit.titulo, kit.campos.includes("titulo")],
      [true, false, "Kit Placa Uno R3 com 2 cabos", "Kit Placa Uno R3 com 2 cabos", true],
    );
    const kitSemTitulo = await gravarPropostaML(ml(), "ZZ-ML-PA6", { categoriaId: "MLB99779", atributos: ATRIBUTOS, catalogos: [] });
    conferir("composição (kit) sem título na chamada: fica o nome do produto", kitSemTitulo.titulo, "KIT ZZ");

    // Kit no ML (pedido do dono em 28/10/2026: "anuncio no ML com 10 pecas do 900211 ... vinculando o kit ao produto base
    // para controle de estoque"): o anuncio do PROPRIO produto com o Kit de 10, sem produto novo no Rise.
    const barra = await criarPronto("ZZ-ML-PA8", { tituloBase: "BARRA ZZ 1X15", custo: 0.5, precoVenda: 1.5, estoque: 205, pesoKg: 0.001, alturaCm: 1.16, larguraCm: 0.23, comprimentoCm: 3.85 });
    const lidaKitML = await lerParaPropostaML(ml(), "ZZ-ML-PA8", { quantidade: 10 });
    // A leitura do kit tambem olha a conta (dono, 09/11/2026): o kit antigo codigo_N aparece com a quantidade e o aviso.
    const kitAntigoPA8 = { id: "MLB5558020", title: "20x Barra ZZ 1x15", price: 24.9, listing_type_id: "gold_special", shipping: { free_shipping: false }, sold_quantity: 10, status: "paused", seller_custom_field: "ZZ-ML-PA8_20", permalink: "https://produto.mercadolivre.com.br/MLB5558020" };
    const lidaKitConta = await lerParaPropostaML(ml({ meusItens: { "ZZ-ML-PA8_20": [kitAntigoPA8] } }), "ZZ-ML-PA8", { quantidade: 10 });
    conferir("kit no ML: a leitura mostra o kit antigo da conta com a quantidade", [lidaKitConta.anunciosNaConta.map((c) => [c.id, c.kit, c.variante]), lidaKitConta.avisos.some((aviso) => /MLB5558020/.test(aviso) && /kit de 20/.test(aviso))], [[["MLB5558020", 20, "Clássico sem frete (kit de 20)"]], true]);
    conferir(
      "kit no ML: a leitura dá o custo das 10, o código e o título de partida, e libera o título",
      [lidaKitML.produto.composicao, lidaKitML.produto.custo, lidaKitML.produto.kit],
      [true, 5, { quantidade: 10, codigo: "ZZ-ML-PA8_10", custoUnitario: 0.5, tituloDePartida: "10x BARRA ZZ 1X15" }],
    );
    const simplesDaBarra = await gravarPropostaML(ml(), "ZZ-ML-PA8", { categoriaId: "MLB99779", atributos: ATRIBUTOS, catalogos: [] });
    const kitML = await gravarPropostaML(ml(), "ZZ-ML-PA8", { quantidade: 10, categoriaId: "MLB99779", titulo: " Kit 10 Barra ZZ 1x15 ", atributos: ATRIBUTOS, catalogos: [] });
    const anKitML = await prisma.anuncio.findUnique({ where: { id: kitML.anuncioId } });
    conferir(
      "kit no ML: o anúncio do próprio produto com o Kit de 10, o título da LLM e o estoque que o produto monta",
      [anKitML.produtoId === barra.id, anKitML.dados.composicao.codigo, anKitML.dados.composicao.itens, anKitML.titulo, anKitML.dados.estoque, kitML.kit, kitML.campos.includes("titulo")],
      [true, "ZZ-ML-PA8_10", [{ produtoId: barra.id, quantidade: 10 }], "Kit 10 Barra ZZ 1x15", 20, { quantidade: 10, codigo: "ZZ-ML-PA8_10" }, true],
    );
    conferir("kit no ML: nenhum produto novo no Rise", await prisma.produto.count({ where: { sku: { startsWith: "ZZ-ML-PA8" } } }), 1);
    conferir("kit no ML: o anúncio simples do produto fica à parte", [simplesDaBarra.anuncioId !== kitML.anuncioId, (await prisma.anuncio.findUnique({ where: { id: simplesDaBarra.anuncioId } })).dados.composicao ?? null], [true, null]);
    // O kit repete o lucro de vender as 10 na loja (10 x R$ 1,50 com custo R$ 5: R$ 9,10, dez vezes o de uma, R$ 0,91):
    // (5 + 6,85 + 9,10) / 0,81 = 25,87, vai a 25,90. O de 1 unidade: (0,50 + 6,85 + 0,91) / 0,81 = 10,20.
    conferir("kit no ML: o preço pelo lucro das 10 unidades na loja",
      [kitML.preco.valor, kitML.preco.lucroNaLoja, simplesDaBarra.preco.valor, simplesDaBarra.preco.lucroNaLoja, kitML.preco.valor === anKitML.dados.preco], [25.9, 9.1, 10.2, 0.91, true]);
    conferir("kit no ML: peso das 10 unidades no envio", anKitML.dados.envio.pesoKg, 0.01);

    const kitDeNovo = await gravarPropostaML(ml(), "ZZ-ML-PA8", { quantidade: 10, categoriaId: "MLB99779", atributos: ATRIBUTOS, catalogos: [] });
    conferir("kit no ML de novo: o mesmo anúncio, com o título de partida", [kitDeNovo.anuncioId, kitDeNovo.titulo], [kitML.anuncioId, "10x BARRA ZZ 1X15"]);
    const kitDe5 = await gravarPropostaML(ml(), "ZZ-ML-PA8", { quantidade: 5, categoriaId: "MLB99779", atributos: ATRIBUTOS, catalogos: [] });
    conferir("kit no ML de outra quantidade: outro anúncio", [kitDe5.anuncioId !== kitML.anuncioId, kitDe5.kit.codigo], [true, "ZZ-ML-PA8_5"]);
    conferir("kit no ML de 1 unidade recusa", /quantidade|unidades/.test(await erroDe(gravarPropostaML(ml(), "ZZ-ML-PA8", { quantidade: 1, categoriaId: "MLB99779", atributos: ATRIBUTOS, catalogos: [] }))), true);
    conferir("kit no ML de um produto que já é kit recusa", /já é um kit/.test(await erroDe(lerParaPropostaML(ml(), "ZZ-ML-PA6", { quantidade: 10 }))), true);

    // Nome do produto maior que o limite da categoria: nao se corta, avisa para encurtar no cadastro do produto.
    await criarPronto("ZZ-ML-PA7", { tituloBase: "PLACA COMPATIVEL ARDUINO UNO R3 ATMEGA328P DIP ATMEGA16U2 COM CABO USB EXTRA LONGO" });
    const longo = await gravarPropostaML(ml(), "ZZ-ML-PA7", { categoriaId: "MLB99779", atributos: ATRIBUTOS, catalogos: [] });
    conferir("nome do produto acima do limite: grava inteiro e avisa", [longo.titulo.length > 60, longo.avisos.some((a) => /encurte o nome no cadastro do produto/.test(a))], [true, true]);

    conferir("categoria que não é folha", /folha/.test(await erroDe(gravarPropostaML(ml(), "ZZ-ML-PA1", { categoriaId: "MLB1648", titulo: "x", atributos: {}, catalogos: [] }))), true);
    await criarPronto("ZZ-ML-PA5", { modelo: null });
    const faltando = await gravarPropostaML(ml(), "ZZ-ML-PA5", { categoriaId: "MLB99779", titulo: "Placa", atributos: { BRAND: "ARDUINO" }, catalogos: [] });
    conferir("atributo obrigatório faltando: grava e avisa", faltando.avisos.some((a) => /MODEL/.test(a)), true);

    const p2 = await criarPronto("ZZ-ML-PA2");
    const links = [1, 2, 3, 4, 5].map((n) => ({ url: `https://loja${n}.invalid/p`, titulo: `Placa ${n}`, preco: 60 + n }));
    const semCatalogo = await gravarPropostaML(ml(), "ZZ-ML-PA2", { categoriaId: "MLB99779", titulo: "Placa", atributos: ATRIBUTOS, catalogos: [], linksSemCatalogo: links });
    const an2 = await prisma.anuncio.findUnique({ where: { id: semCatalogo.anuncioId } });
    conferir("sem catálogo: o preço pelos links, os links só na proposta", [semCatalogo.preco.teto, an2.dados.proposta.links.length, await prisma.catalogoReferenciaML.count({ where: { produtoId: p2.id } })], [65, 5, 0]);

    const p3 = await criarPronto("ZZ-ML-PA3");
    await prisma.anuncio.create({ data: { produtoId: p3.id, canal: "MERCADO_LIVRE", status: "PUBLICADO", titulo: "Publicado", idExterno: "MLB1", dados: { tipoAnuncio: "gold_special", preco: 99 } } });
    const aoLado = await gravarPropostaML(ml(), "ZZ-ML-PA3", { categoriaId: "MLB99779", titulo: "Placa", atributos: ATRIBUTOS, catalogos: [] });
    const publicado = await prisma.anuncio.findFirst({ where: { produtoId: p3.id, status: "PUBLICADO" } });
    conferir("só publicado: cria um rascunho novo e não toca no publicado", [aoLado.anuncioId !== publicado.id, publicado.dados.preco, publicado.dados.proposta ?? null], [true, 99, null]);

    const com429 = ml({ falhas: [{ metodo: "GET", caminho: "/products/MLBP6/items", status: 429 }] });
    const parcial = await gravarPropostaML(com429, "ZZ-ML-PA1", { categoriaId: "MLB99779", titulo: "Placa", atributos: ATRIBUTOS, catalogos: ["MLBP9", "MLBP6"] });
    conferir("429 num catálogo: grava com os outros e avisa", [parcial.catalogosSugeridos.map((c) => c.catalogoId), parcial.avisos.some((a) => /não foi lido/.test(a))], [["MLBP9"], true]);

    await prisma.produto.create({ data: { sku: "ZZ-ML-PA4", tituloBase: "NAO CONFERIDO" } });
    conferir("não Conferido recusa", /Conferido/.test(await erroDe(gravarPropostaML(ml(), "ZZ-ML-PA4", { categoriaId: "MLB99779", titulo: "x", atributos: {}, catalogos: [] }))), true);
  }

  {
    console.log("\nAnuncio publicado acompanha o produto (regras)");
    const { conteudoAtualDoAnuncio, mudancasDoAnuncio } = await import("../src/lib/canaisDeVenda/ml/acompanhar.js");
    const { impressaoDoConteudo } = await import("../src/lib/canaisDeVenda/ml/impressao.js");
    const { fotosDoRise } = await import("../src/lib/canaisDeVenda/ml/rascunho.js");

    const base = { descricao: "a".repeat(32), fotos: ["f1.jpg", "f2.jpg"], pacote: { alturaCm: 2, larguraCm: 6, comprimentoCm: 10, pesoG: 35 } };
    const nada = { partes: [], naoConferido: false };
    conferir("igual: nada mudou", mudancasDoAnuncio(base, { ...base }), nada);
    conferir("descricao diferente", mudancasDoAnuncio(base, { ...base, descricao: "b".repeat(32) }).partes, ["descricao"]);
    conferir("fotos em outra ordem", mudancasDoAnuncio(base, { ...base, fotos: ["f2.jpg", "f1.jpg"] }).partes, ["fotos"]);
    conferir("uma foto a mais", mudancasDoAnuncio(base, { ...base, fotos: ["f1.jpg", "f2.jpg", "f3.jpg"] }).partes, ["fotos"]);
    conferir("pacote com 1 g a mais", mudancasDoAnuncio(base, { ...base, pacote: { ...base.pacote, pesoG: 36 } }).partes, ["pacote"]);
    conferir(
      "tres mudadas, na ordem",
      mudancasDoAnuncio(base, { descricao: "c".repeat(32), fotos: ["f9.jpg"], pacote: { ...base.pacote, alturaCm: 3 } }).partes,
      ["descricao", "fotos", "pacote"],
    );
    conferir("sem impressao: nao conferido, com as partes do atual", mudancasDoAnuncio(null, { ...base, pacote: null }), { partes: ["descricao", "fotos"], naoConferido: true });
    conferir("produto sem foto: fotos nao entra", mudancasDoAnuncio(base, { ...base, fotos: [] }).partes, []);
    conferir("descricao null no atual: nao entra", mudancasDoAnuncio(base, { ...base, descricao: null }).partes, []);
    conferir("pacote null no atual: nao entra", mudancasDoAnuncio(base, { ...base, pacote: null }).partes, []);
    conferir("kit (fotos e pacote null): so a descricao conta", mudancasDoAnuncio(base, { descricao: base.descricao, fotos: null, pacote: null }), nada);

    // Preco e ficha (pedido do dono em 24/10/2026): editados no anuncio publicado, contam quando a impressao os tem.
    const comAnuncio = { ...base, preco: 38.9, ficha: [{ id: "BRAND", value_name: "GENERICA" }] };
    conferir("preco diferente", mudancasDoAnuncio(comAnuncio, { ...comAnuncio, preco: 42 }).partes, ["preco"]);
    conferir("ficha diferente", mudancasDoAnuncio(comAnuncio, { ...comAnuncio, ficha: [{ id: "BRAND", value_name: "OUTRA" }] }).partes, ["ficha"]);
    conferir("impressao antiga (sem preco nem ficha): nao acende por eles", mudancasDoAnuncio(base, { ...comAnuncio, preco: 99 }), nada);
    conferir("sem impressao: preco e ficha nao entram no nao conferido", mudancasDoAnuncio(null, { ...comAnuncio, pacote: null }).partes, ["descricao", "fotos"]);
    conferir("so a base do preco gravada (sem 'em'): conta o preco e o resto fica nao conferido", mudancasDoAnuncio({ preco: 38.9 }, { ...comAnuncio, preco: 40 }), { partes: ["descricao", "fotos", "pacote", "preco"], naoConferido: true });

    const produtos = {
      p1: {
        id: "p1", sku: "ZZ-ML-AC1", tituloBase: "PLACA", descricaoBase: "Texto da placa.", estoque: 3,
        pesoKg: 0.035, alturaCm: 1.5, larguraCm: 6, comprimentoCm: 10.15,
        imagens: [{ id: "i1", arquivo: "a1.jpg", principal: false }, { id: "i2", arquivo: "a2.jpg", principal: true }, { id: "i3", arquivo: "a3.jpg", principal: false }],
      },
      p2: { id: "p2", sku: "ZZ-ML-AC2", tituloBase: "CABO", descricaoBase: "Cabo.", estoque: 9, pesoKg: null, alturaCm: null, larguraCm: null, comprimentoCm: null, imagens: [{ id: "i9", arquivo: "a9.jpg", principal: true }] },
    };
    const simples = { produtoId: "p1", composicao: null };
    const atual = conteudoAtualDoAnuncio(simples, produtos);
    conferir("simples: fotos com a principal primeiro, depois a ordem", atual.fotos, ["a2.jpg", "a1.jpg", "a3.jpg"]);
    conferir("simples: descricao = a do ML", atual.descricao, montarDescricaoML({ descricao: "Texto da placa." }));
    conferir("simples: pacote como o da embalagem (cm para cima, g)", atual.pacote, { alturaCm: 2, larguraCm: 6, comprimentoCm: 11, pesoG: 35 });
    conferir("fotosDoRise: ids na mesma ordem", fotosDoRise(simples, produtos), ["i2", "i1", "i3"]);
    // 28/10/2026: o dono reordenou no anuncio; a foto que saiu do produto sai, e a nova entra no fim.
    conferir("fotosDoRise: ordem do anuncio quando reordenada", fotosDoRise({ ...simples, fotosReordenadas: true, imagens: ["i3", "x9", "i2"] }, produtos), ["i3", "i2", "i1"]);
    {
      // O prazo de disponibilidade e parte do anuncio (28/10/2026): com base gravada, mudar acende; sem base (null), nao.
      const { mudancasDoAnuncio } = await import("../src/lib/canaisDeVenda/ml/acompanhar.js");
      const atualComPrazo = { descricao: "x", fotos: null, pacote: null, preco: 10, ficha: [], prazo: 3, kit: false };
      conferir("prazo mudou: acende", mudancasDoAnuncio({ descricao: "x", preco: 10, ficha: [], prazo: 1 }, atualComPrazo).partes, ["prazo"]);
      conferir("prazo sem base: nao acende", mudancasDoAnuncio({ descricao: "x", preco: 10, ficha: [], prazo: null }, atualComPrazo).partes, []);
    }
    conferir("sem as quatro medidas: pacote null", conteudoAtualDoAnuncio({ produtoId: "p2", composicao: null }, produtos).pacote, null);
    const kit = { produtoId: "p1", composicao: { itens: [{ produtoId: "p1", quantidade: 1 }, { produtoId: "p2", quantidade: 1 }], codigo: "250999" } };
    const doKit = conteudoAtualDoAnuncio(kit, produtos);
    conferir("kit: fotos do proprio anuncio (vazias aqui), sem pacote, descricao com os itens inclusos", [doKit.fotos, doKit.pacote, doKit.kit, /Itens inclusos/i.test(doKit.descricao ?? "")], [[], null, true, true]);
    conferir("fotosDoRise do kit: null (sao do anuncio)", fotosDoRise(kit, produtos), null);
    conferir("produto que falta no contexto: descricao null", conteudoAtualDoAnuncio({ produtoId: "sumiu", composicao: null }, produtos).descricao, null);

    const impressa = impressaoDoConteudo(atual);
    const outra = impressaoDoConteudo({ ...atual, descricao: `${atual.descricao}.` });
    conferir("impressao: md5 de 32 hex, estavel, muda com 1 caractere", [/^[0-9a-f]{32}$/.test(impressa.descricao), impressaoDoConteudo(atual).descricao === impressa.descricao, outra.descricao !== impressa.descricao], [true, true, true]);
    conferir("impressao: fotos e pacote como vieram", [impressa.fotos, impressa.pacote], [atual.fotos, atual.pacote]);
    conferir("impressao de descricao null fica null", impressaoDoConteudo({ descricao: null, fotos: null, pacote: null }).descricao, null);

    const comFicha = conteudoAtualDoAnuncio({ ...simples, preco: 38.9, atributos: { MODEL: "uno r3", BRAND: "genérica", SELLER_PACKAGE_WEIGHT: "35 g", SELLER_SKU: "x", COLOR: "" } }, produtos);
    conferir("conteudo: preco e ficha (sem pacote, SKU e vazios; em ordem de id; marca em maiusculas)", [comFicha.preco, comFicha.ficha], [38.9, [{ id: "BRAND", value_name: "GENÉRICA" }, { id: "MODEL", value_name: "UNO R3" }]]);
    conferir("conteudo: preco vazio ou zero = null", [conteudoAtualDoAnuncio({ ...simples, preco: null }, produtos).preco, conteudoAtualDoAnuncio({ ...simples, preco: 0 }, produtos).preco], [null, null]);
    conferir("impressao: preco e ficha como vieram", [impressaoDoConteudo(comFicha).preco, impressaoDoConteudo(comFicha).ficha], [38.9, comFicha.ficha]);
  }

  {
    console.log("\nAnuncio publicado acompanha o produto (icone e lista)");
    await limpar();
    const { conteudoAtualDoAnuncio } = await import("../src/lib/canaisDeVenda/ml/acompanhar.js");
    const { impressaoDoConteudo } = await import("../src/lib/canaisDeVenda/ml/impressao.js");
    const { mudancasDosAnunciosML } = await import("../src/lib/canaisDeVenda/ml/banco.js");

    const publicadoCom = (situacaoCanal, mudancas) => ({ canal: "MERCADO_LIVRE", status: "PUBLICADO", situacaoCanal, mudancas });
    conferir("icone: publicado ATIVA com descricao mudada = desatualizado", estadoDoIconeML([publicadoCom("ATIVA", { partes: ["descricao"], naoConferido: false })]).desatualizado, true);
    conferir("icone: PAUSADA tambem", estadoDoIconeML([publicadoCom("PAUSADA", { partes: ["fotos"], naoConferido: false })]).desatualizado, true);
    conferir("icone: ENCERRADA nao acende", estadoDoIconeML([{ ...publicadoCom("ENCERRADA", { partes: ["descricao"], naoConferido: false }) }]).desatualizado, false);
    conferir("icone: rascunho nao acende", estadoDoIconeML([{ canal: "MERCADO_LIVRE", status: "RASCUNHO", situacaoCanal: "DESCONHECIDA", mudancas: { partes: ["descricao"], naoConferido: true } }]).desatualizado, false);
    conferir("icone: sem impressao (nao conferido) acende", estadoDoIconeML([publicadoCom("ATIVA", { partes: ["descricao"], naoConferido: true })]).desatualizado, true);
    conferir("icone: sem mudancas nao acende", estadoDoIconeML([publicadoCom("ATIVA", { partes: [], naoConferido: false })]).desatualizado, false);
    conferir(
      "icone: partes juntadas de dois anuncios",
      estadoDoIconeML([publicadoCom("ATIVA", { partes: ["descricao"], naoConferido: false }), publicadoCom("ATIVA", { partes: ["fotos", "descricao"], naoConferido: false })]).partesDesatualizadas,
      ["descricao", "fotos"],
    );
    conferir("rotulo: desatualizado com a parte", rotuloDoIconeML({ publicado: true, erro: false, desatualizado: true, partesDesatualizadas: ["descricao"] }), "Anúncio no Mercado Livre: publicado, desatualizado: descrição mudou no produto");
    conferir("rotulo: varias partes", rotuloDoIconeML({ publicado: true, erro: false, desatualizado: true, partesDesatualizadas: ["descricao", "fotos", "pacote"] }), "Anúncio no Mercado Livre: publicado, desatualizado: descrição, fotos e peso e medidas mudaram no produto");
    conferir("rotulo: so o preco do anuncio", rotuloDoIconeML({ publicado: true, erro: false, desatualizado: true, partesDesatualizadas: ["preco"] }), "Anúncio no Mercado Livre: publicado, desatualizado: preço alterado, falta enviar ao ML");
    conferir(
      "rotulo: produto e anuncio juntos",
      rotuloDoIconeML({ publicado: true, erro: false, desatualizado: true, partesDesatualizadas: ["descricao", "preco", "ficha"] }),
      "Anúncio no Mercado Livre: publicado, desatualizado: descrição mudou no produto; preço e ficha técnica alterados, falta enviar ao ML",
    );
    conferir(
      "icone: preco e ficha chegam ao texto (pela lista de partes do icone)",
      rotuloDoIconeML(estadoDoIconeML([publicadoCom("ATIVA", { partes: ["preco", "ficha"], naoConferido: false })])),
      "Anúncio no Mercado Livre: publicado, desatualizado: preço e ficha técnica alterados, falta enviar ao ML",
    );
    conferir("rotulo: nao conferido", rotuloDoIconeML({ publicado: true, erro: false, desatualizado: true, naoConferido: true, partesDesatualizadas: ["descricao"] }), "Anúncio no Mercado Livre: publicado, ainda não conferido com o produto");

    const produto = await prisma.produto.create({ data: { sku: "ZZ-ML-AC3", tituloBase: "PLACA AC3", descricaoBase: "Texto um.", pesoKg: 0.035, alturaCm: 1.5, larguraCm: 6, comprimentoCm: 10 } });
    await prisma.produtoArquivo.create({ data: { produtoId: produto.id, tipo: "IMAGEM", arquivo: `${"d".repeat(32)}.jpg`, ordem: 0, principal: true } });
    const ctx = await contextoDosProdutos([produto.id]);
    const enviado = { ...impressaoDoConteudo(conteudoAtualDoAnuncio({ produtoId: produto.id, composicao: null }, ctx)), em: new Date().toISOString() };
    const anuncio = await prisma.anuncio.create({
      data: { produtoId: produto.id, canal: "MERCADO_LIVRE", status: "PUBLICADO", situacaoCanal: "ATIVA", idExterno: "MLB900001", dados: { publicacao: { itemId: "MLB900001", enviado } } },
    });
    const ler = async () => {
      const anuncios = await prisma.anuncio.findMany({ where: { produtoId: produto.id }, select: { id: true, canal: true, status: true, situacaoCanal: true, produtoId: true, dados: true } });
      return (await mudancasDosAnunciosML(anuncios)).get(anuncio.id);
    };
    conferir("lista: igual ao enviado, sem partes", await ler(), { partes: [], naoConferido: false });
    await prisma.produto.update({ where: { id: produto.id }, data: { descricaoBase: "Texto dois." } });
    conferir("lista: descricao mudou no produto", (await ler()).partes, ["descricao"]);
    await prisma.produto.update({ where: { id: produto.id }, data: { descricaoBase: "Texto um." } });
    conferir("lista: desfazer apaga", (await ler()).partes, []);
    await prisma.anuncio.update({ where: { id: anuncio.id }, data: { dados: { publicacao: { itemId: "MLB900001" } } } });
    conferir("lista: sem impressao = nao conferido", await ler(), { partes: ["descricao", "fotos", "pacote"], naoConferido: true });
    await prisma.anuncio.update({ where: { id: anuncio.id }, data: { situacaoCanal: "ENCERRADA" } });
    conferir("lista: encerrado fica de fora", await ler(), undefined);
  }

  {
    console.log("\nEstado do anuncio no ML (releitura de hora em hora)");
    await limpar();
    const { criarMLFalso } = await import("./lib/mlFalso.js");
    const { textoDoEstadoML, precisaAgirNoML } = await import("../src/lib/canaisDeVenda/ml/estadoNoML.js");
    const { relerEstadosML } = await import("../src/lib/canaisDeVenda/ml/relerEstadoML.js");

    conferir("texto: ativo", textoDoEstadoML({ status: "active", subStatus: [] }), "Ativo no ML");
    conferir("texto: pausado sem estoque", textoDoEstadoML({ status: "paused", subStatus: ["out_of_stock"] }), "Pausado: sem estoque");
    conferir("texto: pausado", textoDoEstadoML({ status: "paused", subStatus: [] }), "Pausado no ML");
    conferir("texto: em revisao, precisa corrigir", textoDoEstadoML({ status: "under_review", subStatus: ["waiting_for_patch"] }), "Em revisão: precisa corrigir");
    conferir("texto: inativo", textoDoEstadoML({ status: "inactive", subStatus: [] }), "Inativo no ML");
    conferir("texto: encerrado", textoDoEstadoML({ status: "closed", subStatus: [] }), "Encerrado no ML");
    conferir("texto: desconhecido mostra o do ML", textoDoEstadoML({ status: "algo_novo", subStatus: [] }), "No ML: algo_novo");
    conferir(
      "precisa agir: revisao, inativo e pausado por moderacao sim; sem estoque, ativo e encerrado nao",
      [
        precisaAgirNoML({ status: "under_review", subStatus: [] }),
        precisaAgirNoML({ status: "inactive", subStatus: [] }),
        precisaAgirNoML({ status: "paused", subStatus: ["forbidden"] }),
        precisaAgirNoML({ status: "paused", subStatus: ["out_of_stock"] }),
        precisaAgirNoML({ status: "active", subStatus: [] }),
        precisaAgirNoML({ status: "closed", subStatus: [] }),
        precisaAgirNoML(null),
      ],
      [true, true, true, false, false, false, false],
    );

    const produto = await prisma.produto.create({ data: { sku: "ZZ-ML-EST1", tituloBase: "estado", conferido: true } });
    const publicado = (idExterno, extra = {}) =>
      prisma.anuncio.create({ data: { produtoId: produto.id, canal: "MERCADO_LIVRE", status: "PUBLICADO", situacaoCanal: "ATIVA", idExterno, dados: { publicacao: { itemId: idExterno } }, ...extra } });
    const a1 = await publicado("MLB910001");
    const a2 = await publicado("MLB910002");
    const a3 = await publicado("MLB910003");
    const rascunho = await prisma.anuncio.create({ data: { produtoId: produto.id, canal: "MERCADO_LIVRE", status: "RASCUNHO", situacaoCanal: "DESCONHECIDA" } });
    const ml = criarMLFalso();
    ml.itens.set("MLB910001", { id: "MLB910001", status: "under_review", sub_status: ["waiting_for_patch"], available_quantity: 3, sold_quantity: 2 });
    ml.itens.set("MLB910002", { id: "MLB910002", status: "paused", sub_status: ["out_of_stock"], available_quantity: 0, sold_quantity: 0 });
    // MLB910003 nao responde (404 no lote): falha dele, nada gravado.
    const ids = [a1.id, a2.id, a3.id, rascunho.id];
    const agora = new Date("2026-10-24T15:00:00Z");

    const r1 = await relerEstadosML({ ml, agora, anuncioIds: ids });
    const lido = async (anuncio) => {
      const linha = await prisma.anuncio.findUnique({ where: { id: anuncio.id }, select: { situacaoCanal: true, dados: true, atualizadoEm: true } });
      return { situacao: linha.situacaoCanal, estado: linha.dados?.publicacao?.estadoML ?? null, atualizadoEm: linha.atualizadoEm.toISOString() };
    };
    const e1 = await lido(a1);
    const e2 = await lido(a2);
    conferir("releitura: 3 publicados conferidos numa chamada, 2 mudaram, 1 falha", [r1.conferidos, r1.mudaram, r1.falhas, ml.chamadas.filter((c) => c.caminho === "/items/bulk").length], [3, 2, 1, 1]);
    // O JSONB devolve as chaves em outra ordem: compara campo a campo.
    conferir("releitura: em revisao grava o estado e a situacao DESCONHECIDA", [e1.situacao, e1.estado.status, e1.estado.subStatus, e1.estado.estoque, e1.estado.vendidos, e1.estado.desde], ["DESCONHECIDA", "under_review", ["waiting_for_patch"], 3, 2, "2026-10-24T15:00:00.000Z"]);
    conferir("releitura: pausado sem estoque vira PAUSADA", [e2.situacao, e2.estado.status], ["PAUSADA", "paused"]);
    conferir("releitura: o que nao respondeu fica como estava", (await lido(a3)).estado, null);

    // Sem mudanca no ML: nao reescreve (a lista de anuncios ordena pelo atualizadoEm).
    const r2 = await relerEstadosML({ ml, agora: new Date("2026-10-24T16:00:00Z"), anuncioIds: ids });
    conferir("releitura: sem mudanca nao reescreve", [r2.mudaram, (await lido(a1)).atualizadoEm], [0, e1.atualizadoEm]);

    const com429 = criarMLFalso({ falhas: [{ metodo: "GET", caminho: "/items/bulk", status: 429 }] });
    conferir("releitura: 429 para a rodada", Boolean((await relerEstadosML({ ml: com429, agora, anuncioIds: ids })).parou), true);

    const { estadoDoIconeML, rotuloDoIconeML } = await import("../src/lib/canaisDeVenda/ml/icone.js");
    const doBanco = await prisma.anuncio.findMany({ where: { id: { in: ids } }, select: { canal: true, status: true, situacaoCanal: true, dados: true } });
    const icone = estadoDoIconeML(doBanco);
    conferir("icone: anuncio em revisao acende o '!' com o texto", [icone.precisaAgirNoML, /em revisão: precisa corrigir/.test(rotuloDoIconeML(icone))], [true, true]);

    // Estoque do ML x Bling (pedido do dono em 25/10/2026): o "!" so na SEGUNDA leitura seguida com diferenca (o Bling leva
    // minutos para repassar uma venda; uma leitura no meio nao acende nada). Produto sem saldo do Bling nao compara.
    const comBling = await prisma.produto.create({ data: { sku: "ZZ-ML-EST2", tituloBase: "estoque", conferido: true, blingSaldo: 5 } });
    const a4 = await prisma.anuncio.create({ data: { produtoId: comBling.id, canal: "MERCADO_LIVRE", status: "PUBLICADO", situacaoCanal: "ATIVA", idExterno: "MLB910004", dados: { publicacao: { itemId: "MLB910004" } } } });
    ml.itens.set("MLB910004", { id: "MLB910004", status: "active", sub_status: [], available_quantity: 3, sold_quantity: 0 });
    const so4 = { ml, anuncioIds: [a4.id] };
    const estadoDe4 = async () => (await prisma.anuncio.findUnique({ where: { id: a4.id }, select: { dados: true } })).dados.publicacao.estadoML;
    const iconeDe4 = async () => estadoDoIconeML(await prisma.anuncio.findMany({ where: { id: a4.id }, select: { canal: true, status: true, situacaoCanal: true, dados: true } }));
    await relerEstadosML({ ...so4, agora: new Date("2026-10-25T10:00:00Z") });
    conferir("estoque: 1a leitura diferente conta 1 e nao acende", [(await estadoDe4()).estoqueBling, (await estadoDe4()).estoqueDiferenteSeguidas, (await iconeDe4()).estoqueDivergenteNoML], [5, 1, false]);
    await relerEstadosML({ ...so4, agora: new Date("2026-10-25T11:00:00Z") });
    const icone4 = await iconeDe4();
    conferir("estoque: 2a leitura seguida acende o '!' com os numeros", [(await estadoDe4()).estoqueDiferenteSeguidas, icone4.estoqueDivergenteNoML, /estoque no ML 3, no Bling 5/.test(rotuloDoIconeML(icone4))], [2, true, true]);
    conferir("estoque: o 'desde' e o da mudanca de estado, nao o da contagem", (await estadoDe4()).desde, "2026-10-25T10:00:00.000Z");
    ml.itens.get("MLB910004").available_quantity = 5;
    await relerEstadosML({ ...so4, agora: new Date("2026-10-25T12:00:00Z") });
    conferir("estoque: igualou, zera e apaga", [(await estadoDe4()).estoqueDiferenteSeguidas, (await iconeDe4()).estoqueDivergenteNoML], [0, false]);
    conferir("estoque: produto sem saldo do Bling nao compara", [(await lido(a1)).estado.estoqueBling, (await lido(a1)).estado.estoqueDiferenteSeguidas], [null, 0]);

    // Kit montado no editor (pedido do dono em 25/10/2026): o Publicar cria o kit de composicao no Bling, e o saldo vem do
    // KIT no Bling (lido pelo codigo na rodada), nao do produto principal do anuncio.
    const { criarBlingFalso } = await import("./lib/blingFalso.js");
    const blingDoKit = criarBlingFalso({ produtos: [{ id: 9001, codigo: "250901", nome: "KIT ZZ", formato: "E" }], saldos: { 250901: 4 } });
    const principal = await prisma.produto.create({ data: { sku: "ZZ-ML-EST3", tituloBase: "principal do kit", conferido: true, blingSaldo: 99 } });
    const a5 = await prisma.anuncio.create({
      data: {
        produtoId: principal.id, canal: "MERCADO_LIVRE", status: "PUBLICADO", situacaoCanal: "ATIVA", idExterno: "MLB910005",
        dados: { composicao: { itens: [{ produtoId: principal.id, quantidade: 2 }], codigo: "250901", blingProdutoId: 9001 }, publicacao: { itemId: "MLB910005" } },
      },
    });
    ml.itens.set("MLB910005", { id: "MLB910005", status: "active", sub_status: [], available_quantity: 2, sold_quantity: 0 });
    const doKit = async () => (await prisma.anuncio.findUnique({ where: { id: a5.id }, select: { dados: true } })).dados.publicacao.estadoML;
    await relerEstadosML({ ml, bling: blingDoKit, anuncioIds: [a5.id], agora: new Date("2026-10-25T10:00:00Z") });
    await relerEstadosML({ ml, bling: blingDoKit, anuncioIds: [a5.id], agora: new Date("2026-10-25T11:00:00Z") });
    const iconeKit = estadoDoIconeML(await prisma.anuncio.findMany({ where: { id: a5.id }, select: { canal: true, status: true, situacaoCanal: true, dados: true } }));
    conferir("kit do editor: compara com o saldo do KIT no Bling (4), nao o do principal (99)", [(await doKit()).estoqueBling, (await doKit()).estoqueDiferenteSeguidas, /estoque no ML 2, no Bling 4/.test(rotuloDoIconeML(iconeKit))], [4, 2, true]);
    conferir("kit do editor: o saldo foi lido pelo codigo do kit", blingDoKit.chamadas.some((c) => c.caminho === "/estoques/saldos" && JSON.stringify(c).includes("250901")), true);

    const { textoDosEstoquesNosCanais } = await import("../src/lib/canaisDeVenda/estoquesNosCanais.js");
    const anuncioML = (estoque) => ({ canal: "MERCADO_LIVRE", status: "PUBLICADO", dados: { publicacao: { estadoML: { estoque } } } });
    const anuncioLI = (estoque) => ({ canal: "LOJA_INTEGRADA", status: "PUBLICADO", dados: { monitorLI: { estoque } } });
    conferir("resumo do estoque: Bling, Rise, ML e LI", textoDosEstoquesNosCanais({ blingSaldo: 5, estoque: 5, anuncios: [anuncioML(3), anuncioML(3), anuncioLI(5)] }), "Bling 5 · Rise 5 · ML 3 · LI 5");
    conferir("resumo do estoque: o kit montado no editor fica fora da dica do principal", textoDosEstoquesNosCanais({ blingSaldo: 5, estoque: 5, anuncios: [anuncioML(3), { ...anuncioML(1), dados: { composicao: { codigo: "250901" }, publicacao: { estadoML: { estoque: 1 } } } }] }), "Bling 5 · Rise 5 · ML 3");
    conferir("resumo do estoque: Classico e Premium com numeros diferentes", textoDosEstoquesNosCanais({ blingSaldo: 5, estoque: 5, anuncios: [anuncioML(3), anuncioML(5)] }), "Bling 5 · Rise 5 · ML 3/5");
    conferir("resumo do estoque: so o Rise nao vira dica; saldo negativo do Bling e 0", [textoDosEstoquesNosCanais({ blingSaldo: null, estoque: 2, anuncios: [] }), textoDosEstoquesNosCanais({ blingSaldo: -2, estoque: 0, anuncios: [] })], [null, "Bling 0 · Rise 0"]);
  }

  {
    console.log("\nCatalogo do anuncio no ML: entrou, saiu ou trocou acende o '!' (pedido do dono em 25/10/2026, opcao 1)");
    await limpar();
    const { criarMLFalso } = await import("./lib/mlFalso.js");
    const { catalogoDoItem, textoDoCatalogo, textoDoAvisoDeCatalogo } = await import("../src/lib/canaisDeVenda/ml/estadoNoML.js");
    const { relerEstadosML } = await import("../src/lib/canaisDeVenda/ml/relerEstadoML.js");
    const { estadoDoIconeML, rotuloDoIconeML } = await import("../src/lib/canaisDeVenda/ml/icone.js");
    const { marcarCatalogoVistoML } = await import("../src/lib/canaisDeVenda/ml/banco.js");

    conferir("catalogo: o proprio catalog_product_id, concorrendo", catalogoDoItem({ catalog_product_id: "MLB1", catalog_listing: true }, []), "MLB1");
    conferir("catalogo: so identificado (catalog_listing false) nao conta", catalogoDoItem({ catalog_product_id: "MLB1", catalog_listing: false }, []), null);
    conferir(
      "catalogo: pelo anuncio de catalogo ligado (item_relations), so se ativo ou pausado",
      [
        catalogoDoItem({ catalog_product_id: null, item_relations: [{ id: "MLB2" }] }, [{ id: "MLB2", catalog_listing: true, catalog_product_id: "MLB9", status: "active" }]),
        catalogoDoItem({ catalog_product_id: null, item_relations: [{ id: "MLB2" }] }, [{ id: "MLB2", catalog_listing: true, catalog_product_id: "MLB9", status: "closed" }]),
        catalogoDoItem({ catalog_product_id: null, item_relations: [] }, []),
      ],
      ["MLB9", null, null],
    );
    conferir("texto: no catalogo, fora, nunca lido", [textoDoCatalogo({ id: "MLB1", nome: "Wemos" }), textoDoCatalogo(null), textoDoCatalogo(undefined)], ["No catálogo: Wemos", "Fora do catálogo", null]);
    conferir(
      "aviso: saiu, entrou, trocou",
      [
        textoDoAvisoDeCatalogo({ de: { id: "MLB1", nome: "Wemos" }, para: null, em: "2026-10-25T15:20:00Z" }),
        textoDoAvisoDeCatalogo({ de: null, para: { id: "MLB2", nome: "Mega" }, em: "2026-10-25T15:20:00Z" }),
        textoDoAvisoDeCatalogo({ de: { id: "MLB1", nome: "Wemos" }, para: { id: "MLB2", nome: "" }, em: "2026-10-25T15:20:00Z" }),
      ],
      ["saiu do catálogo Wemos em 25/10", "entrou no catálogo Mega em 25/10", "trocou do catálogo Wemos para MLB2 em 25/10"],
    );
    conferir("aviso: ja estava no catalogo na 1a leitura", textoDoAvisoDeCatalogo({ de: null, para: { id: "MLB2", nome: "Mega" }, em: "2026-10-25T15:20:00Z", inicial: true }), "está no catálogo Mega");

    const produto = await prisma.produto.create({ data: { sku: "ZZ-ML-CAT1", tituloBase: "catalogo", conferido: true } });
    const anuncio = await prisma.anuncio.create({ data: { produtoId: produto.id, canal: "MERCADO_LIVRE", status: "PUBLICADO", situacaoCanal: "ATIVA", idExterno: "MLB920001", dados: { publicacao: { itemId: "MLB920001" } } } });
    const ml = criarMLFalso();
    ml.itens.set("MLB920001", { id: "MLB920001", status: "active", sub_status: [], available_quantity: 1, sold_quantity: 0, catalog_product_id: "MLB44072268", catalog_listing: true, item_relations: [] });
    const so = { ml, anuncioIds: [anuncio.id] };
    const estado = async () => (await prisma.anuncio.findUnique({ where: { id: anuncio.id }, select: { dados: true } })).dados.publicacao.estadoML;
    const icone = async () => estadoDoIconeML(await prisma.anuncio.findMany({ where: { id: anuncio.id }, select: { canal: true, status: true, situacaoCanal: true, dados: true } }));

    // O dono quer conferir todo catalogo em que o anuncio esta (25/10/2026: o 100111 foi publicado ja no catalogo e o "!"
    // nao acendeu): a 1a leitura DENTRO de um catalogo tambem avisa; fora, nao.
    await relerEstadosML({ ...so, agora: new Date("2026-10-25T10:00:00Z") });
    const iconeInicial = await icone();
    conferir(
      "1a leitura ja no catalogo: grava o catalogo com o nome e acende o '!' (esta no catalogo)",
      [(await estado()).catalogo?.id, Boolean((await estado()).catalogo?.nome), (await estado()).catalogoAviso?.inicial, iconeInicial.catalogoMudouNoML, /está no catálogo Cabo USB/.test(rotuloDoIconeML(iconeInicial))],
      ["MLB44072268", true, true, true, true],
    );
    await relerEstadosML({ ...so, agora: new Date("2026-10-25T10:15:00Z") });
    conferir("a leitura seguinte nao repete o aviso", (await estado()).catalogoAviso?.em, "2026-10-25T10:00:00.000Z");
    await marcarCatalogoVistoML(anuncio.id);

    const fora = await prisma.anuncio.create({ data: { produtoId: produto.id, canal: "MERCADO_LIVRE", status: "PUBLICADO", situacaoCanal: "ATIVA", idExterno: "MLB920002", dados: { publicacao: { itemId: "MLB920002" } } } });
    ml.itens.set("MLB920002", { id: "MLB920002", status: "active", sub_status: [], available_quantity: 1, sold_quantity: 0, catalog_product_id: null, catalog_listing: false, item_relations: [] });
    await relerEstadosML({ ml, anuncioIds: [fora.id], agora: new Date("2026-10-25T10:00:00Z") });
    const estadoFora = (await prisma.anuncio.findUnique({ where: { id: fora.id }, select: { dados: true } })).dados.publicacao.estadoML;
    conferir("1a leitura fora do catalogo: grava fora, sem '!'", [estadoFora.catalogo, estadoFora.catalogoAviso], [null, null]);

    // Correcao da regra (26/10/2026): anuncio que a leitura antiga gravou "no catalogo" so porque o ML o identificou com um
    // produto de catalogo (catalog_listing false) sai dele SEM o aviso de "saiu", e o aviso que apontava para ele some.
    const identificado = await prisma.anuncio.create({
      data: {
        produtoId: produto.id, canal: "MERCADO_LIVRE", status: "PUBLICADO", situacaoCanal: "ATIVA", idExterno: "MLB920003",
        dados: { publicacao: { itemId: "MLB920003", estadoML: { status: "active", subStatus: [], estoque: 1, vendidos: 0, catalogo: { id: "MLB49572808", nome: "Pro Mini" }, catalogoAviso: { de: null, para: { id: "MLB49572808", nome: "Pro Mini" }, em: "2026-10-25T10:00:00.000Z", visto: false, inicial: true } } } },
      },
    });
    ml.itens.set("MLB920003", { id: "MLB920003", status: "active", sub_status: [], available_quantity: 1, sold_quantity: 0, catalog_product_id: "MLB49572808", catalog_listing: false, item_relations: [] });
    await relerEstadosML({ ml, anuncioIds: [identificado.id], agora: new Date("2026-10-26T10:00:00Z"), seguirCatalogo: false });
    const estadoIdentificado = (await prisma.anuncio.findUnique({ where: { id: identificado.id }, select: { dados: true } })).dados.publicacao.estadoML;
    conferir("so identificado: sai do catalogo sem '!' e sem aviso", [estadoIdentificado.catalogo, estadoIdentificado.catalogoAviso], [null, null]);

    ml.itens.get("MLB920001").catalog_product_id = null;
    ml.itens.get("MLB920001").catalog_listing = false;
    const saiu = await relerEstadosML({ ...so, agora: new Date("2026-10-25T15:20:00Z") });
    const iconeSaiu = await icone();
    conferir("saiu do catalogo: grava fora, o aviso e o '!' com o texto", [saiu.mudaram, (await estado()).catalogo, (await estado()).catalogoAviso?.visto, iconeSaiu.catalogoMudouNoML, /saiu do catálogo Cabo USB compat.* em 25\/10/.test(rotuloDoIconeML(iconeSaiu))], [1, null, false, true, true]);
    conferir("saiu do catalogo: o 'desde' do estado nao muda (o estado nao mudou)", (await estado()).desde, "2026-10-25T10:00:00.000Z");

    const igual = await relerEstadosML({ ...so, agora: new Date("2026-10-25T16:00:00Z") });
    conferir("sem mudanca: nao reescreve e o aviso continua", [igual.mudaram, (await estado()).catalogoAviso?.visto], [0, false]);

    await marcarCatalogoVistoML(anuncio.id);
    conferir("abrir o anuncio marca como visto e apaga o '!'", [(await estado()).catalogoAviso?.visto, (await icone()).catalogoMudouNoML, (await estado()).catalogo], [true, false, null]);

    // Entrar pelo anuncio de catalogo separado (o jeito antigo do ML): o catalogo vem do item ligado.
    ml.itens.get("MLB920001").item_relations = [{ id: "MLB920099" }];
    ml.itens.set("MLB920099", { id: "MLB920099", status: "active", catalog_listing: true, catalog_product_id: "MLB44072268" });
    await relerEstadosML({ ...so, agora: new Date("2026-10-25T17:00:00Z") });
    conferir("entrou pelo anuncio de catalogo ligado: '!' de novo", [(await estado()).catalogo?.id, (await estado()).catalogoAviso?.de, (await estado()).catalogoAviso?.visto, (await icone()).catalogoMudouNoML], ["MLB44072268", null, false, true]);

    // O selo "C2" do icone (pedido do dono em 26/10/2026): em quantos catalogos DIFERENTES estao os anuncios publicados do
    // produto (Classico e Premium no mesmo catalogo contam 1). Rascunho e anuncio fora de catalogo nao contam.
    const noCatalogo = (catalogo, status = "PUBLICADO") => ({ canal: "MERCADO_LIVRE", status, situacaoCanal: "ATIVA", dados: { publicacao: { estadoML: { status: "active", subStatus: [], catalogo } } } });
    conferir(
      "selo C: catalogos diferentes dos publicados",
      [
        estadoDoIconeML([noCatalogo({ id: "MLB1", nome: "A" }), noCatalogo({ id: "MLB1", nome: "A" })]).catalogos,
        estadoDoIconeML([noCatalogo({ id: "MLB1", nome: "A" }), noCatalogo({ id: "MLB2", nome: "B" })]).catalogos,
        estadoDoIconeML([noCatalogo(null), noCatalogo({ id: "MLB3", nome: "C" }, "RASCUNHO")]).catalogos,
      ],
      [1, 2, 0],
    );
    conferir("selo C: o texto do icone diz em quantos", /em 2 catálogos/.test(rotuloDoIconeML(estadoDoIconeML([noCatalogo({ id: "MLB1", nome: "A" }), noCatalogo({ id: "MLB2", nome: "B" })]))), true);

    const { avisosDevidos } = await import("../src/lib/telegram/avisos.js");
    const devidos = (await avisosDevidos("catalogoML", { agora: Date.parse("2026-10-25T17:05:00Z") })).filter((aviso) => aviso.chave.includes(anuncio.id));
    conferir("telegram: um aviso do catalogo, com o codigo do produto", [devidos.length, devidos[0]?.dados.sku, /entrou no catálogo/.test(devidos[0]?.dados.texto ?? "")], [1, "ZZ-ML-CAT1", true]);
  }

  {
    console.log("\nAba Divergencias do ML (pedido do dono em 25/10/2026, no molde da LI)");
    const { divergenciasDoAnuncioML } = await import("../src/lib/canaisDeVenda/ml/divergencias.js");
    const estado = (extra = {}) => ({ status: "active", subStatus: [], estoque: 5, estoqueBling: 5, estoqueDiferenteSeguidas: 0, ...extra });
    conferir("rascunho nao tem divergencia", divergenciasDoAnuncioML({ publicado: false, publicacao: { estadoML: estado({ status: "under_review" }) } }), []);
    conferir("publicado em dia: nenhuma", divergenciasDoAnuncioML({ publicado: true, publicacao: { estadoML: estado() }, mudancas: { partes: [], naoConferido: false } }), []);
    const todas = divergenciasDoAnuncioML({
      publicado: true,
      mudancas: { partes: ["descricao", "preco"], naoConferido: false },
      publicacao: {
        estadoML: estado({
          status: "under_review",
          subStatus: ["waiting_for_patch"],
          estoque: 3,
          estoqueDiferenteSeguidas: 2,
          catalogo: { id: "MLB9", nome: "Wemos" },
          catalogoAviso: { de: null, para: { id: "MLB9", nome: "Wemos" }, em: "2026-10-25T15:00:00Z", visto: false, inicial: true },
        }),
      },
    });
    conferir("as quatro, com a acao de cada uma", todas.map((item) => [item.id, item.acao]), [["envio", "enviar"], ["estado", "painel"], ["estoque", null], ["catalogo", "revisarCatalogo"]]);
    conferir(
      "os textos",
      todas.map((item) => item.titulo),
      ["Falta enviar ao ML: descrição e preço", "Em revisão: precisa corrigir", "Estoque no ML 3, no Bling 5", "Está no catálogo Wemos"],
    );
    conferir("estoque diferente numa leitura so ainda nao e divergencia", divergenciasDoAnuncioML({ publicado: true, publicacao: { estadoML: estado({ estoque: 3, estoqueDiferenteSeguidas: 1 }) } }).length, 0);
    conferir(
      "catalogo revisado sai da lista",
      divergenciasDoAnuncioML({ publicado: true, publicacao: { estadoML: estado({ catalogoAviso: { de: { id: "MLB9", nome: "Wemos" }, para: null, em: "2026-10-25T15:00:00Z", visto: true } }) } }).length,
      0,
    );
    conferir("ainda nao conferido com o produto", divergenciasDoAnuncioML({ publicado: true, publicacao: { estadoML: estado() }, mudancas: { partes: ["descricao"], naoConferido: true } })[0].titulo, "Ainda não conferido com o produto");
  }

  {
    console.log("\nLinks do rodape do editor: o anuncio no ML e o painel do vendedor");
    const { linkDoAnuncioML, linkDoPainelML } = await import("../src/lib/canaisDeVenda/ml/rotulos.js");
    conferir("anuncio: usa o link gravado", linkDoAnuncioML("MLB5458577821", "https://produto.mercadolivre.com.br/MLB-5458577821-placa-_JM"), "https://produto.mercadolivre.com.br/MLB-5458577821-placa-_JM");
    conferir("anuncio: sem link gravado, monta pelo MLB", linkDoAnuncioML("MLB5458577821", null), "https://produto.mercadolivre.com.br/MLB-5458577821");
    conferir("anuncio: link gravado que nao e http fica de fora", linkDoAnuncioML("MLB5458577821", "javascript:alert(1)"), "https://produto.mercadolivre.com.br/MLB-5458577821");
    conferir("anuncio: sem MLB valido, nada", [linkDoAnuncioML(null, null), linkDoAnuncioML("ABC", null)], [null, null]);
    conferir("painel: a lista de anuncios do vendedor buscando o MLB", linkDoPainelML("MLB5458577821"), "https://www.mercadolivre.com.br/anuncios/lista?search=MLB5458577821");
    conferir("painel: sem MLB valido, nada", [linkDoPainelML(""), linkDoPainelML("MLB12a")], [null, null]);
  }

  {
    console.log("\nFaixas e preco pelo lucro da loja (regras puras)");
    const { variantesEsperadas, varianteDoRascunho, rascunhoDaVariante, precoPelaFaixa, lucroPorUnidade, NOME_DA_VARIANTE, ordenarAnunciosDoProduto } = await import("../src/lib/canaisDeVenda/ml/faixas.js");
    // A ordem fixa do popup (pedido do dono em 09/11/2026): Classico sem frete, Premium sem frete, Classico com frete, Premium
    // com frete, e depois os kits, do menor para o maior, na mesma ordem.
    const linha = (id, codigo, tipoAnuncio, freteGratis, preco = 30) => ({ id, codigo, sku: "120920", tipoAnuncio, freteGratis, preco });
    const embaralhados = [
      linha("k5p", "120920_5", "gold_pro", true, 176), linha("bcs", "120920", "gold_special", false), linha("k5c", "120920_5", "gold_special", true, 169.9),
      linha("bpf", "120920", "gold_pro", true), linha("bcf", "120920", "gold_special", true), linha("bps", "120920", "gold_pro", false),
      linha("k10", "120920_10", "gold_special", true, 330), linha("k2", "120920_2", "gold_special", true, 80),
    ];
    conferir("ordem do popup: base nas 4 variantes e depois os kits do menor ao maior", ordenarAnunciosDoProduto(embaralhados).map((a) => a.id), ["bcs", "bps", "bcf", "bpf", "k2", "k5c", "k5p", "k10"]);
    conferir("ordem do popup: preco a partir de 79 conta como frete gratis", ordenarAnunciosDoProduto([linha("b", "120920", "gold_special", false, 99), linha("a", "120920", "gold_pro", false, 50)]).map((a) => a.id), ["a", "b"]);
    conferir("ordem do popup: nao muda a lista recebida", embaralhados[0].id, "k5p");
    const { custosDoAnuncio } = await import("../src/lib/canaisDeVenda/ml/custos.js");
    // Taxas fixas do teste: 13% de comissao e R$ 6,50 de tarifa abaixo de R$ 79 (sem tarifa a partir dali); frete do
    // vendedor R$ 13 sem frete gratis (o reduzido, que perto de R$ 79 chega a isso) e R$ 19,05 com frete gratis.
    const taxas = (preco) => ({ percentual: 0.13, tarifaFixa: preco >= 79 ? 0 : 6.5 });
    const frete = (preco, fg) => (fg || preco >= 79 ? 19.05 : 13);
    const lucroDe = (preco, custo, fg) => custosDoAnuncio({ preco, custo, ...taxas(preco), frete: frete(preco, fg) }).lucro;
    const terminaEm9 = (preco) => Math.round(preco * 100) % 10 === 9;

    // Definicao do dono em 08/11/2026 (noite): abaixo de R$ 72 so o Classico sem frete; o com frete gratis saiu.
    conferir("abaixo de 72: so o sem frete", [variantesEsperadas(71.99), variantesEsperadas(18.9)], [["classico_sem_frete"], ["classico_sem_frete"]]);
    conferir("de 72 em diante: so a com frete gratis", [variantesEsperadas(72), variantesEsperadas(78.99), variantesEsperadas(79)], [["classico_frete_gratis"], ["classico_frete_gratis"], ["classico_frete_gratis"]]);
    conferir("sem preco: nenhuma", [variantesEsperadas(null), variantesEsperadas(0)], [[], []]);
    // Premium (decisao do dono em 08/11/2026, "pode seguir dessa forma"): a partir de R$ 150 no ML, o Classico com frete gratis E
    // o Premium com frete gratis; abaixo de 150, nunca Premium.
    conferir("de 150 em diante: Classico e Premium com frete gratis", [variantesEsperadas(149.99), variantesEsperadas(150), variantesEsperadas(320)], [["classico_frete_gratis"], ["classico_frete_gratis", "premium_frete_gratis"], ["classico_frete_gratis", "premium_frete_gratis"]]);
    const { ROTULO_DA_VARIANTE, REGRAS_DAS_VARIANTES, LIMITE_DO_PREMIUM } = await import("../src/lib/canaisDeVenda/ml/faixas.js");
    conferir("rotulos curtos das variantes", [ROTULO_DA_VARIANTE.classico_sem_frete, ROTULO_DA_VARIANTE.classico_frete_gratis, ROTULO_DA_VARIANTE.premium_frete_gratis], ["Clássico sem frete", "Clássico + frete grátis", "Premium + frete grátis"]);
    conferir("as regras em texto citam os tres limites", [LIMITE_DO_PREMIUM, REGRAS_DAS_VARIANTES.some((linha) => /72/.test(linha)), REGRAS_DAS_VARIANTES.some((linha) => /79/.test(linha)), REGRAS_DAS_VARIANTES.some((linha) => /150/.test(linha) && /Premium/.test(linha))], [150, true, true, true]);
    conferir("nome das variantes", NOME_DA_VARIANTE.classico_frete_gratis, "Clássico com frete grátis");
    conferir("variante do rascunho: classico sem frete", varianteDoRascunho({ tipoAnuncio: "gold_special", envio: { freteGratis: false }, preco: 45.9 }), "classico_sem_frete");
    conferir("variante do rascunho: preco >= 79 e frete gratis mesmo desligado", varianteDoRascunho({ tipoAnuncio: "gold_special", envio: { freteGratis: false }, preco: 89.9 }), "classico_frete_gratis");
    conferir("variante do rascunho: premium com frete gratis", varianteDoRascunho({ tipoAnuncio: "gold_pro", envio: { freteGratis: true }, preco: 45.9 }), "premium_frete_gratis");
    const base = { tipoAnuncio: "gold_special", envio: { modo: "me2", freteGratis: false }, preco: 45.9 };
    const comFrete = rascunhoDaVariante(base, "classico_frete_gratis");
    conferir("rascunho da variante: liga o frete gratis e mantem o resto do envio", [comFrete.envio.freteGratis, comFrete.envio.modo, comFrete.tipoAnuncio], [true, "me2", "gold_special"]);
    conferir("rascunho da variante: premium sem frete", [rascunhoDaVariante(base, "premium_sem_frete").tipoAnuncio, rascunhoDaVariante(base, "premium_sem_frete").envio.freteGratis], ["gold_pro", false]);
    conferir("rascunho da variante: nao altera o original", [base.envio.freteGratis, base.tipoAnuncio], [false, "gold_special"]);
    // Sem frete gratis o atacado nasce desligado (dono, 09/11/2026: "quando nao tem frete gratis ja nascer desligado"; o ML nao
    // sugere desconto sem frete gratis e o Publicar dava erro). Com frete gratis, ligado; no kit, nunca.
    const ligadoSemFrete = { ...base, atacado: { ligado: true, faixas: [{ quantidade: 2, percentual: null }] } };
    conferir("variante sem frete: atacado desligado", [rascunhoDaVariante(ligadoSemFrete, "classico_sem_frete").atacado, rascunhoDaVariante(ligadoSemFrete, "premium_sem_frete").atacado], [{ ligado: false, faixas: [] }, { ligado: false, faixas: [] }]);
    conferir("variante com frete gratis: atacado ligado com as 4 faixas", rascunhoDaVariante({ ...base, atacado: { ligado: false, faixas: [] } }, "classico_frete_gratis").atacado.faixas.map((f) => f.quantidade), [2, 5, 10, 20]);
    conferir("variante com frete gratis mantem as faixas que o dono ja tinha", rascunhoDaVariante(ligadoSemFrete, "premium_frete_gratis").atacado, ligadoSemFrete.atacado);
    conferir("variante de kit com frete gratis: atacado desligado", rascunhoDaVariante({ ...base, composicao: { itens: [{ produtoId: "a", quantidade: 5 }] } }, "classico_frete_gratis").atacado, { ligado: false, faixas: [] });

    const semFrete = await precoPelaFaixa({ lucro: 9.44, custo: 25, variante: "classico_sem_frete", taxas, frete });
    const lucroSem = lucroDe(semFrete.preco, 25, false);
    conferir("preco pela faixa sem frete: mantem o lucro (ate 10 centavos a mais) e termina em 9", [semFrete.freteGratis, semFrete.piso, lucroSem >= 9.44, lucroSem < 9.54, terminaEm9(semFrete.preco)], [false, false, true, true, true]);
    const comFG = await precoPelaFaixa({ lucro: 9.44, custo: 25, variante: "classico_frete_gratis", taxas, frete });
    const lucroCom = lucroDe(comFG.preco, 25, true);
    conferir("preco pela faixa com frete gratis: maior que o sem frete e mantem o lucro", [comFG.freteGratis, comFG.preco > semFrete.preco, lucroCom >= 9.44, lucroCom < 9.54, terminaEm9(comFG.preco)], [true, true, true, true, true]);
    // Sem frete: (6 + 35 + 6,50 + 13) / 0,81 = 74,79, na faixa 72-79; com frete gratis o lucro sozinho daria 74,19 (a tarifa
    // cai no 79), entao vale o piso de R$ 79.
    const naFaixa = await precoPelaFaixa({ lucro: 6, custo: 35, variante: "classico_sem_frete", taxas, frete });
    const piso = await precoPelaFaixa({ lucro: 6, custo: 35, variante: "classico_frete_gratis", taxas, frete });
    conferir("faixa 72-79: o sem frete cai nela e o com frete gratis sobe para R$ 79, marcado como piso", [naFaixa.preco, piso.preco, piso.freteGratis, piso.piso], [74.79, 79, true, true]);
    const alto = await precoPelaFaixa({ lucro: 60, custo: 100, variante: "classico_frete_gratis", taxas, frete });
    conferir("acima de 79 pelo lucro: sem piso, frete gratis", [alto.piso, alto.preco > 79, alto.freteGratis], [false, true, true]);
    // O frete do vendedor cresce com o preco (a R$ 467 o 100101 x10 pagou R$ 21,65, nao os R$ 19,05 lidos a R$ 79; visto na
    // tela em 08/11/2026): a conta tem de ser refeita com as taxas lidas no proprio preco, nao so subir centavos.
    const freteEmDegraus = (preco, fg) => (fg || preco >= 79 ? (preco >= 200 ? 27.5 : 19.05) : 13);
    const degraus = await precoPelaFaixa({ lucro: 60, custo: 100, variante: "classico_frete_gratis", taxas, frete: freteEmDegraus });
    const lucroDegraus = custosDoAnuncio({ preco: degraus.preco, custo: 100, ...taxas(degraus.preco), frete: freteEmDegraus(degraus.preco, true) }).lucro;
    conferir("frete que muda com o preco: o lucro final ainda e o pedido", [lucroDegraus >= 60, lucroDegraus < 60.2, terminaEm9(degraus.preco)], [true, true, true]);
    conferir("sem custo ou sem lucro: nada", [await precoPelaFaixa({ lucro: 9, custo: 0, variante: "classico_sem_frete", taxas, frete }), await precoPelaFaixa({ lucro: null, custo: 25, variante: "classico_sem_frete", taxas, frete })], [null, null]);
    conferir("lucro por unidade do kit", [lucroPorUnidade(15.37, 10), lucroPorUnidade(null, 10), lucroPorUnidade(15.37, 0)], [1.54, null, null]);
  }

  {
    console.log("\nPreco pela faixa no ML (taxas e frete do ML falso)");
    const { precoPelaFaixaNoML } = await import("../src/lib/canaisDeVenda/ml/leitura.js");
    const { lucroDaLojaDoRascunho } = await import("../src/lib/canaisDeVenda/ml/faixas.js");
    const { custosDoAnuncio } = await import("../src/lib/canaisDeVenda/ml/custos.js");
    const { lucroLiquido } = await import("../src/lib/margem.js");
    const { criarMLFalso } = await import("./lib/mlFalso.js");
    const falso = criarMLFalso();
    const rascunho = { produtoId: "p-fx", categoriaId: "MLB99779", tipoAnuncio: "gold_special", preco: 45.9, envio: { logistica: "xd_drop_off", freteGratis: false, alturaCm: 5, larguraCm: 8, comprimentoCm: 8, pesoKg: 0.05 } };
    const lucro = lucroLiquido(45.9, 25);
    // O ML falso: 13% de comissao, sem tarifa fixa no xd_drop_off, frete do vendedor R$ 6,85 sem frete gratis e R$ 8,15 com.
    const semFrete = await precoPelaFaixaNoML(falso, rascunho, { custo: 25, lucro });
    const lucroNoML = custosDoAnuncio({ preco: semFrete.preco, custo: 25, percentual: 0.13, tarifaFixa: 0, frete: 6.85 }).lucro;
    conferir("sem frete: preco acima do da loja, mantem o lucro da loja, variante do rascunho", [semFrete.preco > 45.9, lucroNoML >= lucro, lucroNoML < lucro + 0.1, semFrete.freteGratis, semFrete.variante], [true, true, true, false, "classico_sem_frete"]);
    conferir("sem frete: devolve os custos lidos no preco final", [semFrete.custosML?.preco, semFrete.custosML?.frete], [semFrete.preco, 6.85]);
    const comFrete = await precoPelaFaixaNoML(falso, rascunho, { custo: 25, lucro, variante: "classico_frete_gratis" });
    conferir("com frete gratis: preco maior, frete gratis ligado", [comFrete.preco > semFrete.preco, comFrete.freteGratis, comFrete.variante, comFrete.custosML?.frete], [true, true, "classico_frete_gratis", 8.15]);
    conferir("sem custo: null", await precoPelaFaixaNoML(falso, rascunho, { custo: 0, lucro }), null);
    let erroSemCategoria = null;
    try { await precoPelaFaixaNoML(falso, { ...rascunho, categoriaId: "" }, { custo: 25, lucro }); } catch (erro) { erroSemCategoria = erro.message; }
    conferir("sem categoria: recusa dizendo", /categoria/i.test(String(erroSemCategoria)), true);

    const produtos = [{ id: "p-fx", precoVenda: 45.9, custo: 25 }, { id: "p-2", precoVenda: 10, custo: 4 }, { id: "p-3", precoVenda: 10, custo: null }];
    conferir("lucro da loja: simples", lucroDaLojaDoRascunho(rascunho, produtos), Math.round(lucro * 100) / 100);
    // O contexto dos produtos (`contextoDosProdutos`) traz o custo como `{ valor, origem }`, o mesmo que a aba Preco le.
    conferir("lucro da loja: custo no formato do contexto ({ valor, origem })", lucroDaLojaDoRascunho(rascunho, [{ id: "p-fx", precoVenda: 45.9, custo: { valor: 25, origem: "cadastro" } }]), Math.round(lucro * 100) / 100);
    conferir("lucro da loja: kit = soma por peca x quantidade", lucroDaLojaDoRascunho({ ...rascunho, composicao: { itens: [{ produtoId: "p-fx", quantidade: 2 }, { produtoId: "p-2", quantidade: 3 }] } }, produtos), Math.round((lucro * 2 + lucroLiquido(10, 4) * 3) * 100) / 100);
    conferir("lucro da loja: peca sem custo ou produto sem preco = null", [lucroDaLojaDoRascunho({ ...rascunho, composicao: { itens: [{ produtoId: "p-3", quantidade: 1 }] } }, produtos), lucroDaLojaDoRascunho({ ...rascunho, produtoId: "p-3" }, produtos)], [null, null]);
  }

  {
    console.log("\nPreco da loja mudou (o '!' do preco da loja, sem enviar nada sozinho)");
    await limpar();
    const { mudancasDoAnuncio, conteudoAtualDoAnuncio, NOMES_DAS_PARTES, PARTES_DO_ANUNCIO } = await import("../src/lib/canaisDeVenda/ml/acompanhar.js");
    const { impressaoDoConteudo } = await import("../src/lib/canaisDeVenda/ml/impressao.js");
    const { ETAPAS_DO_ENVIO_ML, PARTES_DO_ENVIO_ML } = await import("../src/lib/canaisDeVenda/ml/etapasDoEnvio.js");
    const { publicarAnuncioML } = await import("../src/lib/canaisDeVenda/ml/publicar.js");
    const { enviarMudancasML } = await import("../src/lib/canaisDeVenda/ml/atualizar.js");
    const { criarMLFalso } = await import("./lib/mlFalso.js");
    const { criarBlingFalso } = await import("./lib/blingFalso.js");
    const { salvarPublicadoML } = await import("../src/lib/canaisDeVenda/ml/banco.js");

    // Regra pura: a parte entra pela impressao, como o preco e a ficha; impressao sem a chave (anuncio de antes) nao acende.
    const impressao = { descricao: "x", fotos: ["a.jpg"], pacote: { alturaCm: 2, larguraCm: 6, comprimentoCm: 7, pesoG: 50 }, preco: 49.9, ficha: [], prazo: 0, precoDaLoja: 45.9 };
    const atualIgual = { ...impressao };
    conferir("preco da loja: e uma parte do anuncio com nome", [PARTES_DO_ANUNCIO.includes("precoDaLoja"), NOMES_DAS_PARTES.precoDaLoja], [true, "preço da loja"]);
    conferir("preco da loja mudou: acende so ela", mudancasDoAnuncio(impressao, { ...atualIgual, precoDaLoja: 49.9 }).partes, ["precoDaLoja"]);
    conferir("preco da loja: impressao de antes (sem a chave) nao acende", mudancasDoAnuncio((({ precoDaLoja, ...resto }) => resto)(impressao), { ...atualIgual, precoDaLoja: 49.9 }).partes, []);
    conferir("preco da loja igual: nada", mudancasDoAnuncio(impressao, atualIgual).partes, []);
    conferir("etapa do envio: registrar o preco da loja antes do preco", [ETAPAS_DO_ENVIO_ML.find((etapa) => etapa.id === "precoDaLoja")?.rotulo, PARTES_DO_ENVIO_ML.indexOf("precoDaLoja") < PARTES_DO_ENVIO_ML.indexOf("preco")], ["Registrar o preço da loja", true]);

    // O conteudo atual: o preco de venda do produto; kit = soma preco x quantidade; sem preco = null (o custo nao entra).
    const produtos = { "p-a": { id: "p-a", precoVenda: 45.9, custo: { valor: 20 } }, "p-b": { id: "p-b", precoVenda: 10, custo: { valor: 4 } }, "p-c": { id: "p-c", precoVenda: null } };
    conferir("conteudo atual: preco da loja do produto", conteudoAtualDoAnuncio({ produtoId: "p-a", preco: 49.9 }, produtos).precoDaLoja, 45.9);
    conferir("conteudo atual: kit soma preco x quantidade", conteudoAtualDoAnuncio({ produtoId: "p-a", preco: 200, composicao: { itens: [{ produtoId: "p-a", quantidade: 2 }, { produtoId: "p-b", quantidade: 3 }] } }, produtos).precoDaLoja, 121.8);
    conferir("conteudo atual: sem preco de venda (ou peca sem) = null", [conteudoAtualDoAnuncio({ produtoId: "p-c", preco: 49.9 }, produtos).precoDaLoja, conteudoAtualDoAnuncio({ produtoId: "p-a", preco: 200, composicao: { itens: [{ produtoId: "p-c", quantidade: 1 }] } }, produtos).precoDaLoja], [null, null]);
    conferir("impressao leva o preco da loja", impressaoDoConteudo({ descricao: "x", precoDaLoja: 45.9 }).precoDaLoja, 45.9);
    const custoMudou = impressaoDoConteudo(conteudoAtualDoAnuncio({ produtoId: "p-a", preco: 49.9 }, { "p-a": { ...produtos["p-a"], custo: { valor: 30 } } }));
    conferir("custo que muda sozinho nao acende (decisao do dono)", mudancasDoAnuncio(impressaoDoConteudo(conteudoAtualDoAnuncio({ produtoId: "p-a", preco: 49.9 }, produtos)), custoMudou).partes, []);

    // De verdade: anuncio ZZ-ML publicado contra o ML falso; o preco da loja muda, o Enviar so registra (nenhum PUT no ML).
    const produto = await prisma.produto.create({
      data: { sku: "ZZ-ML-PL", tituloBase: "ZZ PL", descricaoBase: "Descricao de ZZ PL", conferido: true, blingId: "1", pesoKg: 0.05, alturaCm: 2, larguraCm: 6, comprimentoCm: 7, estoque: 10, ncm: "8473.30.49", origem: 0, precoVenda: 45.9, custo: 20 },
    });
    await prisma.produtoArquivo.createMany({ data: ["a.jpg", "b.jpg"].map((arquivo, ordem) => ({ produtoId: produto.id, tipo: "IMAGEM", papel: "FOTO", arquivo: `ZZ-ML-PL-${arquivo}`, ordem, principal: ordem === 0 })) });
    const { rascunho } = await novoRascunhoML(produto.id);
    const salvo = await salvarRascunhoML(null, { ...rascunho, titulo: "PLACA ZZ PL", categoriaId: "MLB99779", preco: 49.9, estoque: 5, atributos: { BRAND: "ZZ", MODEL: "M1", EMPTY_GTIN_REASON: "O produto não tem código cadastrado", MICROCONTROLLER: "-1", INCLUDES_USB_CABLE: "-1", OPERATING_VOLTAGE: "-1" } });
    if (!salvo.ok) throw new Error(`cenario: ${salvo.erro}`);
    const ml = criarMLFalso();
    const bling = criarBlingFalso({ produtos: [{ id: 501, codigo: "ZZ-ML-PL", nome: "ZZ PL", formato: "S", preco: 49 }] });
    const lerFoto = async () => Buffer.from("jpg");
    const publicado = await publicarAnuncioML(salvo.id, { ml, bling, lerFoto });
    conferir("publicado: a impressao nasce com o preco da loja", [publicado.ok, (await carregarAnuncioML(salvo.id)).publicacao.enviado.precoDaLoja], [true, 45.9]);
    conferir("publicado: sem mudancas nao escreve", await enviarMudancasML(salvo.id, { ml, lerFoto }), { ok: true, enviadas: [] });
    await prisma.produto.update({ where: { id: produto.id }, data: { precoVenda: 52.9 } });
    const inicio = ml.escritas.length;
    const r = await enviarMudancasML(salvo.id, { ml, lerFoto });
    conferir("preco da loja mudou: o Enviar so registra, nenhum PUT no ML", [r.ok, r.enviadas, ml.escritas.length - inicio, (await carregarAnuncioML(salvo.id)).publicacao.enviado.precoDaLoja], [true, ["precoDaLoja"], 0, 52.9]);
    conferir("preco da loja: depois, nada mais mudou", await enviarMudancasML(salvo.id, { ml, lerFoto }), { ok: true, enviadas: [] });
    // Anuncio publicado antes desta regra (impressao sem a chave): o primeiro Salvar grava a base de agora, e o "!" so acende pelo
    // que mudar daqui em diante.
    {
      const dados = (await prisma.anuncio.findUnique({ where: { id: salvo.id }, select: { dados: true } })).dados;
      const { precoDaLoja, ...semBase } = dados.publicacao.enviado;
      await prisma.anuncio.update({ where: { id: salvo.id }, data: { dados: { ...dados, publicacao: { ...dados.publicacao, enviado: semBase } } } });
      await prisma.produto.update({ where: { id: produto.id }, data: { precoVenda: 59.9 } });
      conferir("anuncio de antes: sem base nao acende", (await enviarMudancasML(salvo.id, { ml, lerFoto })).enviadas, []);
      conferir("anuncio de antes: o primeiro Salvar grava a base", [(await salvarPublicadoML(salvo.id, { preco: 49.9, atributos: {} })).ok, (await carregarAnuncioML(salvo.id)).publicacao.enviado.precoDaLoja], [true, 59.9]);
    }
  }

  {
    console.log("\nVariantes do produto (o que falta pelas faixas)");
    await limpar();
    const { variantesDoProduto } = await import("../src/lib/canaisDeVenda/ml/faixas.js");
    const { clonarVarianteML } = await import("../src/lib/canaisDeVenda/ml/variantes.js");
    const { criarMLFalso } = await import("./lib/mlFalso.js");
    const linha = (extra) => ({ codigo: "A", sku: "A", tipoAnuncio: "gold_special", freteGratis: false, preco: 45.99, status: "PUBLICADO", situacaoCanal: "ATIVA", ...extra });
    conferir("abaixo de 72 com o sem frete: nada falta", variantesDoProduto({ precoVenda: 45.9, anuncios: [linha()] }), { esperadas: ["classico_sem_frete"], existentes: ["classico_sem_frete"], faltam: [] });
    conferir("abaixo de 72, um anuncio com frete gratis que ja existe nao e cobrado nem apagado", variantesDoProduto({ precoVenda: 45.9, anuncios: [linha(), linha({ freteGratis: true, preco: 53.49 })] }), { esperadas: ["classico_sem_frete"], existentes: ["classico_sem_frete", "classico_frete_gratis"], faltam: [] });
    conferir("a partir de 79: so o com frete gratis, e o preco >= 79 conta como ele", variantesDoProduto({ precoVenda: 89.9, anuncios: [linha({ preco: 89.99 })] }), { esperadas: ["classico_frete_gratis"], existentes: ["classico_frete_gratis"], faltam: [] });
    conferir("kit na lista e anuncio encerrado nao contam", variantesDoProduto({ precoVenda: 45.9, anuncios: [linha({ codigo: "A_10" }), linha({ freteGratis: true, situacaoCanal: "ENCERRADA" })] }), { esperadas: ["classico_sem_frete"], existentes: [], faltam: ["classico_sem_frete"] });
    conferir("rascunho conta como existente (vai virar anuncio)", variantesDoProduto({ precoVenda: 45.9, anuncios: [linha({ status: "RASCUNHO", situacaoCanal: null })] }).existentes, ["classico_sem_frete"]);
    // Sem preco na loja, a faixa sai do Classico que ja existe (08/11/2026); sem nenhum preco, nada esperado.
    conferir("sem preco de venda: a faixa pelo Classico existente", variantesDoProduto({ precoVenda: null, anuncios: [linha()] }), { esperadas: ["classico_sem_frete"], existentes: ["classico_sem_frete"], faltam: [] });
    conferir("sem preco nenhum: nada esperado", variantesDoProduto({ precoVenda: null, anuncios: [] }), { esperadas: [], existentes: [], faltam: [] });
    // Os anuncios que a conta do ML ja tem do SKU, fora do Rise (pedido do dono em 08/11/2026: "se ja tem anuncio o mesmo ja deve
    // ser carregado no card junto com as outras variantes"): contam como existentes, para o "Faltam" nao pedir o que ja existe.
    conferir("anuncio da conta fora do Rise conta como existente", variantesDoProduto({ precoVenda: 89.9, anuncios: [], naConta: [{ tipoAnuncio: "gold_special", freteGratis: true, preco: 95, status: "active" }] }), { esperadas: ["classico_frete_gratis"], existentes: ["classico_frete_gratis"], faltam: [] });
    conferir("anuncio da conta sem frete abaixo de 72 cobre a variante", variantesDoProduto({ precoVenda: 45.9, anuncios: [], naConta: [{ tipoAnuncio: "gold_special", freteGratis: false, preco: 39.9, status: "paused" }] }).faltam, []);
    // A faixa usa o MAIOR entre o preco da loja e o dos Classicos ja feitos: o preco no ML passa do da loja, e o Premium e
    // "a partir de R$ 150 no ML".
    conferir("Classico do produto a R$ 159 no ML (loja a 139): falta o Premium", variantesDoProduto({ precoVenda: 139, anuncios: [linha({ freteGratis: true, preco: 159 })] }).faltam, ["premium_frete_gratis"]);
    conferir("com Classico e Premium acima de 150: nada falta", variantesDoProduto({ precoVenda: 139, anuncios: [linha({ freteGratis: true, preco: 159 }), linha({ tipoAnuncio: "gold_pro", freteGratis: true, preco: 169 })] }).faltam, []);
    conferir("premium existente nao cobre o classico", variantesDoProduto({ precoVenda: 45.9, anuncios: [linha({ tipoAnuncio: "gold_pro" })] }).faltam, ["classico_sem_frete"]);

    // A linha do anuncio traz o frete gratis e o SKU do produto base (o kit tem outro codigo).
    const produto = await prisma.produto.create({ data: { sku: "ZZ-ML-VA", tituloBase: "ZZ VA", descricaoBase: "Descricao", conferido: true, blingId: "1", pesoKg: 0.05, alturaCm: 2, larguraCm: 6, comprimentoCm: 7, estoque: 10, precoVenda: 45.9, custo: 20 } });
    const { rascunho } = await novoRascunhoML(produto.id);
    const salvo = await salvarRascunhoML(null, { ...rascunho, titulo: "PLACA ZZ VA", categoriaId: "MLB99779", preco: 45.99, estoque: 5, envio: { ...rascunho.envio, freteGratis: false } });
    if (!salvo.ok) throw new Error(`cenario: ${salvo.erro}`);
    const linhas = await anunciosMLDoProduto(produto.id);
    conferir("linha do anuncio: freteGratis e sku", [linhas[0].freteGratis, linhas[0].sku, linhas[0].codigo], [false, "ZZ-ML-VA", "ZZ-ML-VA"]);
    conferir("variantes pelas linhas de verdade: abaixo de 72 nada falta", variantesDoProduto({ precoVenda: 45.9, anuncios: linhas }).faltam, []);
    conferir("produto de R$ 89,90 so com o sem frete (preco do anuncio < 79): falta o com frete gratis", variantesDoProduto({ precoVenda: 89.9, anuncios: linhas }).faltam, ["classico_frete_gratis"]);

    // Criar a variante: um clone (nada gravado) com o frete gratis ligado e o preco pelo lucro da loja; sem categoria, o preco
    // fica o do clone e o aviso diz.
    const ml = criarMLFalso();
    const clone = await clonarVarianteML(salvo.id, "classico_frete_gratis", { ml });
    conferir("clonar variante: frete gratis ligado, preco acima do original, nada gravado", [clone.ok, clone.rascunho.envio.freteGratis, clone.rascunho.tipoAnuncio, clone.rascunho.preco > 45.99, clone.aviso ?? null, await prisma.anuncio.count({ where: { produtoId: produto.id } })], [true, true, "gold_special", true, null, 1]);
    conferir("clonar variante: variante invalida recusa", (await clonarVarianteML(salvo.id, "xyz", { ml })).ok, false);
    await prisma.anuncio.update({ where: { id: salvo.id }, data: { categoriaExternaId: null } });
    const semCategoria = await clonarVarianteML(salvo.id, "classico_frete_gratis", { ml });
    conferir("clonar variante sem categoria: preco do clone e aviso", [semCategoria.ok, semCategoria.rascunho.preco, /categoria/i.test(String(semCategoria.aviso))], [true, 45.99, true]);
  }

  {
    console.log("\nReaproveitar anuncio da conta (anuncio antigo do SKU vira anuncio PUBLICADO do Rise)");
    await limpar();
    const { candidatosParaReaproveitar, anunciosDoSkuNaConta, reaproveitarAnuncioML } = await import("../src/lib/canaisDeVenda/ml/reaproveitar.js");
    const { criarMLFalso } = await import("./lib/mlFalso.js");
    const itemAntigo = {
      id: "MLBANTIGO1", title: "Placa ZZ RE antiga", price: 39.9, listing_type_id: "gold_special", shipping: { free_shipping: false },
      sold_quantity: 3, status: "active", catalog_listing: false, category_id: "MLB99779", permalink: "https://produto.mercadolivre.com.br/MLBANTIGO1",
      family_name: "PLACA ZZ RE", date_created: "2025-03-01T12:00:00.000Z", seller_custom_field: "ZZ-ML-RE",
    };
    const fechado = { ...itemAntigo, id: "MLBFECHADO", status: "closed", sold_quantity: 9 };
    const doRise = { ...itemAntigo, id: "MLBDORISE", sold_quantity: 50 };
    const semVenda = { ...itemAntigo, id: "MLBSEMVENDA", sold_quantity: 0, status: "paused" };

    // Puro: tira os do Rise e os encerrados; ativo primeiro, depois quem vendeu mais.
    const candidatos = candidatosParaReaproveitar([semVenda, fechado, doRise, itemAntigo], { idsDoRise: new Set(["MLBDORISE"]) });
    conferir("candidatos: sem os do Rise e sem closed, ativo primeiro", candidatos.map((c) => c.id), ["MLBANTIGO1", "MLBSEMVENDA"]);
    conferir("candidatos: os campos da linha", Object.keys(candidatos[0]).sort(), ["catalogo", "categoriaId", "freteGratis", "id", "kit", "link", "preco", "status", "tipoAnuncio", "titulo", "vendidos"]);
    // Kits do codigo na conta (dono, 09/11/2026: o 910207 tinha o kit 20x com o codigo 910207_20 e a proposta nao achou).
    const { kitDoCodigo } = await import("../src/lib/canaisDeVenda/ml/reaproveitar.js");
    conferir("kitDoCodigo: o proprio codigo e 1, codigo_N e N, o resto nao e do produto", ["910207", "910207_20", " 910207_5 ", "9102070", "910207-20", "910207_1", "910207_x", "", null].map((c) => kitDoCodigo(c, "910207")), [1, 20, 5, null, null, null, null, null, null]);
    conferir("candidatos: kit lido do codigo do item (seller_custom_field ou SELLER_SKU)", candidatosParaReaproveitar([itemAntigo, { ...itemAntigo, id: "MLBK20", seller_custom_field: "ZZ-ML-RE_20" }, { ...itemAntigo, id: "MLBK5", seller_custom_field: null, attributes: [{ id: "SELLER_SKU", value_name: "ZZ-ML-RE_5" }] }], { idsDoRise: new Set(), sku: "ZZ-ML-RE" }).map((c) => [c.id, c.kit]), [["MLBANTIGO1", null], ["MLBK20", 20], ["MLBK5", 5]]);
    conferir("candidatos: valores lidos do item", [candidatos[0].titulo, candidatos[0].preco, candidatos[0].tipoAnuncio, candidatos[0].freteGratis, candidatos[0].vendidos, candidatos[0].catalogo, candidatos[0].link], ["Placa ZZ RE antiga", 39.9, "gold_special", false, 3, false, "https://produto.mercadolivre.com.br/MLBANTIGO1"]);

    const produto = await prisma.produto.create({ data: { sku: "ZZ-ML-RE", tituloBase: "ZZ RE", descricaoBase: "Descricao do Rise", conferido: true, blingId: "1", pesoKg: 0.05, alturaCm: 2, larguraCm: 6, comprimentoCm: 7, estoque: 10, precoVenda: 45.9, custo: 20 } });
    const ml = criarMLFalso({ meusItens: { "ZZ-ML-RE": [itemAntigo, fechado] } });
    const naConta = await anunciosDoSkuNaConta(ml, "ZZ-ML-RE");
    conferir("anuncios do SKU na conta: le a busca e cada item", [naConta.ok, naConta.itens.map((i) => i.id)], [true, ["MLBANTIGO1", "MLBFECHADO"]]);

    conferir("reaproveitar: item encerrado recusa", /encerrado/i.test(String((await reaproveitarAnuncioML(produto.id, "MLBFECHADO", { ml })).erro)), true);
    const outroSku = criarMLFalso({ meusItens: { "OUTRO": [{ ...itemAntigo, id: "MLBOUTRO", seller_custom_field: "OUTRO" }] } });
    conferir("reaproveitar: item de outro SKU recusa", /SKU/.test(String((await reaproveitarAnuncioML(produto.id, "MLBOUTRO", { ml: outroSku })).erro)), true);

    const feito = await reaproveitarAnuncioML(produto.id, "MLBANTIGO1", { ml });
    conferir("reaproveitar: cria o anuncio", [feito.ok, typeof feito.anuncioId], [true, "string"]);
    const gravado = await prisma.anuncio.findUnique({ where: { id: feito.anuncioId } });
    conferir("reaproveitar: colunas do anuncio", [gravado.canal, gravado.status, gravado.idExterno, gravado.urlExterna, gravado.categoriaExternaId, gravado.titulo, gravado.temVendas, gravado.publicadoEm?.toISOString()], ["MERCADO_LIVRE", "PUBLICADO", "MLBANTIGO1", "https://produto.mercadolivre.com.br/MLBANTIGO1", "MLB99779", "Placa ZZ RE antiga", true, "2025-03-01T12:00:00.000Z"]);
    conferir("reaproveitar: dados do item no rascunho", [gravado.dados.tipoAnuncio, gravado.dados.envio.freteGratis, gravado.dados.preco], ["gold_special", false, 39.9]);
    const pub = gravado.dados.publicacao;
    conferir("reaproveitar: publicacao", [pub.itemId, pub.statusML, pub.criadoCom, pub.reaproveitado?.blingMovidoEm, typeof pub.reaproveitado?.em, pub.enviado.titulo, pub.enviado.preco, pub.enviado.ficha, pub.enviado.prazo, pub.enviado.precoDaLoja], ["MLBANTIGO1", "active", null, null, "string", "Placa ZZ RE antiga", 39.9, [], null, null]);
    conferir("reaproveitar: as etapas do simples constam feitas", pub.feitas.includes("gravar") && !pub.feitas.includes("kit_bling"), true);
    conferir("reaproveitar: zero escritas no ML", ml.escritas.length, 0);
    const aberto = await carregarAnuncioML(feito.anuncioId);
    // O preco do editor E o do ML (39,90), entao `preco` nao acende; o que acende e o preco da loja (45,90 contra nenhum).
    conferir("reaproveitar: abre com '!' em descricao e no preco da loja (nada do produto conferido)", [aberto.status, aberto.mudancas.naoConferido, aberto.mudancas.partes.includes("descricao"), aberto.mudancas.partes.includes("precoDaLoja"), aberto.mudancas.partes.includes("preco")], ["PUBLICADO", true, true, true, false]);
    conferir("reaproveitar: o mesmo item de novo recusa", /já está no Rise/.test(String((await reaproveitarAnuncioML(produto.id, "MLBANTIGO1", { ml })).erro)), true);
    conferir("reaproveitar: continua um so anuncio", await prisma.anuncio.count({ where: { produtoId: produto.id } }), 1);

    // O kit do codigo (codigo_N): a busca o acha pelos codigos de kit e o Reaproveitar o adota como kit do produto base.
    const kit20 = { ...itemAntigo, id: "MLBKIT20", title: "20x Placa ZZ RE", price: 299, sold_quantity: 10, status: "paused", seller_custom_field: "ZZ-ML-RE_20", permalink: "https://produto.mercadolivre.com.br/MLBKIT20" };
    const mlKit = criarMLFalso({ meusItens: { "ZZ-ML-RE": [itemAntigo], "ZZ-ML-RE_20": [kit20] } });
    const comKits = await anunciosDoSkuNaConta(mlKit, "ZZ-ML-RE");
    conferir("anuncios do SKU na conta: acha tambem o kit codigo_N", [comKits.ok, comKits.itens.map((i) => i.id).sort()], [true, ["MLBANTIGO1", "MLBKIT20"]]);
    const feitoKit = await reaproveitarAnuncioML(produto.id, "MLBKIT20", { ml: mlKit });
    const gravadoKit = feitoKit.ok ? await prisma.anuncio.findUnique({ where: { id: feitoKit.anuncioId } }) : null;
    conferir("reaproveitar kit: vira o kit de 20 do produto base", [feitoKit.ok, gravadoKit?.produtoId === produto.id, gravadoKit?.dados?.composicao?.codigo, gravadoKit?.dados?.composicao?.itens, gravadoKit?.idExterno, gravadoKit?.dados?.preco], [true, true, "ZZ-ML-RE_20", [{ produtoId: produto.id, quantidade: 20 }], "MLBKIT20", 299]);
    conferir("reaproveitar kit: etapas do kit feitas, atacado desligado, zero escritas", [gravadoKit?.dados?.publicacao?.feitas?.includes("kit_bling"), gravadoKit?.dados?.atacado, mlKit.escritas.length], [true, { faixas: [], ligado: false }, 0]);
    conferir("reaproveitar kit: abre como kit publicado", [(await carregarAnuncioML(feitoKit.anuncioId)).status, Boolean((await carregarAnuncioML(feitoKit.anuncioId)).rascunho?.composicao)], ["PUBLICADO", true]);

    // As fotos do kit reaproveitado (910207_20, 09/11/2026): o ML tem as fotos antigas, que o Rise nao conhece. O "!" de fotos
    // acende, e o primeiro Salvar nao as da por enviadas (senao o Enviar mudancas nunca as manda).
    await prisma.produtoArquivo.create({ data: { produtoId: produto.id, tipo: "IMAGEM", papel: "FOTO", arquivo: "ZZ-ML-RE-a.jpg", ordem: 0, principal: true } });
    const kitComFoto = { ...kit20, id: "MLBKIT30", seller_custom_field: "ZZ-ML-RE_30" };
    const mlFoto = criarMLFalso({ meusItens: { "ZZ-ML-RE_30": [kitComFoto] } });
    const feitoFoto = await reaproveitarAnuncioML(produto.id, "MLBKIT30", { ml: mlFoto });
    const abertoFoto = await carregarAnuncioML(feitoFoto.anuncioId);
    conferir("reaproveitar kit: o '!' de fotos acende (o ML tem fotos que o Rise nao mandou)", [feitoFoto.ok, abertoFoto.rascunho?.imagens?.length, abertoFoto.mudancas.partes.includes("fotos")], [true, 1, true]);
    const { salvarPublicadoML: salvarKit } = await import("../src/lib/canaisDeVenda/ml/banco.js");
    const salvoFoto = await salvarKit(feitoFoto.anuncioId, { preco: 299, atributos: abertoFoto.rascunho.atributos, imagens: abertoFoto.rascunho.imagens });
    conferir("reaproveitar kit: depois do 1o Salvar o '!' de fotos continua", [salvoFoto.ok, (await carregarAnuncioML(feitoFoto.anuncioId)).mudancas.partes.includes("fotos")], [true, true]);
  }

  {
    console.log("\nTitulo no envio e o vinculo do Bling movido para a Rise_ML (anuncio reaproveitado)");
    await limpar();
    const { reaproveitarAnuncioML } = await import("../src/lib/canaisDeVenda/ml/reaproveitar.js");
    const { enviarMudancasML } = await import("../src/lib/canaisDeVenda/ml/atualizar.js");
    const { moverVinculoParaRiseML, LOJA_ML_NO_BLING, LOJA_ML_ANTIGA_NO_BLING } = await import("../src/lib/canaisDeVenda/ml/bling.js");
    const { PARTES_DO_ANUNCIO, NOMES_DAS_PARTES, mudancasDoAnuncio, conteudoAtualDoAnuncio } = await import("../src/lib/canaisDeVenda/ml/acompanhar.js");
    const { impressaoDoConteudo } = await import("../src/lib/canaisDeVenda/ml/impressao.js");
    const { ETAPAS_DO_ENVIO_ML, PARTES_DO_ENVIO_ML, etapasDoEnvioML } = await import("../src/lib/canaisDeVenda/ml/etapasDoEnvio.js");
    const { gravarPublicacao } = await import("../src/lib/canaisDeVenda/ml/banco.js");
    const { criarMLFalso } = await import("./lib/mlFalso.js");
    const { criarBlingFalso } = await import("./lib/blingFalso.js");

    // Regras puras: o titulo e parte do anuncio, mas so conta quando a impressao o tem (os publicados pelo Rise nao tem).
    conferir("titulo: parte do anuncio com nome", [PARTES_DO_ANUNCIO.includes("titulo"), NOMES_DAS_PARTES.titulo], [true, "título"]);
    const base = { descricao: "x", fotos: [], pacote: null, preco: 10, ficha: [], prazo: 0, precoDaLoja: 20 };
    conferir("titulo: impressao sem titulo nao acende", mudancasDoAnuncio(base, { ...base, titulo: "NOVO" }).partes, []);
    conferir("titulo: impressao com outro titulo acende", mudancasDoAnuncio({ ...base, titulo: "VELHO" }, { ...base, titulo: "NOVO" }).partes, ["titulo"]);
    conferir("titulo: conteudo atual leva o titulo do rascunho", conteudoAtualDoAnuncio({ produtoId: "x", titulo: "T", preco: 1, atributos: {}, composicao: null, envio: {} }, {}).titulo, "T");
    conferir("titulo: a impressao guarda o titulo", impressaoDoConteudo({ titulo: "T" }).titulo, "T");
    conferir("etapas: titulo e bling", [ETAPAS_DO_ENVIO_ML.map((e) => e.id), PARTES_DO_ENVIO_ML], [["permissao", "ler", "titulo", "descricao", "fotos", "pacote", "precoDaLoja", "preco", "ficha", "prazo", "atacado", "bling", "conferir"], ["titulo", "descricao", "fotos", "pacote", "precoDaLoja", "preco", "ficha", "prazo", "atacado"]]);
    conferir("etapas do popup: atacado so quando a impressao o tem", [etapasDoEnvioML({}).some((e) => e.id === "atacado"), etapasDoEnvioML({ comAtacado: true }).some((e) => e.id === "atacado")], [false, true]);
    conferir("etapas do popup: titulo e bling so quando se aplicam", [etapasDoEnvioML({ comTitulo: false, comBling: false }).map((e) => e.id).filter((id) => id === "titulo" || id === "bling"), etapasDoEnvioML({ comTitulo: true, comBling: true }).map((e) => e.id).filter((id) => id === "titulo" || id === "bling")], [[], ["titulo", "bling"]]);
    conferir("loja antiga do ML no Bling", LOJA_ML_ANTIGA_NO_BLING, "203593931");

    const item = (id, extra) => ({
      id, title: "Placa ZZ TI antiga", price: 39.9, listing_type_id: "gold_special", shipping: { free_shipping: false }, sold_quantity: 3, status: "active",
      catalog_listing: false, category_id: "MLB99779", permalink: `https://produto.mercadolivre.com.br/${id}`, family_name: "PLACA ZZ TI", date_created: "2025-03-01T12:00:00.000Z",
      seller_custom_field: "ZZ-ML-TI", ...extra,
    });
    const produtosDoBling = [{ id: 201, codigo: "ZZ-ML-TI", nome: "PLACA ZZ TI", formato: "S", preco: 39.9 }];
    const antigoNoBling = {
      vinculosDeLoja: [{ codigo: "MLBANTIGO1", preco: 39.9, produto: { id: 201 }, loja: { id: 203593931 } }],
      anuncios: [
        { produto: { id: 201 }, loja: { id: 203593931 }, anuncioLoja: { id: "MLBANTIGO1" }, nome: "Placa ZZ TI antiga", preco: { valor: 39.9 }, situacao: 1 },
        { produto: { id: 201 }, loja: { id: 203593931 }, anuncioLoja: { id: "MLBANTIGO2" }, nome: "Placa ZZ TI antiga", preco: { valor: 39.9 }, situacao: 1 },
      ],
    };
    const lojaDe = (bling, codigo) => [...bling.estado.vinculosDeLoja.values()].filter((v) => v.codigo === codigo).map((v) => String(v.loja.id));
    const registrosDe = (bling, mlb) => [...bling.estado.anuncios.values()].filter((a) => a.anuncioLoja.id === mlb).map((a) => String(a.loja.id));

    // moverVinculoParaRiseML sozinho: cria na Rise_ML, apaga o vinculo e o registro do ML_4h, registra em /anuncios.
    {
      const bling = criarBlingFalso({ produtos: produtosDoBling, ...antigoNoBling });
      const movido = await moverVinculoParaRiseML(bling, "ZZ-ML-TI", "MLBANTIGO1", { preco: 39.9, titulo: "Placa ZZ TI antiga", tipoAnuncio: "gold_special" });
      conferir("mover: do ML_4h para a Rise_ML", [movido.ok, movido.de, movido.criado, movido.apagado, movido.registrado], [true, "ML_4h", true, true, true]);
      conferir("mover: o vinculo e o registro ficaram so na Rise_ML", [lojaDe(bling, "MLBANTIGO1"), registrosDe(bling, "MLBANTIGO1"), registrosDe(bling, "MLBANTIGO2")], [[LOJA_ML_NO_BLING], [LOJA_ML_NO_BLING], ["203593931"]]);
      const ordem = bling.chamadas.filter((c) => c.metodo === "POST" || c.metodo === "DELETE").map((c) => `${c.metodo} ${c.caminho.replace(/\/\d+$/, "/{id}")}`);
      conferir("mover: cria antes de apagar", ordem, ["POST /produtos/lojas", "DELETE /produtos/lojas/{id}", "DELETE /anuncios/{id}", "POST /anuncios"]);
      conferir("mover: de novo nao escreve nada", [(await moverVinculoParaRiseML(bling, "ZZ-ML-TI", "MLBANTIGO1", { preco: 39.9, titulo: "x", tipoAnuncio: "gold_special" })).de, bling.chamadas.filter((c) => c.metodo !== "GET" && c.metodo !== "exigirEscrita").length], ["Rise_ML", 4]);

      const recusa = criarBlingFalso({ produtos: produtosDoBling, ...antigoNoBling, falhas: [{ metodo: "POST", caminho: "/produtos/lojas", status: 400, mensagem: "recusado" }] });
      const recusado = await moverVinculoParaRiseML(recusa, "ZZ-ML-TI", "MLBANTIGO1", { preco: 39.9, titulo: "x", tipoAnuncio: "gold_special" });
      conferir("mover: criacao recusada nao apaga nada", [recusado.ok, lojaDe(recusa, "MLBANTIGO1"), recusa.chamadas.some((c) => c.metodo === "DELETE")], [false, ["203593931"], false]);

      const jaNaRise = criarBlingFalso({ produtos: produtosDoBling, vinculosDeLoja: [{ codigo: "MLBANTIGO1", preco: 39.9, produto: { id: 201 }, loja: { id: 206326819 } }] });
      const semMover = await moverVinculoParaRiseML(jaNaRise, "ZZ-ML-TI", "MLBANTIGO1", { preco: 39.9, titulo: "x", tipoAnuncio: "gold_special" });
      conferir("mover: ja na Rise_ML so registra", [semMover.ok, semMover.de, semMover.criado, semMover.apagado, semMover.registrado, jaNaRise.chamadas.some((c) => c.metodo === "POST" && c.caminho === "/produtos/lojas")], [true, "Rise_ML", false, false, true, false]);

      const travado = criarBlingFalso({ produtos: produtosDoBling, ...antigoNoBling, codigosLiberados: ["outro"] });
      conferir("mover: travado nao escreve", [(await moverVinculoParaRiseML(travado, "ZZ-ML-TI", "MLBANTIGO1", { preco: 39.9, titulo: "x", tipoAnuncio: "gold_special" })).ok, travado.chamadas.filter((c) => c.metodo !== "GET" && c.metodo !== "exigirEscrita").length], [false, 0]);
    }

    // O envio de verdade: o anuncio reaproveitado com vendas pula o titulo (aviso) e pede para mover o Bling; o Mover move.
    const produto = await prisma.produto.create({ data: { sku: "ZZ-ML-TI", tituloBase: "ZZ TI", descricaoBase: "Descricao", conferido: true, blingId: "201", pesoKg: 0.05, alturaCm: 2, larguraCm: 6, comprimentoCm: 7, estoque: 10, precoVenda: 45.9, custo: 20 } });
    const ml = criarMLFalso({ meusItens: { "ZZ-ML-TI": [item("MLBANTIGO1"), item("MLBANTIGO2", { sold_quantity: 0 })] } });
    const bling = criarBlingFalso({ produtos: produtosDoBling, ...antigoNoBling });
    // So o titulo muda: a impressao passa a ser a de agora, com o titulo do ML.
    const soOTitulo = async (anuncioId, novoTitulo) => {
      await prisma.anuncio.update({ where: { id: anuncioId }, data: { titulo: novoTitulo } });
      const carregado = await carregarAnuncioML(anuncioId);
      const atual = impressaoDoConteudo(conteudoAtualDoAnuncio(carregado.rascunho, carregado.contexto.produtos));
      await gravarPublicacao(anuncioId, { enviado: { ...atual, titulo: "Placa ZZ TI antiga" } });
      return (await carregarAnuncioML(anuncioId)).mudancas.partes;
    };
    const comVendas = await reaproveitarAnuncioML(produto.id, "MLBANTIGO1", { ml });
    // Regra 3 (08/11/2026): o anuncio que a conta ja tinha nao tem faixas de atacado no ML, entao abre DESLIGADO (ligar e do dono).
    conferir("reaproveitar: atacado desligado e sem '!' de atacado", [(await prisma.anuncio.findUnique({ where: { id: comVendas.anuncioId }, select: { dados: true } })).dados.atacado, (await carregarAnuncioML(comVendas.anuncioId)).mudancas.partes.includes("atacado")], [{ faixas: [], ligado: false }, false]);
    conferir("envio: so o titulo mudou", await soOTitulo(comVendas.anuncioId, "PLACA NOVA COM VENDAS"), ["titulo"]);
    const putsDeTitulo = () => ml.escritas.filter((e) => e.metodo === "PUT" && /^\/items\/MLB[^/]+$/.test(e.caminho) && (e.corpo?.family_name || e.corpo?.title));
    const semMover = await enviarMudancasML(comVendas.anuncioId, { ml, bling });
    conferir("envio com vendas: titulo registrado sem PUT, com aviso, e pede o Bling", [semMover.ok, semMover.enviadas, putsDeTitulo().length, (semMover.avisos ?? []).some((a) => /título/.test(a)), semMover.pedeBling], [true, ["titulo"], 0, true, { de: "ML_4h", codigo: "ZZ-ML-TI", itemId: "MLBANTIGO1" }]);
    conferir("envio com vendas: o titulo nao acende de novo", (await carregarAnuncioML(comVendas.anuncioId)).mudancas.partes, []);
    conferir("envio sem Mover: o Bling ficou como estava", lojaDe(bling, "MLBANTIGO1"), ["203593931"]);
    const movendo = await enviarMudancasML(comVendas.anuncioId, { ml, bling, moverBling: true });
    conferir("envio com Mover: nada a enviar, o Bling e movido e registrado", [movendo.ok, movendo.enviadas, movendo.bling?.ok, movendo.bling?.de, movendo.pedeBling ?? null, lojaDe(bling, "MLBANTIGO1"), registrosDe(bling, "MLBANTIGO1")], [true, [], true, "ML_4h", null, [LOJA_ML_NO_BLING], [LOJA_ML_NO_BLING]]);
    const pubMovida = (await prisma.anuncio.findUnique({ where: { id: comVendas.anuncioId } })).dados.publicacao;
    conferir("envio com Mover: blingMovidoEm gravado", typeof pubMovida.reaproveitado.blingMovidoEm, "string");
    const deNovo = await enviarMudancasML(comVendas.anuncioId, { ml, bling });
    conferir("envio depois de movido: nao pede mais o Bling", [deNovo.ok, deNovo.pedeBling ?? null, deNovo.bling ?? null], [true, null, null]);

    const semVendas = await reaproveitarAnuncioML(produto.id, "MLBANTIGO2", { ml });
    conferir("envio sem vendas: so o titulo mudou", await soOTitulo(semVendas.anuncioId, "PLACA NOVA SEM VENDAS"), ["titulo"]);
    const enviado = await enviarMudancasML(semVendas.anuncioId, { ml, bling });
    conferir("envio sem vendas: PUT com family_name e o Bling so registra", [enviado.ok, enviado.enviadas, putsDeTitulo().map((e) => [e.caminho, e.corpo]), enviado.avisos ?? [], enviado.pedeBling?.de], [true, ["titulo"], [["/items/MLBANTIGO2", { family_name: "PLACA NOVA SEM VENDAS" }]], [], "ML_4h"]);
    const semFamily = criarMLFalso({ meusItens: { "ZZ-ML-TI": [item("MLBANTIGO2", { sold_quantity: 0, family_name: undefined })] } });
    await soOTitulo(semVendas.anuncioId, "PLACA NOVA SEM FAMILY");
    const porTitle = await enviarMudancasML(semVendas.anuncioId, { ml: semFamily, bling });
    conferir("envio sem vendas e sem family_name: PUT com title", [porTitle.ok, semFamily.escritas.filter((e) => e.metodo === "PUT").map((e) => e.corpo)], [true, [{ title: "PLACA NOVA SEM FAMILY" }]]);
    const soRegistra = await enviarMudancasML(semVendas.anuncioId, { ml, bling, moverBling: true });
    conferir("envio sem vendas com Mover: o registro antigo sai e a Rise_ML registra", [soRegistra.ok, soRegistra.bling?.de, soRegistra.bling?.criado, soRegistra.bling?.apagado, registrosDe(bling, "MLBANTIGO2"), lojaDe(bling, "MLBANTIGO1")], [true, "ML_4h", false, true, [LOJA_ML_NO_BLING], [LOJA_ML_NO_BLING]]);
  }

  {
    console.log("\nPreços de atacado (regras)");
    const { ATACADO_PADRAO, FAIXAS_PADRAO, atacadoPermitido, corpoDoAtacado, enviarAtacadoML, faixasComRecomendacao, faixasLidas, impressaoDoAtacado, lerRecomendacaoDeAtacado, lerVersaoDoItem, textoSemSugestaoDeAtacado } =
      await import("../src/lib/canaisDeVenda/ml/atacado.js");
    // O botao "Recomendação do ML" sem sugestao (pedido do dono em 09/11/2026: "o botao de recomendacao do ML para atacado nao esta
    // funcionando"): sem frete gratis o ML nunca sugere; com frete gratis, o anuncio recem-publicado ainda nao tem sugestao.
    conferir("botao sem sugestao: sem frete gratis explica que o ML nao sugere e manda digitar", [/Sem frete grátis/.test(textoSemSugestaoDeAtacado({ comFreteGratis: false })), /digite/.test(textoSemSugestaoDeAtacado({ comFreteGratis: false }))], [true, true]);
    conferir("botao sem sugestao: com frete gratis pede para tentar de novo", /tente de novo/.test(textoSemSugestaoDeAtacado({ comFreteGratis: true })), true);
    const { mlPost } = await import("../src/lib/integracoes/mercadolivre.js");
    const { criarMLFalso } = await import("./lib/mlFalso.js");
    const { RascunhoMLSchema: Esquema } = await import("../src/lib/canaisDeVenda/ml/esquema.js");
    const { rascunhoDoAnuncio } = await import("../src/lib/canaisDeVenda/ml/banco.js");

    conferir("padrao: 4 faixas ligadas, sem %", ATACADO_PADRAO(), { ligado: true, faixas: [2, 5, 10, 20].map((quantidade) => ({ quantidade, percentual: null })) });
    conferir("padrao: faixas 2/5/10/20", FAIXAS_PADRAO, [2, 5, 10, 20]);
    const rec = [
      { quantity: 2, discount_percentage: 0.82 },
      { quantity: 10, discount_percentage: 9.86 },
    ];
    conferir(
      "recomendacao: sem % vira o recomendado; acima fica o do dono; abaixo sobe",
      faixasComRecomendacao([{ quantidade: 2, percentual: null }, { quantidade: 10, percentual: 12 }, { quantidade: 5, percentual: 1 }], [...rec, { quantity: 5, discount_percentage: 5.5 }]),
      [{ quantidade: 2, percentual: 0.82 }, { quantidade: 10, percentual: 12 }, { quantidade: 5, percentual: 5.5 }],
    );
    conferir("recomendacao: faixa sem recomendacao fica com o que tinha", faixasComRecomendacao([{ quantidade: 7, percentual: 3 }, { quantidade: 8, percentual: null }], rec), [{ quantidade: 7, percentual: 3 }, { quantidade: 8, percentual: 0 }]);
    conferir(
      "corpo: ordenado por quantidade, so % > 0, no formato do ML",
      corpoDoAtacado([{ quantidade: 10, percentual: 9.86 }, { quantidade: 2, percentual: 0 }, { quantidade: 5, percentual: 5.5 }]),
      {
        price_per_quantity: [
          { type: "discount_percentage", percentage: 5.5, conditions: { context_restrictions: ["channel_marketplace", "user_type_business"], min_purchase_unit: 5, eligible: true } },
          { type: "discount_percentage", percentage: 9.86, conditions: { context_restrictions: ["channel_marketplace", "user_type_business"], min_purchase_unit: 10, eligible: true } },
        ],
      },
    );
    conferir("corpo: desligado manda a lista vazia", corpoDoAtacado([], { ligado: false }), { price_per_quantity: [] });
    conferir("corpo: desligado ignora as faixas", corpoDoAtacado([{ quantidade: 2, percentual: 5 }], { ligado: false }), { price_per_quantity: [] });
    conferir(
      "lidas: do price_per_quantity do ML",
      faixasLidas({ price_per_quantity: [{ id: "p2", type: "discount_percentage", percentage: 9.86, conditions: { min_purchase_unit: 10 } }, { id: "p1", type: "discount_percentage", percentage: 0.82, conditions: { min_purchase_unit: 2 } }] }),
      [{ quantidade: 2, percentual: 0.82, id: "p1" }, { quantidade: 10, percentual: 9.86, id: "p2" }],
    );
    conferir("lidas: sem o campo", faixasLidas({ prices: [] }), []);
    // O formato REAL (doc oficial e medicao de 08/11/2026): as faixas sao entradas de `prices[]` com `min_purchase_unit` e o
    // `amount` ja com desconto; o % sai da conta contra o preco padrao (a entrada sem restricao de contexto).
    const precosReais = {
      id: "MLB1",
      prices: [
        { id: "7", type: "standard", amount: 100, conditions: { context_restrictions: [], start_time: null, end_time: null } },
        { id: "10", type: "standard", amount: 90, conditions: { context_restrictions: ["channel_marketplace", "user_type_business"], min_purchase_unit: 10 } },
        { id: "5", type: "standard", amount: 95.5, conditions: { context_restrictions: ["channel_marketplace", "user_type_business"], min_purchase_unit: 5 } },
        { id: "9", type: "standard", amount: 80, conditions: { context_restrictions: ["channel_marketplace"], min_purchase_unit: 3 } },
      ],
    };
    conferir("lidas: formato real de prices[] (so as faixas de negocio, % contra o preco padrao)", faixasLidas(precosReais), [{ quantidade: 5, percentual: 4.5, id: "5" }, { quantidade: 10, percentual: 10, id: "10" }]);
    conferir("impressao: ligado e as faixas em ordem", impressaoDoAtacado({ ligado: true, faixas: [{ quantidade: 10, percentual: 9.86 }, { quantidade: 2, percentual: 0.82 }] }), { ligado: true, faixas: [[2, 0.82], [10, 9.86]] });
    conferir("impressao: desligado", impressaoDoAtacado({ ligado: false, faixas: [{ quantidade: 2, percentual: 5 }] }), { ligado: false, faixas: [] });
    conferir("impressao: sem nada", impressaoDoAtacado(null), { ligado: false, faixas: [] });
    conferir("mlPost aceita headers", mlPost.length, 3);

    // Esquema e rascunho: o campo e opcional (editor aberto antes), e o anuncio gravado antes abre desligado (regra 3).
    conferir("esquema: atacado valido", Esquema.shape.atacado.safeParse({ ligado: true, faixas: [{ quantidade: 2, percentual: null }, { quantidade: 5, percentual: 5.5 }] }).success, true);
    conferir("esquema: quantidade 0 e % 101 recusados", [Esquema.shape.atacado.safeParse({ ligado: true, faixas: [{ quantidade: 0, percentual: null }] }).success, Esquema.shape.atacado.safeParse({ ligado: true, faixas: [{ quantidade: 2, percentual: 101 }] }).success], [false, false]);
    conferir("esquema: 6 faixas recusadas", Esquema.shape.atacado.safeParse({ ligado: true, faixas: [1, 2, 3, 4, 5, 6].map((quantidade) => ({ quantidade, percentual: null })) }).success, false);
    conferir("esquema: ausente passa", Esquema.shape.atacado.safeParse(undefined).success, true);
    conferir("banco: anuncio gravado antes abre desligado", rascunhoDoAnuncio({ produtoId: "x", dados: {} }).atacado, { ligado: false, faixas: [] });
    conferir("banco: o gravado volta igual", rascunhoDoAnuncio({ produtoId: "x", dados: { atacado: { ligado: true, faixas: [{ quantidade: 2, percentual: 1 }] } } }).atacado, { ligado: true, faixas: [{ quantidade: 2, percentual: 1 }] });
    // Kit sem atacado (dono, 09/11/2026: no kit "2 unidades R$ 75/un." parecia o preco de cada peca; o kit ja e a oferta por quantidade).
    const comKitLigado = { produtoId: "x", dados: { composicao: { itens: [{ produtoId: "x", quantidade: 2 }], codigo: "X_2", blingProdutoId: null }, atacado: ATACADO_PADRAO() } };
    conferir("kit: o atacado gravado ligado abre desligado", rascunhoDoAnuncio(comKitLigado).atacado, { ligado: false, faixas: [] });
    conferir("kit: atacadoPermitido so fora do kit", [atacadoPermitido({ composicao: null }), atacadoPermitido(rascunhoDoAnuncio(comKitLigado))], [true, false]);
    {
      const p = { id: "a", sku: "A1", tituloBase: "A", descricaoBase: "d", precoVenda: 10, estoque: 10, imagens: [] };
      const virouKit = aplicarComposicao({ ...rascunhoInicial({ principal: p, produtosPorId: { a: p }, composicao: null }) }, { itens: [{ produtoId: "a", quantidade: 2 }], codigo: "", blingProdutoId: null }, { a: p });
      const nasceKit = rascunhoInicial({ principal: p, produtosPorId: { a: p }, composicao: { itens: [{ produtoId: "a", quantidade: 2 }], codigo: "", blingProdutoId: null } });
      conferir("kit: ligar o Kit de N no editor desliga o atacado, e o kit novo nasce desligado", [virouKit.atacado, nasceKit.atacado], [{ ligado: false, faixas: [] }, { ligado: false, faixas: [] }]);
    }
    const rascunhoNovo = await novoRascunhoML((await prisma.produto.create({ data: { sku: "ZZ-ML-AT", tituloBase: "ZZ AT", descricaoBase: "d", conferido: true, precoVenda: 45.9 } })).id);
    conferir("rascunho novo: nasce sem frete gratis, entao com o atacado desligado (09/11/2026)", rascunhoNovo.rascunho?.atacado ?? rascunhoNovo.atacado, { ligado: false, faixas: [] });

    // O envio contra o ML falso: recomendacao, versao no header, gravacao e leitura de volta.
    const ml = criarMLFalso();
    ml.exigirEscrita("ZZ-ML-AT");
    const criado = await ml.post("/items", { family_name: "ZZ AT", price: 45.9, category_id: "MLB99779", status: "paused" });
    const itemId = criado.dados.id;
    conferir("versao: lida do header x-version de GET /items/{id}/prices", await lerVersaoDoItem(ml, itemId), "1");
    const enviado = await enviarAtacadoML(ml, { itemId, preco: 45.9, atacado: ATACADO_PADRAO() });
    conferir("envio: 4 faixas com o % recomendado", [enviado.ok, enviado.faixas.map((f) => [f.quantidade, f.percentual])], [true, [[2, 0.82], [5, 5.5], [10, 9.86], [20, 12.27]]]);
    const gravacao = ml.escritas.find((e) => e.caminho === `/items/${itemId}/prices/price-per-quantity`);
    conferir("envio: POST com X-Version e o corpo do ML", [gravacao?.headers?.["X-Version"], gravacao?.corpo?.price_per_quantity?.map((p) => [p.conditions.min_purchase_unit, p.percentage])], ["1", [[2, 0.82], [5, 5.5], [10, 9.86], [20, 12.27]]]);
    conferir("envio: a recomendacao foi pedida com o preco e as quantidades", ml.escritas.find((e) => e.caminho === "/prices-per-quantity/v1/recommendations")?.corpo, { item_id: itemId, range_item_quantities: [2, 5, 10, 20], price: { standard_amount: 45.9, currency: "BRL" } });
    const lidas = faixasLidas((await ml.get(`/items/${itemId}/prices`, null, { headers: { "show-all-prices": "true" } })).dados);
    // A leitura real traz o `amount` com o desconto (centavos arredondados), entao o % lido so bate com o enviado ate a 1a casa.
    conferir("envio: o ML falso devolve as faixas gravadas, no formato real de prices[]", lidas.map((f) => [f.quantidade, Math.round(f.percentual * 10) / 10]), [[2, 0.8], [5, 5.5], [10, 9.9], [20, 12.3]]);
    conferir("recomendacao: o formato real (discount.percentage) vira quantity + discount_percentage", await lerRecomendacaoDeAtacado(ml, { itemId, preco: 45.9, quantidades: [2, 5, 10, 20] }), [{ quantity: 2, discount_percentage: 0.82 }, { quantity: 5, discount_percentage: 5.5 }, { quantity: 10, discount_percentage: 9.86 }, { quantity: 20, discount_percentage: 12.27 }]);
    conferir("envio: o % do dono acima do recomendado fica", (await enviarAtacadoML(ml, { itemId, preco: 45.9, atacado: { ligado: true, faixas: [{ quantidade: 10, percentual: 15 }] } })).faixas.map((f) => [f.quantidade, f.percentual]), [[10, 15]]);
    // Cada gravacao sobe a versao no falso (como no ML): o envio seguinte le a nova antes de mandar.
    conferir("envio: a versao sobe a cada gravacao e o envio le a atual", [await lerVersaoDoItem(ml, itemId), ml.escritas.filter((e) => e.caminho === `/items/${itemId}/prices/price-per-quantity`).map((e) => e.headers?.["X-Version"])], ["3", ["1", "2"]]);
    // Versao trocada no meio (outro envio mexeu no item entre a leitura e o POST): 409 na 1a, rele e grava na 2a.
    const conflito = criarMLFalso({ falhas: [{ metodo: "POST", caminho: "/items/MLB", status: 409, dados: { message: "Item version conflict", status: 409 } }] });
    conflito.exigirEscrita("ZZ-ML-AT");
    const emConflito = (await conflito.post("/items", { family_name: "ZZ AT", price: 45.9, category_id: "MLB99779" })).dados.id;
    const comVersaoVelha = await enviarAtacadoML(conflito, { itemId: emConflito, preco: 45.9, atacado: { ligado: true, faixas: [{ quantidade: 2, percentual: null }] } });
    const tentativas = conflito.escritas.filter((e) => e.caminho === `/items/${emConflito}/prices/price-per-quantity`).map((e) => e.headers?.["X-Version"]);
    conferir("envio com versao velha: 409 na 1a, rele e grava na 2a", [comVersaoVelha.ok, comVersaoVelha.faixas.map((f) => [f.quantidade, f.percentual]), tentativas], [true, [[2, 0.82]], ["1", "1"]]);
    const doisConflitos = criarMLFalso({ falhas: [409, 409].map((status) => ({ metodo: "POST", caminho: "/items/MLB", status, dados: { message: "Item version conflict", status } })) });
    doisConflitos.exigirEscrita("ZZ-ML-AT");
    const teimoso = (await doisConflitos.post("/items", { family_name: "ZZ AT", price: 45.9, category_id: "MLB99779" })).dados.id;
    const desistiu = await enviarAtacadoML(doisConflitos, { itemId: teimoso, preco: 45.9, atacado: ATACADO_PADRAO() });
    conferir("envio com dois 409: desiste na 2a com erro", [desistiu.ok, /version conflict/.test(desistiu.erro ?? ""), doisConflitos.escritas.filter((e) => e.caminho.endsWith("/price-per-quantity")).length], [false, true, 2]);
    conferir("envio desligado: manda [] e devolve nenhuma faixa", (await enviarAtacadoML(ml, { itemId, preco: 45.9, atacado: { ligado: false, faixas: [] } })), { ok: true, faixas: [], erro: null });
    // Falha ALTA, nunca "ok" em silencio: recomendacao sem nenhum desconto (o erro de formato que mandava a lista vazia) e leitura de volta vazia.
    const semDesconto = criarMLFalso({ recomendacaoVazia: true });
    semDesconto.exigirEscrita("ZZ-ML-AT");
    const idSemDesconto = (await semDesconto.post("/items", { family_name: "ZZ AT", price: 45.9, category_id: "MLB99779" })).dados.id;
    const resSemDesconto = await enviarAtacadoML(semDesconto, { itemId: idSemDesconto, preco: 45.9, atacado: ATACADO_PADRAO() });
    conferir("recomendacao sem nenhum desconto: erro claro e nada gravado", [resSemDesconto.ok, /recomend/i.test(resSemDesconto.erro ?? ""), semDesconto.escritas.some((e) => e.caminho.endsWith("/price-per-quantity"))], [false, true, false]);
    conferir("recomendacao sem nenhum desconto e sem espera: o motivo e a falta de sugestao", resSemDesconto.motivo, "sem_recomendacao");
    // A sugestao atrasada (09/11/2026, o Premium do kit do 120920 voltou sem sugestao logo depois de criado): com espera, o envio
    // rele a cada intervalo ate o limite. `dormir` falso: o teste nao espera de verdade.
    const atrasado = criarMLFalso({ recomendacaoVazia: 2 });
    atrasado.exigirEscrita("ZZ-ML-AT");
    const idAtrasado = (await atrasado.post("/items", { family_name: "ZZ AT", price: 45.9, category_id: "MLB99779" })).dados.id;
    const esperas = [];
    const andamentos = [];
    const resAtrasado = await enviarAtacadoML(atrasado, { itemId: idAtrasado, preco: 45.9, atacado: ATACADO_PADRAO() }, {
      esperaMs: 90000, intervaloMs: 10000, dormir: async (ms) => { esperas.push(ms); }, aoEsperar: (segundos, limite) => andamentos.push([segundos, limite]),
    });
    conferir("sugestao atrasada: espera 2 vezes, avisa o andamento e envia as 4 faixas", [resAtrasado.ok, esperas, andamentos, resAtrasado.faixas.length], [true, [10000, 10000], [[10, 90], [20, 90]], 4]);
    const nunca = criarMLFalso({ recomendacaoVazia: true });
    nunca.exigirEscrita("ZZ-ML-AT");
    const idNunca = (await nunca.post("/items", { family_name: "ZZ AT", price: 45.9, category_id: "MLB99779" })).dados.id;
    const esperasNunca = [];
    const resNunca = await enviarAtacadoML(nunca, { itemId: idNunca, preco: 45.9, atacado: ATACADO_PADRAO() }, { esperaMs: 90000, intervaloMs: 10000, dormir: async (ms) => { esperasNunca.push(ms); } });
    conferir("sugestao que nao vem: espera ate o limite (9 vezes de 10 s), nao grava e devolve o motivo", [resNunca.ok, esperasNunca.length, resNunca.motivo, nunca.escritas.some((e) => e.caminho.endsWith("/price-per-quantity"))], [false, 9, "sem_recomendacao", false]);
    const escondido = criarMLFalso({ esconderAtacado: true });
    escondido.exigirEscrita("ZZ-ML-AT");
    const idEscondido = (await escondido.post("/items", { family_name: "ZZ AT", price: 45.9, category_id: "MLB99779" })).dados.id;
    const resEscondido = await enviarAtacadoML(escondido, { itemId: idEscondido, preco: 45.9, atacado: ATACADO_PADRAO() });
    conferir("POST aceito mas a leitura nao traz as faixas: erro claro", [resEscondido.ok, /leitura|aparec/i.test(resEscondido.erro ?? "")], [false, true]);
    const recusa = criarMLFalso({ falhas: [{ metodo: "POST", caminho: "/prices-per-quantity/v1/recommendations", exato: true, status: 500 }] });
    recusa.exigirEscrita("ZZ-ML-AT");
    const outro = (await recusa.post("/items", { family_name: "ZZ AT", price: 45.9, category_id: "MLB99779" })).dados.id;
    const semRec = await enviarAtacadoML(recusa, { itemId: outro, preco: 45.9, atacado: ATACADO_PADRAO() });
    conferir("recomendacao que falha: erro, nada gravado", [semRec.ok, typeof semRec.erro, recusa.escritas.some((e) => e.caminho.endsWith("/price-per-quantity"))], [false, "string", false]);
    const queda = criarMLFalso({ falhas: [{ metodo: "POST", caminho: "/items/MLB", lancar: true }] });
    queda.exigirEscrita("ZZ-ML-AT");
    const terceiro = (await queda.post("/items", { family_name: "ZZ AT", price: 45.9, category_id: "MLB99779" })).dados.id;
    const caiu = await enviarAtacadoML(queda, { itemId: terceiro, preco: 45.9, atacado: ATACADO_PADRAO() });
    conferir("queda de rede no POST: erro, sem lancar", [caiu.ok, /falha programada|fetch failed/.test(caiu.erro ?? "")], [false, true]);
  }

  // Blocos das tarefas seguintes entram aqui, antes do finally.
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTodos os testes de anuncios ML OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);
