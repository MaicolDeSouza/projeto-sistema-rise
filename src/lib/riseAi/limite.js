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
      // Chave sem pedido na janela sai do mapa: no endpoint de token a chave e o IP de quem pede, e sem a limpeza uma
      // varredura de IPs fazia o mapa crescer para sempre (revisao de seguranca de 22/10/2026). A faxina geral so roda
      // quando o mapa passa de 500 chaves, para o caminho comum continuar barato.
      if (pedidos.size > 500) {
        for (const [chave, instantes] of pedidos) {
          if (!instantes.some((instante) => instante > agora - JANELA_MS)) pedidos.delete(chave);
        }
      }
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
