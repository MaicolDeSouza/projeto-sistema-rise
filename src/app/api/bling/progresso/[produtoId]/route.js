import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { produtoIdValido } from "@/lib/blingSync/estado";
import { lerProgresso } from "@/lib/blingSync/progresso";

export const dynamic = "force-dynamic";

/**
 * O andamento do Sincronizar/Cadastrar de um produto, para o popup de etapas da janela do Bling. E uma ROTA, e nao uma
 * Server Action, de proposito: as Server Actions rodam uma de cada vez, e a consulta esperaria o envio acabar.
 * So le a memoria do processo (`progresso.js`): nao chama o Bling nem o banco. Quem pode enviar ao Bling pode ver o andamento.
 */
export async function GET(_requisicao, { params }) {
  if (!(await sessaoDeAcessos()).pode("acao.produtos.sincronizarBling", "executar")) return recusarRota();
  const { produtoId } = await params;
  if (!produtoIdValido(produtoId)) return new Response(null, { status: 400 });
  return Response.json({ progresso: lerProgresso(produtoId) }, { headers: { "Cache-Control": "no-store" } });
}
