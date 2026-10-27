# Peças próprias e ordem de produção — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** produto montado pelo dono ganha a lista de peças próprias (custo total = custo do produto) e uma ordem de
produção em duas etapas: dar baixa nas peças, concluir lançando o produto final.

**Architecture:** regras puras em `src/lib/producao/regras.js`; banco e transações em `src/lib/producao/banco.js`
(molde de `src/lib/compras/banco.js` e `lancamento.js`: trava `FOR UPDATE`, `ajustarEstoqueNaTransacao`, Bling depois
do commit); tabela de peças no cadastro de Produto (campo oculto JSON, só grava no Salvar, como fornecedores e
composição); telas da ordem no bloco Estoque, no desenho do editor de pedido de Compras.

**Tech Stack:** Next 16 (JS, sem TS), Prisma 7 / Postgres 17, Tailwind v4, lucide-react, teste em script Node com
`conferir()` (`scripts/teste-compras.js` é o molde) e o Bling falso `scripts/lib/blingFalso.js`.

**Spec:** `docs/superpowers/specs/2026-10-26-producao-pecas-proprias-design.md`

## Global Constraints

- Código e comentários em português sem acento; texto de tela com acento. Comentário explica o porquê.
- Migration só aditiva, SQL gerado por `migrate diff` SEM as linhas de `DROP INDEX` dos índices que só existem no SQL.
- Janela nova: `role="alertdialog"`/`"dialog"`, fundo com `{...propsDoFundo(fechar)}`, nunca `confirm()`.
- Toda ação de `src/app/**/acoes.js` confere o acesso na 1ª linha (o `teste:acessos` tem o guarda estático).
- Nada escreve no Bling sem `exigirEscrita` (o Bling falso lança); uma tentativa, nunca repete sozinho.
- Padrão visual (10 regras do CLAUDE.md): ajuda em `BolhaDeAjuda`, uma ação principal, miniatura em `FotoComLupa`.
- Entrega termina com commit (só os próprios arquivos), lint limpo, `teste:producao`, `teste:composicao`, `teste:compras`,
  `teste:estoque` e `teste:acessos` passando, CLAUDE.md atualizado e o roteiro de testes para o dono.

## Review Focus

1. Peça do Rise que é excluída enquanto está na lista de peças de outro produto → o Restrict do banco recusa; a tela de
   exclusão deve dizer "usado como peça em X" em vez do erro cru (Task 3, teste `excluir peca usada`).
2. Peça cujo custo muda depois (fornecedor padrão trocado, varredura) → o custo do produto que a usa acompanha no
   próximo Salvar da peça (Task 2, teste `custo da peca muda`).
3. Produto com peças próprias e `estoqueMinimo` entrando na lista de Compras → não entra (Task 7, teste em `teste:compras`).
4. Dar baixa duas vezes (clique duplo, duas abas) → a segunda cai em "só ordem aberta" (Task 5, teste `clique duplo`).
5. Quantidade 0,5 com 3 unidades planejadas → total 2 (arredondado para cima), mostrado na ordem (Task 1, teste).

---

### Task 1: Banco e regras puras

**Files:**
- Modify: `prisma/schema.prisma` (modelo `Produto`, perto de `tipo`; modelos novos no fim)
- Create: `prisma/migrations/20261026c_producao_pecas_proprias/migration.sql`
- Create: `src/lib/producao/regras.js`
- Create: `scripts/teste-producao.js`; Modify: `package.json` (`"teste:producao": "node scripts/teste-producao.js"`)

**Interfaces:**
- Produces: `Produto.pecasProprias Boolean @default(false)`; `PecaPropriaDoProduto { id, produtoId (Cascade), ordem Int,
  componenteId String? (Produto, Restrict, relação `pecasOndeEntra`), descricao String?, custoManual Decimal?(12,2),
  quantidade Decimal(12,3) }` com `@@index([produtoId])`; `enum SituacaoDaOrdemDeProducao { ABERTA, EM_PRODUCAO,
  CONCLUIDA, CANCELADA }`; `OrdemDeProducao { id, numero Int @unique, produtoId (Restrict), situacao, quantidadePlanejada
  Int, quantidadeProduzida Int?, observacao String?, criadoEm, baixaEm?, concluidaEm?, canceladaEm?, entradaMovimentoId
  String? @unique }`; `ItemDaOrdemDeProducao { id, ordemId (Cascade), componenteId String? (Restrict), sku String?,
  descricao String, custoUnitario Decimal?(12,2), quantidadePorUnidade Decimal(12,3), quantidadeTotal Int,
  saidaMovimentoId String? @unique, devolucaoMovimentoId String? @unique }`.
- Produces (`regras.js`, sem imports):
  - `custoDasPecas(pecas) -> { total: number|null, incompleto: boolean }` (peça: `{ custo: number|null, quantidade }`;
    custo nulo = incompleto e total nulo).
  - `corDoEstoque({ estoque, estoqueMinimo }) -> "vermelho"|"amarelo"|"verde"`.
  - `textoDoEstoque({ estoque, estoqueMinimo, estoqueMaximo }) -> { titulo, linhas: string[] }` (título "Estoque do
    produto vazio" / "Estoque abaixo do mínimo" / "Estoque ok"; linhas "Estoque atual: N", "Estoque mínimo: N",
    "Estoque máximo: N", as duas últimas só quando há valor).
  - `validarPecas(lista) -> { ok: true, pecas } | { ok: false, erro }`: até 50; cada uma com `componenteId` OU
    (`descricao` até 120 + `custoManual` ≥ 0); `quantidade` > 0 com até 3 casas; `componenteId` repetido ou igual ao
    próprio produto recusado; `ordem` = posição.
  - `quantidadeTotalDaPeca(quantidadePorUnidade, planejada) -> Int` (`Math.ceil`).
  - `faltasParaBaixa(itens, estoques) -> [{ sku, descricao, necessario, disponivel }]` (só itens com `componenteId`;
    `estoques` = `Map<componenteId, number>`).
  - `numeroDaOrdem(n) -> "OP-0001"`; `podeIrPara(de, para)` com `ABERTA→EM_PRODUCAO|CANCELADA`,
    `EM_PRODUCAO→CONCLUIDA|CANCELADA`, nada sai de `CONCLUIDA`/`CANCELADA`; `validarQuantidadeProduzida(valor,
    planejada) -> { ok, quantidade } | { ok: false, erro }` (inteiro de 1 a planejada).
  - `SITUACOES`, `ROTULO_DA_SITUACAO` (Aberta, Em produção, Concluída, Cancelada).

- [ ] **Step 1: Escrever os testes das regras em `scripts/teste-producao.js`** (cabeçalho e `conferir` copiados de
  `teste-compras.js`; o bloco de banco entra nas tasks seguintes, num `try/finally` que apaga `ZZ-PROD-*`):

```js
conferir("custo total", custoDasPecas([{ custo: 10, quantidade: 2 }, { custo: 1.5, quantidade: 0.5 }]), { total: 20.75, incompleto: false });
conferir("custo incompleto", custoDasPecas([{ custo: 10, quantidade: 1 }, { custo: null, quantidade: 1 }]), { total: null, incompleto: true });
conferir("cor zero", corDoEstoque({ estoque: 0, estoqueMinimo: 5 }), "vermelho");
conferir("cor abaixo", corDoEstoque({ estoque: 3, estoqueMinimo: 5 }), "amarelo");
conferir("cor ok", corDoEstoque({ estoque: 5, estoqueMinimo: 5 }), "verde");
conferir("cor sem minimo", corDoEstoque({ estoque: 1, estoqueMinimo: null }), "verde");
conferir("texto", textoDoEstoque({ estoque: 0, estoqueMinimo: 2, estoqueMaximo: 3 }), { titulo: "Estoque do produto vazio", linhas: ["Estoque atual: 0", "Estoque mínimo: 2", "Estoque máximo: 3"] });
conferir("total arredonda para cima", quantidadeTotalDaPeca(0.5, 3), 2);
conferir("faltas", faltasParaBaixa([{ componenteId: "a", sku: "1", descricao: "A", quantidadeTotal: 4 }, { componenteId: null, descricao: "cola", quantidadeTotal: 1 }], new Map([["a", 3]])), [{ sku: "1", descricao: "A", necessario: 4, disponivel: 3 }]);
conferir("valida peca manual sem custo", validarPecas([{ descricao: "x", quantidade: 1 }]).ok, false);
conferir("valida repetida", validarPecas([{ componenteId: "a", quantidade: 1 }, { componenteId: "a", quantidade: 2 }]).ok, false);
conferir("valida proprio", validarPecas([{ componenteId: "eu", quantidade: 1 }], "eu").ok, false);
conferir("numero", numeroDaOrdem(7), "OP-0007");
conferir("transicoes", [podeIrPara("ABERTA", "CONCLUIDA"), podeIrPara("EM_PRODUCAO", "CONCLUIDA"), podeIrPara("CONCLUIDA", "CANCELADA")], [false, true, false]);
conferir("produzida acima", validarQuantidadeProduzida("4", 3).ok, false);
```

- [ ] **Step 2: Rodar `npm run teste:producao`** → FALHA (módulo não existe).
- [ ] **Step 3: Alterar o `schema.prisma`** com os modelos do bloco Interfaces (comentários `///` dizendo o porquê do
  Restrict e da cópia na ordem).
- [ ] **Step 4: Gerar a migration** com `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
  --script > prisma/migrations/20261026c_producao_pecas_proprias/migration.sql`, **tirar as linhas `DROP INDEX`** que o
  diff propõe para os índices só do SQL, `npx prisma migrate deploy`, `npx prisma generate`.
- [ ] **Step 5: Implementar `src/lib/producao/regras.js`** com as assinaturas acima.
- [ ] **Step 6: Rodar `npm run teste:producao`** → todas `ok`.
- [ ] **Step 7: Commit** `feat(producao): banco e regras puras das pecas proprias e da ordem` (schema, migration,
  regras, teste, package.json).

---

### Task 2: Custo do produto pelas peças e trava da entrada manual

**Files:**
- Modify: `src/lib/canaisDeVenda/custo.js:26` (`custoDoProduto`)
- Create: `src/lib/producao/pecas.js`
- Modify: `src/lib/ajusteRapido.js:99-130` (`ajustarEstoqueNaTransacao`), `src/lib/estoque.js:14` (`MOTIVOS`)
- Modify: `src/app/produtos/page.jsx:241-246` (custo do popup de preço), `src/lib/indicadores/estoque.js:8`
  (`custoDoCadastro`)
- Test: `scripts/teste-producao.js`

**Interfaces:**
- `custoDoProduto({ pecasProprias, custo, fornecedores, fornecedorRascunho })`: com `pecasProprias` true devolve
  `{ valor: custo|null, origem: "peças próprias" }` **sem cair** no fornecedor nem no rascunho (o custo gravado em
  `Produto.custo` é o total das peças, escrito pelo Salvar; nulo = incompleto).
- `pecas.js`:
  - `lerPecasDoProduto(produtoId, cliente = prisma) -> pecaParaTela[]`, onde `pecaParaTela = { id, ordem, componenteId,
    sku, nome, foto: url|null, localizacao, estoque, estoqueMinimo, estoqueMaximo, custo: number|null, custoOrigem,
    descricao, custoManual, quantidade: number }` (peça do Rise: `custo = custoDoProduto(componente).valor`; manual:
    `custo = custoManual`).
  - `buscarPecasProprias(texto, excluirIds) -> pecaParaTela[]` (até 20; produto `tipo SIMPLES`, nome/código contendo o
    texto sem caixa; sem o próprio produto nem os já na lista; `estoque`, mínimo e máximo vêm junto).
  - `gravarPecasProprias(tx, produtoId, { pecasProprias, pecas })`: troca a lista inteira, grava `Produto.pecasProprias`
    e `Produto.custo = custoDasPecas(...).total` (nulo se incompleto; **com `pecasProprias` false não toca em `custo`**).
  - `recalcularCustoDosProdutosQueUsam(componenteId, tx)`: para cada produto com `pecasProprias` true que tem a peça,
    regrava `Produto.custo` pelo `lerPecasDoProduto` (SQL `UPDATE` sem mexer no `atualizadoEm`, como
    `recalcularKitsDasPecas` faz).
- `ajustarEstoqueNaTransacao(tx, id, dados)` ganha `dados.ordemDeProducao: true`: produto com `pecasProprias` e
  `tipo ENTRADA` sem essa marca recusa com `"A entrada deste produto vem da ordem de produção."`. A consulta
  `FOR UPDATE` passa a ler também `"pecasProprias"`.
- `MOTIVOS.ENTRADA` ganha `"Produção"` e `"Produção cancelada"`; `MOTIVOS.SAIDA` ganha `"Produção"`.

- [ ] **Step 1: Testes** (bloco de banco do `teste-producao.js`, com produtos `ZZ-PROD-A` (peça, custo 10 pelo
  `custo` do cadastro), `ZZ-PROD-B` (peça sem custo) e `ZZ-PROD-FINAL`):

```js
conferir("custoDoProduto pecas", custoDoProduto({ pecasProprias: true, custo: 12.5, fornecedores: [{ padrao: true, precoCusto: 99 }] }), { valor: 12.5, origem: "peças próprias" });
conferir("custoDoProduto pecas incompleto", custoDoProduto({ pecasProprias: true, custo: null, fornecedores: [{ padrao: true, precoCusto: 99 }] }).valor, null);
// gravarPecasProprias(FINAL, { pecasProprias: true, pecas: [{componenteId: A, quantidade: 2}, {descricao: "cola", custoManual: 1, quantidade: 1}] })
conferir("custo gravado", Number(final.custo), 21);
// A passa a custar 15 (update custo) + recalcularCustoDosProdutosQueUsam(A)
conferir("custo da peca muda", Number(finalDepois.custo), 31);
// ajustarEstoqueNaTransacao(tx, FINAL, { tipo: "ENTRADA", quantidade: 1 })
conferir("entrada manual recusada", resultado.erro, "A entrada deste produto vem da ordem de produção.");
conferir("entrada pela ordem", (await ajustar(..., { tipo: "ENTRADA", quantidade: 1, ordemDeProducao: true })).ok, true);
conferir("saida manual continua", (await ajustar(..., { tipo: "SAIDA", quantidade: 1 })).ok, true);
```

- [ ] **Step 2: Rodar** → FALHA.
- [ ] **Step 3: Implementar** `custoDoProduto`, `pecas.js`, a trava e os motivos; nos dois leitores que não passam por
  `custoDoProduto` (`produtos/page.jsx:241` e `custoDoCadastro`), o `custo` do cadastro já é o total: só garantir que
  `pecasProprias` true **não cai** no rascunho do Bling quando `custo` é nulo.
- [ ] **Step 4: Rodar `teste:producao`, `teste:estoque`, `teste:compras`** → passam.
- [ ] **Step 5: Commit** `feat(producao): custo pelas pecas proprias e trava da entrada manual`.

---

### Task 3: Salvar do cadastro e ações de apoio

**Files:**
- Modify: `src/app/produtos/acoes.js` (`salvarProduto`, perto de `:808-830` e `:922`; `excluirProduto`)
- Modify: `src/lib/produtoParaFormulario.js` (`carregarProdutoParaFormulario`, `dadosParaClone`, `projetarParaAcessos`)
- Modify: `src/lib/rascunhoDoCadastro.js:33,81,133`
- Test: `scripts/teste-producao.js`

**Interfaces:**
- Campo oculto do formulário `pecasProprias` = JSON `{ ligado: boolean, pecas: [{ componenteId?, descricao?,
  custoManual?, quantidade }] }`. **Ausente = não mexe** (formulário antigo ou sem `dado.custo`).
- `salvarProduto`: lê o campo, `validarPecas` (erro vira recusa com `erros.pecasProprias`), kit (`tipo COMPOSICAO`)
  com `ligado` recusa "Kit não tem peças próprias", `gravarPecasProprias` na mesma transação do produto (criação e
  edição), depois `recalcularCustoDosProdutosQueUsam(id)` (o produto salvo pode ser peça de outro).
- Ação nova `buscarPecasPropriasAcao(texto, excluirIds)` (confere `tela.produtos.cadastro` editar + `dado.custo`;
  devolve `{ ok, itens }`).
- `carregarProdutoParaFormulario` devolve `pecasProprias: boolean` e `pecas: pecaParaTela[]`; `projetarParaAcessos` sem
  `dado.custo` zera `pecas` e deixa `pecasProprias`; `dadosParaClone` leva as peças com ids novos.
- `excluirProduto`: antes de apagar, `prisma.pecaPropriaDoProduto.count({ where: { componenteId } })` > 0 recusa com
  `"Usado como peça própria em: <sku>, <sku>"` (como `kitsQueUsam`).
- Rascunho automático: `montarRascunho` e `lerRascunho` levam `pecasProprias` e `pecas` (entram em `estado`).

- [ ] **Step 1: Testes** (chamar `salvarProduto` com um `FormData` montado, como `teste-composicao.js` faz):
  `salva com pecas` (ligado + 2 peças → `pecasProprias` true, 2 linhas, `custo` 21), `salva sem o campo mantem`
  (FormData sem `pecasProprias` → nada muda), `desliga apaga` (`ligado: false` → 0 linhas, `pecasProprias` false,
  `custo` intacto), `kit recusa`, `excluir peca usada` (excluir `ZZ-PROD-A` → `ok: false` com o SKU do FINAL),
  `clone leva pecas`.
- [ ] **Step 2: Rodar** → FALHA.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar `teste:producao`, `teste:composicao`, `teste:cadastros`, `teste:acessos`** → passam.
- [ ] **Step 5: Commit** `feat(producao): pecas proprias no Salvar do produto`.

---

### Task 4: Tela da aba Fornecedores / Concorrentes

**Files:**
- Create: `src/components/produtos/PecasProprias.jsx`, `src/components/produtos/IconeDeEstoque.jsx`
- Modify: `src/components/produtos/FormularioProduto.jsx:4221-4270` (aba `fornecedores`), estado e campo oculto perto
  de `:3421-3428`, `useRascunhoAutomatico`

**Interfaces:**
- `<IconeDeEstoque estoque estoqueMinimo estoqueMaximo />`: ícone de caixa (`Package` do lucide) na cor de
  `corDoEstoque` (`text-red-600`, `text-amber-500`, `text-emerald-600`), com `BolhaDeAjuda variante="inline"` cujo
  texto é `textoDoEstoque` (título em negrito e uma linha por item, `<span className="block">`).
- `<PecasProprias ligado pecas setPecas produtoId podeProduzir aoAlterar aoDesligar />`: o liga/desliga é do
  `FormularioProduto` (`<input type="checkbox" role="switch">` estilizado, rótulo "Peças próprias", bolha "i"), à
  esquerda do grid de estoque mínimo/máximo (o grid vira `sm:grid-cols-5` com o switch na 1ª coluna).
  - Tabela: Foto (`FotoComLupa`, "—" no manual) · Nome (link `target="_blank"` para `/produtos/<id>`; no manual um
    `<input>` da descrição) · Código · Custo (R$; manual: `<input type="number" step="0.01">`) · Quantidade (`<input
    type="number" step="0.001" min="0.001">`) · Localização · estoque (`IconeDeEstoque`) · lixeira.
  - Rodapé: botão "Adicionar item" (abre a busca no molde de `Composicao.jsx`, com `buscarPecasPropriasAcao`; cada
    achado tem o ícone de estoque; link "Item manual" cria linha vazia) e "Custo total: R$ X" (ou "incompleto" em
    âmbar com a dica de quais peças faltam) à direita; botão "Produzir" (só `podeProduzir`: produto salvo, lista
    não vazia, sem alteração pendente nas peças; `title` com o motivo quando desabilitado) → abre
    `JanelaProduzir` (Task 6).
- No `FormularioProduto`: estado `pecasLigadas`/`pecas` (inicial do produto/clone), campo oculto
  `name="pecasProprias"` com o JSON **só quando `acessos.custo`**; ligado esconde (`hidden`) os blocos `Fornecedores`,
  `FornecedoresDoKit` e `Concorrentes` e mostra `PecasProprias`; o switch não aparece com `ehKit`.
  - Desligar com `pecas.length > 0`: janela `role="alertdialog"` "Desligar peças próprias?" com a lista (código ·
    nome × quantidade), "Cancelar" (foco) e "Desligar e apagar" (`bg-red-600`); confirmado → `setPecas([])`,
    `pecasLigadas=false`, `marcarAlterado()`.
  - Toda mudança chama `marcarAlterado()`; o rascunho automático recebe `pecasProprias` e `pecas` no `estado`.

- [ ] **Step 1: Implementar os dois componentes e a ligação no formulário.**
- [ ] **Step 2: Lint** (`npm run lint` e `npx eslint --rule '{"no-undef":"error"}' src/components/produtos`) → limpo.
- [ ] **Step 3: Conferir no navegador** (`preview_start` do `npm run dev`, produto `ZZ-TESTE-BLING`): ligar, adicionar
  produto e item manual, custo total, desligar com itens pede confirmação, Salvar grava (reabrir mostra a lista),
  fornecedores somem/voltam. Screenshot para o dono.
- [ ] **Step 4: Commit** `feat(producao): tabela de pecas proprias no cadastro`.

---

### Task 5: Ordem de produção no banco

**Files:**
- Create: `src/lib/producao/banco.js`
- Modify: `src/lib/acessos/recursos.js:109` (sub-tela), `src/lib/acessos/semeadura.js` (Atendimento não ganha nada)
- Test: `scripts/teste-producao.js`

**Interfaces (`banco.js`, todas com `{ cliente = clienteBling() }` onde escrevem no Bling):**
- `criarOrdem(produtoId, { quantidade, observacao }) -> { ok, id, numero } | { ok: false, erro }`: produto com
  `pecasProprias` e peças; `numero` por `pg_advisory_xact_lock(hashtext('producao.numero'))` (copiar
  `proximoNumero`); itens = cópia de `lerPecasDoProduto` com `custoUnitario` de hoje e `quantidadeTotal =
  quantidadeTotalDaPeca(...)`.
- `lerOrdem(id) -> { ...ordem, produto: { id, sku, tituloBase, estoque }, itens: [{ ..., estoqueAtual, faltam }] }`.
- `listarOrdens({ situacao, busca, pagina, porPagina = 25 })`, `contarPorSituacao()`.
- `darBaixa(id, opcoes) -> { ok, bling: [{ produtoId, sku, ok, erro? }] } | { ok: false, erro, faltas? }`: transação:
  `SELECT ... FOR UPDATE` da ordem, exige `ABERTA` (senão "Só uma ordem aberta recebe a baixa."), trava as peças
  (`FOR UPDATE` em ordem de id, para não travar cruzado), `faltasParaBaixa` → recusa inteira com
  `faltas`; senão uma `SAIDA` por item (`motivo "Produção"`, `observacao numeroDaOrdem`), grava
  `saidaMovimentoId`, `situacao EM_PRODUCAO`, `baixaEm`. Depois do commit, `enviarAjustesDeEstoque` por peça.
- `concluir(id, quantidadeProduzida, opcoes)`: exige `EM_PRODUCAO`; `ENTRADA` no produto com `ordemDeProducao: true`,
  `entradaMovimentoId`, `quantidadeProduzida`, `concluidaEm`, `CONCLUIDA`; Bling depois.
- `cancelar(id, opcoes)`: `ABERTA` → `CANCELADA` direto; `EM_PRODUCAO` → `ENTRADA` em cada peça (motivo "Produção
  cancelada", `devolucaoMovimentoId`) e `CANCELADA`; Bling depois. `CONCLUIDA` recusa.
- `reenviarPendentesDaOrdem(id, depositoId)`: `reenviarPendentes` de cada produto da ordem com movimento pendente.
- Acessos: `sub("tela.estoque.producao", "Estoque › Ordens de produção", "tela.estoque")` e
  `acao("acao.producao.movimentar", "Dar baixa, concluir ou cancelar ordem de produção", "tela.estoque.producao",
  "Grava os movimentos no Rise e manda ao Bling.")`.

- [ ] **Step 1: Testes** (Bling falso com `exigirEscrita` liberado para `ZZ-PROD-*`): `cria ordem copia pecas` (2
  itens, `quantidadeTotal` de 0,5×3 = 2, número OP-0001 relativo), `baixa recusa falta` (A com estoque 1 → `faltas`
  com `necessario`/`disponivel`, nenhum movimento, A continua 1), `baixa` (A 10 → 6; `EM_PRODUCAO`; movimento com
  motivo "Produção"), `clique duplo` (segunda `darBaixa` → "Só uma ordem aberta recebe a baixa."), `concluir` (FINAL
  0 → 2 com `quantidadeProduzida` 2 de 3), `concluir sem baixa recusa`, `cancelar devolve` (nova ordem baixada →
  cancelar → A volta a 6), `cancelar concluida recusa`, `bling recusa deixa pendente` (Bling falso com erro →
  `bling[0].ok false`, estoque do Rise mudado, `enviadoAoBlingEm` nulo), `kit recalculado` (peça usada num kit
  `ZZ-PROD-KIT`: estoque do kit cai junto).
- [ ] **Step 2: Rodar** → FALHA.
- [ ] **Step 3: Implementar `banco.js` e os recursos de Acessos.**
- [ ] **Step 4: Rodar `teste:producao`, `teste:acessos`** → passam.
- [ ] **Step 5: Commit** `feat(producao): ordem de producao em duas etapas`.

---

### Task 6: Telas da ordem e o Produzir

**Files:**
- Create: `src/app/estoque/producao/page.jsx`, `src/app/estoque/producao/[id]/page.jsx`,
  `src/app/estoque/producao/acoes.js`
- Modify: `src/app/estoque/page.jsx` (cartões: "Ordens de produção" com o detalhe "N abertas"), `src/lib/blocos.js:126`
  (`pronto: true`, resumo "Ordens de produção")
- Create: `src/components/producao/TabelaOrdens.jsx`, `OrdemDeProducao.jsx`, `JanelaProduzir.jsx`,
  `SeloDaSituacao.jsx`
- Modify: `src/components/produtos/PecasProprias.jsx` (ligar `JanelaProduzir`)

**Interfaces:**
- Ações (`acoes.js`, 1ª linha confere): `criarOrdemAcao(produtoId, { quantidade, observacao })` (edita
  `tela.estoque.producao`), `darBaixaAcao(id, { depositoId })`, `concluirAcao(id, { quantidadeProduzida })`,
  `cancelarAcao(id)`, `reenviarAcao(id, depositoId)` (as quatro em `acao.producao.movimentar` executar); todas
  `revalidatePath("/estoque/producao", "layout")` e `"/produtos"`.
- `/estoque/producao`: `PageHeader` "Ordens de produção" com `LinkDeVolta` para `/estoque`; filtro de situação
  (chips com contagem), busca por número/código/nome; tabela Nº · Produto · Qtde planejada/produzida · Situação
  (`SeloDaSituacao`: cinza Aberta, azul Em produção, verde Concluída, vermelho Cancelada) · Criada · Baixa ·
  Concluída; 25 por página com `NavegacaoDoTopo`.
- `/estoque/producao/[id]` (`OrdemDeProducao.jsx`, molde do `EditorPedido` de Compras): trilha da situação
  (`TrilhaDoStatus` de Compras reaproveitada com os 3 passos Aberta → Em produção → Concluída) e no outro extremo a
  ação principal (Aberta: **Dar baixa nas peças**; Em produção: **Concluir produção**, que abre popup pedindo a
  quantidade produzida, sugerida = planejada, com a linha "Perda: N" quando menor); "Cancelar ordem" em texto
  vermelho com popup de confirmação ("devolve as peças ao estoque" quando em produção). Cartões: Produto (código,
  nome, estoque atual, link) · Quantidade · Datas · Observação. Tabela das peças: Foto · Peça · Por unidade · Total
  (com "arredondado para cima" na dica quando difere) · Custo unit. · Custo total · Estoque atual · `IconeDeEstoque`.
  Recusa por falta: faixa vermelha listando "SKU: precisa N, tem M". Bling recusado: faixa âmbar por peça com
  "Reenviar" (`PopupLancarEstoque`/`depositoId` de Compras serve de molde).
  Rodapé: custo total da ordem e o aviso "Somente leitura" sem `acao.producao.movimentar`.
- `JanelaProduzir` (no cadastro): popup "Produzir <nome>" com Quantidade (inteiro ≥ 1), Observação, "Criar ordem" →
  `criarOrdemAcao` → `router.push("/estoque/producao/<id>")` numa aba nova (o cadastro pode ter alteração).

- [ ] **Step 1: Implementar as telas, ações e cartões.**
- [ ] **Step 2: Lint e `no-undef`** → limpo; `teste:acessos` (guarda estático das páginas e ações) → passa.
- [ ] **Step 3: Conferir no navegador** com o produto de teste: Produzir 3 → ordem Aberta; Dar baixa com peça sem
  estoque → faixa de falta; ajustar estoque da peça, Dar baixa → Em produção, estoque da peça baixou (lista de
  Produtos); Concluir 2 → estoque do FINAL +2; nova ordem → Cancelar após baixa → peça devolvida; entrada manual
  pela lista no FINAL recusada com a mensagem. Screenshots para o dono.
- [ ] **Step 4: Commit** `feat(producao): telas da ordem de producao e Produzir no cadastro`.

---

### Task 7: Compras, CLAUDE.md e fechamento

**Files:**
- Modify: `src/lib/compras/regras.js:100` (`entraNaListaDeMinimo`), `src/lib/compras/banco.js:74` (`listarAbaixoDoMinimo`
  seleciona `pecasProprias`), `scripts/teste-compras.js`
- Modify: `CLAUDE.md` (tabela Estado: linha Estoque; seção nova "Peças próprias e ordem de produção (26/10/2026)";
  comando `teste:producao` em "Rodar")

- [ ] **Step 1: Teste em `teste-compras.js`:** `conferir("pecas proprias fora do minimo", entraNaListaDeMinimo({ conferido:
  true, ativo: true, tipo: "SIMPLES", estoqueMinimo: 5, estoque: 0, pecasProprias: true }), false)`.
- [ ] **Step 2: Rodar `teste:compras`** → FALHA; implementar; rodar → passa.
- [ ] **Step 3: CLAUDE.md**: seção curta com o que o dono decidiu, as 7 decisões minhas, onde mora cada parte, a trava
  da entrada manual, e "Não visto" (envio real ao Bling: só contra o falso).
- [ ] **Step 4: Rodar** `lint`, `teste:producao`, `teste:composicao`, `teste:compras`, `teste:estoque`, `teste:acessos`,
  `teste:cadastros` → todos passam.
- [ ] **Step 5: Commit** `docs(producao): CLAUDE.md e Compras sem os produtos de pecas proprias`; push; entregar ao
  dono "O que foi feito" + "Testes que você precisa fazer".
