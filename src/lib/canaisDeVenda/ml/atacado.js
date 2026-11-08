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

/** As faixas que o ML tem hoje (`GET /items/{id}/prices` com show-all-prices), por quantidade crescente. */
export function faixasLidas(prices) {
  return (prices?.price_per_quantity ?? [])
    .map((p) => ({ quantidade: Number(p?.conditions?.min_purchase_unit), percentual: numero(p?.percentage) ?? 0, id: p?.id ?? null }))
    .filter((f) => Number.isInteger(f.quantidade))
    .sort((a, b) => a.quantidade - b.quantidade);
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
  return (resposta.dados?.recommendations ?? []).map((r) => ({ quantity: Number(r.quantity), discount_percentage: numero(r.discount_percentage) ?? 0 }));
}

/** A versao do item para o `X-Version` (header `x-version` de GET /items/{id}/prices); `null` quando nao veio. */
export async function lerVersaoDoItem(ml, itemId) {
  const resposta = await ml.get(`/items/${itemId}/prices`, null, { comHeaders: true });
  const versao = resposta?.headers?.["x-version"] ?? resposta?.headers?.["X-Version"] ?? null;
  return versao === null || versao === undefined ? null : String(versao);
}

/**
 * Envia o atacado do rascunho ao anuncio e le de volta o que ficou. Nunca lanca: `{ ok, faixas, erro }`.
 * O chamador ja passou pelas travas (`exigirEscrita`) e pelo resto da publicacao.
 */
export async function enviarAtacadoML(ml, { itemId, preco, atacado }) {
  try {
    const ligado = atacado?.ligado === true;
    let faixas = [];
    if (ligado) {
      const quantidades = [...new Set((atacado.faixas ?? []).map((f) => Number(f.quantidade)).filter((q) => Number.isInteger(q) && q >= 1))].sort((a, b) => a - b);
      const recomendacoes = quantidades.length > 0 ? await lerRecomendacaoDeAtacado(ml, { itemId, preco, quantidades }) : [];
      faixas = faixasComRecomendacao(atacado.faixas, recomendacoes);
    }
    const corpo = corpoDoAtacado(faixas, { ligado });

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
    return { ok: true, faixas: faixasLidas(lidas.dados), erro: null };
  } catch (erro) {
    return { ok: false, faixas: [], erro: erro?.message ?? String(erro) };
  }
}
