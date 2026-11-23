import { prisma } from "@/lib/db";

import { formatarCpf, validarCpf } from "@/lib/documentos";

import { lerDecimal } from "./regras";

/**
 * A configuracao do frete (Configuracoes > Envios): uma linha so, id "frete", semeada pela migration. Os numeros saem
 * como Number: o Decimal do Prisma nao atravessa para a tela.
 */

const ID = "frete";
const PADRAO = { acrescimoDeEmbalagem: 1, percentualDePesoExtra: 10, momentoDoAviso: "POSTADO" };

export async function lerConfigDeFrete() {
  const linha = await prisma.configDeFrete.upsert({ where: { id: ID }, update: {}, create: { id: ID, ...PADRAO } });
  return {
    ...linha,
    acrescimoDeEmbalagem: Number(linha.acrescimoDeEmbalagem),
    percentualDePesoExtra: Number(linha.percentualDePesoExtra),
  };
}

/** Os textos do aviso ao cliente (fase 2): vazio vira null, e o aviso usa o padrao de `regras.js`. */
const TEXTOS = { assuntoDoEmail: 150, textoDoEmail: 2000, textoDoWhatsapp: 1000 };

/** @returns {Promise<{ ok: true } | { ok: false, erros: Record<string, string> }>} */
export async function salvarConfigDeFrete(entrada) {
  const erros = {};
  const acrescimo = lerDecimal(entrada?.acrescimoDeEmbalagem);
  const percentual = lerDecimal(entrada?.percentualDePesoExtra);
  if (acrescimo === null || acrescimo > 100) erros.acrescimoDeEmbalagem = "Valor de R$0,00 a R$100,00.";
  if (percentual === null || percentual > 100) erros.percentualDePesoExtra = "Percentual de 0 a 100.";
  const textos = {};
  for (const [campo, limite] of Object.entries(TEXTOS)) {
    const valor = String(entrada?.[campo] ?? "").trim();
    if (valor.length > limite) erros[campo] = `No máximo ${limite} caracteres.`;
    textos[campo] = valor || null;
  }
  // CPF alternativo do rastreio da J&T nas compras (23/11/2026): so muda quando o campo vem (quem nao o manda nao apaga).
  const documento = {};
  if (entrada && Object.hasOwn(entrada, "documentoRastreioJT")) {
    const cpf = String(entrada.documentoRastreioJT ?? "").trim();
    if (cpf && !validarCpf(cpf)) erros.documentoRastreioJT = "CPF inválido.";
    else documento.documentoRastreioJT = cpf ? formatarCpf(cpf) : null;
  }
  if (Object.keys(erros).length) return { ok: false, erros };

  const dados = { acrescimoDeEmbalagem: acrescimo, percentualDePesoExtra: percentual, ...textos, ...documento };
  await prisma.configDeFrete.upsert({ where: { id: ID }, update: dados, create: { id: ID, ...PADRAO, ...dados } });
  return { ok: true };
}
