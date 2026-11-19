import { melhorEnvio } from "./melhorEnvio";

export { ErroDoProvedor } from "./erro";

/**
 * Fonte unica dos provedores de frete (spec 5.2), no molde de `integracoes/registro.js`: um provedor novo (SuperFrete) e
 * um arquivo com a mesma forma e uma linha nesta lista. A tela e o worker nao mudam.
 *
 * Forma de todo provedor: { id, nome, capacidades: { reverso, formatosDeImpressao, declaracaoDeConteudo }, cotar,
 * comprar, imprimir, rastrear, cancelar, saldo, gerarReverso }.
 */
export const provedores = [melhorEnvio];

export const PROVEDOR_PADRAO = "MELHOR_ENVIO";

export function obterProvedor(id) {
  return provedores.find((provedor) => provedor.id === id) ?? null;
}
