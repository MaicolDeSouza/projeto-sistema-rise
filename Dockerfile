# Imagem do Rise para a VPS (migracao de 08/10/2026). A mesma imagem roda o site (`npm start`) e o worker
# (`node scripts/worker.js`, comando sobreposto no docker-compose.yml).
#
# Uma etapa so, de proposito: o projeto e pequeno e a imagem e construida na propria VPS a cada deploy.
# As devDependencies ficam porque os scripts usam `dotenv` e o `prisma.config.ts` usa `prisma/config`
# (o `prisma migrate deploy` do deploy roda daqui). O postgresql-client-17 e para o `npm run backup`
# e o `copia:atualizar` rodarem de dentro do conteiner, na mesma versao do servidor.
FROM node:24-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
 && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" \
      > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-17 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencias antes do codigo: mudar uma tela nao refaz o `npm ci`. O postinstall roda `prisma generate`,
# que so precisa do schema; a URL falsa e so para o prisma.config.ts nao ler `undefined` no build.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm ci

COPY . .

# Versao no pe do menu: o deploy passa a hora (DD.MM.AAAA.HH.MM) e o commit; o next.config.mjs os embute.
ARG RISE_VERSAO=""
ARG RISE_COMMIT=""
# RISE_PRODUCAO marca a IMAGEM de producao, qualquer que seja o build-arg: o codigo a usa para ignorar chaves de
# teste que desligariam travas de seguranca (ver COLETA_PERMITIR_REDE_LOCAL em src/lib/coleta/http.js).
ENV RISE_VERSAO=$RISE_VERSAO \
    RISE_COMMIT=$RISE_COMMIT \
    RISE_PRODUCAO=1 \
    TZ=America/Sao_Paulo \
    NEXT_TELEMETRY_DISABLED=1

RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" npm run build

EXPOSE 3000
CMD ["npm", "start"]
