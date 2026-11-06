import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { cabecalhoDeArquivo } from "@/lib/arquivos";
import { lerInstrucoes } from "@/lib/ferramentas/licencas/banco";

/** O PDF de instrucoes do programa (o que o dono manda ao cliente). Basta ver a tela: e texto de apoio, nao a licenca. */
export async function GET(_requisicao, { params }) {
  const sessao = await sessaoDeAcessos().catch(() => null);
  if (!sessao?.pode("tela.ferramentas.licencas", "ver")) return recusarRota();
  const { id } = await params;
  const pdf = await lerInstrucoes(id);
  if (!pdf) return new Response("Este programa não tem PDF de instruções.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return new Response(pdf.bytes, {
    headers: {
      "Content-Type": pdf.tipo,
      "Content-Length": String(pdf.bytes.length),
      "Content-Disposition": cabecalhoDeArquivo(pdf.nome, "attachment"),
      "Cache-Control": "private, no-store",
    },
  });
}
