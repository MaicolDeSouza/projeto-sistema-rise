# Licenças Softwares: plano de execução

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Neste projeto:** execução INLINE com `superpowers:executing-plans` (regra do dono desde 05/10/2026: sem subagentes).

**Goal:** O cartão "Licenças Softwares" em Ferramentas, com as licenças do LightBurn (chave + leitura do portal pela
extensão do Chrome) e do Mach3 (arquivo guardado no banco, com versões), as linhas de cliente de cada licença, a
importação única das planilhas e da pasta, a aba no Cliente e o cartão em Integrações.

**Architecture:** Programa é cadastro (`Software`); cada `Licenca` tem `LinhaDeLicenca` (quem recebeu, digitado
pelo dono) e `AtivacaoDeLicenca` (os PCs que o portal viu, escritos só pela leitura da extensão), casadas pelo nome
do PC. O arquivo do Mach3 mora em `ArquivoDeLicenca` (`Bytes`, versões, sha256). As regras ficam em módulos puros
testados sem banco; o banco em `banco.js`/`portal.js`; a tela é uma página de Ferramentas com abas por programa; a
extensão "Rise LightBurn" copia o molde da do AliExpress (chave com hash em `Conexao`, duas rotas fora do Tinyauth).

**Tech Stack:** Next.js (App Router, server actions e route handlers), Prisma 7 + PostgreSQL 17, zod, exceljs (só no
script de importação), `node:zlib`/`node:crypto` para o zip e o sha256, extensão Chrome manifest v3 em JS puro.

**Spec:** `docs/superpowers/specs/2026-11-05-licencas-softwares-design.md` (commit 56fe402).

## Global Constraints

- JavaScript sem TypeScript; identificadores e comentários sem acento; todo texto de tela com acento.
- Migration **aditiva** `20261105_licencas_softwares`, gerada com `npx prisma migrate diff --from-config-datasource
  --to-schema prisma/schema.prisma --script` (o `migrate dev` é interativo e falha), gravada à mão e aplicada com
  `npx prisma migrate deploy`; depois `npx prisma generate` e reiniciar `npm run dev` (o client velho fica no
  `globalThis`). Tirar do SQL gerado qualquer `DROP` dos índices feitos à mão (trigramas, parciais).
- Testes: `scripts/teste-licencas.js` (Postgres local, SEM rede) só escreve licenças `ZZ-LIC-*`, programas
  `zz-lic-*`, clientes `"ZZ LIC *"` (apaga no começo e no fim; `-- --manter` deixa) e devolve a `Conexao LIGHTBURN`;
  `scripts/teste-extensao-lightburn.js` é puro. Harness dos testes do projeto (molde `scripts/teste-aliexpress.js`):
  `import "dotenv/config"`, `register(resolver-alias)`, `conferir(nome, obtido, esperado)` por `JSON.stringify`,
  `process.exit(falhas ? 1 : 0)`.
- Acessos: toda página chama `exigirAcessoNaPagina(`, toda server action começa com `negarSemAcesso(s)(` (o guarda
  estático do `teste:acessos` lê as 7 primeiras linhas de cada `export async function`), toda rota de arquivo usa
  `sessaoDeAcessos(` + `recusarRota(`, e as duas rotas da extensão chamam `conferirChaveDaExtensao(` (o mesmo nome da
  do AliExpress, que o guarda já aceita).
- Padrão visual (10 regras do CLAUDE.md): uma ação principal, `BolhaDeAjuda` no lugar de texto fixo, janelas com
  `role` + `propsDoFundo`, exclusão com popup listando o que sai, `ConclusaoDoEnvio` só para envio que deu certo,
  `CabecalhoOrdenavel` + `NavegacaoDoTopo` na lista, `Copiar` na chave.
- A extensão **só lê** o portal (nenhum POST/PUT/DELETE); a chave só sai para o endereço configurado; e-mail e nome
  do usuário logado nunca vão ao Rise. A senha do portal (aba "Link controle licencas") **não entra em lugar nenhum**:
  o script de importação nunca abre essa aba.
- Commit por tarefa, mensagem sem acento, terminando com `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
  Push no fim; deploy na VPS **só com o "subir" do dono**.
- Canal da planilha: `ML`, `ML4H`, `ML3H` → `MERCADO_LIVRE`; `4H`, `Loja`, `loja`, `Direta` → `DIRETA`; o texto
  original vai à observação quando não é exatamente `ML`.
- Prazos do frescor da leitura: até 7 dias verde, até 30 âmbar, acima vermelho, nunca lida vermelho.
- Teto do arquivo de licença: 1 MB (`TETO_BYTES_ARQUIVO = 1048576`), também descompactado; PDF de instruções: 5 MB.
- CPFs de teste (válidos pelo dígito): `529.982.247-25` e `012.345.678-90`; CNPJ de teste `11.222.333/0001-81`.

## Review Focus

Entradas que a spec implica e nenhum teste cobriria sem estas linhas (cada uma ganhou o teste na tarefa dona):
1. **Dois PCs do portal com o mesmo hostname numa chave** (dois "DESKTOP-PC"): nenhuma linha pode ficar com o PC
   errado; o casamento fica em empate e a tela diz. Teste em `casarLinhasComAtivacoes` (Tarefa 3).
2. **Chave digitada em minúsculas ou com espaços** no "Nova licença" e a mesma chave vinda do portal: têm de ser a
   mesma licença, nunca duas. Teste de `criarLicenca` (Tarefa 5) e da leitura do portal (Tarefa 7).
3. **Leitura incompleta** (`completa: false`): atualiza o que veio e NÃO marca sumido nada; a leitura completa
   seguinte marca. Teste em `aplicarLeituraDoPortal` (Tarefa 7).
4. **Zip com o arquivo dentro de uma pasta** (`Mach3 VD60/Mach1Lic.dat`, como o dono manda) e zip com entrada de
   pasta + um arquivo: aceitos, `nomeOriginal` = só o nome base. Teste em `lerArquivoEnviado` (Tarefa 4).
5. **Linha do banco com `sha256` que não bate com os bytes** (corrompida): o download recusa com mensagem, nunca
   entrega o arquivo. Teste em `lerArquivoParaBaixar` (Tarefa 6).

---

### Task 1: Medir o portal da LightBurn (só leitura, no Chrome do dono)

**Files:**
- Create: `extensao-lightburn/MEDICAO.md`
- Create: `scripts/fixtures/lightburn/licencas.json`, `scripts/fixtures/lightburn/ativacoes.json`
  (respostas medidas, anonimizadas: chaves trocadas por `AAAAAA-BBBBBB-...`, hostnames por `PC-TESTE-N`, ids
  por `lic-1`/`act-1`, e-mails e nomes removidos)

**Interfaces:**
- Produces: o que a Tarefa 11 (extensão) e a Tarefa 3 (mapa de situação) precisam saber: host e caminhos da API,
  onde mora o token (localStorage? cookie? memória?), cabeçalhos que a página manda, paginação (parâmetros e
  cabeçalhos de total), se `/activations` aceita "todas" ou só por licença, os campos de licença e ativação, as
  palavras de situação, o formato das datas, e **onde está o Core/Pro** (campo, metadata, ou em nenhum lugar).

- [ ] **Step 1: Carregar as ferramentas do Chrome** (`ToolSearch` com
  `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__read_network_requests,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__javascript_tool`)
  e abrir `https://lightburn.customer.cryptlex.com/licenses` na aba do dono (ele já está logado; se aparecer a tela
  de login, pedir a ele para entrar e seguir). **Nada além de abrir as páginas e paginar é clicado.**

- [ ] **Step 2: Ler as chamadas da página de Licenses** com `read_network_requests` (filtrar por `cryptlex`): anotar
  método, host, caminho, query (`page`, `limit`, `sort`...), cabeçalhos de autorização e de paginação da resposta, e
  guardar UM corpo de resposta (`requestId`). Paginar para a página 2 e repetir.

- [ ] **Step 3: Ler as chamadas da página de Activations** (abrir `/activations`; se a página só mostra por licença,
  abrir a de uma chave): mesmo registro; conferir se há filtro `licenseId` e se a lista inteira vem sem filtro.

- [ ] **Step 4: Achar o token**: `javascript_tool` com `Object.keys(localStorage)` e `document.cookie` (só nomes, sem
  valores no MEDICAO.md). Anotar como a página o manda (cabeçalho e formato).

- [ ] **Step 5: Achar o Core/Pro**: procurar nos corpos medidos (`metadata`, `productId`, `productVersionId`,
  `licenseType`...) a chave que separa as licenças Pro das Core (a planilha diz quais são Pro: comparar duas chaves
  conhecidas). Anotar a regra ou "não existe no portal".

- [ ] **Step 6: Escrever `extensao-lightburn/MEDICAO.md`** com as seções: API (host, caminhos, cabeçalhos,
  paginação, teto por página), Token (onde, como vai), Licença (campos → payload do Rise), Ativação (campos →
  payload), Situação (palavras ou regra `revoked`/`suspended`/`expiresAt`), Datas (formato e fuso), Core/Pro, e
  "O que não dá para repetir" (se houver). Gravar as fixtures anonimizadas.

- [ ] **Step 7: Commit**

```bash
git add extensao-lightburn/MEDICAO.md scripts/fixtures/lightburn/
git commit -m "docs(licencas): medicao do portal da LightBurn (API, token, paginacao, situacao, Core/Pro)"
```

> Se o Chrome do dono não estiver disponível na hora, pular para a Tarefa 2: só as Tarefas 3 (mapa de situação) e 11
> dependem desta, e a 3 pode nascer com `ACTIVE/EXPIRED/SUSPENDED/REVOKED` e ser ajustada depois.

---

### Task 2: Banco, catálogo e Acessos

**Files:**
- Modify: `prisma/schema.prisma` (enums e models da spec §6.2; `Cliente.linhasDeLicenca`, `PedidoDeVenda.linhasDeLicenca`; `Servico` ganha `LIGHTBURN`)
- Create: `prisma/migrations/20261105_licencas_softwares/migration.sql`
- Modify: `src/lib/ferramentas/catalogo.js` (cartão), `src/lib/acessos/recursos.js:123-125` (recursos)
- Create: `scripts/teste-licencas.js` (esqueleto com harness, limpeza e o primeiro bloco)
- Modify: `package.json` (`"teste:licencas": "node scripts/teste-licencas.js"`, `"teste:extensao-lightburn": "node scripts/teste-extensao-lightburn.js"`)

**Interfaces:**
- Produces: os models com os nomes EXATOS da spec §6.2 (`Software`, `Licenca`, `LinhaDeLicenca`, `AtivacaoDeLicenca`,
  `ArquivoDeLicenca`, `LeituraDoPortal`; enums `IdentificacaoDaLicenca { CHAVE ARQUIVO }`,
  `SituacaoDaLinhaDeLicenca { ATIVA ENCERRADA }`, `CanalDaLicenca { MERCADO_LIVRE LOJA_INTEGRADA SHOPEE DIRETA }`).
  Programas semeados com `id` FIXO e legível (`'lightburn'` e `'mach3'`; o `cuid()` é só o default): `slug "lightburn"`
  (nome "LightBurn", CHAVE, `temPortal true`, `ativacoesPermitidas 3`, `linhasIniciais 3`,
  `linkPortal "https://lightburn.customer.cryptlex.com/licenses"`, `linkSite` = o link de compra com cupom da aba
  "Link controle licencas", `ordem 1`) e `slug "mach3"` (nome "Mach3", ARQUIVO, sem portal, `ativacoesPermitidas null`,
  `linhasIniciais 1`, `linkSite "https://www.machsupport.com/software/downloads-updates/"`, `ordem 2`).
  Recursos: `sub("tela.ferramentas.licencas", "Ferramentas › Licenças Softwares", "tela.ferramentas")` e
  `acao("acao.ferramentas.licencas.arquivo", "Baixar o arquivo da licença", "tela.ferramentas.licencas", "Entrega o zip com o arquivo de licença (Mach3) e o PDF de instruções.")`.

- [ ] **Step 1: Escrever o esqueleto do teste** `scripts/teste-licencas.js` no molde de `scripts/teste-aliexpress.js`
  (`register`, `manter`, `conferir`, `limpar()` que apaga `Licenca` cujo `identificador` começa com `ZZ-LIC-`, as
  `LeituraDoPortal` de teste, `Software` com `slug` começando `zz-lic-`, clientes com nome começando `ZZ LIC `, e
  `Conexao LIGHTBURN` devolvida ao fim) com o primeiro bloco:

```js
console.log("\nBanco: programas semeados e recursos");
const softwares = await prisma.software.findMany({ orderBy: { ordem: "asc" }, select: { slug: true, identificacao: true, temPortal: true, ativacoesPermitidas: true, linhasIniciais: true } });
conferir("LightBurn e Mach3 semeados", softwares.filter((s) => ["lightburn", "mach3"].includes(s.slug)), [
  { slug: "lightburn", identificacao: "CHAVE", temPortal: true, ativacoesPermitidas: 3, linhasIniciais: 3 },
  { slug: "mach3", identificacao: "ARQUIVO", temPortal: false, ativacoesPermitidas: null, linhasIniciais: 1 },
]);
conferir("Servico LIGHTBURN existe", Object.keys((await import("@/generated/prisma/enums")).Servico).includes("LIGHTBURN"), true);
const { recursoPorId } = await import("../src/lib/acessos/recursos.js");
conferir("recursos de Acessos", [recursoPorId("tela.ferramentas.licencas")?.pai, recursoPorId("acao.ferramentas.licencas.arquivo")?.pai], ["tela.ferramentas", "tela.ferramentas.licencas"]);
const { FERRAMENTAS } = await import("../src/lib/ferramentas/catalogo.js");
conferir("cartao em Ferramentas", FERRAMENTAS.find((f) => f.href === "/ferramentas/licencas")?.recurso, "tela.ferramentas.licencas");
```

- [ ] **Step 2: Rodar e ver falhar** — `npm run teste:licencas` → FALHA ("prisma.software is undefined" / recursos nulos).

- [ ] **Step 3: Schema** — colar os models da spec §6.2 em `prisma/schema.prisma` (seção nova "Licenças Softwares"
  antes de `model LogIntegracao`), as duas relações nos models existentes e `LIGHTBURN` no enum `Servico` com o
  comentário `/// Chave da extensao "Rise LightBurn" (so o hash), como ALIEXPRESS.`

- [ ] **Step 4: Migration** — gerar o SQL com `migrate diff --script`, gravar em
  `prisma/migrations/20261105_licencas_softwares/migration.sql` com o cabeçalho de comentário no molde das outras,
  tirar qualquer `DROP INDEX` dos índices à mão, e acrescentar no fim os dois `INSERT INTO "Software"` (ids
  `'lightburn'` e `'mach3'`, `"criadoEm"`/`"atualizadoEm"` = `CURRENT_TIMESTAMP`). Aplicar:
  `npx prisma migrate deploy && npx prisma generate`, reiniciar o `npm run dev`.

- [ ] **Step 5: Catálogo e Acessos** — entrada em `FERRAMENTAS` (ícone `KeyRound` do lucide; `rotulo`, `resumo`,
  `detalhe` da spec §6.1) e os dois recursos em `recursos.js` logo depois de `tela.ferramentas.cotacaoDolar`.

- [ ] **Step 6: Rodar e ver passar** — `npm run teste:licencas` → "Tudo certo."; `npm run teste:acessos` → passa (o
  administrador ganha os dois recursos pelo catálogo; o guarda estático ainda não vê páginas novas).

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261105_licencas_softwares src/lib/ferramentas/catalogo.js src/lib/acessos/recursos.js scripts/teste-licencas.js package.json
git commit -m "feat(licencas): banco, programas semeados, cartao em Ferramentas e recursos de Acessos"
```

---

### Task 3: Regras puras (`regras.js`)

**Files:**
- Create: `src/lib/ferramentas/licencas/regras.js`
- Modify: `scripts/teste-licencas.js` (bloco "Regras puras", antes dos blocos de banco)

**Interfaces:**
- Produces (todas puras, sem import de banco):
  - `CANAIS_DA_LICENCA = [{ valor: "MERCADO_LIVRE", rotulo: "Mercado Livre" }, { valor: "LOJA_INTEGRADA", rotulo: "Loja Integrada" }, { valor: "SHOPEE", rotulo: "Shopee" }, { valor: "DIRETA", rotulo: "Direta" }]` e `rotuloDoCanal(valor) → string`.
  - `normalizarNomeDoPc(texto) → string`: `""` para nulo; tira `\t\r\n`, apara as pontas, minúsculas, espaços internos viram um.
  - `normalizarIdentificador(texto, identificacao) → string`: apara; `CHAVE` também põe em MAIÚSCULAS.
  - `vagasLivres({ software, licenca, ativacoes }) → { permitidas: number|null, usadas: number, livres: number|null, lida: boolean }`:
    `usadas` = ativações com `sumiuEm` nulo; `permitidas = licenca.portalAtivacoesPermitidas ?? software.ativacoesPermitidas ?? null`;
    `lida = Boolean(licenca.portalLidoEm)`; `livres = null` quando não lida ou sem `permitidas`, senão `max(0, permitidas − usadas)`.
  - `casarLinhasComAtivacoes(linhas, ativacoes) → { porLinha: Map<linhaId, ativacao|null>, semCliente: ativacao[], empates: [{ hostname, linhaIds }] }`:
    só linhas `ATIVA` e ativações sem `sumiuEm`; casa por `normalizarNomeDoPc`; hostname repetido entre ativações, ou
    nome de PC repetido entre linhas, vira empate (ninguém casa) e as ativações do empate NÃO entram em `semCliente`.
  - `ultimoUso(ativacoes) → Date|null` (maior `ultimaSincronizacaoEm` entre as sem `sumiuEm`).
  - `situacaoDaLicenca({ licenca, software, agora = new Date() }) → { cor: "verde"|"ambar"|"cinza"|"vermelho", texto }|null`:
    `null` sem portal; `portalSumiuEm` → vermelho "Sumiu do portal"; `portalLidoEm` nulo → cinza "Não lida do portal";
    `portalSituacao` fora de `SITUACOES_VALIDAS = ["ACTIVE"]` e `SITUACOES_EXPIRADAS = ["EXPIRED"]` (ajustar pela
    Tarefa 1) → vermelho com `ROTULOS_DE_SITUACAO = { SUSPENDED: "Suspensa", REVOKED: "Revogada" }` ou o texto cru;
    `portalExpiraEm` nulo → verde "Sem expiração"; dias = `ceil((expira − agora)/dia)`: `> 30` verde "Expira em N dias",
    `0..30` âmbar "Expira em N dias" (0 → "Expira hoje"), `< 0` cinza "Expirada há N dias".
  - `frescorDaLeitura(lidaEm, agora = new Date()) → { cor, texto }`: nulo → vermelho "Nunca lido do portal"; hoje →
    verde "Lido do portal hoje"; ≤ 7 verde, ≤ 30 âmbar, > 30 vermelho, texto "Lido do portal há N dia(s)".
  - `ordenarLicencas(projetadas, { ordenar = null, direcao = "asc" }) → array`: padrão `livres` desc (null por
    último), depois `ultimoUso` asc (null primeiro), depois `identificador` asc; `ordenar` ∈
    `identificador|tipo|situacao|livres|ultimoUso|renovadaEm|clientes|ultimaEntrega` com `direcao`.
  - `lerDataIso(texto) → Date|null` ("YYYY-MM-DD" → meia-noite UTC) e `formatarDataCurta(date) → "dd/mm/aa"` (UTC).
  - `textoDoResumoDaLeitura(resumo) → string` ("78 chaves lidas · 2 novas · 5 alteradas · 1 PC sumiu · 3 PCs sem cliente (abra o Rise)", omitindo os zeros).

- [ ] **Step 1: Escrever os testes** (bloco "Regras puras"):

```js
const R = await import("../src/lib/ferramentas/licencas/regras.js");
conferir("nome do PC", [R.normalizarNomeDoPc("USUARIO-PC\t\r"), R.normalizarNomeDoPc("  Desktop  M5 "), R.normalizarNomeDoPc(null)], ["usuario-pc", "desktop m5", ""]);
conferir("identificador: chave em maiusculas, arquivo so aparado", [R.normalizarIdentificador(" bfe1ae-16 ", "CHAVE"), R.normalizarIdentificador(" Mach3 VD60 ", "ARQUIVO")], ["BFE1AE-16", "Mach3 VD60"]);
const lb = { ativacoesPermitidas: 3 };
const lida = { portalLidoEm: new Date(), portalAtivacoesPermitidas: null };
const at = (hostname, extra = {}) => ({ id: hostname, hostname, sumiuEm: null, ultimaSincronizacaoEm: null, ...extra });
conferir("vagas: 1 de 3, 2 livres", R.vagasLivres({ software: lb, licenca: lida, ativacoes: [at("A")] }), { permitidas: 3, usadas: 1, livres: 2, lida: true });
conferir("vagas: sumida nao conta", R.vagasLivres({ software: lb, licenca: lida, ativacoes: [at("A"), at("B", { sumiuEm: new Date() })] }).usadas, 1);
conferir("vagas: nunca lida = null, nunca '3 livres'", R.vagasLivres({ software: lb, licenca: { portalLidoEm: null }, ativacoes: [] }), { permitidas: 3, usadas: 0, livres: null, lida: false });
conferir("vagas: portal vence o programa e 4 de 3 da 0", R.vagasLivres({ software: lb, licenca: { ...lida, portalAtivacoesPermitidas: 3 }, ativacoes: [at("A"), at("B"), at("C"), at("D")] }).livres, 0);
conferir("vagas: programa sem limite", R.vagasLivres({ software: { ativacoesPermitidas: null }, licenca: lida, ativacoes: [at("A")] }).livres, null);
const linha = (id, nomeDoPc, situacao = "ATIVA") => ({ id, nomeDoPc, situacao });
const c1 = R.casarLinhasComAtivacoes([linha("l1", "Desktop-A"), linha("l2", null), linha("l3", "PC-X", "ENCERRADA")], [at("desktop-a"), at("PC-X"), at("NOVO")]);
conferir("casamento: por nome sem caixa; encerrada nao casa; sobra = sem cliente", [c1.porLinha.get("l1")?.hostname, c1.porLinha.get("l2"), c1.semCliente.map((a) => a.hostname), c1.empates], ["desktop-a", null, ["PC-X", "NOVO"], []]);
const c2 = R.casarLinhasComAtivacoes([linha("l1", "DESKTOP-PC")], [at("DESKTOP-PC", { id: "a1" }), at("desktop-pc", { id: "a2" })]);
conferir("casamento: dois PCs com o mesmo nome = empate, ninguem casa, nao sao 'sem cliente'", [c2.porLinha.get("l1"), c2.semCliente.length, c2.empates], [null, 0, [{ hostname: "desktop-pc", linhaIds: ["l1"] }]]);
conferir("ultimo uso", R.ultimoUso([at("A", { ultimaSincronizacaoEm: new Date("2026-10-01") }), at("B", { ultimaSincronizacaoEm: new Date("2026-11-01") }), at("C", { ultimaSincronizacaoEm: new Date("2026-12-01"), sumiuEm: new Date() })])?.toISOString(), "2026-11-01T00:00:00.000Z");
const agora = new Date("2026-11-05T12:00:00Z");
const sit = (licenca) => R.situacaoDaLicenca({ licenca: { portalSituacao: "ACTIVE", portalLidoEm: agora, ...licenca }, software: { temPortal: true }, agora });
conferir("situacao: verde > 30 dias", sit({ portalExpiraEm: new Date("2026-12-31T12:00:00Z") }), { cor: "verde", texto: "Expira em 56 dias" });
conferir("situacao: ambar <= 30", sit({ portalExpiraEm: new Date("2026-11-20T12:00:00Z") }).cor, "ambar");
conferir("situacao: expirada", sit({ portalExpiraEm: new Date("2026-10-26T12:00:00Z") }), { cor: "cinza", texto: "Expirada há 10 dias" });
conferir("situacao: suspensa, revogada, outra", [sit({ portalSituacao: "SUSPENDED" }).texto, sit({ portalSituacao: "REVOKED" }).texto, sit({ portalSituacao: "WEIRD" })], ["Suspensa", "Revogada", { cor: "vermelho", texto: "WEIRD" }]);
conferir("situacao: sumiu do portal vence tudo; nunca lida; sem portal", [sit({ portalSumiuEm: agora }).texto, sit({ portalLidoEm: null }), R.situacaoDaLicenca({ licenca: {}, software: { temPortal: false } })], ["Sumiu do portal", { cor: "cinza", texto: "Não lida do portal" }, null]);
conferir("frescor", [R.frescorDaLeitura(null).cor, R.frescorDaLeitura(agora, agora).texto, R.frescorDaLeitura(new Date("2026-11-01T12:00:00Z"), agora), R.frescorDaLeitura(new Date("2026-10-20T12:00:00Z"), agora).cor, R.frescorDaLeitura(new Date("2026-09-01T12:00:00Z"), agora).cor], ["vermelho", "Lido do portal hoje", { cor: "verde", texto: "Lido do portal há 4 dias" }, "ambar", "vermelho"]);
const proj = (identificador, livres, ultimoUso) => ({ identificador, vagas: { livres }, ultimoUso });
conferir("ordem padrao: mais livres, depois uso mais antigo (nunca usada primeiro), depois chave", R.ordenarLicencas([proj("C", 1, null), proj("A", 2, new Date("2026-01-01")), proj("B", 2, null), proj("D", null, null)]).map((p) => p.identificador), ["B", "A", "C", "D"]);
conferir("datas", [R.lerDataIso("2026-11-05")?.toISOString(), R.lerDataIso(""), R.formatarDataCurta(new Date("2026-11-05T00:00:00Z"))], ["2026-11-05T00:00:00.000Z", null, "05/11/26"]);
conferir("resumo da leitura", R.textoDoResumoDaLeitura({ licencas: 78, novas: 2, alteradas: 5, sumiram: 1, pcsSemCliente: 3 }), "78 chaves lidas · 2 novas · 5 alteradas · 1 PC sumiu · 3 PCs sem cliente (abra o Rise)");
```

- [ ] **Step 2: Rodar e ver falhar** — `npm run teste:licencas` → FALHA (módulo não existe).
- [ ] **Step 3: Implementar `regras.js`** com as assinaturas acima (comentário de cabeçalho: por que o portal é a
  única fonte de "vaga livre" e por que empate não casa).
- [ ] **Step 4: Rodar e ver passar** — `npm run teste:licencas` → "Tudo certo."
- [ ] **Step 5: Commit** — `git add src/lib/ferramentas/licencas/regras.js scripts/teste-licencas.js && git commit -m "feat(licencas): regras puras (vagas, casamento por nome do PC, situacao, frescor, ordem)"`

---

### Task 4: Arquivo de licença: zip, upload, sha256 (`arquivos.js`)

**Files:**
- Create: `src/lib/ferramentas/licencas/arquivos.js`
- Modify: `scripts/teste-licencas.js` (bloco "Arquivos: zip e upload")

**Interfaces:**
- Produces (puras, só `node:zlib` e `node:crypto`):
  - `TETO_BYTES_ARQUIVO = 1048576`.
  - `sha256Hex(bytes) → string` (hex minúsculo).
  - `crc32(bytes) → number`.
  - `limparNomeDeArquivo(nome) → string` (`basename`, `replace(/[^\w.\- ]/g, "_")`, vazio → `"licenca.dat"`).
  - `lerArquivoEnviado({ nome, bytes }) → { ok: true, nomeOriginal, bytes: Buffer, sha256, tamanhoBytes, mimeType: "application/octet-stream" } | { ok: false, erro }`:
    vazio → "Arquivo vazio."; acima do teto (enviado ou descompactado) → "Arquivo acima de 1 MB."; assinatura
    `50 4B 03 04` = zip: lê o diretório central, ignora entradas terminadas em `/`, exige exatamente UMA entrada de
    arquivo ("O zip precisa ter um único arquivo dentro."), método 0 (stored) ou 8 (`inflateRawSync`), confere o
    CRC32 ("Zip corrompido."); `nomeOriginal` = nome base limpo da entrada; senão o arquivo solto com o nome limpo.
  - `montarZipDoArquivo({ identificador, nomeOriginal, bytes }) → { nome: "<identificador limpo>.zip", bytes: Buffer }`:
    uma entrada stored `"<identificador limpo>/<nomeOriginal>"`, local header + central directory + end record,
    data/hora DOS de agora, CRC32.
  - `lerZipDeUmArquivo(bytes) → { ok: true, nome, bytes } | { ok: false, erro }` (exportada para o teste e usada por `lerArquivoEnviado`).

- [ ] **Step 1: Escrever os testes**:

```js
const A = await import("../src/lib/ferramentas/licencas/arquivos.js");
const dat = Buffer.from("MACH3-LICENCA-DE-TESTE-".repeat(9)).subarray(0, 201);
conferir("sha256 e crc32 conhecidos", [A.sha256Hex(Buffer.from("abc")), A.crc32(Buffer.from("123456789"))], ["ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", 0xcbf43926]);
const solto = A.lerArquivoEnviado({ nome: "../x/Mach1Lic.dat", bytes: dat });
conferir("dat solto: nome limpo, 201 bytes, sha", [solto.ok, solto.nomeOriginal, solto.tamanhoBytes, solto.sha256 === A.sha256Hex(dat)], [true, "Mach1Lic.dat", 201, true]);
const zip = A.montarZipDoArquivo({ identificador: "Mach3 VD60", nomeOriginal: "Mach1Lic.dat", bytes: dat });
conferir("zip: nome e assinatura", [zip.nome, zip.bytes.subarray(0, 4).toString("hex")], ["Mach3 VD60.zip", "504b0304"]);
const dentro = A.lerZipDeUmArquivo(zip.bytes);
conferir("zip: le o que montou, com a pasta no caminho", [dentro.ok, dentro.nome, dentro.bytes.equals(dat)], [true, "Mach3 VD60/Mach1Lic.dat", true]);
const peloZip = A.lerArquivoEnviado({ nome: "Mach3 VD60.zip", bytes: zip.bytes });
conferir("upload de zip: fica o arquivo de dentro, so o nome base", [peloZip.ok, peloZip.nomeOriginal, peloZip.tamanhoBytes, peloZip.bytes.equals(dat)], [true, "Mach1Lic.dat", 201, true]);
// zip com entrada de pasta + um arquivo deflate: monta com o zlib de verdade (deflateRawSync) para cobrir o metodo 8.
const zipComPasta = montarZipDeTeste([{ nome: "Mach3 VD60/", bytes: Buffer.alloc(0) }, { nome: "Mach3 VD60/Mach1Lic.dat", bytes: dat, deflate: true }]); // helper local do teste
conferir("zip com pasta e deflate: aceito", A.lerArquivoEnviado({ nome: "a.zip", bytes: zipComPasta }).nomeOriginal, "Mach1Lic.dat");
conferir("zip com dois arquivos: recusado", A.lerArquivoEnviado({ nome: "a.zip", bytes: montarZipDeTeste([{ nome: "a", bytes: dat }, { nome: "b", bytes: dat }]) }).erro, "O zip precisa ter um único arquivo dentro.");
conferir("zip corrompido (crc errado): recusado", A.lerArquivoEnviado({ nome: "a.zip", bytes: corromperCrc(zip.bytes) }).erro, "Zip corrompido.");
conferir("vazio e acima do teto", [A.lerArquivoEnviado({ nome: "a.dat", bytes: Buffer.alloc(0) }).erro, A.lerArquivoEnviado({ nome: "a.dat", bytes: Buffer.alloc(A.TETO_BYTES_ARQUIVO + 1) }).erro], ["Arquivo vazio.", "Arquivo acima de 1 MB."]);
conferir("zip pequeno que descompacta acima do teto: recusado", A.lerArquivoEnviado({ nome: "a.zip", bytes: montarZipDeTeste([{ nome: "a", bytes: Buffer.alloc(A.TETO_BYTES_ARQUIVO + 1), deflate: true }]) }).erro, "Arquivo acima de 1 MB.");
```

  `montarZipDeTeste` e `corromperCrc` são helpers do próprio teste (o primeiro escreve local headers, central
  directory e end record com `deflateRawSync` quando `deflate: true`; o segundo troca um byte do CRC do local header).

- [ ] **Step 2: Rodar e ver falhar.** — `npm run teste:licencas` → FALHA.
- [ ] **Step 3: Implementar `arquivos.js`** (tabela de CRC32 calculada uma vez; leitura pelo end record → central
  directory → local header; nada de dependência nova).
- [ ] **Step 4: Rodar e ver passar.** — `npm run teste:licencas` → "Tudo certo."
- [ ] **Step 5: Commit** — `git add src/lib/ferramentas/licencas/arquivos.js scripts/teste-licencas.js && git commit -m "feat(licencas): zip do arquivo de licenca, upload de .dat ou .zip e sha256"`

---

### Task 5: Banco: programas, licenças e linhas (`banco.js`)

**Files:**
- Create: `src/lib/ferramentas/licencas/banco.js`
- Modify: `scripts/teste-licencas.js` (bloco "Banco: licencas e linhas")

**Interfaces:**
- Consumes: `regras.js` (Tarefa 3), `arquivos.js` (Tarefa 4), `prisma` de `@/lib/db`, `buscarClientesParaVincular` de `@/lib/pedidos/banco`.
- Produces:
  - `listarSoftwares({ soAtivos = true } = {}) → [{ id, nome, slug, identificacao, temPortal, ativacoesPermitidas, linhasIniciais, linkPortal, linkSite, instrucoesNome, temInstrucoes, ordem, ativo, totalLicencas }]` (nunca os bytes).
  - `salvarSoftware(id|null, dados) → { ok: true, id } | { ok: false, erros: { campo: msg } }`; `dados = { nome, identificacao, temPortal, ativacoesPermitidas, linhasIniciais, linkPortal, linkSite, ordem, ativo, instrucoes: { nome, bytes, tipo }|null, apagarInstrucoes }`; `slug` derivado do nome (sem acento, minúsculas, hífens) na criação, imutável depois; nome repetido → `erros.nome = "Já existe um programa com esse nome."`; `linhasIniciais` 1..10; PDF acima de 5 MB → `erros.instrucoes`.
  - `excluirSoftware(id) → { ok } | { ok: false, erro: "Este programa tem N licença(s)." }`.
  - `listarLicencas({ softwareId, busca, soComVagaLivre = false, mostrarArquivadas = false, ordenar, direcao, pagina = 1, porPagina = 25 }) → { total, pagina, porPagina, linhas: LicencaProjetada[] }`: lê TODAS as licenças do programa com linhas (+cliente `{id,nome,documento}`, +pedido `{id,numero,canal}`), ativações e arquivos (sem bytes), projeta em memória, filtra (busca sem acento em identificador, nome do cliente, dígitos do documento, nome do PC, `nomeAnotado`), ordena com `ordenarLicencas` e pagina.
  - `LicencaProjetada = { id, softwareId, identificador, tipo, compradaEm, renovadaEm, observacoes, origem, arquivada, portalSituacao, portalExpiraEm, portalCriadaEm, portalLidoEm, portalSumiuEm, situacao, vagas, ultimoUso, clientes: [{ id, nome }] (das linhas ATIVAS, cliente ou nomeAnotado), avisos: string[] ("Sumiu do portal", "N PC(s) sem cliente", "Nome de PC repetido: X"), linhas: [{ id, ordem, cliente, nomeAnotado, data, canal, pedido, nomeDoPc, equipamento, observacoes, situacao, encerradaEm, ativacao: { hostname, so, criadaEm, ultimaSincronizacaoEm }|null }] (ATIVAS, por ordem), historico: [...ENCERRADAS], pcsSemCliente: [{ id, hostname, so, criadaEm, ultimaSincronizacaoEm }], arquivos: [{ id, versao, nomeOriginal, tamanhoBytes, sha256, atual, enviadoEm, enviadoPor, observacao }], arquivoAtual, ultimaEntrega (maior `data` das linhas) }`.
  - `lerLicenca(id) → LicencaProjetada|null`.
  - `criarLicenca({ softwareId, identificador, tipo, compradaEm, renovadaEm, observacoes, arquivo: { nome, bytes }|null, enviadoPor }) → { ok: true, id } | { ok: false, erro }`: identificador normalizado (`normalizarIdentificador`); repetido → `"A licença <X> já existe neste programa."`; programa ARQUIVO sem `arquivo` → `"Envie o arquivo da licença."`; com arquivo cria a versão 1 na mesma transação; `origem: "manual"`.
  - `editarLicenca(id, { tipo, compradaEm, renovadaEm, observacoes, arquivada })`.
  - `oQueSaiComALicenca(id) → { identificador, linhas, ativacoes, arquivos: [{ versao, nomeOriginal }] }` (para o popup).
  - `excluirLicenca(id) → { ok, resumo }`: numa transação apaga `arquivoDeLicenca` (deleteMany) e depois a licença (cascade leva linhas e ativações).
  - `criarLinha(licencaId, { clienteId, data, canal, pedidoDeVendaId, nomeDoPc, equipamento, observacoes }) → { ok: true, id } | { ok: false, erro }`: `"Escolha o cliente."`, `"O cliente precisa ter CPF ou CNPJ."`, `"Licença arquivada."`, pedido que não é do cliente → `"O pedido não é deste cliente."`; `ordem` = maior + 1; `nomeDoPc` aparado (a comparação normaliza, a gravação guarda como veio).
  - `editarLinha(id, dados)` (mesmas validações), `encerrarLinha(id)`, `reabrirLinha(id)`, `excluirLinha(id)`.
  - `buscarClientes(texto) → [{ id, nome, documento, nivel }]` (delega a `buscarClientesParaVincular`; a tela desabilita os sem documento).
  - `pedidosRecentesDoCliente(clienteId, dias = 180) → [{ id, numero, canal, dataDaVenda }]`.
  - `licencasDoCliente(clienteId) → [{ linhaId, licencaId, software: { nome, slug }, identificador, data, nomeDoPc, equipamento, situacao, encerradaEm }]`.
  - `frescorDoPrograma(softwareId) → { lidaEm: Date|null, ...frescorDaLeitura }` (última `LeituraDoPortal` completa).
  - `listarLeituras(softwareId, limite = 30)`.

- [ ] **Step 1: Escrever os testes** (criar na preparação um `Software` de teste nome `"ZZ Lic Chave"` /
  `slug "zz-lic-chave"` CHAVE com portal e 3 ativações, e um `"ZZ Lic Arquivo"` / `"zz-lic-arquivo"` ARQUIVO;
  clientes `"ZZ LIC Com Documento"` (CPF `529.982.247-25`) e `"ZZ LIC Sem Documento"`):

```js
const B = await import("../src/lib/ferramentas/licencas/banco.js");
conferir("programa: nome repetido recusado, slug derivado", [(await B.salvarSoftware(null, { nome: "ZZ Lic Chave", identificacao: "CHAVE" })).erros?.nome, (await B.listarSoftwares({ soAtivos: false })).find((s) => s.slug === "zz-lic-chave")?.identificacao], ["Já existe um programa com esse nome.", "CHAVE"]);
const nova = await B.criarLicenca({ softwareId: chaveId, identificador: " zz-lic-aaaa-1 ", tipo: "Core", compradaEm: R.lerDataIso("2026-11-01") });
conferir("licenca nova: chave em maiusculas e aparada, origem manual", [nova.ok, (await B.lerLicenca(nova.id)).identificador, (await B.lerLicenca(nova.id)).origem], [true, "ZZ-LIC-AAAA-1", "manual"]);
conferir("licenca repetida (outra caixa) recusada", (await B.criarLicenca({ softwareId: chaveId, identificador: "ZZ-LIC-AAAA-1" })).erro, "A licença ZZ-LIC-AAAA-1 já existe neste programa.");
conferir("programa ARQUIVO exige o arquivo", (await B.criarLicenca({ softwareId: arquivoId, identificador: "ZZ-LIC-M1" })).erro, "Envie o arquivo da licença.");
conferir("linha: sem cliente, cliente sem documento, com documento", [(await B.criarLinha(nova.id, {})).erro, (await B.criarLinha(nova.id, { clienteId: semDoc })).erro, (await B.criarLinha(nova.id, { clienteId: comDoc, nomeDoPc: " DESKTOP-ZZ ", canal: "MERCADO_LIVRE", data: R.lerDataIso("2026-11-02") })).ok], ["Escolha o cliente.", "O cliente precisa ter CPF ou CNPJ.", true]);
let lida = await B.lerLicenca(nova.id);
conferir("projecao: linha 1 com cliente, 'ainda nao ativou' (sem ativacao), nao lida", [lida.linhas.length, lida.linhas[0].cliente.nome, lida.linhas[0].nomeDoPc, lida.linhas[0].ativacao, lida.vagas.lida, lida.situacao.texto], [1, "ZZ LIC Com Documento", "DESKTOP-ZZ", null, false, "Não lida do portal"]);
await B.encerrarLinha(lida.linhas[0].id);
lida = await B.lerLicenca(nova.id);
conferir("encerrar: sai das linhas, entra no historico; reabrir volta", [lida.linhas.length, lida.historico.length, lida.historico[0].situacao], [0, 1, "ENCERRADA"]);
await B.reabrirLinha(lida.historico[0].id);
conferir("reaberta", (await B.lerLicenca(nova.id)).linhas.length, 1);
const lista = await B.listarLicencas({ softwareId: chaveId, busca: "com documento" });
conferir("lista: busca pelo nome do cliente acha a chave", lista.linhas.map((l) => l.identificador), ["ZZ-LIC-AAAA-1"]);
conferir("lista: busca pelos digitos do CPF", (await B.listarLicencas({ softwareId: chaveId, busca: "52998224725" })).total, 1);
await B.editarLicenca(nova.id, { arquivada: true });
conferir("arquivada some da lista e volta com mostrarArquivadas; linha nova recusada", [(await B.listarLicencas({ softwareId: chaveId })).total, (await B.listarLicencas({ softwareId: chaveId, mostrarArquivadas: true })).total, (await B.criarLinha(nova.id, { clienteId: comDoc })).erro], [0, 1, "Licença arquivada."]);
conferir("licencas do cliente", (await B.licencasDoCliente(comDoc)).map((l) => [l.identificador, l.situacao]), [["ZZ-LIC-AAAA-1", "ATIVA"]]);
conferir("o que sai com a licenca", await B.oQueSaiComALicenca(nova.id), { identificador: "ZZ-LIC-AAAA-1", linhas: 1, ativacoes: 0, arquivos: [] });
conferir("excluir programa com licencas recusado", (await B.excluirSoftware(chaveId)).erro, "Este programa tem 1 licença(s).");
conferir("excluir licenca", [(await B.excluirLicenca(nova.id)).ok, await B.lerLicenca(nova.id)], [true, null]);
```

- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar `banco.js`** (projeção numa função `projetarLicenca({ software, licenca, agora })` que
  chama as regras; `listarLicencas` em memória porque um programa tem no máximo algumas centenas de chaves).
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** — `git commit -m "feat(licencas): banco de programas, licencas e linhas de cliente"`

---

### Task 6: Banco: arquivo com versões, download e PDF de instruções

**Files:**
- Modify: `src/lib/ferramentas/licencas/banco.js`
- Create: `src/app/api/licencas/arquivo/[id]/route.js`, `src/app/api/licencas/instrucoes/[id]/route.js`
- Modify: `scripts/teste-licencas.js` (bloco "Banco: arquivo da licenca")

**Interfaces:**
- Consumes: `arquivos.js`, `sessaoDeAcessos`/`recusarRota` de `@/lib/acessos/servidor` (o mesmo molde de `src/app/api/compras/[id]/pdf/route.js`).
- Produces:
  - `enviarArquivo(licencaId, { nome, bytes, enviadoPor, observacao }) → { ok: true, versao } | { ok: false, erro }`: programa CHAVE → `"Este programa não usa arquivo de licença."`; usa `lerArquivoEnviado`; mesmo `sha256` da versão atual → `"Este arquivo já é a versão atual (mesmo conteúdo)."` (minha escolha); versão = maior + 1 calculada dentro da transação, repetida UMA vez em `P2002`; desmarca `atual` das anteriores e marca a nova.
  - `lerArquivoParaBaixar(licencaId, versao = null) → { ok: true, identificador, nomeOriginal, bytes, sha256 } | { ok: false, erro }`: a atual, ou a versão pedida; recalcula o sha256 e recusa com `"Soma de verificação não confere: avise antes de entregar."` se diferir.
  - `lerInstrucoes(softwareId) → { nome, bytes, tipo }|null`.
  - Rota `GET /api/licencas/arquivo/<licencaId>?versao=N`: `sessaoDeAcessos`, exige `tela.ferramentas.licencas ver` E `acao.ferramentas.licencas.arquivo executar` → `recusarRota()`; 404 sem licença; 500 com o texto quando a soma não confere; senão `montarZipDoArquivo` e `Content-Disposition: attachment; filename="<nome>.zip"`, `Cache-Control: private, no-store`.
  - Rota `GET /api/licencas/instrucoes/<softwareId>`: só `ver`; `attachment` com `instrucoesNome`.

- [ ] **Step 1: Escrever os testes**:

```js
const m1 = await B.criarLicenca({ softwareId: arquivoId, identificador: "ZZ-LIC-M1", arquivo: { nome: "Mach1Lic.dat", bytes: dat }, enviadoPor: "teste" });
let lic = await B.lerLicenca(m1.id);
conferir("arquivo v1 atual, 201 B, sha", [lic.arquivos.length, lic.arquivoAtual.versao, lic.arquivoAtual.tamanhoBytes, lic.arquivoAtual.sha256 === A.sha256Hex(dat)], [1, 1, 201, true]);
conferir("mesmo conteudo de novo: recusado", (await B.enviarArquivo(m1.id, { nome: "Mach1Lic.dat", bytes: dat })).erro, "Este arquivo já é a versão atual (mesmo conteúdo).");
const dat2 = Buffer.concat([dat, Buffer.from("2")]);
conferir("v2 pelo zip", (await B.enviarArquivo(m1.id, { nome: "x.zip", bytes: A.montarZipDoArquivo({ identificador: "ZZ-LIC-M1", nomeOriginal: "Mach1Lic.dat", bytes: dat2 }).bytes })).versao, 2);
lic = await B.lerLicenca(m1.id);
conferir("duas versoes, so a 2 atual, a 1 continua", [lic.arquivos.map((a) => [a.versao, a.atual]), lic.arquivoAtual.tamanhoBytes], [[[1, false], [2, true]], 202]);
conferir("duas versoes ao mesmo tempo: uma vira 3 e a outra 4", (await Promise.all([B.enviarArquivo(m1.id, { nome: "a.dat", bytes: Buffer.from("v3") }), B.enviarArquivo(m1.id, { nome: "a.dat", bytes: Buffer.from("v4") })])).map((r) => r.versao).sort(), [3, 4]);
conferir("baixar: atual e versao 1", [(await B.lerArquivoParaBaixar(m1.id)).bytes.length, (await B.lerArquivoParaBaixar(m1.id, 1)).bytes.equals(dat)], [2, true]);
await prisma.arquivoDeLicenca.updateMany({ where: { licencaId: m1.id, versao: 1 }, data: { sha256: "0".repeat(64) } });
conferir("soma que nao confere: recusa", (await B.lerArquivoParaBaixar(m1.id, 1)).erro, "Soma de verificação não confere: avise antes de entregar.");
conferir("programa CHAVE nao recebe arquivo", (await B.enviarArquivo(chaveLicId, { nome: "a.dat", bytes: dat })).erro, "Este programa não usa arquivo de licença.");
conferir("excluir licenca com arquivos: o popup lista as versoes e a exclusao leva tudo", [(await B.oQueSaiComALicenca(m1.id)).arquivos.length, (await B.excluirLicenca(m1.id)).ok, await prisma.arquivoDeLicenca.count({ where: { licencaId: m1.id } })], [4, true, 0]);
```

  (`chaveLicId` é uma licença CHAVE criada no bloco para esse fim, `ZZ-LIC-CHAVE-X`.)

- [ ] **Step 2: Rodar e ver falhar.** — [ ] **Step 3: Implementar** (`banco.js` e as duas rotas).
- [ ] **Step 4: Rodar e ver passar**; `npm run teste:acessos` → as rotas novas passam no guarda (`sessaoDeAcessos(` + `recusarRota(`).
- [ ] **Step 5: Commit** — `git commit -m "feat(licencas): arquivo da licenca com versoes, download em zip e PDF de instrucoes"`

---

### Task 7: Leitura do portal: chave, esquema, aplicação e rotas

**Files:**
- Create: `src/lib/ferramentas/licencas/chave.js` (cópia de `src/lib/compras/aliexpress/chave.js` com `SERVICO = "LIGHTBURN"` e prefixo `rise_lb_`)
- Create: `src/lib/ferramentas/licencas/esquema.js`, `src/lib/ferramentas/licencas/portal.js`
- Create: `src/app/api/licencas/lightburn/estado/route.js`, `src/app/api/licencas/lightburn/importar/route.js`
- Modify: `deploy/caddy/Caddyfile:96-103` (bloco `@extensaoLightBurn { path /api/licencas/lightburn/estado /api/licencas/lightburn/importar }` logo abaixo do do AliExpress, com o mesmo comentário adaptado)
- Modify: `scripts/teste-licencas.js` (bloco "Leitura do portal")

**Interfaces:**
- Produces:
  - `chave.js`: `gerarChaveDaExtensao() → { chave }` (`rise_lb_` + 24 bytes base64url), `conferirChaveDaExtensao(request) → { ok } | { ok: false, status: 401, erro }`, `estadoDaChave()` (mesmo retorno do AliExpress).
  - `esquema.js`: `lerCorpoDaLeitura(json) → { ok: true, dados } | { ok: false, erro: "licencas.0.chave: ..." }`; zod: `versao` texto ≤ 20, `lidoEm` datetime, `completa` boolean, `licencas` array ≤ 2000 de `{ idNoPortal: textoOuNulo(80), chave: texto(120).min(4), situacao: texto(40), expiraEm: datetime|null, criadaEm: datetime|null, ativacoesUsadas: int≥0|null, ativacoesPermitidas: int≥0|null, tipo: textoOuNulo(40), dados: record (padrão {}), ativacoes: array ≤ 50 de { idNoPortal: textoOuNulo(80), hostname: texto(200).min(1), so: textoOuNulo(120), criadaEm, ultimaSincronizacaoEm, leaseExpiraEm (datetime|null), dados } }`. Chave desconhecida descartada (o `z.object` padrão).
  - `portal.js`: `aplicarLeituraDoPortal({ softwareSlug = "lightburn", versao, lidoEm, completa, licencas, registrar = true }) → { ok: true, leituraId, resumo: { licencas, ativacoes, novas, alteradas, sumiram, pcsSemCliente } } | { ok: false, erro }`: `lidaEm = new Date(lidoEm)`; por chave: `upsert` por `(softwareId, identificador normalizado)` (nova nasce `origem: "portal"`), grava os `portal*` (`portalSituacao` em MAIÚSCULAS, `portalDados = dados`, `portalLidoEm = lidaEm`, `portalSumiuEm = null`), `tipo` só quando o payload traz; `alteradas` conta chaves já existentes cujo `portalSituacao`/`portalExpiraEm`/`portalAtivacoesUsadas` mudou ou que ganharam/perderam ativação; ativações por `(licencaId, chave = idNoPortal ?? normalizarNomeDoPc(hostname))` com `vistaEm = lidaEm`, `sumiuEm = null`; com `completa`: ativações da licença que não vieram ganham `sumiuEm = lidaEm` (só as ainda sem `sumiuEm`, contadas em `sumiram`), licenças do programa com `portalId` não nulo que não vieram ganham `portalSumiuEm = lidaEm`. **Nunca** toca `linhas`, `arquivos`, `renovadaEm`, `observacoes`, `compradaEm`, `arquivada`. Grava `LeituraDoPortal` e, com `registrar`, um `LogIntegracao` (`servico LIGHTBURN`, `metodo POST`, `endpoint "importar"`, `responseResumo = textoDoResumoDaLeitura`), e `registrarTeste("LIGHTBURN", { ok: true })`. `pcsSemCliente` = soma dos `pcsSemCliente` da projeção depois da gravação.
  - `estadoDaLeitura() → { ultimaLeituraEm: ISO|null, licencasNoRise: number }`.
  - Rotas: `GET …/estado` (igual à do AliExpress, com `estadoDaLeitura`); `POST …/importar` (teto 5 MB, `maxDuration = 120`, `lerCorpoDaLeitura`, 400 `"Formato inválido: …"`, resposta `{ ok: true, leituraId, ...resumo }`).

- [ ] **Step 1: Escrever os testes**. Preparação do bloco: criar pela Tarefa 5 a `ZZ-LIC-P1` no programa
  `zz-lic-chave` com `tipo "Core"`, `renovadaEm 2026-10-01`, `observacoes "digitado"` e uma linha do cliente
  `comDoc` com `nomeDoPc "desktop-zz"`. O helper `payload(opcoes)` monta o corpo com 2 chaves: `ZZ-LIC-P1` (ou
  `opcoes.chaveP1`), `tipo "Pro"` (ausente com `opcoes.semTipo`), situação `ACTIVE`, com os PCs `pc-1` (hostname
  `"DESKTOP-ZZ"`) e `pc-2` (hostname `"PC-2"`; fora com `opcoes.semPc2`), e `ZZ-LIC-P2` sem PC (fora com
  `opcoes.semP2`); `completa` = `opcoes.completa ?? true`.

```js
const P = await import("../src/lib/ferramentas/licencas/portal.js");
const E = await import("../src/lib/ferramentas/licencas/esquema.js");
const K = await import("../src/lib/ferramentas/licencas/chave.js");
conferir("esquema: chave curta e hostname vazio recusados; chave desconhecida descartada", [E.lerCorpoDaLeitura({ ...payload(), licencas: [{ ...payload().licencas[0], chave: "AB" }] }).erro?.startsWith("licencas.0.chave"), E.lerCorpoDaLeitura({ ...payload(), licencas: [{ ...payload().licencas[0], ativacoes: [{ hostname: "" }] }] }).ok, "email" in (E.lerCorpoDaLeitura({ ...payload(), email: "x" }).dados ?? {})], [true, false, false]);
const r1 = await P.aplicarLeituraDoPortal({ ...payload({ chaveP1: " zz-lic-p1 " }), registrar: false });
conferir("1a leitura: P1 casa com a existente (outra caixa), P2 nasce do portal", [r1.resumo.licencas, r1.resumo.novas, (await B.lerLicenca(p1Id)).origem, (await prisma.licenca.findFirst({ where: { identificador: "ZZ-LIC-P2" } }))?.origem], [2, 1, "manual", "portal"]);
let p1 = await B.lerLicenca(p1Id);
conferir("P1: portal gravado, tipo do portal venceu, digitado intacto, PC casou com a linha, 1 PC sem cliente, 1 livre", [p1.portalSituacao, p1.tipo, p1.observacoes, p1.renovadaEm?.toISOString().slice(0, 10), p1.linhas[0].ativacao?.hostname, p1.pcsSemCliente.map((a) => a.hostname), p1.vagas], ["ACTIVE", "Pro", "digitado", "2026-10-01", "DESKTOP-ZZ", ["PC-2"], { permitidas: 3, usadas: 2, livres: 1, lida: true }]);
const r2 = await P.aplicarLeituraDoPortal({ ...payload({ semPc2: true, completa: false }), registrar: false });
conferir("leitura incompleta: atualiza, nao marca sumido", [r2.resumo.sumiram, (await B.lerLicenca(p1Id)).vagas.usadas], [0, 2]);
const r3 = await P.aplicarLeituraDoPortal({ ...payload({ semPc2: true, semP2: true }), registrar: false });
p1 = await B.lerLicenca(p1Id);
conferir("leitura completa: PC-2 sumiu (nao conta, fica no banco), P2 sumiu do portal, 'alteradas' conta P1", [r3.resumo.sumiram, p1.vagas.usadas, await prisma.ativacaoDeLicenca.count({ where: { licencaId: p1Id } }), (await prisma.licenca.findFirst({ where: { identificador: "ZZ-LIC-P2" } })).portalSumiuEm !== null, r3.resumo.alteradas >= 1], [1, 1, 2, true, true]);
await P.aplicarLeituraDoPortal({ ...payload(), registrar: false });
conferir("reaparecer limpa sumiuEm e portalSumiuEm", [(await B.lerLicenca(p1Id)).vagas.usadas, (await prisma.licenca.findFirst({ where: { identificador: "ZZ-LIC-P2" } })).portalSumiuEm], [2, null]);
conferir("a leitura nunca toca linhas nem renovadaEm", [(await B.lerLicenca(p1Id)).linhas.length, (await B.lerLicenca(p1Id)).renovadaEm?.toISOString().slice(0, 10)], [1, "2026-10-01"]);
await P.aplicarLeituraDoPortal({ ...payload({ semTipo: true }), registrar: false });
conferir("tipo ausente no payload nao apaga o gravado", (await B.lerLicenca(p1Id)).tipo, "Pro");
const { chave } = await K.gerarChaveDaExtensao();
const req = (auth) => new Request("https://x/api", { headers: auth ? { authorization: auth } : {} });
conferir("chave: prefixo, confere, recusa", [chave.startsWith("rise_lb_"), (await K.conferirChaveDaExtensao(req(`Bearer ${chave}`))).ok, (await K.conferirChaveDaExtensao(req("Bearer rise_lb_errada"))).status, (await K.conferirChaveDaExtensao(req(null))).status], [true, true, 401, 401]);
conferir("estado da leitura", typeof (await P.estadoDaLeitura()).licencasNoRise, "number");
```

- [ ] **Step 2: Rodar e ver falhar.** — [ ] **Step 3: Implementar** os quatro módulos, as duas rotas e o Caddyfile.
- [ ] **Step 4: Rodar e ver passar**; `npm run teste:acessos` → passa (as rotas chamam `conferirChaveDaExtensao(`).
- [ ] **Step 5: Commit** — `git commit -m "feat(licencas): leitura do portal da LightBurn (chave da extensao, esquema, aplicacao e rotas)"`

---

### Task 8: Importação das planilhas e da pasta

**Files:**
- Create: `src/lib/ferramentas/licencas/importacao.js` (puro)
- Modify: `src/lib/ferramentas/licencas/banco.js` (`aplicarPlanoDeImportacao`)
- Create: `scripts/importar-licencas.js`
- Create: `scripts/fixtures/licencas/geral.json`, `maquinas.json`, `mach3.json` (cada um `{ linhas: string[][], mesclas: ["A2:A5", ...] }`, com nomes inventados e os CPFs de teste, cobrindo: `#`, célula vazia, `dd/mm/aaaa`, `dd/mm/aa`, `06/20`, CPF de 10 dígitos, arrastão `…060/061/062`, `USUARIO-PC\t\r`, endereço no molde e o `"… - CP: 06740556"`, Renovação mesclada vazia, `"Renovada dia 30/11/22"`, `"Nao usa mais"`, `"Não usa mais"`, `"nao usa +"`, `"Em uso"`, `"Ajustado"`, linhas repetidas idênticas, linha só com `#`, linha inteira vazia, cabeçalho na linha 2 na aba das máquinas)
- Modify: `scripts/teste-licencas.js` (blocos "Importacao: leitura da planilha" e "Importacao: aplicar e idempotencia")

**Interfaces:**
- Consumes: `validarCpf`, `validarCnpj`, `formatarCpf`, `formatarCnpj`, `formatarCep`, `UFS` de `@/lib/documentos`; `telefoneParaGravar` de `@/lib/telefone`.
- Produces (`importacao.js`, puro sobre `string[][]`):
  - `preencherMescladas(linhas, mesclas) → string[][]` (copia o valor do canto superior esquerdo de cada `"A2:A5"` para as demais células do bloco).
  - `valorDaCelula(texto) → string|null` (`#`, vazio e só espaços → `null`; apara; tira `\t\r`).
  - `lerDataDaPlanilha(texto) → { data: "YYYY-MM-DD"|null, observacao: string|null }` (`dd/mm/aaaa`; `dd/mm/aa` → `20aa`; `mm/aa` → `{ null, "Data na planilha: 06/20" }`; outro texto → `{ null, "Data na planilha: <texto>" }`).
  - `lerDocumentoDaPlanilha(texto) → { documento: string|null, motivo: null|"sem CPF na planilha"|"CPF inválido na planilha: <texto>" }` (aceita `"CPF 123…"`, `"CNPJ …"`, só dígitos, formatado; 10 dígitos ganham `0` à esquerda; 11 → CPF, 14 → CNPJ, validados e formatados).
  - `UF_POR_NOME` (27 estados, chave sem acento e minúscula) e `lerEnderecoDaPlanilha(texto) → { logradouro, cidade, uf, cep }|null` (molde `^(.+), (.+) - CEP: (\d{8}), (.+)$`; fora do molde → `{ logradouro: texto, cidade: null, uf: null, cep: null }`).
  - `canalDaPlanilha(texto) → { canal, observacao }` (regra dos Global Constraints; vazio → `{ null, null }`; desconhecido → `{ null, "Canal na planilha: X" }`).
  - `situacaoDaPlanilha(texto) → "ATIVA"|"ENCERRADA"` (`/n[aã]o usa/i` → ENCERRADA).
  - `lerAbaGeral(linhas) → EntradaGeral[]` (cabeçalho na linha 1: `Key | Tipo(Core ou Pro) | Data | Nome | Dados | Telefone | Email | Equipamento | Nome do PC | Canal de venda | Renovação? | Endereço | <M: observação>`; colunas achadas pelo PREFIXO do cabeçalho sem acento; linha sem Key ou só com `#`/vazios depois da Key é ignorada).
  - `lerAbaMaquinas(linhas) → EntradaMaquina[]` (acha a linha do cabeçalho `Data | Nome | CPF | Tel | Email | Key | Loja | Pedido Bling | <I: em uso>`; `Loja` com `/renovad|renovac/i` vira `renovacaoTexto` e observação, senão canal; `Pedido Bling` → `equipamento`).
  - `lerAbaMach3(linhas) → EntradaMach3[]` (`Key | Software | Data | Nome | Dados | Telefone | Email | Canal de venda | Endereço`).
  - `montarPlano({ geral, maquinas, mach3, arquivosMach3: [{ identificador, nomeOriginal, bytes }] }) → { licencas: [{ software: "lightburn"|"mach3", identificador, tipo, renovadaEm, observacoes, arquivo, linhas: [{ ordem, cliente: { nome, documento, telefone, email, endereco }|null, nomeAnotado, data, canal, nomeDoPc, equipamento, observacoes, situacao }] }], avisos: string[] }`: agrupa por identificador (chave normalizada `CHAVE`); arrastão (mesmo nome, documentos iguais exceto o último dígito, na mesma chave) usa o primeiro válido; `renovadaEm` = `Renovação?` (ou o `"Renovada dia dd/mm/aa"` da aba antiga); pasta sem linha na planilha → licença com uma linha `nomeAnotado` = parte do nome antes do código (`"ALTAVE V53T"` → `"ALTAVE"`; `"ASSOCIACAO SAO BENTO DE ENSINO/Mach3 2FHX"` → `"ASSOCIACAO SAO BENTO DE ENSINO"`) e observação `"sem CPF na planilha"`; linha da planilha do Mach3 sem pasta → aviso.
- Produces (`banco.js`): `aplicarPlanoDeImportacao(plano, { simular = false }) → { licencas: { novas, existentes }, linhas: { novas, existentes }, clientes: { criados, ligados }, semCliente: [{ identificador, nome, motivo }], arquivos: { novos, existentes }, avisos }`: programa pelo `slug` do plano; licença por `(software, identificador)` (`origem: "planilha"` só na criação; `tipo`/`renovadaEm`/`observacoes` só preenchidos se vazios); **linha é idempotente por `(licencaId, ordem)`**: existe → não mexe; cliente por `documento` (existente ligado sem mexer; inexistente criado com `tipoPessoa` pelo tamanho, `nome`, `documento`, `telefone` só se válido, `email`, endereço GERAL); arquivo por `(licencaId, sha256)`.
- Produces (`scripts/importar-licencas.js`): `node scripts/importar-licencas.js --lightburn=<xlsx> --mach3=<xlsx> --pasta=<pasta> --pdf=<pdf> --simular|--confirmo`; lê as abas `"Licencas em geral"` e `"Licencas maquinas 4hobby"` (e `"Página1"` do Mach3) com `exceljs` (`workbook.xlsx.readFile`; cada aba vira `string[][]` com `Date` → `dd/mm/aaaa` em UTC, número → texto, rich text → texto; `worksheet.model.merges` → `mesclas`); **nunca lê a aba "Link controle licencas"**; a pasta: cada `.zip` vira `{ identificador: nome sem .zip }` por `lerZipDeUmArquivo`, cada subpasta vira `{ identificador: nome da pasta }` com o único arquivo dentro (subpasta dentro de subpasta: `"<pai>/<filha>"`); o PDF vai para `Software.instrucoes*` do Mach3 (só se vazio); imprime o resumo; sem flag sai com código 2 e a ajuda; na VPS roda como os outros (`docker compose exec -T app node scripts/importar-licencas.js …` com os arquivos levados por `scp` para `/srv/rise/app/dados/licencas-importacao/`).

- [ ] **Step 1: Escrever os testes de leitura** (pelas fixtures; os `FIX_*` são constantes do teste com os valores da fixture):

```js
const I = await import("../src/lib/ferramentas/licencas/importacao.js");
const fx = (n) => JSON.parse(readFileSync(new URL(`./fixtures/licencas/${n}.json`, import.meta.url), "utf8"));
conferir("mescladas preenchidas para baixo", I.preencherMescladas([["K1", "a"], ["", "b"], ["K2", "c"]], ["A1:A2"]).map((l) => l[0]), ["K1", "K1", "K2"]);
conferir("celula", [I.valorDaCelula("#"), I.valorDaCelula("  "), I.valorDaCelula("USUARIO-PC\t\r")], [null, null, "USUARIO-PC"]);
conferir("datas", [I.lerDataDaPlanilha("29/10/2026").data, I.lerDataDaPlanilha("30/11/22").data, I.lerDataDaPlanilha("06/20"), I.lerDataDaPlanilha("#")], ["2026-10-29", "2022-11-30", { data: null, observacao: "Data na planilha: 06/20" }, { data: null, observacao: null }]);
conferir("documento: CPF, CNPJ, 10 digitos ganha zero, invalido, ausente", [I.lerDocumentoDaPlanilha("CPF 52998224725").documento, I.lerDocumentoDaPlanilha("CNPJ 11222333000181").documento, I.lerDocumentoDaPlanilha("CPF 1234567890").documento, I.lerDocumentoDaPlanilha("CPF 00000000000").motivo, I.lerDocumentoDaPlanilha("#").motivo], ["529.982.247-25", "11.222.333/0001-81", "012.345.678-90", "CPF inválido na planilha: CPF 00000000000", "sem CPF na planilha"]);
conferir("endereco no molde e fora dele", [I.lerEnderecoDaPlanilha("Rua das Violetas 124 124, Foz do Iguaçu - CEP: 85853540, Paraná"), I.lerEnderecoDaPlanilha("Rua Cisplatina, 126 - Vargem Grande Paulista - São Paulo - CP: 06740556").cidade], [{ logradouro: "Rua das Violetas 124 124", cidade: "Foz do Iguaçu", uf: "PR", cep: "85853-540" }, null]);
conferir("canal", [I.canalDaPlanilha("ML"), I.canalDaPlanilha("ML4H"), I.canalDaPlanilha("4H"), I.canalDaPlanilha("loja").canal, I.canalDaPlanilha("")], [{ canal: "MERCADO_LIVRE", observacao: null }, { canal: "MERCADO_LIVRE", observacao: "Canal na planilha: ML4H" }, { canal: "DIRETA", observacao: "Canal na planilha: 4H" }, "DIRETA", { canal: null, observacao: null }]);
conferir("situacao", ["Nao usa mais", "Não usa mais", "nao usa +", "Em uso", "Ajustado", ""].map(I.situacaoDaPlanilha), ["ENCERRADA", "ENCERRADA", "ENCERRADA", "ATIVA", "ATIVA", "ATIVA"]);
const geral = I.lerAbaGeral(I.preencherMescladas(fx("geral").linhas, fx("geral").mesclas));
conferir("aba geral: N entradas, chave herdada, linha so com # ignorada", [geral.length, geral[1].chave === geral[0].chave, geral.some((e) => e.nome === null && e.data === null)], [FIX_GERAL_ENTRADAS, true, false]);
const plano = I.montarPlano({ geral, maquinas: I.lerAbaMaquinas(fx("maquinas").linhas), mach3: I.lerAbaMach3(fx("mach3").linhas), arquivosMach3: [{ identificador: "Mach3 VD60", nomeOriginal: "Mach1Lic.dat", bytes: dat }, { identificador: "ALTAVE V53T", nomeOriginal: "Mach1Lic.dat", bytes: dat }] });
conferir("plano: licencas por programa", [plano.licencas.filter((l) => l.software === "lightburn").length, plano.licencas.filter((l) => l.software === "mach3").length], [FIX_LB_LICENCAS, 2]);
conferir("plano: arrastao usa o primeiro CPF nas tres linhas", new Set(plano.licencas.find((l) => l.identificador === FIX_CHAVE_ARRASTAO).linhas.map((x) => x.cliente.documento)).size, 1);
conferir("plano: linhas identicas entram todas; sem CPF vira nomeAnotado", [plano.licencas.find((l) => l.identificador === FIX_CHAVE_TRIPLA).linhas.length, plano.licencas.find((l) => l.identificador === FIX_CHAVE_ANTIGA).linhas[0]], [3, { ordem: 1, cliente: null, nomeAnotado: "Fulano Antigo", data: "2020-03-01", canal: "DIRETA", nomeDoPc: "DESKTOP-8R9KEM1", equipamento: "01Cuia /01plana", observacoes: "Canal na planilha: 4H; sem CPF na planilha", situacao: "ATIVA" }]);
conferir("plano: aba das maquinas (renovada dia, loja, pedido bling)", plano.licencas.find((l) => l.identificador === FIX_CHAVE_MAQUINA).renovadaEm, "2022-11-30");
conferir("plano: pasta sem planilha vira nomeAnotado", plano.licencas.find((l) => l.identificador === "ALTAVE V53T").linhas[0].nomeAnotado, "ALTAVE");
```

- [ ] **Step 2: Rodar e ver falhar.** — [ ] **Step 3: Implementar `importacao.js`.** — [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Escrever os testes de aplicação**. `planoZZ` = o plano das fixtures com os identificadores trocados
  para `ZZ-LIC-*` e os nomes para `"ZZ LIC *"`, em que UMA linha traz o CPF `529.982.247-25` (o cliente
  `"ZZ LIC Com Documento"` já existe → `ligados`) e outra traz `"ZZ LIC Criado"` com `012.345.678-90`, telefone
  `"(46) 98201-0550"` e o endereço no molde de Foz do Iguaçu (→ `criados`). `planoZZ2` tem uma licença `ZZ-LIC-SIM`.

```js
const r1 = await B.aplicarPlanoDeImportacao(planoZZ);
conferir("aplicar: cria licencas, linhas, clientes; existente ligado sem mexer", [r1.licencas.novas, r1.linhas.novas, r1.clientes.criados, r1.clientes.ligados, r1.semCliente.length, r1.arquivos.novos], [FIX_ZZ_LICENCAS, FIX_ZZ_LINHAS, FIX_ZZ_CRIADOS, 1, FIX_ZZ_SEM_CLIENTE, 2]);
conferir("cliente criado com endereco e telefone so digitos", await prisma.cliente.findUnique({ where: { documento: "012.345.678-90" }, select: { telefone: true, enderecos: { select: { tipo: true, uf: true, cep: true } } } }), { telefone: "46982010550", enderecos: [{ tipo: "GERAL", uf: "PR", cep: "85853-540" }] });
const r2 = await B.aplicarPlanoDeImportacao(planoZZ);
conferir("idempotente: segunda vez nao cria nada", [r2.licencas.novas, r2.linhas.novas, r2.clientes.criados, r2.arquivos.novos], [0, 0, 0, 0]);
conferir("simular nao grava", [(await B.aplicarPlanoDeImportacao(planoZZ2, { simular: true })).licencas.novas, await prisma.licenca.count({ where: { identificador: "ZZ-LIC-SIM" } })], [1, 0]);
```

- [ ] **Step 6: Implementar `aplicarPlanoDeImportacao` e `scripts/importar-licencas.js`.** Rodar o teste → passa.
  Conferir o script sem banco: `node scripts/importar-licencas.js` sem flags → sai com código 2 e a ajuda.
- [ ] **Step 7: Commit** — `git commit -m "feat(licencas): importacao das planilhas do LightBurn e do Mach3 e da pasta de arquivos"`

---

### Task 9: A tela `/ferramentas/licencas`

**Files:**
- Create: `src/app/ferramentas/licencas/page.jsx`, `src/app/ferramentas/licencas/acoes.js`
- Create: `src/components/ui/EscolhaEntreOpcoes.jsx`; Modify: `src/components/cadastros/FormularioCliente.jsx:68-95` (`EscolhaDoTipo` passa a renderizar `EscolhaEntreOpcoes` com `nome="tipoPessoa"`, `rotulo="Tipo da pessoa"`, `opcoes={TIPOS}`; nenhuma outra mudança)
- Create em `src/components/ferramentas/licencas/`: `TelaDeLicencas.jsx` (abas, selo, links, ⋮, filtros, "Nova licença"), `TabelaDeLicencas.jsx` (colunas por `identificacao`, `CabecalhoOrdenavel`, linha expandida), `LinhasDaLicenca.jsx` (linhas de cliente, PCs sem cliente, histórico, Versões do arquivo, botões), `JanelaVincularCliente.jsx`, `JanelaLicenca.jsx` (nova e editar), `JanelaEnviarArquivo.jsx`, `JanelaProgramas.jsx`, `JanelaHistoricoDeLeituras.jsx`, `SeloDaLeitura.jsx`
- Reuse: `Pergunta` (`@/components/compras/Pergunta`, default export `{ titulo, children, confirmar, recuar, destrutiva, aoConfirmar, aoRecuar, ocupado }`) para "Sair sem salvar?", Encerrar e os popups de exclusão; `Copiar`, `BolhaDeAjuda`, `ConclusaoDoEnvio`, `NavegacaoDoTopo`, `LinkDeVolta`, `PageHeader`, `propsDoFundo`.

**Interfaces:**
- Consumes: tudo de `banco.js` (Tarefas 5, 6), `regras.js`, `porPaginaDaUrl`/`parametrosDaOrdenacao`.
- Produces (`acoes.js`, cada uma começando com `negarSemAcessos(["tela.ferramentas.licencas", "editar"])`, salvo
  as de leitura que exigem `ver`): `criarLicencaAcao(dados)`, `editarLicencaAcao(id, dados)`,
  `oQueSaiComALicencaAcao(id)` (ver), `excluirLicencaAcao(id)`, `criarLinhaAcao(licencaId, dados)`,
  `editarLinhaAcao(id, dados)`, `encerrarLinhaAcao(id)`, `reabrirLinhaAcao(id)`, `excluirLinhaAcao(id)`,
  `enviarArquivoAcao(formData)` (`licencaId`, `arquivo`, `observacao`; `enviadoPor` = login da sessão),
  `buscarClientesAcao(texto)` (ver; projeta com `projetarClientesDaBusca`), `pedidosDoClienteAcao(clienteId)` (ver),
  `salvarProgramaAcao(formData)`, `excluirProgramaAcao(id)`, `listarLeiturasAcao(softwareId)` (ver). Datas chegam
  como `"YYYY-MM-DD"` e passam por `lerDataIso`. Toda ação termina em `revalidatePath("/ferramentas/licencas")` e
  devolve `{ ok, ... }` ou `{ ok: false, erro }`.
- Página: `exigirAcessoNaPagina("tela.ferramentas.licencas", "ver")`; `podeEditar = pode(..., "editar")`,
  `podeBaixar = pode("acao.ferramentas.licencas.arquivo", "executar")`; `searchParams`: `programa` (slug, padrão o
  de menor `ordem`), `busca`, `vaga=1`, `arquivadas=1`, `ordenar`, `direcao`, `pagina`, `por`; carrega
  `listarSoftwares`, `listarLicencas`, `frescorDoPrograma` e passa tudo serializado (datas em ISO) a `TelaDeLicencas`.

- [ ] **Step 1: Linha-guia e desenho** — escrever no cabeçalho de `TelaDeLicencas.jsx`: "nesta tela o operador vê
  primeiro quais chaves têm vaga livre e se a leitura do portal é recente; a ação principal é Vincular cliente".
  Chamar a skill `frontend-design` com as 10 regras e a spec §6.6 como restrição para o desenho das duas tabelas e
  das janelas (sem mockup em HTML: direto nos componentes).

- [ ] **Step 2: `acoes.js` e `page.jsx`** com as assinaturas acima. `npm run teste:acessos` → o guarda estático
  aceita (página com `exigirAcessoNaPagina(`, ações com `negarSemAcessos(` em cada export).

- [ ] **Step 3: `EscolhaEntreOpcoes`** — `({ nome, rotulo, opcoes, valor, aoMudar })` com o mesmo JSX do
  `EscolhaDoTipo` de hoje; `FormularioCliente` passa a usá-lo. `npm run teste:cadastros` → passa.

- [ ] **Step 4: Componentes** na ordem: `SeloDaLeitura` → `TabelaDeLicencas` (LightBurn: Chave com `Copiar`, Tipo,
  Situação (ponto + texto), Ativações ("1 de 3" + "2 livres"/"cheia"/"não lida"), Último uso, Clientes, Renovada em,
  seta; Mach3: Nome licenciado, Arquivo ("v2 · Mach1Lic.dat · 201 B" + Baixar, desabilitado sem `podeBaixar` com o
  motivo no `title`), Clientes, Última entrega, seta; "!" âmbar com os `avisos` no `title`) → `LinhasDaLicenca`
  (`linhasIniciais` de saída, vazias como "(sem cliente)" com o botão Vincular cliente; colunas da spec; "PCs sem
  cliente" com "Atribuir à linha…"; histórico dobrado; Versões do arquivo no Mach3; "Adicionar linha", "Editar
  licença", "Enviar arquivo") → janelas (`JanelaVincularCliente`: busca com `buscarClientesAcao` debounce 300 ms,
  sem documento desabilitado com `title="sem CPF/CNPJ"`, link "Cadastrar cliente" para `/cadastros/clientes/novo`
  em nova aba, Data padrão hoje, Canal por `EscolhaEntreOpcoes` com `CANAIS_DA_LICENCA`, Pedido por
  `pedidosDoClienteAcao`, Nome do PC (pré-preenchido quando vem de "Atribuir à linha…"), Equipamento, Observações,
  "Sair sem salvar?" via `Pergunta`; `JanelaLicenca` com `datalist` dos `tipo` distintos do programa;
  `JanelaEnviarArquivo` com `ConclusaoDoEnvio` no sucesso; `JanelaProgramas`; `JanelaHistoricoDeLeituras`) →
  `TelaDeLicencas` (abas por programa via `?programa=`, selo só com portal, botões de link `target="_blank"
  rel="noopener"`, "Instruções (PDF)" para `/api/licencas/instrucoes/<id>` só com `temInstrucoes`, ⋮ com Programas
  (só `podeEditar`) e Histórico de leituras, filtros, `NavegacaoDoTopo`).

- [ ] **Step 5: Conferir no navegador** (`preview_start` do `npm run dev`, `/ferramentas` → cartão → tela): com os
  dados do `npm run teste:licencas -- --manter`: as duas abas, a linha expandida, Vincular cliente de ponta a ponta,
  Enviar arquivo e Baixar (o zip abre com `Mach3 …/Mach1Lic.dat`), Programas, "Sair sem salvar?", o popup de
  exclusão listando linhas e versões, largura de notebook. Passar por `ecc:make-interfaces-feel-better`. Tirar um
  screenshot de cada aba para o dono.

- [ ] **Step 6: Commit** — `git commit -m "feat(licencas): tela Licencas Softwares em Ferramentas (abas, tabelas, linhas de cliente, janelas)"`

---

### Task 10: Aba "Licenças (N)" no Cliente e cartão "LightBurn" em Integrações

**Files:**
- Create: `src/components/ferramentas/licencas/TabelaLicencasDoCliente.jsx`
- Modify: `src/components/cadastros/FormularioCliente.jsx` (prop `licencas = null`; aba `{ id: "licencas", rotulo: \`Licenças (${licencas.length})\` }` depois de Pedidos; `Painel id="licencas"`), `src/app/cadastros/[tipo]/[id]/page.jsx:157-161` (carrega `licencasDoCliente(id)` quando `pode("tela.ferramentas.licencas", "ver")`)
- Create: `src/components/integracoes/CartaoLightBurn.jsx` (cópia de `CartaoAliExpress.jsx` sem o fornecedor; ícone `KeyRound`; bolha "Como instalar" apontando para `extensao-lightburn`; "Última leitura: dd/mm hh:mm · <resumo>")
- Modify: `src/app/integracoes/page.jsx:40-56` (estado da chave LIGHTBURN + última `LeituraDoPortal`), `src/app/integracoes/acoes.js` (`gerarChaveLightBurnAcao`, igual à do AliExpress)
- Modify: `scripts/teste-licencas.js` (bloco "Aba do cliente e cartao")

**Interfaces:**
- Consumes: `licencasDoCliente`, `estadoDaChave`/`gerarChaveDaExtensao` de `licencas/chave.js`, `listarLeituras`.
- Produces: `TabelaLicencasDoCliente({ linhas })` (programa, identificador com link para `/ferramentas/licencas?programa=<slug>&busca=<identificador>`, data, PC, equipamento, situação).

- [ ] **Step 1: Teste**:

```js
conferir("licencas do cliente para a aba trazem a P1", (await B.licencasDoCliente(comDoc)).some((l) => l.software.slug === "zz-lic-chave" && l.identificador === "ZZ-LIC-P1"), true);
conferir("estado da chave LIGHTBURN e ultima leitura", [(await K.estadoDaChave()).configurada, (await B.listarLeituras(chaveId, 1)).length], [true, 1]);
```

- [ ] **Step 2: Implementar**; conferir no navegador: cadastro de um cliente com licença mostra a aba e o link
  leva à tela filtrada; Integrações mostra o cartão, "Gerar chave da extensão" devolve `rise_lb_…` uma vez.
- [ ] **Step 3: Rodar** `npm run teste:licencas`, `npm run teste:cadastros`, `npm run teste:acessos` → passam.
- [ ] **Step 4: Commit** — `git commit -m "feat(licencas): aba Licencas no cliente e cartao LightBurn em Integracoes"`

---

### Task 11: A extensão "Rise LightBurn"

**Files:**
- Create: `extensao-lightburn/manifest.json`, `fundo.js`, `ponte.js`, `pagina.js`, `leitura.js`, `popup.html`, `popup.js`, `LEIAME.md`
- Create: `scripts/teste-extensao-lightburn.js`
- Consumes: `extensao-lightburn/MEDICAO.md` e as fixtures da Tarefa 1; o formato do payload da Tarefa 7.

**Interfaces:**
- `manifest.json`: `name "Rise LightBurn"`, `version "1.0.0"`, `permissions ["storage", "activeTab"]`,
  `host_permissions ["https://lightburn.customer.cryptlex.com/*", "<host da API medido, se outro>", "https://rise.4hobby.com.br/*", "https://localhost:3000/*"]`,
  `content_scripts`: `ponte.js` (ISOLATED) e `leitura.js` + `pagina.js` (`world: "MAIN"`) em `https://lightburn.customer.cryptlex.com/*`, `document_idle`.
- `fundo.js`: igual ao do AliExpress com `CAMINHOS = { "GET /api/licencas/lightburn/estado", "POST /api/licencas/lightburn/importar" }`.
- `ponte.js`: igual, com os rótulos `"LB-PARA-PAGINA"`/`"LB-DA-PAGINA"`.
- `leitura.js` (global `RiseLeituraLB`, sem `export`): `licencaDoPortal(json) → { idNoPortal, chave, situacao, expiraEm, criadaEm, ativacoesUsadas, ativacoesPermitidas, tipo, dados }`, `ativacaoDoPortal(json) → { idNoPortal, hostname, so, criadaEm, ultimaSincronizacaoEm, leaseExpiraEm, dados }`, `situacaoDoPortal(licenca) → string` (a palavra do portal em maiúsculas, ou a regra medida `revoked → "REVOKED"`, `suspended → "SUSPENDED"`, `expiresAt < agora → "EXPIRED"`, senão `"ACTIVE"`), `tipoDoPortal(licenca) → "Core"|"Pro"|null` (pela regra da MEDICAO.md), `dataIso(valor) → ISO|null`, `limparDados(json) → objeto` (as demais colunas, SEM `email`, `name`, `userId`, `user*`), `montarPayload({ licencas, ativacoesPorLicenca, completa, versao }) → corpo`, `textoDoResumo(corpo) → string`.
- `pagina.js` (MAIN): acha o token como medido; `fetch` à API como a página faz (mesmos cabeçalhos), página a página (`limit` do portal, teto 200 chamadas por clique, 1–2 s entre elas), licenças e ativações (todas ou por licença, conforme medido); página que falha → `completa: false` e segue; `GET …/estado` só para o resumo; `POST …/importar`; `avisar("fim", { ok: true, texto: textoDoResumo(resposta) })`. Reserva (só se a MEDICAO.md disser que a API não pode ser repetida): leitura da tabela pelo DOM, mesma saída.
- `popup.js`: `abaDoPortal` por `^https:\/\/lightburn\.customer\.cryptlex\.com\//`; `title` "Abra o portal das licenças da LightBurn e entre"; placeholder da chave `rise_lb_…`.

- [ ] **Step 1: Escrever `scripts/teste-extensao-lightburn.js`** (molde do `teste-extensao-aliexpress.js`, carregando `leitura.js` em `vm`):

```js
const lic = puro(L.licencaDoPortal(fixture("licencas")[0]));
conferir("licenca do portal -> payload", [lic.chave, lic.situacao, lic.ativacoesPermitidas, typeof lic.expiraEm, "email" in lic.dados], [FIX_CHAVE_1, FIX_SITUACAO_1, 3, "string", false]);
conferir("tipo Core/Pro pela regra medida", fixture("licencas").map((l) => L.tipoDoPortal(l)), FIX_TIPOS);
conferir("situacao: revogada, suspensa, expirada, ativa", [L.situacaoDoPortal({ revoked: true }), L.situacaoDoPortal({ suspended: true }), L.situacaoDoPortal({ expiresAt: "2020-01-01T00:00:00Z" }), L.situacaoDoPortal({ expiresAt: "2099-01-01T00:00:00Z" })], ["REVOKED", "SUSPENDED", "EXPIRED", "ACTIVE"]);
const at = puro(L.ativacaoDoPortal(fixture("ativacoes")[0]));
conferir("ativacao do portal -> payload", [at.hostname, at.so, at.ultimaSincronizacaoEm], [FIX_HOST_1, FIX_SO_1, FIX_SYNC_1]);
conferir("datas", [L.dataIso(FIX_DATA_DO_PORTAL), L.dataIso(null), L.dataIso("lixo")], [FIX_DATA_ISO, null, null]);
const corpo = puro(L.montarPayload({ licencas: fixture("licencas"), ativacoesPorLicenca: { [FIX_ID_1]: fixture("ativacoes") }, completa: true, versao: "1.0.0" }));
conferir("payload inteiro", [corpo.completa, corpo.licencas.length, corpo.licencas[0].ativacoes.length, Object.keys(corpo).sort()], [true, fixture("licencas").length, fixture("ativacoes").length, ["completa", "licencas", "lidoEm", "versao"]]);
conferir("resumo", L.textoDoResumo({ licencas: 78, novas: 2, alteradas: 0, sumiram: 1, pcsSemCliente: 3 }), "78 chaves lidas · 2 novas · 1 PC sumiu · 3 PCs sem cliente (abra o Rise)");
```

  (Se a situação vier como palavra pronta do portal, o teste de `situacaoDoPortal` usa as palavras medidas.)

- [ ] **Step 2: Rodar e ver falhar.** — [ ] **Step 3: Implementar os oito arquivos** e o `LEIAME.md` (instalar, usar, o que faz e o que não faz, erros).
- [ ] **Step 4: Rodar e ver passar** — `npm run teste:extensao-lightburn` → "Tudo certo."
- [ ] **Step 5: Teste manual no PC**: gerar a chave em Integrações do Rise do PC (`https://localhost:3000`),
  carregar a extensão sem compactação, configurar o endereço `https://localhost:3000`, abrir o portal logado no
  Chrome do dono e clicar "Enviar ao Rise"; conferir o resumo no popup, a tela (selo "Lido do portal hoje",
  situações, "PCs sem cliente") e o cartão em Integrações. Se a leitura real falhar, corrigir `pagina.js`/`leitura.js`
  pela resposta real e acrescentar o caso à fixture.
- [ ] **Step 6: Commit** — `git add extensao-lightburn scripts/teste-extensao-lightburn.js && git commit -m "feat(licencas): extensao Rise LightBurn (leitura do portal, so leitura) e teste puro"`

---

### Task 12: Importação de verdade na cópia do PC

**Files:**
- Create (fora do git, `dados/` está no `.gitignore`): `dados/licencas-importacao/controle-lightburn.xlsx`, `controle-mach3.xlsx`, `Instrucoes-Mach3.pdf`, pasta `clientes/`

- [ ] **Step 1: Baixar as planilhas** com o Drive MCP `download_file_content` (`fileId` `1REOJC42_F3fFToWZAvgDokNus7DMoHPueVrv_1Mol3g` e `12lJgNpTSbYNqZuNNV-5coRugFhLQx2sWOgpkF95CQe0`, `exportMimeType "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"`), gravar o base64 decodificado nos dois `.xlsx`. Copiar `C:\03-GoogleDrive\_MySpace\_4hobby\Licenças Mach3\Licencas\Licenças de clientes\` para `clientes/` e o PDF `Instruçoes para ativação do software Mach3.pdf`.
- [ ] **Step 2: Simular** — `node scripts/importar-licencas.js --lightburn=dados/licencas-importacao/controle-lightburn.xlsx --mach3=dados/licencas-importacao/controle-mach3.xlsx --pasta=dados/licencas-importacao/clientes --pdf="dados/licencas-importacao/Instrucoes-Mach3.pdf" --simular`. Conferir no resumo: a chave `3631C6…` (4hobby) e a `C6EF4F…` (Domama, "06/20" e "09/09/20"), as linhas sem cliente e os motivos, os 8 arquivos do Mach3 (6 com cliente, ALTAVE e ASSOCIACAO com `nomeAnotado`), nenhum aviso inesperado. Datas que vierem como `Date` do exceljs devem aparecer como `dd/mm/aaaa`.
- [ ] **Step 3: Confirmar** — o mesmo comando com `--confirmo`; depois `--simular` de novo → tudo 0 novos.
- [ ] **Step 4: Conferir na tela** `/ferramentas/licencas` (LightBurn com as chaves da planilha e "Não lida do portal"; Mach3 com os 8 arquivos e Baixar) e no cadastro de um cliente importado (aba Licenças). Anotar o resumo para o relatório final.
- [ ] **Step 5: Sem commit** (nada entra no git); a VPS só depois do "subir" do dono: `scp -i ~/.ssh/rise_vps -r dados/licencas-importacao rise@179.199.150.221:/srv/rise/app/dados/` e `docker compose exec -T app node scripts/importar-licencas.js … --simular` e `--confirmo`, numa única conexão SSH (o SSH da casa bloqueia com muitas conexões).

---

### Task 13: CLAUDE.md, ritual e entrega

**Files:**
- Modify: `CLAUDE.md` (linha da tabela "Estado" em Ferramentas; duas linhas em "Rodar" para `teste:licencas` e `teste:extensao-lightburn`; seção nova `## Ferramentas: Licenças Softwares (05/11/2026)` depois da seção da cotação do dólar, antes de "## Rodar na VPS": o que o dono decidiu, onde mora cada parte, as regras que custaram pensar (vagas pelo portal, casamento por nome do PC, arquivo no banco, upload por zip, leitura incompleta, idempotência da importação), a extensão e as rotas no Caddy, a importação (o que foi importado e o que ficou sem cliente), o que não foi medido (a primeira leitura real na VPS), e "Testes")

- [ ] **Step 1: CLAUDE.md** como acima (sem recontar o que já está no código).
- [ ] **Step 2: Ritual** — `npm run lint`; `npm run teste:licencas`; `npm run teste:extensao-lightburn`;
  `npm run teste:acessos`; `npm run teste:cadastros`; `npm run teste:extracao`; `npm run teste:coleta`;
  `npm run teste:worker` (SOZINHO, ~6 min, em segundo plano); `npm run build`. Tudo verde.
- [ ] **Step 3: Commit e push** — `git add CLAUDE.md && git commit -m "docs: Licencas Softwares no CLAUDE.md"` e `git push`.
- [ ] **Step 4: Relatório ao dono** (regra "Roteiro de testes no fim"): "O que foi feito" (commits, NÃO está na VPS)
  e "Testes que você precisa fazer" passo a passo com o resultado esperado: abrir o cartão, as duas abas, Vincular
  cliente, Baixar o zip do Mach3 e abrir, Enviar arquivo novo, gerar a chave em Integrações, carregar a extensão,
  "Enviar ao Rise" no portal e ver o selo e os PCs. Deploy e importação na VPS só com o "subir".

---

## Self-review (feito ao escrever)

- **Cobertura da spec:** §6.1 cartão/rota/recursos → T2, T9; §6.2 banco e semente → T2; §6.3 regras → T3 (vagas,
  casamento, último uso, situação, frescor, tipo), T4 (zip/upload/sha), T5/T6 (linha exige documento, encerrar,
  versões, download por rota com `acao`), T7 (aplicação da leitura, nada apaga sozinho = popups em T9); §6.4
  extensão → T1, T7 (rotas, Caddy, chave), T11; §6.5 importação → T8, T12; §6.6 telas → T9, T10; §6.7 testes e
  entrega → cada tarefa + T13; §7 decisões do construtor: `EscolhaEntreOpcoes` (T9), busca de clientes reaproveitada
  (T5), versões concorrentes (T6), ordem secundária (T3), `datalist` do Tipo (T9); §8 medições → T1.
- **Tipos consistentes:** `LicencaProjetada` definida em T5 e usada em T9/T10; `payload` definido em T7 e produzido
  em T11; `lerDataIso`/`normalizarIdentificador`/`normalizarNomeDoPc` de T3 usados em T5, T7, T8;
  `conferirChaveDaExtensao` com o mesmo nome da do AliExpress para o guarda do `teste:acessos`; `recursoPorId`,
  `formatarCep`, `Pergunta` e `@/generated/prisma/enums` conferidos no código antes de escrever.
- **Review Focus:** os cinco itens têm teste (T3 empate; T5 e T7 chave em outra caixa; T7 incompleta; T4 zip com
  pasta; T6 soma que não confere).
- **Proporção:** o plano traz assinaturas e asserções, não corpos; o único algoritmo descrito (zip) está em uma linha
  por etapa porque a assinatura não o determina.
