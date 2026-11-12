# Estoque em 3D: prateleiras, caixinhas e arrumação (estudo de 12/11/2026)

**Substitui o plano anterior do mesmo dia** (rua-prateleira-nível-posição, vínculo com quantidade): o dono mandou esquecê-lo
e partir da requisição abaixo e das duas fotos (estante de vãos com prateleiras; caixinha plástica tipo "bico", Magus).
Estudo de 12/11/2026. **Fase 1 implementada no mesmo dia, com uma mudança:** o lugar do produto continua sendo a `localizacao`
em texto (o mapa a lê), e não `prateleiraId`; ver a seção "Mapa do estoque (12/11/2026)" do CLAUDE.md.

## 1. O pedido do dono

- Tela com desenho interativo "tipo Minecraft" de todas as prateleiras e caixinhas, com a imagem do produto na caixinha;
  girar a visão e navegar entre os três estoques: **Estoque 1** (container inferior), **Estoque 2** (porão da casa) e
  **Estoque 3** (container superior).
- Caixinhas plásticas de várias medidas. Localização por letra + número: a letra é a **coluna**, o número é a
  **prateleira** (M1 = 1ª prateleira da coluna M). Cada coluna é um vão; cabem 4 ou 5 caixinhas por prateleira conforme o
  tamanho.
- Usar as medidas e os pesos que já estão no Rise para calcular quantas peças cabem em cada caixinha.
- Regras: os mais pesados embaixo; produtos parecidos separados, para ninguém pegar a peça errada.
- Ele pode mandar fotos e vídeos do estoque.

## 2. Decisões do brainstorming (12/11/2026)

1. **Parecidos nunca vizinhos:** a mesma categoria pode ficar na mesma coluna, mas dois produtos parecidos nunca ficam
   lado a lado nem um em cima do outro.
2. **Primeiro como está hoje, depois sugerir:** o desenho nasce da Localização atual; as regras apontam o que está fora e
   sugerem mudanças, feitas aos poucos.
3. **Peças por caixinha = estimativa que o dono corrige** (o número digitado vence o calculado).
4. **Uma caixinha por código**, com várias peças do mesmo produto. **Não coube: troca por uma caixinha MAIOR**, nunca uma
   segunda caixinha.

5. **Estoque 1 fica como está; Estoques 2 e 3 já nascem com as regras** (acréscimo do dono no mesmo dia): todas as peças
   estão hoje no Estoque 1, então toda a Localização atual é do Estoque 1. Ele é só desenhado; o Rise **não** gera lista de
   mudanças para ele, e uma peça só muda de lugar lá quando o dono precisar trocar aquele produto. Nos Estoques 2 e 3,
   todo produto que entra recebe o lugar sugerido pelas regras (caixinha certa, pesado embaixo, parecidos nunca vizinhos)
   e a tela recusa-avisa o que as quebra. `Estoque.aplicaRegras` (false no 1, true no 2 e no 3) guarda isso.
   Consequência: a sugestão de local deixa de ser a última fase; entra junto com os Estoques 2 e 3.

6. **A ordem das caixinhas do Estoque 1 vem das FOTOS do dono** (12/11/2026): ele manda fotos com a coluna, a linha e as
   caixinhas com os códigos; a sessão do Claude lê cada foto e grava `prateleiraId` + `ordemNaPrateleira` (e o modelo da
   caixinha, quando der para reconhecer), para o dono não posicionar à mão. Cada código lido é conferido com o Rise
   (existe? a Localização diz a mesma coluna/linha?); o ilegível ou divergente vai para uma lista de dúvidas, nunca
   chutado. Entra por um script de importação (`--simular` / `--confirmo`) com um arquivo por coluna. Medida de caixinha
   NÃO se tira de foto: vem do cadastro de modelos.

## 3. O que o Rise já tem (lido em 12/11/2026, banco do PC)

- `Produto.localizacao`: 1.218 de 1.320 ativos, no formato do dono ("T1", "R14", "M2"); também "CHAO", "X", "U", "V", "W"
  (sem número: a esclarecer). Vai para o Bling e continua indo.
- `Produto.pesoKg/alturaCm/larguraCm/comprimentoCm`: 902 com medida. **São as de envio** (embalagem; várias no mínimo do
  ML), então a conta de peças é estimativa.
- `Produto.estoque` (saldo único, do Bling), `estoqueMaximo` (1.155 preenchidos), `categoriasLI` (categoria da loja), fotos.
- Bloco Estoque: página de cartões só com Ordens de produção.

## 4. Modelo de dados proposto

- **Estoque** (3 linhas): nome, descrição, medidas internas do ambiente (para o chão e as paredes do desenho), ordem.
- **ColunaDeEstoque**: estoque, letra (única no sistema, porque a Localização não diz o estoque), largura, profundidade e
  altura do vão, e onde ela fica no ambiente (parede/posição x-z e para onde a frente aponta).
- **PrateleiraDeEstoque**: coluna, número, altura do piso da prateleira ao chão e altura livre até a de cima, peso máximo
  (opcional). O código "M2" = coluna M + prateleira 2. Qual número é a de baixo: pergunta aberta.
- **ModeloDeCaixinha**: nome, cor, largura, altura e profundidade externas, **fator de volume útil** (a caixinha é
  afunilada e tem a boca rebaixada; padrão 0,7), peso vazio.
- **No Produto**: `modeloCaixinhaId`, `pecasPorCaixinha` (digitado; vazio = usa a estimativa), `prateleiraId` e
  `ordemNaPrateleira` (da esquerda para a direita). A `localizacao` em texto passa a ser escrita a partir da prateleira
  (continua indo ao Bling igual).
- **HistoricoDeLocal**: produto, de → para, quando, quem (base de "o que mudou" e da lista de mudanças).
- Produto sem caixinha (chão, caixa grande): `prateleiraId` vazio e a localização em texto como hoje; o desenho mostra
  uma área "Fora das prateleiras" por estoque.

Uma caixinha por produto dispensa a tabela produto × posição com quantidade: a quantidade na caixinha é o
`Produto.estoque`.

## 5. As contas (funções puras, `src/lib/estoque3d/`)

- **Peças que cabem na caixinha** = `floor(volume da caixinha × fator útil ÷ volume da peça × folga)`, limitada a 0 quando
  uma dimensão da peça não passa em nenhuma rotação da caixinha (aqui a rotação é da PEÇA). Sem medida = "sem estimativa".
  `pecasPorCaixinha` digitado vence.
- **Caixinha certa para o produto** = o menor modelo em que cabe o `estoqueMaximo` (na falta, o estoque atual). É a
  regra "não coube, caixinha maior".
- **Caixinhas na prateleira** = por LARGURA, lado a lado (a boca fica para a frente, a caixinha não gira): soma das
  larguras ≤ largura do vão; altura da caixinha ≤ altura livre; profundidade ≤ a do vão. Sem empilhar na fase inicial.
- **Peso da caixinha cheia** = peso da peça × estoque (+ peso vazio).

## 6. Regras de arrumação (avisos primeiro, sugestão depois)

- **Pesado embaixo:** dentro da coluna, a caixinha mais pesada não fica acima de uma mais leve além de uma tolerância.
- **Parecidos nunca vizinhos:** vizinho = ao lado na mesma prateleira ou na mesma ordem na prateleira de cima/baixo.
  Parecido = mesma categoria (`categoriasLI`) E nome semelhante (trigramas, o índice que a busca já usa) ou mesmo modelo
  de caixinha com foto parecida fica para depois. O limiar é ajustável.
- **Não cabe:** estoque acima do que a caixinha comporta, ou caixinhas que somam mais que a largura do vão.
- A tela marca as violações (cor na caixinha + lista). A sugestão gera uma **lista de mudanças** ("120920: M2 → P4"),
  conferida e aplicada pelo dono, uma coluna por vez.

## 7. A tela

- **Estoque › Mapa do estoque**: seletor Estoque 1 / 2 / 3, cena 3D em blocos (Three.js, câmera que gira e aproxima,
  toque no celular). Estantes como na foto (montantes e prateleiras), caixinhas na cor do modelo, **foto do produto na
  frente da caixinha**, etiqueta com o código. Clique na caixinha: produto, estoque, quanto cabe, avisos e link para o
  cadastro. Busca por código/nome que voa até a caixinha e a destaca.
- **Vista de frente (2D) de cada coluna**, na mesma tela: é a ferramenta do dia a dia (achar, conferir, arrastar a
  caixinha para outra prateleira).
- Cadastro: abas Estoques e colunas, Modelos de caixinha. No Produto, bloco "Caixinha do estoque".
- Desempenho: ~1.300 caixinhas com instâncias; fotos em miniatura, carregadas só do estoque aberto.

## 8. O que o dono precisa passar

- Que letras ficam em cada estoque, na ordem em que estão na parede, e em que parede.
- Largura, profundidade e altura dos vãos; quantas prateleiras por coluna e a altura de cada uma; qual número é a de baixo.
- Os modelos de caixinha (nome/cor e as três medidas).
- O que são "CHAO", "X", "U", "V", "W".
- **Fotos** de cada estoque (ajudam no desenho). **Vídeo não é lido**; fotos e a tabela bastam.

## 9. Fases sugeridas

1. Estrutura (estoques, colunas, prateleiras, modelos), o Estoque 1 criado da Localização atual, mapa 3D + vista 2D
   só de leitura, com a estimativa de peças.
2. Estoques 2 e 3 com as regras: "Onde guardar este produto?" (sugestão de caixinha e de lugar), mover caixinha na tela,
   histórico e avisos. No Estoque 1, só o mover de um produto por vez, quando o dono pedir.
3. Lista de mudanças em lote (reorganizar uma coluna inteira), se o dono quiser um dia arrumar o Estoque 1.

## 10. Riscos

- Medidas de envio ≠ medidas da peça: a estimativa erra em peça miúda; por isso o número digitado vence.
- A Localização não diz a ordem das caixinhas na prateleira: a primeira vista põe em ordem de código, e o dono acerta.
- A separação de parecidos disputa espaço com o "pesado embaixo": a sugestão precisa de prioridade (peso primeiro).

## 11. Plano da fase 2 (12/11/2026, para aprovação do dono)

Fase 1 no ar (12.11.2026.110). Fase 2 = Estoques 2 e 3 com as regras, "Onde guardar", mover caixinha, avisos e a gravação da
ordem pelas fotos. Nada aqui exige as fotos; para a sugestão funcionar de verdade, o dono cadastra as colunas dos Estoques 2 e 3
e os modelos de caixinha (as abas já existem).

**Dado medido que muda o desenho da regra "parecidos":** só 100 dos 1.377 produtos ativos da VPS têm categoria da loja
(`categoriasLI`); 906 têm peso e 907 têm as três medidas. Categoria sozinha não separa nada: o parecido tem de vir do NOME.

1. **Regras puras** (`src/lib/estoque3d/arrumacao.js`, testadas sem banco):
   - **Parecido** = nome semelhante (trigramas, sem acento, sem palavras genéricas como "módulo", "kit", "para", "com"; limiar
     ajustável, começa em 0,45) OU mesma categoria da loja quando os dois têm. Ex.: "Motor de passo 28BYJ-48 5V" × "12V".
   - **Vizinho** = caixinha ao lado na mesma prateleira, ou na prateleira de cima/de baixo com sobreposição na largura.
   - **Pesado embaixo** = peso da caixinha cheia pelo Estoque máximo (peso da peça × máximo + caixinha vazia). Quebra a regra a
     caixinha que está ACIMA de outra da mesma coluna com menos da metade do peso dela e pelo menos 1 kg de diferença (ajustável).
   - **Cabe** = largura livre do vão, altura livre da prateleira e peso máximo da prateleira.
2. **"Onde guardar este produto?"** (`sugerirLugar`): escolhe a caixinha (menor modelo em que cabe o Estoque máximo), lista as
   prateleiras do estoque escolhido onde ela cabe, tira as que deixariam um parecido vizinho, e ordena: o pesado o mais baixo
   possível e o leve em cima, depois o que aproveita melhor o espaço. Devolve as 3 melhores com o motivo de cada uma. Só nos
   Estoques 2 e 3; no Estoque 1 só quando o dono pedir.
3. **Mover caixinha** (botão "Mover" no painel da caixinha e "Guardar em outro estoque" no cadastro do produto): janela com as 3
   sugestões e a escolha manual (estoque, coluna, prateleira, posição). Grava a `localizacao` ("K3"), a posição, a caixinha e uma
   linha em `HistoricoDeLocal`. A localização vai ao Bling pelo Sincronizar de sempre (o "!" do Bling acende). Mover para um lugar
   que quebra regra é permitido com o aviso.
4. **Avisos no mapa** (só Estoques 2 e 3): selo na caixinha (cor por tipo: parecido vizinho, pesado em cima, não cabe) e uma
   lista "Fora da regra" ao lado do mapa, com o "Mover" em cada linha. No Estoque 1 só aparece "não cabe no vão".
5. **Histórico**: no painel da caixinha, as últimas trocas de lugar (de, para, quem, quando).
6. **Ordem pelas fotos** (`scripts/ordem-pelas-fotos.js --simular | --confirmo`): a sessão lê as fotos e escreve um arquivo por
   coluna (prateleira → códigos da esquerda para a direita); o script confere cada código no Rise, compara com a Localização,
   grava `ordemNaPrateleira` e devolve a lista de dúvidas (código que não existe, localização diferente). Nunca muda a
   Localização sozinho.
7. **Acesso**: mover exige `tela.estoque.mapa` editar e `dado.localizacao` editar (o mesmo da edição rápida).
8. **Testes**: `teste:estoque3d` ganha as regras, a sugestão, o mover com histórico e o script das fotos.

Perguntas ao dono: (a) o código do produto tem família (ex.: 1002xx = mesmo tipo)? se tiver, entra como "parecido"; (b) mover
deve mandar a Localização ao Bling na hora, ou fica para o Sincronizar (recomendado)?
