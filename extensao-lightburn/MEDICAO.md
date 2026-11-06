# Medição do portal da LightBurn (Cryptlex), 05/11/2026

Lida no Chrome do dono, logado em `https://lightburn.customer.cryptlex.com`, só abrindo as páginas Licenses e
Activations e paginando. Nada mais foi clicado e nenhuma chamada de escrita foi feita. Chaves, hostnames, ids, e-mails,
nomes e o token NÃO estão neste arquivo nem nas fixtures (`scripts/fixtures/lightburn/`): as fixtures têm a forma real
das respostas com os valores trocados (`AAAAAA-BBBBBB-...`, `PC-TESTE-N`, `lic-1`, `act-1`).

## API

- O portal é uma SPA (Angular). Os dados vêm de `https://api.cryptlex.com/v3` (`localStorage.apiBaseUrl`; a região é
  `CTX_REGION = "us"`; existe `apiBaseUrlEu` para a Europa, não usado por esta conta). Para o `host_permissions` da
  extensão: `https://api.cryptlex.com/*`.
- Chamadas que a página faz ao abrir:
  - `GET /v3/me/licenses?page=1&limit=100&query=&sort=-createdAt&include=` → 78 licenças (1 página).
  - `GET /v3/me/activations?page=1&limit=20&query=&sort=%2BlastSyncedAt&include=` → 102 ativações da CONTA INTEIRA,
    cada uma com `licenseId`. Não precisa pedir por licença.
  - `GET /v3/accounts/config` e `GET /v3/me?page=1&limit=100` (dados da conta; a extensão não usa).
- Cabeçalhos enviados: `Authorization: Bearer <token>`, `Accept: application/json`.
- Cabeçalhos da resposta: `pagination-count: <total de itens>` (itens, não páginas), `cache-control: no-store`,
  `x-rate-limit-limit: 5s`, `x-rate-limit-remaining: 49`, `x-rate-limit-reset`. Ou seja, 50 pedidos por janela de 5 s.
- Paginação: `page` começa em 1 e `limit` é o tamanho da página. Parar quando `page * limit >= pagination-count` ou
  quando a página voltar vazia.
- Tamanho de página que funciona: licenças `limit=100` (1 página, ~1 s). Ativações: `limit=100` NÃO respondeu em 40 s
  (duas tentativas); `limit=20` levou 13,6 s e `limit=50`, 15,8 s. A extensão usa `limit=50` (3 páginas para 102) e
  espera até 60 s por página.
- O corpo é um array JSON puro, sem envelope.

## Token

- Mora no `localStorage` da página: `CTX_AT` (access token, JWT), `CTX_RT` (refresh), `CTX_REGION`, `apiBaseUrl`,
  `apiBaseUrlEu`, `company`, `website`, `faviconUrl`, `logoUrl`, `bugsnag-anonymous-id`. `sessionStorage` vazio;
  cookies não legíveis pelo script.
- Vai no cabeçalho `Authorization: Bearer <CTX_AT>`. A extensão lê o `CTX_AT` na hora do clique e chama a API de
  dentro da página (world MAIN), como a própria página faz. A validade do JWT não foi medida (a página o renova com o
  `CTX_RT` enquanto está aberta); token vencido dá 401, e a extensão pede para recarregar o portal e clicar de novo.
- O token NUNCA sai da página: não vai ao Rise, não vai ao log, não vai às fixtures.

## Licença (campos do portal → payload do Rise)

Campos de cada item de `/v3/me/licenses` (presentes em todas as 78): `id, key, revoked, suspended, perpetual, type,
validity, allowedActivations, allowedDeactivations, allowedFloatingClients, totalActivations, totalDeactivations,
subscriptionInterval, leaseDuration, expiresAt, effectiveDate, notes, metadata, customAttributes, meterAttributes,
product { id, description, displayName, iconUrl }, productVersion, entitlementSet, createdAt, updatedAt`.

Valores vistos: `type` "node-locked" (77) e "hosted-floating" (1); `allowedActivations` 3 em todas;
`allowedDeactivations` 12, 15, 17 ou 19; `validity` 31536000 (1 ano, em segundos); `perpetual` false; `leaseDuration`
0 (1800 na flutuante); `allowedFloatingClients` 0; `metadata`, `customAttributes` e `meterAttributes` sempre `[]`;
`notes`, `productVersion`, `entitlementSet`, `subscriptionInterval`, `product.displayName` e `product.iconUrl` sempre
null; `product.description` "LightBurn Laser" e `product.id` "52742d92-d1a6-4830-8f69-a36e929741a2" em todas.
**NÃO existe campo `status`.**

| payload (esquema da Tarefa 7) | de onde vem |
| --- | --- |
| `idNoPortal` | `id` |
| `chave` | `key` |
| `situacao` | regra da seção "Situação" (ACTIVE, EXPIRED, SUSPENDED ou REVOKED) |
| `expiraEm` | `expiresAt` |
| `criadaEm` | `createdAt` |
| `ativacoesUsadas` | `totalActivations` (confere com a contagem das ativações da licença) |
| `ativacoesPermitidas` | `allowedActivations` |
| `tipo` | `null` (ver "Core/Pro") |
| `dados` | `{ type, perpetual, validity, allowedDeactivations, totalDeactivations, leaseDuration, effectiveDate, updatedAt, productId: product.id }` |
| `ativacoes` | os itens de `/v3/me/activations` cujo `licenseId` é igual ao `id` |

## Ativação (campos → payload)

Campos de cada item de `/v3/me/activations`: `id, licenseId, productId, hostname, os, osVersion, vmName, container,
offline, appVersion, releaseVersion, releaseChannel, releasePlatform, lastSyncedAt, leaseExpiresAt, expiresAt,
location, meterAttributes, createdAt, updatedAt`.

Valores vistos: `os` "windows"; `osVersion` "11.0" e "10.0"; `container` false; `offline` false; `leaseExpiresAt` null
nas node-locked; `appVersion`, `releaseVersion`, `releaseChannel`, `releasePlatform` e `vmName` null. **`location` é
um OBJETO com a geolocalização do PC do cliente: a extensão o descarta** (dado pessoal que o Rise não precisa; nas
fixtures ficou `{}`).

| payload | de onde vem |
| --- | --- |
| `idNoPortal` | `id` |
| `hostname` | `hostname` (não veio vazio em nenhuma; o esquema recusa vazio) |
| `so` | `os` + " " + `osVersion` ("windows 11.0") |
| `criadaEm` | `createdAt` |
| `ultimaSincronizacaoEm` | `lastSyncedAt` |
| `leaseExpiraEm` | `leaseExpiresAt` |
| `dados` | `{ offline, container, vmName, appVersion, releaseVersion, expiresAt, updatedAt }` (sem `location`) |

## Situação

O portal não tem palavra de situação: a tela a deriva de três campos, e a extensão faz o mesmo, nesta ordem:
`revoked` → "REVOKED"; `suspended` → "SUSPENDED"; `expiresAt` anterior a agora → "EXPIRED"; senão "ACTIVE".
Confere com o mapa da Tarefa 3 (`SITUACOES_VALIDAS = ["ACTIVE"]`, `SITUACOES_EXPIRADAS = ["EXPIRED"]`, rótulos para
`SUSPENDED` e `REVOKED`); nada a ajustar.

## Datas

ISO 8601 em UTC com microssegundos: `2025-10-06T17:58:20.256388Z`. O `new Date()` do JavaScript lê direto (os dígitos
além do milissegundo são ignorados). O Rise grava em UTC e mostra em São Paulo, como o resto do sistema.

## Core/Pro

**Não está no portal.** Comparadas as chaves que a planilha marca como Pro com as Core: `type`, `product`, `metadata`,
`customAttributes`, `entitlementSet`, `productVersion`, `allowedActivations` e `validity` são iguais nos dois grupos, e
`allowedDeactivations` se sobrepõe (Pro 12 e 15; Core 12, 15 e 17). O payload manda `tipo: null`; o `tipo` da licença
no Rise é o que o dono digita ou o que a planilha importa, e a leitura do portal não apaga o gravado (Tarefa 7).

## O que não dá para repetir

- `/v3/me/activations?limit=100` não responde em 40 s (duas tentativas); usar 50.
- O filtro `licenseId=<id>` na query de `/v3/me/activations` falhou ("Failed to fetch"); não é preciso, a lista inteira
  já traz `licenseId` em cada item.
- A validade do JWT em `CTX_AT` e as chaves do objeto `location` não foram lidas (a última sondagem falhou na
  ferramenta); nada depende delas.
