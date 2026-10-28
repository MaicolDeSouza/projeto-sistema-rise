# Rise AliExpress (extensão do Chrome)

Leva as compras de **Meus pedidos** do AliExpress para o módulo **Compras** do Rise, com o rastreio de cada item.
Spec: `docs/superpowers/specs/2026-10-28-aliexpress-em-compras-design.md`.

## Instalar (uma vez)

1. No Rise: **Configurações › Integrações › AliExpress › Gerar chave da extensão**. Copie a chave (ela aparece uma vez só).
2. No Chrome: abra `chrome://extensions`, ligue **Modo do desenvolvedor** (canto superior direito) e clique em
   **Carregar sem compactação**. Escolha esta pasta (`extensao-aliexpress`).
3. Fixe o ícone da extensão na barra, clique nele, abra **Configuração**, cole a chave e confira o endereço do Rise
   (`https://rise.4hobby.com.br`). **Salvar**.

## Usar (toda semana)

1. Entre no AliExpress e abra **Meus pedidos** (`https://www.aliexpress.com/p/order/index.html`), em português e reais.
2. Clique no ícone da extensão e em **Enviar ao Rise**. Não feche a aba até aparecer o resumo (alguns minutos).
3. O resumo diz quantos pedidos foram lidos, quantos são novos, quantos rastreios vieram e se há item sem produto.
4. No Rise, em **Compras › Pedidos**, os pedidos do AliExpress têm o selo laranja. O **!** marca item sem produto
   (escolha o produto e o fator no pedido) ou pedido entregue no AliExpress que falta lançar.

## O que ela faz e o que não faz

- Lê só a página de pedidos, com o seu login, e manda ao Rise pedido, loja, itens, preços e rastreio.
  Nunca manda endereço, telefone, nome do destinatário nem dados de pagamento.
- Não compra, não cancela e não muda nada no AliExpress.
- Na primeira vez lê os pedidos em andamento e os dos últimos 30 dias; depois, os novos e os que ainda estão abertos.

## Quando der erro

- **"Não achei a aba …"** ou **"A lista de pedidos não respondeu"**: o AliExpress mudou a página. Avise para ajustar
  `pagina.js` (as abas e o botão "Ver mais pedidos" são achados pelo texto).
- **"O Rise respondeu 401"**: a chave mudou. Gere outra no Rise e cole de novo.
- **"O Rise não respondeu JSON (tela de login?)"**: o servidor está pedindo login nessas rotas (o Caddy da VPS precisa
  deixar `/api/compras/aliexpress/estado` e `/importar` fora do login).
