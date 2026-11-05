# Vincular fornecedores Fortek e Nightech — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (o dono pede execução inline, sem
> subagentes). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** uma página gerada na VPS para o dono marcar, por produto não conferido, os itens da Fortek e da Nightech, e um
script que grava as marcações no Rise.

**Architecture:** dois scripts que rodam dentro do contêiner `app` pelo padrão de `scripts/preencher-produto.js` (o
arquivo viaja pela entrada do comando). O gerador reaproveita `texto.js` (palavras, índice, notas) e `custoDoFornecedor`;
o aplicador reaproveita `marcarReferencias`. As regras puras ficam exportadas nos próprios scripts e são testadas sem banco.

**Tech Stack:** Node ESM, Prisma, sharp (já no projeto), HTML/JS puro na página.

**Spec:** `docs/superpowers/specs/2026-11-05-vincular-fornecedores-fortek-nightech-design.md`

## Global Constraints

- Só produtos `ativo = true` e `conferido = false`. Só as fontes "Fortek" e "Nightech" (tipo FORNECEDOR).
- Preço mostrado = `custoDoFornecedor(prices, taxes)` (com impostos). Nunca `padrao: true`. Nada vai ao Bling/LI/ML.
- Texto da página com acento; identificadores sem acento. Nenhum segredo nos comandos.
- Os scripts recebem `VINCULAR_SO_FUNCOES=1` para só exportar funções (o teste importa sem banco).

## Review Focus

1. Produto cujo título tem 1-2 palavras: todas as palavras exigidas (senão "SENSOR" traz metade do acervo).
2. Rascunho do Bling com fornecedor que não é Fortek/Nightech ("Benser", "Patola"): não marca nada.
3. Vínculo já existente: aparece travado e NÃO entra no JSON nem repete como parecido.
4. Nome de produto com `</script>` ou aspas: a página não quebra (JSON embutido escapado).
5. JSON com produto `nenhum: true` ou sem fornecedor: o aplicador não chama `marcarReferencias` para ele.

---

### Task 1: regras puras do gerador + teste

**Files:**
- Create: `scripts/vincular-fornecedores-gerar.js` (só as funções nesta tarefa)
- Create: `scripts/teste-vincular-fornecedores.js`

**Interfaces (produces):**
- `codigoDoBling(rascunho, fontes) -> { fonte, codigo } | null`
- `candidatosDoProduto(produto, acervo, { porFonte = 4 }) -> candidato[]` com `candidato = { id, fonte, codigo, nome, url,
  preco, estoque: { pronta, aChegar, previsao, montagem }, nota, origem: "vinculado"|"bling"|"parecido", marcado, travado }`
  `produto = { sku, tituloBase, fornecedorRascunho, fornecedores: [{ fornecedorNome, codigo, descricao }] }`
  `acervo = { fontes: string[], itens: item[], porChave: Map("fonte|codigo" -> item) }`, `item.formas = indiceDePalavras(buscaTexto)`
- `montarDados(produtos, acervo, { geradoEm }) -> { geradoEm, fontes, produtos: [...], semCandidato: [{ sku, nome }] }`
- `paginaHtml(dados) -> string`

- [ ] Escrever `scripts/teste-vincular-fornecedores.js` (node:assert) com as asserções: codigoDoBling (Fortek acha; Benser
      e null não); candidatosDoProduto (bling primeiro e marcado; vinculado travado e sem repetir; teto 4 por fonte; motor
      DC abaixo da nota fica fora; título de 2 palavras exige as duas); montarDados (sem candidato vai para semCandidato);
      paginaHtml (contém o SKU, "Salvar escolhas" e escapa `</script>`); planoDasEscolhas (ignora nenhum/vazio).
- [ ] Rodar `VINCULAR_SO_FUNCOES=1 node scripts/teste-vincular-fornecedores.js` → falha (módulo não existe).
- [ ] Implementar as funções em `scripts/vincular-fornecedores-gerar.js` (regra da lupa: `NOTA_MINIMA 0.5`, ≤2 palavras =
      1, `nomeCabeNoTermo` com 3+ palavras; ordem nota desc, nome asc).
- [ ] Rodar o teste → passa.

### Task 2: a página (template dentro do gerador)

- [ ] `paginaHtml(dados)`: HTML único, sem biblioteca; `DADOS` embutido com `</` escapado como `<\/`; barra fixa (busca,
      "Só abaixo do mínimo", "Só não revisados", contador "N de M revisados", **Salvar escolhas**, "Carregar arquivo",
      gerado em); uma linha por produto; cartões por fornecedor com checkbox; botões OK e "Nenhum serve";
      `localStorage` chave `rise:vincular-fornecedores:v1`; download `vinculos-fortek-nightech.json` com
      `{ geradoEm, salvoEm, produtos: { sku: { fornecedores: [{ fonte, codigo }], nenhum, revisado } } }`.
- [ ] Teste da página passa (Task 1 já cobre o conteúdo); abrir um `index.html` de amostra no navegador e conferir
      marcar, salvar e recarregar.

### Task 3: leitura do banco e fotos (o `main` do gerador)

- [ ] `main()`: padrão de `preencher-produto.js` (RAIZ, register, prisma); lê fontes Fortek/Nightech e confere que o
      cadastro `Fornecedor` de mesmo nome existe (aviso se não); lê coletados leves (`select` sem miniatura) e monta
      `acervo`; lê produtos `ativo && !conferido` com `fornecedores.fornecedor.nome` e a foto principal
      (`arquivos` IMAGEM/FOTO, principal desc, ordem asc); chama `montarDados`.
- [ ] Fotos: `sharp` 120 px (fit inside) JPEG q75 em `dados/vincular-fornecedores/fotos/p-<sku>.jpg` (de `caminhoDe`) e
      `c-<id>.jpg` (miniatura lida em lotes de 25 ids, só dos candidatos exibidos); falha vira foto nula.
- [ ] Escreve `index.html`; imprime contagens (produtos, com candidato, sem candidato, fotos geradas) na saída de erro.
- [ ] Rodar no PC (`node scripts/vincular-fornecedores-gerar.js`) para conferir o tempo e a página com os dados de 03/11.

### Task 4: gerar na VPS e trazer

- [ ] Uma conexão SSH: gerar (saída do node para stderr) e `tar -czf -` da pasta para `dados/vincular-fornecedores.tgz`
      no PC; extrair em `dados/vincular-fornecedores/`.
- [ ] Abrir o `index.html` no navegador do PC e conferir uma linha com rascunho do Bling marcado e uma com vínculo travado.

### Task 5: aplicador + teste

**Files:** `scripts/vincular-fornecedores-aplicar.js`

**Interfaces (produces):** `planoDasEscolhas(escolhas) -> [{ sku, adicionar: [{ fonte, codigo }] }]` (ordem de SKU; ignora
`nenhum` e lista vazia).

- [ ] Teste de `planoDasEscolhas` (já em `teste-vincular-fornecedores.js`) → falha → implementar → passa.
- [ ] `main()`: `ESCOLHAS` vem de `globalThis.ESCOLHAS` (texto embutido antes do script) ou de `--arquivo=<json>` no PC;
      sem `--confirmo` imprime o plano e sai; com `--confirmo` chama `marcarReferencias` por produto e imprime
      feitos / já estavam / recusados (com o motivo) e o aviso das abas abertas, uma vez.

### Task 6: entrega

- [ ] Anotar em `CLAUDE.md` (seção curta) e no cabeçalho dos scripts como rodar; `npm run lint` nos scripts novos.
- [ ] Mensagem ao dono: "O que foi feito" + "Testes que você precisa fazer" (abrir a página, marcar, Salvar escolhas,
      me avisar com o caminho do JSON).
