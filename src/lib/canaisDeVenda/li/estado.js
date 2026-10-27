import { assinaturaLI, normalizarDoRiseLI } from "./campos";
import { rascunhoDoAnuncio } from "./banco";
import { alertaDoMonitorLI } from "./alertaNaLoja";
import { ROTULO_DA_ETAPA_LI } from "./etapasCadastro";
import { fotosMudaramLI } from "./fotos";

export { produtoIdValido } from "@/lib/blingSync/estado";

/**
 * O icone da Loja Integrada na lista de Produtos, no molde do Bling: a COR diz se o produto ja
 * foi sincronizado (cinza nunca, verde ja) e o SELO "!" diz que o Rise mudou desde o ultimo envio
 * (a assinatura atual difere da guardada em `Anuncio.hashConteudo`). Sai so do banco, sem chamar
 * a LI. Produto nao Conferido fica cinza e sem selo: nada vai para a loja enquanto nao for.
 *
 * Verde exige TAMBEM o produto vinculado ao Bling (`blingId`; decisao do dono em 07/10/2026): e o Bling
 * que controla o estoque e recebe os pedidos da LI, entao produto so na LI ainda nao esta "em dia".
 * Fica cinza com `semBling`, e o texto do icone diz por que.
 * So servidor (a assinatura usa `node:crypto`).
 */
export function estadoDoIconeLI({ conferido, sincronizadoEm, assinaturaGuardada, assinaturaAtual, vinculadoAoBling }) {
  const semBling = Boolean(conferido) && !vinculadoAoBling;
  if (!conferido || !sincronizadoEm) return { cor: "cinza", divergente: false, conferido: Boolean(conferido), semBling };
  const divergente = Boolean(assinaturaGuardada) && assinaturaGuardada !== assinaturaAtual;
  return { cor: semBling ? "cinza" : "verde", divergente, conferido: true, semBling };
}

/**
 * O cadastro automatico que parou numa etapa (`dados.cadastroLI`, 24/10/2026) acende o "!" tambem, com a etapa no
 * texto do icone. A chave `incompleto` so aparece com falha gravada.
 */
function cadastroIncompleto(anuncioLI) {
  const etapa = anuncioLI?.dados?.cadastroLI?.etapa;
  return etapa ? { incompleto: { etapa, rotulo: ROTULO_DA_ETAPA_LI[etapa] ?? etapa } } : {};
}

/** A assinatura atual e montada como o envio a grava: produto + rascunho + documentos. */
export function iconeLIDoProduto(produto, anuncioLI, { documentos = [] } = {}) {
  const vinculadoAoBling = Boolean(produto?.blingId);
  if (!anuncioLI) return estadoDoIconeLI({ conferido: produto?.conferido, sincronizadoEm: null, vinculadoAoBling });
  const atual = assinaturaLI(normalizarDoRiseLI(produto, rascunhoDoAnuncio(anuncioLI, produto), { documentos }));
  return {
    ...estadoDoIconeLI({
      conferido: produto?.conferido,
      vinculadoAoBling,
      sincronizadoEm: anuncioLI.sincronizadoEm,
      assinaturaGuardada: anuncioLI.hashConteudo,
      assinaturaAtual: atual,
    }),
    ...cadastroIncompleto(anuncioLI),
    // As fotos do produto mudaram depois do ultimo envio (27/10/2026): `produto.arquivos` vem do INCLUDE_DO_ICONE_BLING.
    // So conta com o produto ja sincronizado e Conferido (o resto do icone ja e cinza e sem selo).
    ...(produto?.conferido && anuncioLI.sincronizadoEm && fotosMudaramLI(produto?.arquivos, anuncioLI.dados) ? { fotosMudaram: true } : {}),
    // O que o worker leu na loja e nao bate com o Rise (25/10/2026): so aparece com o monitor gravado.
    ...alertaDoMonitorLI(anuncioLI.dados?.monitorLI ?? null),
  };
}
