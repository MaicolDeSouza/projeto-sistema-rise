import "dotenv/config";

/**
 * Testes da sincronizacao Rise <-> Bling (plano de 04/10/2026): o estado de
 * sincronizacao no banco e, nas tarefas seguintes, as regras puras e as acoes, sempre
 * contra um Bling FALSO em memoria. Usa o Postgres, SEM rede: nenhum teste fala com o
 * Bling real.
 *
 *   npm run teste:bling-sync
 *
 * Os produtos de teste levam SKU "ZZ-BS-..." e os fornecedores "ZZ Teste BS...";
 * tudo e apagado no comeco de cada bloco e no fim (os movimentos e as copias de
 * seguranca saem junto com o produto, por Cascade).
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
  CAMPOS_DE_ENVIO,
  assinaturaDoRise,
  contarDivergencias,
  diferencas,
  fornecedoresSemCnpj,
  normalizarDoBling,
  normalizarDoRise,
  normalizarFornecedoresDoRise,
} = await import("../src/lib/blingSync/campos.js");
const { montarCorpoDeCadastro, montarCorpoParcial, textoParaHtml } = await import("../src/lib/blingSync/corpo.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

async function limpar() {
  // Produto primeiro: leva junto os vinculos, os movimentos de estoque e as copias
  // de seguranca (Cascade). O fornecedor so pode sair depois dos vinculos (Restrict).
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-BS-" } } });
  await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: "ZZ Teste BS" } } });
}
await limpar();

try {
  // -------------------------------------------------------------------------
  // Banco: estado do Bling
  // -------------------------------------------------------------------------
  {
    console.log("\nBanco: estado do Bling");
    await limpar();

    const produto = await prisma.produto.create({
      data: { sku: "ZZ-BS-1", tituloBase: "Produto de teste da sincronizacao com o Bling", estoque: 5 },
    });
    const id = produto.id;
    const ler = () => prisma.produto.findUnique({ where: { id } });

    const novo = await ler();
    conferir("produto novo nasce nunca sincronizado", novo.blingSincronizadoEm, null);
    conferir("produto novo nasce sem assinatura", novo.blingAssinatura, null);
    conferir("produto novo nasce sem saldo do Bling", novo.blingSaldo, null);

    // O ajuste de estoque nasce pendente: so a sincronizacao o marca como enviado.
    const movimento = await prisma.movimentoEstoque.create({
      data: { produtoId: id, tipo: "ENTRADA", quantidade: 3, saldoAnterior: 5, saldoNovo: 8 },
    });
    conferir("movimento novo nasce pendente (enviadoAoBlingEm nulo)", movimento.enviadoAoBlingEm, null);
    const lido = await prisma.movimentoEstoque.findUnique({ where: { id: movimento.id } });
    conferir("e continua pendente ao ler do banco", lido.enviadoAoBlingEm, null);

    // O saldo do Bling e virtual (com reservas) e pode ser negativo.
    await prisma.produto.update({ where: { id }, data: { blingSaldo: -2 } });
    conferir("blingSaldo aceita negativo", (await ler()).blingSaldo, -2);

    // Copias de seguranca: uma por envio, ligadas ao produto.
    for (let i = 1; i <= 4; i++) {
      await prisma.blingCopiaProduto.create({
        data: {
          produtoId: id,
          conteudo: { nome: `Copia ${i}`, preco: i },
          // So as copias pares trazem o resumo "campo: de -> para"; as outras ficam sem.
          ...(i % 2 === 0 ? { alteracoes: [{ campo: "preco", de: i - 1, para: i }] } : {}),
        },
      });
    }
    const copias = await prisma.blingCopiaProduto.findMany({ where: { produtoId: id } });
    conferir("4 copias de seguranca gravadas", copias.length, 4);
    conferir("a copia guarda o conteudo em JSON", copias.map((c) => c.conteudo.nome).sort(), ["Copia 1", "Copia 2", "Copia 3", "Copia 4"]);
    // O JSONB do Postgres reordena as chaves do objeto, entao se compara campo a campo.
    const semResumo = copias.find((c) => c.conteudo.nome === "Copia 1");
    const comResumo = copias.find((c) => c.conteudo.nome === "Copia 2");
    conferir("alteracoes e opcional: nula na copia sem resumo", semResumo.alteracoes, null);
    conferir(
      "alteracoes guarda o resumo campo: de -> para",
      comResumo.alteracoes.map((a) => [a.campo, a.de, a.para]),
      [["preco", 1, 2]],
    );
    conferir("a copia tem data de criacao", copias.every((c) => c.criadoEm instanceof Date), true);

    // Apagar o produto leva as copias e os movimentos (Cascade).
    await prisma.produto.delete({ where: { id } });
    conferir("apagar o produto apaga as copias de seguranca", await prisma.blingCopiaProduto.count({ where: { produtoId: id } }), 0);
    conferir("e apaga os movimentos", await prisma.movimentoEstoque.count({ where: { produtoId: id } }), 0);
  }

  // -------------------------------------------------------------------------
  // Regras puras: normalizacao, assinatura e diferencas
  // -------------------------------------------------------------------------
  {
    console.log("\nNormalizacao e assinatura");
    await limpar();

    // Fabricas, para cada caso partir de um objeto novo (nenhum teste muta o do outro).
    const umRise = () => ({
      tituloBase: "Motor JGY370",
      descricaoBase: "Linha 1\nLinha 2",
      precoVenda: 90,
      marca: "Generica",
      unidade: "UN",
      pesoKg: 0.25,
      alturaCm: 3,
      larguraCm: 4.5,
      comprimentoCm: 10,
      ncm: "85011019",
      origem: 0,
    });
    const umBling = () => ({
      nome: "Motor JGY370",
      descricaoCurta: "<p>Linha 1<br>Linha 2</p>",
      preco: 90,
      marca: "GENERICA",
      unidade: "Un",
      pesoBruto: 0.25,
      dimensoes: { altura: 30, largura: 45, profundidade: 100, unidadeMedida: 2 },
      tributacao: { ncm: "85011019", origem: 0 },
      estoque: { minimo: 0, maximo: 0, localizacao: "" },
    });
    const lista = (rise, bling) => diferencas(normalizarDoRise(rise), normalizarDoBling(bling));
    const resumo = (diferenca) => ({ campo: diferenca.campo, tipo: diferenca.tipo, rise: diferenca.rise, bling: diferenca.bling });

    // --- Os campos de envio ---
    const ids = CAMPOS_DE_ENVIO.map((campo) => campo.id);
    conferir("os campos de envio, na ordem", ids, [
      "nome", "descricao", "preco", "marca", "ean", "unidade", "peso", "altura", "largura",
      "comprimento", "estoqueMinimo", "estoqueMaximo", "localizacao", "origem", "ncm", "cest",
      "spedTipoItem", "percentualTributos",
    ]);
    conferir("todo campo tem rotulo para a tela", CAMPOS_DE_ENVIO.every((c) => typeof c.rotulo === "string" && c.rotulo.length > 0), true);
    // Emenda 2: o video fica fora. Codigo, saldo e situacao nunca sao enviados.
    conferir("video, sku, estoque e ativo nao sao campos de envio", ["video", "sku", "estoque", "ativo"].filter((id) => ids.includes(id)), []);

    // --- Normalizacao: o mesmo produto lido dos dois lados ---
    const normalizadoDoRise = normalizarDoRise(umRise());
    conferir("Rise normalizado: uma chave por campo, na ordem, vazio vira null", normalizadoDoRise, {
      nome: "Motor JGY370", descricao: "Linha 1\nLinha 2", preco: 90, marca: "GENERICA", ean: null,
      unidade: "UN", peso: 0.25, altura: 3, largura: 4.5, comprimento: 10, estoqueMinimo: null,
      estoqueMaximo: null, localizacao: null, origem: 0, ncm: "85011019", cest: null,
      spedTipoItem: null, percentualTributos: null,
    });
    conferir("Bling normalizado no mesmo formato (HTML, mm, 'Un', marca em maiusculas, zero vira null)", normalizarDoBling(umBling()), normalizadoDoRise);
    conferir("Rise e Bling iguais nao tem diferenca", lista(umRise(), umBling()), []);

    // --- Diferencas ---
    const bling95 = umBling();
    bling95.preco = 95;
    const diferencaDePreco = lista(umRise(), bling95);
    conferir("preco diferente aparece", diferencaDePreco.map(resumo), [{ campo: "preco", tipo: "diferente", rise: 90, bling: 95 }]);
    conferir("a diferenca traz o rotulo da tela e as chaves na ordem do contrato", Object.keys(diferencaDePreco[0]), ["campo", "rotulo", "rise", "bling", "tipo"]);
    conferir("rotulo sem acento", diferencaDePreco[0].rotulo, "Preco");
    conferir("preco diferente conta como divergencia", contarDivergencias(diferencaDePreco), 1);

    const riseSemMarca = umRise();
    riseSemMarca.marca = null;
    const blingComMarca = umBling();
    blingComMarca.marca = "X";
    const diferencaDeMarca = lista(riseSemMarca, blingComMarca);
    conferir("Rise vazio e Bling com valor: vazioNoRise", diferencaDeMarca.map(resumo), [{ campo: "marca", tipo: "vazioNoRise", rise: null, bling: "X" }]);
    conferir("vazioNoRise nao conta como divergencia", contarDivergencias(diferencaDeMarca), 0);
    conferir("so os 'diferente' contam", contarDivergencias([...diferencaDeMarca, ...diferencaDePreco]), 1);
    conferir("lista vazia nao tem divergencia", contarDivergencias([]), 0);

    const blingSemMarca = umBling();
    blingSemMarca.marca = "";
    conferir("Rise com valor e Bling vazio: diferente (o Rise vai preencher)", lista(umRise(), blingSemMarca).map(resumo), [{ campo: "marca", tipo: "diferente", rise: "GENERICA", bling: null }]);
    conferir("os dois vazios nao aparecem", lista({ ...umRise(), marca: "" }, blingSemMarca), []);

    // --- Normalizacao: texto ---
    conferir(
      "texto e aparado, vazio e so espaco viram null",
      (({ nome, marca, ean, localizacao }) => ({ nome, marca, ean, localizacao }))(
        normalizarDoRise({ tituloBase: "  Motor  ", marca: "   ", ean: "", localizacao: undefined }),
      ),
      { nome: "Motor", marca: null, ean: null, localizacao: null },
    );
    conferir("marca em maiusculas dos dois lados (pt-BR)", [normalizarDoRise({ marca: "ação" }).marca, normalizarDoBling({ marca: "ação" }).marca], ["AÇÃO", "AÇÃO"]);
    conferir("EAN do Rise contra o gtin do Bling", [normalizarDoRise({ ean: " 7891234567895 " }).ean, normalizarDoBling({ gtin: "7891234567895" }).ean], ["7891234567895", "7891234567895"]);
    conferir("localizacao do Bling vem de estoque.localizacao", normalizarDoBling({ estoque: { localizacao: " A-01 " } }).localizacao, "A-01");
    conferir(
      "NCM e CEST: so os digitos, com ou sem pontuacao",
      [normalizarDoRise({ ncm: "8501.10.19", cest: "01.001.00" }), normalizarDoBling({ tributacao: { ncm: "85011019", cest: "0100100" } })].map((c) => [c.ncm, c.cest]),
      [["85011019", "0100100"], ["85011019", "0100100"]],
    );
    conferir("tipo SPED e texto aparado", [normalizarDoRise({ spedTipoItem: " 00 " }).spedTipoItem, normalizarDoBling({ tributacao: { spedTipoItem: "00" } }).spedTipoItem], ["00", "00"]);

    // --- Normalizacao: descricao ---
    conferir(
      "descricao do Rise: \\r\\n vira \\n, espacos e quebras sobrando saem, aparada",
      normalizarDoRise({ descricaoBase: "  Linha 1\r\nLinha 2  \r\n\r\n\r\n\r\nLinha  3 " }).descricao,
      "Linha 1\nLinha 2\n\nLinha 3",
    );
    conferir("descricao vazia do Rise vira null", normalizarDoRise({ descricaoBase: " \r\n " }).descricao, null);
    // O Bling guarda o texto em <p>; um \r\n entre dois <p> soma uma quebra e vira linha em branco.
    conferir(
      "descricao do Bling vem de descricaoCurta, do HTML para texto",
      [normalizarDoBling({ descricaoCurta: "<p>A</p><p>B</p>" }).descricao, normalizarDoBling({ descricaoCurta: "<p>A</p>\r\n<p>B</p>" }).descricao, normalizarDoBling({ descricaoCurta: "" }).descricao],
      ["A\nB", "A\n\nB", null],
    );
    // O Rise guarda texto puro e o envio o escapa (Tarefa 4): o que volta do Bling e HTML
    // com entidades, e tem que dar o mesmo texto.
    conferir(
      "descricao com < & > : o texto do Rise e o HTML escapado do Bling sao iguais",
      lista({ ...umRise(), descricaoBase: "Tensao < 5V & corrente > 1A" }, { ...umBling(), descricaoCurta: "<p>Tensao &lt; 5V &amp; corrente &gt; 1A</p>" }),
      [],
    );
    conferir(
      "descricao com espacos duplos no Rise nao diverge para sempre do Bling",
      lista({ ...umRise(), descricaoBase: "Linha 1  com  espaco\n\n\n\nLinha 2" }, { ...umBling(), descricaoCurta: "<p>Linha 1 com espaco</p><p></p><p>Linha 2</p>" }).map((d) => d.campo),
      [],
    );

    // --- Normalizacao: numeros ---
    conferir("preco em 2 casas", [normalizarDoRise({ precoVenda: 19.999 }).preco, normalizarDoBling({ preco: 19.999 }).preco], [20, 20]);
    conferir("preco zero ou negativo vira null", [normalizarDoRise({ precoVenda: 0 }).preco, normalizarDoRise({ precoVenda: -5 }).preco, normalizarDoBling({ preco: 0 }).preco], [null, null, null]);
    conferir("peso em 3 casas", [normalizarDoRise({ pesoKg: 1.23456 }).peso, normalizarDoBling({ pesoBruto: 1.23456 }).peso], [1.235, 1.235]);
    conferir("peso do Bling: o bruto vale, e o liquido so na falta dele", [
      normalizarDoBling({ pesoBruto: 0.3, pesoLiquido: 0.5 }).peso,
      normalizarDoBling({ pesoBruto: 0, pesoLiquido: 0.5 }).peso,
      normalizarDoBling({ pesoLiquido: 0.5 }).peso,
      normalizarDoBling({ pesoBruto: 0, pesoLiquido: 0 }).peso,
    ], [0.3, 0.5, 0.5, null]);
    conferir("medidas em 2 casas", normalizarDoRise({ alturaCm: 3.456, larguraCm: 4.5, comprimentoCm: 10 }).altura, 3.46);
    conferir("medida zero vira null dos dois lados", [normalizarDoRise({ alturaCm: 0 }).altura, normalizarDoBling({ dimensoes: { altura: 0, unidadeMedida: 1 } }).altura], [null, null]);
    conferir(
      "medidas do Bling por emCm: metros, centimetros e milimetros chegam em cm",
      ["0", "1", "2"].map((unidade, i) => normalizarDoBling({ dimensoes: { altura: [0.03, 3, 30][i], largura: 1, profundidade: 1, unidadeMedida: Number(unidade) } }).altura),
      [3, 3, 3],
    );
    conferir("estoque minimo e maximo: zero do Bling vira null", [normalizarDoBling({ estoque: { minimo: 0, maximo: 0 } }).estoqueMinimo, normalizarDoBling({ estoque: { minimo: 0, maximo: 0 } }).estoqueMaximo], [null, null]);
    conferir("estoque minimo e maximo com valor", lista({ estoqueMinimo: 2, estoqueMaximo: 20 }, { estoque: { minimo: 2, maximo: 20 } }).filter((d) => d.campo.startsWith("estoque")), []);
    conferir("percentual de tributos em 2 casas", [normalizarDoRise({ percentualTributos: 12.5 }).percentualTributos, normalizarDoBling({ tributacao: { percentualTributos: 12.499 } }).percentualTributos], [12.5, 12.5]);
    conferir(
      "origem 0 e valor, nao vazio; ausente e null",
      [normalizarDoRise({ origem: 0 }).origem, normalizarDoBling({ tributacao: { origem: 0 } }).origem, normalizarDoRise({ origem: null }).origem, normalizarDoBling({}).origem, normalizarDoBling({ tributacao: { origem: "x" } }).origem],
      [0, 0, null, null, null],
    );
    conferir("unidade: o Bling 'PÇ' ou 'Un' vira UN, e 'M' vira MT", [normalizarDoBling({ unidade: "Un" }).unidade, normalizarDoBling({ unidade: "PÇ" }).unidade, normalizarDoBling({ unidade: "M" }).unidade, normalizarDoRise({ unidade: "MT" }).unidade], ["UN", "UN", "MT", "MT"]);
    conferir("Bling quase vazio nao quebra", normalizarDoBling({ nome: "X" }), { ...normalizarDoRise({ tituloBase: "X", unidade: "UN" }) });

    // --- O Decimal do Prisma ---
    // A coluna Decimal volta do banco como objeto, nao como numero: a normalizacao converte.
    const produtoDoBanco = await prisma.produto.create({
      data: {
        sku: "ZZ-BS-2", tituloBase: "Produto Decimal", precoVenda: "90.50", pesoKg: "0.250",
        alturaCm: "3.00", larguraCm: "4.50", comprimentoCm: "10.00", percentualTributos: "12.50",
        estoqueMinimo: 2, estoqueMaximo: 20, origem: 0, ncm: "85011019", unidade: "UN",
      },
    });
    const lidoDoBanco = await prisma.produto.findUnique({ where: { id: produtoDoBanco.id } });
    conferir("o preco vem do banco como objeto Decimal, nao como numero", typeof lidoDoBanco.precoVenda, "object");
    conferir(
      "normalizarDoRise converte o Decimal em numero",
      (({ preco, peso, altura, largura, comprimento, percentualTributos, estoqueMinimo, estoqueMaximo, origem }) => ({ preco, peso, altura, largura, comprimento, percentualTributos, estoqueMinimo, estoqueMaximo, origem }))(normalizarDoRise(lidoDoBanco)),
      { preco: 90.5, peso: 0.25, altura: 3, largura: 4.5, comprimento: 10, percentualTributos: 12.5, estoqueMinimo: 2, estoqueMaximo: 20, origem: 0 },
    );

    // --- Fornecedores ---
    const vinculo = (cnpj, nome, extra = {}) => ({ fornecedor: { cnpj, nome }, codigo: null, descricao: null, precoCusto: null, padrao: false, ...extra });
    const a = vinculo("12.345.678/0001-95", "Fornecedor A", { codigo: "A1", descricao: "https://exemplo.com/a", precoCusto: 12.5, padrao: true });
    conferir("CNPJ formatado vira so os 14 digitos", normalizarFornecedoresDoRise([a]), [
      { cnpj: "12345678000195", nome: "Fornecedor A", codigo: "A1", descricao: "https://exemplo.com/a", precoCusto: 12.5, padrao: true },
    ]);
    conferir(
      "codigo e descricao vazios viram null, custo ausente tambem, padrao e booleano",
      normalizarFornecedoresDoRise([vinculo("00.000.000/0001-91", "B", { codigo: " ", descricao: "", precoCusto: null, padrao: undefined })]),
      [{ cnpj: "00000000000191", nome: "B", codigo: null, descricao: null, precoCusto: null, padrao: false }],
    );
    const treze = vinculo("1234567800019", "Fornecedor Treze");
    const estrangeiro = vinculo(null, "Fornecedor Estrangeiro");
    const vazio = vinculo("", "Fornecedor Vazio");
    conferir("CNPJ de 13 digitos, nulo e vazio sao descartados", normalizarFornecedoresDoRise([treze, estrangeiro, vazio, a]).map((f) => f.nome), ["Fornecedor A"]);
    conferir("os descartados vao para o aviso, na ordem de chegada", fornecedoresSemCnpj([treze, a, estrangeiro, vazio]), ["Fornecedor Treze", "Fornecedor Estrangeiro", "Fornecedor Vazio"]);
    conferir("quem tem CNPJ valido nao entra no aviso", fornecedoresSemCnpj([a]), []);
    // CNPJ invalido conta como sem CNPJ (Review Focus 4): 14 digitos nao bastam. Fora da lista
    // e no aviso, em vez de seguir ate o POST /contatos e ser recusado no meio do envio.
    const digitoErrado = vinculo("12345678000196", "Fornecedor Digito Errado");
    const todosZeros = vinculo("00000000000000", "Fornecedor Zeros");
    const todosUns = vinculo("11.111.111/1111-11", "Fornecedor Uns");
    conferir("CNPJ de 14 digitos com digito verificador errado fica fora da lista", normalizarFornecedoresDoRise([digitoErrado, a]).map((f) => f.nome), ["Fornecedor A"]);
    conferir("CNPJ de sequencia repetida fica fora da lista", normalizarFornecedoresDoRise([todosZeros, todosUns, a]).map((f) => f.nome), ["Fornecedor A"]);
    conferir(
      "CNPJ invalido cai no aviso 'sem CNPJ', na ordem de chegada",
      fornecedoresSemCnpj([digitoErrado, a, todosZeros, treze, todosUns]),
      ["Fornecedor Digito Errado", "Fornecedor Zeros", "Fornecedor Treze", "Fornecedor Uns"],
    );
    conferir("so o invalido: lista vazia e aviso com ele", [normalizarFornecedoresDoRise([digitoErrado]), fornecedoresSemCnpj([digitoErrado])], [[], ["Fornecedor Digito Errado"]]);
    const repetido = vinculo("12345678000195", "Fornecedor A repetido", { codigo: "A2" });
    conferir("o mesmo CNPJ em dois vinculos vira um, e fica o primeiro", normalizarFornecedoresDoRise([a, repetido]).map((f) => [f.nome, f.codigo]), [["Fornecedor A", "A1"]]);
    conferir("CNPJ repetido nao e 'sem CNPJ'", fornecedoresSemCnpj([a, repetido]), []);
    const b = vinculo("00.000.000/0001-91", "Fornecedor B");
    conferir("ordenado por CNPJ, qualquer que seja a ordem de chegada", [normalizarFornecedoresDoRise([a, b]), normalizarFornecedoresDoRise([b, a])].map((l) => l.map((f) => f.cnpj)), [["00000000000191", "12345678000195"], ["00000000000191", "12345678000195"]]);
    conferir("lista vazia", [normalizarFornecedoresDoRise([]), fornecedoresSemCnpj([])], [[], []]);

    // Os vinculos de verdade: precoCusto e Decimal, e o fornecedor vem junto.
    const fornecedorComCnpj = await prisma.fornecedor.create({ data: { nome: "ZZ Teste BS Com CNPJ", cnpj: "12.345.678/0001-95" } });
    const fornecedorSemCnpj = await prisma.fornecedor.create({ data: { nome: "ZZ Teste BS Sem CNPJ" } });
    await prisma.produtoFornecedor.create({ data: { produtoId: produtoDoBanco.id, fornecedorId: fornecedorComCnpj.id, codigo: "FC-1", precoCusto: "12.50", padrao: true } });
    await prisma.produtoFornecedor.create({ data: { produtoId: produtoDoBanco.id, fornecedorId: fornecedorSemCnpj.id, codigo: "FS-1", precoCusto: "9.00" } });
    const vinculosDoBanco = await prisma.produtoFornecedor.findMany({
      where: { produtoId: produtoDoBanco.id },
      include: { fornecedor: { select: { cnpj: true, nome: true } } },
    });
    conferir(
      "vinculos lidos do banco (custo Decimal): so quem tem CNPJ, com o custo em numero",
      normalizarFornecedoresDoRise(vinculosDoBanco),
      [{ cnpj: "12345678000195", nome: "ZZ Teste BS Com CNPJ", codigo: "FC-1", descricao: null, precoCusto: 12.5, padrao: true }],
    );
    conferir("o sem CNPJ do banco cai no aviso", fornecedoresSemCnpj(vinculosDoBanco), ["ZZ Teste BS Sem CNPJ"]);

    // --- Assinatura ---
    const campos = normalizarDoRise(umRise());
    const assinatura = assinaturaDoRise(campos, []);
    conferir("a assinatura e um SHA-256 em hexadecimal", /^[0-9a-f]{64}$/.test(assinatura), true);
    conferir("a assinatura e estavel", assinaturaDoRise(normalizarDoRise(umRise()), []), assinatura);
    conferir("mesma assinatura com as chaves do objeto em outra ordem", assinaturaDoRise(Object.fromEntries(Object.entries(campos).reverse()), []), assinatura);
    conferir("o nome diferente muda a assinatura", assinaturaDoRise({ ...campos, nome: "Outro motor" }, []) !== assinatura, true);
    conferir("o preco diferente muda a assinatura", assinaturaDoRise({ ...campos, preco: 91 }, []) !== assinatura, true);
    conferir(
      "cada campo de envio muda a assinatura",
      CAMPOS_DE_ENVIO.filter((campo) => assinaturaDoRise({ ...campos, [campo.id]: "mudou" }, []) === assinatura).map((campo) => campo.id),
      [],
    );
    // Codigo, saldo e situacao nunca vao ao Bling: nao podem acender o selo de "mudou".
    conferir(
      "sku, estoque e ativo diferentes nao mudam a assinatura",
      assinaturaDoRise(normalizarDoRise({ ...umRise(), sku: "ZZ-BS-OUTRO", estoque: 99, ativo: false }), []),
      assinatura,
    );
    conferir("nem se chegarem junto dos campos", assinaturaDoRise({ ...campos, sku: "X", estoque: 7, ativo: false }, []), assinatura);

    const comA = assinaturaDoRise(campos, normalizarFornecedoresDoRise([a]));
    conferir("ter fornecedor muda a assinatura", comA !== assinatura, true);
    conferir("o precoCusto de um fornecedor muda a assinatura", assinaturaDoRise(campos, normalizarFornecedoresDoRise([{ ...a, precoCusto: 13 }])) !== comA, true);
    conferir("o codigo, a descricao e o padrao do vinculo mudam a assinatura", [{ codigo: "A9" }, { descricao: "outro" }, { padrao: false }].map((troca) => assinaturaDoRise(campos, normalizarFornecedoresDoRise([{ ...a, ...troca }])) !== comA), [true, true, true]);
    conferir("a ordem de chegada dos vinculos nao muda a assinatura", assinaturaDoRise(campos, normalizarFornecedoresDoRise([b, a])), assinaturaDoRise(campos, normalizarFornecedoresDoRise([a, b])));
    // O que nao pode ser enviado nao pode deixar o selo aceso para sempre.
    conferir("fornecedor sem CNPJ nao entra na assinatura", assinaturaDoRise(campos, normalizarFornecedoresDoRise([a, treze, estrangeiro])), comA);
    conferir("nem o de CNPJ invalido", assinaturaDoRise(campos, normalizarFornecedoresDoRise([a, digitoErrado, todosZeros])), comA);
    // O vinculo enviado e CNPJ, codigo, descricao, custo e padrao; o nome so serve para
    // achar o contato no Bling, e renomear o fornecedor nao muda o que vai.
    conferir("o nome do fornecedor nao entra na assinatura", assinaturaDoRise(campos, normalizarFornecedoresDoRise([{ ...a, fornecedor: { ...a.fornecedor, nome: "Renomeado" } }])), comA);
  }

  // -------------------------------------------------------------------------
  // Regras puras: corpo do envio
  // -------------------------------------------------------------------------
  {
    console.log("\nCorpo do envio");

    // A ordem das chaves de um objeto nao e contrato (o Bling as devolve numa ordem e o corpo
    // as monta noutra), entao os objetos se comparam com as chaves ordenadas.
    const ordenado = (valor) => {
      if (Array.isArray(valor)) return valor.map(ordenado);
      if (valor && typeof valor === "object") {
        return Object.fromEntries(Object.keys(valor).sort().map((chave) => [chave, ordenado(valor[chave])]));
      }
      return valor;
    };
    const chaves = (objeto) => Object.keys(objeto).sort();
    // null ou undefined em qualquer profundidade: "campo vazio no Rise nunca vai ao Bling".
    const temVazio = (valor) => valor === null || valor === undefined || (typeof valor === "object" && Object.values(valor).some(temVazio));

    // O produto como o GET /produtos/{id} o devolve (so o que importa aqui), e o Rise ja
    // normalizado, que e o que as funcoes recebem. Fabricas: cada caso parte de um objeto novo.
    const umBlingAtual = () => ({
      id: 1001, nome: "Motor antigo", codigo: "ZZ-BS-1", preco: 80, tipo: "P", situacao: "A", formato: "S",
      descricaoCurta: "<b>velha</b>", marca: "X", unidade: "UN", pesoLiquido: 0.2, pesoBruto: 0.2, gtin: "",
      actionEstoque: "", categoria: { id: 7 }, linhaProduto: { id: 3 }, variacoes: [{ id: 1 }],
      midia: { video: { url: "https://exemplo.com/v" }, imagens: { internas: [{ link: "https://s3/foto.jpg" }] } },
      fornecedor: { id: 5, contato: { id: 6, nome: "F" }, codigo: "F1", precoCusto: 10 },
      estrutura: { tipoEstoque: "", lancamentoEstoque: "", componentes: [] },
      camposCustomizados: [{ idCampoCustomizado: 1, valor: "x" }],
      dimensoes: { largura: 4, altura: 3, profundidade: 9, unidadeMedida: 1 },
      estoque: { minimo: 1, maximo: 5, crossdocking: 2, localizacao: "A1", saldoVirtualTotal: 8 },
      tributacao: { origem: 0, ncm: "85011019", cest: "", spedTipoItem: "00", percentualTributos: 10, nFCI: "N1", grupoProduto: { id: 9 } },
    });
    const umRiseNormalizado = (extra = {}) => ({ ...normalizarDoRise({}), ...extra });

    // --- textoParaHtml ---
    conferir("textoParaHtml: &, <, aspas e \\r\\n", textoParaHtml('a<b & "c"\r\nd'), "a&lt;b &amp; &quot;c&quot;<br>d");
    conferir("textoParaHtml: nunca deixa uma tag crua (script)", textoParaHtml("<script>x</script>").includes("<script"), false);
    conferir("textoParaHtml: o script escapado", textoParaHtml("<script>x</script>"), "&lt;script&gt;x&lt;/script&gt;");
    conferir("textoParaHtml: > e apostrofo", textoParaHtml("a > b, it's"), "a &gt; b, it&#39;s");
    conferir("textoParaHtml: \\r sozinho e \\r\\n valem uma quebra cada, \\n tambem", [textoParaHtml("a\rb"), textoParaHtml("a\r\nb"), textoParaHtml("a\nb")], ["a<br>b", "a<br>b", "a<br>b"]);
    conferir("textoParaHtml: linha em branco vira duas quebras", textoParaHtml("a\n\nb"), "a<br><br>b");
    conferir("textoParaHtml: o & vai primeiro (uma entidade digitada vira texto, nao some)", textoParaHtml("&lt; &amp;"), "&amp;lt; &amp;amp;");
    conferir("textoParaHtml: vazio, null e undefined dao texto vazio", [textoParaHtml(""), textoParaHtml(null), textoParaHtml(undefined)], ["", "", ""]);

    // --- Ida e volta da descricao (Review Focus 2 e 5) ---
    // O Rise guarda texto puro, o envio o escapa e o Bling o devolve como HTML: lido de volta
    // tem que dar o MESMO texto, senao a segunda sincronizacao acha diferenca onde nao ha.
    const textos = [
      "Tensao < 5V & corrente > 1A",
      "Disse \"oi\" e 'tchau'",
      "Linha 1\r\nLinha 2",
      "A\n\n\n\nB",
      "Linha 1  com  espaco",
      "a b  c",
      "<script>alert(1)</script>",
      "&amp; &lt; &#65; &nbsp; &quot;",
      "  Inicio e fim  \n\n  ",
      "a\n \n b",
      "<br> literal e <p>x</p> e </p>",
      "R$ 5,00 > 3 && x<y",
      "Acentuacao: ação, Ñ, ü, 4,5\" e 3/4'",
      "Pronto \u{1F600} ok",
      "\tTab\taqui\t",
      " ",
      "",
    ];
    for (const original of textos) {
      const esperado = normalizarDoRise({ descricaoBase: original }).descricao;
      const direto = normalizarDoBling({ descricaoCurta: textoParaHtml(original) }).descricao;
      // O caminho real: o corpo leva o texto JA normalizado do Rise, e o Bling pode embrulhar em <p>.
      const enviado = montarCorpoParcial({}, normalizarDoRise({ descricaoBase: original }), ["descricao"]).descricaoCurta;
      const pelaMontagem = normalizarDoBling({ descricaoCurta: enviado ?? "" }).descricao;
      const embrulhado = normalizarDoBling({ descricaoCurta: `<p>${enviado ?? ""}</p>\r\n` }).descricao;
      // O espaco sem quebra (NBSP) nao se distingue do comum no terminal: aparece escrito.
      const rotulo = JSON.stringify(original).replace(/ /g, "\\u00a0");
      conferir(`ida e volta da descricao ${rotulo}`, [direto, pelaMontagem, embrulhado], [esperado, esperado, esperado]);
    }

    // --- Corpo parcial: so o que mudou, grupos por inteiro ---
    const riseNovo = umRiseNormalizado({ nome: "Motor novo", descricao: "nova\nlinha", altura: 3.5 });
    const parcial = montarCorpoParcial(umBlingAtual(), riseNovo, ["nome", "descricao", "altura"]);
    conferir("parcial: so nome, descricaoCurta e o grupo dimensoes", chaves(parcial), ["descricaoCurta", "dimensoes", "nome"]);
    conferir("parcial: nome e descricao (a quebra vira <br>)", [parcial.nome, parcial.descricaoCurta], ["Motor novo", "nova<br>linha"]);
    conferir("parcial: dimensoes vai INTEIRO, a altura do Rise e o resto do Bling", ordenado(parcial.dimensoes), { altura: 3.5, largura: 4, profundidade: 9, unidadeMedida: 1 });
    conferir(
      "parcial: nao leva categoria, variacoes, situacao, codigo, marca, estoque nem midia",
      ["categoria", "variacoes", "situacao", "codigo", "marca", "estoque", "midia"].filter((chave) => chave in parcial),
      [],
    );

    // Nada que nao seja do Rise, nem com todos os campos mudando de uma vez.
    const riseCheio = umRiseNormalizado({
      nome: "N", descricao: "D", preco: 99.9, marca: "M", ean: "7891234567895", unidade: "UN", peso: 0.5,
      altura: 1, largura: 2, comprimento: 3, estoqueMinimo: 4, estoqueMaximo: 40, localizacao: "Z9",
      origem: 1, ncm: "12345678", cest: "0100100", spedTipoItem: "04", percentualTributos: 12.5,
    });
    const todos = CAMPOS_DE_ENVIO.map((campo) => campo.id);
    // O corpo e montado numa copia profunda dos grupos: tirar o saldo do estoque nao pode tirar do objeto lido.
    const blingRecebido = umBlingAtual();
    montarCorpoParcial(blingRecebido, riseCheio, todos);
    conferir("parcial: nao muda o blingAtual recebido (o saldo e as medidas ficam)", ordenado(blingRecebido), ordenado(umBlingAtual()));
    const cheio = montarCorpoParcial(umBlingAtual(), riseCheio, todos);
    conferir(
      "parcial com todos os campos: so as chaves de envio",
      chaves(cheio),
      ["descricaoCurta", "dimensoes", "estoque", "gtin", "marca", "nome", "pesoBruto", "pesoLiquido", "preco", "tributacao", "unidade"],
    );
    conferir(
      "parcial com todos os campos: nunca codigo, situacao, midia, fornecedor, actionEstoque, categoria, variacoes, estrutura nem campos personalizados",
      ["id", "codigo", "tipo", "formato", "situacao", "midia", "fornecedor", "actionEstoque", "categoria", "linhaProduto", "variacoes", "estrutura", "camposCustomizados", "imagemURL"].filter((chave) => chave in cheio),
      [],
    );
    conferir("parcial com todos os campos: raiz", [cheio.nome, cheio.descricaoCurta, cheio.preco, cheio.marca, cheio.gtin, cheio.unidade, cheio.pesoLiquido, cheio.pesoBruto], ["N", "D", 99.9, "M", "7891234567895", "UN", 0.5, 0.5]);
    conferir("parcial com todos os campos: dimensoes (comprimento e profundidade)", ordenado(cheio.dimensoes), { altura: 1, largura: 2, profundidade: 3, unidadeMedida: 1 });
    conferir("parcial com todos os campos: estoque, sem o saldo, com o que o Rise nao envia", ordenado(cheio.estoque), { crossdocking: 2, localizacao: "Z9", maximo: 40, minimo: 4 });
    conferir(
      "parcial com todos os campos: tributacao com o resto do grupo como veio do Bling",
      ordenado(cheio.tributacao),
      { cest: "0100100", grupoProduto: { id: 9 }, nFCI: "N1", ncm: "12345678", origem: 1, percentualTributos: 12.5, spedTipoItem: "04" },
    );

    // Estoque: o grupo vai inteiro, sem o saldo (somente-leitura).
    const parcialEstoque = montarCorpoParcial(umBlingAtual(), umRiseNormalizado({ estoqueMaximo: 9 }), ["estoqueMaximo"]);
    conferir("estoque: so o grupo estoque", chaves(parcialEstoque), ["estoque"]);
    conferir("estoque: sem saldoVirtualTotal, o resto como esta no Bling", ordenado(parcialEstoque.estoque), { crossdocking: 2, localizacao: "A1", maximo: 9, minimo: 1 });
    conferir("estoque: localizacao e minimo mudam sozinhos", ordenado(montarCorpoParcial(umBlingAtual(), umRiseNormalizado({ localizacao: "B2", estoqueMinimo: 3 }), ["localizacao", "estoqueMinimo"]).estoque), { crossdocking: 2, localizacao: "B2", maximo: 5, minimo: 3 });
    conferir("estoque: grupo ausente no Bling vira so o que o Rise manda", montarCorpoParcial({}, umRiseNormalizado({ localizacao: "B2" }), ["localizacao"]), { estoque: { localizacao: "B2" } });

    // Tributacao: o grupo inteiro, e a origem 0 e valor.
    const parcialTributacao = montarCorpoParcial(umBlingAtual(), umRiseNormalizado({ origem: 0, ncm: "99999999" }), ["ncm"]);
    conferir("tributacao: so o grupo, so o NCM trocado, o resto como no Bling", ordenado(parcialTributacao), { tributacao: { cest: "", grupoProduto: { id: 9 }, nFCI: "N1", ncm: "99999999", origem: 0, percentualTributos: 10, spedTipoItem: "00" } });
    conferir("tributacao: origem 0 e valor, nao vazio", montarCorpoParcial({ tributacao: { origem: 1 } }, umRiseNormalizado({ origem: 0 }), ["origem"]), { tributacao: { origem: 0 } });

    // Peso: os dois campos do Bling, iguais.
    conferir("peso: pesoLiquido e pesoBruto saem iguais ao peso do Rise", montarCorpoParcial(umBlingAtual(), umRiseNormalizado({ peso: 0.75 }), ["peso"]), { pesoLiquido: 0.75, pesoBruto: 0.75 });
    conferir("preco, marca, EAN e unidade: um campo da raiz cada", montarCorpoParcial(umBlingAtual(), umRiseNormalizado({ preco: 91, marca: "NOVA", ean: "7891234567895", unidade: "MT" }), ["preco", "marca", "ean", "unidade"]), { preco: 91, marca: "NOVA", gtin: "7891234567895", unidade: "MT" });
    conferir("so entra o que esta em camposAlterados: o Rise tem mais coisa que nao entra", chaves(montarCorpoParcial(umBlingAtual(), riseCheio, ["preco"])), ["preco"]);

    // Vazio no Rise nunca apaga nada no Bling.
    conferir("campo null no Rise nao entra, mesmo em camposAlterados (marca)", montarCorpoParcial(umBlingAtual(), umRiseNormalizado({ marca: null, nome: "Novo" }), ["marca", "nome"]), { nome: "Novo" });
    conferir("grupo cujos campos alterados estao todos vazios no Rise nao vai", montarCorpoParcial(umBlingAtual(), umRiseNormalizado(), ["altura", "estoqueMaximo", "ncm"]), {});
    conferir("camposAlterados vazio devolve {}", montarCorpoParcial(umBlingAtual(), riseCheio, []), {});
    conferir("camposAlterados ausente devolve {}", montarCorpoParcial(umBlingAtual(), riseCheio), {});
    conferir("campo desconhecido em camposAlterados e ignorado (video, sku, estoque)", montarCorpoParcial(umBlingAtual(), riseCheio, ["video", "sku", "estoque", "saldo"]), {});
    conferir("o corpo parcial nunca tem null nem undefined", temVazio(cheio), false);
    conferir("blingAtual ausente nao quebra: o grupo nasce so com o que o Rise manda", montarCorpoParcial(null, umRiseNormalizado({ altura: 2 }), ["altura"]), { dimensoes: { altura: 2, unidadeMedida: 1 } });

    // --- Dimensoes: as tres medidas na mesma unidade ---
    // O Bling em mm: se so a altura muda e o grupo vai com unidadeMedida 1, as outras duas
    // medidas (que estavam em mm) tem que ir em cm, senao 45 mm viraria 45 cm.
    const blingEmMm = () => ({ ...umBlingAtual(), dimensoes: { largura: 45, altura: 30, profundidade: 100, unidadeMedida: 2 } });
    conferir(
      "dimensoes: o Bling em mm, so a altura muda, as outras vao convertidas para cm",
      ordenado(montarCorpoParcial(blingEmMm(), umRiseNormalizado({ altura: 3.5 }), ["altura"]).dimensoes),
      { altura: 3.5, largura: 4.5, profundidade: 10, unidadeMedida: 1 },
    );
    conferir(
      "dimensoes: o Bling em metros",
      ordenado(montarCorpoParcial({ dimensoes: { largura: 0.045, altura: 0.03, profundidade: 0.1, unidadeMedida: 0 } }, umRiseNormalizado({ altura: 3.5 }), ["altura"]).dimensoes),
      { altura: 3.5, largura: 4.5, profundidade: 10, unidadeMedida: 1 },
    );
    conferir(
      "dimensoes: se uma medida muda, as tres vao do Rise quando ele tem valor (mesmo as que nao mudaram)",
      ordenado(montarCorpoParcial(blingEmMm(), umRiseNormalizado({ altura: 3.5, largura: 4.5, comprimento: 10 }), ["altura"]).dimensoes),
      { altura: 3.5, largura: 4.5, profundidade: 10, unidadeMedida: 1 },
    );
    conferir(
      "dimensoes: o que o Rise nao tem fica o do Bling (convertido)",
      ordenado(montarCorpoParcial(blingEmMm(), umRiseNormalizado({ altura: 3.5, comprimento: 12 }), ["altura", "comprimento"]).dimensoes),
      { altura: 3.5, largura: 4.5, profundidade: 12, unidadeMedida: 1 },
    );
    conferir(
      "dimensoes: medida zero no Bling continua zero, sem virar null",
      ordenado(montarCorpoParcial({ dimensoes: { largura: 0, altura: 30, profundidade: 0, unidadeMedida: 2 } }, umRiseNormalizado({ altura: 3.5 }), ["altura"]).dimensoes),
      { altura: 3.5, largura: 0, profundidade: 0, unidadeMedida: 1 },
    );
    conferir(
      "dimensoes: o Bling em cm nao tem medida refeita (3,456 fica 3,456)",
      ordenado(montarCorpoParcial({ dimensoes: { largura: 3.456, altura: 3, profundidade: 9, unidadeMedida: 1 } }, umRiseNormalizado({ altura: 5 }), ["altura"]).dimensoes),
      { altura: 5, largura: 3.456, profundidade: 9, unidadeMedida: 1 },
    );

    // --- A segunda sincronizacao nao acha diferenca (Review Focus 5) ---
    // Simula o PATCH: os campos soltos trocam o valor e cada grupo e trocado por inteiro. Depois
    // le o Bling de novo, como a tela faz, e compara.
    const aplicarPatch = (bling, corpo) => ({ ...bling, ...corpo });
    const riseDoCaso = normalizarDoRise({
      tituloBase: "Motor JGY370 novo", descricaoBase: "Tensao < 5V & \"ok\"\r\nLinha 2", precoVenda: 99.9, marca: "generica",
      ean: "7891234567895", unidade: "UN", pesoKg: 0.5, alturaCm: 3.5, larguraCm: 4.5, comprimentoCm: 10,
      estoqueMinimo: 4, estoqueMaximo: 40, localizacao: "Z9", origem: 1, ncm: "8501.10.19", cest: "01.001.00", spedTipoItem: "04", percentualTributos: 12.5,
    });
    for (const [nome, bling] of [["Bling em cm", umBlingAtual()], ["Bling em mm", blingEmMm()]]) {
      const antes = diferencas(riseDoCaso, normalizarDoBling(bling));
      const alterados = antes.filter((d) => d.tipo === "diferente").map((d) => d.campo);
      const depois = diferencas(riseDoCaso, normalizarDoBling(aplicarPatch(bling, montarCorpoParcial(bling, riseDoCaso, alterados))));
      conferir(`segunda sincronizacao sem diferenca (${nome}): havia ${alterados.length} campo(s) a enviar`, [alterados.length > 0, depois], [true, []]);
    }
    // So a altura difere e o Bling esta em mm: as medidas que nao mudaram nao podem passar a divergir.
    const riseSoAltura = normalizarDoRise({ tituloBase: "Motor antigo", unidade: "UN", alturaCm: 3.5, larguraCm: 4.5, comprimentoCm: 10 });
    const blingSoAltura = { nome: "Motor antigo", unidade: "UN", dimensoes: { largura: 45, altura: 30, profundidade: 100, unidadeMedida: 2 } };
    const corpoSoAltura = montarCorpoParcial(blingSoAltura, riseSoAltura, ["altura"]);
    conferir(
      "mm no Bling, so a altura difere: depois do envio nenhuma medida diverge",
      [diferencas(riseSoAltura, normalizarDoBling(blingSoAltura)).map((d) => d.campo), diferencas(riseSoAltura, normalizarDoBling(aplicarPatch(blingSoAltura, corpoSoAltura)))],
      [["altura"], []],
    );

    // --- Corpo de cadastro (POST /produtos) ---
    const cadastro = montarCorpoDeCadastro("ZZ-BS-9", riseCheio);
    conferir("cadastro: codigo, tipo P, formato S e situacao A", [cadastro.codigo, cadastro.tipo, cadastro.formato, cadastro.situacao], ["ZZ-BS-9", "P", "S", "A"]);
    conferir("cadastro: os campos de envio, com o mesmo mapeamento do parcial", [cadastro.nome, cadastro.descricaoCurta, cadastro.preco, cadastro.marca, cadastro.gtin, cadastro.unidade, cadastro.pesoLiquido, cadastro.pesoBruto], ["N", "D", 99.9, "M", "7891234567895", "UN", 0.5, 0.5]);
    conferir("cadastro: dimensoes em cm", ordenado(cadastro.dimensoes), { altura: 1, largura: 2, profundidade: 3, unidadeMedida: 1 });
    conferir("cadastro: estoque so com minimo, maximo e localizacao (sem saldo)", ordenado(cadastro.estoque), { localizacao: "Z9", maximo: 40, minimo: 4 });
    conferir("cadastro: tributacao", ordenado(cadastro.tributacao), { cest: "0100100", ncm: "12345678", origem: 1, percentualTributos: 12.5, spedTipoItem: "04" });
    conferir("cadastro: nao tem midia, saldo nem categoria", ["midia", "categoria", "variacoes", "fornecedor", "estrutura", "actionEstoque", "id"].filter((chave) => chave in cadastro).concat("saldoVirtualTotal" in cadastro.estoque ? ["estoque.saldoVirtualTotal"] : []), []);
    conferir("cadastro: nenhuma chave null nem undefined", temVazio(cadastro), false);

    const cadastroMinimo = montarCorpoDeCadastro("ZZ-BS-8", umRiseNormalizado({ nome: "So o nome" }));
    conferir("cadastro de um Rise quase vazio: so codigo, nome e os fixos, sem grupo vazio", ordenado(cadastroMinimo), { codigo: "ZZ-BS-8", formato: "S", nome: "So o nome", situacao: "A", tipo: "P" });
    conferir("cadastro: grupo so com o que tem valor (a unidade de medida acompanha as medidas)", ordenado(montarCorpoDeCadastro("ZZ-BS-7", umRiseNormalizado({ nome: "X", altura: 2, origem: 0, localizacao: "A1" })).dimensoes), { altura: 2, unidadeMedida: 1 });
    conferir("cadastro: origem 0 entra, estoque so com a localizacao", [montarCorpoDeCadastro("ZZ-BS-7", umRiseNormalizado({ nome: "X", origem: 0, localizacao: "A1" })).tributacao, montarCorpoDeCadastro("ZZ-BS-7", umRiseNormalizado({ nome: "X", origem: 0, localizacao: "A1" })).estoque], [{ origem: 0 }, { localizacao: "A1" }]);
    conferir("cadastro: sem medidas nao ha dimensoes", "dimensoes" in cadastroMinimo, false);
    conferir("cadastro: a descricao vai escapada", montarCorpoDeCadastro("ZZ-BS-6", umRiseNormalizado({ nome: "X", descricao: "a<b & c\nd" })).descricaoCurta, "a&lt;b &amp; c<br>d");
    conferir("cadastro de um Rise de verdade (normalizado do produto do banco): sem null", temVazio(montarCorpoDeCadastro("ZZ-BS-5", normalizarDoRise({ tituloBase: "Produto", precoVenda: "10.50", unidade: "UN" }))), false);
  }

  // Blocos das tarefas seguintes entram aqui, antes do finally.
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTodos os testes da sincronizacao com o Bling OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);
