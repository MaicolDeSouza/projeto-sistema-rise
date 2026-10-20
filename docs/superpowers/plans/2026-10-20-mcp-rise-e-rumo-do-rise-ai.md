# Servidor MCP no Rise e o novo rumo do Rise AI: plano de implementação

> **Para quem executa:** plano inline (skill `superpowers:executing-plans`), tarefa a tarefa, **só quando o dono autorizar
> cada uma** (modo "lista de tarefas" combinado em 20/10/2026). Passos com `- [ ]`. TDD em toda tarefa: o teste primeiro,
> visto falhar, depois o código. Commit por tarefa, sem push até o ritual de fim de sessão.

**Objetivo:** o dono e a Andrea consultam o catálogo, preços, estoque e conhecimento do Rise pelo claude.ai (e, quando o plano
deles permitir, pelo ChatGPT), com o login de cada um e sem gastar API; cada chamada e cada dúvida ficam registradas para o
dono revisar e ensinar o Rise; o chat interno do Rise AI sai da tela, e o motor (`src/lib/riseAi/`) fica inteiro para o agente
do WhatsApp.

**Arquitetura:** uma rota `POST /mcp` no próprio app Next (Streamable HTTP, sem estado, `@modelcontextprotocol/server`
2.3.1) expõe as ferramentas que já existem em `src/lib/riseAi/ferramentas/` (só leitura) mais `anotarDuvida` (escrita só em
`ConversaIA`/`MensagemIA`, canal MCP). O Rise é o seu próprio servidor de autorização OAuth 2.1: registro dinâmico de
cliente, PKCE S256, código de uso único, token de acesso de 1 h e de renovação de 30 dias rotacionado, **todos guardados só
como hash**. A tela "Autorizar" fica atrás do Tinyauth; as rotas do protocolo ficam públicas no Caddy e protegidas pelo token.
Em cada chamada a sessão de Acessos do login do token é montada (perfil `admin` + `pode()`), e usuário inativo é negado na hora.

**Stack:** Next 16.3.8 (route handlers com `Request`/`Response` nativos), Prisma 7 + Postgres 17, zod ^4.4.3 (já no projeto),
`@modelcontextprotocol/server` **2.3.1** (fixo), `node:crypto`. Sem `mcp-handler`, sem Redis, sem TypeScript.

**Spec:** não há spec própria: a autoridade são as **anotações do dono de 16 a 20/10/2026** (reproduzidas na seção 1), as
decisões A1/B1/C1 dele (seção 3) e, para o que SAI, a spec do agente `docs/superpowers/specs/2026-10-12-rise-ia-agente-design.md`
(Entrega A, chat interno, e Entrega E, que foi abortada).

---

## 1. O pedido do dono (resumo fiel das anotações)

**Anotação 1, servidor MCP.** A Andrea consulta os dados do Rise pelo claude.ai, no navegador do PC dela, conta GRÁTIS, sem
instalar nada; sem custo de API (o `/mcp` NUNCA chama provedor de IA: quem raciocina é o Claude dela). Endereço
`https://rise.4hobby.com.br/mcp` (rota `/mcp`, não `/api/mcp`; `src/app/mcp/route.js`). Ferramentas só de leitura:
`buscarProdutos`, `consultarProduto`, `consultarEstoque`, `consultarPreco`, `compararProdutos`, `buscarProdutosSimilares`,
`buscarConhecimento` e a nova `anotarDuvida`. FORA: `pesquisarNaInternet` e qualquer escrita de dado. Login por OAuth com o
login do Rise de cada pessoa; tela "Autorizar Claude" (`/mcp/oauth/authorize`) ATRÁS do Tinyauth/Caddy; `/mcp`,
`/mcp/oauth/token`, `/mcp/oauth/register` e `/.well-known/*` públicos no Caddy e protegidos pelo token; token só como hash
no banco; em cada chamada montar a sessão de Acessos daquele login (perfil `admin` + `pode()`: a Andrea NÃO vê custo, margem,
fornecedores, concorrentes nem financeiro); usuário desativado = negado na hora; registrar cada chamada (quem, qual
ferramenta, quando). Quem chama é a nuvem da Anthropic. Plano grátis = um conector personalizado. **Antes de codar, conferir:**
as exigências atuais do claude.ai para conector com OAuth e a versão fixa do SDK, publicada há mais de 14 dias.

**Anotação 2, rumo do Rise AI.** "Basicamente vamos abortar o Rise AI dentro do Rise": ele e a esposa acessam os dados via MCP
pelo Claude (desktop ou web) ou ChatGPT; ele quer anotar as perguntas e os arquivos que a esposa mandar, para avaliar e melhorar
as respostas e alimentar o agente de atendimento pelo WhatsApp. Decisões: **A = Opção 1** (anotar por instrução ao modelo, com
o registro de toda chamada como garantia), **B = Opção 1** (arquivo entra só como texto extraído pelo modelo, nunca os bytes),
**C = Opção 1** (saem o chat interno, o orçamento interno de R$ 30, o interruptor Canais › internet e o prompt do chat interno;
ficam Modelos, Orçamento de clientes, Prompt do cliente, Revisão do dia, Conhecimento e Consumo; a lib fica inteira como
motor do WhatsApp; as dúvidas do MCP entram no lugar das conversas do chat). Modelos/Orçamento de clientes são a configuração
que o agente WhatsApp (Entrega B) vai usar.

**Anotação 3, produto/anúncio automático.** Sai do Rise: vai pelo Claude desktop via SSH, em outra sessão. A Entrega E da spec
do agente está abortada. **Não mexer** em `PropostaDeProduto`, na migration `20261019_proposta_de_produto` nem em
`scripts/preencher-produto.js` (são da outra sessão).

## 2. Avaliação: o que já existe contra o que foi pedido

| Pedido | O que existe hoje | O que falta |
| --- | --- | --- |
| Ferramentas só de leitura pelo MCP | `FERRAMENTAS` (7, produtos + conhecimento) com `executarFerramenta(nome, args, {perfil, usuario, pode})`: zod, perfil, `pode()` já restringem custo, localização, estoque exato, concorrentes (`cartaoDoProduto` com `RESTRITO`). A internet fica fora do catálogo por desenho. | Expor as 7 pelo protocolo MCP e somar `anotarDuvida`. Nada muda nas ferramentas. |
| Sessão de Acessos por login | `sessaoDeAcessos()` lê o login do `Remote-User` + segredo de borda (só na requisição com login). `montarSessao` resolve `pode` a partir de `UsuarioRise` com funções e exceções. | Montar a mesma sessão **a partir de um login vindo do token** (sem cabeçalho de borda): `permissoesDoLogin(login)`. |
| OAuth com o login do Rise | Nada: o OAuth que o Rise tem é como CLIENTE (Bling, ML). | O servidor de autorização inteiro (metadados, registro, authorize, token, PKCE, hashes, renovação, revogação). |
| Tela "Autorizar" atrás do login | Padrão das páginas: `exigirAcessoNaPagina` (404 sem o recurso) e Server Action com `executarComAcesso`. | A página e a ação. |
| Rotas públicas no Caddy | Só `GET/HEAD /api/arquivos/<SKU>/...` é público; o resto passa pelo `forward_auth`. | O matcher `@mcp` com os caminhos exatos do protocolo, sem o `authorize`. |
| Registrar cada chamada | `LogIntegracao` registra chamadas que o Rise FAZ; `AuditoriaDeAcesso` registra mudanças. Nenhuma registra chamadas RECEBIDAS. | Tabela `ChamadaMcp` (quem, cliente, ferramenta, argumentos mascarados, ok, duração, quando). |
| Anotar as dúvidas da Andrea | `ConversaIA`/`MensagemIA` guardam pergunta e resposta; a Revisão do dia lista as conversas do dia (qualquer usuário) com 👍/👎, "Propor correção" → sugestão → Conhecimento; `buscarConhecimento` devolve isso ao modelo. | Campo `canal` (CHAT/MCP), a ferramenta `anotarDuvida` que grava a dúvida como conversa do dia daquele login, e a Revisão mostrando de onde veio (chip "pelo Claude") e os anexos como texto. |
| Tirar o chat interno | Chat (`page.jsx`, `[conversaId]`, `Chat.jsx`, `ListaDeConversas`, rotas `conversar` e `parar`), orçamento interno nas abas e no Consumo, aba Canais, prompt interno na aba Atendimento. | Remover a interface; manter a lib (`responder`, `paradas`, `sse`, `orcamento` com os dois escopos, `prompts.interno`): o WhatsApp e o Telegram reutilizam. |
| Modelos/Orçamento de clientes para o WhatsApp | Configurações › Modelos e › Orçamentos (clientes R$ 70) já gravam em `ConfiguracaoIA`, com auditoria e versões de prompt. | Nada além de tirar o interno da tela. |
| Entrega E abortada | A spec do agente ainda a lista; `docs/superpowers/plans/2026-10-19-proposta-automatica-de-produto.md` é da outra sessão. | Nota na spec e no CLAUDE.md; nada de código. |

O plano citado na anotação 1 (`docs/superpowers/plans/2026-10-16-mcp-rise.md`) **não existe no repositório** (nem em branch, nem
solto): este documento o substitui.

## 3. Conferências externas feitas em 20/10/2026 (as que a anotação exige)

- **MCP, revisão 2026-07-28 (a vigente):** Streamable HTTP = um único endpoint `POST`; **sem sessões** (`Mcp-Session-Id` é
  ignorado; `GET` e `DELETE` respondem 405); cada POST leva `MCP-Protocol-Version` e `_meta.io.modelcontextprotocol/*`; resposta
  JSON ou SSE; o servidor valida `Origin` (e `Host`); `server/discover` é obrigatório; um servidor "de duas eras" atende também
  os clientes da revisão 2025-11-25 e anteriores (`initialize`). Autorização: o servidor MCP é *resource server*; **MUST** publicar
  o Protected Resource Metadata (RFC 9728) em `/.well-known/oauth-protected-resource[/mcp]` e responder `401` com
  `WWW-Authenticate: Bearer resource_metadata="..."`; metadados do AS (RFC 8414) em `/.well-known/oauth-authorization-server`;
  PKCE S256 obrigatório; `resource` (RFC 8707) no authorize e no token; `iss` na resposta (RFC 9207) recomendado; registro por
  CIMD (recomendado), pré-registro ou DCR (RFC 7591, marcado *deprecated* mas mantido); refresh token rotacionado para cliente
  público.
- **claude.ai (docs oficiais):** Free, Pro e Max adicionam conector por URL; **Free = UM conector**. Suporta DCR e CIMD; CIMD só
  entra se o AS anuncia `client_id_metadata_document_supported: true` E `"none"` em `token_endpoint_auth_methods_supported`,
  senão cai em DCR pelo `registration_endpoint` ("Register automatically", que funciona com a maioria). PKCE S256 sempre.
  Callback dos apps hospedados: **`https://claude.ai/api/mcp/auth_callback`**. Claude Code usa loopback
  `http://localhost/callback` e `http://127.0.0.1/callback` (porta ignorada). Só um `401` de transporte inicia o login (um 200
  com `isError` não); usa só o primeiro `authorization_servers`; `resource` tem de ser exatamente a URL digitada; 10 s para
  discovery/registro/token; `invalid_grant` numa renovação inválida reinicia o login; egress `160.79.104.0/21`; cache de
  discovery ~5 min.
- **ChatGPT (developers.openai.com/plugins):** endpoint HTTPS público com Streamable HTTP em `/mcp`; "Add custom MCP server"
  em chatgpt.com/plugins; OAuth code + PKCE S256 obrigatório; CIMD preferido, DCR ainda suportado (um registro por conexão);
  redirect `https://chatgpt.com/connector_platform_oauth_redirect` (quando o AS anuncia
  `authorization_response_iss_parameter_supported: true` e manda `iss`), senão `https://chatgpt.com/connector/oauth/{id}`; sem
  `client_credentials`; escopos de `scopes_supported`. **Plano:** a central de ajuda da OpenAI deu 403 duas vezes; as buscas
  indicam conectores MCP para Business/Enterprise/Edu e fontes conflitantes sobre Plus/Pro e Free: **conferir na hora com o dono**.
  O servidor deste plano já atende o ChatGPT; só o teste real depende do plano dele.
- **Pacotes (npm):** `@modelcontextprotocol/server` **2.3.1** publicado em **05/10/2026** (15 dias; 2.2.0 em 28/09, 22 dias;
  deps `zod ^4.2.0`, Node ≥ 20; implementa 2026-07-28; `createMcpHandler(fábrica, opções)` devolve `{ fetch(Request, { authInfo }),
  close }`, a fábrica roda por requisição, clientes da era 2025 são atendidos por um *fallback* sem estado; **não valida
  Host/Origin** nem token: isso fica conosco). `requireBearerAuth` e `oauthMetadataResponse` existem no pacote, mas o servidor de
  autorização do SDK ficou congelado em `server-legacy`: **o OAuth é nosso**. `@modelcontextprotocol/sdk` 1.32.1 é a linha v1
  (não usar). `mcp-handler` 2.3.0 tem 13 dias (07/10) e só embrulha o que o SDK já faz: fica de fora.

## 4. Decisões já tomadas (pelo dono) e as que este plano propõe

**Do dono:** A1 (anotar por instrução ao modelo + registro de toda chamada), B1 (anexos só como texto extraído), C1 (sai o
chat interno e o que só ele usa; fica o resto; a lib fica inteira), Entrega E abortada, `/mcp` nunca chama IA, token só como
hash, authorize atrás do Tinyauth.

**Propostas deste plano (valem se o dono não disser o contrário na seção 5):**
1. Token de acesso vale **1 hora**; o de renovação, **30 dias**, rotacionado a cada uso; reuso de um token de renovação já
   trocado revoga a família inteira (sinal de roubo). Código de autorização vale **5 minutos**, uso único.
2. Um único escopo, `consultar`.
3. As dúvidas do MCP entram como **uma conversa por login por dia** (título "Dúvidas pelo Claude · 20/10"), canal `MCP`, perfil
   `ADMIN`; cada `anotarDuvida` grava a pergunta (USUARIO, mascarada) e a resposta (ASSISTENTE, `provedor: "mcp"`,
   `modelo: <nome do cliente>`, custo **0**, não nulo, para o Consumo e o orçamento não acusarem "preço não cadastrado").
4. A home do bloco Rise AI (`/rise-ai`) vira a página **"Conectar o Claude ou o ChatGPT"**: o endereço a colar, os passos na bolha
   "i" e as conexões ativas do login com **Desconectar** (revoga a família do token). É o que a Andrea vê; o administrador tem
   também os links de Revisão, Consumo e Configurações.
5. Resposta do `/mcp` no modo padrão do SDK (`auto`): ele já responde em JSON quando a ferramenta não manda notificação (medido na
   Tarefa 1); o modo `json` imprime um aviso no console a cada handler criado.
6. O recurso de Acessos continua com o id `riseAi.chat` (ver dúvida 3).

## 5. Dúvidas para o dono (respondidas em 20/10/2026: TODAS a Opção 1)

O dono respondeu "todas opção 1", inclusive a pergunta feita depois do plano: o MCP confere só os dados sensíveis
(`dado.*`), como o chat já fazia, e não as permissões de tela por ferramenta.

1. **Pacote.** Opção 1: `@modelcontextprotocol/server` 2.3.1 fixo, sem `mcp-handler` (recomendada: a mais nova que cumpre os
   14 dias, e o route handler do Next fala `Request`/`Response` direto). Opção 2: 2.2.0 (22 dias; perde correções). Opção 3:
   `mcp-handler` 2.3.0 (só a partir de 21/10; uma dependência a mais para o mesmo resultado).
2. **Registro do cliente.** Opção 1: só DCR (recomendada: nenhuma busca a URL externa; o claude.ai usa "Register
   automatically" e o ChatGPT aceita). Opção 2: DCR + CIMD (o Rise busca o documento do cliente na internet pelo
   `redePublica`; é a opção que o diálogo do claude.ai marca como recomendada, mas exige mais código e uma saída HTTP).
3. **Recurso de Acessos.** Opção 1: manter o id `riseAi.chat`, só com rótulo e descrição novos ("Rise AI › Acesso pelo Claude e
   ChatGPT: ver = ver as próprias conexões; editar = conectar e consultar") (recomendada: a função Atendimento já o tem, e mudar
   um id apaga a permissão em silêncio). Opção 2: id novo `riseAi.mcp` com migration de dados em `PermissaoDaFuncao` e
   `ExcecaoDoUsuario`.
4. **O que a Andrea não vê.** A função Atendimento semeada tem `dado.custo`, `dado.margem`, `dado.concorrentes` e
   `dado.financeiro` em **ver** (`PERMISSOES_DA_ATENDIMENTO`). Opção 1: o dono ajusta na tela Usuários e funções (põe esses
   quatro em nenhum; decide localização e estoque exato) (recomendada: é dado, não código, e vale para a tela toda). Opção 2:
   mudar a semeadura (só vale em instalação nova; a VPS já semeou) mais um script de ajuste. Opção 3: regra fixa no MCP ignorando
   `pode()` (contraria a anotação, que manda usar o `pode()` de cada login).
5. **Login da Andrea no Tinyauth.** A tela Autorizar exige que ela entre no Rise, e hoje só o dono tem usuário no Tinyauth
   (o Acessos lançamento 2 é que daria o login a ela). Opção 1: criar agora o usuário dela no `TINYAUTH_AUTH_USERS` da VPS e o
   `andrea` em Usuários com a Atendimento (recomendada: é pré-requisito do pedido; só o dono faz, por SSH). Opção 2: por enquanto
   só o dono conecta.
6. **Conversas antigas do chat.** Opção 1: ficam no banco e na Revisão do dia (canal `CHAT`), sem tela de chat (recomendada:
   nada se perde, e o Conhecimento aponta para mensagens delas). Opção 2: apagar.
7. **Ordem de execução.** Opção 1: primeiro o MCP (Tarefas 1 a 10), depois a retirada do chat (11 a 13) (recomendada: se parar
   no meio, o chat ainda funciona). Opção 2: o contrário.

## 6. Restrições globais (valem em toda tarefa)

- CLAUDE.md: JavaScript sem TypeScript; identificadores e comentários sem acento, texto de tela com acento; comentários dizem o
  porquê; `Edit` em vez de reescrever; `npm run lint` antes de commitar; `.env`, `certificates/` e `dados/` fora.
- **O `/mcp` nunca chama provedor de IA** e nunca escreve fora de `ConversaIA`/`MensagemIA`/`ChamadaMcp`/tabelas do OAuth.
- **Nenhum segredo em texto claro no banco, no log ou numa Server Action:** código, token de acesso e de renovação só como
  SHA-256; o `next dev` imprime argumentos de Server Action, então a tela Autorizar não recebe segredo nenhum.
- **A tela `/mcp/oauth/authorize` nunca entra no ramo público do Caddy.** As rotas públicas são só as do protocolo.
- Migration só aditiva, gerada por `migrate diff` **tirando as linhas que apagam os índices que só existem no SQL**
  (`Job_fonte_aberta`, trigramas, `Anuncio_um_por_produto`, `ConhecimentoIA_busca_trgm`, busca ampla); `npx prisma generate` e
  reiniciar o servidor depois.
- Testes: Postgres local, SEM rede, SEM IA paga; dados de teste `zz-mcp-*` (logins), `ZZ-MCP *` (funções e clientes),
  `ZZ-MCP-*` (produtos); `limpar()` no começo e no fim; nunca `| head`.
- Guarda estático de `teste:acessos`: toda página, layout, rota e `"use server"` novos conferem o acesso, ou entram em
  `SEM_RECURSO` com o motivo escrito.
- Padrão visual (10 regras): uma ação principal por tela, instrução na bolha "i", nada de parágrafo fixo.
- A lib `src/lib/riseAi/` não perde arquivo nem export nesta rodada.
- Não tocar em `PropostaDeProduto`, `20261019_proposta_de_produto` nem `scripts/preencher-produto.js`.

## 7. Foco da revisão (o que o pedido implica e nenhum teste cobriria sozinho)

1. **Token expirado, revogado ou de usuário desativado chega ao `/mcp`:** 401 com `WWW-Authenticate` apontando o metadado, sem
   executar ferramenta e sem dizer qual dos três foi. Teste na Tarefa 5.
2. **Troca de código errada:** código já usado, `code_verifier` que não bate, `redirect_uri` diferente do pedido, `resource`
   diferente de `.../mcp`: `invalid_grant`, nada emitido, e o reuso de código revoga o que aquele código emitiu. Teste na Tarefa 4.
3. **Cliente da era antiga** manda `initialize` e `Mcp-Session-Id`; `GET`/`DELETE /mcp`; `Origin` de outro site: responde,
   405 e 403, nesta ordem. Teste na Tarefa 9.
4. **Dado pessoal e anexo grande:** argumento com telefone/CPF e pergunta com e-mail entram mascarados no registro e na
   conversa; texto de anexo acima de 20.000 caracteres e mais de 5 anexos são recusados pelo zod antes de gravar. Teste na
   Tarefa 8.
5. **Caddy:** o `authorize` fora do ramo público; o ramo `@mcp` sem `forward_auth` e sem `X-Rise-Borda`. Teste estático na
   Tarefa 10.

## 8. Estrutura de arquivos

**Novos**
- `src/lib/mcp/oauth.js`: regras puras do OAuth (metadados, validações, PKCE, hashes, URLs de retorno, Host/Origin).
- `src/lib/mcp/oauthBanco.js`: clientes, códigos, tokens (emitir, trocar, renovar, validar, revogar).
- `src/lib/mcp/autorizacao.js`: a decisão da tela Autorizar (valida, emite o código, monta a URL de volta).
- `src/lib/mcp/portao.js`: `exigirTokenMcp(request)` (401/403) e a ponte para o `authInfo` do SDK.
- `src/lib/mcp/registro.js`: `ChamadaMcp` (gravar, mascarar argumentos, chamadas recentes).
- `src/lib/mcp/anotacoes.js`: a ferramenta `anotarDuvida` e a conversa do dia do canal MCP.
- `src/lib/mcp/servidor.js`: o `McpServer` com as ferramentas e as instruções; o handler.
- `src/app/mcp/route.js`; `src/app/mcp/oauth/register/route.js`; `src/app/mcp/oauth/token/route.js`;
  `src/app/mcp/oauth/authorize/page.jsx` e `acoes.js`; `src/app/.well-known/oauth-protected-resource/[[...resto]]/route.js`;
  `src/app/.well-known/oauth-authorization-server/route.js`.
- `src/components/mcp/Autorizar.jsx` (o cartão da decisão); `src/components/riseAi/Conexoes.jsx` (a home nova).
- `prisma/migrations/20261020_mcp_rise/migration.sql`; `scripts/teste-mcp.js`.

**Modificados**
- `src/lib/acessos/banco.js` (`permissoesDoLogin`), `src/lib/acessos/recursos.js` (rótulos; sai `riseAi.configuracoes.canais`),
  `src/lib/riseAi/conversas.js` (`criarConversa` com `canal`), `src/lib/riseAi/revisao.js` (`canal` e `cliente` na saída),
  `src/lib/riseAi/abasDeConfiguracao.js` (3 abas), `src/lib/blocos.js`,
  `src/components/riseAi/{formatos.js, RevisaoDoDia.jsx, MensagemDaIA.jsx, AbaOrcamentos.jsx, AbaAtendimento.jsx}`,
  `src/app/rise-ai/{layout.jsx, page.jsx, acoes.js, configuracoes/page.jsx, consumo/page.jsx}`, `deploy/caddy/Caddyfile`,
  `package.json`, `scripts/teste-rise-ai.js`, `scripts/teste-acessos.js`, `CLAUDE.md`, a spec do agente.

**Removidos (Tarefas 11 e 12)**
- `src/app/rise-ai/[conversaId]/page.jsx`, `src/app/api/rise-ai/conversar/route.js`, `src/app/api/rise-ai/parar/route.js`,
  `src/components/riseAi/{Chat.jsx, ControlesDaConversa.jsx, ListaDeConversas.jsx, AbaCanais.jsx}` e os componentes que só o chat
  importa (`Janela.jsx`, `fluxo.js`, conferidos por grep na hora).

---

## Parte 1: o servidor MCP

### Tarefa 1: pacote, sondagem do SDK e o teste

**Arquivos:** criar `scripts/teste-mcp.js`; modificar `package.json` (dependência fixa e o script `teste:mcp`).

**Interfaces:**
- Produz: o esqueleto do teste (`conferir`, `ord`, `limpar`, `lerRespostaMcp(resposta)` que aceita JSON ou SSE com um
  `data:`), e o fato conferido: **a assinatura da fábrica de `createMcpHandler`, as opções (`legacy`, modo da resposta) e onde
  entram as `instructions` do `McpServer`**, anotados num comentário no topo de `src/lib/mcp/servidor.js` (Tarefa 8).

- [ ] **Passo 1:** `npm install --save-exact @modelcontextprotocol/server@2.3.1` e conferir no `package.json` que a versão está
  sem `^`; ler `node_modules/@modelcontextprotocol/server/README.md` e os `.d.ts` de `createMcpHandler`, `McpServer` e
  `registerTool` (a documentação na web não mostra a fábrica nem as `instructions`).
- [ ] **Passo 2:** escrever `scripts/teste-mcp.js` com o cabeçalho dos outros testes (`register` do `resolver-alias`, `prisma`,
  `conferir`, `limpar`) e o primeiro bloco, "Sondagem do SDK": um `McpServer` de brinquedo com uma ferramenta `eco` e
  `instructions: "teste"`, embrulhado por `createMcpHandler`; três pedidos ao `handler.fetch`:
  - `server/discover` com os cabeçalhos da revisão 2026-07-28 → `result.instructions === "teste"` e `eco` em `tools`;
  - `tools/call` de `eco` → `content[0].text` igual ao argumento;
  - `initialize` sem `MCP-Protocol-Version` (cliente de 2025) → `result.protocolVersion` definido e sem erro.
  `package.json`: `"teste:mcp": "node scripts/teste-mcp.js"`.
- [ ] **Passo 3:** `npm run teste:mcp` → as três conferências passam (aqui o teste não falha antes: ele sonda a biblioteca; a
  falha esperada é a de assinatura errada, que o passo 1 evita).
- [ ] **Passo 4:** commit `MCP: pacote @modelcontextprotocol/server 2.3.1 e sondagem do SDK (teste:mcp)`.

### Tarefa 2: banco

**Arquivos:** modificar `prisma/schema.prisma`; criar `prisma/migrations/20261020_mcp_rise/migration.sql`; teste em `scripts/teste-mcp.js`.

**Interfaces:**
- Produz os modelos:
  - `enum CanalIA { CHAT MCP }` e `ConversaIA.canal CanalIA @default(CHAT)` com `@@index([canal, usuario, criadoEm])`.
  - `ClienteMcp { id cuid, nome String, redirectUris String[], criadoEm }` com `codigos CodigoMcp[]` e `tokens TokenMcp[]`.
  - `CodigoMcp { id cuid, hash String @unique, clienteId (Cascade), login, redirectUri, codeChallenge, resource, escopos String[],
    expiraEm, usadoEm DateTime?, criadoEm }`.
  - `TokenMcp { id cuid, hashAcesso @unique, hashRenovacao @unique, familia String, clienteId (Cascade), login, escopos String[],
    expiraEm, renovacaoExpiraEm, revogadoEm?, substituidoEm?, criadoEm }` com `@@index([login])` e `@@index([familia])`.
  - `ChamadaMcp { id cuid, quando @default(now()), login, clienteId String?, clienteNome, ferramenta, argumentos Json?,
    ok Boolean, erro String?, duracaoMs Int }` com `@@index([login, quando])`.

- [ ] **Passo 1 (teste):** bloco "Banco": cria um `ClienteMcp` `ZZ-MCP Teste`, um `TokenMcp` e um `CodigoMcp` dele; confere que
  `hashAcesso` repetido dá `P2002`; que apagar o cliente leva token e código; que `conversaIA.create` sem `canal` fica `CHAT`;
  que `ChamadaMcp` aceita `argumentos: Prisma.DbNull`.
- [ ] **Passo 2:** rodar → FALHA (`prisma.clienteMcp` não existe).
- [ ] **Passo 3:** schema + `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` em
  `prisma/migrations/20261020_mcp_rise/migration.sql`, **tirando os `DROP INDEX`** dos índices que só existem no SQL;
  `npx prisma migrate deploy`; `npx prisma generate`.
- [ ] **Passo 4:** rodar → PASSA. `npm run teste:rise-ai` e `npm run teste:acessos` continuam passando.
- [ ] **Passo 5:** commit `MCP: tabelas do OAuth, ChamadaMcp e o canal da conversa (migration aditiva)`.

### Tarefa 3: regras puras do OAuth

**Arquivos:** criar `src/lib/mcp/oauth.js` (só `node:crypto`; sem Prisma, sem Next); teste em `scripts/teste-mcp.js`.

**Interfaces (produz):**
- `ESCOPO = "consultar"`, `VALIDADE_DO_CODIGO_MS = 5 * 60 * 1000`, `VALIDADE_DO_ACESSO_S = 3600`,
  `VALIDADE_DA_RENOVACAO_MS = 30 * 24 * 60 * 60 * 1000`.
- `REDIRECTS_PERMITIDOS`: `https://claude.ai/api/mcp/auth_callback` (exato), `https://chatgpt.com/connector_platform_oauth_redirect`
  (exato), `https://chatgpt.com/connector/oauth/` (prefixo), e loopback `http://localhost/callback` e `http://127.0.0.1/callback`
  com qualquer porta. `redirectPermitido(uri) → boolean`; `mesmoRedirect(registrado, pedido) → boolean` (igualdade exata; no
  loopback a porta não conta, RFC 8252).
- `origemDoRise(request, env = process.env) → string`: `env.APP_URL_PUBLICA` sem barra final; sem ela, `new URL(request.url).origin`.
- `hostPermitido(request, env) → boolean` (o host de `APP_URL_PUBLICA`; sem ela, `localhost` ou `127.0.0.1` em qualquer porta) e
  `originPermitida(request, env) → boolean` (sem `Origin` = permitido; com ele, só a própria origem do Rise).
- `metadadosDoRecurso(origem)` → `{ resource: origem + "/mcp", authorization_servers: [origem], scopes_supported: [ESCOPO],
  bearer_methods_supported: ["header"], resource_name: "Rise" }`.
- `metadadosDoServidor(origem)` → `{ issuer: origem, authorization_endpoint: origem + "/mcp/oauth/authorize", token_endpoint:
  origem + "/mcp/oauth/token", registration_endpoint: origem + "/mcp/oauth/register", response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"], scopes_supported: [ESCOPO], authorization_response_iss_parameter_supported: true }`.
- `validarRegistro(corpo)` → `{ ok: true, cliente: { nome, redirectUris } } | { ok: false, erro: "invalid_redirect_uri" |
  "invalid_client_metadata", descricao }`: `redirect_uris` lista não vazia, toda permitida; `client_name` opcional, texto puro
  até 60 (padrão "Cliente MCP"); `token_endpoint_auth_method`, se vier, só `"none"`; `grant_types` ⊆ suportados; `response_types` ⊆ `["code"]`.
- `validarPedidoDeAutorizacao(params, cliente, { recursoEsperado })` → `{ ok: true, pedido: { redirectUri, codeChallenge, state,
  resource, escopos } } | { ok: false, erro, descricao, redirecionavel }`: `response_type === "code"`; `client_id === cliente.id`;
  `redirect_uri` ∈ `cliente.redirectUris` (`mesmoRedirect`; se não, `redirecionavel: false`); `code_challenge` de 43 a 128 chars
  base64url e `code_challenge_method === "S256"` (sem PKCE = `invalid_request`); `resource`, se vier, igual a `recursoEsperado`
  (senão `invalid_target`); `scope` vazio ou só `ESCOPO`.
- `conferirPkce(codeVerifier, codeChallenge) → boolean` (SHA-256 base64url, comparação em tempo constante).
- `gerarSegredo() → string` (32 bytes aleatórios em base64url); `hashDoSegredo(texto) → string` (SHA-256 hex).
- `urlDeRetorno(redirectUri, { code, state, iss })` e `urlDeErro(redirectUri, { erro, descricao, state, iss })` → string.
- `respostaJson(status, corpo)` → `Response` com `Cache-Control: no-store`; `cabecalhoDeDesafio(origem, { erro, descricao })` →
  o valor de `WWW-Authenticate` (`Bearer resource_metadata="<origem>/.well-known/oauth-protected-resource/mcp"`, mais
  `error="..."` e `error_description="..."` quando há erro).

- [ ] **Passo 1 (teste):** bloco "OAuth puro": metadados dos dois documentos (os campos acima, byte a byte); `redirectPermitido`
  para os 5 casos bons e para `https://claude.ai/outra`, `http://localhost/x`, `https://localhost/callback`;
  `mesmoRedirect("http://localhost/callback", "http://localhost:51234/callback") === true` e falso entre domínios;
  `validarRegistro` recusa lista vazia, URI fora da lista e `token_endpoint_auth_method: "client_secret_basic"`, aceita o corpo
  que o claude.ai manda (`client_name`, `redirect_uris`, `grant_types`, `response_types`, `token_endpoint_auth_method: "none"`);
  `validarPedidoDeAutorizacao` em 7 casos (bom; sem PKCE; `plain`; redirect de outro; `resource` errado; `scope` desconhecido;
  `client_id` de outro); `conferirPkce` com o par do RFC 7636 (verifier `dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk`,
  challenge `E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM`); `origemDoRise` com e sem `APP_URL_PUBLICA`;
  `hostPermitido`/`originPermitida` nos dois ambientes; as duas URLs de retorno com `state` e `iss`.
- [ ] **Passo 2:** rodar → FALHA (módulo não existe).
- [ ] **Passo 3:** implementar `src/lib/mcp/oauth.js`.
- [ ] **Passo 4:** rodar → PASSA.
- [ ] **Passo 5:** commit `MCP: regras puras do OAuth (metadados, PKCE, redirects, hashes)`.

### Tarefa 4: clientes, códigos e tokens no banco

**Arquivos:** criar `src/lib/mcp/oauthBanco.js`; teste em `scripts/teste-mcp.js`.

**Interfaces:**
- Consome: Tarefa 3 (`gerarSegredo`, `hashDoSegredo`, `conferirPkce`, `mesmoRedirect`, validades).
- Produz (todas com `{ agora = Date.now() }` opcional):
  - `registrarCliente({ nome, redirectUris })` → `{ clientId, nome, redirectUris, criadoEm }`.
  - `carregarCliente(clientId)` → `{ id, nome, redirectUris } | null`.
  - `emitirCodigo({ clienteId, login, redirectUri, codeChallenge, resource, escopos })` → `codigo` (o texto, devolvido UMA vez;
    o banco guarda `hashDoSegredo(codigo)`).
  - `trocarCodigo({ codigo, clientId, redirectUri, codeVerifier, resource })` → `{ ok: true, tokens: { access_token, token_type:
    "Bearer", expires_in: 3600, refresh_token, scope } } | { ok: false, erro: "invalid_grant" | "invalid_request", descricao }`.
    Uso único por `updateMany({ where: { hash, usadoEm: null } })` com contagem 1; expirado, cliente diferente, redirect diferente,
    `resource` diferente ou PKCE errado → `invalid_grant`; **código reusado revoga a família que ele emitiu** (`familia` =
    id do código).
  - `renovarToken({ refreshToken, clientId })` → o mesmo formato: rotaciona (marca `substituidoEm` no antigo, cria o novo na mesma
    família); renovação expirada, revogada ou de outro cliente → `invalid_grant`; **renovação já substituída revoga a família**.
  - `validarTokenDeAcesso(token)` → `{ login, clienteId, clienteNome, escopos, expiraEm } | null` (expirado ou revogado = `null`).
  - `listarConexoesDoLogin(login)` → `[{ familia, clienteNome, criadoEm, renovacaoExpiraEm }]` (só famílias com renovação viva).
  - `revogarConexao(familia, login)` → `{ revogados: number }` (só do próprio login).

- [ ] **Passo 1 (teste):** bloco "OAuth no banco" com um cliente `ZZ-MCP Claude` e o login `zz-mcp-andrea`: fluxo bom (código →
  troca → token válido → renovação → o antigo refresh dá `invalid_grant` e a família continua viva); segundo uso do mesmo código
  → `invalid_grant` **e** o token da primeira troca passa a `null`; PKCE errado, redirect errado, `resource` errado, código
  expirado (`agora` + 6 min), cliente errado; reuso de refresh substituído → revoga a família; `listarConexoesDoLogin` mostra 1 e
  `revogarConexao` de outro login devolve 0; nada no banco é igual ao texto do token (`findFirst({ where: { hashAcesso: token } })`
  é `null`).
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** implementar `src/lib/mcp/oauthBanco.js`.
- [ ] **Passo 4:** rodar → PASSA.
- [ ] **Passo 5:** commit `MCP: clientes, códigos e tokens só como hash, com rotação e revogação por família`.

### Tarefa 5: a sessão de Acessos pelo login do token e o portão do `/mcp`

**Arquivos:** modificar `src/lib/acessos/banco.js` (`permissoesDoLogin`); criar `src/lib/mcp/portao.js`; testes em
`scripts/teste-mcp.js`.

**Interfaces:**
- Consome: `montarSessao` e `quebraVidro` (`src/lib/acessos/sessao.js`), `validarTokenDeAcesso` (Tarefa 4), `cabecalhoDeDesafio`,
  `origemDoRise`, `respostaJson` (Tarefa 3).
- Produz:
  - `permissoesDoLogin(login, { env = process.env })` → `{ estado: "ok" | "inativo" | "nao-cadastrado" | "erro-banco", administrador,
    pode, permissoes }`: lê `UsuarioRise` com funções e exceções (o mesmo `include` de `sessaoDeAcessos`) e chama
    `montarSessao({ ambiente: "vps", login, motivo: "token", usuario, quebraVidro: quebraVidro(login, env) })`. **Sempre
    `ambiente: "vps"`** (no PC, qualquer token viraria administrador); a única exceção explícita é `!env.RISE_PRODUCAO && login
    === "pc"` → administrador (o login do Rise do PC).
  - `exigirTokenMcp(request, { env, agora })` → `{ ok: true, autenticacao: { login, clienteId, clienteNome, escopos, pode,
    administrador } } | { ok: false, resposta: Response }`. 401 `invalid_token` (ou sem `error`, quando não há cabeçalho) com
    `WWW-Authenticate` e corpo `{ error, error_description }` para: sem `Authorization`, formato diferente de `Bearer <token>`,
    token desconhecido/expirado/revogado, login `inativo`/`nao-cadastrado`/`erro-banco`. 403 `insufficient_scope` quando o login
    existe mas `!pode("riseAi.chat", "editar")`. `administrador = pode("riseAi.revisao", "ver")`.
  - `autenticacaoParaSdk(autenticacao)` → o `AuthInfo` do SDK: `{ token: "", clientId, scopes: escopos, expiresAt: <segundos>,
    extra: { autenticacao } }` (o texto do token nunca entra).

- [ ] **Passo 1 (teste):** bloco "Portão": função `ZZ-MCP Atendimento` (`tela.riseAi ver`, `riseAi.chat editar`, sem `dado.custo`),
  usuários `zz-mcp-andrea` (com ela), `zz-mcp-sem` (só `tela.riseAi ver`) e `zz-mcp-inativa` (`ativo: false`); tokens pela
  Tarefa 4. Conferir: sem cabeçalho → 401 e `WWW-Authenticate` contém `resource_metadata="https://rise.teste/.well-known/oauth-protected-resource/mcp"`
  (com `APP_URL_PUBLICA=https://rise.teste` no `env` do teste); `Basic x` → 401; token desconhecido → 401 `invalid_token`;
  expirado (`agora` + 2 h) → 401; revogado → 401; `zz-mcp-inativa` → 401 (mesma mensagem da expirada: não revela o motivo);
  `zz-mcp-sem` → 403 `insufficient_scope`; `zz-mcp-andrea` → `ok`, `pode("dado.custo","ver") === false`, `administrador === false`;
  `permissoesDoLogin("pc", { env: {} })` → administrador; `permissoesDoLogin("zz-mcp-andrea", { env: { RISE_AI_ADMINS: "zz-mcp-andrea" } })`
  → administrador.
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** rodar → PASSA; `npm run teste:acessos` passa.
- [ ] **Passo 5:** commit `MCP: sessão de Acessos pelo login do token e o portão 401/403 do /mcp`.

### Tarefa 6: rotas públicas do protocolo (metadados, registro, token)

**Arquivos:** criar `src/app/.well-known/oauth-protected-resource/[[...resto]]/route.js`,
`src/app/.well-known/oauth-authorization-server/route.js`, `src/app/mcp/oauth/register/route.js`, `src/app/mcp/oauth/token/route.js`;
modificar `scripts/teste-acessos.js` (`SEM_RECURSO`); testes em `scripts/teste-mcp.js`.

**Interfaces:**
- Consome: Tarefas 3 e 4; `criarLimitador` (`src/lib/riseAi/limite.js`).
- Produz:
  - `GET /.well-known/oauth-protected-resource` e `/.well-known/oauth-protected-resource/mcp` → `metadadosDoRecurso(origem)`;
    outro sufixo → 404. `GET /.well-known/oauth-authorization-server` → `metadadosDoServidor(origem)`. Os dois com
    `Content-Type: application/json`, `Cache-Control: public, max-age=300` e `Access-Control-Allow-Origin: *`; `OPTIONS` → 204
    com os cabeçalhos de CORS (o claude.ai e o ChatGPT pedem de servidor, mas o CORS não custa).
  - `POST /mcp/oauth/register` (JSON) → 201 `{ client_id, client_name, redirect_uris, token_endpoint_auth_method: "none",
    grant_types, response_types }` ou 400 `{ error, error_description }`; limite de **10 registros por minuto** no processo
    (`criarLimitador({ porMinuto: 10 })`, chave fixa `"registro"`; estourou → 429).
  - `POST /mcp/oauth/token` (`application/x-www-form-urlencoded`; JSON também aceito) com `grant_type=authorization_code`
    (`code`, `code_verifier`, `client_id`, `redirect_uri`, `resource?`) ou `refresh_token` (`refresh_token`, `client_id`) → 200
    com os tokens, ou 400 `{ error, error_description }` (`invalid_request`, `invalid_grant`, `unsupported_grant_type`), 401
    `invalid_client` para `client_id` desconhecido; limite de 60 por minuto por `X-Forwarded-For` (primeiro IP) ou `"desconhecido"`.
  - Em todas: `hostPermitido` falso → 421 sem corpo. Nenhuma lê a sessão de Acessos.
  - `teste-acessos.js`: as quatro rotas entram em `SEM_RECURSO` com o comentário "protocolo OAuth/MCP: publico por desenho; a
    autenticacao e o token (src/lib/mcp/portao.js)".

- [ ] **Passo 1 (teste):** bloco "Rotas do OAuth": importar os módulos das rotas e chamá-los com `new Request(...)`
  (`APP_URL_PUBLICA` do processo de teste apontando para `https://rise.teste`): os dois metadados; registro bom (corpo do
  claude.ai) → 201 e `client_id` existe no banco; registro ruim → 400; o 11.º registro no mesmo minuto → 429; token: fluxo bom
  (código emitido pela Tarefa 4 + `code_verifier`) → 200 com `expires_in: 3600`; `grant_type=password` → 400
  `unsupported_grant_type`; `client_id` inventado → 401; renovação → 200 e refresh novo; `Host` errado → 421; `OPTIONS` → 204.
- [ ] **Passo 2:** rodar → FALHA (módulos não existem). **Se o Next não servir a pasta `.well-known`** (conferir com `curl -k
  https://localhost:3000/.well-known/oauth-authorization-server` depois do passo 3): mover as duas rotas para
  `src/app/mcp/well-known/...` e acrescentar em `next.config.mjs` o `rewrites` de `/.well-known/:caminho*` para
  `/mcp/well-known/:caminho*`; registrar a decisão no ledger.
- [ ] **Passo 3:** implementar as rotas e a entrada em `SEM_RECURSO`.
- [ ] **Passo 4:** rodar `teste:mcp` → PASSA; `teste:acessos` → PASSA (guarda inclui as rotas novas); o `curl` acima devolve o
  JSON com `issuer: "https://localhost:3000"`.
- [ ] **Passo 5:** commit `MCP: metadados do OAuth, registro dinâmico e endpoint de token`.

### Tarefa 7: a tela "Autorizar" (atrás do login)

**Arquivos:** criar `src/lib/mcp/autorizacao.js`, `src/app/mcp/oauth/authorize/page.jsx`, `src/app/mcp/oauth/authorize/acoes.js`,
`src/components/mcp/Autorizar.jsx`; modificar `src/lib/acessos/recursos.js` (rótulo e descrição de `riseAi.chat`; ver dúvida 3);
testes em `scripts/teste-mcp.js` e `scripts/teste-acessos.js`.

**Interfaces:**
- Consome: `exigirAcessoNaPagina`, `executarComAcesso` (login em `acesso.login`); `carregarCliente`, `emitirCodigo` (Tarefa 4);
  `validarPedidoDeAutorizacao`, `urlDeRetorno`, `urlDeErro`, `origemDoRise` (Tarefa 3).
- Produz:
  - `autorizacao.js`: `decidirAutorizacao({ params, login, decisao, origem }, { agora })` → `{ ok: true, url } | { ok: false,
    motivo, url? }`: carrega o cliente, valida o pedido; `decisao === "autorizar"` → emite o código com `login` e devolve
    `urlDeRetorno(..., { code, state, iss: origem })`; `"recusar"` → `urlDeErro(..., { erro: "access_denied", state, iss })`;
    pedido inválido redirecionável → `{ ok: false, motivo, url: urlDeErro(...) }`; não redirecionável (cliente desconhecido,
    `redirect_uri` fora da lista) → `{ ok: false, motivo }` **sem URL** (nunca redireciona para onde não se conhece).
  - `page.jsx`: `exigirAcessoNaPagina("riseAi.chat", "editar")`; lê `searchParams` e valida pela mesma função (sem decidir): bom →
    `<Autorizar>` com `cliente.nome`, o host do `redirect_uri`, o login e os parâmetros do pedido em campos ocultos (`client_id`,
    `redirect_uri`, `code_challenge`, `code_challenge_method`, `state`, `resource`, `scope`: nenhum é segredo); inválido e
    redirecionável → `redirect(url)`; inválido sem URL → o cartão "Pedido inválido" com o motivo e sem botões.
  - `acoes.js`: `decidirAutorizacaoAcao(formData)`: `const r = await executarComAcesso("riseAi.chat", "editar", (acesso) =>
    decidirAutorizacao({ params, login: acesso.login, decisao, origem }))`; **o `redirect(r.url)` fica FORA do invólucro** (o
    `NEXT_REDIRECT` lançado dentro seria engolido como erro).
  - `Autorizar.jsx` (cliente): "nesta tela a pessoa vê primeiro QUEM pede acesso e COMO QUEM, e a ação principal é Autorizar".
    Um cartão centrado: título "Autorizar o acesso ao Rise"; a linha "**Claude** (claude.ai) quer consultar o Rise como
    **andrea**."; a linha "Pode consultar produtos, preços, estoque e o conhecimento, e anotar as dúvidas. Não altera nada."; a
    bolha "i" com o que é registrado; botões **Autorizar** (acento, foco) e **Recusar** (borda). Sem parágrafo fixo além dessas
    duas linhas.
  - `recursos.js`: `capacidade("riseAi.chat", "Rise AI › Acesso pelo Claude e ChatGPT", "tela.riseAi", "Ver = ver as próprias
    conexões; editar = conectar e consultar pelo Claude ou ChatGPT.")`.

- [ ] **Passo 1 (teste):** em `teste-mcp.js`, bloco "Autorizar": autorizar bom → URL com `code`, `state` e `iss`, e o código troca
  por token; recusar → `error=access_denied` e `state`; `client_id` desconhecido → `ok: false` sem URL; `redirect_uri` fora da
  lista do cliente → `ok: false` sem URL; `scope` errado → `ok: false` com URL de erro. Em `teste-acessos.js`, o rótulo novo
  de `riseAi.chat`.
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** implementar `autorizacao.js`, a página, a ação (fina) e o componente; `npm run lint`.
- [ ] **Passo 4:** rodar `teste:mcp` e `teste:acessos` → PASSAM (o guarda vê `exigirAcessoNaPagina(` na página e
  `executarComAcesso(` na ação). Na tela do PC: registrar um cliente pelo `curl` da Tarefa 6 e abrir
  `https://localhost:3000/mcp/oauth/authorize?response_type=code&client_id=<id>&redirect_uri=http://localhost/callback&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&state=x&resource=https://localhost:3000/mcp`
  → o cartão; Autorizar → o navegador vai a `http://localhost/callback?code=...&state=x&iss=...` (erro de conexão é o esperado:
  nada escuta ali); conferir a largura de notebook.
- [ ] **Passo 5:** commit `MCP: tela Autorizar atrás do login e a decisão que emite o código`.

### Tarefa 8: o servidor MCP, as chamadas registradas e `anotarDuvida`

**Arquivos:** criar `src/lib/mcp/registro.js`, `src/lib/mcp/anotacoes.js`, `src/lib/mcp/servidor.js`; modificar
`src/lib/riseAi/conversas.js` (`criarConversa` ganha `canal`); testes em `scripts/teste-mcp.js`.

**Interfaces:**
- Consome: `FERRAMENTAS`, `executarFerramenta` (`src/lib/riseAi/ferramentas/index.js`); `mascararDadosPessoais`
  (`src/lib/riseAi/mascarar.js`); `criarConversa`/`gravarMensagem` (`conversas.js`); `limitesDoDia`, `hojeEmSaoPaulo`
  (`revisao.js`); a sondagem da Tarefa 1; `autenticacao` da Tarefa 5.
- Produz:
  - `registro.js`: `argumentosParaRegistro(args)` (strings mascaradas, JSON cortado em 2.000 caracteres);
    `registrarChamadaMcp({ login, clienteId, clienteNome, ferramenta, argumentos, ok, erro, duracaoMs })`;
    `chamadasRecentes({ login, clienteId }, { agora, janelaMs = 30 * 60 * 1000, limite = 8 })` → `[{ nome, argumentos, ok, duracaoMs }]`
    sem `anotarDuvida`.
  - `anotacoes.js`: `FERRAMENTA_ANOTAR = { nome: "anotarDuvida", descricao, perfis: ["admin"], esquema, executar }` no formato de
    `FERRAMENTAS`; `esquema = z.object({ pergunta: z.string().trim().min(1).max(4000), resposta: z.string().trim().min(1).max(20000),
    anexos: z.array(z.object({ nome: z.string().trim().min(1).max(120), tipo: z.string().trim().max(40).optional(), texto:
    z.string().max(20000) })).max(5).optional() })`; a descrição manda chamar **no fim de CADA resposta** que usou o Rise, com a
    pergunta original e a resposta final, e incluir o texto extraído de arquivo enviado. `anotarDuvida({ login, clienteId,
    clienteNome, pergunta, resposta, anexos }, { agora })` → `{ conversaId, mensagemId }`: `conversaDoDiaDoMcp(login, clienteNome,
    agora)` acha ou cria a `ConversaIA` de `canal: "MCP"`, `usuario: login`, `perfil: "ADMIN"`, `titulo: "Dúvidas pelo <cliente> ·
    dd/mm"` criada no dia de São Paulo; grava USUARIO (`conteudo` mascarado; `estruturado: { anexos: [{ nome, tipo, caracteres,
    texto (mascarado) }] }`) e ASSISTENTE (`conteudo` mascarado; `provedor: "mcp"`, `modelo: clienteNome`, `custoUsd: 0`,
    `custoBrl: 0`, `avisos: []`, `estruturado: { ferramentas: chamadasRecentes(...), cliente: clienteNome }`). `executar(args,
    contexto)` lê `contexto.usuario` e `contexto.mcp`.
  - `servidor.js`: `INSTRUCOES` (texto em português: o que o Rise é, que o preço é o normal de tabela, que o estoque pode vir em
    faixa, e a obrigação de `anotarDuvida` ao fim de cada resposta); `montarServidorMcp(autenticacao, { agora, registrar =
    registrarChamadaMcp })` → `McpServer` ("rise", versão do `package.json`, `instructions: INSTRUCOES`) com `registerTool` para
    cada ferramenta de `FERRAMENTAS.filter((f) => f.perfis.includes("admin"))` e para `FERRAMENTA_ANOTAR`, `annotations:
    { readOnlyHint: true }` (menos `anotarDuvida`), handler: `executarFerramenta(nome, args, { perfil: "admin", usuario: login, pode,
    internet: false, mcp: { clienteId, clienteNome, agora } })` (para `anotarDuvida`, o mesmo `executar` da `FERRAMENTA_ANOTAR`),
    registro da chamada (ok/erro/duração), retorno `{ content: [{ type: "text", text: JSON.stringify(resultado) }] }` ou
    `{ content: [{ type: "text", text: erro }], isError: true }`; `responderMcp(request, autenticacao)` → `Response` pelo
    `createMcpHandler` (um handler por requisição, fechado no `finally`, ou o de módulo com a fábrica lendo
    `ctx.authInfo.extra.autenticacao`: o que a sondagem da Tarefa 1 mostrou).

- [ ] **Passo 1 (teste):** bloco "Servidor MCP": produto `ZZ-MCP-1` (ativo, com custo 10 e preço 20) e a `autenticacao` de
  `zz-mcp-andrea` (sem `dado.custo`): `server/discover` → 8 ferramentas, `instructions` contém "anotarDuvida"; `tools/call
  consultarProduto { codigo: "ZZ-MCP-1" }` → `content[0].text` tem `"preco":20` e **não** tem `"custo":10` (vem `[restrito]`);
  `pesquisarNaInternet` → erro "Ferramenta desconhecida"; `ChamadaMcp` ganhou 1 linha `ok: true`; `buscarProdutos { termos:
  "ligar 54988990008" }` → `argumentos` gravados com o telefone mascarado; `anotarDuvida` bom → `ConversaIA` canal `MCP` do login,
  2 mensagens, ASSISTENTE com `provedor "mcp"`, `custoBrl 0` (não nulo) e `estruturado.ferramentas` com a chamada anterior; segundo
  `anotarDuvida` no mesmo dia → mesma conversa, 4 mensagens; pergunta com e-mail → mascarada; `anexos` com 6 itens → `isError`
  e nada gravado; `texto` de 20.001 → `isError`; com `administrador` (`pode: () => true`) o custo aparece.
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** implementar os três módulos; `criarConversa` em `conversas.js` ganha `canal = "CHAT"`.
- [ ] **Passo 4:** rodar `teste:mcp` → PASSA; `teste:rise-ai` → PASSA.
- [ ] **Passo 5:** commit `MCP: servidor com as ferramentas de leitura, registro de cada chamada e anotarDuvida`.

### Tarefa 9: a rota `/mcp`

**Arquivos:** criar `src/app/mcp/route.js`; modificar `scripts/teste-acessos.js` (`confere` aceita `exigirTokenMcp(`); testes em
`scripts/teste-mcp.js`.

**Interfaces:**
- Consome: `hostPermitido`, `originPermitida` (Tarefa 3), `exigirTokenMcp` (Tarefa 5), `responderMcp` (Tarefa 8).
- Produz: `POST` → 421 (host), 403 sem corpo (`Origin` de fora), o 401/403 do portão, senão `responderMcp`; `GET`, `DELETE`,
  `PUT`, `PATCH` → 405 com `Allow: POST`; `export const dynamic = "force-dynamic"`.

- [ ] **Passo 1 (teste):** bloco "Rota /mcp": `POST` sem token → 401 com `WWW-Authenticate`; com o token de `zz-mcp-andrea` e
  os cabeçalhos da era nova → `server/discover` responde; o mesmo com `initialize` + `Mcp-Session-Id: qualquer` (cliente de 2025)
  → responde sem erro; `GET` → 405; `DELETE` → 405; `Origin: https://outro.site` → 403; `Host: outro` → 421; token de
  `zz-mcp-inativa` → 401 e **nenhuma** `ChamadaMcp` nova.
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** implementar a rota; em `teste-acessos.js`, `confere` passa a aceitar também `exigirTokenMcp(`.
- [ ] **Passo 4:** rodar `teste:mcp`, `teste:acessos` → PASSAM. Na tela do PC: `curl -k -X POST https://localhost:3000/mcp` → 401
  com o cabeçalho; `curl -k https://localhost:3000/mcp` → 405.
- [ ] **Passo 5:** commit `MCP: rota /mcp (POST só com token; GET e DELETE 405; Origin e Host conferidos)`.

### Tarefa 10: Caddy e o deploy

**Arquivos:** modificar `deploy/caddy/Caddyfile`; teste estático em `scripts/teste-mcp.js`.

**Interfaces (produz):** antes do `handle` com login, o bloco:

```
	# MCP (20/10/2026): o Claude e o ChatGPT (nuvem) falam com o Rise por token proprio (src/lib/mcp/portao.js), sem o login
	# do Tinyauth. SO estes caminhos, exatos; /mcp/oauth/authorize (a tela "Autorizar") fica no ramo com login, de proposito.
	# Sem forward_auth e sem X-Rise-Borda: o app nao le login nenhum aqui.
	@mcp {
		path /mcp /mcp/oauth/token /mcp/oauth/register /.well-known/oauth-protected-resource /.well-known/oauth-protected-resource/* /.well-known/oauth-authorization-server /.well-known/oauth-authorization-server/*
	}
	handle @mcp {
		reverse_proxy app:3000
	}
```

- [ ] **Passo 1 (teste):** bloco "Caddyfile": ler `deploy/caddy/Caddyfile`; o bloco `@mcp` existe; a lista `path` do `@mcp` **não**
  contém `authorize`; o `handle @mcp` não contém `forward_auth` nem `X-Rise-Borda`; o `@mcp` vem antes do `handle {` final.
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** editar o Caddyfile. Validar a sintaxe sem Docker no PC não dá (o `deploy-vps.sh` valida antes de aplicar); conferir
  a indentação por tabulação, como o resto do arquivo.
- [ ] **Passo 4:** rodar → PASSA.
- [ ] **Passo 5:** commit `MCP: ramo público do Caddy para o protocolo (authorize continua atrás do login)`.

## Parte 2: o rumo do Rise AI (decisão C1)

### Tarefa 11: sai o chat; a home vira "Conectar o Claude ou o ChatGPT"

**Arquivos:** remover `src/app/rise-ai/[conversaId]/page.jsx`, `src/app/api/rise-ai/conversar/route.js`,
`src/app/api/rise-ai/parar/route.js`, `src/components/riseAi/Chat.jsx`, `ControlesDaConversa.jsx`, `ListaDeConversas.jsx` (e
`Janela.jsx`/`fluxo.js` se só o chat os importa: conferir com grep); modificar `src/app/rise-ai/layout.jsx`, `page.jsx`, `acoes.js`
(ficam só as ações que a Revisão, `Avaliacao.jsx` e `ProporCorrecao.jsx` importam: conferir por grep), `src/lib/blocos.js`;
criar `src/components/riseAi/Conexoes.jsx` e as ações `listarConexoesAcao`/`desconectarAcao` em `src/app/rise-ai/acoes.js`;
modificar `scripts/teste-rise-ai.js` (sai o bloco "chat" e qualquer asserção que leia um arquivo removido; os blocos da lib ficam).

**Interfaces:**
- Consome: `listarConexoesDoLogin`, `revogarConexao` (Tarefa 4); `origemDoRise`.
- Produz:
  - `layout.jsx`: `exigirAcessoNaPagina("tela.riseAi", "ver")`; uma barra de abas no alto (`border-b-2`, a ativa em `border-acento`,
    como o cadastro de Produto) com **Conexões** (`/rise-ai`, para quem tem `riseAi.chat` em ver) e os `LINKS` de hoje filtrados
    por `pode`; sem coluna lateral; `children` embaixo.
  - `page.jsx`: `exigirAcessoNaPagina("riseAi.chat", "ver")` → `<Conexoes endereco={origem + "/mcp"} conexoes=... podeConectar=pode("riseAi.chat","editar") />`.
    "Nesta tela a pessoa vê primeiro o endereço para colar no Claude e as conexões ativas; a ação principal é Copiar o endereço."
    Cartão com o endereço e o botão Copiar; bolha "i" com os três passos (no claude.ai: Configurações › Conectores › Adicionar
    conector personalizado › colar o endereço › Conectar; entrar com o login do Rise; Autorizar); tabela "Conexões ativas"
    (cliente, conectado em, vale até, botão **Desconectar** com pop-up listando a conexão). Sem conexão: a linha "Nenhuma conexão
    ainda." dentro da tabela vazia.
  - `blocos.js`: `resumo: "Dúvidas anotadas pelo Claude e ChatGPT, conhecimento e consumo"`.
  - `acoes.js`: `listarConexoesAcao()` e `desconectarAcao(familia)` com `executarComAcesso("riseAi.chat", "ver" | "editar", ...)`.

- [ ] **Passo 1 (teste):** em `teste-mcp.js`, bloco "Conexões": `listarConexoesDoLogin` depois de duas famílias (uma revogada) → 1;
  `revogarConexao` de família alheia → 0. Em `teste-acessos.js`, guarda novo: nenhum arquivo de `src/app` importa
  `@/components/riseAi/Chat`. Em `teste-rise-ai.js`: o bloco "chat" sai; os blocos que leem `BarraDaResposta.jsx` e
  `TextoDaIA.jsx` ficam (a Revisão usa os dois).
- [ ] **Passo 2:** rodar `teste:acessos` → FALHA no guarda novo (o chat ainda existe).
- [ ] **Passo 3:** remover os arquivos; reescrever o layout, a page e as ações; criar `Conexoes.jsx`; `npm run lint`.
- [ ] **Passo 4:** `teste:rise-ai`, `teste:acessos`, `teste:mcp` → PASSAM. Na tela do PC: `/rise-ai` mostra o endereço e a tabela;
  `/rise-ai/<id antigo>` → 404; Revisão, Consumo e Configurações continuam abrindo pelas abas.
- [ ] **Passo 5:** commit `Rise AI: sai o chat interno; a home vira Conexões (Claude e ChatGPT)`.

### Tarefa 12: Configurações sem o interno; Consumo com uma barra

**Arquivos:** modificar `src/lib/riseAi/abasDeConfiguracao.js` (`ABAS = ["modelos", "orcamentos", "atendimento"]`; `RECURSO_DA_ABA`
e `CAMPOS_DA_ABA` sem `canais`; `orcamentos: ["orcamentoClientesBrl"]`; `atendimento: ["promptCliente"]`), `src/lib/acessos/recursos.js`
(sai `riseAi.configuracoes.canais`; descrições: orçamentos "Quanto a IA pode gastar por mês com os clientes.", atendimento "O
prompt das respostas ao cliente."), `src/components/riseAi/AbaOrcamentos.jsx` (só Clientes), `AbaAtendimento.jsx` (só
`promptCliente`), `src/app/rise-ai/configuracoes/page.jsx` (sem `AbaCanais`, sem `estadoDoOrcamento("INTERNO")`, sem o prompt
interno), `src/app/rise-ai/consumo/page.jsx` (uma `BarraDeOrcamento`, rótulo "Clientes (WhatsApp)"); remover
`src/components/riseAi/AbaCanais.jsx`; modificar `scripts/teste-rise-ai.js` (blocos "abas de configuracao" e "consumo com os
orcamentos") e `scripts/teste-acessos.js` (a lista de ids).

**Interfaces:** a lib não muda: `ESCOPOS` continua `["CLIENTES", "INTERNO"]`, `configuracao.internet` e `prompts.interno`
continuam gravados e lidos por `responder` (o Telegram e o WhatsApp decidem o que usar). `salvarAba("orcamentos", ...)` ignora
`orcamentoInternoBrl` se vier (campo de outra aba já é ignorado por `ehCampoDaAba`).

- [ ] **Passo 1 (teste):** `ABAS` tem 3; `salvarAba("canais", ...)` lança "Aba desconhecida."; `salvarAba("orcamentos", { orcamentoInternoBrl:
  "1" })` → "Nada para salvar."; `recursoPorId("riseAi.configuracoes.canais") === null`; a página de Consumo é lida como texto:
  contém uma `<BarraDeOrcamento` só.
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** implementar; `npm run lint`.
- [ ] **Passo 4:** `teste:rise-ai`, `teste:acessos` → PASSAM (ajustar as contagens da matriz que o recurso removido muda, e anotar no
  ledger). Na tela do PC: três abas; Orçamentos só com Clientes; Atendimento só com o prompt do cliente; Consumo com uma barra.
- [ ] **Passo 5:** commit `Rise AI: Configurações sem o orçamento interno, a internet e o prompt interno; Consumo com uma barra`.

### Tarefa 13: a Revisão do dia com as dúvidas do MCP

**Arquivos:** modificar `src/lib/riseAi/revisao.js` (`conversasDoDia` devolve `canal` e `cliente`: o `modelo` da primeira ASSISTENTE
quando `canal === "MCP"`, senão `null`), `src/components/riseAi/formatos.js` (`rotuloDoProvedor("mcp") === "conta própria"`,
`ehLocal("mcp") === true`), `src/components/riseAi/RevisaoDoDia.jsx` (chip `pelo <cliente>` no item da lista e no cabeçalho da
leitura quando `canal === "MCP"`; a mensagem USUARIO mostra os `estruturado.anexos` como `<details>` "📎 nome · N caracteres" com o
texto dentro), `src/components/riseAi/MensagemDaIA.jsx` (nenhuma mudança se a barra já lê `provedor`/`modelo`: conferir); testes
em `scripts/teste-mcp.js`.

- [ ] **Passo 1 (teste):** depois de um `anotarDuvida` de `zz-mcp-andrea`: `conversasDoDia(hojeEmSaoPaulo(), { administrador: true })`
  tem a conversa com `canal: "MCP"`, `cliente: "Claude"`, `modelos: ["mcp/Claude"]`, `custoBrl: 0`, `suspeita: false`;
  `rotuloDoProvedor("mcp") === "conta própria"`; `ehLocal("mcp") === true`; `resumoDoDia` conta a resposta em `mcp/Claude`;
  o `semPreco` do mês de teste (`orcamento.js`) é 0.
- [ ] **Passo 2:** rodar → FALHA.
- [ ] **Passo 3:** implementar; `npm run lint`.
- [ ] **Passo 4:** rodar → PASSA. Na tela do PC (com uma dúvida gravada por um script temporário `scripts/_anotar.mjs`, apagado
  depois): a Revisão lista "Dúvidas pelo Claude · 20/10" com o chip, a leitura mostra a pergunta, o anexo expansível e a
  resposta com o selo verde "conta própria · Claude" e "R$ 0,00".
- [ ] **Passo 5:** commit `Rise AI: as dúvidas anotadas pelo Claude/ChatGPT na Revisão do dia`.

### Tarefa 14: documentação, memória e o ritual

**Arquivos:** modificar `CLAUDE.md` (linha "Rise AI" da tabela Estado; seção nova "Servidor MCP (20/10/2026)" com o que mora onde, as
regras que custaram pensar, "Para pôr no ar" e o roteiro do dono; `npm run teste:mcp` em "Rodar"; nota "Entrega E abortada" na
seção da fase 2; a seção "Entrega A1" ganha a nota de que o chat saiu em C1), `docs/superpowers/specs/2026-10-12-rise-ia-agente-design.md`
(nota no topo: "Mudança de rumo em 20/10/2026: a Entrega A (chat) saiu da tela; a E foi abortada; o acesso aos dados é pelo MCP;
ver o plano 2026-10-20"); criar `docs/superpowers/plans/2026-10-20-mcp-rise-e-rumo-do-rise-ai-decisoes.md` (as decisões tomadas na
execução, o que custa se erradas, e o que não foi visto num servidor real); memória `projeto-rise-ai.md`.

- [ ] **Passo 1:** escrever os textos (sem código).
- [ ] **Passo 2:** ritual: `npm run lint`; `teste:mcp`, `teste:rise-ai`, `teste:acessos`, `teste:extracao`, `teste:coleta`,
  `teste:cadastros`; conferir `git status` (só os próprios arquivos; o `CLAUDE.md` tem alteração de outra sessão: commitar só o
  próprio trecho e conferir o HEAD depois).
- [ ] **Passo 3:** commit `docs: servidor MCP, rumo do Rise AI (C1) e Entrega E abortada`. Push só com o "sobe" ou no fim da sessão.

---

## Para pôr no ar (só com o "sobe" do dono)

1. **Antes do deploy, pelo dono:** na VPS, por SSH e arquivo temporário (nunca no texto do comando), o usuário da Andrea em
   `TINYAUTH_AUTH_USERS` (dúvida 5); na tela Usuários e funções, o usuário `andrea` com a Atendimento, e a função ajustada
   (dúvida 4).
2. Deploy pelo cartão "Atualizar a VPS": aplica `20261020_mcp_rise` (com backup antes) e, como o Caddyfile mudou, o script o valida
   e recarrega o Caddy. Nenhuma variável nova: `APP_URL_PUBLICA` (já existe) é o `issuer`.
3. Conferir por fora: `curl -s https://rise.4hobby.com.br/.well-known/oauth-authorization-server` devolve o JSON com `issuer`
   `https://rise.4hobby.com.br`; `curl -s -o /dev/null -w "%{http_code}" -X POST https://rise.4hobby.com.br/mcp` → 401;
   `https://rise.4hobby.com.br/mcp/oauth/authorize` no navegador → a tela de login do Tinyauth.
4. Deploy da A1 junto (a migration `20261013_rise_ia_entrega_a` ainda não subiu): o mesmo "sobe" aplica as duas.

## Roteiro de testes do dono

**No Rise do PC (depois de reiniciar o servidor):**
1. Rise AI › a home mostra "Conectar o Claude ou o ChatGPT" com o endereço `https://localhost:3000/mcp`, o botão Copiar e a tabela
   vazia "Nenhuma conexão ainda."; as abas Revisão, Consumo e Configurações continuam.
2. Configurações: três abas (Modelos, Orçamentos, Atendimento); Orçamentos só com Clientes R$ 70 e a barra; Atendimento só com o
   prompt do cliente. Consumo: uma barra.
3. `/rise-ai/<id de conversa antiga>` → página não encontrada; a conversa antiga continua na Revisão do dia em que foi feita.
4. Usuários e funções › Atendimento: o recurso "Rise AI › Acesso pelo Claude e ChatGPT" aparece com o nome novo; "Rise AI ›
   Configurações › Canais" sumiu.

**Na VPS, com o dono (conta dele no claude.ai):**
5. claude.ai › Configurações › Conectores › Adicionar conector personalizado › URL `https://rise.4hobby.com.br/mcp` › "Register
   automatically" › Conectar: abre a tela de login do Rise (Tinyauth), depois o cartão "Autorizar o acesso ao Rise: Claude quer
   consultar o Rise como maicol"; Autorizar → volta ao claude.ai com o conector ligado.
6. Numa conversa do Claude: "qual o preço e o estoque do 100101?" → o Claude usa `consultarProduto` e responde com preço e estoque;
   em Rise AI › a home mostra a conexão "Claude" na tabela; em Revisão do dia aparece "Dúvidas pelo Claude · dd/mm" com a pergunta
   e a resposta (chip "pelo Claude", selo verde "conta própria · Claude", R$ 0,00).
7. Mandar um PDF ao Claude e perguntar sobre ele: a dúvida na Revisão traz o anexo "📎 nome" com o texto que o Claude extraiu.
8. Perguntar "quanto custa para nós o 100101?" como o dono → o custo aparece (ele é administrador).
9. Desconectar na home do Rise AI → a próxima pergunta no claude.ai pede para reconectar (401 → login de novo).

**Na VPS, com a Andrea (depois da dúvida 5):**
10. O mesmo passo 5 na conta dela (grátis: é o único conector dela); perguntar "quanto custa para nós o 100101?" → a resposta diz
    que o custo é restrito; "quantos temos do 100101?" → quantidade exata ou faixa, conforme a função Atendimento.
11. Em Usuários e funções, desativar a `andrea` → a pergunta seguinte dela no claude.ai falha na hora; reativar → volta.
12. No dia seguinte, Revisão do dia do dia anterior: as dúvidas dela, com 👎 e "Propor correção" funcionando como antes
    (sugestão → aprovar → Conhecimento), e `buscarConhecimento` passando a devolver a nota nas próximas perguntas.

**ChatGPT (quando o plano do dono tiver "Add custom MCP server"):** chatgpt.com/plugins › Add custom MCP server ›
`https://rise.4hobby.com.br/mcp` › OAuth → a mesma tela Autorizar (cliente "ChatGPT") → as mesmas perguntas; na Revisão, chip
"pelo ChatGPT".

## Fora deste plano (anotado, não feito)

- CIMD (registro por documento de metadados do cliente): só se a dúvida 2 for Opção 2.
- Revogar conexões de OUTRO login pela tela de Usuários (hoje: desativar o usuário bloqueia na hora).
- Limite de taxa por token no `/mcp` (o Claude faz poucas chamadas por resposta; o registro mostra se um dia for preciso).
- Resposta em SSE, prompts e recursos MCP além de ferramentas, "Ver como" para o MCP.
- Entrega B (WhatsApp) e C (Telegram): o que elas precisam da lib continua intacto.
