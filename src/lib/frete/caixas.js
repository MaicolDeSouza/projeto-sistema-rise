import { prisma } from "@/lib/db";

import { lerDecimal, nomeDaCaixa } from "./regras";

/**
 * Caixas de envio (Cadastros > Caixas de envio, modulo de frete). O nome nunca e digitado: e a medida ("CX 16x11x3"),
 * montada aqui, para duas caixas nunca terem o mesmo nome com medidas diferentes.
 */

const numero = (valor) => (valor === null || valor === undefined ? null : Number(valor));

function paraTela(caixa) {
  return {
    id: caixa.id,
    nome: caixa.nome,
    comprimentoCm: numero(caixa.comprimentoCm),
    larguraCm: numero(caixa.larguraCm),
    alturaCm: numero(caixa.alturaCm),
    comprimentoInternoCm: numero(caixa.comprimentoInternoCm),
    larguraInternaCm: numero(caixa.larguraInternaCm),
    alturaInternaCm: numero(caixa.alturaInternaCm),
    pesoVazioKg: numero(caixa.pesoVazioKg),
    ativo: caixa.ativo,
  };
}

const volume = (caixa) => caixa.comprimentoCm * caixa.larguraCm * caixa.alturaCm;

/** Da menor para a maior: e a ordem em que o operador procura a caixa na lista. */
export async function listarCaixas({ soAtivas = false } = {}) {
  const linhas = await prisma.caixaDeEnvio.findMany({ where: soAtivas ? { ativo: true } : {} });
  return linhas.map(paraTela).sort((a, b) => volume(a) - volume(b) || a.nome.localeCompare(b.nome));
}

const EXTERNAS = [
  ["comprimentoCm", "comprimentoInternoCm"],
  ["larguraCm", "larguraInternaCm"],
  ["alturaCm", "alturaInternaCm"],
];

/** @returns {Promise<{ ok: true, caixa } | { ok: false, erros: Record<string, string> }>} */
export async function salvarCaixa(entrada, id) {
  const erros = {};
  const dados = {};

  for (const [externa, interna] of EXTERNAS) {
    const valor = lerDecimal(entrada?.[externa]);
    if (!valor || valor <= 0 || valor > 300) erros[externa] = "Informe a medida em cm.";
    else dados[externa] = valor;

    const texto = String(entrada?.[interna] ?? "").trim();
    if (!texto) dados[interna] = null;
    else {
      const valorInterno = lerDecimal(texto);
      if (!valorInterno || valorInterno <= 0) erros[interna] = "Medida inválida.";
      else if (dados[externa] && valorInterno > dados[externa]) erros[interna] = "A medida interna não pode passar da externa.";
      else dados[interna] = valorInterno;
    }
  }

  const peso = lerDecimal(entrada?.pesoVazioKg);
  if (!peso || peso <= 0 || peso > 30) erros.pesoVazioKg = "Informe o peso da caixa vazia.";
  else dados.pesoVazioKg = peso;

  if (Object.keys(erros).length) return { ok: false, erros };

  dados.nome = nomeDaCaixa(dados);
  dados.ativo = !(entrada?.ativo === false || entrada?.ativo === "false");

  const mesmoNome = await prisma.caixaDeEnvio.findUnique({ where: { nome: dados.nome } });
  if (mesmoNome && mesmoNome.id !== id) return { ok: false, erros: { medidas: `Já existe a caixa ${dados.nome}.` } };

  const caixa = id ? await prisma.caixaDeEnvio.update({ where: { id }, data: dados }) : await prisma.caixaDeEnvio.create({ data: dados });
  return { ok: true, caixa: paraTela(caixa) };
}

/**
 * Caixa sem envio sai; com envio, so e desativada (o envio guarda a caixa em que foi, e apagar levaria a referencia).
 * @returns {Promise<{ ok: true, desativada: boolean } | { ok: false, erro: string }>}
 */
export async function excluirCaixa(id) {
  const caixa = await prisma.caixaDeEnvio.findUnique({ where: { id }, include: { _count: { select: { envios: true } } } });
  if (!caixa) return { ok: false, erro: "Caixa não encontrada." };
  if (caixa._count.envios > 0) {
    await prisma.caixaDeEnvio.update({ where: { id }, data: { ativo: false } });
    return { ok: true, desativada: true };
  }
  await prisma.caixaDeEnvio.delete({ where: { id } });
  return { ok: true, desativada: false };
}
