import { prisma } from "@/lib/db";
import { iconeBlingDoProduto, INCLUDE_DO_ICONE_BLING } from "@/lib/blingSync/estado";

/**
 * A situacao de um produto para a proposta de anuncio (spec 2026-10-23, secao 6.1): o que falta e qual e o proximo passo.
 * A inteligencia do "proximo passo" mora AQUI, e nao na LLM: trocar de assistente tem que dar o mesmo resultado (a mesma
 * regra do roteiro unico da proposta de produto). LI antes do ML e so a ordem preferida; o "pule a LI" e pedido do dono
 * na conversa, e a gravacao do ML nao exige a LI.
 */

const MOTIVOS = {
  "proposta-do-produto": "O produto ainda não foi Conferido no Rise: o próximo passo é a proposta de cadastro do produto.",
  "conferir-no-rise": "A proposta de cadastro do produto está pronta e espera o dono aplicar e marcar Conferido no Rise.",
  "sincronizar-bling": "O produto não está igual no Bling (ícone do Bling sem sincronizar ou com \"!\"): o dono sincroniza com o Bling antes.",
  "revisar-li": "A proposta da Loja Integrada está pronta e espera o dono revisar e sincronizar no editor da LI.",
  "proposta-li": "Rise e Bling estão em dia: o próximo passo é a proposta do anúncio da Loja Integrada.",
  "revisar-ml": "A proposta do Mercado Livre está pronta e espera o dono revisar e publicar no editor do ML.",
  "proposta-ml": "A Loja Integrada está sincronizada: o próximo passo é a proposta do anúncio do Mercado Livre (Clássico).",
  pronto: "O produto já tem anúncio na Loja Integrada e no Mercado Livre: nada a propor.",
};

/**
 * Pura. A ordem e a da spec: Rise, Bling, LI, ML.
 *
 * @param {{ rise: { conferido: boolean, propostaPendente: boolean }, bling: { verde: boolean },
 *   li: { anuncio: "nenhum"|"rascunho"|"sincronizado", propostaPendente: boolean },
 *   ml: { anuncios: { status: string }[], propostaPendente: boolean } }} situacao
 * @returns {{ passo: string, motivo: string }}
 */
export function proximoPasso(situacao) {
  const passo = (() => {
    if (!situacao?.rise?.conferido) return situacao?.rise?.propostaPendente ? "conferir-no-rise" : "proposta-do-produto";
    if (!situacao?.bling?.verde) return "sincronizar-bling";
    if (situacao?.li?.propostaPendente) return "revisar-li";
    if (situacao?.li?.anuncio !== "sincronizado") return "proposta-li";
    if (situacao?.ml?.propostaPendente) return "revisar-ml";
    if (!(situacao?.ml?.anuncios ?? []).some((anuncio) => anuncio.status === "PUBLICADO")) return "proposta-ml";
    return "pronto";
  })();
  return { passo, motivo: MOTIVOS[passo] };
}

/** O Bling verde: ja sincronizado e sem o "!" (o mesmo icone da lista de Produtos). */
export function blingVerde(produto) {
  const icone = iconeBlingDoProduto(produto);
  return { sincronizado: icone.cor === "verde", diferente: icone.motivos ?? [], verde: icone.cor === "verde" && !icone.divergente };
}

/** `null` quando o SKU nao existe. Le so o banco do Rise (nenhum canal). */
export async function lerSituacaoDoProduto(sku) {
  const produto = await prisma.produto.findUnique({
    where: { sku },
    include: {
      ...INCLUDE_DO_ICONE_BLING,
      proposta: { select: { id: true } },
      anuncios: {
        where: { canal: { in: ["LOJA_INTEGRADA", "MERCADO_LIVRE"] } },
        select: { id: true, canal: true, status: true, idExterno: true, sincronizadoEm: true, dados: true },
      },
    },
  });
  if (!produto) return null;

  const li = produto.anuncios.find((anuncio) => anuncio.canal === "LOJA_INTEGRADA");
  const ml = produto.anuncios.filter((anuncio) => anuncio.canal === "MERCADO_LIVRE");
  return {
    sku: produto.sku,
    nome: produto.tituloBase,
    rise: { conferido: Boolean(produto.conferido), propostaPendente: Boolean(produto.proposta) },
    bling: blingVerde(produto),
    li: {
      anuncio: !li ? "nenhum" : li.idExterno && li.sincronizadoEm ? "sincronizado" : "rascunho",
      propostaPendente: Boolean(li?.dados?.proposta),
    },
    ml: {
      anuncios: ml.map((anuncio) => ({ id: anuncio.id, tipo: anuncio.dados?.tipoAnuncio ?? null, status: anuncio.status })),
      propostaPendente: ml.some((anuncio) => Boolean(anuncio.dados?.proposta)),
    },
  };
}
