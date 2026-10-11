/**
 * Roda uma vez quando o servidor do Next sobe. Aqui, so no Rise do PC: liga o vigia que atende os pedidos de
 * "Varrer pelo PC" feitos na tela da VPS (`src/lib/coleta/vigiaDoPc.js`). Na VPS (`RISE_PRODUCAO`) nao liga nada.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
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
