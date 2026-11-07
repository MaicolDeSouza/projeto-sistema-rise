# Correções da descrição — desenho (07/11/2026)

## Intenção

O dono olha as descrições que a IA gera (pelo Rise, na janela "Criar descrição", e pelo Claude, na proposta de
produto via MCP) e vê detalhes que ele corrige sempre do mesmo jeito. O exemplo que ele deu: a IA escreve
`tensão: 5 V` e ele quer `5V`. Hoje a correção morre no produto em que foi feita: a próxima descrição sai errada de
novo, e o prompt da biblioteca é a única memória, que ele teria de reescrever a cada detalhe.

Pedido, nas palavras dele: "criar um RAG no rise para descrição e eu alimentar esse RAG com os detalhes que tem que
ajustar e assim melhorar a descrição cada vez mais".

O RAG aqui é uma **lista de correções que o Rise consulta na hora de escrever** (e aplica no texto final), sem busca
vetorial: o dono escolheu a Opção 1 e perguntou "mas seria um RAG?" — é: uma base que o Rise guarda, recupera e põe na
frente do modelo a cada geração; a recuperação é "todas as que valem para este prompt", porque centenas de linhas
curtas cabem no prompt.

Alimentação (Opção 3 do dono): **as duas** — ele me diz no chat e eu gravo; e quando ele mesmo corrige a descrição
no cadastro do produto e salva, o Rise mostra o que ele mudou ("5 V → 5V") e pergunta se vira regra.

## Metas

- Uma correção ensinada uma vez vale para **toda** descrição dali em diante: a do Rise (IA), a da proposta (Claude
  pelo MCP) e a que o dono digita ou cola no cadastro.
- A correção do tipo "errado → certo" é **aplicada automaticamente** no texto final, mesmo que o modelo a ignore.
- Toda correção também entra na **instrução** do modelo (Rise IA e Claude), para ele aprender o estilo e não só
  ser corrigido depois.
- Duas portas de entrada: chat (ferramenta do MCP) e a edição do dono no cadastro (pergunta no Salvar).
- O dono vê a lista, desliga, edita e apaga o que quiser, e vê se cada regra está "pegando" (quantas vezes trocou).

## Não metas

- Busca por similaridade (embeddings, pgvector). Não há volume que justifique; se um dia houver, a lista continua
  sendo a fonte e a busca vira um filtro em cima dela.
- Corrigir o **título**, a ficha técnica do ML ou os textos da Loja Integrada por este caminho. Só a descrição
  (`descricaoBase` do produto e a seção `descricao` da proposta; o que deriva dela, como a descrição do anúncio do
  ML, herda o texto já corrigido).
- Aprender sozinho: nenhuma correção nasce sem o dono (ele dita no chat ou marca no Salvar). O Claude nunca grava uma
  por iniciativa própria.
- Mexer nas regras fixas que já existem (`compactarUnidades`, `normalizarTerminologiaEletrica`, maiúscula no valor,
  espaço após o título): continuam valendo e passam a valer em mais lugares (ver "Passo zero").

## Anti-metas

- Pergunta chata no Salvar: se não há par curto "antes → depois", não aparece nada. Nunca bloquear o Salvar por
  causa disto.
- Correção que estraga texto: "5 V → 5V" não pode virar "5 Volts" → "5Volts", nem trocar dentro de palavras.
- Prompt inchado: a lista entra compacta e com teto; passar do teto é sinal para consolidar, não para cortar em
  silêncio.

## Restrições

- JavaScript, sem TypeScript; identificadores e comentários sem acento; textos de tela com acento.
- A descrição passa hoje por três caminhos, e os três têm de aplicar a mesma regra, senão o texto sai diferente
  conforme a porta (lição do "5 V" que escapa pela proposta):
  - Rise IA: `gerarDescricao` → `montarDescricao` → `textoPuro` (`src/lib/ia/anuncio.js`), que já aplica
    `compactarUnidades` e `normalizarTerminologiaEletrica` no texto inteiro.
  - Proposta (MCP): `gravarSecao("descricao")` → `src/lib/proposta/banco.js:124`, que aplica só `normalizarDescricao`
    (espaço após o título + maiúscula no valor + maiúsculas nos itens inclusos).
  - Salvar do produto: `src/app/produtos/acoes.js:510`, esquema `descricaoBase` com `normalizarDescricao` (transform
    síncrono do zod).
- O prompt da descrição tem teto de 14.000 caracteres (ver CLAUDE.md, "teto de 14.000 do prompt").
- O servidor MCP registra ferramentas por módulo em `src/lib/mcp/servidor.js` (`PROPOSTAS` = as que escrevem;
  `SO_LEITURA_DO_MCP` = as que só leem); `consultas.js` tem o conjunto `DA_PROPOSTA` para o registro de chamadas.
- O formulário do produto envia campos escondidos para o servidor (`propostaAplicada`, lido em `acoes.js:1104`): a
  resposta do popup segue o mesmo molde.
- Padrão visual do Rise: densa, silenciosa, uma ação principal, ajuda só na bolha "i", popup com `role` e
  `propsDoFundo`, "Sair sem salvar?" onde há edição.
- `ConhecimentoIA` (bloco Rise AI, `src/lib/riseAi/conhecimento.js`) é outra coisa: notas de texto livre, com
  aprovação, visibilidade ADMIN/PUBLICO e similaridade por trigramas, para o assistente que responde cliente. Não
  serve de tabela para isto (ver Abordagens).

## Abordagens consideradas

**1. Lista de correções estruturadas, sem vetores (escolhida pelo dono, Opção 1).** Tabela própria com `errado`,
`certo`, explicação e escopo. O Rise aplica as trocas no texto final e põe a lista inteira na instrução do modelo.
Simples, previsível, testável, e cobre o exemplo do dono no primeiro dia. Custo: a lista cresce linear no prompt
(~40 caracteres por correção: 300 correções = 12.000 caracteres, perto do teto — por isso o teto e a consolidação
fazem parte do desenho).

**2. RAG com embeddings (pgvector ou similar).** Cada correção vira um vetor; na geração o Rise busca as mais
parecidas com o produto/prompt. Vale quando a base passa de milhares e o prompt não comporta tudo. Hoje seria
infraestrutura (extensão no Postgres, modelo de embedding pago ou local, teste de relevância) para resolver um
problema que a lista inteira resolve melhor: uma correção de unidade vale para TODO produto, e a busca por
similaridade poderia deixá-la de fora justamente onde importa. Descartada; a lista continua sendo a fonte se um dia
a busca for necessária.

**3. Reaproveitar `ConhecimentoIA`.** Já existe tabela, tela de revisão e busca. Mas é texto livre (não dá para
aplicar "errado → certo" automaticamente), tem fluxo de aprovação e visibilidade pensados para resposta a cliente, e
a busca é por similaridade com a PERGUNTA — na descrição não há pergunta. Misturar os dois faria a Revisão do dia
encher de "5 V → 5V". Descartada; as duas bases ficam separadas e com nomes diferentes.

**Alimentação** (o dono escolheu "as duas", Opção 3): (a) só pelo chat — simples, mas obriga o dono a parar e me
dizer; (b) só pelo cadastro — captura o que ele já faz, mas não registra regras de estilo que não aparecem num
diff; (c) as duas.

## O desenho decidido

### 1. A correção

Tabela `CorrecaoDaDescricao` (migration nova), uma linha por correção:

| Campo | O que é |
| --- | --- |
| `tipo` | `TROCA` (errado → certo, aplicada no texto) ou `REGRA` (instrução em texto livre, só vai para o modelo) |
| `errado` | só na TROCA: o texto como o modelo escreve (`5 V`) |
| `certo` | na TROCA, como deve ficar (`5V`); na REGRA, a instrução ("Garantia sempre em meses, nunca em dias") |
| `explicacao` | opcional, o porquê, nas palavras do dono (vai para o modelo junto) |
| `promptNome` | `null` = vale para todas as descrições; senão o `nome` do `PromptDescricao` a que se aplica |
| `ativa` | desligar sem apagar |
| `origem` | `chat`, `cadastro` ou `tela` (de onde nasceu) |
| `produtoSku` | opcional: o produto em que foi vista (só informação) |
| `usos` | quantas vezes a TROCA achou e trocou texto (mostra que a regra está valendo) |
| `criadoPor`, `criadoEm`, `atualizadoEm` | quem e quando |

Validação: `certo` obrigatório; TROCA exige `errado` e `errado ≠ certo`; `errado` e `certo` curtos (até 120
caracteres); repetida (mesmo `errado` e mesmo escopo, sem caixa) é recusada apontando a existente.

### 2. Como a TROCA entra no texto (`aplicarCorrecoes`, pura, em `src/lib/ia/correcoes.js`)

- **Só em fronteira de palavra**: `errado` casa quando não está colado a letra ou número dos dois lados. "5 V"
  não casa em "5 Vdc"; "voltagem" não casa em "voltagens".
- **Número solto é curinga** (minha decisão): um número que está sozinho em `errado` (não colado a letra) e aparece
  igual em `certo` vale para qualquer número, que vai para a mesma posição. "5 V → 5V" corrige "3,3 V" para "3,3V"
  e "12 V" para "12V". Número colado a letra ("ESP32") ou diferente nos dois lados ("90 dias → 3 meses") é literal,
  senão "ESP32 → ESP32-S3" trocaria "ESP8266" por "ESP8266-S3".
- **Caixa**: casa sem olhar a caixa da primeira letra (ou do texto todo em maiúsculas, caso do título) e devolve a
  caixa do original ("Voltagem" → "Tensão", "VOLTAGEM" → "TENSÃO", a mesma regra de `normalizarTerminologiaEletrica`).
  O resto do texto casa como foi escrito.
- **Ordem**: `errado` mais longo primeiro, para "5 V DC" ganhar de "5 V". Cada trecho é trocado uma vez só (uma
  correção não roda em cima do resultado da outra).
- **Onde roda**: nos três caminhos da descrição, sempre depois das regras fixas e antes de gravar:
  - Rise IA: em `textoPuro` (`anuncio.js`), depois de `compactarUnidades` e `normalizarTerminologiaEletrica`.
    `textoPuro` e `montarDescricao` são síncronos: a lista é carregada uma vez em `gerarDescricao` e passada para baixo.
  - Proposta: em `gravarProposta`, seção `descricao` (`proposta/banco.js`), junto do `normalizarDescricao`.
  - Salvar do produto: na action, depois do `parse` do zod (o transform é síncrono e a lista vem do banco). O texto
    que o dono digitou "5 V" sai "5V" — o mesmo que já acontece com a maiúscula no valor.
  - A descrição do anúncio do ML (`descricaoDoRise`) e a HTML da Loja Integrada derivam de `descricaoBase`, então
    herdam o texto corrigido sem mudança.
- A lista ativa é lida do banco por `lerCorrecoesAtivas({ promptNome })` (as de escopo `null` + as do prompt) com
  cache em memória de 60 s, para o Salvar não consultar a tabela a cada tecla da proposta. `usos` é somado por
  correção que trocou algo, sem bloquear a gravação se a soma falhar.

### 3. Como a lista entra na instrução do modelo

- **Rise IA** (`gerarDescricao`): o bloco "Correções do dono" vai depois do prompt escolhido, em `instrucoes`:
  uma linha por correção — TROCA: `escreva "5V", nunca "5 V"` (+ a explicação, se houver); REGRA: a instrução.
  `gerarDescricao` passa a receber `promptNome` (a janela sabe qual prompt escolheu) para filtrar o escopo.
- **Claude (MCP)**: `roteiroDaProposta` ganha o passo "aplique as Correções da descrição que `lerParaProposta`
  devolve" e sobe a versão do roteiro da proposta de produto; `lerParaProposta` devolve `correcoes` (a lista ativa
  para o prompt pedido, no mesmo formato de linhas). `gravarSecao` aplica as TROCAs de qualquer jeito (item 2).
- **Teto**: o bloco entra até 6.000 caracteres (um terço do prompt); passando disso, as mais antigas ficam de fora
  da instrução (as TROCAs continuam sendo aplicadas no texto) e a tela avisa "N correções fora da instrução por
  tamanho; consolide ou desligue". Decisão minha; o dono muda o número se quiser.

### 4. Alimentar pelo chat (ferramentas do MCP, módulo `src/lib/mcp/correcoes.js`)

- `gravarCorrecaoDaDescricao({ tipo, errado, certo, explicacao, prompt, sku })`: grava ativa, `origem: "chat"`,
  `criadoPor` = o login da conexão. A descrição da ferramenta diz: **só o que o dono pediu no chat, com as palavras
  dele em `explicacao`**; nunca por iniciativa do Claude. Devolve a linha gravada e, numa TROCA, o que ela faria em
  3 descrições recentes que contêm o `errado` (um "ensaio", para o dono ver que não estraga nada).
- `listarCorrecoesDaDescricao({ prompt, ativas })`: a lista, para eu conferir antes de gravar repetida.
- `desligarCorrecaoDaDescricao({ id })`: desliga (não apaga); apagar é só na tela.
- Entram em `PROPOSTAS` (escrevem) com o `pode()` de editar produto, e no `DA_PROPOSTA` do registro.

### 5. Alimentar pelo cadastro (popup no Salvar)

- O formulário guarda a **descrição "da máquina"**: a que veio do banco ao abrir e, a cada "Usar" da janela de
  descrição (`aoUsar`, `FormularioProduto.jsx:3880`) ou aplicação da proposta, a que foi aplicada. O que o dono
  digita por cima disso é a edição dele.
- No Salvar, se `descricaoBase` mudou em relação à "da máquina", o Rise calcula os **pares curtos**: por linha
  (linhas iguais saem; linha trocada por linha na mesma posição), dentro da linha o menor trecho diferente
  esticado até a fronteira de palavra. Entra como candidato só o par com os dois lados de até 60 caracteres e
  diferentes de vazio ("5 V" → "5V"; "Tensão de operação: 5 V" → "Tensão de operação: 5V" vira só "5 V → 5V").
  Parágrafo reescrito, linha acrescentada ou apagada não geram candidato.
- Com pelo menos um candidato, abre o popup **"O que mudou na descrição"** (`role="dialog"`, `propsDoFundo`): uma
  linha por par, `antes → depois`, com a linha de contexto em cinza, uma caixa de marcação por par (todas
  **desmarcadas**), escopo numa escolha única no rodapé ("Todas as descrições" marcado; "Só o prompt X" quando a
  preferência de prompt está gravada) e um campo opcional "Por quê". Botões: **Salvar** (principal; grava o
  produto e as marcadas) e **Salvar sem regra**. Esc e clicar fora **voltam ao formulário sem salvar** (nada
  acontece por engano). Sem candidato, salva direto, como hoje.
- As marcadas vão no campo escondido `correcoesDaDescricao` (JSON), o molde do `propostaAplicada`; a action grava o
  produto e depois cria as correções (`origem: "cadastro"`, `produtoSku` = o SKU), e uma falha nelas não desfaz o
  Salvar (avisa como o "Falha ao marcar as seções aplicadas"). O popup só cria TROCA; REGRA nasce pelo chat ou pela
  tela de gestão.
- O envio do formulário já é manual (`onSubmit` + `startTransition`): o popup segura o `FormData` pronto e o envia ao
  Salvar, com as marcadas dentro.
- O rascunho automático (`localStorage`) guarda a descrição "da máquina" junto do resto, para o diff sobreviver ao
  recarregar.

### 6. Tela de gestão

Cartão **"Correções da descrição"** em Configurações (decisão minha; cabe também em Produtos, se o dono preferir),
página com a tabela: tipo (ícone), `errado → certo` (REGRA mostra só o texto), escopo, origem, usos, data, ativa
(liga/desliga na linha), lápis (edita errado/certo/explicação/escopo numa janela por cima) e lixeira (popup listando
o que apaga). Linha de cima: busca por texto e o botão **Nova correção** (ação principal), que abre a mesma
janela. A janela da descrição ganha um ícone que abre esta página em outra aba. Acesso: quem edita produto.

### 7. Passo zero: o "5 V" que escapa hoje

`compactarUnidades` existe desde antes e só roda no caminho do Rise IA. `normalizarDescricao` passa a aplicar
`formatarLinhaTecnica` (compacta unidades + terminologia elétrica + maiúscula no valor, a mesma função do editor
`LinhasDescricao`) em cada linha "- Nome: valor" das Especificações técnicas — não no texto inteiro, para não mexer
em prosa ("2 A partir de..."). Com isso a proposta e o Salvar param de deixar "5 V" nas especificações, mesmo sem
correção cadastrada; a correção do dono cobre o que estiver fora da ficha.

### 8. Onde nada muda

Prompts da biblioteca (`PromptDescricao`), a janela de descrição e suas opções de parágrafo, `ConhecimentoIA`, o
anúncio do ML e a Loja Integrada (só herdam o texto), títulos.

## O que fica para quem constrói

- Nome exato dos campos, índices e do enum; o SQL da migration.
- Como extrair o menor trecho diferente por linha (prefixo/sufixo comum e depois esticar até espaço); cobrir com
  teste os casos "5 V → 5V", "voltagem → tensão", linha inteira reescrita (sem candidato), duas trocas na mesma linha.
- O desenho do popup e da página dentro do padrão visual (passar por `ecc:make-interfaces-feel-better`).
- Onde cabe a leitura com cache (`lerCorrecoesAtivas`) para o Salvar, a proposta e a IA sem repetir código.
- Atualizar o CLAUDE.md (seção nova "Correções da descrição", a regra de `normalizarDescricao` e as contagens de
  teste), o roteiro da proposta (versão) e a descrição do servidor MCP (`servidor.js:34`).

## Testes

- Regras puras em `teste:extracao` (`aplicarCorrecoes`: fronteira, número curinga, caixa, ordem, uma vez só;
  candidatos do diff; `normalizarDescricao` compactando só as linhas técnicas).
- Banco e os três caminhos em `teste:proposta` (gravarSecao aplica; Salvar aplica e cria as marcadas; `usos`),
  `teste:imagens` (Rise IA com provedor falso recebe o bloco e `textoPuro` aplica) e `teste:mcp` (as três
  ferramentas, o `pode()`, o registro).
- Sem rede e sem IA paga, como os demais.

## Decisões minhas (para o dono conferir ao ler)

1. Número solto e igual nos dois lados é curinga ("5 V → 5V" vale para qualquer número); colado a letra ou diferente
   é literal.
2. Dois tipos: TROCA (aplicada no texto) e REGRA (só instrução).
3. Escopo por prompt (`null` = todas), sem escopo por produto ou categoria.
4. As TROCAs também corrigem o que o dono digita à mão no Salvar.
5. Popup só com pares curtos (até 60 caracteres por lado); caixas desmarcadas por padrão; Esc volta ao formulário.
6. Teto de 6.000 caracteres do bloco na instrução, com aviso na tela.
7. Página em Configurações, com atalho na janela da descrição.
8. Passo zero: `normalizarDescricao` compacta unidades só nas linhas técnicas.
9. O Claude só grava o que o dono ditou no chat; a ferramenta devolve um ensaio em 3 descrições.
