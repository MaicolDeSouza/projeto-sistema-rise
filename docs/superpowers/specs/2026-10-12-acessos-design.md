# Acessos: funções, usuários e o bloco Configurações

Data: 12/10/2026 (revisada no mesmo dia depois de uma revisão de segurança e uma de arquitetura, marcadas "revisão";
e **refeita no mesmo dia com o plugin de UI/UX** do dono: a seção 5 virou o desenho completo das telas, com a skill
`frontend-design`, o Padrão visual do `CLAUDE.md` e a revisão `make-interfaces-feel-better`; o que mudou está marcado
"UI/UX"; e **ajustada na revisão 2**, na noite do mesmo dia, depois de uma segunda revisão de segurança e de código sobre
as telas, marcada "revisão 2"; consolidado em `docs/superpowers/investigacoes/2026-10-12-revisao-specs-rise-ia-acessos.md`).
Pedido do dono durante o brainstorming da fase 2 do Rise IA (`2026-10-12-rise-ia-agente-design.md`). É um
projeto próprio, para o Rise inteiro, e seu primeiro lançamento vem **antes** da Entrega A do agente.

## 1. Por quê

Hoje quem entra no Rise (login do Tinyauth) vê tudo: custo, fornecedores, integrações, servidor. A Andrea vai usar o Rise
todo dia (chat e caixa de entrada do Rise IA, Produtos, Pedidos), e o dono quer **decidir o que cada pessoa vê e edita**,
tela por tela e campo por campo, pela função dela. E quer isso num lugar só: um bloco **Configurações**, com cartões para
usuários, integrações e o Rise IA.

**Sucesso:** o dono cria a função "Atendimento", liga a Andrea a ela, e ela entra vendo só o que ele marcou; nada do
que ela não vê chega a ela nem pelo menu, nem pelo endereço, nem por uma ação, nem pela IA; e um Salvar dela nunca
apaga o que ela não podia editar.

## 2. Objetivos, não objetivos e anti-objetivos

**Objetivos:** funções com permissões por tela, por **dado sensível** e por campo; usuários com uma ou mais funções e
exceções pessoais; Painel mostrando só os cartões permitidos; o bloco Configurações; o Rise IA lendo as mesmas
permissões para decidir que ferramentas e campos oferece a cada pessoa.

**Não objetivos:** criar login e senha dentro do Rise (continua no Tinyauth, por SSH, com o ok do dono); permissão por
registro; auditoria de leitura; sessão com tempo próprio.

**Anti-objetivos:** tela que esconde o botão mas a ação do servidor aceita; permissão que o Rise IA ignora; um Salvar que
apaga o que a pessoa não via; o dono se trancar fora (sempre há um administrador); alguém se promover a administrador.

## 3. Conceitos

- **Recurso:** algo que se pode ver ou mexer, num catálogo único em código (`src/lib/acessos/recursos.js`, como
  `blocos.js`). Quatro tipos (revisão):
  - **telas** (cada item do menu e as sub-telas: Produtos, Produtos › cadastro, Canais de Venda › Mercado Livre...), com a
    **rota** de cada uma mapeada no catálogo (inclusive as rotas `/api/*`);
  - **dados sensíveis transversais**: `dado.custo` (custo e fornecedores), `dado.margem`, `dado.localizacao`,
    `dado.estoqueExato`, `dado.concorrentes`, `dado.pessoalDoCliente` (CPF, endereço, telefone), `dado.financeiro`. Um
    recurso só para cada dado, consultado **do mesmo jeito** por tela, ação, rota, indicador e ferramenta da IA: "custo"
    aparece em sete lugares do Rise, e não é um campo de uma aba;
  - **campos** de cada formulário (agrupados pelas abas), para a permissão de edição campo a campo;
  - **cartões do Painel** e **ações com efeito** (nível `executar`: publicar no ML, sincronizar com Bling ou LI, gerar com
    IA paga, Nano Banana, Photoroom, varrer fontes, marcar Conferido, deploy).
  O Rise IA acrescenta os seus (chat, caixa de entrada, assumir/passar/devolver, ensinar, aprovar sugestões, Revisão,
  Consumo, Configurações do Rise IA, pedir anúncios, métricas).
- **Nível:** tela `nenhum` / `ver` / `editar` / `excluir` (cada um inclui o anterior); dado sensível e capacidade do Rise IA
  `nenhum` / `ver` / `editar`; campo `nenhum` / `ver` / `editar`; cartão `nenhum` / `ver`; ação `nenhum` / `executar`.
- **Resolução** (revisão fechou): efetivo(campo) = `nenhum` se a tela é `nenhum`; senão o nível explícito do campo; senão
  `ver`. `editar` em campo só vale se a tela é `editar`. Campo que mostra um dado sensível vale o **menor** entre o nível
  do campo e o do dado. **Todo campo nasce "ver"** (decisão do dono em 12/10/2026, sem exceção para campo sensível novo:
  quem esconde é o dado sensível, não o campo). Campo que existe no formulário e não está no catálogo **falha o teste**,
  nunca chega a rodar.
- **Função:** nome, descrição e um nível por recurso (o que não está listado é `nenhum`). **Administrador** é fixa, vê e
  edita tudo, não se apaga nem se edita; **"Usuários e funções" não é delegável** (só Administrador, conferido em código),
  e **também não são delegáveis** (revisão 2) os recursos do Rise AI que falam com todos os clientes: **WhatsApp**
  (QR, Desconectar, instância), **Telegram** (token, bot) e **o prompt do canal do cliente**; ninguém concede nível
  acima do próprio.
- **Usuário:** login do Tinyauth (único, gravado em minúsculas), nome, assinatura (WhatsApp), chat do Telegram (vinculado
  por código de uso único, ver a spec do agente), `ativo`, funções (uma ou mais) e **exceções** (um nível por recurso que
  vence a função). Permissão efetiva = o maior nível entre as funções, depois as exceções. `ativo = false` vale como
  "não cadastrado" em todo lugar (tela, ações, serviço `ia`, Telegram), e o desativar de um usuário que é dono de
  conversas do WhatsApp pede o destino delas.

## 4. Regras

- **Quem confere é o servidor.** `src/lib/sessao.js` **não muda** (é puro, sem imports, e o layout, `/api/sair` e o
  `teste:vps` dependem disso); nasce `src/lib/acessos/sessao.js`, que lê o usuário e as permissões do banco uma vez por
  requisição (`cache()` do React) e expõe `pode(recurso, nivel)` e `exigirAcesso(recurso, nivel)`.
- **Cobertura total** (revisão): o layout esconde do menu o que é `nenhum`; cada página e cada rota `/api/*` chama
  `exigirAcesso` (um `proxy.js` nega por padrão o que não está no mapa rota → recurso); **toda Server Action**, de leitura
  ou de escrita, passa por um invólucro único que recebe o recurso e o nível e **devolve o dado já projetado** pelas
  permissões (as ações de leitura devolvem custo hoje e são chamáveis do console por qualquer logado). Hoje são 158 ações
  em 18 arquivos e 9 rotas; um **teste-guarda estático** percorre todo `page.jsx`, **`layout.jsx`** (o do Rise AI já lê
  conversas sem conferência), **`generateMetadata`**, `route.js` e arquivo `"use server"` e falha se faltar a conferência
  (ou se o arquivo não estiver numa lista de exceções explícita), no molde do teste que exige
  `executarComoAdministrador` no Rise AI (revisão 2: layouts e metadados entraram). **Rota ou ação por id** (conversa,
  mensagem, anexo) passa, além do recurso, pela regra de dono: uma função única "registro visível para esta sessão".
- **Valores derivados** de um dado sensível (margem e sua cor, custo total do kit, "valor do estoque a custo", `CustosDoML`,
  preço de fornecedor na lupa) declaram `dependeDe` no catálogo e seguem o dado.
- **Tela em `ver`:** campos de texto `readOnly`, listas e caixas `disabled`, botões de salvar, excluir e popups de edição
  rápida escondidos; a ação recusa mesmo assim. Produtos para a Andrea é isso: vê tudo, inclusive custo, e não muda nada.
  O desenho está na tela 6 de §5.
- **Dado ou campo em `nenhum`:** não é desenhado e o valor **não sai do servidor** (a página não o inclui nos dados que manda
  ao navegador; a ferramenta da IA não o devolve).
- **Salvar com campos travados nunca apaga** (revisão, crítico): o servidor monta a gravação **só com os campos `editar`**
  e mantém o valor do banco nos demais (`aplicarPermissoesDeCampo(registroAtual, dadosRecebidos, permissoes)`, uma função
  para todos os formulários). Campo travado não é enviado pelo navegador, e um valor que chegue para campo não editável é
  descartado com aviso. **Aba ou lista sem permissão de edição é ignorada na gravação, nunca interpretada como lista
  vazia** (fornecedores, concorrentes, composição, documentos e fotos são trocados por inteiro hoje; e `opcional` trata
  campo ausente como nulo, e `ativo` ausente como falso). Teste obrigatório: salvar o produto como usuário sem acesso a
  custo, fornecedores e `ativo`, e conferir que nada disso mudou no banco.
- **Painel:** cada cartão e a grade "Blocos do sistema" são filtrados; quem não vê nada vê o Painel vazio com o aviso. O
  Painel continua a tela inicial de todos (decisão do dono). Desenho na tela 5 de §5.
- **Administrador sempre existe** (revisão): `RISE_AI_ADMINS` continua valendo **sempre**, como quebra-vidro, além da
  tabela; a semeadura (os logins da variável viram usuários Administrador) é um passo idempotente na partida do `app`,
  não uma migration, e **só cria o que falta** (revisão 2): não devolve função tirada, e a Atendimento é criada uma vez
  só, com marca gravada, para não renascer a cada deploy depois de excluída. O login que está na variável aparece na
  tela com o selo **"Administrador pelo .env"**, e nele Ativo e a remoção da função ficam desabilitados (`title`: "tire
  o login de `RISE_AI_ADMINS` na VPS"): a tela nunca mostra o contrário do que o servidor faz. O último administrador
  ativo não pode ser desativado. Na VPS, sem variável e sem tabela, ninguém administra e a tela diz isso. Um login do
  Tinyauth não cadastrado vê o Painel vazio e "peça acesso ao administrador". Recuperação por script
  (`npm run acessos:admin -- <login>`, por SSH). **Logins reservados** (revisão 2): `pc` e `desconhecido` (os que o código
  de hoje usa sem login) não podem ser cadastrados, e o **segredo de borda** do Caddy (spec do agente, §9) é conferido
  em `acessos/sessao.js` com `timingSafeEqual`, não só no `proxy.js`, cujo `matcher` não pode deixar rota de fora.
- **PC de desenvolvimento** (revisão; revisão 2 corrigiu): "pc" é administrador **só** com o ambiente declarado (sem
  `RISE_PRODUCAO`) e com o `next dev` escutando em `127.0.0.1` (`--hostname 127.0.0.1` no script `dev`): no Next 16 página,
  layout e Server Action só veem `headers()`, não o socket, então a garantia é o endereço em que o servidor escuta,
  nunca o cabeçalho `Host`. `RISE_SIMULAR_LOGIN=<login>` (ignorada em produção; o deploy recusa um `.env` que a
  contenha) permite testar a Andrea no PC. **Com o banco do PC fora do ar**, o PC entra como "pc" sem menu filtrado e
  só Integrações abre: é lá que mora o cartão que traz o banco da VPS.
- **"Ver como"** só calcula e mostra o menu e as telas que a pessoa vê (somente leitura); nunca troca a sessão.
- **Auditoria:** quem mudou função, exceção ou usuário, com o antes e o depois; e (revisão 2) as ações de configuração
  do Rise AI que falam com os clientes: QR, Desconectar, token, bot, internet, orçamentos e limites (antes e depois,
  nunca o segredo). `ultimoAcessoEm` gravado no máximo a cada 10 minutos.
- **Rise AI herda** (revisão 2 corrigiu): hoje `exigirAdministrador(sessao)` é uma conferência síncrona que lança, e quem
  envolve as ações é `executarComoAdministrador(trabalho)`, sem recurso. Cada ação do Rise AI passa a
  `executarComAcesso(recurso, nivel, trabalho)` com o **recurso dela** (chat, caixa de entrada, Revisão, Conhecimento,
  Consumo, cada aba das Configurações), e o teste-guarda do lançamento 1 exige esse invólucro com recurso do catálogo
  em **todo** `src/app/rise-ai/` e `src/app/api/rise-ai/` (o de hoje só lê dois arquivos). O perfil **cliente**
  (WhatsApp) é fixo em código, fora do catálogo editável.
- As permissões são lidas do banco a cada requisição; nada em cache que sobreviva a uma mudança.

## 5. Telas (UI/UX, 12/10/2026)

### 5.1 Plano de desenho

Quem usa: o Maicol, uma vez por semana, para decidir o que a Andrea vê; a Andrea, todo dia, sem perceber que o
projeto existe (ela só vê um Rise menor). O trabalho principal é **uma decisão por recurso**, feita em lote. Então o
desenho gasta a ousadia num lugar só: a **matriz de permissões**, uma folha de marcação densa, com teclado. Todo o
resto é quieto e reaproveita o que o Rise já tem.

- **Cores:** as do tema (`globals.css`): fundo `#f4f6f9`, superfície `#ffffff`, borda `#e2e8f0`, texto `#16202c`, suave
  `#64748b`, acento `#2a8fd4`. Estado: `emerald` = marcado ou ativo, `amber` = atenção (dinheiro, estoque, pendência),
  `red` = só erro real, `slate` = neutro. Nada de gradiente, sombra colorida, faixa "eyebrow", marcador numerado,
  seta "→" em link nem rótulo em caixa alta: são os cacoetes de página gerada que o Padrão visual já proíbe.
- **Tipo:** Geist Sans, uma família. Título de página `text-2xl font-semibold`; título de seção ou cartão `text-base
  font-semibold`; corpo `text-sm`; detalhe `text-xs text-suave`; **todo número que muda** (contagens, datas, horas,
  percentuais) em `tabular-nums`.
- **Leiaute:** página de bloco = grade de `CartaoDeAtalho`; lista = tabela paginada (100 por página) com filtros compactos
  no topo; formulário = `PageHeader` com a seta de voltar e a ação principal à direita, abas lado a lado; edição curta
  ou confirmação = `Janela` por cima. Tudo alinhado à esquerda; largura de conferência 1366 px (notebook).
- **Princípios:** uma ação principal por tela; estado em vez de texto; mostrar só o que tem dado; textos curtos com
  verbo e objeto; nada de parágrafo explicativo (bolha "i" ou `title`). Cada tela abaixo começa pela linha-guia "o
  operador vê primeiro X e a ação principal é Y".
- **Piso de qualidade** (o construtor cumpre sem anunciar): funciona no celular em uma coluna; foco visível
  (`focus-visible:ring-2 ring-acento`, o padrão da barra lateral); `prefers-reduced-motion` desliga toda animação;
  contraste AA; alvo de clique de 40 px nos botões de ícone.

**Mapa das rotas** (UI/UX): `/configuracoes` (cartões), `/configuracoes/usuarios` (abas Usuários e Funções),
`/configuracoes/usuarios/novo`, `/configuracoes/usuarios/<id>`, `/configuracoes/funcoes/nova`,
`/configuracoes/funcoes/<id>`. Os cartões Integrações e Rise IA continuam apontando para `/integracoes` e
`/rise-ai/configuracoes` (revisão: são ~50 referências; nenhuma rota se move). Todas as telas de `/configuracoes/*`
acendem o item Configurações do menu (`ehRotaAtiva` por prefixo), **e também `/integracoes` e `/rise-ai/configuracoes`**
(revisão 2: fora de `blocos.js`, Integrações não acenderia item nenhum; o item ganha uma lista de rotas extras).

### 5.2 Tela 1: o menu e a página Configurações (lançamento 1)

Linha-guia: o operador vê primeiro os cartões que pode abrir; a ação principal é abrir um.

- **Menu:** item **Configurações** por último, depois de Ferramentas, ícone `Settings` (engrenagem). **Integrações sai
  do menu** (vira cartão). O trilho do Rise AI mantém o link "Configurações" (mesma rota). Com o menu recolhido, só a
  engrenagem; o item só aparece para quem vê ao menos um cartão.
- **Página:** `PageHeader` "Configurações" com a descrição "Usuários, integrações e o Rise IA." e uma grade de três
  `CartaoDeAtalho`, no desenho de Ferramentas; o cartão inteiro é o link. Cada cartão mostra na linha de detalhe **um
  dado vivo**, nunca uma frase fixa:

  | Cartão | Resumo | Detalhe (calculado no servidor) | Quem vê |
  | --- | --- | --- | --- |
  | Usuários e funções | Quem entra no Rise e o que cada um vê e edita. | "2 usuários · 2 funções" | só Administrador |
  | Integrações | Conexões com o Bling, o Mercado Livre e a Loja Integrada. | "3 conectadas" ou "1 expirada · 2 conectadas" (a pior situação primeiro) | recurso próprio |
  | Rise AI | Modelos, chaves, orçamentos e o texto do assistente. | "Padrão: Anthropic · claude-haiku-5-5" | recurso próprio |

- Sem banner, sem texto de ajuda, sem estado vazio: quem não vê cartão algum não vê o item no menu.

### 5.3 Tela 2: Usuários e funções (lançamento 1, só Administrador)

Linha-guia: o dono vê primeiro quem tem acesso e com qual função; a ação principal é adicionar um usuário (ou criar
uma função, na outra aba).

```
← Usuários e funções                                              [+ Adicionar usuário]
[Usuários] [Funções]
🔍 nome ou login                                        ☐ mostrar inativos
Nome        Login     Funções                      Último acesso
Maicol      maicol    [Administrador 🔒]  (você)    hoje 09:12
Andrea      andrea    [Atendimento]                  ontem 17:40
```

- **Duas abas** (regra 5), no desenho das abas do cadastro de Produto (barra com `border-b-2`, a ativa em `border-acento`;
  revisão 2: as da Revisão do Rise AI são pílulas, fora do padrão); a ação principal do cabeçalho troca com a aba
  ("Adicionar usuário" / "Criar função"). A tabela é a de hoje (100 por página).
- **Aba Usuários:** Nome, Login, Funções (um `Badge` neutro por função; Administrador com o cadeado), Último acesso
  (relativo, `tabular-nums`, `title` com a data completa). A linha inteira abre `/configuracoes/usuarios/<id>`. A própria
  linha ganha o selo "você". Inativo fica esmaecido com o selo "inativo" e **só aparece com "mostrar inativos" marcado**
  (regra 4). Busca por nome e login (`CampoBusca`).
- **Aba Funções:** Nome, Descrição, Usuários (quantos), Telas liberadas ("12 de 31", `tabular-nums`). A linha abre
  `/configuracoes/funcoes/<id>`; Administrador abre em somente leitura (tela 3, com o cadeado), porque é fixa.
- **Estado vazio** só na aba Usuários sem ninguém além da semeadura: `EmptyState` "Só você entra no Rise por enquanto." com
  o botão "Adicionar usuário". Funções nunca fica vazia (Administrador e Atendimento vêm da semeadura).

### 5.4 Tela 3: a função e a matriz (lançamento 1)

Linha-guia: o dono vê primeiro o que a função libera, bloco a bloco; a ação principal é Salvar.

```
← Atendimento                                                    [Ver como ▢] [Salvar]
Nome [Atendimento      ]   Descrição [Atende clientes pelo WhatsApp e pelo Rise      ]
┌ Grupos ───────────┬ Produtos ─────────────────────── nenhum   ver   editar  excluir ┐
│ Painel        2/5 │ 🔍 filtrar…                        [todos desta lista ▾]        │
│ Cadastros     6/6 │ Produtos (lista)                      ○       ●      ○      ○   │
│ Produtos    ● 3/4 │ Produtos › cadastro                   ○       ●      ○      ○   │
│ Canais de V.  2/5 │ Produtos › canais do produto          ●       ○      ○      ○   │
│ Rise AI       4/9 │ ───── Ações ─────                   nenhum  executar            │
│ Configurações 0/3 │ Sincronizar com o Bling               ●       ○                 │
│ Dados sens.   3/7 │ Marcar Conferido                      ●       ○                 │
└───────────────────┴────────────────────────────────────────────────────────────────┘
3 alterações não salvas                                           [Cancelar] [Salvar]
```

- **Cabeçalho:** `PageHeader` com a seta para `/configuracoes/usuarios`, o nome da função como título, "Ver como"
  (ícone de olho, secundário) e **Salvar** (principal). Nome e Descrição numa linha só; nome repetido vira erro embaixo
  do campo ao salvar.
- **Trilho de grupos à esquerda** (um grupo por vez, regra 5, em vez de 20 seções empilhadas): **um grupo por bloco de
  `blocos.js`**, na ordem do menu, com tudo o que é daquele bloco dentro (as telas, as sub-telas, as ações e, no Painel,
  os cartões; no Rise AI, as capacidades; em Configurações, Integrações e as abas do Rise AI), e um último grupo
  transversal, **Dados sensíveis** (revisão 2: grupos "Cartões do Painel" e "Ações" separados repetiam blocos). Cada
  grupo mostra "liberados/total" em `tabular-nums` e um ponto `acento` quando tem alteração não salva. Largura fixa de
  200 px.
- **Lista do grupo à direita:** uma linha por recurso; sub-telas indentadas com "›" (Produtos › cadastro). Tela em
  `nenhum` esmaece as sub-telas e os campos dela (o efetivo é `nenhum`, §3). Em cada linha, o nível é um **grupo de
  rádio em forma de segmentos** (`nenhum / ver / editar / excluir`; ações só `nenhum / executar`; cartões só
  `nenhum / ver`): célula de 40 × 40 px, marcada em `emerald`, com foco visível e **teclado**: setas andam, `0 1 2 3`
  marcam o nível. O cabeçalho da lista tem **"todos desta lista"** (o "marcar todos" da versão anterior), que põe o
  mesmo nível em todas as linhas visíveis; a bolha "i" do cabeçalho explica a ordem (`excluir` inclui `editar`, que
  inclui `ver`). A busca filtra as linhas de **todos** os grupos (as de outros grupos aparecem com o nome do grupo na
  frente), para "custo" achar `dado.custo`, a coluna da lista e o campo da aba.
- **Dados sensíveis** é um grupo com os sete recursos de §3, cada um com a bolha dizendo onde aparece ("custo:
  cadastro, lista, kit, indicadores, lupa, ML e chat"). **Não têm linha** os recursos não delegáveis de §3: "Usuários e
  funções", e os de WhatsApp, Telegram e prompt do cliente no grupo Rise AI (revisão 2).
- **Campos** (lançamento 3): a linha da tela ganha uma seta que abre os campos dela agrupados pela aba do formulário, com
  `nenhum / ver / editar`; até lá a seta não existe (regra 4).
- **Rodapé fixo** só quando há alteração (regra 4): "N alterações não salvas", Cancelar e Salvar. Sair da página com
  alteração pede confirmação do navegador. Depois de salvar, o rodapé some e o trilho perde os pontos.
- **Administrador:** todas as células em `editar`/`executar`, desabilitadas, e o selo "Função fixa · vê e edita tudo"
  no lugar do Salvar.
- **Excluir função:** no menu "⋯" do cabeçalho, por último; o popup lista quem tem a função ("Andrea perde o acesso de
  Atendimento") antes de confirmar. Desabilitado para a fixa, com o motivo no `title`.
- **Ver como** abre a janela da tela 4 calculada para "alguém só com esta função".

### 5.5 Tela 4: o usuário (lançamento 1)

Linha-guia: o dono vê primeiro quem é a pessoa e o que ela pode; a ação principal é Salvar.

```
← Andrea                                                             [Ver como ▢] [Salvar]
[Dados] [Acesso] [Histórico]
Nome  [Andrea          ]   Login [andrea   ] (i)   Assinatura [Andrea ] (i)   Ativo (●)
Telegram   Não vinculado   [Gerar código de vínculo]   ← só Administrador, só com o bot configurado
```

- **Aba Dados:** Nome; Login (minúsculas; bolha: "o mesmo login da tela de entrada do Rise, criado por SSH"); Assinatura
  (bolha: "nome que assina as respostas no WhatsApp; nasce com o primeiro nome"); **Ativo** como interruptor (no login
  que vem de `RISE_AI_ADMINS`, desabilitado com o selo "Administrador pelo .env", §4). A linha **Telegram** só existe
  para **Administrador** e quando o bot está configurado (Entrega C da spec do agente; o bot é só do dono): "Não
  vinculado" + **Gerar código de vínculo** (mostra o código de uso único, 10 ou mais caracteres aleatórios guardado
  como hash, e "vale por 10 min; envie `/vincular CÓDIGO` ao bot"); quando alguém manda o código, a linha passa a
  "Pedido de <nome> (@usuario) · **Confirmar** · Recusar", e o vínculo só vale depois do Confirmar (revisão 2: o bot é
  público, e 5 tentativas erradas num chat o silenciam e anulam o código); vinculado: "Vinculado em dd/mm às hh:mm" +
  Desvincular. `telegramChatId` é único.
- **Aba Acesso:** **Funções** como lista de caixas de marcação (nome, descrição e "12 de 31 telas"); **Exceções** como
  tabela compacta (Recurso · Nível · lixeira) que só aparece quando há alguma, com "Adicionar exceção" abrindo uma
  `Janela` (busca de recurso + segmentos de nível). Sem função e sem exceção, a pessoa entra e vê o Painel vazio
  (tela 5): a aba diz isso numa linha quieta ("Sem função: vê só o Painel vazio."), que some ao marcar uma.
- **Aba Histórico** (UI/UX, decisão minha, §10; lançamento 2): a `AuditoriaDeAcesso` desta pessoa, mais recente
  primeiro: Quando · Quem · O quê · Antes → Depois; 100 por página; `EmptyState` "Nenhuma alteração registrada." quando
  vazia. Até o lançamento 2 a aba não existe (regra 4).
- **Ver como** (cabeçalho; lançamento 2): `Janela` larga, somente leitura, "O que Andrea vê", calculada **do que está
  salvo** pela mesma função de resolução do `pode()` (a prévia nunca diverge do real): o menu
  que ela terá (blocos e sub-telas com o nível em `Badge`), os cartões do Painel, os dados sensíveis e as ações
  liberadas; o que é `nenhum` não aparece. Com alteração não salva o botão fica desabilitado com `title` "Salve para
  calcular" (regra 8).
- **Salvar:** valida login único e em minúsculas. Desligar **Ativo** de quem é dona de conversas do WhatsApp (Entrega B)
  abre, no Salvar, o popup "N conversas estão com Andrea. Para onde vão?" com três opções em rádio (Devolver à IA ·
  Passar para <atendente> · Aguardando retorno); sem conversas o popup não existe. O interruptor do **último
  administrador ativo** fica desabilitado com `title` "último administrador ativo".
- **Não existe "Excluir usuário"** (revisão 2, decisão do dono): excluir liberaria o login para outra pessoa herdar as
  conversas do Rise (ligadas pela string `usuario`) e deixaria conversas do WhatsApp sem dona. Desativar cobre tudo:
  inativo vale como não cadastrado em todo lugar, o login fica reservado, histórico e conversas continuam coerentes.
- **Novo usuário** (`/configuracoes/usuarios/novo`): a mesma tela, abas Dados e Acesso, título "Novo usuário".

### 5.6 Tela 5: o Rise de quem tem acesso limitado (menu e Painel, lançamento 2)

Linha-guia: a Andrea vê primeiro só os blocos dela; a ação principal continua a de cada bloco.

- **Barra lateral:** só os blocos com nível ≥ `ver`; a busca do menu também. O rodapé mostra a inicial, o nome e, na
  linha pequena, **a função** ("Atendimento") no lugar de "conectado" (UI/UX, decisão minha, §10). No PC com
  `RISE_SIMULAR_LOGIN`, a linha pequena vira "simulando andrea" em `amber` (estado, não aviso).
- **Painel:** os indicadores e a grade "Blocos do sistema" filtrados pelos cartões liberados. Sem cartão algum, o Painel
  é um `EmptyState` (ícone de cadeado) com uma frase só:
  - não cadastrado ou inativo: "Seu login ainda não foi cadastrado no Rise. Peça acesso ao administrador.";
  - cadastrado sem nada liberado: "Nada liberado para o seu acesso ainda. Peça ao administrador.";
  - **sem administrador na VPS** (erro real, em vermelho): "O Rise está sem administrador. Na VPS, rode
    `npm run acessos:admin -- <login>`."
- **Endereço digitado à mão** de tela em `nenhum`: a página responde 404 do Rise (não existe para essa pessoa), e a
  rota `/api/*` responde 403 sem corpo. Nada de "você não tem permissão" com link: o anti-objetivo é a pessoa saber o
  que não vê.

### 5.7 Tela 6: tela em `ver` (lançamento 2) e ação recusada

Linha-guia: a Andrea vê o cadastro inteiro como ele é; não há ação principal, e o selo diz por quê.

- O `PageHeader` da tela ganha, ao lado do título, o `Badge` neutro com cadeado **"Somente leitura"** (`title`: "Seu
  acesso a Produtos é de leitura"). É o único acréscimo: nada muda de lugar.
- Campos de texto `readOnly` com fundo `bg-fundo`; caixas, listas e interruptores `disabled`; **não são desenhados**: os
  botões Salvar, Excluir e Clonar, os popups de edição rápida, as lixeiras e os lápis das linhas, o ✦ da IA, o
  "Adicionar" das abas. Busca, filtros, abas, lupa de leitura e paginação continuam. A linha da tabela continua
  abrindo o registro (em `ver`).
- **Dado sensível em `nenhum`:** a coluna, o campo, o ícone e o valor derivado não existem na tela nem nos dados que
  o servidor manda (§4); a aba Fornecedores / Concorrentes de quem não vê custo mostra os concorrentes e nenhum
  fornecedor, sem lacuna visível.
- **Ação recusada** (só acontece com a página aberta antes de uma mudança de permissão): a ação devolve
  `{ ok: false, erro: "Sem permissão para salvar o produto" }`, a tela mostra o erro vermelho de hoje com o botão
  "Recarregar", e a página volta já em `ver`. O botão nunca "some sem dizer" (regra 8): ou ele não é desenhado porque a
  tela é `ver`, ou está lá e funciona.

### 5.8 Integrações e Rise IA dentro de Configurações

As duas telas não mudam de lugar. Integrações ganha, no `PageHeader`, a seta de voltar para `/configuracoes`. A tela do
Rise AI **não ganha seta** (revisão 2): ela mora no trilho do Rise AI, não usa `PageHeader`, e o link "Configurações" do
trilho já leva a ela. A lista de blocos do Painel passa a mostrar o cartão **Configurações** no lugar de Integrações.

### 5.9 Acabamento (revisão `make-interfaces-feel-better`)

O que o construtor aplica, no padrão do projeto, e o que a revisão da tela pronta confere:

| Ponto | Como fica |
| --- | --- |
| Números que mudam | `tabular-nums` em contagens ("3/4", "12 de 31"), datas relativas e no rodapé "N alterações" |
| Alvo de clique | células da matriz 40 × 40 px; ícones (olho, "⋯", lixeira) com 40 px de área, sem sobreposição |
| Raio concêntrico | segmentos de nível dentro da célula: raio interno + folga = raio da célula; selos (`rounded-full`) seguem como estão |
| Transições | só `background-color, border-color, opacity`, 150 ms `ease-out`; nunca `transition: all` |
| Janela | entra em 150 ms (opacidade + 4 px para cima), sai em 100 ms; `prefers-reduced-motion` tira as duas |
| Quebra de texto | `text-wrap: balance` nos títulos, `pretty` nas descrições dos cartões e nas frases de estado vazio |
| Foco e teclado | anel `ring-acento` em toda célula e botão; a matriz inteira se opera sem mouse |
| Rolagem | cabeçalho da lista do grupo fixo (`sticky`) e o rodapé de alterações fixo embaixo, sem pular o conteúdo |
| Largura | conferida em 1366 px: trilho 200 px, colunas de nível 72 px cada, nome do recurso com reticências e `title` |

## 6. Banco (aditivo)

`UsuarioRise` (login único em minúsculas, nome, assinatura, telegramChatId, ativo, criadoEm, ultimoAcessoEm),
`FuncaoRise` (nome único, descricao, fixa), `PermissaoDaFuncao` (`@@unique([funcaoId, recurso])`, nivel), `UsuarioFuncao`
(`@@id([usuarioId, funcaoId])`), `ExcecaoDoUsuario` (`@@unique([usuarioId, recurso])`, nivel), `AuditoriaDeAcesso`
(quem, quando, o quê, antes, depois).

## 7. Primeiro dia

- Funções criadas na semeadura: **Administrador** (fixa) e **Atendimento**: Painel (cartões a escolher pelo dono),
  Cadastros `ver`, Canais de Venda `ver`, Produtos `ver` com todos os dados sensíveis `ver` (a Andrea vê custo e
  fornecedores, decisão do dono) e todos os campos `ver`, Pedidos `ver`, Estoque `ver`, Financeiro `ver`, Rise IA: chat,
  caixa de entrada e assumir/passar/devolver `editar`; o resto `nenhum`. Nenhuma ação `executar`.
- Usuários: o Maicol (Administrador) pela semeadura; a Andrea cadastrada pelo dono na tela, com o login que eu criar no
  Tinyauth com o ok dele, e o segundo fator ligado para os dois.

## 8. Lançamentos (revisão)

1. **Núcleo:** tabelas, catálogo (**já com os sete dados sensíveis de §3**, lidos por `pode()` nas ferramentas do Rise AI:
   sem isso "se vê custo na tela, vê custo no chat" não vale na Entrega A; revisão 2), `acessos/sessao.js`, invólucro
   das ações, semeadura, o menu e as telas 1 a 4 de §5 (Configurações, Usuários e funções, a função com a matriz, o
   usuário, **sem** "Ver como" e sem a aba Histórico), e as telas e ações do **Rise AI** sob o novo esquema, com o
   teste-guarda cobrindo `src/app/rise-ai/` e `src/app/api/rise-ai/`. É a única dependência real da Entrega A do agente.
2. **O resto do Rise:** mapa rota → recurso, as 158 ações e as 9 rotas sob o invólucro, a projeção dos dados sensíveis
   em todas as telas, as telas 5 e 6 (menu e Painel filtrados, tela em `ver`), "Ver como" e a aba Histórico, o
   teste-guarda completo. **A Andrea só ganha login depois deste, por isso ele vem antes da Entrega B** (WhatsApp) na
   ordem da spec do agente (§13 dela; revisão 2).
3. **Campos:** permissão campo a campo, `aplicarPermissoesDeCampo` em cada formulário, o catálogo de campos conferido contra
   os `name=` dos formulários, a seta de campos na matriz. No primeiro dia da Andrea isso não faz falta (tudo `ver`).

## 9. O que fica para o construtor

A lista exata de telas, sub-telas e rotas no catálogo (percorrer `blocos.js`, as rotas e os `acoes*.js`), o catálogo de
campos de cada formulário aba por aba (`FormularioProduto`, `FormularioCliente`, `FormularioParceiro`, os editores de
anúncio; os blocos "em breve" entram quando nascerem), os pontos em que cada dado sensível aparece (começar pela lista de
§3 e pelos sete lugares do custo), o `proxy.js` e o `teste:acessos` (resolução de níveis, catálogo × formulários, guarda
estático, Salvar com campos travados, dados `ZZ-AC-*`). Antes de cada lançamento, um esboço em HTML das telas novas de
§5 mostrado ao dono, e a tela pronta passada pela revisão `make-interfaces-feel-better` em 1366 px (regra 10).

## 10. Decisões minhas da revisão UI/UX (o dono confere)

1. **Configurações é o último item do menu**, depois de Ferramentas, com a engrenagem; Integrações sai do menu.
2. **Usuários e funções é uma tela com duas abas**; a função e o usuário são **páginas próprias** (como Cadastros), não
   janelas: a matriz precisa da largura inteira.
3. **A matriz mostra um grupo por vez**, com o trilho à esquerda e "todos desta lista" por coluna; a busca atravessa os
   grupos.
4. **"Ver como" é uma janela de leitura** calculada do que está salvo, no usuário e na função (lançamento 2).
5. **O histórico da auditoria aparece como terceira aba do usuário** (a spec dizia só "gravar"; sem tela ninguém leria;
   lançamento 2).
6. **O rodapé do menu mostra a função** no lugar de "conectado".
7. **A linha do Telegram** no usuário só aparece quando o bot existir; o popup do destino das conversas, só a partir da
   Entrega B.
8. **Tela em `ver` ganha só o selo "Somente leitura"** no cabeçalho; nada mais muda de lugar.
9. **Endereço de tela sem acesso dá 404**, não uma página "sem permissão": quem não vê não sabe que existe.

Da revisão 2 (noite de 12/10/2026, aprovadas pelo dono, "Opção 1"):

10. **Não existe Excluir usuário; só Desativar.**
11. **WhatsApp, Telegram e o prompt do cliente não são delegáveis**, como "Usuários e funções".
12. **O nome na tela é "Rise AI"**, o do bloco do menu, em todo lugar (a spec do agente continua se chamando "Rise IA").
13. **As abas seguem o desenho do cadastro de Produto**, não as pílulas da Revisão.
14. **Um grupo por bloco na matriz**, mais "Dados sensíveis"; os ex-grupos "Cartões do Painel" e "Ações" entram nos blocos.
15. **"Ver como" e Histórico ficam para o lançamento 2**, que entra na ordem antes do WhatsApp.
