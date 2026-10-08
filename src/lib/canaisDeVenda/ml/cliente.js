import { exigirCodigoLiberado } from "@/lib/blingSync/cliente";
import { config, exigirTravaLiberada } from "@/lib/integracoes/config";
import { mlGet, mlPost, mlPut, mlUpload, obterUsuarioId } from "@/lib/integracoes/mercadolivre";

/**
 * O contrato com o Mercado Livre que as leituras e a publicacao do canal ML recebem por parametro
 * (`cliente = clienteML()`). Quem usa so conhece esse objeto, entao o teste troca o ML real pelo
 * falso (`scripts/lib/mlFalso.js`), sem rede.
 *
 * A escrita (fase 3) passa duas vezes pela trava: `exigirEscrita(codigo)` (ML_PUBLICACAO e a lista
 * ML_PUBLICACAO_CODIGOS), chamada ANTES da primeira escrita para a recusa nao deixar meia
 * publicacao, e de novo em `chamar` (todo nao-GET exige ML_PUBLICACAO).
 *
 * @returns {{
 *   get: typeof mlGet, usuarioId: typeof obterUsuarioId,
 *   post: typeof mlPost, put: typeof mlPut, upload: typeof mlUpload,
 *   exigirEscrita: (codigo: string) => void,
 * }}
 */
export function clienteML() {
  return {
    get: mlGet,
    usuarioId: obterUsuarioId,
    post: mlPost,
    put: mlPut,
    upload: mlUpload,
    exigirEscrita(codigo) {
      exigirTravaLiberada("MERCADO_LIVRE");
      exigirCodigoLiberado(codigo, config.travas.mlCodigosLiberados, "ML_PUBLICACAO_CODIGOS");
    },
  };
}
