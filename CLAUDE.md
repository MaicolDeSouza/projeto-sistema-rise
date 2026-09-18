@AGENTS.md

# Sistema Rise

Painel de controle das operações de uma loja de eletrônicos (4hobby) que vende no
**Mercado Livre** e na **Loja Integrada**, com o **Bling** como ERP. Roda na máquina do
dono; a migração para VPS está prevista.

Organizado em **blocos** no menu lateral, cada um desenvolvido de forma independente.

## Convenções

- **JavaScript**, sem TypeScript. O client do Prisma é gerado em `.ts` (o gerador da v7 não
  emite JS) e fica em `src/generated/`, fora do git — nada escrito à mão é TypeScript.
- **Interface e código em português**, sem acentos nos identificadores e comentários.
- **Comentários explicam o porquê**, não o quê. Se um trecho parece estranho, o comentário
  diz que problema ele evita.
- Fonte única para listas que a tela usa: `src/lib/blocos.js`, `src/lib/canais.js`,
  `src/lib/unidades.js`, `src/lib/limites.js`, `src/lib/fiscal.js`,
  `src/lib/integracoes/registro.js`.

## Estado

| Bloco | Situação |
| --- | --- |
| Produtos | Cadastro completo — é a base de que todo anúncio deriva. Cadastro novo com importação do Bling, busca por código, referências de mercado e título/descrição por IA (Anthropic) |
| Integrações | Bling e ML conectados e testados; Loja Integrada via Bling |
| Painel | Indicadores lendo do banco |
| Anúncios | Interface e validação por canal, **sem publicar** |
| Mercados | Teste de fonte, importação de arquivo (HTML/PDF/XLSX) e coleta gravando **no Postgres**, com série de preço |
| Pedidos, Estoque, Financeiro, Relatórios | Esqueleto |

**A publicação nunca foi ligada.** `ML_PUBLICACAO` e `BLING_ESCRITA` estão em `false`, e
`exigirTravaLiberada` em `src/lib/integracoes/config.js` barra todo `POST`/`PUT` antes da
requisição sair. A conta tem **1007 anúncios e estoque reais** — não ligue sem pedir.

## Rodar

```bash
npm run dev                       # https://localhost:3000 (banco: servico postgresql-x64-17)
npm run diagnostico               # testa as integrações pela linha de comando
npm run teste:extracao            # 169 asserções da extração, da conciliação e das medidas, SEM rede
npm run teste:fonte -- <url>      # avalia um concorrente pela linha de comando
npm run teste:fonte -- --tipo=FORNECEDOR <url>   # preco deixa de ser exigido
COLETA_TIMEOUT_MS=90000 npm run teste:fonte -- <url>   # site lento
npm run teste:coleta              # 43 asserções da gravação no banco (usa o Postgres, SEM rede)
npm run coletar -- <url>          # colhe uma fonte CADASTRADA e grava no banco
npm run worker                    # supervisor + worker: varre o que "Atualizar dados" enfileira
npm run worker:parar              # encerra do jeito certo (devolve as varreduras a fila)
npm run backup                    # dados/backup/sistema_rise-AAAAMMDD-HHMMSS.dump (pg_dump, conferido com pg_restore; guarda os 4 mais recentes)
npm run teste:worker              # 44 asserções: rede, fila, retomada e o worker de verdade (~6 min)
```

**Backup semanal agendado** (pedido do dono em 16/09/2026): tarefa do Agendador de Tarefas do
Windows "Sistema Rise - Backup semanal do banco", toda segunda às 12:00. Com
`StartWhenAvailable`, se o computador estiver desligado ela roda assim que ligar.
- **Retenção:** o script mantém os **4** backups automáticos mais recentes (nome
  `sistema_rise-AAAAMMDD-HHMMSS.dump`). Só apaga depois de o novo passar na conferência do
  pg_restore, e backup com outro nome, feito à mão, nunca é apagado.
- **Log:** `dados/logs/backup.log`.
- **Senha:** vai por `PGPASSWORD` com `--no-password`. Pela URL, o pg_dump do Windows parou
  esperando senha no terminal.
- **Na VPS:** o agendamento não vai junto; lá vira um cron com `npm run backup`.

HTTPS é obrigatório (o OAuth do ML exige). Certificado em `certificates/`, gerado com
mkcert, fora do git.

- **`certificates/rootCA.pem` é obrigatório**, e é só a parte pública da CA do mkcert
  (`%LOCALAPPDATA%\mkcert\rootCA.pem`) — a `rootCA-key.pem` **nunca** vem para cá. O
  navegador confia no certificado porque a CA está no Windows; o **Node não olha lá**. Com
  `--experimental-https-key/cert` e sem `--experimental-https-ca`, o `next dev` põe
  `NODE_EXTRA_CA_CERTS` **indefinido** no processo filho. Nada falha até o Next precisar
  **encaminhar uma Server Action** para outro worker — ele faz `fetch` no próprio
  `https://localhost:3000` e leva `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. No log aparece
  `failed to forward action response`; na tela, botão que não responde em `/mercados/fontes`.

**O banco é PostgreSQL 17 nativo, não mais Docker** — migrado em 15/09/2026 a pedido do dono:
o Docker Desktop travava ao abrir e o sistema ficava sem banco.

- Serviço do Windows `postgresql-x64-17`, **início automático** — liga com a máquina, sem
  `npm run db:up`. Superusuário `rise` com a senha do `.env`, o mesmo arranjo do container,
  então o `DATABASE_URL` não mudou.
- **`listen_addresses = 'localhost'`**, posto à mão em
  `C:\Program Files\PostgreSQL\17\data\postgresql.conf`. O instalador do Windows deixa `'*'`, e
  o compose publicava só em 127.0.0.1 de propósito.
- Banco criado com **`TEMPLATE template0`, UTF8, ICU `en-US`**: o `template1` do instalador herda
  a codificação do Windows (WIN1252), e restaurar nele estragaria os acentos.
- A cópia do banco do Docker está em `dados/backup/` (fora do git — leva os tokens cifrados).
  Contagens conferidas tabela a tabela depois de restaurar, e o ML autenticou com o token
  restaurado.
- **O container `rise-postgres` foi parado, não apagado** (`docker compose stop`), e o
  `docker-compose.yml` continua valendo para a VPS. Os dois ligados disputam a porta 5432.
- **Não fechar o Docker Desktop à força.** `Stop-Process -Force` deixa sockets unix órfãos
  (`%LOCALAPPDATA%\Docker\run\dockerInference`, `docker-secrets-engine\engine.sock`); na abertura
  seguinte ele tenta apagá-los, o Windows devolve erro 1920 e o Docker fecha com *"unexpected
  error"*. `Remove-Item`, `del` e `fsutil reparsepoint delete` falham; **renomear a pasta** que os
  contém resolveu. **Nunca "Reset to factory defaults"** — apaga os volumes, e o banco com eles.

---

## Conhecimento que custou caro

### Bling

- Credenciais no header **`Authorization: Basic`**, não no corpo.
- Autorização em `https://www.bling.com.br/b/Api/v3/oauth/authorize` — **com `/b/`**.
  Token em `https://api.bling.com.br/Api/v3/oauth/token` — **sem `/b/`**.
  API em `https://api.bling.com.br/Api/v3`.
  **Até 15/09/2026 a API era em `www`**; naquele dia passou a responder *"A URL
  'www.bling.com.br' está bloqueada para requisições de API. Por favor, utilize o endpoint
  oficial: 'api.bling.com.br'"*. Trocado em 16/09. O token foi conferido **sem credencial**
  (um pedido por host, os dois devolvem `invalid_client`), para não gastar a cota de 20
  pedidos que bloqueia o IP. A autorização continua em `www`: é a página que o navegador
  abre. **A primeira renovação de token pelo host `api` ainda não aconteceu** — se falhar,
  é o primeiro suspeito.
- **`GET /produtos` não ordena por código.** A importação ("Importar do Bling", em
  `src/lib/integracoes/importarBling.js`) lê o catálogo ativo inteiro — 1.834 produtos, 19
  páginas de 100, ~10 s — e ordena na memória, em ordem natural (`100103` antes de
  `100103_10`). Cada clique traz os **próximos 5** que ainda não existem aqui (por `blingId`
  ou SKU), e cria junto o `Anuncio` BLING com `idExterno`: sem ele a lista oferece
  "Cadastrar no Bling" e duplicaria o item no ERP. Código com barra (`900314_8/conector`)
  não vira SKU, porque SKU é nome de pasta.
- **Imagem do Bling é link do S3 que expira em uma semana** — por isso é baixada para
  `dados/produtos`, não guardada como URL.
- O `code` vale **1 minuto**. O refresh token dura 30 dias e **rotaciona**.
- **20 pedidos de token em 60s bloqueiam o IP por 60 minutos.** Nunca pedir token se o
  guardado ainda vale.
- **3 requisições por segundo**, da conta inteira. Toda chamada passa pela fila de
  `src/lib/integracoes/httpClient.js`.
- `GET /canais-venda` (**`/lojas` dá 404**), `GET /produtos/lojas` (o campo `codigo` guarda
  o `MLB...`), `GET /produtos?codigo=<sku>`, `GET /depositos`.
  **`GET /integracoes` dá 403** com os escopos atuais.
- O canal do ML é o **`203593931` ("ML_4h")**. Há 8 canais desse tipo e só um ativo —
  gravar no canal errado quebra a sincronia de estoque **sem dar erro**.

### Mercado Livre

- Credenciais **no corpo**, não em header Basic. Sem PKCE.
- **Recusa `localhost`** como redirect. Usamos `sistema-rise.localtest.me` (domínio público
  que resolve para 127.0.0.1). **Mas a interface não funciona nesse domínio** — o navegador
  bloqueia os scripts por DNS rebinding. Daí: interface em `localhost`, OAuth do ML em
  `localtest.me`. O fluxo **começa e termina** no mesmo domínio, senão o cookie de `state`
  se perde.
- Access token dura 6h; o refresh exige o escopo **`offline_access`**.
- Conta **`4HOBBY_STORE`**, seller `212386247`, no modelo **User Products** →
  **`family_name` é obrigatório** ao publicar.
- **Preço saiu do `POST`/`PUT /items`** (março/2026): vai em
  `POST /items/{id}/prices/standard`.
- **Título não muda depois que o anúncio tem vendas.** Encerrar é irreversível.
- Publicar **pausado**, ajustar, e só então ativar — falha no meio não deixa anúncio
  incompleto no ar.
- Imagens por **upload binário** (`POST /pictures/items/upload`), 500×500 a 1920×1920.
- `GET /sites/MLB/search` dá **403** (busca pública fechada).

### Loja Integrada

- A API exige **Chave de Aplicação**, emitida só a provedores de solução, e a solicitação
  para lojistas **está suspensa**. Confirmado: com app key inválida vem
  `401 "Chave de Aplicação não encontrada"` — o que valida o formato do header.
- Até reabrirem, **o canal é atendido pelo Bling**, que tem chave própria.
- As URLs de produto são baseadas no **nome** e editáveis — não dá para deduzi-las do id.
  Por isso `Produto.urlLojaIntegrada` é preenchido à mão.

### Mercados (coleta de concorrentes e fornecedores)

Bloco que lê sites de terceiros. **Não tem vínculo com o catálogo próprio** — nada aqui
lê ou escreve `Produto`, por decisão explícita do dono.

**Duas etapas que não se misturam** — combinado com o dono em 28/08/2026, depois de uma
tentativa de coletar os 20 produtos direto do teste:

1. **"Testar fonte" só valida, não coleta.** É o campo que responde "dá para ler este
   site?". Amostra pequena (3 produtos, teto de 25 páginas), **nada é gravado — nem em
   JSON nem no banco**. Verificar HTTP 200 não responderia nada — toda loja devolve 200 na
   home; o que decide é conseguir normalizar produto com nome, endereço e preço.
2. **A coleta de verdade só começa depois que a fonte é salva.** São os ~20 produtos por
   concorrente ou fornecedor. Nunca disparar coleta a partir da tela de teste: são
   momentos diferentes do fluxo, e juntá-los já foi erro cometido uma vez.

**A coleta grava no Postgres** — desde 15/09/2026, a pedido do dono ("não vamos mais usar
JSON"). Até ali gravava em `dados/coleta/<domínio>/produtos.json`; os 7 arquivos foram
carregados por `scripts/migrar-coleta-json.js` (2.471 produtos, contagem conferida fonte a
fonte) e guardados em `dados/backup/coleta-json-20260915/`.

- **Quanto se colhe: TUDO, de todas as fontes** — decidido pelo dono em 15/09/2026, no fim da
  sessão (antes eram 20 por concorrente). `TETO_POR_FONTE` e `ORCAMENTO_PAGINAS` (20.000, em
  `coletar.js`) não são cota: são freio para a loja gigante não prender o worker. Quem
  encostar no freio aparece na tela com "produtos no site" maior que o coletado.
- **Custo disso, medido nos números das fontes de hoje:** cada produto exige abrir a página
  dele, a 1 requisição a cada 2 s por domínio — a Smartkits (3.780) leva ~2 h, a Casa da
  Robótica (2.294) ~1,3 h. **Eletrogate e Impacto CNC pedem 10 s entre visitas**: 500
  produtos já são ~1,4 h cada. A varredura completa das oito fontes é trabalho de uma noite,
  e desde 16/09/2026 corre com **3 lojas ao mesmo tempo** (ver "Worker da coleta").
- **O botão "Atualizar dados" enfileira**, não executa: varrer seis lojas passa de dez
  minutos, o que não cabe numa requisição HTTP e morreria no primeiro hot reload. Quem
  executa é o `scripts/worker.js` (`npm run worker`): `varrerFonte` → `colherProdutos` ou
  `reprocessarArquivos` → `gravarColeta` (`banco.js`).
- **O mesmo `colher.js` do "Testar fonte".** Era aqui que as duas trilhas divergiam: a tela
  mostrava o que o normalizador completo extraía e a gravação guardava o que um extrator
  antigo entendia. O caminho antigo do banco (`gravar.js`, `coletarUrl`, `conferirSite`, a
  tabela `PaginaColetada`) foi **removido**: gravava o formato do extrator antigo e exigia
  URL, que os 1.911 da Fortek não têm.
- **`ProdutoColetado` espelha o produto de `normalizar.js`**, e `linha.js` converte nos dois
  sentidos. A conversão tem que **voltar igual**: conciliar lê do banco e grava de novo, e
  assinatura diferente reescreveria a lista inteira a cada envio.
- **O JSONB reordena as chaves.** `origens` e `seo` voltam do Postgres em outra ordem, e com
  `JSON.stringify` comum o mesmo produto dava outra assinatura. A assinatura usa chaves
  ordenadas; a ordem dos ITENS continua valendo, porque a ficha é ordenada.
- **A chave é `fonteId + chave`**: `codigo:` quando há código (não `N/A`), senão `url:`,
  senão `nome:` normalizado. A Usinainfo publica o mesmo produto (09109, id 6072) por dois
  endereços; pelo código, é um só — por isso 20 no JSON viraram 19 no banco.
- **Só escreve o que mudou.** Sem mudança de conteúdo, só `vistoEm` avança, num
  `updateMany`. A série (`PrecoHistorico`) ganha linha quando **preço normal, promocional,
  de reserva ou status de estoque** mudam — a quantidade fica de fora, senão todo
  reprocessamento da Fortek viraria mudança. O detalhe mostra como anterior o **último
  preço diferente**, e não a penúltima linha, que pode ser só mudança de estoque.
- **Produto de site que some da amostra não é apagado** — fica com o `vistoEm` antigo.
  Ficar fora de 20 não prova que saiu do ar, e o histórico de preço dele continua valendo.
- **Mas a tabela mostra só a última coleta de cada fonte** (`produtosParaLista`), decidido
  pelo dono em 15/09/2026. Loja sem sitemap de produto é varrida por **navegação**, e cada
  varredura cai numa amostra diferente: a Usinainfo trouxe 19 produtos em 02/09 e outros 19
  em 15/09, **sem repetir um endereço**. Listando todos, a loja cresceria vinte linhas por
  varredura e misturaria preço de hoje com preço de duas semanas atrás. Para fornecedor não
  muda nada: a lista conciliada inteira é regravada a cada reprocessamento, ausentes
  incluídos.
- **Fonte que nunca fechou uma coleta entra com tudo o que já gravou** (17/09/2026). O filtro
  era `ultimaColetaEm not null`, e essa data só é escrita no fim da varredura. Com os lotes, a
  primeira varredura de uma loja grande grava por horas: a Mamute Eletrônica tinha 3.711
  produtos no banco e **não aparecia na tabela nem no filtro de fontes** (o filtro sai dos
  produtos listados). Sem coleta fechada não há "anterior" para misturar.
- **O saldo anterior fica guardado** (`quantidadeAnterior`, `quantidadeAnteriorEm`), pedido do
  dono em 15/09/2026 para montar depois o histórico de venda: com os dois números e as duas
  datas dá para dizer quanto saiu entre uma varredura e outra. **São dois campos porque um
  só não serve** — "de 20 para 10" não diz se foi numa semana ou em seis meses. Só muda
  quando a quantidade muda, e **saldo não informado não apaga o anterior**: produto fora da
  lista do fornecedor fica sem saldo, e isso não é uma quantidade nova. O histórico em si
  **ainda não existe** — por enquanto só se guarda o par.
- **Ausente guarda a data da PRIMEIRA lista em que faltou.** A conciliação carimba a data da
  lista atual; `gravarColeta` mantém a guardada, senão um produto fora há dois meses
  pareceria ausente desde a semana passada.
- **A última coleta mora na fonte** (`ultimaColetaEm`, `ultimaColetaOrigem`,
  `ultimaColetaTotal`, `ultimaColetaDuracaoMs`, `ultimaColetaResumo`), escrita por quem
  grava. A trava de queda compara com `ultimaColetaOrigem`.
- **A lista enviada também**: `listaArquivos` e `listaEnviadaEm` substituíram o
  `manifesto.json`. Os **originais** (HTML, planilha) continuam em
  `dados/coleta/<domínio>/arquivos/` — não são JSON, e é deles que se reprocessa.
- **A lista da tela é leve**: `produtosParaLista` traz tudo sem galeria, descrição nem
  ficha, e filtra em memória; a miniatura (base64, na Fortek) vem só para as 100 da página.
- **Json nulo no Prisma é `Prisma.DbNull`.** `null` puro num campo `Json?` é recusado.
- **A fonte nasce pausada**, com `proximaVarreduraEm` a 100 anos: salvar um cadastro não
  pode disparar varredura sozinho. Fonte pausada dá recado dizendo para usar "Retomar".
- **O ciclo automático está LIGADO, e desde 16/09/2026 é de 30 dias** (`intervaloHoras` = 720,
  migration `20260916_intervalo_30_dias`). Era de 24 h, mas com o catálogo inteiro de cada loja
  uma varredura leva horas (Eletrogate: 8.783 páginas a 10 s cada) e emendava na seguinte.
  Fonte ativa cuja `proximaVarreduraEm` venceu é enfileirada pelo worker a cada volta
  (`enfileirarVencidas`), sem clique. A migration levou a próxima varredura das fontes já
  varridas para 30 dias depois da última. As que estavam na fila rodam uma vez e ganham a data
  nova no fim.
- **Fornecedor com lista e site (Nightech) navega o site sem gravar em lotes**: a trava de queda
  precisa da lista inteira, mesclada.
- **O teto da tabela subiu de 100 para 300.** A data é da **coleta inteira**, não de cada
  produto, então a ordenação agrupa por fonte e um teto apertado corta a fonte mais antiga
  **por completo**: com 100, a Casa da Robótica sumia da tela inteira tendo 20 produtos
  coletados. Com a Fortek e a Nightech em disco o teto passou a ser atingido de verdade, e
  foi substituído pela paginação (item seguinte).
- **A lista é paginada, 100 por página.** O teto de 300 não cortava linhas: cortava o
  acervo — com 2.469 produtos, **88% eram inalcançáveis** e o rodapé mandava "refinar a
  busca" para ver o que já estava coletado. Navegação em setas (`«  ‹  [n]  ›  »`), no topo
  e no rodapé; a de cima é compacta porque medido: filtros ocupam 772px e a barra completa
  455px, e não cabem em 1165px.
- **Trocar filtro ou busca zera a página.** Quem está na página 12 e filtra uma fonte de 40
  produtos cairia numa página que não existe mais e veria tabela vazia — parecendo que o
  filtro não achou nada. Além disso a página vinda da URL é **grampeada** ao intervalo
  válido, porque link antigo e varredura que encolhe a lista produzem o mesmo efeito.
- **O filtro de fontes aceita VÁRIAS**, por caixa de marcação (`?fonte=A&fonte=B`). Começou
  como `<select>` de escolha única, e comparar Fortek com Nightech — que é o trabalho —
  exigia carregar a tela duas vezes. Parâmetro repetido, nunca lista separada por vírgula:
  "Casa da Robótica - Varejo" já mostra que pontuação em nome de loja é normal. **Nenhuma
  marcada quer dizer todas**, e "Todas" limpa a escolha em vez de marcar as sete — marcar
  todas prenderia o filtro ao conjunto de hoje, e a fonte cadastrada amanhã ficaria de fora
  sem ninguém perceber.
- **`IN_STOCK` e `AVAILABLE` são o mesmo fato com dois nomes**: os leitores de arquivo
  gravam o primeiro, o raspador de site o segundo. A tela só conhecia `AVAILABLE`, e os
  **1.592 produtos em estoque da Fortek não mostravam linha nenhuma** — nem disponível, nem
  esgotado. Quem interpreta status tem que aceitar os dois.
- **Na lista, produto de fornecedor mostra o preço COM imposto em destaque.** O
  distribuidor cobra por fora — a Benser escreve *"Preço unit. sem IPI"* — então os R$ 44,90
  não são o que se paga; embaixo vem R$ 47,82 com o rótulo `IPI 6.5%`. Sem dizer **quais**
  impostos entraram, o número não tem como ser conferido.
- **Sem endereço não há link, e havia um que não levava a lugar nenhum.** O `<a>` era
  montado sempre; com `url` nulo o href sumia e sobrava texto azul convidando ao clique. São
  os 1.911 da Fortek, que vieram de arquivo de portal atrás de login — não existe página
  pública, e isso não é defeito de coleta. A tela diz a razão.
- A **ficha técnica** no painel é lista ordenada, igual à prévia — linha sem rótulo aparece
  com marcador, nunca com nome inventado. O campo `atributos` (objeto) era do caminho do
  banco.
- O bloco vive na branch **`bloco-mercados`**, ainda não fundida na principal.

### Worker da coleta — reescrito em 16/09/2026

Um dia inteiro de defeitos no mesmo lugar levou à reescrita:
- job "em andamento" por horas sem ninguém varrendo;
- dois workers disputando a fila;
- worker preso para sempre;
- loja que falhava voltando à fila na hora.

A raiz era uma só: **a vida de um job era deduzida do andamento dele** (`atualizadoEm`), e as
duas coisas não são a mesma.

**Como rodar.**
- `npm run worker` sobe o **supervisor** (`scripts/worker.js`), que sobe o worker
  (`scripts/worker-processo.js`) e o religa quando cai, com espera de 5 s a 2 min.
- **Não use mais laço de shell** (`until npm run worker; do ...`). Ele sobrevivia à sessão e
  religou um worker enquanto outro rodava.
- **Log em arquivo:** `dados/logs/worker-AAAA-MM-DD.log`. Quando uma varredura "para", é lá
  que se vê por quê.
- **Para parar:** Ctrl+C no terminal dele, ou `npm run worker:parar` de qualquer lugar (pedido
  por arquivo, `dados/worker.parar`). Os dois devolvem as varreduras à fila **sem gastar
  tentativa**, gravam o lote aberto e encerram em ~1 s. O supervisor sai junto, sem religar.
- **Matar o processo (`taskkill /F`) não é parar.** No Windows o Node põe o filho num *job
  object* que o mata junto com o pai, sem aviso (medido: até filho sem canal nenhum morre). Os
  jobs ficam `PROCESSANDO` e o próximo worker os recolhe **na partida**, gastando uma
  tentativa.

**Três sinais, cada um com uma pergunta** (`src/lib/coleta/fila.js`):

| Sinal | Pergunta | Como |
| --- | --- | --- |
| `WorkerColeta.sinalEm` | o processo está vivo? | relógio, a cada 15 s (`SINAL_MS`) |
| `Job.sinalEm` + `workerId` | o dono ainda cuida do job? | relógio, a cada 15 s; sem sinal há 2 min = largado |
| última resposta do site (`ultimaRespostaDe`) | a varredura anda? | o vigia cancela após 10 min sem resposta |

Loja lenta não parece worker morto (o sinal é por relógio), e varredura travada não parece
viva (o vigia olha a atividade).

**O vigia olha a última RESPOSTA do site, e não o andamento em produtos.** O andamento só
aparece nos laços de página. A leitura de catálogo e sitemap vem antes e passou de 2 min na
Smartkits; numa loja com 10 s entre visitas passaria dos 10 min, e o vigia cancelaria uma
varredura legítima. Toda requisição termina em até 20 s, com sucesso ou erro, então varredura
viva responde a cada poucos segundos em qualquer fase.

**Três garantias que o banco dá**, em vez de o código conferir antes de agir:
- **Um worker por vez:** `pg_try_advisory_lock` numa conexão própria. A trava morre com a
  conexão, então processo morto nunca a deixa presa. O segundo worker sai com código 3, e o
  supervisor não insiste.
- **Um job aberto por fonte:** índice único parcial `Job_fonte_aberta` (só `PENDENTE` e
  `PROCESSANDO`), migration `20260916_worker_paralelo`. O Prisma não descreve índice parcial,
  então ele mora só no SQL. `enfileirar` usa `createMany({ skipDuplicates })`, e o botão e o
  ciclo de 30 dias podem enfileirar no mesmo instante.
- **Um dono por job:** `pegarProximoJob` é um `UPDATE ... WHERE id = (SELECT ... FOR UPDATE
  SKIP LOCKED)`. Antes era "achar, depois marcar", e dois workers pegavam o mesmo job.

**5 lojas em paralelo** (`COLETA_PARALELO`, padrão 5, pedido do dono; eram 3 no mesmo dia).
Cada domínio tem a própria fila de ritmo (`buscar.js`), então paralelo não aperta site nenhum.
É um worker com cinco varreduras, e não cinco workers, porque a varredura é espera de rede, não
CPU.

**A coleta NÃO usa `fetch`** (`src/lib/coleta/http.js`, sobre `node:http`/`node:https`). O
`fetch` do Node é o `undici`, e ele derruba o **processo inteiro** com
`AssertionError: assert(!this.paused)` em `Parser.finish`, seguido de abort do libuv.
- **Quando acontece:** o site responde com `Connection: close` e sem tamanho declarado, e fecha
  a conexão no instante em que o leitor do corpo está pausado por contrapressão. Nenhum
  try/catch alcança.
- **Quanto custou:** derrubou o worker 4 vezes em 16/09/2026, e 3 delas vieram em 13 min com
  três lojas em paralelo.
- **Reprodução:** 12 conexões simultâneas lendo com pequenas pausas
  (`dados/diag/repro4.mjs`, descartável). Cai no undici 7.29.0 do Node 24 **e** no 8.10.2, o
  mais novo, então atualizar não resolve. O cliente nativo passou 3×1.500 requisições no mesmo
  teste.
- **O que `obter` refaz à mão:** segue redirecionamento (recusa outro domínio em página, aceita
  em sitemap), descompacta gzip/deflate/br, aplica o teto de tempo até o último byte e o teto de
  tamanho, e sempre consome ou descarta o corpo.
- **Resto do sistema:** fora da coleta (integrações, IA, imagens) o `fetch` continua. Lá ele
  roda no servidor do site, e não no worker.

**Retomada: a varredura continua de onde parou** (pedido do dono em 16/09/2026).
- **Como funciona:** o job guarda `payload.inicioDaColeta`, gravado ao começar e mantido em
  queda, encerramento e recolhimento. A tentativa seguinte passa a data a `varrerFonte`, que
  busca os endereços gravados pelos lotes desde então (`enderecosGravadosDesde`).
  `colherProdutos({ jaColetadas })` não reabre essas páginas e as conta como `retomados`, no
  catálogo, no sitemap e na navegação (`rastrear({ pular })`, que não segue os links delas).
- **Fechamento:** a coleta fecha com a data da primeira tentativa e o total inclui os
  retomados.
- **Perda máxima numa queda:** o lote aberto, até 9 produtos.
- **Validade:** 3 dias (`RETOMADA_VALE_MS`). Depois disso o preço gravado envelheceu, e a
  varredura começa de novo.
- **Fornecedor com lista (Nightech) não retoma:** a trava de queda precisa da lista inteira.
- **Cada endereço é tratado uma vez por colheita** (`tratados` em `colher.js`, 16/09/2026).
  Catálogo, sitemap e navegação listam os mesmos produtos, e cada fase refazia a anterior.
  - **Retomados em dobro:** na Smartkits a tela mostrou 7.249 retomados para 3.625 gravados.
  - **Produtos reabertos:** os 3.780 itens do catálogo eram abertos de novo pelo sitemap, antes
    mesmo da retomada existir.
- **Catálogo completo encerra a colheita:** a loja declara o total e todos os itens foram
  lidos, então sitemap e navegação não rodam. Antes, a navegação ia até o teto de 20.000
  páginas atrás de produto que o catálogo já tinha dado; a tela marcava 564 s/produto. Com a
  correção, a Smartkits fechou em 8 min (157 páginas).
- **Teste:** queda no meio de uma loja de 25 produtos; o seguinte abre só o que faltava.

**Freio de secura: 300 páginas seguidas sem produto novo encerram a navegação** (`SEM_ACHADO` em
`descobrir.js`, 17/09/2026). O teto de 20.000 páginas não bastava. O Eletrogate declara **2.033** no
catálogo público e a colheita fecha em **2.030**: por causa de três itens que a loja conta e não
publica, a navegação saiu atrás deles e passou **6h40 abrindo 6.111 páginas sem gravar nada**. Loja
com produto a achar acha bem antes disso — a Usinainfo, que só se varre por navegação, acha um a
cada duas páginas. **Retomado não zera o contador:** não custou visita e não prova que ainda há o
que achar. Quando o freio corta, a tela diz por quê ("N páginas seguidas sem produto novo"), senão
"2.030 de 2.033" pareceria varredura interrompida por erro. Testado com um corredor infinito de
categorias na loja falsa do `teste:worker`.

**Tentativas numa queda.** Antes, o erro fatal devolvia todo job como PENDENTE, e o log mostrou
"tentativa 4/3".
- **Erro fatal:** o job na última tentativa agora FALHA e a fonte é adiada.
- **Pegar job:** `pegarProximoJob` não pega job com tentativas esgotadas.
- **Na fila:** `fecharEsgotados` fecha os que já estavam nela.

**Tela: botão de status** ao lado de "Varredura em andamento", com o número de lojas em
varredura. Ao clicar abre a tabela: produtos, páginas, **segundos por produto** e quanto falta.
- **Segundos por produto:** o worker mede entre o primeiro e o último produto **novo** desta
  passada, sem contar descoberta nem retomados, e só com 2 ou mais produtos.
- **"Falta" e o total:** só aparecem quando o total é o catálogo de verdade. `total` igual ao
  teto (20.000) é loja que não publica quantos tem, e "falta 11h38" seria inventado.
- **Vale a pena:** mostra por que uma loja demora. A Impacto CNC dá ~18–20 s/produto (10 s de
  Crawl-delay mais as páginas de categoria no caminho); as outras, ~2 s.

**Defeitos fechados, com a causa medida:**
- **Worker preso para sempre numa página.** `buscarPagina` desligava o relógio de 20 s quando
  chegavam os cabeçalhos, e o corpo era lido **sem teto**: loja que parasse de mandar bytes
  prendia o worker sem erro e sem log. Agora o `AbortSignal.timeout` vale até o último byte (e
  para robots.txt e sitemap). Teste: página que manda cabeçalho e para.
- **Cancelar demorava até 60 s**, porque catálogo, sitemap e preço à vista não recebiam o
  sinal. Hoje `sinal` chega a `colherProdutos`, `rastrear`, `lerCatalogo`, `descobrirSitemaps`,
  `lerSitemaps`, `lerAVista` e à requisição em voo.
- **Loja que esgotava as tentativas voltava à fila na volta seguinte**: continuava "vencida".
  Agora `adiarFonte` a empurra 6 h (`ESPERA_APOS_ESGOTAR_MS`).
- **Job largado só era recolhido entre um job e outro**: a Smartkits ficou 4 h "881 de 3780"
  com o worker varrendo a Impacto CNC. `recolherLargados` roda a cada volta (5 s), esteja o
  worker ocupado ou não.
- **Erro fatal fora de qualquer `try`** (o `AssertionError` do `undici` que derrubou o worker
  na Casa da Robótica): `uncaughtException`/`unhandledRejection` devolvem os jobs e saem com
  código 1, e o supervisor religa.
- **Varredura que não responde nem ao cancelamento** (60 s de graça): o job é devolvido e o
  worker reinicia, porque a promessa viva ainda poderia escrever no banco.
- **Andamento velho na tela**: o job pego zera `total/feitas/visitadas` no próprio `UPDATE`.

**`NOW()` do Postgres está em `America/Sao_Paulo`, e as colunas são UTC.** As colunas são
`TIMESTAMP` sem fuso, gravadas pelo Prisma em UTC. Comparado a elas, `NOW()` vira hora local,
3 h atrás. Em SQL cru, use `(NOW() AT TIME ZONE 'UTC')`. O teste do worker pegou isso antes de
ir ao ar: o job só seria pego 3 h depois, e todo sinal de vida nasceria velho.

**`COLETA_FONTES=<id,id>`** restringe o worker a essas fontes, com **outra trava**. Serve para
o teste (sobe ao lado do worker normal sem tocar na fila dele) e para varrer uma loja só ao
investigar. Fonte com `dominio` gravado **com protocolo** (`http://127.0.0.1:porta`) é varrida
como está; é assim que o teste usa uma loja falsa local.

**O teste do worker roda com o worker real no ar.** Os jobs dele levam `payload.teste = true`,
que o worker sem filtro não pega nem recolhe. Uma primeira versão criava uma fonte de teste já
vencida, e o worker no ar a enfileirou para si no meio do teste. Hoje o ciclo automático é
testado com um `agora` simulado (`enfileirarVencidas({ agora })`).

**Tela Mercados:** depois da migration, o servidor do site precisa ser **reiniciado**. Sem isso,
o cliente Prisma antigo na memória (`globalThis.prismaRise`) não tem `workerColeta`, e a consulta
de andamento dá 500.

**Em aberto no Mercados** — estado em 15/09/2026:

- **Conferir o campo Documentos na prévia do teste de fonte.** A extração está testada; o
  que nunca foi visto é a tela desenhando o link clicável.
- **A Nightech passa a varrer a vitrine inteira** (decidido em 15/09/2026). A primeira
  varredura depois disso ainda não rodou: conferir o tempo e o total que ela dá.
- **Usinainfo sem total de catálogo é de propósito**, não pendência: o único sitemap dela
  são 12 rotas de busca (ver "Sitemap", abaixo).
- **A varredura de site grava em lotes de 10 produtos** (`LOTE_GRAVACAO`), desde 16/09/2026, a pedido do dono (que escolheu 10, e não 50).
  Antes `gravarColeta` só rodava no fim, e a queda custava a varredura inteira: a Casa da
  Robótica tinha aberto 1.157 das 2.294 páginas e **nada** foi salvo, e o Eletrogate chegou a
  2.000 produtos só em memória, com dias de navegação pela frente.
  - `colherProdutos` chama `aoGuardar` a cada produto novo, e `varrerFonte` junta 10 e grava.
  - Os lotes vão **em fila** (`gravacoes`): produto é achado dentro de chamada que ninguém
    aguarda, e duas transações da mesma fonte criariam a mesma chave. O lote sai do buffer
    antes de gravar; lote que falha volta para a gravação final.
  - Lote grava com `fecharColeta: false` (não mexe na "última coleta"). A gravação final
    fecha com **`inicioDaColeta`**: a tela lista quem tem `vistoEm` a partir dessa data, e
    com a data do fim os lotes anteriores sumiriam da lista. O total é o da varredura inteira.
  - **Lista de fornecedor continua gravando de uma vez**: a trava de queda precisa da lista
    inteira para comparar.
  - Se o worker cair, os lotes gravados ficam, mas a "última coleta" da fonte não avança. A
    tela mostra a coleta anterior mais os lotes novos, até a próxima varredura fechar.
  - Varredura **cancelada** (worker encerrando, vigia) grava o lote aberto antes de sair.
  - **Mudança no código da coleta só vale depois de reiniciar o worker**: o Node carregou o
    código antigo. `npm run worker:parar` e `npm run worker`.
- A unidade de venda do fornecedor (ver "Ainda em aberto" em Fornecedores).

**As telas, e o vocabulário do dono** — ajustado ao longo de 01/09/2026:

- **"Sites" virou "Fontes"**, "Atualizar tabelas" virou **"Atualizar dados"**, "Coletados"
  virou **"Produtos atualizados"** e "Ficha Técnica" virou **"Características"**, para
  casar com a aba Produtos. Nome de tela é vocabulário de quem opera, não do código.
- **Fontes é dividida por abas** (Fornecedores / Concorrentes), por `?tipo=` na URL. Uma
  primeira versão pôs os dois lado a lado como cartões de resumo e o dono recusou: ele quer
  **a lista inteira de um tipo por vez**, não um resumo dos dois. Com a aba respondendo o
  tipo, a coluna "Fornecedor/Concorrente" saiu — repetir o rótulo em toda linha de uma aba
  que já se chama Fornecedores só gasta largura.
- **A coluna da lista só aparece na aba de fornecedor.** Concorrente tem vitrine; cinco
  linhas de travessão não são informação. Quem muda de colunas muda o `colSpan` das linhas
  de apoio junto (`COLUNAS_BASE`), senão as linhas de erro e edição desalinham.
- **"Última varredura" traz a duração entre parênteses.** É o que explica por que uma fonte
  demora quatro vezes mais que outra pelo mesmo trabalho — o Eletrogate e o Impacto CNC
  pedem 10s entre visitas, e sem o número a lentidão parece defeito nosso. Coleta antiga
  não tem o campo e **não ganha um inventado**: `null`, e a tela não mostra nada.
- **O botão pergunta o estado ao ABRIR a tela, não só depois do clique.** `situacao`
  nascia `null`, então quem chegasse no meio de uma varredura via o botão ocioso, clicava,
  e levava *"Já há uma varredura em andamento"* **em vermelho** — concluindo que a
  atualização falhou, quando ela estava correndo. Recusa não é erro: ela agora vira
  estado (botão desabilitado, fonte da vez e percentual), e o vermelho fica para falha de
  verdade.
- **Uma linha por loja em varredura** (até três), e "e mais N fontes na fila". O aviso
  "Nenhum worker no ar" vem do registro do worker (`WorkerColeta`), não da idade dos jobs —
  ver "Worker da coleta".
- **"2000 de 500 (400%)"**: o total é o que se sabia do catálogo, e o sitemap do Eletrogate
  lista só 500 endereços. Quando a contagem passa do total, a tela mostra só "N produto(s)" e as
  páginas abertas, sem percentual.
- **A fila aparece ao lado do andamento** ("e mais 4 fontes na fila"). Só a fonte da vez
  faz a varredura parecer quase pronta com cinco lojas pela frente, e há loja que pede 10s
  entre visitas — o Eletrogate leva 4min sozinho contra 49s da Smartkits.
- **"Retomar" ligava a fonte e a deixava invisível para o ciclo automático.** A fonte nasce
  pausada com `proximaVarreduraEm` a cem anos — para que salvar um cadastro não dispare
  varredura sozinho —, e `alternarFonte` só virava o `ativa`, deixando a data em **2126**.
  O ciclo filtra por ela, então a fonte aparecia **"Ativa" na tela e nunca era varrida**.
  Foi o que houve com a Fortek e a Nightech: passaram a sessão inteira ativas, com
  *"última varredura: nunca"*, enquanto as cinco concorrentes rodavam — e ninguém notou,
  porque a tela não tinha como mostrar a diferença entre "ativa" e "agendada". Retomar
  agora devolve a data; pausar não mexe nela, porque quem pausa quer parar.
- **A coluna se chama "Produtos no site/arquivo" na aba de fornecedor.** "No site" mentia
  ali: o catálogo da Fortek vem da **lista** que ela manda, não de vitrine — o portal dela
  está atrás de login e varrer devolve zero.
- **"Produtos no site" era gravado só no CADASTRO da fonte.** A colheita mede o tamanho do
  catálogo a cada varredura (`produtosNoSite` em `colher.js`) e o worker **descartava o
  número**: a coluna ficava congelada no que o teste viu no dia do cadastro, e fonte cujo
  teste não provou o total mostrava travessão para sempre — por mais varreduras que
  rodasse. O worker agora persiste, e o catálogo público e o sitemap são reconsultados a
  cada volta de qualquer jeito, então guardar sai de graça.
- **Mas só escreve quando a varredura PROVOU o total.** Espalhar o resultado inteiro no
  `update` gravaria `null` na varredura que não conseguiu medir, **apagando um número bom
  da semana passada** — a loja continua tendo 2.296 produtos no dia em que o sitemap não
  responde. Não saber quantos são não é o mesmo que saber que são zero.
- **Para fornecedor que manda lista, o catálogo É a lista.** Não há vitrine para contar:
  o total é o que a lista declara depois de conciliada, ausentes incluídos — eles
  continuam sendo produtos dele, só sem saldo confirmado nesta remessa.
- **A data é a da última coleta gravada, não a da varredura.** `ultimaVarreduraEm` só é
  escrito pelo worker; reprocessar a lista fora dele não mexia nele, e a Fortek aparecia
  como "nunca" com 1.911 produtos guardados. Hoje é `ultimaColetaEm`, escrito por quem grava.
- **O ⓘ guarda instruções de download/upload por fonte** (`FonteColeta.instrucoes`), porque
  cada portal tem um caminho diferente e isso vive hoje na cabeça do dono. **Senha não vai
  aí** — o campo é texto puro, aparece na tela e vai para o dump; credencial pertence à
  `Conexao`, cifrada. A tela diz isso por escrito.
- **O detalhe do produto de fornecedor espelha a prévia do teste de fonte:** duas caixas,
  *Pronta entrega* e *Reserva*, cada uma com preço, preço com impostos e a **quantidade
  dela**. Repor o que vendeu e planejar importação não se comparam pelo mesmo número, e na
  Fortek a reserva chega a custar mais caro (`65-276`: 79,90 contra 82,90). O operador
  aprova a fonte olhando aquelas caixas e depois consulta o produto aqui — dois desenhos
  para o mesmo dado obrigariam a reaprender a ler. Fornecedor que não diferencia o preço da
  reserva mostra o da pronta entrega com a nota *(mesmo da pronta entrega)*, e a caixa de
  reserva **some** quando o arquivo não trouxe o dado: vazia, ela diria que não há nada a
  chegar, quando a verdade é que a lista não informou.

**Um caminho só.** `colher.js` é usado pelo teste e pela coleta em lote, mudando só o
limite. Houve um período com duas trilhas — o teste usava o normalizador completo e a
gravação um extrator antigo — e o que a tela mostrava não era o que se guardava.

**Três formatos combinados, nunca escolhidos.** JSON-LD, **Microdata** (`itemprop`) e
OpenGraph. A Usinainfo publica preço em OpenGraph e código/marca em Microdata, sem
JSON-LD nenhum; o impactocnc só tem Microdata. Escolher um formato devolve metade.

- **Recorte no bloco do produto.** A página traz `schema.org/Product` dos **relacionados**
  ("quem viu isso viu também"). Sem recortar, 4 das 5 imagens eram de outros produtos.
  Corte no primeiro `isRelatedTo` ou segundo `itemtype=Product`.
- **Preço normal ≠ preço marcado.** Loja brasileira anuncia "R$ 49,90 / R$ 47,40 no pix".
  O `itemprop="price"` costuma ser o do **pix**. O de tabela vem em
  `productPriceWithoutReduction` (PrestaShop) ou `data-sell-price`. Atributo `data-price`
  **só conta se for MAIOR que o preço marcado** — noutra loja havia `data-price="0"`,
  `"2.09"` e `"4.85"`, que eram **opções de frete**.
- **`og:description` é resumo de SEO** (~155 caracteres). Vence a descrição **mais longa**
  entre as fontes, não a de um formato preferido: 138 contra 2946 na mesma página.
**Documentos: o datasheet do concorrente** — `documentos: [{titulo, url}]`, campo próprio e
clicável na prévia, nunca endereço colado dentro da descrição. É o que permite conferir se
o produto do concorrente é o **mesmo** que o nosso: dois módulos com nome diferente e o
mesmo CI são o mesmo item.

- **O que identifica documento é o TEXTO DO LINK**, mais extensão de arquivo (`.pdf`,
  `.zip`, `.stl`…) e endpoint de anexo (`controller=attachment`, do PrestaShop).
- **"Sai da loja" NÃO serve, e chegou a ser usado.** Parecia bom porque foi medido só no
  bloco da descrição de uma loja. Varrendo a página inteira, esse critério devolve **30**
  candidatos na Smartkits — WhatsApp vinte vezes, Instagram, TikTok, o selo da Loja
  Protegida — e **6** na Usinainfo, todos redes sociais. Com texto + extensão + anexo, as
  duas devolvem **um**: o datasheet.
- **Os dois casos reais não se parecem, e nenhum critério sozinho pega os dois.** A
  Smartkits hospeda no **Google Drive** — fora do domínio e sem extensão. A Usinainfo serve
  pelo **anexo do PrestaShop** (`index.php?controller=attachment&id_attachment=101`) — no
  próprio domínio e também sem extensão; responde `200` com
  `Content-Disposition: filename="Datasheet DS18B20.pdf"`. O `get-file` é que está no
  `Disallow` do robots; `attachment`, não — e de todo modo o endereço só é **guardado**,
  nunca baixado.
- **Varre a página inteira**, porque o link não mora num lugar só: na Tray fica dentro da
  descrição, na Usinainfo numa aba própria (`li.download_produto`), fora dela.
- Vocabulário de **documento**, não de página: "blog", "tutorial" e "projeto" ficam de fora
  de propósito — a Usinainfo linka o próprio blog no meio da descrição.
- **Especificações**: seção declarada pelo site, lida como **lista ordenada** de
  `{nome, valor}` — `nome: null` na linha sem rótulo, porque objeto JSON não comporta isso
  sem inventar chave. Encerra no título seguinte, num parágrafo, ou numa **linha em branco
  seguida de algo que não é par**.
- **O título da seção nem sempre tem dois-pontos.** A Smartkits escreve só
  `Especificações` no JSN-SR04T, em caixa normal, e a ficha inteira — dez itens — era
  descartada por causa de um caractere. A folga vale só para o título que o vocabulário já
  reconhece, curto e de até três palavras: aceita-se a linha que **só anuncia** a seção,
  nunca a frase que menciona a palavra.
- **O marcador de lista vale mais que a heurística de tamanho.** Onde o site escreveu `-`,
  ele está dizendo "isto ainda é ficha": o teto de palavras do rótulo sobe, e a regra de
  parágrafo não se aplica. `- Diferença mínima entre a entrada e saída: 1. 5 V DC;` tem
  sete palavras no rótulo (o teto era seis), então deixava de ser par, caía na regra de
  parágrafo por ter doze palavras no total e **encerrava** a ficha do XL6009 no terceiro
  item de onze. Quem limita rótulo é o tamanho em caracteres.
- **Numa lista marcada, linha sem marcador encerra.** É o site mudando de assunto sem usar
  dois-pontos no subtítulo: no JSN-SR04T a ficha é seguida de `Downloads`, `Acompanha` e
  `Garantia` — sem marcador, sem dois-pontos e sem linha em branco antes. Nenhuma das
  outras regras os alcançava, e os seis viravam especificação. O par escapa antes, então
  item solto sem hífen no meio da lista continua sendo lido.
- **Categoria**: breadcrumb em Microdata (só os `name` dentro de `itemListElement`) ou o
  **dataLayer do GA4** (`item_category`), casando por `item_sku` — a página empurra um
  objeto por produto, incluindo relacionados.
- **Estoque**: nenhuma loja testada declara `inventoryLevel`; o número está no texto
  (`estoque-qtd-45`, "Estoque: 45 unidades").
- **Imagens**: deduplicar por foto, ignorando o segmento de dimensão da URL
  (`/600x450/` e `/800x800/` são a mesma), e ficar com a maior.
- Campo ausente fica `null` — **nunca inventado**. Cada produto carrega `origens`, dizendo
  de onde veio cada valor, para distinguir lido de derivado.

**Plataformas, e o que cada uma esconde:**

- **Magento 2 (Saravati): o JSON-LD não vem solto — vem dentro de `ItemPage`.** O bloco único
  da página é um `ItemPage` com o produto em `mainEntity`, e o achatamento só descia por
  `@graph`: a página inteira era lida como "sem JSON-LD", caía no OpenGraph e o código saía
  **deduzido do endereço** (`4gb-ram` em vez de `srvt001158`). Em 15/09/2026.
- **Três preços na mesma página, e só um é o que se paga.** `data-price-type="finalPrice"` e
  o `product:price:amount` do OpenGraph trazem o do cartão (1.499,90); a oferta do JSON-LD
  traz o do **pix/boleto** (1.349,91); e `data-price-type="oldPrice"` é o **riscado**
  (1.599,90), que não é preço vigente e **não pode virar o normal** — o dono marcou o de
  1.499,90 como o preço integral. A loja não publica Microdata nenhum, então o riscado não
  entra como candidato; se um dia entrar, a regra do maior preço o elegeria.
- **O saldo está só no texto**: `<div class="availability only" title="2 itens">`. Ancorar no
  bloco é o que separa do "N itens" do carrinho.
- **A galeria do Magento só existe num bloco JSON.** Das três fotos da página da Saravati,
  só a principal é `<img>`; as outras duas vivem na inicialização
  `"[data-gallery-role=gallery-placeholder]"`, como `{thumb, img, full}`. Nenhuma regra
  baseada em `<img>` as alcançava. Fica o `full`, que é a maior das três versões do mesmo
  arquivo, e a galeria entra **antes** das estruturadas — a primeira entrada é a principal, e
  endereço de Magento não declara dimensão, então quem chega primeiro é quem fica.
- **O `/cache/<hash>/` do Magento é recorte, não foto.** A mesma foto principal chega por três
  caminhos (og:image, JSON-LD e o `full` da galeria), cada um com um hash diferente: a
  Saravati aparecia com "2 imagens" que eram **a mesma foto duas vezes**. O hash de 32
  caracteres e o segmento `cache` saem da identidade, como já saía o `/600x450/`.
- **CDN citado num link não é CDN da loja.** A mesma página da Saravati saiu identificada
  como **Loja Integrada**: ela cita `cdn.awsli.com.br` uma única vez, num `<a>` para o PDF do
  datasheet hospedado no CDN de outra loja, e isso valia os 5 pontos de CDN próprio — empate
  com o Magento (caminho 3 + marca 2), decidido pela ordem da lista. Agora o host só vale 5
  quando **serve** a página (`src`, `<link href>`); citado num `<a href>` vale 2. Plataforma
  errada não é detalhe: é ela que diz à tela onde procurar preço, código e imagens.

- **Tray** (Casa da Robótica): o microdata declara **só o nome** — sem `price`, sem
  `offers`, sem `sku`. A página tinha nome e endereço e mesmo assim reprovava por falta
  de preço. O preço vive num campo oculto, `<input id="preco_atual" value="25.99">`, que é
  o único lugar legível por máquina: o preço visível quebra os centavos em `<span>`
  aninhados. Logo abaixo vem `precoAvista`, **menor** — é o do pix, não o de tabela.
- **Tray: `preco_atual` vem `0.00` no produto esgotado.** A página do SK1089 mostra "Não
  disponível" e zera o campo, enquanto o `dataLayer` segue anunciando 59,90. Quem lê só o
  input perde o preço justamente onde a comparação interessa — o concorrente continua
  publicando quanto cobra. A alternativa é `price`/`priceSell` do `dataLayer`.
- **Tray: `priceSellDetails` vem STRING VAZIA quando não há parcelamento.** Não é lista
  vazia nem campo ausente, e é assim na Smartkits inteira, inclusive num produto de
  R$ 4.299,90 — enquanto `listSku` e `breadcrumbDetails` na mesma página são arrays de
  verdade. O `?.` não alcança `""`, e `"".find` derrubava a validação da fonte com
  `find is not a function` antes de qualquer preço ser lido. Campo de JSON de terceiro
  quer `Array.isArray`, não encadeamento opcional.
- **Loja Integrada** (Eletrogate): a galeria fica **fora** do escopo do `itemtype=Product`.
- **Tray**: os relacionados ficam **dentro** desse escopo. As duas convenções são opostas,
  e é por isso que recortar no bloco do produto **não** serve de regra geral para imagem.
- O **dataLayer é JSON lido por regex**, então os escapes chegam crus: a categoria aparecia
  como "Componentes Eletr\u00f4nicos" na tela. Decodificar só ali, onde se sabe que a
  origem é JSON — em `comoTexto` isso alcançaria texto de HTML, onde a sequência não é
  escape nenhum.

**Imagens além do formato estruturado:**

A loja publica só a principal em `itemprop`/`og:image`; as outras ficam em `<img>` comum
(`data-largeimg`, `data-zoom-image`). O filtro do que é do produto é o **diretório
completo** da foto, com origem — não a última pasta: a RoboCore serve
`.../1180/images/1180_1_H.png`, e "images" casava com o ícone do WhatsApp, o `blank.gif`
e a foto do produto 908.

- **Tamanho pode estar no NOME**, não no caminho: `1180_1_H`, `_X`, `_S`, `_L` são a mesma
  foto. Sem tratar isso, três fotos viravam dez.
- **Teto de 10 por galeria**, para a plataforma sem regra própria. Passando disso o
  diretório não é do produto, é balde da loja inteira. Descarta-se a galeria inteira, e não
  se apara a lista: não há como saber quais eram do produto. Fica só o que veio estruturado.
- **Na Tray o filtro é o id do produto no nome do arquivo**, não o diretório: o CDN serve
  o catálogo inteiro de `/img/img_prod/<loja>/`, e ali o diretório não separa nada.

**Catálogo público da plataforma:**

Algumas plataformas publicam a lista de produtos em JSON, sem credencial — a Tray em
`/web_api/products`, a Shopify em `/products.json`. O registro em
`src/lib/coleta/plataformas.js` guarda o endereço de cada uma; a leitura mora em
`src/lib/coleta/catalogo.js` e passa por `buscarPagina`, então robots.txt e ritmo valem
igual — catálogo público não é licença para atropelar o servidor.

- **Ele encurta a descoberta, não a leitura.** Na Tray o catálogo dá o total exato (2296
  contra o "500+" do sitemap) e a lista de imagens, mas **não traz a referência da loja**
  (`Ref: 21A502`) nem o preço à vista. Como o código é a chave de acesso ao produto do
  concorrente, a página continua sendo aberta uma a uma.
- **Só imagens e NCM vêm do catálogo.** Preço, nome e código não: o `promotional_price`
  da Tray vem `0` num produto que anuncia desconto à vista, e a referência não existe ali.
  Deixar o catálogo vencer nesses campos apagaria dado bom com dado ausente.
- **A LISTAGEM da Tray trunca em 4 imagens por produto.** Medido: todo item de
  `/web_api/products?limit=50` vem com exatamente 4; `/web_api/products/{id}` do mesmo
  produto traz 9.
- **Fonte declarada ≠ fonte completa.** O catálogo **soma** às imagens da página, nunca
  substitui. Substituir custou cinco fotos por produto: a lista era autoritativa sobre
  *de quem* é a foto, e ainda assim era uma amostra. Trocar uma fonte por outra só se
  justifica depois de medir que a nova cobre tudo que a antiga cobria — somar é o padrão
  seguro, porque a deduplicação já cuida da sobreposição.
- **Não afirme sobre o site o que não foi medido.** O sitemap só é consultado quando o
  catálogo não completa a cota, e o passo "Sitemap identificado" só aparece quando a
  consulta aconteceu — dizer "não publicado" sem ter olhado é inventar um fato.

**O preço à vista pode não estar na página:**

Na Tray o bloco "Formas de Pagamento" é montado por AJAX. A Smartkits anuncia
*"à vista R$ 52,15 — Desconto de 5 %"* e a string `52,15` **não existe uma vez sequer** no
HTML entregue: o que vem é o preço de tabela, 54,90. Sem abrir
`/mvc/store/product/payment_options?loja=<idLoja>&IdProd=<id>&preco=<preco>`, o desconto do
pix não é coletado e a comparação usa um preço que ninguém paga. Leitura em
`src/lib/coleta/pagamento.js`; o endereço é dado, no registro da plataforma.

- **Fora do `Disallow`.** O robots.txt da Tray barra o endpoint **antigo**
  (`/loja/pag_parcelado.php`) e os de carrinho — não este. Responde **ISO-8859-1**, então
  tem que passar por `buscarPagina`.
- **UMA requisição por FONTE, não por produto.** O ritmo é de uma visita a cada 2 s por
  domínio, então perguntar item a item **dobrava** a colheita: numa fonte de 20 produtos,
  40 s viravam 80 s. O desconto à vista não é do produto — é da **loja**: 5% em todos os
  produtos medidos na Smartkits e na Casa da Robótica. A regra é aprendida no primeiro item
  e aplicada ao resto (`novaMemoriaDePagamento`, uma por colheita — nunca global, senão uma
  loja responde pela outra).
- **O arredondamento do centavo NÃO é igual em toda loja Tray.** A Smartkits **trunca**
  (8,90 −5% = 8,455 e ela cobra 8,45); a Casa da Robótica **arredonda** (4,89 −5% = 4,6455
  e ela cobra 4,65). Supor um dos dois erra o outro em um centavo.
- **Só adota a regra quando a amostra DISCRIMINA os dois modos.** Conferir que a regra
  reproduz o valor lido não basta, e isso já custou um centavo errado: o primeiro produto
  da Casa da Robótica (12,99 −5% = 12,3405) dá 12,34 truncando **ou** arredondando, então
  não prova nada — e a regra escolhida ali errou o produto seguinte. Enquanto os dois modos
  explicarem todas as amostras, continua perguntando. Na prática: Smartkits resolve em 1
  leitura, Casa da Robótica em 2.
- **A conta é em centavos inteiros.** Em ponto flutuante, 59,90 × 0,95 vira
  56,90499999999999 e o meio-centavo some — fazendo os dois modos parecerem iguais
  justamente na amostra que os separaria.
- Modo nenhum explicando as amostras, ou percentual mudando entre produtos: `semRegra`, e a
  fonte pergunta produto a produto até o fim. Preço errado de concorrente é pior que coleta
  lenta.
- `percentual: 0` é resposta legítima: loja sem desconto à vista. Guardar isso evita 19
  requisições que devolveriam sempre o preço de tabela.
- **A origem diz se foi lido ou calculado.** `origens.precoPromocional` sai como *"formas
  de pagamento — desconto de 5%"* no primeiro e *"calculado: desconto de 5% da loja,
  conferido em N leitura(s)"* nos demais. Sem isso, não haveria como saber em qual dos
  dois casos um produto caiu.
- **Só uma parcela conta**, a mesma regra do `priceSellDetails`. E o valor sai do `<b>`,
  não de qualquer `R$` da linha: o cartão escreve *"Parcela Mínima de `<strong>`R$
  30,00"* na mesma `<tr>`, e um leitor guloso gravaria 30,00 como preço do produto.

**Códigos, imagens e charset:**

- **O código é o ponto de acesso ao produto do concorrente.** Campo com mais de um código
  vira mais de um produto: a Casa da Robótica publica `reference="AF01 ou AF02"`, e um
  registro com os dois dentro não é achado por nenhum dos dois. Separa em disjunção
  explícita (`ou`, vírgula, ponto-e-vírgula) — **nunca em hífen, ponto ou barra**, que
  fazem parte de códigos inteiros (`F30-004`, `HK-502`, `5V/3A`).
- **Na Tray, o `sku` do JSON-LD é o id INTERNO, não o código da loja.** Medido em três
  lojas: onde o JSON-LD publica `sku`, ele é sempre igual ao `idProduct` do `dataLayer`
  (Smartkits 1079, Arduino Brasil Shop 1001), e o código que a página mostra ao cliente —
  **`REF: SK1244`** — é o `reference`. A Casa da Robótica não publica `sku` nenhum, e por
  isso já vinha certa. O desvio em `normalizar.js` só vale quando está **provado** que os
  dois são o mesmo número: loja que um dia publicar `sku` próprio continua vencendo pela
  ordem normal.
- **Sem código na página, o produto entra como `N/A`** — decidido pelo dono, e é a única
  exceção à regra de nunca inventar valor. Por isso `origens.code` sempre registra que a
  marcação foi nossa. Constante `SEM_CODIGO` em `normalizar.js`.
- **A Tray usa três convenções de nome de arquivo na mesma loja:** `73_5_<data>` (id abre),
  `71_variacao_3_0_<data>` (id abre, foto de variação) e
  `modulo_..._ky_019_73_1_<hash>` (id depois do slug). O padrão aceita o id no início ou
  entre sublinhados seguido de número — a segunda forma exige o dígito porque um hash
  como `..._5227_1_71ff6f9c...` seria confundido com o produto 71.
- **Charset não é sempre UTF-8.** A Casa da Robótica serve `charset=ISO-8859-1`, e
  decodificar tudo como UTF-8 gravava "M�dulo Rel�" **no banco**, não só na tela. O
  charset vem do cabeçalho e, na falta dele, do `<meta charset>` — lido numa prévia em
  latin1, onde todo byte é válido e a declaração, sendo ASCII, sobrevive intacta.

### Fornecedores: importação de arquivo

Fornecedor não tem vitrine para varrer — a Fortek/Benser é um **portal B2B atrás de
login**, a Santana Import só mostra preço a cliente cadastrado. O caminho é o operador
trazer o arquivo (Ctrl+S na página, ou o catálogo baixado). **Nenhuma credencial passa
pelo sistema**, e pedir a senha do dono foi recusado de propósito.

Leitura em `src/lib/coleta/arquivos.js`. O produto sai no **mesmo formato da coleta** —
muitos leitores, uma forma só, senão a tela passaria a precisar saber de onde veio a linha.

**Os três formatos, medidos em arquivos reais:**

| Arquivo | Formato | Produtos | Onde o dado estava |
| --- | --- | --- | --- |
| Benser (10,8 MB) | HTML | 1592 | array JSON num `<script>`, com 1592 fotos em base64 |
| Santana (3,7 MB) | PDF | 989 | texto tabulado; `getTable()` volta **vazio** em 65 de 69 páginas |
| Nightech (16 MB) | XLSX | 457 | cabeçalho na **linha 6**; 459 imagens **ancoradas**, fora das células |

- **PDF: ancore no código no início da linha.** O catálogo da Santana tem 9465 linhas e
  só 989 são produto — sem âncora entram título de seção e texto de garantia.
- **XLSX: procure o cabeçalho, não assuma a linha 1.** Planilha de fornecedor começa com
  logo e total. E **casar coluna por PREFIXO**: a Nightech escreve `PREVISÃO 20/09` e
  `VALOR UNIT. (R$)`, com data e moeda coladas no nome.
- **Coluna que parece estoque e não é.** `QUANTIDADE DO PEDIDO` é o pedido do comprador —
  lê-la como saldo mostraria zero num produto com 4618 em estoque. Lista `CAMPOS.ignorar`.
- **Imagem no Excel flutua sobre a folha**, ancorada a uma posição. O caminho é
  âncora → linha → código → foto, com o binário em `workbook.model.media[imageId]`.

**Pronta entrega e reserva:**

- `stock.quantity` é **sempre** a pronta entrega; `stock.aChegar` é o que está comprado e
  em trânsito. **Nunca somados** — um número só prometeria entrega que não existe.
- `prices.normal` é o de pronta entrega (decisão do dono); `prices.reserva` é o do que vai
  chegar. Medido na Fortek: `65-276` custa **79,90 na reserva e 82,90 na pronta entrega** —
  num campo só essa inversão sumiria.
- **Dois arquivos** (Fortek) ou **duas colunas** (Nightech). O arquivo diz qual lista é pelo
  `<title>`: *Benser · Lista de Reserva* contra *Benser · Portal de Pedidos*. O título veio
  do fornecedor; o nome do arquivo o operador renomeia. Na dúvida, pronta entrega.

**Regras por fornecedor** — `src/lib/coleta/fornecedores.js`, dado e não código:

- **Fortek — `sufixoDeCarga`.** `02-268-A` é o mesmo item que `02-268`; o sufixo é a carga.
  Confirmado pelo dono em 31/08/2026. Junta 153 pares a mais (1911 contra 2064). **Vale só
  para ela**: noutro catálogo `-2` pode ser voltagem ou versão, e juntar apagaria produto.
- **Nightech — `mesclarSiteComArquivo`.** O site tem foto, texto de venda e endereço; a
  planilha tem preço e saldo. Mesmo código = um produto.

A mesclagem em si mora em `src/lib/coleta/mesclar.js`, **sem imports**, usada pelo servidor
(duas listas) e pela tela (site + arquivo). Duplicá-la faria as duas divergirem em silêncio.

- **Quem chega primeiro vence**, e quem chama decide a ordem: pronta entrega antes da
  reserva; site antes da planilha.
- **Descrição: vence a mais longa**, não a primeira.
- **Fotos somam, a nova por último.** Site primeiro (resolução de venda), planilha depois
  (miniatura de conferência). A primeira é a que vira miniatura na tela.
- **`aChegar` SOMA** quando o mesmo produto vem em duas cargas. Manter só a primeira
  descartava a segunda em silêncio — 13 casos com `65-361` e `65-361-2` na mesma lista.

**A prévia mostra 3 produtos, o arquivo tem centenas.** Por isso a ação devolve também um
`porCodigo` — índice do arquivo inteiro, **sem imagem e sem descrição** (são os campos
pesados). Sem ele a mesclagem tentava casar 3 sorteados com 3 do site e quase nunca
acertava, o que fazia a regra *parecer* quebrada.

**O total da fonte é um TETO.** Site + arquivo − códigos conferidos nos dois. O teste abre
três páginas, então só três casamentos são confirmados; os outros produtos do site podem
estar no arquivo também. O passo na tela diz quantos foram conferidos, em vez de fingir
precisão.

**Impostos** — `src/lib/coleta/impostos.js`. Distribuidor cobra por fora: a Benser escreve
*"Preço unit. sem IPI"*. `prices.comImpostos` guarda o valor somado, e `taxes` diz quais
entraram. **Só rótulo conhecido** (IPI, ICMS, ICMS ST, FCP, PIS, COFINS) e alíquota entre 0
e 100 — varrer atrás de qualquer `%` traria desconto e garantia para dentro do custo. O
imposto sai das especificações: ele tem campo próprio, e repetir diria a mesma coisa duas
vezes.

**O arquivo entra pela tela, não pela linha de comando** — feito em 01/09/2026. O
fornecedor manda a lista por e-mail ou WhatsApp; o operador anexa na linha da fonte, em
`ArquivosDaFonte.jsx`, e "Atualizar dados" reprocessa **o último arquivo de cada tipo**.

- Os originais vão para `dados/coleta/<domínio>/arquivos/` (`guardarArquivosOriginais`);
  quais são e quando chegaram, para `FonteColeta.listaArquivos` e `listaEnviadaEm`. Fora do
  git e fora de `public/`, igual às fotos de produto.
- **O nome do arquivo vem do navegador e é dado de terceiro.** Passa por
  `path.basename` e `replace(/[^\w.\- ]/g, "_")` antes de virar caminho: `../../.env` é um
  nome de arquivo perfeitamente válido para quem envia, e sem isso seria um destino de
  escrita perfeitamente válido para nós.
- **Teto de 24 MB, conferido nos dois lados.** No cliente para dar recado, no
  `next.config.mjs` porque acima disso o 413 vem **antes** do nosso código — a planilha da
  Nightech tem 16 MB.
- Reprocessar é `reprocessarArquivos`, o mesmo caminho da leitura de arquivo: a tela não
  ganhou um segundo extrator.

**Conciliação: o que some da lista não é apagado** — `src/lib/coleta/conciliar.js`, sem
imports, testado em `npm run teste:extracao`. Combinado com o dono em 01/09/2026:

- Novo entra; conhecido atualiza; **ausente fica, com o saldo a `null`**.
- **Ausente não é zero, e a distinção é o ponto todo.** "Esgotou" é afirmação do
  fornecedor; "não veio na lista" é observação nossa. Gravar `0` poria na boca dele um
  número que ele não disse — contra a regra que vale no resto do sistema. O motivo fica em
  `ausente.desde/motivo` e em `origens.quantidade`, para a tela dizer qual dos dois casos é.
- Apagar jogaria fora código, descrição, fotos e NCM — caros de obter — por causa de uma
  linha que não veio, e o item costuma voltar na semana seguinte.

**A trava de queda: uma lista pela metade é recusada inteira.** `quedaSuspeita`, teto de
50%. Não é hipótese: um upload parcial da Fortek chegou com 512 produtos contra 1.911
guardados, e teria marcado **73% do catálogo como ausente sem um erro na tela**. Foi
recusado, e os 1.911 ficaram intactos.

- A causa concreta é a Fortek mandar **duas** listas — pronta entrega e reserva. Enviar só
  uma marca como ausente todo produto que só existe na outra. Vale igual para exportação
  truncada ou da aba errada.
- **Só compara arquivo com arquivo.** A colheita do site traz 20 produtos e o arquivo traz
  1.900: comparar os dois acusaria queda em toda troca de caminho, e o aviso viraria ruído
  que se aprende a ignorar.

**Ainda em aberto:** a unidade de venda — a Santana publica *Múltiplo de venda: 100*, e
preço por embalagem comparado com varejo engana.

**Fornecedores com conta, ainda não ligados** — `FORNECEDORES.md`, na raiz. São 32 contas
que o dono já tem, registradas a partir de 01/09/2026.

**Nomes não entram no código.** Uma primeira versão colocou a lista dentro de
`src/lib/coleta/fornecedores.js` e o dono recusou em 01/09/2026: o arquivo de regras é
lido pelo `regrasDoFornecedor` a cada coleta, e uma lista de intenção ali passa a parecer
configuração ativa — alguém acabaria iterando sobre ela. O `.md` na raiz não tem `export`,
ninguém o importa, e ele volta à conversa só quando o dono pedir um nome.

Ter a conta não é ter o fornecedor ligado: implementar um deles começa por descobrir como
o dado chega — vitrine pública, portal atrás de login ou arquivo exportado —, e só então
decidir entre coleta e importação. **Site só está anotado onde o dono deu** (hoje doze). A
**Solda Fria** é a mais adiantada — é a loja em que a plataforma OpenCart foi conferida em
`plataformas.js`, então só falta cadastrá-la como fonte.

Arquivos de origem em `C:/Users/pesso/Downloads/`.

### Sites que exigiram tratamento próprio

- **Santana (santanaimport.com.br): portal B2B, preço SÓ com login, varrido POR CATEGORIA** —
  implementado em 17/09/2026. Plataforma Add Suite, ASP.NET WebForms. Leitor em
  `src/lib/coleta/portal-addsuite.js`, regra (ritmo, itens por página) em `fornecedores.js`
  (`portal`), reconhecida **só pelo domínio** (`portalDoEndereco`): pelo nome, um concorrente
  "Santana Eletrônicos" viraria portal.
  - **Como o dono usa:** cadastra com o link de UMA categoria e o login. O teste entra e lê a
    primeira página (12 itens). Depois, em **Categorias** na linha da fonte, adiciona ou remove
    links e troca o login. A varredura lê só as categorias da lista.
  - **Onde mora:** `FonteColeta.categorias` (`[{url, total, lidos, varridaEm, adicionadaEm}]`) e
    `credencialCifrada` (`{usuario, senha}` com `lib/crypto.js`) + `credencialAtualizadaEm`,
    migration `20260917_fonte_portal_login`. **Não em `Conexao`**: lá é uma linha por serviço
    (enum único), e o login é de cada fornecedor. A tela só recebe `temLogin`.
  - **Sem login:** nome, código, foto, NCM, EAN, peso e dimensões; no preço, *"Faça o Login para
    visualizar o preço"*. Nenhum JSON-LD, Microdata ou OpenGraph com preço.
  - **Login sem captcha:** GET em `/minhaconta/identificacao`, POST com os campos ocultos
    (`__VIEWSTATE`...), `__EVENTTARGET=ctl00$ContentPlaceHolder1$lkEntrar`, `tblogin` e `tbSenha`.
    302 para `PainelCliente`; sessão = cookie `ASP.NET_SessionId`. Quem prova que entrou é o link
    `SAIR` (`PainelCliente` aparece também no anônimo). Por isso `obter` (`http.js`) ganhou
    `metodo`, `corpo`, `seguir: false` e `setCookie`: o cookie chega na resposta do POST.
  - **A lista da categoria dispensa a página do produto.** A página da categoria chama
    `/handlers/departamento/CategoriaResult.ashx?categoria=&subcategoria=&qtdePorPagina=&paginaAtual=&ordenacao=`,
    que devolve JSON com `html` e `total_registros`. Cada item traz link com `?sku=`, código
    (`data-sku`; esgotado só tem `Ref:`), preço, IPI %, ST em R$, preço com impostos, caixa
    inner/master, faixas de quantidade, múltiplo de venda (`adicionarMaisVitrini('sku', 5)`) e botão
    de comprar. Sem quantidade em estoque, e sem marca (só na página do produto).
  - **Link → parâmetros:** último trecho = `subcategoria`, penúltimo = `categoria`; um trecho só é
    a `categoria`. Categoria termina em **`.html`**, produto em **`.htm`**: aceitar os dois
    cadastraria página de produto como categoria (o teste pegou).
  - **A paginação repete e pula produtos.** Empates na ordenação: na Componentes (7.068), a página
    40 de 100 veio inteira com itens das 34 e 35. A leitura nunca para na página repetida, vai até
    `ceil(total/porPagina)` e repassa nas ordenações 0, 1 e 2 enquanto a categoria não fechar o total.
  - **Peso:** cada item traz foto em base64 (~150 KB); descartada antes de ler.
  - **Compra em lote e múltiplo de venda NÃO são característica** (o dono, 17/09/2026, repetindo).
    Campos próprios em `ProdutoColetado` — `precosPorQuantidade` (`[{rotulo, minimo, maximo, preco}]`)
    e `multiploVenda` —, migration `20260917_compra_em_lote`, e caixas próprias ao lado de Pronta
    entrega (`RegrasDeCompra.jsx`, na prévia e no detalhe). Vale também para o múltiplo das
    planilhas (`arquivos.js`). Na assinatura, os dois só entram quando existem (`undefined`), senão
    a primeira varredura depois deles reescreveria todas as fontes; no banco, ausência grava null.
  - **Marca e EAN não vêm na lista** (só na página do produto, 1,5 MB cada). O dono decidiu NÃO abrir
    a página na varredura: o leitor grava em `origens.brand/ean` o aviso *"nao vem na lista: veja no
    link do produto"*, e a tela o mostra sob o campo vazio. Só este leitor grava o aviso — vale só
    para a Santana.
  - **Status:** o leitor grava `IN_STOCK`; a prévia só conhecia `AVAILABLE` e mostrava
    "Indeterminado". Acrescentado ao mapa da `PreviaProduto`.
  - **BLOQUEIO medido:** a 2 s entre pedidos, ~150 pedidos no dia (listas de 1,5 a 15 MB), a Santana
    passou a cortar a conexão (`ECONNRESET`) **só para o user-agent do sistema**. Voltou em menos
    de 1 h. **Não se troca o user-agent para contornar.** Ritmo agora **30 s**, 50 itens por página;
    `ECONNRESET` encerra a varredura com recado. A 30 s, 500 produtos levaram 6,8 min, sem bloqueio.
  - **Sem retomada:** paginação que repete não permite pular página já lida. A queda recomeça, mas
    os lotes (uma página por lote) ficam gravados.
  - **Sem `?sku=` a página do produto mostra o padrão do modelo** (R$ 0,00, "indisponível") — só
    importa para quem abrir produto avulso; a coleta não abre.
  - **Termos de uso:** site para clientes com login; proíbem reproduzir conteúdo "para fins
    comerciais", sem falar de acesso automatizado. Uso decidido pelo dono.
  - **Scripts de investigação** (`scripts/teste-login-santana.js`, `teste-categoria-santana.js`)
    leem `SANTANA_USUARIO`/`SANTANA_SENHA` do `.env`. A coleta de verdade usa o login cifrado da
    fonte; as linhas do `.env` podem sair quando os scripts não forem mais usados.

- **Eletru's (eletruscomp.com.br): plataforma própria em ASP.NET MVC** (IIS,
  `x-aspnetmvc-version`), mapeada em 16/09/2026 como `aspnet-uploads` em `plataformas.js`.
  - **Formatos:** não tem JSON-LD. O Microdata traz só nome, preço e imagem, com `sku` **vazio**.
  - **Onde estão os dados:** `daVitrineAspNet` (`normalizar.js`) lê o painel e as abas.
    - `Ref:` é a referência do fabricante e vira MPN e modelo. Descartada quando é só o nome
      cortado em 30 letras ("LAMPADA VAPOR SODIO 250 W E-40"): começa como o nome ou tem 3+
      palavras.
    - `Cód: 53.00.1463` é o código.
    - `itemprop="brand"`, quando há.
    - Categoria: o último degrau do `loja__breadcrumb` antes do produto.
    - Preço: `itemprop="price"`, e o à vista escrito "Ou R$ 304,00 à vista ( - 5% )".
    - Estoque: botão `comprar-btn`; `avise-btn` é sem estoque, e aí não há preço (concorrente
      sem preço é descartado).
    - Descrição e ficha nas abas `#abaNNNN`; ficha em "Nome: valor".
  - **A home virava produto:** os cards da vitrine repetem `itemtype=Product`. Com
    `ehListagemAspNet`, página com cards e sem o painel de detalhe não rende produto.
  - **Aba recortada pelo `</div>` que a equilibra** (`conteudoDoDiv`). Cortar em "próxima aba
    ou relacionados" levava a última aba até o rodapé, e o formulário "avise-me", o telefone
    e o CNPJ viravam 30 especificações.
  - **Fotos:** a galeria usa **duas pastas**, `_uploads/ProdutoDestaque/` (a principal) e
    `_uploads/produtoArquivo/` (as demais). O borne PT 2,5 tem 1 + 5, e só a principal vinha.
    Só a versão `orig`, nomeada `__orig` ou `_orig`. O Microdata de imagem trazia "Passe o mouse
    para dar zoom" como endereço.
  - **"Catálogos" do menu virava documento de todo produto** (`/catalogos`, página
    institucional). Em `documentosDaPagina`, link reconhecido **só pelo texto** (sem extensão
    nem endpoint de anexo) que aponta para página de primeiro nível e tem até 2 palavras é
    seção do site, e não documento. Conferido nas outras 6 concorrentes: nenhum documento real
    se perdeu.
  - **Sitemap plano:** 249 categorias (`/produtos/...`) **antes** de 1.825 produtos (`/{slug}/p`).
    `colher.js` ordena o sitemap em produto (`pareceProduto`, que agora reconhece `/{slug}/p`),
    resto e listagem (`pareceListagem`). Sem isso a amostra do teste abria só categoria.

- **Mamute Eletrônica (Magento 2): o preço à vista não está no HTML** (16/09/2026). A página
  mostra "R$ 46,46 — 5% OFF no PIX", mas o servidor só entrega R$ 48,90. O resto é calculado
  no navegador a partir do módulo de parcelamento, num `text/x-magento-init` com
  `"installment": {"discounts": {"name": "PIX, Transferência ou Depósito", "percentage": "5"}}`.
  `aVistaDoMagento` refaz a conta em centavos, arredondando meio para cima
  (48,90 × 0,95 = 46,455 → 46,46). Só vale desconto de pagamento à vista (pix, boleto,
  transferência, depósito).
  - **A base é o preço de CARTÃO** (`product:price:amount` / `finalPrice`), nunca o JSON-LD. Na
    Saravati o JSON-LD já é o preço do pix, e aplicar os 10% de novo dava 12,07 onde a loja
    cobra 13,41. A primeira versão errou assim, e a comparação com os produtos já gravados
    pegou.
- **Mamute: ficha técnica em lista HTML, com tabela de atributos de UMA linha.** A regra era
  "tabela OU lista da descrição". A tabela (`Fabricante: IMP`) calava a lista, e a lista por
  texto também não serviria: a descrição do JSON-LD vem numa linha só, sem quebras.
  `especificacoesDeListaHtml` lê o `<ul>` colado a um título "Especificações Técnicas" /
  "Ficha técnica" (`<li><strong>Nome:</strong> valor`), e `juntarFichas` soma com a tabela sem
  repetir rótulo. Nas outras 6 concorrentes a contagem de especificações não mudou.
- **Mamute: a descrição chegava num bloco só.** O JSON-LD dela vem numa linha ("...
  Especificações Técnicas Modelo: CJMCU-219 Interface de comunicação: I2C ..."), e pela regra
  da mais longa vencia o bloco HTML da página por poucos caracteres. Duas mudanças:
  - `melhorDescricao` compara o tamanho **sem espaços nem marcadores**. Entre as que trazem
    ao menos 85% do texto da mais longa, vence a que tem **mais linhas**. Resumo de SEO continua
    perdendo.
  - `descricaoDoBloco` mantém a estrutura: título ganha linha em branco antes, `<li>` vira
    `- item`, e os itens ficam colados.

  Nas outras 6 concorrentes o conteúdo ficou idêntico (conferido sem espaços e marcadores),
  e só a disposição melhorou: a Casa da Robótica perdeu as linhas em branco entre itens, e a
  Smartkits ganhou hífen nas listas.
- **Mamute: a categoria do dataLayer vem errada da própria loja** (kit de fusíveis em
  "Espaguetes Termo Retráteis"). O breadcrumb é montado por JavaScript, e não há outra fonte
  na página. Não se corrige: é dado deles.

- **Makerhero: Cloudflare.** Desafio anti-bot em qualquer combinação de cabeçalho,
  inclusive nenhum. **Não se contorna** — o `buscar.js` diz por escrito que user-agent
  disfarçado de navegador é o oposto de educado. A mensagem na tela nomeia a proteção em
  vez de dizer `HTTP 403` seco, senão parece erro de digitação.
- **Santana Import: lenta e irregular.** 1,5 MB de home variando de 0,4s a 26s no mesmo
  minuto. O teto era fixo em 20s e cortava no meio; virou `COLETA_TIMEOUT_MS`.
- **Wix (Nightech): `ImageObject` com `contentUrl`.** O JSON-LD publica cada foto como
  objeto completo, e ler só `url` trazia 1 de 6. As duas chaves são válidas no schema.org.
- **Código na URL, confirmado pelo nome.** A Santana publica `018-0071` no endereço e no
  título, e em nenhum formato estruturado. Exigir que apareça nos **dois** transforma o
  palpite em conferência — slug tem número de tudo quanto é tipo.
- **EAN na ficha técnica.** Rótulo em português (`Cód. Barras`), ancorado nas pontas para
  deixar `EAN Caixa Mãe` de fora: aquele é o código do fardo, não da peça.
- **Preço é opcional para `FORNECEDOR`.** Atacadista publica catálogo aberto e preço só a
  cliente cadastrado; exigir preço jogaria fora um catálogo inteiro de dados úteis. Para
  `CONCORRENTE` a exigência continua.

**robots.txt e educação:**

- Vários `User-agent:` seguidos formam **um** grupo. Tratando cada linha como grupo novo,
  um arquivo com dezessete agentes era julgado pelo último e as regras eram ignoradas.
- **`?` na regra é caractere, não curinga.** Ficou fora do escape em `caminhoCasa` e
  `Disallow: /*?*` virava `/.*?.*`, que casa com tudo: a Saravati (Magento 2) apareceu
  **inteira** bloqueada, home inclusive, quando só barra endereço com parâmetro. Em
  15/09/2026. Regra é convertida em regex — todo metacaractere que não seja `*` e `$`
  final precisa de escape.
- **`Crawl-delay` é respeitado** (impactocnc pede 10s). Isso faz o teste levar minutos —
  a tela avisa.
- Ritmo próprio: 1 requisição a cada 2s por domínio, via `limitar()` de `httpClient.js`.
  O scraper **não** usa `requisitar()`, que gravaria `LogIntegracao` com um enum `Servico`
  inexistente.

**Sitemap:**

- **Sitemap tem teto de 50 MB** (`MAXIMO_BYTES_SITEMAP` em `buscar.js`, o máximo do
  protocolo), e não os 2 MB de página. A Mamute Eletrônica (Magento) publica dois arquivos de
  **10 MB** cada, com 18 mil produtos. Com o teto de página eles eram recusados (o erro não vai
  ao log), só o terceiro (0,7 MB, 492 endereços) era lido, e a colheita caía na navegação.
  No Magento a navegação **não pagina categoria**, porque `?p=` está em `PARAMETROS_RUINS`:
  só acha produto pela primeira página de cada categoria e pelos relacionados. Em 17/09/2026
  a varredura estava havia **4 h sem produto novo**, com 14.331 páginas abertas. O worker não
  a cancelava porque o site respondia, e a tela mostrava 10,7 s/produto e "falta 18h44".
  Com o teto novo, o sitemap entrega 18.951 endereços.
- **Só entram endereços da loja** (mesmo host, com ou sem `www.`). O robots.txt da Mamute
  declara também o sitemap do blog, e 68 posts iam para a fila de produtos.
- **O "10.000" de "produtos no site" da Mamute não foi provado por varredura.** É o número do
  cadastro, e a primeira varredura completa o substitui.

- O índice pode listar a home como se fosse sitemap, e o de produtos pode não ser o
  primeiro. Priorizar quem tem cara de produto — mas **o padrão não pode conter "item"**:
  a palavra "s**item**ap" casa, todos os filhos furam a fila e a ordem se inverte.
- Sitemap declarado no robots.txt nem sempre lista produtos (a Usinainfo declara um de
  rotas de busca). Quando ele não entrega, a descoberta é por **navegação**, priorizando
  URLs com cara de produto (`.html`, id numérico no fim) — em largura pura o orçamento
  acaba nas categorias.
- **ENDEREÇO NÃO É PRODUTO, e confundir os dois já enganou o dono.** O passo contava as
  linhas do sitemap e as chamava de "produto": a Usinainfo aparecia com *"12 produto(s) no
  sitemap"*, e o número ia para **"Catálogo da loja"** e ficava **gravado na fonte** — como
  se a loja inteira tivesse doze itens. `usbuscaroute-sitemap.xml` é o único sitemap dela
  (todos os outros caminhos dão 404) e traz 12 rotas de `/busca/...`.
- **A coleta nunca esteve limitada** — o defeito era só de relatório. Medido: com limite
  20, a Usinainfo entrega **20 produtos em 78 s**, abrindo 35 páginas, com 20 códigos
  distintos. A navegação compensa o sitemap inútil por inteiro.
- **Filtrar por "cara de produto" não resolveria.** Das 12 rotas, onze não têm cara de
  produto e a décima segunda tem **por acidente**: `baterias-18650` casa com o padrão de id
  numérico, e 18650 é o modelo da bateria.
- Hoje o passo diz **"N endereço(s) no sitemap"**, que é o que foi contado, e o total só
  vira "produtos da loja" depois de **provado** que aquele sitemap lista produto — ou seja,
  quando pelo menos um endereço dele virou produto de verdade. Sem prova, `null` e
  travessão na tela. E a frase distingue a origem: catálogo público da plataforma
  (`produtosNoSiteFonte: "catalogo"`, o caso dos 2.296 da Casa da Robótica, que vêm do
  `/web_api/products` e **não** do sitemap) ou sitemap.

---

## Armadilhas da stack

- **`prisma migrate dev` é interativo** e falha aqui. Use
  `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
  gravando em `prisma/migrations/<timestamp>_nome/migration.sql`, depois `migrate deploy`.
- **Ele nem sempre regenera o client.** Depois de migrar: `npx prisma generate` **e
  reiniciar o servidor** — o dev server mantém o client antigo em memória e a tela mostra
  "banco indisponível" com o Postgres saudável. **Esta armadilha já estava escrita aqui e
  ainda assim foi repetida** ao adicionar a coluna `instrucoes`: migration aplicada,
  `generate` rodado, servidor não reiniciado — e o campo não salvava. O sintoma não é erro
  de banco: o client em memória **não conhece a coluna**, então ela some do `update` em
  silêncio e a tela volta como se tivesse salvado. Ler a regra não basta; reiniciar faz
  parte do passo de migrar.
- **Renomear relação no schema deixa telas para trás, e o aviso genérico esconde isso por
  semanas.** `Produto.imagens` virou `arquivos` em 27/08/2026; as duas telas de Anúncios
  continuaram pedindo `imagens`, e a consulta falhava inteira. Como `AvisoBanco` dizia
  "não foi possível conversar com o banco de dados" para **qualquer** exceção — e mandava
  subir o Docker —, o dono passou a olhar o Postgres, que estava perfeito. Descoberto só em
  16/09, quando alguém abriu o bloco. O aviso agora separa os dois casos: conexão
  (`P1001`, `PrismaClientInitializationError`) fala do serviço `postgresql-x64-17`; o resto
  diz que o defeito é da consulta e mostra a mensagem do Prisma, que nomeia o campo.
- **Tela mostrando zero pode estar lendo a fonte errada, não contando errado.** A coluna
  "Coletados" exibia 0 com 1.911 produtos em disco: ela lia `_count.paginas` do Postgres,
  que está **vazio de propósito** enquanto a coleta grava em JSON. Trocar o rótulo teria
  escondido o defeito. Enquanto duas origens convivem, número na tela pede a pergunta
  "de onde este veio?" antes de "a conta está certa?".
- **Renomear tabela**: escreva a migration à mão com `ALTER TABLE ... RENAME`. O
  `migrate diff` gera `DROP` + `CREATE` e apaga os dados.
- **Erro de sintaxe envenena o cache do Turbopack, e o veneno sobrevive ao restart.** Um
  arquivo salvo por instantes com erro de parse — no caso, uma aspa a mais deixada por um
  `sed` em `mercados/page.jsx` — derrubou o manifesto de rotas da **subárvore inteira**:
  depois de corrigido o arquivo, `/mercados/fontes` continuou devolvendo **404** enquanto
  `/mercados` e `/integracoes` respondiam 200. O arquivo da rota estava intacto, com
  `export default` no lugar, e **três reinícios do servidor não resolveram**. O que resolve
  é apagar o cache:

  ```bash
  rm -rf .next && npm run dev
  ```

  O sintoma engana: parece rota apagada ou site fora do ar, e não é nenhum dos dois — o
  layout renderiza normalmente em volta do 404. Antes de procurar no código, confira se a
  rota some só numa subárvore e se o arquivo dela foi mesmo alterado (`git status`).
- **Patch com `sed` em JSX cobra caro por isso.** Aspas dentro de atributo e de string
  fazem o comando escapar do que se pretendia, e o estrago não aparece no arquivo editado —
  aparece numa rota vizinha, minutos depois. Em JSX, prefira edição por trecho exato.
- **Abas precisam ficar montadas e apenas ocultas.** Campo desmontado não entra no
  `FormData` — salvar por uma aba invalidava os campos das outras.
- **Arquivo `"use server"` só exporta função assíncrona.** Uma constante exportada faz o
  Next recusar o módulo inteiro.
- **Limite de corpo de Server Action** é 1 MB por padrão; está em 24 MB no
  `next.config.mjs` por causa dos PDFs. Acima disso vem 413 **antes** do nosso código.
- **`next/image` lança exceção** quando o host não está em `images.remotePatterns` — uma URL
  externa inválida derruba a página. Use `<img>` para URL externa (ver `ehLocal`).
- **Tailwind v4**: `divide-x` usa `border-inline-end`, e o utilitário de translação escreve
  a propriedade `translate`, não `transform`.
- **`pdf-parse` precisa ficar FORA do bundle.** Ele usa o pdfjs, que carrega um worker em
  arquivo separado; empacotado pelo Turbopack o caminho se perde e a leitura morre com
  `Cannot find module .../pdf.worker.mjs` — funcionando fora do Next o tempo todo. Está em
  `serverExternalPackages` no `next.config.mjs`.
- **`exceljs` foi escolhido no lugar de `xlsx`**: o `xlsx` no npm está parado na 0.18.5 com
  vulnerabilidades sem correção, porque a SheetJS saiu do npm. O `exceljs` traz um aviso
  **moderado** transitivo (`uuid` < 11.1.1, GHSA-w5hq-g745-h8pq), cujo caminho vulnerável
  exige passar buffer próprio a `v3/v5/v6` — coisa que ler planilha não faz.
- **`String.replace` interpreta `$` na string de substituição.** `` $` `` insere tudo que
  vem ANTES do casamento: um patch com isso injetou 3120 caracteres no meio de
  `normalizar.js`. Em substituição gerada por script, use função `() => novo`.
- **Barra invertida some entre shell e JS.** Um `node -e` com `\d` gerou `d` no arquivo:
  código válido que não fazia nada, e o lint passou. Patch com regex vai por arquivo.
- **Não canalize teste com `| head`.** O SIGPIPE mata o processo antes da limpeza, deixa
  linhas no banco e envenena a execução seguinte. Redirecione para arquivo e leia depois.
- **React 19 barra `setState` dentro de efeito.** Para ler `localStorage`, use
  `useSyncExternalStore` (ver `src/lib/preferenciaMenu.js`); para reagir ao resultado de uma
  ação, trate dentro do próprio `useActionState`.

---

## Produtos: "Buscar por código" no cadastro novo

Pedido do dono em 16/09/2026. O botão fica ao lado de Salvar/Cancelar, **só em produto novo**
(num produto existente, sobrescrever o cadastro com um clique é arriscado demais). Procura por
**igualdade** de código, EAN ou MPN em `Produto` (Rise) e `ProdutoColetado` (fornecedores e
concorrentes), em `src/lib/buscaPorCodigo.js`.

- **Um resultado preenche direto; mais de um vira lista** com a origem. O mesmo código em
  fornecedor e concorrente traz nome e descrição diferentes, e quem escolhe é o operador.
  Em 16/09 nenhum código se repetia entre fontes, então **a lista nunca foi vista com dado
  real**.
- **Os campos são não controlados** (`defaultValue`). Preencher é remontar o corpo do
  formulário com `key={versao}`, partindo do `FormData` atual e sobrepondo só o que a busca
  trouxe **com valor**. Remontar só com o resultado apagava o que já estava digitado.
- **O preço de fornecedor ou concorrente não vai para "Preço venda"**: o primeiro é custo, e
  o segundo é o preço do concorrente. Aparece na lista só para comparar. De produto da Rise
  copia quase tudo, **menos a localização e o link da Loja Integrada**, que pertencem àquela
  peça.
- **O código do produto achado vai SEMPRE para o SKU**, inclusive por cima do que já estava no
  campo (pedido do dono em 16/09/2026; antes só entrava com o campo vazio e o código livre).
  Outro código, só pela varinha (25xxxx). Código repetido ou que não serve de nome de pasta
  é recusado no Salvar, com o motivo.
- **Marca e Modelo são sempre MAIÚSCULAS** (pedido do dono em 16/09/2026): a tela converte ao
  digitar (sem mover o cursor), ao escolher da lista e ao vir da busca por código; o
  `ProdutoSchema` converte de novo ao salvar, e a importação do Bling também. Os 5 produtos
  já importados foram convertidos no banco ("Genérica" virou "GENÉRICA").
- Marca igual ao nome da loja é descartada: a Casa da Robótica publica a si mesma em `brand`.
- **As imagens vêm junto**, pedido do dono em 16/09/2026. O produto novo ainda não tem pasta,
  então a tela mostra a **prévia** no lugar da imagem e a cópia acontece no **Salvar**
  (`anexarImagens` em `src/lib/imagensImportadas.js`, que a importação do Bling também usa).
  - **O formulário manda só a referência** (`importarImagensDe` = `rise:<id>` ou
    `coletado:<id>`), e os endereços são lidos de novo no servidor. Aceitar endereço vindo do
    navegador faria o servidor baixar o que alguém mandasse.
  - **Passa pelo `salvarArquivo`**, com as regras do envio manual (JPEG/PNG, 500 a 1920 px).
    O tipo é lido **pelos bytes**, porque CDN de loja devolve `octet-stream`. Foto recusada não
    desfaz o cadastro: a tela do produto criado mostra quantas vieram e quantas ficaram de fora
    (`?imagens=&recusadas=` na URL). Medido com o 06811 da Usinainfo: 4 copiadas e 1 recusada,
    a `large_default` de 397 px.

## Produtos: referências de mercado e texto por IA

Pedido do dono em 16/09/2026, como etapa de criação de anúncio. A **lupa ao lado do Nome** abre
uma **janela (pop-up)**, e não um painel no meio do formulário: o dono pediu a troca no mesmo
dia. A janela lista fornecedores e concorrentes **parecidos** com o Nome
(`src/lib/buscaPorPalavras.js`, lendo a mesma `produtosParaLista` da tela Mercados). O
operador marca referências e pede **título** ou **descrição** à IA (`src/lib/ia/anuncio.js`).

- **A busca é por relevância, não por "todas as palavras".** A primeira versão usava a
  `combina` do Mercados, e o título inteiro `PLACA COMPATIVEL ARDUINO UNO R3 CH340 COM CABO USB`
  **não achava nada**, com 37 produtos tendo "arduino uno": ninguém repete as nove palavras. A
  nota vai de 0 a 1 e é a fração do peso do título que aparece no produto. Entra quem tem pelo
  menos metade (com até 2 palavras, todas). A lista é ordenada pela nota, e a janela mostra a
  coluna "Parecido".
  - **Peso pela raridade** (log N/df), com bônus de 1,5× para palavra com dígito. Com peso
    igual, "SENSOR DE DISTÂNCIA ULTRASSÔNICO HC-SR04 5V" punha sensores ToF (sensor +
    distância + 5V) no nível do HC-SR04.
  - **Compara por palavra, não por trecho** (`casaPalavra` em `texto.js`). Por trecho, o "4" de
    "4 canais" casava com "RS485". Até 3 caracteres, a palavra precisa ser igual; mais longa
    pode ser o começo ("ch340" em "ch340g").
  - **Cada nome é indexado em várias formas** (`indiceDePalavras`): a palavra sem símbolo, os
    pedaços dela e os pares de pedaços vizinhos. É o que junta "HCSR04" com "HC-SR04" e "5V"
    com "5 V".
  - A **tela Mercados continua com `combina`** (todas as palavras): lá o operador filtra, e
    filtro não pode trazer linha que não tem o que se digitou.
- **A marcação NÃO é gravada**, por decisão do dono: serve só para gerar o texto. O Mercados
  continua sem vínculo com `Produto`.
- **A janela só busca e marca; os botões de IA ficam no formulário**, pedido do dono no mesmo
  dia. O título é **só o símbolo (✦) ao lado da lupa**, e só aparece com referências marcadas.
  **"Criar descrição"** fica no topo da **aba Descrição** e abre uma janela própria
  (`JanelaDescricao.jsx`): à esquerda, os produtos marcados **em abas lado a lado** (a cor do
  ponto diz fornecedor ou concorrente; ficha, descrição da loja e link); à direita, a criação
  com IA. Começou como seções empilhadas, e o dono redesenhou em abas. O texto gerado aparece **editável**, e só vai para
  o campo em "Usar esta descrição".
- **A descrição segue o padrão da loja**, que o dono definiu em 16/09/2026, em **texto puro**
  (é exportada para várias plataformas): TÍTULO EM MAIÚSCULAS · **2 parágrafos sucintos, SEM
  linha em branco entre eles** (o que é e o que diferencia; como usar e para quem; eram 2 ou 3
  separados até a revisão do dono no mesmo dia), **cada um com no máximo 4 linhas**
  (`LIMITE_PARAGRAFO` = 230 caracteres, medido nos ~57 por linha da caixa da janela). Parágrafo
  mais longo volta uma vez para a IA encurtar, com o texto recusado. Se ainda passar, ficam
  as frases inteiras que cabem (`frasesQueCabem`), nunca corte no meio da frase ·
  `Especificações técnicas:` (era "Características") com `- Nome: valor;` ·
  `Itens inclusos: (Cod:SKU)` com `- 01 ITEM;` · `Garantia:` com
  `- Garantia Legal de 90 dias (contra defeitos de fabricação);`.
  **As duas últimas linhas de "Especificações técnicas" são sempre `- Dimensões(CxLxA):
  68x53x10mm;` (sem espaço antes do parêntese nem em volta do "x") e `- Peso: 55g;`** (pedido do dono em 16/09/2026), escritas pelo código
  (`linhaDeDimensoes`/`linhaDePeso` em `medidas.js`) para serem **lidas de volta**
  (`medidasDaDescricao`). A IA devolve `pesoGramas` e `dimensoesMm` como números, e
  especificação de medida que ela puser na lista é descartada, para não aparecer duas vezes.
  **Medida já preenchida no formulário vence a da IA**: o texto não pode dizer uma coisa e o
  campo outra. Ao usar a descrição, e ao sair do campo Descrição (texto colado ou editado), as
  medidas lidas vão **só para os campos vazios**, e o aviso diz quais. Medida faltando some da
  letra do rótulo: `(CxA): 30,5 x 17mm`.
  **O campo Descrição é um só, em texto puro e alto (40rem)**: as abas "Escrever" e
  "Pré-visualizar" e o conversor de Markdown (`Markdown.jsx`) saíram, porque a prévia passou a
  mostrar o mesmo texto do campo.
  **Sem seção de documentos técnicos**: chegou a existir no mesmo dia, e o dono tirou. Texto puro
  não tem link clicável, e os arquivos só terão endereço público na VPS. A lista com link será
  feita na Loja Integrada, que aceita HTML, numa etapa própria.
  **A ordem e a pontuação são do código** (`montarDescricao`), não da IA: a IA devolve JSON
  (`paragrafos`, `caracteristicas`, `itensInclusos`), e o texto é montado aqui. O
  `textoPuro` tira `**`, `#`, crase e emoji que escapem da instrução, e só os 2 primeiros
  parágrafos entram. Pedir o texto
  pronto dava variação a cada chamada. O título e o código saem do Nome e do Código do
  formulário **na hora de gerar**, e a garantia é texto fixo (`GARANTIA_PADRAO`). O
  `;`/`.` que vier no fim de um valor é removido antes de pôr o `;`, para não sair dobrado.
  Medido em 16/09 com 3 referências de placa Uno: 14 s, 21 características.
- **O título vem em 3 opções para escolher** (`gerarTitulos`, `OPCOES_DE_TITULO`). Com um
  título só, o dono tinha que clicar de novo até sair um bom, e cada volta é uma chamada paga.
  Nada vai para o Nome até ele clicar numa opção. Opção acima de 60 caracteres ou repetida é
  descartada, e uma segunda chamada pede só as que faltaram, mostrando as recusadas.
  O pedido manda variar **o que ganha espaço** (CI, especificação, o que acompanha), não só a
  ordem: foi o que deu três opções realmente diferentes no teste do relé. Por isso a marcação
  (`marcados`) mora no `FormularioProduto`, e não na janela: os botões precisam dela com a janela
  fechada. As palavras enviadas à IA são as do Nome no momento do clique.
- **A marcação fica fora dos trechos com `key={versao}`.** Preencher o Nome remonta os campos,
  e ela sumiria junto. Por isso o formulário tem dois `Fragment` (`geral-` e `abas-`).
  O `BotaoIA` pode ser remontado no meio da geração porque o estado da chamada também é do
  formulário.
- **A função que lê o formulário vai em prop separada (`aoCriarIA`)**, não dentro do objeto
  `ia`. Um objeto que junta dados e uma função que lê `ref` faz o lint do React Compiler acusar
  "Cannot access ref value during render" no primeiro uso de `ia.quantos`.
- **Foto principal por rota própria**: `/api/mercados/miniatura/[id]`, com `<img loading="lazy">`.
  A miniatura da Nightech é base64 no banco (média de 50 KB, a maior com 1 MB), e 200 linhas
  com a foto embutida pesariam megabytes na resposta da busca. Foto de loja (http) vira
  redirecionamento; base64 vira bytes, **só JPEG/PNG/WebP/GIF**. SVG é XML com script e seria
  servido do nosso domínio.
- **Foto: mouse em cima amplia, clique mostra grande.** A prévia (260 px) usa posição
  `fixed` calculada da miniatura, porque a lista rola num contêiner com overflow que cortaria
  um `absolute`. O clique na foto **não marca a linha**. O Esc da foto grande é ouvido na
  captura da `window` e para ali; sem isso, o mesmo Esc fecharia também a janela de
  referências, que escuta no `document`.
- **Link aberto muda para "Aberto", em roxo**, por estado da tela (`abertos`), e não pelo
  `:visited` do navegador: o histórico guarda visitas de meses atrás e não diz o que foi
  conferido agora. O clique do meio é contado por `onAuxClick`.
- **Medido na primeira chamada real** (16/09, 3 referências de placa Uno):
  `PLACA UNO R3 CH340 COMPATÍVEL ARDUINO COM CABO USB`, com 50 caracteres, em 3,8 s e ~6,8 mil
  tokens de entrada. A descrição levou 17 s, com ~6,2 mil tokens de entrada e 1,2 mil de saída.
- **Padrão de título em `src/lib/ia/padraoTitulo.js`**: TIPO + FUNÇÃO + MODELO/CI +
  ESPECIFICAÇÃO + COMPATIBILIDADE, **em MAIÚSCULAS**. A ordem foi medida nos concorrentes
  (todos abrem pelo tipo da peça, com mediana de 41 a 57 caracteres). A caixa alta é decisão do
  dono e é o que o Bling já usa. O código força maiúsculas e **recusa acima de 60**, pedindo
  uma nova tentativa, em vez de cortar no meio da palavra.
- **O cliente manda só ids.** O conteúdo das referências é lido do banco no servidor, e o
  **nome da loja não entra no prompt**: o que não entra não vaza para o texto da Rise.
- **Modelo `claude-opus-5`** com `fallbacks: "default"` (beta
  `server-side-fallback-2026-07-01`), no máximo 20 referências.
- **`baseURL` fixo em `https://api.anthropic.com`.** O SDK lê `ANTHROPIC_BASE_URL` do ambiente,
  e nesta máquina essa variável existe (vem de outras ferramentas). Sem fixar, a chave da
  loja iria para outro servidor.
- **Precisa de `ANTHROPIC_API_KEY` no `.env`**, que o dono cria no console da Anthropic. Sem
  ela, os botões dizem isso na tela.
- **Auditoria:** `Servico` ganhou `ANTHROPIC` (migration `20260916_servico_anthropic`). Grava
  modelo, `stop_reason`, uso de tokens e erro, nunca o texto.

**Ícones dentro dos campos Código e Preço** — pedido do dono em 16/09/2026:

- **Código automático na faixa 25xxxx** (`gerarSku`): o **maior já usado mais um**, a partir de
  250001. Não reaproveita o buraco deixado por um produto excluído: anúncio antigo ou planilha
  apontariam para outra peça. Dois cadastros abertos ao mesmo tempo podem receber o mesmo número,
  e o SKU único recusa o segundo Salvar.
- **Preço das referências marcadas na lupa**: a lista separa **"Fornecedor · custo"** de
  concorrente (o preço do fornecedor é custo, e vender por ele é vender sem margem). Clicar
  preenche o campo, que continua editável.
- Os dois escrevem **direto no `<input>`** (campo não controlado) e marcam o formulário como
  alterado, sem remontar os campos.
- **Marca, Modelo e Número de homologação** usam o mesmo desenho (`CampoDeReferencias`). Cada
  valor aparece uma vez, com as lojas que o publicam.
- **Peso, Altura, Largura, Comprimento e NCM também vêm das referências** (16/09/2026). O NCM é
  a coluna própria, publicada por Fortek, Casa da Robótica e Smartkits; Eletrogate, Saravati e
  Usinainfo não publicam. Peso e medidas são lidos da ficha (`src/lib/medidas.js`, sem imports,
  testado no `teste:extracao`) e convertidos para kg e cm. Cada loja escreve de um jeito:
  `12,3g`; `Altura: 32mm`; `Dimensões (CxLxA): 54 x 30,5 x 17mm`, com a ordem no rótulo;
  `35mm (Altura) x 50mm (Largura)`, com a ordem no valor; e `31 x 15 x 18mm`, sem ordem, que
  vira C x L x A e fica marcado "ordem presumida". **Comprimento do cabo, largura do canal e
  dimensões da embalagem ficam de fora**: não são o corpo da peça. Peso com embalagem entra,
  com o rótulo à vista. Cada opção mostra o texto de onde saiu.
- **Medida é lida da ficha E do texto da descrição** (`medidasDoProdutoColetado`, que usa
  `linhasDeEspecificacao`). Tem loja que só escreve a medida no texto: a Usinainfo deixa
  `- Dimensões (CxLxE): ~54x29x5mm;` e `- Peso: 11g.` na descrição e a ficha sem medida
  nenhuma. Em 16/09/2026 a IA recebia esse texto solto e devolvia `null`, e a descrição saía
  sem Dimensões e Peso. **Correção:** `gerarDescricao` manda a lista "Peso e medidas já
  encontrados nas referências" já lida. Se a IA ainda assim devolver `null`, o código usa a
  medida da referência cujo nome mais se parece com o título (`reservaDasReferencias`), para
  não pegar a de outro produto marcado por engano. A ordem é: formulário > IA > reserva.
- **Ficha lida da lista na descrição parava num item em caixa alta** (`especificacoesDeLista`
  em `coleta/normalizar.js`). Linha curta toda maiúscula conta como título de seção, e
  `- RAM: 256KB;` também é toda maiúscula. A leitura parava ali, e tudo o que vinha depois
  (Dimensões e Peso, no EMW3080V2 da Usinainfo) sumia da aba Características. Agora caixa
  alta só vale como título **sem valor depois dos dois-pontos**. Em 16/09/2026 eram cerca de
  140 produtos cortados (99 da Usinainfo, 30 da Casa da Robótica, o resto espalhado). **Os
  dados gravados só se corrigem na próxima varredura.** O cadastro já não depende disso,
  porque lê a medida também do texto da descrição.
- **Campos de número recusam `e`, `E`, `+` e `-`** (`propsDeNumero`). O `<input type="number">`
  aceita essas teclas por causa da notação científica, e o dono achou `-e` na Garantia. Campo
  inteiro (`step="1"`) recusa também ponto e vírgula. Ao testar com ferramenta de navegador,
  saiba que o ponto e a vírgula chegam como tecla vazia (`key: ""`): o `005` no lugar de `0.05`
  vem da ferramenta, não do bloqueio.
- **Cor dos ícones = uso, e não disponibilidade** (pedido do dono em 16/09/2026, revisto no
  mesmo dia): **azul enquanto não usado, verde depois** (`usos` no `FormularioProduto`, com
  `COR_DE_USO` e `BORDA_DE_USO`). Lupa (verde quando há referências marcadas), ✦ título,
  varinha do código e $ preço sempre aparecem. **Ícone de lista (marca, modelo, homologação,
  peso, medidas, NCM) some quando as referências não trazem aquele dado.** Antes foi cinza e
  sem dado, e chegou a ser vermelho quando não usado; o dono pediu azul. "Usado" é escolher um
  valor pelo ícone, e digitar à mão não conta. **Sem aviso azul de "campos preenchidos"**: o
  dono tirou, e a cor verde cumpre o papel.
- **Contador no canto do ícone** (`Contador`), pedido do dono em 16/09/2026. No $ preço e nos
  ícones de lista, mostra quantos valores **distintos** há para escolher, e por isso pode ser
  menor que o número de marcados (a marca da loja é descartada, e valores iguais se juntam). Na
  lupa, mostra quantos produtos estão marcados. A cor acompanha o ícone: azul enquanto não
  usado, verde depois.
- **Lista de um ícone abre sempre dentro da tela** (`ListaFlutuante`). Aberta sempre para baixo
  e alinhada à direita, a do Peso (campo no pé da página e na primeira coluna) saía pela borda
  de baixo e ficava atrás do menu lateral. Agora a posição é decidida em `useLayoutEffect`,
  antes da pintura: abre **acima** quando não cabe embaixo e há espaço em cima, e alinha **à
  esquerda** quando invadiria o `<main>`. O estilo é escrito direto no elemento, sem estado,
  para não haver segunda renderização nem salto.
- **O primeiro bloco do cadastro termina onde terminam os campos**: a coluna da imagem fica em
  `absolute inset-0` dentro de um `relative`, então não dita a altura da linha do grid. A foto
  grande encolhe (`flex-1 min-h-0`), as miniaturas ficam numa linha com rolagem lateral (44 px),
  e a legenda "N imagem(ns) de X · Não importar" cabe em uma linha. Em tela estreita a coluna
  tem altura fixa (`h-80`).
- Para a cor e a presença dos ícones estarem certas **antes** do clique, os valores são lidos
  (`lerCamposDasReferencias`) quando a **janela da lupa fecha** (`aoFechar`), e não ao abrir a
  lista. A marcação só muda dentro da janela, então fechar é o momento certo. O Esc chega ao
  `fechar` por `useEffectEvent`, sem recriar o ouvinte do teclado.
  - **Marca igual ao nome da loja é descartada**: o Eletrogate põe "Eletrogate" nos 2.000
    produtos, e a Casa da Robótica e a Impacto CNC fazem o mesmo.
  - **Homologação quase nunca existe**: medido em 16/09, de 8.588 produtos só um publica o
    número (Saravati, `4556-15-1209`). Os outros escrevem "certificado pela Anatel". Só entra o
    que tem o **formato** do número (`0000-00-0000`), vindo de especificação com rótulo
    Anatel/homologação/INMETRO, ou colado à palavra na descrição. Número solto com hífen pode ser
    telefone.

**O React 19 limpa o formulário depois da action**, e o que volta é o `defaultValue`, não o
que foi digitado. Num Salvar recusado (SKU repetido), o SKU voltava **vazio** junto com a
mensagem de erro. Agora a action guarda o que foi enviado como valor inicial
(`setPreenchido`), e o reset devolve os mesmos valores. Vale para todo campo não controlado
deste formulário.

## Decisões de arquitetura

- **Produtos é o cadastro base.** Todo anúncio deriva dele. O `Anuncio` guarda só o que é
  específico do canal.
- **Dois estados por anúncio:** `status` (interno) e `situacaoCanal` (no marketplace). Eles
  divergem — o ML pausa anúncios sozinho por falta de estoque.
- **Conectores não assumem OAuth.** Bling e ML usam OAuth2, a LI usa chaves estáticas, a
  Shopee assina com HMAC. O gancho `autorizarRequisicao` é onde a diferença cabe.
- **Segredos cifrados** (AES-256-GCM) na tabela `Conexao`, num único JSON por serviço.
  Sem a `ENCRYPTION_KEY` os tokens viram lixo — **leve a chave junto do dump**.
- **Arquivos em `dados/produtos/<SKU>/<tipo>/`**, fora de `public/` (que não sobrevive a
  deploy com Docker). O SKU é validado como nome de caminho; a pasta acompanha quando ele
  muda; o endereço é **calculado na leitura**, nunca gravado.
- **Custo do produto vem do fornecedor padrão.**
- **Manual e ficha técnica são um tipo só, `DOCUMENTO`** ("Documentos técnicos", pasta
  `documentos/`), desde 16/09/2026, decidido com o dono. Nada no sistema tratava um diferente do
  outro, e o mesmo PDF de fabricante costuma ser as duas coisas. **O certificado de
  homologação continua separado** (`CERTIFICADO`): anda com o número, e o Mercado Livre o pede
  em algumas categorias. A migration `20260916_documentos_tecnicos` recria o enum, porque o
  Postgres não remove valor de enum. Não havia nenhum arquivo dos tipos antigos.
- **Documentos e certificado podem ser enviados no cadastro NOVO** (pedido do dono em
  16/09/2026). Vão para `dados/temporarios/<lote>/`, onde o lote é um UUID criado no primeiro
  envio, e são **movidos** para `dados/produtos/<SKU>/` no Salvar (`moverTemporarios`).
  - O lote nasce no clique, e não na montagem: gerado na renderização, o valor do servidor e o
    do navegador divergiriam.
  - Passa pela **mesma validação** do envio normal (`validarEGravar`, extraída de
    `salvarArquivo`).
  - A lista (`arquivosTemporarios`) vem do navegador, mas **só entra o que existe no lote com
    nome gerado por nós**. Tamanho e formato são lidos do disco. Testado: `../../../.env` na
    lista é ignorado.
  - Lote com mais de 24 h (cadastro abandonado) é apagado no envio seguinte.
  - Sem link de abrir antes de salvar: a pasta temporária não tem rota pública, de propósito.
  - **Falha ao gravar os documentos não derruba o Salvar.** Em 16/09, com o servidor sem
    reiniciar após a migration, o produto foi criado e o registro dos arquivos falhou. A ação
    devolvia erro, a tela ficava em "Novo produto" e o segundo Salvar daria "SKU já existe".
    Agora o Salvar segue para o produto, com o aviso `?documentos=falhou`.
- **Imagem principal é uma marca (`principal`), não a posição 0.** Reordenar a cada clique
  fazia as miniaturas dançarem e custava até 3s por clique.
- **Toda chamada externa é auditada** em `LogIntegracao`, com credenciais mascaradas.

## Trabalhando neste projeto

- Verifique com evidência: consulte a API real (leitura é segura), meça nos logs, teste o
  caminho de erro — não só o feliz.
- Prefira `Edit` a reescrever arquivo inteiro com `Write`.
- Antes de commitar: `npm run lint`, e confira que `.env`, `certificates/` e `dados/` ficam
  de fora.
