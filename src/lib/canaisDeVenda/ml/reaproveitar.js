/**
 * Reaproveitar um anuncio que JA EXISTE na conta do ML (definicao 4 do dono em 08/11/2026, spec
 * docs/superpowers/specs/2026-11-08-anuncios-ml-por-lucro-da-loja-design.md): a conta tem ~1.000 anuncios antigos (ML_4h) e um
 * produto novo no Rise costuma ja ter anuncio la. Em vez de publicar outro, o Rise ADOTA o anuncio: cria o `Anuncio` como
 * PUBLICADO apontando para o MLB, com o preco, o tipo e o frete que estao no ML. Nada e escrito no ML aqui; a impressao
 * (`publicacao.enviado`) nasce sem as partes do produto, entao descricao, fotos e pacote acendem o "!" na primeira abertura e
 * o dono decide o que mandar pelo "Enviar mudancas" de sempre. O vinculo do Bling (ML_4h -> Rise_ML) e outra etapa
 * (`reaproveitado.blingMovidoEm`), pedida por anuncio no envio.
 */

import { prisma } from "@/lib/db";
import { contextoDosProdutos } from "./banco";
import { etapasDoAnuncio } from "./etapas";
import { rascunhoInicial } from "./rascunho";
import { textoDaRecusaML } from "./respostas";

const CANAL = "MERCADO_LIVRE";

/**
 * Os kits do codigo na conta (dono, 09/11/2026: o 910207 tinha o kit "20x" com o codigo 910207_20 e a proposta nao achou,
 * porque a busca do ML por `seller_sku` so devolve o codigo EXATO). O kit no ML do Rise usa `{sku}_{N}` (`codigoDaComposicao`),
 * e os antigos da conta seguem o mesmo padrao: a busca pede estas quantidades, e a pesquisa pelo titulo pega a que ficar fora.
 */
export const QUANTIDADES_DE_KIT = [2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30, 40, 50, 100];

/** Puro. 1 quando o codigo do anuncio e o do produto, N quando e `{sku}_{N}` (N >= 2), null quando e de outro produto. */
export function kitDoCodigo(codigoDoAnuncio, sku) {
  const codigo = String(codigoDoAnuncio ?? "").trim().toUpperCase();
  const base = String(sku ?? "").trim().toUpperCase();
  if (!codigo || !base) return null;
  if (codigo === base) return 1;
  if (!codigo.startsWith(`${base}_`)) return null;
  const resto = codigo.slice(base.length + 1);
  const quantidade = /^\d{1,4}$/.test(resto) ? Number(resto) : NaN;
  return Number.isInteger(quantidade) && quantidade >= 2 ? quantidade : null;
}

/** O codigo do vendedor no item: `seller_custom_field`, ou o atributo SELLER_SKU (o modelo User Products guarda la). */
export function codigoDoItem(item) {
  const campo = String(item?.seller_custom_field ?? "").trim();
  if (campo) return campo;
  return String((item?.attributes ?? []).find((atributo) => atributo?.id === "SELLER_SKU")?.value_name ?? "").trim();
}

/**
 * Puro. Os itens do SKU que o Rise pode adotar: fora os que ja sao do Rise e os encerrados (`closed`, que o ML nao reabre).
 * Ordem: ativo primeiro, depois quem vendeu mais, para o mais provavel ficar no topo da lista.
 */
export function candidatosParaReaproveitar(itens, { idsDoRise, sku = null }) {
  const peso = (item) => (item.status === "active" ? 0 : 1);
  return (Array.isArray(itens) ? itens : [])
    .filter((item) => item && item.id && item.status !== "closed" && !idsDoRise?.has?.(item.id))
    .sort((a, b) => peso(a) - peso(b) || Number(b.sold_quantity ?? 0) - Number(a.sold_quantity ?? 0))
    .map((item) => ({
      id: item.id,
      titulo: item.title ?? "",
      preco: Number(item.price),
      tipoAnuncio: item.listing_type_id ?? null,
      freteGratis: Boolean(item.shipping?.free_shipping),
      vendidos: Number(item.sold_quantity ?? 0),
      catalogo: Boolean(item.catalog_listing),
      status: item.status ?? null,
      link: item.permalink ?? null,
      categoriaId: item.category_id ?? null,
      // A quantidade do kit pelo codigo (`{sku}_{N}`); null no anuncio de 1 unidade (ou sem o sku para comparar).
      kit: (() => {
        const quantidade = sku ? kitDoCodigo(codigoDoItem(item), sku) : null;
        return quantidade && quantidade >= 2 ? quantidade : null;
      })(),
    }));
}

/**
 * Os anuncios do SKU na conta, lidos um a um (a busca so devolve ids), como `outrosAnunciosDoAnuncio`. Nunca lanca.
 * Desde 09/11/2026 traz tambem os KITS do codigo (`{sku}_{N}`): a busca do codigo exato decide (falhou, erro); as dos codigos
 * de kit e a pesquisa pelo `titulo` (para a quantidade fora da lista) so somam, e a falha delas e ignorada. So fica o item cujo
 * codigo e o do produto ou `{sku}_{N}` (`kitDoCodigo`): a pesquisa pelo titulo traz produtos parecidos.
 */
export async function anunciosDoSkuNaConta(ml, sku, { titulo = "" } = {}) {
  const codigo = String(sku ?? "").trim();
  if (!codigo) return { ok: false, erro: "O produto está sem código (SKU)." };
  try {
    const eu = await ml.usuarioId();
    const caminho = `/users/${encodeURIComponent(String(eu))}/items/search`;
    const busca = await ml.get(caminho, { seller_sku: codigo, limit: 50 });
    if (!busca?.ok) return { ok: false, erro: textoDaRecusaML(busca, `a busca dos anúncios do SKU ${codigo}`) };
    const ids = new Set(busca.dados?.results ?? []);
    const extras = QUANTIDADES_DE_KIT.map((quantidade) => ({ seller_sku: `${codigo}_${quantidade}`, limit: 50 }));
    const pesquisa = String(titulo ?? "").trim().slice(0, 60);
    if (pesquisa) extras.push({ q: pesquisa, limit: 50 });
    for (const filtro of extras) {
      try {
        const achou = await ml.get(caminho, filtro);
        if (achou?.ok) for (const id of achou.dados?.results ?? []) ids.add(id);
      } catch {
        // A busca extra so soma: a do codigo exato ja respondeu.
      }
    }
    const itens = [];
    for (const id of ids) {
      const lido = await ml.get(`/items/${encodeURIComponent(String(id))}`);
      if (lido?.ok && kitDoCodigo(codigoDoItem(lido.dados), codigo) !== null) itens.push(lido.dados);
    }
    return { ok: true, itens };
  } catch (erro) {
    return { ok: false, erro: `Falha ao falar com o Mercado Livre: ${erro?.message ?? erro}` };
  }
}

/**
 * Adota o item `itemId` do ML como anuncio PUBLICADO do produto. Rele o item na hora (o popup pode estar velho) e recusa o
 * encerrado, o de outro SKU (`seller_custom_field` diferente) e o MLB que ja esta no Rise. `{ ok, anuncioId }`; nunca lanca.
 */
export async function reaproveitarAnuncioML(produtoId, itemId, { ml }) {
  const mlb = String(itemId ?? "").trim();
  const produtos = await contextoDosProdutos([produtoId]);
  const principal = produtos[produtoId];
  if (!principal) return { ok: false, erro: "Produto não encontrado." };
  const jaNoRise = await prisma.anuncio.findFirst({ where: { canal: CANAL, idExterno: mlb }, select: { id: true } });
  if (jaNoRise) return { ok: false, erro: `O anúncio ${mlb} já está no Rise.` };
  let item;
  try {
    const lido = await ml.get(`/items/${encodeURIComponent(mlb)}`);
    if (!lido?.ok) return { ok: false, erro: textoDaRecusaML(lido, `a leitura do anúncio ${mlb}`) };
    item = lido.dados ?? {};
  } catch (erro) {
    return { ok: false, erro: `Falha ao falar com o Mercado Livre: ${erro?.message ?? erro}` };
  }
  if (item.status === "closed") return { ok: false, erro: `O anúncio ${mlb} está encerrado no ML e não pode ser reaproveitado.` };
  // O codigo do produto (1 unidade) ou `{sku}_{N}` (o kit de N, desde 09/11/2026); outro codigo recusa.
  const doItem = codigoDoItem(item);
  const quantidade = kitDoCodigo(doItem, principal.sku);
  if (quantidade === null) return { ok: false, erro: `O anúncio ${mlb} é do SKU "${doItem}", não de ${principal.sku}.` };
  const kit = quantidade >= 2;
  // O kit vira o Kit de N do produto base (o kit no ML do Rise), com o codigo do anuncio; o produto do kit no Bling e lido
  // pelo codigo no "Mover" do Enviar mudancas, como no simples.
  const composicao = kit ? { itens: [{ produtoId, quantidade }], codigo: `${principal.sku}_${quantidade}`, blingProdutoId: null } : null;

  const base = rascunhoInicial({ principal, produtosPorId: produtos, composicao });
  const { produtoId: _produtoId, titulo: _titulo, descricao, atributos, categoriaId: _categoriaId, atacado: _atacado, ...dados } = base;
  const preco = Number(item.price);
  const agora = new Date().toISOString();
  const publicacao = {
    itemId: mlb,
    permalink: item.permalink ?? null,
    statusML: item.status ?? null,
    incerta: false,
    fotos: {},
    feitas: etapasDoAnuncio({ kit }),
    criadoCom: null,
    reaproveitado: { em: agora, blingMovidoEm: null },
    // So as partes do anuncio: sem as do produto a impressao e "nao conferida" e o editor acende descricao, fotos e pacote.
    // `precoDaLoja: null` acende o "preco da loja mudou" de cara: o preco do ML veio de antes da regra do lucro da loja, e
    // a parte `preco` nao serve para isso (compara o preco do editor com o do ML, que sao o mesmo numero aqui).
    enviado: { titulo: item.title ?? "", preco, ficha: [], prazo: null, precoDaLoja: null },
  };
  const criado = await prisma.anuncio.create({
    data: {
      produtoId,
      canal: CANAL,
      status: "PUBLICADO",
      titulo: item.title ?? "",
      descricao,
      atributos,
      categoriaExternaId: item.category_id ?? null,
      idExterno: mlb,
      urlExterna: item.permalink ?? null,
      temVendas: Number(item.sold_quantity ?? 0) > 0,
      publicadoEm: item.date_created ? new Date(item.date_created) : new Date(),
      dados: {
        ...dados,
        familyName: item.family_name ?? dados.familyName,
        tipoAnuncio: item.listing_type_id ?? dados.tipoAnuncio,
        envio: { ...dados.envio, freteGratis: Boolean(item.shipping?.free_shipping) },
        // O anuncio que a conta ja tinha nao tem faixas de atacado no ML: abre desligado (regra 3, 08/11/2026); ligar e do dono.
        atacado: { ligado: false, faixas: [] },
        preco: Number.isFinite(preco) ? preco : dados.preco,
        publicacao,
      },
    },
    select: { id: true },
  });
  return { ok: true, anuncioId: criado.id };
}
