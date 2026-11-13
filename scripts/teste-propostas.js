import "dotenv/config";

/**
 * Testes das Propostas para cliente (spec 2026-11-12-propostas-para-cliente-design.md): regras puras, cliente (Rise e
 * Bling falso), gravacao e numeracao, PDF, link publico, pedido de venda contra o Bling falso e as ferramentas do MCP.
 * SEM rede.
 *
 *   npm run teste:propostas
 *
 * So escreve produtos, clientes e propostas ZZ-PROP-CLI-* / "ZZ Proposta *", apagados no comeco e no fim.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const regras = await import("../src/lib/propostas/regras.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`,
  );
}

// ---------------------------------------------------------------------------
// Regras puras
// ---------------------------------------------------------------------------

console.log("\nRegras das propostas");
conferir("numero", regras.numeroDaProposta(2026), "Proposta 2026");
conferir("hoje em SP perto da meia-noite", regras.hojeEmSaoPaulo(new Date("2026-11-13T02:30:00Z")), "2026-11-12");
conferir("validade padrao 15 dias", regras.validadePadrao("2026-11-25"), "2026-12-10");
conferir("data BR", regras.dataBR(new Date("2026-11-12T00:00:00Z")), "12/11/2026");
conferir("total do item com desconto", regras.totalDoItem({ quantidade: 3, precoUnitario: 10.5, descontoPercentual: 10 }), 28.35);
conferir("total do item 4 casas", regras.totalDoItem({ quantidade: 215, precoUnitario: 0.0385 }), 8.28);
conferir("total com quantidade fracionada", regras.totalDoItem({ quantidade: 2.5, precoUnitario: 4 }), 10);

const itens = [
  { quantidade: 2, precoUnitario: 100, descontoPercentual: 0, custoUnitario: 50 },
  { quantidade: 1, precoUnitario: 50, descontoPercentual: 10, custoUnitario: 20 },
];
conferir(
  "totais com CIF e desconto %",
  regras.totaisDaProposta({ itens, descontoTipo: "PERCENTUAL", descontoValor: 10, fretePorConta: "CIF", frete: 30 }),
  { subtotal: 245, desconto: 24.5, frete: 30, total: 250.5, numeroDeItens: 2, custo: 120, lucro: 100.5, markup: 83.75 },
);
conferir(
  "FOB nao soma o frete",
  regras.totaisDaProposta({ itens, descontoTipo: "VALOR", descontoValor: 5, fretePorConta: "FOB", frete: 30 }).total,
  240,
);
conferir(
  "item sem custo zera o lucro do total",
  regras.totaisDaProposta({ itens: [...itens, { quantidade: 1, precoUnitario: 10 }] }).lucro,
  null,
);
conferir("desconto maior que o subtotal", regras.totaisDaProposta({ itens, descontoTipo: "VALOR", descontoValor: 999 }).total, 0);
conferir("markup do item", regras.markupDoItem({ quantidade: 2, precoUnitario: 100, custoUnitario: 50 }), 100);
conferir("markup sem custo", regras.markupDoItem({ quantidade: 2, precoUnitario: 100 }), null);

conferir("prazo pronta entrega", regras.textoDoPrazo({ prontaEntrega: true, prazoDiasUteis: 5 }), "Pronta entrega");
conferir("prazo 1 dia", regras.textoDoPrazo({ prontaEntrega: false, prazoDiasUteis: 1 }), "1 dia útil");
conferir(
  "prazo geral = o maior",
  regras.prazoGeral([{ prontaEntrega: true }, { prontaEntrega: false, prazoDiasUteis: 10 }, { prontaEntrega: false, prazoDiasUteis: 3 }]),
  "10 dias úteis",
);
conferir("prazo geral todos prontos", regras.prazoGeral([{ prontaEntrega: true }]), "Pronta entrega");

conferir("contato hoje", regras.precisaContato({ situacao: "ENVIADA", proximoContato: "2026-11-12" }, "2026-11-12"), true);
conferir("contato passado", regras.precisaContato({ situacao: "EM_NEGOCIACAO", proximoContato: "2026-11-01" }, "2026-11-12"), true);
conferir("contato futuro", regras.precisaContato({ situacao: "ENVIADA", proximoContato: "2026-11-13" }, "2026-11-12"), false);
conferir("contato de aprovada nao", regras.precisaContato({ situacao: "APROVADA", proximoContato: "2026-11-01" }, "2026-11-12"), false);
conferir("vence no dia seguinte", regras.deveVencer({ situacao: "ENVIADA", validadeAte: "2026-11-11" }, "2026-11-12"), true);
conferir("o dia da validade ainda vale", regras.deveVencer({ situacao: "ENVIADA", validadeAte: "2026-11-12" }, "2026-11-12"), false);
conferir("recusada nao vence", regras.deveVencer({ situacao: "RECUSADA", validadeAte: "2026-11-01" }, "2026-11-12"), false);
conferir("rascunho -> aprovada", regras.podeIrPara("RASCUNHO", "APROVADA"), true);
conferir("aprovada -> recusada nao", regras.podeIrPara("APROVADA", "RECUSADA"), false);

conferir(
  "texto do pagamento",
  regras.textoDoPagamento({ condicaoNome: "28/56 dias", formaPagamento: "Boleto", parcelas: 2, entradaPercentual: 30, pagamentoTexto: " Sem juros " }),
  "28/56 dias · Boleto · 2x · entrada de 30%\nSem juros",
);
conferir(
  "pendencias do PDF",
  regras.pendenciasDoPdf({ clienteNome: "", itens: [{ descricaoCliente: "" }, { descricaoCliente: "x" }] }),
  ["Informe o cliente.", "1 item(ns) sem a descrição do cliente."],
);
conferir("whatsapp sem telefone", regras.linkDoWhatsApp("", "oi"), null);
conferir("whatsapp", regras.linkDoWhatsApp("54988990008", "a b"), "https://wa.me/5554988990008?text=a%20b");
conferir("frete com explicacao", regras.TEXTO_DO_FRETE.FOB, "FOB (frete por conta do cliente)");

// ---------------------------------------------------------------------------
// Banco: limpeza e documentos de teste
// ---------------------------------------------------------------------------

const { prisma } = await import("../src/lib/db.js");
const { criarBlingFalso } = await import("./lib/blingFalso.js");

/** CPF valido a partir de 9 digitos (os documentos de teste comecam por 99999, longe dos reais). */
function cpfDeTeste(base9) {
  const d = String(base9).padStart(9, "0").split("").map(Number);
  const dv = (pesos) => {
    const resto = pesos.reduce((s, p, i) => s + d[i] * p, 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  d.push(dv([10, 9, 8, 7, 6, 5, 4, 3, 2]));
  d.push(dv([11, 10, 9, 8, 7, 6, 5, 4, 3, 2]));
  return d.join("");
}
function cnpjDeTeste(base12) {
  const d = String(base12).padStart(12, "0").split("").map(Number);
  const dv = (pesos) => {
    const resto = pesos.reduce((s, p, i) => s + d[i] * p, 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  d.push(dv([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  d.push(dv([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]));
  return d.join("");
}

async function limpar() {
  const clientes = await prisma.cliente.findMany({ where: { nome: { startsWith: "ZZ Proposta" } }, select: { id: true } });
  const ids = clientes.map((c) => c.id);
  await prisma.propostaParaCliente.deleteMany({ where: { OR: [{ clienteNome: { startsWith: "ZZ Proposta" } }, { clienteId: { in: ids } }] } });
  await prisma.cliente.deleteMany({ where: { id: { in: ids } } });
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-PROP-CLI-" } } });
  await prisma.padraoDeProposta.deleteMany({ where: { nome: { startsWith: "ZZ Proposta" } } });
}
await limpar();

const CPF_A = cpfDeTeste(999990001);
const CPF_B = cpfDeTeste(999990002);
const CNPJ_C = cnpjDeTeste(999990000301);
const CPF_D = cpfDeTeste(999990004);
for (const doc of [CPF_A, CPF_B, CNPJ_C, CPF_D]) {
  const formatado = doc.length === 11 ? `${doc.slice(0, 3)}.${doc.slice(3, 6)}.${doc.slice(6, 9)}-${doc.slice(9)}` : `${doc.slice(0, 2)}.${doc.slice(2, 5)}.${doc.slice(5, 8)}/${doc.slice(8, 12)}-${doc.slice(12)}`;
  if (await prisma.cliente.findUnique({ where: { documento: formatado } })) throw new Error(`Documento de teste ${formatado} já existe num cliente real: troque a base.`);
}

let terminou = false;
try {
  // -------------------------------------------------------------------------
  // Cliente da proposta
  // -------------------------------------------------------------------------
  console.log("\nCliente da proposta");
  const cliente = await import("../src/lib/propostas/cliente.js");

  conferir("documento invalido", cliente.documentoValido("123.456.789-00"), null);
  conferir("cnpj valido", cliente.documentoValido(CNPJ_C)?.tipoPessoa, "JURIDICA");

  const noRise = await prisma.cliente.create({
    data: { nome: "ZZ Proposta Rise Ltda", tipoPessoa: "FISICA", documento: cliente.documentoValido(CPF_A).formatado, telefone: "54988990008" },
  });
  const falso = criarBlingFalso({
    contatos: [
      { id: 17000000001, nome: "ZZ Proposta Bling SA", numeroDocumento: CNPJ_C, tipo: "J", fantasia: "ZZ Bling", ie: "123", celular: "54988990001", email: "b@zz.test", endereco: { geral: { endereco: "Rua Z", numero: "10", bairro: "Centro", cep: "95000000", municipio: "Caxias do Sul", uf: "RS" } }, tiposContato: [{ descricao: "Cliente" }] },
      { id: 17000000002, nome: "ZZ Proposta Sem Doc", numeroDocumento: "", tipo: "F", celular: "54988990002", tiposContato: [{ descricao: "Cliente" }] },
      { id: 17000000003, nome: "ZZ Proposta Rise Ltda", numeroDocumento: CPF_A, tipo: "F", tiposContato: [{ descricao: "Cliente" }] },
      { id: 17000000004, nome: "ZZ Proposta Excluido", numeroDocumento: CPF_D, situacao: "E", tiposContato: [{ descricao: "Cliente" }] },
    ],
  });
  const opcoes = { bling: falso, exigirEscrita: () => falso.exigirEscrita("ZZ-CLIENTE") };

  const busca = await cliente.buscarClienteParaProposta("ZZ Proposta", opcoes);
  conferir("busca: o do Rise vem do Rise", busca.rise.map((c) => c.nome), ["ZZ Proposta Rise Ltda"]);
  conferir(
    "busca: Bling sem o que ja esta no Rise e sem excluido",
    busca.bling.map((c) => c.nome).sort(),
    ["ZZ Proposta Bling SA", "ZZ Proposta Sem Doc"],
  );
  const pelaBuscaDoc = await cliente.buscarClienteParaProposta(CNPJ_C, opcoes);
  conferir("busca pelo CNPJ acha no Bling", pelaBuscaDoc.bling.map((c) => c.blingId), ["17000000001"]);
  const quebrado = { get: async () => ({ ok: false, status: 500 }) };
  const comErro = await cliente.buscarClienteParaProposta("ZZ Proposta", { bling: quebrado });
  conferir("Bling fora do ar nao some com o Rise", [comErro.rise.length, Boolean(comErro.erroBling)], [1, true]);

  const semDoc = await cliente.copiarContatoDoBling(17000000002, opcoes);
  conferir("contato sem documento vira provisorio", [semDoc.clienteId, semDoc.provisorio?.nome, semDoc.provisorio?.telefone], [null, "ZZ Proposta Sem Doc", "54988990002"]);
  const copiado = await cliente.copiarContatoDoBling(17000000001, opcoes);
  const lido = await prisma.cliente.findUnique({ where: { id: copiado.clienteId }, include: { enderecos: true } });
  conferir(
    "copia do Bling com endereco e id",
    [lido.tipoPessoa, lido.blingContatoId, lido.nomeFantasia, lido.enderecos[0]?.cidade, lido.enderecos[0]?.cep],
    ["JURIDICA", "17000000001", "ZZ Bling", "Caxias do Sul", "95000-000"],
  );
  const deNovo = await cliente.copiarContatoDoBling(17000000001, opcoes);
  conferir("copiar de novo nao duplica", deNovo.clienteId, copiado.clienteId);
  const ligado = await cliente.copiarContatoDoBling(17000000003, opcoes);
  conferir(
    "documento ja no Rise so liga o id",
    [ligado.clienteId, (await prisma.cliente.findUnique({ where: { id: noRise.id } })).blingContatoId],
    [noRise.id, "17000000003"],
  );

  conferir("provisorio sem documento continua provisorio", await cliente.garantirClienteDaProposta({ nome: "ZZ Proposta X" }, opcoes), { clienteId: null });
  conferir("documento invalido recusa", (await cliente.garantirClienteDaProposta({ nome: "ZZ Proposta X", documento: "111.111.111-11" }, opcoes)).erro, "CPF/CNPJ inválido.");
  const novo = await cliente.garantirClienteDaProposta({ nome: "ZZ Proposta Nova", documento: CPF_B, telefone: "(54) 98899-0003", email: "n@zz.test" }, opcoes);
  const novoLido = await prisma.cliente.findUnique({ where: { id: novo.clienteId } });
  const noFalso = falso.estado.contatos.get(Number(novoLido.blingContatoId));
  conferir(
    "documento novo cria no Rise e no Bling",
    [novo.avisoBling, novoLido.telefone, noFalso?.numeroDocumento, noFalso?.tiposContato?.[0]?.descricao, noFalso?.tipo],
    [null, "54988990003", CPF_B, "Cliente", "F"],
  );
  const repetido = await cliente.garantirClienteDaProposta({ nome: "ZZ Proposta Nova", documento: CPF_B }, opcoes);
  conferir("o mesmo documento de novo nao duplica", [repetido.clienteId, falso.estado.contatos.size], [novo.clienteId, 5]);

  const recusa = await cliente.garantirClienteDaProposta(
    { nome: "ZZ Proposta Travada", documento: CPF_D },
    { bling: falso, exigirEscrita: () => { throw new Error("Escrita bloqueada: BLING_ESCRITA está false"); } },
  );
  conferir(
    "Bling travado: cria no Rise e avisa",
    [Boolean(recusa.clienteId), /bloqueada/.test(recusa.avisoBling ?? "")],
    [true, true],
  );
  const reenvio = await cliente.enviarClienteAoBling(recusa.clienteId, opcoes);
  conferir("Enviar ao Bling depois cria la", [reenvio.ok, Boolean(reenvio.blingContatoId)], [true, true]);

  // -------------------------------------------------------------------------
  // Gravacao, numeracao, situacao e lista
  // -------------------------------------------------------------------------
  console.log("\nGravação das propostas");
  const banco = await import("../src/lib/propostas/banco.js");
  const produto = await prisma.produto.create({
    data: { sku: "ZZ-PROP-CLI-1", tituloBase: "PRODUTO ZZ-PROP-CLI-1", ativo: true, unidade: "UN", precoVenda: 100, custo: 40 },
  });

  const [p1, p2] = await Promise.all([banco.criarProposta({ login: "zz", nome: "ZZ" }), banco.criarProposta({ login: "zz" })]);
  conferir("duas ao mesmo tempo: numeros diferentes e seguidos", Math.abs(p1.numero - p2.numero), 1);
  conferir("numeracao a partir de 2026", Math.min(p1.numero, p2.numero) >= 2026, true);
  const nova = await banco.lerProposta(p1.numero, { hoje: "2026-11-12" });
  conferir("nasce rascunho, com garantia e validade", [nova.situacao, Boolean(nova.garantia), nova.validadeAte >= regras.hojeEmSaoPaulo()], ["RASCUNHO", true, true]);

  const doProduto = await banco.produtoParaProposta(produto.id);
  conferir("item copia o produto", [doProduto.codigoInterno, doProduto.precoUnitario, doProduto.custoUnitario, doProduto.unidade], ["ZZ-PROP-CLI-1", 100, 40, "UN"]);
  const achados = await banco.buscarProdutosParaProposta("zz-prop-cli");
  conferir("busca de produto", achados.map((a) => a.sku), ["ZZ-PROP-CLI-1"]);

  const entrada = {
    clienteNome: "ZZ Proposta Provisorio",
    clienteTelefone: "54988990009",
    validadeAte: "2026-12-01",
    proximoContato: "2026-11-10",
    fretePorConta: "CIF",
    frete: "30,00",
    desconto: "10%",
    observacoesInternas: "so nossa",
    itens: [
      { ...doProduto, descricaoCliente: "Módulo relé 5V conforme cotação", codigoCliente: "PN-1", quantidade: "2", prazoDiasUteis: "5" },
      { ...doProduto, descricaoCliente: "O mesmo, outra descrição", quantidade: "1", descontoPercentual: "10" },
      { descricaoCliente: "Item avulso", quantidade: "3", unidade: "PC", precoUnitario: "10", custoUnitario: "4" },
    ],
  };
  const salvo = await banco.salvarProposta(p1.numero, entrada, { hoje: "2026-11-12" });
  conferir("salva o provisorio sem documento", [salvo.ok, salvo.avisoBling], [true, null]);
  const lida = await banco.lerProposta(p1.numero, { hoje: "2026-11-12" });
  conferir(
    "provisorio fica so na proposta",
    [lida.clienteId, lida.clienteNome, await prisma.cliente.count({ where: { nome: "ZZ Proposta Provisorio" } })],
    [null, "ZZ Proposta Provisorio", 0],
  );
  conferir(
    "itens: mesmo produto duas vezes e avulso",
    lida.itens.map((i) => [Boolean(i.produtoId), i.descricaoCliente, i.prontaEntrega, i.prazoDiasUteis]),
    [[true, "Módulo relé 5V conforme cotação", false, 5], [true, "O mesmo, outra descrição", true, null], [false, "Item avulso", true, null]],
  );
  conferir("totais lidos", [lida.totais.subtotal, lida.totais.desconto, lida.totais.frete, lida.totais.total], [320, 32, 30, 318]);
  conferir("o \"!\" de contato", lida.precisaContato, true);
  conferir("sem custo corta", banco.semCusto(lida).itens.map((i) => i.custoUnitario).concat(banco.semCusto(lida).totais.lucro), [null, null, null, null]);

  const ruim = await banco.salvarProposta(p1.numero, { ...entrada, itens: [{ descricaoCliente: "x", quantidade: "0" }] }, { hoje: "2026-11-12" });
  conferir("quantidade zero recusa", ruim.erros?.["itens.0.quantidade"], "Informe a quantidade.");

  // Quem nao ve custo manda os itens sem ele: o custo gravado fica.
  const semCustoNaEntrada = { ...entrada, itens: lida.itens.map((i) => ({ ...i, custoUnitario: null })) };
  await banco.salvarProposta(p1.numero, semCustoNaEntrada, { manterCusto: true, hoje: "2026-11-12" });
  conferir("manterCusto preserva", (await banco.lerProposta(p1.numero)).itens.map((i) => i.custoUnitario), [40, 40, 4]);

  // Com documento: vira cliente na hora (Rise e Bling falso).
  const falso2 = falso; // o mesmo falso: dois falsos gerariam o mesmo id de contato
  const comDoc = await banco.salvarProposta(
    p2.numero,
    { ...entrada, clienteNome: "ZZ Proposta Com Doc", clienteDocumento: cnpjDeTeste(999990000501) },
    { hoje: "2026-11-12", bling: falso2, exigirEscrita: () => falso2.exigirEscrita("ZZ-CLIENTE") },
  );
  const lidaComDoc = await banco.lerProposta(p2.numero);
  conferir("documento cria o cliente e liga", [comDoc.ok, comDoc.avisoBling, Boolean(lidaComDoc.clienteId), Boolean(lidaComDoc.cliente?.blingContatoId)], [true, null, true, true]);

  conferir("rascunho nao vai para vencida pelo botao", (await banco.mudarSituacao(p1.numero, "VENCIDA")).ok, false);
  conferir("recusar sem motivo", (await banco.mudarSituacao(p1.numero, "RECUSADA")).erro, "Escolha o motivo da recusa.");
  await banco.marcarEnviada(p1.numero);
  conferir("PDF marca enviada", (await banco.lerProposta(p1.numero)).situacao, "ENVIADA");
  await banco.mudarSituacao(p1.numero, "RECUSADA", { motivo: "PRECO", motivoTexto: "caro" });
  const recusada = await banco.lerProposta(p1.numero);
  conferir("recusada com motivo e so leitura", [recusada.situacao, recusada.motivoRecusa, recusada.soLeitura, recusada.precisaContato], ["RECUSADA", "PRECO", true, false]);
  conferir("recusada nao salva", (await banco.salvarProposta(p1.numero, entrada)).ok, false);
  await banco.mudarSituacao(p1.numero, "EM_NEGOCIACAO");
  conferir("reabrir apaga o motivo", (await banco.lerProposta(p1.numero)).motivoRecusa, null);

  conferir("registrar contato sem texto", (await banco.registrarContato(p1.numero, { texto: " " })).ok, false);
  await banco.registrarContato(p1.numero, { texto: "Ligou, vai ver com o chefe", proximoContato: "2099-01-01", quem: "zz" });
  const comContato = await banco.lerProposta(p1.numero, { hoje: "2026-11-12" });
  conferir("contato registrado tira o \"!\"", [comContato.contatos.length, comContato.precisaContato, comContato.proximoContato], [1, false, "2099-01-01"]);

  const venceram = await banco.vencerPropostas({ hoje: "2026-12-02", numeros: [p1.numero, p2.numero] });
  conferir("vence sozinha depois da validade", [venceram === 2, (await banco.lerProposta(p1.numero)).situacao], [true, "VENCIDA"]);
  await banco.salvarProposta(p1.numero, { ...entrada, validadeAte: "2099-12-31" });
  conferir("validade de volta ao futuro reabre", (await banco.lerProposta(p1.numero)).situacao, "EM_NEGOCIACAO");

  const lista = await banco.listarPropostas({ busca: "ZZ Proposta", ordenar: "numero", direcao: "asc" });
  conferir("lista pelo cliente, ordenada", lista.linhas.map((l) => l.numero), [p1.numero, p2.numero].sort((a, b) => a - b));
  const peloPart = await banco.listarPropostas({ busca: "PN-1" });
  conferir("lista pelo codigo do cliente", peloPart.linhas.length >= 2, true);
  conferir("excluir so rascunho", (await banco.excluirProposta(p1.numero)).ok, false);

  // -------------------------------------------------------------------------
  // Pedido de venda no Bling (falso), anexos e link publico
  // -------------------------------------------------------------------------
  console.log("\nPedido de venda, anexos e link público");
  const pedido = await import("../src/lib/propostas/pedidoDeVenda.js");
  falso.estado.produtos.set(15000009001, { id: 15000009001, codigo: "ZZ-PROP-CLI-1", nome: "Produto", preco: 100, situacao: "A", formato: "S", tipo: "P" });
  await prisma.produto.update({ where: { id: produto.id }, data: { blingId: "15000009001" } });
  const exigir = (codigo) => falso.exigirEscrita(codigo);
  await banco.salvarProposta(p2.numero, { ...entrada, clienteNome: "ZZ Proposta Com Doc", clienteDocumento: cnpjDeTeste(999990000501), ocCliente: "OC-77", observacoesNf: "Pedido OC-77", validadeAte: "2099-12-31" }, { bling: falso, exigirEscrita: () => falso.exigirEscrita("ZZ-CLIENTE") });
  conferir("pedido so de aprovada", (await pedido.gerarPedidoDeVenda(p2.numero, { bling: falso, exigirEscrita: exigir })).ok, false);
  await banco.mudarSituacao(p2.numero, "APROVADA");
  const comAvulso = await pedido.gerarPedidoDeVenda(p2.numero, { bling: falso, exigirEscrita: exigir });
  conferir("item avulso recusa com o motivo", /sem produto do Rise/.test(comAvulso.erro ?? ""), true);
  conferir("recusa solta a marca", (await prisma.propostaParaCliente.findUnique({ where: { numero: p2.numero } })).pedidoDeVendaEm, null);
  await banco.mudarSituacao(p2.numero, "EM_NEGOCIACAO");
  await banco.salvarProposta(p2.numero, { ...entrada, clienteNome: "ZZ Proposta Com Doc", clienteDocumento: cnpjDeTeste(999990000501), ocCliente: "OC-77", observacoesNf: "Pedido OC-77", validadeAte: "2099-12-31", itens: entrada.itens.slice(0, 2) }, { bling: falso, exigirEscrita: () => falso.exigirEscrita("ZZ-CLIENTE") });
  await banco.mudarSituacao(p2.numero, "APROVADA");
  const gerado = await pedido.gerarPedidoDeVenda(p2.numero, { bling: falso, exigirEscrita: exigir });
  const noBling = falso.estado.pedidosDeVenda.get(Number(gerado.blingPedidoId));
  conferir(
    "pedido criado com OC, itens, desconto e frete",
    [gerado.ok, noBling?.numeroPedidoCompra, noBling?.itens?.length, noBling?.itens?.[1]?.desconto, noBling?.desconto, noBling?.transporte?.fretePorConta, noBling?.transporte?.frete, noBling?.observacoes],
    [true, "OC-77", 2, 10, { valor: 29, unidade: "REAL" }, 0, 30, "Pedido OC-77"],
  );
  conferir("internas levam o numero da proposta", /Proposta \d+ do Rise/.test(noBling?.observacoesInternas ?? ""), true);
  const deNovoPedido = await pedido.gerarPedidoDeVenda(p2.numero, { bling: falso, exigirEscrita: exigir });
  conferir("repetir nao duplica", [deNovoPedido.blingPedidoId, deNovoPedido.jaExistia, falso.estado.pedidosDeVenda.size], [gerado.blingPedidoId, true, 1]);

  const arquivos = await import("../src/lib/propostas/arquivos.js");
  const pdfFalso = new File([Buffer.from("%PDF-1.4 cotacao")], "cotacao do cliente.pdf");
  const xlsxFalso = new File([Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])], "itens.xlsx");
  const txt = new File([Buffer.from("texto")], "x.txt");
  conferir("anexo recusa formato", (await arquivos.anexarCotacao(p2.numero, [txt])).ok, false);
  conferir("anexa pdf e planilha", (await arquivos.anexarCotacao(p2.numero, [pdfFalso, xlsxFalso])).anexados, 2);
  const anexos = (await banco.lerProposta(p2.numero)).anexos;
  conferir("planilha guarda a extensao", anexos.map((a) => a.arquivo.split(".").pop()).sort(), ["pdf", "xlsx"]);
  const lidoAnexo = await arquivos.lerAnexo(anexos.find((a) => a.nomeOriginal.endsWith(".pdf")).id);
  conferir("le o anexo de volta", [lidoAnexo.nomeOriginal, lidoAnexo.tipo], ["cotacao do cliente.pdf", "application/pdf"]);
  await arquivos.excluirAnexo(p2.numero, anexos[0].id);
  conferir("exclui o anexo", (await banco.lerProposta(p2.numero)).anexos.length, 1);

  const link = await import("../src/lib/propostas/linkPublico.js");
  const l1 = await link.linkPublicoDaProposta(p2.numero);
  const l2 = await link.linkPublicoDaProposta(p2.numero);
  conferir("link publico nao muda", [l1.ok, l1.url === l2.url, /\/p\/proposta\/[A-Za-z0-9_-]{43}$/.test(l1.url)], [true, true, true]);
  const chave = l1.url.split("/").pop();
  conferir("chave abre a proposta", (await link.propostaPelaChavePublica(chave))?.numero, p2.numero);
  conferir("chave errada nao abre", await link.propostaPelaChavePublica("x".repeat(43)), null);
  // PDF e pagina publica: a descricao e o codigo do CLIENTE entram; nosso codigo, custo e internas nunca.
  const { conteudoDaProposta } = await import("../src/lib/propostas/conteudo.js");
  const { pdfDaProposta } = await import("../src/lib/propostas/pdf.js");
  const { htmlDaProposta } = await import("../src/lib/propostas/paginaPublica.js");
  const paraPdf = await banco.lerProposta(p2.numero);
  const empresaFalsa = { razaoSocial: "ZZ Empresa", nomeFantasia: "ZZ Loja", cnpj: "00.000.000/0001-00", endereco: "Rua", cidade: "Caxias", uf: "RS", cep: "95000-000", telefone: "5432900870", celular: "54981222300", whatsappTecnico: "54996050390", site: "www.4hobby.com.br", email: "contato@4hobby.com.br" };
  const conteudo = conteudoDaProposta(paraPdf, empresaFalsa);
  const tudo = JSON.stringify(conteudo);
  conferir(
    "PDF: descricao e codigo do cliente, OC e frete com explicacao",
    [conteudo.itens[0].celulas.descricao, conteudo.itens[0].celulas.codigo, /OC-77/.test(tudo), /CIF \(frete por nossa conta\)/.test(tudo)],
    ["Módulo relé 5V conforme cotação", "PN-1", true, true],
  );
  conferir("PDF: nunca nosso codigo, custo nem internas", [tudo.includes("ZZ-PROP-CLI-1"), tudo.includes("so nossa"), /custo/i.test(tudo)], [false, false, false]);
  // Cabecalho no molde da cotacao que o dono mandou (13/11/2026): nome, contatos com link, quadro, entrega e faixa.
  conferir("PDF: nome no topo e endereco da empresa", [conteudo.nomeDaEmpresa, conteudo.empresa[0], conteudo.site?.url], ["4hobby Indústria, Comércio e Importação", "Rua", "https://www.4hobby.com.br"]);
  conferir(
    "PDF: so o WhatsApp tem link (fixo e e-mail sem)",
    conteudo.contatos.map((ct) => [ct.tipo, ct.url]),
    [["fone", null], ["whatsapp", "https://wa.me/5554981222300"], ["whatsapp", "https://wa.me/5554996050390"], ["email", null]],
  );
  conferir("PDF: faixa com validade, pagamento, prazo, envio e vendedor", conteudo.faixa.map(([r]) => r), ["Validade da proposta", "Condições de pagamento", "Prazo de entrega", "Método de envio", "Garantia", "Vendedor"]);
  conferir(
    "PDF: quadro do total com frete e impostos",
    [conteudo.linhasDeTotal.map(([r]) => r).slice(-2), conteudoDaProposta({ ...paraPdf, fretePorConta: "FOB" }, empresaFalsa).linhasDeTotal.find(([r]) => r === "Frete")[1]],
    [["Frete", "Impostos"], "Por conta do cliente"],
  );
  const comAc = conteudoDaProposta(
    { ...paraPdf, contatoId: "ct1", contatoNome: "Ana Souza", cliente: { contatos: [{ id: "ct1", nome: "Ana Souza", cargo: "Compras", telefone: "54988990008", email: "ana@zz.com" }] } },
    empresaFalsa,
  ).cliente;
  conferir("PDF: A/C com cargo, telefone e e-mail do contato do cadastro", [comAc.ac, comAc.acLinha], ["A/C: Ana Souza", "Compras · (54) 98899-0008 · ana@zz.com"]);
  const { prazoDaGarantia } = await import("../src/lib/propostas/conteudo.js");
  conferir(
    "PDF: garantia so com o prazo",
    [prazoDaGarantia("Garantia de 90 dias contra defeito de fabricação."), prazoDaGarantia("12 meses"), prazoDaGarantia("Sem garantia"), prazoDaGarantia("")],
    ["90 dias", "12 meses", "Sem garantia", "—"],
  );
  const { validadeEmDias } = await import("../src/lib/propostas/conteudo.js");
  conferir(
    "PDF: validade em dias a partir da data da proposta",
    [
      validadeEmDias({ atualizadoEm: new Date("2026-11-12T15:00:00Z"), validadeAte: "2026-11-27" }),
      validadeEmDias({ atualizadoEm: new Date("2026-11-26T15:00:00Z"), validadeAte: "2026-11-27" }),
      validadeEmDias({ atualizadoEm: new Date("2026-11-28T15:00:00Z"), validadeAte: "2026-11-27" }),
    ],
    ["15 dias", "1 dia", "Vencida em 27/11/2026"],
  );
  conferir("PDF: metodo de envio leva o frete por conta", conteudo.faixa[3][1].startsWith("CIF (frete por nossa conta)"), true);
  conferir("PDF: entregar em sem endereco = a combinar", conteudo.entrega, ["A combinar"]);
  conferir("PDF: entregar em de quem retira", conteudoDaProposta({ ...paraPdf, fretePorConta: "RETIRA" }, empresaFalsa).entrega, ["Retirada pelo cliente na 4hobby"]);
  conferir(
    "PDF: entregar em usa o endereco de entrega",
    conteudoDaProposta({ ...paraPdf, cliente: { enderecos: [{ tipo: "GERAL", logradouro: "Rua A", numero: "1" }, { tipo: "ENTREGA", logradouro: "Rua B", numero: "2", cidade: "Caxias", uf: "RS" }] } }, empresaFalsa).entrega,
    ["Rua B, 2", "Caxias - RS"],
  );
  const bytesDoPdf = await pdfDaProposta(paraPdf, empresaFalsa, {});
  conferir("PDF gerado", bytesDoPdf.subarray(0, 5).toString("latin1"), "%PDF-");
  const html = htmlDaProposta(paraPdf, empresaFalsa, {});
  conferir("pagina publica sem script e sem internas", [/<script/i.test(html), html.includes("so nossa"), html.includes("Módulo relé 5V")], [false, false, true]);

  // -------------------------------------------------------------------------
  // Padroes de proposta, marca/modelo, faturamento minimo e ficha cadastral (13/11/2026)
  // -------------------------------------------------------------------------
  console.log("\nPadroes de proposta");
  const padroes = await import("../src/lib/propostas/padroes.js");
  conferir("padrao: nome e validade obrigatorios", Object.keys(padroes.conferirPadrao({ nome: "", validadeDias: "0" }).erros).sort(), ["nome", "validadeDias"]);
  conferir("padrao: forma de pagamento fora da lista", Boolean(padroes.conferirPadrao({ nome: "X", validadeDias: "30", formaPagamento: "Cheque" }).erros?.formaPagamento), true);
  const salvoPadrao = await padroes.salvarPadrao(null, {
    nome: "ZZ Proposta Padrao SENAI",
    validadeDias: "30",
    formaPagamento: "Transferência",
    pagamentoTexto: "Depósito, 15 dias da entrega",
    fretePorConta: "CIF",
    exigeMarcaModelo: true,
    exigencias: "1. Marca e modelo\n\n2. Impostos inclusos ",
  });
  conferir("padrao: grava", salvoPadrao.ok, true);
  conferir("padrao: nome repetido", (await padroes.salvarPadrao(null, { nome: "ZZ Proposta Padrao SENAI", validadeDias: "10" })).erros?.nome, "Já existe um padrão com este nome.");
  const lidoPadrao = await padroes.lerPadrao(salvoPadrao.id);
  conferir(
    "padrao: campos que vao para a proposta",
    regras.camposDoPadrao(lidoPadrao, { hoje: "2026-11-13" }),
    { padraoId: salvoPadrao.id, validadeAte: "2026-12-13", fretePorConta: "CIF", formaPagamento: "Transferência", pagamentoTexto: "Depósito, 15 dias da entrega" },
  );
  conferir("padrao: exigencias uma por linha, sem vazias", regras.linhasDasExigencias(lidoPadrao.exigencias), ["1. Marca e modelo", "2. Impostos inclusos"]);
  conferir(
    "pendencia: sem marca ou modelo quando o padrao exige",
    regras.pendenciasDoPdf({ clienteNome: "X", itens: [{ descricaoCliente: "a", marca: "OEM", modelo: "" }], exigeMarcaModelo: true }),
    ["1 item(ns) sem marca ou modelo (o padrão do cliente exige)."],
  );
  conferir("pendencia: sem exigencia nao pede marca", regras.pendenciasDoPdf({ clienteNome: "X", itens: [{ descricaoCliente: "a" }] }), []);
  conferir("faturamento minimo no formato do SENAI", [regras.textoDoFaturamentoMinimo(50), regras.textoDoFaturamentoMinimo(null)], ["Valor para faturamento mínimo: R$ 50,00", null]);

  // A p2 ja foi aprovada (pedido de venda): reabre para editar.
  await banco.mudarSituacao(p2.numero, "EM_NEGOCIACAO");
  const comPadrao = await banco.lerProposta(p2.numero);
  const entradaComPadrao = {
    ...comPadrao,
    padraoId: salvoPadrao.id,
    desconto: "",
    itens: comPadrao.itens.map((item, i) => ({ ...item, marca: i === 0 ? "GENÉRICA" : null, modelo: i === 0 ? "HTS-315" : null })),
  };
  const salvaComPadrao = await banco.salvarProposta(p2.numero, entradaComPadrao);
  if (!salvaComPadrao.ok) console.log(JSON.stringify(salvaComPadrao));
  const relida = await banco.lerProposta(p2.numero);
  conferir("proposta: grava o padrao e a marca/modelo do item", [salvaComPadrao.ok, relida.padrao?.nome, relida.itens[0].marca, relida.itens[0].modelo], [true, "ZZ Proposta Padrao SENAI", "GENÉRICA", "HTS-315"]);
  const conteudoComPadrao = conteudoDaProposta(relida, { ...empresaFalsa, faturamentoMinimo: 50 });
  conferir(
    "PDF: coluna Marca / Modelo e faturamento minimo",
    [conteudoComPadrao.colunas.some((c) => c.chave === "marca"), conteudoComPadrao.itens[0].celulas.marca, conteudoComPadrao.blocos.some(([titulo, texto]) => titulo === "Faturamento mínimo" && texto.includes("R$ 50,00"))],
    [true, "GENÉRICA / HTS-315", true],
  );
  conferir("PDF: sem marca e sem padrao, a coluna nao aparece", conteudoDaProposta({ ...relida, padrao: null, itens: relida.itens.map((i) => ({ ...i, marca: null, modelo: null })) }, empresaFalsa).colunas.some((c) => c.chave === "marca"), false);
  conferir(
    "PDF: cliente comum (sem padrao) nao ve o faturamento minimo",
    conteudoDaProposta({ ...relida, padrao: null }, { ...empresaFalsa, faturamentoMinimo: 50 }).blocos.some(([titulo]) => titulo === "Faturamento mínimo"),
    false,
  );
  const pdfComPadrao = await pdfDaProposta(relida, { ...empresaFalsa, faturamentoMinimo: 50 }, {});
  conferir("PDF com marca gerado", pdfComPadrao.subarray(0, 5).toString("latin1"), "%PDF-");

  await prisma.cliente.update({ where: { id: noRise.id }, data: { padraoPropostaId: salvoPadrao.id } });
  conferir("padrao em uso por cliente nao sai", (await padroes.excluirPadrao(salvoPadrao.id)).ok, false);

  console.log("\nFicha cadastral do cliente");
  const arquivosDoCliente = await import("../src/lib/clientes/arquivos.js");
  const fichaFalsa = new File([Buffer.from("%PDF-1.4\n%falso\n")], "Cartao CNPJ.pdf", { type: "application/pdf" });
  conferir("ficha: recusa o que nao e PDF, imagem ou planilha", (await arquivosDoCliente.anexarArquivosDoCliente(noRise.id, [new File([Buffer.from("ola")], "a.txt")])).ok, false);
  conferir("ficha: anexa", (await arquivosDoCliente.anexarArquivosDoCliente(noRise.id, [fichaFalsa])).ok, true);
  const fichas = await arquivosDoCliente.listarArquivosDoCliente(noRise.id);
  const lidaFicha = await arquivosDoCliente.lerArquivoDoCliente(fichas[0].id);
  conferir("ficha: lista e le de volta", [fichas.length, fichas[0].tipo, lidaFicha?.nomeOriginal, lidaFicha?.tipo], [1, "FICHA_CADASTRAL", "Cartao CNPJ.pdf", "application/pdf"]);
  conferir("ficha: so exclui do proprio cliente", (await arquivosDoCliente.excluirArquivoDoCliente("outrocliente0001", fichas[0].id)).ok, false);
  conferir("ficha: exclui", [(await arquivosDoCliente.excluirArquivoDoCliente(noRise.id, fichas[0].id)).ok, (await arquivosDoCliente.listarArquivosDoCliente(noRise.id)).length], [true, 0]);
  const { rm: apagarPasta } = await import("node:fs/promises");
  await apagarPasta(arquivosDoCliente.pastaDoCliente(noRise.id), { recursive: true, force: true });

  await arquivos.apagarPastaDaProposta((await banco.lerProposta(p2.numero)).id);

  // -------------------------------------------------------------------------
  // Ferramentas do MCP
  // -------------------------------------------------------------------------
  console.log("\nMCP");
  const mcp = await import("../src/lib/mcp/propostasParaCliente.js");
  const todos = { pode: () => true };
  const semCustoMcp = { pode: (id) => id !== "dado.custo" };
  const nada = { pode: () => false };
  let recusou = false;
  try {
    await mcp.lerPropostaParaCliente({ numero: p2.numero }, nada);
  } catch {
    recusou = true;
  }
  conferir("MCP sem acesso recusa", recusou, true);
  const lidaMcp = await mcp.lerPropostaParaCliente({ numero: p2.numero }, todos);
  const textoMcp = JSON.stringify(lidaMcp);
  conferir("MCP le a proposta com o custo", [lidaMcp.cliente, lidaMcp.itens[0].custoUnitario, lidaMcp.ocDoCliente], ["ZZ Proposta Com Doc", 40, "OC-77"]);
  conferir("MCP nunca leva documento do cliente", textoMcp.includes(cnpjDeTeste(999990000501).slice(0, 8)), false);
  const semCustoLido = await mcp.lerPropostaParaCliente({ numero: p2.numero }, semCustoMcp);
  conferir("MCP sem custo", ["custoUnitario" in semCustoLido.itens[0], "lucro" in semCustoLido.totais], [false, false]);
  const listaMcp = await mcp.listarPropostasParaCliente({ termos: "ZZ Proposta" }, todos);
  conferir("MCP lista", listaMcp.propostas.some((pr) => pr.numero === p2.numero), true);

  // @@BANCO@@

  terminou = true;
} finally {
  await limpar();
  if (!terminou) falhas++;
  await prisma.$disconnect();
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
