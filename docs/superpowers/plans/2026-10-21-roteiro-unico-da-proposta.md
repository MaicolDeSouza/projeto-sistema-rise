# Roteiro único da proposta (spec + plano)

Data: 21/10/2026. Pedido do dono: "hoje tem 3 caminhos (o plano, o roteiro e as instruções do Projeto). Gostaria de
unificar tudo, imaginando que posso mudar de LLM e deve funcionar igual." Opção 1 escolhida pelo dono.

## Spec

**Intenção.** Um texto só de regras da proposta, DENTRO do Rise, entregue pelo MCP a qualquer LLM conectada. O que é
conta ou checagem sai da mão da LLM e vira código; para a LLM sobra o julgamento (escrever, escolher fotos, pesquisar).

**Goals**
- `src/lib/proposta/roteiro.js`: `ROTEIRO` (texto para qualquer LLM, sem SSH nem Claude Code) e `VERSAO_DO_ROTEIRO`.
- Ferramenta MCP `roteiroDaProposta` (só leitura, mesmo acesso das outras da proposta): devolve `{ versao, roteiro }`.
- Toda seção gravada carimba `PropostaDeProduto.versaoDoRoteiro` com a versão em vigor.
- O Rise calcula o PREÇO ao gravar a seção `preco`: custo do fornecedor padrão (ou o rascunho do Bling), concorrentes
  com preço normal (`normal ?? promocional`), sem os indisponíveis e sem a própria loja (fonte com "4hobby" no domínio
  ou no nome), pela `opcoesDePreco`. O que a LLM mandar nos números é ignorado; `observacao` dela fica.
- `lerParaProposta` traz `proximoCodigo` (o próximo 25xxxx livre, a mesma regra do `gerarSku`, agora em
  `src/lib/proposta/codigo.js` e usada pelos dois).
- Seção `ean` com `escolhido` igual ao EAN de OUTRO produto do Rise é recusada, dizendo qual.
- A instrução do Projeto vira 3 linhas; o roteiro antigo (`docs/superpowers/roteiros/proposta-de-produto.md`) fica só com a
  reserva por SSH e aponta para o do Rise; o plano é só histórico.

**Non-goals.** Catálogo do ML por GTIN pela LLM (fica "pesquisar no site"); mudar a tela da proposta.

**Decidido pelo dono.** Opção 1 (21/10/2026). **Escolhas da sessão:** roteiro em `.js` (o texto entra no build, sem ler
arquivo em produção); a própria loja reconhecida por "4hobby" no domínio ou no nome da fonte; versão "2".

## Plano (3 tarefas; o dono autoriza uma a uma)

### Tarefa 1: regras no código (preço, próximo código, EAN repetido)
- Create `src/lib/proposta/codigo.js`: `proximoCodigoLivre(prismaCliente = prisma)`; `gerarSku` passa a usá-lo.
- `src/lib/proposta/leitura.js`: `proximoCodigo` no resultado; `precoCalculado(produtoId)` (ou em `regras`/`banco`).
- `src/lib/proposta/banco.js`: seção `preco` → `conteudo` recalculado (`custo`, `opcoes`, `recomendada`,
  `motivoSemRecomendada`, `concorrentesUsados`, `foraDaConta`); seção `ean` → recusa EAN de outro produto.
- Testes (`teste:proposta`): preço recalculado ignora os números mandados; loja 4hobby e concorrente sem estoque fora;
  sem custo → sem recomendada; `proximoCodigo` pula SKU e código de kit; EAN de outro produto recusado.

### Tarefa 2: roteiro único no Rise e a ferramenta
- Create `src/lib/proposta/roteiro.js` com o roteiro reescrito para qualquer LLM (as regras de hoje, das duas fontes,
  sem divergência: as 6 lacunas da avaliação de 21/10/2026 incluídas).
- `src/lib/mcp/proposta.js`: `roteiroDaProposta`; linha nas `INSTRUCOES` do servidor ("chame roteiroDaProposta primeiro").
- `gravarProposta` carimba `versaoDoRoteiro`.
- Testes (`teste:mcp`, `teste:proposta`): a ferramenta devolve a versão e cita as 8 seções; sem o recurso recusa; a
  proposta gravada leva a versão.

### Tarefa 3: documentos e deploy
- Instrução do Projeto vira 3 linhas; roteiro antigo vira "Reserva por SSH"; CLAUDE.md; memória.
- Deploy só com o "sobe"; o dono troca a instrução do Projeto e roda uma proposta.
