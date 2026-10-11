/**
 * Limite de perguntas por usuário por minuto (spec §5.4, `taxaPorUsuarioPorMinuto`). Janela deslizante de 60 s,
 * em memória: o Rise roda num processo só, e perder a contagem num reinício só deixa passar um minuto de perguntas.
 *
 * Sem imports: o laço da conversa e o teste usam o mesmo arquivo. O relógio entra por parâmetro, para o teste não
 * esperar um minuto de verdade.
 */

const JANELA_MS = 60 * 1000;

/** @param {{ porMinuto: number }} opcoes */
export function criarLimitador({ porMinuto }) {
  /** @type {Map<string, number[]>} */
  const pedidos = new Map();

  return {
    /** `true` e registra o pedido; `false` quando o usuário já usou a cota da janela. */
    permitir(usuario, agora = Date.now()) {
      const recentes = (pedidos.get(usuario) ?? []).filter((instante) => instante > agora - JANELA_MS);
      if (recentes.length >= porMinuto) {
        pedidos.set(usuario, recentes);
        return false;
      }
      recentes.push(agora);
      pedidos.set(usuario, recentes);
      return true;
    },
  };
}
