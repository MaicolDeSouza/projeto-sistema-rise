# Anúncio publicado do ML acompanha o produto: o "!" e o "Enviar mudanças ao ML"

Data: 24/10/2026. Etapas 2 e 3 do plano de gerenciar anúncios publicados (a etapa 1, Clonar, está pronta).

## Por quê

O dono mudou a descrição do 100107 depois de publicar e o ícone do ML não avisou nada. Hoje:

- o ícone do ML só ganha o "!" com erro de publicação (regra de 24/10/2026, `icone.js`);
- o anúncio publicado abre só para leitura, e o Salvar recusa;
- o editor já mostra a descrição e o estoque do produto de agora (`carregarAnuncioML` relê os dois), mas nada leva
  isso ao ML. O anúncio no ML fica com a descrição antiga, sem aviso.

O dono quer saber quando o anúncio ficou para trás e, com um clique, levar a mudança ao ML.

## O que o dono decidiu

1. **Só o que muda no CADASTRO DO PRODUTO vai para o anúncio publicado:** descrição, fotos, peso e medidas. O
   anúncio publicado continua só para leitura no Rise. Preço, título, ficha técnica, frete, categoria e tipo ficam
   como foram publicados.
2. **Fotos iguais às da Loja Integrada:** o anúncio passa a ter exatamente as fotos validadas do produto, na ordem do
   cadastro, com a principal na frente. Qualquer mudança nelas (trocar, tirar, pôr, reordenar) acende o "!".
3. **Abordagem A, a "impressão" do que foi enviado** (ver Abordagens).

## Objetivos

- O ícone do ML na lista de Produtos ganha o "!" quando um anúncio publicado (ativo ou pausado) está diferente do
  produto em descrição, fotos, peso ou medidas. O texto ao passar o mouse diz o quê ("publicado, desatualizado:
  descrição e fotos mudaram no produto").
- O editor do anúncio publicado mostra uma faixa no topo com o que mudou e o botão **"Enviar mudanças ao ML"**, que
  manda só aquilo. Deu certo: a faixa e o "!" somem. Deu errado: a faixa mostra o motivo do ML e o "!" fica.
- Desfazer a mudança no produto apaga o "!" sozinho (a comparação é de conteúdo, não de "mexeu").

## Fora (não-objetivos)

- Editar preço, título, ficha, frete ou categoria do anúncio publicado (o dono escolheu só o cadastro do produto).
- Estoque: já vai ao ML pelo Bling (vínculo).
- Enviar sozinho, sem clique. O envio é sempre pelo botão.
- Pausar, ativar ou encerrar pelo Rise.
- Mudar a Loja Integrada ou o Bling.

## Anti-objetivos (o que tornaria isso um fracasso mesmo funcionando)

- O "!" acender em anúncio que está igual (por diferença de formatação ou de ordem que o ML não vê): o dono passaria a
  ignorar o aviso.
- Um envio que falha no meio deixar o anúncio no ML pior do que estava (sem fotos, por exemplo).
- Chamar o ML para desenhar a lista de Produtos.

## Abordagens consideradas

- **A. Impressão do que foi enviado (ESCOLHIDA).** O anúncio guarda um resumo do que está no ML: o texto da
  descrição, a lista das fotos, o peso e as medidas. A lista compara com o produto de agora, só no banco, como o "!"
  do Bling e da LI. Rápido e certo; o "!" some ao desfazer. Custo: os anúncios publicados antes não têm resumo.
- B. Ler o anúncio no ML na hora: a lista não pode chamar o ML por produto, então o "!" só existiria dentro do editor.
- C. Marcar "mudou" ao salvar o produto: mudar e desfazer deixaria o "!" aceso, e mudanças por outro caminho (a
  proposta) passariam em branco.

## Como funciona

### A impressão (`dados.publicacao.enviado`)

Gravada no anúncio, dentro de `dados.publicacao` (JSON, sem migration):

```
enviado: {
  descricao: "<md5 do texto exato mandado ao ML>",
  fotos: ["<nome do arquivo>", ...],      // ProdutoArquivo.arquivo, na ordem mandada
  pacote: { alturaCm, larguraCm, comprimentoCm, pesoG } | null,
  em: "<ISO>"
}
```

- **Descrição:** o md5 do `plain_text` que vai ao ML (`montarDescricaoML(descricaoDoRise(...))`). Comparar o texto
  final, e não o campo do produto, faz o kit funcionar igual (a descrição do kit é a da peça principal com os "Itens
  inclusos" refeitos).
- **Fotos:** o nome do arquivo de cada foto validada (`papel: FOTO`) na ordem do cadastro. O arquivo de foto tem nome
  gerado (32 hexadecimais) e nunca se reutiliza: foto trocada = nome novo. Não precisa de hash.
- **Pacote:** os números que vão nos `SELLER_PACKAGE_*` (cm arredondados para cima, gramas), os mesmos de
  `atributosDaEmbalagem`.
- Cada parte é gravada **sozinha** quando o envio dela dá certo: um envio parcial deixa o "!" só no que faltou.

**Quando nasce:** no fim de um Publicar que deu certo (etapa "gravar"), com o que foi publicado, e a cada "Enviar
mudanças ao ML" que deu certo.

### O que é "o produto de agora" (`conteudoAtualDoAnuncio`, função pura)

- descrição: `descricaoDoRise` + `montarDescricaoML`, a mesma do Publicar;
- fotos: as validadas do produto principal, na ordem do cadastro (a principal primeiro), como a LI;
- pacote: o peso e as medidas do produto principal. A impressão guarda os números DO PRODUTO no momento do envio (e
  não os da aba Envio): se o dono ajustou o pacote na aba Envio ao publicar, o "!" não acende logo depois; acende
  só quando o peso ou as medidas do produto mudarem.
- **Anúncio de kit montado no editor (`dados.composicao`) acompanha só a descrição**: as fotos (juntadas das peças) e
  o peso e as medidas (somados e ajustados na aba Envio) são do anúncio, não de um produto.

### O Publicar passa a mandar as fotos do produto

Para o anúncio publicado ficar igual ao produto desde o início (decisão 2), o Publicar de anúncio simples manda todas
as fotos validadas do produto, na ordem, cortadas no máximo da categoria, como a LI desde 21/10/2026. A aba Imagens do
ML vira só leitura (mostra o que vai), como a da LI. Sem isso, um anúncio publicado com só parte das fotos nasceria com
o "!". O kit montado no editor continua com as fotos das peças, como hoje.

A diferença entre impressão e produto de agora sai de uma função pura (`mudancasDoAnuncio`) que devolve a lista de
partes que mudaram: `["descricao", "fotos", "pacote"]`.

### Ícone (`icone.js`)

- Novo estado `desatualizado`: algum anúncio PUBLICADO (ATIVA ou PAUSADA) com mudanças. Põe o "!" no ícone verde.
- O "!" de erro continua. O rótulo junta os dois casos ("com erro na publicação", "desatualizado: descrição e fotos
  mudaram no produto").
- A lista de Produtos (`produtos/page.jsx`) calcula as mudanças só para os produtos da página, com uma consulta das
  fotos desses produtos. Nada de ML.
- Clássico e Premium do mesmo produto: cada anúncio tem a própria impressão; o ícone acende se qualquer um estiver
  para trás.

### Anúncios publicados antes desta entrega

Não têm impressão. **Aparecem com o "!" e o texto "ainda não conferido com o produto"** até o primeiro envio, que
manda as três partes. São poucos (só os publicados pelo Rise), e o 100107 está entre eles, que é o caso do dono.

### Editor do anúncio publicado

- Continua só para leitura. Ganha a faixa âmbar no topo: "O produto mudou depois de publicar: descrição, fotos." (ou
  "Ainda não conferido com o produto") e o botão **"Enviar mudanças ao ML"**.
- A aba Imagens e a Prévia passam a mostrar as fotos do produto de agora (o que iria no envio).
- Sem mudanças, a faixa não aparece.
- O botão exige editar o canal do ML (`tela.canaisDeVenda.mercadoLivre`) e passa pela trava `ML_PUBLICACAO`
  (`ml.exigirEscrita(sku)`). Recusa vira o motivo em vermelho na faixa; o botão nunca some sem dizer por quê.
- Uma publicação ou envio por anúncio por vez (a mesma trava do Publicar).

### O envio (`enviarMudancasML`)

1. Lê o anúncio e as mudanças. Sem mudanças: nada a enviar.
2. `ml.exigirEscrita(sku)` antes da primeira escrita.
3. `GET /items/{id}`: encerrado (`closed`) recusa ("encerrado no ML: não dá para atualizar").
4. **Descrição:** `PUT /items/{id}/description` com `{ plain_text }`.
5. **Fotos:** sobe só as que o ML ainda não tem (mapa `publicacao.fotos`, arquivoId → id da foto no ML, já usado pelo
   Publicar), depois `PUT /items/{id}` com `{ pictures: [{ id }, ...] }` na ordem do produto, cortada no máximo da
   categoria (`max_pictures_per_item`). A lista nova vai inteira numa chamada: o anúncio nunca fica sem foto no meio.
6. **Pacote:** `PUT /items/{id}` com os `SELLER_PACKAGE_*` em `attributes`.
7. Cada parte que deu certo grava a sua parte da impressão (`gravarPublicacao`, com a linha travada). A primeira que
   falha para o envio; as seguintes não são tentadas.
8. Nenhuma escrita repete sozinha (`tentativas: 1`), como o Publicar.
9. Grava em `rascunho.imagens` as fotos enviadas, para a tela e o Clonar refletirem o que está no ML.

### O que NÃO foi medido no ML real (medir antes de liberar)

A conta é User Products. Nunca se mandou ao ML: `PUT /items/{id}/description` num item publicado, `PUT` de
`pictures` e `PUT` de `attributes` (SELLER_PACKAGE). **Antes do primeiro uso, um envio de teste num anúncio, com o
dono acompanhando**, medindo cada uma das três chamadas e o que muda no item (`last_updated`, título gerado,
moderação). O resultado entra neste documento e no CLAUDE.md. Se uma delas for recusada, aquela parte sai do envio e o
"!" dela vira só aviso (corrigir no painel do ML).

### Testes

- Puro: `mudancasDoAnuncio` (igual, cada parte mudada, ordem das fotos, desfazer, sem impressão, kit sem pacote),
  `estadoDoIconeML` com `desatualizado`, rótulo.
- ML falso (`scripts/lib/mlFalso.js`): `PUT /items/{id}/description`, `PUT /items/{id}` com `pictures` e com
  `attributes`, item encerrado, falha no meio (as partes anteriores ficam gravadas, as seguintes não).
- No `teste:anuncios-ml`.

## Ficou para quem constrói

- Onde mora o código do envio (`publicar.js` ou um `atualizar.js` novo) e o nome das ações.
- O desenho exato da faixa, seguindo o padrão visual (âmbar porque "o anúncio está diferente", uma linha, uma ação).

## Chamadas que eu fiz (o dono pode corrigir)

1. Anúncio de kit montado no editor acompanha só a descrição (fotos e pacote são do anúncio, não de um produto).
6. O Publicar de anúncio simples passa a mandar todas as fotos validadas do produto, e a aba Imagens do ML vira só
   leitura, como a da LI.
7. O pacote compara com o peso e as medidas DO PRODUTO, não com o que foi ajustado na aba Envio.
2. Anúncios publicados antes desta entrega aparecem com o "!" até o primeiro envio.
3. Produto com mais fotos do que a categoria aceita: vão as primeiras.
4. Envio parcial: o que deu certo fica gravado; o "!" continua só no que faltou.
5. O envio para na primeira parte que falha, sem tentar as seguintes.
