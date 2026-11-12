import Image from "next/image";

import { canalPorId } from "@/lib/canais";

import { moeda } from "./formato";

const pedidosTexto = (n) => (n === 1 ? "1 pedido" : `${n} pedidos`);

/**
 * Ticket medio da lista filtrada (pedido do dono em 12/11/2026): o geral em destaque e, embaixo, um por canal com o logo.
 * O numero de pedidos e o faturamento de cada um ficam no `title` (regra 2 do padrao visual: nada de texto fixo).
 */
export default function TicketMedio({ resumo }) {
  if (!resumo || resumo.ticket === null) return null;
  const dicaGeral = `${pedidosTexto(resumo.pedidos)}, ${moeda.format(resumo.faturamento)} no período. Cancelados e devolvidos não entram.`;
  return (
    <div className="text-right">
      <p className="text-xs text-suave">Ticket médio</p>
      <p className="text-lg leading-tight font-semibold tabular-nums" title={dicaGeral}>
        {moeda.format(resumo.ticket)}
      </p>
      {resumo.canais.length > 1 && (
        <div className="mt-0.5 flex justify-end gap-2.5">
          {resumo.canais.map((c) => {
            const canal = canalPorId(c.canal);
            const dica = `${canal?.nome ?? c.canal}: ${pedidosTexto(c.pedidos)}, ${moeda.format(c.faturamento)}`;
            return (
              <span key={c.canal} className="inline-flex items-center gap-1 text-xs tabular-nums text-suave" title={dica} aria-label={`${dica}, ticket médio ${moeda.format(c.ticket)}`}>
                {canal?.logo && <Image src={canal.logo} alt="" width={14} height={14} className="rounded-sm" />}
                {moeda.format(c.ticket)}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
