import RevisaoDoDia from "@/components/riseAi/RevisaoDoDia";
import { conhecimentoParaTela, listarConhecimento } from "@/lib/riseAi/conhecimento";
import { conversasDoDia, hojeEmSaoPaulo, limitesDoDia, resumoDoDia } from "@/lib/riseAi/revisao";
import { listarSugestoes } from "@/lib/riseAi/sugestoes";
import { consultasDoDia } from "@/lib/mcp/consultas";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";

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
 * A Revisão do dia: só quem tem o recurso em Acessos (os demais têm 404). A conferência é do servidor — a página não
 * lê nada de conversa alheia antes de saber quem está pedindo.
 */
export default async function RevisaoPage({ searchParams }) {
  await exigirAcessoNaPagina("riseAi.revisao", "ver");

  const hoje = hojeEmSaoPaulo();
  const dia = diaDaRevisao((await searchParams).dia, hoje);
  const [conversas, resumo, sugestoes, notas, consultas] = await Promise.all([
    conversasDoDia(dia, { administrador: true }),
    resumoDoDia(dia),
    listarSugestoes({ status: "PENDENTE" }),
    listarConhecimento({ limite: 300 }),
    // O que cada pessoa consultou pelo Claude/ChatGPT, anotado ou nao (a aba Consultas).
    consultasDoDia(dia, { administrador: true }),
  ]);

  return <RevisaoDoDia key={dia} dia={dia} hoje={hoje} conversas={conversas} resumo={resumo} sugestoes={sugestoes} notas={notas.map(conhecimentoParaTela)} consultas={consultas} />;
}
