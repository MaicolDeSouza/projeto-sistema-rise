# Anúncios antigos do ML fora do Rise — desenho curto (09/11/2026)

## Por quê
Pedido do dono: "verifique os produtos que já foram validados, se os mesmos têm anúncios já no ML; caso tenha anúncios antigos
deve ligar ! para eu possa reaproveitar os mesmos, pois na regra do ML não pode ter anúncios duplicados". Varredura provisória,
até alinhar todos os anúncios: um botão que o dono clica, sem rotina no worker ("pode criar um botão 'verificar anúncios
antigos' e eu clico quando desejo varrer"). Kits também ("kit de 1, 2, 3, 4, 5, 10, 20... para cada produto base").

## Abordagens
- **Ler a conta inteira de uma vez (escolhida):** a lista de ids pelo `search_type=scan` e os anúncios de 20 em 20 pelo
  `/items/bulk` (~60 chamadas para ~1.000 anúncios). Casa pelo código do anúncio, com qualquer N de kit.
- Buscar produto a produto pelo `seller_sku` (como a proposta): ~1.300 conferidos × 17 buscas = ~22 mil chamadas. Recusada.
- Só ao abrir o popup do produto: já existe, mas não acende o "!" na lista. Insuficiente.

## Desenho
- Botão "Verificar anúncios antigos" no topo da lista do ML (Canais de Venda > Mercado Livre), ao lado de "Novo anúncio",
  com o acesso `editar` do Mercado Livre. Gira enquanto lê e termina no popup de OK (`ConclusaoDoEnvio`) com quantos anúncios
  fora do Rise achou e em quantos produtos; o `title` diz quando foi a última verificação.
- Casamento (`casarAnunciosDaConta`, puro): anúncio não encerrado (`closed` fica de fora), que o Rise ainda não tem
  (`Anuncio.idExterno`), cujo código (`seller_custom_field` ou `SELLER_SKU`) é o SKU de um produto CONFERIDO (kit 1) ou
  `{sku}_{N}` com N >= 2 (kit N). Sem caixa. Produto não conferido ou código desconhecido fica de fora.
- Tabela nova `AnuncioForaDoRiseML` (itemId, produtoId, kit, título, preço, tipo, frete grátis, vendas, estado, link, lidoEm),
  trocada inteira a cada verificação (numa transação). Apagar o produto apaga as linhas dele.
- Reaproveitar (popup do produto, editor ou proposta) apaga a linha do MLB na hora.
- Ícone do ML na lista de Produtos: "!" com "N anúncio(s) na conta fora do Rise"; o filtro "!" acha esses produtos (o
  `temSeloDeAviso` passa a usar `temProblemaNoIconeML`).
- Popup do produto: a lista "Na conta do Mercado Livre, fora do Rise" (lida ao vivo, já existe) marca "duplicado" na linha
  cuja variante o Rise já tem (o mesmo kit N; ou, no de 1 unidade, o mesmo tipo e frete).

## Fora
Rotina automática no worker; produtos não conferidos; anúncios com código fora do padrão `{sku}_{N}`.
