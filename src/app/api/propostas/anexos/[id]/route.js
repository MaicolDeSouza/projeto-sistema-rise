import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { lerAnexo } from "@/lib/propostas/arquivos";

/** Download da cotacao anexada a uma proposta (so quem ve as propostas). O nome real volta no cabecalho. */
export async function GET(_requisicao, { params }) {
  const sessao = await sessaoDeAcessos().catch(() => null);
  if (!sessao?.pode("tela.propostas", "ver")) return recusarRota();
  const { id } = await params;
  const anexo = await lerAnexo(id);
  if (!anexo) return new Response("Não encontrado", { status: 404 });
  const nome = anexo.nomeOriginal.replace(/["\\\r\n]/g, "_");
  return new Response(anexo.bytes, {
    headers: {
      "Content-Type": anexo.tipo,
      "Content-Length": String(anexo.bytes.length),
      "Content-Disposition": `inline; filename="${nome.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
