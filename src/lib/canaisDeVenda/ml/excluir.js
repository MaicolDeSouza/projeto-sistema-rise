import { prisma } from "@/lib/db";
import { buscarNoBling } from "@/lib/blingSync/leitura";
import { LOJA_ML_NO_BLING, anuncioNoBlingML } from "./bling";
import { textoDoErroML } from "./leitura";
import { textoDaRecusaML } from "./respostas";

/**
 * Excluir o anuncio do Mercado Livre pelo Rise (Opcao 1 do dono em 28/10/2026: "sem venda, excluir; com venda, encerrar e
 * manter no Rise como encerrado"). A ordem e a que o dono pediu, ML -> Bling -> Rise, e cada passo le antes de escrever,
 * entao repetir depois de uma falha continua de onde parou (o item ja encerrado nao e encerrado de novo, o registro do
 * Bling que ja saiu nao e apagado de novo).
 *
 * - Sem MLB (rascunho, ou publicacao que parou antes de criar o item): so o anuncio do Rise sai.
 * - Sem venda: o item e encerrado e apagado no ML (`PUT status closed` e depois `deleted: "true"`, que o ML so aceita no
 *   encerrado), sai do Bling e sai do Rise.
 * - Com venda: o item so e encerrado no ML (o historico das vendas fica la), sai do Bling e fica no Rise como Encerrado
 *   (`situacaoCanal` ENCERRADA, que o icone, o worker e o estado no ML ja tratam como fora do ar).
 *
 * No Bling sai o registro do anuncio (`/anuncios`, um por MLB) e o vinculo do produto com a loja do ML (`/produtos/lojas`)
 * quando ele aponta para este MLB e o produto nao tem outro anuncio registrado na loja; o vinculo e um por produto e serve
 * aos outros anuncios dele (Classico e Premium). O produto do kit no Bling fica: pode estar em uso fora do ML.
 *
 * Encerrar no ML nao tem volta. As duas travas (ML_PUBLICACAO e BLING_ESCRITA, com as listas de codigos) sao conferidas
 * antes da primeira escrita, como no Publicar.
 */

const MLB = /^MLB\d+$/;
const TIPO_DE_INTEGRACAO = "MercadoLivre";

const textoDe = (erro) => erro?.message ?? String(erro);

/** O que a exclusao precisa do anuncio: o MLB (do fim da publicacao ou do meio dela), o codigo das travas e do Bling. */
async function lerAnuncio(anuncioId) {
  const anuncio = await prisma.anuncio.findUnique({
    where: { id: anuncioId },
    select: { id: true, canal: true, status: true, situacaoCanal: true, temVendas: true, titulo: true, idExterno: true, dados: true, produto: { select: { sku: true } } },
  });
  if (!anuncio || anuncio.canal !== "MERCADO_LIVRE") return null;
  const publicacao = anuncio.dados?.publicacao ?? {};
  const itemId = [anuncio.idExterno, publicacao.itemId].map((valor) => String(valor ?? "").trim()).find((valor) => MLB.test(valor)) ?? null;
  const codigo = String(anuncio.dados?.composicao?.codigo || anuncio.produto.sku).trim();
  return { anuncio, itemId, codigo, incerta: Boolean(publicacao.incerta) && !itemId };
}

/** O item no ML agora: `{ existe, status, vendas }`, ou `{ erro }` quando a leitura falhou (e a exclusao nao segue). */
async function itemNoML(ml, itemId) {
  let resposta;
  try {
    resposta = await ml.get(`/items/${itemId}`);
  } catch (erro) {
    return { erro: `Não foi possível ler o anúncio ${itemId} no Mercado Livre: ${textoDoErroML(erro)}` };
  }
  if (resposta?.status === 404) return { existe: false, status: null, vendas: 0 };
  if (!resposta?.ok) return { erro: textoDaRecusaML(resposta, `a leitura do anúncio ${itemId}`) };
  return { existe: true, status: resposta.dados?.status ?? null, vendas: Number(resposta.dados?.sold_quantity) || 0, apagado: resposta.dados?.deleted === true };
}

/**
 * O que vai acontecer, para a pergunta da tela (so le). `destino`: "rascunho" (so o Rise), "apagar" (sem venda) ou
 * "encerrar" (com venda). `jaEncerrado`: com venda e ja encerrado no Rise, nao ha mais nada a fazer.
 */
export async function conferirExclusaoML(anuncioId, { ml }) {
  const lido = await lerAnuncio(anuncioId);
  if (!lido) return { ok: false, erro: "Anúncio não encontrado. Ele pode ter sido excluído." };
  const { anuncio, itemId, codigo, incerta } = lido;
  const base = { titulo: anuncio.titulo ?? "", codigo, itemId };
  if (incerta) {
    return { ok: false, ...base, erro: "A criação deste anúncio no Mercado Livre ficou sem resposta. Confira no painel do ML se ele foi criado antes de excluir." };
  }
  if (!itemId) return { ok: true, ...base, destino: "rascunho", vendas: 0 };

  const noML = await itemNoML(ml, itemId);
  if (noML.erro) return { ok: false, ...base, erro: noML.erro };
  const vendas = Math.max(noML.vendas, anuncio.temVendas ? 1 : 0);
  const destino = vendas > 0 ? "encerrar" : "apagar";
  const jaEncerrado = destino === "encerrar" && anuncio.situacaoCanal === "ENCERRADA" && (!noML.existe || noML.status === "closed");
  return { ok: true, ...base, destino, vendas: noML.vendas, existeNoML: noML.existe, statusML: noML.status, jaEncerrado };
}

/** Tira o anuncio do Bling: o registro em /anuncios e, se for o ultimo do produto na loja, o vinculo. Nunca lanca. */
async function tirarDoBling(bling, codigo, itemId) {
  const feito = [];
  let busca;
  try {
    busca = await buscarNoBling(bling, codigo);
  } catch (erro) {
    return { ok: false, erro: `Bling: não foi possível achar o produto ${codigo}: ${textoDe(erro)}`, feito };
  }
  if (busca.situacao === "nao_existe") return { ok: true, feito: [`Bling: o produto ${codigo} não está lá, nada a tirar`] };
  if (busca.situacao !== "existe") return { ok: false, erro: `Bling: o código ${codigo} aparece mais de uma vez; deixe só um e tente de novo.`, feito };

  const registro = await anuncioNoBlingML(bling, busca.id, itemId);
  if (registro.situacao === "erro") return { ok: false, erro: registro.erro, feito };
  if (registro.situacao === "registrado") {
    let resposta;
    try {
      resposta = await bling.delete(`/anuncios/${registro.id}`, { tipoIntegracao: TIPO_DE_INTEGRACAO, idLoja: Number(LOJA_ML_NO_BLING) });
    } catch (erro) {
      return { ok: false, erro: `Bling: falha ao tirar o anúncio ${itemId}: ${textoDe(erro)}. Confira no Bling e tente de novo.`, feito };
    }
    if (!resposta?.ok) return { ok: false, erro: `Bling: o anúncio ${itemId} não saiu (HTTP ${resposta?.status ?? "sem status"}).`, feito };
    feito.push(`Bling: anúncio ${itemId} retirado`);
  }

  // O vinculo do produto com a loja do ML: so sai se aponta para este MLB e o produto nao tem mais anuncio na loja.
  let vinculos;
  let restantes;
  try {
    vinculos = await bling.get("/produtos/lojas", { idProduto: busca.id });
    restantes = await bling.get("/anuncios", { tipoIntegracao: TIPO_DE_INTEGRACAO, idLoja: Number(LOJA_ML_NO_BLING), idProduto: busca.id });
  } catch (erro) {
    return { ok: false, erro: `Bling: não foi possível ler o vínculo do produto ${codigo}: ${textoDe(erro)}`, feito };
  }
  if (!vinculos?.ok || !restantes?.ok) return { ok: false, erro: `Bling: não foi possível ler o vínculo do produto ${codigo}.`, feito };
  // O vinculo guarda o MLB do PRIMEIRO anuncio: com outro anuncio ainda registrado ele fica (serve a esse), e sem nenhum sai
  // qualquer vinculo do produto nesta loja, aponte para qual MLB apontar (senao ficaria ligado a um anuncio que nao existe).
  const daLoja = (vinculos.dados?.data ?? []).filter((item) => String(item?.loja?.id) === LOJA_ML_NO_BLING);
  const outros = (restantes.dados?.data ?? []).filter((item) => String(item?.anuncioLoja?.id ?? "").trim() !== itemId);
  if (outros.length > 0) {
    if (daLoja.length > 0) feito.push(`Bling: vínculo do produto ${codigo} mantido (ele tem outro anúncio no ML)`);
  } else {
    for (const vinculo of daLoja) {
      let resposta;
      try {
        resposta = await bling.delete(`/produtos/lojas/${vinculo.id}`);
      } catch (erro) {
        return { ok: false, erro: `Bling: falha ao tirar o vínculo do produto ${codigo}: ${textoDe(erro)}. Confira no Bling e tente de novo.`, feito };
      }
      if (!resposta?.ok) return { ok: false, erro: `Bling: o vínculo do produto ${codigo} não saiu (HTTP ${resposta?.status ?? "sem status"}).`, feito };
      feito.push(`Bling: vínculo do produto ${codigo} com a loja do ML retirado`);
    }
  }
  if (feito.length === 0) feito.push("Bling: o anúncio já não estava lá");
  return { ok: true, feito };
}

/**
 * Exclui (ou encerra) o anuncio. Devolve `{ ok, destino, feito: string[], erro? }`: `feito` lista o que ja aconteceu,
 * inclusive quando um passo seguinte falhou (o dono sabe o que ficou feito e o "Tentar de novo" continua dali).
 */
export async function excluirAnuncioML(anuncioId, { ml, bling }) {
  const conferido = await conferirExclusaoML(anuncioId, { ml });
  if (!conferido.ok) return { ok: false, feito: [], erro: conferido.erro };
  const { destino, itemId, codigo } = conferido;
  const feito = [];
  const falhar = (erro) => ({ ok: false, destino, feito, erro });

  if (destino === "rascunho") {
    await prisma.anuncio.delete({ where: { id: anuncioId } });
    return { ok: true, destino, feito: ["Rise: rascunho excluído"] };
  }
  if (conferido.jaEncerrado) return { ok: true, destino, feito: ["Já estava encerrado no Mercado Livre e no Rise"] };

  try {
    ml.exigirEscrita(codigo);
    bling.exigirEscrita(codigo);
  } catch (erro) {
    return falhar(textoDe(erro));
  }

  // 1. Mercado Livre: encerrar (com e sem venda) e, sem venda, apagar.
  if (conferido.existeNoML) {
    if (conferido.statusML !== "closed") {
      let resposta;
      try {
        resposta = await ml.put(`/items/${itemId}`, { status: "closed" });
      } catch (erro) {
        return falhar(`Não foi possível encerrar o anúncio ${itemId} no Mercado Livre: ${textoDoErroML(erro)}`);
      }
      if (!resposta?.ok) return falhar(textoDaRecusaML(resposta, `o encerramento do anúncio ${itemId}`));
      feito.push(`Mercado Livre: anúncio ${itemId} encerrado`);
    }
    if (destino === "apagar") {
      let resposta;
      try {
        resposta = await ml.put(`/items/${itemId}`, { deleted: "true" });
      } catch (erro) {
        return falhar(`O anúncio ${itemId} foi encerrado, mas não foi possível apagá-lo no Mercado Livre: ${textoDoErroML(erro)}`);
      }
      if (!resposta?.ok) return falhar(textoDaRecusaML(resposta, `a exclusão do anúncio ${itemId}`));
      feito.push(`Mercado Livre: anúncio ${itemId} excluído`);
    }
  } else {
    feito.push(`Mercado Livre: o anúncio ${itemId} já não existe lá`);
  }

  // 2. Bling.
  const bling2 = await tirarDoBling(bling, codigo, itemId);
  feito.push(...bling2.feito);
  if (!bling2.ok) return falhar(bling2.erro);

  // 3. Rise.
  if (destino === "apagar") {
    await prisma.anuncio.delete({ where: { id: anuncioId } });
    feito.push("Rise: anúncio excluído");
  } else {
    const atual = await prisma.anuncio.findUnique({ where: { id: anuncioId }, select: { dados: true } });
    const publicacao = atual?.dados?.publicacao ?? {};
    await prisma.anuncio.update({
      where: { id: anuncioId },
      data: {
        situacaoCanal: "ENCERRADA",
        temVendas: true,
        dados: { ...(atual?.dados ?? {}), publicacao: { ...publicacao, statusML: "closed", encerradoEm: new Date().toISOString(), estadoML: { ...(publicacao.estadoML ?? {}), status: "closed" } } },
      },
    });
    feito.push("Rise: anúncio mantido como Encerrado (tem vendas)");
  }
  return { ok: true, destino, feito };
}
