# Módulo Compras — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloco "Compras" no Rise: lista de produtos abaixo do estoque mínimo com rascunho de pedido automático por fornecedor, editor de pedido de compra no molde do Bling, lançamento de estoque no Bling por item (com Desfazer), PDF para o fornecedor e Dados da empresa.

**Architecture:** Tabelas próprias (`PedidoDeCompra`, `ItemDoPedidoDeCompra`, `LancamentoDoItemDeCompra`, `DadosDaEmpresa`); o estoque a caminho é CALCULADO dos itens de pedidos Enviados/Parciais, nunca gravado no produto. Regras puras em `src/lib/compras/regras.js` (tela, servidor, PDF e teste usam as mesmas); o lançamento reaproveita `MovimentoEstoque` + `enviarAjustesDeEstoque` do Bling, sem caminho novo de escrita.

**Tech Stack:** Next 16.4.2 (App Router, Server Actions), React 19, Prisma 7 + Postgres 17, Tailwind v4, lucide-react, pdfkit 0.17.2, zod. JavaScript (sem TypeScript).

**Spec:** `docs/superpowers/specs/2026-10-26-modulo-compras-design.md` (aprovada pelo dono em 26/10/2026). Ler a spec antes de cada tarefa.

## Global Constraints

- JavaScript; identificadores e comentários em português SEM acento; texto de tela COM acento. Comentário explica o porquê.
- Migration só aditiva, gerada por `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, **tirando as linhas `DROP INDEX`** de índices que só existem no SQL (trigramas, `ProdutoColetado_coletadoEm_idx`, `Job_fonte_aberta`, `Anuncio_um_por_produto`, busca ampla). Depois: `npx prisma migrate deploy`, `npx prisma generate` **e reiniciar o servidor**.
- Toda página confere acesso (`exigirAcessoNaPagina`), toda rota (`recusarRota`), toda Server Action na 1ª linha (`negarSemAcesso`/`executarComAcesso`); o guarda do `npm run teste:acessos` precisa continuar passando.
- Quantidade sugerida no popup = **o máximo cheio** (`estoqueMaximo`), editável. Sem máximo cadastrado: o mínimo.
- Um rascunho aberto por fornecedor. Número exibido `PC-0001` (4 dígitos, cresce além disso).
- Preço do item NUNCA altera custo de produto ou de vínculo.
- Lançar = ENTRADA (motivo "Compra de fornecedor", observação "PC-0005"); Desfazer = SAÍDA (motivo "Outro", observação "Desfazer lançamento PC-0005"). Escrita no Bling só por `enviarAjustesDeEstoque`; nunca repete sozinha.
- Kits (`tipo = COMPOSICAO`) fora da lista de mínimo e recusados como item de pedido.
- Só reais. Datas e o "dia" em `America/Sao_Paulo`.
- Telas: frontend-design + as 10 regras do Padrão visual do CLAUDE.md + `ecc:make-interfaces-feel-better`; janela com `role="dialog"` e `{...propsDoFundo(fechar)}`; "Sair sem salvar?" com alteração; `ConclusaoDoEnvio` só no sucesso; `BolhaDeAjuda` para ajuda; `FotoComLupa` nas miniaturas; `CabecalhoOrdenavel` + `NavegacaoDoTopo` na lista longa (nasce em 25 por página).
- Dados da empresa semeados: CNPJ `30.010.376/0001-48`, razão social `Maicol de Souza`, fantasia `4Hobby`, endereço `Estrada Municipal Domingos Forner`, número `2135`, bairro `Galópolis`, cidade `Caxias do Sul`, UF `RS`, CEP `95090-970`, telefone `5432841632` (só dígitos, padrão do telefone).
- Commit: só os próprios arquivos (`git commit -- caminhos`; arquivo misto por `git apply --cached` dos próprios hunks), mensagem em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Clique duplo / duas abas em "Lançar estoque"** → o segundo é recusado ("já lançado N de N"), um só `MovimentoEstoque`. Teste na Tarefa 8.
2. **Bling recusa ou cai no meio do lançamento** → a entrada fica gravada no Rise como ajuste pendente, o item mostra o aviso, nada repete sozinho. Teste na Tarefa 8.
3. **IPI contado duas vezes**: `ProdutoFornecedor.precoFornecedor` já vem COM impostos da varredura; o item precisa partir do preço SEM IPI quando a coleta traz IPI. Teste na Tarefa 2 (`precoInicialDoItem`).
4. **Mesmo produto adicionado de novo ao mesmo rascunho** (popup aberto em duas abas) → não cria segundo item, devolve "já está no PC-0005". Teste na Tarefa 4.
5. **Desfazer depois que o estoque já saiu** (vendeu parte) → recusa sem gravar nada. Teste na Tarefa 8.

---

### Task 1: Banco — migration aditiva e semente da empresa

**Files:**
- Modify: `prisma/schema.prisma` (modelos e enums novos no fim; relações em `Produto`, `Fornecedor`, `Transportadora`)
- Create: `prisma/migrations/20261026_compras/migration.sql`

**Interfaces:**
- Produces (Prisma): `prisma.pedidoDeCompra`, `prisma.itemDoPedidoDeCompra`, `prisma.lancamentoDoItemDeCompra`, `prisma.dadosDaEmpresa`; enums `StatusDoPedidoDeCompra {RASCUNHO ENVIADO PARCIAL FINALIZADO CANCELADO}`, `FormaDePagamentoDaCompra {PIX BOLETO CARTAO}`, `FretePorConta {CIF FOB}`, `TipoDeDesconto {PERCENTUAL VALOR}`.

- [ ] **Step 1:** Escrever no schema os modelos exatamente como a spec §6, com estes acertos: `descontoTipo TipoDeDesconto?` (enum, não string); `ItemDoPedidoDeCompra.vinculoId String?` sem relação (o vínculo pode sumir e o item guarda cópia dos dados); `LancamentoDoItemDeCompra` como na spec (com `movimentoId String @unique`); `DadosDaEmpresa` com `id String @id` e os campos da spec. `PedidoDeCompra` ganha `@@index([status])` e `@@index([fornecedorId, status])`. Comentário `///` em cada modelo dizendo o porquê (estoque a caminho calculado; lançamento múltiplo; uma linha só de empresa).
- [ ] **Step 2:** Gerar o SQL com o `migrate diff` para `prisma/migrations/20261026_compras/migration.sql`, apagar toda linha `DROP INDEX`, e acrescentar no fim o `INSERT INTO "DadosDaEmpresa" (...) VALUES ('empresa', ...) ON CONFLICT ("id") DO NOTHING;` com os dados das Global Constraints e `"atualizadoEm" = NOW() AT TIME ZONE 'UTC'`.
- [ ] **Step 3:** Run `npx prisma migrate deploy && npx prisma generate`. Expected: "1 migration applied"; generate sem erro.
- [ ] **Step 4:** Run `node -e "import('./src/lib/db.js').then(async({prisma})=>{console.log(await prisma.dadosDaEmpresa.findUnique({where:{id:'empresa'}}));process.exit(0)})"`. Expected: a linha com CNPJ `30.010.376/0001-48`.
- [ ] **Step 5:** Commit `prisma/schema.prisma` e a pasta da migration: "Compras: tabelas de pedido de compra e dados da empresa".

### Task 2: Regras puras de compras e o teste

**Files:**
- Create: `src/lib/compras/regras.js` (sem imports)
- Create: `scripts/teste-compras.js` (molde de `scripts/teste-estoque.js`: `register` do resolver, `conferir(nome, obtido, esperado)`, sai com código 1 se houver falha)
- Modify: `package.json` (script `"teste:compras": "node scripts/teste-compras.js"`)

**Interfaces (Produces, todas em `regras.js`):**
- `STATUS_A_CAMINHO = ["ENVIADO", "PARCIAL"]`; `STATUS_ABERTOS = ["RASCUNHO", "ENVIADO", "PARCIAL"]`
- `numeroDoPedido(n: number) -> string` → `"PC-0005"`, `"PC-12345"`
- `lerDesconto(texto: string) -> { tipo: "PERCENTUAL"|"VALOR", valor: number } | { erro: string }` (vazio → `{tipo:"VALOR", valor:0}`; aceita vírgula; `%` no fim = percentual; percentual > 100 ou negativo = erro)
- `totaisDoPedido({ itens: [{quantidade, precoUnitario, ipiPercentual}], icmsSt, descontoTipo, descontoValor, frete }) -> { produtos, ipi, desconto, total, numeroDeItens, somaDasQuantidades }` — números, 2 casas, arredondamento meio para cima em centavos; total = produtos + ipi + icmsSt + frete − desconto; desconto percentual incide sobre `produtos`; total nunca negativo.
- `totalDoItem({quantidade, precoUnitario}) -> number` (2 casas)
- `faltaLancar({ quantidade, quantidadeLancada }) -> number`
- `aCaminho(itens: [{ status, quantidade, quantidadeLancada }]) -> number` (só `STATUS_A_CAMINHO`)
- `entraNaListaDeMinimo(produto: {conferido, ativo, tipo, estoque, estoqueMinimo}, aCaminhoDoProduto: number) -> boolean`
- `quantidadeSugerida({ estoqueMinimo, estoqueMaximo }) -> number` (máximo cheio; sem máximo, o mínimo)
- `estadoDoCarrinho(itens: [{ status, numero, fornecedor }]) -> null | { cor: "azul"|"verde", texto: string, pedidos: [{numero, status, fornecedor}] }` (verde se algum em `STATUS_A_CAMINHO`, azul se só rascunho; texto "No rascunho PC-0005 (Fortek)" / "Enviado: PC-0003 (Fortek)")
- `precoInicialDoItem({ precoFornecedor, coletado: { precoNormal, impostos: [{nome, percentual}] } | null }) -> { precoUnitario: number|null, ipiPercentual: number }`
- `PROXIMOS_STATUS = { RASCUNHO: ["ENVIADO","CANCELADO"], ENVIADO: ["PARCIAL","FINALIZADO","CANCELADO"], PARCIAL: ["ENVIADO","FINALIZADO"], FINALIZADO: [], CANCELADO: [] }` e `podeIrPara(de, para) -> boolean`
- `statusDepoisDeLancar(status, itensDepois: [{quantidade, quantidadeLancada}]) -> "ENVIADO"|"PARCIAL"` (algum lançado > 0 → PARCIAL; nenhum → ENVIADO)
- `todosLancados(itens) -> boolean`
- `validarQuantidadeDeLancamento(valor, falta) -> { ok: true, quantidade } | { ok: false, erro }` (inteiro, ≥ 1, ≤ falta)

- [ ] **Step 1: Escrever o teste** (bloco "Regras de compras" em `scripts/teste-compras.js`), com estes casos exatos:

```js
conferir("numero", [numeroDoPedido(5), numeroDoPedido(12345)], ["PC-0005", "PC-12345"]);
conferir("desconto %", lerDesconto("5%"), { tipo: "PERCENTUAL", valor: 5 });
conferir("desconto R$ com virgula", lerDesconto("50,5"), { tipo: "VALOR", valor: 50.5 });
conferir("desconto vazio", lerDesconto(""), { tipo: "VALOR", valor: 0 });
conferir("desconto > 100%", "erro" in lerDesconto("120%"), true);
const itens = [{ quantidade: 225, precoUnitario: 4.35, ipiPercentual: 0 }, { quantidade: 215, precoUnitario: 21.75, ipiPercentual: 10 }];
conferir("totais do print do Bling + IPI", totaisDoPedido({ itens, icmsSt: 0, descontoTipo: "VALOR", descontoValor: 0, frete: 0 }),
  { produtos: 5654.0, ipi: 467.63, desconto: 0, total: 6121.63, numeroDeItens: 2, somaDasQuantidades: 440 });
conferir("desconto 10% sobre produtos", totaisDoPedido({ itens: [{ quantidade: 10, precoUnitario: 10, ipiPercentual: 0 }], icmsSt: 0, descontoTipo: "PERCENTUAL", descontoValor: 10, frete: 5 }).total, 95);
conferir("a caminho ignora rascunho e cancelado", aCaminho([
  { status: "RASCUNHO", quantidade: 50, quantidadeLancada: 0 }, { status: "ENVIADO", quantidade: 30, quantidadeLancada: 0 },
  { status: "PARCIAL", quantidade: 20, quantidadeLancada: 15 }, { status: "CANCELADO", quantidade: 99, quantidadeLancada: 0 }]), 35);
conferir("entra: abaixo do minimo", entraNaListaDeMinimo({ conferido: true, ativo: true, tipo: "SIMPLES", estoque: 2, estoqueMinimo: 5 }, 0), true);
conferir("sai: a caminho cobre", entraNaListaDeMinimo({ conferido: true, ativo: true, tipo: "SIMPLES", estoque: 2, estoqueMinimo: 5 }, 3), false);
conferir("kit fora", entraNaListaDeMinimo({ conferido: true, ativo: true, tipo: "COMPOSICAO", estoque: 0, estoqueMinimo: 5 }, 0), false);
conferir("sem minimo fora", entraNaListaDeMinimo({ conferido: true, ativo: true, tipo: "SIMPLES", estoque: 0, estoqueMinimo: null }, 0), false);
conferir("nao conferido fora", entraNaListaDeMinimo({ conferido: false, ativo: true, tipo: "SIMPLES", estoque: 0, estoqueMinimo: 5 }, 0), false);
conferir("sugerida = maximo cheio", quantidadeSugerida({ estoqueMinimo: 5, estoqueMaximo: 40 }), 40);
conferir("sugerida sem maximo = minimo", quantidadeSugerida({ estoqueMinimo: 5, estoqueMaximo: null }), 5);
conferir("carrinho azul", estadoDoCarrinho([{ status: "RASCUNHO", numero: 5, fornecedor: "Fortek" }]).cor, "azul");
conferir("carrinho verde vence", estadoDoCarrinho([{ status: "RASCUNHO", numero: 5, fornecedor: "Fortek" }, { status: "ENVIADO", numero: 3, fornecedor: "Santana" }]).cor, "verde");
conferir("carrinho vazio", estadoDoCarrinho([{ status: "FINALIZADO", numero: 1, fornecedor: "X" }]), null);
conferir("preco sem IPI da coleta (nao dobra)", precoInicialDoItem({ precoFornecedor: 32.54, coletado: { precoNormal: 31.9, impostos: [{ nome: "IPI", percentual: 2 }] } }), { precoUnitario: 31.9, ipiPercentual: 2 });
conferir("preco sem coleta", precoInicialDoItem({ precoFornecedor: 12.5, coletado: null }), { precoUnitario: 12.5, ipiPercentual: 0 });
conferir("preco sem nada", precoInicialDoItem({ precoFornecedor: null, coletado: null }), { precoUnitario: null, ipiPercentual: 0 });
conferir("transicoes", [podeIrPara("RASCUNHO","ENVIADO"), podeIrPara("PARCIAL","CANCELADO"), podeIrPara("FINALIZADO","ENVIADO")], [true, false, false]);
conferir("depois de lancar", [statusDepoisDeLancar("ENVIADO", [{ quantidade: 10, quantidadeLancada: 4 }]), statusDepoisDeLancar("PARCIAL", [{ quantidade: 10, quantidadeLancada: 0 }])], ["PARCIAL", "ENVIADO"]);
conferir("quantidade de lancamento", [validarQuantidadeDeLancamento("5", 10).ok, validarQuantidadeDeLancamento("11", 10).ok, validarQuantidadeDeLancamento("0", 10).ok, validarQuantidadeDeLancamento("2.5", 10).ok], [true, false, false, false]);
```

- [ ] **Step 2:** Run `npm run teste:compras`. Expected: falha de import (`regras.js` não existe).
- [ ] **Step 3:** Implementar `src/lib/compras/regras.js` com as assinaturas acima. Conta de dinheiro em centavos inteiros (`Math.round(valor * 100)`), como a cotação faz. `precoInicialDoItem`: se `coletado.impostos` traz `IPI` e `coletado.precoNormal` é número → `{precoNormal, percentual do IPI}`; senão `{precoFornecedor ?? null, 0}`. Comentário no topo: "o precoFornecedor ja vem com impostos da varredura (23/10/2026); partir dele e somar o IPI cobraria o IPI duas vezes".
- [ ] **Step 4:** Run `npm run teste:compras`. Expected: todas `ok`, código 0.
- [ ] **Step 5:** Commit `src/lib/compras/regras.js scripts/teste-compras.js package.json`: "Compras: regras puras (totais, desconto, a caminho, carrinho, status)".

### Task 3: Acessos, menu e a página de cartões

**Files:**
- Modify: `src/lib/acessos/recursos.js` (logo depois do bloco de `tela.produtos`)
- Modify: `src/lib/blocos.js` (entrada entre Produtos e Scraper, ícone `ShoppingBag`)
- Create: `src/lib/compras/catalogo.js` (`CARTOES_DE_COMPRAS`, molde de `src/lib/configuracoes/catalogo.js`)
- Create: `src/app/compras/page.jsx`
- Modify: `scripts/teste-acessos.js` (só se algum número fixo de recursos for conferido lá)

**Interfaces:**
- Produces: recursos `tela.compras` ("Compras", "/compras"), `tela.compras.pedidos` ("Compras › Pedidos de compra"), `tela.compras.estoqueMinimo` ("Compras › Abaixo do estoque mínimo"), `acao.compras.lancarEstoque` ("Lançar estoque do pedido no Bling", pai `tela.compras.pedidos`, dica "Grava a entrada no Rise e manda ao Bling; o Desfazer manda a saída.").
- Produces: `CARTOES_DE_COMPRAS = [{ href: "/compras/estoque-minimo", recurso: "tela.compras.estoqueMinimo", rotulo: "Abaixo do estoque mínimo", icone: TriangleAlert, resumo }, { href: "/compras/pedidos", recurso: "tela.compras.pedidos", rotulo: "Pedidos de compra", icone: ClipboardList, resumo }]`.
- Consumes (Task 4 e 6): `contarAbaixoDoMinimo()` e `contarPedidosPorStatus()` para o detalhe vivo dos cartões — nesta tarefa o detalhe fica `undefined` e a Task 4/6 o liga.

- [ ] **Step 1:** Acrescentar os 4 recursos e a entrada do menu (`resumo: "Pedidos de compra e reposição do estoque mínimo"`, `pronto: true`).
- [ ] **Step 2:** Criar `src/app/compras/page.jsx` no molde de `src/app/configuracoes/page.jsx`: `exigirAcessoNaPagina("tela.compras", "ver")`, cartões filtrados por `acesso.pode(cartao.recurso, "ver")`, `PageHeader titulo="Compras"`.
- [ ] **Step 3:** Run `npm run teste:acessos`. Expected: passa (a página nova confere; nada na lista de exceções).
- [ ] **Step 4:** Run `npm run lint`. Expected: sem erro.
- [ ] **Step 5:** Commit: "Compras: bloco no menu, recursos de acesso e página de cartões".

### Task 4: Abaixo do mínimo e o rascunho automático (banco)

**Files:**
- Create: `src/lib/compras/banco.js`
- Modify: `scripts/teste-compras.js` (bloco "Banco: abaixo do mínimo e rascunho", com produtos e fornecedor `ZZ-COMPRA-*`, apagados num `limpar()` no início e no `finally`)

**Interfaces (Produces, em `banco.js`):**
- `aCaminhoDosProdutos(ids: string[]) -> Promise<Map<string, number>>` (um `findMany` dos itens com `pedido.status in STATUS_A_CAMINHO`, somado com `aCaminho`)
- `itensAbertosDosProdutos(ids) -> Promise<Map<string, [{status, numero, fornecedor, pedidoId}]>>` (status em `STATUS_ABERTOS`)
- `listarAbaixoDoMinimo({ busca?, pagina=1, porPagina=25, ordenar?: "codigo"|"estoque"|"falta", direcao?: "asc"|"desc" }) -> Promise<{ linhas: [{ id, sku, nome, foto, estoque, aCaminho, minimo, maximo, falta, carrinho }], total }>` — filtro no banco com `conferido: true, ativo: true, tipo: "SIMPLES", estoqueMinimo: { not: null }, estoque: { lt: campo estoqueMinimo }` (mesma comparação de `src/lib/mcp/catalogo.js`), depois aplica `entraNaListaDeMinimo` com o a caminho (pode tirar linhas: o total conta depois do filtro), ordena e pagina em memória (a lista abaixo do mínimo é pequena: comentário dizendo isso). `foto` = url da principal com `papel: "FOTO"` (helper de foto já usado na lista de Produtos). `falta = minimo − estoque − aCaminho`.
- `contarAbaixoDoMinimo() -> Promise<number>`
- `fornecedoresParaCompra(produtoId) -> Promise<{ produto: {id, sku, nome, minimo, maximo, sugerida}, linhas: [{ vinculoId, fornecedorId, fornecedor, descricao, codigo, precoUnitario, ipiPercentual, estoqueFornecedor, link, padrao, noRascunho: {pedidoId, numero}|null }] }>` — ordem do mais barato ao mais caro, padrão em destaque (campo `padrao`); `estoqueFornecedor` pela mesma busca de `consultarEstoqueFornecedores` (extrair a parte de banco dela para `src/lib/estoqueDoFornecedor.js` se for preciso reaproveitar sem a checagem de acesso, mantendo a ação chamando a função nova); preço por `precoInicialDoItem`.
- `adicionarAoPedido({ produtoId, vinculoId, quantidade }) -> Promise<{ ok: true, pedidoId, numero, criado: boolean, jaEstava?: boolean, avisoOutroRascunho?: string } | { ok: false, erro }>` — numa transação: recusa kit, produto inexistente e quantidade inválida (inteiro ≥ 1); lê o vínculo; `pg_advisory_xact_lock(hashtext('compras.rascunho.' || fornecedorId))`; acha RASCUNHO do fornecedor ou cria com `proximoNumero(tx)`; se o produto já está nesse rascunho devolve `{ ok: true, jaEstava: true, ... }` sem criar; senão cria o item (nome/código/link do vínculo, `precoInicialDoItem`, `prazoDias` = `fornecedor.prazoEntregaDias`, `ordem` = maior + 1). `avisoOutroRascunho` = "Também está no PC-0004 (Santana)" quando existe em rascunho de outro fornecedor.
- `proximoNumero(tx) -> Promise<number>` — `pg_advisory_xact_lock(hashtext('compras.numero'))` + `MAX(numero) + 1` (1 no primeiro).

- [ ] **Step 1: Escrever o teste**: cria produto `ZZ-COMPRA-1` (conferido, estoque 2, mín 5, máx 40), `ZZ-COMPRA-KIT` (COMPOSICAO, estoque 0, mín 5), fornecedores `ZZ Compra Fortek` e `ZZ Compra Santana` com vínculos. Asserções:
  - `listarAbaixoDoMinimo({ busca: "ZZ-COMPRA" })` traz só `ZZ-COMPRA-1`, com `falta` 3 e `carrinho` null.
  - `fornecedoresParaCompra` devolve `sugerida` 40 e as duas linhas, a mais barata primeiro.
  - `adicionarAoPedido` (Fortek, 40) → `criado: true`, número N; de novo (Fortek) → `jaEstava: true`, mesmo número, 1 item no banco.
  - Santana → outro número, `avisoOutroRascunho` contém "PC-".
  - Lista: o produto continua (só rascunho), `carrinho.cor` "azul".
  - Atualizar o pedido da Fortek para ENVIADO direto no banco → `aCaminho` 40 → o produto SAI da lista; `CANCELADO` → volta.
  - Kit: `adicionarAoPedido` recusa com erro contendo "kit".
  - Concorrência: `Promise.all` de 5 `adicionarAoPedido` de 5 produtos `ZZ-COMPRA-C*` para um fornecedor novo → 1 rascunho só e 5 itens; 5 `proximoNumero` em transações paralelas → 5 números distintos.
- [ ] **Step 2:** Run `npm run teste:compras`. Expected: FALHA (funções não existem).
- [ ] **Step 3:** Implementar `banco.js` com as assinaturas acima.
- [ ] **Step 4:** Run `npm run teste:compras`. Expected: tudo ok; nenhum `ZZ-COMPRA` sobra no banco.
- [ ] **Step 5:** Ligar o detalhe vivo do cartão "Abaixo do estoque mínimo" (`"14 produtos"`) em `src/app/compras/page.jsx`.
- [ ] **Step 6:** Commit: "Compras: lista abaixo do mínimo e rascunho automático por fornecedor".

### Task 5: Tela "Abaixo do estoque mínimo" e o popup de fornecedores

**Files:**
- Create: `src/app/compras/acoes.js` (`"use server"`; esta tarefa cria `fornecedoresParaCompraAcao`, `adicionarAoPedidoAcao`)
- Create: `src/app/compras/estoque-minimo/page.jsx`
- Create: `src/components/compras/TabelaEstoqueMinimo.jsx`, `PopupFornecedores.jsx`, `IconeCarrinho.jsx`

**Interfaces:**
- Consumes: `listarAbaixoDoMinimo`, `fornecedoresParaCompra`, `adicionarAoPedido` (Task 4); `estadoDoCarrinho` (Task 2).
- Produces (ações): `fornecedoresParaCompraAcao(produtoId)` → negar sem `tela.compras.estoqueMinimo` ver; sem `dado.custo` devolve as linhas com `precoUnitario: null` e `ipiPercentual: null` (projeção no servidor). `adicionarAoPedidoAcao({ produtoId, vinculoId, quantidade })` → negar sem `tela.compras.pedidos` editar; `revalidatePath("/compras", "layout")`.
- Produces (componente): `<IconeCarrinho estado={estadoDoCarrinho(...)} />` (lucide `ShoppingCart`, azul `text-sky-600` / verde `text-emerald-600`, `title` e `aria-label` = `estado.texto`; nada quando `estado` é null).

- [ ] **Step 1:** Página: `exigirAcessoNaPagina("tela.compras.estoqueMinimo", "ver")`; sem `dado.estoqueExato` → `notFound()`. Lê `?busca=&pagina=&por=&ordenar=&direcao=` (`porPaginaDaUrl`, `parametrosDaOrdenacao`), chama `listarAbaixoDoMinimo`. `PageHeader` com `LinkDeVolta` para `/compras`.
- [ ] **Step 2:** `TabelaEstoqueMinimo`: colunas Foto (`FotoComLupa`) · Nome (link ao cadastro, `truncate`) · Código · Estoque · A caminho (só > 0) · Mínimo · Máximo · carrinho · botão "Fornecedores". Cabeçalhos ordenáveis Código/Estoque/Falta. Estado vazio: "Nenhum produto abaixo do mínimo." Antes de desenhar, linha-guia: "o operador vê primeiro quais produtos faltam e quanto; a ação principal é Fornecedores".
- [ ] **Step 3:** `PopupFornecedores` (`role="dialog"`, `propsDoFundo`, Esc fecha): título "Fornecedores de {sku} · {nome}"; tabela Foto · Fornecedor · Descrição no fornecedor · Código · Preço un (+ "IPI 2%" embaixo quando > 0) · Estoque fornecedor (mesma regra/rótulos de `situacaoDeEstoque`) · Link · Padrão · Qtde (input inteiro, `defaultValue = sugerida`, `propsDeNumero`-like: recusa `e + - . ,`) · "Adicionar ao pedido". Linha com `noRascunho`: no lugar do botão, "No rascunho {PC} · Abrir" (link para `/compras/pedidos/{id}`). Depois de adicionar: faixa verde no rodapé "Adicionado ao PC-0005 · Abrir pedido" (+ o `avisoOutroRascunho` em âmbar), o botão da linha vira "No rascunho" e a lista de trás recarrega (`router.refresh()`) para o carrinho aparecer. Sem fornecedores: estado vazio com link "Cadastrar fornecedor no produto".
- [ ] **Step 4:** Run `npm run lint && npm run teste:acessos`. Expected: limpos.
- [ ] **Step 5:** Verificar no navegador (preview do dev server, servidor reiniciado depois da migration): `/compras/estoque-minimo` com um produto de teste do banco do PC abaixo do mínimo; abrir Fornecedores, Adicionar, ver o carrinho azul; console sem erro; screenshot a 1366×768.
- [ ] **Step 6:** Passar a tela por `ecc:make-interfaces-feel-better`, corrigir, e commitar: "Compras: tela abaixo do estoque mínimo com popup de fornecedores".

### Task 6: Pedido de compra (banco): ler, salvar, status, itens

**Files:**
- Modify: `src/lib/compras/banco.js`
- Modify: `scripts/teste-compras.js` (bloco "Banco: pedido")

**Interfaces (Produces):**
- `listarPedidos({ status?: string[], busca?, pagina=1, porPagina=25 }) -> { linhas: [{ id, numero, fornecedor, status, itens, total, enviadoEm, atualizadoEm }], total }` (total por `totaisDoPedido`)
- `contarPedidosPorStatus() -> { RASCUNHO, ENVIADO, PARCIAL }`
- `criarPedido(fornecedorId) -> { ok, pedidoId, numero }` (se já há rascunho do fornecedor, devolve ele: `{ok, pedidoId, numero, jaExistia: true}`)
- `lerPedido(id) -> pedido | null` — com fornecedor (nome, cnpj, prazoEntregaDias, condicoesPagamento), transportadora, itens em `ordem` com produto (sku, tituloBase, foto, tipo) e `lancamentos` vivos, e `totais`.
- `salvarPedido(id, dados) -> { ok } | { ok: false, erros: {campo: msg} }` — schema zod em `src/lib/compras/esquema.js` (`EsquemaDoPedido`). Em RASCUNHO grava tudo (itens: quantidade inteira ≥ 1, preço ≥ 0 com até 4 casas, IPI 0–100, prazo inteiro ≥ 0 ou vazio; ordem pela posição recebida; remove os itens que não vieram). Em ENVIADO/PARCIAL grava só `prazoDias` dos itens, rastreio, transportadora, observações, proposta (número) — **quantidade/preço/IPI/ICMS/desconto/frete/pagamento recebidos são ignorados**. FINALIZADO/CANCELADO: recusa ("pedido fechado"). Desconto chega como texto e passa por `lerDesconto`.
- `adicionarItem(pedidoId, produtoId) -> { ok, itemId } | { ok:false, erro }` (só RASCUNHO; usa o vínculo do produto com o fornecedor do pedido quando existe — o padrão primeiro —, senão só nome/sku e preço null; recusa kit e duplicado).
- `buscarItensParaPedido(pedidoId, texto) -> [{ produtoId, sku, nome, foto, vinculo: {codigo, descricao}|null, jaNoPedido }]` — até 20; acha por sku/nome (`contains` sem caixa em `sku`/`tituloBase`) e por `ProdutoFornecedor.codigo`/`descricao` do fornecedor do pedido; só SIMPLES e ativos.
- `mudarStatus(id, para) -> { ok } | { ok:false, erro }` — `podeIrPara`; ENVIADO grava `enviadoEm` (recusa pedido sem item ou com item sem preço: "item sem preço: SKU"); FINALIZADO grava `finalizadoEm`; CANCELADO grava `canceladoEm` e recusa se algum item tem lançamento vivo ("já há estoque lançado; finalize").

- [ ] **Step 1: Escrever o teste** (produtos e fornecedor `ZZ-COMPRA-*`):
  - `criarPedido` duas vezes para o mesmo fornecedor → mesmo id, `jaExistia`.
  - `salvarPedido` em RASCUNHO com desconto "10%", frete "15,50", 2 itens → `lerPedido(...).totais.total` confere com `totaisDoPedido`.
  - `mudarStatus` RASCUNHO→ENVIADO com item sem preço → recusa citando o SKU; com preço → ok, `enviadoEm` preenchido.
  - `salvarPedido` em ENVIADO mandando quantidade 999 e rastreio "BR123" → quantidade continua a antiga, rastreio gravado.
  - `adicionarItem` em ENVIADO → recusa.
  - `buscarItensParaPedido` acha pelo código no fornecedor (`ZZCF-01`) e marca `jaNoPedido`.
  - `mudarStatus` FINALIZADO→ENVIADO → recusa.
- [ ] **Step 2:** Run `npm run teste:compras`. Expected: FALHA.
- [ ] **Step 3:** Implementar `esquema.js` e as funções.
- [ ] **Step 4:** Run `npm run teste:compras`. Expected: ok.
- [ ] **Step 5:** Ligar o detalhe vivo do cartão "Pedidos de compra" ("2 rascunhos · 1 enviado"). Commit: "Compras: pedido de compra no banco (salvar, itens, status)".

### Task 7: Telas — lista de pedidos e editor do pedido

**Files:**
- Modify: `src/app/compras/acoes.js` (`listar`, `criarPedidoAcao`, `salvarPedidoAcao`, `adicionarItemAcao`, `buscarItensAcao`, `mudarStatusAcao`, `fornecedoresParaNovoPedidoAcao`)
- Create: `src/app/compras/pedidos/page.jsx`, `src/app/compras/pedidos/[id]/page.jsx`
- Create: `src/components/compras/TabelaPedidos.jsx`, `EditorPedido.jsx`, `BlocoFornecedor.jsx`, `BlocoItens.jsx`, `BuscaDeItem.jsx`, `BlocoTotais.jsx`, `BlocoPagamento.jsx`, `BlocoFrete.jsx`, `BlocoProposta.jsx` (a parte de arquivo fica na Task 9; aqui só o número), `SeloDoStatus.jsx`
- Create: `src/lib/compras/projecao.js` (`semPrecos(pedido)` → preços, IPI, totais em R$ e desconto/frete/ICMS viram `null`)

**Interfaces:**
- Consumes: tudo da Task 6; `totaisDoPedido`, `lerDesconto`, `numeroDoPedido` (Task 2).
- Ações: ver = `tela.compras.pedidos` ver; escrever = editar. Sem `dado.custo`: `lerPedido` passa por `semPrecos` antes de ir à tela, e `salvarPedidoAcao` remove do que recebe os campos de preço (o servidor mantém os gravados).

- [ ] **Step 1:** Lista `/compras/pedidos`: chips de status (Todos, Rascunho, Enviado, Parcial, Finalizado, Cancelado; parâmetro repetido `?status=`), busca por número ou fornecedor, colunas Número · Fornecedor · Status (`SeloDoStatus`: rascunho cinza, enviado azul, parcial âmbar, finalizado verde, cancelado cinza riscado) · Itens · Total · Enviado em · Atualizado. Ação principal "Novo pedido" abre janela com busca de fornecedor (cadastro de Fornecedores ativos) → `criarPedidoAcao` → navega ao editor.
- [ ] **Step 2:** Editor `/compras/pedidos/[id]` (`notFound()` sem pedido): página inteira, linha-guia "o operador vê primeiro os itens e o total; a ação principal muda com o status". Cabeçalho "PC-0005 · Fortek" + `SeloDoStatus` + menu ⋮ com "Cancelar pedido" (só RASCUNHO/ENVIADO; popup com número e fornecedor). Cartões separados (borda, título forte, `gap-6` entre eles), na ordem da spec §7.4: Fornecedor · Itens · Totais · Pagamento · Frete · Proposta · Observações. Estado controlado; campos de RASCUNHO editáveis; em ENVIADO/PARCIAL só prazo, transportadora, rastreio, observações, nº da proposta (o resto `disabled` com o motivo no `title`: "Pedido enviado: o PDF já foi ao fornecedor"); FINALIZADO/CANCELADO `inert`.
  - `BlocoItens`: tabela Foto · Produto (nome + SKU) · Nome no fornecedor · Código no fornecedor · Qtde · Preço un · IPI % · Total · Prazo · Link (ícone `ExternalLink`, `target="_blank" rel="noreferrer"`, só http/https) · coluna Lançar (vazia nesta tarefa; Task 8 preenche) · lixeira (só RASCUNHO). Rodapé "+ Adicionar outro item" abre `BuscaDeItem` (campo único, 300 ms de espera, lista com "vínculo com {fornecedor}" ou "sem vínculo com este fornecedor").
  - `BlocoTotais`: calculados em cinza (Total dos produtos, Total do IPI, Nº de itens, Soma das qtdes); editáveis Total ICMS ST, Desconto (texto, `lerDesconto`, ao lado "− R$ x"; erro no campo), Frete; **Total do pedido** em destaque.
  - `BlocoPagamento`: Pix/Boleto/Cartão como opções lado a lado (radio escondido, padrão `EscolhaDoTipo`); Parcelas (1–24; travado em 1 no Pix).
  - `BlocoFrete`: Transportadora (select do cadastro + opção "Outra…" que mostra texto livre), CIF/FOB lado a lado, rastreio (com link pela `urlRastreamento` da transportadora quando houver).
  - Rodapé fixo: esquerda "Alterações não salvas" + "Baixar PDF" (link; a rota nasce na Task 11 — até lá desabilitado com `title`); direita "Salvar e fechar" e a ação do status ("Marcar como enviado" com pergunta "Salvar e marcar como enviado?"; "Finalizar pedido" com pergunta listando os itens não lançados).
  - "Sair sem salvar?" (padrão do projeto) no Voltar, no "Salvar e fechar" com erro e no `beforeunload`.
- [ ] **Step 3:** Run `npm run lint && npm run teste:acessos && npm run teste:compras`. Expected: limpos.
- [ ] **Step 4:** Verificar no navegador: criar pedido pela lista, adicionar 2 itens pela busca, desconto "5%", frete, Pix, salvar; recarregar e conferir valores; Marcar como enviado; conferir campos travados; o produto do pedido sai da lista de mínimo se o a caminho cobre. Screenshot a 1366×768.
- [ ] **Step 5:** `ecc:make-interfaces-feel-better`, corrigir, commit: "Compras: lista e editor do pedido de compra".

### Task 8: Lançar estoque e Desfazer

**Files:**
- Modify: `src/lib/ajusteRapido.js` — extrair o corpo da transação de `gravarAjusteDeEstoque` para `export async function ajustarEstoqueNaTransacao(tx, id, dados) -> { ok, saldoAnterior, saldoNovo, movimentoId } | { ok: false, erro }` (mesmas validações e mesmas mensagens; `gravarAjusteDeEstoque` passa a ser `prisma.$transaction(tx => ajustarEstoqueNaTransacao(tx, id, dados))` com o mesmo try/catch e o mesmo retorno de antes, sem `movimentoId` a mais quebrar quem lê).
- Create: `src/lib/compras/lancamento.js`
- Modify: `src/app/compras/acoes.js` (`lancarEstoqueAcao`, `desfazerLancamentoAcao`, `reenviarAoBlingAcao`) — `executarComAcesso("acao.compras.lancarEstoque", "executar", ...)`; revalidam `/compras` e `/produtos`.
- Create: `src/components/compras/PopupLancarEstoque.jsx`, `CelulaDeLancamento.jsx`
- Modify: `src/components/compras/BlocoItens.jsx` (coluna Lançar)
- Modify: `scripts/teste-compras.js` (bloco "Lançamento", com `criarBlingFalso` de `scripts/lib/blingFalso.js` e `codigosLiberados: ["ZZ-COMPRA-L1"]`)

**Interfaces (Produces, em `lancamento.js`):**
- `lancarEstoqueDoItem(itemId, quantidade, { cliente = clienteBling(), depositoId } = {}) -> { ok: true, lancamentoId, saldoNovo, bling: { ok: true } | { ok: false, erro, precisaDeposito? } } | { ok: false, erro }`
  1. Transação: `SELECT ... FROM "ItemDoPedidoDeCompra" WHERE id = $1 FOR UPDATE` + pedido; recusa pedido fora de ENVIADO/PARCIAL e `validarQuantidadeDeLancamento(quantidade, faltaLancar(item))` (mensagem: "Já lançado {lancada} de {quantidade}." quando falta 0); `ajustarEstoqueNaTransacao(tx, produtoId, { tipo: "ENTRADA", quantidade, motivo: "Compra de fornecedor", observacao: numeroDoPedido(n) })`; cria `LancamentoDoItemDeCompra`; regrava `quantidadeLancada`; pedido → `statusDepoisDeLancar`.
  2. Fora da transação: `enviarAjustesDeEstoque(produtoId, cliente, { depositoId })`; o resultado vai em `bling` (nunca desfaz o passo 1).
- `desfazerUltimoLancamento(itemId, { cliente } = {}) -> mesmo formato` — só pedido PARCIAL; pega o último lançamento vivo; `ajustarEstoqueNaTransacao` SAÍDA (a recusa "A saída (N) é maior que o saldo (M)." vira "Já saíram unidades deste produto; ajuste pela lista de Produtos."); grava `desfeitoEm`; regrava `quantidadeLancada`; `statusDepoisDeLancar`; envia ao Bling igual.
- `reenviarPendentes(produtoId, depositoId, { cliente })` → `enviarAjustesDeEstoque` (para o popup escolher o depósito).

- [ ] **Step 1: Escrever o teste** (produto `ZZ-COMPRA-L1` estoque 5 no Rise e no Bling falso, pedido ENVIADO com 1 item de 10):
  - lançar 4 → `ok`, estoque do Rise 9, 1 `MovimentoEstoque` ENTRADA com observação "PC-…", `bling.ok` true, pedido PARCIAL, Bling falso com saldo 9 e 1 lançamento `E`.
  - lançar 7 → recusa (falta 6), nada muda.
  - **duplo clique**: `Promise.all([lancar(6), lancar(6)])` → exatamente um `ok`, estoque 15, 2 lançamentos vivos no total.
  - todos lançados → `todosLancados` true (o pedido continua PARCIAL; finalizar é do dono).
  - desfazer → estoque 9, pedido continua PARCIAL (sobra o de 4); desfazer de novo → estoque 5, pedido ENVIADO.
  - **saldo consumido**: lançar 10, depois `gravarAjusteDeEstoque` SAÍDA 12 no produto, desfazer → recusa com "Já saíram", nada muda.
  - **Bling falha**: Bling falso sem o código liberado (trava) → `ok: true`, `bling.ok` false com o erro, estoque do Rise subiu, o `MovimentoEstoque` fica com `enviadoAoBlingEm` null; nenhum segundo `POST /estoques` na lista de chamadas.
  - pedido RASCUNHO → lançar recusa.
- [ ] **Step 2:** Run `npm run teste:compras`. Expected: FALHA.
- [ ] **Step 3:** Refatorar `ajusteRapido.js` e implementar `lancamento.js`.
- [ ] **Step 4:** Run `npm run teste:compras && npm run teste:estoque && npm run teste:bling-sync`. Expected: os três passam (o refactor não muda `teste:estoque`).
- [ ] **Step 5:** Tela. `CelulaDeLancamento` (só ENVIADO/PARCIAL): sem lançamento → botão "Lançar estoque"; parcial → "Lançado 4 de 10" + "Lançar" + "Desfazer"; completo → "Lançado 10 de 10 · 20/10 14:32" + "Desfazer" (só PARCIAL). Bling recusou → âmbar "Entrada gravada no Rise; o Bling recusou: {erro}" + "Reenviar". `PopupLancarEstoque` (`role="dialog"`, `propsDoFundo`): Quantidade do pedido · Já lançado (> 0) · Quantidade que chegou (já com o que falta) · Saldo no Rise agora → depois · linha "Grava a entrada no Rise e manda ao Bling agora."; Cancelar / **Lançar no Bling** ("Lançando…" travado enquanto roda). `precisaDeposito` → lista de depósitos e "Enviar neste depósito" (`reenviarAoBlingAcao`). Sucesso → `ConclusaoDoEnvio` ("Entrada de 10 un. lançada no Bling"). Desfazer → popup de confirmação com produto e quantidade. Quando `todosLancados` fica true depois de um lançamento, o editor pergunta "Todos os itens chegaram. Finalizar o pedido?" (Finalizar / Agora não).
- [ ] **Step 6:** Verificar no navegador com o produto `ZZ-TESTE-BLING` (o único liberado na trava do PC; o `.env` do PC tem a escrita fechada, então o esperado no PC é a faixa âmbar de recusa + a entrada gravada no Rise; desfazer depois). Screenshot.
- [ ] **Step 7:** Commit: "Compras: lançar estoque do item no Bling e desfazer".

### Task 9: Proposta do fornecedor (arquivo)

**Files:**
- Create: `src/lib/compras/arquivos.js`
- Create: `src/app/api/compras/[id]/proposta/route.js` (GET; `recusarRota` sem `tela.compras.pedidos` ver)
- Modify: `src/app/compras/acoes.js` (`enviarPropostaAcao(formData)` grava no lote temporário; o Salvar move), `src/components/compras/BlocoProposta.jsx`, `src/lib/compras/banco.js` (`salvarPedido` aceita `propostaTemporaria` e `removerProposta`)
- Modify: `scripts/teste-compras.js`

**Interfaces:**
- `guardarPropostaTemporaria(lote, arquivo: File) -> { ok, nome, nomeOriginal } | { ok:false, erro }` — reaproveita `validarEGravar`/`salvarArquivo` de `src/lib/arquivos.js` com PDF/JPEG/PNG, até 20 MB, tipo pelos bytes; em `dados/temporarios/<lote>/`.
- `moverPropostaParaPedido(pedidoId, lote, nome) -> { nome }` para `dados/compras/<pedidoId>/<32 hex>.<ext>`; a anterior é apagada só depois da transação.
- Rota: `Content-Disposition` com o nome real (`cabecalhoDeArquivo` de `src/lib/arquivos.js`), corpo por `fluxoDeArquivo`.

- [ ] **Step 1:** Teste: proposta PDF de 1 KB (bytes `%PDF-1.4…`) vai para o pedido, `propostaNomeOriginal` gravado, arquivo existe; um `.txt` com nome `x.pdf` é recusado; remover apaga o arquivo no Salvar.
- [ ] **Step 2:** Run `npm run teste:compras`. Expected: FALHA.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Run `npm run teste:compras && npm run teste:acessos`. Expected: ok.
- [ ] **Step 5:** Tela: no `BlocoProposta`, "Nº da proposta" + "Enviar arquivo" (nome real, Baixar, Excluir que só risca até o Salvar, como os documentos do produto). Commit: "Compras: proposta do fornecedor anexada ao pedido".

### Task 10: Dados da empresa

**Files:**
- Create: `src/lib/compras/empresa.js` (`lerDadosDaEmpresa() -> objeto`, `salvarDadosDaEmpresa(dados) -> {ok}|{ok:false, erros}` com CNPJ por `validarCnpj`/formatado de `src/lib/documentos.js`, CEP formatado, telefone em dígitos por `src/lib/telefone.js`)
- Create: `src/app/configuracoes/empresa/page.jsx`, `src/components/configuracoes/FormularioEmpresa.jsx`
- Modify: `src/app/configuracoes/acoes.js` (`salvarDadosDaEmpresaAcao`, negar sem `tela.configuracoes.usuarios` editar), `src/lib/configuracoes/catalogo.js` (cartão `{ href: "/configuracoes/empresa", recurso: "tela.configuracoes.usuarios", rotulo: "Dados da empresa", icone: Building2, resumo: "Razão social, CNPJ e endereço que vão no pedido de compra." }`)
- Modify: `scripts/teste-compras.js`

- [ ] **Step 1:** Teste: `lerDadosDaEmpresa()` traz a semente; salvar com CNPJ `11.111.111/1111-11` → erro em `cnpj`; salvar telefone `(54) 3284-1632` → grava `5432841632`; restaura a semente no fim.
- [ ] **Step 2:** Run → FALHA. **Step 3:** Implementar. **Step 4:** Run `npm run teste:compras && npm run teste:acessos` → ok.
- [ ] **Step 5:** Tela no padrão de Cadastros (`Campo` em `Card`, envio manual com `startTransition`, lupa do CEP pela `buscarCep` de `acoes-clientes.js`). Verificar no navegador. Commit: "Configurações: dados da empresa para o pedido de compra".

### Task 11: PDF do pedido

**Files:**
- Create: `src/lib/compras/pdf.js` (`pdfDoPedido(pedido, empresa) -> Promise<Buffer>`, molde de `src/lib/relatorios/pdf.js`)
- Create: `src/app/api/compras/[id]/pdf/route.js` (GET; `recusarRota` sem `tela.compras.pedidos` ver **e** `dado.custo` ver; `Content-Type: application/pdf`, `Cache-Control: no-store`, `Content-Disposition: inline; filename="PC-0005-fortek.pdf"` com o nome do fornecedor só `[a-z0-9-]`)
- Modify: `src/components/compras/EditorPedido.jsx` (liga o "Baixar PDF"; com alteração não salva pergunta "Salvar antes de baixar?")
- Modify: `scripts/teste-compras.js`

**Interfaces:**
- Consumes: `lerPedido`, `lerDadosDaEmpresa`, `totaisDoPedido`, `numeroDoPedido`.
- Conteúdo exato (spec §7.6): cabeçalho com fantasia, razão social, CNPJ, endereço, telefone formatado; "Pedido de compra PC-0005"; "Enviado em dd/mm/aaaa" ou "Rascunho de dd/mm/aaaa"; fornecedor (nome, CNPJ, contato, telefone); tabela `# · Código no fornecedor · Descrição · Qtde · Un · Preço un · IPI % · Total` (Descrição = nome no fornecedor ou, sem ele, o nome do Rise; **nunca o SKU do Rise**); totais; pagamento ("Pix", "Boleto em 3x"…); transportadora e "Frete por conta do remetente (CIF)"/"do destinatário (FOB)"; "Proposta nº"; observações. Quebra de página com o cabeçalho da tabela repetido.

- [ ] **Step 1:** Teste: `pdfDoPedido` de um pedido com 60 itens devolve Buffer começando com `%PDF`, com mais de 1 página (`/Type /Page` aparece ≥ 2 vezes), e o texto extraído (`pdf-parse`, já instalado) contém "PC-", "30.010.376/0001-48" e o código no fornecedor, e **não** contém o SKU `ZZ-COMPRA-`.
- [ ] **Step 2:** Run → FALHA. **Step 3:** Implementar. **Step 4:** Run `npm run teste:compras` → ok.
- [ ] **Step 5:** Baixar pelo navegador e conferir o PDF visualmente (screenshot da primeira página). Commit: "Compras: PDF do pedido para o fornecedor".

### Task 12: Fechamento

**Files:**
- Modify: `CLAUDE.md` (seção nova "## Compras (26/10/2026)" depois de "Saúde do Rise", no estilo das outras: onde mora, regras que custaram pensar — IPI não dobra, a caminho calculado, lançamento múltiplo com `movimentoId` único, Desfazer só em PARCIAL, travas do Bling —, o que não foi visto; linha nova na tabela "Estado"; `npm run teste:compras` em "Rodar")
- Modify: memória `projeto-modulo-compras.md` + linha no `MEMORY.md`

- [ ] **Step 1:** Run `npm run lint`, `npm run teste:compras`, `npm run teste:estoque`, `npm run teste:bling-sync`, `npm run teste:acessos`, `npm run teste:cadastros`. Expected: todos passam (anotar os números de asserções para o CLAUDE.md).
- [ ] **Step 2:** `npx eslint --rule '{"no-undef":"error"}' src/components/compras src/lib/compras src/app/compras src/app/api/compras src/app/configuracoes/empresa` (o lint do projeto não tem `no-undef`). Expected: limpo.
- [ ] **Step 3:** Percorrer no navegador o fluxo inteiro: mínimo → Fornecedores → Adicionar → editor → Enviado → Lançar parcial → Desfazer → Lançar tudo → Finalizar → PDF; com `RISE_SIMULAR_LOGIN` de uma função sem `dado.custo`, conferir que preços somem e o Salvar não apaga preços.
- [ ] **Step 4:** Escrever a seção do CLAUDE.md e a memória.
- [ ] **Step 5:** Commit só dos próprios arquivos (o CLAUDE.md por `git apply --cached` do próprio trecho se houver alteração de outra sessão; conferir o HEAD) e `git push`. Deploy só com o "sobe" do dono.
- [ ] **Step 6:** Entregar ao dono "O que foi feito" + "Testes que você precisa fazer" (passo a passo com o resultado esperado).
