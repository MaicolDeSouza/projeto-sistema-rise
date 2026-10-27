/**
 * "Não anunciar neste canal" (pedido do dono em 27/10/2026: "alguns produtos irei anunciar apenas no ML e outros apenas na
 * LI ou Shopee; um botão para marcar um X no ícone, desta forma quando eu passar o olho já sei que aquele produto não está
 * apto para determinado marketplace"). A marca mora em `Produto.naoAnunciarEm` e e ligada e desligada pelo botao do rodape
 * do popup de cada canal; na lista de Produtos o icone do canal ganha o X vermelho. So marca: nada e bloqueado nem enviado.
 *
 * Puro, sem imports: a tela, a acao e o teste leem daqui.
 */

/** Os canais que aceitam a marca (o Bling e o ERP, nao um canal de venda). */
export const CANAIS_QUE_ACEITAM_A_MARCA = ["MERCADO_LIVRE", "LOJA_INTEGRADA", "SHOPEE"];

/** O nome curto de cada canal, para o botao ("Não anunciar no ML") e a dica do icone. */
export const NOME_CURTO_DO_CANAL = { MERCADO_LIVRE: "no ML", LOJA_INTEGRADA: "na LI", SHOPEE: "na Shopee" };

/** O produto esta marcado para nao ir a este canal? Aceita lista ausente (produto lido antes da coluna existir). */
export function naoAnunciaEm(lista, canal) {
  return Array.isArray(lista) && lista.includes(canal);
}

/**
 * A lista nova depois de ligar (`marcar` true) ou desligar a marca de um canal: sem repetir, na ordem de
 * `CANAIS_QUE_ACEITAM_A_MARCA` (a coluna e comparada por igualdade, e a ordem nao pode variar), e sem canal desconhecido.
 */
export function listaComAMarca(lista, canal, marcar) {
  const atual = new Set(Array.isArray(lista) ? lista : []);
  if (marcar) atual.add(canal);
  else atual.delete(canal);
  return CANAIS_QUE_ACEITAM_A_MARCA.filter((id) => atual.has(id));
}

/** O texto do botao do rodape do popup. */
export function rotuloDoBotao(canal, marcado) {
  const nome = NOME_CURTO_DO_CANAL[canal] ?? "neste canal";
  return marcado ? `Voltar a anunciar ${nome}` : `Não anunciar ${nome}`;
}
