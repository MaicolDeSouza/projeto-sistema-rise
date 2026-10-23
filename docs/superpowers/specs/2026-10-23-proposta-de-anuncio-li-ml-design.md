# Proposta automática de anúncio (Loja Integrada e Mercado Livre)

Data: 23/10/2026. Brainstorming de 22 e 23/10/2026 com o dono. Duas entregas no mesmo documento, a pedido dele
("2 juntas"): **Entrega 1, Loja Integrada**; **Entrega 2, Mercado Livre**.

## 1. Intenção

O dono quer criar os anúncios da LI e do ML "igual foi feito no produto do Rise (proposta)": ele pede no chat do
claude.ai ou do ChatGPT, a LLM monta a proposta pelo MCP com a IA dela (sem custo de API para o Rise), o Rise grava
a proposta no rascunho do anúncio, e ele revisa no editor de sempre e publica.

O processo que ele desenhou:

1. Rise Conferido e Bling verde (sem "!").
2. Ele pede a proposta. A LLM vê que o próximo passo é a LI, diz no chat o que vai fazer e monta a proposta da LI.
3. Ele revisa e sincroniza (o "P" da LI some).
4. Ele pede de novo. A LLM vê que o próximo é o ML, diz no chat e monta a proposta do ML.
5. Ele revisa e publica (o "P" do ML some).

A inteligência de "qual é o próximo passo" fica no Rise, não na LLM: trocar de LLM tem que dar o mesmo resultado
(a mesma regra do roteiro único da proposta de produto).

## 2. Objetivos, não objetivos e anti-objetivos

**Objetivos**
- Uma ferramenta no MCP que diz a situação do produto e o próximo passo.
- Proposta da LI: categorias (com as pais), marca e a Meta Tag Description do SEO.
- Proposta do ML: categoria, título, ficha técnica, catálogos de referência sugeridos e o preço.
- O preço do ML calculado pelo Rise (nunca pela LLM), com a regra de margem e de posição do dono.
- "P" no ícone do canal enquanto a proposta espera o dono.
- Botão "Gerar com IA" (IA paga do Rise) na lista da Meta Tag Description da LI, para uso dentro do Rise.

**Não objetivos**
- O Tag Title da LI não tem IA: é o nome do produto (decisão do dono).
- Sincronizar, Cadastrar ou Publicar automáticos. O envio é sempre o clique do dono.
- Premium no ML. É sempre um anúncio só, Clássico.
- Fotos, descrição e estoque do anúncio: já são sempre os do cadastro do produto, nos dois canais.

**Anti-objetivos** (falharia mesmo funcionando)
- A proposta chamar a IA paga do Rise.
- O Rise gravar sozinho catálogos no ranking. A proposta **sugere**, o dono adiciona (a mesma regra da RISE_ML:
  "o Rise sugere, o dono marca").
- Salvar no Rise os links achados quando não há catálogo. Eles vão só no relatório da proposta.
- A LLM decidir o preço. Ela manda os dados; a conta é do Rise.

## 3. Restrições

- Só leitura no ML e na LI durante a proposta. Nenhuma escrita em canal ou no Bling.
- Toda escrita da proposta é no rascunho do `Anuncio` do Rise.
- Produto tem de estar Conferido. Bling verde = `iconeBlingDoProduto` sem selo e já sincronizado.
- O `domain_discovery` do ML está parado desde 22/10/2026. A categoria vem pela reserva `categoriasPeloCatalogo`,
  que a `sugerirCategoria` já usa.
- Anúncio de outro vendedor fora de catálogo dá 403. Só se lê o que está dentro de `/products/{id}/items`.
- Regras do Rise que valem aqui: preço normal (nunca o promocional), preço de 5 em 5 centavos, texto da tela com
  acento, e o padrão visual das telas.

## 4. Abordagens consideradas

1. **Dentro do rascunho do próprio anúncio. ESCOLHIDA pelo dono.** A proposta preenche o rascunho do `Anuncio`
   (LI ou ML) e guarda em `Anuncio.dados.proposta` o relatório e quais campos foram propostos. Aproveita o editor e
   a regra de que nada vai à loja sem o clique do dono. **Custo aceito:** não há "descartar proposta" que volte ao
   rascunho de antes. Recusar é editar o rascunho.
2. **Proposta separada, tabela nova `PropostaDeAnuncio`.** Permitiria descartar tudo, mas custaria quase o dobro de
   código: banco novo e a lógica de "o que já foi aplicado" para dois editores.
3. **Só relatório.** Barata, mas não é automática.

`PropostaDeProduto` não serve: o Conferido apaga a proposta do produto, e a do anúncio só nasce depois do Conferido.

## 5. O que o dono decidiu

| Assunto | Decisão |
| --- | --- |
| Quem chama | O dono, pelo claude.ai ou pelo ChatGPT, pelo MCP |
| IA da proposta | A da própria LLM; nunca a paga do Rise |
| Ordem | LI antes do ML é só **ordem preferida**; aceita "pule a LI" |
| Aviso no chat | A LLM sempre diz o que vai fazer antes de fazer |
| "P" | No ícone do canal, até o Sincronizar ou o Publicar |
| LI | Categorias com as pais, marca, Meta Tag Description (130 a 160 caracteres) |
| Tag Title da LI | Nome do produto, sem IA |
| Botão de IA na description | IA paga, para uso dentro do Rise |
| ML | Um anúncio só, Clássico (`gold_special`) |
| Piso do preço ML | 30% de margem depois da comissão, do frete e do imposto de 6% |
| Alvo do preço ML | Entre os 5 primeiros do ranking dos 1ºs colocados dos catálogos |
| Preço escolhido | O maior que cumpre os dois, de 5 em 5 centavos |
| 30% fora do top 5 | Fica nos 30% e o relatório avisa |
| Catálogos | A LLM sugere até 10, cada um com 5 ou mais anúncios (total, não vendedores) |
| Menos de 5 catálogos | Segue igual |
| Catálogos no ranking | Só sugeridos; o dono adiciona |
| Sem catálogo | A LLM acha 5 links pelo navegador, o relatório traz os links e os preços, e o preço é calculado só para a proposta; nada é salvo no Rise |
| Onde mora | No rascunho do anúncio (abordagem 1) |

## 6. Parte comum às duas entregas

### 6.1 Ferramenta `situacaoDoProduto` (MCP, só leitura)

Entra na Entrega 1. Recebe o SKU e devolve:

```
{
  sku, nome,
  rise:  { conferido, propostaPendente },
  bling: { sincronizado, diferente: ["campos"|"estoque"], verde },
  li:    { anuncio: "nenhum"|"rascunho"|"sincronizado", propostaPendente, divergente },
  ml:    { anuncios: [{ id, tipo, status }], propostaPendente },
  proximoPasso: "proposta-do-produto" | "conferir-no-rise" | "sincronizar-bling" |
                "proposta-li" | "revisar-li" | "proposta-ml" | "revisar-ml" | "pronto",
  motivo: "texto curto para a LLM dizer no chat"
}
```

Regra do `proximoPasso`, na ordem:
1. Não Conferido com proposta do produto aberta → `conferir-no-rise`; sem proposta → `proposta-do-produto`.
2. Bling não verde → `sincronizar-bling`.
3. Proposta da LI pendente → `revisar-li`.
4. LI sem anúncio sincronizado → `proposta-li`.
5. Proposta do ML pendente → `revisar-ml`.
6. Nenhum anúncio ML publicado → `proposta-ml`.
7. Senão → `pronto`.

"Pule a LI" é pedido do dono na conversa: o roteiro manda a LLM seguir para o ML quando ele pedir, e o Rise aceita
a proposta do ML sem LI (seção 8.1).

A lógica fica numa função pura (`proximoPasso(situacao)`), testada sem banco.

### 6.2 Roteiros

Um roteiro por canal, no molde de `src/lib/proposta/roteiro.js`: `ROTEIRO_LI` e `ROTEIRO_ML`, cada um com a sua
versão. A ferramenta `roteiroDaProposta` ganha o argumento `canal` (`produto`, padrão; `li`; `ml`). O roteiro manda
a LLM: chamar `situacaoDoProduto`, dizer no chat o que vai fazer, ler, montar, gravar e mostrar o resumo.

Mudar regra = editar o roteiro, subir a versão e fazer deploy. A instrução do Projeto do claude.ai não muda.

### 6.3 Onde a proposta fica guardada

Em `Anuncio.dados.proposta`:

```
{
  versaoDoRoteiro: "1",
  criadaEm: ISO,
  campos: ["categorias", "marca", "seo.description"],   // o que a proposta preencheu
  sugestoes: { marca: "X", "seo.description": "..." },  // propostas para campos que já tinham valor
  relatorio: "texto em tópicos",
  // só no ML:
  catalogosSugeridos: [{ catalogoId, nome, total, primeiro: { preco, apelido } }],
  preco: { valor, margem, posicao, total, avisos: [] }
}
```

Sem migration: `dados` já é JSON.

**Regra de preenchimento**, a mesma do cadastro de produto:
- Campo vazio no rascunho recebe o valor e a marca âmbar "PROPOSTA" no editor. A marca some quando o dono edita.
- Campo já preenchido com outro valor fica como está. A sugestão vai em `sugestoes` e aparece no topo da lista do
  ícone do campo, com a etiqueta "Proposta".

**O "P"** aparece no ícone do canal na lista de Produtos enquanto `dados.proposta` existir. O texto do `title` é
"Proposta pronta, aguardando aprovação". O `dados.proposta` é apagado:
- na LI, no Sincronizar ou no Cadastrar que der certo;
- no ML, no Publicar que der certo.

Gravar a proposta de novo substitui a anterior.

### 6.4 Acesso

- Ação nova `acao.canaisDeVenda.proporAnuncio`, delegável. O Administrador já a tem.
- Exige também editar a tela do canal.
- No ML exige `dado.custo` (o preço usa o custo) e `dado.concorrentes` (o ranking).
- `situacaoDoProduto` exige ver Produtos.

### 6.5 Registro

As chamadas entram em `ChamadaMcp` como as da proposta de produto, e na Revisão do dia aparecem como "proposta",
sem contar como "sem anotação".

## 7. Entrega 1: Loja Integrada

### 7.1 Ferramentas no MCP

**`lerParaPropostaLI(sku)`**, só leitura. Devolve:
- o produto: nome, marca, modelo, descrição, NCM e categoria de referência, se houver;
- a árvore de categorias da LI ao vivo ("id: caminho", a mesma da IA de hoje em `li/categorias.js`);
- as marcas da LI;
- o SEO dos concorrentes salvos (`seoConcorrentes.js`);
- o rascunho atual da LI, se existir;
- os limites: description de 130 a 160 caracteres.

**`gravarPropostaLI(sku, { categorias, marca, seoDescription, relatorio })`**. O Rise:
- confere Conferido e Bling verde e recusa com o motivo;
- recusa id de categoria que não está na árvore e acrescenta as pais (`comAncestrais`);
- recusa a description fora de 130 a 160 caracteres;
- acha a marca pelo nome, sem caixa e sem acento; marca que não existe na loja vai assim mesmo (o Sincronizar já
  cria com `POST /marca`) e o relatório avisa;
- cria o rascunho da LI se não houver (`novoRascunhoLI`), aplica a regra de preenchimento e grava `dados.proposta`;
- devolve o que preencheu, o que virou sugestão e os avisos.

### 7.2 Tela

- **Lista de Produtos:** "P" no ícone da LI.
- **Editor da LI:**
  - marca "PROPOSTA" nos campos preenchidos (aba Categorias, a marca na aba Características, a Meta Tag
    Description na aba SEO);
  - as sugestões no topo da lista do ícone;
  - na aba Categorias, quando as categorias da proposta não entraram porque já havia outras, o bloco
    "Marcar estas" que a sugestão da IA já usa;
  - botão Relatório no topo, como no cadastro de produto.
- **Botão "Gerar com IA" na lista da Meta Tag Description** (IA paga, `gerarDescriptionsSeo`). O CLAUDE.md diz que
  ele existe, mas o print do dono mostra a lista sem ele. **O construtor confere** se falta no código ou só na
  versão da VPS, e corrige o que faltar.

### 7.3 Pronto quando

- `situacaoDoProduto` diz `proposta-li` para um produto Conferido, com Bling verde e sem LI.
- A LLM grava a proposta, o "P" aparece e o editor mostra as marcas.
- O dono sincroniza e o "P" some. Depois disso `situacaoDoProduto` diz `proposta-ml`.
- O botão "Gerar com IA" aparece na lista da description.

## 8. Entrega 2: Mercado Livre

### 8.1 Ferramentas no MCP

**`lerParaPropostaML(sku)`**, só leitura no ML. Devolve:
- o produto e o custo (fornecedor padrão ou rascunho do Bling);
- as categorias candidatas (`sugerirCategoria`, com a reserva pelo catálogo);
- os atributos da categoria mais provável (`lerCategoriaCompleta`); para outra categoria, a LLM chama
  `lerCategoriaML(categoriaId)`;
- os catálogos candidatos (`sugerirCatalogos`: os mais vendidos da categoria e a busca pelo título), cada um com o
  total de anúncios e o 1º colocado;
- os catálogos dos anúncios que o dono já tem (`catalogosDosMeusAnuncios`);
- as referências que o produto já tem.

**`gravarPropostaML(sku, { categoriaId, titulo, atributos, catalogos, linksSemCatalogo, relatorio })`**:
- `catalogos`: até 10 ids que a LLM escolheu;
- `linksSemCatalogo`: só quando não há catálogo, até 5 `{ url, titulo, preco }` que a LLM achou no navegador.

O Rise:
- confere Conferido e Bling verde (a LI não é exigida: "pule a LI" vale);
- confere que a categoria é folha, o título cabe no limite dela e os atributos passam em `problemasDosAtributos`;
  o GTIN e o motivo de "sem GTIN" ficam fora da LLM, como já é na ficha da fase 2;
- lê o 1º de cada catálogo (`lerPrimeiroDoCatalogo`) e o total (`resumoDoCatalogo`), e descarta o catálogo com menos
  de 5 anúncios, o sem anúncios e o que falhar;
- calcula o preço (8.2);
- cria ou atualiza o rascunho Clássico, aplica a regra de preenchimento e grava `dados.proposta` com os catálogos
  sugeridos e o preço;
- **não grava** referência nem link nenhum fora da proposta.

### 8.2 Preço

Entradas: o custo, as taxas do ML (comissão, tarifa fixa, frete do vendedor, imposto de 6%) e os preços do ranking.

- **Ranking:** o preço normal do 1º colocado de cada catálogo aceito, sem os do dono. Sem catálogo, os preços dos
  links que a LLM mandou.
- **Teto (top 5):** o 5º menor preço do ranking. Empate deixa o dono na frente (a regra de `montarRanking`).
  Com menos de 5 preços, o teto é o maior deles.
- **Piso (30%):** o menor preço de 5 em 5 centavos com margem de 30% ou mais, com as taxas relidas no próprio
  preço. A conta usa `precoPorMargemNoML`, que já repete a leitura até 4 voltas porque o frete muda em R$ 79.
- **Resultado:**
  - piso até o teto → o maior preço de 5 em 5 centavos até o teto com margem de 30% ou mais;
  - piso acima do teto → o piso, com o aviso "com 30% de margem o anúncio fica em Nº de M";
  - sem custo → sem preço, com o aviso;
  - ranking vazio → o piso, com o aviso "sem concorrente para comparar".

A margem é a mesma da calculadora do editor: lucro líquido sobre o preço, com as taxas.

Como a margem pode cair ao cruzar R$ 79 (o frete grátis passa a ser obrigatório), o Rise confere a margem no preço
escolhido, e não só no piso.

O relatório mostra a conta: custo, taxas, margem, posição e as duas pontas.

### 8.3 Tela

- **Lista de Produtos:** "P" no ícone do ML.
- **Editor do ML:**
  - marca "PROPOSTA" na categoria, no título, nos atributos e no preço;
  - na aba Preço e custos, o bloco do ranking ganha a seção "Sugeridos pela proposta": cada catálogo com o 1º
    colocado e o botão Adicionar (o mesmo de "Sugerir catálogos");
  - botão Relatório no topo, com os links quando não há catálogo.

### 8.4 Pronto quando

- `situacaoDoProduto` diz `proposta-ml` depois da LI sincronizada.
- A proposta cria o rascunho Clássico com categoria, título, ficha e preço.
- O preço cumpre a regra da seção 8.2 nos casos do teste.
- Os catálogos aparecem como sugeridos, e nada entra no ranking sozinho.
- O "P" some no Publicar.

## 9. O que fica para o construtor

Escolhas minhas, marcadas para o dono conferir:
- **Teto com menos de 5 concorrentes:** o maior preço entre eles.
- **Rascunho do ML que já existe:** a proposta atualiza o Clássico ainda não publicado do produto, se houver um.
  Senão, cria um novo. Nunca mexe em anúncio publicado.
- **Ação nova** `acao.canaisDeVenda.proporAnuncio`, separada da `acao.produtos.proporCadastro`.
- **Marca que não existe na LI** vai assim mesmo e o relatório avisa.

Livres para o construtor:
- nomes dos arquivos (sugestão: `src/lib/propostaDeAnuncio/` com `situacao.js`, `li.js`, `ml.js`, `preco.js`) e das
  funções puras;
- o formato exato do relatório;
- os testes: blocos novos em `teste:li-sync`, `teste:anuncios-ml` e `teste:mcp`, com a LI falsa e o ML falso.
  O preço vira uma função pura com casos de borda: menos de 5 preços, empate, cruzar R$ 79, sem custo e piso acima
  do teto.

## 10. Riscos

- O `domain_discovery` voltar com outro formato, ou a reserva pelo catálogo não achar categoria. A proposta grava
  sem categoria e o relatório diz.
- Ler 10 catálogos são umas 20 chamadas ao ML, que pode responder 429. O Rise para e grava o que leu, com o aviso.
- Links sem catálogo dependem da LLM achar preços certos, e o Rise não tem como conferir (o 403). O relatório diz
  que esses preços não foram conferidos.
