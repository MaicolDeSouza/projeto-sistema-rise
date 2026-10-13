import { MOTIVO_PARADA } from "./provedores/contrato";

/**
 * O registro das respostas em andamento, para o botão Parar (spec §5): `POST /api/rise-ai/parar` pede a parada pelo id da
 * conversa, e quem responde (`responder`) escuta o `AbortController` registrado aqui.
 *
 * É um pedido EXPLÍCITO, não o fechamento da conexão: recarregar a página também fecha a conexão, e a resposta tem de
 * continuar e ser gravada. Só em memória do processo (até a Entrega B o `app` é um processo só); se um dia houver mais de um,
 * a parada passa por uma tarefa na fila, como as ordens à Evolution.
 *
 * Só a DONA da resposta para: pedir a parada da conversa de outra pessoa responde igual a "não há resposta em andamento".
 */

export { MOTIVO_PARADA };

/** conversaId -> { usuario, controle } */
const emAndamento = new Map();

/**
 * Registra a resposta que está sendo escrita. Devolve a função que a tira do registro (chamar no `finally`).
 *
 * @param {string} conversaId
 * @param {string} usuario  quem pode parar (o dono da conversa)
 * @param {AbortController} controle  abortado com o `MOTIVO_PARADA`
 */
export function registrarResposta(conversaId, usuario, controle) {
  const registro = { usuario, controle };
  emAndamento.set(conversaId, registro);
  return () => {
    // Só tira o próprio registro: uma resposta nova da mesma conversa não pode ser desregistrada pela anterior.
    if (emAndamento.get(conversaId) === registro) emAndamento.delete(conversaId);
  };
}

/** @returns {{ parou: boolean }}  `false` quando não há resposta, quando é de outra pessoa ou quando já foi parada */
export function pararResposta(conversaId, { usuario }) {
  const registro = emAndamento.get(String(conversaId ?? ""));
  if (!registro || registro.usuario !== usuario || registro.controle.signal.aborted) return { parou: false };
  registro.controle.abort(MOTIVO_PARADA);
  return { parou: true };
}
