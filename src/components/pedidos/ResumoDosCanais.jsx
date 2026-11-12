import Image from "next/image";

import { canalPorId } from "@/lib/canais";

import { moeda, moedaComSinal } from "./formato";

const vendasTexto = (n) => (n === 1 ? "1 venda" : `${n} vendas`);
const porcento = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 0 });

/** Uma linha da caixinha: rotulo pequeno a esquerda, valor a direita (as tres linhas alinham pelo valor). */
function Linha({ rotulo, children, title }) {
  return (
    <div className="flex items-baseline justify-between gap-3" title={title}>
      <span className="text-xs text-suave">{rotulo}</span>
      <span className="text-right text-sm font-semibold tabular-nums">{children}</span>
    </div>
  );
}

function CaixaDoCanal({ resumo }) {
  const canal = canalPorId(resumo.canal);
  const temLucro = "lucro" in resumo;
  const semVenda = resumo.pedidos === 0;
  return (
    <div className="rounded-lg border border-borda bg-superficie px-3.5 py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        {canal?.logo && <Image src={canal.logo} alt="" width={18} height={18} className="rounded-sm" />}
        <span className="text-sm font-medium">{canal?.nome ?? resumo.canal}</span>
      </div>
      {semVenda ? (
        <p className="py-3 text-center text-xs text-suave">Sem vendas no período</p>
      ) : (
        <div className="space-y-0.5">
          <Linha rotulo="Vendas">
            {moeda.format(resumo.faturamento)} <span className="font-normal text-suave">({vendasTexto(resumo.pedidos)})</span>
          </Linha>
          {temLucro && (
            <Linha
              rotulo="Lucro"
              title={
                resumo.semLucro > 0
                  ? `${resumo.semLucro} venda(s) sem lucro calculado (item sem custo) ficaram de fora do lucro e do markup`
                  : "Markup = lucro ÷ custo total (produto, comissão, tarifa, frete e imposto). Devolvidos entram com o prejuízo do frete de retorno."
              }
            >
              <span className={resumo.lucro < 0 ? "text-red-600" : "text-emerald-700"}>{moedaComSinal(resumo.lucro)}</span>
              {resumo.markup !== null && <span className="font-normal text-suave"> ({porcento.format(resumo.markup)})</span>}
              {resumo.semLucro > 0 && <span className="ml-1 text-amber-600">*</span>}
            </Linha>
          )}
          <Linha rotulo="Ticket médio">{moeda.format(resumo.ticket)}</Linha>
        </div>
      )}
    </div>
  );
}

/**
 * As caixinhas de Vendas (pedido do dono em 12/11/2026): uma por canal (vendas, lucro com markup e ticket medio) e a do
 * ticket medio geral. Seguem os filtros da lista menos o de canal (`resumoDosCanais`). Cancelados e devolvidos nao
 * entram nas vendas nem no ticket.
 */
export default function ResumoDosCanais({ resumo }) {
  if (!resumo) return null;
  const { geral } = resumo;
  return (
    <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      {resumo.canais.map((c) => (
        <CaixaDoCanal key={c.canal} resumo={c} />
      ))}
      <div
        className="flex flex-col justify-center rounded-lg border border-acento/40 bg-acento/5 px-3.5 py-2.5"
        title={`${vendasTexto(geral.pedidos)}, ${moeda.format(geral.faturamento)} no período, nos três canais. Cancelados e devolvidos não entram.`}
      >
        <p className="text-sm font-medium">Ticket médio geral</p>
        <p className="mt-1 text-2xl leading-tight font-semibold tabular-nums">{geral.ticket === null ? "—" : moeda.format(geral.ticket)}</p>
        {geral.pedidos > 0 && <p className="text-xs text-suave">{vendasTexto(geral.pedidos)}</p>}
      </div>
    </div>
  );
}
