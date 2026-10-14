import Link from "next/link";

import BarraDeOrcamento from "@/components/riseAi/BarraDeOrcamento";
import TabelaDeConsumo from "@/components/riseAi/TabelaDeConsumo";
import { garantirCotacaoDoDia } from "@/lib/cotacaoDoDia";
import { consumoPorDia, gastosOutrosPorDia, linhasComOutros, periodoDosUltimosDias, totaisDoPeriodo } from "@/lib/riseAi/consumo";
import { estadoDoOrcamento } from "@/lib/riseAi/orcamento";
import { hojeEmSaoPaulo } from "@/lib/riseAi/revisao";
import { exigirAcessoNaPagina } from "@/lib/acessos/servidor";

export const metadata = { title: "Consumo | Rise AI" };
export const dynamic = "force-dynamic";

const PERIODOS = [7, 30, 90];

/** Só o que a barra desenha (o estado do orçamento traz mais campos, como o que está reservado). */
const paraABarra = ({ gastoBrl, tetoBrl, percentual, nivel }) => ({ gastoBrl, tetoBrl, percentual, nivel });

/**
 * O consumo do Rise AI, só para quem tem o recurso em Acessos (os demais têm 404): no topo, o gasto do mês contra os dois
 * orçamentos; embaixo, respostas, tokens, custo, "Outros" (pesquisa na internet, transcrição, embeddings), tempo e problemas por
 * dia e por modelo, nos últimos 7, 30 ou 90 dias (`?dias=`; qualquer outro valor vira 30).
 */
export default async function ConsumoPage({ searchParams }) {
  await exigirAcessoNaPagina("riseAi.consumo", "ver");

  const pedido = Number((await searchParams).dias);
  const dias = PERIODOS.includes(pedido) ? pedido : 30;
  const periodo = periodoDosUltimosDias(dias, hojeEmSaoPaulo());
  // O dólar do dia (nunca lança): o custo das respostas e a pesquisa já foram calculados com a cotação da hora, e a tela de
  // Orçamentos usa a mesma; aqui só se garante que o PTAX esteja em memória se ninguém conversou desde a partida.
  await garantirCotacaoDoDia();
  const [clientes, interno, respostas, outros] = await Promise.all([
    estadoDoOrcamento("CLIENTES"),
    estadoDoOrcamento("INTERNO"),
    consumoPorDia(periodo),
    gastosOutrosPorDia(periodo),
  ]);
  const mes = new Date().toLocaleDateString("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Consumo do Rise AI</h1>
          <p className="mt-1 text-sm text-suave">Por dia e por modelo, nos últimos {dias} dias. O custo é o estimado na hora de cada resposta; modelo no seu PC custa zero.</p>
        </div>
        <nav className="flex gap-1" aria-label="Período">
          {PERIODOS.map((valor) => (
            <Link
              key={valor}
              href={`/rise-ai/consumo?dias=${valor}`}
              aria-current={valor === dias ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 text-sm ${valor === dias ? "bg-fundo font-medium" : "text-suave hover:bg-fundo hover:text-texto"}`}
            >
              {valor} dias
            </Link>
          ))}
        </nav>
      </div>
      <section className="flex flex-col gap-3 rounded-lg border border-borda bg-superficie p-4">
        <h2 className="text-sm font-semibold">Orçamento de {mes}</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <BarraDeOrcamento rotulo="Clientes (WhatsApp)" {...paraABarra(clientes)} />
          <BarraDeOrcamento rotulo="Interno" {...paraABarra(interno)} />
        </div>
      </section>
      <TabelaDeConsumo linhas={linhasComOutros(respostas, outros)} totais={totaisDoPeriodo(respostas, outros)} />
    </div>
  );
}
