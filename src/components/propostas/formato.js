import { lerDesconto, totaisDaProposta } from "@/lib/propostas/regras";

/**
 * Os campos do editor da proposta sao TEXTO (o operador digita "4,35"); estas funcoes passam da proposta do servidor
 * para o formulario e de volta, e fazem a conta dos totais enquanto se digita (a de regras.js, a mesma do PDF).
 */

export const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
export const moedaUnitaria = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 4 });

export function paraTexto(valor, casas = 2) {
  if (valor === null || valor === undefined || valor === "") return "";
  return Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas, useGrouping: false });
}

export function doTexto(texto) {
  const limpo = String(texto ?? "").trim();
  if (!limpo) return null;
  const numero = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
  return Number.isFinite(numero) ? numero : null;
}

/** Na digitacao: so digitos, virgula e ponto. */
export const soDecimal = (texto) => String(texto ?? "").replace(/[^\d.,]/g, "").slice(0, 16);
export const soDigitos = (texto, maximo = 6) => String(texto ?? "").replace(/\D/g, "").slice(0, maximo);

let proximaChave = 0;
/** Chave estavel da linha na tela (item novo ainda nao tem id). */
export const chaveNova = () => `novo-${++proximaChave}`;

export function itemDoFormulario(item) {
  return {
    chave: item.id ?? chaveNova(),
    id: item.id ?? null,
    produtoId: item.produtoId ?? null,
    sku: item.sku ?? item.codigoInterno ?? null,
    codigoInterno: item.codigoInterno ?? null,
    nomeInterno: item.nomeInterno ?? null,
    foto: item.foto ?? null,
    fotoUrl: item.fotoUrl ?? null,
    descricaoCliente: item.descricaoCliente ?? "",
    codigoCliente: item.codigoCliente ?? "",
    quantidade: paraTexto(item.quantidade ?? 1, 3),
    unidade: item.unidade ?? "UN",
    precoUnitario: paraTexto(item.precoUnitario, 4),
    descontoPercentual: item.descontoPercentual ? paraTexto(item.descontoPercentual) : "",
    prontaEntrega: item.prontaEntrega ?? true,
    prazoDiasUteis: item.prazoDiasUteis ? String(item.prazoDiasUteis) : "",
    observacao: item.observacao ?? "",
    custoUnitario: paraTexto(item.custoUnitario, 4),
  };
}

export function formularioDaProposta(proposta) {
  return {
    clienteId: proposta.clienteId ?? null,
    clienteNome: proposta.clienteNome ?? "",
    clienteTelefone: proposta.clienteTelefone ?? "",
    clienteEmail: proposta.clienteEmail ?? "",
    clienteDocumento: proposta.clienteDocumento ?? "",
    contatoId: proposta.contatoId ?? "",
    condicaoPagamentoId: proposta.condicaoPagamentoId ?? "",
    formaPagamento: proposta.formaPagamento ?? "",
    parcelas: String(proposta.parcelas ?? 1),
    entradaPercentual: proposta.entradaPercentual ? paraTexto(proposta.entradaPercentual) : "",
    pagamentoTexto: proposta.pagamentoTexto ?? "",
    fretePorConta: proposta.fretePorConta ?? "A_COMBINAR",
    transportadoraId: proposta.transportadoraId ?? "",
    frete: proposta.frete ? paraTexto(proposta.frete) : "",
    prazoTransporteDias: proposta.prazoTransporteDias ? String(proposta.prazoTransporteDias) : "",
    desconto: !proposta.descontoValor ? "" : proposta.descontoTipo === "PERCENTUAL" ? `${paraTexto(proposta.descontoValor)}%` : paraTexto(proposta.descontoValor),
    ocCliente: proposta.ocCliente ?? "",
    observacoesNf: proposta.observacoesNf ?? "",
    observacoesCliente: proposta.observacoesCliente ?? "",
    garantia: proposta.garantia ?? "",
    observacoesInternas: proposta.observacoesInternas ?? "",
    validadeAte: proposta.validadeAte ?? "",
    proximoContato: proposta.proximoContato ?? "",
    itens: proposta.itens.map(itemDoFormulario),
  };
}

/** O que vai ao servidor (o servidor confere e converte de novo; a chave da tela nao vai). */
export function entradaDoFormulario(formulario) {
  return {
    ...formulario,
    itens: formulario.itens.map(({ chave: _chave, fotoUrl: _fotoUrl, sku: _sku, ...item }) => item),
  };
}

/** Os itens do formulario como numeros, para a conta. */
export function itensEmNumero(itens) {
  return itens.map((item) => ({
    quantidade: doTexto(item.quantidade) ?? 0,
    precoUnitario: doTexto(item.precoUnitario) ?? 0,
    descontoPercentual: doTexto(item.descontoPercentual) ?? 0,
    custoUnitario: doTexto(item.custoUnitario),
    prontaEntrega: item.prontaEntrega,
    prazoDiasUteis: doTexto(item.prazoDiasUteis),
  }));
}

export function totaisDoFormulario(formulario) {
  const desconto = lerDesconto(formulario.desconto);
  return totaisDaProposta({
    itens: itensEmNumero(formulario.itens),
    descontoTipo: desconto.erro ? null : desconto.tipo,
    descontoValor: desconto.erro ? 0 : desconto.valor,
    fretePorConta: formulario.fretePorConta,
    frete: doTexto(formulario.frete) ?? 0,
  });
}
