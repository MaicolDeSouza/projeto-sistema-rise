import { prisma } from "@/lib/db";

import { ENDERECO_BASE, MODELOS, avaliarConfiguracao, enderecoDoModelo } from "./nanobanana";

/**
 * Registro e contagem das geracoes do Nano Banana, em LogIntegracao (`servico = GEMINI`).
 *
 * O MODELO vai no `endpoint` (o endereco do modelo no Google), como o Photoroom faz com o modo: e o que
 * permite somar o gasto por modelo sem coluna nova. Nunca entram a chave, a imagem nem o prompt: so o que
 * explica o custo (pixels da original, quantas extras, tamanho do prompt, se era "gerar de novo").
 */

/**
 * @param {{ modelo: string, status: number | null, duracaoMs: number, pixelsOrigem: number | null,
 *           extras: number, tamanhoPrompt: number, repetida: boolean, erro?: string | null }} chamada
 */
export async function registrarChamada({ modelo, status, duracaoMs, pixelsOrigem, extras, tamanhoPrompt, repetida, erro = null }) {
  try {
    await prisma.logIntegracao.create({
      data: {
        servico: "GEMINI",
        metodo: "POST",
        endpoint: enderecoDoModelo(modelo) ?? `${ENDERECO_BASE}/desconhecido`,
        statusHttp: status,
        duracaoMs,
        requestResumo: JSON.stringify({ pixelsOrigem, extras, tamanhoPrompt, repetida }),
        erro: erro ? String(erro).slice(0, 400) : null,
      },
    });
  } catch (falha) {
    // Falha de log nao pode derrubar a geracao, que ja foi cobrada.
    console.error("Falha ao gravar LogIntegracao (Nano Banana):", falha.message);
  }
}

/** Meia-noite UTC de hoje e do primeiro dia do mes: a data no banco esta em UTC (como no Photoroom). */
function marcos(agora) {
  return {
    hoje: new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())),
    mes: new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)),
  };
}

/**
 * Geracoes de hoje e do mes, e o gasto do mes em dolar. So conta resposta 200: erro do Google nao gera
 * imagem nem cobra. O gasto e a soma, por modelo, de geracoes x preco publicado (conta de mercearia, sem
 * IOF nem cambio).
 */
export async function usoDoNanoBanana(agora = new Date()) {
  const { hoje, mes } = marcos(agora);
  // O limite superior prende a conta ao mes de `agora` (o teste usa um mes ficticio).
  const ate = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 1));
  const onde = (desde) => ({ servico: "GEMINI", statusHttp: 200, criadoEm: { gte: desde, lt: ate } });

  const [geracoesHoje, porModelo] = await Promise.all([
    prisma.logIntegracao.count({ where: onde(hoje) }),
    prisma.logIntegracao.groupBy({ by: ["endpoint"], where: onde(mes), _count: { _all: true } }),
  ]);

  const precoPorEndereco = new Map(Object.keys(MODELOS).map((chave) => [enderecoDoModelo(chave), MODELOS[chave].usd]));
  let geracoesMes = 0;
  let gasto = 0;
  for (const grupo of porModelo) {
    geracoesMes += grupo._count._all;
    gasto += grupo._count._all * (precoPorEndereco.get(grupo.endpoint) ?? 0);
  }

  return {
    hoje: geracoesHoje,
    mes: geracoesMes,
    limiteDia: avaliarConfiguracao().tetoDia,
    gastoMesUsd: Number(gasto.toFixed(2)),
  };
}
