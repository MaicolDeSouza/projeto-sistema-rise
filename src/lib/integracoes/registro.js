import { conector as bling } from "./bling";
import { conector as lojaIntegrada } from "./lojaintegrada";
import { conector as mercadoLivre } from "./mercadolivre";

/**
 * Fonte unica dos conectores. A tela de Integracoes e o script de diagnostico
 * leem daqui — adicionar um marketplace novo (Shopee, Amazon) e criar o arquivo
 * do conector e acrescentar uma linha nesta lista. A tela nao muda.
 */
export const conectores = [bling, mercadoLivre, lojaIntegrada];

export function obterConector(id) {
  return conectores.find((conector) => conector.id === id) ?? null;
}
