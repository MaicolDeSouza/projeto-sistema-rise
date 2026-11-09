import { telefoneParaGravar } from "@/lib/telefone";

/**
 * O formato comum de um pedido de venda, seja do Mercado Livre, da Loja Integrada ou do Bling
 * (spec 2026-11-04-modulo-pedidos-de-venda-design.md, 5.2). Os tres normalizadores (`ml.js`, `li.js`,
 * `bling.js`) devolvem exatamente esta forma, e todo o resto do modulo (status unificado, cliente
 * automatico, itens, lucro, gravacao) so conhece ela. Campo sem dado na origem fica null, nunca
 * inventado; lista sem dado fica vazia.
 *
 * `fonteDoCusto` do envio diz de onde veio o frete pago pelo vendedor: "envio" (o shipment do ML),
 * "etiqueta" (a etiqueta do Enviali), "pedido" (o proprio pedido diz, ex.: retirada = 0) ou "estimado"
 * (ninguem disse; o lucro usa a estimativa).
 */
export function vazio() {
  return {
    origem: null,
    canal: null,
    idExterno: null,
    numero: null,
    packId: null,
    blingPedidoId: null,
    blingNumero: null,
    dataDaVenda: null,
    atualizadoNaOrigemEm: null,
    comprador: { nome: null, documento: null, email: null, telefone: null },
    enderecoDeEntrega: {
      nome: null,
      endereco: null,
      numero: null,
      complemento: null,
      bairro: null,
      cidade: null,
      uf: null,
      cep: null,
      referencia: null,
    },
    statusDaOrigem: null,
    statusDaOrigemDetalhe: null,
    tags: [],
    pagamento: [],
    // O que o Mercado Pago creditou (so ML, 09/11/2026; ver mercadoPago.js).
    mercadoPago: null,
    mercadoPagoErro: null,
    envio: {
      tipo: null,
      servico: null,
      transportadora: null,
      rastreio: null,
      link: null,
      statusDaOrigem: null,
      substatus: null,
      situacaoDoPedido: null,
      custoDoVendedor: null,
      fonteDoCusto: "estimado",
      cobradoDoCliente: null,
      prazo: null,
      historico: {},
    },
    devolucao: null,
    totais: { totalProdutos: 0, desconto: 0, freteCobrado: 0, total: 0 },
    itens: [],
    nf: null,
    historico: [],
  };
}

/** So os digitos de um documento ou CEP; vazio vira null. */
export function digitos(texto) {
  const so = String(texto ?? "").replace(/\D/g, "");
  return so || null;
}

/** Telefone como o Cliente grava (so digitos com DDD); invalido ou vazio vira null. */
export function telefone(texto) {
  return texto ? telefoneParaGravar(String(texto)) : null;
}

/** Dinheiro com 2 casas; texto da LI ("59.90") e numero do ML entram igual. Vazio e 0. */
export function dinheiro(valor) {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? Math.round(numero * 100) / 100 : 0;
}

/** Texto vazio, so espacos, undefined ou null vira null. */
export function texto(valor) {
  const limpo = String(valor ?? "").trim();
  return limpo || null;
}

/** Data ISO com fuso (ML, Enviali) em Date; vazia ou invalida vira null. */
export function data(iso) {
  if (!iso) return null;
  const valor = new Date(iso);
  return Number.isNaN(valor.getTime()) ? null : valor;
}

/**
 * Data SEM fuso ("2026-11-02T14:30:00.123456" da LI, "2026-11-02 11:00:00" e "2026-11-02" do Bling) e
 * hora de Sao Paulo (UTC-3, sem horario de verao desde 2019). Com fuso ou "Z" no texto, vale o que veio.
 */
export function dataDeSaoPaulo(valor) {
  const limpo = String(valor ?? "").trim();
  if (!limpo) return null;
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(limpo)) return data(limpo);
  const base = limpo.length === 10 ? `${limpo}T00:00:00` : limpo.replace(" ", "T");
  // O Date so aceita milissegundos: os microssegundos da LI sao cortados.
  const semMicros = base.replace(/(\.\d{3})\d+$/, "$1");
  return data(`${semMicros}-03:00`);
}
