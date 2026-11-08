import { dadosDoPdf } from "@/lib/compras/dadosDoPdf";
import { pedidoPelaChavePublica } from "@/lib/compras/linkPublico";
import { htmlDoPedido } from "@/lib/compras/paginaPublica";

/**
 * O link publico do pedido de compra (07/11/2026): o fornecedor abre sem login, e quem autoriza e a CHAVE do link
 * (`pedidoPelaChavePublica`, 43 caracteres aleatorios; o Caddy tambem so deixa passar esse formato). Le do banco a cada
 * visita: o que o dono salvar aparece na hora. HTML sem script e sem nada de fora (CSP fechada).
 */
export async function GET(_requisicao, { params }) {
  const { chave } = await params;
  const pedido = await pedidoPelaChavePublica(chave);
  if (!pedido) return new Response("Pedido não encontrado.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  const html = htmlDoPedido(pedido, await dadosDoPdf(pedido));
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      // A chave esta no endereco: nenhum link da pagina pode leva-la a outro site.
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    },
  });
}
