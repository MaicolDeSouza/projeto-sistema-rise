import { prisma } from "@/lib/db";

/**
 * O histórico dos dois prompts editáveis do Rise AI (spec §5a.5): cada salvamento que muda o texto guarda uma versão, para a
 * tela mostrar "a versão anterior" e o administrador poder voltar a ela. Só as 20 mais recentes de cada canal ficam
 * (`canal` = "interno" para o chat da equipe, "cliente" para as respostas ao cliente).
 */

export const MAXIMO_DE_VERSOES = 20;

/** Do mais recente para o mais antigo; o `id` desempata dois salvamentos no mesmo instante. */
const DA_MAIS_NOVA = [{ alteradoEm: "desc" }, { id: "desc" }];

/**
 * Guarda o texto novo como a versão mais recente do canal e apaga o que passar das 20. Recebe a transação de quem grava a
 * configuração, para a versão e a mudança entrarem juntas.
 *
 * @param {string} canal
 * @param {string} texto  o texto que vale a partir de agora (o do código, quando o administrador voltou ao padrão)
 * @param {string} quem   o login de quem salvou
 * @param {import("@prisma/client").Prisma.TransactionClient | typeof prisma} [tx]
 */
export async function registrarVersaoDePrompt(canal, texto, quem, tx = prisma) {
  await tx.versaoDePromptIA.create({ data: { canal, texto, alteradoPor: quem } });
  const excedentes = await tx.versaoDePromptIA.findMany({ where: { canal }, orderBy: DA_MAIS_NOVA, skip: MAXIMO_DE_VERSOES, select: { id: true } });
  if (excedentes.length > 0) await tx.versaoDePromptIA.deleteMany({ where: { id: { in: excedentes.map((versao) => versao.id) } } });
}

/**
 * A versão ANTES da mais recente (a mais recente é a que vale agora). `null` quando o prompt só foi salvo uma vez.
 *
 * @returns {Promise<{ texto: string, alteradoPor: string, alteradoEm: Date } | null>}
 */
export async function versaoAnterior(canal) {
  const [, anterior] = await prisma.versaoDePromptIA.findMany({ where: { canal }, orderBy: DA_MAIS_NOVA, take: 2 });
  return anterior ? { texto: anterior.texto, alteradoPor: anterior.alteradoPor, alteradoEm: anterior.alteradoEm } : null;
}
