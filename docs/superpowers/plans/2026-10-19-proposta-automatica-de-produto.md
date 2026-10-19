# Proposta automática de produto — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a sessão do Claude preenche uma **proposta** por produto (descrição, títulos, fotos, campos, preço, EAN,
documentos, relatório) pelo script por SSH, e o dono revisa, aplica ao formulário, salva e aprova com o Conferido.

**Architecture:** uma tabela `PropostaDeProduto` (JSON por seção) e a pasta `dados/produtos/<SKU>/proposta/`;
regras puras em `src/lib/proposta/` (preço, medidas, NCM, assinaturas), gravação em `src/lib/proposta/banco.js`
usada pelo script e pelas Server Actions; a tela lê a proposta e só preenche o formulário (nada grava até o Salvar);
o Conferido apaga a proposta, avisando antes quando há item não aplicado.

**Tech Stack:** Next.js 16 (Server Actions), React 19, Prisma 7 (migration à mão), Node 24, `sharp` já instalado.

**Spec:** `docs/superpowers/specs/2026-10-16-proposta-automatica-de-produto-design.md`

## Global Constraints

- Sem chamada à API da Anthropic/OpenAI do Rise em nenhum passo do fluxo.
- Nada muda em `Produto` nem em `ProdutoArquivo` até o Salvar do dono; o Conferido é a aprovação.
- Candidatas de foto **não** são linhas de `ProdutoArquivo`; toda leitura de foto continua filtrando `papel: "FOTO"`.
- Migration só aditiva, escrita à mão (`migrate diff`, tirando as linhas `DROP INDEX` dos índices que só existem no SQL).
- Texto de tela com acento; identificadores e comentários sem acento. Padrão visual (10 regras do CLAUDE.md).
- Script roda na VPS pela entrada do SSH, dentro do contêiner `app`, nunca lê nem imprime segredo.
- Rota da pasta `proposta/` só com login (não entra na lista pública do Caddy: o Caddyfile não muda).
- Preço: margem = `calcularMargem` (`src/lib/margem.js`); posição = `posicaoDePreco` (`src/lib/posicaoDePreco.js`).

## Review Focus

1. Plano JSON com seção desconhecida ou com `fotos.escolhidas` fora de 6 a 8: o script recusa antes de escrever
   (teste em Task 4).
2. Produto Conferido: `proposta` e `gravar` recusam sem tocar em nada (Task 4).
3. Conferido desligado e religado com proposta já apagada: não recria nada e não dá erro (Task 9).
4. Candidata com nome que não é 32 hex + `.jpg` na URL: a rota responde 400, nunca lê fora da pasta (Task 3).
5. Preço quando nem 40% chega aos 5 primeiros, ou sem custo: sem recomendada, com o motivo (Task 1).

---

## Parte 1 — banco, regras e script (a sessão já consegue propor)

### Task 1: regras puras de preço, medidas e NCM

**Files:**
- Create: `src/lib/proposta/regras.js` (sem imports além de `@/lib/margem` e `@/lib/posicaoDePreco`)
- Create: `scripts/teste-proposta.js`; `package.json` ganha `"teste:proposta": "node scripts/teste-proposta.js"`

**Interfaces (produz):**
- `precoParaMargem(custo, margem)` → `number|null` (centavos arredondados para cima; `custo ÷ (1 − IMPOSTO_PADRAO − margem/100)`; `null` sem custo ou margem ≥ 94).
- `opcoesDePreco(custo, concorrentes)` → `{ opcoes: [{ margem, preco, posicao }], recomendada: { margem, preco, posicao } | null, motivoSemRecomendada: string|null }`. `opcoes` tem 40, 50 e 60; `posicao` é o retorno de `posicaoDePreco`. A recomendada é a **maior margem, em passos de 1%, de 1 a 93**, cuja posição é ≤ 5; `null` com `motivoSemRecomendada` "sem custo do fornecedor padrão" ou "nem com margem de 1% o produto fica entre os 5 primeiros".
- `escolherMedidas(porLoja)` com `porLoja = [{ loja, pesoKg, alturaCm, larguraCm, comprimentoCm, fabricante?: boolean }]` → `{ valor: {...4 campos}, origem: string }|null`: a Usinainfo (loja comparada sem caixa, contém "usinainfo") vence quando tem o campo; senão o valor mais repetido por campo; empate, o do `fabricante`; nenhum, `null`.
- `escolherNcm(porFornecedor)` com `[{ fornecedor, ncm }]` → `{ ncm, origem }|null`: Fortek primeiro (nome contém "fortek"); senão o mais repetido; empate, o primeiro da lista.
- `origemFiscal(temFornecedor)` → `2 | 0`.

- [ ] **Step 1: escrever `scripts/teste-proposta.js`** no molde de `scripts/teste-fundo-da-janela.js` (`conferir(nome, condicao)`, contagem no fim), com os blocos:
  - `precoParaMargem(18.9, 60)` = `55.59` (18,9 ÷ 0,34 = 55,588… → 55,59); `precoParaMargem(0, 40)` = `null`; `precoParaMargem(10, 94)` = `null`.
  - `opcoesDePreco(18.9, [{loja:"A",preco:30},{loja:"B",preco:40},{loja:"C",preco:50},{loja:"D",preco:60},{loja:"E",preco:70},{loja:"F",preco:80}])`: 3 opções com margens `[40,50,60]`; a recomendada tem `posicao.posicao <= 5` e nenhuma margem maior que a dela dá posição ≤ 5.
  - sem custo: `recomendada === null` e `motivoSemRecomendada` contém "custo".
  - concorrentes todos a R$ 10 com custo 18,9: `recomendada === null`, motivo contém "5 primeiros".
  - `escolherMedidas` com Usinainfo e 3 outras lojas iguais entre si e diferentes dela: vence a Usinainfo, `origem` contém "Usinainfo"; sem a Usinainfo: vence a repetida; só uma loja `fabricante` e outra não, valores diferentes, sem repetição: vence a fabricante.
  - `escolherNcm([{fornecedor:"Santana",ncm:"8471.80.00"},{fornecedor:"Fortek",ncm:"8542.31.90"}])` = Fortek; sem Fortek com `["A":x,"B":y,"C":y]` = y; `origemFiscal(true)===2`, `origemFiscal(false)===0`.
- [ ] **Step 2:** `npm run teste:proposta` → falha com "Cannot find module".
- [ ] **Step 3:** implementar `src/lib/proposta/regras.js` com as cinco funções acima.
- [ ] **Step 4:** `npm run teste:proposta` → todas passam; `npm run lint`.
- [ ] **Step 5:** commit `Proposta de produto: regras de preço, medidas e NCM`.

### Task 2: banco — tabela `PropostaDeProduto` e migration

**Files:**
- Modify: `prisma/schema.prisma` (modelo novo + relação em `Produto`)
- Create: `prisma/migrations/20261019_proposta_de_produto/migration.sql`

**Interfaces (produz):** modelo
```prisma
model PropostaDeProduto {
  id              String   @id @default(cuid())
  produtoId       String   @unique
  produto         Produto  @relation(fields: [produtoId], references: [id], onDelete: Cascade)
  versaoDoRoteiro String   @default("1")
  secoes          Json     // { descricao, titulos, fotos, campos, preco, ean, documentos, relatorio }
  aplicadas       Json     @default("{}")  // { [secao]: assinatura do valor aplicado ao formulario }
  criadaEm        DateTime @default(now())
  atualizadaEm    DateTime @updatedAt
}
```
- [ ] **Step 1:** editar o schema; `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script > prisma/migrations/20261019_proposta_de_produto/migration.sql`; abrir o SQL e **remover todo `DROP INDEX`** (índices que só existem no SQL: `Job_fonte_aberta`, trigramas, `Anuncio_um_por_produto`, `ProdutoColetado_coletadoEm_idx`, `ConhecimentoIA_busca_trgm`, os três da busca ampla). Deve sobrar só `CREATE TABLE`, `CREATE UNIQUE INDEX` e `ALTER TABLE ... FOREIGN KEY`.
- [ ] **Step 2:** `npx prisma migrate deploy && npx prisma generate`; reiniciar o servidor de desenvolvimento se estiver no ar.
- [ ] **Step 3:** no `scripts/teste-proposta.js`, bloco "banco": criar produto `ZZ-PROP-1`, `prisma.propostaDeProduto.create({ data: { produtoId, secoes: { titulos: { opcoes: [] } } } })`, ler de volta, apagar o produto e conferir que a proposta sumiu (`findUnique` → `null`). Limpeza em `finally` (apaga `ZZ-PROP-*`).
- [ ] **Step 4:** `npm run teste:proposta` → passa.
- [ ] **Step 5:** commit `Proposta de produto: tabela e migration`.

### Task 3: disco e rota da pasta `proposta/`

**Files:**
- Modify: `src/lib/arquivos.js` (depois de `PASTA_RESERVA`/`caminhoDaReserva`)
- Modify: `src/app/api/arquivos/[...caminho]/route.js:56` (ramo novo, igual ao da reserva)
- Modify: `scripts/teste-imagens.js` (bloco do guarda `nenhuma leitura de foto sem filtrar papel`: nada muda, só confirmar que passa)

**Interfaces (produz):**
- `export const PASTA_PROPOSTA = "proposta"`; `caminhoDaProposta(sku, nome)` → caminho absoluto ou `null` (nome só `^[0-9a-f]{32}\.(jpg|pdf)$`); `urlDaProposta(sku, nome)` → `/api/arquivos/<sku>/proposta/<nome>`; `apagarPastaDaProposta(sku)` (rm recursivo, `force`).

- [ ] **Step 1:** em `scripts/teste-proposta.js`, bloco "disco": `caminhoDaProposta("100103","../x.jpg") === null`; `caminhoDaProposta("100103","abc.jpg") === null`; nome válido devolve caminho que termina em `proposta/<nome>`; `urlDaProposta` monta a URL.
- [ ] **Step 2:** rodar → falha (export inexistente).
- [ ] **Step 3:** implementar em `arquivos.js`; na rota, ramo `if (pasta === PASTA_PROPOSTA)` servindo `image/jpeg` ou `application/pdf` pela extensão, `Cache-Control` imutável, 400 em nome inválido, 404 sem arquivo.
- [ ] **Step 4:** `npm run teste:proposta` e `npm run teste:imagens` → passam. **Não** mexer no `Caddyfile`: a lista pública só tem `imagens|documentos|certificados`, então `proposta` já cai no login.
- [ ] **Step 5:** commit `Proposta de produto: pasta proposta/ e rota com login`.

### Task 4: gravação da proposta e os comandos `proposta` do script

**Files:**
- Create: `src/lib/proposta/banco.js`
- Create: `src/lib/proposta/plano.js` (validação pura do plano, sem imports)
- Modify: `scripts/preencher-produto.js` (comandos `proposta`; `gravar` recusa proposta aberta; cabeçalho e uso)

**Interfaces (produz):**
- `validarPlano(plano)` → `{ ok: true, secoes: string[] } | { ok: false, erro }`. Seções aceitas: `descricao, titulos, fotos, campos, preco, ean, documentos, relatorio`. Regras: `titulos.opcoes` com exatamente 3 textos ≤ 60 e um `recomendada` (índice 0..2); `fotos.candidatas[]` com `{ id, origem: { loja, url }, escolhida: boolean, ordem?: number, motivo: string }` e **6 a 8** escolhidas (menos de 6 só se `candidatas.length < 6`, aviso); `preco` no formato de `opcoesDePreco`; `campos` com chaves entre `marca, modelo, unidade, garantiaMeses, codigo, ncm, origem, pesoKg, alturaCm, larguraCm, comprimentoCm`, cada uma `{ valor, origem }`; `ean` `{ escolhido: {valor, origem} | null, descartados: [{ valor, motivo }] }`.
- `gravarProposta(sku, planoDaSecao, { bytesDasFotos?: Map<id, Buffer>, bytesDosDocumentos?: Map<id, Buffer> })` → `{ ok, secoes }`: cria ou **substitui a seção** em `secoes`; fotos passam por `padronizarImagem` e vão para `proposta/<32hex>.jpg` (o nome volta em `candidatas[].arquivo`); documentos (PDF, conferido pelos bytes `%PDF`) para `proposta/<32hex>.pdf`. Recusa produto Conferido e produto inexistente. Arquivos antes, banco depois; se o banco falhar, apaga os arquivos novos.
- `lerProposta(sku)` → a linha ou `null`; `apagarProposta(produtoId, sku)` → apaga linha e pasta.
- `secoesNaoAplicadas(proposta, produto)` → `string[]` (seção presente em `secoes` cuja assinatura em `aplicadas` falta ou difere de `assinaturaDaSecao(secao, produto)`); `assinaturaDaSecao(secao, produto)` → string (sha1 do JSON dos campos do produto que a seção alimenta: `descricao` → `descricaoBase`; `titulos` → `tituloBase`; `campos` → os campos listados; `preco` → `precoVenda`; `ean` → `ean`; `fotos` → os nomes das fotos FOTO em ordem (passados em `produto.fotos`); `documentos` e `relatorio` nunca pendentes).
- Script: `proposta <sku> --plano=<json>` (o JSON é `{ secao, ...conteudo, arquivos?: { "<id>": "<base64>" } }`), `proposta <sku> --ler`.

- [ ] **Step 1:** testes em `scripts/teste-proposta.js`: `validarPlano` recusa seção desconhecida, 3 títulos com um de 61 caracteres, `fotos` com 5 escolhidas entre 10 candidatas e com 9 escolhidas; aceita 7 de 12. Banco: `gravarProposta("ZZ-PROP-1", {secao:"titulos",...})` cria; segunda chamada com `secao:"preco"` mantém `titulos`; terceira com `secao:"titulos"` substitui; produto com `conferido: true` → `ok: false` e nada escrito; `fotos` com 1 candidata PNG falsa (gerada com `sharp`, 600x400) → arquivo `.jpg` 1024x1024 na pasta e `arquivo` preenchido; `secoesNaoAplicadas` lista `titulos` antes e vazio depois de `aplicadas.titulos = assinaturaDaSecao("titulos", produto)`; `apagarProposta` tira linha e pasta.
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** implementar `plano.js` e `banco.js`; no script, o comando `proposta` lê o plano do caminho, converte `arquivos` base64 em `Map`, chama `gravarProposta`, imprime `{ ok, secoes }`; `--ler` imprime `lerProposta`. O `gravar` recusa quando `lerProposta(sku)` não é nulo ("há proposta aberta: use proposta ou apague-a").
- [ ] **Step 4:** `npm run teste:proposta` e `npx eslint scripts/preencher-produto.js src/lib/proposta` → passam. Teste real no PC: `node scripts/preencher-produto.js proposta ZZ-PROP-1 --ler`.
- [ ] **Step 5:** commit `Proposta de produto: gravação e comandos do script`.

### Task 5: roteiro fixo da sessão e documentação

**Files:**
- Create: `docs/superpowers/roteiros/proposta-de-produto.md`
- Modify: `CLAUDE.md`, seção "Preencher produto pelo servidor" ("Comandos hoje": `ler`, `ofertas`, `descricao`, `gravar`, `proposta`; link para a spec e o roteiro)

- [ ] **Step 1:** escrever o roteiro com os 12 passos da spec na ordem, cada um com: entrada (comando do script), critério, o que vai no JSON da seção (nomes da Task 4), e o aviso de direitos das fotos. Incluir o modelo de JSON de cada seção e o comando SSH completo.
- [ ] **Step 2:** atualizar o CLAUDE.md (só esse trecho; conferir `git diff` do arquivo antes do commit, porque outra sessão pode ter hunks nele; commitar pelo método do blob se houver).
- [ ] **Step 3:** commit `Proposta de produto: roteiro da sessão e CLAUDE.md`.

### Task 6: primeira proposta real (teste de ponta a ponta da Parte 1)

- [ ] **Step 1:** o dono diz "sobe"; deploy pelo cartão "Atualizar a VPS" (aplica a migration com backup).
- [ ] **Step 2:** a sessão segue o roteiro no `100103-teste` (ou outro produto que o dono indicar) e grava as 8 seções pelo SSH; `proposta <sku> --ler` mostra tudo.
- [ ] **Step 3:** registrar no roteiro o tempo gasto e o que faltou.

## Parte 2 — tela e Conferido

### Task 7: leitura da proposta para a tela e "Aplicar"

**Files:**
- Modify: `src/lib/produtoParaFormulario.js` (`carregarProdutoParaFormulario` devolve `proposta: { secoes, naoAplicadas, urls }` ou `null`; `urls` = `urlDaProposta` de cada candidata e documento)
- Create: `src/app/produtos/acoes-proposta.js` (`"use server"`: `marcarSecaoAplicada(produtoId, secao)` grava `aplicadas[secao] = assinaturaDaSecao(...)` do produto **gravado**; chamada pelo `salvarProduto` no fim, para as seções que a tela mandou no campo oculto `propostaAplicada` (lista de seções); `apagarPropostaDoProduto(produtoId)`)
- Modify: `src/app/produtos/acoes.js` (`salvarProduto` lê `propostaAplicada` e chama `marcarSecaoAplicada` na mesma transação)
- Create: `src/components/produtos/QuadroDaProposta.jsx`
- Modify: `src/components/produtos/FormularioProduto.jsx` (renderiza o quadro acima do primeiro bloco; função `aplicarProposta(secoes)`, no molde do `aplicar` da busca por código: escreve nos campos pelo `setVersao`/`trazidos`, marca `alterado`, guarda `propostaAplicada` num estado que vai no `FormData`)

**Interfaces (consome):** `lerProposta`, `secoesNaoAplicadas`, `assinaturaDaSecao` (Task 4); `urlDaProposta` (Task 3).

- [ ] **Step 1:** teste de regra pura em `teste-proposta.js`: `camposDoFormularioDaProposta(secoes, escolhas)` (função pura nova em `src/lib/proposta/aplicar.js`) devolve `{ tituloBase, descricaoBase, marca, modelo, unidade, garantiaMeses, precoVenda, ean, ncm, origem, pesoKg, alturaCm, larguraCm, comprimentoCm }` só com o que a proposta tem; `escolhas.titulo` (índice) escolhe a opção; sem `escolhas.titulo`, a recomendada; `escolhas.preco` (margem) escolhe a opção de preço, padrão a recomendada; `codigo` só entra quando `produto.sku` está vazio.
- [ ] **Step 2:** rodar → falha; implementar `aplicar.js`; passa.
- [ ] **Step 3:** `QuadroDaProposta`: antes de desenhar, escrever a linha "nesta tela o operador precisa ver primeiro o que a proposta tem por seção e a ação principal é Aplicar escolhidos ao formulário"; chamar `frontend-design` com as 10 regras. Uma linha por seção (nome, resumo de uma frase, estado "aplicada"/"pendente", botão "Ver" que abre uma janela com as opções, lojas e links de origem); ação principal "Aplicar escolhidos ao formulário"; o resto em menu ⋮ ("Apagar proposta", com pop-up listando as seções).
- [ ] **Step 4:** ligar no `FormularioProduto`: o quadro só aparece com `proposta`; `aplicarProposta` preenche os campos (sem gravar), e o Salvar manda `propostaAplicada`. Na lista "Escolher o título", as 3 opções entram no topo com a tag "IA" e a recomendada com o selo "recomendada" (fonte: `proposta.secoes.titulos`).
- [ ] **Step 5:** conferir no navegador (`preview_start`) com `ZZ-PROP-1` e uma proposta gravada pelo script no PC: quadro aparece, Aplicar preenche, Salvar grava e a seção fica "aplicada"; `npm run lint`; `ecc:make-interfaces-feel-better`.
- [ ] **Step 6:** commit `Proposta de produto: quadro no cadastro e Aplicar`.

### Task 8: candidatas na aba Imagens

**Files:**
- Modify: `src/components/produtos/PainelDeImagens.jsx` (bloco "Propostas (N)" com miniaturas `FotoComLupa`, check das escolhidas e "Aplicar fotos")
- Modify: `src/app/produtos/acoes-proposta.js` (`trazerFotosDaProposta(lote, sku, ids)`: copia `proposta/<arquivo>.jpg` para o lote temporário como candidatas **validadas** na ordem, pelo mesmo caminho de `importarImagensDaOrigem`)

- [ ] **Step 1:** teste em `teste-imagens.js` (bloco novo): `trazerFotosDaProposta` com 2 ids devolve 2 imagens `finalizada: true`, na ordem pedida, e um id inexistente é ignorado com aviso.
- [ ] **Step 2:** rodar → falha; implementar; passa.
- [ ] **Step 3:** tela: o bloco mostra as candidatas com check (estado local a partir de `escolhida`), "Aplicar fotos" chama a ação e as põe no painel como validadas, atrás das já validadas (`finalizar` com `manterLugar`); as fotos atuais que não estão na ordem da proposta ficam sem check (a regra "só a validada fica" as leva para a reserva no Salvar, porque têm `versao original` sem versão paga… **conferir**: `reconciliarImagensDoProduto` apaga a não validada sem versão paga; a spec quer **reserva**. Ajustar: a ação marca as atuais não escolhidas com `paraReserva: true` no lote, e `reconciliar` as desce para RESERVA em vez de apagar quando a marca existe. Teste em `teste-imagens.js`: foto atual não validada com `paraReserva` vira RESERVA.)
- [ ] **Step 4:** conferir no navegador; `npm run teste:imagens`; lint.
- [ ] **Step 5:** commit `Proposta de produto: candidatas na aba Imagens`.

### Task 9: Conferido apaga a proposta, avisando antes

**Files:**
- Modify: `src/app/produtos/acoes.js:1062` (`alternarConferido(id, valor, { apagarProposta = false } = {})`: com `valor` true e proposta existente, se `secoesNaoAplicadas` não está vazio e `apagarProposta` é false → `{ ok: false, pendentes: [...] }`; senão confere e apaga a proposta na mesma transação (linha) e a pasta depois)
- Modify: `src/components/produtos/ConferidoProduto.jsx` (depois do código: se a ação devolve `pendentes`, pop-up "Há N itens da proposta não aplicados" listando as seções, botões **Voltar** (foco) e **Conferir e apagar**, que repete a ação com `apagarProposta: true`; `propsDoFundo`, `role="alertdialog"`)

- [ ] **Step 1:** teste em `teste-proposta.js`: produto com proposta e `titulos` pendente → `alternarConferido(id, true)` devolve `pendentes: ["titulos"]` e o produto segue não conferido; com `{ apagarProposta: true }` → conferido e `lerProposta` nulo e pasta inexistente; sem pendência → confere e apaga direto; desligar e religar sem proposta → `ok: true`.
- [ ] **Step 2:** rodar → falha; implementar; passa (a ação roda fora do Next no teste? `revalidatePath` impede: mover a lógica para `src/lib/proposta/conferir.js` `conferirComProposta(id, valor, opcoes)` e a Server Action só chama e revalida).
- [ ] **Step 3:** tela: pop-up; conferir no navegador.
- [ ] **Step 4:** commit `Proposta de produto: Conferido avisa e apaga a proposta`.

### Task 10: fechamento

- [ ] **Step 1:** `npm run lint`; `teste:proposta`, `teste:imagens`, `teste:extracao`, `teste:cadastros`.
- [ ] **Step 2:** CLAUDE.md: seção "Proposta automática de produto" (o que é, onde mora, regras que custaram pensar, o que não foi visto em servidor real), e a tabela "Rodar" com `teste:proposta`.
- [ ] **Step 3:** commit, push; roteiro de testes para o dono na tela (quadro, Aplicar, Escolher o título com IA, candidatas, Conferido com e sem pendência).

## Self-review

- Spec coberta: descrição/títulos/fotos/campos/preço/EAN/documentos/relatório (Task 4 e roteiro Task 5); Usinainfo e Fortek (Task 1); tela (7, 8); Conferido com aviso (9); rota com login (3); sem API (roteiro). EAN e descrição não têm código novo: são trabalho da sessão, gravado como seção.
- Nomes consistentes: `gravarProposta`, `lerProposta`, `apagarProposta`, `secoesNaoAplicadas`, `assinaturaDaSecao`, `urlDaProposta`, `PASTA_PROPOSTA`.
- Ponto em aberto marcado na Task 8 (reserva das atuais não escolhidas) resolvido dentro da task.
