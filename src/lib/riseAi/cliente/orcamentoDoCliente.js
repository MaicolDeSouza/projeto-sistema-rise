import { prisma } from "@/lib/db";

import { liquidarReserva, reservarOrcamento } from "../orcamento";
import { limitesDoDia } from "../revisao";

/**
 * O dinheiro do canal dos clientes (spec de 19/11/2026, §8): o orcamento CLIENTES do mes, reservado ANTES de cada chamada
 * paga (a mesma conta atomica do Rise AI, `reservarOrcamento`), o teto do dia e o registro do que cada resposta custou.
 *
 * O custo de uma resposta a cliente vira um `GastoIA` de tipo CONVERSA: e so essa tabela que o orcamento CLIENTES soma
 * (as mensagens da equipe contam no INTERNO, e as do canal ficam fora dele: ver `orcamento.js`).
 *
 * O teto do mes entra por parametro (`tetoBrl`, lido da visao `ia_configuracao`): o servico `ia` nao alcanca a
 * `ConfiguracaoIA` inteira.
 */

const FUSO = "America/Sao_Paulo";

export function criarOrcamentoDoCliente() {
  return {
    /** @returns {Promise<{ ok: true, reservaId: string | null } | { ok: false, motivo: "esgotado", estado: object }>} */
    reservar(estimadoBrl, { dono, tetoBrl, jaGastoBrl = 0, agora = Date.now() }) {
      return reservarOrcamento("CLIENTES", estimadoBrl, { dono, agora, jaGastoBrl, config: { orcamentos: { clientesBrl: tetoBrl } } });
    },
    liquidar: (reservaId) => liquidarReserva(reservaId),
    /** O que a resposta custou, de uma vez (todas as rodadas, e a tentativa do modelo principal quando a reserva respondeu). */
    registrarConversa({ provedor, modelo, usd, brl, referencia }) {
      return prisma.gastoIA.create({ data: { tipo: "CONVERSA", escopo: "CLIENTES", provedor, modelo, valorUsd: usd, valorBrl: brl, referencia } });
    },
    /** O gasto dos clientes HOJE (dia de Sao Paulo), para o teto do dia. */
    async gastoDeHojeBrl(agora = Date.now()) {
      const { inicio, fim } = limitesDoDia(new Date(agora).toLocaleDateString("sv-SE", { timeZone: FUSO }));
      const soma = await prisma.gastoIA.aggregate({ _sum: { valorBrl: true }, where: { escopo: "CLIENTES", criadoEm: { gte: inicio, lt: fim } } });
      return Number(soma._sum.valorBrl ?? 0);
    },
  };
}
