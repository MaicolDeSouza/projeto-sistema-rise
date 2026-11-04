/**
 * O que cada pessoa pode receber de um pedido de venda (Acessos, lancamento 2: dado sensivel e cortado NO SERVIDOR, nao
 * so escondido na tela; o que vai como propriedade de um componente de cliente chega inteiro ao navegador).
 *
 * - Sem `dado.pessoalDoCliente` (ver): sai o documento, o telefone, o e-mail e o endereco do comprador e do cliente.
 * - Sem `dado.custo` (ver): sai a estimativa, o real, os lucros e o custo congelado de cada item.
 * - Sem `dado.localizacao` (ver): sai a localizacao do produto de cada item.
 *
 * Sem imports: `pode(id, nivel)` e o da sessao de Acessos.
 */

const PESSOAIS_DO_CLIENTE = ["documento", "telefone", "email"];

export function projetarPedido(pedido, pode) {
  if (!pedido) return pedido;
  const vePessoal = pode("dado.pessoalDoCliente", "ver");
  const veCusto = pode("dado.custo", "ver");
  const veLocal = pode("dado.localizacao", "ver");
  if (vePessoal && veCusto && veLocal) return pedido;
  const copia = { ...pedido };
  if (!vePessoal) {
    Object.assign(copia, { documentoDoComprador: null, telefoneDoComprador: null, emailDoComprador: null, enderecoDeEntrega: null });
    if (copia.cliente) {
      copia.cliente = { ...copia.cliente };
      for (const campo of PESSOAIS_DO_CLIENTE) delete copia.cliente[campo];
    }
  }
  if (!veCusto) {
    Object.assign(copia, { estimativa: null, real: null, lucroEstimado: null, lucroReal: null });
    copia.itens = (copia.itens ?? []).map((item) => ({ ...item, custoUnitarioCongelado: null, custoOrigem: null }));
  }
  if (!veLocal) copia.itens = (copia.itens ?? []).map((item) => (item.produto ? { ...item, produto: { ...item.produto, localizacao: null } } : item));
  return copia;
}

/**
 * A linha da lista de pedidos: sem `dado.custo`, sem os lucros (a coluna some e o numero nao vai junto); sem
 * `dado.localizacao`, sem a localizacao do item no estoque.
 */
export function projetarLinhaDaLista(linha, pode) {
  let copia = linha;
  if (!pode("dado.custo", "ver")) copia = { ...copia, lucroEstimado: null, lucroReal: null };
  if (!pode("dado.localizacao", "ver") && copia.item) copia = { ...copia, item: { ...copia.item, localizacao: null } };
  return copia;
}

/** Os clientes da janela Vincular cliente: sem o dado pessoal, sem o documento. */
export function projetarClientesDaBusca(clientes, pode) {
  if (pode("dado.pessoalDoCliente", "ver")) return clientes;
  return clientes.map((cliente) => ({ ...cliente, documento: null }));
}
