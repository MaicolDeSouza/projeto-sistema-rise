# MCP do frete — desenho

Aprovado pelo dono em 20/11/2026 ("Sim aprovado"), a partir do pedido de 19/11/2026: "criar mcp para poder fazer cotação,
gerar etiqueta, buscar rastreio do pedido e outras funcionalidades que julgue interessante".

## Intenção

Fazer pelo Claude (ou ChatGPT) conectado ao Rise o trabalho de frete da tela, sem abrir o Rise: cotar, preparar e comprar a
etiqueta de um pedido do Bling, imprimir, ver o rastreio, listar os envios, cancelar e reenviar o aviso ao cliente.

**Muda a spec do módulo de frete (`2026-11-18-modulo-de-frete-design.md`), seção 5.10** ("Só leitura... Nenhuma ferramenta
compra etiqueta"): o dono pediu "gerar etiqueta" pelo MCP. A compra fica protegida pelo acesso do login, pela trava
`FRETE_COMPRA` e por dois passos.

## Ferramentas (9)

| Ferramenta | O que faz | Acesso |
| --- | --- | --- |
| `cotarFrete` | CEP, caixa (nome) ou medidas, peso, valor → serviços com preço e prazo. Não grava | ver Envios |
| `cotarFreteDoPedido` | Pedido do Bling → serviços para o pacote (o do rascunho, o da proposta ou o sugerido pelos itens; caixa e peso podem vir na chamada). Não grava | ver Envios |
| `prepararEtiqueta` | Pedido + serviço + caixa/medidas + peso + NF-e (chave do pedido ou digitada) ou declaração → grava o rascunho, cota de novo com o pacote medido (`conferirPacote`) e devolve preço, prazo, saldo antes/depois e o que impede a compra. **Não compra** | comprar etiqueta |
| `comprarEtiqueta` | Envio + `valorConfirmado` + `confirmo: true` → compra. Recusa se o preço preparado não for o confirmado, se a preparação tem mais de 30 min ou se faltar algo (`motivosParaNaoComprar`) | comprar etiqueta |
| `imprimirEtiqueta` | Envio → link da página de impressão do Melhor Envio | ver Envios |
| `lerEnvio` | Pelo número do envio (12 ou ENV-0012), do pedido ou do rastreio → situação, serviço, rastreio com link, prazo, linha do tempo, custo, aviso ao cliente e a hora da última consulta ao Melhor Envio | ver Envios |
| `listarEnvios` | Filtro por situação, busca, limite → envios e o saldo da carteira | ver Envios |
| `cancelarEtiqueta` | Envio + motivo + `confirmo: true` → cancela (o valor volta à carteira em até 12 h) | comprar etiqueta |
| `reenviarAvisoAoCliente` | Envio postado → manda de novo o e-mail de postado | avisar cliente |

- **ver Envios** = `tela.envios` ou `tela.pedidos` em `ver` (o mesmo da tela: quem vê o pedido imprime e vê o saldo).
- **comprar etiqueta** = `acao.envios.comprarEtiqueta`; **avisar cliente** = `acao.envios.avisarCliente`.

## Regras

- **Dado pessoal do cliente nunca sai pelo MCP** (regra de `pedidosDeVenda.js`): do destinatário, só nome e cidade. O link
  do WhatsApp (leva o telefone) fica só na tela.
- A regra mora na lib do frete (`lib/frete/envios.js`, `cotacao.js`, `aviso.js`); o MCP só confere acesso, acha o envio e
  monta a resposta. Compra e cancelamento recalculam o lucro do pedido (`recalcularLucroDoPedido`), como a tela.
- As escritas (`prepararEtiqueta`, `comprarEtiqueta`, `cancelarEtiqueta`, `reenviarAvisoAoCliente`) entram na lista de
  ferramentas sem o lembrete de anotar; as leituras levam o lembrete, como as outras consultas. As instruções do servidor
  ganham uma linha: comprar e cancelar só quando a pessoa pedir com todas as letras, sempre depois de mostrar o preço.

## Fora agora

Envio avulso pelo MCP, reverso (fase 3), consulta ao vivo do rastreio (usa o que o worker leu, a cada 15 min).

## Abordagens consideradas

1. **Ferramentas finas sobre a lib do frete** (escolhida): reaproveita a compra sem dobra, a retomada e as travas da fase 2.
2. Uma ferramenta só com "ação" (cotar/comprar/...): menos nomes, mas a descrição fica longa e o modelo erra o parâmetro.
3. Comprar direto, sem preparar: menos uma chamada, mas compra sem a pessoa ver o preço do pacote medido.

## Para o construtor

Arquivo `src/lib/mcp/frete.js` no molde de `pedidosDeVenda.js`, registrado em `servidor.js`; testes no `teste:frete` (tem
o Melhor Envio falso) e a lista de nomes do `teste:mcp`; resumos da Revisão do dia em `consultas.js`.
