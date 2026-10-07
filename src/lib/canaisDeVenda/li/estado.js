import { assinaturaLI, normalizarDoRiseLI } from "./campos";
import { rascunhoDoAnuncio } from "./banco";

export { produtoIdValido } from "@/lib/blingSync/estado";

/**
 * O icone da Loja Integrada na lista de Produtos, no molde do Bling: a COR diz se o produto ja
 * foi sincronizado (cinza nunca, verde ja) e o SELO "!" diz que o Rise mudou desde o ultimo envio
 * (a assinatura atual difere da guardada em `Anuncio.hashConteudo`). Sai so do banco, sem chamar
 * a LI. Produto nao Conferido fica cinza e sem selo: nada vai para a loja enquanto nao for.
 * So servidor (a assinatura usa `node:crypto`).
 */
export function estadoDoIconeLI({ conferido, sincronizadoEm, assinaturaGuardada, assinaturaAtual }) {
  if (!conferido || !sincronizadoEm) return { cor: "cinza", divergente: false, conferido: Boolean(conferido) };
  return { cor: "verde", divergente: Boolean(assinaturaGuardada) && assinaturaGuardada !== assinaturaAtual, conferido: true };
}

/** A assinatura atual e montada como o envio a grava: produto + rascunho + documentos. */
export function iconeLIDoProduto(produto, anuncioLI, { documentos = [] } = {}) {
  if (!anuncioLI) return estadoDoIconeLI({ conferido: produto?.conferido, sincronizadoEm: null });
  const atual = assinaturaLI(normalizarDoRiseLI(produto, rascunhoDoAnuncio(anuncioLI), { documentos }));
  return estadoDoIconeLI({
    conferido: produto?.conferido,
    sincronizadoEm: anuncioLI.sincronizadoEm,
    assinaturaGuardada: anuncioLI.hashConteudo,
    assinaturaAtual: atual,
  });
}
