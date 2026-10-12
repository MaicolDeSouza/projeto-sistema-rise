# Revisão das specs de 12/10/2026 (Acessos e Rise IA fase 2)

Duas revisões independentes sobre as specs `2026-10-12-acessos-design.md` e `2026-10-12-rise-ia-agente-design.md`, antes
de qualquer código: uma de **segurança** (Claude Opus 5.5) e uma de **arquitetura** (Claude Sonnet 5.5), lendo as specs,
a spec da Entrega 1 e o código que elas estendem. Este arquivo guarda o consolidado e as decisões do dono; as specs já
foram atualizadas com tudo o que entrou.

## Os seis achados que mudaram o desenho

1. **Rede e confiança no cabeçalho de login.** Todos os contêineres dividem uma rede e o `app` aceita o `Remote-User` que
   só o Caddy limpa; um contêiner da Evolution comprometido falaria com o `app` como administrador. Entrou: redes
   separadas, segredo de borda entre Caddy e `app`, webhook recebido pelo serviço `ia`, Evolution com banco/usuário/ambiente
   próprios, imagem por digest, integrações desligadas, token de instância.
2. **IA fora do worker da coleta.** Trava única, memória dividida, erro fatal que reinicia tudo. Entrou: serviço `ia`
   próprio no compose, só na VPS; o worker do PC nunca atende a fila do WhatsApp nem o Telegram.
3. **Perfil do cliente falhava aberto no código de hoje** (padrões "admin", filtros por nome exato "publico", lista de
   bloqueio em vez de permitida, estoque numérico no ramo público). Entrou: perfil fixo em código, lista permitida,
   ferramentas próprias do canal, sem perfil padrão, estoque categórico, teste de guarda.
4. **Injeção indireta com ferramentas de efeito.** Texto de cliente lido numa volta de administrador podia disparar
   aprovar/ligar internet/passar conversa. Entrou: ações com efeito só por botão criado pelo código (duas etapas, nonce),
   voltas com conteúdo de terceiro sem ferramentas de efeito, pré-visualização de link desligada, markdown seguro no chat.
5. **Permissão por campo apagaria dados** com o Salvar de hoje (registro inteiro, ausente = nulo, listas trocadas por
   inteiro) e "campo" não cobre o custo, que aparece em sete lugares. Entrou: gravação só com os campos editáveis e mescla
   com o banco, listas sem permissão ignoradas, dados sensíveis transversais como recursos, campos em lançamento 3.
6. **Eco do próprio envio e estados da conversa.** O envio da IA volta como "do celular" e a regra de 48 h fecharia as
   conversas do fim de semana. Entrou: eco pelo id, conferência atômica antes de enviar, tabela de estados fechada
   (dona + quem + encerrada), 7 dias para conversa humana/aguardando retorno.

## Endurecimentos que entraram

Telegram (vínculo por código, chat privado, perfil menor, token mascarado, `copia:atualizar` apaga TELEGRAM/EVOLUTION/OPENAI,
desligar bot, 2.º fator antes); webhook (segredo em cabeçalho, confirmação pelo id, mídia pelo id com teto, filtros antes
de gravar, mensagens velhas não respondidas, reconciliação, identidade por JID, prefixo por canal no `idExterno`); mídia
(processo filho isolado, ZIP conferido, macros recusadas, XLS fora, imagem reencodada, PDF escaneado como imagem, rota de
anexos com login); teto (reserva antes da chamada, por rodada, dois orçamentos, modelo sem preço não é padrão, `GastoIA`,
PTAX, detector de laço, limite de contatos novos); filtro de saída no WhatsApp (links, "R$", PIX); Acessos (rotas `/api`,
ações de leitura projetadas, nível `executar`, sessão de acessos separada, semeadura na partida, último administrador,
quebra-vidro, simulação de login no PC, dev em 127.0.0.1, "Ver como" só calcula, auditoria, três lançamentos,
Configurações como links); Parar explícito com motivo próprio; fila com `sinalEm`, recolhimento, `agendadaPara`, debounce
por reagendamento, estado `enviando`; contrato de provedores com partes de conteúdo; OpenAI por família de modelo e busca
pela API Responses; ordem com a Entrega 1 no ar antes.

## Decisões do dono (12/10/2026)

- Campo sensível novo nasce "ver" como os demais (quem esconde é o dado sensível, não o campo).
- A IA **nunca retoma sozinha** uma conversa que foi para humano; cliente sem resposta humana há 30 min gera aviso no
  Telegram do Maicol com botão "Assumir".
- Texto do cliente guardado cru, mascarado só ao ir para o modelo; tudo guardado sem prazo, com "apagar mensagens
  anteriores a" e "apagar contato" sob pedido; **sem aviso ao cliente e sem atualizar a política de privacidade** (risco
  assumido pelo dono).
- Produto e anúncio automáticos: a IA monta o **produto** numa revisão pendente com os arquivos num lote temporário; o dono
  aprova marcando **Conferido (CONF)**, só então os dados entram no cadastro, o temporário é apagado e a IA pode gerar os
  rascunhos de ML e LI; publicar continua clique do dono.
- "As demais conforme o recomendado": contêiner `ia` e redes separadas; mesma regra de custo na tela e no chat; dois
  orçamentos (R$ 70 clientes / R$ 30 interno) com PTAX; 2.º fator antes do Telegram e do WhatsApp; Entrega 1 no ar antes;
  Acessos em três lançamentos.

## Fechado em 12/10/2026

- Internet só no chat interno; nunca no canal do cliente.
- Ordem confirmada: Entrega 1 no ar → Acessos (núcleo) → A → C1 → B → C2 → E → D.
- As duas specs aprovadas ("Opção 1").

---

# Revisão 2 (12/10/2026, à noite): depois do UI/UX e das proteções contra bot

As specs foram refeitas com o plugin de UI/UX (Acessos §5 e agente §5a) e ganharam o bloco "Contra bot" (agente §9).
Duas revisões novas, as duas em Claude Opus 5.5: **segurança** (12 achados) e **código e arquitetura** (15 achados),
lendo as specs, a spec da Entrega 1 e o código. Abaixo o consolidado, agrupado por assunto, com a correção
recomendada. **Tudo entrou nas specs na mesma noite**, com as sete decisões aprovadas pelo dono ("Opção 1"); cada trecho está marcado "revisão 2".

## A. Entrega E: a revisão da IA no produto (os dois revisores)

1. **"Aplicar" como duas chamadas não serve.** `alternarConferido` hoje só faz `update({ conferido })`, sem conferência
   no servidor (o código "123" mora no navegador), e o Conferido só existe na lista. Gravar as linhas fora do
   `salvarProduto` pula as regras dele (maiúsculas, EAN repetido, custo do fornecedor padrão, localização e retrato dos
   kits, reconciliação das fotos validadas); o `@updatedAt` sobe na primeira chamada e a conferência de versão da segunda
   sempre falha; se a segunda falhar, o produto fica Conferido com dado velho; o formulário aberto (campos não
   controlados) regrava os valores antigos no próximo Salvar. Produto novo não tem `Produto` onde ancorar a revisão.
   **Correção:** "Aplicar" põe os valores marcados **nos campos do formulário** (como o `aplicar` do Clonar), e o
   Salvar normal grava e marca Conferido **na mesma transação**, conferindo `atualizadoEm`; produto novo abre em
   `/produtos/novo?revisao=<id>`, sem linha em `Produto` antes do Salvar.
2. **O lote temporário da revisão é apagado em 24 h** pela limpeza do worker (`VALIDADE_TEMPORARIO_MS`), antes de uma
   revisão de fim de semana. **Correção:** o lote mora em `dados/rise-ai/revisoes/<id>/`, fora da limpeza, e só sai no
   CONF ou no Recusar.
3. **Valores propostos passam pelas permissões.** A janela e o `title` "proposto: <valor>" mostrariam custo e fornecedor
   a quem não vê. **Correção:** os valores vêm do banco (`RevisaoDeProdutoIA`), nunca do navegador, e passam por
   `aplicarPermissoesDeCampo` e pela projeção de dado sensível.
4. **Pré-marcação:** preço, custo, estoque e situação nascem **desmarcados**, como os fiscais (texto de concorrente lido
   como referência pode empurrar um preço). Documentos aparecem **um por linha, com a origem**, e não "N itens".

## B. O caminho do `app` até a Evolution (os dois revisores)

5. O `app` fica fora da rede `whatsapp`, mas Mostrar QR, Desconectar, estado da instância, Reconectar, "apagar este
   contato" e a resposta humana pela caixa nascem em telas do `app`. A spec não diz por onde passam, e o caminho fácil
   desfaz a separação de redes. **Correção:** toda ordem do `app` à Evolution vira tarefa na fila atendida pelo `ia`
   (`wa.enviar`, `wa.qr`, `wa.desconectar`, `wa.apagarContato`); o QR volta numa linha efêmera (apagada ao ser lida ou
   em 60 s); o servidor HTTP do `ia` expõe só `POST /whatsapp`.

## C. Contra bot: o bloco novo precisa de ajuste (os dois revisores)

6. **Com os limites de fábrica, um bot gasta até R$ 3 × 15 contatos novos = R$ 45 por hora**: os R$ 70 do mês acabam
   numa tarde. **Correção:** teto **diário** do canal (1/10 do mensal, R$ 7) e teto baixo para contato novo nas primeiras
   24 h (R$ 0,50; depois valem os R$ 3 do mês).
7. **O 16.º contato da hora é quase sempre um cliente real** (ou um dia de movimento), e viraria suspeito sem nem a frase
   fixa. **Correção:** estourou o limite de contatos novos, os novos vão para "aguardando retorno" **com** a frase fixa e
   sai **um** aviso agregado por hora; ninguém vira suspeito por isso. Suspeito é só o contato que bate no limite
   **próprio** (mensagens por hora ou custo).
8. **Contradição regra 2 × regra 4:** a 2 diz que o suspeito não recebe nem a frase fixa; a 4 lista "limite" entre os
   casos em que ela sai. **Correção:** tirar "limite" da regra 4.
9. **A conversa suspeita em AGUARDANDO_RETORNO cairia na regra dos 30 min** (frase de espera, aviso com Assumir) e nas
   contagens ("Esperando pessoa", o "(3)" do título). **Correção:** conversa de suspeito fica fora da regra dos 30 min,
   das contagens e de toda frase fixa.
10. **"Liberar zera o contador", mas não há contador em `ContatoIA`, nem destino para a conversa** (não existe
    AGUARDANDO_RETORNO→IA). **Correção:** `ContatoIA` ganha `suspeitoEm`, `motivo`, `liberadoEm`, `bloqueadoEm` e os
    contadores; Liberar (botão humano) devolve a conversa à IA, a única transição AGUARDANDO_RETORNO→IA.
11. **"Liberar" na caixa de entrada para qualquer atendente é aberto demais.** **Correção:** vira ação `executar`
    própria no catálogo de Acessos (como "Loja fechada hoje").
12. **"Não IA" (etiqueta do WhatsApp Business) e "bloqueado" não são a mesma coisa**, e o filtro antes de gravar só
    descarta grupo, broadcast, status e newsletter: as conversas pessoais do celular da loja e as do bot bloqueado
    entrariam cruas no banco, na caixa, no backup e na virada. **Correção:** contato "Não IA" e contato bloqueado são
    descartados **antes de gravar** (fica só um contador por dia; mídia nunca é baixada); "bloqueado" é estado próprio
    do `ContatoIA`.

## D. Telegram (os dois revisores)

13. **O trecho do cliente vai cru ao Telegram** (a máscara de §3 só vale "ao ir para o modelo"), e "sem `parse_mode`" não
    impede o Telegram de tornar clicável URL, e-mail, telefone e `/comando`: um cliente escreve `/fechada` e o dono só
    precisa tocar. **Correção:** o trecho passa por `mascararDadosPessoais`, é cortado em ~120 caracteres e vai com `/`,
    `://` e `@` neutralizados (teste no `teste:telegram`); comando com efeito no bot só por botão; na caixa de entrada, o
    texto do cliente é texto puro, URL não clicável, e mascarado para quem não tem `dado.pessoalDoCliente`.
14. **O código de vínculo não tem tamanho, alfabeto nem limite de tentativas**, e vale para quem mandar `/vincular`
    primeiro; o bot é público. **Correção:** 10 ou mais caracteres aleatórios, guardado com hash em `UsuarioRise`; 5
    tentativas erradas num chat silenciam o chat e anulam o código; o vínculo só vale depois de o dono **confirmar na
    tela** o nome e o @ de quem pediu; `telegramChatId` único; a linha do Telegram só aparece para Administrador.
15. **C1 "só avisos, sem polling" × botões:** `/vincular`, Assumir, Bloquear, Liberar e Aprovar exigem receber updates,
    o que só existe no C2, e B (antes do C2) conta com o aviso de 30 min com Assumir e com Bloquear/Liberar.
    **Correção:** na B os avisos levam só o botão de link "Abrir no Rise"; os botões de ação chegam com o C2; o vínculo
    em C1 é uma leitura curta do `getUpdates` durante os 10 min do código.
16. **Token mascarado "em todo log"** precisa valer também em `LogIntegracao.endpoint` e em `Conexao.ultimoErro` (que
    vai para a tela), porque o token vai na URL (`/bot<token>/...`).

## E. Acessos: catálogo, delegação e auditoria (os dois revisores)

17. **"Configurações do Rise IA" é um recurso só, delegável**: liberar à Andrea o "Loja fechada hoje" entrega junto QR,
    Desconectar, token do Telegram, o prompt que fala com todos os clientes, orçamentos, limites e internet. Encerrar,
    nota interna, Bloquear/Liberar e ligar a internet não têm recurso. **Correção:** recursos por aba e por ação no
    catálogo (nível `executar`); WhatsApp, Telegram e o prompt do cliente **não delegáveis**, como "Usuários e funções";
    `AuditoriaDeAcesso` (antes e depois, sem segredo) para QR, Desconectar, token, bot, internet, orçamentos e limites;
    popup no Desconectar (exige o celular da loja para voltar) e na troca de token.
18. **Internet** aparece "por canal" em §10, "um interruptor só" na decisão 11 e ligável pelo bot em §7. **Correção:** um
    campo só em `ConfiguracaoIA.dados`.
19. **Quebra-vidro × Ativo:** quem está em `RISE_AI_ADMINS` continua administrador com "Ativo" desligado, sem a função ou
    excluído; a tela e o "Ver como" mostram o contrário; a semeadura na partida devolve a função tirada e recria a
    Atendimento excluída. **Correção:** o login da variável aparece com o selo "Administrador pelo .env", com Ativo,
    Excluir e remover função desabilitados (`title`: "tire o login de `RISE_AI_ADMINS` na VPS"); a semeadura **só cria o
    que falta**, e a Atendimento uma vez só, com marca gravada.
20. **Excluir usuário:** libera o login (as conversas do Rise estão ligadas pela string `usuario` e passariam a quem
    receber o mesmo login no Tinyauth) e não pede o destino das conversas do WhatsApp. **Correção recomendada:** **não
    existe Excluir**; só Desativar (inativo = não cadastrado em todo lugar, o login fica reservado, o histórico e as
    conversas continuam coerentes). Alternativa: Excluir passa pelo mesmo popup de destino e o login fica reservado.
21. **Tabela de estados incompleta:** IA→HUMANO por "cliente pede pessoa", "dois erros" ou "pagamento" e "Andrea
    respondeu do celular" não dizem quem fica em `donaUsuarioId`; o popup de desativar oferece "Aguardando retorno", mas
    HUMANO→AGUARDANDO_RETORNO não está na tabela. **Correção:** "HUMANO sem atendente" (`donaUsuarioId` nulo = fila
    "Esperando pessoa"; a resposta do celular cai aí) e HUMANO→AGUARDANDO_RETORNO por botão.
22. **Segredo de borda** é conferido só no `proxy.js`, mas `sessao.js`, o layout e `usuarioDaSessao` leem o `Remote-User`
    cru; "sem segredo = sem login" cai, no código de hoje, no usuário `desconhecido`. **Correção:** conferir o segredo
    (`timingSafeEqual`) também em `acessos/sessao.js`, proxy sem `matcher` restritivo, e `pc` e `desconhecido` como logins
    reservados que a tela recusa cadastrar.

## F. Teste-guarda, invólucro e rotas por id (os dois revisores)

23. **Layouts fora do guarda:** ele percorre `page.jsx`, `route.js` e `"use server"`, não `layout.jsx` nem
    `generateMetadata`; o `rise-ai/layout.jsx` já lê as conversas sem conferência e vai calcular a contagem da caixa.
    **Rotas por id** (`/api/rise-ai/parar`, anexo por `mensagemId`, diferenças a cada 5 s) passariam no guarda só por
    chamar `exigirAcesso`, sem a regra de dono: parar a resposta de outra pessoa, baixar anexo alheio, pedir as
    diferenças desde uma data antiga. **Correção:** o guarda inclui layouts e metadados; toda rota por id passa por uma
    função única "conversa visível para esta sessão" (dona no canal RISE; permissão de caixa no WHATSAPP); `Origin`
    conferido no `parar` (molde do `envioDoProprioRise`); diferenças com cursor dado pelo servidor e teto por resposta.
24. **"`exigirAdministrador` vira alias" não bate com o código:** hoje é uma conferência síncrona que lança, quem envolve
    as ações é `executarComoAdministrador(trabalho)` sem recurso, e o guarda só lê `revisao/acoes.js` e
    `configuracoes/acoes.js` (não cobre `rise-ai/acoes.js` nem `/api/rise-ai/conversar`). **Correção:** cada ação do
    Rise IA passa a `executarComAcesso(recurso, nivel, trabalho)` com o recurso dela, e o guarda do lançamento 1 exige
    esse invólucro em todo `src/app/rise-ai/` e `src/app/api/rise-ai/`.

## G. Processo filho da extração de anexos (segurança)

25. **O filho herda o ambiente inteiro do serviço** (`DATABASE_URL` do superusuário, `ENCRYPTION_KEY`, chaves de API).
    Uma falha em pdf.js, exceljs, libvips ou no leitor de DOCX, explorada por um arquivo forjado mandado pelo WhatsApp,
    entrega os tokens e os dados de clientes; o isolamento descrito só limita memória e tempo. **Correção:** o filho
    nasce com `env` vazio (só o limite de memória), sem conexão ao banco, recebe os bytes por stdin e devolve só texto
    por stdout; um teste confere que o ambiente está vazio dentro dele. Na Entrega A (antes do `ia` existir) o filho é
    do `app`.

## H. Chat fluido e dado sensível (os dois revisores)

26. **A separação cliente/equipe era a única barreira entre custo e o texto copiado.** Como a Andrea vê custo (Acessos
    §7), uma resposta corrida que cite custo é copiada inteira para o cliente. Sem os marcadores, `separarResposta`
    marcaria `sem_separacao` em toda resposta nova (aviso na mensagem e coluna do Consumo), e as mensagens da Entrega 1
    trazem "### Para a equipe" cru no `conteudo`. **Correção:** "escreva a resposta para o cliente" roda com as
    **ferramentas do perfil cliente** (sem dado sensível, com o filtro de saída do WhatsApp); a Entrega A tira o aviso
    `sem_separacao` e a coluna; mensagem antiga é desenhada pelo `estruturado.respostaCliente`.
27. **👎 em conversa do WhatsApp e o analisador noturno** mandam o texto do cliente ao modelo, e a sugestão vira nota com
    um "Aprovar" à noite: "a 4hobby troca sem nota em até 1 ano" pode virar conhecimento público. **Correção:** sugestão
    nascida de conversa WHATSAPP leva o selo "veio de conversa com cliente", a conversa vai ao modelo marcada como dado
    de terceiro, e a nota nasce **interna**, com "tornar público" como passo separado.

## I. Ordem, lançamentos e navegação (código)

28. **A ordem confirmada não tem os lançamentos 2 e 3 de Acessos.** É o L2 que dá login à Andrea; sem ele a caixa de
    entrada (B) e o chat dela ficam sem pré-requisito. **Correção:** ordem passa a Entrega 1 → Acessos L1 → A → C1 →
    **Acessos L2** → B → C2 → E → D; "Ver como" e a aba Histórico vão para o L2 (só o dono os usa antes).
29. **O L1 precisa dos sete dados sensíveis no catálogo**, com `pode()` usado pelas ferramentas do Rise IA, senão "se vê
    custo na tela, vê custo no chat" não tem como valer na A.
30. **"O padrão de fábrica muda para o GPT" não vale na VPS:** o Padrão salvo na tela (Anthropic, passo 3 do deploy)
    substitui o de fábrica inteiro (`padrao` não está em `GRUPOS`). **Correção:** a troca para o GPT é um passo de tela
    no roteiro da Entrega A.
31. **Caixa de entrada precisa de rotas próprias:** o layout do `/rise-ai` monta só as conversas de quem está logado;
    a conversa aberta na caixa não tem URL (e o "Abrir no Rise" do Telegram precisa de uma); `/rise-ai/<id>` recusa
    conversa cujo `usuario` não é o login (no WhatsApp é o JID); `ConversaIA.perfil` nasce `ADMIN` pelo `@default`.
    **Correção:** grupo de rotas com layout próprio (`/rise-ai/caixa-de-entrada/<conversaId>`); conversa de WhatsApp lida
    por permissão, não por `usuario`; `perfil` deriva do `canal`, sem padrão no schema; o par "Minhas conversas · Caixa
    de entrada" só aparece a partir da B.
32. **PC de desenvolvimento:** no Next 16 página, layout e Server Action só veem `headers()`, sem socket para conferir o
    loopback; e o layout raiz passaria a ler o banco, então com o banco do PC fora do ar nenhuma página abre, inclusive
    Integrações › Servidor VPS, que existe para trazer o banco da VPS. **Correção:** no PC a garantia é o script `dev` com
    `--hostname 127.0.0.1` mais o ambiente declarado; com o banco fora do ar, o PC entra como "pc" sem menu filtrado, só
    para Integrações.
33. **Menu e Padrão visual:** com Integrações fora de `blocos.js`, `/integracoes` não acende item nenhum;
    `/rise-ai/configuracoes` acende "Rise AI", mora no trilho e não usa `PageHeader` (sem lugar para a seta de §5.8); a
    matriz repete grupos que já são blocos (Painel × "Cartões do Painel", Rise AI × "Rise IA") e escreve "Rise IA" onde
    as telas escrevem "Rise AI"; as abas "no desenho da Revisão" são pílulas, não as abas do cadastro de Produto
    (`border-b-2`, ativa em `border-acento`) que o padrão manda. **Correção:** Configurações ganha rotas extras para o
    `ehRotaAtiva`; a seta de voltar da tela do Rise AI sai (o link "Configurações" do trilho já leva lá); cada bloco de
    `blocos.js` é um grupo só, com os recursos dele dentro; o nome fica "Rise AI"; as abas seguem as do Produto.

## Conferido e ok (os dois)

"Ver como" (só Administrador, do que está salvo, sem trocar sessão); 404 para tela e 403 sem corpo em `/api/*`;
Histórico só para Administrador; `RISE_SIMULAR_LOGIN` ignorada com `RISE_PRODUCAO` (vale o deploy recusar um `.env` que a
contenha); PC administrador só pelo loopback, sem serviço `ia` no PC, `copia:atualizar` apagando TELEGRAM/EVOLUTION/OPENAI;
título da aba só com a contagem; consulta de diferenças relendo permissões e pausada com a aba oculta; chips de anexo
(rota com login, `attachment` + `nosniff`, imagem reencodada); link "Abrir o produto" montado pelo código; renderizador
seguro do chat; contadores por contato serializados pela fila; filtro barato; frase fixa uma vez por dia; popup de
destino ao desativar; token do Telegram só de escrita e cifrado; CSRF das Server Actions e da rota de anexos; mensagem
de ação recusada sem dado; botões do Telegram com nonce e prazo; QR some em 60 s; resumo do dia só com números. No
código: 158 ações, 9 rotas e 37 páginas batem; `sessao.js` puro; `ehRotaAtiva` por prefixo; `/rise-ai/caixa-de-entrada`
não colide com `[conversaId]`; `CartaoDeAtalho`, `PageHeader`, `Badge`, `EmptyState`, `BolhaDeAjuda`, `CampoBusca`,
`CartaoConector`, `Janela` (`propsDoFundo`) e as abas montadas-e-escondidas existem como as specs os citam; nomes das
abas do Produto batem; `ConfiguracaoIA` comporta os grupos novos; `Conexao.servico` único; `ConversaIA.usuario`,
`MensagemIA.papel`, `avisos` e `estruturado` existem; `ConhecimentoIA.visibilidade` já é o interno/público; a rota
`conversar` confere `Origin` com `envioDoProprioRise`; os nomes `teste:*` seguem o padrão.

## Decisões (aprovadas pelo dono, "Opção 1")

Tudo acima entrou nas specs. Os pontos que mudam uma decisão anterior dele ou têm custo próprio:
(a) **Excluir usuário sai; só Desativar** (item 20); (b) **tetos novos contra bot**: R$ 7 por dia no canal e R$ 0,50 por
contato nas primeiras 24 h, e o 16.º contato da hora não vira suspeito (itens 6 e 7); (c) **Acessos L2 entra na ordem
antes da B** (item 28); (d) **na B os avisos do Telegram só têm o link "Abrir no Rise"**; os botões Assumir, Bloquear e
Liberar chegam com o C2 (item 15); (e) **a revisão da IA é aplicada nos campos do formulário e gravada pelo Salvar
normal**, que marca Conferido na mesma transação (item 1); (f) **"escreva para o cliente" usa o perfil cliente**, sem
custo e fornecedor, mesmo para quem vê custo no chat (item 26); (g) **WhatsApp, Telegram e o prompt do cliente não são
delegáveis** (item 17).
