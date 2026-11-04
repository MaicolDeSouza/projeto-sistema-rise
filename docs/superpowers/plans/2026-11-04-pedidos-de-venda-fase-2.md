# Pedidos de venda, fase 2 (webhooks, NF/XML e Telegram) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** os canais avisam o Rise na hora da venda (webhooks do ML, do Bling e da LI), os botões Baixar NF e Baixar XML
funcionam, e o Telegram avisa "Nova venda" e "Pedido aguardando peças".

**Architecture:** uma rota pública `POST /api/webhooks/[origem]` só confere quem mandou e grava a notificação na fila
`NotificacaoDePedido` (responde 200 em milissegundos); o worker normal esvazia a fila a cada volta (5 s) chamando a MESMA
leitura por pedido da fase 1 (`lerPedidoDaOrigem` + `aplicarPedidoLido`), e a rotina de 5 min continua como rede de
segurança. O download da NF passa por `GET /api/pedidos/[id]/nf?tipo=pdf|xml` (proxy com o token no ML, redirecionamento
na LI e no Bling). Os dois avisos novos do Telegram entram no molde da Entrega C1 (`avisosTipos.js`, `texto.js`,
`avisos.js`).

**Tech Stack:** Next 16 (route handlers), Prisma 7 (migration nova), Node `crypto` (HMAC do Bling), JS sem TypeScript.

**Spec:** `docs/superpowers/specs/2026-11-04-modulo-pedidos-de-venda-design.md` (5.8 download, 5.11 webhooks, 5.12
Telegram, 6 "Fases de entrega" item 2). Continua o plano da fase 1, `docs/superpowers/plans/2026-11-04-modulo-pedidos-de-venda.md`.

## Global Constraints

- Texto da tela com acento; identificadores e comentários sem acento (CLAUDE.md).
- Nada sobe para a VPS sem o "sobe" do dono. O cadastro dos webhooks no DevCenter do ML e no app do Bling é feito pelo
  DONO (o Rise não tem acesso a essas telas); o da LI é o botão "Ligar notificações" (PUT na LI, atrás de
  `exigirTravaLiberada("LOJA_INTEGRADA")`).
- A rota pública só GRAVA na fila e responde; nunca lê o canal nem o banco de pedidos dentro do pedido HTTP (o ML exige
  resposta em < 500 ms, o Bling em < 5 s).
- Notificação falsa não produz nada: o worker lê o recurso com o próprio token, e um id que não existe vira só um erro na
  linha da fila.
- No PC nada chega (sem `APP_URL_PUBLICA`): o botão da LI fica desligado com o motivo "Só na VPS".
- Teste: `npm run teste:pedidos` (Postgres local, SEM rede; só escreve `ZZ-PED-*`); `teste:acessos` continua verde (o guarda
  estático aceita a rota pública pelo `conferirNotificacao(`); `teste:telegram` continua verde.

## Review Focus

1. **A mesma notificação chega duas ou dez vezes** (o ML e o Bling reenviam até receber 200) → um só pedido, a fila
   processa sem erro e sem duplicar. Teste na Tarefa 3 ("notificacao repetida nao duplica").
2. **Notificação de um pedido do Bling que é cópia do ML/LI** → não vira pedido BLING, só preenche o espelho. Teste na
   Tarefa 3 ("bling: copia do ML so espelha").
3. **Corpo gigante, vazio ou que não é JSON na rota pública** → 400/413 sem gravar nada. Teste na Tarefa 2.
4. **Assinatura do Bling errada ou ausente / token da LI errado / `user_id` ou `application_id` do ML de outra conta** →
   401, nada na fila. Teste na Tarefa 2.
5. **NF do ML pedida sem o ML conectado ou com URL fora da API do ML** → erro claro, nunca um proxy para outro host.
   Teste na Tarefa 5 ("nf: url fora do ML e recusada").

---

### Task 1: A fila `NotificacaoDePedido`

**Files:**
- Modify: `prisma/schema.prisma` (modelo novo; `Canal` já existe)
- Create: `prisma/migrations/20261104b_notificacao_de_pedido/migration.sql` (gerada com `npx prisma migrate dev --create-only` e conferida)
- Test: `scripts/teste-pedidos.js` (seção "Fila")

**Interfaces:**
- Produces: `prisma.notificacaoDePedido` com `{ id, origem Canal, recurso String, payload Json, recebidaEm DateTime @default(now()), processadaEm DateTime?, erro String?, tentativas Int @default(0) }`, `@@index([processadaEm])`, `@@index([origem, recurso])`.

- [ ] **Step 1: Teste que falha** — seção "Fila": cria uma linha `{ origem: "MERCADO_LIVRE", recurso: "/orders/ZZ-PED-900", payload: {} }`, confere `[tentativas, processadaEm]` = `[0, null]` e apaga. `limpar()` ganha `notificacaoDePedido.deleteMany({ where: { recurso: { contains: "ZZ-PED" } } })`.
- [ ] **Step 2: Rodar** — `npm run teste:pedidos` → FAIL "Cannot read properties of undefined (reading 'create')".
- [ ] **Step 3: Modelo e migration**; `npx prisma generate`.
- [ ] **Step 4: Rodar** — verde.
- [ ] **Step 5: Commit** — `feat(pedidos): fila NotificacaoDePedido`.

### Task 2: A rota pública e a conferência de quem mandou

**Files:**
- Create: `src/lib/pedidos/webhooks.js`, `src/app/api/webhooks/[origem]/route.js`
- Modify: `deploy/caddy/Caddyfile` (bloco `@webhooks` com `path /api/webhooks/*`, `handle` com `reverse_proxy app:3000` SEM o `forward_auth`, ao lado do `@extensaoAliExpress`), `scripts/teste-acessos.js` (o `confere` aceita `conferirNotificacao(`)
- Test: `scripts/teste-pedidos.js` (seção "Webhooks")

**Interfaces:**
- Produces:
  - `ORIGEM_DA_ROTA = { "mercado-livre": "MERCADO_LIVRE", "loja-integrada": "LOJA_INTEGRADA", bling: "BLING" }`
  - `conferirNotificacao({ origem, corpoTexto, headers, segredos }) → { ok: true, recurso, payload } | { ok: false, status, erro }` (pura). `segredos = { mlUsuarioId, mlClientId, blingClientSecret, liToken }`.
    - ML: `payload.user_id == mlUsuarioId` E `payload.application_id == mlClientId`; `recurso = payload.resource` (`/orders/123` ou `/shipments/456`); tópicos aceitos `orders_v2`, `shipments` (outro tópico: ok com `recurso = null`, ignorado na fila).
    - Bling: header `x-bling-signature-256` = `sha256=` + HMAC-SHA256 hex do corpo CRU com `blingClientSecret`, comparado com `crypto.timingSafeEqual`; `recurso = "<event>:<data.id>"` (ex.: `order.updated:7002`, `invoice.created:9001`).
    - LI: o token aparece em QUALQUER header (`authorization` com ou sem "Bearer ", `token`, `x-token`, `x-webhook-token`); o nome real é medido na 1ª notificação e anotado no CLAUDE.md. `recurso = "pedido:<numero>"` quando o corpo trouxer `numero`/`pedido_numero`/`id`, senão `"pedido:?"` (reler pelo cursor).
  - `segredosDosWebhooks() → segredos` (lê o `userId` do segredo do ML sem rede, `config.mercadoLivre.clientId`, `config.bling.clientSecret` e o `webhookToken` decifrado da `Conexao` LOJA_INTEGRADA).
  - `registrarNotificacao({ origem, recurso, payload }) → { id }` (grava a linha; recurso nulo não grava).
  - Rota: `POST` com corpo até 256 KB (`413` acima), `400` para JSON inválido, `404` para origem desconhecida, `401` para conferência que falha, `200 { ok: true }` gravado. Sem sessão; não lê pedido nem canal.

- [ ] **Step 1: Testes que falham** (pura + rota, com `new Request(...)`):
```js
const { conferirNotificacao } = await import("../src/lib/pedidos/webhooks.js");
const seg = { mlUsuarioId: "212386247", mlClientId: "123", blingClientSecret: "segredo-zz", liToken: "tok-zz" };
const corpoML = JSON.stringify({ resource: "/orders/2000000001", user_id: 212386247, topic: "orders_v2", application_id: 123 });
conferir("webhook ML valido", conferirNotificacao({ origem: "MERCADO_LIVRE", corpoTexto: corpoML, headers: new Headers(), segredos: seg }).recurso, "/orders/2000000001");
conferir("webhook ML de outra conta", conferirNotificacao({ origem: "MERCADO_LIVRE", corpoTexto: corpoML.replace("212386247", "999"), headers: new Headers(), segredos: seg }).status, 401);
conferir("webhook ML de outro app", conferirNotificacao({ origem: "MERCADO_LIVRE", corpoTexto: corpoML.replace('"application_id":123', '"application_id":9'), headers: new Headers(), segredos: seg }).status, 401);
const corpoBling = JSON.stringify({ event: "order.updated", companyId: "x", data: { id: 7002 } });
const assinatura = "sha256=" + createHmac("sha256", "segredo-zz").update(corpoBling).digest("hex");
conferir("webhook Bling assinado", conferirNotificacao({ origem: "BLING", corpoTexto: corpoBling, headers: new Headers({ "x-bling-signature-256": assinatura }), segredos: seg }).recurso, "order.updated:7002");
conferir("webhook Bling sem assinatura", conferirNotificacao({ origem: "BLING", corpoTexto: corpoBling, headers: new Headers(), segredos: seg }).status, 401);
conferir("webhook LI com token", conferirNotificacao({ origem: "LOJA_INTEGRADA", corpoTexto: '{"numero":5001}', headers: new Headers({ token: "tok-zz" }), segredos: seg }).recurso, "pedido:5001");
conferir("webhook LI token errado", conferirNotificacao({ origem: "LOJA_INTEGRADA", corpoTexto: '{"numero":5001}', headers: new Headers({ token: "x" }), segredos: seg }).status, 401);
// rota: corpo que nao e JSON = 400; origem desconhecida = 404; acima de 256 KB = 413 (nada gravado em nenhum)
```
- [ ] **Step 2: Rodar** — FAIL "Cannot find module .../pedidos/webhooks.js".
- [ ] **Step 3: Implementar** `webhooks.js` e a rota (a rota chama `conferirNotificacao(` — é o marcador do guarda de acessos); o Caddyfile e o guarda do `teste-acessos.js`.
- [ ] **Step 4: Rodar** — `teste:pedidos` e `teste:acessos` verdes.
- [ ] **Step 5: Commit** — `feat(pedidos): rota publica dos webhooks com a conferencia de cada canal`.

### Task 3: O worker esvazia a fila

**Files:**
- Modify: `src/lib/pedidos/leitura.js` (`processarNotificacoes`), `scripts/worker-processo.js` (chamada a cada volta, só `!FONTES && !SO_NO_PC`)
- Test: `scripts/teste-pedidos.js` (seção "Fila", com os três falsos)

**Interfaces:**
- Consumes: `lerPedidoDaOrigem`, `aplicarPedidoLido`, `espelharNoBling`, `classificarLojaDoBling`, `rodarLeituraDePedidos`.
- Produces: `processarNotificacoes({ ml, li, bling, limite = 20, agora } = {}) → { processadas, erros }`. Pega as linhas sem `processadaEm` e com `tentativas < 5`, mais antigas primeiro, e AGRUPA pelo recurso (dez avisos do mesmo pedido = uma leitura). Por origem:
  - ML `/orders/{id}` → `aplicarPedidoLido(await lerPedidoDaOrigem("MERCADO_LIVRE", id))`; `/shipments/{id}` → `GET /shipments/{id}` dá `order_id` → o mesmo.
  - Bling `order.*:{id}` → `GET /pedidos/vendas/{id}`; `classificarLojaDoBling(loja.id)`: `bling` → normaliza e aplica; `espelhoML`/`espelhoLI` → `espelharNoBling`; `outra` → ignora. `invoice.*:{id}` → acha o pedido BLING cujo `nf.idExterno` é o id e o relê; sem pedido, ignora.
  - LI `pedido:{numero}` → lê e aplica; `pedido:?` → `rodarLeituraDePedidos` só da LI (o cursor).
  - Sucesso: `processadaEm = agora` em todas as linhas do grupo. Falha: `tentativas + 1` e `erro` (até 200 caracteres); na 5ª, `processadaEm` também (desiste; a rotina de 5 min cobre).

- [ ] **Step 1: Testes que falham**: "fila: pedido do ML pela notificacao" (grava `/orders/2000000001`, processa, o pedido existe); "notificacao repetida nao duplica" (três linhas iguais → 1 leitura, 3 processadas, 1 pedido); "fila: shipment acha o pedido"; "bling: copia do ML so espelha" (`order.updated:7002` → nenhum pedido BLING 123, espelho preenchido); "bling: pedido digitado vira pedido" (`order.created:7001`); "fila: id que nao existe vira erro e tenta de novo" (`/orders/9`, tentativas 1, `processadaEm` nulo); "fila: na 5a tentativa desiste".
- [ ] **Step 2: Rodar** — FAIL "processarNotificacoes is not a function".
- [ ] **Step 3: Implementar** e ligar no worker (a cada volta; `log` só quando processou algo).
- [ ] **Step 4: Rodar** — verde.
- [ ] **Step 5: Commit** — `feat(pedidos): worker processa a fila dos webhooks`.

### Task 4: "Ligar notificações" da LI

**Files:**
- Create: `src/lib/pedidos/webhooksLI.js`
- Modify: `scripts/lib/lojaIntegradaFalsa.js` (`PUT /webhooks/v1/pedido` na raiz, guarda o corpo), `src/app/integracoes/acoes.js` (`ligarNotificacoesLIAcao()` com o mesmo `negarSemAcesso` que as outras ações da tela usam — conferir no arquivo), `src/components/CartaoConector.jsx` (no cartão da LOJA_INTEGRADA, botão secundário "Ligar notificações"; ligado mostra "Notificações ligadas em dd/mm"; sem `APP_URL_PUBLICA` desabilitado com o `title` "Só na VPS")
- Test: `scripts/teste-pedidos.js`

**Interfaces:**
- Produces: `ligarNotificacoesLI({ cliente = clienteLI(), base = config.appUrlPublica, gerarToken = () => randomBytes(24).toString("hex") } = {}) → { ok, ligadasEm } | { ok: false, erro }`: sem base → `{ ok: false, erro: "Só na VPS: falta APP_URL_PUBLICA." }`; `exigirTravaLiberada("LOJA_INTEGRADA")`; `PUT /webhooks/v1/pedido` (base `raiz`) com `{ notifyUrl: base + "/api/webhooks/loja-integrada", token }`; grava no segredo da `Conexao` LOJA_INTEGRADA (o JSON cifrado ganha `webhookToken` e `webhookLigadoEm`, sem apagar o `personalToken`).

- [ ] **Step 1: Testes que falham**: "LI: ligar sem base recusa"; "LI: ligar manda a URL e guarda o token cifrado" (a LI falsa recebeu `notifyUrl` terminando em `/api/webhooks/loja-integrada`; `lerSegredo("LOJA_INTEGRADA").webhookToken` igual ao token gerado; o `personalToken` anterior continua). O teste restaura o segredo da LI no fim.
- [ ] **Step 2: Rodar** — FAIL.
- [ ] **Step 3: Implementar** a função, a ação e o botão ("use UI/UX": botão secundário no cartão, não ação principal).
- [ ] **Step 4: Rodar** — `teste:pedidos`, `teste:acessos` verdes; conferir o cartão no navegador (PC: desligado, "Só na VPS").
- [ ] **Step 5: Commit** — `feat(pedidos): ligar as notificacoes de pedidos da LI`.

### Task 5: Baixar NF e XML

**Files:**
- Create: `src/lib/pedidos/nf.js`, `src/app/api/pedidos/[id]/nf/route.js`
- Modify: `src/lib/pedidos/li.js` (o normalizador aceita `nf` = o `GET /v1/pedido_nf/{id}`), `src/lib/pedidos/leitura.js` (`lerPedidoLI` procura no JSON do pedido um texto `/api/v1/pedido_nf/(\d+)` e, achando, lê a NF), `scripts/lib/lojaIntegradaFalsa.js` (`GET /pedido_nf/{id}`), `src/components/pedidos/AbaNotaFiscal.jsx` (os dois botões viram links `target="_blank"` para a rota; sem a URL do tipo, desligado com o `title` "Este canal não deu o arquivo")
- Test: `scripts/teste-pedidos.js` (seção "NF")

**Interfaces:**
- Produces:
  - `destinoDaNF(nf, tipo) → { tipo: "proxyML", caminho } | { tipo: "redirecionar", url } | { erro }` (pura): `tipo ∈ {"pdf","xml"}`; ML (`nf.origem` MERCADO_LIVRE) → `proxyML` só para caminho que começa com `/` (o `urlPdf`/`urlXml` gravados são caminhos da API); URL absoluta no ML → `{ erro: "Endereço da NF fora da API do ML." }`; LI e Bling → `redirecionar` só para `https://`; Bling XML usa `nf.urlXml ?? nf.xml` quando é URL.
  - `baixarDoML(caminho, { obterToken = obterAccessToken, buscar = fetch } = {}) → { bytes, tipoDeConteudo }` (GET `https://api.mercadolibre.com${caminho}` com o Bearer).
  - Rota `GET /api/pedidos/[id]/nf?tipo=pdf|xml`: `negarSemAcesso("acao.pedidos.baixarNF", "executar")`; lê o pedido; redireciona (302) ou devolve os bytes com `Content-Disposition: attachment; filename="NF-<numero>.<pdf|xml>"`.
  - `normalizarPedidoLI({ pedido, historico, etiquetas, nf = null })`: `nf` → `{ origem: "LOJA_INTEGRADA", idExterno, numero, serie, chave: access_key, emitidaEm: data, status: enviada ? "authorized" : "pending", urlPdf: url, urlXml: url_xml }`.

- [ ] **Step 1: Testes que falham**: "nf: ML vira proxy do caminho"; "nf: url fora do ML e recusada"; "nf: LI e Bling redirecionam so https"; "nf: baixarDoML manda o Bearer" (buscar falso guarda o header); "LI: pedido com pedido_nf le a NF" (a LI falsa com `/pedido_nf/77`, o pedido com `"nota_fiscal": "/api/v1/pedido_nf/77"` → `nf.numero`).
- [ ] **Step 2: Rodar** — FAIL.
- [ ] **Step 3: Implementar** (`nf.js`, a rota, a LI e a aba).
- [ ] **Step 4: Rodar** — `teste:pedidos`, `teste:acessos` verdes; conferir os botões na aba Nota fiscal de um pedido real do ML no PC (o PDF baixa com o token do PC).
- [ ] **Step 5: Commit** — `feat(pedidos): baixar NF e XML pelo Rise`.

### Task 6: Telegram — "Nova venda" e "Pedido aguardando peças"

**Files:**
- Modify: `src/lib/telegram/avisosTipos.js` (`novaVenda`: "Nova venda"; `aguardandoPecas`: "Pedido aguardando peças"), `src/lib/telegram/texto.js` (as duas mensagens), `src/lib/telegram/avisos.js` (`CALCULO` e `caminhoDoAviso`: `nova-venda:<id>` e `aguardando-pecas:<id>` → `/pedidos/<id>`), `scripts/teste-telegram.js` (contagem de tipos, se houver)
- Test: `scripts/teste-pedidos.js` (seção "Telegram")

**Interfaces:**
- Produces: `avisosDevidos("novaVenda", { agora })` → um por pedido com `criadoEm` nas últimas 2 h e `dataDaVenda` nas últimas 24 h (a carga inicial e as releituras não mandam venda velha), chave `nova-venda:<pedidoId>`, dados `{ canal, numero, cliente, total }`; `avisosDevidos("aguardandoPecas", { agora })` → um por pedido em `AGUARDANDO_PECAS` com `dataDaVenda` nos últimos 7 dias, chave `aguardando-pecas:<pedidoId>`, dados `{ numero, pecas: "falta 2× 900211 (previsão 12/11)" }`. Texto: "Nova venda Mercado Livre 2000019330097440" / "Nicollas Merces de Moraes, R$ 49,70"; "Pedido 2000019330097440 aguardando peças" / a linha das faltas.

- [ ] **Step 1: Testes que falham**: "telegram: nova venda de pedido recem lido"; "telegram: venda antiga nao avisa"; "telegram: aguardando pecas com a falta no texto"; "telegram: o botao abre o pedido".
- [ ] **Step 2: Rodar** — FAIL.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** — `teste:pedidos` e `teste:telegram` verdes.
- [ ] **Step 5: Commit** — `feat(pedidos): avisos de nova venda e de aguardando pecas no Telegram`.

### Task 7: Documentação e ritual

**Files:**
- Modify: `CLAUDE.md` (seção "Pedidos de venda": fase 2 — a rota, a fila, o que o DONO cadastra: ML DevCenter "Notificações" com a URL `https://rise.4hobby.com.br/api/webhooks/mercado-livre` e os tópicos `orders_v2` e `shipments`; app do Bling "Webhooks" com `https://rise.4hobby.com.br/api/webhooks/bling` e os eventos de pedido de venda e NF-e; LI pelo botão; o que medir na 1ª notificação real: o header do token da LI e o corpo dela, o `companyId` do Bling)

- [ ] **Step 1:** Seção do CLAUDE.md.
- [ ] **Step 2:** `npm run lint`; `teste:pedidos`, `teste:acessos`, `teste:saude`, `teste:telegram`, `teste:li-sync`, `teste:anuncios-ml`, `teste:bling-sync` (os falsos mudaram); `teste:worker` sozinho.
- [ ] **Step 3: Commit e push** — `docs: Pedidos de venda fase 2 no CLAUDE.md`. Sem deploy.
- [ ] **Step 4:** Relatório ao dono com "O que foi feito" e "Testes que você precisa fazer", incluindo o passo a passo do cadastro no DevCenter do ML e no app do Bling.
