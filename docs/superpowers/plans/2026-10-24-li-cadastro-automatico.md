# Cadastro automático na Loja Integrada — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (o dono pediu execução inline). Steps usam `- [ ]`.

**Goal:** "Cadastrar na LI" cria pausado, liga no Bling, grava o estoque inicial na LI e ativa; falha mostra "!" e o editor oferece "Completar o cadastro".

**Architecture:** O `cadastrarNaLI` de hoje vira a etapa "criar"; uma função nova `completarCadastroLI` faz ligar no Bling → estoque → ativar, cada etapa LENDO o estado antes de escrever (é o que torna o retomar seguro sem repetir escrita). A falha fica em `Anuncio.dados.cadastroLI` e o ícone lê dali; produto antigo é diagnosticado ao abrir o editor por uma regra pura.

**Tech Stack:** Next 16, Prisma, JavaScript; testes em `scripts/teste-li-sync.js` com a LI falsa e um Bling de mentira.

**Spec:** `docs/superpowers/specs/2026-10-24-li-cadastro-automatico-design.md`

## Medido na LI real em 24/10/2026 (produto de teste ZZ-TESTE-LI, 404334430; o ZZ-TESTE-BLING foi apagado da LI)

- `PUT /produto_estoque/{id}` com `{ gerenciado: true, quantidade: 3 }` → 200, gravado; a `situacao_sem_estoque` fica como estava (0).
- `PUT /produto_estoque/{id}` com `{ gerenciado: true, quantidade: 0, situacao_sem_estoque: -1 }` → 200, gravado. Os produtos cujo
  estoque o Bling mandou (100101, 100105) têm `-1`: é o valor que o Rise manda.
- `PUT /produto/{id}` com o produto inteiro (GET menos `CHAVES_SO_LEITURA`) e `ativo: true` → 200, releitura `ativo: true`; o estoque
  não mudou. `ativo: false` volta. O produto de teste terminou como começou (inativo, sem controle de estoque).
- **Não medido:** se o Bling continua mandando o saldo depois de o Rise ligar o controle (presumido: o Bling manda a cada movimento).

## Global Constraints

- Ordem das etapas: `criar`, `ligar_bling`, `estoque`, `ativar`, `gravar`.
- Corpo do estoque: `{ gerenciado: true, quantidade: max(0, saldo virtual do Bling arredondado), situacao_sem_estoque: -1 }`.
- Travas antes da primeira escrita: `cliente.exigirEscrita(sku)` (LI) e `bling.exigirEscrita(sku)` (Bling), no Cadastrar e no Completar.
- Nenhuma escrita repete sozinha; o Sincronizar não muda (nunca manda `ativo` nem estoque).
- Texto de tela com acento; identificadores e comentários sem acento.

## Review Focus

- Bling com saldo negativo (há 37 assim): estoque vai 0, não negativo.
- Produto sumido do Bling entre o ligar e o estoque (`lerSaldosDoBling` sem o item): falha na etapa `estoque` com o motivo, sem ativar.
- Produto antigo inativo de propósito, já ligado e com estoque controlado: o editor NÃO oferece completar (só falta "ativar").
- Clique duplo: `umPorVez` já serializa por produto; o segundo clique de Completar acha tudo feito e só grava.
- Falha do LI no PUT de ativar com 5xx: etapa `ativar` com o recado "confira na loja", e o próximo Completar relê `ativo` antes.

---

### Task 1: Regras puras das etapas

**Files:**
- Create: `src/lib/canaisDeVenda/li/etapasCadastro.js` (sem imports: tela, envio e teste leem)
- Test: `scripts/teste-li-sync.js` (bloco novo "Cadastro automático: regras")

**Interfaces — Produces:**
- `ETAPAS_DO_CADASTRO_LI = ["criar","ligar_bling","estoque","ativar","gravar"]`, `ROTULO_DA_ETAPA_LI` (`criar: "Criar o anúncio pausado"`, `ligar_bling: "Ligar à Loja Integrada no Bling"`, `estoque: "Gravar o estoque na Loja Integrada"`, `ativar: "Ativar o anúncio"`, `gravar: "Gravar no Rise"`).
- `corpoDoEstoqueInicialLI(saldo) -> { gerenciado: true, quantidade, situacao_sem_estoque: -1 }` (saldo null/negativo/NaN → 0; arredonda).
- `faltaNoCadastroLI({ idExterno, ativo, estoqueGerenciado, situacaoNoBling }) -> string[]` das etapas `ligar_bling|estoque|ativar` que faltam; `[]` sem `idExterno`. `ligar_bling` só quando `situacaoNoBling === "sem_vinculo"`.
- `ofereceCompletar({ falta, falhou }) -> boolean`: `falhou` (há `dados.cadastroLI`) ou `falta` contém `ligar_bling` ou `estoque`.

- [ ] Testes: saldo `5`→5, `-3`→0, `null`→0, `2.6`→3; `faltaNoCadastroLI` do 100108 (`ativo:true, estoqueGerenciado:false, "ligado"`) → `["estoque"]`; só inativo → `["ativar"]` e `ofereceCompletar` false; com `falhou` → true.
- [ ] Implementar, rodar `npm run teste:li-sync`, commit.

### Task 2: LI falsa com `produto_estoque` e o estoque na leitura

**Files:**
- Modify: `scripts/lib/lojaIntegradaFalsa.js` (GET/PUT `/produto_estoque/{id}`, guardado em `estoque_gerenciado`, `estoque_quantidade`, `estoque_situacao_sem_estoque` do produto; PUT só aceita `gerenciado`, `quantidade`, `situacao_em_estoque`, `situacao_sem_estoque`, outra chave lança; o PUT mantém a `situacao_*` ausente, como medido)
- Modify: `src/lib/canaisDeVenda/li/leitura.js`: `lerEstoqueDaLI(cliente, id) -> { gerenciado: boolean, quantidade: number, situacaoSemEstoque: number|null }` e `lerParaPopupLI` devolve `ativo` e `estoqueGerenciado` do produto vinculado.

- [ ] Teste: `lerEstoqueDaLI` na falsa depois de um PUT; `lerParaPopupLI` traz os dois campos. Commit.

### Task 3: Etapas no envio

**Files:**
- Modify: `src/lib/canaisDeVenda/li/envio.js`

**Interfaces — Produces:**
- `cadastrarNaLI(produtoId, cliente = clienteLI(), bling = clienteBling())`: as travas da LI E do Bling antes do POST; o "criar" de hoje até as fotos, mas `gravarSucesso` só no fim; depois chama a mesma rotina do Completar. Resultado `{ ok, idExterno, urlExterna, fotos, etapas: string[] feitas, etapa?, erro? }`.
- `completarCadastroLI(produtoId, cliente = clienteLI(), bling = clienteBling())`: exige vínculo (`idExterno`), travas, e roda: `ligar_bling` (`ligarNoBlingLI`, que já confere antes), `estoque` (`lerEstoqueDaLI`; gerenciado → pula; senão `lerSaldosDoBling(bling,[sku])`, sem item = falha "não está no Bling"; `PUT /produto_estoque/{id}`), `ativar` (`lerDetalheDaLI`; ativo → pula; senão `PUT /produto/{id}` com `mesclarCorpoLI(detalhe.produto, riseEnvio, [], ctx)` + `ativo: true`, relê e confere), `gravar` (`gravarSucesso` com `ativo` lido, que apaga `dados.cadastroLI`).
- Falha: `gravarFalha` grava também `dados.cadastroLI = { etapa, erro, em }`; resultado `{ ok:false, etapa, erro, idExterno, etapas }`.

- [ ] Atualizar as chamadas existentes do teste para passar um Bling de mentira (o `blingComVinculos` do bloco "Bling: ligar", subido ao topo, com `GET /estoques/saldos`).
- [ ] Testes: cadastro feliz → LI falsa com o produto `ativo:true`, estoque `{gerenciado:true, quantidade:5, -1}`, vínculo no Bling, anúncio ATIVA e sem `dados.cadastroLI`; a ordem das chamadas (POST produto antes de POST lojas antes de PUT estoque antes de PUT produto); trava do Bling fechada recusa ANTES do POST da LI; Bling recusa o vínculo → `ok:false, etapa:"ligar_bling"`, produto inativo na LI, `dados.cadastroLI.etapa` gravado; Completar depois → ok, sem segundo POST do produto; saldo -2 → quantidade 0; estoque já gerenciado → nenhum PUT de estoque; já ativo → nenhum PUT do produto.
- [ ] Commit.

### Task 4: Ícone, ação e editor

**Files:**
- Modify: `src/lib/canaisDeVenda/li/estado.js` (`estadoDoIconeLI` ganha `incompleto: { etapa, rotulo } | null` de `anuncioLI.dados?.cadastroLI`)
- Modify: `src/components/produtos/IconeLojaIntegrada.jsx` ("!" com `divergente || incompleto`; texto "cadastro incompleto: <rótulo> falhou")
- Modify: `src/app/produtos/acoes-li.js` (`completarCadastroNaLI(produtoId)`, mesma permissão `acao.lojaIntegrada.sincronizar`)
- Modify: `src/lib/canaisDeVenda/li/apresentacao.js` (cadastrar ok: "Produto cadastrado e ativo na Loja Integrada." com as etapas; falha: "O cadastro parou em <rótulo>" e a dica do Completar; `completar` igual)
- Modify: `src/components/anuncios/li/EditorAnuncioLI.jsx` (faixa âmbar "Cadastro incompleto: falta <rótulos>" com "Completar o cadastro" quando `ofereceCompletar`; substitui o botão "Ligar à Loja Integrada no Bling"; texto do "não está na LI" diz que o Cadastrar liga no Bling, grava o estoque e ativa)

- [ ] Teste do ícone (puro) no `teste:li-sync`; lint; conferir na tela no PC (o editor de um produto com `dados.cadastroLI` simulado no banco do PC). Commit.

### Task 5: CLAUDE.md e envio

- [ ] Seção da LI no CLAUDE.md (o medido, as etapas, a exceção do estoque); `npm run lint`, `teste:li-sync`, `teste:extracao`; commit e push. Deploy só com "sobe".
