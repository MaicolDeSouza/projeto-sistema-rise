import RevisaoDoDia from "@/components/riseAi/RevisaoDoDia";
import { conhecimentoParaTela, listarConhecimento } from "@/lib/riseAi/conhecimento";
import { conversasDoDia, hojeEmSaoPaulo, limitesDoDia, resumoDoDia } from "@/lib/riseAi/revisao";
import { listarSugestoes } from "@/lib/riseAi/sugestoes";
import { sessaoAtual } from "../sessao";

export const metadata = { title: "Revisão do dia | Rise AI" };
export const dynamic = "force-dynamic";

/** O dia pedido na URL (`?dia=AAAA-MM-DD`), ou hoje se faltar ou não for um dia de verdade. */
function diaDaRevisao(pedido, hoje) {
  if (typeof pedido !== "string") return hoje;
  try {
    limitesDoDia(pedido);
    return pedido;
  } catch {
    return hoje;
  }
}

/**
 * A Revisão do dia: só administradores do Rise AI (os demais veem o aviso). A conferência é do servidor — a página não
 * lê nada de conversa alheia antes de saber quem está pedindo.
 */
export default async function RevisaoPage({ searchParams }) {
  const sessao = await sessaoAtual();
  if (!sessao.administrador) {
    return (
      <section className="rounded-lg border border-borda bg-superficie p-6 text-sm">
        <h1 className="font-semibold">Só administradores do Rise AI</h1>
        <p className="mt-1 text-suave">A revisão das conversas é de quem administra o assistente. Peça ao dono do Rise para incluir seu nome na lista de administradores.</p>
      </section>
    );
  }

  const hoje = hojeEmSaoPaulo();
  const dia = diaDaRevisao((await searchParams).dia, hoje);
  const [conversas, resumo, sugestoes, notas] = await Promise.all([
    conversasDoDia(dia, { administrador: true }),
    resumoDoDia(dia),
    listarSugestoes({ status: "PENDENTE" }),
    listarConhecimento({ limite: 300 }),
  ]);

  return <RevisaoDoDia key={dia} dia={dia} hoje={hoje} conversas={conversas} resumo={resumo} sugestoes={sugestoes} notas={notas.map(conhecimentoParaTela)} />;
}
