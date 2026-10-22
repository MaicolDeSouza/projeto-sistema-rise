# Concorrentes do ML pelo catálogo — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** no editor do anúncio do ML, escolher o produto de catálogo e acompanhar os 10 primeiros anúncios dele como
concorrentes do Produto, relidos todo dia pelo worker da VPS, com histórico, foto mensal e avisos de queda.

**Architecture:** três rotas GET do ML (`/products/search`, `/products/{id}/items`, `/users/{id}`) atrás de
`clienteML()`; um módulo puro de leitura (`ml/catalogo.js`), um de banco (`ml/concorrentes.js`) com a rotina de releitura
que a Server Action "Acompanhar"/"Reler" e o worker chamam igual; três tabelas aditivas; um bloco novo na aba Preço e
estoque e uma coluna na lista de anúncios. Nada é escrito no ML nem no Bling.

**Tech Stack:** Next 16 (Server Actions), Prisma 7 + Postgres 17, worker em Node (`scripts/worker-processo.js`), ML falso
em `scripts/lib/mlFalso.js`, teste `npm run teste:anuncios-ml`.

**Spec:** `docs/superpowers/specs/2026-10-21-concorrentes-ml-catalogo-design.md`

## Global Constraints

- Só GET no ML, sempre pelo `cliente` recebido por parâmetro (`clienteML()` ou o ML falso). Nenhuma escrita no ML ou no Bling.
- `TOP_DO_CATALOGO = 10`; até 3 páginas de 50 em `/products/{id}/items`; cache de vendedores de 24 h em memória.
- Histórico só quando preço, preço cheio ou posição mudam; `PosicaoML` só quando posição, total ou menor preço mudam.
- Concorrente que some vira `ausenteDesde`, nunca é apagado; preço `null`/0 do ML não grava histórico.
- Worker: só o normal (`!FONTES && !SO_NO_PC`), fora do `coletaPausada`, de hora em hora, rodando de verdade uma vez
  por dia de São Paulo; nunca lança.
- Migration aditiva, gerada por `migrate diff` e editada à mão (tirar os `DROP INDEX` dos índices que só existem no SQL),
  depois `migrate deploy` e `npx prisma generate`; reiniciar o servidor.
- Texto da tela com acento; identificadores e comentários sem. Janela nova usa `propsDoFundo`. Nada do ML na aba
  Concorrentes do cadastro de Produto.
- Testes: bloco novo em `scripts/teste-anuncios-ml.js`, antes do comentário `// Blocos das tarefas seguintes entram aqui`;
  só produtos `ZZ-ML-*`. Commits com `git commit -F <msg> -- <caminhos>`.

## Review Focus

1. Catálogo em que **todos** os anúncios são do dono (top vazio): o bloco diz "só você está neste catálogo", nada é
   criado, `PosicaoML` grava `posicao` 1 e `total`. (Task 4)
2. O dono com **dois** anúncios no mesmo catálogo (Clássico e Premium): os dois saem do top e a `PosicaoML` guarda a
   **melhor** posição e o `itemId` dela. (Task 3 e 4)
3. **Mesmo vendedor com dois anúncios** no top: o selo "Nº de M no ML" conta o vendedor uma vez, pelo menor preço.
   (Task 7)
4. **429 ou token vencido no meio da rodada diária**: para na hora, loga, `mlConcorrentesRelidosEm` NÃO avança, a hora
   seguinte tenta de novo; o que já foi gravado fica. (Task 5)
5. **Trocar de catálogo** num produto com histórico: os antigos viram ausentes (histórico intacto) e os novos entram;
   `mlCatalogoId` muda numa transação com a marcação. (Task 4)

---

### Task 1: Banco (migration aditiva)

**Files:**
- Modify: `prisma/schema.prisma` (`model Produto`, `model ConfigCanal`, modelos novos no fim da seção de canais)
- Create: `prisma/migrations/20261021_concorrentes_ml/migration.sql`
- Test: `scripts/teste-anuncios-ml.js` (bloco "Concorrentes do ML: banco")

**Interfaces:**
- Produces: `Produto.mlCatalogoId String?`, `Produto.mlCatalogoNome String?`, `Produto.mlConcorrentesVistoEm DateTime?`;
  `ConfigCanal.mlConcorrentesRelidosEm DateTime?`;
  `model ConcorrenteML { id, produtoId (Cascade), itemId, catalogoId, vendedorId String, vendedorApelido String?,
  vendedorReputacao String?, vendedorVendas Int?, vendedorCidade String?, tipoAnuncio String?, freteGratis Boolean
  @default(false), logistica String?, preco Decimal(12,2)?, precoCheio Decimal(12,2)?, posicao Int, totalNoCatalogo Int,
  lidoEm DateTime, ausenteDesde DateTime?, criadoEm @default(now()); @@unique([produtoId, itemId]); @@index([produtoId]) }`;
  `model ConcorrenteMLHistorico { id, concorrenteId (Cascade), preco?, precoCheio?, posicao Int, lidoEm; @@index([concorrenteId, lidoEm]) }`;
  `model PosicaoML { id, produtoId (Cascade), catalogoId, itemId String?, posicao Int?, total Int, menorPreco Decimal?, lidoEm; @@index([produtoId, lidoEm]) }`.

- [ ] **Step 1: Escrever o teste que falha** (no fim de `scripts/teste-anuncios-ml.js`, antes do marcador):

```js
{
  console.log("\nConcorrentes do ML: banco");
  await limpar();
  const p = await prisma.produto.create({ data: { sku: "ZZ-ML-C1", tituloBase: "ZZ catalogo", conferido: true, mlCatalogoId: "MLB44072268", mlCatalogoNome: "Placa Uno" } });
  const c = await prisma.concorrenteML.create({ data: { produtoId: p.id, itemId: "MLB1", catalogoId: "MLB44072268", vendedorId: "141686451", preco: 39.54, posicao: 1, totalNoCatalogo: 9, lidoEm: new Date() } });
  await prisma.concorrenteMLHistorico.create({ data: { concorrenteId: c.id, preco: 39.54, posicao: 1, lidoEm: new Date() } });
  await prisma.posicaoML.create({ data: { produtoId: p.id, catalogoId: "MLB44072268", itemId: "MLB4165084257", posicao: 4, total: 9, menorPreco: 39.54, lidoEm: new Date() } });
  let repetido = false;
  try { await prisma.concorrenteML.create({ data: { produtoId: p.id, itemId: "MLB1", catalogoId: "MLB44072268", vendedorId: "x", posicao: 2, totalNoCatalogo: 9, lidoEm: new Date() } }); } catch (e) { repetido = e.code === "P2002"; }
  conferir("concorrente ML: um por produto e MLB", repetido, true);
  await prisma.produto.delete({ where: { id: p.id } });
  conferir("apagar o produto leva concorrentes, historico e posicao", [await prisma.concorrenteML.count({ where: { produtoId: p.id } }), await prisma.concorrenteMLHistorico.count({ where: { concorrenteId: c.id } }), await prisma.posicaoML.count({ where: { produtoId: p.id } })], [0, 0, 0]);
  conferir("ConfigCanal tem mlConcorrentesRelidosEm", "mlConcorrentesRelidosEm" in (await prisma.configCanal.upsert({ where: { canal: "MERCADO_LIVRE" }, create: { canal: "MERCADO_LIVRE" }, update: {} })), true);
}
```

- [ ] **Step 2: Rodar e ver falhar.** `npm run teste:anuncios-ml > /tmp/t.txt 2>&1; tail -5 /tmp/t.txt` → Expected:
  erro do Prisma "Unknown argument `mlCatalogoId`" (ou `prisma.concorrenteML` undefined).
- [ ] **Step 3: Schema.** As colunas e os três modelos acima. `ConcorrenteML` e `PosicaoML` com `produto Produto
  @relation(..., onDelete: Cascade)` e as listas inversas em `Produto`.
- [ ] **Step 4: Migration.** `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script
  > prisma/migrations/20261021_concorrentes_ml/migration.sql`; abrir e **apagar** qualquer `DROP INDEX` (trigramas,
  `Job_fonte_aberta`, `Anuncio_um_por_produto`, `ProdutoColetado_coletadoEm_idx`, os índices de expressão da busca ampla).
  Conferir que só sobram `ALTER TABLE ... ADD COLUMN` e `CREATE TABLE/INDEX`. `npx prisma migrate deploy && npx prisma generate`.
- [ ] **Step 5: Rodar e ver passar.** Mesmo comando → Expected: as 3 conferências do bloco `ok`, e "Todos os testes de
  anuncios ML OK."
- [ ] **Step 6: Commit.** `git commit -F msg -- prisma/schema.prisma prisma/migrations/20261021_concorrentes_ml scripts/teste-anuncios-ml.js`
  — "feat(ml): tabelas dos concorrentes do ML pelo catalogo".

### Task 2: ML falso com as rotas de catálogo

**Files:**
- Modify: `scripts/lib/mlFalso.js` (cabeçalho das rotas, `PADROES`, `criarMLFalso`, `get`)
- Test: `scripts/teste-anuncios-ml.js` (bloco "Concorrentes do ML: ML falso")

**Interfaces:**
- Produces: opções novas de `criarMLFalso({ catalogos, vendedores })`:
  `catalogos: { [id]: { nome, dominio, fotos: [url], atributos: [{ id, name, value_name }], itens: [{ item_id, seller_id, price, original_price, listing_type_id, shipping: { free_shipping, logistic_type }, condition }] } }`
  e `vendedores: { [id]: { nickname, level_id, power_seller_status, total, city } }`. O objeto devolvido expõe `estado`
  (ao lado de `chamadas`), para o teste montar variações a partir do padrão. Rotas: `GET /products/search`
  (`q`, `limit`, `offset`; casa `q` sem caixa com o nome; devolve `{ keywords, paging: { total, limit, offset }, results: [{ id, catalog_product_id, name, domain_id, attributes, pictures: [{ url }], status: "active" }] }`),
  `GET /products/{id}` (`{ id, name, permalink: "https://www.mercadolivre.com.br/p/{id}", attributes }`, 404 se não existe),
  `GET /products/{id}/items` (`limit`, `offset`; `{ paging: { total, limit, offset }, results }`; **404** quando o
  catálogo não existe OU não tem itens), `GET /users/{id}` (`{ id, nickname, permalink, seller_reputation: { level_id,
  power_seller_status, transactions: { total } }, address: { city } }`, 404 se não existe). Padrão: o catálogo
  `MLB44072268` ("Placa Uno R3 CH340") com 9 itens iguais à medição da spec §2 (seller `212386247` = o `usuarioId`
  padrão do falso, em MLB4191686159 a 49,90) e os vendedores `141686451`, `632377333`, `23631289`, `440060895`,
  `710285816`, `1005224757`; e o catálogo `MLB60092501` sem itens.
- Consumes: `separar`, `resposta`, `naoAchou` já existentes. `falhas` hoje só vale para escrita (`antesDeEscrever`):
  acrescentar a mesma busca no começo de `get` (`metodo: "GET"`), para a Task 5 simular 429.

- [ ] **Step 1: Teste que falha:**

```js
{
  console.log("\nConcorrentes do ML: ML falso");
  const ml = criarMLFalso();
  const busca = await ml.get("/products/search", { status: "active", site_id: "MLB", q: "placa uno", limit: 5 });
  conferir("falso: busca de catalogo acha pelo nome", [busca.status, busca.dados.results.map((r) => r.id)], [200, ["MLB44072268"]]);
  const itens = await ml.get("/products/MLB44072268/items", { limit: 50 });
  conferir("falso: itens do catalogo na ordem", [itens.status, itens.dados.paging.total, itens.dados.results.slice(0, 3).map((i) => i.price)], [200, 9, [39.54, 39.54, 42.99]]);
  conferir("falso: catalogo sem itens da 404", (await ml.get("/products/MLB60092501/items")).status, 404);
  conferir("falso: vendedor", (await ml.get("/users/141686451")).dados.nickname, "ARDU_ROBÓTICA EIRELI");
  conferir("falso: vendedor que nao existe", (await ml.get("/users/1")).status, 404);
  const com429 = criarMLFalso({ falhas: [{ metodo: "GET", caminho: "/products/MLB44072268/items", exato: true, status: 429 }] });
  conferir("falso: falha programada em GET", [(await com429.get("/products/MLB44072268/items")).status, (await com429.get("/products/MLB44072268/items")).status], [429, 200]);
}
```

- [ ] **Step 2: Rodar e ver falhar.** → Expected: `ML falso: GET /products/search nao suportado` (ou status errado).
- [ ] **Step 3: Implementar** as rotas e as opções em `mlFalso.js`; paginação por `limit`/`offset` em `/items`; a falha
  programada em GET responde `resposta(status, { message: "Too many requests" })`.
- [ ] **Step 4: Rodar e ver passar.** → Expected: 6 `ok` novos; os blocos antigos intactos.
- [ ] **Step 5: Commit** — `-- scripts/lib/mlFalso.js scripts/teste-anuncios-ml.js`, "test(ml): ML falso com catalogo, itens e vendedores".

### Task 3: Leitura do catálogo (`ml/catalogo.js`, puro + GET)

**Files:**
- Create: `src/lib/canaisDeVenda/ml/catalogo.js`
- Test: `scripts/teste-anuncios-ml.js` (bloco "Concorrentes do ML: leitura")

**Interfaces:**
- Produces:
  - `export const TOP_DO_CATALOGO = 10;`
  - `buscarCatalogos(cliente, termo, { limite = 10 } = {})` → `Promise<{ id, nome, dominio, foto: string|null, atributosResumo: string[] }[]>`
    (`atributosResumo` = até 3 `"Nome: valor"`, Marca e Modelo primeiro). Termo vazio → `[]` sem chamar o ML. Erro do
    ML → `throw` com `status` e `dados` (exportar `falhou` de `leitura.js` e reusar).
  - `lerConcorrentesDoCatalogo(cliente, catalogoId, { meuSellerId })` → `Promise<{ total: number, itens: ItemDoCatalogo[] }>`,
    `ItemDoCatalogo = { itemId, vendedorId: string, preco: number|null, precoCheio: number|null, tipoAnuncio, freteGratis: boolean, logistica: string|null, condicao, posicao: number (1..n), meu: boolean }`.
    404 → `{ total: 0, itens: [] }`. Lê páginas de 50 até `total` ou 3 páginas. `meu` = `String(seller_id) === String(meuSellerId)`.
  - `topDoCatalogo(itens, n = TOP_DO_CATALOGO)` puro → os `n` primeiros com `meu === false`, na ordem.
  - `minhaPosicao(itens)` puro → `{ posicao: number|null, itemId: string|null, total, menorPreco: number|null }`
    (a melhor posição entre os `meu`; `menorPreco` = menor `preco` > 0 entre os NÃO meus, `null` se não há).
  - `lerVendedores(cliente, ids)` → `Promise<Map<string, { apelido, reputacao, power, vendas: number|null, cidade }>>`,
    cache em memória por id por 24 h (`CACHE_VENDEDOR_MS`); 404 → entrada `{ apelido: null, ... }` também em cache.
    `limparCacheDeVendedores()` exportada para o teste.
  - `textoDaReputacao(levelId)` puro: `"5_green"` → `"verde 5"`, `"3_yellow"` → `"amarelo 3"`, `null` → `"sem reputação"`.
- Consumes: Task 2 (ML falso).

- [ ] **Step 1: Teste que falha:**

```js
{
  console.log("\nConcorrentes do ML: leitura");
  const { buscarCatalogos, lerConcorrentesDoCatalogo, topDoCatalogo, minhaPosicao, lerVendedores, limparCacheDeVendedores, textoDaReputacao, TOP_DO_CATALOGO } = await import("../src/lib/canaisDeVenda/ml/catalogo.js");
  const ml = criarMLFalso();
  conferir("buscarCatalogos: termo vazio nao chama o ML", [await buscarCatalogos(ml, "  "), ml.chamadas.length], [[], 0]);
  const achados = await buscarCatalogos(ml, "placa uno");
  conferir("buscarCatalogos: id, nome e resumo da ficha", [achados[0].id, achados[0].atributosResumo.slice(0, 2)], ["MLB44072268", ["Marca: Deirolab", "Modelo: UNO R3 CH340"]]);
  const lido = await lerConcorrentesDoCatalogo(ml, "MLB44072268", { meuSellerId: "212386247" });
  conferir("lerConcorrentes: total, ordem e posicao", [lido.total, lido.itens.map((i) => i.posicao), lido.itens[0].preco], [9, [1, 2, 3, 4, 5, 6, 7, 8, 9], 39.54]);
  conferir("lerConcorrentes: o meu e marcado", lido.itens.filter((i) => i.meu).map((i) => i.itemId), ["MLB4191686159"]);
  conferir("lerConcorrentes: 404 e lista vazia", await lerConcorrentesDoCatalogo(ml, "MLB60092501", { meuSellerId: "1" }), { total: 0, itens: [] });
  conferir("topDoCatalogo: tira os meus e corta em N", [topDoCatalogo(lido.itens).length, topDoCatalogo(lido.itens).some((i) => i.meu), TOP_DO_CATALOGO], [8, false, 10]);
  conferir("minhaPosicao", minhaPosicao(lido.itens), { posicao: 4, itemId: "MLB4191686159", total: 9, menorPreco: 39.54 });
  conferir("minhaPosicao: sem anuncio meu", minhaPosicao(lido.itens.filter((i) => !i.meu)).posicao, null);
  limparCacheDeVendedores();
  const antes = ml.chamadas.length;
  const v = await lerVendedores(ml, ["141686451", "1"]);
  await lerVendedores(ml, ["141686451"]);
  conferir("lerVendedores: apelido, reputacao e cache", [v.get("141686451").apelido, v.get("141686451").reputacao, v.get("1").apelido, ml.chamadas.length - antes], ["ARDU_ROBÓTICA EIRELI", "5_green", null, 2]);
  conferir("textoDaReputacao", [textoDaReputacao("5_green"), textoDaReputacao("3_yellow"), textoDaReputacao(null)], ["verde 5", "amarelo 3", "sem reputação"]);
  const grande = criarMLFalso({ catalogos: { MLBG: { nome: "Grande", itens: Array.from({ length: 170 }, (_, i) => ({ item_id: `MLBG${i}`, seller_id: 10 + i, price: 10 + i, listing_type_id: "gold_special", shipping: { free_shipping: false } })) } } });
  conferir("lerConcorrentes: para em 3 paginas (150)", (await lerConcorrentesDoCatalogo(grande, "MLBG", { meuSellerId: "0" })).itens.length, 150);
}
```

- [ ] **Step 2: Rodar e ver falhar.** → Expected: `Cannot find module .../ml/catalogo.js`.
- [ ] **Step 3: Implementar** `catalogo.js` com as assinaturas acima.
- [ ] **Step 4: Rodar e ver passar.** → Expected: 11 `ok` novos.
- [ ] **Step 5: Commit** — `-- src/lib/canaisDeVenda/ml/catalogo.js src/lib/canaisDeVenda/ml/leitura.js scripts/teste-anuncios-ml.js`, "feat(ml): leitura do catalogo e dos vendedores".

### Task 4: Banco dos concorrentes e a rotina de releitura por produto (`ml/concorrentes.js`)

**Files:**
- Create: `src/lib/canaisDeVenda/ml/concorrentes.js`
- Create: `src/lib/canaisDeVenda/ml/avisosConcorrentes.js` (puro)
- Test: `scripts/teste-anuncios-ml.js` (bloco "Concorrentes do ML: acompanhar e reler")

**Interfaces:**
- Consumes: Task 3 (`lerConcorrentesDoCatalogo`, `topDoCatalogo`, `minhaPosicao`, `lerVendedores`), `prisma`, `cliente.usuarioId()`.
- Produces (`concorrentes.js`, todas recebem `cliente` quando leem o ML):
  - `acompanharCatalogoML(cliente, produtoId, { catalogoId, catalogoNome })` → `Promise<{ ok, erro?, leitura? }>`.
    Recusa produto inexistente ou não Conferido ("Só produto Conferido acompanha concorrentes no ML."). Numa
    transação: grava `mlCatalogoId/Nome`; se o catálogo mudou, marca `ausenteDesde = agora` em todo `ConcorrenteML` do
    produto que ainda não tinha. Depois chama `relerCatalogoDoProduto`.
  - `relerCatalogoDoProduto(cliente, produtoId, { agora = new Date() } = {})` → `Promise<{ ok, erro?, total, top, novos, mudaram, ausentes, posicao }>`.
    Lê o catálogo e os vendedores, aplica a regra da spec §7.5 (upsert do top, `ausenteDesde` para quem saiu e `null`
    para quem voltou, histórico só se preço/preçoCheio/posição mudaram, `PosicaoML` só se posição/total/menorPreco
    mudaram, preço `null`/0 não grava histórico), tudo numa transação. Erro do ML → `{ ok: false, erro }` sem gravar nada.
  - `pararDeAcompanharML(produtoId)` → zera `mlCatalogoId/Nome`, marca todos como ausentes; nada apagado.
  - `lerConcorrentesML(produtoId)` → `Promise<{ catalogoId, catalogoNome, lidoEm, posicao: PosicaoML|null, concorrentes: [{ ...ConcorrenteML, precoAnterior: number|null }], avisos }>`
    (`precoAnterior` = o penúltimo histórico; `avisos` de `avisosDoML`).
  - `marcarConcorrentesMLVistos(produtoId)` → grava `mlConcorrentesVistoEm = agora`.
- Produces (`avisosConcorrentes.js`, puro, importável pelo navegador):
  - `avisosDoML({ posicoes, concorrentes, vistoEm })` → `[{ tipo: "caiu"|"preco_baixou"|"novo_mais_barato", texto }]`,
    onde `posicoes` = as duas últimas `PosicaoML` (mais recente primeiro) e cada concorrente traz `historico` (os dois
    últimos, mais recente primeiro). Regras: `caiu` quando `posicoes[0].posicao > posicoes[1].posicao` e
    `posicoes[0].lidoEm > vistoEm`; `preco_baixou` quando o último histórico de um concorrente é menor que o anterior e
    depois de `vistoEm`; `novo_mais_barato` quando `posicoes[0].menorPreco < posicoes[1].menorPreco` e nenhum concorrente
    acompanhado tem esse preço. Textos: `"caiu de 2º para 5º"`, `"ARDU_ROBÓTICA EIRELI baixou para R$ 37,90"`,
    `"novo vendedor abaixo do seu preço (R$ 35,00)"`. `vistoEm` `null` = tudo é novidade.

- [ ] **Step 1: Teste que falha** (o ML falso padrão da Task 2 tem `usuarioId()` = `212386247`):

```js
{
  console.log("\nConcorrentes do ML: acompanhar e reler");
  await limpar();
  const { acompanharCatalogoML, relerCatalogoDoProduto, pararDeAcompanharML, lerConcorrentesML, marcarConcorrentesMLVistos } = await import("../src/lib/canaisDeVenda/ml/concorrentes.js");
  const { avisosDoML } = await import("../src/lib/canaisDeVenda/ml/avisosConcorrentes.js");
  const { limparCacheDeVendedores } = await import("../src/lib/canaisDeVenda/ml/catalogo.js");
  limparCacheDeVendedores();
  const ml = criarMLFalso();
  const historicoDe = (produtoId) => prisma.concorrenteMLHistorico.count({ where: { concorrente: { produtoId } } });
  const nao = await prisma.produto.create({ data: { sku: "ZZ-ML-C2", tituloBase: "nao conferido" } });
  conferir("acompanhar recusa produto nao Conferido", (await acompanharCatalogoML(ml, nao.id, { catalogoId: "MLB44072268", catalogoNome: "x" })).erro, "Só produto Conferido acompanha concorrentes no ML.");
  const p = await prisma.produto.create({ data: { sku: "ZZ-ML-C1", tituloBase: "ZZ catalogo", conferido: true } });
  const a = await acompanharCatalogoML(ml, p.id, { catalogoId: "MLB44072268", catalogoNome: "Placa Uno" });
  const salvos = await prisma.concorrenteML.findMany({ where: { produtoId: p.id }, orderBy: { posicao: "asc" } });
  conferir("acompanhar: grava o catalogo e os 8 do top (9 menos o meu)", [a.ok, (await prisma.produto.findUnique({ where: { id: p.id } })).mlCatalogoId, salvos.length, salvos[0].vendedorApelido, salvos[0].posicao, salvos.some((c) => c.itemId === "MLB4191686159")], [true, "MLB44072268", 8, "ARDU_ROBÓTICA EIRELI", 1, false]);
  conferir("acompanhar: primeira posicao do dono", (await prisma.posicaoML.findFirst({ where: { produtoId: p.id } })).posicao, 4);
  conferir("acompanhar: um historico por concorrente", await historicoDe(p.id), 8);
  const r1 = await relerCatalogoDoProduto(ml, p.id);
  conferir("reler sem mudanca: nada novo no historico", [r1.ok, r1.mudaram, r1.novos, await historicoDe(p.id), await prisma.posicaoML.count({ where: { produtoId: p.id } })], [true, 0, 0, 8, 1]);
  // Dois vendedores novos na frente e um antigo fora do catalogo: o dono cai do 4o para o 5o (30, 31, 39.54, 42.99, 49.90).
  const novos = [{ item_id: "MLBNOVO", seller_id: 999, price: 30, listing_type_id: "gold_special", shipping: { free_shipping: true } }, { item_id: "MLBNOVO2", seller_id: 998, price: 31, listing_type_id: "gold_pro", shipping: { free_shipping: false } }];
  const mudou = criarMLFalso({ catalogos: { MLB44072268: { ...ml.estado.catalogos.MLB44072268, itens: [...novos, ...ml.estado.catalogos.MLB44072268.itens.filter((i) => i.item_id !== "MLB5434866561")] } }, vendedores: { 999: { nickname: "NOVATO", level_id: "1_red", total: 3 }, 998: { nickname: "NOVATO 2", level_id: "2_orange", total: 9 } } });
  const r2 = await relerCatalogoDoProduto(mudou, p.id);
  const depois = await prisma.concorrenteML.findMany({ where: { produtoId: p.id } });
  conferir("reler com mudanca: novos entram, ausente marca, posicao do dono cai", [r2.novos, r2.ausentes, depois.find((c) => c.itemId === "MLBNOVO").vendedorApelido, depois.find((c) => c.itemId === "MLB5434866561").ausenteDesde !== null, (await prisma.posicaoML.findFirst({ where: { produtoId: p.id }, orderBy: { lidoEm: "desc" } })).posicao], [2, 1, "NOVATO", true, 5]);
  const historicoAposMudanca = await historicoDe(p.id);
  const tela = await lerConcorrentesML(p.id);
  conferir("lerConcorrentesML: avisos antes de ver", tela.avisos.map((v) => v.tipo).sort(), ["caiu", "novo_mais_barato"]);
  await marcarConcorrentesMLVistos(p.id);
  conferir("depois de visto, sem avisos", (await lerConcorrentesML(p.id)).avisos, []);
  const r3 = await relerCatalogoDoProduto(ml, p.id);
  conferir("reler: quem voltou perde o ausenteDesde", [r3.ok, (await prisma.concorrenteML.findFirst({ where: { produtoId: p.id, itemId: "MLB5434866561" } })).ausenteDesde], [true, null]);
  const historicoAposVolta = await historicoDe(p.id);
  const comErro = criarMLFalso({ falhas: [{ metodo: "GET", caminho: "/products/MLB44072268/items", exato: true, status: 429 }] });
  conferir("reler com 429: erro e nada gravado", [(await relerCatalogoDoProduto(comErro, p.id)).ok, await historicoDe(p.id)], [false, historicoAposVolta]);
  conferir("historico cresceu nas duas releituras com mudanca", historicoAposMudanca > 8 && historicoAposVolta > historicoAposMudanca, true);
  const troca = await acompanharCatalogoML(ml, p.id, { catalogoId: "MLB60092501", catalogoNome: "Outro" });
  conferir("trocar de catalogo: antigos ausentes, catalogo novo sem itens", [troca.ok, await prisma.concorrenteML.count({ where: { produtoId: p.id, ausenteDesde: null } }), (await prisma.produto.findUnique({ where: { id: p.id } })).mlCatalogoId], [true, 0, "MLB60092501"]);
  await pararDeAcompanharML(p.id);
  conferir("parar de acompanhar: zera o catalogo e nao apaga", [(await prisma.produto.findUnique({ where: { id: p.id } })).mlCatalogoId, await prisma.concorrenteML.count({ where: { produtoId: p.id } })], [null, 10]);
  conferir("avisosDoML puro: caiu", avisosDoML({ posicoes: [{ posicao: 5, menorPreco: 39.54, lidoEm: new Date("2026-10-21T12:00:00Z") }, { posicao: 2, menorPreco: 39.54, lidoEm: new Date("2026-10-20T12:00:00Z") }], concorrentes: [], vistoEm: new Date("2026-10-20T13:00:00Z") }), [{ tipo: "caiu", texto: "caiu de 2º para 5º" }]);
}
```

- [ ] **Step 2: Rodar e ver falhar.** → Expected: `Cannot find module .../ml/concorrentes.js`.
- [ ] **Step 3: Implementar** os dois arquivos. A releitura usa `cliente.usuarioId()` para o `meuSellerId`; a
  transação é `prisma.$transaction(async (tx) => ...)`; o `lidoEm` é um só `agora` para a rodada.
- [ ] **Step 4: Rodar e ver passar.** → Expected: todos os `ok`.
- [ ] **Step 5: Commit** — `-- src/lib/canaisDeVenda/ml/concorrentes.js src/lib/canaisDeVenda/ml/avisosConcorrentes.js scripts/teste-anuncios-ml.js`, "feat(ml): acompanhar o catalogo e reler os concorrentes".

### Task 5: Rodada diária no worker

**Files:**
- Create: `src/lib/canaisDeVenda/ml/relerCatalogo.js`
- Modify: `scripts/worker-processo.js` (imports ~l.51-54, constantes ~l.64-77, o laço ~l.449-480)
- Test: `scripts/teste-anuncios-ml.js` (bloco "Concorrentes do ML: rodada diaria")

**Interfaces:**
- Consumes: Task 4 (`relerCatalogoDoProduto`), `dataEmSaoPaulo` de `src/lib/coleta/fotos.js`, `clienteML`.
- Produces: `relerConcorrentesML({ cliente = clienteML(), agora = new Date(), forcar = false, espera = ESPERA_ENTRE_CATALOGOS_MS } = {})` →
  `Promise<{ rodou: boolean, motivo?: string, produtos: number, ok: number, falhas: number, parou?: string }>`.
  Não roda se `ConfigCanal.mlConcorrentesRelidosEm` é do mesmo dia de São Paulo (`motivo: "já rodou hoje"`), salvo
  `forcar`. Percorre os produtos com `mlCatalogoId` em ordem de `id`, `espera` ms entre eles (300 por padrão), e **para**
  no primeiro erro com status 429 ou 401 (`parou` = o texto), sem gravar `mlConcorrentesRelidosEm`; outros erros contam em
  `falhas` e seguem. Ao terminar sem parar, grava `mlConcorrentesRelidosEm = agora`. Nunca lança.

- [ ] **Step 1: Teste que falha:**

```js
{
  console.log("\nConcorrentes do ML: rodada diaria");
  await limpar();
  const { relerConcorrentesML } = await import("../src/lib/canaisDeVenda/ml/relerCatalogo.js");
  const { acompanharCatalogoML } = await import("../src/lib/canaisDeVenda/ml/concorrentes.js");
  await prisma.configCanal.upsert({ where: { canal: "MERCADO_LIVRE" }, create: { canal: "MERCADO_LIVRE" }, update: { mlConcorrentesRelidosEm: null } });
  const ml = criarMLFalso();
  const p1 = await prisma.produto.create({ data: { sku: "ZZ-ML-C1", tituloBase: "um", conferido: true } });
  const p2 = await prisma.produto.create({ data: { sku: "ZZ-ML-C2", tituloBase: "dois", conferido: true } });
  await acompanharCatalogoML(ml, p1.id, { catalogoId: "MLB44072268", catalogoNome: "a" });
  await acompanharCatalogoML(ml, p2.id, { catalogoId: "MLB44072268", catalogoNome: "a" });
  const agora = new Date("2026-10-21T15:00:00Z");
  const r1 = await relerConcorrentesML({ cliente: ml, agora, espera: 0 });
  conferir("rodada: le os produtos acompanhados e grava a data", [r1.rodou, r1.produtos, r1.ok, (await prisma.configCanal.findUnique({ where: { canal: "MERCADO_LIVRE" } })).mlConcorrentesRelidosEm?.toISOString()], [true, 2, 2, agora.toISOString()]);
  conferir("rodada: nao repete no mesmo dia", (await relerConcorrentesML({ cliente: ml, agora: new Date("2026-10-21T23:00:00Z"), espera: 0 })).rodou, false);
  conferir("rodada: dia seguinte roda", (await relerConcorrentesML({ cliente: ml, agora: new Date("2026-10-22T03:30:00Z"), espera: 0 })).rodou, true);
  const com429 = criarMLFalso({ falhas: [{ metodo: "GET", caminho: "/products/MLB44072268/items", exato: true, status: 429 }] });
  const r4 = await relerConcorrentesML({ cliente: com429, agora: new Date("2026-10-23T12:00:00Z"), espera: 0 });
  conferir("rodada: 429 para na hora e nao avanca a data", [r4.rodou, r4.parou !== undefined, r4.ok, (await prisma.configCanal.findUnique({ where: { canal: "MERCADO_LIVRE" } })).mlConcorrentesRelidosEm?.toISOString()], [true, true, 0, "2026-10-22T03:30:00.000Z"]);
  await prisma.configCanal.update({ where: { canal: "MERCADO_LIVRE" }, data: { mlConcorrentesRelidosEm: null } });
}
```

(O `ConfigCanal` real é guardado e restaurado pelo teste já hoje: conferir que o `mlConcorrentesRelidosEm` entra na
restauração, senão zerá-lo no fim como acima.)

- [ ] **Step 2: Rodar e ver falhar.** → Expected: `Cannot find module .../ml/relerCatalogo.js`.
- [ ] **Step 3: Implementar** `relerCatalogo.js` e ligar no worker, no molde do bloco do estoque do Bling
  (`RELER_CONCORRENTES_ML_MS = 60 * 60 * 1000`, `concorrentesRelidosEm = 0`, log `concorrentes do ML: N produto(s), N ok, N falha(s)`
  e `logErro` quando `parou`).
- [ ] **Step 4: Rodar e ver passar.** → Expected: 4 `ok` novos.
- [ ] **Step 5: Commit** — `-- src/lib/canaisDeVenda/ml/relerCatalogo.js scripts/worker-processo.js scripts/teste-anuncios-ml.js`, "feat(ml): rodada diaria dos concorrentes do catalogo no worker".

### Task 6: Foto mensal com os concorrentes do ML

**Files:**
- Modify: `src/lib/coleta/fotos.js:70-108` (`fotografarColeta` ganha um segundo `INSERT`)
- Test: `scripts/teste-fotos.js` (bloco novo, no padrão do arquivo: meses fictícios de 2025 e limpeza)

**Interfaces:**
- Consumes: Task 1 (`ConcorrenteML`).
- Produces: linhas em `FotoMensalColeta` com `fonteId = "mercado-livre-catalogo"`, `fonteNome = "Mercado Livre (catálogo)"`,
  `tipoFonte = CONCORRENTE`, `codigo = itemId`, `nome = "<apelido> · Clássico|Premium"`, `preco`, `tipoPreco NORMAL`,
  `ausente = ausenteDesde IS NOT NULL`, `lidoEm`, `produtoId = ConcorrenteML.id`. Só concorrentes com `ausenteDesde IS NULL`
  OU `lidoEm >= desde` (a mesma janela dos concorrentes de loja). `ON CONFLICT DO NOTHING` (a chave é `produtoId + mes`).

- [ ] **Step 1: Teste que falha** (em `scripts/teste-fotos.js`, no estilo do arquivo): cria um produto `ZZ-FOTO-ML`
  Conferido com um `ConcorrenteML` (preço 39.54, apelido "ARDU", tipo gold_special) e um ausente desde 60 dias;
  `tirarFotoMensal({ agora: <14 de um mês de 2025>, forcar: true })`; conferir que a foto tem 1 linha com
  `fonteNome "Mercado Livre (catálogo)"`, `nome "ARDU · Clássico"`, `preco 39.54`, `tipoPreco "NORMAL"` e que o ausente
  antigo ficou de fora; apagar o produto (Cascade leva o concorrente) e as fotos do mês.
- [ ] **Step 2: Rodar e ver falhar.** `npm run teste:fotos > /tmp/f.txt 2>&1; tail -5 /tmp/f.txt` → Expected: a
  conferência da linha do ML falha (0 linhas).
- [ ] **Step 3: Implementar** o segundo `INSERT` em `fotografarColeta` (SQL cru, `CASE` do tipo pelo `tipoAnuncio`).
- [ ] **Step 4: Rodar e ver passar.** → Expected: `npm run teste:fotos` OK (41 + novas).
- [ ] **Step 5: Commit** — `-- src/lib/coleta/fotos.js scripts/teste-fotos.js`, "feat(ml): concorrentes do catalogo na foto mensal".

### Task 7: Ações e o bloco no editor (aba Preço e estoque)

**Files:**
- Modify: `src/app/canais-de-venda/mercado-livre/acoes.js` (ações novas no fim)
- Create: `src/components/anuncios/ml/ConcorrentesDoML.jsx`
- Modify: `src/components/anuncios/ml/AbaPrecoEstoque.jsx:144` (o bloco entra ANTES de `<CustosDoML .../>`) e o campo
  Preço (selo ao lado do rótulo)
- Modify: `src/components/anuncios/ml/EditorAnuncioML.jsx` (a aba já recebe `rascunho.produtoId` e `rascunho.titulo`; nada a passar a mais se bastar)
- Test: `scripts/teste-anuncios-ml.js` (só a parte pura: `concorrentesParaPosicao`); o resto é conferido no navegador

**Interfaces:**
- Consumes: Tasks 3 e 4.
- Produces (ações, todas conferem Produto Conferido e devolvem `{ ok, erro?, ... }`, sem `revalidatePath`):
  - `buscarCatalogosMLAcao(termo)` → `{ ok, catalogos }`.
  - `preverCatalogoMLAcao(catalogoId)` → `{ ok, total, itens (cada um com `vendedor`: apelido, reputacao, vendas), topIds: string[] }`.
  - `acompanharCatalogoMLAcao(produtoId, { catalogoId, catalogoNome })` → `{ ok, erro?, tela }` (`tela` = `lerConcorrentesML`).
  - `relerConcorrentesMLAcao(produtoId)` → `{ ok, erro?, tela }`.
  - `pararDeAcompanharMLAcao(produtoId)` → `{ ok, tela }`.
  - `lerConcorrentesMLAcao(produtoId)` → `{ ok, tela }` e marca visto (`marcarConcorrentesMLVistos`).
  - `concorrentesParaPosicao(concorrentes)` puro em `avisosConcorrentes.js`: `[{ loja: vendedorApelido ?? "vendedor <id>", preco, indisponivel: ausenteDesde != null }]`
    para `posicaoDePreco(rascunho.preco, ...)`.
- Tela (`ConcorrentesDoML.jsx`, `"use client"`, props `{ produtoId, titulo, preco, alterar }`):
  - Carrega `lerConcorrentesMLAcao` ao montar. Sem catálogo: campo de busca com `titulo`, "Buscar no catálogo", lista
    dos catálogos (foto 40 px, nome, domínio, `atributosResumo`), "Usar este" → `preverCatalogoMLAcao` → prévia com os
    itens (posição, preço, preço cheio riscado, vendedor + `textoDaReputacao` + vendas, Clássico/Premium, frete grátis;
    os `meu` em destaque "você"; os do top com o selo "acompanhado", os demais em cinza) e o botão **Acompanhar este
    catálogo** (→ `acompanharCatalogoMLAcao`).
  - Com catálogo: cabeçalho "Lido em dd/mm HH:mm · N anúncios no catálogo · você é o Nº" (ou "você não está neste
    catálogo" / "só você está neste catálogo"), link do catálogo (`https://www.mercadolivre.com.br/p/<id>`), botões
    **Reler agora**, **Trocar catálogo** (confirmação: "O histórico dos concorrentes do catálogo atual fica guardado
    como ausente.") e o link **Parar de acompanhar**; faixa âmbar com `avisos`; a lista dos concorrentes não ausentes
    com seta vermelha/verde contra `precoAnterior`, e os ausentes num detalhe recolhido "N saíram do top 10".
  - Clicar no preço de um concorrente chama `alterar({ preco })`.
  - Selo: `SeloPosicaoDePreco` com `posicaoDePreco(preco, concorrentesParaPosicao(concorrentes))`, rótulo "no ML",
    ao lado do rótulo "Preço de venda".
  - Erro de ação: texto vermelho no bloco; nunca apaga o que estava na tela.

- [ ] **Step 1: Teste que falha** (puro):

```js
{
  console.log("\nConcorrentes do ML: posicao de preco");
  const { concorrentesParaPosicao } = await import("../src/lib/canaisDeVenda/ml/avisosConcorrentes.js");
  const { posicaoDePreco } = await import("../src/lib/posicaoDePreco.js");
  const lista = concorrentesParaPosicao([
    { vendedorApelido: "A", preco: 39.54, ausenteDesde: null }, { vendedorApelido: "A", preco: 41, ausenteDesde: null },
    { vendedorApelido: null, vendedorId: "7", preco: 55.8, ausenteDesde: null }, { vendedorApelido: "B", preco: 10, ausenteDesde: new Date() },
  ]);
  conferir("posicao no ML: mesmo vendedor conta uma vez, ausente fora", (({ posicao, total }) => [posicao, total])(posicaoDePreco(49.9, lista)), [2, 3]);
  conferir("posicao no ML: vendedor sem apelido", lista[2].loja, "vendedor 7");
}
```

- [ ] **Step 2: Rodar e ver falhar.** → Expected: `concorrentesParaPosicao is not a function`.
- [ ] **Step 3: Implementar** `concorrentesParaPosicao`, as ações e o componente; ligar na aba e no editor.
- [ ] **Step 4: Rodar e ver passar** (`npm run teste:anuncios-ml`) e `npm run lint` → Expected: OK, lint 0.
- [ ] **Step 5: Conferir no navegador** (servidor próprio desta sessão, `preview_start`): abrir o anúncio do 100101 →
  aba Preço e estoque → Buscar no catálogo ("placa uno r3 ch340") → Usar este (MLB44072268) → prévia com 9 anúncios e
  "você" no 4º → Acompanhar → cabeçalho "você é o 4º", 8 concorrentes, selo "Nº de M no ML" ao lado do preço; clicar
  num preço muda o campo; Reler agora não cria histórico; Parar de acompanhar volta ao campo de busca. Depois
  **apagar o acompanhamento de teste** (`pararDeAcompanharML`) e conferir no `LogIntegracao` que só houve GET.
- [ ] **Step 6: Commit** — `-- src/app/canais-de-venda/mercado-livre/acoes.js src/components/anuncios/ml/ConcorrentesDoML.jsx src/components/anuncios/ml/AbaPrecoEstoque.jsx src/components/anuncios/ml/EditorAnuncioML.jsx src/lib/canaisDeVenda/ml/avisosConcorrentes.js scripts/teste-anuncios-ml.js`, "feat(ml): bloco Concorrentes no Mercado Livre no editor".

### Task 8: Coluna na lista de anúncios, docs e memória

**Files:**
- Modify: `src/lib/canaisDeVenda/ml/banco.js:336-400` (`DADOS_DA_LINHA` e `linhaDoAnuncio` ganham `produto.id`; `listarAnunciosML` e `anunciosMLDoProduto` anexam `avisosML: string[]` por produto, lidos de uma vez por `avisosDeVariosProdutos(ids)` em `concorrentes.js`)
- Modify: `src/components/anuncios/ml/TabelaAnunciosML.jsx` (coluna "Concorrência" depois de "No ML": selo âmbar com o primeiro aviso e `title` com todos; "—" sem aviso)
- Modify: `CLAUDE.md` (seção nova "Canais de Venda: Mercado Livre (concorrentes pelo catálogo)" logo após a fase 3, e a linha do `teste:anuncios-ml` em "Rodar" com a contagem nova; "Mercado Livre" em "Conhecimento que custou caro" ganha a nota das 3 rotas medidas)
- Test: `scripts/teste-anuncios-ml.js` (no bloco da Task 4: `listarAnunciosML` traz `avisosML` do produto acompanhado)

**Interfaces:**
- Consumes: Task 4 (`lerConcorrentesML`, `avisosDoML`), Task 7 (`lerConcorrentesMLAcao` já marca visto ao abrir o anúncio).
- Produces: `avisosDeVariosProdutos(produtoIds)` → `Map<produtoId, string[]>` em `concorrentes.js`; linha da lista com `avisosML`.

- [ ] **Step 1: Teste que falha:** no bloco da Task 4, depois de `r2` (quando há avisos): criar um `anuncio` ML do
  produto `p` e conferir `(await listarAnunciosML({ busca: "ZZ-ML-C1" })).linhas[0].avisosML[0]` = `"caiu de 4º para 5º"`;
  depois de `marcarConcorrentesMLVistos`, `avisosML` = `[]`.
- [ ] **Step 2: Rodar e ver falhar.** → Expected: `avisosML` undefined.
- [ ] **Step 3: Implementar** a leitura em lote e a coluna.
- [ ] **Step 4: Rodar e ver passar**; `npm run lint`; conferir a lista no navegador com o produto de teste da Task 7
  acompanhado (depois parar e limpar).
- [ ] **Step 5: CLAUDE.md e memória.** Seção com: as 3 rotas e o que devolvem (spec §2), a regra do top 10, os arquivos,
  o worker, a foto mensal, o que ficou de fora (Opção 2 descartada, sem posição na busca) e a contagem de asserções.
  Memória `projeto-concorrentes-ml-catalogo.md`: pronto, sem deploy.
- [ ] **Step 6: Commit** — `-- src/lib/canaisDeVenda/ml/banco.js src/lib/canaisDeVenda/ml/concorrentes.js src/components/anuncios/ml/TabelaAnunciosML.jsx CLAUDE.md scripts/teste-anuncios-ml.js`, "feat(ml): avisos de concorrencia na lista de anuncios".

### Fim: ritual de fim de sessão

`npm run lint`, `teste:anuncios-ml`, `teste:fotos`, `teste:extracao`, `teste:coleta`, `teste:cadastros`, `teste:worker`
(sozinho); push. **Sem deploy** até o "sobe" do dono (a migration vai no deploy). Roteiro de testes na tela para o dono,
passo a passo, no fim da entrega.
