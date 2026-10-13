import { prisma } from "@/lib/db";
import { cotacaoDoDolar } from "@/lib/cotacaoDolar";
import { hojeEmSaoPaulo } from "@/lib/ferramentas/cotacao";

import { lerConfiguracao } from "./configuracao";
import { PRECOS_USD_POR_MILHAO, PROVEDORES, provedorPorId } from "./modelos";
import { limitesDoDia } from "./revisao";

/**
 * O teto de gasto da IA em dinheiro (spec §3): dois orcamentos por mes (clientes e interno), o custo e RESERVADO antes de
 * cada chamada paga e devolvido quando ela termina, e o gasto do mes e a soma do que ja foi gravado.
 *
 * Uma fonte de verdade so, sem contador para desencontrar: o gasto sai de `MensagemIA.custoBrl` (respostas do chat) e de
 * `GastoIA` (transcricao, busca, embeddings); a reserva e uma linha de `ReservaDeGastoIA`. Dois pedidos ao mesmo tempo
 * nao passam do teto porque a conta e a reserva rodam numa transacao com trava consultiva do Postgres.
 *
 * Modelo local e modelo de API sem preco cadastrado custam zero aqui (nao ha o que reservar); as respostas sem preco sao
 * contadas em `semPreco`, para a tela dizer que elas ficaram fora da conta.
 */

export const ESCOPOS = ["CLIENTES", "INTERNO"];
export const VALIDADE_DA_RESERVA_MS = 10 * 60 * 1000;

const PROVEDORES_LOCAIS = PROVEDORES.filter((provedor) => provedor.local).map((provedor) => provedor.id);
const arredondar = (valor, casas = 4) => Math.round(valor * 10 ** casas) / 10 ** casas;
const numero = (valor) => (valor === null || valor === undefined ? 0 : Number(valor));

/** O mes de Sao Paulo de `agora`, com os limites em UTC (as colunas guardam UTC): `fim` e exclusivo. */
export function mesDeSaoPaulo(agora = new Date()) {
  const mes = hojeEmSaoPaulo(new Date(agora)).slice(0, 7);
  const [ano, numeroDoMes] = mes.split("-").map(Number);
  const proximo = numeroDoMes === 12 ? `${ano + 1}-01` : `${ano}-${String(numeroDoMes + 1).padStart(2, "0")}`;
  return { mes, inicio: limitesDoDia(`${mes}-01`).inicio, fim: limitesDoDia(`${proximo}-01`).inicio };
}

/** Soma o mes com um cliente do Prisma (a transacao da reserva passa o dela). */
async function somarMes(cliente, escopo, agora) {
  const { inicio, fim } = mesDeSaoPaulo(new Date(agora));
  const noMes = { gte: inicio, lt: fim };
  const [respostas, outros, reservas, semPreco] = await Promise.all([
    escopo === "INTERNO"
      ? cliente.mensagemIA.aggregate({ _sum: { custoBrl: true }, where: { papel: "ASSISTENTE", criadoEm: noMes, custoBrl: { not: null } } })
      : Promise.resolve({ _sum: { custoBrl: null } }),
    cliente.gastoIA.aggregate({ _sum: { valorBrl: true }, where: { escopo, criadoEm: noMes } }),
    cliente.reservaDeGastoIA.aggregate({ _sum: { valorBrl: true }, where: { escopo, criadaEm: noMes, expiraEm: { gt: new Date(agora) } } }),
    escopo === "INTERNO"
      ? cliente.mensagemIA.count({
          where: { papel: "ASSISTENTE", criadoEm: noMes, custoBrl: null, provedor: { not: null, notIn: PROVEDORES_LOCAIS }, NOT: { avisos: { has: "erro" } } },
        })
      : Promise.resolve(0),
  ]);
  return {
    gastoBrl: arredondar(numero(respostas._sum.custoBrl) + numero(outros._sum.valorBrl)),
    reservadoBrl: arredondar(numero(reservas._sum.valorBrl)),
    semPreco,
  };
}

/** @returns {Promise<{ gastoBrl: number, reservadoBrl: number, semPreco: number }>} */
export function gastoDoMes(escopo, { agora = Date.now() } = {}) {
  return somarMes(prisma, escopo, agora);
}

function tetoDe(escopo, config) {
  const teto = escopo === "CLIENTES" ? config.orcamentos?.clientesBrl : config.orcamentos?.internoBrl;
  return Number.isFinite(Number(teto)) ? Number(teto) : 0;
}

/** Em centavos inteiros: comparar 0,8 de ponto flutuante com 80% do teto erraria justamente no limite. */
function estadoDe(escopo, tetoBrl, { gastoBrl, reservadoBrl, semPreco }) {
  const teto = Math.round(tetoBrl * 100);
  const gasto = Math.round(gastoBrl * 100);
  const reservado = Math.round(reservadoBrl * 100);
  let nivel = "normal";
  if (teto <= 0 || gasto + reservado >= teto) nivel = "esgotado";
  else if (gasto * 10 >= teto * 8) nivel = "aviso";
  const percentual = teto <= 0 ? 100 : Math.round((gasto / teto) * 1000) / 10;
  return { escopo, tetoBrl, gastoBrl, reservadoBrl, percentual, nivel, semPreco };
}

/** @returns {Promise<{ escopo: string, tetoBrl: number, gastoBrl: number, reservadoBrl: number, percentual: number, nivel: "normal" | "aviso" | "esgotado", semPreco: number }>} */
export async function estadoDoOrcamento(escopo, { agora = Date.now(), config } = {}) {
  const configuracao = config ?? (await lerConfiguracao());
  return estadoDe(escopo, tetoDe(escopo, configuracao), await gastoDoMes(escopo, { agora }));
}

/**
 * Separa `estimadoBrl` do orcamento ANTES da chamada paga. Estimativa zero (modelo local ou sem preco) passa sem tocar no
 * banco. A conta e a reserva rodam sob `pg_advisory_xact_lock`: duas chamadas simultaneas veem uma a reserva da outra.
 * `jaGastoBrl` e o que a resposta em andamento ja custou nas rodadas anteriores e ainda nao esta gravado na `MensagemIA`.
 *
 * @returns {Promise<{ ok: true, reservaId: string | null } | { ok: false, motivo: "esgotado", estado: object }>}
 */
export async function reservarOrcamento(escopo, estimadoBrl, { dono = "sem-dono", agora = Date.now(), config, jaGastoBrl = 0 } = {}) {
  if (!(estimadoBrl > 0)) return { ok: true, reservaId: null };
  const configuracao = config ?? (await lerConfiguracao());
  const tetoBrl = tetoDe(escopo, configuracao);

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rise-ia-orcamento'))`;
      const soma = await somarMes(tx, escopo, agora);
      const total = Math.round((soma.gastoBrl + soma.reservadoBrl + jaGastoBrl + estimadoBrl) * 100);
      if (total > Math.round(tetoBrl * 100)) return { ok: false, motivo: "esgotado", estado: estadoDe(escopo, tetoBrl, soma) };
      const reserva = await tx.reservaDeGastoIA.create({
        data: { escopo, valorBrl: arredondar(estimadoBrl), dono, criadaEm: new Date(agora), expiraEm: new Date(agora + VALIDADE_DA_RESERVA_MS) },
      });
      return { ok: true, reservaId: reserva.id };
    },
    { maxWait: 15000, timeout: 15000 },
  );
}

/** Devolve a reserva (a chamada terminou e o custo real ja esta gravado). `null` (nunca reservou) nao faz nada. */
export async function liquidarReserva(reservaId) {
  if (!reservaId) return;
  await prisma.reservaDeGastoIA.deleteMany({ where: { id: reservaId } });
}

/** Grava um gasto que nao e de uma resposta do chat: transcricao, busca, embeddings. */
export function registrarGasto({ tipo, escopo = "INTERNO", provedor, modelo = null, valorUsd, valorBrl, referencia = null, detalhe = null }) {
  return prisma.gastoIA.create({
    data: { tipo, escopo, provedor, modelo, valorUsd, valorBrl, referencia, ...(detalhe === null ? {} : { detalhe }) },
  });
}

/**
 * O maximo que uma chamada pode custar, em reais: a entrada estimada mais TODA a saida que o modelo pode escrever.
 * Modelo local, sem preco ou provedor desconhecido (o falso dos testes) custa zero.
 */
export function estimarCustoMaximoBrl({ provedor, modelo, tokensEntrada, maxTokensSaida }) {
  const registro = provedorPorId(provedor);
  if (!registro || registro.local) return 0;
  const preco = PRECOS_USD_POR_MILHAO[modelo];
  if (!preco) return 0;
  const usd = ((Number(tokensEntrada) || 0) / 1e6) * preco.entrada + ((Number(maxTokensSaida) || 0) / 1e6) * preco.saida;
  return arredondar(usd * cotacaoDoDolar().valor);
}
