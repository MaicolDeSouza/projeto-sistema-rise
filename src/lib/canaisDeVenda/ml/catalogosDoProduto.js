import { prisma } from "@/lib/db";

import { catalogosDosMeusAnuncios } from "./catalogo";
import { acompanharCatalogoML, seguirCatalogoDosAnuncios } from "./concorrentes";
import { catalogoParaAcompanhar, juntarCatalogos } from "./estadoNoML";
import { relerEstadosML } from "./relerEstadoML";

/**
 * "O meu produto esta em algum catalogo?" agora, no ML (pedido do dono em 26/10/2026: botao na aba Catalogo, e de
 * preferencia sem precisar aperta-lo). Fora de `concorrentes.js` porque `relerEstadoML.js` ja importa de la.
 *
 * 1. Rele o estado dos anuncios que o Rise publicou deste produto (grava `estadoML.catalogo`, como a rodada de hora em hora).
 * 2. Procura TODOS os anuncios do dono com o SKU do produto (`seller_sku`), inclusive os que o Rise nao publicou.
 * 3. Junta os dois e, com `acompanhar`, passa a acompanhar o primeiro catalogo se o acompanhado nao for um deles.
 * So GET no ML. 401/429 voltam como erro, sem acompanhar nada.
 */
export async function buscarCatalogosDoProduto(cliente, produtoId, { acompanhar = true, agora = new Date(), bling } = {}) {
  const produto = await prisma.produto.findUnique({
    where: { id: produtoId },
    select: {
      sku: true,
      conferido: true,
      mlCatalogoId: true,
      anuncios: { where: { canal: "MERCADO_LIVRE", status: "PUBLICADO", idExterno: { not: null } }, select: { id: true } },
    },
  });
  if (!produto) return { ok: false, erro: "Produto não encontrado. Ele pode ter sido excluído." };

  if (produto.anuncios.length > 0) {
    const relido = await relerEstadosML({ ml: cliente, bling, agora, anuncioIds: produto.anuncios.map((anuncio) => anuncio.id), espera: 0, seguirCatalogo: false });
    if (relido.parou) return { ok: false, erro: `O Mercado Livre recusou a leitura (${relido.parou}). Tente de novo em alguns minutos.` };
  }
  let peloSku;
  try {
    peloSku = await catalogosDosMeusAnuncios(cliente, produto.sku);
  } catch (erro) {
    return { ok: false, erro: `Não foi possível procurar seus anúncios no Mercado Livre${erro?.status ? ` (HTTP ${erro.status})` : ""}.` };
  }

  const doRise = await seguirCatalogoDosAnuncios(cliente, produtoId, { acompanhar: false });
  const catalogos = juntarCatalogos(doRise.catalogos, peloSku);
  const novo = acompanhar && produto.conferido ? catalogoParaAcompanhar(produto.mlCatalogoId, catalogos) : null;
  let aviso = null;
  if (novo) {
    const feito = await acompanharCatalogoML(cliente, produtoId, { catalogoId: novo.id, catalogoNome: novo.nome }, { agora }).catch((erro) => ({ ok: false, erro: erro?.message ?? String(erro) }));
    if (!feito.ok) aviso = feito.erro;
  }
  return { ok: true, catalogos, buscadoEm: agora, aviso };
}
