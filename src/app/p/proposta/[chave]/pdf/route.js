import { propostaPelaChavePublica } from "@/lib/propostas/linkPublico";
import { pdfParaEnviar } from "@/lib/propostas/pdfParaEnviar";

/**
 * O PDF assinado pelo link publico (17/11/2026): a pagina e HTML e nao leva assinatura, entao a proposta marcada "Assinar
 * digitalmente" ganha o botao "Baixar PDF assinado". Quem autoriza e a CHAVE do link (a mesma da pagina); proposta nao
 * marcada da 404, para o link nao virar um gerador de PDF de qualquer proposta.
 */
export async function GET(_requisicao, { params }) {
  const { chave } = await params;
  const proposta = await propostaPelaChavePublica(chave);
  if (!proposta?.assinarDigitalmente) {
    return new Response("Proposta não encontrada.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  }
  const { bytes } = await pdfParaEnviar(proposta);
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `attachment; filename="proposta-${proposta.numero}-assinada.pdf"`,
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
