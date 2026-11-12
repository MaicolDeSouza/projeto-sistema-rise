# Plano: Propostas para cliente (fase 1)

Spec: `docs/superpowers/specs/2026-11-12-propostas-para-cliente-design.md` (aprovada pelo dono em 12/11/2026).
Execução **inline** (sem subagentes), uma tarefa por vez, cada uma terminando com o teste dela passando e um commit.
Ao fim: CLAUDE.md (seção nova "Propostas para cliente" + linha no Estado + `teste:propostas` em Rodar), lint, os 4 testes
do ritual e push. Deploy só com o "subir" do dono.

## Tarefa 1 — Banco

- `prisma/schema.prisma`: `PropostaParaCliente`, `ItemDaPropostaParaCliente`, `ContatoDaProposta`; enums
  `SituacaoDaProposta`, `MotivoDeRecusa`, `FretePorContaDaProposta` (CIF, FOB, RETIRA, A_COMBINAR). Relações inversas em
  `Cliente`, `ClienteContato`, `CondicaoPagamento`, `Transportadora`, `Produto`.
- Migration `20261112c_propostas_para_cliente` (gerada com `migrate diff`, **tirando as linhas que apagam os índices de
  expressão da busca ampla e o índice parcial `Job_fonte_aberta`**).
- `npx prisma generate`; reiniciar o servidor de dev.

## Tarefa 2 — Regras puras (`src/lib/propostas/regras.js`)

- `numeroDaProposta`, `totalDoItem` (qtd. × unitário × (1 − desc%)), `totaisDaProposta` (subtotal, desconto geral % ou
  R$ com `lerDesconto` de `compras/regras.js`, frete só CIF, total), `prazoGeral`, `estaAberta`, `precisaContato(hoje)`,
  `deveVencer(hoje)`, `PROXIMAS_SITUACOES`, `TEXTO_DO_FRETE` (CIF/FOB/Retira/A combinar com a explicação), validade
  padrão (+15 dias, data de São Paulo).
- `scripts/teste-propostas.js` nasce aqui com as asserções puras; `npm run teste:propostas` no `package.json`.

## Tarefa 3 — Cliente da proposta (`src/lib/propostas/cliente.js`)

- `buscarClienteParaProposta(texto)`: Rise (nome, documento) e depois Bling (`GET /contatos` com `numeroDocumento` ou
  `pesquisa`, `criterio=1`), marcando a origem de cada resultado.
- `copiarContatoDoBling(id)`: cria o `Cliente` no Rise com `blingId`, endereço, telefone e e-mail.
- `garantirClienteDaProposta(tx, dadosDoProvisorio)`: com documento válido, acha no Rise ou no Bling ou cria nos dois
  (`POST /contatos` com o tipo Cliente de `GET /contatos/tipos`, no molde de `blingSync/envio.js`, reaproveitando o que
  der de lá). Falha no Bling devolve aviso, não erro.
- Testes contra o Bling falso já usado no `teste:bling-sync`.

## Tarefa 4 — Gravação (`src/lib/propostas/banco.js`)

- `proximoNumero(tx)` com `pg_advisory_xact_lock(hashtext('propostas.numero'))`, começando em 2026.
- `criarProposta`, `lerProposta` (corta custo sem `dado.custo`), `salvarProposta` (cabeçalho + itens trocados inteiros +
  cliente pela Tarefa 3, recusa edição de Aprovada/Recusada), `mudarSituacao` (com motivo), `registrarContato`,
  `listarPropostas` (busca, situação, "Contatar hoje", ordenar, paginar) e `vencerPropostas(hoje)`.
- Esquema de validação em `src/lib/propostas/esquema.js` (zod, no molde de `compras/esquema.js`).
- Testes: numeração com duas ao mesmo tempo, item avulso, mesmo produto duas vezes, custo cortado, vencer.

## Tarefa 5 — Acesso, menu e rotina

- `lib/acessos/recursos.js`: `tela("tela.propostas", "Propostas", "/propostas")`; semeadura nas funções como as outras
  telas novas (Administrador com tudo).
- `lib/blocos.js`: "Propostas" perto de Vendas (ícone do lucide), entrando no fim da ordem salva do menu.
- Worker: rotina horária `vencerPropostas` gravando em `RotinaDoWorker` (e na Saúde do Rise).
- `teste:acessos` continua passando (o guarda estático de `src/app`).

## Tarefa 6 — Tela da lista (`src/app/propostas/page.jsx`)

- Tabela com `CabecalhoOrdenavel`, `NavegacaoDoTopo` (100 por página, nasce em 25), filtros Situação / Abertas /
  "Contatar hoje", busca, `LembrarLista`, "!" de contato, botão "Nova proposta". Chama `vencerPropostas` antes de listar.

## Tarefa 7 — Editor da proposta (`src/app/propostas/[numero]/`)

- `acoes.js` (Server Actions com o acesso) e os componentes em `src/components/propostas/`: `CartaoCliente` (busca
  Rise→Bling, provisório, A/C), `BlocoItensDaProposta` (a partir de `BlocoItens.jsx` e `JanelaObsDoItem`, com
  `FotoComLupa`, prazo, desc. %, custo/lucro), cartões Pagamento / Frete / Totais, abas Para a nota fiscal / Observações
  para o cliente / Internas / Contatos / Cotação do cliente, botões Aprovar / Recusar (popup com motivo) / Reabrir /
  Registrar contato, "Sair sem salvar?", `SetaParaLista`.
- Conferir no navegador em largura de notebook e passar por `make-interfaces-feel-better` (Padrão visual, regra 10).

## Tarefa 8 — PDF, link público e WhatsApp

- Separar de `compras/pdf.js` e `conteudoDoPedido.js` o que é comum (cabeçalho da empresa, logo, tabela, fonte) e montar
  `src/lib/propostas/pdf.js` + `conteudoDaProposta.js` com o layout da spec (sem código interno, custo, lucro e internas).
  O PDF de compra não pode mudar (o `teste:compras` confere).
- Rota do PDF, `linkPublicoDaProposta` e página `/p/proposta/[chave]` (molde de `/p/compra`), botão WhatsApp. Gerar PDF,
  copiar link ou WhatsApp numa proposta em Rascunho a marca Enviada.

## Tarefa 9 — Anexo da cotação

- `src/lib/propostas/arquivos.js` (`dados/propostas/<id>/`, nome de 32 hex, até 20 MB) e a aba com enviar, baixar e
  excluir (popup listando o arquivo).

## Tarefa 10 — Pedido de venda no Bling

- `src/lib/propostas/pedidoDeVenda.js`: confere cliente com `blingId` e todo item com produto do Rise com `blingId`
  (recusa avulso com o motivo), monta o corpo de `POST /pedidos/vendas` (contato, itens com desconto, desconto geral,
  frete, transportadora, OC em `numeroPedidoCompra`, obs. da NF, internas, parcelas), respeita `BLING_ESCRITA`, grava o
  id e não duplica. Botão "Gerar pedido de venda" com popup do que vai; link para o pedido em Vendas quando a leitura o
  trouxer.
- Testes contra o Bling falso. **Primeiro envio real só no ZZ-TESTE-BLING, com o OK do dono.**

## Tarefa 11 — MCP

- `listarPropostasParaCliente` e `lerPropostaParaCliente` (só leitura, acesso `tela.propostas`, custo pelo `pode()` do
  login), registradas como as outras; asserções no `teste:mcp`.

## Tarefa 12 — Fechamento

- CLAUDE.md, lint, `teste:propostas`, `teste:compras`, `teste:acessos`, `teste:mcp` e os 4 do ritual (extração, coleta,
  cadastros, worker sozinho), commit e push. Roteiro de testes para o dono no fim.
