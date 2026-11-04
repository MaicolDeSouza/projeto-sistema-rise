# Módulo Pedidos: vendas do Bling, Mercado Livre, Loja Integrada e Shopee em um só lugar

Data: 04/11/2026. Pedido do dono, ditado em partes na mesma conversa (brainstorming). Abordagem escolhida: **Opção 1,
pedido próprio no Rise lido pelo worker, com webhook como acelerador na 2ª fase**.

## 1. Intenção e porquê

Hoje as vendas moram em três lugares (ML, LI e Bling), cada um com o próprio status, o próprio cliente e a própria nota
fiscal, e o dono não sabe **quanto sobrou de cada venda** depois de comissão, frete, imposto e custo. O Rise já sabe o
custo de cada produto, já calcula o lucro esperado de cada anúncio (`custosDoAnuncio` no editor do ML, `lucroLiquido`
na loja), já relê o saldo do Bling de hora em hora e já tem o estoque a caminho do módulo Compras. O módulo junta isso
num pedido só:

1. toda venda desde **01/11/2026**, dos quatro canais, numa lista com o ícone do canal;
2. cliente sempre cadastrado (nome + documento), criado sozinho quando a plataforma manda um comprador novo;
3. status unificado, inclusive **Aguardando peças** (qual peça tem, qual falta e a previsão);
4. lucro **estimado** (o do editor, congelado no dia da venda) e lucro **real** (com os números que a venda trouxe), com
   "!" quando divergem;
5. NF e XML baixados pelo pedido, de quem emitiu; a emissão preparada e **desligada**.

## 2. Goals, non-goals, anti-goals

**Goals**
- Lista de pedidos de venda com foto do 1º item, canal (ícone), número, data, cliente (com o nível Bronze/Prata/Ouro/
  Platinum), itens, total, forma de pagamento, status do pedido, tipo e status do frete, lucro e o ícone de problemas ("!").
- Pedido completo: cliente (documento, telefone, e-mail, endereço de entrega), itens (foto, nome, código, quantidade,
  preço, custo congelado, se o produto está no Rise e se está Conferido), pagamento (forma, parcelas, valor pago), frete
  (tipo, transportadora/serviço, rastreio, status, link), NF (número, chave, baixar NF e XML), lucro (estimado × real,
  parcela a parcela), histórico de status do canal.
- Pedidos do **ML e da LI lidos na própria plataforma**; do **Bling só os digitados no Bling** (sem loja). Nunca o
  mesmo pedido duas vezes. Shopee será lida na própria Shopee quando a integração existir (decisão do dono em 04/11/2026);
  até lá nenhum pedido dela entra, nem pelo Bling.
- Cliente automático: casa pelo documento; cria quando não existe; "!" quando a plataforma não mandou o documento.
- **Aguardando peças** automático, com a peça em falta e a previsão vinda do pedido de compra ou da ordem de produção.
- Lucro estimado e real, "!" quando divergem acima da tolerância.
- Baixar NF e XML pelo pedido (ML, LI e Bling, cada um pela própria API). "Criar NF" presente e **desabilitado**, atrás
  da trava `NFE_EMISSAO=false`, no molde das travas de escrita.
- Carga inicial desde 01/11/2026 e leitura periódica pelo worker (fase 1); webhooks do ML, da LI e do Bling na VPS como
  acelerador (fase 2), com a leitura periódica mantida como rede de segurança.

**Non-goals (fica para depois)**
- Métricas do nível do cliente (Bronze/Prata/Ouro/Platinum): o campo existe e é editado à mão; a regra de cálculo vem
  depois ("iremos definir as métricas depois").
- Emitir NF de verdade (a trava fica fechada; o primeiro envio real é decisão do dono).
- Mudar o status na plataforma a partir do Rise (postar, cancelar, marcar enviado). O Rise só espelha.
- Integração com a Shopee (fica para um projeto próprio; o ícone dela existe no filtro, desligado, e o enum `Canal` já
  tem SHOPEE).
- Pedidos anteriores a 01/11/2026. Mudança num pedido antigo também é ignorada.
- Valor liberado pelo Mercado Pago (relatório de faturamento do ML): o lucro real usa os números do pedido e do envio.
- Financeiro (contas a receber, conciliação bancária).

**Anti-goals (seria falha mesmo funcionando)**
- Duplicar um pedido do ML ou da LI porque o Bling também o importou.
- Inventar documento, custo ou lucro: o que a plataforma não mandou fica vazio e marcado.
- Escrever em qualquer plataforma na fase 1 (nada de PUT/POST em ML, LI ou Bling, além do cadastro do webhook na fase 2).
- Lista poluída: o pedido que pede ação tem de se destacar; o resto é denso e silencioso (Padrão visual).

## 3. Restrições

- JavaScript sem TypeScript; identificadores e comentários sem acento; texto da tela com acento.
- Padrão visual das telas (10 regras do CLAUDE.md), `Card`, `CabecalhoOrdenavel`, `NavegacaoDoTopo` (25/100 por página),
  `FotoComLupa`, `BolhaDeAjuda`, `propsDoFundo`, "Sair sem salvar?", `ConclusaoDoEnvio` só no sucesso.
- Ícones de canal os mesmos da coluna Canais de Produtos (Rise, Bling, LI, ML; o da Shopee existe no filtro, desligado).
- Toda chamada externa passa pelos clientes já existentes (`clienteML()`, `liGet`, `clienteBling()`), pelo `LogIntegracao`
  e pelas filas de ritmo (ML 429, Bling 3/s, LI 90/min).
- Dinheiro em `Decimal(12,2)`; percentual em `Decimal(6,3)`; datas em UTC no banco, exibidas em São Paulo.
- Acessos: `tela.pedidos` (ver/editar) já existe no catálogo; ações novas entram em `recursos.js`.
- Testes sem rede: ML falso (`scripts/lib/mlFalso.js`), Bling falso (`blingFalso.js`) e LI falsa (`liFalsa.js`), que
  ganham as rotas de pedidos, envios e NF.
- Nada no `.env` com segredo em texto de comando; `APP_URL_PUBLICA` já existe para montar as URLs dos webhooks.

## 4. Abordagens consideradas

**Opção 1 (escolhida): pedido próprio no Rise, lido pelo worker; webhook na 2ª fase.** Tabelas novas no molde do Compras.
O worker lê de 5 em 5 min os pedidos novos e alterados de cada canal, casa pelo número da loja, cria o cliente, congela
a estimativa e calcula status, peças e lucro. Funciona igual na VPS e no PC. Troca: até 5 min de atraso até a fase 2.

**Opção 2: webhook desde o início.** A mesma estrutura, mas a rota pública, a configuração nos três painéis e a fila de
notificações já na 1ª entrega. Ganha segundos, custa mais peças para testar de uma vez, e no PC nada chega (a leitura
periódica teria de existir do mesmo jeito).

**Opção 3: o Bling como fonte única.** Só `/pedidos/vendas`, que já traz ML e LI. Não serve: o Bling não guarda a comissão
nem o frete real do ML, nem a taxa de pagamento da LI; não tem a NF do ML nem da LI; e vai contra o pedido do dono.

## 5. Desenho

### 5.1 Dados

```
enum StatusDoPedidoDeVenda { AGUARDANDO_PAGAMENTO, PAGO, AGUARDANDO_PECAS, EM_SEPARACAO, ENVIADO, ENTREGUE,
                             FINALIZADO, CANCELADO, DEVOLVIDO }
enum StatusDoEnvio          { SEM_ENVIO, A_POSTAR, POSTADO, EM_TRANSITO, ENTREGUE, NAO_ENTREGUE, DEVOLVIDO, CANCELADO }
enum NivelDoCliente         { BRONZE, PRATA, OURO, PLATINUM }        // novo campo opcional em Cliente: `nivel`

model PedidoDeVenda {
  id, canal Canal, origem Canal            // origem = de onde o Rise LEU (ML, LI ou BLING); canal = o da venda
                                           // (hoje origem = canal; o par existe para a Shopee futura e por clareza)
  idExterno String                         // id do pedido na origem (order id do ML, numero da LI, id do Bling)
  numero String                            // o número que o operador vê (ML: order id; LI: numero; Bling: numero)
  blingPedidoId String?, blingNumero String?   // o espelho no Bling de um pedido do ML/LI (só para abrir lá)
  packId String?                           // ML: carrinho; pedidos do mesmo pack aparecem ligados
  dataDaVenda DateTime, atualizadoNaOrigemEm DateTime
  clienteId String?, cliente Cliente?      // nulo só quando a origem não mandou documento ("!")
  nomeDoComprador, documentoDoComprador, emailDoComprador, telefoneDoComprador  // como veio, para auditoria
  enderecoDeEntrega Json                   // {nome, endereco, numero, complemento, bairro, cidade, uf, cep, referencia}
  status StatusDoPedidoDeVenda, statusDaOrigem String, statusDaOrigemDetalhe String?
  emSeparacao Boolean                      // o único passo manual (operador marca)
  pagamento Json                           // [{forma, tipo, parcelas, valor, valorPago, status, aprovadoEm}]
  envio Json                               // {tipo, servico, transportadora, rastreio, link, statusDaOrigem, custoDoVendedor,
                                           //  cobradoDoCliente, prazo, historico: {postadoEm, entregueEm, ...}}
  statusDoEnvio StatusDoEnvio
  totalProdutos, desconto, freteCobrado, total  Decimal
  // lucro
  estimativa Json?                         // {receita, comissao, tarifaFixa, frete, imposto, custo, lucro, calculadoEm,
                                           //  origem: "editorML" | "lucroNaLoja" | null}
  real Json?                               // mesmas parcelas, com `fonte` por parcela: "pedido" | "envio" | "config" |
                                           //  "manual" | "estimado" (quando a origem não informa, repete a estimativa e marca)
  lucroEstimado, lucroReal Decimal?, lucroFechado Boolean   // fechado quando ENTREGUE/FINALIZADO com todas as parcelas reais
  custoDoFreteManual Decimal?              // SO no Bling: o operador digita o que pagou de etiqueta (LI vem do Enviali)
  nf Json?                                 // {origem, idExterno, numero, serie, chave, emitidaEm, status, urlPdf, urlXml}
  pecas Json?                              // resultado do "aguardando peças" (5.5), recalculado a cada leitura
  avisos String[]                          // os motivos do "!" (chaves fixas, ver 5.9)
  historico Json                           // [{em, statusDaOrigem, status}] (LI: situacao_historico; ML: status_history do envio)
  criadoEm, atualizadoEm
  @@unique([origem, idExterno]); @@index([status]); @@index([dataDaVenda]); @@index([clienteId]); @@index([canal, status])
}

model ItemDoPedidoDeVenda {
  id, pedidoId, ordem
  produtoId String?, produto Produto?       // nulo quando o anúncio não está no Rise
  anuncioId String?                         // o Anuncio que casou (ML por idExterno=MLB; LI por idExterno)
  codigoNaOrigem String?, idNaOrigem String? // seller_sku / sku / codigo; MLB / id_externo / produto.id do Bling
  titulo String, quantidade Int
  precoUnitario, desconto, total Decimal
  comissao Decimal?                         // ML: sale_fee × quantidade (por unidade, conferir no 1º pedido real)
  custoUnitarioCongelado Decimal?           // o custo do produto no dia da leitura (regra do custo em 5.6)
  custoOrigem String?                       // "fornecedorPadrao" | "rascunhoBling" | "cadastro" | "pecas" | "kit" | null
  conferido Boolean                         // Produto.conferido no dia da leitura (relido a cada atualização)
  @@index([pedidoId]); @@index([produtoId])
}

model NotificacaoDePedido {                 // fase 2: a fila dos webhooks
  id, origem Canal, recurso String, payload Json, recebidaEm, processadaEm DateTime?, erro String?, tentativas Int
  @@index([processadaEm])
}
```

- `Cliente.nivel NivelDoCliente?` (migration), editável no cadastro (aba Geral, `EscolhaDoTipo` com 4 opções + "Sem
  nível"), mostrado como selo no pedido e na lista.
- `ConfigCanal` ganha `taxas Json?` para a LI e o Bling: `{pagamento: [{tipo, percentual, fixa}], padrao: {percentual, fixa}}`
  (a LI cobra pelo meio de pagamento, não por venda; o Bling direto não tem taxa). Editável numa aba "Taxas" da tela de
  Configurações do canal; vazio = taxa 0 e a parcela do lucro real fica marcada `fonte: "estimado"`.
- `.env`: `NFE_EMISSAO=false` (trava) e `PEDIDOS_DESDE=2026-11-01` (o corte, para o teste e para um dia mudar sem código).

### 5.2 Leitura por origem (worker, rotina `pedidos`, a cada 5 min)

A rotina roda nos moldes de `rodarRotina` (Saúde do Rise registra) e grava um cursor por origem em `RotinaDoWorker`
(`ultimaAlteracaoLida`), para pedir só o que mudou. Falha numa origem não para as outras. Cada pedido lido passa pela
mesma função `aplicarPedidoLido(pedidoNormalizado)` que cria ou atualiza o `PedidoDeVenda`, o cliente, os itens, o status,
as peças e o lucro, numa transação.

**Mercado Livre** (`src/lib/pedidos/ml.js`)
- Carga inicial: `GET /orders/search?seller=<id>&order.date_created.from=2026-11-01T00:00:00.000-03:00&sort=date_asc`,
  paginando por `offset`/`limit=50`. Depois: `order.date_last_updated.from=<cursor − 10 min>`.
- Para cada order: `GET /orders/{id}` (itens com `sale_fee`, `payments`, `shipping.id`, `pack_id`, `status`, `tags`),
  `GET /orders/{id}/billing_info` (documento do comprador: `billing_info.doc_type`/`doc_number`; medir no 1º pedido real se
  o nome vem aqui ou em `buyer`), `GET /shipments/{shipping.id}` com `?views=destination` e `X-Api-Version: 2` (status,
  substatus, `tracking_number`, `logistic_type`, `shipping_option.name`, `order_cost` = custo do vendedor,
  `shipping_option.cost` = o que o comprador pagou, `receiver_address`), `GET /users/{id}/invoices/orders/{order_id}`
  (a NF do emissor do ML; 404 = ainda não emitida).
- Pedido do mesmo `pack_id`: cada order vira um `PedidoDeVenda`, ligados pelo `packId` (o envio e a NF são do pack; a
  tela mostra "Carrinho com N pedidos").
- Dedup com o Bling: o Rise **não lê** do Bling os pedidos com `loja.id` ∈ {206326819 Rise_ML, 203593931 ML_4h}; o
  espelho (`blingPedidoId`/`blingNumero`) é preenchido quando o Bling devolve `numeroLoja` igual ao order id.

**Loja Integrada** (`src/lib/pedidos/li.js`)
- Carga inicial: `GET /v1/pedido/search?since_criado=2026-11-01T00:00:00&limit=100` (paginando por `offset`). Depois:
  `since_atualizado=<cursor − 10 min>`.
- Para cada pedido: `GET /v1/pedido/{numero}` (cliente com `cpf`/`cnpj`, `endereco_entrega`, `itens` com `sku` e
  `produto.id_externo`, `pagamentos`, `envios` com `objeto` = rastreio, `situacao.codigo`, `valor_*`),
  `GET /v1/situacao_historico/search?numero=` (o histórico), e a NF: a LI não devolve o id da NF no pedido na OpenAPI;
  o construtor mede no 1º pedido real onde o `pedido_nf` aparece (campo do pedido ou `/v1/pedido_nf/{id}` por busca) e
  grava `nf.urlPdf`/`urlXml` de `url`/`url_xml`.
- **Etiqueta do Enviali** (o serviço de frete da LI que o dono usa): `GET /enviali/v2/postage?search=<numero do pedido>`
  (header `x-correlation-id` com um UUID) devolve a etiqueta com `estimate.price` (a estimativa ao gerar), `postage.price`
  (o cobrado depois de postar), `postage.status` (created, billed, cancelling, cancelled, posted), `tracking_code`,
  `tracking_status` (posted, transit, delayed, returned, lost, delivered, pickup, delivering, damaged, seized, disposed,
  returning) e `service_name` (PAC, SEDEX). Valores em **centavos**. Sem etiqueta ainda = frete estimado. Pedido com mais de
  uma etiqueta (cancelada e refeita): vale a que não está cancelada, a mais recente.
- `GET /v1/situacao` uma vez por dia: a lista de códigos da loja, guardada em `ConfigCanal` da LI, para o mapeamento (5.7)
  reconhecer código novo ("!" `statusDesconhecido`).
- Dedup com o Bling: não lê do Bling os pedidos com `loja.id` = 203478870 (`LOJA_LI_NO_BLING`); espelho pelo `numeroLoja`.

**Bling** (`src/lib/pedidos/bling.js`)
- Carga inicial: `GET /pedidos/vendas?dataInicial=2026-11-01&dataFinal=<hoje>&limite=100&pagina=N`. Depois:
  `dataAlteracaoInicial=<cursor − 1 dia>` (a granularidade do filtro é dia).
- Regra da loja: `loja.id` ausente ou 0 → canal BLING (pedido digitado no Bling). `loja.id` das lojas do ML ou da LI →
  **só espelho** (grava `blingPedidoId` no pedido correspondente, se já existir; senão guarda numa lista de espelhos
  pendentes casada na leitura seguinte). Qualquer outra loja (Shopee, ML_4h antigo que não seja o Rise_ML, etc.) →
  **ignorado**: não vira pedido; a rotina conta "N pedidos ignorados da loja <nome>" na Saúde do Rise (`GET /canais-venda`
  uma vez por dia dá o nome), para o dono ver que há venda que o Rise não lê.
- Para cada pedido: `GET /pedidos/vendas/{id}` (contato com `numeroDocumento`, itens com `produto.id`, `parcelas` com
  `formaPagamento.id` → nome por `GET /formas-pagamentos` lido uma vez por dia, `transporte` com volumes e rastreio,
  `situacao.id` → nome por `GET /situacoes/modulos/{Vendas}`, `notaFiscal.id`), e com `notaFiscal.id`: `GET /nfe/{id}`
  (`xml`, `linkDanfe`, `linkPDF`, `chaveAcesso`, `numero`, `serie`, `situacao`).

### 5.3 Cliente automático

- Documento = `cpf`/`cnpj` (LI), `doc_number` (ML), `numeroDocumento` (Bling), formatado por `lib/documentos.js`.
- Casa por `Cliente.documento`; existindo, só preenche o que estava vazio (telefone, e-mail) e **nunca sobrescreve** nome
  ou endereço de um cliente que o dono editou. Não existindo, cria `Cliente` (tipo pela quantidade de dígitos, nome,
  telefone no padrão do Rise, e-mail) com `ClienteEndereco` GERAL = o endereço de entrega do pedido e `observacoes` =
  "Criado pelo pedido <canal> <número>".
- Sem documento (o ML às vezes não libera, ou o pedido é de empresa sem CNPJ no cadastro): `clienteId` nulo, aviso
  `clienteSemDocumento`, e no pedido um botão "Vincular cliente" (busca por nome/documento ou "Criar com este nome").
- Documento inválido (dígito verificador): cria mesmo assim, com aviso `documentoInvalido` no pedido e no cliente
  (`observacoes`), porque a venda existe e precisa de cliente; o dono corrige.

### 5.4 Itens e o vínculo com o Produto

- ML: `Anuncio` com `canal MERCADO_LIVRE` e `idExterno = MLB` → `produtoId`; falhando, `Produto.sku = seller_sku`.
  Kit no ML (anúncio com `composicao` no editor): o item é o produto base com `quantidade × N`; a tela mostra "N×" do kit.
- LI: `Anuncio` LI com `idExterno = produto.id_externo` → produto; falhando, `Produto.sku = sku`.
- Bling: `Produto.blingId = itens[].produto.id`; falhando, `Produto.sku = codigo`.
- Sem casar: `produtoId` nulo, aviso `produtoForaDoRise`, custo vazio (o lucro desse item fica "em aberto"; o do pedido
  mostra "parcial" e `lucroFechado` nunca vira true).
- `conferido` = `Produto.conferido` no dia; aviso `produtoNaoConferido` quando false (só ML e LI, como o dono pediu).

### 5.5 Aguardando peças

Recalculado a cada leitura do pedido enquanto o status for PAGO/AGUARDANDO_PECAS/EM_SEPARACAO (parado em ENVIADO e
depois). Para cada item com produto no Rise:

1. **Necessidade:** produto simples = quantidade; kit (`tipo COMPOSICAO`) = cada componente × quantidade; produto com
   `pecasProprias` = cada `PecaPropriaDoProduto` com `componenteId` × quantidade (peça só descrita, sem produto, não conta).
2. **Saldo:** `Produto.estoque` (o saldo do Bling relido de hora em hora com os ajustes pendentes, `blingSync/estoque.js`)
   **menos** o que os outros pedidos abertos (PAGO/AGUARDANDO_PECAS/EM_SEPARACAO, mais antigos) já precisam da mesma peça.
   Isso evita dois pedidos achando que a última unidade é deles.
3. **Falta** = necessidade − saldo, quando > 0. Previsão da falta, nesta ordem: `ItemDoPedidoDeCompra` em pedido ENVIADO ou
   ENTREGA_PARCIAL do mesmo produto (data de envio + `prazoDias`; sem prazo: "pedido PC-0015 enviado em dd/mm, sem prazo");
   `OrdemDeProducao` aberta que produz o item ("em produção, ordem OP-0003"); senão "sem previsão" em âmbar.
4. Resultado em `PedidoDeVenda.pecas`: `[{produtoId, sku, nome, necessario, disponivel, falta, previsao, previsaoOrigem}]`.
   Qualquer `falta > 0` → status AGUARDANDO_PECAS (sobrepõe PAGO; não sobrepõe cancelado/enviado). Quando a falta zera, o
   status volta ao mapeado da origem.

Na tela: aba "Peças" do pedido com uma linha por peça (tem / falta / previsão), e na lista o status "Aguardando peças"
com o `title` "falta 2× 900211 (previsão 12/11)".

### 5.6 Lucro estimado e lucro real

**Fórmula (a mesma de `custosDoAnuncio`):**
`lucro = receita − comissão − tarifaFixa − frete − imposto − custo`, com `receita = total dos produtos` (o frete cobrado do
comprador entra como receita **e** o frete pago entra como custo, para o pedido com frete por conta do cliente não parecer
mais lucrativo do que é), `imposto = receita × IMPOSTO_PADRAO (6%)`, `custo = Σ custoUnitarioCongelado × quantidade`.

**Estimativa (congelada na primeira leitura do pedido, nunca recalculada):**
- ML: `custosDoAnuncio` sobre o rascunho do `Anuncio` ML casado (preço do anúncio, `percentual`, `tarifaFixa` e `frete`
  gravados no `dados` do anúncio, custo do produto) — o mesmo número que o editor mostra. Anúncio sem rascunho no Rise →
  estimativa vazia, aviso `semEstimativa`.
- LI e Bling: `lucroLiquido(precoVenda, custo)` × quantidade, o "Lucro na loja" do editor (sem taxa), mais o frete que o
  dono configurar como padrão nas Taxas (fase 1: zero).
- `origem` da estimativa guardada para a tela dizer "estimativa do editor do ML de 03/11".

**Real (recalculado a cada leitura até `lucroFechado`):**
- ML: `comissao = Σ sale_fee × quantidade` (fonte `pedido`); `frete = shipments.order_cost` (fonte `envio`; 0 enquanto o
  envio não existe, marcado `estimado`); `receita = total_amount` (já líquida de desconto do vendedor; cupom do ML não
  tira do vendedor: `discounts[].amounts.seller`); `custo` = congelado.
- LI: `comissao = taxa da forma de pagamento` de `ConfigCanal.taxas` (fonte `config`; sem taxa cadastrada = estimada);
  `frete = etiqueta do Enviali` (`postage.price` depois de postada, senão `estimate.price`, fonte `etiqueta`; sem etiqueta
  ainda, `estimado`). Nada de digitar frete na LI (decisão do dono em 04/11/2026). Forma de envio que não é Enviali
  (retirada, combinar) = frete 0, fonte `pedido`.
- Bling: sem comissão; `frete = custoDoFreteManual` (o operador digita o que pagou; enquanto não digita, `estimado`).
- `lucroFechado = true` quando status ENTREGUE ou FINALIZADO e nenhuma parcela está `estimado`. Depois de fechado, nada
  recalcula (uma mudança no custo do produto não muda uma venda já fechada).

**Custo congelado:** a ordem do `FotoMensalProduto`: fornecedor padrão confirmado → `fornecedorRascunho.precoCusto` do Bling →
`Produto.custo`; kit = soma das peças; `pecasProprias` = o custo calculado da produção. Nulo → aviso `semCusto`.

**Divergência:** `|lucroReal − lucroEstimado| > max(R$ 1,00, 5% × |lucroEstimado|)` → aviso `lucroDivergente` e "!" na
lista; a aba Lucro mostra as duas colunas e marca em âmbar a parcela que mais pesou na diferença. Só compara quando os
dois existem.

**Devolução no ML (pedido do dono em 04/11/2026; só no ML, as outras origens ficam como estão):**
- **Como o Rise sabe:** o pedido ganha um envio de tipo `return` em `GET /orders/{id}/shipments` (ou a tag `refunded`).
  Com o retorno entregue ao vendedor (`status` delivered do envio `return`), o pedido vai para **DEVOLVIDO**, mesmo que já
  estivesse ENTREGUE/FINALIZADO com o lucro fechado: a devolução **reabre e refaz** o lucro (é a única exceção ao "fechado
  não muda").
- **O lucro sai do balanço:** receita, comissão, tarifa, imposto e custo do produto zeram no `real` (o produto volta ao
  estoque e o ML devolve a comissão); a estimativa fica guardada só para consulta e **não** entra na comparação (sem
  `lucroDivergente`). `lucroReal = − custoDoFreteDeRetorno`.
- **Frete de retorno pago pelo vendedor = prejuízo:** lido no envio `return` (`GET /shipments/{id}` do retorno, o mesmo
  `order_cost` do envio de ida: o que saiu do vendedor; 0 quando o ML ou o comprador bancou). O frete de ida **não** entra
  no prejuízo (o dono só citou o de retorno). Se a primeira devolução real mostrar que o custo do retorno não vem na API,
  o construtor abre o campo "Frete de retorno pago" **só para pedido DEVOLVIDO do ML** (`custoDoRetornoManual`); até lá o
  campo não existe.
- **"!" para cancelar a NF:** pedido DEVOLVIDO do ML com NF autorizada no emissor do ML → aviso `nfACancelar` ("Pedido
  devolvido: cancele a NF no ML") e "!" na lista; some quando `GET /users/{id}/invoices/orders/{order_id}` devolver a NF
  cancelada. O Rise não cancela a NF (fica para o dono, no ML).
- A aba Lucro mostra a linha "Devolvido em dd/mm" com o frete de retorno em vermelho; a lista mostra o lucro negativo.

### 5.7 Status unificado

Tabelas em `src/lib/pedidos/status.js` (dado, não código espalhado); código desconhecido → mantém o status anterior,
aviso `statusDesconhecido`.

| Rise | ML (`order.status` + envio) | LI (`situacao.codigo`) | Bling (nome da situação) |
| --- | --- | --- | --- |
| AGUARDANDO_PAGAMENTO | confirmed, payment_required, payment_in_process, partially_paid | pedido_efetuado, aguardando_pagamento | Em aberto, Em digitação |
| PAGO | paid + envio pending/handling | pedido_pago | Em andamento, Verificado |
| EM_SEPARACAO | (manual `emSeparacao`) ou envio ready_to_ship | pedido_em_separacao | (manual) |
| ENVIADO | paid + envio shipped | pedido_enviado | Atendido com rastreio |
| ENTREGUE | envio delivered | pedido_entregue | Atendido com `dataSaida` + 15 dias |
| FINALIZADO | delivered há 30 dias sem reclamação (tag `not_delivered` ausente) | situação `final` e aprovado | (igual à coluna ao lado) |
| CANCELADO | cancelled, invalid, pending_cancel | pedido_cancelado | Cancelado |
| DEVOLVIDO | envio type return delivered / tag `refunded` | pedido_devolvido (se existir na loja) | — |

Status do envio (`StatusDoEnvio`): ML pelo `shipments.status` (pending→A_POSTAR, handling/ready_to_ship→A_POSTAR,
shipped→EM_TRANSITO (substatus `in_hub`/`delayed` no `title`), delivered→ENTREGUE, not_delivered→NAO_ENTREGUE,
cancelled→CANCELADO; envio `return` entregue→DEVOLVIDO); LI pelo `tracking_status` do Enviali (sem etiqueta ou
created/billed→A_POSTAR, posted→POSTADO, transit/delayed/delivering/pickup→EM_TRANSITO (o detalhe no `title`),
delivered→ENTREGUE, returned/returning/lost/damaged/seized/disposed→NAO_ENTREGUE, cancelled→CANCELADO), e sem Enviali pela
situação (pedido_enviado→EM_TRANSITO, pedido_entregue→ENTREGUE); Bling pelos volumes (sem rastreio→A_POSTAR, com
rastreio→POSTADO, `dataSaida`→EM_TRANSITO). Pedido sem envio (retirada, "a combinar") → SEM_ENVIO.

### 5.8 NF e XML

- Aba "Nota fiscal" do pedido: número, série, chave, data, status, botões **Baixar NF (PDF)** e **Baixar XML**, que passam
  pelo servidor (`/api/pedidos/[id]/nf?tipo=pdf|xml`): ML baixa `xml_location` com o token (a URL é da API e precisa do
  Bearer); LI redireciona para `url`/`url_xml`; Bling redireciona para `linkPDF`/`linkDanfe` e serve `xml` quando vem
  inline. Sem NF: "NF ainda não emitida em <canal>" e o link para a tela do canal.
- **Criar NF** (preparado, desligado): botão desabilitado com `title` "Emissão desligada (NFE_EMISSAO)". O código por trás
  (`src/lib/pedidos/nf.js`): Bling = `POST /pedidos/vendas/{id}/gerar-nfe` + `POST /nfe/{id}/enviar`; ML =
  `POST /users/{id}/invoices/orders/{order_id}` (emissor do ML; exige as regras tributárias cadastradas lá); LI = não há
  emissão pela API v1 (só inserir NF de terceiro em `/v1/integration/pedido/nf`), então na LI o botão diz "Emitir no painel
  da LI". Tudo atrás de `exigirTravaLiberada("NFE")`, que recusa com `NFE_EMISSAO` false, e dos acessos
  (`acao.pedidos.emitirNF`). Teste cobre a recusa.

### 5.9 Avisos ("!")

`avisos` guarda chaves; a tela traduz. Chaves: `clienteSemDocumento`, `documentoInvalido`, `produtoForaDoRise`,
`produtoNaoConferido`, `semCusto`, `semEstimativa`, `lucroDivergente`, `statusDesconhecido`, `lojaDesconhecida`,
`fraude` (tag `fraud_risk_detected` do ML: vermelho, "não envie"), `espelhoNoBlingAusente` (pedido do ML/LI sem cópia no
Bling depois de 1 h: o Bling não importou e o estoque não baixou), `nfACancelar` (só ML: pedido DEVOLVIDO com NF autorizada, "cancele a NF no ML"; some quando a NF aparece cancelada). O ícone do canal na lista leva o "!" no canto, como em
Produtos; o `title` lista os motivos.

### 5.10 Telas

Linha-guia (Padrão visual): **nesta tela o operador vê primeiro os pedidos que pedem ação (aguardando peças, "!", a
postar) e a ação principal é abrir o pedido.**

**Lista (`/pedidos`)**, bloco com um cartão só por enquanto ("Pedidos de venda"; o cartão "Pedidos de compra" continua em
Compras). Tabela paginada (25/100, `NavegacaoDoTopo`), filtros compactos no topo: busca (número, cliente, documento,
código do produto), período (padrão: últimos 30 dias), canal (os ícones, como o filtro de Canais de Produtos), status
(múltiplo), "só com !". Colunas, ordenáveis: canal (ícone com "!"), número (link), data, cliente (nome + selo do nível),
itens (foto do 1º com `FotoComLupa` + "e mais N"), total, pagamento (ícone/abreviação + parcelas), status (ponto + texto,
`title` com o da origem), envio (tipo + status, rastreio no `title`), lucro (real quando fechado, senão estimado em
`text-suave` com "~"; vermelho se negativo; "!" se divergente). Ordem padrão: data decrescente. Linhas com "!" ou
AGUARDANDO_PECAS vêm com o fundo âmbar suave (regra 8: marcação visível).

**Pedido (`/pedidos/[id]`)**, página com `PageHeader` (número, canal, data, status) e abas lado a lado: **Geral** (cliente
com link para o cadastro e o selo, documento, contato, endereço de entrega; pagamento; totais), **Itens** (foto, nome,
código, Rise/Conferido como ícones, quantidade, preço, custo congelado, comissão), **Peças** (só quando há falta ou o
status é AGUARDANDO_PECAS), **Envio** (tipo, serviço, rastreio com link, status com histórico de datas, custo do vendedor
(ML: do envio; LI: da etiqueta do Enviali, "estimativa" até postar) e o campo "Custo real do frete" editável **só no Bling**), **Lucro** (estimativa × real lado a lado, parcela a parcela, com
a fonte de cada número em `text-suave`, e a divergência em âmbar), **Nota fiscal** (5.8), **Histórico** (status da origem
com datas). Rodapé: "Abrir no <canal>" (link), "Abrir no Bling" (quando há espelho), "Marcar em separação" (único
botão de estado), e o "Criar NF" desabilitado. Nada de texto fixo explicativo; bolhas "i" no lucro (a fórmula) e no
status (o da origem).

**Cadastro de Cliente:** campo "Nível" (Bronze/Prata/Ouro/Platinum/Sem nível) na aba Geral, e a aba **Pedidos** (lista
dos pedidos do cliente, as mesmas colunas da lista, sem o cliente).

### 5.11 Webhooks (fase 2)

- Rota pública `POST /api/webhooks/[origem]` (`mercado-livre`, `loja-integrada`, `bling`), fora do login (exceção no
  `Caddyfile` ao lado do `/mcp`; na VPS o Tinyauth protege o resto). A rota só **grava** `NotificacaoDePedido` e responde
  200 (o ML exige < 500 ms; o Bling < 5 s). O worker processa a fila a cada 5 s, chamando a mesma leitura por pedido da
  fase 1 (`lerPedidoDaOrigem(origem, id)`), e a rotina de 5 min continua como rede de segurança.
- ML: tópicos `orders_v2` e `shipments` no DevCenter com a URL `APP_URL_PUBLICA/api/webhooks/mercado-livre`. Não há
  assinatura: a rota confere `user_id` = o seller da `Conexao` e `application_id` = `ML_CLIENT_ID`, e o worker lê o
  recurso com o próprio token (notificação falsa não produz nada).
- Bling: aba Webhooks do app com `order` e `invoice`; a rota valida `X-Bling-Signature-256` (HMAC-SHA256 do corpo com
  `BLING_CLIENT_SECRET`), responde 200 também ao duplicado, e ignora `companyId` diferente do da conexão.
- LI: `PUT /webhooks/v1/pedido {notifyUrl, token}` feito pelo botão "Ligar notificações" no cartão da LI em Integrações;
  o token é gerado pelo Rise, guardado cifrado em `Conexao` (`segredoCifrado` da LI já é um JSON) e conferido no header.
  O corpo da notificação da LI não está na OpenAPI: o construtor mede com o 1º pedido e, na dúvida, trata qualquer
  notificação como "reler os pedidos alterados desde o cursor".
- No PC nada chega: o cartão "Servidor VPS" mostra "Notificações: só na VPS".

### 5.12 Worker, carga inicial e registro

- Rotina `pedidos` (5 min) no worker normal (não no do PC). Primeira volta: carga desde `PEDIDOS_DESDE` em cada origem,
  em lotes, respeitando as filas de ritmo (ML: ~3 chamadas por pedido; 200 pedidos ≈ 600 chamadas, dentro do limite);
  as seguintes: só alterados. Saúde do Rise ganha a linha "Pedidos" (última leitura, lidos, erros).
- Cada chamada vai ao `LogIntegracao` como hoje. Erro num pedido (404, JSON estranho) não para a rotina: grava o aviso
  `leituraFalhou` no pedido (se existir) e segue.
- Telegram (C1): aviso "Nova venda <canal> <número>, <cliente>, R$ <total>" e "Pedido <número> aguardando peças" (um por
  pedido), ligáveis na aba Canais.

### 5.13 MCP

Ferramentas só de leitura: `listarPedidosDeVenda({desde, ate, canal, status, clienteId, busca})` e
`lerPedidoDeVenda(id)` (sem documento completo do cliente: só os 3 últimos dígitos), para o Claude/ChatGPT responder
"quanto vendi na semana" e "o pedido X está onde". Registradas em `ChamadaMcp` como as demais.

### 5.14 Acessos

`tela.pedidos` (ver/editar) já existe. Novas: `acao.pedidos.marcarSeparacao`, `acao.pedidos.editarCustoDoFrete`,
`acao.pedidos.vincularCliente`, `acao.pedidos.emitirNF` (desligada pela trava mesmo com acesso), `acao.pedidos.baixarNF`.
Quem não vê custos (`dados.custos`) não vê a coluna Lucro nem a aba Lucro, e o custo congelado some dos itens.

### 5.15 Testes

`npm run teste:pedidos` (Postgres local, SEM rede; só escreve `ZZ-PED-*`): normalização de cada origem a partir de
respostas gravadas (fixtures com os JSONs reais mascarados, assim que houver o 1º pedido real de cada canal; até lá, os
exemplos da documentação), dedup pelo `numeroLoja`, cliente automático (existe/não existe/sem documento/inválido),
casamento dos itens, aguardando peças (simples, kit, peças próprias, dois pedidos disputando a mesma peça, previsão pelo
pedido de compra e pela ordem de produção), lucro estimado e real por canal, divergência e tolerância, `lucroFechado`,
mapeamento de status (inclusive código desconhecido), NF por origem (download e a recusa da emissão pela trava), a rota
de webhook (assinatura do Bling, token da LI, `user_id` do ML), o cursor da rotina e a leitura que falha num pedido e
segue. ML falso, LI falsa e Bling falso ganham `/orders/search`, `/orders/{id}`, `/billing_info`, `/shipments/{id}`,
`/invoices/orders/{id}`, `/v1/pedido/search`, `/v1/pedido/{id}`, `/v1/situacao`, `/v1/pedido_nf/{id}`,
`/enviali/v2/postage` (com e sem etiqueta, cancelada e refeita, estimativa × postada), `/pedidos/vendas`,
`/pedidos/vendas/{id}`, `/nfe/{id}`; a devolução do ML (envio `return` entregue depois do lucro fechado, com e sem frete de retorno, NF autorizada → `nfACancelar` → NF cancelada → aviso some).

## 6. Fases de entrega

1. **Pedidos, cliente, status, peças e lucro** (5.1 a 5.7 com a devolução do ML, 5.9, 5.10, 5.12, 5.14, 5.15): a lista e o pedido no ar, lendo
   pelo worker. É a entrega que o dono testa primeiro.
2. **NF/XML e webhooks** (5.8 download, 5.11): baixar NF e XML e o "!" `nfACancelar` da devolução (depende de ler a NF); notificações do ML, da LI e do Bling na VPS; Telegram.
3. **Emissão preparada e desligada** (5.8 emissão), MCP (5.13), nível do cliente na aba Pedidos do cadastro.

## 7. O que fica para o construtor

- Nomes de arquivo e a divisão em `src/lib/pedidos/` (`banco.js`, `ml.js`, `li.js`, `bling.js`, `status.js`, `lucro.js`,
  `pecas.js`, `cliente.js`, `nf.js`, `webhooks.js`) e `src/components/pedidos/`.
- O desenho exato das abas e das colunas dentro do Padrão visual (o dono pediu "use UI/UX" em 04/11/2026: chamar `frontend-design` e revisar com
  `make-interfaces-feel-better`).
- Medir no 1º pedido real de cada canal o que a documentação não fixa: onde a LI expõe o id da NF e o corpo do webhook
  dela; se `sale_fee` do ML é por unidade; se o nome do comprador do ML vem em `billing_info` ou em `buyer`. Cada medição
  vira linha no CLAUDE.md.
- Fixtures mascaradas dos JSONs reais depois da 1ª leitura na VPS.

## 8. Decisões tomadas por mim (para o dono conferir)

1. **Documento obrigatório = CPF ou CNPJ**, não só CPF: comprador pessoa jurídica existe nos três canais.
2. **Shopee fica fora até ter integração própria** (dono, 04/11/2026: "deve ser coletada diretamente na Shopee"); pedido
   do Bling de loja que não é ML nem LI é ignorado e contado na Saúde do Rise.
3. **Tolerância do "!" do lucro: R$ 1,00 ou 5% da estimativa, o que for maior.**
4. **"Em separação" é o único passo manual**; o resto do status vem da plataforma. O Rise não escreve status em canal nenhum.
5. **Aguardando peças é automático** e desconta o que os pedidos abertos mais antigos já precisam da mesma peça.
6. **Frete real da LI vem da etiqueta do Enviali** (`/enviali/v2/postage`, estimativa ao gerar e preço ao postar); **só no
   Bling o frete é digitado** (dono, 04/11/2026); até existir etiqueta ou valor digitado, a parcela conta como estimada.
7. **Lucro fecha em Entregue/Finalizado** e não muda mais, mesmo que o custo do produto mude depois.
8. **Corte em 01/11/2026 no `.env`** (`PEDIDOS_DESDE`), para o teste e para mudar sem código.
9. **Cupom do ML pago pelo ML não reduz a receita** (`discounts[].amounts.seller` é o que sai do vendedor).
10. **Webhooks ficam para a fase 2 nas três origens** (a LI tem webhook de pedido, confirmado na OpenAPI).
11. **Devolução no ML zera receita, comissão, imposto e custo e deixa só o frete de retorno como prejuízo** (dono, 04/11/2026);
    o frete de ida pago pelo vendedor NÃO entra (ele só citou o de retorno; incluir é uma linha). A devolução reabre o lucro
    fechado. LI e Bling não tratam devolução (só o status, quando a loja tiver o código).
12. **O Rise não cancela NF**: na devolução do ML só avisa ("!" `nfACancelar`) e apaga o aviso quando a NF do ML aparece cancelada.
