import { custosDoAnuncio, freteQueConta } from "@/lib/canaisDeVenda/ml/custos";
import { lerCustosDoAnuncio, precoPorMargemNoML } from "@/lib/canaisDeVenda/ml/leitura";
import { montarRanking } from "@/lib/canaisDeVenda/ml/ranking";

/**
 * O preco da proposta do Mercado Livre (spec 2026-10-23, secao 8.2), regra do dono:
 * - piso: 40% de MARKUP sobre o CUSTO TOTAL (fornecedor + comissao + tarifa + frete do vendedor + imposto de 6%; pedido
 *   do dono em 24/10/2026: "40% para ML" e "quero que o custo total entre na conta"; ate ali era 30% de margem);
 * - teto: ficar entre os 5 primeiros do ranking (o 5o menor preco; com menos de 5 precos, o maior);
 * - o maior preco de 5 em 5 centavos que cumpre os dois, R$ 0,10 ABAIXO do teto (pedido do dono em 24/10/2026, a mesma
 *   regra da proposta de produto: "o concorrente em 5 esta a R$ 35,90 e devo colocar uns 10 centavos a menos"; ate ali o
 *   candidato era o proprio teto, e o anuncio empatava com ele); se o piso fica fora do top 5, fica no piso e avisa.
 * A conta e do Rise, nunca da LLM. Le as taxas do ML no proprio preco (so GET): no maximo 3 leituras depois do piso.
 */

export const MARKUP_MINIMO = 40;
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
export async function precoDaPropostaML(cliente, rascunho, { custo, precos = [], markupMinimo = MARKUP_MINIMO }) {
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

  // O piso: o preco que da o markup, arredondado PARA CIMA aos 5 centavos (para baixo entregaria menos que o piso).
  // O "percentual" do precoPorMargem e % do custo (markup) desde 24/10/2026.
  const pisoBruto = await precoPorMargemNoML(cliente, rascunho, { custo, margem: { tipo: "percentual", valor: markupMinimo } });
  if (!pisoBruto) {
    avisos.push(`Nenhum preço chega a ${markupMinimo}% de markup com as taxas do Mercado Livre.`);
    return vazio;
  }
  let piso = paraCima5(pisoBruto.preco);
  // Subir ate 5 centavos pode cruzar R$ 79 e trazer o frete gratis: confere e, se o markup cair, refaz a partir dali.
  if ((await markupEm(piso)) < markupMinimo) {
    const deNovo = await precoPorMargemNoML(cliente, { ...rascunho, preco: piso }, { custo, margem: { tipo: "percentual", valor: markupMinimo } });
    if (deNovo) piso = paraCima5(deNovo.preco);
  }

  let valor = piso;
  if (teto === null) {
    avisos.push(`Ficou no preço de ${markupMinimo}% de markup: sem concorrente para comparar.`);
  } else if (piso <= teto - ABAIXO_DO_TETO) {
    const candidato = paraBaixo5(teto - ABAIXO_DO_TETO);
    if ((await markupEm(candidato)) >= markupMinimo) valor = candidato;
    else if (candidato >= LIMITE_DO_FRETE_GRATIS && piso < LIMITE_DO_FRETE_GRATIS) {
      // Acima de R$ 79 o frete gratis obrigatorio come o lucro: o melhor fica logo abaixo da virada.
      const abaixo = paraBaixo5(LIMITE_DO_FRETE_GRATIS - 0.01);
      if ((await markupEm(abaixo)) >= markupMinimo) valor = abaixo;
    }
  }

  const ranking = montarRanking({ preco: valor, catalogos: (precos ?? []).map((preco) => ({ primeiro: { preco } })) });
  if (teto !== null && valor > teto) avisos.push(`Com ${markupMinimo}% de markup o anúncio fica em ${ranking.posicao}º de ${ranking.total} (fora dos 5 primeiros).`);
  return { valor, markup: await markupEm(valor), posicao: ranking.posicao, total: ranking.total, piso, teto, avisos };
}
