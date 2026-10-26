import { recusarRota, sessaoDeAcessos } from "@/lib/acessos/servidor";
import { lerProgressoML } from "@/lib/canaisDeVenda/ml/progresso";

export const dynamic = "force-dynamic";

// Id de anuncio (cuid): letras e numeros. Qualquer outra coisa nem chega ao mapa.
const ID_VALIDO = /^[a-z0-9]{10,40}$/i;

/**
 * O andamento do "Enviar ao ML" de um anuncio, para o popup de etapas do editor (26/10/2026, igual a rota da Loja Integrada). E
 * uma ROTA, e nao uma Server Action, de proposito: as Server Actions rodam uma de cada vez, e a consulta esperaria o envio acabar.
 * So le a memoria do processo (`progresso.js`): nao chama o ML nem o banco. Quem pode enviar ao ML pode ver o andamento.
 */
export async function GET(_requisicao, { params }) {
  if (!(await sessaoDeAcessos()).pode("acao.mercadoLivre.publicar", "executar")) return recusarRota();
  const { anuncioId } = await params;
  if (!ID_VALIDO.test(String(anuncioId ?? ""))) return new Response(null, { status: 400 });
  return Response.json({ progresso: lerProgressoML(anuncioId) }, { headers: { "Cache-Control": "no-store" } });
}
