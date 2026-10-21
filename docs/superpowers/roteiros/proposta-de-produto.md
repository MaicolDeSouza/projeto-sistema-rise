# Proposta automática de produto: onde estão as regras

**As regras moram no Rise:** `src/lib/proposta/roteiro.js` (o roteiro único, com versão), entregue a qualquer
assistente pela ferramenta `roteiroDaProposta` do MCP. Este arquivo NÃO tem mais regra: mudar critério é editar o
roteiro no Rise e subir `VERSAO_DO_ROTEIRO` (cada proposta grava a versão que seguiu). A instrução do Projeto do
claude.ai está em `instrucao-projeto-claude-ai-proposta.md` e só manda ler o roteiro.

O que o Rise faz sozinho ao gravar (a LLM não precisa acertar): o preço (custo do fornecedor padrão, concorrentes com
estoque, sem a 4hobby), o próximo código 25xxxx (vem na leitura), a recusa do EAN de outro produto, as 6 fotos, o
formato de cada seção e o teste dos links dos documentos.

Caminho do dia a dia: o MCP (`roteiroDaProposta` → `lerParaProposta` → `baixarCandidatas` → `folhaDeContato` →
`gravarSecao` → `lerProposta`). O SSH abaixo é só reserva (administração e emergência), e baixar PDF de documento
continua pedindo o "pode" do dono, um a um.

## Reserva: por SSH (administração e emergência)

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
