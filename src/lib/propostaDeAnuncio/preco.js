import { custosDoAnuncio, freteQueConta } from "@/lib/canaisDeVenda/ml/custos";
import { lerCustosDoAnuncio, precoPorMargemNoML } from "@/lib/canaisDeVenda/ml/leitura";
import { montarRanking } from "@/lib/canaisDeVenda/ml/ranking";

/**
 * O preco da proposta do Mercado Livre (spec 2026-10-23, secao 8.2), regra do dono:
 * - piso: 30% de MARKUP sobre o CUSTO TOTAL (fornecedor + comissao + tarifa + frete do vendedor + imposto de 6%; pedido do
 *   dono em 25/10/2026: "no ML o minimo e 30%, se possivel manter 40%"; era 40% desde 24/10 e 30% de margem antes). Os 40%
 *   (`MARKUP_DESEJADO`) sao so aviso, e o preco que os tem so e escolhido onde nao ha teto (sem concorrente) ou na virada dos
 *   R$ 79;
 * - teto: ficar entre os 5 primeiros do ranking (o 5o menor preco; com menos de 5 precos, o maior);
 * - o maior preco de 5 em 5 centavos que cumpre os dois, R$ 0,10 ABAIXO do teto (pedido do dono em 24/10/2026, a mesma
 *   regra da proposta de produto: "o concorrente em 5 esta a R$ 35,90 e devo colocar uns 10 centavos a menos"; ate ali o
 *   candidato era o proprio teto, e o anuncio empatava com ele); se o piso fica fora do top 5, fica no piso e avisa.
 * A Usinainfo NAO entra aqui (o preco dela e de site; o ML compara com o ranking do catalogo).
 * A conta e do Rise, nunca da LLM. Le as taxas do ML no proprio preco (so GET): no maximo 3 leituras depois do piso.
 */

export const MARKUP_MINIMO = 30;
/** O desejado (pedido do dono em 25/10/2026: "o minimo e 30%, se possivel manter 40%"): so aviso; quem manda no preco e o top 5. */
export const MARKUP_DESEJADO = 40;
const LIMITE_DO_FRETE_GRATIS = 79;
/** O anuncio fica R$ 0,10 abaixo do 5o preco do ranking (o mesmo da proposta de produto, 24/10/2026). */
export const ABAIXO_DO_TETO = 0.1;

const centavos = (valor) => Math.round(Number(valor) * 100);

/** Para baixo e para cima ao multiplo de 5 centavos, em centavos inteiros (59,90 * 100 em ponto flutuante engana). */
export function paraBaixo5(valor) {
  return (Math.floor(centavos(valor) / 5) * 5) / 100;
}
export function paraCima5(valor) {
  return (Math.ceil(centavos(valor) / 5) * 5) / 100;
}

/** O 5o menor preco do ranking; com menos de 5, o maior; sem preco, `null`. */
export function tetoDoRanking(precos) {
  const validos = (precos ?? []).map(Number).filter((preco) => preco > 0).sort((a, b) => a - b);
  if (validos.length === 0) return null;
  return validos[Math.min(4, validos.length - 1)];
}

/**
 * @param {object} cliente  o cliente do ML (so GET)
 * @param {object} rascunho  categoria, tipo e envio (com as medidas) do anuncio; o preco vem daqui
 * @param {{ custo: number|null, precos: number[], markupMinimo?: number }} entrada
 * @returns {Promise<{ valor: number|null, markup: number|null, posicao: number|null, total: number, piso: number|null, teto: number|null, avisos: string[] }>}
 */
export async function precoDaPropostaML(cliente, rascunho, { custo, precos = [], markupMinimo = MARKUP_MINIMO, markupDesejado = MARKUP_DESEJADO }) {
  const avisos = [];
  const teto = tetoDoRanking(precos);
  const vazio = { valor: null, markup: null, posicao: null, total: (precos ?? []).length, piso: null, teto, avisos };
  if (!(Number(custo) > 0)) {
    avisos.push("Sem o custo do produto (fornecedor padrão ou rascunho do Bling): o preço não foi calculado.");
    return vazio;
  }

  const markupEm = async (preco) => {
    const custosML = await lerCustosDoAnuncio(cliente, { ...rascunho, preco });
    const custos = custosDoAnuncio({ preco, custo, percentual: custosML.percentual, tarifaFixa: custosML.tarifaFixa, frete: freteQueConta(custosML, rascunho) });
    return custos?.markup ?? null;
  };

  // O preco que da o markup, arredondado PARA CIMA aos 5 centavos (para baixo entregaria menos que o markup pedido).
  // O "percentual" do precoPorMargem e % do custo (markup) desde 24/10/2026.
  const precoDoMarkup = async (markup) => {
    const bruto = await precoPorMargemNoML(cliente, rascunho, { custo, margem: { tipo: "percentual", valor: markup } });
    if (!bruto) return null;
    let preco = paraCima5(bruto.preco);
    // Subir ate 5 centavos pode cruzar R$ 79 e trazer o frete gratis: confere e, se o markup cair, refaz a partir dali.
    if ((await markupEm(preco)) < markup) {
      const deNovo = await precoPorMargemNoML(cliente, { ...rascunho, preco }, { custo, margem: { tipo: "percentual", valor: markup } });
      if (deNovo) preco = paraCima5(deNovo.preco);
    }
    return preco;
  };

  // O piso: o preco do markup minimo.
  const piso = await precoDoMarkup(markupMinimo);
  if (piso === null) {
    avisos.push(`Nenhum preço chega a ${markupMinimo}% de markup com as taxas do Mercado Livre.`);
    return vazio;
  }

  let valor = piso;
  if (teto === null) {
    // Sem teto nao ha o que ficar abaixo: mira o desejado (40%), e o piso so se o desejado nao existir.
    valor = (await precoDoMarkup(markupDesejado)) ?? piso;
    avisos.push(`Ficou no preço de ${markupDesejado}% de markup: sem concorrente para comparar.`);
  } else if (piso <= teto - ABAIXO_DO_TETO) {
    const candidato = paraBaixo5(teto - ABAIXO_DO_TETO);
    const markupDoCandidato = await markupEm(candidato);
    if (markupDoCandidato >= markupMinimo) valor = candidato;
    if (candidato >= LIMITE_DO_FRETE_GRATIS && piso < LIMITE_DO_FRETE_GRATIS && !(markupDoCandidato >= markupDesejado)) {
      // Acima de R$ 79 o frete gratis obrigatorio come o lucro: o candidato fica abaixo do desejado, e o preco logo abaixo
      // da virada rende mais e continua no top 5 (e o unico jeito de cumprir o minimo quando o candidato nao cumpre).
      const abaixo = paraBaixo5(LIMITE_DO_FRETE_GRATIS - 0.01);
      const markupAbaixo = await markupEm(abaixo);
      if (markupAbaixo >= markupMinimo && markupAbaixo > (markupDoCandidato ?? -Infinity)) valor = abaixo;
    }
  }

  const ranking = montarRanking({ preco: valor, catalogos: (precos ?? []).map((preco) => ({ primeiro: { preco } })) });
  if (teto !== null && valor > teto) avisos.push(`Com ${markupMinimo}% de markup o anúncio fica em ${ranking.posicao}º de ${ranking.total} (fora dos 5 primeiros).`);
  const markup = await markupEm(valor);
  if (markup !== null && markup < markupDesejado) avisos.push(`Markup de ${markup.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%, abaixo dos ${markupDesejado}% desejados.`);
  return { valor, markup, posicao: ranking.posicao, total: ranking.total, piso, teto, avisos };
}
