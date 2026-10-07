# Loja Integrada: anúncio, ícone e sincronização Rise → LI — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Rise passa a ser a origem do conteúdo dos produtos da Loja Integrada: editor por abas em Canais de Venda, ícone com selo e pop-up de diferenças na lista de Produtos, "Cadastrar na LI" e "Sincronizar com a LI" sob travas, com os dados que a NF-e nativa da LI usa.

**Architecture:** Lib pura em `src/lib/canaisDeVenda/li/` (campos, corpo, descrição, SEO, rascunho, validação, estado) lida pela tela, pelas Server Actions e pelo teste; o cliente HTTP do handoff (`src/lib/integracoes/lojaIntegrada/`) fica; a escrita na LI (`envio.js`) recebe o cliente por parâmetro e o teste passa uma LI falsa em memória. O rascunho e o estado moram em `Anuncio` (canal LOJA_INTEGRADA, um por produto); a cópia antes de cada `PUT` vai para `CopiaProdutoCanal`.

**Tech Stack:** Next.js 16.3 (App Router, Server Actions), React 19, Prisma 7 + PostgreSQL 17, zod, Tailwind; testes em Node puro (`scripts/teste-*.js`, `conferir` com `JSON.stringify`), sem rede.

**Spec:** `docs/superpowers/specs/2026-10-06-loja-integrada-design.md` (levantamento: `docs/superpowers/investigacoes/2026-10-06-loja-integrada-levantamento.md`).

## Global Constraints

- JavaScript sem TypeScript; identificadores, comentários e texto de tela em português **sem acento** (`Especificações` e `Documentos` só dentro do HTML que vai para a loja, que é conteúdo do cliente).
- Comentários explicam o porquê. Prefira `Edit` a reescrever arquivo inteiro.
- Preço: sempre o normal, nunca promocional; aqui o Rise **nunca** escreve preço nem estoque na LI (decisão 1 da spec).
- Só Produto **Conferido** vincula, cadastra e sincroniza (decisão 2); conferido **no servidor** em toda ação.
- Travas: `LI_ESCRITA` (geral) e `LI_ESCRITA_CODIGOS` (lista; **vazia libera todos**); `exigirEscrita(sku)` antes da primeira escrita; `tentativas: 1`; cópia antes de cada `PUT`; um envio por produto por processo.
- Campo vazio no Rise nunca apaga nada na LI; lista de categorias vazia no Rise nunca apaga as da LI.
- Limites da LI: SEO título **70**, description **250**; medidas **inteiras em cm** (`Math.ceil`); peso 3 casas; 100 requisições/min (cliente já limita a **90**); listagens paginadas em **100**.
- Slug: minúsculas, sem acento, `[a-z0-9-]`, até **100**; produto já existente mantém o slug da LI; mudança só por `PUT /v1/produto/{id}/alias?replace_main=true`.
- Produto novo na LI nasce **`ativo: false`**.
- Migration só aditiva, SQL editado à mão (tirar os `DROP INDEX` que o `migrate diff` propõe); uma sessão por vez; `npx prisma generate` e reiniciar o servidor depois.
- Ritual antes de commitar: `npm run lint`; `.env`, `certificates/` e `dados/` fora do commit. Commits em português, sem acento no título, terminados com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- O Bling continua escrevendo estoque e preço na LI (canal 203478870): nada aqui toca `produto_preco` nem `produto_estoque`.

## Review Focus

1. **`PUT` do produto inteiro devolvendo chaves só de leitura do `GET`** (`imagens` como objetos, `preco_*`, `estoque_*`, `url`, `seo`): a LI pode recusar ou apagar fotos. Teste em Tarefa 7: `mesclarCorpoLI` remove exatamente `CHAVES_SO_LEITURA` e a LI falsa (Tarefa 10) recusa `PUT` com qualquer uma delas.
2. **SKU que existe na LI como `removido: true` (lixeira)**: cadastrar de novo duplicaria. Teste em Tarefa 11: `buscarNaLI` devolve `situacao: "removido"` e o pop-up diz para restaurar na LI; `cadastrarNaLI` recusa (Tarefa 12).
3. **Descrição com `<`, `&`, aspas e quebra `\r\n`**: tag digitada não pode virar HTML, e a ida e volta (`montarDescricaoLI` → `htmlParaTexto`) tem que dar o mesmo texto, senão o selo "!" nunca apaga. Teste em Tarefa 5.
4. **Marca "Arduino" × "ARDUINO" × "Arduíno"**: criar de novo duplica a marca na loja. Teste em Tarefa 12: `garantirMarca` acha sem caixa e sem acento e não faz `POST`.
5. **Categoria marcada no rascunho que já não existe na LI** (o dono está renovando as categorias): enviar URI morta dá 400 no meio do `PUT`. Teste em Tarefa 12: id ausente da lista ao vivo vira alerta, sai do envio e as da LI ficam.

---

### Task 1: Limpar o handoff e pôr as travas no padrão do projeto

**Files:**
- Delete: `prisma/migrations/20261005_loja_integrada_sync/`, `src/lib/integracoes/lojaIntegrada/importarProdutos.js`, `src/lib/integracoes/lojaIntegrada/webhooks.js`, `src/app/api/integracoes/loja-integrada/webhooks/pedidos/route.js`, `src/app/api/integracoes/loja-integrada/webhooks/produtos/route.js`
- Modify: `prisma/schema.prisma` (remover `VinculoProdutoExterno`, `SincronizacaoIntegracao`, `EventoWebhookIntegracao`, os enums `StatusVinculoExterno`, `StatusSincronizacaoIntegracao`, `StatusEventoWebhook` e a relação `Produto.vinculosExternos`), `src/lib/integracoes/config.js`, `.env.example`, `src/app/integracoes/page.jsx`, `src/lib/integracoes/lojaintegrada.js` (`salvarCredenciais` deixa de guardar `webhookToken`), `scripts/teste-loja-integrada.js` (sair os blocos de importação, linhas ~300-360, e de webhook, ~580-690, e os imports das linhas 29-34 e 50-55)
- Test: `scripts/teste-loja-integrada.js`

**Interfaces:**
- Produces: `config.lojaIntegrada = { personalToken, enabled, dominio }`; `config.appUrlPublica` (string, `""` por padrão, de `APP_URL_PUBLICA`); `config.travas.liEscrita` (de `LI_ESCRITA`), `config.travas.liCodigosLiberados` (de `LI_ESCRITA_CODIGOS` por `separarLista`); `exigirTravaLiberada("LOJA_INTEGRADA")` lê `liEscrita` e cita `LI_ESCRITA` na mensagem.

- [ ] **Step 1: Confirmar que a migration do handoff nunca foi aplicada**

Run: `npx prisma migrate status`
Expected: `20261005_loja_integrada_sync` listada como não aplicada. Se constar como aplicada, PARAR e avisar o dono: o plano muda.

- [ ] **Step 2: Apagar a migration, os módulos e as rotas listados em Delete; tirar do `schema.prisma` os 3 modelos, 3 enums e a relação**

- [ ] **Step 3: Trocar as travas em `config.js`**: `lojaIntegrada` perde `webhookToken`; `travas.liEscrita = lerBooleano("LI_ESCRITA")`, `travas.liCodigosLiberados = separarLista(ler("LI_ESCRITA_CODIGOS"))`; `appUrlPublica: ler("APP_URL_PUBLICA")` na raiz de `config`; `exigirTravaLiberada` mapeia `LOJA_INTEGRADA: ["liEscrita", "LI_ESCRITA"]`. Comentário em `liCodigosLiberados` igual ao do Bling (lista vazia libera todos).

- [ ] **Step 4: `.env.example`**: bloco da LI com `LOJA_INTEGRADA_PERSONAL_TOKEN=`, `LOJA_INTEGRADA_ENABLED=true`, `LI_DOMINIO=`; nas travas `LI_ESCRITA=false` e `LI_ESCRITA_CODIGOS=` (comentário: lista de SKUs liberados, vazia libera todos); `APP_URL_PUBLICA=` (comentário: endereço público do Rise; vazio desliga o bloco de documentos na descrição da LI). No `.env` local: `LOJA_INTEGRADA_WRITE_ENABLED` vira `LI_ESCRITA=false`, entram `LI_ESCRITA_CODIGOS=` e `APP_URL_PUBLICA=`, sai `LOJA_INTEGRADA_WEBHOOK_TOKEN`.

- [ ] **Step 5: `page.jsx` de Integrações**: o texto das travas cita `LI_ESCRITA` e lê `config.travas.liEscrita`.

- [ ] **Step 6: Tirar do teste os blocos de importação e webhook e rodar**

Run: `npx prisma validate && npx prisma generate && npm run teste:loja-integrada`
Expected: `Todos os testes da Loja Integrada OK.` (menos verificações que as 35 de antes).

- [ ] **Step 7: Lint e commit**

Run: `npm run lint`
```bash
git add -A prisma/schema.prisma src/lib/integracoes src/app/integracoes src/components/CartaoConector.jsx .env.example package.json scripts/teste-loja-integrada.js
git commit -m "Loja Integrada: fica o cliente do handoff; saem vinculo externo, importacao e webhooks; travas LI_ESCRITA e LI_ESCRITA_CODIGOS"
```
(`git status` tem que mostrar `prisma/migrations/20261005_loja_integrada_sync/` e `src/app/api/integracoes/` apagados e nenhum arquivo novo fora destes.)

---

### Task 2: Investigação na LI real com o produto `ZZ-TESTE-LI` (com o ok do dono)

**Files:**
- Create (temporário, NÃO commitar, apagar no fim): `scripts/tmp-investigar-li.mjs`
- Modify: `docs/superpowers/investigacoes/2026-10-06-loja-integrada-levantamento.md` (seção 8 vira "8. Medido no produto de teste")

**Interfaces:**
- Consumes: `clienteLojaIntegrada` de `src/lib/integracoes/lojaIntegrada/client.js` (`get`, `post`, `put`); `config.travas.liCodigosLiberados`.
- Produces: as respostas que fixam valores das Tarefas 6, 7, 10 e 11: (a) se `GET /v1/produto?sku=` filtra; (b) se `PUT /v1/produto` grava `icms_origin_code`, `production_type` (texto exato) e `seo_title`/`seo_description`; (c) `CHAVES_SO_LEITURA` (o que o `PUT` recusa ou ignora do corpo do `GET`); (d) `ncm` com/sem pontos, medidas decimais, limite do `nome`; (e) `POST` com `sku` repetido; (f) formato da URI de `POST /v1/marca`; (g) `/alias`; (h) `descricao_completa` preserva `<h2>`, `<ul>`, `<a href>`.

- [ ] **Step 1: Pedir o ok do dono** (AskUserQuestion): "A investigacao cria o produto ZZ-TESTE-LI inativo na Loja Integrada e escreve so nele; ele fica la ate voce apagar. Posso rodar?" Só seguir com "sim". Pedir também que ele confira no painel do Bling o que o canal `Loja_Integrada` (203478870) sincroniza, e anotar a resposta na seção 8.

- [ ] **Step 2: Escrever o script**, que: lê `config` com `register(resolver-alias)`; **recusa rodar** se `JSON.stringify(config.travas.liCodigosLiberados) !== '["ZZ-TESTE-LI"]'` ou `config.travas.liEscrita !== true`; faz as medições (a) a (h) na ordem, imprimindo status e corpo de cada resposta (sem o token), e para na primeira falha inesperada. O `POST` leva `{ sku: "ZZ-TESTE-LI", nome: "ZZ Teste LI (apagar)", tipo: "normal", ativo: false, usado: false, ncm: "8501.10.19", gtin: null, peso: 0.5, altura: 2.5, largura: 12, profundidade: 6, descricao_completa: "<h2>Teste</h2><ul><li>a &amp; b</li></ul><a href=\"https://example.com/x.pdf\">PDF</a>" }`. Para (c): `GET` detalhe → `PUT` com o corpo inteiro do `GET` (mudando só `nome`); se 400, repetir tirando chaves até passar, anotando a lista.

- [ ] **Step 3: Rodar com as travas abertas só no ambiente do processo**

Run (PowerShell): `$env:LI_ESCRITA="true"; $env:LI_ESCRITA_CODIGOS="ZZ-TESTE-LI"; node scripts/tmp-investigar-li.mjs`
Expected: cada medição com `HTTP 2xx` e o valor lido de volta; `.env` continua `LI_ESCRITA=false`.

- [ ] **Step 4: Registrar na seção 8 do levantamento** cada resposta (a)–(h), a lista `CHAVES_SO_LEITURA`, o texto exato de `production_type` aceito e a resposta do dono sobre o canal do Bling. Apagar o script.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/investigacoes/2026-10-06-loja-integrada-levantamento.md
git commit -m "Loja Integrada: medicoes no produto de teste ZZ-TESTE-LI (PUT inteiro, campos fiscais, SEO, slug, marca)"
```

---

### Task 3: Migration `20261006_loja_integrada`: `Produto.tipoProducao` e `CopiaProdutoCanal`

**Files:**
- Create: `prisma/migrations/20261006_loja_integrada/migration.sql`, `scripts/teste-li-sync.js`
- Modify: `prisma/schema.prisma`, `src/lib/fiscal.js`, `src/components/produtos/FormularioProduto.jsx:2834-2843` (aba Tributação, ao lado de Origem), `src/app/produtos/acoes.js:384` (schema do produto), `package.json` (script `teste:li-sync`)
- Test: `scripts/teste-li-sync.js` (bloco "Banco: tipoProducao e CopiaProdutoCanal")

**Interfaces:**
- Produces: `enum TipoProducao { REVENDA FABRICACAO_PROPRIA }`; `Produto.tipoProducao TipoProducao @default(REVENDA)`; `model CopiaProdutoCanal { id, canal Canal, produtoId (Cascade), criadoEm, conteudo Json, alteracoes Json? }` com `@@index([produtoId, canal, criadoEm])` e relação `Produto.copiasDeCanal`; `TIPOS_PRODUCAO` em `fiscal.js` (`[{ valor: "REVENDA", rotulo: "Revenda" }, { valor: "FABRICACAO_PROPRIA", rotulo: "Fabricacao propria" }]`); `teste-li-sync.js` com `conferir`, `limpar()` (apaga `Produto` com SKU `ZZ-LI-*`) e o `try/finally`.

- [ ] **Step 1: Criar `scripts/teste-li-sync.js`** no molde de `teste-bling-sync.js` (cabeçalho, `register`, `conferir`, `limpar`, `try { ... } finally { await limpar(); await prisma.$disconnect(); }`, saída `Todos os testes da sincronizacao com a Loja Integrada OK.` ou `process.exit(1)`), com o primeiro bloco:

```js
console.log("\nBanco: tipoProducao e CopiaProdutoCanal");
await limpar();
const produto = await prisma.produto.create({ data: { sku: "ZZ-LI-1", tituloBase: "Teste LI" } });
conferir("produto novo nasce REVENDA", produto.tipoProducao, "REVENDA");
const fabricado = await prisma.produto.update({ where: { id: produto.id }, data: { tipoProducao: "FABRICACAO_PROPRIA" } });
conferir("aceita FABRICACAO_PROPRIA", fabricado.tipoProducao, "FABRICACAO_PROPRIA");
await prisma.copiaProdutoCanal.create({ data: { canal: "LOJA_INTEGRADA", produtoId: produto.id, conteudo: { nome: "x" }, alteracoes: [{ campo: "nome", de: "x", para: "y" }] } });
conferir("copia por canal gravada", await prisma.copiaProdutoCanal.count({ where: { produtoId: produto.id, canal: "LOJA_INTEGRADA" } }), 1);
await prisma.produto.delete({ where: { id: produto.id } });
conferir("copia sai com o produto (Cascade)", await prisma.copiaProdutoCanal.count({ where: { produtoId: produto.id } }), 0);
```
Adicionar `"teste:li-sync": "node scripts/teste-li-sync.js"` ao `package.json`.

- [ ] **Step 2: Rodar para ver falhar** — Run: `npm run teste:li-sync` — Expected: falha (`tipoProducao` inexistente / `copiaProdutoCanal` undefined).

- [ ] **Step 3: Schema**: enum `TipoProducao`, coluna em `Produto` logo abaixo de `origem` (comentário: "Tipo de producao da NF-e da Loja Integrada; muda o CFOP. Revenda e o caso da loja"), modelo `CopiaProdutoCanal` abaixo de `BlingCopiaProduto` (comentário: "O produto do canal como estava antes de cada sobrescrita; o PUT da LI exige o produto inteiro"), relação `copiasDeCanal CopiaProdutoCanal[]` em `Produto`.

- [ ] **Step 4: Gerar e editar a migration**

Run: `npm run backup` e depois `npx prisma migrate dev --create-only --name loja_integrada`
Editar `migration.sql`: tirar todo `DROP INDEX` (os índices parciais e o de trigramas só existem no SQL) e pôr o cabeçalho explicando. Renomear a pasta para `20261006_loja_integrada` se o Prisma usou outro prefixo.

Run: `npx prisma migrate dev && npx prisma generate`
Expected: migration aplicada; `prisma migrate status` sem pendência.

- [ ] **Step 5: `fiscal.js`** ganha `TIPOS_PRODUCAO`; **`FormularioProduto.jsx`**: `<Selecao nome="tipoProducao" rotulo="Tipo de producao" opcoes={TIPOS_PRODUCAO} inicial={inicial?.tipoProducao ?? "REVENDA"} ajuda="Usado pela nota fiscal da Loja Integrada: revenda ou fabricacao propria (muda o CFOP)." />` ao lado de Origem; **`acoes.js`**: `tipoProducao: z.enum(["REVENDA", "FABRICACAO_PROPRIA"]).default("REVENDA")` no schema, gravado em criar e salvar.

- [ ] **Step 6: Rodar os testes**

Run: `npm run teste:li-sync && npm run teste:cadastros && npm run teste:estoque`
Expected: todos OK.

- [ ] **Step 7: Reiniciar o servidor (`npm run dev`) e conferir no navegador** que a aba Tributação mostra "Tipo de producao" com Revenda marcado num produto existente e que Salvar o grava.

- [ ] **Step 8: Lint e commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261006_loja_integrada src/lib/fiscal.js src/components/produtos/FormularioProduto.jsx src/app/produtos/acoes.js scripts/teste-li-sync.js package.json
git commit -m "Produto: tipo de producao (NF-e da Loja Integrada) e tabela CopiaProdutoCanal"
```

---

### Task 4: `slug.js` e `seo.js` (regras puras)

**Files:**
- Create: `src/lib/canaisDeVenda/li/slug.js`, `src/lib/canaisDeVenda/li/seo.js`
- Test: `scripts/teste-li-sync.js` (bloco "Regras puras: slug e SEO")

**Interfaces:**
- Produces: `LIMITE_DO_SLUG = 100`, `slugDe(texto) -> string` (`""` quando nada sobra), `slugValido(slug) -> boolean` (`/^[a-z0-9]+(-[a-z0-9]+)*$/` e tamanho ≤ 100); `LIMITE_DO_TITULO_SEO = 70`, `LIMITE_DA_DESCRIPTION_SEO = 250`, `cortarNaPalavra(texto, limite) -> string` (corta na última palavra inteira que cabe; palavra única maior que o limite é cortada seca), `tituloSeoPadrao(nome) -> string`, `descriptionPadrao(descricao) -> string` (primeiro parágrafo, espaços colapsados, `cortarNaPalavra(…, 250)`). Sem imports.

- [ ] **Step 1: Testes**

```js
console.log("\nRegras puras: slug e SEO");
conferir("slug sem acento, minusculo, hifens", slugDe("CLP FX3U-24MR  14 Entradas / Relé RS232"), "clp-fx3u-24mr-14-entradas-rele-rs232");
conferir("slug de so simbolos e vazio", slugDe("!!! ???"), "");
conferir("slug corta em 100 sem hifen no fim", slugDe("a".repeat(99) + " bcd").length <= 100 && !slugDe("a".repeat(99) + " bcd").endsWith("-"), true);
conferir("slugValido aceita", slugValido("kit-reducao-5-1"), true);
conferir("slugValido recusa maiuscula, acento, barra, hifen duplo", [slugValido("Kit"), slugValido("ré"), slugValido("a/b"), slugValido("a--b")], [false, false, false, false]);
conferir("corta na palavra", cortarNaPalavra("Fonte chaveada 12V 5A bivolt", 18), "Fonte chaveada 12V");
conferir("palavra unica maior que o limite corta seca", cortarNaPalavra("abcdefghij", 4), "abcd");
conferir("titulo SEO padrao <= 70", tituloSeoPadrao("x".repeat(60) + " " + "y".repeat(20)), "x".repeat(60));
conferir("description padrao = primeiro paragrafo colapsado", descriptionPadrao("Linha  1\ncontinua\n\nSegundo paragrafo"), "Linha 1 continua");
conferir("description padrao <= 250", descriptionPadrao("palavra ".repeat(60)).length <= 250, true);
```

- [ ] **Step 2: Rodar para ver falhar** — Run: `npm run teste:li-sync` — Expected: falha por módulo ausente.

- [ ] **Step 3: Implementar `slug.js` e `seo.js`** com as assinaturas acima (`slugDe`: NFD, tira marcas `\p{M}`, minúsculas, `[^a-z0-9]+` → `-`, apara `-` nas pontas, corta em 100 e apara de novo).

- [ ] **Step 4: Rodar** — Run: `npm run teste:li-sync` — Expected: OK.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canaisDeVenda/li/slug.js src/lib/canaisDeVenda/li/seo.js scripts/teste-li-sync.js
git commit -m "Loja Integrada: slug e padroes de SEO (regras puras)"
```

---

### Task 5: `descricao.js`: o HTML da descrição

**Files:**
- Create: `src/lib/canaisDeVenda/li/descricao.js`
- Test: `scripts/teste-li-sync.js` (bloco "Regras puras: descricao HTML")

**Interfaces:**
- Produces: `textoParaHtmlLI(texto) -> string` (escapa `& < > " '` como `textoParaHtml` do Bling; `\r\n`/`\r` = uma quebra; 2+ quebras separam `<p>`; quebra simples vira `<br>`; vazio → `""`); `blocoEspecificacoes(produto) -> string` (`<h2>Especificações</h2><ul>` com `Marca`, `Modelo`, `GTIN`, `Peso` (`0,500 kg`), `Medidas` (`C x L x A cm`, só com as 3), `Garantia` (`N meses`), `Homologação` — só os preenchidos; nenhum → `""`); `blocoDocumentos(documentos) -> string` (`<h2>Documentos</h2><ul><li><a href="URL">NOME</a></li>` com href e nome escapados; lista vazia → `""`); `montarDescricaoLI({ descricao, especificacoes, produto, documentos, frases }) -> string` (texto + especificações se `especificacoes` + documentos + frases, cada frase um `<p>`; blocos vazios não deixam nada). Sem imports (o navegador importa, na prévia).
- `produto` aqui é o contexto `{ marca, modelo, ean, pesoKg, alturaCm, larguraCm, comprimentoCm, garantiaMeses, numeroHomologacao }`; `documentos` é `[{ url, nome }]`.

- [ ] **Step 1: Testes** (importar `htmlParaTexto` de `../src/lib/integracoes/normalizacao.js` para a ida e volta)

```js
console.log("\nRegras puras: descricao HTML");
conferir("escapa tag e e-comercial", textoParaHtmlLI("a <b> & c"), "<p>a &lt;b&gt; &amp; c</p>");
conferir("quebra simples vira br, dupla vira paragrafo, \\r\\n vale um", textoParaHtmlLI("l1\r\nl2\r\n\r\nl3"), "<p>l1<br>l2</p><p>l3</p>");
conferir("vazio nao gera paragrafo", textoParaHtmlLI("  \n "), "");
const prod = { marca: "ARDUINO", modelo: "UNO R3", ean: "7891234567890", pesoKg: 0.5, alturaCm: 2, larguraCm: 12, comprimentoCm: 6, garantiaMeses: 3, numeroHomologacao: null };
conferir("especificacoes so com os preenchidos", blocoEspecificacoes(prod), "<h2>Especificações</h2><ul><li>Marca: ARDUINO</li><li>Modelo: UNO R3</li><li>GTIN: 7891234567890</li><li>Peso: 0,500 kg</li><li>Medidas: 6 x 12 x 2 cm</li><li>Garantia: 3 meses</li></ul>");
conferir("especificacoes vazias nao geram bloco", blocoEspecificacoes({}), "");
conferir("documentos com nome escapado", blocoDocumentos([{ url: "https://x/y.pdf?v=2", nome: "Manual <v2>.pdf" }]), "<h2>Documentos</h2><ul><li><a href=\"https://x/y.pdf?v=2\">Manual &lt;v2&gt;.pdf</a></li></ul>");
conferir("sem documentos nao ha bloco", blocoDocumentos([]), "");
const html = montarDescricaoLI({ descricao: "Texto & tal", especificacoes: false, produto: prod, documentos: [], frases: ["Com nota fiscal", ""] });
conferir("descricao final: texto e frases", html, "<p>Texto &amp; tal</p><p>Com nota fiscal</p>");
conferir("ida e volta pelo htmlParaTexto", htmlParaTexto(montarDescricaoLI({ descricao: "a <b>\nc\n\nd", especificacoes: false, produto: {}, documentos: [], frases: [] })), "a <b>\nc\n\nd");
```

- [ ] **Step 2: Rodar para ver falhar** — Run: `npm run teste:li-sync`.

- [ ] **Step 3: Implementar `descricao.js`** (peso com `Intl.NumberFormat("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })`; medidas com até 2 casas, sem zeros à direita).

- [ ] **Step 4: Rodar** — Expected: OK. **Step 5: Commit** `git commit -m "Loja Integrada: HTML da descricao (texto, especificacoes, documentos, frases)"`.

---

### Task 6: `campos.js`: normalização, assinatura e diferenças

**Files:**
- Create: `src/lib/canaisDeVenda/li/campos.js`
- Modify: `src/lib/integracoes/lojaIntegrada/normalizadores.js` (`normalizarProdutoLojaIntegrada` ganha `apelido`, `destaque`, `videoUrl: textoOuNulo(produto.url_video_youtube)`, `origem: textoOuNulo(produto.icms_origin_code)`, `tipoProducao: textoOuNulo(produto.production_type)`, `seo: { title: textoOuNulo(produto.seo_title), description: textoOuNulo(produto.seo_description) }`, `tags`)
- Test: `scripts/teste-li-sync.js` (bloco "Regras puras: campos, assinatura e diferencas"); `scripts/teste-loja-integrada.js` (normalizador com os campos novos)

**Interfaces:**
- Produces: `CAMPOS_DE_ENVIO_LI = [{ id, rotulo }]` na ordem: `nome`, `slug`, `descricao`, `ncm`, `gtin`, `mpn`, `peso`, `altura`, `largura`, `comprimento`, `marca`, `categorias`, `video`, `destaque`, `origem`, `tipoProducao`, `seoTitulo`, `seoDescription`; `normalizarDoRiseLI(produto, rascunho, { frases, documentos }) -> objeto` (uma chave por id: `nome` = `rascunho.titulo` aparado; `slug` = `rascunho.slug`; `descricao` = `htmlParaTexto(montarDescricaoLI(...))`; `ncm` só dígitos; `gtin` = `produto.ean`; `mpn` = `produto.modelo`; `peso` 3 casas positivo; medidas `Math.ceil` positivo; `marca` = `rascunho.marca` em maiúsculas; `categorias` = ids em texto, ordenados, sem repetição; `video`; `destaque` boolean; `origem` inteiro ou null; `tipoProducao` `"REVENDA"|"FABRICACAO_PROPRIA"|null`; `seoTitulo`/`seoDescription` aparados, cortados em 70/250 por `cortarNaPalavra`, vazio = null); `normalizarDaLI(produtoLI, seo, { marcaNome }) -> mesmo formato` (`produtoLI` = JSON cru do detalhe; `seo` = JSON de `/v1/seo/{id}` ou null, com fallback em `seo_title`/`seo_description`; `tipoProducao` de `production_type` por `TIPO_PRODUCAO_DA_LI` (texto sem acento e sem caixa → enum); `origem` de `icms_origin_code`; `categorias` dos ids das URIs; `slug` = `apelido` sem a barra inicial); `assinaturaLI(campos) -> string` (SHA-256 hex, chaves na ordem de `CAMPOS_DE_ENVIO_LI`); `diferencasLI(rise, li) -> [{ campo, rotulo, rise, li, tipo: "diferente"|"vazioNoRise" }]` (vazio = null, `""` ou `[]`; arrays comparadas por `JSON.stringify`); `contarDivergencias(lista)`; `TIPO_PRODUCAO_DA_LI` e `TEXTO_DO_TIPO_PRODUCAO` (enum → texto exato medido na Tarefa 2). `campos.js` importa `node:crypto`: só servidor.

- [ ] **Step 1: Testes**

```js
console.log("\nRegras puras: campos, assinatura e diferencas");
const produtoRise = { tituloBase: "x", ncm: "8537.10.20", ean: "7894972605270", modelo: "FX3U", pesoKg: "0.5", alturaCm: "2.3", larguraCm: "12", comprimentoCm: "6.01", origem: 0, tipoProducao: "REVENDA" };
const rasc = { titulo: " CLP FX3U ", slug: "clp-fx3u", descricao: "Texto", marca: "Mitsubishi", categorias: ["23983023", "5946305", "23983023"], destaque: false, videoUrl: null, seo: { title: "t".repeat(80), description: "" }, especificacoes: false };
const rise = normalizarDoRiseLI(produtoRise, rasc, { frases: [], documentos: [] });
conferir("rise normalizado", rise, { nome: "CLP FX3U", slug: "clp-fx3u", descricao: "Texto", ncm: "85371020", gtin: "7894972605270", mpn: "FX3U", peso: 0.5, altura: 3, largura: 12, comprimento: 7, marca: "MITSUBISHI", categorias: ["23983023", "5946305"], video: null, destaque: false, origem: 0, tipoProducao: "REVENDA", seoTitulo: "t".repeat(70), seoDescription: null });
const produtoLI = { id: 1, nome: "CLP FX3U", apelido: "/clp-fx3u", descricao_completa: "<p>Texto</p>", ncm: "8537.10.20", gtin: "7894972605270", mpn: "FX3U", peso: "0.500", altura: 3, largura: 12, profundidade: 7, marca: "/api/v1/marca/16306688", categorias: ["/api/v1/categoria/5946305", "/api/v1/categoria/23983023"], url_video_youtube: null, destaque: false, icms_origin_code: "0", production_type: TEXTO_DO_TIPO_PRODUCAO.REVENDA, seo_title: "", seo_description: "" };
const li = normalizarDaLI(produtoLI, { title: "t".repeat(70), description: "" }, { marcaNome: "Mitsubishi" });
conferir("LI normalizada igual ao Rise", li, rise);
conferir("assinatura estavel e igual", assinaturaLI(rise) === assinaturaLI(li) && assinaturaLI(rise).length === 64, true);
conferir("sem diferencas", diferencasLI(rise, li), []);
const semMarca = normalizarDaLI({ ...produtoLI, marca: null, ncm: "", categorias: [] }, null, { marcaNome: null });
conferir("diferencas: ncm, marca e categorias (so no Rise)", diferencasLI(rise, semMarca).map((d) => [d.campo, d.tipo]), [["ncm", "diferente"], ["marca", "diferente"], ["categorias", "diferente"]]);
conferir("vazio no Rise nao e divergencia", contarDivergencias(diferencasLI({ ...rise, ncm: null, categorias: [] }, li)), 0);
conferir("tipo de producao da LI sem acento e caixa", normalizarDaLI({ ...produtoLI, production_type: "fabricacao PROPRIA" }, null, {}).tipoProducao, "FABRICACAO_PROPRIA");
conferir("origem ausente e null, nao 0", normalizarDaLI({ ...produtoLI, icms_origin_code: null }, null, {}).origem, null);
```

- [ ] **Step 2: Rodar para ver falhar.** **Step 3: Implementar** `campos.js` e os campos novos em `normalizadores.js` (acrescentar ao `teste-loja-integrada.js` uma conferência de que `normalizarProdutoLojaIntegrada` devolve `origem`, `tipoProducao`, `seo`, `apelido`, `destaque`, `videoUrl`).

- [ ] **Step 4: Rodar** — Run: `npm run teste:li-sync && npm run teste:loja-integrada` — Expected: OK.

- [ ] **Step 5: Commit** `git commit -m "Loja Integrada: campos de envio, normalizacao dos dois lados, assinatura e diferencas"`.

---

### Task 7: `corpo.js`: o `POST` de cadastro e a mesclagem do `PUT`

**Files:**
- Create: `src/lib/canaisDeVenda/li/corpo.js`
- Test: `scripts/teste-li-sync.js` (bloco "Regras puras: corpo do cadastro e mesclagem do PUT")

**Interfaces:**
- Consumes: `TEXTO_DO_TIPO_PRODUCAO` (Tarefa 6); `CHAVES_SO_LEITURA` medidas na Tarefa 2.
- Produces: `CHAVES_SO_LEITURA` (Set; no mínimo `id`, `resource_uri`, `url`, `seo`, `data_criacao`, `data_modificacao`, `imagem_principal`, `imagens`, `variacoes`, `grades`, `filhos`, `preco_cheio`, `preco_promocional`, `preco_custo`, `preco_sob_consulta`, `estoque_gerenciado`, `estoque_quantidade`, `estoque_situacao_em_estoque`, `estoque_situacao_sem_estoque`, `produto_id_anymarket`, `produto_id_sku_anymarket`, `tags`, `seo_title`, `seo_description`; ajustar pelo medido); `montarCorpoDeCadastroLI({ sku, rise, descricaoHtml, marcaUri, categoriasUris }) -> objeto` (`sku`, `nome`, `apelido` = slug, `descricao_completa`, `tipo: "normal"`, `ativo: false`, `usado: false`, `destaque`, `ncm`, `gtin`, `mpn`, `peso`, `altura`, `largura`, `profundidade`, `url_video_youtube`, `icms_origin_code` (texto), `production_type` (texto), `marca` (URI), `categorias` (URIs); chave com valor null fica de fora; `categorias` vazia fica de fora); `mesclarCorpoLI(produtoLI, rise, camposAlterados, { descricaoHtml, marcaUri, categoriasUris }) -> objeto` (cópia do `produtoLI` sem `CHAVES_SO_LEITURA`, com os campos alterados trocados pelo valor do Rise — `slug` NUNCA (vai por `/alias`), `seoTitulo`/`seoDescription` NUNCA (vão por `/v1/seo`); `categorias` só se alterado e não vazio; campo alterado com valor vazio no Rise não entra). Não muda `produtoLI`.

- [ ] **Step 1: Testes**

```js
console.log("\nRegras puras: corpo do cadastro e mesclagem do PUT");
const corpoPost = montarCorpoDeCadastroLI({ sku: "ZZ-LI-2", rise, descricaoHtml: "<p>Texto</p>", marcaUri: "/api/v1/marca/1", categoriasUris: ["/api/v1/categoria/5946305"] });
conferir("POST: inativo, normal, slug em apelido, fiscal em texto", [corpoPost.ativo, corpoPost.tipo, corpoPost.apelido, corpoPost.icms_origin_code, corpoPost.production_type, corpoPost.ncm, corpoPost.altura], [false, "normal", "clp-fx3u", "0", TEXTO_DO_TIPO_PRODUCAO.REVENDA, "85371020", 3]);
conferir("POST: sem chave nula", "url_video_youtube" in corpoPost, false);
const put = mesclarCorpoLI(produtoLI, { ...rise, nome: "Novo", slug: "outro", seoTitulo: "S" }, ["nome", "slug", "seoTitulo"], { descricaoHtml: "<p>Texto</p>", marcaUri: "/api/v1/marca/16306688", categoriasUris: [] });
conferir("PUT: troca so o nome; slug e SEO nao entram", [put.nome, put.apelido, "seo_title" in put], ["Novo", "/clp-fx3u", false]);
conferir("PUT: sem chaves so de leitura", [...CHAVES_SO_LEITURA].some((chave) => chave in put), false);
conferir("PUT: categorias vazias no Rise mantem as da LI", mesclarCorpoLI(produtoLI, { ...rise, categorias: [] }, ["categorias"], { descricaoHtml: "", marcaUri: null, categoriasUris: [] }).categorias, produtoLI.categorias);
conferir("PUT: nao altera o original", produtoLI.nome, "CLP FX3U");
```

- [ ] **Step 2: Rodar para ver falhar.** **Step 3: Implementar `corpo.js`.** **Step 4: Rodar** — Expected: OK.

- [ ] **Step 5: Commit** `git commit -m "Loja Integrada: corpo do POST de cadastro e mesclagem do PUT inteiro"`.

---

### Task 8: `rascunho.js`, `esquema.js` e `validacao.js`

**Files:**
- Create: `src/lib/canaisDeVenda/li/rascunho.js`, `src/lib/canaisDeVenda/li/esquema.js`, `src/lib/canaisDeVenda/li/validacao.js`
- Test: `scripts/teste-li-sync.js` (bloco "Regras puras: rascunho, esquema e validacao")

**Interfaces:**
- Consumes: `slugDe`, `slugValido`, `tituloSeoPadrao`, `descriptionPadrao` (Tarefa 4).
- Produces: **rascunho** = `{ produtoId, titulo, slug, descricao, marca, categorias: string[], destaque: boolean, videoUrl: string|null, seo: { title, description }, especificacoes: boolean }`; `rascunhoInicialLI(produto) -> rascunho` (`titulo = tituloBase`, `slug = slugDe(tituloBase)`, `descricao = descricaoBase ?? ""`, `marca = produto.marca ?? ""`, `categorias: []`, `destaque: false`, `videoUrl`, `seo` pelos padrões, `especificacoes: true`); `rascunhoDaLI(rascunho, produtoLINormalizado) -> rascunho` (ao vincular: `slug`, `categorias` e `destaque` vêm da LI; o resto fica); `RascunhoLISchema` (zod; chave desconhecida descartada; `LIMITES_LI = { titulo: 200, slug: 100, descricao: 50000, marca: 120, categorias: 20, idDeCategoria: 32, videoUrl: 500, seoTitulo: 300, seoDescription: 1000 }`); `ABAS_LI = [geral, seo, descricao, fiscal, envio, previa]` com rótulos `Geral`, `SEO`, `Descricao`, `Fiscal`, `Envio`, `Previa e sincronizacao`; `validarRascunhoLI(rascunho, contexto) -> [{ campo, aba, problema, bloqueante }]` onde `contexto = { produto, categoriasDaLI: [{id}] | null }`. Bloqueantes: `titulo` vazio; `slug` inválido; produto não Conferido (`campo: "produto"`, aba `geral`). Alertas: sem NCM ("Sem NCM a Loja Integrada nao emite NF-e, e o cadastro na LI exige NCM."), sem `origem` ou `tipoProducao` ("a NF-e usara o padrao do emissor da LI"), sem GTIN ("a nota sai SEM GTIN"), SEO acima de 70/250 ("sera cortado no envio"), sem marca, sem categoria, categoria fora de `categoriasDaLI` (quando a lista veio), sem alguma medida ou peso.

- [ ] **Step 1: Testes**

```js
console.log("\nRegras puras: rascunho, esquema e validacao");
const ctxProd = { id: "p1", sku: "100404", tituloBase: "CLP FX3U 24MR", descricaoBase: "Linha 1\n\nLinha 2", marca: "MITSUBISHI", conferido: true, ncm: "85371020", origem: 0, tipoProducao: "REVENDA", ean: "x", pesoKg: 0.5, alturaCm: 2, larguraCm: 12, comprimentoCm: 6, videoUrl: null };
const inicial = rascunhoInicialLI(ctxProd);
conferir("rascunho inicial", inicial, { produtoId: "p1", titulo: "CLP FX3U 24MR", slug: "clp-fx3u-24mr", descricao: "Linha 1\n\nLinha 2", marca: "MITSUBISHI", categorias: [], destaque: false, videoUrl: null, seo: { title: "CLP FX3U 24MR", description: "Linha 1" }, especificacoes: true });
conferir("vinculo traz slug, categorias e destaque da LI", rascunhoDaLI(inicial, { slug: "clp-da-li", categorias: ["1", "2"], destaque: true, nome: "Outro" }), { ...inicial, slug: "clp-da-li", categorias: ["1", "2"], destaque: true });
conferir("esquema descarta chave estranha e aceita o rascunho", RascunhoLISchema.safeParse({ ...inicial, extra: 1 }).success, true);
conferir("esquema recusa categorias que nao sao texto", RascunhoLISchema.safeParse({ ...inicial, categorias: [1] }).success, false);
conferir("ABAS_LI", ABAS_LI.map((a) => a.id), ["geral", "seo", "descricao", "fiscal", "envio", "previa"]);
const problemas = validarRascunhoLI({ ...inicial, titulo: "", slug: "Ré", categorias: ["9"], seo: { title: "t".repeat(71), description: "" } }, { produto: { ...ctxProd, conferido: false, ncm: null }, categoriasDaLI: [{ id: "1" }] });
conferir("bloqueantes: titulo, slug, nao conferido", problemas.filter((p) => p.bloqueante).map((p) => p.campo), ["titulo", "slug", "produto"]);
conferir("alertas: ncm, categoria inexistente, seo longo", ["ncm", "categorias", "seoTitulo"].every((c) => problemas.some((p) => p.campo === c && !p.bloqueante)), true);
conferir("rascunho completo sem problema", validarRascunhoLI({ ...inicial, categorias: ["1"] }, { produto: ctxProd, categoriasDaLI: [{ id: "1" }] }), []);
```

- [ ] **Step 2: Rodar para ver falhar.** **Step 3: Implementar os três arquivos** (`validacao.js` sem imports de servidor: a tela o importa). **Step 4: Rodar** — Expected: OK.

- [ ] **Step 5: Commit** `git commit -m "Loja Integrada: rascunho do anuncio, esquema e validacao por aba"`.

---

### Task 9: Configuração por canal e `banco.js` (rascunho, vínculo e lista no Postgres)

**Files:**
- Create: `src/lib/canaisDeVenda/li/banco.js`
- Modify: `src/lib/canaisDeVenda/configuracao.js` (generalizar por canal)
- Test: `scripts/teste-li-sync.js` (bloco "Banco: rascunho, vinculo, lista e frases por canal"); `scripts/teste-anuncios-ml.js` continua verde

**Interfaces:**
- Consumes: `rascunhoInicialLI`, `rascunhoDaLI`, `RascunhoLISchema` (Tarefa 8); `urlDe` de `@/lib/arquivos`; `config.appUrlPublica`.
- Produces em `configuracao.js`: `lerConfigCanal(canal) -> { frases }`, `gravarFrasesDoCanal(canal, texto) -> { ok, frases } | { ok: false, erro }`; `lerConfigML` e `gravarFrases` passam a chamar as duas com `"MERCADO_LIVRE"` (mesmos nomes exportados).
- Produces em `banco.js` (`CANAL = "LOJA_INTEGRADA"`): `contextoDoProduto(produtoId) -> objeto | null` (`{ id, sku, tituloBase, descricaoBase, marca, modelo, ean, ncm, origem, tipoProducao, pesoKg, alturaCm, larguraCm, comprimentoCm, garantiaMeses, numeroHomologacao, videoUrl, conferido }`, Decimal em Number); `documentosDoProduto(produto) -> [{ url, nome }]` (`[]` quando `config.appUrlPublica` vazio; senão `appUrlPublica + urlDe(sku, tipo, arquivo)` dos `ProdutoArquivo` DOCUMENTO e CERTIFICADO, nome = `nomeOriginal ?? arquivo`); `anuncioLIDoProduto(produtoId) -> Anuncio | null`; `rascunhoDoAnuncio(anuncio) -> rascunho`; `novoRascunhoLI(produtoId) -> { ok, rascunho, contexto } | { ok: false, erro }` (recusa não Conferido com a frase `O produto {sku} ainda nao foi Conferido. So produto Conferido vira anuncio.`; `contexto = { produto, frases, documentos, urlPublica }`); `carregarAnuncioLI(id) -> { ok, anuncioId, status, rascunho, contexto, vinculo: { idExterno, urlExterna, situacaoCanal, sincronizadoEm, erro } }`; `salvarRascunhoLI(anuncioId, entrada) -> { ok, id } | { ok: false, erro }` (`anuncioId` null com anúncio LI já existente para o produto **atualiza esse** anúncio; colunas `titulo`, `descricao`, `categoriaExternaId = categorias[0] ?? null`; `dados` mesclado sobre o existente com `slug, marca, categorias, destaque, videoUrl, seo, especificacoes`; recusa produto excluído ou não Conferido); `vincularPeloSku(produtoId, { idItemExterno, url, ativo, slug, categorias, destaque }) -> { anuncioId }` (quem chama junta `normalizarProdutoLojaIntegrada` com `normalizarDaLI`; cria ou atualiza o anúncio com `idExterno = idItemExterno`, `urlExterna = url`, `situacaoCanal` ATIVA/PAUSADA por `ativo`, `status: "PUBLICADO"`, `rascunhoDaLI` aplicado, e `Produto.urlLojaIntegrada = url`); `listarAnunciosLI({ busca, pagina }) -> { linhas: [{ id, sku, titulo, status, idExterno, urlExterna, sincronizadoEm, atualizadoEm }], total, pagina, totalPaginas }` (100 por página, busca sem caixa em título e SKU, a mais recente primeiro).

- [ ] **Step 1: Testes** (produtos `ZZ-LI-*`; guardar e restaurar a linha `ConfigCanal` LOJA_INTEGRADA como o teste do ML faz com a do ML)

```js
console.log("\nBanco: rascunho, vinculo, lista e frases por canal");
await limpar();
const p = await prisma.produto.create({ data: { sku: "ZZ-LI-3", tituloBase: "Fonte 12V", descricaoBase: "Desc", marca: "ACME", ncm: "85044010", conferido: true } });
const q = await prisma.produto.create({ data: { sku: "ZZ-LI-4", tituloBase: "Nao conferido" } });
conferir("novo rascunho recusa nao Conferido", (await novoRascunhoLI(q.id)).erro, "O produto ZZ-LI-4 ainda nao foi Conferido. So produto Conferido vira anuncio.");
const novo = await novoRascunhoLI(p.id);
conferir("novo rascunho nasce do produto", [novo.ok, novo.rascunho.titulo, novo.rascunho.slug, novo.contexto.documentos], [true, "Fonte 12V", "fonte-12v", []]);
const salvo = await salvarRascunhoLI(null, { ...novo.rascunho, categorias: ["10", "20"], seo: { title: "T", description: "D" } });
conferir("salva o rascunho", salvo.ok, true);
const deNovo = await salvarRascunhoLI(null, { ...novo.rascunho, titulo: "Fonte 12V 5A" });
conferir("segundo salvar sem id atualiza o mesmo anuncio (um por produto)", deNovo.id, salvo.id);
const carregado = await carregarAnuncioLI(salvo.id);
conferir("carrega titulo da coluna e categorias do dados", [carregado.rascunho.titulo, carregado.rascunho.categorias, carregado.vinculo.idExterno], ["Fonte 12V 5A", ["10", "20"], null]);
await vincularPeloSku(p.id, { idItemExterno: "401", url: "https://loja/x", ativo: true, slug: "fonte-da-li", categorias: ["30"], destaque: true });
const vinculado = await carregarAnuncioLI(salvo.id);
conferir("vinculo grava idExterno, url, ATIVA e traz slug/categorias/destaque da LI", [vinculado.vinculo.idExterno, vinculado.vinculo.situacaoCanal, vinculado.rascunho.slug, vinculado.rascunho.categorias, vinculado.rascunho.destaque, vinculado.rascunho.titulo], ["401", "ATIVA", "fonte-da-li", ["30"], true, "Fonte 12V 5A"]);
conferir("urlLojaIntegrada preenchida pelo vinculo", (await prisma.produto.findUnique({ where: { id: p.id } })).urlLojaIntegrada, "https://loja/x");
conferir("lista acha por sku sem caixa", (await listarAnunciosLI({ busca: "zz-li-3" })).linhas.map((l) => l.sku), ["ZZ-LI-3"]);
await prisma.produto.update({ where: { id: p.id }, data: { conferido: false } });
conferir("salvar recusa produto que deixou de ser Conferido", (await salvarRascunhoLI(salvo.id, novo.rascunho)).ok, false);
conferir("frases por canal: LI e ML separadas", [(await gravarFrasesDoCanal("LOJA_INTEGRADA", "Com nota fiscal")).frases, Array.isArray((await lerConfigCanal("MERCADO_LIVRE")).frases)], [["Com nota fiscal"], true]);
```

- [ ] **Step 2: Rodar para ver falhar.** **Step 3: Implementar** `configuracao.js` por canal e `banco.js`.

- [ ] **Step 4: Rodar** — Run: `npm run teste:li-sync && npm run teste:anuncios-ml` — Expected: ambos OK.

- [ ] **Step 5: Commit** `git commit -m "Loja Integrada: rascunho no banco, vinculo pelo SKU, lista e frases fixas por canal"`.

---

### Task 10: `cliente.js`, a LI falsa e `estado.js` (o ícone)

**Files:**
- Create: `src/lib/canaisDeVenda/li/cliente.js`, `scripts/lib/lojaIntegradaFalsa.js`, `src/lib/canaisDeVenda/li/estado.js`
- Test: `scripts/teste-li-sync.js` (bloco "Cliente da LI, trava por codigo, LI falsa e icone")

**Interfaces:**
- Consumes: `clienteLojaIntegrada` (`get`, `post`, `put`) de `src/lib/integracoes/lojaIntegrada/client.js`; `exigirCodigoLiberado` de `@/lib/blingSync/cliente`; `exigirTravaLiberada`; `assinaturaLI`, `normalizarDoRiseLI` (Tarefa 6); `rascunhoDoAnuncio` (Tarefa 9).
- Produces: `clienteLI() -> { get, post, put, exigirEscrita(sku) }` (`exigirEscrita` = `exigirTravaLiberada("LOJA_INTEGRADA")` + `exigirCodigoLiberado(sku, config.travas.liCodigosLiberados)`); `criarLojaIntegradaFalsa({ produtos = [], marcas = [], categorias = [], seos = {} }) -> { get, post, put, exigirEscrita, chamadas: [{ metodo, caminho, params, corpo }], produtos(), marcas(), seos() }` com respostas `{ ok, status, duracaoMs: 0, dados }` no formato real: `GET /produto` (`?sku=` filtra igual sem caixa, `?limit=`/`?offset=` paginam com `meta.next`), `GET /produto/{id}` (404 se não existe), `POST /produto` (gera `id`, `resource_uri`, `url`, `seo` URI e um SEO vazio; `sku` repetido → **409** até a Tarefa 2 dizer outra coisa), `PUT /produto/{id}` (**400 se o corpo trouxer qualquer `CHAVES_SO_LEITURA`** — lista copiada de `corpo.js`, com comentário, porque o falso não importa de `src/`; substitui o produto inteiro: chave gravável ausente vira `null`, e as chaves só de leitura, `imagens` incluída, **ficam como estavam**), `PUT /produto/{id}/alias` (troca `apelido` e `url`), `GET /seo/{id}`, `PUT /seo/{id}`, `GET /marca` (`?limit=`), `GET /marca/{id}`, `POST /marca` (devolve `resource_uri: "/api/v1/marca/{id}"`), `GET /categoria` (`?limit=`/`?offset=`). **`POST`/`PUT` sem `exigirEscrita` antes lançam** `Error("LI falsa: escrita sem exigirEscrita")`; endpoint desconhecido lança. Sem imports de `src/`.
- Produces em `estado.js` (só servidor): `estadoDoIconeLI({ conferido, sincronizadoEm, assinaturaGuardada, assinaturaAtual }) -> { cor: "cinza"|"verde", divergente, conferido }` (não conferido: cinza, `divergente: false`); `iconeLIDoProduto(produto, anuncioLI, { frases, documentos }) -> estado` (sem anúncio: cinza; assinatura atual por `normalizarDoRiseLI(produto, rascunhoDoAnuncio(anuncioLI), …)`); `produtoIdValido` reexportado de `@/lib/blingSync/estado`.

- [ ] **Step 1: Testes**

```js
console.log("\nCliente da LI, trava por codigo, LI falsa e icone");
const cli = clienteLI();
let recusa = null; try { cli.exigirEscrita("100404"); } catch (e) { recusa = e.message; }
conferir("trava geral fechada recusa citando LI_ESCRITA", /LI_ESCRITA/.test(recusa), true);
const falsa = criarLojaIntegradaFalsa({ produtos: [{ id: 401, sku: "100404", nome: "CLP", apelido: "/clp", ativo: true, removido: false }], marcas: [{ id: 1, nome: "Mitsubishi" }] });
conferir("GET /produto?sku= filtra", (await falsa.get("/produto", { sku: "100404" })).dados.objects.map((p) => p.id), [401]);
conferir("GET /produto/{id} inexistente da 404", (await falsa.get("/produto/9")).status, 404);
let semTrava = null; try { await falsa.put("/produto/401", { nome: "x" }); } catch (e) { semTrava = e.message; }
conferir("LI falsa recusa escrita sem exigirEscrita", semTrava, "LI falsa: escrita sem exigirEscrita");
falsa.exigirEscrita("100404");
conferir("PUT com chave so de leitura da 400", (await falsa.put("/produto/401", { nome: "x", imagens: [] })).status, 400);
conferir("PUT inteiro substitui e apaga o que nao veio", (await falsa.put("/produto/401", { nome: "Novo", sku: "100404", tipo: "normal" })).dados.apelido, null);
conferir("POST /marca devolve URI", (await falsa.post("/marca", { nome: "Nova" })).dados.resource_uri.startsWith("/api/v1/marca/"), true);
conferir("chamadas registradas", falsa.chamadas.length >= 5, true);
conferir("icone: nao conferido e cinza sem selo", estadoDoIconeLI({ conferido: false, sincronizadoEm: new Date(), assinaturaGuardada: "a", assinaturaAtual: "b" }), { cor: "cinza", divergente: false, conferido: false });
conferir("icone: sincronizado e igual e verde", estadoDoIconeLI({ conferido: true, sincronizadoEm: new Date(), assinaturaGuardada: "a", assinaturaAtual: "a" }), { cor: "verde", divergente: false, conferido: true });
conferir("icone: assinatura mudou acende o selo", estadoDoIconeLI({ conferido: true, sincronizadoEm: new Date(), assinaturaGuardada: "a", assinaturaAtual: "b" }).divergente, true);
conferir("icone: nunca sincronizado e cinza sem selo", estadoDoIconeLI({ conferido: true, sincronizadoEm: null, assinaturaGuardada: null, assinaturaAtual: "b" }), { cor: "cinza", divergente: false, conferido: true });
```

- [ ] **Step 2: Rodar para ver falhar.** **Step 3: Implementar os três arquivos.** **Step 4: Rodar** — Expected: OK.

- [ ] **Step 5: Commit** `git commit -m "Loja Integrada: cliente com as duas travas, LI falsa para os testes e estado do icone"`.

---

### Task 11: `leitura.js`: busca por SKU, detalhe, categorias, marcas e o pop-up

**Files:**
- Create: `src/lib/canaisDeVenda/li/leitura.js`
- Test: `scripts/teste-li-sync.js` (bloco "Leitura: busca por SKU, detalhe e pop-up")

**Interfaces:**
- Consumes: `clienteLI` (Tarefa 10), `normalizarProdutoLojaIntegrada` (normalizadores), `normalizarDoRiseLI`, `normalizarDaLI`, `diferencasLI`, `CAMPOS_DE_ENVIO_LI` (Tarefa 6), `contextoDoProduto`, `anuncioLIDoProduto`, `rascunhoDoAnuncio`, `rascunhoInicialLI`, `documentosDoProduto`, `vincularPeloSku`, `lerConfigCanal` (Tarefas 8 e 9).
- Produces: `buscarNaLI(cliente, sku) -> { situacao: "nao_existe"|"existe"|"duplicado"|"removido", id?, produto? }` (`GET /produto?sku=` com conferência do SKU sem caixa; `removido: true` → `removido`; sem filtro na API real, varredura paginada guardada em memória por 10 min por processo — conforme Tarefa 2); `lerDetalheDaLI(cliente, id) -> { produto, seo, marcaNome }` (`GET /produto/{id}?descricao_completa=1`, `GET /seo/{idSeo}`, `GET /marca/{id}` se houver marca); `listarCategoriasDaLI(cliente) -> [{ id, nome, paiId, caminho }]` (paginado em 100; `caminho` = "Pai > Filha"); `listarMarcasDaLI(cliente) -> [{ id, nome, uri }]`; `escritaDoProduto(sku) -> { liberada, motivo }`; `lerParaPopupLI(produtoId, cliente = clienteLI()) -> { ok, erro?, sku, conferido, situacao, anuncioId, idExterno, urlExterna, vinculadoAgora, marcaExisteNaLI, diferencas, iguais, avisos, escrita }` (nunca lança; não Conferido → `ok: true, conferido: false` sem chamar a LI; sem anúncio e `existe` → `vincularPeloSku` e `vinculadoAgora: true`; `removido` → `ok: false` com "O codigo {sku} esta na lixeira da Loja Integrada: restaure-o la antes de sincronizar."; `duplicado` → `ok: false`).

- [ ] **Step 1: Testes** (LI falsa; produtos `ZZ-LI-*`)

```js
console.log("\nLeitura: busca por SKU, detalhe e pop-up");
await limpar();
const prodL = await prisma.produto.create({ data: { sku: "ZZ-LI-5", tituloBase: "Sensor", marca: "ACME", ncm: "90261000", conferido: true } });
const naoConf = await prisma.produto.create({ data: { sku: "ZZ-LI-6", tituloBase: "Outro" } });
const li2 = criarLojaIntegradaFalsa({ produtos: [
  { id: 501, sku: "zz-li-5", nome: "Sensor", apelido: "/sensor", ativo: true, removido: false, ncm: "9026.10.00", marca: "/api/v1/marca/7", categorias: ["/api/v1/categoria/3"], seo: "/api/v1/seo/900" },
  { id: 502, sku: "ZZ-LI-7", nome: "Lixo", removido: true },
], marcas: [{ id: 7, nome: "Acme" }], categorias: [{ id: 3, nome: "Sensores", categoria_pai: null }], seos: { 900: { title: "", description: "" } } });
conferir("busca acha sem caixa", (await buscarNaLI(li2, "ZZ-LI-5")).situacao, "existe");
conferir("busca: removido", (await buscarNaLI(li2, "ZZ-LI-7")).situacao, "removido");
conferir("busca: nao existe", (await buscarNaLI(li2, "ZZ-LI-8")).situacao, "nao_existe");
conferir("detalhe traz seo e nome da marca", (await lerDetalheDaLI(li2, 501)).marcaNome, "Acme");
conferir("categorias com caminho", await listarCategoriasDaLI(li2), [{ id: "3", nome: "Sensores", paiId: null, caminho: "Sensores" }]);
conferir("pop-up de nao Conferido nao chama a LI", [(await lerParaPopupLI(naoConf.id, li2)).conferido, li2.chamadas.filter((c) => c.caminho.includes("ZZ-LI-6")).length], [false, 0]);
const popup = await lerParaPopupLI(prodL.id, li2);
conferir("pop-up vincula na primeira abertura e lista diferencas", [popup.ok, popup.situacao, popup.vinculadoAgora, popup.idExterno, popup.diferencas.length > 0], [true, "existe", true, "501", true]);
conferir("segunda abertura nao vincula de novo", (await lerParaPopupLI(prodL.id, li2)).vinculadoAgora, false);
conferir("escrita fechada tem motivo", popup.escrita.liberada, false);
```

- [ ] **Step 2: Rodar para ver falhar.** **Step 3: Implementar `leitura.js`** (erros HTTP traduzidos como em `blingSync/leitura.js`: 429 "limite de 100 chamadas por minuto", 401/403 "Personal Token", 5xx). **Step 4: Rodar** — Expected: OK.

- [ ] **Step 5: Commit** `git commit -m "Loja Integrada: busca por SKU, detalhe, categorias, marcas e a leitura do pop-up"`.

---

### Task 12: `envio.js` e `apresentacao.js`: Sincronizar, Cadastrar, marca, cópia

**Files:**
- Create: `src/lib/canaisDeVenda/li/envio.js`, `src/lib/canaisDeVenda/li/apresentacao.js`
- Test: `scripts/teste-li-sync.js` (bloco "Envio: sincronizar, cadastrar, marca, categorias e copia")

**Interfaces:**
- Consumes: tudo das Tarefas 6, 7, 9, 10, 11.
- Produces em `envio.js`: `sincronizarProdutoLI(produtoId, cliente = clienteLI()) -> { ok, erro?, alterados: [{ campo, de, para }], etapa, marcaCriada: string|null, categoriasIgnoradas: string[] }` (etapas em ordem: `trava`, `leitura`, `marca`, `produto`, `seo`, `slug`, `gravacao`; `umPorVez` por produto; **recusa** sem anúncio com `idExterno` ("use Cadastrar na LI"), não Conferido, `removido`, `duplicado`; grava `CopiaProdutoCanal` (3 por produto e canal) antes do `PUT`; `garantirMarca` acha por nome sem caixa e sem acento em `listarMarcasDaLI`, senão `POST /marca`; categorias do rascunho fora de `listarCategoriasDaLI` saem do envio e vão em `categoriasIgnoradas`; `PUT /produto/{id}` só se há campo de produto alterado; `PUT /seo/{idSeo}` só se SEO mudou; `PUT /produto/{id}/alias?replace_main=true` só se `slug` mudou; ao fim `Anuncio` recebe `status: "PUBLICADO"`, `hashConteudo = assinaturaLI(campos do Rise)`, `sincronizadoEm`, `payloadEnviado`, `erro: null`, `dados.etapa: null`, `urlExterna` relida, e `Produto.urlLojaIntegrada`; em falha depois da trava, `status: "ERRO"`, `Anuncio.erro` e `dados.etapa` gravados e `hashConteudo` não muda); `cadastrarNaLI(produtoId, cliente) -> { ok, erro?, idExterno?, urlExterna? }` (recusa se `existe`/`removido`/`duplicado`, não Conferido, sem NCM ("Sem NCM a Loja Integrada nao emite NF-e: preencha o NCM no produto antes de cadastrar."), problema bloqueante de `validarRascunhoLI`; `POST /produto` com `montarCorpoDeCadastroLI`; depois `PUT /seo`; grava `idExterno`, `urlExterna`, `situacaoCanal: "PAUSADA"`, `status: "PUBLICADO"`, assinatura e data).
- Produces em `apresentacao.js` (puro, o navegador importa): `valorParaTela(campo, valor)` (arrays viram "a, b"; booleanos "sim"/"nao"; `peso` " kg"; medidas " cm"; `tipoProducao` com rótulo), `resumirEnvioLI(tipo, resultado, rotulos) -> { titulo, linhas } | null` (título "Sincronizado com a Loja Integrada." / "Nada para enviar: a Loja Integrada ja estava igual ao Rise." / "Produto cadastrado na Loja Integrada (inativo)."), `mudouNaLI(tipo, resultado) -> boolean` (`sincronizar`: ok ou `alterados.length > 0` ou `marcaCriada`; `cadastrar`: ok ou `idExterno`).

- [ ] **Step 1: Testes** (o cliente é sempre a LI falsa, cujo `exigirEscrita` é o dela: a trava real do `.env` não entra aqui, e `LI_ESCRITA` continua `false`)

```js
console.log("\nEnvio: sincronizar, cadastrar, marca, categorias e copia");
await limpar();
const pe = await prisma.produto.create({ data: { sku: "ZZ-LI-9", tituloBase: "Modulo Rele", marca: "ARDUÍNO", ncm: "85364900", origem: 0, conferido: true, alturaCm: 1.2, larguraCm: 2, comprimentoCm: 3, pesoKg: 0.01 } });
const li3 = criarLojaIntegradaFalsa({ produtos: [{ id: 601, sku: "ZZ-LI-9", nome: "Rele", apelido: "/rele", ativo: true, removido: false, ncm: "", marca: null, categorias: ["/api/v1/categoria/5"], seo: "/api/v1/seo/61", imagens: [{ id: 1 }] }], marcas: [{ id: 2, nome: "Arduino" }], categorias: [{ id: 5, nome: "Reles" }], seos: { 61: { title: "", description: "" } } });
conferir("sincronizar sem vinculo pede Cadastrar", /Cadastrar na LI/.test((await sincronizarProdutoLI(pe.id, li3)).erro), true);
await lerParaPopupLI(pe.id, li3); // vincula
const anuncioAntes = await anuncioLIDoProduto(pe.id);
await salvarRascunhoLI(anuncioAntes.id, { ...rascunhoDoAnuncio(anuncioAntes), categorias: ["5", "999"], seo: { title: "Rele Arduino", description: "D" } });
const envio = await sincronizarProdutoLI(pe.id, li3);
// `origem` e `tipoProducao` entram: o Rise tem 0 e REVENDA (padrao) e o produto da LI falsa nao tem os dois.
conferir("sincronizou; categoria morta ignorada; marca achada sem acento", [envio.ok, envio.alterados.map((a) => a.campo).sort(), envio.marcaCriada, envio.categoriasIgnoradas], [true, ["altura", "comprimento", "largura", "marca", "ncm", "nome", "origem", "peso", "seoDescription", "seoTitulo", "tipoProducao"], null, ["999"]]);
const naLI = li3.produtos().find((p) => p.id === 601);
conferir("PUT inteiro preservou imagens e categorias da LI e trocou o nome", [naLI.imagens.length, naLI.categorias, naLI.nome, naLI.marca], [1, ["/api/v1/categoria/5"], "Modulo Rele", "/api/v1/marca/2"]);
conferir("nenhum POST /marca", li3.chamadas.filter((c) => c.metodo === "POST" && c.caminho === "/marca").length, 0);
conferir("SEO gravado", li3.seos()[61].title, "Rele Arduino");
const dep = await anuncioLIDoProduto(pe.id);
conferir("assinatura, data e payload gravados; sem erro", [typeof dep.hashConteudo, dep.sincronizadoEm !== null, dep.payloadEnviado !== null, dep.erro], ["string", true, true, null]);
conferir("copia antes do PUT", await prisma.copiaProdutoCanal.count({ where: { produtoId: pe.id, canal: "LOJA_INTEGRADA" } }), 1);
conferir("segunda sincronizacao nao envia nada", (await sincronizarProdutoLI(pe.id, li3)).alterados, []);
conferir("icone verde e sem selo depois do envio", iconeLIDoProduto(await prisma.produto.findUnique({ where: { id: pe.id } }), await anuncioLIDoProduto(pe.id), { frases: [], documentos: [] }), { cor: "verde", divergente: false, conferido: true });
// Cadastro
const pc = await prisma.produto.create({ data: { sku: "ZZ-LI-10", tituloBase: "Novo na LI", marca: "NOVAMARCA", ncm: "85364900", conferido: true } });
const semNcm = await prisma.produto.create({ data: { sku: "ZZ-LI-11", tituloBase: "Sem NCM", conferido: true } });
conferir("cadastrar sem NCM recusa antes do POST", [/NCM/.test((await cadastrarNaLI(semNcm.id, li3)).erro), li3.chamadas.filter((c) => c.metodo === "POST" && c.caminho === "/produto").length], [true, 0]);
const cad = await cadastrarNaLI(pc.id, li3);
conferir("cadastro: inativo, marca criada, vinculo gravado", [cad.ok, li3.produtos().at(-1).ativo, li3.marcas().some((m) => m.nome === "NOVAMARCA"), (await anuncioLIDoProduto(pc.id)).idExterno === cad.idExterno], [true, false, true, true]);
conferir("cadastrar de novo recusa (ja existe)", (await cadastrarNaLI(pc.id, li3)).ok, false);
// Trava fechada: um cliente cuja exigirEscrita lanca (a trava real e a da carga do processo)
const travada = { ...li3, exigirEscrita: () => { throw new Error("Escrita bloqueada: LI_ESCRITA esta false no .env. Nenhum dado foi enviado."); } };
const recusado = await sincronizarProdutoLI(pe.id, travada);
conferir("trava fechada: recusa antes de qualquer chamada", [recusado.erro.includes("LI_ESCRITA"), recusado.etapa], [true, "trava"]);
conferir("mudouNaLI e resumirEnvioLI", [mudouNaLI("sincronizar", envio), resumirEnvioLI("sincronizar", { ok: true, alterados: [] }).titulo], [true, "Nada para enviar: a Loja Integrada ja estava igual ao Rise."]);
```

- [ ] **Step 2: Rodar para ver falhar.** **Step 3: Implementar `envio.js` e `apresentacao.js`** (mensagens de falha no molde de `blingSync/envio.js`: `FalhaDoEnvio`, "confira na Loja Integrada antes de tentar de novo" em tempo esgotado). **Step 4: Rodar** — Expected: OK.

- [ ] **Step 5: Commit** `git commit -m "Loja Integrada: sincronizar e cadastrar com copia, marca, categorias ao vivo, SEO e slug"`.

---

### Task 13: Server Actions, frases fixas reutilizáveis e rótulos

**Files:**
- Create: `src/app/produtos/acoes-li.js`, `src/app/canais-de-venda/loja-integrada/acoes.js`, `src/lib/canaisDeVenda/li/rotulos.js`
- Modify: `src/components/anuncios/ml/FrasesFixas.jsx` (props `salvar` com padrão `salvarFrasesFixas` do ML e `ajuda`)
- Test: `scripts/teste-li-sync.js` (bloco "Rotulos"): só `rotulos.js`; as ações são conferidas no navegador (dependem do Next)

**Interfaces:**
- Produces em `acoes-li.js` ("use server"): `abrirJanelaLI(produtoId)`, `sincronizarComLI(produtoId)`, `cadastrarProdutoNaLI(produtoId)` (molde de `acoes-bling.js`: `produtoIdValido`, `protegendo(recado, …)`, `revalidando(resultado, mudouNaLI(tipo, resultado))` revalidando `/produtos` e `/canais-de-venda/loja-integrada`).
- Produces em `loja-integrada/acoes.js`: `abrirNovoAnuncioLI(produtoId)`, `abrirAnuncioLI(id)`, `anuncioDoProdutoLI(produtoId) -> { ok, produto: { id, sku, tituloBase, conferido }, anuncioId: string|null }`, `salvarAnuncioLI(id, rascunho)`, `salvarFrasesFixasLI(texto)` (`gravarFrasesDoCanal("LOJA_INTEGRADA", texto)`), `listarCategoriasLI() -> { ok, categorias }`, `listarMarcasLI() -> { ok, marcas }` (as duas chamam a LI real, só leitura; falha vira `{ ok: false, erro }`).
- Produces em `rotulos.js`: `STATUS_LI = { RASCUNHO: { rotulo: "Sem vinculo", tom: "neutro" }, PUBLICADO: { rotulo: "Na loja", tom: "sucesso" }, ERRO: { rotulo: "Erro", tom: "erro" } }`, `ROTULO_DO_TIPO_PRODUCAO`.
- `FrasesFixas` recebe `salvar` (função) e `ajuda` (texto); o ML continua passando nada.

- [ ] **Step 1: Implementar os arquivos** com as assinaturas acima. Teste: `conferir("STATUS_LI", Object.keys(STATUS_LI), ["RASCUNHO", "PUBLICADO", "ERRO"])`.
- [ ] **Step 2: Run** `npm run lint && npm run teste:li-sync && npm run teste:anuncios-ml` — Expected: OK.
- [ ] **Step 3: Commit** `git commit -m "Loja Integrada: Server Actions do icone e do canal, frases fixas por canal, rotulos"`.

---

### Task 14: Páginas do canal, catálogo, identidade e a tabela

**Files:**
- Create: `src/app/canais-de-venda/loja-integrada/page.jsx`, `novo/page.jsx`, `[id]/page.jsx`, `configuracoes/page.jsx`, `src/components/anuncios/li/TabelaAnunciosLI.jsx`, `src/components/anuncios/li/EditorNaPagina.jsx`
- Modify: `src/lib/canaisDeVenda/catalogo.js` (cartão da LI sem `emBreve`, resumo "Anuncios da loja propria: conteudo, SEO e dados fiscais pelo Rise; estoque e preco pelo Bling", detalhe "Sincronizacao sob trava · fotos e documentos na VPS"), `src/lib/canais.js` (resumo da LI: "Loja propria — conteudo pelo Rise, estoque e preco pelo Bling"; `viaBling` fica se algo o lê — conferir com `grep -rn viaBling src/`)

**Interfaces:**
- Consumes: `listarAnunciosLI`, `novoRascunhoLI`, `carregarAnuncioLI`, `lerConfigCanal("LOJA_INTEGRADA")` (Tarefa 9); `STATUS_LI` (Tarefa 13); `EditorAnuncioLI` (Tarefa 15; nesta tarefa `EditorNaPagina` monta um placeholder "Editor na proxima tarefa").
- Produces: as quatro páginas no molde das do ML (`dynamic = "force-dynamic"`, `LinkDeVolta`, `PageHeader`, `AvisoBanco`, `CampoBusca`, `Paginacao`); `TabelaAnunciosLI` com colunas Codigo, Titulo, Situacao (`STATUS_LI`), Na loja (`idExterno` → link `urlExterna`), Sincronizado em, Atualizado em; `EditorNaPagina` igual ao do ML apontando para `/canais-de-venda/loja-integrada/{id}`.

- [ ] **Step 1: Implementar.** **Step 2: Conferir no navegador** (`npm run dev`): `/canais-de-venda` mostra o cartão da LI clicável; `/canais-de-venda/loja-integrada` lista (ou `EmptyState`); `/novo?produto=<sku conferido>` abre; `/configuracoes` salva uma frase.
- [ ] **Step 3: Lint e commit** `git commit -m "Canais de Venda: paginas da Loja Integrada (lista, novo, anuncio, configuracoes)"`.

---

### Task 15: O editor por abas

**Files:**
- Create: `src/components/anuncios/li/EditorAnuncioLI.jsx`, `AbaGeral.jsx`, `AbaSEO.jsx`, `AbaDescricao.jsx`, `AbaFiscal.jsx`, `AbaEnvio.jsx`, `AbaPrevia.jsx`, `JanelaAnuncioLI.jsx`, `ArvoreDeCategorias.jsx`
- Modify: `src/components/anuncios/li/EditorNaPagina.jsx` (trocar o placeholder)

**Interfaces:**
- Consumes: `ABAS_LI`, `validarRascunhoLI` (Tarefa 8); `montarDescricaoLI` (Tarefa 5); limites e padrões de `seo.js` (Tarefa 4); `salvarAnuncioLI`, `listarCategoriasLI`, `listarMarcasLI`, `abrirAnuncioLI`, `abrirNovoAnuncioLI`, `anuncioDoProdutoLI` (Tarefa 13); `BarraDeAbas`, `Painel` de `@/components/cadastros/Abas`; `MensagensDoCampo` de `@/components/anuncios/ml/MensagensDoCampo` (reutilizado); `BolhaDeAjuda`.
- Produces: `EditorAnuncioLI({ anuncioId, rascunhoInicial, contextoInicial, status, vinculo, modo, aoSalvar, aoFechar })` com a mesma casca do ML (estado controlado, abas montadas e escondidas, Esc, "Sair sem salvar?", `travado` no primeiro Salvar da página); cada aba recebe `{ rascunho, contexto, alterar, setContexto, problemas, irPara, anuncioId }`.
  - **Geral:** nome com contador; slug (editável; se `vinculo.idExterno` e slug ≠ o salvo, aviso "A URL antiga vai redirecionar (301) para a nova"); marca (texto com lista de sugestão das marcas da LI, carregadas por `listarMarcasLI` ao abrir); **categorias** por `ArvoreDeCategorias` (carrega `listarCategoriasLI` ao montar e guarda em `contexto.categoriasDaLI`; árvore pai > filha com caixas, busca por nome, botão "Recarregar categorias", as marcadas vêm de `rascunho.categorias`); destaque; vídeo.
  - **SEO:** título e description com contadores `n/70` e `n/250` (vermelho acima), botão "Usar padrao" por campo (`tituloSeoPadrao(rascunho.titulo)`, `descriptionPadrao(rascunho.descricao)`).
  - **Descricao:** textarea; caixa "Incluir Especificacoes"; prévia renderizada do HTML (`dangerouslySetInnerHTML` do nosso próprio HTML, já escapado, dentro de `<div className="prose">`); frases fixas em leitura com link para configurações; aviso "Documentos: desligado ate o endereco publico (APP_URL_PUBLICA)" quando `contexto.urlPublica` vazio.
  - **Fiscal (só leitura):** NCM, Origem, Tipo de producao, GTIN de `contexto.produto`, link "Editar no produto" (`/produtos/{id}`), avisos de `problemas`.
  - **Envio:** peso e medidas de `contexto.produto` (só leitura, ordem Peso, Comprimento, Largura, Altura), com o inteiro que vai para a LI ao lado ("2,3 cm → 3 cm").
  - **Previa:** problemas por aba (como `AbaPrevia` do ML), o HTML final, e o bloco "Sincronizacao": `vinculo` (na loja/sem vinculo, URL, sincronizado em, erro, etapa) com o texto "Cadastrar e Sincronizar ficam no icone da Loja Integrada na lista de Produtos".
  - `JanelaAnuncioLI({ produtoId, aoFechar })`: `anuncioDoProdutoLI` → não Conferido: só o aviso; sem anúncio: `abrirNovoAnuncioLI`; com anúncio: `abrirAnuncioLI`; editor em `modo="janela"`.

- [ ] **Step 1: Implementar.** **Step 2: Conferir no navegador** com um produto Conferido: as 6 abas, contadores do SEO, árvore de categorias carregada da LI real (só leitura), Salvar cria o anúncio, recarregar mantém; pela página `/canais-de-venda/loja-integrada` e pela janela.
- [ ] **Step 3: Lint e commit** `git commit -m "Loja Integrada: editor do anuncio por abas (Geral, SEO, Descricao, Fiscal, Envio, Previa) e arvore de categorias ao vivo"`.

---

### Task 16: Ícone e pop-up na lista de Produtos

**Files:**
- Create: `src/components/produtos/IconeLojaIntegrada.jsx`, `src/components/produtos/JanelaLojaIntegrada.jsx`
- Modify: `src/components/produtos/LinhaProduto.jsx:160-200` (o ramo `canal.id === "LOJA_INTEGRADA"` vira `IconeLojaIntegrada` + `JanelaLojaIntegrada`), `src/components/produtos/TabelaProdutos.jsx:345-352` (prop `iconeLI`), `src/app/produtos/page.jsx:84-128` (`anuncios` seleciona também `id, titulo, descricao, dados, hashConteudo, sincronizadoEm`; `iconeLI: iconeLIDoProduto(produto, anuncioLI, { frases, documentos })` com `frases` lidas uma vez por página e `documentos` por `documentosDoProduto`)
- Test: `scripts/teste-li-sync.js` (bloco "Icone na lista")

**Interfaces:**
- Consumes: `iconeLIDoProduto`, `estadoDoIconeLI` (Tarefa 10); `abrirJanelaLI`, `sincronizarComLI`, `cadastrarProdutoNaLI` (Tarefa 13); `valorParaTela`, `resumirEnvioLI`, `mudouNaLI` (Tarefa 12); `JanelaAnuncioLI` (Tarefa 15); `Popup` de `EdicaoRapida`.
- Produces: `IconeLojaIntegrada({ iconeLI, aoClicar })` (logo colorida/fosca, selo "!" âmbar, `title`/`aria-label` por `rotuloDoIconeLI`: "Loja Integrada: so Produto Conferido" / "nunca sincronizado" / "divergencia em campos" / "em dia"); `JanelaLojaIntegrada({ produto, aoFechar })` no molde de `JanelaBling.jsx`: estados carregando / erro / não Conferido / `nao_existe` ("Cadastrar na LI") / `existe` (lista de diferenças com `vazioNoRise` em cinza, `iguais` recolhidos, botões "Sincronizar com a LI", "Abrir anuncio" (abre `JanelaAnuncioLI`), "Ler de novo"); aviso "Vai criar a marca X na Loja Integrada" quando a diferença de marca é "diferente" e `marcaExisteNaLI` é false; com as travas fechadas os botões ficam e o motivo aparece em vermelho ao clicar; o resumo do envio por `resumirEnvioLI`.

- [ ] **Step 1: Teste** `conferir("iconeLIDoProduto sem anuncio e cinza", iconeLIDoProduto({ conferido: true }, null, { frases: [], documentos: [] }), { cor: "cinza", divergente: false, conferido: true })`.
- [ ] **Step 2: Implementar.** **Step 3: Conferir no navegador**: produto não Conferido → ícone fosco, clique abre só o aviso; produto Conferido que existe na LI → pop-up lista as diferenças reais (só leitura) e os botões recusam com o motivo `LI_ESCRITA`; produto Conferido que não existe → "Cadastrar na LI" recusa com o motivo.
- [ ] **Step 4: Rodar** `npm run teste:li-sync && npm run lint`. **Step 5: Commit** `git commit -m "Produtos: icone da Loja Integrada com selo e pop-up de diferencas (Cadastrar, Sincronizar, Abrir anuncio)"`.

---

### Task 17: Fechamento: documentação, bateria completa e o primeiro Sincronizar real

**Files:**
- Modify: `CLAUDE.md` (tabela Estado: linhas Canais de Venda e Integrações; seção "Loja Integrada" em "Conhecimento que custou caro" reescrita com o medido; nova seção "Canais de Venda: Loja Integrada (06/10/2026)" no molde da do ML e da do Bling; `npm run teste:li-sync` em "Rodar"; ritual de fim de sessão cita o teste), `docs/HANDOFF_LOJA_INTEGRADA.md` (nota no topo: "Superado pela spec de 06/10/2026; mantido como historico")
- Test: a bateria inteira

- [ ] **Step 1: Bateria**

Run: `npm run lint && npm run teste:extracao && npm run teste:coleta && npm run teste:cadastros && npm run teste:anuncios-ml && npm run teste:bling-sync && npm run teste:loja-integrada && npm run teste:li-sync`
Expected: todos OK.

- [ ] **Step 2: CLAUDE.md** com as decisões do dono (seção 3 da spec), onde mora cada parte, estado do ícone, o `PUT` inteiro, as travas, o que continua sem medida e as pendências (fotos, documentos, webhooks, os 44, importar).

- [ ] **Step 3: Commit** `git commit -m "CLAUDE.md: Canais de Venda / Loja Integrada (fase 1) e o teste li-sync"`.

- [ ] **Step 4: Primeiro Sincronizar real num produto do dono** (gate: AskUserQuestion com o SKU escolhido por ele, Conferido, e a lista de diferenças que o pop-up mostra). Com o ok: `LI_ESCRITA=true` e `LI_ESCRITA_CODIGOS=<sku>` só no ambiente do servidor usado para o clique (reiniciar o `npm run dev` com as variáveis no ambiente, `.env` intocado), clicar em Sincronizar, conferir na loja e no `LogIntegracao`, registrar o resultado no CLAUDE.md ("Primeiro envio real"), e reiniciar o servidor sem as variáveis.

- [ ] **Step 5: Commit final e push** (`git push`).
