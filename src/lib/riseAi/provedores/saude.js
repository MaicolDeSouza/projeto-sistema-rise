/**
 * "O provedor está de pé?", com memória de 60 s. O laço da conversa pergunta antes de cada resposta: sem a memória,
 * cada pergunta gastaria uma ida ao PC do dono, e com o PC desligado o primeiro token esperaria os 45 s do limite
 * antes de a reserva assumir. Com ela, a primeira pergunta depois de uma queda paga a consulta (no máximo 5 s) e as
 * seguintes vão direto para a reserva até a próxima conferência.
 *
 * Em memória do processo, de propósito: é só um atalho, perder no reinício só custa uma consulta.
 */

const TEMPO_DA_CONSULTA_MS = 5000;

/** @type {Map<string, { ok: boolean, em: number }>} */
const memoria = new Map();

/** Só para o teste. */
export function esquecerSaude() {
  memoria.clear();
}

/**
 * @param {{ id: string, endpoint?: string, listarModelos: () => Promise<unknown> }} provedor
 * @param {{ cacheMs?: number, agora?: number }} opcoes
 * @returns {Promise<boolean>}
 */
export async function provedorDisponivel(provedor, { cacheMs = 60000, agora = Date.now() } = {}) {
  // O endereço entra na chave: o administrador que troca o endpoint na tela não herda o "fora do ar" do antigo.
  const chave = `${provedor.id}|${provedor.endpoint ?? ""}`;
  const guardado = memoria.get(chave);
  if (guardado && agora - guardado.em < cacheMs) return guardado.ok;

  let relogio;
  const estouro = new Promise((_, rejeitar) => {
    relogio = setTimeout(() => rejeitar(new Error("sem resposta")), TEMPO_DA_CONSULTA_MS);
  });
  let ok = false;
  try {
    await Promise.race([provedor.listarModelos(), estouro]);
    ok = true;
  } catch {
    ok = false;
  } finally {
    clearTimeout(relogio);
  }
  memoria.set(chave, { ok, em: agora });
  return ok;
}
