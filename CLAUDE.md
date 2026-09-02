@AGENTS.md

# Sistema Rise

Painel de controle das operações de uma loja de eletrônicos (4hobby) que vende no
**Mercado Livre** e na **Loja Integrada**, com o **Bling** como ERP. Roda na máquina do
dono; a migração para VPS está prevista.

Organizado em **blocos** no menu lateral, cada um desenvolvido de forma independente.

## Convenções

- **JavaScript**, sem TypeScript. O client do Prisma é gerado em `.ts` (o gerador da v7 não
  emite JS) e fica em `src/generated/`, fora do git — nada escrito à mão é TypeScript.
- **Interface e código em português**, sem acentos nos identificadores e comentários.
- **Comentários explicam o porquê**, não o quê. Se um trecho parece estranho, o comentário
  diz que problema ele evita.
- Fonte única para listas que a tela usa: `src/lib/blocos.js`, `src/lib/canais.js`,
  `src/lib/unidades.js`, `src/lib/limites.js`, `src/lib/fiscal.js`,
  `src/lib/integracoes/registro.js`.

## Estado

| Bloco | Situação |
| --- | --- |
| Produtos | Cadastro completo — é a base de que todo anúncio deriva |
| Integrações | Bling e ML conectados e testados; Loja Integrada via Bling |
| Painel | Indicadores lendo do banco |
| Anúncios | Interface e validação por canal, **sem publicar** |
| Mercados | Teste de fonte em 6 sites, importação de arquivo (HTML/PDF/XLSX) e coleta em lote gravando **em JSON**; banco parado de propósito |
| Pedidos, Estoque, Financeiro, Relatórios | Esqueleto |

**A publicação nunca foi ligada.** `ML_PUBLICACAO` e `BLING_ESCRITA` estão em `false`, e
`exigirTravaLiberada` em `src/lib/integracoes/config.js` barra todo `POST`/`PUT` antes da
requisição sair. A conta tem **1007 anúncios e estoque reais** — não ligue sem pedir.

## Rodar

```bash
npm run db:up && npm run dev      # https://localhost:3000
npm run diagnostico               # testa as integrações pela linha de comando
npm run teste:extracao            # 137 asserções da extração e da conciliação, SEM rede
npm run teste:fonte -- <url>      # avalia um concorrente pela linha de comando
npm run teste:fonte -- --tipo=FORNECEDOR <url>   # preco deixa de ser exigido
COLETA_TIMEOUT_MS=90000 npm run teste:fonte -- <url>   # site lento
npm run coletar -- --limite=20 <url>   # colhe e grava em dados/coleta/<dominio>/
npm run worker                    # executa o que o botao "Atualizar tabelas" enfileira
```

HTTPS é obrigatório (o OAuth do ML exige). Certificado em `certificates/`, gerado com
mkcert, fora do git.

---

## Conhecimento que custou caro

### Bling

- Credenciais no header **`Authorization: Basic`**, não no corpo.
- Autorização em `https://www.bling.com.br/b/Api/v3/oauth/authorize` — **com `/b/`**.
  Token em `https://www.bling.com.br/Api/v3/oauth/token` — **sem `/b/`**.
  API em `https://www.bling.com.br/Api/v3` (não `api.bling.com.br`).
- O `code` vale **1 minuto**. O refresh token dura 30 dias e **rotaciona**.
- **20 pedidos de token em 60s bloqueiam o IP por 60 minutos.** Nunca pedir token se o
  guardado ainda vale.
- **3 requisições por segundo**, da conta inteira. Toda chamada passa pela fila de
  `src/lib/integracoes/httpClient.js`.
- `GET /canais-venda` (**`/lojas` dá 404**), `GET /produtos/lojas` (o campo `codigo` guarda
  o `MLB...`), `GET /produtos?codigo=<sku>`, `GET /depositos`.
  **`GET /integracoes` dá 403** com os escopos atuais.
- O canal do ML é o **`203593931` ("ML_4h")**. Há 8 canais desse tipo e só um ativo —
  gravar no canal errado quebra a sincronia de estoque **sem dar erro**.

### Mercado Livre

- Credenciais **no corpo**, não em header Basic. Sem PKCE.
- **Recusa `localhost`** como redirect. Usamos `sistema-rise.localtest.me` (domínio público
  que resolve para 127.0.0.1). **Mas a interface não funciona nesse domínio** — o navegador
  bloqueia os scripts por DNS rebinding. Daí: interface em `localhost`, OAuth do ML em
  `localtest.me`. O fluxo **começa e termina** no mesmo domínio, senão o cookie de `state`
  se perde.
- Access token dura 6h; o refresh exige o escopo **`offline_access`**.
- Conta **`4HOBBY_STORE`**, seller `212386247`, no modelo **User Products** →
  **`family_name` é obrigatório** ao publicar.
- **Preço saiu do `POST`/`PUT /items`** (março/2026): vai em
  `POST /items/{id}/prices/standard`.
- **Título não muda depois que o anúncio tem vendas.** Encerrar é irreversível.
- Publicar **pausado**, ajustar, e só então ativar — falha no meio não deixa anúncio
  incompleto no ar.
- Imagens por **upload binário** (`POST /pictures/items/upload`), 500×500 a 1920×1920.
- `GET /sites/MLB/search` dá **403** (busca pública fechada).

### Loja Integrada

- A API exige **Chave de Aplicação**, emitida só a provedores de solução, e a solicitação
  para lojistas **está suspensa**. Confirmado: com app key inválida vem
  `401 "Chave de Aplicação não encontrada"` — o que valida o formato do header.
- Até reabrirem, **o canal é atendido pelo Bling**, que tem chave própria.
- As URLs de produto são baseadas no **nome** e editáveis — não dá para deduzi-las do id.
  Por isso `Produto.urlLojaIntegrada` é preenchido à mão.

### Mercados (coleta de concorrentes e fornecedores)

Bloco que lê sites de terceiros. **Não tem vínculo com o catálogo próprio** — nada aqui
lê ou escreve `Produto`, por decisão explícita do dono.

**Duas etapas que não se misturam** — combinado com o dono em 28/08/2026, depois de uma
tentativa de coletar os 20 produtos direto do teste:

1. **"Testar fonte" só valida, não coleta.** É o campo que responde "dá para ler este
   site?". Amostra pequena (3 produtos, teto de 25 páginas), **nada é gravado — nem em
   JSON nem no banco**. Verificar HTTP 200 não responderia nada — toda loja devolve 200 na
   home; o que decide é conseguir normalizar produto com nome, endereço e preço.
2. **A coleta de verdade só começa depois que a fonte é salva.** São os ~20 produtos por
   concorrente ou fornecedor. Nunca disparar coleta a partir da tela de teste: são
   momentos diferentes do fluxo, e juntá-los já foi erro cometido uma vez.

**Enquanto os testes não terminam, grava em JSON.** Destino
`dados/coleta/<domínio>/produtos.json`, limite de **20 produtos por fonte**. O banco fica
**parado de propósito**: o schema (`FonteColeta`, `PaginaColetada`, `PrecoHistorico`,
`Job`) e o worker já existem no código, mas *o que* se guarda ainda não foi decidido, e
gravar antes disso enche a tabela com o formato errado. Ligar o banco é passo separado,
depois dos testes, com o dono presente.

**O botão "Atualizar tabelas" grava em JSON** — reconciliado em 01/09/2026. Ele
**enfileira**, não executa: varrer seis lojas passa de dez minutos, o que não cabe numa
requisição HTTP e morreria no primeiro hot reload. Quem executa é o `scripts/worker.js`
(`npm run worker`), chamando `varrerFonteParaJson` → `colherProdutos` → `salvarColeta`.
São **20 produtos por fonte** (`PRODUTOS_POR_FONTE`).

- **O mesmo `colher.js` do "Testar fonte".** Era aqui que as duas trilhas divergiam: a tela
  mostrava o que o normalizador completo extraía e a varredura gravava o que um extrator
  antigo entendia. Agora o que o operador aprova no cadastro é o que fica guardado.
- **`varrerFonte` (Postgres) continua de pé e parado**, com teste próprio
  (`npm run teste:coleta`). Nada em produção o chama — ele volta quando o banco entrar.
- **A fonte nasce pausada**, com `proximaVarreduraEm` a 100 anos: salvar um cadastro não
  pode disparar varredura sozinho. O ciclo automático de 24 h está desligado de propósito
  e o botão é o único gatilho — ele filtra por `ativa`, não por essa data. Fonte pausada dá
  recado dizendo para usar "Retomar".
- **A tela `/mercados` lê do JSON**, por `produtosColetados()` em `arquivo.js`; só o
  cadastro das fontes continua no banco, que é onde ele sempre esteve. Quando o banco
  entrar, mudam `produtosColetados()` e `detalhePagina()` — a tela não.
- **O JSON não tem chave primária**, e a tela precisa de uma para abrir o detalhe. O id é
  `dominio|codigo|url`, composto do que identifica o produto e **não da posição na lista**:
  com o índice, uma varredura entre a listagem e o clique abriria o produto errado.
- **Sem histórico de preço.** O arquivo guarda a última coleta e sobrescreve a anterior,
  então `precoAnterior` é sempre `null` e a seta de variação não aparece. Série é assunto
  do banco — mostrar movimento sem base seria inventá-lo.
- **O teto da tabela subiu de 100 para 300.** A data é da **coleta inteira**, não de cada
  produto, então a ordenação agrupa por fonte e um teto apertado corta a fonte mais antiga
  **por completo**: com 100, a Casa da Robótica sumia da tela inteira tendo 20 produtos
  coletados. **O teto agora é atingido de verdade** — com os 1.911 da Fortek em disco, a
  tela tem 2.031 produtos e mostra 300. A busca filtra o acervo inteiro (o servidor filtra
  antes de cortar), então achar produto continua funcionando; quem some é o resto da
  rolagem. Paginar é o passo pendente, e o rodapé diz o que ficou de fora em vez de deixar
  a lista parecer completa.
- A **ficha técnica** no painel é lista ordenada, igual à prévia — linha sem rótulo aparece
  com marcador, nunca com nome inventado. O campo `atributos` (objeto) era do caminho do
  banco.
- O bloco vive na branch **`bloco-mercados`**, ainda não fundida na principal.

**As telas, e o vocabulário do dono** — ajustado ao longo de 01/09/2026:

- **"Sites" virou "Fontes"**, "Atualizar tabelas" virou **"Atualizar dados"**, "Coletados"
  virou **"Produtos atualizados"** e "Ficha Técnica" virou **"Características"**, para
  casar com a aba Produtos. Nome de tela é vocabulário de quem opera, não do código.
- **Fontes é dividida por abas** (Fornecedores / Concorrentes), por `?tipo=` na URL. Uma
  primeira versão pôs os dois lado a lado como cartões de resumo e o dono recusou: ele quer
  **a lista inteira de um tipo por vez**, não um resumo dos dois. Com a aba respondendo o
  tipo, a coluna "Fornecedor/Concorrente" saiu — repetir o rótulo em toda linha de uma aba
  que já se chama Fornecedores só gasta largura.
- **A coluna da lista só aparece na aba de fornecedor.** Concorrente tem vitrine; cinco
  linhas de travessão não são informação. Quem muda de colunas muda o `colSpan` das linhas
  de apoio junto (`COLUNAS_BASE`), senão as linhas de erro e edição desalinham.
- **"Última varredura" traz a duração entre parênteses.** É o que explica por que uma fonte
  demora quatro vezes mais que outra pelo mesmo trabalho — o Eletrogate e o Impacto CNC
  pedem 10s entre visitas, e sem o número a lentidão parece defeito nosso. Coleta antiga
  não tem o campo e **não ganha um inventado**: `null`, e a tela não mostra nada.
- **O botão pergunta o estado ao ABRIR a tela, não só depois do clique.** `situacao`
  nascia `null`, então quem chegasse no meio de uma varredura via o botão ocioso, clicava,
  e levava *"Já há uma varredura em andamento"* **em vermelho** — concluindo que a
  atualização falhou, quando ela estava correndo. Recusa não é erro: ela agora vira
  estado (botão desabilitado, fonte da vez e percentual), e o vermelho fica para falha de
  verdade.
- **Job `PROCESSANDO` é prova de que há worker vivo.** O aviso "nenhum worker pegou o
  trabalho" olhava só a idade do pendente, e o worker atende **um por vez**: com sete
  fontes na fila, o último espera os seis anteriores e fica velho por definição. A tela
  mandava rodar `npm run worker` com o worker varrendo na frente — e obedecer subiria um
  segundo processo disputando a mesma fila. O alarme só vale quando ninguém está
  processando.
- **A fila aparece ao lado do andamento** ("e mais 4 fontes na fila"). Só a fonte da vez
  faz a varredura parecer quase pronta com cinco lojas pela frente, e há loja que pede 10s
  entre visitas — o Eletrogate leva 4min sozinho contra 49s da Smartkits.
- **A data vem do arquivo, não do banco.** `ultimaVarreduraEm` só é escrito pelo worker;
  reprocessar a lista pela linha de comando não mexe nele, e a Fortek aparecia como
  "nunca" com 1.911 produtos em disco.
- **O ⓘ guarda instruções de download/upload por fonte** (`FonteColeta.instrucoes`), porque
  cada portal tem um caminho diferente e isso vive hoje na cabeça do dono. **Senha não vai
  aí** — o campo é texto puro, aparece na tela e vai para o dump; credencial pertence à
  `Conexao`, cifrada. A tela diz isso por escrito.
- **O detalhe do produto de fornecedor espelha a prévia do teste de fonte:** duas caixas,
  *Pronta entrega* e *Reserva*, cada uma com preço, preço com impostos e a **quantidade
  dela**. Repor o que vendeu e planejar importação não se comparam pelo mesmo número, e na
  Fortek a reserva chega a custar mais caro (`65-276`: 79,90 contra 82,90). O operador
  aprova a fonte olhando aquelas caixas e depois consulta o produto aqui — dois desenhos
  para o mesmo dado obrigariam a reaprender a ler. Fornecedor que não diferencia o preço da
  reserva mostra o da pronta entrega com a nota *(mesmo da pronta entrega)*, e a caixa de
  reserva **some** quando o arquivo não trouxe o dado: vazia, ela diria que não há nada a
  chegar, quando a verdade é que a lista não informou.

**Um caminho só.** `colher.js` é usado pelo teste e pela coleta em lote, mudando só o
limite. Houve um período com duas trilhas — o teste usava o normalizador completo e a
gravação um extrator antigo — e o que a tela mostrava não era o que se guardava.

**Três formatos combinados, nunca escolhidos.** JSON-LD, **Microdata** (`itemprop`) e
OpenGraph. A Usinainfo publica preço em OpenGraph e código/marca em Microdata, sem
JSON-LD nenhum; o impactocnc só tem Microdata. Escolher um formato devolve metade.

- **Recorte no bloco do produto.** A página traz `schema.org/Product` dos **relacionados**
  ("quem viu isso viu também"). Sem recortar, 4 das 5 imagens eram de outros produtos.
  Corte no primeiro `isRelatedTo` ou segundo `itemtype=Product`.
- **Preço normal ≠ preço marcado.** Loja brasileira anuncia "R$ 49,90 / R$ 47,40 no pix".
  O `itemprop="price"` costuma ser o do **pix**. O de tabela vem em
  `productPriceWithoutReduction` (PrestaShop) ou `data-sell-price`. Atributo `data-price`
  **só conta se for MAIOR que o preço marcado** — noutra loja havia `data-price="0"`,
  `"2.09"` e `"4.85"`, que eram **opções de frete**.
- **`og:description` é resumo de SEO** (~155 caracteres). Vence a descrição **mais longa**
  entre as fontes, não a de um formato preferido: 138 contra 2946 na mesma página.
**Documentos: o datasheet do concorrente** — `documentos: [{titulo, url}]`, campo próprio e
clicável na prévia, nunca endereço colado dentro da descrição. É o que permite conferir se
o produto do concorrente é o **mesmo** que o nosso: dois módulos com nome diferente e o
mesmo CI são o mesmo item.

- **O que identifica documento é o TEXTO DO LINK**, mais extensão de arquivo (`.pdf`,
  `.zip`, `.stl`…) e endpoint de anexo (`controller=attachment`, do PrestaShop).
- **"Sai da loja" NÃO serve, e chegou a ser usado.** Parecia bom porque foi medido só no
  bloco da descrição de uma loja. Varrendo a página inteira, esse critério devolve **30**
  candidatos na Smartkits — WhatsApp vinte vezes, Instagram, TikTok, o selo da Loja
  Protegida — e **6** na Usinainfo, todos redes sociais. Com texto + extensão + anexo, as
  duas devolvem **um**: o datasheet.
- **Os dois casos reais não se parecem, e nenhum critério sozinho pega os dois.** A
  Smartkits hospeda no **Google Drive** — fora do domínio e sem extensão. A Usinainfo serve
  pelo **anexo do PrestaShop** (`index.php?controller=attachment&id_attachment=101`) — no
  próprio domínio e também sem extensão; responde `200` com
  `Content-Disposition: filename="Datasheet DS18B20.pdf"`. O `get-file` é que está no
  `Disallow` do robots; `attachment`, não — e de todo modo o endereço só é **guardado**,
  nunca baixado.
- **Varre a página inteira**, porque o link não mora num lugar só: na Tray fica dentro da
  descrição, na Usinainfo numa aba própria (`li.download_produto`), fora dela.
- Vocabulário de **documento**, não de página: "blog", "tutorial" e "projeto" ficam de fora
  de propósito — a Usinainfo linka o próprio blog no meio da descrição.
- **Especificações**: seção declarada pelo site, lida como **lista ordenada** de
  `{nome, valor}` — `nome: null` na linha sem rótulo, porque objeto JSON não comporta isso
  sem inventar chave. Encerra no título seguinte, num parágrafo, ou numa **linha em branco
  seguida de algo que não é par**.
- **O título da seção nem sempre tem dois-pontos.** A Smartkits escreve só
  `Especificações` no JSN-SR04T, em caixa normal, e a ficha inteira — dez itens — era
  descartada por causa de um caractere. A folga vale só para o título que o vocabulário já
  reconhece, curto e de até três palavras: aceita-se a linha que **só anuncia** a seção,
  nunca a frase que menciona a palavra.
- **O marcador de lista vale mais que a heurística de tamanho.** Onde o site escreveu `-`,
  ele está dizendo "isto ainda é ficha": o teto de palavras do rótulo sobe, e a regra de
  parágrafo não se aplica. `- Diferença mínima entre a entrada e saída: 1. 5 V DC;` tem
  sete palavras no rótulo (o teto era seis), então deixava de ser par, caía na regra de
  parágrafo por ter doze palavras no total e **encerrava** a ficha do XL6009 no terceiro
  item de onze. Quem limita rótulo é o tamanho em caracteres.
- **Numa lista marcada, linha sem marcador encerra.** É o site mudando de assunto sem usar
  dois-pontos no subtítulo: no JSN-SR04T a ficha é seguida de `Downloads`, `Acompanha` e
  `Garantia` — sem marcador, sem dois-pontos e sem linha em branco antes. Nenhuma das
  outras regras os alcançava, e os seis viravam especificação. O par escapa antes, então
  item solto sem hífen no meio da lista continua sendo lido.
- **Categoria**: breadcrumb em Microdata (só os `name` dentro de `itemListElement`) ou o
  **dataLayer do GA4** (`item_category`), casando por `item_sku` — a página empurra um
  objeto por produto, incluindo relacionados.
- **Estoque**: nenhuma loja testada declara `inventoryLevel`; o número está no texto
  (`estoque-qtd-45`, "Estoque: 45 unidades").
- **Imagens**: deduplicar por foto, ignorando o segmento de dimensão da URL
  (`/600x450/` e `/800x800/` são a mesma), e ficar com a maior.
- Campo ausente fica `null` — **nunca inventado**. Cada produto carrega `origens`, dizendo
  de onde veio cada valor, para distinguir lido de derivado.

**Plataformas, e o que cada uma esconde:**

- **Tray** (Casa da Robótica): o microdata declara **só o nome** — sem `price`, sem
  `offers`, sem `sku`. A página tinha nome e endereço e mesmo assim reprovava por falta
  de preço. O preço vive num campo oculto, `<input id="preco_atual" value="25.99">`, que é
  o único lugar legível por máquina: o preço visível quebra os centavos em `<span>`
  aninhados. Logo abaixo vem `precoAvista`, **menor** — é o do pix, não o de tabela.
- **Tray: `preco_atual` vem `0.00` no produto esgotado.** A página do SK1089 mostra "Não
  disponível" e zera o campo, enquanto o `dataLayer` segue anunciando 59,90. Quem lê só o
  input perde o preço justamente onde a comparação interessa — o concorrente continua
  publicando quanto cobra. A alternativa é `price`/`priceSell` do `dataLayer`.
- **Tray: `priceSellDetails` vem STRING VAZIA quando não há parcelamento.** Não é lista
  vazia nem campo ausente, e é assim na Smartkits inteira, inclusive num produto de
  R$ 4.299,90 — enquanto `listSku` e `breadcrumbDetails` na mesma página são arrays de
  verdade. O `?.` não alcança `""`, e `"".find` derrubava a validação da fonte com
  `find is not a function` antes de qualquer preço ser lido. Campo de JSON de terceiro
  quer `Array.isArray`, não encadeamento opcional.
- **Loja Integrada** (Eletrogate): a galeria fica **fora** do escopo do `itemtype=Product`.
- **Tray**: os relacionados ficam **dentro** desse escopo. As duas convenções são opostas,
  e é por isso que recortar no bloco do produto **não** serve de regra geral para imagem.
- O **dataLayer é JSON lido por regex**, então os escapes chegam crus: a categoria aparecia
  como "Componentes Eletr\u00f4nicos" na tela. Decodificar só ali, onde se sabe que a
  origem é JSON — em `comoTexto` isso alcançaria texto de HTML, onde a sequência não é
  escape nenhum.

**Imagens além do formato estruturado:**

A loja publica só a principal em `itemprop`/`og:image`; as outras ficam em `<img>` comum
(`data-largeimg`, `data-zoom-image`). O filtro do que é do produto é o **diretório
completo** da foto, com origem — não a última pasta: a RoboCore serve
`.../1180/images/1180_1_H.png`, e "images" casava com o ícone do WhatsApp, o `blank.gif`
e a foto do produto 908.

- **Tamanho pode estar no NOME**, não no caminho: `1180_1_H`, `_X`, `_S`, `_L` são a mesma
  foto. Sem tratar isso, três fotos viravam dez.
- **Teto de 10 por galeria**, para a plataforma sem regra própria. Passando disso o
  diretório não é do produto, é balde da loja inteira. Descarta-se a galeria inteira, e não
  se apara a lista: não há como saber quais eram do produto. Fica só o que veio estruturado.
- **Na Tray o filtro é o id do produto no nome do arquivo**, não o diretório: o CDN serve
  o catálogo inteiro de `/img/img_prod/<loja>/`, e ali o diretório não separa nada.

**Catálogo público da plataforma:**

Algumas plataformas publicam a lista de produtos em JSON, sem credencial — a Tray em
`/web_api/products`, a Shopify em `/products.json`. O registro em
`src/lib/coleta/plataformas.js` guarda o endereço de cada uma; a leitura mora em
`src/lib/coleta/catalogo.js` e passa por `buscarPagina`, então robots.txt e ritmo valem
igual — catálogo público não é licença para atropelar o servidor.

- **Ele encurta a descoberta, não a leitura.** Na Tray o catálogo dá o total exato (2296
  contra o "500+" do sitemap) e a lista de imagens, mas **não traz a referência da loja**
  (`Ref: 21A502`) nem o preço à vista. Como o código é a chave de acesso ao produto do
  concorrente, a página continua sendo aberta uma a uma.
- **Só imagens e NCM vêm do catálogo.** Preço, nome e código não: o `promotional_price`
  da Tray vem `0` num produto que anuncia desconto à vista, e a referência não existe ali.
  Deixar o catálogo vencer nesses campos apagaria dado bom com dado ausente.
- **A LISTAGEM da Tray trunca em 4 imagens por produto.** Medido: todo item de
  `/web_api/products?limit=50` vem com exatamente 4; `/web_api/products/{id}` do mesmo
  produto traz 9.
- **Fonte declarada ≠ fonte completa.** O catálogo **soma** às imagens da página, nunca
  substitui. Substituir custou cinco fotos por produto: a lista era autoritativa sobre
  *de quem* é a foto, e ainda assim era uma amostra. Trocar uma fonte por outra só se
  justifica depois de medir que a nova cobre tudo que a antiga cobria — somar é o padrão
  seguro, porque a deduplicação já cuida da sobreposição.
- **Não afirme sobre o site o que não foi medido.** O sitemap só é consultado quando o
  catálogo não completa a cota, e o passo "Sitemap identificado" só aparece quando a
  consulta aconteceu — dizer "não publicado" sem ter olhado é inventar um fato.

**O preço à vista pode não estar na página:**

Na Tray o bloco "Formas de Pagamento" é montado por AJAX. A Smartkits anuncia
*"à vista R$ 52,15 — Desconto de 5 %"* e a string `52,15` **não existe uma vez sequer** no
HTML entregue: o que vem é o preço de tabela, 54,90. Sem abrir
`/mvc/store/product/payment_options?loja=<idLoja>&IdProd=<id>&preco=<preco>`, o desconto do
pix não é coletado e a comparação usa um preço que ninguém paga. Leitura em
`src/lib/coleta/pagamento.js`; o endereço é dado, no registro da plataforma.

- **Fora do `Disallow`.** O robots.txt da Tray barra o endpoint **antigo**
  (`/loja/pag_parcelado.php`) e os de carrinho — não este. Responde **ISO-8859-1**, então
  tem que passar por `buscarPagina`.
- **UMA requisição por FONTE, não por produto.** O ritmo é de uma visita a cada 2 s por
  domínio, então perguntar item a item **dobrava** a colheita: numa fonte de 20 produtos,
  40 s viravam 80 s. O desconto à vista não é do produto — é da **loja**: 5% em todos os
  produtos medidos na Smartkits e na Casa da Robótica. A regra é aprendida no primeiro item
  e aplicada ao resto (`novaMemoriaDePagamento`, uma por colheita — nunca global, senão uma
  loja responde pela outra).
- **O arredondamento do centavo NÃO é igual em toda loja Tray.** A Smartkits **trunca**
  (8,90 −5% = 8,455 e ela cobra 8,45); a Casa da Robótica **arredonda** (4,89 −5% = 4,6455
  e ela cobra 4,65). Supor um dos dois erra o outro em um centavo.
- **Só adota a regra quando a amostra DISCRIMINA os dois modos.** Conferir que a regra
  reproduz o valor lido não basta, e isso já custou um centavo errado: o primeiro produto
  da Casa da Robótica (12,99 −5% = 12,3405) dá 12,34 truncando **ou** arredondando, então
  não prova nada — e a regra escolhida ali errou o produto seguinte. Enquanto os dois modos
  explicarem todas as amostras, continua perguntando. Na prática: Smartkits resolve em 1
  leitura, Casa da Robótica em 2.
- **A conta é em centavos inteiros.** Em ponto flutuante, 59,90 × 0,95 vira
  56,90499999999999 e o meio-centavo some — fazendo os dois modos parecerem iguais
  justamente na amostra que os separaria.
- Modo nenhum explicando as amostras, ou percentual mudando entre produtos: `semRegra`, e a
  fonte pergunta produto a produto até o fim. Preço errado de concorrente é pior que coleta
  lenta.
- `percentual: 0` é resposta legítima: loja sem desconto à vista. Guardar isso evita 19
  requisições que devolveriam sempre o preço de tabela.
- **A origem diz se foi lido ou calculado.** `origens.precoPromocional` sai como *"formas
  de pagamento — desconto de 5%"* no primeiro e *"calculado: desconto de 5% da loja,
  conferido em N leitura(s)"* nos demais. Sem isso, não haveria como saber em qual dos
  dois casos um produto caiu.
- **Só uma parcela conta**, a mesma regra do `priceSellDetails`. E o valor sai do `<b>`,
  não de qualquer `R$` da linha: o cartão escreve *"Parcela Mínima de `<strong>`R$
  30,00"* na mesma `<tr>`, e um leitor guloso gravaria 30,00 como preço do produto.

**Códigos, imagens e charset:**

- **O código é o ponto de acesso ao produto do concorrente.** Campo com mais de um código
  vira mais de um produto: a Casa da Robótica publica `reference="AF01 ou AF02"`, e um
  registro com os dois dentro não é achado por nenhum dos dois. Separa em disjunção
  explícita (`ou`, vírgula, ponto-e-vírgula) — **nunca em hífen, ponto ou barra**, que
  fazem parte de códigos inteiros (`F30-004`, `HK-502`, `5V/3A`).
- **Na Tray, o `sku` do JSON-LD é o id INTERNO, não o código da loja.** Medido em três
  lojas: onde o JSON-LD publica `sku`, ele é sempre igual ao `idProduct` do `dataLayer`
  (Smartkits 1079, Arduino Brasil Shop 1001), e o código que a página mostra ao cliente —
  **`REF: SK1244`** — é o `reference`. A Casa da Robótica não publica `sku` nenhum, e por
  isso já vinha certa. O desvio em `normalizar.js` só vale quando está **provado** que os
  dois são o mesmo número: loja que um dia publicar `sku` próprio continua vencendo pela
  ordem normal.
- **Sem código na página, o produto entra como `N/A`** — decidido pelo dono, e é a única
  exceção à regra de nunca inventar valor. Por isso `origens.code` sempre registra que a
  marcação foi nossa. Constante `SEM_CODIGO` em `normalizar.js`.
- **A Tray usa três convenções de nome de arquivo na mesma loja:** `73_5_<data>` (id abre),
  `71_variacao_3_0_<data>` (id abre, foto de variação) e
  `modulo_..._ky_019_73_1_<hash>` (id depois do slug). O padrão aceita o id no início ou
  entre sublinhados seguido de número — a segunda forma exige o dígito porque um hash
  como `..._5227_1_71ff6f9c...` seria confundido com o produto 71.
- **Charset não é sempre UTF-8.** A Casa da Robótica serve `charset=ISO-8859-1`, e
  decodificar tudo como UTF-8 gravava "M�dulo Rel�" **no banco**, não só na tela. O
  charset vem do cabeçalho e, na falta dele, do `<meta charset>` — lido numa prévia em
  latin1, onde todo byte é válido e a declaração, sendo ASCII, sobrevive intacta.

### Fornecedores: importação de arquivo

Fornecedor não tem vitrine para varrer — a Fortek/Benser é um **portal B2B atrás de
login**, a Santana Import só mostra preço a cliente cadastrado. O caminho é o operador
trazer o arquivo (Ctrl+S na página, ou o catálogo baixado). **Nenhuma credencial passa
pelo sistema**, e pedir a senha do dono foi recusado de propósito.

Leitura em `src/lib/coleta/arquivos.js`. O produto sai no **mesmo formato da coleta** —
muitos leitores, uma forma só, senão a tela passaria a precisar saber de onde veio a linha.

**Os três formatos, medidos em arquivos reais:**

| Arquivo | Formato | Produtos | Onde o dado estava |
| --- | --- | --- | --- |
| Benser (10,8 MB) | HTML | 1592 | array JSON num `<script>`, com 1592 fotos em base64 |
| Santana (3,7 MB) | PDF | 989 | texto tabulado; `getTable()` volta **vazio** em 65 de 69 páginas |
| Nightech (16 MB) | XLSX | 457 | cabeçalho na **linha 6**; 459 imagens **ancoradas**, fora das células |

- **PDF: ancore no código no início da linha.** O catálogo da Santana tem 9465 linhas e
  só 989 são produto — sem âncora entram título de seção e texto de garantia.
- **XLSX: procure o cabeçalho, não assuma a linha 1.** Planilha de fornecedor começa com
  logo e total. E **casar coluna por PREFIXO**: a Nightech escreve `PREVISÃO 20/09` e
  `VALOR UNIT. (R$)`, com data e moeda coladas no nome.
- **Coluna que parece estoque e não é.** `QUANTIDADE DO PEDIDO` é o pedido do comprador —
  lê-la como saldo mostraria zero num produto com 4618 em estoque. Lista `CAMPOS.ignorar`.
- **Imagem no Excel flutua sobre a folha**, ancorada a uma posição. O caminho é
  âncora → linha → código → foto, com o binário em `workbook.model.media[imageId]`.

**Pronta entrega e reserva:**

- `stock.quantity` é **sempre** a pronta entrega; `stock.aChegar` é o que está comprado e
  em trânsito. **Nunca somados** — um número só prometeria entrega que não existe.
- `prices.normal` é o de pronta entrega (decisão do dono); `prices.reserva` é o do que vai
  chegar. Medido na Fortek: `65-276` custa **79,90 na reserva e 82,90 na pronta entrega** —
  num campo só essa inversão sumiria.
- **Dois arquivos** (Fortek) ou **duas colunas** (Nightech). O arquivo diz qual lista é pelo
  `<title>`: *Benser · Lista de Reserva* contra *Benser · Portal de Pedidos*. O título veio
  do fornecedor; o nome do arquivo o operador renomeia. Na dúvida, pronta entrega.

**Regras por fornecedor** — `src/lib/coleta/fornecedores.js`, dado e não código:

- **Fortek — `sufixoDeCarga`.** `02-268-A` é o mesmo item que `02-268`; o sufixo é a carga.
  Confirmado pelo dono em 31/08/2026. Junta 153 pares a mais (1911 contra 2064). **Vale só
  para ela**: noutro catálogo `-2` pode ser voltagem ou versão, e juntar apagaria produto.
- **Nightech — `mesclarSiteComArquivo`.** O site tem foto, texto de venda e endereço; a
  planilha tem preço e saldo. Mesmo código = um produto.

A mesclagem em si mora em `src/lib/coleta/mesclar.js`, **sem imports**, usada pelo servidor
(duas listas) e pela tela (site + arquivo). Duplicá-la faria as duas divergirem em silêncio.

- **Quem chega primeiro vence**, e quem chama decide a ordem: pronta entrega antes da
  reserva; site antes da planilha.
- **Descrição: vence a mais longa**, não a primeira.
- **Fotos somam, a nova por último.** Site primeiro (resolução de venda), planilha depois
  (miniatura de conferência). A primeira é a que vira miniatura na tela.
- **`aChegar` SOMA** quando o mesmo produto vem em duas cargas. Manter só a primeira
  descartava a segunda em silêncio — 13 casos com `65-361` e `65-361-2` na mesma lista.

**A prévia mostra 3 produtos, o arquivo tem centenas.** Por isso a ação devolve também um
`porCodigo` — índice do arquivo inteiro, **sem imagem e sem descrição** (são os campos
pesados). Sem ele a mesclagem tentava casar 3 sorteados com 3 do site e quase nunca
acertava, o que fazia a regra *parecer* quebrada.

**O total da fonte é um TETO.** Site + arquivo − códigos conferidos nos dois. O teste abre
três páginas, então só três casamentos são confirmados; os outros produtos do site podem
estar no arquivo também. O passo na tela diz quantos foram conferidos, em vez de fingir
precisão.

**Impostos** — `src/lib/coleta/impostos.js`. Distribuidor cobra por fora: a Benser escreve
*"Preço unit. sem IPI"*. `prices.comImpostos` guarda o valor somado, e `taxes` diz quais
entraram. **Só rótulo conhecido** (IPI, ICMS, ICMS ST, FCP, PIS, COFINS) e alíquota entre 0
e 100 — varrer atrás de qualquer `%` traria desconto e garantia para dentro do custo. O
imposto sai das especificações: ele tem campo próprio, e repetir diria a mesma coisa duas
vezes.

**O arquivo entra pela tela, não pela linha de comando** — feito em 01/09/2026. O
fornecedor manda a lista por e-mail ou WhatsApp; o operador anexa na linha da fonte, em
`ArquivosDaFonte.jsx`, e "Atualizar dados" reprocessa **o último arquivo de cada tipo**.

- Gravados em `dados/coleta/<domínio>/arquivos/`, com manifesto ao lado (`salvarArquivosDaFonte`,
  `manifestoDaFonte`). Fora do git e fora de `public/`, igual às fotos de produto.
- **O nome do arquivo vem do navegador e é dado de terceiro.** Passa por
  `path.basename` e `replace(/[^\w.\- ]/g, "_")` antes de virar caminho: `../../.env` é um
  nome de arquivo perfeitamente válido para quem envia, e sem isso seria um destino de
  escrita perfeitamente válido para nós.
- **Teto de 24 MB, conferido nos dois lados.** No cliente para dar recado, no
  `next.config.mjs` porque acima disso o 413 vem **antes** do nosso código — a planilha da
  Nightech tem 16 MB.
- Reprocessar é `reprocessarArquivos`, o mesmo caminho da leitura de arquivo: a tela não
  ganhou um segundo extrator.

**Conciliação: o que some da lista não é apagado** — `src/lib/coleta/conciliar.js`, sem
imports, testado em `npm run teste:extracao`. Combinado com o dono em 01/09/2026:

- Novo entra; conhecido atualiza; **ausente fica, com o saldo a `null`**.
- **Ausente não é zero, e a distinção é o ponto todo.** "Esgotou" é afirmação do
  fornecedor; "não veio na lista" é observação nossa. Gravar `0` poria na boca dele um
  número que ele não disse — contra a regra que vale no resto do sistema. O motivo fica em
  `ausente.desde/motivo` e em `origens.quantidade`, para a tela dizer qual dos dois casos é.
- Apagar jogaria fora código, descrição, fotos e NCM — caros de obter — por causa de uma
  linha que não veio, e o item costuma voltar na semana seguinte.

**A trava de queda: uma lista pela metade é recusada inteira.** `quedaSuspeita`, teto de
50%. Não é hipótese: um upload parcial da Fortek chegou com 512 produtos contra 1.911
guardados, e teria marcado **73% do catálogo como ausente sem um erro na tela**. Foi
recusado, e os 1.911 ficaram intactos.

- A causa concreta é a Fortek mandar **duas** listas — pronta entrega e reserva. Enviar só
  uma marca como ausente todo produto que só existe na outra. Vale igual para exportação
  truncada ou da aba errada.
- **Só compara arquivo com arquivo.** A colheita do site traz 20 produtos e o arquivo traz
  1.900: comparar os dois acusaria queda em toda troca de caminho, e o aviso viraria ruído
  que se aprende a ignorar.

**Ainda em aberto:** a unidade de venda — a Santana publica *Múltiplo de venda: 100*, e
preço por embalagem comparado com varejo engana.

**Fornecedores com conta, ainda não ligados** — `FORNECEDORES.md`, na raiz. São 32 contas
que o dono já tem, registradas a partir de 01/09/2026.

**Nomes não entram no código.** Uma primeira versão colocou a lista dentro de
`src/lib/coleta/fornecedores.js` e o dono recusou em 01/09/2026: o arquivo de regras é
lido pelo `regrasDoFornecedor` a cada coleta, e uma lista de intenção ali passa a parecer
configuração ativa — alguém acabaria iterando sobre ela. O `.md` na raiz não tem `export`,
ninguém o importa, e ele volta à conversa só quando o dono pedir um nome.

Ter a conta não é ter o fornecedor ligado: implementar um deles começa por descobrir como
o dado chega — vitrine pública, portal atrás de login ou arquivo exportado —, e só então
decidir entre coleta e importação. **Site só está anotado onde o dono deu** (hoje doze). A
**Solda Fria** é a mais adiantada — é a loja em que a plataforma OpenCart foi conferida em
`plataformas.js`, então só falta cadastrá-la como fonte.

Arquivos de origem em `C:/Users/pesso/Downloads/`.

### Sites que exigiram tratamento próprio

- **Makerhero: Cloudflare.** Desafio anti-bot em qualquer combinação de cabeçalho,
  inclusive nenhum. **Não se contorna** — o `buscar.js` diz por escrito que user-agent
  disfarçado de navegador é o oposto de educado. A mensagem na tela nomeia a proteção em
  vez de dizer `HTTP 403` seco, senão parece erro de digitação.
- **Santana Import: lenta e irregular.** 1,5 MB de home variando de 0,4s a 26s no mesmo
  minuto. O teto era fixo em 20s e cortava no meio; virou `COLETA_TIMEOUT_MS`.
- **Wix (Nightech): `ImageObject` com `contentUrl`.** O JSON-LD publica cada foto como
  objeto completo, e ler só `url` trazia 1 de 6. As duas chaves são válidas no schema.org.
- **Código na URL, confirmado pelo nome.** A Santana publica `018-0071` no endereço e no
  título, e em nenhum formato estruturado. Exigir que apareça nos **dois** transforma o
  palpite em conferência — slug tem número de tudo quanto é tipo.
- **EAN na ficha técnica.** Rótulo em português (`Cód. Barras`), ancorado nas pontas para
  deixar `EAN Caixa Mãe` de fora: aquele é o código do fardo, não da peça.
- **Preço é opcional para `FORNECEDOR`.** Atacadista publica catálogo aberto e preço só a
  cliente cadastrado; exigir preço jogaria fora um catálogo inteiro de dados úteis. Para
  `CONCORRENTE` a exigência continua.

**robots.txt e educação:**

- Vários `User-agent:` seguidos formam **um** grupo. Tratando cada linha como grupo novo,
  um arquivo com dezessete agentes era julgado pelo último e as regras eram ignoradas.
- **`Crawl-delay` é respeitado** (impactocnc pede 10s). Isso faz o teste levar minutos —
  a tela avisa.
- Ritmo próprio: 1 requisição a cada 2s por domínio, via `limitar()` de `httpClient.js`.
  O scraper **não** usa `requisitar()`, que gravaria `LogIntegracao` com um enum `Servico`
  inexistente.

**Sitemap:**

- O índice pode listar a home como se fosse sitemap, e o de produtos pode não ser o
  primeiro. Priorizar quem tem cara de produto — mas **o padrão não pode conter "item"**:
  a palavra "s**item**ap" casa, todos os filhos furam a fila e a ordem se inverte.
- Sitemap declarado no robots.txt nem sempre lista produtos (a Usinainfo declara um de
  rotas de busca). Quando ele não entrega, a descoberta é por **navegação**, priorizando
  URLs com cara de produto (`.html`, id numérico no fim) — em largura pura o orçamento
  acaba nas categorias.
- **ENDEREÇO NÃO É PRODUTO, e confundir os dois já enganou o dono.** O passo contava as
  linhas do sitemap e as chamava de "produto": a Usinainfo aparecia com *"12 produto(s) no
  sitemap"*, e o número ia para **"Catálogo da loja"** e ficava **gravado na fonte** — como
  se a loja inteira tivesse doze itens. `usbuscaroute-sitemap.xml` é o único sitemap dela
  (todos os outros caminhos dão 404) e traz 12 rotas de `/busca/...`.
- **A coleta nunca esteve limitada** — o defeito era só de relatório. Medido: com limite
  20, a Usinainfo entrega **20 produtos em 78 s**, abrindo 35 páginas, com 20 códigos
  distintos. A navegação compensa o sitemap inútil por inteiro.
- **Filtrar por "cara de produto" não resolveria.** Das 12 rotas, onze não têm cara de
  produto e a décima segunda tem **por acidente**: `baterias-18650` casa com o padrão de id
  numérico, e 18650 é o modelo da bateria.
- Hoje o passo diz **"N endereço(s) no sitemap"**, que é o que foi contado, e o total só
  vira "produtos da loja" depois de **provado** que aquele sitemap lista produto — ou seja,
  quando pelo menos um endereço dele virou produto de verdade. Sem prova, `null` e
  travessão na tela. E a frase distingue a origem: catálogo público da plataforma
  (`produtosNoSiteFonte: "catalogo"`, o caso dos 2.296 da Casa da Robótica, que vêm do
  `/web_api/products` e **não** do sitemap) ou sitemap.

---

## Armadilhas da stack

- **`prisma migrate dev` é interativo** e falha aqui. Use
  `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
  gravando em `prisma/migrations/<timestamp>_nome/migration.sql`, depois `migrate deploy`.
- **Ele nem sempre regenera o client.** Depois de migrar: `npx prisma generate` **e
  reiniciar o servidor** — o dev server mantém o client antigo em memória e a tela mostra
  "banco indisponível" com o Postgres saudável. **Esta armadilha já estava escrita aqui e
  ainda assim foi repetida** ao adicionar a coluna `instrucoes`: migration aplicada,
  `generate` rodado, servidor não reiniciado — e o campo não salvava. O sintoma não é erro
  de banco: o client em memória **não conhece a coluna**, então ela some do `update` em
  silêncio e a tela volta como se tivesse salvado. Ler a regra não basta; reiniciar faz
  parte do passo de migrar.
- **Tela mostrando zero pode estar lendo a fonte errada, não contando errado.** A coluna
  "Coletados" exibia 0 com 1.911 produtos em disco: ela lia `_count.paginas` do Postgres,
  que está **vazio de propósito** enquanto a coleta grava em JSON. Trocar o rótulo teria
  escondido o defeito. Enquanto duas origens convivem, número na tela pede a pergunta
  "de onde este veio?" antes de "a conta está certa?".
- **Renomear tabela**: escreva a migration à mão com `ALTER TABLE ... RENAME`. O
  `migrate diff` gera `DROP` + `CREATE` e apaga os dados.
- **Erro de sintaxe envenena o cache do Turbopack, e o veneno sobrevive ao restart.** Um
  arquivo salvo por instantes com erro de parse — no caso, uma aspa a mais deixada por um
  `sed` em `mercados/page.jsx` — derrubou o manifesto de rotas da **subárvore inteira**:
  depois de corrigido o arquivo, `/mercados/fontes` continuou devolvendo **404** enquanto
  `/mercados` e `/integracoes` respondiam 200. O arquivo da rota estava intacto, com
  `export default` no lugar, e **três reinícios do servidor não resolveram**. O que resolve
  é apagar o cache:

  ```bash
  rm -rf .next && npm run dev
  ```

  O sintoma engana: parece rota apagada ou site fora do ar, e não é nenhum dos dois — o
  layout renderiza normalmente em volta do 404. Antes de procurar no código, confira se a
  rota some só numa subárvore e se o arquivo dela foi mesmo alterado (`git status`).
- **Patch com `sed` em JSX cobra caro por isso.** Aspas dentro de atributo e de string
  fazem o comando escapar do que se pretendia, e o estrago não aparece no arquivo editado —
  aparece numa rota vizinha, minutos depois. Em JSX, prefira edição por trecho exato.
- **Abas precisam ficar montadas e apenas ocultas.** Campo desmontado não entra no
  `FormData` — salvar por uma aba invalidava os campos das outras.
- **Arquivo `"use server"` só exporta função assíncrona.** Uma constante exportada faz o
  Next recusar o módulo inteiro.
- **Limite de corpo de Server Action** é 1 MB por padrão; está em 24 MB no
  `next.config.mjs` por causa dos PDFs. Acima disso vem 413 **antes** do nosso código.
- **`next/image` lança exceção** quando o host não está em `images.remotePatterns` — uma URL
  externa inválida derruba a página. Use `<img>` para URL externa (ver `ehLocal`).
- **Tailwind v4**: `divide-x` usa `border-inline-end`, e o utilitário de translação escreve
  a propriedade `translate`, não `transform`.
- **`npm run teste:coleta` tem 1 asserção falhando**, conhecida e não resolvida: na
  segunda varredura sem mudança, as páginas são marcadas "atualizada" em vez de
  "inalterada". As assinaturas calculadas são idênticas e o caminho isolado funciona;
  reproduz só com dois ou mais produtos. Efeito: uma escrita a mais com valores iguais —
  **não** duplica linha nem cria histórico de preço falso.
- **`pdf-parse` precisa ficar FORA do bundle.** Ele usa o pdfjs, que carrega um worker em
  arquivo separado; empacotado pelo Turbopack o caminho se perde e a leitura morre com
  `Cannot find module .../pdf.worker.mjs` — funcionando fora do Next o tempo todo. Está em
  `serverExternalPackages` no `next.config.mjs`.
- **`exceljs` foi escolhido no lugar de `xlsx`**: o `xlsx` no npm está parado na 0.18.5 com
  vulnerabilidades sem correção, porque a SheetJS saiu do npm. O `exceljs` traz um aviso
  **moderado** transitivo (`uuid` < 11.1.1, GHSA-w5hq-g745-h8pq), cujo caminho vulnerável
  exige passar buffer próprio a `v3/v5/v6` — coisa que ler planilha não faz.
- **`String.replace` interpreta `$` na string de substituição.** `` $` `` insere tudo que
  vem ANTES do casamento: um patch com isso injetou 3120 caracteres no meio de
  `normalizar.js`. Em substituição gerada por script, use função `() => novo`.
- **Barra invertida some entre shell e JS.** Um `node -e` com `\d` gerou `d` no arquivo:
  código válido que não fazia nada, e o lint passou. Patch com regex vai por arquivo.
- **Não canalize teste com `| head`.** O SIGPIPE mata o processo antes da limpeza, deixa
  linhas no banco e envenena a execução seguinte. Redirecione para arquivo e leia depois.
- **React 19 barra `setState` dentro de efeito.** Para ler `localStorage`, use
  `useSyncExternalStore` (ver `src/lib/preferenciaMenu.js`); para reagir ao resultado de uma
  ação, trate dentro do próprio `useActionState`.

---

## Decisões de arquitetura

- **Produtos é o cadastro base.** Todo anúncio deriva dele. O `Anuncio` guarda só o que é
  específico do canal.
- **Dois estados por anúncio:** `status` (interno) e `situacaoCanal` (no marketplace). Eles
  divergem — o ML pausa anúncios sozinho por falta de estoque.
- **Conectores não assumem OAuth.** Bling e ML usam OAuth2, a LI usa chaves estáticas, a
  Shopee assina com HMAC. O gancho `autorizarRequisicao` é onde a diferença cabe.
- **Segredos cifrados** (AES-256-GCM) na tabela `Conexao`, num único JSON por serviço.
  Sem a `ENCRYPTION_KEY` os tokens viram lixo — **leve a chave junto do dump**.
- **Arquivos em `dados/produtos/<SKU>/<tipo>/`**, fora de `public/` (que não sobrevive a
  deploy com Docker). O SKU é validado como nome de caminho; a pasta acompanha quando ele
  muda; o endereço é **calculado na leitura**, nunca gravado.
- **Custo do produto vem do fornecedor padrão.**
- **Imagem principal é uma marca (`principal`), não a posição 0.** Reordenar a cada clique
  fazia as miniaturas dançarem e custava até 3s por clique.
- **Toda chamada externa é auditada** em `LogIntegracao`, com credenciais mascaradas.

## Trabalhando neste projeto

- Verifique com evidência: consulte a API real (leitura é segura), meça nos logs, teste o
  caminho de erro — não só o feliz.
- Prefira `Edit` a reescrever arquivo inteiro com `Write`.
- Antes de commitar: `npm run lint`, e confira que `.env`, `certificates/` e `dados/` ficam
  de fora.
