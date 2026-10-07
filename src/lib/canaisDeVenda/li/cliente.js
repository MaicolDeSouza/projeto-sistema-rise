import { exigirCodigoLiberado } from "@/lib/blingSync/cliente";
import { config, exigirTravaLiberada } from "@/lib/integracoes/config";
import { clienteLojaIntegrada } from "@/lib/integracoes/lojaIntegrada/client";

/**
 * O contrato com a Loja Integrada que TODAS as funcoes de envio e leitura recebem por
 * parametro (`cliente = clienteLI()`): `get`, `post`, `put` e `exigirEscrita`. O teste troca
 * a LI real pela falsa (`scripts/lib/lojaIntegradaFalsa.js`), que tem o mesmo formato.
 *
 * O cliente HTTP do handoff ja barra todo verbo que nao e GET pela trava geral; aqui entra a
 * segunda trava, a lista de SKUs liberados (LI_ESCRITA_CODIGOS), que quem escreve chama ANTES
 * da primeira escrita, para a recusa nao deixar meio envio para tras.
 */
export function clienteLI() {
  return {
    get: (caminho, params) => clienteLojaIntegrada.get(caminho, params),
    post: (caminho, corpo) => clienteLojaIntegrada.post(caminho, corpo),
    put: (caminho, corpo) => clienteLojaIntegrada.put(caminho, corpo),
    exigirEscrita(sku) {
      exigirTravaLiberada("LOJA_INTEGRADA");
      exigirCodigoLiberado(sku, config.travas.liCodigosLiberados, "LI_ESCRITA_CODIGOS");
    },
  };
}
