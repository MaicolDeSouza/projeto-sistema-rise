# Atendimento do ML, fase 3 (mensagens das reclamações): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (escolha do dono: inline, sem subagentes, na
> main) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o dono lê as mensagens das reclamações do Mercado Livre (do comprador e do mediador) no Rise, no Telegram e pelo
MCP, pede (se quiser) a sugestão da IA, aprova e o Rise envia a mensagem ao ML, uma única vez.

**Architecture:** as fases 1 e 2 ficam como estão e ganham o terceiro tipo, que o enum `TipoDeAtendimentoML` já tem
(`RECLAMACAO`). Uma linha de `AtendimentoML` por reclamação do tipo `mediations` (`idExterno` = id da reclamação), com o
retrato da conversa no banco, como na fase 2. Arquivo novo `src/lib/atendimentoML/reclamacoes.js` (ler, resumir, aplicar,
enviar); rascunho, filtro, sugestão, tela, bot e MCP são os MESMOS, escolhendo o caminho pelo `tipo` da linha. A tabela
`ReclamacaoML` e a rotina `reclamacoesML` (motivo, reputação, devolução, "Em mediação") não mudam: a linha do atendimento só
aponta para ela.

**Tech Stack:** o das fases 1 e 2 (Next, Prisma/Postgres, worker, provedores do Rise AI, MCP).

**Spec:** `docs/superpowers/specs/2026-11-24-atendimento-ml-design.md` (seção "Fase 3: mensagens das reclamações").

## Medido na conta real em 25/11/2026 (só GET, sem texto de comprador)

- `GET /post-purchase/v1/claims/search?status=opened` devolve cada reclamação inteira, já com `players[]` e as
  `available_actions` de cada um. Na conta: 1 aberta (`mediations`, etapa `claim`) e 346 fechadas.
- Na aberta, o vendedor (`role: respondent`) tem `send_message_to_complainant`, `refund` e `open_dispute`, todas
  `mandatory: false` e `due_date: null`. Numa fechada em `dispute` havia `return_review_fail`, `return_review_ok` e
  `recontact` (`mandatory: true`, com `due_date`); a documentação diz que `recontact` ainda não está disponível.
- `GET /post-purchase/v1/claims/{id}/messages` devolve uma **lista solta, da mais nova para a mais antiga**. Cada item:
  `sender_role` e `receiver_role` (`complainant` | `respondent` | `mediator`), `message`, `stage` (`claim` | `dispute`),
  `status` (`available`...), `date_created`, `date_read`, `attachments[]`, `message_moderation { status, reason }`,
  `repeated` e `hash` (o identificador único da mensagem; **não há `id`**).
- Mensagem do mediador chega a 1.356 caracteres. Apareceram mensagens de **1 caractere** (uma do comprador, uma do
  vendedor): o conteúdo não foi lido; a Tarefa 1 confere o que é antes de decidir como mostrar.
- Reclamação `cancel_purchase` (etapa `none`) nunca tem mensagem nem ação: fica fora.
- **Não existe limite de caracteres** nem na resposta do ML nem na documentação ("Gerenciar mensagem de uma reclamação",
  lida em 25/11/2026). Enviar: `POST /post-purchase/v1/claims/{id}/actions/send-message` com `{ receiver_role, message }`,
  resposta 201. `send_message_to_complainant` vale na etapa `claim`, `send_message_to_mediator` na `dispute`.
- A documentação pede `players.role=respondent` e `players.user_id` na busca (só `status` é "prática ruim").
- **Nunca visto:** um `POST` de mensagem, a recusa por texto longo, o corpo da notificação `post_purchase` e o
  `GET /claims/{id}/detail` (prazo e responsável pela próxima ação). Ficam para a Tarefa 1 (os GET) e para o primeiro uso
  real com a trava (o POST).

## Global Constraints

- Trava `ML_RESPONDER_RECLAMACOES` no `.env`, nasce `false`; com ela desligada tudo funciona menos o `POST`.
- `POST` com **uma tentativa**; nunca repetir sozinho. Uma mensagem por vez. Sem anexo.
- **Só mensagens.** Reembolsar, abrir mediação, aceitar ou recusar devolução e encerrar continuam no ML; o Rise mostra
  que essas ações existem e o link para a reclamação no ML, sem botão que as execute.
- O destinatário é o que a ação liberada pelo ML diz (`complainant` ou `mediator`), relido do ML na hora do envio. Sem
  ação de mensagem, a tela, o bot e o MCP dizem o motivo numa linha e não oferecem o envio.
- Limite de caracteres: o ML não informa. O Rise usa um teto próprio (`LIMITE_DA_RECLAMACAO`, 1.000) e mostra a recusa do
  ML como veio se ele recusar antes disso. Decisão desta sessão; o dono pode pedir outro número.
- A IA recebe a conversa, o motivo, a etapa, os itens do pedido, a situação do envio e a da devolução. Nunca nome
  completo, CPF, endereço, telefone, custo, margem ou fornecedor. Texto do comprador e do mediador mascarado
  (`mascararDadosPessoais`) antes da IA, do Telegram e do MCP.
- A sugestão da IA **nunca** oferece reembolso, troca, devolução ou desconto, nem admite culpa, e não leva link. Vem com o
  lembrete "O mediador do ML lê esta mensagem".
- Mesmos acessos das fases 1 e 2 (`tela.atendimento`, `acao.atendimentoML.responder`, `acao.atendimentoML.mcp`).
- Padrão visual, link clicável em tudo o que a tela cita, tabela com cabeçalho que ordena, 25 por página com o botão de 100.
- Testes sem rede (ML, Telegram e IA falsos); só escrevem `ZZ-ATD-*` / `zz-atd-*`.
- Commit só dos arquivos de cada tarefa, trailer `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`.
- Nada na VPS e nenhum gasto real de IA sem o ok do dono.

## Review Focus

1. A reclamação muda de etapa (`claim` → `dispute`) enquanto o dono escreve: o envio relê a reclamação e, se o
   destinatário liberado não é mais o que a linha guardou, recusa com "a reclamação foi para a mediação" e atualiza a
   tela (a mensagem escrita para o comprador não vai para o mediador). → Tarefa 3.
2. Mensagem nova (do comprador ou do mediador) chega enquanto o dono escreve: o `hash` da última mensagem de fora mudou,
   o envio recusa com "chegou mensagem nova". → Tarefa 3.
3. Reclamação fecha no ML (reembolso, desistência, decisão do mediador) com a linha aberta: vira FECHADA_FORA, o aviso do
   Telegram é editado e o rascunho não é enviado. → Tarefas 2 e 6.
4. Mensagem sem texto útil (vazia, de 1 caractere, só anexo ou retida pela moderação): aparece como "[sem texto]",
   "[anexo]" ou "[mensagem retida pelo ML]", a linha mostra o motivo da reclamação no lugar e a IA não inventa o
   conteúdo. → Tarefas 1 e 4.
5. Reclamação cujo pedido o Rise não tem (venda antiga, envio sem pedido casado): a linha nasce sem pedido, a tela e o
   contexto da IA funcionam sem ele e nada quebra. → Tarefas 1 e 4.

---

### Task 1: medir o que falta, banco e retrato da conversa

**Files:**
- Modify: `prisma/schema.prisma` (modelo `AtendimentoML`)
- Create: `prisma/migrations/20261125_atendimento_reclamacoes/migration.sql`
- Create: `src/lib/atendimentoML/reclamacoes.js`
- Modify: `scripts/lib/mlPerguntasFalso.js`, `scripts/teste-atendimento-ml.js`

**Interfaces:**
- Produces: `resumirReclamacao(reclamacao, mensagens, vendedorId) → { etapa, statusNoML, destinatario, outrasAcoes,
  prazoEm, mensagens: [{ id, de: "C" | "V" | "M", para, texto, em, anexos, retida, etapa }], ultimaDeForaId, ultimaDeFora,
  ultimaEhDoVendedor }`; `lerReclamacaoDoML(ml, id) → { reclamacao, mensagens } | null`; `LIMITE_DA_RECLAMACAO = 1000`;
  `textoDoBloqueioDaReclamacao(bloqueio)`.
- Colunas novas em `AtendimentoML`: `reclamacaoId String?`, `etapa String?`, `destinatario String?`, `prazoEm DateTime?`.
  `conversa`, `ultimaDoClienteId` (aqui o `hash` da última mensagem de fora), `bloqueio`, `limite` e `pedidoId` são os da
  fase 2.

- [ ] **Step 1: medir, só GET, na VPS** (script pela entrada do comando, como `scripts/ml-termos-de-venda.js`): o que é a
  mensagem de 1 caractere (código do caractere, não o texto), o `GET /claims/{id}/detail` da aberta e a busca com
  `players.role=respondent&players.user_id=`. Anotar em "Medido" e ajustar este plano se algo contrariar.
- [ ] **Step 2: testes que falham** em `teste-atendimento-ml.js`: `resumirReclamacao` com (a) etapa `claim` e
  `send_message_to_complainant` → `destinatario: "complainant"`, `outrasAcoes: ["refund", "open_dispute"]`; (b) etapa
  `dispute` e `send_message_to_mediator` → `"mediator"`; (c) sem ação de mensagem → `destinatario: null`; (d) mensagens
  em ordem cronológica com `de` pelo `sender_role`; (e) texto vazio, de 1 caractere, só anexo e moderada viram os
  rótulos do item 4 do Review Focus; (f) `ultimaDeForaId` é o `hash` da última que não é do vendedor.
- [ ] **Step 3: rodar e ver falhar** (`npm run teste:atendimento-ml`; Expected: falha por `reclamacoes.js` não existir).
- [ ] **Step 4: migration e esquema** (colunas acima; `prisma migrate diff` e tirar do SQL os índices da busca ampla).
- [ ] **Step 5: implementar** `reclamacoes.js` e as rotas de reclamação do ML falso (`claims/search`, `claims/{id}`,
  `claims/{id}/messages`).
- [ ] **Step 6: rodar e ver passar.** Commit.

### Task 2: chegada (rotina, notificação, fechamento e reabertura)

**Files:**
- Modify: `src/lib/atendimentoML/reclamacoes.js`, `src/lib/atendimentoML/perguntas.js` (`rodarAtendimentoML`),
  `src/lib/pedidos/webhooks.js`, `src/lib/pedidos/leitura.js`
- Test: `scripts/teste-atendimento-ml.js`, `scripts/teste-pedidos.js` (tópico novo)

**Interfaces:**
- Consumes: `resumirReclamacao`, `lerReclamacaoDoML`.
- Produces: `aplicarReclamacaoLida(reclamacao, mensagens, { vendedorId, agora }) → { id, criada, reabriu, fechou, status }`;
  `rodarReclamacoesML({ ml, agora, soPrefixo }) → { ok, lidas, novas, fechadas, fechadasIds } | { ok: false, erro }`;
  `aplicarNotificacaoDeReclamacao(ml, recurso, { agora })`. `rodarAtendimentoML` devolve também `reclamacoes` e soma os
  `fechadasIds`; o `ok` da rotina exige as três leituras.

Regras: a linha nasce para toda reclamação ABERTA do tipo `mediations` (com ou sem mensagem: a reclamação em si pede
resposta). Fica ABERTA enquanto a última mensagem não é do vendedor; a última do vendedor (escrita no app do ML) fecha
como FECHADA_FORA; mensagem nova de fora depois disso reabre a MESMA linha sem o rascunho velho. Reclamação fechada no ML
fecha a linha (`situacaoNoML: "closed"`). `textoDoCliente` = a última mensagem de fora, ou o motivo
(`ReclamacaoML.motivoNome`) quando ela não tem texto útil. `reclamacaoId`/`pedidoId` vêm da `ReclamacaoML` de mesmo id,
quando já existe; senão ficam nulos e a volta seguinte preenche. Uma volta = 1 busca das abertas + 1 leitura de mensagens
por reclamação `mediations` aberta + a releitura das linhas ABERTAS que saíram da busca.

- [ ] **Step 1: testes que falham:** nasce com a 1ª leitura; não duplica na 2ª; respondida fora; reabre; fecha quando a
  reclamação fecha; `cancel_purchase` não cria linha; reclamação sem `ReclamacaoML` nasce sem pedido e ganha o pedido
  depois; notificação `post_purchase` com recurso `post-purchase/v1/claims/{id}` (sem barra inicial, como na documentação)
  e com barra; erro do ML numa reclamação não derruba as outras nem as perguntas e mensagens.
- [ ] **Step 2: ver falhar. Step 3: implementar** (tópico `post_purchase` em `TOPICOS_DO_ML`; a notificação só apressa,
  a rotina de 5 min é a garantia). **Step 4: ver passar** (`teste:atendimento-ml` e `teste:pedidos`). Commit.

### Task 3: envio único

**Files:**
- Modify: `src/lib/atendimentoML/reclamacoes.js`, `src/lib/atendimentoML/enviar.js`, `src/lib/atendimentoML/banco.js`
  (`limiteDoAtendimento`, `ignorarAtendimento`)
- Test: `scripts/teste-atendimento-ml.js`

**Interfaces:**
- Produces: `mensagemDeReclamacaoLiberada(env)`, `TEXTO_DA_TRAVA_DE_RECLAMACOES = "Envio desligado na VPS
  (ML_RESPONDER_RECLAMACOES)."`, `enviarMensagemDeReclamacao({ linha, por, via, ml, env, agora }) → { ok, erro?, status? }`.
  `enviarResposta` (o ponto único da tela, do bot e do MCP) desvia para ela quando `linha.tipo === "RECLAMACAO"`.

Ordem do envio: trava do ambiente → trava da linha (`enviandoDesde`, a mesma das outras fases) → reler reclamação e
mensagens → recusar se fechou, se não há ação de mensagem, se o destinatário mudou ou se o `hash` da última de fora mudou
(itens 1 a 3 do Review Focus) → `ml.exigirEscrita` → **um** `POST .../actions/send-message` com `{ receiver_role, message }`
→ reler e gravar RESPONDIDA. Erro do ML solta a trava e guarda o texto do ML em `erroDoEnvio`. Ignorar uma reclamação só
tira da lista do Rise (não há "marcar como lida" no ML).

- [ ] **Step 1: testes que falham:** trava desligada não chama o ML; dois envios ao mesmo tempo, um POST; etapa mudou;
  mensagem nova no meio; reclamação fechada; sem ação; ML recusa (400) e a linha continua ABERTA com o erro; corpo do
  POST exato; texto acima de `LIMITE_DA_RECLAMACAO` recusado antes do ML.
- [ ] **Step 2: ver falhar. Step 3: implementar. Step 4: ver passar.** Commit.

### Task 4: contexto e sugestão da IA

**Files:**
- Modify: `src/lib/atendimentoML/contexto.js`, `src/lib/atendimentoML/prompt.js`, `src/lib/atendimentoML/sugerir.js`
- Test: `scripts/teste-atendimento-ml.js`

**Interfaces:**
- Produces: `montarContextoDeReclamacao(id) → { conversa, etapa, destinatario, motivo, afetaReputacao, pedido | null,
  envio | null, devolucao | null }`; `montarPromptDoML` escolhe `REGRAS_DE_RECLAMACAO(limite)` pelo tipo; a sugestão
  devolve `lembrete: "O mediador do ML lê esta mensagem."`.

- [ ] **Step 1: testes que falham:** o contexto não traz nome, CPF, endereço, telefone, custo nem fornecedor (procura os
  valores de teste no JSON); texto do comprador com telefone sai mascarado; o prompt traz as proibições (reembolso,
  troca, devolução, desconto, culpa) e a etapa; sem pedido, monta igual; mensagem sem texto útil entra como o rótulo; o
  provedor falso recebe o prompt de reclamação e o teto de tokens próprio.
- [ ] **Step 2: ver falhar. Step 3: implementar. Step 4: ver passar.** Commit.

### Task 5: tela (aba Reclamações e a conversa)

**Files:**
- Modify: `src/app/atendimento/page.jsx` (terceira aba, `?tipo=reclamacoes`), `src/app/atendimento/acoes.js`,
  `src/components/atendimento/TabelaDePerguntas.jsx`, `src/components/atendimento/JanelaDaPergunta.jsx` (a `Conversa`
  ganha a fala do mediador), `src/lib/atendimentoML/janela.js`, `src/app/pedidos/reclamacoes/page.jsx` (link para a
  conversa), `scripts/teste-atendimento-ml.js` (`--manter` com 2 reclamações ZZ-ATD-TR*)

Nesta tela o operador precisa ver primeiro **quem espera resposta e em que etapa**, e a ação principal é **Enviar**.
Colunas da lista: recebida, pedido (link), motivo, etapa (Reclamação | Mediação), última mensagem, situação. Na janela: a
conversa com três falas distintas (comprador, loja, mediador do ML), uma linha "Vai para: comprador | mediador do ML", o
prazo quando houver, o pedido e o link da reclamação no ML ao lado, a caixa da resposta com o contador até 1.000, **Sugerir
com IA** e o lembrete do mediador junto da sugestão. As outras ações que o ML libera (reembolsar, abrir mediação...) viram
uma linha "No Mercado Livre você também pode: ..." com o link, sem botão. Sem ação de mensagem: caixa desabilitada com o
motivo. Pedido "Em mediação" em Vendas e a linha de `/pedidos/reclamacoes` ganham o link para a conversa.

- [ ] **Step 1:** implementar seguindo as 10 regras do Padrão visual; passar por `ecc:make-interfaces-feel-better`.
- [ ] **Step 2:** conferir no navegador em largura de notebook com `npm run teste:atendimento-ml -- --manter` (lista,
  janela nas duas etapas, sem ação, trava desligada, Sair sem salvar). Screenshot. Commit.

### Task 6: Telegram

**Files:**
- Modify: `src/lib/atendimentoML/telegram.js`, `src/lib/telegram/avisos.js` (`reclamacoesAbertas`),
  `scripts/teste-atendimento-ml.js`, `scripts/teste-telegram.js`

O aviso com botões da reclamação usa o tipo `reclamacaoML` que já existe na aba Canais (a mesma caixa liga e desliga).
Para não chegar duas vezes, o aviso antigo sem botões (`reclamacoesAbertas`) deixa de sair para reclamação `mediations`
(o do atendimento cobre todas elas e leva a linha da reputação) e continua para os outros tipos. Texto: cabeçalho
"Reclamação no Mercado Livre", pedido, motivo, "afeta a reputação" quando for o caso, etapa, a última mensagem mascarada e
"Vai para: ...". Botões e a resposta escrita são os da fase 2. Mensagem nova na mesma reclamação = aviso novo; fechada =
aviso editado.

- [ ] **Step 1: testes que falham:** aviso com botões para `mediations`; o antigo não sai para ela e sai para os outros
  tipos; reabertura avisa de novo; fechada edita; texto escrito no bot vira rascunho e o Enviar passa pela trava nova.
- [ ] **Step 2: ver falhar. Step 3: implementar. Step 4: ver passar** (`teste:atendimento-ml` e `teste:telegram`). Commit.

### Task 7: MCP

**Files:**
- Modify: `src/lib/mcp/atendimentoML.js`, `scripts/teste-mcp.js`, `scripts/teste-atendimento-ml.js`

As mesmas 5 ferramentas; `tipo` aceita "reclamação". `lerAtendimentoML` devolve a conversa mascarada, a etapa, o
destinatário, o motivo, o pedido e a lista das outras ações (só como texto); `prepararRespostaML` devolve também o lembrete
do mediador; `enviarRespostaML` continua em dois passos com o código.

- [ ] **Step 1: testes que falham:** listar por tipo; ler sem dado pessoal; preparar e enviar com o código; trava
  desligada; destinatário mudou entre preparar e enviar. **Step 2: ver falhar. Step 3: implementar. Step 4: ver passar**
  (`teste:atendimento-ml` e `teste:mcp`). Commit.

### Task 8: documentação, bateria e revisão

**Files:**
- Modify: `CLAUDE.md` (linha do Atendimento ML, contagem de asserções, seção com o roteiro para ligar), a spec (o que a
  medição mudou: sem limite do ML, o `hash`, o tópico `post_purchase`, o aviso do Telegram)

- [ ] **Step 1:** ritual de fim de sessão: lint e os testes (`extracao`, `coleta`, `cadastros`, `worker` sozinho,
  `atendimento-ml`, `pedidos`, `telegram`, `mcp`).
- [ ] **Step 2:** revisão do diff inteiro pelo roteiro de `superpowers:requesting-code-review` (inline, escolha do dono),
  cada achado importante com teste que falha antes.
- [ ] **Step 3:** entrega ao dono com "O que foi feito" e "Testes que você precisa fazer", com os links. Deploy só com o
  "sobe" dele; depois, ele marca **Post Purchase** (claims e claims_actions) no aplicativo do ML e, com o ok dele,
  `ML_RESPONDER_RECLAMACOES=true` no `.env` da VPS.
