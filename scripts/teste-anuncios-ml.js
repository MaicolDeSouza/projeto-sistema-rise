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
const { rascunhoInicial, aplicarComposicao, descricaoDoRise } = await import("../src/lib/canaisDeVenda/ml/rascunho.js");
const { ABAS_ML, validarRascunhoML, medidasFaltando } = await import("../src/lib/canaisDeVenda/ml/validacao.js");
const { montarPayloadML, nomeDaFoto } = await import("../src/lib/canaisDeVenda/ml/payload.js");
const { estadoDoIconeML, rotuloDoIconeML } = await import("../src/lib/canaisDeVenda/ml/icone.js");
const { RascunhoMLSchema, LIMITES_ML } = await import("../src/lib/canaisDeVenda/ml/esquema.js");
const {
  contextoDosProdutos,
  buscarProdutoParaAnuncio,
  novoRascunhoML,
  carregarAnuncioML,
  codigoEmUso,
  sugerirCodigoDeKit,
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
    // A descricao do anuncio e sempre a do produto (pedido do dono em 22/10/2026); no kit, com os Itens inclusos do kit.
    conferir("descricaoDoRise: simples = a do produto", descricaoDoRise({ ...simples, descricao: "editada" }, { a, b }), a.descricaoBase);
    conferir("descricaoDoRise: kit = a do principal com os Itens inclusos do kit", descricaoDoRise({ ...misto, descricao: "editada" }, { a, b }), misto.descricao);
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
      ["atributos", "categoriaId", "categoriaNome", "composicao", "condicao", "descricao", "envio", "estoque", "familyName", "imagens", "preco", "produtoId", "tipoAnuncio", "titulo"]);
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

    conferir("abas do editor", ABAS_ML.map((x) => x.id), ["geral", "preco", "imagens", "descricao", "ficha", "envio", "previa"]);
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
    conferir("produto simples nao tem aviso de foto do kit", problema(base, ctx, "fotosDoKit"), undefined);

    const payload = montarPayloadML(base, ctx);
    conferir("payload nasce pausado, com o preco no item", [payload.item.status, payload.item.price], ["paused", 0.5]);
    conferir("payload leva o SKU do produto", payload.item.attributes.find((x) => x.id === "SELLER_SKU").value_name, "100101");
    const semFreteMarcado = { ...base, preco: 99, envio: { ...base.envio, freteGratis: false } };
    conferir("payload: frete gratis vai marcado a partir de R$ 79", montarPayloadML(semFreteMarcado, ctx).item.shipping.free_shipping, true);
    conferir("payload: abaixo de R$ 79 segue a escolha do dono", montarPayloadML({ ...semFreteMarcado, preco: 50 }, ctx).item.shipping.free_shipping, false);
    conferir("payload do kit leva o codigo do kit", montarPayloadML(kitOk, ctx).item.attributes.find((x) => x.id === "SELLER_SKU").value_name, "100101_5");
    conferir("payload do kit nao leva GTIN", montarPayloadML(kitOk, ctx).item.attributes.some((x) => x.id === "GTIN"), false);
    // O cliente tira o GTIN ao virar kit, mas o servidor aceita o que vier: o payload barra tambem.
    conferir("payload do kit com GTIN no rascunho: o GTIN fica de fora",
      montarPayloadML({ ...kitOk, atributos: { ...kitOk.atributos, GTIN: "7890000000001" } }, ctx).item.attributes.some((x) => x.id === "GTIN"), false);
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
          ["alturaCm", "blingId", "comprimentoCm", "conferido", "custo", "descricaoBase", "ean", "estoque", "id", "imagens", "larguraCm", "marca", "modelo", "pesoKg", "precoVenda", "sku", "tituloBase"]);
        conferir("contexto: Decimal vira Number", [ctx[p1.id].precoVenda, ctx[p1.id].pesoKg, ctx[p1.id].alturaCm, ctx[p1.id].larguraCm, ctx[p1.id].comprimentoCm, ctx[p1.id].estoque], [10, 0.05, 2, 3, 4, 9]);
        conferir("contexto: sem preco nem peso e null, nao zero", [ctx[p2.id].precoVenda, ctx[p2.id].pesoKg], [null, null]);
        conferir("contexto: so fotos, na ordem do banco, com o endereco calculado", ctx[p1.id].imagens, [
          { id: fotoA.id, arquivo: fotoA.arquivo, url: `/api/arquivos/ZZ-ML-1/imagens/${fotoA.arquivo}`, principal: false },
          { id: fotoB.id, arquivo: fotoB.arquivo, url: `/api/arquivos/ZZ-ML-1/imagens/${fotoB.arquivo}`, principal: true },
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
        conferir("carregar devolve o rascunho inteiro", ordenado(lido.rascunho), ordenado({ ...novo.rascunho, tipoAnuncio: "gold_special" }));
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
        conferir("o resto do rascunho vai para dados", Object.keys(gravado.dados).sort(), ["categoriaNome", "composicao", "condicao", "envio", "estoque", "familyName", "imagens", "preco", "tipoAnuncio"]);
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
        conferir("lista: os campos de cada linha", Object.keys(lista.linhas[0]).sort(), ["aguardandoEstoque", "atualizadoEm", "avisosML", "codigo", "estadoML", "estadoMLPedeAcao", "id", "idExterno", "preco", "produtoId", "rankingML", "status", "tipoAnuncio", "titulo", "urlExterna"]);
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
      "payload: kit sem GTIN manda o motivo",
      montarPayloadML({ ...comCategoria, composicao: { ...composicaoDeDois, codigo: "100101_2" }, atributos: { EMPTY_GTIN_REASON: "O produto é um kit ou pack" } }, ctx).item.attributes.some((a) => a.id === "EMPTY_GTIN_REASON"),
      true,
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
      conferir("etapas: ordem", ETAPAS, ["fotos", "validar", "criar", "pausar", "descricao", "kit_bling", "vinculo", "registrar_bling", "ativar", "gravar"]);
      conferir("etapas: todas com rotulo", ETAPAS.every((etapa) => typeof ROTULO_DA_ETAPA[etapa] === "string"), true);
      conferir("etapas: simples nao tem kit_bling", etapasDoAnuncio({ kit: false }).includes("kit_bling"), false);
      conferir("etapas: kit tem kit_bling", etapasDoAnuncio({ kit: true }).includes("kit_bling"), true);
      conferir("proximaEtapa: depois de fotos e validar vem criar", proximaEtapa({ feitas: ["fotos", "validar"] }), "criar");
      conferir("proximaEtapa: simples pula kit_bling", proximaEtapa({ feitas: ["fotos", "validar", "criar", "pausar", "descricao"] }, etapasDoAnuncio({ kit: false })), "vinculo");
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
        prisma.produto.create({ data: { sku, tituloBase: `ZZ ${sku}`, descricaoBase: `Descricao de ${sku}`, conferido: true, blingId: "1", pesoKg: 0.05, alturaCm: 2, larguraCm: 6, comprimentoCm: 7, estoque: 10, ...extra } });
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
      const idSimples = await c.anuncioSimples(c.s1);
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
      conferir("publicar: ordem das escritas no ML", ml.escritas.map(semMLB), ["POST /pictures/items/upload", "POST /pictures/items/upload", "POST /items/validate", "POST /items", "POST /items/MLB/description", "PUT /items/MLB"]);
      conferir("publicar: criou pausado, com preco e fotos por id, sem title", (({ status, price, pictures, title }) => [status, price, pictures.length, pictures.every((foto) => /^999-MLB/.test(foto.id)), title])(ml.escritas[3].corpo), ["paused", 49.9, 2, true, undefined]);
      conferir("publicar: ativou no fim", ml.escritas.at(-1).corpo, { status: "active" });
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
      conferir("vinculo: retomar vincula e ativa", [r.ok, mlVinculo.escritas.at(-1).corpo, mlVinculo.escritas.filter((e) => e.caminho === "/items").length], [true, { status: "active" }, 1]);

      // Registro do anuncio no Bling (/anuncios): um por MLB, depois do vinculo e antes de ativar.
      conferir("registrar: um POST /anuncios no caminho feliz, com o MLB e a modalidade", [postsNoBling(bf, "/anuncios"), bf.chamadas.find((chamada) => chamada.metodo === "POST" && chamada.caminho === "/anuncios")?.corpo.anuncioLoja.id === publicado.idExterno, bf.chamadas.find((chamada) => chamada.metodo === "POST" && chamada.caminho === "/anuncios")?.corpo.mercadoLivre], [1, true, { modalidade: "gold_special" }]);
      conferir("registrar: id do registro gravado na publicacao", typeof (await lerPublicacao(idSimples)).publicacao.blingAnuncioId, "number");
      const mlRegistro = criarMLFalso();
      const bfRegistro = c.novoBling({ falhas: [{ metodo: "POST", caminho: "/anuncios", status: 500, mensagem: "fora do ar", vezes: 1 }] });
      const idRegistro = await c.anuncioSimples(c.s1);
      r = await publicarAnuncioML(idRegistro, { ml: mlRegistro, bling: bfRegistro, lerFoto });
      conferir("registrar: falha para em registrar_bling, pausado e vinculado", [r.ok, r.etapa, mlRegistro.escritas.some((e) => e.corpo?.status === "active"), postsNoBling(bfRegistro, "/produtos/lojas"), (await lerPublicacao(idRegistro)).publicacao.etapaComErro], [false, "registrar_bling", false, 1, "registrar_bling"]);
      r = await publicarAnuncioML(idRegistro, { ml: mlRegistro, bling: bfRegistro, lerFoto });
      conferir("registrar: retomar registra, nao revincula e ativa", [r.ok, postsNoBling(bfRegistro, "/anuncios"), postsNoBling(bfRegistro, "/produtos/lojas"), mlRegistro.escritas.at(-1).corpo, (await estado(idRegistro)).status], [true, 2, 1, { status: "active" }, "PUBLICADO"]);
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
          { id: "MLBA", status: "active", catalog_product_id: "MLB44072268" },
          { id: "MLBB", status: "active", catalog_product_id: "MLB44072268" },
          { id: "MLBC", status: "closed", catalog_product_id: "MLB60092501" },
          { id: "MLBD", status: "paused", catalog_product_id: null },
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

    const top5 = await precoDaPropostaML(ml, rascunho, { custo: 20, precos: [45, 48, 50, 52, 55, 70] });
    // R$ 0,10 abaixo do teto (pedido do dono em 24/10/2026): o 5º preco e 55, o anuncio vai a 54,90 e fica em 5º sem empatar.
    // Piso = 40% de markup sobre o custo total (24/10/2026): 1,4 * (20 + 6,85) / (1 - 1,4 * 0,18) = 50,25..., vai a 50,30.
    conferir("no top 5: R$ 0,10 abaixo do teto, com 40% ou mais de markup, em 5º", [top5.valor, top5.markup >= 40, top5.posicao, top5.total, top5.teto, top5.avisos], [54.9, true, 5, 7, 55, []]);

    // Piso de 30% (pedido do dono em 25/10/2026: "o minimo e 30%, se possivel manter 40%"): 1,3 * 26,85 / 0,766 = 45,57, vai a 45,60.
    const caro = await precoDaPropostaML(ml, rascunho, { custo: 20, precos: [30, 31, 32, 33, 34] });
    conferir("30% fora do top 5: fica no piso e avisa a posição e o markup abaixo do desejado",
      [caro.valor, caro.valor === caro.piso, caro.markup >= 30 && caro.markup < 40, caro.avisos.some((aviso) => /fica em 6º de 6/.test(aviso)), caro.avisos.some((aviso) => /abaixo dos 40% desejados/.test(aviso))], [45.6, true, true, true, true]);

    // Entre o piso e o desejado, dentro do top 5: o 5º preco e 49, o anuncio vai a 48,90 e fica com ~37% (entre 30 e 40): mantem o preco e avisa.
    const meio = await precoDaPropostaML(ml, rascunho, { custo: 20, precos: [40, 42, 45, 47, 49, 60] });
    conferir("entre 30% e 40% no top 5: mantém o preço do top 5 e avisa o desejado", [meio.valor, meio.markup >= 30 && meio.markup < 40, meio.posicao, meio.avisos.some((aviso) => /abaixo dos 40% desejados/.test(aviso))], [48.9, true, 5, true]);

    // Custo 32: a R$ 79,90 (frete gratis, 12,95) o markup cai a ~35%; a R$ 78,95 (frete 6,85) fica em ~49%.
    const virada = await precoDaPropostaML(ml, rascunho, { custo: 32, precos: [60, 70, 75, 78, 80, 90] });
    conferir("cruzar R$ 79 perde markup pelo frete: fica abaixo de 79", [virada.valor, virada.markup >= 40], [78.95, true]);

    const semCusto = await precoDaPropostaML(ml, rascunho, { custo: null, precos: [45] });
    conferir("sem custo: sem preço e avisa", [semCusto.valor, semCusto.avisos.some((aviso) => /custo/.test(aviso))], [null, true]);

    const sozinho = await precoDaPropostaML(ml, rascunho, { custo: 20, precos: [] });
    // Sem teto nao ha o que ficar abaixo: mira o desejado (40% = 50,30), com o piso de 30% (45,60) guardado.
    conferir("sem concorrente: mira os 40% e avisa", [sozinho.valor, sozinho.piso, sozinho.avisos.some((aviso) => /sem concorrente/.test(aviso)), sozinho.markup >= 40], [50.3, 45.6, true, true]);

    conferir("todo preço de 5 em 5 centavos", [top5, caro, virada, sozinho].every((resultado) => multiplo5(resultado.valor)), true);
  }

  // -------------------------------------------------------------------------
  // Proposta de anuncio (plano 2026-10-23, Tarefa 7): ler e gravar a proposta do ML
  // -------------------------------------------------------------------------
  {
    console.log("\nProposta do ML: ler e gravar");
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

    const gravada = await gravarPropostaML(ml(), "ZZ-ML-PA1", { categoriaId: "MLB99779", titulo: "Placa Uno R3 CH340 compatível", atributos: { ...ATRIBUTOS, GTIN: "7890000000000", EMPTY_GTIN_REASON: "x" }, catalogos: ["MLBP9", "MLBP4", "MLBP6"], relatorio: "- teste" });
    const anuncio = await prisma.anuncio.findUnique({ where: { id: gravada.anuncioId } });
    conferir(
      "gravar: Clássico com categoria, título, ficha e preço",
      [anuncio.status, anuncio.dados.tipoAnuncio, anuncio.categoriaExternaId, anuncio.titulo, anuncio.atributos.BRAND, anuncio.dados.preco, gravada.preco.valor],
      // R$ 0,10 abaixo do 5º preco do ranking (R$ 60; regra do dono de 24/10/2026). O titulo e o do produto base, e o que a
      // LLM mandou ("Placa Uno R3 CH340 compatível") e ignorado e avisado (regra do dono de 24/10/2026).
      ["RASCUNHO", "gold_special", "MLB99779", "PLACA UNO R3 CH340 ZZ", "ARDUINO", 59.9, 59.9],
    );
    conferir("titulo: o da LLM é ignorado e avisado, sem marca de proposta no campo", [gravada.titulo, gravada.avisos.some((a) => /título enviado foi ignorado/.test(a)), gravada.campos.includes("titulo")], ["PLACA UNO R3 CH340 ZZ", true, false]);
    conferir("GTIN e o motivo mandados pela LLM ficam fora", [anuncio.atributos.GTIN ?? null, anuncio.atributos.EMPTY_GTIN_REASON ?? null], [null, null]);
    conferir("catálogos: só os de 5 ou mais anúncios, o de 4 avisado", [gravada.catalogosSugeridos.map((c) => c.catalogoId), gravada.avisos.some((a) => /MLBP4/.test(a) && /menos de 5/.test(a))], [["MLBP9", "MLBP6"], true]);
    conferir("o ranking do produto continua vazio", await prisma.catalogoReferenciaML.count({ where: { produtoId: produto.id } }), 0);
    // A versao vem da constante: o numero fixo quebrava a cada mudanca de regra do roteiro (4 -> 5 em 25/10/2026).
    const { VERSAO_ROTEIRO_ML } = await import("../src/lib/propostaDeAnuncio/roteiros.js");
    conferir("a proposta guardada com o preço e os catálogos", [anuncio.dados.proposta.preco.valor, anuncio.dados.proposta.catalogosSugeridos.length, anuncio.dados.proposta.versaoDoRoteiro], [59.9, 2, VERSAO_ROTEIRO_ML]);

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
    conferir("sem as quatro medidas: pacote null", conteudoAtualDoAnuncio({ produtoId: "p2", composicao: null }, produtos).pacote, null);
    const kit = { produtoId: "p1", composicao: { itens: [{ produtoId: "p1", quantidade: 1 }, { produtoId: "p2", quantidade: 1 }], codigo: "250999" } };
    const doKit = conteudoAtualDoAnuncio(kit, produtos);
    conferir("kit: sem fotos nem pacote, descricao com os itens inclusos", [doKit.fotos, doKit.pacote, doKit.kit, /Itens inclusos/i.test(doKit.descricao ?? "")], [null, null, true, true]);
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

    conferir("catalogo: o proprio catalog_product_id", catalogoDoItem({ catalog_product_id: "MLB1" }, []), "MLB1");
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
    ml.itens.set("MLB920001", { id: "MLB920001", status: "active", sub_status: [], available_quantity: 1, sold_quantity: 0, catalog_product_id: "MLB44072268", catalog_listing: false, item_relations: [] });
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

    ml.itens.get("MLB920001").catalog_product_id = null;
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

  // Blocos das tarefas seguintes entram aqui, antes do finally.
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTodos os testes de anuncios ML OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);
