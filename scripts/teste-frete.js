import "dotenv/config";

/**
 * Testes do modulo de frete (spec 2026-11-18-modulo-de-frete-design.md, fase 1: cotacao). SEM rede: o Melhor Envio e
 * um servidor falso nesta maquina.
 *
 *   npm run teste:frete
 *
 * So escreve caixas "CX ZZ*" e produtos/pedidos ZZ-FRETE-*, apagados no comeco e no fim, e devolve a linha
 * ConfigDeFrete e a Conexao MELHOR_ENVIO do dono.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

// ---------------------------------------------------------------------------
// Melhor Envio falso (antes de qualquer import que leia o config: o endereco vem do ambiente)
// ---------------------------------------------------------------------------

const http = await import("node:http");
const { readFileSync } = await import("node:fs");
const lerFixture = (nome) => JSON.parse(readFileSync(new URL(`./fixtures/frete/${nome}`, import.meta.url), "utf8"));
const COTACAO_SP = lerFixture("calculate-sp.json");
const CEP_INVALIDO = lerFixture("calculate-cep-invalido.json");

const falso = {
  pedidosDeToken: 0,
  pedidosDeCarrinho: 0,
  ultimoPedido: null,
  ultimoCorpo: null,
  proxima: null,
  /** Fase 2: os pedidos do Melhor Envio (id -> pedido como a API devolve) e as falhas sob comando. */
  pedidos: new Map(),
  ultimoCarrinho: null,
  precoDaEtiqueta: 25.84,
  saldo: 123.45,
  /** "checkout" | "generate" | "tracking" | null */
  falharEm: null,
  recusarCancelamento: false,
  /** A proxima resposta de cotacao sai com este status e corpo (uma vez so). */
  responderCom(status, corpo) {
    this.proxima = { status, corpo };
  },
};

const servidor = http.createServer((pedido, resposta) => {
  let texto = "";
  pedido.on("data", (parte) => (texto += parte));
  pedido.on("end", () => {
    const corpo = texto ? JSON.parse(texto) : null;
    falso.ultimoPedido = { metodo: pedido.method, caminho: pedido.url, headers: pedido.headers };
    falso.ultimoCorpo = corpo;
    const responder = (status, dados) => {
      resposta.writeHead(status, { "Content-Type": "application/json" });
      resposta.end(typeof dados === "string" ? dados : JSON.stringify(dados));
    };
    const caminho = pedido.url.split("?")[0];
    if (caminho === "/oauth/token") {
      falso.pedidosDeToken++;
      const n = falso.pedidosDeToken;
      return responder(200, { token_type: "Bearer", expires_in: 2592000, access_token: `acesso-${n}`, refresh_token: `renova-${n}` });
    }
    if (caminho === "/api/v2/me") return responder(200, { id: "zz", firstname: "ZZ", lastname: "Frete", email: "zz-frete@exemplo.test" });
    if (caminho === "/api/v2/me/balance") return responder(200, { balance: falso.saldo, reserved: 0, debts: 0 });
    if (caminho === "/api/v2/me/shipment/calculate") {
      if (falso.proxima) {
        const { status, corpo: dados } = falso.proxima;
        falso.proxima = null;
        return responder(status, dados);
      }
      return responder(200, COTACAO_SP);
    }
    // Fase 2: carrinho, pagamento, geracao, impressao, rastreio e cancelamento, com o estado em memoria.
    const agoraME = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
    if (caminho === "/api/v2/me/cart") {
      falso.pedidosDeCarrinho++;
      falso.ultimoCarrinho = corpo;
      const id = `zz00000${falso.pedidosDeCarrinho}-0000-4000-8000-${String(falso.pedidosDeCarrinho).padStart(12, "0")}`;
      falso.pedidos.set(id, { id, protocol: `ORD-ZZ${falso.pedidosDeCarrinho}`, status: "pending", price: falso.precoDaEtiqueta, tracking: null, created_at: agoraME() });
      return responder(201, falso.pedidos.get(id));
    }
    const ids = corpo?.orders ?? [];
    if (caminho === "/api/v2/me/shipment/checkout") {
      if (falso.falharEm === "checkout") return responder(500, { message: "Erro interno do falso." });
      for (const id of ids) Object.assign(falso.pedidos.get(id) ?? {}, { status: "released", paid_at: agoraME() });
      return responder(200, { purchase: { id: "zz-compra", protocol: "PUR-ZZ", total: falso.precoDaEtiqueta, status: "paid" } });
    }
    if (caminho === "/api/v2/me/shipment/generate") {
      if (falso.falharEm === "generate") return responder(500, { message: "Erro interno do falso." });
      const resposta = {};
      for (const id of ids) {
        Object.assign(falso.pedidos.get(id) ?? {}, { generated_at: agoraME(), tracking: `ZZ${id.slice(-4)}BR` });
        resposta[id] = { status: true, message: "Envio gerado com sucesso" };
      }
      return responder(200, resposta);
    }
    if (caminho === "/api/v2/me/shipment/print") return responder(200, { url: `https://falso.melhorenvio.test/imprimir/${ids.join(",")}` });
    if (caminho === "/api/v2/me/shipment/tracking") {
      if (falso.falharEm === "tracking") return responder(503, "");
      return responder(200, Object.fromEntries(ids.filter((id) => falso.pedidos.has(id)).map((id) => [id, falso.pedidos.get(id)])));
    }
    if (caminho === "/api/v2/me/shipment/cancel") {
      if (falso.recusarCancelamento) return responder(422, { error: "Envio já postado não pode ser cancelado." });
      const id = corpo?.order?.id;
      Object.assign(falso.pedidos.get(id) ?? {}, { status: "canceled", canceled_at: agoraME() });
      return responder(200, { [id]: { canceled: true } });
    }
    const doPedido = caminho.match(/^\/api\/v2\/me\/orders\/([\w-]+)$/);
    if (doPedido) return falso.pedidos.has(doPedido[1]) ? responder(200, falso.pedidos.get(doPedido[1])) : responder(404, { message: "Pedido não encontrado." });
    return responder(404, { message: "Não encontrado no falso." });
  });
});
// `--servir --porta=4599`: porta fixa, para o .env de quem confere a tela apontar para ela.
const portaFixa = Number(process.argv.find((arg) => arg.startsWith("--porta="))?.slice(8) ?? 0);
await new Promise((pronto) => servidor.listen(portaFixa, "127.0.0.1", pronto));
process.env.MELHOR_ENVIO_URL = `http://127.0.0.1:${servidor.address().port}`;
process.env.MELHOR_ENVIO_CLIENT_ID = "zz-cliente";
process.env.MELHOR_ENVIO_CLIENT_SECRET = "zz-segredo";
process.env.MELHOR_ENVIO_CONTATO = "zz-frete@exemplo.test";
process.env.FRETE_COMPRA = "false";

// `--servir`: so o falso no ar, para conferir as telas sem o Melhor Envio de verdade (Ctrl+C encerra).
if (process.argv.includes("--servir")) {
  console.log(`Melhor Envio falso em ${process.env.MELHOR_ENVIO_URL} (MELHOR_ENVIO_URL no .env para usar).`);
  await new Promise(() => {});
}

const {
  nomeDaCaixa,
  medidasInternas,
  itensIncompletos,
  pesoDoPacote,
  sugerirCaixa,
  valorACobrar,
  separarServicos,
  textoDaCotacao,
  lerDecimal,
} = await import("../src/lib/frete/regras.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

// ---------------------------------------------------------------------------
// Regras puras
// ---------------------------------------------------------------------------

console.log("\nRegras do frete");
const CX3 = { nome: "CX 16x11x3", comprimentoCm: 16, larguraCm: 11, alturaCm: 3, pesoVazioKg: 0.035, ativo: true };
const CX6 = { nome: "CX 16x11x6", comprimentoCm: 16, larguraCm: 11, alturaCm: 6, pesoVazioKg: 0.045, ativo: true };
const CX12 = { nome: "CX 19x12x12", comprimentoCm: 19, larguraCm: 12, alturaCm: 12, pesoVazioKg: 0.07, ativo: true };
const CAIXAS = [CX12, CX3, CX6]; // fora de ordem de proposito
const lcd = { pesoKg: 0.055, alturaCm: 2, larguraCm: 8, comprimentoCm: 6, quantidade: 1 };
const rele = { pesoKg: 0.096, alturaCm: 7.4, larguraCm: 10.6, comprimentoCm: 13.7, quantidade: 1 };

conferir("nome inteiro", nomeDaCaixa(CX3), "CX 16x11x3");
conferir("nome com casa decimal", nomeDaCaixa({ comprimentoCm: 16.5, larguraCm: 11, alturaCm: 3 }), "CX 16,5x11x3");
conferir("interna pela folga", medidasInternas(CX3), { comprimentoCm: 15.5, larguraCm: 10.5, alturaCm: 2.5 });
conferir(
  "interna informada vence",
  medidasInternas({ ...CX3, comprimentoInternoCm: 15.8, larguraInternaCm: 10.8, alturaInternaCm: 2.8 }),
  { comprimentoCm: 15.8, larguraCm: 10.8, alturaCm: 2.8 },
);
conferir(
  "peso: (itens + caixa) x 1,10",
  pesoDoPacote({ itens: [{ ...lcd, quantidade: 2 }, { pesoKg: 0.005, quantidade: 1 }], caixa: CX3, percentualDePesoExtra: 10 }),
  0.165,
);
conferir("peso sobe no grama", pesoDoPacote({ itens: [{ pesoKg: 0.0101, quantidade: 1 }], caixa: CX3, percentualDePesoExtra: 10 }), 0.05);
conferir("peso com item sem peso", pesoDoPacote({ itens: [{ pesoKg: null, quantidade: 1 }], caixa: CX3, percentualDePesoExtra: 10 }), null);
conferir("incompletos", itensIncompletos([lcd, { ...lcd, alturaCm: null }, { ...lcd, pesoKg: 0 }]), 2);
conferir("menor caixa que serve", sugerirCaixa({ itens: [lcd], caixas: CAIXAS }).caixa?.nome, "CX 16x11x3");
conferir("item alto pula para a grande", sugerirCaixa({ itens: [rele], caixas: CAIXAS }).caixa?.nome, "CX 19x12x12");
conferir("volume acima de 70% sobe de caixa", sugerirCaixa({ itens: [{ ...lcd, quantidade: 3 }], caixas: CAIXAS }).caixa?.nome, "CX 16x11x6");
conferir("nao cabe", sugerirCaixa({ itens: [{ ...lcd, comprimentoCm: 35 }], caixas: CAIXAS }), { caixa: null, motivo: "NAO_CABE" });
conferir("incompleto nao sugere", sugerirCaixa({ itens: [{ ...lcd, larguraCm: null }], caixas: CAIXAS }), { caixa: null, motivo: "ITENS_INCOMPLETOS" });
conferir("caixa inativa fica de fora", sugerirCaixa({ itens: [lcd], caixas: [{ ...CX3, ativo: false }, CX6] }).caixa?.nome, "CX 16x11x6");
conferir("cobrar", [valorACobrar(28.85, 1), valorACobrar(10.57, 1.5)], [29.85, 12.07]);
const lista = [
  { servicoId: "2", servicoNome: "SEDEX", transportadora: "Correios", preco: 28.85, prazoDias: 2, motivoDaRecusa: null },
  { servicoId: "1", servicoNome: "PAC", transportadora: "Correios", preco: 18.4, prazoDias: 6, motivoDaRecusa: null },
  { servicoId: "12", servicoNome: "éFácil", transportadora: "LATAM Cargo", preco: null, prazoDias: null, motivoDaRecusa: "Transportadora não atende este trecho." },
];
conferir(
  "separa e ordena",
  separarServicos(lista, 1).atendem.map((s) => [s.servicoNome, s.valorACobrar]),
  [
    ["PAC", 19.4],
    ["SEDEX", 29.85],
  ],
);
conferir("recusados", separarServicos(lista, 1).recusados.length, 1);
conferir("todos recusados", separarServicos([lista[2]], 1), { atendem: [], recusados: [lista[2]] });
conferir(
  "texto",
  textoDaCotacao({ cidadeDestino: "São Paulo (SP)", servicos: separarServicos(lista, 1).atendem }),
  "Frete para São Paulo (SP):\nCorreios PAC: R$ 19,40, 6 dias úteis\nCorreios SEDEX: R$ 29,85, 2 dias úteis",
);
conferir(
  "texto com 1 dia",
  textoDaCotacao({ cidadeDestino: "Caxias do Sul (RS)", servicos: [{ ...lista[0], prazoDias: 1, valorACobrar: 11.8 }] }),
  "Frete para Caxias do Sul (RS):\nCorreios SEDEX: R$ 11,80, 1 dia útil",
);
conferir(
  "decimal",
  [lerDecimal("0,3"), lerDecimal("1.250,00"), lerDecimal("0.3"), lerDecimal(""), lerDecimal("-1"), lerDecimal("abc")],
  [0.3, 1250, 0.3, null, null, null],
);

console.log("\nRegras da fase 2");
const {
  statusDoProvedor,
  servicoCompravel,
  motivosParaNaoComprar,
  linkDoRastreio,
  dataDoProvedor,
  eventosDasDatas,
  validadeDaEtiqueta,
  TEXTOS_DO_AVISO,
  preencherTexto,
} = await import("../src/lib/frete/regras.js");
conferir("status: generated", statusDoProvedor("generated"), { status: "A_POSTAR", desconhecido: false });
conferir("status: paused", statusDoProvedor("paused").status, "COM_PROBLEMA");
conferir("status: pending", statusDoProvedor("pending").status, "RASCUNHO");
conferir("status: desconhecido", statusDoProvedor("waiting_xyz"), { status: null, desconhecido: true });
conferir("azul não compra", servicoCompravel({ transportadora: "Azul Cargo Express" }).ok, false);
conferir("jadlog compra", servicoCompravel({ transportadora: "Jadlog" }).ok, true);
const pronto = { status: "RASCUNHO", medidaConferida: true, tipoDeDocumento: "NFE", chaveNfe: "4".repeat(44), precoCotado: 25.84, transportadoraNome: "Correios" };
conferir("pronto para comprar", motivosParaNaoComprar({ envio: pronto, saldo: 100, travaLiberada: true }), []);
conferir("trava vem primeiro", motivosParaNaoComprar({ envio: pronto, saldo: 100, travaLiberada: false })[0], "A compra de etiquetas está travada (FRETE_COMPRA).");
conferir("já comprada", motivosParaNaoComprar({ envio: { ...pronto, status: "A_POSTAR" }, saldo: 100, travaLiberada: true }), ["Esta etiqueta já foi comprada."]);
conferir("saldo curto", motivosParaNaoComprar({ envio: pronto, saldo: 10, travaLiberada: true }), ["Saldo insuficiente: R$ 10,00 na carteira para R$ 25,84."]);
conferir("chave curta", motivosParaNaoComprar({ envio: { ...pronto, chaveNfe: "123" }, saldo: 100, travaLiberada: true }), ["Informe a chave da NF-e ou use declaração de conteúdo."]);
conferir("sem documento", motivosParaNaoComprar({ envio: { ...pronto, tipoDeDocumento: null }, saldo: 100, travaLiberada: true }), ["Informe a chave da NF-e ou use declaração de conteúdo."]);
conferir(
  "declaração sem itens",
  motivosParaNaoComprar({ envio: { ...pronto, tipoDeDocumento: "DECLARACAO", chaveNfe: null, itensDaDeclaracao: [] }, saldo: 100, travaLiberada: true }),
  ["Declaração de conteúdo sem itens."],
);
conferir(
  "declaração com itens",
  motivosParaNaoComprar({ envio: { ...pronto, tipoDeDocumento: "DECLARACAO", chaveNfe: null, itensDaDeclaracao: [{ descricao: "x", quantidade: 1, valorUnitario: 5 }] }, saldo: 100, travaLiberada: true }),
  [],
);
conferir("medida não conferida", motivosParaNaoComprar({ envio: { ...pronto, medidaConferida: false }, saldo: 100, travaLiberada: true }), ["Confira a caixa e o peso medidos antes de comprar."]);
conferir("azul nos motivos", motivosParaNaoComprar({ envio: { ...pronto, transportadoraNome: "Azul Cargo Express" }, saldo: 100, travaLiberada: true }), ["A Azul Cargo não se compra pela API: escolha outro serviço."]);
conferir("link", [linkDoRastreio("ME23002OWZ7BR"), linkDoRastreio("")], ["https://melhorrastreio.com.br/rastreio/ME23002OWZ7BR", null]);
conferir("data de Brasília", [dataDoProvedor("2026-11-19 14:05:00")?.toISOString(), dataDoProvedor(null)], ["2026-11-19T17:05:00.000Z", null]);
conferir(
  "eventos",
  eventosDasDatas({ paid_at: "2026-11-19 10:00:00", generated_at: "2026-11-19 10:01:00", posted_at: null }).map((e) => e.descricao),
  ["Etiqueta paga", "Etiqueta gerada"],
);
conferir("validade 20 dias", validadeDaEtiqueta(new Date("2026-11-19T12:00:00Z")).toISOString(), "2026-12-09T12:00:00.000Z");
conferir("texto preenchido", preencherTexto("Pedido {pedido} via {transportadora}. {rastreio}", { pedido: "1234", transportadora: "Jadlog" }), "Pedido 1234 via Jadlog.");
conferir("textos padrão", [TEXTOS_DO_AVISO.assunto, TEXTOS_DO_AVISO.whatsapp.includes("{rastreio}")], ["Seu pedido {pedido} foi postado", true]);

// ---------------------------------------------------------------------------
// Banco: caixas de envio e configuracao
// ---------------------------------------------------------------------------

const { prisma } = await import("../src/lib/db.js");
const { listarCaixas, salvarCaixa, excluirCaixa } = await import("../src/lib/frete/caixas.js");
const { lerConfigDeFrete, salvarConfigDeFrete } = await import("../src/lib/frete/configuracao.js");

const configDoDono = await prisma.configDeFrete.findUnique({ where: { id: "frete" } });
const limparCaixas = () => prisma.caixaDeEnvio.deleteMany({ where: { OR: [{ nome: { startsWith: "CX 9" } }, { nome: { startsWith: "CX ZZ" } }] } });

try {
  await limparCaixas();
  console.log("\nBanco: caixas e configuração");
  const nomes = (await listarCaixas()).map((c) => c.nome);
  conferir("semeadas", ["CX 16x11x3", "CX 16x11x6", "CX 19x12x12"].every((nome) => nomes.includes(nome)), true);
  conferir(
    "ordenadas pelo volume",
    nomes.indexOf("CX 16x11x3") < nomes.indexOf("CX 16x11x6") && nomes.indexOf("CX 16x11x6") < nomes.indexOf("CX 19x12x12"),
    true,
  );
  const nova = await salvarCaixa({ comprimentoCm: "99", larguraCm: "98,5", alturaCm: "97", pesoVazioKg: "0,2" });
  conferir("cria com o nome das medidas", [nova.ok, nova.caixa?.nome, nova.caixa?.pesoVazioKg], [true, "CX 99x98,5x97", 0.2]);
  conferir("medidas repetidas", (await salvarCaixa({ comprimentoCm: "99", larguraCm: "98,5", alturaCm: "97", pesoVazioKg: "0,2" })).ok, false);
  conferir("medida zero", "comprimentoCm" in ((await salvarCaixa({ comprimentoCm: "0", larguraCm: "10", alturaCm: "10", pesoVazioKg: "0,1" })).erros ?? {}), true);
  conferir(
    "interna maior que a externa",
    "comprimentoInternoCm" in ((await salvarCaixa({ comprimentoCm: "96", larguraCm: "95", alturaCm: "94", pesoVazioKg: "0,1", comprimentoInternoCm: "97" })).erros ?? {}),
    true,
  );
  const editada = await salvarCaixa({ comprimentoCm: "99", larguraCm: "98,5", alturaCm: "97", pesoVazioKg: "0,25", ativo: false }, nova.caixa.id);
  conferir("edita o peso e desativa", [editada.ok, editada.caixa?.pesoVazioKg, editada.caixa?.ativo], [true, 0.25, false]);
  conferir("so ativas", (await listarCaixas({ soAtivas: true })).every((c) => c.ativo), true);
  conferir("exclui a sem uso", (await excluirCaixa(nova.caixa.id)).ok, true);
  conferir("excluida some", (await listarCaixas()).some((c) => c.id === nova.caixa.id), false);
  const config = await lerConfigDeFrete();
  conferir("config padrao", [config.acrescimoDeEmbalagem, config.percentualDePesoExtra], [1, 10]);
  conferir("config invalida", (await salvarConfigDeFrete({ acrescimoDeEmbalagem: "-1", percentualDePesoExtra: "10" })).ok, false);
  conferir("config acima de 100%", (await salvarConfigDeFrete({ acrescimoDeEmbalagem: "1", percentualDePesoExtra: "120" })).ok, false);
  conferir(
    "config salva",
    [(await salvarConfigDeFrete({ acrescimoDeEmbalagem: "1,50", percentualDePesoExtra: "12" })).ok, (await lerConfigDeFrete()).acrescimoDeEmbalagem],
    [true, 1.5],
  );
} finally {
  await limparCaixas();
  if (configDoDono) await prisma.configDeFrete.update({ where: { id: "frete" }, data: { ...configDoDono, atualizadoEm: undefined } });
}

// ---------------------------------------------------------------------------
// Conector do Melhor Envio (OAuth, leitura e trava de compra)
// ---------------------------------------------------------------------------

const { iniciarAutorizacao, concluirAutorizacao, obterAccessToken, meGet, meLer, mePost, testar } = await import(
  "../src/lib/integracoes/melhorenvio.js"
);
const { lerConexao, lerSegredo } = await import("../src/lib/integracoes/conexoes.js");
const conexaoDoDono = await prisma.conexao.findUnique({ where: { servico: "MELHOR_ENVIO" } });

try {
  console.log("\nConector do Melhor Envio");
  await prisma.conexao.deleteMany({ where: { servico: "MELHOR_ENVIO" } });
  const endereco = iniciarAutorizacao("abc");
  conferir("autorizar leva client_id, redirect, state e escopos", ["client_id=", "redirect_uri=", "state=abc", "scope=", "/oauth/authorize"].every((p) => endereco.includes(p)), true);
  conferir("pede o escopo de cotar", decodeURIComponent(endereco).includes("shipping-calculate"), true);
  await concluirAutorizacao("codigo-de-teste");
  conferir(
    "token guardado cifrado",
    [(await lerConexao("MELHOR_ENVIO")).status, (await lerSegredo("MELHOR_ENVIO")).refreshToken],
    ["CONECTADO", "renova-1"],
  );
  conferir("pedido do token em JSON", [falso.ultimoCorpo?.grant_type, falso.ultimoCorpo?.client_id], ["authorization_code", "zz-cliente"]);
  await meGet("/api/v2/me");
  conferir("user-agent com o contato", falso.ultimoPedido.headers["user-agent"], "Rise 4hobby (zz-frete@exemplo.test)");
  conferir("bearer", falso.ultimoPedido.headers.authorization, "Bearer acesso-1");
  conferir("token que ainda vale nao renova", [await obterAccessToken(), falso.pedidosDeToken], ["acesso-1", 1]);
  await prisma.conexao.update({ where: { servico: "MELHOR_ENVIO" }, data: { expiraEm: new Date(Date.now() + 2 * 24 * 3600 * 1000) } });
  conferir("renova com menos de 5 dias", [await obterAccessToken(), falso.pedidosDeToken], ["acesso-2", 2]);
  conferir("renovacao manda o refresh antigo", [falso.ultimoCorpo?.grant_type, falso.ultimoCorpo?.refresh_token], ["refresh_token", "renova-1"]);
  conferir("cotacao e leitura: passa com a trava fechada", (await meLer("/api/v2/me/shipment/calculate", {})).ok, true);
  let barrou = null;
  try {
    await mePost("/api/v2/me/cart", {});
  } catch (erro) {
    barrou = erro.message;
  }
  conferir("escrita barrada pela trava", [/FRETE_COMPRA/.test(barrou ?? ""), falso.pedidosDeCarrinho], [true, 0]);
  const teste = await testar();
  conferir("testar", [teste.ok, /saldo/i.test(teste.detalhe ?? "")], [true, true]);
  await prisma.conexao.deleteMany({ where: { servico: "MELHOR_ENVIO" } });
  let semConexao = null;
  try {
    await obterAccessToken();
  } catch (erro) {
    semConexao = erro.message;
  }
  conferir("sem conexao diz para conectar", /não conectado/i.test(semConexao ?? ""), true);
} finally {
  await devolverConexaoDoDono();
}

async function devolverConexaoDoDono() {
  await prisma.conexao.deleteMany({ where: { servico: "MELHOR_ENVIO" } });
  if (conexaoDoDono) {
    const { id: _id, servico: _servico, ...dados } = conexaoDoDono;
    await prisma.conexao.create({ data: { servico: "MELHOR_ENVIO", ...dados } });
  }
}

// ---------------------------------------------------------------------------
// Provedor de frete
// ---------------------------------------------------------------------------

const { obterProvedor, PROVEDOR_PADRAO } = await import("../src/lib/frete/provedores/registro.js");
const PEDIDO = {
  origem: { cep: "95090970" },
  destino: { cep: "01001000" },
  pacote: { pesoKg: 0.3, comprimentoCm: 16, larguraCm: 11, alturaCm: 3 },
  valorDeclarado: 24.85,
};

try {
  console.log("\nProvedor de frete");
  await prisma.conexao.deleteMany({ where: { servico: "MELHOR_ENVIO" } });
  await concluirAutorizacao("codigo-de-teste");
  conferir("padrao", PROVEDOR_PADRAO, "MELHOR_ENVIO");
  const servicos = await obterProvedor("MELHOR_ENVIO").cotar(PEDIDO);
  conferir("mapeia o servico", servicos.find((s) => s.servicoNome === "SEDEX"), {
    servicoId: "2",
    servicoNome: "SEDEX",
    transportadora: "Correios",
    preco: 28.85,
    prazoDias: 2,
    motivoDaRecusa: null,
  });
  conferir("recusado traz o motivo", servicos.find((s) => s.transportadora === "Buslog")?.motivoDaRecusa, "Transportadora não atende este trecho.");
  conferir("recusado sem preco", servicos.find((s) => s.transportadora === "Buslog")?.preco, null);
  conferir(
    "manda so digitos e numeros",
    [falso.ultimoCorpo.from.postal_code, falso.ultimoCorpo.to.postal_code, falso.ultimoCorpo.package.weight, falso.ultimoCorpo.options.insurance_value],
    ["95090970", "01001000", 0.3, 24.85],
  );
  const erroDe = async (preparar) => {
    preparar();
    try {
      await obterProvedor("MELHOR_ENVIO").cotar(PEDIDO);
      return null;
    } catch (erro) {
      return [erro.name, erro.codigo];
    }
  };
  conferir("422 de CEP", await erroDe(() => falso.responderCom(422, CEP_INVALIDO)), ["ErroDoProvedor", "CEP_INVALIDO"]);
  conferir("fora do ar", await erroDe(() => falso.responderCom(503, "")), ["ErroDoProvedor", "FORA_DO_AR"]);
  conferir("401", await erroDe(() => falso.responderCom(401, { message: "Unauthenticated." })), ["ErroDoProvedor", "NAO_CONECTADO"]);
  conferir("outro 4xx", await erroDe(() => falso.responderCom(400, { message: "Peso inválido." })), ["ErroDoProvedor", "RECUSADO"]);
  conferir("saldo", await obterProvedor("MELHOR_ENVIO").saldo(), { saldo: 123.45, reservado: 0 });
  conferir("provedor desconhecido", obterProvedor("XPTO"), null);
  await prisma.conexao.deleteMany({ where: { servico: "MELHOR_ENVIO" } });
  conferir("sem conexao", await erroDe(() => {}), ["ErroDoProvedor", "NAO_CONECTADO"]);
} finally {
  await devolverConexaoDoDono();
}

// ---------------------------------------------------------------------------
// Provedor: comprar, imprimir, rastrear e cancelar (fase 2)
// ---------------------------------------------------------------------------

const { config } = await import("../src/lib/integracoes/config.js");
const REMETENTE_ZZ = {
  nome: "ZZ Loja",
  documento: "12.345.678/0001-95",
  inscricaoEstadual: "0123456789",
  email: "zz-loja@exemplo.test",
  telefone: "54988990008",
  endereco: { cep: "95090970", logradouro: "Rua ZZ", numero: "10", complemento: "", bairro: "Centro", cidade: "Caxias do Sul", uf: "RS" },
};
const DESTINATARIO_ZZ = {
  nome: "ZZ Comprador",
  documento: "123.456.789-09",
  email: "zz-comprador@exemplo.test",
  telefone: "(11) 98888-7777",
  endereco: { cep: "01001000", logradouro: "Praça da Sé", numero: "1", complemento: "", bairro: "Sé", cidade: "São Paulo", uf: "SP" },
};
const envioZZ = {
  numero: 9001,
  servicoId: "1",
  remetente: REMETENTE_ZZ,
  destinatario: DESTINATARIO_ZZ,
  comprimentoCm: 16,
  larguraCm: 11,
  alturaCm: 3,
  pesoKg: 0.165,
  valorDeclarado: 98,
  tipoDeDocumento: "NFE",
  chaveNfe: "4".repeat(44),
  itensDaDeclaracao: [{ descricao: "ZZ item", quantidade: 1, valorUnitario: 98 }],
  idNoProvedor: null,
};
const liberarTrava = (liberada = true) => (config.travas.freteCompra = liberada);

try {
  console.log("\nProvedor: compra, impressão, rastreio e cancelamento");
  await prisma.conexao.deleteMany({ where: { servico: "MELHOR_ENVIO" } });
  await concluirAutorizacao("codigo-de-teste");
  const me = obterProvedor("MELHOR_ENVIO");
  const corpo = me.corpoDoCarrinho(envioZZ);
  conferir("carrinho: serviço numérico e um volume", [corpo.service, corpo.volumes.length, corpo.volumes[0].weight], [1, 1, 0.165]);
  conferir("carrinho: nota", [corpo.options.invoice?.key, corpo.options.non_commercial, corpo.from.state_register], ["4".repeat(44), false, "0123456789"]);
  conferir("carrinho: sem agency", "agency" in corpo, false);
  const declaracao = me.corpoDoCarrinho({ ...envioZZ, tipoDeDocumento: "DECLARACAO", chaveNfe: null });
  conferir("carrinho: declaração", [declaracao.options.invoice, declaracao.options.non_commercial, declaracao.from.state_register], [undefined, true, undefined]);
  conferir("carrinho: CNPJ e CPF", [corpo.from.company_document, corpo.from.document, corpo.to.document], ["12345678000195", undefined, "12345678909"]);
  conferir("carrinho: produtos e seguro", [corpo.products, corpo.options.insurance_value], [[{ name: "ZZ item", quantity: 1, unitary_value: 98 }], 98]);
  conferir("carrinho: tag do envio", [corpo.options.tags[0].tag, me.corpoDoCarrinho({ ...envioZZ, pedidoNumero: "1234" }).options.tags[0].tag], ["ENV-9001", "Pedido 1234"]);
  conferir("carrinho: telefone só dígitos", corpo.to.phone, "11988887777");

  liberarTrava(false);
  conferir("trava fechada", await me.comprar(envioZZ, {}).catch((e) => e.codigo), "TRAVADO");
  liberarTrava();
  let criado = null;
  const compra = await me.comprar(envioZZ, { aoCriarNoCarrinho: (id) => (criado = id) });
  conferir(
    "compra completa",
    [Boolean(criado), compra.idNoProvedor === criado, compra.custo, Boolean(compra.validoAte), Boolean(compra.rastreio), compra.eventos.map((e) => e.descricao)],
    [true, true, 25.84, true, true, ["Etiqueta paga", "Etiqueta gerada"]],
  );
  falso.falharEm = "checkout";
  let idPelaMetade = null;
  conferir("queda no pagamento lança", await me.comprar(envioZZ, { aoCriarNoCarrinho: (id) => (idPelaMetade = id) }).catch((e) => e.codigo), "FORA_DO_AR");
  falso.falharEm = null;
  const carrinhosAntes = falso.pedidosDeCarrinho;
  const retomada = await me.comprar({ ...envioZZ, idNoProvedor: idPelaMetade }, { aoCriarNoCarrinho: () => { throw new Error("não devia criar"); } });
  conferir("retoma sem novo carrinho", [falso.pedidosDeCarrinho, retomada.idNoProvedor, retomada.custo], [carrinhosAntes, idPelaMetade, 25.84]);
  falso.falharEm = "generate";
  let idSemGerar = null;
  await me.comprar(envioZZ, { aoCriarNoCarrinho: (id) => (idSemGerar = id) }).catch(() => {});
  falso.falharEm = null;
  const pagoAntes = falso.pedidos.get(idSemGerar).paid_at;
  const gerada = await me.comprar({ ...envioZZ, idNoProvedor: idSemGerar }, {});
  conferir("pago e não gerado: só gera", [Boolean(gerada.rastreio), falso.pedidos.get(idSemGerar).paid_at === pagoAntes], [true, true]);
  conferir("já gerado: só devolve", (await me.comprar({ ...envioZZ, idNoProvedor: criado }, {})).rastreio, compra.rastreio);

  const rastreio = await me.rastrear([criado, "nao-existe"]);
  conferir("rastrear mapeia", [rastreio.get(criado)?.status, rastreio.has("nao-existe")], ["A_POSTAR", false]);
  falso.pedidos.get(criado).status = "something_new";
  conferir("rastrear: desconhecido", (await me.rastrear([criado])).get(criado)?.desconhecido, true);
  falso.pedidos.get(criado).status = "released";
  conferir("imprimir devolve link", (await me.imprimir({ idNoProvedor: criado })).url.includes(criado), true);
  falso.recusarCancelamento = true;
  conferir("cancelar recusado traz o texto", await me.cancelar({ idNoProvedor: criado }, "teste").catch((e) => e.message), "O Melhor Envio recusou: Envio já postado não pode ser cancelado.");
  falso.recusarCancelamento = false;
  conferir("cancelar", [(await me.cancelar({ idNoProvedor: criado }, "teste")).ok, falso.pedidos.get(criado).status], [true, "canceled"]);
  conferir("cancelado não retoma", await me.comprar({ ...envioZZ, idNoProvedor: criado }, {}).catch((e) => e.codigo), "RECUSADO");
  falso.falharEm = "tracking";
  conferir("rastrear fora do ar", await me.rastrear([criado]).catch((e) => e.codigo), "FORA_DO_AR");
  falso.falharEm = null;
} finally {
  liberarTrava(false);
  falso.falharEm = null;
  await devolverConexaoDoDono();
}

// ---------------------------------------------------------------------------
// Cotacao e pacote sugerido
// ---------------------------------------------------------------------------

const { validarPedidoDeCotacao, pacoteSugerido, cotarFrete } = await import("../src/lib/frete/cotacao.js");
const limparProdutos = async () => {
  await prisma.produtoComponente.deleteMany({ where: { kit: { sku: { startsWith: "ZZ-FRETE-" } } } });
  await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-FRETE-" } } });
};

try {
  console.log("\nCotação e pacote sugerido");
  await limparProdutos();
  await prisma.conexao.deleteMany({ where: { servico: "MELHOR_ENVIO" } });
  await concluirAutorizacao("codigo-de-teste");
  const cx3 = await prisma.caixaDeEnvio.findUnique({ where: { nome: "CX 16x11x3" } });
  const novo = (sku, extra) => prisma.produto.create({ data: { sku, tituloBase: `Produto ${sku}`, tipo: "SIMPLES", ...extra } });
  const p1 = await novo("ZZ-FRETE-1", { pesoKg: 0.055, alturaCm: 2, larguraCm: 8, comprimentoCm: 6 });
  const p2 = await novo("ZZ-FRETE-2", { pesoKg: null, alturaCm: 1, larguraCm: 1, comprimentoCm: 1 });
  const peca = await novo("ZZ-FRETE-P", { pesoKg: 0.01, alturaCm: 1, larguraCm: 2, comprimentoCm: 3 });
  const kit = await prisma.produto.create({ data: { sku: "ZZ-FRETE-K", tituloBase: "Kit ZZ", tipo: "COMPOSICAO" } });
  await prisma.produtoComponente.create({ data: { kitId: kit.id, componenteId: peca.id, quantidade: 2 } });
  await prisma.produtoComponente.create({ data: { kitId: kit.id, componenteId: p1.id, quantidade: 1, ordem: 1 } });

  conferir("valida CEP", "cepDestino" in (validarPedidoDeCotacao({ cepDestino: "123", pesoKg: "0,3", valorDeclarado: "10", caixaId: cx3.id }).erros ?? {}), true);
  conferir("valida peso", "pesoKg" in (validarPedidoDeCotacao({ cepDestino: "01001-000", pesoKg: "0", valorDeclarado: "10", caixaId: cx3.id }).erros ?? {}), true);
  conferir("sem caixa exige medidas", "comprimentoCm" in (validarPedidoDeCotacao({ cepDestino: "01001000", pesoKg: "0,3", valorDeclarado: "10" }).erros ?? {}), true);
  conferir("valor invalido", "valorDeclarado" in (validarPedidoDeCotacao({ cepDestino: "01001000", pesoKg: "0,3", valorDeclarado: "abc", caixaId: cx3.id }).erros ?? {}), true);
  conferir(
    "aceita a brasileira",
    validarPedidoDeCotacao({ cepDestino: "01001-000", pesoKg: "0,3", valorDeclarado: "1.250,00", comprimentoCm: "16", larguraCm: "11", alturaCm: "3" }).pedido,
    { cepDestino: "01001000", pesoKg: 0.3, valorDeclarado: 1250, comprimentoCm: 16, larguraCm: 11, alturaCm: 3, caixaId: null },
  );
  conferir("sugere pelo produto", await pacoteSugerido([{ produtoId: p1.id, quantidade: 2, valorUnitario: 24.85 }]), {
    caixaId: cx3.id,
    motivo: null,
    pesoKg: 0.16,
    incompletos: 0,
    valorDeclarado: 49.7,
  });
  conferir("produto sem peso", await pacoteSugerido([{ produtoId: p2.id, quantidade: 1, valorUnitario: 5 }]), {
    caixaId: null,
    motivo: "ITENS_INCOMPLETOS",
    pesoKg: null,
    incompletos: 1,
    valorDeclarado: 5,
  });
  const doKit = await pacoteSugerido([{ produtoId: kit.id, quantidade: 1, valorUnitario: 30 }]);
  // (2 x 0,01 + 0,055 + 0,035 da caixa) x 1,10 = 0,121
  conferir("kit pelas pecas", [doKit.incompletos, doKit.caixaId, doKit.pesoKg], [0, cx3.id, 0.121]);
  conferir("produto que nao existe conta como incompleto", (await pacoteSugerido([{ produtoId: "nao-existe", quantidade: 1, valorUnitario: 1 }])).incompletos, 1);

  const boa = await cotarFrete({ cepDestino: "01001000", caixaId: cx3.id, pesoKg: "0,3", valorDeclarado: "24,85" });
  const acrescimo = (await lerConfigDeFrete()).acrescimoDeEmbalagem;
  conferir(
    "cota com a origem da empresa e o acrescimo",
    [boa.ok, boa.origemCep?.length, Math.round((boa.atendem?.[0].valorACobrar - boa.atendem?.[0].preco) * 100) / 100],
    [true, 8, acrescimo],
  );
  conferir("medidas vem da caixa", [falso.ultimoCorpo.package.length, falso.ultimoCorpo.package.width, falso.ultimoCorpo.package.height], [16, 11, 3]);
  conferir("o pacote volta com o nome da caixa", [boa.pacote?.caixaNome, boa.pacote?.pesoKg], ["CX 16x11x3", 0.3]);
  conferir("recusados separados", boa.recusados?.length, 3);
  conferir("caixa que nao existe", "caixaId" in ((await cotarFrete({ cepDestino: "01001000", caixaId: "nao-existe", pesoKg: "0,3", valorDeclarado: "1" })).erros ?? {}), true);
  conferir("invalido nao chama o provedor", (await cotarFrete({ cepDestino: "1", caixaId: cx3.id, pesoKg: "0,3", valorDeclarado: "1" })).ok, false);
  falso.responderCom(503, "");
  conferir("provedor fora do ar nao lanca", await cotarFrete({ cepDestino: "01001000", caixaId: cx3.id, pesoKg: "0,3", valorDeclarado: "24,85" }), {
    ok: false,
    codigo: "FORA_DO_AR",
    erro: "O Melhor Envio não respondeu. Tente de novo em instantes.",
  });
  falso.responderCom(422, CEP_INVALIDO);
  conferir("CEP recusado", (await cotarFrete({ cepDestino: "01001000", caixaId: cx3.id, pesoKg: "0,3", valorDeclarado: "1" })).codigo, "CEP_INVALIDO");
} finally {
  await limparProdutos();
  await devolverConexaoDoDono();
}

// ---------------------------------------------------------------------------
// Envio em rascunho no pedido de venda
// ---------------------------------------------------------------------------

const { numeroDoEnvio, lerEnvioDoPedido, salvarRascunhoDoPedido, cotacaoDaPropostaDoPedido, envioParaATela, cotacaoParaATela } = await import(
  "../src/lib/frete/envios.js"
);
const { criarProposta } = await import("../src/lib/propostas/banco.js");
const limparEnvios = async () => {
  await prisma.envio.deleteMany({ where: { OR: [{ servicoNome: { startsWith: "ZZ " } }, { pedidoDeVenda: { numero: { startsWith: "ZZ-FRETE-" } } }] } });
  await prisma.pedidoDeVenda.deleteMany({ where: { numero: { startsWith: "ZZ-FRETE-" } } });
  await prisma.propostaParaCliente.deleteMany({ where: { clienteNome: "ZZ Frete Proposta" } });
};
const pedidoDeTeste = (numero, extra = {}) =>
  prisma.pedidoDeVenda.create({
    data: {
      origem: "BLING",
      canal: "BLING",
      idExterno: numero,
      numero,
      dataDaVenda: new Date(),
      atualizadoNaOrigemEm: new Date(),
      statusDaOrigem: "Em aberto",
      status: "PAGO",
      nomeDoComprador: "ZZ Comprador",
      emailDoComprador: "zz-comprador@exemplo.test",
      enderecoDeEntrega: { nome: "ZZ Comprador", endereco: "Praça da Sé", numero: "1", bairro: "Sé", cidade: "São Paulo", uf: "SP", cep: "01001000" },
      pagamento: [],
      envio: {},
      historico: [],
      totalProdutos: 49.7,
      desconto: 0,
      freteCobrado: 0,
      total: 49.7,
      ...extra,
    },
  });

try {
  console.log("\nEnvio em rascunho no pedido");
  await limparEnvios();
  const cx3 = await prisma.caixaDeEnvio.findUnique({ where: { nome: "CX 16x11x3" } });
  const pacote = { cepDestino: "01001000", caixaId: cx3.id, caixaNome: cx3.nome, pesoKg: 0.165, comprimentoCm: 16, larguraCm: 11, alturaCm: 3, valorDeclarado: 49.7 };
  const servico = { servicoId: "2", servicoNome: "SEDEX", transportadora: "Correios", preco: 28.85, prazoDias: 2, valorACobrar: 29.85 };
  const cotadoEm = "2026-11-18T22:00:00.000Z";
  const pedido = await pedidoDeTeste("ZZ-FRETE-PED");
  const outro = await pedidoDeTeste("ZZ-FRETE-PED-2");

  conferir("numero", [numeroDoEnvio(1), numeroDoEnvio(12345)], ["ENV-0001", "ENV-12345"]);
  conferir("sem envio ainda", await lerEnvioDoPedido(pedido.id), null);
  const primeiro = await salvarRascunhoDoPedido(pedido.id, { pacote, servico, cotadoEm }, "zz-frete");
  conferir(
    "cria o rascunho",
    [primeiro.ok, primeiro.envio?.status, primeiro.envio?.direcao, primeiro.envio?.medidaConferida, primeiro.envio?.servicoNome, primeiro.envio?.precoCotado],
    [true, "RASCUNHO", "IDA", false, "SEDEX", 28.85],
  );
  conferir("destinatario copiado do pedido", [primeiro.envio?.destinatario?.endereco?.cep, primeiro.envio?.destinatario?.nome], ["01001000", "ZZ Comprador"]);
  conferir("remetente e a empresa", primeiro.envio?.remetente?.endereco?.cep?.replace(/\D/g, "").length, 8);
  conferir("lido de volta", (await lerEnvioDoPedido(pedido.id))?.id, primeiro.envio?.id);
  // O que vai ao navegador: sem remetente e destinatario (CPF, endereco), que a aba Envio nao mostra e quem nao ve dado
  // pessoal do cliente nao pode receber (revisao final, 18/11/2026).
  const naTela = envioParaATela(primeiro.envio);
  conferir("tela sem dado pessoal", ["remetente", "destinatario"].some((campo) => campo in naTela), false);
  conferir("tela com o que a aba mostra", [naTela.servicoNome, naTela.pesoKg, naTela.numero], ["SEDEX", 0.165, primeiro.envio.numero]);
  conferir("cotacao da proposta so com caixa e peso", cotacaoParaATela({ caixaId: "x", pesoKg: 0.2, cepDestino: "01001000", valorCobrado: 9 }), { caixaId: "x", pesoKg: 0.2 });
  conferir("sem envio nem cotacao", [envioParaATela(null), cotacaoParaATela(null)], [null, null]);
  const segundo = await salvarRascunhoDoPedido(pedido.id, { pacote, servico: { ...servico, servicoNome: "PAC", servicoId: "1" }, cotadoEm }, "zz-frete");
  conferir(
    "cotar de novo atualiza o mesmo",
    [segundo.envio?.id === primeiro.envio?.id, segundo.envio?.servicoNome, await prisma.envio.count({ where: { pedidoDeVendaId: pedido.id } })],
    [true, "PAC", 1],
  );
  const [a, b] = await Promise.all([
    salvarRascunhoDoPedido(outro.id, { pacote, servico, cotadoEm }, "zz"),
    salvarRascunhoDoPedido(outro.id, { pacote, servico, cotadoEm }, "zz"),
  ]);
  conferir("dois cliques criam um envio so", [a.ok && b.ok, await prisma.envio.count({ where: { pedidoDeVendaId: outro.id } })], [true, 1]);
  conferir("numeros diferentes por envio", primeiro.envio?.numero !== a.envio?.numero, true);
  conferir("pacote invalido", (await salvarRascunhoDoPedido(pedido.id, { pacote: { ...pacote, pesoKg: 0 }, servico, cotadoEm }, "zz")).ok, false);
  conferir("pedido que nao existe", (await salvarRascunhoDoPedido("nao-existe", { pacote, servico, cotadoEm }, "zz")).ok, false);
  await prisma.envio.update({ where: { id: primeiro.envio.id }, data: { status: "A_POSTAR" } });
  conferir("comprado nao volta a rascunho", (await salvarRascunhoDoPedido(pedido.id, { pacote, servico, cotadoEm }, "zz-frete")).ok, false);
  await prisma.pedidoDeVenda.delete({ where: { id: pedido.id } });
  conferir("apagar o pedido mantem o envio", (await prisma.envio.findUnique({ where: { id: primeiro.envio.id } }))?.pedidoDeVendaId, null);
  await prisma.envio.update({ where: { id: primeiro.envio.id }, data: { servicoNome: "ZZ apagar" } });

  const proposta = await criarProposta({ login: "zz" });
  await prisma.propostaParaCliente.update({
    where: { id: proposta.id },
    data: { clienteNome: "ZZ Frete Proposta", pedidoDeVendaBlingId: "zz-bling-777", cotacaoDoFrete: { caixaNome: "CX 16x11x3", pesoKg: 0.165, valorCobrado: 29.85 } },
  });
  const comProposta = await pedidoDeTeste("ZZ-FRETE-PED-3", { blingPedidoId: "zz-bling-777" });
  conferir("cotacao da proposta de origem", (await cotacaoDaPropostaDoPedido(comProposta))?.caixaNome, "CX 16x11x3");
  conferir("pedido sem proposta", await cotacaoDaPropostaDoPedido(outro), null);
} finally {
  await limparEnvios();
}

// ---------------------------------------------------------------------------
// Fase 2: conferir o pacote e comprar a etiqueta
// ---------------------------------------------------------------------------

const { conferirPacote, comprarEtiqueta, lerEnvio, linkDaEtiqueta, cancelarEtiqueta } = await import("../src/lib/frete/envios.js");

try {
  console.log("\nConferir o pacote e comprar a etiqueta");
  await limparEnvios();
  await prisma.conexao.deleteMany({ where: { servico: "MELHOR_ENVIO" } });
  await concluirAutorizacao("codigo-de-teste");
  const cx3 = await prisma.caixaDeEnvio.findUnique({ where: { nome: "CX 16x11x3" } });
  const pacote = { cepDestino: "01001000", caixaId: cx3.id, caixaNome: cx3.nome, pesoKg: 0.165, comprimentoCm: 16, larguraCm: 11, alturaCm: 3, valorDeclarado: 49.7 };
  const sedex = { servicoId: "2", servicoNome: "SEDEX", transportadora: "Correios", preco: 28.85, prazoDias: 2, valorACobrar: 29.85 };
  const comItens = async (numero) => {
    const pedido = await pedidoDeTeste(numero);
    await prisma.itemDoPedidoDeVenda.create({ data: { pedidoId: pedido.id, ordem: 0, titulo: "ZZ Display LCD", quantidade: 2, precoUnitario: 24.85, desconto: 0, total: 49.7 } });
    const { envio } = await salvarRascunhoDoPedido(pedido.id, { pacote, servico: sedex, cotadoEm: new Date().toISOString() }, "zz");
    return envio;
  };
  const medido = { caixaId: cx3.id, pesoKg: "0,2", tipoDeDocumento: "NFE", chaveNfe: "4".repeat(44) };

  const envio = await comItens("ZZ-FRETE-COMPRA-1");
  conferir("rascunho leva os itens como declaração", envio.itensDaDeclaracao, [{ descricao: "ZZ Display LCD", quantidade: 2, valorUnitario: 24.85 }]);
  conferir("remetente com a inscrição estadual", "inscricaoEstadual" in (await prisma.envio.findUnique({ where: { id: envio.id } })).remetente, true);
  conferir("comprar sem conferir recusa", (await comprarEtiqueta(envio.id, "zz")).erro, "A compra de etiquetas está travada (FRETE_COMPRA).");
  const conferido = await conferirPacote(envio.id, medido, "zz");
  conferir(
    "conferir recota e marca medida",
    [conferido.ok, conferido.envio?.medidaConferida, conferido.envio?.pesoKg, conferido.preco, conferido.saldo, conferido.envio?.tipoDeDocumento],
    [true, true, 0.2, 28.85, 123.45, "NFE"],
  );
  conferir("trava fechada aparece nos motivos", conferido.motivos, ["A compra de etiquetas está travada (FRETE_COMPRA)."]);
  conferir("chave curta", (await conferirPacote(envio.id, { ...medido, chaveNfe: "123" }, "zz")).erros?.chaveNfe, "A chave da NF-e tem 44 dígitos.");
  conferir("sem documento", "tipoDeDocumento" in ((await conferirPacote(envio.id, { ...medido, tipoDeDocumento: "" }, "zz")).erros ?? {}), true);
  await prisma.envio.update({ where: { id: envio.id }, data: { servicoId: "999" } });
  conferir("serviço que sumiu", (await conferirPacote(envio.id, medido, "zz")).erro, "O serviço escolhido não atende o pacote medido: cote de novo.");
  await prisma.envio.update({ where: { id: envio.id }, data: { servicoId: "2" } });
  conferir("trava fechada recusa", (await comprarEtiqueta(envio.id, "zz")).erro, "A compra de etiquetas está travada (FRETE_COMPRA).");

  liberarTrava();
  const carrinhosAntes = falso.pedidosDeCarrinho;
  const [a, b] = await Promise.all([comprarEtiqueta(envio.id, "zz"), comprarEtiqueta(envio.id, "zz")]);
  conferir("clique duplo: um compra", [a.ok, b.ok].filter(Boolean).length, 1);
  conferir("clique duplo: o outro sabe por quê", [a.erro, b.erro].filter(Boolean)[0], "Esta etiqueta já está sendo comprada.");
  conferir("clique duplo: um carrinho", falso.pedidosDeCarrinho - carrinhosAntes, 1);
  const comprado = await lerEnvio(envio.id);
  conferir(
    "comprado",
    [comprado.status, comprado.compradoPor, comprado.custo, Boolean(comprado.rastreio), comprado.linkDoRastreio?.startsWith("https://melhorrastreio.com.br/rastreio/"), Boolean(comprado.validoAte)],
    ["A_POSTAR", "zz", 25.84, true, true, true],
  );
  conferir("o carrinho levou a tag do pedido", falso.ultimoCarrinho.options.tags[0].tag, "Pedido ZZ-FRETE-COMPRA-1");
  conferir("comprado não compra de novo", (await comprarEtiqueta(envio.id, "zz")).erro, "Esta etiqueta já foi comprada.");
  conferir("comprado não reconfere", (await conferirPacote(envio.id, medido, "zz")).erro, "Esta etiqueta já foi comprada.");

  const envio2 = await comItens("ZZ-FRETE-COMPRA-2");
  await conferirPacote(envio2.id, medido, "zz");
  falso.falharEm = "checkout";
  const caiu = await comprarEtiqueta(envio2.id, "zz");
  falso.falharEm = null;
  const depoisDaQueda = await lerEnvio(envio2.id);
  conferir("queda: volta a rascunho com o id", [caiu.ok, depoisDaQueda.status, Boolean(depoisDaQueda.idNoProvedor), Boolean(depoisDaQueda.ultimoErro)], [false, "RASCUNHO", true, true]);
  const antesDaRetomada = falso.pedidosDeCarrinho;
  const retomou = await comprarEtiqueta(envio2.id, "zz");
  conferir("retomada não cria carrinho", [retomou.ok, falso.pedidosDeCarrinho - antesDaRetomada, retomou.envio?.status], [true, 0, "A_POSTAR"]);

  const envio3 = await comItens("ZZ-FRETE-COMPRA-3");
  await conferirPacote(envio3.id, medido, "zz");
  falso.saldo = 5;
  conferir("saldo curto recusa", (await comprarEtiqueta(envio3.id, "zz")).erro, "Saldo insuficiente: R$ 5,00 na carteira para R$ 28,85.");
  falso.saldo = 123.45;
  await prisma.$executeRaw`UPDATE "Envio" SET status = 'COMPRANDO', "atualizadoEm" = now() - interval '10 minutes' WHERE id = ${envio3.id}`;
  conferir("comprando parado é retomado", (await comprarEtiqueta(envio3.id, "zz")).envio?.status, "A_POSTAR");
  const envio4 = await comItens("ZZ-FRETE-COMPRA-4");
  await conferirPacote(envio4.id, medido, "zz");
  await prisma.envio.update({ where: { id: envio4.id }, data: { status: "COMPRANDO" } });
  conferir("comprando agora não é retomado", (await comprarEtiqueta(envio4.id, "zz")).erro, "Esta etiqueta já está sendo comprada.");

  console.log("\nImprimir e cancelar");
  conferir("imprimir rascunho recusa", (await linkDaEtiqueta(envio4.id)).erro, "A etiqueta ainda não foi comprada.");
  const link = await linkDaEtiqueta(envio.id);
  conferir("imprimir devolve o link", [link.ok, link.url?.includes((await lerEnvio(envio.id)).idNoProvedor)], [true, true]);
  conferir("cancelar rascunho recusa", (await cancelarEtiqueta(envio4.id, "teste", "zz")).erro, "Só a etiqueta a postar pode ser cancelada.");
  falso.recusarCancelamento = true;
  const recusado = await cancelarEtiqueta(envio.id, "teste", "zz");
  falso.recusarCancelamento = false;
  conferir("cancelamento recusado fica a postar", [recusado.erro, (await lerEnvio(envio.id)).status], ["O Melhor Envio recusou: Envio já postado não pode ser cancelado.", "A_POSTAR"]);
  const mudados = [];
  const cancelado = await cancelarEtiqueta(envio.id, "teste", "zz", { aoMudarCusto: async (pedidoId) => mudados.push(pedidoId) });
  conferir(
    "cancelado",
    [cancelado.ok, cancelado.envio?.status, Boolean(cancelado.envio?.canceladoEm), mudados.length],
    [true, "CANCELADO", true, 1],
  );
  conferir("cancelado pode cotar de novo", (await salvarRascunhoDoPedido(envio.pedidoDeVendaId, { pacote, servico: sedex, cotadoEm: new Date().toISOString() }, "zz")).ok, true);
} finally {
  liberarTrava(false);
  falso.falharEm = null;
  falso.saldo = 123.45;
  await limparEnvios();
  await devolverConexaoDoDono();
}

// ---------------------------------------------------------------------------
// Fase 2: rotina de rastreio dos envios (worker)
// ---------------------------------------------------------------------------

const { rodarRastreioDosEnvios } = await import("../src/lib/frete/rastreio.js");

try {
  console.log("\nRotina de rastreio dos envios");
  await limparEnvios();
  await prisma.conexao.deleteMany({ where: { servico: "MELHOR_ENVIO" } });
  await concluirAutorizacao("codigo-de-teste");
  liberarTrava();
  const cx3 = await prisma.caixaDeEnvio.findUnique({ where: { nome: "CX 16x11x3" } });
  const pacote = { cepDestino: "01001000", caixaId: cx3.id, caixaNome: cx3.nome, pesoKg: 0.165, comprimentoCm: 16, larguraCm: 11, alturaCm: 3, valorDeclarado: 49.7 };
  const sedex = { servicoId: "2", servicoNome: "SEDEX", transportadora: "Correios", preco: 28.85, prazoDias: 2, valorACobrar: 29.85 };
  const comprado = async (numero) => {
    const pedido = await pedidoDeTeste(numero);
    await prisma.itemDoPedidoDeVenda.create({ data: { pedidoId: pedido.id, ordem: 0, titulo: "ZZ Display LCD", quantidade: 2, precoUnitario: 24.85, desconto: 0, total: 49.7 } });
    const { envio } = await salvarRascunhoDoPedido(pedido.id, { pacote, servico: sedex, cotadoEm: new Date().toISOString() }, "zz");
    await conferirPacote(envio.id, { caixaId: cx3.id, pesoKg: "0,2", tipoDeDocumento: "NFE", chaveNfe: "4".repeat(44) }, "zz");
    return (await comprarEtiqueta(envio.id, "zz")).envio;
  };
  const envio = await comprado("ZZ-FRETE-RASTREIO-1");
  const outro = await comprado("ZZ-FRETE-RASTREIO-2");
  const idME = (await prisma.envio.findUnique({ where: { id: envio.id } })).idNoProvedor;
  const avisos = [];
  const avisar = async (envioId) => avisos.push(envioId);

  const r0 = await rodarRastreioDosEnvios({ avisar });
  conferir("nada mudou", [r0.ok, r0.consultados, r0.mudados, avisos.length], [true, 2, 0, 0]);
  // Uma hora depois da geracao (que o falso carimba com a hora de agora), no formato do Melhor Envio (horario de Brasilia).
  const daquiAUmaHora = new Date(Date.now() + 3600 * 1000);
  const postadoEmME = new Date(daquiAUmaHora.getTime() - 3 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " ");
  Object.assign(falso.pedidos.get(idME), { status: "posted", posted_at: postadoEmME });
  const r1 = await rodarRastreioDosEnvios({ avisar });
  const postado = await lerEnvio(envio.id);
  conferir(
    "postado",
    [postado.status, r1.mudados, avisos, postado.postadoEm?.toISOString().slice(0, 19)],
    ["POSTADO", 1, [envio.id], daquiAUmaHora.toISOString().slice(0, 19)],
  );
  conferir("evento de postagem", postado.eventos.at(-1).descricao, "Postado");
  const r2 = await rodarRastreioDosEnvios({ avisar });
  conferir("sem mudança não reescreve nem reavisa", [r2.mudados, avisos.length], [0, 1]);
  Object.assign(falso.pedidos.get(idME), { status: "delivered", delivered_at: "2099-11-21 10:00:00" });
  await rodarRastreioDosEnvios({ avisar });
  conferir("entregue não reavisa", [(await lerEnvio(envio.id)).status, avisos.length], ["ENTREGUE", 1]);
  conferir("entregue sai da rotina", (await rodarRastreioDosEnvios({ avisar })).consultados, 1);

  const idOutro = (await prisma.envio.findUnique({ where: { id: outro.id } })).idNoProvedor;
  falso.pedidos.get(idOutro).status = "something_new";
  await rodarRastreioDosEnvios({ avisar });
  const desconhecido = await lerEnvio(outro.id);
  conferir("desconhecido fica como estava", [desconhecido.status, desconhecido.ultimoErro], ["A_POSTAR", "Situação desconhecida do Melhor Envio: something_new"]);
  falso.pedidos.get(idOutro).status = "released";
  falso.falharEm = "tracking";
  const antes = (await lerEnvio(outro.id)).ultimaConsultaEm;
  const foraDoAr = await rodarRastreioDosEnvios({ avisar });
  conferir("fora do ar não mexe", [foraDoAr.ok, (await lerEnvio(outro.id)).status, String((await lerEnvio(outro.id)).ultimaConsultaEm)], [false, "A_POSTAR", String(antes)]);
  falso.falharEm = null;
  const expirou = await rodarRastreioDosEnvios({ agora: new Date("2027-06-01T12:00:00Z"), avisar });
  conferir("expirado", [expirou.expirados, (await lerEnvio(outro.id)).status], [1, "EXPIRADO"]);
} finally {
  liberarTrava(false);
  falso.falharEm = null;
  await limparEnvios();
  await devolverConexaoDoDono();
}

// ---------------------------------------------------------------------------
// Fase 2: o custo da etiqueta no lucro do pedido
// ---------------------------------------------------------------------------

const { parcelasDoReal } = await import("../src/lib/pedidos/lucro.js");
const { recalcularLucroDoPedido, salvarCustoDoFreteManual } = await import("../src/lib/pedidos/banco.js");
const { custoDaEtiquetaDoPedido } = await import("../src/lib/frete/lucro.js");

try {
  console.log("\nCusto da etiqueta no lucro do pedido");
  await limparEnvios();
  const itensLucro = [{ quantidade: 2, precoUnitario: 24.85, total: 49.7, custoUnitarioCongelado: 10 }];
  const totaisLucro = { totalProdutos: 49.7, total: 49.7 };
  conferir("etiqueta vence o manual", parcelasDoReal({ origem: "BLING", itens: itensLucro, totais: totaisLucro, custoDoFreteManual: 30, custoDaEtiqueta: 25.84 }).frete, 25.84);
  conferir("fonte da etiqueta", parcelasDoReal({ origem: "BLING", itens: itensLucro, totais: totaisLucro, custoDoFreteManual: 30, custoDaEtiqueta: 25.84 }).fontes.frete, "etiqueta");
  conferir("sem etiqueta fica o manual", parcelasDoReal({ origem: "BLING", itens: itensLucro, totais: totaisLucro, custoDoFreteManual: 30 }).fontes.frete, "manual");

  const pedido = await pedidoDeTeste("ZZ-FRETE-LUCRO");
  await prisma.itemDoPedidoDeVenda.create({ data: { pedidoId: pedido.id, ordem: 0, titulo: "ZZ Display LCD", quantidade: 2, precoUnitario: 24.85, desconto: 0, total: 49.7, custoUnitarioCongelado: 10 } });
  await salvarCustoDoFreteManual(pedido.id, 30);
  const base = { numero: 99001, pedidoDeVendaId: pedido.id, direcao: "IDA", remetente: {}, destinatario: {}, comprimentoCm: 16, larguraCm: 11, alturaCm: 3, pesoKg: 0.2, valorDeclarado: 49.7, servicoNome: "ZZ SEDEX" };
  const envio = await prisma.envio.create({ data: { ...base, status: "A_POSTAR", custo: 25.84 } });
  conferir("custo da etiqueta do pedido", await custoDaEtiquetaDoPedido(prisma, pedido.id), 25.84);
  await recalcularLucroDoPedido(pedido.id);
  const comEtiqueta = await prisma.pedidoDeVenda.findUnique({ where: { id: pedido.id } });
  conferir("real com a etiqueta", [comEtiqueta.real.frete, comEtiqueta.real.fontes.frete], [25.84, "etiqueta"]);
  await salvarCustoDoFreteManual(pedido.id, 31);
  conferir("digitar o frete não tira a etiqueta", (await prisma.pedidoDeVenda.findUnique({ where: { id: pedido.id } })).real.fontes.frete, "etiqueta");
  await prisma.envio.update({ where: { id: envio.id }, data: { status: "CANCELADO" } });
  conferir("cancelado não conta", await custoDaEtiquetaDoPedido(prisma, pedido.id), null);
  await recalcularLucroDoPedido(pedido.id);
  const semEtiqueta = await prisma.pedidoDeVenda.findUnique({ where: { id: pedido.id } });
  conferir("cancelado volta ao manual", [semEtiqueta.real.frete, semEtiqueta.real.fontes.frete], [31, "manual"]);
  await prisma.envio.update({ where: { id: envio.id }, data: { status: "RASCUNHO", custo: null } });
  conferir("rascunho não conta", await custoDaEtiquetaDoPedido(prisma, pedido.id), null);
} finally {
  await limparEnvios();
}

// ---------------------------------------------------------------------------

servidor.close();
await prisma.$disconnect();
console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
