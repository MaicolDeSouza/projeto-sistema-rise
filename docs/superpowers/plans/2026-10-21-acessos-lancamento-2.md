# Acessos, lançamento 2: plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: `superpowers:executing-plans` (execução inline, decisão do dono: uma
> frente só, na `main`, sem subagentes). Os passos usam caixas (`- [ ]`) para acompanhar. **Executar só depois do ok do
> dono a este plano.**

**Objetivo:** o resto do Rise passa a obedecer às funções: menu e Painel filtrados, toda página, rota e Server Action
conferindo o acesso, telas em `ver` com o selo "Somente leitura", os dados sensíveis cortados no servidor, "Ver como" e a
aba Histórico. É o lançamento que dá login à Andrea.

**Arquitetura:** nada novo na base. Cada página chama `exigirAcessoNaPagina`, cada rota `sessaoDeAcessos` + `recusarRota`,
cada ação `negarSemAcesso`/`podeAgora` na primeira linha (o formato de retorno de cada ação fica como está) ou
`executarComAcesso`. O corte dos dados sensíveis é feito por funções PURAS de projeção (uma por tela), chamadas pela
página antes de mandar os dados ao navegador, e a gravação nunca apaga o que a pessoa não via (o molde de
`projetarParaAcessos` do cadastro de Produto). O guarda estático do `teste:acessos` termina com a lista de exceções vazia.

**Stack:** Next.js 16 (JavaScript), React 19, Prisma 7 + PostgreSQL 17, Tailwind 4, lucide-react, zod; testes em
`scripts/teste-*.js` (`conferir(nome, obtido, esperado)`).

**Spec:** `docs/superpowers/specs/2026-10-12-acessos-design.md`: §4 (regras), §5.5 (Ver como e Histórico), §5.6 (tela 5),
§5.7 (tela 6), §8 (lançamento 2), §10. O padrão já feito no cadastro de Produto (CLAUDE.md, "Cadastro de Produto por
poder de edição") é o molde de toda tela em `ver`.

## Restrições globais

- **Escopo é o lançamento 2 (spec §8).** Fora: permissão por campo e `aplicarPermissoesDeCampo` (lançamento 3), Telegram,
  caixa de entrada e WhatsApp (entregas do agente). **Nenhuma migration**: o catálogo já tem todos os recursos.
- **`src/lib/sessao.js` não muda.** `src/lib/acessos/recursos.js` não ganha import.
- Sem permissão: página = 404 do Rise (`exigirAcessoNaPagina`), rota `/api/*` = 403 sem corpo (`recusarRota`), ação =
  `{ ok: false, erro: "Sem permissão para <rótulo>." }` (o texto de `negarSemAcesso`); ação que devolve lista devolve
  `[]` ou o vazio dela. Falha ao ler a sessão = recusa.
- **Tela em `ver` (spec §5.7):** selo "Somente leitura" ao lado do título; texto `readOnly`, listas e caixas `disabled`;
  Salvar, Excluir, Clonar, lápis, lixeiras, "Adicionar", IA e popups de edição rápida **não são desenhados**. Busca,
  filtros, abas, paginação e abrir o registro continuam.
- **Dado em `nenhum` não sai do servidor**: a página não o põe nos dados do navegador; coluna, campo, ícone e valor
  derivado não existem (sem lacuna visível). **Salvar nunca apaga** o que a pessoa não via: lista escondida é ignorada na
  gravação, nunca lida como vazia.
- **Regra de nível das ações** (vale para toda tabela abaixo): leitura = `ver` da tela; criar e alterar = `editar`;
  excluir = `excluir`; ação com `acao.*` no catálogo = `executar` dela (além do `editar` quando grava no Rise).
- Textos de tela com acento; identificadores e comentários sem. Commit só dos meus caminhos (`git commit -F msg --
  <caminhos>`).
- Toda tela tocada: conferida no navegador com `RISE_SIMULAR_LOGIN` (usuário e função `zz-ac-*` de teste, apagados no fim)
  e passada pelo `ecc:make-interfaces-feel-better` em 1366 px (Padrão visual, regra 10).

## Revisão (o que nenhum teste de tarefa cobre e mais pode morder)

1. **Busca ou ordenação que revela o dado escondido:** ordenar Produtos por Localização, ou a Pesquisa profunda achar
   "na localização", sem `dado.localizacao`; achar cliente pelo CPF ou telefone sem `dado.pessoalDoCliente`. Esperado: a
   ordem por um campo escondido volta à padrão e a busca não olha esse campo. Testes nas Tarefas 3 e 4.
2. **Rotas públicas de `/api/arquivos`** (as fotos e documentos que o Bling e a Loja Integrada baixam sem login) têm que
   continuar abrindo sem sessão; só a pasta `reserva` passa a pedir acesso. Teste na Tarefa 3.
3. **Salvar um cliente sem `dado.pessoalDoCliente`** não apaga documento, telefones, e-mails, endereços nem contatos.
   Teste na Tarefa 4.
4. **Página aberta antes de uma mudança de permissão:** a ação recusa e a tela mostra o erro vermelho de hoje (nunca um
   botão que não faz nada). Conferência na tela, Tarefa 9.
5. **Banco fora do ar:** no PC o Rise continua administrador (Integrações abre); na VPS o Painel mostra o erro e nada
   mais abre. Teste na Tarefa 1.

---

### Tarefa 1: Menu, Painel e rodapé do menu (tela 5)

**Arquivos:**
- Criar: `src/lib/acessos/painel.js` (puro, sem imports)
- Alterar: `src/app/layout.jsx`, `src/app/page.jsx`, `src/components/Sidebar.jsx`, `src/lib/acessos/banco.js`
- Testar: `scripts/teste-acessos.js`

**Interfaces:**
- Produz: `cartoesDoPainel(pode) -> { produtos, anunciosPublicados, anunciosComErro, blocos: boolean, algum: boolean }`;
  `avisoDoPainel({ estado, semAdministrador }) -> { texto, tom: "neutro"|"erro" } | null`;
  `haAdministrador({ env }) -> Promise<boolean>` em `banco.js` (algum usuário ativo com função fixa, ou login em
  `RISE_AI_ADMINS`).

- [ ] **Passo 1: testes (falham).** No `teste-acessos`, bloco "Painel":
  `cartoesDoPainel(() => false)` → todos `false` e `algum: false`; com `pode` liberando só `cartao.painel.produtos` →
  `produtos: true, algum: true`. `avisoDoPainel({ estado: "nao-cadastrado" })` e `"inativo"` → "Seu login ainda não foi
  cadastrado no Rise. Peça acesso ao administrador." (`neutro`); `{ estado: "ok" }` sem cartão → "Nada liberado para o
  seu acesso ainda. Peça ao administrador."; `{ semAdministrador: true }` → "O Rise está sem administrador. Na VPS, rode
  `npm run acessos:admin -- <login>`." (`erro`); `{ estado: "erro-banco" }` → "Não foi possível ler os acessos no
  banco." (`erro`).
- [ ] **Passo 2:** rodar `npm run teste:acessos`; esperado: FALHA (módulo não existe).
- [ ] **Passo 3:** implementar `painel.js` e `haAdministrador`. O layout passa a esconder **todos** os blocos
  (`blocosOcultos(acesso.permissoes, blocos.map((b) => b.href).filter((h) => h !== "/"))`): o Painel nunca some (é a
  tela inicial de todos). O Painel (`page.jsx`) lê `sessaoDeAcessos()`, só consulta o banco para os cartões liberados,
  filtra a grade "Blocos do sistema" pelos blocos visíveis e, sem cartão nenhum, mostra o `EmptyState` com cadeado e o
  `avisoDoPainel`. O rodapé do menu mostra a primeira função da pessoa ("Atendimento") na linha pequena; "simulando
  andrea" continua valendo no PC.
- [ ] **Passo 4:** guarda: `src/app/page.jsx` entra em `SEM_RECURSO` com o comentário "Painel é de todos; filtra por
  cartão", e uma asserção própria exige `sessaoDeAcessos(` e `cartao.painel.` nele. Sair da lista de exceções.
- [ ] **Passo 5:** `npm run teste:acessos` passa; na tela, com `RISE_SIMULAR_LOGIN` de uma função só com Cadastros: o
  menu tem Painel e Cadastros, o Painel mostra o aviso "Nada liberado..." (nenhum cartão liberado), e o rodapé diz a função.
- [ ] **Passo 6:** commit "Acessos L2: menu e Painel filtrados pela função".

### Tarefa 2: Selo "Somente leitura" (tela 6)

**Arquivos:** criar `src/components/acessos/SeloSomenteLeitura.jsx`; alterar `src/components/ui/PageHeader.jsx` (prop
nova `somenteLeitura`, o texto do `title`) e o selo atual do cadastro de Produto, que passa a usar o componente.

**Interfaces:** produz `<SeloSomenteLeitura titulo="Seu acesso a Produtos é de leitura" />` e
`<PageHeader somenteLeitura="Seu acesso a X é de leitura" />`. As Tarefas 3 a 8 usam a prop.

- [ ] **Passo 1:** `Badge` neutro com o cadeado (lucide `Lock`, 12 px), texto "Somente leitura", ao lado do título.
- [ ] **Passo 2:** conferir no cadastro de Produto em `ver` (o mesmo de hoje, agora pelo componente). `npm run lint`.
- [ ] **Passo 3:** commit.

### Tarefa 3: Produtos (o resto)

**Arquivos:**
- Criar: `src/lib/acessos/projecoes.js` (puro; recebe `pode`; as Tarefas 4 a 7 acrescentam as delas)
- Alterar: `src/app/produtos/page.jsx`, `src/app/produtos/[id]/canais/[canal]/page.jsx`, os cinco `acoes-*.js` de
  `src/app/produtos/`, `src/app/api/temporarios/[...caminho]/route.js`, `src/app/api/produtos/documento-referencia/route.js`,
  `src/app/api/arquivos/[...caminho]/route.js`, `src/components/produtos/LinhaProduto.jsx`, `TabelaProdutos.jsx`, `EdicaoRapida.jsx`
- Testar: `scripts/teste-acessos.js`

**Interfaces:**
- Consome: `acessosDoCadastro(pode)` (`src/lib/acessos/produto.js`), `faixaDeEstoque(quantidade)` (`src/lib/riseAi/busca.js`).
- Produz: `projetarListaDeProdutos(linhas, pode) -> linhas` (sem `dado.custo` ou sem `dado.margem`: `custo` sai; sem
  `dado.localizacao`: `localizacao` sai; sem `dado.estoqueExato`: `estoque` vira `faixaDeEstoque`) e
  `ordemPermitida(chave, pode) -> chave|null` (localização sem o dado → `null`, a ordem padrão).

| Arquivo | Ação → recurso, nível |
| --- | --- |
| `produtos/page.jsx` | página `tela.produtos` ver; editar decide os lápis da lista |
| `produtos/[id]/canais/[canal]/page.jsx` | `tela.produtos.canais` ver |
| `acoes-edicao-rapida.js` | `salvarLocalizacao` `tela.produtos` editar + `dado.localizacao` editar; `salvarPrecoVenda` `tela.produtos` editar; `ajustarEstoque` `tela.produtos` editar + `dado.estoqueExato` ver |
| `acoes-bling.js` | `abrirJanelaBling` `tela.produtos` ver; `sincronizarComBling`, `cadastrarProdutoNoBling`, `enviarEstoqueAoBling`, `sincronizarEstoqueComBling` `acao.produtos.sincronizarBling` executar |
| `acoes-li.js` | `abrirJanelaLI` `tela.canaisDeVenda.lojaIntegrada` ver; `sincronizarComLI`, `cadastrarProdutoNaLI` `acao.lojaIntegrada.sincronizar` executar |
| `acoes-imagens.js` | `prepararFotosDoProduto`, `estadoDoPhotoroom` `tela.produtos.cadastro` ver; `gerarPreviaPhotoroom`, `comprarPhotoroom` `acao.fotos.photoroom` executar; as demais `tela.produtos.cadastro` editar (`importarFotosDasReferencias` exige `acessosDoCadastro(pode).referencias`) |
| `acoes-nanobanana.js` | `estadoDoNanoBanana` ver; `gerarComNanoBanana`, `salvarPromptDoModelo` `acao.fotos.nanoBanana` executar; extras `tela.produtos.cadastro` editar |
| `api/temporarios` | `tela.produtos.cadastro` ver |
| `api/produtos/documento-referencia` | `acessosDoCadastro(pode).referencias` |
| `api/arquivos` | `imagens`, `documentos`, `certificados`: continuam públicos (o Caddy já os deixa sem login, e o Bling e a LI baixam daí); `reserva`: `tela.produtos.cadastro` ver |

- [ ] **Passo 1: testes (falham):** `projetarListaDeProdutos` com cada dado ausente tira só o campo dele (e com todos
  liberados devolve igual); estoque 0, 2 e 50 viram as faixas de `faixaDeEstoque`; `ordemPermitida("localizacao", sem)`
  → `null`. E um teste da rota de arquivos por função pura `pastaPublica(pasta) -> boolean` (`imagens` sim, `reserva` não).
- [ ] **Passo 2:** `npm run teste:acessos` falha (funções não existem).
- [ ] **Passo 3:** implementar as projeções e as conferências da tabela. A lista sem editar não desenha lápis nem popups;
  a coluna Localização some sem o dado; a Pesquisa profunda não procura na localização sem o dado (`buscaAmpla.js` recebe
  `semLocalizacao`); as ações de lista e o "Clonar" seguem `tela.produtos.cadastro` editar e "Excluir" `tela.produtos` excluir.
- [ ] **Passo 4:** tirar os 10 arquivos da lista de exceções; `npm run teste:acessos`, `teste:estoque`, `teste:imagens`,
  `teste:bling-sync` e `teste:li-sync` passam.
- [ ] **Passo 5:** na tela, função só com Produtos em `ver` sem custo nem localização: lista sem lápis, sem coluna
  Localização, estoque em faixa; ordenar por `?ordem=localizacao` volta à padrão.
- [ ] **Passo 6:** commit.

### Tarefa 4: Cadastros

**Arquivos:** alterar `src/lib/secoesDeCadastros.js` (cada seção ganha `recurso`), `src/app/cadastros/page.jsx`,
`[tipo]/page.jsx`, `[tipo]/novo/page.jsx`, `[tipo]/[id]/page.jsx`, os três `acoes*.js`, `FormularioCliente.jsx`,
`FormularioParceiro.jsx`, `TabelaSimples.jsx`, `TabelaParceiros.jsx` e a lista de clientes; `projecoes.js`.

**Interfaces:** produz `recursoDaSecao(tipo) -> id` (produtos → `tela.produtos`); `projetarCliente(cliente, pode)`
(sem `dado.pessoalDoCliente`: documento, telefones, e-mails, endereços, contatos e observações saem) e
`pessoalPreservado(atual, recebido, pode) -> dados` (sem o dado, os campos pessoais vêm do banco, nunca do formulário).

| Arquivo | Ação → recurso, nível |
| --- | --- |
| `cadastros/page.jsx` | `tela.cadastros` ver; cartões filtrados por `recursoDaSecao` ver |
| `[tipo]/page.jsx`, `[tipo]/[id]/page.jsx` | `recursoDaSecao(tipo)` ver (formulário em `ver` sem editar) |
| `[tipo]/novo/page.jsx` | `recursoDaSecao(tipo)` editar |
| `acoes-clientes.js` | `salvarCliente`, `buscarCep` `tela.cadastros.clientes` editar; `excluirCliente` excluir |
| `acoes-transportadoras.js` | `salvarTransportadora` `tela.cadastros.transportadoras` editar |
| `acoes.js` | `salvarParceiro(tipo)` editar e `excluirParceiro(tipo)` excluir do recurso do tipo; `fontesParaCadastroRapido*` editar do tipo; `salvarMarca` / `excluirMarca` `tela.cadastros.marcas` editar / excluir |

- [ ] **Passo 1: testes (falham):** `recursoDaSecao` para as seis seções e `null` para tipo desconhecido;
  `projetarCliente` sem o dado tira os seis campos; `pessoalPreservado` sem o dado devolve os do banco mesmo com outros
  valores no formulário (e com o dado, os do formulário).
- [ ] **Passo 2:** falha esperada; **Passo 3:** implementar. **Decisão:** sem `dado.pessoalDoCliente` em editar, Novo
  cliente fica desabilitado com o motivo no `title` (o documento é obrigatório); a busca da lista não olha documento nem
  contato. O cadastro rápido de fornecedor e concorrente dentro de Produtos só aparece com editar no tipo dele.
- [ ] **Passo 4:** tirar os 7 arquivos da lista; `teste:acessos` e `teste:cadastros` passam.
- [ ] **Passo 5:** na tela: Clientes em `ver` sem o dado pessoal (formulário com selo, sem CPF nem endereço); Salvar com
  editar e sem o dado não mexe no CPF (conferir no banco). Commit.

### Tarefa 5: Canais de Venda (Mercado Livre e Loja Integrada)

**Arquivos:** as 8 páginas de `src/app/canais-de-venda/`, os dois `acoes.js`, `EditorAnuncioML.jsx`, `EditorAnuncioLI`
(o editor da LI em `src/components/anuncios/li/`), `CustosDoML.jsx`, `CalculadoraDeMargem.jsx`.

**Interfaces:** produz a prop `somenteLeitura` nos dois editores (painéis `inert`, barra de abas livre, rodapé sem
Salvar, Sincronizar e Publicar); custos e calculadora só com `dado.custo` e `dado.margem`.

| Arquivo | Ação → recurso, nível |
| --- | --- |
| `canais-de-venda/page.jsx` | `tela.canaisDeVenda` ver; cartões filtrados |
| ML: lista e `[id]` / `novo` | `tela.canaisDeVenda.mercadoLivre` ver / editar; `configuracoes` → `...mercadoLivre.frases` ver |
| ML `acoes.js` | `abrir*`, `listarAnunciosDoProdutoML`, `lerCategoriaML`, `buscarItemDeComposicao`, `conferirCodigoDeKit`, `sugerirCodigoKit` ver; `salvarAnuncioML`, `prepararPublicacaoMLAcao`, `validarNoMLAcao` editar; `salvarFrasesFixas` `...frases` editar; `sugerirCategoriaML`, `sugerirTitulosML`, `preencherFichaML` editar + `acao.produtos.gerarTextoComIA`; `lerCustosML`, `precoPorMargemML` ver + `dado.custo` + `dado.margem`; `publicarAnuncioMLAcao` `acao.mercadoLivre.publicar` |
| LI: lista, `[id]`, `novo` | `tela.canaisDeVenda.lojaIntegrada` ver / ver / editar |
| LI `acoes.js` | `abrir*`, `anuncioDoProdutoLI`, `vinculoBlingLI`, `listarCategoriasLI`, `listarMarcasLI` ver; `seoConcorrentesLI` ver + `dado.concorrentes`; `salvarAnuncioLI` editar; `gerarSeoIALI`, `sugerirCategoriasLI` editar + `acao.produtos.gerarTextoComIA`; `ligarNoBlingDaLI` `acao.lojaIntegrada.sincronizar` |

- [ ] **Passo 1:** guarda: os 10 arquivos saem da lista (falha até conferirem). **Passo 2:** implementar a tabela e o
  modo `somenteLeitura`. **Passo 3:** `teste:acessos`, `teste:anuncios-ml` e `teste:li-sync` passam. **Passo 4:** na tela,
  o editor do ML em `ver` abre com as abas navegáveis, sem Salvar nem Publicar, sem a aba de custos sem o dado. Commit.

### Tarefa 6: Scraper (Mercados)

**Arquivos:** `src/app/mercados/page.jsx`, `fontes/page.jsx`, `acoes.js` (25 ações), as 3 rotas de `src/app/api/mercados/`;
a tabela e o filtro de abas do Scraper; `projecoes.js`.

**Interfaces:** produz `abasDoScraper(pode) -> ["fornecedores"?, "concorrentes"?]` (fornecedores só com `dado.custo`,
concorrentes só com `dado.concorrentes`); a página só consulta a aba liberada e, sem nenhuma, mostra `EmptyState`.

| Arquivo | Ação → recurso, nível |
| --- | --- |
| `mercados/page.jsx`, `api/mercados/documento`, `detalhePagina` | `tela.scraper` ver + a aba do produto liberada |
| `api/mercados/miniatura` | `tela.scraper` ver **ou** `tela.produtos.cadastro` ver (a lupa usa) |
| `fontes/page.jsx`, `api/mercados/arquivo-fonte`, `contarProdutos`, `situacaoVarredura`, `testar*Acao` | `tela.scraper.fontes` ver |
| `excluirFonte`, `apagarArquivosAcao` | `tela.scraper.fontes` excluir |
| `varrerFonteAgora`, `varrerPeloPcAgora`, `pedirVarreduraPeloPc`, `varrerEndereco`, `atualizarTabelas`, `alternarPausaColeta` | `acao.scraper.varrer` executar |
| as demais (salvar, editar, alternar, categorias, endereços, login, instruções, arquivos) | `tela.scraper.fontes` editar |

- [ ] **Passo 1: teste (falha):** `abasDoScraper` nas quatro combinações. **Passo 2:** implementar; a aba de Fontes
  também mostra só o tipo liberado. **Passo 3:** tirar os 6 arquivos da lista; `teste:acessos`, `teste:coleta` passam.
  **Passo 4:** tela com só `dado.concorrentes`: só a aba Concorrentes, sem Varrer sem a ação. Commit.

### Tarefa 7: Indicadores, Ferramentas, Integrações, Anúncios e esqueletos

**Arquivos:** `src/app/indicadores/page.jsx`, `indicadores/estoque/page.jsx`, as 3 páginas e o `acoes.js` de
`ferramentas/`, `integracoes/page.jsx`, `acoes.js`, `acoes-vps.js`, as 2 rotas de `api/oauth/[servico]/`, as 3 páginas de
`anuncios/`, `pedidos`, `estoque`, `financeiro`.

| Arquivo | Ação → recurso, nível |
| --- | --- |
| `indicadores/page.jsx` / `estoque/page.jsx` | `tela.indicadores` / `tela.indicadores.estoque` ver; "Valor do estoque a custo" só com `dado.custo` e `dado.financeiro`, "Receita potencial" só com `dado.financeiro`; sem os dois, `EmptyState` |
| `ferramentas/*` | `tela.ferramentas`, `...imagemParaSvg`, `...cotacaoDolar` ver; `converterImagemAcao` e `buscarCotacaoAcao` ver da sub-tela delas |
| `integracoes/page.jsx` | `tela.integracoes` ver (em `ver`, cartões sem Conectar, Desconectar e Salvar chaves) |
| `integracoes/acoes.js` | `testarConexao`, `salvarChavesAction`, `desconectarAction` `tela.integracoes` editar |
| `integracoes/acoes-vps.js` | `situacaoDaVps`, `andamentoDaVps` `tela.integracoes` ver; `atualizarAVps`, `atualizarBancoDoPc` `acao.vps.deploy` executar (a conferência do PC continua) |
| `api/oauth/[servico]/iniciar` e `callback` | `tela.integracoes` editar |
| `anuncios/page.jsx`, `[id]` / `novo` | `tela.anuncios` ver / editar |
| `pedidos`, `estoque`, `financeiro` | `tela.pedidos`, `tela.estoque`, `tela.financeiro` ver |

- [ ] **Passo 1: teste (falha):** `cartoesDosIndicadores(pode)` em `projecoes.js` nas combinações de custo e financeiro.
  **Passo 2:** implementar. **Passo 3:** tirar os 17 arquivos da lista; `teste:acessos`, `teste:vps` e `teste:cotacao`
  passam. **Passo 4:** tela: Integrações em `ver` sem botões de escrita; Indicadores sem financeiro mostram o vazio. Commit.

### Tarefa 8: "Ver como" e a aba Histórico (spec §5.5, §10.4 e §10.5)

**Arquivos:**
- Criar: `src/lib/acessos/verComo.js` (só importa `recursos.js`), `src/components/acessos/JanelaVerComo.jsx`,
  `src/components/acessos/HistoricoDoUsuario.jsx`
- Alterar: `src/lib/acessos/banco.js`, `src/app/configuracoes/acoes.js`, `FormularioUsuario.jsx`, `FormularioFuncao.jsx`
- Testar: `scripts/teste-acessos.js`

**Interfaces:**
- Produz: `retratoDoAcesso(permissoes) -> { blocos: [{ rotulo, nivel, subs: [{ rotulo, nivel }] }], cartoes: [rotulo],
  dados: [{ rotulo, nivel }], acoes: [rotulo], capacidades: [{ rotulo, nivel }] }` (o que é `nenhum` não aparece; ordem do
  catálogo); `resumoDaMudanca(antes, depois) -> [{ campo, antes, depois }]` (só as chaves que mudaram; listas comparadas
  como texto ordenado); `historicoDoUsuario(id, { pagina }) -> { linhas, total }` (alvo = o id ou o login, 100 por página,
  mais recente primeiro); `verComoAcao(tipo, id)` (`tela.configuracoes.usuarios` ver; usuário: as funções e exceções
  SALVAS e o quebra-vidro; função: só ela) e `historicoDoUsuarioAcao(id, pagina)` (mesmo recurso).

- [ ] **Passo 1: testes (falham):** `retratoDoAcesso` de uma função com Cadastros em `ver` e Clientes em `editar` traz o
  bloco Cadastros com a sub-tela Clientes em editar e nenhum outro bloco; do Administrador traz todos; `resumoDaMudanca`
  de funções `["Atendimento"]` → `["Atendimento","Vendas"]` traz uma linha; `historicoDoUsuario` de um `zz-ac-*` com 3
  auditorias (uma pelo login, de `acessos.login.senha`) devolve as 3 na ordem.
- [ ] **Passo 2:** falha esperada. **Passo 3:** implementar. "Ver como" no cabeçalho do usuário e da função abre a `Janela`
  larga "O que <nome> vê" (blocos com o nível em `Badge`, depois cartões do Painel, dados sensíveis, ações e Rise AI);
  com alteração não salva fica desabilitado com `title` "Salve para calcular". A aba Histórico (só usuário existente):
  Quando · Quem · O quê · Antes → Depois, 100 por página, `EmptyState` "Nenhuma alteração registrada.". **Ver como nunca
  troca a sessão.**
- [ ] **Passo 4:** `teste:acessos` passa; na tela, "Ver como" da Andrea bate com o menu que a simulação mostra. Commit.

### Tarefa 9: Guarda fechado, roteiro e documentação

**Arquivos:** `scripts/teste-acessos.js`, `CLAUDE.md` (seção nova "Acessos (lançamento 2)", a linha da tabela de Estado e
a contagem do `teste:acessos`), memória do projeto.

- [ ] **Passo 1:** a lista de exceções está vazia: apagar a constante e as três asserções dela; o guarda passa a exigir
  todo alvo fora de `SEM_RECURSO`. Rodar `npm run teste:acessos` e `npm run lint`; esperado: tudo passa.
- [ ] **Passo 2:** os testes do ritual (`teste:extracao`, `teste:coleta`, `teste:cadastros`, `teste:mcp`, `teste:rise-ai`,
  `teste:imagens`) passam; `teste:worker` sozinho.
- [ ] **Passo 3:** conferência na tela da Revisão 4 (ação recusada com a página aberta: tirar a permissão no meio e
  clicar Salvar → erro vermelho, recarregar → tela em `ver`).
- [ ] **Passo 4:** apagar o usuário e as funções `zz-ac-*` de teste; escrever o CLAUDE.md (o que mudou, as decisões, o
  roteiro do dono abaixo); commit e push. **Deploy só com o "sobe".**

**Roteiro do dono (depois do deploy, na VPS):**
1. Configurações › Usuários e funções › função Atendimento: marcar o que a Andrea vê (sugestão: Produtos e Cadastros em
   ver, sem custo, margem, concorrentes e financeiro) e Salvar.
2. Abrir o usuário `andrea` › "Ver como": a janela lista só esses blocos. A aba Histórico mostra a mudança de agora.
3. A Andrea entra: o menu tem só esses blocos; o Painel mostra só os cartões dela; o rodapé diz "Atendimento".
4. Ela abre um produto: selo "Somente leitura", sem Salvar, sem a margem; a lista de Produtos sem lápis.
5. Ela digita `rise.4hobby.com.br/mercados` à mão: página não encontrada.
