import { stat } from "node:fs/promises";
import path from "node:path";

import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { TIPO_POR_EXTENSAO, cabecalhoDeArquivo, fluxoDeArquivo } from "@/lib/arquivos";
import { caminhoDoComprovante } from "@/lib/compras/arquivos";
import { prisma } from "@/lib/db";

/**
 * Um comprovante de pagamento de um pedido de compra (09/11/2026), com o nome real (so com login e acesso aos pedidos).
 * O caminho sai do banco e passa pela validacao de `caminhoDoComprovante`; o navegador nunca escolhe o arquivo.
 */
export async function GET(_requisicao, { params }) {
  const sessao = await sessaoDeAcessos().catch(() => null);
  if (!sessao?.pode("tela.compras.pedidos", "ver")) return recusarRota();
  const { id, comprovanteId } = await params;
  const comprovante = await prisma.comprovanteDePagamentoCompra.findFirst({
    where: { id: String(comprovanteId ?? ""), pedidoId: String(id ?? "") },
    select: { pedidoId: true, arquivo: true, nomeOriginal: true },
  });
  if (!comprovante) return new Response("Não encontrado", { status: 404 });

  try {
    const absoluto = caminhoDoComprovante(comprovante.pedidoId, comprovante.arquivo);
    const info = await stat(absoluto);
    if (!info.isFile()) return new Response("Não encontrado", { status: 404 });
    return new Response(fluxoDeArquivo(absoluto), {
      headers: {
        "Content-Type": TIPO_POR_EXTENSAO[path.extname(absoluto)] ?? "application/octet-stream",
        "Content-Length": String(info.size),
        "Content-Disposition": cabecalhoDeArquivo(comprovante.nomeOriginal ?? comprovante.arquivo, "inline"),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erro) {
    if (erro.code === "ENOENT") return new Response("Não encontrado", { status: 404 });
    throw erro;
  }
}
