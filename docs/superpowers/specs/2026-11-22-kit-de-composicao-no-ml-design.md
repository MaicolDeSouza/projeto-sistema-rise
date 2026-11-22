# Kit de composição: sempre pelo cadastro, um anúncio por vários caminhos (desenho)

Pedido do dono em 22/11/2026, aprovado em quatro mensagens da mesma conversa. Este texto é a referência do plano
`docs/superpowers/plans/2026-11-22-kit-de-composicao-no-ml.md`.

## Por quê

O dono quis anunciar no Mercado Livre um kit de 1 conector DB25 macho (901202) + 1 fêmea (901201). O Rise tem dois
caminhos para kit: o **produto "Com composição" do cadastro** (07/10/2026) e a **composição montada no editor do ML**
(`Anuncio.dados.composicao`). O segundo serve bem para "Kit de N" do mesmo produto, mas com produtos diferentes:

- a venda entra errada: `casarItens` (`src/lib/pedidos/itens.js`) casa o item com o produto principal do anúncio e
  multiplica pela soma das quantidades (1 macho + 1 fêmea viraria 2 machos);
- o kit não existe como produto: sem código próprio no cadastro e sem localização para a separação;
- o código só existe no anúncio e no Bling.

Palavras do dono: "o kit deve sempre ser montado no rise antes, pois tenho que definir o código, ter as localizações para
facilitar a separação do produto. Caso eu não queira mandar para LI simplesmente não envio. Também tem que criar kit no
bling para fazer controle de estoque."

## O que já existe e não muda

Produto kit no cadastro com código, localização automática das peças, estoque calculado, envio ao Bling com a composição,
preço sugerido pela soma da venda das peças (editável), anúncio do ML de um produto kit publicando como anúncio comum
(pré-checagem do `formato "E"` no Bling), Vendas com custo e peças em falta pelas peças, e o "!" do kit no Rise pelo
retrato das peças do último Salvar (`CAMPOS_DO_RETRATO`, que já inclui o preço de venda).

Medido na VPS em 22/11/2026: 134 anúncios do ML, 55 com composição no editor, **1 misto** (o rascunho 258262, criado nesta
conversa) e **nenhum anúncio de produto kit do cadastro** (existe 1 produto kit). O caminho "anúncio de produto kit" nunca
foi usado de verdade: o primeiro uso é o teste.

## Decisões do dono

- **A1.** O editor do ML só aceita composição do MESMO produto ("Kit de N"). Produtos diferentes: recusa com o caminho
  ("monte o kit em Produtos, tipo Com composição").
- **B1.** O NCM do kit é o da peça de maior quantidade (empate: a primeira da lista), preenchido sozinho e editável.
- **C1.** O rascunho 258262 é excluído; o kit nasce em Produtos e o anúncio sai dele.
- Estoque mínimo e máximo não aparecem no kit ("isso é mostrado dentro de cada item").
- Na aba Fornecedores do kit, o link de cada peça tem cara de link e abre em nova janela.
- Preço do kit = soma das peças, aberto para edição (já é assim); mostrar a soma quando o preço for diferente dela.
- **Um anúncio, vários caminhos:** o anúncio do kit de composição aparece no popup "Anúncios do Mercado Livre" de cada
  peça do kit e no do próprio kit; é o mesmo registro, aberto no mesmo editor.
- **Popup em 3 blocos**, cada um com título e borda, e bloco vazio some: "Anúncio do produto" (simples), "Anúncios em
  kit" (Kit de N do mesmo produto) e "Anúncios com composição" (a linha diz o código do kit e as peças: `258262 · 1× 901202
  + 1× 901201`).
- No popup da peça, a linha do kit de composição abre e edita, mas **excluir e clonar ficam só no popup do kit**.
- **Selo "Kit de composição"** na lista de anúncios do ML (e "Kit de N" no kit do mesmo produto).
- **"!" quando o preço de uma peça muda:** no produto kit do Rise (já existe) e **no anúncio do ML do kit**, com o motivo.
  O "!" do anúncio do kit **não sobe** para o ícone do ML da peça na lista de Produtos. O Rise nunca muda preço sozinho.
  Salvar o kit renova o retrato e apaga os dois; se o preço do kit mudou no Salvar, o anúncio acende pelo "preço da loja"
  que já existe, até sincronizar. Só o preço de venda conta (o custo fica fora, como no retrato de 10/10/2026).

## Fora deste desenho

Converter os 54 "Kit de N" do editor em produtos; folha de separação; kit dentro de kit; mudar a regra do bloco "Compre em
kit e economize" (kit de composição continua fora dele).
