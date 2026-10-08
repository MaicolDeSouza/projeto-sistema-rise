# Canais de Venda — Mercado Livre, fase 3 (Publicar) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O botão Publicar do editor de anúncio do ML passa a funcionar: valida no ML, sobe as fotos, cria o anúncio **pausado** (com preço), põe a descrição, garante o kit no Bling (anúncio de composição), vincula o anúncio ao produto no Bling (loja `203593931`) e só então ativa — com cada etapa gravada e "Retomar publicação" continuando da que falhou. Tudo sob as travas `ML_PUBLICACAO`/`BLING_ESCRITA` (e as listas de códigos liberados), que **continuam `false`**: o primeiro envio real é um passo à parte, com o dono.

**Architecture:** O conector do ML ganha escrita (`mlPost`, `mlPut`, `mlUpload`), sempre com uma tentativa só e barrada por `exigirTravaLiberada`. `clienteML()` passa a ter `post`, `put`, `upload` e `exigirEscrita(codigo)`; o ML falso (`scripts/lib/mlFalso.js`) responde às escritas e **recusa escrita sem `exigirEscrita` antes**, como o Bling falso. O que é puro (corpo do item, causas de erro do ML, etapas, corpo do kit do Bling) fica sem rede; a orquestração (`ml/publicar.js`) recebe `{ ml, bling }` por parâmetro e grava o estado em `Anuncio.dados.publicacao` + colunas que já existem (`idExterno`, `urlExterna`, `payloadEnviado`, `erro`, `publicadoEm`, `situacaoCanal`). Sem migration.

**Tech Stack:** Next.js 16.3 (App Router, Server Actions), React 19, Prisma 7 + PostgreSQL 17, zod, Tailwind; testes em Node puro (`scripts/teste-anuncios-ml.js`, `conferir` com `JSON.stringify`), sem rede, com o ML falso e o Bling falso.

**Spec:** `docs/superpowers/specs/2026-09-30-canais-de-venda-mercado-livre-design.md` (seções 3, 6.1, 7, 7.1, 9, 12). Investigação: `docs/superpowers/investigacoes/2026-10-01-ml-bling-para-fases-2-e-3.md` (A2, A6, A7, B1–B6). Fases anteriores: seções "Canais de Venda: Mercado Livre (fase 1)" e "(fase 2)" do `CLAUDE.md`. Documentação do ML lida em 08/10/2026 no navegador: `publicacao-de-produtos`, `user-products`, `preco-variacao` (atualizada 17/09/2026), `api-de-precos` (26/02/2026), `trabalhar-com-imagens` (24/03/2026), `produto-sincronizacao-de-publicacoes`.

## Decisões deste plano

Do dono (08/10/2026):
1. **Título vira o `family_name`.** No modelo User Products (a conta tem a tag `user_product_seller`) o ML **não aceita `title`** no `POST /items`: ele gera o título a partir do `family_name` (até `max_title_length`) e dos atributos (`preco-variacao`). O campo "Título" do editor (60 caracteres, sugestões da IA) é o que vai como `family_name`; o campo `family_name` separado sai da tela. `rascunho.familyName` continua no esquema (rascunhos antigos), mas nada mais o lê.
2. **Kit pelos dois caminhos.** (a) Anúncio de um **Produto com composição** do cadastro (tipo `COM_COMPOSICAO`, já cadastrado no Bling pelo pop-up do Bling) publica como anúncio simples daquele produto; a pré-checagem exige que ele seja kit (`formato "E"`) no Bling. (b) Anúncio **com composição** montada no editor (`dados.composicao`): todos os itens precisam ser Conferidos, ter `blingId` e existir no Bling como produto simples; o Rise **garante o kit no Bling** (procura o código; existe com as mesmas peças → reaproveita; com outras peças → para; não existe → cria `formato "E"`, estoque virtual).
3. **Validador do ML entra** (`POST /items/validate`, sem criar nada) como etapa do Publicar, e há o botão **"Validar no ML"** na Prévia.

Do plano (o que a documentação de 08/10/2026 mudou em relação à spec §7):
4. **Preço vai no `POST /items`.** A página de preços (26/02/2026) diz que criar e editar continua pela `/items`, e que o "editar preços standard" ainda **não está disponível**. A etapa `POST /items/{id}/prices/standard` da spec sai; a linha do `CLAUDE.md` que dizia o contrário é corrigida na Tarefa 8.
5. **Fotos ANTES da criação.** `POST /pictures/items/upload` (multipart, campo `file`) devolve o `id`, e o item nasce com `pictures: [{ id }]`. A spec as punha depois.
6. **Descrição por `POST /items/{id}/description`** (`{ plain_text }`), como diz a documentação; a spec dizia `PUT`.
7. **Pausado:** o corpo leva `status: "paused"`. A documentação não diz se o `POST` aceita; se a resposta vier `active`, a etapa `pausar` faz `PUT {status:"paused"}` na hora. O anúncio só é ativado depois do vínculo no Bling.
8. **Segunda trava do ML, no molde do Bling e da LI:** `ML_PUBLICACAO_CODIGOS` (lista de códigos liberados; **vazia libera todos**). O código conferido é o SKU do anúncio (o código do kit, ou o SKU do produto). `exigirEscrita` do ML **e** do Bling rodam antes da primeira escrita de qualquer um dos dois.
9. **Escrita nunca repete sozinha.** Se a criação do item termina sem resposta certa (exceção de rede ou HTTP 5xx), a publicação fica `incerta`: "Retomar" recusa até o dono conferir no ML e escolher "Criar de novo" (`recriar: true`).
10. **Vínculo no Bling:** `POST /produtos/lojas` só na loja `203593931`, com `codigo` = MLB do anúncio e `preco` = preço do anúncio (`precoPromocional` não vai). Vínculo do mesmo produto com **outro** MLB na mesma loja não impede (Clássico e Premium, anúncios antigos); se o Bling recusar o segundo vínculo, o anúncio fica pausado com o recado (não confirmado; o primeiro envio real mostra).
11. **Edição durante e depois:** Salvar é recusado com `status = PUBLICANDO`, e anúncio cujo item já existe no ML (`dados.publicacao.itemId`) não volta a ser rascunho: só "Retomar". Gerenciar anúncio publicado (editar, pausar, sincronizar preço/estoque) fica fora desta fase.
12. **Uma publicação por anúncio de cada vez:** trava em memória por anúncio (`umPorVez`, molde da sincronização do Bling) + `SELECT ... FOR UPDATE` em toda gravação de `dados` (publicação **e** `salvarRascunhoML`), o que fecha o item (2) "gravar vínculo e etapa de forma atômica" deixado pela fase 1.
13. **`gerarSku` passa a pular os códigos de kit dos anúncios** (item (1) deixado pela fase 1): o Rise vai criar esses códigos no Bling, e um produto novo com o mesmo 25xxxx seria recusado lá.

Fora desta fase: gerenciar anúncio publicado, `hashConteudo`, aviso de exclusão de produto com anúncios, listagem paginada no banco, Shopee. **O primeiro Publicar real** (travas abertas só no ambiente de um script, um produto de teste, com o dono acompanhando) é um passo à parte, depois do plano.

## Global Constraints

- JavaScript sem TypeScript; identificadores e comentários em português **sem acento**; texto de tela **com acento**. Comentários explicam o porquê.
- **Nenhum código liga `ML_PUBLICACAO`, `BLING_ESCRITA` nem as listas de códigos.** Testes só com o ML falso e o Bling falso (sem rede). A conta do ML tem 1.007 anúncios reais e o Bling tem estoque real.
- Toda escrita no ML passa por `chamar` em `src/lib/integracoes/mercadolivre.js` (→ `exigirTravaLiberada("MERCADO_LIVRE")` → `requisitar` com `tentativas: 1`, que grava `LogIntegracao`). Toda escrita no Bling passa pelo `clienteBling()` (`blingPost` já tem `tentativas: 1`).
- Funções de publicação recebem `{ ml, bling }` por parâmetro (`ml = clienteML()`, `bling = clienteBling()`); nenhum arquivo novo de `src/lib/canaisDeVenda/ml/` importa `mlPost`/`blingPost` direto, só `cliente.js`.
- Alvo no Bling sempre pelo **código, buscado na hora** (`buscarNoBling`, Emenda 11), nunca pelo `blingId` guardado. Só a loja `203593931` recebe vínculo (há 8 canais ML no Bling e só um ativo).
- Só Produto **Conferido** e com `blingId` publica; conferido **no servidor** na pré-checagem.
- Nunca fixar ids/percentuais do ML no código; o motivo de "sem GTIN" continua sendo lido da categoria.
- Mensagens de erro em português, com o texto do ML/Bling junto (`causasDoML`, `motivoDoBling`); falha nunca apaga o rascunho.
- Server Actions finas em `src/app/canais-de-venda/mercado-livre/acoes.js` (`ehId`, `protegendo`, nunca deixam exceção subir); as que escrevem revalidam `/canais-de-venda/mercado-livre` e `/produtos`.
- Ritual antes de cada commit: `npm run lint` e `npm run teste:anuncios-ml` verdes (e `npm run teste:bling-sync` quando mexer em `blingFalso.js` ou `blingSync/`); `.env`, `certificates/` e `dados/` fora; arquivos comitados **pelo nome**. Commits em português, sem acento no título, terminados com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Sem migration.

## Review Focus

1. **Resposta perdida na criação do item** (timeout, 5xx): repetir criaria dois anúncios iguais no ML. Teste na Tarefa 6: `publicarAnuncioML` com o ML falso respondendo 500 no `POST /items` deixa `publicacao.incerta = true`; a segunda chamada sem `recriar` não faz `POST /items` (zero chamadas novas) e devolve o recado "Confira no Mercado Livre...".
2. **Retomar depois de falha em cada etapa** não refaz o que já foi: fotos não sobem de novo, o item não é recriado, a descrição não é postada duas vezes, o vínculo não duplica. Teste na Tarefa 6, uma falha forçada por etapa (`descricao`, `kit_bling`, `vinculo`, `ativar`), conferindo as chamadas do segundo `publicarAnuncioML`.
3. **Trava fechada ou código fora da lista** (ML ou Bling): nada é escrito em nenhum dos dois. Teste na Tarefa 6: com `exigirEscrita` do Bling lançando, o ML falso tem **zero** chamadas de escrita (nem upload de foto) e o anúncio continua `RASCUNHO`.
4. **Kit que já existe no Bling com outras peças** (peça diferente, quantidade diferente, peça a mais): vincular baixaria o estoque dos produtos errados. Teste na Tarefa 3 (`conferirKitNoBling` → `diferente` com o recado das peças) e na Tarefa 5 (a pré-checagem recusa antes de qualquer escrita no ML).
5. **ML ignora o `status: "paused"` da criação** e devolve o item `active`: o anúncio ficaria no ar sem vínculo no Bling. Teste na Tarefa 6: com o falso devolvendo `active`, a etapa `pausar` faz `PUT {status:"paused"}` antes da descrição.

---

### Task 1: Escrita no conector do ML, segunda trava e ML falso com escrita

**Files:**
- Modify: `src/lib/integracoes/httpClient.js` (corpo `FormData`)
- Modify: `src/lib/integracoes/mercadolivre.js` (`chamar` com `tentativas`; `mlPost`, `mlPut`, `mlUpload`)
- Modify: `src/lib/integracoes/config.js` (`mlCodigosLiberados`)
- Modify: `src/lib/canaisDeVenda/ml/cliente.js`
- Modify: `scripts/lib/mlFalso.js`
- Modify: `.env.example` (linha `ML_PUBLICACAO_CODIGOS=` ao lado de `ML_PUBLICACAO`)
- Test: `scripts/teste-anuncios-ml.js` (bloco externo novo "Fase 3", sub-bloco "cliente com escrita e ML falso")

**Interfaces:**
- Consumes: `exigirCodigoLiberado(codigo, liberados, variavel)` de `src/lib/blingSync/cliente.js`; `separarLista` de `config.js`.
- Produces:
  - `requisitar` aceita `corpo instanceof FormData`: manda o `FormData` cru, **sem** `Content-Type` (o `fetch` põe o `boundary`), e grava no `requestResumo` só `{ query, multipart: [nomes dos campos] }`.
  - Em `integracoes/mercadolivre.js`: `mlPost(caminho, corpo)`, `mlPut(caminho, corpo)`, `mlUpload(caminho, { bytes: Buffer, nome: string, tipo: string })` (monta `FormData` com o campo `file`). As três com `tentativas: 1`; `chamar` passa `tentativas` adiante.
  - `config.travas.mlCodigosLiberados: string[]` lido de `ML_PUBLICACAO_CODIGOS`.
  - `clienteML(): { get, usuarioId, post, put, upload, exigirEscrita(codigo) }` — `exigirEscrita` = `exigirTravaLiberada("MERCADO_LIVRE")` e depois `exigirCodigoLiberado(codigo, config.travas.mlCodigosLiberados, "ML_PUBLICACAO_CODIGOS")`.
  - `criarMLFalso(opcoes)` ganha `post`, `put`, `upload`, `exigirEscrita(codigo)`, `itens` (Map id → item), `fotos` (ids subidos) e `escritas` (lista `{ metodo, caminho, corpo }`). Opções novas: `codigosLiberados: string[]`, `falhas: [{ metodo, caminho, status, dados?, lancar? }]` (casa por `startsWith`, uma vez cada, na ordem), `ignorarPausado: boolean` (o item nasce `active` mesmo com `status: "paused"`), `validacao: { status: 400, dados: { message, error, cause: [...] } } | null` (padrão: `204`). Rotas: `POST /items/validate` → 204/`validacao`; `POST /pictures/items/upload` → `{ id: "999-MLB<n>_102026", variations: [...] }`; `POST /items` → 201 com `{ id: "MLB<n>", status, permalink, price, family_name, title: family_name }` (recusa 400 se vier `title`, como o ML real no modelo UP); `POST /items/{id}/description` → 201; `PUT /items/{id}` → 200 com o item atualizado; `GET /items/{id}` → 200/404. **Escrita sem `exigirEscrita` aceita antes lança** (`ML falso: POST /items sem exigirEscrita(codigo) antes`).

- [ ] **Step 1: Escrever os testes (falham)**

Bloco externo `{ ... }` "Fase 3" antes do comentário-marcador do fim (envolve os sub-blocos das Tarefas 1 a 6, que compartilham imports e fábricas). Sub-bloco desta tarefa:

```js
console.log("\nFase 3: cliente com escrita e ML falso");
const { criarMLFalso } = await import("./lib/mlFalso.js");
const ml = criarMLFalso({ codigosLiberados: ["100101"] });
let recusa = null; try { await ml.post("/items", {}); } catch (e) { recusa = e.message; }
conferir("falso: escrita sem exigirEscrita lanca", /exigirEscrita/.test(recusa), true);
let fora = null; try { ml.exigirEscrita("999999"); } catch (e) { fora = e.message; }
conferir("falso: codigo fora da lista recusado", /999999.*ML_PUBLICACAO_CODIGOS/.test(fora), true);
ml.exigirEscrita("100101");
conferir("falso: validate sem erro e 204", (await ml.post("/items/validate", { family_name: "X" })).status, 204);
const foto = await ml.upload("/pictures/items/upload", { bytes: Buffer.from("jpg"), nome: "a-1.jpg", tipo: "image/jpeg" });
conferir("falso: upload devolve id", [foto.status, /^999-MLB/.test(foto.dados.id)], [200, true]);
conferir("falso: POST /items com title e 400", (await ml.post("/items", { title: "X", family_name: "X" })).status, 400);
const criado = await ml.post("/items", { family_name: "PLACA", status: "paused", price: 50 });
conferir("falso: cria pausado com MLB", [criado.status, criado.dados.status, /^MLB\d+$/.test(criado.dados.id)], [201, "paused", true]);
const pausadoIgnorado = criarMLFalso({ ignorarPausado: true }); pausadoIgnorado.exigirEscrita("x");
conferir("falso: ignorarPausado nasce active", (await pausadoIgnorado.post("/items", { family_name: "Y", status: "paused" })).dados.status, "active");
const comFalha = criarMLFalso({ falhas: [{ metodo: "POST", caminho: "/items/MLB", status: 500 }] }); comFalha.exigirEscrita("x");
const item = (await comFalha.post("/items", { family_name: "Z" })).dados.id;
conferir("falso: falha programada uma vez", [(await comFalha.post(`/items/${item}/description`, { plain_text: "a" })).status, (await comFalha.post(`/items/${item}/description`, { plain_text: "a" })).status], [500, 201]);
const { separarLista } = await import("../src/lib/integracoes/config.js");
conferir("config: lista do ML separada como a do Bling", separarLista(" 100101 ,, ZZ-ML-1"), ["100101", "ZZ-ML-1"]);
```

E um teste de `requisitar` sem rede (trocando `globalThis.fetch` por uma função que captura o pedido e devolve `new Response("{}")`, restaurado num `finally`): com `corpo` `FormData`, o `body` enviado é o próprio `FormData` e os headers **não** têm `Content-Type`.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm run teste:anuncios-ml`
Expected: FAIL — `ml.post is not a function`.

- [ ] **Step 3: Implementar** `httpClient` (FormData), `mlPost`/`mlPut`/`mlUpload`, `mlCodigosLiberados`, `clienteML` com escrita, ML falso com as rotas e opções acima. Atualizar o comentário de `cliente.js` (deixa de ser "só leitura").

- [ ] **Step 4: Rodar teste e lint**

Run: `npm run teste:anuncios-ml && npm run lint`
Expected: bloco novo todo `ok`; "Todos os testes de anuncios ML OK."; lint limpo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/integracoes/httpClient.js src/lib/integracoes/mercadolivre.js src/lib/integracoes/config.js src/lib/canaisDeVenda/ml/cliente.js scripts/lib/mlFalso.js scripts/teste-anuncios-ml.js .env.example
git commit -m "ML fase 3: escrita no conector do ML, trava por codigo e ML falso com escrita"
```

---

### Task 2: Título como `family_name` e o corpo da criação

**Files:**
- Modify: `src/lib/canaisDeVenda/ml/payload.js`
- Modify: `src/lib/canaisDeVenda/ml/validacao.js` (o problema do `family_name` sai; título obrigatório e dentro do limite continua)
- Modify: `src/components/anuncios/ml/AbaGeral.jsx` (sai o campo family_name; a bolha do Título diz que ele vai como `family_name` e o ML monta o título final)
- Modify: `src/components/anuncios/ml/AbaPrevia.jsx` (texto: preço vai na criação; fotos sobem antes)
- Create: `src/lib/canaisDeVenda/ml/respostas.js` (puro, sem imports)
- Test: `scripts/teste-anuncios-ml.js` (sub-bloco "Fase 3: payload e respostas do ML"); ajustar as conferências antigas de `montarPayloadML` que esperavam `title`, `family_name` do campo próprio e ausência de `price`

**Interfaces:**
- Consumes: `montarPayloadML(rascunho, contexto)` da fase 1/2.
- Produces:
  - `montarPayloadML` passa a devolver `item` **sem `title`**, com `family_name = texto(titulo).slice(0, LIMITE_TITULO)`, `price = Number(preco)`, `buying_mode: "buy_it_now"`; o resto igual (`status: "paused"`, `pictures: [{ nome }]`, atributos, `shipping`). O topo `preco` continua (a Prévia o mostra).
  - Em `respostas.js`:
    - `corpoDaCriacao(item, idsDasFotos: string[]): object` — o `item` com `pictures: idsDasFotos.map((id) => ({ id }))`.
    - `causasDoML(dados): { erros: string[], avisos: string[] }` — de `dados.cause[]` (`type: "error"` → erros; `"warning"` → avisos; texto = `message`, com o `code` entre parênteses); sem `cause`, `erros = [dados.message ?? dados.error]` (vazio se nada).
    - `situacaoDoItem(statusML): "ATIVA"|"PAUSADA"|"ENCERRADA"|"DESCONHECIDA"` (`active`, `paused`, `closed`).
    - `textoDaRecusaML(resposta, oQue): string` — `` `O Mercado Livre recusou ${oQue} (HTTP ${status}): ${erros.join("; ")}` ``.

- [ ] **Step 1: Escrever os testes (falham)**

```js
console.log("\nFase 3: payload e respostas do ML");
const { montarPayloadML } = await import("../src/lib/canaisDeVenda/ml/payload.js");
const { corpoDaCriacao, causasDoML, situacaoDoItem, textoDaRecusaML } = await import("../src/lib/canaisDeVenda/ml/respostas.js");
const rascunhoP = { produtoId: "p", titulo: "PLACA UNO R3 CH340 COMPATIVEL ARDUINO", familyName: "OUTRA COISA", tipoAnuncio: "gold_special", condicao: "new", categoriaId: "MLB99779", preco: 49.9, estoque: 7, imagens: ["f1", "f2"], descricao: "x", atributos: { BRAND: "genérica" }, envio: { pesoKg: 0.05, alturaCm: 2, larguraCm: 6, comprimentoCm: 7, modo: "me2", logistica: "xd_drop_off", freteGratis: false, retirada: false }, composicao: null };
const p = montarPayloadML(rascunhoP, { produtos: { p: { sku: "100101" } }, frases: [] });
conferir("payload: sem title", "title" in p.item, false);
conferir("payload: family_name e o titulo", p.item.family_name, "PLACA UNO R3 CH340 COMPATIVEL ARDUINO");
conferir("payload: preco e buying_mode no item", [p.item.price, p.item.buying_mode], [49.9, "buy_it_now"]);
conferir("corpoDaCriacao: fotos por id", corpoDaCriacao(p.item, ["a", "b"]).pictures, [{ id: "a" }, { id: "b" }]);
conferir("causasDoML: separa erro e aviso", causasDoML({ message: "Validation error", cause: [{ type: "error", code: "item.attribute.missing", message: "Falta BRAND" }, { type: "warning", code: "x.y", message: "Foto pequena" }] }), { erros: ["Falta BRAND (item.attribute.missing)"], avisos: ["Foto pequena (x.y)"] });
conferir("causasDoML: sem cause usa message", causasDoML({ message: "invalid token" }), { erros: ["invalid token"], avisos: [] });
conferir("situacaoDoItem", ["active", "paused", "closed", "x"].map(situacaoDoItem), ["ATIVA", "PAUSADA", "ENCERRADA", "DESCONHECIDA"]);
conferir("textoDaRecusaML", textoDaRecusaML({ status: 400, dados: { message: "bad", cause: [] } }, "a criação do anúncio"), "O Mercado Livre recusou a criação do anúncio (HTTP 400): bad");
```

- [ ] **Step 2: Rodar e confirmar que falha** — Run: `npm run teste:anuncios-ml` — Expected: FAIL (`respostas.js` não existe).
- [ ] **Step 3: Implementar** `respostas.js`, as mudanças de `payload.js` e `validacao.js`, e a tela (`AbaGeral` sem o campo family_name; `AbaPrevia` com o texto novo). Ajustar as conferências antigas que quebrarem (mesma intenção, formato novo).
- [ ] **Step 4: Rodar teste e lint** — Run: `npm run teste:anuncios-ml && npm run lint` — Expected: tudo `ok`, lint limpo.
- [ ] **Step 5: Conferir no navegador** a aba Geral (sem family_name) e a Prévia (payload sem `title`, com `family_name` e `price`) num anúncio de teste: https://localhost:3000.
- [ ] **Step 6: Commit**

```bash
git add src/lib/canaisDeVenda/ml/payload.js src/lib/canaisDeVenda/ml/validacao.js src/lib/canaisDeVenda/ml/respostas.js src/components/anuncios/ml/AbaGeral.jsx src/components/anuncios/ml/AbaPrevia.jsx scripts/teste-anuncios-ml.js
git commit -m "ML fase 3: titulo vai como family_name, preco na criacao e respostas do ML"
```

---

### Task 3: Bling do anúncio — vínculo na loja do ML e kit de composição

**Files:**
- Create: `src/lib/canaisDeVenda/ml/bling.js`
- Modify: `scripts/lib/blingFalso.js` (rotas `GET /produtos/lojas?idProduto=` e `POST /produtos/lojas`; o `POST /produtos` com `formato "E"` e `estrutura` já existe — conferir)
- Modify: `src/app/produtos/acoes.js` (`gerarSku` pula os códigos de kit dos anúncios do ML)
- Test: `scripts/teste-anuncios-ml.js` (sub-bloco "Fase 3: vínculo e kit no Bling"); `npm run teste:bling-sync` continua verde

**Interfaces:**
- Consumes: `buscarNoBling(cliente, codigo)` e `codigosDasPecasNoBling(cliente, bling)` de `src/lib/blingSync/leitura.js`; `montarCorpoDeCadastro(sku, rise, { pecasNoBling })` de `blingSync/corpo.js`; `normalizarDoRise` de `blingSync/campos.js`; `proximoCodigoDaFaixa` de `canaisDeVenda/composicao.js`.
- Produces, em `ml/bling.js` (tudo recebe o cliente do Bling; nada lança: devolve `{ situacao, erro? }`):
  - `LOJA_ML_NO_BLING = "203593931"`.
  - `vinculoNoBlingML(bling, codigo, itemId): Promise<{ situacao: "ligado"|"sem_vinculo"|"sem_produto_no_bling"|"duplicado"|"erro", outros?: string[], erro? }>` — `ligado` quando há registro da loja `203593931` com `codigo === itemId`; `outros` = os MLB de outros vínculos da mesma loja (só informação).
  - `vincularNoBlingML(bling, codigo, itemId, preco): Promise<{ ok, situacao, jaEstava?, erro? }>` — molde de `ligarNoBlingLI` (`src/lib/canaisDeVenda/li/blingLoja.js`): já ligado → `jaEstava`; senão `bling.exigirEscrita(codigo)`, `POST /produtos/lojas` com `{ codigo: itemId, preco: centavos(preco), produto: { id }, loja: { id: 203593931 } }`, e relê para confirmar.
  - `conferirKitNoBling(bling, { codigo, itens: [{ sku, quantidade }] }): Promise<{ situacao: "criar"|"igual"|"diferente"|"erro", id?, diferencas?: string[], erro? }>` — só leitura. Cada item: `buscarNoBling(sku)` tem que dar `existe` e `formato !== "E"` (senão `erro` com o SKU). O código: `nao_existe` → `criar`; `duplicado` → `erro`; existe e não é `formato "E"` → `erro` ("o código é um produto simples no Bling"); kit → compara os pares (código da peça em maiúsculas, quantidade) de `codigosDasPecasNoBling` com os do anúncio, sem ordem → `igual` ou `diferente` com `diferencas` legíveis (`"100102: 3 no anúncio, 2 no Bling"`, `"100103: só no Bling"`).
  - `corpoDoKitDoAnuncio({ codigo, titulo, preco, envio, principal, pecasNoBling }): object` — **puro**: `montarCorpoDeCadastro(codigo, rise, { pecasNoBling })` com `rise = { nome: "<titulo> *<codigo>" (cortado para caber em 120 caracteres, cortando o título, nunca o sufixo), preco, unidade: "UN", peso: envio.pesoKg, altura/largura/comprimento do envio, ncm/cest/origem do principal normalizado, composicao: "<qualquer texto não vazio>" }`.
  - `criarKitNoBling(bling, dados): Promise<{ ok, id?, erro? }>` — `exigirEscrita(codigo)`, `POST /produtos`, relê com `buscarNoBling` e confere `formato "E"`.
- `gerarSku` (ações de produtos): o "maior já usado" passa a incluir `dados.composicao.codigo` dos anúncios ML da faixa 25xxxx. Se a conta não puder ser testada sem `next/cache`, extrair `proximoSkuDaFaixa(skus, codigosDeKit)` para um arquivo sem Next e testar essa.

- [ ] **Step 1: Escrever os testes (falham)**

Fábrica do Bling falso com quatro produtos simples (`100101`, `100102`, `100103`) e um kit `120809` (`formato "E"`: `100101` x1 + `100102` x2), e um vínculo antigo do `100101` na loja `203593931` (`MLB4165084257`). `bfTravado` é o mesmo Bling com `codigosLiberados: ["outro"]`. Conferências:

```js
conferir("vinculo: outro MLB na loja nao conta como ligado", (await vinculoNoBlingML(bf, "100101", "MLB1")).situacao, "sem_vinculo");
conferir("vinculo: lista os outros MLB", (await vinculoNoBlingML(bf, "100101", "MLB1")).outros, ["MLB4165084257"]);
conferir("vincular: trava recusa sem escrever", [(await vincularNoBlingML(bfTravado, "100101", "MLB1", 49.9)).ok, bfTravado.chamadas.some((c) => c.metodo === "POST")], [false, false]);
const v = await vincularNoBlingML(bf, "100101", "MLB1", 49.9);
conferir("vincular: POST na loja do ML com o MLB e o preco", [v.ok, ultimoCorpo(bf, "POST", "/produtos/lojas")], [true, { codigo: "MLB1", preco: 49.9, produto: { id: idDe("100101") }, loja: { id: 203593931 } }]);
conferir("vincular: segunda vez nao duplica", [(await vincularNoBlingML(bf, "100101", "MLB1", 49.9)).jaEstava, contarPosts(bf, "/produtos/lojas")], [true, 1]);
conferir("kit: codigo livre => criar", (await conferirKitNoBling(bf, { codigo: "100101_5", itens: [{ sku: "100101", quantidade: 5 }] })).situacao, "criar");
conferir("kit: mesmas pecas em outra ordem => igual", (await conferirKitNoBling(bf, { codigo: "120809", itens: [{ sku: "100102", quantidade: 2 }, { sku: "100101", quantidade: 1 }] })).situacao, "igual");
conferir("kit: quantidade diferente => diferente com o recado", await conferirKitNoBling(bf, { codigo: "120809", itens: [{ sku: "100101", quantidade: 1 }, { sku: "100102", quantidade: 3 }] }), { situacao: "diferente", id: idDe("120809"), diferencas: ["100102: 3 no anúncio, 2 no Bling"] });
conferir("kit: peca que nao existe no Bling => erro", (await conferirKitNoBling(bf, { codigo: "250001", itens: [{ sku: "999999", quantidade: 2 }] })).situacao, "erro");
conferir("kit: codigo de produto simples => erro", (await conferirKitNoBling(bf, { codigo: "100103", itens: [{ sku: "100101", quantidade: 2 }] })).situacao, "erro");
const base = { codigo: "100101_5", titulo: "KIT COM 5 PLACA UNO", preco: 199, envio: { pesoKg: 0.25, alturaCm: 5, larguraCm: 10, comprimentoCm: 12 }, principal: { ncm: "8473.30.49", origem: 0 }, pecasNoBling: [{ id: 11, quantidade: 5 }] };
const corpo = corpoDoKitDoAnuncio(base);
conferir("corpoDoKit: formato E, virtual, nome com *codigo", [corpo.formato, corpo.estrutura, corpo.nome, corpo.preco], ["E", { tipoEstoque: "V", componentes: [{ produto: { id: 11 }, quantidade: 5 }] }, "KIT COM 5 PLACA UNO *100101_5", 199]);
conferir("corpoDoKit: nome longo corta o titulo e mantem o sufixo", [corpoDoKitDoAnuncio({ ...base, titulo: "A".repeat(200) }).nome.endsWith(" *100101_5"), Array.from(corpoDoKitDoAnuncio({ ...base, titulo: "A".repeat(200) }).nome).length <= 120], [true, true]);
const kitCriado = await criarKitNoBling(bf, { codigo: "100101_5", titulo: "KIT", preco: 199, envio: {}, principal: {}, itens: [{ sku: "100101", quantidade: 5 }] });
conferir("criarKit: cria e confere formato E", [kitCriado.ok, (await conferirKitNoBling(bf, { codigo: "100101_5", itens: [{ sku: "100101", quantidade: 5 }] })).situacao], [true, "igual"]);
```

(`idDe`, `contarPosts` e `ultimoCorpo` são auxiliares do sub-bloco, lendo `bf.chamadas`.) Mais o teste de `gerarSku`/`proximoSkuDaFaixa`: com o SKU `250003` no cadastro e o kit `250007` num anúncio, o próximo é `250008`.

- [ ] **Step 2: Rodar e confirmar que falha** — Run: `npm run teste:anuncios-ml` — Expected: FAIL (`ml/bling.js` não existe).
- [ ] **Step 3: Implementar** `ml/bling.js`, as rotas de `/produtos/lojas` no Bling falso (registro `{ id, codigo, preco, produto: { id }, loja: { id } }`, escrita só depois de `exigirEscrita`), e `gerarSku` com os códigos de kit.
- [ ] **Step 4: Rodar os testes e o lint** — Run: `npm run teste:anuncios-ml && npm run teste:bling-sync && npm run lint` — Expected: tudo verde.
- [ ] **Step 5: Commit**

```bash
git add src/lib/canaisDeVenda/ml/bling.js scripts/lib/blingFalso.js src/app/produtos/acoes.js scripts/teste-anuncios-ml.js
git commit -m "ML fase 3: vinculo do anuncio no Bling e kit de composicao conferido ou criado"
```

---

### Task 4: Estado da publicação no banco e o Salvar travado

**Files:**
- Create: `src/lib/canaisDeVenda/ml/etapas.js` (puro, sem imports)
- Modify: `src/lib/canaisDeVenda/ml/banco.js` (`gravarPublicacao`, `lerPublicacao`; `salvarRascunhoML` com `FOR UPDATE` e as recusas novas; `carregarAnuncioML` devolve `publicacao`, `idExterno`, `urlExterna`)
- Modify: `src/lib/canaisDeVenda/ml/rotulos.js` (rótulo de `PUBLICANDO` "Publicando" e de "aguardando o Bling")
- Test: `scripts/teste-anuncios-ml.js` (sub-bloco "Fase 3: estado da publicação")

**Interfaces:**
- Produces:
  - `etapas.js`: `ETAPAS = ["fotos", "validar", "criar", "pausar", "descricao", "kit_bling", "vinculo", "ativar", "gravar"]`; `ROTULO_DA_ETAPA` (texto de tela de cada uma); `proximaEtapa(publicacao, etapas = ETAPAS): string|null` — a primeira de `etapas` que não está em `publicacao.feitas`; `etapasDoAnuncio({ kit }): string[]` (`kit_bling` só com `dados.composicao`).
  - Forma de `dados.publicacao`: `{ feitas: string[], fotos: { [arquivoId]: mlId }, itemId: string|null, permalink: string|null, statusML: string|null, blingKitId: number|null, incerta: boolean, erro: string|null, etapaComErro: string|null, atualizadoEm: string }`.
  - `banco.js`: `lerPublicacao(anuncioId): Promise<{ anuncio, publicacao }>`; `gravarPublicacao(anuncioId, parcial, colunas = {})` — numa transação: `SELECT id FROM "Anuncio" WHERE id = $1 FOR UPDATE`, relê `dados`, mescla `parcial` em `dados.publicacao` (listas substituídas, `fotos` mesclado), grava junto as `colunas` (`status`, `situacaoCanal`, `idExterno`, `urlExterna`, `erro`, `publicadoEm`, `payloadEnviado`).
  - `salvarRascunhoML` recusa: `status === "PUBLICANDO"` ("Publicação em andamento: espere terminar."); `dados.publicacao.itemId` presente ("O anúncio já existe no Mercado Livre (pausado). Use Retomar publicação."). A leitura + escrita de `dados` passa a ser na mesma transação com `FOR UPDATE` (o `publicacao` gravado nunca é perdido).

- [ ] **Step 1: Escrever os testes (falham)**

```js
console.log("\nFase 3: estado da publicação");
const { ETAPAS, proximaEtapa, etapasDoAnuncio } = await import("../src/lib/canaisDeVenda/ml/etapas.js");
conferir("etapas: ordem", ETAPAS, ["fotos", "validar", "criar", "pausar", "descricao", "kit_bling", "vinculo", "ativar", "gravar"]);
conferir("etapas: simples nao tem kit_bling", etapasDoAnuncio({ kit: false }).includes("kit_bling"), false);
conferir("proximaEtapa: depois de fotos e validar vem criar", proximaEtapa({ feitas: ["fotos", "validar"] }), "criar");
conferir("proximaEtapa: tudo feito e null", proximaEtapa({ feitas: [...ETAPAS] }), null);
// banco: anuncio de um produto ZZ-ML-* salvo como rascunho (id) e um rascunho valido (rascunhoValido)
await gravarPublicacao(id, { feitas: ["fotos"], fotos: { f1: "999-a" } });
await gravarPublicacao(id, { fotos: { f2: "999-b" } });
conferir("gravarPublicacao: mescla as fotos", (await lerPublicacao(id)).publicacao.fotos, { f1: "999-a", f2: "999-b" });
conferir("salvar: rascunho editado nao apaga a publicacao", [(await salvarRascunhoML(id, rascunhoValido)).ok, (await lerPublicacao(id)).publicacao.feitas], [true, ["fotos"]]);
await gravarPublicacao(id, {}, { status: "PUBLICANDO" });
conferir("salvar: recusado durante a publicacao", (await salvarRascunhoML(id, rascunhoValido)).erro, "Publicação em andamento: espere terminar.");
await gravarPublicacao(id, { itemId: "MLB9" }, { status: "ERRO" });
conferir("salvar: recusado com item ja criado no ML", /já existe no Mercado Livre/.test((await salvarRascunhoML(id, rascunhoValido)).erro), true);
```

- [ ] **Step 2: Rodar e confirmar que falha** — Expected: FAIL (`etapas.js` não existe).
- [ ] **Step 3: Implementar.** `gravarPublicacao` com `prisma.$transaction(async (tx) => { await tx.$queryRaw\`SELECT id FROM "Anuncio" WHERE id = ${id} FOR UPDATE\`; ... })`; `salvarRascunhoML` no mesmo molde.
- [ ] **Step 4: Rodar teste e lint** — Expected: verde.
- [ ] **Step 5: Commit**

```bash
git add src/lib/canaisDeVenda/ml/etapas.js src/lib/canaisDeVenda/ml/banco.js src/lib/canaisDeVenda/ml/rotulos.js scripts/teste-anuncios-ml.js
git commit -m "ML fase 3: estado da publicacao gravado com trava de linha e Salvar travado durante a publicacao"
```

---

### Task 5: Pré-checagem e o resumo da confirmação

**Files:**
- Create: `src/lib/canaisDeVenda/ml/publicar.js` (nesta tarefa, só `prepararPublicacaoML`)
- Test: `scripts/teste-anuncios-ml.js` (sub-bloco "Fase 3: pré-checagem")

**Interfaces:**
- Consumes: `lerPublicacao`, `carregarAnuncioML`, `contextoDosProdutos` (Task 4/fase 1); `lerCategoriaCompleta` (fase 2); `validarRascunhoML`; `montarPayloadML`; `buscarNoBling`; `conferirKitNoBling` (Task 3).
- Produces: `prepararPublicacaoML(anuncioId, { ml, bling }): Promise<{ ok: boolean, motivos: string[], resumo?: { familyName, preco, estoque, tipoAnuncio, fotos: number, codigo, kit: null | { codigo, situacao: "criar"|"igual", itens: [{ sku, quantidade }] }, outrosVinculos: string[] }, proxima: string|null, incerta: boolean }>` — **só leitura** (nenhum `exigirEscrita`, nenhum POST). Motivos, todos juntos (a tela mostra a lista):
  - anúncio não encontrado / não é do ML / já `PUBLICADO`;
  - produto (e cada item do kit) excluído, não Conferido ou sem `blingId`;
  - rascunho com problema bloqueante na validação **feita no servidor** com a categoria lida agora (`contexto.categoria = await lerCategoriaCompleta(ml, categoriaId)`);
  - simples: o SKU tem que `existe` no Bling (`nao_existe`/`duplicado` → motivo); produto do Rise com `tipo = "COM_COMPOSICAO"` tem que ser `formato "E"` lá ("O kit X é produto simples no Bling: o estoque das peças não baixaria.");
  - composição: `conferirKitNoBling` `diferente`/`erro` → motivo com as `diferencas`;
  - publicação `incerta` não é motivo: volta em `incerta: true` (a tela oferece "Criar de novo").

- [ ] **Step 1: Escrever os testes (falham)** — produtos `ZZ-ML-*` no Postgres (Conferidos, com `blingId`), o Bling falso com os SKUs correspondentes e o ML falso:

```js
conferir("preparar: anuncio simples pronto", (({ ok, resumo }) => [ok, resumo.familyName, resumo.preco, resumo.kit])(await prepararPublicacaoML(idSimples, { ml, bling: bf })), [true, "PLACA ZZ ML", 49.9, null]);
conferir("preparar: so leitura", [ml.escritas.length, bf.chamadas.filter((c) => c.metodo !== "GET").length], [0, 0]);
conferir("preparar: sem blingId recusa", (await prepararPublicacaoML(idSemBling, { ml, bling: bf })).motivos.some((m) => /Bling/.test(m)), true);
conferir("preparar: categoria nao folha recusa", (await prepararPublicacaoML(idCategoriaPai, { ml, bling: bf })).ok, false);
conferir("preparar: kit livre => criar", (await prepararPublicacaoML(idKit, { ml, bling: bf })).resumo.kit.situacao, "criar");
conferir("preparar: kit com outras pecas recusa com o recado", (await prepararPublicacaoML(idKitDiferente, { ml, bling: bf })).motivos.some((m) => /3 no anúncio, 2 no Bling/.test(m)), true);
conferir("preparar: produto kit do Rise que e simples no Bling recusa", (await prepararPublicacaoML(idProdutoKitSimplesNoBling, { ml, bling: bf })).ok, false);
```

- [ ] **Step 2: Rodar e confirmar que falha.**
- [ ] **Step 3: Implementar** `prepararPublicacaoML`.
- [ ] **Step 4: Rodar teste e lint.**
- [ ] **Step 5: Commit**

```bash
git add src/lib/canaisDeVenda/ml/publicar.js scripts/teste-anuncios-ml.js
git commit -m "ML fase 3: pre-checagem e resumo da confirmacao do Publicar, so leitura"
```

---

### Task 6: Publicar, com etapas gravadas e retomada

**Files:**
- Modify: `src/lib/canaisDeVenda/ml/publicar.js` (`publicarAnuncioML`, `validarNoML`)
- Test: `scripts/teste-anuncios-ml.js` (sub-bloco "Fase 3: publicar e retomar")

**Interfaces:**
- Consumes: tudo das Tarefas 1–5; `nomeDaFoto` e `montarDescricaoML` (fase 1); `caminhoDe(sku, "IMAGEM", arquivo)` de `src/lib/arquivos.js` para ler a foto do disco.
- Produces:
  - `publicarAnuncioML(anuncioId, { ml, bling, recriar = false, ate = null, lerFoto = lerFotoDoDisco }): Promise<{ ok: boolean, etapa: string|null, feitas: string[], erro?: string, avisos?: string[], incerta?: boolean, itemId?, permalink? }>`. `lerFoto(sku, arquivo) → Promise<Buffer>` é injetável (o teste não lê disco). `ate: "validar"` para depois do validador.
  - `validarNoML(anuncioId, clientes)` = `publicarAnuncioML(anuncioId, { ...clientes, ate: "validar" })`, **sem** mudar o `status` do anúncio.

Ordem e regras (uma volta só, para na primeira falha):
1. Trava em memória por anúncio (`umPorVez`; segundo pedido simultâneo → "Publicação em andamento."). `prepararPublicacaoML`; com `ok: false` devolve os motivos sem escrever. `incerta` sem `recriar` → recusa: "A criação do anúncio pode ter chegado ao Mercado Livre sem resposta. Confira em Anúncios > Pausados; se não estiver lá, use Criar de novo."
2. **As duas travas antes de qualquer escrita:** `ml.exigirEscrita(codigo)` e `bling.exigirEscrita(codigo)`. Recusa → `{ ok: false, erro }`, nada gravado, status intocado.
3. `status = PUBLICANDO` (exceto em `ate: "validar"`).
4. `fotos`: para cada id de `rascunho.imagens` sem `publicacao.fotos[id]`: `lerFoto` → `ml.upload("/pictures/items/upload", { bytes, nome: nomeDaFoto(titulo, i), tipo: "image/jpeg" })` → grava o id **a cada foto** (falha no meio não perde as já subidas).
5. `validar`: `ml.post("/items/validate", corpoDaCriacao(item, idsEmOrdem))`; 204 ok; 400 → erro com `causasDoML` (nada criado). Avisos (`warning`) seguem em `avisos`.
6. `criar`: grava `payloadEnviado` antes; `ml.post("/items", corpo)`. 201 → `itemId`, `permalink`, `statusML`, colunas `idExterno`/`urlExterna`. 4xx → erro normal. Exceção ou 5xx → `incerta: true`, status `ERRO`. Com `recriar`, limpa `incerta` antes de tentar.
7. `pausar`: se `statusML !== "paused"`, `ml.put("/items/{id}", { status: "paused" })`.
8. `descricao`: `ml.post("/items/{id}/description", { plain_text: montarDescricaoML(...) })`.
9. `kit_bling` (só composição): `conferirKitNoBling` → `igual` grava `blingKitId` e `composicao.blingProdutoId`; `criar` → `criarKitNoBling`; falha → status **`PUBLICANDO`**, `etapaComErro: "kit_bling"`, erro "Aguardando o kit no Bling: ..." (a tela mostra **Verificar no Bling**).
10. `vinculo`: `vincularNoBlingML(bling, codigo, itemId, preco)`.
11. `ativar`: `ml.put("/items/{id}", { status: "active" })`; `statusML` da resposta.
12. `gravar`: `status = PUBLICADO`, `situacaoCanal = situacaoDoItem(statusML)`, `publicadoEm`, `erro = null`.

Cada etapa concluída entra em `feitas` **na hora** (`gravarPublicacao`). Falha: `erro`, `etapaComErro`, `status = ERRO` (salvo o caso do kit). Nunca há segunda tentativa automática.

- [ ] **Step 1: Escrever os testes (falham)**

```js
console.log("\nFase 3: publicar e retomar");
const lerFoto = async () => Buffer.from("jpg");
let r = await publicarAnuncioML(idSimples, { ml, bling: bf, lerFoto });
conferir("publicar: tudo certo", [r.ok, r.feitas.at(-1), (await lerPublicacao(idSimples)).anuncio.status], [true, "gravar", "PUBLICADO"]);
conferir("publicar: ordem das escritas no ML", ml.escritas.map((e) => `${e.metodo} ${e.caminho.replace(/MLB\d+/, "MLB")}`), ["POST /pictures/items/upload", "POST /pictures/items/upload", "POST /items/validate", "POST /items", "POST /items/MLB/description", "PUT /items/MLB"]);
conferir("publicar: criou pausado e ativou no fim", [ml.escritas[3].corpo.status, ml.escritas.at(-1).corpo], ["paused", { status: "active" }]);
conferir("publicar: um vinculo no Bling", bf.chamadas.filter((c) => c.metodo === "POST" && c.caminho === "/produtos/lojas").length, 1);
const publicado = (await lerPublicacao(idSimples)).anuncio;
conferir("publicar: situacaoCanal ATIVA e idExterno", [publicado.situacaoCanal, /^MLB/.test(publicado.idExterno)], ["ATIVA", true]);

// Review Focus 3: trava do Bling fechada => zero escrita no ML
r = await publicarAnuncioML(idOutro, { ml: mlNovo, bling: bfTravado, lerFoto });
conferir("trava: nada escrito em lugar nenhum", [r.ok, mlNovo.escritas.length, (await lerPublicacao(idOutro)).anuncio.status], [false, 0, "RASCUNHO"]);

// Review Focus 1: criacao sem resposta certa
const mlQueda = criarMLFalso({ falhas: [{ metodo: "POST", caminho: "/items", status: 500 }] });
r = await publicarAnuncioML(idQueda, { ml: mlQueda, bling: bf, lerFoto });
conferir("incerta: marcada", [r.ok, r.incerta], [false, true]);
const antes = mlQueda.escritas.length;
r = await publicarAnuncioML(idQueda, { ml: mlQueda, bling: bf, lerFoto });
conferir("incerta: retomar sem recriar nao escreve", [r.ok, mlQueda.escritas.length - antes, /Confira/.test(r.erro)], [false, 0, true]);
r = await publicarAnuncioML(idQueda, { ml: mlQueda, bling: bf, lerFoto, recriar: true });
conferir("incerta: recriar cria e nao sobe as fotos de novo", [r.ok, mlQueda.escritas.filter((e) => e.caminho === "/pictures/items/upload").length], [true, 2]);

// Review Focus 5: ML ignora o pausado
const mlAtivo = criarMLFalso({ ignorarPausado: true });
await publicarAnuncioML(idAtivo, { ml: mlAtivo, bling: bf, lerFoto });
conferir("pausar: PUT paused logo depois de criar", mlAtivo.escritas[4].corpo, { status: "paused" });

// Validar no ML: validacao 400 => erro com as causas, nada criado, status continua RASCUNHO
const mlValida = criarMLFalso({ validacao: { status: 400, dados: { message: "Validation error", cause: [{ type: "error", code: "item.attribute.missing", message: "Falta MODEL" }] } } });
r = await validarNoML(idValida, { ml: mlValida, bling: bf, lerFoto });
conferir("validarNoML: causas e nada criado", [r.ok, /Falta MODEL/.test(r.erro), mlValida.escritas.some((e) => e.caminho === "/items"), (await lerPublicacao(idValida)).anuncio.status], [false, true, false, "RASCUNHO"]);
```

Mais, escritos por inteiro com `conferir` explícitos (Review Focus 2):
- falha 500 em `POST /items/MLB.../description`: a primeira volta para em `descricao` (status `ERRO`, item continua pausado, nenhum `PUT active`); a segunda termina, com `POST /items` feito **uma** vez no total e as fotos subidas uma vez;
- falha 500 no `PUT` de ativar: a retomada não recria nem revincula (um só `POST /produtos/lojas`) e ativa;
- Bling falso recusando `POST /produtos/lojas` uma vez (400): `etapaComErro: "vinculo"`, nenhum `PUT active`; a retomada vincula e ativa;
- kit de composição com código livre: o Bling ganha o produto `formato "E"` com as peças; com o `POST /produtos` do kit falhando uma vez, o anúncio fica `PUBLICANDO`, `etapaComErro: "kit_bling"`, item pausado; a retomada ("Verificar no Bling") cria o kit, vincula e ativa;
- dois `publicarAnuncioML` simultâneos do mesmo anúncio: o segundo devolve "Publicação em andamento." e só um `POST /items` acontece.

- [ ] **Step 2: Rodar e confirmar que falha.**
- [ ] **Step 3: Implementar** `publicarAnuncioML` e `validarNoML`.
- [ ] **Step 4: Rodar teste e lint.**
- [ ] **Step 5: Commit**

```bash
git add src/lib/canaisDeVenda/ml/publicar.js scripts/teste-anuncios-ml.js
git commit -m "ML fase 3: publicar com etapas gravadas, retomada, criacao incerta e Validar no ML"
```

---

### Task 7: Ações e tela — Publicar, confirmação, Retomar e Validar no ML

**Files:**
- Modify: `src/app/canais-de-venda/mercado-livre/acoes.js` (`prepararPublicacaoMLAcao`, `publicarAnuncioMLAcao`, `validarNoMLAcao`)
- Create: `src/components/anuncios/ml/JanelaPublicarML.jsx`
- Modify: `src/components/anuncios/ml/EditorAnuncioML.jsx` (botão Publicar de verdade; Retomar / Verificar no Bling; anúncio publicado mostra o MLB com link)
- Modify: `src/components/anuncios/ml/AbaPrevia.jsx` (botão "Validar no ML" e o resultado)
- Modify: `src/components/anuncios/ml/TabelaAnunciosML.jsx` (coluna com o MLB e link para o anúncio quando houver)
- Modify: `src/app/canais-de-venda/mercado-livre/[id]/page.jsx`, `src/components/anuncios/ml/EditorNaPagina.jsx` e `JanelaAnuncioML.jsx` (passar `publicacao`, `idExterno`, `urlExterna` ao editor)

**Interfaces:**
- Consumes: `prepararPublicacaoML`, `publicarAnuncioML`, `validarNoML` (Tasks 5–6); `clienteML`, `clienteBling`; `ROTULO_DA_ETAPA` (Task 4).
- Produces (ações; nenhuma lança, todas com `ehId(anuncioId)`):
  - `prepararPublicacaoMLAcao(anuncioId)` → o retorno de `prepararPublicacaoML`.
  - `publicarAnuncioMLAcao(anuncioId, { recriar })` → o retorno de `publicarAnuncioML`; revalida `/canais-de-venda/mercado-livre` e `/produtos`.
  - `validarNoMLAcao(anuncioId)` → `{ ok, erro?, avisos? }`.

Tela:
- **Publicar** fica habilitado com o anúncio salvo, sem alteração pendente e com status `RASCUNHO`/`VALIDADO`; o `title` diz o motivo quando não ("Salve antes de publicar.", "N problema(s) bloqueante(s) na Prévia."). As travas **não** desabilitam o botão: a recusa do servidor aparece em vermelho (padrão do Bling e da LI).
- Clique → `prepararPublicacaoMLAcao` → `JanelaPublicarML`: com `ok: false`, a lista de motivos e "Fechar"; com `ok: true`, o resumo (título que vai como family_name, preço, estoque, tipo, fotos, código; no kit: "O Rise vai criar o kit X no Bling com: 2× 100101, 3× 100102" ou "O kit X já existe no Bling com as mesmas peças"; os outros MLB já vinculados no Bling, se houver) e **Publicar no Mercado Livre** / Cancelar.
- Publicando: a janela mostra "Publicando..." e, no fim, as etapas feitas (`ROTULO_DA_ETAPA`) com a que falhou em vermelho e o recado. Sucesso: link "Ver no Mercado Livre" (`permalink`).
- Status `ERRO`/`PUBLICANDO` com `publicacao`: o botão vira **Retomar publicação** (ou **Verificar no Bling** com `etapaComErro === "kit_bling"`), e o recado da última falha aparece no topo. Com `incerta`, a janela oferece **Criar de novo** (chama com `recriar: true`) junto do texto de conferir no ML.
- `PUBLICADO`: rodapé mostra o MLB com link (`urlExterna`), e o editor continua só leitura (fase 1).
- Prévia: **Validar no ML** (com o anúncio salvo e sem alteração pendente) → "O Mercado Livre não apontou problema." ou a lista de causas (erros em vermelho, avisos em âmbar). A bolha avisa que as fotos sobem ao ML nessa hora (ficam guardadas para a publicação).

- [ ] **Step 1: Implementar ações e tela** (código de tela não tem teste automático; a lógica já está testada nas Tarefas 4–6).
- [ ] **Step 2: Lint e teste** — Run: `npm run lint && npm run teste:anuncios-ml` — Expected: verde.
- [ ] **Step 3: Conferir no navegador** (https://localhost:3000, travas `false` no `.env`): num anúncio de teste salvo, Publicar abre a confirmação com o resumo certo; "Publicar no Mercado Livre" volta a recusa "Escrita bloqueada: ML_PUBLICACAO está false..." em vermelho; o `LogIntegracao` não ganha nenhum POST/PUT novo para o ML nem para o Bling; "Validar no ML" volta a mesma recusa; anúncio com alteração não salva deixa Publicar desabilitado com o motivo; console sem erro.
- [ ] **Step 4: Commit**

```bash
git add src/app/canais-de-venda/mercado-livre/acoes.js src/components/anuncios/ml/JanelaPublicarML.jsx src/components/anuncios/ml/EditorAnuncioML.jsx src/components/anuncios/ml/AbaPrevia.jsx src/components/anuncios/ml/TabelaAnunciosML.jsx src/components/anuncios/ml/EditorNaPagina.jsx src/components/anuncios/ml/JanelaAnuncioML.jsx "src/app/canais-de-venda/mercado-livre/[id]/page.jsx"
git commit -m "ML fase 3: Publicar com confirmacao, Retomar, Verificar no Bling e Validar no ML na tela"
```

---

### Task 8: Documentação e fechamento

**Files:**
- Modify: `CLAUDE.md` (seção nova "Canais de Venda: Mercado Livre (fase 3, publicar)"; corrigir a linha "Preço saiu do POST/PUT /items" em "Mercado Livre"; acrescentar "no modelo User Products o `title` não é enviado, vai o `family_name`"; a contagem de asserções do `teste:anuncios-ml`; `ML_PUBLICACAO_CODIGOS` junto das travas)
- Modify: `docs/superpowers/specs/2026-09-30-canais-de-venda-mercado-livre-design.md` (nota em §7: ordem real das etapas, preço na criação, descrição por POST, título como `family_name`; §10: fase 3 feita, sem o primeiro envio real)

- [ ] **Step 1: Escrever a documentação.**
- [ ] **Step 2: Rodar as suítes** — Run: `npm run lint && npm run teste:anuncios-ml && npm run teste:bling-sync && npm run teste:li-sync && npm run teste:composicao` — Expected: todas verdes.
- [ ] **Step 3: Commit e push**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-30-canais-de-venda-mercado-livre-design.md
git commit -m "ML fase 3: CLAUDE.md e spec com o fluxo de publicacao"
git push
```

---

## Depois do plano (não faz parte da execução)

**Primeiro Publicar real**, só com o OK do dono e com ele acompanhando: um produto de teste (sugestão: `ZZ-TESTE-ML`, Conferido, já no Bling, categoria barata, preço alto o bastante para ninguém comprar), travas abertas **só no ambiente de um script** (`ML_PUBLICACAO=true ML_PUBLICACAO_CODIGOS=ZZ-TESTE-ML BLING_ESCRITA=true BLING_ESCRITA_CODIGOS=ZZ-TESTE-ML`; o script recusa rodar se as listas não forem exatamente essas), `.env` intocado. Medir: se o `POST /items` aceita `status: "paused"`, o título que o ML gerou, se o validador aceita o corpo, se o Bling aceita o vínculo, e o que o Bling faz com estoque e preço depois do vínculo. Depois, o mesmo com um kit de teste. O anúncio de teste fica pausado ou encerrado conforme o dono decidir.
