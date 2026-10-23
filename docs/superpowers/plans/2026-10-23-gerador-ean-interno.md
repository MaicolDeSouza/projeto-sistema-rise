# Gerador de GTIN/EAN interno — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botão "Gerar EAN interno" no cadastro de Produto que preenche o campo GTIN/EAN com um EAN-13 da faixa interna
(prefixo 2) derivado do SKU, e o Salvar conferindo o dígito verificador dos códigos dessa faixa.

**Architecture:** Regras puras num módulo novo (`src/lib/eanInterno.js`), que reaproveita o dígito verificador já escrito em
`src/lib/eanNoMercadoLivre.js`. A tela (`FormularioProduto.jsx`) só chama a regra e escreve no `<input>` não controlado, como
a varinha do SKU faz. O Salvar (`produtos/acoes.js`) chama a mesma regra antes da conferência de EAN repetido. Sem migration.

**Tech Stack:** JavaScript (sem TypeScript), Next 16, React 19, testes em `scripts/teste-extracao.js` (SEM rede e SEM banco).

**Spec:** `docs/superpowers/specs/2026-10-23-gerador-ean-interno-design.md`

## Global Constraints

- Código e comentários em português **sem acento**; texto de tela **com acento** (CLAUDE.md, "Texto da tela COM acento").
- Comentários dizem o **porquê**.
- Formato: `2` + SKU preenchido com zeros à esquerda até 11 dígitos + dígito verificador (módulo 10 do EAN). 100101 → `2000001001011`; 250012 → `2000002500124`.
- Só SKU composto só de dígitos, com 1 a 11 dígitos. Qualquer outro: recusa com motivo, nada é escrito.
- O botão aparece só com o campo GTIN/EAN vazio e o SKU preenchido; nunca sobrescreve EAN já preenchido.
- Códigos de fabricante (13 dígitos que não começam com 2, 8/12/14 dígitos) continuam aceitos sem conferir dígito.
- Nada muda nos canais (ML, Bling, LI), na proposta automática nem na sincronização.
- Cada edição de arquivo passa pelo GateGuard: fazer um `grep` real no caminho antes da primeira edição e citar o pedido do dono.

## Review Focus

1. SKU com zeros à esquerda (`000123`): dá o MESMO EAN que `123`; o teste pina a igualdade, e o Salvar já recusa EAN repetido. → Task 1.
2. SKU com espaço nas pontas (`" 100101 "`): `trim` e aceita. → Task 1.
3. EAN de 13 dígitos começando com 2 vindo de fornecedor, com DV certo (`2000000000008`): aceito; com DV errado: recusado. → Task 1 (regra) e Task 2 (Salvar).
4. Campo preenchido depois pelo ícone da lista (referências) ou pela proposta: o botão tem de SUMIR sem recarregar (o campo não é controlado). → Task 3 (estado `eanPreenchido` atualizado por `onInput`, `onBlur` e `aoAlterar`).
5. Clicar em Gerar com SKU `ZZ-TESTE-KIT` ou vazio: mensagem em vermelho embaixo do campo, nada escrito, formulário não marcado como alterado. → Task 3 (roteiro de tela).

---

### Task 1: Regras puras do EAN interno

**Files:**
- Modify: `src/lib/eanNoMercadoLivre.js` (função `digitoVerificadorOk`, linhas ~18-28)
- Create: `src/lib/eanInterno.js`
- Test: `scripts/teste-extracao.js` (novo bloco antes do `console.log(falhas === 0 ...)` final)

**Interfaces:**
- Consumes: `digitosDoEan(valor)` de `eanNoMercadoLivre.js`.
- Produces (em `eanNoMercadoLivre.js`): `calcularDigitoVerificador(corpo: string): string` (um dígito; `corpo` só dígitos; pesos 3 e 1 a partir da direita). `digitoVerificadorOk` passa a usá-la.
- Produces (em `eanInterno.js`):
  - `PREFIXO_INTERNO = "2"`, `DIGITOS_DO_SKU = 11`.
  - `gerarEanDoSku(sku: unknown): { ok: true, ean: string } | { ok: false, erro: string }`. Erros (texto de tela, com acento): vazio → `"Preencha o código (SKU) antes de gerar o EAN."`; com não-dígito → `"O EAN interno só é gerado para código só com dígitos (este tem letras ou símbolos)."`; mais de 11 dígitos → `"O código tem mais de 11 dígitos e não cabe no EAN-13."`.
  - `ehEanInternoDoRise(ean: unknown): boolean` (13 dígitos, pelo `digitosDoEan`, começando com `2`).
  - `problemaDoEanInterno(ean: unknown): string | null`: `null` quando não é interno ou o DV confere; senão `"O dígito verificador do GTIN/EAN interno (prefixo 2) não confere: gere de novo pelo botão ou corrija o código."`.

- [x] **Step 1: Escrever o teste que falha**, no fim de `scripts/teste-extracao.js`, antes do `console.log` final:

```js
{
  const { calcularDigitoVerificador } = await import("../src/lib/eanNoMercadoLivre.js");
  const { gerarEanDoSku, ehEanInternoDoRise, problemaDoEanInterno } = await import("../src/lib/eanInterno.js");
  conferir("DV: calculo isolado confere com os EANs reais", [calcularDigitoVerificador("764015211013"), calcularDigitoVerificador("9638507"), calcularDigitoVerificador("200000100101")], ["9", "4", "1"]);
  conferir("EAN interno: derivado do SKU, com zeros a esquerda e DV", [gerarEanDoSku("100101"), gerarEanDoSku("250012"), gerarEanDoSku(" 100101 ")], [{ ok: true, ean: "2000001001011" }, { ok: true, ean: "2000002500124" }, { ok: true, ean: "2000001001011" }]);
  conferir("EAN interno: SKU com zeros a esquerda da o mesmo numero que sem eles (o Salvar recusa o repetido)", gerarEanDoSku("000123").ean, gerarEanDoSku("123").ean);
  conferir("EAN interno: 11 digitos cabem, 12 nao", [gerarEanDoSku("12345678901").ok, gerarEanDoSku("123456789012").ok], [true, false]);
  conferir("EAN interno: recusas com motivo", [gerarEanDoSku("").erro, gerarEanDoSku("   ").erro, gerarEanDoSku("ZZ-TESTE-KIT").erro, gerarEanDoSku("920302_1.000").erro, gerarEanDoSku("123456789012").erro], [
    "Preencha o código (SKU) antes de gerar o EAN.",
    "Preencha o código (SKU) antes de gerar o EAN.",
    "O EAN interno só é gerado para código só com dígitos (este tem letras ou símbolos).",
    "O EAN interno só é gerado para código só com dígitos (este tem letras ou símbolos).",
    "O código tem mais de 11 dígitos e não cabe no EAN-13.",
  ]);
  conferir("EAN interno: reconhece a faixa 2 de 13 digitos", [ehEanInternoDoRise("2000001001011"), ehEanInternoDoRise("7640152110139"), ehEanInternoDoRise("20000010"), ehEanInternoDoRise(""), ehEanInternoDoRise(null)], [true, false, false, false, false]);
  conferir("EAN interno: DV conferido so na faixa 2", [problemaDoEanInterno("2000001001011"), problemaDoEanInterno("2000000000008"), problemaDoEanInterno("7640152110138"), problemaDoEanInterno(""), problemaDoEanInterno("2000001001010")], [null, null, null, null, "O dígito verificador do GTIN/EAN interno (prefixo 2) não confere: gere de novo pelo botão ou corrija o código."]);
}
```

- [x] **Step 2: Rodar e ver falhar**

Run: `npm run teste:extracao > "$TEMP/t.txt" 2>&1; tail -5 "$TEMP/t.txt"` (nunca com `| head`: "Não canalize teste com `| head`", CLAUDE.md).
Expected: falha com `Cannot find module .../eanInterno.js` ou `calcularDigitoVerificador is not a function`.

- [x] **Step 3: Implementar `calcularDigitoVerificador(corpo)` em `src/lib/eanNoMercadoLivre.js`** e fazer `digitoVerificadorOk` usá-la (`return calcularDigitoVerificador(corpo) === digitos.at(-1)`). Exportar.

- [x] **Step 4: Criar `src/lib/eanInterno.js`** com as três funções e as duas constantes do Interfaces. Comentário de topo: por que prefixo 2 (faixa de uso interno da GS1; o dono decidiu não se associar à GS1 em 23/10/2026; ML e NF-e ficam para depois) e por que derivar do SKU (sem contador, único porque o SKU é único e nunca reaproveitado). Só importa de `./eanNoMercadoLivre.js`.

- [x] **Step 5: Rodar e ver passar**

Run: `npm run teste:extracao > "$TEMP/t.txt" 2>&1; tail -3 "$TEMP/t.txt"`
Expected: `TODOS OS TESTES PASSARAM` (7 asserções a mais; os 5 testes antigos de `digitoVerificadorOk` seguem passando).

- [x] **Step 6: Commit**

```bash
git add src/lib/eanInterno.js src/lib/eanNoMercadoLivre.js scripts/teste-extracao.js
git commit -m "feat(produtos): regras do GTIN/EAN interno derivado do SKU (prefixo 2)"
```

---

### Task 2: Salvar confere o dígito verificador da faixa interna

**Files:**
- Modify: `src/app/produtos/acoes.js:684-698` (o bloco "O mesmo GTIN/EAN em dois produtos e recusado", dentro de `salvarProduto`)

**Interfaces:**
- Consumes: `problemaDoEanInterno(ean)` da Task 1.
- Produces: `salvarProduto` devolve `{ ok: false, erro, erros: { ean: erro } }` quando o EAN é da faixa 2 com DV errado, ANTES da consulta de EAN repetido.

- [x] **Step 1: Importar `problemaDoEanInterno`** de `@/lib/eanInterno` no topo de `acoes.js` (estilo dos imports `@/lib/...` existentes).

- [x] **Step 2: Inserir a conferência** logo antes de `if (dados.ean) { const outro = ...`:

```js
// EAN da faixa interna (prefixo 2) com digito verificador errado e recusado: esse codigo e nosso, gerado pelo botao, e
// errado so pode ser digitacao. Os codigos de fabricante nao sao conferidos aqui: ha codigos reais gravados que nao vale
// arriscar barrar (pedido do dono em 23/10/2026).
const problemaInterno = problemaDoEanInterno(dados.ean);
if (problemaInterno) return { ok: false, erro: problemaInterno, erros: { ean: problemaInterno } };
```

- [x] **Step 3: Lint**

Run: `npm run lint > "$TEMP/lint.txt" 2>&1; tail -5 "$TEMP/lint.txt"`
Expected: sem erro novo em `acoes.js`.

- [x] **Step 4: Commit**

```bash
git add src/app/produtos/acoes.js
git commit -m "feat(produtos): Salvar recusa EAN interno com digito verificador errado"
```

---

### Task 3: Botão "Gerar EAN interno" no cadastro

**Files:**
- Modify: `src/components/produtos/FormularioProduto.jsx` (o bloco `<div onBlur={conferirEan}>` do campo `ean`, linhas ~3656-3693; os estados perto de `conferirEan`, linha ~2870)

**Interfaces:**
- Consumes: `gerarEanDoSku(sku)` da Task 1; `valorDoCampo(nome)`, `marcarAlterado()`, `conferirEan()`, `usos.marcar(nome)`, `usos.tem(nome)`, `acessos.editar`, `COR_DE_USO`, ícone `WandSparkles` de `lucide-react` (já importado: ver `CampoSku`).
- Produces: componente interno `BotaoGerarEan({ aoGerar, usado })` no próprio arquivo, sem export.

Minha chamada (o spec deixou a posição ao construtor): o `CampoDeReferencias` já ocupa o ícone de dentro do campo com a lista das referências, então o botão fica na linha logo abaixo, à direita de "Consultar em: ...", como botão pequeno com a varinha (`WandSparkles`, 14 px) e o rótulo "Gerar EAN interno". `title`: "Gera um EAN-13 interno (prefixo 2) a partir do código do produto". Cor da varinha do SKU: `COR_DE_USO.funcao`, e `COR_DE_USO.usado` depois de usar (`usos.tem("ean")`).

- [x] **Step 1: Estado do campo.** Perto de `conferirEan`, criar `const [eanPreenchido, setEanPreenchido] = useState(Boolean(eanInicial))` e `const [falhaEan, setFalhaEan] = useState(null)` (`eanInicial` existe na linha ~2885; mover a declaração para antes se preciso).

- [x] **Step 2: Manter o estado.** No `<div onBlur={conferirEan}>` acrescentar `onInput={() => { setEanPreenchido(Boolean(valorDoCampo("ean").trim())); setFalhaEan(null); }}` e no `onBlur` chamar `conferirEan` e a mesma atualização. No `aoAlterar` do `CampoDeReferencias` do ean, acrescentar `setEanPreenchido(true)` (o `escolher` escreve no input sem disparar `input`).

- [x] **Step 3: Ação de gerar.** Função `gerarEan()` no formulário:

```js
function gerarEan() {
  const resultado = gerarEanDoSku(valorDoCampo("sku"));
  if (!resultado.ok) { setFalhaEan(resultado.erro); return; }
  const campo = formulario.current?.elements.namedItem("ean");
  if (!campo) return;
  campo.value = resultado.ean;
  setFalhaEan(null);
  setEanPreenchido(true);
  marcarAlterado();
  usos.marcar("ean");
  conferirEan();
}
```

`conferirEan` no fim é de propósito: consulta o catálogo do ML, que não conhece a faixa 2 e não avisa; se um dia o código bater em outro produto, o aviso âmbar aparece como para qualquer EAN.

- [x] **Step 4: Desenhar.** Trocar `<LinksDeConsulta campo="ean" .../>` por um `div` `flex items-start justify-between gap-2` com o `LinksDeConsulta` à esquerda e o `BotaoGerarEan` à direita, visível só com `acessos.editar && !eanPreenchido`. Abaixo, quando `falhaEan`, `<p role="alert" className="mt-1 text-[12px] text-red-700">{falhaEan}</p>`.

- [x] **Step 5: Lint**

Run: `npm run lint > "$TEMP/lint.txt" 2>&1; tail -5 "$TEMP/lint.txt"`
Expected: sem erro. (O ESLint não tem `no-undef`: conferir na tela, Step 6.)

- [x] **Step 6: Conferir na tela** (`npm run dev`, `https://localhost:3000`; se outra sessão já tem o servidor nesta pasta, usar o dela; tudo em produto de teste, nunca gravar EAN no 100101):
  1. `/produtos/novo`, sem código: o botão aparece; clicar mostra "Preencha o código (SKU) antes de gerar o EAN." em vermelho e nada é escrito.
  2. Varinha do SKU (vem um 25xxxx), "Gerar EAN interno": o campo recebe 13 dígitos `2` + zeros + SKU + DV, o botão some, o formulário marca alterado.
  3. Apagar o EAN à mão: o botão volta.
  4. SKU `ZZ-TESTE`, EAN vazio, clicar: a mensagem de letras aparece.
  5. Produto existente com EAN (100101): o botão NÃO aparece. Produto sem EAN: aparece.
  6. ZZ-TESTE-BLING sem EAN: gerar, Salvar, reabrir: o EAN está lá, sem aviso âmbar do ML. Depois limpar o EAN e salvar de novo.
  7. ZZ-TESTE-BLING com `2000001001010` (DV errado) à mão, Salvar: recusa com a mensagem no campo e ao lado do Salvar.

- [x] **Step 7: Commit**

```bash
git add src/components/produtos/FormularioProduto.jsx
git commit -m "feat(produtos): botao Gerar EAN interno no cadastro"
```

---

### Task 4: Documentar e fechar

**Files:**
- Modify: `CLAUDE.md` (seção "Produtos: referências de mercado e texto por IA", logo depois do item "Conferência do EAN no Mercado Livre"; e a linha de `npm run teste:extracao` em "Rodar", com a contagem nova)
- Modify: `docs/superpowers/plans/2026-10-23-gerador-ean-interno.md` (marcar os checkboxes)

- [x] **Step 1: CLAUDE.md.** Item "**Gerador de GTIN/EAN interno** (pedido do dono em 23/10/2026, sem GS1: ...)" com o formato, o exemplo 100101 → 2000001001011, só SKU numérico até 11 dígitos, botão só com o campo vazio, conferência do DV no Salvar só na faixa 2, onde mora (`src/lib/eanInterno.js`), e o aviso de que o ML recusa código interno como GTIN e a NF-e também ("o dono resolve depois"). Atualizar a contagem do `teste:extracao`.

- [x] **Step 2: Testes do ritual** (um por vez, saída em arquivo): `teste:extracao`, `teste:cadastros`, `teste:coleta`. (`teste:worker` leva ~6 min e não toca neste código: pular e dizer.)
Expected: `TODOS OS TESTES PASSARAM` nos três.

- [x] **Step 3: Commit só dos meus arquivos** (`git diff CLAUDE.md` antes; se houver trecho de outra sessão, `git add -p` só do meu e commit SEM caminhos; memória "Commit só dos meus trechos") e push:

```bash
git add docs/superpowers/specs/2026-10-23-gerador-ean-interno-design.md docs/superpowers/plans/2026-10-23-gerador-ean-interno.md
git commit -m "docs(produtos): spec, plano e CLAUDE.md do gerador de EAN interno"
git push origin main
```

- [x] **Step 4: Roteiro de testes para o dono** no chat, passo a passo com o resultado esperado. Sem deploy: o "sobe" é dele.
