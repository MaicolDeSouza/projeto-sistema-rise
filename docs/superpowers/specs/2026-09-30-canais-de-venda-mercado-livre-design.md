# Canais de Venda — Mercado Livre: criar, salvar e publicar anúncio a partir do Produto

Data: 30/09/2026 · Branch: `canais-de-venda` · Caminho: arquitetural (brainstorming aprovado seção a seção)

## 1. Objetivo

Uma seção nova no menu lateral, **Canais de Venda**, com cartões Mercado Livre, Loja Integrada e Shopee, para criar e gerenciar anúncios por canal. Esta spec cobre **o Mercado Livre**: montar o anúncio a partir de um Produto já cadastrado, salvar o rascunho, e publicá-lo no ML com vínculo no Bling. Loja Integrada e Shopee aparecem como cartões "em breve".

Sucesso: o dono clica no ícone do ML de um Produto Conferido, preenche/ajusta as 7 abas (quase tudo já nasce preenchido), salva, e quando quiser publica; o anúncio sai pausado, é vinculado ao Bling, ativado, e o ícone do Produto fica verde.

## 2. Contexto do código atual

- Menu **Anúncios** (`/anuncios`): só interface e validação, botões de ação desativados (`EditorAnuncio.jsx`, "a publicação real entra na Fase B"). **Fica de fora** deste desenho; será removido em etapa posterior.
- `src/lib/anuncios/canais/mercadolivre.js` já tem `validar`, `montarPayload`, `camposEditaveis`, `LIMITE_TITULO`. Serão reaproveitadas e ampliadas.
- Conector do ML (`src/lib/integracoes/mercadolivre.js`): OAuth e `mlGet`; `chamar` já bloqueia não-GET com `exigirTravaLiberada`. Não há listagem, categorias, atributos, upload de imagem nem escrita.
- Travas `ML_PUBLICACAO` e `BLING_ESCRITA` estão `false` (`src/lib/integracoes/config.js`). A conta tem 1.007 anúncios e estoque reais. **O código nunca liga as travas**; quem liga é o dono.
- Ícones dos canais na lista de Produtos: `LinhaProduto.jsx` (~linha 145), hoje imagens cinza sem clique.
- `Produto.conferido` (boolean) existe e grava no banco.
- `Anuncio` tem `@@unique([produtoId, canal])`; nenhum código usa `produtoId_canal`.

## 3. Decisões do dono

1. Anúncio ML sempre ligado a um **Produto existente e Conferido**.
2. Duas portas de entrada: **ícone do ML na lista de Produtos → pop-up**; **Canais de Venda → Mercado Livre → Novo anúncio → página inteira** (sem pop-up), com as mesmas abas fixas.
3. **7 abas:** Geral · Preço e estoque · Imagens · Descrição · Ficha técnica · Envio · Prévia e validação.
4. **Salvar** grava o rascunho (ícone NÃO fica verde). **Publicar** envia ao ML e vincula ao Bling; só então o ícone fica verde.
5. **Publicar** cria o item **pausado**, define preço, vincula ao Bling e então ativa, numa ação, com janela de confirmação (título, preço, estoque).
6. Produto **sem `blingId` não publica** (botão desabilitado, com o motivo).
7. **Vários anúncios por Produto só no ML e na Shopee** (Clássico, Premium…). Bling e Loja Integrada: um por Produto.
8. **Versículo** no fim de cada anúncio, **sem limite de quantidade**: sorteado entre **todos os versículos de Salmos e de Provérbios** (Almeida Revista e Corrigida, 1898, domínio público; escolhida no lugar da NVI, que tem direitos autorais e não pode ser guardada inteira). Sorteio **sem repetir entre anúncios**, até esgotar; sem relação com o produto, sem reflexão. O método de sorteio é o do artefato "Versículo Diário"; o conjunto de versículos deixa de ser a lista fixa de 39.
   - **Versículos que não cabem num anúncio** (maldições e similares, como Salmo 137:9 e trechos do Salmo 109) ficam numa **lista de exclusão** mantida no sistema.
   - **Limite de tamanho:** versículo longo demais para fechar a descrição é descartado do sorteio.
9. **Frases fixas** (ex.: "Todos os nossos produtos possuem nota fiscal") definidas pelo dono numa tela de configuração.
10. **Custo** da aba de preço vem do **fornecedor padrão** do Produto.
11. **Publicar roda como ação do servidor com etapas gravadas** (abordagem A): retoma da etapa que falhou.
12. **Composição (ML e Shopee):** um anúncio pode ser uma composição de **N unidades do mesmo produto-base** (ex.: 5 peças do `100101`, código **`100101_5`**). A composição existe **só no anúncio**, não vira Produto no Rise. O **estoque é controlado pelo Bling**: o produto de composição do Bling baixa as N unidades do produto-base a cada venda. O anúncio de composição fica **pausado até o produto de composição existir no Bling**; **o Rise cria esse produto no Bling** (se não existir) e a saída de "pausado" é pelo botão **Verificar no Bling**. Detalhes nas seções 6.1 e 7.1.

## 4. O que a API do ML permite (conferido nas docs)

| Necessidade | Resposta | Endpoint |
|---|---|---|
| Categoria sugerida | Sim | `GET /sites/MLB/domain_discovery/search?q=` |
| Título sugerido | **Não existe.** IA + termos em alta da categoria (a confirmar) | `GET /trends/MLB/{category_id}` |
| Preço recomendado | **Só para anúncio já publicado** | `GET /suggestions/items/{item_id}/details` |
| Comissão e tarifa fixa | Sim, antes de publicar | `GET /sites/MLB/listing_prices?price=&category_id=&listing_type_id=&logistic_type=&shipping_mode=` |
| Frete pago pelo vendedor | Sim, estimativa antes de publicar | `GET /users/{id}/shipping_options/free?dimensions=AxLxCxPESO&item_price=&listing_type_id=&mode=&logistic_type=&free_shipping=` |
| Frete grátis obrigatório | Tag no item | `shipping.tags: mandatory_free_shipping` |
| Atributos da categoria | Sim | `GET /categories/{id}/attributes` |
| Vínculo com o Bling | Sim | Bling `POST /produtos/lojas` com `{codigo: "<MLB>", preco, produto: {id: <blingId>}, loja: {id: 203593931}}` |
| Produto de composição no Bling | Sim. Os kits atuais são `formato: "E"` com `estrutura.tipoEstoque: "V"` (virtual) e `componentes: [{produto: {id}, quantidade}]`; exemplo real: `920302_1.000` (1.000 × resistor). Procurar por código antes de criar; criar com `POST /produtos` (formato a modelar no kit existente). | Bling `GET /produtos` (filtro por código, a confirmar), `POST /produtos` |

Nome de arquivo da foto: nenhuma fonte oficial indica efeito na busca do ML (o ML guarda a imagem com identificador próprio). Decisão: enviar com nome legível (`slug-do-produto-N.jpg`), sem prometer efeito.

A busca pública do ML (`/sites/MLB/search`) dá 403; a pesquisa de anúncios de outros vendedores será pela internet, não pela API.

## 5. Estrutura

**Rotas** (todas em `src/app/canais-de-venda/`):
- `page.jsx`: cartões (`CartaoDeAtalho`); catálogo em `src/lib/canaisDeVenda.js`.
- `mercado-livre/page.jsx`: lista dos anúncios ML (rascunho/publicado) + **Novo anúncio**.
- `mercado-livre/novo/page.jsx` e `mercado-livre/[id]/page.jsx`: página inteira com as abas fixas, Salvar e Publicar; o Produto é escolhido pelo código.
- `mercado-livre/configuracoes/page.jsx`: frases fixas.
- Entrada `Canais de Venda` em `src/lib/blocos.js`; `LinkDeVolta` nas telas internas.

**Componentes** (`src/components/anuncios/ml/`): `EditorAnuncioML` (abas, Salvar, Publicar) renderizado por `JanelaAnuncioML` (pop-up do ícone) e pela página. Uma aba por arquivo. Produto com vários anúncios ML: o pop-up começa numa lista + "Novo anúncio". Produto não Conferido: pop-up bloqueado, com aviso.

**Ícone do ML** em `LinhaProduto.jsx`: cinza = sem anúncio; cinza com ponto âmbar = rascunho salvo ou composição **aguardando o Bling**; **verde = publicado, vinculado ao Bling e ativo**. Loja Integrada e Shopee continuam cinza.

**Lógica pura, sem rede (testável):** margem e preço por margem; montagem da descrição; `src/lib/versiculos.js` (sorteio sem repetir, lista de exclusão e limite de tamanho, recebendo o conjunto de versículos e o histórico como argumento); validações. Os versículos de Salmos e Provérbios (ARC) ficam num arquivo de dados local, versionado, sem depender de serviço externo. Chamadas ao ML e ao Bling em arquivos separados, sempre via `httpClient.requisitar` com registro em `LogIntegracao`.

**Reaproveitar:** regras de `canais/mercadolivre.js`, `src/lib/margem.js` (`IMPOSTO_PADRAO`, 6%), `src/lib/ia/anuncio.js`, `BolhaDeAjuda`, `PageHeader`.

**Segurança:** "só Produto Conferido" é conferido **no servidor** em toda ação (salvar, validar, publicar).

## 6. As 7 abas

Todas nascem preenchidas a partir do Produto.

1. **Geral:** título (60, contador), `family_name`, tipo (Clássico/Premium), condição, categoria. "Sugerir título" (IA com o padrão do Rise + termos da categoria). "Sugerir categoria": (1) `domain_discovery` com o título; (2) a IA confirma/escolhe com os dados do Produto; (3) se nada servir, a IA pesquisa o produto na internet. Sugestão sempre editável.
2. **Preço e estoque:** custo (fornecedor padrão), preço, estoque e o bloco de custos do ML (comissão, tarifa fixa, frete do vendedor, imposto 6%). **Calculadora** (ícone, igual à do Produto): o dono escolhe margem (% ou R$) e o Rise mostra o preço necessário, resolvendo `P·(1 − comissão% − imposto%) − tarifa_fixa − frete − custo = margem`, iterando com `listing_prices` porque comissão e tarifa fixa dependem do preço.
3. **Imagens:** as do Produto, escolha e ordem; envio binário (`POST /pictures/items/upload`).
4. **Descrição:** texto do Produto + frases fixas + versículo sorteado entre todos os de Salmos e Provérbios (botão "outro versículo", fica gravado no rascunho; o versículo só entra no histórico de "já usados" quando o anúncio é publicado). Texto puro.
5. **Ficha técnica:** atributos da categoria; IA preenche a partir do Produto; obrigatórios em destaque.
6. **Envio:** peso/dimensões do Produto, tipo de logística, frete grátis, retirada.
7. **Prévia e validação:** problemas por campo (bloqueantes e alertas), payload, e validação pelo validador de publicações do ML (sem criar anúncio).

Limite: o ML não recomenda preço antes de o anúncio existir; depois de publicado, a sugestão aparece na tela de gerenciar.

### 6.1 Anúncio de composição (ML e Shopee)

Um anúncio pode ser **N unidades do mesmo produto-base** vendidas juntas. Exemplo: 5 peças do `100101` → código **`100101_5`**, o padrão `código_quantidade` que o Bling já usa (ex.: `920302_1.000`, com ponto no milhar).

- **A composição existe só no anúncio** (`dados.composicao = {produtoBaseId, quantidade, codigo}`); não vira Produto no Rise. Conferido e `blingId` valem para o **produto-base**.
- **A baixa de estoque é do Bling, não do Rise:** o produto de composição no Bling (estoque virtual, componente = produto-base × N) calcula o saldo do kit pelo produto-base e, a cada venda de `100101_5`, baixa N unidades do `100101`. O Rise não implementa lógica de estoque. Estoque inicial do anúncio = ⌊estoque do produto-base ÷ N⌋.
- **Geral:** caixa "Composição" + quantidade; mostra o código gerado; título e descrição sugerem "Kit com N unidades".
- **Preço:** custo = N × o custo do fornecedor padrão do produto-base; a calculadora de margem usa esse custo.
- **Imagens:** fotos próprias do kit; enquanto só houver as do produto-base (que mostram 1 unidade), a aba avisa.
- **Envio:** peso e dimensões editáveis, com sugestão de N × o peso do produto-base.
- Vários anúncios da mesma composição (Clássico e Premium) compartilham o mesmo produto de composição no Bling.
- Kit **misto** (produtos diferentes no mesmo anúncio) fica fora desta versão.

## 7. Publicar

**Pré-checagens (servidor):** Produto Conferido; `blingId` existe; rascunho sem problema bloqueante; `ML_PUBLICACAO` e `BLING_ESCRITA` ligadas; confirmação do dono.

**Etapas, gravadas em `dados.etapa` a cada conclusão:**
1. `POST /items` **pausado**.
2. Envio das fotos.
3. `PUT /items/{id}/description`.
4. `POST /items/{id}/prices/standard`.
5. Vínculo no Bling: `GET /produtos/lojas` (não duplicar) e `POST /produtos/lojas`.
6. `PUT /items/{id}` → ativo.
7. Grava `idExterno`, `urlExterna`, `status = PUBLICADO`.

**Falha:** o anúncio fica `PUBLICANDO` com erro e etapa gravados; "Retomar publicação" continua da etapa que falhou sem recriar o item.

### 7.1 Variante de composição

Mesmas pré-checagens (o `blingId` exigido é o do produto-base). Etapas 1 a 4 iguais: o item nasce **pausado**, com o código `100101_5` como SKU. Antes do vínculo entra a etapa **5a: garantir o produto de composição no Bling**:
- procura o código no Bling; se existir (criado pelo dono ou numa tentativa anterior), **reaproveita**;
- se não existir, **o Rise o cria** (`POST /produtos`, formato composição, estoque virtual, componente = produto-base × N, demais dados copiados do produto-base, modelado no kit real `920302_1.000`). A criação aparece **na janela de confirmação** do Publicar.

Depois seguem 5b (vínculo), 6 (ativar) e 7 (gravar). **Se a 5a falhar**, o anúncio fica **pausado** em "aguardando Bling" (`dados.etapa`) e o botão **Verificar no Bling** (também disponível ao abrir o anúncio) repete a partir da 5a. O anúncio nunca é ativado sem o produto de composição existir e estar vinculado. Não há verificação automática pelo worker. O produto criado no Bling **não é apagado** se uma etapa seguinte falhar: a nova tentativa o reaproveita pelo código.

**Depois:** o Bling controla estoque e venda. Campos travados pelo ML continuam travados (`camposEditaveis`).

**Teste de escrita:** o primeiro Publicar real é com **um produto, acompanhado pelo dono**.

## 8. Banco

- `Anuncio`: remover `@@unique([produtoId, canal])`; índice `(produtoId, canal)`; **índice único parcial em SQL** só para Bling e Loja Integrada (no estilo do `Job_fonte_aberta`); coluna `dados Json?` (envio, tipo, condição, versículo, etapa, vínculo com o Bling, composição `{produtoBaseId, quantidade, codigo, blingProdutoId}`). Sem coluna nem tabela nova para a composição.
- Tabela de configuração por canal (frases fixas e o histórico de versículos já usados, que reinicia quando todos os versículos elegíveis forem usados).
- Regra do schema do CLAUDE.md: uma sessão por vez; a outra frente tem migrations ainda sem commit (`20260930_fotos_mensais`, `20260930_movimento_estoque`); antes de gerar a nossa, ela faz o merge e rodamos `git merge main`. Editar o SQL à mão (o `migrate diff` propõe `DROP INDEX` dos trigramas). Depois `prisma generate` e reiniciar o servidor.

## 9. Erros e testes

**Erros:** mensagens em português, no campo certo; erro do ML/Bling com o texto original no `LogIntegracao`; falha de rede nunca apaga o rascunho; falha de IA só avisa.

**Testes** (`npm run teste:anuncios-ml`, sem rede): Produto não Conferido recusado no servidor; sem `blingId` não publica; vários anúncios ML por produto e um só no Bling; preço por margem contra as taxas; descrição; versículo sem repetir entre anúncios, nunca da lista de exclusão e nunca acima do limite de tamanho; retomada de cada etapa; composição: código `100101_5` gerado (e `_1.000`), custo × N, estoque ⌊base ÷ N⌋, Bling sem o produto deixa o anúncio pausado, produto já existente no Bling é reaproveitado e não duplicado. Mais `lint` e conferência no navegador.

## 10. Fases (cada uma com testes e aprovação antes da seguinte)

1. **Rascunho:** migration, menu e cartões, lista, as 7 abas (sem IA e sem custos do ML), Salvar, pop-up e página, ícone com ponto âmbar, frases fixas, versículo.
2. **Inteligência do ML (só leitura):** categoria, título, atributos, custos, calculadora, validador.
3. **Publicar:** escrita no ML e no Bling, etapas e retomada. Só depois de o dono liberar as travas.

Investigação inicial, antes da fase 2 (leituras seguras): `domain_discovery`, `categories/{id}/attributes`, `listing_prices` com e sem `logistic_type`, `shipping_options/free`, Tendências, validador de publicações, e `GET /produtos/lojas` num produto já vinculado (formato exato). Para a composição: confirmar o **filtro por código** do `GET /produtos` (a consulta de teste por `codigos[]` voltou vazia até para o `100101`), conferir se `100101` e `100101_5` já existem, e copiar o formato exato do kit `920302_1.000` (campos `estrutura`, `lancamentoEstoque`, categoria, unidade, NCM) para o `POST /produtos`.

## 11. Fora do escopo

Listar/importar os 1.007 anúncios existentes; Loja Integrada e Shopee (só cartões); preço recomendado pelo ML antes de publicar (não existe); remover o menu Anúncios; kit misto (produtos diferentes na mesma composição); a composição na Shopee (a regra vale para ela, mas a Shopee só é construída em spec própria).

## 12. Riscos

- Migration concorrente com a outra frente (regra acima).
- O Bling pode sincronizar preço e estoque depois do vínculo: o preço do vínculo é o do anúncio; o estoque inicial é o do Produto.
- Esta pasta (`main` worktree) hospeda o worker e o trabalho da outra frente sem commit; a branch `canais-de-venda` vive aqui por decisão do dono. Comitar só os arquivos desta feature, pelo nome; conferir a branch antes de reiniciar o worker.
- Pesquisa na internet pela IA tem custo e pode errar: sempre sugestão editável, nunca preenchimento silencioso.
- Composição: o Rise passa a **criar produtos no Bling** (escrita no ERP, sob `BLING_ESCRITA`). Mitigação: sempre procurar o código antes de criar, confirmar a criação na janela do Publicar, nunca apagar o produto criado, e fazer o primeiro teste real com um kit só, acompanhado pelo dono. Um produto de composição no Bling com configuração diferente do kit modelo (`920302_1.000`) pode não baixar o estoque do produto-base: conferir uma venda de teste ou o saldo virtual antes de ativar o primeiro kit em volume.
- Versículos: sorteando entre Salmos e Provérbios inteiros, algum pode destoar de um anúncio de produto. Mitigação: lista de exclusão dos casos conhecidos, botão "outro versículo" e o texto visível na prévia antes de publicar. A **fonte do texto da ARC** (arquivo de Salmos e Provérbios) será definida no plano de implementação, conferindo que a licença permite guardá-lo; a revisão de trechos impróprios além dos conhecidos é do dono.
