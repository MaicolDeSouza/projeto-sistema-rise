import { prisma } from "@/lib/db";

/**
 * O SEO dos concorrentes salvos no produto (aba Fornecedores / Concorrentes do cadastro), para a aba
 * SEO do anuncio da Loja Integrada comparar e, se o dono quiser, usar (pedido de 07/10/2026). Le o
 * `seo` que a coleta grava em `ProdutoColetado` (title, description, canonical); concorrente
 * digitado a mao nao tem pagina coletada e fica de fora, como o que nao tem title nem description.
 *
 * O texto volta numa linha so (a pagina do concorrente traz quebras e espacos duplos): e assim que
 * o Google o mostra. O corte no limite da LI fica para quem usa (`cortarNaFrase`).
 */

const umaLinha = (texto) => String(texto ?? "").replace(/\s+/g, " ").trim();

export async function seoDosConcorrentes(produtoId) {
  if (typeof produtoId !== "string" || produtoId === "") return [];
  const vinculos = await prisma.produtoConcorrente.findMany({
    where: { produtoId, produtoColetadoId: { not: null } },
    orderBy: { criadoEm: "asc" },
    select: {
      produtoColetado: {
        select: { id: true, nome: true, url: true, seo: true, coletadoEm: true, vistoEm: true, fonte: { select: { nome: true } } },
      },
    },
  });
  return vinculos
    .map(({ produtoColetado: coletado }) => ({
      id: coletado.id,
      loja: coletado.fonte?.nome ?? "",
      nome: coletado.nome ?? "",
      url: /^https?:\/\//i.test(String(coletado.url ?? "")) ? coletado.url : null,
      title: umaLinha(coletado.seo?.title),
      description: umaLinha(coletado.seo?.description),
      coletadoEm: (coletado.coletadoEm ?? coletado.vistoEm)?.toISOString() ?? null,
    }))
    .filter((item) => item.title || item.description);
}
