# Chat da loja: acompanhar pedido e anexar arquivo — plano de implementação

> **Para quem executa:** superpowers:executing-plans (inline, sem subagentes, escolha do dono), na main. Passos com `- [ ]`.

**Objetivo:** o Hobi (1) mostra a situação e o rastreio de um pedido da Loja Integrada ou do Bling a quem sabe o número e o
CPF/CNPJ ou e-mail do comprador, sem a IA ver nada disso; e (2) aceita um arquivo do visitante (foto, PDF, planilha, CSV ou
texto) e responde sobre ele, sem guardar o arquivo.

**Arquitetura:** o pedido é um formulário fixo da janela que chama `POST /pedido`; o serviço `ia` só chama a função
`ia_situacao_do_pedido` do banco (`SECURITY DEFINER`), que confere a prova, conta as tentativas e devolve poucos campos. O
anexo sobe por `POST /anexo`, é reconhecido pelos bytes, vira texto (PDF, planilha, CSV, TXT) ou uma imagem reduzida e limpa
(sem EXIF), fica na memória do serviço por 10 min e entra na pergunta seguinte do `/chat`.

**Tecnologia:** Node `node:http` (serviço `ia`), Postgres (função + tabela de tentativas), `sharp`, `pdf-parse`, `exceljs` (já
no `package.json` e na imagem `rise:latest`, que o contêiner `ia` usa), widget em JS puro com Shadow DOM.

**Spec:** `docs/superpowers/specs/2026-11-19-chat-ia-na-loja-design.md` (§5.2 a função do pedido, §8 limites, §10 dados
pessoais, §12 fase 3). O anexo não está na spec: é o item 10 de
`docs/superpowers/plans/2026-11-22-chat-da-loja-ajustes-do-dono.md` (pedido do dono em 22/11/2026: "deve ter opção de anexar
um arquivo e a IA ter capacidade interpretar o arquivo. pode ser lista de peça, imagem e etc"); este plano é a spec dele.
O desenho do pedido é o item 7 (o formulário da Mamute **sem a linha do WhatsApp**).

## Regras gerais

- Nada do Rise novo passa a ser lido pelo `rise_ia`: a função roda como dono, e o papel só ganha `EXECUTE` nela. `PedidoDeVenda`,
  `Cliente` e `Envio` continuam em `TABELAS_PROIBIDAS` e o `teste:ia-isolamento` continua provando a recusa.
- O formulário do pedido **não passa pela IA nem é gravado** (só a contagem de tentativas, com o número guardado em hash).
- "Não achei" é **a mesma resposta** para pedido que não existe, documento errado e pedido do Mercado Livre.
- Pedido só dos canais `LOJA_INTEGRADA` e `BLING` (decisão 6 da spec).
- O arquivo **nunca vai ao disco**: memória do processo, 10 min, um por sessão. O que se grava na conversa é o nome, o tipo e o
  texto extraído já mascarado (como uma mensagem colada); de imagem, só "[imagem enviada]".
- Texto da tela com acento, curto; ajuda em `title`, sem parágrafo explicativo (Padrão visual).
- Depois de mexer em `assistente/widget/`: `rm -f assistente/publicado/widget-*.js && npm run hobi:montar` e commitar o
  publicado junto (ainda não há etiqueta na loja).
- Commit só dos meus arquivos (`git commit -- caminhos`), trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Gasto de IA de verdade só com o ok do dono (testes usam provedor falso).
- **Limite estourado = texto + link clicável do WhatsApp comercial** (dono, ao aprovar em 22/11/2026: "caso estoure os
  limites que vc definiu deve mostrar um texto para entrar em contato via whatsapp e link clicavel do whatsapp"). Vale para
  todo limite da tabela abaixo: erros do pedido (sessão, IP e banco), consultas por hora, anexos do dia e arquivo maior que
  5 MB. Texto: pedido "Não consigo consultar mais pedidos agora. Fale com a gente pelo WhatsApp:"; anexo "Você chegou ao
  limite de arquivos de hoje. Envie pelo WhatsApp:" e "Arquivo maior que 5 MB. Envie pelo WhatsApp:"; o botão é o
  `botaoDoWhatsApp` que a janela já usa. As respostas 413/429 do serviço levam `whatsapp` (o link comercial).

## Números de fábrica (editáveis depois na tela Canais, como os de §8)

| Limite | Valor |
| --- | --- |
| Pedido: erros por sessão | 5 (depois disso o formulário oferece o WhatsApp) |
| Pedido: consultas por IP por hora | 10 (memória do serviço) |
| Pedido: erros por número por dia (no banco) | 5 |
| Pedido: consultas no total por hora (no banco) | 300 |
| Anexo: tamanho | 5 MB |
| Anexo: por sessão por dia | 5 (cada um conta também como mensagem) |
| Anexo: texto extraído que vai ao modelo | 12.000 caracteres (o resto é cortado com aviso ao modelo) |
| Anexo: planilha | 1ª aba com dados, até 400 linhas |
| Anexo: imagem | maior lado reduzido a 1.280 px, regravada em JPEG 82 (some EXIF e GPS) |
| Anexo: tempo de leitura | 10 s, senão "Não consegui ler este arquivo" |

## Review Focus

1. Prova com máscara ou espaço ("123.456.789-09 ", "Fulano@Email.com") tem de casar; prova curta (menos de 11 dígitos e sem
   "@") não chega ao banco.
2. Pedido do Bling achado pelo número que o cliente recebeu (`numero` ou `blingNumero`), da LI pelo `numero`/`idExterno`.
3. Arquivo com extensão mentirosa (um `.exe` chamado `lista.pdf`, um HTML chamado `.csv`) é recusado pelos bytes.
4. Planilha "bomba" (zip pequeno que descompacta em centenas de MB) não derruba o serviço.
5. O texto do arquivo com CPF, e-mail ou telefone chega mascarado ao modelo e ao banco.

---

### Tarefa 1: a função do pedido no banco

**Arquivos:**
- Modificar: `src/lib/riseAi/cliente/sqlDoPapel.js` (nova `sqlDaMigracaoDoPedido()`)
- Modificar: `prisma/schema.prisma` (modelo `TentativaDePedidoIA`: `id`, `numeroHash` (sha256 do número normalizado),
  `dia` (date, São Paulo), `erros` int, `consultas` int, `@@unique([numeroHash, dia])`)
- Criar: `prisma/migrations/20261123_ia_situacao_do_pedido/migration.sql` (gerado pela função, como o `20261122`)
- Testar: `scripts/teste-ia-isolamento.js`

**Interfaces:**
- Produz: `ia_situacao_do_pedido(numero text, prova text) RETURNS jsonb`, dono `rise`, `SECURITY DEFINER`,
  `SET search_path = public, pg_temp`, `REVOKE ALL ... FROM PUBLIC`, `GRANT EXECUTE ... TO rise_ia`.
  Volta: `{"situacao":"achado","pedido":{numero, canal:"LOJA_INTEGRADA"|"BLING", data (só o dia), status, statusDoEnvio,
  transportadora, rastreio, linkDoRastreio, atualizadoEm}}`, ou `{"situacao":"nao_achado"}`, ou `{"situacao":"limite"}`.
- Produz: `TABELAS_PROIBIDAS` ganha `TentativaDePedidoIA`.

Regras da função: número só com letras e dígitos, 1 a 30; prova = dígitos (11 ou 14) ou e-mail em minúsculas; casa com
`documentoDoComprador`/`emailDoComprador` do pedido **ou** `documento`/`email`/`emailsAdicionais` do `Cliente` ligado
(documento comparado só pelos dígitos); pedido = `origem IN ('LOJA_INTEGRADA','BLING')` e (`numero`, `idExterno` ou
`blingNumero` = número). Rastreio: o `Envio` mais recente do pedido com `rastreio`; sem ele, `envio->>'rastreio'`,
`'transportadora'`, `'link'`. Contagem: consultas da última hora acima de 300 → `limite`; erros do número no dia ≥ 5 →
`limite` antes de olhar o pedido; não casou → `erros + 1`.

- [ ] **Passo 1:** no `teste-ia-isolamento.js`, criar como `rise` um pedido `ZZ-LOJA-PED-1` (LI, documento "123.456.789-09",
  e-mail "zz@exemplo.com", um `Envio` com rastreio "ZZ123BR") e um do ML com os mesmos dados; asserções, vestindo `rise_ia`:
  `achado` com "12345678909" e com "ZZ@Exemplo.com "; `nao_achado` com documento errado e para o do ML (a mesma resposta);
  `limite` na 6ª tentativa errada do mesmo número; `SELECT` em `PedidoDeVenda` e em `TentativaDePedidoIA` recusado; a
  migration igual a `sqlDaMigracaoDoPedido()`. Rodar: `npm run teste:ia-isolamento` → falha (função não existe).
- [ ] **Passo 2:** schema + `sqlDaMigracaoDoPedido()` + migration gerada; `npx prisma migrate dev` no banco do PC.
- [ ] **Passo 3:** `npm run teste:ia-isolamento` → tudo ok. `npm run teste:assistente` → ok.
- [ ] **Passo 4:** commit "Chat da loja: função do pedido no banco, com prova e tentativas".

### Tarefa 2: `POST /pedido` no serviço

**Arquivos:**
- Criar: `src/lib/riseAi/cliente/pedido.js` (puro: `normalizarPedido({numero, prova})` → `{numero, prova}` ou `{erro}`;
  `textoDaSituacao(pedido)` → `{titulo, linhas[], rastreio:{codigo, link}|null}`)
- Modificar: `src/lib/riseAi/cliente/dados.js` (`situacaoDoPedido(numero, prova)` = `SELECT ia_situacao_do_pedido($1,$2)`)
- Modificar: `src/lib/riseAi/cliente/limites.js` (`limitesDoPedido`: 5 erros por sessão, 10 por IP por hora, memória)
- Modificar: `src/lib/riseAi/cliente/servidorHttp.js` (4ª rota; a lista fechada de rotas passa a ter `/pedido`)
- Testar: `scripts/teste-assistente.js`

**Interfaces:**
- Consome: a função da Tarefa 1.
- Produz: `POST /pedido` corpo `{sessaoId, numero, prova, turnstileToken?}` (mesma verificação de robô do `/chat`) →
  200 `{situacao:"achado", titulo, linhas, rastreio}` | 200 `{situacao:"nao_achado"}` | 429 `{situacao:"limite", whatsapp}`
  | 400 `{erro}` (prova curta ou número vazio, sem ir ao banco). Nada é gravado em `ConversaIA`.

Textos de `textoDaSituacao` (status do pedido → título): AGUARDANDO_PAGAMENTO "Aguardando o pagamento"; PAGO "Pagamento
aprovado"; AGUARDANDO_PECAS e EM_SEPARACAO "Em separação"; ENVIADO "Enviado"; ENTREGUE e FINALIZADO "Entregue"; CANCELADO
"Cancelado"; DEVOLVIDO "Devolvido". Linhas: "Pedido nº X de dd/mm/aaaa", "Envio: <transportadora>" (se houver), "Atualizado
em dd/mm às hh:mm". Link do rastreio só `https:`.

- [ ] **Passo 1:** testes em `teste-assistente.js`: `normalizarPedido` (máscara, e-mail, prova curta → erro); os 9 status em
  `textoDaSituacao`; a rota com `dados` falso: achado, não achado, a 6ª tentativa da sessão → 429 com o WhatsApp comercial,
  o 11º pedido do mesmo IP → 429, `/pedido` de outra origem → recusado, nada gravado em conversa. Rodar → falha.
- [ ] **Passo 2:** implementar `pedido.js`, `situacaoDoPedido`, `limitesDoPedido` e a rota.
- [ ] **Passo 3:** `npm run teste:assistente` e `npm run teste:ia-isolamento` (o serviço de verdade responde `/pedido` como
  `rise_ia`) → ok.
- [ ] **Passo 4:** commit "Chat da loja: rota do pedido".

### Tarefa 3: o pedido na janela (atalho, formulário e o "cadê meu pedido")

**Arquivos:**
- Modificar: `assistente/widget/nucleo.js` (atalho `pedido` em `ATALHOS`; evento `formulario`; troca local do tipo `pedido`
  com o resultado)
- Modificar: `assistente/widget/tela.js` (formulário dentro da conversa: "Número do pedido", "CPF, CNPJ ou e-mail",
  **Consultar**; resultado em cartão: título com a cor do estado, linhas, "Rastrear" (link) e "Ver na loja"; sem a linha do
  WhatsApp; no `limite`, o botão do WhatsApp comercial)
- Modificar: `src/lib/riseAi/cliente/ferramentas.js` (ferramenta sem dado `abrirConsultaDePedido`: devolve `{ok:true}` e o
  cérebro emite o evento SSE `formulario` com `{tipo:"pedido"}`)
- Modificar: `src/lib/riseAi/cliente/prompt.js` (regra: pergunta sobre pedido, entrega ou rastreio → chama a ferramenta e diz
  "Preencha o número do pedido e o CPF, CNPJ ou e-mail da compra"; **nunca** pede esses dados no texto)
- Modificar: `scripts/hobi-demo.js` (roteiro: "pedido"/"rastreio" → evento `formulario`; `/pedido` falso: número "1001" + prova
  "12345678909" achado, o resto não achado)
- Testar: `scripts/teste-widget.js`, `scripts/teste-assistente.js`

**Interfaces:**
- Consome: `POST /pedido` (Tarefa 2).
- Produz: `ATALHOS` com `{id:"pedido", texto:"Acompanhar meu pedido"}` (entre "duvida" e "lista"); evento do fluxo
  `formulario` `{tipo:"pedido"}`.

"Ver na loja": a área de pedidos do cliente na LI. **Medir o endereço certo na loja antes de fixar** (só abrindo a página);
se não houver um endereço estável, o botão sai.

- [ ] **Passo 1:** testes: `aberturaDoAtalho("pedido")` abre o formulário (sem pergunta à IA); o evento `formulario` cria a
  troca local; o resultado `achado` vira cartão e o `nao_achado` vira a frase "Não encontrei este pedido. Confira o número e o
  CPF, CNPJ ou e-mail da compra."; nada do formulário fica no `sessionStorage` (só o resultado, sem a prova); a ferramenta
  `abrirConsultaDePedido` emite o evento e não lê banco. Rodar `npm run teste:widget` e `npm run teste:assistente` → falha.
- [ ] **Passo 2:** implementar; montar o widget.
- [ ] **Passo 3:** testes → ok; `npm run hobi:demo -- --porta=8791` e conferir no navegador: atalho, "cadê meu pedido?",
  1001 + documento certo, documento errado, a 6ª tentativa, celular (375 px).
- [ ] **Passo 4:** commit "Chat da loja: acompanhar pedido na janela".

### Tarefa 4: imagem na conversa com o provedor

**Arquivos:**
- Modificar: `src/lib/riseAi/provedores/contrato.js` (o conteúdo de uma mensagem do usuário pode ser lista de partes
  `{tipo:"texto", texto}` e `{tipo:"imagem", mime:"image/jpeg", base64}`)
- Modificar: `src/lib/riseAi/provedores/openaiCompativel.js` (parte imagem → `{type:"image_url", image_url:{url:"data:..."}}`)
- Modificar: `src/lib/riseAi/provedores/anthropic.js` (parte imagem → `{type:"image", source:{type:"base64", media_type, data}}`)
- Testar: `scripts/teste-rise-ai.js`

**Interfaces:**
- Produz: provedores aceitam `mensagens[i].conteudo` como string (como hoje) ou lista de partes; string continua igual.

- [ ] **Passo 1:** testes com `fetch` falso: o corpo enviado à OpenAI e à Anthropic com uma parte imagem; mensagem só texto
  sai idêntica à de hoje. Rodar `npm run teste:rise-ai` → falha.
- [ ] **Passo 2:** implementar nos dois provedores.
- [ ] **Passo 3:** `npm run teste:rise-ai` → as 616 + as novas, ok.
- [ ] **Passo 4:** commit "Rise AI: imagem na mensagem do usuário".

### Tarefa 5: `POST /anexo` (receber, reconhecer e ler o arquivo)

**Arquivos:**
- Criar: `src/lib/riseAi/cliente/anexo.js` (`tipoPelosBytes(buffer)` → `"png"|"jpeg"|"webp"|"pdf"|"xlsx"|"texto"|null`;
  `lerAnexo(buffer, tipo, {sinal})` → `{texto, paginas?, linhas?, cortado}` ou `{imagem:{mime, base64}}`; `GuardaDeAnexos`
  (Map por sessão, 1 por sessão, 10 min, `pegar(sessaoId, anexoId)` tira da guarda))
- Modificar: `src/lib/riseAi/cliente/servidorHttp.js` (rota `POST /anexo`: corpo cru até 5 MB **só nesta rota**, cabeçalhos
  `X-Sessao` e `X-Nome`; responde `{anexoId, nome, tipo, resumo:"3 páginas"|"120 linhas"|"imagem"}` ou 413/415/422)
- Modificar: `src/lib/riseAi/cliente/cerebro.js` (o `/chat` aceita `anexoId`: texto extraído entra mascarado na mensagem do
  usuário como "Arquivo enviado: <nome>\n<texto>", com o aviso de lista quando `pareceLista`; imagem entra como parte imagem;
  na conversa grava "[arquivo: nome — resumo]" + o texto mascarado, ou "[imagem enviada]")
- Modificar: `src/lib/riseAi/cliente/limites.js` (5 anexos por sessão por dia)
- Modificar: `src/lib/riseAi/cliente/prompt.js` (regra: imagem de peça → diz o que parece ser e busca na loja; lista no
  arquivo → orça como a lista colada; nunca repete dado pessoal do arquivo)
- Modificar: o bloco do endereço `hobi` que o `deploy/preparar-ia.sh` grava no Caddy (`request_body { max_size 6MB }` só em
  `/anexo`; as outras rotas continuam no teto de 16 KB do serviço)
- Testar: `scripts/teste-assistente.js` (fixtures geradas no próprio teste: PNG com `sharp`, PDF com `pdfkit`, XLSX com
  `exceljs`, CSV)

Leitura: imagem com `sharp(buffer, {limitInputPixels: 40e6}).rotate().resize(1280,1280,{fit:"inside"}).jpeg({quality:82})`
(o `rotate` aplica a orientação do EXIF antes de ele sumir); PDF com `pdf-parse` (sem texto = "Este PDF é uma imagem
escaneada. Mande uma foto ou a lista em texto."); XLSX: antes de abrir, somar o tamanho descompactado declarado das entradas
do zip (teto 25 MB, senão 422) e só então `exceljs`, 1ª aba com dados, células unidas por tab; CSV/TXT: UTF-8 (com BOM
tirado), ou Latin-1 se não for UTF-8 válido. Tudo dentro de `Promise.race` com 10 s.

- [ ] **Passo 1:** testes: `tipoPelosBytes` (PNG, JPEG, WEBP, PDF, XLSX, CSV; `.exe` renomeado e HTML recusados); imagem com
  EXIF de GPS sai sem EXIF e com no máximo 1280 px; PDF com texto; PDF sem texto; XLSX com 3 linhas; zip-bomba recusado;
  6 MB → 413; o 6º anexo do dia → 429; `anexoId` de outra sessão não serve; o arquivo some da guarda depois de usado e depois
  de 10 min (relógio falso); o `/chat` com anexo manda ao provedor falso o texto mascarado (CPF do arquivo mascarado) e grava
  só o resumo + texto mascarado; com imagem, o provedor falso recebe a parte imagem e o banco "[imagem enviada]". Rodar → falha.
- [ ] **Passo 2:** implementar `anexo.js`, a rota, o cérebro, os limites, o prompt e o Caddy.
- [ ] **Passo 3:** `npm run teste:assistente`, `npm run teste:ia-isolamento` (o serviço de verdade recebe um CSV pelo
  `/anexo` rodando como `rise_ia`) → ok.
- [ ] **Passo 4:** commit "Chat da loja: receber e ler o arquivo do visitante".

### Tarefa 6: o clipe na janela

**Arquivos:**
- Modificar: `assistente/widget/nucleo.js` (`anexoPermitido({nome, tamanho, tipo})` → ok ou o motivo; o anexo pendente no
  estado; a troca mostra o chip do arquivo na fala do visitante)
- Modificar: `assistente/widget/tela.js` (botão de clipe à esquerda do campo, `<input type="file" accept="image/*,.pdf,.xlsx,
  .csv,.txt">`; chip acima do campo com nome, tamanho e X; "Lendo o arquivo…" enquanto sobe; erros em uma linha: "Arquivo
  maior que 5 MB", "Tipo de arquivo não aceito", "Não consegui ler este arquivo"; colar uma imagem (Ctrl+V) no campo também
  anexa; o envio só com o arquivo usa o texto "Veja o arquivo que enviei")
- Modificar: `scripts/hobi-demo.js` (`/anexo` com a leitura de verdade da Tarefa 5 e resposta de roteiro: "Recebi <nome>
  com N linhas")
- Testar: `scripts/teste-widget.js`

- [ ] **Passo 1:** testes de `anexoPermitido` (5 MB, tipos, nome sem caminho) e do estado (anexo pendente sai ao enviar, o chip
  fica na troca, nada do arquivo vai ao `sessionStorage`). Rodar `npm run teste:widget` → falha.
- [ ] **Passo 2:** implementar; montar o widget.
- [ ] **Passo 3:** testes → ok; no navegador (demo 8791): foto, PDF, planilha, CSV, arquivo grande, `.exe`, colar imagem,
  celular. Passar a tela por `ecc:make-interfaces-feel-better`.
- [ ] **Passo 4:** commit "Chat da loja: anexar arquivo na janela".

### Tarefa 7: documentação e fechamento

**Arquivos:** `CLAUDE.md` (seção "Chat da loja (o Hobi), fase 3: pedido e anexo": mapa, limites, o que não é gravado, a
migration que o próximo deploy aplica, contagens dos testes), a lista de ajustes (itens 7 e 10 FEITO), memória
`projeto-chat-ia-na-loja.md`.

- [ ] **Passo 1:** escrever.
- [ ] **Passo 2:** ritual: `npm run lint`, `teste:widget`, `teste:assistente`, `teste:ia-isolamento`, `teste:rise-ai`,
  `teste:pedidos` (nada do pedido mudou), `teste:saude`.
- [ ] **Passo 3:** commit e push; relatório ao dono com "O que foi feito" + "Testes que você precisa fazer". Deploy só com o
  "sobe" (leva as migrations `20261122_ia_whatsapp_da_empresa` e `20261123_ia_situacao_do_pedido`).

## Fora deste plano

- Item 9 (histórico das avaliações no Rise): o dono deixou para depois.
- Anexo no WhatsApp (o mesmo `anexo.js` serve quando a Entrega B existir).
- Ligar o serviço na VPS (fase 4: DNS `hobi`, `preparar-ia.sh`, Turnstile, chave da OpenAI dedicada, etiqueta na LI).
- Ler foto de nota fiscal ou boleto como pedido: o pedido só pelo formulário.
