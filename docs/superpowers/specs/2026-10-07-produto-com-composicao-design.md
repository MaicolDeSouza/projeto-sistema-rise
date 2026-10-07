# Produto com composição (kit) — desenho

Data: 07/10/2026. Status: decisões do dono tomadas no chat; aguarda revisão desta spec.

## 1. Objetivo

O Rise passa a ter **produto com composição** (kit): um produto feito de outros produtos do Rise, em
quantidades. O kit é criado e editado no cadastro de Produto, importado do Bling com as peças, e
**exportado para o Bling com a composição**. Hoje o kit só existe no anúncio do Mercado Livre
(`Anuncio.dados.composicao`) e o 990204, importado em 07/10/2026, entrou como produto comum sem as peças.

## 2. Decisões do dono (07/10/2026)

1. Campo **Tipo** ("Simples" / "Com composição") no lugar da Unidade; a **Unidade** vai para o lado de
   "Situação".
2. Aba **Composição** ao lado de "Características", no molde da aba Estrutura do Bling, só com
   **Componente**, **Código (SKU)**, **Qtde**, a lixeira e **"Adicionar outro item"**.
3. **Peça de kit:** só produto **já cadastrado** no Rise, **validado (Conferido)** e **já vinculado ao
   Bling**.
4. **Fornecedores do kit:** uma linha por peça com o **fornecedor padrão** dela, o **custo total** e o
   **valor total de venda** do kit, e um **link** que abre a peça no Rise em nova janela. Somem a coluna
   "Padrão" e o "Adicionar fornecedor".
5. **Peso e dimensões do kit:** **peso somado** (peça × quantidade); **medidas sugeridas e editáveis**
   (maior comprimento, maior largura, soma das alturas); quadro só de consulta com peso e medidas de cada
   peça.
6. **NCM do kit:** lista com o NCM de cada peça para escolher (o campo continua digitável).
7. **Estoque do kit calculado pelas peças:** o menor de ⌊estoque da peça ÷ quantidade⌋; a edição rápida
   de estoque fica bloqueada no kit.
8. **Bling:** importar um kit já preenche a Composição; um kit criado no Rise **é exportado para o Bling
   com a composição**; o Sincronizar também leva a composição.
9. **Descrição** (vale para todo produto): a janela "Criar descrição" usa só os concorrentes e
   fornecedores **cadastrados no produto** (e, no produto novo, os marcados na lupa), sem busca automática.

## 3. Banco (migration só aditiva)

- `enum TipoProduto { SIMPLES COMPOSICAO }`; `Produto.tipo TipoProduto @default(SIMPLES)`.
- `ProdutoComponente`: `id`, `kitId` → `Produto` (`onDelete: Cascade`), `componenteId` → `Produto`
  (`onDelete: Restrict`: a peça usada em kit não é excluída), `quantidade Int`, `ordem Int`,
  `@@unique([kitId, componenteId])`, `@@index([componenteId])`.
- Regra do schema: só uma sessão mexe no banco por vez; antes da migration, confirmar com a sessão da Loja
  Integrada (ativa). Tirar do SQL gerado os `DROP` dos índices que só existem no SQL.

## 4. Cadastro de Produto

- **Tipo** ao lado de Localização (onde hoje está a Unidade); **Unidade** ao lado de Situação.
- Trocar de "Com composição" para "Simples" com peças pede confirmação e apaga as peças ao salvar.
- **Aba Composição** (logo depois de Características; só aparece no tipo "Com composição"): tabela
  Componente · Código (SKU) · Qtde · lixeira; "Adicionar outro item" abre uma busca por código ou nome
  **só entre os produtos que podem ser peça** (simples, Conferido, com `blingId`).
- **Validação no servidor** (o que vem do navegador não é confiado): pelo menos 2 unidades no total;
  quantidade inteira de 1 a 9999; peça existe, é simples, Conferido, vinculada ao Bling, não é o próprio
  produto e não se repete. O recado diz qual peça e por quê.

## 5. Abas do kit

- **Fornecedores / Concorrentes:** a tabela de fornecedores do kit é só leitura, montada das peças: peça
  (link para `/produtos/<id>` em nova janela), quantidade, fornecedor padrão, descrição e código no
  fornecedor, preço de custo, estoque do fornecedor, link. Rodapé: **custo total** (Σ custo × qtd) e
  **venda total** (Σ preço de venda × qtd). Peça sem fornecedor padrão ou sem custo deixa o custo total
  **incompleto** (diz qual peça), nunca uma soma parcial. A margem do campo "Preço venda" do kit usa o
  custo total. Concorrentes do kit continuam como hoje.
- **Peso e dimensões:** peso = Σ peso × qtd (preenchido sozinho ao mudar as peças); comprimento e largura
  = o maior entre as peças, altura = Σ altura × qtd, como sugestão editável; quadro de consulta por peça.
  Peça sem peso/medida aparece no quadro como "sem dado" e o total diz que está incompleto.
- **Tributação:** junto ao NCM, a lista dos NCMs das peças (código e nome da peça ao lado; NCM repetido
  aparece uma vez); clicar preenche o campo.

## 6. Estoque do kit

- `Produto.estoque` do kit é **gravado já calculado** (as telas, a foto mensal e a sincronização leem a
  coluna): menor ⌊estoque da peça ÷ qtd⌋, peça com estoque negativo conta 0.
- Recalculado: ao salvar o kit; na edição rápida de estoque de uma peça (na mesma transação, para cada kit
  que a usa); no "Sincronizar estoque com Bling" (depois de gravar as peças); na importação.
- A célula de estoque do kit na lista mostra o número com "calculado pelas peças" e não abre o ajuste; o
  envio de ajustes ao Bling já recusa kit de estoque virtual.

## 7. Bling

- **Importar kit** (já aceito em 07/10/2026): passa a gravar `tipo = COMPOSICAO` e as peças (pelo
  `blingId` ou pelo código). Peça que falta continua recusando o kit. O 990204 recebe as peças uma vez.
- **Cadastrar no Bling um kit do Rise:** `POST /produtos` com `formato: "E"` e
  `estrutura: { tipoEstoque: "V", componentes: [{ produto: { id }, quantidade }] }`. O id de cada peça
  sai da **busca por código feita no mesmo envio** (Emenda 11), nunca do `blingId` guardado; peça que não
  é achada no Bling recusa sem `POST`. Escrita sob as duas travas, uma tentativa só.
- **Sincronizar um kit:** o pop-up mostra a composição Rise × Bling como mais uma diferença ("Composição");
  se diferir, o envio leva a `estrutura` inteira no `PATCH`. O que o `PATCH` de `estrutura` faz com o
  `tipoEstoque` e com as peças omitidas é **medido antes**, num kit de teste.
- **Medição antes de liberar** (só no produto de teste, travas abertas só no ambiente do script): criar
  `ZZ-TESTE-KIT` com o `ZZ-TESTE-BLING` × 2, conferir a estrutura gravada, mudar a quantidade pelo
  Sincronizar e conferir de novo.

## 8. Descrição (todo produto)

`buscarDescricoesParaProduto` deixa de buscar o nome no catálogo coletado. As referências passam a ser os
concorrentes (`ProdutoConcorrente.produtoColetadoId`) e fornecedores ligados ao produto, mais os marcados
na lupa (produto novo). Sem nenhuma, a janela diz isso e oferece só a descrição atual.

## 9. Fora do escopo

- O anúncio de kit do Mercado Livre continua com a composição própria (`Anuncio.dados.composicao`).
- Variação (formato `V`) continua sem suporte.
- Kit dentro de kit.

## 10. Testes

- Suíte nova `npm run teste:composicao` (Postgres, sem rede): validações das peças, estoque calculado e
  recalculado, totais de custo/venda (incompleto), peso e medidas sugeridas, NCMs, exclusão de peça
  barrada, trocar o tipo.
- `teste:bling-sync`: corpo do cadastro e do `PATCH` com `estrutura` (Emenda 11 nos ids das peças),
  importação com peças, diferença "Composição".
- Na tela: criar um kit, as quatro abas, a lista; e o teste real no `ZZ-TESTE-KIT`.
