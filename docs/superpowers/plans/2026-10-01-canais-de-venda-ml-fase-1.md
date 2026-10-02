# Canais de Venda — Mercado Livre, Fase 1 (Rascunho): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar a seção Canais de Venda e, no Mercado Livre, montar e salvar o rascunho de anúncio (inclusive de composição) a partir de um Produto Conferido, pelo pop-up do ícone na lista de Produtos ou pela página inteira — sem escrever nada no ML nem no Bling.

**Architecture:** Regras puras e sem rede em `src/lib/canaisDeVenda/` (composição, custo, versículos, descrição, rascunho, validação, prévia do payload), testadas por `npm run teste:anuncios-ml`. A gravação mora em funções de banco no mesmo diretório (testáveis fora do Next), e as Server Actions de `src/app/canais-de-venda/mercado-livre/acoes.js` só as chamam e revalidam. Um editor cliente com estado controlado (`EditorAnuncioML`) serve ao pop-up e à página; uma aba por arquivo.

**Tech Stack:** Next.js 16 (App Router), React 19, JavaScript, Prisma 7 + PostgreSQL 17, zod 4, Tailwind 4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-30-canais-de-venda-mercado-livre-design.md` (commits até `31561ab`). Este plano cobre a **fase 1** (§10), mais a curadoria dos versículos e a investigação de leitura que a spec pede antes da fase 2. As fases 2 (inteligência do ML) e 3 (Publicar) terão planos próprios, escritos com o relatório da Tarefa 16 em mãos, porque os formatos exatos de `listing_prices`, do validador do ML, do `GET /produtos/lojas` e do kit no Bling só existem depois dela.

## Global Constraints

- **Branch e pasta:** tudo na branch `canais-de-venda`, na pasta principal (`C:\00-Dev\Projeto_sistema_Rise\sistema-rise`). Antes de cada commit, `git branch --show-current` tem que dizer `canais-de-venda`.
- **Commit só dos arquivos da tarefa, pelo nome.** Nunca `git add -A` nem `git add .`: a pasta tem trabalho de outras frentes. Nunca comitar `.env`, `certificates/`, `dados/`. Mensagem em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **JavaScript**, sem TypeScript. Identificadores e comentários em português **sem acento**; comentário explica o porquê. **Texto da tela sem acento** (`Titulo`, `Composicao`, `Preco`), como o resto do sistema. Dado mostrado ao comprador (descrição, versículo) mantém os acentos.
- **Nenhuma escrita no Mercado Livre nem no Bling nesta fase.** `ML_PUBLICACAO` e `BLING_ESCRITA` continuam `false`; nenhum código liga trava. As únicas chamadas de rede são as leituras das Tarefas 15 (bible.com) e 16 (GETs do ML e do Bling).
- **Só Produto Conferido** (`Produto.conferido = true`) entra num anúncio, como principal ou como item de composição, e isso é conferido **no servidor** em toda ação que grava.
- **Next 16:** antes de escrever página ou rota, ler `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` e `07-mutating-data.md`. `params` e `searchParams` são Promises (`await`). Arquivo `"use server"` só exporta função assíncrona. Páginas com dados do banco usam `export const dynamic = "force-dynamic"`.
- **Decimal do Prisma vira `Number` no servidor** antes de ir para componente de cliente.
- **Versículos (NVI):** no máximo **500 versículos** na lista (`TETO_DE_VERSICULOS = 500`), contando faixas (`3:5-6` = 2); só Salmos e Provérbios; o crédito `(NVI)` é escrito pelo código, nunca digitado; o versículo, com referência e crédito, fica **abaixo de 25%** do texto final da descrição.
- **Composição:** código de um produto só = `{sku}_{N}` com milhar em ponto (`920302_1.000`); kit misto = código digitado; mínimo de 2 unidades no total; quantidade inteira de 1 a 9999.
- **Tipos de anúncio do ML:** `gold_special` = Clássico, `gold_pro` = Premium. Condição: `new` (Novo) e `used` (Usado). Atributos de partida: `BRAND`, `MODEL`, `GTIN`; o SKU vai em `SELLER_SKU`.
- **Migration:** `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, gravada à mão em `prisma/migrations/<nome>/migration.sql`, **sem** os `DROP INDEX` de `ProdutoColetado_buscaTexto_trgm` e `ProdutoColetado_coletadoEm_idx`; depois `npx prisma migrate deploy`, `npx prisma generate` e **reiniciar o servidor**.
- **Servidor de teste desta pasta:** porta **3002** (a 3000 é da frente Agente 1). Se `.claude/launch.json` não tiver, acrescentar `{"name": "sistema-rise-3002", "runtimeExecutable": "npm", "runtimeArgs": ["run", "dev", "--", "-p", "3002"], "port": 3002, "url": "https://localhost:3002"}` e usar `preview_start` com esse nome.
- **Tela:** abas no padrão de `src/components/cadastros/Abas.jsx` (`BarraDeAbas`, todas montadas e só escondidas); ajuda de campo com `BolhaDeAjuda` (`variante="inline"`); janela no desenho do `Popup` de `src/components/produtos/EdicaoRapida.jsx` (fundo `bg-slate-900/50`, Esc fecha); nunca `confirm()` nativo.

## Review Focus

1. **Produto que deixou de ser Conferido (ou foi excluído) depois de o rascunho existir:** Salvar recusa com a mensagem do motivo, no topo do editor, e o que está na tela continua lá. Teste na Tarefa 7; comportamento da tela na Tarefa 9.
2. **Dois anúncios ML do mesmo produto, um publicado e um rascunho:** o ícone fica verde com o ponto âmbar, e `separarCanais` não esconde o publicado atrás do rascunho (hoje o `Map` por canal fica com o último). Teste na Tarefa 5.
3. **Quantidade da composição fora do normal** (`0`, `-1`, `2.5`, `"abc"`, vazio, `10000`): recusa por item com mensagem; `1000` vira `_1.000`. Teste na Tarefa 2.
4. **Lista de versículos vazia** (antes da carga da Tarefa 15) **ou nenhum versículo cabe nos 25%:** o rascunho nasce sem versículo, com alerta na Prévia e sem erro. Testes nas Tarefas 3 e 7.
5. **Mesmo código de kit em dois anúncios:** com a mesma composição é aceito (Clássico e Premium compartilham o kit do Bling); com composição diferente, ou igual ao SKU de um Produto, é recusado. Teste na Tarefa 7.

## Fora deste plano

- Sugestão de título, categoria e atributos, custos do ML, calculadora de preço por margem, validador do ML: **fase 2**. Nesta fase a categoria é digitada (`MLB…`), a ficha técnica tem só `BRAND`, `MODEL` e `GTIN`, e a margem é a de `src/lib/margem.js` (6% de imposto, sem taxas do ML).
- Publicar, etapas, vínculo com o Bling, conferência do código do kit **no Bling**, envio de **fotos próprias do kit**: **fase 3**. Nesta fase o botão Publicar aparece desabilitado com o motivo, e a aba Imagens do kit mostra as fotos dos itens com o aviso de que o kit pede fotos próprias.

---

### Tarefa 1: Banco — vários anúncios por produto, `dados`, configuração do canal e versículos

**Files:**
- Modify: `prisma/schema.prisma` (modelo `Anuncio`, ~linha 282; modelos novos no fim do bloco Anúncios)
- Create: `prisma/migrations/20261001_canais_de_venda_ml/migration.sql`
- Create: `scripts/teste-anuncios-ml.js`
- Modify: `package.json` (script `teste:anuncios-ml`)

**Interfaces:**
- Produces: `Anuncio.dados Json?`; índice único parcial `Anuncio_um_por_produto` só para `BLING` e `LOJA_INTEGRADA`; `ConfigCanal { canal Canal @id, frasesFixas String[] @default([]), versiculosUsados String[] @default([]), atualizadoEm DateTime @updatedAt }`; `Versiculo { id String @id @default(cuid()), livro String, capitulo Int, inicio Int, fim Int, texto String, criadoEm DateTime @default(now()), @@unique([livro, capitulo, inicio]) }`. O runner `scripts/teste-anuncios-ml.js` com `conferir(nome, obtido, esperado)` (mesmo desenho de `scripts/teste-estoque.js`), que as tarefas seguintes ampliam com um bloco cada.

- [ ] **Step 1: Conferir que a pasta está pronta para mexer no schema**

Run: `git branch --show-current` e `git status --short`
Expected: `canais-de-venda` e o `git status --short` **vazio**. Em 01/10/2026 ele mostrava, entre outros, `prisma/schema.prisma`, `prisma/migrations/20260930_fotos_mensais/`, `prisma/migrations/20260930_movimento_estoque/`, `src/lib/margem.js` (que a Tarefa 10 usa), `src/components/produtos/LinhaProduto.jsx`, `src/app/produtos/page.jsx`, `package.json`, `CLAUDE.md`, `src/lib/coleta/normalizar.js`, `src/lib/coleta/microdata.js` e `scripts/teste-extracao.js`.
Se aparecer qualquer linha: **PARE e avise o dono.** São da outra frente (fotos mensais, edição rápida) e das correções de coleta de 30/09; pela regra do schema, eles precisam ser comitados (na `main`) e trazidos com `git merge main` antes desta migration, senão o `migrate diff` propõe apagar `FotoMensalColeta`, `FotoMensalProduto` e `MovimentoEstoque`, e os commits desta feature levariam código que não é dela.

- [ ] **Step 2: Escrever o teste do banco (falha)**

Criar `scripts/teste-anuncios-ml.js` no molde de `scripts/teste-estoque.js` (`dotenv/config`, `register` do `resolver-alias.js`, `conferir`, `limpar()` que apaga produtos `ZZ-ML-*`, `finally` com `limpar()` e `$disconnect`, saída `process.exit(falhas === 0 ? 0 : 1)`). Bloco "Banco: anuncios por canal":

```js
const p = await prisma.produto.create({ data: { sku: "ZZ-ML-1", tituloBase: "Produto de teste ML", conferido: true } });
await prisma.anuncio.create({ data: { produtoId: p.id, canal: "MERCADO_LIVRE", dados: { tipoAnuncio: "gold_special" } } });
await prisma.anuncio.create({ data: { produtoId: p.id, canal: "MERCADO_LIVRE", dados: { tipoAnuncio: "gold_pro" } } });
conferir("dois anuncios ML do mesmo produto", await prisma.anuncio.count({ where: { produtoId: p.id, canal: "MERCADO_LIVRE" } }), 2);
await prisma.anuncio.create({ data: { produtoId: p.id, canal: "BLING" } });
let recusado = false;
try { await prisma.anuncio.create({ data: { produtoId: p.id, canal: "BLING" } }); } catch (e) { recusado = e.code === "P2002"; }
conferir("Bling continua com um anuncio por produto", recusado, true);
conferir("dados volta como JSON", (await prisma.anuncio.findFirst({ where: { produtoId: p.id, canal: "MERCADO_LIVRE" }, orderBy: { criadoEm: "asc" } })).dados, { tipoAnuncio: "gold_special" });
```

Acrescentar `"teste:anuncios-ml": "node scripts/teste-anuncios-ml.js"` ao `package.json`.

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm run teste:anuncios-ml`
Expected: FALHA (o segundo anúncio ML esbarra no `@@unique` atual, ou `dados` não existe).

- [ ] **Step 4: Mudar o schema e gerar a migration**

No `Anuncio`: trocar `@@unique([produtoId, canal])` por `@@index([produtoId, canal])`, acrescentar `dados Json?` e reescrever o comentário do modelo (vários anúncios por produto no ML e na Shopee; um só no Bling e na Loja Integrada, garantido pelo índice parcial que mora só no SQL, como o `Job_fonte_aberta`; o que `dados` guarda). Acrescentar `ConfigCanal` e `Versiculo` (Interfaces acima), com comentário: o teto de 500 e o crédito vêm da licença da NVI. Gerar o SQL com `migrate diff`, tirar os dois `DROP INDEX` de `ProdutoColetado`, e acrescentar à mão, no fim:

```sql
-- Um anuncio por produto continua valendo no Bling e na Loja Integrada (o ML e a
-- Shopee aceitam varios: Classico e Premium). O Prisma nao descreve indice parcial.
CREATE UNIQUE INDEX "Anuncio_um_por_produto" ON "Anuncio" ("produtoId", "canal")
  WHERE "canal" IN ('BLING', 'LOJA_INTEGRADA');
```

Conferir que o SQL tem `DROP INDEX "Anuncio_produtoId_canal_key"` e **nenhum** `DROP TABLE`.

- [ ] **Step 5: Aplicar e regenerar**

Run: `npx prisma migrate deploy` e `npx prisma generate`
Expected: `1 migration applied`, client gerado sem erro.

- [ ] **Step 6: Rodar o teste**

Run: `npm run teste:anuncios-ml`
Expected: todas as linhas `ok`, saída 0.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261001_canais_de_venda_ml/migration.sql scripts/teste-anuncios-ml.js package.json
git commit -m "Banco: varios anuncios ML por produto, dados do anuncio, configuracao do canal e versiculos"
```

---

### Tarefa 2: Regras da composição e custo do produto

**Files:**
- Create: `src/lib/canaisDeVenda/composicao.js` (sem imports)
- Create: `src/lib/canaisDeVenda/custo.js` (sem imports)
- Modify: `scripts/teste-anuncios-ml.js` (bloco "Composicao e custo")

**Interfaces:**
- Produces (todas puras):
  - `codigoDaComposicao(sku: string, quantidade: number) => string`
  - `unidadesDaComposicao(itens: {produtoId, quantidade}[]) => number`
  - `errosDaComposicao(itens) => string[]`
  - `custoDaComposicao(itens, custoPorId: {[id]: number|null}) => {valor: number|null, faltando: string[]}`
  - `estoqueDaComposicao(itens, estoquePorId: {[id]: number}) => number`
  - `pesoDaComposicao(itens, pesoPorId: {[id]: number|null}) => number|null`
  - `blocoItensInclusos(codigo: string, itens, tituloPorId: {[id]: string}) => string`
  - `trocarItensInclusos(texto: string, bloco: string) => string`
  - `proximoCodigoDaFaixa(codigos: string[]) => string|null`
  - `custoDoProduto({fornecedores: {padrao, precoCusto}[], fornecedorRascunho, custo}) => {valor: number|null, origem: "fornecedor padrao"|"rascunho do Bling"|"cadastro"|null}`

- [ ] **Step 1: Escrever os testes (falham)**

```js
const itens = [{ produtoId: "a", quantidade: 2 }, { produtoId: "b", quantidade: 3 }];
conferir("codigo de um produto so", codigoDaComposicao("100101", 5), "100101_5");
conferir("milhar com ponto, como no Bling", codigoDaComposicao("920302", 1000), "920302_1.000");
conferir("unidades somam os itens", unidadesDaComposicao(itens), 5);
conferir("composicao valida", errosDaComposicao(itens), []);
conferir("quantidade fora do normal", ["0", -1, 2.5, "abc", "", 10000].map((q) => errosDaComposicao([{ produtoId: "a", quantidade: q }, { produtoId: "b", quantidade: 1 }])[0]),
  Array(6).fill("Item 1: a quantidade deve ser um numero inteiro de 1 a 9999."));
conferir("menos de 2 unidades", errosDaComposicao([{ produtoId: "a", quantidade: 1 }]), ["A composicao precisa de ao menos 2 unidades."]);
conferir("produto repetido", errosDaComposicao([{ produtoId: "a", quantidade: 1 }, { produtoId: "a", quantidade: 1 }]), ["O mesmo produto aparece em mais de um item."]);
conferir("sem itens", errosDaComposicao([]), ["Inclua ao menos um produto na composicao."]);
conferir("custo soma quantidade x custo", custoDaComposicao(itens, { a: 10, b: 1.5 }), { valor: 24.5, faltando: [] });
conferir("custo some quando falta um", custoDaComposicao(itens, { a: 10, b: null }), { valor: null, faltando: ["b"] });
conferir("estoque e o menor inteiro", estoqueDaComposicao(itens, { a: 9, b: 7 }), 2);
conferir("estoque negativo conta como zero", estoqueDaComposicao(itens, { a: -4, b: 7 }), 0);
conferir("peso soma peso x quantidade", pesoDaComposicao([{ produtoId: "a", quantidade: 2 }], { a: 0.055 }), 0.11);
conferir("peso some quando falta um", pesoDaComposicao(itens, { a: 0.1, b: null }), null);
conferir("bloco de itens inclusos", blocoItensInclusos("100101_5", [{ produtoId: "a", quantidade: 5 }], { a: "Resistor 1K 1/4W" }),
  "Itens inclusos: (Cod:100101_5)\n- 05 Resistor 1K 1/4W;");
const comSecao = "TITULO\n\nTexto.\n\nItens inclusos: (Cod:100101)\n- 01 Resistor;\n\nGarantia:\n- 90 dias;";
conferir("troca a secao existente", trocarItensInclusos(comSecao, "Itens inclusos: (Cod:K1)\n- 02 X;"),
  "TITULO\n\nTexto.\n\nItens inclusos: (Cod:K1)\n- 02 X;\n\nGarantia:\n- 90 dias;");
conferir("sem secao, entra antes da Garantia", trocarItensInclusos("Texto.\n\nGarantia:\n- 90 dias;", "Itens inclusos:\n- 02 X;"),
  "Texto.\n\nItens inclusos:\n- 02 X;\n\nGarantia:\n- 90 dias;");
conferir("sem secao nem Garantia, vai no fim", trocarItensInclusos("Texto.", "Itens inclusos:\n- 02 X;"), "Texto.\n\nItens inclusos:\n- 02 X;");
conferir("proximo da faixa 25xxxx", proximoCodigoDaFaixa(["250001", "250010", "100101", "250010_5"]), "250011");
conferir("faixa vazia comeca em 250001", proximoCodigoDaFaixa([]), "250001");
conferir("faixa cheia", proximoCodigoDaFaixa(["259999"]), null);
conferir("custo do fornecedor padrao", custoDoProduto({ fornecedores: [{ padrao: false, precoCusto: 3 }, { padrao: true, precoCusto: 12.5 }], fornecedorRascunho: { precoCusto: 9 }, custo: 7 }), { valor: 12.5, origem: "fornecedor padrao" });
conferir("sem padrao, rascunho do Bling", custoDoProduto({ fornecedores: [], fornecedorRascunho: { precoCusto: 9 }, custo: 7 }), { valor: 9, origem: "rascunho do Bling" });
conferir("sem os dois, cadastro", custoDoProduto({ fornecedores: [], fornecedorRascunho: null, custo: 7 }), { valor: 7, origem: "cadastro" });
conferir("sem custo nenhum", custoDoProduto({ fornecedores: [], fornecedorRascunho: null, custo: null }), { valor: null, origem: null });
```

- [ ] **Step 2: Rodar e ver falhar** — `npm run teste:anuncios-ml`, FALHA (`composicao.js` não existe).

- [ ] **Step 3: Implementar `composicao.js` e `custo.js`**

Valores em reais e quilos arredondados no fim (centavos e gramas), para `24.5` e `0.11` não virarem `24.499999`. O milhar do código usa `Intl.NumberFormat("pt-BR")` — é como os kits reais do Bling escrevem (`920302_1.000`). `trocarItensInclusos`: a seção começa na linha que abre com `Itens inclusos` (sem diferenciar caixa) e termina antes da primeira linha em branco; sem seção, o bloco entra antes da linha `Garantia:` com uma linha em branco depois; sem as duas, vai no fim após uma linha em branco. `proximoCodigoDaFaixa` considera só códigos de 6 dígitos de 250001 a 259999 e devolve o maior mais um (o mesmo critério de `gerarSku` em `src/app/produtos/acoes.js`: código de produto excluído não volta). `custoDoProduto` segue a ordem de `src/lib/coleta/fotos.js` (fornecedor padrão, rascunho do Bling, cadastro), ignorando valor não positivo.

- [ ] **Step 4: Rodar e ver passar** — `npm run teste:anuncios-ml`, todas `ok`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canaisDeVenda/composicao.js src/lib/canaisDeVenda/custo.js scripts/teste-anuncios-ml.js
git commit -m "Canais de Venda: regras da composicao e custo do fornecedor padrao"
```

---

### Tarefa 3: Versículos — referência, crédito, regra dos 25%, teto e sorteio

**Files:**
- Create: `src/lib/canaisDeVenda/versiculos.js` (sem imports)
- Modify: `scripts/teste-anuncios-ml.js` (bloco "Versiculos")

**Interfaces:**
- Produces (puras). Versículo = `{livro: "Salmos"|"Provérbios", capitulo, inicio, fim, texto}` (o do banco tem também `id`):
  - `LIVROS = ["Salmos", "Provérbios"]`, `CAPITULOS = {Salmos: 150, "Provérbios": 31}`, `TETO_DE_VERSICULOS = 500`
  - `referenciaDoVersiculo(v) => string`
  - `linhaDoVersiculo(v) => string`
  - `contarVersiculos(lista) => number`
  - `errosDoVersiculo(v) => string[]`
  - `podeAcrescentar(lista, novo) => {ok: true} | {ok: false, erro: string}`
  - `cabeNaDescricao(linha: string, resto: string) => boolean`
  - `sortearVersiculo({lista, usados: string[], excluir?: string[], resto: string, aleatorio?: () => number}) => {versiculo, reiniciou: boolean} | {versiculo: null, motivo: string}` (usados e excluir são referências)

- [ ] **Step 1: Escrever os testes (falham)**

```js
const sl23 = { livro: "Salmos", capitulo: 23, inicio: 1, fim: 1, texto: "O SENHOR é o meu pastor; de nada terei falta." };
const pv3 = { livro: "Provérbios", capitulo: 3, inicio: 5, fim: 6, texto: "x".repeat(150) };
conferir("referencia de um versiculo", referenciaDoVersiculo(sl23), "Salmos 23:1");
conferir("referencia de faixa", referenciaDoVersiculo(pv3), "Provérbios 3:5-6");
conferir("linha com o credito da NVI", linhaDoVersiculo(sl23), "“O SENHOR é o meu pastor; de nada terei falta.” Salmos 23:1 (NVI)");
conferir("faixa conta cada versiculo", contarVersiculos([sl23, pv3]), 3);
conferir("versiculo valido", errosDoVersiculo(sl23), []);
conferir("livro fora da lista", errosDoVersiculo({ ...sl23, livro: "Isaías" }), ["Use Salmos ou Provérbios."]);
conferir("capitulo que nao existe", errosDoVersiculo({ ...sl23, livro: "Provérbios", capitulo: 32 }), ["Provérbios tem 31 capitulos."]);
conferir("fim antes do inicio", errosDoVersiculo({ ...sl23, inicio: 4, fim: 3 }), ["O versiculo final nao pode vir antes do inicial."]);
conferir("texto vazio", errosDoVersiculo({ ...sl23, texto: "  " }), ["Cole o texto do versiculo."]);
const cheia = Array.from({ length: 499 }, (_, i) => ({ ...sl23, capitulo: 1 + (i % 150), inicio: 1 + i }));
conferir("cabe o 500o", podeAcrescentar(cheia, sl23), { ok: true });
conferir("passa de 500", podeAcrescentar(cheia, pv3), { ok: false, erro: "A lista ficaria com 501 versiculos. O limite da NVI sem autorizacao da Biblica e 500." });
conferir("25%: cabe", cabeNaDescricao("v".repeat(100), "r".repeat(400)), true);
conferir("25%: nao cabe", cabeNaDescricao("v".repeat(100), "r".repeat(250)), false);
const lista = [sl23, { ...sl23, capitulo: 24 }, { ...sl23, capitulo: 25 }];
conferir("sorteio pula os ja usados", sortearVersiculo({ lista, usados: ["Salmos 23:1"], resto: "r".repeat(2000), aleatorio: () => 0 }).versiculo.capitulo, 24);
conferir("sorteio respeita o excluir", sortearVersiculo({ lista, usados: [], excluir: ["Salmos 23:1", "Salmos 24:1"], resto: "r".repeat(2000), aleatorio: () => 0 }).versiculo.capitulo, 25);
conferir("todos usados: recomeca", sortearVersiculo({ lista, usados: lista.map(referenciaDoVersiculo), resto: "r".repeat(2000), aleatorio: () => 0 }).reiniciou, true);
conferir("nenhum cabe", sortearVersiculo({ lista, usados: [], resto: "curto", aleatorio: () => 0 }),
  { versiculo: null, motivo: "Nenhum versiculo da lista cabe nesta descricao: a NVI pede que a citacao fique abaixo de 25% do texto." });
conferir("lista vazia", sortearVersiculo({ lista: [], usados: [], resto: "r".repeat(2000) }), { versiculo: null, motivo: "A lista de versiculos esta vazia. Carregue-a em Configuracoes." });
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar `versiculos.js`**

`cabeNaDescricao(linha, resto)`: o texto final é `resto.trimEnd() + "\n\n" + linha`, e a regra é `4 × linha.length < texto final.length` (abaixo de 25%, estrito). `sortearVersiculo`: elegíveis = os que cabem e não estão em `excluir`; candidatos = elegíveis fora de `usados`; candidatos vazios com elegíveis = recomeça o ciclo (`reiniciou: true`, candidatos = elegíveis); escolhe `candidatos[Math.floor(aleatorio() × n)]`. Comentário no topo: o teto, o crédito e os 25% vêm da licença da NVI (Biblica), o método é o do artefato "Versículo Diário", e o histórico só ganha o versículo quando o anúncio é publicado (fase 3).

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git add src/lib/canaisDeVenda/versiculos.js scripts/teste-anuncios-ml.js` e `git commit -m "Canais de Venda: versiculos da NVI (referencia, credito, 25%, teto de 500 e sorteio)"`.

---

### Tarefa 4: Descrição do anúncio e rascunho inicial

**Files:**
- Create: `src/lib/canaisDeVenda/ml/descricao.js`
- Create: `src/lib/canaisDeVenda/ml/rascunho.js`
- Modify: `scripts/teste-anuncios-ml.js` (bloco "Descricao e rascunho inicial")

**Interfaces:**
- Consumes: Tarefa 2 (`codigoDaComposicao`, `estoqueDaComposicao`, `pesoDaComposicao`, `blocoItensInclusos`, `trocarItensInclusos`, `unidadesDaComposicao`), Tarefa 3 (`linhaDoVersiculo`).
- Produces:
  - **Contexto de produto** (o que o servidor manda para a tela, tudo `Number` ou `null`): `{id, sku, tituloBase, descricaoBase, marca, modelo, ean, conferido, blingId, precoVenda, estoque, pesoKg, alturaCm, larguraCm, comprimentoCm, custo: {valor, origem}, imagens: [{id, url, principal}]}`.
  - **Rascunho** (estado do editor e entrada do Salvar): `{produtoId, titulo, familyName, tipoAnuncio, condicao, categoriaId, preco, estoque, imagens: string[], descricao, versiculo: {livro, capitulo, inicio, fim, texto}|null, atributos: {[id]: string}, envio: {pesoKg, alturaCm, larguraCm, comprimentoCm, modo: "me2", freteGratis, retirada}, composicao: null | {itens: {produtoId, quantidade}[], codigo, blingProdutoId: null}}`.
  - `restoDaDescricao({descricao, frases}) => string` e `montarDescricaoML({descricao, frases, versiculo}) => string`
  - `rascunhoInicial({principal, produtosPorId, composicao, versiculo}) => Rascunho`
  - `aplicarComposicao(rascunho, composicao|null, produtosPorId) => Rascunho` (o editor chama quando a lista de itens muda; `null` volta a anúncio simples do principal)

- [ ] **Step 1: Escrever os testes (falham)**

Montar dois contextos de produto (`a`: sku `100101`, `tituloBase` "Resistor 1K 1/4W", `descricaoBase` com pelo menos 400 caracteres — para o versículo caber nos 25% — e uma seção `Itens inclusos` e uma `Garantia:`, marca `GENERICA`, ean `7890000000001`, `precoVenda` 0.5, estoque 100, `pesoKg` 0.001, medidas 1×1×2, imagens `img-a1` principal e `img-a2`; `b`: sku `100102`, `tituloBase` "Resistor 2K2 1/4W", estoque 30, `pesoKg` 0.002, imagem `img-b1`). Asserções:

```js
conferir("descricao junta texto, frases e versiculo", montarDescricaoML({ descricao: "Texto.\n", frases: ["Nota fiscal.", " ", "Envio rapido."], versiculo: sl23 }),
  "Texto.\n\nNota fiscal.\nEnvio rapido.\n\n“O SENHOR é o meu pastor; de nada terei falta.” Salmos 23:1 (NVI)");
conferir("sem versiculo nao sobra linha", montarDescricaoML({ descricao: "Texto.", frases: [], versiculo: null }), "Texto.");
conferir("resto e a descricao sem versiculo", restoDaDescricao({ descricao: "Texto.", frases: ["Nota fiscal."] }), "Texto.\n\nNota fiscal.");
const simples = rascunhoInicial({ principal: a, produtosPorId: { a }, composicao: null, versiculo: sl23 });
conferir("simples: titulo, preco e estoque do produto", [simples.titulo, simples.preco, simples.estoque], ["Resistor 1K 1/4W", 0.5, 100]);
conferir("simples: Classico, novo, sem categoria", [simples.tipoAnuncio, simples.condicao, simples.categoriaId], ["gold_special", "new", null]);
conferir("simples: atributos da marca e do EAN", simples.atributos, { BRAND: "GENERICA", GTIN: "7890000000001" });
conferir("simples: fotos com a principal primeiro", simples.imagens, ["img-a1", "img-a2"]);
conferir("simples: family_name e a marca quando nao ha modelo", simples.familyName, "GENERICA");
const kit = rascunhoInicial({ principal: a, produtosPorId: { a }, composicao: { itens: [{ produtoId: "a", quantidade: 5 }], codigo: "", blingProdutoId: null }, versiculo: null });
conferir("kit de um produto: codigo gerado", kit.composicao.codigo, "100101_5");
conferir("kit: preco em branco, estoque e peso calculados", [kit.preco, kit.estoque, kit.envio.pesoKg], [null, 20, 0.005]);
conferir("kit: sem GTIN", "GTIN" in kit.atributos, false);
conferir("kit: titulo sugere o kit", kit.titulo, "KIT COM 5 RESISTOR 1K 1/4W");
conferir("kit: bloco de itens inclusos na descricao", kit.descricao.includes("Itens inclusos: (Cod:100101_5)\n- 05 Resistor 1K 1/4W;"), true);
const misto = aplicarComposicao(kit, { itens: [{ produtoId: "a", quantidade: 2 }, { produtoId: "b", quantidade: 3 }], codigo: "", blingProdutoId: null }, { a, b });
conferir("misto: codigo fica para o dono digitar", misto.composicao.codigo, "");
conferir("misto: estoque e peso recalculados", [misto.estoque, misto.envio.pesoKg], [10, 0.008]);
conferir("misto: fotos dos dois produtos, sem repetir", misto.imagens, ["img-a1", "img-a2", "img-b1"]);
conferir("misto: titulo e preco que o dono ja mexeu ficam", [misto.titulo, misto.preco], [kit.titulo, kit.preco]);
conferir("desligar a composicao volta ao principal", [aplicarComposicao(misto, null, { a, b }).estoque, aplicarComposicao(misto, null, { a, b }).composicao], [100, null]);
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar `descricao.js` e `rascunho.js`**

`montarDescricaoML`: blocos (descrição aparada, frases não vazias aparadas uma por linha, linha do versículo) unidos por linha em branco, pulando os vazios. Título sugerido: produto simples = `tituloBase`; kit de um produto = `KIT COM {N} {TITULO EM MAIUSCULAS}`; kit misto = `KIT {TITULO DO PRINCIPAL EM MAIUSCULAS}` (sugestão editável; a IA melhora na fase 2). `familyName` = `marca` e `modelo` juntos com espaço; sem os dois, `tituloBase`. Atributos sem valor ficam fora do objeto. `aplicarComposicao` recalcula só o que deriva da composição — código (de um produto só; misto mantém o digitado), `produtoId` (o primeiro item), estoque, peso, fotos (principal primeiro, depois as dos outros itens, sem repetir) e o bloco "Itens inclusos" da descrição — e não toca em título, preço, categoria nem atributos, que o dono pode ter editado. Com `null` (o dono desligou a composição), volta estoque, peso e fotos do principal e a descrição-base dele inteira: o texto do kit falava de outro conteúdo.

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git add src/lib/canaisDeVenda/ml/descricao.js src/lib/canaisDeVenda/ml/rascunho.js scripts/teste-anuncios-ml.js` e `git commit -m "Canais de Venda: descricao do anuncio ML e rascunho inicial (simples e composicao)"`.

---

### Tarefa 5: Validação, prévia do payload, estado do ícone e `separarCanais`

**Files:**
- Create: `src/lib/canaisDeVenda/ml/validacao.js`
- Create: `src/lib/canaisDeVenda/ml/payload.js`
- Create: `src/lib/canaisDeVenda/ml/icone.js` (sem imports)
- Modify: `src/lib/canais.js` (`separarCanais`, ~linha 70)
- Modify: `scripts/teste-anuncios-ml.js` (bloco "Validacao, payload e icone")

**Interfaces:**
- Consumes: Tarefas 2, 3, 4; `LIMITE_TITULO` de `src/lib/anuncios/canais/mercadolivre.js` (não alterar aquele arquivo: o menu Anúncios ainda o usa).
- Produces:
  - `ABAS_ML = [{id: "geral", rotulo: "Geral"}, {id: "preco", rotulo: "Preco e estoque"}, {id: "imagens", rotulo: "Imagens"}, {id: "descricao", rotulo: "Descricao"}, {id: "ficha", rotulo: "Ficha tecnica"}, {id: "envio", rotulo: "Envio"}, {id: "previa", rotulo: "Previa e validacao"}]` (em `validacao.js`)
  - `validarRascunhoML(rascunho, contexto: {produtos: {[id]: ContextoDeProduto}, frases: string[], codigoEmUso: string|null}) => {campo, aba, problema, bloqueante}[]`
  - `montarPayloadML(rascunho, contexto) => {item: object, descricao: {plain_text}, preco: {amount, currency_id: "BRL"}, fotos: {arquivoId, nome}[]}`
  - `nomeDaFoto(titulo, indice) => string` (em `payload.js`)
  - `estadoDoIconeML(anuncios: {canal, status}[]) => {publicado: boolean, rascunho: boolean}`

- [ ] **Step 1: Escrever os testes (falham)**

Partir de `simples` (Tarefa 4) com `categoriaId: "MLB1234"`, `a.blingId = "111"`, `a.conferido = true` e medidas preenchidas — que não pode ter **nenhum** problema bloqueante — e mudar uma coisa por vez. Cada linha da tabela vira uma asserção sobre `validarRascunhoML(...).find((p) => p.campo === campo)`, conferindo `aba` e `bloqueante`:

| caso | alteração | campo | aba | bloqueante |
|---|---|---|---|---|
| título vazio | `titulo: " "` | `titulo` | geral | true |
| título com 61 | `titulo: "X".repeat(61)` | `titulo` | geral | true |
| sem family_name | `familyName: ""` | `familyName` | geral | true |
| sem categoria | `categoriaId: null` | `categoria` | geral | true |
| categoria fora do formato | `categoriaId: "1234"` | `categoria` | geral | true |
| preço zero | `preco: 0` | `preco` | preco | true |
| estoque quebrado | `estoque: 1.5` | `estoque` | preco | true |
| estoque zero | `estoque: 0` | `estoque` | preco | false |
| sem fotos | `imagens: []` | `imagens` | imagens | true |
| descrição vazia | `descricao: ""` | `descricao` | descricao | true |
| sem versículo | `versiculo: null` | `versiculo` | descricao | false |
| versículo passa de 25% | `descricao: "curta"`, frases `[]` | `versiculo` | descricao | true |
| sem GTIN em produto simples | `atributos: {BRAND: "GENERICA"}` | `GTIN` | ficha | false |
| sem peso | `envio.pesoKg: null` | `peso` | envio | true |
| sem dimensões | `envio.alturaCm: 0` | `dimensoes` | envio | true |
| produto não Conferido | contexto com `a.conferido = false` | `produto` | geral | true |
| produto sem blingId | contexto com `a.blingId = null` | `blingId` | geral | true |
| kit: código em uso | `kit`, `contexto.codigoEmUso = "o produto 100101_5 do cadastro"` | `codigoKit` | geral | true |
| kit misto sem código | `misto` (código `""`) | `codigoKit` | geral | true |
| kit: item sem blingId | `misto` com `b.blingId = null` | `item:b` | geral | true |
| kit: menos de 2 unidades | composição `[{produtoId: "a", quantidade: 1}]` | `composicao` | geral | true |

E também (`kitOk` = `kit` com categoria, preço 2 e tudo preenchido; `ctx` = contexto com `frases: ["Nota fiscal."]`):

```js
conferir("kit sem GTIN nao gera alerta", validarRascunhoML(kitOk, ctx).some((p) => p.campo === "GTIN"), false);
conferir("kit sem foto propria alerta", validarRascunhoML(kitOk, ctx).find((p) => p.campo === "fotosDoKit")?.bloqueante, false);
const payload = montarPayloadML({ ...simples, categoriaId: "MLB1234" }, ctx);
conferir("payload nasce pausado, sem preco no item", [payload.item.status, "price" in payload.item], ["paused", false]);
conferir("payload leva o SKU do produto", payload.item.attributes.find((x) => x.id === "SELLER_SKU").value_name, "100101");
conferir("payload do kit leva o codigo do kit", montarPayloadML(kitOk, ctx).item.attributes.find((x) => x.id === "SELLER_SKU").value_name, "100101_5");
conferir("preco vai a parte", payload.preco, { amount: 0.5, currency_id: "BRL" });
conferir("descricao final no payload", payload.descricao.plain_text, montarDescricaoML({ ...simples, frases: ctx.frases }));
conferir("nome legivel da foto", nomeDaFoto("Placa Uno R3 CH340 + Cabo", 0), "placa-uno-r3-ch340-cabo-1.jpg");
conferir("icone: sem anuncio", estadoDoIconeML([]), { publicado: false, rascunho: false });
conferir("icone: publicado e rascunho juntos", estadoDoIconeML([{ canal: "MERCADO_LIVRE", status: "PUBLICADO" }, { canal: "MERCADO_LIVRE", status: "RASCUNHO" }, { canal: "BLING", status: "RASCUNHO" }]), { publicado: true, rascunho: true });
const { integrados } = separarCanais([{ canal: "MERCADO_LIVRE", status: "PUBLICADO", idExterno: "MLB1" }, { canal: "MERCADO_LIVRE", status: "RASCUNHO", idExterno: null }]);
conferir("separarCanais nao esconde o publicado atras do rascunho", integrados.map((c) => c.idExterno), ["MLB1"]);
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**

`validacao.js`: as regras da tabela, cada problema com mensagem em português sem acento (`"O titulo tem 61 caracteres; o limite do Mercado Livre e 60."`, `"Este produto nao esta Conferido. So produto Conferido vira anuncio."`, `"Produto sem blingId: o anuncio nao podera ser publicado."`, `"O codigo {codigo} ja e usado por {codigoEmUso}."`). A regra dos 25% usa `cabeNaDescricao(linhaDoVersiculo(v), restoDaDescricao(...))`. Categoria: `^MLB\d+$`. Erros da composição vêm de `errosDaComposicao` (campo `composicao`). `payload.js`: o item segue o `montarPayload` antigo (título cortado em 60, `currency_id`, `listing_type_id`, `condition`, `status: "paused"`, atributos, sem preço) e acrescenta `family_name`, `available_quantity`, `SELLER_SKU`, `shipping: {mode: "me2", free_shipping, local_pick_up, dimensions: "{A}x{L}x{C},{gramas}"}` e `pictures` só com os nomes (o envio binário é da fase 3; o formato de `dimensions` é conferido na Tarefa 16). `nomeDaFoto`: sem acento, minúsculas, não alfanumérico vira `-`, sem `-` repetido nem nas pontas, até 60 caracteres, `-{indice + 1}.jpg`. `separarCanais`: ao montar o mapa por canal, o anúncio com `idExterno` vence o sem; comentário dizendo que desde a fase 1 o ML tem vários anúncios por produto.

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git add src/lib/canaisDeVenda/ml/validacao.js src/lib/canaisDeVenda/ml/payload.js src/lib/canaisDeVenda/ml/icone.js src/lib/canais.js scripts/teste-anuncios-ml.js` e `git commit -m "Canais de Venda: validacao do rascunho ML, previa do payload e estado do icone"`.

---

### Tarefa 6: Configuração do canal no banco — frases fixas e lista de versículos

**Files:**
- Create: `src/lib/canaisDeVenda/configuracao.js`
- Modify: `scripts/teste-anuncios-ml.js` (bloco "Configuracao (banco)")

**Interfaces:**
- Consumes: Tarefa 1 (`ConfigCanal`, `Versiculo`), Tarefa 3.
- Produces:
  - `lerConfigML() => Promise<{frases: string[], usados: string[]}>` (sem linha no banco, devolve listas vazias sem criar)
  - `gravarFrases(texto: string) => Promise<{ok: true, frases: string[]} | {ok: false, erro}>` — uma frase por linha
  - `listarVersiculos() => Promise<Versiculo[]>` (ordem: livro, capítulo, início)
  - `adicionarVersiculo(entrada) => Promise<{ok: true, id} | {ok: false, erro}>`
  - `removerVersiculo(id) => Promise<{ok: boolean, erro?}>`
  - `carregarVersiculosIniciais(lista) => Promise<{carregados: number, existentes: number}>`
  - `sortearVersiculoDoBanco({excluir?: string[], resto: string}) => Promise<{versiculo, reiniciou} | {versiculo: null, motivo}>`

- [ ] **Step 1: Escrever os testes (falham)**

A configuração e a lista são dados reais do dono: o teste guarda a linha `ConfigCanal` do `MERCADO_LIVRE` no início e a devolve no `finally`, e só cria e apaga **um** versículo que ainda não esteja na lista (procura um `Salmos 119:N` livre).

```js
const configAntes = await prisma.configCanal.findUnique({ where: { canal: "MERCADO_LIVRE" } });
try {
  conferir("frases: uma por linha, aparadas e sem repetir", (await gravarFrases("  Nota fiscal em todos.\n\nNota fiscal em todos.\nEnvio no mesmo dia. ")).frases, ["Nota fiscal em todos.", "Envio no mesmo dia."]);
  conferir("frases: lidas de volta", (await lerConfigML()).frases, ["Nota fiscal em todos.", "Envio no mesmo dia."]);
  conferir("frases: mais de 10 e recusado", (await gravarFrases(Array.from({ length: 11 }, (_, i) => `F${i}`).join("\n"))).ok, false);
  conferir("frases: frase acima de 200 caracteres e recusada", (await gravarFrases("x".repeat(201))).ok, false);
  const atuais = await listarVersiculos();
  const livre = Array.from({ length: 176 }, (_, i) => i + 1).find((n) => !atuais.some((v) => v.livro === "Salmos" && v.capitulo === 119 && v.inicio === n));
  const novo = await adicionarVersiculo({ livro: "Salmos", capitulo: 119, inicio: livre, fim: livre, texto: "Texto de teste." });
  conferir("versiculo entra", [novo.ok, (await listarVersiculos()).length], [true, atuais.length + 1]);
  conferir("versiculo repetido e recusado", (await adicionarVersiculo({ livro: "Salmos", capitulo: 119, inicio: livre, fim: livre, texto: "Outro." })).erro, "Este versiculo ja esta na lista.");
  conferir("versiculo invalido e recusado", (await adicionarVersiculo({ livro: "Isaías", capitulo: 1, inicio: 1, fim: 1, texto: "x" })).ok, false);
  const outros = (await listarVersiculos()).filter((v) => v.id !== novo.id).map(referenciaDoVersiculo);
  conferir("sorteio do banco nunca devolve o excluido", (await sortearVersiculoDoBanco({ excluir: outros, resto: "r".repeat(2000) })).versiculo?.inicio, livre);
  conferir("versiculo sai", [(await removerVersiculo(novo.id)).ok, (await listarVersiculos()).length], [true, atuais.length]);
  if (atuais.length > 0) conferir("carga inicial nao mexe em lista que ja tem versiculo", (await carregarVersiculosIniciais([sl23])).carregados, 0);
} finally {
  if (configAntes) await prisma.configCanal.update({ where: { canal: "MERCADO_LIVRE" }, data: { frasesFixas: configAntes.frasesFixas, versiculosUsados: configAntes.versiculosUsados } });
  else await prisma.configCanal.deleteMany({ where: { canal: "MERCADO_LIVRE" } });
}
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar `configuracao.js`**

`gravarFrases` usa `upsert` na linha `MERCADO_LIVRE`. Limites: 10 frases, 200 caracteres cada (constantes no topo, com o porquê: a descrição tem que continuar sendo do produto, e as frases entram no denominador dos 25%). `adicionarVersiculo` valida com `errosDoVersiculo` e `podeAcrescentar` (lendo a lista atual) e traduz o `P2002` em `"Este versiculo ja esta na lista."`. `carregarVersiculosIniciais` só carrega com a tabela **vazia** (depois disso a lista é do dono, e recarregar devolveria o que ele tirou), confere o teto antes de gravar e usa `createMany`. `sortearVersiculoDoBanco` junta `listarVersiculos`, `lerConfigML().usados` e `sortearVersiculo`.

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git add src/lib/canaisDeVenda/configuracao.js scripts/teste-anuncios-ml.js` e `git commit -m "Canais de Venda: frases fixas e lista de versiculos no banco"`.

---

### Tarefa 7: Rascunho no banco — contexto, novo, carregar, salvar, conferências do servidor e lista

**Files:**
- Create: `src/lib/canaisDeVenda/ml/esquema.js` (zod)
- Create: `src/lib/canaisDeVenda/ml/banco.js`
- Modify: `scripts/teste-anuncios-ml.js` (bloco "Rascunho (banco)")

**Interfaces:**
- Consumes: Tarefas 2–6; `urlDe` de `src/lib/arquivos.js`; `prisma` de `src/lib/db.js`.
- Produces:
  - `RascunhoMLSchema` (zod) — valida a forma do Rascunho da Tarefa 4 e converte números; não aplica regra de negócio (essa fica na validação, que não impede salvar rascunho).
  - `contextoDosProdutos(ids: string[]) => Promise<{[id]: ContextoDeProduto}>`
  - `buscarProdutoParaAnuncio(codigo: string) => Promise<{ok: true, produto: ContextoDeProduto} | {ok: false, erro}>`
  - `novoRascunhoML(produtoId: string) => Promise<{ok: true, rascunho, contexto} | {ok: false, erro}>` — não grava nada
  - `carregarAnuncioML(id: string) => Promise<{ok: true, anuncioId, status, rascunho, contexto} | {ok: false, erro}>`
  - `codigoEmUso(codigo: string, {anuncioId: string|null, itens}) => Promise<string|null>`
  - `sugerirCodigoDeKit() => Promise<string|null>`
  - `salvarRascunhoML(anuncioId: string|null, entrada) => Promise<{ok: true, id} | {ok: false, erro}>`
  - `anunciosMLDoProduto(produtoId) => Promise<{id, titulo, tipoAnuncio, codigo, status, atualizadoEm}[]>`
  - `listarAnunciosML({busca?: string, pagina?: number}) => Promise<{linhas: {id, codigo, titulo, tipoAnuncio, preco, status, atualizadoEm}[], total, pagina, totalPaginas}>` (100 por página)
  - Onde cada campo do Rascunho mora: `titulo` → `Anuncio.titulo`, `descricao` → `Anuncio.descricao`, `categoriaId` → `Anuncio.categoriaExternaId`, `atributos` → `Anuncio.atributos`, `produtoId` → `Anuncio.produtoId`, todo o resto → `Anuncio.dados`. `contexto` = `{produtos, frases, codigoEmUso}` (o da Tarefa 5).

- [ ] **Step 1: Escrever os testes (falham)**

Criar `ZZ-ML-1` (Conferido, `blingId` "111", `precoVenda` 10, estoque 9, `pesoKg` 0.05, medidas 2×3×4, `descricaoBase` com 1.500 caracteres, um `ProdutoFornecedor` padrão com `precoCusto` 4 — criar um `Fornecedor` "ZZ Fornecedor ML" e apagá-lo no `finally`), `ZZ-ML-2` (Conferido, `blingId` "222", estoque 7), `ZZ-ML-3` (**não** Conferido) e `ZZ-ML-4` (Conferido, `descricaoBase: "curta"`).

```js
conferir("contexto: custo do fornecedor padrao", (await contextoDosProdutos([p1.id]))[p1.id].custo, { valor: 4, origem: "fornecedor padrao" });
conferir("busca por codigo acha o Conferido", (await buscarProdutoParaAnuncio("ZZ-ML-1")).produto.id, p1.id);
conferir("busca recusa o nao Conferido", (await buscarProdutoParaAnuncio("ZZ-ML-3")).erro, "O produto ZZ-ML-3 ainda nao foi Conferido. So produto Conferido vira anuncio.");
conferir("busca: codigo que nao existe", (await buscarProdutoParaAnuncio("ZZ-ML-NAO")).erro, "Nenhum produto com o codigo ZZ-ML-NAO.");
const novo = await novoRascunhoML(p1.id);
conferir("novo rascunho nao grava nada", [novo.ok, await prisma.anuncio.count({ where: { produtoId: p1.id } })], [true, 0]);
conferir("novo rascunho nao Conferido e recusado", (await novoRascunhoML(p3.id)).ok, false);
const curto = await novoRascunhoML(p4.id);
conferir("descricao curta: nasce sem versiculo e sem erro", [curto.ok, curto.rascunho.versiculo], [true, null]);
const salvo = await salvarRascunhoML(null, { ...novo.rascunho, tipoAnuncio: "gold_special" });
const premium = await salvarRascunhoML(null, { ...novo.rascunho, tipoAnuncio: "gold_pro" });
conferir("salva dois rascunhos do mesmo produto", [salvo.ok, premium.ok, (await anunciosMLDoProduto(p1.id)).length], [true, true, 2]);
conferir("salvo e RASCUNHO", (await prisma.anuncio.findUnique({ where: { id: salvo.id } })).status, "RASCUNHO");
const lido = await carregarAnuncioML(salvo.id);
conferir("carregar devolve o que foi salvo", [lido.rascunho.titulo, lido.rascunho.tipoAnuncio, lido.rascunho.envio.pesoKg], [novo.rascunho.titulo, "gold_special", 0.05]);
await prisma.produto.update({ where: { id: p1.id }, data: { conferido: false } });
conferir("produto que deixou de ser Conferido: salvar recusa", (await salvarRascunhoML(salvo.id, lido.rascunho)).erro, "O produto ZZ-ML-1 nao esta mais Conferido. Confira o cadastro antes de salvar o anuncio.");
await prisma.produto.update({ where: { id: p1.id }, data: { conferido: true } });
conferir("item de kit nao Conferido recusa", (await salvarRascunhoML(null, { ...novo.rascunho, composicao: { itens: [{ produtoId: p1.id, quantidade: 1 }, { produtoId: p3.id, quantidade: 1 }], codigo: "250999", blingProdutoId: null } })).ok, false);
const kitA = { ...novo.rascunho, composicao: { itens: [{ produtoId: p1.id, quantidade: 2 }, { produtoId: p2.id, quantidade: 3 }], codigo: "ZZ-ML-KIT", blingProdutoId: null } };
const k1 = await salvarRascunhoML(null, kitA);
conferir("kit misto salva", k1.ok, true);
conferir("mesmo codigo, mesma composicao em outra ordem: aceito", (await salvarRascunhoML(null, { ...kitA, tipoAnuncio: "gold_pro", composicao: { ...kitA.composicao, itens: [...kitA.composicao.itens].reverse() } })).ok, true);
conferir("mesmo codigo, composicao diferente: recusado", (await codigoEmUso("ZZ-ML-KIT", { anuncioId: null, itens: [{ produtoId: p1.id, quantidade: 5 }] })) !== null, true);
conferir("codigo igual ao SKU de um produto: recusado", await codigoEmUso("ZZ-ML-2", { anuncioId: null, itens: kitA.composicao.itens }), "o produto ZZ-ML-2 do cadastro");
const k2 = await salvarRascunhoML(null, { ...kitA, composicao: { ...kitA.composicao, codigo: "ZZ-ML-KIT2" } });
conferir("o proprio anuncio nao conta como uso", await codigoEmUso("ZZ-ML-KIT2", { anuncioId: k2.id, itens: [{ produtoId: p1.id, quantidade: 5 }] }), null);
const umSo = await salvarRascunhoML(null, { ...novo.rascunho, composicao: { itens: [{ produtoId: p1.id, quantidade: 5 }], codigo: "qualquer", blingProdutoId: null } });
conferir("kit de um produto: o servidor refaz o codigo", (await carregarAnuncioML(umSo.id)).rascunho.composicao.codigo, "ZZ-ML-1_5");
conferir("lista traz os anuncios de teste", (await listarAnunciosML({ busca: "ZZ-ML" })).total >= 6, true);
conferir("entrada fora da forma e recusada", (await salvarRascunhoML(null, { produtoId: p1.id, titulo: 42 })).ok, false);
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar `esquema.js` e `banco.js`**

`salvarRascunhoML`: (1) `RascunhoMLSchema.safeParse` (falha = `"O rascunho chegou incompleto. Recarregue a tela."`); (2) no kit de um produto, refaz o código com `codigoDaComposicao` (não confia no que veio da tela) e põe `produtoId` = primeiro item; (3) lê o principal e todos os itens e recusa o que não existe (`"O produto {sku} foi excluido."`) ou não está Conferido; (4) com composição, `errosDaComposicao` vazio e `codigoEmUso` nulo, senão recusa com a mensagem; (5) grava (`create` com `canal: "MERCADO_LIVRE"`, `status: "RASCUNHO"`; ou `update` só se o anúncio for do ML e não estiver `PUBLICADO`). Problema da validação **não** impede salvar: é rascunho. `codigoEmUso`: `Produto.sku` igual → `"o produto {sku} do cadastro"`; outro anúncio ML (que não este) com `dados.composicao.codigo` igual e itens diferentes (mesmos produtos e quantidades, em qualquer ordem, contam como iguais) → `"o anuncio \"{titulo}\" com outra composicao"`. `sugerirCodigoDeKit` usa `proximoCodigoDaFaixa` sobre os SKUs `25…` e os códigos de kit dos anúncios. `novoRascunhoML` sorteia o versículo com `resto` = descrição inicial + frases. `listarAnunciosML` busca em título e código (SKU do principal ou código do kit), ordem `atualizadoEm` desc.

- [ ] **Step 4: Rodar e ver passar.**

- [ ] **Step 5: Commit** — `git add src/lib/canaisDeVenda/ml/esquema.js src/lib/canaisDeVenda/ml/banco.js scripts/teste-anuncios-ml.js` e `git commit -m "Canais de Venda: rascunho ML no banco, com Conferido e codigo do kit conferidos no servidor"`.

---

### Tarefa 8: Ações do servidor, menu e página Canais de Venda

**Files:**
- Create: `src/app/canais-de-venda/mercado-livre/acoes.js` (`"use server"`)
- Create: `src/lib/canaisDeVenda/catalogo.js`
- Create: `src/app/canais-de-venda/page.jsx`
- Modify: `src/lib/blocos.js` (entrada nova logo depois de `Anuncios`)
- Modify: `src/components/ui/CartaoDeAtalho.jsx` (prop `emBreve`)

**Interfaces:**
- Consumes: Tarefas 6 e 7.
- Produces (Server Actions; todas devolvem `{ok, ...}`; as que gravam chamam `revalidatePath("/canais-de-venda/mercado-livre")` e `revalidatePath("/produtos")`): `abrirNovoAnuncioML(produtoId)`, `abrirAnuncioML(id)`, `listarAnunciosDoProdutoML(produtoId)` (devolve também `{conferido, sku, tituloBase}` do produto), `salvarAnuncioML(id|null, rascunho)`, `buscarItemDeComposicao(codigo)`, `conferirCodigoDeKit(codigo, anuncioId, itens)` (→ `{ok, codigoEmUso}`), `sugerirCodigoKit()`, `outroVersiculo(excluir: string[], resto: string)`, `salvarFrasesFixas(texto)`, `incluirVersiculo(dados)`, `excluirVersiculo(id)`.
- `CANAIS_DE_VENDA` em `catalogo.js`: `{href, rotulo, icone, resumo, detalhe?, emBreve?}`; Mercado Livre (`/canais-de-venda/mercado-livre`), Loja Integrada e Shopee com `emBreve: true`.

- [ ] **Step 1: Implementar as ações** — finas, no molde de `src/app/produtos/acoes-edicao-rapida.js` (só chamam as funções das Tarefas 6 e 7 e revalidam).

- [ ] **Step 2: Menu e cartões**

`blocos.js`: `{href: "/canais-de-venda", rotulo: "Canais de Venda", icone: Store, resumo: "Criar e gerenciar anuncios no Mercado Livre, na Loja Integrada e na Shopee", pronto: true}`, com comentário (pedido do dono em 30/09/2026; cartões na página, como Ferramentas e Cadastros). `CartaoDeAtalho` com `emBreve`: o mesmo cartão como `<div>` sem link, com opacidade reduzida e o selo `em breve` no lugar da seta. A página `/canais-de-venda` repete o desenho de `src/app/ferramentas/page.jsx` (`PageHeader` "Canais de Venda", grade de cartões).

- [ ] **Step 3: Conferir** — `npm run lint` sem erro; `npm run teste:anuncios-ml` todo `ok`; no navegador (porta 3002), `/canais-de-venda` mostra os três cartões, o do ML aponta para `/canais-de-venda/mercado-livre` (404 por enquanto, esperado) e os outros dois não são clicáveis; o item aparece no menu lateral.

- [ ] **Step 4: Commit** — `git add src/app/canais-de-venda/mercado-livre/acoes.js src/lib/canaisDeVenda/catalogo.js src/app/canais-de-venda/page.jsx src/lib/blocos.js src/components/ui/CartaoDeAtalho.jsx` e `git commit -m "Canais de Venda: menu, cartoes e acoes do servidor do Mercado Livre"`.

---

### Tarefa 9: Editor do anúncio — casca, Salvar/Publicar e aba Geral com a composição

**Files:**
- Create: `src/components/anuncios/ml/EditorAnuncioML.jsx`
- Create: `src/components/anuncios/ml/AbaGeral.jsx`
- Create: `src/components/anuncios/ml/BlocoComposicao.jsx`
- Create: `src/components/anuncios/ml/AbaEmBreve.jsx` (marcador temporário das abas das Tarefas 10 e 11; sai na Tarefa 11)

**Interfaces:**
- Consumes: `ABAS_ML`, `validarRascunhoML` (Tarefa 5), `aplicarComposicao` (Tarefa 4), ações da Tarefa 8, `BarraDeAbas` e `Painel` de `src/components/cadastros/Abas.jsx`, `BolhaDeAjuda`.
- Produces: `<EditorAnuncioML anuncioId={string|null} rascunhoInicial={Rascunho} contextoInicial={Contexto} status={string|null} modo={"pagina"|"janela"} aoSalvar={(id) => void} aoFechar={() => void} />` (`aoFechar` só no modo janela). Toda aba recebe `{rascunho, contexto, alterar, setContexto, problemas, irPara}`: `alterar(parcial)` mescla raso (para `envio` e `atributos`, a aba manda o objeto inteiro); `problemas` já filtrados pela aba; `irPara(abaId)` troca de aba.

- [ ] **Step 1: Casca do editor**

Estado controlado (`rascunho`, `contexto`, `aba`, `mensagem`, `alterado`); os problemas saem de `validarRascunhoML` a cada render (`useMemo`). As 7 abas na `BarraDeAbas`, com ponto vermelho na aba que tem problema **bloqueante**; as abas ainda não feitas usam `AbaEmBreve`. Rodapé fixo: **Salvar** (sempre habilitado; `startTransition` chamando `salvarAnuncioML`; sucesso mostra "Rascunho salvo.", zera `alterado` e chama `aoSalvar(id)`; recusa mostra o erro no topo, em vermelho, **sem tocar no estado** — Review Focus 1) e **Publicar** desabilitado, com `title` listando os motivos: sempre `"A publicacao entra na fase 3."`, mais `"Produto sem blingId."` quando for o caso e `"{n} problema(s) bloqueante(s) na Previa."`. No modo janela, fechar com `alterado` abre um popup "Sair sem salvar?" (nunca `confirm()`).

- [ ] **Step 2: Aba Geral**

Campos: Titulo (contador `n/60`, vermelho acima de 60), Nome da familia (`family_name`, bolha "Obrigatorio no modelo User Products do ML"), Tipo de anuncio (Classico/Premium, opções lado a lado no padrão `EscolhaDoTipo`), Condicao (Novo/Usado), Categoria do ML (texto `MLB…`, bolha "A sugestao automatica entra na fase 2"). Acima de tudo, o produto principal (código, nome, Conferido, `blingId` ou "sem blingId") e a caixa **"Anuncio de composicao (kit)"**, que abre o `BlocoComposicao` (ligar a caixa chama `aplicarComposicao` com `[{principal, 2}]`; desligar, com `null`). Cada problema da aba aparece embaixo do seu campo.

- [ ] **Step 3: Bloco da composição**

Lista de itens (código, nome, quantidade editável, subir/descer, remover; o primeiro é o principal); "Incluir produto" por código, chamando `buscarItemDeComposicao` (o erro da ação aparece na linha; o produto achado entra em `contexto.produtos`). Com um item só, o código do kit aparece gerado e só leitura; com dois ou mais, campo **Codigo do kit** com o botão "Sugerir" (`sugerirCodigoKit`) e conferência ao sair do campo (`conferirCodigoDeKit` → grava `contexto.codigoEmUso`). Toda mudança na lista passa por `aplicarComposicao`.

- [ ] **Step 4: Conferir** — `npm run lint` sem erro. A verificação no navegador fica para a Tarefa 12, quando há página que monte o editor.

- [ ] **Step 5: Commit** — os quatro arquivos pelo nome; `git commit -m "Canais de Venda: editor do anuncio ML com a aba Geral e a composicao"`.

---

### Tarefa 10: Abas Preço e estoque, Imagens, Ficha técnica e Envio

**Files:**
- Create: `src/components/anuncios/ml/AbaPrecoEstoque.jsx`, `AbaImagens.jsx`, `AbaFichaTecnica.jsx`, `AbaEnvio.jsx` (em `src/components/anuncios/ml/`)
- Modify: `src/components/anuncios/ml/EditorAnuncioML.jsx` (troca o `AbaEmBreve` dessas quatro)

**Interfaces:**
- Consumes: props das abas (Tarefa 9); `calcularMargem`, `corDaMargem`, `lucroLiquido`, `IMPOSTO_PADRAO` de `src/lib/margem.js`; `custoDaComposicao` (Tarefa 2); `linhasDeEspecificacao` de `src/lib/medidas.js`.

- [ ] **Step 1: Preço e estoque** — Custo (só leitura, com a origem; no kit, a soma de quantidade × custo, e com item sem custo o aviso "Sem custo de {sku}: a margem fica indisponivel"), Preco de venda e Estoque (campos numéricos que recusam `e + -`, como o `propsDeNumero` do cadastro de Produto; estoque inteiro), margem líquida com a cor de `corDaMargem` e a nota "Imposto de 6% fixo. Comissao, tarifa e frete do ML entram na fase 2." No kit, "Soma dos precos avulsos: R$ X" só como referência.
- [ ] **Step 2: Imagens** — miniaturas das fotos disponíveis (`contexto.produtos[*].imagens`), marcar/desmarcar e mudar a ordem (setas); a primeira marcada é a capa. Kit: aviso "O kit pede fotos proprias (as dos produtos mostram uma unidade de cada). O envio de fotos do kit entra na fase 3."
- [ ] **Step 3: Ficha técnica** — Marca (`BRAND`), Modelo (`MODEL`), EAN/GTIN (`GTIN`; escondido no kit, com a nota de que kit não exige EAN). Embaixo, só leitura, as especificações lidas da descrição (`linhasDeEspecificacao(rascunho.descricao)`), com a nota "Os atributos da categoria do ML entram na fase 2."
- [ ] **Step 4: Envio** — Peso (kg), Altura, Largura, Comprimento (cm); Modo de envio "Mercado Envios (me2)" só leitura; caixas Frete gratis e Retirada no local. Kit: nota "Peso sugerido: soma dos itens".
- [ ] **Step 5: Conferir** — `npm run lint` sem erro.
- [ ] **Step 6: Commit** — os cinco arquivos pelo nome; `git commit -m "Canais de Venda: abas de preco, imagens, ficha tecnica e envio do anuncio ML"`.

---

### Tarefa 11: Abas Descrição e Prévia e validação

**Files:**
- Create: `src/components/anuncios/ml/AbaDescricao.jsx`, `AbaPrevia.jsx`
- Modify: `src/components/anuncios/ml/EditorAnuncioML.jsx`
- Delete: `src/components/anuncios/ml/AbaEmBreve.jsx`

**Interfaces:**
- Consumes: `montarDescricaoML`, `restoDaDescricao` (Tarefa 4), `linhaDoVersiculo` (Tarefa 3), `montarPayloadML`, `ABAS_ML` (Tarefa 5), ação `outroVersiculo` (Tarefa 8).

- [ ] **Step 1: Descrição** — campo de texto alto (40rem, texto puro, como o do cadastro de Produto) com a descrição-base; abaixo, só leitura, as frases fixas (link "Editar em Configuracoes") e o versículo com o botão **Outro versiculo** (manda `excluir` = referência atual e `resto` = `restoDaDescricao`; sem versículo que caiba, mostra o `motivo`); e a prévia do texto final (`montarDescricaoML`) com o total de caracteres e quanto o versículo ocupa, em %.
- [ ] **Step 2: Prévia e validação** — os problemas agrupados por aba (bloqueantes primeiro, em vermelho; alertas em amarelo), cada um com o botão que leva à aba (`irPara`); o JSON de `montarPayloadML` num bloco recolhível; a descrição final. Sem problema bloqueante: "Pronto para publicar quando a publicacao for ligada (fase 3)."
- [ ] **Step 3: Conferir** — `npm run lint` sem erro; `npm run teste:anuncios-ml` todo `ok`.
- [ ] **Step 4: Commit** — `git add` dos dois arquivos novos e do editor, `git rm src/components/anuncios/ml/AbaEmBreve.jsx`; `git commit -m "Canais de Venda: abas de descricao e previa do anuncio ML"`.

---

### Tarefa 12: Páginas do Mercado Livre — lista, novo anúncio e anúncio salvo

**Files:**
- Create: `src/app/canais-de-venda/mercado-livre/page.jsx`
- Create: `src/app/canais-de-venda/mercado-livre/novo/page.jsx`
- Create: `src/app/canais-de-venda/mercado-livre/[id]/page.jsx`
- Create: `src/components/anuncios/ml/TabelaAnunciosML.jsx`
- Create: `src/components/anuncios/ml/EditorNaPagina.jsx` (cliente: monta o editor em `modo="pagina"` e, no primeiro Salvar, faz `router.replace` para `/canais-de-venda/mercado-livre/{id}`)

**Interfaces:**
- Consumes: `listarAnunciosML`, `buscarProdutoParaAnuncio`, `novoRascunhoML`, `carregarAnuncioML` (Tarefa 7), `EditorAnuncioML` (Tarefas 9–11), `Paginacao` de `src/components/mercados/Paginacao.jsx`, `LinkDeVolta`, `PageHeader`, `AvisoBanco`.

- [ ] **Step 1: Lista** — `LinkDeVolta` "← Canais de Venda"; `PageHeader` "Mercado Livre" com os botões **Novo anuncio** e **Configuracoes**; busca (`?q=`); tabela (Codigo — SKU ou código do kit, Titulo, Tipo — Classico/Premium, Preco, Situacao — Rascunho/Publicado, Atualizado em), cada linha leva a `/canais-de-venda/mercado-livre/{id}`; paginação de 100; lista vazia diz como criar.
- [ ] **Step 2: Novo** — sem `?produto=`: campo "Codigo do produto" (formulário GET). Com `?produto=<codigo>`: `buscarProdutoParaAnuncio` → erro na tela (não existe, não Conferido) ou `novoRascunhoML` → `EditorNaPagina` com `anuncioId` nulo.
- [ ] **Step 3: Anúncio salvo** — `[id]`: `carregarAnuncioML`; `notFound()` se não existir.
- [ ] **Step 4: Conferir no navegador (porta 3002)**

Criar um produto de teste com um script de uma vez só (no scratchpad, não comitado): `ZZ-ML-TELA`, Conferido, `blingId` "999", preço 10, estoque 5, peso e medidas, `descricaoBase` de um produto real, uma imagem copiada de um produto real. Conferir: `/canais-de-venda/mercado-livre/novo?produto=ZZ-ML-TELA` abre as 7 abas preenchidas; a Prévia lista "Escolha a categoria" como bloqueante; digitar `MLB1234` tira o ponto vermelho da Geral; **Salvar** leva a `/canais-de-venda/mercado-livre/{id}` e a lista mostra o rascunho; ligar a composição com 3 unidades mostra o código `ZZ-ML-TELA_3`, estoque 1 e o bloco "Itens inclusos" na descrição; `?produto=` de um produto não Conferido mostra a recusa. `read_console_messages` sem erro. Tirar print. No fim, apagar o produto de teste (os anúncios saem junto, por cascata).

- [ ] **Step 5: Commit** — os cinco arquivos pelo nome; `git commit -m "Canais de Venda: paginas do Mercado Livre (lista, novo e anuncio salvo)"`.

---

### Tarefa 13: Pop-up pelo ícone do ML na lista de Produtos

**Files:**
- Create: `src/components/anuncios/ml/JanelaAnuncioML.jsx`
- Modify: `src/components/produtos/LinhaProduto.jsx` (coluna Canais, ~linha 140)
- Modify: `src/app/produtos/page.jsx` (linha da tabela)

**Interfaces:**
- Consumes: ações `listarAnunciosDoProdutoML`, `abrirNovoAnuncioML`, `abrirAnuncioML` (Tarefa 8), `EditorAnuncioML`, `estadoDoIconeML` (Tarefa 5).
- Produces: `<JanelaAnuncioML produtoId aoFechar />`; a linha da lista recebe `iconeML: {publicado, rascunho}`.

- [ ] **Step 1: Ícone** — em `page.jsx`, a consulta de `anuncios` continua a mesma (já traz `canal` e `status`) e cada linha ganha `iconeML: estadoDoIconeML(produto.anuncios)`. Em `LinhaProduto`, o logo do ML vira botão ("Anuncio no Mercado Livre"): **colorido** (sem o filtro cinza) quando `publicado`, **cinza** nos outros casos, com um **ponto âmbar** no canto quando `rascunho`. Bling, Loja Integrada e Shopee seguem como estão. O comentário "Provisorio..." passa a dizer que o ML já reflete o anúncio.
- [ ] **Step 2: Janela** — ao abrir, chama `listarAnunciosDoProdutoML`. Produto não Conferido: só o aviso "Este produto ainda nao foi Conferido. So produto Conferido vira anuncio." e o link para o cadastro. Com anúncios: a lista (título, Classico/Premium, situação) e **Novo anuncio**; clicar num abre o editor (`abrirAnuncioML`). Sem anúncios: abre direto o editor de um novo (`abrirNovoAnuncioML`). O editor roda em `modo="janela"`, quase em tela cheia; Esc e o X fecham (com o aviso de mudanças não salvas da Tarefa 9). Depois de salvar, a janela volta à lista do produto, e o ícone muda com a revalidação de `/produtos`.
- [ ] **Step 3: Conferir no navegador (porta 3002)** — com o `ZZ-ML-TELA` da Tarefa 12 (criado de novo): o ícone começa cinza; o clique abre o editor; Salvar volta à lista do produto com o rascunho; o ícone ganha o ponto âmbar; um segundo anúncio (Premium) aparece na lista do pop-up; um produto não Conferido mostra o aviso. Print do ícone e do pop-up. Apagar o produto de teste.
- [ ] **Step 4: Commit** — `git add src/components/anuncios/ml/JanelaAnuncioML.jsx src/components/produtos/LinhaProduto.jsx src/app/produtos/page.jsx` e `git commit -m "Produtos: icone do ML abre o anuncio em pop-up, com ponto ambar no rascunho"`.

---

### Tarefa 14: Tela de configurações do Mercado Livre — frases fixas e versículos

**Files:**
- Create: `src/app/canais-de-venda/mercado-livre/configuracoes/page.jsx`
- Create: `src/components/anuncios/ml/FrasesFixas.jsx`
- Create: `src/components/anuncios/ml/ListaDeVersiculos.jsx`

**Interfaces:**
- Consumes: `lerConfigML`, `listarVersiculos` (Tarefa 6); ações `salvarFrasesFixas`, `incluirVersiculo`, `excluirVersiculo` (Tarefa 8); `contarVersiculos`, `referenciaDoVersiculo`, `TETO_DE_VERSICULOS` (Tarefa 3).

- [ ] **Step 1: Frases fixas** — caixa de texto, uma frase por linha, botão Salvar, mensagem do resultado. Nota: "Entram em todo anuncio, depois da descricao do produto e antes do versiculo."
- [ ] **Step 2: Versículos** — contador "N de 500 versiculos (limite da NVI sem autorizacao da Biblica)"; tabela (Referencia, Texto, remover); remover abre popup com a referência e o texto (nunca `confirm()`); formulário de inclusão (Livro: Salmos/Proverbios, Capitulo, Versiculo inicial, Versiculo final, Texto) com a nota "Copie o texto exatamente como esta na NVI. O credito (NVI) e escrito pelo sistema." Com a lista vazia: "A lista esta vazia. Rode npm run versiculos:carregar."
- [ ] **Step 3: Conferir no navegador (porta 3002)** — salvar duas frases e vê-las na aba Descrição de um rascunho; incluir e remover um versículo de teste; o contador muda. Devolver as frases ao que eram.
- [ ] **Step 4: Commit** — os três arquivos pelo nome; `git commit -m "Canais de Venda: configuracoes do ML (frases fixas e versiculos)"`.

---

### Tarefa 15: Curadoria dos versículos da NVI e carga inicial

**Files:**
- Create: `src/lib/canaisDeVenda/versiculos-nvi.json` (só depois da aprovação do dono)
- Create: `scripts/carregar-versiculos.js`
- Modify: `package.json` (`"versiculos:carregar": "node scripts/carregar-versiculos.js"`)
- Fora do git (scratchpad): o script de coleta e a lista de revisão.

**Interfaces:**
- Consumes: `carregarVersiculosIniciais` (Tarefa 6), `errosDoVersiculo`, `contarVersiculos` (Tarefa 3).
- Produces: `versiculos-nvi.json` = `[{livro, capitulo, inicio, fim, texto}]`, cerca de 300 entradas, total ≤ 500 versículos.

- [ ] **Step 1: Coletar o texto oficial (fora do repositório)**

Ler os capítulos de `https://www.bible.com/bible/129/{PRO|PSA}.{capitulo}.NVI` (a versão 129 é a NVI), **um pedido a cada 2 s**, só os capítulos de onde sairão versículos. O texto de cada versículo são os `<span>` de conteúdo dentro dos elementos com `data-usfm="PSA.23.1"` (um versículo pode vir partido em várias linhas de poesia, com o mesmo `data-usfm`), juntados com espaço e com espaço repetido reduzido; o `<span>` de classe terminada em `__nd` é "SENHOR" e vai em maiúsculas; números de versículo (`__label`) e notas (`__note`) ficam fora. Conferir que Salmos 23:1 sai "O SENHOR é o meu pastor; de nada terei falta."

- [ ] **Step 2: Escolher ~300**

Provérbios (sabedoria, trabalho, honestidade, palavra, generosidade) e Salmos de confiança, louvor e gratidão. **Fora:** maldição, vingança, violência, morte de inimigos, lamento pesado, versículo que só faz sentido com o anterior, e qualquer um com mais de 220 caracteres (para caber nos 25% de uma descrição comum). Faixa (`3:5-6`) só quando a frase não fecha sem o versículo seguinte. Total ≤ 500 versículos (`contarVersiculos`), cada um sem erro em `errosDoVersiculo`.

- [ ] **Step 3: Revisão do dono**

Gerar uma lista legível (numerada, com referência e texto) e enviá-la ao dono com `SendUserFile`, pedindo que marque o que tirar. **Esperar a resposta.** Aplicar as remoções; só então gravar `src/lib/canaisDeVenda/versiculos-nvi.json`.

- [ ] **Step 4: Script de carga**

`scripts/carregar-versiculos.js` (o `register` no molde de `scripts/teste-estoque.js`): lê o JSON, confere cada entrada com `errosDoVersiculo` e o total com `contarVersiculos` (com erro, sai com código 1 e a lista dos erros), chama `carregarVersiculosIniciais` e imprime `N versiculos carregados` ou `A lista ja tem N versiculos; nada foi carregado.`

- [ ] **Step 5: Rodar**

Run: `npm run versiculos:carregar`
Expected: `N versiculos carregados`, com N igual ao número de entradas; rodando de novo, `A lista ja tem ...`.

- [ ] **Step 6: Commit** — `git add src/lib/canaisDeVenda/versiculos-nvi.json scripts/carregar-versiculos.js package.json` e `git commit -m "Canais de Venda: versiculos da NVI revisados pelo dono e carga inicial"`.

---

### Tarefa 16: Investigação de leitura para as fases 2 e 3

**Files:**
- Create: `docs/superpowers/investigacoes/2026-10-01-ml-bling-para-fases-2-e-3.md`
- Fora do git (scratchpad): o script que faz as leituras.

**Interfaces:**
- Consumes: `mlGet` de `src/lib/integracoes/mercadolivre.js` e `blingGet` de `src/lib/integracoes/bling.js` (só GET; `chamar` recusa o resto).
- Produces: o relatório que os planos das fases 2 e 3 vão citar.

- [ ] **Step 1: Leituras do ML**, registrando URL, status e um trecho da resposta:
  - `GET /sites/MLB/domain_discovery/search?q=placa uno r3 ch340` (formato da categoria sugerida);
  - `GET /categories/{categoria achada}/attributes` (obrigatórios e `tags`; como vem `GTIN` e o motivo de ausência de EAN; se há atributos de embalagem);
  - `GET /sites/MLB/listing_prices?price=50&category_id=…&listing_type_id=gold_special`, com e sem `logistic_type`/`shipping_mode` (comissão e tarifa fixa);
  - `GET /users/212386247/shipping_options/free?dimensions=10x10x10,300&item_price=50&listing_type_id=gold_special&mode=me2` (frete do vendedor);
  - `GET /trends/MLB/{categoria}` (existe? formato);
  - o validador de publicações: confirmar na documentação (navegador embutido) o endpoint e o método. Se for `POST /items/validate`, **não chamar**: anotar que ele pede uma decisão do dono na fase 2 (é um POST que não cria anúncio, e `chamar` bloqueia todo POST com `ML_PUBLICACAO` desligada);
  - formato de `shipping.dimensions` e dos atributos de embalagem no `me2` (documentação).
- [ ] **Step 2: Leituras do Bling**
  - `GET /produtos/lojas?idProduto={id de um produto já vinculado ao ML}` (formato exato do vínculo e do preço);
  - `GET /produtos?codigo=100101`, `GET /produtos?codigos[]=100101` e `GET /produtos?pesquisa=100101` (qual filtro por código funciona; a consulta de 01/10 por `codigos[]` voltou vazia);
  - `100101_5` existe?;
  - `GET /produtos/{id}` dos kits `920302_1.000` e `129912`: copiar `formato`, `estrutura` (`tipoEstoque`, `lancamentoEstoque`, `componentes`), categoria, unidade, NCM e nome;
  - um código com sufixo `z` (ex.: `120329_z`): o que ele é;
  - nome de produto repetido: o Bling aceita dois produtos com o mesmo nome?
- [ ] **Step 3: Escrever o relatório** — uma seção por pergunta de "Investigação inicial" (§10 da spec), com a resposta, o trecho que a prova e o que muda no plano da fase 2 ou 3. Sem token, segredo nem dado de cliente no arquivo.
- [ ] **Step 4: Commit** — `git add docs/superpowers/investigacoes/2026-10-01-ml-bling-para-fases-2-e-3.md` e `git commit -m "Investigacao de leitura do ML e do Bling para as fases 2 e 3"`.

---

### Tarefa 17: Fechamento da fase 1

**Files:**
- Modify: `CLAUDE.md` (tabela "Estado", lista "Rodar" e seção nova "Canais de Venda: Mercado Livre (fase 1)")

- [ ] **Step 1: CLAUDE.md** — linha "Canais de Venda" na tabela Estado ("Mercado Livre: rascunho de anúncio, simples e de composição, sem publicar"); `npm run teste:anuncios-ml` (com o número de asserções) e `npm run versiculos:carregar` em "Rodar"; seção com: onde mora cada parte; o índice parcial `Anuncio_um_por_produto`, que só existe no SQL (o próximo `migrate diff` vai propor apagá-lo); vários anúncios ML por produto e a correção do `separarCanais`; as regras da NVI (500, `(NVI)`, 25%) e por que a ARC ficou de fora.
- [ ] **Step 2: Testes e lint**

Run: `npm run lint`, `npm run teste:anuncios-ml`, `npm run teste:estoque`, `npm run teste:cadastros`, `npm run teste:extracao`
Expected: lint sem erro; os quatro testes terminam com sucesso (saída 0).

- [ ] **Step 3: Conferir `git status`** — nada desta feature fora de commit; `.env`, `certificates/` e `dados/` fora.
- [ ] **Step 4: Commit** — `git add CLAUDE.md` e `git commit -m "CLAUDE.md: Canais de Venda, fase 1 do Mercado Livre"`. Push só com o pedido do dono.
