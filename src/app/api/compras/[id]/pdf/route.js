import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { lerPedido } from "@/lib/compras/banco";
import { lerDadosDaEmpresa } from "@/lib/compras/empresa";
import { pdfDoPedido } from "@/lib/compras/pdf";

/** "pc-0005-fortek-comercio" -> so letras, numeros e hifen: o nome do fornecedor e dado de terceiro. */
const paraNomeDeArquivo = (texto) =>
  String(texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

/**
 * O PDF do pedido de compra para mandar ao fornecedor. Precisa ver os pedidos E o custo (o PDF leva os precos de
 * compra). Gerado na hora a partir do banco; nada fica gravado.
 */
export async function GET(_requisicao, { params }) {
  const sessao = await sessaoDeAcessos().catch(() => null);
  if (!sessao?.pode("tela.compras.pedidos", "ver") || !sessao.pode("dado.custo", "ver")) return recusarRota();
  const { id } = await params;
  const pedido = await lerPedido(id);
  if (!pedido) return new Response("Não encontrado", { status: 404 });

  const bytes = await pdfDoPedido(pedido, await lerDadosDaEmpresa());
  const nome = `${pedido.codigo}-${paraNomeDeArquivo(pedido.fornecedor.nome) || "fornecedor"}.pdf`;
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${nome}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
