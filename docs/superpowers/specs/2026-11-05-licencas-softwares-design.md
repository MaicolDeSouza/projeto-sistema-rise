# Licenças Softwares (Ferramentas): LightBurn, Mach3 e os próximos programas

Data: 05/11/2026. Pedido do dono: "Hoje trabalho com venda de softwares também e precisaria fazer o controle das
licenças desse software. Hoje faço controle manual via Excel. Hoje trabalho com 2 software (LightBurn e Mach3) apenas
mas com possibilidade de ampliar futuramente. Deixe isso preparado." Brainstorming na mesma conversa, com as duas
planilhas do Google Drive (`Controle licencas lightburn`, abas "Licencas em geral" e "Licencas maquinas 4hobby";
`Controle licencas mach3`), a pasta `Licenças Mach3/Licencas/` com os arquivos de licença e as telas do portal da
LightBurn. Abordagem escolhida: **Opção 1, um módulo Licenças genérico, como cartão "Licenças Softwares" dentro de
Ferramentas** (pedido do dono: "quero criar esse dentro de ferramentas em formato de cartão também chamada licenças
Softwares").

## 1. Intenção e porquê

O dono revende licenças de dois programas. O **LightBurn** é vendido como chave de texto: cada chave serve até 3 PCs,
e ele reaproveita as vagas. Quando um cliente compra, ele procura uma chave sem PC ativo, vai ao site da LightBurn e
compra uma renovação (ou uma chave nova) e vincula o cliente àquela chave; a mesma chave pode ficar com vários
clientes, uma linha cada. O **Mach3** é vendido como arquivo: um `Mach1Lic.dat` de 201 bytes amarrado a um nome que
ele escolhe ao comprar ("Mach3 VD60"); o cliente copia o arquivo em `C:\Mach3` seguindo um PDF de instruções, e o
mesmo arquivo pode ser entregue a mais de um cliente.

Hoje tudo mora em duas planilhas e numa pasta do Google Drive, e o que decide uma venda (qual chave tem vaga, quando o
cliente usou o programa pela última vez, quando a chave expira) só existe no portal da LightBurn, consultado chave a
chave. O dono quer: as licenças no Rise, as linhas de cliente preenchidas por ele, e **expiração, ativações e último
uso trazidos do portal de forma semi-automática, por uma extensão do Chrome** no molde da do AliExpress. O cliente de
cada linha tem de ter nome e CPF ou CNPJ. O arquivo do Mach3 tem de ser guardado "com muito cuidado para não perder",
com upload e download pelo Rise.

Depois de pronto, o processo dele é: cliente compra; abre Licenças Softwares; a lista mostra as chaves com vaga livre e
o último uso de cada PC; escolhe a chave; compra a renovação pelo botão "Site da LightBurn"; clica "Vincular cliente"
na chave; manda a chave ao cliente como hoje; de tempos em tempos abre o portal e clica "Enviar ao Rise" na extensão,
e a tela passa a mostrar o PC novo, o último acesso e a nova data de expiração. No Mach3: compra o arquivo, envia ao
Rise, vincula o cliente e baixa o zip para mandar junto com o PDF.

## 2. Goals, non-goals, anti-goals

**Goals**
- Cartão "Licenças Softwares" em Ferramentas, com uma aba por programa (LightBurn e Mach3 de saída). Programa novo é um
  cadastro, não código: nome, como a licença se identifica (chave de texto ou arquivo), se tem portal, quantas
  ativações cada licença permite, quantas linhas de cliente a tela mostra de saída, os links do portal e do site e o
  PDF de instruções.
- Cada licença com suas **linhas de cliente** (3 de saída no LightBurn, mais quando precisar; 1 no Mach3), cada linha
  com cliente do cadastro (nome + CPF/CNPJ obrigatórios), data, canal de venda, pedido de venda opcional, nome do PC,
  equipamento e observação; linha encerrada fica no histórico ("não usa mais").
- Extensão do Chrome "Rise LightBurn" que lê o portal da LightBurn logado e manda ao Rise, por chave: situação, data
  de criação, expira em, ativações usadas e permitidas, tipo (Core ou Pro, quando o portal informar) e, por PC ativado,
  hostname, sistema, data de criação e última sincronização. Um clique "Enviar ao Rise", como no AliExpress.
- O Rise casa os PCs lidos do portal com as linhas pelo **nome do PC**, conta as **vagas livres pelo portal** e mostra
  o **último uso** por linha e por chave. PC do portal sem linha aparece como "PC sem cliente"; linha sem PC no portal
  aparece como "ainda não ativou".
- Botões "Portal das licenças" e "Site da LightBurn" na aba do LightBurn (os links vêm do cadastro do programa).
- Arquivo de licença do Mach3 guardado **dentro do banco**, com versões (enviar um novo nunca apaga o anterior), soma
  de verificação e download em zip igual ao que o dono manda hoje; o PDF de instruções baixável ao lado.
- Importação única das duas planilhas do LightBurn (as duas abas), da planilha do Mach3 e da pasta de arquivos, sem
  duplicar nada no portal depois.
- Aba "Licenças (N)" no cadastro do Cliente, como a aba Pedidos.
- Cartão "LightBurn" em Integrações com a chave da extensão e a última leitura, como o do AliExpress.

**Non-goals**
- Mexer no portal da LightBurn pelo Rise (desativar PC, renovar, comprar): a extensão só lê; o dono continua fazendo
  isso no portal e no site.
- Ler o portal a partir da VPS, sem navegador, ou guardar a senha do portal no Rise (ela fica fora, como hoje).
- Mandar a chave ou o arquivo ao cliente pelo Rise (e-mail, WhatsApp): o dono manda como hoje; o Rise entrega o zip.
- Vender licença pelo Rise, baixar estoque ou cobrar: a venda continua no ML, na LI ou direta.
- Avisar o pedido de venda que "tem licença a entregar": a linha pode apontar para o pedido, mas o módulo Pedidos não
  muda nesta entrega (pode vir depois, por pedido do dono).
- Ferramentas do MCP (Rise AI) para licenças.
- Portal de outro programa: a extensão desta entrega é só do portal da LightBurn; programa novo com portal próprio é
  outra extensão, no mesmo molde.

**Anti-goals** (seria falha mesmo funcionando)
- Perder um arquivo de licença do Mach3, ou uma versão dele, por qualquer caminho (upload por cima, exclusão sem
  popup, backup sem o arquivo).
- Uma leitura do portal apagar ou alterar linha de cliente, arquivo, observação ou data que o dono digitou.
- Duplicar chave numa reimportação (planilha ou portal).
- Linha nova com cliente sem CPF/CNPJ.
- Dizer "vaga livre" quando o portal diz que a chave já tem 3 PCs.
- A chave da extensão sair para qualquer domínio que não seja o do Rise configurado; a extensão escrever no portal.

## 3. Restrições (o que o Rise já tem e o desenho obedece)

- **Ferramentas:** página de cartões (`src/lib/ferramentas/catalogo.js`, `FERRAMENTAS[]` com `href`, `recurso`,
  `rotulo`, `icone`, `resumo`, `detalhe`); cada ferramenta tem a rota em `src/app/ferramentas/<nome>` e um recurso de
  Acessos `tela.ferramentas.<nome>` em `src/lib/acessos/recursos.js` (`sub(...)` de `tela.ferramentas`).
- **Cliente:** `Cliente` (`nome`, `documento` formatado e único, nulo permitido; `telefone`/`email` com listas
  adicionais; `nivel`; `pedidosDeVenda`), `ClienteEndereco` (GERAL/ENTREGA), `ClienteContato`; CPF/CNPJ/CEP conferidos e
  gravados formatados por `src/lib/documentos.js`, telefone só dígitos por `src/lib/telefone.js`. O cadastro tem abas
  (`FormularioCliente.jsx`, `ABAS`, aba "Pedidos (N)" montada em `src/app/cadastros/[tipo]/[id]/page.jsx`).
- **Pedidos de venda:** `PedidoDeVenda` (canal, numero, cliente por CPF/CNPJ criado sozinho pelo worker, itens casados
  com produtos). A linha de licença só aponta para ele.
- **Extensão do AliExpress** (spec 2026-10-28, §6.1 e §6.2): pasta `extensao-aliexpress/` (manifest v3, `pagina.js` no
  MAIN world, `ponte.js`, `fundo.js`, popup com endereço do Rise e chave), chave `rise_ali_…` cujo **hash** mora em
  `Conexao` (`Servico.ALIEXPRESS`, `src/lib/compras/aliexpress/chave.js`: `gerarChaveDaExtensao`,
  `conferirChaveDaExtensao`, `estadoDaChave`), rotas `GET …/estado` e `POST …/importar` fora do Tinyauth no
  `deploy/caddy/Caddyfile` (caminhos exatos), cartão `CartaoAliExpress.jsx` em Integrações, `LogIntegracao` por clique.
  **A extensão nova copia esse molde**, com chave e serviço próprios.
- **Arquivos:** os arquivos de produto vão para `dados/produtos/` (`ProdutoArquivo`), e o backup do R2 leva só o dump
  do banco, `dados/produtos` e `dados/coleta` (CLAUDE.md, "Backup"). O dump vai todo dia (30 dias) e todo mês (12
  meses). Por isso o arquivo de licença vai **no banco** (§6.2).
- **Padrões de interface:** as 10 regras do Padrão visual; `Campo` em `Card`; janelas com `propsDoFundo`, `role`,
  "Sair sem salvar?"; exclusão com popup listando os itens; `BolhaDeAjuda`; `ConclusaoDoEnvio` para envio que deu certo;
  `CabecalhoOrdenavel`/`NavegacaoDoTopo` para listas; texto de tela com acento; `FotoComLupa` não se aplica.
- **Acessos (lançamento 2):** toda tela confere `ver`/`editar` no servidor; o cartão some sem `ver`.
- **Convenções:** JavaScript sem TypeScript, identificadores sem acento, migration aditiva, comentários com o porquê,
  teste próprio em `scripts/teste-*.js` com Postgres local e sem rede, só escrevendo `ZZ-LIC-*`.

## 4. Abordagens consideradas

1. **Módulo genérico (escolhida).** Um cadastro de programa, licenças com linhas de cliente e, para quem tem portal,
   as ativações lidas pela extensão ao lado. O terceiro programa é um cadastro. Custo: mais modelagem agora.
2. **Duas telas separadas**, uma por programa, cada uma com a própria tabela. Sai um pouco mais rápido; o próximo
   programa exige código de novo e a parte de clientes por licença fica escrita duas vezes. Vai contra o "deixe
   preparado".
3. **Licença como número de série do Produto** (chave ligada ao produto "Licença LightBurn" do catálogo, arquivo do
   Mach3 como `ProdutoArquivo`). O pedido de venda já casa com o produto, mas vagas, portal e nome do PC não têm lugar
   ali, e o cadastro de produto já é pesado demais. Descartada.

## 5. Decisões do dono (05/11/2026)

- Fica **dentro de Ferramentas, como cartão "Licenças Softwares"**, e segue a Opção 1.
- O portal da LightBurn é a fonte de situação, ativações, criação, expiração, último acesso, hostname, sistema e tipo
  (Core/Pro); a leitura é **semi-automática pela extensão do Chrome**. O resto ele digita.
- **3 linhas por licença** do LightBurn, com a possibilidade de acrescentar mais; a mesma licença serve a vários
  clientes.
- Botão para o portal das licenças e botão para o site da LightBurn.
- Todas as licenças das **duas abas** da planilha do LightBurn entram.
- Mach3: a licença é um arquivo, vinculado ao cliente; o mesmo arquivo pode ir para mais de um cliente; upload e
  download pelo Rise; guardado com muito cuidado; **o cliente tem obrigatoriamente nome e CPF ou CNPJ**.
- Linhas antigas da planilha sem CPF (2020 e 2021): entram com o nome anotado e um aviso "sem cliente" (minha
  proposta, Opção 1 da conversa; o dono disse que preenche o nome à mão e não objetou).

## 6. O como (o que está decidido; "minha escolha" marca o que eu decidi e ele pode trocar)

### 6.1 Onde mora e como se chama

- Cartão em `FERRAMENTAS`: `href: "/ferramentas/licencas"`, `recurso: "tela.ferramentas.licencas"`, `rotulo:
  "Licenças Softwares"`, ícone `KeyRound`, `resumo: "As chaves do LightBurn e os arquivos do Mach3, com os clientes
  de cada licença, as vagas livres e o último uso lido do portal."`, `detalhe: "LightBurn · Mach3 · extensão do
  Chrome"`.
- Rota `src/app/ferramentas/licencas/` (página, `acoes.js`), regras e banco em `src/lib/ferramentas/licencas/`
  (`regras.js` puro, `banco.js`, `portal.js`, `arquivos.js`, `importacao.js`, `esquema.js`), componentes em
  `src/components/ferramentas/licencas/`.
- Acessos: `sub("tela.ferramentas.licencas", "Ferramentas › Licenças Softwares", "tela.ferramentas")` e
  `acao("acao.ferramentas.licencas.arquivo", "Baixar o arquivo da licença", "tela.ferramentas.licencas", "Entrega o
  zip com o arquivo de licença (Mach3) e o PDF de instruções.")`. Com só `ver`: tudo visível, nada editável e sem
  download do arquivo (minha escolha: o arquivo é o produto em si).

### 6.2 Banco (migration aditiva `20261105_licencas_softwares`)

```prisma
/// Como a licenca de um programa se identifica: uma chave de texto (LightBurn) ou um arquivo (Mach3).
enum IdentificacaoDaLicenca { CHAVE ARQUIVO }
enum SituacaoDaLinhaDeLicenca { ATIVA ENCERRADA }
/// Canal da venda da licenca. DIRETA cobre WhatsApp, balcao e o "4H" das planilhas antigas.
enum CanalDaLicenca { MERCADO_LIVRE LOJA_INTEGRADA SHOPEE DIRETA }

/// Um programa vendido (LightBurn, Mach3...). E cadastro: programa novo nao exige codigo.
model Software {
  id                   String  @id @default(cuid())
  nome                 String  @unique
  /// Para a URL e a aba (?programa=lightburn).
  slug                 String  @unique
  identificacao        IdentificacaoDaLicenca
  temPortal            Boolean @default(false)
  /// Quantos PCs cada licenca permite (LightBurn: 3). Nulo = sem limite (Mach3).
  ativacoesPermitidas  Int?
  /// Quantas linhas de cliente a tela mostra de saida, mesmo vazias (LightBurn: 3; Mach3: 1).
  linhasIniciais       Int     @default(1)
  linkPortal           String?
  linkSite             String?
  /// PDF de instrucoes que o dono manda ao cliente (Mach3). No banco pelo mesmo motivo do arquivo de licenca.
  instrucoesNome       String?
  instrucoesBytes      Bytes?
  instrucoesTipo       String?
  ordem                Int     @default(0)
  ativo                Boolean @default(true)
  licencas             Licenca[]
  leituras             LeituraDoPortal[]
  criadoEm             DateTime @default(now())
  atualizadoEm         DateTime @updatedAt
}

model Licenca {
  id            String   @id @default(cuid())
  softwareId    String
  software      Software @relation(fields: [softwareId], references: [id], onDelete: Restrict)
  /// A chave (LightBurn) ou o nome licenciado (Mach3: "Mach3 VD60"). Unica por programa.
  identificador String
  /// "Core", "Pro"... Texto livre com sugestoes; o portal preenche quando informa (§6.3).
  tipo          String?
  compradaEm    DateTime? @db.Date
  /// Ultima renovacao comprada no site (coluna "Renovacao?" da planilha).
  renovadaEm    DateTime? @db.Date
  observacoes   String?
  /// "planilha" | "portal" | "manual": de onde a licenca entrou no Rise.
  origem        String
  /// Fora da lista normal (chave perdida, devolvida). Nunca apaga.
  arquivada     Boolean  @default(false)

  // O que a ultima leitura do portal trouxe (so programas com portal). Nulo = nunca lida.
  portalId                  String?
  portalSituacao            String?
  portalExpiraEm            DateTime?
  portalCriadaEm            DateTime?
  portalAtivacoesUsadas     Int?
  portalAtivacoesPermitidas Int?
  /// As demais colunas do portal, como vieram (as 13 colunas da tabela), para nao perder o que ainda nao tem campo.
  portalDados               Json?
  portalLidoEm              DateTime?
  /// A chave estava no Rise e a ultima leitura completa do portal nao a trouxe.
  portalSumiuEm             DateTime?

  linhas    LinhaDeLicenca[]
  ativacoes AtivacaoDeLicenca[]
  arquivos  ArquivoDeLicenca[]

  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  @@unique([softwareId, identificador])
  @@index([softwareId, arquivada])
}

/// Uma vaga entregue a um cliente. So existe no banco quando tem conteudo: as "3 linhas" vazias sao desenho da tela.
model LinhaDeLicenca {
  id        String  @id @default(cuid())
  licencaId String
  licenca   Licenca @relation(fields: [licencaId], references: [id], onDelete: Cascade)
  ordem     Int

  /// SetNull: apagar o cliente nao apaga a vaga; a linha fica com o nome anotado.
  clienteId String?
  cliente   Cliente? @relation(fields: [clienteId], references: [id], onDelete: SetNull)
  /// So para linhas importadas sem CPF/CNPJ (aviso "sem cliente"). Linha nova exige cliente.
  nomeAnotado String?

  data            DateTime? @db.Date
  canal           CanalDaLicenca?
  pedidoDeVendaId String?
  pedidoDeVenda   PedidoDeVenda? @relation(fields: [pedidoDeVendaId], references: [id], onDelete: SetNull)
  /// Casa com `AtivacaoDeLicenca.hostname` (sem caixa, sem espacos nas pontas).
  nomeDoPc        String?
  equipamento     String?
  observacoes     String?

  situacao    SituacaoDaLinhaDeLicenca @default(ATIVA)
  encerradaEm DateTime?

  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt

  @@index([licencaId])
  @@index([clienteId])
  @@index([pedidoDeVendaId])
}

/// Um PC ativado, como o portal o mostra. So a leitura do portal escreve aqui.
model AtivacaoDeLicenca {
  id        String  @id @default(cuid())
  licencaId String
  licenca   Licenca @relation(fields: [licencaId], references: [id], onDelete: Cascade)
  /// O id da ativacao no portal; na falta, o hostname. E o que torna a reimportacao idempotente.
  chave     String
  hostname  String
  so        String?
  criadaEm              DateTime?
  ultimaSincronizacaoEm DateTime?
  leaseExpiraEm         DateTime?
  dados                 Json?
  /// Ultima leitura que a trouxe; `sumiuEm` quando uma leitura completa nao a trouxe mais (PC desativado no portal).
  vistaEm  DateTime
  sumiuEm  DateTime?

  @@unique([licencaId, chave])
  @@index([licencaId, sumiuEm])
}

/// O arquivo da licenca (Mach3), com versoes. Restrict: a licenca so sai depois que os arquivos dela sairem pelo popup.
model ArquivoDeLicenca {
  id           String  @id @default(cuid())
  licencaId    String
  licenca      Licenca @relation(fields: [licencaId], references: [id], onDelete: Restrict)
  versao       Int
  nomeOriginal String
  bytes        Bytes
  sha256       String
  tamanhoBytes Int
  mimeType     String?
  /// A versao que o Baixar entrega. Enviar um arquivo novo cria a versao seguinte e move a marca; nada e apagado.
  atual        Boolean @default(true)
  enviadoEm    DateTime @default(now())
  enviadoPor   String?
  observacao   String?

  @@unique([licencaId, versao])
}

/// Cada "Enviar ao Rise" da extensao.
model LeituraDoPortal {
  id         String   @id @default(cuid())
  softwareId String
  software   Software @relation(fields: [softwareId], references: [id], onDelete: Cascade)
  lidaEm     DateTime @default(now())
  licencas   Int
  ativacoes  Int
  novas      Int
  alteradas  Int
  sumiram    Int
  /// Falso quando a extensao avisou que nao conseguiu ler tudo (pagina que falhou): nada e marcado como sumido.
  completa   Boolean  @default(true)
  erro       String?
  versaoDaExtensao String?

  @@index([softwareId, lidaEm])
}
```

- `Cliente` ganha `linhasDeLicenca LinhaDeLicenca[]`; `PedidoDeVenda` ganha `linhasDeLicenca LinhaDeLicenca[]`.
- `Servico` ganha `LIGHTBURN` (a conexão guarda o hash da chave da extensão, como `ALIEXPRESS`).
- A migration **semeia os dois programas**: LightBurn (`CHAVE`, portal, 3 ativações, 3 linhas,
  `linkPortal` = página de licenças do portal, `linkSite` = o link de compra com cupom que está na aba "Link controle
  licencas" da planilha) e Mach3 (`ARQUIVO`, sem portal, sem limite, 1 linha, `linkSite` = página de downloads do
  fabricante que o PDF cita). O PDF de instruções entra pela importação (§6.5). A senha do portal **não** entra em
  lugar nenhum.
- Por que `Bytes` no banco e não `dados/`: 201 bytes por licença, uma centena de licenças; o dump diário vai ao R2 e
  a pasta de arquivos não. Perder o arquivo é o anti-goal número um.
- Decimal nenhum, dinheiro nenhum: a venda fica no pedido.

### 6.3 Regras (`regras.js`, puro, testado sem banco)

- **Vagas livres** de uma licença com portal: `permitidas − ativas`, onde `permitidas = portalAtivacoesPermitidas ??
  software.ativacoesPermitidas` e `ativas` = ativações com `sumiuEm` nulo. Licença nunca lida do portal mostra "não
  lida" no lugar do número, nunca "3 livres" (anti-goal). Programa sem limite não mostra vagas.
- **Casamento linha ↔ PC:** `normalizar(nomeDoPc) === normalizar(hostname)` (minúsculas, sem espaços nas pontas, sem
  o `\t\r` que a planilha deixou). Uma ativação casa com no máximo uma linha ATIVA; empate fica sem casar e a tela diz.
  Linha ATIVA sem ativação casada: "ainda não ativou" (cinza); ativação sem linha: "PC sem cliente" (âmbar).
- **Último uso** da linha = `ultimaSincronizacaoEm` do PC casado; da licença = o maior entre as ativações ativas.
- **Situação da licença com portal**, uma cor e um texto: verde "Expira em N dias" (N > 30); âmbar "Expira em N dias"
  (N ≤ 30); cinza "Expirada há N dias" (o programa continua rodando, só as atualizações pararam: é assim que a
  LightBurn usa o portal, e a planilha renova ao revender); vermelho "Suspensa"/"Revogada" (o que o portal disser
  fora de válida/expirada) e "Sumiu do portal" (`portalSumiuEm`). Programa sem portal: sem coluna de situação.
- **Leitura do portal fresca:** `portalLidoEm` do programa (a última `LeituraDoPortal` completa) com mais de 7 dias
  fica âmbar, mais de 30 fica vermelho, nunca lida fica vermelho "Nunca lido do portal" (minha escolha dos prazos).
- **Tipo** (Core/Pro): quando o portal informa, o valor do portal vence e grava `tipo`; quando não informa, fica o que
  o dono digitou ou a planilha trouxe. Medir na primeira leitura (§8).
- **Linha nova** exige `clienteId` com `Cliente.documento` preenchido; `nomeAnotado` só nasce na importação. Encerrar
  uma linha grava `ENCERRADA` + `encerradaEm`, e ela sai das 3 de cima para o histórico da licença (dobrável). Reabrir
  volta a ATIVA.
- **Zip do arquivo:** `<identificador>.zip` com a pasta `<identificador>/` e dentro o arquivo com o `nomeOriginal`
  (hoje `Mach1Lic.dat`), igual ao que o dono manda. O upload aceita o `.dat` solto **ou** um `.zip` com um único arquivo
  dentro (o Rise extrai e guarda o arquivo, não o zip; o nome da entrada do zip é descartado e fica só o nome base,
  limpo, como `nomeOriginal`). Soma `sha256` conferida no upload e no download. Teto de 1 MB por arquivo, também no
  tamanho descompactado (uma licença tem 201 bytes; o teto só evita engano). **Envio de arquivo só existe em programa
  `ARQUIVO`**; programa `CHAVE` não tem o botão. O download sai por rota própria (`GET /api/licencas/arquivo/<id>`,
  com `?versao=` para uma versão antiga), atrás do login e do `acao.ferramentas.licencas.arquivo`, porque server
  action não entrega arquivo.
- **Leitura do portal aplicada ao banco** (`portal.js`, numa transação por licença): para cada chave do payload,
  `upsert` por `(software, identificador)`; licença nova nasce `origem: "portal"`; grava os `portal*`; ativações por
  `(licencaId, chave)` com `vistaEm = lidaEm` e `sumiuEm = null`; ativações da licença que não vieram ganham
  `sumiuEm` (só em leitura `completa`); licenças do programa com `portalId` que não vieram ganham `portalSumiuEm` (só
  completa), e a que reaparece volta a nulo. **Nunca** toca `linhas`, `arquivos`, `tipo` digitado (salvo regra acima),
  `renovadaEm`, `observacoes`: a chave da extensão só importa leituras, e nenhuma rota dela apaga nada. Grava
  `LeituraDoPortal` e uma linha de `LogIntegracao` (`LIGHTBURN`), e o cartão de Integrações mostra o resumo. Sem trava
  de leitura simultânea: duas leituras ao mesmo tempo só repetem o mesmo `upsert`.
- **Nada apaga sozinho:** excluir licença, linha ou arquivo é ação do dono com o popup que lista o que sai (regra do
  projeto); licença com arquivo só sai depois que o popup listar os arquivos e versões que vão junto.

### 6.4 A extensão "Rise LightBurn"

Pasta `extensao-lightburn/` na raiz (JavaScript puro, sem build), o mesmo desenho da `extensao-aliexpress/`:
`manifest.json` (v3; `host_permissions` só `https://lightburn.customer.cryptlex.com/*`, o domínio da API do portal se a
medição mostrar que ela é chamada em outro host, `https://rise.4hobby.com.br/*` e `https://localhost:3000/*`),
`pagina.js` (MAIN world em `https://lightburn.customer.cryptlex.com/*`), `ponte.js`, `fundo.js`, `popup.html` +
`popup.js` (endereço do Rise, chave, botão "Enviar ao Rise", resumo), `leitura.js` (funções puras: converter licença e
ativação do portal para o formato do Rise, datas, limpeza), `LEIAME.md` com instalar e usar.

**Como lê (decidido pela medição, §8, antes de escrever a extensão):**
1. **Preferido: a API que a própria página usa.** O portal é uma página única que busca as licenças e as ativações
   numa API com o token da sessão logada. A extensão repete essas chamadas (lista de licenças, página a página; lista
   de ativações, filtrada por licença ou inteira), com 1 a 2 s entre elas, nunca mais de 200 chamadas por clique.
2. **Reserva: a tabela da página.** Se a API não puder ser repetida, a extensão lê a tabela de Licenses (as 13
   colunas, todas as páginas) e abre a aba Activations com o filtro de cada chave.
A regra é a mesma do AliExpress: **só lê**; nenhum POST, PUT ou DELETE no portal, em nenhum caso.

**O clique "Enviar ao Rise":**
1. O popup confere que a aba é o portal logado (a página de licenças com a tabela ou o token presente); senão "Entre
   no portal da LightBurn e tente de novo".
2. `GET /api/licencas/lightburn/estado` → `{ lidoEm da última leitura completa, licencas no Rise }` (só para o resumo
   e para o popup dizer "última leitura há N dias").
3. Lê **todas** as licenças e **todas** as ativações (são 78 chaves e poucas ativações; não há corte por data: a
   leitura é sempre completa, e é isso que permite marcar o que sumiu).
4. `POST /api/licencas/lightburn/importar` com `{ versao, lidoEm, completa, licencas: [{ idNoPortal, chave, situacao,
   expiraEm, criadaEm, ativacoesUsadas, ativacoesPermitidas, tipo, dados: {…as demais colunas…}, ativacoes: [{
   idNoPortal, hostname, so, criadaEm, ultimaSincronizacaoEm, leaseExpiraEm, dados }] }] }`. Página que falhou no meio
   → `completa: false` e o Rise não marca sumidos. Corpo validado com zod (`esquema.js`), teto de 5 MB, 400 com o
   motivo em erro de formato.
5. O popup mostra o resumo do Rise: "78 chaves lidas · 2 novas · 5 alteradas · 1 PC sumiu · 3 PCs sem cliente (abra
   o Rise)".

A chave fica em `chrome.storage.local` e vai em `Authorization: Bearer`; gerada em **Integrações › LightBurn ›
Gerar chave da extensão** (`src/lib/ferramentas/licencas/chave.js`, cópia da do AliExpress com `rise_lb_` e
`Servico.LIGHTBURN`). As duas rotas entram no `Caddyfile` fora do Tinyauth, caminhos exatos, como as do AliExpress.
Sem permissão de cookies, sem ler outras páginas, sem mandar ao Rise nada além do que está no payload (o portal mostra
e-mail e nome do usuário logado: **não** vão).

### 6.5 Importação da planilha e da pasta (uma vez)

Script `scripts/importar-licencas.js` (`--simular` conta e lista; `--confirmo` grava), lendo:
- as três abas em **CSV** (Arquivo › Baixar › CSV, uma por aba; o dono exporta ou eu baixo), com as células mescladas
  **preenchidas para baixo** (Key, Tipo, Equipamento, Canal e Renovação vêm mesclados: a linha herda o valor da
  linha de cima até a próxima chave);
- a pasta `Licenças Mach3/Licencas/Licenças de clientes/` (zip ou pasta; o nome da pasta ou do zip sem `.zip` é o
  identificador) e `Licenças disponiveis/` (hoje vazia), mais o PDF `Instruçoes para ativação do software Mach3.pdf`
  para `Software.instrucoes*`.

Regras de leitura (`importacao.js`, puras e testadas com uma fixture pequena):
- `#` e célula vazia valem "sem valor". Datas `dd/mm/aaaa` e `dd/mm/aa`; `mm/aa` (a "06/20" da aba antiga) vira sem
  data, com o texto na observação da linha.
- **Chave** → `Licenca.identificador` (upsert; as duas abas e o portal usam a mesma chave, então nada duplica). `Tipo`
  → `tipo`. `Renovação?` e o "Renovada dia 30/11/22" da aba antiga → `renovadaEm`. `origem: "planilha"`. Licença da
  planilha que o portal depois não trouxer ganha `portalSumiuEm` na primeira leitura completa, e é assim que o dono
  vê as chaves mortas.
- **Cada linha com conteúdo da planilha é uma `LinhaDeLicenca`** (um PC, uma pessoa), na ordem da planilha. Linhas
  idênticas da mesma pessoa (Thiago Pinto ×3, Eduardo Leal ×3) entram as três: a planilha diz 3 vagas dele, e o dono
  apaga o que sobrar (minha escolha: fiel à planilha, nunca "inteligente").
- **Cliente** pela coluna `Dados` ("CPF 28625462839", "CNPJ 30031524000100") ou `CPF`: dígitos conferidos por
  `documentos.js`. CPF com 10 dígitos ganha um zero à esquerda antes de conferir (o Excel comeu o zero: "1004296100",
  "3786687811"). Documento válido: Cliente existente por `documento` é **ligado sem mexer em nada** (pode ter vindo do
  módulo Pedidos); inexistente é **criado** com nome, documento, telefone (só dígitos, se válido), e-mail e o
  endereço GERAL lido do texto `"<logradouro>, <cidade> - CEP: <cep>, <estado>"` (cep, cidade e UF pelo nome do
  estado; o que não casar com o molde vai inteiro em `logradouro`). Documento inválido ou ausente → `nomeAnotado` =
  nome, sem cliente, e a observação da linha diz "CPF inválido na planilha: …" ou "sem CPF na planilha". Nome igual
  na mesma chave com documentos que só diferem no último dígito (Ani Carolini: 060, 061, 062, arrastão do Excel)
  usa o primeiro válido para as três linhas.
- `Nome do PC` → `nomeDoPc` (limpo); `Equipamento` (mesclado) e o `Pedido Bling` da aba antiga (Cuia, Ciclope) →
  `equipamento`; `Canal`: ML, ML4H, ML3H → MERCADO_LIVRE; 4H, Loja, Direta → DIRETA (o texto original vai na observação
  quando não é "ML"); `Data` → `data`; a coluna de observação (M) e a `Loja` da aba antiga → `observacoes`.
- **Situação:** "Não usa mais", "nao usa +" → ENCERRADA; "Em uso", "Ajustado", vazio → ATIVA.
- **Mach3:** cada pasta/zip → `Licenca` (`identificador` = nome da pasta, `origem: "planilha"`) com
  `ArquivoDeLicenca` versão 1 (`nomeOriginal` = nome do arquivo dentro, sha256, bytes); a linha da planilha com o
  mesmo `Key` vira a `LinhaDeLicenca` com cliente (as seis têm CPF/CNPJ). `ALTAVE V53T` e `ASSOCIACAO SAO BENTO DE
  ENSINO/Mach3 2FHX` não estão na planilha: a licença entra com o nome da pasta e uma linha com `nomeAnotado` =
  "ALTAVE" / "ASSOCIACAO SAO BENTO DE ENSINO" e aviso "sem CPF na planilha".
- O script é idempotente (rodar duas vezes não cria nada) e imprime o resumo: licenças, linhas, clientes criados e
  ligados, linhas sem cliente (com o motivo), arquivos. Roda primeiro na cópia do PC com `--simular`; na VPS, dentro
  do contêiner do app, com os CSVs e os arquivos levados por scp (como os outros scripts mandados à VPS).

### 6.6 Telas (desenho inicial pela skill `frontend-design` com as 10 regras; o dono ajusta por print)

**Linha-guia:** nesta tela o operador precisa ver primeiro **quais chaves têm vaga livre e se a leitura do portal é
recente**, e a ação principal é **Vincular cliente**.

**`/ferramentas/licencas`** (cabeçalho com "← Ferramentas"):
- Abas por programa (`Software.ordem`, só ativos): **LightBurn | Mach3**. À direita do cabeçalho, pequeno: o selo
  "Lido do portal há 2 dias" (cores da §6.3) só em programa com portal; os botões de link do programa como botões
  secundários com ícone de link externo ("Portal das licenças", "Site da LightBurn"; no Mach3, "Site do Mach3" e
  "Instruções (PDF)" que baixa o PDF); um menu ⋮ com "Programas" (cadastro) e "Histórico de leituras".
- Filtros compactos no topo: busca (chave, nome do cliente, CPF, nome do PC), "Só com vaga livre" (programa com
  portal), "Mostrar arquivadas". Botão principal **"Nova licença"** à direita.
- **Tabela do LightBurn**, 100 por página com `NavegacaoDoTopo` e cabeçalhos que ordenam: Chave (monoespaçada, ícone
  de copiar), Tipo, Situação (ponto + texto da §6.3), Ativações ("1 de 3", e ao lado "2 livres" em verde ou "cheia"),
  Último uso (data; "nunca" em cinza), Clientes (nomes das linhas ATIVAS, cortados com reticências; "sem cliente"
  em cinza), Renovada em, e a seta que expande. Ordem padrão: mais vagas livres primeiro, depois último uso mais
  antigo (as chaves "mortas" sobem). Chave com `portalSumiuEm` ou "PC sem cliente" ganha o "!" com o motivo no
  `title`.
- **Linha expandida:** a lista das linhas de cliente, `linhasIniciais` de saída (as vazias como "(sem cliente)" com o
  botão Vincular cliente; a palavra "livre" fica só na coluna Ativações, que é a do portal), colunas Nº, Cliente (link para o cadastro em nova aba, CPF/CNPJ pequeno embaixo; `nomeAnotado`
  em âmbar com "sem cliente"), Data, Canal, Pedido (número, link), Nome do PC, Equipamento, Último uso (do PC casado;
  "ainda não ativou" em cinza), Obs, ✎ e ⋮ (Encerrar, Excluir). Abaixo, só quando houver: **"PCs sem cliente"**
  (hostname, sistema, criado em, último uso, botão "Atribuir à linha…" que abre a janela com o nome do PC já
  preenchido) e o **histórico** dobrado ("2 linhas encerradas"). Botões: "Adicionar linha" (além das iniciais) e
  "Editar licença" (tipo, comprada em, renovada em, observações, arquivar).
- **Tabela do Mach3:** Nome licenciado, Arquivo ("v2 · Mach1Lic.dat · 201 B" + botão **Baixar**; "sem arquivo" em
  vermelho), Clientes, Última entrega (maior `data` das linhas), seta. Expandida: as mesmas linhas de cliente (sem
  Nome do PC e Último uso, porque não há portal), e o bloco **Versões do arquivo** (versão, nome, tamanho, sha256
  curto, enviado em/por, "atual"; botão **Enviar arquivo** que cria a versão seguinte; cada versão antiga também baixa).
- **Janela "Vincular cliente"** (`role="dialog"`, `propsDoFundo`, "Sair sem salvar?"): Cliente (busca por nome ou
  CPF/CNPJ entre os clientes **com documento**; os sem documento aparecem desabilitados com "sem CPF/CNPJ" no `title`;
  link "Cadastrar cliente" abre `/cadastros/clientes/novo` em nova aba), Data (hoje), Canal (`EscolhaDoTipo` com as
  4 opções), Pedido (lista dos pedidos de venda do cliente dos últimos 180 dias, opcional; vazio quando não há), Nome
  do PC, Equipamento, Observações. Salvar cria a linha ATIVA.
- **Janela "Nova licença":** programa já escolhido pela aba; Chave ou Nome licenciado (único; a mensagem diz qual
  licença já tem esse valor), Tipo, Comprada em, Renovada em, Observações e, no Mach3, o envio do arquivo (obrigatório).
- **Janela "Programas"** (só `editar`): lista dos programas com ✎; o formulário tem nome, identificação (chave ou
  arquivo), tem portal, ativações permitidas, linhas iniciais, link do portal, link do site, PDF de instruções (até
  5 MB), ordem, ativo. Excluir programa só sem licenças (popup diz quantas tem).
- **Cadastro do Cliente:** aba "Licenças (N)" ao lado de "Pedidos (N)", lista com programa, identificador, data, PC,
  situação e link para a tela.
- **Integrações:** cartão "LightBurn" (`CartaoLightBurn.jsx`, cópia do AliExpress sem o fornecedor): chave da
  extensão, última leitura e resumo, como instalar na bolha.
- **Resposta ao clique é estado:** Baixar desabilitado sem `acao.ferramentas.licencas.arquivo` com o motivo no
  `title`; Vincular cliente desabilitado em licença arquivada; envio que deu certo (arquivo, leitura do portal
  reaplicada) termina no `ConclusaoDoEnvio`.

### 6.7 Testes e entrega

- `npm run teste:licencas` (`scripts/teste-licencas.js`, Postgres local, SEM rede, só escreve `ZZ-LIC-*`, "ZZ Lic *"
  e clientes "ZZ LIC *"): regras puras (vagas, casamento, último uso, situação e cores, frescor da leitura, zip e
  upload de `.dat`/`.zip`, sha256, leitura da planilha com a fixture: `#`, datas, CPF com zero perdido, arrastão de
  CPF, endereço no molde e fora dele, canais, situações, mesclagem para baixo); banco (nova licença, linha exige
  documento, encerrar/reabrir, arquivo com versões e `atual`, excluir com Restrict, leitura do portal com payload
  falso: nova, alterada, PC que sumiu, leitura incompleta não marca sumido, nunca toca linha/arquivo/renovadaEm);
  importação idempotente (rodar 2×); chave da extensão (gerar, conferir, 401); acessos (`ver` sem download, cartão
  some sem `ver`); aba Licenças do cliente.
- `npm run teste:extensao-lightburn` (`scripts/teste-extensao-lightburn.js`, puro): `leitura.js` com as respostas
  **medidas** do portal (anonimizadas), conversão de licença e ativação, datas, limpeza.
- `teste:acessos` ganha o recurso novo; `teste:extracao`/`coleta`/`cadastros`/`worker` do ritual; lint; build.
- Entrega: commit por tarefa, push, deploy na VPS só com o "subir" do dono (migration aditiva; Caddy com os dois
  caminhos novos). Depois do deploy: o dono gera a chave em Integrações › LightBurn, carrega a extensão, e a
  **primeira leitura real** é acompanhada e termina com o roteiro de testes (CLAUDE.md "Licenças Softwares").

## 7. O que fica para quem constrói

- Nomes dos componentes e o layout exato das colunas, dentro das 10 regras (frontend-design +
  make-interfaces-feel-better antes de entregar; conferir em largura de notebook).
- O formato real das respostas do portal e qual dos dois caminhos de leitura (§6.4) é possível: sai da medição.
- Como o texto do portal vira `situacao` e `tipo` (o mapa fica em `leitura.js`, com as palavras medidas), e o que
  entra em `portalDados`/`dados` (tudo o que vier e não tiver campo).
- Paginação da API do portal, tempo entre chamadas e teto por clique (200, minha sugestão).
- O ícone da extensão, os textos do popup, o `LEIAME.md`.
- O CSV: separador e aspas do Google (vírgula, UTF-8); mesclagem para baixo só nas colunas mescladas da planilha.
- A tabela nome do estado → UF e o molde do endereço.
- Texto do "!" e dos `title`.
- Ordem das migrations e o nome das pastas de teste.
- `EscolhaDoTipo` mora dentro de `FormularioCliente.jsx`: exportar ou mover para `ui/`, sem mudar o cadastro.
- A busca de clientes da janela "Vincular cliente" (nome ou documento, só os com documento): reaproveitar a que o
  módulo Pedidos ou o cadastro já tiver; senão uma server action pequena.
- Duas versões enviadas ao mesmo tempo: o `@@unique([licencaId, versao])` barra a segunda; calcular a versão dentro da
  transação e repetir uma vez.
- Ordem secundária da lista (chaves nunca lidas, tudo empatado): pelo identificador.
- O `datalist` de sugestões do Tipo (os valores distintos já gravados no programa).

## 8. Medições pendentes (tarefa 1 do plano, antes de qualquer tela da extensão)

- **Como o portal busca os dados**: no Chrome do dono, logado, ler as chamadas que a página de Licenses e a de
  Activations fazem (host da API, caminho, paginação, onde está o token, se a lista de ativações aceita "todas" ou só
  por chave). Só leitura; nada é clicado além de abrir as páginas. É o mesmo teste descartável do AliExpress.
- **Onde está o Core/Pro**: nas 13 colunas da tabela (Product, Product Version, Metadata...) ou em nenhuma. Decide se
  `tipo` vem do portal ou fica só manual.
- **Os textos de situação** que o portal usa (ACTIVE, EXPIRED, SUSPENDED, REVOKED...) para o mapa de cores.
- **As datas**: formato e fuso das respostas (a tela mostra "Sep 10, 2026 04:58:33 PM"; a API costuma devolver ISO).
- As respostas medidas viram a fixture do `teste:extensao-lightburn`, anonimizadas (chaves e hostnames trocados).
