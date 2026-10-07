# Loja Integrada: levantamento para a integração Rise → LI

Data: 06/10/2026. Só leitura (21 + 2 `GET` na API real, com o Personal Token; nada foi escrito). Base para o
brainstorming e a spec da integração. Continua o handoff do ChatGPT (`docs/HANDOFF_LOJA_INTEGRADA.md`).

Fontes: OpenAPI oficial (`https://api-docs.lojaintegrada.com.br/openapi/API-Loja-Integrada.json`, v2, 3.1.0),
artigos da central de ajuda (NF-e nativa, SEO, gerenciador de arquivos) e a loja real.

## 1. A loja hoje (medido em 06/10/2026)

| Medida | Valor |
| --- | --- |
| Produtos na LI | **725** (713 simples, 3 pais de variação, 9 filhos) |
| Ativos / inativos / removidos | 711 / 14 / 9 |
| Com NCM / sem NCM | 698 / **27** (NCM guardado **com pontos**: `8537.10.20`; 1 só com dígitos) |
| Com GTIN / com MPN | 502 / 0 |
| Com `id_externo` | **0** (nenhum vínculo externo gravado) |
| SEO `title`/`description` preenchidos | **0 em 5 amostras** (campo vazio na loja inteira, pelo visto) |
| Categorias / marcas | 124 / 16 |
| Pedidos | 394 |
| Produtos do Rise | 1.315 (só **2** Conferidos; 0 com `urlLojaIntegrada`; 0 com `Anuncio` LI) |
| **LI ∩ Rise pelo SKU** | **681** (SKU igual, sem diferença de caixa) |
| LI sem produto no Rise | **44** (`990204`, `100238`, `970107`, `120926`…) |
| Rise sem produto na LI | **634** |
| NCM diferente entre LI e Rise (mesmo SKU) | **77** (`920714`, `920715`, `100328`, `100504`…) |
| NCM vazio na LI e cheio no Rise | 13 |
| Ativo/inativo diferente | 7 |

A **lista** (`GET /v1/produto`) não traz `imagens`, `marca`, `peso`, medidas, preço nem estoque: só o
**detalhe** (`GET /v1/produto/{id}?descricao_completa=1`) os devolve. Toda comparação campo a campo exige o
detalhe, 1 chamada por produto (725 chamadas a 90/min ≈ 8 min para a loja inteira).

**O Bling continua ligado à LI:** `GET /canais-venda` do Bling devolve `Loja_Integrada` (id 203478870, tipo
`LojaIntegrada`, situação 1 = ativo) e um `LojaIntegrada` antigo (203232913, situação 2). Então hoje há um
escritor na LI (o Bling); o Rise seria o segundo. O que o canal do Bling sincroniza (estoque, preço, pedido,
cadastro) decide o que o Rise pode escrever na LI sem os dois brigarem. **Pergunta ao dono.**

## 2. Autenticação, limites e escrita

- `Authorization: Basic <Personal Token>` (o que o handoff implementou; funcionando). O outro modelo
  (`chave_api` + `aplicacao`) é de integrador e tem IP fixo; não misturar.
- **100 requisições/minuto por loja** (erro 429 código 633); 1.200/min por IP. O cliente do handoff usa 90/min.
- Escrita hoje barrada por `LOJA_INTEGRADA_WRITE_ENABLED=false` (`exigirTravaLiberada`), `tentativas: 1`.
- **`PUT /v1/produto/{id}` exige o produto INTEIRO** ("é necessário enviar todos os campos"): não é PATCH como no
  Bling. Então o envio tem de ser ler → mesclar → devolver tudo, e campo omitido pode ser apagado. A cópia de
  segurança antes de sobrescrever (como `BlingCopiaProduto`) é obrigatória aqui.
- Preço e estoque **não** passam pelo produto: `PUT /v1/produto_preco/{id}` e `PUT /v1/produto_estoque/{id}`.
- Imagem só por **URL pública** (`POST /v1/produto_imagem` com `imagem_url`); não há upload binário.
- Não há endpoint de arquivo/documento: o gerenciador de arquivos (Configurações > Gerenciador de arquivos) é
  só pelo painel, sem API.

## 3. Campos do produto: inventário completo

Legenda da coluna "Rise": de onde o valor sairia. "Relevante?" é proposta, a decidir com o dono.

### 3.1 `POST/PUT /v1/produto` (documentados)

| Campo LI | Tipo | O que é | Rise | Relevante? |
| --- | --- | --- | --- | --- |
| `sku` | texto | código; **é a chave de vínculo** (como no Bling) | `Produto.sku` | Sim (só no POST, como no Bling) |
| `nome` | texto | nome; vira **H1, `<title>` padrão e slug** | `tituloBase` ou título do anúncio | Sim |
| `apelido` | texto | slug da URL (`/clp-fx3u-24mr-...`); editável | gerado do título (sem acento) | Sim, com cuidado: mudar quebra links (ver `alias`) |
| `descricao_completa` | HTML | descrição; aceita títulos, listas, links, imagens | descrição do anúncio + frases fixas + **bloco de documentos** | Sim |
| `ncm` | texto | NCM, guardado com pontos | `Produto.ncm` | **Sim, obrigatório para a NF-e** |
| `gtin` | texto | EAN | `Produto.ean` | Sim (NF-e e Google Shopping) |
| `mpn` | texto | código do fabricante | `Produto.modelo` | Sim (SEO/Shopping), hoje 0 preenchidos |
| `peso` | kg (3 casas) | peso | `pesoKg` | Sim (frete) |
| `altura`, `largura`, `profundidade` | **inteiro, cm** | medidas; a API devolve inteiro | `alturaCm`, `larguraCm`, `comprimentoCm` (Decimal) | Sim (frete). Arredondar para cima |
| `marca` | URI `/api/v1/marca/{id}` | marca (cadastro próprio, 16 hoje) | `Produto.marca` → procurar/criar em `/v1/marca` | Sim |
| `categorias` | lista de URIs | categorias (124 hoje, com pai) | **não existe no Rise** | Decidir: escolher na tela do anúncio |
| `ativo` | bool | visível na loja | `Produto.ativo`? (no Bling o dono decidiu NÃO enviar) | Decidir |
| `destaque` | bool | aparece em "destaques" | — | Opcional, na tela |
| `usado` | bool | produto usado | sempre `false` | Não enviar |
| `tipo` | `normal` / `atributo` / `atributo_opcao` | simples / pai / filho | sempre `normal` | Só `normal` na fase 1 (3 pais na loja; variação fica fora) |
| `pai`, `variacoes`, `grades` | URIs | variação | — | Fora do escopo |
| `url_video_youtube` | texto | vídeo | `videoUrl` | Sim |
| `id_externo` | texto | id do produto no sistema de origem; permite `GET/PUT ...?id_externo=1` | `Produto.id` ou SKU | Útil, mas **se o produto tem `id_externo` a categoria também precisa** (regra da doc). Avaliar |
| `removido`, `bloqueado` | bool | lixeira / bloqueio | — | Nunca enviar |
| `imagens`, `imagem_principal` | — | só leitura no produto; escrita por `/produto_imagem` | fotos do produto | Sim, via URL pública |

### 3.2 Campos que a API devolve mas a documentação NÃO lista (medidos no detalhe do `100404`)

| Campo | Valor visto | O que é | Relevante? |
| --- | --- | --- | --- |
| **`icms_origin_code`** | `"0"` (nacional) | **Origem da mercadoria da NF-e** (0 a 8) | **Sim, NF-e.** O `100404` é um CLP FX3U (importado?) marcado como nacional: conferir |
| **`production_type`** | `"Fabricação própria"` | **Tipo de produção da NF-e** (fabricação própria / revenda; muda o CFOP 5101/5102) | **Sim, NF-e.** Um CLP revendido como "fabricação própria" é erro fiscal; conferir o padrão do emissor |
| `seo_title`, `seo_description` | `""` | o mesmo do recurso `/v1/seo` | Sim (SEO), **vazios na loja** |
| `tags` | `[]` | tags do produto | Opcional |
| `produto_id_anymarket`, `produto_id_sku_anymarket` | `null` | integração Anymarket | Não |
| `preco_cheio`, `preco_promocional`, `preco_custo`, `preco_sob_consulta` | 432.90 / null / 210 / false | preço (só leitura aqui) | Leitura para comparar |
| `estoque_gerenciado`, `estoque_quantidade`, `estoque_situacao_em_estoque`, `estoque_situacao_sem_estoque` | true / 1 / 0 / -1 | estoque (só leitura aqui) | Leitura para comparar |
| `data_criacao`, `data_modificacao`, `url`, `resource_uri`, `seo` (URI) | — | metadados | Leitura |

**Se `icms_origin_code` e `production_type` aceitam escrita no `PUT /v1/produto` é desconhecido** (não
documentado). É a primeira coisa a medir no produto de teste: sem isso a origem e o tipo de produção só se
corrigem pelo painel da LI, e a NF-e cai no padrão do emissor.

### 3.3 Preço: `PUT /v1/produto_preco/{id}`

| Campo | Rise | Relevante? |
| --- | --- | --- |
| `cheio` | `precoVenda` (preço NORMAL, regra do dono) | Depende de quem manda preço na LI (Bling?) |
| `promocional` | — | Não enviar (promoção é temporária, decisão de tela) |
| `custo` | custo do fornecedor padrão | Decidir (hoje a LI tem 210 no `100404`) |
| `sob_consulta` | — | Não |

### 3.4 Estoque: `PUT /v1/produto_estoque/{id}`

| Campo | O que é | Relevante? |
| --- | --- | --- |
| `gerenciado` | LI controla saldo | Não mexer |
| `quantidade` | saldo | **Depende do canal do Bling**: se o Bling já empurra estoque, o Rise NÃO envia |
| `situacao_em_estoque` / `situacao_sem_estoque` | prazo (dias) com/sem estoque; `-1` = indisponível | Não mexer |
| `quantidade_disponivel`, `quantidade_reservada` | leitura | Leitura |

### 3.5 Imagens: `POST /v1/produto_imagem`, `DELETE /v1/produto_imagem/{id}`

| Campo | Observação |
| --- | --- |
| `imagem_url` | **URL pública** obrigatória; a LI baixa e guarda no `cdn.awsli.com.br` (800x800, 380, 210, 64) |
| `produto` | URI do produto |
| `principal` + `posicao: 0` | a principal exige posição 0 |
| `mime` | `image/jpeg` / `image/png` |
| ALT text | **não editável**: a LI usa o nome do produto |
| Nome do arquivo | a ajuda da LI recomenda nome descritivo sem acento (`clp-fx3u-24mr-1.jpg`); vale o mesmo `nomeDaFoto` do ML |

### 3.6 SEO: `GET/PUT /v1/seo/{seo_id}` (o `seo_id` vem no produto)

| Campo | Limite | Relevante? |
| --- | --- | --- |
| `title` | 70 caracteres (`<title>`) | **Sim**, vazio hoje em toda a loja |
| `description` | 250 caracteres (meta description) | **Sim**, vazio hoje |
| keywords / robots / canonical | **não existem** na API | — |

### 3.7 URL: `PUT /v1/produto/{id}/alias?replace_main=true`

Troca o slug e **mantém a URL antiga com redirect 301** (`replace_main=true`); sem o parâmetro a antiga vira 404.
Toda mudança de slug de produto já indexado passa por aqui.

### 3.8 Categoria e marca

- `POST/PUT /v1/categoria`: `nome` (obrigatório), `descricao`, `categoria_pai` (URI), `id_externo`; tem `seo` próprio.
- `POST/PUT /v1/marca`: `nome` (obrigatório), `apelido`, `descricao`; `DELETE` existe.
- `GET /v1/categoria?limit=200` deu **400**: paginar com limite menor (100 funcionou no produto).

### 3.9 Pedidos, situações e NF (para depois)

- `GET /v1/pedido/search` (`since_atualizado`, `since_criado`, `situacao_id`, `cliente_id`), `GET /v1/pedido/{id}`
  (cliente com CPF/CNPJ, endereço de entrega com IE, itens com SKU, envios, pagamentos).
- 16 situações (`pedido_pago`, `faturado`, `pedido_em_separacao`, `pedido_enviado`…); `PUT /v1/situacao/pedido/{id}`
  muda a situação; `PUT /v1/pedido_envio/{id}` grava o rastreio.
- `POST/PUT /v1/integration/pedido/nf` **insere uma NF emitida fora** (chave, número, série, URLs); **não emite**.
  `GET /v1/pedido_nf/{id}` lê a NF do pedido.
- Webhooks: `PUT /webhooks/v1/produto` e `/pedido` com `{notifyUrl, token}`; exigem URL pública (VPS).

## 4. NF-e nativa da LI: o que o produto precisa ter

Artigo "Como emitir nota fiscal diretamente pela Loja Integrada" (02/04/2026): emissor nativo, **só Simples
Nacional**, certificado A1, CNPJ + IE. Ao emitir, o pedido vai para "Faturado".

- **NCM obrigatório em todo produto** (sem ele a emissão falha). **27 produtos da LI estão sem NCM** e **77 têm NCM
  diferente do Rise**: antes de qualquer sincronização, decidir qual lado está certo.
- **Origem da mercadoria** (`icms_origin_code`) e **tipo de produção** (`production_type`): por produto; se vazios,
  cai no **padrão do emissor** (fabricação própria ou revenda). Para uma revenda de eletrônicos o padrão certo é
  "Revenda"; o `100404` está "Fabricação própria".
- **GTIN** vai para a NF (cEAN); vazio é aceito ("SEM GTIN"), errado é rejeitado pela SEFAZ.
- **CEST, unidade comercial, CFOP e % de tributos NÃO existem na API** da LI. Unidade a LI assume "UN"; CFOP vem
  do tipo de produção + UF. O `cest`, `spedTipoItem` e `percentualTributos` do Rise não têm para onde ir.
- Variação: NCM do pai vale para os filhos.

## 5. SEO na LI: o que dá para controlar pela API

| Alavanca | Onde | Observação |
| --- | --- | --- |
| H1 e `<title>` padrão | `nome` | estrutura sugerida pela LI: Nome + Modelo + Potência/Capacidade + Tipo + Marca |
| `<title>` próprio (70) e meta description (250) | `/v1/seo/{id}` | hoje vazios em toda a loja: ganho imediato |
| URL amigável | `apelido` + `/alias` com 301 | nunca mudar sem o 301 |
| Conteúdo | `descricao_completa` (HTML) | títulos `<h2>`, listas, ficha técnica, links internos, **links para os documentos** |
| Imagens | nome do arquivo descritivo; ALT = nome do produto (fixo) | |
| Dados estruturados | GTIN, MPN, marca, categoria | ajudam Google Shopping / Merchant |
| Vídeo | `url_video_youtube` | |
| Fora do alcance | keywords, robots, canonical, sitemap | a LI gera sozinha |

## 6. Documentos (PDF/ZIP) na descrição

A descrição é HTML, então `<a href="...">Baixar manual (PDF)</a>` funciona. O problema é o **endereço público**:
os documentos moram em `dados/produtos/<SKU>/documentos/` na máquina do dono, sem rota pública (a mesma pendência
da foto principal do Bling, e agora também das fotos da LI, que só entram por `imagem_url`).

Caminhos possíveis (decidir no brainstorming):

1. **Armazenamento público próprio** (Cloudflare R2, S3, Backblaze B2): o Rise sobe foto e documento ao sincronizar,
   guarda a URL pública em `ProdutoArquivo`, e a mesma URL serve Bling (foto principal), LI (fotos e documentos) e
   ML (não precisa, upload binário). Resolve as três pendências de uma vez, antes da VPS.
2. **Gerenciador de arquivos da LI**: upload manual pelo painel, sem API; o dono cola a URL no Rise. Zero
   infraestrutura, trabalho manual por documento.
3. **Esperar a VPS**: a rota `/api/arquivos` passa a ser pública. Nada antes disso.

## 7. O que o handoff do ChatGPT deixou e o que diverge do padrão do projeto

Fica (bom e testado, 35 verificações passando em 06/10/2026): `lojaIntegrada/client.js` (Basic, 90/min, trava,
`tentativas: 1`), `paginacao.js`, `normalizadores.js`, `produtos.js`, `precosEstoque.js`, `pedidos.js`,
`clientes.js`, `lojaintegrada.js` (teste de conexão), a mudança do `CartaoConector` e do `mascarar`.

Diverge do padrão do Rise (a decidir na spec):

- **`VinculoProdutoExterno` + `SincronizacaoIntegracao` + `EventoWebhookIntegracao`** (migration criada, **não
  aplicada**): o projeto já representa "existe no canal" com `Anuncio` (`canal`, `idExterno`, `urlExterna`,
  `situacaoCanal`), lido por `separarCanais` e pelos ícones. Uma segunda tabela de vínculo para o mesmo fato
  faz as telas discordarem. Proposta: usar `Anuncio` LOJA_INTEGRADA (um por produto, índice parcial já existe) com
  as colunas de sincronização no molde do Bling (`sincronizadoEm`, `assinatura`, cópia antes de sobrescrever).
- **Importação LI → Rise cria `Produto`** (`importarProdutos.js`): o dono quer Rise → LI. Dos 725, 681 já existem
  no Rise; os 44 restantes são o caso de importar, se o dono quiser.
- **Webhooks**: recebimento pronto, sem consumidor e sem URL pública. Fica para a VPS, como o do Bling.
- `normalizadores.js` ignora `icms_origin_code`, `production_type`, `seo_title`, `seo_description` e `tags`.

## 8. O que ainda não foi medido (fica para o produto de teste)

- Se `PUT /v1/produto` aceita `icms_origin_code`, `production_type`, `seo_title`, `seo_description`.
- Se `PUT /v1/produto` sem `categorias`/`marca` apaga os existentes (a doc diz "enviar todos os campos").
- Se `POST /v1/produto` com `sku` repetido recusa (409?) ou duplica.
- Formato aceito no `ncm` (com ou sem pontos) e nas medidas (inteiro ou decimal).
- `POST /v1/produto_imagem` com URL do R2/S3 e nome descritivo; se o nome do arquivo sobrevive no CDN.
- Se `descricao_completa` preserva `<a href>` para PDF/ZIP e `<h2>` (a loja tem `<p>`, `<strong>`, `<span style>`).
