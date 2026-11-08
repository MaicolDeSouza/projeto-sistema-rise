/**
 * Roteiro UNICO da analise de lista de fornecedor (pedido do dono em 07/11/2026: "padronizar o formato e a funcionalidade
 * do arquivo ... isso deve ficar descrito no rise pois posso usar outra LLM para fazer essa mesma analise"). Servido pela
 * ferramenta do MCP `roteiroDaAnaliseDeFornecedor`, junto com o formato dos dados e o modelo da pagina (modelo.html), para
 * qualquer assistente seguir igual. Nasceu da analise da NexMind (06-07/11/2026). Mudou o roteiro: suba a versao.
 */

// v2 (07/11/2026): o item que entra no pedido num produto sem vinculo com o fornecedor vai para a lista "vincular" e o
// passo 7 manda criar o vinculo (tres itens da primeira analise sairam sem o nome do fornecedor no pedido).
export const VERSAO_ROTEIRO_ANALISE = "v2";

export const ROTEIRO_ANALISE = `ANÁLISE DE LISTA DE FORNECEDOR (roteiro ${VERSAO_ROTEIRO_ANALISE}, 07/11/2026)

OBJETIVO
O dono manda a lista de preços de um fornecedor (PDF, planilha ou HTML; em R$ ou US$) e quer saber, item a item, se compensa comprar para revender: o custo em reais comparado com o MENOR concorrente que vende o MESMO produto e com os fornecedores que já vendem. O resultado é SEMPRE a página do modelo padrão (parte "modelo" desta ferramenta), no formato de dados da parte "esquema". Não invente outro formato.

PASSO 1 · A LISTA NO RISE
- A lista entra pela fonte do fornecedor (quem faz é o dono): Mercados > Fontes > aba Fornecedores > linha da fonte > "Enviar lista" e depois "Atualizar dados". Fornecedor novo: "Cadastrar fonte". Lista em dólar: no cadastro do Fornecedor, "Moeda da lista" US$ e "Fator de importação" (frete e impostos).
- Os itens carregados aparecem no buscarNoMercado (tipo fornecedor, a fonte dele). Sem a lista no Rise, leia o arquivo que o dono mandar na conversa e avise que o Rise não a terá.
- O Rise lê planilha com cabeçalho e os formatos já ensinados. PDF com outro desenho precisa de um leitor novo: diga ao dono (ou peça a lista em Excel).

PASSO 2 · O QUE FICA DE FORA
- Os itens que já estão no rascunho aberto do fornecedor (listarPedidosDeCompra e lerPedidoDeCompra), pelo SKU do Rise.
- Se o dono limitar (uma categoria, só os com concorrente), siga o pedido dele.

PASSO 3 · CASAR CADA ITEM COM O RISE
- buscarProdutos, buscarProdutosSimilares e consultarProduto. É o mesmo produto só com a mesma especificação (modelo, tensão, corrente, tamanho, cor, quantidade na embalagem). Na dúvida, não case.
- rise.dono = true só quando o dono confirmou o código ou o vínculo com o fornecedor já existe no Rise; o casamento que você sugeriu vai com dono = false (a página avisa "confira").
- Dois itens da lista podem cair no mesmo SKU (variantes): a página avisa que gravar um troca a quantidade do outro.

PASSO 4 · CONCORRENTES E FORNECEDORES
- Concorrentes: buscarNoMercado tipo concorrente. Só o MESMO produto (kit não é unidade; 20A não é 30A; shield não é módulo). Uma oferta por loja (a mais barata do mesmo produto). Preço NORMAL, nunca o promocional (o promocional só na falta do normal). Estoque "disp", "sem" ou null (não informado).
- Fornecedores: buscarNoMercado tipo fornecedor, das OUTRAS fontes (nunca a da própria lista), com o preço com impostos.
- Item sem concorrente aprovado entra assim mesmo (faixa "Sem concorrente").
- Lista grande: revise em lotes e guarde as decisões; a qualidade do casamento vale mais que a pressa.

PASSO 5 · CONTAS (a página calcula; nos dados vai o preço como a lista escreve)
- custo em R$ = preço da lista × câmbio (só lista em US$) × fator. Preço no pedido = a mesma conta com 4 casas.
- Câmbio: a PTAX usada na conversão da lista (o Rise converte no "Atualizar dados"), com a data. Fator: o do cadastro do fornecedor (1 se não houver).
- ganho = (menor concorrente − custo) ÷ custo, em %. A mediana é só informação.
- Faixas: ótimo 100% ou mais; bom 60 a 99%; apertado 30 a 59%; não compensa menos de 30%; sem concorrente.

PASSO 6 · A PÁGINA
- Monte os DADOS (parte "esquema") e ponha no modelo (parte "modelo"): troque /*__DADOS__*/null pelo JSON (com "</" escrito "<\\/"), /*__FOTOS__*/null pelo mapa de fotos ou deixe null, e o <title> por "<apelido> × concorrentes". No Claude Code, scripts/analise-fornecedor-montar.js faz isso (e reduz as fotos a 300 px).
- No claude.ai: publique como artefato com as capacidades mcp (servidor "Rise": lerPedidoDeCompra, consultarProduto, montarPedidoDeCompra) e db. Os botões gravam direto no rascunho do fornecedor e nas listas "criar" e "vincular" do banco da página.
- Em outro assistente: entregue o HTML (arquivo ou visualização). A página funciona para ver e filtrar; o botão "Copiar escolhas" gera o texto com os itens e quantidades para o dono colar na conversa.
- Se o HTML não couber numa resposta, divida em partes com o mesmo modelo (por faixa, ou de 100 em 100 itens), ou leve só os itens com concorrente, e diga o que ficou de fora.

PASSO 7 · AS ESCOLHAS DO DONO
- Itens com código (do "Copiar escolhas" ou dos botões): montarPedidoDeCompra com o fornecedor como está no Rise e cada item com sku, quantidade, precoUnitario de 4 casas e ipiPercentual 0. Mostre o pedido devolvido. O pedido fica em RASCUNHO; mudarSituacaoDoPedidoDeCompra só quando o dono pedir com todas as letras.
- Itens para criar (sem código): mostre a lista e só siga com a permissão do dono. O MCP não cria produto: quem cria é o Claude Code (scripts/analise-fornecedor-criar-produtos.mjs, na VPS) ou o dono na tela de cadastro. O cadastro: código automático da faixa 25xxxx; nome em português no padrão do Rise (MAIÚSCULAS, como "MÓDULO SENSOR DE CORRENTE ACS712 20A"); SIMPLES, UN; a foto da lista; o fornecedor como padrão, com o custo da lista e a descrição igual ao nome na lista. Depois de criados, entram no pedido como os outros.
- Itens que entraram no pedido num produto SEM vínculo com o fornecedor: o montarPedidoDeCompra devolve semVinculoComOFornecedor: true no item (na página, ele vai para a lista "vincular" do banco e o cartão avisa). O pedido não cria vínculo, e a linha sai sem o nome do fornecedor no PDF. Depois das escolhas, leia a lista "vincular" (e os seus próprios montarPedidoDeCompra com esse aviso), mostre ao dono e, com a permissão dele, crie o vínculo: com o código do fornecedor quando a lista tem código, senão sem código e com a descrição igual ao nome na lista; NÃO padrão (o custo do produto não muda); e ponha o nome da lista na linha do pedido. O MCP não cria vínculo: quem cria é o Claude Code (scripts/analise-fornecedor-vincular.mjs, na VPS) ou o dono na aba Fornecedores do produto (e, no pedido, tira e põe o item de novo para a linha pegar o nome).
- Preço de venda e Bling: pergunte ao dono a regra do preço (markup fixo sobre o custo ou a regra da loja: abaixo da Usinainfo, dentro dos 5 primeiros, piso de 30%) mostrando a tabela antes de gravar. O "Cadastrar no Bling" exige preço de venda; fornecedor sem CNPJ não vai ao Bling.

NUNCA
- Inventar preço, concorrente, especificação ou produto.
- Decidir pelo preço promocional.
- Enviar o pedido ou criar produto sem a ordem do dono.`;

export const ESQUEMA_ANALISE = `FORMATO DOS DADOS (versão 1) · o objeto que entra no lugar de /*__DADOS__*/null

{
  "versao": 1,
  "fornecedor": "NexMind Technology",     // nome EXATO do fornecedor no Rise (vai no montarPedidoDeCompra)
  "apelido": "NexMind",                   // opcional: nome curto para a tela
  "moeda": "USD",                         // "USD" ou "BRL": a moeda em que a lista escreve o preço
  "cambio": 5.5013,                       // R$ por US$ (obrigatório em USD; null em BRL)
  "cambioData": "06/11/2026",             // opcional: data da cotação
  "fator": 2.2,                           // multiplicador de frete e impostos; 1 quando não há
  "pedido": "PC-0027",                    // rascunho aberto do fornecedor, ou null (o primeiro item gravado abre um)
  "coletaEm": "2026-11-07T03:00:00Z",     // quando os preços dos concorrentes foram lidos
  "itens": [
    {
      "n": 52,                            // número do item na lista (único; é a chave da página)
      "nome": "5V 20A ACS712 Current Sensor Module",   // como a lista escreve
      "codigo": null,                     // opcional: código do item no fornecedor
      "preco": 0.48,                      // preço na moeda da lista, sem conversão
      "foto": null,                       // opcional: endereço da foto (sem FOTOS embutidas)
      "nota": null,                       // opcional: observação curta para o dono
      "rise": {                           // ou null quando não há produto no Rise
        "sku": "190201", "id": "cm...", "nome": "MODULO SENSOR DE CORRENTE ACS712 30A",
        "custo": 9.5, "venda": 29.9, "estoque": 12, "fornecedor": "Fortek R$ 9,50",
        "dono": true                      // true: código confirmado pelo dono ou vínculo existente; false: sugerido
      },
      "ofertas": [                        // concorrentes do MESMO produto, uma por loja
        ["Usinainfo", "Sensor de Corrente ACS712 20A", 18.9, "https://...", "disp"]
        // [loja, nome na loja, preço normal em R$, endereço ou null, "disp" | "sem" | null]
      ],
      "forn": [                           // outros fornecedores que vendem
        ["Fortek", "ACS712 20A", "64-123", 8.9, 40, null]
        // [fornecedor, nome, código ou null, preço com impostos em R$, quantidade ou null, endereço ou null]
      ]
    }
  ]
}

FOTOS (opcional) · o objeto que entra no lugar de /*__FOTOS__*/null: { "n52": "data:image/jpeg;base64,..." }, uma foto por item, de até 300 px.`;
