import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { prisma } from "@/lib/db";
import { dataDaChave } from "@/lib/relatorios/semana";

/**
 * Baixa o PDF de um relatorio semanal. Acesso conferido a cada pedido (Relatorios, ver); o id so serve para achar a linha.
 */
export async function GET(_request, { params }) {
  const sessao = await sessaoDeAcessos();
  if (!sessao.pode("tela.relatorios", "ver")) return recusarRota();

  const { id } = await params;
  const relatorio = await prisma.relatorioSemanal.findUnique({ where: { id: String(id) }, select: { semana: true, pdf: true } });
  if (!relatorio?.pdf) return new Response("Relatório não encontrado.", { status: 404 });

  const data = dataDaChave(relatorio.semana)?.split("/").reverse().join("-") ?? relatorio.semana.replace(/[^\w-]/g, "");
  return new Response(relatorio.pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="relatorio-semanal-${data}.pdf"`,
      "Content-Length": String(relatorio.pdf.length),
      "Cache-Control": "private, no-store",
    },
  });
}
