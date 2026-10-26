import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { produtoIdValido } from "@/lib/canaisDeVenda/li/estado";
import { lerProgresso } from "@/lib/canaisDeVenda/li/progresso";

export const dynamic = "force-dynamic";

/**
 * O andamento do Sincronizar/Cadastrar de um produto na Loja Integrada, para o popup de etapas do editor. E uma ROTA, e nao uma
 * Server Action, de proposito: as Server Actions rodam uma de cada vez, e a consulta esperaria o envio acabar. So le a memoria do
 * processo (`progresso.js`): nao chama a loja nem o banco. Quem pode enviar a Loja Integrada pode ver o andamento.
 */
export async function GET(_requisicao, { params }) {
  if (!(await sessaoDeAcessos()).pode("acao.lojaIntegrada.sincronizar", "executar")) return recusarRota();
  const { produtoId } = await params;
  if (!produtoIdValido(produtoId)) return new Response(null, { status: 400 });
  return Response.json({ progresso: lerProgresso(produtoId) }, { headers: { "Cache-Control": "no-store" } });
}
