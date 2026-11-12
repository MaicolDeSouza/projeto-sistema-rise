import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { lerDadosDaEmpresa } from "@/lib/compras/empresa";
import { lerProposta } from "@/lib/propostas/banco";
import { dadosDoPdfDaProposta, pdfDaProposta } from "@/lib/propostas/pdf";

const paraNomeDeArquivo = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/** O PDF da proposta para o cliente (quem ve as propostas). Gerado na hora a partir do banco; nada fica gravado. */
export async function GET(_requisicao, { params }) {
  const sessao = await sessaoDeAcessos().catch(() => null);
  if (!sessao?.pode("tela.propostas", "ver")) return recusarRota();
  const { numero } = await params;
  const proposta = await lerProposta(numero);
  if (!proposta) return new Response("Não encontrado", { status: 404 });
  const [empresa, extras] = await Promise.all([lerDadosDaEmpresa(), dadosDoPdfDaProposta(proposta)]);
  const bytes = await pdfDaProposta(proposta, empresa, extras);
  const nome = `proposta-${proposta.numero}-${paraNomeDeArquivo(proposta.clienteNome) || "cliente"}.pdf`;
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${nome}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
