import { lerDesconto, totaisDoPedido } from "@/lib/compras/regras";

/**
 * Os campos do editor do pedido sao TEXTO (o operador digita "4,35"); estas funcoes passam do pedido do servidor para
 * o formulario e de volta, e fazem a conta dos totais enquanto se digita. A conta e a de regras.js, a mesma do PDF.
 */

export const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const moedaUnitaria = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });

/** 4.35 -> "4,35"; null -> "". */
export function paraTexto(valor, casasMaximas = 2) {
  if (valor === null || valor === undefined || valor === "") return "";
  return Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casasMaximas, useGrouping: false });
}

/** "4,35" -> 4.35; "" -> null; texto invalido -> null (o servidor recusa com a mensagem do campo). */
export function doTexto(texto) {
  const limpo = String(texto ?? "").trim();
  if (!limpo) return null;
  const numero = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
  return Number.isFinite(numero) ? numero : null;
}

export function textoDoDesconto(tipo, valor) {
  if (!valor) return "";
  return tipo === "PERCENTUAL" ? `${paraTexto(valor)}%` : paraTexto(valor);
}

/** O formulario a partir do pedido do servidor. */
export function formularioDoPedido(pedido) {
  return {
    itens: pedido.itens.map((item) => ({
      ...item,
      quantidade: String(item.quantidade),
      precoUnitario: paraTexto(item.precoUnitario, 4),
      ipiPercentual: paraTexto(item.ipiPercentual),
      prazoDias: item.prazoDias === null || item.prazoDias === undefined ? "" : String(item.prazoDias),
    })),
    icmsSt: paraTexto(pedido.icmsSt),
    desconto: textoDoDesconto(pedido.descontoTipo, pedido.descontoValor),
    frete: paraTexto(pedido.frete),
    entrada: paraTexto(pedido.entrada),
    // So leitura: o imposto vem do AliExpress (importacao), a tela nao o edita.
    imposto: Number(pedido.imposto) || 0,
    formaPagamento: pedido.formaPagamento ?? null,
    parcelas: String(pedido.parcelas ?? 1),
    transportadoraId: pedido.transportadoraId ?? "",
    transportadoraNome: pedido.transportadoraNome ?? "",
    fretePorConta: pedido.fretePorConta ?? "CIF",
    rastreio: pedido.rastreio ?? "",
    propostaNumero: pedido.propostaNumero ?? "",
    observacoes: pedido.observacoes ?? "",
    // O arquivo da proposta so muda no Salvar: o enviado espera no lote; o excluido so e riscado.
    propostaTemporaria: null,
    removerProposta: false,
  };
}

/** O que vai ao `salvarPedidoAcao`: os itens so com o que a tela edita. */
export function entradaDoFormulario(formulario) {
  return {
    ...formulario,
    itens: formulario.itens.map((item) => ({
      id: item.id,
      quantidade: item.quantidade,
      precoUnitario: item.precoUnitario,
      ipiPercentual: item.ipiPercentual,
      prazoDias: item.prazoDias,
      nomeNoFornecedor: item.nomeNoFornecedor,
      codigoNoFornecedor: item.codigoNoFornecedor,
    })),
  };
}

/** Os totais enquanto se digita (desconto invalido conta zero; o Salvar mostra o erro no campo). */
export function totaisDoFormulario(formulario) {
  const desconto = lerDesconto(formulario.desconto);
  return totaisDoPedido({
    itens: formulario.itens.map((item) => ({
      quantidade: doTexto(item.quantidade) ?? 0,
      precoUnitario: doTexto(item.precoUnitario),
      ipiPercentual: doTexto(item.ipiPercentual) ?? 0,
    })),
    icmsSt: doTexto(formulario.icmsSt) ?? 0,
    descontoTipo: "erro" in desconto ? null : desconto.tipo,
    descontoValor: "erro" in desconto ? 0 : desconto.valor,
    frete: doTexto(formulario.frete) ?? 0,
    entrada: doTexto(formulario.entrada) ?? 0,
    imposto: Number(formulario.imposto) || 0,
  });
}

/** So digitos (quantidade, prazo, parcelas); numero com virgula (preco, IPI, valores). */
export const soDigitos = (texto, maximo = 7) => String(texto ?? "").replace(/\D/g, "").slice(0, maximo);
export const soDecimal = (texto) => String(texto ?? "").replace(/[^\d.,]/g, "").slice(0, 14);
