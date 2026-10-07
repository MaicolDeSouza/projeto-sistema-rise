> **Superado pela spec de 06/10/2026** (`docs/superpowers/specs/2026-10-06-loja-integrada-design.md`) e pela execucao do plano em 07/10/2026: o cliente, a paginacao e os normalizadores ficaram; o vinculo externo, a importacao e os webhooks sairam. Mantido como historico.

# Handoff técnico — Integração Rise × Loja Integrada

**Atualizado em:** 6 de outubro de 2026  
**Destino:** continuidade do trabalho pelo Claude  
**Estado do código:** alterações locais, ainda sem commit e sem pull request

> Este documento não contém tokens, domínio real da loja ou qualquer outra credencial. Antes de alterar o código, inspecione `git status` e `git diff` para preservar todo o trabalho local.

## 1. Resumo executivo

A integração com a Loja Integrada foi atualizada para o modelo atual de autenticação por **Personal Token**, substituindo a tentativa anterior baseada em `chave_api` e `aplicacao`. Foi implementada a base de leitura de produtos, pedidos, clientes, preço e estoque; importação segura de produtos para o Rise; persistência de vínculos e histórico de sincronização; recebimento idempotente de webhooks; testes automatizados; e proteções para impedir escrita acidental na Loja Integrada.

O código compila e os testes executados passaram. Entretanto, a entrega ainda **não está pronta para produção** porque:

- a migração Prisma foi preparada, mas **não foi aplicada ao banco**;
- o Personal Token que apareceu em uma captura de tela deve ser **revogado e substituído**;
- os webhooks são recebidos e enfileirados, mas ainda **não existe consumidor** para os jobs da Loja Integrada;
- a importação existe no backend, mas ainda não foi ligada à interface nem transformada em processamento em lote/background;
- operações de escrita continuam deliberadamente desabilitadas.

## 2. Situação por área

| Área | Estado | Observação |
|---|---|---|
| Autenticação por Personal Token | Implementada | Credencial criptografada em `Conexao`, com fallback para `.env` |
| Teste de conexão | Implementado | Faz `GET /produto?limit=1` |
| Produtos e variações | Implementado para leitura | Inclui paginação e normalização |
| Preço e estoque | Implementado para leitura | Endpoints individuais disponíveis |
| Pedidos | Implementado para leitura | Ainda sem persistência no domínio Rise |
| Clientes | Implementado para leitura | Ainda sem persistência; exige decisão sobre PII |
| Importação de produtos | Implementada no backend | Não ligada à UI; precisa de lotes/background para catálogos grandes |
| Webhooks | Recepção implementada | Jobs ficam pendentes porque não há worker consumidor |
| Escrita na Loja Integrada | Bloqueada | `LOJA_INTEGRADA_WRITE_ENABLED=false` |
| Migração de banco | Criada | Ainda não aplicada |
| Testes e build | Aprovados | Detalhes na seção 9 |

## 3. Decisões técnicas tomadas

### 3.1 Autenticação

A API atual da loja própria usa o cabeçalho:

```text
Authorization: Basic <PERSONAL_TOKEN>
```

O fluxo antigo com `LI_CHAVE_API` e `LI_CHAVE_APLICACAO` foi removido. Essas variáveis não devem ser reintroduzidas. A Loja Integrada descontinuou o modelo antigo de chave de aplicação para este caso.

A resolução da credencial usa a seguinte prioridade:

1. segredo criptografado salvo em `Conexao` pela tela de Integrações;
2. `LOJA_INTEGRADA_PERSONAL_TOKEN` no `.env` local.

O token nunca deve chegar ao frontend, ser registrado em logs ou ser incluído em commits.

### 3.2 Segurança de escrita

Todas as chamadas diferentes de `GET` passam por uma trava independente:

```env
LOJA_INTEGRADA_WRITE_ENABLED=false
```

Chamadas de escrita não têm repetição automática (`tentativas: 1`) para reduzir o risco de duplicidade. A trava deve permanecer `false` até existir revisão do fluxo, teste controlado com um único SKU e plano de rollback.

### 3.3 Limite de requisições

O cliente aplica limite local de 90 requisições por minuto. A documentação oficial informa 100 requisições por minuto por loja; a margem reduz o risco de `429` quando há concorrência.

### 3.4 Privacidade

Webhooks não armazenam o payload bruto de pedido ou cliente. São persistidos apenas hash estável, identificadores/referências e estado de processamento. Essa decisão evita retenção desnecessária de dados pessoais.

## 4. Variáveis de ambiente

O `.env.example` foi alinhado com o `.env` local. A seção esperada é:

```env
LOJA_INTEGRADA_PERSONAL_TOKEN=
LOJA_INTEGRADA_WEBHOOK_TOKEN=
LOJA_INTEGRADA_ENABLED=true
LI_DOMINIO=
LOJA_INTEGRADA_WRITE_ENABLED=false
```

Notas importantes:

- `LOJA_INTEGRADA_PERSONAL_TOKEN`: token de acesso da loja; manter apenas localmente ou salvar pela UI, que usa armazenamento criptografado.
- `LOJA_INTEGRADA_WEBHOOK_TOKEN`: segredo escolhido pelo responsável pelo Rise para proteger os endpoints públicos de webhook. Não é fornecido pela Loja Integrada. Pode permanecer vazio enquanto os webhooks não forem publicados/configurados.
- `LI_DOMINIO`: domínio público da loja, sem expor o valor em documentação ou commit.
- `LOJA_INTEGRADA_ENABLED`: habilita a integração.
- `LOJA_INTEGRADA_WRITE_ENABLED`: deve continuar `false` nesta etapa.

O token anterior foi limpo do `.env` porque apareceu em uma captura de tela. O responsável deve revogá-lo na Loja Integrada, gerar outro e configurá-lo novamente.

## 5. Arquitetura e arquivos principais

### 5.1 Configuração, conexão e interface

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/integracoes/config.js` | Leitura das flags, domínio, Personal Token e token de webhook |
| `src/lib/integracoes/lojaintegrada.js` | Salvar credencial criptografada e testar conexão |
| `src/app/integracoes/acoes.js` | Ações do servidor para salvar/testar conexão |
| `src/app/integracoes/page.jsx` | Página de Integrações e exibição das flags |
| `src/components/CartaoConector.jsx` | Campo de Personal Token, detalhes técnicos e aviso de validade |

O vencimento estimado é salvo como três meses após o cadastro. A UI alerta quando faltam até 30 dias.

### 5.2 Cliente e serviços da Loja Integrada

| Arquivo | Responsabilidade |
|---|---|
| `src/lib/integracoes/lojaIntegrada/client.js` | Cliente HTTP, Basic Auth, rate limit, trava de escrita e injeção de dependências |
| `src/lib/integracoes/lojaIntegrada/paginacao.js` | Paginação pelo `meta.next`, validação de domínio e proteção contra loops |
| `src/lib/integracoes/lojaIntegrada/produtos.js` | Listagem, detalhe e iteração de produtos |
| `src/lib/integracoes/lojaIntegrada/normalizadores.js` | Conversão dos retornos da API para DTOs internos |
| `src/lib/integracoes/lojaIntegrada/precosEstoque.js` | Leitura de preço e estoque |
| `src/lib/integracoes/lojaIntegrada/pedidos.js` | Busca e detalhe de pedidos |
| `src/lib/integracoes/lojaIntegrada/clientes.js` | Listagem, busca por e-mail e detalhe de clientes |
| `src/lib/integracoes/lojaIntegrada/importarProdutos.js` | Importação segura Loja Integrada → Rise |
| `src/lib/integracoes/lojaIntegrada/provider.js` | Fachada comum da integração |
| `src/lib/integracoes/lojaIntegrada/webhooks.js` | Autenticação, hash, idempotência e criação de jobs |
| `src/lib/integracoes/httpClient.js` | HTTP compartilhado e mascaramento de segredos |
| `src/lib/integracoes/normalizacao.js` | Normalização compartilhada, incluindo HTML para texto |

`src/lib/integracoes/importarBling.js` passou a reexportar a normalização compartilhada para manter compatibilidade com o fluxo Bling.

### 5.3 Rotas de webhook

| Rota | Finalidade |
|---|---|
| `POST /api/integracoes/loja-integrada/webhooks/pedidos` | Receber eventos de pedido |
| `POST /api/integracoes/loja-integrada/webhooks/produtos` | Receber eventos de produto |

As rotas exigem:

```text
Authorization: Bearer <LOJA_INTEGRADA_WEBHOOK_TOKEN>
```

Há comparação em tempo constante, limite de corpo de 1 MB, validação JSON, hash SHA-256 estável e idempotência. Para pedidos, `situacao_alterada: false` é ignorado conforme a regra da API.

### 5.4 Scripts e migração

| Arquivo | Finalidade |
|---|---|
| `scripts/teste-loja-integrada.js` | Suíte automatizada específica da integração |
| `prisma/migrations/20261005_loja_integrada_sync/migration.sql` | Migração aditiva dos vínculos, sincronizações e eventos |

## 6. Importação de produtos

O fluxo implementado:

1. lista os produtos da Loja Integrada;
2. consulta o detalhe de cada item, porque preço e estoque podem não vir na listagem;
3. normaliza produto, variações, preço, estoque, dimensões, categorias e imagens;
4. procura vínculo externo existente ou SKU sem diferença de maiúsculas/minúsculas;
5. cria um produto quando não há correspondente;
6. quando o produto Rise já existe, cria o vínculo sem sobrescrever silenciosamente os dados locais;
7. registra divergências, inclusive SKU;
8. cria ou atualiza o `Anuncio` do canal Loja Integrada;
9. atualiza contadores e logs da sincronização.

As transações de vínculo/importação usam nível `Serializable`.

Limitação atual: o full sync é sequencial e foi pensado primeiro para segurança. Em catálogo grande, ele pode ultrapassar o tempo de uma Server Action. Antes de adicionar um botão de importação na UI, transformar o fluxo em lotes e executá-lo em background, com progresso retomável e tratamento de falhas parciais.

## 7. Banco de dados

Foram adicionados ao schema:

- `StatusVinculoExterno`;
- `StatusSincronizacaoIntegracao`;
- `StatusEventoWebhook`;
- `VinculoProdutoExterno`;
- `SincronizacaoIntegracao`;
- `EventoWebhookIntegracao`.

Pontos relevantes:

- `VinculoProdutoExterno` usa chave única composta por serviço, produto externo e variação externa;
- quando não há variação, é usada string vazia, evitando semântica ambígua de `NULL` em chave composta;
- o vínculo contém SKU, estado, erro e timestamps de sincronização;
- sincronizações registram tipo, estado, contadores, horários e erro;
- eventos de webhook guardam identidade/hash/referência, sem payload bruto.

### Atenção: migração não aplicada

O arquivo SQL foi criado e o schema validado, mas nenhum comando de migração foi executado contra o banco. Até a migração ser aplicada, a importação e os webhooks que usam os novos modelos falharão no acesso ao banco.

Antes de aplicar:

1. confirmar o banco/ambiente selecionado;
2. fazer backup adequado;
3. revisar `prisma/migrations/20261005_loja_integrada_sync/migration.sql`;
4. usar o comando correspondente ao ambiente.

```powershell
# Desenvolvimento
npm run db:migrate

# Ambiente que recebe apenas migrações já preparadas
npm run db:deploy
```

## 8. Ponto exato onde o trabalho parou

O trabalho parou após implementação e verificação local, antes de qualquer ativação operacional. Ainda falta:

1. revogar o Personal Token exposto e configurar um token novo;
2. revisar e aplicar a migração;
3. testar leitura real com a loja usando um volume mínimo;
4. criar execução em lotes/background para importação;
5. ligar importação, progresso, logs e métricas à UI;
6. criar um worker dedicado aos jobs `LOJA_INTEGRADA_WEBHOOK_PEDIDO` e `LOJA_INTEGRADA_WEBHOOK_PRODUTO`;
7. atualizar `EventoWebhookIntegracao` e `Job` após sucesso/erro do processamento;
8. publicar callback HTTPS e registrar os webhooks na Loja Integrada;
9. decidir os modelos de domínio e política de retenção antes de persistir clientes e pedidos;
10. desenhar e testar cuidadosamente qualquer operação de escrita.

### Lacuna crítica dos webhooks

O worker já existente filtra apenas jobs com `tipo = 'coleta'`. Portanto, os novos jobs de webhook são criados, mas ficam pendentes. Receber HTTP 2xx significa apenas que o evento foi aceito/enfileirado — não que ele foi processado.

Não publicar nem registrar os webhooks antes de existir o consumidor, o monitoramento de falhas e uma estratégia de repetição segura.

## 9. Verificações já executadas

Os seguintes comandos passaram nesta versão local:

```powershell
npm run teste:loja-integrada
npm run teste:bling-sync
npx prisma validate
npx prisma generate
npm run build
git diff --check
```

Resultados:

- `teste:loja-integrada`: **35 verificações aprovadas**;
- regressão do Bling: aprovada;
- lint direcionado aos arquivos alterados da integração: aprovado;
- Prisma validate/generate: aprovados;
- build Next.js 16.3.1: aprovado;
- `git diff --check`: aprovado, somente avisos de CRLF.

A suíte da Loja Integrada cobre autenticação/cabeçalhos, rate limiter, bloqueio de escrita, mascaramento de segredo, erros HTTP 401/403/404/409/429/500, teste de conexão, paginação, normalização de produtos e variações, importação e divergências, falhas por item, pedidos, clientes, preço/estoque e segurança/idempotência dos webhooks.

O build mostrou sete avisos preexistentes do Turbopack sobre acesso dinâmico ao sistema de arquivos em:

- `src/lib/arquivos.js`;
- `src/lib/coleta/controle.js`;
- `src/lib/imagens/lote.js`.

Esses avisos não foram introduzidos por esta integração.

## 10. Sequência recomendada para continuar

### Fase 1 — segurança e banco

1. Revogar o token exposto na Loja Integrada.
2. Gerar um Personal Token novo.
3. Configurar pela UI criptografada ou pelo `.env`; o banco tem prioridade.
4. Revisar o diff inteiro e a migração.
5. Fazer backup e aplicar a migração no ambiente correto.
6. Reiniciar o Rise e executar “Testar conexão”.

### Fase 2 — primeira leitura real

1. Rodar novamente testes, Prisma e build.
2. Consultar somente um produto e seu detalhe.
3. Confirmar IDs, SKU, variações, preço e estoque com os dados visíveis na loja.
4. Salvar evidências sem copiar tokens ou dados pessoais para logs.

### Fase 3 — importação controlada

1. Adicionar modo dry-run que gere plano e divergências sem gravar.
2. Separar o catálogo em lotes pequenos e retomáveis.
3. Executar pelo worker/background, não por uma Server Action longa.
4. Expor progresso, contadores e erros na UI.
5. Importar primeiro um único produto de teste.

### Fase 4 — webhooks

1. Implementar consumidor dedicado para os dois tipos de job.
2. Garantir idempotência também no processamento, não apenas na recepção.
3. Atualizar estados e registrar erro sanitizado.
4. Configurar `LOJA_INTEGRADA_WEBHOOK_TOKEN` com valor aleatório forte.
5. Publicar endpoints HTTPS.
6. Implementar/validar registro dos webhooks na Loja Integrada.
7. Testar repetição, evento duplicado, evento inválido e indisponibilidade temporária.

### Fase 5 — escrita, somente depois

1. Definir regras de precedência Rise × Loja Integrada.
2. Implementar auditoria e rollback.
3. Validar uma alteração de preço/estoque em SKU descartável.
4. Só então considerar habilitar a flag de escrita no ambiente controlado.

## 11. Comandos úteis

```powershell
# Ver tudo que está pendente
git status --short
git diff --stat
git diff

# Testes e validações
npm run teste:loja-integrada
npm run teste:bling-sync
npx prisma validate
npx prisma generate
npm run build

# Subir a aplicação local
npm run dev
```

Ao tocar em rotas, Server Actions ou APIs do Next.js, leia primeiro o guia relevante em `node_modules/next/dist/docs/`. Este projeto usa Next.js 16.3.1 e o `AGENTS.md` alerta que há mudanças incompatíveis com versões anteriores.

## 12. Guardrails para a continuidade

- Não usar `LI_CHAVE_API` ou `LI_CHAVE_APLICACAO`.
- Não enviar Personal Token ao navegador, não registrá-lo e não incluí-lo em documentos.
- Não habilitar escrita em massa.
- Não aplicar migração sem confirmar ambiente, revisar SQL e assegurar backup.
- Não considerar webhook processado apenas porque foi enfileirado.
- Não persistir dados pessoais de clientes/pedidos sem necessidade, modelo e política de retenção definidos.
- Não sobrescrever produtos Rise existentes sem regra explícita e auditável.
- Preservar a arquitetura existente: registro de conectores, `Conexao`, `LogIntegracao`, cliente HTTP centralizado, `Job`, `Produto` e `Anuncio`.
- Manter compatibilidade do Bling e executar a regressão após alterar normalizadores compartilhados.
- Inspecionar o worktree antes de editar: todas as mudanças estão locais e sem commit.

## 13. Fontes oficiais consultadas

- Documentação da API da Loja Integrada: https://api-docs.lojaintegrada.com.br/
- Ajuda oficial sobre Personal Token: https://ajuda.lojaintegrada.com.br/pt-BR/articles/931152-como-gerar-chaves-de-api-e-o-personal-token-chave-de-aplicacao-da-minha-loja

## 14. Checklist rápido de aceite

- [ ] Token exposto revogado e token novo configurado.
- [ ] Migração revisada, banco salvo e migração aplicada.
- [ ] Teste de conexão aprovado após reinício.
- [ ] Leitura real de um produto conferida manualmente.
- [ ] Importação em lote/background implementada antes da UI.
- [ ] Worker de webhooks processa e atualiza estados.
- [ ] Endpoints HTTPS e segredo de webhook configurados.
- [ ] Escrita continua desabilitada até teste controlado.
- [ ] Testes, Prisma, lint direcionado e build aprovados novamente.
- [ ] Mudanças revisadas e então commitadas em uma branch apropriada.
