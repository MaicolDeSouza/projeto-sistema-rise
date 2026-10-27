# Peças próprias e ordem de produção (26/10/2026)

Pedido do dono em 26/10/2026, com dois prints (a aba Fornecedores / Concorrentes do cadastro de Produto e a dica de
estoque do Bling, "Estoque do produto vazio · atual · mínimo · máximo").

## Intenção

Alguns produtos da 4hobby são montados ou fabricados pelo próprio dono, a partir de outros produtos do Rise e de
insumos que nem são produtos (parafuso, cola, mão de obra). Hoje o cadastro só sabe de fornecedores e o kit não aceita
item manual. O dono quer:

1. registrar as **peças próprias** de um produto e ver o **custo total** delas;
2. **dar baixa nas peças quando ele mandar** (o início da produção);
3. lançar o estoque do produto final **só depois da produção**, nunca antes.

## Objetivos

- Botão liga/desliga "Peças próprias" na aba Fornecedores / Concorrentes, à esquerda do estoque mínimo e máximo.
- Tabela de peças: foto, nome, código, custo, quantidade, localização, ícone de estoque, excluir; "Adicionar item"
  (produto do Rise por nome ou código, ou item manual com nome e custo digitados); custo total no fim.
- Ligado, as tabelas de fornecedores e concorrentes somem. Desligar com itens pede confirmação num popup.
- Ícone de estoque por peça, cores vermelha, amarela e verde, com a dica igual à do Bling.
- Ordem de produção em duas etapas: dar baixa nas peças; concluir lançando o produto final.

## Não objetivos

- Ordem de produção do Bling (abordagem C, descartada).
- Estoque de item manual (só custo).
- Produto com peças próprias dentro de outro produto com peças próprias (cascata de produção).
- Mão de obra calculada por hora, rendimento por lote, roteiro de fabricação.

## Anti-objetivos (falharia mesmo funcionando)

- Lançar estoque do produto final sem ordem concluída (pela lista, pelo cadastro ou pela ordem antes da hora).
- Ordem antiga mudar porque as peças do produto mudaram depois.
- Baixa pela metade: uma peça sem estoque e as outras já baixadas.
- Desligar o botão por engano e perder a lista sem aviso.

## Abordagens consideradas

- **A. Ordem em duas etapas (ESCOLHIDA pelo dono).** "Produzir" cria a ordem; "Dar baixa nas peças" tira as peças do
  Rise (e manda as saídas ao Bling); "Concluir produção" lança a entrada do produto final; "Cancelar" antes de concluir
  devolve as peças. Mesmo desenho do módulo Compras (lançar com movimentos de estoque, enviar ao Bling depois).
- B. Botão único "Produzir N": baixa e entrada no mesmo clique. Não separa a baixa do "lançar só depois de pronto".
- C. Ordem de produção do Bling: exige o produto cadastrado lá como fabricação com estrutura, linha manual não entra e a
  API nunca foi medida.

## O que o dono decidiu

- Opção 3 (custo + baixa), abordagem A.
- Aprovou a leitura e as propostas abaixo ("pode seguir assim").

## Desenho

### Banco (migration aditiva)

- `Produto.pecasProprias Boolean @default(false)`: o liga/desliga.
- `PecaPropriaDoProduto`: `id`, `produtoId` (Cascade), `ordem`, `componenteId String?` (produto do Rise, **Restrict**:
  peça usada não é excluída, como no kit), `descricao String?` e `custoManual Decimal?` (item manual), `quantidade`
  (decimal positivo, até 3 casas: insumo pode ser 0,5 m de fio). Regra: ou `componenteId`, ou `descricao` + `custoManual`.
- `OrdemDeProducao`: `id`, `numero` (`OP-0001`, sob trava como o `PC-0001` de Compras), `produtoId` (Restrict),
  `quantidadePlanejada Int`, `quantidadeProduzida Int?`, `situacao` (`ABERTA`, `EM_PRODUCAO`, `CONCLUIDA`, `CANCELADA`),
  `observacao`, `criadoEm`, `baixaEm`, `concluidaEm`, `canceladaEm`, `entradaMovimentoId` (único).
- `ItemDaOrdemDeProducao`: cópia das peças no momento da criação (`componenteId?`, `descricao`, `sku`, `custoUnitario`,
  `quantidadePorUnidade`, `quantidadeTotal`), e `saidaMovimentoId`/`devolucaoMovimentoId` (únicos) para as peças do Rise.

Quantidade total de uma peça do Rise = `quantidadePorUnidade × quantidadePlanejada`, **arredondada para cima** ao inteiro
(o estoque do Rise é inteiro). A ordem mostra o arredondamento.

### Regras puras (`src/lib/producao/regras.js`, sem imports)

- `custoDasPecas(pecas)`: soma de custo × quantidade; peça do Rise sem custo deixa o total **incompleto** (nunca soma
  parcial), como no kit.
- `corDoEstoque({ estoque, minimo })`: vermelho com estoque ≤ 0, amarelo abaixo do mínimo, verde no resto; sem mínimo,
  só vermelho/verde. Dica: "Estoque do produto vazio / abaixo do mínimo / ok", atual, mínimo, máximo.
- `validarPecas`, `quantidadesDaOrdem`, `faltasParaBaixa(itens, estoques)`, transições de situação.

### Custo do produto

Com `pecasProprias` ligado, o custo do produto é o custo total das peças. `custoDoProduto`
(`src/lib/canaisDeVenda/custo.js`) ganha a origem "peças próprias" **na frente** do fornecedor padrão, e quem monta o
objeto passa o custo calculado. Ficam lendo isso: a margem do cadastro e da lista, o ML, a foto mensal, os indicadores.
Total incompleto = sem custo (origem nula), com o aviso na aba.

### Cadastro de Produto (aba Fornecedores / Concorrentes)

- Liga/desliga "Peças próprias" à esquerda do estoque mínimo, com bolha "i". **Não aparece em kit** (`COMPOSICAO`), e um
  produto com peças próprias não vira kit.
- Ligado: as seções de fornecedores e concorrentes ficam montadas e escondidas (`hidden`, o padrão do projeto) e seus
  dados **não são apagados**: desligar as mostra de volta.
- Tabela `PecasProprias.jsx`. Busca de produto pelo molde da `Composicao.jsx`, mas aceita qualquer produto **simples**
  (kit e o próprio produto ficam fora; Conferido e Bling não são exigidos). Custo do produto do Rise = `custoDoProduto`
  dele (fornecedor padrão, rascunho do Bling, cadastro). Foto com `FotoComLupa`. Nome com link para a peça em outra aba.
- Item manual: linha com nome, custo e quantidade editáveis; foto, código, localização e ícone ficam com "—".
- Custo total embaixo; "incompleto" em âmbar quando faltar custo.
- Desligar com itens: popup padrão (`role="alertdialog"`, `propsDoFundo`) listando as peças, botões "Cancelar" (foco) e
  "Desligar e apagar" em vermelho. Confirmado, a lista some da tela; só o Salvar apaga no banco.
- Tudo só grava no Salvar do produto (campo oculto JSON, como fornecedores e composição). O rascunho automático do
  cadastro guarda o liga/desliga e as peças.
- Botão "Produzir" no topo da tabela (só produto salvo, com peças e quem pode criar ordem). Abre um popup com a
  quantidade; cria a ordem `ABERTA` e leva à tela da ordem.

### Ordem de produção (bloco Estoque)

- `/estoque/producao`: lista paginada (OP, produto, quantidade, situação, datas), filtro por situação.
- `/estoque/producao/[id]`: cabeçalho com a trilha da situação e a ação principal no extremo da linha (molde de
  Compras); tabela das peças copiadas com necessário × estoque atual e o ícone de cor; custo total da ordem.
- **Dar baixa nas peças** (`ABERTA` → `EM_PRODUCAO`): numa transação, trava as peças do Rise (`FOR UPDATE`), confere
  todas; faltando alguma, **recusa inteira** listando SKU, necessário e disponível. Senão uma SAÍDA por peça pelo
  `ajustarEstoqueNaTransacao` (motivo novo "Produção", observação `OP-0001`). Depois do commit, `enviarAjustesDeEstoque`
  de cada peça; recusa do Bling vira ajuste pendente com aviso âmbar e "Reenviar", como em Compras.
- **Concluir produção** (`EM_PRODUCAO` → `CONCLUIDA`): pede a quantidade produzida (1 até a planejada; a diferença é
  perda e fica registrada). ENTRADA no produto final (motivo "Produção"), enviada ao Bling depois.
- **Cancelar**: `ABERTA` cancela sem mexer em estoque; `EM_PRODUCAO` devolve as peças com ENTRADA (motivo "Produção
  cancelada"). Concluída não cancela.
- Ordem com a mesma trava de clique duplo de Compras (linha travada e situação relida depois da trava).
- Kit que usa uma peça baixada é recalculado na mesma transação (`recalcularKitsDasPecas`).

### Trava da entrada manual

Produto com `pecasProprias` ligado **não aceita ENTRADA** pela edição rápida da lista nem pelo popup do Bling
(`ajustarEstoqueNaTransacao` recusa com "A entrada deste produto vem da ordem de produção."). Saída e balanço
continuam. A ordem passa um parâmetro interno que libera a entrada dela.

### Acessos

- Tela `tela.estoque.producao` (ver lista; editar = criar ordem, dar baixa, concluir, cancelar).
- O custo na tabela de peças e na ordem exige `dado.custo` (sem ele, "[restrito]", e o Salvar não apaga custo manual).

## Calls que eu fiz (conferir)

1. Quantidade da peça com 3 casas decimais e arredondamento para cima na baixa.
2. Peça do Rise não precisa estar Conferida nem no Bling (só a saída ao Bling precisa do `blingId`; sem ele, fica
   pendente com aviso).
3. Fornecedores e concorrentes são **guardados** quando o botão liga, não apagados.
4. Produto com peças próprias sai da lista "abaixo do mínimo" de Compras (reposição é produção); as peças continuam nela.
5. O custo das peças **não vai ao Bling** nesta entrega (o Bling só guarda custo no vínculo de fornecedor).
6. Sem cascata: peça com peças próprias pode entrar, mas a ordem não produz a peça junto.
7. Ícone sem mínimo cadastrado: só vermelho (zero) ou verde.

## Fica com quem constrói

Nomes de componente e de função, a paginação da lista, os textos exatos das bolhas e o layout fino (passar pelas 10
regras do Padrão visual e pelo `make-interfaces-feel-better`).

## Testes

`npm run teste:producao` (Postgres, SEM rede, Bling falso): regras puras, gravação das peças no Salvar, custo do
produto, baixa recusada por falta, baixa e entrada com os movimentos, cancelamento devolvendo, clique duplo, trava da
entrada manual, kit recalculado. Conferir na tela no PC antes de entregar.
