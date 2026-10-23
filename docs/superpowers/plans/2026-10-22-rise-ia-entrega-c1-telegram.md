# Rise AI, Entrega C1: avisos no Telegram — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Rise manda ao Telegram do dono (e de quem mais o Administrador vincular) os avisos do dia a dia que o worker já
sabe calcular, com o link "Abrir no Rise", sem polling e sem nenhuma ação por texto.

**Architecture:** O token do bot fica cifrado em `Conexao` (serviço `TELEGRAM`, só de escrita, mascarado em todo log). O
vínculo de uma pessoa ao chat dela é um código de 12 caracteres gerado na tela do usuário, enviado ao bot como
`/vincular CÓDIGO` e conferido por UMA leitura curta do `getUpdates` (nada fica escutando). Quem envia é o **worker normal**
(o único processo longo da VPS), numa rotina a cada minuto que calcula os avisos devidos, grava cada um em `AvisoTelegram`
(chave única = idempotência) e manda os que ainda não saíram. A lista de avisos e o interruptor "Bot ligado" moram em
`ConfiguracaoIA.dados.telegram`, editados numa aba **Canais** nova de Rise AI › Configurações, só do Administrador.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Prisma 7 + Postgres 17, zod, `requisitar` de
`src/lib/integracoes/httpClient.js` (fila, log em `LogIntegracao`), `src/lib/crypto.js` (AES-256-GCM), API HTTP do
Telegram (`https://api.telegram.org/bot<token>/<método>`: `getMe`, `getUpdates`, `sendMessage`). JavaScript só, sem
TypeScript. Testes em `scripts/teste-*.js` com `conferir(nome, obtido, esperado)`.

**Spec:** `docs/superpowers/specs/2026-10-12-rise-ia-agente-design.md` (§3 restrições, §5a.5 aba Canais, §5a.7 formato
dos avisos, §7 Entrega C, §10 banco, §11-14 ordem e decisões) e a revisão
`docs/superpowers/investigacoes/2026-10-12-revisao-specs-rise-ia-acessos.md` (itens 13-16 e 28-33). A spec previa o
serviço `ia` e o WhatsApp antes da C; com a mudança de rumo de 20/10/2026 (CLAUDE.md, "Servidor MCP") não há serviço `ia` nem
chat interno, então **a C1 traz só os avisos que o Rise de hoje sabe calcular** (lista na Tarefa 7) e o resumo do dia
passa a contar as consultas pelo MCP no lugar das conversas do chat.

## Global Constraints

- **Deploy só com o "sobe" do dono.** Nada é mudado na VPS por este plano. **Pré-requisito do dono antes do deploy
  (spec §13):** o 2º fator do Tinyauth para Maicol e Andrea.
- **Token só de escrita e mascarado em todo lugar:** nunca volta à tela, nunca entra em `LogIntegracao.endpoint`,
  `requestResumo`, `erro`, `Conexao.ultimoErro`, mensagem de exceção ou `console`. O token vai na URL
  (`/bot<token>/`), então `httpClient.js` passa a mascarar esse trecho do `pathname` (Tarefa 3).
- **Segredo chega por `FormData`, nunca como argumento de Server Action** (o `next dev` imprime os argumentos).
- **Mensagem ao Telegram: texto puro, sem `parse_mode`, no máximo 4 linhas**, trecho de dado de cliente passado por
  `mascararDadosPessoais`, cortado em 120 caracteres e com `@`, `://` e `/` no começo de linha neutralizados
  (Tarefa 2). Nenhuma ação é interpretada de texto recebido: a única leitura do `getUpdates` é a do vínculo, e ela só
  reconhece `/vincular CÓDIGO`. **Na C1 não há botão de ação**, só o link "Abrir no Rise" (`inline_keyboard` com `url`).
- **Vínculo:** código de 12 caracteres aleatórios (alfabeto sem `0 O 1 I L`), só o hash SHA-256 no banco, validade de
  10 minutos, um chat liga a um usuário só (`telegramChatId @unique`), 5 tentativas erradas de um chat silenciam o chat e
  anulam o código, o Administrador confirma nome e `@usuário` na tela antes de gravar.
- **Idempotência:** cada aviso tem uma `chave` única em `AvisoTelegram`; nada é mandado duas vezes por releitura, reinício
  do worker ou volta do processo. O envio ao Telegram é `tentativas: 1` (uma repetição do `requisitar` em 5xx poderia
  mandar o mesmo aviso duas vezes); quem repete é a rotina do minuto seguinte, até 3 vezes por aviso.
- **Só o worker normal manda** (`!FONTES && !SO_NO_PC`), como a foto mensal. O do PC e o de teste nunca.
- **Quem recebe:** usuário ativo, com `telegramChatId`, e com `riseAi.configuracoes.canais` em `ver` (recurso não
  delegável: na prática o Administrador). Sem o bot ligado, ou sem token, ou sem destinatário, a rotina não faz nada e não
  grava nada.
- **Textos de tela com acento; identificadores, chaves e comentários sem acento** (Convenções do CLAUDE.md). Padrão
  visual: as 10 regras; componentes existentes (`CartaoDeProvedor`, `EntradaNoRise`, `ConfiguracoesEmAbas`, `Badge`,
  `BolhaDeAjuda`).
- **Banco: migrations só aditivas.** O valor novo do enum `Servico` vai numa migration própria. As migrations geradas
  por `migrate diff` perdem as linhas `DROP INDEX` dos índices que só existem no SQL.
- **Acessos:** toda ação nova confere o acesso na 1ª linha (o guarda estático do `teste:acessos` falha sem isso).
- **Commit só dos arquivos deste plano** (`git commit -F msg -- <caminhos>`); o CLAUDE.md só pelo próprio trecho.

## Review Focus

1. **Token colado com espaço, quebra de linha ou `bot` na frente** (`bot123:ABC`): o Rise guarda o token limpo e o
   `getMe` passa; token em branco é recusado. (Teste na Tarefa 6.)
2. **`getUpdates` com mais de 100 atualizações acumuladas** (alguém mandou lixo ao bot): a leitura do vínculo olha as
   100 mais recentes (`offset: -100`), acha o código mesmo assim, e depois da confirmação confirma o `update_id` para
   a próxima leitura não reler o passado. (Teste na Tarefa 4.)
3. **Chat que bloqueou o bot** (403 "bot was blocked by the user"): o aviso fica marcado com erro e **não** gasta as 3
   tentativas nem trava os outros destinatários; o bot continua ligado. (Teste na Tarefa 7.)
4. **Produto que zera, volta a ter estoque e zera de novo** avisa duas vezes; o que fica zerado por semanas avisa uma só;
   kit cujo estoque calculado zerou avisa como produto. (Teste na Tarefa 7.)
5. **Worker desligado às 20h**: o resumo do dia sai na primeira volta depois de religar, até 23:59 de São Paulo, e nunca
   dois no mesmo dia; religado no dia seguinte, o de ontem não sai. (Teste na Tarefa 7.)

---

## Mapa de arquivos

- Criar `src/lib/telegram/texto.js` — regras puras do texto: `neutralizar`, `trechoSeguro`, `mensagemDoAviso`, `linkAbrirNoRise`.
- Criar `src/lib/telegram/cliente.js` — `mascararToken`, `limparToken`, `criarClienteTelegram` (getMe, getUpdates, enviarMensagem, confirmarAtualizacoes).
- Criar `src/lib/telegram/vinculo.js` — `gerarCodigo`, `hashDoCodigo`, `avaliarAtualizacoes` (puras) e `iniciarVinculo`, `localizarVinculo`, `confirmarVinculo`, `desvincular`, `vinculosDaEquipe` (banco).
- Criar `src/lib/telegram/avisos.js` — `destinatarios`, `avisosDevidos` (por tipo), `deveMandarResumo`, `resumoDoDia`, `rodarAvisosDoTelegram`.
- Criar `src/lib/telegram/estado.js` — `estadoDoTelegram` (o que a aba Canais mostra: token cadastrado em, conta do bot, último teste, última falha, vinculados).
- Modificar `src/lib/integracoes/httpClient.js` — mascarar `/bot<token>/` no `endpoint` gravado.
- Modificar `prisma/schema.prisma` + 2 migrations — `Servico.TELEGRAM`; `UsuarioRise.codigoDeVinculoHash`, `codigoDeVinculoExpiraEm`; tabela `AvisoTelegram`.
- Modificar `src/lib/riseAi/configuracao.js`, `formularios.js`, `abasDeConfiguracao.js` — `telegram` no padrão, no zod, nos GRUPOS, no parcial e a aba `canais`.
- Modificar `src/lib/acessos/recursos.js` — `riseAi.configuracoes.canais` (não delegável); `scripts/teste-acessos.js` (a lista dos não delegáveis).
- Modificar `src/app/rise-ai/configuracoes/acoes.js` e `page.jsx`; criar `src/components/riseAi/AbaCanais.jsx`.
- Modificar `src/app/configuracoes/acoes.js`, `src/components/acessos/FormularioUsuario.jsx`; criar `src/components/acessos/VinculoTelegram.jsx`.
- Modificar `scripts/worker-processo.js` — a rotina do minuto e o ping do healthchecks; `.env.example` (`HEALTHCHECKS_WORKER_URL`).
- Criar `scripts/lib/telegramFalso.js` e `scripts/teste-telegram.js`; `package.json` (`teste:telegram`).
- Modificar `CLAUDE.md` — seção "Rise AI (Entrega C1, avisos no Telegram)" e a linha de `teste:telegram` em "Rodar".

---

### Task 1: Banco — `Servico.TELEGRAM`, o código de vínculo e `AvisoTelegram`

**Files:**
- Modify: `prisma/schema.prisma` (`enum Servico` linha 37-56; `model UsuarioRise`; tabela nova)
- Create: `prisma/migrations/20261022_servico_telegram/migration.sql`
- Create: `prisma/migrations/20261022t_telegram_avisos/migration.sql`
- Test: `scripts/teste-telegram.js` (nasce aqui, com o esqueleto de `scripts/teste-acessos.js` linhas 1-30: `dotenv/config`, `register` do `resolver-alias.js`, `prisma`, `conferir`, `limpar()` num `try/finally`)

**Interfaces:**
- Produces: `prisma.avisoTelegram` com `{ id, chave @unique, tipo, chatId, texto, criadoEm, enviadoEm?, tentativas, erro? }`; `prisma.usuarioRise.codigoDeVinculoHash: String?`, `codigoDeVinculoExpiraEm: DateTime?`; `Servico.TELEGRAM`.
- `limpar()` do teste apaga: `avisoTelegram` com `chave` começando por `zz-tg-`, `usuarioRise` com login `zz-tg-*` (e as `usuarioFuncao`/`auditoriaDeAcesso` deles, `quem` `zz-tg-*`), `logIntegracao` com `servico: "TELEGRAM"` e `endpoint` contendo `teste-rise.invalid`; e restaura a `Conexao` `TELEGRAM` e a `ConfiguracaoIA` `unica` do dono como estavam (ler no começo, gravar de volta no `finally`, como o `teste:rise-ai` faz com a OLLAMA).

- [ ] **Step 1: Escrever o teste que falha**

```js
{
  console.log("\nBanco");
  const u = await prisma.usuarioRise.create({ data: { login: "zz-tg-um", nome: "ZZ TG Um", codigoDeVinculoHash: "a".repeat(64), codigoDeVinculoExpiraEm: new Date() } });
  conferir("usuario guarda o hash e a validade do codigo", [u.codigoDeVinculoHash.length, u.codigoDeVinculoExpiraEm instanceof Date], [64, true]);
  await prisma.avisoTelegram.create({ data: { chave: "zz-tg-chave-1", tipo: "produtoZerou", chatId: "zz-tg-chat", texto: "x" } });
  conferir("chave do aviso e unica", await codigoDoErro(prisma.avisoTelegram.create({ data: { chave: "zz-tg-chave-1", tipo: "produtoZerou", chatId: "zz-tg-chat", texto: "y" } })), "P2002");
  conferir("aviso nasce sem envio e com 0 tentativas", (await prisma.avisoTelegram.findUnique({ where: { chave: "zz-tg-chave-1" } })).tentativas, 0);
  conferir("Servico aceita TELEGRAM", (await prisma.logIntegracao.create({ data: { servico: "TELEGRAM", metodo: "GET", endpoint: "https://teste-rise.invalid/bot***/getMe", statusHttp: 200, duracaoMs: 1 } })).servico, "TELEGRAM");
}
```

(`codigoDoErro` é o mesmo ajudante de `scripts/teste-acessos.js`: devolve `erro.code` da promessa rejeitada.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --env-file=.env scripts/teste-telegram.js > "$TMP/tg1.txt" 2>&1; tail -5 "$TMP/tg1.txt"`
Expected: FAIL com `Unknown argument codigoDeVinculoHash` (ou `prisma.avisoTelegram is undefined`).

- [ ] **Step 3: Schema e migrations**

`schema.prisma`: em `enum Servico`, depois de `OPENAI`, `/// Bot do Telegram (Entrega C1): avisos do worker. A URL leva o token, que o log mascara.` + `TELEGRAM`.
Em `UsuarioRise`, depois de `telegramChatId`: `codigoDeVinculoHash String?` (`/// SHA-256 do codigo de vinculo; o texto so aparece uma vez na tela.`) e `codigoDeVinculoExpiraEm DateTime?`.
Modelo novo:

```prisma
/// Um aviso mandado (ou a mandar) ao Telegram. A `chave` e a idempotencia: o mesmo fato nunca vira dois avisos.
model AvisoTelegram {
  id         String    @id @default(cuid())
  chave      String    @unique
  tipo       String
  chatId     String
  /// O texto como saiu (ja mascarado): e a trilha do que a pessoa recebeu.
  texto      String
  criadoEm   DateTime  @default(now())
  enviadoEm  DateTime?
  tentativas Int       @default(0)
  erro       String?

  @@index([enviadoEm, criadoEm])
}
```

Migration 1 (`20261022_servico_telegram`): só `ALTER TYPE "Servico" ADD VALUE 'TELEGRAM';`.
Migration 2 (`20261022t_telegram_avisos`): gerar com `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` DEPOIS de aplicar a 1 (o diff não propõe o valor do enum de novo), tirar qualquer `DROP INDEX`, e conferir que sobram só os dois `ALTER TABLE "UsuarioRise" ADD COLUMN`, o `CREATE TABLE "AvisoTelegram"` e os dois índices dele.
Aplicar: `npx prisma migrate deploy && npx prisma generate`.

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo comando do Step 2
Expected: `4 asserções, 0 falhas` (ou o total do arquivo) e nenhuma linha `zz-tg-` sobrando (`SELECT count(*) FROM "AvisoTelegram" WHERE chave LIKE 'zz-tg-%'` = 0).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261022_servico_telegram prisma/migrations/20261022t_telegram_avisos scripts/teste-telegram.js package.json
git commit -F "$TMP/msg.txt" -- prisma/schema.prisma prisma/migrations/20261022_servico_telegram prisma/migrations/20261022t_telegram_avisos scripts/teste-telegram.js package.json
```
Mensagem: `feat(telegram): Servico TELEGRAM, codigo de vinculo e AvisoTelegram (Entrega C1, tarefa 1)`. O `package.json` ganha `"teste:telegram": "node scripts/teste-telegram.js"` nesta tarefa.

---

### Task 2: O texto dos avisos (`src/lib/telegram/texto.js`, puro)

**Files:**
- Create: `src/lib/telegram/texto.js` (importa só `mascararDadosPessoais` de `@/lib/riseAi/mascarar`)
- Test: `scripts/teste-telegram.js`, bloco "Texto"

**Interfaces:**
- Produces:
  - `neutralizar(texto: string): string` — `@` vira `＠` (U+FF20), `://` vira `:∕∕` (U+2215), `/` no começo de uma linha vira `∕`; quebra de linha e o resto ficam.
  - `trechoSeguro(texto: string, limite = 120): string` — `mascararDadosPessoais`, tira quebras de linha (viram espaço), corta em `limite` com `…`, e `neutralizar`.
  - `LIMITE_DE_LINHAS = 4`.
  - `mensagemDoAviso(tipo, dados): { texto: string, caminho: string }` — texto com no máximo 4 linhas e o caminho do Rise do link. Tipos e textos exatos:
    - `produtoZerou` `{ sku, nome }` → `Produto zerou: <sku>\n<nome (trechoSeguro 60)>` ; caminho `/produtos/<id>`? Não: o `dados` traz `id`, caminho `/produtos/${id}`.
    - `orcamento` `{ escopo: "CLIENTES"|"INTERNO", estado: "aviso"|"esgotado", percentual, tetoBrl }` → `IA: orçamento <dos clientes|interno> em <percentual>% do teto de R$ <teto com vírgula>` e, se `esgotado`, 2ª linha `Respostas pagas param até o teto subir.`; caminho `/rise-ai/configuracoes`.
    - `varreduraPeloPc` `{ fonteNome, pedidoHa: "N min" }` → `Varredura pelo PC esperando: <fonte>\nPedida há <pedidoHa>; o Rise do PC não responde.`; caminho `/mercados/fontes`.
    - `varreduraFalhou` `{ fonteNome, erro }` → `Varredura falhou: <fonte>\n<trechoSeguro(erro)>`; caminho `/mercados/fontes`.
    - `resumoDoDia` `{ dia: "dd/mm", consultas, anotadas, zerados, varreduras: { concluidas, falhas }, ia: { gastoBrl, tetoBrl } }` → 5 linhas? **Não: 4.** `Resumo de <dia>` / `Consultas pelo Claude/ChatGPT: <consultas> (<anotadas> anotadas) · Produtos que zeraram: <zerados>` / `Varreduras: <concluidas> concluídas, <falhas> com erro` / `IA no mês: R$ <gasto> de R$ <teto>`; caminho `/rise-ai/revisao`.
    - tipo desconhecido → lança `Error("Tipo de aviso desconhecido: <tipo>")`.
  - `linkAbrirNoRise(base: string|null|undefined, caminho: string): string|null` — `base` sem barra final + caminho; `null` sem base (o PC não tem `APP_URL_PUBLICA`).
  - Reais com vírgula e 2 casas (`formatarReais`, interna: `1234.5` → `1.234,50`).

- [ ] **Step 1: Escrever os testes que falham**

```js
{
  console.log("\nTexto");
  const { neutralizar, trechoSeguro, mensagemDoAviso, linkAbrirNoRise, LIMITE_DE_LINHAS } = await import("../src/lib/telegram/texto.js");
  conferir("neutraliza @, :// e barra no comeco da linha", neutralizar("/start @fulano http://x.com\n/stop a/b"), "∕start ＠fulano http:∕∕x.com\n∕stop a/b");
  conferir("trecho mascara, achata e corta em 120", trechoSeguro("Cliente 54988990008 " + "a".repeat(200) + "\nfim").length <= 121, true);
  conferir("trecho mascara o telefone", trechoSeguro("liga 54988990008").includes("54988990008"), false);
  const zerou = mensagemDoAviso("produtoZerou", { id: "p1", sku: "100101", nome: "Placa Uno" });
  conferir("produto zerou: texto e caminho", zerou, { texto: "Produto zerou: 100101\nPlaca Uno", caminho: "/produtos/p1" });
  const orc = mensagemDoAviso("orcamento", { escopo: "CLIENTES", estado: "esgotado", percentual: 100, tetoBrl: 70 });
  conferir("orcamento esgotado tem 2 linhas", orc.texto.split("\n"), ["IA: orçamento dos clientes em 100% do teto de R$ 70,00", "Respostas pagas param até o teto subir."]);
  const resumo = mensagemDoAviso("resumoDoDia", { dia: "22/10", consultas: 5, anotadas: 2, zerados: 1, varreduras: { concluidas: 3, falhas: 1 }, ia: { gastoBrl: 12.5, tetoBrl: 70 } });
  conferir("resumo cabe no limite de linhas", resumo.texto.split("\n").length <= LIMITE_DE_LINHAS, true);
  conferir("resumo: ultima linha", resumo.texto.split("\n").at(-1), "IA no mês: R$ 12,50 de R$ 70,00");
  conferir("falha com trecho neutralizado", mensagemDoAviso("varreduraFalhou", { fonteNome: "Loja X", erro: "HTTP 403 em https://loja.x/p" }).texto, "Varredura falhou: Loja X\nHTTP 403 em https:∕∕loja.x/p");
  conferir("link sem base e nulo", linkAbrirNoRise("", "/produtos/p1"), null);
  conferir("link tira a barra final da base", linkAbrirNoRise("https://rise.4hobby.com.br/", "/produtos/p1"), "https://rise.4hobby.com.br/produtos/p1");
  let lancou = null; try { mensagemDoAviso("x", {}); } catch (e) { lancou = e.message; }
  conferir("tipo desconhecido lanca", lancou, "Tipo de aviso desconhecido: x");
}
```

- [ ] **Step 2: Rodar e ver falhar** — Expected: `Cannot find module '../src/lib/telegram/texto.js'`.
- [ ] **Step 3: Implementar `texto.js`** com as assinaturas acima. Toda mensagem termina em `neutralizar` no texto montado inteiro (não só no trecho), para o `@` de um nome de loja também sair neutro.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** `feat(telegram): texto dos avisos, neutralizado e em ate 4 linhas (C1, tarefa 2)` — `src/lib/telegram/texto.js scripts/teste-telegram.js`.

---

### Task 3: O cliente do Telegram e a máscara do token no log

**Files:**
- Create: `src/lib/telegram/cliente.js`
- Modify: `src/lib/integracoes/httpClient.js` (as duas linhas `endpoint: \`${alvo.origin}${alvo.pathname}\`` em `requisitar`, ~178 e ~209)
- Create: `scripts/lib/telegramFalso.js`
- Test: `scripts/teste-telegram.js`, blocos "Cliente" e "Mascara do token"

**Interfaces:**
- Produces (`cliente.js`):
  - `BASE_TELEGRAM = "https://api.telegram.org"`.
  - `limparToken(bruto: string): string` — `trim`, tira `bot` do começo (sem caixa), tira espaços internos e quebras; vazio continua vazio.
  - `tokenValido(token: string): boolean` — `/^\d{6,12}:[A-Za-z0-9_-]{30,}$/`.
  - `mascararToken(texto: string, token?: string): string` — troca `/bot<qualquer coisa até a próxima barra>/` por `/bot***/` e, se `token` vier, toda ocorrência literal dele por `***`.
  - `criarClienteTelegram({ token, requisitar = requisitarPadrao, base = BASE_TELEGRAM, urlPublica = process.env.APP_URL_PUBLICA })` → `{ getMe(), getUpdates({ limite = 100 }), enviarMensagem(chatId, texto, { caminho }), confirmarAtualizacoes(ultimoUpdateId) }`:
    - cada método chama `requisitar({ servico: "TELEGRAM", url: \`${base}/bot${token}/<método>\`, metodo: "POST", corpo, timeoutMs: 15000, tentativas: 1 })` e devolve `{ ok, dados, erro }` onde `dados` é o `result` do Telegram e `erro` é `dados.description` (ou `"HTTP <status>"`), **passado por `mascararToken`**; nunca lança por resposta ruim (só se `token` for inválido na criação: `Error("Token do bot inválido.")`).
    - `getMe` → `dados = { id, username, first_name }`.
    - `getUpdates` → corpo `{ offset: -limite, limit: limite, timeout: 0, allowed_updates: ["message"] }` (as mais recentes, sem esperar).
    - `enviarMensagem` → corpo `{ chat_id, text, disable_web_page_preview: true }` **sem `parse_mode`**, mais `reply_markup: { inline_keyboard: [[{ text: "Abrir no Rise", url }]] }` só quando `linkAbrirNoRise(urlPublica, caminho)` não é nulo. Recusa (sem chamar) texto com mais de `LIMITE_DE_LINHAS` linhas ou mais de 4096 caracteres: `{ ok: false, erro: "Mensagem acima do limite." }`. `erro` de 403 com "blocked" vira `{ ok: false, erro: "...", bloqueado: true }`.
    - `confirmarAtualizacoes(ultimoUpdateId)` → `getUpdates` com `{ offset: ultimoUpdateId + 1, limit: 1, timeout: 0 }`; só para o Telegram descartar o já lido.
- Produces (`scripts/lib/telegramFalso.js`): `criarTelegramFalso({ bot = { id: 1, username: "rise_bot", first_name: "Rise" }, updates = [], falhas = {} })` → `{ requisitar, chamadas, mensagens, updates }`: `requisitar` casa a URL (`/bot<token>/<método>`), guarda `{ metodo: "<método>", corpo, token }` em `chamadas`, responde `{ ok: true, status: 200, dados: { ok: true, result } }`; `sendMessage` empurra em `mensagens` e responde `{ message_id }`; `falhas.sendMessage = { status: 403, description: "Forbidden: bot was blocked by the user" }` faz responder `{ ok: false, status, dados: { ok: false, description } }`; `getUpdates` com `offset` negativo devolve as últimas `limit`; com `offset` positivo, as de `update_id >= offset`. Não importa nada de `src/`.
- `httpClient.js`: o `endpoint` gravado passa por `mascararEndpoint(pathname)` (função interna: `pathname.replace(/\/bot[^/]+\//, "/bot***/")`). `mascarar` (de strings) ganha o mesmo `replace`.

- [ ] **Step 1: Escrever os testes que falham**

```js
{
  console.log("\nCliente");
  const { criarClienteTelegram, limparToken, tokenValido, mascararToken } = await import("../src/lib/telegram/cliente.js");
  const { criarTelegramFalso } = await import("./lib/telegramFalso.js");
  const TOKEN = "123456789:" + "A".repeat(35);
  conferir("limpa o token colado", limparToken(" bot" + TOKEN + "\n"), TOKEN);
  conferir("token curto e invalido", tokenValido("123:abc"), false);
  conferir("mascara o token da URL e o literal", mascararToken(`erro em https://api.telegram.org/bot${TOKEN}/getMe e ${TOKEN}`, TOKEN), "erro em https://api.telegram.org/bot***/getMe e ***");
  const falso = criarTelegramFalso({ updates: [{ update_id: 7, message: { message_id: 1, chat: { id: 55, type: "private", first_name: "Maicol", username: "maicol" }, text: "/vincular ABC" } }] });
  const cliente = criarClienteTelegram({ token: TOKEN, requisitar: falso.requisitar, urlPublica: "https://rise.4hobby.com.br" });
  conferir("getMe devolve a conta do bot", (await cliente.getMe()).dados.username, "rise_bot");
  conferir("getUpdates le as mais recentes sem esperar", falso.chamadas.length === 1 && (await cliente.getUpdates()).dados[0].update_id === 7 && falso.chamadas[1].corpo.offset === -100 && falso.chamadas[1].corpo.timeout === 0, true);
  const envio = await cliente.enviarMensagem(55, "Produto zerou: 100101\nPlaca Uno", { caminho: "/produtos/p1" });
  conferir("envia sem parse_mode e com o botao Abrir no Rise", envio.ok && !("parse_mode" in falso.mensagens[0]) && falso.mensagens[0].reply_markup.inline_keyboard[0][0].url === "https://rise.4hobby.com.br/produtos/p1", true);
  const semBase = criarClienteTelegram({ token: TOKEN, requisitar: falso.requisitar, urlPublica: "" });
  await semBase.enviarMensagem(55, "x", { caminho: "/p" });
  conferir("sem APP_URL_PUBLICA nao ha botao", "reply_markup" in falso.mensagens[1], false);
  conferir("recusa 5 linhas sem chamar o Telegram", (await cliente.enviarMensagem(55, "1\n2\n3\n4\n5", { caminho: "/p" })).erro, "Mensagem acima do limite.");
  const bloqueado = criarClienteTelegram({ token: TOKEN, requisitar: criarTelegramFalso({ falhas: { sendMessage: { status: 403, description: "Forbidden: bot was blocked by the user" } } }).requisitar });
  const r = await bloqueado.enviarMensagem(55, "x", {});
  conferir("403 bloqueado vem marcado", [r.ok, r.bloqueado], [false, true]);
  let lancou = null; try { criarClienteTelegram({ token: "ruim", requisitar: falso.requisitar }); } catch (e) { lancou = e.message; }
  conferir("token invalido lanca na criacao", lancou, "Token do bot inválido.");
}
{
  console.log("\nMascara do token");
  const { requisitar, mascarar } = await import("../src/lib/integracoes/httpClient.js");
  const TOKEN = "123456789:" + "B".repeat(35);
  await requisitar({ servico: "TELEGRAM", url: `https://teste-rise.invalid/bot${TOKEN}/getMe`, timeoutMs: 500, tentativas: 1 }).catch(() => null);
  const linha = await prisma.logIntegracao.findFirst({ where: { servico: "TELEGRAM", endpoint: { contains: "teste-rise.invalid" } }, orderBy: { criadoEm: "desc" } });
  conferir("o endpoint gravado nao leva o token", linha.endpoint, "https://teste-rise.invalid/bot***/getMe");
  conferir("mascarar(string) tambem cobre a URL do bot", mascarar(`GET /bot${TOKEN}/sendMessage`), "GET /bot***/sendMessage");
}
```

(O `requisitar` contra `teste-rise.invalid` falha por DNS; o que se testa é a linha de log do `catch`. Conferir o nome do campo de data de `LogIntegracao` no schema antes de ordenar.)

- [ ] **Step 2: Rodar e ver falhar** — Expected: `Cannot find module '../src/lib/telegram/cliente.js'`.
- [ ] **Step 3: Implementar** `cliente.js`, `telegramFalso.js` e a máscara no `httpClient.js`.
- [ ] **Step 4: Rodar e ver passar.** Também `npm run teste:loja-integrada` (usa `mascarar`): Expected: sem falhas.
- [ ] **Step 5: Commit** `feat(telegram): cliente da API do bot e token mascarado no log (C1, tarefa 3)` — `src/lib/telegram/cliente.js src/lib/integracoes/httpClient.js scripts/lib/telegramFalso.js scripts/teste-telegram.js`.

---

### Task 4: O vínculo por código (`src/lib/telegram/vinculo.js`)

**Files:**
- Create: `src/lib/telegram/vinculo.js`
- Test: `scripts/teste-telegram.js`, bloco "Vinculo"

**Interfaces:**
- Consumes: `criarClienteTelegram` (Tarefa 3); `registrarAuditoria(tx, { quem, oQue, alvo, antes, depois })` de `@/lib/acessos/banco`; `prisma`.
- Produces:
  - `ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"`, `TAMANHO_DO_CODIGO = 12`, `VALIDADE_DO_CODIGO_MS = 10 * 60 * 1000`, `TENTATIVAS_QUE_SILENCIAM = 5`.
  - `gerarCodigo(aleatorio = crypto.randomInt): string` — 12 caracteres do alfabeto.
  - `hashDoCodigo(codigo: string): string` — SHA-256 hex do código em MAIÚSCULAS sem espaços.
  - `avaliarAtualizacoes(updates, { hash, criadoEm, agora = Date.now() }): { achado: { chatId: string, nome: string, usuario: string|null, updateId: number } | null, anulado: boolean, ultimoUpdateId: number|null }` — pura. Só mensagens de chat `private` com `text` casando `/^\/vincular\s+(\S+)/i`, com `message.date*1000 >= criadoEm`. Código certo = `hashDoCodigo(captura) === hash`. Por chat, conta os errados; chat com `>= 5` errados é ignorado e põe `anulado = true`. `achado` é o chat que acertou (o mais recente, se houver mais de um). `ultimoUpdateId` é o maior `update_id` lido.
  - `iniciarVinculo(usuarioId, { quem, agora = new Date() }): Promise<{ codigo: string, expiraEm: Date }>` — grava o hash e a validade, auditoria `telegram.vinculo.iniciar` (sem o código). Usuário inativo → `Error("Ative o usuário antes de vincular o Telegram.")`.
  - `localizarVinculo(usuarioId, { cliente, agora = Date.now() }): Promise<{ ok: true, chat: { chatId, nome, usuario } } | { ok: false, motivo: "sem-codigo" | "expirado" | "nao-chegou" | "anulado" | "telegram", erro?: string }>` — lê o usuário; sem hash → `sem-codigo`; vencido → `expirado` (e limpa o hash); `getUpdates` com erro → `telegram` com `erro` mascarado; `avaliarAtualizacoes`; `anulado` → limpa o hash e devolve `anulado`; sem achado → `nao-chegou`.
  - `confirmarVinculo(usuarioId, chatId, { cliente, quem, agora }): Promise<{ ok: true, chat } | { ok: false, erro: string }>` — repete `localizarVinculo` e exige `chat.chatId === String(chatId)` (senão `"O chat conferido não é o que enviou o código. Confira de novo."`); grava `telegramChatId = chatId`, zera hash e validade, auditoria `telegram.vinculo.confirmar` (`depois: { chatId, usuario }`); `P2002` → `"Este Telegram já está ligado a outro usuário."`; depois `cliente.confirmarAtualizacoes(ultimoUpdateId)` e `cliente.enviarMensagem(chatId, "Telegram ligado ao Rise para <nome>.\nOs avisos chegam por aqui.", { caminho: "/rise-ai/configuracoes" })` (falha do envio não desfaz o vínculo; vai como `aviso` no retorno).
  - `desvincular(usuarioId, { quem }): Promise<void>` — zera `telegramChatId`, hash e validade, auditoria `telegram.vinculo.remover` (`antes: { chatId }`).
  - `vinculosDaEquipe(): Promise<{ usuarioId, login, nome, ativo }[]>` — os usuários com `telegramChatId`, para a aba Canais (o chatId não sai).

- [ ] **Step 1: Escrever os testes que falham**

```js
{
  console.log("\nVinculo");
  const v = await import("../src/lib/telegram/vinculo.js");
  const { criarClienteTelegram } = await import("../src/lib/telegram/cliente.js");
  const { criarTelegramFalso } = await import("./lib/telegramFalso.js");
  const TOKEN = "123456789:" + "C".repeat(35);
  const codigo = v.gerarCodigo();
  conferir("codigo com 12 caracteres do alfabeto", [codigo.length, [...codigo].every((c) => v.ALFABETO.includes(c))], [12, true]);
  conferir("hash ignora caixa e espacos", v.hashDoCodigo(" " + codigo.toLowerCase() + " "), v.hashDoCodigo(codigo));
  const agora = Date.now();
  const msg = (id, chat, text, date = Math.floor(agora / 1000)) => ({ update_id: id, message: { message_id: id, date, chat: { id: chat, type: "private", first_name: "Maicol", username: "maicol" }, text } });
  const hash = v.hashDoCodigo(codigo);
  conferir("acha o chat que mandou o codigo certo", v.avaliarAtualizacoes([msg(1, 55, "oi"), msg(2, 55, `/vincular ${codigo.toLowerCase()}`)], { hash, criadoEm: agora - 1000, agora }).achado, { chatId: "55", nome: "Maicol", usuario: "maicol", updateId: 2 });
  conferir("mensagem de antes do codigo nao vale", v.avaliarAtualizacoes([msg(3, 55, `/vincular ${codigo}`, Math.floor(agora / 1000) - 60)], { hash, criadoEm: agora, agora }).achado, null);
  const lixo = Array.from({ length: 5 }, (_, i) => msg(10 + i, 99, `/vincular ERRADO${i}`));
  const avaliacao = v.avaliarAtualizacoes([...lixo, msg(20, 99, `/vincular ${codigo}`)], { hash, criadoEm: agora - 1000, agora });
  conferir("5 erros do mesmo chat silenciam o chat e anulam o codigo", [avaliacao.achado, avaliacao.anulado, avaliacao.ultimoUpdateId], [null, true, 20]);
  conferir("grupo nao vale", v.avaliarAtualizacoes([{ update_id: 1, message: { date: Math.floor(agora / 1000), chat: { id: -5, type: "group" }, text: `/vincular ${codigo}` } }], { hash, criadoEm: agora - 1000, agora }).achado, null);

  const u = await prisma.usuarioRise.create({ data: { login: "zz-tg-vinc", nome: "ZZ TG Vinc" } });
  const inicio = await v.iniciarVinculo(u.id, { quem: "zz-tg-admin" });
  conferir("iniciar grava so o hash", (await prisma.usuarioRise.findUnique({ where: { id: u.id } })).codigoDeVinculoHash, v.hashDoCodigo(inicio.codigo));
  const falso = criarTelegramFalso({ updates: [msg(30, 55, `/vincular ${inicio.codigo}`)] });
  const cliente = criarClienteTelegram({ token: TOKEN, requisitar: falso.requisitar, urlPublica: "https://rise.4hobby.com.br" });
  const achado = await v.localizarVinculo(u.id, { cliente });
  conferir("localizar devolve nome e @ para o administrador conferir", achado, { ok: true, chat: { chatId: "55", nome: "Maicol", usuario: "maicol" } });
  conferir("confirmar com outro chat e recusado", (await v.confirmarVinculo(u.id, "56", { cliente, quem: "zz-tg-admin" })).ok, false);
  const ok = await v.confirmarVinculo(u.id, "55", { cliente, quem: "zz-tg-admin" });
  const depois = await prisma.usuarioRise.findUnique({ where: { id: u.id } });
  conferir("confirmar grava o chat, zera o codigo e manda a boas-vindas", [ok.ok, depois.telegramChatId, depois.codigoDeVinculoHash, falso.mensagens.at(-1).text.startsWith("Telegram ligado ao Rise para ZZ TG Vinc")], [true, "55", null, true]);
  conferir("confirmou o update_id lido", falso.chamadas.some((c) => c.metodo === "getUpdates" && c.corpo.offset === 31), true);
  conferir("auditoria do vinculo sem o codigo", (await prisma.auditoriaDeAcesso.findMany({ where: { quem: "zz-tg-admin", alvo: u.id } })).map((a) => a.oQue), ["telegram.vinculo.iniciar", "telegram.vinculo.confirmar"]);
  const u2 = await prisma.usuarioRise.create({ data: { login: "zz-tg-dois", nome: "ZZ TG Dois" } });
  const i2 = await v.iniciarVinculo(u2.id, { quem: "zz-tg-admin" });
  const falso2 = criarTelegramFalso({ updates: [msg(40, 55, `/vincular ${i2.codigo}`)] });
  conferir("o mesmo chat nao liga a dois usuarios", (await v.confirmarVinculo(u2.id, "55", { cliente: criarClienteTelegram({ token: TOKEN, requisitar: falso2.requisitar }), quem: "zz-tg-admin" })).erro, "Este Telegram já está ligado a outro usuário.");
  conferir("sem codigo", (await v.localizarVinculo(u.id, { cliente })).motivo, "sem-codigo");
  await prisma.usuarioRise.update({ where: { id: u2.id }, data: { codigoDeVinculoExpiraEm: new Date(Date.now() - 1000) } });
  conferir("expirado limpa o hash", [(await v.localizarVinculo(u2.id, { cliente })).motivo, (await prisma.usuarioRise.findUnique({ where: { id: u2.id } })).codigoDeVinculoHash], ["expirado", null]);
  await v.desvincular(u.id, { quem: "zz-tg-admin" });
  conferir("desvincular zera o chat", (await prisma.usuarioRise.findUnique({ where: { id: u.id } })).telegramChatId, null);
}
```

- [ ] **Step 2: Rodar e ver falhar** — Expected: `Cannot find module '../src/lib/telegram/vinculo.js'`.
- [ ] **Step 3: Implementar `vinculo.js`.** A auditoria vai na mesma transação da gravação (`prisma.$transaction`), como `salvarUsuario` em `banco.js`.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** `feat(telegram): vinculo por codigo com uma leitura do getUpdates (C1, tarefa 4)` — `src/lib/telegram/vinculo.js scripts/teste-telegram.js`.

---

### Task 5: Configuração — `telegram` em `ConfiguracaoIA`, a aba `canais` e o recurso de Acessos

**Files:**
- Modify: `src/lib/riseAi/configuracao.js` (`configuracaoPadrao`, `EsquemaDaConfiguracao`, `GRUPOS`)
- Modify: `src/lib/riseAi/formularios.js` (`parcialDaConfiguracao`)
- Modify: `src/lib/riseAi/abasDeConfiguracao.js` (`ABAS`, `RECURSO_DA_ABA`, `CAMPOS_DA_ABA`, `registrarMudancas`)
- Modify: `src/lib/acessos/recursos.js` (linhas 95-96: o comentário da aba Canais sai, entra o recurso)
- Modify: `scripts/teste-acessos.js` linha 132 (a lista dos não delegáveis)
- Create: `src/lib/telegram/estado.js`
- Test: `scripts/teste-telegram.js`, bloco "Configuracao"; `npm run teste:acessos` e `npm run teste:rise-ai` continuam verdes

**Interfaces:**
- Produces:
  - `TIPOS_DE_AVISO = ["resumoDoDia", "produtoZerou", "orcamento", "varreduraPeloPc", "varreduraFalhou"]` e `ROTULO_DO_AVISO` (`{ resumoDoDia: "Resumo do dia às 20h", produtoZerou: "Produto que zerou o estoque", orcamento: "Orçamento da IA em 80% e 100%", varreduraPeloPc: "Varredura pelo PC esperando", varreduraFalhou: "Varredura que falhou" }`) em `src/lib/telegram/avisosTipos.js` (sem imports; a tela e o servidor leem).
  - `configuracaoPadrao().telegram = { ligado: false, avisos: { resumoDoDia: true, produtoZerou: true, orcamento: true, varreduraPeloPc: true, varreduraFalhou: true } }`; zod `telegram: z.object({ ligado: z.boolean(), avisos: z.object(<cada tipo> z.boolean()) })`; `"telegram"` entra em `GRUPOS` (mescla por chave: salvar só `ligado` não apaga `avisos`). **`avisos` também se mescla**: em `mesclar`, quando a chave é `telegram`, mesclar `avisos` por dentro (`{ ...base.avisos, ...valor.avisos }`).
  - `parcialDaConfiguracao`: campos `telegramLigado` (`"true"|"false"`) e `telegramAviso.<tipo>` (`"true"|"false"`), só os presentes.
  - `ABAS = ["modelos", "orcamentos", "canais", "atendimento"]`; `RECURSO_DA_ABA.canais = "riseAi.configuracoes.canais"`; `CAMPOS_DA_ABA.canais = ["telegramLigado", ...TIPOS_DE_AVISO.map((t) => "telegramAviso." + t)]`; `registrarMudancas` grava `rise-ai.telegram` (`antes`/`depois` = o `telegram` inteiro) quando mudou.
  - `recursos.js`: `naoDelegavel("riseAi.configuracoes.canais", "Rise AI › Configurações › Canais (Telegram)", "riseAi.configuracoes", "O bot do Telegram, o vínculo das pessoas e quais avisos saem. Só do Administrador.")` logo depois de `orcamentos`.
  - `estadoDoTelegram({ env = process.env }): Promise<{ token: { cadastrada: boolean, em: Date|null }, bot: { usuario: string|null, testadoEm: Date|null, ok: boolean|null, erro: string|null }, vinculados: { usuarioId, login, nome, ativo }[], urlPublica: boolean }>` — de `lerConexao("TELEGRAM")` (`contaExterna` = `@usuario` do bot, `ultimoErro` já mascarado) e `vinculosDaEquipe()`.

- [ ] **Step 1: Escrever os testes que falham**

```js
{
  console.log("\nConfiguracao");
  const { configuracaoPadrao, validarConfiguracao, lerConfiguracao, gravarConfiguracao } = await import("../src/lib/riseAi/configuracao.js");
  const { parcialDaConfiguracao } = await import("../src/lib/riseAi/formularios.js");
  const { ABAS, RECURSO_DA_ABA, salvarAba } = await import("../src/lib/riseAi/abasDeConfiguracao.js");
  const { NAO_DELEGAVEIS } = await import("../src/lib/acessos/recursos.js");
  conferir("padrao: bot desligado e todos os avisos marcados", configuracaoPadrao("pc").telegram, { ligado: false, avisos: { resumoDoDia: true, produtoZerou: true, orcamento: true, varreduraPeloPc: true, varreduraFalhou: true } });
  conferir("zod recusa aviso que nao e booleano", validarConfiguracao({ ...configuracaoPadrao("pc"), telegram: { ligado: true, avisos: { ...configuracaoPadrao("pc").telegram.avisos, orcamento: "sim" } } }).ok, false);
  const dados = new FormData(); dados.append("telegramLigado", "true"); dados.append("telegramAviso.orcamento", "false");
  conferir("parcial le os campos da aba", parcialDaConfiguracao(dados).telegram, { ligado: true, avisos: { orcamento: false } });
  conferir("aba canais existe e e do Administrador", [ABAS, RECURSO_DA_ABA.canais, NAO_DELEGAVEIS.includes("riseAi.configuracoes.canais")], [["modelos", "orcamentos", "canais", "atendimento"], "riseAi.configuracoes.canais", true]);
  const pode = () => true;
  const r = await salvarAba("canais", dados, { usuario: "zz-tg-admin", pode });
  const lida = await lerConfiguracao("pc");
  conferir("salvar a aba mescla: liga o bot, desliga um aviso e mantem os outros", [r.ok, lida.telegram.ligado, lida.telegram.avisos.orcamento, lida.telegram.avisos.produtoZerou], [true, true, false, true]);
  conferir("auditoria rise-ai.telegram", (await prisma.auditoriaDeAcesso.findFirst({ where: { quem: "zz-tg-admin", oQue: "rise-ai.telegram" } }))?.depois?.ligado, true);
  const so = new FormData(); so.append("telegramLigado", "false");
  await salvarAba("canais", so, { usuario: "zz-tg-admin", pode });
  conferir("salvar so o interruptor nao apaga os avisos", (await lerConfiguracao("pc")).telegram.avisos.orcamento, false);
}
```

(O `limpar()` restaura a `ConfiguracaoIA` do dono no `finally`, lida antes do primeiro bloco. `salvarAba` em `abasDeConfiguracao.js` exige `pode` para o prompt do cliente; conferir a assinatura ao escrever.)

- [ ] **Step 2: Rodar e ver falhar** — Expected: `padrao: bot desligado...` falha com `telegram` `undefined`.
- [ ] **Step 3: Implementar** as mudanças listadas em Interfaces; em `teste-acessos.js:132` a lista esperada vira `["riseAi.configuracoes.canais", "riseAi.configuracoes.promptCliente", "tela.configuracoes.usuarios"]` (conferir a ordem que o catálogo produz).
- [ ] **Step 4: Rodar e ver passar** `npm run teste:telegram`, `npm run teste:acessos` (207 → o total pode mudar se o teste contar recursos; ajustar o número no CLAUDE.md na Tarefa 8) e `npm run teste:rise-ai`.
- [ ] **Step 5: Commit** `feat(telegram): configuracao telegram, aba Canais e recurso nao delegavel (C1, tarefa 5)` — os arquivos de Files.

---

### Task 6: Tela — aba Canais (token, bot, avisos) e o vínculo no usuário

**Files:**
- Modify: `src/app/rise-ai/configuracoes/acoes.js` (3 ações novas), `src/app/rise-ai/configuracoes/page.jsx` (a aba `canais` com `ROTULOS.canais = "Canais"`, só com `acesso.pode("riseAi.configuracoes.canais", "ver")`)
- Create: `src/components/riseAi/AbaCanais.jsx`
- Modify: `src/app/configuracoes/acoes.js` (4 ações novas), `src/components/acessos/FormularioUsuario.jsx` (a seção abaixo de `EntradaNoRise`, na aba Dados, só com `usuario.id`)
- Create: `src/components/acessos/VinculoTelegram.jsx`
- Test: `npm run teste:acessos` (o guarda estático exige a conferência de acesso em toda ação nova) e a conferência no navegador (Step 4)

**Interfaces:**
- Consumes: `gravarChave`-like via `salvarConexao("TELEGRAM", { segredo: { token }, status: "CONECTADO", conectadoEm })`, `desconectar("TELEGRAM")`, `registrarTeste("TELEGRAM", { ok, conta: "@" + username, erro })`, `lerSegredo("TELEGRAM")` → `{ token }`; `criarClienteTelegram`; `iniciarVinculo`/`localizarVinculo`/`confirmarVinculo`/`desvincular`; `estadoDoTelegram`; `executarComAcesso`, `comSessaoDoRiseAi` (padrão de `salvarChaveAcao`).
- Produces (`src/app/rise-ai/configuracoes/acoes.js`, todas `executarComAcesso("riseAi.configuracoes.canais", "editar", ...)`):
  - `salvarTokenTelegramAcao(formData)` — campo `token` (só de escrita), `limparToken`, `tokenValido` senão `ErroDeUso("Token do bot inválido. Copie o token inteiro do BotFather.")`; grava; **não** testa.
  - `removerTokenTelegramAcao()` — `desconectar("TELEGRAM")`.
  - `testarTelegramAcao()` — `getMe` com o token cadastrado; `registrarTeste`; devolve `{ ok, usuario, erro }` (`erro` já mascarado pelo cliente).
  - A aba usa `salvarAbaAcao("canais", formData)` que já existe para o interruptor e os avisos.
- Produces (`src/app/configuracoes/acoes.js`, todas `executarComAcesso("tela.configuracoes.usuarios", "editar", ...)` com `quem` = o login da sessão, como `definirSenhaAcao`):
  - `gerarCodigoDeVinculoAcao(usuarioId)` → `{ ok: true, codigo, expiraEm }` (o código vai à tela UMA vez; não se grava em texto).
  - `conferirVinculoAcao(usuarioId)` → o retorno de `localizarVinculo` com o cliente do token cadastrado; sem token → `{ ok: false, motivo: "sem-token" }`.
  - `confirmarVinculoAcao(usuarioId, chatId)` → o retorno de `confirmarVinculo` (+ `revalidatePath` da tela do usuário).
  - `desvincularTelegramAcao(usuarioId)` → `{ ok: true }`.
- Tela `AbaCanais.jsx` (uma linha para a sessão: "o Administrador vê primeiro SE o bot está pronto (token, teste, quem recebe) e a ação principal é Salvar os interruptores"):
  - Cartão **Bot do Telegram** no molde de `CartaoDeProvedor`: campo "Token do bot" (`type="password"`, `autoComplete="off"`), botão **Salvar token** (manda `FormData`), estado "cadastrado em dd/mm" ou "não cadastrado", botão **Testar conexão** (mostra `@usuario` do bot ou o erro em vermelho), botão **Remover token** (confirmação de um segundo clique). Bolha "i": como criar o bot no BotFather e o que o Rise faz com o token.
  - Linha **Quem recebe**: os vinculados (`nome · login`) com `Badge` "ativo"/"inativo" e o link "Vincular em Usuários e funções" (`/configuracoes/usuarios`); sem ninguém, "Ninguém vinculado ainda".
  - Interruptor **Bot ligado** (`telegramLigado`) e a lista de avisos como interruptores (`telegramAviso.<tipo>`, rótulos de `ROTULO_DO_AVISO`), tudo num `<form>` com `salvarDaAba` e `useAlteracaoDaAba("canais", sujo)`; sem `editar`, `fieldset disabled` com o motivo no `title`.
  - Aviso âmbar, uma linha, quando `!urlPublica`: "Sem `APP_URL_PUBLICA` o aviso vai sem o botão Abrir no Rise (é o caso do PC)."
- Tela `VinculoTelegram.jsx` (props `{ usuarioId, nome, ativo, vinculado: boolean, temToken: boolean, podeEditar: boolean }`), na aba Dados, abaixo de `EntradaNoRise`, título "Telegram":
  - Sem vínculo: botão **Gerar código** (desabilitado sem token, `title` "Cadastre o token do bot em Rise AI › Configurações › Canais", ou inativo: "Ative o usuário e salve antes"). Com código gerado: a caixa com o código em fonte mono, "vale até HH:MM", a instrução "No Telegram, abra o bot e envie: `/vincular CÓDIGO`" e o botão **Conferir vínculo**. Resultado: `nao-chegou` → "Ainda não chegou. Envie a mensagem e confira de novo."; `expirado` → "Código vencido. Gere outro."; `anulado` → "Código anulado: cinco tentativas erradas de um chat. Gere outro."; `telegram` → o erro; `ok` → "Chat encontrado: **Maicol** (@maicol)" com **Confirmar vínculo** e **Não é este**.
  - Com vínculo: `Badge` "Telegram vinculado" e botão **Desvincular** (segundo clique confirma).
  - `FormularioUsuario` passa `temToken` lido no servidor pela página (`page.jsx` do usuário: `lerConexao("TELEGRAM")` → `Boolean(segredoCifrado)`; `lerConexao` não devolve `segredoCifrado`, então ler com `prisma.conexao.findUnique({ select: { segredoCifrado: true } })` numa função `temTokenDoTelegram()` em `estado.js`).

- [ ] **Step 1: Escrever o teste que falha (guarda estático)** — nenhum teste novo: `npm run teste:acessos` já falha se uma ação nova não conferir o acesso. Acrescentar ao `teste-telegram.js` bloco "Acoes": `conferir("acoes da C1 exportadas", Object.keys(await import("../src/app/rise-ai/configuracoes/acoes.js")).filter((n) => /Telegram/.test(n)).sort(), ["removerTokenTelegramAcao", "salvarTokenTelegramAcao", "testarTelegramAcao"])` — **só se** o módulo importar sem `next/cache` quebrar; se quebrar (como no `teste:anuncios-ml`), pular este bloco e deixar a conferência para o guarda estático.
- [ ] **Step 2: Rodar e ver falhar** — Expected: a asserção acima falha (ou `Cannot find module`).
- [ ] **Step 3: Implementar** as ações e os dois componentes; ligar na `page.jsx` das Configurações e no `FormularioUsuario`.
- [ ] **Step 4: Conferir no navegador** (servidor do PC reiniciado; `preview_start`): Rise AI › Configurações tem a aba Canais; colar um token com formato válido e inválido (o inválido recusa com a mensagem; **não usar o token real do dono**: um token falso `123456789:` + 35 letras); Testar conexão mostra o erro do Telegram (401) **sem o token no texto**; `LogIntegracao` da chamada tem `endpoint` com `/bot***/`; ligar o bot e desmarcar um aviso, Salvar, recarregar: ficou; Configurações › Usuários › um usuário de teste `zz-tg-tela` › aba Dados: Gerar código mostra o código e "vale até"; Conferir vínculo diz "não chegou" (ou o erro 401 do token falso). Apagar o usuário de teste e o token falso no fim (`desconectar("TELEGRAM")`, e devolver a `ConfiguracaoIA` como estava). Passar `ecc:make-interfaces-feel-better` nos dois componentes (regra 10 do Padrão visual).
- [ ] **Step 5: Rodar** `npm run teste:acessos` e `npm run lint` — Expected: verdes.
- [ ] **Step 6: Commit** `feat(telegram): aba Canais (token, bot, avisos) e vinculo no usuario (C1, tarefa 6)` — os arquivos de Files.

---

### Task 7: Os avisos no worker (`src/lib/telegram/avisos.js`) e o healthchecks

**Files:**
- Create: `src/lib/telegram/avisos.js`
- Modify: `scripts/worker-processo.js` (import, constantes, a rotina no laço ao lado de `relerConcorrentesML`, o ping)
- Modify: `.env.example` (depois de `HEALTHCHECKS_COPIA_URL=`: `# O worker bate aqui a cada 5 min; sem a batida, e-mail (a pane do worker avisa por fora do Rise).` + `HEALTHCHECKS_WORKER_URL=`)
- Test: `scripts/teste-telegram.js`, bloco "Avisos"; `npm run teste:worker` (sozinho, ~6 min) no fim

**Interfaces:**
- Consumes: `lerConfiguracao`, `lerSegredo("TELEGRAM")`, `criarClienteTelegram`, `mensagemDoAviso`, `estadoDoOrcamento(escopo, { agora, config })` (devolve `{ estado: "normal"|"aviso"|"esgotado", percentual, tetoBrl, gastoBrl }` — conferir os nomes em `orcamento.js:82`), `mesDeSaoPaulo`, `hojeEmSaoPaulo` (`@/lib/ferramentas/cotacao`), `jobsAbertosDoPc()`, `avisoDoPedidoPeloPc`, `permissoesDoLogin(login)` + `pode` de `resolverPermissoes` (como o portão do MCP faz em `src/lib/mcp/portao.js`), `prisma`.
- Produces:
  - `AVISOS_TELEGRAM_MS = 60 * 1000` (exportado para o worker).
  - `destinatarios({ env }): Promise<{ usuarioId, login, chatId }[]>` — ativos, com `telegramChatId`, e `pode("riseAi.configuracoes.canais", "ver")`.
  - `deveMandarResumo({ agora, jaMandadoHoje }): boolean` — pura: hora de São Paulo `>= 20` e `!jaMandadoHoje`.
  - `avisosDevidos(tipo, { agora, config, env }): Promise<{ chave: string, dados: object }[]>` — por tipo, **sem o destinatário** (a chave final é `<chave>:<chatId>`):
    - `produtoZerou`: produtos `ativo: true`, `estoque: 0`, cuja chave `produto-zerou:<produtoId>` não existe em `AvisoTelegram`; **e antes** apaga as linhas `produto-zerou:<id>:*` dos produtos com `estoque > 0` (é o que rearma o aviso quando o produto volta e zera de novo). `dados = { id, sku, nome }`. Produto novo cadastrado já com 0 avisa também (é zero de verdade); produtos `ZZ-*`? Não há filtro: o teste usa os próprios e os apaga.
    - `orcamento`: para cada `ESCOPOS`, `estadoDoOrcamento`; `aviso` → chave `orcamento:<escopo>:<mes>:aviso`; `esgotado` → `orcamento:<escopo>:<mes>:esgotado` (os dois podem sair no mesmo mês, uma vez cada). `dados = { escopo, estado, percentual, tetoBrl }`.
    - `varreduraPeloPc`: `jobsAbertosDoPc()` filtrado por `avisoDoPedidoPeloPc({ pedidoEm, sinalEm, agora })` não nulo → chave `pc-esperando:<jobId>`, `dados = { fonteNome, pedidoHa }`.
    - `varreduraFalhou`: `Job` com `status: "FALHOU"` e `atualizadoEm` nas últimas 24 h, `payload.teste` ausente → chave `varredura-falhou:<jobId>`, `dados = { fonteNome, erro }` (conferir em `fila.js` os nomes exatos do status e do campo do erro antes de escrever).
    - `resumoDoDia`: se `deveMandarResumo({ agora, jaMandadoHoje: existe chave "resumo:<AAAA-MM-DD>:*" })` → chave `resumo:<dia>`, `dados` de `resumoDoDia({ agora })`: `consultas` = `ChamadaMcp` do dia de São Paulo (`criadoEm`), `anotadas` = as `anotarDuvida`, `zerados` = `AvisoTelegram` `produto-zerou` criados no dia (distintos por produto), `varreduras` = `Job` concluídos/falhos do dia, `ia` = `estadoDoOrcamento("CLIENTES")` (`gastoBrl`, `tetoBrl`).
  - `rodarAvisosDoTelegram({ agora = Date.now(), env = process.env, cliente = null }): Promise<{ ok: boolean, mandados: number, falhas: number, motivo?: string }>` — **nunca lança**: `config.telegram.ligado` falso → `{ ok: true, mandados: 0, motivo: "desligado" }`; sem token → `"sem-token"`; sem destinatário → `"sem-destinatario"`. Senão, para cada tipo ligado em `config.telegram.avisos`, `avisosDevidos`; para cada aviso × destinatário, `createMany({ data: { chave: chave + ":" + chatId, tipo, chatId, texto }, skipDuplicates: true })` com o texto de `mensagemDoAviso`; depois lê os `enviadoEm: null` com `tentativas < 3` e manda um a um: sucesso → `enviadoEm`; falha → `tentativas + 1`, `erro` (mascarado); `bloqueado` → `tentativas: 3` (não insiste) e `erro`. O `cliente` injetado serve ao teste; na vida real `criarClienteTelegram({ token })`.
- Worker: `const { rodarAvisosDoTelegram, AVISOS_TELEGRAM_MS } = await import("../src/lib/telegram/avisos.js");` e, no laço, depois do bloco dos concorrentes do ML: `if (!FONTES && !SO_NO_PC && Date.now() - avisosTelegramEm >= AVISOS_TELEGRAM_MS) { avisosTelegramEm = Date.now(); const r = await rodarAvisosDoTelegram(); if (r.mandados || r.falhas) log(...) }`. Ping: `const PING_HEALTHCHECKS_MS = 5 * 60 * 1000;` e, a cada volta vencida, `fetch(process.env.HEALTHCHECKS_WORKER_URL, { signal: AbortSignal.timeout(10000) }).catch(() => {})` só se a variável existir (só o worker normal). Comentário dizendo por quê: a pane do worker não tem como avisar pelo próprio Telegram.

- [ ] **Step 1: Escrever os testes que falham**

```js
{
  console.log("\nAvisos");
  const a = await import("../src/lib/telegram/avisos.js");
  const { criarClienteTelegram } = await import("../src/lib/telegram/cliente.js");
  const { criarTelegramFalso } = await import("./lib/telegramFalso.js");
  const { gravarConfiguracao } = await import("../src/lib/riseAi/configuracao.js");
  const { salvarConexao } = await import("../src/lib/integracoes/conexoes.js");
  const TOKEN = "123456789:" + "D".repeat(35);
  const sp20 = (dia = "2025-03-10") => new Date(`${dia}T23:30:00.000Z`).getTime(); // 20:30 em Sao Paulo
  conferir("resumo so depois das 20h de Sao Paulo", [a.deveMandarResumo({ agora: new Date("2025-03-10T22:59:00.000Z").getTime(), jaMandadoHoje: false }), a.deveMandarResumo({ agora: sp20(), jaMandadoHoje: false }), a.deveMandarResumo({ agora: sp20(), jaMandadoHoje: true })], [false, true, false]);

  // Destinatario: usuario ativo, com chat e Administrador (funcao fixa); um sem chat e um inativo ficam de fora.
  const adminFn = await prisma.funcaoRise.findFirst({ where: { fixa: true } }); // conferir o nome do campo da funcao Administrador em banco.js/semeadura.js
  const dono = await prisma.usuarioRise.create({ data: { login: "zz-tg-dono", nome: "ZZ Dono", telegramChatId: "zz-tg-chat-dono", funcoes: { create: [{ funcaoId: adminFn.id }] } } });
  await prisma.usuarioRise.create({ data: { login: "zz-tg-semchat", nome: "Sem chat", funcoes: { create: [{ funcaoId: adminFn.id }] } } });
  await prisma.usuarioRise.create({ data: { login: "zz-tg-inativo", nome: "Inativo", ativo: false, telegramChatId: "zz-tg-chat-inativo", funcoes: { create: [{ funcaoId: adminFn.id }] } } });
  const dest = (await a.destinatarios()).filter((d) => d.login.startsWith("zz-tg-"));
  conferir("so o ativo com chat e com o recurso recebe", dest.map((d) => d.login), ["zz-tg-dono"]);

  conferir("bot desligado nao faz nada", (await a.rodarAvisosDoTelegram({ agora: sp20() })).motivo, "desligado");
  await gravarConfiguracao({ telegram: { ligado: true } }, { usuario: "zz-tg-admin" });
  conferir("sem token nao faz nada", (await a.rodarAvisosDoTelegram({ agora: sp20() })).motivo, "sem-token");
  await salvarConexao("TELEGRAM", { segredo: { token: TOKEN }, status: "CONECTADO", conectadoEm: new Date() });

  const p = await prisma.produto.create({ data: { sku: "ZZ-TG-ZERO", nome: "ZZ TG Zero", estoque: 0, ativo: true /* + os campos obrigatorios do modelo, copiados de teste-estoque.js */ } });
  const falso = criarTelegramFalso();
  const cliente = criarClienteTelegram({ token: TOKEN, requisitar: falso.requisitar, urlPublica: "https://rise.4hobby.com.br" });
  const r1 = await a.rodarAvisosDoTelegram({ agora: sp20(), cliente });
  const textos = () => falso.mensagens.map((m) => m.text);
  conferir("manda o produto zerado e o resumo do dia", [r1.ok, textos().some((t) => t.startsWith("Produto zerou: ZZ-TG-ZERO")), textos().some((t) => t.startsWith("Resumo de 10/03"))], [true, true, true]);
  const r2 = await a.rodarAvisosDoTelegram({ agora: sp20() + 60000, cliente });
  conferir("a volta seguinte nao repete nada", [r2.mandados, falso.mensagens.length], [0, falso.mensagens.length]);
  await prisma.produto.update({ where: { id: p.id }, data: { estoque: 3 } });
  await a.rodarAvisosDoTelegram({ agora: sp20() + 120000, cliente });
  await prisma.produto.update({ where: { id: p.id }, data: { estoque: 0 } });
  await a.rodarAvisosDoTelegram({ agora: sp20() + 180000, cliente });
  conferir("zerou, voltou e zerou de novo: dois avisos", textos().filter((t) => t.startsWith("Produto zerou: ZZ-TG-ZERO")).length, 2);
  const r3 = await a.rodarAvisosDoTelegram({ agora: sp20("2025-03-11"), cliente });
  conferir("no dia seguinte sai outro resumo, e so um", [r3.mandados >= 1, textos().filter((t) => t.startsWith("Resumo de")).length], [true, 2]);
  conferir("religado de manha, o resumo de ontem nao sai", (await a.rodarAvisosDoTelegram({ agora: new Date("2025-03-12T12:00:00.000Z").getTime(), cliente })).mandados, 0);

  // Orcamento: com o mes de teste, o gasto vem de GastoIA de referencia zz-tg-* (ver teste-rise-ai.js, "dependencias.agoraDoOrcamento").
  // Gravar um gasto de 80% do teto no mes de sp20() e conferir UMA chave "orcamento:CLIENTES:2025-03:aviso"; gravar mais 25% e conferir a "esgotado".
  // (Escrever com as mesmas chamadas que teste-rise-ai.js usa para o orcamento.)

  // Bloqueado: outro produto zerado e um falso que responde 403 blocked.
  await prisma.produto.create({ data: { sku: "ZZ-TG-ZERO2", nome: "ZZ TG Zero 2", estoque: 0, ativo: true /* ... */ } });
  const bloq = criarTelegramFalso({ falhas: { sendMessage: { status: 403, description: "Forbidden: bot was blocked by the user" } } });
  const r4 = await a.rodarAvisosDoTelegram({ agora: sp20("2025-03-12"), cliente: criarClienteTelegram({ token: TOKEN, requisitar: bloq.requisitar }) });
  const linha = await prisma.avisoTelegram.findFirst({ where: { chave: { startsWith: "produto-zerou:" }, erro: { not: null } }, orderBy: { criadoEm: "desc" } });
  conferir("bloqueado: falha anotada, 3 tentativas de uma vez, sem insistir", [r4.falhas >= 1, linha.tentativas, linha.erro.includes("blocked")], [true, 3, true]);
  conferir("nenhum texto gravado leva o token", (await prisma.avisoTelegram.findMany({ where: { erro: { contains: TOKEN } } })).length + (await prisma.logIntegracao.findMany({ where: { servico: "TELEGRAM", OR: [{ endpoint: { contains: TOKEN } }, { erro: { contains: TOKEN } }] } })).length, 0);
}
```

(`limpar()` ganha: `avisoTelegram` com `chatId` começando por `zz-tg-` **e** as chaves `produto-zerou:<id dos produtos ZZ-TG-*>`, `resumo:*:zz-tg-*`, `orcamento:*:zz-tg-*`; produtos `ZZ-TG-*`; `gastoIA` com referência `zz-tg-*`. O `orcamento` do teste usa o mês de 2025 de `sp20()`, como o `teste:rise-ai`, para não tocar no mês do dono.)

- [ ] **Step 2: Rodar e ver falhar** — Expected: `Cannot find module '../src/lib/telegram/avisos.js'`.
- [ ] **Step 3: Implementar `avisos.js`**, ligar no worker e acrescentar a variável ao `.env.example`.
- [ ] **Step 4: Rodar e ver passar** `npm run teste:telegram`; depois, **sozinho**, `npm run teste:worker` (o worker de teste não deve chamar a rotina: conferir que o `telegramFalso` não é preciso e que o log do worker de teste não tem "telegram").
- [ ] **Step 5: Commit** `feat(telegram): avisos pelo worker (zerou, orcamento, PC, falha, resumo 20h) e ping do healthchecks (C1, tarefa 7)` — `src/lib/telegram/avisos.js src/lib/telegram/avisosTipos.js scripts/worker-processo.js .env.example scripts/teste-telegram.js`.

---

### Task 8: Fechamento — CLAUDE.md, ritual e o roteiro do dono

**Files:**
- Modify: `CLAUDE.md` (linha nova em "Rodar": `npm run teste:telegram  # N asserções da Entrega C1...`; a linha do `teste:acessos` se o número mudou; seção nova "### Rise AI (Entrega C1, avisos no Telegram, 22/10/2026)" antes de "## Servidor MCP (20/10/2026)"; a linha de Estado do Rise AI ganha "C1 pronta, SEM deploy")
- Test: o ritual (`npm run lint`, `teste:extracao`, `teste:coleta`, `teste:cadastros`, `teste:acessos`, `teste:rise-ai`, `teste:mcp`, `teste:telegram`; `teste:worker` sozinho)

- [ ] **Step 1: Rodar o ritual** — Expected: tudo verde; anotar os totais.
- [ ] **Step 2: Escrever a seção do CLAUDE.md** com: onde mora cada parte, as decisões (worker normal manda; sem polling; chave de idempotência; quem recebe; o que não entrou da spec e por quê), o que NÃO foi visto (um envio real ao Telegram: o token real nunca entrou no PC), e o roteiro do dono:
  1. (Antes do deploy) 2º fator do Tinyauth para Maicol e Andrea. Criar o bot no @BotFather (`/newbot`), copiar o token.
  2. Rise AI › Configurações › Canais: colar o token, **Salvar token**, **Testar conexão**: aparece `@<seu_bot>`. Nada do token aparece na tela nem em Integrações.
  3. Configurações › Usuários › seu usuário › Dados › Telegram: **Gerar código**; no Telegram, abrir o bot, **Iniciar** e enviar `/vincular <código>`; no Rise, **Conferir vínculo**: aparece seu nome e @; **Confirmar vínculo**: chega "Telegram ligado ao Rise para Maicol" no celular, com o botão Abrir no Rise.
  4. Canais: ligar **Bot ligado**, Salvar. Zerar o estoque de um produto de teste pela lista: em até 1 minuto chega "Produto zerou: …" com o botão para o cadastro. Zerar de novo o mesmo não repete; devolver estoque e zerar outra vez repete.
  5. Às 20h chega o resumo do dia (4 linhas). Desmarcar "Resumo do dia" em Canais e salvar: no dia seguinte não chega.
  6. (Opcional) `HEALTHCHECKS_WORKER_URL` no `.env` da VPS com um check de 5 min: parar o worker (`npm run worker:parar`) e, em 10 min, chega o e-mail do healthchecks.
- [ ] **Step 3: Commit do CLAUDE.md só pelo trecho** (`git hash-object -w` + `update-index --cacheinfo` se o arquivo de trabalho tiver mudança de outra sessão; conferir o HEAD depois) e `git push`.

---

## Self-review (feito ao escrever)

1. **Spec coverage.** §7 Entrega C: token cifrado em `Conexao` (T1, T6), vínculo por código com hash, 10 min, 5 erros, confirmação de nome e @, `telegramChatId` único (T4), C1 sem polling (T4: uma leitura), token mascarado em todo log (T3), idempotência (T7 pela chave; `update_id` confirmado em T4), interruptor "desligar o bot" (T5/T6), lista de avisos (T5/T7: os cinco possíveis hoje; os de conversa/WhatsApp/serviço `ia` dependem da Entrega B e ficam para a C2, dito no CLAUDE.md), panes ao healthchecks.io (T7). §5a.5 aba Canais e §5a.7 formato (T2). §10 banco (T1). **Fora, de propósito:** avisos que dependem do WhatsApp/chat (conversa passada a humano, cliente sem resposta, aguardando retorno, contato suspeito, erro no serviço `ia`/WhatsApp) e o `/status` do bot (é leitura de texto; C2).
2. **Step scan.** Cada passo de código tem assinatura e arquivo; os textos das mensagens são fixados (o dono lê). O bloco de orçamento da T7 fica como instrução (depende de ajudantes do `teste:rise-ai` que o implementador copia).
3. **Tipos.** `criarClienteTelegram` devolve `{ ok, dados, erro, bloqueado? }` em T3 e é o que T4/T7 consomem; `avaliarAtualizacoes` devolve `{ achado, anulado, ultimoUpdateId }` em T4 e T4 usa `ultimoUpdateId` no `confirmarAtualizacoes`; `mensagemDoAviso` → `{ texto, caminho }` em T2, consumido em T7 e passado a `enviarMensagem(chatId, texto, { caminho })`.
4. **Review Focus.** 1 → T6 Step 4 e T3 (`limparToken`); 2 → T3 (`offset: -100`) e T4 (`confirmarAtualizacoes`); 3 → T7 (bloqueado); 4 → T7 (zerou/voltou/zerou); 5 → T7 (resumo de ontem não sai).
5. **Proporção.** O plano é maior que a spec da C porque fixa textos e testes; os corpos ficaram fora.
