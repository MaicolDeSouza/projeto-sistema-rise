# Rise IA, fase 2: o agente da 4hobby

Data: 12/10/2026 (revisada no mesmo dia depois de uma revisão de segurança e uma de arquitetura; o que mudou está
marcado "revisão"; e **refeita no mesmo dia com o plugin de UI/UX** do dono: a seção 5a é o desenho completo das telas,
com a skill `frontend-design`, o Padrão visual do `CLAUDE.md` e a revisão `make-interfaces-feel-better`). Decidido em
conversa com o dono (Maicol) a partir de um tutorial de agente de WhatsApp (spec e 8
planos em `docs.zip`, diagrama em PDF) e do que o Rise AI já tem. Continua a spec `2026-10-11-rise-ai-design.md`
(Entrega 1, pronta e ainda sem deploy): tudo aqui é construído **dentro do Rise**, sobre a mesma camada de provedores, o
mesmo laço de ferramentas e o mesmo conhecimento. Nada do tutorial é instalado como está; dele vêm ideias (caixa de
entrada com "assumir a conversa", webhook sem duplicar, mídia tratada, documentos de ensino, resumo de memória).
Depende do projeto **Acessos** (`2026-10-12-acessos-design.md`), construído antes.

## 1. Por quê

A loja 4hobby atende clientes pelo WhatsApp. Hoje a Andrea (esposa do dono) responde tudo à mão, e as dúvidas técnicas
de peças chegam ao Maicol. O dono quer uma IA que (1) seja o primeiro atendimento no WhatsApp da loja, 24 h, com os
dados reais do Rise; (2) ajude a Andrea e a ele num chat fluido dentro do Rise, lendo imagens, áudios e arquivos;
(3) fale com ele pelo Telegram (avisos e pedidos); (4) extraia métricas da loja quando o bloco Pedidos existir; e
(5) monte o cadastro e os anúncios de produtos. E que **aprenda com o que ele ensina, guardando tudo no Rise**, para
uma troca de modelo não perder nada.

**Sucesso:** o cliente escreve no WhatsApp da loja e recebe, em segundos, uma resposta correta (preço, estoque e
link reais, ou "vou chamar alguém"); a Andrea só entra quando a IA passa a conversa ou quando quer; o Maicol recebe no
Telegram o que precisa decidir; o gasto do mês fica dentro do teto; nada do que a IA faz com efeito acontece sem um
clique humano.

## 2. Objetivos, não objetivos e anti-objetivos

**Objetivos:** A) chat novo no Rise; C) Telegram; B) WhatsApp; E) produto e anúncio automáticos; D) métricas e
relatórios. (As letras vêm da numeração da conversa; a ordem de construção está em §13.)

**Não objetivos:** chat de IA dentro da loja da LI (tudo pelo WhatsApp; o site segue com o link); vários inquilinos,
Supabase, Redis, monorepo; API oficial da Meta (tiraria o número do celular); publicação automática de anúncios (só
quando o dono liberar, mais adiante); mensagens ativas da IA para clientes (campanha, cobrança): a IA só responde a quem
escreveu; aviso ao cliente sobre uso de IA ou atualização da política de privacidade do site (decisão do dono em
12/10/2026: não haverá).

**Anti-objetivos (fracasso mesmo funcionando):** a IA inventar preço, estoque, prazo ou característica; o cliente perceber
que fala com um robô que finge ser pessoa; a Andrea perder uma conversa porque a IA "segurou"; perder o número da loja por
mau uso da Evolution; o gasto da API passar do teto sem aviso; um ensinamento ficar preso ao modelo e sumir na troca; a
IA executar uma ação com efeito (responder cliente, aprovar, gravar cadastro) por causa de um texto que leu.

## 2a. O que veio do diagrama do tutorial, e o que ficou de fora

| No diagrama | Aqui |
| --- | --- |
| Webhook da Evolution com segredo e deduplicação | webhook recebido pelo serviço `ia`, segredo em cabeçalho, idempotência pelo id da mensagem (§9) |
| Filas `incoming`/`outgoing` no Redis + BullMQ Worker | **fila `TarefaIA` no Postgres**, atendida por um serviço `ia` próprio (abaixo) |
| Lock por conversa | exclusão por conversa na própria fila (uma tarefa em andamento por conversa), sem trava de transação longa |
| Rate limiting por instância | limite por contato (entrada e saída), limite de contatos novos por hora, teto por contato e por mês |
| Memory & summarization | resumo da conversa longa antes de mandar ao modelo |
| RAG (pgvector) + `embed-document` | documentos de ensino com trechos e vetores, sem pgvector (§5) |
| Cost tracking | Consumo da Entrega 1 + tabela `GastoIA` para tudo que custa fora do chat |
| Cron: media cleanup, retention purge | limpeza sob pedido do dono (§3, dados pessoais) |
| Agent Sandbox | o próprio chat do Rise |
| Versionamento de agentes | prompt editável na tela com versão anterior guardada e quem mudou |

**Fila no Postgres, não Redis (decisão do dono, Opção 1).** O serviço `ia` atende N tarefas ao mesmo tempo (padrão 10,
configurável), uma por conversa; mais de uma instância do serviço pode apontar para o mesmo banco (`FOR UPDATE SKIP
LOCKED`). A fila fica atrás de um módulo único (`enfileirar`, `pegar`, `concluir`, `falhar`) **com o que a fila da coleta
já tem e custou caro:** `sinalEm` e `workerId` (recolher tarefas largadas), tentativas com esgotamento, `agendadaPara`,
chave de deduplicação com índice único parcial (uma tarefa aberta por conversa), e o estado `enviando` antes de qualquer
chamada externa (reinício no meio nunca reenvia sozinho; a tarefa recuperada em `enviando` fica "incerta" para o humano).
O construtor decide, com teste equivalente, entre reaproveitar a tabela `Job` (tipo `ia.*`) e uma `TarefaIA` própria.
**Migração para Redis/BullMQ** dispara quando, medido no Consumo: mais de 1.000 tarefas por minuto; tarefa esperando mais
de 5 s com o serviço ocioso; ou necessidade de atender de outra máquina com latência que o Postgres não atenda.

**Serviço `ia` separado do worker da coleta (revisão).** O worker de hoje tem trava única (um só por vez), memória
dividida com 5 varreduras e um erro fatal que reinicia tudo gastando tentativa das varreduras. A IA roda num serviço
próprio no compose (`ia`: mesma imagem, `node scripts/ia-processo.js`), com trava, `mem_limit`, reinício e healthcheck
próprios. Ele atende a `TarefaIA`, o Telegram (long polling) e o webhook da Evolution. **Só na VPS** (`RISE_PRODUCAO`): o
worker do PC (`worker:pc`, `COLETA_FONTES`) nunca atende a fila do WhatsApp nem o Telegram, com teste em `teste:fila-pc`.
É um contêiner a mais, aprovado pelo dono em 12/10/2026.

**Ficou de fora de propósito:** Supabase, multi-tenant com RLS, Resend, License API, Langfuse, Google/Groq, Vercel AI SDK.

**Modelos de partida (decisão do dono):** GPT-4.1 mini como principal, `text-embedding-3-small` (1536 dimensões) para
os vetores, Anthropic `claude-haiku-5-5` como reserva ("Claude 3.5" do diagrama foi aposentado pela Anthropic em 2025).
O adaptador OpenAI parametriza por modelo o que muda entre famílias (`max_tokens` × `max_completion_tokens`,
`temperature`), e a busca na internet da OpenAI vai pela API Responses, não pelo chat/completions (revisão). O construtor
confere na página da OpenAI, na hora, os modelos e os preços, e **nenhum modelo sem preço cadastrado pode ser Padrão ou
Reserva** (o teto não somaria).

## 3. Restrições

- **Teto de gasto: R$ 100 por mês, em dois orçamentos** (revisão): R$ 70 para o canal dos clientes (WhatsApp) e R$ 30 para
  o uso interno (chat, Telegram, anúncios), os dois editáveis na tela e somando transcrição, embeddings e busca. Aviso em
  80%; em 100% do orçamento do cliente, o WhatsApp responde um texto fixo ("recebemos sua mensagem, alguém retorna em
  breve") e a conversa vira "aguardando retorno"; em 100% do interno, o chat mostra o erro e só o administrador aumenta.
  O custo é **reservado antes de cada chamada** ao provedor (contador atômico no Postgres) e conferido a cada rodada do
  laço, não só no começo. Cotação pelo PTAX do dia (a das Ferramentas), com a fixa como reserva se o BC não responder.
- **Nunca inventar:** preço, estoque, pedido e prazo só do Rise (ferramentas). Dado técnico fora do catálogo e do
  conhecimento: só com o interruptor **"Pesquisar na internet"** ligado (nasce desligado), citando a fonte. **Só no chat
  interno (Rise e Telegram); no canal do cliente a internet nunca entra** (decisão do dono em 12/10/2026): o cliente
  nunca recebe link de terceiro, e a IA do WhatsApp não lê página alguma.
- **Ensino guardado no Rise** (banco e `dados/`), nunca só no modelo.
- **Dados pessoais (decisões do dono em 12/10/2026):** o texto das mensagens fica guardado **como chegou** (a Andrea
  precisa ler o CPF ou e-mail que o cliente mandou) e é **mascarado só ao ir para o modelo** (histórico, contexto e
  sugestões incluídos; a Entrega 1 mascarava ao gravar, e o chat do Rise continua assim). Tudo fica guardado, sem prazo
  automático; o administrador ganha "apagar mensagens anteriores a <data>" e "apagar este contato e tudo dele" (banco,
  `dados/` e a Evolution). Foto de perfil do contato não é guardada. Áudio e foto de cliente vão sem máscara ao provedor
  de transcrição/visão (EUA); o dono decidiu não avisar o cliente nem atualizar a política do site: o risco é dele.
- **Evolution API é conexão não oficial** (risco de bloqueio do número aceito): a IA só responde a quem escreveu, com
  atraso humano, nunca em massa, e avisa o dono se a conexão cair.
- **Pré-requisitos de segurança** (revisão): **segundo fator** do Tinyauth para o Maicol e a Andrea antes da Entrega C
  (o Telegram vira um segundo portão de administrador); **dump do backup criptografado** (pendência 3 do CLAUDE.md) antes
  da Entrega B (ele passa a levar conversas de clientes); a Entrega 1 no ar antes da Entrega A.
- **VPS:** 2 vCPU, 8 GB (6,2 GB livres), 71 GB livres. Toda mudança na VPS só com o "ok" do dono; deploy só com o "sobe".
- **Stack do Rise:** Next.js 16 (JavaScript), Prisma 7 + PostgreSQL 17, sem Redis. Convenções do `CLAUDE.md`.

## 4. Quem usa e o que vê

| Pessoa | Onde | Pode |
| --- | --- | --- |
| Cliente | WhatsApp da loja | conversar; nunca vê quem responde por trás além da assinatura |
| Andrea (atendente) | WhatsApp no celular, chat e caixa de entrada do Rise | o que a função dela (Acessos) liberar |
| Maicol (administrador) | Rise, Telegram | tudo |

### 4a. Acessos: três camadas, uma regra só

**Princípio:** a IA nunca sabe mais do que quem está falando com ela tem direito de saber. A autorização é do
servidor, por ferramenta e por dado, nunca do prompt.

**Cliente (WhatsApp)** é um perfil **fixo em código** (revisão), nunca uma linha editável na matriz de Acessos (um clique
errado ali mostraria custo a todos os clientes). Ele tem **lista permitida** (não lista de bloqueio) de ferramentas e de
campos: nome, preço de venda, estoque como "disponível / poucas unidades / em falta" (nunca a quantidade), link da loja,
ficha técnica, documentos e notas marcados **públicos**, horário e políticas da loja. As ferramentas do canal são
próprias (`buscarProdutosPublico` e irmãs), com `select` explícito e filtro "ativo e publicado na loja" **na consulta**,
inclusive em similares, comparar, peças de kit e trechos injetados. **Nunca:** custo, margem, fornecedor, localização,
quantidade, faturamento, pedidos de outros clientes, conversas internas (notas da conversa, motivo da passagem, comentário
do 👎), nada do Bling. Métrica, financeiro e anúncio nem existem para este perfil. O código **não tem perfil padrão**:
perfil ausente ou desconhecido é erro. Um teste de guarda roda toda ferramenta em todo perfil e falha se aparecer `custo`,
`localizacao`, `fornecedores`, `urlRise`, `blingSaldo` ou estoque numérico onde não pode.

**Atendente e administrador:** permissões do projeto Acessos (funções, usuários, dados sensíveis transversais). A IA só
oferece ao modelo as ferramentas e os campos que a pessoa vê nas telas: **se vê custo na tela, vê custo no chat**
(decisão do dono). Sem a permissão, a ferramenta não é oferecida e a IA diz "isso eu não posso mostrar para o seu
acesso" (a ferramenta devolve um marcador de campo restrito, para o modelo saber o que dizer).

**Conhecimento com visibilidade:** nota e documento são **públicos** (a IA usa com cliente) ou **internos** (atendente e
administrador). Padrão interno; o administrador marca público. Trechos herdam a visibilidade do documento, e a busca e a
injeção automática filtram por ela.

## 5. Entrega A: o chat novo no Rise

- **Conversa fluida, como o chat do Claude** (desenho em §5a). Saem o quadro "Resposta pronta para o cliente", os cartões de produto e o
  "Para a equipe". Texto corrido com formatação leve, **desenhada com um renderizador seguro** (revisão): sem HTML cru,
  sem imagem vinda do texto do modelo, link só `http/https` com domínio à vista e `rel="noopener noreferrer"`, links de
  produto montados pelo código a partir do SKU. O botão **Copiar** fica em cada resposta, e "escreva a resposta para o
  cliente" produz texto puro para colar.
- **Botão Parar** (revisão): um pedido explícito (`POST /api/rise-ai/parar`, com o id da conversa), não o fechamento da
  conexão (que também acontece ao recarregar a página). Aborta o `AbortController` do laço com um motivo próprio
  (`interrompida`, distinto de `tempo`, para **não** acionar a reserva). O texto parcial é acumulado e gravado marcado
  "interrompida", com o custo estimado por caracteres (marcado `estimado`) quando o provedor não devolveu o uso.
- **Anexos no campo de texto:** colar, arrastar ou o botão de upload. Tipos: imagem (PNG, JPG, WebP), PDF, Excel (XLSX,
  CSV; **XLS antigo fica fora**: a biblioteca do projeto não o lê e a alternativa é proibida pelo CLAUDE.md), Word (DOCX),
  áudio (OGG/Opus, MP3, M4A, WAV), texto (TXT, MD). Até 5 por mensagem e 20 MB cada, por rota `multipart` própria com
  `Origin` conferido. A IA lê o anexo junto com o texto.
- **Interruptor "Pesquisar na internet"** nas Configurações (desligado de fábrica) e no Telegram. Ligado, a IA ganha a
  ferramenta de busca do provedor, só para dado técnico, com a fonte citada; nunca `web_fetch`. Só no chat interno, nunca no WhatsApp.
- **Teto** (§3), tabela `GastoIA` (transcrição, embeddings, busca; com duração do áudio e contagem de buscas) já nesta
  entrega, e os preços dos modelos GPT na tabela de custo.

**Como o anexo é processado** (vale para o WhatsApp; revisão endureceu):
- Arquivo em `dados/rise-ai/anexos/<mensagemId>/<nome gerado>`; linha `AnexoIA` (tipo pelos **bytes**, nome original
  tratado como texto de terceiro, tamanho, caminho, texto extraído ou transcrição, estado `PENDENTE / LIDO / FALHOU` com
  motivo). Servido por **rota própria com login e permissão**, sempre `Content-Disposition: attachment` e `nosniff`,
  nunca pelo caminho público `/api/arquivos`.
- A extração roda **no serviço `ia`, num processo filho** com limite de memória, tempo e tamanho (páginas, linhas,
  caracteres). ZIP (XLSX, DOCX) conferido pelo diretório central antes de abrir (tamanho descompactado e razão); arquivo
  com macro recusado; DOCX só texto cru, sem seguir referência externa; PDF com `isEvalSupported: false`; PDF escaneado
  (sem texto) vira imagens das páginas para o modelo; imagem **reencodada** pelo `sharp` (tira EXIF/GPS e polyglot,
  lado maior ~1568 px) com o teto de pixels lido do cabeçalho.
- Imagem vai ao modelo como imagem: o contrato neutro dos provedores ganha **partes de conteúdo** (texto + imagem), nos
  dois adaptadores e no corte de histórico.
- Áudio: transcrição pela API da OpenAI; duração máxima; custo por minuto em `GastoIA`.
- Anexo que falha: o modelo é informado ("anexo X não pôde ser lido: motivo") e a IA pede o conteúdo em texto ou foto.
- **Lista de peças** (Excel, Word, foto ou texto): ferramenta de lote `buscarVariosProdutos` (até 50 itens numa chamada).

**Ensino por documentos**
- Documentos (manual, política da loja, transcrição de vídeo como texto ou `.txt`, outro), ligados a produtos, na aba
  Conhecimento da Revisão, com status e visibilidade como as notas; só administrador.
- `DocumentoIA` + `TrechoIA` (texto, ordem, vetor guardado como Float32 em `bytea`, ~6 KB por trecho). Busca por trigramas
  **e** por vetor, com comparação direta e **cache em memória** da matriz (invalidado por versão) no serviço `ia` e no
  `app`: aguenta dezenas de milhares de trechos. **Sem pgvector, e não é "trocar a imagem"**: a cópia do PC restaura o
  dump no Postgres nativo do Windows, que não tem a extensão. Fica assim.

## 5a. Telas do agente (UI/UX, 12/10/2026)

O plano de desenho é o da spec de Acessos (§5.1 dela): as mesmas cores, tipo, leiaute e piso de qualidade. Aqui a
ousadia vai para **a lista da caixa de entrada** (quem espera uma pessoa, e há quanto tempo); o chat fica quieto, texto
em vez de caixas. Cada tela traz a linha-guia, o esboço, os estados e os textos; o construtor mostra ao dono um esboço
em HTML antes de cada entrega.

### 5a.1 O chat fluido (`/rise-ai`, `/rise-ai/<id>`; Entrega A)

Linha-guia: a Andrea vê primeiro a última resposta; a ação principal é Enviar, que vira Parar enquanto a IA responde.

```
Arduino para LED                      Internet ligada 🌐   Respondendo com: GPT-4.1 mini
──────────────────────────────────────────────────────────────────────────────────
                                              ┌ Qual Arduino para acender um LED? ┐
                                              └ 📎 lista.xlsx · 12 KB             ┘
O Arduino Uno SMD (100234) resolve: R$ 89,90, com estoque. O Nano está em falta hoje.
Link: 4hobby.com.br/arduino-uno-smd
Copiar · 👍 · 👎 · Propor correção     GPT-4.1 mini · 3,2 s · R$ 0,004 · 📚 Arduino iniciantes
──────────────────────────────────────────────────────────────────────────────────
📎  ┌ foto.jpg · 1,1 MB ×  ┐
    │ Pergunte ou cole a mensagem do cliente…                              │ [Enviar]
```

- **Resposta da IA = texto corrido**, sem caixa: negrito, listas e links (domínio à vista) pelo renderizador seguro de
  §5; links de produto montados pelo código a partir do SKU. Somem o quadro "Resposta pronta para o cliente", os
  cartões de produto e o "Para a equipe". Antes do primeiro token, **uma linha de estado** no lugar da resposta
  ("consultando produtos…", pelos eventos de ferramenta), trocada pelo texto quando ele começa; a resposta cresce no
  lugar, sem pular (a altura da barra de baixo é reservada desde o início).
- **Barra de cada resposta** (`text-xs text-suave`, botões de ícone com 40 px de área): Copiar (texto puro), 👍, 👎
  (abre a caixa de comentário na própria linha, como hoje), "Propor correção" só para quem pode ensinar (Acessos). À
  direita: `SeloDoModelo`, tempo, custo em `tabular-nums` (custo estimado vem com "~" e o `title` "estimado pelos
  caracteres") e o chip "📚 <assunto>" só quando usou conhecimento. Resposta da reserva mantém a linha `amber` de hoje
  acima do texto; resposta **interrompida** ganha o `Badge` neutro "interrompida" na barra.
- **Anexos na mensagem** da pessoa: chips abaixo do balão (ícone pelo tipo, nome, tamanho); estado `PENDENTE` =
  spinner, `FALHOU` = `Badge` erro com o motivo no `title`; o clique baixa pela rota de anexos com login.
- **Campo de texto:** cresce de 1 a 6 linhas; **📎** à esquerda (`title`: "Anexar imagem, PDF, Excel, Word, áudio ou
  texto · até 5 por mensagem, 20 MB cada"); os arquivos escolhidos, colados ou arrastados viram chips **acima** do
  texto, com ×; arrastar sobre o campo põe a borda tracejada em `acento`. Arquivo acima do limite ou 6.º arquivo: o chip
  fica vermelho com o motivo ("acima de 20 MB", "limite de 5") e Enviar desabilita com o motivo no `title` (regra 8). A
  contagem "4 de 5" só aparece a partir do 4.º (regra 4). **Enviar e Parar ocupam o mesmo lugar e o mesmo tamanho**
  (sem salto de leiaute): Parar é borda neutra com o ícone de quadrado (não vermelho: não é erro) e `Esc` também para.
  Enter envia, Shift+Enter quebra (como hoje).
- **Cabeçalho:** título e controles de hoje; "Respondendo com: <modelo>"; o chip **"Internet ligada"** (globo) só quando
  está ligada (regra 4; `title`: "a IA pode pesquisar dado técnico fora do catálogo; desligue em Configurações › Canais").
  Orçamento interno em 80 %: chip `amber` "Orçamento interno 83 %" (dinheiro pode ter cor); em 100 %: o campo de texto
  desabilita com `title` "Orçamento interno do mês esgotado; só o administrador aumenta" e uma linha vermelha acima dele.
- **Estado vazio** (duas linhas, como hoje): "Pergunte ou cole a mensagem do cliente." / "A resposta vem com preço,
  estoque e link reais do catálogo." Erro de conexão: a caixa vermelha de hoje com "Tentar de novo". Anexo que falhou é
  dito pela própria IA no texto (§5), além do chip.
- **Trilho esquerdo:** a lista de conversas de hoje ganha, no topo, o par **Minhas conversas · Caixa de entrada (3)**. O
  par aparece para quem tem a caixa de entrada em Acessos; o número (quantas esperam uma pessoa) só quando é maior que
  zero.

### 5a.2 A caixa de entrada (`/rise-ai/caixa-de-entrada`; Entrega B)

Linha-guia: a Andrea vê primeiro quem está esperando uma pessoa e há quanto tempo; a ação principal é Assumir.

```
Minhas conversas · [Caixa de entrada 3]   │ Marcos · (54) 99999-0001      Com a IA     [Assumir] [⋯]
Esperando pessoa 3 · Com a IA 12 · Comigo 2 │───────────────────────────────────────────────────────
🔍 nome ou telefone                        │ ┌ Oi, tem o Nano? ┐ 10:31
▲ Marcos        Oi, tem o Nano?     32 min │   Hoje o Nano está em falta; o Uno SMD… 10:31  Assistente 4hobby
● Julia  A      Obrigada!            2 min │ ┌ e o Uno? ┐ 10:40
○ Pedro         Qual o frete…         1 h  │ ▫ nota interna · Andrea 10:42: cliente de Caxias, já comprou 2×
                                           │ [Assuma a conversa para responder            ] [📝] [Enviar]
```

- **Lista (o trilho do Rise AI, na segunda posição do par):** uma linha por conversa: ponto da dona (`acento` = IA,
  `emerald` com a inicial = pessoa, `amber` = aguardando retorno, `slate` = encerrada), nome ou telefone, trecho da
  última mensagem em uma linha, e **o tempo desde a última mensagem do cliente** em `tabular-nums`, que fica `amber`
  quando passa de 30 min sem resposta humana (o mesmo gatilho do aviso do Telegram). Não lida = negrito. **"Esperando
  pessoa"** = conversa com pessoa ou aguardando retorno cuja última mensagem é do cliente. **Ordem:** esperando pessoa
  (a mais antiga primeiro), depois com a IA, depois as minhas, depois o resto. Filtros como chips com contagem, só os
  que têm valor > 0 (regra 4): Esperando pessoa · Com a IA · Comigo · Aguardando retorno · Encerradas. Busca por nome e
  telefone. A rolagem só acrescenta embaixo; chegou mensagem com a lista rolada, um selo "novas ↓" leva até ela, sem
  pular.
- **Cabeçalho da conversa:** nome, telefone, etiquetas (`Badge`, só se houver), e o **estado** como chip: "Com a IA"
  (`acento`), "Com Andrea desde 10:32" (`emerald`), "Aguardando retorno" (`amber`), "Encerrada" (neutro). **A ação
  principal depende do estado:** não é minha → **Assumir**; é minha → **Devolver à IA**. No "⋯": "Passar para…" (os
  atendentes ativos) e, por último, "Encerrar" (popup com o nome e a data). Tudo conferido pelas permissões de Acessos,
  não pela dona (§9).
- **Mensagens:** cliente à esquerda (`bg-fundo`), IA e pessoa à direita (`acento/10`, o balão da pessoa no chat de hoje)
  com a linha pequena da assinatura ("Assistente 4hobby" / "Andrea") e a hora; anexos como chips (áudio com a
  transcrição embaixo; imagem como miniatura com contorno neutro, abre pela rota de anexos); **nota interna** como linha
  `amber` clara com "nota interna · Andrea 10:42", visível só para a equipe (nunca vai ao modelo nem ao cliente); 👎 só
  nas mensagens da IA.
- **Campo de resposta:** habilitado só quando a conversa é minha; senão, desabilitado com o texto "Assuma a conversa
  para responder" no próprio campo (regra 8). **📝** alterna o campo para "nota interna" (borda `amber`, botão "Guardar
  nota"); a resposta sai assinada com o primeiro nome. Enter envia, Shift+Enter quebra.
- **Só erro real tem cor:** WhatsApp desconectado = uma linha vermelha no topo da lista ("WhatsApp desconectado desde
  09:12 · Reconectar", link para Configurações › Canais), e os campos de resposta desabilitam com o motivo. "Loja
  fechada hoje" = chip `amber` no topo da lista, com o interruptor para quem administra.
- **Título da aba** do navegador: "(3) Caixa de entrada · Rise" enquanto alguém espera uma pessoa; a lista atualiza por
  consulta de diferenças a cada 5 s, pausada com a aba oculta (§9).
- **Celular:** lista em tela cheia; a conversa abre por cima com a seta de voltar.

### 5a.3 Revisão › Conhecimento com documentos (Entrega A2)

Linha-guia: o dono vê primeiro o que a IA já sabe; a ação principal é adicionar.

- A aba Conhecimento ganha o par **Notas · Documentos** (uma lista de um tipo por vez, regra 5); Notas continua como
  hoje. **Documentos:** tipo (ícone), nome, produtos (quantos), visibilidade (`Badge` "público" `info` / "interno"
  neutro), status, trechos (quantos), atualizado em. "Adicionar documento" abre uma `Janela`: tipo (manual, política da
  loja, transcrição, outro), arquivo (PDF, DOCX, TXT, MD) **ou** texto colado, produtos (busca), visibilidade (nasce
  interno), Salvar. A linha abre a mesma janela com "Reprocessar trechos" e, por último, "Excluir" (popup com o nome).
- Estado vazio de Documentos: `EmptyState` "Nenhum documento ainda." com o botão "Adicionar documento".

### 5a.4 O formulário do produto com a revisão da IA (Entrega E)

Linha-guia: o dono vê primeiro o que a IA propôs mudar; a ação principal é Marcar Conferido e aplicar.

```
← Arduino Uno SMD (100234)                                  ✓ Conferido   [Salvar]
▲ Revisão da IA pendente · 7 campos, 3 fotos · pedida por Maicol às 14:10   [Ver diferenças] [Recusar]
[Características] [Composição] [Descrição] …      Título base ● [Arduino Uno R3 SMD…]
```

- **Uma faixa `amber`** logo abaixo do `PageHeader` (é pendência, não erro), com a contagem, quem pediu e quando, e dois
  botões: **Ver diferenças** (principal) e Recusar (popup "Descartar a revisão e os arquivos temporários?"). Cada campo
  com valor proposto ganha um **ponto `amber` ao lado do rótulo** (`title`: "proposto: <valor>"); o formulário continua
  editável e mostra o que está gravado.
- **Ver diferenças** abre uma `Janela` larga: tabela Campo · Atual · Proposto, uma caixa de marcação por linha, todas
  marcadas, **exceto NCM, GTIN e origem fiscal**, que nascem desmarcadas com o `Badge` "fiscal" (§6: aprovação explícita);
  fotos como miniaturas com contorno neutro e caixa de marcação; listas (documentos, referências) como linhas "N itens".
  Rodapé: Cancelar e **Marcar Conferido e aplicar (N)**. Aplicar = a ação `alternarConferido` de hoje mais a gravação
  das linhas marcadas; o que ficou desmarcado é descartado. Conflito de versão (`atualizadoEm`): a janela mostra o erro
  "O produto mudou desde a proposta. Recarregue." e nada é gravado.
- **Lista de Produtos:** a linha com revisão pendente ganha o selo `amber` "revisão da IA" (só quando existe, regra 4) e um
  filtro "Com revisão da IA".
- **No chat e no Telegram**, o pedido ("crie o produto X", "complete o 100101") termina com uma linha e um link: "Revisão
  pronta: 7 campos e 3 fotos. Abrir o produto 100234." O chat nunca mostra o formulário.

### 5a.5 Configurações do Rise IA em abas (Entregas A, C e B)

Linha-guia: o dono vê primeiro qual modelo responde; a ação principal é Salvar (uma por aba).

- A tela de hoje, uma página longa, vira **quatro abas** (regra 5), cada uma um formulário com o seu Salvar no fim:
  - **Modelos:** o que existe hoje (Padrão, Reserva, tempos e limites, cartões dos provedores com chave e Testar
    conexão).
  - **Orçamentos:** dois cartões, **Clientes (WhatsApp)** e **Interno (chat, Telegram, anúncios)**, cada um com o valor
    em reais editável, o **gasto do mês como barra** (`amber` a partir de 80 %, vermelha em 100 %) e "R$ 48,10 de R$ 70,00"
    em `tabular-nums`; uma linha pequena com a cotação PTAX do dia usada. No cartão Clientes, os três **limites de
    contato** de §9 (mensagens por hora, contatos novos por hora, R$ por contato no mês) como campos curtos numa linha,
    com a bolha "i" dizendo o que acontece ao bater (vira suspeito, aviso no Telegram).
  - **Canais:** **Internet**, um interruptor só ("Pesquisar na internet no chat interno"; o WhatsApp nunca, §3, então
    não há segundo interruptor); **Telegram**, um cartão no desenho de `CartaoConector`: token (campo só de escrita, em
    `FormData`), estado (vinculado a quem), interruptor "Bot ligado" e a lista dos **avisos** como interruptores (os oito
    de §7); **WhatsApp**, outro cartão: estado da instância (`Badge` Conectado / Desconectado com a hora), **Mostrar QR**
    (buscado na hora, só administrador, some em 60 s), "Desconectar", e o interruptor **"Loja fechada hoje"**.
  - **Atendimento:** horário da loja (dias e dois turnos), tempos (silêncio de 8 s, 30 min sem resposta, 48 h / 7 dias),
    e os **dois prompts** (chat interno e WhatsApp), cada um com "Restaurar padrão" e, recolhida, a **versão anterior**
    ("alterado por Maicol em 12/10 às 14:10", com o texto).
- Troca de aba com alteração não salva pede confirmação; as abas ficam montadas e só escondidas (como a Revisão).

### 5a.6 Consumo com os orçamentos (Entrega A)

No topo da tela de Consumo, as duas barras de orçamento da aba Orçamentos (mesmo componente); a tabela por dia ganha a
coluna **Outros** (transcrição, embeddings e busca, em R$, com o detalhe no `title`) e o filtro por canal (Rise ·
WhatsApp · Telegram). Nada mais muda.

### 5a.7 O Telegram como interface (Entregas C1 e C2)

Linha-guia: o dono lê em três linhas o que aconteceu e decide com um botão.

- **Aviso** = até quatro linhas em texto puro (sem `parse_mode`, §7): o que aconteceu, quem, quando, e o trecho do
  cliente quando houver; uma linha de botões com **até três**, sempre verbo e objeto: "Assumir", "Abrir no Rise",
  "Enviar ao cliente", "Cancelar", "Aprovar", "Rejeitar", "Bloquear", "Liberar".
- **Proposta de ação** mostra o efeito exato entre aspas (o texto que sairia para o cliente) e dois botões; só uma
  proposta aberta por conversa; botão vencido responde "Esse pedido venceu. Peça de novo." e nada acontece.
- **Resumo do dia (20h)**, cinco linhas: conversas; passadas a pessoa; aguardando retorno; "custo R$ 12,40 de R$ 70,00
  (clientes) · R$ 3,10 de R$ 30,00 (interno)"; 👎 esperando aprovação. Sem botão.
- Pane (serviço `ia`, worker, WhatsApp): uma linha com o que caiu e desde quando; o botão "Abrir no Rise" leva a
  Configurações › Canais.

### 5a.8 Acabamento (revisão `make-interfaces-feel-better`)

| Ponto | Como fica |
| --- | --- |
| Números que mudam | `tabular-nums` em tempo, custo, contagens dos chips, "N de 5", barras de orçamento e o relógio "32 min" |
| Alvo de clique | 👍, 👎, Copiar, ×, 📎, 📝 e Parar com 40 px de área; na lista da caixa, a linha inteira é o alvo |
| Sem salto de leiaute | Enviar/Parar no mesmo lugar; a barra da resposta tem altura reservada; a lista só acrescenta embaixo |
| Miniaturas | contorno neutro de 1 px em `rgba(0,0,0,.1)`, nunca na cor da marca; nada de EXIF, já reencodado (§5) |
| Quebra de texto | `text-wrap: pretty` no texto das mensagens e nos trechos da lista; `balance` nos títulos |
| Transições | chips entram em 150 ms (opacidade + 4 px) e saem em 100 ms; estados de botão só `background-color, border-color, opacity` |
| Movimento | o spinner de "pensando" e o cursor do texto em fluxo param com `prefers-reduced-motion` |
| Foco e teclado | Enter/Shift+Enter, `Esc` para a resposta, anel `ring-acento` em todo botão; a lista da caixa anda com as setas |
| Largura | 1366 px: o trilho do Rise AI na largura de hoje, texto da conversa com no máximo 80 caracteres por linha; celular em uma coluna |

## 6. Entrega E: produto e anúncio automáticos (decisão do dono em 12/10/2026)

- **Produto primeiro.** Por pedido no chat ou no Telegram ("crie o produto X a partir de..." ou "complete o 100101"), a
  IA monta o cadastro: títulos, descrição no padrão da loja, medidas e NCM das referências, documentos ligados, fotos
  importadas. **Tudo fica numa área temporária** até a aprovação: os arquivos no lote temporário do cadastro
  (`dados/temporarios/<lote>`, o mesmo mecanismo do formulário de produto) e os campos numa **revisão pendente** do
  produto (`RevisaoDeProdutoIA`: o produto, os valores propostos campo a campo, o lote, quem pediu, quando). O cadastro ao
  vivo **não muda**.
- **O dono revisa no formulário do produto**, que mostra a revisão pendente lado a lado com o que está gravado, e aprova
  marcando **Conferido ("CONF")**. Só então os valores entram no cadastro, os arquivos saem do temporário para a pasta do
  produto, a revisão é encerrada e o lote apagado. Recusar descarta a revisão e o lote. Isso vale para produto novo e para
  edição de produto existente; em produto já Conferido, aprovar reconfirma.
- **Depois do CONF**, e só então, a IA pode gerar os **rascunhos do Mercado Livre e da Loja Integrada** (funções do editor:
  categoria, título, ficha, preço por margem, descrição; SEO e categorias). **Publicar continua sendo clique do dono**, sob
  as travas de hoje; publicação pela IA é etapa futura.
- Limites: a IA nunca grava NCM, GTIN e origem fiscal sem aprovação explícita (vêm na revisão, marcados); o texto gerado
  passa pelos geradores existentes (`montarDescricao`, `textoPuro`) e nunca leva URL, telefone nem nome de outra loja (as
  referências de mercado são texto de concorrente, tratado como terceiro); cópia dos valores anteriores para desfazer;
  conferência de versão (`atualizadoEm`) ao aplicar, contra um formulário aberto ao mesmo tempo.
- Fotos: a IA importa as das referências (como o Clonar), não gera nem melhora (Nano Banana e validação continuam
  manuais; a foto só vira validada no CONF).

## 7. Entrega C: Telegram (só o Maicol)

- Bot do Telegram (token cifrado em `Conexao`, serviço `TELEGRAM`), lido pelo serviço `ia` por long polling: sem porta
  pública nem mudança no Caddy. **Vínculo do chat por código de uso único** gerado no Rise (`/vincular CÓDIGO`), só
  chat privado; a cada update o serviço relê o usuário (`ativo`, permissões); outro chat é ignorado e registrado. Token
  mascarado em todo log; mensagens sem `parse_mode` (texto de cliente nunca vira link no chat do dono); idempotência por
  `update_id` gravada **antes** do efeito; interruptor "desligar o bot agora" nas Configurações.
- **Avisos** (cada um com interruptor): resumo do dia às 20h (conversas, custo, 👎 esperando aprovação); conversa passada
  a humano; **cliente sem resposta humana há 30 min** (com botão "Assumir"); "aguardando retorno" acumulado, num resumo
  na abertura da loja (não um aviso por mensagem noturna); produto que zerou; erro no serviço `ia`, no worker ou na
  conexão do WhatsApp; varredura pelo PC esperando; teto em 80% e 100%; **contato suspeito** (bateu num limite, §9; com os
  botões Bloquear e Liberar). Avisos de pane também vão ao healthchecks.io: o Telegram sozinho não avisa que o Telegram
  caiu.
- **Pedidos** em linguagem natural: perguntas (produtos, estoque, métricas quando houver), com as permissões do usuário.
- **Ações com efeito só por botão** (revisão, regra da spec de 11/10 §5.12): responder cliente, passar/devolver conversa,
  aprovar ou rejeitar sugestão, ligar/desligar internet, aprovar revisão de produto. O modelo **propõe**; o código guarda a
  proposta com um nonce e prazo curto, mostra o efeito exato (o texto que sai para o cliente, por exemplo) e o dono confirma
  num **botão inline** criado pelo código, nunca por "sim" interpretado. Voltas que leem conteúdo de terceiro (mensagem
  de cliente, anexo, documento, página) rodam **sem ferramentas de efeito**. "Responder" é endereçado pela resposta ao
  aviso do bot (`reply_to_message_id` mapeado à conversa), nunca por texto livre. Pré-visualização de link desligada.
- O perfil do bot é **menor** que o de administrador: sem "mostra tudo" em massa e sem aprovar conhecimento público; para
  o resto, a tela.
- **Nada que escreva no Bling, no Mercado Livre ou na Loja Integrada.**

## 8. Entrega D: métricas e relatórios

- **Agora:** produtos sem estoque; produtos com "!" (divergência com o Bling e kit com peça alterada), com os motivos;
  como ferramentas (respeitando permissões) e como relatório no Telegram.
- **Quando o bloco Pedidos/Financeiro existir:** faturamento, mais vendidos, pedidos do dia, contas a pagar e a receber.
  Nada lê o Bling direto (decisão do dono). Consulta de pedido pelo cliente, quando existir, amarrada ao JID da conversa,
  nunca a número de pedido ou CPF digitado por ele.

## 9. Entrega B: WhatsApp pela Evolution API

**Infraestrutura (na VPS, com ok do dono; revisão endureceu)**
- Serviço `evolution` no compose, imagem **fixada por digest**, com **usuário e banco próprios** no Postgres (papel sem
  superusuário, `CONNECT` só no banco `evolution`, `REVOKE CONNECT ON DATABASE sistema_rise FROM PUBLIC`; o banco é
  criado à mão, porque o init só roda com volume vazio), **arquivo de ambiente próprio** (nunca o `.env` do Rise), sem
  Redis, integrações embutidas (Chatwoot, Typebot, OpenAI, S3, websocket, RabbitMQ) e tela de administração desligadas,
  gravação de histórico e sincronização completa desligadas, `LOG_LEVEL` sem conteúdo de mensagem, `mem_limit` próprio.
- **Redes Docker separadas** (`borda`: caddy, app, auth; `dados`: app, ia, worker, db; `whatsapp`: evolution e ia). O
  `app` nunca fica na rede da Evolution. O Caddy passa a enviar um **segredo de borda** num cabeçalho depois do
  `forward_auth`, e o app só aceita `Remote-User` acompanhado dele (comparação de tempo constante), conferido num
  `proxy.js`; sem ele, o pedido vale como sem login. O caminho do webhook é bloqueado no Caddy (`respond 404`).
- **O webhook chega ao serviço `ia`** (`http://ia:<porta>/whatsapp`), com segredo em **cabeçalho** (fora de logs), só os
  eventos de mensagem e de conexão, base64 desligado. O Rise usa o **token da instância**, não a chave global.
- Uma instância, o número da loja (WhatsApp Business, celular da 4hobby); QR mostrado só a administrador, buscado na hora,
  nunca em log. Na conexão, **as mensagens automáticas do aplicativo são desligadas** (decisão do dono).
- O `npm run backup` não inclui o banco `evolution`: recuperar é ler o QR de novo (no roteiro). A `copia:atualizar` apaga
  também as `Conexao` TELEGRAM, EVOLUTION e OPENAI.

**Caminho de uma mensagem**
1. Webhook → segredo → **filtro antes de gravar**: só conversa direta (grupos, `@broadcast`, status e newsletter
   descartados; vCard e localização ignorados) → idempotência pelo id → teto por contato também na entrada → confirma na
   Evolution, pelo id, que a mensagem existe (contra forja) → `ContatoIA` por **JID** (único; telefone quando a Evolution
   o entrega) → mensagem numa `ConversaIA` de canal `WHATSAPP` (texto guardado cru) → **uma tarefa aberta por conversa**,
   reagendada para "agora + 8 s" a cada mensagem nova (o silêncio de 8 s sem ninguém dormir) → 200.
2. O serviço `ia` pega a tarefa (exclusão por conversa na fila). Mensagem com mais de 30 min (chegou numa rajada depois
   de queda) não é respondida pela IA: vira "aguardando retorno". Uma reconciliação na partida e a cada poucos minutos
   lista as mensagens recentes na Evolution e preenche as que faltarem (idempotente).
3. Se a conversa está com humano ou "aguardando retorno": só grava e dispara os avisos de tempo. Senão, roda o laço no
   perfil cliente, com mídia buscada **pelo id na Evolution** (nunca por URL do payload; teto de tamanho), e antes de
   enviar faz a **conferência atômica**: a conversa ainda é da IA e nenhuma mensagem humana ou do cliente é mais nova que
   a que o modelo leu; se falhou, descarta o rascunho (uma refeita, no máximo). Envia com estado `enviando` gravado
   antes, "digitando" e atraso humano curto; assinatura **"Assistente 4hobby"**; pré-visualização de link desligada.
4. **Eco:** a própria resposta da IA volta pelo webhook como "enviada pelo celular". É reconhecida pelo id gravado no
   envio (com espera de 5 s para a corrida) e ignorada. Mensagem "do celular" que não é eco é a **Andrea respondendo**: a
   conversa passa a ser dela e a IA para.

**Filtro de saída (revisão):** antes de enviar, o código confere o texto: links só do site e da loja; todo "R$" tem de
aparecer nos resultados de ferramenta desta resposta (senão passa a humano); nenhuma chave PIX, dado bancário ou telefone
que não seja o da loja; texto puro com formatação do WhatsApp, mensagens de até ~1.500 caracteres. O prompt do canal não
tem a seção "Para a equipe" (nunca enviar o que não foi separado), e é editável só por administrador, com a versão
anterior guardada e quem mudou.

**Donos da conversa e estados (revisão fechou a tabela)**
- `dona ∈ {IA, HUMANO, AGUARDANDO_RETORNO}` + `donaUsuarioId` (quem, quando HUMANO) + `encerradaEm` (ortogonal).
- Transições: IA→HUMANO (cliente pede pessoa; IA não acha nos dados do Rise; assunto de pagamento, pedido, reclamação ou
  troca, sempre humano até o Pedidos existir; dois erros seguidos; Andrea respondeu do celular; botão Assumir), com
  motivo gravado; HUMANO→HUMANO (Passar para <atendente>, com comentário); HUMANO→IA **só por botão humano** ("Devolver
  à IA"); **a IA nunca retoma sozinha** (decisão do dono). IA→AGUARDANDO_RETORNO (fora do horário com pedido de pessoa;
  teto estourado; mensagem velha); AGUARDANDO_RETORNO→HUMANO (Assumir). Encerrar: por botão, ou 48 h sem mensagem **só
  em conversa da IA**; conversa com humano ou aguardando retorno encerra após 7 dias. Mensagem em conversa encerrada
  abre outra.
- **Cliente sem resposta humana há 30 min** (conversa HUMANO ou AGUARDANDO_RETORNO com mensagem do cliente mais nova que
  a última humana): aviso ao Maicol no Telegram com botão **Assumir**; o cliente recebe uma frase fixa de espera uma vez.
- **Horário da loja: segunda a sexta, 9h–12h e 14h–17h.** A IA responde dúvida de produto **24 h**; o horário só vale
  quando é preciso uma pessoa: dentro dele, a Andrea com aviso; fora, a IA explica o horário, diz que alguém retorna e
  marca "aguardando retorno". "Loja fechada hoje" por comando no Telegram e botão nas Configurações.
- Caixa de entrada no Rise (desenho em §5a): lista com filtros, conversa à direita atualizada por consulta leve de diferenças a cada poucos
  segundos (pausada com a aba oculta; alerta no título da aba quando chega conversa para a Andrea), botões Assumir,
  Passar, Devolver à IA, Encerrar, nota interna (tabela própria, nunca no histórico enviado ao modelo). Resposta humana
  pela caixa sai assinada com o primeiro nome. Em conversa de WhatsApp, as ações usam permissão (Acessos), não "dono da
  conversa"; a Andrea pode dar 👎.
- **Virada:** quem trocou mensagem com a loja nos últimos 7 dias começa com a Andrea (lista lida da Evolution só no dia
  da virada, sem guardar histórico); o histórico antigo não entra. Contatos pessoais no celular: etiqueta "Não IA" no
  WhatsApp Business, que o Rise respeita.
- **Proteções:** idempotência; exclusão por conversa; limite por contato por hora (entrada e saída) e de contatos novos
  por hora; **detector de laço** (N respostas seguidas sem progresso ou mensagens quase iguais → passa a humano e cala a
  IA); orçamento do cliente separado; Evolution desconectada → nenhum envio, aviso no Telegram e no healthchecks, estado
  na caixa; nunca mensagem ativa.
- **Contra bot e abuso de crédito (decisão do dono em 12/10/2026).** O orçamento reservado antes de cada chamada já é o
  limite duro (um bot nunca gasta mais que os R$ 70 do canal); estas quatro regras seguram antes de chegar lá:
  1. **Os limites têm número de fábrica**, editáveis na aba Orçamentos (§5a.5): **20 mensagens por contato por hora**,
     **15 contatos novos por hora** e **R$ 3,00 por contato por mês**; ficam em `ConfiguracaoIA.dados` (§10).
  2. **Contato que bate em qualquer limite vira "suspeito"**: a IA para de responder a ele (nem a frase fixa, para não
     alimentar o bot nem marcar o número da loja como spam), a conversa vai para "aguardando retorno" com o motivo
     "limite", e o Maicol recebe **um** aviso no Telegram com os botões **Bloquear** e **Liberar**. Bloquear põe no
     `ContatoIA` a etiqueta **"Não IA"** (a mesma dos contatos pessoais); Liberar zera o contador daquele contato. A
     caixa de entrada mostra o contato com o selo "suspeito" e os mesmos dois botões.
  3. **Filtro barato antes do modelo:** mensagem vazia, só emoji, só link, ou texto idêntico à mensagem anterior do mesmo
     contato não chama a IA (grava, conta no limite por hora, e não responde). Custa zero.
  4. **A frase fixa sai no máximo uma vez por contato por dia**, em qualquer situação em que a IA não responde (teto
     estourado, fora do horário, mensagem velha, limite); hoje isso valia só para o caso dos 30 min.

## 10. Banco (aditivo; enums em migration própria, sem uso no mesmo arquivo)

- `ConversaIA`: `canal` (RISE | WHATSAPP | TELEGRAM), `contatoId`, `dona`, `donaUsuarioId`, `donaDesde`, `motivoDaPassagem`,
  `encerradaEm`; em conversa de WhatsApp, `usuario` recebe o JID do contato. Índices `(canal, dona, atualizadoEm)`,
  `(contatoId)`, único parcial `(contatoId) WHERE encerradaEm IS NULL` (só no SQL).
- `MensagemIA`: `papel` ganha `HUMANO` (e todos os consumidores de `papel` tratam o valor novo: laço, sugestões, chat,
  revisão), `assinatura`, `interrompida`, `idExterno` **com prefixo por canal** (`wa:`, `tg:`), único quando presente.
- Novas: `ContatoIA` (jid único, telefone, nome, etiquetas, observações), `AnexoIA`, `DocumentoIA`, `TrechoIA`, `TarefaIA`
  (ou `Job` tipo `ia.*`), `NotaDaConversaIA`, `GastoIA` (tipo, provedor, valor, referência, criadoEm), `RevisaoDeProdutoIA`,
  `PropostaDeAcaoIA` (nonce, efeito, prazo, decidida), `VersaoDePromptIA`. O atendente é o `UsuarioRise` de Acessos.
- `ConfiguracaoIA.dados` ganha: internet (por canal), orçamentos, **limites de contato** (mensagens por contato por hora,
  contatos novos por hora, custo por contato no mês; §9), tempos (8 s, 30 min, inatividade), avisos do Telegram,
  horário da loja, "fechada hoje", bot ligado. Todo grupo novo entra em `GRUPOS` e no esquema zod da configuração; o
  padrão de fábrica do Padrão muda para o GPT.
- `Conexao` ganha `TELEGRAM`, `EVOLUTION` e `OPENAI` já é.

## 11. O que fica para o construtor

Modelos e preços da OpenAI na hora; biblioteca de Word; cliente do Telegram (ou `fetch`); versão e compose exatos da
Evolution (imagem por digest, variáveis, papel do banco), levados ao dono antes de subir; os esboços em HTML das telas de
§5a mostrados ao dono antes de cada entrega, e cada tela pronta passada por `make-interfaces-feel-better` em 1366 px;
prompt do canal WhatsApp; a escolha `Job` × `TarefaIA`; testes
próprios por área no padrão do projeto (`teste:fila-ia`, `teste:whatsapp` com Evolution falsa e payloads capturados,
`teste:telegram`, extensão do `teste:rise-ai` com imagem e Parar) e o ritual do CLAUDE.md atualizado.

## 12. Decisões minhas (o dono confere)

1. Copiar fica em cada resposta; "escreva para o cliente" dá texto puro.
2. Avisos de mensagens noturnas viram um resumo na abertura da loja, não um aviso por mensagem.
3. Na virada, 7 dias com a Andrea; histórico antigo não entra; grupos ignorados; quem não é cliente vai a humano com motivo
   "não é atendimento".
4. "Loja fechada hoje" por comando, sem calendário de feriados.
5. Resumo do dia às 20h.
6. Caixa de entrada por consulta de diferenças, não websocket.
7. Cotação do teto pelo PTAX.
8. Conversa com humano ou aguardando retorno encerra em 7 dias (48 h só para conversa da IA).

Da revisão UI/UX (12/10/2026):

9. A caixa de entrada mora no trilho do Rise AI, como o par "Minhas conversas · Caixa de entrada", não como bloco novo no
   menu.
10. Enviar e Parar são o mesmo botão, no mesmo lugar; Parar não é vermelho (não é erro).
11. Um interruptor só de internet (chat interno); o WhatsApp não tem interruptor porque nunca pesquisa.
12. Configurações do Rise IA em quatro abas (Modelos, Orçamentos, Canais, Atendimento), um Salvar por aba.
13. A revisão da IA no produto é uma faixa `amber` mais a janela de diferenças com marcação por campo; NCM, GTIN e origem
    nascem desmarcados.
14. A aba Conhecimento ganha o par Notas · Documentos.
15. Produto com revisão pendente ganha selo e filtro na lista de Produtos.
16. Cada aviso do Telegram tem no máximo quatro linhas e três botões.

## 13. Ordem e entregas

**Subir a Entrega 1 agora** (com a Anthropic como Padrão na tela; SSE, login e migration nunca passaram pelo Caddy em
produção) → **Acessos, lançamento 1** (núcleo, Rise IA, bloco Configurações) → **A** (A1: Parar, anexos, teto, GastoIA,
contrato com imagem; A2: documentos, embeddings, `buscarVariosProdutos`) → **C1** (só avisos pelo Telegram, sem polling)
→ **B** (WhatsApp; exige o ok do contêiner da Evolution, redes separadas, 2.º fator e dump criptografado) → **C2** (bot
bidirecional) → **E** (produto com revisão pendente e CONF, depois anúncios) → **D** (D1 já junto de C; D2 com o Pedidos).
Os revisores recomendaram o WhatsApp antes do anúncio (é onde está o valor; o anúncio é o mais arriscado), e o dono
**confirmou esta ordem em 12/10/2026** (a original era A → E → C → D → B). Cada entrega com teste automático,
roteiro de testes do dono na tela e deploy só com o "sobe".

## 14. Aprovação

Spec aprovada pelo dono em 12/10/2026 ("Opção 1"), junto com a de Acessos, depois das revisões de segurança e de
arquitetura (consolidado em `docs/superpowers/investigacoes/2026-10-12-revisao-specs-rise-ia-acessos.md`). Refeita com o
plugin de UI/UX no mesmo dia: §5a e as decisões 9 a 16 de §12 esperam a conferência do dono; o resto continua como
aprovado.
Próximo passo: o plano do lançamento 1 de Acessos (`superpowers:writing-plans`), depois os planos de A, C1, B, C2, E e D,
um por vez.
