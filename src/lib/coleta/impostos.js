/**
 * Impostos declarados pelo fornecedor, e o preco que eles produzem.
 *
 * Modulo sem import nenhum de proposito: a leitura roda no servidor e a tela
 * mostra o resultado, e uma copia em cada lado divergiria em silencio.
 *
 * Isto so aparece em fornecedor. Loja de varejo anuncia preco final ao
 * consumidor — o imposto ja esta dentro, e nao ha o que somar. Distribuidor
 * anuncia preco de tabela e cobra o imposto por fora: a Benser escreve na
 * propria tela "Preco unit. sem IPI · subtotais e total com IPI", e a Santana
 * Import tem coluna "IPI %" ao lado do preco.
 *
 * Guardar os dois valores separados, e nao so o total, e o que permite comparar
 * fornecedor com fornecedor: um manda preco com imposto embutido e outro manda
 * sem, e somar tudo num campo so tornaria a comparacao sem sentido — com os
 * dois numeros plausiveis e ninguem percebendo o erro.
 */

/// Impostos que aparecem em tabela de distribuidor brasileiro, com o rotulo
/// como o fornecedor escreve. ST e substituicao tributaria; FCP e o fundo de
/// combate a pobreza, que anda junto do ICMS em alguns estados.
const CONHECIDOS = [
  ["IPI", /^ipi\b|al[ií]?q(uota)?\.?\s*ipi/i],
  ["ICMS", /^icms\b(?!.*\bst\b)/i],
  ["ICMS ST", /icms.*\bst\b|substitui[cç][aã]o\s*tribut/i],
  ["FCP", /^fcp\b/i],
  ["PIS", /^pis\b/i],
  ["COFINS", /^cofins\b/i],
];

/** Percentual escrito de qualquer jeito: "2", "2%", "2,5 %", "12.00". */
function comoPercentual(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== "string") return null;

  const achado = /(-?[\d.,]+)\s*%?/.exec(valor.trim());
  if (!achado) return null;

  const texto = achado[1];
  const ultimaVirgula = texto.lastIndexOf(",");
  const ultimoPonto = texto.lastIndexOf(".");

  const normalizado =
    ultimaVirgula > ultimoPonto
      ? texto.replace(/\./g, "").replace(",", ".")
      : texto.replace(/,/g, "");

  const numero = Number(normalizado);

  // Aliquota fora de 0-100 nao e aliquota: e codigo, valor em reais, ou leitura
  // errada. Melhor descartar que somar um imposto de 8542% ao preco.
  return Number.isFinite(numero) && numero > 0 && numero <= 100 ? numero : null;
}

/**
 * Le os impostos de uma ficha tecnica de {nome, valor}.
 *
 * So aceita rotulo CONHECIDO. Varrer atras de qualquer "%" traria garantia,
 * desconto e margem — e um numero somado ao preco por engano vira custo errado
 * na comparacao, que e exatamente o que ninguem confere.
 */
export function impostosDaFicha(especificacoes) {
  const achados = [];

  for (const item of especificacoes ?? []) {
    if (!item?.nome) continue;

    const rotulo = String(item.nome).trim();
    const conhecido = CONHECIDOS.find(([, padrao]) => padrao.test(rotulo));
    if (!conhecido) continue;

    const percentual = comoPercentual(item.valor);
    if (percentual === null) continue;

    // O mesmo imposto duas vezes na ficha: fica a primeira leitura.
    if (achados.some((imposto) => imposto.nome === conhecido[0])) continue;

    achados.push({ nome: conhecido[0], percentual });
  }

  return achados;
}

/**
 * Preco com os impostos somados.
 *
 * Soma simples das aliquotas sobre o preco de tabela — que e como distribuidor
 * apresenta na nota: "preco unitario + IPI". Nao pretende ser calculo fiscal;
 * pretende responder "quanto custa de verdade" na hora de comparar.
 *
 * Devolve null quando nao ha preco ou nao ha imposto: sem imposto o valor seria
 * igual ao normal, e mostrar dois campos iguais sugeriria que ha diferenca.
 */
export function precoComImpostos(precoNormal, impostos) {
  if (typeof precoNormal !== "number" || !(impostos?.length > 0)) return null;

  const total = impostos.reduce((soma, imposto) => soma + (imposto.percentual ?? 0), 0);
  if (total <= 0) return null;

  return Math.round(precoNormal * (1 + total / 100) * 100) / 100;
}

/** "IPI 2%" ou "IPI 2% + ICMS 18%", para a tela dizer o que entrou na conta. */
export function resumoDosImpostos(impostos) {
  if (!(impostos?.length > 0)) return null;

  return impostos
    .map(
      (imposto) =>
        `${imposto.nome} ${String(imposto.percentual).replace(".", ",")}%`,
    )
    .join(" + ");
}

/**
 * A ficha tecnica sem as linhas de imposto.
 *
 * Imposto tem campo proprio na tela, ao lado do preco. Deixa-lo tambem em
 * especificacoes diria a mesma coisa duas vezes — e a segunda ("IPI: 6.5")
 * sem o contexto que a primeira tem, que e o valor que ele produz.
 *
 * Usa o MESMO reconhecimento de impostosDaFicha: o que virou imposto sai, o
 * que nao virou fica. Assim as duas listas nunca se sobrepoem nem se perdem.
 */
export function semImpostos(especificacoes) {
  const impostos = impostosDaFicha(especificacoes);
  if (impostos.length === 0) return especificacoes ?? [];

  const ehImposto = (item) =>
    impostosDaFicha([item]).length > 0;

  return (especificacoes ?? []).filter((item) => !ehImposto(item));
}
