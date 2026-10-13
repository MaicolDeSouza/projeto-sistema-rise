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

// A cotacao do dia (PTAX), quando alguem a buscou: `garantirCotacaoDoDia` (`cotacaoDoDia.js`, so servidor) a guarda aqui.
// Fica em memoria do processo e vale por 36 horas (um PTAX de sexta ainda vale no domingo); depois disso, a fixa.
// Quem so le (`emReais`, a tela do Photoroom) continua sincrono e sem saber de onde veio o numero.
const VALIDADE_DA_COTACAO_MS = 36 * 60 * 60 * 1000;
let doDia = null;

/** Guarda a cotacao do dia. `agora` e so para o teste. */
export function definirCotacaoDoDia({ valor, data }, agora = Date.now()) {
  doDia = { valor, data, guardadaEm: agora };
}

export function esquecerCotacaoDoDia() {
  doDia = null;
}

/** Ha quanto tempo a cotacao do dia foi guardada (ms), ou `null` se nao ha. */
export function idadeDaCotacaoDoDia(agora = Date.now()) {
  return doDia ? agora - doDia.guardadaEm : null;
}

/** @returns {{ valor: number, origem: "ptax", data: string } | { valor: number, origem: "fixa" }} */
export function cotacaoDoDolar(agora = Date.now()) {
  if (doDia && agora - doDia.guardadaEm < VALIDADE_DA_COTACAO_MS) return { valor: doDia.valor, origem: "ptax", data: doDia.data };
  return { valor: COTACAO_DOLAR_FIXA, origem: "fixa" };
}

/** Dolares em reais, arredondado ao centavo. */
export function emReais(dolares, cotacao = cotacaoDoDolar()) {
  return Math.round(dolares * cotacao.valor * 100) / 100;
}
