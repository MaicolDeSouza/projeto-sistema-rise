# Concorrentes no Mercado Livre pelo catálogo — desenho

Data: 21/10/2026. Decidido com o dono em conversa de brainstorming (ver "Decisões do dono").

## 1. Intenção e porquê

Ao criar um anúncio do Mercado Livre no Rise, o dono precisa saber **por quanto os outros vendedores vendem o mesmo
produto no ML** para definir o preço dele, do jeito que hoje a lupa e a aba Concorrentes do cadastro de Produto fazem
com as lojas coletadas. Depois de escolhidos, esses concorrentes do ML devem ser **relidos todo dia**, com série de
preço e foto mensal, "igual a coleta faz hoje", e o Rise deve avisar quando o anúncio do dono **cair de posição** ou
alguém **baixar o preço**.

## 2. O que foi medido antes de decidir (21/10/2026, só GETs, token da conta 4HOBBY_STORE)

- `GET /sites/MLB/search` continua **403** (busca pública fechada), e `GET /items/{id}` de anúncio de **outro**
  vendedor dá **403** (também no multiget `/items?ids=`, item a item). Título e vendidos de anúncio alheio **não existem**
  pela API.
- `GET /products/search?status=active&site_id=MLB&q=<termo>&limit=N` → 200: produtos de **catálogo** parecidos com o
  termo (407 para "placa uno r3 ch340"), cada um com `id`, `name`, `domain_id`, `attributes` (ficha), `pictures`,
  `settings.listing_strategy` e `buy_box_winner` (veio `null` nos medidos).
- `GET /products/{id}` → 200: o produto de catálogo (`permalink`, `family_name`, `attributes`...). O nosso
  MLB4165084257 (100101) tem `catalog_product_id` **MLB44072268** e `catalog_listing: false` (é um anúncio "tradicional"
  ligado ao catálogo; o Rise também tem o MLB4191686159 dentro do catálogo).
- `GET /products/{id}/items?limit=50` → 200: **os anúncios que competem naquele catálogo**, na ordem em que o ML os
  mostra ao comprador em "outras opções de compra" (no medido, por preço crescente): 9 no MLB44072268 (39,54 ×2 da
  ARDU_ROBÓTICA, 42,99 REIDOS ESPECIFICOS, 49,90 nós e outro, 55,80 ×3 em Premium). Cada item traz `item_id`,
  `seller_id`, `price`, `original_price`, `listing_type_id`, `condition`, `shipping.free_shipping`,
  `shipping.logistic_type`, `official_store_id`, `tier`, `user_product_id`. **Não traz** título nem `sold_quantity`.
  Um catálogo sem anúncios abertos devolve **404** (MLB60092501). `paging.total` existe.
- `GET /users/{seller_id}` → 200 sem token especial: `nickname`, `permalink`, `seller_reputation.level_id`
  (`5_green`), `power_seller_status` (`gold`), `transactions.total`, `address.city`.

## 3. Decisões do dono

1. **Só pelo catálogo da API oficial** (Opção 1). A Opção 2 (navegador no PC com a sessão logada, no molde do
   repositório `ElioBonfim/Aula-Mercado-Livre-Henrique-Niada`) foi **descartada**: contraria a regra do projeto de não
   disfarçar navegador, usa os cookies da conta de vendedor e para no captcha. Do repositório **não se aproveita código**
   (é Python/Playwright sobre o HTML da busca); a medição acima é que define o que se usa.
2. Na hora de criar o anúncio: **primeira página / melhor posicionados**, escolher e **salvar como concorrentes do ML**.
3. Depois de salvos, **reler como a coleta faz hoje**: automática, com histórico, na VPS.
4. Os concorrentes do ML ficam numa **lista separada** dos concorrentes das lojas, com **selo de posição próprio**
   ("2º de 9 no ML"): o preço do ML embute comissão e frete, e misturar com loja própria engana.
5. O que se perde, aceito pelo dono: posição na **página de busca** (não existe pela API), título e vendidos de cada
   anúncio alheio, e vendedores do mesmo item que não estão ligados ao catálogo escolhido.

## 4. Metas, não metas e antimetas

**Metas**
- Na aba Preço e estoque do editor do ML: buscar o produto de catálogo pelo nome, escolher, ver os anúncios que competem
  (preço, preço cheio, vendedor com reputação e total de vendas, Clássico/Premium, frete grátis, posição), marcar e
  salvar como concorrentes do Produto.
- Selo "Nº de M no ML" ao lado do preço do anúncio, e clicar num preço copia para o campo.
- Releitura diária pelo worker da VPS: preço e posição de cada concorrente, série de preço, foto mensal.
- Aviso na lista de anúncios do ML e no editor quando a posição do dono caiu ou um concorrente baixou o preço desde a
  última leitura vista.
- Aba Concorrentes do cadastro de Produto mostra a lista do ML em separado, só leitura.

**Não metas (agora)**
- Posição na página de busca do ML; navegador; título e vendidos de anúncio alheio.
- Mudar o preço do anúncio sozinho ("repricing"). O Rise só mostra e avisa.
- Concorrentes do ML entrarem na lupa do Nome, na descrição por IA ou no `ProdutoColetado`/Scraper.
- Produto sem catálogo: fica sem concorrentes do ML, com a mensagem do motivo.

**Antimetas**
- Qualquer escrita no ML ou no Bling. É tudo GET.
- Gravar preço "inventado": campo que o ML não devolve fica `null`.
- Estourar a cota da API: a releitura é uma leitura por catálogo por dia (não por concorrente), mais uma por vendedor
  novo.

## 5. Restrições

- API do ML pela `clienteML()`/`mlGet` (fila e `LogIntegracao` já existentes). Só GET.
- Worker da VPS no molde das rotinas de hora em hora de `scripts/worker-processo.js` (foto mensal, estoque do Bling):
  **só o worker normal** (não o de teste nem o do PC), fora do `coletaPausada`, nunca lança.
- Migration **aditiva**, à mão (tirar do diff os índices que só existem no SQL), regra do schema do CLAUDE.md.
- Texto da tela com acento; identificadores sem.
- Testes sem rede: ML falso (`scripts/lib/mlFalso.js`) ganha as três rotas; Postgres local só com produtos `ZZ-ML-*`.

## 6. Abordagens consideradas

| | Como | Ganha | Perde |
|---|---|---|---|
| **1. Catálogo pela API (escolhida)** | `/products/search` + `/products/{id}/items` + `/users/{id}` | Oficial, sem risco, roda na VPS todo dia, dado em JSON, posição no catálogo | Sem posição na busca, sem título/vendidos, só quem está no catálogo |
| 2. Navegador no PC | Chromium com a sessão do dono lendo a página de busca | Primeira página inteira, posição na busca | Disfarce de navegador (contra a regra do projeto), cookies da conta em risco, captcha para a releitura, só pelo PC |
| 3. As duas | 1 na VPS e 2 só na criação | Tudo | O custo da 2 inteiro |

O dono escolheu a 1 depois de ver a medição: cobre preço e posição todo dia, e a posição na busca era a única perda real.

## 7. Como funciona

### 7.1 Dados (migration `20261021_concorrentes_ml`)

- `Produto.mlCatalogoId String?` — o produto de catálogo escolhido (`MLB44072268`). Um por produto; vale para todos os
  anúncios do ML dele (Clássico e Premium). `Produto.mlCatalogoNome String?` para a tela não reler o ML.
- `ConcorrenteML` — um por anúncio concorrente salvo:
  `id`, `produtoId` (Cascade), `itemId` (`MLB...`), `catalogoId`, `vendedorId`, `vendedorApelido`, `vendedorReputacao`
  (`level_id`), `vendedorVendas` (Int, `transactions.total`), `vendedorCidade`, `tipoAnuncio` (`gold_special`/`gold_pro`),
  `freteGratis Boolean`, `logistica`, `preco Decimal`, `precoCheio Decimal?`, `posicao Int` (1 = primeiro da lista do
  ML), `totalNoCatalogo Int`, `lidoEm`, `ausenteDesde DateTime?` (sumiu da lista do catálogo: fica, não apaga, como a
  coleta), `criadoEm`. `@@unique([produtoId, itemId])`.
- `ConcorrenteMLHistorico` — a série: `concorrenteId` (Cascade), `preco`, `precoCheio`, `posicao`, `lidoEm`. Linha nova
  **só quando preço, preço cheio ou posição mudam** (a regra do `PrecoHistorico`).
- `PosicaoML` — a posição do próprio dono por catálogo: `produtoId`, `catalogoId`, `itemId` (o anúncio do dono que está
  no catálogo), `posicao`, `total`, `menorPreco`, `lidoEm`. Linha nova só quando posição, total ou menor preço mudam.
  Sem anúncio do dono no catálogo, `posicao` `null` e `total` preenchido (ele ainda sabe quantos competem).
- `Produto.mlConcorrentesVistoEm DateTime?` — quando o dono abriu a lista pela última vez; o aviso compara com ele.
- `FotoMensalColeta` ganha as linhas do ML na foto do dia 14: `fonteId` fixo `"mercado-livre-catalogo"` (a coluna é
  texto obrigatório sem chave estrangeira; não existe `FonteColeta` para o ML, de propósito), `fonteNome` "Mercado Livre
  (catálogo)", `codigo` = itemId, `nome` = apelido do vendedor + tipo, preço normal = `preco`, `tipoPreco` NORMAL. Sem
  coluna nova.
- `ConfigCanal.mlConcorrentesRelidosEm DateTime?` — quando a última rodada diária terminou (o `ConfigCanal` não tem campo
  JSON; uma coluna nova com nulo é aditiva).

### 7.2 Leitura do ML (`src/lib/canaisDeVenda/ml/catalogo.js`, só GET, cliente por parâmetro)

- `buscarCatalogos(ml, termo, { limite = 10 })` → `[{ id, nome, dominio, foto, atributosResumo }]` de `/products/search`.
  Termo vazio não chama o ML.
- `lerConcorrentesDoCatalogo(ml, catalogoId, { meuSellerId })` → `{ total, itens: [{ itemId, vendedorId, preco,
  precoCheio, tipoAnuncio, freteGratis, logistica, condicao, posicao, meu }] }`; 404 = `{ total: 0, itens: [] }` (não é
  erro). Até 50 por página; lê até 3 páginas (150 anúncios) e para.
- `lerVendedores(ml, ids)` → `Map(id → { apelido, reputacao, power, vendas, cidade })`, com **cache em memória de 24 h**
  por id (o apelido muda raro; uma releitura diária não pode custar uma chamada por vendedor).
- `textoDaReputacao(level_id)` puro: `5_green` → "verde 5", etc.

### 7.3 Editor do anúncio (aba Preço e estoque, bloco "Concorrentes no Mercado Livre")

Ordem na aba: preço e estoque (como hoje) → **Concorrentes no Mercado Livre** → custos do ML → calculadora.

1. **Sem catálogo escolhido:** campo de busca pré-preenchido com o título da aba Geral e o botão **Buscar no catálogo**.
   Resultado: até 10 produtos de catálogo, cada um com foto, nome, domínio e 3 atributos da ficha (marca, modelo e o
   primeiro que sobrar), e o botão **Usar este**. Nada acha: "Nenhum produto de catálogo parecido. Esse item fica sem
   concorrentes do ML." Se o Produto já tem `mlCatalogoId`, pula para o passo 2 (o botão vira "Trocar catálogo").
2. **Com catálogo:** a lista dos anúncios que competem, na ordem do ML: posição, preço (cheio riscado quando há),
   vendedor (apelido, reputação, vendas), Clássico/Premium, frete grátis. Os do dono em destaque ("você"), não
   marcáveis. Caixa de marcação por linha, **"Marcar todos"** e o botão **Salvar concorrentes**. Já salvos vêm marcados;
   desmarcar e salvar **remove** da lista do Produto (não há histórico a perder antes da primeira releitura; depois, remover
   apaga a série, com confirmação na tela).
3. **Salvar** grava `Produto.mlCatalogoId/Nome`, os `ConcorrenteML` marcados (com a leitura de agora como primeira linha
   do histórico) e a primeira `PosicaoML`. É uma Server Action própria (`salvarConcorrentesML`), fora do Salvar do
   anúncio: o dono pode salvar concorrentes sem salvar o rascunho.
4. **Selo "Nº de M no ML"** ao lado do campo Preço (`posicaoDePreco` com os preços dos concorrentes salvos, cada vendedor
   contando uma vez pelo menor preço dele, empate "(empatado)"; o próprio anúncio do dono já publicado no catálogo não
   entra, senão o dono competiria consigo). Clicar num preço da lista copia para o campo Preço e marca o formulário.
5. **Cabeçalho do bloco:** "Lido em 21/10 08:03 · 9 anúncios no catálogo · você é o 4º" e o botão **Reler agora**
   (uma leitura, sem gravar histórico se nada mudou; grava `lidoEm`).

### 7.4 Cadastro de Produto (aba Concorrentes)

Abaixo da tabela das lojas, a seção **"Concorrentes no Mercado Livre"** (só leitura): catálogo escolhido com link
(`permalink`), a lista com posição, vendedor, preço (e seta vermelha/verde contra a leitura anterior), tipo, frete e
"última leitura". Selo próprio "Nº de M no ML" ao lado do título da seção. Sem botões de editar: a escolha é feita no
editor do anúncio (link "Editar no anúncio do ML").

### 7.5 Releitura diária (worker da VPS)

- Rotina `relerConcorrentesML()` em `src/lib/canaisDeVenda/ml/relerCatalogo.js`, chamada de hora em hora no laço do
  worker normal, que roda de verdade **uma vez por dia** (`ConfigCanal.mlConcorrentesRelidosEm`, no dia de São Paulo,
  como a foto mensal guarda o mês). Para cada `Produto` com `mlCatalogoId`: uma leitura de `/products/{id}/items`, atualiza cada
  `ConcorrenteML` salvo (preço, posição, ausente), grava histórico quando mudou, grava `PosicaoML` quando mudou. Vendedores
  pelo cache. Erro num catálogo não derruba os outros; o resultado vai para o log do worker.
- **Ritmo:** a fila do `mlGet` já limita; a rotina ainda espera 300 ms entre catálogos. Com 200 produtos são ~200 GETs
  por dia.
- Rate limit ou token vencido: a rodada para, loga e tenta de novo na próxima hora (sem contar como rodada do dia).

### 7.6 Avisos

- `avisosDoML(produto)` puro: compara a última `PosicaoML` e os últimos históricos com `mlConcorrentesVistoEm`. Devolve
  `[{ tipo: "caiu"|"preco_baixou"|"novo_mais_barato", texto }]`. "Novo mais barato" sai do `menorPreco` da `PosicaoML`
  (que lê o catálogo inteiro): um vendedor que o dono NÃO salvou entrou abaixo do preço dele.
- **Lista de anúncios do ML** (`TabelaAnunciosML`): coluna "Concorrência" com um selo âmbar "caiu de 2º para 5º" ou
  "ARDU_ROBÓTICA baixou para R$ 37,90". Abrir o anúncio marca como visto.
- **Editor:** faixa âmbar no topo do bloco com os mesmos avisos.

## 8. Tratamento de erro

- ML fora do ar ou 429: a tela mostra "Não foi possível ler o Mercado Livre agora" e mantém o que está gravado.
- Catálogo que sumiu (404 na releitura): os concorrentes ganham `ausenteDesde`, o produto ganha o aviso "o catálogo
  MLB... não tem mais anúncios", nada é apagado.
- Vendedor que não responde (`/users` 404): apelido fica o último conhecido ou "vendedor 141686451".
- Preço vindo `null` ou 0 do ML: não grava histórico, mantém o anterior, marca `lidoEm`.

## 9. Testes (`npm run teste:anuncios-ml`, bloco novo "Concorrentes do ML pelo catalogo")

- ML falso com `/products/search`, `/products/{id}`, `/products/{id}/items` (com 404 para catálogo vazio e paginação) e
  `/users/{id}`.
- `buscarCatalogos`, `lerConcorrentesDoCatalogo` (ordem, `meu`, 404, 3 páginas), cache de vendedores (segunda chamada
  não lê o ML).
- Salvar: cria concorrentes + histórico + posição; salvar de novo sem mudança não duplica; desmarcar remove; produto não
  Conferido recusa.
- Releitura: preço mudou → linha no histórico; igual → só `lidoEm`; sumiu → `ausenteDesde`; posição do dono mudou →
  `PosicaoML`; erro num catálogo não impede o seguinte; roda uma vez por dia.
- `posicaoDePreco` com concorrentes do ML: um vendedor com dois anúncios conta uma vez; o anúncio do dono não entra.
- `avisosDoML`: caiu, baixou, novo mais barato, nada a avisar depois de visto.
- Foto mensal inclui as linhas do ML.

## 10. O que fica para quem constrói

- Formato exato do `level_id` e `power_seller_status` na tela (texto curto).
- Onde a releitura grava o log do worker.
- Paginação do `/products/search` (o dono vê 10; "ver mais" é opcional).
- O nome do campo de busca e o texto de ajuda da bolha "i".

## 11. Fora do escopo, registrado

- Posição na página de busca e varredura por navegador (Opção 2): descartadas pelo dono em 21/10/2026.
- Mudar preço sozinho; avisar por e-mail/WhatsApp; concorrentes do ML na foto de "produtos da loja".
