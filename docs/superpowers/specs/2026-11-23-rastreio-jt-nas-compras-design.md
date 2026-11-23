# Rastreio da J&T nos pedidos de compra (23/11/2026)

Pedido do dono: "Faço algumas compras pela JT Express. É possível fazer o rastreio pela API da JT Express ou criar uma
extensão no Chrome para buscar os rastreios?" Escolheu a **Opção 1** (API do PacoteVício) e aprovou o desenho no mesmo dia.

## Por que o PacoteVício

- A OpenAPI oficial da J&T (`openapi.jtjms-br.com`) é só para quem tem contrato de remetente (`apiAccount`, `privateKey`,
  `customerCode`); a 4hobby recebe, não envia pela J&T.
- O site público pede o CPF/CNPJ de quem recebe e tem captcha de arrastar: uma extensão teria de passar pelo captcha, o
  que o Rise não faz.
- O PacoteVício (`GET api.pacotevicio.dev/v1/track/jtexpress/{codigo}`, cabeçalhos `X-API-Key` e `X-Tracking-Document`)
  devolve o JSON padronizado (`status`, `status_updated_at`, `delivered_at`, `events` do mais antigo ao mais recente). Plano
  Básico: 1.000 consultas/mês grátis, com o evento de atribuição "Rastreio fornecido por PacoteVicio.dev" que **não pode ser
  escondido** e o link do PacoteVício junto do rastreio.

## O que entra

- **Quais pedidos:** de compra ENVIADO ou PARCIAL, origem RISE, com rastreio da J&T: código de 15 dígitos começando com 888
  ou transportadora (do cadastro ou digitada) com "J&T"/"JT Express". Nada muda no jeito de digitar o rastreio.
- **Documento:** o CNPJ de Dados da empresa; se a J&T não achar com ele, o **CPF alternativo** de Configurações › Envios.
  O que achou fica guardado (`documento`: "CNPJ"/"CPF") e é o primeiro da próxima vez. O documento nunca vai a log, à tela
  do pedido nem ao MCP.
- **Rotina do worker `rastreioCompras`:** confere a cada 30 min quem venceu; cada pedido é lido a cada 6 h. Para no
  entregue ou devolvido. Não achado: tenta de novo em 24 h. Teto automático de 900 consultas no mês (`PACOTEVICIO_LIMITE_MES`),
  contado em Configurações de frete; o botão continua consultando até a cota do PacoteVício. Linha na Saúde do Rise.
- **Botão "Atualizar rastreio"** no bloco Frete do pedido (gasta 1 consulta; exige editar pedidos de compra).
- **Bloco Frete:** situação traduzida com a data, linha do tempo (todos os eventos, com cidade/UF, inclusive o da
  atribuição), data de entrega e o link "Rastreio por PacoteVício".
- **Lista de Compras:** a Situação segue os eventos (Em trânsito, Saiu para entrega, Aguardando conferência quando entregue e
  falta lançar). **Ajuste ao desenho aprovado:** o "!" acende só em problema (falha na entrega, devolução), não no entregue,
  pela regra do dono de 04/11/2026 ("Entregue não é '!': a Situação já diz 'Aguardando conferência'").
- **MCP:** `lerPedidoDeCompra` traz `rastreioJT` (situação, último evento, entregue em, eventos), sem o documento.
- **Sem a chave** (`PACOTEVICIO_API_KEY` fora do `.env`): nada é consultado, o bloco mostra só o código como hoje.

## Fora

Correios, Shopee e outras transportadoras do PacoteVício (o cliente já aceita outra rota depois), compras do AliExpress e do
Mercado Livre (têm rastreio pela origem), aviso no Telegram.

## Plano (execução inline, TDD, um commit)

1. `src/lib/compras/rastreioJT/regras.js` (puro): `ehDaJT`, `codigoDaJT`, `lerRespostaDoPacoteVicio`, `rotuloDaSituacao`,
   `proximaLeituraDoRastreio`, `faseDoRastreio`.
2. `src/lib/compras/rastreioJT/pacoteVicio.js`: `consultarJT(codigo, documento)` (fetch, `PACOTEVICIO_URL` para o falso).
3. Migration `20261123d_rastreio_jt`: modelo `RastreioDaCompra` (um por pedido) e, em `ConfigDeFrete`,
   `documentoRastreioJT`, `rastreioMes`, `rastreioConsultasNoMes`.
4. `src/lib/compras/rastreioJT/banco.js`: `atualizarRastreioDaCompra`, `rodarRastreioDasCompras`, `rastreioParaTela`.
5. Worker (rotina `rastreioCompras`), Saúde, ação `atualizarRastreioAcao`, bloco Frete, CPF em Envios, Situação/"!" da lista
   e o `lerPedidoDeCompra`.
6. `npm run teste:rastreio-jt` com o PacoteVício falso nesta máquina; lint; CLAUDE.md.

## Abordagens consideradas

1. **PacoteVício (escolhida):** API pronta, sem captcha, grátis no volume da 4hobby; custo: depende de um terceiro e do link
   de atribuição.
2. Extensão do Chrome no site da J&T: esbarra no captcha; recusada.
3. OpenAPI oficial: exige contrato de remetente; não se aplica.
