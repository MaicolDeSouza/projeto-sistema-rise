import { custosDoAnuncio, freteQueConta } from "@/lib/canaisDeVenda/ml/custos";
import { lerCustosDoAnuncio, precoPorMargemNoML } from "@/lib/canaisDeVenda/ml/leitura";
import { montarRanking } from "@/lib/canaisDeVenda/ml/ranking";
import { lucroLiquido } from "@/lib/margem";

/**
 * O preco da proposta do Mercado Livre, regra do dono desde 05/11/2026: "o valor de venda deve respeitar para que o lucro
 * no ML seja similar ao lucro na LI, nao olhar mais para regra de % no ML". O preco e o que deixa no ML, com as taxas
 * relidas no proprio preco (comissao, tarifa, frete do vendedor e o imposto de 6%), o MESMO lucro em R$ que o produto da na
 * loja (`lucroLiquido(preco de venda, custo)`, a conta do "Preco na loja (Lucro = ...)" do editor), arredondado PARA CIMA
 * aos 5 centavos (para baixo deixaria menos que o lucro da loja).
 *
 * Ate 05/11/2026 o preco saia do markup: piso de 30%, desejado de 40% e o top 5 do ranking puxando o preco para cima (R$ 0,10
 * abaixo do 5o). O dono viu o MQ-4 (100253) a R$ 27,50 no ML com R$ 6,34 de lucro contra R$ 4,93 na loja a R$ 14,90 e
 * mandou trocar. O ranking agora so diz a posicao: o anuncio fora dos 5 primeiros vem com aviso, e nenhum concorrente sobe
 * ou desce o preco (subir ate o 5o daria lucro maior que o da loja, que e o que o dono recusou).
 *
 * No kit no ML o preco da loja e o das N unidades avulsas e o custo e o das N, entao o lucro e o de vender as N na loja.
 * A conta e do Rise, nunca da LLM. Le as taxas do ML no proprio preco (so GET).
 */

const centavos = (valor) => Math.round(Number(valor) * 100);
const dinheiro = (valor) => centavos(valor) / 100;
const reais = (valor) => Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Para baixo e para cima ao multiplo de 5 centavos, em centavos inteiros (59,90 * 100 em ponto flutuante engana). */
export function paraBaixo5(valor) {
  return (Math.floor(centavos(valor) / 5) * 5) / 100;
}
export function paraCima5(valor) {
  return (Math.ceil(centavos(valor) / 5) * 5) / 100;
}

/** O 5o menor preco do ranking; com menos de 5, o maior; sem preco, `null`. So informa (a posicao), nao decide o preco. */
export function tetoDoRanking(precos) {
  const validos = (precos ?? []).map(Number).filter((preco) => preco > 0).sort((a, b) => a - b);
  if (validos.length === 0) return null;
  return validos[Math.min(4, validos.length - 1)];
}

/**
 * @param {object} cliente  o cliente do ML (so GET)
 * @param {object} rascunho  categoria, tipo e envio (com as medidas) do anuncio
 * @param {{ custo: number|null, precoNaLoja: number|null, precos: number[] }} entrada
 *   `precoNaLoja`: o preco de venda do produto (no kit no ML, o das N unidades); `precos`: os do ranking, so para a posicao.
 * @returns {Promise<{ valor: number|null, lucro: number|null, lucroNaLoja: number|null, precoNaLoja: number|null, markup: number|null, posicao: number|null, total: number, teto: number|null, avisos: string[] }>}
 */
export async function precoDaPropostaML(cliente, rascunho, { custo, precoNaLoja, precos = [] }) {
  const avisos = [];
  const teto = tetoDoRanking(precos);
  const naLoja = Number(precoNaLoja) > 0 ? dinheiro(precoNaLoja) : null;
  const vazio = { valor: null, lucro: null, lucroNaLoja: null, precoNaLoja: naLoja, markup: null, posicao: null, total: (precos ?? []).length, teto, avisos };
  if (!(Number(custo) > 0)) {
    avisos.push("Sem o custo do produto (fornecedor padrão ou rascunho do Bling): o preço não foi calculado.");
    return vazio;
  }
  if (naLoja === null) {
    avisos.push("Sem o preço de venda do produto (o preço na loja): o preço do ML não foi calculado, porque ele sai do lucro na loja.");
    return vazio;
  }
  const lucroNaLoja = dinheiro(lucroLiquido(naLoja, Number(custo)));
  if (!(lucroNaLoja > 0)) {
    avisos.push(`O preço na loja (${reais(naLoja)}) não dá lucro (${reais(lucroNaLoja)}): o preço do ML não foi calculado.`);
    return { ...vazio, lucroNaLoja };
  }

  const contaEm = async (preco) => {
    const custosML = await lerCustosDoAnuncio(cliente, { ...rascunho, preco });
    return custosDoAnuncio({ preco, custo, percentual: custosML.percentual, tarifaFixa: custosML.tarifaFixa, frete: freteQueConta(custosML, rascunho) });
  };
  const alvo = { tipo: "reais", valor: lucroNaLoja };

  // A procura comeca no preco da loja: o ML leva mais taxas que a loja, entao o preco do mesmo lucro fica acima dele, e
  // subindo a partir dali a primeira solucao e a mais barata (abaixo de R$ 79 o frete do vendedor e menor, e de 79 para cima
  // o frete gratis obrigatorio pode dar uma segunda solucao, mais cara).
  const bruto = await precoPorMargemNoML(cliente, { ...rascunho, preco: naLoja }, { custo, margem: alvo });
  if (!bruto) {
    avisos.push(`Nenhum preço deixa no Mercado Livre o lucro da loja (${reais(lucroNaLoja)}) com as taxas dele.`);
    return { ...vazio, lucroNaLoja };
  }
  let valor = paraCima5(bruto.preco);
  // Subir ate 5 centavos pode cruzar R$ 79 e trazer o frete gratis: confere e, se o lucro cair, refaz a partir dali.
  let conta = await contaEm(valor);
  if (!(conta?.lucro >= lucroNaLoja)) {
    const deNovo = await precoPorMargemNoML(cliente, { ...rascunho, preco: valor }, { custo, margem: alvo });
    if (deNovo) {
      valor = paraCima5(deNovo.preco);
      conta = await contaEm(valor);
    }
  }

  const ranking = montarRanking({ preco: valor, catalogos: (precos ?? []).map((preco) => ({ primeiro: { preco } })) });
  if (teto !== null && ranking.posicao > 5) avisos.push(`Com o lucro da loja (${reais(lucroNaLoja)}) o anúncio fica em ${ranking.posicao}º de ${ranking.total} (fora dos 5 primeiros).`);
  return { valor, lucro: conta?.lucro ?? null, lucroNaLoja, precoNaLoja: naLoja, markup: conta?.markup ?? null, posicao: ranking.posicao, total: ranking.total, teto, avisos };
}
