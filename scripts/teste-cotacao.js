/**
 * Testa a logica da cotacao do dolar (Ferramentas). Sem rede e sem banco: as
 * respostas das fontes sao escritas aqui, no formato conferido em 21/09/2026.
 *
 *   npm run teste:cotacao
 */

const {
  PERIODOS,
  dataBr,
  dataCurta,
  dataHoraBr,
  hojeEmSaoPaulo,
  intervaloDoPeriodo,
  lerAgora,
  lerBoletim,
  lerPtax,
  numeroPositivo,
  pontosDoGrafico,
  somarDias,
  urlBoletins,
  urlPtax,
  variacao,
} = await import("../src/lib/ferramentas/cotacao.js");

let falhas = 0;
function conferir(nome, obtido, esperado) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok   " : "FALHA"} ${nome}`);
  if (!ok) console.log(`       obtido:   ${JSON.stringify(obtido)}\n       esperado: ${JSON.stringify(esperado)}`);
}

// ---------------------------------------------------------------- datas
conferir("somarDias: dentro do mes", somarDias("2026-09-21", -7), "2026-09-14");
conferir("somarDias: vira o mes", somarDias("2026-03-02", -5), "2026-02-25");
conferir("somarDias: vira o ano", somarDias("2026-01-03", -10), "2025-12-24");
conferir("somarDias: ano bissexto", somarDias("2024-03-01", -1), "2024-02-29");
conferir("dataBr", dataBr("2026-09-18"), "18/09/2026");
conferir("dataCurta", dataCurta("2026-09-18"), "18/09");

// Perto da meia-noite o UTC ja e o dia seguinte, mas em Sao Paulo ainda e hoje.
conferir("hoje em Sao Paulo, 23h30 locais (02h30 UTC do dia seguinte)", hojeEmSaoPaulo(new Date("2026-09-22T02:30:00Z")), "2026-09-21");
conferir("hoje em Sao Paulo, 00h30 locais", hojeEmSaoPaulo(new Date("2026-09-21T03:30:00Z")), "2026-09-21");

conferir("periodos: quatro, com valores unicos", new Set(PERIODOS.map((p) => p.valor)).size, 4);
conferir("intervalo de 30 dias", intervaloDoPeriodo("30d", "2026-09-21") && { i: intervaloDoPeriodo("30d", "2026-09-21").inicio, f: intervaloDoPeriodo("30d", "2026-09-21").fim }, { i: "2026-08-22", f: "2026-09-21" });
conferir("intervalo de 1 ano cruza o ano", intervaloDoPeriodo("1a", "2026-09-21").inicio, "2025-09-21");
conferir("periodo fora da lista e recusado", intervaloDoPeriodo("../../etc"), null);
conferir("periodo vazio e recusado", intervaloDoPeriodo(undefined), null);
conferir("periodo com espaco e recusado", intervaloDoPeriodo("30d "), null);

const endereco = urlPtax({ inicio: "2026-09-14", fim: "2026-09-21" });
conferir("URL do PTAX: data como mes-dia-ano", endereco.includes("@dataInicial='09-14-2026'&@dataFinalCotacao='09-21-2026'"), true);
conferir("URL do PTAX: base fixa do Banco Central", endereco.startsWith("https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/"), true);
conferir("URL do PTAX: pede teto e JSON", endereco.includes("$top=1000") && endereco.includes("$format=json"), true);

// ---------------------------------------------------------------- numeros
conferir("numeroPositivo: texto", numeroPositivo("5.1434"), 5.1434);
conferir("numeroPositivo: numero", numeroPositivo(5.2), 5.2);
conferir("numeroPositivo: vazio NAO vira zero", numeroPositivo(""), null);
conferir("numeroPositivo: espacos", numeroPositivo("  "), null);
conferir("numeroPositivo: zero", numeroPositivo(0), null);
conferir("numeroPositivo: negativo", numeroPositivo("-5.1"), null);
conferir("numeroPositivo: NaN", numeroPositivo("abc"), null);
conferir("numeroPositivo: Infinity", numeroPositivo(Infinity), null);
conferir("numeroPositivo: null", numeroPositivo(null), null);
conferir("numeroPositivo: objeto", numeroPositivo({}), null);
conferir("numeroPositivo: lista", numeroPositivo([5]), null);

// ---------------------------------------------------------------- PTAX
const RESPOSTA_PTAX = {
  "@odata.context": "https://exemplo/$metadata",
  value: [
    { cotacaoCompra: 5.169, cotacaoVenda: 5.1696, dataHoraCotacao: "2026-09-14 13:10:08.144425" },
    { cotacaoCompra: 5.1484, cotacaoVenda: 5.149, dataHoraCotacao: "2026-09-15 13:09:19.199664" },
    { cotacaoCompra: 5.152, cotacaoVenda: 5.1527, dataHoraCotacao: "2026-09-16 13:05:30.35873" },
  ],
};
const ptax = lerPtax(RESPOSTA_PTAX);
conferir("PTAX: le tres dias", ptax.ok && ptax.serie.length, 3);
conferir("PTAX: data sem a hora", ptax.serie[0].data, "2026-09-14");
conferir("PTAX: venda e compra", [ptax.serie[2].venda, ptax.serie[2].compra], [5.1527, 5.152]);

const desordenada = lerPtax({
  value: [
    { cotacaoCompra: 5.2, cotacaoVenda: 5.21, dataHoraCotacao: "2026-09-16 13:00:00" },
    { cotacaoCompra: 5.1, cotacaoVenda: 5.11, dataHoraCotacao: "2026-09-14 13:00:00" },
  ],
});
conferir("PTAX: coloca em ordem de data", desordenada.serie.map((p) => p.data), ["2026-09-14", "2026-09-16"]);

const repetida = lerPtax({
  value: [
    { cotacaoCompra: 5.1, cotacaoVenda: 5.11, dataHoraCotacao: "2026-09-14 10:00:00" },
    { cotacaoCompra: 5.2, cotacaoVenda: 5.21, dataHoraCotacao: "2026-09-14 13:00:00" },
  ],
});
conferir("PTAX: um valor por dia, o ultimo vence", repetida.serie, [{ data: "2026-09-14", compra: 5.2, venda: 5.21 }]);

const comLixo = lerPtax({
  value: [
    { cotacaoCompra: "abc", cotacaoVenda: 5.2, dataHoraCotacao: "2026-09-14 13:00:00" },
    { cotacaoCompra: 0, cotacaoVenda: 5.2, dataHoraCotacao: "2026-09-15 13:00:00" },
    { cotacaoCompra: 5.1, cotacaoVenda: -5.2, dataHoraCotacao: "2026-09-16 13:00:00" },
    { cotacaoCompra: 5.1, cotacaoVenda: 5.2, dataHoraCotacao: "ontem" },
    null,
    { cotacaoCompra: 5.15, cotacaoVenda: 5.16, dataHoraCotacao: "2026-09-17 13:00:00" },
  ],
});
conferir("PTAX: descarta linha ruim e fica com a boa", comLixo.ok && comLixo.serie.map((p) => p.data), ["2026-09-17"]);
conferir("PTAX: so linhas ruins vira erro", lerPtax({ value: [{ cotacaoCompra: "x", cotacaoVenda: null, dataHoraCotacao: "2026-09-14 13:00:00" }] }).ok, false);
conferir("PTAX: lista vazia (fim de semana) vira erro", lerPtax({ value: [] }).ok, false);
conferir("PTAX: sem o campo value", lerPtax({}).ok, false);
conferir("PTAX: value que nao e lista", lerPtax({ value: "texto" }).ok, false);
conferir("PTAX: resposta nula", lerPtax(null).ok, false);

// ---------------------------------------------------------------- agora
const RESPOSTA_AGORA = {
  USDBRL: {
    code: "USD",
    codein: "BRL",
    high: "5.1442",
    low: "5.1048",
    varBid: "-0.0337",
    pctChange: "-0.655104",
    bid: "5.1105",
    ask: "5.1108",
    timestamp: "1790001329",
    create_date: "2026-09-21 11:35:29",
  },
};
const agora = lerAgora(RESPOSTA_AGORA);
conferir("agora: compra e venda (texto vira numero)", [agora.compra, agora.venda], [5.1105, 5.1108]);
conferir("agora: maxima, minima e variacao", [agora.maxima, agora.minima, agora.variacaoPct], [5.1442, 5.1048, -0.655104]);
conferir("agora: instante em segundos", agora.lidoEm, 1790001329);
conferir("agora: variacao zero e valida (nao vira null)", lerAgora({ USDBRL: { ...RESPOSTA_AGORA.USDBRL, pctChange: "0" } }).variacaoPct, 0);
conferir("agora: complemento ruim nao derruba a cotacao", (() => {
  const lido = lerAgora({ USDBRL: { bid: "5.1", ask: "5.2", high: "x", low: "", pctChange: "abc", timestamp: "0" } });
  return [lido.ok, lido.maxima, lido.minima, lido.variacaoPct, lido.lidoEm];
})(), [true, null, null, null, null]);
conferir("agora: sem compra e erro", lerAgora({ USDBRL: { ask: "5.2" } }).ok, false);
conferir("agora: venda zero e erro", lerAgora({ USDBRL: { bid: "5.1", ask: "0" } }).ok, false);
conferir("agora: venda negativa e erro", lerAgora({ USDBRL: { bid: "5.1", ask: "-5" } }).ok, false);
conferir("agora: sem USDBRL e erro", lerAgora({ EURBRL: { bid: "5.9", ask: "5.9" } }).ok, false);
conferir("agora: resposta nula e erro", lerAgora(null).ok, false);

// ---------------------------------------------------------------- boletim (reserva do "agora")
const RESPOSTA_BOLETINS = {
  value: [
    { cotacaoCompra: 5.1105, cotacaoVenda: 5.1111, dataHoraCotacao: "2026-09-21 10:08:10.246126", tipoBoletim: "Abertura" },
    { cotacaoCompra: 5.1071, cotacaoVenda: 5.1077, dataHoraCotacao: "2026-09-21 12:11:11.15299", tipoBoletim: "Intermediário" },
    { cotacaoCompra: 5.1168, cotacaoVenda: 5.1174, dataHoraCotacao: "2026-09-21 11:10:11.645592", tipoBoletim: "Intermediário" },
  ],
};
const boletim = lerBoletim(RESPOSTA_BOLETINS);
conferir("boletim: pega o mais recente, mesmo fora de ordem", [boletim.compra, boletim.venda], [5.1071, 5.1077]);
conferir("boletim: fonte identificada", boletim.fonte, "bcb");
conferir("boletim: 12h11 de Brasilia = 15h11 UTC", boletim.lidoEm, Date.UTC(2026, 8, 21, 15, 11, 11) / 1000);
conferir("boletim: sem maxima, minima e variacao", [boletim.maxima, boletim.minima, boletim.variacaoPct], [null, null, null]);
conferir("boletim: linha ruim e descartada", lerBoletim({ value: [{ cotacaoCompra: 0, cotacaoVenda: 5, dataHoraCotacao: "2026-09-21 10:00:00" }, RESPOSTA_BOLETINS.value[0]] }).venda, 5.1111);
conferir("boletim: lista vazia e erro", lerBoletim({ value: [] }).ok, false);
conferir("boletim: sem value e erro", lerBoletim({}).ok, false);
conferir("boletim: nulo e erro", lerBoletim(null).ok, false);
const enderecoBoletins = urlBoletins("2026-09-21");
conferir("URL dos boletins: janela de 7 dias, mes-dia-ano", enderecoBoletins.includes("@dataInicial='09-14-2026'&@dataFinalCotacao='09-21-2026'"), true);
conferir("URL dos boletins: moeda fixa em USD", enderecoBoletins.includes("@moeda='USD'"), true);
conferir("URL dos boletins: base fixa do Banco Central", enderecoBoletins.startsWith("https://olinda.bcb.gov.br/"), true);

conferir("dataHoraBr: 21/09 as 11h35 de Brasilia", dataHoraBr(Date.UTC(2026, 8, 21, 14, 35, 0) / 1000), "21/09 11:35");
conferir("dataHoraBr: meia-noite nao vira 24:00", dataHoraBr(Date.UTC(2026, 8, 21, 3, 5, 0) / 1000), "21/09 00:05");

// ---------------------------------------------------------------- variacao
const serie = [
  { data: "2026-09-14", compra: 5.0, venda: 5.0 },
  { data: "2026-09-15", compra: 5.1, venda: 5.1 },
  { data: "2026-09-16", compra: 5.25, venda: 5.25 },
];
const v = variacao(serie);
conferir("variacao: diferenca", Number(v.diferenca.toFixed(4)), 0.25);
conferir("variacao: percentual", Number(v.percentual.toFixed(2)), 5);
conferir("variacao: queda tem sinal negativo", variacao([{ venda: 5.5 }, { venda: 5.0 }]).percentual < 0, true);
conferir("variacao: um ponto so nao compara", variacao([{ venda: 5 }]), null);
conferir("variacao: serie vazia", variacao([]), null);
conferir("variacao: nao e lista", variacao(undefined), null);

// ---------------------------------------------------------------- grafico
const desenho = pontosDoGrafico(serie, 640, 280);
conferir("grafico: um ponto por dia", desenho.pontos.length, 3);
conferir("grafico: caminho comeca com M e tem 2 L", /^M[\d.]+ [\d.]+ L[\d.]+ [\d.]+ L[\d.]+ [\d.]+$/.test(desenho.caminho), true);
conferir("grafico: x cresce com a data", desenho.pontos[0].x < desenho.pontos[1].x && desenho.pontos[1].x < desenho.pontos[2].x, true);
conferir("grafico: valor maior fica MAIS ALTO (y menor)", desenho.pontos[2].y < desenho.pontos[0].y, true);
conferir(
  "grafico: tudo dentro do quadro",
  desenho.pontos.every((p) => p.x >= 0 && p.x <= 640 && p.y >= 0 && p.y <= 280),
  true,
);
conferir("grafico: eixo Y com 4 marcas, de baixo para cima", desenho.eixoY.length === 4 && desenho.eixoY[0].valor < desenho.eixoY[3].valor, true);
conferir("grafico: eixo Y NAO comeca do zero", desenho.eixoY[0].valor > 4, true);
conferir("grafico: primeira e ultima data no eixo X", [desenho.eixoX[0].data, desenho.eixoX[desenho.eixoX.length - 1].data], ["2026-09-14", "2026-09-16"]);
conferir("grafico: tem area fechada", desenho.area.endsWith("Z"), true);

const um = pontosDoGrafico([{ data: "2026-09-14", compra: 5, venda: 5 }], 640, 280);
conferir("grafico: um ponto so fica no meio", Math.round(um.pontos[0].x), Math.round((52 + (640 - 14)) / 2));
conferir("grafico: um ponto so nao tem area", um.area, "");
conferir("grafico: um ponto so, sem NaN", /NaN/.test(um.caminho + JSON.stringify(um.pontos)), false);

const reta = pontosDoGrafico(
  [
    { data: "2026-09-14", compra: 5, venda: 5 },
    { data: "2026-09-15", compra: 5, venda: 5 },
  ],
  640,
  280,
);
conferir("grafico: serie reta nao da NaN nem divide por zero", /NaN|Infinity/.test(JSON.stringify(reta)), false);
conferir("grafico: serie reta fica no meio da altura", Math.abs(reta.pontos[0].y - (12 + (280 - 12 - 26) / 2)) < 1, true);

const vazio = pontosDoGrafico([], 640, 280);
conferir("grafico: serie vazia devolve tudo vazio", [vazio.pontos.length, vazio.caminho, vazio.eixoY.length], [0, "", 0]);
conferir("grafico: quadro minusculo nao quebra", /NaN/.test(JSON.stringify(pontosDoGrafico(serie, 10, 10))), false);

const longa = Array.from({ length: 250 }, (_, i) => ({ data: somarDias("2025-09-21", i), compra: 5 + i / 1000, venda: 5 + i / 1000 }));
const grafLongo = pontosDoGrafico(longa, 640, 280);
conferir("grafico: 250 dias, 4 datas no eixo X", grafLongo.eixoX.length, 4);
conferir("grafico: 250 dias, primeira e ultima no eixo X", [grafLongo.eixoX[0].data, grafLongo.eixoX[3].data], ["2025-09-21", longa[249].data]);

console.log(falhas === 0 ? "\nTodas as asserções passaram." : `\n${falhas} falha(s).`);
process.exit(falhas === 0 ? 0 : 1);
