/**
 * Roda uma vez quando o servidor do Next sobe. Nos dois ambientes: a semeadura de Acessos. So no Rise do PC: liga o
 * vigia que atende os pedidos de "Varrer pelo PC" feitos na tela da VPS (`src/lib/coleta/vigiaDoPc.js`).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Acessos: a funcao Administrador, a Atendimento uma vez so e os logins de RISE_AI_ADMINS. Idempotente; com o banco
  // fora do ar so adia (a proxima partida tenta de novo) e o site sobe do mesmo jeito.
  try {
    const { semearAcessos } = await import("./lib/acessos/semeadura.js");
    const { prisma } = await import("./lib/db.js");
    const { usuariosCriados } = await semearAcessos({ prisma, env: process.env });
    if (usuariosCriados.length) console.log(`[acessos] administradores criados: ${usuariosCriados.join(", ")}`);
  } catch (erro) {
    console.error("[acessos] semeadura adiada:", erro?.message ?? erro);
  }

  if (process.env.RISE_PRODUCAO || process.env.RISE_VIGIA_PC === "0") return;

  const { ligarVigiaDoPc } = await import("./lib/coleta/vigiaDoPc.js");
  const { iniciarWorkerPc, lerEstadoDoWorkerPc, situacaoDoWorkerPc } = await import("./lib/coleta/workerPc.js");
  const { coletaPausada } = await import("./lib/coleta/controle.js");

  const pasta = process.cwd();
  ligarVigiaDoPc({
    pastaProjeto: pasta,
    iniciar: iniciarWorkerPc,
    rodando: () => situacaoDoWorkerPc(lerEstadoDoWorkerPc(`${pasta}/dados`)).rodando,
    pausada: coletaPausada,
  });
}
