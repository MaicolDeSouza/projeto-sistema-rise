# Acessos, lançamento 1: plano de implementação

> **Para quem executa:** SUB-SKILL OBRIGATÓRIA: `superpowers:executing-plans` (execução inline, decisão do dono: uma
> frente só, na `main`, commits pequenos). Os passos usam caixas (`- [ ]`) para acompanhar.

**Objetivo:** o Rise ganha funções, usuários e permissões conferidas no servidor, o bloco Configurações com as telas
de Usuários e funções, e o Rise AI passa a obedecer a esse esquema, para a Entrega A do agente poder nascer em cima dele.

**Arquitetura:** um catálogo de recursos em código (`src/lib/acessos/recursos.js`); uma resolução pura de níveis
(`resolucao.js`); uma sessão de acessos lida uma vez por requisição (`servidor.js`, com `cache()` do React), que
expõe `pode`, `exigirAcesso` e o invólucro `executarComAcesso` das Server Actions; semeadura idempotente na partida; as
seis tabelas novas, aditivas; e as telas de §5 da spec (Configurações, Usuários e funções, a função com a matriz, o
usuário). `src/lib/sessao.js` não muda.

**Stack:** Next.js 16 (JavaScript, sem TypeScript), React 19, Prisma 7 + PostgreSQL 17, Tailwind 4, lucide-react, zod,
testes em `scripts/teste-*.js` (Node puro, `conferir(nome, obtido, esperado)`).

**Spec:** `docs/superpowers/specs/2026-10-12-acessos-design.md` (revisão 2 aplicada em 12/10/2026). A ordem e as
dependências vêm do §13 de `docs/superpowers/specs/2026-10-12-rise-ia-agente-design.md`. Quem executa lê a spec junto
com este plano: o plano argumenta a partir dela.

## Restrições globais

- **Escopo é o lançamento 1 (spec §8):** tabelas, catálogo **completo** (telas, sub-telas, cartões, ações, os sete dados
  sensíveis, capacidades do Rise AI, Configurações), `acessos/sessao.js`, invólucro, semeadura, menu, telas 1 a 4 de §5
  **sem** "Ver como" e **sem** a aba Histórico (lançamento 2), e o Rise AI sob o esquema. Nada de mapa rota → recurso
  nem de invólucro nas 158 ações do resto do Rise (lançamento 2), nada de campos (lançamento 3), nada de Telegram, caixa
  de entrada ou destino de conversas (entregas do agente).
- **`src/lib/sessao.js` não muda** (spec §4): é puro e o layout, `/api/sair` e o `teste:vps` dependem dele.
- **JavaScript sem TypeScript; identificadores e comentários sem acento; todo texto de tela com acento** (CLAUDE.md,
  "Convenções" e "Texto da tela COM acento"). Comentário explica o porquê.
- **Padrão visual** (CLAUDE.md, 10 regras) em toda tela: uma ação principal, nada de texto explicativo fixo (bolha "i"
  ou `title`), rótulo com verbo e objeto, mostrar só o que tem dado, abas no desenho do cadastro de Produto (`border-b-2`,
  ativa em `border-acento`), cartões na página de bloco, recusa vira estado, destrutivo por último com popup. Antes de
  desenhar cada tela: a linha-guia da spec. Depois de pronta: `ecc:make-interfaces-feel-better` e conferência no
  navegador a 1366 px.
- **Migration aditiva, escrita como o CLAUDE.md manda:** `prisma migrate diff --from-config-datasource --to-schema
  prisma/schema.prisma --script` para `prisma/migrations/<AAAAMMDD>_acessos/migration.sql`, **tirando as linhas `DROP
  INDEX`** dos índices que só existem no SQL (trigramas, `Job_fonte_aberta`, `Anuncio_um_por_produto`,
  `ConhecimentoIA_busca_trgm`, `ProdutoColetado_coletadoEm_idx`); `migrate deploy`; `npx prisma generate`; **reiniciar o
  servidor**. Só uma sessão mexe no schema por vez (regra do schema).
- **Server Action devolve `{ ok, ... }`**, nunca lança para a tela; segredo nunca vai em argumento de ação (vai em
  `FormData`); `revalidatePath` depois de gravar. Formulário envia à mão (`onSubmit` + `startTransition`), campos de
  tipo diferente ficam montados e escondidos.
- **Testes:** `npm run teste:acessos` (novo, `scripts/teste-acessos.js`): Postgres local, SEM rede, só escreve logins
  `zz-ac-*`, funções `ZZ-AC *` e auditoria deles, e apaga no começo e no fim. `npm run teste:rise-ai` continua passando
  (379 asserções) e ganha as do `pode`. Nunca canalizar teste com `| head`.
- **Falha fechada em toda dúvida:** sem login, sem segredo de borda, sem administrador, recurso desconhecido, banco fora
  do ar na VPS → `nenhum`. Só o PC de desenvolvimento (sem `RISE_PRODUCAO`, servidor em `127.0.0.1`) é administrador por
  ambiente.
- **Logins em minúsculas, aparados, sem caractere de controle**, comparados sem caixa em um lugar só
  (`normalizarLogin`). Reservados: `pc` e `desconhecido`.
- Antes de commitar: `npm run lint`; `.env`, `certificates/` e `dados/` ficam de fora. Commits só dos arquivos deste
  plano (outra sessão pode ter arquivos alterados na pasta).

## Foco da revisão

Entradas que a spec não exercita e que mais provavelmente mordem alguém; cada uma ganha o teste na tarefa dona:

1. **VPS sem `RISE_SEGREDO_DE_BORDA` no `.env`** (ou Caddy sem a variável): ninguém entra, inclusive o dono. O deploy
   tem de recusar antes de trocar os contêineres (Tarefa 5), e a tela "sem login" tem de dizer o que falta.
2. **`Remote-User` com maiúsculas ou espaço** ("Maicol ", "MAICOL"): tem de ser o mesmo usuário que "maicol" no banco e
   na `RISE_AI_ADMINS` (Tarefa 4).
3. **Banco do PC fora do ar:** o layout raiz passa a ler o banco; sem ele nenhuma página pode deixar de abrir, e
   Integrações › Servidor VPS tem de funcionar (Tarefa 6).
4. **Função gravada com um recurso que saiu do catálogo** (renomeado numa versão seguinte): a resolução ignora e a
   matriz não quebra (Tarefa 3 e 15).
5. **Dois administradores, um desativa o outro:** a conferência "último administrador ativo" roda dentro da transação
   que grava, não antes dela (Tarefa 13).
6. **`RISE_SIMULAR_LOGIN` esquecida no `.env` da VPS:** ignorada com `RISE_PRODUCAO` e recusada pelo deploy (Tarefas 4 e 5).

## Guia de desenho das telas (plugin UI/UX)

As Tarefas 11, 14, 15 e 16 **começam invocando a skill `frontend-design`** (com as 10 regras do Padrão visual, a spec
§5.1 e este guia como restrição) e **terminam com `ecc:make-interfaces-feel-better`** e a conferência no navegador a
1366 px. O que segue é o que o construtor decide igual em todas as telas, para não reinventar a cada uma.

**Vocabulário de componentes (reaproveitar, nunca recriar):** `PageHeader` (título, `voltarPara`, `acao` = a única
ação principal), `CartaoDeAtalho`, `Card`, `Badge` (tons `neutro`/`sucesso`/`alerta`/`erro`/`info`), `EmptyState`,
`BolhaDeAjuda` (`variante="inline"` ao lado do rótulo), `CampoBusca`, `Paginacao` (`src/components/mercados/`),
`BarraDeAbas` + `Painel` (`src/components/cadastros/Abas.jsx`), `Campo` (`src/components/cadastros/Campo.jsx`) para
rótulo + entrada, `PopupExclusao` (`src/components/cadastros/`) para o destrutivo, `Janela`
(`src/components/riseAi/Janela.jsx`) para edição curta por cima.

**Escala e espaço:** título de página `text-2xl font-semibold tracking-tight`; título de seção `text-base
font-semibold`; corpo `text-sm`; detalhe `text-xs text-suave`; caixa `rounded-lg border border-borda bg-superficie
p-5`; grade de cartões `grid gap-4 md:grid-cols-2 xl:grid-cols-3`; tabela com cabeçalho `text-xs uppercase
tracking-wide text-suave` (o das tabelas de hoje), linha `hover:bg-fundo`, 100 por página; todo número que muda em
`tabular-nums`; alinhamento à esquerda, nada centrado além dos segmentos de nível.

**Estados, sempre os quatro:** vazio (`EmptyState`, uma frase e a ação dentro), carregando (o botão diz "Salvando…" e
fica `disabled`; nunca spinner solto), recusa (botão `disabled` com o motivo no `title` e em uma linha `text-xs
text-suave` ao lado), erro real (`rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800`, só para
falha de verdade; o erro de validação vai embaixo do campo, como em `Campo`). Marcação é `emerald`
(`bg-emerald-100 text-emerald-800`), atenção é `amber`, nunca `sky` para estado. Botão principal `bg-acento
text-white`, secundário `border border-borda bg-superficie hover:bg-fundo`, destrutivo por último e só no popup.

**Textos (verbo + objeto, com acento):** "Adicionar usuário", "Criar função", "Salvar", "Cancelar", "Excluir função",
"Adicionar exceção", "todos desta lista"; selos "você", "inativo", "Administrador pelo .env", "Função fixa · vê e
edita tudo"; estados vazios "Só você entra no Rise por enquanto.", "Nenhuma exceção.", "Sem função: vê só o Painel
vazio."; bolhas: Login "O mesmo login da tela de entrada do Rise, criado por SSH.", Assinatura "Nome que assina as
respostas no WhatsApp; nasce com o primeiro nome.", cabeçalho da matriz "excluir inclui editar, que inclui ver.".
Nenhum parágrafo explicativo fixo em tela nenhuma.

**Acabamento (`make-interfaces-feel-better`), conferido em cada tela:** alvo de clique de 40 px nos botões de ícone
(`h-10 w-10`, ícone de 16 a 18 px centrado opticamente); `focus-visible:ring-2 focus-visible:ring-acento
focus-visible:outline-none` em todo botão, célula e linha clicável; `transition-[background-color,border-color,opacity]
duration-150` (nunca `transition-all`); raio concêntrico (segmento `rounded-md` dentro de célula `rounded-lg`);
títulos com `text-wrap: balance`, descrições com `text-wrap: pretty`; a `Janela` entra em 150 ms e sai em 100 ms, e
`prefers-reduced-motion` desliga as duas; a matriz inteira operável só pelo teclado (Tab entre linhas, setas entre
segmentos, `0 1 2 3`); nada pula quando o rodapé de alterações aparece (ele é `sticky bottom-0`, e a lista reserva o
`pb`). Mobile em uma coluna: o trilho da matriz vira um `select` acima da lista.

**O único elemento ousado é a matriz** (spec §5.1): o resto segue o desenho das telas de hoje, sem gradiente, sem
sombra colorida, sem faixa explicativa, sem marcador numerado, sem seta em link.

## As fases

| Fase | O que entrega | Tarefas |
| --- | --- | --- |
| 1. Banco e catálogo | as seis tabelas, o catálogo de recursos, a resolução de níveis | 1 a 3 |
| 2. Sessão e invólucro | quem é a pessoa, o que pode, `exigirAcesso`, `executarComAcesso`, segredo de borda, PC | 4 a 6 |
| 3. Semeadura e script | Administrador e Atendimento na partida, `acessos:admin` | 7 |
| 4. Rise AI sob o esquema | páginas, ações, rota SSE e ferramentas lendo `pode` | 8 e 9 |
| 5. Menu e Configurações | item Configurações, Integrações como cartão, página de cartões | 10 e 11 |
| 6. Usuários e funções | leitura, gravação com auditoria, as três telas | 12 a 16 |
| 7. Fechamento | guarda estático geral, ritual, CLAUDE.md, roteiro do dono | 17 e 18 |

Cada tarefa termina com algo testável sozinho; as fases 4 e 5 só dependem das fases 1 a 3; a fase 6 depende da 5
(a página de cartões é a porta de entrada).

---

## Fase 1: Banco e catálogo

### Tarefa 1: Schema e migration

**Arquivos:**
- Modificar: `prisma/schema.prisma` (depois de `model SugestaoIA`)
- Criar: `prisma/migrations/<AAAAMMDD>_acessos/migration.sql`
- Criar: `scripts/teste-acessos.js` (o esqueleto: `conferir`, `limpar`, blocos por assunto, `finally`)
- Modificar: `package.json` (`"teste:acessos": "node scripts/teste-acessos.js"`)

**Interfaces:**
- Produz os modelos Prisma `UsuarioRise`, `FuncaoRise`, `PermissaoDaFuncao`, `UsuarioFuncao`, `ExcecaoDoUsuario`,
  `AuditoriaDeAcesso`, `SemeaduraDeAcessos`, com estes campos (nomes exatos, usados pelas tarefas seguintes):

```prisma
model UsuarioRise {
  id             String   @id @default(cuid())
  /// O login do Tinyauth, em minusculas e aparado (normalizarLogin): e a chave que o Remote-User encontra.
  login          String   @unique
  nome           String
  assinatura     String?
  telegramChatId String?  @unique
  ativo          Boolean  @default(true)
  criadoEm       DateTime @default(now())
  ultimoAcessoEm DateTime?
  funcoes  UsuarioFuncao[]
  excecoes ExcecaoDoUsuario[]
}
model FuncaoRise {
  id           String   @id @default(cuid())
  nome         String   @unique
  descricao    String?
  /// Administrador: ve e edita tudo, nao se apaga nem se edita.
  fixa         Boolean  @default(false)
  criadoEm     DateTime @default(now())
  atualizadoEm DateTime @updatedAt
  permissoes PermissaoDaFuncao[]
  usuarios   UsuarioFuncao[]
}
model PermissaoDaFuncao {
  id       String @id @default(cuid())
  funcaoId String
  /// Id do catalogo (src/lib/acessos/recursos.js). Texto, nao enum: os niveis mudam por tipo de recurso.
  recurso  String
  nivel    String
  funcao FuncaoRise @relation(fields: [funcaoId], references: [id], onDelete: Cascade)
  @@unique([funcaoId, recurso])
}
model UsuarioFuncao {
  usuarioId String
  funcaoId  String
  usuario UsuarioRise @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  funcao  FuncaoRise  @relation(fields: [funcaoId], references: [id], onDelete: Cascade)
  @@id([usuarioId, funcaoId])
}
model ExcecaoDoUsuario {
  id        String @id @default(cuid())
  usuarioId String
  recurso   String
  nivel     String
  usuario UsuarioRise @relation(fields: [usuarioId], references: [id], onDelete: Cascade)
  @@unique([usuarioId, recurso])
}
model AuditoriaDeAcesso {
  id     String   @id @default(cuid())
  quando DateTime @default(now())
  quem   String
  /// "usuario.salvar", "usuario.desativar", "funcao.salvar", "funcao.excluir", "riseAi.configuracoes" (revisao 2)...
  oQue   String
  /// O id do usuario ou da funcao; "configuracao" para o Rise AI.
  alvo   String
  antes  Json?
  depois Json?
  @@index([alvo, quando])
}
/// Marca do que a semeadura ja fez uma vez (a Atendimento nao renasce depois de excluida).
model SemeaduraDeAcessos {
  chave   String   @id
  feitaEm DateTime @default(now())
}
```

- [ ] **Passo 1: escrever o esqueleto do teste** em `scripts/teste-acessos.js`, copiado do molde de
  `scripts/teste-rise-ai.js` (linhas 1 a 50: `dotenv`, `register` do `resolver-alias.js`, `prisma`, `conferir`,
  `limpar`), com `limpar()` apagando `usuarioRise` com `login` começando por `zz-ac-`, `funcaoRise` com `nome`
  começando por `ZZ-AC`, `auditoriaDeAcesso` com `quem` começando por `zz-ac-` e `semeaduraDeAcessos` com `chave`
  começando por `zz-ac-`; um bloco "banco" que confere `await prisma.usuarioRise.count({ where: { login: { startsWith:
  "zz-ac-" } } })` igual a `0`, e o `finally` com `limpar()` e `prisma.$disconnect()`; sai com código 1 se `falhas > 0`.
- [ ] **Passo 2: rodar `npm run teste:acessos` e ver falhar** com "prisma.usuarioRise is undefined" (o client não tem o
  modelo).
- [ ] **Passo 3: antes de tocar no schema, a regra do schema:** `git status` limpo em `prisma/`, e avisar o dono que as
  pastas `sistema-rise-agente-1` e `-2` precisam de `git merge main` antes de gerar qualquer migration. Então
  **acrescentar os sete modelos ao `schema.prisma`**, gerar a migration com o `migrate diff` da seção
  "Restrições globais", conferir o SQL (só `CREATE TYPE`/`CREATE TABLE`/`CREATE INDEX`/`ADD CONSTRAINT`; tirar os
  `DROP INDEX` dos índices só-SQL), `npx prisma migrate deploy`, `npx prisma generate`, reiniciar o servidor.
- [ ] **Passo 4: rodar `npm run teste:acessos` e ver passar** (1 asserção).
- [ ] **Passo 5: commit** `feat(acessos): tabelas de usuarios, funcoes, permissoes e auditoria (migration aditiva)`.

### Tarefa 2: O catálogo de recursos

**Arquivos:**
- Criar: `src/lib/acessos/recursos.js` (sem imports: lido pela tela, pelo servidor e pelo teste)
- Testar: `scripts/teste-acessos.js`, bloco "catalogo"

**Interfaces:**
- Produz:
  - `NIVEIS_POR_TIPO = { tela: ["nenhum","ver","editar","excluir"], dado: ["nenhum","ver","editar"], capacidade:
    ["nenhum","ver","editar"], cartao: ["nenhum","ver"], acao: ["nenhum","executar"] }` e `ordemDoNivel(nivel)` → `0`
    (`nenhum`), `1` (`ver`, `executar`), `2` (`editar`), `3` (`excluir`).
  - `RECURSOS`: lista de `{ id, rotulo, tipo, grupo, pai?, delegavel, dica? }`. `grupo` é o `href` do bloco em
    `blocos.js` (`"/produtos"`, `"/rise-ai"`, `"/configuracoes"`, `"/"` para o Painel...) ou `"dados"` para os sete
    dados sensíveis. `pai` é o id da tela de que a sub-tela, o cartão ou a ação depende.
  - Ids fixos (os que o código de outras tarefas usa): `tela.painel`, `cartao.painel.produtos`,
    `cartao.painel.anunciosPublicados`, `cartao.painel.anunciosComErro`, `cartao.painel.blocos`; uma tela por bloco de
    `blocos.js` (`tela.cadastros`, `tela.anuncios`, `tela.canaisDeVenda`, `tela.produtos`, `tela.scraper`,
    `tela.pedidos`, `tela.estoque`, `tela.financeiro`, `tela.relatorios`, `tela.ferramentas`) e as sub-telas de hoje
    (`tela.cadastros.clientes|fornecedores|concorrentes|transportadoras|marcas`, `tela.produtos.cadastro`,
    `tela.produtos.canais`, `tela.canaisDeVenda.mercadoLivre|lojaIntegrada`, `tela.scraper.fontes`,
    `tela.ferramentas.imagemParaSvg|cotacaoDolar`); ações com efeito (`acao.produtos.sincronizarBling`,
    `acao.produtos.marcarConferido`, `acao.produtos.gerarTextoComIA`, `acao.fotos.nanoBanana`, `acao.fotos.photoroom`,
    `acao.mercadoLivre.publicar`, `acao.lojaIntegrada.sincronizar`, `acao.scraper.varrer`, `acao.vps.deploy`); os
    dados `dado.custo`, `dado.margem`, `dado.localizacao`, `dado.estoqueExato`, `dado.concorrentes`,
    `dado.pessoalDoCliente`, `dado.financeiro` (cada um com `dica` dizendo onde aparece, spec §5.4); Rise AI:
    `tela.riseAi` (a entrada do bloco: `ver` = vê o bloco no menu e abre `/rise-ai`) e, com `pai: "tela.riseAi"`, as
    capacidades `riseAi.chat` (`editar` = conversar), `riseAi.revisao`, `riseAi.conhecimento`, `riseAi.consumo`,
    `riseAi.configuracoes`; Configurações: `tela.configuracoes` (a entrada) e, com `pai: "tela.configuracoes"`,
    `tela.configuracoes.usuarios` (`delegavel: false`) e `tela.integracoes`. Todo bloco de `blocos.js` tem uma tela de
    entrada `tela.<bloco>` sem `pai`: é ela que `blocosOcultos` (Tarefa 3) consulta.
  - `recursoPorId(id)` → o recurso ou `null`; `NAO_DELEGAVEIS` → `["tela.configuracoes.usuarios"]`;
    `validarNivel(id, nivel)` → `true` só se `nivel` está em `NIVEIS_POR_TIPO[tipo]`; `gruposDaMatriz()` → lista de
    `{ grupo, recursos }` na ordem de `RECURSOS`, com `"dados"` por último.

- [ ] **Passo 1: escrever as asserções** no bloco "catalogo": ids únicos; todo `grupo` que começa com `/` existe em
  `blocos.js` (`import { blocos } from "../src/lib/blocos.js"`), menos `/integracoes`, que sai do menu na Tarefa 10
  (o teste aceita `/configuracoes` já agora); todo `pai` existe; `NAO_DELEGAVEIS` é `["tela.configuracoes.usuarios"]`;
  `validarNivel("tela.produtos","excluir")` é `true` e `validarNivel("dado.custo","excluir")` é `false`;
  `ordemDoNivel("executar")` é `1`; `gruposDaMatriz()` termina em `"dados"` e não tem grupo vazio.
- [ ] **Passo 2: rodar e ver falhar** ("Cannot find module recursos.js").
- [ ] **Passo 3: escrever `recursos.js`** com a lista completa (percorrer `blocos.js`, `secoesDeCadastros.js`,
  `canaisDeVenda/catalogo.js`, `ferramentas/catalogo.js` e as rotas de `src/app` para não esquecer sub-tela) e as
  funções acima. Rótulos no vocabulário das telas ("Produtos › cadastro", "Rise AI › Revisão do dia").
- [ ] **Passo 4: rodar e ver passar.**
- [ ] **Passo 5: commit** `feat(acessos): catalogo de recursos (telas, dados sensiveis, cartoes, acoes, Rise AI)`.

### Tarefa 3: Resolução de níveis

**Arquivos:**
- Criar: `src/lib/acessos/resolucao.js` (importa só `recursos.js`)
- Testar: `scripts/teste-acessos.js`, bloco "resolucao"

**Interfaces:**
- Produz:
  - `resolverPermissoes({ funcoes, excecoes, administrador })` → `Map<string, string>` (id → nível efetivo), em que
    `funcoes` é `[{ permissoes: [{ recurso, nivel }] }]` e `excecoes` é `[{ recurso, nivel }]`. Regras (spec §3):
    maior nível entre as funções; exceção vence; sub-tela, cartão ou ação cujo `pai` é `nenhum` vira `nenhum`;
    `administrador: true` põe o maior nível de cada tipo em todo recurso, delegável ou não; **recurso não delegável só
    entra por `administrador: true`** (uma linha gravada numa função ou exceção para ele é ignorada: defesa em
    profundidade, além da validação da Tarefa 13); recurso que não está no catálogo é ignorado; nível inválido para o
    tipo é ignorado; o que não aparece é `nenhum` (ausente do mapa).
  - `podeNo(permissoes, id, nivel)` → `ordemDoNivel(permissoes.get(id) ?? "nenhum") >= ordemDoNivel(nivel)`.
  - `blocosOcultos(permissoes, hrefs)` → os `href` de `hrefs` cuja tela do bloco (`grupo === href`, `tipo === "tela"`,
    sem `pai`) é `nenhum`. Neste lançamento o layout passa só `["/rise-ai", "/configuracoes"]` (os blocos cujas telas
    já são conferidas); o lançamento 2 passa todos.
  - `contarLiberados(permissoes, grupo)` → `{ liberados, total }` dos recursos do grupo com nível acima de `nenhum`.

- [ ] **Passo 1: asserções**: duas funções (`tela.produtos` ver e editar) → `editar`; exceção `nenhum` vence função
  `editar`; `tela.produtos` nenhum derruba `tela.produtos.cadastro` editar e `acao.produtos.sincronizarBling` executar
  para `nenhum`; `administrador: true` dá `excluir` em `tela.produtos`, `editar` em `dado.custo`, `executar` em
  `acao.vps.deploy` e `editar` em `tela.configuracoes.usuarios`; recurso `tela.naoExiste` e nível `voar` são
  ignorados sem lançar; função com `tela.configuracoes.usuarios` `editar` e `administrador: false` → ausente do mapa; `podeNo(mapa, "dado.custo", "ver")` com `editar` é `true` e com ausente é `false`;
  `blocosOcultos(mapaSemRiseAi, ["/rise-ai","/configuracoes"])` é `["/rise-ai"]`; `contarLiberados` do grupo
  `/produtos` com só a tela em `ver` dá `{ liberados: 1, total: <n do catálogo> }`.
- [ ] **Passo 2: ver falhar.**
- [ ] **Passo 3: implementar** (`Map`, duas passadas: funções e exceções, depois a poda pelo `pai`).
- [ ] **Passo 4: ver passar.**
- [ ] **Passo 5: commit** `feat(acessos): resolucao pura dos niveis efetivos`.

---

## Fase 2: Sessão e invólucro

### Tarefa 4: A sessão pura

**Arquivos:**
- Criar: `src/lib/acessos/sessao.js` (importa `@/lib/sessao`, `resolucao.js`, `node:crypto`)
- Testar: `scripts/teste-acessos.js`, bloco "sessao"

**Interfaces:**
- Consome `sessaoDoRise(cabecalhos, env)` e `ambienteDoRise(env)` de `src/lib/sessao.js` (não mudam).
- Produz:
  - `LOGINS_RESERVADOS = ["pc", "desconhecido"]`; `normalizarLogin(texto)` → minúsculas, aparado, sem caractere de
    controle, até 60 caracteres, ou `""`.
  - `loginDaRequisicao(cabecalhos, env)` → `{ ambiente: "pc"|"vps", login: string|null, motivo: null | "sem-login" |
    "sem-segredo" | "reservado" | "simulado" }`. Na VPS: `login` só quando o `Remote-User` normalizado existe, não é
    reservado **e** o cabeçalho `x-rise-borda` é igual a `env.RISE_SEGREDO_DE_BORDA` por `timingSafeEqual` (tamanhos
    diferentes → falso; variável vazia → `"sem-segredo"`). No PC: `env.RISE_SIMULAR_LOGIN` normalizado (`motivo:
    "simulado"`) ou `"pc"`. `RISE_SIMULAR_LOGIN` é ignorada quando `ambienteDoRise(env) === "vps"`.
  - `montarSessao({ ambiente, login, motivo, usuario, quebraVidro })` → `{ login, ambiente, usuario, administrador,
    permissoes, estado, pode(id, nivel) }`, em que `usuario` é o registro com `funcoes[].funcao.permissoes` e
    `excecoes` (ou `null`) e `quebraVidro` é `true` quando o login está em `RISE_AI_ADMINS`. `estado` ∈ `"ok"`,
    `"sem-login"`, `"sem-segredo"`, `"nao-cadastrado"`, `"inativo"`, `"erro-banco"`. `administrador` é `true` para
    `ambiente === "pc"` sem login simulado, para `quebraVidro`, e para usuário ativo com a função `fixa`. `permissoes`
    vem de `resolverPermissoes`; `pode` é `podeNo` fechado sobre ela. `usuario` inativo e não `quebraVidro` vira
    `estado: "inativo"` com permissões vazias.
  - `quebraVidro(login, env)` → o login está em `separarLista(env.RISE_AI_ADMINS)` comparado por `normalizarLogin`.
  - `precisaGravarAcesso(ultimoAcessoEm, agora)` → `true` se nulo ou mais de 10 min atrás.

- [ ] **Passo 1: asserções** (cabeçalhos por `new Headers({...})`): VPS com `Remote-User: " Maicol "` e segredo certo →
  `login "maicol"`; segredo errado ou ausente → `login null, motivo "sem-login"`; variável vazia → `"sem-segredo"`;
  `Remote-User: pc` → `"reservado"`; PC sem variável → `"pc"`; PC com `RISE_SIMULAR_LOGIN=Andrea` → `"andrea"` e
  `"simulado"`; VPS com `RISE_SIMULAR_LOGIN` → ignorada. `montarSessao`: PC sem simulado → `administrador true` e
  `pode("tela.configuracoes.usuarios","editar")`; PC simulado sem usuário → `"nao-cadastrado"`, `pode(...)` falso;
  usuário com função Atendimento (permissões de teste) → `pode("riseAi.chat","editar")` verdadeiro e
  `pode("riseAi.revisao","ver")` falso; `quebraVidro` com usuário inativo → `administrador true`; usuário inativo sem
  quebra-vidro → `"inativo"`; `precisaGravarAcesso(null)` verdadeiro, 9 min atrás falso, 11 min atrás verdadeiro.
- [ ] **Passo 2: ver falhar.**
- [ ] **Passo 3: implementar.** `timingSafeEqual` só sobre buffers do mesmo tamanho (senão lança).
- [ ] **Passo 4: ver passar.**
- [ ] **Passo 5: commit** `feat(acessos): sessao pura (login, segredo de borda, quebra-vidro, PC simulado)`.

### Tarefa 5: Segredo de borda no Caddy, `.env` e o servidor de desenvolvimento

**Arquivos:**
- Modificar: `deploy/caddy/Caddyfile` (bloco global `request_header`, linhas ~30 a 37, e o `handle` com login, ~85 a 95)
- Modificar: `docker-compose.yml` (serviço `caddy`: `environment: - RISE_SEGREDO_DE_BORDA=${RISE_SEGREDO_DE_BORDA}`)
- Modificar: `deploy/deploy-vps.sh` (depois do bloco `COLETA_PERMITIR_REDE_LOCAL`, linhas 19 a 24)
- Modificar: `.env.example` (`RISE_SEGREDO_DE_BORDA=`, `RISE_SIMULAR_LOGIN=`, com um comentário de uma linha cada)
- Modificar: `package.json` (script `dev`: acrescentar `--hostname 127.0.0.1`)

**Interfaces:**
- Produz o cabeçalho `X-Rise-Borda` que a Tarefa 4 lê: apagado de fora (`request_header -X-Rise-Borda` junto dos
  `-Remote-*`), gravado só no `reverse_proxy` do ramo com login (`header_up X-Rise-Borda {env.RISE_SEGREDO_DE_BORDA}`),
  nunca no ramo `@arquivos`.
- O deploy recusa `.env` com `RISE_SIMULAR_LOGIN=` (mesma mensagem do `COLETA_PERMITIR_REDE_LOCAL`) e `.env` sem
  `RISE_SEGREDO_DE_BORDA=` preenchido ("gere com `openssl rand -hex 32`").

- [ ] **Passo 1: editar o Caddyfile, o compose, o deploy e o `.env.example`** como acima.
- [ ] **Passo 2: validar o Caddyfile** sem subir nada: `docker run --rm -v "$PWD/deploy/caddy/Caddyfile:/etc/caddy/Caddyfile"
  caddy:2 caddy validate --config /etc/caddy/Caddyfile` (o deploy faz o mesmo). Esperado: "Valid configuration".
- [ ] **Passo 3: `--hostname 127.0.0.1` no `dev`**, reiniciar e conferir no navegador que `https://localhost:3000` e
  `https://127.0.0.1:3000` abrem e que `https://sistema-rise.localtest.me:3000` (o OAuth do ML) também. Se `localhost`
  resolver para `::1` e recusar, trocar por `--hostname localhost` e anotar no CLAUDE.md: o que vale é não escutar na rede.
- [ ] **Passo 4: commit** `feat(acessos): segredo de borda entre Caddy e app; dev so em 127.0.0.1`.

### Tarefa 6: Sessão do servidor, `exigirAcesso` e o invólucro

**Arquivos:**
- Criar: `src/lib/acessos/erros.js` (`class ErroDeAcesso extends Error { constructor(recurso, nivel) }`)
- Criar: `src/lib/acessos/servidor.js` (importa `react` `cache`, `next/headers`, `next/navigation` `notFound`, `prisma`,
  `sessao.js`, `erros.js`, `@/lib/riseAi/erros` `ErroDeUso`)
- Criar: `src/lib/acessos/involucro.js` (puro, testável: a lógica de `executarComAcesso` com a sessão injetada)
- Testar: `scripts/teste-acessos.js`, bloco "involucro"

**Interfaces:**
- Produz (servidor):
  - `sessaoDeAcessos()`: `cache(async () => ...)`. Lê `headers()`, `loginDaRequisicao`, carrega
    `prisma.usuarioRise.findUnique({ where: { login }, include: { funcoes: { include: { funcao: { include: { permissoes:
    true } } } }, excecoes: true } })`, `montarSessao`. **Erro do banco:** no PC devolve a sessão de administrador
    (`estado: "erro-banco"`, para Integrações › Servidor VPS abrir); na VPS devolve `estado: "erro-banco"` com
    permissões vazias e `administrador` só pelo quebra-vidro. Depois de montar, se `precisaGravarAcesso`, atualiza
    `ultimoAcessoEm` sem esperar (`.catch` que só registra no log).
  - `exigirAcesso(id, nivel)` → lança `ErroDeAcesso` quando `!sessao.pode(id, nivel)`.
  - `exigirAcessoNaPagina(id, nivel)` → chama `notFound()` em vez de lançar (spec §5.6: 404, nunca "sem permissão").
  - `recusarRota()` → `new Response(null, { status: 403 })` (as rotas `/api/*` usam `if (!sessao.pode(...)) return recusarRota()`).
  - `executarComAcesso(id, nivel, trabalho)` → `executarComSessao(sessaoDeAcessos, id, nivel, trabalho)`.
- Produz (puro, em `involucro.js`): `executarComSessao(obterSessao, id, nivel, trabalho)` → `{ ok: true, ...await
  trabalho(sessao) }`; `ErroDeAcesso` → `{ ok: false, erro: "Sem permissão para <rótulo do recurso>." }`; `ErroDeUso` →
  `{ ok: false, erro: erro.message }`; outro erro → `console.error` e `{ ok: false, erro: "Não foi possível concluir
  agora. Tente de novo em instantes." }` (o texto de hoje em `administrador.js`).

- [ ] **Passo 1: asserções** com `obterSessao` falso: sessão que pode → `{ ok: true, x: 1 }`; que não pode →
  `{ ok: false, erro: "Sem permissão para Rise AI › Revisão do dia." }`; `trabalho` que lança `ErroDeUso("x")` →
  `{ ok: false, erro: "x" }`; que lança `TypeError` → o aviso genérico; `trabalho` que devolve `{ ok: false, erro: "y" }`
  → `ok: false` vence.
- [ ] **Passo 2: ver falhar.**
- [ ] **Passo 3: implementar `involucro.js`, `erros.js` e `servidor.js`.** `servidor.js` não roda no teste (usa
  `next/headers`): o que ele faz além do puro é só colar as peças, e a Tarefa 17 confere por texto que ele chama
  `montarSessao` e `precisaGravarAcesso`.
- [ ] **Passo 4: ver passar.**
- [ ] **Passo 5: commit** `feat(acessos): sessao por requisicao, exigirAcesso e o involucro das acoes`.

---

## Fase 3: Semeadura e script

### Tarefa 7: Semeadura na partida e `acessos:admin`

**Arquivos:**
- Criar: `src/lib/acessos/semeadura.js` (importa `prisma`, `recursos.js`, `sessao.js`)
- Modificar: `src/instrumentation.js` (chamar a semeadura antes do vigia, no runtime `nodejs`, no PC e na VPS)
- Criar: `scripts/acessos-admin.js`
- Modificar: `package.json` (`"acessos:admin": "node scripts/acessos-admin.js"`)
- Testar: `scripts/teste-acessos.js`, bloco "semeadura"

**Interfaces:**
- Produz:
  - `PERMISSOES_DA_ATENDIMENTO`: lista `[{ recurso, nivel }]` da spec §7: `tela.painel` ver, os cartões
    `cartao.painel.produtos` e `cartao.painel.anunciosPublicados` ver (o dono escolhe os demais), `tela.cadastros` e
    sub-telas ver, `tela.canaisDeVenda` e sub-telas ver, `tela.produtos` e sub-telas ver, os sete `dado.*` ver,
    `tela.pedidos`, `tela.estoque`, `tela.financeiro` ver, `tela.riseAi` ver e `riseAi.chat` editar; nada de `acao.*`,
    nada de Rise AI além do chat, nada de Configurações.
  - `semearAcessos({ prisma, env, agora })` → `{ administradorId, atendimentoCriada: boolean, usuariosCriados: string[] }`.
    Cria a função `Administrador` (`fixa: true`) se faltar; cria `Atendimento` com as permissões acima **só se**
    `semeaduraDeAcessos` não tem a chave `"atendimento"` (e grava a chave); para cada login de `RISE_AI_ADMINS`
    (normalizado), cria o `UsuarioRise` (`nome` = login) ligado a Administrador **só se o usuário não existe**; usuário
    existente não ganha nem perde função. Idempotente: chamar duas vezes não muda nada.
  - `promoverAdministrador({ prisma, login })` → cria ou reativa o usuário e liga à Administrador; usado pelo script.
- O script `scripts/acessos-admin.js <login>`: molde de `scripts/composicao-do-bling.js` (`dotenv`, `register`,
  `prisma`); sem login imprime o uso e sai com 2; imprime "`<login>` é Administrador do Rise (criado|já existia)".

- [ ] **Passo 1: asserções** (com `env.RISE_AI_ADMINS = "zz-ac-dono"` e a chave de semeadura de teste `zz-ac-atendimento`,
  passada por parâmetro `chaves: { atendimento: "zz-ac-atendimento" }` para não tocar na semeadura real): primeira
  chamada cria Administrador (ou reaproveita a real, por nome), a função `ZZ-AC Atendimento` (nome passado por
  parâmetro, pelo mesmo motivo) com `PERMISSOES_DA_ATENDIMENTO.length` permissões e o usuário `zz-ac-dono` com
  Administrador; segunda chamada não cria nada; apagar `ZZ-AC Atendimento` e chamar de novo não a recria; tirar a
  função do `zz-ac-dono` e chamar de novo não a devolve; `promoverAdministrador` num login inativo o reativa e liga.
- [ ] **Passo 2: ver falhar.**
- [ ] **Passo 3: implementar**, ligar em `instrumentation.js` dentro de `try/catch` que só registra
  (`[acessos] semeadura adiada: <erro>`), e escrever o script.
- [ ] **Passo 4: ver passar; `npm run acessos:admin -- zz-ac-script`** e conferir no banco; apagar o usuário de teste.
- [ ] **Passo 5: commit** `feat(acessos): semeadura idempotente na partida e npm run acessos:admin`.

---

## Fase 4: Rise AI sob o esquema

### Tarefa 8: Páginas, ações e rota do Rise AI conferem o recurso

**Arquivos:**
- Modificar: `src/app/rise-ai/sessao.js` (passa a montar sobre `sessaoDeAcessos()`)
- Remover: `src/app/rise-ai/administrador.js`
- Modificar: `src/app/rise-ai/acoes.js`, `src/app/rise-ai/revisao/acoes.js`, `src/app/rise-ai/configuracoes/acoes.js`
- Modificar: `src/app/rise-ai/layout.jsx`, `page.jsx`, `[conversaId]/page.jsx`, `revisao/page.jsx`, `consumo/page.jsx`,
  `configuracoes/page.jsx`, `src/app/api/rise-ai/conversar/route.js`
- Modificar: `src/components/riseAi/ListaDeConversas.jsx` (prop `links` no lugar de `administrador`), `Chat.jsx` e
  `[conversaId]/page.jsx` (prop `podeEnsinar` no lugar de `administrador` para o "Propor correção")
- Modificar: `scripts/teste-rise-ai.js` (o bloco do guarda, linhas ~1304 a 1317)

**Interfaces:**
- Consome `sessaoDeAcessos`, `exigirAcessoNaPagina`, `recusarRota`, `executarComAcesso` (Tarefa 6).
- Produz `sessaoAtual()` → `{ usuario: sessao.login ?? "desconhecido", administrador: sessao.administrador, ambiente,
  pode }` (mantém os nomes que `conversas.js` e as telas usam; `usuario` continua sendo o dono das conversas).
- Recurso e nível por ação: `rise-ai/acoes.js` → `riseAi.chat` (`ver` para `buscarConversasAcao` e
  `carregarMensagemAcao`; `editar` para `renomearConversaAcao`, `excluirConversaAcao`, `avaliarMensagemAcao`);
  `revisao/acoes.js` → `riseAi.revisao` `editar` (`aprovarSugestaoAcao`, `rejeitarSugestaoAcao`, `gerarSugestaoAcao`,
  `marcarRevisadaAcao`, `carregarConversaParaRevisaoAcao`) e `riseAi.conhecimento` `editar` (`proporCorrecaoAcao`,
  `criarConhecimentoAcao`, `editarConhecimentoAcao`, `aprovarConhecimentoAcao`, `rejeitarConhecimentoAcao`);
  `configuracoes/acoes.js` → `riseAi.configuracoes` `editar` (as cinco). Páginas: layout `tela.riseAi` `ver`; chat e
  `[conversaId]` `riseAi.chat` `ver`; Revisão `riseAi.revisao` `ver`; Consumo `riseAi.consumo` `ver`; Configurações
  `riseAi.configuracoes` `ver`; a rota `conversar` → `riseAi.chat` `editar` (403 sem corpo). As três páginas de
  administração deixam de desenhar o aviso "Só administradores": `exigirAcessoNaPagina` dá 404.
- `ListaDeConversas` recebe `links: { href, rotulo }[]` já filtrados pelo layout com `sessao.pode`
  (`riseAi.revisao`/`riseAi.consumo`/`riseAi.configuracoes` em `ver`); o mapa `href → ícone` fica dentro do componente
  de cliente (um componente React não atravessa a fronteira servidor → cliente).

- [ ] **Passo 1: reescrever o guarda em `teste-rise-ai.js`**: para cada arquivo `acoes.js` de `src/app/rise-ai/`
  (os três), toda `export async function` tem corpo começando por `return executarComAcesso("<id do catálogo>",
  "<nível>",` com id existente em `RECURSOS` e nível válido; todo `page.jsx`, `layout.jsx` e `route.js` de
  `src/app/rise-ai/` e `src/app/api/rise-ai/` contém `exigirAcessoNaPagina(` ou `sessaoDeAcessos(` + `recusarRota(`;
  `administrador.js` não existe mais. Rodar: falha (nada mudou ainda).
- [ ] **Passo 2: implementar** as mudanças de arquivos acima; a página `[conversaId]` mantém a regra de dona
  (`carregarConversa` com `usuario`/`administrador`) além do `riseAi.chat` `ver`.
- [ ] **Passo 3: `npm run teste:rise-ai`** passa inteiro (379 + o guarda novo). Abrir `/rise-ai`, `/rise-ai/revisao` e
  `/rise-ai/configuracoes` no PC (administrador) e com `RISE_SIMULAR_LOGIN=zz-ac-andrea` (usuário criado à mão com
  Atendimento): chat abre, Revisão dá 404, trilho sem os links.
- [ ] **Passo 4: commit** `feat(rise-ai): acoes, paginas e rota conferem o recurso de Acessos`.

### Tarefa 9: As ferramentas leem `pode`

**Arquivos:**
- Modificar: `src/lib/riseAi/ferramentas/index.js` (`contexto` ganha `pode`), `src/lib/riseAi/busca.js`
  (`cartaoDoProduto(produto, { perfil, pode })`), `ferramentas/produtos.js` (`cartaoParaOModelo`, `consultarProduto`,
  `consultarEstoque`), `src/lib/riseAi/conversa.js`
  (`responder({ ..., pode })` e `rodarLaco`), `src/app/api/rise-ai/conversar/route.js` (passa `sessao.pode`)
- Testar: `scripts/teste-rise-ai.js`, bloco das ferramentas

**Interfaces:**
- `contexto = { perfil, usuario, pode }`, com `pode` padrão `() => true` (o perfil `publico` continua decidindo pelo
  perfil; `pode` só restringe dentro do `admin`). Regras: `custo` e `fornecedores` só com `pode("dado.custo","ver")`;
  `localizacao` só com `pode("dado.localizacao","ver")`; `concorrentes` só com `pode("dado.concorrentes","ver")`;
  estoque numérico só com `pode("dado.estoqueExato","ver")`, senão a faixa "disponível / poucas unidades / em falta"
  do perfil público. Campo recusado vira o marcador `"[restrito]"` no resultado (spec do agente §4a: o modelo sabe o
  que dizer).

- [ ] **Passo 1: asserções**: `executarFerramenta("consultarProduto", { sku }, { perfil: "admin", usuario, pode: (id) =>
  id !== "dado.custo" })` devolve `custo: "[restrito]"` e `fornecedores: "[restrito]"` e mantém `preco`;
  `pode` que nega `dado.estoqueExato` → `estoque` vira a faixa; sem `pode` → tudo como hoje (as 379 continuam).
- [ ] **Passo 2: ver falhar.**
- [ ] **Passo 3: implementar** e fazer `responder` repassar `pode` ao `rodarLaco` e ao `executarFerramenta`.
- [ ] **Passo 4: ver passar.**
- [ ] **Passo 5: commit** `feat(rise-ai): ferramentas respeitam os dados sensiveis de Acessos`.

---

## Fase 5: Menu e Configurações

### Tarefa 10: Item Configurações, Integrações vira cartão, menu esconde o que é `nenhum`

**Arquivos:**
- Modificar: `src/lib/blocos.js` (sai Integrações; entra Configurações por último, `Settings`, `rotasExtras:
  ["/integracoes", "/rise-ai/configuracoes"]`; `ehRotaAtiva(pathname, href, rotasExtras = [])`)
- Modificar: `src/components/Sidebar.jsx` (prop `hrefsOcultos`, `ehRotaAtiva(pathname, bloco.href, bloco.rotasExtras)`;
  no rodapé `Usuario`, quando `sessao.simulando` existe, a linha pequena vira "simulando <login>" em `amber`, a única
  parte da tela 5 da spec que entra neste lançamento, porque o roteiro do dono precisa dela),
  `src/app/layout.jsx` (chama `sessaoDeAcessos()`, calcula `blocosOcultos(sessao.permissoes, ["/rise-ai",
  "/configuracoes"])`, passa `hrefsOcultos` e `sessao` com `simulando: login | null`)
- Modificar: `src/app/integracoes/page.jsx` (`PageHeader ... voltarPara="/configuracoes" voltarRotulo="Configurações"`)
- Modificar: `src/app/page.jsx` (nada a mudar: a grade lê `blocos`; conferir que Configurações aparece no lugar de Integrações)
- Testar: `scripts/teste-acessos.js`, bloco "menu"

- [ ] **Passo 1: asserções**: `blocos.at(-1).href === "/configuracoes"`; nenhum bloco com `href "/integracoes"`;
  `ehRotaAtiva("/integracoes", "/configuracoes", ["/integracoes"])` é `true`; `ehRotaAtiva("/rise-ai/configuracoes",
  "/rise-ai")` continua `true` (o trilho do Rise AI também acende); `ehRotaAtiva("/", "/")` só na raiz.
- [ ] **Passo 2: ver falhar.**
- [ ] **Passo 3: implementar.** O `Sidebar` filtra `blocos` por `hrefsOcultos` antes da busca do menu. O layout raiz
  não pode lançar com o banco fora: `sessaoDeAcessos` já devolve `erro-banco` (Tarefa 6).
- [ ] **Passo 4: ver passar; no navegador:** Integrações fora do menu, Configurações por último, `/integracoes`
  acende Configurações, Painel mostra o cartão Configurações; com `RISE_SIMULAR_LOGIN=zz-ac-andrea` o item
  Configurações some e o Rise AI fica.
- [ ] **Passo 5: commit** `feat(acessos): item Configuracoes no menu; Integracoes vira cartao`.

### Tarefa 11: A página de cartões `/configuracoes`

**Arquivos:**
- Criar: `src/lib/configuracoes/catalogo.js` (os três cartões: `href`, `recurso`, `rotulo`, `icone`, `resumo`)
- Criar: `src/lib/configuracoes/detalhes.js` (puro: `detalheDeUsuarios({ usuarios, funcoes })` → `"2 usuários · 2
  funções"`; `detalheDeIntegracoes(conectores, conexoes)` (a lista `conectores` de `@/lib/integracoes/registro` e o
  `Map` de `listarConexoes()`) → `"3 conectadas"` ou `"1 expirada · 2 conectadas"` (a pior primeiro: erro, expirada,
  não configurada, conectada); `detalheDoRiseAi(padrao, PROVEDORES)` → `"Padrão: Anthropic · claude-haiku-5-5"` (o
  rótulo do provedor vem de `PROVEDORES` em `@/lib/riseAi/modelos`))
- Criar: `src/app/configuracoes/page.jsx` (`exigirAcessoNaPagina("tela.configuracoes","ver")`; filtra os cartões por
  `sessao.pode(cartao.recurso,"ver")`; carrega os detalhes em `Promise.all`; `PageHeader` "Configurações" com a
  descrição "Usuários, integrações e o Rise AI."; grade de `CartaoDeAtalho` como `/cadastros`)
- Testar: `scripts/teste-acessos.js`, bloco "configuracoes"

- [ ] **Passo 1: asserções** dos três formatadores (inclusive zero usuários → `"1 usuário · 2 funções"` no singular,
  e conexões vazias → `"nenhuma conectada"`), e que `catalogo` tem exatamente os recursos `tela.configuracoes.usuarios`,
  `tela.integracoes` e `riseAi.configuracoes`.
- [ ] **Passo 2: ver falhar.**
- [ ] **Passo 3: implementar.** Os detalhes leem `listarConexoes()` (`@/lib/integracoes/conexoes`) e
  `lerConfiguracao()` (`@/lib/riseAi/configuracao`), e a contagem de usuários e funções pelo `prisma`.
- [ ] **Passo 4: ver passar; no navegador** a 1366 px: três cartões (dois com o `zz-ac-andrea`), detalhes vivos.
- [ ] **Passo 5: commit** `feat(acessos): pagina de cartoes do bloco Configuracoes`.

---

## Fase 6: Usuários e funções

### Tarefa 12: Leitura de usuários e funções

**Arquivos:**
- Criar: `src/lib/acessos/banco.js` (a parte de leitura)
- Testar: `scripts/teste-acessos.js`, bloco "banco: leitura"

**Interfaces:**
- Produz:
  - `listarUsuarios({ busca = "", inativos = false, env = process.env })` → `[{ id, login, nome, ativo, ultimoAcessoEm,
    funcoes: [{ id, nome, fixa }], peloEnv: boolean }]`, ordenados por nome; `busca` casa nome ou login sem caixa;
    `inativos` falso esconde os inativos. `peloEnv` vem de `quebraVidro(login, env)` (o `env` é parâmetro para o teste).
  - `carregarUsuario(id, { env = process.env } = {})` → o usuário com `funcoes` (ids), `excecoes` (`[{ recurso, nivel
    }]`) e `peloEnv`, ou `null`.
  - `listarFuncoes()` → `[{ id, nome, descricao, fixa, usuarios: n, telasLiberadas: { liberados, total } }]`
    (`contarLiberados` sobre as telas de todos os grupos).
  - `carregarFuncao(id)` → `{ id, nome, descricao, fixa, permissoes: { [recurso]: nivel }, usuarios: [{ id, nome }] }`.
  - `usuarioParaTela(u)` e `funcaoParaTela(f)` tiram `Date` e `null` de texto (molde `conhecimentoParaTela`).

- [ ] **Passo 1: asserções** com dois usuários `zz-ac-*` (um inativo) e duas funções `ZZ-AC *`: `listarUsuarios()` sem
  o inativo; com `inativos: true` os dois; `busca: "ZZ-AC-UM"` acha pelo login sem caixa; `listarFuncoes()` traz
  `usuarios` e `telasLiberadas` certos; `carregarFuncao` devolve `permissoes` como objeto; `carregarUsuario("x")` é `null`.
- [ ] **Passo 2: ver falhar.**
- [ ] **Passo 3: implementar.**
- [ ] **Passo 4: ver passar.**
- [ ] **Passo 5: commit** `feat(acessos): leitura de usuarios e funcoes para as telas`.

### Tarefa 13: Gravação com validação e auditoria

**Arquivos:**
- Criar: `src/lib/acessos/validacao.js` (puro)
- Modificar: `src/lib/acessos/banco.js` (a parte de escrita)
- Testar: `scripts/teste-acessos.js`, bloco "banco: escrita"

**Interfaces:**
- Produz (puro): `validarUsuario({ login, nome, assinatura, ativo, funcoes, excecoes })` → `{ ok, erros: { campo:
  mensagem } }`: login obrigatório, normalizado, não reservado; nome obrigatório; exceções com recurso do catálogo,
  nível válido e **nunca um recurso não delegável**. `validarFuncao({ nome, descricao, permissoes })` → nome obrigatório (até 60), toda permissão com
  recurso do catálogo, nível válido para o tipo, nunca um recurso não delegável.
- Produz (banco), todas com `{ quem }` (o login de quem grava) e auditoria na mesma transação:
  - `salvarUsuario(dados, { quem })` → `{ ok, id | erros }`: cria ou atualiza; login único (`"Já existe um usuário com
    este login."`); **último administrador ativo** não pode ficar inativo nem perder a função Administrador (conferido
    com `SELECT ... FOR UPDATE` na linha da função Administrador, dentro da transação: `"É o último administrador
    ativo."`); usuário `peloEnv` não pode ficar inativo nem perder Administrador (`"Este login vem de RISE_AI_ADMINS;
    tire-o lá primeiro."`); `funcoes` e `excecoes` trocadas por inteiro; auditoria `usuario.salvar` com `antes`/`depois`
    (sem segredos: só login, nome, ativo, funções, exceções).
  - `salvarFuncao(dados, { quem })` → `{ ok, id | erros }`: nome único sem caixa; `fixa` recusa (`"A função
    Administrador não se edita."`); permissões trocadas por inteiro (só as acima de `nenhum` são gravadas); auditoria
    `funcao.salvar`.
  - `excluirFuncao(id, { quem })` → `{ ok, erro? }`: `fixa` recusa; desliga dos usuários (o `Cascade` apaga
    `UsuarioFuncao`); auditoria `funcao.excluir` com a lista de quem a tinha.
  - `registrarAuditoria(tx, { quem, oQue, alvo, antes, depois })`: `antes`/`depois` nulos vão como `Prisma.DbNull`
    (armadilha do CLAUDE.md: `null` puro em `Json?` é recusado).

- [ ] **Passo 1: asserções**: `validarUsuario` com login `"PC"` → erro no campo `login`; com exceção `{ recurso:
  "dado.custo", nivel: "excluir" }` → erro em `excecoes`; `validarFuncao` com `tela.configuracoes.usuarios` → erro;
  `salvarUsuario` duas vezes com o mesmo login → o segundo `erros.login`; criar `zz-ac-adm` como único Administrador
  de teste (função `ZZ-AC Admin` com `fixa: false` não serve: a regra olha a função `fixa`; o teste cria o usuário na
  Administrador real e **o devolve no `finally`**) e tentar desativá-lo com todos os outros administradores reais
  inativos é impossível de simular sem mexer no dono, então o teste cobre a regra pela função pura
  `podeDesativar({ ehAdministrador, outrosAdministradoresAtivos, peloEnv })` → falso quando `outros === 0` ou
  `peloEnv`; `salvarFuncao` com nome repetido em caixa diferente → `erros.nome`; `excluirFuncao` da fixa → `ok false`;
  cada gravação deixa uma linha em `auditoriaDeAcesso` com `quem = "zz-ac-dono"` e `antes`/`depois` diferentes.
- [ ] **Passo 2: ver falhar.**
- [ ] **Passo 3: implementar.** `podeDesativar` é pura e a transação a chama com a contagem lida sob `FOR UPDATE`.
- [ ] **Passo 4: ver passar.**
- [ ] **Passo 5: commit** `feat(acessos): gravacao de usuarios e funcoes com validacao e auditoria`.

### Tarefa 14: Tela Usuários e funções (lista com duas abas)

**Arquivos:**
- Criar: `src/app/configuracoes/acoes.js` (`"use server"`: `salvarUsuarioAcao(id, formData)`, `salvarFuncaoAcao(id,
  formData)`, `excluirFuncaoAcao(id)`, cada uma `return executarComAcesso("tela.configuracoes.usuarios", "editar",
  async (sessao) => ...)` e `revalidatePath("/configuracoes", "layout")`)
- Criar: `src/app/configuracoes/usuarios/page.jsx` (`exigirAcessoNaPagina("tela.configuracoes.usuarios","ver")`;
  `?aba=usuarios|funcoes`, `?q=`, `?inativos=1`)
- Criar: `src/components/acessos/UsuariosEFuncoes.jsx` (componente de cliente que usa `BarraDeAbas` e `Painel` de
  `src/components/cadastros/Abas.jsx`: as duas tabelas ficam montadas e só escondidas, a aba inicial vem de `?aba=` e a
  troca grava `?aba=` com `router.replace` para o link ser compartilhável), `TabelaUsuarios.jsx`, `TabelaFuncoes.jsx`
- Testar: só no navegador (componentes); as regras já estão testadas nas Tarefas 12 e 13

Linha-guia (spec §5.3): o dono vê primeiro quem tem acesso e com qual função; a ação principal é "Adicionar usuário"
(aba Usuários) ou "Criar função" (aba Funções), no `acao` do `PageHeader`, trocando com a aba.

- [ ] **Passo 1: montar a página** com `PageHeader` (seta para `/configuracoes`), as abas, `CampoBusca` (parâmetro
  `q`), a caixa "mostrar inativos" (parâmetro `inativos`), e as duas tabelas (100 por página, `Paginacao` de
  `src/components/mercados/`): Usuários = Nome, Login, Funções (`Badge` neutro por função; Administrador com `Lock`
  size 12), Último acesso (relativo, `tabular-nums`, `title` com a data completa), selo "você" na própria linha,
  inativo esmaecido com selo; Funções = Nome, Descrição, Usuários, Telas liberadas ("12 de 31"); linha inteira é link.
  Estado vazio da aba Usuários: `EmptyState` "Só você entra no Rise por enquanto." com "Adicionar usuário".
- [ ] **Passo 2: conferir no navegador** a 1366 px e passar por `ecc:make-interfaces-feel-better` (alvos de 40 px,
  `tabular-nums`, foco visível). Corrigir o que a revisão apontar.
- [ ] **Passo 3: `npm run lint`; commit** `feat(acessos): tela Usuarios e funcoes com as duas abas`.

### Tarefa 15: A função e a matriz

**Arquivos:**
- Criar: `src/lib/acessos/matriz.js` (puro: `filtrarRecursos(grupos, busca)` → recursos de todos os grupos cujo rótulo
  ou id casa, com o nome do grupo na frente; `aplicarTodosDaLista(permissoes, recursosVisiveis, nivel)`;
  `contarAlteracoes(original, atual)`; `nivelPorTecla(recurso, tecla)` → `"0"`→nenhum, `"1"`→ver, `"2"`→editar,
  `"3"`→excluir só se válido para o tipo; `permissoesParaEnvio(atual)` → só as acima de `nenhum`)
- Criar: `src/components/acessos/SeletorDeNivel.jsx` (grupo de rádio em segmentos, células 40 × 40, marcada
  `emerald`, teclado: setas e `0 1 2 3`), `MatrizDePermissoes.jsx` (trilho 200 px + lista do grupo + busca + "todos
  desta lista" + cabeçalho `sticky` + rodapé fixo só com alteração), `FormularioFuncao.jsx` (Nome e Descrição numa
  linha; Salvar no `PageHeader`; "⋯" com "Excluir função" por último, popup listando quem a tem; Administrador em
  somente leitura com o selo "Função fixa · vê e edita tudo")
- Criar: `src/app/configuracoes/funcoes/nova/page.jsx`, `src/app/configuracoes/funcoes/[id]/page.jsx`
- Testar: `scripts/teste-acessos.js`, bloco "matriz" (as funções puras)

Linha-guia (spec §5.4): o dono vê primeiro o que a função libera, bloco a bloco; a ação principal é Salvar. **Sem** a
seta de campos (lançamento 3) e **sem** "Ver como" (lançamento 2).

- [ ] **Passo 1: asserções das puras**: `filtrarRecursos(grupos, "custo")` traz `dado.custo` e a tela cuja dica cita
  custo, com `grupoRotulo`; `aplicarTodosDaLista` muda só os visíveis e respeita o nível válido por tipo (ação não
  ganha `ver`); `contarAlteracoes` conta recurso a recurso (`nenhum` ausente = `nenhum` presente); `nivelPorTecla`
  de um cartão com `"2"` devolve `null`; `permissoesParaEnvio` tira os `nenhum`; recurso gravado que não está no
  catálogo não aparece na matriz nem quebra `contarAlteracoes` (foco 4).
- [ ] **Passo 2: ver falhar; implementar as puras; ver passar.**
- [ ] **Passo 3: montar os componentes** (primeiro commit: `feat(acessos): matriz de permissoes (regras puras e
  componentes)`). **Desenho** (spec §5.4 e o "Guia de desenho das telas"): a matriz é um `Card` com `p-0` dividido em
  `flex`: o trilho `w-[200px] shrink-0 border-r border-borda` com um `button` por grupo (`flex w-full items-center
  justify-between px-3 py-2 text-sm`, ativo `bg-fundo font-medium`, à direita "3/4" em `tabular-nums text-xs
  text-suave` e um ponto `h-1.5 w-1.5 rounded-full bg-acento` só com alteração); a lista `min-w-0 flex-1` com o
  cabeçalho `sticky top-0 z-10 bg-superficie border-b border-borda` (a busca local, o `select` "todos desta lista" e
  os títulos das colunas de nível, cada coluna `w-[72px] text-center text-xs text-suave`); cada linha `grid
  grid-cols-[minmax(0,1fr)_repeat(4,72px)] items-center border-b border-borda/60 px-3`, sub-tela com `pl-6` e "›",
  linha esmaecida (`opacity-50`) quando a tela-pai é `nenhum`; o `SeletorDeNivel` é `role="radiogroup"` com um
  `role="radio"` por nível (`h-10 w-10 rounded-md`, marcado `bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300`,
  foco `ring-acento`), coluna de nível que não vale para o tipo fica vazia; o rodapé `sticky bottom-0 border-t
  border-borda bg-superficie px-4 py-2.5` só com alteração, com "N alterações não salvas" em `tabular-nums` à esquerda
  e Cancelar + Salvar à direita. Administrador: tudo `disabled` e o selo no lugar do Salvar.
- [ ] **Passo 4: montar o `FormularioFuncao` e as páginas.** O formulário envia `permissoes` como JSON num campo oculto
  (`permissoesParaEnvio`), o servidor valida com `validarFuncao`. Sair com alteração pede confirmação do navegador
  (`beforeunload`). Depois de salvar: `router.replace` para `/configuracoes/funcoes/<id>` no primeiro Salvar (molde do
  editor do ML).
- [ ] **Passo 5: no navegador** a 1366 px: criar "ZZ Teste", marcar Produtos ver pelo teclado, "todos desta lista"
  em Cadastros, buscar "custo", salvar, reabrir, excluir pelo popup. Revisão `make-interfaces-feel-better`
  (raio concêntrico dos segmentos, `transition-property` explícito, `sticky` sem salto).
- [ ] **Passo 6: `npm run lint`; commit** `feat(acessos): formulario da funcao e as paginas de funcao`.

### Tarefa 16: O usuário

**Arquivos:**
- Criar: `src/components/acessos/FormularioUsuario.jsx` (abas Dados e Acesso, montadas e escondidas; envio manual)
- Criar: `src/app/configuracoes/usuarios/novo/page.jsx`, `src/app/configuracoes/usuarios/[id]/page.jsx`
- Testar: só no navegador (regras já testadas na Tarefa 13)

Linha-guia (spec §5.5): o dono vê primeiro quem é a pessoa e o que ela pode; a ação principal é Salvar. **Sem** linha
Telegram (Entrega C), **sem** aba Histórico e **sem** "Ver como" (lançamento 2), **sem** Excluir (revisão 2) e sem o
popup de destino de conversas (Entrega B).

- [ ] **Passo 1: montar** a aba Dados (Nome; Login com bolha "o mesmo login da tela de entrada do Rise, criado por
  SSH", em minúsculas ao digitar; Assinatura com bolha; interruptor Ativo, desabilitado com o selo "Administrador pelo
  .env" quando `peloEnv`, ou com `title` "último administrador ativo") e a aba Acesso (Funções como caixas de marcação
  com nome, descrição e "12 de 31 telas"; Exceções como tabela compacta Recurso · Nível · lixeira, só quando há
  alguma, com "Adicionar exceção" numa `Janela` (`src/components/riseAi/Janela.jsx`, com `propsDoFundo`) com busca de recurso e
  `SeletorDeNivel`; a linha quieta "Sem função:
  vê só o Painel vazio." some ao marcar uma). Erro do servidor leva à primeira aba com erro e põe o ponto vermelho no
  título (molde `FormularioCliente`).
- [ ] **Passo 2: no navegador**: criar `zz-ac-andrea` com Atendimento, tentar salvar `pc` (recusa), tentar desativar o
  próprio login do `.env` (interruptor travado), adicionar e tirar uma exceção, reabrir. Revisão
  `make-interfaces-feel-better`.
- [ ] **Passo 3: `npm run lint`; commit** `feat(acessos): formulario do usuario (Dados e Acesso)`.

---

## Fase 7: Fechamento

### Tarefa 17: Guarda estático do lançamento 1

**Arquivos:**
- Modificar: `scripts/teste-acessos.js`, bloco "guarda"

**Interfaces:**
- `EXCECOES_DO_LANCAMENTO_1`: lista explícita de arquivos de `src/app/**/{page.jsx,layout.jsx,route.js,acoes*.js}`
  que **ainda não** conferem acesso (todo o Rise fora de `rise-ai` e `configuracoes`), com o comentário "esvaziar no
  lançamento 2". O guarda percorre `src/app` inteiro; arquivo fora da lista tem de conter `exigirAcessoNaPagina(`,
  `sessaoDeAcessos(` + `recusarRota(` ou `executarComAcesso(`; arquivo **na** lista que já contém a conferência faz
  o teste avisar "tire da lista" (a lista só encolhe). `src/app/layout.jsx` e `src/app/api/sair/route.js` ficam numa
  lista `SEM_RECURSO` própria, com o motivo escrito (o layout monta a sessão; o Sair é de quem está logado).
- Confere também por texto que `src/lib/acessos/servidor.js` chama `montarSessao(`, `precisaGravarAcesso(` e
  `notFound(`, e que `src/lib/sessao.js` continua **sem** `import` (regra da spec).

- [ ] **Passo 1: escrever o guarda com a lista**; rodar: tem de passar já (as Tarefas 8, 10, 11, 14 a 16 fizeram a
  parte deles) e falhar se, de propósito, se tirar `exigirAcessoNaPagina` de `src/app/configuracoes/page.jsx`
  (desfazer em seguida).
- [ ] **Passo 2: commit** `test(acessos): guarda estatico das paginas, rotas e acoes do lancamento 1`.

### Tarefa 18: Ritual, documentação e roteiro do dono

**Arquivos:**
- Modificar: `CLAUDE.md` (seção nova "Acessos (lançamento 1)" com o mapa dos arquivos, as regras que custaram pensar,
  o guarda e a lista de exceções; a seção "Rodar" ganha `teste:acessos` e `acessos:admin`; a seção "Fase 2" do Rise AI
  passa a dizer que o L1 está pronto, a ordem com o L2 antes da B, e o que falta para o "sobe"; a pendência 6 da
  segurança da VPS, "o app não confere o login sozinho", é fechada em parte: continua sem `proxy.js`, mas toda rota
  do Rise AI e de Configurações confere)
- Modificar: `.env.example` (já feito na Tarefa 5; conferir)

- [ ] **Passo 1: rodar o ritual**: `npm run lint`, `npm run teste:extracao`, `teste:coleta`, `teste:cadastros`,
  `teste:worker` (sozinho), mais `teste:rise-ai`, `teste:acessos`, `teste:vps`. Tudo verde; a saída de cada um vai
  para arquivo em `dados/diag/` e é lida depois (nunca `| head`).
- [ ] **Passo 2: escrever o CLAUDE.md** e conferir o `git diff` dele: só a minha seção (outra sessão pode estar com o
  arquivo alterado; se estiver, commitar só os meus trechos e conferir o HEAD depois).
- [ ] **Passo 3: o roteiro de testes do dono na tela** (vai na resposta final da sessão e no CLAUDE.md), passo a passo
  com o resultado esperado:
  1. Abrir o Rise do PC: o menu termina em Configurações; Integrações sumiu do menu e virou cartão.
  2. Configurações: três cartões com detalhe vivo ("1 usuário · 2 funções", as conexões, o Padrão do Rise AI).
  3. Usuários e funções › Funções: Administrador (cadeado, abre em somente leitura) e Atendimento; abrir Atendimento e
     ver Produtos em `ver`, os sete dados sensíveis em `ver`, Rise AI › chat em `editar`.
  4. Criar a função "Teste" marcando Cadastros com "todos desta lista" em `ver`; Salvar; o rodapé some; reabrir.
  5. Usuários: o usuário `maicol` (criado pela semeadura a partir de `RISE_AI_ADMINS=maicol`, que entra no `.env` do PC
     para este roteiro) com o selo "Administrador pelo .env" e o interruptor Ativo travado.
  6. Criar o usuário `andrea` (nome Andrea) com a função Atendimento; Salvar.
  7. No `.env` do PC, `RISE_SIMULAR_LOGIN=andrea`, reiniciar o servidor: o rodapé do menu diz "simulando andrea"; o
     menu não tem Configurações; `/configuracoes` dá 404; `/rise-ai/revisao` dá 404; o chat abre e, numa pergunta
     sobre um produto, a resposta traz preço e estoque (Atendimento vê custo, então o custo também aparece quando o
     modelo o cita); o trilho não tem Revisão, Consumo nem Configurações.
  8. Tirar a função Atendimento da `andrea` (como administrador, sem a simulação) e simular de novo: o Rise AI some do
     menu e `/rise-ai` dá 404 (o Painel e os outros blocos continuam abrindo: o filtro deles é do lançamento 2).
  9. Tirar `RISE_SIMULAR_LOGIN`, reiniciar: tudo volta.
  10. Excluir a função "Teste" pelo popup.
- [ ] **Passo 4: commit** `docs(acessos): secao do lancamento 1 no CLAUDE.md e roteiro do dono` e `git push`.
- [ ] **Passo 5: o que fica só com o "sobe" do dono** (não fazer sem ele): `RISE_SEGREDO_DE_BORDA=<openssl rand -hex
  32>` e `RISE_AI_ADMINS=<login do dono>` no `.env` da VPS (por SSH, arquivo temporário, nunca no texto do comando);
  deploy pelo cartão "Atualizar a VPS" (aplica a migration `_acessos` e a do Rise AI, que também espera); conferir
  que o login do dono abre o Rise e que `/configuracoes/usuarios` o mostra como "Administrador pelo .env". A Andrea
  **não** ganha login no Tinyauth ainda (lançamento 2).

---

## Auto-revisão do plano (feita ao escrever)

- **Cobertura da spec (§8, lançamento 1):** tabelas (T1), catálogo com dados sensíveis (T2), `acessos/sessao.js` (T4 e
  T6), invólucro (T6), semeadura (T7), menu e telas 1 a 4 sem "Ver como" e Histórico (T10, T11, T14 a T16), Rise AI
  sob o esquema com o guarda cobrindo `src/app/rise-ai` e `src/app/api/rise-ai` (T8, T9, T17), segredo de borda e
  logins reservados (T4, T5), PC em `127.0.0.1` e `RISE_SIMULAR_LOGIN` (T4, T5), quebra-vidro com selo e semeadura
  que só cria o que falta (T7, T13, T16), auditoria (T13; as ações de configuração do Rise AI entram na auditoria no
  lançamento 2, junto com as abas), `acessos:admin` (T7), `ultimoAcessoEm` a cada 10 min (T4, T6), 404 em tela e
  403 em rota (T6, T8).
- **Fora do lançamento 1, de propósito:** rodapé do menu com a função (spec tela 5, lançamento 2; só a linha
  "simulando <login>" entra, na T10, porque o roteiro do dono precisa dela); Painel e menu filtrados para os outros
  blocos; tela em `ver`; mapa rota → recurso; os 158 invólucros; campos.
- **Consistência de nomes:** `sessaoDeAcessos`, `exigirAcessoNaPagina`, `recusarRota`, `executarComAcesso`,
  `executarComSessao`, `resolverPermissoes`, `podeNo`, `blocosOcultos`, `contarLiberados`, `loginDaRequisicao`,
  `montarSessao`, `normalizarLogin`, `quebraVidro`, `precisaGravarAcesso`, `semearAcessos`, `promoverAdministrador`,
  `listarUsuarios`, `carregarUsuario`, `listarFuncoes`, `carregarFuncao`, `salvarUsuario`, `salvarFuncao`,
  `excluirFuncao`, `validarUsuario`, `validarFuncao`, `podeDesativar`, `filtrarRecursos`, `aplicarTodosDaLista`,
  `contarAlteracoes`, `nivelPorTecla`, `permissoesParaEnvio` são usados com os mesmos nomes em todas as tarefas.
- **Foco da revisão:** 1 → T5 (deploy recusa) e T4 (`"sem-segredo"`); 2 → T4; 3 → T6 e T10; 4 → T3 e T15; 5 → T13;
  6 → T4 e T5.
- **Proporção:** o plano é menor que a spec que implementa; os blocos de código são o schema (o único artefato que o
  construtor não deduziria) e assinaturas.

## Revisão inline (12/10/2026, à noite, sem subagentes)

Revisão de código, arquitetura e segurança feita pela própria sessão sobre o plano, contra o código. O que mudou:

1. **Entrada do bloco Rise AI:** `blocosOcultos` olhava uma "tela do bloco" que o Rise AI não tinha (só capacidades).
   Entrou `tela.riseAi` como entrada, com as capacidades como filhas; o layout exige `tela.riseAi` ver e o chat
   `riseAi.chat` (Tarefas 2, 3, 7, 8).
2. **Escalada por exceção:** `validarUsuario` só conferia catálogo e nível; uma exceção em `tela.configuracoes.usuarios`
   daria a tela de usuários a quem não é administrador. Agora a validação recusa recurso não delegável e
   `resolverPermissoes` ignora qualquer linha gravada para ele (Tarefas 3 e 13).
3. **`Abas.jsx` é por estado, não por link:** a tela Usuários e funções vira um componente de cliente com as duas
   tabelas montadas e `?aba=` só como estado inicial e link compartilhável (Tarefa 14).
4. **Ícone não atravessa servidor → cliente:** `ListaDeConversas` recebe `{ href, rotulo }` e resolve o ícone por
   `href` dentro do componente (Tarefa 8).
5. **`cartaoDoProduto` mora em `busca.js`**, não em `ferramentas/produtos.js` (Tarefa 9).
6. **`detalheDeIntegracoes` precisa dos conectores** (o `Map` de conexões não lista os não configurados) e
   `detalheDoRiseAi` precisa de `PROVEDORES` para o rótulo (Tarefa 11).
7. **`peloEnv` lê `process.env` dentro da lib:** virou parâmetro `env` para o teste (Tarefa 12).
8. **`Json?` nulo é `Prisma.DbNull`** na auditoria (Tarefa 13).
9. **Roteiro do dono, passo 5:** no PC o login é "pc"; o selo "Administrador pelo .env" aparece no usuário `maicol`
   criado pela semeadura com `RISE_AI_ADMINS=maicol` no `.env` do PC (Tarefa 18).
10. **Regra do schema** explícita na Tarefa 1 (as duas outras pastas precisam de `git merge main` antes de migration).
11. **A Tarefa 15 vira dois commits** (regras puras + componentes; formulário + páginas) e ganhou o desenho fechado da
    matriz; o "Guia de desenho das telas" fixa componentes, escala, estados, textos e acabamento para as quatro telas.

Conferido e ok: `cache()` do React é por requisição (layout e página dividem a leitura; nada vaza entre pedidos);
`notFound()` chamado de dentro de uma função da página funciona em página e em layout; `register()` do
`instrumentation.js` roda na partida, antes da primeira requisição, só no runtime Node; `--hostname 127.0.0.1` convive
com `sistema-rise.localtest.me` (resolve para 127.0.0.1); `header_up` com `{env.NOME}` é sintaxe do Caddy 2 e o
`request_header -X-Rise-Borda` global apaga o cabeçalho vindo de fora antes dos `handle`; o ramo público `@arquivos`
nunca ganha o cabeçalho; sem a variável na VPS ninguém entra (nem o quebra-vidro, que precisa do login) e o deploy
recusa antes de trocar os contêineres; `FOR UPDATE` na linha da função Administrador serializa o "último
administrador"; a mensagem da ação recusada só nomeia o recurso que quem chamou já conhece; o teste só grava `zz-ac-*`
e `ZZ-AC *` e devolve o que for do dono.
