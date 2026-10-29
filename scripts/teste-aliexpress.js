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
  conferir(
    "previsao em datas",
    [
      regras.previsaoEmDatas(new Date(1794289253053), new Date(1795066853053)),
      regras.previsaoEmDatas(new Date("2026-11-17T12:00:00Z"), new Date("2026-11-17T15:00:00Z")),
      regras.previsaoEmDatas(null, new Date("2026-11-27T12:00:00Z")),
      regras.previsaoEmDatas(null, null),
    ],
    ["10/11 a 19/11", "17/11", "até 27/11", null],
  );

  // "!" na Situacao (pedido do dono em 29/10/2026): problema no rastreio, atraso, situacao no AliExpress e os de antes.
  const { problemaNoRastreio, prazoDoPedido, alertasDoPedido } = regras;
  conferir(
    "problema no rastreio",
    [
      problemaNoRastreio({ codigo: "AE_SC_OUTBOUND_SUCCESS", descricao: "Saiu do centro de distribuição do país/região de partida" }),
      problemaNoRastreio({ codigo: null, descricao: "Desembaraço aduaneiro concluído" }),
      problemaNoRastreio({ codigo: null, descricao: "Objeto encaminhado para fiscalização aduaneira" }),
      problemaNoRastreio({ codigo: "AE_DELIVERY_FAIL", descricao: "Delivery attempt" }),
      problemaNoRastreio({ codigo: null, descricao: "Tentativa de entrega não efetuada: destinatário ausente" }),
      problemaNoRastreio({ codigo: null, descricao: "Objeto retido pela alfândega" }),
      problemaNoRastreio({ codigo: null, descricao: "Aguardando pagamento do imposto" }),
      problemaNoRastreio({ codigo: null, descricao: "Objeto devolvido ao remetente" }),
      problemaNoRastreio({ codigo: null, descricao: "Endereço incorreto" }),
      problemaNoRastreio(null),
    ],
    [false, false, false, true, true, true, true, true, true, false],
  );
  const hoje = new Date("2026-11-20T15:00:00Z");
  conferir(
    "prazo do pedido",
    [
      prazoDoPedido({ status: "ENVIADO", pacotes: [{ previsaoInicio: new Date(1794289253053), previsaoFim: new Date(1795066853053) }] }),
      prazoDoPedido({ status: "ENVIADO", enviadoEm: new Date("2026-11-01T12:00:00Z"), prazosDosItens: [7, 15, null] }),
      prazoDoPedido({ status: "RASCUNHO", prazosDosItens: [7] }),
      prazoDoPedido({ status: "ENVIADO", enviadoEm: new Date("2026-11-01T12:00:00Z"), prazosDosItens: [] }),
    ].map((prazo) => prazo && { texto: prazo.texto, fim: prazo.fim?.toISOString().slice(0, 10) }),
    [{ texto: "10/11 a 19/11", fim: "2026-11-19" }, { texto: "16/11", fim: "2026-11-16" }, null, null],
  );
  const base = { status: "ENVIADO", agora: hoje, faltaLancar: 4 };
  conferir(
    "alertas: atraso, rastreio, situacao no AliExpress, sem produto, entregue",
    [
      alertasDoPedido({ ...base, prazoFim: new Date("2026-11-19T05:40:00Z") }),
      alertasDoPedido({ ...base, prazoFim: new Date("2026-11-25T05:40:00Z") }),
      alertasDoPedido({ ...base, prazoFim: new Date("2026-11-19T05:40:00Z"), entregueEm: new Date("2026-11-18T12:00:00Z") }),
      alertasDoPedido({ ...base, ultimosEventos: [{ codigo: null, descricao: "Objeto retido pela alfândega", em: new Date("2026-11-18T12:00:00Z") }] }),
      alertasDoPedido({ ...base, statusNoAliExpress: "Em disputa" }),
      alertasDoPedido({ ...base, linhasPendentes: 2 }),
      alertasDoPedido({ ...base, status: "FINALIZADO", prazoFim: new Date("2026-11-01T12:00:00Z") }),
    ],
    [
      ["Passou da previsão de entrega (19/11) e não foi entregue."],
      [],
      ["Entregue no AliExpress em 18/11, falta lançar."],
      ["Rastreio: Objeto retido pela alfândega (18/11)."],
      ["Situação no AliExpress: Em disputa."],
      ["2 item(ns) sem produto: escolha o produto para contar no estoque a caminho."],
      [],
    ],
  );
  // Custo por peca (pedido do dono em 29/10/2026): o total pago (com frete e imposto, menos desconto) / pecas, rateado pelo
  // valor de cada item quando o pedido tem mais de um produto.
  conferir(
    "custo por peca com frete e imposto",
    [
      regras.custoPorPeca({ itens: [{ id: "a", quantidade: 4, precoUnitario: 57.49 }], frete: 0.12, imposto: 47.14, desconto: 0.12 }),
      regras.custoPorPeca({ itens: [{ id: "a", quantidade: 10, precoUnitario: 1 }, { id: "b", quantidade: 5, precoUnitario: 2 }], frete: 4, imposto: 0, desconto: 0 }),
      regras.custoPorPeca({ itens: [{ id: "a", quantidade: 100, precoUnitario: 0.25 }], frete: 0, imposto: 5, desconto: 0 }),
      regras.custoPorPeca({ itens: [{ id: "a", quantidade: 2, precoUnitario: null }], frete: 5, imposto: 0, desconto: 0 }),
    ],
    [{ a: 69.28 }, { a: 1.2, b: 2.4 }, { a: 0.3 }, {}],
  );
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
  // A saida e um BALANCO (o novo saldo fisico), nunca "S": a conta real recusou "S" no Virtual em 29/10/2026 porque o
  // saldo disponivel la fica negativo com as reservas de venda (fisico 4, disponivel -135).
  const saida = await saidaDoVirtual({ sku: "ZZ-ALI-V1", blingId: 15000000911, quantidade: 50, observacao: "chegada" }, { cliente: falso });
  conferir("saida do Virtual por balanco", [saida.ok, ultimo()?.operacao, ultimo()?.quantidade], [true, "B", 150]);
  const comReservas = criarBlingFalso({
    produtos: [noBling("ZZ-ALI-V1", 15000000911)],
    saldosPorDeposito: { "ZZ-ALI-V1": { 14200000002: { fisico: 4, virtual: -135 } } },
    recusarSaidaSemSaldo: true,
  });
  const saidaComReservas = await saidaDoVirtual({ sku: "ZZ-ALI-V1", blingId: 15000000911, quantidade: 4, observacao: "troca" }, { cliente: comReservas });
  conferir(
    "saida com o disponivel negativo (o erro de 29/10) passa e zera o fisico",
    [saidaComReservas.ok, saidaComReservas.erro ?? null, comReservas.estado.lancamentos.at(-1)?.operacao, comReservas.estado.lancamentos.at(-1)?.quantidade],
    [true, null, "B", 0],
  );
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

const inicioDoTeste = new Date();

async function limpar() {
  await prisma.logIntegracao.deleteMany({ where: { servico: "ALIEXPRESS", criadoEm: { gte: inicioDoTeste } } });
  await prisma.pedidoDeCompra.deleteMany({ where: { aliexpress: { externoId: { startsWith: "99" } } } });
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
    // Desde 29/10/2026 o vinculo do Ali acompanha a ultima compra (o preco da linha; o frete e o imposto entram quando o
    // detalhe do pedido chega). Vinculo de outro fornecedor nao muda.
    conferir("custo do vinculo Ali acompanha a compra", [Number((await vinculoAli(P2.id)).precoCusto), Number((await vinculoAli(P1.id)).precoCusto)], [30, 10]);
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
    conferir("trocar o produto tira do antigo e entra no novo", [troca.ok, falso.estado.lancamentos.slice(-2).map((lancamento) => [lancamento.operacao, lancamento.produto.id])], [true, [["B", 15000000923], ["E", 15000000924]]]);
    conferir("a troca e lembrada: o codigo saiu do produto antigo", [(await prisma.produtoFornecedor.count({ where: { produtoId: P3.id, codigo: "555:666" } })), (await prisma.produtoFornecedor.count({ where: { produtoId: P4.id, codigo: "555:666" } }))], [0, 1]);
    conferir("o item antigo sumiu", await prisma.itemDoPedidoDeCompra.count({ where: { pedidoId: pedido.pedidoId, produtoId: P3.id } }), 0);
    conferir("fator invalido recusa", (await casarManual(L3, P4.id, 0, { cliente: falso })).ok, false);
    conferir("kit recusa no manual", (await casarManual(L4, P5.id, 1, { cliente: falso })).ok, false);
    await prisma.itemDoPedidoDeCompra.update({ where: { id: r1.itemId }, data: { quantidadeLancada: 1 } });
    conferir("com estoque lancado nao troca", (await casarManual(L1, P2.id, 1, { cliente: falso })).erro, "Já há estoque lançado deste item: não dá para trocar.");
    conferir("com estoque lancado nao desfaz", (await desfazerCasamento(L5, { cliente: falso })).ok, false);
    await prisma.itemDoPedidoDeCompra.update({ where: { id: r1.itemId }, data: { quantidadeLancada: 0 } });
    // Fator editavel no item ja casado (pedido do dono em 29/10/2026: "Color: 50pcs" comprado 2 vezes = 100 no Rise).
    const antesDoFator = falso.estado.lancamentos.length;
    const comFator = await casarManual(L2, P2.id, 10, { cliente: falso });
    conferir(
      "trocar so o fator refaz quantidade e preco e lembra no vinculo",
      [comFator.ok, await itemDe(comFator.itemId), (await vinculoAli(P2.id))?.fator, (await prisma.linhaAliExpress.findUnique({ where: { id: L2 } })).fator],
      [true, { quantidade: 10, precoUnitario: 3 }, 10, 10],
    );
    conferir("trocar o fator: Virtual tira o velho e poe o novo", falso.estado.lancamentos.slice(antesDoFator).map((l) => [l.operacao, l.quantidade]), [["E", 10]]);
    // O caso do PC-0015 (29/10/2026): o Bling recusou a saida ao trocar o fator, e a linha ficou com a entrada antiga (1;
    // o falso tem 10 no Virtual deste produto do passo anterior, entao o balanco grava 9)
    // e o erro. O "Reenviar ao Virtual" acerta a diferenca: tira a antiga e poe a do fator novo.
    const { reenviarAoVirtual } = await import("../src/lib/compras/aliexpress/importacao.js");
    await prisma.linhaAliExpress.update({ where: { id: L2 }, data: { virtualQuantidade: 1, virtualLancadoEm: new Date(), virtualErro: "O Bling recusou o depósito Virtual (HTTP 400)." } });
    const antesDoReenvio = falso.estado.lancamentos.length;
    const reenvio = await reenviarAoVirtual(L2, { cliente: falso });
    const linhaReenviada = await prisma.linhaAliExpress.findUnique({ where: { id: L2 } });
    conferir(
      "reenviar acerta a entrada antiga para a do fator novo",
      [reenvio.ok, falso.estado.lancamentos.slice(antesDoReenvio).map((l) => [l.operacao, l.quantidade]), linhaReenviada.virtualQuantidade, linhaReenviada.virtualErro],
      [true, [["B", 9], ["E", 10]], 10, null],
    );

    const desfeito = await desfazerCasamento(L5, { cliente: falso });
    conferir("desfazer tira a linha do item", [desfeito.ok, await itemDe(r1.itemId), (await prisma.linhaAliExpress.findUnique({ where: { id: L5 } })).itemId], [true, { quantidade: 2, precoUnitario: 10 }, null]);
    await devolverMarca();
  }

  {
    console.log("\nImportação (lista, detalhes, rastreio e Virtual)");
    const { importarLista, importarDetalhes, estadoDaImportacao, reenviarAoVirtual } = await import("../src/lib/compras/aliexpress/importacao.js");
    const ali = await prisma.fornecedor.create({ data: { nome: "ZZ Ali Importa", estrangeiro: true, prazoEntregaDias: 25 } });
    conferir("sem fornecedor marcado recusa", (await (async () => { await prisma.fornecedor.updateMany({ where: { aliexpress: true }, data: { aliexpress: false } }); return importarLista({ pedidos: [], lidoEm: new Date().toISOString() }); })()).erro, "Marque o fornecedor do AliExpress em Integrações.");
    await marcarFornecedorDoAliExpress(ali.id);
    const I1 = await criarProduto("ZZ-ALI-I1", { blingId: "15000000931", fornecedorRascunho: { nome: "Ali", descricao: "https://pt.aliexpress.com/item/1005006891567710.html?spm=x" } });
    const I2 = await criarProduto("ZZ-ALI-I2", { blingId: "15000000932" });
    await prisma.produtoFornecedor.create({ data: { produtoId: I2.id, fornecedorId: ali.id, codigo: "1005001111111111:12000011111111111" } });
    const falso = criarBlingFalso({ produtos: [noBling("ZZ-ALI-I1", 15000000931), noBling("ZZ-ALI-I2", 15000000932)] });
    const lista = fixture("lista");
    const detalhes = fixture("detalhes");
    const lerAli = (externoId) =>
      prisma.pedidoAliExpress.findUnique({ where: { externoId }, include: { pedido: { include: { itens: true } }, linhas: { orderBy: { externoLinhaId: "asc" }, include: { pacote: true } }, pacotes: true } });

    const r1 = await importarLista(lista, { cliente: falso });
    conferir("primeira importacao", [r1.ok, r1.novos, r1.atualizados, r1.pendentes, r1.virtualPendentes], [true, 2, 0, 1, 0]);
    const p1 = await lerAli("9915244197193461");
    conferir(
      "pedido nasce ENVIADO, origem ALIEXPRESS, do fornecedor marcado",
      [p1.pedido.status, p1.pedido.origem, p1.pedido.fornecedorId === ali.id, p1.pedido.enviadoEm?.toISOString().slice(0, 10), p1.loja, Number(p1.totalInformado)],
      ["ENVIADO", "ALIEXPRESS", true, "2026-10-26", "Lets Deal Store", 277.1],
    );
    conferir("linha casada pelo rascunho, entrou no Virtual", [p1.linhas[0].itemId != null, p1.linhas[0].virtualQuantidade, p1.linhas[0].virtualLancadoEm != null], [true, 4, true]);
    conferir("item com quantidade e preco", [p1.pedido.itens[0].quantidade, Number(p1.pedido.itens[0].precoUnitario)], [4, 57.49]);
    // Obs do vinculo = a opcao comprada (pedido do dono em 29/10/2026): no vinculo criado e no que ja existia sem Obs.
    conferir(
      "Obs do vinculo do Ali recebe a opcao",
      await Promise.all([I1, I2].map((produto) => prisma.produtoFornecedor.findFirst({ where: { produtoId: produto.id, fornecedorId: ali.id }, select: { observacao: true } }).then((v) => v?.observacao))),
      ["Color Name: 2M", "Cor: Azul"],
    );
    conferir("precisa detalhe e rastreio dos dois, mais novo primeiro", [r1.precisaDetalhe, r1.precisaRastreio], [["9915244197193461", "9915189636893461"], ["9915244197193461", "9915189636893461"]]);
    // A ordem das entradas nao importa: compara ordenado.
    conferir("Virtual: duas entradas (a linha pendente nao vai)", falso.estado.lancamentos.map((lancamento) => [lancamento.operacao, lancamento.quantidade]).sort(), [["E", 2], ["E", 4]]);

    const d = await importarDetalhes(detalhes);
    const p1d = await lerAli("9915244197193461");
    conferir("detalhe: frete, imposto e desconto implicito", [Number(p1d.pedido.frete), Number(p1d.pedido.imposto), Number(p1d.pedido.descontoValor), p1d.pedido.descontoTipo], [0.12, 47.14, 0.12, "VALOR"]);
    conferir(
      "custo do vinculo Ali = total pago / pecas, com frete e imposto",
      await prisma.produtoFornecedor.findFirst({ where: { produtoId: I1.id, fornecedorId: ali.id }, select: { precoFornecedor: true, precoCusto: true } }).then((v) => [Number(v.precoFornecedor), Number(v.precoCusto)]),
      [69.28, 69.28],
    );
    conferir("rastreio: pacote e linha ligada", [d.pacotes, p1d.linhas[0].pacote?.codigo, p1d.pacotes[0]?.ultimoEvento, p1d.pacotes[0]?.transportadora], [1, "NN446506474BR", "Chegou ao armazém de consolidação", "AliExpress Selection Standard"]);
    conferir("depois do detalhe, nao pede de novo", (await importarLista(lista, { cliente: falso })).precisaDetalhe, ["9915189636893461"]);

    const r2 = await importarLista(lista, { cliente: falso });
    conferir("reimportar nao duplica", [r2.novos, r2.atualizados, await prisma.pedidoAliExpress.count({ where: { externoId: { startsWith: "9915" } } }), falso.estado.lancamentos.length], [0, 2, 2, 2]);

    const comLinhaNova = structuredClone(lista);
    comLinhaNova.pedidos = [comLinhaNova.pedidos[0]];
    comLinhaNova.pedidos[0].linhas.push({ orderLineId: "9915244197213461", productId: "1005001111111111", skuId: "12000011111111111", opcao: "Cor: Azul", titulo: "Módulo azul", urlDoItem: null, urlDaFoto: null, quantidade: 1, precoTexto: "R$10,00" });
    const r3 = await importarLista(comLinhaNova, { cliente: falso });
    conferir("linha nova em pedido existente", [r3.atualizados, (await lerAli("9915244197193461")).pedido.itens.length, falso.estado.lancamentos.at(-1)?.quantidade], [1, 2, 1]);

    const emUsd = structuredClone(lista);
    emUsd.pedidos = [{ ...emUsd.pedidos[0], orderId: "9915000000000001", moeda: "USD", linhas: [{ ...emUsd.pedidos[0].linhas[0], orderLineId: "9915000000000011" }] }];
    const r4 = await importarLista(emUsd, { cliente: falso });
    conferir("pedido em USD e ignorado", [r4.ignorados, await prisma.pedidoAliExpress.count({ where: { externoId: "9915000000000001" } })], [1, 0]);
    const aSerPago = structuredClone(emUsd);
    aSerPago.pedidos[0].moeda = "BRL";
    aSerPago.pedidos[0].statusTexto = "A ser pago";
    conferir("a ser pago e ignorado", (await importarLista(aSerPago, { cliente: falso })).ignorados, 1);

    const entregue = structuredClone(lista);
    entregue.pedidos = [{ ...entregue.pedidos[1], statusTexto: "Concluído", statusCodigo: null }];
    const r5 = await importarLista(entregue, { cliente: falso });
    const p2 = await lerAli("9915189636893461");
    conferir("entregue: grava a data, status fica, pede o rastreio final", [p2.entregueEm != null, p2.pedido.status, r5.precisaRastreio], [true, "ENVIADO", ["9915189636893461"]]);

    const novoCancelado = structuredClone(lista);
    novoCancelado.pedidos = [{ ...novoCancelado.pedidos[0], orderId: "9915000000000002", linhas: [{ ...novoCancelado.pedidos[0].linhas[0], orderLineId: "9915000000000021" }] }];
    await importarLista(novoCancelado, { cliente: falso });
    novoCancelado.pedidos[0].statusTexto = "Pedido fechado";
    novoCancelado.pedidos[0].statusCodigo = null;
    await importarLista(novoCancelado, { cliente: falso });
    const p3 = await lerAli("9915000000000002");
    conferir("cancelado sem lancamento vira CANCELADO e sai do Virtual", [p3.pedido.status, p3.pedido.canceladoEm != null, falso.estado.lancamentos.at(-1)?.operacao, p3.linhas[0].virtualQuantidade], ["CANCELADO", true, "B", 0]);
    const jaCancelado = structuredClone(novoCancelado);
    jaCancelado.pedidos[0].orderId = "9915000000000004";
    jaCancelado.pedidos[0].linhas[0].orderLineId = "9915000000000041";
    conferir("pedido que ja vem cancelado na 1a vez e ignorado", (await importarLista(jaCancelado, { cliente: falso })).ignorados, 1);

    const jaEntregue = structuredClone(lista);
    jaEntregue.pedidos = [{ ...jaEntregue.pedidos[0], orderId: "9915000000000005", statusTexto: "Concluído", statusCodigo: 9, linhas: [{ ...jaEntregue.pedidos[0].linhas[0], orderLineId: "9915000000000051" }] }];
    const lancamentosAntes = falso.estado.lancamentos.length;
    const r8 = await importarLista(jaEntregue, { cliente: falso });
    const p5 = await lerAli("9915000000000005");
    conferir(
      "pedido que ja vem entregue na 1a vez nasce FINALIZADO, sem Virtual e sem pedir rastreio",
      [r8.novos, p5.pedido.status, p5.pedido.finalizadoEm != null, p5.linhas[0].itemId != null, falso.estado.lancamentos.length - lancamentosAntes, r8.precisaRastreio],
      [1, "FINALIZADO", true, true, 0, []],
    );

    await prisma.itemDoPedidoDeCompra.updateMany({ where: { pedidoId: p1.pedidoId }, data: { quantidadeLancada: 1 } });
    const reembolso = structuredClone(lista);
    reembolso.pedidos = [{ ...reembolso.pedidos[0], statusTexto: "Reembolsado", statusCodigo: null }];
    const r6 = await importarLista(reembolso, { cliente: falso });
    const p1c = await lerAli("9915244197193461");
    conferir("cancelado com lancamento: fica e marca", [p1c.pedido.status, p1c.canceladoNoAliExpressEm != null, r6.avisos.some((aviso) => aviso.includes("há estoque lançado"))], ["ENVIADO", true, true]);

    const travado = criarBlingFalso({ produtos: [noBling("ZZ-ALI-I1", 15000000931)], codigosLiberados: ["OUTRO"] });
    const recusa = structuredClone(lista);
    recusa.pedidos = [{ ...recusa.pedidos[0], orderId: "9915000000000003", linhas: [{ ...recusa.pedidos[0].linhas[0], orderLineId: "9915000000000031" }] }];
    const r7 = await importarLista(recusa, { cliente: travado });
    const linhaRecusada = (await lerAli("9915000000000003")).linhas[0];
    conferir("Bling recusa a entrada no Virtual: importa e marca", [r7.ok, r7.virtualPendentes, linhaRecusada.virtualErro != null, linhaRecusada.virtualLancadoEm], [true, 1, true, null]);
    const reenviado = await reenviarAoVirtual(linhaRecusada.id, { cliente: falso });
    const depois = await prisma.linhaAliExpress.findUnique({ where: { id: linhaRecusada.id } });
    conferir("Reenviar ao Virtual resolve", [reenviado.ok, depois.virtualErro, depois.virtualQuantidade], [true, null, 4]);

    // Recalculo dos pedidos ja importados (pedido do dono em 29/10/2026, depois da regra nova de custo e Obs).
    const { recalcularVinculosDoAliExpress } = await import("../src/lib/compras/aliexpress/casamento.js");
    const vinculoI1 = () => prisma.produtoFornecedor.findFirst({ where: { produtoId: I1.id, fornecedorId: ali.id }, select: { observacao: true, precoCusto: true } });
    await prisma.produtoFornecedor.updateMany({ where: { produtoId: I1.id, fornecedorId: ali.id }, data: { observacao: null, precoCusto: 1, precoFornecedor: 1 } });
    const simulado = await recalcularVinculosDoAliExpress({ gravar: false });
    conferir("recalcular simulado conta e nao grava", [simulado.pedidos > 0, (await vinculoI1()).observacao, Number((await vinculoI1()).precoCusto)], [true, null, 1]);
    const recalculado = await recalcularVinculosDoAliExpress({ gravar: true });
    const depoisDoRecalculo = await vinculoI1();
    // O custo e o da compra MAIS RECENTE do vinculo: aqui, pedidos do mesmo produto e do mesmo dia criados depois, sem
    // detalhe de frete ainda (57,49 = o preco da linha). O cancelado nao conta.
    conferir("recalcular devolve custo e Obs", [recalculado.pedidos > 0, depoisDoRecalculo.observacao, Number(depoisDoRecalculo.precoCusto)], [true, "Color Name: 2M", 57.49]);

    const estado = await estadoDaImportacao();
    conferir("estado da importacao", [typeof estado.lerDesde, estado.ultimaImportacaoEm != null, estado.fornecedor], ["string", true, "ZZ Ali Importa"]);
    conferir("cada clique vira log", (await prisma.logIntegracao.count({ where: { servico: "ALIEXPRESS", criadoEm: { gte: inicioDoTeste } } })) >= 10, true);
    await devolverMarca();
  }

  {
    console.log("\nChegada: Lançar estoque tira do Virtual");
    const { casarManual } = await import("../src/lib/compras/aliexpress/casamento.js");
    const lancamento = await import("../src/lib/compras/lancamento.js");
    const ali = await prisma.fornecedor.create({ data: { nome: "ZZ Ali Chegada", estrangeiro: true } });
    await marcarFornecedorDoAliExpress(ali.id);
    const C1 = await criarProduto("ZZ-ALI-C1", { blingId: "15000000941", estoque: 5, blingSaldo: 5 });
    const falso = criarBlingFalso({ produtos: [noBling("ZZ-ALI-C1", 15000000941)], saldos: { "ZZ-ALI-C1": 5 }, codigosLiberados: ["ZZ-ALI-C1"] });
    const pedido = await criarPedidoAli(ali.id, "9925000000000001", [{ id: "1", productId: "881", skuId: "882", quantidade: 4, preco: 10 }]);
    const casado = await casarManual(pedido.linhas[0].id, C1.id, 1, { cliente: falso });
    conferir("casou e entrou 4 no Virtual", [casado.ok, falso.estado.lancamentos.at(-1)?.operacao, falso.estado.lancamentos.at(-1)?.quantidade], [true, "E", 4]);
    const antes = falso.estado.lancamentos.length;
    const lancado = await lancamento.lancarEstoqueDoItem(casado.itemId, 3, { cliente: falso });
    const novos = falso.estado.lancamentos.slice(antes).map((l) => [l.operacao, l.quantidade, l.deposito.id]);
    conferir("lancar 3: Fisico recebe, Virtual perde 3", [lancado.ok, lancado.virtual?.ok, novos.at(-1)], [true, true, ["B", 1, 14200000002]]);
    conferir("a linha guarda o que ainda esta no Virtual", (await prisma.linhaAliExpress.findUnique({ where: { id: pedido.linhas[0].id } })).virtualQuantidade, 1);
    const desfeito = await lancamento.desfazerUltimoLancamento(casado.itemId, { cliente: falso });
    conferir("desfazer devolve ao Virtual", [desfeito.ok, desfeito.virtual?.ok, falso.estado.lancamentos.at(-1)?.operacao, falso.estado.lancamentos.at(-1)?.quantidade, (await prisma.linhaAliExpress.findUnique({ where: { id: pedido.linhas[0].id } })).virtualQuantidade], [true, true, "E", 3, 4]);

    const normal = await prisma.pedidoDeCompra.create({ data: { fornecedorId: ali.id, numero: (await prisma.pedidoDeCompra.aggregate({ _max: { numero: true } }))._max.numero + 1, status: "ENVIADO" } });
    const C2 = await criarProduto("ZZ-ALI-C2", { blingId: "15000000942", estoque: 5, blingSaldo: 5 });
    const itemNormal = await prisma.itemDoPedidoDeCompra.create({ data: { pedidoId: normal.id, produtoId: C2.id, quantidade: 2, precoUnitario: 1 } });
    const falso2 = criarBlingFalso({ produtos: [noBling("ZZ-ALI-C2", 15000000942)], saldos: { "ZZ-ALI-C2": 5 }, codigosLiberados: ["ZZ-ALI-C2"] });
    const lancadoNormal = await lancamento.lancarEstoqueDoItem(itemNormal.id, 2, { cliente: falso2 });
    conferir("pedido do Rise nao mexe no Virtual", [lancadoNormal.ok, "virtual" in lancadoNormal, falso2.estado.lancamentos.some((l) => l.deposito.id === 14200000002)], [true, false, false]);
    await devolverMarca();
  }

  {
    console.log("\nRotas da extensão");
    const estado = await import("../src/app/api/compras/aliexpress/estado/route.js");
    const importar = await import("../src/app/api/compras/aliexpress/importar/route.js");
    const ali = await prisma.fornecedor.create({ data: { nome: "ZZ Ali Rotas", estrangeiro: true } });
    await marcarFornecedorDoAliExpress(ali.id);
    const url = "https://rise.local/api/compras/aliexpress";
    const comChave = (corpo, cabecalhos = {}) =>
      new Request(`${url}/importar`, { method: "POST", headers: { authorization: `Bearer ${chaveDoTeste}`, "content-type": "application/json", ...cabecalhos }, body: corpo });
    conferir("estado sem chave: 401", (await estado.GET(new Request(`${url}/estado`))).status, 401);
    const comEstado = await estado.GET(new Request(`${url}/estado`, { headers: { authorization: `Bearer ${chaveDoTeste}` } }));
    conferir("estado com chave: 200 e o corte", [comEstado.status, typeof (await comEstado.json()).lerDesde], [200, "string"]);
    conferir("importar sem chave: 401", (await importar.POST(new Request(`${url}/importar`, { method: "POST", body: "{}" }))).status, 401);
    const quebrado = await importar.POST(comChave("{"));
    conferir("JSON quebrado: 400 com o motivo", [quebrado.status, typeof (await quebrado.json()).erro], [400, "string"]);
    const invalido = await importar.POST(comChave(JSON.stringify({ fase: "lista", pedidos: [{}] })));
    conferir("formato invalido: 400", invalido.status, 400);
    const vazio = await importar.POST(comChave(JSON.stringify({ fase: "lista", lidoEm: new Date().toISOString(), pedidos: [] })));
    conferir("lista vazia: 200, nada novo", [vazio.status, (await vazio.json()).novos], [200, 0]);
    conferir("corpo grande: 413", (await importar.POST(comChave("{}", { "content-length": "6000000" }))).status, 413);
    const detalhes = await importar.POST(comChave(JSON.stringify({ fase: "detalhes", detalhes: [], rastreios: [] })));
    conferir("fase detalhes: 200", [detalhes.status, (await detalhes.json()).detalhados], [200, 0]);
    const caddy = readFileSync(new URL("../deploy/caddy/Caddyfile", import.meta.url), "utf8");
    const bloco = /@extensaoAliExpress\s*\{([^}]*)\}/.exec(caddy)?.[1] ?? "";
    conferir("Caddyfile: as duas rotas sem o login do Tinyauth, so elas", [bloco.includes("/api/compras/aliexpress/estado"), bloco.includes("/api/compras/aliexpress/importar"), /\*/.test(bloco)], [true, true, false]);
    await devolverMarca();
  }

  {
    console.log("\nLeitura do pedido do AliExpress para a tela");
    const { importarLista, importarDetalhes } = await import("../src/lib/compras/aliexpress/importacao.js");
    const { lerPedido, listarPedidos } = await import("../src/lib/compras/banco.js");
    const { semPrecos } = await import("../src/lib/compras/projecao.js");
    const { recursoPorId } = await import("../src/lib/acessos/recursos.js");
    conferir("recurso de casar existe", recursoPorId("acao.compras.casarAliExpress")?.pai, "tela.compras.pedidos");
    const ali = await prisma.fornecedor.create({ data: { nome: "ZZ Ali Tela", estrangeiro: true } });
    await marcarFornecedorDoAliExpress(ali.id);
    const T1 = await criarProduto("ZZ-ALI-T1", { blingId: "15000000951", fornecedorRascunho: { nome: "Ali", descricao: "https://pt.aliexpress.com/item/7005006891567710.html" } });
    const falso = criarBlingFalso({ produtos: [noBling("ZZ-ALI-T1", 15000000951)] });
    const lista = fixture("lista");
    lista.pedidos = lista.pedidos.map((pedido) => ({ ...pedido, orderId: pedido.orderId.replace(/^9915/, "9935"), linhas: pedido.linhas.map((linha) => ({ ...linha, orderLineId: linha.orderLineId.replace(/^9915/, "9935"), productId: `7${linha.productId.slice(1)}` })) }));
    await importarLista(lista, { cliente: falso });
    const detalhes = fixture("detalhes");
    detalhes.detalhes[0].orderId = "9935244197193461";
    detalhes.rastreios[0].orderId = "9935244197193461";
    detalhes.rastreios[0].pacotes[0].itens[0].productId = "7005006891567710";
    await importarDetalhes(detalhes);
    const pa = await prisma.pedidoAliExpress.findUnique({ where: { externoId: "9935244197193461" }, include: { linhas: true } });
    const lido = await lerPedido(pa.pedidoId);
    const itemId = lido.itens[0].id;
    conferir(
      "cabecalho do AliExpress",
      [lido.origem, lido.aliexpress?.numero, lido.aliexpress?.loja, lido.aliexpress?.linkDoPedido, lido.imposto],
      ["ALIEXPRESS", "9935244197193461", "Lets Deal Store", "https://www.aliexpress.com/p/order/detail.html?orderId=9935244197193461", 47.14],
    );
    conferir("opcao e rastreio por item", [lido.aliexpress.opcaoPorItem[itemId], lido.aliexpress.rastreioPorItem[itemId]?.[0]?.codigo], ["Color Name: 2M", "NN446506474BR"]);
    const outro = await prisma.pedidoAliExpress.findUnique({ where: { externoId: "9935189636893461" } });
    const lidoOutro = await lerPedido(outro.pedidoId);
    conferir("linhas pendentes e aviso", [lidoOutro.aliexpress.linhasPendentes.length, lidoOutro.avisos.some((aviso) => aviso.includes("sem produto"))], [2, true]);
    conferir("pedido do Rise nao tem bloco do AliExpress", (await lerPedido((await prisma.pedidoDeCompra.create({ data: { fornecedorId: ali.id, numero: (await prisma.pedidoDeCompra.aggregate({ _max: { numero: true } }))._max.numero + 1 } })).id)).aliexpress, null);
    const busca = await listarPedidos({ busca: "9935244197193461" });
    conferir("lista busca pelo numero do AliExpress e marca a origem", [busca.total, busca.linhas[0]?.origem, busca.linhas[0]?.loja], [1, "ALIEXPRESS", "Lets Deal Store"]);
    conferir("busca por numero longo nao estoura o numero do pedido", (await listarPedidos({ busca: "99352441971934619" })).total, 0);
    conferir("lista: '!' de item sem produto", (await listarPedidos({ busca: "9935189636893461" })).linhas[0]?.alertas.some((motivo) => motivo.includes("sem produto")), true);
    conferir("lista: prazo de entrega pela previsao do pacote", (await listarPedidos({ busca: "9935244197193461" })).linhas[0]?.prazo, "10/11 a 19/11");
    await prisma.pacoteAliExpress.updateMany({ where: { pedidoAliExpressId: pa.id }, data: { ultimoEvento: "Objeto retido pela alfândega", ultimoCodigo: null } });
    conferir(
      "problema no rastreio: '!' na lista e aviso no pedido",
      [(await listarPedidos({ busca: "9935244197193461" })).linhas[0]?.alertas.some((motivo) => motivo.startsWith("Rastreio: Objeto retido")), (await lerPedido(pa.pedidoId)).avisos.some((motivo) => motivo.startsWith("Rastreio: Objeto retido"))],
      [true, true],
    );
    await prisma.pacoteAliExpress.updateMany({ where: { pedidoAliExpressId: pa.id }, data: { ultimoEvento: "Chegou ao armazém de consolidação", ultimoCodigo: "AE_CW_SIGN_IN_SUCCESS" } });
    // Coluna Produtos da lista (pedido do dono em 29/10/2026): nome e codigo do Rise de cada item.
    conferir("lista traz os produtos do pedido", busca.linhas[0]?.produtos, [{ sku: "ZZ-ALI-T1", nome: "PRODUTO ZZ-ALI-T1" }]);
    // Busca pelo produto (pedido do dono em 29/10/2026): codigo ou nome do Rise nos itens, e o titulo do item sem produto.
    const achados = async (texto) => (await listarPedidos({ busca: texto })).linhas.map((linha) => linha.codigo).filter((codigo) => [lido.codigo, lidoOutro.codigo].includes(codigo)).sort();
    conferir(
      "busca pelo codigo, pelo nome e pelo titulo do item sem produto",
      [await achados("zz-ali-t1"), await achados("produto zz-ali-t1"), await achados("resistor 10k")],
      [[lido.codigo], [lido.codigo], [lidoOutro.codigo]],
    );
    conferir("sem custo nao ve o preco das pendentes", semPrecos(lidoOutro).aliexpress.linhasPendentes[0].precoComprado, null);
    conferir(
      "pacotes do pedido para o bloco Frete",
      lido.aliexpress.pacotes,
      [
        {
          codigo: "NN446506474BR",
          transportadora: "AliExpress Selection Standard",
          status: "Chegou ao armazém de consolidação",
          statusEm: new Date(1793134276000).toISOString(),
          previsao: "10/11 a 19/11",
          itens: ["ZZ-ALI-T1"],
        },
      ],
    );
    conferir("um pacote so: a coluna Rastreio dos itens nao e necessaria", lido.aliexpress.pacotes.length, 1);
    conferir("fator por item para editar na tela", lido.aliexpress.fatorPorItem[itemId], { linhaId: pa.linhas[0].id, fator: 1 });
    conferir("produtos no site para o botao", lido.aliexpress.produtosNoSite.map((produto) => produto.url), ["https://www.aliexpress.com/item/1005006891567710.html"]);

    // MCP (pedido do dono em 29/10/2026): o status e a previsao de um produto pela conversa.
    const mcp = await import("../src/lib/mcp/compras.js");
    const tudo = { pode: () => true };
    const aCaminho = await mcp.comprasACaminhoDoProduto({ produto: "zz-ali-t1" }, tudo);
    const doT1 = aCaminho.produtos[0];
    conferir(
      "MCP: compras a caminho do produto",
      [aCaminho.produtos.length, doT1.sku, doT1.aCaminho, doT1.pedidos[0].faltaChegar, doT1.pedidos[0].aliexpress?.numero, doT1.pedidos[0].rastreio[0]?.codigo, doT1.pedidos[0].rastreio[0]?.previsao, doT1.pedidos[0].rastreio[0]?.status],
      [1, "ZZ-ALI-T1", 4, 4, "9935244197193461", "NN446506474BR", "10/11 a 19/11", "Chegou ao armazém de consolidação"],
    );
    conferir("MCP: produto sem compra a caminho", (await mcp.comprasACaminhoDoProduto({ produto: "ZZ-ALI-NADA" }, tudo)).produtos, []);
    conferir("MCP: sem ver pedidos recusa", await mcp.comprasACaminhoDoProduto({ produto: "ZZ-ALI-T1" }, { pode: () => false }).then(() => "passou", (erro) => (/não pode/i.test(erro.message) ? "recusou" : erro.message)), "recusou");
    const lidoPeloMcp = await mcp.lerPedidoDeCompra({ pedido: lido.codigo }, tudo);
    conferir("MCP: lerPedidoDeCompra traz o AliExpress e o rastreio", [lidoPeloMcp.aliexpress?.numero, lidoPeloMcp.aliexpress?.pacotes?.[0]?.codigo, lidoPeloMcp.aliexpress?.pacotes?.[0]?.previsao], ["9935244197193461", "NN446506474BR", "10/11 a 19/11"]);

    await prisma.pedidoAliExpress.update({ where: { id: pa.id }, data: { entregueEm: new Date("2026-10-27T12:00:00Z") } });
    conferir("entregue sem lancar avisa", (await lerPedido(pa.pedidoId)).avisos, ["Entregue no AliExpress em 27/10, falta lançar."]);
    conferir("lista: '!' de entregue sem lancar", (await listarPedidos({ busca: "9935244197193461" })).linhas[0]?.alertas, ["Entregue no AliExpress em 27/10, falta lançar."]);
    await prisma.itemDoPedidoDeCompra.update({ where: { id: itemId }, data: { quantidadeLancada: 4 } });
    conferir("entregue com tudo lancado: sem aviso", (await lerPedido(pa.pedidoId)).avisos, []);
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
