import { totaisDoPedido } from "@/lib/compras/regras";

/**
 * O que o FORNECEDOR le do pedido, montado uma vez para o PDF (`pdf.js`) e para o link publico (`paginaPublica.js`,
 * pedido do dono em 07/11/2026: "acessar as mesmas informacoes que estao no PDF"). Os dois desenham a partir daqui, para
 * nunca divergirem: codigo, nome e foto do fornecedor, quantidades, precos, totais, pagamento, proposta e a "Obs para o
 * fornecedor". Nunca o SKU do Rise, estoque, prazo interno nem as observacoes internas.
 *
 * Fornecedor estrangeiro (moeda da lista diferente de R$, NexMind): em INGLES, em DOLAR sem o fator de importacao e sem
 * IPI nem impostos; frete, desconto em R$ e entrada voltam pela cotacao, sem fator.
 */

export const TEXTOS = {
  pt: {
    titulo: "Pedido de compra",
    enviado: "Enviado em",
    rascunho: "Rascunho de",
    fornecedor: "Fornecedor",
    ac: "A/C:",
    colunas: { item: "#", foto: "Foto", codigo: "Código", descricao: "Descrição", qtde: "Qtde", un: "Un", preco: "Preço un.", ipi: "IPI %", total: "Total" },
    unidade: "UN",
    produtos: "Total dos produtos",
    ipi: "Total do IPI",
    icmsSt: "ICMS ST",
    imposto: "Imposto",
    desconto: "Desconto",
    frete: "Frete",
    totalDoPedido: "Total do pedido",
    pagamento: "Pagamento",
    proposta: "Proposta nº",
    obs: "Observações",
    obsDoItem: "Obs.:",
    cancelado: "Pedido cancelado",
    formas: { PIX: "Pix", BOLETO: "Boleto", CARTAO: "Cartão" },
    parcelado: (forma, parcelas) => `${forma} em ${parcelas}x`,
    entrada: "Entrada paga:",
  },
  en: {
    titulo: "Purchase Order",
    enviado: "Sent on",
    rascunho: "Draft of",
    fornecedor: "Supplier",
    ac: "Attn:",
    colunas: { item: "#", foto: "Photo", codigo: "Code", descricao: "Description", qtde: "Qty", un: "Unit", preco: "Unit price", ipi: "", total: "Total" },
    unidade: "pcs",
    produtos: "Products total",
    ipi: "",
    icmsSt: "",
    imposto: "",
    desconto: "Discount",
    frete: "Freight",
    totalDoPedido: "Order total",
    pagamento: "Payment",
    proposta: "Proposal no.",
    obs: "Notes",
    obsDoItem: "Note:",
    cancelado: "Order cancelled",
    formas: { PIX: "Pix", BOLETO: "Bank slip", CARTAO: "Credit card" },
    parcelado: (forma, parcelas) => `${forma} in ${parcelas} installments`,
    entrada: "Down payment:",
  },
};

export function formatadores(estrangeiro, moeda) {
  const local = estrangeiro ? "en-US" : "pt-BR";
  const codigo = estrangeiro ? moeda : "BRL";
  const dinheiro = (valor, casas = 2) =>
    Number(valor ?? 0).toLocaleString(local, { style: "currency", currency: codigo, minimumFractionDigits: 2, maximumFractionDigits: casas });
  return {
    dinheiro,
    unitario: (valor) => (valor === null || valor === undefined ? "—" : dinheiro(valor, 4)),
    numero: (valor) => Number(valor ?? 0).toLocaleString(local),
    data: (valor) =>
      valor
        ? new Date(valor).toLocaleDateString(local, estrangeiro
          ? { timeZone: "America/Sao_Paulo", month: "short", day: "numeric", year: "numeric" }
          : { timeZone: "America/Sao_Paulo" })
        : "—",
  };
}

/**
 * @param {object} pedido o retorno de `lerPedido` (com fornecedor e itens)
 * @param {{ estrangeiro?: boolean, moeda?: string, cotacao?: number|null, dolar?: Record<string, number|null> }} [extras]
 */
export function conteudoDoPedido(pedido, extras = {}) {
  const estrangeiro = Boolean(extras.estrangeiro);
  const t = TEXTOS[estrangeiro ? "en" : "pt"];
  const f = formatadores(estrangeiro, extras.moeda ?? "USD");
  const cotacao = extras.cotacao > 0 ? extras.cotacao : null;
  const emMoeda = (reais) => (estrangeiro ? (cotacao ? Math.round((Number(reais ?? 0) / cotacao) * 100) / 100 : 0) : Number(reais ?? 0));

  const itens = pedido.itens.map((item, indice) => {
    const precoUnitario = estrangeiro ? (extras.dolar?.[item.id] ?? null) : item.precoUnitario;
    const total = precoUnitario === null || precoUnitario === undefined ? null : Math.round(Number(item.quantidade) * Number(precoUnitario) * 100) / 100;
    return {
      ...item,
      precoUnitario,
      ipiPercentual: estrangeiro ? 0 : item.ipiPercentual,
      celulas: {
        item: String(indice + 1),
        foto: "",
        codigo: item.codigoNoFornecedor && item.codigoNoFornecedor !== "N/A" ? item.codigoNoFornecedor : "—",
        descricao: item.nomeNoFornecedor || item.nome,
        qtde: f.numero(item.quantidade),
        un: t.unidade,
        preco: f.unitario(precoUnitario),
        ipi: f.numero(estrangeiro ? 0 : (item.ipiPercentual ?? 0)),
        total: total === null ? "—" : f.dinheiro(total),
      },
      obs: item.observacao?.trim() || null,
    };
  });

  const totais = totaisDoPedido({
    itens,
    icmsSt: estrangeiro ? 0 : pedido.icmsSt,
    imposto: estrangeiro ? 0 : pedido.imposto,
    descontoTipo: pedido.descontoTipo,
    descontoValor: pedido.descontoTipo === "PERCENTUAL" ? pedido.descontoValor : emMoeda(pedido.descontoValor),
    frete: emMoeda(pedido.frete),
    entrada: emMoeda(pedido.entrada),
  });
  const linhasDeTotal = [
    [t.produtos, f.dinheiro(totais.produtos)],
    !estrangeiro && totais.ipi > 0 ? [t.ipi, f.dinheiro(totais.ipi)] : null,
    !estrangeiro && Number(pedido.icmsSt) > 0 ? [t.icmsSt, f.dinheiro(pedido.icmsSt)] : null,
    !estrangeiro && Number(pedido.imposto) > 0 ? [t.imposto, f.dinheiro(pedido.imposto)] : null,
    totais.desconto > 0
      ? [pedido.descontoTipo === "PERCENTUAL" ? `${t.desconto} (${pedido.descontoValor}%)` : t.desconto, `− ${f.dinheiro(totais.desconto)}`]
      : null,
    Number(pedido.frete) > 0 ? [t.frete, f.dinheiro(emMoeda(pedido.frete))] : null,
  ].filter(Boolean);

  // O campo Frete (transportadora, CIF/FOB) nao vai ao fornecedor (26/10/2026); o valor do frete fica nos totais. As
  // observacoes INTERNAS nunca vao (06/11/2026): so a "Obs para o fornecedor".
  const forma = t.formas[pedido.formaPagamento];
  const pagamento = [
    forma && pedido.formaPagamento !== "PIX" && pedido.parcelas > 1 ? t.parcelado(forma, pedido.parcelas) : forma,
    Number(pedido.entrada) > 0 ? `${t.entrada} ${f.dinheiro(emMoeda(pedido.entrada))}` : null,
  ].filter(Boolean).join(" · ");
  const condicoes = [
    [t.pagamento, pagamento],
    [t.proposta, pedido.propostaNumero],
    [t.obs, pedido.observacoesFornecedor],
  ].filter(([, valor]) => valor);

  return {
    t,
    f,
    estrangeiro,
    titulo: `${t.titulo} ${pedido.codigo}`,
    data: pedido.enviadoEm ? `${t.enviado} ${f.data(pedido.enviadoEm)}` : `${t.rascunho} ${f.data(pedido.criadoEm)}`,
    fornecedor: { nome: pedido.fornecedor?.nome ?? "", contato: pedido.fornecedor?.contato ?? "" },
    itens,
    totalDoPedido: f.dinheiro(totais.total),
    linhasDeTotal,
    condicoes,
  };
}
