/**
 * Os textos da tela de Pedidos de venda: o "!" (spec 5.9) guarda chaves, e a tela traduz aqui. Os textos do status
 * moram em `lib/pedidos/status.js` (o mesmo arquivo que decide o status) e sao reexportados para a tela importar de um
 * lugar so.
 */

export { COR_DO_STATUS, COR_DO_STATUS_DO_ENVIO, STATUS, TEXTO_DO_STATUS, TEXTO_DO_STATUS_DO_ENVIO } from "@/lib/pedidos/status";

export const TEXTO_DO_AVISO = {
  clienteSemDocumento: "Pedido sem cliente: o canal não informou CPF/CNPJ.",
  documentoInvalido: "CPF/CNPJ do comprador inválido.",
  produtoForaDoRise: "Item que não está cadastrado no Rise.",
  produtoNaoConferido: "Item com produto não conferido.",
  semCusto: "Item sem custo: o lucro fica em aberto.",
  semEstimativa: "Sem estimativa: o anúncio do ML não foi lido.",
  lucroDivergente: "Lucro real diferente do estimado.",
  statusDesconhecido: "Situação nova no canal, que o Rise não conhece.",
  lojaDesconhecida: "Loja do Bling que o Rise não lê.",
  fraude: "Risco de fraude no ML: não envie.",
  espelhoNoBlingAusente: "Sem cópia no Bling há mais de 1 hora: o estoque não baixou.",
  nfACancelar: "Pedido devolvido com NF autorizada: cancele a NF.",
  leituraFalhou: "A última leitura deste pedido falhou.",
};

/** Os avisos que pedem cuidado imediato: o "!" fica vermelho em vez de ambar. */
export const AVISOS_GRAVES = new Set(["fraude", "nfACancelar"]);

/** Os avisos de uma linha, um por linha, para o `title` do "!". Chave desconhecida aparece como veio. */
export function textoDosAvisos(avisos) {
  return (Array.isArray(avisos) ? avisos : []).map((chave) => TEXTO_DO_AVISO[chave] ?? chave).join("\n");
}
