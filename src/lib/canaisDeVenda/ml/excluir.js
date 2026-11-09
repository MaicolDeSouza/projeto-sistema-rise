import { prisma } from "@/lib/db";
import { buscarNoBling } from "@/lib/blingSync/leitura";
import { LOJA_ML_ANTIGA_NO_BLING, LOJA_ML_NO_BLING, LOJA_MERCADOSHOPS_NO_BLING, anuncioNoBlingML } from "./bling";
import { textoDoErroML } from "./leitura";
import { textoDaRecusaML } from "./respostas";

/**
 * Excluir o anuncio do Mercado Livre pelo Rise. Desde 09/11/2026 (Opcao 1 do dono, "excluir de vez") COM ou sem venda o item
 * e encerrado e apagado no ML, sai de todas as lojas do ML no Bling e sai do Rise; as vendas ficam nos pedidos. Se o ML recusar
 * apagar o anuncio com venda (nunca medido), ele fica encerrado la e Encerrado no Rise, com o aviso. De 28/10 a 09/11/2026 era
 * "sem venda, excluir; com venda, encerrar e manter no Rise como encerrado", e o texto abaixo descreve a regra antiga onde fala
 * de "com venda". A ordem e a que o dono pediu, ML -> Bling -> Rise, e cada passo le antes de escrever,
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
  // Ja apagado: o ML ainda responde o item, encerrado com o `sub_status` "deleted" (medido no MLB5334128834 em 09/11/2026).
  const apagado = resposta.dados?.deleted === true || (Array.isArray(resposta.dados?.sub_status) && resposta.dados.sub_status.includes("deleted"));
  return { existe: true, status: resposta.dados?.status ?? null, vendas: Number(resposta.dados?.sold_quantity) || 0, apagado };
}

/**
 * O que vai acontecer, para a pergunta da tela (so le). `destino`: "rascunho" (so o Rise) ou "apagar" (com ou sem venda,
 * desde 09/11/2026); `vendas` vai para a pergunta, porque o anuncio com venda some do ML e do Rise (as vendas ficam nos pedidos).
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
  // Com venda tambem se apaga (Opcao 1 do dono em 09/11/2026: "excluir de vez"; de 28/10 a 09/11 so encerrava e ficava no Rise).
  return { ok: true, ...base, destino: "apagar", vendas: noML.vendas, comVendas: Math.max(noML.vendas, anuncio.temVendas ? 1 : 0) > 0, existeNoML: noML.existe, statusML: noML.status, apagadoNoML: Boolean(noML.apagado) };
}

// As lojas do ML ATIVAS no Bling onde um anuncio pode estar registrado (09/11/2026: o MLB6529880486, reaproveitado e excluido
// pelo Rise, ficou na ML_4h porque so a Rise_ML era limpa). A Rise_ML e a do Rise; a ML_4h e a MercadoShops guardam os anuncios
// de antes (o reaproveitado mora la ate o "Mover"). As outras lojas do ML no Bling estao inativas.
const LOJAS_DO_ML_NO_BLING = [
  { id: LOJA_ML_NO_BLING, nome: null },
  { id: LOJA_ML_ANTIGA_NO_BLING, nome: "ML_4h" },
  { id: LOJA_MERCADOSHOPS_NO_BLING, nome: "MercadoShops" },
];

/**
 * Tira o anuncio do Bling em TODAS as lojas do ML: o registro em /anuncios e, se for o ultimo do produto na loja, o vinculo.
 * Na Rise_ML sai qualquer vinculo do produto (ele guarda o MLB do primeiro anuncio); nas lojas antigas, so o vinculo que aponta
 * para este MLB (o produto pode ter outro anuncio antigo la). Nunca lanca.
 */
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

  let vinculos;
  try {
    vinculos = await bling.get("/produtos/lojas", { idProduto: busca.id });
  } catch (erro) {
    return { ok: false, erro: `Bling: não foi possível ler o vínculo do produto ${codigo}: ${textoDe(erro)}`, feito };
  }
  if (!vinculos?.ok) return { ok: false, erro: `Bling: não foi possível ler o vínculo do produto ${codigo}.`, feito };

  for (const loja of LOJAS_DO_ML_NO_BLING) {
    const naLoja = loja.nome ? ` (loja ${loja.nome})` : "";
    const registro = await anuncioNoBlingML(bling, busca.id, itemId, { loja: loja.id });
    if (registro.situacao === "erro") return { ok: false, erro: registro.erro, feito };
    if (registro.situacao === "registrado") {
      let resposta;
      try {
        resposta = await bling.delete(`/anuncios/${registro.id}`, { tipoIntegracao: TIPO_DE_INTEGRACAO, idLoja: Number(loja.id) });
      } catch (erro) {
        return { ok: false, erro: `Bling: falha ao tirar o anúncio ${itemId}${naLoja}: ${textoDe(erro)}. Confira no Bling e tente de novo.`, feito };
      }
      if (!resposta?.ok) return { ok: false, erro: `Bling: o anúncio ${itemId}${naLoja} não saiu (HTTP ${resposta?.status ?? "sem status"}).`, feito };
      feito.push(`Bling: anúncio ${itemId} retirado${naLoja}`);
    }

    // O vinculo do produto com a loja: com outro anuncio ainda registrado nela, fica (serve a esse).
    const daLoja = (vinculos.dados?.data ?? []).filter((item) => String(item?.loja?.id) === loja.id && (!loja.nome || String(item?.codigo ?? "").trim() === itemId));
    if (daLoja.length === 0) continue;
    let restantes;
    try {
      restantes = await bling.get("/anuncios", { tipoIntegracao: TIPO_DE_INTEGRACAO, idLoja: Number(loja.id), idProduto: busca.id });
    } catch (erro) {
      return { ok: false, erro: `Bling: não foi possível ler os anúncios do produto ${codigo}${naLoja}: ${textoDe(erro)}`, feito };
    }
    if (!restantes?.ok) return { ok: false, erro: `Bling: não foi possível ler os anúncios do produto ${codigo}${naLoja}.`, feito };
    const outros = (restantes.dados?.data ?? []).filter((item) => String(item?.anuncioLoja?.id ?? "").trim() !== itemId);
    if (outros.length > 0) {
      feito.push(`Bling: vínculo do produto ${codigo} mantido${naLoja} (ele tem outro anúncio no ML)`);
      continue;
    }
    for (const vinculo of daLoja) {
      let resposta;
      try {
        resposta = await bling.delete(`/produtos/lojas/${vinculo.id}`);
      } catch (erro) {
        return { ok: false, erro: `Bling: falha ao tirar o vínculo do produto ${codigo}${naLoja}: ${textoDe(erro)}. Confira no Bling e tente de novo.`, feito };
      }
      if (!resposta?.ok) return { ok: false, erro: `Bling: o vínculo do produto ${codigo}${naLoja} não saiu (HTTP ${resposta?.status ?? "sem status"}).`, feito };
      feito.push(`Bling: vínculo do produto ${codigo} com a loja do ML retirado${naLoja}`);
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
  const { itemId, codigo } = conferido;
  // `destino` vira "encerrar" so se o ML recusar apagar o anuncio com venda (nunca medido): ai ele fica Encerrado no Rise.
  let destino = conferido.destino;
  const feito = [];
  const falhar = (erro) => ({ ok: false, destino, feito, erro });

  if (destino === "rascunho") {
    await prisma.anuncio.delete({ where: { id: anuncioId } });
    return { ok: true, destino, feito: ["Rise: rascunho excluído"] };
  }

  try {
    ml.exigirEscrita(codigo);
    bling.exigirEscrita(codigo);
  } catch (erro) {
    return falhar(textoDe(erro));
  }

  // 1. Mercado Livre: encerrar e apagar (com e sem venda, 09/11/2026). Ja apagado la, nada a escrever.
  if (conferido.existeNoML && conferido.apagadoNoML) {
    feito.push(`Mercado Livre: o anúncio ${itemId} já estava excluído`);
  } else if (conferido.existeNoML) {
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
    let resposta;
    let falha = null;
    try {
      resposta = await ml.put(`/items/${itemId}`, { deleted: "true" });
      if (!resposta?.ok) falha = textoDaRecusaML(resposta, `a exclusão do anúncio ${itemId}`);
    } catch (erro) {
      falha = `O anúncio ${itemId} foi encerrado, mas não foi possível apagá-lo no Mercado Livre: ${textoDoErroML(erro)}`;
    }
    if (!falha) feito.push(`Mercado Livre: anúncio ${itemId} excluído`);
    else if (conferido.comVendas) {
      // Com venda, a recusa do ML nao para a exclusao: ele fica encerrado la, sai do Bling e fica Encerrado no Rise.
      destino = "encerrar";
      feito.push(`Mercado Livre: não deixou excluir o anúncio ${itemId} (tem vendas); ficou encerrado. ${falha}`);
    } else return falhar(falha);
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
    feito.push("Rise: anúncio mantido como Encerrado (o ML não deixou excluir)");
  }
  return { ok: true, destino, feito };
}
