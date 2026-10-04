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

  // Blocos das tarefas seguintes entram aqui, antes do finally.
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTodos os testes da sincronizacao com o Bling OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);
