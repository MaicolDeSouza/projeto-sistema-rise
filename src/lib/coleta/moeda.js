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

/** As moedas para as quais o Rise tem cotacao: so o dolar (PTAX do Banco Central, `cotacaoDoDia.js`). */
export const MOEDAS_COM_COTACAO = ["USD"];

const SIMBOLOS = { USD: "US$", EUR: "€", GBP: "£", JPY: "¥", CNY: "CN¥", CAD: "CA$", AUD: "AU$" };

/** "US$", "€", ... ou o proprio codigo quando nao ha simbolo conhecido. */
export function simboloDaMoeda(moeda) {
  return SIMBOLOS[moeda] ?? moeda;
}

/**
 * Produto em moeda SEM cotacao no Rise (euro, libra...): fica SEM preco em reais, com o original guardado para a tela
 * dizer "€ 10,00 (sem cotação)". Gravar o numero estrangeiro em `normal` o faria passar por reais em todo o sistema.
 */
export function semCotacao(produto) {
  const { moeda, normal, promotional, ...precos } = produto.prices;
  produto.prices = {
    ...precos,
    normal: null,
    promotional: null,
    comImpostos: null,
    original: { moeda, valor: normal, cotacao: null, cotacaoData: null, cotacaoOrigem: null, fator: 1 },
  };
  produto.origens = {
    ...(produto.origens ?? {}),
    price: `${produto.origens?.price ?? "página"} · ${simboloDaMoeda(moeda)} ${comVirgula(normal)}, sem cotação de ${moeda} no Rise`,
  };
  return produto;
}

/**
 * Converte em reais os produtos de SITE estrangeiro (SparkFun, Adafruit, 08/11/2026) antes de gravar: o normalizador deixa
 * `prices.moeda` quando a pagina declara outra moeda. `obterCambio` e chamado UMA vez por varredura, e so quando ha produto
 * em dolar (busca a PTAX e o fator do fornecedor ligado a fonte). Produto em real passa intocado.
 */
export async function converterProdutosDoSite(produtos, obterCambio) {
  let cambio = null;
  for (const produto of produtos ?? []) {
    const moeda = produto?.prices?.moeda;
    if (!moeda) continue;
    if (!MOEDAS_COM_COTACAO.includes(moeda)) {
      semCotacao(produto);
      continue;
    }
    cambio ??= await obterCambio();
    converterParaReais(produto, cambio);
  }
  return produtos;
}

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
  // O promocional (site com "sale", Adafruit) vai na mesma cotacao, sem fator: o fator e do custo, nao da vitrine.
  const promotional = typeof precos.promotional === "number" ? centavos(precos.promotional * cotacao.valor) : (precos.promotional ?? null);
  produto.prices = {
    ...precos,
    normal,
    ...(precos.promotional !== undefined ? { promotional } : {}),
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
  // As faixas de quantidade (Adafruit: "5-9 $11.88") NAO sao convertidas: ficam na moeda do site, cada uma com a sua
  // `moeda`, e a tela mostra "US$ 11,88" (o dono, 08/11/2026: "o valor em lote deve respeitar a moeda do site").
  const simbolo = simboloDaMoeda(moeda);
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
  const simbolo = simboloDaMoeda(original.moeda);
  const texto = `${simbolo} ${original.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return original.cotacao ? texto : `${texto} (sem cotação)`;
}

/** "US$ 2,95 × 5,61 (PTAX 2026-11-04) × fator 2", para o `title` do preco em reais. */
export function contaDoPrecoOriginal(original) {
  const texto = precoOriginalEmTexto(original);
  if (!texto) return null;
  if (!original.cotacao) return `${texto}: o Rise não tem cotação de ${original.moeda}, então o produto fica sem preço em reais`;
  const deOnde = original.cotacaoOrigem === "ptax" ? ` (PTAX ${original.cotacaoData ?? ""})`.replace(" )", ")") : "";
  return `${texto} × ${comVirgula(original.cotacao)}${deOnde}${original.fator && original.fator !== 1 ? ` × fator ${comVirgula(original.fator)}` : ""}`;
}
