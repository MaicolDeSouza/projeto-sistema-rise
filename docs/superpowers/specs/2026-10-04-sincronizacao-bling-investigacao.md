# Sincronização Rise ↔ Bling — investigação da API (Tarefa 1)

Data: 04/10/2026. Autor: Tarefa 1 do plano `docs/superpowers/plans/2026-10-04-sincronizacao-bling.md`. Spec: `2026-10-04-sincronizacao-bling-design.md`, §9.

**Só leitura.** O script `scripts/investigar-bling-sync.js` usa apenas `blingGet`; não importa `blingPost` nem `blingPut`, não toca `.env` e não liga `BLING_ESCRITA`. Nada foi escrito no Bling. No total foram **382 `GET`** (378 com 200, 2 com 400 e 2 com 414; os 4 erros foram provocados de propósito, ver §4.1 e §4.2) e **1 `POST`**, que é a renovação automática do token (`/oauth/token`, 200): o token expirou durante a investigação e o `obterAccessToken` o renovou. Foi também a **primeira renovação pelo host `api.bling.com.br`**, e funcionou.

## Como ler as marcas

- **Confirmado por leitura**: visto agora, numa resposta real do Bling (`GET`), no produto `100246` (com fornecedor) e no `100114` (sem fornecedor), ou nas sondagens do catálogo.
- **Da documentação, não testado**: escrita (`PUT`, `PATCH`, `POST`). Veio da documentação oficial e **não foi enviado**.

**Sobre a documentação.** O `WebFetch` em `developer.bling.com.br/referencia` devolve só o cabeçalho e o rodapé: a página é montada por JavaScript e mostra "No API definition provided". A página carrega, porém, o arquivo da especificação OpenAPI 3.0 da própria Bling (`/build/assets/openapi-<hash>.json`, 167 caminhos, servidor de produção `https://api.bling.com.br/Api/v3`). Ele foi lido no painel de navegador, com um `fetch` da própria página, **sem baixar nada para o disco**, e é essa a "documentação oficial" citada abaixo. A especificação diz **o formato** dos corpos; **não diz** o que acontece com o campo omitido no `PUT` (§1.4).

**Privacidade.** Este relatório traz só chaves, tipos e valores de campos não pessoais. Nome, CNPJ, telefone e e-mail de contato não aparecem; onde um número ou uma comparação importa, o texto diz só "sim/não" ou uma contagem.

**Produtos de teste.** `100246` (2 vínculos de fornecedor no Rise, 1 no Bling, id do Bling `5780320878`) e `100114` (sem fornecedor em nenhum dos dois lados, id `15954834665`). Zero respostas 4xx nas duas execuções completas.

Para repetir: `node scripts/investigar-bling-sync.js --codigo=<sku> --cnpj=<14 dígitos>`, e as sondagens `--criterios=1,2,3,4,5 --contar`, `--lotes=100,200`, `--fornecedores` e `--porcodigo=100`.

---

## 1. `PUT /produtos/{id}`: formato, campos somente-leitura e o que o corpo omitido zera

### 1.1 O produto como o Bling devolve (confirmado por leitura)

`GET /produtos?codigo=100246` devolve `data[]` com **1** item, e `GET /produtos/{id}` devolve `data` (objeto). Chaves e tipos do produto simples (valor só onde é enumeração):

| Grupo | Chaves |
| --- | --- |
| raiz | `id` number, `nome` string, `codigo` string, `preco` number, `tipo` `"P"`, `situacao` `"A"`, `formato` `"S"`, `descricaoCurta` string (HTML), `dataValidade` string(10), `unidade` `"UN"`, `pesoLiquido` number, `pesoBruto` number, `volumes` number, `itensPorCaixa` number, `gtin` string, `gtinEmbalagem` string, `tipoProducao` `"P"`, `condicao` `1`, `freteGratis` boolean, `marca` string, `descricaoComplementar` string, `linkExterno` string, `observacoes` string, `descricaoEmbalagemDiscreta` string, `actionEstoque` string (vem `""`), `artigoPerigoso` boolean, `duns` array |
| `estoque` | `minimo`, `maximo`, `crossdocking` (number), `localizacao` (string), `saldoVirtualTotal` (number) |
| `dimensoes` | `largura`, `altura`, `profundidade` (number), `unidadeMedida` (`1` = cm) |
| `tributacao` | `origem` (number, `0`), `ncm`, `cest`, `spedTipoItem` (`"00"`), `percentualTributos` (number), mais `nFCI`, `codigoListaServicos`, `codigoItem`, `valorBaseStRetencao`, `valorStRetencao`, `valorICMSSubstituto`, `codigoExcecaoTipi`, `classeEnquadramentoIpi`, `valorIpiFixo`, `codigoSeloIpi`, `valorPisFixo`, `valorCofinsFixo`, `codigoANP`, `descricaoANP`, `percentualGLP`, `percentualGasNacional`, `percentualGasImportado`, `valorPartida`, `tipoArmamento`, `descricaoCompletaArmamento`, `dadosAdicionais`, `grupoProduto{id}` |
| `midia` | `video{url}`, `imagens{externas[], internas[{link, linkMiniatura, validade}], imagensURL[]}` |
| `categoria`, `linhaProduto` | `{id}` |
| `fornecedor` | `{id, contato{id, nome}, codigo, precoCusto, precoCompra}` (**aparece mesmo no produto sem fornecedor**, com `contato.nome` vazio) |
| `estrutura` | `tipoEstoque` (`""` no simples), `lancamentoEstoque` (`""`), `componentes[]` |
| `camposCustomizados` | array de `{idCampoCustomizado, idVinculo, valor, item}` (3 itens no `100246`, 0 no `100114`) |
| `variacoes` | array (vazio nos simples) |

`GET /produtos` (listagem) devolve por item só `id, nome, codigo, preco, precoCusto, estoque{saldoVirtualTotal}, tipo, situacao, formato, descricaoCurta, imagemURL`.

**A descrição (`descricaoCurta`) do Bling é HTML**: no `100246`, 1.096 caracteres com **38 tags `<p>`** (abre e fecha) e **18 quebras `\r\n`**, sem entidades (`&…;`). A função `htmlParaTexto` do importador já cobre isso (`<p>` e `<br>`). O `descricaoComplementar` vem vazio nos dois produtos; **a descrição que o Rise usa é a `descricaoCurta`**, como o importador.

### 1.2 Corpo do `PUT /produtos/{idProduto}` (da documentação, não testado)

Esquema `ProdutosDadosDTO` (o mesmo do `POST /produtos`). Respostas documentadas: `200`, `400`, `403`.

- **Obrigatórios na raiz:** `nome` (máx. 120), `tipo` (`S|P|N`), `situacao` (`A|I`), `formato` (`S|V|E`). Todo o resto é opcional.
- **Obrigatórios dentro de um grupo, quando o grupo é enviado:** `categoria.id`; `tributacao.grupoProduto.id`; `linhaProduto.id`; `midia.video` **e** `midia.imagens` (os dois, e `video.url`); `estrutura.tipoEstoque`, `lancamentoEstoque` e `componentes`; `camposCustomizados[].idCampoCustomizado`; `variacoes[].nome/tipo/situacao`.
- **Enumerações:** `condicao` `0|1|2` (não especificado, novo, usado); `dimensoes.unidadeMedida` `0|1|2` (metros, centímetros, milímetros, a mesma tabela do importador); `tipoProducao` `P|T`; `estrutura.tipoEstoque` `F|V`; `estrutura.lancamentoEstoque` `A|M|P`; `actionEstoque` `Z|T`.
- **Nomes dos campos que o plano manda enviar: todos existem e são graváveis**, exatamente como a spec §6: `nome`, `descricaoCurta`, `preco`, `marca`, `gtin`, `unidade` (texto livre, sem enumeração), `pesoLiquido`, `pesoBruto` (kg), `dimensoes.{largura,altura,profundidade,unidadeMedida}`, `midia.video.url`, `estoque.{minimo,maximo,localizacao}`, `tributacao.{origem,ncm,cest,spedTipoItem,percentualTributos}`.
- **Perigo documentado:** `actionEstoque` é "ação de estoque ao transformar produto Simples em Variação: `Z` zera os saldos de estoque, `T` transfere para a primeira variação". Nunca deve ir no corpo. (O exemplo oficial traz `"actionEstoque": ""`, e é o que o `GET` devolve, mas não há razão para enviar.)

### 1.3 Campos somente-leitura (da documentação, não testado)

Marcados `readOnly` no esquema do `PUT`/`PATCH`/`POST`:

- `imagemURL` (só aparece na listagem);
- `estoque.saldoVirtualTotal` ("saldo atual, considerando a reserva de estoque");
- **`fornecedor`** inteiro (`id`, `contato`, `codigo`, `precoCusto`, `precoCompra`): o fornecedor **não** se grava pelo produto, só por `/produtos/fornecedores` (§3);
- **`midia.imagens.internas`** (inclui `link`, `linkMiniatura`, `validade`, `ordem`, `anexo`, `anexoVinculo`) e **`midia.imagens.externas`**.

`precoCusto` da **listagem** também é somente-leitura (derivado do fornecedor padrão).

Isto bate com o que o plano assume para a Tarefa 4 ("remove os campos somente-leitura do relatório"): a lista acima é a lista.

### 1.4 O que o corpo omitido zera (não documentado, não testado)

**A especificação não diz.** A descrição do `PUT` é só "Altera um produto pelo ID", e não há texto sobre campo omitido, apagado ou preservado. Não dá para provar por leitura e **não foi testado** (escreveria). Quem decide isto é o teste real da Tarefa 12, no produto de teste. Até lá, a regra segura é a que o plano já usa (devolver o produto lido inteiro, com os campos do Rise trocados), **ou, melhor, o `PATCH` abaixo.**

### 1.5 `PATCH /produtos/{idProduto}` existe (da documentação, não testado)

A especificação traz um **quarto verbo** para o mesmo caminho: `get, put, delete` **e `patch`**. Descrição oficial: **"Altera parcialmente um produto pelo ID. Somente os campos informados terão o valor alterado."** Respostas `200|400|403`. O esquema é o `ProdutosDadosPatchDTO`: os mesmos campos do `PUT`, **sem nenhum obrigatório na raiz**.

Isto é a resposta direta à pergunta "o que o corpo omitido zera": no `PATCH`, **nada**, por definição da própria documentação. **Não está documentado** se "somente os campos informados" vale para os **subcampos** de um grupo (por exemplo, enviar só `dimensoes.altura` preserva a largura?). A forma segura, que dispensa a dúvida, é enviar **cada grupo tocado por inteiro** (o grupo como veio do `GET`, com os valores do Rise por cima) e **nenhum grupo intocado**. Ver §7.

### 1.6 `POST /produtos` (da documentação, não testado)

Mesmo esquema do `PUT`. **Resposta `201`:** `{"data": {"id": <número>, "variations": {"deleted": [], "updated": [], "saved": []}, "warnings": [<texto>]}}`, e é daí que sai o `blingId`. Mínimo para criar: `nome`, `tipo`, `situacao`, `formato`, o que o plano já prevê (`tipo "P"`, `formato "S"`, `situacao "A"`). Exemplo oficial, reduzido aos campos que a sincronização envia (valores fictícios da própria documentação):

```json
{
  "nome": "Produto 1", "codigo": "CODE_123", "preco": 1,
  "tipo": "P", "situacao": "A", "formato": "S",
  "descricaoCurta": "Descrição curta", "unidade": "UN",
  "pesoLiquido": 1, "pesoBruto": 1, "gtin": "1234567890123", "marca": "Marca",
  "estoque": { "minimo": 1, "maximo": 100, "localizacao": "14A" },
  "dimensoes": { "largura": 1, "altura": 1, "profundidade": 1, "unidadeMedida": 1 },
  "tributacao": { "origem": 0, "ncm": "", "cest": "", "spedTipoItem": "", "percentualTributos": 0 },
  "midia": { "video": { "url": "https://www.youtube.com/watch?v=1" },
             "imagens": { "imagensURL": [ { "link": "https://exemplo.com/foto.jpg" } ] } }
}
```

Erro (`400`/`403`): `{"error": {"type", "message", "description", "fields": [{"code", "msg", "element", "namespace", "collection": []}]}}`, com `type` de uma lista fechada (`VALIDATION_ERROR`, `MISSING_REQUIRED_FIELD_ERROR`, `TOO_MANY_REQUESTS`, `FORBIDDEN`, `RESOURCE_NOT_FOUND`…). **Confirmado por leitura** no mesmo formato: o `400` do §4 devolveu `type`, `message` e `description`.

---

## 2. Imagens

**Confirmado por leitura.** O produto traz as fotos em `midia.imagens.internas[]` (`link`, `linkMiniatura`, `validade`): o `link` é do **S3** (`orgbling.s3.amazonaws.com`, parâmetros `AWSAccessKeyId`, `Expires`, `Signature`), e o `Expires` fica a cerca de **7 dias** da hora da chamada, como o CLAUDE.md já dizia. `externas[]` e `imagensURL[]` vieram vazios nos dois produtos.

**Da documentação, não testado.** Imagem **só entra por link público**: o único campo gravável é `midia.imagens.imagensURL[].link` (texto, uma URL). `internas` e `externas` são somente-leitura. **A especificação inteira não tem nenhum caminho de imagem, anexo ou upload, e nenhum corpo `multipart`** (procurado por `imag|anex|arquiv|upload|midia`: nada). Isto confirma a decisão da spec §2: **a foto fica para a VPS**, porque as fotos do Rise estão em disco local e não têm URL pública.

**Cuidado para o teste da Tarefa 12:** como `midia` exige `video` **e** `imagens` juntos, enviar só o vídeo obriga a mandar um objeto `imagens`. **Não se sabe** se `imagens: {}` ou `imagensURL: []` preserva as fotos internas ou as apaga (a documentação não diz). Verificar no produto de teste, olhando as fotos no Bling depois do primeiro envio com vídeo.

---

## 3. Fornecedores do produto, `/contatos` e `/depositos`

### 3.1 `GET /produtos/fornecedores?idProduto=` (confirmado por leitura)

`data[]` de `{id, descricao, codigo, precoCusto, precoCompra, padrao (boolean), produto{id}, fornecedor{id}}`. O `100246` tem 1 vínculo (`padrao: true`); o `100114` tem `data: []`. O `id` é o **id do vínculo**; `fornecedor.id` é o id do **contato**.

**Da documentação, não testado:**

- `POST /produtos/fornecedores` cria. Corpo (exemplo oficial): `{"descricao": "…", "codigo": "COD-123", "precoCusto": 5.9, "precoCompra": 3.5, "padrao": false, "produto": {"id": 12345678}, "fornecedor": {"id": 12345678}, "garantia": 3}`. Só `produto.id` e `fornecedor.id` são obrigatórios. Resposta `201`: `{"data": {"id": <vínculo>}}`.
- **`PUT /produtos/fornecedores/{idProdutoFornecedor}`** altera o vínculo existente (mesmo corpo; só `produto.id` obrigatório). `DELETE` remove.
- Os dois custos existem: `precoCusto` e `precoCompra`. O importador lê `precoCusto ?? precoCompra`.

### 3.2 `/contatos` (confirmado por leitura e da documentação)

**Confirmado por leitura:**

- `GET /contatos/{id}`: `id, nome, codigo, situacao, numeroDocumento, telefone, celular, fantasia, tipo ("J"|"F"|"E"), indicadorIe, ie, rg, inscricaoMunicipal, orgaoEmissor, email, emailNotaFiscal, endereco{geral{…}, cobranca{…}}, orgaoPublico, vendedor{id}, dadosAdicionais{dataNascimento, sexo, naturalidade}, financeiro{limiteCredito, condicaoPagamento, categoria{id}}, pais{nome}, tiposContato[{id, descricao}], pessoasContato[]`.
- `GET /contatos` (lista): `id, nome, codigo, situacao, numeroDocumento, telefone, celular`.
- `GET /contatos/tipos`: 7 tipos (`Cliente`, `Desenvolvedor`, `Fornecedor`, `Padrao`, `Técnico`, `Transportador`, `Vendedor`), cada um `{id, descricao}`. **Os ids são da conta, não universais:** o id de "Fornecedor" tem que ser procurado por `descricao`, nunca fixado no código.
- **`GET /contatos?numeroDocumento=` filtra por documento. O Bling guarda e entende só os 14 dígitos:** o CNPJ de um fornecedor do Rise (que o Rise guarda **formatado**) foi achado com os **14 dígitos** (1 resultado) e **não** foi achado com a pontuação (0). A documentação do parâmetro diz "CPF/CNPJ, desconsiderando a pontuação", e o exemplo oficial de `POST /contatos` usa `numeroDocumento` só com dígitos.
- O critério padrão de `/contatos` é `3` (últimos incluídos). Com `criterio=1` (todos) o resultado da busca por CNPJ foi o mesmo nos 6 fornecedores do Rise (testado).

**A ligação por CNPJ não funciona com os dados reais (confirmado por leitura):**

- Dos **603 contatos do tipo Fornecedor** no Bling, **578 (96%) não têm `numeroDocumento`**; só 25 têm, e todos em 14 dígitos.
- Dos **6 fornecedores do Rise (todos com CNPJ)**, só **1** foi achado no Bling pelo CNPJ. Os outros **5 não são achados** por CNPJ (o contato pode existir, só que sem documento).
- No produto real `100246`: o fornecedor que o Bling já usa tem **`numeroDocumento` vazio**, e **um** dos 2 fornecedores do Rise para o mesmo produto tem **o mesmo nome** (comparado sem caixa e sem acento: "sim"), com CNPJ que obviamente não bate com um documento vazio; o outro fornecedor do Rise do produto não tem o mesmo nome. Ou seja, o contato certo **existe** no Bling, e a busca por CNPJ **não o acha**.

**Consequência:** o fluxo "acha por CNPJ, cria se não existir" (spec §6, Tarefa 8, passo 6) **criaria contato duplicado** para quase todo fornecedor, na primeira sincronização. Ver §7, item A1.

**Da documentação, não testado:** `POST /contatos`. Obrigatórios: `nome`, `situacao` (`A|E|I|S`), `tipo` (`J|F|E`). O vínculo com o tipo Fornecedor é `tiposContato: [{"id": <id do tipo Fornecedor>}]`. Exemplo oficial reduzido:

```json
{ "nome": "Contato", "situacao": "A", "tipo": "J", "numeroDocumento": "12345678910",
  "tiposContato": [ { "id": 12345678, "descricao": "Fornecedor" } ] }
```

Resposta `201`: `{"data": {"id": <número>}}`. Existe também `PUT /contatos/{idContato}` (para preencher o documento de um contato existente).

`GET /contatos?pesquisa=` busca "nome, CPF/CNPJ, fantasia, e-mail ou código" (da documentação). **Não foi testado** com um nome.

### 3.3 `GET /depositos` (confirmado por leitura)

`data[]` de `{id, descricao, situacao (number, 1 = ativo), padrao (boolean), desconsiderarSaldo (boolean)}`. A conta tem **2 depósitos**: **"Fisico"** (`padrao: true`, `desconsiderarSaldo: false`) e **"Virtual"** (`padrao: false`, `desconsiderarSaldo: true`). Exatamente **um** marcado como padrão. A documentação diz que o filtro `situacao` vale `1` (ativos) por padrão.

---

## 4. `/estoques` e `/estoques/saldos`

### 4.1 `GET /estoques/saldos` (confirmado por leitura)

Com `idsProdutos[]` (repetido): `data[]` de `{produto{id, codigo}, saldoFisicoTotal, saldoVirtualTotal, depositos[{id, saldoFisico, saldoVirtual}]}`.

- **Dois saldos que não são iguais.** No `100246`: `saldoFisicoTotal` **56** e `saldoVirtualTotal` **29**. A documentação define o virtual como "o saldo considerando a reserva de estoque", e o importador (`estoque.saldoVirtualTotal`) e o `Produto.estoque` usam o **virtual**. O depósito "Fisico" mostra físico 56 e virtual 29; o "Virtual" mostra físico 0 e virtual −27, e o total virtual **não soma** os depósitos com `desconsiderarSaldo`.
- **O saldo pode ser negativo.** `100114`: físico 0, virtual **−8**. Em 200 produtos lidos: 154 positivos, 42 zerados e 4 negativos. O importador corta em 0 (`Math.max(0, …)`).
- **Não há filtro escondido.** A documentação declara `filtroSaldoEstoque` com padrão `1` (só positivo), mas na prática os zerados e os negativos **voltam** sem o parâmetro (200 ids pedidos, 200 itens devolvidos).
- **`idsProdutos[]` é obrigatório na documentação, mas `codigos[]` sozinho funciona** (HTTP 200): 3 códigos → 3 itens; **100 códigos → 100 itens, e os 100 `produto.id` são iguais ao `Produto.blingId` do Rise** (100 de 100). Código que não existe é **ignorado** (2 pedidos, 1 item). Pedido cujos códigos **nenhum** resolve dá **HTTP 400 `VALIDATION_ERROR`** ("nenhum produto foi informado"), e **não** lista vazia. Código de produto **inativo** não resolve por `codigos[]` (cai nesse 400).
- `idsProdutos[]` resolve também o **inativo** (HTTP 200, 1 item) e dá `data: []` (200) para id que não existe.
- Existe `GET /estoques/saldos/{idDeposito}` (um depósito), com `idsProdutos[]` obrigatório e a mesma resposta sem o array `depositos`.

### 4.2 Limite de ids por chamada (confirmado por leitura)

**A documentação não declara limite.** Medido (todos `GET`, ids reais do catálogo):

| ids | tamanho da URL | resultado |
| --- | --- | --- |
| 1 | 46 | 200, 1 item |
| 50 | 1.513 | 200, 50 itens |
| 100 | 3.013 | 200, 100 itens |
| 101 | 3.043 | 200, 101 itens |
| 200 | 6.012 | 200, 200 itens |
| 300 | 9.012 | **414 URI Too Long** |
| 500 | 14.947 | **414 URI Too Long** |

O limite é o **tamanho da URL** (entre ~6 mil e ~9 mil caracteres, ou seja, de 200 a 299 ids de 10 a 11 dígitos), não uma contagem de ids. **Lote da Tarefa 9: 100** (3 KB de URL, folga de 2×); vale igual para `codigos[]` (100 códigos = 2.1 KB).

### 4.3 `POST /estoques` (da documentação, não testado)

Corpo (exemplo oficial): `{"produto": {"id": 12345678}, "deposito": {"id": 12345678}, "operacao": "B", "preco": 1500.75, "custo": 1500.75, "quantidade": 50.75, "observacoes": "…"}`. Obrigatórios: `produto.id`, `deposito.id`, `operacao` (`B|E|S`: **B**alanço, **E**ntrada, **S**aída; a especificação só dá as letras) e `quantidade`. `preco`, `custo` e `observacoes` são opcionais (**não se sabe** se o Bling exige o `preco` na entrada). Resposta `201`: `{"data": {"id": <lançamento>}}`. `PUT /estoques/{id}` só altera `preco`, `precoCusto` e `observacoes`, nunca a quantidade.

**Isto é exatamente o que o plano assume na Tarefa 9** (entrada `"E"`, saída `"S"`, balanço `"B"`, `quantidade`, id do depósito padrão), com a forma `{produto:{id}, deposito:{id}}`.

**Ponto semântico a verificar no teste real.** O balanço (`B`) define o saldo **do depósito** (físico, na interface do Bling); o Rise mostra o **virtual** (descontadas as reservas). Um balanço de 12 deixa o físico em 12 e o virtual em `12 − reservas`. Por isso a releitura do saldo depois do envio (que o plano já faz) é o que mostra o número real, e a Tarefa 12 deve conferir isso no produto de teste.

---

## 5. O parâmetro `criterio` da listagem de produtos

**Da documentação** (`GET /produtos`): `criterio` `1` últimos incluídos, `2` ativos, `3` inativos, `4` excluídos, `5` todos. Padrão `1`.

**Confirmado por leitura**, catálogo inteiro (100 por página):

| `criterio` | páginas | itens | `situacao` | formato |
| --- | --- | --- | --- | --- |
| `1` (omitido, `0` e `6` se comportam igual na 1ª página) | 19 | 1.834 | só `A` | S 1.320, E 501, V 13 |
| `2` ativos | 19 | 1.834 | só `A` | idem |
| `3` inativos | 3 | 245 | só `I` | S 213, E 25, V 7 |
| `4` excluídos | 34 | 3.385 | só `E` | S 2.521, E 815, V 49 |
| **`5` todos** | **55** | **5.464** | **`A` 1.834 + `I` 245 + `E` 3.385** | S 4.054, E 1.341, V 69 |

**Não existe um valor que traga só ativos e inativos.** O `5` ("todos") **traz também os 3.385 excluídos** (`situacao: "E"`). Isso importa porque **o código é reaproveitado**: no `5`, de 5.464 itens há só 3.530 códigos distintos, e **205 códigos aparecem em mais de uma situação** (180 em ativo + excluído, 24 em excluído + inativo, 1 nas três). **Nenhum código se repete entre ativo e inativo.** Montar o mapa "código → id" pelo `5` sem descartar `E` faria o código apontar, em 180 casos, para o produto excluído (num teste com 100 códigos do Rise e `criterio=5`, 25 das 100 linhas eram gêmeos excluídos e só 75 códigos ativos apareceram na página). Há também item sem código.

```js
// Valor do parametro `criterio` que devolve ativos E inativos (e tambem os excluidos).
// Usado em listarCodigosDoBling (Tarefa 9): descartar sempre situacao === "E".
export const CRITERIO_TODOS = 5;
export const SITUACAO_EXCLUIDO = "E";
```

Alternativa que dispensa o `5` (mais barata, §7 item A3): ativos + inativos em **duas passadas** (`2` e `3`: 22 páginas contra 55), ou nem ler o catálogo (§4.1).

`GET /produtos?codigo=<sku>` **funciona** (0 ou 1 produto, resposta 200 com `data: []` quando não há), mas **o parâmetro `codigo` não está na documentação**: o documentado é `codigos[]`, que também funciona e aceita vários (100 de uma vez: 100 de 100 voltaram, ids iguais aos do Rise, sem repetidos).

---

## 6. Comportamentos do cliente e da API que afetam o código

- **`blingGet` não consegue repetir uma chave.** `chamar` monta a URL com `url.searchParams.set(chave, valor)`, que guarda **um** valor por chave. `idsProdutos[]` e `codigos[]` precisam repetir a chave, então o script monta a consulta **no próprio caminho**, com `encodeURIComponent` (`idsProdutos%5B%5D=1&idsProdutos%5B%5D=2`), e funciona. As Tarefas 6 e 9 precisam fazer o mesmo, ou estender `chamar` para aceitar matriz.
- **Limite:** `429` documentado como `TOO_MANY_REQUESTS`. As 382 chamadas passaram pela fila de 3 por segundo sem nenhum 429.
- **Erro:** `{error: {type, message, description, fields[]}}`, igual para `400` e `403`. Nenhum endpoint lido deu `403` (escopo): produtos, fornecedores, contatos, tipos de contato, depósitos e saldos estão liberados para leitura. Os escopos de **escrita** não foram exercitados (só o teste real mostra).
- **Preço e saldo vêm como número de ponto flutuante** (`49.9000015259` já foi visto na investigação de 01/10): arredondar a 2 casas ao comparar.
- **Ambiente de teste da documentação** (`https://developer.bling.com.br/api/bling`, listado na especificação): não foi usado.

---

## 7. O que isto muda no plano

Ordem: primeiro o que **contraria** o que o plano assume (a Tarefa 1 manda parar e avisar o dono antes da Tarefa 2), depois os ajustes que não contrariam, e por fim o que está confirmado.

### A. Contraria o plano (decisão do dono antes da Tarefa 2)

**A1. Fornecedor ligado pelo CNPJ não encontra o contato que o Bling já tem (Tarefa 8, passo 6; spec §6; decisão do dono de 04/10).** Só 25 de 603 contatos Fornecedor do Bling têm documento, e só 1 dos 6 fornecedores do Rise é achado por CNPJ; o contato certo do `100246` existe, com o **mesmo nome** e **sem CNPJ**. O fluxo "busca por CNPJ, cria se não existir" criaria um contato duplicado (sem os telefones, e-mails e histórico do original) para quase todos. Opções, para o dono escolher:

1. Procurar por CNPJ (14 dígitos) e, se não achar, por **nome exato** (sem caixa e sem acento) entre os contatos do tipo Fornecedor; só criar se nenhum dos dois achar. Barato e sem escrever em contato existente. É a minha recomendação.
2. Idem, e quando achar por nome um contato sem documento, **preencher o CNPJ** nele (`PUT /contatos/{id}`). Escreve em contato real, então só depois do teste da Tarefa 12.
3. Manter como está e aceitar os duplicados (não recomendado).

Em qualquer opção, o CNPJ vai e é comparado **só com 14 dígitos** (o Bling não casa com pontuação), e o `tiposContato` do contato novo leva o **id de "Fornecedor" lido em `GET /contatos/tipos`**, não fixo.

**A2. Existe `PATCH /produtos/{id}`, parcial, e o plano usa `PUT` com o produto inteiro (Tarefas 4, 6 e 8).** O plano lê o produto completo, troca os campos do Rise e devolve tudo por `PUT`, e fica à mercê do que o `PUT` faz com o que não vai (§1.4: não documentado). O `PATCH` ("somente os campos informados terão o valor alterado") elimina o risco de apagar categoria, variações, composição, campos personalizados e fotos. Recomendação: **trocar `PUT` por `PATCH`**, mandando cada **grupo tocado por inteiro** (`dimensoes`, `estoque`, `tributacao`, `midia`) com o valor do Bling por baixo e o do Rise por cima, e os campos soltos da raiz (`nome`, `descricaoCurta`, `preco`, `marca`, `gtin`, `unidade`, `pesoLiquido`, `pesoBruto`) só quando mudam. Efeito no código: `blingPatch` ao lado de `blingPost`/`blingPut` (Tarefa 6), o Bling falso aceitar `PATCH` (Tarefa 6), `montarCorpoDeAtualizacao` devolver só os grupos tocados e os testes da Tarefa 8 contarem `patch` onde hoje contam `put`. Se o dono preferir manter o `PUT`, vale tudo do plano, com os cuidados de B2.

**A3. `CRITERIO_TODOS` não devolve "ativos e inativos": devolve também os excluídos (Tarefa 9, `listarCodigosDoBling`).** O valor é **`5`**, mas `listarCodigosDoBling` precisa **descartar `situacao === "E"`** (180 códigos ativos têm gêmeo excluído). Mais simples ainda e sem catálogo: a Tarefa 9 pode pedir os saldos **direto pelos códigos do Rise**, em lotes de 100, com `GET /estoques/saldos?codigos[]=…` (a resposta já traz `produto.id` e `produto.codigo`, e os ids bateram 100 de 100 com o `Produto.blingId`): 14 chamadas para os 1.314 produtos, contra 55 páginas do `5` (mais as dos saldos). Dois cuidados: pedido cujos códigos nenhum resolve devolve **400** (tratar como "nenhum", não como falha), e produto inativo no Bling só aparece por `idsProdutos[]` (usar o `Produto.blingId` para esses). Isto muda a interface `listarCodigosDoBling`: ela pode sumir.

### B. Não contraria, mas muda o código

**B1. Vínculo de fornecedor: criar ou atualizar (Tarefa 8, passo 6).** O plano diz "envia o vínculo", sem separar. `POST /produtos/fornecedores` **cria**; para o que já existe é `PUT /produtos/fornecedores/{id}`. O passo precisa listar `GET /produtos/fornecedores?idProduto=`, casar pelo `fornecedor.id` e então fazer `PUT` (existe) ou `POST` (não existe). Sem isso, a segunda sincronização duplicaria o vínculo. Dois custos: `precoCusto` (o que o Rise guarda) e `precoCompra`.

**B2. Campos que não podem ir no corpo (Tarefa 4).** Se o `PUT` ficar: remover `imagemURL`, `estoque.saldoVirtualTotal`, `fornecedor`, `midia.imagens.internas` e `midia.imagens.externas` (somente-leitura, §1.3), e **`actionEstoque`** (perigoso: `Z` zera os saldos). `midia` só pode ir com `video` **e** `imagens`. Com `PATCH`, os mesmos ficam de fora. A descrição vai como HTML: o `textoParaHtml` com `<br>` está certo, e o Bling devolve `<p>…</p>\r\n`, que a `htmlParaTexto` já normaliza.

**B3. `blingGet` e as matrizes (Tarefa 6).** Ver §6: a chave repetida (`idsProdutos[]`, `codigos[]`) precisa ir no caminho, ou `chamar` precisa aceitar matriz. O Bling falso precisa entender as duas formas, incluir o **400** de "nenhum produto resolvido" e responder `data: []` para id inexistente.

**B4. `GET /produtos?codigo=` não está documentado (Tarefa 7).** Funciona, mas o documentado é `codigos[]`. Trocar, com um código só, não custa nada e protege de o Bling um dia deixar de aceitar o parâmetro antigo.

**B5. Saldo (Tarefas 2, 5 e 9).** (1) O saldo que o Rise guarda hoje é o **virtual** (`saldoVirtualTotal`), que desconta reservas; o balanço (`B`) mexe no físico. `blingSaldo` (Tarefa 2) deve ser o **virtual**, como o importador, e ser relido depois de enviar os ajustes (já previsto). (2) **O saldo é negativo em alguns produtos** (−8 no `100114`): `blingSaldo Int?` precisa aceitar negativo, e `estoqueDoRise` não pode assumir ≥ 0 antes de aplicar os pendentes. O cartão da lista pode continuar mostrando `max(0, …)`. (3) `POST /estoques` bate com o plano (`operacao` `E|S|B`, `quantidade`, `deposito.id`); só há **um** depósito padrão na conta ("Fisico"), então o ramo `precisaDeposito` quase não dispara, mas continua correto.

### C. Confirmado, sem mudança

- Os nomes dos campos do mapeamento da spec §6 existem e são graváveis (`nome`, `descricaoCurta`, `preco`, `marca`, `gtin`, `unidade`, `pesoLiquido`/`pesoBruto`, `dimensoes.*` com `unidadeMedida` `1` = cm e `profundidade` = comprimento, `midia.video.url`, `estoque.minimo/maximo/localizacao`, `tributacao.origem/ncm/cest/spedTipoItem/percentualTributos`).
- Imagem só por link público: a decisão de deixar a foto para a VPS está certa (§2).
- `GET /depositos` e o depósito padrão (§3.3); lotes de **100** para saldos (§4.2); `POST /estoques` como o plano assume (§4.3).
- `POST /produtos` devolve `data.id`, e o mínimo para criar é `nome`, `tipo`, `situacao`, `formato` (§1.6).

### Para o teste real da Tarefa 12 (o que só a escrita responde)

1. O `PATCH` de um grupo preserva os subcampos não enviados? (A2.)
2. O envio de `midia.video` apaga ou preserva as fotos internas? (§2.)
3. O balanço (`B`) mexe no físico, e o virtual fica `balanço − reservas`? (§4.3.) E a entrada exige `preco`?
4. O contato criado com `numeroDocumento` só de dígitos é achado pela busca seguinte? (A1.)
5. O `PUT` com o corpo omitindo campos: só se o dono mantiver o `PUT` (§1.4).

## Resultados da escrita (teste real de 05/10/2026)

Feito com **um** produto de teste, `ZZ-TESTE-BLING` (id no Bling `16715406765`), com ok do dono. As duas travas
foram abertas **só no ambiente de um script temporário** (`BLING_ESCRITA=true BLING_ESCRITA_CODIGOS=ZZ-TESTE-BLING
node ...`; o `dotenv` não sobrescreve o ambiente), e o script se recusava a rodar se a lista de códigos liberados
não fosse exatamente `["ZZ-TESTE-BLING"]`. O `.env` continuou com `BLING_ESCRITA=false`. O produto de teste ficou
no Bling e no Rise; nada foi apagado no Bling.

### Respostas aos 5 itens acima

1. **O `PATCH` de um grupo preserva os subcampos não enviados: SIM.** Um `PATCH` cru
   `{"estoque":{"localizacao":"T-3"}}` mudou só `estoque.localizacao`; `minimo`, `maximo` e `crossdocking`
   continuaram. A sincronização manda o grupo inteiro, mesclado com o do Bling, o que fica redundante mas inofensivo.
2. **Vídeo: NÃO MEDIDO.** O produto de teste não tem fotos (o Bling só aceita imagem por link público), então não
   há como ver se `midia.video` apaga as fotos internas. O vídeo continua fora do envio (Emenda 2).
3. **Balanço: com reservas zero, o físico e o virtual ficaram iguais ao balanço.** Saldo 0 → entrada de 10 → saída de
   3 → 7 → balanço `B` de 5: `saldoFisicoTotal` 5 e `saldoVirtualTotal` 5. O caso com reserva (virtual =
   balanço − reservas) não foi medido. **A entrada NÃO exige `preco`:** `POST /estoques` só com `produto`,
   `deposito`, `operacao` e `quantidade` deu 201.
4. **Contato criado só com dígitos: NÃO MEDIDO.** O fornecedor do teste (Fortek, CNPJ 17.142.314/0001-21) já tinha
   contato no Bling (id `6674987146`), achado por `GET /contatos?numeroDocumento=17142314000121`; nenhum contato foi
   criado. A busca por `numeroDocumento` só com dígitos acha o contato que já tem o documento gravado em dígitos.
5. **`PUT`: não se aplica.** O envio é por `PATCH` (só os campos que mudaram), e o `PUT` não foi usado.

### Formatos observados

- **`POST /produtos`** → **201** `{data: {id, variations: null, warnings: []}}`. O corpo levou `codigo`, `tipo: "P"`,
  `formato: "S"`, `situacao: "A"`, nome, `descricaoCurta`, preço, marca, unidade, pesos, `dimensoes` (`unidadeMedida`
  1 = cm), `estoque.minimo/maximo/localizacao` e `tributacao.origem/ncm/cest`.
- **O Bling reformata o que guarda:** NCM `85011019` virou `8501.10.19`, CEST `2806300` virou `28.063.00`. A
  `descricaoCurta` voltou como foi enviada (`Linha 1 com &lt;b&gt;tag&lt;/b&gt; &amp; e-comercial<br>Linha 2 ...`,
  escape e `<br>` preservados, acentos intactos). Mesmo assim a leitura do pop-up logo depois do cadastro mostrou
  **zero diferenças**: a normalização iguala os dois formatos.
- **Categoria padrão:** o Bling pôs `categoria.id` 962676 no produto criado; o Rise não envia categoria.
- **`POST /produtos/fornecedores`** → **201** `{data: {id}}`; o vínculo voltou na listagem com `padrao: true`,
  `precoCusto` 5,5 e `precoCompra` 0.
- **`PATCH /produtos/{id}`** → **200** `{data: {id, variations: null, warnings: []}}`. Com só o preço mudado no Rise,
  o corpo foi `{"preco": 15}` e, comparado o produto inteiro antes e depois, só o preço mudou (categoria e situação
  intactas).
- **`GET /depositos`:** 2 depósitos, um padrão (id `1423545090`, o usado nos ajustes) e outro (`1432737444`).
- **`POST /estoques`** → **201** `{data: {id}}` para `E`, `S` e `B`. `GET /estoques/saldos?codigos[]=` devolve, por
  produto, `saldoFisicoTotal`, `saldoVirtualTotal` e a lista `depositos` com `saldoFisico`/`saldoVirtual` de cada um.
- **Trava por código:** com a escrita ligada e a lista só com o código de teste, sincronizar, enviar ajustes e
  cadastrar o produto real `100103` foram recusados antes de qualquer chamada (zero escritas).

### Continua sem medida

Criar contato (`POST /contatos`) e achá-lo depois; `GET /contatos?pesquisa=` com nome, acentos, critério 3, páginas e
situação E/I; `PUT /produtos/fornecedores/{id}` com as chaves extras da listagem e `padrao: false` no único vínculo;
`POST /produtos` com o código de um produto inativo; `tributacao.grupoProduto` no corpo; saída maior que o saldo
(físico negativo); o campo exato do 400 "nenhum produto foi informado" em `GET /estoques/saldos`; o vídeo.

## Composição (kit): teste real de 07/10/2026

Com OK do dono, só no produto de teste `ZZ-TESTE-KIT` (peça: `ZZ-TESTE-BLING`), travas abertas só no processo do
script (`BLING_ESCRITA_CODIGOS=ZZ-TESTE-KIT`). Detalhes em `CLAUDE.md`, seção "Produto com composição (kit)".

- **Formato da estrutura** (`GET /produtos/16593700269`, o kit 990204): `formato: "E"`, `estrutura: { tipoEstoque: "V",
  lancamentoEstoque: "", componentes: [{ produto: { id }, quantidade: 1 }] }`, quantidade numérica. Produto simples
  também devolve `estrutura`, vazia (`tipoEstoque: ""`, `componentes: []`).
- **`POST /produtos` com `formato: "E"` e `estrutura: { tipoEstoque: "V", componentes: [{ produto: { id }, quantidade: 2 }] }`**
  → **201**. O Bling guardou a estrutura como enviada e calculou `saldoVirtualTotal` pela peça (6 ÷ 2 = 3).
- **`PATCH /produtos/{id}` só com `estrutura`** (quantidade 2 → 3, mesmo `tipoEstoque`) → **200**. Mudaram só a
  `estrutura` e o saldo calculado (3 → 2); `tipoEstoque` ficou "V", nome, preço e o resto intactos.
- **Continua sem medida:** `PATCH` de `estrutura` com peça a menos ou a mais (troca a lista inteira ou mescla?), e o
  `PATCH` de `formato` num produto simples (o Rise recusa esse caso antes de enviar, de propósito).
