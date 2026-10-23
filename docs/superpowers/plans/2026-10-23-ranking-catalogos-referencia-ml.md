# Ranking pelos catálogos de referência do ML — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o dono marca até 10 catálogos de referência por produto; o worker relê o 1º de cada um por dia; a aba Preço e
custos e a lista de anúncios mostram o ranking dos 1ºs com a posição do anúncio ("Você está em 3º de 8").

**Architecture:** tabelas novas `CatalogoReferenciaML` (+ histórico) ao lado do que já existe (`Produto.mlCatalogoId`,
`ConcorrenteML`, `PosicaoML`, intocados). Leitura em `catalogo.js`, gravação e tela em `referencias.js`, conta pura em
`ranking.js`, a rodada diária de `relerCatalogo.js` passa a reler também as referências. Execução inline na `main`.

**Tech Stack:** Next 16 (Server Actions), Prisma 7 + Postgres, React 19, `scripts/teste-anuncios-ml.js` com o ML falso.

**Spec:** `docs/superpowers/specs/2026-10-23-ranking-catalogos-referencia-ml-design.md` (aprovada em 23/10/2026).

**Medido antes do plano (23/10/2026, só GET, MLB44072268):** `/products/{id}` devolve `buy_box_winner: null`; o 1º de
`/products/{id}/items` é MLB4925211121 a R$ 31,99 (riscado 76,65). Logo, o 1º vem da lista (spec 4.2).

## Global Constraints

- Só GET no ML. Nenhuma escrita no ML, no Bling ou na LI.
- Texto da tela com acento; identificadores e comentários sem acento; comentário explica o porquê.
- Preço que decide: o `price` do ML (o que ele cobra), como o resto do código do ML; o `original_price` (riscado) só
  aparece como informação.
- Migration só aditiva, gerada por `migrate diff` e editada à mão: tirar todo `DROP INDEX` que o diff propuser.
- Acessos: ler = `tela.canaisDeVenda.mercadoLivre` ver + `dado.concorrentes` ver; adicionar, remover e reler =
  `tela.canaisDeVenda.mercadoLivre` editar + `dado.concorrentes` ver.
- Até 10 referências por produto (`MAXIMO_DE_REFERENCIAS = 10`). O catálogo do anúncio não pode ser referência.
- Rótulo fixo do bloco: "1º colocado de cada catálogo, não o menor preço do ML".
- Padrão visual do CLAUDE.md (uma ação principal, ajuda na bolha "i", nada de texto explicativo fixo).

## Review Focus

1. Produto com referências e SEM catálogo do anúncio: entra na rodada e no ranking (teste na Task 3).
2. O 1º de uma referência é o próprio dono: a linha vira "Você", não conta duas vezes (Task 2).
3. Referência que falha na releitura: os dados lidos antes ficam, com `erro`; a rodada segue; 429 para (Tasks 1 e 3).
4. Catálogo do anúncio trocado para um que já era referência: ele não aparece duas vezes no ranking (Task 2).
5. Anúncio sem preço: ranking sem a linha "Você" e sem a frase (Task 2).

---

### Task 1: Banco + leitura do 1º + gravação das referências

**Files:** `prisma/schema.prisma`; `prisma/migrations/20261023_catalogos_referencia_ml/migration.sql` (novo);
`src/lib/canaisDeVenda/ml/catalogo.js`; `src/lib/canaisDeVenda/ml/referencias.js` (novo); `scripts/teste-anuncios-ml.js`.

**Produces:**
- `CatalogoReferenciaML { id, produtoId, catalogoId, nome?, itemId?, vendedorId?, vendedorApelido?, vendedorReputacao?,
  preco Decimal(12,2)?, precoCheio?, freteGratis Bool=false, logistica?, tipoAnuncio?, totalNoCatalogo Int?, lidoEm?,
  semAnuncios Bool=false, erro?, erroEm?, criadoEm }`, `@@unique([produtoId, catalogoId])`, `@@index([produtoId])`,
  Cascade pelo produto; `CatalogoReferenciaMLHistorico { id, referenciaId (Cascade), itemId?, vendedorId?, preco?,
  precoCheio?, lidoEm }`, `@@index([referenciaId, lidoEm])`; `Produto.referenciasML`.
- `lerPrimeiroDoCatalogo(cliente, catalogoId, { meuSellerId }) -> { total, primeiro | null }` (uma página `limit: 1`;
  `primeiro` no formato dos itens de `lerConcorrentesDoCatalogo`; 404 = `{ total: 0, primeiro: null }`; outro erro lança).
- `referencias.js`: `MAXIMO_DE_REFERENCIAS`; `adicionarReferenciaML(cliente, produtoId, { catalogoId, nome }, { agora })`
  (recusa produto inexistente, não Conferido, igual ao `mlCatalogoId`, repetido, a 11ª; grava e lê na hora);
  `removerReferenciaML(produtoId, referenciaId)` (só a do produto; histórico vai junto); `relerReferencia(cliente,
  referencia, { meuSellerId, agora })` (grava o 1º; apelido e reputação por `lerVendedores`; histórico só quando item,
  preço ou preço cheio mudam; erro grava `erro`/`erroEm` e mantém o resto; devolve `{ ok, erro?, status? }`);
  `relerReferenciasDoProduto(cliente, produtoId, { agora, espera })` (401/429 param e devolvem `status`);
  `lerReferenciasML(produtoId)` (números simples, ordem de criação).

- [ ] Testes (falham): `lerPrimeiroDoCatalogo` (1º, 404 nulo, `meu`); adicionar (grava e lê; recusa catálogo do anúncio,
  repetido, 11ª, não Conferido); reler (histórico só quando o preço muda; erro mantém o preço e grava `erro`); remover.
- [ ] Schema, `migrate diff` (sem `DROP INDEX`), `migrate deploy` no PC, `prisma generate`; código; testes passam.
- [ ] Commit (`schema.prisma` pode ter trechos de outra sessão: `apply --cached` só dos meus).

### Task 2: Conta do ranking (pura)

**Files:** `src/lib/canaisDeVenda/ml/ranking.js` (novo, sem imports); `scripts/teste-anuncios-ml.js`.

**Produces:**
- `catalogosDoRanking(telaConcorrentes, referencias) -> [{ catalogoId, nome, papel: "anuncio"|"referencia", primeiro|null,
  semAnuncios, lidoEm, erro }]`: o catálogo do anúncio primeiro (1º = `{ meu: true }` se `posicao.posicao === 1`, senão
  o concorrente presente de menor `posicao`); referência com o id do catálogo do anúncio sai.
- `montarRanking({ preco, catalogos }) -> { linhas, foraDaConta, posicao|null, total, maisBarato|null, media|null,
  paraOMaisBarato: { reais, percentual }|null, paraAMedia: { reais, percentual }|null }`; linha = `{ tipo: "voce"|"catalogo",
  posicao, preco, ...catalogo }`.
- `leituraAntiga(lidoEm, agora)` (mais de 48 h).
- Regras: entra o 1º com `preco > 0` e não `meu`; `meu` sai (a linha "Você" o representa); sem anúncios e nunca lidos vão
  para `foraDaConta`; ordem por preço crescente; empate em centavos deixa "Você" na frente; posição sequencial; sem preço
  válido não há "Você" e os campos do dono ficam nulos; média dos 1ºs contados ao centavo; diferença = preço do anúncio −
  referência, percentual sobre a referência com uma casa.

- [ ] Testes (falham): ordem; empate; dono 1º de uma referência; referência igual ao catálogo do anúncio; fora da conta;
  sem preço; exemplo 1ºs 31,99 / 39,54 / 42,99 e preço 38,90 → 2º de 4, +6,91 (+21,6%) do mais barato, média 38,17;
  `leituraAntiga`.
- [ ] Código; testes passam; commit.

### Task 3: Rodada diária e "Reler agora"

**Files:** `src/lib/canaisDeVenda/ml/relerCatalogo.js`; `scripts/teste-anuncios-ml.js`.

**Produces:** `relerConcorrentesML` pega produtos com `mlCatalogoId` OU com referência; relê o catálogo do anúncio (se
houver) e depois as referências; 401/429 de qualquer leitura param a rodada sem gravar a data; outra falha conta como
falha do produto e segue.

- [ ] Testes (falham): produto só com referências é relido; 429 numa referência para e não grava a data; erro numa
  referência não derruba o produto seguinte. Código; testes (os antigos da rodada também) passam; commit.

### Task 4: Ações e tela na aba Preço e custos

**Files:** `src/app/canais-de-venda/mercado-livre/acoes.js` (no fim); `src/components/anuncios/ml/RankingDosCatalogos.jsx`
(novo); `AbaPrecoEstoque.jsx`; `ConcorrentesDoML.jsx` (prop `aoMudarTela(tela)`).

**Produces:** `lerReferenciasMLAcao(produtoId)`, `adicionarReferenciaMLAcao(produtoId, { catalogoId, nome })`,
`removerReferenciaMLAcao(produtoId, referenciaId)`, `relerReferenciasMLAcao(produtoId)`, todas `{ ok, erro?, referencias }`.
Tela: topo "Você está em 3º de 8" + diferenças; tabela (posição, catálogo, vencedor com perfil e anúncio pelos
`urlDoPerfil`/`urlDoAnuncio` existentes, preço com o cheio riscado, frete grátis, lido em, aviso com erro ou leitura
antiga); "Você" destacada; rótulo fixo; "Catálogos de referência" com remover (pop-up com o nome) e "Adicionar catálogo"
(busca pré-preenchida com o título ou link/ID colado, prévia com nome, vendedores e 1º antes de confirmar; reaproveita
`buscarCatalogosMLAcao` e `preverCatalogoMLAcao`); "Reler agora" das referências. Sem editar: só a leitura.

- [ ] Código; `npm run lint`, `npm run teste:acessos`, `npm run teste:anuncios-ml` passam.
- [ ] Conferir no navegador (100101, PC). Se o servidor do PC for de outra sessão, dizer no fim que a tela não foi vista.
- [ ] Commit.

### Task 5: Coluna na lista de anúncios + CLAUDE.md

**Files:** `src/lib/canaisDeVenda/ml/referencias.js` (`catalogosDeVariosProdutos(produtoIds) -> Map`); `banco.js`
(`listarAnunciosML` anexa `rankingML = { posicao, total } | null`); `TabelaAnunciosML.jsx` ("Nº de M" antes dos avisos);
`scripts/teste-anuncios-ml.js`; `CLAUDE.md`.

- [ ] Teste (falha): `catalogosDeVariosProdutos` com dois produtos. Código; lint + `teste:anuncios-ml` + `teste:acessos`.
- [ ] CLAUDE.md (subseção nova, a medição do `buy_box_winner` nulo, o total de asserções); commit e push.
