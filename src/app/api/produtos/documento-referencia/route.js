import { baixarDocumentoDaReferencia } from "@/lib/documentosReferencias";

export async function GET(request) {
  const parametros = new URL(request.url).searchParams;
  const referenciaId = parametros.get("referenciaId");
  const indice = Number(parametros.get("indice"));
  try {
    const documento = await baixarDocumentoDaReferencia(referenciaId, indice);
    return new Response(documento.bytes, {
      headers: {
        "Content-Type": documento.mime,
        "Content-Disposition": `attachment; filename="${documento.nome}"`,
        "Content-Length": String(documento.bytes.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erro) {
    return new Response(erro.message, { status: 400 });
  }
}
