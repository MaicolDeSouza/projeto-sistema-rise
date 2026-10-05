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
const { estoqueDoRise } = await import("../src/lib/blingSync/estoque.js");
const { estadoDoIconeBling } = await import("../src/lib/blingSync/estado.js");
const { config, separarLista } = await import("../src/lib/integracoes/config.js");
const { blingGet, blingPatch, blingPost, blingPut, urlDoBling } = await import("../src/lib/integracoes/bling.js");
const { clienteBling, exigirCodigoLiberado } = await import("../src/lib/blingSync/cliente.js");
const { buscarNoBling, lerParaPopup, lerProdutoDoRise } = await import("../src/lib/blingSync/leitura.js");
const { cadastrarNoBling, enviarAjustesDeEstoque, sincronizarProduto } = await import("../src/lib/blingSync/envio.js");
const { sincronizarEstoqueDoBling } = await import("../src/lib/blingSync/saldos.js");
const { consultaDaChamada, criarBlingFalso } = await import("./lib/blingFalso.js");

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
      // \r sozinho (CR de planilha, PDF ou formato antigo de Mac): vale uma quebra dos dois lados.
      "a\rb",
      "a\r\n\rb",
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

  // -------------------------------------------------------------------------
  // Regras puras: estoque do Rise e estado do icone
  // -------------------------------------------------------------------------
  {
    console.log("\nEstoque e estado");

    const entrada = (quantidade) => ({ tipo: "ENTRADA", quantidade });
    const saida = (quantidade) => ({ tipo: "SAIDA", quantidade });
    const balanco = (quantidade) => ({ tipo: "BALANCO", quantidade });

    // --- Estoque do Rise = saldo do Bling + ajustes pendentes, aplicados na ordem ---
    conferir("estoque: sem pendentes e o saldo do Bling", estoqueDoRise(10, []), 10);
    conferir("estoque: a entrada soma", estoqueDoRise(10, [entrada(3)]), 13);
    conferir("estoque: entrada e saida, na ordem", estoqueDoRise(10, [entrada(3), saida(1)]), 12);
    conferir("estoque: saida maior que o saldo nao deixa menos que 0", estoqueDoRise(10, [saida(20)]), 0);
    conferir("estoque: o balanco define o saldo, e o que vem depois parte dele", estoqueDoRise(10, [entrada(3), balanco(7), saida(2)]), 5);
    // A ordem importa: o balanco no fim apaga o que veio antes, no comeco ele e o ponto de partida.
    conferir("estoque: a mesma lista em outra ordem da outro resultado", [estoqueDoRise(10, [balanco(7), entrada(3), saida(2)]), estoqueDoRise(10, [entrada(3), saida(2), balanco(7)])], [8, 7]);
    conferir("estoque: balanco 0 zera", estoqueDoRise(10, [balanco(0)]), 0);

    // Emenda 6: o saldo virtual do Bling pode ser negativo (reservas). Os pendentes se aplicam
    // sobre o valor cru e so no fim se corta em 0: cortar antes esconderia a entrada.
    conferir("estoque: saldo negativo do Bling, sem pendentes, da 0", estoqueDoRise(-8, []), 0);
    conferir("estoque: saldo negativo + entrada (-8 + 3 = -5) da 0: o corte e so no fim", estoqueDoRise(-8, [entrada(3)]), 0);
    conferir("estoque: saldo negativo + entradas que passam do zero (-8 + 12 = 4)", estoqueDoRise(-8, [entrada(12)]), 4);
    conferir("estoque: saldo negativo, balanco define o saldo", estoqueDoRise(-8, [balanco(5)]), 5);
    conferir("estoque: o meio da conta pode ficar negativo (10 - 20 + 15 = 5, e nao 0 + 15)", estoqueDoRise(10, [saida(20), entrada(15)]), 5);

    // Entrada ruim comum nao quebra a tela: conta como zero e segue.
    conferir("estoque: quantidade nao numerica conta 0", estoqueDoRise(10, [entrada("abc"), saida(undefined), entrada(null), entrada(NaN), saida(Infinity)]), 10);
    conferir("estoque: quantidade em texto numerico vale o numero", estoqueDoRise(10, [entrada("3")]), 13);
    conferir("estoque: tipo desconhecido e ignorado", estoqueDoRise(10, [{ tipo: "OUTRO", quantidade: 5 }, entrada(1)]), 11);
    conferir("estoque: pendentes ausentes, saldo ausente ou nao numerico", [estoqueDoRise(10), estoqueDoRise(10, null), estoqueDoRise(null, [entrada(2)]), estoqueDoRise("x", []), estoqueDoRise(undefined)], [10, 10, 2, 0, 0]);
    conferir("estoque: item nulo na lista de pendentes e ignorado", estoqueDoRise(10, [null, entrada(1), undefined]), 11);
    const listaDePendentes = [entrada(3), saida(1)];
    estoqueDoRise(10, listaDePendentes);
    conferir("estoque: nao muda a lista recebida", listaDePendentes, [entrada(3), saida(1)]);

    // --- Estado do icone: cor e selo sao independentes ---
    const estado = (extra) => estadoDoIconeBling({ sincronizadoEm: null, assinaturaGuardada: null, assinaturaAtual: "a", pendentes: 0, ...extra });
    const sincronizadoEm = new Date("2026-10-04T12:00:00Z");

    conferir("icone: nunca sincronizado e sem pendente = cinza, sem selo", estado({}), { cor: "cinza", divergente: false, motivos: [] });
    conferir("icone: nunca sincronizado com 1 pendente = cinza com selo de estoque", estado({ pendentes: 1 }), { cor: "cinza", divergente: true, motivos: ["estoque"] });
    conferir("icone: sincronizado e assinaturas iguais = verde, sem selo", estado({ sincronizadoEm, assinaturaGuardada: "a", assinaturaAtual: "a" }), { cor: "verde", divergente: false, motivos: [] });
    conferir("icone: sincronizado e assinaturas diferentes = verde com selo de campos", estado({ sincronizadoEm, assinaturaGuardada: "a", assinaturaAtual: "b" }), { cor: "verde", divergente: true, motivos: ["campos"] });
    conferir("icone: sincronizado, diferentes e 2 pendentes = campos e estoque, nesta ordem", estado({ sincronizadoEm, assinaturaGuardada: "a", assinaturaAtual: "b", pendentes: 2 }), { cor: "verde", divergente: true, motivos: ["campos", "estoque"] });
    conferir("icone: sincronizado, assinaturas iguais e 1 pendente = verde com selo de estoque", estado({ sincronizadoEm, assinaturaGuardada: "a", assinaturaAtual: "a", pendentes: 1 }), { cor: "verde", divergente: true, motivos: ["estoque"] });
    // Nunca sincronizado nao tem o que comparar: a assinatura guardada vazia nao e "campos".
    conferir("icone: nunca sincronizado, mesmo com assinaturas diferentes, nao tem selo de campos", estado({ assinaturaGuardada: "a", assinaturaAtual: "b" }), { cor: "cinza", divergente: false, motivos: [] });
    conferir("icone: sincronizado sem assinatura guardada conta como campos diferentes", estado({ sincronizadoEm, assinaturaGuardada: null, assinaturaAtual: "b" }), { cor: "verde", divergente: true, motivos: ["campos"] });
    conferir("icone: pendentes ausente ou nao numerico conta 0", [estado({ pendentes: undefined }), estado({ pendentes: "x" }), estado({ pendentes: NaN })].map((e) => e.divergente), [false, false, false]);
    conferir("icone: pendentes negativo nao e pendente", estado({ pendentes: -1 }).divergente, false);
  }

  // -------------------------------------------------------------------------
  // Cliente do Bling, trava por codigo e Bling falso
  // -------------------------------------------------------------------------
  {
    console.log("\nCliente e trava");

    // A mensagem do que a funcao lanca (ou null): o teste so quer o texto do erro.
    const mensagemDe = (fn) => {
      try {
        fn();
        return null;
      } catch (erro) {
        return erro.message;
      }
    };
    const rejeicaoDe = async (promessa) => {
      try {
        await promessa;
        return null;
      } catch (erro) {
        return erro.message;
      }
    };
    const casa = (texto, regex) => typeof texto === "string" && regex.test(texto);

    // --- Segunda trava: a lista de codigos liberados ---
    conferir("codigos liberados: lista vazia libera qualquer codigo", mensagemDe(() => exigirCodigoLiberado("100246", [])), null);
    conferir("codigos liberados: o codigo esta na lista, sem diferenciar caixa", mensagemDe(() => exigirCodigoLiberado("ZZ-TESTE", ["zz-teste"])), null);
    conferir("codigos liberados: a lista em maiuscula e o codigo em minuscula tambem passa", mensagemDe(() => exigirCodigoLiberado("zz-teste", ["ZZ-TESTE"])), null);
    conferir("codigos liberados: espaco em volta do codigo nao o tira da lista", mensagemDe(() => exigirCodigoLiberado(" ZZ-TESTE ", ["ZZ-TESTE"])), null);
    const recusa = mensagemDe(() => exigirCodigoLiberado("100246", ["ZZ-TESTE"]));
    conferir("codigos liberados: fora da lista lanca 'nao esta na lista de codigos liberados'", casa(recusa, /nao esta na lista de codigos liberados/), true);
    conferir("codigos liberados: a mensagem diz qual codigo foi recusado", String(recusa).includes("100246"), true);
    conferir(
      "codigos liberados: com varios na lista, so passa quem esta nela",
      ["ZZ-A", "zz-b", "ZZ-C"].map((codigo) => mensagemDe(() => exigirCodigoLiberado(codigo, ["ZZ-A", "ZZ-B"])) === null),
      [true, true, false],
    );
    conferir(
      "codigos liberados: codigo vazio ou ausente nao passa quando ha lista",
      [mensagemDe(() => exigirCodigoLiberado("", ["ZZ-TESTE"])) !== null, mensagemDe(() => exigirCodigoLiberado(undefined, ["ZZ-TESTE"])) !== null],
      [true, true],
    );
    // Uma trava de seguranca nao pode se abrir por descuido: sem lista de verdade, falha alto.
    conferir("codigos liberados: sem lista (undefined) lanca em vez de liberar", casa(mensagemDe(() => exigirCodigoLiberado("100246", undefined)), /lista/), true);

    conferir("BLING_ESCRITA_CODIGOS: separado por virgula, aparado, sem vazios", separarLista(" ZZ-A, zz-b ,,ZZ-C ,"), ["ZZ-A", "zz-b", "ZZ-C"]);
    conferir("BLING_ESCRITA_CODIGOS: ausente ou vazio vira lista vazia", [separarLista(""), separarLista(undefined), separarLista("  , ,")], [[], [], []]);
    conferir(
      "config.travas.blingCodigosLiberados e uma lista de textos",
      Array.isArray(config.travas.blingCodigosLiberados) && config.travas.blingCodigosLiberados.every((codigo) => typeof codigo === "string" && codigo.length > 0),
      true,
    );

    // --- Parametros em lista (Emenda 7) ---
    const base = "https://api.bling.com.br/Api/v3";
    conferir("urlDoBling: valor em lista repete a chave, com o [] no nome", urlDoBling("/estoques/saldos", { "codigos[]": ["a", "b"] }), `${base}/estoques/saldos?codigos%5B%5D=a&codigos%5B%5D=b`);
    conferir("urlDoBling: parametro simples como sempre, na ordem (o importador)", urlDoBling("/produtos", { pagina: 2, limite: 100, criterio: 5 }), `${base}/produtos?pagina=2&limite=100&criterio=5`);
    conferir("urlDoBling: zero e valor, vazio/null/undefined nao vao, nem de dentro da lista", urlDoBling("/produtos", { pagina: 0, a: "", b: null, c: undefined, "codigos[]": ["x", "", null, undefined, "y"] }), `${base}/produtos?pagina=0&codigos%5B%5D=x&codigos%5B%5D=y`);
    conferir("urlDoBling: lista vazia nao deixa a chave nem o '?'", urlDoBling("/produtos", { "codigos[]": [] }), `${base}/produtos`);
    conferir("urlDoBling: sem parametros", [urlDoBling("/depositos"), urlDoBling("/depositos", {})], [`${base}/depositos`, `${base}/depositos`]);
    conferir("urlDoBling: lista e valor simples juntos", urlDoBling("/estoques/saldos", { "codigos[]": ["a"], limite: 100 }), `${base}/estoques/saldos?codigos%5B%5D=a&limite=100`);
    conferir("urlDoBling: o codigo com espaco e barra e escapado", urlDoBling("/produtos", { "codigos[]": ["A B/1"] }), `${base}/produtos?codigos%5B%5D=A+B%2F1`);

    // --- O cliente real: contrato e trava de escrita (SEM rede) ---
    const cliente = clienteBling();
    conferir("clienteBling: get, post, put, patch e exigirEscrita, e nada mais", Object.keys(cliente).sort(), ["exigirEscrita", "get", "patch", "post", "put"]);
    conferir(
      "clienteBling liga cada verbo a blingGet, blingPost, blingPut e blingPatch",
      [cliente.get === blingGet, cliente.post === blingPost, cliente.put === blingPut, cliente.patch === blingPatch, typeof cliente.exigirEscrita],
      [true, true, true, true, "function"],
    );
    // So com a trava desligada: com ela ligada no .env estas chamadas sairiam de verdade, e
    // nenhum teste escreve no Bling. A recusa vem de exigirTravaLiberada, antes do token e da rede.
    if (config.travas.blingEscrita === false) {
      conferir("blingPut com a trava desligada rejeita 'Escrita bloqueada', sem rede", casa(await rejeicaoDe(blingPut("/produtos/1", {})), /Escrita bloqueada/), true);
      conferir("blingPost com a trava desligada rejeita 'Escrita bloqueada', sem rede", casa(await rejeicaoDe(blingPost("/produtos", { nome: "x" })), /Escrita bloqueada/), true);
      conferir("blingPatch com a trava desligada rejeita 'Escrita bloqueada', sem rede", casa(await rejeicaoDe(blingPatch("/produtos/1", { nome: "x" })), /Escrita bloqueada/), true);
      conferir("cliente.put, post e patch passam pela mesma trava", [
        casa(await rejeicaoDe(cliente.put("/contatos/1", {})), /Escrita bloqueada/),
        casa(await rejeicaoDe(cliente.post("/estoques", {})), /Escrita bloqueada/),
        casa(await rejeicaoDe(cliente.patch("/produtos/1", {})), /Escrita bloqueada/),
      ], [true, true, true]);
      conferir("cliente.exigirEscrita com a trava desligada lanca, qualquer que seja o codigo", casa(mensagemDe(() => cliente.exigirEscrita("100246")), /Escrita bloqueada/), true);
    } else {
      console.log("AVISO: BLING_ESCRITA esta ligada no .env, entao o teste da trava de escrita do cliente real foi PULADO (nenhuma escrita e tentada).");
    }

    // --- O Bling falso: o contrato do cliente ---
    const umProduto = (extra = {}) => ({
      id: 111,
      codigo: "ZZ-F-1",
      nome: "Motor falso",
      preco: 80,
      descricaoCurta: "<p>x</p>",
      dimensoes: { largura: 4, altura: 3, profundidade: 9, unidadeMedida: 1 },
      estoque: { minimo: 1, maximo: 5, localizacao: "A1" },
      tributacao: { origem: 0, ncm: "85011019" },
      ...extra,
    });
    const umFornecedorDoBling = (extra = {}) => ({ id: 8001, nome: "Fornecedor Com Documento", numeroDocumento: "12345678000195", tiposContato: [{ descricao: "Fornecedor" }], ...extra });
    const id = (resposta) => resposta.dados.data.id;

    {
      const falso = criarBlingFalso();
      conferir(
        "falso: tem o mesmo contrato do cliente (4 verbos e exigirEscrita) e a lista de chamadas",
        [...Object.keys(cliente)].every((chave) => typeof falso[chave] === "function") && Array.isArray(falso.chamadas),
        true,
      );
      const ler = await falso.get("/depositos");
      conferir("falso: responde no formato do requisitar", [ler.ok, ler.status, typeof ler.duracaoMs, Array.isArray(ler.dados.data)], [true, 200, "number", true]);
    }

    // --- Falso: produtos ---
    {
      const falso = criarBlingFalso({
        produtos: [
          umProduto(),
          umProduto({ id: 112, codigo: "ZZ-F-2", nome: "Outro motor" }),
          umProduto({ id: 113, codigo: "ZZ-F-3", nome: "Motor inativo", situacao: "I" }),
          umProduto({ id: 114, codigo: "ZZ-F-DUP", nome: "Duplicado A" }),
          umProduto({ id: 115, codigo: "zz-f-dup", nome: "Duplicado B" }),
        ],
        saldos: { "ZZ-F-1": 10 },
      });

      const porCaminho = await falso.get("/produtos?codigos[]=ZZ-F-1");
      conferir(
        "falso: GET /produtos?codigos[]= devolve o produto cadastrado por codigo",
        [porCaminho.ok, porCaminho.status, porCaminho.dados.data.map((p) => [p.id, p.codigo, p.nome, p.preco])],
        [true, 200, [[111, "ZZ-F-1", "Motor falso", 80]]],
      );
      conferir("falso: a listagem traz so as chaves da listagem do Bling (sem dimensoes) e o saldo", [
        "dimensoes" in porCaminho.dados.data[0],
        "tributacao" in porCaminho.dados.data[0],
        porCaminho.dados.data[0].estoque,
        porCaminho.dados.data[0].situacao,
      ], [false, false, { saldoVirtualTotal: 10 }, "A"]);
      const porParametro = await falso.get("/produtos", { "codigos[]": ["ZZ-F-1", "ZZ-F-2"] });
      conferir("falso: a mesma busca com a lista em params (a chave repetida)", porParametro.dados.data.map((p) => p.codigo), ["ZZ-F-1", "ZZ-F-2"]);
      const emCaminhoEParams = await falso.get("/produtos?codigos[]=ZZ-F-1", { "codigos[]": ["ZZ-F-2"] });
      conferir("falso: a consulta pode vir metade no caminho e metade em params", emCaminhoEParams.dados.data.map((p) => p.codigo), ["ZZ-F-1", "ZZ-F-2"]);
      const codificado = await falso.get("/produtos?codigos%5B%5D=ZZ-F-1");
      conferir("falso: o [] escapado (como o cliente real o manda) vale igual", codificado.dados.data.map((p) => p.codigo), ["ZZ-F-1"]);
      conferir("falso: codigo sem produto da data vazio, com ok", [(await falso.get("/produtos?codigos[]=NADA")).ok, (await falso.get("/produtos?codigos[]=NADA")).dados.data], [true, []]);
      conferir("falso: o codigo casa sem diferenciar caixa e devolve o codigo como o Bling o guarda", (await falso.get("/produtos?codigos[]=zz-f-1")).dados.data.map((p) => p.codigo), ["ZZ-F-1"]);
      conferir("falso: produto inativo nao aparece na busca por codigo (o criterio padrao e so ativos)", (await falso.get("/produtos?codigos[]=ZZ-F-3")).dados.data, []);
      conferir("falso: dois produtos com o mesmo codigo voltam os dois (o Bling nao impede)", (await falso.get("/produtos?codigos[]=ZZ-F-DUP")).dados.data.map((p) => p.id), [114, 115]);

      const completo = (await falso.get("/produtos/111")).dados.data;
      conferir("falso: GET /produtos/{id} traz o produto inteiro, com os grupos e o saldo no estoque", [
        completo.id, completo.dimensoes, completo.estoque, completo.tributacao, completo.tipo, completo.formato,
      ], [111, { largura: 4, altura: 3, profundidade: 9, unidadeMedida: 1 }, { minimo: 1, maximo: 5, localizacao: "A1", saldoVirtualTotal: 10 }, { origem: 0, ncm: "85011019" }, "P", "S"]);
      // Medido no Bling real em 04/10/2026 (um GET so de leitura, Step 0 da Tarefa 7): id que nao
      // existe da 404 com este corpo, e NAO 200 com `data: []` (esse e o formato de /estoques/saldos).
      const inexistente = await falso.get("/produtos/999999");
      conferir("falso: GET /produtos/{id} de id que nao existe da 404 RESOURCE_NOT_FOUND, como o Bling real", [inexistente.ok, inexistente.status, inexistente.dados], [
        false,
        404,
        {
          error: {
            type: "RESOURCE_NOT_FOUND",
            message: "Não encontrado.",
            description: "O recurso requisitado não foi encontrado. Verifique se o endpoint solicitado está correto ou se o ID informado realmente existe no sistema.",
          },
        },
      ]);

      // O que o chamador recebe e uma copia: mexer nela nao pode mudar o Bling falso.
      completo.nome = "Mudei fora";
      completo.dimensoes.altura = 999;
      const relido = (await falso.get("/produtos/111")).dados.data;
      conferir("falso: a resposta e uma copia (mudar o que veio nao muda o falso)", [relido.nome, relido.dimensoes.altura], ["Motor falso", 3]);
    }

    // --- Falso: PATCH (so os campos informados; cada grupo informado e SUBSTITUIDO) ---
    {
      const falso = criarBlingFalso({ produtos: [umProduto(), umProduto({ id: 112, codigo: "ZZ-F-2" })], saldos: { "ZZ-F-1": 10 } });
      falso.exigirEscrita("ZZ-F-1");
      const patch = await falso.patch("/produtos/111", { preco: 95, dimensoes: { altura: 7 }, estoque: { localizacao: "B2", saldoVirtualTotal: 999 } });
      conferir("falso: PATCH responde 200", [patch.ok, patch.status], [true, 200]);
      const depois = (await falso.get("/produtos/111")).dados.data;
      conferir("falso: PATCH muda so o campo informado da raiz", [depois.preco, depois.nome, depois.descricaoCurta, depois.codigo], [95, "Motor falso", "<p>x</p>", "ZZ-F-1"]);
      // Nao esta confirmado na API que o Bling real substitui o grupo (a Tarefa 12 mede isso no
      // produto de teste); o falso assume que sim, o pior caso para quem envia so parte do grupo.
      conferir("falso: PATCH substitui o grupo informado por inteiro (dimensoes ficou so com a altura)", depois.dimensoes, { altura: 7 });
      conferir("falso: PATCH no estoque troca o grupo e nao mexe no saldo, que e somente-leitura", [depois.estoque, falso.saldo("ZZ-F-1")], [{ localizacao: "B2", saldoVirtualTotal: 10 }, 10]);
      conferir("falso: grupo que nao veio no PATCH fica como estava", depois.tributacao, { origem: 0, ncm: "85011019" });
      conferir("falso: o outro produto nao foi tocado", (await falso.get("/produtos/112")).dados.data.preco, 80);
      await falso.patch("/produtos/111", { id: 5, fornecedor: { id: 1 }, imagemURL: "x" });
      const somenteLeitura = (await falso.get("/produtos/111")).dados.data;
      conferir("falso: PATCH nao troca o id nem grava fornecedor e imagemURL (somente-leitura)", [somenteLeitura.id, "fornecedor" in somenteLeitura, "imagemURL" in somenteLeitura], [111, false, false]);
      const naoHa = await falso.patch("/produtos/999999", { preco: 1 });
      conferir("falso: PATCH em id que nao existe da 404", [naoHa.ok, naoHa.status, naoHa.dados.error.type], [false, 404, "RESOURCE_NOT_FOUND"]);
    }

    // --- Falso: POST /produtos ---
    {
      const falso = criarBlingFalso();
      falso.exigirEscrita("ZZ-F-9");
      const criado = await falso.post("/produtos", { nome: "Novo", codigo: "ZZ-F-9", tipo: "P", formato: "S", situacao: "A", preco: 10, estoque: { minimo: 2, saldoVirtualTotal: 77 } });
      conferir("falso: POST /produtos devolve 201 e data.id", [criado.ok, criado.status, typeof id(criado)], [true, 201, "number"]);
      const achados = (await falso.get("/produtos?codigos[]=ZZ-F-9")).dados.data;
      conferir("falso: o produto criado passa a ser achado pelo codigo, com o mesmo id", achados.map((p) => [p.id, p.nome, p.preco]), [[id(criado), "Novo", 10]]);
      conferir("falso: o saldo nao entra pelo POST (somente-leitura): nasce em 0", [falso.saldo("ZZ-F-9"), (await falso.get(`/produtos/${id(criado)}`)).dados.data.estoque], [0, { minimo: 2, saldoVirtualTotal: 0 }]);
      const outro = await falso.post("/produtos", { nome: "Outro", codigo: "ZZ-F-10", tipo: "P", formato: "S", situacao: "A" });
      conferir("falso: cada produto criado tem um id novo", id(outro) !== id(criado), true);
      const semNome = await falso.post("/produtos", { codigo: "ZZ-F-11", tipo: "P", formato: "S", situacao: "A" });
      conferir(
        "falso: POST sem nome da 400 VALIDATION_ERROR e aponta o campo",
        [semNome.ok, semNome.status, semNome.dados.error.type, semNome.dados.error.fields.map((f) => f.element)],
        [false, 400, "VALIDATION_ERROR", ["nome"]],
      );
      conferir("falso: o POST recusado nao criou nada", (await falso.get("/produtos?codigos[]=ZZ-F-11")).dados.data, []);
    }

    // --- Falso: fornecedores do produto ---
    {
      const falso = criarBlingFalso({ produtos: [umProduto()], contatos: [umFornecedorDoBling()] });
      falso.exigirEscrita("ZZ-F-1");
      conferir("falso: produto sem vinculo de fornecedor tem data vazio", (await falso.get("/produtos/fornecedores", { idProduto: 111 })).dados.data, []);
      const vinculo = await falso.post("/produtos/fornecedores", { descricao: "https://exemplo.com/a", codigo: "F1", precoCusto: 5.9, padrao: true, produto: { id: 111 }, fornecedor: { id: 8001 } });
      conferir("falso: POST /produtos/fornecedores devolve 201 e data.id", [vinculo.ok, vinculo.status, typeof id(vinculo)], [true, 201, "number"]);
      const lista = (await falso.get("/produtos/fornecedores?idProduto=111")).dados.data;
      conferir(
        "falso: o vinculo volta no formato do relatorio (idProduto no caminho)",
        lista.map((v) => [v.id, v.descricao, v.codigo, v.precoCusto, v.padrao, v.produto.id, v.fornecedor.id]),
        [[id(vinculo), "https://exemplo.com/a", "F1", 5.9, true, 111, 8001]],
      );
      conferir("falso: e tambem com idProduto em params (numero ou texto)", [
        (await falso.get("/produtos/fornecedores", { idProduto: "111" })).dados.data.length,
        (await falso.get("/produtos/fornecedores", { idProduto: 222 })).dados.data.length,
      ], [1, 0]);

      const atualizado = await falso.put(`/produtos/fornecedores/${id(vinculo)}`, { descricao: "https://exemplo.com/b", codigo: "F2", precoCusto: 7, padrao: true, produto: { id: 111 }, fornecedor: { id: 8001 } });
      conferir("falso: PUT /produtos/fornecedores/{id} responde 200", [atualizado.ok, atualizado.status], [true, 200]);
      const depois = (await falso.get("/produtos/fornecedores", { idProduto: 111 })).dados.data;
      conferir("falso: o PUT atualiza o MESMO vinculo (nao cria outro)", depois.map((v) => [v.id, v.codigo, v.precoCusto, v.descricao]), [[id(vinculo), "F2", 7, "https://exemplo.com/b"]]);

      const semFornecedor = await falso.post("/produtos/fornecedores", { produto: { id: 111 } });
      conferir("falso: POST de vinculo sem fornecedor.id da 400", [semFornecedor.ok, semFornecedor.status, semFornecedor.dados.error.type], [false, 400, "VALIDATION_ERROR"]);
      const contatoInexistente = await falso.post("/produtos/fornecedores", { produto: { id: 111 }, fornecedor: { id: 424242 } });
      conferir("falso: POST de vinculo com um contato que nao existe da 400", [contatoInexistente.ok, contatoInexistente.status], [false, 400]);
      const produtoInexistente = await falso.post("/produtos/fornecedores", { produto: { id: 999999 }, fornecedor: { id: 8001 } });
      conferir("falso: POST de vinculo de um produto que nao existe da 400", [produtoInexistente.ok, produtoInexistente.status], [false, 400]);
      const putSemProduto = await falso.put(`/produtos/fornecedores/${id(vinculo)}`, { codigo: "F3" });
      conferir("falso: PUT de vinculo sem produto.id da 400 (e o unico obrigatorio da documentacao)", [putSemProduto.ok, putSemProduto.status], [false, 400]);
      conferir("falso: PUT em vinculo que nao existe da 404", (await falso.put("/produtos/fornecedores/999999", { produto: { id: 111 } })).status, 404);
      const comVinculoPronto = criarBlingFalso({
        produtos: [umProduto()],
        contatos: [umFornecedorDoBling()],
        vinculos: [{ id: 9001, descricao: "d", codigo: "C", precoCusto: 3, padrao: true, produto: { id: 111 }, fornecedor: { id: 8001 } }],
      });
      conferir("falso: a opcao vinculos ja nasce com o vinculo", (await comVinculoPronto.get("/produtos/fornecedores", { idProduto: 111 })).dados.data.map((v) => [v.id, v.codigo]), [[9001, "C"]]);
    }

    // --- Falso: contatos ---
    {
      const falso = criarBlingFalso({
        contatos: [
          umFornecedorDoBling(),
          { id: 8002, nome: "Eletrônica São João", tiposContato: [{ descricao: "Fornecedor" }] },
          { id: 8003, nome: "Eletronica Sao Joao", tiposContato: [{ descricao: "Cliente" }] },
        ],
      });
      falso.exigirEscrita("ZZ-F-1");
      const idFornecedor = falso.idDoTipoDeContato("Fornecedor");

      conferir("falso: GET /contatos?numeroDocumento= acha pelos 14 digitos", (await falso.get("/contatos?numeroDocumento=12345678000195")).dados.data.map((c) => c.id), [8001]);
      conferir("falso: o mesmo em params", (await falso.get("/contatos", { numeroDocumento: "12345678000195" })).dados.data.map((c) => c.id), [8001]);
      conferir("falso: com a pontuacao do CNPJ NAO acha (o Bling guarda so os digitos)", (await falso.get("/contatos", { numeroDocumento: "12.345.678/0001-95" })).dados.data, []);
      conferir("falso: documento que ninguem tem da lista vazia", (await falso.get("/contatos?numeroDocumento=99999999999999")).dados.data, []);
      conferir("falso: numeroDocumento vazio nao filtra (o cliente real nem manda o parametro)", (await falso.get("/contatos", { numeroDocumento: "" })).dados.data.length, 3);
      conferir(
        "falso: pesquisa= acha pelo nome sem diferenciar caixa e acento (e por parte do nome)",
        [(await falso.get("/contatos", { pesquisa: "eletronica sao joao" })).dados.data.map((c) => c.id), (await falso.get("/contatos?pesquisa=JOAO")).dados.data.map((c) => c.id), (await falso.get("/contatos", { pesquisa: "com documento" })).dados.data.map((c) => c.id)],
        [[8002, 8003], [8002, 8003], [8001]],
      );
      conferir("falso: a listagem de contatos NAO traz tiposContato (so o GET por id traz)", Object.keys((await falso.get("/contatos", { pesquisa: "joao" })).dados.data[0]).sort(), ["celular", "codigo", "id", "nome", "numeroDocumento", "situacao", "telefone"]);
      conferir("falso: idTipoContato filtra pelo tipo", (await falso.get("/contatos", { pesquisa: "joao", idTipoContato: idFornecedor })).dados.data.map((c) => c.id), [8002]);

      const porId = (await falso.get("/contatos/8002")).dados.data;
      conferir("falso: GET /contatos/{id} traz tiposContato com id e descricao", [porId.id, porId.tiposContato], [8002, [{ id: idFornecedor, descricao: "Fornecedor" }]]);
      const tipos = (await falso.get("/contatos/tipos")).dados.data;
      conferir("falso: GET /contatos/tipos traz os 7 tipos da conta, cada um com id e descricao", [tipos.length, tipos.map((t) => t.descricao).includes("Fornecedor"), new Set(tipos.map((t) => t.id)).size, tipos.every((t) => typeof t.id === "number")], [7, true, 7, true]);
      const semContato = await falso.get("/contatos/999999");
      conferir("falso: GET /contatos/{id} de id que nao existe da 404", [semContato.ok, semContato.status], [false, 404]);
      conferir("falso: idDoTipoDeContato de um tipo que nao existe lanca", casa(mensagemDe(() => falso.idDoTipoDeContato("Inventado")), /Inventado/), true);

      const novo = await falso.post("/contatos", { nome: "Fornecedor Novo", situacao: "A", tipo: "J", numeroDocumento: "11222333000181", tiposContato: [{ id: idFornecedor }] });
      conferir("falso: POST /contatos devolve 201 e data.id", [novo.ok, novo.status, typeof id(novo)], [true, 201, "number"]);
      conferir("falso: o contato criado e achado pelo documento e traz o tipo Fornecedor", [
        (await falso.get("/contatos", { numeroDocumento: "11222333000181" })).dados.data.map((c) => c.id),
        (await falso.get(`/contatos/${id(novo)}`)).dados.data.tiposContato,
      ], [[id(novo)], [{ id: idFornecedor, descricao: "Fornecedor" }]]);
      const tipoFixo = await falso.post("/contatos", { nome: "Com id fixo", situacao: "A", tipo: "J", tiposContato: [{ id: 999 }] });
      conferir("falso: POST com tipo de contato de id que a conta nao tem da 400 (o id nunca e fixo)", [tipoFixo.ok, tipoFixo.status, tipoFixo.dados.error.type], [false, 400, "VALIDATION_ERROR"]);
      const semNome = await falso.post("/contatos", { situacao: "A", tipo: "J" });
      conferir("falso: POST de contato sem nome da 400", [semNome.ok, semNome.status, semNome.dados.error.fields.map((f) => f.element)], [false, 400, ["nome"]]);

      const renomeado = await falso.put("/contatos/8001", { nome: "Renomeado" });
      conferir("falso: PUT /contatos/{id} atualiza o contato", [renomeado.ok, renomeado.status, (await falso.get("/contatos/8001")).dados.data.nome], [true, 200, "Renomeado"]);
      const putContato = await falso.put("/contatos/8003", { numeroDocumento: "11111111000191" });
      conferir("falso: PUT /contatos/{id} grava o documento e a busca o acha", [putContato.status, (await falso.get("/contatos", { numeroDocumento: "11111111000191" })).dados.data.map((c) => c.id)], [200, [8003]]);
      conferir("falso: PUT em contato que nao existe da 404", (await falso.put("/contatos/999999", { nome: "x" })).status, 404);
      const tiposProprios = criarBlingFalso({ tiposDeContato: [{ id: 5, descricao: "Fornecedor" }, { id: 6, descricao: "Cliente" }], contatos: [{ id: 1, nome: "A", tiposContato: [{ descricao: "Cliente" }] }] });
      conferir("falso: tiposDeContato proprios valem, e o contato resolve o tipo pela descricao", [(await tiposProprios.get("/contatos/tipos")).dados.data, (await tiposProprios.get("/contatos/1")).dados.data.tiposContato], [[{ id: 5, descricao: "Fornecedor" }, { id: 6, descricao: "Cliente" }], [{ id: 6, descricao: "Cliente" }]]);
    }

    // --- Falso: depositos ---
    {
      const padrao = (await criarBlingFalso().get("/depositos")).dados.data;
      conferir("falso: os depositos da conta (Fisico padrao e Virtual) e exatamente um padrao", [padrao.map((d) => [d.descricao, d.padrao, d.desconsiderarSaldo]), padrao.filter((d) => d.padrao).length], [[["Fisico", true, false], ["Virtual", false, true]], 1]);
      conferir("falso: cada deposito tem id e situacao 1 (ativo)", padrao.every((d) => typeof d.id === "number" && d.situacao === 1), true);
      const proprios = [{ id: 1, descricao: "A", situacao: 1, padrao: false, desconsiderarSaldo: false }, { id: 2, descricao: "B", situacao: 1, padrao: false, desconsiderarSaldo: false }];
      conferir("falso: depositos proprios valem (dois sem padrao)", (await criarBlingFalso({ depositos: proprios }).get("/depositos")).dados.data.map((d) => [d.id, d.padrao]), [[1, false], [2, false]]);
    }

    // --- Falso: saldos e lancamentos de estoque ---
    {
      const falso = criarBlingFalso({
        produtos: [umProduto(), umProduto({ id: 112, codigo: "ZZ-F-2" }), umProduto({ id: 113, codigo: "ZZ-F-3", situacao: "I" })],
        saldos: { "ZZ-F-1": 10, "ZZ-F-2": { virtual: -8, fisico: 0 }, "ZZ-F-3": 4 },
      });
      falso.exigirEscrita("ZZ-F-1");
      const lido = await falso.get("/estoques/saldos", { "codigos[]": ["ZZ-F-1", "ZZ-F-2", "ZZ-F-INEXISTENTE"] });
      conferir(
        "falso: GET /estoques/saldos?codigos[]= devolve produto, saldos e depositos; codigo que nao existe e ignorado",
        [lido.ok, lido.status, lido.dados.data.map((s) => [s.produto.id, s.produto.codigo, s.saldoFisicoTotal, s.saldoVirtualTotal])],
        [true, 200, [[111, "ZZ-F-1", 10, 10], [112, "ZZ-F-2", 0, -8]]],
      );
      conferir("falso: cada saldo traz os depositos com id, fisico e virtual", Object.keys(lido.dados.data[0].depositos[0]).sort(), ["id", "saldoFisico", "saldoVirtual"]);
      conferir("falso: saldo negativo (virtual, com reservas) volta negativo", lido.dados.data[1].saldoVirtualTotal, -8);
      conferir("falso: a busca por saldo tambem aceita a consulta no caminho, com o [] escapado", (await falso.get("/estoques/saldos?codigos%5B%5D=ZZ-F-1&codigos%5B%5D=ZZ-F-2")).dados.data.map((s) => s.produto.codigo), ["ZZ-F-1", "ZZ-F-2"]);
      conferir("falso: o saldo casa o codigo sem diferenciar caixa e devolve o codigo como o Bling o guarda", (await falso.get("/estoques/saldos", { "codigos[]": ["zz-f-1"] })).dados.data.map((s) => s.produto.codigo), ["ZZ-F-1"]);

      const nenhum = await falso.get("/estoques/saldos", { "codigos[]": ["NADA", "NEM-ISSO"] });
      conferir(
        "falso: lote em que NENHUM codigo resolve da HTTP 400 VALIDATION_ERROR (nao lista vazia)",
        [nenhum.ok, nenhum.status, nenhum.dados.error.type, typeof nenhum.dados.error.message, typeof nenhum.dados.error.description],
        [false, 400, "VALIDATION_ERROR", "string", "string"],
      );
      conferir("falso: produto inativo nao resolve por codigos[] (cai no 400)", (await falso.get("/estoques/saldos", { "codigos[]": ["ZZ-F-3"] })).status, 400);
      conferir("falso: idsProdutos[] resolve o inativo", (await falso.get("/estoques/saldos", { "idsProdutos[]": [113] })).dados.data.map((s) => [s.produto.codigo, s.saldoVirtualTotal]), [["ZZ-F-3", 4]]);
      const idInexistente = await falso.get("/estoques/saldos", { "idsProdutos[]": [999999] });
      conferir("falso: idsProdutos[] de id que nao existe da data vazio (200)", [idInexistente.ok, idInexistente.dados.data], [true, []]);
      conferir("falso: saldos sem codigos[] nem idsProdutos[] da 400", (await falso.get("/estoques/saldos")).status, 400);

      // O limite real e o tamanho da URL (6 mil passa, 9 mil da 414): o falso recusa passando de 8 mil.
      const curtos = Array.from({ length: 100 }, (_, i) => `ZZ-${String(i).padStart(3, "0")}`);
      conferir("falso: um lote de 100 codigos cabe na URL", (await falso.get("/estoques/saldos", { "codigos[]": curtos })).status !== 414, true);
      const longos = Array.from({ length: 300 }, (_, i) => `ZZ-CODIGO-COMPRIDO-${String(i).padStart(4, "0")}`);
      const tooLong = await falso.get("/estoques/saldos", { "codigos[]": longos });
      conferir("falso: URL longa demais da 414, como o Bling", [tooLong.ok, tooLong.status], [false, 414]);

      // POST /estoques: E soma, S tira, B define, no saldo virtual do produto.
      const deposito = (await falso.get("/depositos")).dados.data.find((d) => d.padrao).id;
      const lancar = (corpo) => falso.post("/estoques", { produto: { id: 111 }, deposito: { id: deposito }, ...corpo });
      const entrada = await lancar({ operacao: "E", quantidade: 3 });
      conferir("falso: POST /estoques devolve 201 e data.id do lancamento", [entrada.ok, entrada.status, typeof id(entrada)], [true, 201, "number"]);
      conferir("falso: a entrada soma ao saldo (10 + 3)", falso.saldo("ZZ-F-1"), 13);
      await lancar({ operacao: "S", quantidade: 1 });
      conferir("falso: a saida tira do saldo (13 - 1)", falso.saldo("ZZ-F-1"), 12);
      await lancar({ operacao: "B", quantidade: 5 });
      conferir("falso: o balanco define o saldo (5)", falso.saldo("ZZ-F-1"), 5);
      conferir("falso: o saldo novo aparece no GET de saldos (fisico e virtual andam juntos) e no produto", [
        (await falso.get("/estoques/saldos", { "codigos[]": ["ZZ-F-1"] })).dados.data.map((s) => [s.saldoFisicoTotal, s.saldoVirtualTotal]),
        (await falso.get("/produtos/111")).dados.data.estoque.saldoVirtualTotal,
        (await falso.get("/produtos", { "codigos[]": ["ZZ-F-1"] })).dados.data[0].estoque.saldoVirtualTotal,
      ], [[[5, 5]], 5, 5]);
      await lancar({ operacao: "S", quantidade: 20 });
      conferir("falso: o virtual pode ficar negativo (reservas): saida maior que o saldo e aceita", falso.saldo("ZZ-F-1"), -15);
      await lancar({ operacao: "B", quantidade: 0 });
      conferir("falso: balanco 0 zera", falso.saldo("ZZ-F-1"), 0);
      conferir("falso: o falso guarda os lancamentos, na ordem", falso.estado.lancamentos.map((l) => [l.operacao, l.quantidade]), [["E", 3], ["S", 1], ["B", 5], ["S", 20], ["B", 0]]);
      conferir("falso: a observacao e o resto do corpo vao junto", (await lancar({ operacao: "E", quantidade: 1, observacoes: "ajuste do Rise" })).status === 201 && falso.estado.lancamentos.at(-1).observacoes === "ajuste do Rise", true);
      conferir("falso: lancamento em um produto muda so o saldo dele", falso.saldo("ZZ-F-2"), -8);

      const invalidos = [
        ["operacao desconhecida", { operacao: "X", quantidade: 1 }],
        ["sem operacao", { quantidade: 1 }],
        ["sem quantidade", { operacao: "E" }],
        ["quantidade negativa", { operacao: "E", quantidade: -1 }],
        ["quantidade que nao e numero", { operacao: "E", quantidade: "abc" }],
        ["produto que nao existe", { operacao: "E", quantidade: 1, produto: { id: 999999 } }],
        ["deposito que nao existe", { operacao: "E", quantidade: 1, deposito: { id: 999999 } }],
      ];
      const antes = falso.estado.lancamentos.length;
      const respostas = [];
      for (const [, extra] of invalidos) respostas.push(await lancar(extra));
      conferir("falso: lancamento invalido da 400 VALIDATION_ERROR", respostas.map((r) => [r.ok, r.status, r.dados.error.type]), invalidos.map(() => [false, 400, "VALIDATION_ERROR"]));
      conferir("falso: o lancamento recusado nao mexe no saldo nem entra na lista", [falso.saldo("ZZ-F-1"), falso.estado.lancamentos.length], [1, antes]);
    }

    // --- Falso: o balanco define o saldo FISICO do deposito; o virtual e a contagem menos as reservas ---
    // Investigacao da Tarefa 1, §4.3 e B5: "um balanco de 12 deixa o fisico em 12 e o virtual em
    // 12 - reservas". As reservas (fisico - virtual) ficam constantes. Entrada e saida mexem nos
    // dois saldos do mesmo tanto.
    {
      const falso = criarBlingFalso({
        produtos: [umProduto({ id: 211, codigo: "ZZ-F-R1" }), umProduto({ id: 212, codigo: "ZZ-F-R2" }), umProduto({ id: 213, codigo: "ZZ-F-R3" })],
        // R1 = o 100114 do relatorio (fisico 0, virtual -8: reserva 8); R2 = o 100246 (fisico 56,
        // virtual 29: reserva 27); R3 = sem reserva (um numero so: virtual igual ao fisico).
        saldos: { "ZZ-F-R1": { virtual: -8, fisico: 0 }, "ZZ-F-R2": { virtual: 29, fisico: 56 }, "ZZ-F-R3": 10 },
      });
      falso.exigirEscrita("ZZ-F-R1");
      const deposito = (await falso.get("/depositos")).dados.data.find((d) => d.padrao).id;
      const lancar = (produtoId, operacao, quantidade) => falso.post("/estoques", { produto: { id: produtoId }, deposito: { id: deposito }, operacao, quantidade });
      // [fisico, virtual] pelo GET de saldos, e os dois do deposito conferidos junto.
      const saldos = async (codigo) => {
        const item = (await falso.get("/estoques/saldos", { "codigos[]": [codigo] })).dados.data[0];
        const noDeposito = item.depositos[0];
        return [item.saldoFisicoTotal, item.saldoVirtualTotal, noDeposito.saldoFisico === item.saldoFisicoTotal && noDeposito.saldoVirtual === item.saldoVirtualTotal];
      };

      conferir("balanco com reserva: ponto de partida do 100114 (fisico 0, virtual -8)", await saldos("ZZ-F-R1"), [0, -8, true]);
      await lancar(211, "B", 5);
      conferir("balanco 5 no 100114: o FISICO vira 5 e o virtual -3 (5 - 8 de reservas), nao 5", await saldos("ZZ-F-R1"), [5, -3, true]);
      conferir("balanco: falso.saldo() e o virtual (-3)", falso.saldo("ZZ-F-R1"), -3);
      conferir("balanco: o virtual tambem sai no produto (GET /produtos/{id})", (await falso.get("/produtos/211")).dados.data.estoque.saldoVirtualTotal, -3);

      conferir("balanco com reserva: ponto de partida do 100246 (fisico 56, virtual 29)", await saldos("ZZ-F-R2"), [56, 29, true]);
      await lancar(212, "E", 3);
      conferir("entrada com reserva soma nos dois (56 + 3, 29 + 3)", await saldos("ZZ-F-R2"), [59, 32, true]);
      await lancar(212, "S", 1);
      conferir("saida com reserva tira dos dois (59 - 1, 32 - 1)", await saldos("ZZ-F-R2"), [58, 31, true]);
      await lancar(212, "B", 40);
      conferir("balanco 40 no 100246: fisico 40 e virtual 13 (40 - 27 de reservas)", await saldos("ZZ-F-R2"), [40, 13, true]);
      await lancar(212, "B", 0);
      conferir("balanco 0 com reserva: fisico 0 e virtual -27 (zerar a contagem nao apaga as reservas)", await saldos("ZZ-F-R2"), [0, -27, true]);
      await lancar(212, "E", 30);
      conferir("e uma entrada depois dele segue a mesma reserva (0 + 30, -27 + 30)", await saldos("ZZ-F-R2"), [30, 3, true]);

      await lancar(211, "E", 2);
      await lancar(211, "S", 10);
      conferir("100114: entrada 2 e saida 10 depois do balanco (5 -> 7 -> -3 de fisico; -3 -> -1 -> -11 de virtual)", await saldos("ZZ-F-R1"), [-3, -11, true]);

      await lancar(213, "B", 7);
      conferir("sem reserva (fisico igual ao virtual) o balanco define os dois", await saldos("ZZ-F-R3"), [7, 7, true]);
      await lancar(213, "E", 2);
      await lancar(213, "S", 4);
      conferir("sem reserva: entrada e saida mantem os dois iguais", await saldos("ZZ-F-R3"), [5, 5, true]);
    }

    // --- Falso: falhas simuladas ---
    {
      const falso = criarBlingFalso({
        produtos: [umProduto(), umProduto({ id: 112, codigo: "ZZ-F-2" })],
        falhas: [{ metodo: "PATCH", caminho: "/produtos/111", status: 400, mensagem: "Preco invalido" }],
      });
      falso.exigirEscrita("ZZ-F-1");
      const falhou = await falso.patch("/produtos/111", { preco: 1 });
      conferir("falha: devolve ok false, o status e a mensagem em error.description", [falhou.ok, falhou.status, falhou.dados], [false, 400, { error: { description: "Preco invalido" } }]);
      conferir("falha: a chamada que falhou nao muda nada", (await falso.get("/produtos/111")).dados.data.preco, 80);
      conferir("falha: outro metodo no mesmo caminho nao falha (GET acima)", (await falso.get("/produtos/111")).ok, true);
      conferir("falha: outro caminho nao falha", (await falso.patch("/produtos/112", { preco: 5 })).ok, true);
      conferir("falha: a chamada que falhou fica registrada em chamadas", falso.chamadas.map((c) => `${c.metodo} ${c.caminho}`).slice(0, 3), ["exigirEscrita ZZ-F-1", "PATCH /produtos/111", "GET /produtos/111"]);

      const porPrefixo = criarBlingFalso({
        produtos: [umProduto()],
        falhas: [{ metodo: "post", caminho: "/estoques", status: 500, mensagem: "Falha do Bling" }],
      });
      porPrefixo.exigirEscrita("ZZ-F-1");
      const deposito = (await porPrefixo.get("/depositos")).dados.data.find((d) => d.padrao).id;
      const post = await porPrefixo.post("/estoques", { produto: { id: 111 }, deposito: { id: deposito }, operacao: "E", quantidade: 1 });
      conferir("falha: casa por prefixo do caminho e por metodo sem diferenciar caixa", [post.ok, post.status, post.dados.error.description], [false, 500, "Falha do Bling"]);
      conferir("falha: o GET de /estoques/saldos nao e do metodo da falha", (await porPrefixo.get("/estoques/saldos", { "codigos[]": ["ZZ-F-1"] })).ok, true);

      // Os envios de estoque falham no segundo lancamento: depois=1 deixa passar o primeiro, vezes=1 so falha uma vez.
      const noSegundo = criarBlingFalso({
        produtos: [umProduto()],
        saldos: { "ZZ-F-1": 0 },
        falhas: [{ metodo: "POST", caminho: "/estoques", status: 400, mensagem: "Saldo insuficiente", depois: 1, vezes: 1 }],
      });
      noSegundo.exigirEscrita("ZZ-F-1");
      const idDoDeposito = (await noSegundo.get("/depositos")).dados.data.find((d) => d.padrao).id;
      const lancamento = (quantidade) => noSegundo.post("/estoques", { produto: { id: 111 }, deposito: { id: idDoDeposito }, operacao: "E", quantidade });
      const tres = [await lancamento(1), await lancamento(1), await lancamento(1)];
      conferir("falha: depois=1 e vezes=1 falha so a segunda chamada", tres.map((r) => r.ok), [true, false, true]);
      conferir("falha: a que falhou nao somou (so as outras duas)", noSegundo.saldo("ZZ-F-1"), 2);
      const sempre = criarBlingFalso({ falhas: [{ metodo: "GET", caminho: "/depositos", status: 429, mensagem: "Muitas chamadas" }] });
      conferir("falha: sem vezes falha todas as chamadas", [(await sempre.get("/depositos")).status, (await sempre.get("/depositos")).status], [429, 429]);
      conferir("falha: sem status vira 400, sem mensagem tem um texto", (await criarBlingFalso({ falhas: [{ metodo: "GET", caminho: "/depositos" }] }).get("/depositos")).dados.error.description.length > 0, true);
    }

    // --- Falso: registro das chamadas, exigirEscrita e o que nao e suportado ---
    {
      const falso = criarBlingFalso({ produtos: [umProduto()] });
      const corpo = { preco: 95, dimensoes: { altura: 7 } };
      await falso.get("/produtos", { "codigos[]": ["ZZ-F-1"] });
      falso.exigirEscrita("ZZ-F-1");
      await falso.patch("/produtos/111", corpo);
      await falso.get("/depositos");
      // exigirEscrita entra em `chamadas` (caminho = o codigo) para o teste afirmar a ordem: a
      // trava tem que vir ANTES do primeiro patch, post ou put.
      conferir("chamadas: metodo, caminho e corpo, na ordem de chegada (GET leva os params no corpo; exigirEscrita leva o codigo)", falso.chamadas, [
        { metodo: "GET", caminho: "/produtos", corpo: { "codigos[]": ["ZZ-F-1"] } },
        { metodo: "exigirEscrita", caminho: "ZZ-F-1" },
        { metodo: "PATCH", caminho: "/produtos/111", corpo: { preco: 95, dimensoes: { altura: 7 } } },
        { metodo: "GET", caminho: "/depositos" },
      ]);
      corpo.preco = 1;
      corpo.dimensoes.altura = 1;
      conferir("chamadas: guarda uma copia do corpo (mudar o objeto depois nao muda o registro)", falso.chamadas[2].corpo, { preco: 95, dimensoes: { altura: 7 } });
      conferir(
        "consultaDaChamada: junta a consulta do caminho com a dos params, tudo em lista de textos",
        consultaDaChamada({ caminho: "/estoques/saldos?codigos[]=a&codigos%5B%5D=b", corpo: { "codigos[]": ["c"], pagina: 1, vazio: "" } }),
        { "codigos[]": ["a", "b", "c"], pagina: ["1"] },
      );
      conferir("consultaDaChamada: o falso a oferece pronta", falso.consulta === consultaDaChamada, true);

      conferir("exigirEscrita do falso nao devolve nada e anota cada codigo", [falso.exigirEscrita("100246"), falso.exigirEscrita("ZZ-F-1"), falso.escritasExigidas], [undefined, undefined, ["ZZ-F-1", "100246", "ZZ-F-1"]]);

      const restrito = criarBlingFalso({ codigosLiberados: ["ZZ-OK"], produtos: [umProduto()] });
      conferir(
        "exigirEscrita com codigosLiberados recusa o que nao esta na lista, como o cliente real",
        casa(mensagemDe(() => restrito.exigirEscrita("100246")), /nao esta na lista de codigos liberados/),
        true,
      );
      // A recusa nao e uma chamada que aconteceu (`chamadas.length === 0` e o que a Tarefa 8 afirma
      // para "codigo fora da lista"), mas fica em escritasExigidas, e nao libera a escrita.
      conferir(
        "exigirEscrita recusado: nao entra em chamadas, fica em escritasExigidas e NAO libera a escrita",
        [restrito.chamadas.length, restrito.escritasExigidas, casa(await rejeicaoDe(restrito.patch("/produtos/111", { preco: 1 })), /exigirEscrita/)],
        [0, ["100246"], true],
      );
      conferir("exigirEscrita com o codigo da lista (outra caixa) passa e libera a escrita", [mensagemDe(() => restrito.exigirEscrita("zz-ok")), (await restrito.patch("/produtos/111", { preco: 1 })).ok], [null, true]);

      conferir("falso: endpoint que ele nao conhece rejeita com 'nao suportado' (erro de teste, nao do Bling)", casa(await rejeicaoDe(falso.get("/pedidos/vendas")), /nao suportado/), true);
      conferir("falso: GET /produtos?codigo= (nao documentado, Emenda 8) e recusado: o certo e codigos[]", casa(await rejeicaoDe(falso.get("/produtos?codigo=ZZ-F-1")), /codigos\[\]/), true);
      conferir("falso: listagem de produtos sem codigos[] tambem", casa(await rejeicaoDe(falso.get("/produtos", { pagina: 1, limite: 100 })), /codigos\[\]/), true);
      conferir("falso: verbo que o endpoint nao tem (PUT /depositos) tambem e recusado", casa(await rejeicaoDe(falso.put("/depositos", {})), /nao suportado/), true);

      conferir("falso: produto(id) e produto(codigo) devolvem o produto como o GET o devolveria", [falso.produto(111).nome, falso.produto("ZZ-F-1").id, falso.produto("NADA"), falso.produto(5)], ["Motor falso", 111, null, null]);
    }

    // --- Falso: escrever sem exigirEscrita antes e erro de teste ---
    // A segunda trava (a lista de codigos liberados) so vale se quem escreve lembrar de chamar
    // `cliente.exigirEscrita(sku)` antes. Com o falso padrao, post, put e patch sem ela lancam.
    {
      const padrao = criarBlingFalso({ produtos: [umProduto()], contatos: [umFornecedorDoBling()] });
      const recusas = [
        await rejeicaoDe(padrao.post("/estoques", { produto: { id: 111 } })),
        await rejeicaoDe(padrao.put("/contatos/8001", { nome: "x" })),
        await rejeicaoDe(padrao.patch("/produtos/111", { preco: 1 })),
      ];
      conferir("exigirEscrita obrigatorio: post, put e patch sem exigirEscrita antes lancam", recusas.map((mensagem) => casa(mensagem, /exigirEscrita/)), [true, true, true]);
      conferir("a mensagem diz qual escrita foi barrada", [casa(recusas[0], /POST \/estoques/), casa(recusas[1], /PUT \/contatos\/8001/), casa(recusas[2], /PATCH \/produtos\/111/)], [true, true, true]);
      conferir("a escrita barrada nao muda nada nem entra em chamadas", [padrao.chamadas.length, padrao.produto(111).preco, padrao.estado.contatos.get(8001).nome], [0, 80, "Fornecedor Com Documento"]);
      conferir("a leitura nao precisa de exigirEscrita", [(await padrao.get("/depositos")).ok, (await padrao.get("/produtos", { "codigos[]": ["ZZ-F-1"] })).ok], [true, true]);

      padrao.exigirEscrita("ZZ-F-1");
      const aposEscrita = [(await padrao.patch("/produtos/111", { preco: 1 })).ok, (await padrao.put("/contatos/8001", { nome: "x" })).ok, (await padrao.post("/produtos", { nome: "N", tipo: "P", formato: "S", situacao: "A" })).ok];
      conferir("depois de exigirEscrita(codigo) o patch, o put e o post passam", aposEscrita, [true, true, true]);
      conferir("exigirEscrita fica em chamadas, no lugar certo: antes do primeiro patch, put ou post", padrao.chamadas.map((chamada) => chamada.metodo), ["GET", "GET", "exigirEscrita", "PATCH", "PUT", "POST"]);
      conferir("e leva o codigo no caminho", padrao.chamadas[2], { metodo: "exigirEscrita", caminho: "ZZ-F-1" });

      // Para os testes que exercitam os endpoints do proprio falso e nao tem sku para pedir.
      const livre = criarBlingFalso({ produtos: [umProduto()], exigirEscritaObrigatorio: false });
      conferir("exigirEscritaObrigatorio: false deixa escrever sem exigirEscrita", (await livre.patch("/produtos/111", { preco: 1 })).ok, true);
      conferir("e nao inventa um exigirEscrita em chamadas", livre.chamadas.map((chamada) => chamada.metodo), ["PATCH"]);
    }

    // --- O mesmo codigo no falso e no Rise: o que a Tarefa 7 vai usar ---
    {
      const falso = criarBlingFalso({ produtos: [umProduto({ codigo: "ZZ-BS-2", nome: "Produto de teste", preco: 95 })] });
      const achado = await falso.get("/produtos", { "codigos[]": ["ZZ-BS-2"] });
      conferir("o falso devolve o produto cadastrado por codigo e registra a chamada", [achado.dados.data.map((p) => [p.codigo, p.preco]), falso.chamadas.map((c) => [c.metodo, c.caminho])], [[["ZZ-BS-2", 95]], [["GET", "/produtos"]]]);
    }
  }

  // -------------------------------------------------------------------------
  // Leitura do pop-up
  // -------------------------------------------------------------------------
  {
    console.log("\nLeitura do pop-up");
    await limpar();

    // `escrita` depende da trava do .env: o teste a fixa para nao depender do ambiente e a restaura
    // no fim. Nada aqui escreve no Bling: o cliente e sempre o falso (ou um de mentira).
    const travaOriginal = config.travas.blingEscrita;
    const liberadosOriginais = config.travas.blingCodigosLiberados;
    config.travas.blingEscrita = false;
    config.travas.blingCodigosLiberados = [];

    try {
      const casaTexto = (texto, regex) => typeof texto === "string" && regex.test(texto);
      // A mensagem com que a promessa foi rejeitada (ou null se ela deu certo).
      const rejeicaoDeLeitura = async (promessa) => {
        try {
          await promessa;
          return null;
        } catch (erro) {
          return erro.message;
        }
      };
      const resumo = (diferenca) => ({ campo: diferenca.campo, tipo: diferenca.tipo, rise: diferenca.rise, bling: diferenca.bling });
      const chamadasDe = (falso) => falso.chamadas.map((chamada) => `${chamada.metodo} ${chamada.caminho}`);
      const CNPJ_BOM = "11.222.333/0001-81";
      const novoFornecedor = (nome, cnpj) => prisma.fornecedor.create({ data: { nome: `ZZ Teste BS ${nome}`, ...(cnpj ? { cnpj } : {}) } });
      // O produto como o Bling o guarda: igual ao do Rise, menos o preco (95 contra 90).
      const umNoBling = (extra = {}) => ({
        id: 15000000101,
        codigo: "ZZ-BS-2",
        nome: "Motor de teste da leitura",
        preco: 95,
        descricaoCurta: "<p>Linha 1<br>Linha 2</p>",
        marca: "Generica",
        unidade: "Un",
        pesoBruto: 0.25,
        dimensoes: { altura: 30, largura: 45, profundidade: 100, unidadeMedida: 2 },
        tributacao: { ncm: "85011019", origem: 0 },
        estoque: { minimo: 0, maximo: 0, localizacao: "A1" },
        ...extra,
      });

      const comCnpj = await novoFornecedor("Com CNPJ", CNPJ_BOM);
      const semCnpj = await novoFornecedor("Sem CNPJ");
      const cnpjInvalido = await novoFornecedor("CNPJ invalido", "11.111.111/1111-11");
      const mesmoCnpj = await novoFornecedor("Mesmo CNPJ", "11222333000181");

      // Os movimentos entram fora de ordem (o mais novo primeiro) e um deles ja foi enviado.
      const produto = await prisma.produto.create({
        data: {
          sku: "ZZ-BS-2",
          tituloBase: "Motor de teste da leitura",
          descricaoBase: "Linha 1\nLinha 2",
          precoVenda: "90.00",
          marca: "GENERICA",
          unidade: "UN",
          pesoKg: "0.25",
          alturaCm: "3",
          larguraCm: "4.5",
          comprimentoCm: "10",
          ncm: "85011019",
          origem: 0,
          localizacao: "A1",
          estoque: 7,
          blingSaldo: 20,
          fornecedores: {
            create: [
              { fornecedorId: comCnpj.id, codigo: "F-1", precoCusto: "10.00", padrao: true },
              { fornecedorId: semCnpj.id },
              { fornecedorId: cnpjInvalido.id },
              { fornecedorId: mesmoCnpj.id, codigo: "F-2" },
            ],
          },
          movimentosEstoque: {
            create: [
              { tipo: "SAIDA", quantidade: 1, saldoAnterior: 8, saldoNovo: 7, criadoEm: new Date("2026-10-01T11:00:00Z") },
              { tipo: "ENTRADA", quantidade: 3, saldoAnterior: 5, saldoNovo: 8, criadoEm: new Date("2026-10-01T10:00:00Z") },
              { tipo: "ENTRADA", quantidade: 2, saldoAnterior: 3, saldoNovo: 5, criadoEm: new Date("2026-09-30T10:00:00Z"), enviadoAoBlingEm: new Date("2026-09-30T12:00:00Z") },
            ],
          },
        },
      });
      // Produto quase vazio, para o fallback do saldo (nunca lido) e os campos "vazio no Rise".
      const minimo = await prisma.produto.create({ data: { sku: "ZZ-BS-3", tituloBase: "Minimo", precoVenda: "50.00" } });

      // --- buscarNoBling: a busca por codigo ---
      {
        const falso = criarBlingFalso();
        conferir("busca: codigo sem produto no Bling = nao_existe, sem id nem produto", await buscarNoBling(falso, "ZZ-BS-2"), { situacao: "nao_existe" });
        conferir(
          "busca: foi UMA chamada, GET /produtos com codigos[] (Emenda 8)",
          [falso.chamadas.length, falso.chamadas[0].metodo, falso.chamadas[0].caminho, falso.consulta(falso.chamadas[0])],
          [1, "GET", "/produtos", { "codigos[]": ["ZZ-BS-2"] }],
        );
      }
      {
        const falso = criarBlingFalso({ produtos: [umNoBling({ codigo: "zz-bs-2" })], saldos: { "zz-bs-2": 12 } });
        const achado = await buscarNoBling(falso, "ZZ-BS-2");
        conferir(
          "busca: um produto = existe, com o id, a quantidade e o produto COMPLETO (grupos e saldo)",
          [achado.situacao, achado.id, achado.quantidade, achado.produto.codigo, achado.produto.dimensoes.altura, achado.produto.estoque.saldoVirtualTotal],
          ["existe", 15000000101, 1, "zz-bs-2", 30, 12],
        );
        conferir("busca: le o completo por GET /produtos/{id} com o id da PROPRIA busca, e nada mais", chamadasDe(falso), ["GET /produtos", "GET /produtos/15000000101"]);
      }
      {
        const falso = criarBlingFalso({ produtos: [umNoBling({ id: 15000000111 }), umNoBling({ id: 15000000112, codigo: "zz-bs-2" })] });
        conferir("busca: dois produtos com o mesmo codigo = duplicado, com a quantidade e SEM id nem produto (nao escolhe)", await buscarNoBling(falso, "ZZ-BS-2"), { situacao: "duplicado", quantidade: 2 });
        conferir("busca: duplicado nao le produto nenhum, so a busca", chamadasDe(falso), ["GET /produtos"]);
      }
      {
        const falso = criarBlingFalso({ produtos: [umNoBling()] });
        conferir(
          "busca: codigo vazio, so espaco ou ausente = nao_existe SEM chamar o Bling (a chave vazia sai da URL e listaria o catalogo)",
          [await buscarNoBling(falso, ""), await buscarNoBling(falso, "   "), await buscarNoBling(falso, undefined), falso.chamadas.length],
          [{ situacao: "nao_existe" }, { situacao: "nao_existe" }, { situacao: "nao_existe" }, 0],
        );
        conferir("busca: o codigo pedido vai aparado e o do Bling casa sem diferenciar caixa", (await buscarNoBling(falso, "  zz-bs-2 ")).situacao, "existe");
      }
      {
        // Respostas que o falso nao produz: item de outro codigo e produto que some entre a busca e a leitura.
        const resposta = (dados, status = 200) => ({ ok: status < 300, status, duracaoMs: 0, dados });
        const clienteDeMentira = ({ busca, completo }) => {
          const chamadas = [];
          return {
            chamadas,
            get: async (caminho) => {
              chamadas.push(caminho);
              return caminho === "/produtos" ? busca : completo;
            },
          };
        };

        const outroCodigo = clienteDeMentira({ busca: resposta({ data: [{ id: 1, codigo: "OUTRO-COD" }] }) });
        conferir("busca: item devolvido com OUTRO codigo = nao_existe, e nao le nada (Emenda 11)", [await buscarNoBling(outroCodigo, "ZZ-BS-2"), outroCodigo.chamadas], [{ situacao: "nao_existe" }, ["/produtos"]]);

        const completoDeOutro = clienteDeMentira({ busca: resposta({ data: [{ id: 7, codigo: "ZZ-BS-2" }] }), completo: resposta({ data: { id: 7, codigo: "OUTRO-COD" } }) });
        conferir("busca: o completo lido com outro codigo que o pedido = nao_existe (nunca devolve um produto que nao e o do sku)", (await buscarNoBling(completoDeOutro, "ZZ-BS-2")).situacao, "nao_existe");

        const sumiu = clienteDeMentira({ busca: resposta({ data: [{ id: 7, codigo: "ZZ-BS-2" }] }), completo: resposta({ error: { type: "RESOURCE_NOT_FOUND" } }, 404) });
        conferir("busca: 404 ao ler o completo (o produto sumiu depois da busca) = nao_existe", [(await buscarNoBling(sumiu, "ZZ-BS-2")).situacao, sumiu.chamadas], ["nao_existe", ["/produtos", "/produtos/7"]]);

        const comIntruso = clienteDeMentira({
          busca: resposta({ data: [{ id: 7, codigo: "ZZ-BS-2" }, { id: 8, codigo: "OUTRO-COD" }] }),
          completo: resposta({ data: { id: 7, codigo: "ZZ-BS-2", nome: "x" } }),
        });
        const intruso = await buscarNoBling(comIntruso, "ZZ-BS-2");
        conferir("busca: um item de outro codigo no meio nao conta (so os do codigo pedido: 1 = existe)", [intruso.situacao, intruso.id, intruso.quantidade], ["existe", 7, 1]);

        const comErro = clienteDeMentira({ busca: resposta({ error: { description: "x" } }, 429) });
        conferir("busca: falha do Bling LANCA com mensagem em portugues (quem chama decide), nao devolve 'nao_existe'", casaTexto(await rejeicaoDeLeitura(buscarNoBling(comErro, "ZZ-BS-2")), /limite de chamadas/), true);
      }

      // --- lerParaPopup: o caso feliz, com diferenca ---
      {
        const falso = criarBlingFalso({ produtos: [umNoBling({ codigo: "zz-bs-2" })], saldos: { "zz-bs-2": 12 } });
        const existe = await lerParaPopup(produto.id, falso);
        conferir("popup existe: ok, sku e situacao (o Bling guarda o codigo em outra caixa e ainda assim e o mesmo)", [existe.ok, existe.sku, existe.situacao], [true, "ZZ-BS-2", "existe"]);
        conferir("popup existe: sem a chave erro, e todas as outras", Object.keys(existe).sort(), ["avisos", "diferencas", "escrita", "estoque", "iguais", "ok", "situacao", "sku"]);
        conferir("popup existe: so o preco difere (90 no Rise, 95 no Bling); o resto bate depois de normalizar", existe.diferencas.map(resumo), [{ campo: "preco", tipo: "diferente", rise: 90, bling: 95 }]);
        conferir("popup existe: a diferenca traz o rotulo da tela", existe.diferencas[0].rotulo, "Preco");
        conferir("popup existe: iguais conta os campos iguais (18 menos o preco)", [existe.iguais, existe.iguais + existe.diferencas.length === CAMPOS_DE_ENVIO.length], [17, true]);
        conferir(
          "popup existe: estoque = saldo virtual do produto LIDO (12, nao o 20 guardado), estoque do Rise e os 2 pendentes (o enviado nao conta)",
          existe.estoque,
          { blingSaldo: 12, riseEstoque: 7, pendentes: 2 },
        );
        conferir(
          "popup existe: aviso para o fornecedor sem CNPJ e para o de CNPJ invalido, nesta ordem; o com CNPJ e o repetido nao avisam",
          existe.avisos,
          ["Fornecedor ZZ Teste BS Sem CNPJ sem CNPJ valido: nao sera enviado ao Bling.", "Fornecedor ZZ Teste BS CNPJ invalido sem CNPJ valido: nao sera enviado ao Bling."],
        );
        conferir("popup existe: com a trava desligada a escrita nao esta liberada e o motivo diz qual trava", [existe.escrita.liberada, casaTexto(existe.escrita.motivo, /BLING_ESCRITA esta false/)], [false, true]);
        conferir("popup existe: so le: GET da busca e GET do completo, nenhuma escrita e nenhum exigirEscrita", [chamadasDe(falso), falso.escritasExigidas], [["GET /produtos", "GET /produtos/15000000101"], []]);
        const depois = await prisma.produto.findUnique({ where: { id: produto.id } });
        conferir("popup existe: ler nao grava nada no Rise (blingSaldo segue 20, nunca sincronizado)", [depois.blingSaldo, depois.blingSincronizadoEm, depois.blingAssinatura], [20, null, null]);
        conferir("lerParaPopup: o cliente e opcional (o padrao e o clienteBling())", lerParaPopup.length, 1);
      }

      // --- lerParaPopup: campo vazio no Rise e saldo negativo ---
      {
        const falso = criarBlingFalso({
          produtos: [umNoBling({ id: 15000000103, codigo: "ZZ-BS-3", nome: "Minimo", preco: 50, descricaoCurta: "", marca: "X", unidade: "UN", pesoBruto: 0, dimensoes: undefined, tributacao: undefined, estoque: { localizacao: "B2" } })],
          saldos: { "ZZ-BS-3": -8 },
        });
        const lido = await lerParaPopup(minimo.id, falso);
        conferir("popup vazio no Rise: marca e localizacao do Bling aparecem como vazioNoRise (nao sao divergencia)", lido.diferencas.map(resumo), [
          { campo: "marca", tipo: "vazioNoRise", rise: null, bling: "X" },
          { campo: "localizacao", tipo: "vazioNoRise", rise: null, bling: "B2" },
        ]);
        conferir("popup vazio no Rise: nenhuma divergencia de verdade, e iguais = 18 menos as 2 listadas", [contarDivergencias(lido.diferencas), lido.iguais], [0, 16]);
        conferir("popup saldo negativo do Bling (Emenda 6): blingSaldo -8 cru, e o estoque do Rise sem pendente e 0", lido.estoque, { blingSaldo: -8, riseEstoque: 0, pendentes: 0 });
        conferir("popup sem fornecedor nem aviso: lista vazia", lido.avisos, []);
      }

      // --- lerParaPopup: codigo que nao existe no Bling ---
      {
        const falso = criarBlingFalso();
        const naoExiste = await lerParaPopup(produto.id, falso);
        conferir("popup nao_existe: ok (o pop-up oferece 'Cadastrar no Bling'), sem diferencas e sem iguais", [naoExiste.ok, naoExiste.situacao, naoExiste.diferencas, naoExiste.iguais], [true, "nao_existe", [], 0]);
        conferir("popup nao_existe: sem Bling para ler, o saldo e o ultimo guardado (20); o estoque do Rise e os avisos seguem", [naoExiste.estoque, naoExiste.avisos.length], [{ blingSaldo: 20, riseEstoque: 7, pendentes: 2 }, 2]);
        conferir("popup nao_existe: foi so a busca", chamadasDe(falso), ["GET /produtos"]);
        const nuncaLido = await lerParaPopup(minimo.id, criarBlingFalso());
        conferir("popup nao_existe: produto nunca lido do Bling fica com blingSaldo null", nuncaLido.estoque, { blingSaldo: null, riseEstoque: 0, pendentes: 0 });
      }

      // --- lerParaPopup: mais de um produto com o codigo ---
      {
        const falso = criarBlingFalso({ produtos: [umNoBling({ id: 15000000111 }), umNoBling({ id: 15000000112, codigo: "zz-bs-2" })] });
        const dup = await lerParaPopup(produto.id, falso);
        conferir("popup duplicado: ok false, situacao duplicado, erro cita 'mais de um', sem diferencas", [dup.ok, dup.situacao, casaTexto(dup.erro, /mais de um/), dup.diferencas, dup.iguais], [false, "duplicado", true, [], 0]);
        conferir("popup duplicado: o erro diz o codigo e quantos, e nao le produto nenhum", [String(dup.erro).includes("ZZ-BS-2"), String(dup.erro).includes("2"), chamadasDe(falso)], [true, true, ["GET /produtos"]]);
        conferir("popup duplicado: o estoque e os avisos do Rise seguem", [dup.estoque, dup.avisos.length], [{ blingSaldo: 20, riseEstoque: 7, pendentes: 2 }, 2]);
      }

      // --- lerParaPopup: falhas (nunca lancam para a tela) ---
      {
        const lerComFalha = (falha) => lerParaPopup(produto.id, criarBlingFalso({ produtos: [umNoBling()], falhas: [falha] }));
        const limite = await lerComFalha({ metodo: "GET", caminho: "/produtos", status: 429, mensagem: "Muitas chamadas" });
        conferir("popup falha 429: ok false, situacao null e erro em portugues que fala do limite de chamadas", [limite.ok, limite.situacao, casaTexto(limite.erro, /limite de chamadas/)], [false, null, true]);
        conferir("popup falha: o resultado mantem todas as chaves e o que o Rise ja sabia (estoque e avisos)", [Object.keys(limite).sort(), limite.estoque, limite.avisos.length], [
          ["avisos", "diferencas", "erro", "escrita", "estoque", "iguais", "ok", "situacao", "sku"],
          { blingSaldo: 20, riseEstoque: 7, pendentes: 2 },
          2,
        ]);
        const acesso = await lerComFalha({ metodo: "GET", caminho: "/produtos", status: 401, mensagem: "invalid_token" });
        conferir("popup falha 401: o erro fala do token", [acesso.ok, casaTexto(acesso.erro, /token/)], [false, true]);
        const proibido = await lerComFalha({ metodo: "GET", caminho: "/produtos", status: 403, mensagem: "sem escopo" });
        conferir("popup falha 403: tambem fala de acesso/token", [proibido.ok, casaTexto(proibido.erro, /token/)], [false, true]);
        const fora = await lerComFalha({ metodo: "GET", caminho: "/produtos", status: 500, mensagem: "boom" });
        conferir("popup falha 500: o erro diz o HTTP", [fora.ok, casaTexto(fora.erro, /HTTP 500/)], [false, true]);
        const recusa = await lerComFalha({ metodo: "GET", caminho: "/produtos", status: 400, mensagem: "Parametro invalido" });
        conferir("popup falha 400: o erro diz o HTTP e a descricao do Bling", [recusa.ok, casaTexto(recusa.erro, /HTTP 400/), casaTexto(recusa.erro, /Parametro invalido/)], [false, true, true]);

        // A falha na SEGUNDA chamada (ler o completo): o caminho com barra so casa o GET /produtos/{id}.
        const falsoNoCompleto = criarBlingFalso({ produtos: [umNoBling()], falhas: [{ metodo: "GET", caminho: "/produtos/", status: 500, mensagem: "boom" }] });
        const noCompleto = await lerParaPopup(produto.id, falsoNoCompleto);
        conferir("popup falha ao ler o completo: ok false com o HTTP, depois de a busca ter dado certo", [noCompleto.ok, casaTexto(noCompleto.erro, /HTTP 500/), chamadasDe(falsoNoCompleto)], [false, true, ["GET /produtos", "GET /produtos/15000000101"]]);

        // Falha que LANCA (token ausente, rede): vira ok false, nao excecao.
        const semToken = { get: async () => { throw new Error('Bling nao conectado. Use "Conectar" na tela Integracoes.'); } };
        const semConexao = await lerParaPopup(produto.id, semToken);
        conferir("popup excecao do cliente (token ausente): ok false com o texto, sem lancar", [semConexao.ok, casaTexto(semConexao.erro, /Nao foi possivel ler o Bling: Bling nao conectado/)], [false, true]);

        // O produto do Rise nao existe (id velho na tela): ok false, nada e chamado.
        const falsoSemUso = criarBlingFalso();
        const semProduto = await lerParaPopup("id-que-nao-existe", falsoSemUso);
        conferir("popup produto que nao existe no Rise: ok false, erro em portugues, o Bling nem e chamado", [semProduto.ok, casaTexto(semProduto.erro, /Produto nao encontrado/), falsoSemUso.chamadas.length, semProduto.estoque], [false, true, 0, { blingSaldo: null, riseEstoque: 0, pendentes: 0 }]);
        conferir("popup id ausente: tambem ok false, sem lancar", (await lerParaPopup(undefined, falsoSemUso)).ok, false);
      }

      // --- lerParaPopup: a segunda trava (a lista de codigos liberados), sem chamar exigirEscrita ---
      {
        const escritaCom = async (ligada, liberados) => {
          config.travas.blingEscrita = ligada;
          config.travas.blingCodigosLiberados = liberados;
          const falso = criarBlingFalso();
          const lido = await lerParaPopup(produto.id, falso);
          return [lido.escrita, falso.escritasExigidas];
        };
        conferir("escrita: trava ligada e lista vazia = liberada, sem motivo", await escritaCom(true, []), [{ liberada: true, motivo: null }, []]);
        conferir("escrita: sku na lista (em outra caixa) = liberada", (await escritaCom(true, ["zz-bs-2"]))[0], { liberada: true, motivo: null });
        const [fora] = await escritaCom(true, ["ZZ-OUTRO"]);
        conferir("escrita: sku fora da lista = barrada, e o motivo cita a lista e o codigo", [fora.liberada, casaTexto(fora.motivo, /BLING_ESCRITA_CODIGOS/), String(fora.motivo).includes("ZZ-BS-2")], [false, true, true]);
        const [desligada] = await escritaCom(false, ["ZZ-BS-2"]);
        conferir(
          "escrita: trava geral desligada = barrada mesmo com o sku na lista, e o motivo cita BLING_ESCRITA (nao a lista)",
          [desligada.liberada, casaTexto(desligada.motivo, /BLING_ESCRITA esta false/), casaTexto(desligada.motivo, /BLING_ESCRITA_CODIGOS/)],
          [false, true, false],
        );
      }

      // --- lerProdutoDoRise: a leitura do Rise com ordem estavel ---
      {
        const lido = await lerProdutoDoRise(produto.id);
        conferir("lerProdutoDoRise: so os movimentos pendentes, do mais antigo ao mais novo (a ordem em que o Bling os recebe)", lido.movimentosEstoque.map((m) => [m.tipo, m.quantidade]), [["ENTRADA", 3], ["SAIDA", 1]]);
        conferir("lerProdutoDoRise: vinculos com o padrao primeiro e os demais na ordem de criacao", lido.fornecedores.map((v) => v.fornecedor.nome), [
          "ZZ Teste BS Com CNPJ",
          "ZZ Teste BS Sem CNPJ",
          "ZZ Teste BS CNPJ invalido",
          "ZZ Teste BS Mesmo CNPJ",
        ]);
        conferir("lerProdutoDoRise: do fornecedor so o CNPJ e o nome", Object.keys(lido.fornecedores[0].fornecedor).sort(), ["cnpj", "nome"]);
        conferir("lerProdutoDoRise: id que nao existe = null", await lerProdutoDoRise("id-que-nao-existe"), null);

        // Pendencia da Tarefa 3: com o CNPJ repetido "fica o primeiro", entao a ordem tem que ser fixa.
        const repA = await novoFornecedor("Rep A", CNPJ_BOM);
        const repB = await novoFornecedor("Rep B", CNPJ_BOM);
        const repetido = await prisma.produto.create({
          data: {
            sku: "ZZ-BS-4",
            tituloBase: "Vinculos com CNPJ repetido",
            fornecedores: { create: [{ fornecedorId: repA.id, codigo: "A", padrao: false }, { fornecedorId: repB.id, codigo: "B", padrao: true }] },
          },
        });
        const vinculos = (await lerProdutoDoRise(repetido.id)).fornecedores;
        conferir(
          "CNPJ repetido: o vinculo padrao vem primeiro, entao e ele que normalizarFornecedoresDoRise guarda (mesmo criado depois)",
          [vinculos.map((v) => v.codigo), normalizarFornecedoresDoRise(vinculos).map((f) => f.codigo)],
          [["B", "A"], ["B"]],
        );
      }
    } finally {
      config.travas.blingEscrita = travaOriginal;
      config.travas.blingCodigosLiberados = liberadosOriginais;
    }
  }

  // -------------------------------------------------------------------------
  // Envio dos campos, cadastro e copia de seguranca (Tarefa 8)
  // -------------------------------------------------------------------------
  {
    console.log("\nEnvio dos campos");
    await limpar();

    const casaTexto = (texto, regex) => typeof texto === "string" && regex.test(texto);
    const ESCRITAS = ["POST", "PUT", "PATCH"];
    const doMetodo = (falso, metodo) => falso.chamadas.filter((chamada) => chamada.metodo === metodo);
    const escritasDe = (falso) => falso.chamadas.filter((chamada) => ESCRITAS.includes(chamada.metodo));
    const rotasDe = (falso) => falso.chamadas.map((chamada) => `${chamada.metodo} ${chamada.caminho}`);
    const ordenado = (valor) => {
      if (Array.isArray(valor)) return valor.map(ordenado);
      if (valor && typeof valor === "object") return Object.fromEntries(Object.keys(valor).sort().map((chave) => [chave, ordenado(valor[chave])]));
      return valor;
    };
    // Todo falso do bloco fica guardado: no fim, os corpos de PATCH/POST de produto de todos eles
    // sao conferidos contra as chaves proibidas (Emenda 11).
    const usados = [];
    const novoFalso = (opcoes) => {
      const falso = criarBlingFalso(opcoes);
      usados.push(falso);
      return falso;
    };

    // O produto do Rise e o mesmo produto no Bling, iguais depois de normalizar (o preco do Bling
    // e 90, como o do Rise). O do Bling traz tambem o que o Rise nunca envia (midia, fornecedor,
    // categoria...), para provar que nada disso volta no corpo.
    const BLING_ID = 15000000201;
    const criarNoRise = (sku, extra = {}) =>
      prisma.produto.create({
        data: {
          sku,
          tituloBase: "Motor de teste do envio",
          descricaoBase: "Linha 1\nLinha 2",
          precoVenda: "90.00",
          marca: "GENERICA",
          unidade: "UN",
          pesoKg: "0.25",
          alturaCm: "3",
          larguraCm: "4.5",
          comprimentoCm: "10",
          ncm: "85011019",
          origem: 0,
          localizacao: "A1",
          ...extra,
        },
      });
    const noBling = (codigo, extra = {}) => ({
      id: BLING_ID,
      codigo,
      nome: "Motor de teste do envio",
      preco: 90,
      descricaoCurta: "<p>Linha 1<br>Linha 2</p>",
      marca: "Generica",
      unidade: "Un",
      pesoBruto: 0.25,
      dimensoes: { altura: 30, largura: 45, profundidade: 100, unidadeMedida: 2 },
      tributacao: { ncm: "85011019", origem: 0 },
      estoque: { minimo: 0, maximo: 0, localizacao: "A1" },
      actionEstoque: "",
      categoria: { id: 7 },
      variacoes: [],
      imagemURL: "https://s3/miniatura.jpg",
      midia: { video: { url: "" }, imagens: { internas: [{ link: "https://s3/foto.jpg" }] } },
      fornecedor: { id: 0, contato: { id: 0, nome: "" } },
      estrutura: { tipoEstoque: "", lancamentoEstoque: "", componentes: [] },
      camposCustomizados: [],
      ...extra,
    });
    const ler = (id) => prisma.produto.findUnique({ where: { id } });
    const copiasDe = (produtoId) => prisma.blingCopiaProduto.findMany({ where: { produtoId }, orderBy: [{ criadoEm: "asc" }, { id: "asc" }] });
    // A assinatura de hoje, calculada como a lista vai calcular: e a que o envio tem que gravar.
    const assinaturaAtual = async (id) => {
      const lido = await lerProdutoDoRise(id);
      return assinaturaDoRise(normalizarDoRise(lido), normalizarFornecedoresDoRise(lido.fornecedores));
    };

    // --- Sem diferenca nenhuma: nao chama o PATCH e marca como sincronizado ---
    {
      const produto = await criarNoRise("ZZ-BS-E1");
      const falso = novoFalso({ produtos: [noBling("ZZ-BS-E1")] });
      const resultado = await sincronizarProduto(produto.id, falso);
      conferir("sem diferenca: ok, alterados vazio e nenhum fornecedor", resultado, { ok: true, alterados: [], fornecedores: { enviados: 0, avisos: [] } });
      conferir("sem diferenca: exigirEscrita e a primeira chamada, depois a busca e a leitura, e NENHUM PATCH", rotasDe(falso), ["exigirEscrita ZZ-BS-E1", "GET /produtos", `GET /produtos/${BLING_ID}`]);
      const depois = await ler(produto.id);
      const atual = await assinaturaAtual(produto.id);
      conferir("sem diferenca: grava blingSincronizadoEm e a assinatura do Rise de hoje", [depois.blingSincronizadoEm instanceof Date, depois.blingAssinatura === atual], [true, true]);
      conferir("sem diferenca: o atualizadoEm do produto NAO muda (sincronizar nao e editar, e nao sobe o produto na lista)", depois.atualizadoEm.getTime(), produto.atualizadoEm.getTime());
      conferir(
        "sem diferenca: o icone fica verde e sem selo",
        estadoDoIconeBling({ sincronizadoEm: depois.blingSincronizadoEm, assinaturaGuardada: depois.blingAssinatura, assinaturaAtual: atual, pendentes: 0 }),
        { cor: "verde", divergente: false, motivos: [] },
      );
      conferir("sem diferenca: nenhuma copia de seguranca (nada mudou no Bling)", (await copiasDe(produto.id)).length, 0);
    }

    // --- Preco diferente: PATCH so com o preco, no id da busca, e copia de seguranca ---
    {
      // O blingId guardado e velho de proposito: o alvo do PATCH sai da busca por codigo (Emenda 11).
      const produto = await criarNoRise("ZZ-BS-E2", { blingId: "424242" });
      const falso = novoFalso({ produtos: [noBling("ZZ-BS-E2", { preco: 95 })] });
      const resultado = await sincronizarProduto(produto.id, falso);
      conferir("preco diferente: ok, e alterados com o de (Bling) e o para (Rise)", [resultado.ok, resultado.alterados], [true, [{ campo: "preco", de: 95, para: 90 }]]);
      conferir(
        "preco diferente: UM PATCH, no id achado pela busca por codigo (nao no blingId guardado), com SO o preco",
        doMetodo(falso, "PATCH").map((chamada) => [chamada.caminho, chamada.corpo]),
        [[`/produtos/${BLING_ID}`, { preco: 90 }]],
      );
      conferir("preco diferente: exigirEscrita primeiro, depois a busca, a leitura e o PATCH", rotasDe(falso), ["exigirEscrita ZZ-BS-E2", "GET /produtos", `GET /produtos/${BLING_ID}`, `PATCH /produtos/${BLING_ID}`]);
      conferir("preco diferente: o Bling ficou com o preco do Rise, e o resto como estava", [falso.produto(BLING_ID).preco, falso.produto(BLING_ID).categoria, falso.produto(BLING_ID).midia.imagens.internas.length], [90, { id: 7 }, 1]);
      const copias = await copiasDe(produto.id);
      conferir("preco diferente: uma copia de seguranca", copias.length, 1);
      conferir("a copia guarda o produto do Bling como estava ANTES do PATCH (preco 95, o id e o codigo)", [copias[0].conteudo.preco, copias[0].conteudo.id, copias[0].conteudo.codigo], [95, BLING_ID, "ZZ-BS-E2"]);
      conferir("a copia guarda as alteracoes campo: de -> para", copias[0].alteracoes.map((alteracao) => [alteracao.campo, alteracao.de, alteracao.para]), [["preco", 95, 90]]);
      const depois = await ler(produto.id);
      conferir(
        "preco diferente: assinatura e data gravadas, atualizadoEm intacto, e o blingId guardado nao e tocado",
        [depois.blingAssinatura === (await assinaturaAtual(produto.id)), depois.blingSincronizadoEm instanceof Date, depois.atualizadoEm.getTime(), depois.blingId],
        [true, true, produto.atualizadoEm.getTime(), "424242"],
      );

      // Clique duplo (Review Focus 5): a segunda, logo depois, nao tem diferenca e nao chama o PATCH.
      const segunda = await sincronizarProduto(produto.id, falso);
      conferir("clique duplo: a segunda e ok, sem alterados", [segunda.ok, segunda.alterados], [true, []]);
      conferir("clique duplo: continua UM PATCH so e UMA copia so", [doMetodo(falso, "PATCH").length, (await copiasDe(produto.id)).length], [1, 1]);
    }

    // --- Clique duplo ao mesmo tempo: o segundo nao corre junto ---
    {
      const produto = await criarNoRise("ZZ-BS-E3");
      const falso = novoFalso({ produtos: [noBling("ZZ-BS-E3", { preco: 95 })] });
      const [a, b] = await Promise.all([sincronizarProduto(produto.id, falso), sincronizarProduto(produto.id, falso)]);
      conferir(
        "clique duplo ao mesmo tempo: um envia e o outro e recusado por haver envio em andamento",
        [[a.ok, b.ok].sort(), casaTexto((a.ok ? b : a).erro, /em andamento/)],
        [[false, true], true],
      );
      conferir("clique duplo ao mesmo tempo: UM PATCH so", doMetodo(falso, "PATCH").length, 1);
      conferir("e depois de terminar, a trava sai: a proxima sincronizacao corre (sem diferenca)", (await sincronizarProduto(produto.id, falso)).ok, true);
    }

    // --- Cinco sincronizacoes com mudanca: ficam as 3 copias mais recentes ---
    {
      const produto = await criarNoRise("ZZ-BS-E4");
      const falso = novoFalso({ produtos: [noBling("ZZ-BS-E4", { preco: 95 })] });
      const oks = [];
      for (let i = 1; i <= 5; i++) {
        await prisma.produto.update({ where: { id: produto.id }, data: { precoVenda: String(100 + i) } });
        oks.push((await sincronizarProduto(produto.id, falso)).ok);
      }
      const copias = await copiasDe(produto.id);
      conferir("5 sincronizacoes com mudanca: todas ok, 5 PATCH e so 3 copias", [oks, doMetodo(falso, "PATCH").length, copias.length], [[true, true, true, true, true], 5, 3]);
      conferir("as copias que ficam sao as 3 mais recentes (de 102, 103, 104 para 103, 104, 105)", copias.map((copia) => [copia.conteudo.preco, copia.alteracoes[0].para]), [[102, 103], [103, 104], [104, 105]]);
    }

    // --- Fornecedores do Rise (CNPJs validos; um estrangeiro, sem CNPJ) e contatos do Bling ---
    const novoFornecedor = (nome, cnpj) => prisma.fornecedor.create({ data: { nome: `ZZ Teste BS ${nome}`, ...(cnpj ? { cnpj } : {}) } });
    const fCnpj = await novoFornecedor("Forn CNPJ", "11.222.333/0001-81");
    const fNome = await novoFornecedor("Forn Nome", "12.345.678/0001-95");
    const fCliente = await novoFornecedor("Forn Cliente", "00.000.000/0001-91");
    const fNovo = await novoFornecedor("Forn Novo", "11.444.777/0001-61");
    const fOutroDoc = await novoFornecedor("Forn Outro Doc", "22.233.344/0001-83");
    const fSem = await novoFornecedor("Forn Estrangeiro", null);
    const ID_CNPJ = 16100000001;
    const ID_NOME = 16100000002;
    const ID_CLIENTE = 16100000003;
    const ID_OUTRO_DOC = 16100000004;
    const contatosDoBling = () => [
      // Achado pelo CNPJ (14 digitos), mesmo com outro nome.
      { id: ID_CNPJ, nome: "Nome diferente no Bling", numeroDocumento: "11222333000181", tiposContato: [{ descricao: "Fornecedor" }] },
      // Sem documento, nome igual sem caixa, sem acento e sem espacos nas pontas, tipo Fornecedor: reaproveitado.
      { id: ID_NOME, nome: "  zz teste bs forn NOMÉ ", numeroDocumento: "", tiposContato: [{ descricao: "Fornecedor" }] },
      // Nome igual, mas e Cliente: NAO serve.
      { id: ID_CLIENTE, nome: "ZZ Teste BS Forn Cliente", tiposContato: [{ descricao: "Cliente" }] },
      // Nome igual e tipo Fornecedor, mas com OUTRO CNPJ: e outra empresa, NAO serve.
      { id: ID_OUTRO_DOC, nome: "ZZ Teste BS Forn Outro Doc", numeroDocumento: "33344455000183", tiposContato: [{ descricao: "Fornecedor" }] },
    ];
    const AVISO_SEM_CNPJ = "Fornecedor ZZ Teste BS Forn Estrangeiro: sem CNPJ valido, nao sera enviado ao Bling.";

    // --- Contato: CNPJ, depois nome (so tipo Fornecedor), e so entao criar; vinculo novo ---
    {
      const produto = await criarNoRise("ZZ-BS-F1", {
        fornecedores: {
          create: [
            { fornecedorId: fCnpj.id, codigo: "FC-1", descricao: "https://exemplo.com/fc", precoCusto: "10.00", padrao: true },
            { fornecedorId: fNome.id, codigo: "FN-1" },
            { fornecedorId: fSem.id, codigo: "FS-1" },
            { fornecedorId: fCliente.id },
            { fornecedorId: fOutroDoc.id },
            { fornecedorId: fNovo.id, precoCusto: "7.50" },
          ],
        },
      });
      const falso = novoFalso({ produtos: [noBling("ZZ-BS-F1")], contatos: contatosDoBling() });
      const idTipoFornecedor = falso.idDoTipoDeContato("Fornecedor");
      const resultado = await sincronizarProduto(produto.id, falso);
      conferir("fornecedores: ok, 5 vinculos enviados e o aviso do sem CNPJ (o estrangeiro)", resultado, { ok: true, alterados: [], fornecedores: { enviados: 5, avisos: [AVISO_SEM_CNPJ] } });

      const contatosCriados = doMetodo(falso, "POST").filter((chamada) => chamada.caminho === "/contatos");
      conferir(
        "contato: so os 3 sem contato aproveitavel sao criados (o de tipo Cliente, o de outro CNPJ e o novo), com 14 digitos e o id do tipo Fornecedor lido de /contatos/tipos",
        contatosCriados.map((chamada) => ordenado(chamada.corpo)),
        [
          ordenado({ nome: "ZZ Teste BS Forn Cliente", situacao: "A", tipo: "J", numeroDocumento: "00000000000191", tiposContato: [{ id: idTipoFornecedor }] }),
          ordenado({ nome: "ZZ Teste BS Forn Novo", situacao: "A", tipo: "J", numeroDocumento: "11444777000161", tiposContato: [{ id: idTipoFornecedor }] }),
          ordenado({ nome: "ZZ Teste BS Forn Outro Doc", situacao: "A", tipo: "J", numeroDocumento: "22233344000183", tiposContato: [{ id: idTipoFornecedor }] }),
        ],
      );
      conferir("contato: os tipos sao lidos UMA vez por envio", doMetodo(falso, "GET").filter((chamada) => chamada.caminho === "/contatos/tipos").length, 1);
      conferir(
        "contato: o de nome igual so e lido (GET /contatos/{id}) quando nao tem documento; o de outro CNPJ nem e lido",
        doMetodo(falso, "GET").filter((chamada) => /^\/contatos\/\d+$/.test(chamada.caminho)).map((chamada) => chamada.caminho),
        [`/contatos/${ID_CLIENTE}`, `/contatos/${ID_NOME}`],
      );
      conferir("contato: nenhum contato existente e alterado (nenhum PUT)", doMetodo(falso, "PUT").length, 0);
      const reaproveitado = falso.estado.contatos.get(ID_NOME);
      conferir("contato achado pelo nome: reaproveitado SEM escrever nele (segue sem documento)", [reaproveitado.nome, reaproveitado.numeroDocumento], ["  zz teste bs forn NOMÉ ", ""]);

      const vinculos = doMetodo(falso, "POST").filter((chamada) => chamada.caminho === "/produtos/fornecedores");
      conferir("vinculo: um POST por fornecedor com CNPJ, todos no id do produto achado pela busca", [vinculos.length, vinculos.every((chamada) => chamada.corpo.produto.id === BLING_ID)], [5, true]);
      const vinculoDe = (contatoId) => vinculos.find((chamada) => chamada.corpo.fornecedor.id === contatoId)?.corpo;
      conferir(
        "vinculo pelo CNPJ: descricao, codigo, custo e padrao do Rise, no contato achado",
        vinculoDe(ID_CNPJ),
        { descricao: "https://exemplo.com/fc", codigo: "FC-1", precoCusto: 10, padrao: true, produto: { id: BLING_ID }, fornecedor: { id: ID_CNPJ } },
      );
      conferir("vinculo pelo nome: campo vazio no Rise nao vai (so codigo e padrao)", vinculoDe(ID_NOME), { codigo: "FN-1", padrao: false, produto: { id: BLING_ID }, fornecedor: { id: ID_NOME } });
      const idDoNovo = [...falso.estado.contatos.values()].find((contato) => contato.numeroDocumento === "11444777000161")?.id;
      conferir("vinculo do contato criado: no id que o POST /contatos devolveu, com o custo", vinculoDe(idDoNovo), { precoCusto: 7.5, padrao: false, produto: { id: BLING_ID }, fornecedor: { id: idDoNovo } });
      conferir("o Bling ficou com 5 vinculos no produto e 7 contatos (4 + 3 criados)", [[...falso.estado.vinculos.values()].filter((vinculo) => vinculo.produto.id === BLING_ID).length, falso.estado.contatos.size], [5, 7]);
      const depois = await ler(produto.id);
      conferir("fornecedores: assinatura gravada (o sem CNPJ fica fora dela, senao o selo nunca apagaria)", depois.blingAssinatura === (await assinaturaAtual(produto.id)), true);

      // A segunda sincronizacao nao duplica nada: os contatos criados agora sao achados pelo CNPJ,
      // o de nome continua pelo nome e os vinculos ja existem iguais.
      const escritasAntes = escritasDe(falso).length;
      const segunda = await sincronizarProduto(produto.id, falso);
      conferir("segunda sincronizacao: ok, nenhum enviado e NENHUMA escrita nova", [segunda.ok, segunda.fornecedores.enviados, escritasDe(falso).length - escritasAntes], [true, 0, 0]);
    }

    // --- Vinculo ja existente: igual nao escreve; diferente vai por PUT, nunca por POST ---
    {
      const produto = await criarNoRise("ZZ-BS-F2", {
        fornecedores: { create: [{ fornecedorId: fCnpj.id, codigo: "FC-1", descricao: "https://exemplo.com/fc", precoCusto: "10.00", padrao: true }] },
      });
      const vinculoNoBling = (extra) => ({ id: 17100000001, descricao: "https://exemplo.com/fc", codigo: "FC-1", precoCusto: 10, precoCompra: 0, padrao: true, produto: { id: BLING_ID }, fornecedor: { id: ID_CNPJ }, ...extra });

      const igual = novoFalso({ produtos: [noBling("ZZ-BS-F2")], contatos: contatosDoBling(), vinculos: [vinculoNoBling()] });
      const semMudar = await sincronizarProduto(produto.id, igual);
      conferir("vinculo existente e igual: ok, nenhum enviado e NENHUMA escrita", [semMudar.ok, semMudar.fornecedores.enviados, escritasDe(igual).length], [true, 0, 0]);
      conferir(
        "vinculo existente e igual: so leituras (busca, produto, contato pelo CNPJ e vinculos do produto)",
        rotasDe(igual),
        ["exigirEscrita ZZ-BS-F2", "GET /produtos", `GET /produtos/${BLING_ID}`, "GET /contatos", "GET /produtos/fornecedores"],
      );

      const diferente = novoFalso({
        produtos: [noBling("ZZ-BS-F2")],
        contatos: contatosDoBling(),
        vinculos: [vinculoNoBling({ descricao: "https://exemplo.com/velho", codigo: "VELHO", precoCusto: 8, precoCompra: 3.5, padrao: false })],
      });
      const mudou = await sincronizarProduto(produto.id, diferente);
      conferir(
        "vinculo existente e diferente: PUT no MESMO vinculo e nenhum POST de vinculo",
        [mudou.ok, mudou.fornecedores.enviados, doMetodo(diferente, "PUT").map((chamada) => chamada.caminho), doMetodo(diferente, "POST").length],
        [true, 1, ["/produtos/fornecedores/17100000001"], 0],
      );
      conferir(
        "o PUT leva o vinculo inteiro: os campos do Rise por cima e o que o Rise nao tem (precoCompra) como estava",
        ordenado(doMetodo(diferente, "PUT")[0].corpo),
        ordenado({ descricao: "https://exemplo.com/fc", codigo: "FC-1", precoCusto: 10, precoCompra: 3.5, padrao: true, produto: { id: BLING_ID }, fornecedor: { id: ID_CNPJ } }),
      );
      const escritasAntes = escritasDe(diferente).length;
      const deNovo = await sincronizarProduto(produto.id, diferente);
      conferir("e a sincronizacao seguinte nao escreve nada (o vinculo ja esta igual)", [deNovo.ok, escritasDe(diferente).length - escritasAntes, diferente.estado.vinculos.size], [true, 0, 1]);

      // Campo vazio no Rise nunca apaga o do Bling: o vinculo sem codigo, descricao e custo no Rise
      // nao difere de um vinculo do Bling que tem os tres.
      const vazio = await criarNoRise("ZZ-BS-F3", { fornecedores: { create: [{ fornecedorId: fCnpj.id, padrao: true }] } });
      const comDados = novoFalso({ produtos: [noBling("ZZ-BS-F3")], contatos: contatosDoBling(), vinculos: [vinculoNoBling({ codigo: "B1", descricao: "d", precoCusto: 5 })] });
      const naoApaga = await sincronizarProduto(vazio.id, comDados);
      conferir("vinculo com campos vazios no Rise: nao conta como diferente, nada e escrito", [naoApaga.ok, escritasDe(comDados).length], [true, 0]);
    }

    // --- Falha no vinculo de um fornecedor: os outros seguem, mas a assinatura nao avanca ---
    {
      const produto = await criarNoRise("ZZ-BS-F4", {
        fornecedores: { create: [{ fornecedorId: fCnpj.id, codigo: "FC-1", padrao: true }, { fornecedorId: fNome.id, codigo: "FN-1" }] },
      });
      const falso = novoFalso({
        produtos: [noBling("ZZ-BS-F4", { preco: 95 })],
        contatos: contatosDoBling(),
        falhas: [{ metodo: "POST", caminho: "/produtos/fornecedores", status: 400, mensagem: "Fornecedor recusado pelo Bling", vezes: 1 }],
      });
      const resultado = await sincronizarProduto(produto.id, falso);
      conferir(
        "falha no vinculo: ok false, e o erro diz qual fornecedor e a mensagem do Bling",
        [resultado.ok, casaTexto(resultado.erro, /ZZ Teste BS Forn CNPJ/), casaTexto(resultado.erro, /Fornecedor recusado pelo Bling/), casaTexto(resultado.erro, /ZZ Teste BS Forn Nome/)],
        [false, true, true, false],
      );
      conferir(
        "falha no vinculo: o outro fornecedor segue e e enviado, e o que falhou nao e repetido",
        [resultado.fornecedores.enviados, doMetodo(falso, "POST").map((chamada) => chamada.corpo.fornecedor.id)],
        [1, [ID_CNPJ, ID_NOME]],
      );
      conferir("falha no vinculo: o PATCH dos campos ja tinha ido, entao alterados e a copia ficam", [resultado.alterados, (await copiasDe(produto.id)).length], [[{ campo: "preco", de: 95, para: 90 }], 1]);
      const depois = await ler(produto.id);
      conferir("falha no vinculo: a assinatura e a data NAO sao gravadas", [depois.blingAssinatura, depois.blingSincronizadoEm], [null, null]);
    }

    // --- A conta sem o tipo de contato Fornecedor: nada e criado ---
    {
      const produto = await criarNoRise("ZZ-BS-F5", { fornecedores: { create: [{ fornecedorId: fNovo.id }] } });
      const falso = novoFalso({ produtos: [noBling("ZZ-BS-F5")], tiposDeContato: [{ id: 5, descricao: "Cliente" }] });
      const resultado = await sincronizarProduto(produto.id, falso);
      conferir("sem o tipo Fornecedor no Bling: ok false, o erro diz isso, e nenhum contato nem vinculo e criado", [resultado.ok, casaTexto(resultado.erro, /tipo de contato Fornecedor/), escritasDe(falso).length], [false, true, 0]);
    }

    // --- PATCH com falha 400: nada de copia, nada de assinatura, e para ali ---
    {
      const anterior = new Date("2026-10-01T12:00:00Z");
      const produto = await criarNoRise("ZZ-BS-E5", {
        blingAssinatura: "assinatura-antiga",
        blingSincronizadoEm: anterior,
        fornecedores: { create: [{ fornecedorId: fCnpj.id, codigo: "FC-1", padrao: true }] },
      });
      const falso = novoFalso({
        produtos: [noBling("ZZ-BS-E5", { preco: 95 })],
        contatos: contatosDoBling(),
        falhas: [{ metodo: "PATCH", caminho: "/produtos/", status: 400, mensagem: "Preco invalido" }],
      });
      const resultado = await sincronizarProduto(produto.id, falso);
      conferir("PATCH com falha 400: ok false, e o erro traz o HTTP e a mensagem do Bling", [resultado.ok, casaTexto(resultado.erro, /HTTP 400/), casaTexto(resultado.erro, /Preco invalido/)], [false, true, true]);
      conferir("PATCH com falha: nada alterado, e erro vem logo depois de ok", [resultado.alterados, Object.keys(resultado)], [[], ["ok", "erro", "alterados", "fornecedores"]]);
      conferir("PATCH com falha: para ali, sem repetir a escrita nem seguir para os fornecedores", rotasDe(falso), ["exigirEscrita ZZ-BS-E5", "GET /produtos", `GET /produtos/${BLING_ID}`, `PATCH /produtos/${BLING_ID}`]);
      const depois = await ler(produto.id);
      conferir("PATCH com falha: a assinatura e a data NAO mudam", [depois.blingAssinatura, depois.blingSincronizadoEm.getTime()], ["assinatura-antiga", anterior.getTime()]);
      conferir("PATCH com falha: nenhuma copia gravada", (await copiasDe(produto.id)).length, 0);
    }

    // --- Nome acima do limite do Bling (120): recusa, nunca corta ---
    {
      const produto = await criarNoRise("ZZ-BS-E6", { tituloBase: "N".repeat(121) });
      const falso = novoFalso({ produtos: [noBling("ZZ-BS-E6")] });
      const resultado = await sincronizarProduto(produto.id, falso);
      conferir(
        "nome com 121 caracteres: recusa (limite do Bling), sem PATCH e sem cortar o nome",
        [resultado.ok, casaTexto(resultado.erro, /120/), doMetodo(falso, "PATCH").length, falso.produto(BLING_ID).nome],
        [false, true, 0, "Motor de teste do envio"],
      );
      conferir("nome com 121: nada gravado no Rise", [(await ler(produto.id)).blingAssinatura, (await copiasDe(produto.id)).length], [null, 0]);
      await prisma.produto.update({ where: { id: produto.id }, data: { tituloBase: "N".repeat(120) } });
      const limite = await sincronizarProduto(produto.id, falso);
      conferir("nome com 120 caracteres passa, e o PATCH leva o nome inteiro", [limite.ok, doMetodo(falso, "PATCH").map((chamada) => chamada.corpo)], [true, [{ nome: "N".repeat(120) }]]);
    }

    // --- O codigo nao existe, existe duas vezes, ou o produto nao existe no Rise ---
    {
      const produto = await criarNoRise("ZZ-BS-E7");
      const vazio = novoFalso();
      const naoExiste = await sincronizarProduto(produto.id, vazio);
      // A busca so ve ativos: a mensagem lembra que o codigo pode estar inativo no Bling, para o
      // operador nao criar um duplicado de um produto que so foi inativado.
      conferir(
        "codigo que nao e achado entre os ativos do Bling: ok false, fala do inativo e do Cadastrar no Bling, nenhuma escrita",
        [naoExiste.ok, naoExiste.erro, escritasDe(vazio).length],
        [false, "O codigo nao foi achado entre os produtos ativos do Bling. Se ele esta inativo la, reative-o e use Sincronizar; senao use Cadastrar no Bling.", 0],
      );
      const duplicado = novoFalso({ produtos: [noBling("ZZ-BS-E7"), noBling("zz-bs-e7", { id: BLING_ID + 1 })] });
      const dois = await sincronizarProduto(produto.id, duplicado);
      conferir("dois produtos com o codigo no Bling: ok false citando 'mais de um', e nenhuma escrita", [dois.ok, casaTexto(dois.erro, /mais de um/), escritasDe(duplicado).length], [false, true, 0]);
      const semUso = novoFalso();
      const semProduto = await sincronizarProduto("id-que-nao-existe", semUso);
      conferir("produto que nao existe no Rise: ok false, e o Bling nem e chamado", [semProduto.ok, casaTexto(semProduto.erro, /Produto nao encontrado/), semUso.chamadas.length], [false, true, 0]);
      conferir("nada foi gravado no Rise", [(await ler(produto.id)).blingAssinatura, (await ler(produto.id)).blingSincronizadoEm], [null, null]);
      conferir("sincronizarProduto e cadastrarNoBling: o cliente e opcional (o padrao e o clienteBling())", [sincronizarProduto.length, cadastrarNoBling.length], [1, 1]);
    }

    // --- Codigo fora da lista liberada: recusa antes de QUALQUER chamada ---
    {
      const produto = await criarNoRise("ZZ-BS-E8");
      const restrito = novoFalso({ codigosLiberados: ["ZZ-OUTRO"], produtos: [noBling("ZZ-BS-E8", { preco: 95 })] });
      const sincronizar = await sincronizarProduto(produto.id, restrito);
      conferir("codigo fora da lista liberada: sincronizar recusa sem NENHUMA chamada", [sincronizar.ok, casaTexto(sincronizar.erro, /nao esta na lista de codigos liberados/), restrito.chamadas.length], [false, true, 0]);
      const cadastrar = await cadastrarNoBling(produto.id, restrito);
      conferir("codigo fora da lista liberada: cadastrar tambem", [cadastrar.ok, casaTexto(cadastrar.erro, /nao esta na lista de codigos liberados/), restrito.chamadas.length], [false, true, 0]);
      conferir("a trava foi pedida com o sku do Rise, nas duas", restrito.escritasExigidas, ["ZZ-BS-E8", "ZZ-BS-E8"]);
      const depois = await ler(produto.id);
      conferir("codigo fora da lista: nada gravado no Rise", [depois.blingAssinatura, depois.blingId], [null, null]);
    }

    // --- Cadastrar no Bling ---
    {
      const semPreco = await criarNoRise("ZZ-BS-C1", { precoVenda: null });
      const falso = novoFalso();
      const recusa = await cadastrarNoBling(semPreco.id, falso);
      conferir("cadastrar sem preco: ok false com a mensagem de validar, e nenhum POST", [recusa.ok, casaTexto(recusa.erro, /preco de venda/), doMetodo(falso, "POST").length, (await ler(semPreco.id)).blingId], [false, true, 0, null]);
      conferir("cadastrar recusado: o resultado tem so ok e erro", Object.keys(recusa), ["ok", "erro"]);
    }
    {
      const produto = await criarNoRise("ZZ-BS-C2");
      const falso = novoFalso({ produtos: [noBling("ZZ-BS-C2")] });
      const jaExiste = await cadastrarNoBling(produto.id, falso);
      conferir("cadastrar o que ja existe no Bling: ok false, manda usar Sincronizar, sem escrita", [jaExiste.ok, casaTexto(jaExiste.erro, /ja existe no Bling; use Sincronizar/), escritasDe(falso).length], [false, true, 0]);
    }
    {
      const produto = await criarNoRise("ZZ-BS-C3", { tituloBase: "N".repeat(121) });
      const falso = novoFalso();
      const longo = await cadastrarNoBling(produto.id, falso);
      conferir("cadastrar com nome de 121 caracteres: recusa sem POST", [longo.ok, casaTexto(longo.erro, /120/), escritasDe(falso).length], [false, true, 0]);
    }
    {
      const produto = await criarNoRise("ZZ-BS-C4", {
        fornecedores: { create: [{ fornecedorId: fCnpj.id, codigo: "FC-1", precoCusto: "10.00", padrao: true }, { fornecedorId: fSem.id }] },
      });
      const falso = novoFalso({ contatos: contatosDoBling() });
      const resultado = await cadastrarNoBling(produto.id, falso);
      const criado = falso.produto("ZZ-BS-C4");
      conferir("cadastrar com tudo: ok, e o blingId e o id do produto criado no Bling", [resultado.ok, typeof resultado.blingId, resultado.blingId === criado?.id, Object.keys(resultado)], [true, "number", true, ["ok", "blingId"]]);
      const depois = await ler(produto.id);
      conferir(
        "cadastrar: grava Produto.blingId (texto), a assinatura e a data, sem mexer no atualizadoEm",
        [depois.blingId, depois.blingAssinatura === (await assinaturaAtual(produto.id)), depois.blingSincronizadoEm instanceof Date, depois.atualizadoEm.getTime()],
        [String(resultado.blingId), true, true, produto.atualizadoEm.getTime()],
      );
      const posts = doMetodo(falso, "POST");
      conferir(
        "cadastrar: POST /produtos e depois o vinculo no id criado (o fornecedor sem CNPJ fica de fora)",
        posts.map((chamada) => [chamada.caminho, chamada.caminho === "/produtos" ? chamada.corpo.codigo : [chamada.corpo.produto.id === resultado.blingId, chamada.corpo.fornecedor.id]]),
        [["/produtos", "ZZ-BS-C4"], ["/produtos/fornecedores", [true, ID_CNPJ]]],
      );
      conferir("cadastrar: o corpo do POST e o montarCorpoDeCadastro do Rise normalizado", posts[0].corpo, montarCorpoDeCadastro("ZZ-BS-C4", normalizarDoRise(await lerProdutoDoRise(produto.id))));
      conferir("cadastrar: exigirEscrita e a primeira chamada", falso.chamadas[0], { metodo: "exigirEscrita", caminho: "ZZ-BS-C4" });
      conferir("cadastrar: o produto criado no Bling tem o nome, o preco, o codigo e a situacao do Rise", [criado.nome, criado.preco, criado.codigo, criado.situacao], ["Motor de teste do envio", 90, "ZZ-BS-C4", "A"]);
      // Ida e volta: logo depois de cadastrar, sincronizar nao acha diferenca nem reescreve o vinculo.
      const depoisDoCadastro = await sincronizarProduto(produto.id, falso);
      conferir(
        "sincronizar logo depois do cadastro: ok, sem PATCH e sem escrever o vinculo de novo",
        [depoisDoCadastro.ok, depoisDoCadastro.alterados, doMetodo(falso, "PATCH").length, doMetodo(falso, "PUT").length, doMetodo(falso, "POST").length],
        [true, [], 0, 0, 2],
      );
    }
    {
      const produto = await criarNoRise("ZZ-BS-C5");
      const falso = novoFalso();
      const [a, b] = await Promise.all([cadastrarNoBling(produto.id, falso), cadastrarNoBling(produto.id, falso)]);
      conferir(
        "cadastrar com clique duplo ao mesmo tempo: um cadastra e o outro e recusado (nunca dois produtos no Bling)",
        [[a.ok, b.ok].sort(), doMetodo(falso, "POST").filter((chamada) => chamada.caminho === "/produtos").length, casaTexto((a.ok ? b : a).erro, /em andamento/)],
        [[false, true], 1, true],
      );
      const depois = await cadastrarNoBling(produto.id, falso);
      conferir("cadastrar de novo depois: ja existe, use Sincronizar", [depois.ok, casaTexto(depois.erro, /ja existe/)], [false, true]);
    }
    {
      const produto = await criarNoRise("ZZ-BS-C6");
      const falso = novoFalso({ falhas: [{ metodo: "POST", caminho: "/produtos", status: 400, mensagem: "Codigo invalido" }] });
      const recusado = await cadastrarNoBling(produto.id, falso);
      const depois = await ler(produto.id);
      conferir(
        "cadastrar com o POST recusado: ok false com a mensagem do Bling, sem blingId nem assinatura",
        [recusado.ok, casaTexto(recusado.erro, /Codigo invalido/), "blingId" in recusado, depois.blingId, depois.blingAssinatura],
        [false, true, false, null, null],
      );
      conferir("cadastrar com o POST recusado: nao tenta de novo", doMetodo(falso, "POST").length, 1);
    }

    // --- Cadastrar quando o codigo existe INATIVO no Bling ---
    // A busca por codigo so ve ativos. O `blingId` guardado (da importacao) serve so de SINAL: se
    // ele aponta para um produto do mesmo codigo que nao foi excluido, criar outro duplicaria o
    // produto (o novo nasceria sem estoque, fotos e anuncios, que ficam no inativo). Nunca e o alvo
    // de escrita nenhuma.
    {
      const MENSAGEM_INATIVO = "Este codigo existe no Bling como produto inativo: reative-o la e use Sincronizar. Nada foi criado.";
      const ID_GUARDADO = 15000000301;
      const postsDeProduto = (falso) => doMetodo(falso, "POST").filter((chamada) => chamada.caminho === "/produtos");

      // Inativo: nao aparece na busca por codigo, mas responde ao GET por id (como o Bling real).
      {
        const produto = await criarNoRise("ZZ-BS-C7", { blingId: String(ID_GUARDADO) });
        const falso = novoFalso({ produtos: [noBling("ZZ-BS-C7", { id: ID_GUARDADO, situacao: "I" })] });
        conferir(
          "falso: o produto inativo nao aparece em GET /produtos?codigos[]= mas responde a GET /produtos/{id}",
          [(await falso.get("/produtos", { "codigos[]": ["ZZ-BS-C7"] })).dados.data, (await falso.get(`/produtos/${ID_GUARDADO}`)).dados.data.situacao],
          [[], "I"],
        );
        falso.chamadas.length = 0;
        const recusado = await cadastrarNoBling(produto.id, falso);
        conferir("cadastrar com o codigo INATIVO no Bling (blingId guardado): ok false com a mensagem, sem criar nada", [recusado.ok, recusado.erro, "blingId" in recusado], [false, MENSAGEM_INATIVO, false]);
        conferir(
          "cadastrar com o codigo inativo: exigirEscrita, a busca, o GET do blingId guardado e NENHUM POST",
          [rotasDe(falso), postsDeProduto(falso).length, escritasDe(falso).length],
          [["exigirEscrita ZZ-BS-C7", "GET /produtos", `GET /produtos/${ID_GUARDADO}`], 0, 0],
        );
        const depois = await ler(produto.id);
        conferir("cadastrar com o codigo inativo: o Rise fica como estava (blingId, assinatura)", [depois.blingId, depois.blingAssinatura, depois.blingSincronizadoEm], [String(ID_GUARDADO), null, null]);
      }

      // Excluido (situacao "E"): o codigo esta livre, o cadastro segue.
      {
        const produto = await criarNoRise("ZZ-BS-C8", { blingId: String(ID_GUARDADO) });
        const falso = novoFalso({ produtos: [noBling("ZZ-BS-C8", { id: ID_GUARDADO, situacao: "E" })] });
        const cadastrado = await cadastrarNoBling(produto.id, falso);
        conferir(
          "cadastrar com o blingId apontando para um produto EXCLUIDO: cadastra, num id novo",
          [cadastrado.ok, postsDeProduto(falso).length, cadastrado.blingId !== ID_GUARDADO, (await ler(produto.id)).blingId],
          [true, 1, true, String(cadastrado.blingId)],
        );
        conferir("e exigirEscrita veio antes de tudo (e do POST)", [falso.chamadas[0].metodo, falso.chamadas.findIndex((chamada) => chamada.metodo === "POST") > 0], ["exigirEscrita", true]);
      }

      // 404: o produto guardado foi apagado de verdade; o cadastro segue.
      {
        const produto = await criarNoRise("ZZ-BS-C9", { blingId: "15000009999" });
        const falso = novoFalso();
        const cadastrado = await cadastrarNoBling(produto.id, falso);
        conferir(
          "cadastrar com o blingId guardado dando 404: cadastra normalmente",
          [cadastrado.ok, rotasDe(falso).slice(0, 4), postsDeProduto(falso).length],
          [true, ["exigirEscrita ZZ-BS-C9", "GET /produtos", "GET /produtos/15000009999", "POST /produtos"], 1],
        );
      }

      // O id guardado e hoje de OUTRO codigo (inativo ou nao): nao diz nada sobre este; o cadastro segue.
      {
        const produto = await criarNoRise("ZZ-BS-CA", { blingId: String(ID_GUARDADO) });
        const falso = novoFalso({ produtos: [noBling("ZZ-BS-OUTRO", { id: ID_GUARDADO, situacao: "I" })] });
        const cadastrado = await cadastrarNoBling(produto.id, falso);
        conferir("cadastrar com o blingId guardado apontando para um produto de OUTRO codigo: cadastra", [cadastrado.ok, postsDeProduto(falso).length, falso.produto(ID_GUARDADO).codigo], [true, 1, "ZZ-BS-OUTRO"]);
      }

      // Qualquer outro erro no GET do blingId: na duvida, nao cria.
      {
        const produto = await criarNoRise("ZZ-BS-CB", { blingId: String(ID_GUARDADO) });
        const falso = novoFalso({
          produtos: [noBling("ZZ-BS-CB", { id: ID_GUARDADO, situacao: "I" })],
          falhas: [{ metodo: "GET", caminho: `/produtos/${ID_GUARDADO}`, status: 500, mensagem: "Erro interno" }],
        });
        const recusado = await cadastrarNoBling(produto.id, falso);
        conferir(
          "cadastrar com o GET do blingId guardado dando 500: ok false com o HTTP, e nenhum POST",
          [recusado.ok, casaTexto(recusado.erro, /HTTP 500/), casaTexto(recusado.erro, /Nada foi criado/), escritasDe(falso).length],
          [false, true, true, 0],
        );
        const semRede = await cadastrarNoBling(produto.id, {
          ...falso,
          get: async (caminho, params) => (caminho === `/produtos/${ID_GUARDADO}` ? Promise.reject(new Error("fetch failed")) : falso.get(caminho, params)),
        });
        conferir("e com a rede caindo nesse GET: ok false, sem POST", [semRede.ok, casaTexto(semRede.erro, /fetch failed/), escritasDe(falso).length], [false, true, 0]);
      }

      // Sem blingId guardado: nada a conferir, cadastra como sempre (o "cadastrar com tudo" acima, sem o GET extra).
      {
        const produto = await criarNoRise("ZZ-BS-CC");
        const falso = novoFalso({ produtos: [noBling("ZZ-BS-OUTRO", { id: ID_GUARDADO, situacao: "I" })] });
        const cadastrado = await cadastrarNoBling(produto.id, falso);
        conferir("cadastrar sem blingId guardado: cadastra, sem ler produto por id antes do POST", [cadastrado.ok, rotasDe(falso).slice(0, 3)], [true, ["exigirEscrita ZZ-BS-CC", "GET /produtos", "POST /produtos"]]);
      }
    }

    // --- Emenda 11, sobre TODOS os falsos do bloco ---
    {
      const PROIBIDAS = ["midia", "fornecedor", "actionEstoque", "imagemURL", "categoria", "variacoes", "estrutura", "camposCustomizados"];
      const corposDeProduto = usados.flatMap((falso) =>
        falso.chamadas.filter((chamada) => (chamada.metodo === "PATCH" && /^\/produtos\/\d+$/.test(chamada.caminho)) || (chamada.metodo === "POST" && chamada.caminho === "/produtos")),
      );
      conferir("Emenda 11: houve PATCH e POST de produto para conferir", [corposDeProduto.some((c) => c.metodo === "PATCH"), corposDeProduto.some((c) => c.metodo === "POST")], [true, true]);
      conferir(
        "Emenda 11: nenhum corpo de PATCH/POST de produto leva chave proibida (nem codigo ou situacao no PATCH)",
        corposDeProduto.flatMap((chamada) =>
          [...PROIBIDAS, ...(chamada.metodo === "PATCH" ? ["codigo", "situacao"] : [])].filter((chave) => chave in (chamada.corpo ?? {})).map((chave) => `${chamada.metodo} ${chave}`),
        ),
        [],
      );
      conferir(
        "Emenda 11: em todo falso que recebeu escrita, exigirEscrita veio antes da primeira",
        usados
          .filter((falso) => escritasDe(falso).length > 0)
          .every((falso) => {
            const trava = falso.chamadas.findIndex((chamada) => chamada.metodo === "exigirEscrita");
            const escrita = falso.chamadas.findIndex((chamada) => ESCRITAS.includes(chamada.metodo));
            return trava !== -1 && trava < escrita;
          }),
        true,
      );
      conferir(
        "Emenda 11: todo PATCH foi no id achado pela busca por codigo",
        usados.flatMap((falso) => doMetodo(falso, "PATCH")).every((chamada) => chamada.caminho === `/produtos/${BLING_ID}`),
        true,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Estoque: ajustes ao Bling e leitura dos saldos (Tarefa 9)
  // -------------------------------------------------------------------------
  {
    console.log("\nEstoque");
    await limpar();

    const casaTexto = (texto, regex) => typeof texto === "string" && regex.test(texto);
    const ESCRITAS = ["POST", "PUT", "PATCH"];
    const doMetodo = (falso, metodo) => falso.chamadas.filter((chamada) => chamada.metodo === metodo);
    const escritasDe = (falso) => falso.chamadas.filter((chamada) => ESCRITAS.includes(chamada.metodo));
    const rotasDe = (falso) => falso.chamadas.map((chamada) => `${chamada.metodo} ${chamada.caminho}`);
    const postsDeEstoque = (falso) => doMetodo(falso, "POST").filter((chamada) => chamada.caminho === "/estoques");
    const leiturasDeSaldo = (falso) => doMetodo(falso, "GET").filter((chamada) => chamada.caminho === "/estoques/saldos");
    // Todo falso dos ajustes fica guardado: no fim, os corpos de POST /estoques de todos eles sao
    // conferidos contra as chaves proibidas e a ordem da trava (Emenda 11).
    const usados = [];
    const novoFalso = (opcoes) => {
      const falso = criarBlingFalso(opcoes);
      usados.push(falso);
      return falso;
    };

    const ID_NO_BLING = 15000000401;
    // Os depositos padrao do falso sao os da conta real: "Fisico" (o padrao) e "Virtual".
    const FISICO = 14200000001;
    const VIRTUAL = 14200000002;
    const noBling = (codigo, extra = {}) => ({ id: ID_NO_BLING, codigo, nome: "Sensor de teste do estoque", preco: 10, ...extra });
    const lancamento = (operacao, quantidade, deposito = FISICO) => ({ produto: { id: ID_NO_BLING }, deposito: { id: deposito }, operacao, quantidade });

    // Os ajustes nascem com criadoEm explicito e crescente: a ordem de envio e a de criadoEm, e dois
    // movimentos criados no mesmo milissegundo empatariam. A data fica no passado: um "ja enviado"
    // com data futura pareceria enviado DURANTE a leitura dos saldos.
    const BASE = Date.parse("2026-10-01T10:00:00Z");
    const criarComPendentes = async (sku, ajustes, extra = {}) => {
      const produto = await prisma.produto.create({ data: { sku, tituloBase: "Sensor de teste do estoque", estoque: 7, ...extra } });
      for (const [indice, [tipo, quantidade]] of ajustes.entries()) {
        await prisma.movimentoEstoque.create({
          data: { produtoId: produto.id, tipo, quantidade, saldoAnterior: 0, saldoNovo: 0, criadoEm: new Date(BASE + indice * 1000) },
        });
      }
      return produto;
    };
    const movimentosDe = (produtoId) => prisma.movimentoEstoque.findMany({ where: { produtoId }, orderBy: [{ criadoEm: "asc" }, { id: "asc" }] });
    const marcados = async (produtoId) => (await movimentosDe(produtoId)).map((movimento) => movimento.enviadoAoBlingEm instanceof Date);
    const ler = (id) => prisma.produto.findUnique({ where: { id } });

    // --- ENTRADA 3 e SAIDA 1: dois POST, na ordem, no deposito padrao, marcados um a um ---
    {
      // O blingId guardado e velho de proposito: o alvo do lancamento e o id da busca por codigo (Emenda 11).
      const produto = await criarComPendentes("ZZ-BS-K1", [["ENTRADA", 3], ["SAIDA", 1]], { blingId: "424242" });
      const falso = novoFalso({ produtos: [noBling("ZZ-BS-K1")], saldos: { "ZZ-BS-K1": 5 } });
      // No instante do segundo POST o primeiro ajuste ja tem que estar marcado: a marca vem LOGO
      // depois de cada envio, e nao em lote no fim.
      const [primeiro] = await movimentosDe(produto.id);
      const primeiroMarcadoNoSegundoPost = [];
      let postsVistos = 0;
      const cliente = {
        ...falso,
        post: async (caminho, corpo) => {
          if (caminho === "/estoques" && ++postsVistos === 2) {
            primeiroMarcadoNoSegundoPost.push((await prisma.movimentoEstoque.findUnique({ where: { id: primeiro.id } })).enviadoAoBlingEm instanceof Date);
          }
          return falso.post(caminho, corpo);
        },
      };
      const movimentosAntes = await prisma.movimentoEstoque.count({ where: { produtoId: produto.id } });

      const resultado = await enviarAjustesDeEstoque(produto.id, cliente);
      conferir("ENTRADA 3 e SAIDA 1: ok, 2 enviados e 0 restantes", resultado, { ok: true, enviados: 2, restantes: 0 });
      conferir(
        "dois POST /estoques na ordem de criadoEm (E e depois S), no id da busca (nao no blingId guardado), no deposito padrao e so com as chaves do contrato",
        postsDeEstoque(falso).map((chamada) => chamada.corpo),
        [lancamento("E", 3), lancamento("S", 1)],
      );
      conferir(
        "rotas: exigirEscrita primeiro, a busca por codigo, a leitura, os depositos, os dois POST e a releitura do saldo",
        rotasDe(falso),
        ["exigirEscrita ZZ-BS-K1", "GET /produtos", `GET /produtos/${ID_NO_BLING}`, "GET /depositos", "POST /estoques", "POST /estoques", "GET /estoques/saldos"],
      );
      conferir("a releitura pede o saldo pelo codigo do Rise (codigos[])", consultaDaChamada(leiturasDeSaldo(falso)[0])["codigos[]"], ["ZZ-BS-K1"]);
      conferir("o primeiro ajuste ja estava marcado quando o segundo POST saiu", primeiroMarcadoNoSegundoPost, [true]);
      conferir("os dois enviadoAoBlingEm preenchidos", await marcados(produto.id), [true, true]);
      conferir("o Bling ficou com 5 + 3 - 1 = 7", falso.saldo("ZZ-BS-K1"), 7);
      const depois = await ler(produto.id);
      conferir(
        "releitura: grava blingSaldo 7, nao mexe no estoque do Rise (ja refletia os ajustes) nem no atualizadoEm, e o blingId guardado fica",
        [depois.blingSaldo, depois.estoque, depois.atualizadoEm.getTime(), depois.blingId],
        [7, 7, produto.atualizadoEm.getTime(), "424242"],
      );
      conferir("nenhum MovimentoEstoque criado nem apagado", await prisma.movimentoEstoque.count({ where: { produtoId: produto.id } }), movimentosAntes);

      // Clique seguinte, depois de terminar: nada pendente, nada sai.
      const chamadasAntes = falso.chamadas.length;
      const segundo = await enviarAjustesDeEstoque(produto.id, falso);
      conferir("enviar de novo: ok, 0 enviados e 0 restantes", segundo, { ok: true, enviados: 0, restantes: 0 });
      conferir("enviar de novo: so a trava, sem depositos, sem POST e sem releitura", rotasDe(falso).slice(chamadasAntes), ["exigirEscrita ZZ-BS-K1"]);
    }

    // --- BALANCO 12: operacao B, quantidade 12; a releitura traz o saldo VIRTUAL ---
    {
      const produto = await criarComPendentes("ZZ-BS-K2", [["BALANCO", 12]]);
      // Codigo em outra caixa no Bling, e 2 de reserva (fisico 5, virtual 3).
      const falso = novoFalso({ produtos: [noBling("zz-bs-k2")], saldos: { "zz-bs-k2": { virtual: 3, fisico: 5 } } });
      const resultado = await enviarAjustesDeEstoque(produto.id, falso);
      conferir("BALANCO 12: ok, um POST com operacao B e quantidade 12", [resultado, postsDeEstoque(falso).map((chamada) => chamada.corpo)], [{ ok: true, enviados: 1, restantes: 0 }, [lancamento("B", 12)]]);
      conferir(
        "o codigo do Bling em outra caixa e o mesmo produto, e a releitura grava o VIRTUAL (balanco define o fisico 12; menos 2 de reserva = 10)",
        [(await ler(produto.id)).blingSaldo, (await marcados(produto.id))],
        [10, [true]],
      );
    }

    // --- O Bling recusa o segundo (Review Focus 3): para ali, o primeiro fica marcado, o segundo pendente ---
    {
      const produto = await criarComPendentes("ZZ-BS-K3", [["ENTRADA", 2], ["SAIDA", 9]]);
      const falso = novoFalso({
        produtos: [noBling("ZZ-BS-K3")],
        saldos: { "ZZ-BS-K3": 4 },
        falhas: [{ metodo: "POST", caminho: "/estoques", status: 400, mensagem: "Saldo insuficiente no deposito", depois: 1 }],
      });
      const resultado = await enviarAjustesDeEstoque(produto.id, falso);
      conferir("falha 400 no segundo: ok false, enviados 1, restantes 1, e erro logo depois de ok", [resultado.ok, resultado.enviados, resultado.restantes, Object.keys(resultado)], [false, 1, 1, ["ok", "erro", "enviados", "restantes"]]);
      conferir(
        "o erro e legivel: qual ajuste, o HTTP, a mensagem do Bling, e quantos foram e quantos ficaram",
        [casaTexto(resultado.erro, /ajuste 2 de 2/), casaTexto(resultado.erro, /saida de 9/), casaTexto(resultado.erro, /HTTP 400/), casaTexto(resultado.erro, /Saldo insuficiente no deposito/), casaTexto(resultado.erro, /1 ajuste\(s\) enviado\(s\)/), casaTexto(resultado.erro, /1 continua\(m\) pendente\(s\)/)],
        [true, true, true, true, true, true],
      );
      conferir("o primeiro marcado e o segundo AINDA nulo", await marcados(produto.id), [true, false]);
      conferir("escrita nao tenta de novo: dois POST, o segundo recusado uma vez so", postsDeEstoque(falso).map((chamada) => chamada.corpo.operacao), ["E", "S"]);
      conferir(
        "mesmo parando na falha, relê o saldo (ja tinha enviado um) e grava blingSaldo 4 + 2 = 6",
        [rotasDe(falso).at(-1), (await ler(produto.id)).blingSaldo],
        ["GET /estoques/saldos", 6],
      );
      // O envio seguinte manda so o que ficou, na mesma ordem.
      const deNovo = novoFalso({ produtos: [noBling("ZZ-BS-K3")], saldos: { "ZZ-BS-K3": 20 } });
      const seguinte = await enviarAjustesDeEstoque(produto.id, deNovo);
      conferir("envio seguinte: so o que ficou pendente (a SAIDA 9)", [seguinte, postsDeEstoque(deNovo).map((chamada) => chamada.corpo)], [{ ok: true, enviados: 1, restantes: 0 }, [lancamento("S", 9)]]);
      conferir("e agora os dois estao marcados", await marcados(produto.id), [true, true]);
    }

    // --- Rede caindo no POST: nao marca, nao repete, e manda conferir no Bling ---
    {
      const produto = await criarComPendentes("ZZ-BS-K4", [["ENTRADA", 1], ["ENTRADA", 2]]);
      const falso = novoFalso({ produtos: [noBling("ZZ-BS-K4")] });
      let tentativas = 0;
      const cliente = {
        ...falso,
        post: async (caminho, corpo) => {
          if (caminho === "/estoques") {
            tentativas++;
            throw new Error("fetch failed");
          }
          return falso.post(caminho, corpo);
        },
      };
      const resultado = await enviarAjustesDeEstoque(produto.id, cliente);
      conferir(
        "rede caindo no POST: ok false, o erro traz a causa e manda conferir no Bling, uma tentativa so",
        [resultado.ok, resultado.enviados, resultado.restantes, casaTexto(resultado.erro, /fetch failed/), casaTexto(resultado.erro, /confira no Bling/), tentativas],
        [false, 0, 2, true, true, 1],
      );
      conferir("rede caindo: nada marcado e, sem nada enviado, sem releitura", [await marcados(produto.id), leiturasDeSaldo(falso).length, (await ler(produto.id)).blingSaldo], [[false, false], 0, null]);
    }

    // --- O ajuste some do Rise entre o POST e a marca: para ali, sem mandar o seguinte ---
    {
      const produto = await criarComPendentes("ZZ-BS-K5", [["ENTRADA", 1], ["ENTRADA", 2]]);
      const falso = novoFalso({ produtos: [noBling("ZZ-BS-K5")], saldos: { "ZZ-BS-K5": 1 } });
      const [primeiro] = await movimentosDe(produto.id);
      const cliente = {
        ...falso,
        post: async (caminho, corpo) => {
          const resposta = await falso.post(caminho, corpo);
          if (caminho === "/estoques") await prisma.movimentoEstoque.deleteMany({ where: { id: primeiro.id } });
          return resposta;
        },
      };
      const resultado = await enviarAjustesDeEstoque(produto.id, cliente);
      conferir(
        "ajuste que some antes da marca: ok false, o erro diz que o Bling aceitou mas ele nao estava mais pendente, e o seguinte NAO sai",
        [resultado.ok, resultado.enviados, resultado.restantes, casaTexto(resultado.erro, /nao estava mais pendente/), postsDeEstoque(falso).length],
        [false, 1, 1, true, 1],
      );
      conferir("o seguinte continua pendente, e o saldo foi relido (2)", [await marcados(produto.id), (await ler(produto.id)).blingSaldo], [[false], 2]);
    }

    // --- A releitura falha: os ajustes foram, ok true, e um aviso diz que o saldo nao foi relido ---
    {
      const produto = await criarComPendentes("ZZ-BS-K6", [["SAIDA", 1]]);
      const falso = novoFalso({
        produtos: [noBling("ZZ-BS-K6")],
        saldos: { "ZZ-BS-K6": 3 },
        falhas: [{ metodo: "GET", caminho: "/estoques/saldos", status: 500, mensagem: "Erro interno" }],
      });
      const resultado = await enviarAjustesDeEstoque(produto.id, falso);
      conferir(
        "releitura com HTTP 500: ok true (o ajuste foi), e o aviso diz que o saldo nao foi relido, com o HTTP",
        [resultado.ok, resultado.enviados, resultado.restantes, casaTexto(resultado.aviso, /saldo/), casaTexto(resultado.aviso, /HTTP 500/), Object.keys(resultado)],
        [true, 1, 0, true, true, ["ok", "enviados", "restantes", "aviso"]],
      );
      conferir("releitura com falha: o ajuste ficou marcado e o blingSaldo nao mudou", [await marcados(produto.id), (await ler(produto.id)).blingSaldo], [[true], null]);

      // O saldo relido tem que ser do MESMO produto da busca (id e codigo): um item com o codigo
      // certo e outro id nao e o produto em que os ajustes foram lancados (Emenda 11).
      const outro = await criarComPendentes("ZZ-BS-K6B", [["SAIDA", 1]]);
      const certo = novoFalso({ produtos: [noBling("ZZ-BS-K6B")], saldos: { "ZZ-BS-K6B": 3 } });
      const cliente = {
        ...certo,
        get: async (caminho, params) =>
          caminho === "/estoques/saldos"
            ? { ok: true, status: 200, duracaoMs: 0, dados: { data: [{ produto: { id: ID_NO_BLING + 7, codigo: "ZZ-BS-K6B" }, saldoVirtualTotal: 77 }] } }
            : certo.get(caminho, params),
      };
      const deOutroId = await enviarAjustesDeEstoque(outro.id, cliente);
      conferir(
        "releitura devolvendo o codigo com OUTRO id: o saldo nao e gravado, e o aviso diz que o Bling nao devolveu o saldo deste produto",
        [deOutroId.ok, casaTexto(deOutroId.aviso, /nao devolveu o saldo deste produto/), (await ler(outro.id)).blingSaldo],
        [true, true, null],
      );
    }

    // --- Depositos: dois sem padrao pedem a escolha; o escolhido vale; um so vale; nenhum recusa ---
    {
      const LOJA = 14300000001;
      const GALPAO = 14300000002;
      const doisSemPadrao = [
        { id: LOJA, descricao: "Loja", situacao: 1, padrao: false, desconsiderarSaldo: false },
        { id: GALPAO, descricao: "Galpao", situacao: 1, padrao: false, desconsiderarSaldo: false },
      ];
      const produto = await criarComPendentes("ZZ-BS-K7", [["ENTRADA", 1], ["SAIDA", 1]]);
      const falso = novoFalso({ produtos: [noBling("ZZ-BS-K7")], depositos: doisSemPadrao, saldos: { "ZZ-BS-K7": 5 } });
      const pergunta = await enviarAjustesDeEstoque(produto.id, falso);
      conferir(
        "dois depositos sem padrao: ok false, precisaDeposito com id e descricao de cada, nada enviado",
        [pergunta.ok, pergunta.enviados, pergunta.restantes, pergunta.precisaDeposito, casaTexto(pergunta.erro, /escolha/)],
        [false, 0, 2, [{ id: LOJA, descricao: "Loja" }, { id: GALPAO, descricao: "Galpao" }], true],
      );
      conferir("dois depositos sem padrao: falso.chamadas sem nenhum POST, e nada marcado", [escritasDe(falso).length, await marcados(produto.id)], [0, [false, false]]);
      const escolhido = await enviarAjustesDeEstoque(produto.id, falso, { depositoId: GALPAO });
      conferir("com depositoId informado: envia os dois nele", [escolhido, postsDeEstoque(falso).map((chamada) => chamada.corpo)], [{ ok: true, enviados: 2, restantes: 0 }, [lancamento("E", 1, GALPAO), lancamento("S", 1, GALPAO)]]);

      // O escolhido vence o padrao, e pode chegar como texto (vem da tela).
      const outro = await criarComPendentes("ZZ-BS-K8", [["ENTRADA", 4]]);
      const comPadrao = novoFalso({ produtos: [noBling("ZZ-BS-K8")] });
      const noVirtual = await enviarAjustesDeEstoque(outro.id, comPadrao, { depositoId: String(VIRTUAL) });
      conferir("depositoId (em texto) vence o padrao", [noVirtual.ok, postsDeEstoque(comPadrao).map((chamada) => chamada.corpo.deposito.id)], [true, [VIRTUAL]]);

      // Deposito que o Bling nao tem: recusa sem POST.
      const terceiro = await criarComPendentes("ZZ-BS-K9", [["ENTRADA", 4]]);
      const semEsse = novoFalso({ produtos: [noBling("ZZ-BS-K9")] });
      const inexistente = await enviarAjustesDeEstoque(terceiro.id, semEsse, { depositoId: 99 });
      conferir("depositoId que o Bling nao tem: ok false, sem POST, nada marcado", [inexistente.ok, casaTexto(inexistente.erro, /99/), escritasDe(semEsse).length, await marcados(terceiro.id)], [false, true, 0, [false]]);
      const invalido = await enviarAjustesDeEstoque(terceiro.id, semEsse, { depositoId: "abc" });
      conferir("depositoId invalido: ok false, sem POST", [invalido.ok, escritasDe(semEsse).length], [false, 0]);

      // Um deposito so, sem padrao: e ele.
      const quarto = await criarComPendentes("ZZ-BS-KA", [["ENTRADA", 4]]);
      const umSo = novoFalso({ produtos: [noBling("ZZ-BS-KA")], depositos: [doisSemPadrao[0]] });
      const unico = await enviarAjustesDeEstoque(quarto.id, umSo);
      conferir("um deposito so, sem padrao: envia nele", [unico.ok, postsDeEstoque(umSo).map((chamada) => chamada.corpo.deposito.id)], [true, [LOJA]]);

      // Nenhum deposito: recusa, com o motivo, sem POST.
      const quinto = await criarComPendentes("ZZ-BS-KB", [["ENTRADA", 4]]);
      const nenhum = novoFalso({ produtos: [noBling("ZZ-BS-KB")], depositos: [] });
      const semDeposito = await enviarAjustesDeEstoque(quinto.id, nenhum);
      conferir("nenhum deposito no Bling: ok false citando o deposito, sem POST", [semDeposito.ok, casaTexto(semDeposito.erro, /deposito/), escritasDe(nenhum).length, semDeposito.restantes], [false, true, 0, 1]);
    }

    // --- Travas: codigo fora da lista e BLING_ESCRITA desligada recusam antes de QUALQUER chamada ---
    {
      const produto = await criarComPendentes("ZZ-BS-KC", [["ENTRADA", 1]]);
      const restrito = novoFalso({ codigosLiberados: ["ZZ-OUTRO"], produtos: [noBling("ZZ-BS-KC")] });
      const recusado = await enviarAjustesDeEstoque(produto.id, restrito);
      conferir(
        "codigo fora da lista liberada: ok false, nenhuma chamada, nada marcado, restantes 1",
        [recusado.ok, casaTexto(recusado.erro, /nao esta na lista de codigos liberados/), restrito.chamadas.length, await marcados(produto.id), recusado.restantes, restrito.escritasExigidas],
        [false, true, 0, [false], 1, ["ZZ-BS-KC"]],
      );

      // A trava geral de verdade (a do .env), com o resto do cliente falso: nunca ha rede aqui.
      const travaOriginal = config.travas.blingEscrita;
      config.travas.blingEscrita = false;
      try {
        const falso = novoFalso({ produtos: [noBling("ZZ-BS-KC")] });
        const desligada = await enviarAjustesDeEstoque(produto.id, { ...falso, exigirEscrita: clienteBling().exigirEscrita });
        conferir(
          "BLING_ESCRITA desligada: ok false com o motivo, nenhuma chamada ao Bling, nada marcado",
          [desligada.ok, casaTexto(desligada.erro, /BLING_ESCRITA esta false/), falso.chamadas.length, await marcados(produto.id)],
          [false, true, 0, [false]],
        );
      } finally {
        config.travas.blingEscrita = travaOriginal;
      }
    }

    // --- Sem pendentes; codigo que nao existe ou existe duas vezes; produto que nao existe no Rise ---
    {
      const semPendentes = await criarComPendentes("ZZ-BS-KD", []);
      // Um movimento JA enviado nao e pendente.
      await prisma.movimentoEstoque.create({ data: { produtoId: semPendentes.id, tipo: "ENTRADA", quantidade: 5, saldoAnterior: 0, saldoNovo: 5, enviadoAoBlingEm: new Date(BASE) } });
      const falso = novoFalso({ produtos: [noBling("ZZ-BS-KD")] });
      const nada = await enviarAjustesDeEstoque(semPendentes.id, falso);
      conferir("sem pendentes: ok, 0 e 0, e so a trava (sem busca, sem depositos, sem POST, sem releitura)", [nada, rotasDe(falso)], [{ ok: true, enviados: 0, restantes: 0 }, ["exigirEscrita ZZ-BS-KD"]]);

      const produto = await criarComPendentes("ZZ-BS-KE", [["SAIDA", 1]]);
      const vazio = novoFalso();
      const naoExiste = await enviarAjustesDeEstoque(produto.id, vazio);
      conferir("codigo que nao esta entre os ativos do Bling: ok false, sem POST, restantes 1", [naoExiste.ok, casaTexto(naoExiste.erro, /nao foi achado/), escritasDe(vazio).length, naoExiste.restantes], [false, true, 0, 1]);
      const duplicado = novoFalso({ produtos: [noBling("ZZ-BS-KE"), noBling("zz-bs-ke", { id: ID_NO_BLING + 1 })] });
      const dois = await enviarAjustesDeEstoque(produto.id, duplicado);
      conferir("codigo duas vezes no Bling: ok false citando 'mais de um', sem POST", [dois.ok, casaTexto(dois.erro, /mais de um/), escritasDe(duplicado).length], [false, true, 0]);
      conferir("e o ajuste continua pendente", await marcados(produto.id), [false]);

      const semUso = novoFalso();
      const semProduto = await enviarAjustesDeEstoque("id-que-nao-existe", semUso);
      conferir("produto que nao existe no Rise: ok false, e o Bling nem e chamado", [semProduto, semUso.chamadas.length], [{ ok: false, erro: "Produto nao encontrado no Rise.", enviados: 0, restantes: 0 }, 0]);
      conferir("enviarAjustesDeEstoque e sincronizarEstoqueDoBling: o cliente e opcional (o padrao e o clienteBling())", [enviarAjustesDeEstoque.length, sincronizarEstoqueDoBling.length], [1, 0]);
    }

    // --- Clique duplo ao mesmo tempo: cada ajuste vai uma vez so ---
    {
      const produto = await criarComPendentes("ZZ-BS-KF", [["ENTRADA", 1], ["SAIDA", 1]]);
      const falso = novoFalso({ produtos: [noBling("ZZ-BS-KF")], saldos: { "ZZ-BS-KF": 5 } });
      const [a, b] = await Promise.all([enviarAjustesDeEstoque(produto.id, falso), enviarAjustesDeEstoque(produto.id, falso)]);
      conferir(
        "clique duplo ao mesmo tempo: um envia os dois e o outro e recusado por haver envio em andamento",
        [[a.ok, b.ok].sort(), (a.ok ? a : b).enviados, casaTexto((a.ok ? b : a).erro, /em andamento/), (a.ok ? b : a).enviados],
        [[false, true], 2, true, 0],
      );
      conferir("clique duplo: cada ajuste foi UMA vez so (dois POST) e o Bling ficou com 5", [postsDeEstoque(falso).map((chamada) => chamada.corpo.operacao), falso.saldo("ZZ-BS-KF")], [["E", "S"], 5]);
      conferir("e depois de terminar a trava sai: o seguinte corre (nada pendente)", await enviarAjustesDeEstoque(produto.id, falso), { ok: true, enviados: 0, restantes: 0 });
    }

    // --- Emenda 11, sobre TODOS os falsos dos ajustes ---
    {
      const lancamentos = usados.flatMap((falso) => postsDeEstoque(falso));
      conferir("Emenda 11: houve POST /estoques para conferir", lancamentos.length > 0, true);
      conferir(
        "Emenda 11: todo corpo de POST /estoques tem SO produto, deposito, operacao e quantidade (nada de actionEstoque nem outra chave)",
        [...new Set(lancamentos.map((chamada) => Object.keys(chamada.corpo).sort().join(",")))],
        ["deposito,operacao,produto,quantidade"],
      );
      conferir(
        "Emenda 11: nenhum corpo leva chave proibida",
        lancamentos.flatMap((chamada) => ["actionEstoque", "midia", "fornecedor", "imagemURL", "categoria", "variacoes", "estrutura", "camposCustomizados", "codigo", "situacao"].filter((chave) => chave in chamada.corpo)),
        [],
      );
      conferir("Emenda 11: todo lancamento foi no id achado pela busca por codigo", lancamentos.every((chamada) => chamada.corpo.produto.id === ID_NO_BLING), true);
      conferir(
        "Emenda 11: em todo falso que recebeu escrita, exigirEscrita e a primeira chamada e vem antes da primeira escrita",
        usados
          .filter((falso) => escritasDe(falso).length > 0)
          .every((falso) => falso.chamadas[0].metodo === "exigirEscrita" && falso.chamadas.findIndex((chamada) => ESCRITAS.includes(chamada.metodo)) > 0),
        true,
      );
      conferir("Emenda 11: os ajustes nunca escrevem outra coisa que POST /estoques", usados.flatMap((falso) => escritasDe(falso)).every((chamada) => chamada.metodo === "POST" && chamada.caminho === "/estoques"), true);
    }

    // --- Leitura dos saldos: 150 produtos em lotes de 100, SO leitura ---
    const QUANTOS = 150;
    const skus = Array.from({ length: QUANTOS }, (_, indice) => `ZZ-BS-S${String(indice + 1).padStart(3, "0")}`);
    await prisma.produto.createMany({ data: skus.map((sku) => ({ sku, tituloBase: "Saldo de teste", estoque: 7 })) });
    const produtosS = await prisma.produto.findMany({ where: { sku: { in: skus } }, orderBy: { sku: "asc" } });
    const porSku = Object.fromEntries(produtosS.map((produto) => [produto.sku, produto]));
    const idsS = produtosS.map((produto) => produto.id);
    const movimento = (sku, tipo, quantidade, segundos, enviadoAoBlingEm = null) => ({
      produtoId: porSku[sku].id, tipo, quantidade, saldoAnterior: 0, saldoNovo: 0, criadoEm: new Date(BASE + segundos * 1000), enviadoAoBlingEm,
    });
    await prisma.movimentoEstoque.createMany({
      data: [
        movimento("ZZ-BS-S001", "SAIDA", 2, 0),
        // Na ordem: entrada, balanco, saida (5 + 3 -> 12 -> 11). Criados fora de ordem de proposito.
        movimento("ZZ-BS-S007", "SAIDA", 1, 3),
        movimento("ZZ-BS-S007", "ENTRADA", 3, 1),
        movimento("ZZ-BS-S007", "BALANCO", 12, 2),
        // Um ja enviado (nao conta) e um pendente.
        movimento("ZZ-BS-S008", "SAIDA", 5, 0, new Date(BASE)),
        movimento("ZZ-BS-S008", "ENTRADA", 1, 1),
      ],
    });
    // No Bling: S003 nao existe, S004 esta inativo, S005 tem o codigo em minusculas; os saldos
    // especiais (10, -8, 4,6) e os demais = posicao.
    const especiais = { "ZZ-BS-S001": 10, "ZZ-BS-S002": -8, "ZZ-BS-S006": 4.6, "ZZ-BS-S007": 5, "ZZ-BS-S008": 10 };
    const blingDosSaldos = (somar = 0) => {
      const produtos = [];
      const saldos = {};
      skus.forEach((sku, indice) => {
        if (sku === "ZZ-BS-S003") return;
        const codigo = sku === "ZZ-BS-S005" ? sku.toLowerCase() : sku;
        produtos.push({ id: 15000001000 + indice, codigo, nome: `Saldo ${sku}`, ...(sku === "ZZ-BS-S004" ? { situacao: "I" } : {}) });
        saldos[codigo] = (especiais[sku] ?? indice + 1) + somar;
      });
      return { produtos, saldos };
    };
    const lerS = async (sku) => {
      const lido = await prisma.produto.findUnique({ where: { sku } });
      return [lido.blingSaldo, lido.estoque];
    };
    const movimentosS = () => prisma.movimentoEstoque.findMany({ where: { produtoId: { in: idsS } }, orderBy: { id: "asc" } });

    {
      const falso = criarBlingFalso(blingDosSaldos());
      const movimentosAntes = await movimentosS();
      const resultado = await sincronizarEstoqueDoBling(falso, { produtoIds: idsS });
      conferir("150 produtos: 148 atualizados, 2 sem codigo no Bling (o que nao existe e o inativo), nenhuma falha", resultado, { atualizados: 148, semCodigoNoBling: 2, falhas: [] });
      conferir(
        "exatamente 2 chamadas a /estoques/saldos, com codigos[] (100 + 50), na ordem do codigo",
        leiturasDeSaldo(falso).map((chamada) => consultaDaChamada(chamada)["codigos[]"]),
        [skus.slice(0, 100), skus.slice(100)],
      );
      conferir("so leitura: nenhuma outra chamada, nenhum exigirEscrita e nenhuma escrita", [falso.chamadas.length, falso.escritasExigidas, escritasDe(falso).length], [2, [], 0]);
      conferir("[SAIDA 2] pendente e saldo 10 no Bling: blingSaldo 10 e estoque 8", await lerS("ZZ-BS-S001"), [10, 8]);
      conferir("saldo -8 no Bling: blingSaldo -8 e estoque 0", await lerS("ZZ-BS-S002"), [-8, 0]);
      conferir("codigo que nao existe no Bling: estoque mantido e blingSaldo continua nulo", await lerS("ZZ-BS-S003"), [null, 7]);
      conferir("produto inativo no Bling (codigos[] nao o resolve): estoque mantido", await lerS("ZZ-BS-S004"), [null, 7]);
      conferir("codigo em outra caixa no Bling: casa sem diferenciar caixa", await lerS("ZZ-BS-S005"), [5, 5]);
      conferir("saldo fracionario (4,6): blingSaldo inteiro arredondado (5)", await lerS("ZZ-BS-S006"), [5, 5]);
      conferir("pendentes aplicados na ordem de criadoEm (5 + 3 -> balanco 12 -> - 1 = 11)", await lerS("ZZ-BS-S007"), [5, 11]);
      conferir("ajuste ja enviado nao conta, so o pendente (10 + 1)", await lerS("ZZ-BS-S008"), [10, 11]);
      conferir("o ultimo do segundo lote tambem (150)", await lerS("ZZ-BS-S150"), [150, 150]);
      const movimentosDepois = await movimentosS();
      conferir(
        "MovimentoEstoque nao ganha linha, e os pendentes continuam pendentes",
        [movimentosDepois.length, movimentosDepois.map((m) => [m.id, m.enviadoAoBlingEm?.getTime() ?? null])],
        [movimentosAntes.length, movimentosAntes.map((m) => [m.id, m.enviadoAoBlingEm?.getTime() ?? null])],
      );
      const depois = await prisma.produto.findMany({ where: { id: { in: idsS } }, orderBy: { sku: "asc" } });
      conferir("o atualizadoEm de nenhum dos 150 muda (ler o saldo nao e editar)", depois.every((produto) => produto.atualizadoEm.getTime() === porSku[produto.sku].atualizadoEm.getTime()), true);
    }

    // --- Lote em que NENHUM codigo existe: HTTP 400 do falso, nao e falha ---
    {
      const vazio = criarBlingFalso();
      const statusVistos = [];
      const cliente = {
        ...vazio,
        get: async (caminho, params) => {
          const resposta = await vazio.get(caminho, params);
          statusVistos.push(resposta.status);
          return resposta;
        },
      };
      const antes = await Promise.all(["ZZ-BS-S001", "ZZ-BS-S002", "ZZ-BS-S003"].map(lerS));
      const resultado = await sincronizarEstoqueDoBling(cliente, { produtoIds: idsS.slice(0, 3) });
      conferir("lote sem nenhum codigo no Bling: o falso respondeu 400, e o resultado conta os 3 em semCodigoNoBling, sem falha", [statusVistos, resultado], [[400], { atualizados: 0, semCodigoNoBling: 3, falhas: [] }]);
      conferir("e nenhum dos 3 teve o estoque alterado", await Promise.all(["ZZ-BS-S001", "ZZ-BS-S002", "ZZ-BS-S003"].map(lerS)), antes);
    }

    // --- Erro num lote (HTTP 500, 400 de outro motivo, rede): falhas por produto, e o lote seguinte segue ---
    {
      // Cada rodada soma outro valor aos saldos do Bling, para provar que o lote 2 foi regravado NELA.
      const comErro = async (rotulo, somar, criar) => {
        const antesDoPrimeiro = await lerS("ZZ-BS-S001");
        const { cliente, falso } = criar(blingDosSaldos(somar));
        const resultado = await sincronizarEstoqueDoBling(cliente, { produtoIds: idsS });
        conferir(
          `${rotulo}: 100 falhas (o lote 1 inteiro, um item por produto com o sku), 50 atualizados (o lote 2 segue)`,
          [resultado.atualizados, resultado.semCodigoNoBling, resultado.falhas.length, resultado.falhas.map((falha) => falha.sku).join() === skus.slice(0, 100).join()],
          [50, 0, 100, true],
        );
        conferir(`${rotulo}: duas leituras, nenhuma escrita`, [leiturasDeSaldo(falso).length, escritasDe(falso).length, falso.escritasExigidas], [2, 0, []]);
        conferir(`${rotulo}: o lote que falhou nao muda, o seguinte sim (saldo + ${somar})`, [await lerS("ZZ-BS-S001"), await lerS("ZZ-BS-S150")], [antesDoPrimeiro, [150 + somar, 150 + somar]]);
        return resultado.falhas[0].erro;
      };
      const erro500 = await comErro("lote com HTTP 500", 100, (bling) => {
        const falso = criarBlingFalso({ ...bling, falhas: [{ metodo: "GET", caminho: "/estoques/saldos", status: 500, mensagem: "Erro interno do Bling", vezes: 1 }] });
        return { cliente: falso, falso };
      });
      conferir("lote com HTTP 500: o erro e legivel (HTTP e mensagem do Bling)", [casaTexto(erro500, /HTTP 500/), casaTexto(erro500, /Erro interno do Bling/)], [true, true]);
      const erro400 = await comErro("lote com HTTP 400 de outro motivo", 200, (bling) => {
        const falso = criarBlingFalso({ ...bling, falhas: [{ metodo: "GET", caminho: "/estoques/saldos", status: 400, mensagem: "Parametro invalido", vezes: 1 }] });
        return { cliente: falso, falso };
      });
      conferir("lote com HTTP 400 que nao e 'nenhum produto': e falha, com a mensagem", casaTexto(erro400, /Parametro invalido/), true);
      const erroRede = await comErro("lote com a rede caindo", 300, (bling) => {
        const falso = criarBlingFalso(bling);
        let primeira = true;
        const cliente = {
          ...falso,
          get: async (caminho, params) => {
            if (caminho === "/estoques/saldos" && primeira) {
              primeira = false;
              falso.chamadas.push({ metodo: "GET", caminho, corpo: params });
              throw new Error("fetch failed");
            }
            return falso.get(caminho, params);
          },
        };
        return { cliente, falso };
      });
      conferir("lote com a rede caindo: o erro traz a causa", casaTexto(erroRede, /fetch failed/), true);
    }

    // --- O mesmo codigo duas vezes no Bling: falha so desse produto, sem escolher um ---
    {
      const produto = await prisma.produto.create({ data: { sku: "ZZ-BS-D1", tituloBase: "Saldo duplicado", estoque: 7 } });
      const outro = await prisma.produto.create({ data: { sku: "ZZ-BS-D2", tituloBase: "Saldo normal", estoque: 7 } });
      const falso = criarBlingFalso({
        produtos: [{ id: 15000002001, codigo: "ZZ-BS-D1", nome: "a" }, { id: 15000002002, codigo: "zz-bs-d1", nome: "b" }, { id: 15000002003, codigo: "ZZ-BS-D2", nome: "c" }],
        saldos: { "ZZ-BS-D1": 3, "zz-bs-d1": 9, "ZZ-BS-D2": 4 },
      });
      const resultado = await sincronizarEstoqueDoBling(falso, { produtoIds: [produto.id, outro.id] });
      conferir(
        "codigo duas vezes no Bling: falha so desse produto (citando 'mais de um'), o outro e atualizado",
        [resultado.atualizados, resultado.semCodigoNoBling, resultado.falhas.map((falha) => [falha.sku, casaTexto(falha.erro, /mais de um/)])],
        [1, 0, [["ZZ-BS-D1", true]]],
      );
      conferir("o duplicado fica como estava; o outro ganha o saldo", [await lerS("ZZ-BS-D1"), await lerS("ZZ-BS-D2")], [[null, 7], [4, 4]]);
    }

    // --- Um ajuste enviado ao Bling ENQUANTO o saldo era lido: esse produto nao e regravado ---
    {
      const produto = await criarComPendentes("ZZ-BS-R1", [["SAIDA", 1]]);
      const outro = await criarComPendentes("ZZ-BS-R2", [["SAIDA", 1]]);
      const falso = criarBlingFalso({ produtos: [{ id: 15000003001, codigo: "ZZ-BS-R1", nome: "a" }, { id: 15000003002, codigo: "ZZ-BS-R2", nome: "b" }], saldos: { "ZZ-BS-R1": 9, "ZZ-BS-R2": 9 } });
      const cliente = {
        ...falso,
        get: async (caminho, params) => {
          // O saldo devolvido pode ou nao conter esse ajuste: o Rise nao tem como saber.
          await prisma.movimentoEstoque.updateMany({ where: { produtoId: produto.id }, data: { enviadoAoBlingEm: new Date() } });
          return falso.get(caminho, params);
        },
      };
      const resultado = await sincronizarEstoqueDoBling(cliente, { produtoIds: [produto.id, outro.id] });
      conferir(
        "ajuste enviado durante a leitura: falha desse produto, dizendo para atualizar de novo; o outro e atualizado",
        [resultado.atualizados, resultado.falhas.map((falha) => [falha.sku, casaTexto(falha.erro, /de novo/)])],
        [1, [["ZZ-BS-R1", true]]],
      );
      conferir("o produto do ajuste em andamento fica como estava; o outro: 9 - 1 = 8", [await lerS("ZZ-BS-R1"), await lerS("ZZ-BS-R2")], [[null, 7], [9, 8]]);
    }

    // --- Lista de produtos vazia: nada a pedir ---
    {
      const falso = criarBlingFalso();
      conferir("produtoIds vazio: nada atualizado e nenhuma chamada", [await sincronizarEstoqueDoBling(falso, { produtoIds: [] }), falso.chamadas.length], [{ atualizados: 0, semCodigoNoBling: 0, falhas: [] }, 0]);
    }
  }

  // Blocos das tarefas seguintes entram aqui, antes do finally.
} finally {
  await limpar();
  await prisma.$disconnect();
}

console.log(falhas === 0 ? "\nTodos os testes da sincronizacao com o Bling OK." : `\n${falhas} FALHA(S).`);
process.exit(falhas === 0 ? 0 : 1);
