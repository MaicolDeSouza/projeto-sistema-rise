import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { prisma } from "@/lib/db";
import { baixarDoML, destinoDaNF } from "@/lib/pedidos/nf";

/** So letras, numeros e hifen no nome do arquivo: o numero da NF vem do canal. */
const paraNome = (texto) => String(texto ?? "").replace(/[^A-Za-z0-9-]+/g, "").slice(0, 30) || "pedido";

/**
 * "Baixar NF" e "Baixar XML" da aba Nota fiscal (fase 2 dos Pedidos de venda, spec 5.8): `?tipo=pdf|xml`. O ML passa
 * pelo Rise (o documento exige o token do vendedor); a LI e o Bling redirecionam para o link deles. Nada fica gravado.
 */
export async function GET(requisicao, { params }) {
  const sessao = await sessaoDeAcessos().catch(() => null);
  if (!sessao?.pode("acao.pedidos.baixarNF", "executar")) return recusarRota();
  const { id } = await params;
  const tipo = new URL(requisicao.url).searchParams.get("tipo") === "xml" ? "xml" : "pdf";

  const pedido = await prisma.pedidoDeVenda.findUnique({ where: { id: String(id) }, select: { numero: true, nf: true } });
  if (!pedido) return new Response("Pedido não encontrado.", { status: 404 });

  const destino = destinoDaNF(pedido.nf, tipo);
  if (destino.erro) return new Response(destino.erro, { status: 404 });
  if (destino.tipo === "redirecionar") return Response.redirect(destino.url, 302);

  try {
    const { bytes, tipoDeConteudo } = await baixarDoML(destino.caminho);
    const nome = `NF-${paraNome(pedido.nf?.numero ?? pedido.numero)}.${tipo}`;
    return new Response(bytes, {
      headers: {
        "Content-Type": tipoDeConteudo,
        "Content-Length": String(bytes.length),
        "Content-Disposition": `attachment; filename="${nome}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erro) {
    return new Response(erro?.message ?? "Não foi possível baixar do Mercado Livre.", { status: 502 });
  }
}
