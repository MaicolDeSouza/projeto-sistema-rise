# Categorias e SEO da Loja Integrada no produto base (25/10/2026)

Substitui a parte "categorias, marca e Meta Description" da spec `2026-10-23-proposta-de-anuncio-li-ml-design.md` (a proposta
do anúncio da LI deixa de existir; a do ML continua). Linkada pelo CLAUDE.md, seção da Loja Integrada.

## Pedido e porquê

Dono, 25/10/2026: "quero que as abas acima também sejam implementados no produto base. e a edição destes campos passam a ser
apenas no produto base, na aba da LI deve ser apenas visualização, informar que deve ser editado no produto base, essas duas
abas devem ser as duas últimas no produto base, ao lado de tributação". As abas são **Categorias** e **SEO** do editor da LI.
Na pergunta sobre a proposta: "opção 1, e não existirá mais a proposta para LI, pois tudo será feito na proposta do produto".

Hoje os dois moram dentro do anúncio da LI (`Anuncio.dados`: `categorias`, `seo.title`, `seo.description`), então o produto base
não os conhece, a proposta do produto não os preenche e o dono edita em dois lugares (cadastro e editor da LI). A Descrição da
LI já é só leitura com "Editar no produto"; Categorias e SEO passam a seguir o mesmo caminho.

## Decisões do dono

- Categorias e SEO são **do produto**: editáveis só no cadastro de Produto, nas duas últimas abas (depois de Tributação).
- Na LI as duas abas ficam **só para ver**, com o aviso de que se edita no produto base (padrão da aba Descrição).
- A **proposta da LI deixa de existir**. Categorias e Meta Description entram na **proposta do produto** (Opção 1): campo
  vazio abre preenchido com a marca PROPOSTA; campo com valor recebe a sugestão.

## Abordagem

Colunas novas em `Produto` (migration aditiva). Descartadas: deixar no anúncio da LI (o produto não seria o dono, e produto sem
anúncio da LI não teria onde guardar) e um JSON solto no produto (some da busca e da proposta, sem ganho).

- `Produto.categoriasLI String[] @default([])` (ids da árvore da loja, como no rascunho de hoje).
- `Produto.seoTituloLI String?` e `Produto.seoDescricaoLI String?`.
- Migration copia dos anúncios da LI para o produto, só onde o produto está vazio: `Anuncio.dados->'categorias'`,
  `dados->'seo'->>'title'` e `->>'description'`. Idempotente. Também tira `dados.proposta` dos anúncios da LI (a proposta
  da LI acabou; as sugestões ainda não aceitas se perdem, o valor já gravado no rascunho foi copiado).

## O que muda

**Produto (cadastro).** `ABAS` ganha `categorias` ("Categorias") e `seo` ("SEO") depois de `tributacao`, montadas e só
escondidas como as outras. A aba Categorias reaproveita `ArvoreDeCategorias` (árvore ao vivo da LI, busca, Recarregar,
"Sugerir com IA", "Marcar estas") e a SEO reaproveita Tag Title (70) e Meta Description (160) com o contador, o ícone de lista
(nome, SEO dos concorrentes, "Gerar com IA") de `AbaSEO`. Salvar grava as três colunas (campo hidden JSON para as categorias,
como as outras listas do formulário) e o rascunho automático do cadastro as guarda. Ações novas em
`src/app/produtos/acoes-loja.js` (árvore, SEO dos concorrentes, IA), cada uma conferindo acesso na 1ª linha.
O pai da categoria não conta (`semAncestraisRedundantes` continua só na comparação e no envio).

**LI (editor).** `AbaCategorias` e `AbaSEO` viram só leitura: mostram o valor do produto, o aviso "Edite no produto base" com o
link (o mesmo `abrirProduto` da Descrição) e a URL do produto (slug) continua só leitura aqui. `rascunhoInicialLI` e o
rascunho deixam de carregar categorias e SEO; `normalizarDoRiseLI(produto, rascunho)` lê dos campos do produto; Sincronizar,
Cadastrar, a comparação do pop-up e a assinatura do ícone usam os mesmos. A migration mantém as assinaturas iguais (nenhum "!"
novo). `validacao.js`: SEO vazio e categoria que sumiu da loja continuam bloqueando/alertando, com o texto "preencha no produto"
e a aba apontando para o produto.

**Proposta do produto.** Duas seções novas em `SECOES` (`proposta/plano.js`): `categoriasLI` (ids da árvore, o Rise tira o pai
quando vem pai + filha) e `seoLI` (`{ description }` de 130 a 160, o Rise recusa fora disso; o Tag Title é calculado pelo Rise:
nome do produto cortado em 70, a LLM não o escreve). `lerParaProposta` passa a devolver a árvore da LI (`listarCategoriasDaLI`,
só GET) e o SEO dos concorrentes. Descrição de SEO escreve por cima com "Original" na lista (como os outros textos); categorias
com campo vazio abrem marcadas "PROPOSTA", e com valor ganham a sugestão com "Usar a proposta" (não sobrescreve árvore sozinha).
Conferido apaga a proposta e pergunta pelas seções novas não aplicadas como as demais. Roteiro do produto sobe de versão (8 → 9).

**Remoção da proposta da LI.** Saem `src/lib/propostaDeAnuncio/li.js`, as ferramentas MCP `lerParaPropostaLI` e `gravarPropostaLI`,
o roteiro `li` de `roteiroDaProposta` (fica `produto` e `ml`), o "P" e a faixa da proposta no ícone e no editor da LI
(`iconeLI.proposta`, `FaixaDaProposta` na LI) e os testes dela. `proximoPasso`: sem `revisar-li` e `proposta-li`; entra
`cadastrar-li` ("o dono cadastra pelo ícone da LI; se ele pedir para pular a LI, siga para o ML"). A proposta do ML não muda.

**Acessos.** As abas seguem `tela.produtos.cadastro` (sem Editar, só leitura). Árvore e SEO dos concorrentes: a árvore pede só
ver o cadastro; o SEO dos concorrentes pede `dado.concorrentes`; "Sugerir com IA" e "Gerar com IA" pedem
`acao.produtos.gerarTextoComIA`. O Salvar não apaga o que a pessoa não pôde ver.

## Metas e fora

Metas: um lugar só para editar; nenhum produto já sincronizado ganha "!"; a proposta do produto preenche tudo. Fora: marca,
vídeo e destaque da LI (ficam no editor da LI), categorias do ML, a coluna `Anuncio.dados.categorias/seo` (fica sem uso, sem
apagar), edição em lote.

## Minhas escolhas (confira)

1. Nomes das colunas: `categoriasLI`, `seoTituloLI`, `seoDescricaoLI`.
2. **Clonar** leva as categorias e **não** leva o SEO (texto de SEO repetido atrapalha no Google).
3. Tag Title vazio abre preenchido com o nome do produto cortado em 70 (o que o rascunho novo da LI fazia), editável e salvo no
   Salvar.
4. A URL (slug) fica só na LI, em leitura, como hoje.
5. A categoria do ML é outra coisa e não muda.

## Para o construtor

Molde das abas: `Tributação` no `FormularioProduto.jsx` e `ArvoreDeCategorias`/`AbaSEO` do editor da LI (hoje controlados pelo
rascunho: passam a ser controlados pelo estado do formulário, com campos hidden). Testes: `teste:li-sync` (leitura do produto,
assinatura igual depois da migration, validação), `teste:proposta` (seções novas, o Rise recusa description fora de 130–160,
tira o pai), `teste:mcp` (ferramentas da proposta da LI fora, `roteiroDaProposta` sem `li`, `proximoPasso`), `teste:acessos`
(ações novas conferem acesso) e `teste:cadastros`/`teste:extracao` se tocarem no `ProdutoSchema`.
