import "dotenv/config";

/**
 * Testes do AliExpress no modulo Compras (spec 2026-10-28-aliexpress-em-compras-design.md): regras puras, a chave da
 * extensao, a importacao, o casamento com o produto e o deposito Virtual contra um Bling falso. SEM rede.
 *
 *   npm run teste:aliexpress            (apaga o que criou no fim)
 *   npm run teste:aliexpress -- --manter (deixa os ZZ no banco, para conferir a tela)
 *
 * So escreve produtos ZZ-ALI-*, fornecedores "ZZ Ali *" e os pedidos deles, apagados no comeco e no fim. O fornecedor
 * marcado como o do AliExpress (o "Ali" do dono) e a conexao ALIEXPRESS voltam ao que eram.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const manter = process.argv.includes("--manter");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

// ---------------------------------------------------------------------------
// Regras puras (sem banco)
// ---------------------------------------------------------------------------

const regras = await import("../src/lib/compras/aliexpress/regras.js");
{
  const {
    lerPreco,
    lerData,
    anuncioDoLink,
    codigoDoVinculo,
    situacaoDoAliExpress,
    statusNoRise,
    avisosDoPedido,
    quantidadeNoRise,
    precoNoRise,
    precoMedioPonderado,
    descontoImplicito,
    pacoteDaLinha,
    decidirCasamento,
    formatarDataCurta,
  } = regras;
  console.log("\nRegras puras do AliExpress");
  conferir("preco", [lerPreco("R$57,49"), lerPreco("R$ 1.234,56"), lerPreco("US $1.00"), lerPreco(""), lerPreco(null)], [57.49, 1234.56, null, null, null]);
  conferir(
    "data",
    [lerData("26 out, 2026")?.toISOString(), lerData("2026-10-26")?.toISOString().slice(0, 10), lerData("3 fev, 2027")?.toISOString().slice(0, 10), lerData("Hoje")],
    ["2026-10-26T12:00:00.000Z", "2026-10-26", "2027-02-03", null],
  );
  conferir(
    "anuncio do link",
    [
      anuncioDoLink("https://pt.aliexpress.com/item/32814252396.html?spm=a2g0s.9042311"),
      anuncioDoLink("//www.aliexpress.com/item/1005006891567710.html?sku_id=12000038634693222"),
      anuncioDoLink("https://loja.x.com/p/1"),
      anuncioDoLink(null),
    ],
    [{ productId: "32814252396", skuId: null }, { productId: "1005006891567710", skuId: "12000038634693222" }, null, null],
  );
  conferir("codigo do vinculo", [codigoDoVinculo("1005006891567710", "12000038634693222"), codigoDoVinculo("1", null)], ["1005006891567710:12000038634693222", "1:"]);
  conferir("situacao: enviado parcialmente (7)", situacaoDoAliExpress({ codigo: 7, texto: "Enviado parcialmente" }), { aberto: true, entregue: false, cancelado: false, aguardandoPagamento: false });
  conferir("situacao: aguardando a entrega (8)", situacaoDoAliExpress({ codigo: 8, texto: "Aguardando a entrega" }).aberto, true);
  conferir(
    "situacao pelo texto",
    [
      situacaoDoAliExpress({ codigo: null, texto: "Concluído" }).entregue,
      situacaoDoAliExpress({ codigo: null, texto: "Pedido fechado" }).cancelado,
      situacaoDoAliExpress({ codigo: null, texto: "Reembolsado" }).cancelado,
      situacaoDoAliExpress({ codigo: null, texto: "A ser pago" }).aguardandoPagamento,
      situacaoDoAliExpress({ codigo: null, texto: "Entregue" }).aberto,
    ],
    [true, true, true, true, false],
  );
  conferir("status no Rise: cancelado sem lancamento", statusNoRise({ situacao: { cancelado: true }, statusAtual: "ENVIADO", temLancamento: false }), { status: "CANCELADO", aviso: null });
  conferir(
    "status no Rise: cancelado com lancamento",
    statusNoRise({ situacao: { cancelado: true }, statusAtual: "PARCIAL", temLancamento: true }),
    { status: "PARCIAL", aviso: "Cancelado no AliExpress, mas há estoque lançado." },
  );
  conferir("status no Rise: entregue nao fecha", statusNoRise({ situacao: { entregue: true }, statusAtual: "ENVIADO", temLancamento: false }), { status: "ENVIADO", aviso: null });
  conferir("status no Rise: finalizado fica", statusNoRise({ situacao: { cancelado: true }, statusAtual: "FINALIZADO", temLancamento: true }).status, "FINALIZADO");
  conferir(
    "avisos",
    avisosDoPedido({ entregueEm: new Date("2026-10-27T12:00:00Z"), faltaLancar: 3, linhasPendentes: 2, virtualErros: 1 }),
    [
      "Entregue no AliExpress em 27/10, falta lançar.",
      "2 item(ns) sem produto: escolha o produto para contar no estoque a caminho.",
      "Entrada no depósito Virtual pendente em 1 item(ns).",
    ],
  );
  conferir("avisos: entregue com tudo lancado nao avisa", avisosDoPedido({ entregueEm: new Date(), faltaLancar: 0, linhasPendentes: 0, virtualErros: 0 }), []);
  conferir("avisos: cancelado com estoque", avisosDoPedido({ canceladoNoAliExpressEm: new Date(), estoqueLancado: true }), ["Cancelado no AliExpress, mas há estoque lançado."]);
  conferir("fator", [quantidadeNoRise(2, 100), quantidadeNoRise(4, null), precoNoRise(30, 100), precoNoRise(57.49, 1), precoNoRise(10, 3)], [200, 4, 0.3, 57.49, 3.3333]);
  conferir("preco medio ponderado", [precoMedioPonderado([{ quantidade: 200, preco: 0.3 }, { quantidade: 100, preco: 0.36 }]), precoMedioPonderado([])], [0.32, null]);
  conferir(
    "desconto implicito",
    [descontoImplicito({ produtos: 229.96, frete: 0.12, imposto: 47.14, total: 277.1 }), descontoImplicito({ produtos: 10, frete: 0, imposto: 0, total: 12 })],
    [0.12, 0],
  );
  conferir(
    "pacote da linha",
    [
      pacoteDaLinha([{ codigo: "NN1", itens: [{ productId: "1", skuId: "2" }] }], { productId: "1", skuId: "2" }),
      pacoteDaLinha([{ codigo: "NN1", itens: [{ productId: "1", skuId: "2" }] }], { productId: "9", skuId: null }),
      pacoteDaLinha([{ codigo: "NN1", itens: [{ productId: "1", skuId: null }] }], { productId: "1", skuId: "5" }),
    ],
    ["NN1", null, "NN1"],
  );
  conferir(
    "decidir casamento",
    [
      decidirCasamento([], null),
      decidirCasamento([{ produtoId: "p1", origem: "rascunho", skuId: null }], "s1"),
      decidirCasamento([{ produtoId: "p1", origem: "rascunho", skuId: null }, { produtoId: "p1", origem: "vinculo", skuId: null }], "s1"),
      decidirCasamento([{ produtoId: "p2", origem: "rascunho", skuId: null }, { produtoId: "p1", origem: "vinculo", skuId: null }], "s1"),
      decidirCasamento([{ produtoId: "p1", origem: "vinculo", skuId: "outro" }], "s1"),
      decidirCasamento([{ produtoId: "p1", origem: "vinculo", skuId: "s1" }, { produtoId: "p2", origem: "rascunho", skuId: null }], "s1"),
    ],
    [null, { produtoId: "p1" }, { produtoId: "p1" }, { ambiguo: ["p1", "p2"] }, null, { produtoId: "p1" }],
  );
  conferir("data curta", formatarDataCurta(new Date("2026-10-27T12:00:00Z")), "27/10");
}

{
  const { totaisDoPedido } = await import("../src/lib/compras/regras.js");
  const { semPrecos } = await import("../src/lib/compras/projecao.js");
  console.log("\nTotais com o imposto do AliExpress");
  const totais = totaisDoPedido({ itens: [{ quantidade: 4, precoUnitario: 57.49 }], frete: 0.12, imposto: 47.14, descontoTipo: "VALOR", descontoValor: 0.12 });
  conferir("totais com imposto", { produtos: totais.produtos, imposto: totais.imposto, total: totais.total }, { produtos: 229.96, imposto: 47.14, total: 277.1 });
  conferir("sem imposto continua igual", totaisDoPedido({ itens: [{ quantidade: 1, precoUnitario: 10 }] }).imposto, 0);
  const cortado = semPrecos({ imposto: 47.14, itens: [], totais: { imposto: 47.14 } });
  conferir("sem custo nao ve o imposto", [cortado.imposto, cortado.totais.imposto], [null, null]);
}

const { readFileSync } = await import("node:fs");
const fixture = (nome) => JSON.parse(readFileSync(new URL(`./fixtures/aliexpress/${nome}.json`, import.meta.url), "utf8"));
{
  const { lerCorpo } = await import("../src/lib/compras/aliexpress/esquema.js");
  console.log("\nEsquema do que a extensão manda");
  const lista = fixture("lista");
  const detalhes = fixture("detalhes");
  const lido = lerCorpo(lista);
  conferir("lista valida", [lido.ok, lido.fase, lido.dados?.pedidos?.length], [true, "lista", 2]);
  const semId = lerCorpo({ ...lista, pedidos: [{ ...lista.pedidos[0], orderId: undefined }] });
  conferir("sem orderId recusa com o caminho", [semId.ok, semId.erro?.startsWith("pedidos.0.orderId")], [false, true]);
  const comExtra = lerCorpo({ ...lista, pedidos: [{ ...lista.pedidos[0], destinatario: "Fulano", telefone: "54999" }] });
  conferir("dado pessoal extra nao passa", ["destinatario" in comExtra.dados.pedidos[0], "telefone" in comExtra.dados.pedidos[0]], [false, false]);
  conferir("detalhes validos", [lerCorpo(detalhes).ok, lerCorpo(detalhes).fase], [true, "detalhes"]);
  const muitos = structuredClone(detalhes);
  muitos.rastreios[0].pacotes[0].eventos = Array.from({ length: 31 }, (_, indice) => ({ em: indice, descricao: "x", nome: null, codigo: null }));
  conferir("31 eventos recusa", lerCorpo(muitos).ok, false);
  conferir("fase desconhecida recusa", lerCorpo({ fase: "outra" }).ok, false);
  conferir("lista vazia vale", lerCorpo({ fase: "lista", lidoEm: lista.lidoEm, pedidos: [] }).ok, true);
}

const { criarBlingFalso } = await import("./lib/blingFalso.js");
const noBling = (codigo, id) => ({ id, codigo, nome: `Produto ${codigo}`, preco: 10, situacao: "A", formato: "S", tipo: "P" });
{
  const { depositoVirtual, entradaNoVirtual, saidaDoVirtual } = await import("../src/lib/compras/aliexpress/virtual.js");
  console.log("\nDepósito Virtual do Bling (falso)");
  const falso = criarBlingFalso({ produtos: [noBling("ZZ-ALI-V1", 15000000911)], codigosLiberados: ["ZZ-ALI-V1"] });
  const virtual = await depositoVirtual(falso);
  conferir("acha o Virtual pelo nome", virtual?.id, 14200000002);
  const entrada = await entradaNoVirtual({ sku: "ZZ-ALI-V1", blingId: 15000000911, quantidade: 200, observacao: "AliExpress 1" }, { cliente: falso });
  const ultimo = () => falso.estado.lancamentos.at(-1);
  conferir("entrada no Virtual", [entrada.ok, ultimo()?.operacao, ultimo()?.quantidade, ultimo()?.deposito?.id, ultimo()?.observacoes], [true, "E", 200, 14200000002, "AliExpress 1"]);
  const saida = await saidaDoVirtual({ sku: "ZZ-ALI-V1", blingId: 15000000911, quantidade: 50, observacao: "chegada" }, { cliente: falso });
  conferir("saida do Virtual", [saida.ok, ultimo()?.operacao, ultimo()?.quantidade], [true, "S", 50]);
  conferir("sem blingId recusa", await entradaNoVirtual({ sku: "ZZ-ALI-V1", blingId: null, quantidade: 1 }, { cliente: falso }), { ok: false, erro: "Produto sem cadastro no Bling." });
  conferir("quantidade zero nao manda nada", [(await entradaNoVirtual({ sku: "ZZ-ALI-V1", blingId: 15000000911, quantidade: 0 }, { cliente: falso })).ok, falso.estado.lancamentos.length], [true, 2]);
  const travado = criarBlingFalso({ produtos: [noBling("ZZ-ALI-V1", 15000000911)], codigosLiberados: ["OUTRO"] });
  const recusa = await entradaNoVirtual({ sku: "ZZ-ALI-V1", blingId: 15000000911, quantidade: 3 }, { cliente: travado });
  conferir("trava fechada recusa antes de chamar", [recusa.ok, travado.estado.lancamentos.length, /bloqueada/i.test(recusa.erro ?? "")], [false, 0, true]);
  const semVirtual = criarBlingFalso({ produtos: [noBling("ZZ-ALI-V1", 15000000911)], depositos: [{ id: 1, descricao: "Fisico", situacao: 1, padrao: true }] });
  conferir("sem deposito Virtual", await entradaNoVirtual({ sku: "ZZ-ALI-V1", blingId: 15000000911, quantidade: 3 }, { cliente: semVirtual }), { ok: false, erro: "Sem depósito Virtual no Bling." });
  const recusado = criarBlingFalso({ produtos: [noBling("ZZ-ALI-V1", 15000000911)], falhas: [{ metodo: "POST", caminho: "/estoques", status: 400, mensagem: "Produto inativo." }] });
  const erroDoBling = await entradaNoVirtual({ sku: "ZZ-ALI-V1", blingId: 15000000911, quantidade: 3 }, { cliente: recusado });
  conferir("Bling recusa", [erroDoBling.ok, erroDoBling.erro?.includes("Produto inativo.")], [false, true]);
}

// Marcador: os blocos puros entram acima desta linha.

// ---------------------------------------------------------------------------
// Banco (Postgres local)
// ---------------------------------------------------------------------------

const { prisma } = await import("../src/lib/db.js");
const { fornecedorDoAliExpress, marcarFornecedorDoAliExpress } = await import("../src/lib/compras/aliexpress/fornecedor.js");

async function limpar() {
  await prisma.pedidoDeCompra.deleteMany({ where: { fornecedor: { nome: { startsWith: "ZZ Ali" } } } });
  await prisma.pedidoDeCompra.deleteMany({ where: { itens: { some: { produto: { sku: { startsWith: "ZZ-ALI" } } } } } });
  await prisma.produtoFornecedor.deleteMany({ where: { produto: { sku: { startsWith: "ZZ-ALI" } } } });
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-ALI" } } });
  await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: "ZZ Ali" } } });
}

async function criarProduto(sku, dados = {}) {
  return prisma.produto.create({ data: { sku, tituloBase: `PRODUTO ${sku}`, conferido: true, ativo: true, estoque: 2, estoqueMinimo: 5, estoqueMaximo: 40, ...dados } });
}

const { proximoNumero } = await import("../src/lib/compras/banco.js");
/** Um pedido de compra do AliExpress ja gravado, com as linhas sem casar (como a importacao deixa antes do casamento). */
async function criarPedidoAli(fornecedorId, externoId, linhas, extra = {}) {
  return prisma.$transaction(async (tx) => {
    const pedido = await tx.pedidoDeCompra.create({ data: { fornecedorId, numero: await proximoNumero(tx), status: "ENVIADO", origem: "ALIEXPRESS", enviadoEm: new Date() } });
    const ali = await tx.pedidoAliExpress.create({
      data: {
        pedidoId: pedido.id,
        externoId,
        statusTexto: "Aguardando a entrega",
        statusCodigo: 8,
        dataDoPedido: new Date(),
        totalInformado: 0,
        moeda: "BRL",
        ...extra,
        linhas: {
          create: linhas.map((linha) => ({
            externoLinhaId: `${externoId}${linha.id}`,
            productId: linha.productId,
            skuId: linha.skuId,
            titulo: `Linha ${linha.id}`,
            urlDoItem: `https://www.aliexpress.com/item/${linha.productId}.html`,
            quantidadeComprada: linha.quantidade,
            precoComprado: linha.preco,
          })),
        },
      },
      include: { linhas: { orderBy: { externoLinhaId: "asc" } } },
    });
    return { pedidoId: pedido.id, linhas: ali.linhas };
  });
}

// O "Ali" do dono: marcado de novo no fim de cada bloco que troca a marca.
const fornecedorOriginal = await fornecedorDoAliExpress();
async function devolverMarca() {
  if (fornecedorOriginal) await marcarFornecedorDoAliExpress(fornecedorOriginal.id);
  else await prisma.fornecedor.updateMany({ where: { aliexpress: true }, data: { aliexpress: false } });
}

// A conexao ALIEXPRESS como estava: o teste gera chaves e registra importacoes, e devolve tudo no fim.
const conexaoOriginal = await prisma.conexao.findUnique({ where: { servico: "ALIEXPRESS" } });
async function devolverConexao() {
  if (conexaoOriginal) {
    const { id, servico, criadoEm, atualizadoEm, ...dados } = conexaoOriginal;
    void id; void criadoEm; void atualizadoEm;
    await prisma.conexao.update({ where: { servico }, data: dados });
  } else {
    await prisma.conexao.deleteMany({ where: { servico: "ALIEXPRESS" } });
  }
}
let chaveDoTeste = null;

await limpar();
try {
  {
    console.log("\nFornecedor do AliExpress");
    const a = await prisma.fornecedor.create({ data: { nome: "ZZ Ali A", estrangeiro: true } });
    const b = await prisma.fornecedor.create({ data: { nome: "ZZ Ali B", estrangeiro: true } });
    conferir("marcar A", (await marcarFornecedorDoAliExpress(a.id)).ok, true);
    conferir("A e o fornecedor do AliExpress", (await fornecedorDoAliExpress())?.id, a.id);
    conferir("marcar B desmarca A", [(await marcarFornecedorDoAliExpress(b.id)).ok, (await fornecedorDoAliExpress())?.id], [true, b.id]);
    conferir("so um marcado", await prisma.fornecedor.count({ where: { aliexpress: true } }), 1);
    conferir("indice unico barra dois marcados", await prisma.fornecedor.update({ where: { id: a.id }, data: { aliexpress: true } }).then(() => "gravou", (erro) => erro.code), "P2002");
    conferir("id inexistente recusa", (await marcarFornecedorDoAliExpress("nao-existe")).ok, false);
    await devolverMarca();
    conferir("devolveu a marca do dono", (await fornecedorDoAliExpress())?.id ?? null, fornecedorOriginal?.id ?? null);
  }

  {
    console.log("\nChave da extensão");
    const { gerarChaveDaExtensao, conferirChaveDaExtensao, estadoDaChave } = await import("../src/lib/compras/aliexpress/chave.js");
    const { chave } = await gerarChaveDaExtensao();
    const pedido = (c) => new Request("https://rise.local/api", { headers: c ? { authorization: `Bearer ${c}` } : {} });
    conferir("formato", /^rise_ali_[A-Za-z0-9_-]{32}$/.test(chave), true);
    conferir("aceita a chave", (await conferirChaveDaExtensao(pedido(chave))).ok, true);
    conferir(
      "recusa sem chave e chave errada",
      [(await conferirChaveDaExtensao(pedido(null))).status, (await conferirChaveDaExtensao(pedido("rise_ali_x"))).status, (await conferirChaveDaExtensao(pedido(`${chave}x`))).ok],
      [401, 401, false],
    );
    const segunda = (await gerarChaveDaExtensao()).chave;
    conferir("gerar de novo invalida a anterior", [(await conferirChaveDaExtensao(pedido(chave))).ok, (await conferirChaveDaExtensao(pedido(segunda))).ok], [false, true]);
    conferir("estado", (await estadoDaChave()).configurada, true);
    conferir("a chave nao fica no banco, so o hash", JSON.stringify(await prisma.conexao.findUnique({ where: { servico: "ALIEXPRESS" } })).includes(segunda), false);
    chaveDoTeste = segunda;
  }

  {
    console.log("\nCasamento da linha com o produto");
    const { casarLinha, casarManual, desfazerCasamento } = await import("../src/lib/compras/aliexpress/casamento.js");
    const ali = await prisma.fornecedor.create({ data: { nome: "ZZ Ali Fornecedor", estrangeiro: true, prazoEntregaDias: 30 } });
    await marcarFornecedorDoAliExpress(ali.id);
    const P1 = await criarProduto("ZZ-ALI-P1", { blingId: "15000000921" });
    const P2 = await criarProduto("ZZ-ALI-P2", { blingId: "15000000922", fornecedorRascunho: { nome: "Ali", descricao: "https://pt.aliexpress.com/item/333.html?spm=x" } });
    const P3 = await criarProduto("ZZ-ALI-P3", { blingId: "15000000923", fornecedorRascunho: { nome: "Ali", descricao: "https://pt.aliexpress.com/item/555.html" } });
    const P4 = await criarProduto("ZZ-ALI-P4", { blingId: "15000000924", fornecedorRascunho: { nome: "Ali", descricao: "https://pt.aliexpress.com/item/555.html?x=1" } });
    const P5 = await criarProduto("ZZ-ALI-P5", { tipo: "COMPOSICAO" });
    await prisma.produtoFornecedor.create({ data: { produtoId: P1.id, fornecedorId: ali.id, codigo: "111:222", precoCusto: 9, precoFornecedor: 9 } });
    await prisma.produtoFornecedor.create({ data: { produtoId: P5.id, fornecedorId: ali.id, codigo: "777:" } });
    const pedido = await criarPedidoAli(ali.id, "9000000000000001", [
      { id: "1", productId: "111", skuId: "222", quantidade: 2, preco: 10 },
      { id: "2", productId: "333", skuId: "444", quantidade: 1, preco: 30 },
      { id: "3", productId: "555", skuId: "666", quantidade: 1, preco: 30 },
      { id: "4", productId: "777", skuId: null, quantidade: 1, preco: 5 },
      { id: "5", productId: "111", skuId: "222", quantidade: 3, preco: 12 },
    ]);
    const [L1, L2, L3, L4, L5] = pedido.linhas.map((linha) => linha.id);
    const falso = criarBlingFalso({ produtos: [noBling("ZZ-ALI-P1", 15000000921), noBling("ZZ-ALI-P2", 15000000922), noBling("ZZ-ALI-P3", 15000000923), noBling("ZZ-ALI-P4", 15000000924)] });
    const vinculoAli = (produtoId) => prisma.produtoFornecedor.findFirst({ where: { produtoId, fornecedorId: ali.id } });
    const itemDe = async (itemId) => {
      const item = await prisma.itemDoPedidoDeCompra.findUnique({ where: { id: itemId } });
      return item && { quantidade: item.quantidade, precoUnitario: Number(item.precoUnitario) };
    };

    const r1 = await casarLinha(prisma, L1);
    conferir("regra 1: codigo do vinculo", [r1.ok, r1.produtoId, r1.criouItem], [true, P1.id, true]);
    conferir("item nasce com nome, codigo, link e prazo", (({ nomeNoFornecedor, codigoNoFornecedor, prazoDias }) => ({ nomeNoFornecedor, codigoNoFornecedor, prazoDias }))(await prisma.itemDoPedidoDeCompra.findUnique({ where: { id: r1.itemId } })), { nomeNoFornecedor: "Linha 1", codigoNoFornecedor: "111:222", prazoDias: 30 });
    conferir("casar de novo nao duplica", [(await casarLinha(prisma, L1)).itemId, await prisma.itemDoPedidoDeCompra.count({ where: { pedidoId: pedido.pedidoId } })], [r1.itemId, 1]);
    conferir("regra 2: rascunho do Bling, um produto", (await casarLinha(prisma, L2)).produtoId, P2.id);
    conferir("regra 2 cria o vinculo do Ali com o codigo anuncio:opcao", (await vinculoAli(P2.id))?.codigo, "333:444");
    conferir("custo so em quem nao tinha", [Number((await vinculoAli(P2.id)).precoCusto), Number((await vinculoAli(P1.id)).precoCusto)], [30, 9]);
    conferir("regra 2 ambigua fica pendente", await casarLinha(prisma, L3), { ok: false, pendente: true, motivo: "ambiguo", produtos: [P3.id, P4.id].sort() });
    conferir("kit fica pendente", (await casarLinha(prisma, L4)).motivo, "kit");
    const r5 = await casarLinha(prisma, L5);
    conferir("duas linhas no mesmo produto somam no item", [r5.itemId === r1.itemId, await itemDe(r1.itemId)], [true, { quantidade: 5, precoUnitario: 11.2 }]);

    const m3 = await casarManual(L3, P3.id, 100, { cliente: falso });
    conferir("casar manual com fator 100", [m3.ok, await itemDe(m3.itemId)], [true, { quantidade: 100, precoUnitario: 0.3 }]);
    conferir("casar manual grava o vinculo com fator", (await prisma.produtoFornecedor.findFirst({ where: { produtoId: P3.id, fornecedorId: ali.id, codigo: "555:666" } }))?.fator, 100);
    const linha3 = await prisma.linhaAliExpress.findUnique({ where: { id: L3 } });
    conferir("casar manual mandou entrada no Virtual", [falso.estado.lancamentos.at(-1)?.operacao, falso.estado.lancamentos.at(-1)?.quantidade, linha3.virtualQuantidade, Boolean(linha3.virtualLancadoEm)], ["E", 100, 100, true]);
    const troca = await casarManual(L3, P4.id, 100, { cliente: falso });
    conferir("trocar o produto tira do antigo e entra no novo", [troca.ok, falso.estado.lancamentos.slice(-2).map((lancamento) => [lancamento.operacao, lancamento.produto.id])], [true, [["S", 15000000923], ["E", 15000000924]]]);
    conferir("a troca e lembrada: o codigo saiu do produto antigo", [(await prisma.produtoFornecedor.count({ where: { produtoId: P3.id, codigo: "555:666" } })), (await prisma.produtoFornecedor.count({ where: { produtoId: P4.id, codigo: "555:666" } }))], [0, 1]);
    conferir("o item antigo sumiu", await prisma.itemDoPedidoDeCompra.count({ where: { pedidoId: pedido.pedidoId, produtoId: P3.id } }), 0);
    conferir("fator invalido recusa", (await casarManual(L3, P4.id, 0, { cliente: falso })).ok, false);
    conferir("kit recusa no manual", (await casarManual(L4, P5.id, 1, { cliente: falso })).ok, false);
    await prisma.itemDoPedidoDeCompra.update({ where: { id: r1.itemId }, data: { quantidadeLancada: 1 } });
    conferir("com estoque lancado nao troca", (await casarManual(L1, P2.id, 1, { cliente: falso })).erro, "Já há estoque lançado deste item: não dá para trocar.");
    conferir("com estoque lancado nao desfaz", (await desfazerCasamento(L5, { cliente: falso })).ok, false);
    await prisma.itemDoPedidoDeCompra.update({ where: { id: r1.itemId }, data: { quantidadeLancada: 0 } });
    const desfeito = await desfazerCasamento(L5, { cliente: falso });
    conferir("desfazer tira a linha do item", [desfeito.ok, await itemDe(r1.itemId), (await prisma.linhaAliExpress.findUnique({ where: { id: L5 } })).itemId], [true, { quantidade: 2, precoUnitario: 10 }, null]);
    await devolverMarca();
  }

  // Marcador: os blocos de banco seguintes entram acima desta linha.
} finally {
  await devolverMarca();
  if (!manter) await devolverConexao();
  if (!manter) await limpar();
  await prisma.$disconnect();
}

console.log(`\n${falhas === 0 ? "Tudo certo." : `${falhas} falha(s).`}`);
process.exit(falhas === 0 ? 0 : 1);
