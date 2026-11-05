# Vincular fornecedores Fortek e Nightech aos produtos não conferidos (05/11/2026)

**Pedido do dono (05/11/2026):** "Vamos vincular os produtos dos fornecedores Fortek e Nightech aos produtos. Gere um
HTML ou algo assim, onde mostra foto, descrição e código do produto do Rise e ao lado foto e descrição dos fornecedores
daquele item e um checkbox em cada fornecedor para eu poder vincular aquele produto aos fornecedores. E após eu salvar o
arquivo você deve vincular tudo no Rise. Os produtos já conferidos ficam de fora dessa lista." Aprovado como está em
05/11/2026 ("Sim pode fazer").

## Intenção

Os 1.251 produtos não conferidos (ativos) da VPS quase não têm fornecedor vinculado (5 com Fortek/Nightech), e a lista de
compras só funciona com o vínculo. O dono revisa tudo de uma vez numa página fora do Rise, marca as caixas, salva um
arquivo, e o Rise recebe os vínculos de uma vez, sem abrir 1.251 cadastros.

## Objetivos / não objetivos

- Entra: produto `ativo` e `conferido = false`, com até 4 candidatos por fornecedor (Fortek, Nightech).
- Não entra: produto conferido; produto inativo; qualquer outro fornecedor; concorrentes.
- Gravação: só `ProdutoFornecedor` pela função `marcarReferencias` (nunca padrão, custo do produto não muda, nada vai ao
  Bling, à Loja Integrada ou ao Mercado Livre). O padrão o dono escolhe depois, na tela.
- Anti-objetivo: tornar padrão ou alterar o custo de um produto sem o dono ver.

## Restrições

- A página é gerada NA VPS (dados e fotos atuais; a cópia do PC é de 03/11), com o script viajando pela entrada do
  `docker compose exec -T app node --input-type=module -` numa conexão SSH só (muitas conexões bloqueiam o IP da casa).
- A página tem de abrir do disco (`file://`), sem servidor e sem biblioteca externa.
- Nenhum segredo no texto de comando nem na página.

## Abordagens consideradas

1. **Página gerada na VPS, escolhas num JSON, gravação por script (escolhida).** Reaproveita a regra de parecido da lupa
   (`buscaPorPalavras`/`texto.js`) e a gravação existente (`marcarReferencias`). Custo: um script de geração e um de
   aplicação.
2. Tela dentro do Rise: mais trabalho (rota, acesso, deploy) para um trabalho que se faz uma vez.
3. Planilha: sem foto ao lado, que é o que decide o vínculo.

## O desenho

- **Geração** (`scripts/vincular-fornecedores-gerar.js`): lê os não conferidos, os coletados da Fortek e da Nightech
  (só os campos leves; a miniatura só dos candidatos que aparecem), monta por produto: os vínculos que já existem
  (marcados e travados), o código do rascunho do Bling quando existe na fonte (marcado), e os parecidos pela regra da lupa
  (metade do peso do título; com até 2 palavras todas exigidas; nome de 3+ palavras dentro do título também entra). Até
  4 por fornecedor. Fotos pequenas (sharp, 120 px) em `fotos/`, da foto principal do produto e da miniatura do coletado.
  Saída: `dados/vincular-fornecedores/index.html` + `fotos/`, que vem para `sistema-rise/dados/vincular-fornecedores/` no PC.
- **Página:** barra fixa com busca, "Só abaixo do mínimo", "Só não revisados", contador e **Salvar escolhas** (baixa
  `vinculos-fortek-nightech.json`) e "Carregar arquivo". Uma linha por produto (foto, SKU, nome, estoque/mínimo, rascunho
  do Bling) e os candidatos agrupados por fornecedor (foto, código, nome, preço com IPI, estoque por situação, link,
  relevância). Botões por linha: OK (revisado sem mudar) e "Nenhum serve". Tudo guardado no `localStorage`.
- **Aplicação** (`scripts/vincular-fornecedores-aplicar.js`): o JSON vai embutido no texto do script (`const ESCOLHAS`),
  pela mesma entrada do comando; sem `--confirmo` só lista o que faria; com ele chama `marcarReferencias(sku,
  { fornecedores: { adicionar } })` por produto e imprime feitos / já estavam / recusados.

## Decisões minhas (o dono pode trocar)

- Gerar na VPS, não no PC. 4 candidatos por fornecedor. Nunca padrão. Estoque abaixo do mínimo = `estoque < estoqueMinimo`
  (a regra do Compras). Produto sem candidato nenhum vai numa lista no fim da página.
