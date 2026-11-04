# Módulo Pedidos de venda (fase 1) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloco "Pedidos" no Rise: toda venda do Mercado Livre, da Loja Integrada e do Bling desde 01/11/2026 numa lista e num pedido completo, com cliente automático, status unificado (inclusive Aguardando peças), lucro estimado congelado × lucro real com "!", devolução do ML, lida pelo worker a cada 5 min.

**Architecture:** Tabelas próprias (`PedidoDeVenda`, `ItemDoPedidoDeVenda`) no molde do Compras. Cada origem tem um **normalizador puro** (JSON da API → `PedidoNormalizado`, sem banco) e uma **leitura** (quais pedidos pedir, com cursor); tudo converge em `aplicarPedidoLido(normalizado)`, uma transação que cria/atualiza pedido, cliente, itens, status, peças e lucro. Regras puras (status, lucro, peças, etiqueta do Enviali) em arquivos sem imports de banco, testadas contra respostas gravadas; a leitura é testada contra o ML falso, a LI falsa e o Bling falso.

**Tech Stack:** Next 16.4.2 (App Router, Server Actions), React 19, Prisma 7 + Postgres 17, Tailwind v4, lucide-react, zod. JavaScript (sem TypeScript).

**Spec:** `docs/superpowers/specs/2026-11-04-modulo-pedidos-de-venda-design.md` (aprovada pelo dono em 04/11/2026, commit 11393a1). **Este plano cobre a fase 1 (seção 6, item 1).** NF/XML para baixar, webhooks e Telegram (fase 2) e emissão preparada, MCP e aba Pedidos do cliente (fase 3) ganham planos próprios depois. Ler a spec antes de cada tarefa.

## Global Constraints

- JavaScript; identificadores e comentários em português SEM acento; texto de tela COM acento. Comentário explica o porquê.
- Migration só aditiva, gerada por `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`, **tirando as linhas `DROP INDEX`** de índices que só existem no SQL (trigramas, `ProdutoColetado_coletadoEm_idx`, `Job_fonte_aberta`, `Anuncio_um_por_produto`, busca ampla). Depois: `npx prisma migrate deploy`, `npx prisma generate` **e reiniciar o servidor e o worker**.
- Toda página confere acesso (`exigirAcessoNaPagina`), toda Server Action na 1ª linha (`negarSemAcesso`/`executarComAcesso`); o guarda do `npm run teste:acessos` precisa continuar passando.
- **Fase 1 não escreve em canal nenhum**: só `GET` no ML, na LI e no Bling. Nenhum `exigirEscrita`.
- Corte: `PEDIDOS_DESDE=2026-11-01` no `.env` (pedido criado antes é ignorado, inclusive alteração dele). Trava `NFE_EMISSAO=false` no `.env` (fase 1 só a lê para desabilitar o botão).
- Dedup com o Bling: pedido do Bling com `loja.id` ∈ {`206326819` (Rise_ML), `203593931` (ML_4h), `203478870` (LI)} é **só espelho**; `loja.id` ausente ou `0` = pedido do Bling; qualquer outra loja = ignorado e contado.
- Lucro: `lucro = receita − comissão − tarifaFixa − frete − imposto − custo`, `imposto = receita × 0.06` (`IMPOSTO_PADRAO`), `receita = total` do pedido (produtos + frete cobrado − desconto), `custo = Σ custoUnitarioCongelado × quantidade`. Tolerância do "!": `|real − estimado| > max(1.00, 0.05 × |estimado|)`. Frete real: ML `order_cost` do envio; LI `postage.price` (postada) senão `estimate.price` da etiqueta do Enviali, centavos ÷ 100; Bling `custoDoFreteManual`. Sem valor = parcela `fonte: "estimado"`.
- Devolução **só no ML**: envio `type: "return"` com `status: "delivered"` (ou tag `refunded`) → status DEVOLVIDO, `real` com receita/comissão/tarifa/imposto/custo = 0 e `frete = custoDoRetorno` (o `order_cost` do envio de retorno, 0 quando não é do vendedor), `lucroReal = −custoDoRetorno`, `lucroFechado` reaberto, sem `lucroDivergente`. O frete de ida NÃO entra.
- "Em separação" é o único passo manual. Status desconhecido mantém o anterior + aviso `statusDesconhecido`.
- Dinheiro `Decimal(12,2)`; datas em UTC no banco; a tela mostra em `America/Sao_Paulo`.
- Telas: `frontend-design` + as 10 regras do Padrão visual do CLAUDE.md + `ecc:make-interfaces-feel-better` (o dono pediu "use UI/UX"); `Card`, `PageHeader`, `CabecalhoOrdenavel` + `NavegacaoDoTopo` (nasce em 25 por página), `FotoComLupa`, `BolhaDeAjuda`, janela com `role="dialog"` e `{...propsDoFundo(fechar)}`, `TextoCortadoAoClicar` já cobre `truncate`.
- Ícones de canal: os mesmos logos de `CANAIS` (`src/lib/canais.js`, 22 px), com o selo "!" no canto como em `LinhaProduto.jsx`; Shopee aparece no filtro desligada (`disponivel: false`).
- Testes: `npm run teste:pedidos` (Postgres local, SEM rede; só escreve `ZZ-PED-*`, "ZZ Ped *" e apaga no começo e no fim). Falsos em `scripts/lib/` (sem imports de `src/`).
- Commit: só os próprios arquivos (`git commit -- caminhos`; arquivo misto por `git apply --cached` dos próprios hunks), mensagem em português, terminando com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Nunca `.env`.

## Review Focus

1. **O mesmo pedido lido duas vezes (carga inicial e cursor sobreposto, ou alterado na origem)** → um só `PedidoDeVenda`, itens regravados sem duplicar, estimativa NÃO recalculada. Teste na Tarefa 9 (`segunda leitura atualiza sem duplicar`).
2. **Documento com máscara diferente da gravada** (ML manda `12345678909`, o Cliente tem `123.456.789-09`) → casa o mesmo cliente, não cria outro. Teste na Tarefa 5.
3. **Pedido cancelado na origem enquanto estava Aguardando peças** → CANCELADO vence e as reservas de peças dele somem para os outros pedidos. Teste na Tarefa 8 (`pedido cancelado libera a reserva`) e na Tarefa 4 (`ML cancelado vence separacao`).
4. **Etiqueta do Enviali cancelada e refeita** → vale a mais recente não cancelada; só canceladas = sem etiqueta (frete estimado). Teste na Tarefa 3.
5. **Devolução depois do lucro fechado** → reabre, zera as parcelas, frete de retorno negativo, sem `lucroDivergente`; o espelho no Bling e o cliente ficam. Teste na Tarefa 9.

---

### Task 1: Banco, configuração e o esqueleto do teste

**Files:**
- Modify: `prisma/schema.prisma` (enums e modelos no fim; `Cliente.nivel`; `ConfigCanal.taxas`; relações em `Produto` e `Cliente`)
- Create: `prisma/migrations/20261104_pedidos_de_venda/migration.sql`
- Modify: `src/lib/integracoes/config.js` (ler `PEDIDOS_DESDE` e `NFE_EMISSAO`)
- Modify: `.env.example` (as duas linhas, com comentário)
- Create: `scripts/teste-pedidos.js`
- Modify: `package.json` (`"teste:pedidos": "node scripts/teste-pedidos.js"`, depois de `teste:producao`)

**Interfaces:**
- Produces (Prisma): `prisma.pedidoDeVenda`, `prisma.itemDoPedidoDeVenda`; enums `StatusDoPedidoDeVenda {AGUARDANDO_PAGAMENTO PAGO AGUARDANDO_PECAS EM_SEPARACAO ENVIADO ENTREGUE FINALIZADO CANCELADO DEVOLVIDO}`, `StatusDoEnvio {SEM_ENVIO A_POSTAR POSTADO EM_TRANSITO ENTREGUE NAO_ENTREGUE DEVOLVIDO CANCELADO}`, `NivelDoCliente {BRONZE PRATA OURO PLATINUM}`; `Cliente.nivel NivelDoCliente?`; `ConfigCanal.taxas Json?`. Campos de `PedidoDeVenda` e `ItemDoPedidoDeVenda` exatamente os da spec 5.1 (`NotificacaoDePedido` fica para a fase 2). `PedidoDeVenda.cliente` com `onDelete: SetNull`; `ItemDoPedidoDeVenda.produto` com `onDelete: SetNull` (apagar um produto não pode levar a venda). Relações: `Cliente.pedidosDeVenda`, `Produto.itensDeVenda`.
- Produces: `config.pedidos.desde` (`Date`, UTC do `PEDIDOS_DESDE` às 00:00 de São Paulo, padrão `2026-11-01`) e `config.travas.nfe` (`boolean`, `NFE_EMISSAO === "true"`).
- Produces: `scripts/teste-pedidos.js` com `conferir(nome, obtido, esperado)` e `limpar()` (apaga `PedidoDeVenda` com `numero` começando por `ZZ-PED-`, produtos `ZZ-PED-*`, clientes com `documento` da lista de teste e nome "ZZ Ped *"), no molde de `scripts/teste-compras.js` (`register(resolver-alias.js)`). Flag `--manter` (como no `teste:aliexpress`) deixa os dados para conferir a tela.

- [ ] **Step 1: Escrever o teste que falha** em `scripts/teste-pedidos.js`:

```js
const criado = await prisma.pedidoDeVenda.create({ data: { origem: "MERCADO_LIVRE", canal: "MERCADO_LIVRE", idExterno: "ZZ-PED-1", numero: "ZZ-PED-1", dataDaVenda: new Date(), atualizadoNaOrigemEm: new Date(), statusDaOrigem: "paid", status: "PAGO", enderecoDeEntrega: {}, pagamento: [], envio: {}, historico: [], totalProdutos: 10, desconto: 0, freteCobrado: 0, total: 10 } });
conferir("pedido gravado com o padrao", [criado.statusDoEnvio, criado.emSeparacao, criado.lucroFechado, criado.avisos], ["SEM_ENVIO", false, false, []]);
conferir("config.pedidos.desde", config.pedidos.desde.toISOString(), "2026-11-01T03:00:00.000Z");
conferir("config.travas.nfe fechada", config.travas.nfe, false);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run teste:pedidos`
Expected: FALHA com `prisma.pedidoDeVenda is undefined` (ou erro do Prisma).

- [ ] **Step 3: Escrever o schema, gerar a migration, aplicar, gerar o client; `config.js`; `.env.example`; `package.json`.**

Índice único `@@unique([origem, idExterno])`; índices `[status]`, `[dataDaVenda]`, `[clienteId]`, `[canal, status]`, `[packId]`. Padrões: `statusDoEnvio SEM_ENVIO`, `emSeparacao false`, `lucroFechado false`, `avisos String[] @default([])`, `pagamento/envio/historico Json` sem padrão (quem grava manda).

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run teste:pedidos`
Expected: 3 `ok`, 0 FALHA. `npm run teste:acessos` continua verde.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261104_pedidos_de_venda/migration.sql src/lib/integracoes/config.js .env.example scripts/teste-pedidos.js package.json
git commit -m "feat(pedidos): tabelas de pedido de venda, nivel do cliente, taxas do canal e o corte PEDIDOS_DESDE"
```

---

### Task 2: Clientes HTTP com cabeçalhos e os três falsos com as rotas de pedidos

**Files:**
- Modify: `src/lib/integracoes/mercadolivre.js` (`chamar` aceita `headers` extras; `mlGet(caminho, params, { headers } = {})`)
- Modify: `src/lib/integracoes/lojaIntegrada/client.js` (`chamar` aceita `{ headers, base }`; `get(caminho, params, opcoes)`; `base: "raiz"` monta a URL em `https://api.awsli.com.br` SEM o `/v1`, para `/enviali/v2/...`)
- Modify: `src/lib/canaisDeVenda/ml/cliente.js` e `src/lib/canaisDeVenda/li/cliente.js` (repassam o 3º argumento do `get`)
- Modify: `scripts/lib/mlFalso.js`, `scripts/lib/lojaIntegradaFalsa.js`, `scripts/lib/blingFalso.js`
- Create: `scripts/lib/fixtures/pedidos/ml-order.json`, `ml-billing.json`, `ml-shipment.json`, `ml-shipment-return.json`, `ml-invoice.json`, `li-pedido.json`, `li-situacoes.json`, `li-historico.json`, `li-enviali.json`, `bling-pedido.json`, `bling-formas.json`, `bling-situacoes.json`, `bling-canais.json`, `bling-nfe.json` (os exemplos da documentação lida em 04/11/2026, com os campos que a spec 5.2 cita; nomes e documentos fictícios)
- Test: `scripts/teste-pedidos.js`

**Interfaces:**
- Produces: `mlGet(caminho, params, { headers })`; `clienteLI().get(caminho, params, { headers, base })`.
- Produces (ML falso, `criarMLFalso({ pedidos, envios, faturas, cobrancas })`): `GET /orders/search?seller=&order.date_created.from=&order.date_last_updated.from=&offset=&limit=&sort=` (filtra por `date_created`/`last_updated` ≥ o parâmetro, pagina, devolve `{ results, paging: { total, offset, limit } }`), `GET /orders/{id}`, `GET /orders/{id}/billing_info`, `GET /orders/{id}/shipments` (array com `type` forward/return), `GET /shipments/{id}`, `GET /users/{id}/invoices/orders/{order_id}` (404 quando não há). `falso.pedidos` (Map) editável pelo teste; `falso.chamadas` registra os `headers`.
- Produces (LI falsa, `criarLojaIntegradaFalsa({ pedidos, situacoes, historicos, etiquetas })`): `GET /pedido/search?since_criado=&since_atualizado=&limit=&offset=` (`{ meta: { total_count, limit, offset }, objects }`), `GET /pedido/{numero}`, `GET /situacao`, `GET /situacao_historico/search?numero=`, e com `base: "raiz"`: `GET /enviali/v2/postage?search=` (array da spec, preços em centavos). Campo `falhas` (`{ "GET /pedido/5001": 500 }`) faz a rota responder esse status. Rota com `/v1` à frente não existe no falso: o cliente real já prefixa.
- Produces (Bling falso, `criarBlingFalso({ pedidosDeVenda, formasDePagamento, situacoesDeVenda, canaisDeVenda, notas })`): `GET /pedidos/vendas?dataInicial&dataFinal&dataAlteracaoInicial&dataAlteracaoFinal&pagina&limite` (`{ data: [...] }`, lista resumida), `GET /pedidos/vendas/{id}`, `GET /formas-pagamentos`, `GET /situacoes/modulos`, `GET /situacoes/modulos/{id}`, `GET /canais-venda`, `GET /nfe/{id}`.

- [ ] **Step 1: Testes que falham** (`teste-pedidos.js`, seção "Falsos"):

```js
conferir("ML falso: search pagina e filtra", (await ml.get("/orders/search", { seller: "212386247", "order.date_created.from": "2026-11-01T00:00:00.000-03:00", limit: 50, offset: 0 })).dados.results.map((o) => o.id), [2000000001]);
conferir("ML falso: shipment com X-Api-Version", (await ml.get("/shipments/40000000001", { views: "destination" }, { headers: { "X-Api-Version": "2" } })).dados.order_cost, 18.12);
conferir("ML falso: fatura inexistente da 404", (await ml.get("/users/212386247/invoices/orders/2000000002")).status, 404);
conferir("LI falsa: pedido", (await li.get("/pedido/5001")).dados.cliente.cpf, "12345678909");
conferir("LI falsa: enviali pela raiz", (await li.get("/enviali/v2/postage", { search: "5001" }, { base: "raiz" })).dados[0].estimate.price, 1812);
// fixtures do Bling: 7001 digitado no Bling (loja ausente), 7002 espelho do ML 2000000001 (loja 206326819, numero "123"), 7003 espelho da LI 5001 (loja 203478870), 7004 da loja "Shopee 4hobby" (ignorado)
conferir("Bling falso: pedidos por data", (await bling.get("/pedidos/vendas", { dataInicial: "2026-11-01", dataFinal: "2026-11-30", pagina: 1, limite: 100 })).dados.data.map((p) => p.id), [7001, 7002, 7003, 7004]);
conferir("Bling falso: nfe", (await bling.get("/nfe/9001")).dados.data.chaveAcesso.length, 44);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run teste:pedidos`
Expected: FALHA com `ML falso: GET /orders/search nao suportado` (e os demais).

- [ ] **Step 3: Implementar** os cabeçalhos nos clientes reais (o `requisitar` já aceita `headers`: só juntar) e as rotas nos falsos, lendo das fixtures. Caminho desconhecido continua LANÇANDO.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run teste:pedidos` → todos `ok`. `npm run teste:anuncios-ml`, `teste:li-sync` e `teste:bling-sync` continuam verdes (os falsos mudaram).

- [ ] **Step 5: Commit**

```bash
git add src/lib/integracoes/mercadolivre.js src/lib/integracoes/lojaIntegrada/client.js src/lib/canaisDeVenda/ml/cliente.js src/lib/canaisDeVenda/li/cliente.js scripts/lib/mlFalso.js scripts/lib/lojaIntegradaFalsa.js scripts/lib/blingFalso.js scripts/lib/fixtures/pedidos scripts/teste-pedidos.js
git commit -m "feat(pedidos): cabecalhos nos clientes do ML e da LI e as rotas de pedidos nos tres falsos"
```

---

### Task 3: Normalizadores puros (ML, LI, Bling) e a etiqueta do Enviali

**Files:**
- Create: `src/lib/pedidos/normalizado.js` (o formato comum, documentado; `function vazio()` com todos os campos)
- Create: `src/lib/pedidos/ml.js` (`normalizarPedidoML`), `src/lib/pedidos/li.js` (`normalizarPedidoLI`, `escolherEtiquetaEnviali`), `src/lib/pedidos/bling.js` (`normalizarPedidoBling`, `classificarLojaDoBling`)
- Test: `scripts/teste-pedidos.js`

**Interfaces:**
- Produces: o `PedidoNormalizado` (todos os arquivos seguintes o consomem):
  ```
  { origem, canal, idExterno, numero, packId, blingPedidoId, blingNumero, dataDaVenda: Date, atualizadoNaOrigemEm: Date,
    comprador: { nome, documento (so digitos ou null), email, telefone (so digitos ou null) },
    enderecoDeEntrega: { nome, endereco, numero, complemento, bairro, cidade, uf, cep, referencia },
    statusDaOrigem, statusDaOrigemDetalhe, tags: string[],
    pagamento: [{ forma, tipo, parcelas, valor, valorPago, status, aprovadoEm }],
    envio: { tipo, servico, transportadora, rastreio, link, statusDaOrigem, substatus, situacaoDoPedido, custoDoVendedor,
             fonteDoCusto: "envio"|"etiqueta"|"pedido"|"estimado", cobradoDoCliente, prazo, historico: { postadoEm, entregueEm, ... } },
    devolucao: null | { entregueEm: Date, custoDoRetorno: number },
    totais: { totalProdutos, desconto, freteCobrado, total },
    itens: [{ ordem, codigoNaOrigem, idNaOrigem, titulo, quantidade, precoUnitario, desconto, total, comissao }],
    nf: null | { origem, idExterno, numero, serie, chave, emitidaEm, status, urlPdf, urlXml, xml },
    historico: [{ em: Date, statusDaOrigem }] }
  ```
- Produces: `normalizarPedidoML({ order, billing, shipments, shipment, retorno, invoice })` (`shipments` = o array de `/orders/{id}/shipments`; `shipment` = o `forward`; `retorno` = o `return` lido por `/shipments/{id}`, ou null); `normalizarPedidoLI({ pedido, historico, etiquetas })`; `normalizarPedidoBling({ pedido, formas, situacoes, nfe })`; `escolherEtiquetaEnviali(lista) → etiqueta | null` (a mais recente por `postage.date_time` com `postage.status !== "cancelled" && !== "cancelling"`); `classificarLojaDoBling(lojaId) → "bling" | "espelhoML" | "espelhoLI" | "outra"`.
- Valores do Enviali: `custoDoVendedor = (postage.status === "posted" ? postage.price : estimate.price) / 100`, `fonteDoCusto: "etiqueta"`; sem etiqueta: `custoDoVendedor: null, fonteDoCusto: "estimado"`; `envios[].forma_envio.tipo` que não é `enviali` (retirada/combinar): `custoDoVendedor: 0, fonteDoCusto: "pedido"`. `envio.situacaoDoPedido = situacao.codigo` (o status do envio sem Enviali vem daí).
- ML: `comissao` do item = `sale_fee × quantity`; `custoDoVendedor = shipment.order_cost` (`fonteDoCusto: "envio"`; sem shipment = null/`"estimado"`); `devolucao` quando `retorno?.status === "delivered"` ou `order.tags` tem `refunded`: `{ entregueEm, custoDoRetorno: retorno?.order_cost ?? 0 }`; `tags` copia `order.tags`.
- Bling: `canal` sempre `BLING`; `pagamento[].forma` pelo nome em `formas`; `statusDaOrigem` = nome da situação em `situacoes` (id → `valor`); `nf` de `nfe` quando veio (`chave: chaveAcesso`, `urlPdf: linkPDF`, `urlXml: null` e o `xml` inline em `nf.xml`); `envio.custoDoVendedor: null, fonteDoCusto: "estimado"` (o manual entra na Tarefa 9).

- [ ] **Step 1: Testes que falham** (seção "Normalizar"), com as fixtures da Tarefa 2 (`fx(nome)` lê o JSON):

```js
const ml1 = normalizarPedidoML({ order: fx("ml-order"), billing: fx("ml-billing"), shipments: [{ id: 40000000001, type: "forward" }], shipment: fx("ml-shipment"), retorno: null, invoice: fx("ml-invoice") });
conferir("ML: cabecalho", [ml1.origem, ml1.idExterno, ml1.numero, ml1.comprador.documento], ["MERCADO_LIVRE", "2000000001", "2000000001", "12345678909"]);
conferir("ML: item com comissao", [ml1.itens[0].quantidade, ml1.itens[0].comissao], [2, 25.9]);
conferir("ML: frete do vendedor do envio", [ml1.envio.custoDoVendedor, ml1.envio.fonteDoCusto, ml1.envio.rastreio], [18.12, "envio", "BR123456789BR"]);
conferir("ML: sem envio = estimado", normalizarPedidoML({ order: fx("ml-order"), billing: null, shipments: [], shipment: null, retorno: null, invoice: null }).envio.fonteDoCusto, "estimado");
conferir("ML: devolucao entregue com frete de retorno", normalizarPedidoML({ order: fx("ml-order"), billing: null, shipments: [], shipment: fx("ml-shipment"), retorno: fx("ml-shipment-return"), invoice: null }).devolucao, { entregueEm: new Date("2026-11-20T14:00:00.000Z"), custoDoRetorno: 22.5 });
conferir("ML: nf do emissor", [ml1.nf.numero, ml1.nf.status, ml1.nf.urlXml], ["1234", "authorized", "/users/212386247/invoices/documents/xml/555/authorized"]);
const li1 = normalizarPedidoLI({ pedido: fx("li-pedido"), historico: fx("li-historico"), etiquetas: fx("li-enviali") });
conferir("LI: cliente e endereco", [li1.comprador.documento, li1.enderecoDeEntrega.cep, li1.statusDaOrigem, li1.envio.situacaoDoPedido], ["12345678909", "95090970", "pedido_pago", "pedido_pago"]);
conferir("LI: etiqueta postada vale postage.price", [li1.envio.custoDoVendedor, li1.envio.fonteDoCusto, li1.envio.rastreio], [18.12, "etiqueta", "AB123456789BR"]);
conferir("etiqueta cancelada e refeita: vale a nova", escolherEtiquetaEnviali([{ postage: { id: 1, status: "cancelled", date_time: "2026-11-02T10:00:00" } }, { postage: { id: 2, status: "created", date_time: "2026-11-02T11:00:00" } }]).postage.id, 2);
conferir("so canceladas = sem etiqueta", escolherEtiquetaEnviali([{ postage: { id: 1, status: "cancelled", date_time: "2026-11-02T10:00:00" } }]), null);
conferir("etiqueta created vale estimate.price", normalizarPedidoLI({ pedido: fx("li-pedido"), historico: [], etiquetas: [{ postage: { id: 9, status: "created", date_time: "2026-11-02T11:00:00", price: null, tracking_code: null }, estimate: { price: 6731 } }] }).envio.custoDoVendedor, 67.31);
const retirada = normalizarPedidoLI({ pedido: { ...fx("li-pedido"), envios: [{ forma_envio: { nome: "Retirada", tipo: "retirada" }, valor: "0.00" }] }, historico: [], etiquetas: [] }).envio;
conferir("LI: retirada = frete 0 do pedido", [retirada.custoDoVendedor, retirada.fonteDoCusto], [0, "pedido"]);
const bl1 = normalizarPedidoBling({ pedido: fx("bling-pedido"), formas: fx("bling-formas"), situacoes: fx("bling-situacoes"), nfe: fx("bling-nfe") });
conferir("Bling: pedido digitado", [bl1.canal, bl1.numero, bl1.pagamento[0].forma, bl1.statusDaOrigem, bl1.nf.chave.length], ["BLING", "7001", "Pix", "Em andamento", 44]);
conferir("Bling: loja", [classificarLojaDoBling(undefined), classificarLojaDoBling(0), classificarLojaDoBling(206326819), classificarLojaDoBling("203593931"), classificarLojaDoBling(203478870), classificarLojaDoBling(999)], ["bling", "bling", "espelhoML", "espelhoML", "espelhoLI", "outra"]);
```

- [ ] **Step 2: Rodar e ver falhar** — `npm run teste:pedidos` → `Cannot find module .../pedidos/ml.js`.

- [ ] **Step 3: Implementar** os três normalizadores e `escolherEtiquetaEnviali`. Documento: só dígitos (`replace(/\D/g, "")`), vazio → null. Telefone: `telefoneParaGravar` de `lib/telefone.js` (inválido → null). Datas: `new Date(iso)`. Dinheiro: `Number` com 2 casas.

- [ ] **Step 4: Rodar e ver passar** — `npm run teste:pedidos` → todos `ok`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pedidos/normalizado.js src/lib/pedidos/ml.js src/lib/pedidos/li.js src/lib/pedidos/bling.js scripts/teste-pedidos.js
git commit -m "feat(pedidos): normalizadores do ML, da LI (com a etiqueta do Enviali) e do Bling"
```

---

### Task 4: Status unificado

**Files:**
- Create: `src/lib/pedidos/status.js` (sem imports)
- Test: `scripts/teste-pedidos.js`

**Interfaces:**
- Produces: `statusDoPedido({ origem, statusDaOrigem, tags, envio, devolucao, anterior, emSeparacao, agora }) → { status, desconhecido: boolean }`; `statusDoEnvio({ origem, envio, devolucao }) → StatusDoEnvio`; `TEXTO_DO_STATUS` e `TEXTO_DO_STATUS_DO_ENVIO` (os rótulos da tela, com acento: "Aguardando pagamento", "Pago", "Aguardando peças", "Em separação", "Enviado", "Entregue", "Finalizado", "Cancelado", "Devolvido"; "Sem envio", "A postar", "Postado", "Em trânsito", "Entregue", "Não entregue", "Devolvido", "Cancelado"); `COR_DO_STATUS` (classe do ponto: âmbar aguardando/peças, azul pago/separação/enviado, verde entregue/finalizado, cinza cancelado, vermelho devolvido).
- Tabelas exatamente as da spec 5.7 (ML por `order.status` + `envio.statusDaOrigem`; LI por `situacao.codigo`; Bling por nome da situação). FINALIZADO: ML `delivered` há 30 dias sem tag `not_delivered`; LI situação `final && aprovado`; Bling igual à LI pelo nome ("Atendido" + `dataSaida` + 30 dias). `emSeparacao: true` sobrepõe PAGO (nunca cancelado/enviado/entregue). `devolucao` → DEVOLVIDO (só origem ML). Código desconhecido → `{ status: anterior ?? "AGUARDANDO_PAGAMENTO", desconhecido: true }`. AGUARDANDO_PECAS NÃO sai daqui (é da Tarefa 8, que sobrepõe PAGO).

- [ ] **Step 1: Testes que falham** (seção "Status"):

```js
const s = (e) => statusDoPedido({ agora: new Date("2026-12-10T00:00:00Z"), ...e }).status;
conferir("ML aguardando", s({ origem: "MERCADO_LIVRE", statusDaOrigem: "payment_required", tags: [], envio: {} }), "AGUARDANDO_PAGAMENTO");
conferir("ML pago sem envio", s({ origem: "MERCADO_LIVRE", statusDaOrigem: "paid", tags: [], envio: { statusDaOrigem: "handling" } }), "PAGO");
conferir("ML enviado", s({ origem: "MERCADO_LIVRE", statusDaOrigem: "paid", tags: [], envio: { statusDaOrigem: "shipped" } }), "ENVIADO");
conferir("ML entregue recente", s({ origem: "MERCADO_LIVRE", statusDaOrigem: "paid", tags: [], envio: { statusDaOrigem: "delivered", historico: { entregueEm: "2026-12-01T00:00:00Z" } } }), "ENTREGUE");
conferir("ML finalizado apos 30 dias", s({ origem: "MERCADO_LIVRE", statusDaOrigem: "paid", tags: [], envio: { statusDaOrigem: "delivered", historico: { entregueEm: "2026-11-01T00:00:00Z" } } }), "FINALIZADO");
conferir("ML devolvido", s({ origem: "MERCADO_LIVRE", statusDaOrigem: "paid", tags: [], envio: { statusDaOrigem: "delivered" }, devolucao: { entregueEm: new Date(), custoDoRetorno: 0 } }), "DEVOLVIDO");
conferir("ML cancelado vence separacao", s({ origem: "MERCADO_LIVRE", statusDaOrigem: "cancelled", tags: [], envio: {}, emSeparacao: true }), "CANCELADO");
conferir("em separacao manual sobre pago", s({ origem: "LOJA_INTEGRADA", statusDaOrigem: "pedido_pago", envio: {}, emSeparacao: true }), "EM_SEPARACAO");
conferir("LI codigos", ["pedido_efetuado", "pedido_pago", "pedido_enviado", "pedido_entregue", "pedido_cancelado"].map((c) => s({ origem: "LOJA_INTEGRADA", statusDaOrigem: c, envio: {} })), ["AGUARDANDO_PAGAMENTO", "PAGO", "ENVIADO", "ENTREGUE", "CANCELADO"]);
conferir("desconhecido mantem o anterior", statusDoPedido({ origem: "LOJA_INTEGRADA", statusDaOrigem: "pedido_em_analise", envio: {}, anterior: "PAGO" }), { status: "PAGO", desconhecido: true });
conferir("Bling nomes", ["Em aberto", "Em andamento", "Cancelado"].map((n) => s({ origem: "BLING", statusDaOrigem: n, envio: {} })), ["AGUARDANDO_PAGAMENTO", "PAGO", "CANCELADO"]);
conferir("Bling atendido com rastreio", s({ origem: "BLING", statusDaOrigem: "Atendido", envio: { rastreio: "X1" } }), "ENVIADO");
conferir("envio ML", ["pending", "ready_to_ship", "shipped", "delivered", "not_delivered", "cancelled"].map((st) => statusDoEnvio({ origem: "MERCADO_LIVRE", envio: { statusDaOrigem: st } })), ["A_POSTAR", "A_POSTAR", "EM_TRANSITO", "ENTREGUE", "NAO_ENTREGUE", "CANCELADO"]);
conferir("envio LI pelo Enviali", ["created", "posted", "transit", "delivering", "delivered", "returned", "cancelled"].map((st) => statusDoEnvio({ origem: "LOJA_INTEGRADA", envio: { tipo: "enviali", statusDaOrigem: st } })), ["A_POSTAR", "POSTADO", "EM_TRANSITO", "EM_TRANSITO", "ENTREGUE", "NAO_ENTREGUE", "CANCELADO"]);
conferir("envio LI sem Enviali pela situacao", statusDoEnvio({ origem: "LOJA_INTEGRADA", envio: { tipo: "correios", statusDaOrigem: null, situacaoDoPedido: "pedido_enviado" } }), "EM_TRANSITO");
conferir("sem envio", statusDoEnvio({ origem: "BLING", envio: { tipo: null } }), "SEM_ENVIO");
conferir("devolvido no envio", statusDoEnvio({ origem: "MERCADO_LIVRE", envio: { statusDaOrigem: "delivered" }, devolucao: { entregueEm: new Date() } }), "DEVOLVIDO");
```

- [ ] **Step 2: Rodar e ver falhar** — `Cannot find module .../pedidos/status.js`.
- [ ] **Step 3: Implementar** `status.js` com as tabelas como dado (objetos), não `if` espalhado.
- [ ] **Step 4: Rodar e ver passar** — todos `ok`.
- [ ] **Step 5: Commit** — `git add src/lib/pedidos/status.js scripts/teste-pedidos.js` / `git commit -m "feat(pedidos): status unificado do pedido e do envio por origem"`.

---

### Task 5: Cliente automático

**Files:**
- Create: `src/lib/pedidos/cliente.js`
- Test: `scripts/teste-pedidos.js`

**Interfaces:**
- Consumes: `comprador` e `enderecoDeEntrega` do `PedidoNormalizado`; `validarCpf/validarCnpj/formatarCpf/formatarCnpj/formatarCep` de `lib/documentos.js`; `telefoneParaGravar` de `lib/telefone.js`.
- Produces: `clienteDoPedido(tx, normalizado) → { clienteId: string|null, avisos: string[] }` (`tx` = cliente Prisma ou transação). Regras da spec 5.3: sem documento → `{ clienteId: null, avisos: ["clienteSemDocumento"] }`; documento com 11 dígitos = FISICA (formatado `formatarCpf`), 14 = JURIDICA (`formatarCnpj`), inválido pelo dígito verificador ou outro tamanho → cria mesmo assim como FISICA com aviso `documentoInvalido`; acha por `Cliente.documento` formatado; existente: preenche só `telefone`/`email` vazios, nunca `nome`, nunca endereço; novo: `nome`, `tipoPessoa`, `documento`, `telefone`, `email`, `observacoes = "Criado pelo pedido <canal> <numero>"` (+ " — documento inválido" quando `documentoInvalido`), `enderecos: [{ tipo: "GERAL", cep (formatado), uf, cidade, bairro, logradouro: endereco, numero, complemento }]`. Nome vazio → "Comprador sem nome".

- [ ] **Step 1: Testes que falham** (seção "Cliente automático"; antes, `limpar()` apaga os clientes de teste pelos documentos `123.456.789-09`, `11.222.333/0001-81` e `000.000.000-00`):

```js
const base = { canal: "MERCADO_LIVRE", numero: "ZZ-PED-10", comprador: { nome: "ZZ Ped Comprador", documento: "12345678909", email: "a@b.c", telefone: "54988990008" }, enderecoDeEntrega: { endereco: "Rua A", numero: "10", bairro: "Centro", cidade: "Caxias do Sul", uf: "RS", cep: "95090970" } };
const novo = await clienteDoPedido(prisma, base);
const criado = await prisma.cliente.findUnique({ where: { id: novo.clienteId }, include: { enderecos: true } });
conferir("cria o cliente formatado", [novo.avisos, criado.documento, criado.tipoPessoa, criado.telefone, criado.enderecos[0].tipo, criado.enderecos[0].cep, criado.observacoes], [[], "123.456.789-09", "FISICA", "54988990008", "GERAL", "95090-970", "Criado pelo pedido MERCADO_LIVRE ZZ-PED-10"]);
await prisma.cliente.update({ where: { id: novo.clienteId }, data: { nome: "Nome editado pelo dono", email: null } });
const deNovo = await clienteDoPedido(prisma, { ...base, comprador: { ...base.comprador, nome: "Outro nome", documento: "123.456.789-09" } });
const relido = await prisma.cliente.findUnique({ where: { id: novo.clienteId } });
conferir("casa pelo documento com mascara e nao sobrescreve o nome, preenche o email vazio", [deNovo.clienteId === novo.clienteId, relido.nome, relido.email], [true, "Nome editado pelo dono", "a@b.c"]);
conferir("sem documento", await clienteDoPedido(prisma, { ...base, comprador: { ...base.comprador, documento: null } }), { clienteId: null, avisos: ["clienteSemDocumento"] });
const invalido = await clienteDoPedido(prisma, { ...base, comprador: { ...base.comprador, documento: "00000000000" } });
conferir("documento invalido cria com aviso", [invalido.avisos, (await prisma.cliente.findUnique({ where: { id: invalido.clienteId } })).observacoes.includes("documento inválido")], [["documentoInvalido"], true]);
conferir("CNPJ vira juridica", (await prisma.cliente.findUnique({ where: { id: (await clienteDoPedido(prisma, { ...base, comprador: { ...base.comprador, documento: "11222333000181" } })).clienteId } })).tipoPessoa, "JURIDICA");
```

- [ ] **Step 2: Rodar e ver falhar** — `Cannot find module .../pedidos/cliente.js`.
- [ ] **Step 3: Implementar** `cliente.js`.
- [ ] **Step 4: Rodar e ver passar** — todos `ok`; `npm run teste:cadastros` verde.
- [ ] **Step 5: Commit** — `git add src/lib/pedidos/cliente.js scripts/teste-pedidos.js` / `git commit -m "feat(pedidos): cliente criado ou casado pelo documento do pedido"`.

---

### Task 6: Itens, vínculo com o Produto e custo congelado

**Files:**
- Create: `src/lib/pedidos/itens.js`
- Test: `scripts/teste-pedidos.js`

**Interfaces:**
- Consumes: `itens` e `origem` do `PedidoNormalizado`; `Anuncio` (`canal`, `idExterno`, `produtoId`, `dados.composicao` do kit do ML), `Produto` (`sku`, `blingId`, `custo`, `conferido`, `tipo`, `pecasProprias`, `fornecedorRascunho.precoCusto`, `fornecedores` com `padrao`/`precoFornecedor`, `componentes`).
- Produces: `custoCongeladoDoProduto(produto) → { custo: number|null, origem: "fornecedorPadrao"|"rascunhoBling"|"cadastro"|"pecas"|"kit"|null }` (puro; kit = Σ componentes × quantidade pelo mesmo critério; `pecasProprias` = `Produto.custo` com origem `"pecas"`); `casarItens(tx, normalizado) → { itens: [{ ...item normalizado, produtoId, anuncioId, custoUnitarioCongelado, custoOrigem, conferido, quantidadeDoKit }], avisos }` (`quantidadeDoKit` = N do kit do ML, 1 nos demais; `quantidade` gravada = quantidade × N). Avisos: `produtoForaDoRise` (algum item sem produto), `produtoNaoConferido` (ML/LI, algum item com produto e `conferido: false`), `semCusto` (algum item com produto e custo nulo).
- Casamento (spec 5.4): ML `Anuncio{canal: MERCADO_LIVRE, idExterno: item.idNaOrigem}` → senão `Produto.sku = codigoNaOrigem`; LI `Anuncio{canal: LOJA_INTEGRADA, idExterno: idNaOrigem}` → senão sku; Bling `Produto.blingId = idNaOrigem` → senão sku. Comparação de sku sem caixa.

- [ ] **Step 1: Testes que falham** (seção "Itens"; cria produtos `ZZ-PED-A` com custo 10 e `conferido: true`, `ZZ-PED-B` sem custo e não conferido com `fornecedorRascunho: { precoCusto: 7.5 }`, um kit `ZZ-PED-KIT` com 2× A, e um `Anuncio` ML `idExterno: "MLBZZPED1"` do A):

```js
conferir("custo: fornecedor padrao > rascunho > cadastro", [custoCongeladoDoProduto({ custo: 10, fornecedores: [{ padrao: true, precoFornecedor: 8 }] }), custoCongeladoDoProduto({ custo: 10, fornecedorRascunho: { precoCusto: 7.5 }, fornecedores: [] }), custoCongeladoDoProduto({ custo: 10, fornecedores: [] }), custoCongeladoDoProduto({ custo: null, fornecedores: [] })], [{ custo: 8, origem: "fornecedorPadrao" }, { custo: 7.5, origem: "rascunhoBling" }, { custo: 10, origem: "cadastro" }, { custo: null, origem: null }]);
conferir("custo do kit soma as pecas", custoCongeladoDoProduto({ tipo: "COMPOSICAO", custo: null, fornecedores: [], componentes: [{ quantidade: 2, componente: { custo: 10, fornecedores: [] } }] }), { custo: 20, origem: "kit" });
const ml = await casarItens(prisma, { origem: "MERCADO_LIVRE", itens: [{ ordem: 0, idNaOrigem: "MLBZZPED1", codigoNaOrigem: null, titulo: "A", quantidade: 2, precoUnitario: 30, desconto: 0, total: 60, comissao: 7.8 }] });
conferir("ML casa pelo MLB", [ml.itens[0].produtoId === a.id, ml.itens[0].custoUnitarioCongelado, ml.itens[0].conferido, ml.avisos], [true, 10, true, []]);
const li = await casarItens(prisma, { origem: "LOJA_INTEGRADA", itens: [{ ordem: 0, idNaOrigem: "999", codigoNaOrigem: "zz-ped-b", titulo: "B", quantidade: 1, precoUnitario: 5, desconto: 0, total: 5, comissao: null }] });
conferir("LI cai no sku sem caixa; nao conferido e custo do rascunho", [li.itens[0].produtoId === b.id, li.itens[0].custoUnitarioCongelado, li.itens[0].custoOrigem, li.avisos], [true, 7.5, "rascunhoBling", ["produtoNaoConferido"]]);
const fora = await casarItens(prisma, { origem: "BLING", itens: [{ ordem: 0, idNaOrigem: "0", codigoNaOrigem: "NAO-EXISTE", titulo: "X", quantidade: 1, precoUnitario: 5, desconto: 0, total: 5, comissao: null }] });
conferir("fora do Rise", [fora.itens[0].produtoId, fora.avisos], [null, ["produtoForaDoRise"]]);
conferir("Bling nao avisa nao conferido", (await casarItens(prisma, { origem: "BLING", itens: [{ ordem: 0, idNaOrigem: b.blingId, codigoNaOrigem: "ZZ-PED-B", titulo: "B", quantidade: 1, precoUnitario: 5, desconto: 0, total: 5, comissao: null }] })).avisos, []);
```

- [ ] **Step 2: Rodar e ver falhar** — `Cannot find module .../pedidos/itens.js`.
- [ ] **Step 3: Implementar** `itens.js` (uma consulta de anúncios e uma de produtos por pedido, com o `include` de fornecedores e componentes).
- [ ] **Step 4: Rodar e ver passar** — todos `ok`.
- [ ] **Step 5: Commit** — `git add src/lib/pedidos/itens.js scripts/teste-pedidos.js` / `git commit -m "feat(pedidos): itens casados com o produto e custo congelado"`.

---

### Task 7: Lucro estimado, lucro real e a devolução

**Files:**
- Create: `src/lib/pedidos/lucro.js` (puro, importa só `IMPOSTO_PADRAO`/`lucroLiquido` de `lib/margem.js` e `custosDoAnuncio`/`freteQueConta` de `canaisDeVenda/ml/custos.js`)
- Create: `src/lib/pedidos/estimativaML.js` (`estimativaDoAnuncioML(cliente, anuncio, custo)`: `lerCustosDoAnuncio(cliente, rascunho)` de `canaisDeVenda/ml/leitura.js` com o rascunho de `carregarAnuncioML(anuncio.id)`, e `custosDoAnuncio({ preco: rascunho.preco, custo, percentual, tarifaFixa, frete: freteQueConta(custos, rascunho) })`; o editor não grava as taxas lidas, então a estimativa relê o ML uma vez por pedido, de leitura)
- Test: `scripts/teste-pedidos.js`

**Interfaces:**
- Produces (`lucro.js`): `TOLERANCIA = { reais: 1, fracao: 0.05 }`; `parcelasDaEstimativa({ origem, itens, totais, custosML, taxas }) → { receita, comissao, tarifaFixa, frete, imposto, custo, lucro, calculadoEm, origem: "editorML"|"lucroNaLoja"|null }` (ML com `custosML = { percentual, tarifaFixa, frete }` → `custosDoAnuncio` por item × quantidade; LI/Bling → `lucroLiquido(precoUnitario, custo) × quantidade` por item, `frete` = `taxas?.padrao?.frete ?? 0`; sem custo em algum item → `lucro: null`); `parcelasDoReal({ origem, itens, totais, envio, pagamento, custoDoFreteManual, taxas, estimativa }) → { receita, comissao, tarifaFixa, frete, imposto, custo, lucro, fontes: { comissao, frete } }` (ML `comissao = Σ item.comissao` (`fonte: "pedido"`), `frete = envio.custoDoVendedor` com `fonte` = `envio.fonteDoCusto`; LI `comissao = receita × taxas.pagamento[tipo].percentual + fixa` (`fonte: "config"`, sem taxa → `estimado` com a parcela da estimativa), frete da etiqueta; Bling `comissao 0`, `frete = custoDoFreteManual` (`fonte: "manual"`, nulo → `estimado` com a parcela da estimativa)); `devolvido(custoDoRetorno) → { receita: 0, comissao: 0, tarifaFixa: 0, frete: custoDoRetorno, imposto: 0, custo: 0, lucro: −custoDoRetorno, fontes: { frete: "envio" } }`; `lucroDivergente(estimado, real) → boolean` (ambos numéricos e `|real − estimado| > max(1, 0.05 × |estimado|)`); `lucroFechado({ status, real }) → boolean` (ENTREGUE/FINALIZADO e nenhuma `fontes[*] === "estimado"`).

- [ ] **Step 1: Testes que falham** (seção "Lucro"):

```js
const itemML = { quantidade: 2, precoUnitario: 100, total: 200, comissao: 26, custoUnitarioCongelado: 40 };
const est = parcelasDaEstimativa({ origem: "MERCADO_LIVRE", itens: [itemML], totais: { total: 200 }, custosML: { percentual: 0.13, tarifaFixa: 0, frete: 19.05 } });
conferir("estimativa ML = editor x quantidade", [est.comissao, est.frete, est.imposto, est.custo, est.lucro, est.origem], [26, 38.1, 12, 80, 43.9, "editorML"]);
const real = parcelasDoReal({ origem: "MERCADO_LIVRE", itens: [itemML], totais: { total: 200 }, envio: { custoDoVendedor: 18.12, fonteDoCusto: "envio" }, estimativa: est });
conferir("real ML pelo pedido e pelo envio", [real.comissao, real.frete, real.lucro, real.fontes.frete], [26, 18.12, 63.88, "envio"]);
conferir("divergente acima da tolerancia", [lucroDivergente(43.9, 63.88), lucroDivergente(43.9, 44.8), lucroDivergente(10, 11.2), lucroDivergente(null, 5)], [true, false, true, false]);
conferir("LI sem taxa cadastrada = comissao estimada", parcelasDoReal({ origem: "LOJA_INTEGRADA", itens: [{ quantidade: 1, precoUnitario: 50, total: 50, custoUnitarioCongelado: 20 }], totais: { total: 60 }, envio: { custoDoVendedor: null, fonteDoCusto: "estimado" }, pagamento: [{ tipo: "pix" }], taxas: null, estimativa: { comissao: 0, frete: 0 } }).fontes, { comissao: "estimado", frete: "estimado" });
conferir("LI com taxa e etiqueta", parcelasDoReal({ origem: "LOJA_INTEGRADA", itens: [{ quantidade: 1, precoUnitario: 50, total: 50, custoUnitarioCongelado: 20 }], totais: { total: 60 }, envio: { custoDoVendedor: 18.12, fonteDoCusto: "etiqueta" }, pagamento: [{ tipo: "pix" }], taxas: { pagamento: [{ tipo: "pix", percentual: 0.0099, fixa: 0 }] }, estimativa: {} }).comissao, 0.59);
conferir("Bling frete manual", parcelasDoReal({ origem: "BLING", itens: [], totais: { total: 100 }, envio: {}, pagamento: [], custoDoFreteManual: 25, estimativa: {} }).fontes.frete, "manual");
conferir("devolvido", devolvido(22.5), { receita: 0, comissao: 0, tarifaFixa: 0, frete: 22.5, imposto: 0, custo: 0, lucro: -22.5, fontes: { frete: "envio" } });
conferir("fechado so entregue sem estimado", [lucroFechado({ status: "ENTREGUE", real: { fontes: { frete: "envio" } } }), lucroFechado({ status: "ENTREGUE", real: { fontes: { frete: "estimado" } } }), lucroFechado({ status: "ENVIADO", real: { fontes: {} } })], [true, false, false]);
```

- [ ] **Step 2: Rodar e ver falhar** — `Cannot find module .../pedidos/lucro.js`.
- [ ] **Step 3: Implementar** `lucro.js` e `estimativaML.js` (dinheiro arredondado a 2 casas em cada parcela, como `custosDoAnuncio`).
- [ ] **Step 4: Rodar e ver passar** — todos `ok`.
- [ ] **Step 5: Commit** — `git add src/lib/pedidos/lucro.js src/lib/pedidos/estimativaML.js scripts/teste-pedidos.js` / `git commit -m "feat(pedidos): lucro estimado, lucro real, tolerancia e devolucao"`.

---

### Task 8: Aguardando peças

**Files:**
- Create: `src/lib/pedidos/pecas.js`
- Test: `scripts/teste-pedidos.js`

**Interfaces:**
- Consumes: `Produto.estoque`, `tipo`, `componentes`, `pecasProprias` + `pecasDoProduto` (`componenteId`, `quantidade` Decimal); `ItemDoPedidoDeCompra` em pedidos `ENVIADO`/`PARCIAL` (`quantidade − quantidadeLancada`, `prazoDias`, `pedido.enviadoEm`, `pedido.numero`); `OrdemDeProducao` `ABERTA`/`EM_PRODUCAO` (`produtoId`, `numero`); `PedidoDeVenda` abertos (`status in PAGO/AGUARDANDO_PECAS/EM_SEPARACAO`, `dataDaVenda < a deste`, `id ≠`) com itens.
- Produces: `necessidadeDoPedido(itens, produtosPorId) → Map<produtoId, quantidade>` (puro; kit expande componentes; `pecasProprias` expande `pecasDoProduto` com `componenteId`, arredondando para cima); `calcularPecas(tx, pedido) → { pecas: [{ produtoId, sku, nome, necessario, disponivel, falta, previsao: string|null, previsaoOrigem: "compra"|"producao"|null }], falta: boolean }` (`disponivel = max(0, estoque − reservas dos abertos mais antigos)`; previsão: compra = `enviadoEm + prazoDias` formatado `dd/mm` (sem prazo: `"pedido PC-0015 enviado em dd/mm, sem prazo"`), senão produção `"em produção, ordem OP-0003"`, senão `null` e a tela escreve "sem previsão"). `STATUS_ABERTOS_PARA_PECAS = ["PAGO", "AGUARDANDO_PECAS", "EM_SEPARACAO"]`.

- [ ] **Step 1: Testes que falham** (seção "Peças"; produtos `ZZ-PED-P1` estoque 3, `ZZ-PED-P2` estoque 0, `ZZ-PED-P3` estoque 0, kit `ZZ-PED-K` = 2× P1, produto `ZZ-PED-PP` com `pecasProprias` e peça 1,5× P2; um `PedidoDeCompra` ZZ ENVIADO com P2 ×10, `prazoDias 7`, `enviadoEm 2026-11-05`; uma `OrdemDeProducao` ZZ ABERTA do P3; três `PedidoDeVenda` ZZ abertos):

```js
conferir("necessidade: simples, kit e pecas proprias", [...necessidadeDoPedido([{ produtoId: k.id, quantidade: 1 }, { produtoId: pp.id, quantidade: 1 }], mapa).entries()], [[p1.id, 2], [p2.id, 2]]);
const r1 = await calcularPecas(prisma, pedidoAntigo);   // 2x P1, vendido as 10:00
conferir("primeiro pedido tem", [r1.falta, r1.pecas[0].disponivel, r1.pecas[0].falta], [false, 3, 0]);
const r2 = await calcularPecas(prisma, pedidoNovo);     // 2x P1 + 1x P2, vendido as 11:00
conferir("segundo pedido desconta a reserva do primeiro", r2.pecas.map((p) => [p.sku, p.disponivel, p.falta]), [["ZZ-PED-P1", 1, 1], ["ZZ-PED-P2", 0, 1]]);
conferir("previsao pela compra", r2.pecas[1].previsao, "12/11");
conferir("previsao pela producao quando nao ha compra", (await calcularPecas(prisma, pedidoComP3)).pecas.find((p) => p.sku === "ZZ-PED-P3").previsao, "em produção, ordem OP-" + String(op.numero).padStart(4, "0"));
await prisma.pedidoDeVenda.update({ where: { id: pedidoAntigo.id }, data: { status: "CANCELADO" } });
conferir("pedido cancelado libera a reserva", (await calcularPecas(prisma, pedidoNovo)).pecas[0].falta, 0);
```

- [ ] **Step 2: Rodar e ver falhar** — `Cannot find module .../pedidos/pecas.js`.
- [ ] **Step 3: Implementar** `pecas.js`. A reserva dos outros pedidos usa a mesma `necessidadeDoPedido` (um kit vendido antes reserva as peças dele).
- [ ] **Step 4: Rodar e ver passar** — todos `ok`.
- [ ] **Step 5: Commit** — `git add src/lib/pedidos/pecas.js scripts/teste-pedidos.js` / `git commit -m "feat(pedidos): aguardando pecas com reserva dos pedidos abertos e previsao"`.

---

### Task 9: `aplicarPedidoLido`, leitura para a tela e as ações do pedido

**Files:**
- Create: `src/lib/pedidos/banco.js`
- Test: `scripts/teste-pedidos.js`

**Interfaces:**
- Consumes: Tarefas 3 a 8 (`clienteDoPedido`, `casarItens`, `statusDoPedido`, `statusDoEnvio`, `parcelasDaEstimativa`, `parcelasDoReal`, `devolvido`, `lucroDivergente`, `lucroFechado`, `calcularPecas`, `estimativaDoAnuncioML`), `lerTaxas` (Tarefa 11; até lá `taxas` vem por parâmetro).
- Produces: `aplicarPedidoLido(normalizado, { cliente = clienteML(), taxas = null, agora = new Date() }) → { id, criado: boolean, status, avisos }` ou `{ ignorado: true }`, numa `prisma.$transaction` com `isolationLevel: "Serializable"` (repete uma vez em `P2034`): upsert por `[origem, idExterno]`; ignora `dataDaVenda < config.pedidos.desde`; cliente (Tarefa 5) só quando `clienteId` nulo (um cliente vinculado à mão fica); itens apagados e regravados; `estimativa` só quando nula (ML: `estimativaDoAnuncioML` do anúncio do 1º item casado; sem anúncio → aviso `semEstimativa`); `real` recalculado enquanto `!lucroFechado` ou quando há `devolucao` (reabre: `lucroFechado = false`, `real = devolvido(custoDoRetorno)`, sem `lucroDivergente`); status (Tarefa 4, com `anterior` e `emSeparacao`) depois sobreposto por `calcularPecas` (AGUARDANDO_PECAS só sobre PAGO/EM_SEPARACAO); `statusDoEnvio`; `historico` = união por `em` do que veio com o gravado; `avisos` recalculados do zero a cada aplicação (`statusDesconhecido`, `fraude` quando `tags` tem `fraud_risk_detected`, mais os das Tarefas 5/6/7 e `nfACancelar` quando `status === "DEVOLVIDO" && nf?.status === "authorized"`); `lucroEstimado/lucroReal` espelham `estimativa.lucro`/`real.lucro`; `custoDoFreteManual` gravado nunca é apagado por uma releitura.
- Produces: `listarPedidosDeVenda({ busca, desde, ate, canais, status, soComAviso, ordenar, direcao, pagina, porPagina }) → { linhas, total }` (linhas com `cliente { id, nome, nivel }`, `itens[0]` com a foto do produto (`ProdutoArquivo` capa, como `listarPedidos` do Compras faz), `quantidadeDeItens`; busca em `numero`, `nomeDoComprador`, `documentoDoComprador` (dígitos), `itens.codigoNaOrigem`, `itens.produto.sku`; ordem padrão `dataDaVenda desc`; `ordenar` ∈ canal, numero, data, cliente, total, status, lucro); `lerPedidoDeVenda(id)` (com cliente, itens + produto `{ sku, tituloBase, conferido, capa }`, e `pecas`); `marcarEmSeparacao(id, ligado)` (recusa fora de PAGO/AGUARDANDO_PECAS/EM_SEPARACAO: `{ ok: false, erro }`), `salvarCustoDoFreteManual(id, valor)` (só origem BLING; recalcula `real`), `vincularCliente(id, clienteId)` (grava e tira `clienteSemDocumento`), `espelharNoBling(origem, numeroLoja, { blingPedidoId, blingNumero })` (acha por `[origem, idExterno = numeroLoja]`; devolve `false` se não existe).

- [ ] **Step 1: Testes que falham** (seção "Aplicar"; usa o `PedidoNormalizado` das fixtures com `idExterno` trocado para `ZZ-PED-100` e itens apontando para `ZZ-PED-A`; `cliente` = ML falso com `/sites/MLB/listing_prices` e frete, como no `teste:anuncios-ml`):

```js
const a1 = await aplicarPedidoLido(nml, { cliente: mlFalso, agora });
const g1 = await prisma.pedidoDeVenda.findUnique({ where: { id: a1.id }, include: { itens: true } });
conferir("cria o pedido completo", [a1.criado, g1.status, g1.statusDoEnvio, g1.itens.length, g1.clienteId !== null, g1.estimativa?.origem, g1.lucroReal !== null], [true, "ENVIADO", "EM_TRANSITO", 1, true, "editorML", true]);
const a2 = await aplicarPedidoLido({ ...nml, totais: { ...nml.totais, total: 999 } }, { cliente: mlFalso, agora });
const g2 = await prisma.pedidoDeVenda.findUnique({ where: { id: a1.id }, include: { itens: true } });
conferir("segunda leitura atualiza sem duplicar e nao mexe na estimativa", [a2.criado, a2.id === a1.id, g2.itens.length, Number(g2.total), g2.estimativa.lucro === g1.estimativa.lucro, g2.avisos.includes("lucroDivergente")], [false, true, 1, 999, true, true]);
conferir("anterior ao corte e ignorado", (await aplicarPedidoLido({ ...nml, idExterno: "ZZ-PED-101", dataDaVenda: new Date("2026-10-31T12:00:00Z") }, { cliente: mlFalso, agora })).ignorado, true);
conferir("status desconhecido mantem e avisa", (await aplicarPedidoLido({ ...nml, statusDaOrigem: "xyz" }, { cliente: mlFalso, agora })).avisos.includes("statusDesconhecido"), true);
conferir("fraude avisa", (await aplicarPedidoLido({ ...nml, tags: ["fraud_risk_detected"] }, { cliente: mlFalso, agora })).avisos.includes("fraude"), true);
const entregue = await aplicarPedidoLido({ ...nml, envio: { ...nml.envio, statusDaOrigem: "delivered", historico: { entregueEm: agora.toISOString() } } }, { cliente: mlFalso, agora });
conferir("entregue fecha o lucro", (await prisma.pedidoDeVenda.findUnique({ where: { id: entregue.id } })).lucroFechado, true);
const dev = await aplicarPedidoLido({ ...nml, devolucao: { entregueEm: agora, custoDoRetorno: 22.5 }, nf: { ...nml.nf, status: "authorized" } }, { cliente: mlFalso, agora });
const gd = await prisma.pedidoDeVenda.findUnique({ where: { id: dev.id } });
conferir("devolucao reabre, zera e deixa o retorno como prejuizo", [gd.status, gd.statusDoEnvio, gd.lucroFechado, Number(gd.lucroReal), gd.real.receita, gd.avisos.includes("lucroDivergente"), gd.avisos.includes("nfACancelar"), gd.clienteId === g1.clienteId], ["DEVOLVIDO", "DEVOLVIDO", false, -22.5, 0, false, true, true]);
conferir("nf cancelada apaga o aviso", (await aplicarPedidoLido({ ...nml, devolucao: { entregueEm: agora, custoDoRetorno: 22.5 }, nf: { ...nml.nf, status: "cancelled" } }, { cliente: mlFalso, agora })).avisos.includes("nfACancelar"), false);
const pago = await aplicarPedidoLido({ ...nml, idExterno: "ZZ-PED-102", statusDaOrigem: "paid", envio: { ...nml.envio, statusDaOrigem: "handling" }, itens: [{ ...nml.itens[0], quantidade: 50 }] }, { cliente: mlFalso, agora });
conferir("falta de peca vira aguardando pecas", pago.status, "AGUARDANDO_PECAS");
conferir("marcar separacao", [(await marcarEmSeparacao(pago.id, true)).ok, (await prisma.pedidoDeVenda.findUnique({ where: { id: pago.id } })).emSeparacao], [true, true]);
conferir("separacao recusada em enviado", (await marcarEmSeparacao(a1.id, true)).ok, false);
conferir("espelho do Bling", [await espelharNoBling("MERCADO_LIVRE", "ZZ-PED-100", { blingPedidoId: "7777", blingNumero: "123" }), await espelharNoBling("MERCADO_LIVRE", "nao-existe", { blingPedidoId: "1", blingNumero: "1" })], [true, false]);
const bl = await aplicarPedidoLido(nbling, { agora });   // origem BLING, frete nulo
conferir("Bling: frete manual recalcula o real", [(await salvarCustoDoFreteManual(bl.id, 25)).ok, (await prisma.pedidoDeVenda.findUnique({ where: { id: bl.id } })).real.fontes.frete], [true, "manual"]);
conferir("frete manual recusado fora do Bling", (await salvarCustoDoFreteManual(a1.id, 25)).ok, false);
conferir("releitura nao apaga o frete manual", Number((await (async () => { await aplicarPedidoLido(nbling, { agora }); return prisma.pedidoDeVenda.findUnique({ where: { id: bl.id } }); })()).custoDoFreteManual), 25);
const lista = await listarPedidosDeVenda({ busca: "ZZ-PED", porPagina: 25 });
conferir("lista acha pelo numero e traz o cliente", [lista.total >= 3, lista.linhas[0].cliente?.nome !== undefined], [true, true]);
conferir("so com aviso", (await listarPedidosDeVenda({ busca: "ZZ-PED", soComAviso: true })).linhas.every((l) => l.avisos.length > 0), true);
```

- [ ] **Step 2: Rodar e ver falhar** — `Cannot find module .../pedidos/banco.js`.
- [ ] **Step 3: Implementar** `banco.js`. A ordem dentro da transação: corte → upsert do cabeçalho → cliente → itens → estimativa → real/devolução → status → peças → envio → avisos → gravar.
- [ ] **Step 4: Rodar e ver passar** — todos `ok`.
- [ ] **Step 5: Commit** — `git add src/lib/pedidos/banco.js scripts/teste-pedidos.js` / `git commit -m "feat(pedidos): aplicarPedidoLido, lista, leitura e acoes do pedido"`.

---

### Task 10: Leitura por origem, rotina do worker e Saúde do Rise

**Files:**
- Create: `src/lib/pedidos/leitura.js`
- Modify: `scripts/worker-processo.js` (`rodarRotina("pedidos", LER_PEDIDOS_MS = 5 min, () => rodarLeituraDePedidos())`, no laço das rotinas, só no worker normal: `!SO_NO_PC`)
- Modify: `src/lib/saude/regras.js` (`ROTINAS_DO_WORKER` ganha `{ id: "pedidos", rotulo: "Pedidos de venda" }`, antes de `telegram`)
- Test: `scripts/teste-pedidos.js`

**Interfaces:**
- Consumes: `aplicarPedidoLido`, `espelharNoBling`, os normalizadores, os clientes (`clienteML()`, `clienteLI()`, `clienteBling()`), `config.pedidos.desde`, `lerTaxas` (Tarefa 11), `RotinaDoWorker` id `pedidos` (`dados: { cursores: { MERCADO_LIVRE, LOJA_INTEGRADA, BLING }, espelhosPendentes: [], ignoradosPorLoja: { [nome]: n }, lidos, erros }`).
- Produces: `lerPedidoDaOrigem(origem, idExterno, { ml, li, bling }) → PedidoNormalizado` (as chamadas da spec 5.2 por pedido; a fase 2 reutiliza); `lerPedidosDaOrigem(origem, { ml, li, bling, cursor, desde, agora }) → { normalizados, espelhos: [{ origem, numeroLoja, blingPedidoId, blingNumero }], ignorados: { [loja]: n }, cursorNovo: Date, falhas: [{ idExterno, erro }] }` (ML: `/orders/search` com `order.date_created.from` na carga e `order.date_last_updated.from = cursor − 10 min` depois, `limit 50`, paginando; LI: `/pedido/search` `since_criado`/`since_atualizado`, `limit 100`; Bling: `/pedidos/vendas` por `dataInicial/dataFinal` na carga e `dataAlteracaoInicial = cursor − 1 dia`, `limite 100`; o Bling classifica a loja: `bling` → normaliza; `espelhoML`/`espelhoLI` → `espelhos`; `outra` → conta em `ignorados` pelo nome de `/canais-venda`); `rodarLeituraDePedidos({ ml, li, bling, agora, taxas } = {}) → { lidos, criados, erros, ignorados, aviso }` (lê as três origens; falha numa origem vira `erro` e as outras seguem; grava o cursor por origem só quando a origem terminou sem erro fatal; espelhos sem pedido ainda guardados em `dados.espelhosPendentes` e tentados de novo na volta seguinte; `aviso` = "N falha(s)" para a Saúde pintar de amarelo). Um pedido que falha (404, JSON estranho) entra em `falhas`, grava `leituraFalhou` nos `avisos` se o pedido já existe, e não para a rotina. No fim de cada volta, `marcarEspelhosAusentes(agora)`: pedido de origem ML/LI com `blingPedidoId` nulo, não CANCELADO e `dataDaVenda < agora − 1 h` ganha o aviso `espelhoNoBlingAusente` (spec 5.9); `espelharNoBling` o tira. O aviso `lojaDesconhecida` da spec NÃO é gravado em pedido nenhum: o pedido de loja desconhecida não entra no banco, e a contagem em `ignoradosPorLoja` é o seu registro (decisão deste plano).

- [ ] **Step 1: Testes que falham** (seção "Leitura"; os três falsos com as fixtures, `RotinaDoWorker` `pedidos` apagada antes e restaurada no fim):

```js
const r1 = await rodarLeituraDePedidos({ ml: mlFalso, li: liFalsa, bling: blingFalso, agora, taxas: null });
conferir("carga inicial le as tres origens", [r1.lidos, r1.criados, r1.erros, r1.ignorados], [4, 4, 0, { "Shopee 4hobby": 1 }]);
const rot = await prisma.rotinaDoWorker.findUnique({ where: { id: "pedidos" } });
conferir("cursor gravado por origem", Object.keys(rot.dados.cursores).sort(), ["BLING", "LOJA_INTEGRADA", "MERCADO_LIVRE"]);
conferir("espelho do Bling preenchido no pedido do ML", (await prisma.pedidoDeVenda.findUnique({ where: { origem_idExterno: { origem: "MERCADO_LIVRE", idExterno: "2000000001" } } })).blingNumero, "123");
conferir("pedido do ML nao duplicou pelo Bling", await prisma.pedidoDeVenda.count({ where: { origem: "BLING", numero: "123" } }), 0);
mlFalso.pedidos.get(2000000001).status = "cancelled"; mlFalso.pedidos.get(2000000001).last_updated = agoraMais5.toISOString();
const r2 = await rodarLeituraDePedidos({ ml: mlFalso, li: liFalsa, bling: blingFalso, agora: agoraMais5, taxas: null });
conferir("segunda volta so o alterado", [r2.lidos, r2.criados, (await prisma.pedidoDeVenda.findUnique({ where: { origem_idExterno: { origem: "MERCADO_LIVRE", idExterno: "2000000001" } } })).status], [1, 0, "CANCELADO"]);
liFalsa.falhas = { "GET /pedido/5001": 500 }; liFalsa.pedidos.get("5001").data_modificacao = agoraMais10.toISOString();
const r3 = await rodarLeituraDePedidos({ ml: mlFalso, li: liFalsa, bling: blingFalso, agora: agoraMais10, taxas: null });
conferir("pedido que falha nao para a rotina", [r3.erros, r3.aviso], [1, "1 falha(s)"]);
const porNumero = async (origem, idExterno) => prisma.pedidoDeVenda.findUnique({ where: { origem_idExterno: { origem, idExterno } } });
// a fixture 5002 (LI) nao tem copia no Bling e foi vendida 2 h antes de `agora`; a 5001 tem o espelho 7003
conferir("espelho ausente depois de 1 h", [(await porNumero("LOJA_INTEGRADA", "5002")).avisos.includes("espelhoNoBlingAusente"), (await porNumero("LOJA_INTEGRADA", "5001")).avisos.includes("espelhoNoBlingAusente")], [true, false]);
conferir("ROTINAS_DO_WORKER tem pedidos", ROTINAS_DO_WORKER.some((r) => r.id === "pedidos"), true);
```

- [ ] **Step 2: Rodar e ver falhar** — `Cannot find module .../pedidos/leitura.js`.
- [ ] **Step 3: Implementar** `leitura.js`, ligar no worker e na Saúde. Reiniciar o worker depois (`npm run worker:parar`, `npm run worker`).
- [ ] **Step 4: Rodar e ver passar** — `npm run teste:pedidos` todos `ok`; `npm run teste:saude` verde (a rotina nova entra na lista).
- [ ] **Step 5: Commit** — `git add src/lib/pedidos/leitura.js scripts/worker-processo.js src/lib/saude/regras.js scripts/teste-pedidos.js` / `git commit -m "feat(pedidos): leitura por origem com cursor, rotina do worker e Saude do Rise"`.

---

### Task 11: Acessos e as taxas da LI

**Files:**
- Modify: `src/lib/acessos/recursos.js` (depois de `tela.pedidos`: `acao("acao.pedidos.marcarSeparacao", "Marcar pedido em separação", "tela.pedidos")`, `acao("acao.pedidos.editarCustoDoFrete", "Digitar o custo real do frete (Bling)", "tela.pedidos")`, `acao("acao.pedidos.vincularCliente", "Vincular cliente ao pedido", "tela.pedidos")`, `acao("acao.pedidos.emitirNF", "Criar NF pelo pedido", "tela.pedidos", "Desligada pela trava NFE_EMISSAO.")`, `acao("acao.pedidos.baixarNF", "Baixar NF e XML do pedido", "tela.pedidos")`)
- Create: `src/lib/pedidos/taxas.js` (`lerTaxas(canal)` → `ConfigCanal.taxas ?? null`; `salvarTaxas(canal, taxas)` → `{ ok, erro }` com esquema zod `{ pagamento: [{ tipo, percentual (0–1), fixa }], padrao: { percentual, fixa, frete } }`; `TIPOS_DE_PAGAMENTO_LI = ["pix", "boleto", "cartao_credito", "cartao_debito", "outro"]`)
- Create: `src/components/canais/TaxasDoCanal.jsx` (cartão "Taxas de venda" com uma linha por tipo: percentual e fixa, mais a linha "Frete padrão"; Salvar)
- Modify: `src/app/canais-de-venda/page.jsx` (o cartão da LI ganha o `TaxasDoCanal` abaixo; Bling e ML não têm taxa cadastrada, não aparece)
- Create: `src/app/canais-de-venda/acoes-taxas.js` (`salvarTaxasAcao(canal, formData)` com `executarComAcesso` no id de tela que a página já confere, nível `editar`)
- Test: `scripts/teste-pedidos.js`

- [ ] **Step 1: Testes que falham**: `conferir("recursos de pedidos", RECURSOS.filter((r) => r.id.startsWith("acao.pedidos.")).map((r) => r.id), [...os 5 ids])`; `conferir("taxas: percentual acima de 1 recusado", (await salvarTaxas("LOJA_INTEGRADA", { pagamento: [{ tipo: "pix", percentual: 5, fixa: 0 }] })).ok, false)`; `conferir("taxas gravadas e lidas", await lerTaxas("LOJA_INTEGRADA"), { pagamento: [{ tipo: "pix", percentual: 0.0099, fixa: 0 }], padrao: { percentual: 0, fixa: 0, frete: 0 } })` (restaurar o valor anterior da `ConfigCanal` da LI no fim).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.** `npm run teste:acessos` continua verde (o guarda das páginas).
- [ ] **Step 4: Rodar e ver passar** — `teste:pedidos` e `teste:acessos`.
- [ ] **Step 5: Commit** — `git commit -m "feat(pedidos): acoes de acesso e taxas de venda da Loja Integrada"` com os 6 arquivos.

---

### Task 12: Tela da lista `/pedidos` (use UI/UX)

**Files:**
- Modify: `src/app/pedidos/page.jsx` (sai o `BlocoEmConstrucao`)
- Create: `src/components/pedidos/TabelaPedidosDeVenda.jsx`, `src/components/pedidos/FiltrosDePedidos.jsx`, `src/components/pedidos/IconeDoCanalDoPedido.jsx` (logo de `CANAIS` 22 px + selo "!" com `title` = os avisos traduzidos), `src/components/pedidos/SeloDoNivel.jsx`, `src/components/pedidos/textos.js` (`TEXTO_DO_AVISO` por chave; `TEXTO_DO_STATUS` reexportado de `lib/pedidos/status.js`), `src/components/pedidos/formato.js` (moeda, data em São Paulo)
- Modify: `src/lib/blocos.js` (`/pedidos` `pronto: true`)

**Interfaces:**
- Consumes: `listarPedidosDeVenda` (Tarefa 9), `porPaginaDaUrl`, `NavegacaoDoTopo`, `CabecalhoOrdenavel`/`parametrosDaOrdenacao`, `FotoComLupa`, `FiltroDeCanais` (o mesmo popup de ícones da lista de Produtos, só com os canais de venda: BLING, LOJA_INTEGRADA, MERCADO_LIVRE ligáveis; SHOPEE desligada), `CampoBusca`.
- Linha-guia da spec 5.10: o operador vê primeiro os pedidos que pedem ação ("!", Aguardando peças, A postar); a ação principal é abrir o pedido. Antes de desenhar: chamar `frontend-design` com as 10 regras como restrição; depois `ecc:make-interfaces-feel-better`.
- Colunas (ordenáveis): canal (ícone + "!"), número (link para `/pedidos/[id]`), data (`dd/mm HH:mm`), cliente (nome `truncate` + `SeloDoNivel`), itens (foto do 1º com `FotoComLupa` + "e mais N" em `text-suave`), total, pagamento (abreviação: "Pix", "Cartão 3×", "Boleto"), status (ponto `COR_DO_STATUS` + texto; `title` com `statusDaOrigem`; Aguardando peças com `title` "falta 2× 900211 (previsão 12/11)"), envio (tipo + status; rastreio no `title`), lucro (real quando `lucroFechado`, senão estimado com "~" em `text-suave`; vermelho se < 0; "!" âmbar se `lucroDivergente`; coluna some sem `dado.custo`). Linha com "!" ou AGUARDANDO_PECAS: fundo `bg-amber-50`. Filtros no topo numa linha: busca, período (padrão 30 dias; `?desde=&ate=`), canais, status (chips múltiplos como `TabelaPedidos` do Compras), "Só com !" (chip). Vazio: `EmptyState` "Nenhum pedido lido ainda. O worker lê o ML, a LI e o Bling a cada 5 minutos."

- [ ] **Step 1:** Escrever a página e os componentes. Server component lê `searchParams` (`q`, `desde`, `ate`, `canal` repetido, `status` repetido, `aviso=1`, `ordenar`, `direcao`, `pagina`, `por`) e chama `listarPedidosDeVenda`.
- [ ] **Step 2: Verificar no navegador** (`preview_start` do `npm run dev`, largura de notebook 1366 px) com os `ZZ-PED-*` do teste deixados no banco (`npm run teste:pedidos -- --manter`): a lista mostra as linhas, o "!" com `title`, os filtros funcionam pela URL, ordenação por data e total, 25/100 por página. `read_console_messages` sem erro. Screenshot para o relatório.
- [ ] **Step 3: Passar por `ecc:make-interfaces-feel-better`** (alinhamento das colunas de número à direita, estados de hover do link, espaços) e ajustar.
- [ ] **Step 4: `npm run teste:acessos`** verde (a página confere `tela.pedidos`).
- [ ] **Step 5: Commit** — `git commit -m "feat(pedidos): lista de pedidos de venda"` com os arquivos acima.

---

### Task 13: Tela do pedido `/pedidos/[id]` e as ações (use UI/UX)

**Files:**
- Create: `src/app/pedidos/[id]/page.jsx`, `src/app/pedidos/acoes.js` (`marcarEmSeparacaoAcao(id, ligado)`, `salvarCustoDoFreteManualAcao(id, valor)`, `vincularClienteAcao(id, clienteId)`, `criarClienteDoPedidoAcao(id)`, `buscarClientesAcao(texto)`; cada uma começa por `negarSemAcesso("acao.pedidos.<x>", "executar")`)
- Create: `src/components/pedidos/PedidoDeVenda.jsx` (as abas lado a lado no molde do `FormularioCliente`: Geral, Itens, Peças (só com falta ou AGUARDANDO_PECAS), Envio, Lucro, Nota fiscal, Histórico; todas montadas e `hidden`), `AbaGeral.jsx`, `AbaItens.jsx`, `AbaPecas.jsx`, `AbaEnvio.jsx`, `AbaLucro.jsx`, `AbaNotaFiscal.jsx`, `AbaHistorico.jsx`, `RodapeDoPedido.jsx`, `JanelaVincularCliente.jsx` (`role="dialog"`, `propsDoFundo`, busca por nome/documento, "Criar com este nome" chama `criarClienteDoPedidoAcao`, que usa `clienteDoPedido` ignorando a falta de documento)

**Interfaces:**
- Consumes: `lerPedidoDeVenda`, `marcarEmSeparacao`, `salvarCustoDoFreteManual`, `vincularCliente` (Tarefa 9), `TEXTO_DO_AVISO`, `SeloDoNivel`, `IconeDoCanalDoPedido`, `config.travas.nfe`.
- Conteúdo por aba (spec 5.10): **Geral** cliente (link `/cadastros/clientes/[id]`, selo, documento, telefone formatado, e-mail, endereço de entrega) e pagamento (forma, parcelas, valor pago, aprovado em) e totais; sem cliente: aviso âmbar com o botão "Vincular cliente". **Itens** foto, nome, código, ícones Rise (Conferido verde/fosco, `title`) e "fora do Rise" (ícone cinza com `title`), quantidade (com "2× kit" quando `quantidadeDoKit > 1`), preço, custo congelado (só com `dado.custo`; `title` com `custoOrigem`), comissão. **Peças** uma linha por peça: tem / falta / previsão ("sem previsão" em âmbar). **Envio** tipo, serviço, rastreio com link (ML: `https://www.mercadolivre.com.br/vendas/{numero}/detalhe`; Correios: `https://rastreamento.correios.com.br/app/index.php?objeto=`), status + histórico de datas, custo do vendedor com a fonte em `text-suave` ("estimativa" até postar), e o campo "Custo real do frete" **só na origem BLING** (`Campo` numérico, salva no blur). **Lucro** duas colunas (Estimativa × Real), uma linha por parcela com a fonte em `text-suave`, a parcela que mais pesou na diferença em âmbar; bolha "i" com a fórmula; pedido DEVOLVIDO: linha "Devolvido em dd/mm" e o frete de retorno em vermelho; aba some sem `dado.custo`. **Nota fiscal** número, série, chave, data, status, emissor; botões "Baixar NF" e "Baixar XML" **desabilitados** com `title` "Disponível na próxima entrega"; sem NF: "NF ainda não emitida em <canal>". **Histórico** status da origem com data/hora. **Rodapé**: "Abrir no <canal>" (link: ML `https://www.mercadolivre.com.br/vendas/{numero}/detalhe`, LI `https://app.lojaintegrada.com.br/painel/pedido/{numero}`, Bling `https://www.bling.com.br/vendas.php#edit/{blingPedidoId}`), "Abrir no Bling" (quando há espelho), "Marcar em separação" / "Desmarcar" (único botão de estado; desabilitado fora de PAGO/AGUARDANDO_PECAS/EM_SEPARACAO com o motivo no `title`), "Criar NF" desabilitado com `title` "Emissão desligada (NFE_EMISSAO)". `PageHeader` com "Pedido <número>", ícone do canal, data e o ponto do status; `voltarPara="/pedidos"`.

- [ ] **Step 1:** Escrever a página, as abas, o rodapé, a janela e as ações.
- [ ] **Step 2: Verificar no navegador** com os `ZZ-PED-*` mantidos: abrir o pedido do ML (todas as abas com dado), o do Bling (campo do frete aparece e salva, o real muda na aba Lucro), o devolvido (aba Lucro vermelha, "!" `nfACancelar` no cabeçalho), o aguardando peças (aba Peças com previsão), marcar/desmarcar separação, vincular cliente num pedido sem documento. `read_console_messages` sem erro. Screenshots.
- [ ] **Step 3: `ecc:make-interfaces-feel-better`** e ajustar.
- [ ] **Step 4: `npm run teste:acessos`** verde (página e ações conferem acesso).
- [ ] **Step 5: Commit** — `git commit -m "feat(pedidos): pagina do pedido de venda com abas e acoes"`.

---

### Task 14: Nível do cliente no cadastro

**Files:**
- Modify: `src/components/cadastros/FormularioCliente.jsx` (campo "Nível" na aba "Dados cadastrais", opções lado a lado como `EscolhaDoTipo`: Sem nível / Bronze / Prata / Ouro / Platinum; `ABA_DO_CAMPO.nivel = "cadastro"`)
- Modify: `src/app/cadastros/acoes-clientes.js` (`salvarCliente` lê `nivel` do `FormData`; vazio → `null`; valor fora do enum → erro no campo)
- Modify: o esquema zod do cliente (o implementador localiza por `tipoPessoa` em `acoes-clientes.js` ou `src/lib/cadastros/`)
- Test: `scripts/teste-cadastros.js` (uma asserção: salvar com `nivel: "OURO"` grava e `nivel: "x"` recusa)

- [ ] **Step 1: Teste que falha** no `teste-cadastros.js` (no molde das asserções de cliente que já existem lá).
- [ ] **Step 2: Rodar e ver falhar** — `npm run teste:cadastros`.
- [ ] **Step 3: Implementar** o campo, a ação e o esquema. Conferir no navegador no cadastro de um cliente ZZ.
- [ ] **Step 4: Rodar e ver passar** — `teste:cadastros` e `teste:acessos` verdes.
- [ ] **Step 5: Commit** — `git commit -m "feat(clientes): nivel Bronze/Prata/Ouro/Platinum no cadastro"`.

---

### Task 15: Documentação e ritual de fim

**Files:**
- Modify: `CLAUDE.md` (linha "Pedidos" na tabela Estado; seção "Pedidos de venda (04/11/2026)" com: as tabelas, o corte `PEDIDOS_DESDE`, a dedup com o Bling (as três lojas e o ignorado), o frete da LI pelo Enviali, a devolução do ML, a rotina `pedidos` de 5 min e o cursor, o que a fase 2 e a fase 3 ainda devem; `npm run teste:pedidos` na lista de Rodar; "Pedidos, Financeiro | Esqueleto" vira só Financeiro)

- [ ] **Step 1:** Escrever a seção do CLAUDE.md (curta: o que custou caro, não o que o código já diz).
- [ ] **Step 2:** `npm run lint`; `npm run teste:pedidos`, `teste:extracao`, `teste:coleta`, `teste:cadastros`, `teste:acessos`, `teste:saude`, `teste:anuncios-ml`, `teste:li-sync`, `teste:bling-sync` (os falsos mudaram) — todos verdes; `npm run teste:worker` sozinho.
- [ ] **Step 3: Commit** — `git commit -m "docs: modulo Pedidos de venda (fase 1) no CLAUDE.md"` e `git push`. Sem deploy (o dono manda "sobe").
- [ ] **Step 4:** Relatório ao dono: "O que foi feito" (commits, no GitHub, não na VPS) + "Testes que você precisa fazer" (o 1º pedido real de cada canal: o ML e a LI desde 01/11 já têm vendas; conferir cliente criado, lucro estimado × real, o frete do Enviali, "!" e Aguardando peças; e as taxas da LI em Canais de Venda).
