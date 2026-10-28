# AliExpress em Compras: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** um clique "Enviar ao Rise" numa extensão do Chrome leva as compras do AliExpress para o módulo Compras como
pedidos de compra do fornecedor Ali, com itens casados por anúncio+opção (e fator), rastreio por item, entrada no depósito
Virtual do Bling na compra e saída dele na chegada.

**Architecture:** a extensão (MV3, JS puro, em `extensao-aliexpress/`) dirige a página "Meus pedidos" e captura as
respostas da biblioteca `lib.mtop` do próprio site; manda ao Rise em duas fases (`lista`, depois `detalhes`) por duas
rotas autenticadas por chave. No Rise, os dados crus ficam em três tabelas novas (`PedidoAliExpress`, `LinhaAliExpress`,
`PacoteAliExpress`) ligadas ao `PedidoDeCompra`/`ItemDoPedidoDeCompra` de sempre; as regras moram em
`src/lib/compras/aliexpress/` (puras em `regras.js`, banco em `casamento.js`/`importacao.js`, Bling em `virtual.js`).

**Tech Stack:** Next.js (App Router, JavaScript, sem TypeScript), Prisma 7 + PostgreSQL 17, zod, o cliente do Bling já
existente (`clienteBling()` e o `criarBlingFalso` dos testes), extensão Chrome Manifest V3 sem build.

**Spec:** `docs/superpowers/specs/2026-10-28-aliexpress-em-compras-design.md` (lida com o CLAUDE.md, seção "Compras").

## Global Constraints

- JavaScript sem TypeScript; identificadores e comentários sem acento; texto de tela com acento. Comentário diz o porquê.
- Migration só aditiva, escrita à mão em `prisma/migrations/20261028_compras_aliexpress/migration.sql`; aplicar com
  `npx prisma migrate deploy` e rodar `npx prisma generate`; reiniciar o servidor de desenvolvimento depois.
- Testes no molde de `scripts/teste-compras.js` (`conferir(nome, obtido, esperado)`, `falhas`, código de saída 1): Postgres
  local, SEM rede, só dados `ZZ-ALI-*` / "ZZ Ali *", apagados no começo e no fim; o Bling é o falso de
  `scripts/lib/blingFalso.js` (já responde `GET /depositos` com "Fisico" e "Virtual" e `POST /estoques` com E/S/B).
- Toda página, action e rota confere acesso (`exigirAcessoNaPagina`, `sessaoDeAcessos` + `recusarRota`) ou está na
  lista de exceções do guarda estático em `scripts/teste-acessos.js` (~linhas 876-884) com o motivo.
- Escrita no Bling só por `cliente.exigirEscrita(sku)` antes da primeira chamada (travas `BLING_ESCRITA` e
  `BLING_ESCRITA_CODIGOS`); no PC as travas ficam fechadas.
- Padrão visual (10 regras do CLAUDE.md): uma ação principal, nada de texto fixo (bolha "i"), `role="dialog"` +
  `propsDoFundo` em janela, `ConclusaoDoEnvio` só no sucesso, revisão com `frontend-design` e
  `make-interfaces-feel-better` antes de entregar.
- Valores fixos da spec: corte da 1ª importação = 30 dias; corte seguinte = última importação − 7 dias; teto de 80
  chamadas diretas por clique e 30 páginas por aba; 1,5 a 3 s entre chamadas; payload até 5 MB; até 30 eventos por
  pacote; chave `rise_ali_` + 24 bytes base64url; depósito do Bling pelo nome "Virtual" (sem caixa), nunca id fixo.
- Nunca mandar ao Rise destinatário, endereço, telefone ou ids de pagamento (a extensão limpa antes).

## Review Focus

1. Página do AliExpress em inglês ou moeda USD: a extensão avisa e para; se um pedido em USD escapar, a importação o
   ignora com aviso, nunca grava preço em outra moeda como reais (Tarefa 12, `pedidoDaArvore` mantém `moeda`; Tarefa 8,
   "pedido em USD é ignorado").
2. Pedido já importado que ganha uma linha nova na reimportação (o vendedor dividiu o pedido): a linha entra, casa e vai
   ao Virtual sem mexer nas outras (Tarefa 8, "linha nova em pedido existente").
3. Trava do Bling fechada ou produto sem `blingId`: a importação termina, a linha fica com `virtualErro`, o pedido avisa
   e "Reenviar ao Virtual" resolve depois (Tarefa 8, "Bling recusa a entrada no Virtual").
4. Mesmo anúncio+opção duas vezes no mesmo pedido, ou duas opções que casam com o mesmo produto: um item só, quantidade
   somada e preço médio ponderado (Tarefa 7, "duas linhas no mesmo produto").
5. Pedido que o AliExpress marca entregue quando o item já foi lançado por inteiro (pedido FINALIZADO): nada muda e
   nenhum aviso aparece (Tarefa 2, `avisosDoPedido` com `faltaLancar: 0`; Tarefa 8, "entregue com tudo lançado").

---

### Tarefa 1: Banco, migration e o fornecedor Ali

**Files:**
- Modify: `prisma/schema.prisma` (enums `Servico`, novo `OrigemDoPedidoDeCompra`; `Fornecedor`, `ProdutoFornecedor`,
  `PedidoDeCompra`, `ItemDoPedidoDeCompra`; três models novos)
- Create: `prisma/migrations/20261028_compras_aliexpress/migration.sql`
- Create: `src/lib/compras/aliexpress/fornecedor.js`
- Create: `scripts/teste-aliexpress.js` (cabeçalho + bloco "Fornecedor")
- Modify: `package.json` (`"teste:aliexpress": "node scripts/teste-aliexpress.js"`)

**Interfaces:**
- Produces (schema): `Servico.ALIEXPRESS`; `enum OrigemDoPedidoDeCompra { RISE ALIEXPRESS }`;
  `Fornecedor.aliexpress Boolean @default(false)` (índice único parcial só no SQL: `"Fornecedor_aliexpress_unico"
  WHERE "aliexpress" = true`); `ProdutoFornecedor.fator Int @default(1)`; `PedidoDeCompra.origem
  OrigemDoPedidoDeCompra @default(RISE)`, `PedidoDeCompra.imposto Decimal @default(0) @db.Decimal(12, 2)`,
  `PedidoDeCompra.aliexpress PedidoAliExpress?`; `ItemDoPedidoDeCompra.linhasAliExpress LinhaAliExpress[]`.
- Produces (models): `PedidoAliExpress { id, pedidoId @unique (Cascade), externoId @unique, loja String?, lojaId
  String?, statusTexto String, statusCodigo Int?, dataDoPedido DateTime, totalInformado Decimal(12,2), moeda String,
  entregueEm DateTime?, canceladoNoAliExpressEm DateTime?, detalheLidoEm DateTime?, rastreioLidoEm DateTime?, criadoEm,
  atualizadoEm, linhas LinhaAliExpress[], pacotes PacoteAliExpress[] }`; `LinhaAliExpress { id, pedidoAliExpressId
  (Cascade), externoLinhaId @unique, productId String, skuId String?, opcao String?, titulo String, urlDoItem String?,
  urlDaFoto String?, quantidadeComprada Int, precoComprado Decimal(12,4), fator Int @default(1), itemId String?
  (SetNull), pacoteId String? (SetNull), virtualQuantidade Int @default(0), virtualLancadoEm DateTime?, virtualErro
  String?; @@index([pedidoAliExpressId]) @@index([itemId]) @@index([productId, skuId]) }`; `PacoteAliExpress { id,
  pedidoAliExpressId (Cascade), codigo String, codigoOrigem String?, transportadora String?, previsaoTexto String?,
  previsaoInicio DateTime?, previsaoFim DateTime?, ultimoEvento String?, ultimoEventoEm DateTime?, ultimoCodigo
  String?, eventos Json?, atualizadoEm, linhas LinhaAliExpress[]; @@unique([pedidoAliExpressId, codigo]) }`.
- Produces (código): `fornecedorDoAliExpress(db = prisma) -> Promise<{ id, nome, prazoEntregaDias, ativo } | null>`;
  `marcarFornecedorDoAliExpress(fornecedorId) -> Promise<{ ok: true, fornecedor: { id, nome } } | { ok: false, erro }>`.

- [ ] **Passo 1: escrever o teste que falha** (`scripts/teste-aliexpress.js`, cabeçalho igual ao de `teste-compras.js`:
  `dotenv/config`, `register(resolver-alias)`, `conferir`, `falhas`, `prisma` de `@/lib/db`, limpeza de `ZZ-ALI-*`)

```js
console.log("\nFornecedor do AliExpress");
const anterior = await fornecedorDoAliExpress();
const a = await prisma.fornecedor.create({ data: { nome: "ZZ Ali A", estrangeiro: true } });
const b = await prisma.fornecedor.create({ data: { nome: "ZZ Ali B", estrangeiro: true } });
conferir("marcar A", (await marcarFornecedorDoAliExpress(a.id)).ok, true);
conferir("A e o fornecedor do AliExpress", (await fornecedorDoAliExpress())?.id, a.id);
conferir("marcar B desmarca A", [(await marcarFornecedorDoAliExpress(b.id)).ok, (await fornecedorDoAliExpress())?.id], [true, b.id]);
conferir("so um marcado", await prisma.fornecedor.count({ where: { aliexpress: true } }), 1);
conferir("id inexistente recusa", (await marcarFornecedorDoAliExpress("nao-existe")).ok, false);
// devolve a marca de antes (o "Ali" do dono) ou desmarca tudo
if (anterior) await marcarFornecedorDoAliExpress(anterior.id); else await prisma.fornecedor.updateMany({ where: { aliexpress: true }, data: { aliexpress: false } });
await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: "ZZ Ali" } } });
```

- [ ] **Passo 2: rodar e ver falhar**

Run: `npm run teste:aliexpress`
Expected: FALHA (módulo `fornecedor.js` não existe / coluna `aliexpress` não existe)

- [ ] **Passo 3: schema + migration à mão** (`migration.sql`: `ALTER TYPE "Servico" ADD VALUE 'ALIEXPRESS'`; `CREATE TYPE
  "OrigemDoPedidoDeCompra"`; `ALTER TABLE ... ADD COLUMN` com os defaults; as três tabelas com FKs e índices; o índice
  único parcial; e, no fim, a marcação: `UPDATE "Fornecedor" SET "aliexpress" = true WHERE "id" = (SELECT "id" FROM
  "Fornecedor" WHERE lower("nome") = 'ali' ORDER BY "criadoEm" LIMIT 1);` seguido de `INSERT INTO "Fornecedor" ("id",
  "nome", "estrangeiro", "site", "aliexpress", "ativo", "criadoEm", "atualizadoEm") SELECT 'fornecedor-ali',
  'Ali', true, 'https://www.aliexpress.com', true, true, NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC' WHERE NOT
  EXISTS (SELECT 1 FROM "Fornecedor" WHERE "aliexpress" = true);`). Comentário no topo: o índice parcial mora só no SQL
  (o `migrate diff` vai propor apagá-lo; não apagar), como o `Job_fonte_aberta`.

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: migration aplicada; `SELECT nome FROM "Fornecedor" WHERE aliexpress` devolve "Ali" (no PC, o criado pela migration).

- [ ] **Passo 4: implementar `fornecedor.js`** (`marcar` em `prisma.$transaction`: `updateMany` zerando todos, `update` do
  escolhido; `P2025` vira `{ ok: false, erro: "Fornecedor não encontrado." }`).

- [ ] **Passo 5: rodar e ver passar**

Run: `npm run teste:aliexpress`
Expected: 5 ok, 0 falhas

- [ ] **Passo 6: commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261028_compras_aliexpress src/lib/compras/aliexpress/fornecedor.js scripts/teste-aliexpress.js package.json
git commit -m "Compras: tabelas do AliExpress, fator do vinculo e o fornecedor Ali marcado"
```

---

### Tarefa 2: Regras puras do AliExpress

**Files:**
- Create: `src/lib/compras/aliexpress/regras.js` (sem imports)
- Modify: `scripts/teste-aliexpress.js` (bloco "Regras puras", antes do banco)

**Interfaces:**
- Produces: `lerPreco(texto) -> number|null` (só R$; `"R$57,49"`, `"R$ 1.234,56"`; outra moeda ou lixo → null);
  `lerData(texto) -> Date|null` (`"26 out, 2026"` e `"2026-10-26"`; meses jan fev mar abr mai jun jul ago set out nov
  dez; devolve 12:00 UTC do dia); `anuncioDoLink(texto) -> { productId, skuId }|null` (aceita `https://pt.aliexpress.com/item/<id>.html?...`,
  `//www.aliexpress.com/item/<id>.html`, `sku_id=` na query); `codigoDoVinculo(productId, skuId) -> string`
  (`"<productId>:<skuId ou vazio>"`); `situacaoDoAliExpress({ codigo, texto }) -> { aberto, entregue, cancelado,
  aguardandoPagamento }`; `statusNoRise({ situacao, statusAtual, temLancamento }) -> { status, aviso }`;
  `avisosDoPedido({ entregueEm, canceladoNoAliExpressEm, faltaLancar, estoqueLancado, linhasPendentes, virtualErros })
  -> string[]`; `quantidadeNoRise(comprada, fator) -> number`; `precoNoRise(preco, fator) -> number` (4 casas);
  `precoMedioPonderado(linhas: { quantidade, preco }[]) -> number` (4 casas); `descontoImplicito({ produtos, frete,
  imposto, total }) -> number` (2 casas, nunca negativo); `pacoteDaLinha(pacotes, linha) -> string|null` (`pacotes:
  { codigo, itens: { productId, skuId }[] }[]`; o primeiro que contém a linha); `decidirCasamento(candidatos, skuId) ->
  { produtoId } | { ambiguo: string[] } | null` (`candidatos: { produtoId, origem, skuId }[]`; candidato com `skuId`
  diferente do da linha sai; um produto distinto casa, mais de um é ambíguo, nenhum é null); `formatarDataCurta(data)
  -> "dd/mm"`.
- Textos fixos: aviso de cancelado com estoque: `"Cancelado no AliExpress, mas há estoque lançado."`; entregue:
  `"Entregue no AliExpress em dd/mm, falta lançar."`; pendentes: `"N item(ns) sem produto: escolha o produto para
  contar no estoque a caminho."`; Virtual: `"Entrada no depósito Virtual pendente em N item(ns)."`.

- [ ] **Passo 1: escrever os testes que falham**

```js
console.log("\nRegras puras do AliExpress");
conferir("preco", [lerPreco("R$57,49"), lerPreco("R$ 1.234,56"), lerPreco("US $1.00"), lerPreco("")], [57.49, 1234.56, null, null]);
conferir("data", [lerData("26 out, 2026")?.toISOString().slice(0, 10), lerData("2026-10-26")?.toISOString().slice(0, 10), lerData("Hoje")], ["2026-10-26", "2026-10-26", null]);
conferir("anuncio do link", [anuncioDoLink("https://pt.aliexpress.com/item/32814252396.html?spm=a2g0s.9042311"), anuncioDoLink("//www.aliexpress.com/item/1005006891567710.html?sku_id=12000038634693222"), anuncioDoLink("https://loja.x.com/p/1")], [{ productId: "32814252396", skuId: null }, { productId: "1005006891567710", skuId: "12000038634693222" }, null]);
conferir("codigo do vinculo", [codigoDoVinculo("1005006891567710", "12000038634693222"), codigoDoVinculo("1", null)], ["1005006891567710:12000038634693222", "1:"]);
conferir("situacao: enviado parcialmente (7)", situacaoDoAliExpress({ codigo: 7, texto: "Enviado parcialmente" }), { aberto: true, entregue: false, cancelado: false, aguardandoPagamento: false });
conferir("situacao: aguardando a entrega (8)", situacaoDoAliExpress({ codigo: 8, texto: "Aguardando a entrega" }).aberto, true);
conferir("situacao pelo texto", [situacaoDoAliExpress({ codigo: null, texto: "Concluído" }).entregue, situacaoDoAliExpress({ codigo: null, texto: "Pedido fechado" }).cancelado, situacaoDoAliExpress({ codigo: null, texto: "Reembolsado" }).cancelado, situacaoDoAliExpress({ codigo: null, texto: "A ser pago" }).aguardandoPagamento], [true, true, true, true]);
conferir("status no Rise: cancelado sem lancamento", statusNoRise({ situacao: { cancelado: true }, statusAtual: "ENVIADO", temLancamento: false }), { status: "CANCELADO", aviso: null });
conferir("status no Rise: cancelado com lancamento", statusNoRise({ situacao: { cancelado: true }, statusAtual: "PARCIAL", temLancamento: true }), { status: "PARCIAL", aviso: "Cancelado no AliExpress, mas há estoque lançado." });
conferir("status no Rise: entregue nao fecha", statusNoRise({ situacao: { entregue: true }, statusAtual: "ENVIADO", temLancamento: false }), { status: "ENVIADO", aviso: null });
conferir("status no Rise: finalizado fica", statusNoRise({ situacao: { cancelado: true }, statusAtual: "FINALIZADO", temLancamento: true }).status, "FINALIZADO");
conferir("avisos", avisosDoPedido({ entregueEm: new Date("2026-10-27T12:00:00Z"), faltaLancar: 3, linhasPendentes: 2, virtualErros: 1 }), ["Entregue no AliExpress em 27/10, falta lançar.", "2 item(ns) sem produto: escolha o produto para contar no estoque a caminho.", "Entrada no depósito Virtual pendente em 1 item(ns)."]);
conferir("avisos: entregue com tudo lancado nao avisa", avisosDoPedido({ entregueEm: new Date(), faltaLancar: 0, linhasPendentes: 0, virtualErros: 0 }), []);
conferir("fator", [quantidadeNoRise(2, 100), precoNoRise(30, 100), precoNoRise(57.49, 1), precoNoRise(10, 3)], [200, 0.3, 57.49, 3.3333]);
conferir("preco medio ponderado", precoMedioPonderado([{ quantidade: 200, preco: 0.3 }, { quantidade: 100, preco: 0.36 }]), 0.32);
conferir("desconto implicito", [descontoImplicito({ produtos: 229.96, frete: 0.12, imposto: 47.14, total: 277.1 }), descontoImplicito({ produtos: 10, frete: 0, imposto: 0, total: 12 })], [0.12, 0]);
conferir("pacote da linha", [pacoteDaLinha([{ codigo: "NN1", itens: [{ productId: "1", skuId: "2" }] }], { productId: "1", skuId: "2" }), pacoteDaLinha([{ codigo: "NN1", itens: [{ productId: "1", skuId: "2" }] }], { productId: "9", skuId: null })], ["NN1", null]);
conferir("decidir casamento", [decidirCasamento([], null), decidirCasamento([{ produtoId: "p1", origem: "rascunho", skuId: null }], "s1"), decidirCasamento([{ produtoId: "p1", origem: "rascunho", skuId: null }, { produtoId: "p2", origem: "vinculo", skuId: null }], "s1"), decidirCasamento([{ produtoId: "p1", origem: "vinculo", skuId: "outro" }], "s1")], [null, { produtoId: "p1" }, { ambiguo: ["p1", "p2"] }, null]);
```

- [ ] **Passo 2: rodar e ver falhar** — Run: `npm run teste:aliexpress` — Expected: FALHA (import de `regras.js`)
- [ ] **Passo 3: implementar `regras.js`** (texto de situação comparado sem acento e em minúsculas; `cancelado` vence
  `entregue` quando os dois casam).
- [ ] **Passo 4: rodar e ver passar** — Expected: todos ok
- [ ] **Passo 5: commit** — `git add src/lib/compras/aliexpress/regras.js scripts/teste-aliexpress.js` /
  `git commit -m "Compras: regras puras da importacao do AliExpress"`

---

### Tarefa 3: Imposto nos totais do pedido

**Files:**
- Modify: `src/lib/compras/regras.js` (`totaisDoPedido`), `src/lib/compras/banco.js` (`pedidoParaTela` e
  `listarPedidos` passam `imposto`), `src/lib/compras/projecao.js` (`semPrecos` zera `imposto` e `totais.imposto`),
  `src/components/compras/BlocosDoPedido.jsx` (`BlocoTotais`), `src/lib/compras/pdf.js` (`linhasDeTotal`)
- Modify: `scripts/teste-aliexpress.js` (bloco "Totais com imposto")

**Interfaces:**
- Produces: `totaisDoPedido({ itens, icmsSt, descontoTipo, descontoValor, frete, entrada, imposto = 0 })` devolve também
  `imposto` (2 casas) e o soma no `total`. `pedido.imposto` chega à tela em `pedidoParaTela`; o Salvar não o altera
  (não entra em `esquema.js`).

- [ ] **Passo 1: teste** — `conferir("totais com imposto", (({ produtos, imposto, total }) => ({ produtos, imposto, total }))(totaisDoPedido({ itens: [{ quantidade: 4, precoUnitario: 57.49 }], frete: 0.12, imposto: 47.14, descontoTipo: "VALOR", descontoValor: 0.12 })), { produtos: 229.96, imposto: 47.14, total: 277.1 });`
- [ ] **Passo 2: rodar e ver falhar** — Expected: `imposto` undefined, total 230.08
- [ ] **Passo 3: implementar** — `BlocoTotais`: linha "Imposto (AliExpress)" somente leitura, só quando `Number(formulario.imposto) > 0`
  (regra 4: sem dado, some); PDF: `Number(pedido.imposto) > 0 ? ["Imposto", reais(pedido.imposto)] : null` depois do ICMS ST.
- [ ] **Passo 4: rodar** `npm run teste:aliexpress` e `npm run teste:compras` — Expected: todos ok (os 142 de antes continuam)
- [ ] **Passo 5: commit** — `git commit -m "Compras: imposto do AliExpress nos totais do pedido"`

---

### Tarefa 4: Chave da extensão

**Files:**
- Create: `src/lib/compras/aliexpress/chave.js`
- Modify: `scripts/teste-aliexpress.js` (bloco "Chave da extensão")

**Interfaces:**
- Consumes: `salvarConexao`, `lerSegredo`, `lerConexao`, `desconectar` de `@/lib/integracoes/conexoes`;
  `hashDoSegredo` de `@/lib/mcp/oauth.js`; `timingSafeEqual` de `node:crypto`.
- Produces: `gerarChaveDaExtensao() -> Promise<{ chave }>` (`"rise_ali_" + randomBytes(24).toString("base64url")`;
  grava `salvarConexao("ALIEXPRESS", { segredo: hashDoSegredo(chave), status: "CONECTADO", conectadoEm: new Date(),
  escopos: "extensao" })`); `conferirChaveDaExtensao(request) -> Promise<{ ok: true } | { ok: false, status: 401,
  erro: "Chave da extensão ausente ou inválida." }>` (cabeçalho `Authorization: Bearer <chave>`; compara hashes com
  `timingSafeEqual`); `estadoDaChave() -> Promise<{ configurada, conectadoEm, ultimoTesteEm, ultimoTesteOk, ultimoErro }>`.

- [ ] **Passo 1: teste**

```js
console.log("\nChave da extensão");
const tinha = await lerConexao("ALIEXPRESS");
const { chave } = await gerarChaveDaExtensao();
const pedido = (c) => new Request("https://rise.local/api", { headers: c ? { authorization: `Bearer ${c}` } : {} });
conferir("formato", /^rise_ali_[A-Za-z0-9_-]{32}$/.test(chave), true);
conferir("aceita a chave", (await conferirChaveDaExtensao(pedido(chave))).ok, true);
conferir("recusa sem chave e chave errada", [(await conferirChaveDaExtensao(pedido(null))).status, (await conferirChaveDaExtensao(pedido("rise_ali_x"))).status], [401, 401]);
const segunda = (await gerarChaveDaExtensao()).chave;
conferir("gerar de novo invalida a anterior", [(await conferirChaveDaExtensao(pedido(chave))).ok, (await conferirChaveDaExtensao(pedido(segunda))).ok], [false, true]);
conferir("estado", (await estadoDaChave()).configurada, true);
if (!tinha) await desconectar("ALIEXPRESS");
```

- [ ] **Passo 2: rodar e ver falhar** — [ ] **Passo 3: implementar `chave.js`** — [ ] **Passo 4: rodar e ver passar**
- [ ] **Passo 5: commit** — `git commit -m "Compras: chave da extensao do AliExpress (hash na Conexao)"`

---

### Tarefa 5: Esquema do que a extensão manda

**Files:**
- Create: `src/lib/compras/aliexpress/esquema.js`
- Create: `scripts/fixtures/aliexpress/lista.json`, `detalhe.json`, `rastreio.json` (o formato da fase 1 e 2, com
  dois pedidos: 8215244197193461 "Enviado parcialmente" (7) com 1 linha productId 1005006891567710 / skuId
  12000038634693222 / "2M" / qtde 4 / "R$57,49" / total "R$277,10" / loja "Lets Deal Store"; e 8215189636893461
  "Aguardando a entrega" (8) com 2 linhas; detalhe do primeiro: Subtotal "R$ 229,96", Enviando "R$ 0,12", Imposto
  "R$ 47,14", Total "R$ 277,10"; rastreio: pacote NN446506474BR, origem AP00100095481339, "AliExpress Selection
  Standard", previsão "Nov 09 - 18" (1794289253053..1795066853053), 2 eventos, itens [{productId, skuId, quantidade 4}])
- Modify: `scripts/teste-aliexpress.js` (bloco "Esquema")

**Interfaces:**
- Produces: `lerCorpo(json) -> { ok: true, fase: "lista", dados: { pedidos, lidoEm } } | { ok: true, fase: "detalhes",
  dados: { detalhes, rastreios } } | { ok: false, erro }` (zod `safeParse`, chaves desconhecidas descartadas, `erro` =
  caminho + mensagem da primeira falha, ex. `"pedidos.0.orderId: Required"`).
- Formato da fase `lista`: `{ fase: "lista", lidoEm: ISO, pedidos: [{ orderId: /^\d{10,20}$/, dataTexto: ≤40,
  dataIso: ISO|null, statusTexto: ≤80, statusCodigo: int|null, loja: ≤200|null, lojaId: ≤40|null, totalTexto: ≤40,
  moeda: ≤8, linhas: [{ orderLineId: /^\d+$/, productId: /^\d+$/, skuId: /^\d+$/|null, opcao: ≤300|null, titulo:
  ≤500, urlDoItem: ≤500|null, urlDaFoto: ≤500|null, quantidade: int 1..99999, precoTexto: ≤40 }] (1..100) }]
  (≤500) }`. Fase `detalhes`: `{ fase: "detalhes", detalhes: [{ orderId, subtotalTexto, freteTexto, impostoTexto,
  totalTexto }] (≤200), rastreios: [{ orderId, pacotes: [{ codigo: ≤60, codigoOrigem|null, transportadora|null,
  previsaoTexto|null, previsaoInicio: ms|null, previsaoFim: ms|null, eventos: [{ em: ms, descricao: ≤300, nome:
  ≤100|null, codigo: ≤80|null }] (≤30), itens: [{ productId, skuId|null, quantidade: int }] (≤100) }] (≤20) }] (≤200) }`.

- [ ] **Passo 1: teste** — lê as fixtures; `lerCorpo(lista).ok === true` e `fase === "lista"`; `lerCorpo({ ...lista,
  pedidos: [{ ...lista.pedidos[0], orderId: undefined }] }).erro` começa com `"pedidos.0.orderId"`; campo extra
  `destinatario` no pedido não aparece em `dados.pedidos[0]`; `lerCorpo(detalhes).fase === "detalhes"`; 31 eventos → `ok: false`.
- [ ] **Passo 2: rodar e ver falhar** — [ ] **Passo 3: implementar** — [ ] **Passo 4: rodar e ver passar**
- [ ] **Passo 5: commit** — `git commit -m "Compras: esquema do que a extensao do AliExpress manda"`

---

### Tarefa 6: Entrada e saída no depósito Virtual do Bling

**Files:**
- Create: `src/lib/compras/aliexpress/virtual.js`
- Modify: `scripts/teste-aliexpress.js` (bloco "Depósito Virtual", com `criarBlingFalso` e o `noBling` de
  `teste-compras.js`)

**Interfaces:**
- Consumes: `clienteBling()` (`get`, `post`, `exigirEscrita`); o falso de `scripts/lib/blingFalso.js`.
- Produces: `depositoVirtual(cliente) -> Promise<{ id: number } | null>` (`GET /depositos`, descrição "virtual" sem
  caixa); `entradaNoVirtual({ sku, blingId, quantidade, observacao }, { cliente = clienteBling() } = {}) -> Promise<{
  ok: true, depositoId } | { ok: false, erro }>`; `saidaDoVirtual(...)` igual com operação `"S"`. Corpo do `POST
  /estoques`: `{ produto: { id: blingId }, deposito: { id }, operacao, quantidade, observacoes: observacao }`. Sem
  `blingId` → `erro: "Produto sem cadastro no Bling."`; sem depósito → `erro: "Sem depósito Virtual no Bling."`;
  trava fechada → `erro` com a mensagem da trava; Bling ≠ 2xx → `erro` com o motivo.

- [ ] **Passo 1: teste** — `falso = criarBlingFalso({ produtos: [noBling("ZZ-ALI-V1", 15000000911)], codigosLiberados: ["ZZ-ALI-V1"] })`;
  `depositoVirtual(falso)` devolve o id do "Virtual" do falso; `entradaNoVirtual({ sku: "ZZ-ALI-V1", blingId: 15000000911, quantidade: 200, observacao: "AliExpress 1" }, { cliente: falso })` → `ok: true` e o último de `falso.estado.lancamentos` tem `operacao "E"`, `quantidade 200` e o depósito Virtual; `saidaDoVirtual` com 50 → `"S"`; sem `blingId` → `ok: false`; `criarBlingFalso({ ..., codigosLiberados: ["OUTRO"] })` → `ok: false` e nenhum lançamento novo (a trava vem antes).
- [ ] **Passo 2: rodar e ver falhar** — [ ] **Passo 3: implementar** — [ ] **Passo 4: rodar e ver passar**
- [ ] **Passo 5: commit** — `git commit -m "Compras: entrada e saida no deposito Virtual do Bling"`

---

### Tarefa 7: Casamento da linha com o produto

**Files:**
- Create: `src/lib/compras/aliexpress/casamento.js`
- Modify: `scripts/teste-aliexpress.js` (bloco "Casamento": produtos `ZZ-ALI-P1..P5`, fornecedor Ali de teste marcado
  no começo do bloco e devolvido no fim como na Tarefa 1)

**Interfaces:**
- Consumes: `fornecedorDoAliExpress` (T1); `regras.js` (T2); `entradaNoVirtual`/`saidaDoVirtual` (T6).
- Produces: `candidatosDaLinha(tx, { productId, skuId }) -> Promise<{ vinculo: { id, produtoId, fator } | null,
  candidatos: { produtoId, origem: "vinculo"|"rascunho", skuId } [] }>` (regra 1: `ProdutoFornecedor` do fornecedor
  marcado com `codigo = codigoDoVinculo`; regra 2: `ProdutoFornecedor` de qualquer fornecedor com `link` ou
  `descricao` contendo `/item/<productId>`, mais `Produto` com `fornecedorRascunho: { path: ["descricao"],
  string_contains: "/item/<productId>" }`; o `skuId` do candidato vem de `anuncioDoLink`);
  `casarLinha(tx, linhaId, escolha = null) -> Promise<{ ok: true, itemId, produtoId, fator, criouItem }
  | { ok: false, pendente: true, motivo: "sem_produto"|"ambiguo"|"kit", produtos?: string[] }>` (`escolha: { produtoId,
  fator }`; kit = `produto.tipo === "COMPOSICAO"`; item existente do mesmo produto no pedido soma a quantidade e
  recalcula `precoUnitario` por `precoMedioPonderado` de todas as linhas do item; item novo nasce com `quantidade =
  quantidadeNoRise`, `precoUnitario = precoNoRise`, `nomeNoFornecedor = titulo`, `codigoNoFornecedor =
  codigoDoVinculo`, `link = urlDoItem`, `ipiPercentual 0`, `prazoDias` do fornecedor, `ordem` = maior + 1; cria ou
  atualiza o `ProdutoFornecedor` do fornecedor marcado com `codigo`, `link`, `descricao = titulo`, `fator`, e
  `precoFornecedor = precoCusto = precoNoRise` SÓ quando nenhum vínculo do produto tem `precoCusto`; grava `itemId`
  e `fator` na linha. NÃO chama o Bling: o Virtual é de quem chama, depois do commit);
  `casarManual(linhaId, produtoId, fator, { cliente = clienteBling() } = {}) -> Promise<{ ok: true, itemId } | { ok:
  false, erro }>` (valida fator inteiro 1..100000; recusa se o item atual da linha tem `quantidadeLancada > 0`:
  `"Já há estoque lançado deste item: não dá para trocar."`; desfaz o casamento antigo (tira a quantidade do item;
  apaga o item se nenhuma outra linha aponta para ele) e casa com a escolha, tudo numa transação; depois do commit,
  `saidaDoVirtual` do antigo (se `virtualLancadoEm`) e `entradaNoVirtual` do novo, gravando `virtualQuantidade`,
  `virtualLancadoEm` ou `virtualErro` na linha); `desfazerCasamento(linhaId, { cliente }) -> Promise<{ ok } | { ok:
  false, erro }>` (mesma recusa com estoque lançado; saída do Virtual).

- [ ] **Passo 1: teste** (dados: `ZZ-ALI-P1` com vínculo do Ali `codigo "111:222"` e fator 1; `ZZ-ALI-P2` com
  `fornecedorRascunho: { nome: "Ali", descricao: "https://pt.aliexpress.com/item/333.html?spm=x" }`; `ZZ-ALI-P3` e
  `ZZ-ALI-P4` ambos com rascunho `/item/555.html`; `ZZ-ALI-P5` tipo COMPOSICAO com vínculo `codigo "777:"`; um
  `PedidoDeCompra` ENVIADO do Ali com `PedidoAliExpress` e linhas: L1 (111/222, qtde 2, R$ 10), L2 (333/444, qtde 1,
  R$ 30), L3 (555/666), L4 (777/null), L5 (111/222, qtde 3, R$ 12))

```js
conferir("regra 1: codigo do vinculo", (await casarLinha(prisma, L1)).produtoId, P1.id);
conferir("regra 2: rascunho do Bling, um produto", (await casarLinha(prisma, L2)).produtoId, P2.id);
conferir("regra 2 cria o vinculo do Ali com o codigo anuncio:opcao", (await prisma.produtoFornecedor.findFirst({ where: { produtoId: P2.id, fornecedorId: ali.id } }))?.codigo, "333:444");
conferir("regra 2 ambigua fica pendente", (await casarLinha(prisma, L3)), { ok: false, pendente: true, motivo: "ambiguo", produtos: [P3.id, P4.id].sort() });
conferir("kit fica pendente", (await casarLinha(prisma, L4)).motivo, "kit");
conferir("duas linhas no mesmo produto somam no item", (({ quantidade, precoUnitario }) => ({ quantidade, precoUnitario: Number(precoUnitario) }))(await prisma.itemDoPedidoDeCompra.findUnique({ where: { id: (await casarLinha(prisma, L5)).itemId } })), { quantidade: 5, precoUnitario: 11.2 });
conferir("casar manual com fator 100", (({ quantidade, precoUnitario }) => ({ quantidade, precoUnitario: Number(precoUnitario) }))(await prisma.itemDoPedidoDeCompra.findUnique({ where: { id: (await casarManual(L3, P3.id, 100, { cliente: falso })).itemId } })), { quantidade: 100, precoUnitario: 0.3 });
conferir("casar manual grava o vinculo com fator", (await prisma.produtoFornecedor.findFirst({ where: { produtoId: P3.id, fornecedorId: ali.id, codigo: "555:666" } }))?.fator, 100);
conferir("casar manual mandou entrada no Virtual", falso.estado.lancamentos.at(-1)?.operacao, "E");
conferir("trocar o produto tira do antigo e entra no novo", [(await casarManual(L3, P4.id, 100, { cliente: falso })).ok, falso.estado.lancamentos.slice(-2).map((l) => l.operacao)], [true, ["S", "E"]]);
await prisma.itemDoPedidoDeCompra.update({ where: { id: itemDeL1 }, data: { quantidadeLancada: 1 } });
conferir("com estoque lancado nao troca", (await casarManual(L1, P2.id, 1, { cliente: falso })).erro, "Já há estoque lançado deste item: não dá para trocar.");
conferir("custo so em quem nao tinha", [Number((await vinculoAli(P2.id)).precoCusto), (await vinculoAli(P1.id)).precoCusto == null ? null : "mantido"], [30, "mantido"]);
```

- [ ] **Passo 2: rodar e ver falhar** — [ ] **Passo 3: implementar `casamento.js`** — [ ] **Passo 4: rodar e ver passar**
- [ ] **Passo 5: commit** — `git commit -m "Compras: casamento da linha do AliExpress com o produto (anuncio+opcao, fator)"`

---

### Tarefa 8: Importação (fase lista e fase detalhes)

**Files:**
- Create: `src/lib/compras/aliexpress/importacao.js`
- Modify: `scripts/teste-aliexpress.js` (bloco "Importação", usando as fixtures da T5 com os productIds trocados pelos
  dos produtos ZZ)

**Interfaces:**
- Consumes: T1, T2, T6, T7; `proximoNumero(tx)` de `@/lib/compras/banco`; `registrarTeste` de `conexoes`;
  `prisma.logIntegracao`.
- Produces: `estadoDaImportacao() -> Promise<{ lerDesde: ISO, ultimaImportacaoEm: ISO|null, fornecedor: string|null }>`
  (`ultimaImportacaoEm` = `Conexao.ultimoTesteEm` da ALIEXPRESS quando `ultimoTesteOk`; `lerDesde` = ela − 7 dias, ou
  agora − 30 dias); `importarLista({ pedidos, lidoEm }, { cliente = clienteBling() } = {}) -> Promise<{ ok: true,
  novos, atualizados, ignorados, pendentes, virtualPendentes, precisaDetalhe: string[], precisaRastreio: string[],
  avisos: string[] } | { ok: false, erro }>`; `importarDetalhes({ detalhes, rastreios }) -> Promise<{ ok: true,
  detalhados, rastreados, pacotes, avisos }>`; `reenviarAoVirtual(linhaId, { cliente }) -> Promise<{ ok } | { ok:
  false, erro }>`.
- Regras de `importarLista`: tudo sob `prisma.$transaction` com `pg_advisory_xact_lock(hashtext('compras.aliexpress'))`
  (timeout 120 s); sem fornecedor marcado → `{ ok: false, erro: "Marque o fornecedor do AliExpress em Integrações." }`;
  `aguardandoPagamento` e `moeda !== "BRL"` → `ignorados` (+ aviso `"Pedido N em USD ignorado."` para a moeda); pedido
  novo → `PedidoDeCompra { fornecedorId, numero: proximoNumero(tx), status: "ENVIADO", origem: "ALIEXPRESS",
  enviadoEm: dataDoPedido }` + `PedidoAliExpress` + linhas + `casarLinha` em cada; existente → atualiza `statusTexto`,
  `statusCodigo`, `entregueEm` (primeira vez que vem entregue), `canceladoNoAliExpressEm`, aplica `statusNoRise`
  (`temLancamento` = algum item com `quantidadeLancada > 0`; CANCELADO grava `canceladoEm`), cria e casa linhas novas;
  `precisaDetalhe` = `detalheLidoEm` nulo; `precisaRastreio` = não cancelado e (não entregue, ou entregue com
  `rastreioLidoEm` anterior a `entregueEm`), mais novos primeiro; DEPOIS do commit: `entradaNoVirtual` para cada linha
  com `itemId` e `virtualLancadoEm` nulo (observação `"AliExpress <externoId>"`), `saidaDoVirtual` das linhas de
  pedidos que viraram CANCELADO; grava `virtualQuantidade`/`virtualLancadoEm` ou `virtualErro`; uma linha de
  `LogIntegracao` (servico ALIEXPRESS, metodo POST, endpoint `importar/lista`, statusHttp 200, duracaoMs,
  requestResumo `"<n> pedidos"`, responseResumo `"<novos> novos · <atualizados> atualizados · <pendentes> sem produto ·
  <virtualPendentes> sem Virtual"`) e `registrarTeste("ALIEXPRESS", { ok: true, conta: null })`.
- Regras de `importarDetalhes`: por detalhe, `frete = lerPreco(freteTexto) ?? 0`, `imposto = lerPreco(impostoTexto) ??
  0`, `produtos` = soma de `precoComprado × quantidadeComprada` das linhas, `descontoValor = descontoImplicito({
  produtos, frete, imposto, total: totalInformado })` com `descontoTipo "VALOR"` (zero se nada), `detalheLidoEm`; por
  rastreio, upsert de `PacoteAliExpress` por (pedido, codigo) com `ultimoEvento`/`ultimoEventoEm`/`ultimoCodigo` do
  evento mais recente, `eventos` (até 30, mais recentes), previsão; `pacoteId` das linhas por `pacoteDaLinha`;
  `rastreioLidoEm`; log `importar/detalhes`.

- [ ] **Passo 1: teste** — com o Bling falso (`codigosLiberados` = os SKUs ZZ) e os produtos da T7:

```js
const r1 = await importarLista(lista, { cliente: falso });
conferir("primeira importacao", [r1.ok, r1.novos, r1.atualizados, r1.pendentes], [true, 2, 0, 1]);
const pedido = await prisma.pedidoDeCompra.findFirst({ where: { aliexpress: { externoId: "8215244197193461" } }, include: { itens: true, aliexpress: { include: { linhas: true } } } });
conferir("pedido nasce ENVIADO, origem ALIEXPRESS, com numero", [pedido.status, pedido.origem, pedido.numero > 0, pedido.enviadoEm?.toISOString().slice(0, 10)], ["ENVIADO", "ALIEXPRESS", true, "2026-10-26"]);
conferir("linha casada entrou no Virtual", [pedido.aliexpress.linhas[0].virtualQuantidade, pedido.aliexpress.linhas[0].virtualLancadoEm != null], [4, true]);
conferir("precisa detalhe e rastreio dos dois", [r1.precisaDetalhe.length, r1.precisaRastreio.length], [2, 2]);
const r2 = await importarLista(lista, { cliente: falso });
conferir("reimportar nao duplica", [r2.novos, r2.atualizados, await prisma.pedidoAliExpress.count({ where: { externoId: { in: ["8215244197193461", "8215189636893461"] } } })], [0, 2, 2]);
conferir("linha nova em pedido existente", (await importarLista(comLinhaNova, { cliente: falso })).atualizados, 1);  // e a linha nova casou e foi ao Virtual
conferir("pedido em USD e ignorado", (await importarLista(emUsd, { cliente: falso })).ignorados, 1);
conferir("entregue: aviso, status fica", ...);          // statusTexto "Concluído" -> entregueEm gravado, status ENVIADO, avisos do lerPedido com "Entregue no AliExpress"
conferir("entregue com tudo lancado: sem aviso", ...);  // item com quantidadeLancada = quantidade e pedido FINALIZADO -> avisos []
conferir("cancelado sem lancamento vira CANCELADO e sai do Virtual", ...); // ultimo lancamento do falso = "S"
conferir("cancelado com lancamento: fica e avisa", ...);
conferir("Bling recusa a entrada no Virtual", ...);     // falso sem o codigo liberado -> virtualErro preenchido, importacao ok, reenviarAoVirtual depois de liberar -> ok
const d = await importarDetalhes(detalhes);
conferir("detalhe: frete, imposto e desconto implicito", (({ frete, imposto, descontoValor }) => [Number(frete), Number(imposto), Number(descontoValor)])(await prisma.pedidoDeCompra.findUnique({ where: { id: pedido.id } })), [0.12, 47.14, 0.12]);
conferir("rastreio: pacote e linha ligada", [d.pacotes, (await prisma.linhaAliExpress.findUnique({ where: { id: pedido.aliexpress.linhas[0].id }, include: { pacote: true } })).pacote?.codigo], [1, "NN446506474BR"]);
conferir("estado da importacao", typeof (await estadoDaImportacao()).lerDesde, "string");
```

- [ ] **Passo 2: rodar e ver falhar** — [ ] **Passo 3: implementar `importacao.js`** — [ ] **Passo 4: rodar e ver passar**
- [ ] **Passo 5: commit** — `git commit -m "Compras: importacao dos pedidos do AliExpress (lista, detalhes, rastreio, Virtual)"`

---

### Tarefa 8b: Saída do Virtual na chegada (Lançar estoque e Desfazer)

**Files:**
- Modify: `src/lib/compras/lancamento.js` (`lancarEstoqueDoItem` e `desfazerUltimoLancamento`)
- Modify: `scripts/teste-aliexpress.js` (bloco "Chegada", com o Bling falso)

**Interfaces:**
- Consumes: `saidaDoVirtual`/`entradaNoVirtual` (T6); `LinhaAliExpress` do item (`item.linhasAliExpress`, T1).
- Produces: `lancarEstoqueDoItem(itemId, quantidade, { cliente, depositoId })` continua devolvendo o mesmo objeto e, para
  item de pedido `origem ALIEXPRESS`, depois do envio ao Físico manda `saidaDoVirtual` da quantidade lançada (sku e
  `blingId` do produto; observação `"AliExpress <externoId> · chegada"`); o resultado ganha `virtual: { ok, erro? }`.
  Falha do Virtual não desfaz o lançamento: vira aviso âmbar na linha (`virtualErro` da linha com maior quantidade do
  item). `desfazerUltimoLancamento` faz o inverso (`entradaNoVirtual` da quantidade desfeita). Pedido do Rise de sempre
  não muda em nada.

- [ ] **Passo 1: teste** — com o pedido da T8 e o falso liberado: `lancarEstoqueDoItem(itemId, 4, { cliente: falso })` →
  `ok true`, `virtual.ok true` e os dois últimos lançamentos do falso com operações `["B", "S"]` (balanço no Físico,
  saída de 4 no Virtual); `desfazerUltimoLancamento(itemId, { cliente: falso })` → o último é `"E"` de 4; num item de
  pedido do Rise (`origem RISE`, da `teste-compras`) o resultado não tem `virtual`.
- [ ] **Passo 2: rodar e ver falhar** — [ ] **Passo 3: implementar** — [ ] **Passo 4: rodar** `teste:aliexpress` e
  `teste:compras` — Expected: ok
- [ ] **Passo 5: commit** — `git commit -m "Compras: chegada do pedido do AliExpress tira do deposito Virtual"`

---

### Tarefa 9: Rotas da extensão

**Files:**
- Create: `src/app/api/compras/aliexpress/estado/route.js`, `src/app/api/compras/aliexpress/importar/route.js`
- Modify: `scripts/teste-acessos.js` (lista de exceções do guarda estático: as duas rotas, com o comentário "autenticam
  pela chave da extensão, `conferirChaveDaExtensao`; não há sessão")
- Modify: `scripts/teste-aliexpress.js` (bloco "Rotas")

**Interfaces:**
- Produces: `GET /api/compras/aliexpress/estado` → 401 `{ erro }` sem chave; 200 `estadoDaImportacao()`.
  `POST /api/compras/aliexpress/importar` → 401; 413 `{ erro: "Corpo acima de 5 MB." }` (`content-length`); 400 `{
  erro }` (JSON inválido ou `lerCorpo` recusou); 400 `{ erro }` quando a importação devolve `ok: false`; 200 com o
  resultado de `importarLista`/`importarDetalhes`. Ambas `export const dynamic = "force-dynamic"` e `maxDuration = 120`.

- [ ] **Passo 1: teste** — importa `GET`/`POST` das rotas; `(await GET(new Request(url))).status === 401`; com a chave
  gerada na T4 → 200 e `lerDesde` no corpo; `POST` com `"{"` → 400; com `{ fase: "lista", pedidos: [] }` → 200 e
  `novos 0`; com `content-length` 6_000_000 → 413.
- [ ] **Passo 2: rodar e ver falhar** — [ ] **Passo 3: implementar as rotas** — [ ] **Passo 4: rodar**
  `npm run teste:aliexpress` e `npm run teste:acessos` — Expected: ok, e o guarda aceita as duas rotas
- [ ] **Passo 5: commit** — `git commit -m "Compras: rotas /api/compras/aliexpress/estado e /importar"`

---

### Tarefa 10: Acessos, ações e o pedido lido para a tela

**Files:**
- Modify: `src/lib/acessos/recursos.js` (`acao("acao.compras.casarAliExpress", "Casar item do AliExpress com produto",
  "tela.compras.pedidos", "Cria o item do pedido, grava o vínculo anúncio+opção do fornecedor Ali e manda a entrada no
  depósito Virtual do Bling.")`)
- Modify: `src/app/compras/acoes.js` (`casarLinhaAliExpressAcao(linhaId, produtoId, fator)`,
  `desfazerCasamentoAliExpressAcao(linhaId)`, `reenviarAoVirtualAcao(linhaId)`: as três exigem
  `acao.compras.casarAliExpress` executar, no molde de `lancarEstoqueAcao`, e devolvem o resultado da lib)
- Modify: `src/app/integracoes/acoes.js` (`gerarChaveAliExpressAcao()`, `marcarFornecedorAliExpressAcao(fornecedorId)`:
  `tela.integracoes` editar)
- Modify: `src/lib/compras/banco.js` (`INCLUIR_NO_PEDIDO` ganha `aliexpress: { include: { linhas: { include: { pacote:
  true } }, pacotes: true } }`; `pedidoParaTela` devolve `origem`, `imposto` e `aliexpress` (abaixo) e `avisos`;
  `listarPedidos` devolve `origem`, `loja`, `alerta` e busca também por `aliexpress.externoId contains`)
- Modify: `src/lib/compras/projecao.js` (`semPrecos` corta `precoComprado` das linhas pendentes)
- Modify: `scripts/teste-aliexpress.js` (bloco "Leitura para a tela")

**Interfaces:**
- Produces em `pedidoParaTela`: `pedido.aliexpress = { numero: externoId, loja, statusTexto, dataDoPedido, entregueEm,
  canceladoNoAliExpressEm, linkDoPedido: "https://www.aliexpress.com/p/order/detail.html?orderId=<externoId>",
  linkDoRastreio: "https://www.aliexpress.com/p/tracking/index.html?tradeOrderId=<externoId>", linhasPendentes: [{ id,
  titulo, opcao, urlDaFoto, urlDoItem, quantidadeComprada, precoComprado, productId, skuId }], opcaoPorItem: {
  [itemId]: "2M" }, rastreioPorItem: { [itemId]: [{ codigo, transportadora, ultimoEvento, ultimoEventoEm,
  previsaoTexto }] }, virtualPendentes: [{ linhaId, titulo, erro }] } | null`; `pedido.avisos = avisosDoPedido(...)`
  (`faltaLancar` = soma de `faltaLancar(item)`; `estoqueLancado` = algum `quantidadeLancada > 0`).
- Produces em `listarPedidos`: `origem`, `loja`, `alerta: "entregue" | "pendente" | null`.

- [ ] **Passo 1: teste** — `lerPedido(pedido.id)` da T8: `aliexpress.numero`, `linhasPendentes.length === 1`,
  `rastreioPorItem[itemId][0].codigo === "NN446506474BR"`, `avisos` contém o aviso de pendente; `listarPedidos({ busca:
  "8215244197193461" }).linhas[0].origem === "ALIEXPRESS"`; `semPrecos(lido).aliexpress.linhasPendentes[0].precoComprado
  === null`.
- [ ] **Passo 2: rodar e ver falhar** — [ ] **Passo 3: implementar** — [ ] **Passo 4: rodar** `teste:aliexpress`,
  `teste:compras`, `teste:acessos` — Expected: ok (o catálogo de recursos e a semeadura aceitam o recurso novo)
- [ ] **Passo 5: commit** — `git commit -m "Compras: acesso, acoes e leitura do pedido do AliExpress para a tela"`

---

### Tarefa 11: Telas (Integrações, lista e editor do pedido)

Antes de desenhar, a linha da tela: *no pedido do AliExpress o operador vê primeiro o que falta casar e o rastreio de
cada item; a ação principal continua "Lançar estoque"*. No cartão de Integrações: *vê o estado e a última importação; a
ação principal é "Gerar chave da extensão"*. Chamar `frontend-design` com as 10 regras e, no fim,
`ecc:make-interfaces-feel-better`.

**Files:**
- Create: `src/components/integracoes/CartaoAliExpress.jsx` (client; estado da chave, última importação lida da última
  `LogIntegracao` ALIEXPRESS, botão "Gerar chave da extensão" que mostra a chave UMA vez com "Copiar" e o aviso de
  que gerar de novo invalida a anterior, seletor do fornecedor marcado, bolha "Como instalar" com os passos do
  `LEIAME.md`); `src/app/integracoes/page.jsx` renderiza o cartão na grade, depois dos conectores, com os dados lidos no
  servidor (`estadoDaChave`, `fornecedorDoAliExpress`, fornecedores ativos, última importação)
- Modify: `src/components/compras/TabelaPedidos.jsx` (selo "AliExpress" ao lado do fornecedor com a loja no `title`;
  "!" âmbar pelo `alerta`; lixeira desabilitada com `title` "Pedido do AliExpress não se apaga" quando `origem ===
  "ALIEXPRESS"`)
- Create: `src/components/compras/CabecalhoAliExpress.jsx` (nº com link para o pedido no site em outra aba, loja,
  situação no AliExpress, data; os avisos âmbar do pedido com os botões "Reenviar ao Virtual" por linha pendente)
- Create: `src/components/compras/LinhasPendentesAliExpress.jsx` (dentro do bloco de itens, antes dos itens: foto,
  título, opção, quantidade comprada, preço; campos Produto (`BuscaDeItem`) e Fator (padrão 1) e o botão "Casar"
  chamando `casarLinhaAliExpressAcao`; recusa em uma linha)
- Modify: `src/components/compras/BlocoItens.jsx` (prop `aliexpress`: colunas **Opção** e **Rastreio** (código como
  link para `linkDoRastreio`, transportadora, último evento com data curta, previsão) só quando a prop vem; "Trocar
  produto" no menu do item que chama `desfazerCasamentoAliExpressAcao`)
- Modify: `src/components/compras/EditorPedido.jsx` (monta o cabeçalho e passa `aliexpress` ao `BlocoItens`; fornecedor
  fixo; `TrilhaDoStatus` mostra "Comprado no AliExpress" no lugar de "Enviado" quando `origem === "ALIEXPRESS"`)
- Modify: `src/app/compras/pedidos/[id]/page.jsx` (passa `podeCasar = acesso.pode("acao.compras.casarAliExpress", "executar")`)

- [ ] **Passo 1: dados de ensaio** — rodar `npm run teste:aliexpress -- --manter` (flag nova no script: não apaga os ZZ
  no fim) para ter um pedido do AliExpress no banco do PC com linha pendente, item casado e pacote.
- [ ] **Passo 2: implementar as telas** (padrão visual; textos com acento; `BolhaDeAjuda`; nada de parágrafo fixo).
- [ ] **Passo 3: conferir no navegador** (`preview_start` do servidor de desenvolvimento): Integrações mostra o cartão,
  "Gerar chave" mostra e copia; Compras › Pedidos mostra o selo e o "!"; o pedido ZZ abre com o cabeçalho, a linha
  pendente, o "Casar" com fator cria o item (a página recarrega com o item e sem a linha), as colunas Opção e Rastreio
  aparecem, os totais mostram o imposto; o pedido do Rise de sempre não mudou (abrir um PC-* normal). Screenshot das
  duas telas para o relatório ao dono.
- [ ] **Passo 4: limpar** — `npm run teste:aliexpress` (sem `--manter`) apaga os ZZ; `npm run lint` passa.
- [ ] **Passo 5: commit** — `git commit -m "Compras: telas do AliExpress (cartao em Integracoes, selo na lista, cabecalho, pendentes e rastreio no pedido)"`

---

### Tarefa 12: A extensão "Rise AliExpress"

**Files:**
- Create: `extensao-aliexpress/manifest.json`, `leitura.js`, `pagina.js`, `ponte.js`, `fundo.js`, `popup.html`,
  `popup.js`, `icone-128.png`, `LEIAME.md`
- Create: `scripts/teste-extensao-aliexpress.js` (puro, SEM banco; lê `leitura.js` e as fixtures da T5 mais uma
  fixture `scripts/fixtures/aliexpress/resposta-lista.json` com a árvore ultron de dois pedidos como a página devolve:
  `data.pc_om_list_order_<id>.fields` com os campos medidos na spec §3)
- Modify: `package.json` (`"teste:extensao-aliexpress": "node scripts/teste-extensao-aliexpress.js"`)

**Interfaces:**
- `leitura.js` expõe `globalThis.RiseLeitura` (sem `export`, para rodar como content script e no Node):
  `pedidosDaResposta(data) -> { pedidos: Pedido[], hasMore: boolean, pageIndex: number }` (`data` = o `data` da
  resposta de `mtop.aliexpress.trade.buyer.order.list`; `Pedido` no formato da fase lista da T5, com `dataIso` por
  `lerData` reimplementada aqui em JS puro e `moeda` do `currencyCode`); `pedidoDaArvore(no) -> Pedido|null`;
  `detalheDaResposta(data) -> { subtotalTexto, freteTexto, impostoTexto, totalTexto }` (do bloco
  `detail_order_price_block`, pelos títulos "Subtotal", "Enviando", "Imposto" e `totalPrice.value`);
  `rastreioDaResposta(module) -> { pacotes }` (de `trackingDetailLineList`, no formato da fase detalhes, eventos
  limitados a 30 e ordenados do mais recente, itens com `itemId` → `productId`); `devePararDeLer(pedidos, lerDesdeIso)
  -> boolean` (true quando TODOS os pedidos da página têm `dataIso` anterior a `lerDesde`); `limparPedido(pedido) ->
  Pedido` (só as chaves do esquema).
- `manifest.json`: MV3; `content_scripts`: `ponte.js` (ISOLATED, `document_idle`) e `leitura.js` + `pagina.js` com
  `"world": "MAIN"` em `https://www.aliexpress.com/p/order/*`; `background.service_worker: fundo.js`; `action.default_popup:
  popup.html`; `permissions: ["storage", "activeTab"]`; `host_permissions: ["https://www.aliexpress.com/*",
  "https://rise.4hobby.com.br/*", "https://localhost:3000/*"]`.
- Mensagens: popup → `chrome.tabs.sendMessage(tabId, { rise: "ALI", acao: "ler" })` → `ponte.js` repassa por
  `window.postMessage({ rise: "ALI", acao: "ler", lerDesde })` → `pagina.js` (MAIN) responde `{ rise: "ALI", tipo:
  "progresso"|"fase1"|"fase2"|"pronto"|"erro", ... }` → `ponte.js` → `chrome.runtime.sendMessage` → `fundo.js` (faz o
  `fetch` ao Rise com `Authorization: Bearer` da `chrome.storage.local` e devolve as respostas) → popup mostra.
- `pagina.js`: o gancho em `lib.mtop.request` do teste de 28/10 (resposta capturada por `api`); `clicarAba(texto)`
  (elemento folha com o texto exato: "Processando", "Processado", "Ver tudo"); `clicarVerMais()` (último elemento com
  texto exato "Ver mais pedidos", depois de `scrollTo` no fim); `esperarLista(timeoutMs = 15000)`; teto 30 páginas por
  aba; 1,5 a 3 s entre cliques; chamadas diretas `lib.mtop.request({ api: "mtop.aliexpress.trade.buyer.order.detail",
  v: "1.0", type: "GET", data: { tradeOrderId, clientPlatform: "pc", _lang: "pt_BR" } })` e `mtop.ae.ld.querydetail`
  (mesmos `data`), no máximo 80 por clique, 1,5 a 3 s entre elas; recusa com mensagem quando não há `lib.mtop`, quando
  a página não está em português (`document.documentElement.lang` ou o texto "Encomendas" ausente) ou quando o primeiro
  pedido lido não é BRL.
- `LEIAME.md`: instalar por "Carregar sem compactação" em `chrome://extensions` (modo desenvolvedor), colar a chave e o
  endereço no popup, abrir Meus pedidos, clicar "Enviar ao Rise"; o que o resumo significa; o que fazer quando diz "o
  AliExpress mudou".

- [ ] **Passo 1: teste puro** (`scripts/teste-extensao-aliexpress.js`): `pedidosDaResposta(respostaLista.data)` →
  2 pedidos, `hasMore true`, pedido 0 com `orderId "8215244197193461"`, `statusCodigo 7`, `moeda "BRL"`, linha 0 com
  `productId`, `skuId`, `opcao "Cor: 2M"` (nome + texto dos `skuAttrs`), `quantidade 4`, `precoTexto "R$57,49"`,
  `dataIso` começando em `"2026-10-26"`; `limparPedido` não deixa chave fora do esquema; `detalheDaResposta(detalhe.data)`
  → `{ subtotalTexto: "R$ 229,96", freteTexto: "R$ 0,12", impostoTexto: "R$ 47,14", totalTexto: "R$ 277,10" }`;
  `rastreioDaResposta(rastreio.module)` → 1 pacote `NN446506474BR`, 2 eventos (o mais recente primeiro), item com
  `productId "1005006891567710"`; `devePararDeLer` true/false pelo corte; pedido com `currencyCode "USD"` mantém `moeda "USD"`.
- [ ] **Passo 2: rodar e ver falhar** — [ ] **Passo 3: implementar `leitura.js`** — [ ] **Passo 4: rodar e ver passar**
- [ ] **Passo 5: implementar `pagina.js`, `ponte.js`, `fundo.js`, `popup.*`, `manifest.json`, `LEIAME.md`**
- [ ] **Passo 6: ensaio no Chrome do dono (só leitura, como o teste de 28/10):** abrir Meus pedidos pelo
  `claude-in-chrome`, injetar `leitura.js` e as funções de `pagina.js` com o `fetch` ao Rise trocado por um
  `console.log`, rodar o fluxo inteiro e conferir no resultado: abas lidas, páginas, pedidos, pedidos até o corte,
  pedidos que precisariam de detalhe/rastreio. Fechar a aba no fim.
- [ ] **Passo 7: commit** — `git add extensao-aliexpress scripts/teste-extensao-aliexpress.js scripts/fixtures/aliexpress package.json` /
  `git commit -m "Extensao Rise AliExpress: Enviar ao Rise (lista, detalhes e rastreio)"`

---

### Tarefa 13: Documentação, ritual, deploy e roteiro do dono

**Files:**
- Modify: `CLAUDE.md` (linha de Compras na tabela "Estado"; seção nova "AliExpress no Compras (28/10/2026)" no molde
  da de Compras: onde mora, decisões do dono, o que foi visto e não visto; `Rodar` ganha `teste:aliexpress` e
  `teste:extensao-aliexpress` com a contagem de asserções)
- Modify: memória do projeto (`projeto-aliexpress-em-compras.md`): commits, o que subiu, o que falta o dono fazer.

- [ ] **Passo 1: ritual** — `npm run lint`; `npm run teste:aliexpress`, `teste:extensao-aliexpress`, `teste:compras`,
  `teste:acessos`, `teste:extracao`, `teste:coleta`, `teste:cadastros` e, sozinho, `teste:worker` — Expected: todos ok.
- [ ] **Passo 2: commit da documentação** — `git commit -m "CLAUDE.md: AliExpress no Compras"`; `git push`.
- [ ] **Passo 3: deploy na VPS** pelo caminho de sempre (cartão "Servidor VPS" / `deploy-vps.sh`, que aplica a
  migration); conferir no site: Integrações mostra o cartão AliExpress e o fornecedor marcado é o "Ali" da VPS.
- [ ] **Passo 4: roteiro para o dono** (na mensagem final, "O que foi feito" + "Testes que você precisa fazer"):
  instalar a extensão da pasta do projeto, gerar a chave no cartão e colar no popup, abrir Meus pedidos e clicar
  "Enviar ao Rise", conferir o resumo, abrir Compras › Pedidos, casar os itens com "!", abrir o Bling e ver as entradas
  no depósito Virtual, conferir a lista do estoque mínimo (o comprado sumiu), na chegada de uma caixa lançar o
  estoque e ver a saída do Virtual no Bling.
