# Propostas para cliente (fase 1)

Pedido do dono em 12/11/2026: montar no Rise a proposta comercial para o cliente, com os dados dele (buscados no Bling ou
criados nos dois), itens com foto, a descrição que o cliente mandou, código, valores, prazo e observação por item, cartões
de pagamento e frete, observações para a nota fiscal e internas, próxima data de contato com "!" e validade.

Nesta tela o operador precisa ver primeiro **o cliente, os itens e o total**, e a ação principal é **Gerar PDF / Enviar**.

## Decisões do dono (brainstorming de 12/11/2026)

1. A proposta **vive só no Rise** (não vai para `/propostas-comerciais` do Bling).
2. Numeração **2026, 2027, 2028...**, sem prefixo de ano.
3. **Cliente provisório pode existir, mas não entra no cadastro de Clientes sem CPF/CNPJ.** Nome, telefone e e-mail
   ficam guardados só dentro da proposta.
4. **O cadastro nasce na hora:** ao salvar a proposta com CPF/CNPJ preenchido, o cliente é criado no Rise e no Bling.
5. Item com três identificações: **produto do Rise** (interno), **descrição do cliente** e **código do cliente** (part
   number). O PDF mostra a descrição e o código do cliente.
6. **Quantidade e unidade** por item (a unidade vem do produto e pode ser trocada); total = qtd. × valor unitário.
7. **Prazo por item:** "Pronta entrega" ou "N dias úteis"; o prazo geral é o maior dos itens.
8. **Pagamento = lista + campos:** uma `CondicaoPagamento` (vem a preferida do cliente) e os ajustes.
9. **Frete:** CIF, FOB, Cliente retira ou A combinar, com a explicação curta entre parênteses; transportadora, valor e
   prazo de transporte.
10. **Obs. da NF:** nº da OC do cliente + texto; saem no PDF na caixa "Para a nota fiscal".
11. **Próximo contato:** "!" e filtro "Contatar hoje".
12. **Validade:** 15 dias de padrão; vence sozinha.
13. **Situações:** Rascunho, Enviada, Em negociação, Aprovada, Recusada (com motivo), Vencida.
14. **Totais:** desconto % por item + desconto geral (% ou R$); impostos inclusos.
15. **Item avulso** (sem produto do Rise) é permitido.
16. **PDF completo** (abaixo).
17. **Fase 1 = núcleo + A (custo e lucro), B (aprovada vira pedido de venda no Bling), C (link público e WhatsApp) e D
    (anexar a cotação do cliente).** Fase 2: E (duplicar e revisões), G (aviso no Telegram), H (dados pelo CNPJ).
18. Tela **"Propostas"** no menu, perto de Vendas, com o acesso novo `tela.propostas`; todos com o acesso veem todas.

## Fora desta fase

Duplicar e revisões (Rev. 1, Rev. 2), aviso no Telegram, buscar dados pelo CNPJ, prazo sugerido pelo estoque, impostos
destacados (IPI/ICMS-ST), proposta no Bling, e-mail enviado pelo Rise.

## Banco

Migration nova com três tabelas e dois enums. Valores em `Decimal(12, 2)` (preço unitário em 4 casas, como o pedido de
compra).

### `PropostaParaCliente`

- `numero Int @unique`: o próximo sai **sob trava do Postgres**, no molde de `lib/compras/banco.js`; o primeiro é 2026.
  Mostrado como "Proposta 2026".
- `situacao`: `RASCUNHO`, `ENVIADA`, `EM_NEGOCIACAO`, `APROVADA`, `RECUSADA`, `VENCIDA`.
  `motivoRecusa` (`PRECO`, `PRAZO`, `COMPROU_DE_OUTRO`, `DESISTIU`, `OUTRO`) + `motivoRecusaTexto`.
- **Cliente:** `clienteId String?` (Restrict). Sem cliente, a proposta guarda o provisório: `clienteNome`,
  `clienteTelefone` (só dígitos, `lib/telefone.js`), `clienteEmail`, `clienteDocumento` (formatado,
  `lib/documentos.js`). Com cliente ligado, esses campos ficam como **cópia** do que foi para o PDF.
  `contatoId String?` (o A/C, `ClienteContato`, SetNull) + `contatoNome` (cópia).
- **Pagamento:** `condicaoPagamentoId String?` (SetNull), `formaPagamento` (texto da lista do Rise: PIX, boleto,
  cartão, transferência, a combinar), `parcelas Int`, `entradaPercentual Decimal(5,2)`, `pagamentoTexto String?` (o texto
  livre que vai no PDF depois do resumo).
- **Frete:** `fretePorConta` (`CIF`, `FOB`, `RETIRA`, `A_COMBINAR`), `transportadoraId String?` (SetNull) +
  `transportadoraNome`, `frete Decimal`, `prazoTransporteDias Int?`. O frete soma no total só quando `CIF` com valor.
- **Totais:** `descontoTipo` (`TipoDeDesconto` que já existe), `descontoValor`.
- **Textos:** `ocCliente String?`, `observacoesNf String?`, `observacoesCliente String?` (PDF), `garantia String?` (nasce
  com o texto padrão), `observacoesInternas String?` (**nunca** no PDF, nem no link público).
- **Datas:** `validadeAte Date` (criação + 15 dias), `proximoContato Date?`, `enviadaEm`, `aprovadaEm`, `recusadaEm`,
  `vencidaEm`, `criadoEm`, `atualizadoEm`.
- `criadoPor String` (login) e `criadoPorNome`.
- `linkPublico String? @unique` (43 caracteres, como o do pedido de compra).
- `cotacaoArquivo`, `cotacaoNomeOriginal` (D; pasta `dados/propostas/<id>/`).
- `pedidoDeVendaBlingId String?` e `pedidoDeVendaId String?` (B).

### `ItemDaPropostaParaCliente`

- `produtoId String?` (Restrict; nulo = item avulso).
- `descricaoCliente String` (a que sai no PDF), `codigoCliente String?`.
- Cópia do produto no momento: `codigoInterno`, `nomeInterno`, `fotoArquivo` (avulso: foto enviada à mão, opcional).
- `quantidade Decimal(12,3)` (metro e quilo), `unidade` (lista de `lib/unidades.js`).
- `precoUnitario Decimal(12,4)`, `descontoPercentual Decimal(5,2)`.
- `prazo`: `prontaEntrega Boolean` + `prazoDiasUteis Int?`.
- `observacao String?` (o "+Obs." do item, sai no PDF abaixo da linha).
- `custoUnitario Decimal(12,4)?` (A: congelado ao adicionar, editável; nunca no PDF).
- `ordem Int`.

### `ContatoDaProposta`

Histórico curto dos contatos: `propostaId`, `em`, `quem`, `texto` (o que foi falado) e a `proximoContato` marcada naquele
registro. Registrar um contato grava a linha e troca o `proximoContato` da proposta.

## Cliente: buscar, provisório e cadastro

- **Uma caixa de busca** (nome, CPF ou CNPJ): primeiro o Rise (`Cliente`), depois o Bling (`GET /contatos` com
  `numeroDocumento` quando o texto é documento, senão `pesquisa`, `criterio=1`, como `blingSync/envio.js` faz com o
  fornecedor).
- **Achado no Bling e não no Rise:** escolher copia o contato para o Rise (com o `blingId`, endereço, telefone e e-mail) e
  liga à proposta.
- **Nada achado:** "Cliente novo" abre os campos do provisório (nome obrigatório, telefone, e-mail, documento). Sem
  documento a proposta salva só com o provisório.
- **Com documento válido no Salvar:** confere de novo no Rise e no Bling (pelo documento); existindo, liga; não existindo,
  cria no Rise e no Bling (`POST /contatos` com o tipo Cliente, lido de `GET /contatos/tipos`, como o tipo Fornecedor em
  `envio.js`). Respeita `BLING_ESCRITA`. **Falha no Bling não perde a proposta:** o cliente fica criado no Rise, a
  proposta salva e um aviso âmbar diz que o Bling não recebeu, com o botão "Enviar ao Bling".
- Cliente ligado traz: transportadora preferida e a 1ª condição preferida (só ao ligar; trocar depois não sobrescreve o
  que o operador mudou).

## Regras

- **Aberta** = Rascunho, Enviada ou Em negociação.
- **"!" de contato:** aberta e `proximoContato <= hoje` (data de São Paulo). Na lista e no topo da proposta. Filtro
  "Contatar hoje" na lista.
- **Vencida:** aberta e `validadeAte < hoje` vira `VENCIDA`. Feito por uma rotina do worker (1x por hora, grava em
  `RotinaDoWorker`) **e** na leitura da lista (para não depender do worker). Mudar a validade para o futuro numa
  vencida volta para Em negociação.
- **Enviada:** marcada ao Gerar PDF, copiar o link ou abrir o WhatsApp de uma proposta em Rascunho.
- **Aprovada / Recusada:** botões no topo; Recusada pede o motivo num popup. Aprovada e Recusada ficam **só leitura**
  (botão "Reabrir" volta para Em negociação, como o "Voltar para rascunho" de Compras).
- **Totais** (regra pura, `lib/propostas/regras.js`): total do item = qtd. × unitário × (1 − desc%); subtotal = soma;
  desconto geral em % ou R$; total = subtotal − desconto + frete (só CIF). Prazo geral = maior prazo dos itens ("Pronta
  entrega" quando todos são).
- **Custo e lucro (A):** coluna Custo e Lucro (markup, `calcularMarkup` de `lib/margem.js`) por item e no total, só com
  `dado.custo`; item avulso usa o custo digitado. Cortado no servidor para quem não tem o acesso.
- **Item:** adicionar pelo código ou nome do produto do Rise (busca igual à do pedido de compra), que traz foto, código,
  nome, unidade, preço de venda e custo; a descrição do cliente nasce vazia e é **obrigatória** para gerar o PDF (ícone
  "!" na linha enquanto vazia). O mesmo produto pode entrar duas vezes (o cliente pode pedir duas descrições diferentes).

## Tela

- **Lista** `/propostas`: Nº, Cliente, Situação (ponto colorido + texto), Total, Validade, Próximo contato (com "!"),
  Quem fez, Atualizada. Cabeçalho ordenável em toda coluna; busca por número, cliente ou descrição; filtros Situação,
  "Contatar hoje" e "Abertas"; 100 por página no canto direito (nasce em 25); voltar da proposta mantém a lista e a
  rolagem (`LembrarLista`). Botão principal "Nova proposta".
- **Proposta** `/propostas/<numero>`, no molde do editor de Pedido de compra:
  - Topo: número, situação, validade, "!" de contato, e a ação principal **Gerar PDF**; Link público, WhatsApp, Aprovar,
    Recusar e Registrar contato no menu/ícones.
  - Cartão **Cliente** (busca, provisório, A/C).
  - Bloco **Itens** (reaproveita o desenho de `BlocoItens.jsx` e a `JanelaObsDoItem`): foto (`FotoComLupa`), descrição
    do cliente, código do cliente, nosso código (pequeno, cinza), qtd., un., unitário, desc. %, total, prazo, e custo e
    lucro para quem pode.
  - Cartões lado a lado: **Pagamento**, **Frete**, **Totais**.
  - Abas embaixo: **Para a nota fiscal** (OC + texto), **Observações para o cliente** (+ garantia), **Internas**,
    **Contatos** (histórico + próxima data), **Cotação do cliente** (anexo).
  - Salvar com "Sair sem salvar?" ao sair com alteração.
- Menu: "Propostas" perto de Vendas; acesso `tela.propostas` em `lib/acessos/recursos.js` (ver e editar).

## PDF e link público (C)

Reaproveita `lib/compras/pdf.js`, `logoDaEmpresa.js`, `conteudoDoPedido.js` e `linkPublico.js`, separando o que é comum
do que é do pedido de compra.

- Topo: logo e dados da 4hobby (`DadosDaEmpresa`), "Proposta 2026", data, validade, quem fez.
- Cliente: nome/razão social, documento, endereço, telefone, e-mail e A/C.
- Itens: foto, descrição do cliente, código do cliente, qtd., un., unitário, desc. %, total, prazo; a observação do item
  logo abaixo da linha. **Nunca** o nosso código interno, o custo ou o lucro.
- Totais (subtotal, desconto, frete, total) e "Impostos inclusos".
- Pagamento, Frete (com a explicação entre parênteses), caixa "Para a nota fiscal" (OC + texto), observações para o
  cliente e garantia.
- **Link público** `/p/proposta/<chave>` (mesmo molde de `/p/compra/<chave>`, sem login), e **WhatsApp**
  (`wa.me/55<telefone do A/C ou do cliente>` com a mensagem e o link).

## Vira pedido de venda no Bling (B)

- Botão **"Gerar pedido de venda"** na proposta Aprovada, com popup que lista o que vai (cliente, itens, total).
- Exige cliente cadastrado (com documento e `blingId`) e **todo item com produto do Rise** que tenha `blingId`; item
  avulso recusa com o motivo (cadastrar o produto antes).
- `POST /pedidos/vendas` com o contato, os itens (produto, qtd., valor com o desconto do item), desconto geral, frete,
  transportadora/`fretePorConta`, a OC em `numeroPedidoCompra`, a obs. da NF em `observacoes` e as internas em
  `observacoesInternas`, e as parcelas pela condição. Respeita `BLING_ESCRITA`. Guarda o id; repetir não duplica.
- O pedido volta sozinho para Vendas pela leitura do Bling a cada 5 min (`lib/pedidos/`), e a proposta passa a mostrar
  o link para ele.
- **Nunca medido:** o corpo exato que o Bling aceita para o pedido de venda; o primeiro envio é no produto de teste
  (`ZZ-TESTE-BLING`) com o OK do dono.

## Anexo da cotação (D)

Um ou mais arquivos (PDF, imagem, planilha, até 20 MB cada) em `dados/propostas/<id>/`, nome gerado (32 hex) e o original
guardado, como a proposta do fornecedor em Compras (`lib/compras/arquivos.js`). Baixar e excluir na aba. Nunca no PDF.

## MCP

`listarPropostasParaCliente` e `lerPropostaParaCliente` (só leitura, com o acesso `tela.propostas`, custo cortado
conforme o login), para a equipe consultar pelo Claude. Criar pelo MCP fica para depois.

## Testes

`npm run teste:propostas` (Postgres local, SEM rede, só escreve `ZZ-PROP-CLI-*` e "ZZ Proposta *"): regras puras (totais,
descontos, prazo geral, "!", vencida, situação), numeração sob trava (duas ao mesmo tempo), cliente (Rise, Bling falso,
provisório, criar nos dois, Bling que recusa), gravação de itens (avulso, mesmo produto duas vezes), custo cortado sem o
acesso, PDF (o que entra e o que nunca entra), link público, pedido de venda contra o Bling falso (recusa avulso, não
duplica) e as ferramentas do MCP.

## Em aberto (não bloqueia o plano)

- Texto padrão da garantia (o dono escreve; nasce "Garantia de 90 dias contra defeito de fabricação").
- Mensagem padrão do WhatsApp.
