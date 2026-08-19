import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 usa o query compiler + driver adapter: o adapter `pg` e obrigatorio.
function criarPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// O hot-reload do Next recria os modulos a cada alteracao. Sem o singleton,
// cada recarga abriria um novo pool de conexoes ate o Postgres recusar novas.
const globalParaPrisma = globalThis;

export const prisma = globalParaPrisma.prismaRise ?? criarPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalParaPrisma.prismaRise = prisma;
}
