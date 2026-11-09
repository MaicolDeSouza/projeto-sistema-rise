/**
 * O codigo do que foi VENDIDO num item do pedido (pedido do dono em 09/11/2026: "2000019308589680 vinculou o codigo 910207 ao
 * inves de 910207_20"). O kit do ML e o anuncio do produto base com "Kit de N" (nunca um produto kit no Rise), entao o item fica
 * ligado ao 910207, mas o que saiu foi o 910207_20: e esse que a lista, o filtro da coluna Codigo e a aba Itens mostram. Fora do
 * kit, o SKU do produto ligado; sem produto, o codigo que o canal mandou. Sem imports: roda no servidor e na tela.
 */
export function codigoVendido({ sku = null, codigoNaOrigem = null, quantidadeDoKit = 1 } = {}) {
  const unidades = Number(quantidadeDoKit) || 1;
  if (sku && unidades > 1) return codigoNaOrigem || `${sku}_${unidades}`;
  return sku ?? codigoNaOrigem ?? null;
}
