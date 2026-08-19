# Sistema Rise

Sistema de controle das operações de uma loja virtual de eletrônicos que vende
no **Mercado Livre** e na **Loja Integrada**, usando o **Bling** como ERP.

O sistema é organizado em **blocos**, acessados por um menu lateral fixo. Cada
bloco cobre uma área da operação e é desenvolvido de forma independente.

## Estado atual

Esta versão entrega a **fundação**: o esqueleto visual navegável e o banco de
dados modelado e migrado. As integrações externas ainda não foram implementadas.

| Bloco | Situação |
| --- | --- |
| Painel | Indicadores lendo do banco |
| Produtos | Listagem lendo do banco |
| Criar Anúncios | Em construção — próximo a ser desenvolvido |
| Pedidos, Estoque, Financeiro, Relatórios, Configurações | Em construção |

## Stack

- **Next.js 16** (App Router) e **React 19** — JavaScript, sem TypeScript
- **Tailwind CSS v4**
- **PostgreSQL 17** em Docker
- **Prisma 7** com driver adapter `@prisma/adapter-pg`

> O client do Prisma é gerado em TypeScript (o gerador da v7 não emite
> JavaScript) e fica em `src/generated/`, fora do controle de versão. Todo o
> código escrito à mão é JavaScript.

## Como rodar

Pré-requisitos: **Node.js 20.9+** e **Docker**.

```bash
npm install
cp .env.example .env    # ajuste as credenciais se quiser
npm run db:up           # sobe o Postgres
npm run db:migrate      # cria as tabelas
npm run seed            # carrega produtos de exemplo (opcional)
npm run dev
```

A aplicação sobe em <http://localhost:3000>.

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

## Estrutura

```
prisma/schema.prisma      Modelo de dados
src/lib/blocos.js         Fonte única dos blocos do menu
src/lib/db.js             Singleton do Prisma Client
src/components/Sidebar    Menu lateral
src/app/<bloco>/page.jsx  Uma rota por bloco
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

## Roadmap

O próximo bloco é **Criar Anúncios**: cadastro do produto, geração de título,
descrição e atributos com IA, revisão humana e publicação direta nas APIs do
Mercado Livre e da Loja Integrada.
