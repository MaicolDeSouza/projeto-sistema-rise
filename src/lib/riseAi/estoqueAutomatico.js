import { lerConexao } from "@/lib/integracoes/conexoes";
import { sincronizarEstoqueDoBling } from "@/lib/blingSync/saldos";

/**
 * A leitura AUTOMÁTICA do estoque do Bling (decisão do dono em 11/10/2026: "o Rise atualiza seu estoque buscando no Bling
 * a cada 1 h"). O Rise AI responde estoque pelo número do Rise, e esse número só chegava ao Rise pelo botão "Sincronizar
 * estoque com Bling" da lista de Produtos; agora o worker faz o mesmo, de hora em hora.
 *
 * É SÓ LEITURA do Bling (a mesma `sincronizarEstoqueDoBling` do botão): grava `blingSaldo`, `estoque` (o saldo mais os
 * ajustes pendentes do Rise) e `blingSaldoLidoEm`, sem escrever nada no Bling. Desliga com `ESTOQUE_AUTOMATICO_BLING=false`.
 */

const UMA_HORA_MS = 60 * 60 * 1000;

/**
 * A decisão, pura: roda quando está ligado, o Bling está conectado e já passou o intervalo desde a última vez.
 *
 * @param {{ agora: number, ultimaEm: number, intervaloMs?: number, ligado?: boolean, blingConectado: boolean }} situacao
 * @returns {{ deve: boolean, motivo: "desligado" | "bling_desconectado" | "cedo" | null }}
 */
export function deveSincronizarEstoque({ agora, ultimaEm, intervaloMs = UMA_HORA_MS, ligado = true, blingConectado }) {
  if (!ligado) return { deve: false, motivo: "desligado" };
  if (!blingConectado) return { deve: false, motivo: "bling_desconectado" };
  if (agora - ultimaEm < intervaloMs) return { deve: false, motivo: "cedo" };
  return { deve: true, motivo: null };
}

const estaLigado = (env) => String(env?.ESTOQUE_AUTOMATICO_BLING ?? "").trim().toLowerCase() !== "false";

/**
 * Lê o estoque do Bling agora, se estiver ligado e o Bling conectado. NUNCA lança: o worker não pode cair por causa disso
 * (um Bling fora do ar vira `{ rodou: false, motivo: "erro" }` e a próxima tentativa é daqui a uma hora).
 *
 * @returns {Promise<{ rodou: false, motivo: "desligado" | "bling_desconectado" | "erro", erro?: string }
 *   | { rodou: true, atualizados: number, semCodigoNoBling: number, falhas: number }>}
 */
export async function rodarSincronizacaoDeEstoque({ env = process.env } = {}) {
  try {
    // O tempo já foi decidido por quem chama (o worker mede a hora); aqui só valem o "ligado" e o Bling conectado.
    const conexao = estaLigado(env) ? await lerConexao("BLING") : null;
    const decisao = deveSincronizarEstoque({ agora: UMA_HORA_MS, ultimaEm: 0, ligado: estaLigado(env), blingConectado: conexao?.status === "CONECTADO" });
    if (!decisao.deve) return { rodou: false, motivo: decisao.motivo };

    const resultado = await sincronizarEstoqueDoBling();
    return { rodou: true, atualizados: resultado.atualizados, semCodigoNoBling: resultado.semCodigoNoBling, falhas: resultado.falhas.length };
  } catch (erro) {
    return { rodou: false, motivo: "erro", erro: erro?.message ?? String(erro) };
  }
}
