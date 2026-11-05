/**
 * Envio dos dados fiscais do anuncio ao Mercado Livre (05/11/2026; as regras puras estao em `dadosFiscais.js`). Usado pelo
 * Publicar (etapa "fiscal", o anuncio nasce com eles), pelo botao "Enviar dados fiscais" do editor e pelo ajuste dos
 * anuncios que o Rise ja publicou (`scripts/ml-dados-fiscais.js`; os de fora do Rise nao sao mexidos, decisao do dono). Recebe o cliente do ML por parametro (o teste passa o falso).
 *
 * Ordem, cada passo lendo antes de escrever (repetir nao duplica nada):
 *  1. cada SKU do plano (as pecas do kit antes do kit): `GET /items/fiscal_information/{sku}`; 404 cria (`POST`), diferente
 *     corrige (`PUT`), igual nao mexe. O mesmo SKU pode estar em varios anuncios: os dados sao do produto;
 *  2. o vinculo do SKU ao anuncio: `GET /items/{id}/fiscal_information/detail`; sem vinculo (ou com outro SKU),
 *     `POST /items/fiscal_information/items`;
 *  3. `GET /can_invoice/items/{id}`: o que o ML diz no fim ("pode faturar").
 * Medido na conta em 05/11/2026: o 940502 (cadastrado a mao) responde 200 nos tres; o 170102 (ESP32) responde 404.
 */

import { prisma } from "@/lib/db";
import { planoFiscal, fiscalIgual, mesclarComML } from "./dadosFiscais";
import { textoDaRecusaML } from "./respostas";

const CAMPOS_DO_PRODUTO = { id: true, sku: true, tituloBase: true, tipo: true, ncm: true, cest: true, origem: true, tipoProducao: true, ean: true, pesoKg: true, custo: true, precoVenda: true };

const textoDe = (erro) => erro?.message ?? String(erro);

/**
 * O plano fiscal de um anuncio do Rise a partir do rascunho: kit do ML (`composicao`) = bundle das pecas; produto com
 * composicao do cadastro = bundle das pecas dele; produto simples = single.
 */
export async function planoFiscalDoRascunho(rascunho) {
  if (rascunho?.composicao) {
    const itens = (rascunho.composicao.itens ?? []).filter((item) => item?.produtoId);
    const produtos = await prisma.produto.findMany({ where: { id: { in: itens.map((item) => item.produtoId) } }, select: CAMPOS_DO_PRODUTO });
    const porId = new Map(produtos.map((produto) => [produto.id, produto]));
    const principal = porId.get(rascunho.produtoId);
    return planoFiscal({
      sku: rascunho.composicao.codigo,
      titulo: String(rascunho.titulo ?? "").trim() || principal?.tituloBase,
      pecas: itens.map((item) => ({ produto: porId.get(item.produtoId), quantidade: Number(item.quantidade) })),
    });
  }
  return planoFiscalDoProduto({ id: rascunho?.produtoId });
}

/** O plano fiscal de um produto do Rise, pelo id ou pelo SKU. Produto com composicao vira bundle das pecas dele. */
export async function planoFiscalDoProduto({ id = null, sku = null }) {
  const where = id ? { id } : sku ? { sku } : null;
  const produto = where
    ? await prisma.produto.findUnique({
        where,
        select: { ...CAMPOS_DO_PRODUTO, componentes: { orderBy: { ordem: "asc" }, select: { quantidade: true, componente: { select: CAMPOS_DO_PRODUTO } } } },
      })
    : null;
  if (!produto) return { ok: false, sku: sku ?? "", corpos: [], problemas: [sku ? `O produto ${sku} não está cadastrado no Rise.` : "O produto não está cadastrado no Rise."] };
  if (produto.tipo === "COMPOSICAO") {
    return planoFiscal({ sku: produto.sku, titulo: produto.tituloBase, pecas: produto.componentes.map((c) => ({ produto: c.componente, quantidade: c.quantidade })) });
  }
  return planoFiscal({ sku: produto.sku, produto });
}

/**
 * O plano de um SKU: o produto do Rise com esse codigo, ou o kit do ML gravado num anuncio do Rise com esse codigo de kit.
 * So o que o Rise conhece: anuncio de fora do Rise nao e mexido (decisao do dono em 05/11/2026).
 */
export async function planoFiscalDoSku(sku) {
  const codigo = String(sku ?? "").trim();
  if (!codigo) return { ok: false, sku: "", corpos: [], problemas: ["Anúncio sem SKU no Mercado Livre."] };
  const produto = await prisma.produto.findUnique({ where: { sku: codigo }, select: { id: true } });
  if (produto) return planoFiscalDoProduto({ id: produto.id });
  const anuncio = await prisma.anuncio.findFirst({
    where: { canal: "MERCADO_LIVRE", dados: { path: ["composicao", "codigo"], equals: codigo } },
    select: { produtoId: true, dados: true },
  });
  if (anuncio?.dados?.composicao) {
    return planoFiscalDoRascunho({ produtoId: anuncio.produtoId, titulo: anuncio.dados.titulo, composicao: anuncio.dados.composicao });
  }
  return { ok: false, sku: codigo, corpos: [], problemas: [`O SKU ${codigo} não é produto nem kit do Rise.`] };
}

/** Le os dados fiscais do SKU no ML: `{ ok, existe, dados }` ou `{ ok: false, erro }`. */
async function lerSku(ml, sku) {
  const resposta = await ml.get(`/items/fiscal_information/${encodeURIComponent(sku)}`);
  if (resposta?.ok) return { ok: true, existe: true, dados: resposta.dados };
  if (resposta?.status === 404) return { ok: true, existe: false, dados: null };
  return { ok: false, erro: textoDaRecusaML(resposta, `a leitura dos dados fiscais do SKU ${sku}`) };
}

/** Cria ou corrige um SKU. Devolve `{ ok, acao: "criado"|"corrigido"|"igual", erro? }`. `simular`: so le. */
async function garantirSku(ml, corpoDoRise, simular) {
  const lido = await lerSku(ml, corpoDoRise.sku);
  if (!lido.ok) return lido;
  const corpo = mesclarComML(lido.dados, corpoDoRise);
  if (lido.existe && fiscalIgual(lido.dados, corpo)) return { ok: true, acao: "igual" };
  if (simular) return { ok: true, acao: lido.existe ? "corrigido" : "criado" };
  if (!lido.existe) {
    const resposta = await ml.post("/items/fiscal_information", corpo);
    return resposta?.ok ? { ok: true, acao: "criado" } : { ok: false, erro: textoDaRecusaML(resposta, `os dados fiscais do SKU ${corpo.sku}`) };
  }
  // O PUT leva o corpo inteiro, menos o SKU (que vai no caminho).
  const { sku, ...resto } = corpo;
  const resposta = await ml.put(`/items/fiscal_information/${encodeURIComponent(sku)}`, resto);
  return resposta?.ok ? { ok: true, acao: "corrigido" } : { ok: false, erro: textoDaRecusaML(resposta, `a correção dos dados fiscais do SKU ${sku}`) };
}

/**
 * Garante os dados fiscais de um anuncio publicado no ML. `plano` vem de `planoFiscalDo*`. Nunca lanca.
 * Devolve `{ ok, feitos: string[], podeFaturar: boolean|null, erro? }`; `feitos` diz o que mudou, uma frase por passo.
 */
export async function garantirFiscalNoML(ml, plano, { itemId, simular = false }) {
  const feitos = [];
  if (!plano?.ok) return { ok: false, feitos, podeFaturar: null, erro: (plano?.problemas ?? ["Sem dados fiscais."]).join(" ") };
  try {
    for (const corpo of plano.corpos) {
      const passo = await garantirSku(ml, corpo, simular);
      if (!passo.ok) return { ok: false, feitos, podeFaturar: null, erro: passo.erro };
      if (passo.acao === "criado") feitos.push(`Dados fiscais do SKU ${corpo.sku} cadastrados.`);
      if (passo.acao === "corrigido") feitos.push(`Dados fiscais do SKU ${corpo.sku} corrigidos.`);
    }

    const detalhe = await ml.get(`/items/${itemId}/fiscal_information/detail`);
    const skuLigado = detalhe?.ok ? String(detalhe.dados?.sku?.sku ?? "") : null;
    if (!detalhe?.ok && detalhe?.status !== 404) return { ok: false, feitos, podeFaturar: null, erro: textoDaRecusaML(detalhe, `a leitura dos dados fiscais do anúncio ${itemId}`) };
    if (skuLigado !== plano.sku && simular) {
      feitos.push(skuLigado ? `Anúncio ${itemId} trocou do SKU ${skuLigado} para o ${plano.sku}.` : `SKU ${plano.sku} vinculado ao anúncio ${itemId}.`);
      return { ok: true, feitos, podeFaturar: null };
    }
    if (skuLigado !== plano.sku) {
      const resposta = await ml.post("/items/fiscal_information/items", { sku: plano.sku, item_id: itemId, variation_id: "" });
      if (!resposta?.ok) return { ok: false, feitos, podeFaturar: null, erro: textoDaRecusaML(resposta, `o vínculo do SKU ${plano.sku} ao anúncio ${itemId}`) };
      feitos.push(skuLigado ? `Anúncio ${itemId} trocou do SKU ${skuLigado} para o ${plano.sku}.` : `SKU ${plano.sku} vinculado ao anúncio ${itemId}.`);
    }

    const fatura = await ml.get(`/can_invoice/items/${itemId}`);
    const podeFaturar = fatura?.ok ? fatura.dados?.status === true : null;
    return { ok: true, feitos, podeFaturar };
  } catch (erro) {
    return { ok: false, feitos, podeFaturar: null, erro: `Falha ao falar com o Mercado Livre: ${textoDe(erro)}` };
  }
}

/** O anuncio do ML do Rise com o MLB e o plano fiscal dele. `{ ok, itemId, plano }` ou `{ ok: false, erro }`. */
export async function anuncioComPlano(anuncioId) {
  const anuncio = await prisma.anuncio.findFirst({ where: { id: anuncioId, canal: "MERCADO_LIVRE" }, select: { produtoId: true, idExterno: true, dados: true } });
  if (!anuncio) return { ok: false, erro: "Anúncio não encontrado." };
  if (!anuncio.idExterno) return { ok: false, erro: "O anúncio ainda não foi publicado: os dados fiscais vão no Publicar." };
  const plano = await planoFiscalDoRascunho({ produtoId: anuncio.produtoId, titulo: anuncio.dados?.titulo, composicao: anuncio.dados?.composicao ?? null });
  return { ok: true, itemId: anuncio.idExterno, plano };
}

/** "Enviar dados fiscais" do editor (anuncio ja publicado): garante o SKU e o vinculo. Nunca lanca. */
export async function enviarDadosFiscaisDoAnuncio(anuncioId, { ml }) {
  const alvo = await anuncioComPlano(anuncioId);
  if (!alvo.ok) return alvo;
  try {
    ml.exigirEscrita(alvo.plano.sku);
  } catch (erro) {
    return { ok: false, feitos: [], podeFaturar: null, erro: textoDe(erro) };
  }
  return garantirFiscalNoML(ml, alvo.plano, { itemId: alvo.itemId });
}

/** A situacao fiscal do anuncio para a aba Status: o que o ML guarda e o que falta no Rise. So le. */
export async function situacaoFiscalDoAnuncio(anuncioId, { ml }) {
  const alvo = await anuncioComPlano(anuncioId);
  if (!alvo.ok) return alvo;
  const lido = await lerFiscalDoAnuncio(ml, alvo.itemId);
  return { ...lido, problemas: alvo.plano.problemas ?? [], skuDoRise: alvo.plano.sku };
}

/**
 * Le, sem escrever, a situacao fiscal de um anuncio no ML (o editor mostra): `{ ok, ligado, sku, podeFaturar }`.
 */
export async function lerFiscalDoAnuncio(ml, itemId) {
  try {
    const [detalhe, fatura] = [await ml.get(`/items/${itemId}/fiscal_information/detail`), await ml.get(`/can_invoice/items/${itemId}`)];
    if (!detalhe?.ok && detalhe?.status !== 404) return { ok: false, erro: textoDaRecusaML(detalhe, "a leitura dos dados fiscais") };
    return { ok: true, ligado: Boolean(detalhe?.ok), sku: detalhe?.ok ? String(detalhe.dados?.sku?.sku ?? "") : null, podeFaturar: fatura?.ok ? fatura.dados?.status === true : null };
  } catch (erro) {
    return { ok: false, erro: `Falha ao falar com o Mercado Livre: ${textoDe(erro)}` };
  }
}
