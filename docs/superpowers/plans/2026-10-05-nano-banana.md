# Nano Banana nas fotos do produto, com reserva de imagens — Plano de implementação

> **Para quem executa:** execução **inline, nesta conversa, sem subagentes** (decisão do dono, 05/10/2026). Use `superpowers:executing-plans`, mas sem despachar agentes: as tarefas e a revisão final são feitas aqui mesmo. Os passos usam checkbox (`- [ ]`). Cada tarefa traz o modelo que a executa: **Sonnet** (simples) ou **Opus** (complexa). As tarefas estão agrupadas em três blocos para o dono trocar de modelo só duas vezes.

**Goal:** Acrescentar o Nano Banana (modelos de imagem do Google) como terceira versão da foto do produto, gerado dentro do Rise, e guardar originais e versões geradas numa reserva escondida do produto.

**Architecture:** A "versão" da foto deixa de ser o booleano `melhorada` e vira um nome (`original`, `photoroom`, `nanobanana`) no lote, nas ações e na janela. A integração com o Google fica em dois arquivos sem banco, no molde do Photoroom. A reserva é uma coluna `papel` em `ProdutoArquivo` (`FOTO` ou `RESERVA`), com pasta própria no disco, e o Salvar aplica as regras de reserva num único lugar: `reconciliarImagensDoProduto`.

**Tech Stack:** Next.js 16 (server actions), React 19, JavaScript puro, Prisma 7 + Postgres, sharp (já usado no padronizador), `fetch` nativo para o Google.

**Spec:** `docs/superpowers/specs/2026-10-05-nano-banana-design.md` (lida junto com este plano; os números §N abaixo são dela).

## Blocos e troca de modelo

| Bloco | Modelo | Tarefas |
| --- | --- | --- |
| 1 | Sonnet | 1 migration e schema · 2 reserva em disco, rota e leituras só de FOTO |
| 2 | **Opus** (trocar com `/model` antes da Tarefa 3) | 3 integração com o Google · 4 versão nomeada · 5 Salvar com reserva · 6 reabrir produto · 7 gerar com Nano Banana |
| 3 | Sonnet (trocar de volta antes da Tarefa 8) | 8 prompt salvo, extras e estado · 9 aba Nano Banana · 10 reserva na tela · 11 teste manual, docs e fechamento |

## Global Constraints

- **Execução:** inline, sem subagentes. Tarefa simples com Sonnet, complexa com Opus (spec §13).
- **Código:** JavaScript puro (sem TypeScript). Identificadores e comentários em português **sem acento**; comentários explicam o porquê. Textos de tela e mensagens de erro seguem o padrão do código existente (sem acento). O texto do prompt enviado à IA é a exceção: copiado literalmente da spec §8, com acentos.
- **Next 16:** antes de escrever rota ou server action nova, ler o guia correspondente em `node_modules/next/dist/docs/` (regra do `AGENTS.md`). Arquivo `"use server"` só exporta funções assíncronas; constantes e funções síncronas vão para módulos comuns em `src/lib/`.
- **Modelos do Google** (chave do `MODELOS`, id, US$ por imagem 1K, conferidos em 05/10/2026): `nano-banana-2` → `gemini-3.1-flash-image` 0,067 (padrão, aceita extras); `nano-banana-pro` → `gemini-3-pro-image` 0,134 (aceita extras); `nano-banana-2-lite` → `gemini-3.1-flash-lite-image` 0,034 (ignora extras). O Nano Banana 1 fica fora.
- **Chamada ao Google:** `POST https://generativelanguage.googleapis.com/v1beta/models/<id>:generateContent`, chave no cabeçalho `x-goog-api-key`, só imagem, 1:1, 1K, tempo limite de 120 s. Até 5 extras. Prompt até 2.000 caracteres.
- **.env:** `GEMINI_API_KEY=`, `NANO_BANANA_GERACAO=false` (trava), `NANO_BANANA_TETO_DIA=50`.
- **Custo:** em reais pela cotação de `src/lib/cotacaoDolar.js` (`emReais`), dólar entre parênteses, sem IOF. No `LogIntegracao` (`servico = GEMINI`) nunca entram a chave, a imagem nem o prompt. Só resposta 200 conta como gasto e no teto; chamada que não saiu não entra no log.
- **Reserva:** as 100 fotos do produto contam só `papel = FOTO`. Toda leitura de foto do produto filtra `papel: "FOTO"`. A reserva não tem teto.
- **Banco:** migration escrita à mão, só `ADD`/`CREATE`. Depois: `npx prisma generate` e reiniciar o servidor de desenvolvimento. A coluna `ProdutoArquivo.finalizada` (sem uso) **não** é removida agora: o servidor da outra frente roda com o client antigo, que lista essa coluna em toda consulta, e um `DROP COLUMN` o derrubaria. Fica para a próxima migration.
- **Outra frente (Sincronização Bling / Loja Integrada) usa a mesma pasta:** não tocar nos arquivos dela (`src/app/integracoes/*`, `src/components/CartaoConector.jsx`, `src/lib/integracoes/{config,httpClient,lojaintegrada}.js`, `src/lib/integracoes/lojaIntegrada/`, `scripts/teste-loja-integrada.js`, `package.json`). `.env.example` está modificado por ela: o bloco do Nano Banana entra no commit só como trecho (`git apply --cached` de um patch só com o bloco). Commits com `git add` por caminho, nunca `git add .`. Mensagem em português, estilo "Nano Banana: …", com a linha de coautoria vigente na sessão.
- **Servidor da porta 3000:** pode ser da outra frente. Antes de reiniciá-lo, confirmar que ela está ociosa; se não der para saber, perguntar ao dono.
- **Comando de teste** (a saída vai para arquivo, nunca para `| head`):

```bash
npm run teste:imagens > .superpowers/saida-imagens.txt 2>&1; grep -E "^FALHA|TODOS OS TESTES|FALHA\(S\)" .superpowers/saida-imagens.txt
```

  Passou quando a única linha é `TODOS OS TESTES PASSARAM`. Os testes novos entram em `scripts/teste-imagens.js` (spec §10), com `conferir(nome, obtido, esperado)` e `fetch` simulado, antes do `finally` final. O bloco que usa banco apaga o que criou, incluindo linhas `GEMINI` de `LogIntegracao` (como o de Photoroom faz no `finally`).
- **Execução da spec que muda:** a spec pede confirmar o formato do corpo do Google primeiro. Sem a chave não dá. O plano isola o formato em duas funções (`montarPedido`, `lerResposta`), constrói no formato clássico `contents/parts/inline_data` e confirma na Tarefa 11, antes de ligar a trava.

## Review Focus

Entradas e falhas que a spec implica e que nenhum teste de "caminho feliz" cobre. Cada linha tem o teste na tarefa dona.

1. **Reserva vazando para onde só cabe foto:** anúncio do ML, lista de produtos, "Clonar", contagem das 100 fotos e foto principal listando linhas `RESERVA`. Esperado: nunca aparecem. → Tarefa 2.
2. **Clique duplo em "Gerar" ou duas abas:** cobrança em dobro. Esperado: uma geração por vez por foto, a segunda é recusada sem chamar o Google. Chamada que falhou antes de sair não conta. → Tarefa 7.
3. **Foto paga perdida:** "Gerar de novo", "Cancelar", excluir, escolher outra versão ou salvar sem validar. Esperado: a geração paga nunca some em silêncio; "gerar de novo" troca só a versão `nanobanana` e nunca toca na original nem na do Photoroom; paga sem escolha vai para a reserva. → Tarefas 4, 5 e 7.
4. **Reabrir produto cuja foto já é Photoroom ou Nano Banana:** o Nano Banana deve partir da original verdadeira (a da reserva), não da foto atual. E reabrir e salvar sem mexer não pode duplicar nada. → Tarefa 6.
5. **Resposta do Google sem imagem, recusada por conteúdo, com imagem corrompida ou fora de 1:1:** esperado: mensagem em português, nada gravado como versão válida, e o custo registrado só se a resposta foi 200. → Tarefas 3 e 7.

## Estrutura de arquivos

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `prisma/schema.prisma`, `prisma/migrations/20261005_nano_banana_reserva/migration.sql` | modificar / criar | `Servico.GEMINI`, `PapelArquivo`, colunas `papel`/`versao`/`grupo`, tabela `PromptImagem` |
| `src/lib/integracoes/nanobanana.js` | criar | `MODELOS`, `PROMPT_PADRAO`, configuração, pedido, resposta, erros, chamada (sem banco) |
| `src/lib/integracoes/nanobananaLog.js` | criar | `registrarChamada` e `usoDoNanoBanana` em `LogIntegracao` |
| `src/lib/limites.js` | modificar | `MAXIMO_EXTRAS`, `MAXIMO_PROMPT`, `MAXIMO_EXTRA_BYTES` (comuns a servidor e cliente) |
| `src/lib/imagens/lote.js` | modificar | versão nomeada, pastas `extras/` e `geracoes/`, limpeza |
| `src/lib/imagens/paraTela.js` | criar | `imagemParaTela` e `versoesParaTela` (saem do arquivo `"use server"`, que não pode exportá-las) |
| `src/lib/imagens/reserva.js` | criar | disco da reserva: `gravarNaReserva`, `lerDaReserva`, `apagarDaReserva` |
| `src/lib/arquivos.js` | modificar | `PASTA_RESERVA`, `caminhoDaReserva`, `urlDaReserva` |
| `src/app/api/arquivos/[...caminho]/route.js` | modificar | serve a pasta `reserva` |
| `src/lib/imagens/produto.js` | modificar | Salvar com reserva (`reconciliarImagensDoProduto`) |
| `src/app/produtos/acoes.js` | modificar | produto novo delega ao `reconciliarImagensDoProduto`; produto existente repassa `reservaExcluida` |
| `src/app/produtos/acoes-imagens.js` | modificar | versão nomeada; `prepararFotosDoProduto` com reserva; `trazerDaReserva` |
| `src/app/produtos/acoes-nanobanana.js` | criar | `gerarComNanoBanana`, `estadoDoNanoBanana`, `salvarPromptDoModelo`, extras |
| `src/components/produtos/PainelNanoBanana.jsx` | criar | controles da aba Nano Banana |
| `src/components/produtos/ReservaDeImagens.jsx` | criar | painel "Reserva (N)" |
| `JanelaDeFotos.jsx`, `PainelDeImagens.jsx`, `FormularioProduto.jsx` | modificar | abas, versão nomeada, reserva, campos do formulário |
| `scripts/teste-imagens.js`, `scripts/teste-nano-banana.js` | modificar / criar | testes automáticos e roteiro manual com a chave |
| `.env.example`, `CLAUDE.md` | modificar | variáveis e documentação |

---

## Bloco 1 — Sonnet

### Task 1: Migration e schema (Sonnet)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20261005_nano_banana_reserva/migration.sql`

**Interfaces:**
- Produces: `Servico.GEMINI`; enum `PapelArquivo { FOTO RESERVA }`; em `ProdutoArquivo`: `papel PapelArquivo @default(FOTO)`, `versao String @default("original")`, `grupo String?` e `@@index([produtoId, grupo])`; `model PromptImagem { modelo String @id; texto String; atualizadoEm DateTime @updatedAt }`.

- [ ] **Step 1: Conferir que a frente do schema está livre.** `git status --short prisma/` não pode listar nada; e `npx prisma migrate status` precisa dizer que o banco está em dia. Se houver migration da outra frente em andamento, parar e avisar o dono (regra do schema: uma frente por vez).
- [ ] **Step 2: Editar `schema.prisma`** com o que está em Interfaces, comentando o porquê de cada coluna (`grupo` liga o original e as versões geradas da mesma foto; `versao` é só rótulo; `PromptImagem.modelo` é a chave do `MODELOS`, não o id do Google). Deixar o comentário "SEM USO" de `finalizada` como está.
- [ ] **Step 3: Escrever `migration.sql` à mão**, nesta ordem: `ALTER TYPE "Servico" ADD VALUE 'GEMINI'`; `CREATE TYPE "PapelArquivo"`; `ALTER TABLE "ProdutoArquivo"` com as três colunas; `UPDATE "ProdutoArquivo" SET "grupo" = "id" WHERE "tipo" = 'IMAGEM'`; `CREATE INDEX "ProdutoArquivo_produtoId_grupo_idx"`; `CREATE TABLE "PromptImagem"`. Não copiar nenhum `DROP INDEX` que `prisma migrate diff` proponha (índices só do SQL: `ProdutoColetado_buscaTexto_trgm`, `ProdutoColetado_coletadoEm_idx`, `Anuncio_um_por_produto`, `Job_fonte_aberta`).
- [ ] **Step 4: Aplicar e gerar.** Run: `npx prisma validate && npx prisma migrate deploy && npx prisma generate`. Expected: `The schema ... is valid`, a migration `20261005_nano_banana_reserva` aplicada, `Generated Prisma Client`. Depois `npx prisma migrate status` diz `Database schema is up to date!`.
- [ ] **Step 5: Reiniciar o servidor de desenvolvimento** (ver restrição da porta 3000). Sem isso a tela não conhece as colunas novas.
- [ ] **Step 6: Commit.** `git add prisma/schema.prisma prisma/migrations/20261005_nano_banana_reserva` → `Nano Banana: migration da reserva de imagens, Servico GEMINI e tabela de prompts`. (O backfill `grupo = id` é conferido no teste da Tarefa 2.)

### Task 2: Reserva em disco, rota e leituras só de FOTO (Sonnet)

**Files:**
- Modify: `src/lib/arquivos.js`, `src/app/api/arquivos/[...caminho]/route.js`, `src/lib/imagensImportadas.js` (linhas 59 e 169), `src/app/produtos/page.jsx` (80), `src/app/produtos/[id]/page.jsx` (21 e laço da 86), `src/app/produtos/acoes.js` (706, 731–743, 777, 820), `src/app/produtos/acoes-imagens.js` (266), `src/lib/imagens/produto.js` (66), `src/lib/canaisDeVenda/ml/banco.js` (48), `src/app/anuncios/[id]/page.jsx` (25)
- Create: `src/lib/imagens/reserva.js`
- Test: `scripts/teste-imagens.js` (novo bloco "Reserva: so FOTO conta")

**Interfaces:**
- Produces em `arquivos.js`: `PASTA_RESERVA = "reserva"`; `caminhoDaReserva(sku: string, nome: string): string | null` (SKU válido e nome `^[0-9a-f]{32}\.jpg$`, senão `null`); `urlDaReserva(sku: string, nome: string): string` → `/api/arquivos/<sku>/reserva/<nome>`.
- Produces em `reserva.js`: `gravarNaReserva(sku: string, bytes: Buffer): Promise<{ nome: string, tamanhoBytes: number, mimeType: "image/jpeg" }>` (nome gerado `randomUUID` sem hífens + `.jpg`; bytes que não são JPEG, como uma foto antiga em PNG, passam antes por `padronizarImagem`); `lerDaReserva(sku: string, nome: string): Promise<Buffer | null>`; `apagarDaReserva(sku: string, nome: string): Promise<void>` (ENOENT não é erro).

- [ ] **Step 1: Escrever os testes que falham** (bloco novo, produto próprio `SKU_RESERVA = "ZZ-TESTE-RESERVA"`, declarado junto de `SKU_EDICAO` e apagado no `finally`, com `apagarPastaProduto`). Produto com 1 linha FOTO e 2 linhas RESERVA (inseridas direto pelo Prisma, `grupo` igual ao da FOTO). Asserções:
  - `conferir("linhas existentes viram FOTO/original com grupo = id", ...)`: criar uma linha sem informar os campos novos e conferir `[papel, versao, grupo === id]` = `["FOTO", "original", true]`.
  - `anexarImagens` conta só FOTO (as vagas são `MAXIMO_IMAGENS - 1`, e não `- 3`): chamar com uma foto e conferir `salvas === 1` e `principal` não passa para a reserva.
  - `imagensDaOrigem("rise:<id>")` devolve 1 foto. `prepararFotosDoProduto` devolve 1 imagem. `definirImagemPrincipal(<id de RESERVA>)` devolve `{ ok: false }`. `removerArquivo` da principal escolhe a próxima FOTO, nunca uma RESERVA.
  - **Guarda de código:** ler todos os `.js`/`.jsx` de `src/` e falhar se alguma linha casar `/where:\s*\{[^}]*tipo: "IMAGEM"[^}]*\}/` sem a palavra `papel` na mesma linha. Nome do teste: `nenhuma leitura de foto sem filtrar papel`.
  - `caminhoDaReserva("ZZ", "../../.env")` e com nome `.png` devolvem `null`; `urlDaReserva` devolve o endereço esperado.
  - Rota: `GET` com `[sku, "reserva", nome]` devolve 200 `image/jpeg` para arquivo gravado por `gravarNaReserva`, 404 para nome válido inexistente e 404/400 para `../../.env`.
  - `renomearPastaProduto` leva a pasta `reserva` junto: depois de trocar o SKU o arquivo continua legível em `caminhoDaReserva(novoSku, nome)`.
- [ ] **Step 2: Rodar e ver falhar.** Run: comando de teste. Expected: FALHA nas asserções novas.
- [ ] **Step 3: Implementar** `arquivos.js` (helpers de caminho e endereço) e `reserva.js`. Na rota, tratar `pasta === PASTA_RESERVA` antes de consultar `TIPOS_POR_PASTA`: valida com `caminhoDaReserva`, disposição `inline`, sem consulta de `nomeOriginal`, mesmo `Cache-Control` imutável.
- [ ] **Step 4: Filtrar `papel: "FOTO"`** em cada leitura listada em Files (as de `tipo: "IMAGEM"` e as que usam `tipo` variável em `enviarArquivo`/`removerArquivo`/`definirImagemPrincipal`). Em `[id]/page.jsx` o laço pula `item.papel !== "FOTO"`. Em `produto.js` só o `findMany` de `atuais` muda por ora (a Tarefa 5 acrescenta a leitura da reserva).
- [ ] **Step 5: Rodar o teste.** Expected: `TODOS OS TESTES PASSARAM`.
- [ ] **Step 6: Commit.** `git add` dos arquivos acima → `Nano Banana: pasta da reserva, rota e leituras de foto so de papel FOTO`.

---

## Bloco 2 — Opus

### Task 3: Integração com o Google (Opus)

**Files:**
- Create: `src/lib/integracoes/nanobanana.js`, `src/lib/integracoes/nanobananaLog.js`
- Modify: `src/lib/limites.js`, `.env.example` (só o bloco do Nano Banana)
- Test: `scripts/teste-imagens.js` (blocos "Nano Banana: configuracao, pedido e erros (sem rede)" e "Nano Banana: registro e uso (usa o Postgres)")

**Interfaces:**
- Produces em `limites.js`: `MAXIMO_EXTRAS = 5`, `MAXIMO_PROMPT = 2000`, `MAXIMO_EXTRA_BYTES = 10 * 1024 * 1024`.
- Produces em `nanobanana.js`:
  - `ENDERECO_BASE`, `MODELOS` (chave → `{ id, nome, usd, conferidoEm: "2026-10-05", aceitaExtras }`, na ordem `nano-banana-2`, `nano-banana-pro`, `nano-banana-2-lite`), `MODELO_PADRAO = "nano-banana-2"`, `PROMPT_PADRAO` (o bloco de citação da spec §8, literal), `REGRA_EXTRAS` (a frase fixa da spec §8, sem acento).
  - `avaliarConfiguracao(env = process.env): { ok: boolean, motivo: string | null, tetoDia: number }`. Sem chave: "Chave do Google ausente: coloque GEMINI_API_KEY no arquivo .env e reinicie o servidor." Trava desligada ou em branco: "Geracao desligada. Ela so liga com NANO_BANANA_GERACAO=true no .env." `tetoDia` vem de `NANO_BANANA_TETO_DIA`, 50 se ausente ou inválido. O motivo nunca traz o valor da chave.
  - `montarPedido({ prompt, original: { bytes, mimeType }, extras, aceitaExtras }): object`: corpo `contents[0].parts` na ordem texto do prompt, imagem original, e, se `aceitaExtras` e houver extras, o texto `REGRA_EXTRAS` seguido das imagens extras na ordem dada (formato clássico `inline_data` com `mime_type` e `data` em base64); `generationConfig` com `responseModalities: ["IMAGE"]` e `imageConfig: { aspectRatio: "1:1", imageSize: "1K" }`.
  - `lerResposta(corpo: object): { ok: true, bytes: Buffer } | { ok: false, erro: string }`: pega a primeira parte com imagem (aceita `inlineData` e `inline_data`). Sem imagem: se `promptFeedback.blockReason` ou `finishReason` de segurança (`SAFETY`, `IMAGE_SAFETY`, `PROHIBITED_CONTENT`, `IMAGE_PROHIBITED_CONTENT`, `BLOCKLIST`) → "O Google recusou esta foto, tente outra ou mude o prompt."; senão → "O Google nao devolveu imagem: " + o texto que devolveu (até 200 caracteres).
  - `mensagemDeErro(status: number, corpo?: string): string`: 401/403 com faturamento no texto (`/billing|faturamento|payment|FAILED_PRECONDITION/i`) → "O Google pede faturamento ativo para gerar imagem. Ative em aistudio.google.com (Plan / Billing)."; 401/403 ou 400 com `API_KEY_INVALID` → "O Google recusou a chave. Confira GEMINI_API_KEY no .env."; 429 → "Limite ou cota do Google atingido. Tente de novo mais tarde."; 400 → "O Google recusou o pedido: <mensagem>"; demais → "O Google falhou (HTTP <status>): <mensagem>".
  - `gerarImagem({ modelo, prompt, original, extras = [], env = process.env }): Promise<{ ok: true, enviada: true, bytes: Buffer, status: number, duracaoMs: number } | { ok: false, enviada: boolean, erro: string, status: number | null, duracaoMs: number }>`. Recusa **antes** de chamar (`enviada: false`) por: modelo desconhecido, configuração não ok, prompt vazio ou acima de `MAXIMO_PROMPT`. Falha de rede e tempo esgotado ("O Google demorou demais para responder.") têm `enviada: true`. Usa `AbortSignal.timeout(120_000)`.
- Produces em `nanobananaLog.js`: `registrarChamada({ modelo: string, status: number | null, duracaoMs: number, pixelsOrigem: number | null, extras: number, tamanhoPrompt: number, repetida: boolean, erro?: string | null }): Promise<void>` (grava `servico: "GEMINI"`, `metodo: "POST"`, `endpoint` = URL do modelo, `requestResumo` só com `pixelsOrigem`, `extras`, `tamanhoPrompt`, `repetida`; falha de log não derruba a geração); `usoDoNanoBanana(agora = new Date()): Promise<{ hoje: number, mes: number, limiteDia: number, gastoMesUsd: number }>` (conta só `statusHttp 200`; gasto = soma por modelo de contagem × `usd`; meia-noite UTC como no Photoroom).

- [ ] **Step 1: Escrever os testes puros que falham.** Em `teste-imagens.js`, ao lado do bloco do Photoroom, com `fetch` simulado como o dele:

```js
conferir("sem chave: geracao recusada com o motivo", [avaliarConfiguracao({}).ok, /GEMINI_API_KEY/.test(avaliarConfiguracao({}).motivo)], [false, true]);
conferir("trava desligada recusa mesmo com chave", avaliarConfiguracao({ GEMINI_API_KEY: "k", NANO_BANANA_GERACAO: "false" }).ok, false);
conferir("chave e trava ligada liberam, teto padrao 50", [avaliarConfiguracao({ GEMINI_API_KEY: "k", NANO_BANANA_GERACAO: "true" }).ok, avaliarConfiguracao({ GEMINI_API_KEY: "k", NANO_BANANA_GERACAO: "true" }).tetoDia], [true, 50]);
conferir("teto invalido volta para 50", avaliarConfiguracao({ GEMINI_API_KEY: "k", NANO_BANANA_GERACAO: "true", NANO_BANANA_TETO_DIA: "abc" }).tetoDia, 50);
conferir("o motivo nunca traz a chave", JSON.stringify(avaliarConfiguracao({ GEMINI_API_KEY: "SEGREDO", NANO_BANANA_GERACAO: "false" })).includes("SEGREDO"), false);
conferir("precos dos tres modelos", Object.values(MODELOS).map((m) => m.usd), [0.067, 0.134, 0.034]);
// montarPedido: ordem, 1:1, 1K, so imagem; Lite descarta extras e a regra fixa
conferir("pedido: prompt, original, regra, extras, nessa ordem", partes.map((p) => (p.text ? "texto" : "imagem")), ["texto", "imagem", "texto", "imagem", "imagem"]);
conferir("pedido: 1:1, 1K e so imagem", [cfg.responseModalities, cfg.imageConfig], [["IMAGE"], { aspectRatio: "1:1", imageSize: "1K" }]);
conferir("Lite nao leva extras nem a regra", pedidoLite.contents[0].parts.length, 2);
```

  Mais, no mesmo bloco: `gerarImagem` com `fetch` simulado confere o endereço (`.../models/gemini-3.1-flash-image:generateContent`), o cabeçalho `x-goog-api-key`, e que sucesso devolve os bytes; **uma chamada, não duas**. Erros (cada um com a mensagem esperada e `enviada` certo): 403 com "billing" → pede faturamento; 403 comum e 400 `API_KEY_INVALID` → recusou a chave; 429 → limite; 500 → "falhou (HTTP 500)"; resposta 200 com `finishReason: "IMAGE_SAFETY"` → "recusou esta foto"; 200 só com texto → "nao devolveu imagem" + o texto; 200 com base64 que não decodifica para imagem → erro, sem bytes; `fetch` lançando `{ name: "TimeoutError" }` → "demorou demais" com `enviada: true`; modelo desconhecido, trava desligada e prompt vazio **não chamam o fetch** (`enviada: false`, contador de chamadas inalterado).
- [ ] **Step 2: Escrever o teste do log (banco):** `registrarChamada` cria 1 linha `GEMINI` cujo `requestResumo` não contém `prompt`, `key`, `base64` nem a chave; `usoDoNanoBanana` com 2 linhas 200 do modelo 2 e 1 linha 429 dá `hoje: 2`, `gastoMesUsd: 0.13` (2 × 0,067 arredondado a 2 casas) e ignora a de erro. Apagar as linhas `GEMINI` criadas (`criadoEm >= inicioDoTeste`) no `finally`.
- [ ] **Step 3: Rodar e ver falhar.** Run: comando de teste. Expected: FALHA (módulos não existem).
- [ ] **Step 4: Implementar** `limites.js`, `nanobanana.js` e `nanobananaLog.js` conforme Interfaces. Só `montarPedido` e `lerResposta` conhecem o formato do corpo: um comentário no topo diz que o formato é o clássico e que a Tarefa 11 o confirma com a chave real.
- [ ] **Step 5: `.env.example`:** acrescentar o bloco `GEMINI_API_KEY=`, `NANO_BANANA_GERACAO=false`, `NANO_BANANA_TETO_DIA=50` com comentário no estilo do bloco do Photoroom.
- [ ] **Step 6: Rodar o teste.** Expected: `TODOS OS TESTES PASSARAM`.
- [ ] **Step 7: Commit.** `git add src/lib/integracoes/nanobanana.js src/lib/integracoes/nanobananaLog.js src/lib/limites.js scripts/teste-imagens.js`; `.env.example`: gerar um patch só com o bloco novo (`git diff -U0 .env.example`, manter só o trecho do Nano Banana) e aplicar com `git apply --cached`. Mensagem: `Nano Banana: integracao com o Google, log e uso`.

### Task 4: Versão nomeada no lote, nas ações e na janela (Opus)

**Files:**
- Modify: `src/lib/imagens/lote.js`, `src/app/produtos/acoes-imagens.js`, `src/components/produtos/PainelDeImagens.jsx`, `src/components/produtos/JanelaDeFotos.jsx`, `src/components/produtos/FormularioProduto.jsx` (1818)
- Create: `src/lib/imagens/paraTela.js`
- Test: `scripts/teste-imagens.js` (linhas 418–491 atualizadas e asserções novas)

**Interfaces:**
- Produces em `lote.js`: `VERSOES = ["original", "photoroom", "nanobanana"]`; `PADROES.versoes` aceita `.original|.photoroom|.nanobanana|.melhorada` (`.melhorada` só leitura); `PADROES.extras = /^[0-9a-f]{32}\.[1-5]\.(jpg|png|webp)$/` e `PADROES.geracoes = /^[0-9a-f]{32}\.json$/`; `nomeGuardadoDaVersao(lote, base, versao): Promise<string | null>` (nome do arquivo que existe; `photoroom` cai para `.melhorada.jpg` se o novo faltar); `lerVersao(lote, base, versao): Promise<Buffer | null>`; `guardarVersao(lote, base, versao, bytesPadronizados): Promise<{ ok: true } | { ok: false, erro: string }>`; `garantirOriginalGuardado(lote, base): Promise<{ ok: boolean, erro?: string }>` (padroniza `originais/<base>` para `versoes/<base>.original.jpg` se ainda não existir); `versoesDoLote(lote, base): Promise<{ photoroom: boolean, nanobanana: boolean }>`; `escolherVersao(lote, base, versao): Promise<{ ok: true, ampliada: boolean, tamanhoBytes: number } | { ok: false, erro: string }>` com `versao` em `VERSOES` (`original` volta ao arquivo que chegou; as outras copiam a versão guardada para `imagens/<base>.jpg`, sem custo; versão que não existe → "Esta foto ainda nao foi melhorada."; fora da lista → "Versao invalida."). **Saem** `guardarVersoes` e `temMelhorada`.
- Produces em `paraTela.js` (módulo comum, não `"use server"`): `imagemParaTela(lote: string, base: string, extra?: object): object` com `{ base, url, finalizada: false, ampliada: false, versao: "original", versoes: { photoroom: false, nanobanana: false }, urls: { original: null, photoroom: null, nanobanana: null }, ...extra }`; `versoesParaTela(lote, base): Promise<{ versoes, urls }>` (`urls.original` só existe quando há alguma versão gerada; cada endereço leva `?v=<Date.now()>`).
- Produces em `acoes-imagens.js`: `escolherVersaoNoLote(lote, base, versao)` com `versao` em `VERSOES`, devolvendo `imagem` com `versao` e `versoes`/`urls`; `comprarPhotoroom` devolve `imagem` com `versao: "photoroom"` e passa a usar `garantirOriginalGuardado` + `guardarVersao(..., "photoroom", ...)`. Os campos `melhorada`, `temMelhorada`, `originalUrl` e `melhoradaUrl` deixam de existir.

- [ ] **Step 1: Atualizar e ampliar os testes (devem falhar).** Nas linhas 418–491 de `teste-imagens.js`, trocar `imagem.melhorada`/`temMelhorada`/`melhoradaUrl`/`originalUrl` por `imagem.versao === "photoroom"`, `imagem.versoes.photoroom`, `imagem.urls.photoroom` e `imagem.urls.original`; `escolherVersaoNoLote(..., "melhorada")` vira `"photoroom"`; os nomes de arquivo `versoes/<base>.melhorada.jpg` viram `.photoroom.jpg`; `.outra.jpg` continua recusada pela rota. Acrescentar:
  - depois da compra: `versao === "photoroom"`, `versoes === { photoroom: true, nanobanana: false }`;
  - **legado:** escrever à mão `versoes/<base>.melhorada.jpg` num lote limpo; `versoesDoLote` diz `photoroom: true`, `escolherVersao(..., "photoroom")` copia esses bytes, a rota ainda serve `.melhorada.jpg`;
  - `guardarVersao(..., "nanobanana", bytes)` + `escolherVersao(..., "nanobanana")` copia para `imagens/<base>.jpg`; `escolherVersao(..., "nanobanana")` sem a versão guardada devolve `ok: false`;
  - a rota entrega `.photoroom.jpg` e `.nanobanana.jpg` (200) e recusa `.outra.jpg`;
  - `PADROES`/`caminhoNoLote` aceitam `extras/<base>.1.jpg` e `geracoes/<base>.json` e recusam `extras/<base>.6.jpg` e `../x`;
  - **(Review Focus 3)** `apagarImagem` remove versões (as quatro grafias), `extras/<base>.*` e `geracoes/<base>.json` (criados direto com `writeFile` no teste).
- [ ] **Step 2: Rodar e ver falhar.** Run: comando de teste. Expected: FALHA.
- [ ] **Step 3: Implementar `lote.js`** conforme Interfaces. `apagarImagem` apaga também as quatro grafias de versão e, em `extras/`, tudo que começa com `<base>.` (lista a pasta), e `geracoes/<base>.json`. Atualizar o comentário do topo do arquivo (a pasta `versoes/` agora tem três nomes, e `extras/` e `geracoes/` existem).
- [ ] **Step 4: Criar `paraTela.js` e adaptar `acoes-imagens.js`:** remover as funções locais `imagemParaTela` e `versoesParaTela`, importar as novas; `escolherVersaoNoLote` e `comprarPhotoroom` como em Interfaces.
- [ ] **Step 5: Rodar o teste.** Expected: `TODOS OS TESTES PASSARAM`.
- [ ] **Step 6: Adaptar a tela ao nome da versão.**
  - `PainelDeImagens.jsx`: `assinatura` usa `i.versao` no lugar de `Boolean(i.melhorada)`; `jaCompradas`/`comprasNaJanela` passam a contar fotos com alguma versão gerada (`versoes.photoroom || versoes.nanobanana`) que não tinham antes da janela, e o texto "foto comprada" vira "foto paga" (a geração do Nano Banana também cobra e o Cancelar não devolve); `cancelarJanela` compara `depois.versao !== antes.versao` e restaura com `escolherVersaoNoLote(lote, antes.base, antes.versao)`, mantendo `versoes`/`urls` do rascunho; o selo "Melhorada" vira rótulo por versão ("Photoroom", "Nano Banana").
  - `JanelaDeFotos.jsx`: `escolhida = finalizada ? imagem.versao : null`; `temMelhorada` vira `imagem.versoes.photoroom`; `urlDaOriginal = imagem.urls.original ?? imagem.url`; `urlDaDireita` usa `imagem.urls.photoroom`; `aoEscolherVersao(imagem, "photoroom")` no lugar de `"melhorada"`. O quadro da direita continua só Photoroom (as abas vêm na Tarefa 9).
  - `FormularioProduto.jsx:1818`: a condição `!imagem.melhorada` vira "sem versão gerada paga": `!imagem.versoes?.photoroom && !imagem.versoes?.nanobanana` (foto paga não sai da lista por desmarcar na lupa). No campo oculto `imagensDoLote` (linha 2278), cada item passa a mandar `versao: imagem.versao`, para o Salvar da Tarefa 5 rotular a FOTO certa.
- [ ] **Step 7: Lint e conferência na tela.** Run: `npx eslint src/lib/imagens src/app/produtos src/components/produtos`. Expected: sem erros novos (o erro de `CartaoConector.jsx` é da outra frente). Abrir um produto existente, clicar em "Melhorar": a janela abre, mostra original e a prévia vazia, sem erro no console (`read_console_messages`).
- [ ] **Step 8: Commit.** `Nano Banana: versao nomeada da foto (original, photoroom, nanobanana) no lote, nas acoes e na janela`.

### Task 5: Salvar com reserva (Opus)

**Files:**
- Modify: `src/lib/imagens/produto.js`, `src/app/produtos/acoes.js` (`gravarImagensDoLote`, `gravarImagensDoPainel`)
- Test: `scripts/teste-imagens.js` (bloco "Salvar com reserva (usa o Postgres e dados/)")

**Interfaces:**
- Consumes: `lerVersao`, `VERSOES` (Tarefa 4); `gravarNaReserva`, `lerDaReserva`, `apagarDaReserva` (Tarefa 2).
- Produces: `reconciliarImagensDoProduto({ produto, lote, itens, preservar = [], reservaExcluida = [] })`, com `itens: Array<{ base: string, arquivoId?: string, finalizada?: boolean, versao?: string, grupo?: string }>`; devolve o que devolvia mais `{ reservadas: number, reservaExcluidas: number }`. `versao` fora de `VERSOES` vale `"original"`.
- `gravarImagensDoLote(produto, formData)` passa a **delegar** a `reconciliarImagensDoProduto` (produto recém-criado não tem linhas: toda foto é "nova"); mantém a leitura do `imagensDoLote`, o `try/catch` de aviso do chamador e a primeira foto como principal. `gravarImagensDoPainel` repassa `reservaExcluida: ler("reservaExcluida")` (só ids em texto).

**Regras do Salvar.** `G` é o grupo da foto: `linha.grupo ?? linha.id` quando o `arquivoId` é de uma FOTO do produto; senão `item.grupo` se for grupo de alguma linha (FOTO ou RESERVA) deste produto; senão um `randomUUID()` novo. "Geradas" são as versões presentes em `versoes/` do lote (`original`, `photoroom`, `nanobanana`); "paga" é ter `photoroom` ou `nanobanana`. Dois arquivos são "iguais" quando o sha1 dos bytes é o mesmo.

1. **Foto validada** segue o plano de hoje: `mantida` (bytes iguais aos do disco: não reescreve nada e **não mexe em `versao`**), `substituida`, `nova`. Linhas novas e substituídas gravam `papel FOTO`, `versao` do item e `grupo G`; linha existente sem `grupo` recebe `G`.
2. **O que desce para a reserva:** o arquivo velho de uma `substituida` vai para a reserva (nova linha `RESERVA`, `versao` = a da linha, grupo `G`) quando `linha.versao !== "original"` ou a nova `versao` não é `original`. Se a linha era `original` e continua `original` (padronização de foto antiga), o velho é apagado, como hoje. Uma FOTO existente que sai da lista **mas divide o grupo com uma foto validada que ficou** vira `RESERVA` (a mesma linha muda de papel, ordem 0, não principal) em vez de ser apagada.
3. **Versões geradas vão para a reserva:** para cada foto validada, toda versão de `versoes/` cujo sha1 difere do da foto final vira linha `RESERVA` (bytes lidos do lote, `versao` = o nome, grupo `G`).
4. **Foto paga sem validar** (`finalizada: false` e alguma versão paga em `versoes/`): nada entra no carrossel; todas as versões de `versoes/` (inclusive `original`) viram `RESERVA`. Se era FOTO do produto, a linha e o arquivo dela são apagados (o conteúdo já está em `versoes/`).
5. **Sem duplicata dentro do grupo:** não se cria `RESERVA` cujo sha1 já exista no grupo (na foto final, em outra versão nova ou em `RESERVA` existente); e uma `RESERVA` existente com o mesmo sha1 da foto final é apagada (linha e arquivo), porque o conteúdo agora mora na FOTO.
6. **Candidata nunca tocada** (não validada, sem arquivoId, sem versão gerada): nada é gravado. **FOTO do produto não validada sem versão paga**, ou excluída na tela (fora da lista e sem foto do mesmo grupo na lista): linha e arquivo apagados, como hoje.
7. **`reservaExcluida`:** só ids de linhas `RESERVA` deste produto; apaga linha e arquivo. Qualquer outro id é ignorado.

Ordem das operações, como já é hoje: arquivos novos entram primeiro (reserva e pasta do produto), depois a transação do banco, e só no fim os arquivos velhos saem. As cópias para a reserva usam `gravarNaReserva` (nome novo), nunca renomeiam arquivo do produto antes da transação.

- [ ] **Step 1: Escrever os testes que falham** (produto próprio, lotes montados à mão com `adicionarImagem`, `guardarVersao` e `garantirOriginalGuardado`; arquivos de reserva conferidos em `caminhoDaReserva`). Cenários, cada um com a asserção do estado final de linhas e arquivos:
  - S1 produto sem fotos, foto nova validada com `versao: "photoroom"` e original guardada → 1 FOTO (`photoroom`) e 1 RESERVA (`original`), mesmo `grupo`; `reservadas: 1`.
  - S2 validada escolhendo a original, com versão `nanobanana` paga → 1 FOTO (`original`) e 1 RESERVA (`nanobanana`); a `versoes/original` (mesmos bytes da FOTO) **não** vira RESERVA.
  - S3 paga sem validar → nenhuma FOTO nova; 2 RESERVA (`original`, `nanobanana`) no mesmo grupo.
  - S4 candidata nunca tocada, sem validar → nada gravado.
  - S5 foto existente `original`, escolhe `nanobanana` → a linha é a mesma, com arquivo novo e `versao nanobanana`; o arquivo velho sumiu da pasta de imagens e existe em `reserva/` como RESERVA `original`; **uma** RESERVA só (a `versoes/original` não duplica). **(Review Focus 3)**
  - S6 regressão da foto antiga em PNG (`NOME_ANTIGA`): padronizada na mesma linha, o PNG some e **nada** vai para a reserva.
  - S7 FOTO `nanobanana` com RESERVA `original` e as duas versões carregadas no lote; o dono escolhe a original e salva → FOTO com os bytes da original, 1 RESERVA `nanobanana`, 0 duplicatas. **(Review Focus 4)**
  - S8 item novo com `grupo` de uma RESERVA e os bytes dela, e a FOTO do mesmo grupo fora da lista → vira FOTO; a FOTO antiga desce para RESERVA; a RESERVA de origem some; no fim 1 FOTO e 1 RESERVA.
  - S9 `reservaExcluida: [idDaReserva, idDeFoto, "outro-produto"]` → só a RESERVA some (linha e arquivo); a FOTO e o resto ficam.
  - S10 FOTO excluída na tela (fora da lista, sem versão e sem item do mesmo grupo) → apagada de verdade, sem RESERVA.
  - S11 reabrir sem mudar nada (itens iguais) → `reservadas: 0`, nenhuma linha criada ou apagada, arquivos intactos.
  - S12 as 100 fotos: produto com `MAXIMO_IMAGENS` FOTO validadas e 3 RESERVA salva sem apagar a reserva nem estourar o limite (`slice` só nas validadas).
- [ ] **Step 2: Rodar e ver falhar.** Run: comando de teste. Expected: FALHA nos cenários novos; os blocos antigos de Salvar continuam passando.
- [ ] **Step 3: Implementar** `produto.js` pelas regras acima. Carregar as linhas `RESERVA` do produto uma vez no início (com os bytes só quando precisar do sha1). Atualizar o comentário de cabeçalho da função: o "arquivo velho é apagado" agora tem exceções (reserva) e o "SO AS VALIDADAS FICAM" ganha a exceção da foto paga.
- [ ] **Step 4: Ligar em `acoes.js`:** `gravarImagensDoLote` delega; `gravarImagensDoPainel` repassa `reservaExcluida`.
- [ ] **Step 5: Rodar o teste.** Expected: `TODOS OS TESTES PASSARAM` (inclusive os blocos antigos de "Fotos de um produto que ja existe").
- [ ] **Step 6: Commit.** `Nano Banana: Salvar guarda originais e versoes geradas na reserva do produto`.

### Task 6: Reabrir produto com reserva (Opus)

**Files:**
- Modify: `src/app/produtos/acoes-imagens.js` (`prepararFotosDoProduto`), `src/lib/imagens/lote.js`
- Test: `scripts/teste-imagens.js` (bloco "Reabrir com reserva")

**Interfaces:**
- Consumes: `guardarVersao`, `garantirOriginalGuardado`, `lerVersao` (Tarefa 4); `lerDaReserva`, `urlDaReserva` (Tarefa 2).
- Produces em `lote.js`: `definirOriginal(lote: string, base: string, bytes: Buffer): Promise<void>` (grava `originais/<base>.jpg` e apaga as variantes `.png`/`.webp`).
- Produces em `prepararFotosDoProduto(lote, produtoId)`: devolve `{ ok, imagens, naoCarregadas, reserva }`. Cada `imagem` ganha `versao` (da linha) e `grupo` (`linha.grupo ?? linha.id`). `reserva`: `Array<{ id: string, grupo: string, versao: string, url: string }>` das linhas `RESERVA` de imagem, por `criadoEm`, com `url` de `urlDaReserva`.
- Para cada FOTO cujo grupo tem RESERVA: as reservas legíveis entram em `versoes/<base>.<versao>.jpg`; a própria foto entra como `versoes/<base>.<linha.versao>.jpg`; se há RESERVA `original`, ela vira o original do lote (`definirOriginal`), para o Nano Banana e o Photoroom partirem da original verdadeira e não da foto atual. Foto sem reserva: se `versao === "original"`, nada muda; sem original separado, `garantirOriginalGuardado` só roda quando há versão gerada. O `imagem.versoes`/`imagem.urls` vêm de `versoesParaTela`.

- [ ] **Step 1: Escrever os testes que falham.** Produto com FOTO `nanobanana` e RESERVA `original` (bytes distintos):
  - **(Review Focus 4)** `prepararFotosDoProduto` devolve `imagem.versao === "nanobanana"`, `imagem.versoes.nanobanana === true`, `imagem.urls.original` preenchida, e `originalDoLote(lote, base).bytes` igual aos bytes da RESERVA `original` (e diferente da FOTO);
  - `reserva.length === 1`, `reserva[0].versao === "original"`, `url` começa por `/api/arquivos/<sku>/reserva/`;
  - reabrir e salvar sem mudar (`reconciliarImagensDoProduto` com os itens devolvidos) → 0 linhas criadas, 0 apagadas, a contagem de RESERVA continua 1, nenhum arquivo novo em `reserva/`;
  - produto sem reserva continua igual ao de hoje (as asserções antigas de "abrir a edicao traz as 3 fotos" seguem passando) e `reserva` vem `[]`;
  - reserva com arquivo sumido do disco não derruba a abertura: a foto abre, a reserva ilegível só não entra em `versoes/`.
- [ ] **Step 2: Rodar e ver falhar.** Run: comando de teste. Expected: FALHA.
- [ ] **Step 3: Implementar** `definirOriginal` e a carga de versões em `prepararFotosDoProduto`, uma consulta só para as RESERVA do produto agrupadas por `grupo`.
- [ ] **Step 4: Rodar o teste.** Expected: `TODOS OS TESTES PASSARAM`.
- [ ] **Step 5: Commit.** `Nano Banana: reabrir produto carrega a reserva e parte da original verdadeira`.

### Task 7: Gerar com Nano Banana (Opus)

**Files:**
- Create: `src/app/produtos/acoes-nanobanana.js` (`"use server"`)
- Modify: `src/lib/imagens/lote.js`
- Test: `scripts/teste-imagens.js` (bloco "Nano Banana: gerar (usa o Postgres e dados/, fetch simulado)")

**Interfaces:**
- Consumes: `gerarImagem`, `avaliarConfiguracao`, `MODELOS`, `MAXIMO_EXTRAS`, `MAXIMO_PROMPT` (Tarefa 3); `registrarChamada`, `usoDoNanoBanana` (Tarefa 3); `garantirOriginalGuardado`, `guardarVersao`, `originalDoLote` (Tarefa 4); `padronizarImagem`; `versoesParaTela` (Tarefa 4).
- Produces em `lote.js`: `adicionarExtra(lote: string, base: string, bytes: Buffer): Promise<{ ok: true, n: number } | { ok: false, erro: string }>` (valida com `padronizarImagem`, guarda os bytes originais em `extras/<base>.<n>.<ext>`, `n` de 1 a `MAXIMO_EXTRAS`, primeiro número livre; cheio → "No maximo 5 imagens extras por foto."); `lerExtra(lote, base, n): Promise<{ bytes: Buffer, extensao: "jpg"|"png"|"webp" } | null>`; `removerExtra(lote, base, n): Promise<void>`; `gravarGeracao(lote, base, dados: object): Promise<void>` e `lerGeracao(lote, base): Promise<object | null>` (`geracoes/<base>.json`, com `em`).
- Produces em `acoes-nanobanana.js`: `gerarComNanoBanana(lote: string, base: string, pedido: { modelo: string, prompt: string, extras: Array<{ tipo: "foto", base: string } | { tipo: "enviada", n: number }>, repetida?: boolean }): Promise<{ ok: true, versoes: object, urls: object, custoUsd: number, duracaoMs: number } | { ok: false, erro: string }>`. Não devolve a foto inteira: o cliente só mescla `versoes` e `urls` e não perde `finalizada` nem `versao`.

**Ordem do `gerarComNanoBanana`** (cada recusa devolve `{ ok: false, erro }` e **não chama o Google**): lote/base válidos; modelo em `MODELOS`; prompt (com `trim`) não vazio e até `MAXIMO_PROMPT`; configuração (`avaliarConfiguracao`); teto do dia (`usoDoNanoBanana().hoje >= tetoDia` → "O limite de N geracoes de hoje acabou. Volta amanha ou aumente NANO_BANANA_TETO_DIA."; se o uso não puder ser lido, recusa: o gasto é real); uma geração por vez por foto (conjunto em `globalThis`, chave `<lote>:<base>`, solto num `finally`; já em curso → "Ja ha uma geracao desta foto em andamento."); original do lote (`originalDoLote`); extras (modelo `aceitaExtras` e até `MAXIMO_EXTRAS`; `tipo: "foto"` lê o original da outra foto do lote e não pode ser a própria; `tipo: "enviada"` lê `lerExtra`; qualquer extra faltando → "Uma das imagens extras nao esta mais disponivel." **antes** de cobrar); `gerarImagem`; se `enviada`, `registrarChamada` (`pixelsOrigem` vem das dimensões da original, `extras` e `tamanhoPrompt` contados, `repetida` do pedido); resposta não ok → o erro; `padronizarImagem` do resultado (falha → "A geracao foi cobrada, mas a imagem recebida nao pode ser tratada: ..."); `garantirOriginalGuardado`; `guardarVersao(..., "nanobanana", ...)` (troca a anterior: só a última geração fica); `gravarGeracao` com modelo, prompt e extras; devolve `versoesParaTela`. **Nunca** apaga ou sobrescreve `imagens/<base>.jpg`, a original nem a versão do Photoroom.

- [ ] **Step 1: Escrever os testes que falham** (`fetch` simulado devolvendo um PNG 700×700 como o do Photoroom; `process.env.GEMINI_API_KEY`, `NANO_BANANA_GERACAO=true`, `NANO_BANANA_TETO_DIA` restaurados no `finally`):
  - gerar com sucesso: 1 chamada, `versoes.nanobanana === true`, `lerVersao(..., "nanobanana")` é 1024×1024, a foto do produto (`imagens/<base>.jpg`) **não** mudou, a versão do Photoroom e a original seguem intactas, `geracoes/<base>.json` existe, uma linha `GEMINI` com status 200 e sem prompt ou chave no `requestResumo`; **(Review Focus 3)**
  - "gerar de novo" (`repetida: true`): 2ª chamada **troca** a versão `nanobanana` (bytes diferentes), continua com 1 só arquivo `nanobanana`; `usoDoNanoBanana().hoje` conta 2; **(Review Focus 3)**
  - trava desligada, sem chave, prompt vazio, modelo desconhecido, extra faltando, extra da própria foto, mais de 5 extras: nenhuma chamada ao `fetch` (contador igual) e mensagem em português; **(Review Focus 2)**
  - teto: com `NANO_BANANA_TETO_DIA=1` e 1 geração hoje, a próxima é recusada sem chamar o `fetch`;
  - **duas ao mesmo tempo (Review Focus 2):** `Promise.all` de duas gerações da mesma foto com `fetch` que espera uma promessa solta depois → 1 chamada, 1 sucesso e 1 "ja ha uma geracao"; depois de liberar, uma terceira funciona (o conjunto foi solto);
  - foto diferente no mesmo instante não bloqueia (duas fotos, 2 chamadas);
  - Lite: o corpo enviado tem só texto e a original, mesmo com extras pedidos; extra do carrossel manda os bytes do original da outra foto, na ordem; extra enviada manda `extras/<base>.<n>`;
  - **(Review Focus 5)** `fetch` devolvendo 200 só com texto, 200 com `IMAGE_SAFETY`, 200 com base64 inválido e 200 com imagem que o `sharp` não abre: `ok: false`, nada gravado em `versoes/`, e a linha de log existe com `statusHttp 200` só nos casos em que o Google respondeu 200; 429 e erro de rede: log com o status e **sem** contar no `usoDoNanoBanana`;
  - resposta fora de 1:1 (ex.: 1024×768): aceita, e a versão guardada sai 1024×1024 com fundo branco (o padronizador enquadra).
- [ ] **Step 2: Rodar e ver falhar.** Run: comando de teste. Expected: FALHA.
- [ ] **Step 3: Implementar** as funções de extras e de geração em `lote.js` e o `gerarComNanoBanana`. Ler o guia de server actions do Next em `node_modules/next/dist/docs/` antes de criar o arquivo.
- [ ] **Step 4: Rodar o teste.** Expected: `TODOS OS TESTES PASSARAM`.
- [ ] **Step 5: Commit.** `Nano Banana: acao de gerar com trava, teto, uma por vez e versao guardada no lote`.

---

## Bloco 3 — Sonnet

### Task 8: Prompt salvo, extras e estado (Sonnet)

**Files:**
- Modify: `src/app/produtos/acoes-nanobanana.js`
- Test: `scripts/teste-imagens.js` (bloco "Nano Banana: prompt, extras e estado")

**Interfaces:**
- Consumes: `MODELOS`, `MODELO_PADRAO`, `PROMPT_PADRAO`, `avaliarConfiguracao`, `usoDoNanoBanana`, `MAXIMO_*`, `adicionarExtra`, `removerExtra`, `cotacaoDoDolar`, `emReais`.
- Produces em `acoes-nanobanana.js`:
  - `estadoDoNanoBanana(): Promise<{ config: { ok: boolean, motivo: string | null }, modelos: Array<{ chave: string, nome: string, usd: number, brl: number, aceitaExtras: boolean }>, modeloPadrao: string, prompts: Record<string, string>, cotacao: object, uso: { hoje: number, mes: number, limiteDia: number, gastoMesUsd: number } | null, gastoMesBrl: number | null, maximoExtras: number, maximoPrompt: number }>`. `prompts` traz, por chave de modelo, o texto salvo na tabela `PromptImagem` ou o `PROMPT_PADRAO` quando não há linha.
  - `salvarPromptDoModelo(modelo: string, texto: string): Promise<{ ok: true, texto: string } | { ok: false, erro: string }>`: modelo conhecido, texto com `trim` não vazio e até `MAXIMO_PROMPT`; grava com `upsert`; texto igual ao `PROMPT_PADRAO` apaga a linha (padrão do código = sem linha).
  - `adicionarExtraAoLote(lote: string, base: string, formData: FormData): Promise<{ ok: true, extra: { n: number, url: string } } | { ok: false, erro: string }>` (campo `arquivo`; recusa arquivo vazio, acima de `MAXIMO_EXTRA_BYTES` e o que não é imagem; `url` = `/api/temporarios/<lote>/extras/<base>.<n>.<ext>?v=<Date.now()>`).
  - `removerExtraDoLote(lote: string, base: string, n: number): Promise<{ ok: true } | { ok: false, erro: string }>`.

- [ ] **Step 1: Escrever os testes que falham:** `estadoDoNanoBanana().modelos` em ordem com `brl` `[0.4, 0.8, 0.2]` (0,067 × 6; 0,134 × 6; 0,034 × 6, arredondados ao centavo) e `aceitaExtras` `[true, true, false]`; sem linha, `prompts[<chave>] === PROMPT_PADRAO`; `salvarPromptDoModelo` grava e `estadoDoNanoBanana` devolve o texto salvo **só para aquele modelo**; salvar o texto igual ao padrão remove a linha (`prisma.promptImagem.count` = 0); texto vazio, só espaços, com 2.001 caracteres e modelo inexistente são recusados e não gravam; extras: enviar JPEG válido devolve `n: 1` e URL que a rota de `temporarios` entrega (200); o 6º é recusado ("No maximo 5..."); arquivo de texto renomeado `.jpg` é recusado; `removerExtraDoLote` apaga o arquivo e libera o número. Limpar as linhas `PromptImagem` criadas no `finally`.
- [ ] **Step 2: Rodar e ver falhar.** Run: comando de teste. Expected: FALHA.
- [ ] **Step 3: Implementar** as quatro funções.
- [ ] **Step 4: Rodar o teste.** Expected: `TODOS OS TESTES PASSARAM`.
- [ ] **Step 5: Commit.** `Nano Banana: prompt salvo por modelo, imagens extras e estado para a tela`.

### Task 9: Aba Nano Banana na janela (Sonnet)

**Files:**
- Create: `src/components/produtos/PainelNanoBanana.jsx`
- Modify: `src/components/produtos/JanelaDeFotos.jsx`, `src/components/produtos/PainelDeImagens.jsx`

**Interfaces:**
- Consumes: `estadoDoNanoBanana`, `salvarPromptDoModelo`, `adicionarExtraAoLote`, `removerExtraDoLote`, `gerarComNanoBanana` (Tarefas 7 e 8); `escolherVersaoNoLote(lote, base, "nanobanana")` (Tarefa 4).
- Produces: `PainelNanoBanana({ lote, imagem, outras, estado, dados, mudarDados, parado, aoGerado, aoEscolher, aoAmpliar, zoom, setZoom })` (cliente). `JanelaDeFotos` ganha a prop `aoAtualizarFoto(base: string, parcial: object)` e `PainelDeImagens` a implementa com `mudarLista` (mescla `versoes` e `urls` na foto do rascunho sem tocar em `finalizada` nem `versao`).

Fonte do desenho: spec §7 e o mockup do layout B (`.superpowers/brainstorm/918-1791247755/content/layout-janela.html`). O valor em reais vem de `estado.modelos[i].brl` (a spec usa "R$ 0,35" só como exemplo: NB2 dá R$ 0,40).

- [ ] **Step 1: `JanelaDeFotos`:** o quadro da direita ganha abas **Photoroom | Nano Banana**; aba lembrada por foto em `porFoto[base].aba` (padrão `photoroom`). Carregar `estadoDoNanoBanana()` junto do `estadoDoPhotoroom()`. Rodapé: acrescentar "Nano Banana no mes: R$ X" ao lado do texto do Photoroom (em duas linhas, como o dele). A aba Photoroom fica como está.
- [ ] **Step 2: `PainelNanoBanana`**, de cima para baixo (textos sem acento, no padrão do código):
  1. Quadro com a última geração (`imagem.urls.nanobanana`), zoom e ampliação iguais aos do Photoroom. Vazio: "O resultado aparece aqui. Cada geracao custa R$ X." Enquanto gera: "Gerando... (uns 10 a 30 s)".
  2. Lista de modelos (nome e preço em reais), padrão `estado.modeloPadrao`; o Lite mostra o aviso "ignora as imagens extras".
  3. Prompt: caixa preenchida com `estado.prompts[modelo]`; contador `n/2000`; **"Salvar prompt"** só acende quando o texto difere do salvo (`salvarPromptDoModelo`, depois atualiza o salvo local); **"Voltar ao salvo"**; editar sem salvar vale só para esta geração; vazio deixa "Gerar" cinza. Trocar de modelo carrega o salvo daquele modelo.
  4. Imagens extras: tira com as `outras` fotos do carrossel (clicar marca e desmarca) e as enviadas (`+ Enviar`, botão `×` remove); até `estado.maximoExtras` no total; vazio é normal. Com o Lite escolhido, a tira fica apagada.
  5. Botões: "Gerar (R$ X)", e depois da primeira geração "Gerar de novo (R$ X)", mais "Escolher essa". **Confirmação de preço** em faixa amarela antes de cobrar: "Gerar com {nome} por R$ {x} (US$ {y})? Cada geracao e cobrada e sai diferente." com "Sim, gerar" e "Voltar". Sem chave ou com a trava desligada: faixa com `estado.config.motivo` e "Gerar" cinza; o resto funciona.
  6. "Escolher essa" chama `aoEscolher` (que usa `escolherVersaoNoLote(..., "nanobanana")` do painel e valida a foto). Fica desligado só quando `imagem.versao === "nanobanana"` e `dados.nb.novaGeracao !== true`; depois de **gerar de novo** com a versão já escolhida, `novaGeracao` fica `true` (a escolhida continua sendo a geração anterior, e o botão volta a poder trocar). Para ficar com as duas gerações: escolher a primeira antes de gerar a segunda, e a segunda vai para a reserva ao salvar.
  7. O estado de cada foto (modelo, prompt editado, extras marcados, aba) mora em `porFoto[base].nb`, e não no componente: fechar a janela não perde nada.
- [ ] **Step 3: Estados do botão e da janela:** `gerando` desabilita todos os botões da foto (a trava de verdade é a do servidor). Depois de gerar com sucesso: `aoGerado({ versoes, urls })` → `aoAtualizarFoto`, e a aba Nano Banana mostra o resultado novo.
- [ ] **Step 4: Verificar na tela.** Lint (`npx eslint src/components/produtos`). Sem chave no `.env`: abrir "Melhorar", clicar na aba Nano Banana e conferir a faixa com o motivo, "Gerar" cinza, prompt preenchido com o padrão, "Salvar prompt" apagado, e salvar um prompt editado (acende, salva, apaga e volta ao salvo ao recarregar a janela); enviar uma imagem extra; trocar o modelo e ver o preço mudar. Com `GEMINI_API_KEY=chave-falsa` e `NANO_BANANA_GERACAO=true`: a confirmação de preço aparece e o clique em "Sim, gerar" mostra o erro traduzido de chave recusada. `read_console_messages` sem erros. (A geração de verdade só pode ser vista na Tarefa 11, com a chave do dono.)
- [ ] **Step 5: Commit.** `Nano Banana: aba na janela de fotos com modelo, prompt salvo, imagens extras e confirmacao de preco`.

### Task 10: Reserva na tela (Sonnet)

**Files:**
- Create: `src/components/produtos/ReservaDeImagens.jsx`
- Modify: `src/app/produtos/acoes-imagens.js`, `src/components/produtos/PainelDeImagens.jsx`, `src/components/produtos/FormularioProduto.jsx`

**Interfaces:**
- Consumes: `lerDaReserva`, `urlDaReserva` (Tarefa 2); `adicionarImagem` (lote); `imagemParaTela` (Tarefa 4); a lista `reserva` de `prepararFotosDoProduto` (Tarefa 6).
- Produces em `acoes-imagens.js`: `trazerDaReserva(lote: string, reservaId: string): Promise<{ ok: true, imagem: object } | { ok: false, erro: string }>`: linha `RESERVA` de imagem, lê os bytes, `adicionarImagem` no lote e devolve `imagemParaTela(..., { finalizada: true, versao: <da reserva>, grupo: <da reserva>, reservaId })`. Linha que não é RESERVA ou arquivo sumido → erro.
- Produces em `ReservaDeImagens({ reserva, aoEscolher, aoGerar, aoExcluir, aoFechar, ocupado })`: grade de miniaturas com a etiqueta da versão ("Original", "Photoroom", "Nano Banana"), "Escolher essa", "Gerar com Nano Banana" (só nas de versão `original`) e "Excluir" com confirmação em dois cliques ("Clique de novo para confirmar").
- Produces no `FormularioProduto`: estado `reserva` (carregado com as fotos) e `reservaExcluida: string[]`; campo oculto `reservaExcluida` com o JSON dos ids; o `imagensDoLote` passa a mandar também `grupo: imagem.grupo ?? null` em cada item (a `versao` já vai desde a Tarefa 4).

- [ ] **Step 1: Teste da ação** (em `teste-imagens.js`, no bloco de reabrir): `trazerDaReserva` com uma RESERVA devolve uma imagem com `finalizada: true`, `grupo`, `versao` e os bytes da RESERVA em `imagens/<base>.jpg`; com id de FOTO ou de outro produto → `ok: false`. Rodar, ver falhar, implementar `trazerDaReserva`, rodar de novo (`TODOS OS TESTES PASSARAM`).
- [ ] **Step 2: `FormularioProduto`:** guardar `resposta.reserva` no efeito que já chama `prepararFotosDoProduto`; estado `reservaExcluida`; o campo oculto; o campo `grupo` no `imagensDoLote`. Passar ao `PainelDeImagens`: `reserva` (só em produto existente, `null` em produto novo), `reservaExcluida` e o setter.
- [ ] **Step 3: `PainelDeImagens`:** botão **"Reserva (N)"** ao lado de "Melhorar", só quando `reserva !== null`. `N` = linhas da reserva que não estão marcadas para excluir nem já trazidas para o carrossel (`imagens.some(i => i.reservaId === r.id)`). O botão abre o `ReservaDeImagens`. Ações:
  - **Escolher essa:** `trazerDaReserva` → a foto nova **substitui na mesma posição** a foto do carrossel de mesmo `grupo` (se houver; senão entra no fim); fica validada. O Salvar faz o resto (a foto antiga desce para a reserva e a RESERVA de origem some, pelas regras 2 e 5 da Tarefa 5).
  - **Gerar com Nano Banana** (reserva `original`): `trazerDaReserva` e depois sobrescreve `finalizada: false` na foto trazida, abre a janela de fotos já nela (`abrirJanela()` + `setFoco(base)`).
  - **Excluir:** adiciona o id a `reservaExcluida` (some da grade; só apaga no Salvar do produto, como o resto do formulário; Cancelar não gravou nada).
- [ ] **Step 4: Verificar na tela** com um produto existente que tenha RESERVA (criar pelo teste da Tarefa 5 ou inserindo linhas à mão em produto de teste e apagando depois): o botão mostra o número certo; a grade mostra as etiquetas; "Escolher essa" troca a foto do carrossel na mesma posição e o "Reserva (N)" diminui; "Excluir" pede o segundo clique e depois some da grade; Cancelar do produto não grava nada; produto novo **não** mostra o botão. Lint e console sem erros.
- [ ] **Step 5: Commit.** `Nano Banana: botao Reserva no painel de fotos, trazer da reserva e excluir da reserva`.

### Task 11: Teste manual com a chave, documentação e fechamento (Sonnet)

**Files:**
- Create: `scripts/teste-nano-banana.js`
- Modify: `CLAUDE.md` (o `package.json` é da outra frente: o roteiro roda com `node scripts/teste-nano-banana.js`)

- [ ] **Step 1: Escrever `scripts/teste-nano-banana.js`** (manual, **cobra**): exige `--confirmo` e `--foto <caminho>`; lê `GEMINI_API_KEY` do `.env` (sem exigir a trava, mas avisando); manda a foto ao Nano Banana 2 e ao Pro com o `PROMPT_PADRAO`; imprime duração, status, **as chaves do JSON de resposta** (para confirmar o formato do corpo) e grava os dois resultados em `dados/temporarios/teste-nano-banana/` (pasta ignorada pelo git, apagável); nunca imprime a chave nem o base64. Custo esperado: cerca de US$ 0,20. Cabeçalho do arquivo avisa isso.
- [ ] **Step 2: Passos do dono (spec §11), fora do código.** Pedir ao dono, com o passo a passo da spec: criar a chave no Google AI Studio (projeto "Rise"), ativar o faturamento, conferir que a chave aparece como paga, colar em `GEMINI_API_KEY=` no `.env` e reiniciar o servidor. `NANO_BANANA_GERACAO=true` só depois do passo 3 deste plano. Opcional: orçamento mensal com alerta no Google Cloud.
- [ ] **Step 3: Rodar o roteiro com a chave real** (depois de o dono entregar a chave): `node scripts/teste-nano-banana.js --confirmo --foto <foto de um produto do dono>`. Expected: status 200 nos dois modelos e duas imagens abertas. Se o corpo clássico for recusado ou a resposta vier em outro formato, ajustar **só** `montarPedido` e `lerResposta` em `nanobanana.js` e o teste puro correspondente. Olhar as duas imagens com o dono: o produto é o mesmo (forma, cores, conectores, textos)? Ajustar o `PROMPT_PADRAO` só se ele pedir.
- [ ] **Step 4: Passada na tela, com a chave, produto novo e produto existente** (liga `NANO_BANANA_GERACAO=true` para isso): gerar, ver o resultado, "Gerar de novo", escolher, salvar o produto, reabrir e conferir "Reserva (N)", escolher uma da reserva, excluir uma, salvar. Para cada passo, `read_console_messages` e a rede sem erro, e screenshot do que importa.
- [ ] **Step 5: Documentação.** `CLAUDE.md`: seção das fotos do produto (versão nomeada, reserva, pastas `extras/` e `geracoes/` do lote, `reserva/` do produto, a regra "toda leitura de foto filtra `papel: "FOTO"`"), seção de integrações (Google/Nano Banana, variáveis, trava, teto, `Servico.GEMINI`, preços e a data da conferência), seção de testes (os blocos novos de `teste:imagens`), e corrigir o que ficou desatualizado (originais somem no Salvar; coluna `finalizada` continua sem uso e por que não foi removida).
- [ ] **Step 6: Fechamento.** `npx eslint` (o único erro aceito é o de `CartaoConector.jsx`, da outra frente); `npm run teste:imagens`, `teste:extracao`, `teste:cadastros`, `teste:coleta` e `teste:worker`, cada um com a saída em arquivo; conferir `git status` (nenhum arquivo da outra frente no commit); revisão final **inline** da diferença da branch contra a spec (§1 a §9 e §13), sem subagente; parar o servidor do companion visual (`bash <skill-dir>/scripts/stop-server.sh C:\00-Dev\Projeto_sistema_Rise\sistema-rise\.superpowers\brainstorm\918-1791247755`).
- [ ] **Step 7: Commit** (`scripts/teste-nano-banana.js`, `CLAUDE.md`, ajustes de formato se houver): `Nano Banana: roteiro manual com a chave, documentacao e fechamento`. Push ao GitHub só se o dono pedir.

---

## Auto-revisão (feita ao escrever)

**Cobertura da spec.** §1 objetivo e §2 decisões → Tarefas 3 a 10 (seletor de modelo: 3 e 9; prompt por modelo: 8 e 9; extras: 7, 8 e 9; confirmação de preço: 9; reserva: 2, 5, 6 e 10). §3 → 4. §4 → 3 (modelos, preços, endpoint) e 11 (formato confirmado com a chave). §5.1 → 4. §5.2 → 4 e 7. §5.3 → 1. §5.4 → 2. §5.5 → 5. §5.6 → 6 e 10. §6 → 3 e 7. §7 → 9 e 10. §8 → 3 (`PROMPT_PADRAO`, `REGRA_EXTRAS`) e 7 (só a última geração fica). §9 → 3, 7 e 8. §10 → testes em cada tarefa mais a 11. §11 → 11. §12 fora do plano. §13 → cabeçalho e blocos.

**Decisões que a spec deixou abertas e o plano fixou:** o `ADD VALUE` e o backfill `grupo = id` na mesma migration; `finalizada` não é removida (risco ao client antigo da outra frente); a reserva é comparada por sha1 dentro do grupo (evita duplicata sem renomear arquivo do produto); o Salvar do produto novo delega ao `reconciliarImagensDoProduto`; o Nano Banana parte da original verdadeira também ao reabrir (a original vem da reserva); excluir da reserva só grava no Salvar do produto; o rótulo `versao` da FOTO vem do cliente (só rótulo, nenhuma regra de segurança depende dele); fonte do R$ do botão é `emReais` (R$ 0,40 no Nano Banana 2), e não o R$ 0,35 ilustrativo da spec.

**Consistência de nomes** conferida entre tarefas: `VERSOES`, `guardarVersao`, `garantirOriginalGuardado`, `lerVersao`, `versoesDoLote`, `escolherVersao`, `imagemParaTela`/`versoesParaTela` (módulo `paraTela.js`), `gravarNaReserva`/`lerDaReserva`/`apagarDaReserva`, `reconciliarImagensDoProduto({ ..., reservaExcluida })`, `gerarComNanoBanana`, `estadoDoNanoBanana`, `trazerDaReserva`.
