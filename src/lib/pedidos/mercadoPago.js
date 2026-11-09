/**
 * O que o Mercado Pago creditou de uma venda do ML, e se bate com o "Real" do Rise (pedido do dono em 09/11/2026: "pegar
 * de forma concreta o que sobrou da venda ... para ver se nossa estimativa esta correta"; se bate, o lucro sai sem "~"; se
 * diverge, fica com "~" e liga o "!").
 *
 * Medido no mesmo dia, com o token do ML: `GET api.mercadopago.com/v1/payments/{id}` (o id vem de `order.payments`) traz o
 * liquido (`transaction_details.net_received_amount`), as cobrancas (`charges_details`) e a liberacao do dinheiro. O frete
 * que o COMPRADOR pagou chega num 2o pagamento, `description: "marketplace_shipment"` com `external_reference` = id do envio,
 * e o `shp_cross_docking` da venda cobra o frete inteiro da loja: liquido da venda + o do frete = o que sobra. Em 3 pedidos
 * reais isso bateu ao centavo com receita − comissao − frete do Rise. Imposto e custo nao passam pelo Mercado Pago.
 *
 * Sem imports: roda no servidor e no teste.
 */

const centavos = (valor) => Math.round(Number(valor ?? 0) * 100);
const reais = (emCentavos) => emCentavos / 100;

/** Diferenca aceita entre o Mercado Pago e o Rise: 1 centavo, de arredondamento. */
export const TOLERANCIA_CENTAVOS = 1;

/** Estorno, chargeback ou mediacao: o liquido do pagamento deixa de ser o que fica na conta. */
const SEM_VALOR_FINAL = new Set(["refunded", "charged_back", "in_mediation", "cancelled"]);

/** Em que linha da dica cada cobranca entra (os nomes medidos em 09/11/2026). */
function grupoDaCobranca(nome) {
  const texto = String(nome ?? "");
  if (texto === "ml_sale_fee") return "comissao";
  if (texto.startsWith("shp_")) return "frete";
  if (texto.startsWith("mp_") || texto.startsWith("financing")) return "tarifaMP";
  if (texto.startsWith("coupon")) return "cupom";
  return "outros";
}

/**
 * O resumo para guardar no pedido: `{ liquido, freteDoComprador, cobrancas, liberacao, liberado, estornado, pagamentos, lidoEm }`.
 * `pagamentos` sao os da venda (`/v1/payments/{id}`) e `frete` os achados pelo id do envio. Sem pagamento da venda, null.
 * So os aprovados contam (o pedido traz tambem tentativas recusadas de cartao).
 */
export function resumoDoMercadoPago({ pagamentos = [], frete = [] } = {}, { agora = new Date() } = {}) {
  const daVenda = (Array.isArray(pagamentos) ? pagamentos : []).filter((p) => p?.id);
  if (daVenda.length === 0) return null;
  const doFrete = (Array.isArray(frete) ? frete : []).filter((p) => p?.id && p.description === "marketplace_shipment");
  const todos = [...daVenda, ...doFrete];
  const estornado = todos.some((p) => SEM_VALOR_FINAL.has(p.status) || Number(p.transaction_amount_refunded ?? 0) > 0);
  const aprovados = todos.filter((p) => p.status === "approved");
  const freteAprovado = doFrete.filter((p) => p.status === "approved");

  const cobrancas = { comissao: 0, tarifaMP: 0, frete: 0, cupom: 0, outros: 0 };
  for (const pagamento of daVenda.filter((p) => p.status === "approved")) {
    for (const cobranca of Array.isArray(pagamento.charges_details) ? pagamento.charges_details : []) {
      // So o que sai da conta da loja ("collector"); o resto e entre o ML e o Mercado Pago.
      if (cobranca?.accounts?.from !== "collector") continue;
      const valor = centavos(cobranca.amounts?.original) - centavos(cobranca.amounts?.refunded);
      cobrancas[grupoDaCobranca(cobranca.name)] += valor;
    }
  }

  const liberacoes = aprovados.map((p) => p.money_release_date).filter(Boolean).sort();
  return {
    liquido: aprovados.length > 0 ? reais(aprovados.reduce((soma, p) => soma + centavos(p.transaction_details?.net_received_amount), 0)) : null,
    freteDoComprador: reais(freteAprovado.reduce((soma, p) => soma + centavos(p.transaction_details?.net_received_amount), 0)),
    cobrancas: Object.fromEntries(Object.entries(cobrancas).map(([grupo, valor]) => [grupo, reais(valor)])),
    liberacao: liberacoes.length > 0 ? liberacoes[liberacoes.length - 1] : null,
    liberado: aprovados.length > 0 && aprovados.every((p) => p.money_release_status === "released"),
    estornado,
    pagamentos: aprovados.length,
    lidoEm: new Date(agora).toISOString(),
  };
}

/**
 * Bate o liquido do Mercado Pago com receita − comissao − tarifa fixa − frete do Real. `{ estado, liquidoMP, liquidoRise,
 * diferenca }` com estado "bate" ou "diverge"; "sem" quando nao da para comparar (o `motivo` diz por que); null sem resumo.
 */
export function conferirComMercadoPago({ real, mercadoPago, status, carrinho = false }) {
  if (!mercadoPago) return null;
  // O estorno vem antes do liquido: o pagamento estornado deixa de ser "approved" e o liquido fica nulo.
  if (mercadoPago.estornado || status === "CANCELADO" || status === "DEVOLVIDO") return { estado: "sem", motivo: "estorno" };
  if (mercadoPago.liquido === null || mercadoPago.liquido === undefined) return null;
  // Carrinho com MAIS DE UM pedido: o envio (e o frete do comprador) e de todos, e somar em cada um contaria o frete duas
  // vezes. O ML poe `pack_id` ate na venda de um pedido so (medido em 09/11/2026), entao quem decide e quem chama.
  if (carrinho) return { estado: "sem", motivo: "carrinho" };
  if (!real || [real.receita, real.comissao, real.frete].some((valor) => valor === null || valor === undefined)) return { estado: "sem", motivo: "semReal" };
  // Frete ou comissao ainda estimados (o envio nao foi lido): a diferenca seria da estimativa, nao do Mercado Pago.
  if (Object.values(real.fontes ?? {}).includes("estimado")) return { estado: "sem", motivo: "estimado" };
  const rise = centavos(real.receita) - centavos(real.comissao) - centavos(real.tarifaFixa) - centavos(real.frete);
  const mp = centavos(mercadoPago.liquido);
  const diferenca = mp - rise;
  return {
    estado: Math.abs(diferenca) <= TOLERANCIA_CENTAVOS ? "bate" : "diverge",
    liquidoMP: reais(mp),
    liquidoRise: reais(rise),
    diferenca: reais(diferenca),
  };
}

/** O que a lista de Vendas precisa para o "~" e a dica do lucro (o resto do resumo fica no pedido). */
export function mercadoPagoParaTela(mercadoPago) {
  if (!mercadoPago || mercadoPago.liquido === null || mercadoPago.liquido === undefined) return null;
  const conferencia = mercadoPago.conferencia ?? null;
  return {
    estado: conferencia?.estado ?? null,
    liquidoMP: conferencia?.liquidoMP ?? mercadoPago.liquido,
    liquidoRise: conferencia?.liquidoRise ?? null,
    diferenca: conferencia?.diferenca ?? null,
    freteDoComprador: mercadoPago.freteDoComprador ?? 0,
    liberacao: mercadoPago.liberacao ?? null,
    liberado: Boolean(mercadoPago.liberado),
  };
}
