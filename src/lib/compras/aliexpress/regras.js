/**
 * Regras puras da importacao do AliExpress (spec 2026-10-28-aliexpress-em-compras-design.md). Sem imports: a extensao
 * do Chrome e o servidor leem os mesmos textos da pagina, e o teste roda sem banco.
 *
 * A pagina "Meus pedidos" e lida em portugues e em reais (a extensao recusa outro idioma ou moeda): "26 out, 2026",
 * "R$57,49", "Enviado parcialmente".
 */

const MESES = { jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5, jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11 };

const semAcento = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** "R$57,49" / "R$ 1.234,56" -> numero. Outra moeda ("US $1.00") ou texto que nao e preco -> null (nunca chuta). */
export function lerPreco(texto) {
  const limpo = String(texto ?? "").replace(/\s+/g, "");
  const achado = /^R\$(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/.exec(limpo);
  if (!achado) return null;
  const inteiro = Number(achado[1].replace(/\./g, ""));
  const centavos = achado[2] ? Number(achado[2].padEnd(2, "0")) : 0;
  return Math.round(inteiro * 100 + centavos) / 100;
}

/**
 * "26 out, 2026" ou "2026-10-26" -> Date ao meio-dia UTC daquele dia (meio-dia: o dia nao muda em nenhum fuso do
 * Brasil). Texto que nao se le ("Hoje", formato novo) -> null; quem chama decide o que fazer, nunca uma data inventada.
 */
export function lerData(texto) {
  const limpo = semAcento(texto);
  let dia;
  let mes;
  let ano;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(limpo);
  const curta = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s+(\d{4})$/.exec(limpo);
  if (iso) [ano, mes, dia] = [Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])];
  else if (curta && curta[2] in MESES) [dia, mes, ano] = [Number(curta[1]), MESES[curta[2]], Number(curta[3])];
  else return null;
  const data = new Date(Date.UTC(ano, mes, dia, 12));
  return data.getUTCDate() === dia && data.getUTCMonth() === mes ? data : null;
}

/** O anuncio (e a opcao, se o link tiver `sku_id=`) de um link de produto do AliExpress. Outro site -> null. */
export function anuncioDoLink(texto) {
  const valor = String(texto ?? "");
  if (!/aliexpress\./i.test(valor) && !valor.startsWith("//")) return null;
  const produto = /\/item\/(\d+)\.html/i.exec(valor);
  if (!produto) return null;
  const sku = /[?&]sku_?id=(\d+)/i.exec(valor);
  return { productId: produto[1], skuId: sku ? sku[1] : null };
}

/** O codigo do vinculo do fornecedor AliExpress: "anuncio:opcao" (a opcao vazia quando o anuncio nao tem opcoes). */
export function codigoDoVinculo(productId, skuId) {
  return `${productId}:${skuId ?? ""}`;
}

/**
 * A situacao do pedido no AliExpress. O codigo (`orderStatus`) e o que a lista traz; os conhecidos foram medidos em
 * 28/10/2026 (7 = enviado parcialmente, 8 = aguardando a entrega). O texto decide quando o codigo e outro.
 * Cancelado vence entregue: "Pedido fechado" depois de entregue e reembolso.
 */
export function situacaoDoAliExpress({ codigo, texto }) {
  const t = semAcento(texto);
  const cancelado = /cancelad|fechad|reembols|encerrad/.test(t);
  const aguardandoPagamento = /ser pago|aguardando pagamento|pagamento pendente/.test(t);
  const entregue = !cancelado && (/conclu|entregue|recebid|finalizad/.test(t) && !/aguardando a entrega/.test(t));
  const aberto = !cancelado && !entregue && !aguardandoPagamento && (codigo === 7 || codigo === 8 || /envi|entrega|process|preparando|aguardando/.test(t));
  return { aberto, entregue, cancelado, aguardandoPagamento };
}

const AVISO_CANCELADO_COM_ESTOQUE = "Cancelado no AliExpress, mas há estoque lançado.";

/**
 * O status do pedido de compra depois de ler a situacao no AliExpress. So o cancelamento muda alguma coisa, e so
 * quando nada foi lancado: estoque lancado nao some por causa de um reembolso. Entregue nao fecha (o dono confere a
 * caixa e lanca); FINALIZADO e CANCELADO nao voltam.
 */
export function statusNoRise({ situacao, statusAtual, temLancamento }) {
  if (statusAtual === "FINALIZADO" || statusAtual === "CANCELADO") return { status: statusAtual, aviso: null };
  if (situacao?.cancelado) {
    if (!temLancamento) return { status: "CANCELADO", aviso: null };
    return { status: statusAtual, aviso: AVISO_CANCELADO_COM_ESTOQUE };
  }
  return { status: statusAtual, aviso: null };
}

/** "dd/mm" no fuso de Sao Paulo. */
export function formatarDataCurta(data) {
  return new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
}

/** Os avisos ambar do pedido do AliExpress, na ordem em que a tela os mostra. Nenhum = nada a fazer. */
export function avisosDoPedido({ entregueEm, canceladoNoAliExpressEm, faltaLancar = 0, estoqueLancado = false, linhasPendentes = 0, virtualErros = 0 }) {
  const avisos = [];
  if (canceladoNoAliExpressEm && estoqueLancado) avisos.push(AVISO_CANCELADO_COM_ESTOQUE);
  if (entregueEm && !canceladoNoAliExpressEm && faltaLancar > 0) avisos.push(`Entregue no AliExpress em ${formatarDataCurta(entregueEm)}, falta lançar.`);
  if (linhasPendentes > 0) avisos.push(`${linhasPendentes} item(ns) sem produto: escolha o produto para contar no estoque a caminho.`);
  if (virtualErros > 0) avisos.push(`Entrada no depósito Virtual pendente em ${virtualErros} item(ns).`);
  return avisos;
}

const fatorValido = (fator) => (Number.isInteger(Number(fator)) && Number(fator) >= 1 ? Number(fator) : 1);

/** Quantidade no Rise: comprada x fator ("kit de 100 pcs" comprado 2 vezes = 200). */
export function quantidadeNoRise(comprada, fator) {
  return (Number(comprada) || 0) * fatorValido(fator);
}

/** Preco unitario no Rise: preco do kit / fator, em 4 casas (o item guarda 4: R$ 0,0385 a peca). */
export function precoNoRise(preco, fator) {
  return Math.round(((Number(preco) || 0) / fatorValido(fator)) * 10000) / 10000;
}

/** Preco medio de um item que junta varias linhas (duas opcoes que viraram o mesmo produto). Sem linhas -> null. */
export function precoMedioPonderado(linhas) {
  let quantidade = 0;
  let total = 0;
  for (const linha of linhas ?? []) {
    quantidade += Number(linha.quantidade) || 0;
    total += (Number(linha.quantidade) || 0) * (Number(linha.preco) || 0);
  }
  return quantidade > 0 ? Math.round((total / quantidade) * 10000) / 10000 : null;
}

/**
 * O desconto que o AliExpress aplicou (cupom, moedas) e nao detalha: o que falta para os totais do Rise baterem com o
 * total que o site cobrou. Nunca negativo (total maior que a soma nao vira desconto).
 */
export function descontoImplicito({ produtos, frete, imposto, total }) {
  const centavos = (valor) => Math.round((Number(valor) || 0) * 100);
  const sobra = centavos(produtos) + centavos(frete) + centavos(imposto) - centavos(total);
  return Math.max(0, sobra) / 100;
}

/**
 * O pacote em que a linha foi enviada: o primeiro cujo item tem o mesmo anuncio e a mesma opcao (opcao vazia no pacote
 * casa com qualquer uma). Fora de todos -> null.
 */
export function pacoteDaLinha(pacotes, linha) {
  for (const pacote of pacotes ?? []) {
    const casa = (pacote.itens ?? []).some(
      (item) => String(item.productId) === String(linha.productId) && (!item.skuId || !linha.skuId || String(item.skuId) === String(linha.skuId)),
    );
    if (casa) return pacote.codigo;
  }
  return null;
}

/**
 * Qual produto do Rise recebe a linha, a partir dos candidatos achados pelo link (vinculos e rascunho do Bling).
 * Candidato com opcao diferente da linha sai; candidato com a MESMA opcao vence os sem opcao (o link com `sku_id` e
 * mais preciso); um produto so casa; mais de um e ambiguo (o dono escolhe: e o caso de opcoes diferentes do mesmo
 * anuncio irem para produtos diferentes).
 */
export function decidirCasamento(candidatos, skuId) {
  const validos = (candidatos ?? []).filter((candidato) => !candidato.skuId || !skuId || candidato.skuId === skuId);
  const exatos = skuId ? validos.filter((candidato) => candidato.skuId === skuId) : [];
  const usados = exatos.length ? exatos : validos;
  const produtos = [...new Set(usados.map((candidato) => candidato.produtoId))].sort();
  if (produtos.length === 0) return null;
  if (produtos.length === 1) return { produtoId: produtos[0] };
  return { ambiguo: produtos };
}

/**
 * A previsao de entrega em datas de Sao Paulo ("10/11 a 19/11"). Vem dos horarios do AliExpress (`beginEtaTime` e
 * `endEtaTime`), nao do texto: o texto ("Nov 09 - 18") e de outro fuso e chegou a divergir da propria pagina, que
 * mostrava "Nov 10 - 19" (medido em 28/10/2026). Mesmo dia -> uma data; so o fim -> "ate"; nada -> null.
 */
export function previsaoEmDatas(inicio, fim) {
  const de = inicio ? formatarDataCurta(inicio) : null;
  const ate = fim ? formatarDataCurta(fim) : null;
  if (de && ate) return de === ate ? de : `${de} a ${ate}`;
  if (ate) return `até ${ate}`;
  return de;
}

/**
 * O custo por peca de cada item de um pedido do AliExpress (pedido do dono em 29/10/2026: "o preco de custo do produto
 * que fica em Fornecedores deve ser o total do pedido / numero de pecas; frete e impostos entram no custo"). O total
 * pago (produtos + frete + imposto - desconto) e rateado pelo valor de cada item; num pedido de um produto so, da
 * exatamente total / pecas. `produtos` e a soma de TODAS as linhas do pedido (as sem produto tambem levam a parte delas
 * do frete); sem ele, a soma dos itens. Item sem preco fica de fora. Em reais, 2 casas (o `precoCusto` guarda 2).
 */
export function custoPorPeca({ itens = [], frete = 0, imposto = 0, desconto = 0, produtos = null }) {
  const comPreco = itens.filter((item) => Number(item.quantidade) > 0 && item.precoUnitario !== null && item.precoUnitario !== undefined);
  const base = produtos ?? comPreco.reduce((soma, item) => soma + Number(item.quantidade) * Number(item.precoUnitario), 0);
  if (!(base > 0)) return {};
  const fator = (base + (Number(frete) || 0) + (Number(imposto) || 0) - (Number(desconto) || 0)) / base;
  return Object.fromEntries(comPreco.map((item) => [item.id, Math.round(Number(item.precoUnitario) * fator * 100 + 1e-9) / 100]));
}

// ---------------------------------------------------------------------------
// O "!" da Situacao na lista de pedidos (pedido do dono em 29/10/2026)
// ---------------------------------------------------------------------------

// O que e problema no rastreio. Nos eventos vistos em 28/10/2026 so havia passos normais (AE_SC_OUTBOUND_SUCCESS,
// "Desembaraco aduaneiro concluido"); nenhuma falha real foi vista ainda, entao a lista e de palavras e de pedacos de
// codigo e deve ser afinada com os casos que aparecerem. "Encaminhado para fiscalizacao aduaneira" e passo normal no
// Brasil e nao entra.
const CODIGO_DE_PROBLEMA = /fail|exception|return|refus|lost|abnormal|detain|hold|unsuccess/i;
const TEXTO_DE_PROBLEMA =
  /falha|nao entreg|nao efetuad|ausente|devolvid|devolucao|retornad|retido|apreendid|aguardando pagamento|pagamento pendente|extravi|endereco (incorreto|insuficiente|errado|nao localizado)|recusad|irregular|nao autorizad|problema/;
const TEXTO_DE_CONCLUSAO = /conclui|liberad|entregue ao destinatario/;

/** O evento de rastreio indica problema (falha na entrega, alfandega, devolucao, taxa a pagar, extravio)? */
export function problemaNoRastreio(evento) {
  if (!evento) return false;
  const texto = semAcento(evento.descricao);
  if (TEXTO_DE_CONCLUSAO.test(texto) && !/nao /.test(texto)) return false;
  return CODIGO_DE_PROBLEMA.test(String(evento.codigo ?? "")) || TEXTO_DE_PROBLEMA.test(texto);
}

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * O prazo de entrega do pedido para a lista: no do AliExpress, a previsao dos pacotes (a mais cedo ate a mais tardia);
 * no do Rise, a data de envio mais o maior prazo dos itens. Rascunho ou sem dado -> null.
 */
export function prazoDoPedido({ status, enviadoEm = null, prazosDosItens = [], pacotes = [] }) {
  if (status === "RASCUNHO") return null;
  const comPrevisao = (pacotes ?? []).filter((pacote) => pacote.previsaoFim || pacote.previsaoInicio);
  if (comPrevisao.length) {
    const inicios = comPrevisao.map((pacote) => pacote.previsaoInicio).filter(Boolean).map((data) => new Date(data).getTime());
    const fins = comPrevisao.map((pacote) => pacote.previsaoFim ?? pacote.previsaoInicio).map((data) => new Date(data).getTime());
    const inicio = inicios.length ? new Date(Math.min(...inicios)) : null;
    const fim = new Date(Math.max(...fins));
    return { texto: previsaoEmDatas(inicio, fim), fim };
  }
  const maior = Math.max(0, ...(prazosDosItens ?? []).filter((dias) => Number.isFinite(Number(dias)) && dias !== null).map(Number));
  if (!enviadoEm || maior <= 0) return null;
  const fim = new Date(new Date(enviadoEm).getTime() + maior * DIA_MS);
  return { texto: formatarDataCurta(fim), fim };
}

/**
 * Os motivos do "!" de um pedido aberto (ENVIADO ou PARCIAL): passou do prazo sem entregar, problema no ultimo evento de
 * algum pacote, situacao estranha no AliExpress (disputa, reembolso), itens sem produto e "entregue, falta lancar".
 * Pedido fechado nao tem "!". O atraso conta pelo dia em Sao Paulo: vence no dia seguinte ao fim da previsao.
 */
export function alertasDoPedido({
  status,
  agora = new Date(),
  prazoFim = null,
  entregueEm = null,
  canceladoNoAliExpressEm = null,
  faltaLancar = 0,
  estoqueLancado = false,
  linhasPendentes = 0,
  ultimosEventos = [],
  statusNoAliExpress = null,
}) {
  if (status !== "ENVIADO" && status !== "PARCIAL") return [];
  const alertas = [];
  const diaDe = (data) => new Date(data).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  if (prazoFim && !entregueEm && faltaLancar > 0 && diaDe(agora) > diaDe(prazoFim)) {
    alertas.push(`Passou da previsão de entrega (${formatarDataCurta(prazoFim)}) e não foi entregue.`);
  }
  for (const evento of ultimosEventos ?? []) {
    if (problemaNoRastreio(evento)) alertas.push(`Rastreio: ${evento.descricao}${evento.em ? ` (${formatarDataCurta(evento.em)})` : ""}.`);
  }
  const situacao = semAcento(statusNoAliExpress);
  if (situacao && /disputa|reembols|cancelad|fechad/.test(situacao) && !(canceladoNoAliExpressEm && estoqueLancado)) {
    alertas.push(`Situação no AliExpress: ${statusNoAliExpress}.`);
  }
  alertas.push(...avisosDoPedido({ entregueEm, canceladoNoAliExpressEm, faltaLancar, estoqueLancado, linhasPendentes }));
  return alertas;
}
