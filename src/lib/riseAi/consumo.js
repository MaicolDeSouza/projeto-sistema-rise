import { prisma } from "@/lib/db";

import { ErroDeUso } from "./erros";
import { limitesDoDia } from "./revisao";

/**
 * O consumo do Rise AI (spec §5.10): por dia × provedor/modelo, quantas respostas, quantos tokens, quanto custou, quanto
 * tempo levou e quantas vezes algo deu errado. É o que o dono lê para comparar os modelos e saber quanto a API custa.
 *
 * Lê só `MensagemIA` (cada resposta já guarda provedor, modelo, tokens, custo, duração, motivo da reserva, avaliação e
 * avisos). Custo é o ESTIMADO na hora da resposta (preço do modelo × tokens × dólar do dia); modelo local custa zero e
 * modelo sem preço cadastrado fica sem custo (`semCusto` conta quantas respostas), nunca vira zero em silêncio.
 */

const MAXIMO_DE_DIAS = 366;
const arredondar = (valor, casas) => Math.round(valor * 10 ** casas) / 10 ** casas;
const numero = (valor) => Number(valor ?? 0);

/**
 * De "AAAA-MM-DD" a "AAAA-MM-DD", dias de São Paulo, inclusive os dois. Uma linha por dia, provedor e modelo, do dia mais
 * recente para o mais antigo. `respostas` são as que o modelo deu; as mensagens de erro entram em `falhas`.
 *
 * @returns {Promise<{ dia: string, provedor: string | null, modelo: string | null, respostas: number, tokensEntrada: number,
 *   tokensSaida: number, custoBrl: number, custoUsd: number, duracaoMediaMs: number, reservas: number, falhas: number,
 *   negativas: number, semResultado: number, semSeparacao: number, semCusto: number }[]>}
 */
export async function consumoPorDia({ de, ate }) {
  const { inicio } = limitesDoDia(de);
  const { fim } = limitesDoDia(ate);
  if (inicio >= fim) throw new ErroDeUso("Período inválido.");
  if ((fim - inicio) / (24 * 60 * 60 * 1000) > MAXIMO_DE_DIAS) throw new ErroDeUso(`O período passa de ${MAXIMO_DE_DIAS} dias.`);

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
           count(*) FILTER (WHERE 'sem_separacao' = ANY("avisos"))::int AS "semSeparacao",
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
    semSeparacao: linha.semSeparacao,
    semCusto: linha.semCusto,
  }));
}

/** Os totais do período: soma de cada contador e o tempo médio ponderado pelas respostas de cada linha. */
export function totaisDoPeriodo(linhas) {
  const soma = (campo) => linhas.reduce((total, linha) => total + numero(linha[campo]), 0);
  const respostas = soma("respostas");
  const tempoTotal = linhas.reduce((total, linha) => total + numero(linha.duracaoMediaMs) * numero(linha.respostas), 0);
  return {
    respostas,
    tokensEntrada: soma("tokensEntrada"),
    tokensSaida: soma("tokensSaida"),
    custoBrl: arredondar(soma("custoBrl"), 4),
    custoUsd: arredondar(soma("custoUsd"), 6),
    duracaoMediaMs: respostas ? Math.round(tempoTotal / respostas) : 0,
    reservas: soma("reservas"),
    falhas: soma("falhas"),
    negativas: soma("negativas"),
    semResultado: soma("semResultado"),
    semSeparacao: soma("semSeparacao"),
    semCusto: soma("semCusto"),
  };
}

/** Os últimos `dias` dias, contando hoje: `{ de, ate }` em "AAAA-MM-DD". */
export function periodoDosUltimosDias(dias, hoje) {
  const inicio = new Date(`${hoje}T12:00:00Z`);
  inicio.setUTCDate(inicio.getUTCDate() - (dias - 1));
  return { de: inicio.toISOString().slice(0, 10), ate: hoje };
}
