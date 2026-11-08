import { prazoDeDespachoLI } from "./despacho";
import { data, dataDeSaoPaulo, digitos, dinheiro, telefone, texto, vazio } from "./normalizado";

const CANCELADAS = new Set(["cancelled", "cancelling"]);

/**
 * A etiqueta do Enviali que vale para o pedido: a mais recente (`postage.date_time`) que nao esta cancelada
 * nem em cancelamento. Uma etiqueta cancelada e refeita deixa duas na lista, e a nova e a que custa.
 * Lista vazia ou so com canceladas: null (o pedido ainda nao tem etiqueta).
 */
export function escolherEtiquetaEnviali(lista) {
  const vivas = (lista ?? []).filter((item) => item?.postage && !CANCELADAS.has(item.postage.status));
  if (vivas.length === 0) return null;
  return [...vivas].sort((a, b) => String(b.postage.date_time ?? "").localeCompare(String(a.postage.date_time ?? "")))[0];
}

/** Os precos do Enviali vem em centavos. */
function reais(centavos) {
  return centavos === undefined || centavos === null ? null : dinheiro(Number(centavos) / 100);
}

/**
 * Pedido da Loja Integrada no formato comum (spec 5.2). Entrada: o que a leitura (Tarefa 10) traz:
 *   pedido    = GET /v1/pedido/{numero}
 *   historico = os `objects` de GET /v1/situacao_historico/search?numero= (ja desembrulhados)
 *   etiquetas = GET /enviali/v2/postage?search={numero} (a lista crua; a escolha e daqui)
 *
 * Frete do vendedor: envio pelo Enviali com etiqueta = o preco dela ("etiqueta": o `postage.price` quando ja
 * postada, senao a estimativa); Enviali sem etiqueta ainda = "estimado"; outra forma de envio (retirada,
 * a combinar) = 0 pelo proprio pedido ("pedido"). O status do envio sem Enviali vem da situacao do pedido.
 */
export function normalizarPedidoLI({ pedido, historico = [], etiquetas = [], nf = null }) {
  const p = vazio();
  p.origem = "LOJA_INTEGRADA";
  p.canal = "LOJA_INTEGRADA";
  p.idExterno = String(pedido.numero);
  p.numero = String(pedido.numero);
  p.dataDaVenda = dataDeSaoPaulo(pedido.data_criacao);
  p.atualizadoNaOrigemEm = dataDeSaoPaulo(pedido.data_modificacao) ?? p.dataDaVenda;

  const cliente = pedido.cliente ?? {};
  p.comprador = {
    nome: texto(cliente.nome) ?? texto(cliente.razao_social),
    documento: digitos(cliente.cpf) ?? digitos(cliente.cnpj),
    email: texto(cliente.email),
    telefone: telefone(cliente.telefone_celular) ?? telefone(cliente.telefone_principal),
  };
  const endereco = pedido.endereco_entrega ?? null;
  if (endereco) {
    p.enderecoDeEntrega = {
      nome: texto(endereco.nome) ?? texto(endereco.razao_social),
      endereco: texto(endereco.endereco),
      numero: texto(endereco.numero),
      complemento: texto(endereco.complemento),
      bairro: texto(endereco.bairro),
      cidade: texto(endereco.cidade),
      uf: texto(endereco.estado),
      cep: digitos(endereco.cep),
      referencia: texto(endereco.referencia),
    };
  }

  p.statusDaOrigem = texto(pedido.situacao?.codigo);
  p.statusDaOrigemDetalhe = texto(pedido.situacao?.nome);

  p.pagamento = (pedido.pagamentos ?? []).map((pg) => ({
    forma: texto(pg.forma_pagamento?.nome) ?? texto(pg.forma_pagamento?.codigo),
    tipo: texto(pg.pagamento_tipo) ?? texto(pg.forma_pagamento?.codigo),
    parcelas: Number(pg.parcelamento?.numero_parcelas ?? 1),
    valor: dinheiro(pg.valor),
    valorPago: dinheiro(pg.valor_pago ?? pg.valor),
    // A LI nao tem status por pagamento: a situacao do pedido e que diz se foi pago.
    status: null,
    aprovadoEm: null,
  }));

  p.itens = (pedido.itens ?? []).map((item, indice) => {
    const quantidade = Number(item.quantidade ?? 0);
    const unitario = dinheiro(item.preco_venda);
    const cheio = dinheiro(item.preco_cheio ?? item.preco_venda);
    return {
      ordem: Number(item.linha ?? indice + 1),
      codigoNaOrigem: texto(item.sku),
      idNaOrigem: item.produto?.id_externo === undefined || item.produto?.id_externo === null ? texto(item.id) : String(item.produto.id_externo),
      titulo: texto(item.nome),
      quantidade,
      precoUnitario: unitario,
      desconto: dinheiro(Math.max(0, cheio - unitario) * quantidade),
      total: dinheiro(item.preco_subtotal ?? unitario * quantidade),
      comissao: null,
    };
  });

  p.totais = {
    totalProdutos: dinheiro(pedido.valor_subtotal),
    desconto: dinheiro(pedido.valor_desconto),
    freteCobrado: dinheiro(pedido.valor_envio),
    total: dinheiro(pedido.valor_total),
  };

  const envioDaLoja = (pedido.envios ?? [])[0] ?? null;
  const forma = envioDaLoja?.forma_envio ?? {};
  const peloEnviali = String(forma.tipo ?? "").toLowerCase() === "enviali";
  const etiqueta = peloEnviali ? escolherEtiquetaEnviali(etiquetas) : null;
  const postagem = etiqueta?.postage ?? null;
  const rastreio = texto(postagem?.tracking_code) ?? texto(envioDaLoja?.objeto);
  let custoDoVendedor = null;
  let fonteDoCusto = "estimado";
  if (!peloEnviali && envioDaLoja) {
    custoDoVendedor = 0;
    fonteDoCusto = "pedido";
  } else if (etiqueta) {
    custoDoVendedor = (postagem.status === "posted" ? reais(postagem.price) : null) ?? reais(etiqueta.estimate?.price) ?? reais(postagem.price);
    fonteDoCusto = "etiqueta";
  }
  p.envio = {
    tipo: texto(forma.tipo),
    servico: texto(postagem?.service_name) ?? texto(forma.code),
    transportadora: texto(forma.nome),
    rastreio,
    link: rastreio && /BR$/i.test(rastreio) ? `https://rastreamento.correios.com.br/app/index.php?objeto=${rastreio}` : null,
    statusDaOrigem: texto(postagem?.tracking_status) ?? texto(postagem?.status),
    substatus: texto(postagem?.status),
    situacaoDoPedido: p.statusDaOrigem,
    custoDoVendedor,
    fonteDoCusto,
    cobradoDoCliente: envioDaLoja ? dinheiro(envioDaLoja.valor) : null,
    prazo: envioDaLoja?.prazo === undefined || envioDaLoja?.prazo === null ? null : Number(envioDaLoja.prazo),
    historico: {
      postadoEm: postagem?.status === "posted" ? (data(postagem.date_time)?.toISOString() ?? null) : null,
      entregueEm: null,
    },
  };

  // A NF que a LI emitiu (GET /pedido_nf/{id}, fase 2); a data vem sem fuso, de Sao Paulo, como a do pedido.
  if (nf) {
    p.nf = {
      origem: "LOJA_INTEGRADA",
      idExterno: nf.id === undefined || nf.id === null ? null : String(nf.id),
      numero: nf.numero === undefined || nf.numero === null ? null : String(nf.numero),
      serie: nf.serie === undefined || nf.serie === null ? null : String(nf.serie),
      chave: texto(nf.access_key),
      emitidaEm: dataDeSaoPaulo(nf.data),
      status: nf.enviada ? "authorized" : "pending",
      urlPdf: texto(nf.url),
      urlXml: texto(nf.url_xml),
      xml: null,
    };
  }

  p.historico = (historico ?? [])
    .map((h) => ({ em: dataDeSaoPaulo(h.data), statusDaOrigem: texto(h.situacao?.codigo) }))
    .filter((h) => h.em && h.statusDaOrigem)
    .sort((a, b) => a.em - b.em);

  // O prazo de envio: 24 h depois do pagamento (regra do dono em 08/11/2026; `prazoDeDespachoLI`).
  Object.assign(p.envio, prazoDeDespachoLI({ historico: p.historico, statusDaOrigem: p.statusDaOrigem, dataDaVenda: p.dataDaVenda, tipoDeEnvio: p.envio.tipo }));

  return p;
}
