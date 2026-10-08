# Migração do Rise para VPS Hostinger

Data: 07/10/2026 · Caminho: arquitetural (brainstorming aprovado seção a seção) · Aguarda revisão da spec escrita.

## 1. Objetivo

O Rise sai do PC do dono e passa a rodar num VPS da Hostinger, em `https://rise.4hobby.com.br`, com login na
frente, worker rodando 24 h, backup automático em três camadas e as integrações (Mercado Livre, Bling, Loja
Integrada) funcionando com o endereço novo. O PC continua sendo o ambiente de desenvolvimento; o VPS vira a
produção e a única fonte de verdade do banco e dos arquivos.

Sucesso: o dono abre rise.4hobby.com.br no navegador ou no celular, passa pelo login, vê no pé do menu a
versão que está no ar, usa todas as telas com a mesma velocidade ou mais, a varredura de fornecedores corre de
noite sem o PC ligado, e um disco perdido (do PC ou do VPS) não leva nem o banco nem as fotos.

## 2. Contexto medido (07/10/2026)

- **Banco:** PostgreSQL 17.11, 407 MB, UTF8 com ICU `en-US`, extensão `pg_trgm`, 40 migrations aplicadas.
  Maiores tabelas: `ProdutoColetado` 328 MB (68.510 linhas), `FotoMensalColeta` 38 MB (65.858 linhas, uma
  foto), `PrecoHistorico` 17 MB. Crescimento: cerca de 38 MB por foto mensal (~450 MB/ano). Dump no formato
  custom: 83,6 MB.
- **O que o código exige do banco:** `pg_trgm`, `FOR UPDATE SKIP LOCKED` (fila do worker), `FOR UPDATE`
  (estoque e saldos), `pg_try_advisory_lock` numa conexão própria (um worker por vez), três índices que só
  existem no SQL (`Job_fonte_aberta`, `Anuncio_um_por_produto`, o de trigramas), `pg_dump`/`pg_restore`. Os
  seis usos de `NOW()` em SQL cru já convertem com `AT TIME ZONE 'UTC'`. Tudo é Postgres comum.
- **Arquivos (`dados/`):** `produtos` 162 MB (1.249 pastas de SKU, 1.456 arquivos, todos com nome em
  minúsculas), `coleta` 33 MB, `backup` 372 MB (4 dumps), `temporarios` 30 MB, `logs` pequeno. Os caminhos
  são resolvidos por `process.cwd()/dados`. **Hoje fotos e originais de fornecedor não têm backup nenhum.**
- **Aplicação:** Next 16.3.1 (dois avisos críticos de execução remota; correção na 16.3.5), Node 24.19,
  npm 11.17, sem Dockerfile, nada fixa a versão do Node. `next dev --experimental-https` por causa do OAuth do
  ML; `next start` não tem HTTPS. `serverExternalPackages`: `pdf-parse`, `@visioncortex/vtracer`, `sharp`.
  O supervisor do worker trata `SIGTERM` e encerra em ~1 s devolvendo as varreduras à fila.
- **Rotas de API:** `/api/arquivos/[...caminho]` (fotos e documentos), `/api/temporarios/[...caminho]`,
  `/api/mercados/miniatura/[id]`, `/api/mercados/arquivo-fonte/[id]/[nome]`,
  `/api/produtos/documento-referencia`, `/api/oauth/[servico]/iniciar` e `.../callback`.
- **Segurança hoje:** o Rise **não tem autenticação**. Guarda tokens do ML, Bling e LI cifrados em `Conexao`
  (AES-256-GCM com `ENCRYPTION_KEY`) e travas de escrita em `.env`.
- **Git:** `github.com/MaicolDeSouza/projeto-sistema-rise`, branch `main`, sem tags; worktrees `agente-1` e
  `agente-2`; `.env`, `dados/`, `certificates/` e `src/generated/prisma` fora do git.
- **Domínio e e-mail:** `4hobby.com.br` registrado no Registro.br; zona DNS e assinatura do Google Workspace na
  conta Hostinger antiga (`contato4hobby@gmail.com`); `www` aponta para a Loja Integrada. O VPS fica na conta
  nova (`pessoal.maicol@gmail.com`).
- **Hostinger (preços em 07/10/2026):** KVM 2 = 2 vCPU, 8 GB, 100 GB NVMe, R$ 43,99/mês promocional em
  contrato de 2 anos, renovação R$ 77,99/mês; IP dedicado, backup semanal e snapshots incluídos; região
  escolhida na criação e não muda depois.

## 3. Decisões do dono (brainstorming de 07/10/2026)

1. **Banco: Postgres 17 em Docker no próprio VPS** (Opção 1). Supabase e Postgres gerenciado foram descartados:
   o Rise não usa auth, storage nem realtime; o banco já passa dos 500 MB do plano grátis; o Pro custaria mais
   que o VPS; latência de rede no worker e na tela Mercados; a trava do worker exige conexão direta; e a regra
   do projeto é Postgres sem porta pública.
2. **Cópia externa dos backups no Cloudflare R2** (Opção 1), 10 GB grátis, chaves fixas.
3. **Aplicação em Docker Compose** com quatro serviços mais o de login (Opção 1); build na própria VPS.
4. **Login por um serviço na frente do Rise** (Tinyauth; Authelia se quisermos o mais maduro), ligado ao Caddy
   por `forward_auth` (Opção 1 revisada). A tela de login dentro do Rise fica como melhoria futura.
5. **DNS e e-mail ficam na Hostinger da conta antiga.** Só entra o registro A `rise` → IP do VPS (depois
   `blog` e `maicol`). Nada muda no Registro.br, na loja ou no e-mail. Consequência aceita: o Cloudflare Access
   não se aplica, e a conta antiga vira dependência permanente da loja.
6. **Deploy só quando o dono pedir** ("sobe"). Commit, push e merge seguem sem pedir.
7. **Versão na tela:** o pé do menu lateral mostra a hora do deploy no formato `DD.MM.AAAA.HH.MM`
   (ex.: `07.10.2026.22.17`); é o mesmo valor da tag de deploy.
8. **Revisão de código antes da virada, como passo do plano** (não agora): um `/code-review` em nível alto
   cobrindo a superfície pública (`src/app/api`, envio de arquivos, Server Actions que recebem dado do
   navegador) e o código novo da migração (Dockerfile, compose, Caddy, scripts).
9. **Plano VPS: KVM 2, região Brasil, contrato de 2 anos.**
10. **Blog e sistema pessoal ficam fora desta spec** (seção 12).

## 4. Arquitetura no VPS

```
internet ──443/80──▶ caddy ──forward_auth──▶ auth (Tinyauth)
                      │
                      ├── rise.4hobby.com.br/api/arquivos/*  ──▶ app:3000   (sem login)
                      └── rise.4hobby.com.br/*               ──▶ app:3000   (com login)

app (next start)  ─┐
worker (supervisor)─┼──▶ db (postgres:17, só na rede interna; porta 5432 publicada só em 127.0.0.1)
                    │
                    └──▶ /srv/rise/app/dados (bind mount, compartilhado por app e worker)
```

- **Pastas:** projeto em `/srv/rise/app` (clone do git), `dados/` dentro dele, dono o usuário da aplicação.
  `.env` com permissão só do dono, carregado pelo `env_file` do compose, nunca copiado para a imagem.
- **Serviços do compose:** `caddy`, `auth`, `app`, `worker`, `db`. `app` e `worker` usam a **mesma imagem**
  (Node 24 fixado, Debian slim, cliente do Postgres 17 instalado para o `npm run backup`, devDependencies
  incluídas porque os scripts usam `dotenv`). Todos com `restart: unless-stopped`; `app` e `worker` dependem
  de `db` saudável (healthcheck que já existe).
- **Fuso:** `TZ=America/Sao_Paulo` em `app`, `worker` e `db`, para nome de log, carimbo de backup, dia 14 e
  consultas manuais continuarem como no PC.
- **Memória (KVM 2, 8 GB):** `db` 1,5 GB com `shared_buffers` 1 GB; `app` 1,5 GB; `worker` 1,5 GB; `caddy` e
  `auth` quase nada; `next build` usa ~2 GB por alguns minutos. Swap de 2 GB como segurança. Logs do Docker
  com rotação (`max-size`), para não encher o disco.
- **Portas:** só o `caddy` publica 80 e 443. O firewall da Hostinger aceita 22, 80 e 443 e nada mais.

## 5. Banco

- Imagem `postgres:17`, banco criado com `POSTGRES_INITDB_ARGS="--locale-provider=icu --icu-locale=en-US
  --encoding=UTF8"`, igual ao de hoje; sem isso a imagem usaria a ordenação libc e a ordem de nomes com acento
  mudaria de leve. `timezone=America/Sao_Paulo` na configuração do servidor.
- Usuário `rise` com **senha nova e forte**; `DATABASE_URL` aponta para o host `db`. A porta 5432 continua
  publicada só em 127.0.0.1 (o compose já faz isso) e fechada no firewall.
- Restore com `pg_restore --no-owner --dbname=sistema_rise <dump>`. O dump leva `CREATE EXTENSION pg_trgm`,
  os três índices só de SQL e `_prisma_migrations`. Conferência obrigatória depois: contagem tabela a tabela
  contra o PC, os três índices presentes, o mesmo número de migrations do PC (40 em 07/10/2026),
  `prisma migrate status` limpo.
- No VPS as migrations rodam **só** por `prisma migrate deploy`, à mão, no deploy, depois de dump. Nunca
  `migrate dev` nem `migrate diff` contra o banco do VPS.
- A `ENCRYPTION_KEY` do `.env` do VPS é a mesma do PC; sem ela os tokens em `Conexao` viram lixo e o erro
  parece falha de API.

## 6. Arquivos e backups

- **Transferência:** `rsync` por SSH de `dados/produtos` e `dados/coleta` (~195 MB), com `--checksum` e
  contagem de arquivos conferida. Antes, um script (`scripts/auditar-arquivos.js`) lê cada `ProdutoArquivo` e
  confirma que o arquivo existe no disco com o nome exato (Linux distingue maiúsculas); o que faltar aparece
  antes da virada.
- **Limpeza:** cron apaga `dados/logs/*.log` com mais de 30 dias; `temporarios` já se limpa em 24 h.
- **Camada 1, diário no VPS:** cron às 03:00 roda `npm run backup` dentro do contêiner `app` (o script de hoje,
  com `PG_BIN` apontando para o cliente 17 da imagem). Ele já confere o dump com `pg_restore --list` e guarda
  os 4 mais recentes em `dados/backup`.
- **Camada 2, cópia externa diária (R2):** `rclone` envia o dump do dia e sincroniza `produtos` e `coleta`
  para um bucket privado. Retenção: 30 dumps diários e 12 mensais (o do dia 1 fica 12 meses), ~3,5 GB no
  total. Fecha a pendência do CLAUDE.md sobre o histórico das fotos mensais sobreviver a um disco perdido.
- **Camada 3, Hostinger:** backup semanal do VPS inteiro (incluído) e snapshot manual antes de cada
  migration e de cada mudança de infraestrutura.
- **Aviso de falha:** cada rotina (backup, cópia, limpeza) bate numa URL do healthchecks.io ao terminar; sem a
  batida no horário, chega e-mail ao dono. Backup que falha em silêncio só aparece no dia da perda.
- **Restore de teste mensal:** é o script da cópia de desenvolvimento (seção 10), que restaura o último dump do
  R2 no PC. Toda atualização da cópia prova que o backup restaura.
- `ENCRYPTION_KEY`, senha do banco e o `.env` ficam no cofre de senhas do dono, não no bucket nem no git.

## 7. Aplicação

- **Produção = `next build` + `next start`** na porta 3000, sem `--experimental-https`: o TLS fica no Caddy,
  que emite e renova o certificado pela Let's Encrypt sozinho. Medido no CLAUDE.md: produção é 2 a 4 vezes mais
  rápida que o modo dev.
- **Dockerfile** (novo): `node:24-bookworm-slim`, `apt install postgresql-client-17` (repositório PGDG),
  `npm ci`, `npm run build`, `CMD ["npm","start"]`; o `worker` sobrepõe o comando com `node scripts/worker.js`.
  `.dockerignore` deixa de fora `node_modules`, `.next`, `dados`, `.env*`, `certificates`.
- **Antes de qualquer porta aberta:** atualizar `next` para ≥ 16.3.5 e `image-size`, rodando os testes do
  projeto (`teste:extracao`, `teste:imagens`, `teste:svg`, `teste:cotacao` e os de banco).
- **Variáveis que mudam:** `DATABASE_URL` (host `db`, senha nova), `APP_URL=https://rise.4hobby.com.br`,
  `APP_URL_PUBLICA` (ver seção 9), `ML_REDIRECT_URI` e `BLING_REDIRECT_URI` com o domínio novo, `TZ`.
  **Ficam iguais:** `ENCRYPTION_KEY`, as travas (`ML_PUBLICACAO`, `BLING_ESCRITA`, `LI_ESCRITA`,
  `NANO_BANANA_GERACAO`, `PHOTOROOM_COMPRA`), as chaves de API. O `.env.example` continua sendo o contrato.
- **Server Actions atrás de proxy:** o Caddy repassa `Host` e `X-Forwarded-*`; se o Next recusar com "Invalid
  Server Actions request", entra `experimental.serverActions.allowedOrigins: ["rise.4hobby.com.br"]`.
- **Versão na tela:** o deploy passa `RISE_VERSAO` (ex.: `07.10.2026.22.17`) e `RISE_COMMIT` (hash curto)
  como build args; o `next.config.mjs` os expõe como `NEXT_PUBLIC_RISE_VERSAO`/`NEXT_PUBLIC_RISE_COMMIT`. O
  pé do menu lateral (o componente da barra lateral, onde vive `SidebarItem.jsx`) mostra a versão em texto
  pequeno (`text-suave`), com o hash no `title`;
  escondida quando o menu está recolhido. Sem as variáveis (PC), mostra `dev` e o hash do `HEAD` lido pelo
  `next.config.mjs` no início, ou só `dev` se o git não responder. Nada vai ao banco.

## 8. Acesso e segurança

- **Login:** contêiner `auth` (Tinyauth) na frente do Rise via `forward_auth` do Caddy. Entrada por conta Google
  ou usuário e senha com código de 2 fatores; só os e-mails do dono na lista; sessão lembrada no navegador. Se
  o `auth` cair, o Caddy recusa tudo (falha fechada).
- **Exceção pública:** `/api/arquivos/*` sem login. É o que o Bling, a LI e o cliente da loja buscam via
  `APP_URL_PUBLICA`; nomes são hashes de 32 caracteres dentro da pasta do SKU, conteúdo já público na loja.
  Todo o resto exige login, inclusive `/api/oauth/*` (o callback passa pelo navegador do dono, já autenticado)
  e `/api/temporarios/*`.
- **SSH:** só por chave, sem senha, usuário comum com `sudo`, `fail2ban`. O IP de casa do dono muda, então o
  SSH não pode ser travado por IP.
- **Firewall da Hostinger:** 22, 80, 443. Nada mais publicado.
- **Sistema:** atualizações de segurança automáticas (`unattended-upgrades`); a imagem do Rise é reconstruída
  a cada deploy.
- **Snapshot** do VPS antes de qualquer mudança de infraestrutura.

## 9. DNS e integrações

- **DNS:** na zona da Hostinger (conta antiga), o dono cria **dois** registros A: `rise` → IP do VPS e
  `auth.rise` → IP do VPS (o Tinyauth exige um host próprio para a tela de login; com ele em
  `auth.rise.4hobby.com.br`, a sessão vale para `rise.4hobby.com.br` e não vaza para `www`). Mais tarde,
  `blog` e `maicol` do mesmo jeito. Nada muda em `@`, `www`, MX ou TXT. Pedir ao suporte da Hostinger, por
  escrito, a confirmação de que a zona continua caso a assinatura do Workspace mude ou vença; se um dia a
  conta antiga sair de cena, o plano B é a zona no Cloudflare (desenho apresentado no brainstorming).
- **Mercado Livre:** cadastrar `https://rise.4hobby.com.br/api/oauth/<servico>/callback` no DevCenter (sem
  remover a URI antiga do localtest.me até a volta atrás vencer) e trocar `ML_REDIRECT_URI`. Os tokens em
  `Conexao` seguem válidos depois do restore; se falhar, reautorizar pela tela Integrações.
- **Bling:** mesma troca de redirect no aplicativo e no `.env`. **O refresh token rotaciona a cada uso**:
  depois da virada só o VPS pode renová-lo (regra da seção 10).
- **Loja Integrada:** Personal Token, sem URL. `APP_URL_PUBLICA` **só é preenchido depois** de conferir que
  `/api/arquivos` responde publicamente, porque ele liga o bloco "Documentos" na descrição enviada à loja.
- **Anthropic, Gemini, Photoroom, ViaCEP, Banco Central, AwesomeAPI:** chaves e chamadas de saída; nada muda.
- **E-mail:** nada muda.

## 10. Desenvolvimento e deploy depois da virada

- **Dois mundos:** produção é o VPS e só roda a `main` do GitHub; desenvolvimento continua no PC (worktrees,
  `main` para integrar, Postgres local). O banco e o `dados/` do VPS são a única fonte de verdade.
- **Deploy** (`scripts/deploy-vps.sh`, no VPS, disparado pelo gerente por SSH quando o dono pedir):
  1. `git fetch` + `checkout` da `main`; construir a imagem nova com o sistema no ar, passando `RISE_VERSAO`
     e `RISE_COMMIT`.
  2. Se houver migration pendente, dump rápido do banco.
  3. `npm run worker:parar` (devolve as varreduras à fila sem gastar tentativa; a retomada de 3 dias segue de
     onde parou).
  4. `prisma migrate deploy`.
  5. `docker compose up -d` de `app` e `worker` com a imagem nova; conferir que a tela responde e `compose ps`.
  6. Tag git `vps-DD.MM.AAAA.HH.MM` (o mesmo valor da versão na tela); imagem anterior guardada como
     `rise:anterior`.
  Parada medida em segundos. Voltar código é `up -d` com `rise:anterior`; voltar migration é o dump do passo 2
  (as migrations do projeto não têm caminho de volta).
- **Migrations** nascem no PC, com a regra do schema do CLAUDE.md (inclusive tirar à mão os `DROP INDEX` dos
  índices só de SQL). O VPS só aplica.
- **Cópia de desenvolvimento** (`scripts/atualizar-copia.js`): baixa o último dump do R2, restaura no Postgres
  local (template0, UTF8, ICU), sincroniza `produtos` e `coleta` para o PC e **apaga as linhas de `Conexao`
  do ML e do Bling** (tokens que rotacionam; a cópia viva derrubaria a produção). O token da LI é fixo e fica.
- **Regras de operação:** mudar o `.env` do VPS exige `docker compose up -d` (travas lidas uma vez); o worker
  de verdade só existe no VPS, no PC sobe só com a loja falsa dos testes ou com `COLETA_FONTES` no plano B;
  o CLAUDE.md ganha a seção "Rodar na VPS".

## 11. Virada e volta atrás

**Antes da virada (Rise ainda no PC, sem parar nada):**

1. VPS pronto: KVM 2, região Brasil, Ubuntu LTS, usuário com chave SSH, firewall, Docker, swap.
2. Código pronto e testado na `main`: Dockerfile, compose, Caddyfile, `auth`, `deploy-vps.sh`, cópia para o
   R2, limpeza de logs, `atualizar-copia.js`, `auditar-arquivos.js`, versão na tela, `next` ≥ 16.3.5.
3. **Revisão de código** (decisão 8): superfície pública e código novo da migração; o que for achado real é
   corrigido antes de seguir.
4. Redirects novos cadastrados no DevCenter do ML e no aplicativo do Bling.
5. **Ensaio geral** no VPS com o dump de ontem e cópia dos arquivos: tudo no ar em rise.4hobby.com.br, login,
   telas, foto, documento, PDF de fornecedor, SVG. **Regra dura:** a cópia do ensaio tem `Conexao` do ML e do
   Bling apagadas, senão o VPS renova os tokens e derruba o PC, que ainda é a produção.
6. **Medição do IP de data center:** `teste:fonte` nas oito fontes a partir do VPS (só valida, não grava).
7. Backup diário, cópia para o R2, healthchecks e um restore de teste pelo `atualizar-copia.js`.

**A virada (janela de uma noite):**

1. No PC: `worker:parar` e parar os servidores das três pastas. Nada mais grava.
2. `npm run backup` final, conferido; `rsync` final de `produtos` e `coleta`.
3. No VPS: derrubar `app` e `worker`; descartar o banco do ensaio; restaurar o dump final; `rsync`; conferir
   contagens, 40 migrations, três índices, `migrate status`.
4. Subir `app` e `worker`; entrar; Integrações: testar ML e Bling (primeira renovação de token, com o PC
   parado); LI leitura.
5. Roteiro funcional: lista de Produtos; abrir e salvar produto com fotos; enviar documento; Mercados com busca
   (índice de trigramas ativo = resposta em ms); Fontes mostrando o worker no ar; backup manual; SVG; cotação.
6. Enfileirar uma fonte pequena e acompanhar a primeira varredura; depois as demais.
7. No PC, antes de qualquer servidor subir de novo: `atualizar-copia.js` (apaga `Conexao` locais do ML e Bling).

**Volta atrás (válida por 48 h):** parar `app` e `worker` no VPS; dump do VPS (pode haver dados novos) e
restore no PC com os arquivos de volta; reautorizar ML e Bling pela tela Integrações no PC (os tokens
rotacionaram); o DNS não precisa ser desfeito. O ambiente do PC fica intacto até a janela fechar.

## 12. Riscos e respostas

| Risco | Resposta |
| --- | --- |
| Sites de fornecedor bloqueiam IP de data center | Medido no ensaio com `teste:fonte`. Plano B: worker no PC só para as fontes que bloqueiam, ligado ao banco do VPS por túnel SSH (`ssh -L 5432:127.0.0.1:5432`), com `COLETA_FONTES`, que tem trava própria |
| `sharp`, `pdf-parse` ou VTracer falham no Linux | Exercitados no ensaio (foto, PDF, SVG) |
| Arquivo com maiúscula no nome não achado no Linux | `auditar-arquivos.js` antes da virada (hoje nenhum nome tem maiúscula) |
| Limite de certificados da Let's Encrypt em ensaios repetidos | O Caddy guarda certificados num volume que não se apaga entre ensaios |
| Tokens do Bling/ML renovados por dois lados | Ordem dos passos da virada; `Conexao` apagada no ensaio e na cópia do PC |
| Primeira foto mensal (dia 14) no fuso novo | `TZ` nos contêineres; a primeira é observada e comparada com a anterior |
| Backup falha em silêncio | healthchecks.io com aviso por e-mail; restore de teste mensal |
| Zona DNS da conta antiga some com a assinatura do Workspace | Confirmação escrita do suporte; plano B Cloudflare |
| `next build` sem memória | 8 GB mais swap de 2 GB; build com o sistema no ar só porque sobra margem |
| Server Actions recusadas atrás do proxy | `allowedOrigins` no `next.config.mjs` |

## 13. Fora do escopo

- Blog e sistema de gestão pessoal (`blog.` e `maicol.4hobby.com.br`): cada um vira serviços no mesmo compose,
  com o próprio nome no Caddy, o próprio banco no mesmo Postgres, a mesma rotina de backup e um registro A. O
  sistema pessoal ganha o próprio brainstorming quando o dono mandar o código.
- Tela de login dentro do Rise (melhoria futura, sem pressa).
- Envio das fotos ao Bling e à LI (pendências já registradas no CLAUDE.md, que a `APP_URL_PUBLICA` destrava).
- Controle automático de estoque pelo Bling.
- Mover DNS, e-mail ou domínio de conta.

## 14. Testes e verificação

- Os testes existentes do projeto continuam sendo a régua: `teste:extracao`, `teste:svg`, `teste:cotacao`,
  `teste:imagens`, `teste:coleta`, `teste:cadastros`, `teste:estoque`, `teste:fotos`, `teste:anuncios-ml`,
  `teste:bling-sync`, `teste:li-sync`, `teste:loja-integrada`, `teste:worker`. Rodam no PC antes do merge e,
  os que não dependem de rede, dentro da imagem no ensaio (prova que a imagem Linux está íntegra).
- Scripts novos ganham teste onde há lógica: `auditar-arquivos.js` (produto com arquivo faltando, nome com
  caixa diferente), `atualizar-copia.js` (apaga `Conexao` só do ML e do Bling), versão na tela (formato
  `DD.MM.AAAA.HH.MM`, `dev` sem variável).
- Verificação de infraestrutura é por roteiro, não por teste automático: o roteiro funcional da seção 11,
  `dig rise.4hobby.com.br`, `curl` em `/api/arquivos/...` sem login (200) e em `/produtos` sem login (redireciona
  para o login), `docker compose ps`, healthchecks verde, um restore de teste bem-sucedido.

## 15. O que depende do dono

- Contratar o KVM 2 na conta nova, região Brasil, e passar o IP.
- Criar os registros A `rise` e `auth.rise` na zona da Hostinger antiga; perguntar ao suporte sobre a zona e
  a assinatura.
- Escolher o segundo fator do login: código TOTP no aplicativo autenticador, ou entrada com conta Google.
- Criar a conta Cloudflare (só para o R2) e o bucket; criar a conta no healthchecks.io.
- Cadastrar os redirects novos no DevCenter do ML e no aplicativo do Bling.
- Guardar no cofre de senhas: `ENCRYPTION_KEY`, senha nova do banco, chaves do R2, chave SSH.
- Dizer "sobe" a cada deploy (decisão 6) e escolher a noite da virada.
