# Atendimento do ML, fase 2 (mensagens de pós-venda): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (escolha do dono: inline, sem subagentes, na
> main) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o dono lê as mensagens que o comprador manda depois da compra no Rise, no Telegram e pelo MCP, pede (se quiser) a
sugestão da IA, aprova e o Rise envia a resposta ao ML, uma única vez.

**Architecture:** a fase 1 fica como está e ganha um segundo tipo. Uma linha de `AtendimentoML` (`tipo: POS_VENDA`) por
conversa (pack, ou o pedido quando não há pack), com um retrato da conversa no banco para a lista, o Telegram e o MCP não
dependerem do ML na hora. Arquivo novo `src/lib/atendimentoML/posVenda.js` (ler, resumir, aplicar, enviar); rascunho,
filtro, sugestão, tela, bot e MCP são os MESMOS da fase 1, escolhendo o caminho pelo `tipo` da linha.

**Tech Stack:** o da fase 1 (Next, Prisma/Postgres, worker, provedores do Rise AI, MCP).

**Spec:** `docs/superpowers/specs/2026-11-24-atendimento-ml-design.md` (seção "Fase 2: mensagens de pós-venda").

## Medido na conta real em 24/11/2026 (só leitura, `mark_as_read=false`)

- `GET /messages/packs/{pack}/sellers/{vendedor}?tag=post_sale&mark_as_read=false` devolve `paging {limit 10, offset,
  total}`, `conversation_status { path, status, substatus, claim_ids, shipping_id }`, `messages[]` **da mais nova para a
  mais antiga**, `seller_max_message_length: 350` e `buyer_max_message_length: 3500`.
- Cada mensagem: `id` (32 hex), `from.user_id`, `to.user_id`, `status` ("available"), `text`, `message_date.created`,
  `message_moderation { status: "clean", reason }`, `message_attachments` (nulo ou lista), `message_resources`.
- Em 60 pedidos: 57 `blocked / blocked_by_conversation_initiated_by_seller_limited` sem mensagem (o comum: ninguém
  escreveu), 2 `blocked / blocked_by_cancelled_order`, 1 `active` com 3 mensagens (comprador, vendedor, comprador).
- `GET /messages/unread?role=seller&tag=post_sale` devolve `{ user_id, total, results: [] }`. **Com item nunca foi
  visto** (total 0 na hora): o formato de `results[]` é o da documentação (`resource: "/packs/{id}/sellers/{id}"`,
  `count`), e o código aceita também o pack solto. Conferir na primeira mensagem real.
- **Nunca visto:** o corpo da notificação `messages` e um `POST` de mensagem. Ficam para o primeiro uso real, com a trava.

## Global Constraints

- Trava `ML_RESPONDER_MENSAGENS` no `.env`, nasce `false`; com ela desligada tudo funciona menos o `POST` da mensagem.
- `POST` com **uma tentativa**; nunca repetir sozinho. Uma mensagem por vez.
- Só responde a quem já escreveu: o Rise nunca inicia conversa. Linha só nasce com mensagem do COMPRADOR.
- O limite é o `seller_max_message_length` lido do ML e guardado na linha (350 hoje); nunca fixo no código.
- Leitura sempre com `mark_as_read=false`. O Rise só marca como lida depois que o dono responde ou ignora.
- A IA recebe a conversa, os itens do pedido, a situação do envio e o rastreio. Nunca nome completo, CPF, endereço,
  telefone, custo, margem ou fornecedor. Texto do comprador mascarado (`mascararDadosPessoais`) antes da IA, do Telegram e
  do MCP.
- A sugestão da IA de pós-venda não leva link (sem etiqueta de anúncio); o dono pode colar link do Mercado Livre.
- Conversa que o ML não deixa responder (`conversation_status.status` diferente de `active`): a tela, o bot e o MCP dizem o
  motivo numa linha e não oferecem o envio. Com `claim_ids`, a linha diz "em reclamação".
- Mesmos acessos da fase 1 (`tela.atendimento`, `acao.atendimentoML.responder`, `acao.atendimentoML.mcp`).
- Padrão visual, dinheiro sem espaço, tabela com cabeçalho que ordena, 25 por página com o botão de 100.
- Testes sem rede (ML, Telegram e IA falsos); só escrevem `ZZ-ATD-*` / `zz-atd-*`.
- Commit só dos arquivos de cada tarefa, trailer `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Nada na VPS e nenhum gasto real de IA sem o ok do dono.

## Review Focus

1. Mensagem nova do comprador chega enquanto o dono escreve: o envio relê a conversa e, se a última mensagem do comprador
   não é a que a linha guardou, recusa com "chegou mensagem nova" e atualiza a tela. → Tarefa 3.
2. Respondida pelo app do ML antes do envio (a última mensagem é do vendedor): nada é enviado, vira FECHADA_FORA. → Tarefas 2 e 3.
3. Comprador escreve de novo depois de respondida ou ignorada: a MESMA linha reabre, sem rascunho velho, com aviso novo
   no Telegram. → Tarefas 2 e 6.
4. Mensagem só com anexo (texto vazio) ou moderada pelo ML: aparece como "[anexo]" / "[mensagem retida pelo ML]", abre a
   linha e a IA não inventa o conteúdo. → Tarefas 1 e 4.
5. Conversa com mais de 10 mensagens (`paging.total` maior que o lido): lê as páginas seguintes até 50 mensagens; além
   disso guarda as 50 mais novas e avisa "conversa longa". → Tarefa 1.

---

### Task 1: banco e retrato da conversa

**Files:**
- Modify: `prisma/schema.prisma` (modelo `AtendimentoML`)
- Create: `prisma/migrations/20261124e_atendimento_pos_venda/migration.sql`
- Create: `src/lib/atendimentoML/posVenda.js`
- Modify: `scripts/lib/mlPerguntasFalso.js`, `scripts/teste-atendimento-ml.js`

**Interfaces:**
- Produces (colunas novas, todas opcionais): `pedidoId String?` (o `PedidoDeVenda` do Rise, sem chave estrangeira),
  `conversa Json?`, `ultimaDoClienteId String?`, `bloqueio String?`, `limite Int?`.
- Produces: `resumirConversa(dados, vendedorId)` → `{ mensagens: [{ id, de: "C" | "V", texto, em, anexos, retida }]` (da
  mais antiga para a mais nova), `compradorId, ultimaDoCliente: { id, texto, em } | null, aguardaResposta: boolean,
  bloqueio: string | null, emReclamacao: boolean, limite: number, longa: boolean }`.
- Produces: `textoDoBloqueio(bloqueio)` → frase em português para `blocked_by_cancelled_order`, mediação, Full não
  entregue, conversa encerrada; desconhecido vira "O Mercado Livre bloqueou esta conversa (<código>)".
- Produces: `lerConversaDoML(ml, idExterno, { vendedorId })` → `dados` com todas as páginas (teto de 50 mensagens), ou
  `null` no 404; lança nos outros erros.
- Produces (falso): `criarMLFalso({ conversas: { [pack]: { status, substatus, claim_ids, mensagens: [...] } }, naoLidas })`
  atendendo `GET /messages/packs/...`, `GET /messages/unread`, `GET /messages/{id}` e `POST /messages/packs/...`.

- [ ] **Step 1:** teste (falha): `resumirConversa` com a conversa medida (C, V, C fora de ordem) devolve ordem crescente,
  `aguardaResposta: true`, `limite: 350`; última do vendedor → `aguardaResposta: false`; `blocked_by_cancelled_order` →
  `bloqueio` e a frase; mensagem com `text` vazio e anexo → `texto: "[anexo]"`, `anexos: 1`; moderação diferente de
  `clean` → `retida: true`; `claim_ids` com item → `emReclamacao: true`; `paging.total` 23 lido em 3 pedidos.
- [ ] **Step 2:** rodar `npm run teste:atendimento-ml`. Expected: FALHA nas asserções novas (função não existe).
- [ ] **Step 3:** migration (5 `ADD COLUMN`), `npx prisma migrate dev` no banco local, `posVenda.js` e o falso.
- [ ] **Step 4:** rodar de novo. Expected: 0 falha(s); `npm run teste:ia-isolamento` segue passando (o `rise_ia` não lê a tabela).
- [ ] **Step 5:** commit.

### Task 2: chegada (notificação, não lidas, releitura e reabertura)

**Files:**
- Modify: `src/lib/atendimentoML/posVenda.js`, `src/lib/atendimentoML/perguntas.js` (`rodarAtendimentoML`),
  `src/lib/pedidos/webhooks.js`, `src/lib/pedidos/leitura.js`, `src/lib/saude/regras.js` (se a rotina mudar de resumo)
- Test: `scripts/teste-atendimento-ml.js`, `scripts/teste-pedidos.js` (tópico novo)

**Interfaces:**
- Consumes: `resumirConversa`, `lerConversaDoML`.
- Produces: `aplicarConversaLida(idExterno, dados, { vendedorId, agora })` → `{ id, criada, reabriu, fechou, status }`.
  Regras: cria ABERTA só com `aguardaResposta`; ABERTA cuja última é do vendedor → FECHADA_FORA (`respondidaVia: "ML"`);
  RESPONDIDA/IGNORADA/FECHADA_FORA com `ultimaDoCliente.id` diferente do guardado → ABERTA de novo, com `rascunho`,
  `erroDoEnvio` e os três campos do Telegram zerados; sempre atualiza `conversa`, `bloqueio`, `limite`, `textoDoCliente`
  (a última do comprador, até 4.000) e `recebidaEm` (a data dela). Liga `pedidoId` pelo `packId` ou `idExterno` do
  `PedidoDeVenda` do ML.
- Produces: `buscarNaoLidas(ml)` → lista de ids de conversa (pack) tirados de `results[].resource`.
- Produces: `rodarPosVendaML({ ml, agora, soPrefixo })` → `{ ok, lidas, novas, reabertas, fechadas, fechadasIds }`; nunca
  lança. `rodarAtendimentoML` chama as perguntas e depois esta, e o erro de uma não esconde a outra (`posVenda: {...}`
  no retorno).
- Produces: tópico `messages` em `TOPICOS_DO_ML` e o ramo em `leitura.js`: `GET /messages/{id}?tag=post_sale`, tira o pack
  de `message_resources` (nome `packs`) e aplica a conversa. Notificação que não traz pack é ignorada (a rede pega).

- [ ] **Step 1:** testes (falham): mensagem nova cria a linha; a mesma lida duas vezes não duplica; resposta pelo app do
  ML fecha; comprador escreve de novo e a linha RESPONDIDA reabre limpa; conversa só do vendedor ou vazia não cria nada;
  `rodarPosVendaML` com o ML fora do ar devolve `ok: false` e as perguntas seguem; a notificação `messages` entra na
  fila e vira linha.
- [ ] **Step 2:** rodar. Expected: FALHA nas novas.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npm run teste:atendimento-ml`, `npm run teste:pedidos`, `npm run teste:saude`. Expected: 0 falha.
- [ ] **Step 5:** commit.

### Task 3: envio único e marcar como lida

**Files:**
- Modify: `src/lib/atendimentoML/posVenda.js`, `src/lib/atendimentoML/enviar.js`, `src/lib/atendimentoML/banco.js`
  (`salvarRascunho`, `ignorarAtendimento`), `.env.example`
- Test: `scripts/teste-atendimento-ml.js`

**Interfaces:**
- Produces: `mensagemDePosVendaLiberada(env)`; `TEXTO_DA_TRAVA_DE_MENSAGENS = "Envio desligado na VPS (ML_RESPONDER_MENSAGENS)."`.
- Produces: `limiteDoAtendimento(linha)` em `banco.js` → 2000 configurável para PERGUNTA, `linha.limite ?? 350` para
  POS_VENDA; `salvarRascunho` e o filtro passam a usá-la.
- Produces: `enviarMensagemDePosVenda({ linha, por, via, ml, env, agora })`, chamada por `enviarResposta` quando
  `linha.tipo === "POS_VENDA"` (a assinatura pública `enviarResposta({ id, por, via })` não muda). Ordem: filtro → trava
  → marca `enviandoDesde` (mesmo `updateMany`) → relê a conversa → recusa `bloqueada` (com a frase), `fechada-fora`
  (última do vendedor) ou `mensagem-nova` (última do comprador mudou; aplica a conversa lida) → `POST
  /messages/packs/{id}/sellers/{vendedor}?tag=post_sale` com `{ from: { user_id: vendedor }, to: { user_id: comprador },
  text }` → RESPONDIDA, auditoria sem o texto → `GET` da conversa SEM `mark_as_read=false` (marca lida; falha aqui só
  vai para o log).
- Produces: `ignorarAtendimento` de POS_VENDA também marca como lida no ML (mesma leitura; falha não desfaz o ignorar).

- [ ] **Step 1:** testes (falham): trava desligada recusa e nada sai; dois envios ao mesmo tempo → um `POST`; conversa
  bloqueada não envia e diz o motivo; respondida fora não envia; mensagem nova no meio recusa e atualiza; texto com 351
  caracteres barra; sucesso grava RESPONDIDA, um `POST` com `from`/`to` certos e uma leitura sem `mark_as_read`; ML que
  recusa (400 de moderação) solta a trava e guarda o motivo; ignorar marca lida.
- [ ] **Step 2:** rodar. Expected: FALHA nas novas.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar. Expected: 0 falha; as asserções da fase 1 intactas.
- [ ] **Step 5:** commit.

### Task 4: contexto e sugestão da IA

**Files:**
- Modify: `src/lib/atendimentoML/contexto.js`, `src/lib/atendimentoML/prompt.js`, `src/lib/atendimentoML/sugerir.js`
- Test: `scripts/teste-atendimento-ml.js`

**Interfaces:**
- Produces: `montarContextoDePosVenda(id)` → `{ conversa: [{ de, texto, em }], pedido: { numero, data, situacao, itens:
  [{ titulo, quantidade }], envio: { situacao, transportadora, rastreio, link, prazo } } | null, avisos: [] }`, lido do
  `PedidoDeVenda` (sem rede). Sem pedido no Rise: `pedido: null` e o aviso "Pedido não encontrado no Rise".
- Produces: `montarPromptDoML` aceita `contexto.tipo === "POS_VENDA"`: regras a mais (não pedir nem passar dado pessoal,
  não levar a conversa para fora do ML, não prometer reembolso, troca, devolução ou prazo que o contexto não traz, até
  `limite` caracteres, sem link, "[anexo]" não tem conteúdo conhecido).
- Produces: `sugerirResposta` aceita POS_VENDA (sem troca de etiqueta, `linksDaTroca: []`, `maxTokens` menor); se o texto
  passar do limite, volta barrado por tamanho como qualquer rascunho.

- [ ] **Step 1:** testes (falham): o contexto não tem CPF, nome, endereço nem custo (varrer o JSON pelos valores do
  pedido de teste); o prompt traz o rastreio e a regra do limite; sugestão gravada como IA com gasto `ATENDIMENTO_ML`;
  sugestão de 400 caracteres volta barrada; mensagem do comprador com telefone chega mascarada ao provedor falso.
- [ ] **Step 2:** rodar. Expected: FALHA nas novas.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar. Expected: 0 falha; `npm run teste:rise-ai` segue passando.
- [ ] **Step 5:** commit.

### Task 5: tela (aba Mensagens e janela da conversa)

**Files:**
- Modify: `src/app/atendimento/page.jsx`, `src/app/atendimento/acoes.js`, `src/components/atendimento/TabelaDePerguntas.jsx`,
  `src/components/atendimento/JanelaDaPergunta.jsx`, `src/components/atendimento/formatos.js`, `src/app/layout.jsx`
  (o número do menu soma os dois tipos)
- Create: `src/components/atendimento/JanelaDaConversa.jsx`, `src/components/atendimento/CaixaDaResposta.jsx` (a caixa,
  o contador, os barrados e os botões, tirados da `JanelaDaPergunta` para as duas janelas usarem a mesma)

**Interfaces:**
- Consumes: `listarAtendimentos({ tipo })`, `lerAtendimento`, as ações da fase 1 (já recebem só o `id`).
- Produces: abas **Perguntas | Mensagens** em `/atendimento` (`?tipo=mensagens`), cada uma com o número de abertas;
  colunas de Mensagens: recebida, pedido (link para o pedido no Rise), última mensagem, situação, rascunho.
- Produces: `detalhesDaConversaAcao(id)` → conversa, pedido (itens, situação, envio, rastreio, link), limite, bloqueio,
  link da conversa no ML; relê a conversa no ML ao abrir (sem marcar lida) e, se o ML não responder, mostra o retrato.

Desenho (regra 10: "nesta tela o operador precisa ver primeiro a última mensagem do comprador e a ação principal é Enviar
ao ML"): conversa em balões (comprador à esquerda, loja à direita, hora embaixo), o pedido numa faixa compacta acima,
a caixa com "0 de 350", bloqueio como uma linha âmbar no lugar dos botões de envio, "[anexo]" com o link "Abrir no ML".

- [ ] **Step 1:** `-- --manter` passa a deixar também 2 conversas `ZZ-ATD-T*` (uma ativa, uma bloqueada).
- [ ] **Step 2:** implementar, com `frontend-design` e `ecc:make-interfaces-feel-better` nas 10 regras do Padrão visual.
- [ ] **Step 3:** conferir no navegador em largura de notebook: abas, lista, janela, contador mudando de cor em 351,
  bloqueada sem botão de envio, aviso da trava, número do menu. `npm run lint` e `npm run teste:acessos`. Expected: limpo.
- [ ] **Step 4:** commit.

### Task 6: Telegram

**Files:**
- Modify: `src/lib/atendimentoML/telegram.js`, `src/lib/telegram/avisosTipos.js`, `src/lib/telegram/avisos.js`,
  `scripts/worker-processo.js`
- Test: `scripts/teste-atendimento-ml.js`, `scripts/teste-telegram.js`

**Interfaces:**
- Produces: tipo de aviso `mensagemML` ("Mensagem de comprador no Mercado Livre"), ligado/desligado na aba Canais.
- Produces: `avisarMensagensNovas(...)` no molde de `avisarPerguntasNovas`: pedido, itens, a última mensagem (mascarada),
  os botões **Sugerir com IA / Escrever / Editar / Ignorar / Abrir no Rise**; conversa bloqueada sai sem os botões de
  resposta, com o motivo. Linha reaberta (Tarefa 2) ganha aviso novo.
- Produces: os tratadores (`at:<id>:<s|e|v|i>`) passam a servir os dois tipos; a prévia mostra "N de 350".

- [ ] **Step 1:** testes (falham): aviso sai uma vez por mensagem aberta; reaberta avisa de novo; bloqueada sem botões;
  resposta escrita com 351 caracteres é recusada no chat; enviar pelo botão faz um `POST`; tipo desligado não avisa.
- [ ] **Step 2:** rodar. Expected: FALHA nas novas.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npm run teste:atendimento-ml` e `npm run teste:telegram`. Expected: 0 falha.
- [ ] **Step 5:** commit.

### Task 7: MCP

**Files:**
- Modify: `src/lib/mcp/atendimentoML.js`, `scripts/teste-mcp.js`, `scripts/teste-atendimento-ml.js`

**Interfaces:**
- Produces: as cinco ferramentas ganham os dois tipos, sem ferramenta nova: `listarAtendimentosML({ tipo: "perguntas" |
  "mensagens" | "todos" })` (padrão "todos"); `lerAtendimentoML` devolve, na mensagem, a conversa mascarada, o pedido sem
  dado pessoal, o limite e o bloqueio; `prepararRespostaML`/`enviarRespostaML` iguais (código preso ao texto).
  Descrições atualizadas para dizer "pergunta ou mensagem de pós-venda" e o limite de cada uma.

- [ ] **Step 1:** testes (falham): lista os dois tipos; ler mensagem não traz CPF, nome nem endereço; preparar com 351
  caracteres recusa; enviar com código faz um `POST`; conversa bloqueada recusa o preparar com o motivo; login sem o
  recurso é recusado.
- [ ] **Step 2:** rodar. Expected: FALHA nas novas.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** `npm run teste:mcp` e `npm run teste:atendimento-ml`. Expected: 0 falha.
- [ ] **Step 5:** commit.

### Task 8: documentação, bateria e revisão

**Files:**
- Modify: `CLAUDE.md` (linha do Atendimento ML, contagem de asserções, seção com o roteiro para ligar), a spec (o que a
  execução decidiu diferente), a memória do projeto.

- [ ] **Step 1:** `npm run lint`; `teste:atendimento-ml`, `teste:telegram`, `teste:mcp`, `teste:pedidos`, `teste:saude`,
  `teste:acessos`, `teste:rise-ai`, `teste:ia-isolamento`, `teste:extracao`, `teste:coleta`, `teste:cadastros` e, sozinho,
  `teste:worker`. Expected: tudo passando (o `teste:anuncios-ml` tem 1 falha de data conhecida, fora deste plano).
- [ ] **Step 2:** revisão final do diff inteiro pelos cinco pontos do Review Focus; correção com teste RED→GREEN.
- [ ] **Step 3:** CLAUDE.md, spec e memória; commit.
- [ ] **Step 4:** relatório ao dono ("O que foi feito" + "Testes que você precisa fazer") com o que só ele faz: marcar
  **Messages** no aplicativo do ML, o "sobe", `ML_RESPONDER_MENSAGENS=true` na VPS. Nada de deploy sem o "sobe".
