# Rise IA, fase 2: o agente da 4hobby

Data: 12/10/2026 (revisada no mesmo dia depois de uma revisão de segurança e uma de arquitetura; o que mudou está
marcado "revisão"). Decidido em conversa com o dono (Maicol) a partir de um tutorial de agente de WhatsApp (spec e 8
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

- **Conversa fluida, como o chat do Claude.** Saem o quadro "Resposta pronta para o cliente", os cartões de produto e o
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
  conexão do WhatsApp; varredura pelo PC esperando; teto em 80% e 100%. Avisos de pane também vão ao healthchecks.io: o
  Telegram sozinho não avisa que o Telegram caiu.
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
- Caixa de entrada no Rise: lista com filtros, conversa à direita atualizada por consulta leve de diferenças a cada poucos
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

## 10. Banco (aditivo; enums em migration própria, sem uso no mesmo arquivo)

- `ConversaIA`: `canal` (RISE | WHATSAPP | TELEGRAM), `contatoId`, `dona`, `donaUsuarioId`, `donaDesde`, `motivoDaPassagem`,
  `encerradaEm`; em conversa de WhatsApp, `usuario` recebe o JID do contato. Índices `(canal, dona, atualizadoEm)`,
  `(contatoId)`, único parcial `(contatoId) WHERE encerradaEm IS NULL` (só no SQL).
- `MensagemIA`: `papel` ganha `HUMANO` (e todos os consumidores de `papel` tratam o valor novo: laço, sugestões, chat,
  revisão), `assinatura`, `interrompida`, `idExterno` **com prefixo por canal** (`wa:`, `tg:`), único quando presente.
- Novas: `ContatoIA` (jid único, telefone, nome, etiquetas, observações), `AnexoIA`, `DocumentoIA`, `TrechoIA`, `TarefaIA`
  (ou `Job` tipo `ia.*`), `NotaDaConversaIA`, `GastoIA` (tipo, provedor, valor, referência, criadoEm), `RevisaoDeProdutoIA`,
  `PropostaDeAcaoIA` (nonce, efeito, prazo, decidida), `VersaoDePromptIA`. O atendente é o `UsuarioRise` de Acessos.
- `ConfiguracaoIA.dados` ganha: internet (por canal), orçamentos, tempos (8 s, 30 min, inatividade), avisos do Telegram,
  horário da loja, "fechada hoje", bot ligado. Todo grupo novo entra em `GRUPOS` e no esquema zod da configuração; o
  padrão de fábrica do Padrão muda para o GPT.
- `Conexao` ganha `TELEGRAM`, `EVOLUTION` e `OPENAI` já é.

## 11. O que fica para o construtor

Modelos e preços da OpenAI na hora; biblioteca de Word; cliente do Telegram (ou `fetch`); versão e compose exatos da
Evolution (imagem por digest, variáveis, papel do banco), levados ao dono antes de subir; desenho fino da caixa de entrada
e do campo de anexos (esboço mostrado ao dono antes); prompt do canal WhatsApp; a escolha `Job` × `TarefaIA`; testes
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
arquitetura (consolidado em `docs/superpowers/investigacoes/2026-10-12-revisao-specs-rise-ia-acessos.md`). Nada em aberto.
Próximo passo: o plano do lançamento 1 de Acessos (`superpowers:writing-plans`), depois os planos de A, C1, B, C2, E e D,
um por vez.
