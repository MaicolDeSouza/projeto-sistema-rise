/**
 * Em que posicao de preco o produto esta entre os concorrentes (pedido do dono em 06/10/2026): "2º de 10" =
 * so um concorrente e mais barato, de 9 concorrentes com preco mais o proprio produto.
 *
 * - Conta do MAIS BARATO para o mais caro: 1º e o mais barato.
 * - Cada LOJA conta uma vez, pelo menor preco dela: tres produtos da mesma loja na lista nao viram tres
 *   posicoes. O nome da loja e comparado sem caixa e sem espaco nas pontas.
 * - EMPATE (mesmo preco em centavos) fica na mesma posicao do produto, e `empatados` diz quantas lojas.
 * - Concorrente sem preco, ou com preco zero, fica de fora. Sem preco do produto, ou sem nenhum concorrente
 *   com preco, nao ha posicao (`null`).
 * - Concorrente com `indisponivel` (sem estoque ou fora da loja) tambem fica de fora; `indisponiveis` conta
 *   quantas lojas sairam assim.
 *
 * Funcao pura, sem banco: a tela recalcula enquanto o dono digita o preco ou mexe na lista.
 *
 * @param {number|string|null} meuPreco o Preco venda do produto
 * @param {{loja: string, preco: number|string|null, indisponivel?: boolean}[]} concorrentes
 */
export function posicaoDePreco(meuPreco, concorrentes) {
  const meu = emCentavos(meuPreco);
  if (meu === null) return null;

  // O menor preco de cada loja. Produto SEM ESTOQUE (ou fora da loja) nao conta: ninguem compra dele agora
  // (pedido do dono em 07/10/2026). A loja sai da conta so se TODOS os produtos dela estiverem assim.
  const porLoja = new Map();
  const lojasIndisponiveis = new Set();
  for (const item of concorrentes ?? []) {
    const centavos = emCentavos(item?.preco);
    if (centavos === null) continue;
    const nome = String(item?.loja ?? "").trim();
    const chave = nome.toLocaleLowerCase("pt-BR");
    if (item?.indisponivel) {
      lojasIndisponiveis.add(chave);
      continue;
    }
    const atual = porLoja.get(chave);
    if (!atual || centavos < atual.centavos) porLoja.set(chave, { loja: nome, centavos });
  }
  if (porLoja.size === 0) return null;
  const indisponiveis = [...lojasIndisponiveis].filter((chave) => !porLoja.has(chave)).length;

  const lojas = [...porLoja.values()].sort((a, b) => a.centavos - b.centavos);
  const abaixo = lojas.filter((item) => item.centavos < meu);
  const acima = lojas.filter((item) => item.centavos > meu);
  const paraTela = (item) => (item ? { loja: item.loja, preco: item.centavos / 100 } : null);

  return {
    posicao: abaixo.length + 1,
    total: lojas.length + 1,
    empatados: lojas.length - abaixo.length - acima.length,
    // Lojas que ficaram de fora por estarem sem estoque, para a dica dizer.
    indisponiveis,
    primeiro: abaixo.length === 0,
    ultimo: acima.length === 0,
    maisBarato: paraTela(lojas[0]),
    // O vizinho de cada lado: quem esta logo abaixo (mais barato) e logo acima (mais caro).
    abaixo: paraTela(abaixo.at(-1)),
    acima: paraTela(acima[0]),
  };
}

/** Preco em centavos inteiros; aceita numero ou texto ("34,90", "1.234,56"). Zero, vazio ou invalido = null. */
function emCentavos(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  let numero = valor;
  if (typeof valor === "string") {
    const texto = valor.trim();
    numero = Number(texto.includes(",") ? texto.replace(/\./g, "").replace(",", ".") : texto);
  }
  numero = Number(numero);
  if (!Number.isFinite(numero) || numero <= 0) return null;
  return Math.round(numero * 100);
}
