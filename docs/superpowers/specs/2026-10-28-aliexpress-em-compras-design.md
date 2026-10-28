# AliExpress no módulo Compras: extensão "Enviar ao Rise", importação dos pedidos e rastreio por item

Data: 28/10/2026. Pedido do dono: "na área de compras gostaria de vincular o AliExpress via API para pegar minhas
compras feitas no site". Brainstorming na mesma conversa; teste descartável feito ao vivo no Chrome dele (só leitura).
Abordagem escolhida: **Opção 1, extensão própria do Rise no Chrome, um clique semanal "Enviar ao Rise"**.

## 1. Intenção e porquê

O dono compra muito no AliExpress (cerca de 1.200 avisos de pedido por e-mail no último ano) e a conta é só da loja.
Nada disso entra no Rise: ele acompanha pelo site e lança a entrada no Bling de cabeça. O módulo Compras já sabe
representar a compra (pedido de compra, itens, estoque a caminho, lançar estoque no Bling sem duplicar). Falta a ponte.

A API oficial do AliExpress não serve: ela é para dropshipping e vendedores, não lista os pedidos do comprador e exige
cadastro de desenvolvedor com aprovação. Os e-mails do AliExpress não trazem rastreio nem id do produto. Sobrou o que a
página "Meus pedidos" entrega para quem está logado, e o teste de 28/10 provou que dá para ler tudo o que o Rise precisa.

Depois de pronto, o processo do dono é: comprar no AliExpress como sempre; uma vez por semana abrir "Meus pedidos" e
clicar em "Enviar ao Rise"; no Rise, os pedidos novos já estão lá como pedidos de compra do fornecedor AliExpress, com os
itens casados com os produtos e o rastreio por item; quando a caixa chega, "Lançar estoque" como hoje.

## 2. Goals, non-goals, anti-goals

**Goals**
- Extensão do Chrome própria ("Rise AliExpress") com um botão "Enviar ao Rise" na página Meus pedidos.
- Cada pedido do AliExpress vira um `PedidoDeCompra` do fornecedor "AliExpress", já na situação ENVIADO, com número do
  AliExpress, loja, data, itens (foto, nome, opção, quantidade, preço unitário), frete e imposto nos totais.
- Casamento item ↔ produto do Rise por **anúncio + opção** (productId + skuId), com **fator** de embalagem (1 comprado
  = N no Rise). O que não casa aparece com "!" e o dono escolhe uma vez; o Rise lembra.
- Rastreio por item: código, transportadora, último evento (com data) e previsão de entrega, atualizados a cada envio.
- A situação acompanha o AliExpress: entregue → aviso "entregue, falta lançar"; cancelado/reembolsado → CANCELADO se
  nada foi lançado.
- Primeira importação: pedidos em andamento + últimos 30 dias. Depois: pedidos novos + os que ainda estão abertos.
- Cartão "AliExpress" em Integrações: chave da extensão, última importação e seu resumo.
- Reimportar nunca duplica (número do pedido e da linha do AliExpress são as chaves).

**Non-goals**
- Comprar ou mexer em qualquer coisa no AliExpress pelo Rise (a extensão só lê).
- Ler o AliExpress a partir da VPS, sem navegador. Só pelo Chrome logado do dono.
- API oficial do AliExpress, e-mails do Gmail, extensões de terceiros.
- Lançar estoque sozinho quando o AliExpress marcar entregue (decisão do dono: só avisa).
- Importar o histórico anterior a 30 dias (pode vir depois, por pedido do dono).
- Mudar o custo (`precoCusto`) de produto que já tem vínculo: a mesma regra do módulo, "lançar não mexe no custo".
- Rastrear pelos Correios/transportadora por fora: o rastreio é o que o AliExpress mostra.

**Anti-goals** (seria falha mesmo funcionando)
- Pedido ou item duplicado numa reimportação.
- Estoque FÍSICO no Bling por conta da importação (só o clique de Lançar estoque escreve no Físico; a importação só
  mexe no depósito Virtual, que não conta no saldo, ver §6.3b).
- Quebrar em silêncio quando o AliExpress mudar a página: a extensão diz "não consegui ler os pedidos" e o Rise grava o
  erro na conexão.
- Mandar ao Rise dado pessoal que ele não precisa (endereço, telefone, nome do destinatário, ids de pagamento).
- A chave do Rise sair para qualquer domínio que não seja o do Rise configurado.

## 3. Restrições (o que o Rise já tem e o desenho obedece)

- **Compras:** `PedidoDeCompra` (`numero` PC-, `status` RASCUNHO/ENVIADO/PARCIAL/FINALIZADO/CANCELADO, `fornecedorId`
  Restrict, `icmsSt`, `frete`, `desconto*`, `entrada`, `rastreio` texto, `observacoes`), `ItemDoPedidoDeCompra`
  (`produtoId` obrigatório e Restrict, `vinculoId`, `nomeNoFornecedor`, `codigoNoFornecedor`, `link`, `quantidade` Int,
  `precoUnitario` 4 casas, `ipiPercentual`, `quantidadeLancada`, `@@unique(pedidoId, produtoId)`),
  `LancamentoDoItemDeCompra`. `lib/compras/regras.js` (`STATUS_A_CAMINHO`, `totaisDoPedido`, `podeIrPara`,
  `statusDepoisDeLancar`), `banco.js` (`listarPedidos`, `lerPedido`, `salvarPedido`, `mudarStatus`, `proximoNumero` sob
  trava, `colocarItensNoRascunho` sob `pg_advisory_xact_lock`), `lancamento.js`. Telas: `TabelaPedidos`, `EditorPedido`,
  `BlocoItens` (Foto, Produto, Nome no fornecedor, Código fornecedor, Qtde, Preço un., IPI %, Total, Prazo, Chegada),
  `TrilhaDoStatus`, `SeloDoStatus`, `BuscaDeItem`. ENVIADO trava quantidade, preço e totais.
- **Fornecedor:** `estrangeiro` dispensa CNPJ. `ProdutoFornecedor`: `descricao`, `codigo`, `link`, `precoFornecedor`,
  `precoCusto`, `adicionais`, `padrao`; várias linhas por produto+fornecedor desde 23/10. A importação do Bling põe na
  `descricao` o que o Bling chama de "Descrição no fornecedor", que na prática é o link do produto (ex. AliExpress).
  Não existe campo de fator/embalagem (só `Produto.multiploVenda`, que é regra de venda).
- **Conexões:** `Conexao` (enum `Servico`, `segredoCifrado` via `cifrar`/`decifrar`, `status`, `contaExterna`,
  `ultimoTeste*`), `lib/integracoes/conexoes.js` (`lerSegredo`, `salvarConexao`, `registrarTeste`, `desconectar`),
  cartões `CartaoConector` em `/integracoes`, `LogIntegracao` por chamada. `hashDoSegredo` (sha256 hex) em
  `lib/mcp/oauth.js` e `timingSafeEqual` já usados pelos tokens do MCP.
- **Acessos:** recursos em `lib/acessos/recursos.js` (`tela.compras`, `tela.compras.pedidos`,
  `acao.compras.lancarEstoque`); preço de compra é `dado.custo`; `teste:acessos` exige guarda em toda página/ação.
- **Padrões:** 10 regras do padrão visual do CLAUDE.md, `BolhaDeAjuda`, `ConclusaoDoEnvio`, "Sair sem salvar?";
  migration só aditiva, uma sessão por vez no schema; `teste:compras` (111 asserções) e lint no fim; roteiro de testes
  na entrega. Produção é a VPS (rise.4hobby.com.br); o PC é cópia.
- **AliExpress, medido em 28/10/2026 na conta do dono** (página em português, moeda BRL):
  - A página expõe `window.lib.mtop.request`, a biblioteca do próprio site, que assina as chamadas sozinha.
  - `mtop.aliexpress.trade.buyer.order.list` (POST, v1.0, `data.params` com a árvore "ultron" da página, `linkage`
    com assinatura gerada pelo servidor). **Só responde com pedidos quando é a página que pede**: a chamada sintética
    sem a assinatura devolve SUCCESS com 0 pedidos. Trocar a aba ("Ver tudo", "Processando", "Processado") e clicar no
    span "Ver mais pedidos" (pageIndex 2, 3...) disparam a chamada, e um gancho em `lib.mtop.request` captura a resposta.
    Cada pedido é `data.pc_om_list_order_<orderId>.fields`: `orderId`, `orderDateText` ("26 out, 2026"), `statusText`,
    `utParams.args.orderStatus` (7 = Enviado parcialmente, 8 = Aguardando a entrega), `storeName`, `storePageUrl`,
    `totalPriceText`, `currencyCode`, `orderLines[]` {`orderLineId`, `productId`, `skuId`, `itemTitle`,
    `itemDetailUrl`, `itemImgUrl`, `quantity`, `itemPriceText`, `skuAttrs[{name, text}]`}, `buttons[]` (TRACKING
    com href `/p/tracking/index.html?tradeOrderId=`); o corpo da lista traz `hasMore` e `pageIndex`.
  - `mtop.ae.ld.querydetail` (GET, `data {tradeOrderId}`) por chamada direta, de qualquer página do aliexpress.com:
    `module.trackingDetailLineList[]` (um por pacote) {`mailNo`, `originMailNo`, `logisticsCarrierName`, `etaInfo`
    {`etaTimeText`, `beginEtaTime`, `endEtaTime`}, `detailList[]` {`time` ms, `trackingDetailDesc`, `trackingName`,
    `trackingPrimaryCode`}, `packageItemList[]` {`itemId` = productId, `skuId`, `count`, `itemTitle`, `skuDesc`}}.
  - `mtop.aliexpress.trade.buyer.order.detail` (GET, `{tradeOrderId}`) por chamada direta: blocos
    `detail_order_price_block` (`priceDetails[]` Subtotal / Enviando / Imposto + `totalPrice`),
    `detail_order_status_block`, `detail_product_block` (`productVOList`, `sellerVO`).
- **Chrome:** extensão Manifest V3; content script com `"world": "MAIN"` para alcançar `lib.mtop`; MAIN → ISOLATED por
  `window.postMessage`, ISOLATED → service worker por `chrome.runtime`; o service worker faz o `fetch` ao Rise com
  `host_permissions`; instalação por "Carregar sem compactação" (modo desenvolvedor).

## 4. Abordagens consideradas

1. **Extensão própria que dirige a página e captura as respostas** (ESCOLHIDA pelo dono em 28/10/2026). A lista vem
   da própria página (troca de aba e "Ver mais"), rastreio e detalhe por chamada direta pela biblioteca do site. Um
   clique, dados completos, código nosso. Quebra quando o AliExpress mudar a página; aí se conserta.
   - Dentro dela, assinar as chamadas por conta própria (md5 do cookie `_m_h5_tk`, como o projeto aberto
     ElMagoCT/aliexpress-parcel-intelligence faz) foi descartado: a lista precisa da assinatura do servidor de qualquer
     jeito e a biblioteca do site já assina o resto.
2. Extensões prontas da loja do Chrome + "Importar planilha" no Rise. Descartada: a planilha simples não traz rastreio,
   a que promete não garante a coluna, dois arquivos por semana e dependência de terceiros.
3. Script no PC dirigindo o Chrome logado (padrão "Varrer pelo PC"). Descartada: mesma fragilidade com mais peças, e
   automação por fora do navegador é o que o AliExpress mais bloqueia.
4. E-mails do Gmail e API oficial. Fora: sem rastreio e sem id do produto; sem listagem de pedidos do comprador.

## 5. Decisões do dono (28/10/2026)

- Opção 1 (extensão própria); um passo manual por semana serve.
- A conta do AliExpress é só da loja: tudo que ele compra lá é para a 4hobby. Sem triagem.
- Quer as duas coisas: facilidade para lançar as compras novas E rastreio toda semana.
- Um mesmo anúncio tem várias opções e ele compra opções diferentes para produtos diferentes: o casamento é por
  anúncio + opção.
- Vendedores vendem "kit de 100 pçs" como 1 item: o casamento guarda um fator (quantidade × fator, preço ÷ fator).
- Quando o AliExpress marcar entregue, o Rise só avisa; lançar estoque continua no clique.
- Primeira importação: pedidos em andamento + últimos 30 dias.
- O fornecedor do AliExpress já existe no Rise: "Ali". Não criar outro.
- Desenho aprovado em 28/10/2026. Depois da aprovação: as compras do Ali entram no depósito **Virtual** do Bling na
  importação e passam ao Físico na chegada (Opção 1), e o comprado tem de contar na lista do estoque mínimo (§6.3b).

## 6. O como (o que está decidido; "minha escolha" marca o que eu decidi e ele pode trocar)

### 6.1 A extensão "Rise AliExpress"

Pasta `extensao-aliexpress/` na raiz do repositório (fora de `src/`, sem build, JavaScript puro):
`manifest.json`, `pagina.js` (MAIN world, roda em `https://www.aliexpress.com/p/order/*`), `ponte.js` (ISOLATED, só
repassa mensagens), `fundo.js` (service worker: fala com o Rise), `popup.html` + `popup.js` (botão "Enviar ao Rise",
endereço do Rise com padrão `https://rise.4hobby.com.br`, chave, resumo da última leitura), `leitura.js` (funções puras:
ler pedido da árvore, ler rastreio, ler detalhe, regra de corte, limpeza), ícone.

**O clique "Enviar ao Rise"**, do começo ao fim:
1. O popup confere se a aba é a de Meus pedidos logada (existe `lib.mtop` e não é página de login); senão: "Entre no
   AliExpress, abra Meus pedidos e tente de novo". Confere também idioma português e moeda BRL (os textos de situação e
   de preço são lidos em pt-BR); senão avisa e para.
2. `pagina.js` instala o gancho em `lib.mtop.request` (uma vez) e pede ao Rise, pelo service worker, o **ponto de corte**
   (`GET /api/compras/aliexpress/estado` → `lerDesde`: 30 dias atrás na primeira vez; depois a data da última importação
   bem-sucedida menos 7 dias de margem, minha escolha).
3. Lê as abas **"Processando" e "Processado" inteiras** (são os pedidos em andamento: aguardando envio, enviado,
   aguardando entrega) e **"Ver tudo" até o corte** (para quando todos os pedidos da página são anteriores a `lerDesde`).
   Em cada aba: clica na aba, espera a resposta da lista pelo gancho (até 15 s), clica em "Ver mais pedidos" enquanto
   `hasMore` e a última página ainda interessa, com 1,5 a 3 s entre cliques. Pedidos "A ser pago" não entram.
4. Manda ao Rise a **fase 1** (`POST /api/compras/aliexpress/importar`, `{fase: "lista", pedidos: [...]}`), só com o que
   o Rise usa: por pedido `orderId`, data (texto e ISO), `statusText`, `orderStatus`, loja (nome e id da URL), total,
   moeda, e por linha `orderLineId`, `productId`, `skuId`, opção (texto dos `skuAttrs`), título, URL do item, URL da
   foto, quantidade, preço. **Nunca** destinatário, endereço, telefone, ids de pagamento.
5. O Rise responde `{precisaDetalhe: [orderIds], precisaRastreio: [orderIds], resumoParcial}`: detalhe só dos pedidos
   novos (frete e imposto), rastreio dos pedidos abertos e dos entregues sem evento final. A extensão faz essas chamadas
   diretas (`order.detail` e `querydetail`), 1,5 a 3 s entre elas, no máximo 80 por clique (minha escolha; o Rise manda
   os mais novos primeiro e o que sobrar vai no próximo clique), e manda a **fase 2** (`{fase: "detalhes", detalhes,
   rastreios}`), já limpa: por pacote `mailNo`, `originMailNo`, transportadora, previsão (texto, início, fim), até 30
   eventos (hora, descrição, nome, código) e os itens do pacote (`itemId`, `skuId`, `count`).
6. O popup mostra o resumo que o Rise devolveu: "14 pedidos lidos · 3 novos · 6 rastreios atualizados · 2 itens sem
   produto (abra o Rise)". Em erro, a mensagem do Rise ou "não consegui ler os pedidos; o AliExpress mudou?".

A chave fica em `chrome.storage.local`; vai no cabeçalho `Authorization: Bearer`; `host_permissions` só
`https://www.aliexpress.com/*`, `https://rise.4hobby.com.br/*` e `https://localhost:3000/*` (o Rise do PC roda em
HTTPS). Sem permissão de cookies, sem ler outras páginas.

### 6.2 Banco (migration aditiva `20261028_compras_aliexpress`)

- `Servico` ganha `ALIEXPRESS`. A conexão guarda o **hash** (sha256) da chave em `segredoCifrado` (cifrado como os
  outros segredos); a chave em si é mostrada uma vez. `contaExterna` fica vazia (não lemos quem é a conta).
- O fornecedor do AliExpress **já existe no Rise e se chama "Ali"** (dono, 28/10/2026). `Fornecedor.aliexpress` Boolean,
  padrão false, com índice único parcial (só um fornecedor pode ser o do AliExpress); a migration marca o "Ali" (pelo
  nome, sem caixa; se não achar, cria "AliExpress" estrangeiro e marca). A importação e o casamento acham o fornecedor
  **pelo campo, nunca pelo nome**; sem nenhum marcado, a rota recusa com "marque o fornecedor do AliExpress em
  Integrações". O cartão AliExpress mostra qual fornecedor está marcado e deixa trocar. **Um fornecedor só**, a loja de
  cada pedido fica no pedido.
- `ProdutoFornecedor.fator` Int, padrão 1 (vale para qualquer fornecedor daqui em diante: "1 comprado = N no Rise").
  Para o AliExpress o vínculo usa `codigo` = `"<productId>:<skuId>"` (anúncio:opção), `link` = URL do item com
  `sku_id`, `descricao` = título do item.
- `PedidoDeCompra.origem` enum `OrigemDoPedidoDeCompra` {RISE, ALIEXPRESS}, padrão RISE; `PedidoDeCompra.imposto`
  Decimal(12,2) padrão 0 (o "Imposto" do AliExpress; entra nos totais ao lado de IPI e ICMS ST).
- Tabelas novas (os dados crus do AliExpress ficam aqui; o pedido de compra continua com as regras de sempre):
  - `PedidoAliExpress`: `id`, `pedidoId` (1:1 com `PedidoDeCompra`, Cascade), `externoId` @unique (nº do AliExpress),
    `loja`, `lojaId`, `statusTexto`, `statusCodigo` Int?, `dataDoPedido`, `totalInformado` Decimal, `moeda`,
    `entregueEm` DateTime?, `canceladoNoAliExpressEm` DateTime?, `detalheLidoEm` DateTime?, `rastreioLidoEm` DateTime?,
    `atualizadoEm`.
  - `LinhaAliExpress`: `id`, `pedidoAliExpressId` (Cascade), `externoLinhaId` @unique (orderLineId), `productId`,
    `skuId`, `opcao` (texto), `titulo`, `urlDoItem`, `urlDaFoto`, `quantidadeComprada` Int, `precoComprado`
    Decimal(12,4), `fator` Int padrão 1, `itemId` → `ItemDoPedidoDeCompra` (SetNull; nulo = ainda não casou),
    `pacoteId` → `PacoteAliExpress` (SetNull).
  - `PacoteAliExpress`: `id`, `pedidoAliExpressId` (Cascade), `codigo` (mailNo), `codigoOrigem`, `transportadora`,
    `previsaoTexto`, `previsaoInicio`, `previsaoFim`, `ultimoEvento`, `ultimoEventoEm`, `ultimoCodigo`, `eventos` Json
    (até 30), `atualizadoEm`; `@@unique([pedidoAliExpressId, codigo])`.
- Uma linha do AliExpress aponta para no máximo um item do pedido; duas linhas da mesma compra que casam com o **mesmo**
  produto somam no mesmo item (o `@@unique(pedidoId, produtoId)` continua valendo; o preço do item vira a média
  ponderada e cada linha guarda o seu).

### 6.3 Rotas e regras (`src/lib/compras/aliexpress/`: `importacao.js`, `casamento.js`, `situacao.js`, `leitura.js`)

- `GET /api/compras/aliexpress/estado` e `POST /api/compras/aliexpress/importar`, com Bearer da extensão (hash comparado
  com `timingSafeEqual`), sem sessão; a chave age como o dono. Cada clique vira uma linha de `LogIntegracao`
  (ALIEXPRESS) e atualiza `ultimoTeste*` da conexão (o cartão mostra). Importação sob `pg_advisory_xact_lock` próprio:
  dois cliques ao mesmo tempo, o segundo espera.
- **Fase 1 (lista):** para cada pedido, upsert de `PedidoAliExpress` e `LinhaAliExpress` pelos ids externos. Pedido
  novo: cria `PedidoDeCompra` (fornecedor AliExpress, `origem` ALIEXPRESS, `numero` pela trava de sempre, status
  ENVIADO, `enviadoEm` = data do pedido, `observacoes` vazio) e tenta casar cada linha. Pedido já existente: atualiza
  situação e, se vier linha nova, casa. Devolve `precisaDetalhe` (pedidos sem `detalheLidoEm`) e `precisaRastreio`
  (abertos no AliExpress, ou entregues sem evento de entrega), mais novos primeiro.
- **Casamento de uma linha** (`casamento.js`), nesta ordem, parando no primeiro acerto:
  1. `ProdutoFornecedor` do fornecedor AliExpress com `codigo` = `productId:skuId` → o produto e o fator do vínculo.
  2. `ProdutoFornecedor` (de qualquer fornecedor) cujo `link` ou `descricao` contenha `/item/<productId>`, **ou**
     `Produto.fornecedorRascunho.descricao` (o fornecedor em rascunho do Bling: medido em 28/10/2026 no banco do PC, 503
     produtos com link do AliExpress ali, 493 com `/item/<id>`, nenhum com `sku_id`, e 54 anúncios usados em mais de um
     produto) e, se o link tiver `sku_id=`, seja o mesmo `skuId`. Se exatamente **um** produto aparece: casa, e
     cria/atualiza o vínculo do AliExpress com o `codigo` anúncio:opção (fator 1). Se mais de um produto: não casa
     (fica "!"; é o caso das opções diferentes do mesmo anúncio).
  3. Senão fica pendente: `itemId` nulo, "!" no pedido.
  Ao casar: cria `ItemDoPedidoDeCompra` com `quantidade` = comprada × fator, `precoUnitario` = preço ÷ fator (4 casas),
  `nomeNoFornecedor` = título, `codigoNoFornecedor` = anúncio:opção, `link` = URL do item, `vinculoId`. Se o produto
  não tinha nenhum vínculo com custo, o vínculo novo do AliExpress recebe `precoFornecedor` = `precoCusto` = preço ÷
  fator (minha escolha: dar custo a quem não tinha; nunca sobrescrever custo que existe). Kit (produto com composição)
  não casa: fica "!" com o aviso "kit não recebe compra".
- **Escolha manual** (tela do pedido, linha pendente): o dono busca o produto (`BuscaDeItem`) e informa o fator; o Rise
  cria o item, grava/atualiza o vínculo do AliExpress (código anúncio:opção, fator, link, descrição) e, nas próximas
  compras daquela opção, casa pela regra 1. Trocar produto ou fator depois só enquanto nada daquele item foi lançado:
  desfaz o item antigo (se nenhuma outra linha aponta para ele) e cria o novo. Tanto a importação quanto o Casar gravam
  por funções próprias de `importacao.js`, sem passar pelo `salvarPedido` da tela (que trava os itens de pedido
  ENVIADO); e a importação **nunca escreve** nos campos que a tela edita (observações, rastreio em texto, transportadora,
  frete por conta, entrada), então o dono editar o pedido no meio de um clique não perde nada.
- **Fase 2 (detalhes):** do detalhe, `frete` = "Enviando", `imposto` = "Imposto", e `descontoValor` (R$) = produtos +
  frete + imposto − total informado, quando positivo (cupons e moedas), para o total do Rise bater com o do AliExpress;
  `detalheLidoEm`. Do rastreio, upsert dos pacotes por (pedido, código) e `pacoteId` em cada linha cujo
  (`productId`, `skuId`) está em `packageItemList` (se em mais de um pacote, o primeiro); `rastreioLidoEm`.
- **Situação** (`situacao.js`), a partir de `orderStatus` + `statusText` (os códigos vão sendo aprendidos; texto decide
  quando o código é desconhecido, e o desconhecido fica registrado no log):
  - A ser pago → não entra. Aguardando envio / Enviado parcialmente / Aguardando a entrega → ENVIADO (ou PARCIAL se já
    lançou algo). Entregue / Concluído → mantém ENVIADO/PARCIAL, grava `entregueEm`, aviso âmbar "Entregue no AliExpress
    em dd/mm, falta lançar" no pedido e "!" na lista; FINALIZADO continua saindo do lançamento ou do clique.
    Cancelado / Reembolsado → CANCELADO se nenhum item tem lançamento; senão aviso "cancelado no AliExpress, mas há
    estoque lançado".
  - Pedido do AliExpress nunca volta a RASCUNHO; a trilha mostra "Enviado" como "Comprado no AliExpress".
- **Totais:** `totaisDoPedido` ganha `imposto` (soma ao lado de IPI e ICMS ST); o PDF (que o dono não usa para o
  AliExpress) só mostra a linha quando houver.
- **Estoque a caminho:** sem mudança; pedido ENVIADO/PARCIAL do AliExpress já conta.

### 6.3b Depósito Virtual do Bling (decisão do dono em 28/10/2026, depois da aprovação)

O Bling da 4hobby tem dois depósitos (lidos em 28/10/2026 por `GET /depositos` na conexão do PC): **"Fisico"**
(padrão, id 1423545090) e **"Virtual"** (id 1432737444, `desconsiderarSaldo: true`: o que está nele não entra no saldo
do produto). O dono mandou: "as compras do Ali devem ser lançadas no estoque virtual" e escolheu a **Opção 1**:

- **Na importação**, quando uma linha casa com o produto (sozinha ou pelo Casar), o Rise manda ao Bling uma **entrada
  ("E") no depósito Virtual** da quantidade no Rise (comprada × fator) daquele produto. Linha pendente não manda nada
  até casar. A entrada não mexe no `Produto.estoque` do Rise (o Virtual não conta) nem cria `MovimentoEstoque`: ela é
  registrada na própria linha (`LinhaAliExpress.virtualLancadoEm`, `virtualQuantidade`, `virtualErro`).
- **Na chegada**, o "Lançar estoque" de um item de pedido do AliExpress faz o de sempre (entrada no Rise, balanço no
  Físico) e, a mais, uma **saída ("S") do Virtual** da mesma quantidade. Desfazer o lançamento devolve ao Virtual.
- **Cancelado/reembolsado** no AliExpress sem nada lançado: saída do Virtual do que tinha entrado. **Trocar o produto**
  de uma linha já casada: saída do Virtual do produto antigo e entrada do novo.
- O id do depósito Virtual é lido de `GET /depositos` a cada clique (pelo nome "Virtual", sem caixa; os ids são da
  conta, nunca fixos); sem depósito com esse nome, a importação segue e avisa "sem depósito Virtual no Bling".
- Vale a trava de escrita do Bling (`BLING_ESCRITA`, aberta na VPS, fechada no PC) e a fila de 3 req/s. Bling que
  recusa (trava, produto sem `blingId`, erro) deixa a linha com `virtualErro`, aviso âmbar no pedido com "Reenviar ao
  Virtual" e "!" na lista; o resto da importação não para. Cada envio vira `LogIntegracao` BLING como os demais.
- **Lista do estoque mínimo:** o que foi comprado no AliExpress **já conta como "a caminho"** pela regra do módulo (soma
  do que falta lançar dos itens de pedidos ENVIADO/PARCIAL), então o produto comprado sai da lista assim que a linha
  casa. É isso que o dono pediu ("senão o relatório vai pedir compra sendo que já comprei"); o Rise **não lê** o saldo do
  depósito Virtual para isso, a fonte é o próprio pedido. Linha pendente (sem produto) não conta: por isso o "!".
- **Primeira importação:** o dono NÃO lança nada no Virtual à mão hoje (28/10/2026), então a primeira importação
  manda a entrada de todos os pedidos que encontrar, como qualquer outra.

### 6.4 Telas

- **Integrações › cartão "AliExpress"** (`CartaoConector`): o operador vê primeiro o estado (Não configurado /
  Conectado) e a última importação ("28/10 14:02 · 14 pedidos, 3 novos, 6 rastreios"); ação principal "Gerar chave da
  extensão" (mostra a chave uma vez, com Copiar; gerar de novo invalida a anterior); "Como instalar" abre a bolha com o
  passo a passo; o fornecedor marcado ("Ali") com um seletor para trocar. Exige `tela.integracoes` editar.
- **Compras › Pedidos:** a lista ganha selo "AliExpress" na linha (com a loja na bolha), busca também pelo nº do
  AliExpress, "!" âmbar quando entregue sem lançar ou com item pendente. A lixeira não vale para pedido do AliExpress
  (minha escolha: apagar faria a próxima importação recriá-lo; cancelado fica no histórico).
- **Pedido do AliExpress (`EditorPedido`, mesma página):** cabeçalho com "AliExpress nº 8215…" (abre o pedido no site
  em outra aba), loja, situação no AliExpress e data; o fornecedor fica fixo. `BlocoItens` ganha a coluna **Opção** e a
  coluna **Rastreio** (código como link para a página de rastreio do AliExpress, transportadora, último evento com data,
  previsão), só em pedidos de origem ALIEXPRESS. Linhas pendentes aparecem no mesmo bloco, antes dos itens, com "!",
  foto, título, opção, quantidade comprada e preço, e os campos **Produto** (busca) e **Fator** (padrão 1) com "Casar".
  Totais mostram "Imposto" quando houver. Avisos âmbar da situação no topo, no padrão dos avisos do módulo.
- Acessos novos: `acao.compras.casarAliExpress` ("Casar item do AliExpress com produto", sob `tela.compras.pedidos`) e
  o cartão em Integrações sob `tela.integracoes`. Sem `dado.custo` a coluna de preço continua cortada como hoje.

### 6.5 Testes e entrega

- `scripts/teste-compras.js` ganha os casos da importação com fixtures gravadas do teste de 28/10 (anonimizadas):
  pedido novo, reimportação sem duplicar, casamento pelas regras 1 e 2, pendente e escolha manual com fator, duas linhas
  no mesmo produto, kit recusado, totais com frete/imposto/desconto, situações (entregue, cancelado com e sem
  lançamento), rastreio por pacote e linha, chave inválida, trava de importação simultânea.
- `scripts/teste-extensao-aliexpress.js` testa `leitura.js` (funções puras) com as mesmas fixtures: pedido da árvore,
  rastreio, detalhe, regra de corte, limpeza de dados pessoais.
- `teste:acessos`, lint, os 4 testes do ritual. Commit e deploy na VPS (migration aditiva). Instalação da extensão no
  Chrome do dono por roteiro; a 1ª importação é acompanhada e termina com o roteiro de testes do dono.

## 7. O que fica para quem constrói

- Nomes dos componentes novos e o layout exato das colunas, dentro das 10 regras do padrão visual (frontend-design +
  make-interfaces-feel-better antes de entregar).
- Como esperar a lista carregar (resposta do gancho com timeout de 15 s; sem resposta, aborta a aba com aviso).
- Formato do payload entre fases e os limites (tamanho, 80 chamadas por clique).
- Conversão das datas ("26 out, 2026", meses em pt-BR) e dos preços ("R$57,49", "R$ 1.234,56") em `leitura.js`.
- Moeda diferente de BRL ou página em outro idioma: recusar com aviso claro, não tentar converter.
- O ícone da extensão e os textos do popup.
- Teto de páginas por aba (30, minha sugestão) para a leitura nunca correr sem fim; o que sobrar vai no próximo clique.
- Data que não se consegue ler ("Hoje", formato novo): usar a data do clique e marcar aviso, nunca inventar outra.
- A rota valida o corpo com zod (`esquema.js`) e limita o tamanho (5 MB); payload fora do formato responde 400 com o
  motivo, e o popup mostra.
- O fator é inteiro: compra que vira fração de unidade do Rise (meio rolo) não é coberta; o dono ajusta no pedido.
