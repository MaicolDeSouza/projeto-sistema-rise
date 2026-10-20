# Roteiro da sessão: proposta automática de produto (versão 1)

O que a sessão do Claude faz a cada produto que o dono passa. Spec:
`docs/superpowers/specs/2026-10-16-proposta-automatica-de-produto-design.md`. Mudar critério é editar **este arquivo**
(e subir `versaoDoRoteiro` quando a mudança for de regra), não o código.

## Regras que valem em todo passo

- **Sem a API do Rise.** A pesquisa, a leitura das fotos e a escrita são da sessão. O comando `descricao` do script
  (que chama a API paga) **não** entra neste roteiro.
- **Nada no cadastro.** Tudo vai para a proposta pelo comando `proposta`. O dono aplica, salva e marca Conferido.
- **Nunca inventar.** Valor sem fonte fica `?` (descrição) ou vazio (campos), e o relatório diz.
- **Toda escolha leva a origem** (loja, site, busca), em texto curto que o dono confere em um clique.
- **Um produto por vez.** Produto Conferido: não há o que fazer (o script recusa).
- **Fotos de concorrentes:** o uso é decisão do dono; o relatório lembra.

## Como rodar (VPS)

```bash
SSH="ssh -i ~/.ssh/rise_vps rise@179.199.150.221"
# consulta
$SSH "cd /srv/rise/app && docker compose exec -T app node --input-type=module - ofertas <SKU>" < scripts/preencher-produto.js
$SSH "cd /srv/rise/app && docker compose exec -T app node --input-type=module - ler <SKU>" < scripts/preencher-produto.js
# gravar uma secao: o plano vai para /tmp do conteiner, roda, e e apagado
cat plano.json | $SSH "cd /srv/rise/app && docker compose exec -T app sh -c 'cat > /tmp/plano.json'"
$SSH "cd /srv/rise/app && docker compose exec -T app node --input-type=module - proposta <SKU> --plano=/tmp/plano.json" < scripts/preencher-produto.js
$SSH "cd /srv/rise/app && docker compose exec -T app rm -f /tmp/plano.json"
# conferir
$SSH "cd /srv/rise/app && docker compose exec -T app node --input-type=module - proposta <SKU> --ler" < scripts/preencher-produto.js
```

Plano de uma seção: `{ "secao": "<nome>", "conteudo": { ... }, "arquivos": { "<id>": "<base64>" } }`. `arquivos` só
nas seções `fotos` e `documentos`. Gravar de novo a mesma seção a substitui (e apaga os arquivos que ela deixou de usar).
Os planos e as fotos baixadas ficam na pasta de trabalho da sessão no PC (scratchpad), nunca no repositório.
**Escrever na VPS pede o "pode" do dono para aquele produto** (o permissionamento da sessão barra a escrita remota sem ele).

## Passo 0 — leitura

1. `ler <SKU>`: título com as palavras-chave do dono, código, campos já preenchidos, fotos atuais, Conferido.
2. `ofertas <SKU>`: concorrentes e fornecedores vinculados com nome, preço normal, estoque, EAN, NCM, marca, modelo,
   medidas, ficha, descrição, documentos e as URLs das fotos.
3. Sem concorrente nem fornecedor vinculado: parar e avisar o dono (a proposta não tem base).

## Passo 1 — descrição (primeiro: alimenta os outros)

- Prompt: o que o dono indicar; sem indicação, o marcado como padrão na biblioteca do Rise; sem nenhum, o "Padrão do
  sistema". Ler o texto do prompt na VPS (tabela `PromptDescricao`) e seguir como instrução.
- Fonte: os dados de **todos** os concorrentes e fornecedores vinculados.
- Formato da loja: título em MAIÚSCULAS; 2 parágrafos de até 230 caracteres, sem linha em branco entre eles;
  `Especificações técnicas:` com `- Nome: valor;` (as duas últimas: `- Dimensões(CxLxA): 43x18x19mm;` e `- Peso: 7g;`,
  com os valores do passo dos campos); `Itens inclusos: (Cod:<SKU>)` com `- 01 ITEM;`; `Garantia:` com
  `- Garantia Legal de 90 dias (contra defeitos de fabricação);`. Quebra de linha `\r\n`.
- Campo que o prompt pede e ninguém informa: **pesquisa profunda** (datasheet do fabricante primeiro, depois lojas e
  fóruns). Só preenche com fonte; senão `?`.
- Divergência entre lojas: a sessão decide e registra (campo, opções com as lojas, a escolhida e o porquê).
- Descartar das especificações texto de marketing ("Automação Residencial: Perfeito para...").

```json
{ "secao": "descricao", "conteudo": {
  "texto": "PLACA ...\r\n\r\n...",
  "prompt": "Embarcados-Arduino",
  "divergencias": [{ "campo": "Peso", "opcoes": [{ "valor": "6g", "lojas": ["4hobby"] }, { "valor": "7g", "lojas": ["Smartkits", "Saravati"] }], "escolhida": "7g", "motivo": "oficial do fabricante" }],
  "pesquisadas": [{ "linha": "- Resolução do ADC: 10 bits;", "fonte": "https://..." }],
  "interrogacoes": ["Temperatura de Operação"]
} }
```

## Passo 2 — títulos

- Base: as palavras-chave do título do dono e os títulos dos concorrentes vinculados.
- 3 opções em MAIÚSCULAS, até 60 caracteres, no padrão TIPO + FUNÇÃO + MODELO/CI + ESPECIFICAÇÃO + COMPATIBILIDADE
  (`src/lib/ia/padraoTitulo.js`), variando o que ganha espaço. Uma recomendada (índice 0 a 2).
- O título do produto **não** muda.

```json
{ "secao": "titulos", "conteudo": { "opcoes": ["...", "...", "..."], "recomendada": 0, "motivo": "...", "concorrentes": ["TÍTULO DA LOJA A", "..."] } }
```

## Passo 3 — fotos

- Candidatas: todas as fotos dos concorrentes vinculados (URLs do `ofertas`) e as atuais do produto. Baixar as dos
  concorrentes para o PC; montar folhas de contato e olhar de verdade (zoom quando precisar).
- Escolher **6 a 8** (com menos de 6 candidatas, todas):
  - a **primeira ilustra o título** (título com cabo, primeira com cabo);
  - ângulos variados quando existem (cima, lado, baixo, chips em close);
  - **mesmo tom** de cor da placa entre todas;
  - sem desfoque, sem repetidas ou quase iguais, sem marca d'água ou banner de loja;
  - nada que contradiga a ficha (diagrama de outra variante, conector diferente, pinos soltos se o produto vai soldado).
- Foto atual do produto entra como `fotoAtual` (nome do arquivo em `imagens/`, do `ler`), sem `arquivos`.
- Toda candidata, escolhida ou não, leva o motivo.

```json
{ "secao": "fotos", "conteudo": { "candidatas": [
  { "id": "21", "origem": { "loja": "Mamute Eletrônica", "url": "https://..." }, "escolhida": true, "ordem": 0, "motivo": "placa com cabo, vista de cima" },
  { "id": "A1", "fotoAtual": "ff8a54bb4c9f4119bae9439db9e2c21b.jpg", "origem": { "loja": "Rise (foto atual)" }, "escolhida": true, "ordem": 1, "motivo": "..." },
  { "id": "17", "origem": { "loja": "Smartkits", "url": "https://..." }, "escolhida": false, "motivo": "diagrama com FT232, contradiz o CH340" }
] }, "arquivos": { "21": "<base64>", "17": "<base64>" } }
```

## Passo 4 — campos (uma seção `campos`)

Cada campo `{ "valor": ..., "origem": "..." }`. Campo que a sessão não consegue propor com fonte fica **fora** do objeto.

- **marca:** fabricante claro vira a marca (NEXTION, ESPRESSIF); placa compatível com Arduino = `GENÉRICA`; dúvida =
  `GENÉRICA`. MAIÚSCULAS. Nome de loja nunca é marca.
- **modelo:** pelo mesmo processo (NANO V3); sem evidência, fora do objeto.
- **unidade:** `KIT` só em composição; `MT` (metro) quando título, descrição ou fornecedor mostram venda por
  comprimento; `UN` no resto (lista fechada em `src/lib/unidades.js`: UN, MT, KIT, HR).
- **codigo:** só se o produto não tem SKU: o próximo 25xxxx (maior usado + 1, pulando os códigos de kit dos anúncios,
  a regra de `gerarSku`). Com SKU, fora do objeto. **Localização nunca.**
- **garantiaMeses:** sempre `3`.
- **pesoKg, alturaCm, larguraCm, comprimentoCm:** a da **Usinainfo** quando ela é concorrente vinculada e publica; sem
  ela, a mais repetida entre os concorrentes; empate, a do fabricante (`escolherMedidas` em
  `src/lib/proposta/regras.js`). Campo já preenchido no produto: fora do objeto.
- **ncm:** o da **Fortek** quando é fornecedor vinculado e publica; sem ela, o de outro fornecedor ou o mais repetido
  (`escolherNcm`). Sem fornecedor com NCM: fora do objeto, e o relatório lista os NCMs dos concorrentes.
- **origem (fiscal):** `2` com fornecedor vinculado, `0` sem (`origemFiscal`). Campo já preenchido: fora do objeto.
- Estoque mínimo e máximo: **não** propor; em branco no produto, o relatório diz.

```json
{ "secao": "campos", "conteudo": { "marca": { "valor": "GENÉRICA", "origem": "placa compatível com Arduino" }, "garantiaMeses": { "valor": 3, "origem": "regra da loja" } } }
```

## Passo 5 — preço (seção `preco`)

- Custo do fornecedor padrão (`ofertas`). Concorrentes com o preço **normal** e o estoque (os sem estoque saem da conta).
- Rodar `opcoesDePreco(custo, concorrentes)` de `src/lib/proposta/regras.js` no PC, com os números do `ofertas`, e
  gravar o resultado como está, junto do custo usado.

```json
{ "secao": "preco", "conteudo": { "custo": 18.9, "opcoes": [ "<as 3 opções de opcoesDePreco>" ], "recomendada": "<a recomendada ou null>", "motivoSemRecomendada": null } }
```

## Passo 6 — EAN (seção `ean`)

1. Juntar os EANs dos concorrentes; dígito verificador inválido sai; prefixo não brasileiro anota baixa confiança.
2. Consultar cada um em Cosmos, EAN-Search e Product-Search e conferir a descrição.
3. Catálogo do Mercado Livre por GTIN (`/products/search?site_id=MLB&product_identifier=`, só leitura).
4. Pesquisa profunda na internet pelos mesmos EANs.
5. Nada coincide: buscar nos 3 sites e no ML por **palavras-chave** do produto; o achado passa pela mesma conferência.
6. Nada confiável: `escolhido: null`. EAN não se gera. Um EAN já usado por outro produto do Rise vai para os descartados.

```json
{ "secao": "ean", "conteudo": { "escolhido": null, "descartados": [{ "valor": "7671459174876", "motivo": "prefixo não brasileiro; a descrição no EAN-Search é de outro produto" }] } }
```

## Passo 7 — documentos (seção `documentos`)

Datasheets e manuais que os concorrentes publicam, com link; baixar os PDFs de fabricante (o script confere que é PDF).

```json
{ "secao": "documentos", "conteudo": { "itens": [{ "id": "d1", "titulo": "Datasheet ATmega328P", "url": "https://...", "loja": "Usinainfo" }] }, "arquivos": { "d1": "<base64>" } }
```

## Passo 8 — relatório (seção `relatorio`, por último)

Texto curto: o que foi feito, divergências resolvidas, dúvidas, o que ficou `?` ou vazio, estoque mínimo e máximo em
branco, NCM dos concorrentes diferente do proposto, lembrete das fotos de concorrentes, tempo gasto.

```json
{ "secao": "relatorio", "conteudo": { "texto": "..." } }
```

## Ao terminar

`proposta <SKU> --ler` e conferir as 8 seções. Dizer ao dono, em português, o resumo e o que ele precisa olhar.

## Aprendido na primeira rodada (20/10/2026, `100103-teste` no banco do PC)

- **Gravar as 8 seções levou 43 s** (43 candidatas padronizadas); a pesquisa e a análise vêm antes e levam mais.
- **Sites de EAN recusam leitura automática** (EAN-Search, Product-Search e Cosmos dão 403 ao `WebFetch`): consultar
  pelo **navegador do app** (EAN-Search e Product-Search abrem; o Cosmos pede a verificação da Cloudflare, que não se
  contorna: registrar "não consultado"). A busca por palavras-chave traz só EANs **de outros vendedores** (cada loja
  europeia com o próprio código): não servem como o EAN do produto.
- **Catálogo do ML por GTIN** não foi consultado nesta rodada: fazer pela VPS (o token de lá) quando a rodada for lá.
- **Baixar PDF é download de arquivo:** pede o "pode" do dono (nome, origem e tamanho). Sem ele, a seção `documentos`
  leva só os links, e o relatório diz o que o produto já tem.
- **Campos já preenchidos** (peso, medidas, NCM, origem) ficam fora de `campos`; quando a regra (Usinainfo primeiro)
  aponta outro valor, o relatório mostra os dois e o dono decide. As linhas Dimensões e Peso da descrição seguem o campo
  do produto.
- **A recomendada de preço pode ficar abaixo de 40%** (no Nano: 39%, R$ 34,37, 5º de 11), porque é a maior margem que
  ainda fica entre os 5 primeiros. A própria loja (4hobby, vinculada como concorrente) fica fora da conta.
