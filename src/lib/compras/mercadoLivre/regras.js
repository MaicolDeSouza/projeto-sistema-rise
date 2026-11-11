/**
 * Regras puras das compras do Mercado Livre (spec 2026-11-11-compras-do-mercado-livre-design.md). Sem imports: o teste
 * roda sem banco. Formatos medidos em 11/11/2026 nas 24 compras da conta (GET /orders/search?buyer= e /shipments/{id}).
 */

const DIA_MS = 24 * 60 * 60 * 1000;
const centavos = (valor) => Math.round((Number(valor) || 0) * 100);

/**
 * As compras agrupadas pelo pacote do ML: o carrinho com varios itens do mesmo vendedor vira varias compras com o mesmo
 * `pack_id` e um envio so, e no Rise e UM pedido (uma caixa chega). Sem pack, a compra sozinha. Mais nova primeiro.
 */
export function agruparPorPacote(compras) {
  const grupos = new Map();
  for (const compra of compras ?? []) {
    if (compra?.id === undefined || compra?.id === null) continue;
    const chave = String(compra.pack_id ?? compra.id);
    if (!grupos.has(chave)) grupos.set(chave, { chave, compras: [] });
    grupos.get(chave).compras.push(compra);
  }
  return [...grupos.values()].sort((a, b) => dataDoGrupo(b) - dataDoGrupo(a));
}

function dataDoGrupo(grupo) {
  const datas = grupo.compras.map((compra) => new Date(compra.date_created).getTime()).filter(Number.isFinite);
  return datas.length ? Math.min(...datas) : 0;
}

const PAGA = new Set(["paid", "partially_paid", "partially_refunded"]);
const CANCELADA = new Set(["cancelled", "invalid"]);

/**
 * A situacao do grupo, no molde de `situacaoDoAliExpress`: paga se alguma compra foi paga; cancelada se todas foram;
 * senao aguardando pagamento (payment_required, payment_in_process, confirmed). `texto` e o que a tela mostra.
 */
export function situacaoDoGrupo(grupo) {
  const status = grupo.compras.map((compra) => String(compra?.status ?? ""));
  if (status.some((valor) => PAGA.has(valor))) return { aberto: true, entregue: false, cancelado: false, aguardandoPagamento: false, texto: "Pago" };
  if (status.length && status.every((valor) => CANCELADA.has(valor))) return { aberto: false, entregue: false, cancelado: true, aguardandoPagamento: false, texto: "Cancelada" };
  return { aberto: false, entregue: false, cancelado: false, aguardandoPagamento: true, texto: "Aguardando pagamento" };
}

/**
 * Produtos, frete e o que foi pago (so as compras nao canceladas). O `total_amount` e so dos produtos; o frete vem dos
 * pagamentos (`shipping_cost`; 10,99 numa compra medida, 0 no frete gratis) e `paid_amount` = produtos + frete.
 */
export function totaisDoGrupo(grupo) {
  let produtos = 0;
  let frete = 0;
  let pago = 0;
  for (const compra of grupo.compras) {
    if (CANCELADA.has(String(compra?.status ?? ""))) continue;
    for (const linha of compra.order_items ?? []) produtos += centavos(Number(linha?.quantity) * Number(linha?.unit_price));
    for (const pagamento of compra.payments ?? []) if (String(pagamento?.status ?? "") === "approved") frete += centavos(pagamento?.shipping_cost);
    pago += centavos(compra.paid_amount);
  }
  return { produtos: produtos / 100, frete: frete / 100, pago: pago / 100 };
}

/** O texto da variacao ("Cor: Azul · Tamanho: M"), ou null. */
export function textoDaVariacao(atributos) {
  const partes = (atributos ?? []).map((atributo) => [atributo?.name, atributo?.value_name].filter(Boolean).join(": ")).filter(Boolean);
  return partes.length ? partes.join(" · ") : null;
}

/** O endereco publico de um anuncio pelo MLB (o permalink da API vence quando vem). */
export function linkDoAnuncio(mlb) {
  const numero = String(mlb ?? "").replace(/^MLB-?/i, "");
  return /^\d+$/.test(numero) ? `https://produto.mercadolivre.com.br/MLB-${numero}` : null;
}

/** As linhas do grupo no formato de `LinhaAliExpress` (anuncio no `productId`, variacao no `skuId`). */
export function linhasDoGrupo(grupo) {
  const linhas = [];
  for (const compra of grupo.compras) {
    for (const linha of compra.order_items ?? []) {
      const item = linha?.item ?? {};
      if (!item.id) continue;
      const variacao = item.variation_id === null || item.variation_id === undefined ? null : String(item.variation_id);
      linhas.push({
        externoLinhaId: `${compra.id}:${item.id}:${variacao ?? ""}`,
        productId: String(item.id),
        skuId: variacao,
        opcao: textoDaVariacao(item.variation_attributes),
        titulo: String(item.title ?? item.id),
        urlDoItem: linkDoAnuncio(item.id),
        quantidade: Number(linha.quantity) || 0,
        preco: Math.round((Number(linha.unit_price) || 0) * 10000) / 10000,
      });
    }
  }
  return linhas;
}

/** Vendedor, data da compra e a data da entrega (do envio). */
export function entradaDaCompra(grupo, envio) {
  const primeira = [...grupo.compras].sort((a, b) => new Date(a.date_created) - new Date(b.date_created))[0];
  const entregue = envio?.status === "delivered" ? (envio?.status_history?.date_delivered ?? envio?.last_updated ?? null) : null;
  return {
    vendedor: primeira?.seller?.nickname ?? null,
    vendedorId: primeira?.seller?.id === undefined || primeira?.seller?.id === null ? null : String(primeira.seller.id),
    dataDoPedido: new Date(primeira?.date_created ?? Date.now()),
    entregueEm: entregue ? new Date(entregue) : null,
  };
}

/**
 * A primeira leitura e "em andamento + ultimos 30 dias" (decisao do dono em 11/11/2026): o grupo novo entra se foi
 * comprado ha ate 30 dias, ou se esta pago e o envio ainda nao chegou. Cancelado nunca visto nao entra (nao houve compra
 * a acompanhar).
 */
export function grupoNasceu(grupo, envio, agora = new Date()) {
  const situacao = situacaoDoGrupo(grupo);
  if (situacao.cancelado) return false;
  if (agora.getTime() - dataDoGrupo(grupo) <= 30 * DIA_MS) return true;
  return !situacao.aguardandoPagamento && !["delivered", "cancelled", "not_delivered"].includes(String(envio?.status ?? ""));
}

const TEXTO_DO_STATUS = {
  pending: "Envio pendente",
  handling: "Em preparação pelo vendedor",
  ready_to_ship: "Pronto para envio",
  shipped: "A caminho",
  delivered: "Entregue",
  not_delivered: "Não entregue",
  cancelled: "Envio cancelado",
};
const TEXTO_DO_SUBSTATUS = {
  picked_up: "Coletado pela transportadora",
  dropped_off: "Postado pelo vendedor",
  in_hub: "No centro de distribuição",
  out_for_delivery: "Saiu para entrega",
  returning_to_sender: "Devolvido ao vendedor",
  returned_to_sender: "Devolvido ao vendedor",
  receiver_absent: "Não entregue: destinatário ausente",
  delayed: "A caminho, com atraso",
};

/** O texto do envio para a coluna Rastreio ("A caminho", "Saiu para entrega"...). */
export function textoDoEnvio(status, substatus) {
  return TEXTO_DO_SUBSTATUS[substatus] ?? TEXTO_DO_STATUS[status] ?? (status ? `Envio: ${status}` : "Envio sem situação");
}

/** O codigo do pacote: o rastreio quando ja existe; antes dele, "envio <id>" (renomeado quando o rastreio aparece). */
export function codigoDoEnvio(envio) {
  const rastreio = String(envio?.tracking_number ?? "").trim();
  return rastreio || `envio ${envio?.id}`;
}

/** Os campos de `PacoteAliExpress` (menos o codigo) a partir do envio do ML. */
export function dadosDoPacote(envio) {
  const status = String(envio?.status ?? "");
  const substatus = envio?.substatus ? String(envio.substatus) : null;
  const historico = envio?.status_history ?? {};
  const eventos = [
    ["date_handling", "handling", "Em preparação pelo vendedor"],
    ["date_ready_to_ship", "ready_to_ship", "Pronto para envio"],
    ["date_shipped", "shipped", "A caminho"],
    ["date_delivered", "delivered", "Entregue"],
    ["date_not_delivered", "not_delivered", "Não entregue"],
    ["date_returned", "returned", "Devolvido ao vendedor"],
    ["date_cancelled", "cancelled", "Envio cancelado"],
  ]
    .filter(([campo]) => historico[campo])
    .map(([campo, codigo, descricao]) => ({ em: new Date(historico[campo]).getTime(), descricao, codigo: `ML_${codigo}` }))
    .sort((a, b) => b.em - a.em);
  const ultimoEm = eventos[0]?.em ?? (envio?.last_updated ? new Date(envio.last_updated).getTime() : null);
  const previsao = envio?.shipping_option?.estimated_delivery_time?.date ?? envio?.shipping_option?.estimated_delivery_final?.date ?? null;
  return {
    codigoOrigem: envio?.tracking_number ? String(envio.tracking_number) : null,
    transportadora: envio?.tracking_method ?? null,
    previsaoTexto: null,
    previsaoInicio: null,
    previsaoFim: previsao ? new Date(previsao) : null,
    ultimoEvento: textoDoEnvio(status, substatus),
    ultimoEventoEm: ultimoEm ? new Date(ultimoEm) : null,
    ultimoCodigo: `ML_${status}${substatus ? `_${substatus}` : ""}`,
    eventos,
  };
}
