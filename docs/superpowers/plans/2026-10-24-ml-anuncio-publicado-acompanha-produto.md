# Anúncio publicado do ML acompanha o produto: plano de execução

> **Para quem executa:** executar inline (decisão do dono: sem subagentes), tarefa por tarefa, com `superpowers:executing-plans`. Passos com caixa (`- [ ]`).

**Objetivo:** o ícone do ML ganha o "!" quando um anúncio publicado fica diferente do produto (descrição, fotos, peso e medidas), e o editor ganha "Enviar mudanças ao ML".

**Arquitetura:** uma "impressão" do que foi mandado ao ML mora em `Anuncio.dados.publicacao.enviado` (JSON, sem migration). Uma regra pura compara essa impressão com a do produto de agora. A lista de Produtos e o editor usam a mesma regra, só com o banco. O envio fica num arquivo novo (`atualizar.js`), no molde do Publicar: uma volta, sem repetir sozinho, gravando parte por parte.

**Tecnologia:** Next.js 16, Prisma, JavaScript. Testes em `scripts/teste-anuncios-ml.js`, com o ML falso `scripts/lib/mlFalso.js`.

**Spec:** `docs/superpowers/specs/2026-10-24-ml-anuncio-publicado-acompanha-produto-design.md`

## Restrições globais

- Só descrição, fotos, peso e medidas acompanham o produto. Preço, título, ficha, frete, categoria e tipo nunca são enviados por este fluxo.
- As fotos são as validadas do produto (`papel: FOTO`), a principal primeiro, depois a ordem do cadastro (`fotosEmOrdem` de `rascunho.js`), cortadas no `maxFotos` da categoria.
- Kit montado no editor (`rascunho.composicao`): acompanha só a descrição.
- O pacote compara com o peso e as medidas DO PRODUTO (`pesoKg`, `alturaCm`, `larguraCm`, `comprimentoCm`), não com `rascunho.envio`.
- Nenhuma escrita repete sozinha. `ml.exigirEscrita(sku)` antes da primeira escrita.
- Permissão do botão: `acao.mercadoLivre.publicar` em executar (a mesma do Publicar, que também escreve no ML).
- Texto da tela com acento; identificadores e comentários sem acento. Commit só dos próprios arquivos (`git commit -- caminhos`).

## Pontos para a revisão

1. **Produto sem foto validada** (todas excluídas): o "!" não pode acender dizendo que "mudou" para zero fotos. A regra trata uma lista vazia do produto como "nada a mandar" em fotos, e o envio nunca manda `pictures: []`. Teste na Tarefa 1.
2. **Anúncio encerrado no ML** (closed, ou ENCERRADA no Rise): sem "!" na lista, e o envio recusa com o motivo. Teste nas Tarefas 2 e 4.
3. **Produto excluído ou peça do kit faltando no contexto**: `descricaoDoRise` devolve null. Sem descrição para comparar, a parte "descricao" fica de fora, em vez de acender. Teste na Tarefa 1.
4. **Envio clicado duas vezes**: a trava `emAndamento` (por anúncio) é compartilhada com o Publicar. O segundo clique responde "Envio em andamento". Teste na Tarefa 4.
5. **Peso ou medida faltando no produto**: sem as quatro medidas não há pacote para mandar. A parte "pacote" fica de fora, como `atributosDaEmbalagem` já faz. Teste na Tarefa 1.

---

### Tarefa 1: A regra pura da impressão e das mudanças

**Arquivos:**
- Criar: `src/lib/canaisDeVenda/ml/acompanhar.js` (puro, sem `node:crypto`: a lista e o editor leem)
- Criar: `src/lib/canaisDeVenda/ml/impressao.js` (só servidor: o md5 da descrição)
- Modificar: `src/lib/canaisDeVenda/ml/rascunho.js` (exportar `fotosEmOrdem` como `fotosDoRise(rascunho, produtosPorId)`: simples = fotos do produto; kit = `null`)
- Modificar: `src/lib/canaisDeVenda/ml/banco.js:74` (cada imagem de `contextoDosProdutos` ganha `arquivo`)
- Teste: `scripts/teste-anuncios-ml.js`, bloco novo "anuncio publicado acompanha o produto (regras)"

**Interfaces:**
- Produz `conteudoAtualDoAnuncio(rascunho, produtosPorId) -> { descricao: string|null, fotos: string[]|null, pacote: {alturaCm,larguraCm,comprimentoCm,pesoG}|null, kit: boolean }`. `fotos` são os NOMES DE ARQUIVO (`imagem.arquivo`), cortados em `maxFotos` só no envio. Kit: `fotos: null` e `pacote: null`. A descrição é o `plain_text` de `montarDescricaoML({ descricao: descricaoDoRise(...) })`, ou `null` se `descricaoDoRise` for null. O pacote usa o mesmo arredondamento de `atributosDaEmbalagem` (cm para cima, g arredondado) e fica `null` sem as quatro medidas.
- Produz `mudancasDoAnuncio(enviado, atual) -> { partes: Array<"descricao"|"fotos"|"pacote">, naoConferido: boolean }`. `enviado` e `atual` têm o formato da impressão: `{ descricao: md5|null, fotos: string[]|null, pacote: {...}|null }`. Sem `enviado`: `naoConferido: true` e `partes` = toda parte que o atual tem. Parte com `null` no atual nunca entra. Fotos: lista vazia no atual não entra. Pacote compara os quatro números.
- Produz em `impressao.js`: `impressaoDoConteudo(conteudo) -> { descricao: md5|null, fotos, pacote }` (md5 por `node:crypto` do texto exato).

- [ ] **Passo 1: Escrever os testes**

`conferir` com:
- igual → `{ partes: [], naoConferido: false }`;
- descrição diferente → `["descricao"]`;
- fotos em outra ordem → `["fotos"]`;
- uma foto a mais → `["fotos"]`;
- pacote com 1 g a mais → `["pacote"]`;
- três mudadas → as três, na ordem descricao, fotos, pacote;
- `enviado` null → `naoConferido: true` e as partes que o atual tem;
- desfazer (atual igual ao enviado de novo) → `[]`;
- produto sem foto (`fotos: []`) → "fotos" não entra (Ponto 1);
- `descricao: null` no atual → não entra (Ponto 3);
- pacote `null` no atual → não entra (Ponto 5);
- kit: `conteudoAtualDoAnuncio` de um rascunho com `composicao` → `fotos: null`, `pacote: null`, descrição com o bloco "Itens inclusos";
- simples: fotos com a principal primeiro e depois `ordem`, como `fotosEmOrdem`;
- `impressaoDoConteudo` → md5 de 32 hex, estável para o mesmo texto e diferente com 1 caractere a mais.

- [ ] **Passo 2:** `npm run teste:anuncios-ml` e ver os novos falharem (função não existe).
- [ ] **Passo 3:** implementar `acompanhar.js`, `impressao.js`, `fotosDoRise` e o `arquivo` em `contextoDosProdutos`.
- [ ] **Passo 4:** `npm run teste:anuncios-ml` passa inteiro, e `npx eslint` nos arquivos.
- [ ] **Passo 5:** commit "ML: regra da impressao do anuncio publicado e das mudancas do produto".

### Tarefa 2: O "!" do ícone e o cálculo na lista de Produtos

**Arquivos:**
- Modificar: `src/lib/canaisDeVenda/ml/icone.js`: `estadoDoIconeML` lê `anuncio.mudancas` (`{ partes, naoConferido }`, posto pelo servidor) e devolve também `desatualizado: boolean` e `partesDesatualizadas: string[]` (união das partes dos anúncios publicados, ATIVA ou PAUSADA). `rotuloDoIconeML` acrescenta "desatualizado: descrição, fotos e peso e medidas mudaram no produto" ou "ainda não conferido com o produto".
- Criar em `src/lib/canaisDeVenda/ml/banco.js`: `mudancasDosAnunciosML(anuncios) -> Map<anuncioId, {partes, naoConferido}>`, só para os anúncios ML com status PUBLICADO e situação ATIVA ou PAUSADA. Uma chamada a `contextoDosProdutos` com todos os produtos (principal e itens do kit) e `impressaoDoConteudo(conteudoAtualDoAnuncio(...))` comparada com `dados.publicacao.enviado`.
- Modificar: `src/app/produtos/page.jsx:140-153` (pôr `id` no select dos anúncios; chamar `mudancasDosAnunciosML` com os anúncios da página e pendurar `mudancas` em cada um antes de `estadoDoIconeML`).
- Modificar: `src/components/produtos/LinhaProduto.jsx:226` (o "!" aparece com `iconeML.erro || iconeML.desatualizado`).
- Teste: `scripts/teste-anuncios-ml.js`

- [ ] **Passo 1:** testes:
  - `estadoDoIconeML` com um publicado ATIVA e `mudancas.partes = ["descricao"]` → `desatualizado: true`;
  - PAUSADA → também `true`;
  - ENCERRADA com partes → `false` (Ponto 2);
  - RASCUNHO → `false`;
  - `naoConferido` → `desatualizado: true`;
  - rótulo contém "desatualizado: descrição mudou no produto".
  - `mudancasDosAnunciosML` no banco: um produto ZZ-ML-* com anúncio PUBLICADO e `enviado` igual → sem partes; muda a `descricaoBase` → `["descricao"]`; volta → `[]`.
- [ ] **Passo 2:** rodar e ver falhar.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm run teste:anuncios-ml` passa, mais o lint.
- [ ] **Passo 5:** commit "ML: o '!' do icone quando o anuncio publicado ficou para tras do produto".

### Tarefa 3: O Publicar manda as fotos do produto e grava a impressão

**Arquivos:**
- Modificar: `src/lib/canaisDeVenda/ml/banco.js` `carregarAnuncioML`: anúncio simples recebe `rascunho.imagens = fotosDoRise(rascunho, produtos)` (como a descrição e o estoque). `salvarRascunhoML` ignora as `imagens` da tela no anúncio simples. Devolver também `mudancas` (`mudancasDoAnuncio`) quando o anúncio está PUBLICADO.
- Modificar: `src/lib/canaisDeVenda/ml/publicar.js` `prepararInterno`: anúncio simples corta `rascunho.imagens` em `contexto.categoria.maxFotos` (quando lido). Etapa "gravar": grava `enviado: { ...impressaoDoConteudo(conteudoAtualDoAnuncio(rascunho, contexto.produtos)), fotos: <a lista cortada mandada>, em }`.
- Modificar: `src/components/anuncios/ml/AbaImagens.jsx`: no anúncio simples, só mostra as fotos (sem marcar nem mover), com a bolha "As fotos do anúncio são as validadas do produto, na ordem do cadastro". O kit continua como está.
- Teste: `scripts/teste-anuncios-ml.js`

- [ ] **Passo 1:** testes:
  - publicar um ZZ-ML-* com 3 fotos validadas e `rascunho.imagens` com só 1 → o `POST /items` do ML falso leva as 3 na ordem, e `dados.publicacao.enviado.fotos` tem os 3 nomes;
  - categoria com `maxFotos: 2` → leva 2;
  - `mudancasDosAnunciosML` logo depois → sem partes.
- [ ] **Passo 2:** rodar e ver falhar.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm run teste:anuncios-ml` passa (os testes antigos do Publicar continuam), mais o lint.
- [ ] **Passo 5:** commit "ML: o Publicar manda as fotos validadas do produto e grava a impressao".

### Tarefa 4: "Enviar mudanças ao ML"

**Arquivos:**
- Criar: `src/lib/canaisDeVenda/ml/atualizar.js`: `enviarMudancasML(anuncioId, { ml, lerFoto }) -> { ok, enviadas: string[], erro?, parte? }`.
- Modificar: `src/lib/canaisDeVenda/ml/publicar.js`: exportar `emAndamento`, `lerFotoDoDisco` e `tipoDaFoto` para o `atualizar.js` usar (uma trava só para Publicar e Enviar).
- Modificar: `scripts/lib/mlFalso.js`: `PUT /items/{id}/description` (grava `descricao`); `PUT /items/{id}` já mescla `pictures` e `attributes`; um jeito de marcar o item como `closed` no teste (`ml.encerrarItem(id)`); falha forçada por rota (`ml.falharEm("PUT", rota)`), se ainda não houver.
- Modificar: `src/app/canais-de-venda/mercado-livre/acoes.js`: `enviarMudancasMLAcao(anuncioId)`, com `negarSemAcessos(["acao.mercadoLivre.publicar", "executar"])` e `ehId`, revalidando `/canais-de-venda/mercado-livre` e `/produtos`.
- Teste: `scripts/teste-anuncios-ml.js`

**Interfaces:**
- Consome: `conteudoAtualDoAnuncio`, `mudancasDoAnuncio`, `impressaoDoConteudo` (Tarefa 1); `carregarAnuncioML`, `gravarPublicacao` (`banco.js`); `textoDaRecusaML`, `textoDoErroML`; `lerCategoriaCompleta` (para o `maxFotos`).

**Sequência** (a da spec). O anúncio precisa estar PUBLICADO com `publicacao.itemId`; senão: "O anúncio não está publicado."
1. Sem partes e sem `naoConferido`: `{ ok: true, enviadas: [] }`.
2. `ml.exigirEscrita(sku)`. No kit, o sku é o código do kit.
3. `GET /items/{itemId}`. Se `status === "closed"`: "O anúncio está encerrado no Mercado Livre: não dá para atualizar."
4. "descricao": `PUT /items/{id}/description` com `{ plain_text }`.
5. "fotos": sobe só as que faltam em `publicacao.fotos`, gravando cada id ao subir (como o Publicar). Depois `PUT /items/{id}` com `{ pictures: [{ id }] }` na ordem, cortada no `maxFotos`.
6. "pacote": `PUT /items/{id}` com `{ attributes: [SELLER_PACKAGE_*] }`, no formato de `atributosDaEmbalagem`.
7. Depois de cada parte que deu certo, `gravarPublicacao(anuncioId, { enviado: { ...anterior, <parte>: <valor>, em } })`. Na primeira falha, devolve `{ ok: false, parte, erro, enviadas }` e não tenta as seguintes.
8. No fim, grava `dados.imagens` = os ids de arquivo mandados (simples).

- [ ] **Passo 1:** testes:
  - descrição mudada → um `PUT` de descrição no ML falso, e depois `mudancasDosAnunciosML` sem partes;
  - foto nova → sobe só a nova, `PUT` com a lista inteira na ordem;
  - pacote mudado → `PUT` com os quatro `SELLER_PACKAGE_*`;
  - `naoConferido` → manda as três e grava a impressão inteira;
  - falha no `PUT` de fotos com a descrição antes → descrição gravada, fotos não, `ok: false`, `parte: "fotos"`, e as partes que restam são `["fotos", "pacote"]`;
  - item `closed` → recusa sem escrever (Ponto 2);
  - trava fechada (`exigirEscrita` lança) → recusa sem escrever;
  - duas chamadas ao mesmo tempo → a segunda devolve "Envio em andamento." (Ponto 4);
  - anúncio RASCUNHO → recusa.
- [ ] **Passo 2:** rodar e ver falhar.
- [ ] **Passo 3:** implementar.
- [ ] **Passo 4:** `npm run teste:anuncios-ml` passa, mais o lint.
- [ ] **Passo 5:** commit "ML: Enviar mudancas ao ML (descricao, fotos e pacote) no anuncio publicado".

### Tarefa 5: A faixa no editor

**Arquivos:**
- Modificar: `src/components/anuncios/ml/EditorAnuncioML.jsx`: com `status === "PUBLICADO"` e `mudancas` com partes ou `naoConferido`, uma faixa âmbar no topo, acima das abas. O texto é "O produto mudou depois de publicar: descrição, fotos." (os nomes: descrição, fotos, peso e medidas) ou "Ainda não conferido com o produto.". O botão "Enviar mudanças ao ML" chama `enviarMudancasMLAcao`. Enquanto envia: "Enviando..." e o botão desabilitado. Erro: a linha vermelha com `parte` e `erro`, e a faixa continua. Sucesso: popup `ConclusaoDoEnvio` ("Anúncio atualizado no Mercado Livre", listando as partes enviadas), e o editor relê o anúncio (`aoSalvar`/`iniciar` da `JanelaAnuncioML`, a página com `router.refresh()`). Sem `acao.mercadoLivre.publicar`, o botão fica desabilitado com o motivo no `title`.
- Modificar: `src/components/anuncios/ml/JanelaAnuncioML.jsx` e `EditorNaPagina.jsx`: passar `mudancas` e o recarregar.

- [ ] **Passo 1:** abrir o servidor do PC e conferir no navegador, num anúncio de teste ZZ-ML-* publicado no banco do PC (criado por script de teste, com `enviado` de outra descrição), que a faixa aparece e o botão com a trava do PC fechada mostra "Escrita bloqueada: ML_PUBLICACAO está false". Apagar o anúncio de teste depois.
- [ ] **Passo 2:** `npx eslint` nos arquivos.
- [ ] **Passo 3:** commit "ML: faixa 'o produto mudou' com Enviar mudancas ao ML no editor do anuncio publicado".

### Tarefa 6: Fechamento

- [ ] **Passo 1:** CLAUDE.md, na seção do ML: um parágrafo "Anúncio publicado acompanha o produto (24/10/2026)" com a impressão, a regra, o envio, o que não foi medido e o comando de teste. O contador de asserções do `teste:anuncios-ml` atualizado em "Rodar".
- [ ] **Passo 2:** rodar o ritual: lint, `teste:anuncios-ml`, `teste:extracao`, `teste:coleta`, `teste:cadastros` (o `teste:worker` sozinho, se o worker foi tocado: não foi).
- [ ] **Passo 3:** commit e push.
- [ ] **Passo 4:** perguntar ao dono o "sobe" e, depois dele, **o envio de teste num anúncio real com ele acompanhando** (o 100107 é o candidato: já tem a descrição mudada). Medir `PUT /items/{id}/description`, `PUT pictures` e `PUT attributes`: resposta, `last_updated`, título gerado e moderação. Anotar o resultado na spec e no CLAUDE.md. Parte recusada sai do envio (vira só aviso).
