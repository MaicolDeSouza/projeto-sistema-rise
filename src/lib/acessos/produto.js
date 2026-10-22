/**
 * O que a pessoa pode fazer no CADASTRO de Produto (pedido do dono em 20/10/2026, opcao 1 da avaliacao): UMA conta, usada
 * pelas paginas (que mandam o resultado ao formulario), pelas acoes do servidor e pelo teste. Pura e sem imports: so recebe
 * o `pode(id, nivel)` da sessao.
 *
 * Regra (o "administrador" do cadastro e quem tem poder de EDICAO, definido na matriz de Usuarios e funcoes):
 *  - `editar`: Produtos › cadastro em Editar. Sem ele o formulario abre SO PARA LEITURA e nenhuma ferramenta de edicao
 *    e desenhada (varinha do codigo, lupa, listas de escolha, "$", calculadora, Criar descricao, Salvar).
 *  - `referencias`: as ferramentas que vem de fornecedores e concorrentes (lupa, listas de escolha de marca, modelo,
 *    medidas e NCM, "$", Clonar por codigo, documentos das referencias). Exigem Editar E Custo E Concorrentes: a lupa
 *    mostra o preco de custo do fornecedor e o preco do concorrente, e nao ha como entregar so metade. Falha fechada.
 *  - `ia`: Criar descricao e titulo com IA (chamada paga). Exige Editar E a acao de gerar texto com IA.
 *  - `margem`: `"sempre"` (com Editar), `"olho"` (so leitura: um olho mostra a margem ao clicar) ou `"nenhuma"`. A margem
 *    e calculada do custo, entao exige as duas permissoes: Margem E Custo.
 *  - `custo` e `concorrentes`: as secoes da aba Fornecedores / Concorrentes e o que o servidor manda para a tela.
 *  - `cadastrarFornecedor` e `cadastrarConcorrente`: o cadastro rapido (popup) de quem ainda nao esta em Cadastros.
 *    Exigem Editar E editar a secao do tipo em Cadastros (e o mesmo `salvarParceiro` do cadastro completo).
 *
 * @param {(id: string, nivel: string) => boolean} pode
 * @returns {{ editar: boolean, custo: boolean, concorrentes: boolean, referencias: boolean, ia: boolean, margem: "sempre"|"olho"|"nenhuma", cadastrarFornecedor: boolean, cadastrarConcorrente: boolean }}
 */
export function acessosDoCadastro(pode) {
  const editar = pode("tela.produtos.cadastro", "editar");
  const custo = pode("dado.custo", "ver");
  const concorrentes = pode("dado.concorrentes", "ver");
  const veMargem = pode("dado.margem", "ver") && custo;
  return {
    editar,
    custo,
    concorrentes,
    referencias: editar && custo && concorrentes,
    ia: editar && pode("acao.produtos.gerarTextoComIA", "executar"),
    margem: !veMargem ? "nenhuma" : editar ? "sempre" : "olho",
    cadastrarFornecedor: editar && pode("tela.cadastros.fornecedores", "editar"),
    cadastrarConcorrente: editar && pode("tela.cadastros.concorrentes", "editar"),
  };
}
