/**
 * Lista de fornecedor em MOEDA ESTRANGEIRA (NexMind, em dolar, 04/11/2026; Opcao 1 do dono: "Moeda da lista" e "Fator de
 * importacao" no cadastro do fornecedor). Sem imports: a regra e pura, testada no teste:extracao, e a tela usa o texto.
 *
 * O preco e CONVERTIDO NA GRAVACAO, e nao na tela: o custo do produto, o Compras, a proposta e o MCP leem o preco do
 * fornecedor em reais por toda parte (`custoDoFornecedor`), e converter so na tela deixaria todos eles lendo dolar como
 * se fosse real. A conversao e refeita a cada "Atualizar dados" e na rodada de sabado, com o PTAX do dia; o dolar original,
 * a cotacao e o fator ficam em `prices.original`, para a tela mostrar "US$ 2,95" e de onde saiu o valor em reais.
 *
 *   normal      = US$ x cotacao                (o preco do fornecedor em reais, sem frete nem imposto)
 *   comImpostos = normal x fator               (o que se paga com frete e impostos: o CUSTO, pela regra de 23/10/2026)
 *   taxes       = [{ nome: "Importação", percentual: (fator - 1) x 100 }]   (fator 2 = "Importação 100%")
 *
 * Fator 1 (ou nenhum) nao acrescenta nada: o custo e o dolar convertido.
 */

const centavos = (valor) => Math.round(valor * 100) / 100;
const comVirgula = (valor) => String(valor).replace(".", ",");

/**
 * @param {object} produto  no formato da coleta, com `prices.normal` em DOLAR e `prices.moeda` = "USD"
 * @param {{ cotacao: { valor: number, data?: string|null, origem?: string }, fator?: number|null }} cambio
 */
export function converterParaReais(produto, { cotacao, fator }) {
  const valor = produto?.prices?.normal;
  if (typeof valor !== "number" || !Number.isFinite(valor) || !(cotacao?.valor > 0)) return produto;

  const moeda = produto.prices.moeda ?? "USD";
  const fatorValido = typeof fator === "number" && Number.isFinite(fator) && fator > 0 ? fator : 1;
  const normal = centavos(valor * cotacao.valor);
  const percentual = Math.round((fatorValido - 1) * 10000) / 100;

  const { moeda: _moeda, ...precos } = produto.prices;
  produto.prices = {
    ...precos,
    normal,
    comImpostos: fatorValido !== 1 ? centavos(normal * fatorValido) : null,
    original: {
      moeda,
      valor,
      cotacao: cotacao.valor,
      cotacaoData: cotacao.data ?? null,
      cotacaoOrigem: cotacao.origem ?? null,
      fator: fatorValido,
    },
  };
  produto.taxes = percentual > 0 ? [{ nome: "Importação", percentual }] : [];
  const simbolo = moeda === "USD" ? "US$" : moeda;
  const deOnde = cotacao.origem === "ptax" ? `PTAX ${cotacao.data ?? ""}`.trim() : "cotação fixa";
  produto.origens = {
    ...(produto.origens ?? {}),
    price:
      `${produto.origens?.price ?? "lista do fornecedor"} · ${simbolo} ${comVirgula(valor)} × ${comVirgula(cotacao.valor)} (${deOnde})` +
      (fatorValido !== 1 ? ` × fator ${comVirgula(fatorValido)}` : ""),
  };
  return produto;
}

/** "US$ 2,95" para a tela; null quando o preco nao veio de moeda estrangeira. */
export function precoOriginalEmTexto(original) {
  if (!original || typeof original.valor !== "number") return null;
  const simbolo = original.moeda === "USD" ? "US$" : original.moeda;
  return `${simbolo} ${original.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "US$ 2,95 × 5,61 (PTAX 2026-11-04) × fator 2", para o `title` do preco em reais. */
export function contaDoPrecoOriginal(original) {
  const texto = precoOriginalEmTexto(original);
  if (!texto) return null;
  const deOnde = original.cotacaoOrigem === "ptax" ? ` (PTAX ${original.cotacaoData ?? ""})`.replace(" )", ")") : "";
  return `${texto} × ${comVirgula(original.cotacao)}${deOnde}${original.fator && original.fator !== 1 ? ` × fator ${comVirgula(original.fator)}` : ""}`;
}
