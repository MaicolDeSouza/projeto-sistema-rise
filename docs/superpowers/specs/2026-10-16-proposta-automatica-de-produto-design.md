# Proposta automática de produto (preenchimento pela sessão, sem a API do Rise)

Data: 16/10/2026. Decidido em conversa com o dono, a partir do teste do `100103-teste` (15 e 16/10/2026), em que a
sessão escolheu fotos, gerou a descrição e gravou pelo script `scripts/preencher-produto.js`.

## Intenção

O dono **cria o produto** no Rise (código, título com as palavras-chave, fornecedores e concorrentes vinculados) e a
**sessão do Claude** faz o resto da pesquisa e da análise: lê os concorrentes e os fornecedores, pesquisa na internet,
escreve a descrição, escolhe fotos, propõe título, preço, marca, modelo, unidade e EAN. Tudo isso vai para uma
**proposta**, separada do cadastro. O dono revisa na tela do produto, escolhe o que quer, salva e marca **Conferido**:
isso é a aprovação, e a proposta é apagada.

**Por que assim:** o dono quer o trabalho de pesquisa feito por quem já está na conversa, sem pagar a API da Anthropic
que o Rise usa nos botões de IA ("não quero pagar a API"), e quer continuar sendo o portão de tudo o que entra no
cadastro.

## Goals

- Reduzir o cadastro de um produto a: criar, vincular concorrentes e fornecedores, revisar a proposta, Conferir.
- Nenhuma chamada à API paga do Rise (Anthropic/OpenAI) no fluxo. A inteligência é da sessão.
- Nada muda no cadastro até o dono aprovar: a proposta é só leitura para o produto.
- Cada valor proposto traz a **origem** (qual loja, qual site, qual busca), para o dono conferir em um clique.
- Nunca inventar: o que não se acha fica "?" ou vazio, dito no relatório.

## Non-goals

- Publicar ou sincronizar com Bling, Mercado Livre ou Loja Integrada (continua pelos caminhos de hoje, sob trava).
- Substituir a janela "Criar descrição" da tela, que continua existindo com a API para quem quiser usá-la.
- Estoque, estoque mínimo e máximo, localização e o resto da tributação (CEST, SPED, percentual de tributos): a sessão
  não propõe (só avisa). NCM e origem são propostos (passo 10a).
- Rodar sozinho (agendado). O fluxo é disparado pelo dono, um produto por vez.

## Anti-goals (o que faria isto fracassar mesmo funcionando)

- Gravar no cadastro antes do Conferido, mesmo que seja só o título.
- Um EAN "gerado" ou um valor de ficha deduzido sem fonte.
- Fotos repetidas, borradas, de tom diferente, com marca d'água, ou que contradizem a ficha (o caso do diagrama com
  FT232 numa placa CH340).
- Candidatas de foto gravadas como fotos do produto (a regra "só a validada fica" as apagaria no Salvar, ou elas
  iriam para anúncio sem revisão).

## Constraints

- Produção é a VPS (`rise.4hobby.com.br`); o Postgres só aceita conexão de dentro do contêiner. A sessão trabalha pelo
  script por SSH (`docker compose exec -T app node --input-type=module - <comando>` com o script na entrada), como
  descrito em CLAUDE.md "Preencher produto pelo servidor". A sessão nunca lê nem imprime segredo do contêiner.
- O código da VPS é o do último deploy: colunas e tabelas novas só existem lá depois do "sobe" do dono.
- Sem a API do Rise. A sessão pode usar as ferramentas dela (busca na web, leitura de páginas, visão das fotos).
- Os textos seguem o formato da loja que o código impõe (`montarDescricao`, `linhaDeDimensoes`, `linhaDePeso`,
  `PADRAO_TITULO`, `margem.js`, `posicaoDePreco.js`): a sessão não reinventa regra que o Rise já tem.
- Fotos de concorrentes: o uso é decisão do dono (aviso que fica no relatório).

## O fluxo, na ordem

Um produto por vez. A sessão recebe o código e segue a ordem abaixo; cada passo escreve na proposta.

### 1. Descrição (primeiro, porque alimenta os outros passos)

- Entrada: o prompt da biblioteca que o dono indicar; sem indicação, o marcado como **padrão** na biblioteca do Rise
  (sem nenhum marcado, o "Padrão do sistema"). Mais: nome, descrição atual, marca e modelo do produto, e os dados de
  todos os concorrentes e fornecedores vinculados (nome, descrição, ficha, documentos), lidos pelo comando `ofertas`.
- A **sessão escreve** a descrição seguindo o prompt como instrução. Formato da loja: título em MAIÚSCULAS, 2
  parágrafos de até 230 caracteres sem linha em branco entre eles, "Especificações técnicas:" com `- Nome: valor;`,
  as duas últimas linhas Dimensões e Peso no formato do Rise, "Itens inclusos: (Cod:SKU)", garantia fixa.
- Campo que o prompt exige e que nenhum concorrente informa: **pesquisa profunda** (datasheet do fabricante primeiro,
  depois lojas e fóruns). Preenche só com fonte; senão fica "?".
- A proposta guarda: o texto, a lista de divergências que a sessão resolveu (campo, opções, lojas, qual venceu e por
  quê), as linhas preenchidas por pesquisa com o link da fonte, e as que ficaram "?".

### 2. Título

- Entrada: as palavras-chave do título que o dono digitou e os títulos dos concorrentes vinculados.
- Saída: **3 opções** em MAIÚSCULAS, até 60 caracteres, no `PADRAO_TITULO` (tipo + função + modelo/CI +
  especificação + compatibilidade), **uma marcada como recomendada**, com a tag **IA**. Junto, a lista dos títulos dos
  concorrentes usados.
- **O título do produto não muda.** As opções entram na lista "Escolher o título" da tela (tag IA, recomendada em
  destaque); o dono escolhe e salva.

### 3. Fotos

- Candidatas: todas as fotos dos concorrentes vinculados (`imagens` do `ofertas`) mais as atuais do produto. Todas
  baixadas e guardadas na proposta (pasta `dados/produtos/<SKU>/proposta/`), padronizadas 1024x1024 pela regra do Rise.
- A sessão olha as fotos (folhas de contato, zoom) e escolhe **6 a 8**, marcadas com o check na proposta:
  - a **primeira ilustra o título** (título diz "com cabo", a primeira mostra o cabo);
  - **ângulos variados** quando existem: cima, lado, baixo, chips em close;
  - **mesmo tom de cor** da placa entre as fotos (nada de azul forte numa e fraco noutra);
  - sem **desfoque**, sem **repetidas ou quase iguais**, sem **marca d'água ou banner de loja**;
  - nenhuma que **contradiga a ficha** (diagrama de outra variante, conector diferente, pinos soltos quando o produto
    vai soldado).
- A proposta guarda, por foto: origem (loja e URL), motivo de escolha ou de descarte, e a ordem. O dono pode trocar a
  marcação antes de aprovar.
- Na aprovação, as marcadas viram as fotos do produto (as atuais que saírem vão para a **reserva**, nunca são apagadas) e
  as demais candidatas são apagadas.

### 4. Marca e modelo

- Varre título, descrição do Rise e fichas dos concorrentes. Marca de fabricante clara vira a marca (NEXTION,
  ESPRESSIF...); placas compatíveis com Arduino são **GENÉRICA**; sem marca ou em dúvida, **GENÉRICA**. Em MAIÚSCULAS;
  nome de loja nunca é marca (regra que a lupa já tem).
- Modelo pelo mesmo processo (NANO V3, NX4832T035). Sem modelo claro, **vazio** (escolha da sessão).
- Cada um com a frase de origem ("NEXTION aparece em 6 dos 8 concorrentes").

### 5. Unidade

- KIT **só** quando o produto é composição; **metro** quando título, descrição ou fornecedores mostram venda por
  comprimento (correia, cabo, perfil); **UN** no resto. Com a frase de origem.

### 6. Código

- Produto sem código: a proposta sugere o próximo da faixa 25xxxx pelo gerador do Rise (`gerarSku`, que pula códigos
  de kit). Produto com código: não mexe. O número só é reservado no Salvar do dono; o Rise recusa repetição.
- **Localização:** a sessão nunca mexe.

### 7. Preço

- Base: custo do **fornecedor padrão** (sem custo, não há sugestão e o relatório diz). Concorrentes pela regra de
  posição do Rise (`posicaoDePreco`: 1º é o mais barato, cada loja uma vez pelo menor preço normal, sem estoque fica
  de fora). Margem é a conta do Rise (`margem.js`: lucro líquido sobre o custo com os 6% de imposto já descontados).
- Saída: **3 opções** com 40%, 50% e 60% de margem, cada uma com o preço e a posição ("R$ 34,90 → 6º de 11"); mais a
  **recomendada**: a maior margem (percentual quebrado aceito) que ainda deixa o produto **entre os 5 primeiros**. Se
  nem 40% chega aos 5 primeiros, mostra as 3 e diz qual margem seria preciso.

### 8. Garantia

- Sempre **3 meses**.

### 9. GTIN / EAN

1. Junta todos os EANs dos concorrentes vinculados; descarta dígito verificador inválido e anota prefixo não
   brasileiro como sinal de baixa confiança.
2. Consulta cada um nos 3 sites do Rise (Cosmos, EAN-Search, Product-Search) e confere se a descrição bate com o
   produto; fica o que mais se aproxima.
3. Consulta o catálogo do Mercado Livre por GTIN (`GET /products/search?site_id=MLB&product_identifier=`, só leitura).
4. Sem resultado: pesquisa profunda na internet pelos mesmos EANs.
5. Nenhum coincide: repete a busca nos 3 sites e no ML **por palavras-chave do produto**; EAN achado assim entra como
   candidato e passa pela mesma conferência.
6. Nada confiável: **campo vazio**. EAN não se gera (é emitido pela GS1 ao dono da marca); no anúncio do ML o Rise já
   usa o motivo "não tem código de barras".
- A proposta guarda o escolhido com a origem e os descartados com o motivo. Um EAN já usado em outro produto do Rise é
  recusado no Salvar (regra de 09/10/2026), e a proposta avisa antes.

### 10. Peso e medidas

- Lidas das fichas e das descrições dos concorrentes pela regra do Rise (`medidas.js`). **Preferência pela Usinainfo**
  (decisão do dono em 19/10/2026): se ela está entre os concorrentes vinculados e publica a medida, é a dela que vale.
  Sem a Usinainfo (ou sem a medida nela), vence a **mais repetida** entre os demais concorrentes; empate, a do
  fabricante. Sempre com a origem. Campo já preenchido no produto vence a proposta.

### 10a. NCM e origem (decisão do dono em 19/10/2026)

- **NCM:** o da **Fortek**, quando ela é fornecedor vinculado e publica NCM para o produto. Sem a Fortek, o NCM de outro
  fornecedor vinculado; com vários fornecedores divergindo, o NCM **mais repetido** entre eles. Sem nenhum fornecedor
  com NCM, o campo fica como está e o relatório lista o que os concorrentes publicam (para o contador). Sempre com a
  origem ("Fortek, código 02-268").
- **Origem fiscal:** **2** (Estrangeira, adquirida no mercado interno) quando há fornecedor vinculado; sem fornecedor,
  **0** (Nacional). Campo já preenchido no produto vence a proposta.

### 11. Documentos técnicos

- Lista os datasheets e manuais que os concorrentes publicam (`documentos`), com link. Baixa para a proposta os PDFs
  de fabricante; o dono decide quais anexar.

### 12. Relatório final

Texto curto na proposta: o que foi feito, as divergências resolvidas, as dúvidas, o que ficou "?" ou vazio, estoque
mínimo e máximo em branco (o dono define), NCM dos concorrentes diferente do proposto (para o contador), fotos de
concorrentes (uso é decisão do dono).

## Onde mora a proposta

- **Banco:** tabela nova `PropostaDeProduto` (uma por produto, `produtoId` único, `onDelete: Cascade`), com os campos
  em JSON por seção (`titulos`, `fotos`, `descricao`, `campos`, `preco`, `ean`, `documentos`, `relatorio`), `criadaEm`,
  `atualizadaEm`, e a `versaoDoRoteiro`. Migration aditiva, sem tocar em `Produto`.
- **Disco:** `dados/produtos/<SKU>/proposta/` (fotos candidatas e documentos baixados), servida por
  `/api/arquivos/<sku>/proposta/<nome>` **com login** (não entra na lista pública do Caddy).
- **Toda leitura de foto do produto continua filtrando `papel: FOTO`** nas linhas de `ProdutoArquivo`; as candidatas
  não são linhas de `ProdutoArquivo`, então nada precisa mudar nas leituras de hoje.

## Como a tela mostra

- No cadastro do produto, um **quadro "Proposta"** no topo (só quando existe), no padrão visual do Rise: uma linha por
  seção com o resumo e o botão "Ver", e a ação principal **"Aplicar escolhidos ao formulário"**, que preenche os campos
  do formulário com o que está marcado (título escolhido, descrição, marca, modelo, unidade, preço, EAN, peso e
  medidas, fotos marcadas). **Nada é gravado até o Salvar.** O Conferido é a aprovação e apaga a proposta.
- A lista "Escolher o título" mostra as 3 opções da proposta com a tag IA e a recomendada em destaque.
- Na aba Imagens, as candidatas aparecem num bloco "Propostas (N)" com o check das escolhidas; "Aplicar" as leva para o
  painel como fotos validadas, na ordem da proposta.
- Detalhe de cada seção: as opções, as lojas, os links de origem, os descartados com motivo.

## O que a sessão roda (script)

`scripts/preencher-produto.js` ganha os comandos (todos pela entrada do SSH, como hoje):

- `proposta <sku> --plano=<json no contêiner>`: grava a proposta (cria ou substitui a seção informada) e os arquivos em
  `proposta/`. Recusa produto Conferido. Não mexe em `Produto` nem em `ProdutoArquivo`.
- `proposta <sku> --ler`: imprime a proposta.
- O `gravar` de hoje continua para o caso manual, e passa a recusar produto com proposta aberta (para não haver dois
  caminhos escrevendo no mesmo produto).

A ordem dos passos e as regras acima viram um **roteiro fixo** em `docs/superpowers/roteiros/proposta-de-produto.md`,
que a sessão segue a cada produto. Mudar critério é editar o roteiro, não o código.

## Aprovação e limpeza

- **Conferido ligado** (`ConferidoProduto`) apaga a proposta: a linha, a pasta `proposta/` inteira. Nada do que não foi
  aplicado sobrevive.
- Desligar o Conferido depois não recria nada.
- Proposta com mais de 30 dias sem Conferido: fica (é trabalho feito); o relatório da lista avisa (escolha da sessão;
  o dono pode pedir prazo).

## Decidido pelo dono (nesta conversa)

- Área própria e temporária no banco; apagar o que não foi usado na aprovação. Aprovação = Conferido.
- O título do produto não muda; 3 opções com tag IA e a recomendada, o dono escolhe.
- Fotos: todas as candidatas salvas, 6 a 8 escolhidas com check, e as regras do passo 3.
- Código só se faltar; localização nunca. Unidade KIT/metro/UN. Preço 40/50/60% com posição, recomendada entre os 5
  primeiros, percentual quebrado aceito, margem = a conta do Rise. Marca e modelo pela varredura, Arduino = GENÉRICA,
  dúvida = GENÉRICA. Garantia 3 meses. EAN pelos 5 passos, nunca inventar. Descrição primeiro, prompt indicado ou o
  padrão do Rise, "?" só depois de pesquisa profunda. Estoque mínimo e máximo são do dono (avisar se em branco).
  Peso e medidas: a Usinainfo primeiro; sem ela, a medida mais repetida nos concorrentes. NCM: a Fortek primeiro, depois
  outro fornecedor ou o NCM mais repetido entre os fornecedores. Origem fiscal: 2 com fornecedor, 0 sem.

## Escolhas da sessão (marcar no documento, o dono pode mudar)

- Modelo sem evidência fica vazio.
- CEST, SPED e percentual de tributos só comparados, nunca propostos (NCM e origem são do dono, passo 10a).
- Documentos: listar e baixar PDFs de fabricante; anexar é do dono.
- Catálogo do ML como 4º lugar de consulta do EAN.
- Fotos candidatas padronizadas 1024x1024 ao entrar na proposta.
- Proposta sem prazo de validade; aviso na lista depois de 30 dias.
- Tabela única com JSON por seção (em vez de uma tabela por seção): a proposta é temporária e lida inteira.

## O que fica para o construtor

- Formato exato dos JSONs de cada seção (manter os nomes das seções acima).
- Desenho do quadro "Proposta" e do bloco de candidatas na aba Imagens, pelas 10 regras do Padrão visual e com
  `frontend-design` + `ecc:make-interfaces-feel-better`.
- Testes: regras puras (preço/posição, escolha da recomendada, validação do plano), gravação e limpeza no Conferido,
  e o guarda de que nenhuma leitura de foto enxerga `proposta/`.
- Ordem de deploy: migration + script primeiro (a sessão já consegue propor), tela depois.
