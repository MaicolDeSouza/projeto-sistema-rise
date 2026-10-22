import { faixaDeEstoque } from "@/lib/riseAi/busca";

/**
 * O corte dos dados sensiveis por tela (spec de Acessos, §4 e §5.7): a pagina chama estas funcoes ANTES de mandar os
 * dados ao navegador, porque esconder na tela nao basta (o que sai do servidor pode ser lido no navegador). Sem rede e
 * sem banco: o teste:acessos as confere sozinhas. `pode(id, nivel)` e o da sessao de Acessos.
 */

/** O que a pessoa pode na lista de Produtos. A margem precisa do custo (sem ele nao ha conta) e da margem em si. */
export function acessosDaListaDeProdutos(pode) {
  return {
    editar: pode("tela.produtos", "editar"),
    excluir: pode("tela.produtos", "excluir"),
    clonar: pode("tela.produtos.cadastro", "editar"),
    verLocalizacao: pode("dado.localizacao", "ver"),
    editarLocalizacao: pode("tela.produtos", "editar") && pode("dado.localizacao", "editar"),
    estoqueExato: pode("dado.estoqueExato", "ver"),
    margem: pode("dado.custo", "ver") && pode("dado.margem", "ver"),
  };
}

/** A linha da lista sem o que a pessoa nao ve. Devolve uma copia: a linha recebida nao muda. */
export function projetarProdutoDaLista(produto, acessos) {
  const linha = { ...produto };
  if (!acessos.margem) linha.custo = null;
  if (!acessos.verLocalizacao) {
    linha.localizacao = null;
    if (Array.isArray(linha.pecasDoKit)) linha.pecasDoKit = linha.pecasDoKit.map((peca) => ({ ...peca, localizacao: null }));
  }
  if (!acessos.estoqueExato) linha.estoque = faixaDeEstoque(linha.estoque);
  return linha;
}

/**
 * A ordem pedida na URL, ou "" (a ordem padrao) quando ela revelaria um dado escondido: ordenar por localizacao mostra
 * onde cada peca esta guardada, e ordenar pelo estoque mostra quem tem mais, mesmo com a coluna em faixa.
 */
export function ordemPermitida(chave, acessos) {
  if (chave === "localizacao" && !acessos.verLocalizacao) return "";
  if (chave === "estoque" && !acessos.estoqueExato) return "";
  return chave;
}

/** As pastas de `/api/arquivos` que o Caddy deixa abrir sem login (o Bling e a Loja Integrada baixam as fotos dali). */
const PASTAS_PUBLICAS = ["imagens", "documentos", "certificados"];

export function pastaPublica(pasta) {
  return PASTAS_PUBLICAS.includes(pasta);
}

/**
 * Os campos do cliente que sao "dado pessoal" (`dado.pessoalDoCliente`): os da tela do cadastro (`documento`,
 * `telefones`, `emails`, `enderecos`, `contatos`, `observacoes`) e o `contato` da linha da lista (telefone e e-mail
 * juntos). Sem o dado, nada disso sai do servidor.
 */
const PESSOAIS_NA_TELA = ["documento", "telefones", "emails", "enderecos", "contatos", "observacoes", "contato"];

/** O cliente (da tela ou da lista) sem o dado pessoal quando a pessoa nao o ve. Devolve uma copia. */
export function projetarCliente(cliente, pode) {
  if (pode("dado.pessoalDoCliente", "ver")) return cliente;
  const copia = { ...cliente };
  for (const campo of PESSOAIS_NA_TELA) delete copia[campo];
  return copia;
}

/** As colunas pessoais de `Cliente` que o Salvar grava (enderecos e contatos sao tabelas a parte: quem salva as pula). */
const PESSOAIS_GRAVADOS = {
  documento: null,
  observacoes: null,
  telefone: null,
  telefonesAdicionais: [],
  email: null,
  emailsAdicionais: [],
};

/**
 * Os dados a gravar sem apagar o que a pessoa nao via: sem `dado.pessoalDoCliente` em editar, as colunas pessoais vem do
 * banco (`atual`), nunca do formulario (`recebido`), que chega sem esses campos. Com o dado, vale o formulario.
 */
export function pessoalPreservado(atual, recebido, pode) {
  if (pode("dado.pessoalDoCliente", "editar")) return recebido;
  const preservado = { ...recebido };
  for (const [campo, vazio] of Object.entries(PESSOAIS_GRAVADOS)) preservado[campo] = atual?.[campo] ?? vazio;
  return preservado;
}
