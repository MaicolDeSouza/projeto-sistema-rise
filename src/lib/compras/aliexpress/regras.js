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
