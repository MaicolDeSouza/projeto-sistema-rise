# Anúncios do ML pelo lucro da loja (variantes por faixa, reaproveitar antigo, atacado)

Data: 08/11/2026. Estado: **aprovada pelo dono em 08/11/2026** (respostas na seção 9). Nada implementado ainda.

## 1. Intenção e porquê

O dono fechou em 08/11/2026 oito definições para os anúncios do Mercado Livre dos produtos NOVOS do Rise
(memória `regra-anuncios-por-produto-ml`). O fio condutor: **o preço de cada anúncio do ML sai do lucro em R$ que o
produto dá na loja**, e cada produto ganha o conjunto de anúncios que a faixa de preço pede (Clássico sem frete +
Clássico com frete grátis abaixo de R$ 79), aproveitando o anúncio que já existir e com preços de atacado ligados.

Hoje o Rise já: cria N anúncios do ML por produto (o par produto+canal não é único no ML, por causa dos kits), acende
o "!" quando o preço do rascunho muda (`PARTES_DO_ANUNCIO.preco`), calcula o preço do ML que repete o lucro da loja na
proposta (`precoDaPropostaML`), acha outros anúncios do mesmo SKU na conta (`outrosAnuncios.js`) e vincula/registra o
anúncio no Bling na loja Rise_ML (206326819). O que falta é ligar essas peças num fluxo com as regras do dono.

## 2. Objetivos, não-objetivos e anti-objetivos

**Objetivos**
1. Um botão na aba Preço do editor do ML que define o preço de venda deste anúncio mantendo o lucro da loja e
   respeitando as faixas; o valor fica editável (pedido do dono).
2. O "!" do anúncio publicado quando o dono muda o **preço** da loja, com o preço recalculado sugerido; o envio só
   pelo "Enviar mudanças" (aprovação dele).
3. Cada produto mostra quais variantes a faixa pede, quais existem e um clique para criar as que faltam.
4. Ao criar o primeiro anúncio de um produto: achar anúncio existente do SKU na conta (inclusive os antigos, fora
   do Rise), e **reaproveitar** mantendo tipo e frete, atualizando o que o ML deixa, e movendo o vínculo do Bling
   da loja ML_4h (203593931) para a Rise_ML (206326819).
5. Preços de atacado (PxQ B2B) em todo anúncio novo, ligados por padrão, faixas 2/5/10/20 com o desconto
   recomendado pela API do ML; valores editáveis.
6. Kit no ML: faixa pelo preço do anúncio do kit; lucro mantido = lucro da loja × quantidade.

**Não-objetivos**
- Mexer nos anúncios antigos existentes (só depois das amostras, decisão do dono). Os 20 pares antigos
  Rise×antigo ficam como estão (`pendencia-anuncios-duplicados-ml`).
- Criar Premium automaticamente (só acima de ~R$ 150, e por clone manual; o botão calcula o preço do tipo que o
  anúncio tiver).
- Reputação: o atacado não a altera (fonte oficial lida em 08/11); entra pela visibilidade a empresas.

**Anti-objetivos (seria fracasso)**
- Enviar preço ao ML sem o dono aprovar. Nunca: o "!" é aprovação, o "Enviar mudanças" é o envio.
- Apagar o vínculo antigo no Bling e não conseguir criar o novo (produto sem controle de estoque no ML).
- Dois anúncios com condições idênticas (política de duplicados do ML): as variantes diferem sempre no frete.

## 3. Restrições e fatos medidos

- Tarifa fixa abaixo de R$ 79 é por unidade; frete grátis é obrigatório a partir de R$ 79 (`LIMITE_DO_FRETE_GRATIS`).
- Preços medidos com o mesmo lucro (quatro.mjs, 08/11): R$ 18,90 → 27,99 com FG; 27,50 → 35,09; 45,90 → 53,49;
  72,90 → 78,89. Premium +4-5 pontos de comissão: fora do automático.
- Atacado: conta tem a tag `business`; 450 ativos, 1 com atacado (220204, faixas 5 un −4,59% e 10 un −8,08%);
  0 dos 62 do Rise. Recomendação para o 100101 (R$ 45,90): 2→0,82%, 5→5,5%, 10→9,86%, 20→12,27%. Só comprador
  com CNPJ vê. API: `POST /prices-per-quantity/v1/recommendations` (obrigatório antes de gravar; desconto gravado
  ≥ recomendado), `POST /items/{id}/prices/price-per-quantity` com header `X-Version` (409 se velha; a versão NÃO
  veio no `GET /items/{id}` nem nos headers lidos em 08/11: **medir no plano**), `GET /items/{id}/prices` com
  `show-all-prices: true`. `mlPost` hoje não aceita headers (só `mlGet`): ganha o 3º parâmetro `{ headers }`.
- Mover vínculo no Bling (ML_4h → Rise_ML): `DELETE /produtos/lojas/{id}` medido em 10/10/2026 só num item inativo.
- Catálogo com dois anúncios do mesmo vendedor: nunca medido. Medir (só leitura) no plano; se o ML recusar o 2º no
  catálogo, a variante com frete grátis nasce fora do catálogo e a tela avisa.
- Escrita no ML e no Bling continua atrás das travas (`ML_PUBLICACAO`, `exigirEscrita`).

## 4. Abordagens consideradas

**A. Variante = tipo + frete do próprio rascunho, conjunto esperado calculado na hora (recomendada).**
Nada novo no banco: a variante de um anúncio é `tipoAnuncio` + `envio.freteGratis` que ele já tem. Uma função pura
diz, pelo preço da loja, quais variantes o produto deve ter; a tela compara com os anúncios existentes. O preço de
cada variante sai de outra função pura (lucro + custo + taxas + frete). Troca: a regra fica em código (não
configurável na tela), mas é exatamente a que o dono fechou e muda pouco.

**B. "Plano de anúncios" por produto (entidade nova com as variantes desejadas e seus preços).** Mais flexível
(o dono poderia escolher variantes por produto), mas cria tabela, tela e sincronização a mais para uma regra que
hoje é uma só. Descartada por custo.

**C. Só o botão de preço, resto manual.** Não cumpre o reaproveitar, o "!" pelo preço da loja nem o atacado.
Descartada.

Escolhida: **A** (o dono: "pode seguir com a recomendada, mas os campos de valor no ML devem ficar abertos para edição").

## 5. Regras de negócio (as 8 definições, com os valores)

| # | Regra |
|---|---|
| 1 | Base = **lucro da loja em R$** = `precoVenda − custo` do produto (o `lucroLiquido` que a proposta do ML já usa). Kit: lucro × quantidade do kit. |
| 2 | "!" de preço só quando o dono muda o **preço** da loja. Custo que muda sozinho não acende nada. Envio só pelo "Enviar mudanças". |
| 3 | Vale para produtos novos. Nenhuma ação automática sobre anúncios antigos. |
| 4 | Ao criar anúncio: conferir se o SKU já tem anúncio na conta (Rise ou antigo). Se tem, reaproveitar: manter tipo e frete dele; atualizar título (só sem vendas), descrição, fotos, ficha, peso e medidas, preço (pelo lucro da loja); mover o vínculo do Bling para a Rise_ML. Depois criar as variantes que faltam. |
| 5 | Faixas pelo **preço sem frete do ML** (o que repete o lucro): < R$ 79 → Clássico sem frete + Clássico com frete grátis (o com frete grátis nunca abaixo de R$ 79, que é onde o frete grátis é obrigatório: piso de R$ 79 quando o preço pelo lucro fica abaixo); ≥ R$ 79 → um só, Clássico com frete grátis. Premium nunca automático. (Resposta do dono em 08/11: na faixa 72–79 também quer o Clássico sem frete; a regra "sobe para 79 sem 2º anúncio" caiu.) |
| 6 | Botão "Preço pelo lucro da loja" na aba Preço do editor: aplica a regra 5 a ESTE anúncio (tipo e frete dele); valores editáveis. |
| 7 | Kit: a faixa é decidida pelo preço do anúncio do kit; lucro mantido = lucro da loja × quantidade. |
| 8 | Atacado em todo anúncio novo, ligado por padrão: faixas 2, 5, 10 e 20 unidades com o % recomendado pelo ML; quantidades e % editáveis; desconto nunca abaixo do recomendado (o ML recusa). |

## 6. Como fica no Rise

### 6.1 Preço pela faixa (biblioteca, sem tela)

`src/lib/canaisDeVenda/ml/faixas.js` (novo, puro, testável):
- `variantesEsperadas(precoSemFrete)` → `["classico_sem_frete","classico_frete_gratis"]` abaixo de 79; `["classico_frete_gratis"]` de 79 em diante.
- `varianteDoRascunho(rascunho)` → a variante pelo `tipoAnuncio` + `envio.freteGratis` (Premium devolve `"premium_sem_frete"`/`"premium_frete_gratis"`, só para rotular).
- `precoPelaFaixa({ lucro, custo, variante, taxas, frete })` → o preço que repete o lucro, arredondado para cima em dezenas de centavos menos 1 (termina em ,X9), com frete grátis forçado a partir de 79; na variante com frete grátis o piso é R$ 79 (sem frete grátis abaixo disso não existe no ML: o frete grátis abaixo de 79 é o vendedor pagando o frete, e o preço pelo lucro já embute esse frete). `taxas`/`frete` são funções (preço → valores), para o laço de 3 voltas que o `quatro.mjs` já faz. **Nota:** abaixo de R$ 79 o frete grátis é custo do vendedor (`lerFreteDoVendedor` com `freteGratis: true`), e é isso que a variante com frete grátis repassa ao preço (18,90 → 27,99 medido); o piso de 79 só vale quando o preço calculado passa de 79 e o frete deixa de ser do vendedor.
- `NOME_DA_VARIANTE` para a tela ("Clássico sem frete", "Clássico com frete grátis").

`leitura.js` ganha `precoPelaFaixaNoML(cliente, rascunho, { lucro, custo })`, que lê taxas e frete do ML e chama `precoPelaFaixa` (mesmo molde de `precoPorMargemNoML`).

### 6.2 Botão na aba Preço do editor (`AbaPrecoEstoque.jsx`)

Ao lado da linha "Preço na loja (Lucro = …)": botão **"Preço pelo lucro da loja"**. Ao clicar, a ação `precoPelaFaixaMLAcao`
devolve `{ preco, variante, freteGratis, faixa }`; o editor preenche `preco` (editável) e, quando o preço calculado passa
de R$ 79 e o rascunho não tem frete grátis, marca `envio.freteGratis` (obrigatório no ML) e mostra em uma linha o porquê.
Kit: o lucro é `lucroDaLoja × quantidade` (a `composicao` do rascunho). Sem custo no produto: botão desligado com a
razão.

### 6.3 "!" pelo preço da loja (`acompanhar.js`, `atualizar.js`)

A impressão `enviado` do anúncio ganha `precoDaLoja` (o `precoVenda` do produto no momento do envio) e `lucroDaLoja`.
`mudancasDoAnuncio` ganha a parte **`precoDaLoja`**: acende quando `produto.precoVenda ≠ enviado.precoDaLoja`
(e só isso: custo não entra). Texto do "!": "Preço da loja mudou de R$ X para R$ Y". Anúncio publicado antes desta
mudança não tem `precoDaLoja` na impressão: não acende; passa a ter no próximo "Enviar mudanças" (regra 3).

No editor, com essa parte acesa, a aba Preço abre com a faixa "Preço da loja mudou de R$ X para R$ Y. Pelo lucro da
loja este anúncio fica em R$ Z" e o botão da 6.2. O dono ajusta ou aceita, Salvar, **Enviar mudanças** manda o preço
(PUT só de `price`, como hoje) e grava `precoDaLoja = Y` na impressão. Se ele mantiver o preço antigo e enviar, a
impressão também atualiza (ele aprovou manter).

### 6.4 Variantes do produto (lista de Produtos e lista do ML)

`anunciosMLDoProduto(produtoId)` devolve também `variantes: { esperadas, existentes, faltam }`, calculado com o preço
sem frete pelo lucro (uma leitura de taxas por produto, com cache de 1 h na `publicacao` do anúncio, para a lista não
chamar o ML a cada abertura). O popup "Anúncios do produto no ML" (já existe, aberto pelo ícone) ganha a linha
"Faltam: Clássico com frete grátis — [Criar]". Criar = `clonarRascunhoML` do anúncio existente com `envio.freteGratis`
invertido e preço pela 6.1, abrindo o editor (nada publicado sem o Publicar).

### 6.5 Reaproveitar anúncio existente (`src/lib/canaisDeVenda/ml/reaproveitar.js`, novo)

Gatilho: "Novo anúncio no ML" de um produto **sem** anúncio do ML no Rise. Antes de abrir o editor vazio, a ação
busca na conta (`/users/{eu}/items/search?seller_sku=SKU`, como `outrosAnunciosDoAnuncio`) e, se achar, abre o
popup **"Este produto já tem anúncio no Mercado Livre"** com a lista (MLB, título, tipo, frete, preço, vendas,
catálogo, estado) e dois botões por linha: **Reaproveitar** e **Ignorar e criar novo**.

Reaproveitar grava no Rise um `Anuncio` PUBLICADO ligado ao MLB (`idExterno`, `status`, `situacaoCanal`,
`temVendas = sold_quantity > 0`, `dados.tipoAnuncio`, `dados.envio.freteGratis`, `dados.preco`, categoria, título;
descrição, fotos, ficha, peso e medidas vêm do produto no Rise, como no rascunho inicial), com a impressão
`enviado` vazia (para TODAS as partes acenderem "!"), e abre o editor. O envio é o **"Enviar mudanças"** normal, que
passa a tratar: título (só se `temVendas` for falso; com vendas, pula e avisa), descrição, fotos, ficha, pacote,
prazo e preço (pelo lucro da loja, 6.2). Nada vai ao ML no clique de Reaproveitar.

Bling, dentro do "Enviar mudanças" desse anúncio reaproveitado, em duas etapas novas com confirmação no popup:
1. **Mover o vínculo**: ler `/produtos/lojas` do produto; se o MLB está na loja ML_4h (203593931), criar o vínculo
   na Rise_ML (`vincularNoBlingML`) e só depois apagar o antigo (`DELETE /produtos/lojas/{id}`); se a criação falhar,
   nada é apagado. Já na Rise_ML: pula.
2. **Registrar** em `/anuncios` (`registrarAnuncioNoBlingML`), como no Publicar.

Depois, o popup da 6.4 mostra o que falta e o dono cria a outra variante.

### 6.6 Preços de atacado

Rascunho ganha `atacado: { ligado: true, faixas: [{ quantidade: 2 }, { quantidade: 5 }, { quantidade: 10 }, { quantidade: 20 }] }`
(sem `percentual`: vem da recomendação na hora do envio). Anúncio gravado antes do campo abre com `ligado: false`
(regra 3).

Aba Preço, cartão **"Preços de atacado (Exclusivo negócios)"**: interruptor, quatro linhas quantidade/% editáveis,
e a nota "o % vem da recomendação do ML na publicação; abaixo do recomendado o ML recusa". Anúncio já publicado:
botão "Recomendação do ML" preenche os % (`POST /recommendations` com o preço do rascunho) e o dono pode subir.

Publicar: etapa nova **`atacado`** depois de `ativar` e antes de `gravar` (`ETAPAS`, `ROTULO_DA_ETAPA`:
"Enviar os preços de atacado"): recomendação → corpo `price_per_quantity[]` (`discount_percentage`,
`context_restrictions: ["channel_marketplace","user_type_business"]`, `min_purchase_unit`, `eligible: true`) →
`POST /items/{id}/prices/price-per-quantity` com `X-Version`. Falha no atacado NÃO derruba a publicação: avisa
e o anúncio fica publicado sem atacado (o "!" da parte `atacado` chama de volta). Item pausado por falta de estoque:
medir se o ML aceita; se não, a etapa fica para o worker junto com a ativação.

"Enviar mudanças": parte nova **`atacado`** em `PARTES_DO_ANUNCIO` (compara faixas/% do rascunho com os enviados);
desligar envia `[]`. Leitura de volta (`GET /items/{id}/prices`, `show-all-prices`) confirma e grava na impressão.
`mlPost(caminho, corpo, { headers })`.

### 6.7 Kit

Tudo acima vale para o anúncio de kit: o lucro passa a ser `lucroDaLoja × quantidade` (6.2), a faixa olha o preço
do anúncio do kit (regra 7), o atacado também entra.

### 6.8 Lucro por unidade do kit no ML (pedido do dono em 08/11/2026)

Na aba Preço do kit, a linha "Preço no ML (UN)" mostra só o preço (R$ 5,99 no 192002) e a linha "Preço na loja (UN)" já
traz "(Lucro = R$ 2,11)". A linha do ML ganha o mesmo parêntese: o lucro do anúncio no ML (`custosDoAnuncio().lucro`, o
R$ 15,37 que a calculadora já mostra) dividido pelas unidades do kit, em vermelho quando negativo. Só com acesso a custos
e com as taxas lidas; sem elas, só o preço. É o par que compara as duas lojas por unidade.

## 7. Testes

- `scripts/teste-anuncios-ml.js` (já existe) ganha os casos puros: `variantesEsperadas` (78,99 → 2; 79 → 1),
  `precoPelaFaixa` (os 4 preços medidos: 18,90/27,50/45,90/72,90 com as taxas gravadas como fixture; 72,90 com FG →
  78,89; piso 79 quando o cálculo passa de 79; kit × quantidade), `mudancasDoAnuncio` (preço da loja muda → `precoDaLoja`; custo muda → nada; impressão sem
  `precoDaLoja` → nada), corpo do atacado (faixas, % ≥ recomendado, desligado → `[]`), `varianteDoRascunho`, o lucro por
  unidade do kit no ML (15,37 / 10 = 1,54; negativo em vermelho; sem taxas, nada).
- Medições só leitura na VPS antes do plano fechar: (a) de onde vem a versão do item para o `X-Version`; (b) se um
  2º anúncio do mesmo vendedor entra no mesmo catálogo (validador, sem criar); (c) se a recomendação responde para item
  pausado.
- Primeiro uso real (depois do deploy, com o "sobe" do dono): 1 produto novo abaixo de R$ 72 (duas variantes +
  atacado) e 1 reaproveitado; conferir no ML e no Bling (vínculo na Rise_ML, registro em /anuncios).

## 8. O que fica para o construtor

Nomes de componentes do cartão de atacado e do popup de reaproveitar (seguindo o Padrão visual e as abas atuais);
cache da leitura de taxas na 6.4; texto exato dos avisos; onde a impressão guarda os valores do atacado enviados.

## 9. Respostas do dono (08/11/2026, spec APROVADA)

1. Reaproveitar: o "Enviar mudanças" troca descrição, fotos e ficha de uma vez pelos do Rise (título só sem vendas).
2. Mover o vínculo no Bling: o popup pergunta a cada anúncio, mostrando o vínculo que sai; o novo é criado antes.
3. Faixa R$ 72–78,99: **também** o Clássico sem frete (dois anúncios até R$ 78,99). Regra 5 e 6.1 já refletem.
