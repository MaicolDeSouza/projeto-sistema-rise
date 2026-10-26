import { stat } from "node:fs/promises";
import path from "node:path";

import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { TIPO_POR_EXTENSAO, cabecalhoDeArquivo, fluxoDeArquivo } from "@/lib/arquivos";
import { caminhoDaPropostaDoPedido } from "@/lib/compras/arquivos";
import { prisma } from "@/lib/db";

/**
 * O arquivo da proposta do fornecedor de um pedido de compra, com o nome real (so com login e acesso aos pedidos).
 * O caminho sai do banco e passa pela validacao de `caminhoDaPropostaDoPedido`; o navegador nunca escolhe o arquivo.
 */
export async function GET(_requisicao, { params }) {
  const sessao = await sessaoDeAcessos().catch(() => null);
  if (!sessao?.pode("tela.compras.pedidos", "ver")) return recusarRota();
  const { id } = await params;
  const pedido = await prisma.pedidoDeCompra.findUnique({
    where: { id: String(id ?? "") },
    select: { propostaArquivo: true, propostaNomeOriginal: true },
  });
  if (!pedido?.propostaArquivo) return new Response("Não encontrado", { status: 404 });

  let absoluto;
  try {
    absoluto = caminhoDaPropostaDoPedido(String(id), pedido.propostaArquivo);
    const info = await stat(absoluto);
    if (!info.isFile()) return new Response("Não encontrado", { status: 404 });
    return new Response(fluxoDeArquivo(absoluto), {
      headers: {
        "Content-Type": TIPO_POR_EXTENSAO[path.extname(absoluto)] ?? "application/octet-stream",
        "Content-Length": String(info.size),
        "Content-Disposition": cabecalhoDeArquivo(pedido.propostaNomeOriginal ?? pedido.propostaArquivo, "inline"),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erro) {
    if (erro.code === "ENOENT") return new Response("Não encontrado", { status: 404 });
    throw erro;
  }
}
