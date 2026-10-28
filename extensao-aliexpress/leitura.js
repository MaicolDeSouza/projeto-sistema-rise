/**
 * Leitura das respostas da pagina "Meus pedidos" do AliExpress (extensao "Rise AliExpress", spec
 * docs/superpowers/specs/2026-10-28-aliexpress-em-compras-design.md). Funcoes puras, sem rede e sem DOM: a pagina usa,
 * e o teste (scripts/teste-extensao-aliexpress.js) carrega este arquivo como o Chrome carrega.
 *
 * Os formatos foram medidos ao vivo em 28/10/2026 na conta do dono:
 * - mtop.aliexpress.trade.buyer.order.list: `data.data["pc_om_list_order_<id>"].fields` por pedido;
 * - mtop.aliexpress.trade.buyer.order.detail: bloco `detail_order_price_block` (Subtotal, Enviando, Imposto, Total);
 * - mtop.ae.ld.querydetail: `module.trackingDetailLineList` (um por pacote).
 * So sai daqui o que o Rise usa: nunca destinatario, endereco, telefone nem ids de pagamento.
 */
(function () {
  const MESES = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };

  const semAcento = (texto) =>
    String(texto ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();

  /** "26 out, 2026" -> ISO ao meio-dia UTC; nao lido -> null (a mesma regra de src/lib/compras/aliexpress/regras.js). */
  function lerData(texto) {
    const curta = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/.exec(semAcento(texto));
    if (!curta || !(curta[2] in MESES)) return null;
    const dia = Number(curta[1]);
    const mes = MESES[curta[2]];
    const data = new Date(Date.UTC(Number(curta[3]), mes, dia, 12));
    return data.getUTCDate() === dia && data.getUTCMonth() === mes ? data.toISOString() : null;
  }

  /** "//www.aliexpress.com/x" -> "https://www.aliexpress.com/x"; vazio -> null. */
  function urlCompleta(valor) {
    const texto = String(valor ?? "").trim();
    if (!texto) return null;
    if (texto.startsWith("//")) return `https:${texto}`;
    return /^https?:\/\//i.test(texto) ? texto : null;
  }

  const textoOuNulo = (valor) => {
    const texto = String(valor ?? "").trim();
    return texto ? texto : null;
  };
  const idOuNulo = (valor) => (/^\d+$/.test(String(valor ?? "")) ? String(valor) : null);

  /** O texto da opcao ("Color Name: 2M"), a partir dos `skuAttrs`. */
  function opcaoDe(skuAttrs) {
    const partes = (Array.isArray(skuAttrs) ? skuAttrs : [])
      .map((atributo) => [textoOuNulo(atributo?.name), textoOuNulo(atributo?.text)].filter(Boolean).join(": "))
      .filter(Boolean);
    return partes.length ? partes.join(" · ") : null;
  }

  const CHAVES_DO_PEDIDO = ["orderId", "dataTexto", "dataIso", "statusTexto", "statusCodigo", "loja", "lojaId", "totalTexto", "moeda", "linhas"];
  const CHAVES_DA_LINHA = ["orderLineId", "productId", "skuId", "opcao", "titulo", "urlDoItem", "urlDaFoto", "quantidade", "precoTexto"];

  /** So as chaves que o Rise aceita (o resto nao sai da pagina). */
  function limparPedido(pedido) {
    const limpo = {};
    for (const chave of CHAVES_DO_PEDIDO) limpo[chave] = pedido[chave] ?? null;
    limpo.linhas = (pedido.linhas ?? []).map((linha) => {
      const so = {};
      for (const chave of CHAVES_DA_LINHA) so[chave] = linha[chave] ?? null;
      return so;
    });
    return limpo;
  }

  /** Um pedido da lista (`fields` do componente pc_om_list_order). */
  function pedidoDaArvore(fields) {
    if (!fields || !idOuNulo(fields.orderId)) return null;
    const codigo = Number(fields.utParams?.args?.orderStatus);
    const linhas = (Array.isArray(fields.orderLines) ? fields.orderLines : [])
      .filter((linha) => idOuNulo(linha?.orderLineId) && idOuNulo(linha?.productId))
      .map((linha) => ({
        orderLineId: String(linha.orderLineId),
        productId: String(linha.productId),
        skuId: idOuNulo(linha.skuId),
        opcao: opcaoDe(linha.skuAttrs),
        titulo: textoOuNulo(linha.itemTitle) ?? "(sem título)",
        urlDoItem: urlCompleta(linha.itemDetailUrl),
        urlDaFoto: urlCompleta(linha.itemImgUrl),
        quantidade: Number(linha.quantity) || 1,
        precoTexto: textoOuNulo(linha.itemPriceText) ?? "",
      }));
    return limparPedido({
      orderId: String(fields.orderId),
      dataTexto: textoOuNulo(fields.orderDateText) ?? "",
      dataIso: lerData(fields.orderDateText),
      statusTexto: textoOuNulo(fields.statusText) ?? "",
      statusCodigo: Number.isFinite(codigo) ? codigo : null,
      loja: textoOuNulo(fields.storeName),
      lojaId: (/\/store\/(\d+)/.exec(String(fields.storePageUrl ?? "")) ?? [])[1] ?? null,
      totalTexto: textoOuNulo(fields.totalPriceText) ?? "",
      moeda: textoOuNulo(fields.currencyCode) ?? "",
      linhas,
    });
  }

  /** O `data` da resposta da lista -> pedidos da pagina, se tem mais e qual pagina foi. */
  function pedidosDaResposta(data) {
    const componentes = data?.data ?? {};
    const pedidos = [];
    let corpo = null;
    for (const componente of Object.values(componentes)) {
      if (componente?.type === "pc_om_list_order") {
        const pedido = pedidoDaArvore(componente.fields);
        if (pedido && pedido.linhas.length) pedidos.push(pedido);
      } else if (componente?.type === "pc_om_list_body") {
        corpo = componente.fields;
      }
    }
    return { pedidos, hasMore: corpo?.hasMore === true, pageIndex: Number.isFinite(Number(corpo?.pageIndex)) ? Number(corpo.pageIndex) : null };
  }

  /** O `data` do detalhe do pedido -> os textos de preco (os titulos sao os da pagina em portugues). */
  function detalheDaResposta(data) {
    const vazio = { subtotalTexto: null, freteTexto: null, impostoTexto: null, totalTexto: null };
    const bloco = Object.values(data?.data ?? {}).find((componente) => componente?.type === "detail_order_price_block")?.fields;
    if (!bloco) return vazio;
    const resultado = { ...vazio, totalTexto: textoOuNulo(bloco.totalPrice?.value) };
    for (const linha of Array.isArray(bloco.priceDetails) ? bloco.priceDetails : []) {
      const titulo = semAcento(linha?.title);
      if (/^subtotal/.test(titulo)) resultado.subtotalTexto = textoOuNulo(linha.value);
      else if (/envi|frete|shipping/.test(titulo)) resultado.freteTexto = textoOuNulo(linha.value);
      else if (/impost|tax/.test(titulo)) resultado.impostoTexto = textoOuNulo(linha.value);
    }
    return resultado;
  }

  const msOuNulo = (valor) => (Number.isFinite(Number(valor)) && Number(valor) > 0 ? Number(valor) : null);

  /** O `module` do rastreio -> pacotes (ate 30 eventos cada, do mais recente). Endereco e destinatario ficam de fora. */
  function rastreioDaResposta(module) {
    const linhas = Array.isArray(module?.trackingDetailLineList) ? module.trackingDetailLineList : [];
    const pacotes = linhas
      .filter((linha) => textoOuNulo(linha?.mailNo))
      .map((linha) => ({
        codigo: String(linha.mailNo).trim(),
        codigoOrigem: textoOuNulo(linha.originMailNo),
        transportadora: textoOuNulo(linha.logisticsCarrierName),
        previsaoTexto: textoOuNulo(linha.etaInfo?.etaTimeText),
        previsaoInicio: msOuNulo(linha.etaInfo?.beginEtaTime),
        previsaoFim: msOuNulo(linha.etaInfo?.endEtaTime),
        eventos: (Array.isArray(linha.detailList) ? linha.detailList : [])
          .map((evento) => ({ em: msOuNulo(evento?.time) ?? 0, descricao: textoOuNulo(evento?.trackingDetailDesc) ?? "", nome: textoOuNulo(evento?.trackingName), codigo: textoOuNulo(evento?.trackingPrimaryCode) }))
          .filter((evento) => evento.descricao)
          .sort((a, b) => b.em - a.em)
          .slice(0, 30),
        itens: (Array.isArray(linha.packageItemList) ? linha.packageItemList : [])
          .filter((item) => idOuNulo(item?.itemId))
          .map((item) => ({ productId: String(item.itemId), skuId: idOuNulo(item.skuId), quantidade: Number(item.count) || 0 })),
      }));
    return { pacotes };
  }

  /** A "Ver tudo" para quando todos os pedidos da pagina sao anteriores ao corte que o Rise mandou. */
  function devePararDeLer(pedidos, lerDesdeIso) {
    if (!pedidos?.length || !lerDesdeIso) return false;
    return pedidos.every((pedido) => pedido.dataIso && pedido.dataIso < lerDesdeIso);
  }

  /**
   * Da "Ver tudo" so seguem os pedidos a partir do corte: a ultima pagina lida mistura pedidos novos com antigos
   * (o ensaio de 28/10 trouxe concluidos de agosto com corte em 28/09). Sem data lida, segue (o Rise decide).
   */
  function aPartirDoCorte(pedidos, lerDesdeIso) {
    if (!lerDesdeIso) return pedidos;
    return (pedidos ?? []).filter((pedido) => !pedido.dataIso || pedido.dataIso >= lerDesdeIso);
  }

  globalThis.RiseLeitura = { lerData, urlCompleta, limparPedido, pedidoDaArvore, pedidosDaResposta, detalheDaResposta, rastreioDaResposta, devePararDeLer, aPartirDoCorte };
})();
