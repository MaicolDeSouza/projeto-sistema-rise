import Link from "next/link";

import TabelaDeConsumo from "@/components/riseAi/TabelaDeConsumo";
import { consumoPorDia, periodoDosUltimosDias, totaisDoPeriodo } from "@/lib/riseAi/consumo";
import { hojeEmSaoPaulo } from "@/lib/riseAi/revisao";
import { sessaoAtual } from "../sessao";

export const metadata = { title: "Consumo | Rise AI" };
export const dynamic = "force-dynamic";

const PERIODOS = [7, 30, 90];

/**
 * O consumo do Rise AI, só para administradores: respostas, tokens, custo, tempo e problemas por dia e por modelo, nos
 * últimos 7, 30 ou 90 dias (`?dias=`; qualquer outro valor vira 30).
 */
export default async function ConsumoPage({ searchParams }) {
  const sessao = await sessaoAtual();
  if (!sessao.administrador) {
    return (
      <section className="rounded-lg border border-borda bg-superficie p-6 text-sm">
        <h1 className="font-semibold">Só administradores do Rise AI</h1>
        <p className="mt-1 text-suave">O consumo e o custo do assistente são de quem o administra. Peça ao dono do Rise para incluir seu nome na lista de administradores.</p>
      </section>
    );
  }

  const pedido = Number((await searchParams).dias);
  const dias = PERIODOS.includes(pedido) ? pedido : 30;
  const periodo = periodoDosUltimosDias(dias, hojeEmSaoPaulo());
  const linhas = await consumoPorDia(periodo);

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
      <TabelaDeConsumo linhas={linhas} totais={totaisDoPeriodo(linhas)} />
    </div>
  );
}
