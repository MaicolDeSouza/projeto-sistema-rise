# "Compre em kit e economize" na descrição do anúncio do ML

Desenho combinado com o dono em 20/11/2026. Pedido dele: "quero colocar nos anúncios de kit uma mensagem na descrição
induzindo cliente a comprar kit", mais as boas-vindas no começo e a garantia fora do texto.

## Para quê

O cliente que abre o anúncio de 1 unidade não sabe que existe o kit de 3 ou de 5, mais barato por unidade. A descrição
passa a dizer isso, com o preço e o link de cada kit maior. Vender o kit aumenta o valor da venda e dilui o frete.

## O que muda no texto que vai ao ML

O texto final de todo anúncio do ML passa a ter três partes, nesta ordem (formato 2 da descrição):

1. **Boas-vindas** (texto fixo no código, igual em todo anúncio):

   ```
   Bem-vindo(a) à nossa loja!
   - Dúvidas? Use o campo de perguntas, respondemos rápido.
   - Emitimos nota fiscal em todas as vendas, com os dados do seu cadastro no Mercado Livre.
   Boas compras!
   ----------------------------------------
   ```

2. **A descrição de hoje** (a do produto, ou a do kit), **sem a seção "Garantia:"** (o título e as linhas dela até a linha
   em branco). O ML já escreve a garantia no fim do anúncio. O cadastro do produto e a Loja Integrada não mudam.

3. **O bloco dos kits**, só quando há kit maior para mostrar:

   ```
   ----------------------------------------
   COMPRE EM KIT E ECONOMIZE

   Kit com 3 unidades por R$60,00 (R$20,00 por unidade)
   https://produto.mercadolivre.com.br/MLB-...

   Kit com 5 unidades por R$75,00 (R$15,00 por unidade) + frete grátis
   https://produto.mercadolivre.com.br/MLB-...
   ```

A linha é de hifens porque o ML recusa caractere fora do Latin-1. O preço vai sem espaço depois do "R$" (pedido do dono).

## Quais kits entram no bloco de um anúncio

- Vale para o anúncio simples (1 unidade) e para o kit de um produto só (código `{sku}_{N}`). Kit misto e produto com
  composição não ganham bloco nem aparecem no de ninguém.
- Entram os anúncios do **mesmo produto base** com **mais unidades** que o anúncio, **publicados e não encerrados**
  (ativo ou pausado). Encerrado e excluído saem. Rascunho não entra: não tem link.
- Uma linha por quantidade, da menor para a maior. Com mais de um anúncio da mesma quantidade (Clássico e Premium), vale
  o mais barato.
- O preço é o que está no ML (o último enviado), não um preço digitado e ainda não enviado.
- "+ frete grátis" quando o kit tem frete grátis ligado ou preço a partir de R$ 79.
- **Só entra o kit mais barato por unidade** que o próprio anúncio e que todo kit menor já listado. O que não for fica
  fora do bloco, e o editor DELE avisa: "Preço por unidade (R$ X) não é menor que o do kit de N (R$ Y): fica fora do
  'Compre em kit'". O Rise nunca mexe no preço sozinho (decisão B); o dono acerta pelo "Desconto adicional".
- O anúncio do maior kit não tem bloco.

## O "!" e o envio

- O bloco é uma parte nova da impressão do anúncio (`kits`: quantidade, preço, link e frete grátis de cada linha). Mudou
  qualquer coisa nela (kit novo publicado, preço de kit enviado, kit encerrado ou excluído, kit que deixou de ser o mais
  barato), o anúncio acende o "!" com o motivo "kits da descrição", e o "Sincronizar com o ML" reenvia a descrição.
- Nada vai ao ML sozinho. A ordem de publicação é livre: publicar os kits maiores primeiro só evita reenvios.
- **Só o anúncio já no formato 2 acompanha os kits** (decisão C). O anúncio publicado antes desta mudança não acende o
  "!" por causa dela, nem pelas boas-vindas, nem pela garantia.
- O anúncio passa ao formato 2 quando é publicado ou sincronizado depois do deploy (todo envio já manda a descrição).
  Para converter um anúncio antigo sem outra mudança, o editor dele mostra "Descrição no formato antigo" e libera o
  "Sincronizar com o ML".
- **"Salvo a partir de que produtos começamos"** (pedido do dono): cada anúncio guarda o formato e a data em que a
  descrição foi enviada. A lista de anúncios do ML ganha o filtro "Descrição no formato antigo", com a contagem, para o
  dono voltar depois e acertar os que faltam.

## Abordagens consideradas

1. **Montar o bloco na hora, a partir dos anúncios irmãos (escolhida).** O texto continua saindo de uma função pura
   (`montarDescricaoML`), que passa a receber os kits; a prévia, a validação, o Publicar e o "!" leem a mesma conta. Nada
   fica gravado no texto da descrição.
2. **Gravar o bloco dentro da descrição de cada anúncio.** Recusada: a descrição do anúncio simples é sempre a do
   produto, e o bloco gravado ficaria velho a cada mudança de preço.
3. **O worker reenviar as descrições sozinho.** Recusada: o dono quer o "!" e decidir o envio; nada vai ao ML sozinho.

## Fora do escopo

- Baixar o preço de kit automaticamente.
- Reenviar em massa os anúncios antigos (o dono volta depois, pelo filtro).
- Texto das boas-vindas editável na tela (mudar o texto acenderia o "!" em todos os anúncios no formato 2).
- Mudar a descrição do produto ou a da Loja Integrada.

## Riscos que o dono conhece

- O link na descrição não é clicável (texto puro), e a regra oficial do ML sobre link para outro anúncio próprio não foi
  confirmada. O primeiro envio real é no 901202, para ver se o ML aceita, antes de converter outros.
- Preço escrito envelhece: cada mudança de preço de um kit acende o "!" nos anúncios menores do produto (decisão A).

## Para quem implementa

- A impressão guarda `formato` e `kits`; o `descricao` da impressão continua sendo o texto base de hoje, para o anúncio
  antigo não acender. `mudancasDoAnuncio` só conta `kits` quando a impressão tem a chave.
- Os irmãos entram no contexto do editor, no `mudancasDosAnunciosML` (lista de Produtos e do ML) e no Publicar.
- Testes no `teste:anuncios-ml`: texto montado (com e sem kits, garantia retirada, kit fora por preço), o "!" (kit novo,
  preço, encerrado, anúncio antigo que não acende), o filtro do formato antigo e o envio contra o ML falso.
