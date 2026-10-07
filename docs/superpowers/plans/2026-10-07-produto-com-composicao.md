# Produto com composição (kit) — plano de implementação

> **Para quem executa:** execução INLINE (superpowers:executing-plans), sem subagentes (pedido do dono em
> 05/10/2026). Modelo: Sonnet nas tarefas de tela e texto; Opus nas que escrevem no Bling (Tarefas 8 e 9).
> Passos com `- [ ]`.

**Objetivo:** o Rise ganha produto do tipo "Com composição" (kit), com as peças cadastradas no Rise, estoque
calculado pelas peças, abas do cadastro adaptadas, importação e exportação da composição para o Bling.

**Arquitetura:** `Produto.tipo` (SIMPLES/COMPOSICAO) e a tabela `ProdutoComponente`. A lógica pura do kit
(estoque, totais, peso/medidas, NCMs, validação) fica em `src/lib/composicao.js` (sem Prisma, testável); o
banco em `src/lib/composicaoBanco.js`; o cadastro usa a aba Composição; a sincronização com o Bling ganha o
campo "composicao" (lido e enviado como `estrutura`).

**Spec:** `docs/superpowers/specs/2026-10-07-produto-com-composicao-design.md`.

## Restrições globais

- Texto de tela em português; identificadores e comentários sem acento; comentários dizem o porquê.
- `.env` nunca é tocado; nada escreve no Bling real fora da Tarefa 9, só no produto de teste, com as travas
  abertas apenas no ambiente do script.
- Migration só aditiva, SQL conferido à mão (tirar os `DROP INDEX` dos índices que só existem no SQL),
  `npx prisma generate` e reiniciar o servidor. Antes: confirmar com a sessão da Loja Integrada que ela não
  tem migration pendente (regra do schema).
- Nunca `git add -A`; commit só dos arquivos da tarefa, pelo nome. `CLAUDE.md` pode ter edição de outra
  frente: conferir `git diff -U0` antes de commitar.
- Emenda 11 vale para as peças: o id de cada peça no Bling sai da busca por código feita no mesmo envio.
- Kit dentro de kit, variação e o anúncio de kit do ML ficam fora.

## Foco da revisão (o que nenhum teste de tarefa cobre sozinho)

1. Peça excluída enquanto está em kit → `Restrict` recusa e a tela diz quais kits a usam (Tarefa 2).
2. Edição rápida de estoque numa peça recalcula TODOS os kits que a usam, na mesma transação (Tarefa 4).
3. "Sincronizar estoque com Bling" grava o saldo das peças e DEPOIS recalcula os kits (Tarefa 4).
4. Trocar o tipo de "Com composição" para "Simples" apaga as peças e devolve o estoque editável (Tarefa 5).
5. `PATCH` com `estrutura` no Bling: o que acontece com `tipoEstoque` e com peça omitida (Tarefa 9 mede).

---

### Tarefa 1: Banco e regras puras do kit

**Arquivos:** `prisma/schema.prisma`, `prisma/migrations/20261007_produto_composicao/migration.sql`,
`src/lib/composicao.js` (novo), `scripts/teste-composicao.js` (novo), `package.json` (script
`teste:composicao`).

**Produz:**
- `enum TipoProduto { SIMPLES COMPOSICAO }`; `Produto.tipo TipoProduto @default(SIMPLES)`; `Produto.componentes
  ProdutoComponente[] @relation("KitPecas")`, `Produto.usadoEm ProdutoComponente[] @relation("PecaKits")`.
- `model ProdutoComponente { id, kitId, kit (Cascade, "KitPecas"), componenteId, componente (Restrict,
  "PecaKits"), quantidade Int, ordem Int @default(0), @@unique([kitId, componenteId]), @@index([componenteId]) }`.
- `src/lib/composicao.js` (sem imports):
  - `estoqueDoKit(pecas: {estoque, quantidade}[]) → number` (menor ⌊max(estoque,0) ÷ quantidade⌋; sem peças = 0).
  - `totaisDoKit(pecas: {sku, quantidade, precoVenda, custo}[]) → {custo: number|null, venda: number|null,
    faltaCusto: string[], faltaVenda: string[]}` (custo/venda `null` quando alguma peça não tem; as listas
    dizem o `sku` de quem falta).
  - `pesoEMedidasDoKit(pecas: {sku, quantidade, pesoKg, comprimentoCm, larguraCm, alturaCm}[]) →
    {pesoKg, comprimentoCm, larguraCm, alturaCm, incompleto: string[]}` (peso Σ×qtd; comprimento e largura
    = maior; altura Σ×qtd; qualquer peça sem o dado entra em `incompleto` e o campo correspondente fica null).
  - `ncmsDasPecas(pecas: {sku, tituloBase, ncm}[]) → {ncm, pecas: string[]}[]` (sem repetir NCM; sem NCM fora).
  - `validarComposicao(itens, {produtoId}) → {ok, erro?}` com itens `{componenteId, quantidade}`: lista
    não vazia, quantidade inteira 1..9999, soma ≥ 2, sem repetição, sem o próprio produto.

- [ ] **Step 1:** teste `scripts/teste-composicao.js` só com as funções puras (RED: módulo não existe):
  estoque `[{18,1},{28,1},{9,1}] → 9`; `[{10,3},{5,1}] → 3`; negativo conta 0; vazio 0. Totais com custo
  faltando → `custo: null, faltaCusto: ["B"]`. Peso 0.2+0.1×2 = 0.4; medidas maior/maior/soma; sem dado →
  `incompleto`. NCMs repetidos uma vez. Validação: 1 unidade só recusa, repetida recusa, 0 recusa, 1.5 recusa,
  próprio produto recusa.
- [ ] **Step 2:** rodar → FALHA. **Step 3:** implementar `composicao.js`. **Step 4:** rodar → ok.
- [ ] **Step 5:** schema + `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma
  --script` → salvar, **remover os DROP INDEX** (`ProdutoColetado_buscaTexto_trgm`, `ProdutoColetado_coletadoEm_idx`,
  `Job_fonte_aberta`, `Anuncio_um_por_produto`), `npm run backup`, `npm run db:deploy`, `npx prisma generate`.
- [ ] **Step 6:** commit `Produto com composicao: banco e regras puras do kit`.

### Tarefa 2: Banco do kit (ler, gravar, recalcular) e peça usada não é excluída

**Arquivos:** `src/lib/composicaoBanco.js` (novo), `src/app/produtos/acoes.js` (`excluirProduto`),
`scripts/teste-composicao.js`.

**Produz** (`composicaoBanco.js`, com Prisma):
- `lerPecasDoKit(kitId) → {componenteId, quantidade, ordem, produto: {id, sku, tituloBase, estoque, precoVenda,
  pesoKg, alturaCm, larguraCm, comprimentoCm, ncm, blingId, conferido, tipo, fornecedores: [padrao com fornecedor]}}[]`
  em ordem.
- `pecasPermitidas(ids) → {ok, erro?}`: cada id existe, `tipo === SIMPLES`, `conferido`, `blingId` não nulo
  (recado diz o sku e o motivo).
- `gravarComposicao(kitId, itens, tx?)`: troca a lista inteira (apaga as que saíram, atualiza quantidade/ordem,
  cria as novas) e grava `Produto.estoque` do kit com `estoqueDoKit`.
- `recalcularKitsDaPeca(componenteId, tx)`: para cada kit que usa a peça, regrava `estoque` com `estoqueDoKit`.
- `kitsQueUsam(produtoId) → {id, sku}[]`.
- `excluirProduto`: antes de apagar, se `kitsQueUsam` não é vazio, devolve `{ok:false, erro: "Este produto é peça
  dos kits X, Y. Tire-o das composições antes de excluir."}` (o `Restrict` do banco é a segunda defesa).

- [ ] **Step 1:** testes (Postgres, produtos `ZZ-KIT-*`, limpar no início): gravar 3 peças → estoque do kit certo;
  trocar quantidade → recalcula; tirar peça → some; peça não Conferida/sem blingId/tipo COMPOSICAO → recusa;
  `recalcularKitsDaPeca` muda os dois kits que a usam; `excluirProduto` da peça recusa com os skus.
- [ ] **Step 2-4:** RED, implementar, GREEN. **Step 5:** commit `Produto com composicao: banco do kit e peca
  protegida`.

### Tarefa 3: Importação do Bling grava a composição; 990204 recebe as peças

**Arquivos:** `src/lib/integracoes/importarBling.js`, `scripts/teste-bling-sync.js` ou `teste-composicao.js`,
`scripts/composicao-do-bling.js` (novo: lê a estrutura de um kit no Bling, só GET, e grava as peças no Rise; serve
para o 990204 e para kits importados antes desta tarefa).

**Produz:** em `importarPorCodigoDoBling`, kit (`formato "E"`) grava `tipo: COMPOSICAO` e, depois do `create`,
`gravarComposicao` com as peças achadas (por `blingId` ou código). `pecasQueFaltamNoRise` passa a devolver também
`{componenteId, quantidade}` resolvidos para não ler o Bling duas vezes. O kit importado NÃO exige peça Conferida
(a regra do Conferido é para kit montado no Rise; o importado já existe no Bling) — mas exige `blingId` (todas têm).

- [ ] **Step 1:** teste com o Bling falso: kit com 2 peças → produto `tipo COMPOSICAO`, 2 `ProdutoComponente`,
  estoque calculado pelas peças (não o `saldoVirtualTotal` do Bling).
- [ ] **Step 2-4:** RED/GREEN. **Step 5:** rodar o script no 990204; conferir `estoque` 9. **Step 6:** commit
  `Importar do Bling: kit grava a composicao`.

### Tarefa 4: Estoque do kit calculado (edição rápida, botão de saldos, bloqueio)

**Arquivos:** `src/lib/ajusteRapido.js`, `src/lib/blingSync/saldos.js`, `src/components/produtos/LinhaProduto.jsx`,
`src/components/produtos/EdicaoRapida.jsx`, `src/app/produtos/page.jsx` (incluir `tipo`), `scripts/teste-composicao.js`,
`scripts/teste-estoque.js`.

- `gravarAjusteDeEstoque`: recusa kit (`tipo COMPOSICAO`) com "O estoque de um kit é calculado pelas peças.
  Ajuste o estoque das peças."; numa peça, depois do `update`, chama `recalcularKitsDaPeca(id, tx)`.
- `saldos.js` (`gravarLote`): depois de gravar as peças do lote, recalcula os kits que as usam (mesma transação).
  Kit lido do Bling: grava `blingSaldo` mas o `estoque` continua o calculado.
- Lista: célula de estoque do kit não abre popup; mostra o número e, em baixo, "calculado pelas peças".

- [ ] **Step 1:** testes: ajuste em kit recusado; ajuste em peça recalcula o kit; lote de saldos recalcula.
- [ ] **Step 2-4:** RED/GREEN. **Step 5:** `npm run teste:estoque` e `teste:bling-sync` seguem ok. **Step 6:**
  commit `Estoque do kit: calculado pelas pecas, bloqueado na edicao rapida`.

### Tarefa 5: Cadastro — campo Tipo, Unidade ao lado de Situação, aba Composição, salvar

**Arquivos:** `src/components/produtos/FormularioProduto.jsx`, `src/components/produtos/Composicao.jsx` (novo),
`src/app/produtos/acoes.js` (`ProdutoSchema.tipo`, `salvarProduto`, `buscarPecasParaKit`), `src/app/produtos/[id]/page.jsx`
(incluir `componentes`), `scripts/teste-composicao.js`.

- `ABAS`: `{ id: "composicao", rotulo: "Composição" }` logo após Características; só aparece com tipo COMPOSICAO
  (montada e oculta, como as outras).
- Campo **Tipo** (`<select name="tipo">` Simples / Com composição) onde estava Unidade; **Unidade** depois de
  `<Interruptor nome="ativo">`.
- `Composicao.jsx`: tabela Componente · Código (SKU) · Qtde · lixeira; "Adicionar outro item" abre busca
  (`buscarPecasParaKit(termo, excluir)` → só simples + Conferido + com blingId, por sku ou nome, até 20); lista
  vai no envio como campo oculto JSON `composicao` (`[{componenteId, quantidade}]`), mesmo molde dos fornecedores.
- `salvarProduto`: valida (`validarComposicao` + `pecasPermitidas`) ANTES de gravar; com tipo SIMPLES e lista
  não vazia, apaga as peças. Trocar para Simples com peças: a tela pede confirmação ("As N peças serão removidas").
- Produto novo do tipo kit: estoque gravado calculado; o campo de estoque inicial, se existir, fica desabilitado.

- [ ] **Step 1:** teste de `salvarProduto` por `FormData` montado no script (molde dos testes existentes): kit com
  2 peças grava `tipo` e `ProdutoComponente`; peça inválida recusa com o sku; tipo Simples apaga as peças.
- [ ] **Step 2-4:** RED/GREEN; `npm run lint`. **Step 5:** tela: criar um kit de teste, abas, salvar, reabrir;
  `read_console_messages` sem erro; captura. **Step 6:** commit `Cadastro: tipo do produto e aba Composicao`.

### Tarefa 6: Abas do kit — Fornecedores (só leitura + totais), Peso e dimensões, NCM

**Arquivos:** `src/components/produtos/FornecedoresDoKit.jsx` (novo), `src/components/produtos/FormularioProduto.jsx`
(aba fornecedores: kit mostra `FornecedoresDoKit` no lugar da tabela editável; `CampoPreco` recebe `custo` =
`totais.custo`; aba dimensões: preencher sugestão + quadro; aba tributação: lista de NCMs), `src/app/produtos/[id]/page.jsx`
(carrega as peças com fornecedor padrão), `scripts/teste-composicao.js` (só o que for puro já está na Tarefa 1).

- Fornecedores do kit: linha por peça — peça (link `/produtos/<id>` `target="_blank"`), qtd, fornecedor padrão,
  descrição, código, custo, estoque do fornecedor (reaproveita `consultarEstoqueFornecedores`), link do
  fornecedor; rodapé custo total / venda total; "incompleto: falta custo em X" quando `faltaCusto`.
- Peso e dimensões: ao mudar as peças (ou abrir), preencher `pesoKg` (sempre) e as medidas (só se o campo estiver
  vazio ou igual à sugestão anterior) com `pesoEMedidasDoKit`; quadro por peça embaixo; aviso de incompleto.
- Tributação: `ListaFlutuante` com `ncmsDasPecas` ao lado do NCM (mesmo desenho dos ícones de lista); clicar
  preenche.

- [ ] **Step 1:** render com `react-dom/server` (como nas tarefas anteriores) dos 3 blocos nos estados completo /
  incompleto. **Step 2:** implementar. **Step 3:** lint + tela (o kit da Tarefa 5 e o 990204). **Step 4:** commit
  `Abas do kit: fornecedores das pecas, peso e medidas, NCMs`.

### Tarefa 7: Descrição só com referências cadastradas (todo produto)

**Arquivos:** `src/app/produtos/acoes.js` (`buscarDescricoesParaProduto`), `src/components/produtos/JanelaDescricao.jsx`
(texto de rodapé e estado vazio), `src/components/produtos/FormularioProduto.jsx` (passa `produtoId` e os ids dos
concorrentes/fornecedores ligados).

- `buscarDescricoesParaProduto(titulo, idsMarcados, produtoId)`: referências = `ProdutoConcorrente.produtoColetadoId`
  do produto + `idsMarcados` (lupa). Fornecedor ligado só entra se tiver um `ProdutoColetado` já marcado na lupa;
  não se busca por nome. Sem busca automática no catálogo.
- Sem referência: `{ok: true, itens: [], encontrados: 0}` e a janela diz "Nenhum concorrente ou fornecedor
  cadastrado neste produto. Adicione na aba Fornecedores / Concorrentes para gerar a descrição a partir deles."

- [ ] **Step 1:** teste (Postgres): produto com 1 concorrente ligado e 5 similares no catálogo → só 1 item.
- [ ] **Step 2-4:** RED/GREEN; tela no 990204 (antes: 5 lojas; depois: só as cadastradas). **Step 5:** commit
  `Criar descricao: so concorrentes e fornecedores cadastrados no produto`.

### Tarefa 8: Bling — composição como campo de sincronização (leitura, diferença, corpo) **[Opus]**

**Arquivos:** `src/lib/blingSync/campos.js`, `corpo.js`, `leitura.js`, `envio.js`, `estado.js` (INCLUDE),
`scripts/lib/blingFalso.js`, `scripts/teste-bling-sync.js`.

- `CAMPOS_DE_ENVIO` ganha `{ id: "composicao", rotulo: "Composição" }`. `normalizarDoRise`: kit →
  `[{codigo, quantidade}]` ordenado por código; simples → `null`. `normalizarDoBling`: `estrutura.componentes`
  → precisa do CÓDIGO de cada peça (a estrutura só traz id): `lerParaPopup`/`buscarNoBling` resolvem os ids
  por `GET /produtos/{id}` (até 20 peças; falha de uma peça = erro de leitura, não "sem composição").
- `diferencas`: compara as listas (código+quantidade). `vazioNoRise` continua não apagando: kit no Rise sem peças
  não envia composição.
- `montarCorpoDeCadastro(sku, rise, {idsDasPecas})`: kit → `formato: "E"`, `estrutura: { tipoEstoque: "V",
  componentes: [{produto: {id}, quantidade}] }`. `montarCorpoParcial`: se "composicao" mudou → `estrutura` inteira
  (mesmo `tipoEstoque` lido do Bling, ou "V" se não houver).
- `envio.js`: antes do POST/PATCH de um kit, busca cada peça por código no Bling (Emenda 11); peça não achada
  → recusa sem escrever. `cadastrarNoBling` deixa de recusar kit.
- Falso: `GET /produtos/{id}` devolve `estrutura` e `formato` guardados; `POST`/`PATCH` aceitam `estrutura`.

- [ ] **Step 1:** testes: pop-up de kit mostra "Composição" igual/diferente; cadastro de kit → POST com formato E
  e estrutura com os ids achados por código (nunca `blingId`); mudar quantidade → PATCH só com `estrutura`;
  peça inexistente no Bling → recusa sem POST; produto simples segue sem `estrutura` no corpo (chave proibida
  antes, agora só proibida no simples).
- [ ] **Step 2-4:** RED/GREEN; lint. **Step 5:** commit `Sincronizacao Bling: composicao do kit (leitura, diferenca,
  cadastro e PATCH)`.

### Tarefa 9: Teste real no kit de teste, documentação e fechamento **[Opus]**

**Arquivos:** `CLAUDE.md`, `docs/superpowers/specs/2026-10-04-sincronizacao-bling-investigacao.md`.

- [ ] **Step 1 (só leitura):** `GET /produtos/16593700269` (990204) para ver o formato exato da `estrutura`.
- [ ] **Step 2 (escrita só no teste, travas no ambiente do script, lista `ZZ-TESTE-KIT`):** criar no Rise
  `ZZ-TESTE-KIT` = `ZZ-TESTE-BLING` × 2 (precisa Conferido + blingId: marcar o ZZ-TESTE-BLING como conferido);
  "Cadastrar no Bling" → conferir `formato`, `estrutura` e saldo calculado no Bling; mudar para × 3 → Sincronizar
  → conferir que só a estrutura mudou e o que aconteceu com `tipoEstoque`; abrir o pop-up → zero diferenças.
- [ ] **Step 3:** documentar no `CLAUDE.md` (seção nova "Produto com composição (kit)" após a da sincronização) e
  os resultados na investigação; bateria: `teste:composicao`, `teste:bling-sync`, `teste:estoque`, `teste:cadastros`,
  `npm run lint`. **Step 4:** commit `Produto com composicao: teste real no kit de teste e documentacao`.
