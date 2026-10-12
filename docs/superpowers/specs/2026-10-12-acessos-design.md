# Acessos: funções, usuários e o bloco Configurações

Data: 12/10/2026 (revisada no mesmo dia depois de uma revisão de segurança e uma de arquitetura; o que mudou está
marcado "revisão"). Pedido do dono durante o brainstorming da fase 2 do Rise IA (`2026-10-12-rise-ia-agente-design.md`).
É um projeto próprio, para o Rise inteiro, e seu primeiro lançamento vem **antes** da Entrega A do agente.

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
  edita tudo, não se apaga nem se edita; **"Usuários e funções" não é delegável** (só Administrador, conferido em código)
  e ninguém concede nível acima do próprio.
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
  em 18 arquivos e 9 rotas; um **teste-guarda estático** percorre todo `page.jsx`, `route.js` e arquivo `"use server"` e
  falha se faltar a conferência (ou se o arquivo não estiver numa lista de exceções explícita), no molde do teste que
  exige `executarComoAdministrador` no Rise IA.
- **Valores derivados** de um dado sensível (margem e sua cor, custo total do kit, "valor do estoque a custo", `CustosDoML`,
  preço de fornecedor na lupa) declaram `dependeDe` no catálogo e seguem o dado.
- **Tela em `ver`:** campos de texto `readOnly`, listas e caixas `disabled`, botões de salvar, excluir e popups de edição
  rápida escondidos; a ação recusa mesmo assim. Produtos para a Andrea é isso: vê tudo, inclusive custo, e não muda nada.
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
  Painel continua a tela inicial de todos (decisão do dono).
- **Administrador sempre existe** (revisão): `RISE_AI_ADMINS` continua valendo **sempre**, como quebra-vidro, além da
  tabela; a semeadura (os logins da variável viram usuários Administrador) é um passo idempotente na partida do `app`,
  não uma migration; o último administrador ativo não pode ser desativado nem removido. Na VPS, sem variável e sem tabela,
  ninguém administra e a tela diz isso. Um login do Tinyauth não cadastrado vê o Painel vazio e "peça acesso ao
  administrador". Recuperação por script (`npm run acessos:admin -- <login>`, por SSH).
- **PC de desenvolvimento** (revisão): "pc" é administrador **só** com o ambiente declarado e o pedido vindo do loopback
  pelo socket (nunca pelo cabeçalho `Host`, que o cliente escolhe); o `next dev` passa a escutar em `127.0.0.1`; e
  `RISE_SIMULAR_LOGIN=<login>` (ignorada em produção) permite testar a Andrea no PC sem produção.
- **"Ver como"** só calcula e mostra o menu e as telas que a pessoa vê (somente leitura); nunca troca a sessão.
- **Auditoria:** quem mudou função, exceção ou usuário, com o antes e o depois. `ultimoAcessoEm` gravado no máximo a cada
  10 minutos.
- **Rise IA herda:** `exigirAdministrador` vira alias de `executarComAcesso(recurso, nivel)`; o teste-guarda do Rise IA é
  atualizado de propósito, sem afrouxar. O perfil **cliente** (WhatsApp) é fixo em código, fora do catálogo editável.
- As permissões são lidas do banco a cada requisição; nada em cache que sobreviva a uma mudança.

## 5. O bloco Configurações

Item novo no menu, **Configurações**, como Ferramentas e Cadastros: a página é uma grade de cartões, cada cartão um
recurso com permissão própria. **Os cartões são links para as rotas de hoje, sem mover rota** (revisão: são ~50
referências a `/integracoes` e `/rise-ai/configuracoes`); os itens antigos saem do menu.
- **Usuários e funções** (só Administrador): lista de usuários (login, nome, funções, último acesso) e de funções; o
  formulário da função é a matriz recurso × nível, agrupada por bloco e aba, com busca e "marcar todos" por aba; o do
  usuário tem as funções, as exceções e o "Ver como".
- **Integrações:** o bloco de hoje (o cartão "Servidor VPS" continua só no PC).
- **Rise IA:** a tela de configurações do Rise IA de hoje (modelos, chaves, internet, orçamentos, tempos, prompt).

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

1. **Núcleo:** tabelas, catálogo, `acessos/sessao.js`, invólucro das ações, semeadura, bloco Configurações com os três
   cartões, e as telas e ações do **Rise IA** sob o novo esquema. É a única dependência real da Entrega A do agente.
2. **O resto do Rise:** mapa rota → recurso, as 158 ações e as 9 rotas sob o invólucro, dados sensíveis transversais,
   Painel filtrado, teste-guarda. A Andrea só ganha login depois deste.
3. **Campos:** permissão campo a campo, `aplicarPermissoesDeCampo` em cada formulário, o catálogo de campos conferido contra
   os `name=` dos formulários. No primeiro dia da Andrea isso não faz falta (tudo `ver`).

## 9. O que fica para o construtor

A lista exata de telas, sub-telas e rotas no catálogo (percorrer `blocos.js`, as rotas e os `acoes*.js`), o catálogo de
campos de cada formulário aba por aba (`FormularioProduto`, `FormularioCliente`, `FormularioParceiro`, os editores de
anúncio; os blocos "em breve" entram quando nascerem), os pontos em que cada dado sensível aparece (começar pela lista de
§3 e pelos sete lugares do custo), o desenho da matriz, o `proxy.js` e o `teste:acessos` (resolução de níveis, catálogo ×
formulários, guarda estático, Salvar com campos travados, dados `ZZ-AC-*`).
