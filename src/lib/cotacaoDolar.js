/**
 * Cotacao do dolar para mostrar em REAIS o que o Photoroom cobra em dolar.
 *
 * FIXA em R$ 6,00, por decisao do dono em 21/09/2026: a busca da cotacao do dia sera feita pelo
 * agente 2, e depois e so trocar o corpo de `cotacaoDoDolar` por ela. Este arquivo e o UNICO ponto de
 * troca: `emReais` e a tela leem a cotacao daqui e nao guardam numero nenhum.
 *
 * O que o Photoroom cobra de verdade e em DOLAR, no cartao: o valor em reais que a tela mostra e uma
 * ESTIMATIVA (a operadora do cartao ainda soma IOF e spread), e por isso a confirmacao da compra
 * continua dizendo tambem o valor em dolar.
 *
 * Sem imports e sem banco: a tela (cliente) e o servidor usam o mesmo arquivo.
 *
 * PARA QUEM FOR PLUGAR A BUSCA: a fonte oficial do Banco Central (PTAX) foi testada em 21/09/2026 e
 * responde sem chave, com o boletim dos ultimos dias (fim de semana e feriado nao tem boletim, entao
 * pedir uma janela de ~7 dias e ficar com o mais recente):
 *   https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@di,dataFinalCotacao=@df)
 *   ?@di='MM-DD-AAAA'&@df='MM-DD-AAAA'&$orderby=dataHoraCotacao desc&$top=1&$select=cotacaoCompra,cotacaoVenda,dataHoraCotacao&$format=json
 * Devolveu cotacaoVenda 5,1575 no boletim de 18/09/2026 (13:03). Se `cotacaoDoDolar` virar assincrona,
 * `estadoDoPhotoroom` (acoes-imagens.js) e o unico chamador e ja e assincrono.
 */

export const COTACAO_DOLAR_FIXA = 6;

/** @returns {{ valor: number, origem: "fixa" }} */
export function cotacaoDoDolar() {
  return { valor: COTACAO_DOLAR_FIXA, origem: "fixa" };
}

/** Dolares em reais, arredondado ao centavo. */
export function emReais(dolares, cotacao = cotacaoDoDolar()) {
  return Math.round(dolares * cotacao.valor * 100) / 100;
}
