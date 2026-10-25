# Categorias e SEO da LI no produto base — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (o dono pediu execução inline, sem subagentes). Steps com `- [ ]`.

**Goal:** Categorias e SEO da Loja Integrada passam a ser dados do Produto (2 últimas abas do cadastro), a LI só lê, e a proposta do produto os preenche; a proposta da LI deixa de existir.

**Architecture:** 3 colunas novas em `Produto` + migration que copia dos anúncios da LI. `normalizarDoRiseLI`, `validarRascunhoLI`, o ícone, o Sincronizar e o Cadastrar leem do produto (o rascunho da LI perde `categorias` e `seo`). O cadastro ganha 2 abas (componentes novos em `src/components/produtos/`); as abas da LI viram só leitura. A proposta do produto ganha 2 seções.

**Tech Stack:** Next 16, Prisma (migration à mão com `migrate diff`, tirando os `DROP INDEX`), zod, testes em `scripts/teste-*.js`.

**Spec:** `docs/superpowers/specs/2026-10-25-li-categorias-e-seo-no-produto-design.md`

## Global Constraints

- Colunas: `Produto.categoriasLI String[] @default([])`, `seoTituloLI String?`, `seoDescricaoLI String?`.
- Limites: Tag Title 70 (`LIMITE_DO_TITULO_SEO`), Meta Description 160 (`LIMITE_DA_DESCRIPTION_SEO`), proposta aceita 130 a 160, categorias até 20 ids de até 32 caracteres.
- O pai da categoria não conta: `semAncestraisRedundantes` só na comparação/envio, nunca no valor gravado pelo dono.
- Migration aditiva e idempotente; tirar `DROP INDEX` dos índices que só existem no SQL; depois `prisma generate` e reiniciar o servidor.
- Nenhum produto já sincronizado ganha "!" (a assinatura não pode mudar depois da migration).
- Texto de tela com acento; identificadores e comentários sem acento. Ações de servidor novas conferem acesso na 1ª linha.
- `GET` apenas na LI; nada escreve na loja.

## Review Focus

- Produto sem anúncio da LI e sem SEO: "Cadastrar na LI" recusa com "preencha no produto".
- Tag Title vazio abre preenchido com o nome cortado em 70 e só vira dado no Salvar do produto.
- Clone leva categorias e NÃO leva SEO.
- Salvar o produto sem permissão de editar/ver a aba não apaga categorias nem SEO (campo ausente = não mexer).
- Rascunho automático do cadastro guarda e devolve categorias e SEO.

---

### Task 1: Colunas e migration
**Files:** `prisma/schema.prisma` (model Produto), `prisma/migrations/20261025_loja_categorias_seo/migration.sql`.
- [ ] Acrescentar as 3 colunas ao `Produto` com comentário do porquê. Gerar o SQL com `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, tirar os `DROP INDEX`, e ACRESCENTAR ao fim: `UPDATE "Produto" p SET "categoriasLI" = ARRAY(SELECT jsonb_array_elements_text(a.dados->'categorias')) FROM "Anuncio" a WHERE a."produtoId"=p.id AND a.canal='LOJA_INTEGRADA' AND jsonb_typeof(a.dados->'categorias')='array' AND cardinality(p."categoriasLI")=0;` e dois `UPDATE` iguais para `seoTituloLI` (`dados->'seo'->>'title'`) e `seoDescricaoLI` (`->>'description'`), só onde a coluna está nula e o valor não é vazio; e `UPDATE "Anuncio" SET dados = dados - 'proposta' WHERE canal='LOJA_INTEGRADA' AND dados ? 'proposta';`.
- [ ] `npx prisma migrate deploy` no banco do PC, `npx prisma generate`. Conferir por SQL: contagem de produtos com `categoriasLI` preenchida igual à dos anúncios da LI com categorias.

### Task 2: A LI lê do produto
**Files:** `li/banco.js` (`CAMPOS_DO_CONTEXTO` ganha as 3 colunas; `rascunhoDoAnuncio` e `colunasEDados` sem `categorias`/`seo`; `vincularPeloSku` grava `categoriasLI` do produto com as da loja SÓ se estiver vazio), `li/rascunho.js` (sem `categorias` e `seo`), `li/esquema.js` (sem `categorias`/`seo`; `LIMITES_LI` mantém os limites para o produto), `li/campos.js` (`normalizarDoRiseLI` lê `p.categoriasLI`, `p.seoTituloLI`, `p.seoDescricaoLI`), `li/validacao.js` (lê de `contexto.produto`; textos "preencha no produto"; `aba` continua `seo`/`categorias`), `li/leitura.js` e `li/envio.js` (só passam o produto), `scripts/teste-li-sync.js`.
**Interfaces — Produces:** `contextoDoProduto(id)` devolve `categoriasLI: string[]`, `seoTituloLI: string|null`, `seoDescricaoLI: string|null`.
- [ ] Ajustar os testes que montavam rascunho com `categorias`/`seo` para criar o produto com as colunas. Novos testes: assinatura igual à de antes (mesmo valor no produto e no rascunho antigo), `validarRascunhoLI` bloqueia SEO vazio do produto, `vincularPeloSku` preenche `categoriasLI` só se vazia, "Cadastrar na LI" de produto sem SEO recusa.
- [ ] `npm run teste:li-sync` verde; commit.

### Task 3: Cadastro de produto (salvar, abrir, clonar, abas)
**Files:** `src/app/produtos/acoes.js` (`ProdutoSchema`: `seoTituloLI`/`seoDescricaoLI` com `opcional` e limites, `categoriasLI` por `z.preprocess` de JSON → array de strings únicas, até 20; campo ausente não grava), `src/lib/produtoParaFormulario.js` (carrega os 3 campos; `dadosParaClone` leva `categoriasLI` e zera `seoTituloLI`/`seoDescricaoLI`), `src/components/produtos/CategoriasDaLoja.jsx` e `SeoDaLoja.jsx` (novos; adaptados de `AbaCategorias`/`AbaSEO` do editor da LI, com estado local e `<input type="hidden" name="categoriasLI">` e campos `name="seoTituloLI"`/`"seoDescricaoLI"`), `src/app/produtos/acoes-loja.js` (novo: `categoriasDaLoja()`, `seoDosConcorrentesDoProduto(produtoId)`, `gerarSeoDoProduto(produtoId, titulo)`, `sugerirCategoriasDoProduto(produtoId, titulo)`, cada uma com `negarSemAcesso` na 1ª linha), `FormularioProduto.jsx` (`ABAS` ganha `categorias` e `seo` depois de `tributacao`; painéis montados e escondidos; `marcarAlterado` ao mudar).
**Interfaces — Produces:** `categoriasDaLoja() -> { ok, categorias: {id, caminho}[] } | { ok:false, erro }`; os 3 campos gravados em `Produto`.
- [ ] Teste (`teste:cadastros`): Salvar grava as 3 colunas; Salvar sem o campo não zera; `categoriasLI` com 21 ids é recusada; clone leva categorias e não leva SEO.
- [ ] Conferir na tela: abas na ordem, árvore carrega, marcar e Salvar persiste, Tag Title vazio abre com o nome cortado, rascunho automático devolve os valores.
- [ ] Commit.

### Task 4: Abas da LI só leitura
**Files:** `src/components/anuncios/li/AbaCategorias.jsx`, `AbaSEO.jsx` (reescritas: mostram o valor do produto, aviso "Edite no produto base" com `abrirProduto`, URL do produto só leitura na SEO), `EditorAnuncioLI.jsx` (`contexto.produto` já traz os campos), `src/app/canais-de-venda/loja-integrada/acoes.js` (remove `sugerirCategoriasLI`, `gerarSeoIALI`, `seoConcorrentesLI` se ficarem sem uso; `listarCategoriasLI` continua para os caminhos).
- [ ] Conferir na tela (100101): as duas abas sem campo editável, com o texto do produto e o link. Commit.

### Task 5: Proposta do produto e fim da proposta da LI
**Files:** `src/lib/proposta/plano.js` (`SECOES` ganha `categoriasLI`, `seoLI`; validação: ids na árvore e description 130–160), `proposta/banco.js` (`gravarProposta` tira o pai e calcula `seoLI.title = tituloSeoPadrao(tituloBase)`), `proposta/aplicar.js` (`propostaNoFormulario` e `CAMPOS_QUE_A_PROPOSTA_TROCA`: `seoDescricaoLI` troca com "Original"; categorias vazias abrem marcadas e com valor viram sugestão), `proposta/aplicadas.js` e `conferir.js` (seções novas entram em `secoesNaoAplicadas`/`temOQueAplicar`), `proposta/leitura.js` (`lerParaProposta` devolve a árvore e o SEO dos concorrentes), `proposta/roteiro.js` (`VERSAO_DO_ROTEIRO` 8 → 9), `src/lib/mcp/proposta.js`, `FormularioProduto.jsx` (marca PROPOSTA nas abas novas). Remoção: `src/lib/propostaDeAnuncio/li.js`, as ferramentas `lerParaPropostaLI`/`gravarPropostaLI` em `src/lib/mcp/propostaDeAnuncio.js` e `servidor.js`, roteiro `li` em `roteiros.js`, `iconeLI.proposta` em `produtos/page.jsx` e `IconeLojaIntegrada.jsx`, `FaixaDaProposta`/`contexto.proposta` no editor da LI, `semProposta` em `envio.js`, `situacao.js` (sem `revisar-li`/`proposta-li`; entra `cadastrar-li`).
- [ ] Testes: `teste:proposta` (seções novas, recusa de description fora de 130–160, tira o pai, title calculado, pendência do Conferido), `teste:mcp` (ferramentas da LI fora, `roteiroDaProposta` sem `li`, versão 9, `proximoPasso`), `teste:li-sync` (blocos da proposta da LI saem).
- [ ] Commit.

### Task 6: Fechamento
- [ ] `npm run lint`, `teste:li-sync`, `teste:proposta`, `teste:mcp`, `teste:cadastros`, `teste:acessos`, `teste:extracao`.
- [ ] CLAUDE.md: seção da LI (colunas, abas, o fim da proposta da LI, contagens dos testes); memória. Commit só dos meus trechos (conferir `git diff -- CLAUDE.md` no mesmo comando) e push. Deploy só com "sobe".
