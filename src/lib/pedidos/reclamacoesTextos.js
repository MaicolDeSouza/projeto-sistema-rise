/**
 * Reclamacoes do Mercado Livre: os grupos de motivo e os textos (20/11/2026, pedido do dono: "quantas vendas foram abertas
 * reclamacoes por arrependimento do cliente e nao afeta minha reputacao e quantas por problema no produto e afeta"). Sem
 * imports: a leitura, o Telegram, a tela e o teste leem o mesmo arquivo.
 *
 * O motivo vem do ML como um codigo (PDD9939) com um `name` em ingles e o `flow` (medidos na conta em 20/11/2026):
 * post_purchase_delivered (depois de entregue), mediations_undelivered (nao entregue) e cancel_sale (a loja cancelou).
 */

export const GRUPOS = ["ARREPENDIMENTO", "PRODUTO", "ENTREGA", "VENDEDOR", "OUTRO"];

export const TEXTO_DO_GRUPO = {
  ARREPENDIMENTO: "Arrependimento do comprador",
  PRODUTO: "Problema no produto",
  ENTREGA: "Problema na entrega",
  VENDEDOR: "Falha da loja",
  OUTRO: "Outro motivo",
};

export const TEXTO_DO_TIPO = { mediations: "Mediação", returns: "Devolução", cancel_purchase: "Cancelamento da compra", cancel_sale: "Cancelamento da venda" };

export const TEXTO_DA_RESOLUCAO = {
  item_returned: "Produto devolvido",
  payment_refunded: "Pagamento devolvido",
  coverage_decision: "O ML cobriu",
  timeout: "Prazo encerrado",
  no_bpp: "Sem cobertura",
  product_delivered: "Produto entregue",
  low_cost: "Reembolso sem devolução",
  warehouse_decision: "Decisão do depósito",
  return_expired: "Devolução expirada",
  worked_out_with_seller: "Resolvido com a loja",
};

/**
 * O grupo de um motivo, pelo `name` e pelo `flow` do ML. Arrependimento primeiro (ele aparece nos tres fluxos); depois a
 * falha da loja (sem estoque, sem resposta, etiqueta, ou a loja cancelou); o produto (depois de entregue, o que nao e
 * arrependimento e sobre o produto); a entrega; o resto e "outro" (o ML tem motivos "Outro motivo" em todo fluxo).
 */
export function grupoDoMotivo({ nome, fluxo } = {}) {
  const n = String(nome ?? "");
  if (/repentant/.test(n)) return "ARREPENDIMENTO";
  if (/out_of_stock|respondent_unanswered|unprinted_label/.test(n) || fluxo === "cancel_sale") return "VENDEDOR";
  if (/not_working|different|broken|fake|incomplete|missing|defect|damaged/.test(n) || fluxo === "post_purchase_delivered") return "PRODUTO";
  if (/(^|_)deliver(y|ed)(_|$)|not_receive|receiver_address/.test(n)) return "ENTREGA";
  return "OUTRO";
}

/**
 * O motivo em portugues claro, pelo `name` do ML. O `detail` que o ML manda e a resposta do comprador a ultima pergunta do
 * formulario ("Chegou bem" para o produto que nao funciona), e sozinho engana; sem o nome aqui, vale o `detail`.
 */
export const TEXTO_DO_MOTIVO = {
  repentant_buyer: "Chegou em boas condições, mas não quer mais",
  undelivered_repentant_buyer: "Arrependeu-se antes de receber",
  repentant_buyer_other: "Arrependeu-se (outros)",
  not_working_item: "Não funciona",
  broken_item: "Chegou quebrado",
  different_than_published: "Diferente do anúncio",
  different_item_other: "Recebeu outro produto",
  fake_different: "Não era da marca original",
  delivered_but_not_receive_package: "Consta entregue, mas não recebeu",
  estimated_delivery_out_of_time: "Não pode esperar a entrega",
  need_earlier_delivery: "Precisa receber antes",
  change_receiver_address: "Não pode receber no endereço",
  out_of_stock: "Loja sem estoque",
  respondent_unanswered: "A loja não respondeu",
  unprinted_label: "Etiqueta não impressa",
};

export function textoDoMotivo({ nome, detalhe } = {}) {
  return TEXTO_DO_MOTIVO[nome] ?? detalhe ?? null;
}

/** "afeta a reputação" / "não afeta a reputação" / "" (o ML nao disse). */
export function textoDaReputacao(afeta) {
  if (afeta === true) return "afeta a reputação";
  if (afeta === false) return "não afeta a reputação";
  return "";
}

/**
 * A nota de devolucao de uma reclamacao (pedido do dono em 20/11/2026: "quero gerar a nf de devolução assim que o cliente
 * postar o produto, pois muitos produtos nunca chegam"). Pela situacao da devolucao no ML:
 * - AGUARDANDO_POSTAGEM: devolucao criada, etiqueta pronta, o cliente ainda nao postou (pending, label_generated, failed...).
 * - FALTA_NOTA / NOTA_EMITIDA: o cliente postou (shipped e o que vem depois, inclusive o not_delivered, que e a que se perde).
 * - NAO_POSTADA: cancelada, expirada ou encerrada sem envio: nada voltou, nao ha nota de devolucao.
 * Sem devolucao (`status` nulo): nulo.
 */
const POSTADA = new Set(["shipped", "pending_delivered", "delivered", "not_delivered"]);
const SEM_ENVIO = new Set(["cancelled", "pending_cancel", "expired", "pending_expiration", "closed"]);
export function situacaoDaNota({ status, notaEm = null } = {}) {
  if (!status) return null;
  if (POSTADA.has(status)) return notaEm ? "NOTA_EMITIDA" : "FALTA_NOTA";
  if (SEM_ENVIO.has(status)) return "NAO_POSTADA";
  return "AGUARDANDO_POSTAGEM";
}

/** Onde esta o produto que voltou: A_CAMINHO, CHEGOU ou NAO_CHEGOU; nulo antes de postar ou sem envio. */
export function situacaoDaChegada(status) {
  if (status === "shipped" || status === "pending_delivered") return "A_CAMINHO";
  if (status === "delivered") return "CHEGOU";
  if (status === "not_delivered") return "NAO_CHEGOU";
  return null;
}

export const TEXTO_DA_NOTA = {
  AGUARDANDO_POSTAGEM: "Aguardando postagem",
  FALTA_NOTA: "Falta a nota",
  NOTA_EMITIDA: "Nota emitida",
  NAO_POSTADA: "Não postada",
};

export const TEXTO_DA_CHEGADA = { A_CAMINHO: "A caminho", CHEGOU: "Chegou", NAO_CHEGOU: "Não chegou" };

/** O faturador do ML, onde a nota de devolucao e emitida (a API nao emite essa nota; medido na documentacao em 20/11/2026). */
export const LINK_DO_FATURADOR_ML = "https://myaccount.mercadolivre.com.br/invoices/emitir-nota-fiscal";
