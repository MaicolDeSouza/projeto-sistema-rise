import { prisma } from "@/lib/db";
import { lerArquivoOriginal } from "@/lib/coleta/arquivo";

/// Content-Type pelo TIPO conhecido, nunca pela extensao sem checagem: sao os
/// mesmos formatos aceitos no envio (`FORMATOS` em ArquivosDaFonte.jsx).
const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".csv": "text/csv",
  ".json": "application/json",
};

/**
 * O arquivo ORIGINAL que o fornecedor mandou (HTML, PDF, planilha), para o
 * operador conferir rapido sem reabrir o portal dele.
 *
 * So baixa o que esta na lista ATUAL da fonte (`listaArquivos`): cada envio
 * SUBSTITUI o conjunto em disco, e um nome fora da lista pode ter sido trocado
 * ou apagado num envio seguinte.
 */
export async function GET(requisicao, { params }) {
  const { id, nome } = await params;

  const fonte = await prisma.fonteColeta.findUnique({
    where: { id: String(id) },
    select: { dominio: true, listaArquivos: true },
  });

  // O Next ja entrega o segmento decodificado; decodificar de novo lancava URIError (500) com um "%" solto.
  const nomeProcurado = String(nome);
  const lista = Array.isArray(fonte?.listaArquivos) ? fonte.listaArquivos : [];
  if (!fonte || !lista.some((item) => item?.nome === nomeProcurado)) {
    return new Response("Arquivo não encontrado.", { status: 404 });
  }

  const bytes = await lerArquivoOriginal(fonte.dominio, nomeProcurado);
  if (!bytes) return new Response("Arquivo não encontrado.", { status: 404 });

  const extensao = nomeProcurado.slice(nomeProcurado.lastIndexOf(".")).toLowerCase();

  return new Response(bytes, {
    headers: {
      "Content-Type": TIPOS[extensao] ?? "application/octet-stream",
      "Content-Disposition": `attachment; filename="${nomeProcurado.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
