# Estudo de viabilidade de produto (fase 1: Mercado Livre)

Pedido do dono em 12/11/2026: a partir da lista do Scraper (fornecedores e concorrentes), mandar produtos para uma lista
e estudar se vale a pena trabalhar com cada um: preço de venda no mercado, vendas, custo nos fornecedores, e no fim um
relatório com o veredito e a quantidade inicial de compra.

Decisões do dono na conversa:

- O estudo é feito pelo **Claude Desktop**, que lê a lista pelo servidor MCP, pesquisa, monta o relatório e o **devolve
  ao Rise**, onde fica o histórico.
- Quem abre o marketplace é o próprio Claude, pelo **Claude no Chrome** (sem extensão própria). Login e CAPTCHA o dono
  resolve na hora.
- **Só o Mercado Livre agora**, validado com **um produto**.

## Fora desta fase

Shopee, Amazon, AliExpress e Alibaba; extensão própria; estudo automático ou agendado; criar produto ou pedido de compra
a partir do estudo. O estudo **nunca altera** produto, custo, vínculo ou pedido.

## Fluxo

1. **Scraper:** uma caixa de marcação por linha. Com alguma marcada aparece o botão **"Enviar para estudo (N)"**. Cada
   produto marcado vira um estudo **Na fila**. Produto que já tem estudo na fila não entra de novo (a tela avisa).
2. **Claude Desktop:** o dono pede "faça os estudos de viabilidade da fila". O Claude segue o roteiro (abaixo).
3. **Rise:** o estudo passa a **Concluído** e o relatório abre em Compras > Estudos de viabilidade.

## Banco

Tabela nova `EstudoDeViabilidade`, uma linha por estudo. Estudar de novo o mesmo produto cria **outra linha**; as
anteriores ficam como histórico.

- **Origem (cópia, sem chave estrangeira):** `produtoColetadoId`, nome, código, fonte, tipo da fonte, endereço e foto.
  Cópia porque apagar a fonte não pode levar o estudo junto (a mesma razão das fotos mensais).
- `situacao`: `NA_FILA` ou `CONCLUIDO`.
- `anunciosML` (JSON): os anúncios lidos (abaixo).
- `fornecedores` (JSON): os produtos coletados de fornecedor que o Claude apontou como o mesmo produto, com o custo do
  dia do estudo.
- `parecidos` (JSON): os produtos da 4hobby apontados como parecidos, com as vendas mensais de cada um.
- `contas` (JSON): o que o Rise calculou.
- `veredito` (`VALE`, `VALE_COM_RESSALVA`, `NAO_VALE`), `confianca` (`ALTA`, `MEDIA`, `BAIXA`), `quantidadeInicial`,
  `conclusao` (texto), `versaoDoRoteiro`, `criadoPor`, `criadoEm`, `concluidoEm`.

## Ferramentas do MCP

No molde da proposta de produto. Acesso por um recurso novo, `tela.compras.estudos` (ver e editar).

| Ferramenta | O que faz |
| --- | --- |
| `roteiroDoEstudoDeViabilidade` | Devolve o roteiro (passos, regras, critérios do veredito) e o formato dos dados. |
| `listarEstudosDeViabilidade` | Os estudos, por situação (padrão: na fila). |
| `lerParaEstudoDeViabilidade` | O produto do estudo e o que o Rise já sabe: o item coletado inteiro, os mesmos termos em outros fornecedores e concorrentes (a busca do `buscarNoMercado`) e os estudos anteriores do mesmo produto. |
| `calcularEstudoDeViabilidade` | Recebe os anúncios lidos, os fornecedores e os parecidos apontados; **grava**, faz as contas e devolve os números. |
| `gravarEstudoDeViabilidade` | Recebe veredito, confiança e conclusão; fecha o estudo. Recusa se as contas não foram feitas. |

## Roteiro (o que o Claude faz)

1. `roteiroDoEstudoDeViabilidade`, `listarEstudosDeViabilidade`, e para cada estudo `lerParaEstudoDeViabilidade`.
2. Montar de 1 a 3 termos de busca (nome limpo, modelo, código do fabricante).
3. Abrir `https://lista.mercadolivre.com.br/<termo>` no Claude no Chrome e ler os 20 primeiros resultados: título,
   preço, frete grátis, Full, patrocinado, link.
4. Decidir, um a um, se é o **mesmo produto** (e quantas unidades o anúncio vende). Diferente fica na lista com o motivo.
5. Abrir até 10 dos que são o mesmo produto e ler: vendidos ("+500 vendidos"), tipo (Clássico/Premium quando a página
   diz), vendedor e reputação, e se é anúncio de catálogo.
6. Apontar os fornecedores coletados que vendem o mesmo produto e de 2 a 5 produtos da 4hobby parecidos (mesma família e
   faixa de preço) que já vendem no ML.
7. `calcularEstudoDeViabilidade`; com os números, decidir o veredito pelos critérios e escrever a conclusão (até 6
   linhas: por que vale ou não, o risco principal, o que conferir antes de comprar).
8. `gravarEstudoDeViabilidade`.

Tela de login, CAPTCHA ou bloqueio: o Claude **para e avisa o dono**; nunca tenta contornar. O preço lido é sempre o
**normal**, nunca o promocional (regra do projeto).

## Contas (no código do Rise, regras puras)

- **Preço de venda de referência:** a mediana do preço por unidade dos anúncios do mesmo produto. Menor e maior ao lado.
- **Custo:** o menor custo com impostos entre os fornecedores apontados (`custoDoFornecedor`), com a lista inteira ao
  lado (fornecedor, custo, estoque, múltiplo). Sem fornecedor, o custo fica vazio e o veredito não pode ser "Vale".
- **Lucro no ML vendendo pela referência:** a mesma conta do editor de anúncio (`custosDoAnuncio`: comissão, tarifa fixa,
  frete e imposto), em R$ e em % de markup sobre o custo total. Sem peso conhecido, o frete entra pela faixa mais comum e
  o relatório diz que foi estimado.
- **Preço mínimo para 30% de markup** (`precoPorMargem`), para comparar com o menor preço do mercado.
- **Demanda:** soma dos vendidos acumulados (o piso da faixa: "+500" conta 500), número de vendedores e quantos com Full.
  Nível: **Forte** a partir de 1.000, **Média** de 200 a 999, **Fraca** abaixo de 200.
- **Vendas por mês do mercado:** o ML só mostra o acumulado. No primeiro estudo fica "não medido". Num estudo repetido
  com 7 dias ou mais de intervalo, o Rise compara os mesmos anúncios e calcula a diferença por mês.
- **Quantidade inicial:** a mediana das vendas mensais dos produtos parecidos da 4hobby no ML (últimos 90 dias) × 2
  meses, arredondada para cima no múltiplo e no pedido mínimo do fornecedor. Sem parecidos: 20, 10 ou 5 unidades pela
  demanda Forte, Média ou Fraca. Veredito "Não vale" zera a quantidade.

## Critérios do veredito (no roteiro)

- **Vale:** markup de 30% ou mais e lucro de R$ 5 ou mais pela referência, demanda Média ou Forte, fornecedor com
  estoque.
- **Vale com ressalva:** markup de 15 a 30%, ou demanda Fraca, ou um fornecedor só, ou frete estimado, ou o menor preço
  do mercado abaixo do nosso preço mínimo.
- **Não vale:** markup abaixo de 15%, lucro abaixo de R$ 5 ou nenhum fornecedor.

Confiança: Alta com 5 ou mais anúncios do mesmo produto e vendidos lidos; Média com 2 a 4; Baixa com 1 ou sem vendidos.

## Telas

- **Compras > Estudos de viabilidade** (cartão novo, `/compras/estudos`). O operador vê primeiro o veredito de cada
  produto; a ação principal é abrir o relatório. Tabela com foto, produto, fonte, situação, veredito, preço no ML,
  custo, lucro, quantidade e data; cabeçalhos que ordenam, "100 por página" e navegação à direita. Lixeira com o popup
  de exclusão.
- **Relatório** (`/compras/estudos/[id]`): no topo o veredito, a confiança, a quantidade inicial e a conclusão. Abas
  **Resumo** (as contas), **Mercado Livre** (os anúncios lidos, com link; os que não são o mesmo produto em cinza com o
  motivo), **Custo** (fornecedores e parecidos) e **Histórico** (os outros estudos do mesmo produto). Botão "Estudar de
  novo" põe um estudo novo na fila.

## Testes

`npm run teste:estudos`: regras puras (mediana, piso da faixa, nível, quantidade, arredondamento, vendas por mês entre
dois estudos), banco (fila sem repetir, calcular, gravar, histórico) e as cinco ferramentas do MCP com o acesso. Postgres
local, sem rede; só escreve `ZZ-EST-*`.

## Validação

Um produto escolhido pelo dono no Scraper, estudado de ponta a ponta pelo Claude Desktop, com o relatório aberto no Rise.
