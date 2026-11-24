import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { lerProposta } from "@/lib/propostas/banco";
import { pdfParaEnviar } from "@/lib/propostas/pdfParaEnviar";
import { nomeDoPdfDaProposta } from "@/lib/propostas/regras";

/** O PDF da proposta para o cliente (quem ve as propostas). Gerado na hora a partir do banco; nada fica gravado. */
export async function GET(_requisicao, { params }) {
  const sessao = await sessaoDeAcessos().catch(() => null);
  if (!sessao?.pode("tela.propostas", "ver")) return recusarRota();
  const { numero } = await params;
  const proposta = await lerProposta(numero);
  if (!proposta) return new Response("Não encontrado", { status: 404 });
  // Assinado na hora quando a proposta esta marcada e ha certificado valido (17/11/2026); senao, o PDF de sempre.
  const { bytes, assinado } = await pdfParaEnviar(proposta);
  const nome = nomeDoPdfDaProposta(proposta.numero, proposta.clienteNome, { assinado });
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${nome}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
