import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { lerArquivoDoCliente } from "@/lib/clientes/arquivos";

/**
 * Download de um arquivo do cliente (a ficha cadastral; 13/11/2026). A ficha traz CNPJ, endereco e contatos: so quem ve o
 * cadastro de clientes E os dados pessoais do cliente. O nome real volta no cabecalho.
 */
export async function GET(_requisicao, { params }) {
  const sessao = await sessaoDeAcessos().catch(() => null);
  if (!sessao?.pode("tela.cadastros.clientes", "ver") || !sessao.pode("dado.pessoalDoCliente", "ver")) return recusarRota();
  const { id } = await params;
  const arquivo = await lerArquivoDoCliente(id);
  if (!arquivo) return new Response("Não encontrado", { status: 404 });
  const nome = arquivo.nomeOriginal.replace(/["\\\r\n]/g, "_");
  return new Response(arquivo.bytes, {
    headers: {
      "Content-Type": arquivo.tipo,
      "Content-Length": String(arquivo.bytes.length),
      "Content-Disposition": `inline; filename="${nome.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
