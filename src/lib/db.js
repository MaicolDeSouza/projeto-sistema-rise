import { Prisma, PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7 usa o query compiler + driver adapter: o adapter `pg` e obrigatorio.
function criarPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

// A "forma" do client gerado: os nomes dos modelos. Muda quando o schema ganha ou perde uma tabela.
const assinaturaDoClient = Object.keys(Prisma.ModelName).sort().join(",");

// O hot-reload do Next recria os modulos a cada alteracao. Sem o singleton,
// cada recarga abriria um novo pool de conexoes ate o Postgres recusar novas.
const globalParaPrisma = globalThis;

/**
 * Reaproveita o client do processo SE ele ainda tem a mesma forma do gerado. Depois de um `prisma generate` com
 * tabela nova, o servidor de desenvolvimento recarrega este arquivo mas o `globalThis` guarda o client ANTIGO, que
 * nao conhece a tabela ("Cannot read properties of undefined") ate alguem reiniciar o servidor — a armadilha que o
 * CLAUDE.md registra e que se repetiu. Comparando a assinatura, o client se recria sozinho, uma vez.
 */
function clienteDoProcesso() {
  const existente = globalParaPrisma.prismaRise;
  if (existente && globalParaPrisma.prismaRiseAssinatura === assinaturaDoClient) return existente;
  existente?.$disconnect?.().catch(() => {});
  return criarPrismaClient();
}

export const prisma = clienteDoProcesso();

if (process.env.NODE_ENV !== "production") {
  globalParaPrisma.prismaRise = prisma;
  globalParaPrisma.prismaRiseAssinatura = assinaturaDoClient;
}
