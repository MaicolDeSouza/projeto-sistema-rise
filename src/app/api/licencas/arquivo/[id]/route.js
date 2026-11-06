import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { cabecalhoDeArquivo } from "@/lib/arquivos";
import { montarZipDoArquivo } from "@/lib/ferramentas/licencas/arquivos";
import { lerArquivoParaBaixar } from "@/lib/ferramentas/licencas/banco";

const textoPuro = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" };

/**
 * O arquivo da licenca (Mach3) em zip, como o dono manda ao cliente: `<licenca>.zip` com a pasta e o arquivo dentro.
 * O arquivo e o produto em si, por isso alem de ver a tela e preciso a acao de baixar. Server Action nao entrega
 * arquivo; por isso a rota. `?versao=N` baixa uma versao antiga.
 */
export async function GET(requisicao, { params }) {
  const sessao = await sessaoDeAcessos().catch(() => null);
  if (!sessao?.pode("tela.ferramentas.licencas", "ver") || !sessao.pode("acao.ferramentas.licencas.arquivo", "executar")) return recusarRota();
  const { id } = await params;
  const pedida = new URL(requisicao.url).searchParams.get("versao");
  const versao = pedida ? Number(pedida) : null;
  if (pedida && !Number.isInteger(versao)) return new Response("Versão inválida.", { status: 400, headers: textoPuro });

  const lido = await lerArquivoParaBaixar(id, versao);
  // Soma que nao confere vem com 500 e o texto: o arquivo nunca sai, e o dono ve por que.
  if (!lido.ok) return new Response(lido.erro, { status: lido.status ?? 404, headers: textoPuro });

  const zip = montarZipDoArquivo(lido);
  return new Response(zip.bytes, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(zip.bytes.length),
      "Content-Disposition": cabecalhoDeArquivo(zip.nome, "attachment"),
      "Cache-Control": "private, no-store",
    },
  });
}
