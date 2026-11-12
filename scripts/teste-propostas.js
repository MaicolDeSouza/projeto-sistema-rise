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

  // @@BANCO@@

  terminou = true;
} finally {
  await limpar();
  if (!terminou) falhas++;
  await prisma.$disconnect();
}

console.log(falhas ? `\n${falhas} FALHA(S)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
