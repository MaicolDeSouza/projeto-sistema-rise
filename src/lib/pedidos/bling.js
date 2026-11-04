import { dataDeSaoPaulo, digitos, dinheiro, texto, vazio } from "./normalizado";

/**
 * As lojas do Bling que o Rise conhece. Os ids sao os mesmos de `LOJA_ML_NO_BLING` (canaisDeVenda/ml/bling.js)
 * e `LOJA_LI_NO_BLING` (canaisDeVenda/li/blingLoja.js); repetidos aqui porque aqueles modulos puxam a leitura
 * do Bling (banco), e o normalizador tem que continuar puro.
 */
// Rise_ML, ML_4h e MercadoShops: a MercadoShops (tipo MercadoShopsML) tambem recebe vendas do ML, com o numero do
// carrinho (pack) no numeroLoja (medido na VPS em 04/11/2026: 7 dos 15 pedidos do ML de 01 a 04/11 vieram por ela).
const LOJAS_DO_ML = new Set(["206326819", "203593931", "203901506"]);
const LOJA_DA_LI = "203478870";

/**
 * De onde veio um pedido do Bling: "bling" (digitado la, sem loja), "espelhoML" / "espelhoLI" (o Bling copiou do
 * canal; o pedido de verdade e o do ML ou da LI) ou "outra" (Shopee e afins: ignorado nesta fase).
 */
export function classificarLojaDoBling(lojaId) {
  const id = String(lojaId ?? "").trim();
  if (!id || id === "0") return "bling";
  if (LOJAS_DO_ML.has(id)) return "espelhoML";
  if (id === LOJA_DA_LI) return "espelhoLI";
  return "outra";
}

/** O `situacao` da NF-e do Bling (medido na documentacao v3). */
const SITUACAO_DA_NFE = {
  1: "pendente",
  2: "cancelada",
  3: "aguardando_recibo",
  4: "rejeitada",
  5: "autorizada",
  6: "emitida_danfe",
  7: "registrada",
  8: "enviada_aguardando_protocolo",
  9: "denegada",
  10: "consulta_situacao",
  11: "bloqueada",
};

/**
 * Pedido digitado no Bling no formato comum (spec 5.2). Entrada: o que a leitura (Tarefa 10) traz:
 *   pedido    = o `data` de GET /pedidos/vendas/{id}
 *   formas    = o `data` de GET /formas-pagamentos ([{ id, descricao }])
 *   situacoes = o `data` de GET /situacoes/modulos/{idDoModuloVendas} ([{ id, nome }])
 *   nfe       = o `data` de GET /nfe/{id} quando o pedido tem `notaFiscal.id`, senao null
 *
 * O Bling nao diz quanto o vendedor pagou de frete: `custoDoVendedor` fica null ("estimado") e o operador
 * informa na tela (Tarefa 9). A data e so o dia (00:00 de Sao Paulo), e o Bling nao devolve a data de
 * alteracao: `atualizadoNaOrigemEm` e a data da venda.
 */
export function normalizarPedidoBling({ pedido, formas = [], situacoes = [], nfe = null }) {
  const p = vazio();
  p.origem = "BLING";
  p.canal = "BLING";
  p.idExterno = String(pedido.id);
  p.numero = String(pedido.numero ?? pedido.id);
  p.blingPedidoId = String(pedido.id);
  p.blingNumero = String(pedido.numero ?? pedido.id);
  p.dataDaVenda = dataDeSaoPaulo(pedido.data);
  p.atualizadoNaOrigemEm = p.dataDaVenda;

  const contato = pedido.contato ?? {};
  p.comprador = { nome: texto(contato.nome), documento: digitos(contato.numeroDocumento), email: null, telefone: null };
  const transporte = pedido.transporte ?? {};
  const etiqueta = transporte.etiqueta ?? null;
  if (etiqueta && (etiqueta.endereco || etiqueta.cep)) {
    p.enderecoDeEntrega = {
      nome: texto(etiqueta.nome),
      endereco: texto(etiqueta.endereco),
      numero: texto(etiqueta.numero),
      complemento: texto(etiqueta.complemento),
      bairro: texto(etiqueta.bairro),
      cidade: texto(etiqueta.municipio),
      uf: texto(etiqueta.uf),
      cep: digitos(etiqueta.cep),
      referencia: null,
    };
  }

  const situacaoId = pedido.situacao?.id;
  const situacao = situacoes.find((s) => String(s.id) === String(situacaoId));
  p.statusDaOrigem = texto(situacao?.nome) ?? (situacaoId === undefined || situacaoId === null ? null : String(situacaoId));
  p.statusDaOrigemDetalhe = null;

  const parcelas = pedido.parcelas ?? [];
  p.pagamento = parcelas.map((parcela) => {
    const forma = formas.find((f) => String(f.id) === String(parcela.formaPagamento?.id));
    return {
      forma: texto(forma?.descricao),
      tipo: null,
      parcelas: parcelas.length,
      valor: dinheiro(parcela.valor),
      valorPago: null,
      status: null,
      aprovadoEm: null,
    };
  });

  p.itens = (pedido.itens ?? []).map((item, indice) => {
    const quantidade = Number(item.quantidade ?? 0);
    const unitario = dinheiro(item.valor);
    // No Bling o desconto do item e um percentual.
    const desconto = dinheiro((unitario * quantidade * Number(item.desconto ?? 0)) / 100);
    return {
      ordem: indice + 1,
      codigoNaOrigem: texto(item.codigo),
      idNaOrigem: item.produto?.id ? String(item.produto.id) : null,
      titulo: texto(item.descricao),
      quantidade,
      precoUnitario: unitario,
      desconto,
      total: dinheiro(unitario * quantidade - desconto),
      comissao: null,
    };
  });

  const totalProdutos = dinheiro(pedido.totalProdutos ?? p.itens.reduce((soma, item) => soma + item.total, 0));
  const descontoDoPedido = pedido.desconto ?? {};
  const desconto =
    String(descontoDoPedido.unidade ?? "REAL").toUpperCase() === "PERCENTUAL"
      ? dinheiro((totalProdutos * Number(descontoDoPedido.valor ?? 0)) / 100)
      : dinheiro(descontoDoPedido.valor ?? 0);
  const freteCobrado = dinheiro(transporte.frete ?? 0);
  p.totais = {
    totalProdutos,
    desconto,
    freteCobrado,
    total: dinheiro(pedido.total ?? totalProdutos + freteCobrado - desconto),
  };

  const volume = (transporte.volumes ?? [])[0] ?? null;
  const rastreio = texto(volume?.codigoRastreamento);
  // O Bling nao diz a forma de envio; ha pacote quando ha volume, transportadora ou frete cobrado.
  const temPacote = Boolean(volume || transporte.contato?.nome || freteCobrado > 0);
  const saiuEm = dataDeSaoPaulo(pedido.dataSaida);
  p.envio = {
    tipo: temPacote ? "transporte" : null,
    servico: texto(volume?.servico),
    transportadora: texto(transporte.contato?.nome),
    rastreio,
    link: rastreio && /BR$/i.test(rastreio) ? `https://rastreamento.correios.com.br/app/index.php?objeto=${rastreio}` : null,
    statusDaOrigem: null,
    substatus: null,
    situacaoDoPedido: p.statusDaOrigem,
    custoDoVendedor: null,
    fonteDoCusto: "estimado",
    cobradoDoCliente: freteCobrado,
    prazo: transporte.prazoEntrega === undefined || transporte.prazoEntrega === null ? null : Number(transporte.prazoEntrega),
    // A data de saida e o unico "postado em" que o Bling da; o status unificado conta 15 e 30 dias a partir dela.
    historico: saiuEm ? { postadoEm: saiuEm.toISOString() } : {},
  };

  p.nf = nfe
    ? {
        origem: "BLING",
        idExterno: nfe.id === undefined || nfe.id === null ? null : String(nfe.id),
        numero: nfe.numero === undefined || nfe.numero === null ? null : String(nfe.numero),
        serie: nfe.serie === undefined || nfe.serie === null ? null : String(nfe.serie),
        chave: texto(nfe.chaveAcesso),
        emitidaEm: dataDeSaoPaulo(nfe.dataEmissao),
        status: SITUACAO_DA_NFE[Number(nfe.situacao)] ?? (nfe.situacao === undefined || nfe.situacao === null ? null : String(nfe.situacao)),
        urlPdf: texto(nfe.linkPDF) ?? texto(nfe.linkDanfe),
        // O Bling entrega o XML no proprio campo, nao por link.
        urlXml: null,
        xml: texto(nfe.xml),
      }
    : null;

  p.historico = p.dataDaVenda && p.statusDaOrigem ? [{ em: p.dataDaVenda, statusDaOrigem: p.statusDaOrigem }] : [];

  return p;
}
