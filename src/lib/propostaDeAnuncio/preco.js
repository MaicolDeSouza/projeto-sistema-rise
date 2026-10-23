import { custosDoAnuncio, freteQueConta } from "@/lib/canaisDeVenda/ml/custos";
import { lerCustosDoAnuncio, precoPorMargemNoML } from "@/lib/canaisDeVenda/ml/leitura";
import { montarRanking } from "@/lib/canaisDeVenda/ml/ranking";

/**
 * O preco da proposta do Mercado Livre (spec 2026-10-23, secao 8.2), regra do dono:
 * - piso: 30% de margem depois da comissao, da tarifa, do frete do vendedor e do imposto de 6%;
 * - teto: ficar entre os 5 primeiros do ranking (o 5o menor preco; com menos de 5 precos, o maior);
 * - o maior preco de 5 em 5 centavos que cumpre os dois; se 30% fica fora do top 5, fica nos 30% e avisa.
 * A conta e do Rise, nunca da LLM. Le as taxas do ML no proprio preco (so GET): no maximo 3 leituras depois do piso.
 */

export const MARGEM_MINIMA = 30;
const LIMITE_DO_FRETE_GRATIS = 79;

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
 * @param {{ custo: number|null, precos: number[], margemMinima?: number }} entrada
 * @returns {Promise<{ valor: number|null, margem: number|null, posicao: number|null, total: number, piso: number|null, teto: number|null, avisos: string[] }>}
 */
export async function precoDaPropostaML(cliente, rascunho, { custo, precos = [], margemMinima = MARGEM_MINIMA }) {
  const avisos = [];
  const teto = tetoDoRanking(precos);
  const vazio = { valor: null, margem: null, posicao: null, total: (precos ?? []).length, piso: null, teto, avisos };
  if (!(Number(custo) > 0)) {
    avisos.push("Sem o custo do produto (fornecedor padrão ou rascunho do Bling): o preço não foi calculado.");
    return vazio;
  }

  const margemEm = async (preco) => {
    const custosML = await lerCustosDoAnuncio(cliente, { ...rascunho, preco });
    const custos = custosDoAnuncio({ preco, custo, percentual: custosML.percentual, tarifaFixa: custosML.tarifaFixa, frete: freteQueConta(custosML, rascunho) });
    return custos?.margem ?? null;
  };

  // O piso: o preco que da a margem, arredondado PARA CIMA aos 5 centavos (para baixo entregaria menos que 30%).
  const pisoBruto = await precoPorMargemNoML(cliente, rascunho, { custo, margem: { tipo: "percentual", valor: margemMinima } });
  if (!pisoBruto) {
    avisos.push(`Nenhum preço chega a ${margemMinima}% de margem com as taxas do Mercado Livre.`);
    return vazio;
  }
  let piso = paraCima5(pisoBruto.preco);
  // Subir ate 5 centavos pode cruzar R$ 79 e trazer o frete gratis: confere e, se a margem cair, refaz a partir dali.
  if ((await margemEm(piso)) < margemMinima) {
    const deNovo = await precoPorMargemNoML(cliente, { ...rascunho, preco: piso }, { custo, margem: { tipo: "percentual", valor: margemMinima } });
    if (deNovo) piso = paraCima5(deNovo.preco);
  }

  let valor = piso;
  if (teto === null) {
    avisos.push(`Ficou no preço de ${margemMinima}% de margem: sem concorrente para comparar.`);
  } else if (piso <= teto) {
    const candidato = paraBaixo5(teto);
    if ((await margemEm(candidato)) >= margemMinima) valor = candidato;
    else if (candidato >= LIMITE_DO_FRETE_GRATIS && piso < LIMITE_DO_FRETE_GRATIS) {
      // Acima de R$ 79 o frete gratis obrigatorio come a margem: o melhor fica logo abaixo da virada.
      const abaixo = paraBaixo5(LIMITE_DO_FRETE_GRATIS - 0.01);
      if ((await margemEm(abaixo)) >= margemMinima) valor = abaixo;
    }
  }

  const ranking = montarRanking({ preco: valor, catalogos: (precos ?? []).map((preco) => ({ primeiro: { preco } })) });
  if (teto !== null && valor > teto) avisos.push(`Com ${margemMinima}% de margem o anúncio fica em ${ranking.posicao}º de ${ranking.total} (fora dos 5 primeiros).`);
  return { valor, margem: await margemEm(valor), posicao: ranking.posicao, total: ranking.total, piso, teto, avisos };
}
