# Módulo Compras: pedidos de compra e produtos abaixo do estoque mínimo

Data: 26/10/2026. Pedido do dono, ditado em partes na mesma conversa, com prints do pedido de compra do Bling como
referência de campos. Abordagem escolhida: **Opção 1, tabelas próprias no Rise, estoque a caminho calculado dos pedidos**.

## 1. Intenção e porquê

Hoje o dono repõe estoque "de cabeça": olha o Bling, lembra de quem compra, monta o pedido no WhatsApp ou no portal do
fornecedor e, quando a mercadoria chega, lança a entrada no Bling à mão. O Rise já sabe tudo o que isso precisa (mínimo e
máximo de cada produto, o saldo do Bling relido de hora em hora, os fornecedores de cada produto com código, preço e
estoque deles) e já sabe lançar estoque no Bling sem duplicar. O módulo junta essas peças num fluxo só:

1. ver o que está abaixo do mínimo;
2. escolher de qual fornecedor comprar e montar o pedido com um clique;
3. mandar o pedido ao fornecedor (PDF) e acompanhar;
4. quando chegar, lançar o estoque no Bling pelo próprio pedido.

E, enquanto o pedido está a caminho, o produto **não aparece de novo** como "falta comprar".

## 2. Goals, non-goals, anti-goals

**Goals**
- Lista dos produtos conferidos abaixo do mínimo, com foto, nome, código, estoque atual, mínimo e máximo.
- Popup de fornecedores do produto (os mesmos dados da aba Fornecedores do cadastro) com "Adicionar ao pedido" e a
  quantidade já preenchida com o **máximo** (editável).
- Rascunho de pedido criado sozinho, **um por fornecedor**; o item adicionado entra no rascunho aberto daquele fornecedor.
- Ícone de carrinho no produto que já está num pedido (azul = rascunho, verde = enviado/parcial).
- Pedido de compra no molde do Bling: fornecedor, itens (foto, nome, SKU, nome e código no fornecedor, qtde, preço un,
  IPI %, total, prazo, link, excluir), totais (produtos, IPI, ICMS ST, desconto em % ou R$, frete, total), pagamento
  (Pix/Boleto/Cartão e parcelas), frete (transportadora, CIF/FOB, rastreio), proposta do fornecedor (número e arquivo),
  observações. Blocos bem separados.
- Status: Rascunho → Enviado → Entrega parcial → Finalizado; Cancelado.
- **Estoque a caminho**: ao enviar, as quantidades contam na regra do mínimo; ao lançar, deixam de contar.
- "Lançar estoque" por item, com popup, sem lançar duas vezes, com Desfazer.
- PDF para o fornecedor, só com o que interessa a ele (sem nome e código do Rise).
- "Dados da empresa" em Configurações, para o PDF.

**Non-goals (fica para depois)**
- Pedido em outra moeda (fornecedor estrangeiro). Só reais.
- Enviar o pedido por e-mail/WhatsApp pelo Rise. O dono baixa o PDF e manda.
- Pedido de compra no Bling (a API v3 tem o recurso; não medido, não usado).
- Nota fiscal de entrada, financeiro (contas a pagar), custo médio.
- Avisos no Telegram do pedido (pode entrar depois, pelo worker).
- Sugerir fornecedor sozinho; quem escolhe é o dono.

**Anti-goals (seria falha mesmo funcionando)**
- Lançar estoque duas vezes no Bling, ou lançar sem o dono clicar.
- Mudar o custo do produto ou do vínculo pelo preço do pedido (o custo segue a varredura, regra de 23/10/2026).
- Esconder um produto da lista de mínimo por um pedido que foi cancelado.
- Kit na lista de compra (o estoque do kit é das peças).

## 3. Restrições (o que o Rise já tem e o módulo obedece)

- `Produto.estoqueMinimo` / `estoqueMaximo` (nulos quando não cadastrados); `Produto.estoque` = saldo do Bling + ajustes
  pendentes, com o Bling relido de hora em hora pelo worker.
- `ProdutoFornecedor`: `descricao` (nome no fornecedor), `codigo`, `precoFornecedor` (o que ele cobra), `precoCusto`
  (total com adicionais do Rise), `link`, `padrao`, `observacao`. `Fornecedor`: `prazoEntregaDias`, `condicoesPagamento`,
  `pedidoMinimo`, `fonteId`. O estoque do fornecedor e o IPI vêm do `ProdutoColetado` da fonte dele (`quantidade`,
  `aChegar`, `taxes`), como a aba Fornecedores já lê (`consultarEstoqueFornecedores`).
- Lançamento de estoque: `gravarAjusteDeEstoque` (`lib/ajusteRapido.js`: trava `FOR UPDATE`, `MovimentoEstoque` com
  saldo antes/depois, motivo "Compra de fornecedor" já existe) + `enviarAjustesDeEstoque` (`lib/blingSync/envio.js`:
  `POST /estoques` no depósito padrão, marca `enviadoAoBlingEm`, travas `BLING_ESCRITA`/`BLING_ESCRITA_CODIGOS`, uma
  tentativa, `umPorVez`). Kit recusa ajuste.
- Transportadoras: cadastro próprio (`Transportadora`). PDF: `pdfkit` (Helvetica) como em `lib/relatorios/pdf.js`.
  Upload: arquivo em `dados/`, nome gerado (32 hex), nome real guardado à parte, servido por rota com login.
- Acessos: toda página/ação confere recurso; o guarda estático do `teste:acessos` exige. Preço de compra é `dado.custo`.
- Padrões de tela do CLAUDE.md: página de bloco = cartões; janela com `propsDoFundo` e `role="dialog"`; "Sair sem
  salvar?"; `ConclusaoDoEnvio` no sucesso; `BolhaDeAjuda`; `FotoComLupa`; `CabecalhoOrdenavel`; 10 regras do padrão visual;
  frontend-design + make-interfaces-feel-better antes de entregar.
- Migration só aditiva; só uma sessão mexe no schema por vez; `generate` + reiniciar o servidor.

## 4. Abordagens consideradas

1. **Tabelas próprias no Rise; estoque a caminho calculado dos pedidos** (ESCOLHIDA pelo dono em 26/10/2026). Linhas
   de verdade para pedido e item, filtro/ordem em SQL, o "não lançar duas vezes" numa coluna, reaproveita o lançamento de
   estoque que já existe. Mais tela e mais tabela.
2. Pedido num JSON só (`dados` como `Anuncio.dados`). Menos migration, mas o estoque a caminho leria o JSON de todos os
   pedidos abertos a cada lista, e a trava de duplo lançamento ficaria dentro de JSON. Descartada.
3. Pedido de compra no Bling, Rise só espelha. Fiel ao ERP, mas recurso não medido na API, todo clique escreve no ERP
   real e o fluxo desenhado (rascunho automático, parcial item a item, anexo) ficaria preso ao que o Bling permite.
   Descartada.

## 5. Decisões do dono (26/10/2026)

| # | Decisão |
|---|---|
| 1 | Bloco novo **Compras** no menu, logo depois de Produtos; página com dois cartões. "Pedidos" continua para vendas. |
| 2 | Lista de mínimo: só produtos **conferidos, ativos, com mínimo cadastrado**, estoque atual + a caminho < mínimo. **Kits fora.** |
| 3 | Quantidade sugerida = **o máximo cheio**, editável. |
| 4 | **Um rascunho por fornecedor**; o item entra no rascunho aberto dele, senão nasce um. |
| 5 | Preço da linha = **preço do fornecedor** (sem adicionais do Rise) + **IPI % da coleta** quando houver; editáveis. Lançar **não** mexe no custo. Como o `precoFornecedor` do vínculo já vem COM impostos da varredura, quando a coleta traz IPI a linha parte do preço SEM IPI da coleta e soma o IPI % (senão o IPI seria cobrado duas vezes; acerto do plano, `precoInicialDoItem`). |
| 6 | Lançar = entrada no depósito padrão do Bling pelo caminho existente; Desfazer = saída da mesma quantidade. Travas de escrita valem. |
| 7 | Cancelar só até Enviado. Com item lançado: **Finalizar** com o que chegou; o não chegado sai do a caminho. |
| 8 | **Dados da empresa** em Configurações, editáveis, já semeados com os dados da Receita (abaixo). PDF lê de lá. Número do pedido `PC-0001`. |
| 9 | Só reais nesta versão. |
| 10 | Ícone do produto no pedido: **carrinho** (azul rascunho, verde enviado). |
| 11 | Telas com UI/UX (frontend-design + padrão visual + make-interfaces-feel-better) e os componentes padrão do Rise. |

Dados da empresa (fonte: Google Docs "Dados Cadastrais 4hobby conforme receita"): CNPJ 30.010.376/0001-48, razão social
Maicol de Souza, nome fantasia 4Hobby, Estrada Municipal Domingos Forner, 2135, Galópolis, Caxias do Sul – RS, CEP
95090-970, telefone (54) 3284-1632. Simples Nacional.

## 6. Banco (migration aditiva `20261026_compras`)

```prisma
enum StatusDoPedidoDeCompra { RASCUNHO ENVIADO PARCIAL FINALIZADO CANCELADO }
enum FormaDePagamentoDaCompra { PIX BOLETO CARTAO }
enum FretePorConta { CIF FOB }

model PedidoDeCompra {
  id            String @id @default(cuid())
  numero        Int    @unique            // sequência própria (tabela SequenciaDeCompra ou MAX+1 sob trava); mostrado "PC-0001"
  status        StatusDoPedidoDeCompra @default(RASCUNHO)
  fornecedorId  String
  fornecedor    Fornecedor @relation(fields: [fornecedorId], references: [id], onDelete: Restrict)

  // Totais editáveis (os calculados saem das linhas, nunca gravados)
  icmsSt        Decimal @default(0) @db.Decimal(12, 2)
  descontoTipo  String? // "PERCENTUAL" | "VALOR"
  descontoValor Decimal @default(0) @db.Decimal(12, 2)
  frete         Decimal @default(0) @db.Decimal(12, 2)

  formaPagamento FormaDePagamentoDaCompra?
  parcelas       Int @default(1)

  transportadoraId String?
  transportadora   Transportadora? @relation(fields: [transportadoraId], references: [id], onDelete: SetNull)
  transportadoraNome String?   // texto livre quando não é do cadastro
  fretePorConta    FretePorConta @default(CIF)
  rastreio         String?

  propostaNumero   String?
  propostaArquivo  String?    // nome gerado em dados/compras/<id>/; nome real em propostaNomeOriginal
  propostaNomeOriginal String?

  observacoes   String?
  enviadoEm     DateTime?
  finalizadoEm  DateTime?
  canceladoEm   DateTime?
  criadoEm      DateTime @default(now())
  atualizadoEm  DateTime @updatedAt
  itens ItemDoPedidoDeCompra[]
}

model ItemDoPedidoDeCompra {
  id        String @id @default(cuid())
  pedidoId  String
  pedido    PedidoDeCompra @relation(fields: [pedidoId], references: [id], onDelete: Cascade)
  produtoId String
  produto   Produto @relation(fields: [produtoId], references: [id], onDelete: Restrict)
  vinculoId String?            // ProdutoFornecedor de origem (SetNull: o vínculo pode sumir)
  nomeNoFornecedor   String?
  codigoNoFornecedor String?
  link               String?
  quantidade   Int
  precoUnitario Decimal @db.Decimal(12, 4)
  ipiPercentual Decimal @default(0) @db.Decimal(5, 2)
  prazoDias     Int?
  ordem         Int @default(0)

  // Soma dos lançamentos vivos (não desfeitos), regravada a cada lançar/desfazer; a verdade está em `lancamentos`.
  quantidadeLancada Int @default(0)
  lancamentos LancamentoDoItemDeCompra[]

  @@unique([pedidoId, produtoId])
  @@index([produtoId, pedidoId])
}

/// Uma remessa que chegou e foi lançada no Bling. Um item pode ter VÁRIOS (chegaram 100 de 225 hoje, o resto na
/// semana que vem: decisão minha na escrita do desenho, porque com um lançamento só por item o restante nunca
/// poderia ser lançado pelo pedido). O `movimentoId` único é a trava do "duas vezes": o mesmo MovimentoEstoque nunca
/// serve a dois lançamentos, e lançar de novo exige quantidade que ainda cabe (`quantidade − quantidadeLancada`).
model LancamentoDoItemDeCompra {
  id          String @id @default(cuid())
  itemId      String
  item        ItemDoPedidoDeCompra @relation(fields: [itemId], references: [id], onDelete: Cascade)
  quantidade  Int
  movimentoId String @unique      // o MovimentoEstoque ENTRADA gravado no Rise
  lancadoEm   DateTime @default(now())
  desfeitoEm  DateTime?           // preenchido pelo Desfazer (que grava a SAÍDA em outro MovimentoEstoque)
  @@index([itemId])
}

model DadosDaEmpresa {   // uma linha só (id fixo "empresa")
  id String @id
  razaoSocial String; nomeFantasia String?; cnpj String; inscricaoEstadual String?
  endereco String; numero String?; complemento String?; bairro String?; cidade String; uf String; cep String
  telefone String?; email String?
  atualizadoEm DateTime @updatedAt
}
```

`Produto` ganha a relação `itensDeCompra ItemDoPedidoDeCompra[]`, `Fornecedor` e `Transportadora` as deles. Decimal com 4
casas no unitário porque fornecedor cobra R$ 0,0385 a peça. **Nada gravado em `Produto`**: o estoque a caminho é
calculado (abaixo).

**Estoque a caminho de um produto** = Σ `quantidade − quantidadeLancada` dos itens cujo pedido está `ENVIADO` ou
`PARCIAL` (o item com `desfeitoEm` volta a contar: `quantidadeLancada` zera no Desfazer). Função pura
`aCaminho(itens)` em `lib/compras/regras.js`; a consulta por lote de produtos em `lib/compras/estoqueACaminho.js`
(um `groupBy` por `produtoId`).

## 7. Telas

### 7.1 Bloco Compras (`/compras`)

Cartões, no molde de Cadastros: **Pedidos de compra** (detalhe vivo: "2 rascunhos · 1 enviado") e **Abaixo do estoque
mínimo** (detalhe vivo: "14 produtos"). Item do menu entre Produtos e Scraper (`blocos.js`, ícone `ShoppingBag`).

### 7.2 Abaixo do estoque mínimo (`/compras/estoque-minimo`)

"O operador vê primeiro QUAIS produtos faltam e QUANTO; a ação principal é Fornecedores."

Tabela paginada (25/100 por página, `NavegacaoDoTopo`), busca por nome/código, cabeçalhos ordenáveis (Código, Estoque,
Falta). Colunas: Foto (`FotoComLupa`) · Nome · Código · Estoque atual · A caminho (só quando > 0, com a dica "PC-0003,
enviado em 20/10") · Mínimo · Máximo · Carrinho (ícone, só quando o produto está num pedido aberto: azul "no rascunho
PC-0005", verde "enviado em PC-0003") · botão **Fornecedores**.

Regra de entrada na lista: `conferido && ativo && tipo = SIMPLES && estoqueMinimo != null && estoque + aCaminho <
estoqueMinimo`. O produto com pedido enviado que cubra o mínimo **sai** da lista; o que está só em rascunho **continua**
(nada foi comprado ainda), com o carrinho azul.

**Popup Fornecedores** (`role="dialog"`, `propsDoFundo`, a tela de trás não rola): título "Fornecedores de 100101 · NOME",
tabela com as mesmas colunas da aba Fornecedores do cadastro (Foto · Fornecedor · Descrição no fornecedor · Código ·
Preço · Estoque fornecedor · Link · Padrão) mais **Qtde** (campo numérico, já com o máximo) e **Adicionar ao pedido**.
Do mais barato para o mais caro, padrão em destaque. Linha já no rascunho daquele fornecedor vira "No rascunho PC-0005 ·
Abrir" (sem adicionar de novo). Sem fornecedor vinculado: estado vazio com link para o cadastro do produto.

Ao clicar Adicionar: ação `adicionarAoPedido(produtoId, vinculoId, quantidade)` → acha o rascunho do fornecedor (ou
cria, com o próximo número) → cria o item (nome/código/link do vínculo, preço = `precoFornecedor`, IPI da coleta,
prazo = `Fornecedor.prazoEntregaDias`) → a linha ganha o carrinho azul e o popup fecha com a faixa "Adicionado ao
PC-0005 · Abrir pedido". Produto que já está no rascunho de **outro** fornecedor: avisa ("já está no PC-0004 da Fortek")
e deixa adicionar mesmo assim (o dono pode dividir a compra).

### 7.3 Pedidos de compra (`/compras/pedidos`)

Lista: Número · Fornecedor · Status (selo com cor: rascunho cinza, enviado azul, parcial âmbar, finalizado verde,
cancelado riscado) · Itens · Total · Enviado em · Atualizado. Filtro por status no topo (chips), busca por número ou
fornecedor. Ação principal "Novo pedido" (escolhe o fornecedor e abre o editor vazio).

### 7.4 Editor do pedido (`/compras/pedidos/[id]`)

"O operador vê primeiro os ITENS e o TOTAL; a ação principal muda com o status."

Página inteira (não janela): pedido é longo. Cabeçalho: "PC-0005 · Fortek" + selo de status + Cancelar/Voltar. Blocos,
cada um um cartão (`SecaoDoAnuncio`, borda, título forte, bolha "i"), com espaço entre eles:

1. **Fornecedor**: nome com link para o cadastro, prazo e condições do cadastro (só leitura), CNPJ. No pedido novo, lupa
   para escolher.
2. **Itens do pedido**: tabela Foto · Produto (nome + SKU embaixo) · Nome no fornecedor · Código no fornecedor · Qtde ·
   Preço un · IPI % · Total · Prazo (dias) · Link (ícone, abre no site do fornecedor) · Lançar estoque (só a partir de
   Enviado) · Lixeira. Rodapé "+ Adicionar outro item" abre a busca: campo único que acha por nome, código Rise, código no
   fornecedor e nome no fornecedor (`buscaAmpla` do catálogo + `ProdutoFornecedor` do fornecedor do pedido); a linha achada
   mostra se tem vínculo com este fornecedor (preenche nome/código/preço) ou não (entra só com nome e SKU, o resto a mão).
   Rascunho: tudo editável. Enviado em diante: qtde/preço/IPI travados (o PDF já foi); só prazo, rastreio e lançamento.
3. **Totais da compra**: Total dos produtos, Total do IPI, Nº de itens, Soma das qtdes (calculados, cinza) · Total ICMS ST,
   **Desconto** (um campo: "5%" vira percentual, "50" vira R$ 50,00; ao lado o valor abatido em R$), Frete (editáveis) ·
   **Total do pedido** em destaque. Conta em `lib/compras/regras.js` (`totaisDoPedido`, pura, a tela e o PDF usam a mesma).
4. **Pagamento**: Pix / Boleto / Cartão como opções lado a lado (`EscolhaDoTipo`); Parcelas (1 no Pix, travado).
5. **Frete**: Transportadora (lista do cadastro + "outra" com texto livre), CIF/FOB lado a lado, Código de rastreio (com o
   link da `urlRastreamento` da transportadora quando houver).
6. **Proposta do fornecedor**: Nº da proposta · arquivo (enviar PDF/imagem até 20 MB; mostra nome real, Baixar, Excluir;
   troca só no Salvar, como os documentos do produto).
7. **Observações**: texto livre.

Rodapé fixo (padrão LI/Bling): à esquerda "Alterações não salvas" + **Baixar PDF**; à direita **Salvar e fechar** e a ação
principal por status: Rascunho → **Marcar como enviado** (pergunta "Salvar e marcar como enviado?"; grava `enviadoEm`;
as quantidades passam a contar como a caminho); Enviado/Parcial → **Finalizar pedido** (pergunta: "N itens ainda não
lançados ficarão como não entregues", lista os itens); Cancelar no menu ⋮ do cabeçalho (só Rascunho e Enviado, popup
com o número e o fornecedor). Finalizado e Cancelado: só leitura (`inert`), Baixar PDF continua.

Parcial é automático: o primeiro item lançado leva o pedido de Enviado para Parcial; quando todos os itens estiverem
lançados por inteiro, o Rise **pergunta** se finaliza (não finaliza sozinho: o dono pode ter uma segunda remessa).

**Sair sem salvar?** em todo caminho de saída com alteração.

### 7.5 Popup "Lançar estoque" (por item)

Título "Lançar estoque · 100101 · NOME". Linhas: Quantidade do pedido · Já lançado (só quando > 0) · **Quantidade que
chegou** (campo, inteiro, já com o que falta; aceita menos; recusa 0 e acima do que falta) · Saldo no Rise agora → depois · Depósito do Bling
(padrão; lista quando não há padrão, como na `JanelaBling`). Aviso em uma linha: "Grava a entrada no Rise e manda ao
Bling agora." Botões **Cancelar** / **Lançar no Bling** (principal). Enquanto roda: botão travado, "Lançando…".

Ação `lancarEstoqueDoItem(itemId, quantidade, depositoId?)`, numa transação + envio:
1. `SELECT ... FOR UPDATE` do item; recusa se a quantidade pedida passa de `quantidade − quantidadeLancada` ("já
   lançado 225 de 225 em dd/mm hh:mm") ou o pedido não está em ENVIADO/PARCIAL. Clique duplo: o segundo cai nessa recusa.
2. `gravarAjusteDeEstoque(produtoId, { tipo: "ENTRADA", quantidade, motivo: "Compra de fornecedor", observacao: "PC-0005" })`
   (já trava o produto e cria o `MovimentoEstoque`).
3. Cria o `LancamentoDoItemDeCompra` com o `movimentoId`, regrava `quantidadeLancada`; pedido vira PARCIAL se estava ENVIADO.
4. Fora da transação: `enviarAjustesDeEstoque(produtoId, cliente, { depositoId })`. Falhou no Bling: o item fica lançado
   no Rise com o aviso "entrada gravada no Rise; o Bling recusou: … Reenviar" (o ajuste fica pendente e o ícone do Bling
   da lista de Produtos acende o "!", o caminho de sempre). Nunca repete sozinho.
5. Sucesso: `ConclusaoDoEnvio` ("Entrada de 225 un. lançada no Bling"). A célula da linha mostra "Lançado 225 de 225 ·
   20/10 14:32" (ou "100 de 225" com o botão **Lançar** de novo para o resto) + **Desfazer** (o último lançamento).

**Desfazer** (popup de confirmação com o produto e a quantidade do último lançamento): `desfazerLancamentoDoItem(itemId)`
→ `gravarAjusteDeEstoque` SAÍDA dessa quantidade (motivo "Outro", observação "Desfazer lançamento PC-0005"; recusa se o
saldo do Rise ficou menor que isso: "já saíram N unidades; ajuste pela lista de Produtos") → grava `desfeitoEm` no
lançamento, regrava `quantidadeLancada` → envia ao Bling. Pedido volta de PARCIAL a ENVIADO se nenhum item ficou lançado.
O Desfazer só existe em pedido PARCIAL (no Finalizado, o caminho é a lista de Produtos).

### 7.6 PDF (`/api/compras/[id]/pdf`, só com login, `no-store`)

`pdfkit`, Helvetica, A4. Cabeçalho: nome fantasia e razão social, CNPJ, endereço, telefone (de `DadosDaEmpresa`); "Pedido
de compra PC-0005" e data de envio (ou "rascunho, dd/mm" se ainda não enviado). Fornecedor: nome, CNPJ, contato. Tabela:
# · Código no fornecedor · Descrição (nome no fornecedor; sem ele, o nome do Rise, pois é o único) · Qtde · Un · Preço un ·
IPI % · Total. Totais, desconto, frete, ICMS ST, total. Pagamento e parcelas, transportadora e CIF/FOB, nº da proposta,
observações. **Fora:** SKU do Rise, foto, estoque, prazo, link. Nome do arquivo `PC-0005-fortek.pdf`.

### 7.7 Dados da empresa (`/configuracoes/empresa`)

Cartão em Configurações (só Administrador, `tela.configuracoes.usuarios` como as outras coisas da empresa). Formulário
simples (`Campo` em `Card`): razão social, nome fantasia, CNPJ (validado/formatado), IE, endereço (CEP com a lupa do
ViaCEP, como no cliente), telefone, e-mail. A migration semeia a linha com os dados da Receita.

## 8. Ícone do carrinho no produto

`lib/compras/carrinho.js` (puro): `estadoDoCarrinho(itensAbertosDoProduto)` → `null` | `{ cor: "azul", pedidos: [...] }`
(só rascunhos) | `{ cor: "verde", pedidos }` (algum enviado/parcial). Usado na lista de mínimo. Na **lista de Produtos**
não entra agora (o dono não pediu; é uma linha em `LinhaProduto.jsx` depois, com a mesma função).

## 9. Acessos

- `tela("tela.compras", "Compras", "/compras")`, `sub("tela.compras.pedidos", ...)`, `sub("tela.compras.estoqueMinimo", ...)`.
- `acao("acao.compras.lancarEstoque", "Lançar estoque do pedido no Bling", "tela.compras.pedidos")` (executar).
- Preço de compra, custo e totais em R$ exigem `dado.custo`: sem ele a lista de mínimo abre (quantidades) mas o popup de
  fornecedores e o editor cortam os preços no servidor (projeção, como `projetarParaAcessos`). Estoque exato segue
  `dado.estoqueExato` (sem ele a lista de mínimo não faz sentido: página 404 com a dica).
- O Administrador recebe tudo pela semeadura, como hoje.

## 10. Onde mora

- `src/lib/compras/`: `regras.js` (puro: totais, desconto, a caminho, carrinho, transições de status, validação de
  quantidade), `banco.js` (listar mínimo, pedidos, criar/atualizar, adicionar item, numeração), `lancamento.js` (lançar e
  desfazer), `pdf.js`, `arquivos.js` (proposta em `dados/compras/<pedidoId>/`), `empresa.js`.
- `src/app/compras/` (page de cartões, `estoque-minimo/`, `pedidos/`, `pedidos/[id]/`, `acoes.js`), `src/app/api/compras/[id]/pdf/route.js`,
  `src/app/api/compras/[id]/proposta/route.js`, `src/app/configuracoes/empresa/`.
- `src/components/compras/`: `TabelaEstoqueMinimo.jsx`, `PopupFornecedores.jsx`, `IconeCarrinho.jsx`, `TabelaPedidos.jsx`,
  `EditorPedido.jsx` + um arquivo por bloco (`BlocoItens.jsx`, `BlocoTotais.jsx`, `BlocoPagamento.jsx`, `BlocoFrete.jsx`,
  `BlocoProposta.jsx`), `PopupLancarEstoque.jsx`, `BuscaDeItem.jsx`.
- `src/lib/blocos.js` (item Compras), `src/lib/acessos/recursos.js`, `src/lib/secoesDeConfiguracoes` (cartão Dados da
  empresa, onde a página de Configurações lista os cartões).
- Teste: `npm run teste:compras` (`scripts/teste-compras.js`): regras puras (totais, desconto %/R$, a caminho, carrinho,
  transições), banco (lista de mínimo com e sem a caminho, um rascunho por fornecedor, numeração sob concorrência),
  lançamento contra o Bling falso (`scripts/lib/blingFalso.js`: lançar, recusa do segundo lançamento, Bling que falha
  deixa pendente, desfazer) e o PDF gerando bytes. Só escreve produtos `ZZ-COMPRA-*` e apaga.

## 11. O que fica para o construtor

- Desenho exato das colunas e larguras (frontend-design com as 10 regras; conferir em largura de notebook).
- Numeração: tabela `SequenciaDeCompra` de uma linha ou `MAX(numero)+1` sob `pg_advisory_xact_lock`; qualquer das duas,
  desde que dois cliques simultâneos não repitam número (teste cobre).
- Formato do campo de desconto ("5%" × "50"): regra pura `lerDesconto(texto)` testada.
- Busca de item: pode começar pela busca normal de Produtos (`buscaAmpla`) + filtro em `ProdutoFornecedor` do fornecedor
  do pedido; não precisa de índice novo.
- Ordem de implementação sugerida: migration e regras puras → lista de mínimo + popup + rascunho automático → editor →
  lançar/desfazer → PDF e dados da empresa → acessos e teste-guarda → revisão visual.
