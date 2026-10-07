# Canais de Venda — Loja Integrada: anúncio, ícone e sincronização Rise → LI

Data: 06/10/2026 · Caminho: arquitetural (brainstorming aprovado seção a seção) · Aguarda revisão da spec escrita.
Levantamento que embasa esta spec (API, NF-e, SEO, números da loja real):
`docs/superpowers/investigacoes/2026-10-06-loja-integrada-levantamento.md`. Handoff anterior (ChatGPT):
`docs/HANDOFF_LOJA_INTEGRADA.md`.

## 1. Objetivo

O Rise passa a ser a origem do **conteúdo** dos produtos da Loja Integrada (LI), na mesma sequência que o Bling e
o Mercado Livre já seguem: ícone na lista de Produtos com estado, pop-up que lê a loja na hora e lista as
diferenças, botões "Cadastrar na LI" e "Sincronizar com a LI", editor por abas em Canais de Venda, travas de
escrita, teste com um produto e só depois a liberação por lista de códigos.

Sucesso: o dono abre um Produto Conferido, vê no ícone da LI se a loja está igual ao Rise, abre o pop-up,
confere as diferenças, clica em Sincronizar, e a página do produto na LI fica com nome, descrição em HTML, SEO,
NCM, origem, tipo de produção, GTIN, marca, categoria, peso e medidas vindos do Rise. A NF-e nativa da LI
encontra tudo o que precisa no produto.

## 2. Contexto medido (06/10/2026, só leitura)

- A LI tem **725** produtos (713 simples, 3 pais e 9 filhos de variação); **681** casam com o Rise pelo SKU
  (iguais, sem diferença de caixa); **44** existem só na LI; **634** só no Rise. Nenhum tem `id_externo`.
- **27** sem NCM na LI; **77** com NCM diferente do Rise; **13** com NCM só no Rise. SEO (`title`/`description`)
  vazio em todas as amostras. 124 categorias, 16 marcas, 394 pedidos.
- A lista `GET /v1/produto` **não traz** `imagens`, `marca`, `peso`, medidas, preço nem estoque; só o detalhe
  (`GET /v1/produto/{id}?descricao_completa=1`), 1 chamada por produto, a 100/min.
- O detalhe devolve campos **não documentados**: `icms_origin_code` (origem da NF-e), `production_type`
  (fabricação própria / revenda), `seo_title`, `seo_description`, `tags`. Se o `PUT` os grava é desconhecido.
- **O Bling tem o canal `Loja_Integrada` (id 203478870) ativo.** Ele não cria produtos na LI por conta
  (`ZZ-TESTE-BLING` existe no Bling e não na LI), mas o que ele sincroniza (estoque, preço, pedidos) continua
  valendo. **O dono confere no painel do Bling que o canal não envia cadastro nem descrição** antes do primeiro
  Sincronizar real.
- `PUT /v1/produto/{id}` **exige o produto inteiro** (não é PATCH); preço e estoque têm endpoints próprios;
  imagem só por URL pública; não há API de arquivos.
- A NF-e nativa da LI (Simples Nacional, certificado A1) **exige NCM em todo produto** e usa origem e tipo de
  produção do produto, caindo no padrão do emissor quando vazios. CEST, unidade, CFOP e % de tributos **não
  existem** na LI.

## 3. Decisões do dono (brainstorming de 06/10/2026)

1. **O Bling continua dono de estoque e preço na LI.** O Rise escreve só conteúdo; nunca `produto_estoque` nem
   `produto_preco`.
2. **Só Produto Conferido**, para tudo: o vínculo pelo SKU, o cadastro e a sincronização. Produto não Conferido tem
   ícone cinza sem selo, e o clique abre só o aviso.
3. **Fotos e documentos esperam a VPS.** A LI só os recebe por URL pública. O bloco de documentos da descrição
   fica desenhado, testado e desligado até existir endereço público (`APP_URL_PUBLICA`).
4. **Os 44 produtos só da LI ficam ignorados** por enquanto (importar é fase 2).
5. **O Rise vence no NCM** (como no Bling): o pop-up mostra "NCM: de X para Y" antes do clique; campo vazio no Rise
   nunca apaga o da LI.
6. **Abordagem híbrida** (Opção 1): editor por abas do molde do ML + ícone com selo e pop-up de diferenças do molde
   do Bling.
7. Seções A a D do desenho (banco, fluxos, descrição/SEO, segurança) aprovadas sem ajuste.

## 4. Onde mora cada parte

- **Lib** (`src/lib/canaisDeVenda/li/`, funções puras onde possível, lidas pela tela, pelas ações e pelo teste):
  `campos.js` (campos de envio, normalização dos dois lados, assinatura, diferenças), `corpo.js` (corpo do `POST`
  e a mesclagem do `PUT`), `descricao.js` (`montarDescricaoLI`), `seo.js` (padrões e limites), `slug.js`,
  `rascunho.js` (rascunho inicial a partir do Produto), `esquema.js` (zod), `validacao.js` (`ABAS_LI`,
  bloqueantes e alertas), `estado.js` (ícone; **só servidor**, usa `node:crypto`), `cliente.js` (o contrato
  `{get, post, put, exigirEscrita}` e as travas), `leitura.js` (`lerParaPopup`), `envio.js` (`sincronizarProduto`,
  `cadastrarNaLI`, `umPorVez`), `banco.js` (rascunho no Postgres) e `apresentacao.js` (**puro**, o único que o
  navegador importa).
- **Cliente HTTP** (fica do handoff): `src/lib/integracoes/lojaIntegrada/client.js`, `paginacao.js`,
  `normalizadores.js` (ganha `icms_origin_code`, `production_type`, `seo_title`, `seo_description`), `produtos.js`,
  `precosEstoque.js`, `pedidos.js`, `clientes.js`, `provider.js`; `src/lib/integracoes/lojaintegrada.js` (teste de
  conexão, `salvarCredenciais`).
- **Rotas** (`src/app/canais-de-venda/loja-integrada/`): `page.jsx` (lista, busca, 100 por página, "Novo anúncio" por
  código), `novo/page.jsx` (`?produto=<sku>`), `[id]/page.jsx`, `configuracoes/page.jsx` (frases fixas) e
  `acoes.js`. Em `src/app/produtos/acoes-li.js`: `abrirJanelaLI`, `sincronizarComLI`, `cadastrarProdutoNaLI`.
- **Componentes:** `src/components/anuncios/li/` (`EditorAnuncioLI`, uma aba por arquivo: `AbaGeral`, `AbaSEO`,
  `AbaDescricao`, `AbaFiscal`, `AbaEnvio`, `AbaPrevia`; `JanelaAnuncioLI`, `EditorNaPagina`, `TabelaAnunciosLI`,
  `FrasesFixas` reaproveitado por canal) e `src/components/produtos/IconeLojaIntegrada.jsx` e
  `JanelaLojaIntegrada.jsx` (o pop-up de diferenças, no molde de `JanelaBling.jsx`).
- **Catálogo e identidade:** `src/lib/canaisDeVenda/catalogo.js` (o cartão da LI perde `emBreve`), `src/lib/canais.js`
  (resumo da LI deixa de ser "sincronizada pelo Bling"), `src/lib/canaisDeVenda/configuracao.js` (ganha
  `lerConfigCanal(canal)` e `gravarFrasesDoCanal(canal, texto)`; o ML mantém seus nomes por cima).
- **Sai** (do handoff, divergente do padrão): `prisma/migrations/20261005_loja_integrada_sync/` (nunca aplicada;
  confirmar com `npx prisma migrate status`), os modelos `VinculoProdutoExterno`, `SincronizacaoIntegracao`,
  `EventoWebhookIntegracao` e seus 3 enums, a relação `Produto.vinculosExternos`,
  `lojaIntegrada/importarProdutos.js`, `lojaIntegrada/webhooks.js`, `src/app/api/integracoes/loja-integrada/`
  e os blocos de teste correspondentes. Webhooks e importação voltam na fase 2.

## 5. Banco

Migration `20261006_loja_integrada`, só aditiva, SQL editado à mão (o `migrate diff` propõe apagar os índices
parciais e o de trigramas; tirar essas linhas, como nas migrations anteriores). Uma sessão por vez; `npx prisma
generate` e reiniciar o servidor depois.

- `enum TipoProducao { REVENDA, FABRICACAO_PROPRIA }` e **`Produto.tipoProducao TipoProducao @default(REVENDA)`**,
  na aba Tributação do cadastro, ao lado de `origem`. É o que a NF-e da LI usa (`production_type`); a loja tem
  revenda marcada como fabricação própria (`100404`).
- **`CopiaProdutoCanal`** (`id`, `canal Canal`, `produtoId`, `criadoEm`, `conteudo Json`, `alteracoes Json?`,
  índice `[produtoId, canal, criadoEm]`): o produto da LI como estava antes de cada sobrescrita, as 3 mais recentes
  por produto e canal. `BlingCopiaProduto` continua como está.
- **`Anuncio`** não muda: o rascunho e o estado usam o que já existe. Um anúncio LI por produto (índice parcial
  `Anuncio_um_por_produto`, em SQL).
- **`ConfigCanal`** LOJA_INTEGRADA: linha com `frasesFixas`, criada no primeiro Salvar das frases.

## 6. Rascunho e mapeamento

**Rascunho** (`Anuncio` canal LOJA_INTEGRADA): colunas `produtoId`, `titulo` (nome na LI), `descricao` (texto
editável, base do HTML), `categoriaExternaId` (categoria principal), `idExterno` (id numérico do produto na LI),
`urlExterna` (a `url` que a LI devolve), `situacaoCanal` (ATIVA quando `ativo` na LI, PAUSADA quando não),
`hashConteudo` (assinatura do último envio), `sincronizadoEm`, `payloadEnviado`, `erro`. No JSON `dados`:
`{ slug, marca, categorias: [ids], destaque, videoUrl, seo: { title, description }, especificacoes: bool,
idSeo, idMarcaLI, etapa }`. Atualizar **mescla** sobre o `dados` existente.

Nasce preenchido do Produto (`rascunhoInicialLI`): `titulo = tituloBase`, `descricao = descricaoBase`,
`slug = slugDe(tituloBase)`, `marca = Produto.marca`, `videoUrl`, `seo.title` e `seo.description` pelos padrões
de `seo.js`, `especificacoes = true`, `destaque = false`, `categorias = []`. Produto que já existe na LI: ao
vincular, o rascunho **lê da LI** slug, categorias e destaque (o Rise não os tem), e mantém título, descrição, SEO
e marca do Rise (marca diferente aparece no pop-up como qualquer outro campo).

**Campos de envio** (`CAMPOS_DE_ENVIO`, na ordem da tela e da assinatura), Rise → LI:

| Campo | Rise | LI | Regra |
| --- | --- | --- | --- |
| nome | `Anuncio.titulo` | `nome` | |
| slug | `dados.slug` | `apelido` (POST) / `/alias` (PUT) | só no cadastro; depois só se o dono mudou |
| descrição | `montarDescricaoLI(...)` | `descricao_completa` | comparada como texto limpo (`htmlParaTexto` dos dois lados) |
| NCM | `Produto.ncm` | `ncm` | só dígitos dos dois lados ao comparar; formato de envio medido na investigação |
| GTIN | `Produto.ean` | `gtin` | |
| MPN | `Produto.modelo` | `mpn` | |
| peso | `pesoKg` | `peso` | 3 casas |
| altura, largura, comprimento | `alturaCm`, `larguraCm`, `comprimentoCm` | `altura`, `largura`, `profundidade` | a LI guarda **inteiro em cm**: `Math.ceil` |
| marca | `dados.marca` | `marca` (URI) | achada por nome sem caixa em `GET /v1/marca`; **criada** se faltar (`POST /v1/marca`), com aviso no pop-up |
| categorias | `dados.categorias` | `categorias` (URIs) | conjunto de ids; lista vazia no Rise **não apaga** as da LI |
| vídeo | `dados.videoUrl` | `url_video_youtube` | |
| destaque | `dados.destaque` | `destaque` | |
| origem | `Produto.origem` | `icms_origin_code` | texto "0".."8"; **se o PUT gravar** (investigação) |
| tipo de produção | `Produto.tipoProducao` | `production_type` | "Revenda" / "Fabricação própria", texto exato medido na investigação |
| SEO título, description | `dados.seo` | `PUT /v1/seo/{idSeo}` | 70 e 250 caracteres |

**Nunca entram:** `sku` depois do cadastro (só o `POST` o leva, como identificador), `ativo`, preço, estoque,
`usado`, `removido`, `bloqueado`, `tipo` (sempre `normal`), `pai`/`variacoes`/`grades`, `imagens`
(fase 2), `tags`, `id_externo`. **Campo vazio no Rise nunca apaga nada na LI** (aparece como "vazio no Rise", não
conta como divergência).

**Assinatura** (`assinaturaLI`): SHA-256 dos campos de envio normalizados, na ordem de `CAMPOS_DE_ENVIO`, gravada
em `Anuncio.hashConteudo` **só quando todas as etapas do envio deram certo**. Composta do mesmo jeito no ícone e
no envio (`normalizarDoRiseLI(produto, anuncio)`), senão o produto recém sincronizado apareceria divergente.

`Produto.urlLojaIntegrada` passa a ser preenchido pela sincronização (e pelo vínculo) com a `url` da LI; deixa de
ser manual, mas continua editável.

## 7. Ícone, pop-up e fluxos

**Ícone** (`estadoDoIconeLI`, `IconeLojaIntegrada.jsx`): mesma regra do Bling. **Cor**: cinza = nunca sincronizado
(`sincronizadoEm` nulo), verde = já. **Selo "!"**: assinatura de hoje ≠ `hashConteudo` (só depois de sincronizado).
**Não Conferido**: cinza, sem selo, texto "só Produto Conferido". O ícone sai só do banco, sem chamar a LI. Texto
acessível e `title` em `IconeLojaIntegrada.jsx`.

**Pop-up** (`JanelaLojaIntegrada.jsx`, `lerParaPopup`), ao clicar num Produto Conferido:

- **Sem anúncio LI:** monta o rascunho inicial (sem gravar) e procura o SKU na LI. Achou: **grava o vínculo**
  (cria o `Anuncio` com `idExterno`, `urlExterna`, `situacaoCanal`, e slug/categorias/destaque/marca lidos da LI) e
  lista as diferenças. Não achou: oferece **Cadastrar na LI**.
- **Com anúncio e `idExterno`:** lê o detalhe e o SEO na hora e lista campo a campo Rise × LI (iguais recolhidos,
  "vazio no Rise" à parte). Botões: **Sincronizar com a LI**, **Abrir anúncio** (editor) e **Ler de novo**.
- Com as travas fechadas os botões continuam na tela; ao clicar, o motivo da recusa em vermelho.
- Busca do SKU: `GET /v1/produto?sku=<sku>` se o filtro existir (investigação). Senão, varre a lista (8 páginas,
  ~6 s) uma vez e guarda o mapa SKU → id em memória por 10 minutos no processo.

**Sincronizar** (`sincronizarProduto`, dentro de `umPorVez`), etapas gravadas em `dados.etapa`:

1. `exigirEscrita(sku)` (as duas travas), antes de qualquer chamada.
2. `GET` detalhe + SEO; grava `CopiaProdutoCanal` com o produto inteiro.
3. Marca: procura por nome; se não existe, `POST /v1/marca` (o pop-up avisou antes "vai criar a marca X na LI").
4. `PUT /v1/produto/{id}` com **o produto da LI mesclado**: só os campos de envio trocados, o resto exatamente
   como veio (`corpo.js`; a forma de devolver `imagens` e `categorias` é medida na investigação).
5. `PUT /v1/seo/{idSeo}`.
6. Slug, só se o dono o mudou no editor: `PUT /v1/produto/{id}/alias?replace_main=true`.
7. Grava `hashConteudo`, `sincronizadoEm`, `payloadEnviado`, `urlExterna`, `urlLojaIntegrada`; revalida a lista.

Falha no meio: `hashConteudo` não avança, `erro` e `etapa` ficam gravados, o pop-up diz em que etapa parou e o
selo continua. Nada tenta de novo sozinho.

**Cadastrar na LI** (`cadastrarNaLI`): mesmas travas; procura o SKU de novo (não duplicar); `POST /v1/produto`
com `tipo: "normal"`, **`ativo: false`**, `usado: false`, e os campos de envio (slug em `apelido`); depois o SEO
pelo `seo` da resposta. Grava `idExterno`, `urlExterna`, `situacaoCanal: PAUSADA`, assinatura e data. Nasce
inativo porque preço e estoque são do Bling: ativo apareceria na loja com R$ 0. Ativar é no painel da LI.

**Editor** (`EditorAnuncioLI`, estado controlado, abas montadas e escondidas, pop-up e página como no ML):

1. **Geral:** nome (contador), slug (sempre editável; antes do cadastro vai em `apelido`, depois do cadastro mudar
   mostra o aviso do 301 e vai por `/alias`), marca, **categorias da LI**, destaque, vídeo.
   - **Categorias** (pedido do dono em 06/10/2026, que está renovando as categorias do site em outra frente): a
     lista é lida **ao vivo da LI** toda vez que o editor abre (`GET /v1/categoria`, paginado em 100; **nunca** de
     uma cópia no banco, para refletir a renovação), mostrada como **árvore** (pai > filha, pelo `categoria_pai`),
     com **caixas de marcação** (a LI aceita várias por produto) e busca por nome. As que o produto já tem na LI
     vêm marcadas; a primeira marcada é a `categoriaExternaId`. Botão "Recarregar categorias". No Sincronizar, id
     marcado que já não existe na LI vira **alerta** e sai do envio (as da LI ficam); lista vazia no Rise nunca
     apaga as da LI.
2. **SEO:** título (70) e description (250), contadores, botão "Usar padrão".
3. **Descrição:** texto editável, "Incluir Especificações", prévia do HTML, frases fixas do canal ao fim.
4. **Fiscal (só leitura):** NCM, origem, tipo de produção, GTIN do Produto, com link "Editar no produto" e avisos:
   sem NCM "a LI não emite NF-e sem NCM"; sem origem ou tipo de produção "a NF-e usará o padrão do emissor da LI";
   sem GTIN "a nota sai SEM GTIN".
5. **Envio:** peso e medidas (ordem Peso, Comprimento, Largura, Altura), com o inteiro que vai para a LI ao lado.
6. **Prévia:** problemas por aba, o corpo do `POST`/`PUT`, e o estado da sincronização.

**Validação** (`validarRascunhoLI`): Salvar nunca é barrado. **Bloqueantes** para cadastrar: Conferido, nome,
slug válido, NCM. **Bloqueantes** para sincronizar: Conferido, nome. **Alertas:** sem NCM (sincronizar mantém o da
LI), SEO acima do limite (cortado no envio), sem marca, sem categoria, sem GTIN, sem medidas.

## 8. Descrição HTML e SEO

`montarDescricaoLI({ descricao, produto, documentos, frases, urlPublica })`, função pura, sem `<h1>` (a LI põe o
nome como H1):

1. Texto do rascunho **escapado** (`<`, `>`, `&`, aspas), linha em branco separa `<p>`, quebra simples vira `<br>`
   (o mesmo `textoParaHtml` do `corpo.js` do Bling, ampliado).
2. `<h2>Especificações</h2><ul>` com marca, modelo, GTIN, peso, medidas, garantia e número de homologação, só os
   preenchidos, se `dados.especificacoes`.
3. `<h2>Documentos</h2><ul>` com `<a href="{urlPublica}{urlDe(sku, tipo, arquivo)}">{nomeOriginal}</a>` por
   `ProdutoArquivo` DOCUMENTO e CERTIFICADO. **Só entra com `urlPublica` preenchida e documentos no produto**;
   `APP_URL_PUBLICA` vazia (hoje) deixa o bloco fora.
4. Frases fixas do canal, uma por `<p>`.

**SEO** (`seo.js`): `tituloSeoPadrao(nome)` = o nome, cortado na última palavra inteira até 70;
`descriptionPadrao(descricao)` = primeiro parágrafo limpo até 250. Contadores na aba. Sugestão por IA é fase 2.

**Slug** (`slug.js`): sem acento, minúsculas, `-` no lugar do que não é letra ou número, até 100 caracteres.
Produto que já existe mantém o slug da LI; o dono muda no editor e o envio usa `/alias` com `replace_main=true`,
que deixa a URL antiga redirecionando (301).

**Comparação sem falsas diferenças** (`campos.js`): NCM só dígitos; medidas inteiras; peso em 3 casas; descrição
pelo texto limpo; marca por nome sem caixa; categorias por conjunto de ids; SEO aparado.

## 9. Segurança da escrita

- **Travas no padrão do projeto:** `LI_ESCRITA` (geral; substitui `LOJA_INTEGRADA_WRITE_ENABLED`) e
  `LI_ESCRITA_CODIGOS` (SKUs liberados, separados por vírgula, sem caixa). **Lista vazia libera todos**, com o
  mesmo aviso do Bling: conferir `config.travas.liCodigosLiberados` antes de ligar. `exigirTravaLiberada("LOJA_INTEGRADA")`
  barra `POST`, `PUT` e `DELETE`. As duas lidas uma vez na partida do processo.
- `exigirEscrita(sku)` antes da primeira chamada de escrita. `tentativas: 1` (já no cliente). Cópia em
  `CopiaProdutoCanal` antes de cada `PUT`. `umPorVez` por produto no processo.
- Auditoria pelo `LogIntegracao` (já no `httpClient`), com o Personal Token mascarado (`mascarar` já cobre `Basic`).
- Variáveis: ficam `LOJA_INTEGRADA_PERSONAL_TOKEN`, `LOJA_INTEGRADA_ENABLED`, `LI_DOMINIO`; entram `LI_ESCRITA`,
  `LI_ESCRITA_CODIGOS`, `APP_URL_PUBLICA`; sai `LOJA_INTEGRADA_WRITE_ENABLED`; `LOJA_INTEGRADA_WEBHOOK_TOKEN` sai do
  `.env.example` até a fase 2.

## 10. Testes

- `npm run teste:loja-integrada` (existente, em memória, sem rede e sem banco): continua com cliente, paginação,
  normalizadores (ganham os campos novos), produtos, preço/estoque, pedidos, clientes e teste de conexão; saem os
  blocos de importação e webhook.
- **`npm run teste:li-sync`** (novo, `scripts/teste-li-sync.js`, Postgres só com `ZZ-LI-*`, SEM rede), contra a
  **LI falsa** (`scripts/lib/lojaIntegradaFalsa.js`, no molde do `blingFalso.js`: mesmo contrato do cliente,
  **recusa escrita sem `exigirEscrita` antes**, exige o produto inteiro no `PUT` e apaga o que não vier, para o
  teste provar que a mesclagem preserva): mapeamento, normalização dos dois lados, assinatura estável e igual no
  ícone e no envio, lista de diferenças e "vazio no Rise", HTML da descrição (escape, `<p>`/`<br>`, blocos ligados e
  desligados, bloco de documentos só com `urlPublica`), limites do SEO, slug, mesclagem que preserva categorias e
  imagens, marca achada e criada, cadastro inativo, bloqueio por código e pela trava geral, só Conferido (vínculo,
  cadastro e sincronização), falha parcial não avança a assinatura, `umPorVez`, rascunho gravado e mesclado,
  frases fixas por canal.
- Lint e a bateria do ritual de fim de sessão (`extracao`, `coleta`, `cadastros`, `worker`), mais
  `teste:anuncios-ml` e `teste:bling-sync` (o `configuracao.js` e o `corpo.js` são tocados).

## 11. Investigação no produto de teste (primeira tarefa do plano)

Com o ok do dono, travas abertas **só no ambiente de um script temporário**
(`LI_ESCRITA=true LI_ESCRITA_CODIGOS=ZZ-TESTE-LI node <script>`), `.env` intocado, o script se recusa a rodar se a
lista não for exatamente `["ZZ-TESTE-LI"]`. Cria **`ZZ-TESTE-LI`** inativo na LI (fica lá até o dono apagar) e mede:

1. Se `GET /v1/produto?sku=` filtra (e `?nome=`, `?ativo=`); senão, o custo da varredura.
2. Se `PUT /v1/produto` grava `icms_origin_code`, `production_type` (texto exato aceito), `seo_title` e
   `seo_description`; se `PUT /v1/seo` é o único caminho do SEO.
3. Como devolver `imagens` e `categorias` no `PUT` (objetos do `GET` ou URIs) sem apagar nada; se omitir
   `categorias` apaga.
4. `ncm` com e sem pontos; `peso` e medidas decimais; limite do `nome`.
5. `POST /v1/produto` com `sku` repetido (recusa ou duplica).
6. `POST /v1/marca` e o formato da URI devolvida; `PUT /alias` com `replace_main=true`.
7. `descricao_completa` preserva `<h2>`, `<ul>` e `<a href>`.
8. O dono confere no painel do Bling (Integrações > Loja Integrada) o que o canal 203478870 sincroniza.

Resultados vão para o levantamento (`investigacoes/2026-10-06-loja-integrada-levantamento.md`, seção 8) e
ajustam `corpo.js` e `campos.js` antes do primeiro Sincronizar num produto real.

## 12. Fases e fora do escopo

- **Fase 1 (esta spec):** migration, lib, cliente ajustado, editor, lista, configurações, ícone, pop-up,
  Cadastrar e Sincronizar, travas, LI falsa, testes, investigação e o primeiro Sincronizar real num produto do dono,
  acompanhado. Depois, liberação por lista de códigos, poucos de cada vez.
- **Fase 2 (VPS):** fotos por `POST /v1/produto_imagem` (nome descritivo, `nomeDaFoto`), `APP_URL_PUBLICA` ligando o
  bloco de documentos, webhooks de produto e pedido (recepção do handoff volta), importar os 44 só da LI, SEO por IA.
- **Fase 3:** pedidos da LI no bloco Pedidos (`/v1/pedido/search`, situações, rastreio) e leitura da NF do pedido
  (`/v1/pedido_nf`).
- **Fora:** variações (3 pais na loja), preço e estoque (Bling), `tags`, Anymarket, Enviali, Marketing, CEST e
  unidade (a LI não tem), cupom, código HTML.

## 13. Riscos

- **`PUT` do produto inteiro:** campo omitido ou devolvido no formato errado apaga dado na loja. Mitigação: cópia
  antes, investigação no produto de teste, LI falsa que apaga o que não vier, primeiro real num produto só.
- **Dois escritores na LI (Bling e Rise):** se o canal do Bling também enviar cadastro, o conteúdo do Rise seria
  sobrescrito. Mitigação: o dono confere o canal; o teste real observa o produto por alguns dias.
- **Marca criada em duplicata** (caixa, acento): busca sem caixa e sem acento; pop-up avisa antes de criar.
- **Slug:** mudar sem 301 derruba a página do Google. Só por `/alias` com `replace_main=true`.
- **Limite de 100/min:** o pop-up faz 2 a 3 chamadas; a varredura de SKU (se não houver filtro) faz 8. O cliente já
  limita a 90/min.
- **NCM divergente em 77 produtos:** a sincronização muda a NF-e desses produtos. O pop-up mostra a troca; o dono
  decide produto a produto ao clicar.
- **Migration concorrente:** uma sessão por vez; `git merge main` antes; tirar do SQL os `DROP INDEX` propostos.
