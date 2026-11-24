# Condições comerciais no cadastro do cliente: plano de implementação

> **Para quem executa:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, sem subagentes, preferência do dono desde
> 05/10/2026). Passos em checkbox (`- [ ]`).

**Objetivo:** as condições comerciais moram no cadastro do cliente e preenchem a proposta sozinhas ao ligar o cliente, com
os campos editáveis; e-mails da NF ao Bling, e-mails do rastreio, contribuinte de ICMS e portal de compras com senha cifrada;
os padrões de proposta saem.

**Arquitetura:** colunas novas no `Cliente` e três na `PropostaParaCliente`. Uma regra pura (`camposAoLigarCliente`, em
`src/lib/propostas/regras.js`) decide o que muda ao ligar um cliente e é usada pela tela e pelo `salvarProposta`. A senha
usa o `cifrar`/`decifrar` de `src/lib/crypto.js`. Os padrões só são apagados na última tarefa, para cada tarefa rodar
sozinha.

**Tecnologia:** Next.js (versão nova: ler `node_modules/next/dist/docs/` antes de mexer em ação ou página), React 19,
Prisma v7 (cliente em `src/generated/`), Postgres 17, testes em scripts Node (`conferir(nome, obtido, esperado)`).

**Desenho:** `docs/superpowers/specs/2026-11-24-condicoes-comerciais-do-cliente-design.md` (ler junto).

## Restrições globais

- JavaScript, sem TypeScript; identificadores e comentários sem acento; comentário explica o porquê.
- Texto de tela com acento; ajuda só pela `BolhaDeAjuda`; nada de texto explicativo fixo (Padrão visual, regra 2).
- Pop-up com `role="dialog"`/`"alertdialog"` e o fundo com `propsDoFundo` (`src/lib/fundoDaJanela.js`); o destrutivo
  (Apagar senha) sempre com pop-up.
- Depois de mudar `prisma/schema.prisma`: `npx prisma generate` e reiniciar o servidor de desenvolvimento (o cliente Prisma
  antigo fica na memória e dá 500).
- **Senha do portal nunca em texto aberto** fora da resposta do "Mostrar": nem no HTML do cadastro, nem em log, Histórico,
  MCP, PDF ou link público.
- **Bling:** nenhum PUT real em contato de cliente antes do 1º teste num contato ZZ com o OK do dono. O `.env` do PC fica
  com as travas fechadas.
- Os testes só escrevem dados `ZZ Proposta *`, `ZZ Cliente *`, `ZZ-*` e apagam no começo e no fim.
- O `conferir` compara por `JSON.stringify`: **a ordem das chaves do esperado é a ordem do objeto devolvido**.
- Commit só dos arquivos da tarefa: `git add -- <caminhos>` e `git commit -m "..." -- <caminhos>` (há alterações de
  outras sessões na árvore); mensagem termina com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Branch `main`
  (prática do projeto).

## Foco da revisão

Os cinco casos que o desenho implica e que mais podem morder quem usa; cada um tem teste na tarefa dona do código.

1. Trocar de um cliente com condições (SENAI SC) para um sem condições: a proposta volta à regra geral, sem o "28 dias na
   conta da FIESC" (Tarefas 2 e 3).
2. O PUT do contato no Bling substitui o contato inteiro: o corpo enviado tem de levar endereço, fantasia e telefone de
   volta (Tarefa 5).
3. Quem não vê dado pessoal salva o cliente: portal, e-mails do rastreio e observação da NF continuam gravados (Tarefa 4).
4. Senha com acento e espaço volta igual; senha cifrada com outra chave dá aviso, nunca erro 500 (Tarefa 4).
5. Script que manda um `condicoesDoClienteId` velho (de outro cliente): as condições do cliente atual entram (Tarefas 2 e 3).

---

### Tarefa 1: Banco (colunas novas e cópia dos padrões)

**Arquivos:**
- Modificar: `prisma/schema.prisma` (`model Cliente` em ~1367, `model PropostaParaCliente` em ~3219, enum novo)
- Criar: `prisma/migrations/20261124_condicoes_do_cliente/migration.sql`

**Interfaces:**
- Produz: enum `IndicadorIe { CONTRIBUINTE ISENTO NAO_CONTRIBUINTE }`; no `Cliente`: `propostaValidadeDias Int?`,
  `propostaFormaPagamento String?`, `propostaPagamentoTexto String?`, `propostaFretePorConta FreteDaProposta?`,
  `propostaFreteDiluido Boolean @default(false)`, `propostaGarantia String?`, `propostaAc String?`,
  `propostaMarcaModelo Boolean @default(false)`, `propostaAssinar Boolean @default(false)`,
  `propostaFaturamentoMinimo Boolean @default(false)`, `propostaObservacoes String?`, `propostaExigencias String?`,
  `indicadorIe IndicadorIe?`, `notaFiscalObservacao String?`, `emailsRastreio String[] @default([])`, `portalUrl String?`,
  `portalUsuario String?`, `portalSenhaCifrada String?`, `portalObservacao String?`; na `PropostaParaCliente`:
  `mostrarMarcaModelo Boolean @default(false)`, `mostrarFaturamentoMinimo Boolean @default(false)`,
  `condicoesDoClienteId String?` (texto simples, sem relação). Cada coluna com `///` dizendo o porquê.

- [ ] **Passo 1: Escrever as colunas e o enum no `schema.prisma`**, sem tirar nada (o `padraoId`, o `padraoPropostaId` e o
  `PadraoDeProposta` saem só na Tarefa 9).

- [ ] **Passo 2: Escrever o `migration.sql` à mão**, nesta ordem:
  1. `CREATE TYPE "IndicadorIe"` e os `ALTER TABLE ... ADD COLUMN` das duas tabelas.
  2. Cliente ← padrão, só para os padrões que não são o Cliente comum (`id <> 'padrao-cliente-comum'` e
     `lower(trim(nome)) <> 'cliente comum'`), pelo `Cliente.padraoPropostaId`: `validadeDias → propostaValidadeDias`,
     `formaPagamento → propostaFormaPagamento`, `pagamentoTexto → propostaPagamentoTexto`,
     `fretePorConta → propostaFretePorConta`, `garantia → propostaGarantia`, `observacoesCliente → propostaObservacoes`,
     `exigencias → propostaExigencias`, `exigeMarcaModelo → propostaMarcaModelo`, `assinarDigitalmente → propostaAssinar`,
     `propostaFaturamentoMinimo = true`.
  3. Proposta: `mostrarMarcaModelo = COALESCE(padrao.exigeMarcaModelo, false)` e
     `mostrarFaturamentoMinimo = ("padraoId" IS NOT NULL)` (LEFT JOIN no padrão); `condicoesDoClienteId = "clienteId"` só
     onde o cliente recebeu condições no item 2.
  4. `indicadorIe`: `ieIsento` → `'ISENTO'`; senão IE preenchida (`trim <> ''`) → `'CONTRIBUINTE'`; senão nulo. Só
     `tipoPessoa = 'JURIDICA'`.

- [ ] **Passo 3: Aplicar e gerar**

Run: `npx prisma migrate deploy` e depois `npx prisma generate`
Expected: "All migrations have been successfully applied." e o cliente gerado sem erro.

- [ ] **Passo 4: Conferir os dados copiados no banco do PC** (só leitura), com um script no scratchpad no molde dos scripts
  da VPS (`register(resolver-alias.js)` + `imp()`): imprimir os clientes com `propostaValidadeDias` não nulo (nome e as
  colunas `proposta*`) e as contagens `count(padraoId não nulo)` = `count(mostrarFaturamentoMinimo)`.
Expected: o SENAI São Bernardo (se a cópia do PC o tiver) com 30 dias, marca/modelo e faturamento mínimo; as duas
contagens iguais.

- [ ] **Passo 5: Rodar os testes de hoje** (nada pode quebrar com colunas que têm padrão)

Run: `npm run teste:propostas` e `npm run teste:cadastros`
Expected: as mesmas asserções de antes, 0 falhas.

- [ ] **Passo 6: Commit** `feat(clientes): colunas das condicoes comerciais e copia dos padroes` (schema + migration).

---

### Tarefa 2: Regras puras das condições

**Arquivos:**
- Modificar: `src/lib/propostas/regras.js` (perto de `camposDoPadrao`, ~396)
- Teste: `scripts/teste-propostas.js` (seção "Regras das propostas", antes da parte de banco)

**Interfaces:**
- Consome: `somarDias`, `hojeEmSaoPaulo`, `garantiaCurta` (já em `regras.js`).
- Produz:
  - `CONDICOES_GERAIS = { validadeDias: 15, fretePorConta: "A_COMBINAR", garantia: "90 dias" }`
  - `temCondicoes(cliente) -> boolean`: verdadeiro com qualquer `proposta*` de texto/número preenchida, qualquer
    `proposta*` booleana `true` ou `notaFiscalObservacao` preenchida. `transportadoraId` e `condicaoPagamentoId` não contam.
  - `condicoesDoCliente(cliente | null, { hoje }) -> objeto` com as chaves, **nesta ordem**: `validadeAte`,
    `condicaoPagamentoId` (só se o cliente tem), `formaPagamento`, `pagamentoTexto`, `fretePorConta`, `freteDiluido`
    (só `true` com CIF), `transportadoraId` (só se o cliente tem), `garantia`, `contatoId` (sempre `null`), `contatoNome`
    (o `propostaAc`), `observacoesCliente`, `observacoesNf` (o `notaFiscalObservacao`), `assinarDigitalmente`,
    `mostrarMarcaModelo`, `mostrarFaturamentoMinimo`, `condicoesDoClienteId` (`cliente?.id ?? null`). Texto vazio = `null`.
    Vazio no cliente = `CONDICOES_GERAIS`.
  - `camposAoLigarCliente(cliente, formulario, { hoje, preencherVazios = false }) -> objeto` (o remendo a juntar):
    1. `temCondicoes(cliente)` e `formulario.condicoesDoClienteId !== cliente.id` → `condicoesDoCliente(cliente)`;
    2. `temCondicoes(cliente)` e igual → `{}`;
    3. sem condições e `formulario.condicoesDoClienteId` preenchido → `condicoesDoCliente(null)` (regra geral, id nulo);
    4. sem condições, sem id e `preencherVazios` → `transportadoraId`/`condicaoPagamentoId` do cliente **só** onde o
       formulário está vazio (o comportamento de hoje do `ligarCliente`); sem `preencherVazios` → `{}`.
  - O `cliente` dessas funções tem as colunas `proposta*`, `notaFiscalObservacao`, `id`, `transportadoraId` e
    `condicaoPagamentoId` (a 1ª condição preferida, já achatada por quem lê; ver Tarefa 3).
  - `pendenciasDoPdf({ clienteNome, itens, mostrarMarcaModelo })`: o parâmetro `exigeMarcaModelo` muda de nome, e a frase
    passa a ser `"N item(ns) sem marca ou modelo (Marca/Modelo no PDF está marcado)."`.

- [ ] **Passo 1: Escrever os testes que falham**

```js
console.log("\nCondicoes do cliente (24/11/2026)");
const SENAI_SC = {
  id: "c1", propostaValidadeDias: 30, propostaFormaPagamento: "Transferência", propostaPagamentoTexto: "28 dias DDL",
  propostaFretePorConta: "CIF", propostaFreteDiluido: true, propostaGarantia: "90 dias", propostaAc: "Adler Truber",
  propostaMarcaModelo: false, propostaAssinar: false, propostaFaturamentoMinimo: true, propostaObservacoes: "Frete CIF",
  propostaExigencias: "1. x", notaFiscalObservacao: null, transportadoraId: "t1", condicaoPagamentoId: "cond_28_dias",
};
const DO_SENAI_SC = {
  validadeAte: "2026-12-24", condicaoPagamentoId: "cond_28_dias", formaPagamento: "Transferência", pagamentoTexto: "28 dias DDL",
  fretePorConta: "CIF", freteDiluido: true, transportadoraId: "t1", garantia: "90 dias", contatoId: null, contatoNome: "Adler Truber",
  observacoesCliente: "Frete CIF", observacoesNf: null, assinarDigitalmente: false, mostrarMarcaModelo: false,
  mostrarFaturamentoMinimo: true, condicoesDoClienteId: "c1",
};
const GERAIS = {
  validadeAte: "2026-12-09", formaPagamento: null, pagamentoTexto: null, fretePorConta: "A_COMBINAR", freteDiluido: false,
  garantia: "90 dias", contatoId: null, contatoNome: null, observacoesCliente: null, observacoesNf: null,
  assinarDigitalmente: false, mostrarMarcaModelo: false, mostrarFaturamentoMinimo: false, condicoesDoClienteId: null,
};
const hoje = { hoje: "2026-11-24" };
conferir("condicoes: as do SENAI SC", regras.condicoesDoCliente(SENAI_SC, hoje), DO_SENAI_SC);
conferir("condicoes: sem cliente = regra geral", regras.condicoesDoCliente(null, hoje), GERAIS);
conferir("condicoes: diluir so no CIF", regras.condicoesDoCliente({ ...SENAI_SC, propostaFretePorConta: "FOB" }, hoje).freteDiluido, false);
conferir("tem condicoes: transportadora e condicao nao contam", regras.temCondicoes({ id: "x", transportadoraId: "t1", condicaoPagamentoId: "c" }), false);
conferir("tem condicoes: so a caixa de assinar ou so a obs. da NF", [regras.temCondicoes({ propostaAssinar: true }), regras.temCondicoes({ notaFiscalObservacao: "x" })], [true, true]);
conferir("ligar: 1a vez aplica", regras.camposAoLigarCliente(SENAI_SC, { condicoesDoClienteId: null }, hoje), DO_SENAI_SC);
conferir("ligar: o mesmo cliente nao reaplica", regras.camposAoLigarCliente(SENAI_SC, { condicoesDoClienteId: "c1", formaPagamento: "PIX" }, hoje), {});
conferir("ligar: id velho de outro cliente aplica", regras.camposAoLigarCliente(SENAI_SC, { condicoesDoClienteId: "outro" }, hoje), DO_SENAI_SC);
conferir("ligar: de SENAI SC para cliente sem condicoes volta a regra geral", regras.camposAoLigarCliente({ id: "c2" }, { condicoesDoClienteId: "c1" }, hoje), GERAIS);
conferir("ligar: sem condicoes e sem id, a tela preenche o vazio", regras.camposAoLigarCliente({ id: "c2", transportadoraId: "t9", condicaoPagamentoId: "c9" }, { condicoesDoClienteId: null, transportadoraId: "", condicaoPagamentoId: "c1" }, { ...hoje, preencherVazios: true }), { transportadoraId: "t9" });
conferir("ligar: sem condicoes, o servidor nao preenche nada", regras.camposAoLigarCliente({ id: "c2", transportadoraId: "t9" }, { condicoesDoClienteId: null, transportadoraId: "" }, hoje), {});
```

E trocar a asserção antiga da pendência (`pendenciasDoPdf` com `exigeMarcaModelo`, ~linha 771) por
`mostrarMarcaModelo: true` e a frase nova.

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npm run teste:propostas`
Expected: FALHA em "condicoes: as do SENAI SC" (`condicoesDoCliente is not a function`).

- [ ] **Passo 3: Implementar `CONDICOES_GERAIS`, `temCondicoes`, `condicoesDoCliente` e `camposAoLigarCliente` em
  `regras.js`**, e o novo parâmetro de `pendenciasDoPdf`. O `garantia` passa pela `garantiaCurta` de hoje. `camposDoPadrao`
  fica até a Tarefa 9.

- [ ] **Passo 4: Rodar e ver passar**

Run: `npm run teste:propostas`
Expected: 0 falhas.

- [ ] **Passo 5: Commit** `feat(propostas): regra pura das condicoes do cliente`.

---

### Tarefa 3: A proposta recebe as condições no servidor, e o PDF lê as caixas da proposta

**Arquivos:**
- Modificar: `src/lib/propostas/esquema.js` (`conferirProposta`, ~79-131)
- Modificar: `src/lib/propostas/banco.js` (include do `cliente` ~81, `propostaParaTela` ~140, `salvarProposta` ~284-420)
- Modificar: `src/lib/propostas/conteudo.js` (~209 e ~230)
- Teste: `scripts/teste-propostas.js`

**Interfaces:**
- Consome: `camposAoLigarCliente` (Tarefa 2).
- Produz (em `banco.js`, exportados para a Tarefa 7):
  - `SELECAO_DE_CONDICOES`: o `select` do `Cliente` com `id`, as colunas `proposta*`, `notaFiscalObservacao`,
    `transportadoraId` e `condicoesPreferidas: { orderBy: { nome: "asc" }, take: 1, select: { id: true } }`. **Nunca** as
    colunas `portal*`.
  - `clienteParaCondicoes(linha) -> objeto`: a linha lida com aquele `select`, com `condicaoPagamentoId` =
    `condicoesPreferidas[0]?.id ?? null` e sem `condicoesPreferidas`.
  - `conferirProposta` passa a devolver `mostrarMarcaModelo` e `mostrarFaturamentoMinimo` (booleanos, lidos como o
    `assinarDigitalmente`) e `condicoesDoClienteId`: `undefined` quando a entrada **não tem a chave** (script), senão
    `texto(..., 40)`.
  - `lerProposta`/`propostaParaTela` devolvem `mostrarMarcaModelo`, `mostrarFaturamentoMinimo` e `condicoesDoClienteId`; o
    `cliente` lido ganha `propostaExigencias`.

- [ ] **Passo 1: Escrever os testes que falham** (seção nova "Condições do cliente na proposta", depois do bloco de cliente):
  criar o cliente `ZZ Proposta Condicoes` (CNPJ `cnpjDeTeste(999990000501)`, conferido como os outros no topo) com as
  colunas do `SENAI_SC` da Tarefa 2 (sem id, transportadora nem condição) e um contato "Adler Truber"; e então:

```js
// p = criarProposta(...) com clienteId nulo
// 1) liga pelo id: as condicoes entram e o A/C vira o contato
conferir("proposta: recebe as condicoes ao ligar", [lida.formaPagamento, lida.pagamentoTexto, lida.fretePorConta, lida.contatoNome, Boolean(lida.contatoId), lida.mostrarFaturamentoMinimo, lida.condicoesDoClienteId], ["Transferência", "28 dias DDL", "CIF", "Adler Truber", true, true, comCondicoes.id]);
// 2) a tela muda a forma e manda o condicoesDoClienteId: fica
conferir("proposta: a edicao depois do preenchimento fica", lida2.formaPagamento, "PIX");
// 3) script sem a chave condicoesDoClienteId e forma "Boleto": fica (o gravado ja e deste cliente)
conferir("proposta: script sem a chave nao reaplica", lida3.formaPagamento, "Boleto");
// 4) script com condicoesDoClienteId "outro": as do cliente voltam
conferir("proposta: id velho reaplica", lida4.formaPagamento, "Transferência");
// 5) proposta nova provisoria com o CNPJ do cliente digitado: liga e aplica
conferir("proposta: CNPJ digitado acha e aplica", [lida5.clienteId, lida5.formaPagamento], [comCondicoes.id, "Transferência"]);
// 6) proposta nova com CNPJ que nao existe (Bling falso sem ele) e forma "PIX": cliente nasce sem condicoes, nada muda
conferir("proposta: cliente recem-criado nao apaga o digitado", [lida6.formaPagamento, lida6.condicoesDoClienteId], ["PIX", null]);
// 7) a proposta do passo 4 troca para o cliente noRise (sem condicoes): regra geral
conferir("proposta: trocar para cliente sem condicoes volta a regra geral", [lida7.formaPagamento, lida7.pagamentoTexto, lida7.fretePorConta, lida7.condicoesDoClienteId], [null, null, "A_COMBINAR", null]);
conferir("proposta: nada do portal na leitura", JSON.stringify(await banco.lerProposta(p.numero)).includes("portal"), false);
```

  E trocar as asserções do PDF que usam `padrao` (~790-811) para as caixas da proposta:
  `conteudoDaProposta({ ...relida, mostrarMarcaModelo: true }, ...)` mostra a coluna `marca`;
  `{ mostrarMarcaModelo: false }` não mostra; `{ mostrarFaturamentoMinimo: true }` com `faturamentoMinimo: 50` tem o bloco
  "Faturamento mínimo" com "R$50,00"; `false` não tem.

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npm run teste:propostas`
Expected: FALHA em "proposta: recebe as condicoes ao ligar".

- [ ] **Passo 3: `conferirProposta`** lê as três chaves novas (o `condicoesDoClienteId` com a distinção ausente/presente).

- [ ] **Passo 4: `salvarProposta`**: logo depois de resolver o `clienteId` (~306) e **antes** da cópia do cliente e do A/C
  (~309-331), com `jaAplicado = dados.condicoesDoClienteId !== undefined ? dados.condicoesDoClienteId : atual.condicoesDoClienteId`:
  com `clienteId`, ler o cliente com `SELECAO_DE_CONDICOES`, `Object.assign(dados, camposAoLigarCliente(clienteParaCondicoes(linha), { ...dados, condicoesDoClienteId: jaAplicado }, { hoje }))`.
  Gravar `mostrarMarcaModelo`, `mostrarFaturamentoMinimo` e `condicoesDoClienteId` (o do remendo quando ele traz a chave,
  senão `jaAplicado ?? null`; sem cliente, `jaAplicado ?? null`).

- [ ] **Passo 5: `propostaParaTela`, o include do `cliente` (`propostaExigencias`) e o `conteudo.js`**
  (`temMarca = Boolean(proposta.mostrarMarcaModelo)`; o faturamento mínimo com `proposta.mostrarFaturamentoMinimo`;
  comentários com a data e o porquê).

- [ ] **Passo 6: Rodar e ver passar**

Run: `npm run teste:propostas`
Expected: 0 falhas.

- [ ] **Passo 7: Commit** `feat(propostas): condicoes do cliente no Salvar e caixas do PDF na proposta`.

---

### Tarefa 4: Cadastro no servidor (condições, ICMS e senha do portal)

**Arquivos:**
- Criar: `src/lib/clientes/condicoes.js` (puro), `src/lib/clientes/portal.js`
- Modificar: `src/app/cadastros/acoes-clientes.js` (`salvarCliente` ~87-260; ação nova), `src/lib/acessos/projecoes.js`
  (`PESSOAIS_NA_TELA` ~56, `PESSOAIS_GRAVADOS` ~67)
- Teste: `scripts/teste-cadastros.js` (seção nova "Condições comerciais do cliente")

**Interfaces:**
- Produz em `condicoes.js`:
  - `lerCondicoesDoFormulario(campos, formData) -> { dados, erros }`, `dados` com os nomes das colunas da Tarefa 1 (grupo
    Proposta, `notaFiscalObservacao`, `emailsRastreio` pelo `lerEmails(formData, "emailsRastreio")`, `portalUrl`,
    `portalUsuario`, `portalObservacao`). Erros, no campo: `propostaValidadeDias` fora de 1-365 → "Validade de 1 a 365
    dias."; `propostaFormaPagamento` fora de `FORMAS_DE_PAGAMENTO` → "Escolha uma forma da lista."; `portalUrl` sem
    `http://`/`https://` → "Use um endereço que começa com http:// ou https://.". Caixas: `=== "on"`. `propostaFreteDiluido`
    só com `propostaFretePorConta === "CIF"`. Limites de texto: 2000 (pagamento, NF, observação do portal), 4000
    (observações, exigências), 200 (garantia, URL), 120 (A/C, usuário).
  - `indicadorIeDoFormulario(campos, tipoPessoa) -> { indicadorIe, ieIsento }`: física → `{ null, false }`; jurídica → o
    valor do enum ou `null`, e `ieIsento = indicadorIe === "ISENTO"`.
  - `indicadorIeDoBling(indicadorIe) -> 1 | 2 | 9 | null` (`CONTRIBUINTE` 1, `ISENTO` 2, `NAO_CONTRIBUINTE` 9).
- Produz em `portal.js`:
  - `senhaDoPortalParaGravar({ nova, apagar }) -> string | null | undefined`: `apagar` → `null`; `nova` não vazia (sem
    `trim`: espaço faz parte da senha; até 200) → `cifrar({ senha: nova })`; senão `undefined` (mantém).
  - `abrirSenhaDoPortal(cifrada) -> { ok: true, senha } | { ok: false, erro }`: nula → "Nenhuma senha gravada."; o
    `decifrar` lança → "Senha gravada com outra chave; grave de novo.".
  - `async senhaDoPortalDoCliente(clienteId, { quem, db = prisma }) -> { ok, senha } | { ok: false, erro }`: lê, abre e
    grava `registrarAuditoria(tx, { quem, oQue: "cliente.portal.verSenha", alvo: clienteId })` (sem `antes`/`depois`).
- Produz em `acoes-clientes.js`: `export async function senhaDoPortalAcao(clienteId)`, com
  `negarSemAcessos` de `tela.cadastros.clientes` editar **e** `dado.pessoalDoCliente` ver (ver um uso existente de
  `negarSemAcessos`), e `quem` como o de `criarPropostaAcao` (`src/app/propostas/acoes.js:30`).

- [ ] **Passo 1: Escrever os testes que falham**

```js
console.log("\nCondicoes comerciais do cliente");
const condicoes = await import("../src/lib/clientes/condicoes.js");
const portal = await import("../src/lib/clientes/portal.js");
const fd = (pares) => { const f = new FormData(); for (const [k, v] of pares) f.append(k, v); return f; };
const lido = condicoes.lerCondicoesDoFormulario(
  { propostaValidadeDias: "0", propostaFormaPagamento: "Cheque", portalUrl: "ftp://x", propostaFretePorConta: "FOB", propostaFreteDiluido: "on" },
  fd([]),
);
conferir("condicoes: validade, forma e link recusados", Object.keys(lido.erros).sort(), ["portalUrl", "propostaFormaPagamento", "propostaValidadeDias"]);
conferir("condicoes: diluir so no CIF", condicoes.lerCondicoesDoFormulario({ propostaFretePorConta: "FOB", propostaFreteDiluido: "on" }, fd([])).dados.propostaFreteDiluido, false);
conferir("ICMS: juridica isenta e fisica", [condicoes.indicadorIeDoFormulario({ indicadorIe: "ISENTO" }, "JURIDICA"), condicoes.indicadorIeDoFormulario({ indicadorIe: "ISENTO" }, "FISICA")], [{ indicadorIe: "ISENTO", ieIsento: true }, { indicadorIe: null, ieIsento: false }]);
conferir("ICMS: codigos do Bling", ["CONTRIBUINTE", "ISENTO", "NAO_CONTRIBUINTE", null].map(condicoes.indicadorIeDoBling), [1, 2, 9, null]);
const SENHA = "Sênh@ 123 çãõ ";
const cifrada = portal.senhaDoPortalParaGravar({ nova: SENHA, apagar: false });
conferir("portal: cifrada sem a senha em texto", [typeof cifrada, cifrada.includes("Sênh")], ["string", false]);
conferir("portal: volta igual, com acento e espaco", portal.abrirSenhaDoPortal(cifrada), { ok: true, senha: SENHA });
conferir("portal: vazio mantem, apagar zera", [portal.senhaDoPortalParaGravar({ nova: "", apagar: false }), portal.senhaDoPortalParaGravar({ nova: "x", apagar: true })], [undefined, null]);
conferir("portal: outra chave da aviso", portal.abrirSenhaDoPortal("aaa.bbb.ccc"), { ok: false, erro: "Senha gravada com outra chave; grave de novo." });
```

  E, no banco (cliente `ZZ Cliente Portal`, criado e apagado pelo teste): gravar `portalSenhaCifrada`; a linha lida com
  `$queryRaw` não contém "Sênh"; `senhaDoPortalDoCliente(id, { quem: "zz-teste" })` devolve a senha e cria a linha
  `cliente.portal.verSenha` com `antes`/`depois` nulos, e o JSON da linha não contém "Sênh" (apagar as linhas de auditoria
  com `quem = "zz-teste"` no fim). Projeção: `projetarCliente({ portalUsuario: "u", emailsRastreio: ["a@zz.test"], temSenhaDoPortal: true, nome: "x" }, () => false)`
  devolve `{ nome: "x" }`; `pessoalPreservado({ portalUsuario: "u", emailsRastreio: ["a@zz.test"], notaFiscalObservacao: "n", ... }, { nome: "x" }, () => false)`
  mantém os três.

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npm run teste:cadastros`
Expected: FALHA na importação de `src/lib/clientes/condicoes.js`.

- [ ] **Passo 3: Implementar `condicoes.js` e `portal.js`.**

- [ ] **Passo 4: `projecoes.js`**: `PESSOAIS_NA_TELA` ganha `emailsRastreio`, `portalUrl`, `portalUsuario`,
  `portalObservacao`, `temSenhaDoPortal` e `notaFiscalObservacao`; `PESSOAIS_GRAVADOS` ganha `emailsRastreio: []`,
  `portalUrl`, `portalUsuario`, `portalObservacao` e `notaFiscalObservacao` (`null`).

- [ ] **Passo 5: `salvarCliente`**: juntar os `dados`/`erros` de `lerCondicoesDoFormulario` e de
  `indicadorIeDoFormulario` (no lugar do `ieIsento` de `campos.ieIsento === "on"`, ~177); o `select` do `atual` (~101) ganha
  as colunas pessoais novas; com `comPessoal`, `portalSenhaCifrada = senhaDoPortalParaGravar({ nova: campos.portalSenhaNova, apagar: campos.portalSenhaApagar === "on" })`
  quando não for `undefined`, e uma linha de auditoria `cliente.portal.trocarSenha` (sem valor) na mesma transação; sem
  `comPessoal`, a senha não é tocada. Parar de gravar `padraoPropostaId` (~184): a coluna sai na Tarefa 9 e as condições
  já foram copiadas. A ação `senhaDoPortalAcao` chama `senhaDoPortalDoCliente`.

- [ ] **Passo 6: Rodar e ver passar**

Run: `npm run teste:cadastros` e `npm run teste:acessos` (o guarda estático de `src/app` vê a ação nova)
Expected: 0 falhas nos dois.

- [ ] **Passo 7: Commit** `feat(clientes): condicoes comerciais, ICMS e senha cifrada do portal no Salvar`.

---

### Tarefa 5: Contribuinte de ICMS e e-mails da NF no contato do Bling

**Arquivos:**
- Modificar: `src/lib/clientes/condicoes.js` (função nova), `src/lib/propostas/cliente.js` (`enviarClienteAoBling` ~192,
  função nova), `src/app/cadastros/acoes-clientes.js` (`salvarCliente`)
- Teste: `scripts/teste-propostas.js` (seção "Cliente da proposta", que já tem o `criarBlingFalso`)

**Interfaces:**
- Consome: `indicadorIeDoBling` (Tarefa 4).
- Produz:
  - `camposFiscaisDoContato(cliente) -> { indicadorIe?, emailNotaFiscal? }` em `condicoes.js`: só as chaves com valor;
    `emailNotaFiscal = emailsNotaFiscal.join(",")` (o separador ainda não foi medido; comentário dizendo isso).
  - `atualizarFiscalDoContatoNoBling(clienteId, { bling = clienteBling(), db = prisma, exigirEscrita = escritaDoBling } = {}) -> { ok: true, mudou: boolean } | { ok: false, erro }`
    em `propostas/cliente.js`: sem `blingContatoId` → `{ ok: true, mudou: false }`; `GET /contatos/{id}`; já igual →
    `mudou: false`; senão `exigirEscrita()` e `PUT /contatos/{id}` com o **contato lido inteiro** mais os dois campos (sem
    `id`). Erro do Bling vira `{ ok: false, erro }` (no molde de `lerDoBling`/`FalhaDoBling` do arquivo).
  - `salvarCliente` (edição) com `blingContatoId` chama a função quando `indicadorIe` ou `emailsNotaFiscal` mudaram e, se ela
    falhar, devolve `{ ok: true, id, aviso: "Gravado no Rise; o Bling recusou os dados fiscais: <erro>" }`.

- [ ] **Passo 1: Escrever os testes que falham**: ligar um cliente ZZ ao contato falso `17000000001` (o que tem fantasia,
  celular e endereço), com `emailsNotaFiscal: ["nf@zz.test", "almox@zz.test"]` e `indicadorIe: "NAO_CONTRIBUINTE"`:

```js
const fiscal = await cliente.atualizarFiscalDoContatoNoBling(comFiscal.id, opcoes);
const put = falso.chamadas.filter((c) => c.metodo === "PUT" && c.caminho === "/contatos/17000000001").at(-1);
conferir("Bling: grava ICMS e e-mails da NF", [fiscal, put?.corpo?.indicadorIe, put?.corpo?.emailNotaFiscal], [{ ok: true, mudou: true }, 9, "nf@zz.test,almox@zz.test"]);
conferir("Bling: o PUT leva o contato inteiro de volta", [put?.corpo?.fantasia, put?.corpo?.celular, put?.corpo?.endereco?.geral?.endereco], ["ZZ Bling", "54988990001", "Rua Z"]);
const antes = falso.chamadas.length;
conferir("Bling: igual nao grava de novo", [await cliente.atualizarFiscalDoContatoNoBling(comFiscal.id, opcoes), falso.chamadas.length], [{ ok: true, mudou: false }, antes]);
```

  E no caminho de criar: um cliente ZZ novo com `indicadorIe: "ISENTO"` e um e-mail da NF, enviado por
  `enviarClienteAoBling`, tem `indicadorIe: 2` e o `emailNotaFiscal` no corpo do `POST /contatos`. Trava fechada
  (`exigirEscrita` que lança) → `ok: false`.

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npm run teste:propostas`
Expected: FALHA em "Bling: grava ICMS e e-mails da NF".

- [ ] **Passo 3: Implementar** `camposFiscaisDoContato`, o corpo do `POST` com `...camposFiscaisDoContato(cliente)` e
  `atualizarFiscalDoContatoNoBling`; ligar no `salvarCliente`.

- [ ] **Passo 4: Rodar e ver passar**

Run: `npm run teste:propostas` e `npm run teste:cadastros`
Expected: 0 falhas.

- [ ] **Passo 5: Commit** `feat(clientes): ICMS e e-mails da NF no contato do Bling`.

---

### Tarefa 6: Tela do cadastro (aba "Condições comerciais")

**Arquivos:**
- Modificar: `src/components/cadastros/FormularioCliente.jsx` (`ABAS` ~34, `ABA_DO_CAMPO` ~43, aba Cadastro ~221-300,
  Contato ~309-340, Adicionais ~377-460)
- Criar: `src/components/cadastros/SenhaDoPortal.jsx`
- Modificar: `src/app/cadastros/[tipo]/[id]/page.jsx` (`valores`, ~75-100)

**Interfaces:**
- Consome: `senhaDoPortalAcao(clienteId)` (Tarefa 4); `aviso` do `salvarCliente` (Tarefa 5).
- Produz: os nomes dos campos do formulário iguais às colunas, mais `portalSenhaNova` e `portalSenhaApagar`.

- [ ] **Passo 1: Ler** `node_modules/next/dist/docs/` na parte de Server Actions chamadas de componente cliente, antes do
  `SenhaDoPortal`.

- [ ] **Passo 2: `page.jsx`**: `valores` ganha as colunas novas (texto vazio para nulo, como os outros) e
  `temSenhaDoPortal: Boolean(cliente.portalSenhaCifrada)`; **nunca** o `portalSenhaCifrada`.

- [ ] **Passo 3: `FormularioCliente`**:
  - aba `{ id: "condicoes", rotulo: "Condições comerciais" }` entre "Contato" e "Dados adicionais", com os grupos e a ordem
    do esboço do desenho (Proposta, Faturamento, Entrega, Portal de compras);
  - para ela: transportadora e condição preferida (de Adicionais) e os e-mails da NF (de Contato), todos os campos novos no
    `ABA_DO_CAMPO`;
  - o A/C com `datalist` dos contatos digitados na aba Contato;
  - na aba Cadastro, "Contribuinte de ICMS" (Contribuinte, Isento, Não contribuinte) no lugar da caixa "IE isenta", no
    molde do `EscolhaDoTipo`, desabilitando a IE com Isento, como hoje;
  - sai o seletor "Padrão de proposta";
  - o `aviso` da resposta do Salvar aparece em âmbar.

- [ ] **Passo 4: `SenhaDoPortal.jsx`**: com senha gravada, "••••••" e três botões de ícone com `title`:
  - **Mostrar:** chama a ação e mostra a senha por 30 s ou até fechar;
  - **Trocar:** abre o `input type="password" name="portalSenhaNova"`;
  - **Apagar:** pop-up "Apagar a senha do portal?" e põe `portalSenhaApagar=on` num campo oculto.

  Sem senha gravada, aparece só o campo. O erro da ação aparece numa linha em vermelho.

- [ ] **Passo 5: Lint**

Run: `npm run lint`
Expected: sem erro nos arquivos tocados.

- [ ] **Passo 6: Conferir na tela** (servidor do PC reiniciado depois do `prisma generate`), em largura de notebook:
  1. Abrir um cliente jurídico ZZ e preencher a aba nova.
  2. Gravar uma senha e salvar, depois recarregar: os valores voltam e a senha aparece como "••••••".
  3. "Mostrar" exibe a senha e cria a linha no Histórico.
  4. "Apagar" pergunta antes.
  5. Erro de validação leva à aba com o ponto vermelho.
  6. Escolher "Isento" desabilita a IE.

  Passar a aba pela skill `ecc:make-interfaces-feel-better` (regra 10) e corrigir o que ela apontar. Captura de tela.

- [ ] **Passo 7: Commit** `feat(clientes): aba Condicoes comerciais e senha do portal na tela`.

---

### Tarefa 7: Tela da proposta

**Arquivos:**
- Modificar: `src/components/propostas/EditorProposta.jsx` (~47-49, `aplicarPadrao`/`ligarCliente`/`desligarCliente`
  ~127-161, seletor ~370-390, exigências ~394, `ItensDaProposta` ~405)
- Modificar: `src/components/propostas/CartaoCliente.jsx` (campo CPF/CNPJ ~185, `seletorDoPadrao` ~155)
- Modificar: `src/components/propostas/formato.js` (`formularioDaProposta` ~61, `entradaDoFormulario` ~101)
- Modificar: `src/app/propostas/acoes.js` (`clienteParaProposta` ~118; ação nova)

**Interfaces:**
- Consome: `camposAoLigarCliente` (Tarefa 2); `SELECAO_DE_CONDICOES` e `clienteParaCondicoes` (Tarefa 3).
- Produz:
  - `clienteParaProposta` passa a ler também `SELECAO_DE_CONDICOES` e devolve as colunas já achatadas
    (`condicaoPagamentoId`).
  - `export async function clientePeloDocumentoAcao(documento) -> cliente | null`: acesso `tela.propostas` ver; só no Rise;
    documento conferido e formatado com `validarCpf`/`validarCnpj`/`formatarCpf`/`formatarCnpj` de `src/lib/documentos.js`.
  - O formulário ganha `mostrarMarcaModelo`, `mostrarFaturamentoMinimo` e `condicoesDoClienteId`, e o
    `entradaDoFormulario` **sempre** manda `condicoesDoClienteId` (é o que diz ao servidor que a tela já aplicou).

- [ ] **Passo 1: `formato.js` e `acoes.js`** como acima.

- [ ] **Passo 2: `ligarCliente(lido)`**: junta `camposAoLigarCliente(lido, formulario, { preencherVazios: true })` ao
  formulário, com `null` virando `""` nos campos de texto, além do que já faz (id, nome, documento, contato zerado quando o
  remendo não traz `contatoNome`). `desligarCliente` não mexe no `condicoesDoClienteId`. Saem `aplicarPadrao`, `padraoComum`
  e o seletor.

- [ ] **Passo 3: CNPJ ao sair do campo**: no `onBlur` do CPF/CNPJ do `CartaoCliente`, sem cliente ligado e com documento
  válido no navegador (`src/lib/documentos.js`, que é puro), chamar `clientePeloDocumentoAcao`; achou → `aoLigarCliente`.
  Documento incompleto ou inválido: nada (o Salvar já mostra o erro).

- [ ] **Passo 4: Selo e caixas**:
  - No lugar do seletor de padrão, o selo **"Condições do cadastro"** quando
    `formulario.condicoesDoClienteId && formulario.condicoesDoClienteId === formulario.clienteId`, com o `title` "Vieram do
    cadastro do cliente; mudar aqui não muda o cadastro".
  - Ao lado de "Assinar digitalmente" (procure `assinarDigitalmente` no editor), as caixas **"Marca/Modelo no PDF"** e
    **"Faturamento mínimo no PDF"**.
  - O quadro de exigências passa a ler `linhasDasExigencias(cliente?.propostaExigencias)`.
  - O `exigeMarcaModelo` do `ItensDaProposta` e o `pendenciasDoPdf` passam a vir de `formulario.mostrarMarcaModelo`.

- [ ] **Passo 5: Lint**

Run: `npm run lint`
Expected: sem erro nos arquivos tocados.

- [ ] **Passo 6: Conferir na tela** (PC, largura de notebook):
  1. Proposta nova, buscar um cliente ZZ com condições: os campos se preenchem e o selo aparece.
  2. Mudar a forma, salvar e recarregar: a mudança fica.
  3. Proposta nova provisória, digitar o CNPJ desse cliente e sair do campo: os campos se preenchem.
  4. Trocar para um cliente sem condições: a regra geral volta e o selo some.
  5. Marcar "Marca/Modelo no PDF": a coluna aparece nos itens e no PDF.
  6. `read_console_messages` sem erro.

  Captura de tela.

- [ ] **Passo 7: Commit** `feat(propostas): proposta preenchida pelas condicoes do cliente na tela`.

---

### Tarefa 8: E-mails do rastreio

**Arquivos:**
- Modificar: `src/lib/frete/envios.js` (`destinatarioDoPedido` ~68, exportada; `select` do `cliente` ~108)
- Modificar: `src/lib/frete/aviso.js` (`avisarCliente` ~45-60)
- Teste: `scripts/teste-frete.js`

**Interfaces:**
- Produz:
  - `destinatarioDoPedido(pedido)` (agora `export`): `email = cliente.emailsRastreio[0] || emailDoComprador || cliente.email`
    e `emails = cliente.emailsRastreio` (só quando há).
  - `avisarCliente` manda `para = destinatario.emails.join(", ")` quando a lista existe, senão o `destinatario.email`
    (o nodemailer aceita vários separados por vírgula).

- [ ] **Passo 1: Testes que falham**

```js
const { destinatarioDoPedido } = await import("../src/lib/frete/envios.js");
const pedidoB2B = { emailDoComprador: "comprador@zz.test", cliente: { email: "geral@zz.test", emailsRastreio: ["almox@zz.test", "compras@zz.test"] }, enderecoDeEntrega: {} };
conferir("rastreio: os do cadastro vem antes do comprador", [destinatarioDoPedido(pedidoB2B).email, destinatarioDoPedido(pedidoB2B).emails], ["almox@zz.test", ["almox@zz.test", "compras@zz.test"]]);
conferir("rastreio: sem a lista, como hoje", destinatarioDoPedido({ ...pedidoB2B, cliente: { email: "geral@zz.test", emailsRastreio: [] } }).email, "comprador@zz.test");
```

  E, no bloco do `avisarCliente` (~1035), um envio com `destinatario: { ...DESTINATARIO_ZZ, emails: ["a@zz.test", "b@zz.test"] }`:
  o transporte falso recebe `to === "a@zz.test, b@zz.test"`.

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npm run teste:frete`
Expected: FALHA (`destinatarioDoPedido` não exportada).

- [ ] **Passo 3: Implementar** nos dois arquivos.

- [ ] **Passo 4: Rodar e ver passar**

Run: `npm run teste:frete`
Expected: 0 falhas.

- [ ] **Passo 5: Commit** `feat(frete): aviso de rastreio para os e-mails do cadastro do cliente`.

---

### Tarefa 9: Retirar os padrões e fechar

**Arquivos:**
- Apagar: `src/app/propostas/padroes/page.jsx`, `src/app/propostas/acoes-padroes.js`,
  `src/components/propostas/PadroesDeProposta.jsx`, `src/lib/propostas/padroes.js`
- Modificar:
  - `src/app/propostas/page.jsx` (link `/propostas/padroes`, ~49);
  - `src/app/propostas/[numero]/page.jsx` (~29-41);
  - `src/app/cadastros/[tipo]/novo/page.jsx` (~10, ~42) e `[id]/page.jsx` (~13, ~91, ~180);
  - `FormularioCliente.jsx` e `EditorProposta.jsx` (a prop `padroes`);
  - `src/lib/propostas/banco.js` (include `padrao` ~80, `padraoId`/`padrao` em `propostaParaTela`, ~336 e ~385,
    `padraoPropostaId` no `select`);
  - `src/lib/propostas/esquema.js` (~92) e `regras.js` (`camposDoPadrao`);
  - `src/app/cadastros/acoes-clientes.js` (ramo P2003 do padrão, ~250);
  - `prisma/schema.prisma`;
  - `scripts/teste-propostas.js` (seção "Padroes de proposta" ~736-816 e a linha do `limpar` ~263);
  - `scripts/teste-mcp.js`;
  - `CLAUDE.md`.
- Criar: `prisma/migrations/20261124b_sem_padroes_de_proposta/migration.sql`

- [ ] **Passo 1: Teste do MCP que falha**: em `teste-mcp.js`, um cliente ZZ com `portalUsuario` e `portalSenhaCifrada`;
  `JSON.stringify` do `listarClientes` e da leitura da proposta dele não contém "portal" nem o usuário.

Run: `npm run teste:mcp`
Expected: passa já (o `listarClientes` monta a saída campo a campo). A asserção fica de guarda.

- [ ] **Passo 2: Apagar os arquivos e as referências**; schema sem `PadraoDeProposta`, `padraoId` e `padraoPropostaId`;
  migration com `ALTER TABLE ... DROP COLUMN` das duas colunas e `DROP TABLE "PadraoDeProposta"`.

Run: `npx prisma migrate deploy` e `npx prisma generate`
Expected: aplicada.

- [ ] **Passo 3: Conferir que não sobrou nada**

Run: `grep -rnE "padraoDeProposta|padraoId|padraoPropostaId|camposDoPadrao|listarPadroes|acoes-padroes|PadroesDeProposta" src scripts`
Expected: nenhuma linha.

- [ ] **Passo 4: CLAUDE.md**:
  - a seção "Propostas para cliente" ganha as condições do cliente, a regra de ligar, as caixas da proposta, o portal
    cifrado por cliente (a exceção à `Conexao`, uma por serviço) e o que nunca foi medido no Bling;
  - a tabela do Estado e as contagens de asserções do `teste:propostas`, `teste:cadastros`, `teste:frete` e `teste:mcp`
    acompanham.

- [ ] **Passo 5: Ritual de fim de sessão**

Run: `npm run lint`, `npm run teste:propostas`, `npm run teste:cadastros`, `npm run teste:frete`, `npm run teste:mcp`,
`npm run teste:acessos`, `npm run teste:extracao`, `npm run teste:coleta` e, sozinho e em segundo plano,
`npm run teste:worker`
Expected: 0 falhas em todos.

- [ ] **Passo 6: Commit e push** `feat(propostas): padroes de proposta saem; condicoes no cadastro do cliente` e
  `git push origin main`.

---

## Depois do plano (não é tarefa de código)

- Deploy só com o "sobe" do dono (as duas migrations no mesmo deploy, backup antes).
- Na VPS, conferir os três clientes que receberam condições e a FUNPEC com o dono (o padrão dizia 30 dias, sem assinatura;
  as 2031-2036 saíram com A/C "Grupo de Compras – FUNPEC", frete diluído e assinatura).
- 1º envio real de ICMS e e-mails da NF num contato ZZ do Bling com o OK do dono. Medir o separador de vários e-mails e o
  PUT, e registrar no CLAUDE.md.
