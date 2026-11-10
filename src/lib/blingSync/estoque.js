/**
 * Estoque do Rise na sincronizacao com o Bling: o saldo que o Bling devolveu mais os
 * ajustes que o Rise ainda nao enviou. Sem imports, sem banco e sem rede: a lista de
 * Produtos, a tela de sincronizacao e o teste leem a mesma conta.
 */

/// Quantidade ruim (texto, vazio, NaN, infinito) conta 0: esta conta alimenta a tela da lista,
/// e um movimento mal gravado nao pode derrubar a pagina inteira com um erro.
function quantidadeSegura(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

/**
 * O estoque que o Rise mostra: parte do saldo do Bling e aplica os ajustes pendentes
 * NA ORDEM RECEBIDA (entrada soma, saida tira, balanco define o saldo). Quem le do banco
 * entrega a lista ordenada por `criadoEm`; ordenar nao e daqui.
 *
 * O saldo do Bling e virtual (com reservas) e pode vir negativo, e o resultado TAMBEM (pedido do dono em 09/11/2026:
 * "mostrar o estoque do rise igual ao bling, se esta -1, deve mostrar -1 no rise tambem"; -1 e uma venda que saiu sem
 * estoque, e o 0 escondia isso). Ate ali se cortava em 0 no fim. Quem manda estoque a um canal corta do seu lado (o ML
 * em `canaisDeVenda/ml/rascunho.js`, a LI em `acertarEstoqueLI`, a peca do kit em `composicao.js`).
 *
 * @param {number} blingSaldo saldo virtual do Bling, cru.
 * @param {{tipo: "ENTRADA"|"SAIDA"|"BALANCO", quantidade: number}[]} pendentes
 * @returns {number} pode ser negativo, como o do Bling.
 */
export function estoqueDoRise(blingSaldo, pendentes) {
  let saldo = quantidadeSegura(blingSaldo);
  for (const movimento of Array.isArray(pendentes) ? pendentes : []) {
    const quantidade = quantidadeSegura(movimento?.quantidade);
    if (movimento?.tipo === "ENTRADA") saldo += quantidade;
    else if (movimento?.tipo === "SAIDA") saldo -= quantidade;
    else if (movimento?.tipo === "BALANCO") saldo = quantidade;
  }
  return saldo;
}
