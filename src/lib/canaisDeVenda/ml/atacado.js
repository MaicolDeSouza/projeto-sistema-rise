/**
 * Precos de atacado do Mercado Livre (PxQ, "Exclusivo negocios"; definicao 8 do dono em 08/11/2026): todo anuncio
 * novo nasce com as faixas 2/5/10/20 ligadas, e o % de cada faixa vem da recomendacao do ML na hora do envio (o dono
 * pode subir; abaixo do recomendado o ML recusa com 400). So quem compra com CNPJ ve.
 *
 * O que a API faz, medido na VPS em 08/11/2026 (Task 0, so leitura):
 * - `POST /prices-per-quantity/v1/recommendations` { item_id, range_item_quantities, price: { standard_amount, currency } }
 *   so calcula (nao grava) e responde 200 tambem em item pausado.
 * - `POST /items/{id}/prices/price-per-quantity` exige o header `X-Version`: 409 quando a versao e velha. A versao NAO
 *   vem no corpo do item (`GET /items/{id}` so tem date_created/last_updated): vem no HEADER `x-version` da resposta de
 *   `GET /items/{id}/prices` (valor "1" no MLB7869562976). Por isso `lerVersaoDoItem` pede a resposta com headers.
 * - `GET /items/{id}/prices` com o header `show-all-prices: true` devolve `price_per_quantity[]`.
 */

export const FAIXAS_PADRAO = [2, 5, 10, 20];

/** O atacado de um rascunho novo: ligado, as quatro faixas, sem % (a recomendacao preenche no envio). */
export function ATACADO_PADRAO() {
  return { ligado: true, faixas: FAIXAS_PADRAO.map((quantidade) => ({ quantidade, percentual: null })) };
}

const numero = (valor) => (Number.isFinite(Number(valor)) ? Number(valor) : null);

/**
 * Cada faixa com o % de verdade: o do dono quando esta acima do recomendado, senao o recomendado (o ML recusa abaixo).
 * Faixa sem recomendacao e sem % fica em 0, e `corpoDoAtacado` a tira.
 */
export function faixasComRecomendacao(faixas, recomendacoes) {
  const recomendado = new Map((recomendacoes ?? []).map((r) => [Number(r.quantity), numero(r.discount_percentage) ?? 0]));
  return (faixas ?? []).map((faixa) => {
    const quantidade = Number(faixa.quantidade);
    const minimo = recomendado.get(quantidade) ?? 0;
    return { quantidade, percentual: Math.max(numero(faixa.percentual) ?? 0, minimo) };
  });
}

/** O corpo do POST: so faixas com desconto, por quantidade crescente; desligado manda a lista vazia (apaga no ML). */
export function corpoDoAtacado(faixas, { ligado = true } = {}) {
  if (!ligado) return { price_per_quantity: [] };
  const validas = (faixas ?? [])
    .map((f) => ({ quantidade: Number(f.quantidade), percentual: numero(f.percentual) ?? 0 }))
    .filter((f) => Number.isInteger(f.quantidade) && f.quantidade >= 1 && f.percentual > 0)
    .sort((a, b) => a.quantidade - b.quantidade);
  return {
    price_per_quantity: validas.map((f) => ({
      type: "discount_percentage",
      percentage: f.percentual,
      conditions: { context_restrictions: ["channel_marketplace", "user_type_business"], min_purchase_unit: f.quantidade, eligible: true },
    })),
  };
}

/**
 * As faixas que o ML tem hoje (`GET /items/{id}/prices` com show-all-prices), por quantidade crescente.
 *
 * O formato REAL (doc oficial e medicao de 08/11/2026): o preco padrao e cada faixa sao entradas de `prices[]`; a faixa de
 * atacado e a que tem `conditions.min_purchase_unit` e `user_type_business` nas restricoes, com o `amount` JA com o desconto.
 * O % sai da conta contra o preco padrao (a entrada sem restricao de contexto nem quantidade minima). A leitura nao traz o %.
 * Um `price_per_quantity[]` solto (que a leitura real nao tem) ainda e aceito.
 */
export function faixasLidas(prices) {
  const entradas = Array.isArray(prices?.prices) ? prices.prices : [];
  const padrao = entradas.find((p) => p?.conditions?.min_purchase_unit == null && (p?.conditions?.context_restrictions ?? []).length === 0);
  const base = numero(padrao?.amount);
  const doPrices = entradas
    .filter((p) => p?.conditions?.min_purchase_unit != null && (p?.conditions?.context_restrictions ?? []).includes("user_type_business"))
    .map((p) => {
      const amount = numero(p.amount);
      const percentual = base > 0 && amount !== null ? Math.round((1 - amount / base) * 10000) / 100 : 0;
      return { quantidade: Number(p.conditions.min_purchase_unit), percentual, id: p.id ?? null };
    });
  const soltas = (prices?.price_per_quantity ?? []).map((p) => ({ quantidade: Number(p?.conditions?.min_purchase_unit), percentual: numero(p?.percentage) ?? 0, id: p?.id ?? null }));
  return [...doPrices, ...soltas].filter((f) => Number.isInteger(f.quantidade)).sort((a, b) => a.quantidade - b.quantidade);
}

/** O que entra em `publicacao.enviado.atacado` para o "!" comparar: ligado e as faixas como pares, em ordem. */
export function impressaoDoAtacado(atacado) {
  if (!atacado?.ligado) return { ligado: false, faixas: [] };
  return {
    ligado: true,
    faixas: (atacado.faixas ?? [])
      .map((f) => [Number(f.quantidade), numero(f.percentual) ?? 0])
      .filter(([quantidade]) => Number.isInteger(quantidade))
      .sort((a, b) => a[0] - b[0]),
  };
}

/**
 * O atacado do rascunho depois de um envio que deu certo: cada faixa passa a ter o % que o ML gravou (a recomendacao
 * preenche o que estava vazio). Com isso o rascunho e a impressao enviada ficam iguais e o "!" nao acende sozinho.
 * Faixa que o ML nao gravou (% 0) fica com 0. Desligado nao mexe nas faixas.
 */
export function atacadoDoEnvio(atacado, faixasDoML) {
  const base = { ligado: atacado?.ligado === true, faixas: atacado?.faixas ?? [] };
  if (!base.ligado) return base;
  const gravado = new Map((faixasDoML ?? []).map((f) => [f.quantidade, f.percentual]));
  return { ligado: true, faixas: base.faixas.map((f) => ({ quantidade: f.quantidade, percentual: gravado.get(Number(f.quantidade)) ?? 0 })) };
}

const mensagemDoML = (resposta) =>
  resposta?.dados?.message ?? resposta?.dados?.error ?? (resposta?.status ? `HTTP ${resposta.status}` : "sem resposta");

/** A recomendacao do ML para as quantidades, com o preco do anuncio. Lanca quando o ML nao responde. */
export async function lerRecomendacaoDeAtacado(ml, { itemId, preco, quantidades }) {
  const resposta = await ml.post("/prices-per-quantity/v1/recommendations", {
    item_id: itemId,
    range_item_quantities: quantidades,
    price: { standard_amount: preco, currency: "BRL" },
  });
  if (!resposta.ok) throw new Error(`A recomendação de atacado do Mercado Livre falhou: ${mensagemDoML(resposta)}.`);
  // O formato real (medido em 08/11/2026 no 100101): `recommendations[].discount.percentage`, junto de `amount`, `profit` e
  // `shipping`. O campo plano `discount_percentage` nao existe: lelo zerava todas as faixas e o envio mandava lista vazia.
  return (resposta.dados?.recommendations ?? []).map((r) => ({
    quantity: Number(r.quantity),
    discount_percentage: numero(r.discount?.percentage ?? r.discount_percentage) ?? 0,
  }));
}

/** A versao do item para o `X-Version` (header `x-version` de GET /items/{id}/prices); `null` quando nao veio. */
export async function lerVersaoDoItem(ml, itemId) {
  const resposta = await ml.get(`/items/${itemId}/prices`, null, { comHeaders: true });
  const versao = resposta?.headers?.["x-version"] ?? resposta?.headers?.["X-Version"] ?? null;
  return versao === null || versao === undefined ? null : String(versao);
}

/// Quanto o Publicar espera a sugestao do ML num anuncio recem-criado, e de quanto em quanto rele (pedido do dono em 09/11/2026:
/// "pode ficar parado naquele popup com as etapas, se demorar mais de xxxx segundos ai apresenta falha e me fala para fazer
/// manualmente"). Medido no Premium do kit do 120920: a sugestao veio vazia no Publicar e estava la menos de 1 minuto depois.
export const ESPERA_DA_SUGESTAO_MS = 90 * 1000;
export const INTERVALO_DA_SUGESTAO_MS = 10 * 1000;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Envia o atacado do rascunho ao anuncio e le de volta o que ficou. Nunca lanca: `{ ok, faixas, erro, motivo? }`.
 * O chamador ja passou pelas travas (`exigirEscrita`) e pelo resto da publicacao.
 *
 * `espera.esperaMs` (so o Publicar, com frete gratis): sem desconto para mandar, rele a sugestao a cada `intervaloMs` ate o
 * limite, avisando o andamento em `aoEsperar(segundos, limite)`; `dormir` e injetavel no teste. Sem espera (o padrao, o
 * "Sincronizar com o ML"), le uma vez. `motivo: "sem_recomendacao"` quando nada tinha desconto: e o que o Publicar explica.
 */
export async function enviarAtacadoML(ml, { itemId, preco, atacado }, { esperaMs = 0, intervaloMs = INTERVALO_DA_SUGESTAO_MS, dormir = esperar, aoEsperar = null } = {}) {
  try {
    const ligado = atacado?.ligado === true;
    let faixas = [];
    if (ligado) {
      const quantidades = [...new Set((atacado.faixas ?? []).map((f) => Number(f.quantidade)).filter((q) => Number.isInteger(q) && q >= 1))].sort((a, b) => a - b);
      const sugeridas = async () => faixasComRecomendacao(atacado.faixas, quantidades.length > 0 ? await lerRecomendacaoDeAtacado(ml, { itemId, preco, quantidades }) : []);
      faixas = await sugeridas();
      // O item recem-criado volta sem sugestao por alguns segundos (o ML responde 204, sem corpo): rele ate o limite.
      for (let esperado = 0; corpoDoAtacado(faixas).price_per_quantity.length === 0 && esperado < esperaMs; ) {
        esperado += intervaloMs;
        aoEsperar?.(Math.round(esperado / 1000), Math.round(esperaMs / 1000));
        await dormir(intervaloMs);
        faixas = await sugeridas();
      }
    }
    const corpo = corpoDoAtacado(faixas, { ligado });
    // Ligado e sem nenhuma faixa com desconto (a recomendacao veio vazia ou zerada): mandar a lista vazia daria "ok" em silencio
    // e o anuncio ficaria sem atacado com a tela dizendo que foi enviado.
    if (ligado && corpo.price_per_quantity.length === 0) {
      return { ok: false, faixas: [], erro: "O Mercado Livre não recomendou desconto para nenhuma faixa: os preços de atacado não foram enviados.", motivo: "sem_recomendacao" };
    }

    const enviar = async () => {
      const versao = await lerVersaoDoItem(ml, itemId);
      return ml.post(`/items/${itemId}/prices/price-per-quantity`, corpo, versao ? { headers: { "X-Version": versao } } : {});
    };
    let resposta = await enviar();
    // 409 = a versao mudou entre a leitura e o POST (outro envio mexeu no item): rele e tenta UMA vez.
    if (resposta.status === 409) resposta = await enviar();
    if (!resposta.ok) return { ok: false, faixas: [], erro: `O Mercado Livre recusou os preços de atacado: ${mensagemDoML(resposta)}.` };

    const lidas = await ml.get(`/items/${itemId}/prices`, null, { headers: { "show-all-prices": "true" } });
    if (!lidas.ok) return { ok: false, faixas: [], erro: `Os preços de atacado foram enviados, mas a leitura de volta falhou: ${mensagemDoML(lidas)}.` };
    const noML = faixasLidas(lidas.dados);
    // O ML aceitou mas as faixas nao aparecem na leitura: nao se diz "enviado" sem ver.
    if (ligado && !corpo.price_per_quantity.every((f) => noML.some((l) => l.quantidade === f.conditions.min_purchase_unit))) {
      return { ok: false, faixas: [], erro: "Os preços de atacado foram enviados, mas as faixas não aparecem na leitura do anúncio no Mercado Livre." };
    }
    // O % exato e o que foi enviado; o lido (conta sobre o amount arredondado em centavos) so serve de confirmacao.
    const enviado = new Map(corpo.price_per_quantity.map((f) => [f.conditions.min_purchase_unit, f.percentage]));
    return { ok: true, faixas: noML.map((f) => ({ ...f, percentual: enviado.get(f.quantidade) ?? f.percentual })), erro: null };
  } catch (erro) {
    return { ok: false, faixas: [], erro: erro?.message ?? String(erro) };
  }
}
