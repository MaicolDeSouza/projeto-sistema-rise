import { prisma } from "@/lib/db";
import { enfileirar } from "@/lib/coleta/fila";

import { montarDadosDoRelatorio } from "./dados";
import { gerarPdfDoRelatorio } from "./pdf";
import { rodadaDevida } from "./semana";

/**
 * A rotina semanal da coleta e do relatorio (20/10/2026), chamada pelo worker normal a cada volta.
 *
 * 1) No sabado 00:00 (America/Sao_Paulo) enfileira as lojas ativas e abre a rodada (`RelatorioSemanal`, COLETANDO);
 * 2) quando nao sobra varredura aberta dessas lojas — ou passadas 48 h —, gera o PDF e fecha a rodada.
 *
 * A rodada e uma linha por semana (`semana` unica): dois workers, ou duas voltas seguidas, nao abrem duas.
 */

/** Passado isto sem as varreduras acabarem, o relatorio sai assim mesmo, dizendo que a rodada nao terminou. */
export const ESPERA_MAXIMA_MS = 48 * 3600 * 1000;

/** As lojas que entram na rodada: ativas, liberadas pelo robots.txt e que a VPS alcanca (as do PC nao). */
export async function fontesDaRodada() {
  return prisma.fonteColeta.findMany({
    where: { ativa: true, robotsPermite: true, varridaNoPc: false, tipo: { in: ["CONCORRENTE", "FORNECEDOR"] } },
    select: { id: true, nome: true },
    orderBy: { nome: "asc" },
  });
}

async function gerarEFechar(rodada, { incompleto = false, agora = new Date() } = {}) {
  try {
    const dados = await montarDadosDoRelatorio({ inicioEm: rodada.inicioEm, fontes: rodada.fontes });
    const pdf = await gerarPdfDoRelatorio({ semana: rodada.semana, inicioEm: rodada.inicioEm, fimEm: agora, dados, incompleto });
    await prisma.relatorioSemanal.update({
      where: { id: rodada.id },
      data: {
        status: "PRONTO",
        fimEm: agora,
        pdf,
        erro: incompleto ? "A rodada não terminou antes da geração: algumas lojas ainda estavam em varredura." : null,
        resumo: { ...dados.totais, lojasComErro: dados.lojas.filter((loja) => loja.situacao === "erro").map((loja) => loja.nome) },
      },
    });
    return { ok: true };
  } catch (erro) {
    console.error("[relatorio] falha ao gerar:", erro?.message ?? erro);
    await prisma.relatorioSemanal.update({ where: { id: rodada.id }, data: { status: "ERRO", fimEm: agora, erro: String(erro?.message ?? erro).slice(0, 500) } });
    return { ok: false, erro: erro?.message ?? String(erro) };
  }
}

/**
 * Abre a rodada devida, se for o caso. `pausada`: a coleta esta pausada na tela; pausar nao pode ser desfeito por um
 * relogio, entao a rodada nem abre (a janela de 48 h segue valendo: tirar a pausa no sabado ainda a abre).
 */
export async function abrirRodadaDevida({ agora = new Date(), pausada = false } = {}) {
  const devida = rodadaDevida(agora);
  if (!devida || pausada) return { aberta: false };

  const fontes = await fontesDaRodada();
  let rodada;
  try {
    rodada = await prisma.relatorioSemanal.create({
      data: { semana: devida.chave, status: "COLETANDO", inicioEm: agora, fontes },
    });
  } catch (erro) {
    // A semana ja tem rodada (outra volta, outro worker): nada a fazer.
    if (erro?.code === "P2002") return { aberta: false };
    throw erro;
  }

  const enfileiradas = await enfileirar(fontes);
  return { aberta: true, semana: rodada.semana, fontes: fontes.length, enfileiradas };
}

/** Fecha as rodadas cujas varreduras acabaram (ou passaram da espera maxima), gerando o PDF. */
export async function fecharRodadasProntas({ agora = new Date() } = {}) {
  const abertas = await prisma.relatorioSemanal.findMany({ where: { status: "COLETANDO" } });
  const fechadas = [];

  for (const rodada of abertas) {
    const ids = (Array.isArray(rodada.fontes) ? rodada.fontes : []).map((fonte) => fonte.id);
    const emAberto = ids.length
      ? await prisma.job.count({ where: { tipo: "coleta", fonteId: { in: ids }, status: { in: ["PENDENTE", "PROCESSANDO"] } } })
      : 0;
    const estourou = agora.getTime() - rodada.inicioEm.getTime() > ESPERA_MAXIMA_MS;
    if (emAberto > 0 && !estourou) continue;

    const resultado = await gerarEFechar(rodada, { incompleto: emAberto > 0, agora });
    fechadas.push({ semana: rodada.semana, ...resultado });
  }
  return fechadas;
}

/** O que o worker chama a cada volta. Nunca lanca: a rotina nao pode derrubar a varredura. */
export async function conferirRotinaSemanal({ agora = new Date(), pausada = false } = {}) {
  try {
    const abertura = await abrirRodadaDevida({ agora, pausada });
    const fechadas = await fecharRodadasProntas({ agora });
    return { abertura, fechadas };
  } catch (erro) {
    console.error("[relatorio] rotina semanal:", erro?.message ?? erro);
    return { abertura: { aberta: false }, fechadas: [], erro: erro?.message ?? String(erro) };
  }
}

/**
 * "Gerar agora": o relatorio dos ULTIMOS 7 DIAS com o que ja esta no banco, SEM varrer nada. Serve para ver o formato e
 * para o dia em que a rodada do sabado nao rodou.
 */
export async function gerarRelatorioAgora({ agora = new Date() } = {}) {
  const fontes = await fontesDaRodada();
  const inicioEm = new Date(agora.getTime() - 7 * 24 * 3600 * 1000);
  const rodada = await prisma.relatorioSemanal.create({
    data: { semana: `manual-${agora.getTime()}`, status: "COLETANDO", inicioEm, fontes },
  });
  return gerarEFechar(rodada, { agora }).then((resultado) => ({ ...resultado, id: rodada.id }));
}
