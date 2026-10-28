/**
 * Sem `dado.custo` (Acessos), quem ve o pedido nao ve preco de compra: o servidor corta antes de a tela receber, e o
 * que a tela manda de volta perde os campos de preco (o banco mantem os gravados). Sem imports.
 */

const SEM = null;

export function semPrecos(pedido) {
  if (!pedido) return pedido;
  return {
    ...pedido,
    icmsSt: SEM,
    descontoTipo: SEM,
    descontoValor: SEM,
    frete: SEM,
    entrada: SEM,
    imposto: SEM,
    itens: pedido.itens.map((item) => ({ ...item, precoUnitario: SEM, ipiPercentual: SEM })),
    totais: { ...pedido.totais, produtos: SEM, ipi: SEM, imposto: SEM, desconto: SEM, total: SEM, entrada: SEM, faltaPagar: SEM },
    // Pedido do AliExpress: o preco das linhas sem produto tambem e preco de compra.
    aliexpress: pedido.aliexpress
      ? { ...pedido.aliexpress, linhasPendentes: pedido.aliexpress.linhasPendentes.map((linha) => ({ ...linha, precoComprado: SEM })) }
      : pedido.aliexpress,
    semPrecos: true,
  };
}

/** O que a tela manda ao Salvar, sem os campos de preco (o `undefined` faz o servidor nao mexer neles). */
export function semPrecosNaEntrada(entrada) {
  const { icmsSt, desconto, frete, entrada: pago, ...resto } = entrada ?? {};
  void icmsSt;
  void desconto;
  void frete;
  void pago;
  return {
    ...resto,
    itens: resto.itens?.map(({ precoUnitario, ipiPercentual, ...item }) => {
      void precoUnitario;
      void ipiPercentual;
      return item;
    }),
  };
}
