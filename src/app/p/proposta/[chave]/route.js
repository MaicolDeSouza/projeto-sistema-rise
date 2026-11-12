import { lerDadosDaEmpresa } from "@/lib/compras/empresa";
import { propostaPelaChavePublica } from "@/lib/propostas/linkPublico";
import { htmlDaProposta } from "@/lib/propostas/paginaPublica";
import { dadosDoPdfDaProposta } from "@/lib/propostas/pdf";

/**
 * O link publico da proposta: o cliente abre sem login, e quem autoriza e a CHAVE (43 caracteres aleatorios; o Caddy so
 * deixa passar esse formato). Le do banco a cada visita. HTML sem script e sem nada de fora (CSP fechada).
 */
export async function GET(_requisicao, { params }) {
  const { chave } = await params;
  const proposta = await propostaPelaChavePublica(chave);
  if (!proposta) return new Response("Proposta não encontrada.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
  const [empresa, extras] = await Promise.all([lerDadosDaEmpresa(), dadosDoPdfDaProposta(proposta)]);
  return new Response(htmlDaProposta(proposta, empresa, extras), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    },
  });
}
