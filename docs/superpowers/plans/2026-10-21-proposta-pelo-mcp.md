# Proposta de produto pelo MCP — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cinco ferramentas no servidor MCP do Rise (`lerParaProposta`, `baixarCandidatas`, `folhaDeContato`,
`gravarSecao`, `lerProposta`) para qualquer conversa conectada montar a proposta automática de produto sem SSH.

**Architecture:** a lógica mora em `src/lib/proposta/` (leitura, candidatas, folha de contato, gravação já existente);
`src/lib/mcp/proposta.js` só embrulha essas funções no formato das ferramentas do MCP (`{ nome, descricao, esquema,
executar }`) e confere o acesso pelo `contexto.pode`; o `servidor.js` registra a lista. O script por SSH passa a usar a
mesma leitura.

**Tech Stack:** Next.js 16, Node 24, Prisma 7, `@modelcontextprotocol/server` 2.3.1, zod 4, `sharp` 0.35.5.

**Spec:** `docs/superpowers/specs/2026-10-21-proposta-pelo-mcp-design.md` (e a de base,
`docs/superpowers/specs/2026-10-16-proposta-automatica-de-produto-design.md`).

## Global Constraints

- Nenhuma ferramenta toca em `Produto` nem em `ProdutoArquivo`; só em `PropostaDeProduto` e em `dados/produtos/<SKU>/proposta/`.
- Nenhum endereço vem da conversa: foto só por id das ofertas vinculadas; download por `bytesDe` (filtro de rede pública).
- Acesso: recurso `acao.produtos.proporCadastro` (executar), só Administrador; ler ofertas exige também `dado.custo` e `dado.concorrentes`.
- Produto Conferido: toda ferramenta recusa com "já aprovado: nada a propor".
- Limites: 20 ids por `baixarCandidatas`, 60 candidatas guardadas por produto, 24 por página da folha, descrição de oferta cortada em 3.000 caracteres.
- Ferramentas da proposta SEM o lembrete do `anotarDuvida`; registro em `ChamadaMcp` como as outras.
- PDFs fora do MCP (seção `documentos` só com links).
- Arquivos da outra sessão (`servidor.js`, `recursos.js`, `teste-mcp.js`, `teste-acessos.js`): só os trechos desta tarefa, commit pelos caminhos ou por índice temporário (ver CLAUDE.md e a memória "Commit só dos meus trechos").

## Review Focus

1. Id de foto inventado ou de outro produto em `baixarCandidatas`: recusa aquele id em `falharam`, sem baixar (Task 2).
2. Foto que não abre (HTML no lugar de imagem, 404): vai para `falharam` com o motivo e não derruba as outras (Task 2).
3. `gravarSecao` de `fotos` citando arquivo que não foi baixado: recusa a seção inteira com a mensagem (Task 4).
4. Login sem `acao.produtos.proporCadastro`: as cinco recusam antes de ler o banco (Task 1 e Task 4).
5. Folha pedida numa página além da última: devolve a última página válida com o aviso, não imagem vazia (Task 3).

---

### Task 1: leitura para a proposta e as ferramentas de leitura

**Files:**
- Create: `src/lib/proposta/leitura.js`
- Create: `src/lib/mcp/proposta.js`
- Modify: `src/lib/mcp/servidor.js` (importar `FERRAMENTAS_DA_PROPOSTA` e registrar sem o lembrete; uma linha nas `INSTRUCOES`)
- Modify: `src/lib/acessos/recursos.js` (o recurso `acao.produtos.proporCadastro`, "Propor cadastro (proposta automática)", tela `tela.produtos`)
- Modify: `scripts/preencher-produto.js` (o comando `ofertas` passa a imprimir `lerParaProposta`)
- Test: `scripts/teste-proposta.js`, `scripts/teste-mcp.js`, `scripts/teste-acessos.js`

**Interfaces:**
- Produces: `lerParaProposta(sku, { prompt? }) -> { produto, fornecedores, concorrentes, agregado, prompts, promptTexto, proposta }`
  - `produto`: `{ id, sku, titulo, conferido, campos: { marca, modelo, unidade, garantiaMeses, ncm, origem, pesoKg, alturaCm, larguraCm, comprimentoCm, ean, precoVenda, estoqueMinimo, estoqueMaximo }, fotos: [{ arquivo, ordem }] }`
  - `concorrentes[]`: `{ loja, nome, codigo, precoNormal, precoPromocional, estoque, quantidade, ean, ncm, marca, modelo, descricao (≤ 3000), ficha, documentos: [{ titulo, url }], fotos: [{ id, url }] }`; `id` = `"<produtoColetadoId>:<indice>"`
  - `fornecedores[]`: `{ nome, codigo, custo, padrao, ncm }` (o NCM vem do produto coletado da fonte do fornecedor quando há código igual)
  - `proposta`: `null` ou `{ secoes: string[], naoAplicadas: string[] }`
- Produces: `fotoDaOferta(sku, id) -> { url, loja } | null` (usado na Task 2)
- Produces: `FERRAMENTAS_DA_PROPOSTA` (lista; a Task 2, 3 e 4 acrescentam)
- Produces: `exigirProposta(contexto)` em `src/lib/mcp/proposta.js`: lança `ErroDeFerramenta` sem o recurso.

- [ ] **Step 1: testes que falham**
  - `teste-proposta`: `lerParaProposta("ZZ-PROP-6")` (produto com 1 concorrente coletado de teste com 2 fotos, 1 fornecedor) devolve `concorrentes[0].fotos.length === 2`, ids no formato `"<id>:0"`, descrição cortada em 3.000; `fotoDaOferta("ZZ-PROP-6", "<id>:1")` devolve a url; `fotoDaOferta` de id de outro produto devolve `null`; produto Conferido devolve `produto.conferido === true`; `prompt: "Padrão do sistema"` traz `promptTexto`.
  - `teste-mcp`: com `pode` sem o recurso, `lerParaProposta` e `lerProposta` voltam `isError` e nenhuma consulta ao produto (conferir pela `ChamadaMcp` com `ok: false`); com o recurso, `lerParaProposta` devolve o JSON e **não** traz o lembrete (`content.length === 1`); a lista de ferramentas ganha `lerParaProposta` e `lerProposta` com `readOnlyHint: true`.
  - `teste-acessos`: o recurso `acao.produtos.proporCadastro` existe e o Administrador o tem.
- [ ] **Step 2:** `npm run teste:proposta`, `npm run teste:mcp`, `npm run teste:acessos` → falham nos casos novos.
- [ ] **Step 3:** implementar `leitura.js` (a consulta do `ofertas` de hoje + `lerCamposDasReferencias` + `promptsDaDescricao`), as duas ferramentas em `proposta.js` (`lerProposta` devolve a `PropostaDeProduto` como o `--ler`, sem base64), o registro e o recurso; o `ofertas` do script imprime `lerParaProposta`.
- [ ] **Step 4:** os três testes passam; `npm run lint` nos arquivos.
- [ ] **Step 5:** commit `MCP: lerParaProposta e lerProposta (proposta de produto, só leitura)`.

### Task 2: `baixarCandidatas`

**Files:**
- Create: `src/lib/proposta/candidatas.js`
- Modify: `src/lib/proposta/banco.js` (`gravarProposta` aceita `arquivo` já presente em `proposta/` e apaga as candidatas baixadas não citadas ao gravar `fotos`)
- Modify: `src/lib/mcp/proposta.js`
- Test: `scripts/teste-proposta.js`, `scripts/teste-mcp.js`

**Interfaces:**
- Consumes: `fotoDaOferta` (Task 1), `padronizarImagem`, `caminhoDaProposta`, `bytesDe` (`src/lib/imagensImportadas.js`, fonte `{ endereco }`).
- Produces: `baixarCandidatas(sku, ids, { baixar = bytesDe } = {}) -> { baixadas: [{ id, arquivo, loja, largura, altura }], falharam: [{ id, motivo }] }`
  - recusa (lança) com mais de 20 ids, produto Conferido ou inexistente;
  - recusa quando já há 60 candidatas na pasta (contando as citadas e as não citadas);
  - o mesmo id baixado de novo devolve o arquivo já guardado (guarda `id → arquivo` em `proposta/candidatas.json`).

- [ ] **Step 1: testes que falham** (`baixar` falso, sem rede)
  - 2 ids válidos → 2 `baixadas`, arquivos JPEG 1024x1024 em `proposta/`;
  - id de outro produto e id inventado → `falharam` com "não é foto das ofertas deste produto", e o `baixar` falso NÃO foi chamado para eles;
  - `baixar` que devolve HTML → `falharam` com o motivo do padronizador, e o outro id baixa normalmente;
  - 21 ids → lança "no máximo 20";
  - mesmo id duas vezes → mesmo `arquivo`, `baixar` chamado uma vez;
  - `gravarProposta` de `fotos` citando um `arquivo` baixado (sem bytes) → ok; citando arquivo que não existe → `ok: false`; candidata baixada e não citada sai da pasta depois de gravar `fotos`;
  - MCP: `baixarCandidatas` sem o recurso → `isError`; com o recurso, anotação `readOnlyHint: false`.
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** passa; lint.
- [ ] **Step 5:** commit `MCP: baixarCandidatas (o Rise baixa só as fotos das ofertas vinculadas)`.

### Task 3: `folhaDeContato`

**Files:**
- Create: `src/lib/proposta/folha.js`
- Modify: `src/lib/mcp/proposta.js` (resposta com conteúdo de imagem: `{ content: [{ type: "image", mimeType: "image/jpeg", data }, { type: "text", text: legenda }] }`)
- Test: `scripts/teste-proposta.js`, `scripts/teste-mcp.js`

**Interfaces:**
- Consumes: as candidatas guardadas (Task 2) e as fotos atuais do produto.
- Produces: `folhaDeContato(sku, { pagina = 1, tamanho = 256 } = {}) -> { jpeg: Buffer, legenda: [{ numero, id, arquivo, loja, atual }], pagina, paginas, aviso: string|null }`
  - até 24 por página, fotos atuais primeiro (`atual: true`), rótulo "número · loja" embaixo de cada miniatura (SVG composto pelo `sharp`);
  - `tamanho` só 160 ou 256; página além da última → a última, com `aviso`.

- [ ] **Step 1: testes que falham**: 3 candidatas + 2 atuais → `legenda.length === 5`, as 2 primeiras `atual`, JPEG que o `sharp` abre com largura > 0; 30 candidatas → `paginas === 2`, página 2 com 6; `pagina: 9` → página 2 e `aviso`; MCP devolve `content[0].type === "image"`.
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** passa; lint.
- [ ] **Step 5:** commit `MCP: folhaDeContato (as candidatas numa imagem para a conversa olhar)`.

### Task 4: `gravarSecao`, instruções e documentação

**Files:**
- Modify: `src/lib/mcp/proposta.js` (`gravarSecao` → `gravarProposta(sku, { secao, conteudo })`; anotação `idempotentHint: true`)
- Modify: `src/lib/mcp/servidor.js` (a linha das `INSTRUCOES` da spec)
- Modify: `docs/superpowers/roteiros/instrucao-projeto-claude-ai-proposta.md` ("Como entregar" vira gravar com `gravarSecao`; passos das fotos com `baixarCandidatas` e `folhaDeContato`)
- Modify: `docs/superpowers/roteiros/proposta-de-produto.md` (MCP como caminho; SSH vira "Reserva")
- Modify: `CLAUDE.md` (seção "Preencher produto pelo servidor": a proposta pelo MCP)
- Test: `scripts/teste-mcp.js`

- [ ] **Step 1: testes que falham**: `gravarSecao` de `titulos` válida → `secoes` contém `titulos`; seção inválida → `isError` com a mensagem de `validarPlano`; produto Conferido → `isError` "já aprovado"; sem o recurso → `isError`; as `INSTRUCOES` citam `gravarSecao`; nenhuma linha de `ProdutoArquivo` muda.
- [ ] **Step 2:** rodar → falha.
- [ ] **Step 3:** implementar; atualizar os três documentos.
- [ ] **Step 4:** `teste:proposta`, `teste:mcp`, `teste:acessos`, `teste:imagens` passam; lint.
- [ ] **Step 5:** commit `MCP: gravarSecao e as instruções da proposta pelo MCP`.

### Task 5: deploy e a primeira proposta pelo claude.ai

- [ ] **Step 1:** o dono diz "sobe"; deploy pelo cartão "Atualizar a VPS".
- [ ] **Step 2:** o dono cola a instrução nova no Projeto "Rise" e pede "criar proposta" de um produto; a sessão acompanha pela `ChamadaMcp` e confere com `lerProposta`.
- [ ] **Step 3:** registrar no roteiro o que a primeira rodada ensinou.
