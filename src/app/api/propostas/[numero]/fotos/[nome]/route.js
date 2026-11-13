import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { prisma } from "@/lib/db";
import { NOME_DA_FOTO_DO_ITEM, lerFotoDoItem } from "@/lib/propostas/arquivos";

/** A foto do item avulso de uma proposta, para a tela (so quem ve as propostas). PDF e link leem o arquivo direto. */
export async function GET(_requisicao, { params }) {
  const sessao = await sessaoDeAcessos().catch(() => null);
  if (!sessao?.pode("tela.propostas", "ver")) return recusarRota();
  const { numero, nome } = await params;
  if (!NOME_DA_FOTO_DO_ITEM.test(nome ?? "")) return new Response("Não encontrado", { status: 404 });
  const proposta = await prisma.propostaParaCliente.findUnique({ where: { numero: Number(numero) || 0 }, select: { id: true } });
  const bytes = proposta ? await lerFotoDoItem(proposta.id, nome) : null;
  if (!bytes) return new Response("Não encontrado", { status: 404 });
  return new Response(bytes, {
    headers: { "Content-Type": "image/jpeg", "Content-Length": String(bytes.length), "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" },
  });
}
