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
| Mercados | Teste de fonte em 6 sites + importação de arquivo (HTML/PDF/XLSX); coleta em lote **não ligada** |
| Pedidos, Estoque, Financeiro, Relatórios | Esqueleto |

**A publicação nunca foi ligada.** `ML_PUBLICACAO` e `BLING_ESCRITA` estão em `false`, e
`exigirTravaLiberada` em `src/lib/integracoes/config.js` barra todo `POST`/`PUT` antes da
requisição sair. A conta tem **1007 anúncios e estoque reais** — não ligue sem pedir.

## Rodar

```bash
npm run db:up && npm run dev      # https://localhost:3000
npm run diagnostico               # testa as integrações pela linha de comando
npm run teste:extracao            # 99 asserções da extração, SEM rede
npm run teste:fonte -- <url>      # avalia um concorrente pela linha de comando
npm run teste:fonte -- --tipo=FORNECEDOR <url>   # preco deixa de ser exigido
COLETA_TIMEOUT_MS=90000 npm run teste:fonte -- <url>   # site lento
npm run coletar -- --limite=20 <url>   # colhe e grava em dados/coleta/<dominio>/
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

**O código ainda não reflete isso.** Foi escrito quando o rumo era o banco, e hoje:
a tela `/mercados` lista de `paginaColetada`, o botão "Atualizar tabelas" enfileira
`Job` e o `scripts/worker.js` grava no Postgres. `scripts/coletar.js` é o único caminho
que grava em JSON. **Nada disso foi commitado** — o bloco inteiro está solto no working
tree, sobre `d6a495b`. Reconciliar código e combinado é o primeiro trabalho da próxima
sessão; até lá, JSON é o alvo e o Postgres nem precisa subir.

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
- **Especificações**: seção declarada pelo site ("Especificações:", em qualquer caixa),
  lida como **lista ordenada** de `{nome, valor}` — `nome: null` na linha sem rótulo,
  porque objeto JSON não comporta isso sem inventar chave. Encerra no título seguinte, num
  parágrafo, ou numa **linha em branco seguida de algo que não é par**.
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

**Códigos, imagens e charset:**

- **O código é o ponto de acesso ao produto do concorrente.** Campo com mais de um código
  vira mais de um produto: a Casa da Robótica publica `reference="AF01 ou AF02"`, e um
  registro com os dois dentro não é achado por nenhum dos dois. Separa em disjunção
  explícita (`ou`, vírgula, ponto-e-vírgula) — **nunca em hífen, ponto ou barra**, que
  fazem parte de códigos inteiros (`F30-004`, `HK-502`, `5V/3A`).
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

**Ainda em aberto:** a unidade de venda (a Santana publica *Múltiplo de venda: 100*, e
preço por embalagem comparado com varejo engana) e a conferência contra a importação
anterior, recusando desvio absurdo — arquivo exportado à mão vem parcial, vem velho, vem
da aba errada.

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

---

## Armadilhas da stack

- **`prisma migrate dev` é interativo** e falha aqui. Use
  `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
  gravando em `prisma/migrations/<timestamp>_nome/migration.sql`, depois `migrate deploy`.
- **Ele nem sempre regenera o client.** Depois de migrar: `npx prisma generate` **e
  reiniciar o servidor** — o dev server mantém o client antigo em memória e a tela mostra
  "banco indisponível" com o Postgres saudável.
- **Renomear tabela**: escreva a migration à mão com `ALTER TABLE ... RENAME`. O
  `migrate diff` gera `DROP` + `CREATE` e apaga os dados.
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
