# Kit de composição pelo cadastro, um anúncio por vários caminhos: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** kit de produtos diferentes nasce sempre como produto "Com composição" do cadastro, e o anúncio do ML dele aparece, num registro só, no popup de cada peça, em 3 blocos, com o "!" quando o preço de uma peça muda.

**Architecture:** nada novo no banco. Regras puras em `src/lib/composicao.js` e `src/lib/canaisDeVenda/ml/` (quem é "produto", "kit de N" ou "composição"; NCM do kit), a leitura do popup em `banco.js` passa a trazer os anúncios dos kits que usam o produto, e as telas (`JanelaAnuncioML`, `TabelaAnunciosML`, `FormularioProduto`, `AbasDoKit`, `AbaGeral`) só desenham o que a regra devolve.

**Tech Stack:** Next.js 16, React 19, Prisma 7, JavaScript. Testes: `npm run teste:anuncios-ml`, `npm run teste:composicao`, `npm run lint`.

**Spec:** `docs/superpowers/specs/2026-11-22-kit-de-composicao-no-ml-design.md`

## Global Constraints

- Sem migration: `Produto.tipo`, `ProdutoComponente` (com `retrato`) e `Anuncio.dados` já têm tudo.
- Interface em português com acento; identificadores e comentários sem acento; comentário diz o porquê e cita o pedido do dono de 22/11/2026.
- O Rise nunca muda preço sozinho: só avisa.
- "Kit de N" do mesmo produto no editor do ML continua como está (54 anúncios na VPS). Só o misto é recusado.
- Padrão visual (10 regras do CLAUDE.md): bloco sem dado some; uma ação principal; estado é cor e ícone, não frase.
- GateGuard: antes da 1ª edição de cada arquivo, Grep real do caminho e a instrução do dono.
- Commit só dos próprios trechos (`git commit -- caminhos`); deploy só com o "Sobe" do dono.
- Execução inline (sem subagente por tarefa), `teste:worker` nunca junto de outros testes.

## Review Focus

- Produto que é peça de DOIS kits de composição: o popup dele mostra os anúncios dos dois, sem repetir linha.
- Kit de composição sem anúncio no ML: o bloco "Anúncios com composição" some no popup das peças (não aparece vazio).
- Anúncio "Kit de N" antigo cujo código não segue `{sku}_N`: continua no bloco "Anúncios em kit" pela composição, não pelo código.
- Peça sem NCM num kit: o NCM do kit vem da próxima peça de maior quantidade que tenha NCM; nenhuma com NCM, campo fica como está.
- Dono editou o NCM do kit à mão: trocar a quantidade de uma peça não apaga o digitado (mesma regra `sugeridos` do preço e das medidas).
- Rascunho misto antigo aberto no editor: abre (para poder excluir), mas o Salvar recusa com o caminho; nunca perde dado em silêncio.

---

### Task 1: Classificar o anúncio (produto, kit de N, composição) e o NCM do kit: regras puras

**Files:**
- Modify: `src/lib/canaisDeVenda/ml/kitsNaDescricao.js` (ao lado de `unidadesDoAnuncio`)
- Modify: `src/lib/composicao.js` (ao lado de `ncmsDasPecas`)
- Test: `scripts/teste-anuncios-ml.js`, `scripts/teste-composicao.js`

**Interfaces:**
- Produces: `grupoDoAnuncioML({ produtoId, composicao, tipoDoProduto }) -> "produto" | "kit" | "composicao"`: `tipoDoProduto === "COMPOSICAO"` ou composição do editor com item de outro produto (ou mais de um item) = `"composicao"`; composição só com o próprio produto = `"kit"`; sem composição = `"produto"`.
- Produces: `ncmDoKit(pecas) -> string | null`, `pecas = [{ ncm, quantidade }]` na ordem da aba: o NCM da peça de MAIOR quantidade entre as que têm NCM; empate, a primeira; nenhuma com NCM, `null`.

- [ ] **Step 1: testes que falham.** Em `teste-anuncios-ml.js` (bloco das regras puras da descrição): `grupoDoAnuncioML` para os 5 casos (simples; kit de 2 do próprio; editor com 2 produtos; editor com 1 item de OUTRO produto; produto do cadastro tipo COMPOSICAO sem composição no anúncio) → `["produto","kit","composicao","composicao","composicao"]`. Em `teste-composicao.js`: `ncmDoKit([{ncm:"8536.69.90",quantidade:1},{ncm:"8544.42.00",quantidade:3}])` → `"8544.42.00"`; empate → a primeira; maior sem NCM → a seguinte com NCM; lista vazia e todas sem NCM → `null`.
- [ ] **Step 2: rodar.** `npm run teste:anuncios-ml` e `npm run teste:composicao`. Expected: FALHA nas asserções novas ("is not a function").
- [ ] **Step 3: implementar** as duas funções puras, sem imports novos.
- [ ] **Step 4: rodar de novo.** Expected: os dois testes OK.
- [ ] **Step 5: commit** `feat(kit): regras puras do grupo do anuncio do ML e do NCM do kit`.

### Task 2: Cadastro do kit: sem mínimo/máximo, NCM automático, link da peça visível e a soma ao lado do preço

**Files:**
- Modify: `src/components/produtos/FormularioProduto.jsx` (campos `estoqueMinimo`/`estoqueMaximo` ~4443; `aplicarSugestoesDoKit`/`textosDasSugestoes`; campo Preço de venda)
- Modify: `src/components/produtos/AbasDoKit.jsx` (`LinkDaPeca`)

**Interfaces:**
- Consumes: `ncmDoKit` (Task 1), `totaisDoKit` (existente).

- [ ] **Step 1: mínimo e máximo.** No kit (`ehKit`) os dois `Campo` ficam num wrapper `hidden` (montados: o `FormData` continua levando o valor vazio que o `virarKit` já grava; voltar a Simples os devolve).
- [ ] **Step 2: NCM.** `textosDasSugestoes` ganha `ncm: ncmDoKit(pecas)`; `aplicarSugestoesDoKit` aplica no campo `ncm` pela MESMA regra dos outros (só vazio ou ainda com a última sugestão, `sugeridos`). Vale no kit novo e no salvo quando as peças mudam; abrir o kit não muda nada gravado.
- [ ] **Step 3: link da peça.** `LinkDaPeca`: nome em `text-acento` com `hover:underline`, e o código da peça (`font-mono`) também dentro do link; continua `target="_blank"`, com `rel="noopener noreferrer"`.
- [ ] **Step 4: soma das peças.** Ao lado do Preço de venda do kit, uma linha curta `Soma das peças: R$ X` só quando `totaisDoKit` está completo e o preço digitado é diferente da soma (regra 4: igual, some).
- [ ] **Step 5: conferir na tela** (servidor próprio na 3006, kit de teste ZZ no banco do PC, apagado no fim): os dois campos somem no kit e voltam no simples; o NCM preenche e respeita o digitado; o link abre a peça em outra aba; a linha da soma aparece e some.
- [ ] **Step 6:** `npm run teste:composicao` e `npm run lint`. Expected: OK. Commit `feat(kit): cadastro sem minimo/maximo, NCM pela peca de maior quantidade, link da peca e soma ao lado do preco`.

### Task 3: Editor do ML recusa composição de produtos diferentes (A1)

**Files:**
- Modify: `src/lib/canaisDeVenda/ml/banco.js` (`salvarRascunhoML`, `salvarPublicadoML`)
- Modify: `src/components/anuncios/ml/AbaGeral.jsx` (`BlocoComposicao`: sai o "adicionar outro produto"; a bolha diz o caminho)
- Test: `scripts/teste-anuncios-ml.js`

**Interfaces:**
- Consumes: `grupoDoAnuncioML` (Task 1).
- Produces: erro do Salvar, texto exato: `Kit de produtos diferentes se monta em Produtos (tipo "Com composição"). No anúncio só entra o kit de N unidades do mesmo produto.`

- [ ] **Step 1: teste que falha.** `salvarRascunhoML(null, rascunho com 2 produtos na composição)` → `{ ok: false, erro: <texto acima> }` e nenhum `Anuncio` criado; kit de N do mesmo produto continua salvando. Os testes antigos que usam kit misto (`c.anuncioDeKit` com k1+k2, "kit misto fora do bloco") passam a criar o cenário por `prisma.anuncio.create` direto (o legado continua LIDO) ou por produto kit do cadastro: ajustar um a um, sem afrouxar asserção.
- [ ] **Step 2: rodar.** Expected: FALHA só na asserção nova.
- [ ] **Step 3: implementar** a recusa no servidor (antes de qualquer escrita) e tirar da tela o caminho de adicionar outro produto; anúncio misto já gravado abre e pode ser excluído.
- [ ] **Step 4: rodar.** `npm run teste:anuncios-ml`. Expected: OK.
- [ ] **Step 5: commit** `feat(ml): editor recusa kit de produtos diferentes (monta-se em Produtos)`.

### Task 4: O popup traz os anúncios dos kits de composição que usam o produto

**Files:**
- Modify: `src/lib/canaisDeVenda/ml/banco.js` (`anunciosMLDoProduto`, `linhaDoAnuncio`, `DADOS_DA_LINHA`)
- Test: `scripts/teste-anuncios-ml.js`

**Interfaces:**
- Consumes: `grupoDoAnuncioML`; `ProdutoComponente` (`kitId`, `componenteId`, `quantidade`, `ordem`).
- Produces: cada linha de `anunciosMLDoProduto(produtoId)` ganha `grupo` (`"produto"|"kit"|"composicao"`), `pecas` (texto `1× 901202 + 1× 901201`, só na composição; no kit de N, `N unidades`) e `doProprioProduto` (boolean: falso quando a linha veio de um kit que USA o produto). A lista passa a incluir os anúncios cujo `produtoId` é um produto kit que tem `produtoId` entre os componentes, e os mistos legados do editor que contêm o produto. Ordem: produto, kit (por unidades), composição (por código); sem linha repetida.

- [ ] **Step 1: teste que falha.** Cenário: peças P1 e P2, produto kit K (P1×1 + P2×1) com um anúncio; P1 com anúncio simples e um kit de 2. `anunciosMLDoProduto(P1.id)` → grupos `["produto","kit","composicao"]`, a composição com `pecas` certo e `doProprioProduto: false`; `anunciosMLDoProduto(P2.id)` → só a composição; `anunciosMLDoProduto(K.id)` → a composição com `doProprioProduto: true`; P1 em DOIS kits → duas linhas de composição, nenhuma repetida.
- [ ] **Step 2: rodar.** Expected: FALHA (linhas e campos ausentes).
- [ ] **Step 3: implementar** (uma consulta a mais: os `kitId` de `ProdutoComponente` do produto; `DADOS_DA_LINHA` ganha `produto.tipo` e os componentes do produto kit).
- [ ] **Step 4: rodar.** Expected: OK.
- [ ] **Step 5: commit** `feat(ml): anuncios do produto trazem os kits de composicao que o usam`.

### Task 5: Popup em 3 blocos e selo na lista do ML

**Files:**
- Modify: `src/components/anuncios/ml/JanelaAnuncioML.jsx` (a `<ul>` única vira até 3 blocos)
- Modify: `src/components/anuncios/ml/TabelaAnunciosML.jsx` e `listarAnunciosML` em `banco.js` (o `grupo` na linha)
- Test: `scripts/teste-anuncios-ml.js` (a lista devolve `grupo`)

**Interfaces:**
- Consumes: `grupo`, `pecas`, `doProprioProduto` (Task 4).

- [ ] **Step 1: blocos.** Títulos "Anúncio do produto", "Anúncios em kit", "Anúncios com composição"; cada bloco com borda própria (`rounded border border-borda`) e o título pequeno em cima; bloco sem linha não é desenhado. A segunda linha de cada anúncio: código, e `· 2 unidades` ou `· 1× 901202 + 1× 901201`.
- [ ] **Step 2: ações.** Linha com `doProprioProduto: false`: abre o editor normalmente; clonar e excluir não aparecem (com `title` na linha: "Do kit 258262: exclua ou clone pelo cadastro do kit").
- [ ] **Step 3: lista do ML.** Selo ao lado do código: "Kit de composição" (sky) e "Kit de N" (cinza); anúncio simples sem selo.
- [ ] **Step 4: conferir na tela** (3006, dados ZZ): o popup da peça com os 3 blocos, o de uma peça só com composição, o do kit; abrir a composição pelos dois caminhos mostra o MESMO anúncio (alterar o preço por um e reabrir pelo outro); a lista do ML com os selos. `ecc:make-interfaces-feel-better` antes de fechar.
- [ ] **Step 5:** `npm run teste:anuncios-ml` e `npm run lint`. Expected: OK. Commit `feat(ml): popup dos anuncios em 3 blocos e selo de kit na lista`.

### Task 6: O "!" do anúncio do kit quando uma peça muda

**Files:**
- Modify: `src/lib/canaisDeVenda/ml/icone.js` (`estadoDoIconeML`, `temProblemaNoIconeML`, `motivosDoProblemaML`)
- Modify: `src/lib/canaisDeVenda/ml/banco.js` (`anunciosMLDoProduto`, `listarAnunciosML`) e `src/lib/iconesDaListaDeProdutos.js`
- Test: `scripts/teste-anuncios-ml.js`

**Interfaces:**
- Consumes: `mudancasDosKits(kitIds)` de `composicaoBanco.js` (existente: `Map<kitId, mudanças por peça>`).
- Produces: `estadoDoIconeML` aceita `pecasDoKit` (as mudanças do kit do anúncio) e devolve `pecasDoKitMudaram: boolean`; motivo em texto: `peças do kit mudaram: 901202 (Preço de venda: R$ 14,90 → R$ 16,90)`.

- [ ] **Step 1: teste que falha.** Kit K publicado no ML falso; muda `precoVenda` de P1 → a linha de K em `anunciosMLDoProduto(P1.id)`, em `anunciosMLDoProduto(K.id)` e na lista do ML tem `alerta` com "peças do kit mudaram" e o preço antigo e novo; o ícone do ML de **P1** na lista de Produtos (`iconesDosProdutos`) NÃO acende por isso, o de **K** acende; salvar o kit (retrato novo) apaga; mudar só o custo de P1 não acende.
- [ ] **Step 2: rodar.** Expected: FALHA (`alerta` nulo).
- [ ] **Step 3: implementar.**
- [ ] **Step 4: rodar.** Expected: OK, e as asserções antigas do ícone seguem iguais.
- [ ] **Step 5: commit** `feat(ml): anuncio do kit de composicao acende o "!" quando uma peca muda`.

### Task 7: Roteiro do ML no MCP e o rascunho 258262

**Files:**
- Modify: o roteiro da proposta do ML (`src/lib/mcp/`, texto do "Kit no ML", versão +1) e a asserção da versão em `scripts/teste-mcp.js`

- [ ] **Step 1: roteiro.** Acrescentar: kit de produtos DIFERENTES não se monta no anúncio; pedir ao dono para criar o produto "Com composição" em Produtos (ou usar `criarProduto`) e só então o anúncio. `npm run teste:mcp`. Expected: OK com a versão nova.
- [ ] **Step 2: 258262 (C1, com o ok do dono na hora).** Na VPS, pela tela do Rise: excluir o rascunho 258262 conferindo o popup ("só o rascunho do Rise é excluído"). Guardar no chat o título, o texto e o preço aprovados, para o anúncio do produto kit.
- [ ] **Step 3: commit** `docs(mcp): roteiro do ML manda o kit de produtos diferentes para o cadastro`.

### Task 8: Fecho

- [ ] **Step 1:** ritual de fim de sessão: `npm run lint`, `teste:extracao`, `teste:coleta`, `teste:cadastros`, `teste:composicao`, `teste:anuncios-ml`, `teste:bling-sync`, `teste:pedidos`, `teste:mcp`; `teste:worker` sozinho. Expected: todos OK; qualquer falha, mesmo de outra sessão, vai nomeada no relatório.
- [ ] **Step 2:** CLAUDE.md (seção nova "Kit de composição pelo cadastro (22/11/2026)", contagens dos testes) e a memória (`projeto-kit-de-composicao-no-ml.md` + linha no MEMORY.md; `feedback-kit-no-ml-e-no-editor.md` ganha "produtos diferentes = produto kit do cadastro").
- [ ] **Step 3:** revisão do diff inteiro num contexto novo (code-reviewer) e correção do que for Crítico/Importante com teste RED→GREEN.
- [ ] **Step 4:** mostrar ao dono "O que foi feito" + "Testes que você precisa fazer" e esperar o "Sobe". Primeiro uso real: criar o kit DB25 macho+fêmea em Produtos (Clonar o 901202 → Com composição), Cadastrar no Bling, criar o anúncio do ML dele e conferir uma venda em Vendas.
