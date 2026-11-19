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
    if (caminho === "/api/v2/me/balance") return responder(200, { balance: 123.45, reserved: 0, debts: 0 });
    if (caminho === "/api/v2/me/shipment/calculate") {
      if (falso.proxima) {
        const { status, corpo: dados } = falso.proxima;
        falso.proxima = null;
        return responder(status, dados);
      }
      return responder(200, COTACAO_SP);
    }
    if (caminho === "/api/v2/me/cart") {
      falso.pedidosDeCarrinho++;
      return responder(201, { id: "zz-carrinho" });
    }
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
  conferir("fase 2 ainda nao", await obterProvedor("MELHOR_ENVIO").comprar({}).catch((e) => e.message), "Disponível na fase 2 do módulo de frete.");
  conferir("saldo", await obterProvedor("MELHOR_ENVIO").saldo(), { saldo: 123.45, reservado: 0 });
  conferir("provedor desconhecido", obterProvedor("XPTO"), null);
  await prisma.conexao.deleteMany({ where: { servico: "MELHOR_ENVIO" } });
  conferir("sem conexao", await erroDe(() => {}), ["ErroDoProvedor", "NAO_CONECTADO"]);
} finally {
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

const { numeroDoEnvio, lerEnvioDoPedido, salvarRascunhoDoPedido, cotacaoDaPropostaDoPedido } = await import("../src/lib/frete/envios.js");
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

servidor.close();
await prisma.$disconnect();
console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
