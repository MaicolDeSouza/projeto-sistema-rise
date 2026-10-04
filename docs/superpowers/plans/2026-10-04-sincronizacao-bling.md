# Sincronização Rise ↔ Bling: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o ícone do Bling na lista de Produtos mostrar o estado de sincronização e abrir um pop-up que envia o cadastro do Rise e os ajustes de estoque ao Bling, com o estoque do Bling lido por um botão na lista.

**Architecture:** Regras puras e sem rede em `src/lib/blingSync/` (normalização, assinatura, diferenças, corpo do envio, estoque, estado do ícone), testadas por `npm run teste:bling-sync`. Funções de banco e de rede no mesmo diretório recebem o **cliente do Bling por parâmetro** (contrato `{ get, post, put, exigirEscrita }`); os testes passam um Bling falso em memória, e a produção passa `clienteBling()`. As Server Actions de `src/app/produtos/acoes-bling.js` só chamam essas funções e revalidam a lista. Tela: `IconeBling`, `JanelaBling` e `BotaoSincronizarEstoque`.

**Tech Stack:** Next.js 16 (App Router), React 19, JavaScript, Prisma 7 + PostgreSQL 17, Tailwind 4, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-04-sincronizacao-bling-design.md` (commit `9c997fe`). A spec, §9, pede uma investigação na API real antes de implementar; ela é a Tarefa 1. O plano assume os formatos de **leitura** que o importador já usa e marca como "a confirmar" os de **escrita**.

## Decisões deste plano (onde a spec deixava uma escolha)

- **Bling falso em memória, não servidor HTTP.** A spec diz "Bling falso local, no molde da loja falsa". Como as funções recebem o cliente por parâmetro, o falso é um objeto que implementa o mesmo contrato; testa a mesma lógica sem porta, sem processo e sem rede.
- **Ícone = cor + selo, independentes.** Cinza = nunca sincronizado; verde = já sincronizado. O selo "?" aparece **sobre** o ícone (cinza ou verde) quando há divergência de campos ou ajuste pendente. Foi o que o dono descreveu ("verde" depois de sincronizar; "ícone em cima" quando há divergência).
- **Fornecedor do Rise sem CNPJ fica fora da assinatura**, porque não pode ser enviado; senão o selo ficaria para sempre.
- **`estoqueDoRise` aplica os ajustes pendentes na ordem** sobre o saldo do Bling (entrada soma, saída tira, balanço define). "Saldo do Bling + ajustes" da spec não é uma soma simples quando há balanço.
- **O resumo "campo: de → para" mora na própria cópia de segurança** (`BlingCopiaProduto.alteracoes`), e a cópia só é gravada **depois** de o envio dar certo.

## Global Constraints

- **Pasta e branch:** tudo na pasta principal (`C:\00-Dev\Projeto_sistema_Rise\sistema-rise`), branch `main`. Antes de cada commit, `git branch --show-current` tem que dizer `main`.
- **Commit só dos arquivos da tarefa, pelo nome.** Nunca `git add -A` nem `git add .`. Nunca comitar `.env`, `certificates/`, `dados/`. Mensagem em português, terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- **JavaScript**, sem TypeScript. Identificadores e comentários em português **sem acento**; comentário explica o porquê. **Texto da tela sem acento** (`Descricao`, `Preco`), como o resto do sistema.
- **A escrita no Bling só liga depois do teste com 1 produto de teste (Tarefa 12).** Até lá `BLING_ESCRITA` fica `false` e nenhum código liga a trava. Os testes automáticos nunca falam com o Bling real.
- **Campos enviados:** nome, descrição, preço, marca, EAN, unidade, peso, medidas, vídeo, estoque mínimo e máximo, localização, fiscais (origem, NCM, CEST, tipo SPED, % de tributos) e **todos** os fornecedores do produto com código, descrição e custo (o padrão marcado). **Nunca enviados:** código, saldo de estoque, situação ativo/inativo, imagens, categorias, variações, composição, campos personalizados.
- **Vínculo = código (SKU).** Fornecedor ligado pelo **CNPJ**; contato criado no Bling se não existir; fornecedor sem CNPJ não é enviado e o pop-up avisa.
- **Campo vazio no Rise nunca apaga nada no Bling** e não conta como divergência.
- **Duas travas de escrita:** `BLING_ESCRITA` (existente) e a lista `BLING_ESCRITA_CODIGOS` (códigos liberados; com a lista presente, qualquer outro código é recusado).
- **Escrita nunca tenta de novo sozinha** (`tentativas: 1`); leitura pode repetir.
- **Cópia de segurança:** as **3 mais recentes** por produto, gravada só após o envio bem-sucedido.
- **Limite do Bling:** 3 chamadas por segundo da conta, pela fila de `src/lib/integracoes/httpClient.js` (`limitar`). Saldos pedidos em **lotes de 100**.
- **Estoque do Rise = saldo do Bling mais os ajustes pendentes**; o botão da lista é o **único** jeito de ler o saldo (nada automático, que fica para a VPS).
- **Decimal do Prisma vira `Number` no servidor** antes de ir para componente de cliente. Arquivo `"use server"` só exporta função assíncrona.
- **Next 16:** antes de escrever página ou rota, ler `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` e `07-mutating-data.md`. `searchParams` e `params` são Promises.
- **Migration:** `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, gravada à mão em `prisma/migrations/<nome>/migration.sql`, **sem** os `DROP INDEX` de `ProdutoColetado_buscaTexto_trgm` e `ProdutoColetado_coletadoEm_idx`; depois `npx prisma migrate deploy`, `npx prisma generate` e **reiniciar o servidor**. Regra do schema: conferir antes que as worktrees `sistema-rise-agente-1` e `sistema-rise-agente-2` não têm migration pendente.
- **Servidor de teste:** `preview_start` com o nome `sistema-rise` (porta 3000). Tela: popup no desenho do `Popup` de `src/components/produtos/EdicaoRapida.jsx`; nunca `confirm()` nativo.

## Review Focus

1. **Código com 0 ou 2+ produtos no Bling** (`GET /produtos?codigo=`): 0 oferece "Cadastrar no Bling"; 2+ **recusa** com mensagem e não escolhe um. Teste na Tarefa 7.
2. **Descrição do Rise com `<`, `&`, aspas e quebras `\r\n`:** vai escapada, nunca como HTML cru. Teste na Tarefa 4.
3. **Saída que o Bling recusa** (saldo dele menor que a saída): o envio para na primeira falha, o que já foi marcado como enviado fica, e os demais seguem pendentes na mesma ordem. Teste na Tarefa 9.
4. **CNPJ com pontuação, inválido ou repetido em dois vínculos do mesmo produto:** compara só os 14 dígitos; inválido conta como sem CNPJ; repetido envia uma vez. Teste na Tarefa 3.
5. **Sincronizar duas vezes seguidas (clique duplo):** a segunda não tem diferença e **não chama o PUT**. Teste na Tarefa 8.

---

### Tarefa 1: Investigação da API do Bling (só leitura)

**Files:**
- Create: `scripts/investigar-bling-sync.js`
- Create: `docs/superpowers/specs/2026-10-04-sincronizacao-bling-investigacao.md`

**Interfaces:**
- Consumes: `blingGet(caminho, params)` de `src/lib/integracoes/bling.js` (único import de rede; o script **não** importa `blingPost`/`blingPut`).
- Produces: o relatório, com as cinco seções da spec §9, cada uma marcada **"confirmado por leitura"** ou **"da documentação, não testado"**: (1) formato do `PUT /produtos/{id}`, campos somente-leitura e o que o corpo omitido zera; (2) imagens; (3) fornecedores do produto, `/contatos` (busca por CNPJ), `/depositos`; (4) `/estoques` (operações, depósito) e `/estoques/saldos` em lote, com o limite de ids; (5) o parâmetro `criterio` da listagem que devolve ativos **e** inativos (constante `CRITERIO_TODOS`, usada na Tarefa 9).

- [ ] **Step 1: Conferir branch e árvore.** `git branch --show-current` = `main`; `git status --short` sem arquivo desta feature. Linha de outro trabalho: não tocar.
- [ ] **Step 2: Escrever `scripts/investigar-bling-sync.js`.** Argumentos `--codigo=<sku>` e `--cnpj=<14 dígitos>`. Faz só `blingGet` e imprime, com `mascarar` de `httpClient.js`, as **chaves e o tipo** de cada valor (nunca o conteúdo de campos pessoais) de: `/produtos?codigo=`, `/produtos/{id}`, `/produtos/fornecedores?idProduto=`, `/depositos`, `/estoques/saldos` (com `idsProdutos[]`), `/contatos?numeroDocumento=`.
- [ ] **Step 3: Rodar em 2 produtos reais** (um com fornecedor, outro sem): `node scripts/investigar-bling-sync.js --codigo=<sku> --cnpj=<cnpj>`. Expected: impressão sem erro 4xx. Endpoint com 403 (escopo) vai para o relatório como bloqueio, como `/integracoes` já deu.
- [ ] **Step 4: Ler a documentação oficial** (`developer.bling.com.br`, com `WebFetch`) dos endpoints de **escrita**: `PUT` e `POST /produtos`, fornecedores do produto, `POST /contatos`, `POST /estoques`, imagens. Copiar os exemplos de corpo para o relatório, marcados "não testado".
- [ ] **Step 5: Escrever o relatório** com as cinco seções e uma lista "O que isto muda no plano" (formatos que contrariam o assumido nas Tarefas 4, 8 e 9). **Se contrariar, parar e avisar o dono antes da Tarefa 2.**
- [ ] **Step 6: Commit.** `git add scripts/investigar-bling-sync.js docs/superpowers/specs/2026-10-04-sincronizacao-bling-investigacao.md` e `git commit -m "Investigacao da API do Bling para a sincronizacao (leitura)"`.

---

### Tarefa 2: Banco, estado de sincronização, ajustes pendentes e cópia de segurança

**Files:**
- Modify: `prisma/schema.prisma` (modelos `Produto`, `MovimentoEstoque`; modelo novo `BlingCopiaProduto`)
- Create: `prisma/migrations/20261004_sincronizacao_bling/migration.sql`
- Create: `scripts/teste-bling-sync.js`
- Modify: `package.json` (script `teste:bling-sync`)

**Interfaces:**
- Produces: `Produto.blingSincronizadoEm DateTime?`, `Produto.blingAssinatura String?`, `Produto.blingSaldo Int?`; `MovimentoEstoque.enviadoAoBlingEm DateTime?` (nulo = pendente; **os movimentos já existentes recebem a data da migration**); `BlingCopiaProduto { id String @id @default(cuid()), produtoId String (relação com Produto, onDelete Cascade), criadoEm DateTime @default(now()), conteudo Json, alteracoes Json?, @@index([produtoId, criadoEm]) }` e `Produto.blingCopias BlingCopiaProduto[]`. O runner `scripts/teste-bling-sync.js` com `conferir(nome, obtido, esperado)` no desenho de `scripts/teste-estoque.js`, que as tarefas seguintes ampliam com um bloco cada (`limpar()` apaga produtos `ZZ-BS-*` e fornecedores `ZZ Teste BS*`).

- [ ] **Step 1: Conferir a regra do schema.** `git branch --show-current` = `main`; `git status --short` vazio; `git -C ../sistema-rise-agente-1 status --short` e `git -C ../sistema-rise-agente-2 status --short` sem mudança em `prisma/`. Se houver, **parar e avisar o dono.**
- [ ] **Step 2: Escrever o teste do banco (falha).** Bloco "Banco: estado do Bling": cria `ZZ-BS-1`; confere `blingSincronizadoEm`, `blingAssinatura` e `blingSaldo` nulos; cria um `MovimentoEstoque` pelo Prisma e confere `enviadoAoBlingEm === null`; cria 4 `BlingCopiaProduto` e confere a contagem; apaga o produto e confere que as cópias sumiram (`Cascade`). Acrescentar `"teste:bling-sync": "node scripts/teste-bling-sync.js"` ao `package.json`.
- [ ] **Step 3: Rodar e ver falhar.** `npm run teste:bling-sync`. Expected: FALHA (campos inexistentes).
- [ ] **Step 4: Mudar o schema e gerar a migration.** Adicionar os campos e o modelo (Interfaces), com comentário em cada um do porquê (assinatura = resumo dos campos no último envio; nulo em `enviadoAoBlingEm` = pendente). Gerar o SQL com `migrate diff`, tirar os dois `DROP INDEX`, e acrescentar no fim `UPDATE "MovimentoEstoque" SET "enviadoAoBlingEm" = (NOW() AT TIME ZONE 'UTC');` logo depois do `ADD COLUMN`, para os ajustes anteriores ficarem resolvidos (o `NOW()` do Postgres está em `America/Sao_Paulo`, por isso o `AT TIME ZONE 'UTC'`). Conferir que o SQL **não** tem `DROP TABLE`.
- [ ] **Step 5: Aplicar e regenerar.** `npx prisma migrate deploy` e `npx prisma generate`; reiniciar o servidor (`preview_stop` e `preview_start` com `sistema-rise`). Expected: `1 migration applied`.
- [ ] **Step 6: Rodar o teste.** Expected: todas as linhas `ok`, saída 0.
- [ ] **Step 7: Commit.** `git add prisma/schema.prisma prisma/migrations/20261004_sincronizacao_bling/migration.sql scripts/teste-bling-sync.js package.json` e `git commit -m "Banco: estado de sincronizacao com o Bling, ajustes pendentes e copia de seguranca"`.

---

### Tarefa 3: Normalização, assinatura e diferenças (regras puras)

**Files:**
- Create: `src/lib/blingSync/campos.js`
- Modify: `src/lib/integracoes/importarBling.js` (só acrescentar `export` a `htmlParaTexto`, `unidadeDe` e `emCm`)
- Modify: `scripts/teste-bling-sync.js`

**Interfaces:**
- Consumes: `htmlParaTexto(html)`, `unidadeDe(valor)`, `emCm(valor, unidadeMedida)` de `importarBling.js` (a mesma conversão da importação, para o Rise e o Bling serem lidos da mesma forma).
- Produces (todas puras):
  - `CAMPOS_DE_ENVIO: {id: string, rotulo: string}[]`: `nome`, `descricao`, `preco`, `marca`, `ean`, `unidade`, `peso`, `altura`, `largura`, `comprimento`, `video`, `estoqueMinimo`, `estoqueMaximo`, `localizacao`, `origem`, `ncm`, `cest`, `spedTipoItem`, `percentualTributos`.
  - `normalizarDoRise(produto): Record<campo, string|number|null>`: vazio vira `null`; preço em 2 casas, peso em 3, medidas em 2; marca em maiúsculas; texto aparado.
  - `normalizarDoBling(bling): Record<campo, string|number|null>`: mesmas regras; descrição por `htmlParaTexto(bling.descricaoCurta)`; peso = `pesoBruto ?? pesoLiquido`; medidas por `emCm`; unidade por `unidadeDe`; `estoque.minimo/maximo` zero vira `null`.
  - `normalizarFornecedoresDoRise(vinculos): {cnpj: string, nome: string, codigo: string|null, descricao: string|null, precoCusto: number|null, padrao: boolean}[]`: `cnpj` só com os 14 dígitos; descarta quem não tem CNPJ de 14 dígitos; um por CNPJ (repetido: fica o primeiro); ordenado por `cnpj`. Entrada: linhas de `ProdutoFornecedor` com `fornecedor: { cnpj, nome }`.
  - `fornecedoresSemCnpj(vinculos): string[]`: nomes dos descartados acima, para o aviso do pop-up.
  - `assinaturaDoRise(campos, fornecedores): string`: SHA-256 hex de um JSON de chaves em ordem fixa.
  - `diferencas(rise, bling): {campo, rotulo, rise, bling, tipo: "diferente"|"vazioNoRise"}[]`: só os campos que diferem; `vazioNoRise` quando o Rise é `null` e o Bling tem valor.
  - `contarDivergencias(lista): number`: só os de `tipo === "diferente"`.

- [ ] **Step 1: Escrever os testes (falham).** Bloco "Normalizacao e assinatura", com o Rise `{tituloBase: "Motor JGY370", descricaoBase: "Linha 1\nLinha 2", precoVenda: 90, marca: "Generica", unidade: "UN", pesoKg: 0.25, alturaCm: 3, larguraCm: 4.5, comprimentoCm: 10, ncm: "85011019", origem: 0}` e o Bling `{nome: "Motor JGY370", descricaoCurta: "<p>Linha 1<br>Linha 2</p>", preco: 90, marca: "GENERICA", unidade: "Un", pesoBruto: 0.25, dimensoes: {altura: 30, largura: 45, profundidade: 100, unidadeMedida: 2}, tributacao: {ncm: "85011019", origem: 0}, estoque: {minimo: 0, maximo: 0, localizacao: ""}}`. Asserções: `diferencas(normalizarDoRise(r), normalizarDoBling(b))` é `[]`; trocando o preço do Bling para 95 vem `[{campo: "preco", tipo: "diferente", rise: 90, bling: 95, ...}]`; Rise sem marca e Bling com `"X"` vem `tipo: "vazioNoRise"` e `contarDivergencias` dá 0; a assinatura é igual com as chaves do objeto em outra ordem; muda com `nome` diferente; **não** muda com `estoque`, `ativo` ou `sku` diferentes; muda com o `precoCusto` de um fornecedor. Fornecedores: `"12.345.678/0001-95"` vira `"12345678000195"`; CNPJ de 13 dígitos e `null` caem em `fornecedoresSemCnpj`; dois vínculos com o mesmo CNPJ viram um.
- [ ] **Step 2: Rodar e ver falhar.** `npm run teste:bling-sync`. Expected: FALHA (módulo inexistente).
- [ ] **Step 3: Implementar `src/lib/blingSync/campos.js`** com as assinaturas acima; `assinaturaDoRise` usa `node:crypto` e ordena as chaves de `CAMPOS_DE_ENVIO`; **a assinatura nunca inclui sku, estoque nem ativo**. Exportar os três helpers em `importarBling.js`.
- [ ] **Step 4: Rodar o teste.** Expected: `ok` em todas as linhas.
- [ ] **Step 5: Commit.** `git add src/lib/blingSync/campos.js src/lib/integracoes/importarBling.js scripts/teste-bling-sync.js` e `git commit -m "Sincronizacao Bling: normalizacao, assinatura e diferencas"`.

---

### Tarefa 4: Corpo do envio ao Bling (regras puras)

**Files:**
- Create: `src/lib/blingSync/corpo.js`
- Modify: `scripts/teste-bling-sync.js`

**Interfaces:**
- Consumes: `normalizarDoRise` (Tarefa 3); o formato do `PUT`/`POST` e a lista de campos somente-leitura **do relatório da Tarefa 1**.
- Produces:
  - `textoParaHtml(texto: string): string`: escapa `&`, `<`, `>`, `"` e `'`, normaliza `\r\n` e `\r` para `\n` e troca cada `\n` por `<br>`.
  - `montarCorpoDeAtualizacao(blingAtual: object, rise: object): object`: cópia profunda do produto lido no Bling, com **só** os campos do Rise **que têm valor** sobrescritos; remove os campos somente-leitura do relatório; nunca altera `codigo`, `situacao`, `categoria`, `variacoes`, `estrutura` nem campos personalizados.
  - `montarCorpoDeCadastro(sku: string, rise: object): object`: corpo do `POST /produtos`: `codigo` = `sku`, `tipo` `"P"`, `formato` `"S"`, `situacao` `"A"`, os campos de envio com valor, **sem** chave vazia e sem saldo de estoque.

- [ ] **Step 1: Escrever os testes (falham).** Bloco "Corpo do envio": `textoParaHtml("a<b & \"c\"\r\nd")` é `'a&lt;b &amp; &quot;c&quot;<br>d'`; `textoParaHtml("<script>x</script>")` não contém `<script`. Com um `blingAtual` que traz `categoria: {id: 7}`, `variacoes: [{id: 1}]`, `situacao: "A"`, `codigo: "ZZ-BS-1"` e `descricaoCurta: "<b>velha</b>"`, o corpo de atualização do Rise com nome novo e descrição `"nova\nlinha"`: mantém `categoria`, `variacoes`, `situacao` e `codigo`; `descricaoCurta` é `"nova<br>linha"`; `nome` é o novo; `dimensoes.unidadeMedida` é `1` com os valores em cm; `pesoLiquido` e `pesoBruto` iguais ao `pesoKg`. Campo `null` no Rise (marca) mantém o valor do Bling. O corpo de cadastro tem `codigo` e `tipo` e **nenhuma** chave com `null`/`undefined`.
- [ ] **Step 2: Rodar e ver falhar.** Expected: FALHA.
- [ ] **Step 3: Implementar `src/lib/blingSync/corpo.js`.** Seguir o formato do relatório da Tarefa 1; o mapeamento de nomes é o da spec §6 (`descricaoCurta`, `gtin`, `pesoLiquido`/`pesoBruto`, `dimensoes.profundidade` = comprimento, `midia.video.url`, `estoque.minimo/maximo/localizacao`, `tributacao.*`).
- [ ] **Step 4: Rodar o teste.** Expected: `ok`.
- [ ] **Step 5: Commit.** `git add src/lib/blingSync/corpo.js scripts/teste-bling-sync.js` e `git commit -m "Sincronizacao Bling: corpo do envio e escape da descricao"`.

---

### Tarefa 5: Estoque do Rise e estado do ícone (regras puras)

**Files:**
- Create: `src/lib/blingSync/estoque.js`
- Create: `src/lib/blingSync/estado.js`
- Modify: `scripts/teste-bling-sync.js`

**Interfaces:**
- Produces:
  - `estoqueDoRise(blingSaldo: number, pendentes: {tipo: "ENTRADA"|"SAIDA"|"BALANCO", quantidade: number}[]): number`: aplica os pendentes **na ordem recebida** sobre o saldo (entrada soma, saída tira, balanço define); nunca devolve menos que 0.
  - `estadoDoIconeBling({sincronizadoEm: Date|null, assinaturaGuardada: string|null, assinaturaAtual: string, pendentes: number}): {cor: "cinza"|"verde", divergente: boolean, motivos: ("campos"|"estoque")[]}`: `cor` é `"verde"` se `sincronizadoEm` existe; `motivos` leva `"campos"` quando sincronizado e as assinaturas diferem, e `"estoque"` quando `pendentes > 0`; `divergente` é `motivos.length > 0`.

- [ ] **Step 1: Escrever os testes (falham).** Bloco "Estoque e estado": `estoqueDoRise(10, [])` = 10; `(10, [{ENTRADA, 3}])` = 13; `(10, [{ENTRADA, 3}, {SAIDA, 1}])` = 12; `(10, [{SAIDA, 20}])` = 0; `(10, [{ENTRADA, 3}, {BALANCO, 7}, {SAIDA, 2}])` = 5. Estado: nunca sincronizado e sem pendente = `{cor: "cinza", divergente: false, motivos: []}`; nunca sincronizado com 1 pendente = cinza com `motivos: ["estoque"]`; sincronizado e assinaturas iguais = `verde` sem divergência; sincronizado com assinaturas diferentes = `verde`, `["campos"]`; sincronizado, diferentes e 2 pendentes = `["campos", "estoque"]`.
- [ ] **Step 2: Rodar e ver falhar.** Expected: FALHA.
- [ ] **Step 3: Implementar os dois arquivos** com as assinaturas acima.
- [ ] **Step 4: Rodar o teste.** Expected: `ok`.
- [ ] **Step 5: Commit.** `git add src/lib/blingSync/estoque.js src/lib/blingSync/estado.js scripts/teste-bling-sync.js` e `git commit -m "Sincronizacao Bling: estoque do Rise e estado do icone"`.

---

### Tarefa 6: Cliente do Bling, trava por código e Bling falso

**Files:**
- Modify: `src/lib/integracoes/config.js` (`travas.blingCodigosLiberados`)
- Modify: `src/lib/integracoes/bling.js` (`chamar` aceita `tentativas`; novos `blingPost` e `blingPut`)
- Create: `src/lib/blingSync/cliente.js`
- Create: `scripts/lib/blingFalso.js`
- Modify: `scripts/teste-bling-sync.js`

**Interfaces:**
- Produces:
  - `config.travas.blingCodigosLiberados: string[]`: lido de `BLING_ESCRITA_CODIGOS` (separado por vírgula, aparado, sem vazios; ausente = `[]`).
  - `blingPost(caminho, corpo)` e `blingPut(caminho, corpo)`: passam pela trava `BLING_ESCRITA` e chamam `requisitar` com **`tentativas: 1`**; devolvem `{ ok, status, duracaoMs, dados }`.
  - `clienteBling(): { get(caminho, params), post(caminho, corpo), put(caminho, corpo), exigirEscrita(codigo) }` em `cliente.js`: o contrato usado por **todas** as funções das Tarefas 7 a 9. `exigirEscrita` lança erro se a trava `BLING_ESCRITA` está desligada ou se a lista de liberados existe e não tem o `codigo` (sem diferenciar caixa).
  - `exigirCodigoLiberado(codigo: string, liberados: string[]): void` (exportada, usada por `exigirEscrita` e testada sozinha): lista vazia libera todos; senão o código tem que estar na lista, ou lança `Error` com `"nao esta na lista de codigos liberados"`.
  - `criarBlingFalso(opcoes?: {produtos?, contatos?, depositos?, saldos?, falhas?}): { get, post, put, exigirEscrita, chamadas: {metodo, caminho, corpo}[] }` em `scripts/lib/blingFalso.js`: guarda tudo em memória e responde, no formato `{ok, status, dados}` do `requisitar`, aos endpoints da Tarefa 1 (`/produtos?codigo=`, `/produtos/{id}` com `GET` e `PUT`, `POST /produtos`, `/produtos/fornecedores`, `/contatos`, `/depositos`, `/estoques/saldos`, `POST /estoques`, listagem paginada de `/produtos`); `falhas: [{metodo, caminho, status, mensagem}]` faz a chamada correspondente devolver `{ok: false, status, dados: {error: {description: mensagem}}}`; `exigirEscrita` do falso é um no-op.

- [ ] **Step 1: Escrever os testes (falham).** Bloco "Cliente e trava": `exigirCodigoLiberado("100246", [])` não lança; `("ZZ-TESTE", ["zz-teste"])` não lança (caixa); `("100246", ["ZZ-TESTE"])` lança com `/nao esta na lista de codigos liberados/`; com `config.travas.blingEscrita === false`, `await blingPut("/produtos/1", {})` rejeita com `/Escrita bloqueada/` **sem rede** (se a trava estiver ligada no `.env`, esta linha é pulada e o teste avisa); o falso devolve o produto cadastrado por código e registra a chamada em `chamadas`.
- [ ] **Step 2: Rodar e ver falhar.** Expected: FALHA.
- [ ] **Step 3: Implementar.** Em `bling.js`, `chamar` repassa `tentativas` a `requisitar`; `blingPost`/`blingPut` usam `tentativas: 1`. Em `config.js`, ler a lista **uma vez**. `clienteBling` monta o contrato com `blingGet`, `blingPost`, `blingPut`.
- [ ] **Step 4: Rodar o teste.** Expected: `ok`.
- [ ] **Step 5: Commit.** `git add src/lib/integracoes/config.js src/lib/integracoes/bling.js src/lib/blingSync/cliente.js scripts/lib/blingFalso.js scripts/teste-bling-sync.js` e `git commit -m "Sincronizacao Bling: cliente, trava por codigo e Bling falso para teste"`.

---

### Tarefa 7: Leitura para o pop-up

**Files:**
- Create: `src/lib/blingSync/leitura.js`
- Modify: `scripts/teste-bling-sync.js`

**Interfaces:**
- Consumes: `clienteBling`, `normalizarDoRise`, `normalizarDoBling`, `diferencas`, `normalizarFornecedoresDoRise`, `fornecedoresSemCnpj` (Tarefas 3 e 6).
- Produces:
  - `buscarNoBling(cliente, codigo: string): Promise<{situacao: "nao_existe"|"existe"|"duplicado", id?: number, produto?: object, quantidade?: number}>`: `GET /produtos?codigo=`; com 1 resultado lê o produto completo (`GET /produtos/{id}`); com 2 ou mais devolve `duplicado` **sem** escolher.
  - `lerParaPopup(produtoId: string, cliente = clienteBling()): Promise<{ok: boolean, erro?: string, sku: string, situacao: "nao_existe"|"existe"|"duplicado", diferencas: ReturnType<typeof diferencas>, iguais: number, avisos: string[], estoque: {blingSaldo: number|null, riseEstoque: number, pendentes: number}, escrita: {liberada: boolean, motivo: string|null}}>`: `avisos` leva, por exemplo, `"Fornecedor X nao tem CNPJ: nao sera enviado."`; `escrita.liberada` é `false` com o motivo quando a trava está desligada (a leitura funciona igual).

- [ ] **Step 1: Escrever os testes (falham).** Bloco "Leitura do pop-up", com produto `ZZ-BS-2` no banco e o Bling falso: código sem produto no falso → `situacao: "nao_existe"`; com um produto → `existe` e `diferencas` com o preço diferente; com **dois** produtos de mesmo código no falso → `duplicado` e `ok: false` com `erro` que cita "mais de um"; fornecedor sem CNPJ vinculado ao produto gera o aviso; `iguais` conta os campos iguais; `escrita.liberada === false` com a trava desligada.
- [ ] **Step 2: Rodar e ver falhar.** Expected: FALHA.
- [ ] **Step 3: Implementar `leitura.js`.** Ler o produto do Rise com `include: { fornecedores: { include: { fornecedor: { select: { cnpj: true, nome: true } } } }, movimentosEstoque: { where: { enviadoAoBlingEm: null } } }`.
- [ ] **Step 4: Rodar o teste.** Expected: `ok`.
- [ ] **Step 5: Commit.** `git add src/lib/blingSync/leitura.js scripts/teste-bling-sync.js` e `git commit -m "Sincronizacao Bling: leitura do produto para o pop-up"`.

---

### Tarefa 8: Envio dos campos, cadastro e cópia de segurança

**Files:**
- Create: `src/lib/blingSync/envio.js`
- Modify: `scripts/teste-bling-sync.js`

**Interfaces:**
- Consumes: Tarefas 3, 4, 6 e 7; `validar(produto)` de `src/lib/anuncios/canais/bling.js` (usado só para recusar o cadastro sem nome, SKU ou preço).
- Produces:
  - `sincronizarProduto(produtoId: string, cliente = clienteBling()): Promise<{ok: boolean, erro?: string, alterados: {campo: string, de: unknown, para: unknown}[], fornecedores: {enviados: number, avisos: string[]}}>`
  - `cadastrarNoBling(produtoId: string, cliente = clienteBling()): Promise<{ok: boolean, erro?: string, blingId?: number}>`
- Ordem de `sincronizarProduto`: (1) `cliente.exigirEscrita(sku)` **antes de qualquer chamada**; (2) `buscarNoBling`; (3) se não há diferença do tipo `"diferente"`, **não chama o PUT**; (4) senão `PUT /produtos/{id}` com `montarCorpoDeAtualizacao`; (5) só depois do PUT bem-sucedido grava a cópia (`conteudo` = produto do Bling como estava, `alteracoes` = a lista `alterados`) e apaga as mais antigas, mantendo **3**; (6) fornecedores: para cada um de `normalizarFornecedoresDoRise`, acha o contato por CNPJ (`GET /contatos?numeroDocumento=`), **cria** (`POST /contatos`) se não existir, e envia o vínculo; (7) **só se tudo deu certo** grava `blingAssinatura` (= `assinaturaDoRise`) e `blingSincronizadoEm`. Falha em qualquer etapa devolve `ok: false`, diz o que falhou e **não** avança a assinatura.
- `cadastrarNoBling`: recusa com a mensagem de `validar` se houver problema bloqueante; faz `POST /produtos` com `montarCorpoDeCadastro`, grava `Produto.blingId`, e executa as etapas 6 e 7 acima.

- [ ] **Step 1: Escrever os testes (falham).** Bloco "Envio dos campos", com o Bling falso: sem diferença nenhuma → `ok`, `alterados: []`, **nenhum** `put` em `falso.chamadas`, e `blingSincronizadoEm`/`blingAssinatura` gravados (ícone verde); com preço diferente → um `put`, `alterados` com `{campo: "preco", de: 95, para: 90}`, uma linha em `BlingCopiaProduto` com o `conteudo` antigo e as `alteracoes`; 5 sincronizações com mudança → só 3 cópias; **clique duplo** (segunda chamada logo depois) → segunda sem `put`; `PUT` com falha 400 → `ok: false`, `erro` com a mensagem do Bling, `blingAssinatura` **não** muda e **nenhuma** cópia é gravada; fornecedor com contato existente → vínculo enviado sem `POST /contatos`; sem contato → `POST /contatos` antes do vínculo; sem CNPJ → aviso e os outros seguem; falha no vínculo → `ok: false` com assinatura intacta; `cadastrarNoBling` de produto sem preço recusa sem `POST`; com tudo, grava `blingId`; código fora da lista liberada → recusa antes de qualquer chamada (`falso.chamadas.length === 0`).
- [ ] **Step 2: Rodar e ver falhar.** Expected: FALHA.
- [ ] **Step 3: Implementar `envio.js`** com a ordem acima; **nunca** repetir uma escrita que falhou.
- [ ] **Step 4: Rodar o teste.** Expected: `ok`.
- [ ] **Step 5: Commit.** `git add src/lib/blingSync/envio.js scripts/teste-bling-sync.js` e `git commit -m "Sincronizacao Bling: envio dos campos, cadastro e copia de seguranca"`.

---

### Tarefa 9: Ajustes de estoque e botão de estoque

**Files:**
- Create: `src/lib/blingSync/saldos.js`
- Modify: `src/lib/blingSync/envio.js` (nova função `enviarAjustesDeEstoque`)
- Modify: `scripts/teste-bling-sync.js`

**Interfaces:**
- Consumes: `estoqueDoRise` (Tarefa 5), `clienteBling`, `CRITERIO_TODOS` (relatório da Tarefa 1).
- Produces:
  - `enviarAjustesDeEstoque(produtoId: string, cliente = clienteBling(), opcoes?: {depositoId?: number}): Promise<{ok: boolean, erro?: string, enviados: number, restantes: number, precisaDeposito?: {id: number, descricao: string}[]}>`: `exigirEscrita(sku)` primeiro; lê `GET /depositos`; o depósito é `opcoes.depositoId`, senão o marcado como padrão, senão, havendo mais de um, devolve `precisaDeposito` **sem enviar nada**; envia os pendentes **na ordem de `criadoEm`** em `POST /estoques` (entrada `"E"`, saída `"S"`, balanço `"B"`); marca `enviadoAoBlingEm` em cada um **logo depois** do envio; para na **primeira** falha; ao fim relê o saldo e grava `Produto.blingSaldo`.
  - `listarCodigosDoBling(cliente): Promise<Map<string, number>>`: código em minúsculas → id do Bling, lendo o catálogo em páginas de 100 com `CRITERIO_TODOS`.
  - `sincronizarEstoqueDoBling(cliente = clienteBling()): Promise<{atualizados: number, semCodigoNoBling: number, falhas: {sku: string, erro: string}[]}>`: para todos os produtos do Rise, pede os saldos em **lotes de 100**, grava `blingSaldo` e `estoque = estoqueDoRise(blingSaldo, pendentes)` (pendentes por produto, em ordem); produto sem código no Bling ou sem saldo lido **não tem o estoque alterado**; **não** cria `MovimentoEstoque`.

- [ ] **Step 1: Escrever os testes (falham).** Bloco "Estoque", com o Bling falso: pendentes `[ENTRADA 3, SAIDA 1]` → dois `post` em `/estoques`, o primeiro com `operacao: "E"` e o segundo `"S"`, os dois com o id do depósito padrão; os dois `enviadoAoBlingEm` preenchidos; `BALANCO` de 12 vai com `operacao: "B"` e `quantidade: 12`; falha 400 no segundo → `ok: false`, `enviados: 1`, `restantes: 1`, o primeiro marcado e o segundo **ainda nulo**; dois depósitos sem padrão → `precisaDeposito` e `falso.chamadas` sem nenhum `post`; com `depositoId` informado envia. `sincronizarEstoqueDoBling` com 150 produtos no falso → exatamente **2** chamadas a `/estoques/saldos` (100 + 50); produto com `[SAIDA 2]` pendente e saldo 10 no Bling fica com `estoque` 8; produto cujo código não existe no falso é contado em `semCodigoNoBling` e mantém o estoque; `MovimentoEstoque` não ganha linha.
- [ ] **Step 2: Rodar e ver falhar.** Expected: FALHA.
- [ ] **Step 3: Implementar.** Pedir os saldos com o parâmetro e o limite de ids do relatório da Tarefa 1; erro em um lote entra em `falhas` e os outros lotes seguem.
- [ ] **Step 4: Rodar o teste.** Expected: `ok`.
- [ ] **Step 5: Commit.** `git add src/lib/blingSync/saldos.js src/lib/blingSync/envio.js scripts/teste-bling-sync.js` e `git commit -m "Sincronizacao Bling: ajustes de estoque e leitura de saldos"`.

---

### Tarefa 10: Server Actions e ícone na lista

**Files:**
- Create: `src/app/produtos/acoes-bling.js`
- Create: `src/components/produtos/IconeBling.jsx`
- Modify: `src/lib/blingSync/estado.js` (nova `iconeBlingDoProduto`)
- Modify: `src/app/produtos/page.jsx` (consulta e prop `iconeBling`)
- Modify: `src/components/produtos/LinhaProduto.jsx` (usa `IconeBling` no lugar da imagem estática do Bling)
- Modify: `scripts/teste-bling-sync.js`

**Interfaces:**
- Consumes: `lerParaPopup`, `sincronizarProduto`, `cadastrarNoBling`, `enviarAjustesDeEstoque`, `sincronizarEstoqueDoBling` (Tarefas 7 a 9).
- Produces:
  - `iconeBlingDoProduto(produto): {cor, divergente, motivos}`: `produto` é a linha do Prisma com `fornecedores` (com `fornecedor: {cnpj, nome}`) e `_count.movimentosEstoque` (só os pendentes); compõe `normalizarDoRise`, `assinaturaDoRise` e `estadoDoIconeBling`.
  - Em `acoes-bling.js` (todas `async`, devolvem `{ok, ...}`, chamam `revalidatePath("/produtos")` quando gravam): `abrirJanelaBling(produtoId)` → `lerParaPopup`; `sincronizarComBling(produtoId)` → `sincronizarProduto`; `cadastrarProdutoNoBling(produtoId)` → `cadastrarNoBling`; `enviarEstoqueAoBling(produtoId, depositoId?)` → `enviarAjustesDeEstoque`; `sincronizarEstoqueComBling()` → `sincronizarEstoqueDoBling`.
  - `IconeBling({iconeBling, aoClicar})`: botão com a logo do Bling (`/marcas/bling.svg`), **colorida** quando `cor === "verde"` e em preto fosco quando `"cinza"`, e, quando `divergente`, um selo "?" no canto superior direito; o nome acessível e o `title` dizem o estado em palavras (`"Bling: nunca sincronizado"`, `"Bling: em dia"`, `"Bling: divergencia em campos"`, `"Bling: ajuste de estoque pendente"`).

- [ ] **Step 1: Escrever o teste (falha).** Bloco "Icone": produto `ZZ-BS-3` nunca sincronizado → `cinza` sem selo; depois de `sincronizarProduto` com o falso → `verde` sem selo; mudar o preço do produto no Prisma → `verde` com `motivos: ["campos"]`; registrar um ajuste de estoque com `gravarAjusteDeEstoque` (de `src/lib/ajusteRapido.js`) → `motivos` inclui `"estoque"`.
- [ ] **Step 2: Rodar e ver falhar.** Expected: FALHA.
- [ ] **Step 3: Implementar** `iconeBlingDoProduto`, as ações e `IconeBling`. Em `page.jsx`, acrescentar ao `findMany` o `include` de `fornecedores` e `_count: { select: { movimentosEstoque: { where: { enviadoAoBlingEm: null } } } }`, e calcular `iconeBling` por produto no mapeamento de `linhas`. Em `LinhaProduto`, receber `iconeBling` (padrão `{cor: "cinza", divergente: false, motivos: []}`) e guardar o estado `janelaBling` (a janela vem na Tarefa 11).
- [ ] **Step 4: Rodar o teste e o lint.** `npm run teste:bling-sync` e `npm run lint`. Expected: `ok` e lint sem erro.
- [ ] **Step 5: Verificar na tela.** Abrir `https://localhost:3000/produtos` (servidor reiniciado depois da migration): o ícone do Bling aparece cinza nos produtos importados, sem selo; conferir com `read_console_messages` que não há erro.
- [ ] **Step 6: Commit.** `git add src/app/produtos/acoes-bling.js src/components/produtos/IconeBling.jsx src/lib/blingSync/estado.js src/app/produtos/page.jsx src/components/produtos/LinhaProduto.jsx scripts/teste-bling-sync.js` e `git commit -m "Sincronizacao Bling: acoes e icone com estado na lista de Produtos"`.

---

### Tarefa 11: Pop-up do Bling e botão "Sincronizar estoque com Bling"

**Files:**
- Modify: `src/components/produtos/EdicaoRapida.jsx` (exportar `Popup`)
- Create: `src/components/produtos/JanelaBling.jsx`
- Create: `src/components/produtos/BotaoSincronizarEstoque.jsx`
- Modify: `src/components/produtos/LinhaProduto.jsx` (abre a `JanelaBling` ao clicar no `IconeBling`)
- Modify: `src/app/produtos/page.jsx` (botão ao lado de `BotaoImportarBling`)

**Interfaces:**
- Consumes: as cinco ações da Tarefa 10 e `Popup` de `EdicaoRapida.jsx` (acrescentar só o `export`).
- Produces: `JanelaBling({produto, aoFechar})` e `BotaoSincronizarEstoque()`.
  - `JanelaBling` ao abrir chama `abrirJanelaBling` e mostra: **carregando**; **erro** (token, limite, `duplicado` com a mensagem); **código inexistente** com o botão "Cadastrar no Bling"; ou a **lista de diferenças** (valor no Rise × valor no Bling; os iguais recolhidos em "N campos iguais"; `vazioNoRise` em cinza como "vazio no Rise (nao sera enviado)"), os **avisos**, o bloco de **estoque** (saldo do Bling, saldo do Rise, ajustes pendentes) e os botões "Sincronizar com o Bling" e, só com pendentes, "Enviar ajustes de estoque". Com `escrita.liberada === false`, os botões de envio ficam visíveis e, ao clicar, mostram o motivo (nunca ficam em silêncio). `precisaDeposito` mostra uma lista de depósitos para escolher e reenviar.
  - `BotaoSincronizarEstoque`: botão "Sincronizar estoque com Bling" com carregando; ao fim mostra "N atualizados, M sem esse codigo no Bling" e as falhas.

- [ ] **Step 1: Ler** `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` e o padrão de envio manual de `EdicaoRapida.jsx` (`useEnvio`).
- [ ] **Step 2: Implementar** os dois componentes e as ligações. Campos e rótulos vêm de `CAMPOS_DE_ENVIO`; ajuda de campo, se houver, em `BolhaDeAjuda`. Texto sem acento.
- [ ] **Step 3: Verificar na tela, com a escrita desligada.** Abrir o pop-up de um produto real: carrega a diferença lendo o Bling de verdade; "Sincronizar com o Bling" responde com `Escrita bloqueada...` em vermelho dentro do pop-up e **nada** muda no Bling; Esc e o fundo fecham. `read_console_messages` sem erro; tirar uma captura do pop-up.
- [ ] **Step 4: Verificar o botão de estoque só com o ok do dono.** Ele altera o estoque de **todos** os produtos do Rise no banco (leitura no Bling, escrita local). Pedir a confirmação antes de clicar; depois conferir o resumo e um produto qualquer.
- [ ] **Step 5: Lint.** `npm run lint`. Expected: sem erro.
- [ ] **Step 6: Commit.** `git add src/components/produtos/EdicaoRapida.jsx src/components/produtos/JanelaBling.jsx src/components/produtos/BotaoSincronizarEstoque.jsx src/components/produtos/LinhaProduto.jsx src/app/produtos/page.jsx` e `git commit -m "Sincronizacao Bling: pop-up do icone e botao Sincronizar estoque"`.

---

### Tarefa 12: Teste real com 1 produto, documentação e fechamento

**Files:**
- Modify: `CLAUDE.md` (seção nova "Sincronização com o Bling" e a linha `teste:bling-sync` em "Rodar")
- Modify: `docs/superpowers/specs/2026-10-04-sincronizacao-bling-investigacao.md` (resultados das escritas)

**Interfaces:**
- Consumes: tudo acima. Produces: a feature validada na API real e a documentação.

- [ ] **Step 1: Pedir ao dono a liberação.** Descrever em uma frase o que vai acontecer (criar e alterar **um** produto de teste no Bling) e esperar o "sim". **Não ligar a trava antes.**
- [ ] **Step 2: Liberar só o produto de teste.** No `.env`, `BLING_ESCRITA=true` e `BLING_ESCRITA_CODIGOS=ZZ-TESTE-BLING`; reiniciar o servidor. Criar no Rise o produto `ZZ-TESTE-BLING` (nome, preço, descrição com `<`, `&` e quebra de linha, NCM, medidas e um fornecedor com CNPJ).
- [ ] **Step 3: Percorrer o fluxo na tela, anotando cada resposta do Bling no relatório:** "Cadastrar no Bling"; editar um campo no Rise e ver o selo "?"; "Sincronizar com o Bling" e conferir no Bling (leitura) que **só** os campos esperados mudaram e que categoria e situação ficaram intactas; ícone verde; ajuste de estoque (entrada, saída, balanço) e "Enviar ajustes de estoque"; "Sincronizar estoque com Bling". Tentar sincronizar um produto **real** e confirmar que a trava por código recusa. Formato que a API recusar: corrigir `corpo.js` ou `envio.js` com um teste novo no `teste:bling-sync` e repetir.
- [ ] **Step 4: Devolver a trava.** Voltar `BLING_ESCRITA=false` e remover `BLING_ESCRITA_CODIGOS`; reiniciar o servidor. Perguntar ao dono se quer liberar os produtos reais **agora** (ele decide; sem o "sim", fica desligado).
- [ ] **Step 5: Documentar** em `CLAUDE.md`: a decisão de cada seção da spec, as duas travas, a cópia de segurança, o contrato `{get, post, put, exigirEscrita}` e o Bling falso, o botão manual de estoque, e a **pendência registrada: "estoque automático e foto principal quando o sistema estiver na VPS"**.
- [ ] **Step 6: Bateria final.** `npm run teste:bling-sync`, `npm run teste:estoque`, `npm run teste:fotos`, `npm run teste:coleta`, `npm run teste:cadastros` e `npm run lint`. Expected: tudo passa.
- [ ] **Step 7: Commit.** `git add CLAUDE.md docs/superpowers/specs/2026-10-04-sincronizacao-bling-investigacao.md` e `git commit -m "Sincronizacao Bling: teste real com 1 produto e documentacao"`.
