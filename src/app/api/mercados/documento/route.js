import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { baixarDocumento } from "@/lib/documentosReferencias";
import { ErroDeRecusa } from "@/lib/redePublica";

/**
 * Baixa, NO SERVIDOR, o arquivo de um documento coletado de uma loja e o devolve como download (ver
 * `src/lib/documentoMercados.js`). O endereco vem do navegador, entao tudo o que sai daqui passa pelo filtro de rede
 * publica de `baixarDocumento` (IP conferido na conexao e em cada redirecionamento, ate 20 MB) e so http e https.
 */
export async function GET(request) {
  // Acessos: quem ve o Scraper ou o cadastro de Produto (a janela de referencias baixa os documentos das lojas).
  const { pode } = await sessaoDeAcessos();
  if (!pode("tela.scraper", "ver") && !pode("tela.produtos.cadastro", "ver")) return recusarRota();
  const parametros = new URL(request.url).searchParams;
  const url = parametros.get("url") ?? "";
  if (!/^https?:\/\//i.test(url)) return new Response("Endereço inválido.", { status: 400 });

  try {
    const documento = await baixarDocumento({ url, titulo: parametros.get("titulo") ?? "documento" });
    return new Response(documento.bytes, {
      headers: {
        "Content-Type": documento.mime,
        "Content-Disposition": `attachment; filename="${documento.nome}"`,
        "Content-Length": String(documento.bytes.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erro) {
    if (erro instanceof ErroDeRecusa) return new Response(erro.message, { status: 400 });
    console.error("[mercados/documento]", erro);
    return new Response("Não foi possível baixar o documento agora. Tente de novo em instantes.", { status: 502 });
  }
}
