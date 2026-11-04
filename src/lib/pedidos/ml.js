import { data, digitos, dinheiro, telefone, texto, vazio } from "./normalizado";

/**
 * Pedido do Mercado Livre no formato comum (spec 5.2). Entrada: o que a leitura (Tarefa 10) traz da API:
 *   order     = GET /orders/{id}
 *   billing   = GET /orders/{id}/billing_info (o documento do comprador) ou null
 *   shipments = GET /orders/{id}/shipments (a lista com `type` forward/return), so para o registro
 *   shipment  = GET /shipments/{id} do envio de ida (X-Api-Version 2, views=destination) ou null
 *   retorno   = GET /shipments/{id} do envio de retorno (devolucao) ou null
 *   invoice   = GET /users/{id}/invoices/orders/{order_id} ou null (404 = nao emitida)
 *
 * Regras fixadas na spec: comissao do item = sale_fee x quantity (a medir no 1o pedido real se o sale_fee e
 * por unidade); o frete do vendedor e o `order_cost` do envio de ida ("envio"); sem envio lido, o lucro usa a
 * estimativa ("estimado"). Devolucao: retorno entregue ou tag `refunded`; o custo e o `order_cost` do retorno
 * (0 quando o ML ou o comprador bancou).
 */
export function normalizarPedidoML({ order, billing = null, shipments = [], shipment = null, retorno = null, invoice = null }) {
  const p = vazio();
  p.origem = "MERCADO_LIVRE";
  p.canal = "MERCADO_LIVRE";
  p.idExterno = String(order.id);
  p.numero = String(order.id);
  p.packId = order.pack_id ? String(order.pack_id) : null;
  p.dataDaVenda = data(order.date_created);
  p.atualizadoNaOrigemEm = data(order.last_updated) ?? p.dataDaVenda;

  const info = billing?.billing_info ?? null;
  const extra = (tipo) => texto(info?.additional_info?.find((item) => item.type === tipo)?.value);
  const nome =
    [extra("FIRST_NAME") ?? texto(order.buyer?.first_name), extra("LAST_NAME") ?? texto(order.buyer?.last_name)]
      .filter(Boolean)
      .join(" ") ||
    texto(order.buyer?.nickname);
  const endereco = shipment?.receiver_address ?? null;
  p.comprador = {
    nome: nome || null,
    documento: digitos(info?.doc_number),
    email: texto(order.buyer?.email),
    telefone: telefone(endereco?.receiver_phone ?? order.buyer?.phone?.number),
  };
  if (endereco) {
    p.enderecoDeEntrega = {
      nome: texto(endereco.receiver_name),
      endereco: texto(endereco.street_name) ?? texto(endereco.address_line),
      numero: texto(endereco.street_number),
      complemento: texto(endereco.comment),
      bairro: texto(endereco.neighborhood?.name),
      cidade: texto(endereco.city?.name),
      // O ML escreve a UF como "BR-RS".
      uf: texto(endereco.state?.id)?.replace(/^BR-/, "") ?? null,
      cep: digitos(endereco.zip_code),
      referencia: null,
    };
  }

  p.statusDaOrigem = texto(order.status);
  p.statusDaOrigemDetalhe = texto(order.status_detail);
  p.tags = [...(order.tags ?? [])];

  p.pagamento = (order.payments ?? []).map((pg) => ({
    forma: texto(pg.payment_method_id) ?? texto(pg.payment_type),
    tipo: texto(pg.payment_type),
    parcelas: Number(pg.installments ?? 1),
    valor: dinheiro(pg.transaction_amount),
    valorPago: dinheiro(pg.total_paid_amount ?? pg.transaction_amount),
    status: texto(pg.status),
    aprovadoEm: data(pg.date_approved),
  }));

  p.itens = (order.order_items ?? []).map((item, indice) => {
    const quantidade = Number(item.quantity ?? 0);
    const unitario = dinheiro(item.unit_price);
    const cheio = dinheiro(item.full_unit_price ?? item.unit_price);
    return {
      ordem: indice + 1,
      codigoNaOrigem: texto(item.item?.seller_sku) ?? texto(item.item?.seller_custom_field),
      idNaOrigem: texto(item.item?.id),
      titulo: texto(item.item?.title),
      quantidade,
      precoUnitario: unitario,
      desconto: dinheiro(Math.max(0, cheio - unitario) * quantidade),
      total: dinheiro(unitario * quantidade),
      comissao: item.sale_fee === undefined || item.sale_fee === null ? null : dinheiro(Number(item.sale_fee) * quantidade),
    };
  });

  const freteCobrado = dinheiro(
    shipment?.shipping_option?.cost ?? (order.payments ?? []).reduce((soma, pg) => soma + Number(pg.shipping_cost ?? 0), 0),
  );
  const totalProdutos = dinheiro(order.total_amount ?? p.itens.reduce((soma, item) => soma + item.total, 0));
  const desconto = dinheiro(order.coupon?.amount ?? 0);
  p.totais = { totalProdutos, desconto, freteCobrado, total: dinheiro(totalProdutos + freteCobrado - desconto) };

  const historicoDoEnvio = shipment?.status_history ?? {};
  const iso = (valor) => data(valor)?.toISOString() ?? null;
  p.envio = {
    tipo: texto(shipment?.logistic_type),
    servico: texto(shipment?.shipping_option?.name),
    transportadora: texto(shipment?.tracking_method),
    rastreio: texto(shipment?.tracking_number),
    link: texto(shipment?.tracking_url),
    statusDaOrigem: texto(shipment?.status),
    substatus: texto(shipment?.substatus),
    situacaoDoPedido: p.statusDaOrigem,
    custoDoVendedor: shipment ? dinheiro(shipment.order_cost ?? 0) : null,
    fonteDoCusto: shipment ? "envio" : "estimado",
    cobradoDoCliente: freteCobrado,
    prazo: iso(shipment?.shipping_option?.estimated_delivery_time?.date),
    historico: {
      prontoEm: iso(historicoDoEnvio.date_ready_to_ship),
      postadoEm: iso(historicoDoEnvio.date_shipped),
      entregueEm: iso(historicoDoEnvio.date_delivered),
      naoEntregueEm: iso(historicoDoEnvio.date_not_delivered),
      canceladoEm: iso(historicoDoEnvio.date_cancelled),
      devolvidoEm: iso(historicoDoEnvio.date_returned),
    },
  };

  const devolvido = retorno?.status === "delivered" || p.tags.includes("refunded");
  p.devolucao = devolvido
    ? {
        entregueEm: data(retorno?.status_history?.date_delivered) ?? data(retorno?.last_updated) ?? null,
        custoDoRetorno: dinheiro(retorno?.order_cost ?? 0),
      }
    : null;

  p.nf = invoice
    ? {
        origem: "MERCADO_LIVRE",
        idExterno: invoice.id === undefined || invoice.id === null ? null : String(invoice.id),
        numero: texto(invoice.invoice_number),
        serie: texto(invoice.invoice_series),
        chave: texto(invoice.invoice_key),
        emitidaEm: data(invoice.issued_date),
        status: texto(invoice.status),
        urlPdf: texto(invoice.pdf_url),
        urlXml: texto(invoice.xml_url),
        xml: null,
      }
    : null;

  // O ML nao lista a historia do pedido; o que se sabe sao as datas do pagamento e do envio.
  const passos = [{ em: p.dataDaVenda, statusDaOrigem: "created" }];
  const aprovado = p.pagamento.find((pg) => pg.status === "approved" && pg.aprovadoEm);
  if (aprovado) passos.push({ em: aprovado.aprovadoEm, statusDaOrigem: "paid" });
  if (historicoDoEnvio.date_shipped) passos.push({ em: data(historicoDoEnvio.date_shipped), statusDaOrigem: "shipped" });
  if (historicoDoEnvio.date_delivered) passos.push({ em: data(historicoDoEnvio.date_delivered), statusDaOrigem: "delivered" });
  if (p.devolucao?.entregueEm) passos.push({ em: p.devolucao.entregueEm, statusDaOrigem: "returned" });
  p.historico = passos.filter((passo) => passo.em).sort((a, b) => a.em - b.em);

  void shipments;
  return p;
}
