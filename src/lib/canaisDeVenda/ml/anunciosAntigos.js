/**
 * Os anuncios ANTIGOS da conta do ML que o Rise ainda nao tem (pedido do dono em 09/11/2026: "verifique os produtos que ja
 * foram validados, se os mesmos tem anuncios ja no ML; caso tenha anuncios antigos deve ligar ! para eu possa reaproveitar
 * os mesmos, pois na regra do ML nao pode ter anuncios duplicados"). Varredura provisoria, ate alinhar todos os anuncios: o
 * dono clica o botao "Verificar anuncios antigos" da lista do ML (sem rotina no worker, decisao dele).
 *
 * Le a conta INTEIRA de uma vez (os ids pelo `search_type=scan` e os anuncios de 20 em 20 pelo `/items/bulk`, ~60 chamadas
 * para ~1.000 anuncios), em vez de buscar produto a produto pelo `seller_sku` (~17 buscas por produto). Casa pelo codigo do
 * anuncio com os produtos CONFERIDOS: o SKU e o anuncio de 1 unidade, `{sku}_{N}` e o kit de N (qualquer N >= 2, a regra do
 * Reaproveitar). Grava em `AnuncioForaDoRiseML`, trocada inteira a cada verificacao; o icone do ML acende o "!" por ela e o
 * Reaproveitar apaga a linha do MLB. So GET no ML. Desenho: docs/superpowers/specs/2026-11-09-anuncios-antigos-ml-design.md.
 */

import { prisma } from "@/lib/db";
import { clienteML } from "./cliente";
import { codigoDoItem, kitDoCodigo } from "./reaproveitar";
import { textoDaRecusaML } from "./respostas";

const POR_LOTE = 20;
const POR_PAGINA = 100;
// 100 paginas de 100 = 10.000 anuncios: freio para uma resposta que nunca acaba, nao uma cota (a conta tem ~1.000).
const TETO_DE_PAGINAS = 100;
const ESPERA_ENTRE_LOTES_MS = 300;
const CAMPOS = "body.id,body.title,body.price,body.status,body.sold_quantity,body.listing_type_id,body.shipping,body.seller_custom_field,body.attributes,body.permalink";
const esperarPadrao = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Puro. Os anuncios da conta que viram linha: nao encerrados (`closed` o ML nao reabre), fora do Rise (`idsDoRise`) e cujo
 * codigo (`seller_custom_field` ou o atributo SELLER_SKU) e o SKU de um produto da lista (kit 1) ou `{sku}_{N}` com N >= 2.
 * Sem caixa. `_1` e codigo de outro produto nao entram.
 * @param {object[]} itens os anuncios lidos do ML
 * @param {{ produtos: {id: string, sku: string}[], idsDoRise: Set<string> }} contexto
 */
export function casarAnunciosDaConta(itens, { produtos, idsDoRise }) {
  const porSku = new Map((produtos ?? []).map((produto) => [String(produto.sku ?? "").trim().toUpperCase(), produto]));
  const linhas = [];
  for (const item of Array.isArray(itens) ? itens : []) {
    if (!item?.id || item.status === "closed" || idsDoRise?.has?.(item.id)) continue;
    const codigo = codigoDoItem(item).toUpperCase();
    if (!codigo) continue;
    let produto = porSku.get(codigo) ?? null;
    let kit = 1;
    if (!produto) {
      const achou = codigo.match(/^(.+)_(\d{1,4})$/);
      const base = achou ? (porSku.get(achou[1]) ?? null) : null;
      const quantidade = base ? kitDoCodigo(codigo, base.sku) : null;
      if (!base || !quantidade || quantidade < 2) continue;
      produto = base;
      kit = quantidade;
    }
    const preco = Number(item.price);
    linhas.push({
      itemId: String(item.id),
      produtoId: produto.id,
      kit,
      titulo: String(item.title ?? ""),
      preco: Number.isFinite(preco) ? preco : null,
      tipoAnuncio: item.listing_type_id ?? null,
      freteGratis: Boolean(item.shipping?.free_shipping),
      vendidos: Number(item.sold_quantity ?? 0),
      status: item.status ?? null,
      link: item.permalink ?? null,
    });
  }
  return linhas;
}

/**
 * Puro. Marca `duplicado` nos anuncios da conta cuja variante o Rise ja tem (a linha do popup avisa antes do Reaproveitar,
 * porque o ML nao aceita anuncio duplicado): o kit com o mesmo N, ou o de 1 unidade com o mesmo tipo e frete. Anuncio do Rise
 * encerrado nao conta.
 * @param {{kit: number|null, tipoAnuncio?: string, freteGratis?: boolean}[]} candidatos os de `candidatosParaReaproveitar`
 * @param {{codigo: string, sku: string, tipoAnuncio?: string, freteGratis?: boolean, situacaoCanal?: string}[]} doRise
 */
export function marcarDuplicados(candidatos, doRise) {
  const ativos = (Array.isArray(doRise) ? doRise : []).filter((anuncio) => anuncio?.situacaoCanal !== "ENCERRADA");
  const kitDaLinha = (anuncio) => kitDoCodigo(anuncio.codigo, anuncio.sku) ?? 1;
  const kits = new Set(ativos.map(kitDaLinha).filter((quantidade) => quantidade >= 2));
  return (Array.isArray(candidatos) ? candidatos : []).map((candidato) => ({
    ...candidato,
    duplicado: candidato.kit
      ? kits.has(candidato.kit)
      : ativos.some((anuncio) => kitDaLinha(anuncio) === 1 && anuncio.tipoAnuncio === candidato.tipoAnuncio && Boolean(anuncio.freteGratis) === Boolean(candidato.freteGratis)),
  }));
}

/** Os ids de todos os anuncios da conta (`search_type=scan`: a pagina seguinte pelo `scroll_id`, ate vir vazia). */
async function idsDaConta(ml) {
  const caminho = `/users/${encodeURIComponent(String(await ml.usuarioId()))}/items/search`;
  const ids = new Set();
  let scroll = null;
  for (let pagina = 0; pagina < TETO_DE_PAGINAS; pagina += 1) {
    const resposta = await ml.get(caminho, scroll ? { search_type: "scan", limit: POR_PAGINA, scroll_id: scroll } : { search_type: "scan", limit: POR_PAGINA });
    if (!resposta?.ok) return { ok: false, erro: textoDaRecusaML(resposta, "a lista de anúncios da conta") };
    const resultados = Array.isArray(resposta.dados?.results) ? resposta.dados.results : [];
    if (resultados.length === 0) break;
    for (const id of resultados) ids.add(String(id));
    scroll = resposta.dados?.scroll_id ?? null;
    if (!scroll) break;
  }
  return { ok: true, ids: [...ids] };
}

/**
 * O botao "Verificar anuncios antigos": le a conta, casa com os produtos conferidos e troca a tabela inteira. Falha na lista
 * ou num lote para sem mexer na tabela (uma verificacao pela metade apagaria "!" de verdade). Nunca lanca.
 * @returns {Promise<{ok: boolean, erro?: string, lidos?: number, foraDoRise?: number, produtos?: number, semResposta?: number}>}
 */
export async function verificarAnunciosAntigosML({ ml = null, esperar = esperarPadrao, agora = new Date() } = {}) {
  try {
    const cliente = ml ?? clienteML();
    const lista = await idsDaConta(cliente);
    if (!lista.ok) return lista;
    const itens = [];
    let semResposta = 0;
    for (let inicio = 0; inicio < lista.ids.length; inicio += POR_LOTE) {
      if (inicio > 0) await esperar(ESPERA_ENTRE_LOTES_MS);
      const lote = lista.ids.slice(inicio, inicio + POR_LOTE);
      const resposta = await cliente.get("/items/bulk", { ids: lote.join(","), attributes: CAMPOS });
      if (!resposta?.ok) return { ok: false, erro: textoDaRecusaML(resposta, "a leitura dos anúncios da conta") };
      // Com `attributes`, o ML devolve so o `body` de quem respondeu; quem nao respondeu vem sem `body` e fica de fora.
      const corpos = (Array.isArray(resposta.dados) ? resposta.dados : []).map((linha) => linha?.body).filter((corpo) => corpo?.id);
      semResposta += lote.length - corpos.length;
      itens.push(...corpos);
    }
    const [produtos, doRise] = await Promise.all([
      prisma.produto.findMany({ where: { conferido: true }, select: { id: true, sku: true } }),
      prisma.anuncio.findMany({ where: { canal: "MERCADO_LIVRE", idExterno: { not: null } }, select: { idExterno: true } }),
    ]);
    const linhas = casarAnunciosDaConta(itens, { produtos, idsDoRise: new Set(doRise.map((anuncio) => anuncio.idExterno)) });
    await prisma.$transaction([prisma.anuncioForaDoRiseML.deleteMany({}), prisma.anuncioForaDoRiseML.createMany({ data: linhas.map((linha) => ({ ...linha, lidoEm: agora })) })]);
    return { ok: true, lidos: itens.length, foraDoRise: linhas.length, produtos: new Set(linhas.map((linha) => linha.produtoId)).size, semResposta };
  } catch (erro) {
    return { ok: false, erro: `Falha ao verificar os anúncios antigos: ${erro?.message ?? erro}` };
  }
}

/**
 * Completa a leitura ao vivo do popup do produto com as linhas que a verificacao da conta gravou (09/11/2026: o 100202 tinha o
 * anuncio antigo so com o codigo do vendedor, que a busca por SKU nao acha, e o popup ficava sem ele enquanto o "!" acendia). Cada
 * linha gravada que a leitura nao trouxe e lida no ML na hora: volta se o anuncio ainda existe, nao esta encerrado e nao e do Rise.
 * Falha de leitura de uma linha so a deixa de fora. Devolve os itens lidos do ML, no mesmo formato de `anunciosDoSkuNaConta`.
 */
export async function completarComLinhasGravadas(ml, produtoId, itens, { idsDoRise = new Set() } = {}) {
  const linhas = await prisma.anuncioForaDoRiseML.findMany({ where: { produtoId }, select: { itemId: true } });
  const jaTem = new Set((itens ?? []).map((item) => String(item.id)));
  const extras = [];
  for (const { itemId } of linhas) {
    if (jaTem.has(itemId) || idsDoRise.has(itemId)) continue;
    const lido = await ml.get(`/items/${encodeURIComponent(itemId)}`).catch(() => null);
    if (lido?.ok && lido.dados?.status !== "closed") extras.push(lido.dados);
  }
  return [...(itens ?? []), ...extras];
}

/**
 * O popup do produto le a conta AO VIVO (`anunciosDoSkuMLAcao`) e acerta as linhas deste produto com o que leu (pedido do dono
 * em 09/11/2026: "Eu exclui manualmente o anuncio pelo ML e o rise nao encontra mais, porem ainda fica com !"): o anuncio que
 * sumiu da conta sai, o que apareceu entra. So do produto conferido, a mesma regra da verificacao. Devolve se mudou algo (a
 * acao entao revalida a lista de Produtos, para o "!" acompanhar).
 * @param {object[]} candidatos os de `candidatosParaReaproveitar` (`id`, `titulo`, `preco`, `kit` null no de 1 unidade...)
 */
export async function sincronizarForaDoRiseDoProduto(produtoId, candidatos, { agora = new Date() } = {}) {
  const produto = await prisma.produto.findUnique({ where: { id: produtoId }, select: { conferido: true } });
  if (!produto?.conferido) return false;
  const novas = (Array.isArray(candidatos) ? candidatos : [])
    .filter((candidato) => candidato?.id && candidato.status !== "closed")
    .map((candidato) => {
      const preco = Number(candidato.preco);
      return {
        itemId: String(candidato.id),
        produtoId,
        kit: candidato.kit ?? 1,
        titulo: String(candidato.titulo ?? ""),
        preco: Number.isFinite(preco) ? preco : null,
        tipoAnuncio: candidato.tipoAnuncio ?? null,
        freteGratis: Boolean(candidato.freteGratis),
        vendidos: Number(candidato.vendidos ?? 0),
        status: candidato.status ?? null,
        link: candidato.link ?? null,
      };
    });
  const atuais = await prisma.anuncioForaDoRiseML.findMany({ where: { produtoId } });
  const chave = (linha) => [linha.itemId, linha.kit, linha.preco === null ? "" : Number(linha.preco), linha.tipoAnuncio, linha.freteGratis, linha.vendidos, linha.status].join("|");
  if (atuais.length === novas.length && atuais.map(chave).sort().join("\n") === novas.map(chave).sort().join("\n")) return false;
  await prisma.$transaction([
    prisma.anuncioForaDoRiseML.deleteMany({ where: { OR: [{ produtoId }, { itemId: { in: novas.map((linha) => linha.itemId) } }] } }),
    prisma.anuncioForaDoRiseML.createMany({ data: novas.map((linha) => ({ ...linha, lidoEm: agora })) }),
  ]);
  return true;
}

/** A ultima verificacao, para o `title` do botao: quando foi e quantos ficaram. `null` sem nenhuma linha gravada. */
export async function ultimaVerificacaoML() {
  const [total, ultima, produtos] = await Promise.all([
    prisma.anuncioForaDoRiseML.count(),
    prisma.anuncioForaDoRiseML.findFirst({ orderBy: { lidoEm: "desc" }, select: { lidoEm: true } }),
    prisma.anuncioForaDoRiseML.groupBy({ by: ["produtoId"] }),
  ]);
  return ultima ? { em: ultima.lidoEm.toISOString(), total, produtos: produtos.length } : null;
}
