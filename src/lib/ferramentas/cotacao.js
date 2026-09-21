/**
 * Cotacao do dolar (Ferramentas): enderecos, leitura das respostas e a conta do
 * grafico. Fica SEM imports e sem nada do Next de proposito: a Server Action, a
 * tela e o teste (`npm run teste:cotacao`, sem rede) leem o mesmo arquivo.
 *
 * Duas fontes, as duas publicas e sem chave (conferidas em 21/09/2026):
 * - PTAX do Banco Central: o dolar OFICIAL, um valor por dia util (fecha por
 *   volta das 13h) e o historico inteiro. E o que serve para conferir contrato
 *   e comparar dia com dia.
 * - AwesomeAPI: a cotacao de AGORA, que muda o dia todo.
 */

export const FUSO = "America/Sao_Paulo";

/** Periodos do grafico. `dias` e a janela contada para tras a partir de hoje. */
export const PERIODOS = [
  { valor: "7d", rotulo: "7 dias", dias: 7 },
  { valor: "30d", rotulo: "30 dias", dias: 30 },
  { valor: "90d", rotulo: "90 dias", dias: 90 },
  { valor: "1a", rotulo: "1 ano", dias: 365 },
];

export const PERIODO_PADRAO = "30d";

export const URL_AGORA = "https://economia.awesomeapi.com.br/json/last/USD-BRL";

const BASE_PTAX = "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata";

// ---------------------------------------------------------------- datas

/** Data de hoje (AAAA-MM-DD) no fuso da loja. Perto da meia-noite, o UTC ja e "amanha". */
export function hojeEmSaoPaulo(agora = new Date()) {
  // "en-CA" escreve a data como AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(agora);
}

/** Soma dias (pode ser negativo) a uma data AAAA-MM-DD, sem depender do fuso da maquina. */
export function somarDias(data, dias) {
  const [ano, mes, dia] = data.split("-").map(Number);
  const resultado = new Date(Date.UTC(ano, mes - 1, dia + dias));
  return resultado.toISOString().slice(0, 10);
}

/** AAAA-MM-DD -> DD/MM/AAAA (por texto: `new Date` andaria um dia conforme o fuso). */
export function dataBr(data) {
  const [ano, mes, dia] = String(data).split("-");
  return `${dia}/${mes}/${ano}`;
}

/** AAAA-MM-DD -> DD/MM. */
export function dataCurta(data) {
  const [, mes, dia] = String(data).split("-");
  return `${dia}/${mes}`;
}

/** "21/09 11:35": dia e hora de um instante em segundos desde 1970, no fuso da loja. */
export function dataHoraBr(segundos) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: FUSO,
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(segundos * 1000))
      .map((parte) => [parte.type, parte.value]),
  );
  return `${partes.day}/${partes.month} ${partes.hour}:${partes.minute}`;
}

/**
 * Janela de um periodo. Devolve o `periodo` conhecido ou `null`: o valor vem do
 * navegador, entao so entra o que esta na lista.
 */
export function intervaloDoPeriodo(valor, hoje = hojeEmSaoPaulo()) {
  const periodo = PERIODOS.find((item) => item.valor === valor);
  if (!periodo) return null;
  return { periodo, inicio: somarDias(hoje, -periodo.dias), fim: hoje };
}

/** O BCB pede a data como MM-DD-AAAA. */
function dataDoBcb(data) {
  const [ano, mes, dia] = data.split("-");
  return `${mes}-${dia}-${ano}`;
}

/** Endereco do historico do PTAX. So datas calculadas aqui entram na URL. */
export function urlPtax({ inicio, fim }) {
  return (
    `${BASE_PTAX}/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@dataInicial='${dataDoBcb(inicio)}'&@dataFinalCotacao='${dataDoBcb(fim)}'` +
    "&$top=1000&$format=json&$select=cotacaoCompra,cotacaoVenda,dataHoraCotacao"
  );
}

/**
 * Boletins do dia do PTAX (abertura, intermediarios, fechamento). O BC divulga
 * ate quatro por dia util, de hora em hora, das 10h as 13h. A janela e de 7 dias
 * para sempre achar o ultimo, mesmo depois de fim de semana ou feriado.
 */
export function urlBoletins(hoje = hojeEmSaoPaulo()) {
  return (
    `${BASE_PTAX}/CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)` +
    `?@moeda='USD'&@dataInicial='${dataDoBcb(somarDias(hoje, -7))}'&@dataFinalCotacao='${dataDoBcb(hoje)}'` +
    "&$top=100&$format=json&$select=cotacaoCompra,cotacaoVenda,dataHoraCotacao,tipoBoletim"
  );
}

// ---------------------------------------------------------------- leitura

/**
 * Numero positivo e finito, ou null. Aceita texto porque a AwesomeAPI manda os
 * valores como string; "" e null NAO viram zero (`Number("")` e 0).
 */
export function numeroPositivo(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string" && valor.trim() === "") return null;
  if (typeof valor !== "number" && typeof valor !== "string") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function numeroFinito(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "string" && valor.trim() === "") return null;
  if (typeof valor !== "number" && typeof valor !== "string") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

/**
 * Le a resposta do PTAX. Linha fora do formato e descartada, e resposta sem
 * nenhuma linha boa vira erro: melhor recado na tela do que grafico com lixo.
 * Um valor por dia (o ultimo, se a fonte repetir), em ordem de data.
 *
 * @returns {{ok: true, serie: {data: string, compra: number, venda: number}[]} | {ok: false, erro: string}}
 */
export function lerPtax(json) {
  const linhas = json?.value;
  if (!Array.isArray(linhas)) {
    return { ok: false, erro: "O Banco Central respondeu num formato inesperado." };
  }

  const porDia = new Map();
  for (const linha of linhas) {
    const data = /^(\d{4}-\d{2}-\d{2})/.exec(String(linha?.dataHoraCotacao ?? ""))?.[1];
    const compra = numeroPositivo(linha?.cotacaoCompra);
    const venda = numeroPositivo(linha?.cotacaoVenda);
    if (!data || compra === null || venda === null) continue;
    porDia.set(data, { data, compra, venda });
  }

  if (porDia.size === 0) {
    return { ok: false, erro: "O Banco Central nao trouxe cotacao para o periodo (fim de semana ou feriado?)." };
  }
  const serie = [...porDia.values()].sort((a, b) => (a.data < b.data ? -1 : 1));
  return { ok: true, serie };
}

/**
 * Le a cotacao de agora. `bid` e a compra e `ask` a venda. Maxima, minima e
 * variacao sao complemento: se vierem ruins ficam `null`, e a cotacao vale.
 *
 * @returns {{ok: true, compra: number, venda: number, maxima: number|null, minima: number|null,
 *   variacaoPct: number|null, lidoEm: number|null} | {ok: false, erro: string}}
 */
export function lerAgora(json) {
  const dado = json?.USDBRL;
  const compra = numeroPositivo(dado?.bid);
  const venda = numeroPositivo(dado?.ask);
  if (compra === null || venda === null) {
    return { ok: false, erro: "A cotacao de agora veio num formato inesperado." };
  }
  const instante = numeroPositivo(dado?.timestamp);
  return {
    ok: true,
    fonte: "awesomeapi",
    compra,
    venda,
    maxima: numeroPositivo(dado?.high),
    minima: numeroPositivo(dado?.low),
    variacaoPct: numeroFinito(dado?.pctChange),
    lidoEm: instante,
  };
}

/**
 * Ultimo boletim do PTAX, usado como "agora" quando a AwesomeAPI nao responde
 * (ela passou a recusar com 429 depois de poucas consultas sem chave). Tem o
 * mesmo formato de `lerAgora`, mas sem maxima, minima e variacao: o boletim nao
 * as traz. O horario do BC e o de Brasilia (UTC-3, sem horario de verao).
 */
export function lerBoletim(json) {
  const linhas = json?.value;
  if (!Array.isArray(linhas)) {
    return { ok: false, erro: "O Banco Central respondeu num formato inesperado." };
  }

  let ultimo = null;
  for (const linha of linhas) {
    const partes = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(String(linha?.dataHoraCotacao ?? ""));
    const compra = numeroPositivo(linha?.cotacaoCompra);
    const venda = numeroPositivo(linha?.cotacaoVenda);
    if (!partes || compra === null || venda === null) continue;
    const instante = Date.parse(`${partes[1]}T${partes[2]}-03:00`) / 1000;
    if (!Number.isFinite(instante)) continue;
    if (!ultimo || instante > ultimo.lidoEm) ultimo = { compra, venda, lidoEm: instante };
  }

  if (!ultimo) return { ok: false, erro: "O Banco Central nao trouxe boletim recente." };
  return { ok: true, fonte: "bcb", ...ultimo, maxima: null, minima: null, variacaoPct: null };
}

// ---------------------------------------------------------------- conta

/**
 * Variacao da venda entre o primeiro e o ultimo dia da serie. `null` com menos
 * de dois pontos: nao ha o que comparar.
 */
export function variacao(serie) {
  if (!Array.isArray(serie) || serie.length < 2) return null;
  const inicial = serie[0].venda;
  const final = serie[serie.length - 1].venda;
  const diferenca = final - inicial;
  return { inicial, final, diferenca, percentual: (diferenca / inicial) * 100 };
}

const MARGEM = { esquerda: 52, direita: 14, topo: 12, base: 26 };

/**
 * Coordenadas do grafico de linha, para desenhar em SVG sem biblioteca.
 *
 * - O eixo Y NAO comeca do zero: o dolar varia centavos, e a partir do zero a
 *   linha ficaria reta. Ha folga de 10% em cima e embaixo.
 * - Os dias ficam igualmente espacados (um dia util = um passo). Fim de semana
 *   e feriado nao tem cotacao, e um eixo de calendario faria degraus de nada.
 * - Serie de um ponto so vai para o meio; serie reta ganha uma faixa minima, senao
 *   a escala teria altura zero.
 */
export function pontosDoGrafico(serie, largura, altura) {
  const larguraUtil = Math.max(largura - MARGEM.esquerda - MARGEM.direita, 1);
  const alturaUtil = Math.max(altura - MARGEM.topo - MARGEM.base, 1);
  if (!Array.isArray(serie) || serie.length === 0) {
    return { pontos: [], caminho: "", area: "", eixoY: [], eixoX: [], margem: MARGEM };
  }

  const valores = serie.map((ponto) => ponto.venda);
  let minimo = Math.min(...valores);
  let maximo = Math.max(...valores);
  if (maximo - minimo < 0.005) {
    minimo -= 0.05;
    maximo += 0.05;
  }
  const folga = (maximo - minimo) * 0.1;
  const de = minimo - folga;
  const ate = maximo + folga;

  const yDe = (valor) => MARGEM.topo + alturaUtil - ((valor - de) / (ate - de)) * alturaUtil;
  const xDe = (indice) =>
    serie.length === 1 ? MARGEM.esquerda + larguraUtil / 2 : MARGEM.esquerda + (indice / (serie.length - 1)) * larguraUtil;

  const pontos = serie.map((ponto, indice) => ({
    x: xDe(indice),
    y: yDe(ponto.venda),
    data: ponto.data,
    valor: ponto.venda,
    compra: ponto.compra,
  }));

  const casas = (numero) => numero.toFixed(1);
  const caminho = pontos.map((ponto, indice) => `${indice === 0 ? "M" : "L"}${casas(ponto.x)} ${casas(ponto.y)}`).join(" ");
  const base = MARGEM.topo + alturaUtil;
  const area =
    pontos.length > 1
      ? `${caminho} L${casas(pontos[pontos.length - 1].x)} ${casas(base)} L${casas(pontos[0].x)} ${casas(base)} Z`
      : "";

  const eixoY = [0, 1, 2, 3].map((passo) => {
    const valor = de + ((ate - de) * passo) / 3;
    return { valor, y: yDe(valor) };
  });

  // Ate 4 datas embaixo, sempre incluindo a primeira e a ultima.
  const quantas = Math.min(4, serie.length);
  const indices = new Set();
  for (let passo = 0; passo < quantas; passo++) {
    indices.add(quantas === 1 ? 0 : Math.round((passo * (serie.length - 1)) / (quantas - 1)));
  }
  const eixoX = [...indices].map((indice) => ({ x: pontos[indice].x, data: pontos[indice].data }));

  return { pontos, caminho, area, eixoY, eixoX, margem: MARGEM };
}
