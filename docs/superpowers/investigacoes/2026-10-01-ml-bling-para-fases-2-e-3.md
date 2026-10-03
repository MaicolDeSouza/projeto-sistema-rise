# Investigacao de leitura do ML e do Bling para as fases 2 e 3

Data: 03/10/2026. Tarefa 16 do plano da fase 1 (Canais de Venda / Mercado Livre).
Spec: `docs/superpowers/specs/2026-09-30-canais-de-venda-mercado-livre-design.md` (secoes 4 e 10).

**Regras seguidas:** so `GET`, pelos auxiliares do projeto (`mlGet` e `blingGet`). Nenhum `POST`/`PUT`/`PATCH`/`DELETE` foi enviado. `ML_PUBLICACAO` e `BLING_ESCRITA` nao foram tocados. Nenhuma funcao de token foi chamada diretamente. Nenhum dado de cliente aparece abaixo; os trechos de resposta foram cortados para os campos que importam.

**Conta ML:** vendedor `212386247`, site `MLB`. Categoria usada nos testes: `MLB99779` (Placas de Microcontroladores), a que o `domain_discovery` devolveu para "placa uno r3 ch340".

Contagem de leituras: ML 15 GETs e Bling 17 GETs (todos HTTP 200, nenhum 401/403), mais leitura de documentacao publica do ML no navegador e uma consulta somente leitura ao banco local do Rise (B6).

---

# Parte A: Mercado Livre

## A1. Categoria sugerida: `domain_discovery`

**Resposta.** Funciona. Devolve uma lista (aqui, um item) com dominio e categoria. O campo `attributes` vem vazio nessa chamada.

**Evidencia.** `GET /sites/MLB/domain_discovery/search?q=placa uno r3 ch340` -> HTTP 200:

```json
[{ "domain_id": "MLB-MICROCONTROLLER_BOARDS", "domain_name": "Placas de microcontroladores",
   "category_id": "MLB99779", "category_name": "Placas de Microcontroladores", "attributes": [] }]
```

`GET /categories/MLB99779` -> HTTP 200 (trechos): `path_from_root` = Eletronicos, Audio e Video > Componentes Eletronicos > Placas de Microcontroladores; `children_categories: []` (categoria folha); `settings.max_title_length: 60`; `max_pictures_per_item: 12`; `item_conditions: ["not_specified","used","new"]`; `listing_allowed: true`; `shipping_options: ["custom","carrier"]`; `catalog_domain: "MLB-MICROCONTROLLER_BOARDS"`.

**O que muda no plano.**
- Fase 2: a sugestao de categoria usa `category_id` e `domain_id` da primeira resposta; mostrar as alternativas se vierem varias. Como `attributes` vem vazio, os atributos vem sempre de `/categories/{id}/attributes` (A2).
- O limite de titulo e **60 caracteres** (`max_title_length`), igual ao que o projeto ja usa. Ler esse valor da categoria em vez de fixar 60 no codigo.
- Confirmar que a categoria e folha (`children_categories` vazio) antes de aceitar a categoria digitada na fase 1 (hoje digitada `MLB...`).

## A2. Atributos da categoria, GTIN e motivo de ausencia de EAN

**Resposta.** `GET /categories/MLB99779/attributes` -> HTTP 200, 64 atributos.

- Obrigatorios (`tags.required` e `catalog_required`): **`BRAND` e `MODEL`**. So esses dois.
- **`GTIN`** tem `tags.conditional_required` (nao `required`): e obrigatorio **condicionalmente**; quando a marca nao tem GTIN ou o item e excecao, aceita-se o motivo em **`EMPTY_GTIN_REASON`** (tambem `conditional_required`, lista).
- Valores de `EMPTY_GTIN_REASON` em MLB (ids reais da resposta): `17055158` "O produto e uma peca artesanal", **`17055159` "O produto e um kit ou pack"**, `17055160` "O produto nao tem codigo cadastrado", `17055161` "Outro motivo". Ou seja, **ha motivo oficial para kit**.
- `SELLER_SKU` existe (`hidden`, `variation_attribute`): e onde vai o SKU (confirma a decisao da fase 1).
- `IS_KIT` existe (`hidden`, lista Sim/Nao, ids `242085`/`242084`).
- Atributos de embalagem: `PACKAGE_HEIGHT/WIDTH/LENGTH/WEIGHT` sao `hidden`+`read_only` (o ML preenche; nao enviar). Os de envio do vendedor sao **`SELLER_PACKAGE_HEIGHT/LENGTH/WIDTH`** (cm) e **`SELLER_PACKAGE_WEIGHT`** (so `g`), `hidden`, sem `required` na resposta.
- Outros atributos uteis da categoria (nao obrigatorios): `MICROCONTROLLER`, `OPERATING_VOLTAGE`, `CLOCK_SPEED`, `FLASH_MEMORY_CAPACITY`, `SRAM_CAPACITY`, `EEPROM_CAPACITY`, `ANALOG_INPUTS_NUMBER`, `DIGITAL_INPUT_OUTPUT_PINS_NUMBER`, `INCLUDES_USB_CABLE`, `LENGTH/WIDTH/HEIGHT/WEIGHT`. `MODEL` traz uma lista sugerida de valores (Nano, Mini, Leonardo...), mas aceita texto livre (`value_type: string`).

**Evidencia (trechos).**

```json
{"id":"GTIN","tags":{"multivalued":true,"variation_attribute":true,"used_hidden":true,"validate":true,"conditional_required":true},"value_type":"string","hint":"Pode ser um EAN, UPC ou outro GTIN"}
{"id":"EMPTY_GTIN_REASON","tags":{"hidden":true,"variation_attribute":true,"conditional_required":true},"value_type":"list",
 "values":["17055158 artesanal","17055159 kit ou pack","17055160 sem codigo cadastrado","17055161 outro"]}
{"id":"BRAND","tags":{"catalog_required":true,"required":true}}   {"id":"MODEL","tags":{"catalog_required":true,"required":true}}
{"id":"SELLER_PACKAGE_WEIGHT","tags":{"hidden":true},"allowed_units":[{"id":"g"}]}
```

Documentacao (`/pt_br/identificadores-de-produtos` e `/pt_br/atributos`, lidas no navegador, 29/12/2025): com `conditional_required` deve-se priorizar o GTIN; sem ele, usa-se `EMPTY_GTIN_REASON`. Se a marca ja tem pelo menos 30 GTINs publicados, o atributo passa a **obrigatorio** de fato e a falta dispara o erro `item.attribute.missing_conditional_required` (causa 7810). Para saber se o item atual esta na excecao, a API tem `POST /categories/{id}/attributes/conditional` (corpo = o item inteiro): **e um POST, nao foi chamado**.

**O que muda no plano.**
- Fase 2: a ficha tecnica da fase 1 (`BRAND`, `MODEL`, `GTIN`) fica correta. Acrescentar `EMPTY_GTIN_REASON`: **kit/composicao sem GTIN -> enviar `17055159` ("kit ou pack")**; produto simples sem EAN -> `17055160`. Os ids devem ser lidos de `/categories/{id}/attributes` a cada categoria, nao fixados no codigo.
- A tela da fase 2 deve montar a lista de atributos a partir da categoria (tags `required`, `catalog_required`, `conditional_required`), e nao de uma lista fixa.
- Fase 3: para vendedor ME2 com `xd_drop_off`, os quatro `SELLER_PACKAGE_*` sao **obrigatorios** na publicacao mesmo sem `required` na resposta (documentacao, secao "Atributos de Dimensoes do Pacote"); so inteiros, so `cm` e `g`. Ver A7.
- `conditional_required` so se resolve com o POST `.../attributes/conditional` ou com o validador (A6): ambos dependem de decisao do dono (ver "Decisoes").

## A3. Comissao e tarifa fixa: `listing_prices`

**Resposta.** Funciona antes de publicar. Sem `listing_type_id` devolve todos os tipos; com ele, um objeto so. **A tarifa fixa (`fixed_fee`) depende da logistica**: o ML mudou isso em 02/03/2026 para o Brasil (documentacao `/pt_br/comissao-por-vender`, atualizada 03/09/2026), e a medicao confirma.

Regra documentada para o Brasil: abaixo do limite de frete gratis obrigatorio (TH), com ME2 so o **Flex (`self_service`)** cobra tarifa fixa; ME1, `custom` e `not_specified` sempre cobram; de TH para cima ninguem cobra. Sem `logistic_type`/`shipping_mode`, o `fixed_fee` **nao coincide com o cobrado**.

**Evidencia** (todas `GET /sites/MLB/listing_prices` com `category_id=MLB99779`, HTTP 200):

| price | listing_type_id | logistic_type / shipping_mode | percentage_fee | fixed_fee | sale_fee_amount |
|---|---|---|---|---|---|
| 50 | gold_special | (nenhum) | 13 | 0 | 6,50 |
| 50 | gold_special | xd_drop_off / me2 | 13 | 0 | 6,50 |
| 20 | gold_special | (nenhum) | 13 | 0 | 2,60 |
| 20 | gold_special | fulfillment / me2 | 13 | 0 | 2,60 |
| 20 | gold_special | **self_service / me2** | 13 | **6,65** | 9,25 |
| 20 | gold_special | **default / me1** | 13 | **6,65** | 9,25 |
| 150 | gold_pro | xd_drop_off / me2 | 18 | 0 | 27,00 |
| 50 | (todos) | (nenhum) | gold_special 13, gold_pro 18 | 0 | 6,50 / 9,00 |

Sem `listing_type_id` (price 50): `gold_pro` Premium 18%, `gold_special` Classico 13%; `gold_premium`, `gold`, `silver`, `bronze` e `free` voltam com 0% e sem valor (tipos que a categoria nao usa). `listing_fee_amount` e 0 em todos. O objeto traz tambem `listing_exposure` ("highest"), `requires_picture: true`, `free_relist: false`. Observado: `percentage_fee` 13 (Classico) e 18 (Premium) nessa categoria; a documentacao avisa que o percentual pode variar no MLB por categoria, tipo e outros criterios.

**Logistica da conta (para escolher o `logistic_type` do calculo).** `GET /users/212386247/shipping_preferences` -> HTTP 200: `logistics` = `me2` com `xd_drop_off` (**default, ativo**) e `fulfillment` (ativo, nao default); `custom` e `not_specified` tambem ativos; `modes: ["custom","not_specified","me2"]`. Portanto o padrao da conta e **ME2 / `xd_drop_off`**, para o qual **nao ha tarifa fixa** abaixo do limite (medido: price 20 e 50, fixed_fee 0). `free_configurations` indica frete gratis para o pais todo (excluindo `BR-NO` e `BR-NE` numa regra nao padrao).

**Nao confirmado:** o valor do limite TH em reais (a documentacao manda consultar as FAQs de precificacao) e se algum anuncio da conta cai em `self_service`/`me1`. O calculo com `xd_drop_off` foi feito so em precos de 20, 50 e 150.

**O que muda no plano.**
- Fase 2 (calculadora): chamar `listing_prices` **sempre com `logistic_type=xd_drop_off&shipping_mode=me2`** (padrao da conta) e `listing_type_id` explicito; mostrar `percentage_fee` + `fixed_fee`. A calculadora atual (`margem.js`, 6% de imposto, sem taxas do ML) passa a descontar `sale_fee_amount` real. Deixar o `logistic_type` configuravel por anuncio (Full = `fulfillment`, ambos sem tarifa fixa abaixo do limite).
- Nao fixar 13% e 18%: ler a cada consulta (o ML reduz tarifa por faixa e muda o valor com o tempo).
- O preco que o ML cobra depende do preco: o calculo "preco por margem" e circular (comissao % do preco). Resolver por iteracao ou algebra com `percentage_fee` lido uma vez, e reconferir o final com uma chamada.

## A4. Frete pago pelo vendedor: `shipping_options/free`

**Resposta.** Funciona e devolve o custo de envio estimado que o vendedor paga quando o frete e gratis.

**Evidencia.** `GET /users/212386247/shipping_options/free?dimensions=10x10x10,300&item_price=50&listing_type_id=gold_special&mode=me2` -> HTTP 200:

```json
{ "coverage": { "all_country": { "list_cost": 8.15, "currency_id": "BRL",
                                  "billable_weight": 300, "free_shipping_by_meli": true } } }
```

Formato do parametro `dimensions`: `AxLxC,PESO` (altura x largura x comprimento em cm, virgula, peso em gramas), como no brief. O resultado de 8,15 vale para a configuracao padrao da conta (nao foi testado outro `logistic_type`).

**O que muda no plano.**
- Fase 2: o custo do frete entra na calculadora como "frete pago pelo vendedor" (`coverage.all_country.list_cost`). Precisa das dimensoes e do peso do produto: o cadastro Rise ja tem peso, altura, largura e comprimento.
- `billable_weight` pode ser maior que o peso real (peso cubado); mostrar o valor devolvido.
- Kit/composicao: as dimensoes e o peso do kit **nao sao a soma simples** dos itens; a fase 2 precisa de campo proprio no anuncio de composicao (hoje nao existe) ou da soma como estimativa avisada. Nao confirmado como o ML trata kit grande.

## A5. Tendencias: `trends`

**Resposta.** Existe. `GET /trends/MLB/MLB99779` -> HTTP 200, lista de **40** termos, cada um `{ "keyword", "url" }` (a `url` aponta para a busca publica do ML). **Nao traz volume nem posicao**, so a ordem.

```json
[{"keyword":"raspberry pi","url":"https://lista.mercadolivre.com.br/raspberry-pi"},
 {"keyword":"arduino uno","url":"https://lista.mercadolivre.com.br/arduino-uno"}, ...]
```

Observado: os primeiros termos da categoria sao `raspberry pi` e variantes, `cardputer m5stack`, `arduino uno`, `kit arduino`, `digispark`, `arduino`.

**O que muda no plano.** Fase 2: usar as palavras em alta como entrada da IA que sugere titulo (a spec ja previa "IA + termos em alta"). Como a lista e curta e generica, tratar como sugestao editavel, nunca como palavra obrigatoria. Consultar uma vez por categoria e guardar em memoria por algumas horas.

## A6. Validador de publicacoes (apenas documentacao)

**Resposta (documentacao `/pt_br/validador-de-publicacoes`, atualizada 30/12/2025).** O endpoint e **`POST https://api.mercadolibre.com/items/validate`**, com o mesmo corpo do `POST /items`. Resposta de sucesso: **`HTTP 204 No Content`**; com erro: `400` com `message`, `error` e `cause[]` detalhando cada campo. O validador **nao cria anuncio**. A pagina avisa que nao existe sandbox: tudo que se publica de verdade fica visivel a todos.

**Nao chamado:** e um POST, e o helper `chamar` bloqueia todo POST enquanto `ML_PUBLICACAO` estiver desligada (`exigirTravaLiberada`). Mesmo caso do `POST /categories/{id}/attributes/conditional` (A2).

**O que muda no plano.** Fase 2 prevê o validador no escopo "so leitura", mas ele e um POST. **Decisao do dono** (ver lista final): ou (a) liberar uma excecao estreita e auditada para esses dois endpoints de validacao, que nao criam nada, ou (b) deixar a validacao para a fase 3 e na fase 2 conferir so localmente (titulo <= 60, atributos obrigatorios da categoria, fotos). Recomendacao: (a), com uma lista fixa de duas rotas permitidas e corpo gravado em log.

## A7. Formato das dimensoes e dos atributos de embalagem (me2)

**Resposta (documentacao `/pt_br/atributos`, secao "Atributos de Dimensoes do Pacote").**
- Para vendedor **ME2 em `cross_docking` e `xd_drop_off`** (o caso da conta), os quatro atributos `SELLER_PACKAGE_HEIGHT`, `SELLER_PACKAGE_LENGTH`, `SELLER_PACKAGE_WIDTH` (valor `"6 cm"`) e `SELLER_PACKAGE_WEIGHT` (`"214 g"`) sao **obrigatorios** na publicacao; faltando, erro `item.attribute.missing.seller.package.dimensions` (causa 5400). Somente `cm` e `g`; **decimais sao recusados** (erro de formato), entao enviar inteiros.
- Ordem: o vendedor declara largura x altura x comprimento; o ML reordena de maior para menor na vitrine; nao altera o frete.
- Vendedor **ME1** continua usando `shipping.dimensions` (campo antigo), no formato texto `AxBxC,peso` (cm e gramas), o mesmo do parametro `dimensions` de `shipping_options/free` (FAQ `/pt_br/itens-atributos-de-envio-e-dimensoes`, 14/08/2026).
- A FAQ avisa que medidas muito pequenas podem ser recusadas (`seller_package dimensions are too small / invalid`): a validacao espera as dimensoes da **embalagem real** (caixa ou envelope), nao as do produto cru. Em ME2/fulfillment algumas dimensoes ficam sob gestao da logistica e nao mudam por API.
- Exemplo de corpo:

```json
{"attributes":[{"id":"SELLER_PACKAGE_HEIGHT","value_name":"6 cm"},{"id":"SELLER_PACKAGE_LENGTH","value_name":"31 cm"},
               {"id":"SELLER_PACKAGE_WIDTH","value_name":"25 cm"},{"id":"SELLER_PACKAGE_WEIGHT","value_name":"214 g"}]}
```

Confirmado na API da categoria (A2): os quatro `SELLER_PACKAGE_*` existem em `MLB99779`.

**O que muda no plano.**
- Fase 3: a publicacao precisa dos quatro valores **em inteiros**. O cadastro Rise guarda peso em kg e medidas em cm com decimais: converter (kg x 1000 -> g; arredondar cm **para cima**) e **bloquear a etapa "Publicar"** se faltar peso ou alguma medida, com o motivo na tela.
- Aba de Frete/Embalagem da fase 2 deve avisar antes que a publicacao exige esses quatro campos.
- Kits: o mesmo (a fase 1 ja avisa que o kit pede dados proprios).

## A8. Kits no ML (informativo)

A documentacao `/pt_br/kits-virtuais` (17/09/2026) descreve **kits virtuais do ML**: 2 a 6 produtos distintos, **maximo 10 unidades de cada**, so condicao `new`, imutavel, so marketplace, e os componentes precisam ser User Products do vendedor. **Nao serve ao projeto**: o Rise vende composicoes como `920302_1.000` (mil resistores) e controla o estoque no Bling. A decisao da spec (anuncio simples no ML, produto de composicao no Bling) permanece. O kit do Rise **nao** deve usar o recurso de kits virtuais do ML.

---

# Parte B: Bling

Todas as leituras usaram `blingGet` (17 GETs no total, contando a categoria; todas HTTP 200). O produto de teste do vinculo foi o `100101` (id Bling `3191813308`), simples, ja ligado ao ML.

## B1. Vinculo produto-loja: `GET /produtos/lojas?idProduto=`

**Resposta.** Devolve `data[]` com **um registro por loja/canal** em que o produto esta ligado (o `100101` tem 6). O campo `codigo` guarda o identificador do canal (o `MLB...` no ML), `preco` e `precoPromocional` sao do vinculo (nao do produto), e `loja.id` e o canal. O canal ativo do ML, `203593931` ("ML_4h"), e o ultimo da lista.

**Evidencia.** `GET /produtos/lojas?idProduto=3191813308` -> HTTP 200 (um registro, os demais tem o mesmo formato):

```json
{ "id": 907446191, "codigo": "MLB4165084257", "preco": 49.9000015259, "precoPromocional": 35.9000015259,
  "produto": { "id": 3191813308 }, "loja": { "id": 203593931 },
  "fornecedorLoja": { "id": 0 }, "marcaLoja": { "id": 0 }, "categoriasProdutos": [ { "id": 9123030 } ] }
```

Os outros 5 vinculos do mesmo produto sao de outras lojas (ids `203163332`, `203167482`, `203163377`, `203233066`, `203478870`; tres tem codigo `MLB...`, provavelmente os outros canais ML da conta, que o CLAUDE.md diz estarem inativos, e dois tem codigo numerico; o tipo de cada loja **nao foi lido**, e inferencia). Preco 49,95 em tres deles, 39 e 49 nos outros: **o preco do vinculo diverge do preco do produto (49,00)**, cada loja tem o seu.

**O que muda no plano (fase 3).**
- Os nomes dos campos do `POST /produtos/lojas` da spec estao certos (`codigo`, `preco`, `produto.id`, `loja.id`); `precoPromocional` tambem existe e deve ser enviado igual ao `preco` quando nao houver promocao (ou omitido: **nao confirmado** qual dos dois o Bling prefere, pois nao se escreve nesta fase).
- Os precos vem com ruido de ponto flutuante (`49.9000015259`): **arredondar a 2 casas** ao ler e ao comparar.
- Antes de criar o vinculo, listar os existentes do produto e conferir que nao ha ja um para a loja `203593931` com o mesmo `codigo` (evita duplicar); vincular **somente** a `203593931` (as outras sao canais errados, ver CLAUDE.md).
- Um produto de composicao pode ter varios `MLB...` na mesma loja (Classico e Premium): confirmar se o Bling aceita dois vinculos do mesmo produto na mesma loja: **nao confirmado** (so se sabe pelo teste de escrita).

## B2. Filtro por codigo do `GET /produtos`

**Resposta.** Funcionam, e devolvem o mesmo resultado, **`codigo`** e **`codigos[]`**: filtram por **codigo exato** e trazem 0 ou 1 produto. **`pesquisa` nao serve para localizar por codigo**: `pesquisa=100101` voltou 100 produtos sem o `100101` entre eles.

**Evidencia** (HTTP 200 em todas):

| Consulta | Resultado |
|---|---|
| `/produtos?codigo=100101` | 1 produto: id `3191813308`, `100101`, formato `S` |
| `/produtos?codigos[]=100101` (enviado como `codigos%5B%5D=100101`) | o mesmo produto |
| `/produtos?pesquisa=100101` | 100 itens, nenhum com `100101` no codigo ou no nome |
| `/produtos?codigo=100101_5` | `{"data":[]}` |
| `/produtos?codigos[]=120329` | `{"data":[]}` |

**Nao confirmado:** por que a consulta de 01/10 com `codigos[]` voltou vazia; hoje o mesmo filtro funciona. Suspeita: a forma como o parametro foi montado na ocasiao (a chave `codigos[]` precisa ir codificada, o que o auxiliar faz). A resposta de uma consulta sem resultado e `HTTP 200` com `data: []`, **nao 404**.

**O que muda no plano.**
- Fase 3 (conferir se o codigo de kit existe no Bling): usar `GET /produtos?codigo={codigo}` (um GET, resposta `data: []` = livre). Usar `codigos[]` so se um dia for preciso varios codigos de uma vez (nao testado com dois valores).
- Nao usar `pesquisa` para conferir duplicidade de codigo. Nao usar `GET /produtos` sem filtro (o catalogo tem 1.834 itens; 100 por pagina).
- Cada consulta conta nos 3 req/s: a fila de `httpClient.js` ja cuida, e a conferencia do kit (1 consulta) mais a leitura dos componentes (1 por componente) cabem folgadamente.

## B3. `100101` e `100101_5` existem?

- **`100101` existe**: id `3191813308`, `formato: "S"`, `situacao: "A"`, `tipo: "P"`, `preco: 49`, `precoCusto: 24`, `estoque.saldoVirtualTotal: 20`, nome "PLACA COMPATIVEL ARDUINO UNO R3 CH340 COM CABO USB".
- **`100101_5` nao existe**: `GET /produtos?codigo=100101_5` -> 200, `data: []`.

**O que muda no plano.** O exemplo da spec (5 pecas do `100101` = `100101_5`) e um caso real em que o Rise **cria** o produto de composicao; nao ha conflito.

## B4. Formato exato dos kits reais

`GET /produtos/{id}` -> HTTP 200 para `920302_1.000` (id `13104813038`), `129912` (id `7615599153`) e `120329_z` (id `5258603617`). Campos relevantes (valores de texto longo cortados):

| Campo | `920302_1.000` (1 componente) | `129912` (misto, 4) | `120329_z` (3 componentes) |
|---|---|---|---|
| `nome` | `1.000x Resistor 1M 1/4W *920302_1.000` | `KIT ELETRONICA CNC PLACA USB+DRIVE+MOTOR 19KGF+FONTE *129912` | `Fuso trapezoidal TR8 300mm Mancal Kp08 + Acoplamento*120329` |
| `formato` | `E` | `E` | `E` |
| `tipo` / `situacao` | `P` / `A` | `P` / `A` | `P` / `A` |
| `estrutura.tipoEstoque` | `V` | `V` | `V` |
| `estrutura.lancamentoEstoque` | `""` (vazio) | `""` | `""` |
| `estrutura.componentes` | `[{produto:{id:1463148685}, quantidade:1000}]` | 4 itens: quantidades 1, 3, 3, 1 | 3 itens: quantidades 1, 2, 1 |
| `categoria.id` | `962676` ("Categoria padrao") | `962676` | `962676` |
| `unidade` | `PÇ` | `UN` | `PÇ` |
| `tributacao.ncm` | `8533.10.00` (igual ao do componente) | `8501.10.11` | `7214.99.10` |
| `tributacao.cest` / `origem` | `28.063.00` / `0` | `28.063.00` / `2` | `01.999.00` / `2` |
| `preco` | 1 | 1570 | 99,9 |
| `estoque.saldoVirtualTotal` | 1 | 0 | **-2** |
| `estoque.localizacao` | `M4` (a do componente) | `KIT` | vazia |
| pesos / `dimensoes` | 0,001 kg / 0,3 x 6 x 0,3 | 5,5 kg / 30 x 20 x 20, `volumes` 1, `itensPorCaixa` 1 | 0,2 kg (bruto 0,25) / 4 x 4 x 35 |
| `tipoProducao`, `condicao` | `T`, `1` | `T`, `1` | `T`, `1` |
| `gtin`, `marca` | vazios | vazios | vazios |
| `variacoes` | `[]` | `[]` | `[]` |
| imagens internas | 2 | 1 | 1 |

Observacoes:
- `estrutura.componentes[].produto` traz **so o `id` do Bling**, nao o codigo; para conferir "mesma composicao" e preciso comparar pares (`id`, `quantidade`) com os `blingId` dos produtos do Rise.
- O componente `920302` ("Resistor 1M 1/4W *920302", id `1463148685`) e simples (`S`), unidade `UN`, saldo **1.225**; o kit `920302_1.000` mostra `saldoVirtualTotal: 1` = **⌊1.225 ÷ 1.000⌋**. Isso confirma, no dado real, a regra da spec "estoque = menor ⌊item ÷ quantidade⌋" (o Bling calcula sozinho).
- O saldo virtual do kit pode ser **negativo** (`-2` no `120329_z`): o Rise deve tratar negativo como zero ao mostrar estoque do kit.
- `descricaoCurta` do kit e HTML e comeca por uma fileira longa de pontos (preenchimento), seguida do texto padrao da loja ("Bem vindo a loja 4Hobby...") e da descricao propria do kit. Nao e dado de cliente. Ao criar um kit, **copiar o modelo de um kit real**, nao inventar.
- `observacoes` guarda anotacao interna do dono (um link de fornecedor no `920302_1.000`, `CNC>Kits` no `129912`).
- O preco do kit e decisao do dono: o `920302_1.000` custa R$ 1 (nao 1.000 x 0,20 do componente); o Rise nao deve presumir soma.
- Os tres kits sao **virtuais** (`V`): a baixa de estoque dos componentes a cada venda do kit e feita pelo Bling. `lancamentoEstoque` vazio so ocorre nesse tipo; para kit fisico (`F`) o valor seria outro: **nao confirmado**, nao ha kit fisico nos tres lidos (a spec cita 1 de 40).
- Nao existe categoria "Kit": os kits usam a categoria padrao `962676`, a mesma do componente.

**O que muda no plano (fase 3).**
- O `POST /produtos` do kit deve copiar este molde: `tipo "P"`, `formato "E"`, `situacao "A"`, `tipoProducao "T"`, `condicao 1`, categoria `962676`, `estrutura {tipoEstoque "V", lancamentoEstoque "", componentes [{produto:{id}, quantidade}]}`, `nome = "{N}x {nome do item} *{codigo}"` (composicao de um item) ou o nome digitado terminando em ` *{codigo}` (misto), `unidade` do item principal (ou `UN`), NCM e CEST do item principal (kit misto: NCM proprio, editavel; hoje o `129912` tem NCM proprio), peso e dimensoes da embalagem do kit (nao a soma dos itens), `preco` do anuncio.
- Reaproveitar o produto existente so se os pares (`id`, `quantidade`) forem **identicos**; a spec ja exige recusar composicao diferente.
- Mostrar o kit com estoque `max(0, saldoVirtualTotal)`.
- Fotos do kit: o Bling aceita imagens proprias (1 a 2 nos kits reais); a fase 3 envia as fotos proprias do kit (conforme a spec).

## B5. O sufixo `z` (`120329_z`)

**Resposta: o significado nao foi confirmado.** O que se sabe, pela leitura:
- `120329_z` existe, e um **kit virtual** (`formato E`, `V`) de 3 componentes (quantidades 1, 2, 1; o primeiro componente, lido, e o simples `120303` "FUSO TRAPEZOIDAL TR8 300MM PASSO 8MM COM CASTANHA"; os outros dois nao foram lidos).
- O codigo **base `120329` nao existe** no Bling (`codigos[]=120329` -> `data: []`), embora o nome do kit termine em `*120329`. O sufixo `*codigo` no nome e a convencao do dono e **nem sempre igual ao codigo do produto** (aqui, o nome usa a base e o codigo tem `_z`).
- Tem saldo virtual negativo (`-2`).
- Os outros dois kits lidos usam a convencao `{codigo}_{N}` (com milhar em ponto) ou codigo proprio, sem letra.

Hipotese (nao provada): `z` marca uma versao de kit montada pelo dono (por exemplo uma variante de composicao do mesmo anuncio). **Precisa de resposta do dono.**

**O que muda no plano.** Nada na fase 3 depende do `z`: o Rise nunca gera esse sufixo (a regra e `{sku}_{N}` ou codigo digitado). Mas o campo "codigo do kit misto digitado" deve **aceitar letras** e `_` (alem de numeros), e a conferencia no Bling deve ser por **codigo exato**, sem tratar o sufixo.

## B6. O Bling aceita produtos com o mesmo nome?

**Resposta: sim, os existentes provam.** Dois produtos simples e ativos do catalogo tem exatamente o mesmo nome e codigos diferentes.

**Evidencia.** Consulta somente leitura ao banco local do Rise (as 1.314 linhas importadas do Bling): 1 nome repetido. Confirmado no Bling:
- `GET /produtos?codigos[]=170401` -> id `1437151779`, `"MÓDULO WIFI ESP8266 ESP-12F"`, `S`, `A`
- `GET /produtos?codigos[]=170103` -> id `15870345861`, `"MÓDULO WIFI ESP8266 ESP-12F"`, `S`, `A`

Portanto o Bling nao impoe nome unico. O sufixo ` *{codigo}` nos nomes (kits e tambem simples, como "Resistor 1M 1/4W *920302") e **convencao do dono**, para distinguir itens nos canais, nao exigencia do Bling. **Nao confirmado** (exigiria escrever): se o `POST /produtos` aceita um nome repetido e se recusa **codigo** repetido (o esperado, pela unicidade do codigo).

**O que muda no plano.** Fase 3: gerar o nome do kit com o sufixo ` *{codigo}` pela convencao, mas nao tratar nome repetido como erro do Bling; a duplicidade que importa e a de **codigo**, conferida por B2.

## B7. Quanto custa conferir (limites)

Este levantamento fez 17 GETs no Bling, distribuidos em poucos minutos, bem abaixo do limite de 3 req/s (a fila do projeto espacou) e sem pedido de token fora do auxiliar. Nenhum 401/403 apareceu.

---

# Como ML e Bling se encaixam (resumo para os planos)

- **Fase 2 (leitura do ML):** `domain_discovery` -> categoria; `/categories/{id}` -> limite de titulo e se e folha; `/categories/{id}/attributes` -> campos e GTIN; `listing_prices` com `logistic_type=xd_drop_off&shipping_mode=me2` -> comissao (tarifa fixa 0 nessa logistica abaixo do limite); `shipping_options/free` -> frete pago pelo vendedor; `trends` -> palavras para a IA. O validador e o `.../attributes/conditional` sao **POST** e ficam fora ate o dono decidir.
- **Fase 3 (escrita):** exige `SELLER_PACKAGE_*` inteiros em cm e g; kit sem GTIN usa `EMPTY_GTIN_REASON` = "kit ou pack"; kit no Bling copia o molde virtual (`V`) acima; vinculo `POST /produtos/lojas` so na loja `203593931`.

---

# Decisoes que dependem do dono

1. **Validador de publicacoes e `attributes/conditional` (POST sem criar anuncio).** Liberar uma excecao estreita e auditada em `chamar` do ML (so essas duas rotas, mesmo com `ML_PUBLICACAO=false`), ou deixar a validacao so para a fase 3 e conferir localmente na fase 2? Recomendacao: liberar a excecao, porque nenhuma das duas rotas cria anuncio e elas evitam descobrir o erro so ao publicar.
2. **Criar o produto de composicao no Bling** (`POST /produtos` e `POST /produtos/lojas`): continua dependendo de ligar `BLING_ESCRITA`, o que e da fase 3 e e decisao dele. Esta investigacao so leu.
3. **Logistica padrao para o calculo de custos:** o calculo da fase 2 usara `xd_drop_off` (padrao da conta, sem tarifa fixa abaixo do limite). Confirmar se algum anuncio usa Flex (`self_service`) ou envio proprio (tem tarifa fixa de ~R$ 6,65 em preco baixo).
4. **O que significa o `z`** em `120329_z` e se o campo de codigo do kit misto pode ter letras.
5. **Preco do kit:** o dono define (o `920302_1.000` custa R$ 1, nao a soma). A fase 2/3 deve calcular so uma sugestao por margem, sem impor soma.
6. **Dimensoes e peso do kit** (obrigatorias para publicar em ME2): informadas pelo dono por kit, ou estimadas pela soma com aviso? Recomendacao: campo proprio por anuncio de composicao, preenchido pelo dono.
7. **Vinculo duplo na mesma loja** (Classico e Premium do mesmo kit no canal `203593931`): so uma tentativa de escrita mostra se o Bling aceita. Decidir se o primeiro teste real de escrita fica a cargo do dono, num produto de teste.
