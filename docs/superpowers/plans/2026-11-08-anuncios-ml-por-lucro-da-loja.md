# Anúncios do ML pelo lucro da loja — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os anúncios do ML dos produtos novos saem do lucro da loja: botão de preço por faixa, "!" quando o preço da loja muda, variantes (sem frete / frete grátis) por produto, reaproveitar anúncio antigo da conta (com o vínculo do Bling movido) e preços de atacado por padrão.

**Architecture:** Regras puras em módulos novos de `src/lib/canaisDeVenda/ml/` (`faixas.js`, `atacado.js`, `reaproveitar.js`), ligadas às peças que já existem: `leitura.js` (taxas e frete do ML), `acompanhar.js`/`atualizar.js` (o "!" e o "Enviar mudanças"), `publicar.js` (etapas), `banco.js` (anúncios do produto), as ações em `src/app/canais-de-venda/mercado-livre/acoes.js` e as telas em `src/components/anuncios/ml/`. Nada novo no banco (tudo em `Anuncio.dados`).

**Tech Stack:** Next.js (App Router, server actions), React 19, Prisma/Postgres, JavaScript sem TypeScript, testes em `scripts/teste-anuncios-ml.js` (ML falso em `scripts/lib/mlFalso.js`, Bling falso).

**Spec:** `docs/superpowers/specs/2026-11-08-anuncios-ml-por-lucro-da-loja-design.md`

## Global Constraints

- Código e identificadores em português sem acento; texto de tela com acento; comentários dizem o porquê.
- Nenhuma escrita no ML ou no Bling fora das travas (`ml.exigirEscrita`, `bling.exigirEscrita`); nenhum envio de preço sem o "Enviar mudanças" do dono.
- Regra 3 da spec: anúncio publicado antes desta mudança não acende nada sozinho (impressão sem a chave = sem base).
- Valores da tela sempre editáveis (preço, quantidades e % do atacado).
- `LIMITE_DO_FRETE_GRATIS = 79`; faixa: < 72 duas variantes; 72–78,99 uma, Clássico com frete grátis a R$ 79 (ou o preço pelo lucro, se maior); ≥ 79 uma.
- Atacado: faixas padrão 2, 5, 10 e 20; `% gravado ≥ % recomendado`; `context_restrictions: ["channel_marketplace","user_type_business"]`; header `X-Version`.
- Bling: loja Rise_ML `206326819` (`LOJA_ML_NO_BLING`), antiga ML_4h `203593931`; criar o vínculo novo ANTES de apagar o antigo.
- Telas pelo Padrão visual do CLAUDE.md (10 regras) e `ecc:make-interfaces-feel-better`; tabela nova com cabeçalho que ordena.
- Testes: `npm run teste:anuncios-ml` (todo bloco novo entra antes de "Blocos das tarefas seguintes"); ao fim `npm run lint`. Sem deploy sem o "sobe" do dono.
- Commits só dos arquivos deste plano (`git commit -- caminhos`); nunca `.env`, `src/lib/compras/banco.js`, `FORNECEDORES.md`.

## Review Focus

1. Produto sem custo ou sem preço de venda: o botão fica desligado com o motivo, nunca calcula com zero (Task 2 testa custo ausente; Task 3 o `title`).
2. Rascunho sem categoria: `lerTaxas` exige `categoriaId`; o botão e as variantes devolvem erro legível, não 500 (Task 2).
3. Variante com frete grátis cujo preço pelo lucro já passa de 79: não aplicar o piso duas vezes nem forçar 79 abaixo do calculado (Task 1).
4. Reaproveitar um item com `sold_quantity > 0`: o título NÃO vai ao ML e o aviso diz por quê; os outros campos vão (Task 7).
5. Atacado: o ML recusa % abaixo do recomendado e `X-Version` velha (409): o Publicar segue sem atacado com aviso e o "!" chama de volta; o Enviar mudanças relê a versão e tenta de novo uma vez (Task 9).

---

### Task 0: Medições só leitura na VPS (sem código no repo)

**Files:**
- Create (scratchpad, fora do repo): `medir-ml.mjs`

**Interfaces:**
- Produces: três fatos gravados na ledger e no cabeçalho de `atacado.js` (Task 8): (a) onde mora a versão do item para o `X-Version`; (b) se o validador (`POST /items/validate`) aceita um 2º anúncio do vendedor no mesmo `catalog_product_id`; (c) se `POST /prices-per-quantity/v1/recommendations` responde para item `paused`.

- [ ] **Step 1: Escrever o script** no molde de `atacado.mjs`: (a) `GET /items/MLB7869562976?attributes=id,version,last_updated` e `GET /items/MLB7869562976/prices` lendo os headers da resposta (ver o que `requisitar` devolve em `src/lib/integracoes/httpClient.js`; se não devolve headers, imprimir isso); (b) montar o payload de um anúncio existente no catálogo (100101) com `catalog_product_id` igual e `catalog_listing: true`, `POST /items/validate` (só valida, nunca cria) e imprimir status e mensagem; (c) recomendação para um item pausado da conta (achar um `paused` pela busca `scan`).
- [ ] **Step 2: Rodar** `ssh -i ~/.ssh/rise_vps rise@179.199.150.221 "cd /srv/rise/app && docker compose exec -T app node --input-type=module -" < medir-ml.mjs`
  Expected: três linhas com os resultados; nenhuma escrita (só GET e `/validate`).
- [ ] **Step 3: Anotar** na ledger `Task 0: X-Version = <onde>; 2º no catálogo = <aceita|recusa + motivo>; recomendação em pausado = <sim|não>`. Se o `X-Version` não aparecer em lugar nenhum, a Task 8 manda o POST sem o header e trata 409/400 como "sem versão" (ruling registrado).

---

### Task 1: `faixas.js` — variantes e preço pela faixa (puro)

**Files:**
- Create: `src/lib/canaisDeVenda/ml/faixas.js`
- Test: `scripts/teste-anuncios-ml.js` (bloco novo "Faixas e preço pelo lucro da loja")

**Interfaces:**
- Consumes: `custosDoAnuncio`, `precoPorMargem`, `LIMITE_DO_FRETE_GRATIS` de `./custos.js`; `dinheiro` de `@/lib/margem` (ou onde `custos.js` o importa).
- Produces:
  - `export const LIMITE_DA_SEGUNDA_VARIANTE = 72`
  - `export const VARIANTES = ["classico_sem_frete", "classico_frete_gratis", "premium_sem_frete", "premium_frete_gratis"]`
  - `export const NOME_DA_VARIANTE = { classico_sem_frete: "Clássico sem frete", classico_frete_gratis: "Clássico com frete grátis", premium_sem_frete: "Premium sem frete", premium_frete_gratis: "Premium com frete grátis" }`
  - `export function variantesEsperadas(precoSemFrete: number): string[]`
  - `export function varianteDoRascunho(rascunho): string` (por `tipoAnuncio` + `envio.freteGratis || preco >= 79`)
  - `export function rascunhoDaVariante(rascunho, variante): rascunho` (devolve cópia com `tipoAnuncio` e `envio.freteGratis` da variante)
  - `export async function precoPelaFaixa({ lucro, custo, variante, taxas, frete }): Promise<{ preco: number, freteGratis: boolean, piso: boolean } | null>` — `taxas(preco)` → `{ percentual, tarifaFixa }`, `frete(preco, freteGratis)` → número; até 4 voltas; arredonda com `Math.ceil(x*10)/10 − 0.01`; `piso` true quando a variante é com frete grátis, o preço SEM frete pelo lucro (calculado primeiro, mesma função, variante sem frete) cai em [72, 79) e o resultado ficou abaixo de 79 → devolve 79.
  - `export function lucroPorUnidade(lucro: number|null, unidades: number): number|null` (6.8)

- [ ] **Step 1: Escrever o bloco de teste** (`conferir`), com taxas fixas: `taxas = () => ({ percentual: 0.13, tarifaFixa: 6.5 })` abaixo de 79 e `tarifaFixa: 0` a partir de 79; `frete = (p, fg) => (fg || p >= 79 ? 19.05 : 6.85)`:
  - `variantesEsperadas(71.99)` → `["classico_sem_frete","classico_frete_gratis"]`; `(72)` e `(79)` → `["classico_frete_gratis"]`.
  - `varianteDoRascunho({ tipoAnuncio: "gold_special", envio: { freteGratis: false }, preco: 45.9 })` → `"classico_sem_frete"`; com `preco: 89.9` → `"classico_frete_gratis"`; `gold_pro` + `freteGratis: true` → `"premium_frete_gratis"`.
  - `rascunhoDaVariante(r, "classico_frete_gratis").envio.freteGratis === true` e não altera `r`.
  - `precoPelaFaixa({ lucro: 9.44, custo: 25, variante: "classico_sem_frete", taxas, frete })` → preço que `custosDoAnuncio` devolve com `lucro ≥ 9.44` e `< 9.44 + 0.10`, terminando em 9 centavos (`Math.round(preco*100) % 10 === 9`).
  - mesma entrada, `classico_frete_gratis` → `freteGratis: true` e preço maior que o sem frete.
  - lucro 17.34 e custo 49.52 (o 100201: sem frete ≈ 72,99) com `classico_frete_gratis` → `{ preco: 79, piso: true }`.
  - lucro 60, custo 100 com `classico_frete_gratis` → `piso: false` e `preco > 79`.
  - `lucroPorUnidade(15.37, 10)` → `1.54`; `(null, 10)` → `null`; `(15.37, 0)` → `null`.
- [ ] **Step 2: Rodar** `npm run teste:anuncios-ml 2>&1 | tail -5`
  Expected: falha com "Cannot find module .../faixas.js".
- [ ] **Step 3: Implementar `faixas.js`** com as assinaturas acima; `precoPelaFaixa` repete o laço de `quatro.mjs` (`novo = ceil(((lucro + custo + tarifaFixa + frete)/(1 − percentual − 0.06))*10)/10 − 0.01`, frete grátis forçado quando `novo ≥ 79`), e confere no fim com `custosDoAnuncio` que `lucro ≥ pedido`; se não, sobe 0,10 e repete (máx. 4).
- [ ] **Step 4: Rodar** o teste. Expected: bloco passa, total sem falhas.
- [ ] **Step 5: Commit** `git commit -m "feat(ml): faixas e preco pelo lucro da loja (regras puras)" -- src/lib/canaisDeVenda/ml/faixas.js scripts/teste-anuncios-ml.js`

---

### Task 2: `precoPelaFaixaNoML` e a ação do botão

**Files:**
- Modify: `src/lib/canaisDeVenda/ml/leitura.js` (depois de `precoPorMargemNoML`)
- Modify: `src/app/canais-de-venda/mercado-livre/acoes.js` (ao lado de `precoPorMargemML`)
- Test: `scripts/teste-anuncios-ml.js` (bloco "Preço pela faixa no ML")

**Interfaces:**
- Consumes: Task 1; `lerTaxas`, `lerFreteDoVendedor` (leitura.js); `lucroLiquido` de `@/lib/margem`; `custoDoProduto` de `@/lib/canaisDeVenda/custo.js`; `unidadesDaComposicao` de `../composicao.js`.
- Produces:
  - `export async function precoPelaFaixaNoML(cliente, rascunho, { custo, lucro, variante = varianteDoRascunho(rascunho) })` → `{ preco, freteGratis, piso, variante, custosML }` ou `null`. `taxas` = `lerTaxas(cliente, { preco, categoriaId, tipoAnuncio da variante, logistica })`; `frete` = `lerFreteDoVendedor(cliente, { envio: { ...envio, freteGratis }, preco, ... })?.custo ?? 0`.
  - `export function lucroDaLojaDoRascunho(rascunho, produtos)` em `faixas.js` (puro): simples = `lucroLiquido(precoVenda, custo)`; kit = `lucroLiquido(precoVenda da peça, custo da peça) × quantidade` somado; `null` sem preço ou custo em alguma peça.
  - Ação `export async function precoPelaFaixaMLAcao(rascunho, { variante } = {})` → `{ ok, preco, freteGratis, piso, variante, lucro }` ou `{ ok: false, erro }`; acessos iguais a `precoPorMargemML`; erro "Sem categoria: escolha a categoria na aba Geral." quando `categoriaId` vazio; "Sem custo do produto." / "Sem preço de venda do produto." quando o lucro não sai.

- [ ] **Step 1: Teste** com `criarMLFalso()` (as rotas `/sites/MLB/listing_prices` e `shipping_options/free` já existem; ler `CATEGORIAS_PADRAO` para a categoria): produto ZZ-ML-FX com custo 25 e precoVenda 45,90 (lucro = `lucroLiquido(45.9, 25)`); `novoRascunhoML` → `precoPelaFaixaNoML(ml, rascunho, { custo: 25, lucro })` devolve `preco > 45.9` e `custosDoAnuncio(...)` com `lucro ≥` o da loja; com `variante: "classico_frete_gratis"` devolve `freteGratis: true` e preço maior; `lucroDaLojaDoRascunho` do kit 2× (precoVenda 45,90, custo 25) = `2 × lucroLiquido(45.9, 25)`; rascunho sem `categoriaId` → `precoPelaFaixaNoML` lança/`null` e a ação devolve `{ ok: false, erro: /categoria/ }` (a ação precisa do ambiente de teste de ações já usado no arquivo para `precoPorMargemML`; se não houver, testar só a função da lib e anotar).
- [ ] **Step 2: Rodar.** Expected: falha "precoPelaFaixaNoML is not a function".
- [ ] **Step 3: Implementar** as três funções.
- [ ] **Step 4: Rodar.** Expected: passa.
- [ ] **Step 5: Commit** `feat(ml): preco pela faixa com as taxas do ML e a acao do botao`.

---

### Task 3: Botão "Preço pelo lucro da loja" e lucro por unidade do kit (tela)

**Files:**
- Modify: `src/components/anuncios/ml/AbaPrecoEstoque.jsx` (linhas 196–217: o `dl` do kit; o botão entra abaixo das linhas "Preço na loja", antes de `</Campo>`)
- Modify: `src/components/anuncios/ml/AbaEnvio.jsx` (nada se `alterar({ envio })` já basta; conferir)

**Interfaces:**
- Consumes: `precoPelaFaixaMLAcao` (Task 2), `lucroPorUnidade`, `NOME_DA_VARIANTE`, `varianteDoRascunho` (Task 1); `conta` (o `custosDoAnuncio` já calculado na aba, linha 106).
- Produces: nada para outras tasks.

- [ ] **Step 1: Linha da 6.8**: em "Preço no ML (UN)" acrescentar `<span>(Lucro = …)</span>` com `lucroPorUnidade(conta?.lucro ?? null, unidadesDoKit)`, vermelho quando negativo, só quando `acessos.custos` e `conta?.lucro !== null`. Conferir no teste: `lucroPorUnidade` já testado; aqui só tela.
- [ ] **Step 2: Botão** `Preço pelo lucro da loja` (ícone `Calculator` do lucide, estilo do "Pesquisar concorrentes": `rounded border border-borda px-3 py-1.5 text-sm text-acento`), desabilitado com `title` quando falta custo, preço de venda do produto ou categoria. Ao clicar: `startTransition` → `precoPelaFaixaMLAcao(rascunho)`; ok → `alterar({ preco })`, zera `markupAlvo`, e se `freteGratis && !rascunho.envio.freteGratis` → `alterar({ envio: { ...rascunho.envio, freteGratis: true } })`; mostra uma linha abaixo (11px): `Lucro da loja R$ X mantido como Clássico sem frete` ou, com `piso`, `Faixa R$ 72–79: sobe para R$ 79 com frete grátis`. Erro → a linha em vermelho (`text-red-600`), sem popup.
- [ ] **Step 3: Conferir no navegador** (servidor da sessão ou worktree, ver memória "Tela com servidor de outra sessão"): abrir um anúncio simples e um kit; clicar o botão; ver o preço mudar, a linha, e no kit o "(Lucro = R$ x)" na linha do ML. `read_console_messages` sem erro. Passar `ecc:make-interfaces-feel-better` no cartão.
- [ ] **Step 4: Commit** `feat(ml): botao Preco pelo lucro da loja e lucro por unidade do kit na aba Preco`.

---

### Task 4: "!" pelo preço da loja

**Files:**
- Modify: `src/lib/canaisDeVenda/ml/acompanhar.js` (`PARTES_DO_ANUNCIO`, `conteudoAtualDoAnuncio`, `NOMES_DAS_PARTES`)
- Modify: `src/lib/canaisDeVenda/ml/impressao.js` (se filtra chaves: incluir `precoDaLoja`)
- Modify: `src/lib/canaisDeVenda/ml/etapasDoEnvio.js` (`ETAPAS_DO_ENVIO_ML` + `PARTES_DO_ENVIO_ML` ganham `precoDaLoja`, rótulo "Registrar o preço da loja", antes de "preco")
- Modify: `src/lib/canaisDeVenda/ml/atualizar.js` (parte `precoDaLoja`: só `gravarParte`, sem chamada ao ML)
- Modify: `src/components/anuncios/ml/EditorAnuncioML.jsx` + `AbaPrecoEstoque.jsx` (faixa na aba Preço)
- Test: bloco "Preço da loja mudou"

**Interfaces:**
- Consumes: Task 1–2.
- Produces: `conteudoAtualDoAnuncio(...).precoDaLoja` = `Number(produto.precoVenda) > 0 ? precoVenda : null` (kit: soma `precoVenda × quantidade` das peças, ou `null`); `NOMES_DAS_PARTES.precoDaLoja = "preço da loja"`; prop `precoDaLojaEnviado` (número ou null) que o editor passa à `AbaPrecoEstoque` a partir de `infoDoML.publicacao?.enviado?.precoDaLoja`.

- [ ] **Step 1: Teste**: `mudancasDoAnuncio({ ...impressao, precoDaLoja: 45.9 }, { ...atual, precoDaLoja: 49.9 })` → `partes` contém `"precoDaLoja"`; impressão SEM a chave → não contém; custo diferente (não entra na impressão) → não contém; `conteudoAtualDoAnuncio(rascunhoDoKit, produtos).precoDaLoja` = soma; `enviarMudancasML` num anúncio ZZ-ML publicado contra o ML falso com só `precoDaLoja` mudado → `enviadas: ["precoDaLoja"]`, nenhum PUT no ML falso (contar as chamadas, o falso registra `chamadas`/`escritas`; ver como o bloco do Enviar mudanças de 24/10 conta), impressão gravada com o novo valor.
- [ ] **Step 2: Rodar.** Expected: falha nas 3 primeiras asserções.
- [ ] **Step 3: Implementar.** Em `mudancasDoAnuncio` a parte entra pela regra de `PARTES_DO_ANUNCIO` (só com `tem(parte)`): basta acrescentar à lista. `publicar.js` (etapa `gravar`) já grava `impressaoDoConteudo(conteudoAtualDoAnuncio(...))`, então o anúncio novo nasce com a base.
- [ ] **Step 4: Tela.** Editor: passar `precoDaLojaEnviado` e `mudancas` à aba Preço. Na aba, quando `mudancas?.partes?.includes("precoDaLoja")`: faixa âmbar de uma linha acima do campo: `Preço da loja mudou de R$ X para R$ Y.` + o botão da Task 3 ao lado (o mesmo botão, não outro). A aba Divergências (`divergenciasDoAnuncioML`) mostra a parte pelo nome sem mudança de código (conferir).
- [ ] **Step 5: Rodar o teste e conferir no navegador** (mudar o preço de venda de um produto ZZ com anúncio publicado falso não dá na tela; conferir só a faixa com um anúncio real da VPS copiado no PC, se houver, senão só o teste).
- [ ] **Step 6: Commit** `feat(ml): "!" quando o preco da loja muda, sem enviar nada sozinho`.

---

### Task 5: Variantes do produto no popup de anúncios

**Files:**
- Modify: `src/lib/canaisDeVenda/ml/banco.js` (`linhaDoAnuncio` ganha `freteGratis`; `anunciosMLDoProduto` não muda de forma)
- Create em `faixas.js`: `export function variantesDoProduto({ precoVenda, anuncios })` (puro)
- Modify: `src/app/canais-de-venda/mercado-livre/acoes.js` (`listarAnunciosDoProdutoML` devolve também `variantes`; nova `criarVarianteMLAcao(anuncioId, variante)`)
- Modify: `src/components/anuncios/ml/JanelaAnuncioML.jsx` (linha "Faltam: …")
- Test: bloco "Variantes do produto"

**Interfaces:**
- Consumes: Task 1–2; `clonarRascunhoML(id)` (banco.js), `rascunhoDaVariante`, `precoPelaFaixaNoML`.
- Produces: `variantesDoProduto({ precoVenda, anuncios })` → `{ esperadas: string[], existentes: string[], faltam: string[] }`, onde `anuncios` são as linhas de `anunciosMLDoProduto` com `tipoAnuncio`, `preco`, `freteGratis`, `status`, `situacaoCanal` e `codigo`; só anúncios sem composição (`codigo === sku`) e com `situacaoCanal` ≠ ENCERRADA contam. **Ruling do plano:** a faixa do popup usa `precoVenda` da loja (sem chamar o ML); o preço exato pelo lucro só no botão/clone. Perto de R$ 72 pode diferir em centavos; aceito pelo custo (a lista não chama o ML).
  - `criarVarianteMLAcao(anuncioId, variante)` → o mesmo retorno de `clonarAnuncioML`, com `rascunho = rascunhoDaVariante(clone, variante)` e `preco` de `precoPelaFaixaNoML` (sem custo/categoria: o preço fica o do clone e `aviso` diz).

- [ ] **Step 1: Teste**: `variantesDoProduto({ precoVenda: 45.9, anuncios: [{ codigo: "A", sku: "A", tipoAnuncio: "gold_special", freteGratis: false, preco: 45.99, situacaoCanal: "ATIVA" }] })` → `faltam: ["classico_frete_gratis"]`; com os dois → `faltam: []`; `precoVenda: 89.9` e um anúncio com `preco: 89.99` → `existentes: ["classico_frete_gratis"]`, `faltam: []`; kit na lista (`codigo !== sku`) é ignorado; `precoVenda: null` → `esperadas: []`.
- [ ] **Step 2: Rodar.** Expected: falha "variantesDoProduto is not a function".
- [ ] **Step 3: Implementar** a função, `freteGratis` em `linhaDoAnuncio`, a ação e o popup: abaixo da tabela de anúncios, uma linha `text-xs`: `Faltam: Clássico com frete grátis` + botão `Criar` (secundário, mesmo estilo do Clonar) que chama `criarVarianteMLAcao(idDoAnuncioExistente, variante)` e abre o editor como o Clonar faz (`abrirClone`). Sem anúncio existente a linha não aparece (o "Novo anúncio" já cobre).
- [ ] **Step 4: Rodar o teste; conferir no navegador** o popup de um produto com um anúncio.
- [ ] **Step 5: Commit** `feat(ml): variantes que faltam no popup de anuncios do produto`.

---

### Task 6: Reaproveitar anúncio existente — biblioteca e ação

**Files:**
- Create: `src/lib/canaisDeVenda/ml/reaproveitar.js`
- Modify: `scripts/lib/mlFalso.js` (se faltar: `meusItens[sku]` já serve a busca por `seller_sku`; conferir que `/items/{id}` devolve `title, price, listing_type_id, shipping.free_shipping, sold_quantity, status, catalog_listing, category_id, permalink, family_name, date_created`)
- Modify: `acoes.js` (`anunciosDoSkuMLAcao(produtoId)`, `reaproveitarAnuncioMLAcao(produtoId, itemId)`)
- Test: bloco "Reaproveitar anúncio da conta"

**Interfaces:**
- Consumes: `prisma`, `contextoDosProdutos`, `rascunhoInicial`, `gravarPublicacao`, `etapasDoAnuncio`; `textoDaRecusaML`.
- Produces:
  - `export function candidatosParaReaproveitar(itens, { idsDoRise })` (puro) → `[{ id, titulo, preco, tipoAnuncio, freteGratis, vendidos, catalogo, status, link, categoriaId }]`, sem os do Rise e sem `closed`; ordem: `active` primeiro, depois mais vendidos.
  - `export async function anunciosDoSkuNaConta(ml, sku)` → `{ ok, itens }` (busca `/users/{eu}/items/search?seller_sku=` + `/items/{id}` um a um, como `outrosAnunciosDoAnuncio`).
  - `export async function reaproveitarAnuncioML(produtoId, itemId, { ml })` → `{ ok, anuncioId }`: lê o item; recusa se `status === "closed"`, se o `seller_custom_field` não é o SKU do produto, ou se o MLB já está no Rise; cria `Anuncio` com `canal: "MERCADO_LIVRE"`, `status: "PUBLICADO"`, `idExterno: itemId`, `urlExterna: permalink`, `categoriaExternaId`, `titulo: item.title`, `temVendas: sold_quantity > 0`, `publicadoEm: date_created`, `descricao` e `atributos` do `rascunhoInicial`, `dados` = rascunho inicial com `tipoAnuncio`, `envio.freteGratis`, `preco` do item e `publicacao: { itemId, permalink, statusML: item.status, feitas: etapasDoAnuncio({ kit: false }), reaproveitado: { em, blingMovidoEm: null }, enviado: { titulo: item.title, preco: item.price, ficha: [], prazo: null }, criadoCom: null }`. A impressão sem partes do produto deixa `naoConferido` verdadeiro → descrição, fotos e pacote acendem; `preco`/`ficha` acendem pela diferença; `titulo` pela Task 7.

- [ ] **Step 1: Teste**: no ML falso registrar `meusItens["ZZ-ML-RE"] = ["MLBANTIGO1"]` com o item (gold_special, free_shipping false, price 39.9, sold_quantity 3); `candidatosParaReaproveitar` tira os do Rise e os `closed`; `reaproveitarAnuncioML` cria o anúncio PUBLICADO com `dados.tipoAnuncio === "gold_special"`, `dados.envio.freteGratis === false`, `temVendas === true`, e `carregarAnuncioML(id).mudancas.partes` contém `"descricao"` e `"preco"` (preço do Rise 45,90 ≠ 39,90) e `naoConferido === true`; chamar de novo com o mesmo item → `{ ok: false, erro: /já está no Rise/ }`.
- [ ] **Step 2: Rodar.** Expected: falha no import.
- [ ] **Step 3: Implementar** a lib e as duas ações (acessos: `tela.canaisDeVenda.mercadoLivre` `editar`).
- [ ] **Step 4: Rodar.** Expected: passa.
- [ ] **Step 5: Commit** `feat(ml): reaproveitar anuncio existente da conta (lib e acoes)`.

---

### Task 7: Reaproveitar — popup, título no envio e o vínculo do Bling

**Files:**
- Create: `src/components/anuncios/ml/JanelaReaproveitarML.jsx`
- Modify: `src/components/anuncios/ml/JanelaAnuncioML.jsx` (o "Novo anúncio" consulta `anunciosDoSkuMLAcao` quando o produto não tem anúncio do ML no Rise)
- Modify: `acompanhar.js` (`PARTES_DO_ANUNCIO` ganha `titulo`; `conteudoAtualDoAnuncio().titulo = rascunho.titulo`; nome "título")
- Modify: `etapasDoEnvio.js` (etapas `titulo` "Enviar o título" e `bling` "Mover o vínculo no Bling"; `PARTES_DO_ENVIO_ML` ganha `titulo`)
- Modify: `atualizar.js` (parte `titulo`; etapa `bling` no fim quando `publicacao.reaproveitado && !publicacao.reaproveitado.blingMovidoEm`)
- Modify: `src/lib/canaisDeVenda/ml/bling.js` (`moverVinculoParaRiseML(bling, codigo, itemId, { preco, titulo, tipoAnuncio })`)
- Modify: `acoes.js` (`enviarMudancasMLAcao(anuncioId, { moverBling = false })`), `EditorAnuncioML.jsx` (pergunta antes)
- Test: blocos "Título no envio" e "Mover o vínculo do Bling"

**Interfaces:**
- Consumes: Task 6; `vinculoNoBlingML`, `vincularNoBlingML`, `registrarAnuncioNoBlingML`, `buscarNoBling` (bling.js); `clienteBling().delete`.
- Produces:
  - Parte `titulo`: só entra em `mudancasDoAnuncio` quando `enviado.titulo` existe (os publicados pelo Rise não têm; ficam como hoje). No envio: `temVendas` → pula com aviso `"O título não muda depois de vendas: ficou o do ML."` e grava a parte (não acende de novo); sem vendas → `PUT /items/{id}` com `{ family_name }` se o item lido tem `family_name`, senão `{ title }`.
  - `moverVinculoParaRiseML(bling, codigo, itemId, { preco, titulo, tipoAnuncio })` → `{ ok, de: "ML_4h"|"nenhuma"|"Rise_ML", criado, apagado, registrado, erro }`: lê `/produtos/lojas` do produto; se já na Rise_ML → `{ ok, de: "Rise_ML" }` e só registra; senão `vincularNoBlingML` (cria) e, só com `ok`, `DELETE /produtos/lojas/{id}` do vínculo cuja `loja.id === "203593931"` e `codigo === itemId` (quando existe); depois `registrarAnuncioNoBlingML`. O chamador grava `publicacao.reaproveitado.blingMovidoEm` ao concluir.
  - `enviarMudancasMLAcao(anuncioId, { moverBling })`: sem `moverBling` a etapa `bling` fica "aguardando confirmação" e o resultado traz `pedeBling: { de: "ML_4h", codigo, itemId }`; o editor abre o popup `role="alertdialog"` "Mover o vínculo do Bling?" (uma linha: `O anúncio MLB… sai da loja ML_4h e entra na Rise_ML.`, **Mover** e **Agora não**) e, com Mover, chama de novo com `moverBling: true`.

- [ ] **Step 1: Teste (título)**: anúncio reaproveitado da Task 6 (`temVendas: true`) → `enviarMudancasML` grava a parte `titulo` sem PUT de título e devolve `avisos` com /título/; outro item com `sold_quantity: 0` → PUT com `family_name` registrado no ML falso. Anúncio publicado pelo Rise (impressão sem `titulo`) com `rascunho.titulo` diferente → `partes` NÃO contém `titulo`.
- [ ] **Step 2: Teste (Bling)** com o Bling falso do arquivo (ver como o bloco da fase 3 o monta): vínculo do produto na loja 203593931 → `moverVinculoParaRiseML` cria na 206326819, apaga o antigo, registra em `/anuncios`, `{ de: "ML_4h", criado: true, apagado: true }`; criação recusada → nada apagado, `ok: false`; já na Rise_ML → `{ de: "Rise_ML" }` sem escrita de vínculo.
- [ ] **Step 3: Rodar.** Expected: falhas nas duas.
- [ ] **Step 4: Implementar** lib, envio e ação.
- [ ] **Step 5: Tela**: `JanelaReaproveitarML` (tabela: MLB com link, título truncado, tipo, frete, preço, vendas, catálogo, estado; cabeçalho ordenável por título, preço e vendas via `CabecalhoOrdenavel` em memória; botões `Reaproveitar` por linha e `Criar novo` no rodapé; sem resultado o editor abre direto, a janela não aparece). `JanelaAnuncioML`: no `Novo anúncio`, se a lista do Rise está vazia → `anunciosDoSkuMLAcao`; com itens → abre a janela; `Reaproveitar` → `reaproveitarAnuncioMLAcao` → `abrirAnuncioML(anuncioId)`. Popup do Bling no editor como descrito. Padrão visual + `make-interfaces-feel-better`; conferir no navegador com um produto do PC que tenha anúncio antigo na conta (o PC lê o ML real em GET).
- [ ] **Step 6: Rodar o teste inteiro.** Expected: passa.
- [ ] **Step 7: Commit** `feat(ml): popup Reaproveitar, titulo no Enviar mudancas e o vinculo do Bling movido para a Rise_ML`.

---

### Task 8: Atacado — regras puras, cliente e rascunho

**Files:**
- Create: `src/lib/canaisDeVenda/ml/atacado.js`
- Modify: `src/lib/integracoes/mercadolivre.js:147` (`mlPost = (caminho, corpo, { headers } = {}) => chamar("POST", caminho, { corpo, tentativas: 1, headers })`)
- Modify: `src/lib/canaisDeVenda/ml/rascunho.js` (`rascunhoInicial`: `atacado: ATACADO_PADRAO()`), `banco.js` (`rascunhoDoAnuncio`: `atacado: dados.atacado ?? { ligado: false, faixas: [] }`), `esquema.js` (`atacado: z.object({ ligado: z.boolean(), faixas: z.array(z.object({ quantidade: z.number().int().min(1).max(100), percentual: z.number().min(0).max(100).nullable() })).max(5) }).optional()`)
- Modify: `scripts/lib/mlFalso.js` (rotas: `POST /prices-per-quantity/v1/recommendations` → `{ recommendations: [{ quantity, discount_percentage }] }` com 0,82/2,62/5,5/9,86/12,27 para 2/3/5/10/20; `POST /items/{id}/prices/price-per-quantity` exige header `X-Version` igual à do item (o falso guarda `version` no item e devolve 409 se diferente, 400 "Amount above recommended" se % < recomendado), grava; `GET /items/{id}/prices` com `show-all-prices` devolve `price_per_quantity`; `post(caminho, corpo, { headers })`)
- Test: bloco "Preços de atacado (regras)"

**Interfaces:**
- Produces:
  - `export const FAIXAS_PADRAO = [2, 5, 10, 20]`; `export function ATACADO_PADRAO()` → `{ ligado: true, faixas: FAIXAS_PADRAO.map((quantidade) => ({ quantidade, percentual: null })) }`.
  - `export function faixasComRecomendacao(faixas, recomendacoes)` → cada faixa com `percentual = max(percentual ?? 0, recomendado)` (o ML recusa abaixo); recomendações como `[{ quantity, discount_percentage }]`.
  - `export function corpoDoAtacado(faixas)` → `{ price_per_quantity: [{ type: "discount_percentage", percentage, conditions: { context_restrictions: ["channel_marketplace","user_type_business"], min_purchase_unit: quantidade, eligible: true } }] }`, ordenado por quantidade, só faixas com `percentual > 0`; `ligado: false` → `{ price_per_quantity: [] }`.
  - `export function faixasLidas(prices)` → `[{ quantidade, percentual, id }]` de `price_per_quantity[]` (para a impressão e o "!").
  - `export function impressaoDoAtacado(atacado)` → `{ ligado, faixas: [[quantidade, percentual]] }` em ordem (o que entra em `enviado.atacado`).
  - `export async function lerRecomendacaoDeAtacado(ml, { itemId, preco, quantidades })` → `[{ quantity, discount_percentage }]`.
  - `export async function lerVersaoDoItem(ml, itemId)` → string ou `null` (onde a Task 0 achou).
  - `export async function enviarAtacadoML(ml, { itemId, preco, atacado })` → `{ ok, faixas, erro }`: recomendação → `faixasComRecomendacao` → `lerVersaoDoItem` → POST com `headers: { "X-Version": versao }` (sem versão: sem header); 409 → relê a versão e tenta uma vez; depois `GET /items/{id}/prices` com `{ headers: { "show-all-prices": "true" } }` e devolve `faixasLidas`.

- [ ] **Step 1: Teste**: `ATACADO_PADRAO()` tem 4 faixas e `ligado: true`; `faixasComRecomendacao([{quantidade:2,percentual:null},{quantidade:10,percentual:12}], rec)` → 0,82 e 12; `corpoDoAtacado` com uma faixa `percentual: 0` a tira; desligado → `[]`; `enviarAtacadoML(mlFalso, { itemId, preco: 45.9, atacado: ATACADO_PADRAO() })` → 4 faixas gravadas e `faixasLidas` iguais; o falso com versão trocada no meio (`estado.itens.get(id).version = "2"` antes do POST) → 409 na 1ª, relê e grava; `mlPost.length === 3` (assinatura com headers).
- [ ] **Step 2: Rodar.** Expected: falha no import.
- [ ] **Step 3: Implementar** (`atacado.js`, `mlPost`, rascunho, esquema, falso). Anúncio gravado antes: `ligado: false` (regra 3).
- [ ] **Step 4: Rodar.** Expected: passa, inclusive os blocos antigos (o `atacado` é `.optional()` no esquema; `rascunhoDoAnuncio` sempre preenche).
- [ ] **Step 5: Commit** `feat(ml): precos de atacado (regras puras, cliente e rascunho)`.

---

### Task 9: Atacado no Publicar, no "!" e no Enviar mudanças

**Files:**
- Modify: `src/lib/canaisDeVenda/ml/etapas.js` (`ETAPAS`: `atacado` entre `ativar` e `gravar`, rótulo "Enviar os preços de atacado")
- Modify: `publicar.js` (etapa `atacado`: `rascunho.atacado?.ligado` → `enviarAtacadoML`; falha → `avisos.push(...)`, marca a etapa feita e segue; grava `publicacao.atacado = { faixas, em }` ou `{ erro, em }`; desligado → marca feita "desligado")
- Modify: `acompanhar.js` (`PARTES_DO_ANUNCIO` ganha `atacado`; `conteudoAtualDoAnuncio().atacado = impressaoDoAtacado(rascunho.atacado)`; nome "preços de atacado"); `etapasDoEnvio.js` (etapa "Enviar os preços de atacado"); `atualizar.js` (parte `atacado` → `enviarAtacadoML`; grava na impressão `impressaoDoAtacado` do que o ML devolveu)
- Modify: `impressao.js` se filtra chaves.
- Test: bloco "Atacado no Publicar e no Enviar mudanças"

**Interfaces:**
- Consumes: Task 8; `etapasDoAnuncio`; o fluxo de `publicarAnuncioML` do teste da fase 3.
- Produces: `publicacao.atacado`; a parte `atacado` nas mudanças (só quando a impressão tem a chave).

- [ ] **Step 1: Teste**: publicar um ZZ-ML (fluxo da fase 3 no arquivo) com `atacado` ligado → o ML falso tem 4 faixas no item e `publicacao.feitas` inclui `atacado`; com o falso configurado para recusar (`opcoes.recusarAtacado = true`) → publicação `ok: true`, `avisos` com /atacado/, `feitas` COM `atacado` (senão o Retomar repete) e `publicacao.atacado.erro`; e `mudancasDoAnuncio` acende `atacado` porque a impressão gravou `enviado.atacado = { ligado: false, faixas: [] }`. Mudar `rascunho.atacado.faixas[0].percentual` para 5 e `enviarMudancasML` → POST novo com 5% na faixa 2; desligar → POST `[]` e impressão `ligado: false`.
- [ ] **Step 2: Rodar.** Expected: falha ("atacado" não está em `feitas`).
- [ ] **Step 3: Implementar.** Item pausado (`aguardandoEstoque`): se a Task 0 mediu que a recomendação não responde em pausado, pular com aviso e deixar `publicacao.atacado = { pendente: true }` para o worker (`ativarAnunciosAguardandoEstoque`, onde estiver) chamar `enviarAtacadoML` depois de ativar; se respondeu, nada disso (ruling na ledger).
- [ ] **Step 4: Rodar o teste inteiro.** Expected: passa.
- [ ] **Step 5: Commit** `feat(ml): atacado no Publicar, no "!" e no Enviar mudancas`.

---

### Task 10: Cartão "Preços de atacado" na aba Preço

**Files:**
- Create: `src/components/anuncios/ml/AtacadoDoML.jsx`
- Modify: `AbaPrecoEstoque.jsx` (o cartão entra como 2ª `SecaoDoAnuncio`, depois de "Preço e custos")
- Modify: `acoes.js` (`recomendacaoDeAtacadoMLAcao(anuncioId, { preco })` → `{ ok, recomendacoes }`, só para anúncio com `idExterno`)
- Modify: `src/lib/canaisDeVenda/ml/validacao.js` (faixas repetidas ou % não crescente → problema na aba `preco`)
- Test: 2 asserções no bloco da Task 8

**Interfaces:**
- Consumes: Task 8–9; `alterar({ atacado })`.
- Produces: nada para outras tasks.

- [ ] **Step 1: Teste da validação**: `validarRascunhoML(rascunho com faixas [2: 5%, 2: 6%])` → problema com texto "As faixas de atacado precisam de quantidades diferentes e desconto crescente."; `[2: 5%, 5: 3%]` → o mesmo; `[2: null, 5: null]` → sem problema (o % vem da recomendação).
- [ ] **Step 2: Rodar.** Expected: falha.
- [ ] **Step 3: Implementar a validação e a tela**: título "Preços de atacado (Exclusivo negócios)", interruptor "Oferecer preço de atacado"; com ligado, 4 linhas `quantidade` (inteiro 1–100) e `%` (decimal, 2 casas) editáveis (`filtrarDecimal`), e a coluna "Preço" calculada `preco × (1 − %/100)` (`tabular-nums`); bolha "i": "O % vem da recomendação do Mercado Livre na publicação; abaixo do recomendado o ML recusa. Só compradores com CNPJ veem." Anúncio publicado: botão `Recomendação do ML` (chama a ação e preenche os % vazios ou menores). Linha com quantidade vazia some ao salvar.
- [ ] **Step 4: Rodar o teste; conferir no navegador** (anúncio novo: cartão ligado com 4 faixas e % vazio; anúncio antigo: desligado). `make-interfaces-feel-better`.
- [ ] **Step 5: Commit** `feat(ml): cartao Precos de atacado na aba Preco`.

---

### Task 11: Documentação, lint e fechamento

**Files:**
- Modify: `CLAUDE.md` (seção nova "Anúncios do ML pelo lucro da loja (08/11/2026)" na área do Mercado Livre: as 8 regras, os módulos, o que foi medido na Task 0, o que NÃO foi visto na tela; e a linha do `teste:anuncios-ml` com a contagem nova)
- Memória: `regra-anuncios-por-produto-ml.md` e `projeto-precos-de-atacado-ml.md` (estado: implementado, SEM deploy)

- [ ] **Step 1:** `npm run lint` → sem erro. `npm run teste:anuncios-ml` → sem falhas; anotar a contagem.
- [ ] **Step 2:** Escrever a seção do CLAUDE.md (curta: regras, arquivos, medições, pendências).
- [ ] **Step 3: Commit** `docs(claude): anuncios do ML pelo lucro da loja`.
- [ ] **Step 4:** Entregar ao dono "O que foi feito" + "Testes que você precisa fazer" (abrir um anúncio e o botão; kit com o lucro por unidade; popup Faltam/Criar; Reaproveitar num produto com anúncio antigo; Publicar um novo com atacado e conferir no ML/Bling), sem deploy.
