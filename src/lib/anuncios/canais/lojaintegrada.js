/**
 * Loja Integrada.
 *
 * Nao ha chamada direta: a Chave de Aplicacao da API esta suspensa para
 * lojistas, entao o canal e atendido pelo Bling, que ja tem chave propria e ja
 * sincroniza produto, estoque, preco e pedidos com esta loja.
 *
 * O canal existe aqui para aparecer na tela com a explicacao correta, em vez de
 * sumir e dar a impressao de que a loja propria ficou de fora.
 */

export const VIA_BLING = true;

export function camposEditaveis() {
  return {
    titulo: { editavel: false, motivo: "Gerenciado pelo Bling" },
    descricao: { editavel: false, motivo: "Gerenciado pelo Bling" },
    preco: { editavel: false, motivo: "Gerenciado pelo Bling" },
  };
}

export function validar(produto, anuncio, _atributos, contexto = {}) {
  if (!contexto.blingPublicado) {
    return [
      {
        campo: "canal",
        problema:
          "Publique primeiro no Bling: é ele que envia o produto para a Loja Integrada.",
        bloqueante: true,
      },
    ];
  }
  return [];
}

export function montarPayload() {
  return {
    observacao:
      "Sem payload próprio: o Bling sincroniza o produto com a Loja Integrada.",
  };
}
