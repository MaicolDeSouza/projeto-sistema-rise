# Rise IA, Entrega A1: decisões e revisão final (13/10/2026)

Plano: `2026-10-13-rise-ia-entrega-a1.md` (18 tarefas, executado inline na `main`, sem subagentes, commits de `c1e1ef6` (T1) a
`d95b79f` (T17), mais o deste documento). Spec: `docs/superpowers/specs/2026-10-12-rise-ia-agente-design.md`. **Pronto e testado, SEM
DEPLOY.** Cada linha abaixo diz o que o plano deixava em aberto, o que ficou decidido e **o que custa se estiver errado**.

## Contagens finais (13/10/2026)

| Teste | Antes do plano | Agora |
| --- | --- | --- |
| `npm run teste:rise-ai` | 383 | **623** (saíram as de `separarResposta` e `sem_separacao`; entraram os blocos de banco, configuração, OpenAI, cotação, orçamento, laço com orçamento, perfil cliente, Parar, texto seguro, barra da resposta, chat, internet, abas e consumo) |
| `npm run teste:acessos` | 124 | **132** |
| `npm run teste:cotacao` | 86 | 86 |
| `npm run teste:extracao` | 664 | 664 |
| `npm run teste:imagens` | 429 | 461 (a diferença é de outra sessão: o plano não mexe nesse arquivo) |

`npm run lint` limpo. Nenhuma chamada paga em teste (provedores e SDK falsos).

## Fatos conferidos e preços

- **GPT-4.1 mini** (conferido em 13/10/2026 em developers.openai.com/api/docs/models/gpt-4.1-mini): entrada US$ 0,40, saída US$ 1,60,
  cache lido US$ 0,10 por milhão (peso 0,25 da entrada, `pesoDoCacheLido`). Se a OpenAI mudar o preço, é uma linha em `modelos.js`.
- **Adaptador da OpenAI:** `max_completion_tokens` (e não `max_tokens`) e sem `temperature`, porque os modelos novos recusam os dois.
- **Pesquisa na internet:** `claude-haiku-5-5` com a ferramenta `web_search_20250305` (a versão básica, com `max_uses: 3`), e
  `claude-sonnet-5-5` se a API devolver HTTP 400 ou 404 (modelo que não aceita a ferramenta, ou a busca desligada na conta). **Nunca
  `web_fetch`.** US$ 0,01 por busca (a spec fala em US$ 10 por mil), mais os tokens do resumo pela tabela do modelo. A versão
  `web_search_20260209` é a dos Opus 5 em diante e não foi usada. **Nenhuma chamada real foi feita:** só o SDK falso.
- **Cotação:** o PTAX do dia (`garantirCotacaoDoDia`, nunca lança) com a fixa de R$ 6,00 como reserva. O Banco Central responde 403
  a partir da VPS quando o pedido leva `$select`; por isso o pedido não usa `$select` (mesmo defeito já visto na tela de cotação).

## Decisões que o plano não fechava

1. **Reserva da pesquisa:** o pior caso é o Sonnet com 30.000 tokens de entrada e 6.000 de saída mais 3 buscas a US$ 0,01 (o Sonnet
   entra se o Haiku recusar a ferramenta, e o laço de continuação pode somar rodadas). *Se estiver alto:* o teto fecha um pouco antes
   do gasto real (a reserva é devolvida ao fim de cada pesquisa).
2. **Erro de rede ou de limite não troca de modelo** na pesquisa: só 400 e 404. *Se estiver errado:* uma falha passageira com o
   Haiku vira mensagem de erro em vez de ir para o Sonnet (mais caro).
3. **Gasto do mês** = `MensagemIA.custoBrl` (respostas do chat) + `GastoIA` (pesquisa, transcrição, embeddings); a reserva é uma linha
   de `ReservaDeGastoIA` que vale 10 minutos. Mês de São Paulo. Modelo local, modelo sem preço e provedor desconhecido estimam R$ 0 e
   as respostas de API sem preço aparecem em "N respostas sem preço cadastrado não entram na conta". *Se estiver errado:* um modelo
   novo sem preço gasta sem a barra subir até o preço ser cadastrado (a tela avisa).
4. **Modo cliente = perfil `publico`** (o `PerfilIA.PUBLICO` do banco segue sem uso): `consultarEstoque` só existe para a equipe; a
   peça de kit que não está publicada some do resultado; o histórico do modo cliente leva só as mensagens do USUÁRIO (nunca as
   respostas da IA, que podem ter custo e fornecedor). *Se estiver errado:* o texto copiado para o cliente poderia vazar dado
   interno; o teste que percorre toda ferramenta pública proíbe custo, localização, fornecedores, concorrentes, `urlRise`, saldo
   do Bling e margem.
5. **A mensagem nova guarda o texto inteiro do modelo no `conteudo`** (sem os dois títulos). As da Entrega 1, com "### Para a equipe"
   cru, aparecem pelo `estruturado.respostaCliente`. `separarResposta`, o aviso `sem_separacao` e a coluna dele no Consumo saíram.
6. **Parar:** motivo `interrompida` (não aciona a reserva), texto parcial gravado com o selo, custo **estimado por caracteres** e
   marcado `estruturado.custoEstimado`. O registro das respostas em andamento é **em memória do processo** (o `app` é um processo só
   até a Entrega B). *Se um dia houver dois processos:* o Parar de uma resposta que roda no outro não a alcança.
7. **O prompt das respostas ao cliente é exclusivo do Administrador** (`riseAi.configuracoes.promptCliente`, não delegável). Quem só
   pode editar a aba Atendimento altera o prompt do chat interno.
8. **O formulário usa o nome `promptCliente`** (mapeado para `promptAtendimento` só dentro de `salvarAba`) para não mexer em
   `parcialDaConfiguracao` e nos testes dela. **Salvar os mesmos valores não gera auditoria nem versão nova.** *Se estiver errado:*
   há menos linhas na trilha.
9. **Versões dos prompts:** guarda-se o texto que passa a valer (o do código quando se volta ao padrão), as 20 mais recentes por
   canal; "versão anterior" é a penúltima. Um prompt salvo antes de existir o histórico não tem versão anterior.
10. **O botão Salvar de cada aba só acende com alteração** e a troca de aba com alteração não salva pergunta (Cancelar / Sair; Sair
    descarta e remonta a aba com o que está salvo).
11. **Funções de Acessos que já tinham `riseAi.configuracoes` não ganham as abas sozinhas:** cada aba é um recurso novo. Hoje só o
    Administrador tem Configurações, então nada muda; uma função futura precisa receber as abas na matriz.
12. **Testes que mexem em dinheiro usam meses falsos de 2025** e `dependencias.agoraDoOrcamento`; o teste do laço da pesquisa deixava
    um `GastoIA` de mentira por rodada (a referência é o id da conversa, sem o prefixo `ZZ-IA-`) e inflava o orçamento interno do dono
    em R$ 0,12 por rodada. **Corrigido:** `limpar()` agora apaga pelo id das conversas de teste, e as 10 linhas exatas do teste (BUSCA
    haiku, US$ 0,02015 e R$ 0,1209) saíram do banco do PC. Conferido: zero `GastoIA` e zero reserva depois de uma rodada de testes.

## Revisão final (inline, feita pelo autor: mais fraca que um revisor novo)

Li `orcamento.js`, o laço de `conversa.js`, `paradas.js` e a rota `parar`, `textoSeguro.js`, `ferramentas/internet.js` e as ações das
abas contra as restrições globais e o "Foco da revisão" do plano. Os cinco pontos do foco têm teste: Parar sem resposta, de outra
pessoa e depois de terminar; orçamento com dois pedidos no limite, estouro no meio do laço, modelo sem preço, modelo local com teto
zerado e virada do mês; texto com HTML, imagem, `javascript:` e link que mente o domínio; o histórico do modo cliente; as mensagens
da Entrega 1 e o salvar de uma aba sem apagar as outras. Nenhum defeito Crítico ou Importante achado.

**Menores adiados (nenhum perde dado nem passa do teto):**

- **Parar no meio de uma pesquisa** corta a chamada e o que a Anthropic já cobrou das buscas feitas não entra no `GastoIA` (a reserva é
  devolvida). Sub-contagem de centavos, só nesse caso.
- `gravarConfiguracao` lê a configuração antes da transação: dois administradores salvando abas diferentes no mesmo instante podem
  perder um dos dois salvamentos (o JSON é uma linha só). Já era assim; o uso é de uma pessoa.
- Um prompt editado antes de existir o histórico não aparece como "versão anterior" no primeiro salvamento depois dele.
- O gasto da pesquisa não entra no custo mostrado na mensagem (aparece em "Outros" no Consumo): decisão da spec, que separa respostas
  de gastos avulsos.

## O que NÃO foi visto num servidor real

- **A primeira pesquisa na internet** (a API da Anthropic de verdade) e se o Haiku 5.5 aceita a ferramenta básica ou cai no Sonnet.
- **O GPT-4.1 mini de verdade** (a chave da OpenAI do dono existe no PC; falta cadastrá-la na VPS, o banco é outro).
- **O Parar contra o Caddy em produção** (a conexão do SSE passa por ele).
- **As abas simulando a `andrea`** (`RISE_SIMULAR_LOGIN`): exige reiniciar o servidor da porta 3000, que é de outra conversa. O 404 sem
  o recurso e o travamento dos campos por `fieldset` estão cobertos por teste de código e por conferência do DOM; como administrador
  tudo foi visto no navegador a 1366 px.
- **O teto em R$ 0,01 e o campo de texto desabilitado no chat** (roteiro do dono, passo 7): coberto por teste de laço, não visto na tela.
