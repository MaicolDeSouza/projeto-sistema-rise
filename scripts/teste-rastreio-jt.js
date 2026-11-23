import "dotenv/config";

/**
 * Testes do rastreio da J&T nos pedidos de compra pelo PacoteVicio (spec 2026-11-23-rastreio-jt-nas-compras-design.md):
 * regras puras, o cliente contra um PacoteVicio FALSO nesta maquina (formato da documentacao lida em 23/11/2026), a
 * gravacao no pedido (CNPJ, CPF alternativo, nao achado, encerrado), a rotina do worker com o teto do mes, a Situacao e o
 * "!" da lista e o lerPedidoDeCompra do MCP. SEM rede.
 *
 *   npm run teste:rastreio-jt
 *
 * So escreve o fornecedor "ZZ JT Fornecedor" e os pedidos dele; a ConfigDeFrete (CPF alternativo e contagem do mes) volta
 * ao que era no fim.
 */

const { register } = await import("node:module");
const { pathToFileURL } = await import("node:url");
register(new URL("./resolver-alias.js", import.meta.url), pathToFileURL("./"));

const http = await import("node:http");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}${ok ? "" : ` -> obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)}`}`);
}

const AGORA = new Date("2026-11-23T12:00:00-03:00");
const HORA = 60 * 60 * 1000;
const CPF = "529.982.247-25";
const CPF_DIGITOS = "52998224725";

/** Resposta no formato da documentacao do PacoteVicio (rota jtexpress), com o evento de atribuicao do plano Basico. */
function resposta(codigo, eventos, { entregue = null } = {}) {
  const lista = [
    { timestamp: "2026-11-20T10:00:00Z", status: "unknown", description: "Rastreio fornecido por PacoteVicio.dev", location: null },
    ...eventos.map(([timestamp, status, description, city, state]) => ({
      timestamp,
      status,
      description,
      location: city ? { country: "BR", state, city, facility: "DC" } : null,
      courier_status_code: "10",
      courier_status_label: description,
    })),
  ];
  const ultimo = lista.at(-1);
  return { tracking_code: codigo, courier: "jtexpress", status: ultimo.status, status_updated_at: ultimo.timestamp, delivered_at: entregue, events: lista };
}

const CODIGO_TRANSITO = "888031051753987";
const CODIGO_ENTREGUE = "888000000000002";
const CODIGO_SO_CPF = "888000000000003";
const CODIGO_PROBLEMA = "888000000000004";
const CODIGO_SUMIDO = "888000000000005";

/** O PacoteVicio falso: guarda cada pedido (rota e cabecalhos) e responde pelo codigo e pelo documento. */
const chamadas = [];
let cnpjDigitos = null;
let foraDoAr = false;
const servidor = http.createServer((req, res) => {
  const documento = req.headers["x-tracking-document"] ?? null;
  chamadas.push({ rota: req.url, chave: req.headers["x-api-key"], documento });
  const responder = (status, corpo) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(corpo));
  };
  const erro = (status, code) => responder(status, { error: { code, message: `erro ${code}`, request_id: "x" } });
  if (foraDoAr) return erro(503, "courier_unavailable");
  if (req.headers["x-api-key"] !== "pv1_teste") return erro(401, "invalid_api_key");
  const casado = /^\/v1\/track\/jtexpress\/(\d+)$/.exec(req.url);
  if (!casado) return erro(404, "not_found");
  if (!documento) return erro(422, "document_required");
  const codigo = casado[1];
  if (codigo === CODIGO_TRANSITO && documento === cnpjDigitos) {
    return responder(200, resposta(codigo, [["2026-11-21T21:07:08Z", "collected", "O pacote foi coletado", "Barueri", "SP"], ["2026-11-22T14:31:34Z", "in_transit", "Em transferência para o destino", "Campinas", "SP"]]));
  }
  if (codigo === CODIGO_ENTREGUE && documento === cnpjDigitos) {
    return responder(200, resposta(codigo, [["2026-11-21T21:07:08Z", "collected", "Coletado", "Barueri", "SP"], ["2026-11-22T18:00:00Z", "delivered", "Entregue", "Caxias do Sul", "RS"]], { entregue: "2026-11-22T18:00:00Z" }));
  }
  if (codigo === CODIGO_SO_CPF && documento === CPF_DIGITOS) {
    return responder(200, resposta(codigo, [["2026-11-22T09:00:00Z", "out_for_delivery", "Saiu para entrega", "Caxias do Sul", "RS"]]));
  }
  if (codigo === CODIGO_PROBLEMA && documento === cnpjDigitos) {
    return responder(200, resposta(codigo, [["2026-11-22T09:00:00Z", "exception", "Destinatário ausente", "Caxias do Sul", "RS"]]));
  }
  return erro(404, "tracking_not_found");
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
process.env.PACOTEVICIO_URL = `http://127.0.0.1:${servidor.address().port}`;
process.env.PACOTEVICIO_API_KEY = "pv1_teste";

const { prisma } = await import("../src/lib/db.js");
const regras = await import("../src/lib/compras/rastreioJT/regras.js");
const { consultarJT } = await import("../src/lib/compras/rastreioJT/pacoteVicio.js");
const banco = await import("../src/lib/compras/rastreioJT/banco.js");
const compras = await import("../src/lib/compras/banco.js");
const { lerDadosDaEmpresa } = await import("../src/lib/compras/empresa.js");
const { lerConfigDeFrete } = await import("../src/lib/frete/configuracao.js");
const { faseDoPedido, alertasDoPedido } = await import("../src/lib/compras/aliexpress/regras.js");

const configAntes = await lerConfigDeFrete();
const empresa = await lerDadosDaEmpresa();
cnpjDigitos = String(empresa?.cnpj ?? "").replace(/\D/g, "") || null;

async function limpar() {
  await prisma.pedidoDeCompra.deleteMany({ where: { fornecedor: { nome: { startsWith: "ZZ JT" } } } });
  await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: "ZZ JT" } } });
}

async function pedidoDaJT(rastreio, { transportadoraNome = null, status = "ENVIADO" } = {}) {
  const fornecedor = await prisma.fornecedor.create({ data: { nome: `ZZ JT Fornecedor ${rastreio}` } });
  const criado = await compras.criarPedido(fornecedor.id);
  await prisma.pedidoDeCompra.update({ where: { id: criado.pedidoId }, data: { status, rastreio, transportadoraNome, enviadoEm: AGORA } });
  return criado.pedidoId;
}

try {
  await limpar();
  console.log("\n== Regras puras ==");
  conferir("888 com 15 digitos e da J&T", regras.ehDaJT({ rastreio: "888031051753987" }), true);
  conferir("888 com espacos e da J&T", regras.ehDaJT({ rastreio: " 888 0310 5175 3987 " }), true);
  conferir("codigo dos Correios nao e", regras.ehDaJT({ rastreio: "QB123456789BR" }), false);
  conferir("transportadora J&T com codigo qualquer e", regras.ehDaJT({ rastreio: "JT123", transportadora: "J&T Express" }), true);
  conferir("transportadora JT Express e", regras.ehDaJT({ rastreio: "123", transportadora: "jt express" }), true);
  conferir("sem rastreio nunca e", regras.ehDaJT({ rastreio: "", transportadora: "J&T" }), false);
  conferir("codigo limpo", regras.codigoDaJT(" 888 0310 5175 3987 "), "888031051753987");
  conferir("rotulos", ["in_transit", "out_for_delivery", "delivered", "exception", "returned", "xyz"].map(regras.rotuloDaSituacao), ["Em trânsito", "Saiu para entrega", "Entregue", "Problema na entrega", "Devolvido", "Sem tradução"]);

  const lida = regras.lerRespostaDoPacoteVicio(resposta(CODIGO_TRANSITO, [["2026-11-21T21:07:08Z", "collected", "Coletado", "Barueri", "SP"], ["2026-11-22T14:31:34Z", "novo_status", "Algo novo", null, null]]));
  conferir("situacao desconhecida vira unknown", lida.situacao, "unknown");
  conferir("eventos do mais recente, com a atribuicao no fim", lida.eventos.map((e) => e.descricao), ["Algo novo", "Coletado", "Rastreio fornecido por PacoteVicio.dev"]);
  conferir("local com cidade (UF)", lida.eventos[1].local, "Barueri (SP)");
  conferir("evento sem local", lida.eventos[0].local, null);
  conferir("situacaoEm", lida.situacaoEm?.toISOString(), "2026-11-22T14:31:34.000Z");
  conferir("sem entrega", lida.entregueEm, null);
  conferir("resposta torta nao quebra", regras.lerRespostaDoPacoteVicio({ events: "x" }).eventos, []);

  conferir("proxima leitura em 6 h", regras.proximaLeituraDoRastreio({ situacao: "in_transit", achou: true, agora: AGORA })?.toISOString(), new Date(AGORA.getTime() + 6 * HORA).toISOString());
  conferir("nao achado: 24 h", regras.proximaLeituraDoRastreio({ situacao: null, achou: false, agora: AGORA })?.toISOString(), new Date(AGORA.getTime() + 24 * HORA).toISOString());
  conferir("falha passageira: 1 h", regras.proximaLeituraDoRastreio({ situacao: null, achou: false, passageira: true, agora: AGORA })?.toISOString(), new Date(AGORA.getTime() + HORA).toISOString());
  conferir("entregue: para", regras.proximaLeituraDoRastreio({ situacao: "delivered", achou: true, agora: AGORA }), null);
  conferir("devolvido: para", regras.proximaLeituraDoRastreio({ situacao: "returned", achou: true, agora: AGORA }), null);

  conferir("fase: entregue e falta lancar", regras.faseDoRastreio({ situacao: "delivered", faltaLancar: 2 }), { rotulo: "Aguardando conferência", tom: "conferencia" });
  conferir("fase: entregue e lancado", regras.faseDoRastreio({ situacao: "delivered", faltaLancar: 0 }), null);
  conferir("fase: saiu", regras.faseDoRastreio({ situacao: "out_for_delivery", faltaLancar: 1 }), { rotulo: "Saiu para entrega", tom: "entrega" });
  conferir("fase: problema", regras.faseDoRastreio({ situacao: "exception", faltaLancar: 1 }), { rotulo: "Problema na entrega", tom: "problema" });
  conferir("fase: atribuicao conta como em transito", regras.faseDoRastreio({ situacao: "unknown", faltaLancar: 1 }), { rotulo: "Em trânsito", tom: "caminho" });

  console.log("\n== Situacao e \"!\" da lista ==");
  const base = { origem: "RISE", status: "ENVIADO", faltaLancar: 3, agora: AGORA };
  conferir("pedido do Rise sem J&T segue igual", faseDoPedido(base)?.rotulo, "Aguardando entrega");
  // aliexpress/regras.js nao tem imports (a extensao le o mesmo arquivo): quem chama passa a fase e o alerta prontos.
  const fase = (situacao) => regras.faseDoRastreio({ situacao, faltaLancar: 3 });
  conferir("com J&T em transito", faseDoPedido({ ...base, faseJT: fase("in_transit") })?.rotulo, "Em trânsito");
  conferir("com J&T entregue", faseDoPedido({ ...base, entregueEm: AGORA, faseJT: fase("delivered") })?.rotulo, "Aguardando conferência");
  conferir("com J&T entregue e tudo lancado: sem fase", faseDoPedido({ ...base, faltaLancar: 0, entregueEm: AGORA, faseJT: null }), null);
  conferir("atrasado vence a J&T em transito", faseDoPedido({ ...base, prazoFim: new Date("2026-11-01"), faseJT: fase("in_transit") })?.rotulo, "Atrasado");
  conferir("problema vence o atraso", faseDoPedido({ ...base, prazoFim: new Date("2026-11-01"), faseJT: fase("exception") })?.rotulo, "Problema na entrega");
  conferir("entregue nao e atraso", faseDoPedido({ ...base, prazoFim: new Date("2026-11-01"), entregueEm: AGORA, faseJT: fase("delivered") })?.rotulo, "Aguardando conferência");
  const alertaJT = regras.alertaDoRastreio({ situacao: "exception", eventos: [{ descricao: "Destinatário ausente", em: "2026-11-22T12:00:00Z" }] });
  conferir("texto do alerta", alertaJT, "Rastreio J&T: Destinatário ausente (22/11).");
  conferir("sem problema, sem alerta", regras.alertaDoRastreio({ situacao: "delivered", eventos: [] }), null);
  conferir("problema na J&T acende o !", alertasDoPedido({ status: "ENVIADO", faltaLancar: 3, agora: AGORA, alertaJT }), [alertaJT]);
  conferir("entregue nao acende o ! (regra de 04/11)", alertasDoPedido({ status: "ENVIADO", faltaLancar: 3, agora: AGORA, entregueEm: AGORA }), []);
  conferir("entregue nao vira atraso", alertasDoPedido({ status: "ENVIADO", faltaLancar: 3, agora: AGORA, prazoFim: new Date("2026-11-01"), entregueEm: AGORA }), []);

  console.log("\n== Cliente do PacoteVicio (falso) ==");
  if (!cnpjDigitos) throw new Error("teste: Dados da empresa sem CNPJ no banco do PC");
  const boa = await consultarJT(CODIGO_TRANSITO, cnpjDigitos);
  conferir("consulta ok", boa.ok, true);
  conferir("rota da J&T", chamadas.at(-1).rota, `/v1/track/jtexpress/${CODIGO_TRANSITO}`);
  conferir("chave e documento nos cabecalhos", [chamadas.at(-1).chave, chamadas.at(-1).documento], ["pv1_teste", cnpjDigitos]);
  conferir("cobrada", boa.cobrado, true);
  const sumida = await consultarJT(CODIGO_SUMIDO, cnpjDigitos);
  conferir("nao achado: codigo e cobrado", [sumida.ok, sumida.codigo, sumida.cobrado, sumida.naoAchado], [false, "tracking_not_found", true, true]);
  const semChave = await consultarJT(CODIGO_TRANSITO, cnpjDigitos, { chave: "outra" });
  conferir("chave recusada", [semChave.ok, semChave.cobrado, semChave.mensagem], [false, false, "Chave do PacoteVício recusada."]);
  foraDoAr = true;
  const fora = await consultarJT(CODIGO_TRANSITO, cnpjDigitos);
  foraDoAr = false;
  conferir("fora do ar: passageira e nao cobrada", [fora.ok, fora.passageira, fora.cobrado], [false, true, false]);
  conferir("mensagem nunca leva o documento", [sumida, semChave, fora].some((r) => JSON.stringify(r).includes(cnpjDigitos)), false);

  console.log("\n== CPF alternativo (Configuracoes > Envios) ==");
  const { salvarConfigDeFrete } = await import("../src/lib/frete/configuracao.js");
  const campos = { acrescimoDeEmbalagem: String(configAntes.acrescimoDeEmbalagem), percentualDePesoExtra: String(configAntes.percentualDePesoExtra), assuntoDoEmail: configAntes.assuntoDoEmail ?? "", textoDoEmail: configAntes.textoDoEmail ?? "", textoDoWhatsapp: configAntes.textoDoWhatsapp ?? "" };
  conferir("CPF invalido e recusado", (await salvarConfigDeFrete({ ...campos, documentoRastreioJT: "111.111.111-11" })).erros, { documentoRastreioJT: "CPF inválido." });
  await salvarConfigDeFrete({ ...campos, documentoRastreioJT: CPF_DIGITOS });
  conferir("CPF gravado formatado", (await lerConfigDeFrete()).documentoRastreioJT, CPF);
  await salvarConfigDeFrete(campos);
  conferir("salvar sem o campo nao apaga", (await lerConfigDeFrete()).documentoRastreioJT, CPF);

  console.log("\n== Gravacao no pedido ==");
  await prisma.configDeFrete.update({ where: { id: "frete" }, data: { documentoRastreioJT: CPF, rastreioMes: null, rastreioConsultasNoMes: 0 } });
  const emTransito = await pedidoDaJT(CODIGO_TRANSITO);
  const r1 = await banco.atualizarRastreioDaCompra(emTransito, { agora: AGORA, manual: true });
  conferir("atualizou", r1.ok, true);
  let linha = await prisma.rastreioDaCompra.findUnique({ where: { pedidoDeCompraId: emTransito } });
  conferir("gravou situacao, documento e proxima leitura", [linha.situacao, linha.documento, linha.proximaLeituraEm?.toISOString(), linha.consultas], ["in_transit", "CNPJ", new Date(AGORA.getTime() + 6 * HORA).toISOString(), 1]);
  conferir("o numero do documento nunca e gravado", JSON.stringify(linha).includes(cnpjDigitos) || JSON.stringify(linha).includes(CPF_DIGITOS), false);
  conferir("contou a consulta no mes", (await lerConfigDeFrete()).rastreioConsultasNoMes, 1);

  const soCpf = await pedidoDaJT(CODIGO_SO_CPF);
  chamadas.length = 0;
  await banco.atualizarRastreioDaCompra(soCpf, { agora: AGORA, manual: true });
  linha = await prisma.rastreioDaCompra.findUnique({ where: { pedidoDeCompraId: soCpf } });
  conferir("CNPJ nao achou, CPF achou", [linha.situacao, linha.documento, linha.consultas, chamadas.map((c) => c.documento)], ["out_for_delivery", "CPF", 2, [cnpjDigitos, CPF_DIGITOS]]);
  chamadas.length = 0;
  await banco.atualizarRastreioDaCompra(soCpf, { agora: new Date(AGORA.getTime() + 7 * HORA), manual: true });
  conferir("da segunda vez vai direto no CPF", chamadas.map((c) => c.documento), [CPF_DIGITOS]);

  const sumido = await pedidoDaJT(CODIGO_SUMIDO);
  const r3 = await banco.atualizarRastreioDaCompra(sumido, { agora: AGORA, manual: true });
  linha = await prisma.rastreioDaCompra.findUnique({ where: { pedidoDeCompraId: sumido } });
  conferir("nao achado com os dois", [r3.ok, linha.situacao, linha.erro, linha.proximaLeituraEm?.toISOString()], [false, null, "A J&T não achou este código com o CNPJ nem com o CPF.", new Date(AGORA.getTime() + 24 * HORA).toISOString()]);

  const entregue = await pedidoDaJT(CODIGO_ENTREGUE);
  await banco.atualizarRastreioDaCompra(entregue, { agora: AGORA, manual: true });
  linha = await prisma.rastreioDaCompra.findUnique({ where: { pedidoDeCompraId: entregue } });
  conferir("entregue: data e sem proxima leitura", [linha.entregueEm?.toISOString(), linha.proximaLeituraEm], ["2026-11-22T18:00:00.000Z", null]);

  const correios = await pedidoDaJT("QB123456789BR");
  const r5 = await banco.atualizarRastreioDaCompra(correios, { agora: AGORA, manual: true });
  conferir("codigo que nao e da J&T e recusado", r5, { ok: false, erro: "O rastreio deste pedido não é da J&T." });

  // Trocar o codigo no pedido recomeca o rastreio (a linha antiga era de outro pacote).
  await prisma.pedidoDeCompra.update({ where: { id: entregue }, data: { rastreio: CODIGO_TRANSITO } });
  await banco.atualizarRastreioDaCompra(entregue, { agora: AGORA, manual: true });
  linha = await prisma.rastreioDaCompra.findUnique({ where: { pedidoDeCompraId: entregue } });
  conferir("codigo trocado recomeca", [linha.codigo, linha.situacao, linha.entregueEm], [CODIGO_TRANSITO, "in_transit", null]);
  await prisma.pedidoDeCompra.update({ where: { id: entregue }, data: { rastreio: CODIGO_ENTREGUE } });
  await banco.atualizarRastreioDaCompra(entregue, { agora: AGORA, manual: true });

  console.log("\n== Tela do pedido, lista e MCP ==");
  const tela = await compras.lerPedido(emTransito);
  conferir("o pedido traz o rastreio da J&T", [tela.rastreioJT?.rotulo, tela.rastreioJT?.eventos.length, tela.rastreioJT?.eventos.at(-1).descricao], ["Em trânsito", 3, "Rastreio fornecido por PacoteVicio.dev"]);
  conferir("o link do PacoteVicio vai junto", tela.rastreioJT?.link, "https://pacotevicio.dev");
  conferir("a tela nao leva o documento", JSON.stringify(tela).includes(cnpjDigitos), false);
  const lista = await compras.listarPedidos({ busca: "ZZ JT", porPagina: 50 });
  const daLista = (id) => lista.linhas.find((l) => l.id === id);
  conferir("lista: Situacao em transito", daLista(emTransito)?.fase?.rotulo, "Em trânsito");
  conferir("lista: entregue sem itens a lancar nao tem fase de conferencia", daLista(entregue)?.fase, null);

  const { lerPedidoDeCompra } = await import("../src/lib/mcp/compras.js");
  const mcp = await lerPedidoDeCompra({ pedido: tela.codigo }, { pode: () => true });
  const texto = JSON.stringify(mcp);
  conferir("MCP traz o rastreio da J&T", texto.includes("Em transferência para o destino"), true);
  conferir("MCP sem o documento", texto.includes(cnpjDigitos) || texto.includes(CPF_DIGITOS), false);

  console.log("\n== Rotina do worker ==");
  chamadas.length = 0;
  const cedo = await banco.rodarRastreioDasCompras({ agora: new Date(AGORA.getTime() + HORA) });
  conferir("antes de vencer ninguem e lido", [cedo.ok, cedo.consultados, chamadas.length], [true, 0, 0]);
  const problema = await pedidoDaJT(CODIGO_PROBLEMA);
  const depois = await banco.rodarRastreioDasCompras({ agora: new Date(AGORA.getTime() + 8 * HORA) });
  // +8 h: vencem o em transito (lido em +0) e o novo; o do CPF foi lido em +7 h, o nao achado espera 24 h, o entregue acabou
  // e o dos Correios nao e da J&T.
  conferir("le so os vencidos", [depois.consultados, depois.problemas], [2, 1]);
  const telaProblema = await compras.listarPedidos({ busca: "ZZ JT", porPagina: 50 });
  conferir("problema acende o ! da lista", telaProblema.linhas.find((l) => l.id === problema)?.alertas, ["Rastreio J&T: Destinatário ausente (22/11)."]);
  await prisma.pedidoDeCompra.update({ where: { id: problema }, data: { status: "FINALIZADO" } });

  await prisma.configDeFrete.update({ where: { id: "frete" }, data: { rastreioConsultasNoMes: 900 } });
  chamadas.length = 0;
  const noTeto = await banco.rodarRastreioDasCompras({ agora: new Date(AGORA.getTime() + 30 * HORA) });
  conferir("teto do mes para a rotina", [noTeto.teto, chamadas.length], [true, 0]);
  const virouMes = await banco.rodarRastreioDasCompras({ agora: new Date("2026-12-01T12:00:00-03:00") });
  conferir("mes novo zera a conta", [virouMes.teto, (await lerConfigDeFrete()).rastreioConsultasNoMes > 0], [false, true]);

  delete process.env.PACOTEVICIO_API_KEY;
  const semChaveRotina = await banco.rodarRastreioDasCompras({ agora: new Date("2026-12-05T12:00:00-03:00") });
  conferir("sem chave: nada e consultado", [semChaveRotina.ok, semChaveRotina.motivo, semChaveRotina.consultados], [true, "sem-chave", 0]);
  conferir("sem chave: o botao explica", await banco.atualizarRastreioDaCompra(emTransito, { manual: true }), { ok: false, erro: "O rastreio da J&T não está ligado: falta a chave do PacoteVício." });
} catch (erro) {
  falhas++;
  console.error("FALHA inesperada:", erro);
} finally {
  await limpar().catch(() => {});
  await prisma.configDeFrete
    .update({ where: { id: "frete" }, data: { documentoRastreioJT: configAntes.documentoRastreioJT ?? null, rastreioMes: configAntes.rastreioMes ?? null, rastreioConsultasNoMes: configAntes.rastreioConsultasNoMes ?? 0 } })
    .catch(() => {});
  servidor.close();
  await prisma.$disconnect();
}

console.log(falhas ? `\n${falhas} falha(s)` : "\nTudo certo.");
process.exit(falhas ? 1 : 0);
