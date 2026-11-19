# Módulo de frete, fase 2 (etiqueta e acompanhamento) — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O Rise compra, imprime e cancela a etiqueta do Melhor Envio, acompanha cada envio pelo worker, leva o custo da etiqueta ao lucro do pedido e avisa o cliente na postagem (e-mail automático e botão de WhatsApp).

**Architecture:** As regras novas (status, motivos de recusa, textos, link de rastreio) ficam puras em `src/lib/frete/regras.js`. O provedor (`src/lib/frete/provedores/melhorEnvio.js`) ganha `comprar`, `imprimir`, `rastrear` e `cancelar`, e é o único que conhece o Melhor Envio. O banco do envio (`src/lib/frete/envios.js`) faz a compra sob escrita condicional. A rotina `envios` do worker (`src/lib/frete/rastreio.js`) consulta a cada 15 minutos e dispara o aviso (`src/lib/frete/aviso.js`, e-mail por `src/lib/email/enviar.js`). As telas usam um painel só (`PainelDoEnvio`) no pedido, no envio avulso e no detalhe do envio.

**Tech Stack:** Next.js (ler `node_modules/next/dist/docs/` antes de escrever rota ou action), JavaScript sem TypeScript, Prisma 7 + PostgreSQL 17, `nodemailer` (dependência nova), testes em `scripts/teste-frete.js` com `conferir(nome, obtido, esperado)`.

**Spec:** `docs/superpowers/specs/2026-11-18-modulo-de-frete-design.md` (aprovada em 18/11/2026). Este plano cobre a fase 2 da seção 6. O reverso, o MCP e o aviso no Telegram ficam na fase 3.

**Execução:** inline, na `main`, sem subagentes (preferência do dono). Um commit por tarefa, só com os arquivos da tarefa (`git commit -- caminhos`). Sem push e sem deploy até o dono pedir.

## Global Constraints

- Interface e código em português; identificadores e comentários sem acento; **texto de tela com acento**. Comentário explica o porquê.
- Padrão visual das 10 regras do `CLAUDE.md`. Uma ação principal por estado do envio. Recusa = botão desabilitado com o motivo no `title`. Janela com `role="dialog"` e `{...propsDoFundo(fechar)}`. Sucesso de compra termina no `ConclusaoDoEnvio`. Cancelar pede confirmação num popup, nunca `confirm()`.
- Tabela nova com `CabecalhoOrdenavel` e `NavegacaoDoTopo`: nasce em 25 por página, com o botão "100 por página". Detalhe aberto da lista volta com `SetaParaLista`.
- Acesso conferido no servidor em toda página (`exigirAcessoNaPagina`) e em toda action.
- **Dinheiro:** carrinho, pagamento, geração e cancelamento passam por `mePost` (trava `FRETE_COMPRA`). Rastrear e imprimir são POST de leitura: passam por `meLer`, sem trava.
- **E-mail:** sai só com a trava `EMAIL_ENVIO=true`. Fechada, o e-mail é montado e o envio fica com `avisoEmailErro = "Não enviado: trava EMAIL_ENVIO fechada."`. SMTP `smtp.gmail.com`, porta 465, `secure: true`. Usuário `EMAIL_SMTP_USUARIO` (contato@4hobby.com.br) e senha de aplicativo `EMAIL_SMTP_SENHA`, os dois no `.env` e nunca em arquivo versionado. Remetente `4hobby <contato@4hobby.com.br>`.
- **Melhor Envio**, documentação lida em 19/11/2026:
  - **Carrinho:** `POST /api/v2/me/cart`. O corpo leva:
    - `service` (id numérico);
    - `from` e `to` com `name`, `phone`, `email`, `document` (CPF, 11 dígitos) ou `company_document` (CNPJ, 14 dígitos), `address`, `number`, `complement`, `district`, `city`, `state_abbr`, `postal_code` e `country_id: "BR"`;
    - `products: [{ name, quantity, unitary_value }]`, **obrigatório e completo** (a DC-e vai à SEFAZ desde 06/04/2026);
    - `volumes: [{ height, width, length, weight }]`, com um volume só;
    - `options: { insurance_value, receipt: false, own_hand: false, reverse: false, non_commercial, invoice?: { key }, platform: "Rise 4hobby", tags: [{ tag, url: null }] }`.
  - **Nota fiscal:** com NF-e vão `options.invoice.key` e `from.state_register` (a inscrição estadual de `DadosDaEmpresa`). Com declaração de conteúdo vão `non_commercial: true`, nada de `invoice` e `state_register` ausente.
  - **Agência:** o `agency` **não é enviado**. A integração por aplicativo usa a agência escolhida no painel do Melhor Envio.
  - **Resposta do carrinho:** `{ id (uuid), protocol, price, status: "pending" }`. O carrinho vale 7 dias.
  - **Azul Cargo:** não se compra pela API, só se cota. O serviço da Azul fica cotável e não comprável.
  - **Pagamento:** `POST /api/v2/me/shipment/checkout { orders: [id] }` devolve `{ purchase: { id, protocol, total, status: "paid" } }`.
  - **Geração:** `POST /api/v2/me/shipment/generate { orders: [id] }` devolve `{ [id]: { status: true, message } }`. A etiqueta gerada vale **20 dias** para postar.
  - **Impressão:** `POST /api/v2/me/shipment/print { mode: "public", orders: [id] }` devolve `{ url }`. O Rise não guarda o link nem o arquivo: pede a cada clique.
  - **Rastreio:** `POST /api/v2/me/shipment/tracking { orders: [ids] }` devolve `{ [id]: { status, tracking, melhorenvio_tracking, created_at, paid_at, generated_at, posted_at, delivered_at, canceled_at, expired_at } }`, com as datas em `"AAAA-MM-DD HH:MM:SS"` lidas como horário de Brasília. Não traz eventos: a linha do tempo do Rise é montada dessas datas.
  - **Pedido (para retomar uma compra pela metade):** `GET /api/v2/me/orders/{id}` devolve o mesmo pedido, com `status` e as datas.
  - **Cancelamento:** `POST /api/v2/me/shipment/cancel { order: { id, reason_id: "2", description } }`. Com a etiqueta já gerada, o estorno cai na carteira em 12 h.
  - **Link de rastreio:** `https://melhorrastreio.com.br/rastreio/{codigo}`.
- **Status do Melhor Envio → Rise:**
  - `pending` → `RASCUNHO`;
  - `released` e `generated` → `A_POSTAR`;
  - `posted` → `POSTADO`;
  - `delivered` → `ENTREGUE`;
  - `undelivered` → `NAO_ENTREGUE`;
  - `paused` e `suspended` → `COM_PROBLEMA`;
  - `canceled` → `CANCELADO`;
  - `expired` → `EXPIRADO`;
  - qualquer outro: mantém o status atual e grava `ultimoErro = "Situação desconhecida do Melhor Envio: <valor>"`.
- **Textos padrão do aviso** (usados quando a `ConfigDeFrete` tem o campo vazio). Os marcadores são `{cliente}`, `{pedido}`, `{transportadora}`, `{servico}`, `{rastreio}` e `{link}`.
  - Assunto: `Seu pedido {pedido} foi postado`
  - E-mail: `Olá, {cliente}!\n\nSeu pedido {pedido} foi postado pela {transportadora} ({servico}).\nCódigo de rastreio: {rastreio}\nAcompanhe a entrega: {link}\n\nObrigado pela compra!\nEquipe 4hobby`
  - WhatsApp: `Olá, {cliente}! Seu pedido {pedido} foi postado pela {transportadora}. Código de rastreio: {rastreio}. Acompanhe: {link}`
- Testes sem rede: o Melhor Envio falso e o transporte de e-mail falso. Só escrevem `ZZ-FRETE-*` e `CX ZZ*`, apagam no começo e no fim, e devolvem a `ConfigDeFrete` e a `Conexao MELHOR_ENVIO` do dono.

## Review Focus

1. **Clique duplo, ou duas abas comprando o mesmo envio:** um carrinho só, uma cobrança só. O segundo pedido recebe "Esta etiqueta já está sendo comprada." Teste na Tarefa 3.
2. **Queda no meio da compra** (o carrinho criado e o pagamento não confirmado, ou pago e não gerado): a próxima tentativa continua pelo `idNoProvedor`, sem criar outro carrinho. Testes na Tarefa 2 (provedor) e na Tarefa 3 (banco).
3. **Saldo insuficiente, trava fechada, Azul Cargo, pacote não conferido ou sem documento:** o botão Comprar fica desabilitado com o motivo, e o servidor recusa igual mesmo que o pedido chegue. Testes na Tarefa 1 (`motivosParaNaoComprar`) e na Tarefa 3.
4. **Melhor Envio fora do ar durante a rotina:** os envios ficam no último estado, com `ultimoErro` e `ultimaConsultaEm` de antes, a rotina registra a falha na Saúde e a tela do pedido abre igual. Teste na Tarefa 6.
5. **Cliente sem e-mail, e-mail recusado pelo SMTP ou duas rotinas ao mesmo tempo:** nunca dois e-mails do mesmo envio. A falha vai para `avisoEmailErro`, ganha o "!" na lista e tem o botão "Reenviar e-mail". Teste na Tarefa 7.

---

### Task 1: Regras puras da fase 2

**Files:**
- Modify: `src/lib/frete/regras.js`
- Modify: `scripts/teste-frete.js` (seção "Regras da fase 2")

**Interfaces:**
- Produces (exportadas de `regras.js`, sem banco e sem rede):
  - `statusDoProvedor(statusME) -> { status: StatusDoEnvioRise | null, desconhecido: boolean }`, pelo mapa das Global Constraints.
  - `servicoCompravel({ transportadora }) -> { ok: boolean, motivo: string | null }`. A Azul (`/azul/i`) devolve "A Azul Cargo não se compra pela API: escolha outro serviço."
  - `motivosParaNaoComprar({ envio, saldo, travaLiberada }) -> string[]`. A lista vazia libera a compra. Motivos, nesta ordem:
    - `"A compra de etiquetas está travada (FRETE_COMPRA)."`
    - `"Esta etiqueta já foi comprada."` (status diferente de `RASCUNHO`)
    - `"Confira a caixa e o peso medidos antes de comprar."` (sem `medidaConferida`)
    - `"Informe a chave da NF-e ou use declaração de conteúdo."` (NFE sem chave de 44 dígitos, ou nenhum documento)
    - `"Declaração de conteúdo sem itens."`
    - o motivo de `servicoCompravel`
    - `"Saldo insuficiente: R$ X na carteira para R$ Y."` (saldo menor que `precoCotado`)
  - `linkDoRastreio(codigo) -> string | null`
  - `dataDoProvedor(texto) -> Date | null`. `"2026-11-19 14:05:00"` vira `2026-11-19T17:05:00.000Z`; vazio vira `null`.
  - `eventosDasDatas(rastreio) -> [{ em, status, descricao }]`, em ordem de data, só com as datas presentes. Descrições: "Etiqueta paga", "Etiqueta gerada", "Postado", "Entregue", "Não entregue", "Cancelado" e "Expirado".
  - `validadeDaEtiqueta(geradoEm) -> Date` (20 dias depois).
  - `TEXTOS_DO_AVISO = { assunto, email, whatsapp }` e `preencherTexto(modelo, dados) -> string`. Marcador sem dado vira vazio; espaço duplo vira um.

- [ ] **Step 1: Escrever os testes**

```js
conferir("status: generated", statusDoProvedor("generated"), { status: "A_POSTAR", desconhecido: false });
conferir("status: paused", statusDoProvedor("paused").status, "COM_PROBLEMA");
conferir("status: desconhecido", statusDoProvedor("waiting_xyz"), { status: null, desconhecido: true });
conferir("azul não compra", servicoCompravel({ transportadora: "Azul Cargo Express" }).ok, false);
conferir("jadlog compra", servicoCompravel({ transportadora: "Jadlog" }).ok, true);
const pronto = { status: "RASCUNHO", medidaConferida: true, tipoDeDocumento: "NFE", chaveNfe: "4".repeat(44), precoCotado: 25.84, transportadoraNome: "Correios" };
conferir("pronto para comprar", motivosParaNaoComprar({ envio: pronto, saldo: 100, travaLiberada: true }), []);
conferir("trava vem primeiro", motivosParaNaoComprar({ envio: pronto, saldo: 100, travaLiberada: false })[0], "A compra de etiquetas está travada (FRETE_COMPRA).");
conferir("saldo curto", motivosParaNaoComprar({ envio: pronto, saldo: 10, travaLiberada: true }), ["Saldo insuficiente: R$ 10,00 na carteira para R$ 25,84."]);
conferir("chave curta", motivosParaNaoComprar({ envio: { ...pronto, chaveNfe: "123" }, saldo: 100, travaLiberada: true }), ["Informe a chave da NF-e ou use declaração de conteúdo."]);
conferir("declaração sem itens", motivosParaNaoComprar({ envio: { ...pronto, tipoDeDocumento: "DECLARACAO", chaveNfe: null, itensDaDeclaracao: [] }, saldo: 100, travaLiberada: true }), ["Declaração de conteúdo sem itens."]);
conferir("medida não conferida", motivosParaNaoComprar({ envio: { ...pronto, medidaConferida: false }, saldo: 100, travaLiberada: true }), ["Confira a caixa e o peso medidos antes de comprar."]);
conferir("link", linkDoRastreio("ME23002OWZ7BR"), "https://melhorrastreio.com.br/rastreio/ME23002OWZ7BR");
conferir("data de Brasília", dataDoProvedor("2026-11-19 14:05:00")?.toISOString(), "2026-11-19T17:05:00.000Z");
conferir("eventos", eventosDasDatas({ paid_at: "2026-11-19 10:00:00", generated_at: "2026-11-19 10:01:00", posted_at: null }).map((e) => e.descricao), ["Etiqueta paga", "Etiqueta gerada"]);
conferir("validade 20 dias", validadeDaEtiqueta(new Date("2026-11-19T12:00:00Z")).toISOString(), "2026-12-09T12:00:00.000Z");
conferir("texto preenchido", preencherTexto("Pedido {pedido} via {transportadora}. {rastreio}", { pedido: "1234", transportadora: "Jadlog" }), "Pedido 1234 via Jadlog.");
```

- [ ] **Step 2: Rodar e ver falhar.** `npm run teste:frete`. Esperado: FAIL, "statusDoProvedor is not a function".
- [ ] **Step 3: Implementar as funções em `regras.js`.** O dinheiro da mensagem do saldo usa o `Intl.NumberFormat` pt-BR. Chave da NF-e = 44 dígitos depois de tirar o que não é dígito.
- [ ] **Step 4: Rodar.** `npm run teste:frete`. Esperado: todas passam, as da fase 1 incluídas.
- [ ] **Step 5: Commit.** `git commit -m "Frete fase 2: regras da compra, do rastreio e do aviso" -- src/lib/frete/regras.js scripts/teste-frete.js`

### Task 2: Provedor: comprar, imprimir, rastrear e cancelar

**Files:**
- Modify: `src/lib/frete/provedores/melhorEnvio.js`
- Modify: `scripts/teste-frete.js` (o Melhor Envio falso ganha `/cart`, `/shipment/checkout`, `/shipment/generate`, `/shipment/print`, `/shipment/tracking`, `/shipment/cancel` e `GET /orders/:id`, com estado em memória e falhas sob comando)

**Interfaces:**
- Consumes: `meGet`, `meLer`, `mePost` (`integracoes/melhorenvio.js`); `statusDoProvedor`, `dataDoProvedor` e `validadeDaEtiqueta` (Tarefa 1).
- Produces (no objeto `melhorEnvio`):
  - `comprar(envio, { aoCriarNoCarrinho }) -> { idNoProvedor, protocolo, custo, rastreio, validoAte, geradoEm }`. `envio` é a linha do banco com `remetente`, `destinatario`, pacote, documento, `itensDaDeclaracao`, `servicoId`, `numero`, `idNoProvedor` e `pedidoNumero` (opcional).
    - Sem `idNoProvedor`: monta o carrinho (`corpoDoCarrinho`), chama `aoCriarNoCarrinho(id, protocolo)` **antes** do pagamento, depois paga e gera.
    - Com `idNoProvedor`: lê `GET /orders/{id}`. Se está `pending`, paga e gera. Se está `released` ou `paid` sem `generated_at`, só gera. Se já foi gerado, só devolve.
    - O `custo` é o `price` do pedido do Melhor Envio.
  - `corpoDoCarrinho(envio) -> object` (exportada para o teste): os campos das Global Constraints. O `tags[0].tag` é `"Pedido <pedidoNumero>"` ou `"ENV-0001"`.
  - `imprimir(envio) -> { url }`
  - `rastrear(ids: string[]) -> Map<id, { status, desconhecido, statusOriginal, rastreio, datas, eventos }>`, em lotes de até 100 ids por chamada.
  - `cancelar(envio, motivo) -> { ok: true }`
  - Falhas viram `ErroDoProvedor`, como na fase 1. O 422 do carrinho vira `RECUSADO` com a primeira mensagem de `errors`.

- [ ] **Step 1: Estender o Melhor Envio falso** com um mapa `pedidosFalsos` (id → `{ status, price, tracking, datas }`) e os comandos `falharEm: "checkout" | "generate" | "tracking" | null`. O `/cart` grava o corpo recebido em `ultimoCarrinho` para o teste conferir.
- [ ] **Step 2: Escrever os testes**

```js
const envioZZ = { numero: 9001, servicoId: "1", remetente: REMETENTE_ZZ, destinatario: DESTINATARIO_ZZ, comprimentoCm: 16, larguraCm: 11, alturaCm: 3, pesoKg: 0.165, valorDeclarado: 98, tipoDeDocumento: "NFE", chaveNfe: "4".repeat(44), itensDaDeclaracao: [{ descricao: "ZZ item", quantidade: 1, valorUnitario: 98 }], idNoProvedor: null };
const corpo = melhorEnvio.corpoDoCarrinho(envioZZ);
conferir("carrinho: um volume", corpo.volumes.length, 1);
conferir("carrinho: nota", [corpo.options.invoice?.key, corpo.options.non_commercial, Boolean(corpo.from.state_register)], ["4".repeat(44), false, true]);
conferir("carrinho: sem agency", "agency" in corpo, false);
conferir("carrinho: declaração", (({ options, from }) => [options.invoice, options.non_commercial, from.state_register])(melhorEnvio.corpoDoCarrinho({ ...envioZZ, tipoDeDocumento: "DECLARACAO", chaveNfe: null })), [undefined, true, undefined]);
conferir("carrinho: CNPJ em company_document", corpo.from.company_document?.length, 14);
let criado = null;
const compra = await melhorEnvio.comprar(envioZZ, { aoCriarNoCarrinho: (id) => (criado = id) });
conferir("compra completa", [Boolean(criado), compra.idNoProvedor === criado, compra.custo, Boolean(compra.validoAte)], [true, true, 25.84, true]);
falharEm = "checkout";
let idPelaMetade = null;
await melhorEnvio.comprar(envioZZ, { aoCriarNoCarrinho: (id) => (idPelaMetade = id) }).catch(() => {});
falharEm = null;
const carrinhosAntes = contarCarrinhos();
const retomada = await melhorEnvio.comprar({ ...envioZZ, idNoProvedor: idPelaMetade }, { aoCriarNoCarrinho: () => { throw new Error("não devia criar"); } });
conferir("retoma sem novo carrinho", [contarCarrinhos(), retomada.idNoProvedor], [carrinhosAntes, idPelaMetade]);
conferir("rastrear mapeia", (await melhorEnvio.rastrear([criado])).get(criado).status, "A_POSTAR");
conferir("imprimir devolve link", typeof (await melhorEnvio.imprimir({ idNoProvedor: criado })).url, "string");
conferir("cancelar", (await melhorEnvio.cancelar({ idNoProvedor: criado }, "teste")).ok, true);
```

- [ ] **Step 3: Rodar e ver falhar.** `npm run teste:frete`. Esperado: FAIL, "corpoDoCarrinho is not a function".
- [ ] **Step 4: Implementar** em `melhorEnvio.js`. O documento sai pelos dígitos: 11 vai em `document`, 14 em `company_document`. O telefone vai só com os dígitos. O `products` sai de `itensDaDeclaracao` (nome cortado em 100 caracteres, valor com 2 casas). Trocar `comprar`, `imprimir`, `rastrear` e `cancelar` (hoje `daFase2`).
- [ ] **Step 5: Rodar.** `npm run teste:frete`. Esperado: todas passam.
- [ ] **Step 6: Commit.** `git commit -m "Frete fase 2: provedor compra, imprime, rastreia e cancela" -- src/lib/frete/provedores/melhorEnvio.js scripts/teste-frete.js`

### Task 3: Conferir o pacote e comprar a etiqueta (banco)

**Files:**
- Create: `prisma/migrations/20261119_frete_fase_2/migration.sql` (`ALTER TYPE "StatusDoEnvioRise" ADD VALUE 'COMPRANDO' AFTER 'RASCUNHO';`)
- Modify: `prisma/schema.prisma` (`COMPRANDO` no enum, com o comentário do porquê)
- Modify: `src/lib/frete/envios.js`
- Modify: `scripts/teste-frete.js`

**Interfaces:**
- Consumes: `cotarFrete` (`cotacao.js`, fase 1); `motivosParaNaoComprar` (Tarefa 1); `provedor.comprar` e `provedor.saldo` (Tarefa 2); `config.travas.freteCompra`.
- Produces:
  - `conferirPacote(envioId, { caixaId, comprimentoCm, larguraCm, alturaCm, pesoKg, tipoDeDocumento, chaveNfe, itensDaDeclaracao }, login) -> { ok, envio, preco, saldo, motivos } | { ok: false, erro }`.
    - Só em `RASCUNHO`.
    - Cota de novo com o pacote medido e acha o **mesmo** `servicoId` na lista. Se ele sumiu, devolve "O serviço escolhido não atende o pacote medido: cote de novo."
    - Grava `medidaConferida: true`, o pacote, o documento, o `precoCotado` novo e o `cotadoEm`.
    - Devolve o saldo lido e os `motivos` de `motivosParaNaoComprar`.
  - `comprarEtiqueta(envioId, login) -> { ok: true, envio } | { ok: false, erro }`.
    - Lê o saldo e confere os motivos.
    - Faz `updateMany({ where: { id, status: "RASCUNHO" }, data: { status: "COMPRANDO" } })`. Se nada mudou, devolve "Esta etiqueta já está sendo comprada."
    - Chama `comprar` com `aoCriarNoCarrinho`, que grava `idNoProvedor` e `protocolo` na hora.
    - Sucesso: grava `A_POSTAR`, `custo`, `compradoEm`, `compradoPor: login`, `rastreio`, `linkDoRastreio`, `validoAte` e `eventos`, e chama `recalcularLucroDoPedido` (Tarefa 4) quando há `pedidoDeVendaId`.
    - Falha: volta a `RASCUNHO`, guardando `idNoProvedor`, com `ultimoErro`.
  - `destinatarioDoPedido` passa a usar `cliente.email` e `cliente.telefone` quando o pedido não traz os dele. O `itensDaDeclaracao` passa a ser preenchido no rascunho com os itens do pedido (`{ descricao: nome, quantidade, valorUnitario: precoUnitario }`).
  - `lerEnvioDoPedido` passa a tratar `COMPRANDO` como vivo, sem mudar a assinatura.

- [ ] **Step 1: Migration e schema.** `npx prisma migrate dev --name frete_fase_2 --create-only`, conferir que o SQL é só o `ALTER TYPE`, aplicar com `npx prisma migrate dev` e rodar `npx prisma generate`.
- [ ] **Step 2: Escrever os testes**, com um pedido `ZZ-FRETE-PED` e o rascunho da fase 1.

```js
conferir("conferir recota e marca medida", (await conferirPacote(envio.id, { ...pacoteMedido, tipoDeDocumento: "NFE", chaveNfe: "4".repeat(44) }, "zz")).envio.medidaConferida, true);
conferir("trava fechada recusa", (await comprarEtiqueta(envio.id, "zz")).erro, "A compra de etiquetas está travada (FRETE_COMPRA).");
liberarTrava();
const [a, b] = await Promise.all([comprarEtiqueta(envio.id, "zz"), comprarEtiqueta(envio.id, "zz")]);
conferir("clique duplo: um compra", [a.ok, b.ok].filter(Boolean).length, 1);
conferir("clique duplo: um carrinho", contarCarrinhos() - carrinhosAntes, 1);
conferir("comprado", (await lerEnvio(envio.id)).status, "A_POSTAR");
conferir("quem comprou", (await lerEnvio(envio.id)).compradoPor, "zz");
// queda no pagamento: volta a RASCUNHO com idNoProvedor, e a 2a tentativa nao cria carrinho
conferir("queda guarda o id", [(await lerEnvio(envio2.id)).status, Boolean((await lerEnvio(envio2.id)).idNoProvedor)], ["RASCUNHO", true]);
conferir("saldo curto recusa", (await comprarEtiqueta(envio3.id, "zz")).erro.startsWith("Saldo insuficiente"), true);
```

- [ ] **Step 3: Rodar e ver falhar.** Esperado: FAIL, "conferirPacote is not a function".
- [ ] **Step 4: Implementar** em `envios.js`. O saldo vem de `provedor.saldo()`. Um saldo que não se lê vira recusa ("Não foi possível ler o saldo do Melhor Envio."), nunca uma compra às cegas.
- [ ] **Step 5: Rodar.** `npm run teste:frete`. Esperado: todas passam.
- [ ] **Step 6: Commit.** `git commit -m "Frete fase 2: conferir o pacote e comprar a etiqueta sem compra em dobro" -- prisma/schema.prisma prisma/migrations/20261119_frete_fase_2 src/lib/frete/envios.js scripts/teste-frete.js`

### Task 4: Custo da etiqueta no lucro do pedido

**Files:**
- Modify: `src/lib/pedidos/lucro.js` (`parcelasDoReal`)
- Modify: `src/lib/pedidos/banco.js` (a leitura do pedido e `salvarCustoDoFreteManual`)
- Create: `src/lib/frete/lucro.js`
- Modify: `scripts/teste-frete.js`

**Interfaces:**
- Produces:
  - `parcelasDoReal({ ..., custoDaEtiqueta = null })`. No ramo do Bling (o `else`), um `custoDaEtiqueta` não nulo **vence o manual**, com `fontes.frete = "etiqueta"`.
  - `custoDaEtiquetaDoPedido(db, pedidoDeVendaId) -> number | null`, em `src/lib/frete/lucro.js`: o `custo` do envio de ida em `A_POSTAR`, `POSTADO`, `ENTREGUE`, `NAO_ENTREGUE` ou `COM_PROBLEMA`. O cancelado e o expirado não contam.
  - `recalcularLucroDoPedido(pedidoDeVendaId) -> { ok, real }`, em `src/lib/frete/lucro.js`. Refaz o real **mesmo com o lucro fechado** (a compra ou o cancelamento mudam o custo) e o aviso `lucroDivergente`, como `salvarCustoDoFreteManual` faz.
  - Os dois `parcelasDoReal(...)` de `banco.js` passam `custoDaEtiqueta: await custoDaEtiquetaDoPedido(tx, pedido.id)`. Sem isso, a leitura do Bling a cada 5 minutos apagaria o custo da etiqueta.

- [ ] **Step 1: Escrever os testes.** Montar um pedido BLING `ZZ-FRETE-PED` com `custoDoFreteManual` 30 e um envio `A_POSTAR` com `custo` 25.84.

```js
conferir("etiqueta vence manual", parcelasDoReal({ origem: "BLING", itens, totais, custoDoFreteManual: 30, custoDaEtiqueta: 25.84 }).fontes.frete, "etiqueta");
await recalcularLucroDoPedido(pedido.id);
conferir("real com etiqueta", Number((await prisma.pedidoDeVenda.findUnique({ where: { id: pedido.id } })).real.frete), 25.84);
await prisma.envio.update({ where: { id: envio.id }, data: { status: "CANCELADO" } });
await recalcularLucroDoPedido(pedido.id);
conferir("cancelado volta ao manual", (await prisma.pedidoDeVenda.findUnique({ where: { id: pedido.id } })).real.fontes.frete, "manual");
```

- [ ] **Step 2: Rodar e ver falhar.** Esperado: FAIL na primeira (`fontes.frete` = "manual").
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** `npm run teste:frete` **e** `npm run teste:pedidos` (as 312 asserções dos pedidos continuam passando).
- [ ] **Step 5: Commit.** `git commit -m "Frete fase 2: custo da etiqueta no lucro do pedido" -- src/lib/pedidos/lucro.js src/lib/pedidos/banco.js src/lib/frete/lucro.js scripts/teste-frete.js`

### Task 5: Imprimir e cancelar (banco) e as actions do envio

**Files:**
- Modify: `src/lib/frete/envios.js`
- Create: `src/app/envios/acoes.js`
- Modify: `src/lib/acessos/recursos.js`
- Modify: `scripts/teste-frete.js`

**Interfaces:**
- Produces:
  - `linkDaEtiqueta(envioId) -> { ok, url } | { ok: false, erro }`. Só em `A_POSTAR` e `POSTADO`.
  - `cancelarEtiqueta(envioId, motivo, login) -> { ok, envio } | { ok: false, erro }`. Só em `A_POSTAR`. Chama `provedor.cancelar`, grava `CANCELADO` e `canceladoEm` e recalcula o lucro. Uma recusa do provedor sai com o texto dele.
  - Actions em `src/app/envios/acoes.js`:
    - com `acao.envios.comprarEtiqueta`: `conferirPacoteAcao`, `comprarEtiquetaAcao` e `cancelarEtiquetaAcao`;
    - com `tela.envios` **ou** `tela.pedidos` em `ver`: `imprimirEtiquetaAcao`;
    - com `acao.envios.avisarCliente`: `reenviarEmailAcao` e `marcarWhatsappAcao` (implementadas na Tarefa 7);
    - `saldoDoProvedorAcao`.
  - Recursos novos:
    - `tela("tela.envios", "Envios", "/envios")`
    - `acao("acao.envios.comprarEtiqueta", "Comprar e cancelar etiqueta de frete", "tela.envios", "Gasta o saldo da carteira do Melhor Envio.")`
    - `acao("acao.envios.avisarCliente", "Reenviar o e-mail e marcar o WhatsApp do envio", "tela.envios")`

- [ ] **Step 1: Testes** de `linkDaEtiqueta` em rascunho (recusa) e em `A_POSTAR` (devolve a URL do falso), de `cancelarEtiqueta` (status, data e o real de volta ao manual), do cancelamento que o provedor recusa (fica `A_POSTAR` e devolve o texto), e do guarda de Acessos (`npm run teste:acessos` com os recursos novos).
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar** `npm run teste:frete` e `npm run teste:acessos`. Esperado: todas passam.
- [ ] **Step 5: Commit.** `git commit -m "Frete fase 2: imprimir, cancelar e as actions do envio" -- src/lib/frete/envios.js src/app/envios/acoes.js src/lib/acessos/recursos.js scripts/teste-frete.js`

### Task 6: Rotina `envios` do worker (rastreio a cada 15 minutos)

**Files:**
- Create: `src/lib/frete/rastreio.js`
- Modify: `scripts/worker-processo.js`
- Modify: `src/lib/saude/regras.js` (`{ id: "envios", rotulo: "Envios (rastreio)" }`)
- Modify: `scripts/teste-frete.js`

**Interfaces:**
- Consumes: `provedor.rastrear` (Tarefa 2), `eventosDasDatas` (Tarefa 1), `avisarCliente` (Tarefa 7, chamado por injeção para a tarefa 6 poder ser testada antes).
- Produces:
  - `rodarRastreioDosEnvios({ agora = new Date(), avisar = avisarCliente } = {}) -> { ok, consultados, mudados, avisados, expirados, erro? }`.
    1. Pega os envios em `A_POSTAR`, `POSTADO` e `COM_PROBLEMA` que têm `idNoProvedor`.
    2. Chama `rastrear` em lotes.
    3. Grava status, `rastreio`, `linkDoRastreio`, `postadoEm`, `entregueEm`, `canceladoEm`, `eventos` e `ultimaConsultaEm`, só quando algo mudou.
    4. Na passagem para `POSTADO` (o `momentoDoAviso`), chama `avisar(envio.id)`.
    5. `A_POSTAR` com `validoAte` vencido vira `EXPIRADO`.
    6. Status desconhecido: mantém o atual e grava `ultimoErro`.
    7. Provedor fora do ar: devolve `{ ok: false, erro }` sem mexer em nenhum envio.
  - No worker: `rodarRotina("envios", 15 * 60 * 1000, () => rodarRastreioDosEnvios())`, só o worker normal (`!FONTES && !SO_NO_PC`), com log de quantos mudaram, no molde de `comprasML`.

- [ ] **Step 1: Testes** contra o falso:

```js
pedidosFalsos.get(id).status = "posted"; pedidosFalsos.get(id).datas.posted_at = "2026-11-19 15:00:00";
const avisos = [];
const r1 = await rodarRastreioDosEnvios({ avisar: async (envioId) => avisos.push(envioId) });
conferir("postado", [(await lerEnvio(envio.id)).status, r1.mudados, avisos.length], ["POSTADO", 1, 1]);
const r2 = await rodarRastreioDosEnvios({ avisar: async (envioId) => avisos.push(envioId) });
conferir("sem mudança não reescreve nem reavisa", [r2.mudados, avisos.length], [0, 1]);
conferir("expirado", (await rodarRastreioDosEnvios({ agora: new Date("2027-01-01"), avisar: async () => {} })).expirados, 1);
falharEm = "tracking";
conferir("fora do ar não mexe", [(await rodarRastreioDosEnvios({ avisar: async () => {} })).ok, (await lerEnvio(envio.id)).status], [false, "POSTADO"]);
```

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** `rastreio.js`, ligar no worker e na lista de rotinas da Saúde.
- [ ] **Step 4: Rodar** `npm run teste:frete` e `npm run teste:saude`.
- [ ] **Step 5: Commit.** `git commit -m "Frete fase 2: rotina de rastreio dos envios no worker" -- src/lib/frete/rastreio.js scripts/worker-processo.js src/lib/saude/regras.js scripts/teste-frete.js`

### Task 7: Aviso ao cliente (e-mail automático e WhatsApp)

**Files:**
- Modify: `package.json` (`npm install nodemailer`)
- Create: `src/lib/email/enviar.js`
- Create: `src/lib/frete/aviso.js`
- Modify: `src/lib/integracoes/config.js` (`travas.emailEnvio: lerBooleano("EMAIL_ENVIO")` e `email: { usuario: ler("EMAIL_SMTP_USUARIO"), senha: ler("EMAIL_SMTP_SENHA") }`)
- Modify: `src/lib/frete/configuracao.js`, `src/components/frete/FormularioDeEnvios.jsx` e `src/app/configuracoes/envios/acoes.js` (os campos assunto, texto do e-mail e texto do WhatsApp, com os padrões como placeholder e a bolha listando os marcadores)
- Modify: `src/app/envios/acoes.js` (`reenviarEmailAcao`, `marcarWhatsappAcao`)
- Modify: `.env.example` (as três linhas novas, sem valor)
- Modify: `scripts/teste-frete.js`

**Interfaces:**
- Produces:
  - `enviarEmail({ para, assunto, texto }, { transporte } = {}) -> { ok: true, id } | { ok: false, erro, trava?: true }`. Com a trava fechada não chama o transporte. O transporte padrão é o `nodemailer.createTransport` com o SMTP das Global Constraints, criado uma vez.
  - `dadosDoAviso(envio, pedido) -> { cliente, pedido, transportadora, servico, rastreio, link }`. `pedido` = `pedido.numero` ou `numeroDoEnvio(envio.numero)`; `cliente` = o primeiro nome do destinatário.
  - `avisarCliente(envioId, { transporte } = {}) -> { ok, enviado: boolean, erro? }`.
    - **Uma vez só:** `updateMany({ where: { id, avisoEmailEm: null }, data: { avisoEmailEm: agora, avisoEmailErro: null } })`. Se nada mudou, retorna `{ ok: true, enviado: false }`.
    - Sem e-mail no destinatário: devolve a marca e grava `avisoEmailErro = "Cliente sem e-mail: use o WhatsApp."`.
    - Falha do SMTP ou trava fechada: devolve `avisoEmailEm` a `null` e grava o erro, para o "Reenviar e-mail" poder tentar de novo.
  - `reenviarEmail(envioId)`: limpa `avisoEmailErro` e chama `avisarCliente`. Recusa quando `avisoEmailEm` já está preenchido ("O e-mail já foi enviado em dd/mm hh:mm.").
  - `linkDoWhatsappDoEnvio(envio, pedido, config) -> string | null`, com o `linkDoWhatsApp` de `src/lib/propostas/regras.js` e o texto preenchido. Sem telefone, `null`.
  - `marcarWhatsapp(envioId) -> { ok }`: grava `avisoWhatsappEm`.

- [ ] **Step 1: Testes** com um transporte falso (`{ sendMail: async (m) => (enviados.push(m), { messageId: "zz" }) }`):

```js
conferir("trava fechada não chama o transporte", [(await avisarCliente(envio.id, { transporte })).enviado, enviados.length], [false, 0]);
conferir("trava fechada deixa o erro", (await lerEnvio(envio.id)).avisoEmailErro, "Não enviado: trava EMAIL_ENVIO fechada.");
liberarTravaDeEmail();
await Promise.all([avisarCliente(envio.id, { transporte }), avisarCliente(envio.id, { transporte })]);
conferir("um e-mail só", enviados.length, 1);
conferir("assunto preenchido", enviados[0].subject, "Seu pedido ZZ-FRETE-PED foi postado");
conferir("remetente", enviados[0].from, "4hobby <contato@4hobby.com.br>");
conferir("sem e-mail", (await avisarCliente(envioSemEmail.id, { transporte })).erro, "Cliente sem e-mail: use o WhatsApp.");
conferir("smtp recusa libera o reenvio", [(await avisarCliente(envioRuim.id, { transporte: transporteQueFalha })).ok, (await lerEnvio(envioRuim.id)).avisoEmailEm], [false, null]);
conferir("whatsapp", linkDoWhatsappDoEnvio(envioPostado, pedidoZZ, {}).startsWith("https://wa.me/55"), true);
```

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Instalar o `nodemailer` e implementar.** Na rotina da Tarefa 6, o `avisar` padrão passa a ser este `avisarCliente`.
- [ ] **Step 4: Rodar** `npm run teste:frete`. Esperado: todas passam.
- [ ] **Step 5: Commit.** `git commit -m "Frete fase 2: aviso ao cliente por e-mail e WhatsApp" -- package.json package-lock.json src/lib/email/enviar.js src/lib/frete/aviso.js src/lib/integracoes/config.js src/lib/frete/configuracao.js src/components/frete/FormularioDeEnvios.jsx src/app/configuracoes/envios/acoes.js src/app/envios/acoes.js .env.example scripts/teste-frete.js`

### Task 8: Painel do envio no pedido de venda

**Files:**
- Create: `src/components/frete/PainelDoEnvio.jsx` (no lugar do `EnvioDoPedido.jsx`, que passa a só embrulhar o painel)
- Create: `src/components/frete/JanelaDeCompra.jsx`
- Create: `src/components/frete/JanelaDeCancelamento.jsx`
- Modify: `src/components/frete/EnvioDoPedido.jsx`
- Modify: `src/app/pedidos/[id]/page.jsx` (o `pode` ganha `comprarEtiqueta` e `avisarCliente`; o `frete` ganha `saldo`, lido sem derrubar a página, e `travaLiberada`)
- Modify: o campo "Custo real do frete" da aba Envio do pedido (achar com `grep -rn editarCustoDoFrete src/components/pedidos`): some quando há envio comprado e mostra "R$ X · da etiqueta do Melhor Envio"

**Interfaces:**
- Consumes: as actions da Tarefa 5 e da Tarefa 7, e `motivosParaNaoComprar` (Tarefa 1, para desabilitar o botão no navegador; o servidor confere de novo).
- Produces: `PainelDoEnvio({ envio, contexto: { tipo: "pedido" | "avulso", pedido? }, caixas, saldo, travaLiberada, pode, aoCotar })`. A linha-guia: "o operador vê primeiro em que passo o envio está; a ação principal é o próximo passo". Por status:
  - **sem envio:** **Cotar frete**, como na fase 1.
  - **RASCUNHO:** os dados do serviço e **Comprar etiqueta**, que abre a `JanelaDeCompra`. A janela tem dois passos:
    - (1) **Pacote medido:** caixa, peso, e o documento escolhido em `EscolhaDoTipo` entre "NF-e" e "Declaração de conteúdo". A NF-e já vem com a chave de `pedido.nf.chave`; sem nota no pedido, a declaração vem marcada. O botão é **Conferir preço**.
    - (2) **Confirmação:** serviço, prazo, valor, saldo antes e depois, e **Comprar por R$ X**, desabilitado com o motivo quando `motivos` não está vazio.
    - O sucesso abre o `ConclusaoDoEnvio`, com o rastreio. "Cotar de novo" fica como ação secundária.
  - **COMPRANDO:** um "Comprando…" com spinner e, depois de 2 minutos, "Tentar de novo" (o mesmo `comprarEtiquetaAcao`, que retoma pelo `idNoProvedor`).
  - **A_POSTAR:** **Imprimir etiqueta** (abre o link numa aba nova), o rastreio com link, a data-limite de postagem (`validoAte`) e, no menu ⋮, **Cancelar etiqueta**, que abre a `JanelaDeCancelamento` com o valor que volta à carteira e o aviso do estorno em 12 h.
  - **POSTADO em diante:** a linha do tempo (`eventos`), a situação do e-mail (enviado em…, erro com **Reenviar e-mail**), o botão **WhatsApp** (abre `wa.me` e marca `avisoWhatsappEm`) e o "!" quando não há e-mail nem WhatsApp marcado.
  - **CANCELADO ou EXPIRADO:** uma linha cinza e **Cotar frete** de novo.

- [ ] **Step 1: Ler** `node_modules/next/dist/docs/` sobre server actions e `router.refresh`, e o `ConclusaoDoEnvio` e o `propsDoFundo` já usados.
- [ ] **Step 2: Desenhar com a skill `frontend-design`**, com as 10 regras como restrição. Depois, passar por `ecc:make-interfaces-feel-better`.
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Conferir no navegador** contra o falso: `npm run teste:frete -- --servir --porta=4599` e `MELHOR_ENVIO_URL=http://127.0.0.1:4599` com `FRETE_COMPRA=true` só no ambiente do `npm run dev`. Num pedido Bling de teste, percorrer cotar, conferir, comprar, imprimir, cancelar e cotar de novo, e o postado (o falso muda o status por comando). Largura de notebook; console sem erro.
- [ ] **Step 5: Rodar** `npm run lint` e `npm run teste:frete`.
- [ ] **Step 6: Commit** dos arquivos da tarefa: `git commit -m "Frete fase 2: comprar, imprimir e acompanhar o envio no pedido" -- <arquivos>`

### Task 9: Lista de Envios (bloco novo)

**Files:**
- Modify: `src/lib/blocos.js` (bloco `{ href: "/envios", rotulo: "Envios", icone: Truck, resumo: "Etiquetas, rastreio e aviso ao cliente", pronto: true }`, logo depois de Propostas)
- Create: `src/app/envios/page.jsx`
- Create: `src/components/frete/TabelaDeEnvios.jsx`
- Modify: `src/lib/frete/envios.js` (`listarEnvios`)
- Modify: `scripts/teste-frete.js`

**Interfaces:**
- Produces: `listarEnvios({ status, direcao, busca, ordenar, sentido, pagina, por }) -> { linhas, total, contagemPorStatus }`.
  - A ordem e a página são feitas no banco. Ordena por `numero`, `criadoEm`, `status`, `custo` e `postadoEm`; o padrão é `numero desc`.
  - A busca procura no número (`ENV-0012` ou `12`), no rastreio, no nome do destinatário (`destinatario->>'nome'`, sem acento nem caixa) e no número do pedido vinculado.
  - Cada linha leva o vínculo (pedido com número e link), a situação, o serviço, o rastreio, o custo, o aviso (e-mail, erro ou WhatsApp) e `pendenteDeAviso` (postado sem e-mail enviado e sem WhatsApp marcado).
- Tela (`/envios`, `exigirAcessoNaPagina("tela.envios", "ver")`). A linha-guia: "o operador vê primeiro o que está a postar e o que deu problema; a ação principal é Novo envio".
  - **Topo:** filtro de situação (chips com a contagem), busca, `NavegacaoDoTopo` e, discreto à direita, o saldo da carteira com o link do painel do Melhor Envio. Saldo que não se lê some.
  - **Colunas:** Nº, Data, Destinatário, Vínculo, Serviço, Situação, Rastreio, Custo (só com `dado.custo`) e Aviso ("!" âmbar no `pendenteDeAviso`).
  - O número abre `/envios/[id]` (Tarefa 10). `LembrarLista` guarda o endereço da lista.

- [ ] **Step 1: Testes** de `listarEnvios`: filtro por status, busca pelo rastreio e pelo nome sem acento, a ordem por custo com os nulos no fim, a página 2 com `por: 1` e o `pendenteDeAviso`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar** a função, a página e o bloco. Recurso `tela.envios` da Tarefa 5.
- [ ] **Step 4: Conferir no navegador** (filtros, ordem, 100 por página, voltar do detalhe) e rodar `npm run teste:navegacao` (o bloco novo no menu e no Painel).
- [ ] **Step 5: Commit.** `git commit -m "Frete fase 2: lista de Envios" -- src/lib/blocos.js src/app/envios/page.jsx src/components/frete/TabelaDeEnvios.jsx src/lib/frete/envios.js scripts/teste-frete.js`

### Task 10: Envio avulso e detalhe do envio

**Files:**
- Create: `src/app/envios/novo/page.jsx`
- Create: `src/app/envios/[id]/page.jsx`
- Create: `src/components/frete/FormularioDeEnvioAvulso.jsx`
- Modify: `src/lib/frete/envios.js` (`criarEnvioAvulso`, `lerEnvio`)
- Modify: `src/app/envios/acoes.js` (`criarEnvioAvulsoAcao`)
- Modify: `scripts/teste-frete.js`

**Interfaces:**
- Produces:
  - `criarEnvioAvulso({ destinatario, pacote, servico, cotadoEm, itensDaDeclaracao }, login) -> { ok, envio } | { ok: false, erro }`.
    - O destinatário precisa de nome, CEP de 8 dígitos, logradouro, número, bairro, cidade e UF.
    - O número sai sob a mesma trava de `envio.numero`. O remetente é de `DadosDaEmpresa`. O documento padrão é `DECLARACAO`.
    - Fica em `RASCUNHO`, sem vínculo.
  - `lerEnvio(id) -> envio | null`, com o pedido vinculado (`id`, `numero`, `nf`) e a caixa.
- Telas:
  - `/envios/novo` (`acao.envios.comprarEtiqueta`). O destinatário é escolhido em `EscolhaDoTipo` entre "Cliente", "Fornecedor" e "Digitar". Cliente e fornecedor vêm de uma busca nos cadastros e copiam o endereço, o e-mail e o telefone, que continuam editáveis. Depois vêm os itens da declaração (descrição, quantidade e valor) e o `CotadorDeFrete` da fase 1. Escolher o serviço cria o envio e leva a `/envios/[id]`.
  - `/envios/[id]` (`tela.envios`): `SetaParaLista`, título `ENV-0012`, e o `PainelDoEnvio` (Tarefa 8) com `contexto.tipo = "avulso"` (ou `"pedido"`, quando vinculado, com o link para o pedido).

- [ ] **Step 1: Testes** de `criarEnvioAvulso`: o destinatário incompleto recusa com o campo, a numeração segue a dos pedidos e o envio criado sai em `RASCUNHO`, sem vínculo e com a declaração.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Conferir no navegador** contra o falso: criar um avulso, comprar, imprimir e cancelar.
- [ ] **Step 5: Commit.** `git commit -m "Frete fase 2: envio avulso e detalhe do envio" -- <arquivos>`

### Task 11: Fechamento

- [ ] Rodar o ritual de fim de sessão: `npm run lint`, `teste:frete`, `teste:pedidos`, `teste:acessos`, `teste:saude`, `teste:navegacao` e os quatro de sempre (`teste:extracao`, `teste:coleta`, `teste:cadastros` e `teste:worker`, este sozinho).
- [ ] Atualizar o `CLAUDE.md`: a linha Frete da tabela Estado e a seção "Módulo de frete", com o que a fase 2 faz, as travas `FRETE_COMPRA` e `EMAIL_ENVIO`, as variáveis `EMAIL_SMTP_*`, os campos medidos do Melhor Envio e o que não foi testado de verdade.
- [ ] Commit da documentação.

**Depois do plano (com o dono, fora das tarefas):**
- deploy;
- `FRETE_COMPRA=true` no `.env` da VPS;
- a senha de aplicativo do Google em `EMAIL_SMTP_SENHA`, com `EMAIL_ENVIO=true`;
- **a primeira compra real**, num pedido escolhido pelo dono, que é o teste do carrinho, do pagamento, da geração e da impressão em produção.

O primeiro cancelamento real também, se o dono quiser testar o estorno.
