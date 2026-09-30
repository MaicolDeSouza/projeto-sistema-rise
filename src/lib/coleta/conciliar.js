/**
 * Junta a lista nova do fornecedor com o que ja estava guardado.
 *
 * Combinado com o dono em 01/09/2026. Tres destinos, e o terceiro e o que
 * exigiu conversa:
 *
 *   novo na lista          -> entra
 *   na lista e no sistema  -> atualiza preco e saldo
 *   so no sistema          -> FICA, marcado como ausente da ultima lista
 *
 * Produto que sai da lista nao e apagado: codigo, descricao, fotos e NCM
 * custaram caro para obter, o item costuma voltar na semana seguinte, e apagar
 * jogaria fora tudo isso por causa de uma linha que nao veio.
 *
 * MAS AUSENTE NAO E ZERO. O fornecedor nao declarou saldo zero — ele so nao
 * mandou a linha, e as duas coisas nao sao a mesma: "esgotou" e afirmacao dele,
 * "nao veio na lista" e observacao nossa. Gravar 0 poria na boca dele um numero
 * que ele nao disse, contra a regra que vale no resto do sistema — campo
 * ausente fica null, nunca inventado. O saldo vai a null e o motivo fica
 * escrito em `ausente`, para a tela poder dizer qual dos dois casos e.
 *
 * Nada aqui le disco nem rede: recebe as duas listas e devolve a terceira.
 */

/// Abaixo disto, a lista nova nao e aplicada: e desvio absurdo, nao mercado.
///
/// O caso concreto: a Fortek manda DUAS listas — pronta entrega e reserva — e
/// enviar so uma marcaria como ausentes todos os produtos que so existem na
/// outra. Centenas de itens zerados por um arquivo esquecido, sem erro nenhum
/// na tela. Vale igual para exportacao da aba errada ou truncada.
const QUEDA_SUSPEITA = 0.5;

/** Indexa por codigo, ignorando o que entrou como N/A. */
function porCodigo(produtos) {
  const indice = new Map();

  for (const produto of produtos ?? []) {
    if (!produto.code || produto.code === "N/A") continue;
    if (!indice.has(produto.code)) indice.set(produto.code, produto);
  }

  return indice;
}

/**
 * A lista nova encolheu a ponto de nao dar para confiar?
 *
 * So compara arquivo com arquivo. A colheita do site traz vinte produtos e o
 * arquivo traz mil e novecentos: comparar os dois acusaria queda em toda troca
 * de caminho, e o aviso viraria ruido que se aprende a ignorar.
 */
export function quedaSuspeita({ anteriores, novos, origemAnterior }) {
  if (origemAnterior !== "arquivo") return null;

  const antes = anteriores?.length ?? 0;
  const agora = novos?.length ?? 0;
  if (antes === 0 || agora >= antes * QUEDA_SUSPEITA) return null;

  const sumiram = antes - agora;

  return {
    antes,
    agora,
    sumiram,
    percentual: Math.round((sumiram / antes) * 100),
  };
}

/**
 * @param {object} entrada
 * @param {object[]} entrada.anteriores  produtos ja guardados
 * @param {object[]} entrada.novos       produtos lidos da lista de agora
 * @param {string}  [entrada.dataDaLista] quando o fornecedor mandou a lista
 */
export function conciliar({ anteriores, novos, dataDaLista }) {
  const antigos = porCodigo(anteriores);
  const chegaram = porCodigo(novos);

  // Produto atualizado usa o objeto novo inteiro — mas se o leitor desta lista
  // nao extrai foto (o PDF da Fortek nao tinha isso ate 29/09/2026), o produto
  // ja tinha imagem guardada, e "nao trouxe foto desta vez" nao pode virar
  // "produto ficou sem foto": e a mesma logica de nunca apagar dado caro por
  // causa de um campo que a lista de agora nao cobre.
  const resultado = (novos ?? []).map((produto) => {
    if (produto.images?.length) return produto;
    const antigo = produto.code && produto.code !== "N/A" ? antigos.get(produto.code) : null;
    return antigo?.images?.length ? { ...produto, images: antigo.images } : produto;
  });
  const ausentes = [];

  for (const [codigo, antigo] of antigos) {
    if (chegaram.has(codigo)) continue;

    ausentes.push(codigo);
    resultado.push({
      ...antigo,
      stock: {
        ...antigo.stock,
        // NULL, e nao 0: ver o cabecalho deste arquivo.
        quantity: null,
        aChegar: null,
        status: "OUT_OF_STOCK",
      },
      // O que a tela mostra no lugar do saldo, e o que impede alguem de olhar
      // daqui a um mes e achar que o fornecedor confirmou zero.
      ausente: {
        desde: dataDaLista ?? new Date().toISOString(),
        motivo: "nao veio na ultima lista do fornecedor",
      },
      origens: {
        ...antigo.origens,
        quantidade: "ausente na ultima lista — o fornecedor nao declarou zero",
      },
    });
  }

  return {
    produtos: resultado,
    resumo: {
      // Produto sem codigo nao entra em nenhuma conta: sem chave, nao da para
      // dizer se e o mesmo item da lista passada.
      novos: [...chegaram.keys()].filter((codigo) => !antigos.has(codigo)).length,
      atualizados: [...chegaram.keys()].filter((codigo) => antigos.has(codigo)).length,
      ausentes: ausentes.length,
    },
  };
}
