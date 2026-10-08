# Canais de Venda — Mercado Livre, fase 2 (inteligência do ML, só leitura) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O editor de anúncio do ML passa a sugerir categoria e título, montar a ficha técnica a partir dos atributos reais da categoria (com IA), mostrar os custos do ML (comissão, tarifa fixa, frete do vendedor) e calcular o preço por margem — tudo **só lendo** o Mercado Livre; nada é publicado nem validado por POST.

**Architecture:** As leituras do ML ficam em `src/lib/canaisDeVenda/ml/leitura.js` e recebem o cliente por parâmetro (`cliente = clienteML()`, só `get` + `usuarioId`), no molde de `clienteBling()`; o teste passa um ML falso em memória (`scripts/lib/mlFalso.js`). Regras puras (atributos, custos, preço por margem) ficam em arquivos sem rede, lidos pela tela, pelas Server Actions e pelo teste. A IA (categoria, título, ficha) mora em `src/lib/ia/` e reaproveita o `chamar` de `anuncio.js`. O rascunho ganha `envio.logistica` e `categoriaNome`; a categoria lida do ML (nome, folha, limite de título, atributos) vive no `contexto` do editor, não no banco.

**Tech Stack:** Next.js 16.3 (App Router, Server Actions), React 19, Prisma 7 + PostgreSQL 17, zod, Tailwind, `@anthropic-ai/sdk` (modelo e fallback já configurados em `src/lib/ia/anuncio.js`); testes em Node puro (`scripts/teste-anuncios-ml.js`, `conferir` com `JSON.stringify`), sem rede.

**Spec:** `docs/superpowers/specs/2026-09-30-canais-de-venda-mercado-livre-design.md` (seções 4, 6, 6.1 e 10, fase 2). Investigação com os formatos medidos: `docs/superpowers/investigacoes/2026-10-01-ml-bling-para-fases-2-e-3.md` (A1–A8). Fase 1 (o que já existe): `docs/superpowers/plans/2026-10-01-canais-de-venda-ml-fase-1.md` e a seção "Canais de Venda: Mercado Livre (fase 1)" do `CLAUDE.md`.

## Decisões deste plano (o que a spec e a investigação deixaram em aberto)

1. **Validador de publicações (`POST /items/validate`) e `POST /categories/{id}/attributes/conditional` ficam FORA.** São POST, e o `chamar` do ML bloqueia todo não-GET com `ML_PUBLICACAO=false` (investigação A6). A fase 2 valida **localmente**: título dentro do limite da categoria, categoria folha, atributos `required`/`catalog_required` preenchidos, GTIN ou `EMPTY_GTIN_REASON`, valor de lista existente, fotos até `max_pictures_per_item`, medidas. Liberar uma exceção estreita para os dois POST é decisão do dono (item 1 das "Decisões que dependem do dono" da investigação) e entra como emenda ou na fase 3.
2. **Logística padrão `xd_drop_off` (ME2), configurável por anúncio** em `envio.logistica` (`xd_drop_off` | `fulfillment` | `self_service`). `listing_prices` é chamado sempre com `logistic_type` e `shipping_mode=me2` (A3).
3. **O frete do vendedor só entra na conta quando `envio.freteGratis` está ligado**; desligado, aparece como estimativa informativa e vale 0 no lucro. `mandatory_free_shipping` depende do limite TH, não confirmado: fica fora.
4. **A IA nunca inventa id de categoria.** Caminho: (1) `domain_discovery` com o título; (2) com 2+ candidatas, a IA escolhe entre elas com os dados do produto; (3) com 0 candidatas, a IA (com a ferramenta `web_search` do modelo) devolve **termos de busca** melhores, que voltam ao `domain_discovery`. Nenhum id vem da IA.
5. **A ficha com IA preenche só os atributos em branco** e mostra a lista para o dono marcar/desmarcar antes de aplicar (spec §12: "sempre sugestão editável"). Pesquisa na internet só com a caixa "pesquisar na internet" ligada (custa).
6. **Dimensões do kit**: campo próprio já existe na aba Envio (fase 1); nada muda. Preço do kit: só sugestão por margem, nunca soma (B4).
7. **Atributos no rascunho continuam `Record<id, value_name>`** (texto). Atributo de lista guarda o **nome oficial** do valor da categoria; `payload.js` já manda `value_name`. Sem migration.
8. **Limite de título** passa a vir da categoria (`settings.max_title_length`), com `LIMITE_TITULO` (60) de reserva quando a categoria não foi lida.

## Global Constraints

- JavaScript sem TypeScript; identificadores e comentários em português **sem acento**; texto de tela em português com acento (como a fase 1). Comentários explicam o porquê.
- **Só GET no Mercado Livre** nesta fase; `ML_PUBLICACAO` e `BLING_ESCRITA` continuam `false` e **nenhum código os liga**. Toda chamada passa por `mlGet` → `httpClient.requisitar` (já registra em `LogIntegracao`); a conta tem 1.007 anúncios reais.
- Toda leitura do ML recebe `cliente` por parâmetro (contrato `{ get(caminho, params), usuarioId() }`); nenhum arquivo de `src/lib/canaisDeVenda/ml/` importa `mlGet` direto, exceto `cliente.js`.
- Regras puras sem rede e sem banco em `src/lib/canaisDeVenda/ml/{atributos,custos}.js`; a tela, as ações e `scripts/teste-anuncios-ml.js` leem o mesmo arquivo.
- Nunca fixar ids/percentuais do ML no código (`EMPTY_GTIN_REASON` 17055159, 13%, 18%): ler da categoria/da consulta a cada vez (A2, A3).
- Só Produto **Conferido** entra em anúncio; conferido **no servidor** em toda ação (as ações novas chamam `contextoDosProdutos` e recusam `conferido !== true`, como `salvarRascunhoML`).
- Falha de ML ou de IA **só avisa** (texto no campo/aba) e nunca apaga o rascunho nem o que está digitado (spec §9).
- Imposto: `IMPOSTO_PADRAO` (6%) de `src/lib/margem.js`. Dinheiro arredondado a 2 casas; preço por margem arredondado **para cima** ao centavo.
- Server Actions finas (`src/app/canais-de-venda/mercado-livre/acoes.js`): conferem o que vem do navegador (`ehId`, tipos, tamanhos), chamam a lib, nunca deixam exceção subir (`protegendo`). Ação que só lê não revalida.
- BRAND e MODEL sempre em MAIÚSCULAS (tela e payload), como na fase 1.
- Ritual antes de cada commit: `npm run lint` e `npm run teste:anuncios-ml` verdes; `.env`, `certificates/` e `dados/` fora. Commits em português, sem acento no título, terminados com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Comitar os arquivos **pelo nome** (a pasta hospeda outras frentes).
- Sem migration nesta fase (tudo novo cabe em `Anuncio.dados` e no `contexto` do editor).

## Review Focus

1. **Categoria digitada que existe mas NÃO é folha** (ex.: `MLB1648`, Eletrônicos): o ML recusa o item na publicação. Teste na Tarefa 3: `validarRascunhoML` com `contexto.categoria.folha === false` acusa bloqueante no campo `categoria`.
2. **Atributo de lista com valor digitado fora da lista** ("Sim" quando a lista tem "Sim"/"Não" com acento, ou "ATMEGA328P" quando o valor oficial é "ATmega328P"): `valorDeLista` tem que casar sem caixa e sem acento, e valor que não existe na lista é bloqueante. Teste na Tarefa 2.
3. **Preço por margem com denominador zero ou negativo** (margem 90% com comissão 18% e imposto 6%): divisão por número ≤ 0 daria preço negativo/infinito. Teste na Tarefa 4: `precoPorMargem` devolve `null` e a tela diz que a margem é inatingível.
4. **Mudar tipo de anúncio, categoria ou logística depois de ler os custos**: os custos lidos para Clássico não valem para Premium. Teste na Tarefa 4: `custosValem(custosML, rascunho)` devolve `false` quando qualquer um dos quatro (preço, categoria, tipo, logística) mudou; a aba mostra "Atualizar custos".
5. **Kit sem GTIN e produto simples sem EAN**: o ML exige GTIN ou o motivo (`conditional_required`). Teste na Tarefa 2 (`motivoSemGtin` acha "kit ou pack" / "não tem código" pelo nome, nunca por id fixo) e na Tarefa 3 (sem GTIN e sem `EMPTY_GTIN_REASON` é bloqueante; com o motivo, passa).

---

### Task 1: Cliente do ML, ML falso e leitura de categoria

**Files:**
- Modify: `src/lib/integracoes/mercadolivre.js` (acrescentar `obterUsuarioId`)
- Create: `src/lib/canaisDeVenda/ml/cliente.js`
- Create: `src/lib/canaisDeVenda/ml/leitura.js`
- Create: `scripts/lib/mlFalso.js`
- Test: `scripts/teste-anuncios-ml.js` (novo bloco "Fase 2: cliente, ML falso e categoria")

**Interfaces:**
- Consumes: `mlGet(caminho, params)` e `lerSegredo("MERCADO_LIVRE")` de `src/lib/integracoes/`.
- Produces:
  - `obterUsuarioId(): Promise<string>` em `integracoes/mercadolivre.js` — o `userId` guardado na conexão; sem ele, `GET /users/me` e grava via `salvarConexao` (mesmo molde de `guardar`).
  - `clienteML(): { get: typeof mlGet, usuarioId: typeof obterUsuarioId }` em `ml/cliente.js`.
  - `criarMLFalso(opcoes?): { get, usuarioId, chamadas: {caminho, params}[] }` em `scripts/lib/mlFalso.js`. Responde no formato do `requisitar` (`{ ok, status, duracaoMs, dados }`) a: `/users/me`, `/sites/MLB/domain_discovery/search?q=`, `/categories/{id}`, `/categories/{id}/attributes`, `/sites/MLB/listing_prices`, `/users/{id}/shipping_options/free`, `/trends/MLB/{id}`. Caminho desconhecido **lança** erro. Opções: `{ categorias: { [id]: { nome, caminho: string[], folha, limiteTitulo, maxFotos, atributos: [] } }, descoberta: { [termoMinusculo]: id[] }, taxas: { percentualPorTipo: {gold_special, gold_pro}, tarifaFixaPorLogistica: {self_service, default}, limiteTH }, frete: { listCost, billableWeight }, tendencias: { [categoriaId]: string[] }, usuarioId }`. Padrões copiados da investigação (A1–A5): `MLB99779`, 13/18%, tarifa 6,65 só em `self_service`/`default` abaixo de `limiteTH` (padrão 79), frete 8,15, 40 tendências. **Não importa nada de `src/`**.
  - Em `ml/leitura.js`:
    - `textoDoErroML(erro): string` — mensagem em português para a tela (token ausente → "Mercado Livre não conectado..."; HTTP 4xx/5xx → `dados.message` ou `HTTP n`).
    - `descobrirCategoria(cliente, titulo): Promise<{ categoriaId, nome, dominioId, dominioNome }[]>` — `domain_discovery` com `q`; lista vazia quando `dados` é `[]`.
    - `lerCategoria(cliente, categoriaId): Promise<{ id, nome, caminho: string[], folha: boolean, limiteTitulo: number, maxFotos: number, condicoes: string[] } | null>` — `null` em 404; `folha = children_categories.length === 0`; `limiteTitulo = settings.max_title_length`; `maxFotos = settings.max_pictures_per_item`.
    - `lerAtributosDaCategoria(cliente, categoriaId): Promise<object[]>` — a lista crua de `/categories/{id}/attributes` (a Tarefa 2 normaliza).
    - `lerCategoriaCompleta(cliente, categoriaId): Promise<{ ...lerCategoria, atributos: Atributo[] } | null>` — as duas leituras; `atributos` já normalizados por `normalizarAtributosDaCategoria` (Tarefa 2; nesta tarefa devolve a lista crua e a Tarefa 2 troca).

- [ ] **Step 1: Escrever os testes do bloco (falham)**

Em `scripts/teste-anuncios-ml.js`, antes do comentário "Blocos das tarefas seguintes", **um bloco externo `{ ... }` "Fase 2"** que envolve todos os sub-blocos das Tarefas 1 a 6: cada `{ }` do script é um escopo fechado, e `falso`, os imports, `comCategoria`, `ctx` e `r` são compartilhados entre as tarefas. Começa assim:

```js
console.log("\nFase 2: cliente, ML falso e categoria");
const { criarMLFalso } = await import("./lib/mlFalso.js");
const { descobrirCategoria, lerCategoria, lerAtributosDaCategoria, lerCategoriaCompleta, textoDoErroML } = await import("../src/lib/canaisDeVenda/ml/leitura.js");

const falso = criarMLFalso();
conferir("falso: contrato do cliente (get, usuarioId, chamadas)", [typeof falso.get, typeof falso.usuarioId, Array.isArray(falso.chamadas)], ["function", "function", true]);
conferir("falso: responde no formato do requisitar", (({ ok, status, duracaoMs }) => [ok, status, typeof duracaoMs])(await falso.get("/users/me")), [true, 200, "number"]);
conferir("falso: usuarioId e o da conta falsa", await falso.usuarioId(), "212386247");
let lancou = false; try { await falso.get("/nao/existe"); } catch { lancou = true; }
conferir("falso: caminho desconhecido lanca", lancou, true);

conferir("descobrirCategoria: devolve id, nome e dominio", await descobrirCategoria(falso, "placa uno r3 ch340"),
  [{ categoriaId: "MLB99779", nome: "Placas de Microcontroladores", dominioId: "MLB-MICROCONTROLLER_BOARDS", dominioNome: "Placas de microcontroladores" }]);
conferir("descobrirCategoria: sem resultado e lista vazia", await descobrirCategoria(falso, "xyzw nada"), []);
conferir("descobrirCategoria: manda q", falso.chamadas.at(-1).params, { q: "xyzw nada" });

const categoria = await lerCategoria(falso, "MLB99779");
conferir("lerCategoria: folha, limite 60, 12 fotos, caminho", [categoria.folha, categoria.limiteTitulo, categoria.maxFotos, categoria.caminho],
  [true, 60, 12, ["Eletrônicos, Áudio e Vídeo", "Componentes Eletrônicos", "Placas de Microcontroladores"]]);
conferir("lerCategoria: nao folha", (await lerCategoria(falso, "MLB1648")).folha, false);
conferir("lerCategoria: 404 e null", await lerCategoria(falso, "MLB0"), null);
conferir("lerAtributosDaCategoria: lista crua com BRAND required", (await lerAtributosDaCategoria(falso, "MLB99779")).some((a) => a.id === "BRAND" && a.tags?.required === true), true);
conferir("textoDoErroML: HTTP com message", textoDoErroML({ status: 403, dados: { message: "forbidden" } }), "Mercado Livre: forbidden (HTTP 403)");
conferir("textoDoErroML: Error comum", textoDoErroML(new Error("Mercado Livre não conectado.")), "Mercado Livre não conectado.");
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm run teste:anuncios-ml`
Expected: falha ao importar `./lib/mlFalso.js` (módulo não encontrado).

- [ ] **Step 3: Criar `scripts/lib/mlFalso.js`**

`export function criarMLFalso(opcoes = {})`. As opções **mesclam sobre os padrões** (passar só `descoberta` mantém as categorias, taxas e tendências padrão). Estado em memória (clonado com `structuredClone`); `get(caminho, params = {})` junta a query do caminho com `params` (como o Bling falso), resolve pela tabela de rotas e registra em `chamadas`. Padrões: categoria `MLB99779` (folha, 60, 12, caminho da investigação A1, atributos crus: `BRAND` e `MODEL` com `tags.required` e `catalog_required`; `GTIN` `conditional_required` `value_type: "string"`; `EMPTY_GTIN_REASON` `hidden`+`conditional_required`, `value_type: "list"`, 4 valores com os nomes de A2 e ids `17055158..17055161`; `MICROCONTROLLER` lista com "ATmega328P"/"ATmega2560"; `INCLUDES_USB_CABLE` lista "Sim"/"Não"; `OPERATING_VOLTAGE` `number_unit` com `allowed_units` V; `SELLER_PACKAGE_WEIGHT` `hidden` com unidade `g`; `PACKAGE_HEIGHT` `hidden`+`read_only`; `SELLER_SKU` `hidden`), e `MLB1648` (não folha, `children_categories: [{...}]`). `descoberta` padrão: `"placa uno r3 ch340" → ["MLB99779"]`. `listing_prices`: devolve um objeto quando `listing_type_id` vem, senão a lista dos dois tipos; `fixed_fee = tarifaFixaPorLogistica[logistic_type] ?? 0` só quando `price < limiteTH`; `sale_fee_amount = price*percentual + fixed_fee` (2 casas); formato `{ listing_type_id, listing_type_name, sale_fee_amount, sale_fee_details: { percentage_fee, fixed_fee, gross_amount } }`. `shipping_options/free`: exige `dimensions` no formato `AxLxC,PESO` (senão 400) e devolve `{ coverage: { all_country: { list_cost, currency_id: "BRL", billable_weight, free_shipping_by_meli: true } } }`. `trends`: `[{ keyword, url }]`.

- [ ] **Step 4: Criar `obterUsuarioId` e `ml/cliente.js`; criar `ml/leitura.js` com as quatro funções desta tarefa**

`textoDoErroML(erro)`: `erro?.status` numérico → `` `Mercado Livre: ${erro.dados?.message ?? erro.dados?.error ?? "erro"} (HTTP ${erro.status})` ``; senão `erro?.message ?? "Falha ao consultar o Mercado Livre."`. Resposta `!ok` das leituras é lançada como `Object.assign(new Error(...), { status, dados })` para a ação traduzir com `textoDoErroML`. `lerCategoria` trata `status === 404` como `null` (não lança).

- [ ] **Step 5: Rodar o teste e o lint**

Run: `npm run teste:anuncios-ml && npm run lint`
Expected: bloco novo todo `ok`; "Todos os testes de anuncios ML OK."; lint limpo.

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/mlFalso.js src/lib/canaisDeVenda/ml/cliente.js src/lib/canaisDeVenda/ml/leitura.js src/lib/integracoes/mercadolivre.js scripts/teste-anuncios-ml.js
git commit -m "ML fase 2: cliente injetavel, ML falso e leitura de categoria"
```

---

### Task 2: Atributos da categoria (regras puras)

**Files:**
- Create: `src/lib/canaisDeVenda/ml/atributos.js` (sem imports)
- Modify: `src/lib/canaisDeVenda/ml/leitura.js` (`lerCategoriaCompleta` passa a normalizar)
- Test: `scripts/teste-anuncios-ml.js` (bloco "Fase 2: atributos da categoria")

**Interfaces:**
- Consumes: a lista crua de `/categories/{id}/attributes` (formato A2).
- Produces, em `atributos.js`:
  - `normalizarAtributosDaCategoria(lista): Atributo[]` onde `Atributo = { id, nome, tipo: "lista"|"texto"|"numero"|"numero_unidade"|"booleano", obrigatorio: boolean, condicional: boolean, oculto: boolean, valores: {id, nome}[], unidades: string[], dica: string|null }`. `obrigatorio = tags.required || tags.catalog_required`; `condicional = tags.conditional_required`; **fora da lista**: `tags.read_only`, e os `hidden` que não estão em `OCULTOS_QUE_ENTRAM = ["EMPTY_GTIN_REASON"]` (`SELLER_SKU`, `IS_KIT`, `SELLER_PACKAGE_*`, `PACKAGE_*` saem: o payload cuida deles). `tipo` vem de `value_type` (`list`→lista, `boolean`→booleano, `number`→numero, `number_unit`→numero_unidade, resto→texto). Ordem: obrigatórios, depois condicionais, depois os demais, cada grupo na ordem do ML.
  - `motivoSemGtin(atributos, { kit }): string|null` — o **nome** do valor de `EMPTY_GTIN_REASON` cujo nome casa `/kit|pack/i` (kit) ou `/n[aã]o tem c[oó]digo/i` (simples); `null` se a categoria não tem o atributo.
  - `valorDeLista(atributo, texto): string|null` — o nome oficial do valor que casa com `texto` sem caixa e sem acento (`normalize("NFD")`), ou `null`. Atributo que não é lista devolve `texto` aparado.
  - `problemasDosAtributos(valores, atributos, { kit }): { campo, problema, bloqueante }[]` — obrigatório vazio → bloqueante `"Informe {nome} ({id}): obrigatório nesta categoria."`; lista com valor que `valorDeLista` não acha → bloqueante `"{nome}: '{valor}' não está na lista da categoria."`; `GTIN` vazio **e** `EMPTY_GTIN_REASON` vazio quando a categoria tem GTIN condicional → bloqueante no campo `GTIN` `"Informe o GTIN ou o motivo de não ter (EMPTY_GTIN_REASON)."`; kit com GTIN preenchido → alerta `"Kit não leva GTIN: o valor será ignorado."`.
  - `limparAtributosDaIA(resposta, atributos, valoresAtuais): { id, nome, valor }[]` — da resposta `{ atributos: [{ id, valor }] }` da IA: id que não existe na categoria sai; valor vazio sai; id já preenchido em `valoresAtuais` sai (só completa o que está em branco); lista passa por `valorDeLista` (não casou → sai); BRAND/MODEL em MAIÚSCULAS; sem repetidos.
  - `montarPedidoDaFicha({ titulo, marca, modelo, descricao, especificacoes, atributos, valoresAtuais }): string` — o texto do pedido à IA: o produto, as especificações `- Nome: valor` e **uma linha por atributo em branco** no formato `id | nome | tipo | valores permitidos (lista) ou unidades`, pedindo `{"atributos": [{"id": "...", "valor": "..."}]}` e "só o que as informações do produto sustentam; não invente".

- [ ] **Step 1: Escrever os testes (falham)**

```js
const { normalizarAtributosDaCategoria, motivoSemGtin, valorDeLista, problemasDosAtributos, limparAtributosDaIA, montarPedidoDaFicha } = await import("../src/lib/canaisDeVenda/ml/atributos.js");
const crus = await lerAtributosDaCategoria(falso, "MLB99779");
const atributos = normalizarAtributosDaCategoria(crus);
conferir("normalizar: obrigatorios primeiro, depois condicionais", atributos.slice(0, 4).map((a) => a.id), ["BRAND", "MODEL", "GTIN", "EMPTY_GTIN_REASON"]);
conferir("normalizar: read_only e hidden (menos EMPTY_GTIN_REASON) saem", atributos.some((a) => ["PACKAGE_HEIGHT", "SELLER_SKU", "SELLER_PACKAGE_WEIGHT"].includes(a.id)), false);
conferir("normalizar: tipos", Object.fromEntries(atributos.filter((a) => ["MICROCONTROLLER", "OPERATING_VOLTAGE", "BRAND"].includes(a.id)).map((a) => [a.id, a.tipo])), { BRAND: "texto", MICROCONTROLLER: "lista", OPERATING_VOLTAGE: "numero_unidade" });
conferir("motivoSemGtin: kit e simples, pelo nome", [motivoSemGtin(atributos, { kit: true }), motivoSemGtin(atributos, { kit: false })], ["O produto é um kit ou pack", "O produto não tem código cadastrado"]);
conferir("motivoSemGtin: categoria sem o atributo", motivoSemGtin([], { kit: true }), null);
const micro = atributos.find((a) => a.id === "MICROCONTROLLER");
conferir("valorDeLista: sem caixa e sem acento", [valorDeLista(micro, "atmega328p"), valorDeLista(micro, "ATMEGA2560 "), valorDeLista(micro, "Z80")], ["ATmega328P", "ATmega2560", null]);
conferir("valorDeLista: texto livre passa aparado", valorDeLista(atributos.find((a) => a.id === "BRAND"), " Arduino "), "Arduino");
conferir("problemas: obrigatorio vazio e lista fora", problemasDosAtributos({ BRAND: "X", MICROCONTROLLER: "Z80" }, atributos, { kit: false }).map((p) => [p.campo, p.bloqueante]),
  [["MODEL", true], ["MICROCONTROLLER", true], ["GTIN", true]]);
conferir("problemas: GTIN ou motivo", problemasDosAtributos({ BRAND: "X", MODEL: "Y", EMPTY_GTIN_REASON: "O produto não tem código cadastrado" }, atributos, { kit: false }), []);
conferir("problemas: kit com GTIN e alerta", problemasDosAtributos({ BRAND: "X", MODEL: "Y", GTIN: "789", EMPTY_GTIN_REASON: "O produto é um kit ou pack" }, atributos, { kit: true }).map((p) => [p.campo, p.bloqueante]), [["GTIN", false]]);
conferir("limparAtributosDaIA: so em branco, lista casada, maiusculas, id falso fora",
  limparAtributosDaIA({ atributos: [{ id: "BRAND", valor: "arduino" }, { id: "MODEL", valor: "uno r3" }, { id: "MICROCONTROLLER", valor: "atmega328p" }, { id: "INVENTADO", valor: "x" }, { id: "GTIN", valor: "" }] }, atributos, { BRAND: "ARDUINO" }).map((a) => [a.id, a.valor]),
  [["MODEL", "UNO R3"], ["MICROCONTROLLER", "ATmega328P"]]);
const pedido = montarPedidoDaFicha({ titulo: "PLACA UNO", marca: "ARDUINO", modelo: "", descricao: "", especificacoes: [{ nome: "Tensão", valor: "5V" }], atributos, valoresAtuais: { BRAND: "ARDUINO" } });
conferir("pedido da ficha: so atributos em branco, com valores da lista", [pedido.includes("BRAND |"), pedido.includes("MICROCONTROLLER | "), pedido.includes("ATmega328P"), pedido.includes("Tensão: 5V")], [false, true, true, true]);
```

- [ ] **Step 2: Rodar e confirmar que falha** — Run: `npm run teste:anuncios-ml`. Expected: módulo `atributos.js` não encontrado.

- [ ] **Step 3: Implementar `atributos.js` com as seis funções acima e fazer `lerCategoriaCompleta` (Tarefa 1) devolver `atributos` normalizados.**

- [ ] **Step 4: Rodar teste e lint** — Expected: tudo `ok`, lint limpo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canaisDeVenda/ml/atributos.js src/lib/canaisDeVenda/ml/leitura.js scripts/teste-anuncios-ml.js
git commit -m "ML fase 2: atributos da categoria, motivo sem GTIN e limpeza da ficha da IA"
```

---

### Task 3: Rascunho com logística e nome da categoria; validação com a categoria lida; payload com a embalagem

**Files:**
- Modify: `src/lib/canaisDeVenda/ml/rascunho.js` (`rascunhoInicial`: `categoriaNome: null`, `envio.logistica: "xd_drop_off"`)
- Modify: `src/lib/canaisDeVenda/ml/esquema.js` (`categoriaNome`, `envio.logistica`)
- Modify: `src/lib/canaisDeVenda/ml/banco.js` (`carregarAnuncioML` aplica os padrões aos rascunhos da fase 1; `salvarRascunhoML` grava `categoriaNome` em `dados`)
- Modify: `src/lib/canaisDeVenda/ml/validacao.js`
- Modify: `src/lib/canaisDeVenda/ml/payload.js`
- Modify: `src/lib/canaisDeVenda/ml/rotulos.js` (`LOGISTICAS_ML`)
- Test: `scripts/teste-anuncios-ml.js` (bloco "Fase 2: rascunho, validacao com categoria e payload")

**Interfaces:**
- Produces:
  - Rascunho: `categoriaNome: string|null` (novo, só exibição) e `envio.logistica: "xd_drop_off"|"fulfillment"|"self_service"`. `export const LOGISTICAS_ML = [{ valor: "xd_drop_off", rotulo: "Mercado Envios (coleta/agência)" }, { valor: "fulfillment", rotulo: "Full" }, { valor: "self_service", rotulo: "Flex" }]` em `ml/rotulos.js`.
  - `contexto.categoria` (opcional): o objeto de `lerCategoriaCompleta` (`{ id, nome, caminho, folha, limiteTitulo, maxFotos, atributos }`), ou ausente. `contexto.categoriaErro: string|null`.
  - `validarRascunhoML(rascunho, contexto)` passa a: usar `contexto.categoria.limiteTitulo` quando `contexto.categoria?.id === rascunho.categoriaId` (senão `LIMITE_TITULO`); `folha === false` → bloqueante em `categoria` `"Esta categoria não é final: escolha uma subcategoria."`; `contexto.categoriaErro` com categoria preenchida → alerta em `categoria` `"Categoria não conferida no Mercado Livre: {erro}"`; `rascunho.imagens.length > maxFotos` → bloqueante em `imagens`; **substituir** o alerta fixo de GTIN da fase 1 por `problemasDosAtributos` (com `aba: "ficha"`) quando há categoria lida; sem categoria lida, mantém o alerta antigo. Novo alerta em `envio` (campo `arredondamento`) quando alguma medida tem decimal: `"O Mercado Envios recebe inteiros: {lista de 'altura 5,5 cm → 6 cm'}."`.
  - `export function limiteDoTitulo(rascunho, contexto): number`.
  - `montarPayloadML`: acrescenta aos `attributes` os quatro `SELLER_PACKAGE_HEIGHT/WIDTH/LENGTH` (`"{Math.ceil(cm)} cm"`) e `SELLER_PACKAGE_WEIGHT` (`"{Math.round(kg*1000)} g"`) quando `medidasFaltando(envio)` é vazio (A7); `shipping.logistic_type = envio.logistica`.

- [ ] **Step 1: Escrever os testes (falham)**

```js
const { LOGISTICAS_ML } = await import("../src/lib/canaisDeVenda/ml/rotulos.js");
const { limiteDoTitulo } = await import("../src/lib/canaisDeVenda/ml/validacao.js");
const categoriaCompleta = await lerCategoriaCompleta(falso, "MLB99779");
const principal = { id: "p1", sku: "100101", tituloBase: "PLACA UNO", conferido: true, blingId: "1", precoVenda: 49, estoque: 20, pesoKg: 0.05, alturaCm: 5.5, larguraCm: 8, comprimentoCm: 8, marca: "ARDUINO", modelo: "UNO", ean: "", imagens: [] };
const base = rascunhoInicial({ principal, produtosPorId: { p1: principal }, composicao: null });
conferir("rascunho novo: logistica padrao e categoriaNome", [base.envio.logistica, base.categoriaNome], ["xd_drop_off", null]);
conferir("LOGISTICAS_ML: tres opcoes com xd_drop_off primeiro", LOGISTICAS_ML.map((l) => l.valor), ["xd_drop_off", "fulfillment", "self_service"]);
conferir("esquema: aceita logistica e categoriaNome", RascunhoMLSchema.safeParse({ ...base, categoriaNome: "Placas", envio: { ...base.envio, logistica: "fulfillment" } }).success, true);
conferir("esquema: recusa logistica desconhecida", RascunhoMLSchema.safeParse({ ...base, envio: { ...base.envio, logistica: "moto" } }).success, false);

const comCategoria = { ...base, categoriaId: "MLB99779", preco: 49, imagens: ["f1"], descricao: "x", atributos: { BRAND: "ARDUINO", MODEL: "UNO" }, envio: { ...base.envio, alturaCm: 5.5 } };
const ctx = { produtos: { p1: principal }, codigoEmUso: null, frases: [], categoria: categoriaCompleta, categoriaErro: null };
const problemas = validarRascunhoML(comCategoria, ctx);
conferir("validacao: GTIN ou motivo e bloqueante com categoria lida", problemas.filter((p) => p.campo === "GTIN").map((p) => [p.aba, p.bloqueante]), [["ficha", true]]);
conferir("validacao: aviso de arredondamento no envio", problemas.find((p) => p.campo === "arredondamento")?.problema, "O Mercado Envios recebe inteiros: altura 5,5 cm → 6 cm.");
conferir("validacao: categoria nao folha e bloqueante", validarRascunhoML({ ...comCategoria, categoriaId: "MLB1648" }, { ...ctx, categoria: await lerCategoriaCompleta(falso, "MLB1648") }).some((p) => p.campo === "categoria" && p.bloqueante), true);
conferir("validacao: fotos acima do maximo da categoria", validarRascunhoML({ ...comCategoria, imagens: Array.from({ length: 13 }, (_, i) => `f${i}`) }, ctx).some((p) => p.campo === "imagens" && p.bloqueante), true);
conferir("validacao: categoria com erro de leitura e alerta", validarRascunhoML(comCategoria, { ...ctx, categoria: undefined, categoriaErro: "HTTP 500" }).find((p) => p.campo === "categoria")?.bloqueante, false);
conferir("limiteDoTitulo: da categoria, ou 60 sem ela", [limiteDoTitulo(comCategoria, { ...ctx, categoria: { ...categoriaCompleta, limiteTitulo: 70 } }), limiteDoTitulo(comCategoria, { ...ctx, categoria: undefined })], [70, 60]);
conferir("validacao: sem categoria lida, o alerta antigo de GTIN continua", validarRascunhoML(comCategoria, { ...ctx, categoria: undefined }).find((p) => p.campo === "GTIN")?.bloqueante, false);

const payload = montarPayloadML({ ...comCategoria, envio: { ...comCategoria.envio, alturaCm: 5.5, larguraCm: 8, comprimentoCm: 8, pesoKg: 0.05 } }, ctx);
conferir("payload: SELLER_PACKAGE_* inteiros em cm e g, logistic_type", [
  ...["SELLER_PACKAGE_HEIGHT", "SELLER_PACKAGE_WIDTH", "SELLER_PACKAGE_LENGTH", "SELLER_PACKAGE_WEIGHT"].map((id) => payload.item.attributes.find((a) => a.id === id)?.value_name),
  payload.item.shipping.logistic_type,
], ["6 cm", "8 cm", "8 cm", "50 g", "xd_drop_off"]);
// `base` herda as quatro medidas do produto: tirar o peso e o que deixa o pacote incompleto.
conferir("payload: sem medida completa nao manda SELLER_PACKAGE_*", montarPayloadML({ ...base, envio: { ...base.envio, pesoKg: null } }, ctx).item.attributes.some((a) => a.id.startsWith("SELLER_PACKAGE")), false);
```

Mais, num bloco de banco `{ await limpar(); ... }`: salvar um rascunho com `categoriaNome: "Placas"` e `envio.logistica: "fulfillment"` e `carregarAnuncioML` devolver os dois; e um anúncio gravado **sem** `logistica` em `dados.envio` (gravar direto com `prisma.anuncio.update`) carregar com `"xd_drop_off"`.

- [ ] **Step 2: Rodar e confirmar que falha.**

- [ ] **Step 3: Implementar** nos seis arquivos. Em `validacao.js`, importar `problemasDosAtributos` de `./atributos` e `LIMITE_TITULO` continua a reserva. Em `banco.js`, `carregarAnuncioML`: `envio: { logistica: "xd_drop_off", ...(dados.envio ?? {}) }`, `categoriaNome: dados.categoriaNome ?? null`.

- [ ] **Step 4: Rodar teste e lint.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/canaisDeVenda/ml/rascunho.js src/lib/canaisDeVenda/ml/esquema.js src/lib/canaisDeVenda/ml/banco.js src/lib/canaisDeVenda/ml/validacao.js src/lib/canaisDeVenda/ml/payload.js src/lib/canaisDeVenda/ml/rotulos.js scripts/teste-anuncios-ml.js
git commit -m "ML fase 2: logistica no rascunho, validacao com a categoria lida e embalagem no payload"
```

---

### Task 4: Custos do ML e preço por margem

**Files:**
- Create: `src/lib/canaisDeVenda/ml/custos.js` (importa só `IMPOSTO_PADRAO` de `@/lib/margem`)
- Modify: `src/lib/canaisDeVenda/ml/leitura.js` (`lerTaxas`, `lerFreteDoVendedor`, `lerTendencias`, `lerCustosDoAnuncio`, `precoPorMargemNoML`)
- Test: `scripts/teste-anuncios-ml.js` (bloco "Fase 2: custos e preco por margem")

**Interfaces:**
- Produces, em `custos.js` (puro):
  - `custosDoAnuncio({ preco, custo, percentual, tarifaFixa, frete, imposto = IMPOSTO_PADRAO }): { comissao, tarifaFixa, frete, imposto, lucro, margem } | null` — `null` sem `preco > 0`; `comissao = preco*percentual`; `imposto = preco*IMPOSTO`; `lucro = preco − comissao − tarifaFixa − frete − imposto − custo`; `margem = lucro/preco*100`; dinheiro com 2 casas, margem com 1. Sem custo (`null`): `lucro` e `margem` `null`, o resto calculado.
  - `precoPorMargem({ custo, percentual, tarifaFixa, frete, imposto = IMPOSTO_PADRAO, margem: { tipo: "percentual"|"reais", valor } }): number|null` — `reais`: `(custo + tarifaFixa + frete + valor) / (1 − percentual − imposto)`; `percentual` (m = valor/100): `(custo + tarifaFixa + frete) / (1 − percentual − imposto − m)`; denominador ≤ 0 → `null`; resultado `Math.ceil(x*100)/100`.
  - `custosValem(custosML, rascunho): boolean` — `custosML` guardado no contexto é `{ preco, categoriaId, tipoAnuncio, logistica, freteGratis, percentual, tarifaFixa, frete, pesoCobrado, lidoEm }`; vale quando `preco` (2 casas), `categoriaId`, `tipoAnuncio` e `logistica` são iguais aos do rascunho.
  - `freteQueConta(custosML, rascunho): number` — `custosML.frete` se `rascunho.envio.freteGratis` (e `frete` não é `null`), senão 0 (decisão 3).
- Produces, em `leitura.js`:
  - `lerTaxas(cliente, { preco, categoriaId, tipoAnuncio, logistica }): Promise<{ percentual, tarifaFixa, comissao }>` — `GET /sites/MLB/listing_prices` com `price, category_id, listing_type_id, logistic_type, shipping_mode: "me2"`; `percentual = sale_fee_details.percentage_fee/100`.
  - `lerFreteDoVendedor(cliente, { envio, preco, tipoAnuncio, logistica }): Promise<{ custo, pesoCobrado } | null>` — `null` quando `medidasFaltando(envio)` não é vazio (sem chamada); `dimensions = "{alt}x{larg}x{comp},{gramas}"` (inteiros, `Math.ceil` cm, `Math.round` g); `GET /users/{usuarioId}/shipping_options/free` com `item_price, listing_type_id, mode: "me2", logistic_type, free_shipping: true`; devolve `coverage.all_country.list_cost` e `billable_weight`.
  - `lerTendencias(cliente, categoriaId): Promise<string[]>` — `GET /trends/MLB/{id}` → só `keyword`; **cache em memória por categoria por 6 h** (`Map`); `export function limparCacheDeTendencias()`.
  - `lerCustosDoAnuncio(cliente, rascunho): Promise<custosML>` — junta `lerTaxas` + `lerFreteDoVendedor` no formato de `custosValem`; `frete = null` e `pesoCobrado = null` quando sem medidas.
  - `precoPorMargemNoML(cliente, rascunho, { custo, margem }): Promise<{ preco, custosML } | null>` — iteração: taxas e frete no preço atual (ou 1 sem preço) → `precoPorMargem` → relê taxas e frete nesse preço → repete até a diferença ser < 0,01 ou 4 voltas; `null` quando `precoPorMargem` dá `null`. O frete entra por `freteQueConta`.

- [ ] **Step 1: Escrever os testes (falham)**

```js
const { custosDoAnuncio, precoPorMargem, custosValem, freteQueConta } = await import("../src/lib/canaisDeVenda/ml/custos.js");
const { lerTaxas, lerFreteDoVendedor, lerTendencias, limparCacheDeTendencias, lerCustosDoAnuncio, precoPorMargemNoML } = await import("../src/lib/canaisDeVenda/ml/leitura.js");
conferir("custos: 49 com custo 24, 13%, sem tarifa e sem frete", custosDoAnuncio({ preco: 49, custo: 24, percentual: 0.13, tarifaFixa: 0, frete: 0 }), { comissao: 6.37, tarifaFixa: 0, frete: 0, imposto: 2.94, lucro: 15.69, margem: 32 });
conferir("custos: sem custo, lucro e margem nulos", (({ lucro, margem, comissao }) => [lucro, margem, comissao])(custosDoAnuncio({ preco: 20, custo: null, percentual: 0.13, tarifaFixa: 6.65, frete: 0 })), [null, null, 2.6]);
conferir("custos: sem preco e null", custosDoAnuncio({ preco: 0, custo: 24, percentual: 0.13, tarifaFixa: 0, frete: 0 }), null);
conferir("preco por margem: R$ 20 de lucro", precoPorMargem({ custo: 24, percentual: 0.13, tarifaFixa: 0, frete: 0, margem: { tipo: "reais", valor: 20 } }), 54.33);
conferir("preco por margem: 30%", precoPorMargem({ custo: 24, percentual: 0.13, tarifaFixa: 0, frete: 0, margem: { tipo: "percentual", valor: 30 } }), 47.06);
conferir("preco por margem: inatingivel (90% com 18% + 6%)", precoPorMargem({ custo: 24, percentual: 0.18, tarifaFixa: 0, frete: 0, margem: { tipo: "percentual", valor: 90 } }), null);
conferir("preco por margem: arredonda para cima ao centavo (24,8 / 0,81 = 30,617...)", precoPorMargem({ custo: 10, percentual: 0.13, tarifaFixa: 6.65, frete: 8.15, margem: { tipo: "reais", valor: 0 } }), 30.62);
const lidos = { preco: 49, categoriaId: "MLB99779", tipoAnuncio: "gold_special", logistica: "xd_drop_off", freteGratis: false, percentual: 0.13, tarifaFixa: 0, frete: 8.15, pesoCobrado: 300, lidoEm: 1 };
const r = { ...comCategoria, preco: 49, tipoAnuncio: "gold_special", envio: { ...comCategoria.envio, larguraCm: 8, comprimentoCm: 8, pesoKg: 0.05, logistica: "xd_drop_off", freteGratis: false } };
conferir("custosValem: iguais", custosValem(lidos, r), true);
conferir("custosValem: mudou tipo, categoria, logistica ou preco", [
  custosValem(lidos, { ...r, tipoAnuncio: "gold_pro" }), custosValem(lidos, { ...r, categoriaId: "MLB1" }),
  custosValem(lidos, { ...r, envio: { ...r.envio, logistica: "fulfillment" } }), custosValem(lidos, { ...r, preco: 49.5 }),
], [false, false, false, false]);
conferir("freteQueConta: so com frete gratis", [freteQueConta(lidos, r), freteQueConta(lidos, { ...r, envio: { ...r.envio, freteGratis: true } })], [0, 8.15]);

conferir("lerTaxas: xd_drop_off sem tarifa fixa", await lerTaxas(falso, { preco: 20, categoriaId: "MLB99779", tipoAnuncio: "gold_special", logistica: "xd_drop_off" }), { percentual: 0.13, tarifaFixa: 0, comissao: 2.6 });
conferir("lerTaxas: self_service abaixo do limite cobra 6,65", await lerTaxas(falso, { preco: 20, categoriaId: "MLB99779", tipoAnuncio: "gold_special", logistica: "self_service" }), { percentual: 0.13, tarifaFixa: 6.65, comissao: 9.25 });
conferir("lerTaxas: premium 18%", (await lerTaxas(falso, { preco: 150, categoriaId: "MLB99779", tipoAnuncio: "gold_pro", logistica: "xd_drop_off" })).percentual, 0.18);
conferir("lerTaxas: manda shipping_mode me2 e logistic_type", (({ shipping_mode, logistic_type, listing_type_id }) => [shipping_mode, logistic_type, listing_type_id])(falso.chamadas.at(-1).params), ["me2", "xd_drop_off", "gold_pro"]);
conferir("lerFrete: dimensoes inteiras e custo", await lerFreteDoVendedor(falso, { envio: { alturaCm: 5.5, larguraCm: 8, comprimentoCm: 8, pesoKg: 0.05 }, preco: 49, tipoAnuncio: "gold_special", logistica: "xd_drop_off" }), { custo: 8.15, pesoCobrado: 300 });
conferir("lerFrete: formato AxLxC,g e o usuario no caminho", [falso.chamadas.at(-1).params.dimensions, falso.chamadas.at(-1).caminho], ["6x8x8,50", "/users/212386247/shipping_options/free"]);
const antesDoFrete = falso.chamadas.length;
conferir("lerFrete: sem medidas e null, sem chamada", [await lerFreteDoVendedor(falso, { envio: {}, preco: 49, tipoAnuncio: "gold_special", logistica: "xd_drop_off" }), falso.chamadas.length], [null, antesDoFrete]);
limparCacheDeTendencias();
const antes = falso.chamadas.length;
const t1 = await lerTendencias(falso, "MLB99779"); const t2 = await lerTendencias(falso, "MLB99779");
conferir("tendencias: so keyword, 40 termos, segunda leitura vem do cache", [t1.length, t1[0], JSON.stringify(t2) === JSON.stringify(t1), falso.chamadas.length - antes], [40, "raspberry pi", true, 1]);
const custosML = await lerCustosDoAnuncio(falso, r);
conferir("lerCustosDoAnuncio: junta taxas e frete e vale para o rascunho", [custosML.percentual, custosML.frete, custosValem(custosML, r)], [0.13, 8.15, true]);
const porMargem = await precoPorMargemNoML(falso, { ...r, envio: { ...r.envio, logistica: "self_service", freteGratis: true } }, { custo: 24, margem: { tipo: "reais", valor: 20 } });
conferir("precoPorMargemNoML: converge com tarifa fixa e frete (self_service, frete gratis)", porMargem.preco, 72.6);
conferir("precoPorMargemNoML: inatingivel e null", await precoPorMargemNoML(falso, r, { custo: 24, margem: { tipo: "percentual", valor: 95 } }), null);
```

(Conferência do 72,60: `(24 + 6,65 + 8,15 + 20)/(1 − 0,13 − 0,06) = 58,8/0,81 = 72,59…` → 72,60; abaixo do TH 79 a tarifa fixa continua, então converge na segunda volta.)

- [ ] **Step 2: Rodar e confirmar que falha.**

- [ ] **Step 3: Implementar `custos.js` e as cinco funções em `leitura.js`.**

- [ ] **Step 4: Rodar teste e lint.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/canaisDeVenda/ml/custos.js src/lib/canaisDeVenda/ml/leitura.js scripts/teste-anuncios-ml.js
git commit -m "ML fase 2: custos do ML, frete do vendedor, tendencias e preco por margem"
```

---

### Task 5: IA — categoria, título e ficha técnica

**Files:**
- Modify: `src/lib/ia/anuncio.js` (só acrescentar no fim: `export { chamar as chamarIA, limparTitulo, SISTEMA as SISTEMA_IA, obterCliente as obterClienteIA, registrar as registrarIA };`)
- Create: `src/lib/ia/categoriaML.js`
- Create: `src/lib/ia/tituloML.js`
- Create: `src/lib/ia/fichaML.js`
- Test: `scripts/teste-anuncios-ml.js` (bloco "Fase 2: pedidos e limpeza da IA" — só as partes puras; **nenhuma chamada à IA no teste**)

**Interfaces:**
- Consumes: `chamarIA({ tarefa, quantidade, sistema, pedido, formato })`, `PADRAO_TITULO` de `./padraoTitulo`, `atributos.js` (Tarefa 2), `lerTendencias` (Tarefa 4).
- Produces:
  - `categoriaML.js`: `montarPedidoDeEscolha({ titulo, marca, modelo, descricao, candidatas }): string` (candidatas `[{ categoriaId, nome, caminho }]`, uma por linha `id: caminho.join(" > ")`); `limparEscolha(bruto, candidatas): { categoriaId, motivo } | null` (id fora das candidatas → `null`); `escolherCategoriaIA({ produto, candidatas }): Promise<{ categoriaId, motivo }|null>` (tarefa `"categoria-ml"`, formato JSON `{ categoriaId, motivo }`); `termosDeBuscaIA({ produto }): Promise<string[]>` — chamada **própria** a `obterClienteIA().beta.messages.create` com `tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3 }]` e `output_config` JSON `{ termos: string[] }`, pedindo "3 nomes curtos pelos quais este produto é vendido no Mercado Livre", registrada por `registrarIA` (tarefa `"termos-ml"`); `limparTermos(bruto): string[]` (aparados, sem repetidos, até 3, cada um até 60 caracteres).
  - `tituloML.js`: `montarPedidoDeTitulo({ produto, kit, tendencias, limite, titulosRecusados }): string` — `PADRAO_TITULO` + dados do produto + (kit: "é um KIT com N unidades de …" / itens) + "palavras em alta na categoria (use só as que valem para este produto): …" + o limite; `gerarTitulosML({ produto, kit, tendencias, limite }): Promise<string[]>` — mesmo laço de `gerarTitulos` (até 2 tentativas, `OPCOES_DE_TITULO`, descarta acima do `limite` e repetidos, `limparTitulo`), tarefa `"titulos-ml"`.
  - `fichaML.js`: `preencherFichaIA({ produto, especificacoes, atributos, valoresAtuais, internet }): Promise<{ id, nome, valor }[]>` — pedido de `montarPedidoDaFicha` (Tarefa 2); com `internet: true` usa a chamada com `web_search` (como em `termosDeBuscaIA`), senão `chamarIA`; resposta passa por `limparAtributosDaIA`; tarefa `"ficha-ml"`.
  - Todas lançam `Error` com texto em português quando a IA devolve formato inesperado (como `gerarTitulos`).

- [ ] **Step 1: Escrever os testes das partes puras (falham)**

```js
const { montarPedidoDeEscolha, limparEscolha, limparTermos } = await import("../src/lib/ia/categoriaML.js");
const { montarPedidoDeTitulo } = await import("../src/lib/ia/tituloML.js");
const candidatas = [{ categoriaId: "MLB99779", nome: "Placas", caminho: ["A", "B"] }, { categoriaId: "MLB1", nome: "Outra", caminho: ["C"] }];
conferir("escolha: pedido lista as candidatas por id e caminho", montarPedidoDeEscolha({ titulo: "PLACA UNO", marca: "", modelo: "", descricao: "", candidatas }).includes("MLB99779: A > B"), true);
conferir("escolha: so id das candidatas", [limparEscolha({ categoriaId: "MLB1", motivo: "x" }, candidatas), limparEscolha({ categoriaId: "MLB9", motivo: "x" }, candidatas)], [{ categoriaId: "MLB1", motivo: "x" }, null]);
conferir("termos: aparados, sem repetidos, ate 3", limparTermos({ termos: [" arduino uno ", "arduino uno", "uno r3 ch340", "placa", "quinto"] }), ["arduino uno", "uno r3 ch340", "placa"]);
const pedidoTitulo = montarPedidoDeTitulo({ produto: { tituloBase: "PLACA UNO", marca: "ARDUINO", modelo: "UNO", descricao: "" }, kit: { unidades: 5, itens: ["PLACA UNO"] }, tendencias: ["arduino uno", "kit arduino"], limite: 60, titulosRecusados: [] });
conferir("titulo: pedido cita o kit, as tendencias e o limite", [pedidoTitulo.includes("KIT"), pedidoTitulo.includes("arduino uno"), pedidoTitulo.includes("60")], [true, true, true]);
```

- [ ] **Step 2: Rodar e confirmar que falha.**

- [ ] **Step 3: Implementar.** Em `anuncio.js` só a linha de export no fim (o arquivo é de outra frente: não reescrever).

- [ ] **Step 4: Rodar teste e lint.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/ia/anuncio.js src/lib/ia/categoriaML.js src/lib/ia/tituloML.js src/lib/ia/fichaML.js scripts/teste-anuncios-ml.js
git commit -m "ML fase 2: IA para categoria (sem inventar id), titulo com tendencias e ficha tecnica"
```

---

### Task 6: Orquestração e Server Actions da fase 2

**Files:**
- Create: `src/lib/canaisDeVenda/ml/inteligencia.js` (orquestração testável, recebe `cliente` e a IA)
- Modify: `src/app/canais-de-venda/mercado-livre/acoes.js`
- Test: `scripts/teste-anuncios-ml.js` (bloco "Fase 2: orquestracao com o ML falso" — testa `inteligencia.js`; as ações em si só passam no lint, porque `acoes.js` importa `next/cache`)

**Interfaces:**
- Produces, em `inteligencia.js` (todas recebem `cliente` e os dados já conferidos; a IA é injetável por `ia` para o teste passar funções falsas):
  - `sugerirCategoria(cliente, { titulo, produto, ia = { escolher: escolherCategoriaIA, termos: termosDeBuscaIA } }): Promise<{ candidatas: { categoriaId, nome, caminho, folha, limiteTitulo, recomendada: boolean, motivo: string|null }[], origem: "ml"|"internet", aviso: string|null }>` — (1) `descobrirCategoria(titulo)`; (2) cada candidata passa por `lerCategoria` (nome/caminho/folha); (3) 2+ → `ia.escolher` marca `recomendada` (falha da IA → `aviso: "Não foi possível pedir a recomendação da IA: {message}"`, ninguém recomendada); 1 → não chama a IA; (4) 0 → `ia.termos` e `descobrirCategoria` para cada termo (sem repetir categoria), `origem: "internet"`; ainda 0 → `candidatas: []`, `aviso: "O Mercado Livre não achou categoria para este produto. Digite o código."`.
  - `sugerirTitulos(cliente, { produto, kit, categoriaId, limite, ia = gerarTitulosML }): Promise<string[]>` — `lerTendencias` quando há categoria (falha → `tendencias: []`, sem erro), depois `ia({ produto, kit, tendencias, limite })`.
  - `preencherFicha(cliente, { produto, categoriaId, valoresAtuais, internet, ia = preencherFichaIA }): Promise<{ id, nome, valor }[]>` — `lerCategoriaCompleta` + `linhasDeEspecificacao(produto.descricaoBase)` (de `@/lib/medidas`) + `ia({ produto, especificacoes, atributos, valoresAtuais, internet })`.
- Produces, em `acoes.js` (todas `{ ok, ... }`, com `protegendo`, sem revalidar):
  - `lerCategoriaML(categoriaId)` → `{ ok, categoria }` (`lerCategoriaCompleta`; `null` → `{ ok: false, erro: "Categoria não encontrada no Mercado Livre." }`). `categoriaId` tem que casar `/^MLB\d+$/`.
  - `sugerirCategoriaML(produtoId, titulo)` → resultado de `sugerirCategoria`; produto lido por `contextoDosProdutos`, recusa não Conferido; `titulo` texto de até `LIMITES_ML.titulo`.
  - `sugerirTitulosML(produtoId, { titulo, categoriaId, kit })` → `{ ok, titulos }`; `limite` = `limiteTitulo` da categoria lida (ou `LIMITE_TITULO`).
  - `preencherFichaML(produtoId, { categoriaId, atributos, internet })` → `{ ok, sugestoes }`; `atributos` validado como `Record<string,string>` com os limites de `LIMITES_ML` (reaproveitar o `atributos` do `RascunhoMLSchema`).
  - `lerCustosML(rascunho)` → `{ ok, custosML }`; o rascunho passa por `RascunhoMLSchema` antes (o navegador manda o rascunho inteiro); exige `categoriaId` e `preco > 0`.
  - `precoPorMargemML(rascunho, { custo, margem })` → `{ ok, preco, custosML }` ou `{ ok: false, erro: "Margem inatingível com estas taxas." }`; `custo` número > 0, `margem.tipo` em `["percentual","reais"]`, `margem.valor` número ≥ 0.
  - Erros do ML passam por `textoDoErroML`; erros da IA, pelo `message`.

- [ ] **Step 1: Escrever os testes de `inteligencia.js` com o falso e IA falsa (falham)**

```js
const { sugerirCategoria, sugerirTitulos, preencherFicha } = await import("../src/lib/canaisDeVenda/ml/inteligencia.js");
const produtoIA = { tituloBase: "PLACA UNO", marca: "ARDUINO", modelo: "UNO", descricaoBase: "Especificações técnicas:\n- Microcontrolador: ATmega328P;" };
const umaSo = await sugerirCategoria(falso, { titulo: "placa uno r3 ch340", produto: produtoIA, ia: { escolher: async () => { throw new Error("nao devia chamar"); }, termos: async () => [] } });
conferir("sugerirCategoria: uma candidata nao chama a IA, vem com nome e folha", [umaSo.origem, umaSo.candidatas.map((c) => [c.categoriaId, c.folha, c.recomendada])], ["ml", [["MLB99779", true, false]]]);
const duas = criarMLFalso({ descoberta: { "placa": ["MLB99779", "MLB1648"] } });
const escolhida = await sugerirCategoria(duas, { titulo: "placa", produto: produtoIA, ia: { escolher: async () => ({ categoriaId: "MLB99779", motivo: "é placa" }), termos: async () => [] } });
conferir("sugerirCategoria: duas candidatas, a IA recomenda uma", escolhida.candidatas.map((c) => [c.categoriaId, c.recomendada, c.motivo]), [["MLB99779", true, "é placa"], ["MLB1648", false, null]]);
const iaCaiu = await sugerirCategoria(duas, { titulo: "placa", produto: produtoIA, ia: { escolher: async () => { throw new Error("IA fora"); }, termos: async () => [] } });
conferir("sugerirCategoria: IA falha, candidatas ficam e o aviso diz", [iaCaiu.candidatas.length, iaCaiu.aviso], [2, "Não foi possível pedir a recomendação da IA: IA fora"]);
const pelaInternet = await sugerirCategoria(falso, { titulo: "xyzw nada", produto: produtoIA, ia: { escolher: async () => null, termos: async () => ["placa uno r3 ch340", "placa uno r3 ch340"] } });
conferir("sugerirCategoria: sem candidata, termos da IA voltam ao ML, sem repetir", [pelaInternet.origem, pelaInternet.candidatas.map((c) => c.categoriaId)], ["internet", ["MLB99779"]]);
conferir("sugerirCategoria: nada em lugar nenhum", (await sugerirCategoria(falso, { titulo: "xyzw nada", produto: produtoIA, ia: { escolher: async () => null, termos: async () => [] } })).aviso, "O Mercado Livre não achou categoria para este produto. Digite o código.");
let recebido = null;
const titulos = await sugerirTitulos(falso, { produto: produtoIA, kit: null, categoriaId: "MLB99779", limite: 60, ia: async (args) => { recebido = args; return ["A", "B"]; } });
conferir("sugerirTitulos: passa tendencias e limite a IA", [titulos, recebido.tendencias.length, recebido.limite], [["A", "B"], 40, 60]);
const ficha = await preencherFicha(falso, { produto: produtoIA, categoriaId: "MLB99779", valoresAtuais: { BRAND: "ARDUINO" }, internet: false, ia: async ({ especificacoes, atributos }) => [{ id: "MODEL", nome: "Modelo", valor: `${especificacoes.length}/${atributos.length}` }] });
conferir("preencherFicha: le a categoria, extrai as especificacoes e devolve o que a IA sugeriu", ficha[0].valor.split("/").map(Number).every((n) => n > 0), true);
```

- [ ] **Step 2: Rodar e confirmar que falha.**

- [ ] **Step 3: Implementar `inteligencia.js` e as seis ações.** Na ação, `cliente = clienteML()` e a IA real como padrão.

- [ ] **Step 4: Rodar teste e lint.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/canaisDeVenda/ml/inteligencia.js src/app/canais-de-venda/mercado-livre/acoes.js scripts/teste-anuncios-ml.js
git commit -m "ML fase 2: orquestracao de categoria, titulo e ficha e as Server Actions de leitura"
```

---

### Task 7: Aba Geral — categoria e título sugeridos; editor carrega a categoria

**Files:**
- Modify: `src/components/anuncios/ml/EditorAnuncioML.jsx`
- Modify: `src/components/anuncios/ml/AbaGeral.jsx`
- Create: `src/components/anuncios/ml/SugestaoDeCategoria.jsx`
- Create: `src/components/anuncios/ml/SugestaoDeTitulo.jsx`

**Interfaces:**
- Consumes: `lerCategoriaML`, `sugerirCategoriaML`, `sugerirTitulosML` (Tarefa 6); `limiteDoTitulo` (Tarefa 3); `unidadesDaComposicao` de `composicao.js`.
- Produces: `contexto.categoria` / `contexto.categoriaErro` mantidos pelo editor: `useEffect` no `EditorAnuncioML` que, quando `rascunho.categoriaId` casa `/^MLB\d+$/` e difere de `contexto.categoria?.id`, chama `lerCategoriaML` (com `useTransition` e um contador em `useRef` para descartar resposta velha, como `JanelaDescricao` faz) e grava `categoria`/`categoriaErro` por `setContexto`; sem categoria, limpa os dois. `AbaGeral` recebe `carregandoCategoria: boolean`. O `contextoInicial` da página e da janela ganha `categoria: undefined, categoriaErro: null, custosML: null`.

- [ ] **Step 1: Implementar**
  - `SugestaoDeCategoria`: botão "Sugerir categoria" (ícone `Sparkles`, `useTransition`); ao responder, lista das candidatas (caminho, badge "IA recomenda" com o motivo em `title`, badge "não é final" se `!folha`), cada uma com "Usar"; `aviso` em texto âmbar; `origem === "internet"` mostra "Encontrada pela pesquisa na internet". "Usar" chama `alterar({ categoriaId, categoriaNome: nome })`. Erro da ação: texto vermelho sob o botão, nada muda.
  - `AbaGeral`: o campo "Categoria do ML" mostra o caminho (`contexto.categoria.caminho.join(" > ")`) embaixo, "Lendo a categoria…" enquanto `carregandoCategoria`, e o `categoriaErro`; a bolha de ajuda deixa de dizer "A sugestão automática entra na fase 2". Ao digitar, `categoriaNome` vira `null`. O contador do título usa `limiteDoTitulo(rascunho, contexto)`.
  - `SugestaoDeTitulo`: botão "Sugerir título"; chama `sugerirTitulosML(rascunho.produtoId, { titulo, categoriaId, kit })` com `kit = rascunho.composicao ? { unidades: unidadesDaComposicao(itens), itens: itens.map((i) => contexto.produtos[i.produtoId]?.tituloBase).filter(Boolean) } : null`; mostra as opções como botões com o tamanho `n/limite`; clicar faz `alterar({ titulo })`. Sem categoria, o `title` do botão avisa "Com a categoria escolhida, a IA usa as palavras em alta".

- [ ] **Step 2: Lint e conferência no navegador** — `npm run lint`; subir o servidor (`preview_start` `sistema-rise`), abrir `/canais-de-venda/mercado-livre/novo?produto=100101`: "Sugerir categoria" devolve `MLB99779` com o caminho; "Usar" preenche o campo e, embaixo, aparece "Eletrônicos… > Placas de Microcontroladores"; digitar `MLB1648` à mão acusa "não é final" na Prévia; "Sugerir título" devolve até 3 opções de até 60. Conferir que o `LogIntegracao` só tem `GET` com serviço `MERCADO_LIVRE` (tela Integrações ou `prisma.logIntegracao.findMany`).

- [ ] **Step 3: Commit**

```bash
git add src/components/anuncios/ml/EditorAnuncioML.jsx src/components/anuncios/ml/AbaGeral.jsx src/components/anuncios/ml/SugestaoDeCategoria.jsx src/components/anuncios/ml/SugestaoDeTitulo.jsx src/app/canais-de-venda/mercado-livre
git commit -m "ML fase 2: aba Geral sugere categoria e titulo; editor le a categoria do ML"
```

---

### Task 8: Aba Ficha técnica com os atributos da categoria e IA

**Files:**
- Modify: `src/components/anuncios/ml/AbaFichaTecnica.jsx`
- Create: `src/components/anuncios/ml/CampoDeAtributo.jsx`
- Create: `src/components/anuncios/ml/SugestaoDeFicha.jsx`

**Interfaces:**
- Consumes: `contexto.categoria.atributos` (Tarefas 2/3), `motivoSemGtin`, `preencherFichaML` (Tarefa 6), `problemasDoCampo`.
- Produces: `CampoDeAtributo({ atributo, valor, erro, aoMudar })` — `lista` → `<select>` com opção vazia + `valores` (valor gravado = nome oficial); `booleano` → select com os nomes da lista do ML; `numero`/`numero_unidade` → input `inputMode="decimal"` com a unidade ao lado (valor gravado `"{n} {unidade}"` quando há unidades, senão o número); `texto` → input (BRAND/MODEL com `digitarEmMaiusculas`). `ajuda` = `atributo.dica`.

- [ ] **Step 1: Implementar**
  - Sem `contexto.categoria`: a aba mostra os três campos da fase 1 e o aviso "Escolha a categoria na aba Geral para ver os atributos dela" (botão "Ir para Geral" via `irPara`).
  - Com categoria: seção **"Obrigatórios"** (`obrigatorio`), seção **"GTIN"** (campo GTIN como hoje + select `EMPTY_GTIN_REASON` com os valores da categoria; no kit o GTIN some e o motivo nasce com `motivoSemGtin(…, { kit: true })` se estiver vazio — feito em `useEffect` **uma vez por categoria**, sem sobrescrever o que o dono escolheu), seção **"Outros atributos da categoria"** fechada por padrão (`<details>`), com os demais. Cada campo mostra o problema de `problemasDoCampo(problemas, atributo.id)`.
  - `SugestaoDeFicha`: caixa "pesquisar na internet (custa mais)" + botão "Preencher com IA"; chama `preencherFichaML(rascunho.produtoId, { categoriaId, atributos: rascunho.atributos, internet })`; o resultado vira uma lista com caixas marcadas (`nome: valor`), botão "Aplicar marcados" → `alterar((atual) => ({ atributos: { ...atual.atributos, ...marcados } }))`; "Nenhum atributo em branco que a IA consiga preencher" quando vazio.
  - A lista "Especificações da descrição" da fase 1 fica, abaixo; a frase "Os atributos da categoria do ML entram na fase 2" sai.

- [ ] **Step 2: Lint e conferência no navegador** — com `MLB99779`: BRAND/MODEL obrigatórios, GTIN com o select do motivo; ligar o kit na Geral preenche o motivo "kit ou pack" sozinho; "Preencher com IA" sugere e "Aplicar marcados" preenche só os em branco; Prévia sem bloqueante de ficha quando obrigatórios e GTIN/motivo estão preenchidos.

- [ ] **Step 3: Commit**

```bash
git add src/components/anuncios/ml/AbaFichaTecnica.jsx src/components/anuncios/ml/CampoDeAtributo.jsx src/components/anuncios/ml/SugestaoDeFicha.jsx
git commit -m "ML fase 2: ficha tecnica com os atributos da categoria, motivo sem GTIN e IA"
```

---

### Task 9: Aba Preço e estoque com os custos do ML e a calculadora; aba Envio com a logística

**Files:**
- Modify: `src/components/anuncios/ml/AbaPrecoEstoque.jsx`
- Create: `src/components/anuncios/ml/CustosDoML.jsx`
- Create: `src/components/anuncios/ml/CalculadoraDeMargem.jsx`
- Modify: `src/components/anuncios/ml/AbaEnvio.jsx`

**Interfaces:**
- Consumes: `custosDoAnuncio`, `custosValem`, `freteQueConta` (Tarefa 4); `lerCustosML`, `precoPorMargemML` (Tarefa 6); `LOGISTICAS_ML` (Tarefa 3); `IMPOSTO_PADRAO`, `corDaMargem`; `ListaFlutuante` (o mesmo do cadastro de Produto).
- Produces: `contexto.custosML` (formato de `custosValem`) gravado por `setContexto` após `lerCustosML`; `null` até a primeira leitura.

- [ ] **Step 1: Implementar**
  - `CustosDoML`: bloco com botão "Ler custos do ML" (`useTransition`); desabilitado com o motivo quando falta categoria ou preço. Quando `contexto.custosML` existe e `custosValem(custosML, rascunho)`: linhas Comissão (`percentual` % e R$), Tarifa fixa, Frete do vendedor (`custo`, com "(estimativa; só conta com frete grátis)" quando `!freteGratis`, "peso cobrado {g} g" ao lado; "informe as medidas na aba Envio" quando `frete === null`), Imposto 6%, **Lucro** e **Margem** (cor por `corDaMargem(preco, custo)`), via `custosDoAnuncio({ preco, custo: custo.valor, percentual, tarifaFixa, frete: freteQueConta(...) })`. Quando existe mas não vale: aviso âmbar "Os custos foram lidos para outro preço, categoria, tipo ou logística" e o botão vira "Atualizar custos". Erro da ação em vermelho; custos antigos ficam.
  - `CalculadoraDeMargem`: ícone `Calculator` ao lado do preço (como no cadastro de Produto), abre `ListaFlutuante` com "Margem desejada" (`%` ou `R$`, dois radios + um campo decimal), botão "Calcular" → `precoPorMargemML(rascunho, { custo: custo.valor, margem })`; mostra "Preço necessário: R$ x" e "Usar este preço" (`alterar({ preco })` + `setContexto((atual) => ({ ...atual, custosML }))` com os custos devolvidos). Desabilitada sem custo ("Marque um fornecedor padrão com custo") ou sem categoria. Erro "Margem inatingível com estas taxas." em vermelho.
  - A frase da fase 1 "Comissão, tarifa e frete do ML entram na fase 2" sai; o bloco "Margem líquida" da fase 1 é substituído por `CustosDoML` (sem custos lidos, ele mostra a margem simples de hoje com a nota "sem as taxas do ML: leia os custos").
  - `AbaEnvio`: `Campo` select "Tipo de logística" com `LOGISTICAS_ML` (`envio.logistica`), ajuda "Muda a tarifa fixa do ML: Flex cobra tarifa fixa em preço baixo"; mensagem do campo `arredondamento` (Tarefa 3) embaixo das medidas; o "Modo de envio" continua só leitura.

- [ ] **Step 2: Lint e conferência no navegador** — `100101`, categoria `MLB99779`, preço 49: "Ler custos" mostra 13%, R$ 6,37, tarifa 0, frete ~R$ 8,15, lucro e margem; mudar para Premium mostra o aviso e "Atualizar" traz 18%; calculadora com R$ 20 → ~54,33, "Usar" preenche. Logística Flex e preço 20 → tarifa fixa 6,65.

- [ ] **Step 3: Commit**

```bash
git add src/components/anuncios/ml/AbaPrecoEstoque.jsx src/components/anuncios/ml/CustosDoML.jsx src/components/anuncios/ml/CalculadoraDeMargem.jsx src/components/anuncios/ml/AbaEnvio.jsx
git commit -m "ML fase 2: custos do ML, calculadora de preco por margem e logistica na aba Envio"
```

---

### Task 10: Prévia, documentação e fechamento

**Files:**
- Modify: `src/components/anuncios/ml/AbaPrevia.jsx`
- Modify: `CLAUDE.md` (seção nova "Canais de Venda: Mercado Livre (fase 2)" + contagem do `teste:anuncios-ml`)
- Modify: `docs/superpowers/specs/2026-09-30-canais-de-venda-mercado-livre-design.md` (uma linha na §6 item 7 e na §10: "validador do ML é POST; a fase 2 valida localmente; liberar os POST é decisão do dono")

- [ ] **Step 1: Implementar**
  - `AbaPrevia`: o texto "Pronto para publicar quando a publicação for ligada (fase 3)" vira "Sem problemas na validação local. O validador do Mercado Livre (POST) depende de liberação e entra com a publicação." Nova linha no topo com a categoria lida (`caminho.join(" > ")`) ou "Categoria não lida".
  - `CLAUDE.md`: onde mora cada parte (`cliente.js`, `leitura.js`, `atributos.js`, `custos.js`, `inteligencia.js`, `scripts/lib/mlFalso.js`, `src/lib/ia/{categoriaML,tituloML,fichaML}.js`), as 8 decisões deste plano em uma linha cada, o contrato `{ get, usuarioId }`, o cache de tendências, "só GET", `contexto.categoria`/`custosML` vivem no editor e não no banco, e a contagem nova de conferências do `teste:anuncios-ml`.

- [ ] **Step 2: Rodar tudo** — `npm run lint && npm run teste:anuncios-ml && npm run teste:estoque && npm run teste:cadastros`. Expected: tudo verde. No navegador: abrir um anúncio salvo na fase 1 (sem `logistica`) e ver `xd_drop_off` na aba Envio e a categoria sendo lida ao montar.

- [ ] **Step 3: Commit**

```bash
git add src/components/anuncios/ml/AbaPrevia.jsx CLAUDE.md docs/superpowers/specs/2026-09-30-canais-de-venda-mercado-livre-design.md
git commit -m "ML fase 2: previa com a categoria lida, CLAUDE.md e nota na spec sobre o validador"
```

---

## Fora deste plano (e onde está anotado)

- `POST /items/validate` e `POST /categories/{id}/attributes/conditional`: decisão do dono (investigação, "Decisões que dependem do dono", item 1).
- Preço recomendado pelo ML: só para anúncio publicado (spec §6).
- Limite TH do frete grátis obrigatório e `mandatory_free_shipping`: não confirmado (A3).
- Tudo da fase 3 (publicar, Bling, kit no Bling, `SELLER_PACKAGE_*` obrigatórios na publicação).
