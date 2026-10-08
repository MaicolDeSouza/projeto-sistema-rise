import { mlGet, obterUsuarioId } from "@/lib/integracoes/mercadolivre";

/**
 * O contrato com o Mercado Livre que as leituras do canal ML recebem por parametro
 * (`cliente = clienteML()`): `get(caminho, params)` e `usuarioId()`. Quem le so conhece esse
 * objeto, entao o teste troca o ML real pelo falso (`scripts/lib/mlFalso.js`), sem rede.
 *
 * So leitura: nao ha `post` aqui de proposito. A fase 2 nao escreve no ML, e a publicacao
 * (fase 3) passa pela trava `ML_PUBLICACAO` do conector.
 *
 * @returns {{ get: typeof mlGet, usuarioId: typeof obterUsuarioId }}
 */
export function clienteML() {
  return { get: mlGet, usuarioId: obterUsuarioId };
}
