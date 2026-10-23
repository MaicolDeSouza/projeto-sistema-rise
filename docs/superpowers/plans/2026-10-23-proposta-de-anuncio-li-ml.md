# Proposta automática de anúncio (LI e ML) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Neste projeto:** execução inline, sem subagentes (preferência do dono, memória "Inline, sem subagentes").

**Goal:** A LLM do claude.ai/ChatGPT monta, pelo MCP, a proposta do anúncio da Loja Integrada e depois a do Mercado Livre,
gravada no rascunho do `Anuncio`, com o "P" no ícone do canal até o dono sincronizar ou publicar.

**Architecture:** Uma pasta nova `src/lib/propostaDeAnuncio/` com as regras puras (próximo passo, preenchimento, preço) e a
leitura/gravação por canal; as ferramentas MCP ficam em `src/lib/mcp/propostaDeAnuncio.js`, registradas como as da proposta
de produto. A proposta mora em `Anuncio.dados.proposta` (sem migration) e é apagada pelo envio que der certo.

**Tech Stack:** Next.js 16, React 19, Prisma 7, `@modelcontextprotocol/server` 2.3.1, zod. JavaScript, sem TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-23-proposta-de-anuncio-li-ml-design.md`

## Global Constraints

- A proposta NUNCA chama a IA paga do Rise; só o botão "Gerar com IA" da Meta Tag Description usa a IA paga, dentro do Rise.
- Só GET no ML e na LI durante a proposta; nenhuma escrita em canal nem no Bling.
- Produto precisa estar Conferido e com o Bling verde (`iconeBlingDoProduto` já sincronizado e sem selo).
- Meta Tag Description: de 130 a 160 caracteres. Tag Title = nome do produto, sem IA.
- ML: um anúncio só, Clássico (`gold_special`). Nunca mexe em anúncio PUBLICADO.
- Preço do ML: piso de 30% de margem (lucro líquido sobre o preço, depois de comissão, tarifa, frete do vendedor e imposto de 6%); teto = o 5º menor preço do ranking (com menos de 5 preços, o maior deles); preço = o maior de 5 em 5 centavos até o teto com 30% ou mais; piso acima do teto = o piso com aviso. Preço que decide é o NORMAL.
- Catálogos: até 10, só com 5 ou mais anúncios (total). Nada entra em `CatalogoReferenciaML` pela proposta.
- Links sem catálogo: até 5, usados só na conta e no relatório; nada é salvo fora de `dados.proposta`.
- Texto da tela com acento; identificadores e comentários sem acento; padrão visual do CLAUDE.md.
- Toda ferramenta do MCP entra em `ChamadaMcp` e, na Revisão do dia, conta como "proposta" (não como "sem anotação").
- O ESLint não tem `no-undef`: conferir cada tela tocada no navegador.

## Review Focus

1. Produto Conferido cujo Bling tem "!" pede proposta da LI: recusa com o motivo, nada gravado (Task 3).
2. Rascunho da LI que já tem categorias, marca e description: nada é sobrescrito; tudo vira sugestão (Task 2 e 3).
3. Preço que cruza R$ 79 e perde margem com o frete grátis obrigatório: o preço final ainda tem 30% ou mais (Task 6).
4. Catálogo que dá 429 no meio da leitura: a proposta grava com os que leu e avisa, sem estourar (Task 7).
5. Sincronizar da LI que FALHA: o "P" continua (a proposta só some no envio que deu certo) (Task 4).

---

## Entrega 1: Loja Integrada

### Task 1: Situação do produto e o próximo passo

**Files:**
- Create: `src/lib/propostaDeAnuncio/situacao.js`
- Create: `src/lib/mcp/propostaDeAnuncio.js`
- Modify: `src/lib/mcp/servidor.js` (registrar `FERRAMENTAS_DA_PROPOSTA_DE_ANUNCIO` junto de `FERRAMENTAS_DA_PROPOSTA`: em `SO_DO_MCP`, `SEM_LEMBRETE` e no laço da linha ~122)
- Modify: `src/lib/mcp/consultas.js` (`DA_PROPOSTA` e os resumos das ferramentas novas)
- Modify: `src/lib/acessos/recursos.js` (ação nova)
- Test: `scripts/teste-mcp.js`

**Interfaces:**
- Produces: `proximoPasso(situacao) -> { passo, motivo }` (pura); `lerSituacaoDoProduto(sku) -> situacao` (banco; formato da spec 6.1, sem `proximoPasso`); `exigirPropostaDeAnuncio(contexto, canal)` (lança `ErroDeFerramenta`); `FERRAMENTAS_DA_PROPOSTA_DE_ANUNCIO` (array de `{ nome, descricao, entrada, anotacoes, executar }` no molde de `proposta.js`).
- Recurso: `acao("acao.canaisDeVenda.proporAnuncio", "Propor anúncio (proposta automática)", "tela.canaisDeVenda", "Montar a proposta de anúncio da LI e do ML pelo Claude ou ChatGPT (MCP); nunca envia ao canal.")`. Conferir o nome exato da tela-pai em `recursos.js`.
- Passos: `"proposta-do-produto" | "conferir-no-rise" | "sincronizar-bling" | "proposta-li" | "revisar-li" | "proposta-ml" | "revisar-ml" | "pronto"`.

- [ ] **Step 1: Teste puro do próximo passo** (bloco "proposta de anúncio: próximo passo" no `teste-mcp.js`)

```js
const base = { rise: { conferido: true, propostaPendente: false }, bling: { verde: true },
  li: { anuncio: "sincronizado", propostaPendente: false }, ml: { anuncios: [{ status: "PUBLICADO" }], propostaPendente: false } };
conferir("pronto", proximoPasso(base).passo, "pronto");
conferir("sem conferido e sem proposta", proximoPasso({ ...base, rise: { conferido: false, propostaPendente: false } }).passo, "proposta-do-produto");
conferir("sem conferido com proposta", proximoPasso({ ...base, rise: { conferido: false, propostaPendente: true } }).passo, "conferir-no-rise");
conferir("bling com !", proximoPasso({ ...base, bling: { verde: false } }).passo, "sincronizar-bling");
conferir("li pendente", proximoPasso({ ...base, li: { anuncio: "rascunho", propostaPendente: true } }).passo, "revisar-li");
conferir("sem li", proximoPasso({ ...base, li: { anuncio: "nenhum", propostaPendente: false } }).passo, "proposta-li");
conferir("li em rascunho sem proposta", proximoPasso({ ...base, li: { anuncio: "rascunho", propostaPendente: false } }).passo, "proposta-li");
conferir("ml pendente", proximoPasso({ ...base, ml: { anuncios: [{ status: "RASCUNHO" }], propostaPendente: true } }).passo, "revisar-ml");
conferir("sem ml publicado", proximoPasso({ ...base, ml: { anuncios: [], propostaPendente: false } }).passo, "proposta-ml");
conferir("motivo sempre texto", typeof proximoPasso(base).motivo, "string");
```

- [ ] **Step 2: Rodar** `npm run teste:mcp` → FALHA ("proximoPasso is not defined").
- [ ] **Step 3: Implementar** `proximoPasso` (ordem da spec 6.1) e `lerSituacaoDoProduto` em `situacao.js`. `bling.verde` = `iconeBlingDoProduto(produto)` com `sincronizado` e sem selo; `li.anuncio` = "sincronizado" quando o Anuncio LOJA_INTEGRADA tem `idExterno` e `sincronizadoEm`, "rascunho" quando existe, senão "nenhum"; `propostaPendente` = `Boolean(anuncio.dados?.proposta)`; `rise.propostaPendente` = existe `PropostaDeProduto`.
- [ ] **Step 4: Ferramenta MCP `situacaoDoProduto(sku)`** em `src/lib/mcp/propostaDeAnuncio.js`, só leitura, exige `tela.produtos` ver; devolve a situação mais `proximoPasso` e `motivo`. SKU inexistente → `ErroDeFerramenta("Produto <sku> não encontrado.")`. Registrar em `servidor.js` e `consultas.js` (resumo "situação de <sku>").
- [ ] **Step 5: Teste da ferramenta** no `teste-mcp.js`: com um produto `ZZ-MCP-PA1` Conferido sem Bling, a ferramenta devolve `proximoPasso: "sincronizar-bling"`; `tools/list` traz `situacaoDoProduto`; a Revisão marca a chamada como `proposta: true`.
- [ ] **Step 6: Rodar** `npm run teste:mcp` e `npm run teste:acessos` → PASS (o guarda do catálogo aceita o recurso novo).
- [ ] **Step 7: Commit** `feat(proposta-anuncio): situacao do produto e proximo passo no MCP` (só os arquivos da task).

### Task 2: Regra de preenchimento do rascunho

**Files:**
- Create: `src/lib/propostaDeAnuncio/preencher.js` (sem imports de servidor)
- Test: `scripts/teste-li-sync.js` (bloco puro, sem banco)

**Interfaces:**
- Produces: `aplicarProposta(rascunho, propostos, { vazio }) -> { rascunho, campos: string[], sugestoes: object }`.
  `propostos` é um objeto plano por caminho (`{ "categorias": [...], "marca": "X", "seo.description": "..." }`);
  `vazio(caminho, valorAtual) -> boolean` diz se o campo do rascunho conta como vazio (padrão: `""`, `null`, `[]`).
  Campo vazio recebe o valor e entra em `campos`; campo com outro valor fica e o proposto vai para `sugestoes[caminho]`; campo igual não entra em nenhum.
- Produces: `montarProposta({ versaoDoRoteiro, campos, sugestoes, relatorio, extras }) -> object` (o `dados.proposta` da spec 6.3, com `criadaEm` ISO).
- Produces: `marcaDaProposta(proposta, caminho) -> "preenchido" | "sugestao" | null` (para a tela).

- [ ] **Step 1: Teste** (bloco "proposta de anúncio: preenchimento")

```js
const r0 = { marca: "", categorias: [], seo: { title: "T", description: "" } };
const a = aplicarProposta(r0, { marca: "ARDUINO", categorias: ["10", "11"], "seo.description": "d".repeat(140) });
conferir("preenche vazios", [a.rascunho.marca, a.rascunho.categorias, a.rascunho.seo.description.length], ["ARDUINO", ["10", "11"], 140]);
conferir("campos", a.campos.sort(), ["categorias", "marca", "seo.description"]);
const b = aplicarProposta({ ...r0, marca: "GENÉRICA" }, { marca: "ARDUINO" });
conferir("não sobrescreve", [b.rascunho.marca, b.campos, b.sugestoes.marca], ["GENÉRICA", [], "ARDUINO"]);
const c = aplicarProposta({ ...r0, marca: "ARDUINO" }, { marca: "ARDUINO" });
conferir("igual não marca", [c.campos, c.sugestoes], [[], {}]);
conferir("não muda o original", r0.marca, "");
conferir("marcaDaProposta", marcaDaProposta(montarProposta({ campos: ["marca"], sugestoes: { "seo.description": "x" } }), "seo.description"), "sugestao");
```

- [ ] **Step 2: Rodar** `npm run teste:li-sync` → FALHA.
- [ ] **Step 3: Implementar** com cópia profunda (`structuredClone`) e caminho com ponto.
- [ ] **Step 4: Rodar** → PASS.
- [ ] **Step 5: Commit** `feat(proposta-anuncio): regra de preenchimento do rascunho`.

### Task 3: Proposta da LI (ler, gravar, roteiro)

**Files:**
- Create: `src/lib/propostaDeAnuncio/li.js`
- Create: `src/lib/propostaDeAnuncio/roteiros.js` (`ROTEIRO_LI`, `VERSAO_ROTEIRO_LI = "1"`, depois `ROTEIRO_ML`)
- Modify: `src/lib/mcp/propostaDeAnuncio.js` (ferramentas `lerParaPropostaLI`, `gravarPropostaLI`)
- Modify: `src/lib/mcp/proposta.js` (`roteiroDaProposta` ganha `canal: z.enum(["produto","li","ml"]).default("produto")`)
- Test: `scripts/teste-li-sync.js` (LI falsa)

**Interfaces:**
- Consumes: `aplicarProposta`, `montarProposta` (Task 2); `lerSituacaoDoProduto` (Task 1); `comAncestrais(ids, categorias)` (`li/categorias.js`); `novoRascunhoLI`, `anuncioLIDoProduto`, `rascunhoDoAnuncio` (`li/banco.js`); `seoConcorrentes`.
- Produces: `lerParaPropostaLI(cliente, sku) -> { produto, categorias: [{id, caminho}], marcas: string[], seoConcorrentes, rascunho, limites: { description: [130, 160] } }`;
  `gravarPropostaLI(cliente, sku, { categorias: string[], marca, seoDescription, relatorio }) -> { campos, sugestoes, avisos: string[] }`.
- `exigirPropostaDeAnuncio(contexto, "li")`: ação nova executar + editar `tela.canaisDeVenda.lojaIntegrada` (conferir o id em `recursos.js`).

- [ ] **Step 1: Testes** (bloco "proposta da LI", produto `ZZ-LI-PA1` Conferido, Bling sincronizado, LI falsa com a árvore 1 > 10 > 11)
  - gravar com `categorias: ["11"]`, `marca: "ARDUINO"`, description de 140 → rascunho com categorias `["1","10","11"]`, marca e description, `dados.proposta.campos` com os três, `versaoDoRoteiro: "1"`;
  - categoria `"999"` → recusa `/não existe na Loja Integrada/`, nada gravado;
  - description de 129 e de 161 → recusa `/130 a 160/`;
  - produto não Conferido → recusa `/Conferido/`; Bling com selo → recusa `/Bling/`;
  - marca "Marca Nova" que não está na LI → grava e `avisos` contém `/não existe na loja/`;
  - rascunho com marca já preenchida → marca fica, vai para `sugestoes.marca`;
  - gravar duas vezes → a segunda substitui `dados.proposta` (um só);
  - `lerParaPropostaLI` devolve a árvore com `caminho` "1 > 10 > 11" e `limites.description` `[130, 160]`.
- [ ] **Step 2: Rodar** `npm run teste:li-sync` → FALHA.
- [ ] **Step 3: Implementar** `li.js`. Tag Title não é tocado. O `dados.proposta` é escrito com `SELECT ... FOR UPDATE` na mesma transação do rascunho (o mesmo cuidado do `gravarPublicacao`). Marca casada sem caixa e sem acento contra `marcas` da LI.
- [ ] **Step 4: `ROTEIRO_LI`**: passos numerados para a LLM: (1) `situacaoDoProduto` e dizer no chat o próximo passo; (2) só seguir se for `proposta-li` (ou se o dono pedir explicitamente); (3) `lerParaPropostaLI`; (4) escolher as categorias folha mais específicas pela árvore, a marca pelo cadastro, e escrever a Meta Tag Description de 130 a 160 caracteres com as palavras do título, sem inventar especificação; (5) `gravarPropostaLI` com relatório em tópicos (por que cada categoria, de onde veio a marca); (6) mostrar o resumo e dizer que o dono revisa e sincroniza no editor da LI.
- [ ] **Step 5: Ferramentas MCP** `lerParaPropostaLI(sku)` (só leitura) e `gravarPropostaLI` (zod: `categorias` 1 a 10 strings, `marca` até 80, `seoDescription` até 200 — a regra 130-160 é do Rise, para o erro dizer o motivo —, `relatorio` até 8000). Resumos em `consultas.js`.
- [ ] **Step 6: Rodar** `npm run teste:li-sync` e `npm run teste:mcp` → PASS.
- [ ] **Step 7: Commit** `feat(proposta-anuncio): proposta da Loja Integrada pelo MCP`.

### Task 4: A proposta da LI some no envio que deu certo

**Files:**
- Modify: `src/lib/canaisDeVenda/li/envio.js` (no fim de `sincronizarProdutoLI` e do Cadastrar, só no `ok: true`)
- Create: `src/lib/propostaDeAnuncio/banco.js`
- Test: `scripts/teste-li-sync.js`

**Interfaces:**
- Produces: `apagarPropostaDoAnuncio(anuncioId)` em `src/lib/propostaDeAnuncio/banco.js` (remove só a chave `proposta` de `dados`).

- [ ] **Step 1: Testes**: com proposta gravada, Sincronizar que dá certo → `dados.proposta` ausente; Sincronizar recusado pela trava (`LI_ESCRITA` fechada no cliente falso) → `dados.proposta` continua; Cadastrar que dá certo → ausente.
- [ ] **Step 2: Rodar** → FALHA. **Step 3:** implementar. **Step 4:** rodar → PASS.
- [ ] **Step 5: Commit** `feat(proposta-anuncio): apagar a proposta da LI no envio certo`.

### Task 5: Tela da LI (P, marcas, relatório, botão de IA)

**Files:**
- Modify: `src/components/produtos/IconeLojaIntegrada.jsx` e quem monta a linha (`LinhaProduto.jsx`, `src/app/produtos/page.jsx`) para passar `propostaPendente`
- Modify: `src/components/anuncios/li/EditorAnuncioLI.jsx`, `AbaCategorias.jsx`, `AbaGeral.jsx` (marca), `AbaSEO.jsx`
- Create: `src/components/anuncios/PropostaDoAnuncio.jsx` (`MarcaDaPropostaNoCampo`, `SugestaoDaProposta`, `BotaoRelatorioDaProposta`), reaproveitando o visual de `MarcaDaProposta`/`SeloDaProposta` do `FormularioProduto.jsx` (extrair para cá se forem pequenos; senão copiar o desenho)

**Interfaces:**
- Consumes: `marcaDaProposta` (Task 2); o `dados.proposta` vem no contexto que `carregarAnuncioLI` já devolve (acrescentar `proposta` ao retorno, sem mudar o resto).

- [ ] **Step 1: "P"** no canto superior esquerdo do ícone da LI, âmbar, igual ao do ícone R; `title` e `aria-label` "Proposta pronta, aguardando aprovação". A lista lê `dados.proposta` só como booleano (não mandar o relatório para a lista).
- [ ] **Step 2: Editor**: marca âmbar "PROPOSTA" embaixo do campo quando `marcaDaProposta` é "preenchido" e o valor ainda é o proposto; some quando o dono edita. Sugestão ("sugestao") no topo da lista do ícone do campo com a etiqueta "Proposta" (marca e Meta Tag Description); nas categorias, o bloco "Marcar estas" existente recebe as da proposta.
- [ ] **Step 3: Relatório**: botão "Relatório" ao lado do Fechar no topo do editor, abre uma janela com o texto (com `propsDoFundo`).
- [ ] **Step 4: Botão "Gerar com IA" na lista da Meta Tag Description**: conferir em `AbaSEO.jsx` se existe; se faltar, ligar `gerarDescriptionsSeo` pela ação já usada (ou criar `sugerirDescriptionsSeoLI` em `loja-integrada/acoes.js` com `executarComAcesso` e `acao.produtos.gerarTextoComIA`), mostrando o `GastoDaIA`.
- [ ] **Step 5: Conferir na tela** (servidor do PC): gravar uma proposta pelo script de teste num produto `ZZ-LI-*` do banco do PC, abrir a lista (P aparece), abrir o editor (marcas e relatório), editar a marca (a marca some), Gerar com IA aparece na lista da description. Rodar `npm run lint`.
- [ ] **Step 6: Commit** `feat(proposta-anuncio): P, marcas e relatorio no editor da LI`.

---

## Entrega 2: Mercado Livre

### Task 6: Preço da proposta do ML

**Files:**
- Create: `src/lib/propostaDeAnuncio/preco.js`
- Test: `scripts/teste-anuncios-ml.js` (ML falso)

**Interfaces:**
- Consumes: `precoPorMargemNoML(cliente, rascunho, { custo, margem })` e `lerCustosDoAnuncio` (`ml/leitura.js`); `custosDoAnuncio`, `freteQueConta` (`ml/custos.js`); `montarRanking({ preco, catalogos })` (`ml/ranking.js`).
- Produces: `tetoDoRanking(precos: number[]) -> number|null` (pura: 5º menor; menos de 5, o maior; vazio, null);
  `paraBaixo5(valor)` e `paraCima5(valor)` (puras, em centavos inteiros);
  `precoDaPropostaML(cliente, rascunho, { custo, precos: number[], margemMinima = 30 }) -> { valor, margem, posicao, total, piso, teto, avisos: string[] }`.

Algoritmo (no máximo 3 leituras de taxas depois do piso):
```
piso = paraCima5(precoPorMargemNoML(..., { tipo: "percentual", valor: 30 }).preco); sem custo → valor null + aviso
teto = tetoDoRanking(precos)
teto null → valor = piso, aviso "sem concorrente para comparar"
piso > teto → valor = piso, aviso "com 30% de margem o anúncio fica em Nº de M"
senão: candidato = paraBaixo5(teto); se margem(candidato) >= 30 → candidato
       senão, se candidato >= 79 e piso < 79: candidato = paraBaixo5(78.99); se margem >= 30 → candidato
       senão → piso
posicao/total = montarRanking com o valor e os precos
```
`margem(p)` = `custosDoAnuncio` com as taxas lidas em `p` (percentual do lucro sobre o preço).

- [ ] **Step 1: Testes puros**: `tetoDoRanking([50,40,30,20,10,60])` = 50; `tetoDoRanking([30,10,20])` = 30; `tetoDoRanking([])` = null; `paraBaixo5(41.99)` = 41.95; `paraCima5(41.91)` = 41.95; `paraCima5(41.95)` = 41.95.
- [ ] **Step 2: Testes com o ML falso** (comissão 12%, frete 6,85 abaixo de 79 e 12,95 de 79 para cima, custo 20):
  - concorrentes `[45, 48, 50, 52, 55, 70]` → teto 55, `valor` = 55,00, margem ≥ 30, `posicao` 5;
  - concorrentes `[30, 31, 32, 33, 34]` → piso acima do teto, `valor` = piso, aviso `/fica em 6º de 6/`;
  - cruzar 79: custo tal que margem(80,00) < 30 e margem(78,95) ≥ 30, concorrentes com teto 80 → `valor` 78,95;
  - sem custo → `valor` null e aviso `/custo/`;
  - sem concorrentes → `valor` = piso e aviso `/sem concorrente/`;
  - todo `valor` múltiplo de 0,05 (`Math.round(valor*100) % 5 === 0`).
- [ ] **Step 3: Rodar** `npm run teste:anuncios-ml` → FALHA. **Step 4:** implementar. **Step 5:** rodar → PASS.
- [ ] **Step 6: Commit** `feat(proposta-anuncio): preco da proposta do ML`.

### Task 7: Proposta do ML (ler, gravar, roteiro)

**Files:**
- Create: `src/lib/propostaDeAnuncio/ml.js`
- Modify: `src/lib/propostaDeAnuncio/roteiros.js` (`ROTEIRO_ML`, `VERSAO_ROTEIRO_ML = "1"`)
- Modify: `src/lib/mcp/propostaDeAnuncio.js` (`lerParaPropostaML`, `lerCategoriaML`, `gravarPropostaML`)
- Test: `scripts/teste-anuncios-ml.js`

**Interfaces:**
- Consumes: Tasks 1, 2, 6; `sugerirCategoria(cliente, { titulo, produto, ia })` — **sem chamar a IA paga**: conferir em `ml/inteligencia.js` e, se a função não aceitar rodar sem IA, acrescentar a opção `semIA: true`, que só usa o ML e a reserva pelo catálogo; `lerCategoriaCompleta`, `problemasDosAtributos`, `sugerirCatalogos`, `catalogosDosMeusAnuncios`, `lerPrimeiroDoCatalogo`, `resumoDoCatalogo`; `novoRascunhoML`, `anunciosMLDoProduto`, `salvarRascunhoML` (`ml/banco.js`).
- Produces: `lerParaPropostaML(cliente, sku) -> { produto, custo, categorias, atributos, catalogos, meusCatalogos, referencias }`;
  `gravarPropostaML(cliente, sku, { categoriaId, titulo, atributos, catalogos: string[], linksSemCatalogo: [{url,titulo,preco}], relatorio }) -> { anuncioId, campos, sugestoes, preco, catalogosSugeridos, avisos }`.
- `exigirPropostaDeAnuncio(contexto, "ml")`: ação nova + editar `tela.canaisDeVenda.mercadoLivre` + `dado.custo` + `dado.concorrentes`.

- [ ] **Step 1: Testes** (produto `ZZ-ML-PA1` Conferido, Bling verde, ML falso):
  - gravar com categoria folha, título dentro do limite, atributos válidos e 3 catálogos (totais 9, 4 e 6) → rascunho Clássico `gold_special` com categoria, título, atributos e preço; `catalogosSugeridos` com os 2 de 5 ou mais anúncios; aviso do de 4;
  - `CatalogoReferenciaML` do produto continua vazio;
  - categoria não folha → recusa `/folha/`; atributo obrigatório faltando → grava e `avisos` lista o problema (o dono completa no editor);
  - sem catálogo e 5 `linksSemCatalogo` → preço calculado com os preços dos links, os links no relatório (`dados.proposta.links`), nada em outra tabela;
  - existe um Clássico RASCUNHO do produto → a proposta o atualiza (mesmo `anuncioId`); existe só um PUBLICADO → cria um rascunho novo e não toca no publicado;
  - LI ainda sem anúncio → grava assim mesmo (o "pule a LI");
  - catálogo que responde 429 → grava com os outros e aviso `/não foi lido/`;
  - GTIN e `EMPTY_GTIN_REASON` mandados pela LLM são ignorados.
- [ ] **Step 2: Rodar** → FALHA. **Step 3:** implementar `ml.js` (tipo `gold_special`; o título vai em `titulo`, que o Publicar manda como `family_name`). **Step 4:** rodar → PASS.
- [ ] **Step 5: `ROTEIRO_ML`**: (1) `situacaoDoProduto` e dizer no chat o próximo passo; (2) seguir se for `proposta-ml` ou se o dono pedir para pular a LI; (3) `lerParaPropostaML`; (4) escolher a categoria (e `lerCategoriaML` se for outra), escrever o título no limite da categoria, preencher a ficha só com o que o cadastro e as referências provam; (5) escolher até 10 catálogos do MESMO produto com 5 ou mais anúncios; sem catálogo, achar 5 anúncios do mesmo produto pelo navegador e mandar url, título e preço; (6) `gravarPropostaML` com relatório em tópicos; (7) mostrar o preço, a margem, a posição e os avisos que o Rise devolveu, e dizer que o dono revisa e publica.
- [ ] **Step 6: Ferramentas MCP** com zod (`catalogos` até 10, `linksSemCatalogo` até 5 com `url` http(s), `preco` positivo) e resumos em `consultas.js`. Rodar `npm run teste:mcp` → PASS.
- [ ] **Step 7: Commit** `feat(proposta-anuncio): proposta do Mercado Livre pelo MCP`.

### Task 8: Tela do ML e o fim da proposta no Publicar

**Files:**
- Modify: `src/lib/canaisDeVenda/ml/publicar.js` (chamar `apagarPropostaDoAnuncio` na etapa "gravar" que deu certo)
- Modify: ícone do ML na lista (onde `estadoDoIconeML` é desenhado) para o "P"
- Modify: `src/components/anuncios/ml/EditorAnuncioML.jsx`, abas Geral, Ficha técnica, Preço e custos, e `RankingDosCatalogos.jsx` (seção "Sugeridos pela proposta" com Adicionar)
- Test: `scripts/teste-anuncios-ml.js`

- [ ] **Step 1: Teste**: publicação completa no ML falso → `dados.proposta` ausente; publicação que para em "Aguardando o Bling" → continua.
- [ ] **Step 2: Rodar** → FALHA. **Step 3:** implementar. **Step 4:** rodar → PASS.
- [ ] **Step 5: Tela**: "P" no ícone do ML; marcas "PROPOSTA" na categoria, no título, nos atributos e no preço; "Sugeridos pela proposta" no ranking (cada um com o 1º colocado e Adicionar, que chama a ação de adicionar referência que já existe; os já adicionados somem da seção); botão Relatório com os links quando não há catálogo.
- [ ] **Step 6: Conferir na tela** com um `ZZ-ML-*` no banco do PC e `npm run lint`.
- [ ] **Step 7: Commit** `feat(proposta-anuncio): P, marcas e catalogos sugeridos no editor do ML`.

### Task 9: Fechamento

**Files:**
- Modify: `CLAUDE.md` (seção nova "Proposta automática de anúncio (LI e ML)": onde mora, regras, ferramentas, o que não foi visto) e as linhas de `teste:mcp`, `teste:li-sync` e `teste:anuncios-ml` em "Rodar", com as contagens novas
- Modify: `docs/superpowers/roteiros/instrucao-projeto-claude-ai-proposta.md` (uma linha: "para anúncio, chame `roteiroDaProposta` com `canal`")

- [ ] **Step 1:** `npm run lint` e os testes `teste:extracao`, `teste:coleta`, `teste:cadastros`, `teste:mcp`, `teste:li-sync`, `teste:anuncios-ml`, `teste:acessos` → todos PASS (o `teste:worker` sozinho, como pede o CLAUDE.md).
- [ ] **Step 2:** atualizar o CLAUDE.md pelo índice temporário (commit só do próprio trecho).
- [ ] **Step 3: Commit e push** `docs: proposta automatica de anuncio no CLAUDE.md`.
- [ ] **Step 4:** roteiro de testes do dono (depois do "sobe"): no claude.ai, "faça a proposta do 100101" → a LLM diz o próximo passo e grava a LI; o "P" aparece na LI; ele sincroniza e o "P" some; pede de novo → a LLM diz que agora é o ML e grava; o editor do ML mostra preço, margem, posição e os catálogos sugeridos; ele publica e o "P" some.
