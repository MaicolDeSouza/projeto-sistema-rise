# Proposta de produto pelo MCP (sem SSH)

Data: 21/10/2026. Pedido do dono: fazer a proposta automática de produto inteira pelo servidor MCP do Rise, em vez do
script por SSH, para que qualquer conversa (o Projeto "Rise" do claude.ai, o ChatGPT, o próprio Claude Code) siga o
mesmo caminho. Continua a spec `2026-10-16-proposta-automatica-de-produto-design.md` (regras, seções, tela, Conferido:
nada disso muda) e usa o servidor MCP de 20/10/2026 (`src/lib/mcp/`, plano `2026-10-20-mcp-rise-e-rumo-do-rise-ai.md`).

## Intenção

Hoje a proposta é gravada por SSH: a sessão roda `scripts/preencher-produto.js` dentro do contêiner, com acesso ao banco
inteiro e às chaves. Pelo MCP, a conversa alcança SÓ o que as ferramentas deixam (ler o que a proposta precisa e gravar a
proposta), com a validação no servidor e cada chamada registrada. A inteligência continua sendo da conversa (sem a API
paga do Rise); o Conferido continua sendo o portão do dono.

## Goals

- Uma conversa conectada ao MCP faz a proposta inteira: ler, baixar e olhar as fotos, gravar as 8 seções, conferir.
- Mesmas regras e mesma validação do caminho por SSH (`validarPlano`, `gravarProposta`): um código só, dois caminhos.
- Menor privilégio: nenhuma ferramenta toca em `Produto` nem em `ProdutoArquivo`; só em `PropostaDeProduto` e na pasta
  `proposta/`.
- O SSH fica como reserva (administração e emergência), sem ser o caminho do dia a dia.

## Non-goals

- Baixar PDFs de concorrentes pelo MCP (download de arquivo pede o "pode" do dono, um a um): a seção `documentos` leva só
  os links.
- Pesquisar na internet pelo Rise: a conversa usa as ferramentas dela.
- Aplicar a proposta ao produto, salvar ou Conferir pelo MCP: continua na tela, com o dono.

## Anti-goals

- Ferramenta que aceite um endereço qualquer para baixar (viraria porta para o servidor buscar o que alguém mandar).
- Ferramenta que grave em produto Conferido, ou fora da proposta.
- Resposta gigante (fotos em base64 no JSON, todas as fichas inteiras de uma vez) que estoure o limite da conversa.

## As ferramentas

Todas no padrão do MCP do Rise: `{ nome, descricao, esquema (zod), executar(argumentos, contexto) }`, erro de uso por
`ErroDeFerramenta`, registro em `ChamadaMcp` (os argumentos passam por `argumentosParaRegistro`), conferência de acesso
pelo `contexto.pode` antes de ler o banco. Ficam num arquivo próprio, `src/lib/mcp/proposta.js`, exportando
`FERRAMENTAS_DA_PROPOSTA`, registrado no `servidor.js` ao lado de `FERRAMENTAS_DE_CADASTRO` (a única linha no arquivo da
outra sessão).

**Acesso:** recurso novo `acao.produtos.proporCadastro` (executar) no catálogo de Acessos, dado só à função
Administrador. Ler as ofertas exige também `dado.custo` e `dado.concorrentes` (as mesmas regras de `buscarNoMercado`).

### 1. `lerParaProposta`

- Entrada: `{ sku, prompt?: string }`.
- Saída: o produto (título com as palavras-chave do dono, código, campos já preenchidos, fotos atuais com o nome do
  arquivo, Conferido, se já há proposta e quais seções estão gravadas), os **fornecedores** vinculados (nome, custo,
  código, padrão, NCM da lista), os **concorrentes** vinculados (loja, nome, preço normal, estoque, EAN, NCM, marca,
  modelo, medidas lidas, ficha, descrição cortada em 3.000 caracteres, documentos como links, e as fotos como uma lista
  de `{ id, url }`), o agregado de EAN/NCM/marca/modelo/medidas por loja (o `lerCamposDasReferencias` de hoje), a lista
  de **prompts** da biblioteca (`nome`, `padrao`) e, quando `prompt` vem, o **texto** daquele prompt (ou do padrão).
- Recusa: produto inexistente; produto Conferido (com a frase "já aprovado: nada a propor").
- É o `ler` + `ofertas` do script, movidos para `src/lib/proposta/leitura.js` (o script passa a usar o mesmo módulo).

### 2. `baixarCandidatas`

- Entrada: `{ sku, ids: string[] }` (até 20 por chamada), onde cada id é uma foto da lista de `lerParaProposta`.
- O Rise acha o endereço de cada id **nas ofertas vinculadas ao produto** (nunca aceita endereço vindo da conversa),
  baixa com `bytesDe` (o filtro de rede pública que já protege a coleta), padroniza em 1024x1024 e grava em
  `proposta/<32hex>.jpg`, como candidata ainda não escolhida.
- Saída: `{ baixadas: [{ id, arquivo, loja, largura, altura }], falharam: [{ id, motivo }] }`.
- Teto: 60 candidatas guardadas por produto; acima disso recusa e pede para gravar a seção `fotos` antes.
- Candidata baixada e nunca citada numa seção `fotos` é apagada quando a seção é gravada, e a pasta inteira some no
  Conferido (como hoje).

### 3. `folhaDeContato`

- Entrada: `{ sku, pagina?: number, tamanho?: 160|256 }`.
- Saída: **imagem** (conteúdo MCP `{ type: "image", mimeType: "image/jpeg", data }`) com até 24 candidatas por página,
  numa grade, cada uma com o id e a loja escritos embaixo; mais um texto com a legenda (id → arquivo, loja). As fotos
  atuais do produto entram primeiro, marcadas "atual".
- Serve para a conversa OLHAR as fotos e aplicar os critérios (primeira ilustra o título, ângulos, mesmo tom, sem
  desfoque, sem marca d'água, nada que contradiga a ficha). Montada com `sharp` (composição com SVG para os rótulos).
- `foto(sku, id)` à parte, em tamanho 1024, fica fora desta versão (a folha em 256 basta para o zoom do caso real);
  entra se a primeira rodada mostrar que falta.

### 4. `gravarSecao`

- Entrada: `{ sku, secao, conteudo }`, o mesmo `{ secao, conteudo }` do plano de hoje (`validarPlano`).
- Fotos: cada candidata cita `arquivo` (o devolvido por `baixarCandidatas`) ou `fotoAtual`; `gravarProposta` passa a
  aceitar `arquivo` que já está em `proposta/` mesmo sem ter sido citado antes (hoje só aceita bytes novos ou arquivo
  citado na seção anterior).
- `documentos`: só links (sem `arquivos`): a conversa não baixa PDF.
- Recusa: produto Conferido; seção inválida (a mensagem de `validarPlano` volta como está, para a conversa corrigir).
- Saída: `{ secoes, aviso }`.
- Anotação MCP: `readOnlyHint: false`, `destructiveHint: false`, `idempotentHint: true` (gravar de novo substitui a seção).

### 5. `lerProposta`

- Entrada: `{ sku }`. Saída: a proposta como `--ler` mostra hoje, sem o texto inteiro das fotos (ids, arquivos, motivos).

## O lembrete do `anotarDuvida`

As ferramentas de proposta **não** levam o lembrete de anotar dúvida: proposta não é pergunta de atendimento, e a
anotação encheria a Revisão do dia. A `ChamadaMcp` registra cada chamada do mesmo jeito. (Escolha da sessão; o dono pode
pedir o contrário.)

## Instruções do servidor e do Projeto

- `INSTRUCOES` do servidor ganham uma linha: "Para montar a proposta de cadastro de um produto, use lerParaProposta,
  baixarCandidatas, folhaDeContato e gravarSecao, nessa ordem; a proposta nunca altera o produto."
- A instrução do Projeto (`docs/superpowers/roteiros/instrucao-projeto-claude-ai-proposta.md`) troca "Como entregar"
  por "grave cada seção com gravarSecao e confira com lerProposta", e ganha os passos das fotos.
- O roteiro do Claude Code (`proposta-de-produto.md`) passa a usar o MCP; o SSH vira a seção "Reserva".

## Testes

- `teste:proposta`: `leitura.js` (o mesmo resultado do `ofertas` de hoje no `100103-teste` do PC), `gravarProposta`
  aceitando arquivo já baixado, a limpeza das candidatas não citadas, o teto de 60.
- `teste:mcp`: as 5 ferramentas pelo servidor de verdade (`montarServidorMcp` com um registrador falso): recusa sem o
  recurso, recusa em produto Conferido, `baixarCandidatas` recusando id que não é das ofertas, `folhaDeContato`
  devolvendo imagem, `gravarSecao` com seção inválida devolvendo a mensagem, e o registro em `ChamadaMcp`.
- `teste:acessos`: o recurso novo no catálogo e o guarda estático.
- Na VPS, depois do deploy: uma proposta real feita pelo Projeto "Rise" do claude.ai.

## Ordem de entrega

1. `leitura.js` + `lerParaProposta` + `lerProposta` (só leitura: pode ir ao ar primeiro).
2. `baixarCandidatas` + `folhaDeContato`.
3. `gravarSecao` + o recurso de acesso + as instruções (servidor, Projeto, roteiro).
4. Deploy ("sobe") e a primeira proposta pelo claude.ai.

## Decidido pelo dono

- Fazer a proposta pelo MCP, com o SSH só de reserva (21/10/2026).
- As regras da proposta são as da spec de 16/10/2026 (sem mudança).

## Escolhas da sessão (o dono pode mudar)

- Recurso `acao.produtos.proporCadastro`, só Administrador.
- 20 fotos por chamada, 60 candidatas por produto, 24 por folha.
- Sem o lembrete do `anotarDuvida` nas ferramentas de proposta.
- PDFs fora do MCP; documentos só como links.
- `foto(sku, id)` em 1024 fica para depois.

## Coordenação

O servidor MCP é da outra sessão. Esta spec só acrescenta um arquivo (`src/lib/mcp/proposta.js`), uma linha no
`servidor.js` (registrar a lista), uma linha nas `INSTRUCOES` e um recurso no catálogo de Acessos. Antes de mexer em
`servidor.js`, conferir o `git status` e commitar só os próprios trechos.
