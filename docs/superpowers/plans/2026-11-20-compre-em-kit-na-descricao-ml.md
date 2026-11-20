# "Compre em kit e economize" na descrição do ML: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, pedido do dono) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a descrição que vai ao ML ganha as boas-vindas, perde a seção "Garantia:" e ganha o bloco dos kits maiores do mesmo produto, com o "!" acompanhando os kits.

**Architecture:** o texto sai de funções puras (`descricao.js` e o novo `kitsNaDescricao.js`). Os anúncios irmãos do produto entram como dado (`irmaos`) no `conteudoAtualDoAnuncio`, que devolve o texto completo e a lista `kits`; a impressão guarda `kits` e `formato`, e só quem tem a chave acompanha os kits.

**Tech Stack:** Next.js 16, Prisma 7, testes em `scripts/teste-anuncios-ml.js` (ML e Bling falsos, Postgres local).

**Spec:** `docs/superpowers/specs/2026-11-20-compre-em-kit-na-descricao-ml-design.md`

## Global Constraints

- Texto só com caracteres do Latin-1 (o ML recusa o resto); a linha é de 40 hifens.
- Preço sem espaço depois do "R$": `R$60,00`.
- O `descricao` da impressão continua sendo o md5 do texto BASE de hoje (`montarDescricaoML`): anúncio antigo não pode acender o "!".
- Nada vai ao ML sozinho; o Rise nunca muda preço.
- Comentários sem acento, texto de tela com acento.

## Review Focus

- Produto com Clássico e Premium da mesma quantidade: vale o mais barato.
- Kit maior com preço por unidade igual ou maior: fica fora, e os seguintes comparam com o último listado.
- Descrição com linhas em branco entre os itens da garantia (texto antigo do Bling): a seção inteira sai.
- Anúncio publicado antes do deploy: nenhuma parte nova acende; depois de um Sincronizar passa ao formato 2.
- Kit misto ou produto com composição: sem bloco e fora do bloco dos outros.

---

### Task 1: o texto (boas-vindas, garantia, bloco)

**Files:** Modify `src/lib/canaisDeVenda/ml/descricao.js`; Test `scripts/teste-anuncios-ml.js`.

**Interfaces (produces):**
- `FORMATO_DA_DESCRICAO = 2`, `BOAS_VINDAS_ML` (5 linhas, a última é a linha de hifens)
- `semGarantia(texto: string): string`
- `blocoDosKits(kits: {unidades, preco, link, freteGratis}[]): string` ("" sem kits)
- `montarDescricaoCompletaML({ descricao, kits = [] }): string` ("" sem descrição)
- `montarDescricaoML` não muda.

- [ ] Teste: `semGarantia` tira "Garantia:" com itens colados e com linhas em branco entre eles, e não mexe em texto sem a seção nem em "Garantia de 12 meses" no meio de um parágrafo.
- [ ] Teste: `blocoDosKits` com 2 kits dá exatamente o texto da spec (com "+ frete grátis" só no que tem) e "" sem kits.
- [ ] Teste: `montarDescricaoCompletaML` começa pelas boas-vindas, não tem "Garantia:", termina no link do último kit; sem kits termina na descrição; só Latin-1.
- [ ] Rodar e ver falhar; implementar; rodar e ver passar.

### Task 2: os kits irmãos

**Files:** Create `src/lib/canaisDeVenda/ml/kitsNaDescricao.js`; Modify `src/lib/canaisDeVenda/ml/banco.js`.

**Interfaces (produces):**
- `unidadesDoAnuncio({ produtoId, composicao }): number | null` (simples = 1; kit de um produto só = quantidade; misto = null)
- `irmaoDoAnuncio(anuncio): { unidades, preco, link, freteGratis } | null` (linha do banco: PUBLICADO, ATIVA ou PAUSADA, com MLB; preço = `publicacao.enviado.preco ?? dados.preco`)
- `kitsParaOBloco({ unidades, preco, irmaos }): { unidades, preco, link, freteGratis }[]`
- `kitForaDoBloco({ unidades, preco, irmaos }): { unidades, unitario } | null`
- `irmaosDosProdutosML(produtoIds: string[]): Promise<Map<string, irmao[]>>` em `banco.js`

- [ ] Testes puros: os casos do Review Focus e o do dono (1, 3 e 5 peças).
- [ ] Teste de banco: `irmaosDosProdutosML` com simples, kit, rascunho (fora) e encerrado (fora).
- [ ] Rodar e ver falhar; implementar; rodar e ver passar.

### Task 3: a impressão e o "!"

**Files:** Modify `acompanhar.js`, `impressao.js`, `icone.js`, `banco.js` (`mudancasDosAnunciosML`, `carregarAnuncioML`, `novoRascunhoML`).

**Interfaces:**
- `conteudoAtualDoAnuncio(rascunho, produtosPorId, irmaos = null)` ganha `kits` (lista, ou `null` sem `irmaos`) e `descricaoCompleta`.
- `impressaoDoConteudo`: com `kits` lista, grava `kits` e `formato: 2`.
- `mudancasDoAnuncio`: parte `"kits"` só quando a impressão enviada tem a chave e a lista difere.
- `carregarAnuncioML` devolve `contexto.kitsDoProduto` e `formatoAntigo` (publicado sem `enviado.formato === 2`).

- [ ] Testes: anúncio antigo não acende; no formato 2, kit novo, preço novo e kit encerrado acendem `kits`; nome da parte "kits da descrição" no ícone.
- [ ] Rodar e ver falhar; implementar; rodar e ver passar.

### Task 4: Publicar e Sincronizar

**Files:** Modify `payload.js`, `publicar.js`, `atualizar.js`.

- [ ] Testes contra o ML falso: o `plain_text` do Publicar e o do PUT do Sincronizar são o texto completo; depois do envio a impressão tem `kits`, `formato: 2` e `formatoEm`, e o "!" apaga.
- [ ] Rodar e ver falhar; implementar (`gravarParte("descricao")` grava as três chaves); rodar e ver passar.

### Task 5: telas

**Files:** Modify `AbaDescricao.jsx`, `AbaPrecoEstoque.jsx`, `EditorAnuncioML.jsx`, `banco.js` (`listarAnunciosML`), `app/canais-de-venda/mercado-livre/page.jsx`.

- [ ] Aba Descrição: a prévia é o texto completo; publicado no formato antigo mostra "Descrição no formato antigo" (o Sincronizar converte).
- [ ] Aba Preço e custos do kit: aviso âmbar do `kitForaDoBloco`.
- [ ] Lista do ML: `listarAnunciosML({ formato: "antigo" })` e o link "Descrição no formato antigo (N)" (`?formato=antigo`); teste da contagem e do filtro.
- [ ] Conferir no navegador.

### Task 6: fechar

- [ ] `npm run teste:anuncios-ml`, `npm run teste:proposta`, lint dos arquivos tocados.
- [ ] CLAUDE.md (seção nova e a contagem do teste) e a memória; commit e push.
