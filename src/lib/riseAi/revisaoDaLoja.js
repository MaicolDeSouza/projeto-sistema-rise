/**
 * O que a Revisao do dia mostra de uma resposta do chat da loja (o Hobi), lido do `MensagemIA.estruturado` que o
 * cerebro do cliente gravou (`cliente/cerebro.js`): os cartoes que o visitante viu, a lista orcada, a passagem para o
 * WhatsApp e, quando o filtro de saida barrou, o texto que o visitante NAO viu.
 *
 * Puro e tolerante: `estruturado` de outro formato (uma resposta do Claude pelo MCP, uma mensagem antiga) devolve tudo
 * vazio, e a tela simplesmente nao desenha o bloco. Sem imports: a tela (cliente) e o teste usam o mesmo arquivo.
 */

const ehObjeto = (valor) => Boolean(valor) && typeof valor === "object" && !Array.isArray(valor);
const texto = (valor) => (valor == null ? null : String(valor));

/**
 * @param {unknown} estruturado
 * @returns {{
 *   cartoes: { sku: string | null, nome: string | null, preco: number | null, faixa: string | null, papel: string | null }[],
 *   lista: { linhas: { pedido: string | null, quantidade: number, sku: string | null, nome: string | null, subtotal: number | null }[], total: number } | null,
 *   passagem: string | null,
 *   barrada: { motivo: string, texto: string } | null,
 * }}
 */
export function resumoDaRespostaDaLoja(estruturado) {
  const dados = ehObjeto(estruturado) ? estruturado : {};
  const cartoes = Array.isArray(dados.cartoes)
    ? dados.cartoes.filter(ehObjeto).map((cartao) => ({ sku: texto(cartao.sku), nome: texto(cartao.nome), preco: cartao.preco == null ? null : Number(cartao.preco), faixa: texto(cartao.faixa), papel: texto(cartao.papel) }))
    : [];
  const lista =
    ehObjeto(dados.lista) && Array.isArray(dados.lista.linhas)
      ? {
          linhas: dados.lista.linhas.filter(ehObjeto).map((linha) => ({
            pedido: texto(linha.pedido),
            quantidade: Number(linha.quantidade) || 1,
            sku: ehObjeto(linha.achado) ? texto(linha.achado.sku) : null,
            nome: ehObjeto(linha.achado) ? texto(linha.achado.nome) : null,
            subtotal: linha.subtotal == null ? null : Number(linha.subtotal),
          })),
          total: Number(dados.lista.total) || 0,
        }
      : null;
  const passagem = ehObjeto(dados.passagem) && dados.passagem.motivo ? String(dados.passagem.motivo) : null;
  const barrada = ehObjeto(dados.reprovado) && typeof dados.reprovado.texto === "string" ? { motivo: String(dados.reprovado.motivo ?? ""), texto: dados.reprovado.texto } : null;
  return { cartoes, lista, passagem, barrada };
}

/** O motivo da passagem, como a tela o escreve. */
export const ROTULO_DA_PASSAGEM = {
  pediu_pessoa: "o visitante pediu uma pessoa",
  pagamento: "assunto de pagamento",
  pedido: "pedido já feito",
  troca_ou_garantia: "troca ou garantia",
  reclamacao: "reclamação",
  nao_encontrei: "o assistente não achou o que ele precisava",
  outro: "outro assunto",
  filtro: "a resposta foi barrada pelo filtro",
};

/** O motivo do filtro, como a tela o escreve. */
export const ROTULO_DO_FILTRO = { preco: "preço que não veio do catálogo", link: "link de fora da loja", telefone: "telefone de fora da loja", termo_interno: "assunto interno da loja" };
