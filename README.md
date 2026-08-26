# Sistema Rise

Sistema de controle das operações de uma loja virtual de eletrônicos que vende
no **Mercado Livre** e na **Loja Integrada**, usando o **Bling** como ERP.

O sistema é organizado em **blocos**, acessados por um menu lateral fixo. Cada
bloco cobre uma área da operação e é desenvolvido de forma independente.

## Estado atual

Esta versão entrega a **fundação** — esqueleto visual, banco de dados e as conexões
com os sistemas externos autenticadas e testadas. A criação de anúncios ainda não
foi implementada.

| Bloco | Situação |
| --- | --- |
| Painel | Indicadores lendo do banco |
| Produtos | Listagem lendo do banco |
| Integrações | Conectores de Bling, Mercado Livre e Loja Integrada |
| Criar Anúncios | Em construção — próximo a ser desenvolvido |
| Pedidos, Estoque, Financeiro, Relatórios | Em construção |

## Stack

- **Next.js 16** (App Router) e **React 19** — JavaScript, sem TypeScript
- **Tailwind CSS v4**
- **PostgreSQL 17** em Docker
- **Prisma 7** com driver adapter `@prisma/adapter-pg`

> O client do Prisma é gerado em TypeScript (o gerador da v7 não emite
> JavaScript) e fica em `src/generated/`, fora do controle de versão. Todo o
> código escrito à mão é JavaScript.

## Como rodar

Pré-requisitos: **Node.js 20.9+**, **Docker** e **[mkcert](https://github.com/FiloSottile/mkcert)**.

O servidor roda em **HTTPS**, não por preferência: o OAuth do Mercado Livre exige
`redirect_uri` em HTTPS. Gere o certificado local antes do primeiro `npm run dev`:

```bash
mkcert -install
mkcert -key-file certificates/rise-key.pem -cert-file certificates/rise.pem sistema-rise.localtest.me localhost 127.0.0.1
```

```bash
npm install
cp .env.example .env    # preencha as credenciais
npm run db:up           # sobe o Postgres
npm run db:migrate      # cria as tabelas
npm run seed            # carrega produtos de exemplo (opcional)
npm run dev
```

A aplicação sobe em <https://localhost:3000>.

### Por que dois domínios

O Mercado Livre **recusa `localhost`** como `redirect_uri`. `localtest.me` é um domínio
público cujo DNS resolve para `127.0.0.1` — o ML aceita o formato e nada trafega pela
internet, o que dispensa túnel ou ngrok.

Mas a interface **não funciona** nesse domínio: o navegador bloqueia os scripts servidos
de domínios de loopback público (DNS rebinding). Daí a divisão:

| | Domínio |
| --- | --- |
| Interface e OAuth do Bling | `https://localhost:3000` |
| OAuth do Mercado Livre | `https://sistema-rise.localtest.me:3000` |

O fluxo do ML precisa começar e terminar no mesmo domínio — cookie não atravessa
domínio, e o `state` se perderia na volta. O callback redireciona para `localhost` no fim.

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` / `npm start` | Build e execução de produção |
| `npm run lint` | ESLint |
| `npm run db:up` / `db:down` | Sobe/derruba o Postgres |
| `npm run db:migrate` | Cria e aplica migration (desenvolvimento) |
| `npm run db:deploy` | Aplica migrations pendentes (produção) |
| `npm run db:studio` | Prisma Studio |
| `npm run seed` | Popula dados de exemplo (idempotente) |
| `npm run diagnostico` | Testa todas as integrações pela linha de comando |

## Estrutura

```
prisma/schema.prisma      Modelo de dados
src/lib/blocos.js         Fonte única dos blocos do menu
src/lib/db.js             Singleton do Prisma Client
src/components/Sidebar    Menu lateral
src/app/<bloco>/page.jsx  Uma rota por bloco
src/lib/integracoes/      Conectores (registro.js é a fonte única)
src/lib/crypto.js         AES-256-GCM dos segredos
```

Para adicionar um bloco: acrescente uma entrada em `src/lib/blocos.js` e crie a
rota correspondente em `src/app/`.

## Banco de dados

O `docker-compose.yml` serve tanto para desenvolvimento local quanto para
deploy em VPS. A porta do Postgres é publicada **apenas em `127.0.0.1`** — em um
servidor, expor a 5432 na internet é um risco sério.

Credenciais vêm de variáveis de ambiente. O compose **recusa subir** se
`POSTGRES_PASSWORD` não estiver definida, para que a senha de desenvolvimento
nunca chegue a um servidor por descuido.

### Ao migrar para VPS

Os tokens das integrações são gravados cifrados na tabela `Conexao` e só são
legíveis com a mesma `ENCRYPTION_KEY`. **Leve a chave junto com o dump do
banco** — sem ela, todas as conexões precisam ser refeitas, e a falha se parece
com erro de API.

## Integrações

Cada serviço externo é um **conector** em `src/lib/integracoes/`, registrado em
`registro.js`. Adicionar um marketplace novo é criar um arquivo e acrescentar uma linha —
a tela não muda.

Os modelos de autenticação são deliberadamente diferentes entre si, e a abstração não
assume OAuth: Bling e Mercado Livre usam OAuth2, a Loja Integrada usa chaves estáticas, e
Shopee (planejada) assina cada requisição com HMAC. O gancho `autorizarRequisicao` é o
ponto onde essa diferença cabe.

**Segurança:** tokens são gravados cifrados (AES-256-GCM) na tabela `Conexao`; toda chamada
externa é auditada em `LogIntegracao` com as credenciais mascaradas; e as travas
`ML_PUBLICACAO` / `BLING_ESCRITA` bloqueiam qualquer escrita antes da requisição sair.

**Loja Integrada:** a API exige uma Chave de Aplicação que só é emitida a provedores de
solução, e a solicitação para lojistas está suspensa. Até reabrirem, esse canal é atendido
**via Bling**, que já tem chave própria e já sincroniza produto, estoque, preço e pedidos.

## Roadmap

O próximo bloco é **Criar Anúncios**: cadastro do produto, geração de título, descrição
e atributos com IA, revisão humana e publicação.

O Bling é o mestre do cadastro e do estoque. O anúncio vai **direto pela API do Mercado
Livre**, porque a API v3 do Bling não expõe categoria nem ficha técnica do marketplace;
depois o código `MLB...` é gravado de volta no Bling, e daí em diante ele sincroniza
estoque, preço e pedidos. A Loja Integrada é atendida pelo Bling.

Dois pontos já confirmados contra a conta real que mudam o desenho:

- A conta está no modelo **User Products**, onde `family_name` é obrigatório ao publicar.
- Desde março de 2026 o preço não vai mais no `POST`/`PUT /items` — vai por chamada
  separada à API de Preços. E a sugestão de preço exige um item já existente, então a
  sequência é publicar pausado, consultar, ajustar e ativar.
