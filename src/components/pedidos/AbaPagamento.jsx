import { abreviarPagamento, dataCompleta, moeda } from "./formato";

const SITUACAO = {
  approved: "Aprovado",
  accredited: "Aprovado",
  pending: "Pendente",
  in_process: "Em análise",
  authorized: "Autorizado",
  rejected: "Recusado",
  cancelled: "Cancelado",
  refunded: "Devolvido",
  charged_back: "Estornado",
};

/** Uma linha da aba: o rotulo a esquerda, o valor a direita, uma linha divisoria entre elas (o desenho de Dados do cliente). */
function Linha({ rotulo, children }) {
  if (children === null || children === undefined || children === "") return null;
  return (
    <div className="grid gap-1 py-3.5 sm:grid-cols-[10rem_1fr] sm:gap-6">
      <dt className="text-sm text-suave">{rotulo}</dt>
      <dd className="min-w-0 text-[15px] font-medium">{children}</dd>
    </div>
  );
}

/**
 * Aba Pagamento (pedido do dono em 04/11/2026, logo depois de Itens): os dados de cada pagamento que o canal informou:
 * a forma (e o meio, como a bandeira), as parcelas, o valor, a situacao e quando foi aprovado.
 */
export default function AbaPagamento({ pedido }) {
  const pagamentos = Array.isArray(pedido.pagamento) ? pedido.pagamento : [];
  if (pagamentos.length === 0) return <p className="p-5 text-sm text-suave">O canal não informou o pagamento.</p>;
  return (
    <div className="max-w-3xl space-y-4 px-5 py-2">
      {pagamentos.map((pg, indice) => {
        const valor = pg.valorPago ?? pg.valor ?? 0;
        const parcelas = Number(pg.parcelas) || 1;
        const forma = abreviarPagamento(pg) ?? "Pagamento";
        const situacao = pg.status ? (SITUACAO[String(pg.status).toLowerCase()] ?? pg.status) : null;
        return (
          <section key={indice} aria-label={`Pagamento ${indice + 1}`}>
            {pagamentos.length > 1 && <h3 className="pt-3 text-sm font-semibold">Pagamento {indice + 1}</h3>}
            <dl className="divide-y divide-borda">
              <Linha rotulo="Forma">
                {forma}
                {pg.forma && pg.forma !== forma && <span className="ml-2 text-sm font-normal text-suave">{pg.forma}</span>}
              </Linha>
              <Linha rotulo="Parcelas">{parcelas > 1 ? `${parcelas}× de ${moeda.format(valor / parcelas)}` : "À vista"}</Linha>
              <Linha rotulo="Valor">
                <span className="tabular-nums">{moeda.format(valor)}</span>
              </Linha>
              <Linha rotulo="Situação">{situacao}</Linha>
              <Linha rotulo="Aprovado em">{pg.aprovadoEm ? <span className="tabular-nums">{dataCompleta(pg.aprovadoEm)}</span> : null}</Linha>
            </dl>
          </section>
        );
      })}
    </div>
  );
}
