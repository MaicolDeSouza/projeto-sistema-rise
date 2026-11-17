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

// Prazo da faixa do PDF (17/11/2026, Opcao 2 do dono): itens em prazos diferentes = "Varia por item / Veja a coluna Prazo".
conferir(
  "prazo da faixa",
  [
    regras.prazoDaFaixa([{ prontaEntrega: true }, { prontaEntrega: false, prazoDiasUteis: 15 }]),
    regras.prazoDaFaixa([{ prontaEntrega: false, prazoDiasUteis: 10 }, { prontaEntrega: false, prazoDiasUteis: 10 }]),
    regras.prazoDaFaixa([{ prontaEntrega: true }, { prontaEntrega: true }]),
  ],
  ["Varia por item\nVeja a coluna Prazo", "10 dias úteis", "Pronta entrega"],
);
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
  "28/56 dias após emissão da NF · Boleto · entrada de 30% · 2x\nSem juros",
);
// Parcelas e entrada pela condicao, com os valores (pedido do dono em 17/11/2026).
conferir(
  "plano da condicao",
  ["30/60/90 dias", "28/56 dias", "30 dias", "À vista", "50% de entrada + 50% na entrega", "Cartão em até 12x", "A combinar"].map((nome) => regras.planoDaCondicao(nome)),
  [
    { parcelas: 3, entradaPercentual: 0 },
    { parcelas: 2, entradaPercentual: 0 },
    { parcelas: 1, entradaPercentual: 0 },
    { parcelas: 1, entradaPercentual: 0 },
    { parcelas: 1, entradaPercentual: 50 },
    { parcelas: 12, entradaPercentual: 0 },
    null,
  ],
);
// Frete diluido (17/11/2026): proporcional ao total de cada item, centavos que sobram no ultimo, total igual.
{
  const diluidos = regras.itensComFreteDiluido(
    [
      { quantidade: 2, precoUnitario: 100, descontoPercentual: 0 },
      { quantidade: 1, precoUnitario: 50, descontoPercentual: 10 },
      { quantidade: 1, precoUnitario: 0, descontoPercentual: 0 },
    ],
    30,
  );
  // Em centavos (17/11/2026): o frete embutido pode diferir uns centavos (30,01 aqui) e o total da proposta e a soma das linhas.
  conferir("frete diluido: precos em centavos", diluidos.map((i) => i.precoUnitario), [112.25, 56.12, 0]);
  const totaisDiluidos = regras.totaisDaProposta({
    itens: [
      { quantidade: 2, precoUnitario: 100, descontoPercentual: 0 },
      { quantidade: 1, precoUnitario: 50, descontoPercentual: 10 },
      { quantidade: 1, precoUnitario: 0, descontoPercentual: 0 },
    ],
    fretePorConta: "CIF",
    frete: 30,
    freteDiluido: true,
  });
  conferir(
    "frete diluido: o total e a soma das linhas",
    [Math.round(diluidos.reduce((s, i) => s + regras.totalDoItem(i), 0) * 100) / 100, totaisDiluidos.total, totaisDiluidos.frete],
    [275.01, 275.01, 30.01],
  );
  conferir("frete diluido: sem frete nada muda", regras.itensComFreteDiluido([{ quantidade: 1, precoUnitario: 10 }], 0)[0].precoUnitario, 10);
}
// Entrada em R$ (17/11/2026): o valor digitado sai do total, nunca acima dele, e o texto mostra o valor.
conferir(
  "entrada em R$",
  [
    regras.valoresDoPagamento({ total: 1000, parcelas: 2, entradaTipo: "VALOR", entradaValor: 300 }),
    regras.valoresDoPagamento({ total: 100, parcelas: 1, entradaTipo: "VALOR", entradaValor: 500 }).entrada,
    regras.textoDoPagamento({ condicaoNome: "28/56 dias", parcelas: 2, entradaTipo: "VALOR", entradaValor: 300, total: 1000 }).replace(/\u00a0/g, " "),
  ],
  [{ entrada: 300, restante: 700, parcela: 350, parcelas: 2 }, 100, "28/56 dias após emissão da NF · entrada de R$ 300,00 · 2x de R$ 350,00"],
);
conferir("valores: entrada sai das parcelas", regras.valoresDoPagamento({ total: 1182, parcelas: 3, entradaPercentual: 10 }), { entrada: 118.2, restante: 1063.8, parcela: 354.6, parcelas: 3 });
conferir(
  "texto do pagamento com valores",
  [
    regras.textoDoPagamento({ condicaoNome: "30/60/90 dias", parcelas: 3, entradaPercentual: 0, total: 1182 }),
    regras.textoDoPagamento({ condicaoNome: "50% de entrada + 50% na entrega", parcelas: 1, entradaPercentual: 50, totais: { total: 1182 } }),
  ].map((texto) => texto.replace(/\u00a0/g, " ")), // o Intl poe espaco nao separavel depois do R$
  ["30/60/90 dias após emissão da NF · 3x de R$ 394,00", "50% de entrada + 50% na entrega · entrada de 50% (R$ 591,00) · saldo de R$ 591,00"],
);
conferir(
  "pendencias do PDF",
  regras.pendenciasDoPdf({ clienteNome: "", itens: [{ descricaoCliente: "" }, { descricaoCliente: "x" }] }),
  ["Informe o cliente.", "1 item(ns) sem o produto."],
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
  // Padroes do card "Condicoes da proposta" (17/11/2026): 90 dias, Andrea, contato em 10 dias e validade de 15.
  const hojeDoTeste = regras.hojeEmSaoPaulo();
  conferir(
    "nasce com 90 dias, Andrea, contato em 10 dias e validade de 15",
    [nova.garantia, nova.vendedor, regras.diasEntre(hojeDoTeste, nova.proximoContato), regras.diasEntre(hojeDoTeste, nova.validadeAte)],
    ["90 dias", "Andrea", 10, 15],
  );

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
  // O item precisa de nome: o do Rise (ou o digitado do item sem cadastro) ou a descricao do cliente (17/11/2026).
  const semNome = await banco.salvarProposta(p1.numero, { ...entrada, itens: [{ quantidade: "1" }] }, { hoje: "2026-11-12" });
  conferir("item sem nome recusa", semNome.erros?.["itens.0.nomeInterno"], "Informe o produto.");
  conferir("nome para o cliente: a descricao vence o nome do Rise", [regras.nomeDoItemParaOCliente({ descricaoCliente: " Kit 10 ", nomeInterno: "Espaçador" }), regras.nomeDoItemParaOCliente({ descricaoCliente: "", nomeInterno: "Espaçador" })], ["Kit 10", "Espaçador"]);

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

  // O A/C (pedido do dono em 17/11/2026): contato da lista, nome igual ao de um contato ou nome digitado a mao, que fica
  // so na proposta e nao vira contato do cliente.
  const ana = await prisma.clienteContato.create({ data: { clienteId: lidaComDoc.clienteId, nome: "Ana Souza", cargo: "Compras" } });
  const comCliente = { ...entrada, clienteId: lidaComDoc.clienteId };
  const acDe = async (extra) => {
    await banco.salvarProposta(p2.numero, { ...comCliente, ...extra }, { hoje: "2026-11-12" });
    const lidaAc = await banco.lerProposta(p2.numero);
    return [lidaAc.contatoId, lidaAc.contatoNome];
  };
  conferir("A/C pela lista", await acDe({ contatoId: ana.id, contatoNome: "Ana Souza" }), [ana.id, "Ana Souza"]);
  conferir("A/C digitado igual a um contato liga a ele", await acDe({ contatoId: "", contatoNome: "  ana souza " }), [ana.id, "Ana Souza"]);
  conferir("A/C digitado a mao fica so na proposta", await acDe({ contatoId: "", contatoNome: "Fulano da Silva" }), [null, "Fulano da Silva"]);
  conferir("A/C digitado nao vira contato do cliente", await prisma.clienteContato.count({ where: { clienteId: lidaComDoc.clienteId } }), 1);
  conferir("A/C vazio", await acDe({ contatoId: "", contatoNome: "" }), [null, null]);

  // Transportadora digitada e frete diluido (17/11/2026): gravados, e o PDF mostra o frete dentro dos produtos.
  await banco.salvarProposta(p2.numero, { ...comCliente, fretePorConta: "CIF", frete: "30", freteDiluido: true, transportadoraId: "", transportadoraNome: "Transportes ZZ" }, { hoje: "2026-11-12" });
  const comFrete = await banco.lerProposta(p2.numero);
  conferir("frete diluido e transportadora digitada gravados", [comFrete.freteDiluido, comFrete.transportadoraId, comFrete.transportadoraNome], [true, null, "Transportes ZZ"]);
  const { conteudoDaProposta: conteudoDoFrete } = await import("../src/lib/propostas/conteudo.js");
  const doFrete = conteudoDoFrete(comFrete, null);
  conferir(
    "PDF: frete diluido vira 'CIF (Incluso)' e o total nao muda",
    [doFrete.linhasDeTotal.find(([r]) => r === "Frete")?.[1], doFrete.total.replace(/ /g, " ")],
    ["CIF (Incluso)", `R$ ${comFrete.totais.total.toFixed(2).replace(".", ",")}`],
  );
  // Frete no quadro do total (17/11/2026): CIF a parte com o valor, CIF sem valor gratis.
  // (Os totais de `comFrete` sao os do frete diluido, que em centavos da 30,02; sem diluir o frete e o digitado, 30.)
  const freteDe = (mudanca) => conteudoDoFrete({ ...comFrete, ...mudanca, totais: { ...comFrete.totais, ...(mudanca.totais ?? {}) } }, null).linhasDeTotal.find(([r]) => r === "Frete")[1].replace(/\s/g, " ");
  conferir("PDF: CIF a parte mostra 'CIF R$ 30,00' e CIF sem valor 'CIF (Grátis)'", [freteDe({ freteDiluido: false, totais: { frete: 30 } }), freteDe({ freteDiluido: false, totais: { frete: 0 } })], ["CIF R$ 30,00", "CIF (Grátis)"]);
  await banco.salvarProposta(p2.numero, { ...comCliente, fretePorConta: "FOB", frete: "30", freteDiluido: true }, { hoje: "2026-11-12" });
  conferir("frete diluido so existe no CIF", (await banco.lerProposta(p2.numero)).freteDiluido, false);

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
  // O 1o item com fator 10 (kit do cliente de 10 unidades do Rise, 17/11/2026): o Bling recebe 20 unidades a 10,00.
  const itensComFator = [{ ...entrada.itens[0], fator: "10" }, entrada.itens[1]];
  await banco.salvarProposta(p2.numero, { ...entrada, clienteNome: "ZZ Proposta Com Doc", clienteDocumento: cnpjDeTeste(999990000501), ocCliente: "OC-77", observacoesNf: "Pedido OC-77", validadeAte: "2099-12-31", itens: itensComFator }, { bling: falso, exigirEscrita: () => falso.exigirEscrita("ZZ-CLIENTE") });
  conferir("fator gravado e lido", (await banco.lerProposta(p2.numero)).itens.map((i) => i.fator), [10, 1]);
  await banco.mudarSituacao(p2.numero, "APROVADA");
  const gerado = await pedido.gerarPedidoDeVenda(p2.numero, { bling: falso, exigirEscrita: exigir });
  const noBling = falso.estado.pedidosDeVenda.get(Number(gerado.blingPedidoId));
  conferir(
    "pedido criado com OC, itens, desconto e frete",
    [gerado.ok, noBling?.numeroPedidoCompra, noBling?.itens?.length, noBling?.itens?.[1]?.desconto, noBling?.desconto, noBling?.transporte?.fretePorConta, noBling?.transporte?.frete, noBling?.observacoes],
    [true, "OC-77", 2, 10, { valor: 29, unidade: "REAL" }, 0, 30, "Pedido OC-77"],
  );
  conferir("fator: quantidade em unidades do Rise e valor por unidade", [noBling?.itens?.[0]?.quantidade, noBling?.itens?.[0]?.valor, noBling?.itens?.[1]?.quantidade], [20, 10, 1]);
  conferir("internas levam o numero da proposta", /Proposta \d+ do Rise/.test(noBling?.observacoesInternas ?? ""), true);
  const deNovoPedido = await pedido.gerarPedidoDeVenda(p2.numero, { bling: falso, exigirEscrita: exigir });
  conferir("repetir nao duplica", [deNovoPedido.blingPedidoId, deNovoPedido.jaExistia, falso.estado.pedidosDeVenda.size], [gerado.blingPedidoId, true, 1]);

  const arquivos = await import("../src/lib/propostas/arquivos.js");
  const pdfFalso = new File([Buffer.from("%PDF-1.4 cotacao")], "cotacao do cliente.pdf");
  const xlsxFalso = new File([Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3])], "itens.xlsx");
  // Desde 17/11/2026 o anexo geral aceita texto e e-mail; o que nao e nenhum formato conhecido continua recusado.
  const binarioQualquer = new File([Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04])], "x.bin");
  conferir("anexo recusa formato", (await arquivos.anexarCotacao(p2.numero, [binarioQualquer])).ok, false);
  conferir("anexo: texto com byte nulo nao passa por .txt", (await arquivos.anexarCotacao(p2.numero, [new File([Buffer.from([0x61, 0x00, 0x62])], "falso.txt")])).ok, false);
  conferir("anexa pdf e planilha", (await arquivos.anexarCotacao(p2.numero, [pdfFalso, xlsxFalso])).anexados, 2);
  const anexos = (await banco.lerProposta(p2.numero)).anexos;
  conferir("planilha guarda a extensao", anexos.map((a) => a.arquivo.split(".").pop()).sort(), ["pdf", "xlsx"]);
  const lidoAnexo = await arquivos.lerAnexo(anexos.find((a) => a.nomeOriginal.endsWith(".pdf")).id);
  conferir("le o anexo de volta", [lidoAnexo.nomeOriginal, lidoAnexo.tipo], ["cotacao do cliente.pdf", "application/pdf"]);
  await arquivos.excluirAnexo(p2.numero, anexos[0].id);
  conferir("exclui o anexo", (await banco.lerProposta(p2.numero)).anexos.length, 1);
  // Card "Notas e anexos" (17/11/2026): a OC do cliente e os gerais (conversas e e-mails) separados pelo tipo.
  const eml = new File([Buffer.from("From: cliente@zz.test\r\nSubject: Pedido\r\n\r\nSegue a OC.")], "conversa.eml");
  conferir("anexa a OC e um e-mail", [(await arquivos.anexarCotacao(p2.numero, [pdfFalso], { tipo: "OC" })).ok, (await arquivos.anexarCotacao(p2.numero, [eml])).ok], [true, true]);
  const porTipo = (await banco.lerProposta(p2.numero)).anexos.map((a) => [a.tipo, a.arquivo.split(".").pop()]);
  conferir("anexos com o tipo", porTipo.sort(), [["GERAL", "eml"], ["GERAL", "xlsx"], ["OC", "pdf"]]);
  const lidoEml = await arquivos.lerAnexo((await banco.lerProposta(p2.numero)).anexos.find((a) => a.arquivo.endsWith(".eml")).id);
  conferir("e-mail volta como message/rfc822", lidoEml.tipo, "message/rfc822");

  // Foto do item AVULSO (13/11/2026): vai para a pasta da proposta, o Salvar guarda no avulso, e o PDF a desenha.
  const { default: sharpTeste } = await import("sharp");
  const pngFoto = await sharpTeste({ create: { width: 900, height: 700, channels: 3, background: "#3366cc" } }).png().toBuffer();
  const pFoto = await banco.criarProposta({ login: "zz", nome: "ZZ" });
  conferir("foto recusa o que nao e imagem", (await arquivos.gravarFotoDoItem(pFoto.numero, pdfFalso)).ok, false);
  const enviada = await arquivos.gravarFotoDoItem(pFoto.numero, new File([pngFoto], "sensor.png"));
  conferir("foto do avulso grava em jpg", [enviada.ok, /^[0-9a-f]{32}\.jpg$/.test(enviada.foto), enviada.fotoUrl], [true, true, `/api/propostas/${pFoto.numero}/fotos/${enviada.foto}`]);
  const lidaPrimeira = await banco.lerProposta(pFoto.numero);
  const bytesFoto = await arquivos.lerFotoDoItem(lidaPrimeira.id, enviada.foto);
  conferir("foto reduzida a 600 px", (await sharpTeste(bytesFoto).metadata()).width, 600);
  await banco.salvarProposta(pFoto.numero, {
    clienteNome: "ZZ Proposta Foto",
    validadeAte: "2099-12-31",
    itens: [
      { descricaoCliente: "Avulso com foto", quantidade: "1", precoUnitario: "10", foto: enviada.foto },
      { descricaoCliente: "Avulso com nome de fora", quantidade: "1", precoUnitario: "10", foto: "0".repeat(32) + ".jpg" },
    ],
  });
  const comFoto = await banco.lerProposta(pFoto.numero);
  conferir("Salvar guarda so a foto da pasta", comFoto.itens.map((i) => i.fotoUrl), [enviada.fotoUrl, null]);
  const { dadosDoPdfDaProposta } = await import("../src/lib/propostas/pdf.js");
  const extrasFoto = await dadosDoPdfDaProposta(comFoto);
  conferir("PDF e link desenham a foto do avulso", comFoto.itens.map((i) => Boolean(extrasFoto.fotos[i.id])), [true, false]);
  await arquivos.apagarPastaDaProposta(comFoto.id);

  const link = await import("../src/lib/propostas/linkPublico.js");
  const l1 = await link.linkPublicoDaProposta(p2.numero);
  const l2 = await link.linkPublicoDaProposta(p2.numero);
  conferir("link publico nao muda", [l1.ok, l1.url === l2.url, /\/p\/proposta\/[A-Za-z0-9_-]{43}$/.test(l1.url)], [true, true, true]);
  const chave = l1.url.split("/").pop();
  conferir("chave abre a proposta", (await link.propostaPelaChavePublica(chave))?.numero, p2.numero);
  conferir("chave errada nao abre", await link.propostaPelaChavePublica("x".repeat(43)), null);
  // PDF e pagina publica (17/11/2026): a descricao do cliente (senao o nome do Rise) e o codigo do RISE; custo e internas nunca.
  const { conteudoDaProposta } = await import("../src/lib/propostas/conteudo.js");
  const { pdfDaProposta } = await import("../src/lib/propostas/pdf.js");
  const { htmlDaProposta } = await import("../src/lib/propostas/paginaPublica.js");
  const paraPdf = await banco.lerProposta(p2.numero);
  const empresaFalsa = { razaoSocial: "ZZ Empresa", nomeFantasia: "ZZ Loja", cnpj: "00.000.000/0001-00", endereco: "Rua", cidade: "Caxias", uf: "RS", cep: "95000-000", telefone: "5432900870", celular: "54981222300", whatsappTecnico: "54996050390", site: "www.4hobby.com.br", email: "contato@4hobby.com.br" };
  const conteudo = conteudoDaProposta(paraPdf, empresaFalsa);
  const tudo = JSON.stringify(conteudo);
  conferir(
    "PDF: descricao do cliente e codigo do Rise, OC e frete com explicacao",
    [conteudo.itens[0].celulas.descricao, conteudo.itens[0].celulas.codigo, /OC-77/.test(tudo), /^CIF/.test(conteudo.faixa[3][1]), conteudo.colunas.find((c) => c.chave === "codigo")?.titulo],
    ["Módulo relé 5V conforme cotação", "ZZ-PROP-CLI-1", true, true, "Código 4hobby"],
  );
  conferir("PDF: sem descricao do cliente sai o nome do Rise", conteudoDaProposta({ ...paraPdf, itens: [{ ...paraPdf.itens[0], descricaoCliente: "" }] }, empresaFalsa).itens[0].celulas.descricao, paraPdf.itens[0].nomeInterno);
  conferir("PDF: nunca custo nem internas", [tudo.includes("so nossa"), /custo/i.test(tudo)], [false, false]);
  // Cabecalho no molde da cotacao que o dono mandou (13/11/2026): nome, contatos com link, quadro, entrega e faixa.
  conferir("PDF: nome no topo e endereco da empresa", [conteudo.nomeDaEmpresa, conteudo.empresa[0], conteudo.site?.url], ["4hobby Indústria e Comércio", "Rua", "https://www.4hobby.com.br"]);
  conferir(
    "PDF: so o WhatsApp tem link (fixo e e-mail sem)",
    conteudo.contatos.map((ct) => [ct.tipo, ct.url]),
    [["fone", null], ["whatsapp", "https://wa.me/5554981222300"], ["whatsapp", "https://wa.me/5554996050390"], ["email", null]],
  );
  conferir("PDF: faixa com validade, pagamento, prazo, envio e vendedor", conteudo.faixa.map(([r]) => r), ["Validade da proposta", "Condições de pagamento", "Prazo de entrega", "Método de envio", "Garantia", "Vendedor"]);
  conferir(
    "PDF: vendedor editado vence quem criou",
    [conteudoDaProposta({ ...paraPdf, criadoPorNome: "Quem Criou", vendedor: "Outro Vendedor" }, empresaFalsa).faixa.at(-1)[1], conteudoDaProposta({ ...paraPdf, criadoPorNome: "Quem Criou", vendedor: null }, empresaFalsa).faixa.at(-1)[1]],
    ["Outro Vendedor", "Quem Criou"],
  );
  conferir(
    "PDF: quadro do total com frete e impostos",
    [conteudo.linhasDeTotal.map(([r]) => r).slice(-2), conteudoDaProposta({ ...paraPdf, fretePorConta: "FOB" }, empresaFalsa).linhasDeTotal.find(([r]) => r === "Frete")[1]],
    [["Frete", "Impostos"], "FOB"],
  );
  // Dados bancarios e caixa de observacoes (17/11/2026): banco primeiro, campo vazio fora; observacao sai dos blocos.
  conferir(
    "PDF: dados bancarios com o banco primeiro e sem campo vazio",
    [conteudoDaProposta(paraPdf, { ...empresaFalsa, bancoNome: "Banco ZZ", bancoCodigo: "0999", agencia: "0001", conta: "", chavePix: "pix@zz.com" }).bancarios, conteudoDaProposta(paraPdf, empresaFalsa).bancarios],
    [["Banco ZZ", "Banco: 0999", "Agência: 0001", "Chave Pix: pix@zz.com"], []],
  );
  const comObs = conteudoDaProposta({ ...paraPdf, observacoesCliente: "Entrega no portão 2" }, empresaFalsa);
  conferir("PDF: observacao ao cliente na caixa, fora dos blocos", [comObs.observacoes, comObs.blocos.some(([r]) => r === "Observações")], ["Entrega no portão 2", false]);
  const semCodigo = conteudoDaProposta({ ...paraPdf, itens: [{ ...paraPdf.itens[0], sku: null, codigoInterno: null }] }, empresaFalsa);
  conferir("PDF: coluna Codigo sempre, com travessao no item sem codigo", [semCodigo.colunas.some((c) => c.chave === "codigo"), semCodigo.itens[0].celulas.codigo], [true, "—"]);
  const comAc = conteudoDaProposta(
    { ...paraPdf, contatoId: "ct1", contatoNome: "Ana Souza", cliente: { contatos: [{ id: "ct1", nome: "Ana Souza", cargo: "Compras", telefone: "54988990008", email: "ana@zz.com" }] } },
    empresaFalsa,
  ).cliente;
  conferir("PDF: A/C so com o nome do contato", [comAc.ac, comAc.acLinha], ["Aos cuidados de: Ana Souza", null]);
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
    ["15 dias\naté 27/11/2026", "1 dia\naté 27/11/2026", "Vencida em 27/11/2026"],
  );
  // Metodo de envio (17/11/2026): so CIF/FOB e a transportadora embaixo ("A combinar" sem ela), sem dias nem valor.
  conferir(
    "PDF: metodo de envio so com CIF/FOB e a transportadora",
    [
      conteudoDaProposta({ ...paraPdf, fretePorConta: "CIF", transportadoraNome: "Transportes ZZ", prazoTransporteDias: 15 }, empresaFalsa).faixa[3][1],
      conteudoDaProposta({ ...paraPdf, fretePorConta: "FOB", transportadoraNome: "", frete: 30 }, empresaFalsa).faixa[3][1],
      conteudoDaProposta({ ...paraPdf, fretePorConta: "RETIRA" }, empresaFalsa).faixa[3][1],
    ],
    ["CIF\nTransportes ZZ", "FOB", "Cliente retira"],
  );
  conferir("PDF: entregar em sem endereco = a combinar", conteudo.entrega, ["A combinar"]);
  // Melhorias aprovadas em 17/11/2026: entrega igual = "O mesmo do cliente"; Prazo so com prazos diferentes; CEP na linha dele.
  const enderecoGeral = { tipo: "GERAL", logradouro: "Rua A", numero: "1", bairro: "Centro", cidade: "Caxias", uf: "RS", cep: "95000-000" };
  const comEndereco = (enderecos) => conteudoDaProposta({ ...paraPdf, fretePorConta: "CIF", cliente: { ...(paraPdf.cliente ?? {}), enderecos } }, empresaFalsa);
  conferir(
    "PDF: entrega igual ao cliente e entrega diferente",
    [comEndereco([enderecoGeral]).entrega, comEndereco([enderecoGeral, { ...enderecoGeral, tipo: "ENTREGA", logradouro: "Rua B" }]).entrega[0]],
    [["O mesmo do cliente"], "Rua B, 1"],
  );
  const comPrazos = (prazos) => conteudoDaProposta({ ...paraPdf, itens: paraPdf.itens.slice(0, 2).map((item, i) => ({ ...item, ...prazos[i] })) }, empresaFalsa).colunas.some((c) => c.chave === "prazo");
  conferir(
    "PDF: coluna Prazo so com prazos diferentes",
    [comPrazos([{ prontaEntrega: true }, { prontaEntrega: true }]), comPrazos([{ prontaEntrega: true }, { prontaEntrega: false, prazoDiasUteis: 10 }])],
    [false, true],
  );
  conferir("PDF: CEP da empresa numa linha propria, com dois pontos", conteudo.empresa.includes("CEP: 95000-000"), true);
  // Faixa (17/11/2026): a forma numa linha propria, "Método: Transferência".
  conferir(
    "PDF: pagamento com o metodo embaixo",
    conteudoDaProposta({ ...paraPdf, condicaoNome: "7 dias", formaPagamento: "Transferência", parcelas: 1, entradaPercentual: 0, pagamentoTexto: "" }, empresaFalsa).faixa[1][1],
    "7 dias após emissão da NF\nMétodo: Transferência",
  );
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

  // Item do Rise sem foto gravada usa a 1a foto do produto base (pedido do dono em 13/11/2026, Proposta 2028).
  const comFotoDoProduto = banco.propostaParaTela({
    numero: 1,
    situacao: "RASCUNHO",
    itens: [
      { id: "a", produtoId: "p1", foto: null, produto: { sku: "941003", arquivos: [{ arquivo: "foto-1.webp" }] }, quantidade: 1, precoUnitario: 1, descontoPercentual: 0 },
      { id: "b", produtoId: "p1", foto: "gravada.webp", produto: { sku: "941003", arquivos: [{ arquivo: "foto-1.webp" }] }, quantidade: 1, precoUnitario: 1, descontoPercentual: 0 },
      { id: "c", produtoId: null, foto: null, produto: null, quantidade: 1, precoUnitario: 1, descontoPercentual: 0 },
    ],
  });
  // Desde 17/11/2026 a foto do item com produto e SEMPRE a do cadastro (a gravada so vale se o produto ficou sem foto).
  conferir("foto: com produto vale a do cadastro; avulso sem foto fica sem", comFotoDoProduto.itens.map((i) => i.foto), ["foto-1.webp", "foto-1.webp", null]);
  const semFotoNoCadastro = banco.propostaParaTela({ numero: 1, situacao: "RASCUNHO", itens: [{ id: "d", produtoId: "p1", foto: "gravada.webp", produto: { sku: "941003", arquivos: [] }, quantidade: 1, precoUnitario: 1, descontoPercentual: 0 }] });
  conferir("foto: produto sem foto usa a gravada", semFotoNoCadastro.itens[0].foto, "gravada.webp");

  // O "i" de estoque do item (17/11/2026): a conta das pecas dos pedidos (estoque menos o reservado), em unidades do Rise.
  const { estoqueDosItens } = await import("../src/lib/propostas/estoque.js");
  await prisma.produto.update({ where: { id: produto.id }, data: { estoque: 5 } });
  const [atende, falta, semProduto] = await estoqueDosItens([{ produtoId: produto.id, quantidade: 3 }, { produtoId: produto.id, quantidade: 8 }, { produtoId: null, quantidade: 2 }]);
  conferir("estoque: atende", [atende?.atende, atende?.pecas?.[0]?.estoque, atende?.pecas?.[0]?.falta], [true, 5, 0]);
  conferir("estoque: falta diz quanto comprar", [falta?.atende, falta?.pecas?.[0]?.disponivel, falta?.pecas?.[0]?.falta], [false, 5, 3]);
  conferir("estoque: item sem produto nao tem conta", semProduto, null);

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
