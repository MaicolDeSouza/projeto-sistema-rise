# Proposta direto no formulário: plano

> Execução inline (pedido do dono: sem subagentes), tarefa por tarefa, com commit a cada uma. Passos com checkbox.
> Substitui o quadro "Proposta" do cadastro (plano de 19/10/2026, `2026-10-19-proposta-automatica-de-produto.md`).

**Objetivo:** o quadro "Proposta" sai do cadastro do produto. A proposta passa a preencher o formulário sozinha (campo vazio
recebe o valor com a marca "PROPOSTA"; campo já preenchido recebe o valor da proposta no topo da lista do ícone), o
Relatório vira um botão ao lado do Cancelar com o selo "Proposta", os documentos da proposta aparecem na aba Documentos
técnicos e o ícone R da lista de Produtos ganha um "P" quando a proposta está pronta.

**Pedido do dono (22/10/2026), com os prints:** "remover essa tela, deixar apenas o relatório na seta indicada e um
informativo ao lado indicando que o produto ainda é uma proposta. os campos que a proposta propõe já devem ser
preenchidos automaticamente, mas indicar que é dado da proposta. caso o campo já esteja preenchido a proposta deve ir
para a lista junto dos concorrentes e sinalizar que aquele dado vem da proposta [...] a descrição pode alterar direto, os
documentos selecionados pela proposta devem ser sinalizados na aba de documentos. as fotos manter como está [...]". E:
"quando a proposta está pronta deve ficar um 'p' no canto superior esquerdo do ícone do R e ao passar o mouse informar
que Proposta pronta, aguardando aprovação".

**Decisões do dono (A, B, C, D = 1, 1, 1, 1):**
- **A.** O preenchimento automático conta como alteração (rodapé "não salvo"; sair pergunta "Sair sem salvar?").
- **B.** O Conferido só pergunta se algum campo que a proposta preencheria ainda está VAZIO no produto salvo (o que só
  foi para a lista vale como decidido). As fotos continuam perguntando como hoje.
- **C.** Garantia, unidade, origem e código ganham o mesmo ícone de lista, só com o item da proposta, quando já estão
  preenchidos com outro valor.
- **D.** A descrição da proposta substitui a do campo direto; o Cancelar desfaz.

**Sem mudança no banco.** Fora: fotos (a aba Imagens e o botão "Proposta (N)" ficam como estão), MCP, roteiro.

## Arquivos

- `src/lib/proposta/aplicar.js`: a regra pura `propostaNoFormulario` (o que preenche, o que vai para a lista).
- `src/lib/proposta/aplicadas.js`: `secoesNaoAplicadas` com a regra B.
- `src/components/produtos/FormularioProduto.jsx`: preenchimento ao abrir, marca "PROPOSTA", item da proposta nas listas,
  topo com Relatório + selo, seção "Da proposta" nos documentos; ícone de lista nos 4 campos novos.
- `src/components/produtos/QuadroDaProposta.jsx`: vira só a janela do Relatório (`RelatorioDaProposta`); o quadro sai.
- `src/components/produtos/ConferidoProduto.jsx` e `src/app/produtos/page.jsx`: o "P" no ícone R.
- `scripts/teste-proposta.js`: testes das regras puras e da regra B.

## Tarefa 1: a regra pura

- [ ] `propostaNoFormulario(secoes, produto)` em `aplicar.js` devolve
  `{ preencher: { [campo]: valor }, nasListas: { [campo]: { valor, origem, rotulo } }, secoes: string[] }`:
  - descrição: sempre em `preencher` (D);
  - título: nunca preenche (o título do produto não muda pela proposta); as 3 opções seguem na lista "Escolher o título";
  - preço (a recomendada), EAN (o escolhido) e cada item de `campos`: campo vazio no produto → `preencher`; preenchido com
    outro valor → `nasListas`; igual → nada. O código só com o produto sem SKU (regra de hoje).
  - `secoes` = as que puseram algo em `preencher` (vão no `propostaAplicada` do Salvar).
- [ ] Testes em `teste-proposta.js`: campo vazio preenche; preenchido vai para a lista com a origem; igual não aparece;
  descrição sempre preenche; título nunca; código só sem SKU; seção sem nada não entra em `secoes`.
- [ ] `npm run teste:proposta` e commit.

## Tarefa 2: preencher ao abrir e a marca "PROPOSTA"

- [ ] No `FormularioProduto`, com `acessos.editar` e `produto.proposta`, ao montar: `aplicar(preencher)` e
  `propostaAplicada = secoes`, marcando o formulário como alterado (A). Com aviso de rascunho automático pendente, espera
  o Recuperar/Descartar (o rascunho recuperado já traz o preenchimento de antes) e aplica só depois do Descartar.
- [ ] Estado `valoresDaProposta` (campo → valor preenchido). Embaixo de cada campo, a marca âmbar "PROPOSTA" enquanto o
  valor do campo for igual ao da proposta (lido no `input`); editou, some. Na aba Descrição, a mesma marca no título da aba.
- [ ] Conferir na tela no `100103-teste` do PC: campos vazios preenchidos com a marca, rodapé "não salvo", Cancelar desfaz.
- [ ] Commit.

## Tarefa 3: o item da proposta nas listas

- [ ] `CampoDeReferencias`, `CampoPreco` (o "$") e a lista de EAN recebem `daProposta = { valor, origem }` e o mostram
  NO TOPO com a etiqueta "Proposta"; o contador conta o item. O ícone aparece mesmo sem referência marcada.
- [ ] Preço: "R$ 39,40 (46% margem) · 5º de 9 · Proposta".
- [ ] Garantia, unidade, origem e código: o mesmo ícone de lista, só quando há `nasListas` para eles (C).
- [ ] Conferir na tela (produto com os campos preenchidos) e commit.

## Tarefa 4: o topo e os documentos

- [ ] O quadro "Proposta" sai. Ao lado do Cancelar: o selo âmbar "Proposta" (bolha "i": "Este produto ainda é uma
  proposta: confira os campos marcados e salve; marcar Conferido aprova e apaga a proposta") e o botão "Relatório", que
  abre a mesma janela do relatório em tópicos de hoje (extraída para `RelatorioDaProposta`).
- [ ] Aba Descrição: o OLHO de hoje fica (pedido do dono em 22/10/2026: "é bem útil para entender de onde foram retirados
  os dados"). Ao lado da marca "PROPOSTA", o mesmo botão de olho abre a mesma janela "Ver" da seção descrição (as
  divergências com as lojas e a escolhida, as linhas pesquisadas com a fonte, os "?"), extraída do `QuadroDaProposta`.
- [ ] Aba Documentos técnicos: seção "Da proposta" com cada documento (título, loja, link em outra aba) e o aviso
  vermelho nos que não abrem. Sem baixar nada (baixar pede o "pode" do dono).
- [ ] Conferir na tela e commit.

## Tarefa 5: o Conferido (B)

- [ ] `secoesNaoAplicadas`: preço, EAN e campos só ficam pendentes se o campo do produto SALVO ainda está vazio e a
  proposta tem valor; descrição pendente se a salva difere da proposta; título nunca; fotos como hoje.
- [ ] Testes em `teste-proposta.js` e commit.

## Tarefa 6: o "P" no ícone R

- [ ] `produtos/page.jsx` lê, numa consulta, quais produtos da página têm proposta PRONTA (a seção `relatorio`
  gravada, a última do roteiro) e passa `propostaPronta` à linha.
- [ ] `ConferidoProduto`: selo "P" no canto SUPERIOR ESQUERDO do R (o "!" do kit fica no direito), âmbar, e o `title`
  e o `aria-label` ganham "Proposta pronta, aguardando aprovação". Some ao conferir (a proposta é apagada).
- [ ] Conferir na tela e commit.

## Tarefa 7: fechamento

- [ ] CLAUDE.md (seção da proposta), lint, `teste:proposta`, `teste:mcp`, `teste:extracao`, commit e push. Deploy só com
  o "sobe".

## Riscos

- O formulário é não controlado: preencher é escrever no `<input>` (o `aplicar` de hoje). Lista (`<select>`) depende do
  `key` para remontar (ver a armadilha do Salvar recusado no CLAUDE.md).
- O preenchimento ao abrir e o rascunho automático não podem brigar: a ordem fica "rascunho decide, depois proposta".
