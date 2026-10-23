# Ranking de preços pelos catálogos de referência do ML — desenho

Data: 23/10/2026. Pedido do dono: "Permitir que o rise escolha varias categorias e o worker pega apenas o primeiro
anuncio do catalogo (que é o melhor posicionado) e monte um ranking dos preços dos concorrentes e me informe em que
posição estou." Escolhas do dono: **Opção 1** (o catálogo do anúncio continua completo; os catálogos de referência
guardam só o 1º) e **Opção B** (o Publicar NÃO coloca o anúncio no catálogo; a adesão continua pelo painel do ML).

Continua a feature "Concorrentes no Mercado Livre pelo catálogo" (spec `2026-10-21-concorrentes-ml-catalogo-design.md`)
e substitui a pendência "vários catálogos, uma lista por catálogo".

## 1. Por quê

A busca livre do ML (`/sites/MLB/search?q=`) responde 403 à aplicação (medido em 21/10 e de novo em 23/10/2026,
relatório de viabilidade). O que a API oficial deixa ver de concorrentes é o catálogo. O 1º colocado de cada catálogo
é quem leva a venda daquela página; juntar os 1ºs de catálogos parecidos (Mega 2560 genérico, com cabo, CH340,
original) mostra a faixa de preço que o comprador está aceitando, e o dono quer saber onde o preço dele cai nela.

## 2. Objetivos, não objetivos, anti-objetivos

**Objetivos**
- O dono marca, por produto, até **10 catálogos de referência** além do catálogo do anúncio (`Produto.mlCatalogoId`).
- O worker relê, uma vez por dia (mesma rodada de hoje), o **1º anúncio** de cada catálogo de referência e guarda o
  histórico quando o 1º ou o preço dele mudam.
- Na aba **Preço e custos**, um **ranking**: o 1º de cada catálogo (o do anúncio e os de referência) mais o preço deste
  anúncio, do mais barato ao mais caro, com a frase **"Você está em Nº de M"** e a diferença em R$ e % para o mais
  barato e para a média dos 1ºs.
- A posição muda na hora conforme o dono digita o preço (como o selo "Nº X de M no ML" de hoje).
- Na lista de anúncios do ML, a coluna Concorrência ganha o "Nº de M no ranking" de cada anúncio.

**Não objetivos**
- Colocar o anúncio no catálogo pelo Publicar (Opção B).
- Ler mais que o 1º dos catálogos de referência.
- Avisos novos no sino ou no Telegram sobre o ranking (fica para depois, se o dono pedir).
- Gráfico do histórico do ranking (o histórico é gravado já, a tela fica para depois).

**Anti-objetivos**
- Scraping ou qualquer chamada fora da API oficial (Termos 7.6).
- Mudar o que o catálogo do anúncio faz hoje (top 10, posição real, avisos, coluna Concorrência).
- Escolher catálogos sozinho: o Rise sugere, o dono marca. Catálogos diferentes são produtos diferentes (kit × placa
  avulsa) e só ele sabe o que é comparável.

## 3. Abordagens consideradas

1. **Catálogo do anúncio completo + referências só com o 1º (escolhida pelo dono).** Mantém tudo o que existe e
   acrescenta o ranking com uma consulta por catálogo de referência.
2. Só o 1º de todos os catálogos, inclusive o do anúncio. Mais simples, mas perde a lista dos 10, a posição real e os
   avisos de hoje.
3. Top 10 de todos os catálogos. Visão mais rica, mais consultas e uma lista grande e misturada.

## 4. Desenho

### 4.1 Dados (migration nova, só tabelas novas; nada muda nas existentes)

`CatalogoReferenciaML` — um catálogo de referência de um produto, com o último 1º lido:
- `produtoId` (cascade), `catalogoId`, `nome` (o nome do produto de catálogo, gravado ao adicionar), `criadoEm`;
- o 1º lido: `itemId`, `vendedorId`, `vendedorApelido`, `vendedorReputacao`, `preco`, `precoCheio`, `freteGratis`,
  `logistica`, `tipoAnuncio`, `totalNoCatalogo`, `lidoEm`;
- `semAnuncios` (o catálogo não tem ofertas), `erro` + `erroEm` (a última releitura falhou; os dados lidos antes ficam);
- `@@unique([produtoId, catalogoId])`, `@@index([produtoId])`.

`CatalogoReferenciaMLHistorico` — linha nova só quando o 1º (item) ou o preço/preço cheio mudam: `referenciaId`
(cascade), `itemId`, `vendedorId`, `preco`, `precoCheio`, `lidoEm`.

O catálogo do anúncio continua em `Produto.mlCatalogoId`; o 1º dele vem do que já é lido hoje (`ConcorrenteML` de
posição 1 ou o próprio anúncio do dono na `PosicaoML`). O mesmo catálogo não pode ser referência e do anúncio ao mesmo
tempo (a tela recusa).

As referências são **do produto**, como o catálogo do anúncio: valem para todos os anúncios ML dele (Clássico e
Premium). A posição no ranking é **do anúncio**, porque depende do preço de cada um.

### 4.2 Leitura (só GET)

- `lerPrimeiroDoCatalogo(cliente, catalogoId, { meuSellerId })` em `catalogo.js`: `/products/{id}/items` com uma página
  curta, devolve o 1º na ordem do ML com os mesmos campos que `lerConcorrentesDoCatalogo` já extrai, mais o
  `paging.total`. 404 = catálogo sem ofertas (`semAnuncios`). Se o 1º for do dono, marca `meu: true`.
- **Medir no início da implementação** (uma consulta, no catálogo do 100101): se o `buy_box_winner` de
  `/products/{id}` aponta o mesmo item que o 1º de `/products/{id}/items`. Se divergir, vale o `buy_box_winner` (é o
  que a doc oficial chama de ganhador) e o registro da medição vai para o CLAUDE.md.
- Vendedor (apelido, reputação) pelo `lerVendedores` existente, com o cache de 24 h.

### 4.3 Rodada do worker

`relerConcorrentesML` (uma vez por dia de São Paulo, já existente) passa a reler também as referências de cada produto,
depois do catálogo do anúncio, com a mesma pausa entre chamadas. Produto com referências e sem catálogo do anúncio
também entra na rodada. 429 ou 401 param a rodada como hoje; outro erro grava `erro` naquela referência e segue.
Botão **"Reler agora"** relê catálogo do anúncio e referências do produto.

### 4.4 Ranking (função pura, em `src/lib/canaisDeVenda/ml/ranking.js`)

`montarRanking({ preco, catalogoDoAnuncio, referencias })`:
- uma linha por catálogo com 1º lido (o do anúncio e cada referência), mais a linha **"Você"** com o preço do anúncio;
- se o 1º de algum catálogo é o próprio dono, essa linha vira a linha "Você" (não conta duas vezes);
- ordem por preço crescente; empate de preço deixa o dono na frente;
- catálogos sem anúncios ou nunca lidos ficam fora da contagem, listados no fim em cinza;
- devolve `posicao`, `total`, `maisBarato`, `media`, `diferencaParaMaisBarato` (R$ e %), `diferencaParaMedia`;
- sem preço digitado: ranking sem a linha "Você" e sem a frase.

### 4.5 Tela

Na aba **Preço e custos**, novo bloco **"Ranking dos catálogos"** abaixo do bloco de concorrentes:
- topo: **"Você está em 3º de 8"** em destaque, e "R$ 4,10 (6%) acima do mais barato · R$ 2,00 abaixo da média";
- tabela: posição, catálogo (nome), vencedor (apelido com link do perfil, ícone com link do anúncio), preço (riscado o
  cheio quando houver), frete grátis / Full, "lido em"; a linha "Você" destacada;
- rótulo fixo: "1º colocado de cada catálogo, não o menor preço do ML";
- "Catálogos de referência": lista com remover (com confirmação; apaga a referência e o histórico) e **"Adicionar
  catálogo"**: busca pelo nome (pré-preenchido com o título do produto, reaproveita `buscarCatalogos`) ou link/ID colado
  (`MLB12345678` ou URL `/p/MLB...`); mostra nome, nº de vendedores e o 1º antes de confirmar; o adicionado é lido na
  hora;
- referência com erro ou leitura com mais de 2 dias: aviso discreto na linha.

Na lista de anúncios do ML, coluna Concorrência: "Nº de M" (ranking) ao lado dos avisos de hoje, calculado na tela com o
preço do anúncio.

Acessos: o mesmo recurso que hoje libera ver e alterar os concorrentes do ML.

## 5. Testes (no `teste:anuncios-ml`, com o ML falso)

- `montarRanking`: ordem, posição do dono, empate, dono vencedor de um catálogo (sem contar duas vezes), catálogos sem
  anúncios fora da conta, sem preço, média e diferenças.
- `lerPrimeiroDoCatalogo`: 1º, 404 = sem anúncios, 1º do dono marcado.
- Rodada: grava o 1º, histórico só quando muda, erro numa referência não derruba a rodada, 429 para a rodada.
- Ações: adicionar (recusa duplicado, recusa o catálogo do anúncio, recusa a 11ª), remover.

## 6. O que fica para o construtor

Nomes internos, o tamanho exato da página curta, o visual fino do bloco (seguindo o Padrão visual do CLAUDE.md), e a
ordem das tarefas do plano.

## 7. Riscos

- O 1º de `/products/{id}/items` pode não ser o ganhador em todos os casos (medição do 4.2).
- Mudança de schema: só uma sessão mexe no schema por vez (regra do CLAUDE.md).
- Volume: até 10 referências × produtos acompanhados por dia; com a pausa atual e o cache de vendedor, fica dentro do
  que a rodada já faz.
