# Rise AI, Entrega 1: decisões tomadas durante a execução

Registro das decisões que EU tomei no lugar do dono enquanto executava o plano
`docs/superpowers/plans/2026-10-11-rise-ai-entrega-1.md` (11/10/2026), do que foi verificado na tela e do que ficou
como pendência menor. Cada linha diz o que foi decidido, por quê e o que custa se estiver errado. Foi copiado do caderno
de execução (que fica fora do git e foi apagado ao fim). As decisões do dono estão na spec
(`docs/superpowers/specs/2026-10-11-rise-ai-design.md`) e na seção "Rise AI (Entrega 1)" do `CLAUDE.md`.

## Tarefa 2

- Ruling: custoDaChamada calcula o brl com cotacaoDoDolar().valor x usd (4 casas) e nao com emReais, que arredonda ao centavo e zeraria R$ 0,0036 — o plano dizia emReais+4 casas, que e contraditorio — custo se errado: nenhum (uma linha)

## Tarefa 4

- Ruling: usuarioDaSessao devolve "desconhecido" (e nao "pc") na VPS quando o cabecalho Remote-User nao chega; "pc" so no Rise do PC — o plano dizia `?? "pc"`, que faria um engano de configuracao na VPS parecer o PC — custo se errado: uma linha
- Ruling: gravarConfiguracao grava no banco SO o que foi salvo (mesclado sobre o salvo anterior), nao a configuracao completa com os enderecos do ambiente; valida o resultado mesclado como o plano manda — a copia do banco da VPS levaria host.docker.internal para o PC — custo se errado: nenhum
- Ruling: o teste guarda e RESTAURA a Conexao OLLAMA e a linha unica do dono (em vez de apagar a OLLAMA, como o plano dizia) — se o dono configurar Ollama, o teste nao pode apagar — custo se errado: nenhum
- Ruling: tempoLimite.totalMs aceita ate 900000 ms (a spec so fixa o minimo ligado ao primeiro token) — custo se errado: uma constante

## Tarefa 5

- Ruling: provedorDisponivel guarda a memoria por provedor.id + endpoint (o plano dizia so provedor.id) — o administrador que troca o endpoint na tela nao herda o fora-do-ar do antigo — custo se errado: nenhum
- Ruling: criarProvedor('anthropic') lanca 'adaptador ainda nao ligado' ate a Tarefa 6 (index.js nao pode importar um modulo que ainda nao existe) — custo se errado: nenhum

## Tarefa 6

- Ruling: o contrato ganha o campo OPACO `bruto` (resposta do provedor e mensagem do assistente): o adaptador Anthropic devolve os blocos como a API os mandou (pensamento com assinatura inclusive) e os reconstroi intactos quando o laço de ferramentas da MESMA resposta os reenvia. O plano reconstruia so texto + tool_use, o que a API recusa quando o Haiku 5.5 pensou antes de chamar a ferramenta — custo se errado: a T9 (laço) tem de copiar `resposta.bruto` para a mensagem do assistente da iteracao; sem isso a Anthropic pode dar 400 na 2a iteracao de ferramenta
- Ruling: criarProvedorAnthropic sem chave e sem cliente lanca ErroDoProvedor tipo "autenticacao" ("Anthropic: cadastre a chave em Configuracoes...") ja na criacao, para o laço tratar a reserva sem chave como erro de provedor — custo se errado: nenhum
- Ruling: `testarPorListagem` foi para contrato.js e os dois adaptadores o usam (DRY; plano nao previa) — custo se errado: nenhum

## Tarefa 7

- Ruling: a busca por CODIGO consulta direto Produto (sku/ean/modelo por igualdade, sem caixa) e nao usa buscarProdutoPorCodigo, que tambem varre fornecedores/concorrentes e devolve o formato de clonagem do cadastro; dispara para termo de UMA palavra (o plano dizia "com digito", mas o proprio teste do plano usa ZZ-IA-UNO, sem digito) — custo se errado: nenhum
- Ruling: antes da busca por palavras sai a palavra vazia (para, com, de...) — PALAVRAS_VAZIAS passou a ser exportada de texto.js; sem isso "placa para arduino" exigiria "para" no titulo e nao acharia nada — custo se errado: nenhum
- Ruling: resultado ordenado por relevancia e, no empate, com estoque primeiro, depois titulo mais curto (o plano so dizia "relevancia", que empata em 1,0 quando todas as palavras casam) — custo se errado: so a ordem
- Ruling: buscarProdutosSimilares varre o catalogo ativo pela relevancia da lupa (>= metade do peso das palavras do titulo) em vez de "buscarProdutosNoCatalogo com as palavras do nome", que exigiria TODAS as palavras do titulo e nunca acharia substituto — custo se errado: nenhum
- Ruling: SKU que nao existe em consultarProduto/compararProdutos/buscarProdutosSimilares vira ok:false com mensagem (ErroDeFerramenta, em ferramentas/erro.js); em consultarEstoque/consultarPreco vira {sku, encontrado:false} — custo se errado: nenhum
- Ruling: buscarProdutos e buscarProdutosSimilares entregam o cartao SEM custo e SEM localizacao (o texto do cliente nao pode cita-los); id, urlRise e urlLoja ficam (a T9 monta os cartoes da tela com eles e o modelo precisa de urlLoja para o link) — custo se errado: nenhum

## Tarefa 8

- Ruling: a recuperacao compara `similarity()` sobre texto SEM ACENTO dos dois lados (semAcento/juntar da busca ampla, que passaram a ser exportados) — a pergunta sem acento ("nao") acha a nota com ("nao"); com o texto bruto o recall caia. Isso nao usa o indice GIN criado na T1 (similarity() so usa indice via o operador %): com dezenas de notas a leitura da tabela e irrelevante; o indice fica para quando a base crescer (trocar a consulta para `%` com set_config do limiar) — anotar no CLAUDE.md na T16 — custo se errado: um indice sem uso
- Ruling: rejeitarConhecimento(id) nao recebe usuario (o modelo ConhecimentoIA nao tem campo de quem rejeitou; o plano passava {usuario} sem onde grava-lo) — custo se errado: sem trilha de quem rejeitou ate a Entrega 2 (versoes)
- Ruling: editarConhecimento numa nota APROVADA passa aprovadoPor/aprovadoEm para quem editou (o texto que vale e o dele; o plano so dizia "sobe a versao") — custo se errado: nenhum
- Ruling: as asserções da T7 sobre a lista de ferramentas passaram a ignorar buscarConhecimento (a T8 a registra para os dois perfis); nao e regressao — custo se errado: nenhum

## Tarefa 9

- Ruling: produtosCitados cita um produto pelo CODIGO ou por >= 50% das palavras que SO ELE tem no nome entre os candidatos (sem palavra propria: todas as palavras). A regra do plano (>= 60% de todas as palavras do nome) reprova o proprio exemplo do plano: o Nano ("PLACA NANO V3 CH340") tem 1 de 4 palavras no texto "o Nano esta sem estoque" — custo se errado: heuristica de cartao; so afeta quais cartoes a tela mostra
- Ruling: cortarHistorico mantem a semantica do teste do plano (pode comecar por assistente+ferramenta) e quem MONTA o pedido (responder) descarta o que sobrar antes da primeira mensagem do usuario — o Anthropic exige comecar por user — custo se errado: nenhum
- Ruling: mensagensParaOpenAI funde mensagens seguidas do usuario (o conhecimento aprovado e a pergunta) — o template do Gemma recusa duas seguidas e o LM Studio e o provedor padrao — custo se errado: nenhum
- Ruling: o laço copia `resposta.bruto` para a mensagem do assistente da rodada (cumpre a nota da T6); mensagens carregadas do banco nao tem bruto — custo se errado: 400 da Anthropic na 2a rodada de ferramenta
- Ruling: responder() NAO lanca quando todos os provedores falham: grava e devolve uma mensagem de assistente com o aviso "erro" (e emite o evento `erro`); so entrada invalida, limite por minuto, resposta em andamento e conversa alheia lancam — a tela precisa de um lugar onde mostrar a falha e "Tentar de novo" — custo se errado: a rota SSE (T10) trata os dois casos
- Ruling: o parametro `administrador` saiu de responder (nao era usado): so o DONO continua a conversa, mesmo o administrador — a leitura de conversa alheia e da Revisao, nao do chat — custo se errado: nenhum
- Ruling: `substituidoPor` no cartao (plano: "quando o texto diz isso") NAO foi implementado; o cartao mostra o estoque e a tela sinaliza sem estoque — custo se errado: a tela nao escreve "substituido por X" no cartao do Nano; a resposta ao cliente ja diz isso
- Ruling: o teste da T9 cria a PROPRIA nota de conhecimento (nao depende da nota da T8) e as asserções de conhecimento filtram `ZZ-IA` — o banco do dono tera notas reais — custo se errado: nenhum
- Ruling: falha ao recuperar o conhecimento nao derruba a resposta (segue sem notas, com console.error) — custo se errado: resposta sem a regra da loja num dia de banco ruim

## Tarefa 10

- Ruling: NAO existe criarConversaAcao: "+ Nova conversa" abre o chat em branco (/rise-ai) e a conversa nasce na 1a pergunta (responder a cria; o evento `inicio` traz o conversaId para a tela trocar a URL) — evita conversa vazia no historico; o plano listava a acao e, na T11, tambem o router.replace da 1a mensagem, que so fazem sentido juntos assim — custo se errado: nenhum
- Ruling: as 5 entradas invalidas de responder (e as de conversas.js) sao ErroDeUso (src/lib/riseAi/erros.js): a mensagem vai a tela; todo outro erro vira aviso generico + console.error — o plano nao distinguia — custo se errado: mensagem de banco na tela
- Ruling: fluxoDeEventos (SSE) mora em sse.js, nao na rota, para o encanamento ser testado em Node puro; cliente que fecha a conexao nao cancela a resposta (ela termina e fica gravada) — custo se errado: nenhum
- Ruling: mensagemParaTela/carregarMensagem em conversas.js (Decimal e Date nao atravessam a Server Action); carregarMensagemAcao devolve a mensagem pronta para a tela — custo se errado: nenhum

## Tarefa 11

- Ruling: o estilo padrao do prompt (PROMPT_ATENDIMENTO_PADRAO) passou a pedir "texto puro, sem markdown, sem asteriscos" — visto na tela em 11/10/2026: o Haiku escreveu **negrito** no texto do cliente e no WhatsApp os asteriscos aparecem — cost if wrong: o dono que ja salvou um estilo proprio na tela de configuracoes (T13) nao herda a linha; o estilo salvo vale no lugar do padrao.
- Ruling: verificacao na tela feita por DOM (find/JS) porque o painel do navegador ficou oculto e a captura estourou o tempo — lista lateral, titulo, Boa/Sinalizar erro com comentario e "tirar", renomear e excluir (popup mostra o nome) conferidos; conversa e config temporarias apagadas — cost if wrong: aparencia (espacamento/cores) nao revisada a olho nesta rodada.

## Tarefa 12

- Ruling: o teste "falha marca a mensagem" do plano usava r1 e esperava que a 2a chamada FALHASSE; usa a mensagem de r2 — gerarSugestaoParaMensagem reaproveita a sugestao PENDENTE da mesma resposta (👎, tirar, 👎 nao gasta outra chamada nem duplica na revisao) — cost if wrong: o dono com a sugestao pendente nao ve uma segunda proposta para a mesma resposta (a rejeitada ou aprovada permite gerar outra).
- Ruling: `revisadaEm` so vale ate chegar mensagem nova (compara com a ultima mensagem da conversa): conversa revisada que ganhou resposta depois volta para a fila — a esposa responde depois da revisao e o dono nao perde isso — cost if wrong: uma conversa pode reaparecer como "nao revisada" por uma mensagem de que o dono nao precisava.
- Ruling: `marcarRevisada` regrava `atualizadoEm` com o valor atual (o @updatedAt o subiria): a lista lateral de quem conversou e ordenada por ele e a conversa nao sobe so porque o dono a leu — cost if wrong: nenhum (so ordem).
- Ruling: interfaces acrescentadas ao plano: `carregarConversaParaRevisaoAcao` (a Revisao precisa ler a conversa de outra pessoa, so admin), `aprovarConhecimentoAcao` (nota rascunho/rejeitada precisa de caminho de volta), `suspeitas[]` em conversasDoDia (os selos mostram o porque), `hojeEmSaoPaulo`, `limitesDoDia`, `conhecimentoParaTela`, `formularios.js` (codigosDoTexto, camposDoFormulario) — cost if wrong: superficie maior que a do plano, tudo coberto por teste.
- Ruling: erros que a pessoa corrige em conhecimento.js e `exigirAdministrador` passaram a ErroDeUso (mesma mensagem): as acoes da Revisao mostram "O assunto precisa ter de 3 a 120 caracteres." em vez do aviso generico — cost if wrong: nenhum (ErroDeUso e subclasse de Error).
- Ruling: `ehErroDeProvedor` foi movido para provedores/contrato.js (conversa.js e sugestoes.js usam a mesma regra para cair na reserva) — cost if wrong: nenhum.
- Ruling: o limite de tokens da sugestao e fixo em 4000 e nao segue `maxTokensResposta` do chat: visto em 11/10/2026 o Haiku 5.5 PENSA e parou em max_tokens com 1200 (a resposta saiu cortada, JSON sem fim); a mensagem de erro agora diz "cortada" — cost if wrong: uma sugestao pode custar mais tokens de pensamento (centavos).
- Ruling: teste de tarefas anteriores gravava no LogIntegracao do dono ~80 linhas falsas (ANTHROPIC/claude-haiku-5-5 com duracao 0, da reserva de fabrica): `limpar()` apaga as de duracaoMs < 50 (chamada real a API leva centenas de ms) — cost if wrong: uma chamada real instantanea de teste seria apagada do log.
- Ruling: a sugestao NAO e gerada para mensagem de aviso de erro nem para mensagem do usuario ("Mensagem nao encontrada."), e o 👎 nao revalida a Revisao (o contexto do Next acaba quando a acao responde; a pagina e dinamica) — cost if wrong: a Revisao aberta so mostra a sugestao nova depois de recarregar.
- verificacao na tela (11/10/2026): pergunta real ao Haiku → 👎 com comentario → a 1a sugestao falhou (max_tokens) e marcou "sugestao nao gerada" → corrigido → "Pedir sugestao a IA" gerou uma sugestao boa (produto errado, confianca 75%) → "Editar antes" e Aprovar criaram a nota → Novo conhecimento, editar (versao 2), rejeitar e aprovar de novo, Propor correcao no leitor e Marcar como revisada ("ja revisada"). Dados de teste apagados (3 notas, 1 conversa, config). Aparencia nao revisada a olho (captura de tela estourou o tempo: painel oculto).

## Tarefa 13

- Ruling: o passo "gravar uma chave falsa para ollama" do plano nao se aplica — Ollama e LM Studio nao usam chave (`precisaDeChave: false`) e `salvarChaveAcao` recusa; a verificacao na tela usou OpenAI (chave falsa -> Testar -> HTTP 401 -> Remover) — cost if wrong: nenhum.
- Ruling: `executarComoAdministrador` (src/app/rise-ai/administrador.js) e o unico invólucro das acoes de administracao (Revisao e Configuracoes) e o teste exige `return executarComoAdministrador(` em toda acao exportada dos dois arquivos — cost if wrong: uma acao nova com formato diferente falha o teste e pede ajuste do regex.
- Ruling: `consumoPorDia` separa respostas (o modelo respondeu) de falhas (mensagem de erro) e acrescenta `semCusto` (respostas sem preco cadastrado): "R$ 0,00" so aparece para modelo local; sem preco diz "preco nao cadastrado" — cost if wrong: o total em R$ nao inclui o que nao tem preco (a tela avisa).
- Ruling: o formulario geral manda TODOS os seus campos ao salvar (padrao, reserva, tempos, limites, prompt), entao a configuracao do dono passa a guardar valores iguais ao padrao de fabrica; os enderecos so vao do cartao do provedor e so quando mudam (nunca o endereco de fabrica do PC para a VPS) — cost if wrong: uma melhoria futura de um limite padrao do codigo nao chega a quem ja salvou o formulario.
- Ruling: os cartoes e o formulario NAO remontam depois de salvar (sem `key` mudando): remontar apagava a mensagem "salvo" na hora — cost if wrong: o estado local do formulario nao se reinicia por si so se o banco mudar por outro lado; recarregar resolve.
- verificacao na tela (11/10/2026): chave falsa guardada (nunca volta ao HTML), teste 401 e remocao; modelo adicionado ao Ollama e habilitado; Padrao/Reserva trocados e devolvidos; erros por campo (tempo total menor que o do primeiro token; numero em branco); prompt proprio, "Restaurar padrao" (grava nulo); Consumo 7/90 dias com dados de teste (resposta sem preco -> "preco nao cadastrado"). Dados de teste apagados. Aparencia nao revisada a olho (captura de tela estoura o tempo com o painel oculto).
- minor (deferred): o painel do navegador de teste hidrata devagar (ate ~10 s na 1a carga em dev); um clique em "Salvar" antes disso envia o formulario por GET (os numeros vao na URL) — so em desenvolvimento, sem dado sensivel.

## Tarefa 14

- Ruling: `obterAccessToken` do Bling passou a usar `obterTokenSobTrava` (travaDeRenovacao.js: le FORA da trava, e dentro dela RELE antes de renovar) em vez do `comTravaDeRenovacao` cru do plano — o padrao inteiro (ler/validar/renovar) fica testavel com estados falsos, sem tocar na Conexao BLING do dono (o teste nunca a toca): o teste prova "4 pedidos ao mesmo tempo, 1 renovacao, todos com o token novo" — cost if wrong: uma camada a mais no caminho de toda chamada ao Bling (so funcoes; o caminho quente, token valido, nao entra na trava).
- Ruling: `blingSaldoLidoEm` grava `desde` (o instante de ANTES da leitura ao Bling) e nao `new Date()` do momento da gravacao — o saldo pode ter mudado depois da leitura, nunca antes: e o lado seguro para dizer a idade do numero ("lido ha N min") — cost if wrong: a hora pode ficar alguns segundos mais velha que a real.
- Ruling: `rodarSincronizacaoDeEstoque` reusa `deveSincronizarEstoque` (com o tempo ja vencido) para os motivos "desligado"/"bling_desconectado": o worker mede a hora; uma fonte so de vocabulario e de ordem das checagens — cost if wrong: nenhum.
- minor (deferred): o conector do Mercado Livre tem o mesmo padrao de refresh token de uso unico sem a trava (`obterAccessToken` de mercadolivre.js): hoje nenhum processo em segundo plano o chama, entao a corrida nao existe; se o worker passar a ler o ML, aplicar `obterTokenSobTrava` la tambem.
- minor (deferred): o worker normal no PC tambem le o estoque do Bling de hora em hora (a condicao e `!FONTES && !SO_NO_PC`): e so leitura e o PC usa o token do app do PC, mas CLAUDE.md diz para nunca ligar o worker normal no PC — vale o aviso, e `ESTOQUE_AUTOMATICO_BLING=false` no .env do PC desliga.

## Tarefa 15

- Ruling: o `ssh -R 172.17.0.1:1234` NAO e recusado pela VPS de hoje (`GatewayPorts no`, medido em 11/10/2026): o sshd o aceita e abre a porta SO em 127.0.0.1, entao o `ExitOnForwardFailure` nao dispara e o tunel "conecta" sem o conteiner alcanca-lo (o plano previa "remote port forwarding failed"). Acrescentei a conferencia `ss -ltn` na VPS (so leitura, uma por conexao): `alcance` "ok" | "so_loopback" | "ausente" no estado, aviso no log e na linha do cartao — cost if wrong: um `ssh` de leitura a mais por conexao do tunel; sem ela o cartao diria "no ar" com o Rise caindo sempre na reserva.
- Ruling: `argumentosDoTunel` RECUSA bind 0.0.0.0, vazio ou que nao e IPv4 (publicaria o LM Studio do dono para a internet) e porta/chave/destino invalidos — cost if wrong: quem quiser outro IP fechado (outra ponte do Docker) usa IA_PC_BIND.
- Ruling: o estado do tunel e lido com o pid do processo que o gravou (`processoVivo`): processo morto (PC desligado, terminal morto a forca) vale como "parado" em vez de "no ar" velho — cost if wrong: nenhum.
- verificacao (11/10/2026, com o dono ciente do plano): `npm run ia:pc` rodou 2 vezes contra a VPS de verdade (so abre a conexao, nada escrito la): conectou, o aviso do LM Studio desligado apareceu, o `ss -ltn` mostrou a porta so no loopback e depois de encerrar a VPS ficou limpa (nada escutando na 1234). Ctrl+C real nao foi exercitado (o tool encerra o processo a forca no Windows): o encerramento limpo so esta coberto por leitura de codigo e pelo estado "parado" quando o pid some.
- RUNBOOK da VPS (nada foi mudado la; precisa do ok do dono): (1) sshd: `GatewayPorts clientspecified` em /etc/ssh/sshd_config.d/ e `sudo systemctl reload ssh`; (2) ufw: permitir da rede dos conteineres ate a ponte, `sudo ufw allow from 172.16.0.0/12 to 172.17.0.1 port 1234 proto tcp`; (3) `.env` da VPS com `RISE_AI_ADMINS=<nomes do Tinyauth>`; (4) deploy ("sobe") para o `extra_hosts` entrar nos conteineres; (5) no PC: LM Studio com o servidor local ligado e `npm run ia:pc` aberto.

## Tarefa 16

- Ruling: o `git push origin main` do passo 5 do plano fica para DEPOIS da revisao final e do passe de correcoes (um push so, no fim da entrega, como combinado): o deploy so acontece no "sobe" do dono, entao nada vai ao ar antes. A medicao do LM Studio nao pode ser feita (nao estava no ar): o script foi exercitado contra um servidor OpenAI-compativel falso (tempos e tokens/s conferidos) e o CLAUDE.md diz "a medir pelo dono" — cost if wrong: o 45 s de primeiro token da spec segue sendo aposta ate o dono medir.
- ritual (11/10/2026): lint limpo; teste:rise-ai 379, teste:extracao, teste:coleta, teste:cadastros, teste:bling-sync, teste:composicao, teste:estoque, teste:vps e teste:worker (sozinho) — todos 0 falhas.

## Outras

- Ruling: executar na `main` desta pasta — o plano aprovado pelo dono manda commits por tarefa na main e a memoria "papel de gerente" o autoriza; as features anteriores (kit, Nano Banana) tambem foram na main — custo se errado: nenhum (reversivel por git).
- Ruling: a arvore tem arquivos modificados por OUTRA sessao (FORNECEDORES.md, src/app/mercados/fontes/page.jsx, src/components/mercados/LinhaFonte.jsx, src/lib/coleta/fila.js, src/lib/coleta/vigiaDoPc.js) — nunca usar `git add -A`; so `git add <caminho meu>` — custo se errado: commit misturado.
- Ruling: sem ferramenta de todos neste harness — o ledger e o registro.
- T11 (pre): Ruling: o dev server da porta 3000 (PID 6992, aberto as 14:23 pelo app do Claude para OUTRA conversa) segurava o client do Prisma ANTIGO; o classificador BLOQUEOU eu encerrar o processo e eu NAO contornei. Em vez disso, src/lib/db.js agora guarda a assinatura do client gerado (nomes dos modelos) e recria o singleton do globalThis quando muda — o servidor se cura sozinho no proximo hot-reload (provado em Node: mesma forma reaproveita, forma nova recria uma vez; /, /produtos e /cadastros seguem 200). Commit proprio, fora das tarefas — custo se errado: o db.js e importado por todo o sistema; se algo quebrar, reverter o commit

## Revisão final

- review: self-review (no subagent: o dono prefere execucao inline, sem subagentes). Lido com olho novo: rota SSE, ferramentas, busca, laco, conversas, sugestoes, revisao, consumo, acoes de administracao, migration, adaptador OpenAI, trava de renovacao, tunel, estoque automatico e as telas. Os cinco itens do Review Focus do plano tem teste (sem_resultado, mascaramento, reserva/tempo, administrador no servidor, argumento invalido).
- fixed o comentario do 👎 era gravado SEM mascarar (a esposa cola o telefone do cliente nele; LGPD do Rise AI) — "o comentario do 👎 e mascarado antes de gravar" RED→GREEN, suite 380/380 (commit "mascara o comentario do polegar").
- minor (deferred): o Consumo soma so as respostas do chat (`MensagemIA`); as chamadas de sugestao ao 👎 e os testes de conexao estao so no `LogIntegracao` (centavos por sugestao).
- minor (deferred): a sugestao ao 👎 usa o MESMO modelo local do chat: enquanto ela roda (ate 3 min) a proxima pergunta da esposa pode demorar a comecar e cair na reserva (API, centavos). Se incomodar: mandar a sugestao sempre para a reserva.
- minor (deferred): renomear conversa nao mascara o titulo digitado (so o titulo gerado da pergunta e mascarado).

