import { carregarAnuncioML } from "@/lib/canaisDeVenda/ml/banco";
import { lerCustosDoAnuncio } from "@/lib/canaisDeVenda/ml/leitura";
import { custosDoAnuncio, freteQueConta } from "@/lib/canaisDeVenda/ml/custos";

/**
 * As taxas do anuncio do ML no dia da venda, para a estimativa do pedido (spec 5.6). O editor nao grava as taxas
 * que le (comissao, tarifa fixa, frete do vendedor): a estimativa rele o ML UMA vez por pedido, de leitura, com o mesmo
 * `lerCustosDoAnuncio` do editor, e devolve o `custosML` que `parcelasDaEstimativa` consome mais o lucro por unidade
 * que o editor mostraria. Anuncio sem rascunho no Rise, ou ML fora do ar: null (aviso `semEstimativa`).
 */
export async function estimativaDoAnuncioML(cliente, anuncio, custo) {
  if (!anuncio?.id) return null;
  const carregado = await carregarAnuncioML(anuncio.id);
  if (!carregado?.ok || !carregado.rascunho) return null;
  const { rascunho } = carregado;
  const custos = await lerCustosDoAnuncio(cliente, rascunho);
  const frete = freteQueConta(custos, rascunho);
  const custosML = { percentual: custos.percentual ?? 0, tarifaFixa: custos.tarifaFixa ?? 0, frete };
  return {
    ...custosML,
    preco: rascunho.preco ?? null,
    lidoEm: new Date(),
    porUnidade: custosDoAnuncio({ preco: rascunho.preco, custo, ...custosML }),
  };
}
