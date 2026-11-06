/**
 * Os OUTROS anuncios do ML com o mesmo SKU de um anuncio do Rise, e igualar o preco deles ao do Rise (pedido do dono em
 * 05/11/2026: "padronizar essa verificacao ao publicar novo anuncio. Verificar se tem outro anuncio; caso tenha, abrir popup
 * para eu escolher se quero ou nao alterar o preco do outro anuncio"). O mesmo trabalho do `scripts/ml-igualar-antigos.js`,
 * agora um anuncio por vez, logo depois do Publicar.
 *
 * "Outro" = anuncio da conta com o mesmo `seller_sku`, que NAO e um anuncio do Rise (o do Rise tem o preco dele no editor; o
 * dono pediu os antigos) e nao esta encerrado nem inativo. So o preco muda: titulo, ficha e fotos dos antigos ficam. O
 * vinculo fiscal o ML ja faz sozinho pelo SKU (46 de 48 medidos em 05/11/2026).
 */

import { prisma } from "@/lib/db";
import { anuncioComPlano } from "./fiscalNoML";
import { textoDaRecusaML } from "./respostas";

const FORA = new Set(["closed", "inactive"]);

/**
 * Regra pura: dos anuncios lidos do ML, os que entram no popup. Tira o proprio, os do Rise e os encerrados, e marca quem ja
 * tem o mesmo preco (`igual`). Ordem: os de preco diferente primeiro.
 */
export function outrosParaIgualar(itens, { itemId, idsDoRise, preco }) {
  return itens
    .filter((item) => item?.id && item.id !== itemId && !idsDoRise.has(item.id) && !FORA.has(item.status))
    .map((item) => {
      const precos = item.variations?.length ? item.variations.map((v) => Number(v.price)) : [Number(item.price)];
      return {
        id: item.id,
        titulo: String(item.title ?? ""),
        preco: precos[0],
        status: item.status,
        premium: item.listing_type_id === "gold_pro",
        catalogo: Boolean(item.catalog_listing),
        vendidos: Number(item.sold_quantity ?? 0),
        link: item.permalink ?? null,
        variacoes: item.variations?.length ? item.variations.map((v) => v.id) : [],
        igual: precos.every((p) => p === preco),
      };
    })
    .sort((a, b) => Number(a.igual) - Number(b.igual));
}

/** Le os outros anuncios do SKU do anuncio do Rise. So GET. `{ ok, sku, itemId, preco, outros }` ou `{ ok: false, erro }`. */
export async function outrosAnunciosDoAnuncio(anuncioId, { ml }) {
  const alvo = await anuncioComPlano(anuncioId);
  if (!alvo.ok) return alvo;
  const sku = alvo.plano?.sku;
  if (!sku) return { ok: false, erro: "O anúncio está sem código (SKU)." };
  try {
    const rise = await ml.get(`/items/${alvo.itemId}`);
    if (!rise?.ok) return { ok: false, erro: textoDaRecusaML(rise, `a leitura do anúncio ${alvo.itemId}`) };
    const preco = Number(rise.dados?.price);
    const eu = await ml.usuarioId();
    const busca = await ml.get(`/users/${encodeURIComponent(String(eu))}/items/search`, { seller_sku: sku, limit: 50 });
    if (!busca?.ok) return { ok: false, erro: textoDaRecusaML(busca, `a busca dos anúncios do SKU ${sku}`) };
    const doRise = await prisma.anuncio.findMany({ where: { canal: "MERCADO_LIVRE", idExterno: { not: null } }, select: { idExterno: true } });
    const idsDoRise = new Set(doRise.map((a) => a.idExterno));
    const ids = (busca.dados?.results ?? []).filter((id) => id !== alvo.itemId && !idsDoRise.has(id));
    const itens = [];
    for (const id of ids) {
      const lido = await ml.get(`/items/${id}`);
      if (lido?.ok) itens.push(lido.dados);
    }
    return { ok: true, sku, itemId: alvo.itemId, preco, outros: outrosParaIgualar(itens, { itemId: alvo.itemId, idsDoRise, preco }) };
  } catch (erro) {
    return { ok: false, erro: `Falha ao falar com o Mercado Livre: ${erro?.message ?? erro}` };
  }
}

/**
 * Iguala ao preco do anuncio do Rise os anuncios escolhidos. Rele tudo antes (o preco do Rise e quem e "outro" agora): id que
 * nao estiver entre os outros deste SKU e recusado, para o navegador nao mudar o preco de um anuncio qualquer.
 * `{ ok, preco, feitos: [{ id, de }], falhas: [{ id, erro }] }`. Nunca lanca.
 */
export async function igualarPrecoDosOutros(anuncioId, itemIds, { ml }) {
  const lido = await outrosAnunciosDoAnuncio(anuncioId, { ml });
  if (!lido.ok) return { ...lido, feitos: [], falhas: [] };
  if (!(lido.preco > 0)) return { ok: false, erro: "Não consegui ler o preço do anúncio do Rise no Mercado Livre.", feitos: [], falhas: [] };
  try {
    ml.exigirEscrita(lido.sku);
  } catch (erro) {
    return { ok: false, erro: erro?.message ?? String(erro), feitos: [], falhas: [] };
  }
  const porId = new Map(lido.outros.map((o) => [o.id, o]));
  const feitos = [];
  const falhas = [];
  for (const id of [...new Set(itemIds ?? [])]) {
    const outro = porId.get(id);
    if (!outro) {
      falhas.push({ id, erro: `O anúncio ${id} não é outro anúncio do código ${lido.sku}.` });
      continue;
    }
    if (outro.igual) continue;
    const corpo = outro.variacoes.length ? { variations: outro.variacoes.map((v) => ({ id: v, price: lido.preco })) } : { price: lido.preco };
    try {
      const resposta = await ml.put(`/items/${id}`, corpo);
      if (resposta?.ok) feitos.push({ id, de: outro.preco });
      else falhas.push({ id, erro: textoDaRecusaML(resposta, `o preço do anúncio ${id}`) });
    } catch (erro) {
      falhas.push({ id, erro: `Falha ao falar com o Mercado Livre: ${erro?.message ?? erro}` });
    }
  }
  return { ok: falhas.length === 0, preco: lido.preco, feitos, falhas };
}
