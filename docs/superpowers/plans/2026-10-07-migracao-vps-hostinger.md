# Migração do Rise para VPS Hostinger — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colocar o Rise em produção num VPS Hostinger (`https://rise.4hobby.com.br`), com login na frente, worker 24 h, backup em três camadas e as integrações funcionando, mantendo o PC como ambiente de desenvolvimento.

**Architecture:** Docker Compose com `caddy` (HTTPS), `auth` (Tinyauth, `forward_auth`), `app` (`next start`), `worker` (supervisor) e `db` (Postgres 17), todos no VPS; `dados/` em bind mount; backup diário por `npm run backup` dentro do `app`, cópia externa por `rclone` para o Cloudflare R2, aviso por healthchecks.io. Deploy por um script no VPS disparado por SSH quando o dono pedir; o PC restaura cópias do R2 e nunca mais segura tokens do ML e do Bling.

**Tech Stack:** Next 16.3.5+, Node 24, Prisma 7 (`@prisma/adapter-pg`), Postgres 17 (Docker), Caddy 2.11.4+, Tinyauth v5, rclone, cron, Ubuntu LTS.

**Spec:** `docs/superpowers/specs/2026-10-07-migracao-vps-hostinger-design.md`

## Global Constraints

- JavaScript sem TypeScript; identificadores e comentários sem acento; texto de tela com acento (CLAUDE.md).
- Comentários explicam o porquê, não o quê.
- `next` ≥ 16.3.8 e `sharp` ≥ 0.35.5 antes de qualquer porta aberta (o audit de 07/10/2026 estendeu a faixa crítica do `next` até 16.3.7 e acusou o librsvg do `sharp` 0.35.4); Node 24 fixado na imagem.
- Postgres 17, banco UTF8 com ICU `en-US`, `timezone=America/Sao_Paulo`; porta 5432 só em 127.0.0.1.
- `TZ=America/Sao_Paulo` em `app`, `worker` e `db`.
- Travas (`ML_PUBLICACAO`, `BLING_ESCRITA`, `LI_ESCRITA`, `NANO_BANANA_GERACAO`, `PHOTOROOM_COMPRA`) continuam `false` no VPS.
- No VPS, migrations só por `prisma migrate deploy`, depois de dump; nunca `migrate dev` nem `migrate diff` contra o banco do VPS.
- `APP_URL_PUBLICA` só é preenchido depois que `/api/arquivos` responder publicamente (seção 9 da spec).
- Deploy no VPS só quando o dono pedir ("sobe"). Commit, push e merge seguem sem pedir.
- Depois da virada, o PC não pode segurar `Conexao` do ML nem do Bling (refresh tokens rotacionam).
- `.env`, `dados/` e `certificates/` ficam fora do git e da imagem.
- Hostname do login: `auth.rise.4hobby.com.br` (o Tinyauth exige host próprio; a sessão vale para `rise.4hobby.com.br`).

## Review Focus

1. Pedido sem login a `/produtos` deve redirecionar ao login; a `/api/arquivos/<sku>/imagens/<nome>` deve responder 200 sem login. Teste: Task 8, passo 8.
2. `/api/arquivos/../.env` e `/api/arquivos/<sku>/../../.env` devem responder 404, nunca o arquivo. Teste: Task 8, passo 8.
3. Sem `RISE_VERSAO`, a tela mostra `dev`; com `RISE_VERSAO=07.10.2026.22.17` mostra exatamente isso. Teste: Task 2, passo 1.
4. `atualizar-copia.js` precisa recusar `DATABASE_URL` cujo host não é local (nunca restaurar por cima do VPS). Teste: Task 4, passo 1.
5. `auditar-arquivos.js` precisa acusar arquivo faltando e nome com caixa diferente (Linux distingue). Teste: Task 3, passo 1.

---

## Fase A — código no PC (tudo testável sem VPS)

### Task 1: Atualizar `next`, `sharp` e `image-size`

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Atualizar** (servidor e worker desta pasta parados antes: `npm run worker:parar` e o `next dev`)

Run: `npm install --save-exact next@16.3.8 eslint-config-next@16.3.8 sharp@0.35.5` e `npm install image-size@^2.0.4`
Expected: `npm audit` sem aviso em `next`, `sharp` nem `image-size`. Os avisos que sobram são de ferramentas de desenvolvimento (`prisma` CLI, `eslint`) e não rodam no site.

- [ ] **Step 2: Testes sem rede e lint**

Run: `npm run lint && npm run teste:extracao && npm run teste:svg && npm run teste:cotacao && npm run teste:loja-integrada`
Expected: lint sem erro; cada teste termina com 0 falhas.

- [ ] **Step 3: Testes com banco**

Run: `npm run teste:cadastros`, `npm run teste:imagens`, `npm run teste:li-sync` (cada um redirecionado para arquivo, nunca com `| head`)
Expected: 0 falhas em cada.

- [ ] **Step 4: Subir o servidor e abrir três telas** (`/produtos`, `/mercados`, `/canais-de-venda`)

Expected: as três respondem 200 e sem erro no terminal.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "Atualiza next para 16.3.5 e image-size: avisos criticos antes de expor na internet"
```

### Task 2: Versão do deploy no pé do menu

**Files:**
- Create: `src/lib/versao.js`, `scripts/teste-versao.js`
- Modify: `next.config.mjs`, `src/components/Sidebar.jsx:175-189`, `package.json` (script `teste:versao`)

**Interfaces:**
- Produces: `formatarVersao(data: Date) -> string` (`DD.MM.AAAA.HH.MM` no fuso `America/Sao_Paulo`); `versaoDoDeploy(env: object) -> { versao: string, commit: string | null }` (sem `RISE_VERSAO` devolve `{ versao: "dev", commit }`); `NEXT_PUBLIC_RISE_VERSAO` e `NEXT_PUBLIC_RISE_COMMIT` expostos pelo `next.config.mjs`. A Task 6 passa `RISE_VERSAO`/`RISE_COMMIT` como build args com o mesmo formato.

- [ ] **Step 1: Escrever o teste** em `scripts/teste-versao.js` (molde de `scripts/teste-cotacao.js`: `conferir(nome, obtido, esperado)`, SEM rede e SEM banco)

```js
conferir("formatarVersao: Sao Paulo", formatarVersao(new Date("2026-10-08T01:17:00Z")), "07.10.2026.22.17");
conferir("formatarVersao: zero a esquerda", formatarVersao(new Date("2026-01-05T12:03:00Z")), "05.01.2026.09.03");
conferir("versaoDoDeploy: sem variavel", versaoDoDeploy({}), { versao: "dev", commit: null });
conferir("versaoDoDeploy: com variavel", versaoDoDeploy({ RISE_VERSAO: "07.10.2026.22.17", RISE_COMMIT: "9b1c481" }), { versao: "07.10.2026.22.17", commit: "9b1c481" });
conferir("versaoDoDeploy: so commit", versaoDoDeploy({ RISE_COMMIT: "9b1c481" }), { versao: "dev", commit: "9b1c481" });
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run teste:versao` (depois de adicionar `"teste:versao": "node scripts/teste-versao.js"`)
Expected: falha por módulo inexistente.

- [ ] **Step 3: Implementar `src/lib/versao.js`** (sem imports; `formatarVersao` usa `Intl.DateTimeFormat` com `timeZone: "America/Sao_Paulo"`).

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run teste:versao` — Expected: 0 falhas.

- [ ] **Step 5: `next.config.mjs`:** acrescentar `env: { NEXT_PUBLIC_RISE_VERSAO, NEXT_PUBLIC_RISE_COMMIT }` lidos por `versaoDoDeploy(process.env)`; quando `RISE_COMMIT` não vier, tentar `git rev-parse --short HEAD` com `execSync` dentro de `try` (sem git, `null`). Comentário: a versão é a hora do deploy, carimbada pelo script do VPS; no PC fica `dev` para nunca confundir cópia com produção.

- [ ] **Step 6: `Sidebar.jsx`:** acima do botão "Recolher menu", só quando `!recolhida`, um `<p className="px-4 pb-1 text-[10px] text-menu-texto/60" title={commit ? \`commit ${commit}\` : undefined}>Versão {versao}</p>`, com `versao`/`commit` lidos de `process.env.NEXT_PUBLIC_RISE_VERSAO` e `NEXT_PUBLIC_RISE_COMMIT` no topo do arquivo.

- [ ] **Step 7: Verificar na tela:** `npm run dev`, menu expandido mostra `Versão dev`; recolhido não mostra nada; `RISE_VERSAO=07.10.2026.22.17 npm run dev` mostra `Versão 07.10.2026.22.17`.

- [ ] **Step 8: Lint e commit**

```bash
npm run lint
git add src/lib/versao.js scripts/teste-versao.js next.config.mjs src/components/Sidebar.jsx package.json
git commit -m "Versao do deploy no pe do menu (DD.MM.AAAA.HH.MM; dev no PC)"
```

### Task 3: Auditoria de arquivos antes da virada

**Files:**
- Create: `src/lib/auditoriaArquivos.js`, `scripts/auditar-arquivos.js`
- Create: `scripts/teste-migracao.js` (script `teste:migracao`; as regras puras das Tasks 3 e 4)
- Modify: `package.json` (scripts `teste:migracao` e `auditar:arquivos`)

**Interfaces:**
- Consumes: `caminhoDe(sku, tipo, nome)`, `caminhoDaReserva(sku, nome)`, `pastaDoProduto(sku)` de `src/lib/arquivos.js`; `ProdutoArquivo { arquivo, tipo, papel, produto: { sku } }`.
- Produces: `conferirNomes(esperados: string[], existentes: string[]) -> { faltando: string[], caixaDiferente: Array<{ esperado: string, encontrado: string }> }` (comparação exata; `caixaDiferente` quando só a caixa difere).

- [ ] **Step 1: Teste** em `scripts/teste-migracao.js`

```js
conferir("conferirNomes: tudo certo", conferirNomes(["a.jpg"], ["a.jpg"]), { faltando: [], caixaDiferente: [] });
conferir("conferirNomes: faltando", conferirNomes(["a.jpg", "b.pdf"], ["a.jpg"]), { faltando: ["b.pdf"], caixaDiferente: [] });
conferir("conferirNomes: caixa diferente", conferirNomes(["abc.jpg"], ["ABC.jpg"]), { faltando: [], caixaDiferente: [{ esperado: "abc.jpg", encontrado: "ABC.jpg" }] });
```

- [ ] **Step 2: Rodar e ver falhar** — `npm run teste:migracao` falha no import.

- [ ] **Step 3: Implementar `conferirNomes`** em `src/lib/auditoriaArquivos.js` (sem imports).

- [ ] **Step 4: Rodar e ver passar** — 0 falhas.

- [ ] **Step 5: Script `scripts/auditar-arquivos.js`:** lê todo `ProdutoArquivo` com o `sku` do produto, agrupa por pasta (`imagens`, `documentos`, `certificados`, `reserva` conforme `tipo`/`papel`), lê a pasta com `readdir` e aplica `conferirNomes`. Imprime `SKU pasta nome` por problema e termina com código 1 se houver qualquer um; "nenhum problema em N arquivos" com código 0. Comentário: o Windows aceita `a.JPG` por `a.jpg`; o Linux não, e o erro apareceria como 404 só depois da virada.

- [ ] **Step 6: Rodar no PC** — `npm run auditar:arquivos`. Expected: "nenhum problema em 1456 arquivos" (ou a lista a corrigir antes da virada).

- [ ] **Step 7: Commit**

```bash
git add src/lib/auditoriaArquivos.js scripts/auditar-arquivos.js scripts/teste-migracao.js package.json
git commit -m "Auditoria de arquivos: nome exato no disco antes da migracao para Linux"
```

### Task 4: Cópia de desenvolvimento a partir do backup

**Files:**
- Create: `src/lib/copiaLocal.js`, `scripts/atualizar-copia.js`, `scripts/lib/postgres.js`
- Modify: `scripts/backup-banco.js` (usa `scripts/lib/postgres.js`), `scripts/teste-migracao.js`, `package.json` (script `copia:atualizar`), `.env.example` (`RCLONE_REMOTO=r2:rise-backup`)

**Interfaces:**
- Produces: `ehBancoLocal(url: string) -> boolean` (host `localhost`, `127.0.0.1` ou `::1`); `sqlLimparConexoes() -> string` (`DELETE FROM "Conexao" WHERE "servico" IN ('MERCADO_LIVRE', 'BLING')`); `argumentosDeRestore({ dump, banco }) -> { dropdb: string[], createdb: string[], pgRestore: string[] }`; `scripts/lib/postgres.js` exporta `binario(nome)` e `conexaoDaUrl(url)` (hoje dentro de `backup-banco.js`).

- [ ] **Step 1: Teste** em `scripts/teste-migracao.js`

```js
conferir("ehBancoLocal: localhost", ehBancoLocal("postgresql://rise:x@localhost:5432/sistema_rise"), true);
conferir("ehBancoLocal: 127.0.0.1", ehBancoLocal("postgresql://rise:x@127.0.0.1:5432/sistema_rise"), true);
conferir("ehBancoLocal: VPS", ehBancoLocal("postgresql://rise:x@db:5432/sistema_rise"), false);
conferir("ehBancoLocal: ip publico", ehBancoLocal("postgresql://rise:x@187.1.2.3:5432/sistema_rise"), false);
conferir("sqlLimparConexoes: so ML e Bling", sqlLimparConexoes(), `DELETE FROM "Conexao" WHERE "servico" IN ('MERCADO_LIVRE', 'BLING')`);
conferir("argumentosDeRestore: createdb com template0 e ICU", argumentosDeRestore({ dump: "x.dump", banco: "sistema_rise" }).createdb,
  ["--template=template0", "--encoding=UTF8", "--locale-provider=icu", "--icu-locale=en-US", "sistema_rise"]);
conferir("argumentosDeRestore: pg_restore sem dono", argumentosDeRestore({ dump: "x.dump", banco: "sistema_rise" }).pgRestore,
  ["--no-owner", "--no-password", "--dbname=sistema_rise", "x.dump"]);
```

- [ ] **Step 2: Rodar e ver falhar.** `npm run teste:migracao`.

- [ ] **Step 3: Implementar `src/lib/copiaLocal.js`** (sem imports) e extrair `binario`/`conexaoDaUrl` de `backup-banco.js` para `scripts/lib/postgres.js`, sem mudar comportamento.

- [ ] **Step 4: Rodar e ver passar**; `npm run backup` continua gerando e conferindo um dump.

- [ ] **Step 5: Script `scripts/atualizar-copia.js`:** (1) recusa com mensagem se `!ehBancoLocal(DATABASE_URL)`; (2) com `--dump=<arquivo>` usa o arquivo, senão `rclone copy` do mais recente em `${RCLONE_REMOTO}/banco/diario/` para `dados/backup/`; (3) recusa se houver servidor nas portas 3000, 3001 ou 3002 ou worker no ar; (4) `dropdb --if-exists`, `createdb`, `pg_restore` com `argumentosDeRestore`, por `binario()` e `PGPASSWORD`; (5) executa `sqlLimparConexoes()`, salvo com `--manter-conexoes` (só para a volta atrás); (6) `rclone sync ${RCLONE_REMOTO}/produtos dados/produtos` e o mesmo para `coleta`, salvo com `--sem-arquivos`; (7) imprime contagem de `Produto`, `ProdutoColetado` e `Conexao` restantes. Comentário no topo: por que apaga `Conexao` (rotação de refresh token) e por que recusa banco remoto.

- [ ] **Step 6: Ensaio no PC com o dump de hoje, AO LADO do banco de verdade:** `npm run backup`, depois `npm run copia:atualizar -- --banco=sistema_rise_ensaio --dump=dados/backup/<mais recente>.dump`. Expected: as 31 tabelas com as mesmas contagens do banco do sistema, exceto `Conexao` (só LOJA_INTEGRADA no ensaio); mesmo idioma (UTF8, ICU en-US); os três índices só de SQL; o banco do sistema com os três tokens intactos. Depois, `dropdb sistema_rise_ensaio`. (Mudança de 08/10/2026: a opção `--banco` evita apagar o banco do PC, que ainda é a produção, e obrigar o dono a reautorizar ML e Bling só para provar o script. As travas do banco do `.env` — opção desconhecida, banco remoto, servidor no ar, worker vivo — são exercitadas pela recusa, sem apagar nada.)
  - Feito em 08/10/2026: restaurado em 31,9 s; contagens iguais nas 31 tabelas; `Conexao` 3 no sistema, 1 no ensaio; ensaio apagado.

- [ ] **Step 7: Commit**

```bash
git add src/lib/copiaLocal.js scripts/atualizar-copia.js scripts/lib/postgres.js scripts/backup-banco.js scripts/teste-migracao.js package.json .env.example
git commit -m "Copia de desenvolvimento a partir do backup: restore local e limpeza das Conexao do ML e Bling"
```

### Task 5: Imagem e compose do VPS

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `deploy/Caddyfile`
- Modify: `docker-compose.yml` (de 1 para 5 serviços), `.env.example`

**Interfaces:**
- Produces: imagem `rise:latest` (build args `RISE_VERSAO`, `RISE_COMMIT`); serviços `caddy`, `auth`, `app`, `worker`, `db`; volumes `rise-pgdata`, `caddy-data`, `caddy-config`; bind mount `./dados:/app/dados`.

- [ ] **Step 1: `Dockerfile`** (uma etapa, simples de propósito):

```dockerfile
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg git \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update && apt-get install -y --no-install-recommends postgresql-client-17 rsync \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
ARG RISE_VERSAO
ARG RISE_COMMIT
ENV RISE_VERSAO=$RISE_VERSAO RISE_COMMIT=$RISE_COMMIT TZ=America/Sao_Paulo
RUN npm run build
CMD ["npm", "start"]
```

**Scripts de instalação no npm 11:** o `npm install` de 07/10/2026 avisou que `@prisma/engines`, `prisma` e `unrs-resolver` têm scripts "not yet covered by allowScripts". Antes do `npm ci` da imagem, liberar os três (`npm approve-scripts @prisma/engines prisma unrs-resolver`, que grava a regra no `package.json`) e conferir no build que `npx prisma --version` lista o schema engine; sem isso o `prisma migrate deploy` do contêiner pode falhar.

`.dockerignore`: `node_modules`, `.next`, `dados`, `.env*`, `!.env.example`, `certificates`, `.git`, `docs`, `.acentos`. Comentário no Dockerfile: devDependencies ficam porque `dotenv` e `prisma` são usados pelos scripts e pelo `prisma.config.ts`; `postgresql-client-17` é para o `npm run backup` de dentro do contêiner.

- [ ] **Step 2: `docker-compose.yml`** com os cinco serviços:
  - `db`: como hoje, mais `POSTGRES_INITDB_ARGS=--locale-provider=icu --icu-locale=en-US --encoding=UTF8`, `TZ`, `command: postgres -c timezone=America/Sao_Paulo -c shared_buffers=1GB -c work_mem=32MB`, `mem_limit: 1536m`.
  - `app`: `build: { context: ., args: { RISE_VERSAO, RISE_COMMIT } }`, `image: rise:latest`, `env_file: .env`, `volumes: ["./dados:/app/dados"]`, `depends_on: { db: { condition: service_healthy } }`, `mem_limit: 1536m`, sem `ports`.
  - `worker`: `image: rise:latest`, `command: ["node", "scripts/worker.js"]`, mesmos `env_file`, `volumes`, `depends_on`, `mem_limit: 1536m`, `stop_grace_period: 30s`.
  - `auth`: `image: ghcr.io/tinyauthapp/tinyauth:v5`, `environment`: `TINYAUTH_APPURL=https://auth.rise.4hobby.com.br`, `TINYAUTH_AUTH_USERS=${TINYAUTH_AUTH_USERS}`, `TINYAUTH_AUTH_SECURECOOKIE=true`, `TINYAUTH_AUTH_SESSIONEXPIRY=604800`, `TINYAUTH_AUTH_TRUSTEDPROXIES=${CADDY_IP:-172.16.0.0/12}`.
  - `caddy`: `image: caddy:2`, `ports: ["80:80", "443:443"]`, `volumes: ["./deploy/Caddyfile:/etc/caddy/Caddyfile:ro", "caddy-data:/data", "caddy-config:/config"]`.
  - `logging` padrão `json-file` com `max-size: 10m`, `max-file: 5` em todos; `restart: unless-stopped` em todos.

- [ ] **Step 3: `deploy/Caddyfile`**

```
(com_login) {
  request_header -Remote-User
  forward_auth auth:3000 {
    uri /api/auth/caddy
    copy_headers Remote-User
  }
}

auth.rise.4hobby.com.br {
  reverse_proxy auth:3000
}

rise.4hobby.com.br {
  @publico path /api/arquivos/*
  handle @publico {
    reverse_proxy app:3000
  }
  handle {
    import com_login
    reverse_proxy app:3000
  }
}
```

- [ ] **Step 4: `.env.example`:** acrescentar, com comentário de uma linha cada, `TINYAUTH_AUTH_USERS=` (gerar com `htpasswd -nbB usuario senha`, duplicando `$` por `$$`), `RCLONE_REMOTO=`, `HEALTHCHECKS_BACKUP_URL=`, `HEALTHCHECKS_COPIA_URL=`, `BACKUP_MANTER=4`; e a nota de que no VPS `DATABASE_URL` usa o host `db`.

- [ ] **Step 5: Validar a sintaxe** (no PC, se o Docker Desktop estiver utilizável; senão, no VPS na Task 7)

Run: `docker compose config > /dev/null` — Expected: sem erro. `docker run --rm -v "${PWD}/deploy:/d" caddy:2 caddy validate --config /d/Caddyfile --adapter caddyfile` — Expected: "Valid configuration".

**Feito em 08/10/2026, com o que mudou ao executar:**
- `docker compose config` válido no PC (o motor do Docker não precisa estar ligado), cinco serviços com fuso, teto de memória e teto de log. **O `caddy validate` ficou para a Task 8**: ele precisa do motor, e o Docker Desktop do PC não foi ligado (o CLAUDE.md registra que ele trava ao abrir).
- **Build de produção provado sem banco e sem `.env`**, como no Docker: cópia do commit `4be7787` numa worktree temporária, `npm ci` com `DATABASE_URL` falso (o `prisma generate` do postinstall passou) e `npm run build` com o banco apontando para uma porta vazia → build limpo; as páginas que leem o banco ficaram dinâmicas. Subido em modo produção na porta 3005 contra o banco do PC: `/produtos` 369 ms, `/mercados` 1,5 s, `/canais-de-venda` 131 ms, cotação 456 ms; HTML com "Versão 08.10.2026.06.00" e `title="commit 4be7787"`. Worktree apagada depois.
- **Caddyfile com `route`**: o Caddy reordena diretivas soltas, e o `request_header -Remote-User` precisa rodar antes do `forward_auth`.
- **`npm run db:up` / `db:down` passam a mexer só no serviço `db`**: com cinco serviços, o comando antigo tentaria montar o sistema inteiro no PC.
- **`allowScripts` no `package.json`** (`npm approve-scripts @prisma/engines prisma unrs-resolver`, versões fixas): hoje o npm 11 só avisa; uma versão futura vai bloquear, e sem isso o `prisma migrate deploy` do contêiner quebraria.
- **`TINYAUTH_AUTH_USERS` é opcional no compose** (`:-`): obrigatório (`:?`), o `npm run db:up` do PC, que não tem login, deixaria de validar o arquivo. Sem usuário o Tinyauth não sobe e o Caddy recusa tudo (falha fechada).
- **Parar o worker na VPS é `docker compose stop worker`**: com `restart: unless-stopped`, o worker que sai pelo `worker:parar` é religado na hora. O supervisor trata o SIGTERM como o `worker:parar` (devolve as varreduras sem gastar tentativa); `stop_grace_period: 90s`.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore docker-compose.yml deploy/Caddyfile .env.example package.json
git commit -m "VPS: imagem, compose com caddy/auth/app/worker/db e Caddyfile com login na frente"
```

### Task 6: Scripts de operação do VPS

**Files:**
- Create: `deploy/deploy-vps.sh`, `deploy/backup-externo.sh`, `deploy/limpar-logs.sh`, `deploy/crontab`
- Modify: `scripts/backup-banco.js` (`MANTER` lido de `BACKUP_MANTER`, padrão 4)

**Interfaces:**
- Consumes: `rise:latest`/`rise:anterior` (Task 5); `npm run backup`, `npm run worker:parar`.
- Produces: `deploy-vps.sh [ref]` (padrão `origin/main`); `backup-externo.sh` (dump do dia + `produtos`/`coleta` para `$RCLONE_REMOTO`, retenção 30 diários e 12 mensais, ping no `HEALTHCHECKS_COPIA_URL`); `limpar-logs.sh` (apaga `dados/logs/*.log` com mais de 30 dias).

- [ ] **Step 1: `deploy/deploy-vps.sh`** (`set -euo pipefail`, roda em `/srv/rise/app`):
  1. `git fetch origin && git checkout -q "${1:-origin/main}"`;
  2. `VERSAO=$(TZ=America/Sao_Paulo date +%d.%m.%Y.%H.%M)`, `COMMIT=$(git rev-parse --short HEAD)`;
  3. `docker image tag rise:latest rise:anterior || true`; `docker compose build --build-arg RISE_VERSAO=$VERSAO --build-arg RISE_COMMIT=$COMMIT app`;
  4. se `docker compose exec -T app npx prisma migrate status` acusar migration pendente (sai com código diferente de 0): `docker compose exec -T app npm run backup`;
  5. `docker compose stop worker` (SIGTERM: o supervisor devolve as varreduras à fila sem gastar tentativa, como o `worker:parar`; o `worker:parar` sozinho não serve na VPS, porque o `restart: unless-stopped` religa o worker na hora);
  6. `docker compose run --rm app npx prisma migrate deploy`;
  7. `docker compose up -d app worker`;
  8. `curl -s -o /dev/null -w "%{http_code}" https://rise.4hobby.com.br/` deve devolver 302 (login) ou 200;
  9. `git tag -f "vps-$VERSAO" && git push -f origin "vps-$VERSAO"`; imprimir `VERSAO`, `COMMIT`, `docker compose ps`.
  Comentários: por que a imagem anterior fica (volta em um comando) e por que o dump só com migration pendente.

- [ ] **Step 2: `deploy/backup-externo.sh`:** lê `RCLONE_REMOTO` e `HEALTHCHECKS_COPIA_URL` do `.env` com `ler_env() { grep "^$1=" .env | head -1 | cut -d= -f2-; }` (nunca `source .env`: o bcrypt de `TINYAUTH_AUTH_USERS` tem `$$`, que o bash expandiria); `DUMP=$(ls -t dados/backup/sistema_rise-*.dump | head -1)`; `rclone copyto "$DUMP" "$RCLONE_REMOTO/banco/diario/$(basename "$DUMP")"`; no dia 1, também para `$RCLONE_REMOTO/banco/mensal/`; `rclone delete --min-age 30d "$RCLONE_REMOTO/banco/diario"`; `rclone delete --min-age 370d "$RCLONE_REMOTO/banco/mensal"`; `rclone sync dados/produtos "$RCLONE_REMOTO/produtos"`; `rclone sync dados/coleta "$RCLONE_REMOTO/coleta"`; ao final `curl -fsS -m 10 "$HEALTHCHECKS_COPIA_URL"`; em falha (`trap ERR`), `curl "$HEALTHCHECKS_COPIA_URL/fail"`.

- [ ] **Step 3: `deploy/limpar-logs.sh`:** `find dados/logs -name "*.log" -mtime +30 -delete`.

- [ ] **Step 4: `deploy/crontab`** (instalado com `crontab deploy/crontab` pelo usuário `rise`; sem `%` nas linhas, que o cron trata como quebra de linha):

```
0 3 * * *  cd /srv/rise/app && docker compose exec -T app npm run backup && curl -fsS -m 10 "$(grep '^HEALTHCHECKS_BACKUP_URL=' .env | cut -d= -f2-)" >/dev/null
30 3 * * * cd /srv/rise/app && ./deploy/backup-externo.sh
0 4 * * 0  cd /srv/rise/app && ./deploy/limpar-logs.sh
```

- [ ] **Step 5: `backup-banco.js`:** `const MANTER = Number(process.env.BACKUP_MANTER) || 4;`.

- [ ] **Step 6: Validar sintaxe dos shells**

Run: `bash -n deploy/deploy-vps.sh deploy/backup-externo.sh deploy/limpar-logs.sh` (Git Bash) — Expected: sem saída.

- [ ] **Step 7: Commit**

```bash
git add deploy/ scripts/backup-banco.js
git commit -m "VPS: scripts de deploy, copia externa para o R2, limpeza de logs e cron"
```

## Fase B — VPS (precisa do que depende do dono: IP, registros A `rise` e `auth.rise`, chaves do R2, URLs do healthchecks)

### Task 7: Preparar o VPS

- [ ] **Step 1: No painel da Hostinger:** KVM 2, região Brasil, Ubuntu 24.04 LTS, chave SSH pública do PC; firewall com 22, 80 e 443; anotar o IP.
- [ ] **Step 2: Primeiro acesso como root:** instalar o Docker (passo 3) e então `adduser rise && usermod -aG sudo,docker rise`, copiar a chave para `/home/rise/.ssh/authorized_keys`, `PasswordAuthentication no` e `PermitRootLogin no` em `/etc/ssh/sshd_config`, `systemctl restart ssh`.
- [ ] **Step 3: Pacotes:** `apt install -y docker.io docker-compose-v2 fail2ban unattended-upgrades rclone git curl apache2-utils`; `systemctl enable --now docker fail2ban`; `dpkg-reconfigure -plow unattended-upgrades`.
- [ ] **Step 4: Swap de 2 GB:** `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` e a linha no `/etc/fstab`.
- [ ] **Step 5: Projeto:** `mkdir -p /srv/rise && chown rise /srv/rise`; como `rise`: `git clone https://github.com/MaicolDeSouza/projeto-sistema-rise.git /srv/rise/app`; `mkdir -p dados/{produtos,coleta,backup,temporarios,logs}`.
- [ ] **Step 6: `.env` de produção** (`chmod 600`): copiado do `.env` do PC com as trocas da seção 7 da spec; senha nova do banco; `TINYAUTH_AUTH_USERS` gerado com `htpasswd -nbB maicol '<senha>'` com `$` duplicados; `RCLONE_REMOTO`, `HEALTHCHECKS_*`.
- [ ] **Step 7: rclone:** `rclone config` com o remoto `r2` (tipo S3, provedor Cloudflare, chaves do bucket `rise-backup`); `rclone lsd r2:` lista o bucket.
- [ ] **Step 8: Verificar:** `ssh rise@<ip> 'docker --version && docker compose version && rclone version && free -h && swapon --show'` — Expected: versões impressas, 2 GB de swap.

### Task 8: Ensaio geral

- [ ] **Step 1: DNS:** `dig +short rise.4hobby.com.br` e `dig +short auth.rise.4hobby.com.br` devolvem o IP do VPS.
- [ ] **Step 2: Dump e arquivos de ontem:** no PC, `npm run backup`; `scp` do dump para `/srv/rise/app/dados/backup/`; `rsync -az --checksum dados/produtos/ rise@<ip>:/srv/rise/app/dados/produtos/` e o mesmo para `coleta`; conferir `find dados/produtos -type f | wc -l` nos dois lados (1456 em 07/10).
- [ ] **Step 3: Subir só o banco e restaurar:** `docker compose up -d db`; `docker compose run --rm app bash -c 'pg_restore --no-owner --no-password --dbname="$DATABASE_URL" dados/backup/<dump>'`; **apagar `Conexao` do ML e Bling** (`docker compose exec db psql -U rise -d sistema_rise -c "DELETE FROM \"Conexao\" WHERE \"servico\" IN ('MERCADO_LIVRE','BLING')"`).
- [ ] **Step 4: Conferir o banco:** `SELECT pg_encoding_to_char(encoding), datlocprovider FROM pg_database WHERE datname='sistema_rise'` → `UTF8`, `i`; `SELECT count(*) FROM _prisma_migrations` → o mesmo do PC; `\di` mostra `Job_fonte_aberta`, `Anuncio_um_por_produto` e `ProdutoColetado_buscaTexto_trgm`; `SHOW timezone` → `America/Sao_Paulo`.
- [ ] **Step 5: Build e subida:** `./deploy/deploy-vps.sh` (primeira vez constrói tudo). Expected: `docker compose ps` com os cinco serviços `running`; versão impressa.
- [ ] **Step 6: Certificado e login:** abrir `https://rise.4hobby.com.br` → redireciona para `auth.rise.4hobby.com.br`, cadeado válido; entrar; voltar ao Rise; a versão aparece no pé do menu. No navegador, o cookie de sessão tem `Domain` em `rise.4hobby.com.br` (ou abaixo), nunca em `4hobby.com.br` solto; se for o segundo caso, registrar e decidir com o dono antes da virada.
- [ ] **Step 7: Testes dentro da imagem:** `docker compose exec app npm run teste:extracao && docker compose exec app npm run teste:svg && docker compose exec app npm run teste:cotacao && docker compose exec app npm run teste:versao` → 0 falhas (prova `sharp`, VTracer e Node na imagem Linux).
- [ ] **Step 8: Superfície pública, sem cookie:** `curl -sI https://rise.4hobby.com.br/produtos | head -1` → `302`; `curl -sI "https://rise.4hobby.com.br/api/arquivos/<sku>/imagens/<nome>"` → `200`; `curl -sI --path-as-is "https://rise.4hobby.com.br/api/arquivos/../.env"` e `.../<sku>/../../.env` → `404`; `curl -sI https://rise.4hobby.com.br/api/temporarios/x/y` → `302`; `curl -sI --path-as-is "https://rise.4hobby.com.br/api/arquivos/../produtos"` → `302` (o caminho público não pode virar atalho para o resto do sistema); `curl -sI -H "Remote-User: maicol" https://rise.4hobby.com.br/produtos` → `302` (cabeçalho forjado não passa pelo login). Também: `docker compose exec caddy caddy version` → 2.11.4 ou maior, e `docker compose run --rm caddy caddy validate --config /etc/caddy/Caddyfile` → "Valid configuration".
- [ ] **Step 9: Roteiro funcional, logado:** lista de Produtos; abrir um produto com fotos; enviar uma foto e um PDF num produto de teste `ZZ-VPS-1` e apagá-lo; Mercados com busca (resposta em ms); Fontes mostra "worker no ar"; Ferramentas: SVG de um PNG e cotação; `/integracoes` mostra ML e Bling como "não conectados" (esperado no ensaio) e a LI lendo. Se algum Salvar devolver "Invalid Server Actions request", acrescentar `experimental.serverActions.allowedOrigins: ["rise.4hobby.com.br"]` no `next.config.mjs` e refazer o deploy.
- [ ] **Step 10: Medir o IP de data center:** `docker compose exec app npm run teste:fonte -- <url>` para cada uma das oito fontes (as de 10 s de `Crawl-delay` levam minutos). Anotar quem respondeu e quem bloqueou. Quem bloquear entra no plano B (seção 12 da spec) na Task 13.
- [ ] **Step 11: Deploy repetido:** `./deploy/deploy-vps.sh` de novo → versão nova na tela, `rise:anterior` existe (`docker images rise`), parada de segundos.

### Task 9: Backups ativos e restore de teste

- [ ] **Step 1:** `crontab deploy/crontab` como `rise`; `crontab -l` confere.
- [ ] **Step 2:** Rodar à mão: `docker compose exec -T app npm run backup && ./deploy/backup-externo.sh` → `rclone ls r2:rise-backup/banco/diario` mostra o dump; `rclone size r2:rise-backup/produtos` bate com o tamanho local; healthchecks verde nos dois checks.
- [ ] **Step 3: Restore de teste no PC, ao lado do banco de verdade:** `npm run copia:atualizar -- --banco=sistema_rise_ensaio` (baixa o dump mais novo do R2; precisa do rclone no PC e de `RCLONE_REMOTO` no `.env`) → contagens iguais às do VPS; depois `dropdb sistema_rise_ensaio`. Os tokens do PC, que ainda é a produção, não são tocados.
- [ ] **Step 4:** Snapshot manual do VPS no painel da Hostinger, nomeado `antes-da-virada`.

### Task 10: Revisão de código antes da virada

- [ ] **Step 1:** `/code-review src/app/api high --max-findings all` e `/code-review deploy high` (Dockerfile, compose, Caddyfile, scripts das Tasks 3, 4, 6 incluídos pelo diff da `main` desde `9b1c481`).
- [ ] **Step 2:** Para cada achado real: corrigir com teste onde houver lógica, `npm run lint`, commit por achado. Achados que o dono decidir não corrigir ficam registrados no CLAUDE.md como pendência.
- [ ] **Step 3:** `./deploy/deploy-vps.sh` com as correções e repetir a Task 8, passo 8.

### Task 11: Redirects, documentação e memória

- [ ] **Step 1: ML:** no DevCenter, acrescentar `https://rise.4hobby.com.br/api/oauth/mercadolivre/callback` (manter a do localtest.me até a volta atrás vencer); no `.env` do VPS, `ML_REDIRECT_URI` com esse valor.
- [ ] **Step 2: Bling:** no aplicativo (Cadastros > Aplicativos), acrescentar `https://rise.4hobby.com.br/api/oauth/bling/callback`; `BLING_REDIRECT_URI` no `.env` do VPS.
- [ ] **Step 3: CLAUDE.md, seção "Rodar na VPS":** pastas, serviços, `deploy-vps.sh`, as três camadas de backup, a regra das `Conexao` no PC, `copia:atualizar`, o plano B do worker, a versão no pé do menu, e a nota de que a "Pendência registrada" de fotos e estoque automático foi destravada pela `APP_URL_PUBLICA`. Atualizar o `.env.example` se algo mudou no ensaio.
- [ ] **Step 4: Segundo fator no login**, à escolha do dono: TOTP do Tinyauth (guia "Two-Factor Authentication": o segredo entra como terceiro campo em `TINYAUTH_AUTH_USERS`, `usuario:hash:segredo`) ou entrada com conta Google (`TINYAUTH_OAUTH_PROVIDERS_GOOGLE_CLIENTID`, `TINYAUTH_OAUTH_PROVIDERS_GOOGLE_CLIENTSECRET` e `TINYAUTH_OAUTH_WHITELIST` com os e-mails dele; exige um cliente OAuth no Google Cloud com o redirect do `auth.rise.4hobby.com.br`). Testar o login de novo.
- [ ] **Step 5:** `docker compose up -d` no VPS para reler o `.env`.
- [ ] **Step 6: Commit e push** (`CLAUDE.md`, `.env.example`).

### Task 12: Virada (uma noite, com o dono avisado)

- [ ] **Step 1: PC:** `npm run worker:parar`; parar os servidores das três pastas; confirmar `netstat -ano | findstr :3000` vazio (e 3001, 3002).
- [ ] **Step 2: PC:** `npm run backup` (dump final, conferido pelo próprio script); `scp` do dump; `rsync -az --checksum --delete` de `produtos` e `coleta`; contagem de arquivos igual nos dois lados.
- [ ] **Step 3: VPS:** `docker compose stop app worker`; `docker compose exec db psql -U rise -d postgres -c 'DROP DATABASE sistema_rise'` e `CREATE DATABASE sistema_rise TEMPLATE template0 ENCODING 'UTF8' LOCALE_PROVIDER icu ICU_LOCALE 'en-US'`; `pg_restore` do dump final (sem apagar `Conexao` desta vez); conferências da Task 8, passo 4, mais contagem de `Produto`, `ProdutoColetado`, `ProdutoArquivo`, `Conexao` igual à do PC.
- [ ] **Step 4: VPS:** `./deploy/deploy-vps.sh`; entrar; `/integracoes`: testar ML e Bling (primeira renovação de token, com o PC parado) e a LI.
- [ ] **Step 5: Roteiro funcional da Task 8, passo 9**, com dados reais, mais um backup manual e `rclone ls` confirmando.
- [ ] **Step 6:** Enfileirar uma fonte pequena em Fontes e acompanhar até fechar; depois as demais (as bloqueadas no ensaio ficam para o plano B).
- [ ] **Step 7: PC, antes de qualquer servidor subir:** `npm run copia:atualizar` (apaga as `Conexao` locais do ML e do Bling). Só então o PC volta a ser ambiente de desenvolvimento.
- [ ] **Step 8:** Preencher `APP_URL_PUBLICA=https://rise.4hobby.com.br` no `.env` do VPS **só depois** do passo 5 confirmar `/api/arquivos` público; `docker compose up -d`. Avisar o dono de que a próxima sincronização com a LI passa a levar o bloco "Documentos".

### Task 13: Pós-virada e volta atrás

- [ ] **Step 1: Janela de 48 h:** o ambiente do PC fica intacto (fora as `Conexao`). Volta atrás, se precisar: `docker compose stop app worker` no VPS; `docker compose exec -T app npm run backup`; `scp` do dump de volta; `npm run copia:atualizar -- --dump=<dump do VPS> --manter-conexoes` no PC; reautorizar ML e Bling no PC; `rsync` dos arquivos de volta.
- [ ] **Step 2: Plano B do worker** para as fontes que bloquearam no ensaio: no PC, `ssh -N -L 5433:127.0.0.1:5432 rise@<ip>` e `DATABASE_URL=postgresql://rise:<senha>@127.0.0.1:5433/sistema_rise COLETA_FONTES=<ids> npm run worker`. Registrar no CLAUDE.md quais fontes rodam assim.
- [ ] **Step 3: Primeira foto mensal (dia 14):** conferir `SELECT mes, count(*) FROM "FotoMensalColeta" GROUP BY mes ORDER BY mes` e o `tiradaEm` em UTC; comparar com a foto anterior.
- [ ] **Step 4: Fechar a janela:** remover a URI do localtest.me do DevCenter do ML e do Bling; registrar a data no CLAUDE.md; memória do gerente atualizada (migração concluída, versão no ar).
