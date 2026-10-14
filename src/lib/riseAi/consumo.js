import { prisma } from "@/lib/db";

import { ErroDeUso } from "./erros";
import { limitesDoDia } from "./revisao";

/**
 * O consumo do Rise AI (spec §5.10): por dia × provedor/modelo, quantas respostas, quantos tokens, quanto custou, quanto
 * tempo levou e quantas vezes algo deu errado. É o que o dono lê para comparar os modelos e saber quanto a API custa.
 *
 * Lê `MensagemIA` (cada resposta já guarda provedor, modelo, tokens, custo, duração, motivo da reserva, avaliação e
 * avisos). Custo é o ESTIMADO na hora da resposta (preço do modelo × tokens × dólar do dia); modelo local custa zero e
 * modelo sem preço cadastrado fica sem custo (`semCusto` conta quantas respostas), nunca vira zero em silêncio.
 *
 * O que não é uma resposta do chat (pesquisa na internet, transcrição, embeddings) está em `GastoIA` e entra na coluna
 * "Outros" (`gastosOutrosPorDia`).
 */

const MAXIMO_DE_DIAS = 366;
const arredondar = (valor, casas) => Math.round(valor * 10 ** casas) / 10 ** casas;
const numero = (valor) => Number(valor ?? 0);

/** O período "AAAA-MM-DD" a "AAAA-MM-DD" (os dois dias inclusos, em São Paulo) como o intervalo UTC que as colunas guardam. */
function limitesDoPeriodo(de, ate) {
  const { inicio } = limitesDoDia(de);
  const { fim } = limitesDoDia(ate);
  if (inicio >= fim) throw new ErroDeUso("Período inválido.");
  if ((fim - inicio) / (24 * 60 * 60 * 1000) > MAXIMO_DE_DIAS) throw new ErroDeUso(`O período passa de ${MAXIMO_DE_DIAS} dias.`);
  return { inicio, fim };
}

/**
 * De "AAAA-MM-DD" a "AAAA-MM-DD", dias de São Paulo, inclusive os dois. Uma linha por dia, provedor e modelo, do dia mais
 * recente para o mais antigo. `respostas` são as que o modelo deu; as mensagens de erro entram em `falhas`.
 *
 * @returns {Promise<{ dia: string, provedor: string | null, modelo: string | null, respostas: number, tokensEntrada: number,
 *   tokensSaida: number, custoBrl: number, custoUsd: number, duracaoMediaMs: number, reservas: number, falhas: number,
 *   negativas: number, semResultado: number, semCusto: number }[]>}
 */
export async function consumoPorDia({ de, ate }) {
  const { inicio, fim } = limitesDoPeriodo(de, ate);

  // As colunas guardam UTC (TIMESTAMP sem fuso): vira hora de São Paulo antes de cortar o dia, senão a conversa das 22h
  // cairia no dia seguinte.
  const linhas = await prisma.$queryRaw`
    SELECT to_char(("criadoEm" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS "dia",
           "provedor", "modelo",
           count(*) FILTER (WHERE NOT ('erro' = ANY("avisos")))::int AS "respostas",
           coalesce(sum("tokensEntrada"), 0)::float8 AS "tokensEntrada",
           coalesce(sum("tokensSaida"), 0)::float8 AS "tokensSaida",
           coalesce(sum("custoBrl"), 0)::float8 AS "custoBrl",
           coalesce(sum("custoUsd"), 0)::float8 AS "custoUsd",
           coalesce(avg("duracaoMs") FILTER (WHERE NOT ('erro' = ANY("avisos"))), 0)::float8 AS "duracaoMediaMs",
           count(*) FILTER (WHERE "motivoDaReserva" IS NOT NULL)::int AS "reservas",
           count(*) FILTER (WHERE 'erro' = ANY("avisos"))::int AS "falhas",
           count(*) FILTER (WHERE "avaliacao" = -1)::int AS "negativas",
           count(*) FILTER (WHERE 'sem_resultado' = ANY("avisos"))::int AS "semResultado",
           count(*) FILTER (WHERE "custoBrl" IS NULL AND NOT ('erro' = ANY("avisos")))::int AS "semCusto"
    FROM "MensagemIA"
    WHERE "papel" = 'ASSISTENTE'::"PapelMensagemIA" AND "criadoEm" >= ${inicio} AND "criadoEm" < ${fim}
    GROUP BY 1, 2, 3
    ORDER BY 1 DESC, 2, 3`;

  return linhas.map((linha) => ({
    dia: linha.dia,
    provedor: linha.provedor,
    modelo: linha.modelo,
    respostas: linha.respostas,
    tokensEntrada: numero(linha.tokensEntrada),
    tokensSaida: numero(linha.tokensSaida),
    custoBrl: arredondar(numero(linha.custoBrl), 4),
    custoUsd: arredondar(numero(linha.custoUsd), 6),
    duracaoMediaMs: Math.round(numero(linha.duracaoMediaMs)),
    reservas: linha.reservas,
    falhas: linha.falhas,
    negativas: linha.negativas,
    semResultado: linha.semResultado,
    semCusto: linha.semCusto,
  }));
}

const TIPOS_DE_GASTO = ["TRANSCRICAO", "EMBEDDING", "BUSCA"];

/**
 * O que o período gastou fora das respostas do chat (`GastoIA`: pesquisa na internet, transcrição, embeddings), por dia de
 * São Paulo, do mais recente para o mais antigo. `porTipo` está em reais (é o detalhe da coluna "Outros").
 *
 * @returns {Promise<{ dia: string, brl: number, usd: number, porTipo: { TRANSCRICAO: number, EMBEDDING: number, BUSCA: number } }[]>}
 */
export async function gastosOutrosPorDia({ de, ate }) {
  const { inicio, fim } = limitesDoPeriodo(de, ate);
  const linhas = await prisma.$queryRaw`
    SELECT to_char(("criadoEm" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS "dia",
           "tipo"::text AS "tipo",
           coalesce(sum("valorBrl"), 0)::float8 AS "brl",
           coalesce(sum("valorUsd"), 0)::float8 AS "usd"
    FROM "GastoIA"
    WHERE "criadoEm" >= ${inicio} AND "criadoEm" < ${fim}
    GROUP BY 1, 2
    ORDER BY 1 DESC`;

  const porDia = new Map();
  for (const linha of linhas) {
    const dia = porDia.get(linha.dia) ?? { dia: linha.dia, brl: 0, usd: 0, porTipo: Object.fromEntries(TIPOS_DE_GASTO.map((tipo) => [tipo, 0])) };
    dia.brl += numero(linha.brl);
    dia.usd += numero(linha.usd);
    if (linha.tipo in dia.porTipo) dia.porTipo[linha.tipo] += numero(linha.brl);
    porDia.set(linha.dia, dia);
  }
  return [...porDia.values()].map((dia) => ({
    dia: dia.dia,
    brl: arredondar(dia.brl, 4),
    usd: arredondar(dia.usd, 6),
    porTipo: Object.fromEntries(TIPOS_DE_GASTO.map((tipo) => [tipo, arredondar(dia.porTipo[tipo], 4)])),
  }));
}

const LINHA_SO_DE_OUTROS = { provedor: null, modelo: null, respostas: 0, tokensEntrada: 0, tokensSaida: 0, custoBrl: 0, custoUsd: 0, duracaoMediaMs: 0, reservas: 0, falhas: 0, negativas: 0, semResultado: 0, semCusto: 0 };

/**
 * As linhas da tabela: as de `consumoPorDia` com o gasto "Outros" do dia na PRIMEIRA linha dele (as demais ficam com `outros: null`,
 * para a soma não aparecer em dobro). Dia que só teve gasto Outros ganha uma linha sem modelo (`semModelo`). Do dia mais recente
 * ao mais antigo, e as linhas de um mesmo dia na ordem em que vieram.
 */
export function linhasComOutros(linhas, outros) {
  const gastoDoDia = new Map(outros.map((gasto) => [gasto.dia, gasto]));
  const dias = [...new Set([...linhas.map((linha) => linha.dia), ...outros.map((gasto) => gasto.dia)])].sort().reverse();
  return dias.flatMap((dia) => {
    const doDia = linhas.filter((linha) => linha.dia === dia);
    const gasto = gastoDoDia.get(dia) ?? null;
    if (doDia.length === 0) return [{ ...LINHA_SO_DE_OUTROS, dia, semModelo: true, outros: gasto }];
    return doDia.map((linha, posicao) => ({ ...linha, outros: posicao === 0 ? gasto : null }));
  });
}

/**
 * Os totais do período: soma de cada contador e o tempo médio ponderado pelas respostas de cada linha. `outros` é o que
 * `gastosOutrosPorDia` devolveu: o total vai em `outrosBrl`, ao lado do custo das respostas (nunca somado a ele).
 */
export function totaisDoPeriodo(linhas, outros = []) {
  const soma = (campo) => linhas.reduce((total, linha) => total + numero(linha[campo]), 0);
  const respostas = soma("respostas");
  const tempoTotal = linhas.reduce((total, linha) => total + numero(linha.duracaoMediaMs) * numero(linha.respostas), 0);
  return {
    respostas,
    tokensEntrada: soma("tokensEntrada"),
    tokensSaida: soma("tokensSaida"),
    custoBrl: arredondar(soma("custoBrl"), 4),
    custoUsd: arredondar(soma("custoUsd"), 6),
    outrosBrl: arredondar(outros.reduce((total, gasto) => total + numero(gasto.brl), 0), 4),
    duracaoMediaMs: respostas ? Math.round(tempoTotal / respostas) : 0,
    reservas: soma("reservas"),
    falhas: soma("falhas"),
    negativas: soma("negativas"),
    semResultado: soma("semResultado"),
    semCusto: soma("semCusto"),
  };
}

/** Os últimos `dias` dias, contando hoje: `{ de, ate }` em "AAAA-MM-DD". */
export function periodoDosUltimosDias(dias, hoje) {
  const inicio = new Date(`${hoje}T12:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - (dias - 1));
  return { de: inicio.toISOString().slice(0, 10), ate: hoje };
}
