import { baixarDocumentoDaReferencia } from "@/lib/documentosReferencias";
import { ErroDeRecusa } from "@/lib/redePublica";

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
    // Recusa nossa (link que nao e arquivo, endereco interno, maior que 20 MB): o operador le o motivo. Qualquer
    // outra excecao (banco fora do ar, DNS, queda da conexao) vai so para o log: repetir `erro.message` na tela
    // mostraria texto do Prisma ou nome de host, e com status 400 diria que o pedido estava errado.
    if (erro instanceof ErroDeRecusa) return new Response(erro.message, { status: 400 });
    console.error("[documento-referencia]", erro);
    return new Response("Não foi possível baixar o documento agora. Tente de novo em instantes.", { status: 502 });
  }
}
