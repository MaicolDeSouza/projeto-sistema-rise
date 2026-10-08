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
const { lerConfigML, gravarFrases } = await import("../src/lib/canaisDeVenda/configuracao.js");
const { MAXIMO_DA_FRASE, MAXIMO_DE_FRASES, avisoDasFrases, frasesDoTexto } = await import("../src/lib/canaisDeVenda/frases.js");
const { montarDescricaoML } = await import("../src/lib/canaisDeVenda/ml/descricao.js");
const { rascunhoInicial, aplicarComposicao } = await import("../src/lib/canaisDeVenda/ml/rascunho.js");
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

    conferir("descricao junta texto e frases, sem frase em branco", montarDescricaoML({ descricao: "Texto.\n", frases: ["Nota fiscal.", " ", "Envio rapido."] }),
      "Texto.\n\nNota fiscal.\nEnvio rapido.");
    conferir("sem frases nao sobra linha", montarDescricaoML({ descricao: "Texto.", frases: [] }), "Texto.");
    conferir("sem descricao, so as frases", montarDescricaoML({ descricao: "  ", frases: ["Nota fiscal."] }), "Nota fiscal.");
    conferir("sem descricao nem frases, texto vazio", montarDescricaoML({ descricao: "  ", frases: undefined }), "");
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
    conferir("payload do kit leva o codigo do kit", montarPayloadML(kitOk, ctx).item.attributes.find((x) => x.id === "SELLER_SKU").value_name, "100101_5");
    conferir("payload do kit nao leva GTIN", montarPayloadML(kitOk, ctx).item.attributes.some((x) => x.id === "GTIN"), false);
    // O cliente tira o GTIN ao virar kit, mas o servidor aceita o que vier: o payload barra tambem.
    conferir("payload do kit com GTIN no rascunho: o GTIN fica de fora",
      montarPayloadML({ ...kitOk, atributos: { ...kitOk.atributos, GTIN: "7890000000001" } }, ctx).item.attributes.some((x) => x.id === "GTIN"), false);
    conferir("payload: atributos da ficha e o SKU", payload.item.attributes.filter((x) => !x.id.startsWith("SELLER_PACKAGE_")),
      [{ id: "BRAND", value_name: "GENERICA" }, { id: "GTIN", value_name: "7890000000001" }, { id: "SELLER_SKU", value_name: "100101" }]);
    conferir("preco vai a parte", payload.preco, { amount: 0.5, currency_id: "BRL" });
    conferir("descricao final no payload", payload.descricao.plain_text, montarDescricaoML({ ...simples, frases: ctx.frases }));
    conferir("descricao final no payload: descricao do produto e frases fixas", payload.descricao.plain_text, `${a.descricaoBase}\n\nNota fiscal.`);
    conferir("payload: titulo, familia, categoria, estoque, tipo e condicao",
      ["title" in payload.item, payload.item.family_name, payload.item.category_id, payload.item.available_quantity, payload.item.currency_id, payload.item.listing_type_id, payload.item.condition],
      [false, "Resistor 1K 1/4W", "MLB1234", 100, "BRL", "gold_special", "new"]);
    // Marca e Modelo vao em MAIUSCULAS (acento incluso); os demais atributos ficam como foram digitados.
    conferir("payload: marca e modelo em maiusculas, o resto intacto",
      montarPayloadML({ ...base, atributos: { BRAND: "Arduino", MODEL: "uno r3 ação", COLOR: "Azul", GTIN: "7890000000001" } }, ctx).item.attributes.filter((x) => !x.id.startsWith("SELLER_PACKAGE_")),
      [{ id: "BRAND", value_name: "ARDUINO" }, { id: "MODEL", value_name: "UNO R3 AÇÃO" }, { id: "COLOR", value_name: "Azul" }, { id: "GTIN", value_name: "7890000000001" }, { id: "SELLER_SKU", value_name: "100101" }]);
    conferir("payload: marca em branco continua fora", montarPayloadML({ ...base, atributos: { BRAND: "  ", MODEL: "m1" } }, ctx).item.attributes.filter((x) => !x.id.startsWith("SELLER_PACKAGE_")).map((x) => x.id), ["MODEL", "SELLER_SKU"]);
    conferir("payload: titulo cortado em 60",montarPayloadML({ ...base, titulo: "X".repeat(70) }, ctx).item.family_name, "X".repeat(60));
    conferir("payload: envio com dimensoes em cm e peso em gramas", payload.item.shipping,
      { mode: "me2", logistic_type: "xd_drop_off", free_shipping: false, local_pick_up: false, dimensions: "1x1x2,1" });
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
    // O texto do icone: cor e ponto sozinhos nao dizem o estado a leitor de tela nem ao mouse parado.
    conferir("rotulo do icone: sem anuncio", rotuloDoIconeML({ publicado: false, rascunho: false }), "Anúncio no Mercado Livre: sem anúncio");
    conferir("rotulo do icone: so rascunho", rotuloDoIconeML({ publicado: false, rascunho: true }), "Anúncio no Mercado Livre: anúncio pendente (rascunho, erro ou pausado)");
    conferir("rotulo do icone: publicado e ativo", rotuloDoIconeML({ publicado: true, rascunho: false }), "Anúncio no Mercado Livre: publicado e ativo");
    conferir("rotulo do icone: publicado e ativo mais um pendente", rotuloDoIconeML({ publicado: true, rascunho: true }), "Anúncio no Mercado Livre: publicado e ativo, com anúncio pendente");

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
    console.log("\nConfiguracao (banco)");
    await limpar();

    // A configuracao e dado REAL do dono (banco compartilhado): a linha do canal e guardada
    // aqui e devolvida no finally.
    const configAntes = await prisma.configCanal.findUnique({ where: { canal: "MERCADO_LIVRE" } });
    try {
      if (!configAntes) {
        // So aqui: apagar a linha do dono para testar a ausencia seria arriscar o dado real.
        conferir("sem linha: lista vazia", await lerConfigML(), { frases: [] });
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

      // As regras moram em frases.js, lidas pelo servidor e pela tela: os recados da recusa do
      // servidor sao os mesmos que a tela mostra antes de enviar.
      conferir("frases: limites", [MAXIMO_DE_FRASES, MAXIMO_DA_FRASE], [10, 200]);
      conferir("frasesDoTexto: aparar, tirar vazias e repetidas, CRLF", frasesDoTexto("  A \r\n\r\nB\nA\n  "), ["A", "B"]);
      conferir("frasesDoTexto: vazio, nulo e indefinido", [frasesDoTexto(""), frasesDoTexto(null), frasesDoTexto(undefined)], [[], [], []]);
      conferir("avisoDasFrases: lista boa nao tem aviso", avisoDasFrases(dezDeDuzentos), null);
      conferir("avisoDasFrases: 11 frases", avisoDasFrases(Array.from({ length: 11 }, (_, i) => `F${i}`)), "Use até 10 frases.");
      conferir("avisoDasFrases: frase de 201 aponta a posicao e o tamanho", avisoDasFrases(["curta", "x".repeat(201)]), "A frase 2 tem 201 caracteres. O limite é 200.");
      conferir("avisoDasFrases: frase de 200 passa", avisoDasFrases(["x".repeat(200)]), null);
      conferir("avisoDasFrases: acima de 10 vale antes do tamanho", avisoDasFrases([...Array.from({ length: 10 }, (_, i) => `F${i}`), "x".repeat(201)]), "Use até 10 frases.");
      conferir("gravarFrases: recado da recusa de 11 e o de avisoDasFrases", (await gravarFrases(Array.from({ length: 11 }, (_, i) => `F${i}`).join("\n"))).erro, "Use até 10 frases.");
      conferir("gravarFrases: recado da recusa de 201 e o de avisoDasFrases", (await gravarFrases(`curta\n${"x".repeat(201)}`)).erro, "A frase 2 tem 201 caracteres. O limite é 200.");
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
    console.log("\nRascunho (banco)");
    await limpar();

    // O fornecedor de teste mora no banco de verdade (compartilhado): sai por nome, no comeco
    // (sobra de uma execucao morta) e no fim. O produto vai antes do fornecedor, porque o vinculo
    // ProdutoFornecedor e Restrict para o Fornecedor.
    const varrerExtras = () => prisma.fornecedor.deleteMany({ where: { nome: "ZZ Fornecedor ML" } });
    await varrerExtras();

    // O teste fixa as frases do canal, e a configuracao real do dono volta no finally.
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
        await gravarFrases("Frase de teste ML.");
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
          { id: fotoA.id, url: `/api/arquivos/ZZ-ML-1/imagens/${fotoA.arquivo}`, principal: false },
          { id: fotoB.id, url: `/api/arquivos/ZZ-ML-1/imagens/${fotoB.arquivo}`, principal: true },
        ]);

        conferir("busca por codigo acha o Conferido", (await buscarProdutoParaAnuncio("ZZ-ML-1")).produto.id, p1.id);
        conferir("busca: o codigo e aparado", (await buscarProdutoParaAnuncio("  ZZ-ML-1 ")).produto.id, p1.id);
        conferir("busca recusa o nao Conferido", (await buscarProdutoParaAnuncio("ZZ-ML-3")).erro, "O produto ZZ-ML-3 ainda não foi Conferido. Só produto Conferido vira anúncio.");
        conferir("busca: codigo que nao existe", (await buscarProdutoParaAnuncio("ZZ-ML-NAO")).erro, "Nenhum produto com o código ZZ-ML-NAO.");
        conferir("busca: o codigo e exato, nao parte dele", (await buscarProdutoParaAnuncio("ZZ-ML")).ok, false);
        conferir("busca: codigo vazio", (await buscarProdutoParaAnuncio("   ")).erro, "Informe o código do produto.");

        const novo = await novoRascunhoML(p1.id);
        conferir("novo rascunho nao grava nada", [novo.ok, await prisma.anuncio.count({ where: { produtoId: p1.id } })], [true, 0]);
        conferir("novo rascunho: contexto com produtos, frases e codigo em uso", [Object.keys(novo.contexto).sort(), Object.keys(novo.contexto.produtos), novo.contexto.frases, novo.contexto.codigoEmUso],
          [["codigoEmUso", "frases", "produtos"], [p1.id], ["Frase de teste ML."], null]);
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
        conferir("carregar: anuncio, status e contexto", [lido.anuncioId, lido.status, Object.keys(lido.contexto.produtos), lido.contexto.frases, lido.contexto.codigoEmUso],
          [salvo.id, "RASCUNHO", [p1.id], ["Frase de teste ML."], null]);
        conferir("carregar: anuncio que nao existe", (await carregarAnuncioML("id-que-nao-existe")).erro, "Anúncio não encontrado.");
        conferir("carregar: sem id nao devolve outro anuncio", (await carregarAnuncioML(undefined)).ok, false);

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
        conferir("numero escrito como texto vira numero, e vazio vira null", [gravado.dados.preco, gravado.dados.estoque], [12.5, null]);

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
        conferir("lista: os campos de cada linha", Object.keys(lista.linhas[0]).sort(), ["atualizadoEm", "codigo", "id", "idExterno", "preco", "status", "tipoAnuncio", "titulo", "urlExterna"]);
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
    conferir(
      "problemas: obrigatorio vazio e lista fora",
      problemasDosAtributos({ BRAND: "X", MICROCONTROLLER: "Z80" }, atributos, { kit: false }).map((p) => [p.campo, p.bloqueante]),
      [["MODEL", true], ["GTIN", true], ["MICROCONTROLLER", true]],
    );
    conferir("problemas: texto da lista fora", problemasDosAtributos({ BRAND: "X", MODEL: "Y", GTIN: "1", MICROCONTROLLER: "Z80" }, atributos, { kit: false })[0].problema, "Microcontrolador: 'Z80' não está na lista da categoria.");
    conferir("problemas: GTIN ou motivo", problemasDosAtributos({ BRAND: "X", MODEL: "Y", EMPTY_GTIN_REASON: "O produto não tem código cadastrado" }, atributos, { kit: false }), []);
    conferir(
      "problemas: kit com GTIN e alerta",
      problemasDosAtributos({ BRAND: "X", MODEL: "Y", GTIN: "789", EMPTY_GTIN_REASON: "O produto é um kit ou pack" }, atributos, { kit: true }).map((p) => [p.campo, p.bloqueante]),
      [["GTIN", false]],
    );
    conferir(
      "problemas: kit sem motivo e bloqueante mesmo sem GTIN",
      problemasDosAtributos({ BRAND: "X", MODEL: "Y" }, atributos, { kit: true }).map((p) => [p.campo, p.bloqueante]),
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
    const { custosDoAnuncio, precoPorMargem, custosValem, freteQueConta } = await import("../src/lib/canaisDeVenda/ml/custos.js");
    const { lerTaxas, lerFreteDoVendedor, lerTendencias, limparCacheDeTendencias, lerCustosDoAnuncio, precoPorMargemNoML } = await import(
      "../src/lib/canaisDeVenda/ml/leitura.js"
    );
    conferir("custos: 49 com custo 24, 13%, sem tarifa e sem frete", custosDoAnuncio({ preco: 49, custo: 24, percentual: 0.13, tarifaFixa: 0, frete: 0 }), {
      comissao: 6.37, tarifaFixa: 0, frete: 0, imposto: 2.94, lucro: 15.69, margem: 32,
    });
    conferir(
      "custos: sem custo, lucro e margem nulos",
      (({ lucro, margem, comissao }) => [lucro, margem, comissao])(custosDoAnuncio({ preco: 20, custo: null, percentual: 0.13, tarifaFixa: 6.65, frete: 0 })),
      [null, null, 2.6],
    );
    conferir("custos: sem preco e null", custosDoAnuncio({ preco: 0, custo: 24, percentual: 0.13, tarifaFixa: 0, frete: 0 }), null);
    conferir("preco por margem: R$ 20 de lucro", precoPorMargem({ custo: 24, percentual: 0.13, tarifaFixa: 0, frete: 0, margem: { tipo: "reais", valor: 20 } }), 54.33);
    conferir("preco por margem: 30%", precoPorMargem({ custo: 24, percentual: 0.13, tarifaFixa: 0, frete: 0, margem: { tipo: "percentual", valor: 30 } }), 47.06);
    conferir("preco por margem: inatingivel (90% com 18% + 6%)", precoPorMargem({ custo: 24, percentual: 0.18, tarifaFixa: 0, frete: 0, margem: { tipo: "percentual", valor: 90 } }), null);
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
    conferir("freteQueConta: so com frete gratis", [freteQueConta(lidos, r), freteQueConta(lidos, { ...r, envio: { ...r.envio, freteGratis: true } })], [0, 8.15]);
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
      "lerFrete: dimensoes inteiras e custo",
      await lerFreteDoVendedor(falso, { envio: { alturaCm: 5.5, larguraCm: 8, comprimentoCm: 8, pesoKg: 0.05 }, preco: 49, tipoAnuncio: "gold_special", logistica: "xd_drop_off" }),
      { custo: 8.15, pesoCobrado: 300 },
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
    conferir("lerCustosDoAnuncio: junta taxas e frete e vale para o rascunho", [custosML.percentual, custosML.frete, custosML.pesoCobrado, custosValem(custosML, r)], [0.13, 8.15, 300, true]);
    conferir("lerCustosDoAnuncio: sem medidas, frete nulo", (await lerCustosDoAnuncio(falso, { ...r, envio: { ...r.envio, pesoKg: null } })).frete, null);
    const porMargem = await precoPorMargemNoML(falso, { ...r, envio: { ...r.envio, logistica: "self_service", freteGratis: true } }, { custo: 24, margem: { tipo: "reais", valor: 20 } });
    conferir("precoPorMargemNoML: converge com tarifa fixa e frete (self_service, frete gratis)", [porMargem.preco, porMargem.custosML.preco, porMargem.custosML.tarifaFixa], [72.6, 72.6, 6.65]);
    conferir("precoPorMargemNoML: inatingivel e null", await precoPorMargemNoML(falso, r, { custo: 24, margem: { tipo: "percentual", valor: 95 } }), null);
    // Acima do limite (79) a tarifa fixa some: o preco que a calcula tem que reler as taxas nele.
    const acimaDoLimite = await precoPorMargemNoML(falso, { ...r, envio: { ...r.envio, logistica: "self_service" } }, { custo: 60, margem: { tipo: "reais", valor: 10 } });
    conferir("precoPorMargemNoML: rele as taxas no preco novo (tarifa some acima de 79)", [acimaDoLimite.preco, acimaDoLimite.custosML.tarifaFixa], [86.42, 0]);

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
        await requisitar({ servico: "MERCADO_LIVRE", url: "https://api.mercadolibre.com/pictures/items/upload", metodo: "POST", corpo: formulario, tentativas: 1 });
        conferir("requisitar: FormData vai cru", pedido.body === formulario, true);
        conferir("requisitar: FormData sem Content-Type", Object.keys(pedido.headers).some((k) => k.toLowerCase() === "content-type"), false);
      } finally {
        globalThis.fetch = fetchOriginal;
      }
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
      const { LOJA_ML_NO_BLING, vinculoNoBlingML, vincularNoBlingML, conferirKitNoBling, corpoDoKitDoAnuncio, criarKitNoBling } = await import("../src/lib/canaisDeVenda/ml/bling.js");
      const produtosDoBling = [
        { id: 101, codigo: "100101", nome: "PLACA UNO", formato: "S", preco: 49 },
        { id: 102, codigo: "100102", nome: "PLACA NANO", formato: "S", preco: 39 },
        { id: 103, codigo: "100103", nome: "PLACA MEGA", formato: "S", preco: 99 },
        { id: 809, codigo: "120809", nome: "KIT *120809", formato: "E", estrutura: { tipoEstoque: "V", lancamentoEstoque: "", componentes: [{ produto: { id: 101 }, quantidade: 1 }, { produto: { id: 102 }, quantidade: 2 }] } },
      ];
      const vinculosDeLoja = [{ codigo: "MLB4165084257", preco: 49.9, produto: { id: 101 }, loja: { id: 203593931 } }];
      const novoBling = (extra = {}) => criarBlingFalso({ produtos: produtosDoBling, vinculosDeLoja, ...extra });
      const posts = (bling, caminho) => bling.chamadas.filter((c) => c.metodo === "POST" && c.caminho === caminho);

      const bf = novoBling();
      conferir("loja do ML no Bling", LOJA_ML_NO_BLING, "203593931");
      conferir("vinculo: outro MLB na loja nao conta como ligado", (await vinculoNoBlingML(bf, "100101", "MLB1")).situacao, "sem_vinculo");
      conferir("vinculo: lista os outros MLB", (await vinculoNoBlingML(bf, "100101", "MLB1")).outros, ["MLB4165084257"]);
      conferir("vinculo: produto fora do Bling", (await vinculoNoBlingML(bf, "999999", "MLB1")).situacao, "sem_produto_no_bling");
      const bfTravado = novoBling({ codigosLiberados: ["outro"] });
      const recusado = await vincularNoBlingML(bfTravado, "100101", "MLB1", 49.9);
      conferir("vincular: trava recusa sem escrever", [recusado.ok, bfTravado.chamadas.some((c) => c.metodo === "POST"), /Escrita bloqueada/.test(recusado.erro)], [false, false, true]);
      const v = await vincularNoBlingML(bf, "100101", "MLB1", 49.9);
      conferir("vincular: POST na loja do ML com o MLB e o preco", [v.ok, posts(bf, "/produtos/lojas").at(-1)?.corpo], [true, { codigo: "MLB1", preco: 49.9, produto: { id: 101 }, loja: { id: 203593931 } }]);
      const deNovo = await vincularNoBlingML(bf, "100101", "MLB1", 49.9);
      conferir("vincular: segunda vez nao duplica", [deNovo.ok, deNovo.jaEstava, posts(bf, "/produtos/lojas").length], [true, true, 1]);
      const bfRecusa = novoBling({ falhas: [{ metodo: "POST", caminho: "/produtos/lojas", status: 400, mensagem: "vinculo repetido" }] });
      const recusaDoBling = await vincularNoBlingML(bfRecusa, "100101", "MLB1", 49.9);
      conferir("vincular: recusa do Bling volta com o motivo", [recusaDoBling.ok, /vinculo repetido/.test(recusaDoBling.erro)], [false, true]);

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
      conferir("kit: so leitura", bf.chamadas.filter((c) => c.metodo !== "GET" && c.metodo !== "exigirEscrita").length, 1);

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
      conferir("etapas: ordem", ETAPAS, ["fotos", "validar", "criar", "pausar", "descricao", "kit_bling", "vinculo", "ativar", "gravar"]);
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
      conferir("gravarPublicacao: forma completa", Object.keys(lido.publicacao).sort(), ["atualizadoEm", "blingKitId", "erro", "etapaComErro", "feitas", "fotos", "incerta", "itemId", "permalink", "statusML"]);
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
      const ajustes = { titulo: "PLACA ZZ ML", categoriaId: "MLB99779", preco: 49.9, estoque: 5, atributos: { BRAND: "ZZ", MODEL: "M1", EMPTY_GTIN_REASON: "O produto não tem código cadastrado" } };
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
        const salvo = await salvarRascunhoML(null, { ...comKit, ...ajustes, estoque: 3, atributos: { BRAND: "ZZ", MODEL: "M1", EMPTY_GTIN_REASON: "O produto é um kit ou pack" } });
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
      conferir("preparar: anuncio simples pronto", [pronto.ok, pronto.motivos, pronto.resumo?.familyName, pronto.resumo?.preco, pronto.resumo?.estoque, pronto.resumo?.fotos, pronto.resumo?.codigo, pronto.resumo?.kit], [true, [], "PLACA ZZ ML", 49.9, 5, 2, "ZZ-ML-S1", null]);
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
      conferir("preparar: anuncio que nao existe", (await prepararPublicacaoML("nao-existe", { ml, bling: bf })).motivos, ["Anúncio não encontrado."]);
      conferir("preparar: continua so leitura", [ml.escritas.length, bf.chamadas.filter((chamada) => chamada.metodo !== "GET").length], [0, 0]);
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
      let r = await publicarAnuncioML(idSimples, { ml, bling: bf, lerFoto });
      conferir("publicar: tudo certo", [r.ok, r.feitas.at(-1), (await estado(idSimples)).status], [true, "gravar", "PUBLICADO"]);
      conferir("publicar: ordem das escritas no ML", ml.escritas.map(semMLB), ["POST /pictures/items/upload", "POST /pictures/items/upload", "POST /items/validate", "POST /items", "POST /items/MLB/description", "PUT /items/MLB"]);
      conferir("publicar: criou pausado, com preco e fotos por id, sem title", (({ status, price, pictures, title }) => [status, price, pictures.length, pictures.every((foto) => /^999-MLB/.test(foto.id)), title])(ml.escritas[3].corpo), ["paused", 49.9, 2, true, undefined]);
      conferir("publicar: ativou no fim", ml.escritas.at(-1).corpo, { status: "active" });
      conferir("publicar: descricao do produto", ml.escritas[4].corpo.plain_text.startsWith("Descricao de ZZ-ML-S1"), true);
      conferir("publicar: um vinculo no Bling, na loja do ML, com o MLB e o preco", [postsNoBling(bf, "/produtos/lojas"), bf.chamadas.find((chamada) => chamada.caminho === "/produtos/lojas" && chamada.metodo === "POST").corpo], [1, { codigo: r.itemId, preco: 49.9, produto: { id: 501 }, loja: { id: 203593931 } }]);
      const publicado = await estado(idSimples);
      conferir("publicar: colunas gravadas", [publicado.situacaoCanal, publicado.idExterno, publicado.urlExterna === r.permalink, publicado.publicadoEm instanceof Date, publicado.erro], ["ATIVA", r.itemId, true, true, null]);
      conferir("publicar: payloadEnviado e o corpo da criacao", publicado.payloadEnviado.family_name, "PLACA ZZ ML");
      conferir("publicar: de novo e recusado", (await publicarAnuncioML(idSimples, { ml, bling: bf, lerFoto })).erro, "O anúncio já está publicado.");

      // Review Focus 3: trava do Bling fechada => nada escrito em lugar nenhum
      const mlNovo = criarMLFalso();
      const bfTravado = c.novoBling({ codigosLiberados: ["outro"] });
      const idOutro = await c.anuncioSimples(c.s1);
      r = await publicarAnuncioML(idOutro, { ml: mlNovo, bling: bfTravado, lerFoto });
      conferir("trava: nada escrito em lugar nenhum", [r.ok, /Escrita bloqueada/.test(r.erro), mlNovo.escritas.length, bfTravado.chamadas.filter((chamada) => !["GET", "exigirEscrita"].includes(chamada.metodo)).length, (await estado(idOutro)).status], [false, true, 0, 0, "RASCUNHO"]);
      const mlTravado = criarMLFalso({ codigosLiberados: ["outro"] });
      r = await publicarAnuncioML(idOutro, { ml: mlTravado, bling: bf, lerFoto });
      conferir("trava: codigo fora da lista do ML", [r.ok, /ML_PUBLICACAO_CODIGOS/.test(r.erro), mlTravado.escritas.length], [false, true, 0]);

      // Review Focus 1: criacao sem resposta certa
      const mlQueda = criarMLFalso({ falhas: [{ metodo: "POST", caminho: "/items", exato: true, status: 500 }] });
      const idQueda = await c.anuncioSimples(c.s1);
      r = await publicarAnuncioML(idQueda, { ml: mlQueda, bling: bf, lerFoto });
      conferir("incerta: marcada", [r.ok, r.incerta, r.etapa, (await estado(idQueda)).status], [false, true, "criar", "ERRO"]);
      const antes = mlQueda.escritas.length;
      r = await publicarAnuncioML(idQueda, { ml: mlQueda, bling: bf, lerFoto });
      conferir("incerta: retomar sem recriar nao escreve", [r.ok, mlQueda.escritas.length - antes, /Confira/.test(r.erro)], [false, 0, true]);
      r = await publicarAnuncioML(idQueda, { ml: mlQueda, bling: bf, lerFoto, recriar: true });
      conferir("incerta: recriar cria e nao sobe as fotos de novo", [r.ok, mlQueda.escritas.filter((e) => e.caminho === "/pictures/items/upload").length, (await lerPublicacao(idQueda)).publicacao.incerta], [true, 2, false]);
      const mlRede = criarMLFalso({ falhas: [{ metodo: "POST", caminho: "/items", exato: true, lancar: true }] });
      r = await publicarAnuncioML(await c.anuncioSimples(c.s1), { ml: mlRede, bling: bf, lerFoto });
      conferir("incerta: queda de rede tambem", [r.ok, r.incerta], [false, true]);
      const mlRecusa = criarMLFalso({ falhas: [{ metodo: "POST", caminho: "/items", exato: true, status: 400, dados: { message: "bad", cause: [{ type: "error", code: "x", message: "Recusado" }] } }] });
      r = await publicarAnuncioML(await c.anuncioSimples(c.s1), { ml: mlRecusa, bling: bf, lerFoto });
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
      r = await validarNoML(idValida, { ml: mlValida, bling: bf, lerFoto });
      conferir("validarNoML: causas e nada criado", [r.ok, /Falta MODEL/.test(r.erro), r.avisos, mlValida.escritas.some((e) => e.caminho === "/items"), (await estado(idValida)).status], [false, true, ["Foto pequena (x)"], false, "RASCUNHO"]);
      r = await validarNoML(idValida, { ml: criarMLFalso(), bling: bf, lerFoto });
      conferir("validarNoML: sem problema", [r.ok, (await estado(idValida)).status, (await salvarRascunhoML(idValida, (await novoRascunhoML(c.s1.id)).rascunho)).ok], [true, "RASCUNHO", true]);
      const motivos = await publicarAnuncioML(await c.anuncioSimples(c.semBling), { ml: criarMLFalso(), bling: bf, lerFoto });
      conferir("publicar: pre-checagem recusada devolve os motivos", [motivos.ok, motivos.motivos?.some((m) => /blingId/.test(m))], [false, true]);
    }

    // Fase 3: as proximas tarefas entram aqui, dentro deste bloco.
  }

  // Blocos das tarefas seguintes entram aqui, antes do finally.
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTodos os testes de anuncios ML OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);
