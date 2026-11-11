import { stat } from "node:fs/promises";
import path from "node:path";

import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { TIPO_POR_EXTENSAO, cabecalhoDeArquivo, fluxoDeArquivo } from "@/lib/arquivos";
import { caminhoDaNotaFiscal } from "@/lib/compras/arquivos";
import { prisma } from "@/lib/db";

/**
 * Uma nota fiscal de um pedido de compra (11/11/2026), com o nome real (so com login e acesso aos pedidos). O caminho sai
 * do banco e passa pela validacao de `caminhoDaNotaFiscal`; o navegador nunca escolhe o arquivo. O XML vai SEMPRE como
 * download em texto puro: aberto no navegador pelo dominio do Rise, um XML enviado de fora poderia rodar script.
 */
export async function GET(_requisicao, { params }) {
  const sessao = await sessaoDeAcessos().catch(() => null);
  if (!sessao?.pode("tela.compras.pedidos", "ver")) return recusarRota();
  const { id, notaId } = await params;
  const nota = await prisma.notaFiscalCompra.findFirst({
    where: { id: String(notaId ?? ""), pedidoId: String(id ?? "") },
    select: { pedidoId: true, arquivo: true, nomeOriginal: true },
  });
  if (!nota) return new Response("Não encontrado", { status: 404 });

  try {
    const absoluto = caminhoDaNotaFiscal(nota.pedidoId, nota.arquivo);
    const info = await stat(absoluto);
    if (!info.isFile()) return new Response("Não encontrado", { status: 404 });
    const xml = path.extname(absoluto) === ".xml";
    return new Response(fluxoDeArquivo(absoluto), {
      headers: {
        "Content-Type": xml ? "text/plain; charset=utf-8" : (TIPO_POR_EXTENSAO[path.extname(absoluto)] ?? "application/octet-stream"),
        "Content-Length": String(info.size),
        "Content-Disposition": cabecalhoDeArquivo(nota.nomeOriginal ?? nota.arquivo, xml ? "attachment" : "inline"),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (erro) {
    if (erro.code === "ENOENT") return new Response("Não encontrado", { status: 404 });
    throw erro;
  }
}
