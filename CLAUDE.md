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
| Mercados | Teste de fonte maduro em 5 lojas; identifica plataforma; coleta em lote **não ligada** |
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

**Fornecedor com portal fechado (combinado em 30/08/2026, a implementar):**

A Benser é um **portal de pedidos B2B atrás de login** — não tem vitrine pública, sitemap
nem produto acessível. O bloco Mercados lê vitrine pública; portal fechado é outro
problema, e forçar os dois no mesmo caminho complicaria os dois.

O caminho combinado é **importação de arquivo**, não raspagem. O dono salva a página do
portal (Ctrl+S) e o sistema lê o arquivo. Nenhuma credencial passa pelo sistema.

- **O que o arquivo salvo da Benser contém** (medido): **1592 produtos** num array JSON
  embutido num `<script>` de 10 MB, com `sku`, `desc`, `cat`, `preco`, `estoque`, `ncm`,
  `ipi`, `loc`, `info` — **100% preenchidos** — e **1592 fotos** em base64, uma por SKU.
  Muito melhor que qualquer raspagem: campos nomeados, sem heurística.
- **A chamada `estoque-reserva`** (5 kB, 1 requisição) devolve `saldos` e `precos` por SKU
  para 593 itens. Serve para atualizar preço e saldo depois, não para o cadastro.
- **Os SKUs das duas fontes NÃO casam**: 44 exatos de 593. A API usa sufixos (`-A`, `-2`)
  que o HTML não usa — provavelmente identificam a **carga** (lote de importação). Como
  tratar isso é decisão de negócio do dono, não técnica.

**Desenho combinado — o oposto do que vale para as lojas.** Loja pública tem padrão comum
(`schema.org`), então o genérico ganha. Fornecedor não tem padrão nenhum: a planilha é o
que o ERP dele exporta. Aqui a ramificação por fornecedor se justifica — mas como **dado,
não como código**:

- **Poucos leitores de formato** (XLSX, CSV, JSON, HTML-com-JSON-embutido). Não crescem
  com o número de fornecedores.
- **Um mapeamento declarativo por fornecedor**, editável na tela. Cadastrar fornecedor não
  pode virar tarefa de programação.
- **Muitos leitores, um formato só na saída.** O produto importado cai na mesma forma do
  coletado — senão a tela e a comparação passam a precisar saber de onde veio cada linha.

**Três decisões em aberto, todas do dono:**

1. **O que o preço inclui.** A Benser publica *"preço unit. sem IPI"*. Se outro fornecedor
   mandar com IPI e os dois caírem no mesmo campo, comparar fica sem sentido — e o erro é
   invisível, porque os dois números são plausíveis. O mapeamento tem de declarar a base.
2. **Unidade de venda.** Caixa, cento, rolo. Preço por embalagem comparado com varejo
   engana.
3. **Como o sistema sabe de quem é o arquivo.** Recomendado: o operador escolhe o
   fornecedor ao subir. Detectar por impressão digital erra em silêncio, e o erro
   sobrescreve custo com número de outro fornecedor.

Mais: o importador deve **comparar com a importação anterior e recusar desvio absurdo**
(90% dos preços mudando de uma vez). Arquivo exportado à mão vem parcial, vem velho, vem
da aba errada — melhor barrar e perguntar que gravar custo errado.

O arquivo de origem está em `C:/Users/pesso/Downloads/Benser · Portal de Pedidos.html`.
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
