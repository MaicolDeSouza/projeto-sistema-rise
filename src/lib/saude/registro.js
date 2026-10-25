import { prisma } from "@/lib/db";
import { resultadoDaRotina } from "./regras";

/**
 * Grava o resultado de uma volta de rotina do worker em `RotinaDoWorker` (Saude do Rise). Nunca lanca: a saude e um
 * espelho, e o banco fora por instantes nao pode derrubar a rotina que ela vigia.
 *
 * @param {string} id o id da rotina (`ROTINAS_DO_WORKER` em regras.js)
 * @param {object} retorno o que a rotina devolveu (ou `{ motivo: "erro", erro }` quando ela lancou)
 */
export async function registrarRotina(id, retorno, { inicio = Date.now(), intervaloMs = null, agora = Date.now() } = {}) {
  try {
    const { ok, erro, aviso } = resultadoDaRotina(retorno);
    const quando = new Date(agora);
    const comum = { duracaoMs: Math.max(0, Math.round(agora - inicio)), intervaloMs };
    const dados = ok ? { ...comum, ultimaOkEm: quando, aviso } : { ...comum, ultimaFalhaEm: quando, ultimoErro: String(erro).slice(0, 500) };
    await prisma.rotinaDoWorker.upsert({ where: { id }, create: { id, ...dados }, update: dados });
  } catch (falha) {
    console.error(`[saude] rotina ${id} nao registrada:`, falha?.message ?? falha);
  }
}

/** A memoria do worker (de hora em hora), na linha "memoria": o heap usado e o teto do V8 (`--max-old-space-size`). */
export async function registrarMemoria({ heapMb, limiteMb, rssMb }, { agora = Date.now() } = {}) {
  try {
    const dados = { dados: { heapMb, limiteMb, rssMb, em: new Date(agora).toISOString() }, ultimaOkEm: new Date(agora) };
    await prisma.rotinaDoWorker.upsert({ where: { id: "memoria" }, create: { id: "memoria", ...dados }, update: dados });
  } catch (falha) {
    console.error("[saude] memoria nao registrada:", falha?.message ?? falha);
  }
}
