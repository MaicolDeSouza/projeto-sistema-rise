/**
 * O catalogo de recursos do Rise: tudo o que se pode VER ou MEXER e que uma funcao libera (spec
 * docs/superpowers/specs/2026-10-12-acessos-design.md, §3). Fonte unica, como `blocos.js`: a matriz de permissoes, a
 * resolucao dos niveis, as paginas e as acoes leem daqui. SEM imports: o navegador, o servidor e o teste o usam.
 *
 * Cada recurso: `{ id, rotulo, tipo, grupo, pai?, delegavel, dica? }`.
 * - `tipo` decide os niveis validos (`NIVEIS_POR_TIPO`).
 * - `grupo` e o `href` do bloco do menu (`blocos.js`) onde o recurso aparece na matriz, ou "dados" para os dados
 *   sensiveis, que atravessam varios blocos ("custo" aparece em sete lugares: nao e um campo de uma aba).
 * - `pai` e o recurso de que este depende: tela `nenhum` derruba as sub-telas, os cartoes e as acoes dela.
 *   O pai vem SEMPRE antes do filho na lista (a resolucao percorre em ordem).
 * - Todo bloco tem uma TELA DE ENTRADA (`tipo: "tela"`, sem `pai`, `grupo` = o href): e ela que decide se o bloco
 *   aparece no menu.
 * - `delegavel: false` = so Administrador, conferido em codigo; nunca aparece na matriz.
 *
 * Mudar um `id` depois de gravado apaga a permissao em silencio (a resolucao ignora o que nao esta aqui): renomear
 * pede uma migracao dos dados `PermissaoDaFuncao`/`ExcecaoDoUsuario`.
 */

/** Os niveis validos de cada tipo, do menor para o maior. Cada nivel inclui os anteriores. */
export const NIVEIS_POR_TIPO = {
  tela: ["nenhum", "ver", "editar", "excluir"],
  dado: ["nenhum", "ver", "editar"],
  capacidade: ["nenhum", "ver", "editar"],
  cartao: ["nenhum", "ver"],
  acao: ["nenhum", "executar"],
};

const ORDEM = { nenhum: 0, ver: 1, executar: 1, editar: 2, excluir: 3 };

/** 0 nenhum, 1 ver ou executar, 2 editar, 3 excluir; -1 para o que nao e nivel (fica abaixo de tudo: falha fechada). */
export function ordemDoNivel(nivel) {
  return Object.hasOwn(ORDEM, nivel) ? ORDEM[nivel] : -1;
}

const tela = (id, rotulo, grupo, extra = {}) => ({ id, rotulo, tipo: "tela", grupo, delegavel: true, ...extra });
const sub = (id, rotulo, pai, extra = {}) => ({ id, rotulo, tipo: "tela", pai, delegavel: true, ...extra });
const cartao = (id, rotulo, pai) => ({ id, rotulo, tipo: "cartao", pai, delegavel: true });
const acao = (id, rotulo, pai, dica) => ({ id, rotulo, tipo: "acao", pai, delegavel: true, ...(dica ? { dica } : {}) });
const capacidade = (id, rotulo, pai, dica) => ({ id, rotulo, tipo: "capacidade", pai, delegavel: true, ...(dica ? { dica } : {}) });
/** Uma capacidade que so o Administrador tem (conferido em codigo): nunca aparece na matriz nem vale numa funcao ou excecao. */
const naoDelegavel = (id, rotulo, pai, dica) => ({ id, rotulo, tipo: "capacidade", pai, delegavel: false, ...(dica ? { dica } : {}) });
const dado = (id, rotulo, dica) => ({ id, rotulo, tipo: "dado", grupo: "dados", delegavel: true, dica });

/** O catalogo, na ordem do menu. Quem nao tem `grupo` herda o do pai (preenchido abaixo). */
const LISTA = [
  tela("tela.painel", "Painel", "/"),
  cartao("cartao.painel.produtos", "Painel › Produtos cadastrados", "tela.painel"),
  cartao("cartao.painel.anunciosPublicados", "Painel › Anúncios publicados", "tela.painel"),
  cartao("cartao.painel.anunciosComErro", "Painel › Anúncios com erro", "tela.painel"),
  cartao("cartao.painel.blocos", "Painel › Blocos do sistema", "tela.painel"),

  tela("tela.indicadores", "Indicadores", "/indicadores"),
  sub("tela.indicadores.estoque", "Indicadores › Estoque", "tela.indicadores"),

  tela("tela.cadastros", "Cadastros", "/cadastros"),
  sub("tela.cadastros.clientes", "Cadastros › Clientes", "tela.cadastros"),
  sub("tela.cadastros.fornecedores", "Cadastros › Fornecedores", "tela.cadastros"),
  sub("tela.cadastros.concorrentes", "Cadastros › Concorrentes", "tela.cadastros"),
  sub("tela.cadastros.transportadoras", "Cadastros › Transportadoras", "tela.cadastros"),
  sub("tela.cadastros.marcas", "Cadastros › Marcas", "tela.cadastros"),

  tela("tela.anuncios", "Anúncios", "/anuncios"),

  tela("tela.canaisDeVenda", "Canais de Venda", "/canais-de-venda"),
  sub("tela.canaisDeVenda.mercadoLivre", "Canais de Venda › Mercado Livre", "tela.canaisDeVenda"),
  sub("tela.canaisDeVenda.mercadoLivre.frases", "Canais de Venda › Mercado Livre › Frases fixas", "tela.canaisDeVenda.mercadoLivre"),
  acao("acao.mercadoLivre.publicar", "Publicar no Mercado Livre", "tela.canaisDeVenda.mercadoLivre"),
  sub("tela.canaisDeVenda.lojaIntegrada", "Canais de Venda › Loja Integrada", "tela.canaisDeVenda"),
  acao("acao.lojaIntegrada.sincronizar", "Cadastrar e sincronizar na Loja Integrada", "tela.canaisDeVenda.lojaIntegrada"),
  acao("acao.canaisDeVenda.proporAnuncio", "Propor anúncio (proposta automática)", "tela.canaisDeVenda", "Montar a proposta de anúncio da Loja Integrada e do Mercado Livre pelo Claude ou ChatGPT (MCP); nunca envia ao canal."),

  tela("tela.produtos", "Produtos", "/produtos"),
  sub("tela.produtos.cadastro", "Produtos › cadastro", "tela.produtos"),
  sub("tela.produtos.canais", "Produtos › anúncios do produto", "tela.produtos"),
  acao("acao.produtos.sincronizarBling", "Sincronizar com o Bling", "tela.produtos", "Envio de campos, fornecedores e ajustes de estoque, e o botão Sincronizar estoque."),
  acao("acao.produtos.marcarConferido", "Marcar Conferido", "tela.produtos"),
  acao("acao.produtos.gerarTextoComIA", "Gerar título e descrição com IA", "tela.produtos.cadastro", "Chamada paga à Anthropic."),
  acao("acao.produtos.proporCadastro", "Propor cadastro (proposta automática)", "tela.produtos.cadastro", "Montar a proposta de cadastro pelo Claude ou ChatGPT (MCP); nunca altera o produto."),
  acao("acao.fotos.nanoBanana", "Gerar foto com Nano Banana", "tela.produtos.cadastro", "Chamada paga ao Google."),
  acao("acao.fotos.photoroom", "Melhorar foto com Photoroom", "tela.produtos.cadastro", "Chamada paga ao Photoroom."),

  // Compras (spec 2026-10-26-modulo-compras-design.md): logo depois de Produtos, como no menu.
  tela("tela.compras", "Compras", "/compras"),
  sub("tela.compras.estoqueMinimo", "Compras › Abaixo do estoque mínimo", "tela.compras"),
  sub("tela.compras.pedidos", "Compras › Pedidos de compra", "tela.compras"),
  acao("acao.compras.lancarEstoque", "Lançar estoque do pedido no Bling", "tela.compras.pedidos", "Grava a entrada no Rise e manda ao Bling; o Desfazer manda a saída."),
  acao("acao.compras.casarAliExpress", "Casar item do AliExpress com produto", "tela.compras.pedidos", "Cria o item do pedido, grava o vínculo anúncio+opção do fornecedor Ali e manda a entrada no depósito Virtual do Bling."),

  tela("tela.scraper", "Scraper", "/mercados"),
  sub("tela.scraper.fontes", "Scraper › Fontes", "tela.scraper"),
  acao("acao.scraper.varrer", "Varrer fontes", "tela.scraper.fontes"),

  tela("tela.riseAi", "Rise AI", "/rise-ai"),
  // O id e o do antigo chat (saiu da tela em 20/10/2026): mudar o id apagaria a permissao em silencio.
  capacidade("riseAi.chat", "Rise AI › Acesso pelo Claude e ChatGPT", "tela.riseAi", "Ver = ver as próprias conexões; editar = conectar e consultar pelo Claude ou ChatGPT."),
  capacidade("riseAi.revisao", "Rise AI › Revisão do dia", "tela.riseAi", "Lê as conversas de todos e aprova as sugestões."),
  capacidade("riseAi.conhecimento", "Rise AI › Conhecimento", "tela.riseAi", "Ensina a IA: notas e correções."),
  capacidade("riseAi.consumo", "Rise AI › Consumo", "tela.riseAi"),
  capacidade("riseAi.configuracoes", "Rise AI › Configurações", "tela.riseAi", "Modelos, chaves e limites."),
  capacidade("riseAi.configuracoes.modelos", "Rise AI › Configurações › Modelos", "riseAi.configuracoes", "Modelo padrão e reserva, chaves, tempos e limites."),
  capacidade("riseAi.configuracoes.orcamentos", "Rise AI › Configurações › Orçamentos", "riseAi.configuracoes", "Quanto a IA pode gastar por mês com os clientes."),
  // A aba Canais da internet saiu com o chat (20/10/2026) e voltou em 22/10/2026 só com o Telegram (Entrega C1), não
  // delegável: o bot manda avisos com dado da loja a quem estiver vinculado, e isso é só do Administrador.
  naoDelegavel("riseAi.configuracoes.canais", "Rise AI › Configurações › Canais (Telegram)", "riseAi.configuracoes", "O bot do Telegram, o vínculo das pessoas e quais avisos saem. Só do Administrador."),
  capacidade("riseAi.configuracoes.atendimento", "Rise AI › Configurações › Atendimento", "riseAi.configuracoes", "O prompt das respostas ao cliente."),
  naoDelegavel("riseAi.configuracoes.promptCliente", "Rise AI › Configurações › Atendimento › Prompt das respostas ao cliente", "riseAi.configuracoes.atendimento"),

  tela("tela.pedidos", "Pedidos", "/pedidos"),
  tela("tela.estoque", "Estoque", "/estoque"),
  // Ordem de producao (spec 2026-10-26-producao-pecas-proprias-design.md): a lista e a ordem; editar = criar ordem.
  sub("tela.estoque.producao", "Estoque › Ordens de produção", "tela.estoque"),
  acao("acao.producao.movimentar", "Dar baixa, concluir ou cancelar ordem de produção", "tela.estoque.producao", "Grava os movimentos no Rise e manda ao Bling."),
  tela("tela.financeiro", "Financeiro", "/financeiro"),
  tela("tela.relatorios", "Relatórios", "/relatorios"),

  tela("tela.ferramentas", "Ferramentas", "/ferramentas"),
  sub("tela.ferramentas.imagemParaSvg", "Ferramentas › Imagem para SVG", "tela.ferramentas"),
  sub("tela.ferramentas.cotacaoDolar", "Ferramentas › Cotação do dólar", "tela.ferramentas"),

  tela("tela.configuracoes", "Configurações", "/configuracoes"),
  sub("tela.configuracoes.usuarios", "Configurações › Usuários e funções", "tela.configuracoes", { delegavel: false }),
  sub("tela.integracoes", "Configurações › Integrações", "tela.configuracoes"),
  acao("acao.vps.deploy", "Atualizar a VPS e o banco do PC", "tela.integracoes", "Só no Rise do PC."),

  dado("dado.custo", "Custo e fornecedores", "Cadastro, lista de Produtos, kit, indicadores, lupa de referências, custos do Mercado Livre e chat do Rise AI."),
  dado("dado.margem", "Margem", "Margem e sua cor no preço de venda, custos do Mercado Livre e posição de preço."),
  dado("dado.localizacao", "Localização no estoque", "Lista de Produtos, cadastro e kit."),
  dado("dado.estoqueExato", "Estoque exato", "A quantidade; sem ela, só disponível, poucas unidades ou em falta."),
  dado("dado.concorrentes", "Concorrentes e seus preços", "Aba Fornecedores / Concorrentes, Scraper e posição de preço."),
  dado("dado.pessoalDoCliente", "Dados pessoais do cliente", "CPF, endereço e telefone, no cadastro de clientes e nas conversas."),
  dado("dado.financeiro", "Financeiro", "Faturamento, contas e valores do estoque."),
];

const PORID = new Map();
for (const recurso of LISTA) {
  if (!recurso.grupo) recurso.grupo = PORID.get(recurso.pai)?.grupo;
  PORID.set(recurso.id, recurso);
}

/** @type {{ id: string, rotulo: string, tipo: keyof NIVEIS_POR_TIPO, grupo: string, pai?: string, delegavel: boolean, dica?: string }[]} */
export const RECURSOS = Object.freeze(LISTA.map((recurso) => Object.freeze(recurso)));

/** Os ids que so o Administrador tem (conferido em codigo). */
export const NAO_DELEGAVEIS = RECURSOS.filter((recurso) => !recurso.delegavel).map((recurso) => recurso.id);

export function recursoPorId(id) {
  return PORID.get(id) ?? null;
}

/** `true` so para um nivel valido do tipo daquele recurso (recurso desconhecido: `false`). */
export function validarNivel(id, nivel) {
  const recurso = PORID.get(id);
  return Boolean(recurso) && NIVEIS_POR_TIPO[recurso.tipo].includes(nivel);
}

/** O maior nivel valido do tipo ("excluir" para tela, "executar" para acao...). */
export function maiorNivel(tipo) {
  return NIVEIS_POR_TIPO[tipo].at(-1);
}

/**
 * Os grupos da matriz de permissoes, na ordem do menu e com os dados sensiveis por ultimo: `[{ grupo, rotulo,
 * recursos }]`. O rotulo e o da tela de entrada do bloco. O que nao e delegavel fica de fora.
 */
export function gruposDaMatriz() {
  const grupos = new Map();
  for (const recurso of RECURSOS) {
    if (!recurso.delegavel || recurso.grupo === "dados") continue;
    if (!grupos.has(recurso.grupo)) grupos.set(recurso.grupo, { grupo: recurso.grupo, rotulo: recurso.rotulo, recursos: [] });
    grupos.get(recurso.grupo).recursos.push(recurso);
  }
  const dados = RECURSOS.filter((recurso) => recurso.grupo === "dados");
  return [...grupos.values(), { grupo: "dados", rotulo: "Dados sensíveis", recursos: dados }];
}
