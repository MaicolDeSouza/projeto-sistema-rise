import { prisma } from "@/lib/db";

import {
  CUSTO_COMPRA_USD,
  ENDERECO,
  LIMITE_PREVIAS_DIA,
  LIMITE_PREVIAS_MES,
} from "./photoroom";

/**
 * Registro e contagem das chamadas ao Photoroom, em LogIntegracao (toda chamada externa
 * do sistema e auditada la, com a credencial mascarada: aqui ela nem entra).
 *
 * O MODO vai no `endpoint`, porque LogIntegracao nao tem coluna para isso e uma migration
 * a mais so para isto nao se justifica: "[previa]" e sandbox (gratis), "[producao]" e a
 * compra. As contagens abaixo sao consultas sobre essa marca.
 */

const MARCA = { previa: `${ENDERECO} [previa]`, producao: `${ENDERECO} [producao]` };

/**
 * @param {{ modo: "previa" | "producao", status: number | null, duracaoMs: number,
 *           opcoes: object, erro?: string | null, pixelsOrigem?: number | null }} chamada
 */
export async function registrarChamada({ modo, status, duracaoMs, opcoes, erro = null, pixelsOrigem = null }) {
  try {
    await prisma.logIntegracao.create({
      data: {
        servico: "PHOTOROOM",
        metodo: "POST",
        endpoint: MARCA[modo],
        statusHttp: status,
        duracaoMs,
        // So o que decide o custo e o resultado. Nunca a imagem, nunca a chave.
        requestResumo: JSON.stringify({ ...opcoes, pixelsOrigem }),
        erro: erro ? String(erro).slice(0, 400) : null,
      },
    });
  } catch (falha) {
    // Falha de log nao pode derrubar a compra que ja foi feita.
    console.error("Falha ao gravar LogIntegracao (Photoroom):", falha.message);
  }
}

/** Meia-noite UTC de hoje e do primeiro dia do mes: a data no banco esta em UTC. */
function marcos(agora = new Date()) {
  return {
    hoje: new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate())),
    mes: new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)),
  };
}

/**
 * Quanto do sandbox foi usado e quanto se gastou. So conta chamada que deu certo (200): o
 * Photoroom informa que chamada com erro nao consome imagem.
 */
export async function usoDoPhotoroom(agora = new Date()) {
  const { hoje, mes } = marcos(agora);
  const onde = (modo, desde) => ({
    servico: "PHOTOROOM",
    endpoint: MARCA[modo],
    statusHttp: 200,
    criadoEm: { gte: desde },
  });

  const [previasHoje, previasMes, comprasMes] = await Promise.all([
    prisma.logIntegracao.count({ where: onde("previa", hoje) }),
    prisma.logIntegracao.count({ where: onde("previa", mes) }),
    prisma.logIntegracao.count({ where: onde("producao", mes) }),
  ]);

  return {
    previasHoje,
    limiteDia: LIMITE_PREVIAS_DIA,
    previasMes,
    limiteMes: LIMITE_PREVIAS_MES,
    comprasMes,
    // Em dolar, como o Photoroom cobra. Conta de mercearia, nao a fatura: o valor real
    // depende do plano e do cambio.
    gastoMesUsd: Number((comprasMes * CUSTO_COMPRA_USD).toFixed(2)),
  };
}
