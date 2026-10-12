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
