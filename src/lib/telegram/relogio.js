/**
 * O relogio proprio dos avisos do Telegram, fora da volta do worker (19/11/2026).
 *
 * Ate ali a rotina rodava dentro da volta do worker, uma rotina depois da outra, e o monitor da Loja Integrada leva
 * ~8 min (99 produtos no ritmo da API da LI): o aviso do 130506 saiu 7 min depois do estoque zerado. Com o relogio
 * proprio, a rotina roda a cada `intervaloMs` enquanto as outras esperam a rede.
 *
 * A proxima rodada so e agendada DEPOIS de a anterior terminar (setTimeout, nao setInterval, o mesmo molde do sinal de
 * vida do worker): banco lento nunca poe duas rodadas ao mesmo tempo, e duas rodadas juntas mandariam o mesmo aviso duas
 * vezes. Erro numa rodada vai para `aoErro` e o relogio segue.
 *
 * @param {{ intervaloMs: number, rodar: () => Promise<unknown>, aoErro?: (erro: unknown) => void }} opcoes
 * @returns {{ parar: () => Promise<void> }} `parar` desliga e espera a rodada em curso terminar (o worker so solta o
 *   banco depois disso).
 */
export function ligarRelogioDosAvisos({ intervaloMs, rodar, aoErro = () => {} }) {
  let parado = false;
  let proxima = null;
  let emCurso = Promise.resolve();

  const rodada = () => {
    proxima = null;
    emCurso = (async () => {
      try {
        await rodar();
      } catch (erro) {
        aoErro(erro);
      }
    })();
    emCurso.then(() => {
      if (!parado) proxima = setTimeout(rodada, intervaloMs);
    });
  };

  rodada();

  return {
    async parar() {
      parado = true;
      if (proxima) clearTimeout(proxima);
      proxima = null;
      await emCurso;
    },
  };
}
