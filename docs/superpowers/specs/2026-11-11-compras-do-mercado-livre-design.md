# Compras do Mercado Livre no módulo Compras: leitura pela API, casamento, Virtual e rastreio

Data: 11/11/2026. Pedido do dono: "criar uma extensão igual foi feita para o AliExpress mas agora para puxar minhas
compras feitas no Mercado Livre". Brainstorming na mesma conversa; teste só de leitura feito na VPS no mesmo dia.
Abordagem: **sem extensão**. O Rise lê as compras pela API do ML com o token que já usa para vender, porque as compras
são feitas pela conta da loja (4HOBBY_STORE, id 212386247; resposta do dono em 11/11/2026).

## 1. Intenção e porquê

O AliExpress precisou de extensão porque a API dele não lista as compras de quem compra. No ML é o contrário: a API
lista as compras da conta (`/orders/search?buyer=`). O dono quer que as compras do ML entrem no Compras do mesmo jeito
que as do AliExpress: pedido de compra pronto, itens casados com os produtos, rastreio com fase e "!", o comprado
contando como "a caminho" e o depósito Virtual do Bling acompanhando.

Depois de pronto, o processo do dono é: comprar no ML como sempre; o Rise mostra a compra no Compras em até 30 minutos
(ou na hora, pelo botão "Ler compras do ML"); na primeira compra de cada anúncio ele escolhe o produto e o fator; quando
a caixa chega, "Lançar estoque" como hoje.

## 2. Goals, non-goals, anti-goals

**Goals**
- O worker da VPS lê as compras novas e as que mudaram a cada 30 minutos; um botão na lista de pedidos de compra lê na
  hora.
- Cada compra vira um `PedidoDeCompra` do fornecedor **"ML"** (já cadastrado pelo dono, CNPJ 03.007.331/0001-41), com o
  vendedor gravado no pedido, número da compra, data, itens (nome, variação, quantidade, preço) e frete nos totais.
- Compra **aguardando pagamento entra como RASCUNHO** (decisão do dono); paga, vira ENVIADO; cancelada sem nada lançado,
  CANCELADO.
- Casamento item ↔ produto **igual ao AliExpress**: anúncio + variação, com fator (1 comprado = N no Rise); o que não
  casa fica com "!" e o dono escolhe uma vez; o Rise lembra.
- **Depósito Virtual do Bling igual ao AliExpress**: entrada na compra paga e casada, saída no Lançar estoque.
- **Mesmas fases na coluna Situação** do AliExpress, a partir do envio do ML, com rastreio, transportadora e previsão.
- Primeira leitura: compras em andamento + últimos 30 dias. Releitura nunca duplica (id da compra e da linha são as
  chaves).

**Non-goals**
- Extensão do Chrome, e-mails, página "Minhas compras".
- Comprar, pagar, cancelar, avaliar ou mandar mensagem ao vendedor pelo Rise. Só leitura no ML.
- Histórico anterior a 30 dias (o dono escolheu "em andamento + 30 dias"; as 22 entregues de 11/2025 a 05/2026 ficam
  de fora).
- Um fornecedor por vendedor (o dono mandou usar o "ML").
- Lançar estoque sozinho quando o ML disser entregue (só avisa, como no AliExpress).
- Mudar `precoCusto` de vínculo que já tem custo (regra do módulo).

**Anti-goals** (seria falha mesmo funcionando)
- Pedido ou item duplicado numa releitura.
- Compra do dono aparecer em **Pedidos de venda** (a mesma conta é vendedora e compradora; ver §6.6).
- Estoque Físico no Bling por conta da leitura (só o clique de Lançar estoque escreve no Físico).
- Gravar dado que o Rise não usa (endereço de entrega, dados do cartão, ids de pagamento além do necessário para o
  frete).
- Leitura que falha em silêncio: erro vai ao log do worker, à `LogIntegracao` e à rotina na Saúde do Rise.

## 3. Restrições (o que o Rise já tem)

- **Compras e AliExpress:** tudo o que a spec `2026-10-28-aliexpress-em-compras-design.md` §3 descreve, mais o que
  ela criou: `PedidoDeCompra.origem` (enum `OrigemDoPedidoDeCompra` {RISE, ALIEXPRESS}) e `imposto`;
  `ProdutoFornecedor.fator`; `ItemDoPedidoDeCompra.linhasAliExpress`; `src/lib/compras/aliexpress/`
  (`regras.js` com `quantidadeNoRise`, `precoNoRise`, `precoMedioPonderado`, `decidirCasamento`, `faseDoPedido`,
  `alertasDoPedido`, `prazoDoPedido`, `custoPorPeca`; `casamento.js`; `virtual.js` com `depositoVirtual`,
  `entradaNoVirtual`, `saidaDoVirtual`; `importacao.js`); telas `AliExpressDoPedido`, `BlocoItens`, `TabelaPedidos`,
  `TrilhaDoStatus`; MCP `comprasACaminhoDoProduto`.
- **Mercado Livre:** `clienteML()` em `src/lib/canaisDeVenda/ml/cliente.js` (token da conta da loja, renovação, fila,
  429); a leitura de vendas em `src/lib/pedidos/leitura.js` (`/orders/search?seller=`, cursor por origem); o worker
  `scripts/worker-processo.js` com `rodarRotina` (grava `RotinaDoWorker`, a Saúde do Rise lê) e a fila dos webhooks
  (`processarNotificacoes`).
- **Medido em 11/11/2026 na conta da loja** (VPS, só leitura):
  - `GET /orders/search?buyer=212386247&sort=date_desc` → 200, 24 compras de 11/11/2025 a 11/11/2026 (≈ 2 por mês).
    Situações: 22 `paid` com envio `delivered`, 1 `cancelled` com envio `delivered` (cancelada depois de entregue), 1
    `payment_required` com envio `pending/waiting_for_payment` (a de hoje).
  - Pedido: `id`, `date_created`, `date_last_updated`, `status`, `pack_id` (nulo em 6 das 24), `seller {id, nickname}`,
    `total_amount` (só produtos), `paid_amount`, `currency_id`, `shipping.id`, `payments[] {shipping_cost, status,
    total_paid_amount}`, `order_items[] {item {id (MLB…), title, variation_id, variation_attributes, seller_sku},
    quantity, unit_price}`. Todas com 1 item por pedido.
  - Frete: `payments[].shipping_cost` (10,99 numa compra; 0 nas demais, frete grátis); `paid_amount` = produtos + frete.
  - Envio `GET /shipments/{id}`: `status`, `substatus`, `tracking_number` (código dos Correios, ex. AD276050926BR, no
    Sedex; código interno do ML no "MEL Distribution"), `tracking_method`, `shipping_option.estimated_delivery_time.date`
    (previsão), `status_history.date_delivered`. `GET /shipments/{id}/history` traz `date_shipped`, `date_delivered`,
    `date_not_delivered`, `date_returned`.

## 4. Abordagens consideradas

1. **Leitura pela API no worker + botão** (ESCOLHIDA pelo dono em 11/11/2026). Roda sozinho, sem clique semanal, usa o
   token que já existe e a mesma fila do ML.
2. Extensão igual à do AliExpress. Descartada: a API já entrega tudo, e a extensão depende do Chrome aberto e quebra
   quando o site muda.
3. Só no botão. Descartada pelo dono: preferiu o worker a cada 30 min com o botão a mais.

## 5. Decisões do dono (11/11/2026)

- As compras são feitas pela conta da 4hobby.
- Fornecedor: **"ML"**, já cadastrado ("JA CRIEI FORNECEDOR ML, use ele").
- Primeira leitura: **em andamento + últimos 30 dias**.
- Compra aguardando pagamento: **já entra como Rascunho**.
- Leitura: **worker a cada 30 min + botão**.
- Casamento: **igual ao AliExpress** (anúncio + variação + fator, escolhido uma vez e lembrado).
- Bling: **igual ao AliExpress** (Virtual na compra paga, Físico no Lançar estoque).
- Situação: **mesmas fases do AliExpress**.

## 6. O como ("minha escolha" marca o que eu decidi e o dono pode trocar)

### 6.1 Banco (migration aditiva `20261111_compras_mercado_livre`)

- `OrigemDoPedidoDeCompra` ganha `MERCADO_LIVRE`.
- `Fornecedor.mercadoLivreCompras` Boolean padrão false, com índice único parcial (como `aliexpress`); a migration
  marca o fornecedor de nome "ML" (sem caixa) se existir exatamente um. A leitura acha o fornecedor **pela marca, nunca
  pelo nome**; sem marcado, a rotina registra "marque o fornecedor das compras do ML" e não cria nada.
- Tabelas novas, no molde das do AliExpress (os dados crus do ML ficam aqui; o pedido de compra segue as regras de
  sempre):
  - `CompraMercadoLivre`: `id`, `pedidoId` (1:1 com `PedidoDeCompra`, Cascade), `externoId` @unique (o `pack_id`, ou o
    `id` da compra quando não há pack; ver §6.2), `vendedor`, `vendedorId`, `statusNoML`, `dataDaCompra`, `totalPago`
    Decimal, `frete` Decimal, `envioId`, `envioStatus`, `envioSubstatus`, `rastreio`, `transportadora`, `previsao`
    DateTime?, `enviadoEm`, `entregueEm`, `naoEntregueEm`, `devolvidoEm`, `canceladoNoMLEm`, `envioLidoEm`,
    `atualizadoEm`.
  - `LinhaCompraMercadoLivre`: `id`, `compraId` (Cascade), `externoLinhaId` @unique (`<id da compra>:<item.id>:<variation_id>`),
    `anuncio` (MLB…), `variacaoId` (texto, vazio sem variação), `variacao` (texto dos `variation_attributes`), `titulo`,
    `skuDoVendedor`, `quantidadeComprada` Int, `precoComprado` Decimal(12,4), `fator` Int padrão 1, `itemId` →
    `ItemDoPedidoDeCompra` (SetNull), `virtualQuantidade`, `virtualLancadoEm`, `virtualErro` (como a linha do
    AliExpress).
- Vínculo do fornecedor ML: `ProdutoFornecedor.codigo` = `"<MLB…>:<variation_id>"` (sem variação: `"<MLB…>:"`),
  `link` = página do anúncio, `descricao` = título, `fator`.
- Minha escolha: tabelas próprias em vez de generalizar as do AliExpress. Os campos são outros (um envio por compra,
  sem pacotes nem opção em texto), e mexer nas tabelas do AliExpress em produção arrisca o que já funciona.

### 6.2 Unidade do pedido: uma compra do Rise por pacote do ML (minha escolha)

Quando o dono compra vários itens do mesmo vendedor no carrinho, o ML cria várias compras com o mesmo `pack_id` e um
envio só. No Rise isso vira **um** pedido de compra (uma caixa chega, um Lançar estoque), com uma linha por compra do
pack. Sem `pack_id`, a compra sozinha é o pedido. Nas 24 compras medidas, todas tinham 1 item e packs diferentes,
então hoje é 1 compra = 1 pedido; a regra só vale quando o carrinho juntar itens.

### 6.3 Leitura (`src/lib/compras/mercadoLivre/`: `leitura.js`, `importacao.js`, `regras.js`, `casamento.js`)

- **Rotina `comprasML`** no worker normal (fora do PC e das fontes), a cada 30 min, por `rodarRotina` (aparece na Saúde
  do Rise). Sob `pg_advisory_xact_lock` próprio: o botão e o worker ao mesmo tempo, o segundo espera.
- **Botão "Ler compras do ML"** na lista de Compras (ação de servidor com `tela.compras.pedidos` editar): roda a mesma
  função e mostra o resumo ("3 compras lidas · 1 nova · 1 item sem produto") em `ConclusaoDoEnvio`.
- **O que lê:**
  1. Primeira vez (sem cursor): `orders/search?buyer=<conta>&order.date_created.from=<hoje − 30 dias>`, paginado, mais
     as compras de até 120 dias cujo envio não está `delivered`/`cancelled` (as em andamento antigas).
  2. Depois: `order.date_last_updated.from = <última leitura bem-sucedida − 1 h>` (cursor gravado como o dos pedidos de
     venda).
  3. Sempre: relê `GET /shipments/{id}` das compras do Rise que ainda não chegaram (o envio muda sem mexer na data da
     compra). Pausa de 300 ms entre chamadas (o ML responde 429 a rajadas).
- **Compra nova:** cria `CompraMercadoLivre`, as linhas e o `PedidoDeCompra` (fornecedor ML, `origem` MERCADO_LIVRE,
  `numero` pela trava de sempre, `frete`, `enviadoEm` = data da compra quando paga). Tenta casar cada linha.
- **Situação do pedido** (função pura em `regras.js`):
  - `payment_required` / `payment_in_process` → **RASCUNHO**. Nada no Virtual.
  - `paid` (ou `partially_paid`) → **ENVIADO** (PARCIAL se já lançou algo); manda as linhas casadas ao Virtual.
  - `cancelled` → **CANCELADO** se nada foi lançado, com saída do Virtual do que tinha entrado; com algo lançado, aviso
    âmbar "cancelada no ML, mas há estoque lançado" (o caso medido: cancelada depois de entregue).
  - Pedido do ML nunca volta de ENVIADO para RASCUNHO. A trilha mostra "Enviado" como "Comprado no ML".
- **A leitura nunca escreve** nos campos que a tela edita (observações, rastreio em texto, transportadora, frete por
  conta, entrada), igual ao AliExpress. Em RASCUNHO o dono pode mexer nos itens; a leitura só mexe nos itens que ela
  criou pelas linhas.

### 6.4 Casamento e Virtual

Igual ao AliExpress (§6.3 e §6.3b da spec dele), trocando "anúncio:opção" por "anúncio:variação":

1. Vínculo do fornecedor ML com `codigo` = `MLB…:variação` → produto e fator.
2. Vínculo de qualquer fornecedor (ou o fornecedor em rascunho do Bling) cujo `link`/`descricao`/`codigo` traga o mesmo
   `MLB…`: se for **um** produto só, casa e cria o vínculo do ML (fator 1). Mais de um: "!".
3. Senão fica pendente com "!".

Ao casar: item com quantidade = comprada × fator e preço = preço ÷ fator; vínculo novo recebe custo só se o produto não
tinha nenhum (com frete rateado, `custoPorPeca`); kit não casa. Escolha manual pela mesma tela do AliExpress (produto +
fator, "Casar"). O Virtual reaproveita `virtual.js` (entrada "E" na compra paga e casada, saída "S" no Lançar estoque,
devolução ao desfazer, `virtualErro` + "Reenviar ao Virtual"). Rascunho não mexe no Virtual.

Minha escolha: as funções puras do AliExpress que servem aos dois (`quantidadeNoRise`, `precoNoRise`,
`precoMedioPonderado`, `decidirCasamento`, `custoPorPeca`, `alertasDoPedido`, `prazoDoPedido`) passam a ser importadas
pelo módulo do ML de onde estão, sem mover arquivo. Só se a importação ficar estranha, elas vão para
`src/lib/compras/regrasDeImportacao.js`.

### 6.5 Fases da Situação (mesmas do AliExpress)

| Envio do ML (`status/substatus`) | Fase no Rise |
|---|---|
| compra `payment_required` | Aguardando pagamento |
| `pending`, `handling`, `ready_to_ship` (sem coleta) | Aguardando envio |
| `ready_to_ship/picked_up`, `shipped` (primeiro dia) | Postado |
| `shipped` | Em trânsito |
| `shipped/out_for_delivery` | Saiu para entrega |
| `delivered` | Aguardando conferência (sem "!"; some quando lançar) |
| `not_delivered` | Falha na entrega ("!") |
| `shipped/returning_to_sender`, `date_returned` | Devolvido ("!") |
| previsão vencida e não entregue | Atrasado ("!") |
| envio sem mudança há 7 dias e não entregue | Sem atualização ("!") |

Os substatus que aparecerem e não estiverem na tabela vão ao log com o texto cru e a fase fica pelo `status`. A coluna
Rastreio mostra o código (link para os Correios quando for código dos Correios; senão para a página da compra no ML),
a transportadora e a previsão.

### 6.6 A conta é vendedora e compradora (cuidado)

A leitura de **vendas** usa `seller=<conta>` e não pega compras. Mas a **fila dos webhooks** (`orders_v2`) pode receber
aviso de uma compra da conta. Antes de gravar como venda, `lerPedidoDaOrigem` do ML tem de conferir
`seller.id = conta`; compra (o `buyer.id` é a conta) é ignorada na fila de vendas e, de bônus, dispara a leitura das
compras. Conferir no código na hora de construir se essa guarda já existe; se não, ela entra junto e ganha teste.

### 6.7 Telas

- **Compras › Pedidos:** selo "Mercado Livre" na linha (com o vendedor na bolha), busca pelo nº da compra e pelo
  vendedor, mesma coluna Situação com as fases e o "!". Botão "Ler compras do ML" ao lado das ações da lista (só com
  `tela.compras.pedidos` editar). A lixeira não vale para pedido do ML (a próxima leitura o recriaria).
- **Pedido do ML (`EditorPedido`):** cabeçalho com "Mercado Livre nº 2000…" (abre a compra no ML em outra aba),
  vendedor, situação no ML, data e o bloco Frete só leitura (rastreio, transportadora, previsão, entregue em). O
  fornecedor fica fixo. `BlocoItens` ganha **Variação** e as linhas pendentes com Produto + Fator + "Casar", como no
  AliExpress. Avisos âmbar no topo.
- **Integrações:** sem cartão novo (a conexão é a do ML). O cartão do Mercado Livre ganha uma linha "Compras: última
  leitura dd/mm hh:mm · N compras" e o fornecedor marcado, com seletor para trocar.
- Acesso novo: `acao.compras.lerComprasML` e o Casar reaproveita `acao.compras.casarAliExpress` renomeado na tela para
  "Casar item importado com produto" (o id fica o mesmo para não mexer nas funções salvas). Sem `dado.custo`, a coluna
  de preço continua cortada.
- MCP: `comprasACaminhoDoProduto` passa a trazer as compras do ML (mesma regra de "a caminho").

### 6.8 Busca pelo rastreio (pedido do dono em 11/11/2026, vale para todo pedido de compra)

A busca da lista de Pedidos de compra ("Buscar por número, fornecedor ou produto") passa a achar também pelo **código de
rastreio**: o campo `rastreio` do pedido (o digitado à mão, de qualquer fornecedor), os pacotes do AliExpress
(`PacoteAliExpress.codigo` e `codigoOrigem`) e o envio do ML (`CompraMercadoLivre.rastreio`). Sem caixa e com parte do
código (colar "NN436981120BR" ou só "436981120" acha). O texto de dentro do campo vira "Buscar por número, fornecedor,
produto ou rastreio". O envio combinado do AliExpress (o mesmo pacote em dois pedidos, visto em PC-0012 e PC-0014) traz
os dois pedidos. Entra em `listarPedidos` (`src/lib/compras/banco.js`), no `OR` que já existe.

### 6.9 Nota fiscal do pedido de compra (pedido do dono em 11/11/2026, vale para todo pedido de compra)

**A API do ML não entrega a nota da compra** (medido em 11/11/2026 em 3 compras pagas e entregues, com e sem pack, e uma
de Sedex): `/packs/{pack}/fiscal_documents` → 404 "does not exist"; `/users/{vendedor}/invoices/orders/{compra}` e
`/users/{conta}/invoices/orders/{compra}` → 404 "Invoice not found"; `/packs/{pack}` → 403 para quem compra. Essas rotas
são do lado do vendedor; quem compra só baixa a nota na página "Minhas compras". Então a nota do ML também entra por
upload, como a dos outros fornecedores.

- **Bloco próprio "Nota fiscal"** no pedido, ao lado de Pagamento (escolha do dono em 11/11/2026): a nota é da
  mercadoria e da entrada no estoque, não do dinheiro, e um pedido pode ter várias (entrega parcial, frete em nota
  separada). Botão "Anexar nota fiscal", vários arquivos por pedido, em qualquer situação, como os comprovantes.
- **Arquivos:** PDF (DANFE), XML da NF-e, JPG ou PNG, conferidos pelos bytes. Tabela `NotaFiscalCompra` no molde de
  `ComprovanteDePagamentoCompra` (`pedidoId`, `arquivo`, `nomeOriginal`, `enviadoPor`, `enviadoEm`), mais os campos lidos
  do XML: `numero`, `serie`, `chave` (44 dígitos), `emitidaEm`, `valorTotal`, `emitenteCnpj`, `emitenteNome`. Pasta
  `dados/compras/<pedidoId>/notas/`.
- **XML é lido na hora** (minha escolha): a linha mostra "NF 12345 · 05/11/2026 · R$ 990,90 · emitente"; PDF e foto
  mostram só o nome do arquivo. A busca da lista também acha pelo número e pela chave da nota.
- **Fora daqui (ideia para depois, não pedida):** baixar sozinho TODA nota emitida contra o CNPJ da loja pela SEFAZ
  (Distribuição de DF-e, com o certificado A1), o que cobriria o ML e todos os fornecedores. É projeto à parte.

### 6.10 Testes e entrega

- `scripts/teste-compras-ml.js` (`npm run teste:compras-ml`) com o `mlFalso` ganhando `/orders/search?buyer=` e
  `/shipments/{id}`, e fixtures tiradas das 24 compras medidas (anonimizadas): compra nova paga, aguardando pagamento
  (Rascunho) que vira paga, cancelada com e sem lançamento, pack com duas compras, releitura sem duplicar, cursor, envio
  relido sem a compra mudar, casamento 1/2/pendente/manual com fator, kit recusado, frete nos totais, Virtual
  (entrada, saída, erro, Rascunho sem Virtual), fases da tabela §6.5, a guarda da fila de vendas §6.6, trava de leitura
  simultânea, fornecedor não marcado.
- `teste:compras`, `teste:aliexpress`, `teste:pedidos`, `teste:acessos`, lint e os 4 testes do ritual. Commit; deploy
  na VPS (migration aditiva) e a 1ª leitura acompanhada na tela, terminando com o roteiro de testes do dono.

## 7. O que fica para quem constrói

- Nomes dos componentes e o layout exato, dentro das 10 regras do padrão visual.
- O texto da variação (junta `variation_attributes` como "Cor: Azul · Tamanho: M").
- O link da página da compra no ML (conferir o formato atual na conta antes de fixar).
- Os substatus reais além dos medidos (só `delivered` e `pending/waiting_for_payment` foram vistos): aprender no uso,
  como no AliExpress.
- Se `/orders/search?buyer=` não aceitar `order.date_last_updated.from`, ler por `date_created` dos últimos 120 dias a
  cada volta (são ≈ 2 compras por mês, cabe numa página).
