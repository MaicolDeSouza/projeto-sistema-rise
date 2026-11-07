# Correções da descrição — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma lista de correções da descrição (TROCA `errado → certo`, aplicada no texto, e REGRA, só instrução) que o Rise aplica em toda descrição e põe na instrução da IA do Rise e do Claude, alimentada pelo chat (MCP) e pelo Salvar do produto, com página de gestão em Configurações.

**Architecture:** Tabela `CorrecaoDaDescricao`. Regras puras em `src/lib/ia/correcoes.js` (validar, aplicar, bloco da instrução, candidatos do diff). Banco com cache de 60 s em `src/lib/ia/correcoesBanco.js`. Os três caminhos da descrição (IA do Rise em `montarDescricao`, proposta em `gravarProposta`, Salvar em `salvarProduto`) chamam `aplicarCorrecoes` depois das regras fixas e antes de gravar. Três ferramentas do MCP. Popup "O que mudou na descrição" no Salvar. Página `/configuracoes/correcoes-da-descricao`.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Prisma 7 + PostgreSQL 17, zod, @modelcontextprotocol/server, lucide-react, Tailwind. JavaScript sem TypeScript.

**Spec:** `docs/superpowers/specs/2026-11-07-correcoes-da-descricao-design.md`

## Global Constraints

- JavaScript, sem TypeScript; identificadores e comentários sem acento, texto de tela com acento. Comentário explica o porquê.
- Testes sem rede e sem IA paga. Os de banco gravam só linhas com `criadoPor` `zz-corr-teste` (ou `zz-mcp-lembrete`, no `teste:mcp`) e produtos `ZZ-CORR-*`, e apagam no começo e no fim.
- Limites do desenho: `errado` e `certo` até **120** caracteres; `explicacao` até **500**; par do popup até **60** por lado; bloco da instrução até **6.000** caracteres; cache de **60 s**; ensaio em **3** descrições.
- Popup novo: `role="dialog"` ou `"alertdialog"`, fundo com `{...propsDoFundo(fechar)}` (`src/lib/fundoDaJanela.js`); nunca `confirm()`. Padrão visual do CLAUDE.md: uma ação principal, ajuda só na `BolhaDeAjuda`, tabela densa, texto com acento.
- Escopo da correção: `promptNome` `null` = todas as descrições; senão o `nome` de um `PromptDescricao` (o prompt do sistema chama-se `"Padrão do sistema"`, `NOME_DO_SISTEMA` em `src/lib/ia/promptsDescricao.js`).
- No Salvar do produto só valem as correções de escopo `null` (o Salvar não sabe o prompt); na IA e na proposta valem as de escopo `null` mais as do prompt usado.
- Migration escrita à mão (CLAUDE.md: `prisma migrate dev` é interativo e falha aqui): pasta `prisma/migrations/20261107_correcoes_da_descricao/migration.sql`, depois `npx prisma migrate deploy`, `npx prisma generate` e reiniciar o servidor do site.
- Commits só dos arquivos e trechos deste plano. `prisma/schema.prisma` e `src/lib/compras/banco.js` têm alterações de OUTRA sessão não commitadas: nunca `git add prisma/schema.prisma` inteiro; usar `git add -p` e escolher só o hunk de `CorrecaoDaDescricao`. Mensagem de commit em português sem acento, no molde do histórico, terminando com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Nada sobe para a VPS sem o "sobe" do dono. Execução inline, sem subagentes (regra do dono de 05/10/2026).

## Review Focus

1. `errado` com caractere de regex (`"3.3V (DC)"`, `"+5V"`): tem de casar literal, nunca virar expressão. Teste na Tarefa 2.
2. TROCA cujo `certo` contém o `errado` (`"ESP32" → "ESP32-S3"`): o Salvar aplica a lista a cada gravação e não pode acumular (`ESP32-S3-S3`). Regra: onde o texto já está como `certo`, não troca. Teste na Tarefa 2.
3. Descrição antiga com `\r\n`: as trocas e o diff do Salvar não podem deixar `\r` solto nem inventar candidato por causa dele. Teste na Tarefa 2.
4. Correção com escopo de um prompt renomeado ou apagado: continua gravada, aparece na página com o nome como está e nunca entra em outra geração. Teste na Tarefa 3.
5. Candidato do popup igual a uma correção que já existe: recusado como repetido sem derrubar o Salvar. Teste na Tarefa 3.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `src/lib/ia/revisaoDescricao.js` (modificar) | Passo zero: `formatarLinhasTecnicas` dentro de `normalizarDescricao`. |
| `src/lib/ia/correcoes.js` (criar) | Regras puras: validar, aplicar, bloco da instrução, aviso do teto, candidatos do diff. Sem imports de banco. |
| `src/lib/ia/correcoesBanco.js` (criar) | Prisma: ler ativas com cache, criar/editar/alternar/excluir/listar, usos, ensaio, o Salvar. |
| `prisma/schema.prisma`, `prisma/migrations/20261107_correcoes_da_descricao/migration.sql` | A tabela e os dois enums. |
| `src/lib/proposta/banco.js`, `src/lib/proposta/leitura.js`, `src/lib/proposta/roteiro.js` (modificar) | Proposta aplica as TROCAs e devolve a lista; roteiro v17. |
| `src/lib/ia/anuncio.js`, `src/app/produtos/acoes.js`, `src/components/produtos/JanelaDescricao.jsx` (modificar) | IA do Rise: bloco na instrução, TROCAs no texto, `promptNome` da janela até a geração. |
| `src/lib/mcp/correcoes.js` (criar), `src/lib/mcp/servidor.js`, `src/lib/mcp/consultas.js` (modificar) | As três ferramentas do MCP, registro e resumo das chamadas. |
| `src/components/produtos/JanelaOQueMudou.jsx` (criar), `src/components/produtos/FormularioProduto.jsx`, `src/lib/rascunhoDoCadastro.js` (modificar) | Popup do Salvar, descrição "da máquina", campo escondido, rascunho. |
| `src/app/configuracoes/correcoes-da-descricao/page.jsx`, `.../acoes.js`, `src/components/configuracoes/CorrecoesDaDescricao.jsx` (criar), `src/lib/configuracoes/catalogo.js` (modificar) | Página de gestão e o cartão. |
| `scripts/teste-extracao.js`, `scripts/teste-proposta.js`, `scripts/teste-mcp.js` (modificar) | Os testes. |
| `CLAUDE.md` (modificar) | Seção nova, regra da `normalizarDescricao`, versão do roteiro, contagens. |

---

### Task 1: Passo zero — `normalizarDescricao` compacta as unidades das linhas técnicas

**Files:**
- Modify: `src/lib/ia/revisaoDescricao.js:39-68`
- Test: `scripts/teste-extracao.js` (bloco da `revisaoDescricao`, logo depois da asserção "normalizar faz as duas coisas", ~linha 2119)

**Interfaces:**
- Produces: `formatarLinhasTecnicas(texto: string): string` (exportada). `normalizarDescricao(texto)` passa a ser `maiusculasNosItensInclusos(formatarLinhasTecnicas(espacoAposTitulo(texto)))`. `maiusculaNasEspecificacoes` continua exportada e igual (os testes a usam).

- [ ] **Step 1: Escrever o teste que falha**

```js
const { formatarLinhasTecnicas } = await import("../src/lib/ia/revisaoDescricao.js");
conferir("linhas tecnicas: unidade colada, terminologia e maiuscula; prosa e itens inclusos ficam",
  formatarLinhasTecnicas("PLACA\n\nFunciona a 5 V e consome 2 A partir de 3 V.\n\nEspecificações técnicas:\n- Voltagem: 5 V;\n- Corrente: 20 mA;\n\nItens inclusos: (Cod:1)\n- 01 PLACA 5 V;"),
  "PLACA\n\nFunciona a 5 V e consome 2 A partir de 3 V.\n\nEspecificações técnicas:\n- Tensão: 5V;\n- Corrente: 20mA;\n\nItens inclusos: (Cod:1)\n- 01 PLACA 5 V;");
conferir("normalizarDescricao compacta a unidade das linhas tecnicas (o 5 V da proposta e do Salvar)",
  normalizarDescricao("PLACA\nParágrafo.\n\nEspecificações técnicas:\n- Tensão: 5 V;\n\nGarantia:\n- 90 dias;"),
  "PLACA\n\nParágrafo.\n\nEspecificações técnicas:\n- Tensão: 5V;\n\nGarantia:\n- 90 dias;");
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run teste:extracao`
Expected: para com `TypeError: formatarLinhasTecnicas is not a function`.

- [ ] **Step 3: Implementar `formatarLinhasTecnicas(texto)` em `revisaoDescricao.js`**

O mesmo laço de `maiusculaNasEspecificacoes` (entre `inicio` e `fim` de `limitesEspecificacoes`, só as linhas que começam por `-`), chamando `formatarLinhaTecnica` em vez de `maiusculaNoValor`. Comentário: por que só as linhas técnicas (a prosa "2 A partir de" não pode virar "2A partir de"). Trocar a chamada em `normalizarDescricao`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run teste:extracao`
Expected: todas `ok`, código 0. Anotar o total novo de asserções (sobe 2).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ia/revisaoDescricao.js scripts/teste-extracao.js
git commit -m "Descricao: normalizarDescricao compacta as unidades das linhas tecnicas (passo zero das Correcoes)"
```

---

### Task 2: Regras puras (`src/lib/ia/correcoes.js`)

**Files:**
- Create: `src/lib/ia/correcoes.js`
- Test: `scripts/teste-extracao.js` (bloco novo "Correcoes da descricao", depois do bloco da `revisaoDescricao`)

**Interfaces:**
- Produces (todas exportadas, sem import de banco):
  - `TIPOS = ["TROCA", "REGRA"]`, `MAXIMO_TEXTO = 120`, `MAXIMO_EXPLICACAO = 500`, `MAXIMO_PAR = 60`, `TETO_DO_BLOCO = 6000`.
  - `validarCorrecao(dados: { tipo, errado?, certo, explicacao?, promptNome? }) => { ok: true, dados: { tipo, errado: string|null, certo: string, explicacao: string|null, promptNome: string|null } } | { ok: false, erros: Record<string, string> }`. Tudo `trim()`; vazio vira `null` (`errado` numa REGRA é sempre `null`).
  - `aplicarCorrecoes(texto: string, correcoes: { id, tipo, errado, certo }[]) => { texto: string, aplicadas: { id: string, vezes: number }[] }`. REGRA é ignorada. Texto não-string vira `""`.
  - `blocoDeCorrecoes(correcoes: { tipo, errado, certo, explicacao, criadoEm }[], { teto = TETO_DO_BLOCO } = {}) => { texto: string, foraDoTeto: number }`.
  - `instrucoesComCorrecoes(prompt: string, correcoes) => string` (`prompt` quando o bloco é vazio; senão `prompt + "\n\n" + bloco`).
  - `avisoDoTeto(correcoes, { teto } = {}) => string | null` (`"N correções fora da instrução por tamanho; consolide ou desligue."`, `null` com 0).
  - `candidatosDoDiff(antes: string, depois: string) => { antes: string, depois: string, contexto: string }[]`.

Algoritmo de `aplicarCorrecoes` (o que a assinatura não decide):
1. Só TROCAs com `errado` e `certo` não vazios, ordenadas por `errado.length` decrescente.
2. Para cada uma, a expressão: `errado` escapado. **Número** = `\d+(?:[.,]\d+)?` não precedido de letra nem número (pode ter letra colada depois: o `5` de `5V` conta; o `32` de `ESP32` não). Cada número de `errado` vira o grupo `(\d+(?:[.,]\d+)?)` SE a lista de números de `certo` for igual à de `errado` (mesmos textos, mesma ordem: `"5 V"→"5V"` sim; `"90 dias"→"3 meses"` e `"3.3V"→"3,3V"` não); senão fica tudo literal. Fronteiras `(?<![\p{L}\p{N}])` e `(?![\p{L}\p{N}])`, flags `gu`. Caixa: além de `errado` como escrito, o padrão aceita a primeira letra na outra caixa (só quando `errado` começa por letra) e tudo em maiúsculas (só quando `errado` tem letra e não é todo maiúsculo).
3. Em cada casamento monta o `certo` (os números capturados no lugar dos de `certo`) e a caixa: casou todo em maiúsculas (e `errado` não era) → `certo` em maiúsculas; casou com a primeira letra maiúscula (e `errado` era minúscula) → `certo` com a primeira maiúscula; senão `certo`. **Se o texto naquela posição já começa pelo `certo` montado, não troca** (idempotência).
4. O trecho trocado vira um marcador `\u0000<n>\u0000` para as correções seguintes não passarem por cima; no fim os marcadores voltam. `vezes` conta por correção; só as com `vezes > 0` entram em `aplicadas`.

Algoritmo de `candidatosDoDiff`: normaliza `\r\n` → `\n` nos dois; divide em linhas; contagem diferente → `[]`. Em cada linha diferente: prefixo comum `p` e sufixo comum `s` (com `p + s` não passando do menor comprimento); estica `p` para a esquerda enquanto o caractere anterior é letra ou número, e o sufixo para a direita enquanto o primeiro caractere dele é letra ou número; par = `antes.slice(p, antes.length - s)` e o mesmo em `depois`, os dois com `trim()`. Entra só com os dois lados não vazios, diferentes entre si e até `MAXIMO_PAR`; `contexto` = a linha de antes. Repetido (mesmo `antes` e `depois`) sai.

- [ ] **Step 1: Escrever o teste que falha**

```js
const { aplicarCorrecoes, avisoDoTeto, blocoDeCorrecoes, candidatosDoDiff, instrucoesComCorrecoes, validarCorrecao } = await import("../src/lib/ia/correcoes.js");
const troca = (errado, certo, id = errado) => ({ id, tipo: "TROCA", errado, certo });

conferir("validar: TROCA com espacos sobrando", validarCorrecao({ tipo: "TROCA", errado: " 5 V ", certo: "5V" }), { ok: true, dados: { tipo: "TROCA", errado: "5 V", certo: "5V", explicacao: null, promptNome: null } });
conferir("validar: TROCA exige errado diferente de certo, e errado presente", [Boolean(validarCorrecao({ tipo: "TROCA", errado: "5V", certo: "5V" }).erros?.errado), Boolean(validarCorrecao({ tipo: "TROCA", certo: "5V" }).erros?.errado)], [true, true]);
conferir("validar: REGRA sem certo, tipo desconhecido, quebra de linha e 121 caracteres", [Boolean(validarCorrecao({ tipo: "REGRA", certo: " " }).erros?.certo), Boolean(validarCorrecao({ tipo: "X", certo: "a" }).erros?.tipo), Boolean(validarCorrecao({ tipo: "TROCA", errado: "a\nb", certo: "c" }).erros?.errado), Boolean(validarCorrecao({ tipo: "TROCA", errado: "a".repeat(121), certo: "b" }).erros?.errado)], [true, true, true, true]);
conferir("validar: REGRA com escopo", validarCorrecao({ tipo: "REGRA", errado: "ignorado", certo: "Garantia sempre em meses", promptNome: " Arduino " }).dados, { tipo: "REGRA", errado: null, certo: "Garantia sempre em meses", explicacao: null, promptNome: "Arduino" });

conferir("aplicar: numero solto e curinga; nao casa colado (5 Vdc)", aplicarCorrecoes("Tensão: 5 V; Alimentação: 3,3 V ou 12 V; Saída: 5 Vdc", [troca("5 V", "5V")]), { texto: "Tensão: 5V; Alimentação: 3,3V ou 12V; Saída: 5 Vdc", aplicadas: [{ id: "5 V", vezes: 3 }] });
conferir("aplicar: numero colado a letra e literal", aplicarCorrecoes("ESP32 e ESP8266", [troca("ESP32", "ESP32-S3")]).texto, "ESP32-S3 e ESP8266");
conferir("aplicar: onde ja esta como certo nao troca de novo", aplicarCorrecoes("ESP32-S3 pronto", [troca("ESP32", "ESP32-S3")]), { texto: "ESP32-S3 pronto", aplicadas: [] });
conferir("aplicar: numeros diferentes nos dois lados = literal", aplicarCorrecoes("90 dias de garantia; 30 dias", [troca("90 dias", "3 meses")]).texto, "3 meses de garantia; 30 dias");
conferir("aplicar: caixa da primeira letra e do todo; plural nao casa", aplicarCorrecoes("A voltagem e as voltagens. VOLTAGEM. Voltagem alta.", [troca("voltagem", "tensão")]).texto, "A tensão e as voltagens. TENSÃO. Tensão alta.");
conferir("aplicar: a mais longa primeiro e cada trecho uma vez", aplicarCorrecoes("5 V DC e 5 V", [troca("5 V", "5V"), troca("5 V DC", "5VDC")]).texto, "5VDC e 5V");
conferir("aplicar: caracteres de regex sao literais", aplicarCorrecoes("3.3V (DC) +5V", [troca("3.3V (DC)", "3,3V DC"), troca("+5V", "5V")]).texto, "3,3V DC 5V");
conferir("aplicar: texto vazio, REGRA e CRLF", [aplicarCorrecoes("", [troca("5 V", "5V")]), aplicarCorrecoes("5 V", [{ id: "r", tipo: "REGRA", errado: null, certo: "x" }]).texto, aplicarCorrecoes("linha 5 V\r\nlinha 12 V", [troca("5 V", "5V")]).texto], [{ texto: "", aplicadas: [] }, "5 V", "linha 5V\r\nlinha 12V"]);
const lista = [troca("ESP32", "ESP32-S3"), troca("5 V", "5V")];
const umaVez = aplicarCorrecoes("ESP32 a 5 V", lista).texto;
conferir("aplicar: aplicar duas vezes = uma vez", [umaVez, aplicarCorrecoes(umaVez, lista).texto], ["ESP32-S3 a 5V", "ESP32-S3 a 5V"]);

conferir("bloco: vazio", blocoDeCorrecoes([]), { texto: "", foraDoTeto: 0 });
const duas = [{ tipo: "TROCA", errado: "5 V", certo: "5V", explicacao: "unidade colada", criadoEm: new Date(1) }, { tipo: "REGRA", errado: null, certo: "Garantia sempre em meses", explicacao: null, criadoEm: new Date(2) }];
conferir("bloco: uma linha por correcao, a mais recente primeiro", blocoDeCorrecoes(duas).texto, "Correções do dono (valem sempre, mesmo que o prompt diga outra coisa):\n- Garantia sempre em meses\n- Escreva \"5V\", nunca \"5 V\" (unidade colada)");
conferir("bloco: passou do teto, as antigas ficam de fora", blocoDeCorrecoes(duas, { teto: 100 }), { texto: "Correções do dono (valem sempre, mesmo que o prompt diga outra coisa):\n- Garantia sempre em meses", foraDoTeto: 1 });
conferir("instrucoes com e sem correcoes", [instrucoesComCorrecoes("PROMPT", []), instrucoesComCorrecoes("PROMPT", duas).startsWith("PROMPT\n\nCorreções do dono")], ["PROMPT", true]);
conferir("aviso do teto", [avisoDoTeto(duas), avisoDoTeto(duas.concat(duas), { teto: 100 })], [null, "3 correções fora da instrução por tamanho; consolide ou desligue."]);

conferir("diff: o menor trecho, esticado ate a fronteira", candidatosDoDiff("Tensão de operação: 5 V", "Tensão de operação: 5V"), [{ antes: "5 V", depois: "5V", contexto: "Tensão de operação: 5 V" }]);
conferir("diff: palavra trocada", candidatosDoDiff("A\n\n- Voltagem: 5 V;\n- Corrente: 2 A;", "A\n\n- Tensão: 5 V;\n- Corrente: 2 A;"), [{ antes: "Voltagem", depois: "Tensão", contexto: "- Voltagem: 5 V;" }]);
conferir("diff: linha acrescentada, linha reescrita e texto igual nao geram candidato", [candidatosDoDiff("A\nB", "A\nB\nC"), candidatosDoDiff("Parágrafo " + "x".repeat(70), "Outro " + "y".repeat(70)), candidatosDoDiff("igual", "igual")], [[], [], []]);
conferir("diff: duas trocas na linha viram um par; CRLF; repetido sai", [candidatosDoDiff("5 V e 3,3 V", "5V e 3,3V")[0].antes, candidatosDoDiff("a\r\n5 V", "a\n5V"), candidatosDoDiff("x 5 V\ny 5 V", "x 5V\ny 5V").length], ["5 V e 3,3 V", [{ antes: "5 V", depois: "5V", contexto: "5 V" }], 1]);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run teste:extracao`
Expected: `ERR_MODULE_NOT_FOUND` em `src/lib/ia/correcoes.js`.

- [ ] **Step 3: Implementar `src/lib/ia/correcoes.js`** com as assinaturas e os algoritmos acima. Cabeçalho do módulo cita o desenho e o porquê de cada regra (fronteira, curinga, idempotência).

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run teste:extracao`
Expected: todas `ok`, código 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ia/correcoes.js scripts/teste-extracao.js
git commit -m "Correcoes da descricao: regras puras (validar, aplicar, bloco da instrucao, candidatos do diff)"
```

---

### Task 3: Tabela `CorrecaoDaDescricao` e o acesso ao banco

**Files:**
- Modify: `prisma/schema.prisma` (depois do `model PromptDescricao`, ~linha 533)
- Create: `prisma/migrations/20261107_correcoes_da_descricao/migration.sql`
- Create: `src/lib/ia/correcoesBanco.js`
- Test: `scripts/teste-proposta.js` (bloco novo "Correcoes da descricao: banco", antes da limpeza final)

**Interfaces:**
- Consumes: `validarCorrecao`, `aplicarCorrecoes`, `blocoDeCorrecoes` da Tarefa 2.
- Produces (schema):

```prisma
enum TipoDeCorrecao { TROCA REGRA }
enum OrigemDaCorrecao { CHAT CADASTRO TELA }

/// Correcoes da descricao (spec 2026-11-07): o que o dono ensina uma vez e o Rise aplica em toda descricao (TROCA) ou poe
/// na instrucao da IA e do Claude (REGRA). promptNome null = todas as descricoes. usos = quantas vezes a TROCA trocou texto.
model CorrecaoDaDescricao {
  id           String           @id @default(cuid())
  tipo         TipoDeCorrecao
  errado       String?
  certo        String
  explicacao   String?
  promptNome   String?
  ativa        Boolean          @default(true)
  origem       OrigemDaCorrecao
  produtoSku   String?
  usos         Int              @default(0)
  criadoPor    String
  criadoEm     DateTime         @default(now())
  atualizadoEm DateTime         @updatedAt

  @@index([ativa, promptNome])
}
```

- Produces (`correcoesBanco.js`, todas exportadas):
  - `CACHE_MS = 60_000`; `lerCorrecoesAtivas({ promptNome = null } = {}) => Promise<Correcao[]>`: `ativa: true` e `promptNome` em `[null, promptNome]` (só `null` quando `promptNome` é `null`), `criadoEm desc`; cache em `Map` por chave `promptNome ?? ""`, válido `CACHE_MS`.
  - `limparCacheDeCorrecoes()`; toda escrita deste módulo a chama.
  - `criarCorrecao(dados, { quem, origem, produtoSku = null }) => Promise<{ ok: true, correcao } | { ok: false, erros } | { ok: false, erro, existente }>`: `validarCorrecao`; TROCA repetida = outra TROCA com o mesmo `errado` sem caixa (`mode: "insensitive"`) e o mesmo `promptNome` → `erro` = `Já existe a correção "5 V → 5V" para todas as descrições.` (ou `para o prompt X`), `existente` = a linha.
  - `editarCorrecao(id, dados) => mesmo retorno` (o `tipo` não muda; a repetição ignora o próprio id).
  - `alternarCorrecao(id, ativa: boolean) => Promise<{ ok: true, correcao } | { ok: false, erro }>`.
  - `excluirCorrecao(id) => Promise<{ ok: boolean }>`.
  - `listarCorrecoes({ busca = "", promptNome, ativas } = {}) => Promise<Correcao[]>` (`criadoEm desc`; `busca` = `contains` sem caixa em `errado`, `certo` ou `explicacao`; `promptNome` dado = escopo `null` OU igual; `ativas` dado = filtra).
  - `somarUsos(aplicadas: { id, vezes }[]) => Promise<void>` (um `update` com `increment` por id; erro só no `console.error`).
  - `ensaioDaCorrecao(correcao, { limite = 3 } = {}) => Promise<{ sku, antes, depois }[]>`: os `limite` produtos mais recentes (`atualizadoEm desc`) cuja `descricaoBase` contém `errado` (sem caixa); para cada um, a PRIMEIRA linha que `aplicarCorrecoes` muda. REGRA → `[]`. **Não soma usos.**
  - `corrigirDescricaoDoSalvar(texto) => Promise<{ texto, aplicadas }>`: `lerCorrecoesAtivas()` + `aplicarCorrecoes` + `somarUsos` (await, dentro de try/catch); texto não-string volta como veio com `aplicadas: []`.
  - `criarCorrecoesDoCadastro(lista: { errado, certo, promptNome?, explicacao? }[], { quem, produtoSku }) => Promise<{ criadas: Correcao[], recusadas: { errado, certo, erro }[] }>`: cada item vira `criarCorrecao({ tipo: "TROCA", ... }, { quem, origem: "CADASTRO", produtoSku })`.

- [ ] **Step 1: Escrever o teste que falha** (bloco com `prisma` já importado no script; limpeza por `criadoPor: "zz-corr-teste"` e produtos `ZZ-CORR-*` no começo e no fim; `minhas = (lista) => lista.filter((c) => c.criadoPor === "zz-corr-teste")`, porque o banco do PC pode ter correções de verdade)

```js
const banco = await import("../src/lib/ia/correcoesBanco.js");
const QUEM = { quem: "zz-corr-teste", origem: "CHAT" };
const minhas = (lista) => lista.filter((c) => c.criadoPor === "zz-corr-teste");
await prisma.correcaoDaDescricao.deleteMany({ where: { criadoPor: "zz-corr-teste" } });
await prisma.produto.deleteMany({ where: { sku: { startsWith: "ZZ-CORR-" } } });
await prisma.produto.create({ data: { sku: "ZZ-CORR-1", tituloBase: "ZZ Corr 1", descricaoBase: "T\n\nFunciona a 5 V.\n\nEspecificações técnicas:\n- Tensão: 5 V;", unidade: "UN", ativo: true } });

const criada = await banco.criarCorrecao({ tipo: "TROCA", errado: "5 V", certo: "5V", explicacao: "unidade colada" }, QUEM);
conferir("banco: cria ativa, origem CHAT, usos 0", criada.ok && criada.correcao.ativa && criada.correcao.origem === "CHAT" && criada.correcao.usos === 0 && criada.correcao.criadoPor === "zz-corr-teste");
const repetida = await banco.criarCorrecao({ tipo: "TROCA", errado: "5 v", certo: "5V" }, QUEM);
conferir("banco: repetida sem caixa e recusada apontando a existente", !repetida.ok && repetida.existente?.id === criada.correcao.id && /Já existe/.test(repetida.erro));
conferir("banco: invalida volta erros por campo", (await banco.criarCorrecao({ tipo: "TROCA", certo: "x" }, QUEM)).erros?.errado !== undefined);
const doPrompt = await banco.criarCorrecao({ tipo: "REGRA", certo: "Garantia em meses", promptNome: "ZZ Prompt Que Nao Existe" }, QUEM);
conferir("ativas: so as globais sem prompt; com o prompt, as duas; outro prompt, so a global", [minhas(await banco.lerCorrecoesAtivas()).length, minhas(await banco.lerCorrecoesAtivas({ promptNome: "ZZ Prompt Que Nao Existe" })).length, minhas(await banco.lerCorrecoesAtivas({ promptNome: "Outro" })).length], [1, 2, 1]);
await prisma.correcaoDaDescricao.update({ where: { id: doPrompt.correcao.id }, data: { ativa: false } });
const aindaNoCache = (await banco.lerCorrecoesAtivas({ promptNome: "ZZ Prompt Que Nao Existe" })).some((c) => c.id === doPrompt.correcao.id);
banco.limparCacheDeCorrecoes();
const depoisDeLimpar = (await banco.lerCorrecoesAtivas({ promptNome: "ZZ Prompt Que Nao Existe" })).some((c) => c.id === doPrompt.correcao.id);
conferir("cache: a leitura dentro dos 60 s nao ve o que mudou por fora; limpar ve", [aindaNoCache, depoisDeLimpar], [true, false]);
conferir("listar: busca sem caixa e escopo do prompt (com o nome que nao existe mais)", [minhas(await banco.listarCorrecoes({ busca: "COLADA" })).map((c) => c.id), minhas(await banco.listarCorrecoes({ promptNome: "ZZ Prompt Que Nao Existe", ativas: false })).map((c) => c.promptNome)], [[criada.correcao.id], ["ZZ Prompt Que Nao Existe"]]);
const ensaio = await banco.ensaioDaCorrecao(criada.correcao);
conferir("ensaio: a primeira linha que muda, em ate 3 produtos, sem somar usos", ensaio.some((e) => e.sku === "ZZ-CORR-1" && e.antes === "Funciona a 5 V." && e.depois === "Funciona a 5V.") && ensaio.length <= 3 && (await prisma.correcaoDaDescricao.findUnique({ where: { id: criada.correcao.id } })).usos === 0);
const salvar = await banco.corrigirDescricaoDoSalvar("Tensão: 5 V e 12 V");
conferir("salvar: aplica as globais e soma os usos", salvar.texto === "Tensão: 5V e 12V" && (await prisma.correcaoDaDescricao.findUnique({ where: { id: criada.correcao.id } })).usos === 2);
conferir("salvar: texto nulo volta como veio", await banco.corrigirDescricaoDoSalvar(null), { texto: null, aplicadas: [] });
const doCadastro = await banco.criarCorrecoesDoCadastro([{ errado: "voltagem", certo: "tensão" }, { errado: "5 V", certo: "5V" }], { quem: "zz-corr-teste", produtoSku: "ZZ-CORR-1" });
conferir("cadastro: cria a nova (origem CADASTRO, com o sku) e recusa a repetida sem falhar", doCadastro.criadas.length === 1 && doCadastro.criadas[0].origem === "CADASTRO" && doCadastro.criadas[0].produtoSku === "ZZ-CORR-1" && doCadastro.recusadas.length === 1 && doCadastro.recusadas[0].errado === "5 V");
const desligada = await banco.alternarCorrecao(criada.correcao.id, false);
conferir("alternar: desligada sai das ativas", !desligada.correcao.ativa && !(await banco.lerCorrecoesAtivas()).some((c) => c.id === criada.correcao.id));
const editada = await banco.editarCorrecao(criada.correcao.id, { tipo: "TROCA", errado: "5 V", certo: "5 Volts" });
conferir("editar: muda o certo; repetida com outra existente e recusada", editada.ok && editada.correcao.certo === "5 Volts" && !(await banco.editarCorrecao(criada.correcao.id, { tipo: "TROCA", errado: "voltagem", certo: "x" })).ok);
conferir("excluir", (await banco.excluirCorrecao(criada.correcao.id)).ok && (await prisma.correcaoDaDescricao.findUnique({ where: { id: criada.correcao.id } })) === null);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run teste:proposta`
Expected: `ERR_MODULE_NOT_FOUND` em `correcoesBanco.js` (ou `prisma.correcaoDaDescricao` indefinido).

- [ ] **Step 3: Schema e migration**

Acrescentar o model e os enums ao `schema.prisma`. Escrever o SQL à mão no molde de `prisma/migrations/20261105_licencas_softwares/migration.sql`: comentário de cabeçalho, `CREATE TYPE "TipoDeCorrecao"`, `CREATE TYPE "OrigemDaCorrecao"`, `CREATE TABLE "CorrecaoDaDescricao"` (colunas como no model; `"criadoEm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`, `"atualizadoEm" TIMESTAMP(3) NOT NULL`), `CREATE INDEX "CorrecaoDaDescricao_ativa_promptNome_idx" ON "CorrecaoDaDescricao"("ativa", "promptNome")`.

Run: `npx prisma migrate deploy && npx prisma generate`
Expected: a migration `20261107_correcoes_da_descricao` aplicada; `npx prisma migrate status` sem pendência. Reiniciar o servidor do site se estiver no ar.

- [ ] **Step 4: Implementar `src/lib/ia/correcoesBanco.js`** com as funções acima (`import { prisma } from "@/lib/db"`, o mesmo import dos outros módulos de banco).

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run teste:proposta`
Expected: todas `ok`, código 0.

- [ ] **Step 6: Commit (só o hunk de `CorrecaoDaDescricao` do schema)**

```bash
git add -p prisma/schema.prisma
git add prisma/migrations/20261107_correcoes_da_descricao/migration.sql src/lib/ia/correcoesBanco.js scripts/teste-proposta.js
git commit -m "Correcoes da descricao: tabela, migration e acesso ao banco com cache"
```

Conferir com `git show --stat HEAD` que só esses arquivos entraram e `git diff prisma/schema.prisma` ainda mostra o hunk da outra sessão (PedidoDeCompra).

---

### Task 4: Proposta (MCP) aplica as TROCAs e devolve as correções; roteiro v17

**Files:**
- Modify: `src/lib/proposta/banco.js:14,124-127` (import + bloco `validado.secao === "descricao"`)
- Modify: `src/lib/proposta/leitura.js:126-185` (`lerParaProposta`)
- Modify: `src/lib/proposta/roteiro.js:17` (versão) e o bloco de regras da descrição (~linhas 55-66)
- Test: `scripts/teste-proposta.js`

**Interfaces:**
- Consumes: `lerCorrecoesAtivas`, `somarUsos` (Tarefa 3); `aplicarCorrecoes`, `blocoDeCorrecoes` (Tarefa 2).
- Produces: `lerParaProposta(sku, { prompt })` devolve também `correcoes: { itens: { id, tipo, errado, certo, explicacao, promptNome }[], instrucao: string }` (as ativas de escopo `null` + as do `prompt` pedido, quando houver; `instrucao` = `blocoDeCorrecoes(itens).texto`). `VERSAO_DO_ROTEIRO = "17"`.

- [ ] **Step 1: Escrever o teste que falha** (no bloco da Tarefa 3, antes da limpeza; o `conteudo` da seção `descricao` segue o molde do bloco de `gravarProposta` que o teste já tem, ~linhas 486-590, e a seção gravada é lida pelo mesmo caminho daquele bloco)

```js
const { gravarProposta } = await import("../src/lib/proposta/banco.js");
const { lerParaProposta } = await import("../src/lib/proposta/leitura.js");
const { ROTEIRO, VERSAO_DO_ROTEIRO } = await import("../src/lib/proposta/roteiro.js");
const global5V = await banco.criarCorrecao({ tipo: "TROCA", errado: "5 V", certo: "5V" }, QUEM);
await banco.criarCorrecao({ tipo: "TROCA", errado: "Funciona", certo: "Opera", promptNome: "Padrão do sistema" }, QUEM);
await prisma.produto.create({ data: { sku: "ZZ-CORR-2", tituloBase: "ZZ Corr 2", unidade: "UN", ativo: true } });
const gravada = await gravarProposta("ZZ-CORR-2", { secao: "descricao", conteudo: { texto: "T\n\nFunciona com 5 V.\n\nEspecificações técnicas:\n- Tensão: 5 V;", prompt: "Padrão do sistema" /* + o resto do molde */ } });
const secao = /* a secao descricao da proposta do ZZ-CORR-2, lida como no bloco existente */;
conferir("proposta: a descricao gravada passa pelas TROCAs do escopo global e do prompt", gravada.ok && secao.texto === "T\n\nOpera com 5V.\n\nEspecificações técnicas:\n- Tensão: 5V;");
conferir("proposta: usos somados (a linha tecnica ja veio compactada pelo passo zero: 1 uso)", (await prisma.correcaoDaDescricao.findUnique({ where: { id: global5V.correcao.id } })).usos === 1);
const lido = await lerParaProposta("ZZ-CORR-2", { prompt: "Padrão do sistema" });
conferir("leitura: devolve as correcoes do escopo e a instrucao", lido.correcoes.itens.some((c) => c.errado === "Funciona") && lido.correcoes.itens.some((c) => c.errado === "5 V") && lido.correcoes.instrucao.includes("Escreva \"5V\", nunca \"5 V\""));
conferir("leitura sem prompt: so as globais", !(await lerParaProposta("ZZ-CORR-2")).correcoes.itens.some((c) => c.errado === "Funciona"));
conferir("roteiro v17 com o passo das correcoes", VERSAO_DO_ROTEIRO === "17" && ROTEIRO.includes("Correções da descrição") && ROTEIRO.includes("correcoes"));
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run teste:proposta`
Expected: FALHA em "proposta: a descricao gravada passa pelas TROCAs" (texto com "5 V" e "Funciona").

- [ ] **Step 3: Implementar**

`banco.js`: no bloco da seção `descricao`, depois de `normalizarDescricao`, `const { texto, aplicadas } = aplicarCorrecoes(..., await lerCorrecoesAtivas({ promptNome: typeof plano.conteudo.prompt === "string" ? plano.conteudo.prompt : null }))`; `somarUsos(aplicadas)` com `.catch` no console (sem segurar a gravação). `leitura.js`: ler `lerCorrecoesAtivas({ promptNome: prompt ?? null })` no `Promise.all` e devolver `correcoes`. `roteiro.js`: versão `"17"`, comentário da versão ("17" em 07/11/2026: as Correções da descrição) e a regra nova no bloco da descrição: `- Aplique as Correções da descrição que lerParaProposta devolve em "correcoes" (TROCA: escreva sempre o "certo", nunca o "errado"; REGRA: siga a instrução). O Rise aplica as TROCAs no texto gravado de qualquer jeito; a instrução é para o texto já nascer certo.`

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run teste:proposta`
Expected: todas `ok`, código 0.

- [ ] **Step 5: Commit**

```bash
git add src/lib/proposta/banco.js src/lib/proposta/leitura.js src/lib/proposta/roteiro.js scripts/teste-proposta.js
git commit -m "Proposta de produto aplica as Correcoes da descricao e as devolve em lerParaProposta (roteiro v17)"
```

---

### Task 5: IA do Rise — bloco na instrução e TROCAs no texto

**Files:**
- Modify: `src/lib/ia/anuncio.js` (`montarDescricao` 670-726, `gerarDescricao` 727-876, as três montagens de chave `formatarLinhaTecnica(\`- ${semPontuacaoFinal(...)}: ...;\`)`)
- Modify: `src/app/produtos/acoes.js:371-392` (`criarDescricaoIA`)
- Modify: `src/components/produtos/JanelaDescricao.jsx:496`
- Test: `scripts/teste-extracao.js` (no bloco da Tarefa 2)

**Interfaces:**
- Consumes: `aplicarCorrecoes`, `instrucoesComCorrecoes` (Tarefa 2); `lerCorrecoesAtivas`, `somarUsos` (Tarefa 3).
- Produces:
  - `montarDescricaoComUsos({ titulo, sku, paragrafos, caracteristicas, itensInclusos, medidas = {}, correcoes = [] }) => { texto: string, aplicadas: { id, vezes }[] }` (nova, exportada): monta como hoje e aplica `aplicarCorrecoes` UMA vez no texto final.
  - `montarDescricao(args) => string` continua existindo e passa a ser `montarDescricaoComUsos(args).texto`.
  - `gerarDescricao(ids, { ..., promptNome = null, correcoes = null }, instrucoes, gasto)`: `const lista = correcoes ?? await lerCorrecoesAtivas({ promptNome })`, lida ANTES do laço de tentativas (uma leitura por geração; `correcoes` é a costura dos testes); sistema = `blocosDoSistema(SISTEMA, instrucoesComCorrecoes(instrucoes, lista))`; usa `montarDescricaoComUsos({ ..., correcoes: lista })` e chama `somarUsos(aplicadas)` sem `await`, com `.catch` no console; as chaves de `fontesDasLinhas`/`origensDasLinhas` passam pelo helper local `chaveDaLinha(nome, valor, lista) = aplicarCorrecoes(formatarLinhaTecnica(\`- ${semPontuacaoFinal(nome)}: ${semPontuacaoFinal(valor)};\`), lista).texto` nos três lugares (senão a linha corrigida não acha a loja de origem).
  - `criarDescricaoIA(ids, produto, instrucoes, modelo, promptNome = null)` repassa `promptNome` em `gerarDescricao(ids, { ...produto, modeloIA, promptNome }, ...)`. A janela passa `promptEscolhido?.nome ?? null` como 5º argumento.

- [ ] **Step 1: Escrever o teste que falha**

```js
const { montarDescricao, montarDescricaoComUsos } = await import("../src/lib/ia/anuncio.js");
const comCorrecoes = montarDescricaoComUsos({ titulo: "Placa", sku: "1", paragrafos: ["Funciona com voltagem de 5 V."], caracteristicas: [{ nome: "Tensão", valor: "5 V" }], itensInclusos: ["01 placa"], medidas: {}, correcoes: [troca("Funciona", "Opera")] });
conferir("montar: a regra fixa (5V, tensao) e a TROCA do dono no texto final, com os usos", [comCorrecoes.texto.includes("Opera com tensão de 5V."), comCorrecoes.texto.includes("- Tensão: 5V;"), comCorrecoes.aplicadas], [true, true, [{ id: "Funciona", vezes: 1 }]]);
conferir("montar: sem correcoes, o texto de sempre", montarDescricao({ titulo: "Placa", sku: "1", paragrafos: ["Funciona."], caracteristicas: [], itensInclusos: [], medidas: {} }).startsWith("PLACA\n\nFunciona."), true);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run teste:extracao`
Expected: `TypeError: montarDescricaoComUsos is not a function`.

- [ ] **Step 3: Implementar** em `anuncio.js`, `acoes.js` e `JanelaDescricao.jsx` como nas Interfaces.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run teste:extracao && npx eslint src/lib/ia/anuncio.js src/app/produtos/acoes.js src/components/produtos/JanelaDescricao.jsx`
Expected: todas `ok`; eslint sem erro.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ia/anuncio.js src/app/produtos/acoes.js src/components/produtos/JanelaDescricao.jsx scripts/teste-extracao.js
git commit -m "IA do Rise: Correcoes da descricao na instrucao e no texto final, por prompt"
```

---

### Task 6: Ferramentas do MCP

**Files:**
- Create: `src/lib/mcp/correcoes.js`
- Modify: `src/lib/mcp/servidor.js` (import, `PROPOSTAS`, `INSTRUCOES`)
- Modify: `src/lib/mcp/consultas.js:18` (`DA_PROPOSTA`) e `RESUMOS`
- Test: `scripts/teste-mcp.js` (constante `CORRECOES`, o filtro do lembrete em ~1190, bloco novo no fim do bloco "Consultas e lembrete", que já tem `quem`, `chamar(nome, argumentos)`, `lista` do `tools/list`, `resumoDaChamada`, `pedidoMcp`, `lerRespostaMcp`, `responderMcp` e o contador `id`)

**Interfaces:**
- Consumes: `criarCorrecao`, `listarCorrecoes`, `alternarCorrecao`, `ensaioDaCorrecao` (Tarefa 3); `ErroDeFerramenta` de `@/lib/riseAi/ferramentas/erro`; o molde de `src/lib/mcp/referencias.js`.
- Produces: `export const FERRAMENTAS_DE_CORRECOES = [GRAVAR, LISTAR, DESLIGAR]`, com:
  - `gravarCorrecaoDaDescricao`: `esquema: z.object({ tipo: z.enum(["TROCA", "REGRA"]), errado: z.string().trim().max(120).optional(), certo: z.string().trim().min(1).max(120), explicacao: z.string().trim().max(500).optional(), prompt: z.string().trim().max(60).optional(), sku: z.string().trim().max(60).optional() })`; `anotacoes: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }`; `executar`: exige `contexto.pode("tela.produtos.cadastro", "editar")` (senão `ErroDeFerramenta("Este login não pode gravar correções da descrição (precisa editar o cadastro de Produtos).")`); `criarCorrecao({ tipo, errado, certo, explicacao, promptNome: prompt }, { quem: contexto.usuario, origem: "CHAT", produtoSku: sku })`; `!ok` → `ErroDeFerramenta(resultado.erro ?? Object.values(resultado.erros).join(" "))`; devolve `{ correcao, ensaio }` (`ensaio` = `ensaioDaCorrecao(correcao)` numa TROCA, `[]` numa REGRA). Descrição, literal: `Grava uma Correção da descrição que o dono DITOU nesta conversa (nunca por iniciativa sua): TROCA (errado → certo; o Rise aplica no texto de toda descrição) ou REGRA (instrução de estilo, só vai para a IA). Ponha em explicacao as palavras do dono. prompt = o nome do prompt da descrição quando a correção vale só para ele; sem prompt vale para todas. Devolve a correção e, numa TROCA, um ensaio do que ela mudaria em até 3 descrições recentes. Antes de gravar, confira com listarCorrecoesDaDescricao se já existe.`
  - `listarCorrecoesDaDescricao`: `esquema: z.object({ prompt: z.string().trim().max(60).optional(), ativas: z.boolean().optional() })` (`ativas` sem valor = `true`); exige `pode("tela.produtos.cadastro", "ver")`; devolve `{ correcoes: listarCorrecoes({ promptNome: prompt, ativas }) }`; anotações só leitura.
  - `desligarCorrecaoDaDescricao`: `esquema: z.object({ id: z.string().trim().min(1) })`; exige `editar`; `alternarCorrecao(id, false)`; `!ok` → `ErroDeFerramenta("Correção não encontrada.")`; devolve `{ correcao }`; anotações como a de gravar, `idempotentHint: true`.
- `servidor.js`: `PROPOSTAS` ganha `...FERRAMENTAS_DE_CORRECOES` (sem o lembrete de anotar). Linha nova nas `INSTRUCOES`, literal: `Correções da descrição: quando o dono corrigir um detalhe do texto ("escreva 5V, não 5 V") e pedir para guardar, grave com gravarCorrecaoDaDescricao; nunca grave uma por conta própria. lerParaProposta devolve em "correcoes" as que valem para a proposta.`
- `consultas.js`: os três nomes em `DA_PROPOSTA`; `RESUMOS`: `gravarCorrecaoDaDescricao: (a) => \`correção da descrição: ${a.tipo === "REGRA" ? a.certo : \`${a.errado} → ${a.certo}\`}\``, `listarCorrecoesDaDescricao: () => "correções da descrição: lista"`, `desligarCorrecaoDaDescricao: (a) => \`correção da descrição ${a.id}: desligou\``.

- [ ] **Step 1: Escrever o teste que falha** (`const CORRECOES = ["gravarCorrecaoDaDescricao", "listarCorrecoesDaDescricao", "desligarCorrecaoDaDescricao"];` ao lado de `COMPRAS_ESCRITA`, ~linha 51; incluir no filtro da asserção "a descricao de toda ferramenta de consulta lembra de anotar", ~linha 1190; o bloco abaixo no fim do bloco "Consultas e lembrete")

```js
await prisma.correcaoDaDescricao.deleteMany({ where: { criadoPor: "zz-mcp-lembrete" } });
const gravou = await chamar("gravarCorrecaoDaDescricao", { tipo: "TROCA", errado: "5 V", certo: "5V", explicacao: "dono: unidade colada" });
const corpo = JSON.parse(gravou?.content?.[0]?.text ?? "{}");
conferir("correcoes: grava pelo chat, origem CHAT e o login da conexao, sem o lembrete", [gravou?.content?.length, corpo.correcao?.origem, corpo.correcao?.criadoPor, Array.isArray(corpo.ensaio)], [1, "CHAT", "zz-mcp-lembrete", true]);
const repetida = await chamar("gravarCorrecaoDaDescricao", { tipo: "TROCA", errado: "5 v", certo: "5V" });
conferir("correcoes: repetida volta como erro da ferramenta", [repetida?.isError, /Já existe/.test(repetida?.content?.[0]?.text ?? "")], [true, true]);
const listou = JSON.parse((await chamar("listarCorrecoesDaDescricao", {}))?.content?.[0]?.text ?? "{}");
conferir("correcoes: lista traz a gravada", listou.correcoes?.some((c) => c.id === corpo.correcao.id), true);
const desligou = JSON.parse((await chamar("desligarCorrecaoDaDescricao", { id: corpo.correcao.id }))?.content?.[0]?.text ?? "{}");
conferir("correcoes: desligar nao apaga", [desligou.correcao?.ativa, (await prisma.correcaoDaDescricao.findUnique({ where: { id: corpo.correcao.id } })) !== null], [false, true]);
const semPoder = { ...quem, pode: (id) => id !== "tela.produtos.cadastro" };
const negada = (await lerRespostaMcp(await responderMcp(pedidoMcp("tools/call", { name: "gravarCorrecaoDaDescricao", arguments: { tipo: "REGRA", certo: "x" } }, { id: id++ }), semPoder)))?.result;
conferir("correcoes: sem editar o cadastro de Produtos, recusa", negada?.isError, true);
conferir("correcoes: resumo da chamada", [resumoDaChamada("gravarCorrecaoDaDescricao", { tipo: "TROCA", errado: "5 V", certo: "5V" }), resumoDaChamada("gravarCorrecaoDaDescricao", { tipo: "REGRA", certo: "Garantia em meses" })], ["correção da descrição: 5 V → 5V", "correção da descrição: Garantia em meses"]);
conferir("correcoes: as tres ferramentas estao na lista", CORRECOES.every((nome) => lista.some((ferramenta) => ferramenta.name === nome)), true);
await prisma.correcaoDaDescricao.deleteMany({ where: { criadoPor: "zz-mcp-lembrete" } });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run teste:mcp`
Expected: FALHA em "correcoes: grava pelo chat" (ferramenta desconhecida).

- [ ] **Step 3: Implementar** `src/lib/mcp/correcoes.js`, o registro em `servidor.js` e `consultas.js`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run teste:mcp`
Expected: todas `ok`, código 0 (inclusive a asserção do lembrete, já com `CORRECOES` no filtro, e a das `INSTRUCOES`, se houver uma que conte as linhas).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/correcoes.js src/lib/mcp/servidor.js src/lib/mcp/consultas.js scripts/teste-mcp.js
git commit -m "MCP: gravar, listar e desligar Correcoes da descricao pelo chat"
```

---

### Task 7: Salvar do produto aplica as TROCAs e cria as marcadas

**Files:**
- Modify: `src/app/produtos/acoes.js` (imports ~linha 42; logo depois de `const dados = resultado.data;` ~linha 820; depois do bloco `marcarSecoesAplicadas` ~linha 1108)

**Interfaces:**
- Consumes: `corrigirDescricaoDoSalvar`, `criarCorrecoesDoCadastro` (Tarefa 3); `sessaoDeAcessos` de `@/lib/acessos/servidor` (devolve a sessão com `.login`).
- Produces: o campo escondido `correcoesDaDescricao` (JSON `{ errado, certo, promptNome, explicacao }[]`) é lido pelo Salvar; `dados.descricaoBase` sai corrigida.

- [ ] **Step 1: Aplicar as TROCAs** depois de `const dados = resultado.data;`:

```js
// As Correcoes da descricao (TROCAs de escopo global) valem tambem no texto digitado ou colado (spec 2026-11-07).
if (typeof dados.descricaoBase === "string" && dados.descricaoBase) dados.descricaoBase = (await corrigirDescricaoDoSalvar(dados.descricaoBase)).texto;
```

- [ ] **Step 2: Criar as marcadas** depois do `try` de `marcarSecoesAplicadas`, no mesmo molde (falha não desfaz o Salvar):

```js
try {
  const marcadas = JSON.parse(String(formData.get("correcoesDaDescricao") || "[]"));
  if (Array.isArray(marcadas) && marcadas.length > 0) {
    const { recusadas } = await criarCorrecoesDoCadastro(marcadas, { quem: (await sessaoDeAcessos()).login ?? "pc", produtoSku: dados.sku });
    for (const item of recusadas) console.error("Correcao da descricao recusada no Salvar:", item.erro);
  }
} catch (erro) {
  console.error("Falha ao criar as correcoes da descricao:", erro.message);
}
```

- [ ] **Step 3: Conferir**

Run: `npx eslint src/app/produtos/acoes.js && npm run teste:acessos`
Expected: sem erro; o guarda estático continua passando (nenhum export novo).

- [ ] **Step 4: Commit**

```bash
git add src/app/produtos/acoes.js
git commit -m "Salvar do produto aplica as Correcoes da descricao e cria as marcadas no popup"
```

---

### Task 8: Popup "O que mudou na descrição" e a descrição "da máquina" no formulário

**Files:**
- Create: `src/components/produtos/JanelaOQueMudou.jsx`
- Modify: `src/components/produtos/FormularioProduto.jsx` (imports; `aplicar` ~3326; `acompanharNomeNaDescricao` 2608-2613; `useRascunhoAutomatico` 2668-2688; `recuperarRascunho` 2690; `<form` 3449; campos escondidos ~3554; render do popup ao lado do "Sair sem salvar?" ~3611)
- Modify: `src/lib/rascunhoDoCadastro.js` (`montarRascunho` 74-105, `lerRascunho` 131-157)
- Test: `scripts/teste-extracao.js` (bloco do rascunho, ~linha 3182)

**Interfaces:**
- Consumes: `candidatosDoDiff`, `MAXIMO_PAR` (Tarefa 2); `promptsDaDescricao` de `@/app/produtos/acoes` (já existe, linha 412: devolve a resposta com `prompts: [{ id, nome, ... }]`); `lerPreferenciaDaDescricao` de `@/lib/preferenciaDaDescricao` (devolve `{ promptId, ... }`); `propsDoFundo`; `BolhaDeAjuda`.
- Produces: `JanelaOQueMudou({ candidatos, prompt, aoSalvar, aoSalvarSemRegra, aoVoltar })`, com `candidatos: { antes, depois, contexto }[]`, `prompt: { nome: string } | null`, `aoSalvar(marcadas: { errado, certo, promptNome: string|null, explicacao: string|null }[])`. `montarRascunho`/`lerRascunho` levam `descricaoDaMaquina: string | null`.

Comportamento no formulário (linha-guia: o operador vê primeiro o que mudou, par a par; a ação principal é Salvar):
- `descricaoDaMaquina` é um `useRef` que nasce com `preenchido?.descricaoBase ?? produto?.descricaoBase ?? clone?.campos.descricaoBase ?? ""`; muda em `aplicar()` quando `trazidos.descricaoBase !== undefined` (recebe `mesclado.descricaoBase`: IA, proposta, busca por código); em `acompanharNomeNaDescricao` recebe `acompanharTituloNaDescricao(descricaoDaMaquina.current, nomeDeAntes, nome)` (a troca do Nome não é correção); em `recuperarRascunho` recebe `guardado.descricaoDaMaquina ?? guardado.campos.descricaoBase ?? ""`.
- `onSubmit` do `<form>`: com `confirmado.current` verdadeiro, zera e deixa passar. Senão, `candidatos = candidatosDoDiff(descricaoDaMaquina.current, valorDoCampo("descricaoBase"))`; vazio → deixa passar (o campo escondido fica `"[]"`); senão `evento.preventDefault()`, lê `promptsDaDescricao()` para achar o nome do `lerPreferenciaDaDescricao().promptId` e abre o popup.
- Popup: **Salvar** → `campoCorrecoes.current.value = JSON.stringify(marcadas)`, `confirmado.current = true`, `formulario.current.requestSubmit()`; **Salvar sem regra** → `"[]"` e o mesmo; Esc e fundo → só fecha. O `action={acao}` do formulário não muda.
- `<input type="hidden" name="correcoesDaDescricao" ref={campoCorrecoes} defaultValue="[]" />` ao lado de `propostaAplicada`.
- `estado` do `useRascunhoAutomatico` ganha `descricaoDaMaquina: descricaoDaMaquina.current`.

Desenho do popup (`role="dialog"`, `aria-labelledby`, `z-[60]`, largura `max-w-xl`):

```
O que mudou na descrição                                   (i)
[ ] 5 V  →  5V
    Tensão de operação: 5 V
[ ] Voltagem  →  Tensão
    - Voltagem: 5 V;
Vale para: (•) Todas as descrições  ( ) Só o prompt "Arduino"
Por quê (opcional): [____________________________]
                              [Salvar sem regra]  [Salvar]
```

A bolha "i": "Marque o que deve virar regra: o Rise passa a corrigir isso em toda descrição." Caixas desmarcadas; `antes` riscado em `text-suave`, `depois` em negrito; contexto em `text-xs text-suave truncate`; a opção do prompt só aparece com `prompt`; Salvar com 0 marcadas = Salvar sem regra.

- [ ] **Step 1: Escrever o teste do rascunho que falha** (no bloco da linha ~3182, com o `estado`, o `agora` e o `antes()` daquele bloco)

```js
const comMaquina = montarRascunho({ campos: { descricaoBase: "5V" }, estado: { ...estado, descricaoDaMaquina: "5 V" }, baseEm: null, agora: antes(1000) });
conferir("rascunho leva e devolve a descricao da maquina (o diff do Salvar sobrevive ao recarregar)", lerRascunho(JSON.stringify(comMaquina), { agora })?.descricaoDaMaquina, "5 V");
conferir("rascunho sem a descricao da maquina: null", lerRascunho(JSON.stringify(montarRascunho({ campos: { sku: "1" }, estado, baseEm: null, agora: antes(1000) })), { agora })?.descricaoDaMaquina, null);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run teste:extracao`
Expected: FALHA (obtido `undefined`, esperado `"5 V"`).

- [ ] **Step 3: Implementar** `rascunhoDoCadastro.js` (`descricaoDaMaquina: typeof estado.descricaoDaMaquina === "string" ? estado.descricaoDaMaquina : null` em `montarRascunho`; `typeof bruto.descricaoDaMaquina === "string" ? ... : null` em `lerRascunho`), `JanelaOQueMudou.jsx` e as mudanças de `FormularioProduto.jsx`.

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run teste:extracao && npx eslint src/components/produtos/FormularioProduto.jsx src/components/produtos/JanelaOQueMudou.jsx src/lib/rascunhoDoCadastro.js`
Expected: todas `ok`; eslint sem erro.

- [ ] **Step 5: Conferir no navegador** (`preview_start` com `sistema-rise`, `https://localhost:3000`; produto de teste `ZZ-TESTE-BLING`, ou um criado à mão e apagado no fim)

1. Abrir o produto, trocar "5 V" por "5V" numa linha da descrição e clicar Salvar → o popup "O que mudou na descrição" abre com o par `5 V → 5V` desmarcado e a linha de contexto. Esc → volta ao formulário, nada salvo (a lista não recarregou).
2. Salvar de novo, marcar o par, Salvar → o produto salva (volta para a lista) e `prisma.correcaoDaDescricao` tem a linha com `origem CADASTRO` e `produtoSku` do produto (conferir com `node -e` ou pela página da Tarefa 9).
3. Abrir o produto de novo e Salvar sem mexer → salva direto, sem popup.
4. Com a correção gravada, digitar "12 V" numa linha técnica e Salvar sem regra → o texto gravado tem "12V" (a TROCA do Salvar). Passar o popup por `ecc:make-interfaces-feel-better` e corrigir o que ele apontar.

- [ ] **Step 6: Commit**

```bash
git add src/components/produtos/JanelaOQueMudou.jsx src/components/produtos/FormularioProduto.jsx src/lib/rascunhoDoCadastro.js scripts/teste-extracao.js
git commit -m "Cadastro de produto: popup O que mudou na descricao, que vira Correcao no Salvar"
```

---

### Task 9: Página de gestão em Configurações, cartão e atalho na janela da descrição

**Files:**
- Create: `src/app/configuracoes/correcoes-da-descricao/page.jsx`
- Create: `src/app/configuracoes/correcoes-da-descricao/acoes.js`
- Create: `src/components/configuracoes/CorrecoesDaDescricao.jsx`
- Modify: `src/lib/configuracoes/catalogo.js` (cartão novo)
- Modify: `src/components/produtos/JanelaDescricao.jsx:985-995` (ícone na barra do título)

**Interfaces:**
- Consumes: `listarCorrecoes`, `criarCorrecao`, `editarCorrecao`, `alternarCorrecao`, `excluirCorrecao`, `lerCorrecoesAtivas` (Tarefa 3); `avisoDoTeto`, `TIPOS`, `MAXIMO_TEXTO`, `MAXIMO_EXPLICACAO` (Tarefa 2); `listarPromptsDaDescricao` e `NOME_DO_SISTEMA` de `@/lib/ia/promptsDescricao`; `exigirAcessoNaPagina`, `executarComAcesso` de `@/lib/acessos/servidor`; `PageHeader`, `CampoBusca`, `BolhaDeAjuda`, `EscolhaEntreOpcoes`, `EmptyState` de `@/components/ui`; `Janela` de `@/components/ferramentas/licencas/Janela` e `Pergunta` de `@/components/compras/Pergunta` (a exclusão); ícones `SpellCheck`, `ArrowRightLeft`, `ScrollText`, `Pencil`, `Trash2`, `Plus` do lucide.
- Produces:
  - `page.jsx`: `exigirAcessoNaPagina("tela.produtos.cadastro", "ver")`; `?q=` busca; passa `correcoes` (datas como ISO), `prompts` (só os nomes, com `NOME_DO_SISTEMA` primeiro), `podeEditar = acesso.pode("tela.produtos.cadastro", "editar")`, `aviso = avisoDoTeto(await lerCorrecoesAtivas())`. `metadata.title = "Correções da descrição | Sistema Rise"`, `dynamic = "force-dynamic"`.
  - `acoes.js` (`"use server"`, cada export começa por `executarComAcesso("tela.produtos.cadastro", "editar", ...)` para o guarda estático de `teste:acessos`): `salvarCorrecaoAcao(id: string|null, formData) => { ok, correcao?, erros?, erro? }` (campos `tipo`, `errado`, `certo`, `explicacao`, `promptNome` (`""` = todas); `id` → `editarCorrecao`, senão `criarCorrecao(dados, { quem: acesso.login ?? "pc", origem: "TELA" })`), `alternarCorrecaoAcao(id, ativa)`, `excluirCorrecaoAcao(id)`; todas terminam com `revalidatePath("/configuracoes/correcoes-da-descricao")`.
  - `CorrecoesDaDescricao.jsx` (`"use client"`), linha-guia: o dono vê primeiro a lista do que o Rise está corrigindo; a ação principal é **Nova correção**. Topo: `CampoBusca` (`?q=`) à esquerda, botão **Nova correção** (primário) à direita; abaixo, só quando `aviso`, uma linha âmbar com ele. Tabela densa: ícone do tipo (`ArrowRightLeft` TROCA / `ScrollText` REGRA, `title` com o tipo), texto (`errado` riscado → `certo`; REGRA só o `certo`; `explicacao` em `text-xs text-suave` embaixo), escopo ("Todas" ou o nome), origem ("Chat", "Cadastro", "Tela"; o `produtoSku` no `title`), usos, data `dd/mm/aa`, liga/desliga (botão com `aria-pressed`), lápis, lixeira. Sem correção: `EmptyState` "Nenhuma correção ainda." Janela nova/editar (`Janela`, `alterado` para o "Sair sem salvar?"): tipo (`EscolhaEntreOpcoes`, travado na edição), `errado` (some na REGRA), `certo`, `explicacao`, escopo (`<select>`: Todas as descrições + os prompts), erros por campo; Salvar primário. Exclusão por `Pergunta` listando `"5 V → 5V"`, botão vermelho **Excluir** por último. Sem `podeEditar`: sem botões de escrita (selo "Somente leitura" como as demais telas em `ver`).
  - Cartão em `CARTOES_DE_CONFIGURACOES`: `{ href: "/configuracoes/correcoes-da-descricao", recurso: "tela.produtos.cadastro", rotulo: "Correções da descrição", icone: SpellCheck, resumo: "O que o Rise corrige em toda descrição e o que a IA aprende com o dono." }`.
  - `JanelaDescricao.jsx`: ao lado de "Criar descrição" na barra do título, `<a href="/configuracoes/correcoes-da-descricao" target="_blank" rel="noreferrer" title="Correções da descrição">` com `SpellCheck size={14}`.

- [ ] **Step 1: Implementar** os cinco arquivos como nas Interfaces.

- [ ] **Step 2: Conferir o guarda estático e o lint**

Run: `npm run teste:acessos && npx eslint src/app/configuracoes/correcoes-da-descricao src/components/configuracoes/CorrecoesDaDescricao.jsx src/lib/configuracoes/catalogo.js src/components/produtos/JanelaDescricao.jsx`
Expected: o guarda passa (página e ações conferem o acesso); eslint sem erro.

- [ ] **Step 3: Conferir no navegador** (`https://localhost:3000/configuracoes`)

1. O cartão "Correções da descrição" aparece e abre a página com a lista (inclusive as gravadas nas tarefas anteriores que sobraram, se houver).
2. **Nova correção** → TROCA `voltagem → tensão` → aparece na lista com origem "Tela"; repetir a mesma → erro no campo `errado` com "Já existe".
3. Liga/desliga muda o estado na linha; lápis edita o `certo`; lixeira abre a pergunta com o texto da correção e exclui.
4. Busca "tens" filtra. A janela "Criar descrição" de um produto mostra o ícone, que abre a página em outra aba.
5. Passar a página e a janela por `ecc:make-interfaces-feel-better` e corrigir o que apontar; largura de notebook.

- [ ] **Step 4: Commit**

```bash
git add src/app/configuracoes/correcoes-da-descricao src/components/configuracoes/CorrecoesDaDescricao.jsx src/lib/configuracoes/catalogo.js src/components/produtos/JanelaDescricao.jsx
git commit -m "Configuracoes: pagina Correcoes da descricao, cartao e atalho na janela da descricao"
```

---

### Task 10: CLAUDE.md, testes completos e push

**Files:**
- Modify: `CLAUDE.md` (bullet "Texto da descrição" em "Padrões do projeto"; contagens de `teste:extracao` (linha ~320), `teste:proposta` (~365) e `teste:mcp` (~353); a frase da versão do roteiro (~linha 6800, diz "11"); seção nova)

- [ ] **Step 1: Escrever a seção** `### Correções da descrição (07/11/2026)` em "Conhecimento que custou caro", perto das seções da proposta de produto, com: o pedido do dono (literal: "criar um RAG no rise para descrição e eu alimentar esse RAG com os detalhes que tem que ajustar"); a tabela e os dois tipos; onde `aplicarCorrecoes` roda (os três caminhos, sempre depois das regras fixas, uma vez só, e por que as chaves de `fontesDasLinhas` passam por ela); o escopo (`promptNome`; o Salvar só vê as globais); as regras do casamento (fronteira, número curinga, caixa, "onde já está certo não troca"); o bloco na instrução com o teto de 6.000 e o aviso; as três ferramentas do MCP e a regra "o Claude só grava o que o dono ditou"; o popup do Salvar (descrição "da máquina", pares de até 60, desmarcadas, Esc volta); a página em Configurações com acesso por `tela.produtos.cadastro`; o passo zero em `normalizarDescricao`; os testes e onde estão. Atualizar o bullet "Texto da descrição" (a `normalizarDescricao` compacta as unidades das linhas técnicas) e a frase da versão do roteiro para "17". Apontar o desenho e este plano.

- [ ] **Step 2: Rodar a bateria**

Run: `npm run teste:extracao && npm run teste:proposta && npm run teste:mcp && npm run teste:acessos && npm run teste:imagens`
Expected: todas `ok`, código 0 em cada uma. Anotar as contagens finais nos três comandos do CLAUDE.md.

- [ ] **Step 3: Lint do que mudou**

Run: `npx eslint src/lib/ia src/lib/mcp src/lib/proposta src/app/produtos/acoes.js src/app/configuracoes src/components/produtos src/components/configuracoes src/lib/rascunhoDoCadastro.js src/lib/configuracoes`
Expected: sem erro.

- [ ] **Step 4: Commit e push**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-11-07-correcoes-da-descricao-design.md docs/superpowers/plans/2026-11-07-correcoes-da-descricao.md
git commit -m "CLAUDE.md: Correcoes da descricao (desenho e plano)"
git push origin main
```

Nada sobe para a VPS sem o "sobe" do dono. Entrega ao dono com "O que foi feito" (commits, sem deploy) e "Testes que você precisa fazer" (abrir um produto, corrigir "5 V" → "5V", marcar no popup, gerar uma descrição nova e ver "5V"; dizer no chat "guarde: escreva tensão, nunca voltagem" e ver na página; a proposta de um produto pelo Claude com a correção na instrução).
