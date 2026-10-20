# Servidor MCP e o rumo do Rise AI: decisões e o que não foi visto (20/10/2026)

Plano: `2026-10-20-mcp-rise-e-rumo-do-rise-ai.md` (14 tarefas, executado inline na `main`, sem subagentes). As 7 dúvidas do plano
foram respondidas pelo dono com "todas opção 1" (mais: o MCP confere só os `dado.*`, não as telas). **Pronto e testado no PC, SEM
DEPLOY.** Cada linha abaixo diz o que o plano deixava em aberto, o que ficou decidido e **o que custa se estiver errado**.

## Contagens finais

| Teste | Antes do plano | Agora |
| --- | --- | --- |
| `npm run teste:mcp` | (não existia) | **127** |
| `npm run teste:rise-ai` | 623 | **616** (saíram a leitura do fluxo SSE da tela e os testes da aba Canais; entraram o orçamento só dos clientes e o Consumo com uma barra) |
| `npm run teste:acessos` | 139 | **143** (as rotas públicas do protocolo, o rótulo novo de `riseAi.chat`, o chat removido e sem import, a aba Canais fora do catálogo) |

`npm run lint` limpo nos arquivos do plano. Nenhuma chamada a provedor de IA em teste nem no `/mcp`.

## Decisões tomadas na execução

1. **A revisão 2026-07-28 do protocolo é um literal.** O SDK 2.3.1 não a exporta, e a `LATEST_PROTOCOL_VERSION` dele (2025-11-25) com
   o envelope novo dá 400 (medido). *Se errado:* uma versão nova do SDK que mude o nome da revisão quebra só o teste da sondagem.
2. **Modo de resposta "auto" do SDK**, não "json": o "auto" já devolve JSON quando a ferramenta não manda notificação, e o "json"
   imprime um aviso no console a cada handler. *Se errado:* um cliente que exija SSE recebe JSON (nenhum dos dois medidos exige).
3. **Renovar o token invalida também o acesso antigo** (não só a renovação usada). *Se errado:* uma consulta que já estava a caminho
   com o acesso antigo leva 401 e o cliente renova de novo (o Claude faz isso sozinho).
4. **Erro de banco no portão do `/mcp` é 503 com `Retry-After: 30`**, não 401. Um 401 faria o Claude pedir o login de novo por uma
   queda do Postgres. *Se errado:* o cliente tenta de novo em 30 s em vez de pedir login.
5. **Argumento que o zod do SDK recusa não vai para `ChamadaMcp`**: o SDK responde com `isError` antes de a ferramenta rodar, e é
   na ferramenta que o registro acontece. *Se errado:* a trilha não mostra as chamadas malformadas (elas não leram dado nenhum).
6. **`fluxo.js` (a leitura do fluxo SSE da tela) foi apagado junto com os testes dele.** Não sobrou tela que leia SSE; o
   `fluxoDeEventos` do servidor (`src/lib/riseAi/sse.js`) ficou com os testes dele. *Se errado:* o WhatsApp não usa SSE; se um dia
   uma tela voltar a ler o fluxo, o leitor está no histórico do git (antes de `ea7a6ae`).
7. **Os mínimos do guarda do `teste:rise-ai` baixaram** (`src/app/rise-ai/acoes.js` de 5 para 2 ações; telas de 7 para 5) e a pasta
   `src/app/api/rise-ai` saiu da varredura (não existe mais). *Se errado:* o guarda deixa de notar a falta de uma tela nova (as que
   existem continuam conferidas uma a uma).
8. **O `PopupExclusao` de Cadastros ganhou o rótulo opcional do botão** (padrão "Excluir") para o Desconectar reaproveitar o mesmo
   popup que nomeia o item. *Se errado:* nenhum dos três usos de Cadastros passa o rótulo, então nada mudou neles.
9. **A aba Atendimento das Configurações só aparece a quem pode o prompt do cliente** (hoje só o Administrador): sem o prompt
   interno, ela ficaria vazia para os outros. *Se errado:* alguém com o recurso da aba e sem o prompt não vê a aba (não havia o que
   editar nela).
10. **A capacidade `riseAi.configuracoes.canais` saiu do catálogo**; a permissão gravada com ela fica no banco sem efeito (a resolução
    e a matriz ignoram id desconhecido). O orçamento interno, a internet e o prompt interno continuam gravados e lidos por
    `responder`. *Se errado:* para religar a internet do chat é preciso voltar a aba (o valor gravado hoje é o que estava).
11. **No Consumo, o provedor `mcp` mostra "conta própria" no custo**, e não "no seu PC" (o selo verde de custo zero é o mesmo).
12. **A aba Conexões mostra "conectado em" = a criação da família** (a primeira troca do código) e **"vale até" = o fim da renovação
    viva** (30 dias desde a última renovação). Desconectar uma conexão de outro login, ou já desconectada, responde a mesma frase
    ("Conexão não encontrada."): a tela não diz se a conexão existe. *Se errado:* só texto.
13. **O cliente da conversa na Revisão** é o `modelo` da primeira resposta do dia (onde o `anotarDuvida` grava o nome do cliente).
14. **O commit misturado `79dc2a4`** (levou 13 arquivos que a sessão da Coleta tinha posto no índice) já estava público e não foi
    reescrito; a partir dali todo commit desta sessão vai com a lista de caminhos (`git commit -F msg -- <caminhos>`), e o `CLAUDE.md`
    entra só com os trechos desta sessão montados a partir do HEAD.

## O que NÃO foi visto num servidor real

- **A conexão de verdade do claude.ai e do ChatGPT** (o registro dinâmico vindo da nuvem deles, a tela Autorizar pelo Tinyauth, a
  troca do código e a renovação). No PC o fluxo inteiro foi exercitado à mão contra o servidor de desenvolvimento (registro 201,
  Autorizar com `code`/`state`/`iss`, token, `tools/call buscarProdutos` com o catálogo real, 401 com o desafio, GET 405).
- **O Caddy de produção** com o `@mcp`: só o Caddyfile foi conferido por teste (caminhos exatos, a tela Autorizar fora, o `@mcp` antes
  do login). O deploy valida o arquivo antes de trocar qualquer coisa.
- **As duas formas de retorno do ChatGPT** vêm da documentação; nenhuma conexão real foi feita.
- **Se o Claude chama `anotarDuvida` sozinho** depende de ele seguir as instruções do servidor. A garantia é o registro de toda chamada
  em `ChamadaMcp` (quem consultou o quê e quando), que não depende do modelo.
- **O `next build` com o SDK** não foi rodado (o servidor de desenvolvimento de outra sessão usa a mesma pasta `.next`); o deploy
  constrói a imagem antes de trocar os contêineres, e um erro de build para o deploy sem derrubar o site.

## Para pôr no ar

Só com o "sobe": push e o deploy pelo cartão "Atualizar a VPS". Ele leva também as migrations pendentes das outras frentes
(`20261012_produto_gasto_ia`, `20261013_rise_ia_entrega_a`, `20261019_proposta_de_produto`, `20261020_mcp_rise` e o que mais tiver
entrado), com backup antes. Antes da Andrea, os passos do dono: o usuário dela no Tinyauth, o usuário `andrea` no Rise com a função
Atendimento, e tirar da Atendimento custo, margem, concorrentes e financeiro.
